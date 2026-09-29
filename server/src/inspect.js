// Prints what MIRA has stored for one company, in MongoDB and in Hindsight.
// Usage: npm run inspect -- "Company Name"      (without a name it lists all companies)
import mongoose from 'mongoose';
import { HindsightClient } from '@vectorize-io/hindsight-client';
import { config } from './config.js';
import { connectDb } from './db.js';
import { Workspace } from './models/Workspace.js';
import { User } from './models/User.js';
import { incidentsFor, sourcesFor } from './models/Incident.js';

const name = process.argv.slice(2).join(' ').trim();
const line = (s = '') => console.log(s);
const cut = (s, n = 110) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));

await connectDb();
const all = await Workspace.find().sort({ createdAt: 1 });
if (!name) {
  line('Companies:');
  all.forEach((w) => line(`  ${w.name}  (${w.sector})  → database ${w.dbName}, memory bank ${w.bankId}`));
  line('\nRun: npm run inspect -- "Company Name"');
  await mongoose.disconnect();
  process.exit(0);
}
const ws = all.find((w) => w.name.toLowerCase() === name.toLowerCase());
if (!ws) {
  line(`No company named "${name}". Companies: ${all.map((w) => w.name).join(', ') || 'none'}`);
  await mongoose.disconnect();
  process.exit(1);
}

line(`═══ ${ws.name} (${ws.sector}) ═══`);
line('\n── MongoDB: main database "mira" ──');
line(`workspaces: 1 record  → name, sector, dbName=${ws.dbName}, bankId=${ws.bankId}${ws.ingestKeyHash ? ', webhook key (hash only)' : ''}`);
const users = await User.find({ workspace: ws._id }).select('name email role createdAt');
line(`users: ${users.length}  → ${users.map((u) => `${u.name} <${u.email}> (${u.role})`).join(', ')}  [passwords stored as bcrypt hashes]`);

line(`\n── MongoDB: company database "${ws.dbName}" ──`);
const Incident = incidentsFor(ws);
const [imported, live, sources] = await Promise.all([
  Incident.countDocuments({ source: 'import' }),
  Incident.countDocuments({ source: 'live' }),
  sourcesFor(ws).find().sort({ createdAt: -1 }).lean(),
]);
line(`incidents: ${imported} imported history + ${live} questions asked in the Console`);
const sampleImport = await Incident.findOne({ source: 'import' }).sort({ occurredAt: -1 }).lean();
if (sampleImport) line(`  example (imported): ${sampleImport.code || ''} "${cut(sampleImport.title, 60)}" · ${sampleImport.service} · fix: ${cut(sampleImport.finalFix, 60)}`);
const sampleLive = await Incident.findOne({ source: 'live' }).sort({ createdAt: -1 }).lean();
if (sampleLive) line(`  example (asked):    "${cut(sampleLive.alert, 60)}" → ${cut(sampleLive.brief, 70)}${sampleLive.outcome ? ` [${sampleLive.outcome}]` : ''}`);
line(`sources: ${sources.length} import log entries${sources.length ? ` → ${sources.slice(0, 4).map((s) => `${s.name} (${s.incidents})`).join(', ')}${sources.length > 4 ? '…' : ''}` : ''}`);

line(`\n── Hindsight: memory bank "${ws.bankId}" (Hindsight Cloud) ──`);
const hs = new HindsightClient({ baseUrl: config.hindsightUrl, apiKey: config.hindsightApiKey });
try {
  const docs = await hs.listDocuments(ws.bankId, { limit: 200 });
  const kinds = { import: 0, doc: 0, feedback: 0, other: 0 };
  for (const d of docs.items) {
    const k = d.id.startsWith('import-') ? 'import' : d.id.startsWith('doc-') ? 'doc' : d.id.startsWith('feedback-') ? 'feedback' : 'other';
    kinds[k] += 1;
  }
  line(`documents (what MIRA sent): ${docs.total}  → ${kinds.import} imported incidents, ${kinds.doc} post-mortem documents, ${kinds.feedback} "fix worked / didn't work" feedback`);
  docs.items.slice(0, 3).forEach((d) => line(`  ${d.id}  · ${d.text_length ?? '?'} chars · ${d.memory_unit_count ?? '?'} memories extracted`));

  const mems = await hs.listMemories(ws.bankId, { limit: 200 });
  const byType = {};
  mems.items.forEach((m) => { byType[m.fact_type || 'other'] = (byType[m.fact_type || 'other'] || 0) + 1; });
  line(`memories (facts Hindsight extracted): ${mems.total}  → ${Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(', ')}${mems.total > 200 ? ' (first 200 counted)' : ''}`);
  mems.items.slice(0, 5).forEach((m) => line(`  [${m.fact_type || '?'}] ${cut(m.text)}`));
} catch (e) {
  line(`Could not read Hindsight (${e.statusCode || 'network'}): ${cut(e.message, 160)}`);
}
await mongoose.disconnect();
