import crypto from 'node:crypto';
import { AuditBlock } from '../models/AuditBlock.js';
import { config } from '../config.js';

/**
 * A tamper-evident audit ledger, built like a blockchain:
 * - every action becomes a block with a running number (index),
 * - each block stores the SHA-256 fingerprint of the block before it (prevHash),
 *   so the blocks form one chain back to the first block,
 * - each block's own fingerprint (hash) is signed with MIRA's audit key (seal, HMAC-SHA256),
 *   so a block can't be rewritten and re-fingerprinted without that key.
 * Changing, deleting or inserting any past block breaks the chain, and verifyLedger() finds where.
 * Blocks never hold incident text or conversation content, only who did what, when, and counts.
 */

const GENESIS_PREV = '0'.repeat(64);
const key = config.auditSecret
  ? Buffer.from(config.auditSecret)
  : crypto.createHmac('sha256', config.jwtSecret).update('mira-audit-ledger').digest();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sealOf = (hash) => crypto.createHmac('sha256', key).update(hash).digest('hex');

/** JSON with sorted keys, so the same block always gives the same fingerprint. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Exactly the fields that are fingerprinted, with missing values filled in the same way every time. */
function content(b) {
  return {
    index: b.index,
    at: new Date(b.at).toISOString(),
    category: b.category,
    action: b.action,
    outcome: b.outcome || 'ok',
    actor: { kind: b.actor?.kind || '', name: b.actor?.name || '', email: b.actor?.email || '' },
    company: { id: b.company?.id || '', name: b.company?.name || '' },
    target: b.target || '',
    detail: b.detail || {},
    ip: b.ip || '',
    prevHash: b.prevHash,
  };
}
const fingerprint = (b) => sha256(canonical(content(b)));

/* ---------- who and where ---------- */

export const asUser = (user) => ({ kind: 'user', name: user?.name || '', email: user?.email || '' });
export const asAdmin = (admin) => ({ kind: 'admin', name: admin?.name || '', email: admin?.email || '' });
export const asSystem = (name) => ({ kind: 'system', name, email: '' });
export const companyOf = (ws) => (ws ? { id: String(ws._id), name: ws.name } : undefined);
/** Failed logins keep only a hint of the email that was tried. */
export function hideEmail(email) {
  const [name, domain] = String(email || '').toLowerCase().trim().split('@');
  if (!domain) return name ? `${name.slice(0, 2)}•••` : '';
  return `${name.slice(0, 2)}•••@${domain}`;
}
export const ipOf = (req) => String(req?.ip || '').replace(/^::ffff:/, '');

/* ---------- writing ---------- */

async function head() {
  const last = await AuditBlock.findOne().sort({ index: -1 }).lean();
  if (last) return last;
  // The first block of a new ledger.
  const first = { index: 0, at: new Date(), category: 'system', action: 'ledger.created', outcome: 'ok',
    actor: asSystem('MIRA'), company: { id: '', name: '' }, target: '', detail: {}, ip: '', prevHash: GENESIS_PREV };
  first.hash = fingerprint(first);
  first.seal = sealOf(first.hash);
  try {
    await AuditBlock.create(first);
    return first;
  } catch (err) {
    if (err?.code === 11000) return AuditBlock.findOne().sort({ index: -1 }).lean();
    throw err;
  }
}

/** Details are small facts (counts, labels, yes/no). Anything else is turned into text so it stores and fingerprints the same way. */
function cleanDetail(detail = {}) {
  return Object.fromEntries(Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, ['number', 'string', 'boolean'].includes(typeof v) ? v : String(v)]));
}

async function append(entry, attempt = 0) {
  const prev = await head();
  const block = {
    index: prev.index + 1,
    at: new Date(),
    category: entry.category,
    action: entry.action,
    outcome: entry.outcome || 'ok',
    actor: { kind: entry.actor?.kind || '', name: entry.actor?.name || '', email: entry.actor?.email || '' },
    company: { id: entry.company?.id || '', name: entry.company?.name || '' },
    target: entry.target || '',
    detail: cleanDetail(entry.detail),
    ip: entry.ip || '',
    prevHash: prev.hash,
  };
  block.hash = fingerprint(block);
  block.seal = sealOf(block.hash);
  try {
    await AuditBlock.create(block);
    return block;
  } catch (err) {
    // Another server wrote the same block number first: build on its block instead.
    if (err?.code === 11000 && attempt < 4) return append(entry, attempt + 1);
    throw err;
  }
}

// Blocks are written one at a time so two requests can never both claim the same parent block.
let queue = Promise.resolve();

/**
 * Adds a block. Never throws: a failed audit write is logged and the request carries on.
 * entry: { category, action, outcome?, actor, company?, target?, detail?, ip? }
 */
export function audit(entry) {
  const job = queue.then(() => append(entry));
  queue = job.catch(() => {});
  return job.catch((err) => {
    console.error('Audit ledger write failed:', err?.message || err);
    return null;
  });
}

/* ---------- reading and checking ---------- */

/** What the admin page shows. The chain fields stay on the server; they are only for verification. */
export const publicBlock = (b) => ({
  index: b.index,
  at: b.at,
  category: b.category,
  action: b.action,
  outcome: b.outcome,
  actor: b.actor,
  company: b.company?.name ? b.company : null,
  target: b.target || '',
  detail: b.detail || {},
});

const same = (a, b) => {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/**
 * Walks the whole chain from the first block and checks every link.
 * Used by `npm run audit-verify` and by admin MIRA, which mentions it if the log was tampered with.
 */
export async function verifyLedger() {
  const started = Date.now();
  const total = await AuditBlock.countDocuments();
  let expected = 0;
  let prev = null;

  for await (const b of AuditBlock.find().sort({ index: 1 }).lean().cursor()) {
    let reason = null;
    let at = b.index;
    if (b.index !== expected) {
      at = expected;
      reason = b.index > expected
        ? `Block #${expected} is missing. It was deleted from the ledger.`
        : `Block #${b.index} appears twice.`;
    } else if (b.prevHash !== (prev ? prev.hash : GENESIS_PREV)) {
      reason = `Block #${b.index} no longer points to block #${b.index - 1}. A block was inserted or replaced.`;
    } else if (fingerprint(b) !== b.hash) {
      reason = `Block #${b.index} was changed after it was written. Its contents no longer match its fingerprint.`;
    } else if (!same(sealOf(b.hash), b.seal)) {
      reason = `Block #${b.index} was re-fingerprinted without MIRA's audit key. Its seal is not valid.`;
    }
    if (reason) {
      return { ok: false, total, checked: expected, brokenAt: at, reason, head: prev && headOf(prev), ms: Date.now() - started };
    }
    prev = b;
    expected += 1;
  }
  return { ok: true, total, checked: expected, head: prev && headOf(prev), ms: Date.now() - started };
}
const headOf = (b) => ({ index: b.index, hash: b.hash, at: b.at });
