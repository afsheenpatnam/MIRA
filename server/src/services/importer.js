import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { mask } from './mask.js';
import { retainMany } from './hindsight.js';
import { chatJson } from './groq.js';
import { incidentsFor, sourcesFor } from '../models/Incident.js';

const MAX_ROWS = 300;
const MAX_DOC_CHARS = 60_000;
export const ACCEPTED = ['csv', 'pdf', 'docx', 'txt', 'md', 'log'];

const extOf = (name = '') => name.toLowerCase().split('.').pop();
const safeId = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/* ---------- reading files ---------- */

async function fileText(file) {
  const buf = Buffer.from(file.data, 'base64');
  const ext = extOf(file.name);
  if (ext === 'pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      return (await parser.getText()).text || '';
    } finally {
      await parser.destroy?.();
    }
  }
  if (ext === 'docx') return (await mammoth.extractRawText({ buffer: buf })).value || '';
  return buf.toString('utf8');
}

/** Small RFC 4180 CSV parser: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
}

// Column names used by common tools (Jira, ServiceNow, PagerDuty exports, our template).
const COLUMNS = {
  code: ['code', 'id', 'incident', 'incident id', 'key', 'number', 'issue key'],
  title: ['title', 'summary', 'short description', 'name', 'subject'],
  service: ['service', 'component', 'components', 'system', 'application', 'affected service'],
  category: ['category', 'type', 'cause category', 'root cause category', 'labels'],
  alert: ['alert', 'description', 'symptom', 'error', 'details'],
  rootCause: ['root cause', 'rootcause', 'root_cause', 'cause'],
  failed: ['failed fixes', 'failed', 'what did not work', 'did not work', 'failed attempts'],
  fix: ['fix', 'resolution', 'fix that worked', 'resolution notes', 'workaround', 'solution'],
  resolvedBy: ['resolved by', 'assignee', 'owner', 'engineer', 'resolver'],
  minutes: ['minutes', 'minutes to resolve', 'time to resolve', 'duration', 'duration (min)', 'mttr'],
  date: ['date', 'created', 'opened', 'started', 'occurred', 'created at', 'start time'],
};
const pick = (row, key) => {
  for (const name of COLUMNS[key]) if (row[name]) return row[name];
  return '';
};

/* ---------- turning rows and documents into incidents ---------- */

function memoryText(workspace, inc) {
  return [
    `Incident ${inc.code || '(no id)'} at ${workspace.name}${inc.occurredAt ? ` on ${inc.occurredAt.toISOString().slice(0, 10)}` : ''}: ${inc.title}.`,
    inc.service && `Service: ${inc.service}.`,
    inc.alert && `Alert: ${inc.alert}`,
    inc.rootCause && `Root cause: ${inc.rootCause}`,
    `Fixes that FAILED: ${inc.failedFixes?.length ? inc.failedFixes.join('; ') : 'none recorded'}.`,
    inc.finalFix && `Fix that WORKED: ${inc.finalFix}`,
    inc.resolvedBy && `Resolved by ${inc.resolvedBy}${inc.minutesToResolve ? ` in ${inc.minutesToResolve} minutes` : ''}.`,
  ].filter(Boolean).join('\n');
}

function toDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Masks every text field of an incident and returns how many values were hidden. */
function maskIncident(inc) {
  let count = 0;
  const m = (s) => { const r = mask(s || ''); count += r.count; return r.text; };
  return {
    inc: {
      ...inc,
      title: m(inc.title), alert: m(inc.alert), rootCause: m(inc.rootCause), finalFix: m(inc.finalFix),
      failedFixes: (inc.failedFixes || []).map(m), resolvedBy: m(inc.resolvedBy),
    },
    count,
  };
}

async function store(workspace, incidents, { origin, kind, by }) {
  const Incident = incidentsFor(workspace);
  let masked = 0;
  const clean = incidents.map((raw) => {
    const { inc, count } = maskIncident(raw);
    masked += count;
    return inc;
  });

  if (clean.length) {
    const stamp = Date.now();
    await retainMany(workspace.bankId, clean.map((inc, i) => ({
      content: memoryText(workspace, inc),
      timestamp: inc.occurredAt || new Date(),
      context: `past production incident at ${workspace.name}, imported from ${origin}`,
      documentId: `import-${safeId(inc.code || origin)}-${stamp}-${i}`,
      tags: [inc.service || 'unknown-service', 'imported'],
    })));
    await Incident.insertMany(clean.map((inc) => ({ ...inc, source: 'import', origin })));
  }
  await sourcesFor(workspace).create({ kind, name: origin, incidents: clean.length, masked, by });
  return { name: origin, kind, incidents: clean.length, masked };
}

