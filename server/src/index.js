import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { config } from './config.js';
import { connectDb } from './db.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import ingestRoutes from './routes/ingest.js';
import adminRoutes from './routes/admin.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.clientOrigin }));
// Small bodies everywhere except the import route, which parses its own larger limit.
const smallJson = express.json({ limit: '32kb' });
app.use((req, res, next) => (req.path === '/api/workspace/import' ? next() : smallJson(req, res, next)));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api/auth', authRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

// Express 5 forwards rejected promises from async routes here.
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large. Keep each file under 8 MB.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  // Our own validation errors (e.g. "import your history first") carry a 4xx status and no response headers.
  if (err?.status >= 400 && err.status < 500 && !err.headers) return res.status(err.status).json({ error: err.message });
  console.error(err);
  // Groq SDK errors carry the HTTP status and response headers.
  const upstream = err?.name === 'HindsightError' ? 'Hindsight memory' : err?.status && err?.headers ? 'Groq' : null;
  res.status(502).json({
    error: upstream
      ? `MIRA couldn't reach ${upstream}. Check the API key and URL in server/.env, then try again.`
      : err.message || 'Something went wrong on the server.',
  });
});

// A background error (for example a dropped database socket) is logged instead of taking the server down.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

await connectDb();
app.listen(config.port, () => console.log(`MIRA API listening on http://localhost:${config.port}`));
