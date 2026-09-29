import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Workspace } from '../models/Workspace.js';
import { sourcesFor } from '../models/Incident.js';
import { investigate } from '../services/agent.js';
import { alertToText, hashKey } from '../services/alerts.js';
import { audit, companyOf, ipOf } from '../services/audit.js';

const router = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many alerts in a minute.' } });

/**
 * Monitoring tools post alerts here with the company's ingest key.
 * The key decides the company, so an alert can only ever reach its own company's memory.
 */
router.post('/alert', limiter, async (req, res) => {
  const header = req.get('authorization') || '';
  const key = req.get('x-mira-key') || (header.startsWith('Bearer ') ? header.slice(7) : '');
  if (!key) return res.status(401).json({ error: 'Send the ingest key in the X-MIRA-Key header.' });

  const workspace = await Workspace.findOne({ ingestKeyHash: hashKey(key) });
  if (!workspace) {
    audit({ category: 'access', action: 'alert.rejected', outcome: 'denied', actor: { kind: 'webhook', name: req.get('x-mira-source') || 'unknown tool' },
      detail: { key: `…${key.slice(-4)}` }, ip: ipOf(req) });
    return res.status(401).json({ error: 'That ingest key is not valid.' });
  }

  const { source, text } = alertToText(req.body, req.get('x-mira-source'));
  if (!text || text.length < 5) return res.status(400).json({ error: 'The alert has no title or message.' });

  const result = await investigate(workspace, { name: `Alert · ${source}`, email: 'webhook' }, text);
  await sourcesFor(workspace).create({ kind: 'alert', name: source, incidents: 1, detail: result.brief, by: source });
  audit({ category: 'data', action: 'alert.received', actor: { kind: 'webhook', name: source }, company: companyOf(workspace), detail: { match: result.match || '' }, ip: ipOf(req) });
  res.json({ company: workspace.name, incidentId: result.incidentId, brief: result.brief, full: result.full });
});

export default router;
