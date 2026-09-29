import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { AuditBlock } from '../models/AuditBlock.js';
import { incidentsFor, sourcesFor } from '../models/Incident.js';
import { sectorLabel } from '../sectors.js';
import { config } from '../config.js';
import { chatJson } from './groq.js';
import { ensureBankWith, recallSimilar, retainOne } from './hindsight.js';
import { verifyLedger } from './audit.js';

// Everything the platform admin (and admin MIRA) can know: usage counts, account details and the audit logs.
// Nothing here reads the text of a company's incidents or conversations.

const DAY = 86_400_000;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const since14 = () => {
  const d = new Date(Date.now() - 13 * DAY);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/** Counts for one company. No incident text leaves this function. */
export async function companyStats(ws) {
  const Incident = incidentsFor(ws);
  const [imported, questions, conversations, worked, failed, lastQ, users, owner, files] = await Promise.all([
    Incident.countDocuments({ source: 'import' }),
    Incident.countDocuments({ source: 'live' }),
    Incident.countDocuments({ source: 'live', followUpOf: null }),
    Incident.countDocuments({ source: 'live', outcome: 'worked' }),
    Incident.countDocuments({ source: 'live', outcome: 'failed' }),
    Incident.findOne({ source: 'live' }).sort({ createdAt: -1 }).select('createdAt').lean(),
    User.countDocuments({ workspace: ws._id }),
    User.findOne({ workspace: ws._id }).sort({ createdAt: 1 }).select('name email').lean(),
    sourcesFor(ws).countDocuments({ kind: { $ne: 'alert' } }),
  ]);
  return {
    id: ws._id,
    name: ws.name,
    sector: ws.sector,
    sectorLabel: sectorLabel(ws.sector),
    createdAt: ws.createdAt,
    owner: owner ? { name: owner.name, email: owner.email } : null,
    users,
    imported,
    files,
    questions,
    conversations,
    worked,
    failed,
    lastActive: lastQ?.createdAt || null,
  };
}

/** Questions per day for one company over the last 14 days. */
export async function questionsPerDay(ws, since = since14()) {
  const rows = await incidentsFor(ws).aggregate([
    { $match: { source: 'live', createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

export async function overview() {
  const workspaces = await Workspace.find().sort({ createdAt: -1 });
  const since = since14();
  const [stats, perCompany] = await Promise.all([
    Promise.all(workspaces.map(companyStats)),
    Promise.all(workspaces.map((ws) => questionsPerDay(ws, since))),
  ]);
  const perDay = {};
  perCompany.forEach((m) => Object.entries(m).forEach(([k, n]) => { perDay[k] = (perDay[k] || 0) + n; }));
  const days = [...Array(14)].map((_, i) => {
    const key = dayKey(since.getTime() + i * DAY);
    return { day: key, questions: perDay[key] || 0, signups: workspaces.filter((w) => dayKey(w.createdAt) === key).length };
  });
  const sum = (k) => stats.reduce((s, c) => s + c[k], 0);
  return {
    totals: {
      companies: stats.length,
      users: sum('users'),
      imported: sum('imported'),
      questions: sum('questions'),
      conversations: sum('conversations'),
      worked: sum('worked'),
      failed: sum('failed'),
      activeWeek: stats.filter((c) => c.lastActive && Date.now() - new Date(c.lastActive) < 7 * DAY).length,
    },
    bySector: ['fintech', 'ecommerce', 'edtech'].map((id) => ({ id, label: sectorLabel(id), companies: stats.filter((c) => c.sector === id).length })),
    days,
    companies: stats,
  };
}

/** Security picture from the audit logs for the last `days` days. */
export async function securitySummary(days = 7) {
  const from = new Date(Date.now() - days * DAY);
  const [rows, recent] = await Promise.all([
    AuditBlock.aggregate([
      { $match: { at: { $gte: from } } },
      { $group: { _id: { action: '$action', outcome: '$outcome' }, n: { $sum: 1 } } },
    ]),
    AuditBlock.find({ index: { $gt: 0 } }).sort({ index: -1 }).limit(15).lean(),
  ]);
  const count = (action, outcome) => rows.filter((r) => r._id.action === action && (!outcome || r._id.outcome === outcome)).reduce((s, r) => s + r.n, 0);
  return {
    days,
    failedLogins: count('user.login', 'failed'),
    failedAdminLogins: count('admin.login', 'failed'),
    adminLogins: count('admin.login', 'ok'),
    rejectedAlerts: count('alert.rejected'),
    deletedCompanies: count('admin.company.deleted'),
    exports: count('admin.audit.exported'),
    recent,
  };
}

/** Midnight today in the admin's time zone, as a Date. */
function startOfToday(tz) {
  const now = new Date();
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(now).map((p) => [p.type, Number(p.value)]));
  } catch {
    return startOfToday('UTC');
  }
  const offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offset);
}

/** What happened since midnight: counts per company plus sign-in problems from the ledger. */
async function todayCounts(tz) {
  const start = startOfToday(tz);
  const workspaces = await Workspace.find().select('name createdAt dbName').lean();
  const perCompany = await Promise.all(workspaces.map(async (ws) => {
    const Incident = incidentsFor(ws);
    const [questions, imported, worked, failed] = await Promise.all([
      Incident.countDocuments({ source: 'live', createdAt: { $gte: start } }),
      Incident.countDocuments({ source: 'import', createdAt: { $gte: start } }),
      Incident.countDocuments({ source: 'live', outcome: 'worked', updatedAt: { $gte: start } }),
      Incident.countDocuments({ source: 'live', outcome: 'failed', updatedAt: { $gte: start } }),
    ]);
    return { name: ws.name, joinedToday: ws.createdAt >= start, questions, imported, worked, failed };
  }));
  const ledger = await AuditBlock.aggregate([
    { $match: { at: { $gte: start } } },
    { $group: { _id: { action: '$action', outcome: '$outcome' }, n: { $sum: 1 } } },
  ]);
  const count = (action, outcome) => ledger.filter((r) => r._id.action === action && (!outcome || r._id.outcome === outcome)).reduce((s, r) => s + r.n, 0);
  return {
    perCompany,
    signups: perCompany.filter((c) => c.joinedToday).map((c) => c.name),
    questions: perCompany.reduce((s, c) => s + c.questions, 0),
    imported: perCompany.reduce((s, c) => s + c.imported, 0),
    worked: perCompany.reduce((s, c) => s + c.worked, 0),
    failed: perCompany.reduce((s, c) => s + c.failed, 0),
    logins: count('user.login', 'ok'),
    failedLogins: count('user.login', 'failed'),
    failedAdminLogins: count('admin.login', 'failed'),
    rejectedAlerts: count('alert.rejected'),
    deleted: count('admin.company.deleted'),
  };
}

/* ---------- MIRA for the platform admin ---------- */

// The platform's own memory bank. Company slugs never contain "-", so this id can't clash with a company's bank.
const PLATFORM_BANK = `${config.bankPrefix}platform-admin`;
let bankReady = null;
function platformBank() {
  bankReady ||= ensureBankWith(PLATFORM_BANK, {
    name: 'MIRA platform briefings',
    retainMission: 'Keep daily platform usage snapshots (companies, users, questions, imports, fix outcomes, security events) and what the admin asked about, with dates, so later briefings can say what changed.',
    reflectMission: 'You help the team that runs MIRA understand how the platform is used over time: growth, active and inactive companies, fix success, and security events. Use only counts and dates.',
  }).catch((err) => { bankReady = null; throw err; });
  return bankReady;
}
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** Dates as "2026-09-29 14:02" in the admin's own time zone, so MIRA says the time they see on their clock. */
function clock(tz) {
  let zone = 'UTC';
  try { if (tz) { new Intl.DateTimeFormat('en', { timeZone: tz }); zone = tz; } } catch { /* unknown zone: stay on UTC */ }
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return { zone, when: (d) => (d ? f.format(new Date(d)).replace(',', '') : 'never') };
}
const ACTION_WORDS = {
  'ledger.created': 'audit log started',
  'company.created': 'company signed up',
  'user.login': 'company user login',
  'user.added': 'teammate added',
  'admin.login': 'admin login',
  'admin.created': 'admin account created or reset',
  'data.imported': 'history imported',
  'mira.answered': 'MIRA answered a question',
  'feedback.saved': 'fix feedback saved',
  'ingest.key.created': 'webhook key created',
  'alert.received': 'monitoring alert received',
  'alert.rejected': 'alert rejected (bad key)',
  'admin.company.viewed': 'admin opened a company',
  'admin.company.deleted': 'company deleted',
  'admin.mira.asked': 'admin asked MIRA',
  'admin.audit.exported': 'audit log exported',
};

/** Who did it, stated plainly so a failed attempt by a stranger is never pinned on a known person. */
function actorWords(a = {}) {
  if (a.kind === 'anonymous') return `by an unknown person who typed the email ${a.email || '(none)'}`;
  if (a.kind === 'admin') return `by admin ${a.name}`;
  if (a.kind === 'user') return `by company user ${a.name}`;
  if (a.kind === 'webhook') return `by monitoring tool ${a.name || '(unknown)'}`;
  return `by ${a.name || 'the system'}`;
}

/** The platform facts MIRA may use, as plain text. Counts, names and dates only. */
function snapshotText(data, security, ledger, tz, today) {
  const { zone, when } = clock(tz);
  const t = data.totals;
  const busy = today.perCompany.filter((c) => c.questions || c.imported || c.worked || c.failed)
    .map((c) => `${c.name}: ${c.questions} questions, ${c.imported} incidents imported, fixes worked ${c.worked} / failed ${c.failed}`).join('; ');
  const companies = data.companies.length
    ? data.companies.map((c) => `- ${c.name} (${c.sectorLabel}), joined ${when(c.createdAt).slice(0, 10)}, owner ${c.owner ? c.owner.name : 'none'}, ${c.users} user(s), ${c.files} file(s) imported, ${c.imported} incidents learned, ${c.questions} questions in ${c.conversations} conversations, fixes worked ${c.worked} / failed ${c.failed}, last question ${when(c.lastActive)}`).join('\n')
    : '(no companies yet)';
  const perDay = data.days.map((d) => `${d.day}: ${d.questions} questions, ${d.signups} sign-ups`).join('; ');
  const events = security.recent.map((b) => `#${b.index} ${when(b.at)} ${ACTION_WORDS[b.action] || b.action}${b.outcome !== 'ok' ? ` (${b.outcome})` : ''}${b.company?.name ? ` · ${b.company.name}` : ''} · ${actorWords(b.actor)}`).join('\n') || '(none)';
  return `Now: ${when(new Date())} (${zone} time; all times below are in this zone).
TODAY since midnight: ${today.signups.length ? `new companies ${today.signups.join(', ')}` : 'no new companies'}; ${today.questions} questions asked; ${today.imported} incidents imported; fixes worked ${today.worked} / failed ${today.failed}; ${today.logins} company sign-ins; ${today.failedLogins} failed company sign-ins; ${today.failedAdminLogins} failed admin sign-ins; ${today.rejectedAlerts} alerts rejected for a bad key; ${today.deleted} companies deleted.
Activity today by company: ${busy || 'no company activity yet today'}.
Platform totals (all time): ${t.companies} companies, ${t.users} users, ${t.imported} incidents learned from imports, ${t.questions} questions asked in ${t.conversations} conversations, fixes worked ${t.worked} and failed ${t.failed}, ${t.activeWeek} companies active in the last 7 days.
Companies by sector: ${data.bySector.map((s) => `${s.label} ${s.companies}`).join(', ')}.
Companies:
${companies}
Last 14 days: ${perDay}.
Security in the last ${security.days} days (from the audit logs): ${security.failedLogins} failed company logins, ${security.failedAdminLogins} failed admin logins, ${security.adminLogins} admin logins, ${security.rejectedAlerts} alerts rejected for a bad key, ${security.deletedCompanies} companies deleted.
Audit logs tamper check: ${ledger ? (ledger.ok ? 'OK, nothing was changed or deleted' : `TAMPERED: someone changed or deleted an entry (${ledger.reason})`) : 'not checked'}.
Latest audit log entries:
${events}`;
}

function adminPrompt(admin, facts, memories, question, recent) {
  const first = admin.name.split(' ')[0];
  const convo = recent.length ? recent.map((m) => `${m.role === 'user' ? first : 'MIRA'}: ${m.text}`).join('\n') : '(this is the first message)';
  const remembered = memories.length ? memories.map((m, i) => `${i + 1}. ${m.when ? `[${String(m.when).slice(0, 10)}] ` : ''}${m.text}`).join('\n') : '(nothing yet)';
  return [
    {
      role: 'system',
      content: `You are MIRA, the assistant for the team that runs the MIRA platform (an AI on-call incident agent used by many companies). You are talking with ${first}, a platform admin.
You know only the platform facts given below: usage counts, account details, and the audit logs (who did what, and when). You never see any company's incidents or conversations; they are private to each company. If asked about them, say kindly that they are private and offer what you can tell instead.
Rules:
- Every number, name and date must come from the facts. Never invent. If something isn't in the facts, say you don't have it.
- Mention the audit logs' tamper check only if it failed, or if asked about security or the logs; then just say whether anything was changed. Never mention blocks, hashes or verification counts.
- Say who did something only when the event names them. A failed login by an unknown person is not the admin's. Refer to people by name, never as he or she.
- Be useful like a sharp operations lead: point out what needs attention (companies that never imported history or have gone quiet, fixes that failed, failed logins, tampered audit logs) and suggest one next step.
- For "today" questions and briefings, lead with the TODAY numbers. If a quiet day, say so plainly and mention the most recent activity instead. Skip zero counts unless they matter (for example "no failed sign-ins").
- Use "earlier briefings" only to say what changed since then, with the date.
- Warm and professional. No emojis. "brief" and "full" are read aloud: no markdown, no bullet points, no symbols like * or #. Write numbers as digits.
Return a JSON object with exactly these keys:
"type": "chat" for greetings, thanks and small talk; otherwise "answer".
"brief": chat: the whole reply in 1 or 2 sentences. Answer: at most 30 words with the headline.
"full": chat: "". Answer: 3 to 7 plain sentences with the details and one suggested next step.
"points": chat: []. Answer: 2 to 4 key figures {"label": 1 to 3 words, "value": short, like "12", "GITAMW" or "Intact", "tone": "good", "warn", "bad" or "info"}.
"suggest": up to 3 short follow-up questions ${first} might ask next, each under 8 words.`,
    },
    {
      role: 'user',
      content: `Platform facts:\n${facts}\n\nEarlier briefings you remember:\n${remembered}\n\nConversation so far:\n${convo}\n\nLatest message from ${first}:\n${question}`,
    },
  ];
}

const plain = (s) => String(s || '').replace(/[#*_`>]/g, '').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
const TONES = ['good', 'warn', 'bad', 'info'];

/** Admin MIRA: answers questions about the platform from counts and the audit logs, and remembers each day's numbers in Hindsight. */
export async function askAdmin(admin, question, recent = [], tz) {
  const [data, security, ledger, today] = await Promise.all([overview(), securitySummary(7), verifyLedger().catch(() => null), todayCounts(tz)]);
  const facts = snapshotText(data, security, ledger, tz, today);
  // Earlier snapshots make "what changed?" possible. If memory is slow or down, MIRA still answers from today's numbers.
  const memories = await withTimeout(platformBank().then(() => recallSimilar(PLATFORM_BANK, `platform usage snapshot and trends: ${question}`, 6)), 8000).catch(() => []);

  const safeRecent = recent.slice(-6)
    .map((m) => ({ role: m?.role === 'user' ? 'user' : 'mira', text: String(m?.text || '').slice(0, 400) }))
    .filter((m) => m.text);
  const out = await chatJson(adminPrompt(admin, facts, memories, question, safeRecent), { maxTokens: 1400, temperature: 0.4 });

  const type = out.type === 'chat' ? 'chat' : 'answer';
  const result = {
    type,
    brief: plain(out.brief) || 'I could not put that together. Try asking again.',
    full: type === 'answer' ? plain(out.full) : '',
    points: type === 'answer' && Array.isArray(out.points)
      ? out.points.slice(0, 4).map((p) => ({ label: plain(p?.label).slice(0, 30), value: plain(p?.value).slice(0, 24), tone: TONES.includes(p?.tone) ? p.tone : 'info' })).filter((p) => p.label && p.value)
      : [],
    suggest: Array.isArray(out.suggest) ? out.suggest.map(plain).filter(Boolean).slice(0, 3) : [],
    memories: memories.length,
    ledger: ledger ? { ok: ledger.ok, checked: ledger.checked } : null,
  };

  // Remember today's numbers (one snapshot per day, replaced as the day goes on) and what was asked.
  if (type === 'answer') {
    const today = new Date().toISOString().slice(0, 10);
    platformBank()
      .then(() => Promise.all([
        retainOne(PLATFORM_BANK, `MIRA platform snapshot for ${today}.\n${facts.split('\nLatest audit log entries:')[0]}`, {
          timestamp: new Date(), context: 'daily platform usage snapshot (counts only)', documentId: `snapshot-${today}`,
        }),
        retainOne(PLATFORM_BANK, `On ${today} the admin asked: "${question.slice(0, 200)}". MIRA answered: ${result.brief}`, {
          timestamp: new Date(), context: 'admin question and MIRA briefing', documentId: `ask-${Date.now()}`,
        }),
      ]))
      .catch((err) => console.error('Platform memory write failed:', err?.message || err));
  }
  return result;
}
