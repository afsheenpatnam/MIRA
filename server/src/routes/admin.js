import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { Admin } from '../models/Admin.js';
import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { AuditBlock } from '../models/AuditBlock.js';
import { sourcesFor } from '../models/Incident.js';
import { requireAdmin, signAdminToken } from '../middleware/admin.js';
import { deleteBank } from '../services/hindsight.js';
import { companyStats, askAdmin } from '../services/platform.js';
import { audit, asAdmin, companyOf, hideEmail, ipOf, publicBlock } from '../services/audit.js';

// Platform admin: usage counts, account details and the audit ledger for every company.
// Admins never receive the content of a company's incidents or conversations.
const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many login attempts. Wait 15 minutes and try again.' } });
const askLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many questions in a minute. Wait a moment and try again.' } });

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const admin = email && (await Admin.findOne({ email: String(email).toLowerCase().trim() }));
  if (!admin || !(await bcrypt.compare(String(password || ''), admin.passwordHash))) {
    audit({ category: 'access', action: 'admin.login', outcome: 'failed', actor: { kind: 'anonymous', email: hideEmail(email) }, ip: ipOf(req) });
    return res.status(401).json({ error: 'That email and password don\'t match an admin account.' });
  }
  audit({ category: 'access', action: 'admin.login', actor: asAdmin(admin), ip: ipOf(req) });
  res.json({ token: signAdminToken(admin), admin: { name: admin.name, email: admin.email } });
});

router.use(requireAdmin);

router.get('/me', (req, res) => res.json({ admin: { name: req.admin.name, email: req.admin.email } }));

router.get('/companies', async (_req, res) => {
  const workspaces = await Workspace.find().sort({ createdAt: -1 });
  res.json({ companies: await Promise.all(workspaces.map(companyStats)) });
});

router.get('/companies/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'That company does not exist.' });
  const ws = await Workspace.findById(req.params.id);
  if (!ws) return res.status(404).json({ error: 'That company does not exist.' });

  const [stats, users, imports] = await Promise.all([
    companyStats(ws),
    User.find({ workspace: ws._id }).sort({ createdAt: 1 }).select('name email role createdAt').lean(),
    sourcesFor(ws).find({ kind: { $ne: 'alert' } }).sort({ createdAt: -1 }).limit(20).select('kind name incidents masked by createdAt').lean(),
  ]);
  audit({ category: 'admin', action: 'admin.company.viewed', actor: asAdmin(req.admin), company: companyOf(ws), ip: ipOf(req) });
  res.json({
    company: stats,
    storage: { database: ws.dbName, bank: ws.bankId },
    users: users.map((u) => ({ name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })),
    imports: imports.map((s) => ({ kind: s.kind, name: s.name, incidents: s.incidents, masked: s.masked, by: s.by, at: s.createdAt })),
  });
});

// Permanently removes a company: its users, database and Hindsight memory bank.
router.delete('/companies/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'That company does not exist.' });
  const ws = await Workspace.findById(req.params.id);
  if (!ws) return res.status(404).json({ error: 'That company does not exist.' });
  if (String(req.body?.confirm || '').trim() !== ws.name) {
    return res.status(400).json({ error: `Type the company name exactly (${ws.name}) to confirm.` });
  }
  const users = await User.countDocuments({ workspace: ws._id });
  await deleteBank(ws.bankId).catch((e) => { if (e?.statusCode !== 404) throw e; });
  await mongoose.connection.useDb(ws.dbName).dropDatabase();
  await User.deleteMany({ workspace: ws._id });
  await Workspace.deleteOne({ _id: ws._id });
  await audit({ category: 'admin', action: 'admin.company.deleted', actor: asAdmin(req.admin), company: companyOf(ws),
    detail: { sector: ws.sector, users, database: ws.dbName, bank: ws.bankId }, ip: ipOf(req) });
  res.json({ deleted: ws.name });
});

/* ---------- audit logs ---------- */

const CATEGORIES = ['access', 'data', 'admin', 'system'];

router.get('/audit', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const filter = {};
  if (CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  if (req.query.problems === '1') filter.outcome = { $ne: 'ok' };
  const before = Number(req.query.before);
  if (Number.isInteger(before) && before > 0) filter.index = { $lt: before };

  const [blocks, matching, head] = await Promise.all([
    AuditBlock.find(filter).sort({ index: -1 }).limit(limit + 1).lean(),
    AuditBlock.countDocuments(filter),
    AuditBlock.findOne().sort({ index: -1 }).select('index at').lean(),
  ]);
  res.json({
    blocks: blocks.slice(0, limit).map(publicBlock),
    more: blocks.length > limit,
    matching,
    total: head ? head.index + 1 : 0,
  });
});

/* ---------- MIRA for admins ---------- */

router.post('/ask', askLimiter, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Type a question.' });
  if (text.length > 1000) return res.status(400).json({ error: 'Keep the question under 1,000 characters.' });
  const recent = Array.isArray(req.body?.recent) ? req.body.recent : [];
  // Not recorded in the ledger: MIRA only reads counts, so a question is not a security event.
  res.json(await askAdmin(req.admin, text, recent, String(req.body?.tz || '').slice(0, 64)));
});

export default router;