async function importCsv(workspace, text, origin, by) {
  const rows = parseCsv(text).slice(0, MAX_ROWS);
  const incidents = rows
    .map((row) => {
      const failed = pick(row, 'failed');
      return {
        code: pick(row, 'code'),
        title: pick(row, 'title') || pick(row, 'alert').slice(0, 120),
        service: pick(row, 'service'),
        category: pick(row, 'category') || 'Uncategorised',
        alert: pick(row, 'alert'),
        rootCause: pick(row, 'rootCause'),
        failedFixes: failed ? failed.split(/;|\|/).map((s) => s.trim()).filter(Boolean) : [],
        finalFix: pick(row, 'fix'),
        resolvedBy: pick(row, 'resolvedBy'),
        minutesToResolve: Number.parseInt(pick(row, 'minutes'), 10) || undefined,
        occurredAt: toDate(pick(row, 'date')),
      };
    })
    .filter((inc) => inc.title && (inc.rootCause || inc.finalFix || inc.alert));
  if (!incidents.length) {
    throw Object.assign(new Error(`${origin}: no incidents found. The first row must be headers such as title, service, root cause, fix.`), { status: 400 });
  }
  return store(workspace, incidents, { origin, kind: 'csv', by });
}

/** Post-mortems are free text: mask them, then let the LLM pull out the structured incidents. */
async function importDocument(workspace, rawText, origin, kind, by) {
  const { text } = mask(rawText.slice(0, MAX_DOC_CHARS));
  if (text.trim().length < 40) {
    throw Object.assign(new Error(`${origin}: there is not enough text to read. Scanned PDFs need a text layer.`), { status: 400 });
  }
  const extracted = await chatJson([
    {
      role: 'system',
      content: `You read post-mortems and incident reports for ${workspace.name}, a ${workspace.sector} company.
Extract every distinct production incident described (at most 8). Use only facts in the text; leave a field empty if it is not stated.
Return JSON: {"incidents":[{"code":"","title":"","service":"","category":"short root-cause category","alert":"the symptom or error","rootCause":"","failedFixes":["fixes that were tried and did not work"],"finalFix":"what fixed it","resolvedBy":"","minutesToResolve":0,"date":"YYYY-MM-DD"}]}`,
    },
    { role: 'user', content: text },
  ], { maxTokens: 2500 });

  const incidents = (Array.isArray(extracted.incidents) ? extracted.incidents : [])
    .slice(0, 8)
    .map((i) => ({
      code: String(i.code || ''),
      title: String(i.title || '').slice(0, 160),
      service: String(i.service || ''),
      category: String(i.category || 'Uncategorised'),
      alert: String(i.alert || ''),
      rootCause: String(i.rootCause || ''),
      failedFixes: Array.isArray(i.failedFixes) ? i.failedFixes.map(String).filter(Boolean) : [],
      finalFix: String(i.finalFix || ''),
      resolvedBy: String(i.resolvedBy || ''),
      minutesToResolve: Number(i.minutesToResolve) || undefined,
      occurredAt: toDate(i.date),
    }))
    .filter((i) => i.title);

  // Keep the whole (masked) document in memory too, so details the extraction skipped can still be recalled.
  await retainMany(workspace.bankId, [{
    content: text,
    timestamp: new Date(),
    context: `post-mortem document "${origin}" from ${workspace.name}`,
    documentId: `doc-${safeId(origin)}-${Date.now()}`,
    tags: ['post-mortem', 'imported'],
  }]);

  const result = await store(workspace, incidents, { origin, kind, by });
  return { ...result, masked: result.masked + mask(rawText.slice(0, MAX_DOC_CHARS)).count };
}

export async function importFiles(workspace, user, { files = [], text = '' }) {
  const results = [];
  for (const file of files.slice(0, 10)) {
    const ext = extOf(file.name);
    try {
      if (!ACCEPTED.includes(ext)) throw Object.assign(new Error(`${file.name}: use CSV, PDF, Word (.docx), TXT or Markdown.`), { status: 400 });
      const content = await fileText(file);
      results.push(ext === 'csv'
        ? await importCsv(workspace, content, file.name, user.name)
        : await importDocument(workspace, content, file.name, 'document', user.name));
    } catch (err) {
      results.push({ name: file.name, error: err.status === 400 ? err.message : `${file.name}: could not be imported (${err.message}).` });
    }
  }
  if (text.trim()) {
    try {
      results.push(await importDocument(workspace, text, 'Pasted post-mortem', 'text', user.name));
    } catch (err) {
      results.push({ name: 'Pasted post-mortem', error: err.message });
    }
  }
  return results;
}
