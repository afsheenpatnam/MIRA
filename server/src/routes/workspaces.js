import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { incidentsFor, sourcesFor } from '../models/Incident.js';
import { requireAuth } from '../middleware/auth.js';
import { investigate, converse, recordFeedback, insights, history, thread, suggestions, learnedCount } from '../services/agent.js';
import { importFiles } from '../services/importer.js';
import { hashKey, newIngestKey } from '../services/alerts.js';
import { publicWorkspace } from './auth.js';
import { audit, asUser, companyOf, ipOf } from '../services/audit.js';

// Ledger entries record who did what and counts, never the text of an incident or message.
const trail = (req, action, detail) => audit({ category: 'data', action, actor: asUser(req.user), company: companyOf(req.workspace), detail, ip: ipOf(req) });
const answered = (req, r) => trail(req, 'mira.answered', { match: r.match || (r.followUp ? 'followup' : ''), followUp: Boolean(r.followUp), hidden: r.maskedCount || 0 });

// Every route here works on the signed-in user's own company only.
// There is no company id in the URL, so there is nothing to tamper with.
const router = Router();
router.use(requireAuth);

// Each investigation costs LLM and memory calls.
const askLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many questions in a minute. Wait a moment and try again.' } });

router.get('/', async (req, res) => {
  res.json({ workspace: { ...publicWorkspace(req.workspace), incidents: await learnedCount(req.workspace) } });
});

router.get('/suggestions', async (req, res) => {
  res.json({ suggestions: await suggestions(req.workspace) });
});

router.post('/investigate', askLimiter, async (req, res) => {
  const alert = String(req.body?.alert || '').trim();
  if (alert.length < 5) return res.status(400).json({ error: 'Describe the alert in a few words.' });
  if (alert.length > 4000) return res.status(400).json({ error: 'That log is too long. Paste the most relevant 4,000 characters.' });
  const followUpOf = mongoose.isValidObjectId(req.body?.followUpOf) ? req.body.followUpOf : undefined;
  const result = await investigate(req.workspace, req.user, alert, { followUpOf });
  answered(req, result);
  res.json(result);
});

// Everything typed in the Console: casual chat, a new incident, or a follow-up to the last answer.
router.post('/message', askLimiter, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Type a message.' });
  if (text.length > 4000) return res.status(400).json({ error: 'That message is too long. Paste the most relevant 4,000 characters.' });
  const followUpOf = mongoose.isValidObjectId(req.body?.followUpOf) ? req.body.followUpOf : undefined;
  const recent = Array.isArray(req.body?.recent) ? req.body.recent : [];
  const result = await converse(req.workspace, req.user, text, { followUpOf, recent });
  if (result.type === 'answer') answered(req, result);
  res.json(result);
});

router.get('/incidents', async (req, res) => {
  res.json(await history(req.workspace));
});

// A past conversation, so it can be reopened in the Console and continued.
router.get('/incidents/:id/thread', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'That conversation does not exist.' });
  const items = await thread(req.workspace, req.params.id);
  if (!items) return res.status(404).json({ error: 'That conversation does not exist.' });
  res.json({ thread: items });
});

router.post('/incidents/:id/feedback', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'That incident does not exist.' });
  const incident = await incidentsFor(req.workspace).findOne({ _id: req.params.id, source: 'live' });
  if (!incident) return res.status(404).json({ error: 'That incident does not exist.' });
  if (incident.outcome) return res.status(409).json({ error: 'Feedback for this incident is already saved.' });
  await recordFeedback(req.workspace, incident, { worked: Boolean(req.body?.worked), note: req.body?.note });
  trail(req, 'feedback.saved', { outcome: incident.outcome });
  res.json({ saved: true, outcome: incident.outcome });
});

router.get('/insights', async (req, res) => {
  res.json(await insights(req.workspace));
});

/* ---------- data sources ---------- */

router.get('/sources', async (req, res) => {
  const Source = sourcesFor(req.workspace);
  const [recent, imported, alerts] = await Promise.all([
    Source.find().sort({ createdAt: -1 }).limit(25).lean(),
    learnedCount(req.workspace),
    Source.countDocuments({ kind: 'alert' }),
  ]);
  res.json({
    recent: recent.map((s) => ({ id: s._id, kind: s.kind, name: s.name, incidents: s.incidents, masked: s.masked, detail: s.detail, by: s.by, at: s.createdAt })),
    imported,
    alerts,
    key: { exists: Boolean(req.workspace.ingestKeyHash), hint: req.workspace.ingestKeyHint || null },
  });
});

const importLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many imports in a minute. Wait a moment and try again.' } });

// Files arrive base64-encoded in JSON, so this route accepts a larger body than the rest of the API.
router.post('/import', importLimiter, express.json({ limit: '15mb' }), async (req, res) => {
  const files = Array.isArray(req.body?.files) ? req.body.files.filter((f) => f?.name && f?.data) : [];
  const text = String(req.body?.text || '');
  if (!files.length && !text.trim()) return res.status(400).json({ error: 'Choose a file or paste a post-mortem to import.' });
  const results = await importFiles(req.workspace, req.user, { files, text });
  const ok = results.filter((r) => !r.error);
  trail(req, 'data.imported', {
    files: ok.length,
    failed: results.length - ok.length,
    incidents: ok.reduce((s, r) => s + (Number(r.incidents) || 0), 0),
    hidden: ok.reduce((s, r) => s + (Number(r.masked) || 0), 0),
  });
  res.json({ results });
});

// Creates a new webhook key. The old key stops working immediately. The key is returned only this once.
router.post('/ingest-key', async (req, res) => {
  const key = newIngestKey(req.workspace.slug);
  req.workspace.ingestKeyHash = hashKey(key);
  req.workspace.ingestKeyHint = key.slice(-4);
  await req.workspace.save();
  trail(req, 'ingest.key.created', { hint: req.workspace.ingestKeyHint });
  res.json({ key, hint: req.workspace.ingestKeyHint });
});

export default router;
