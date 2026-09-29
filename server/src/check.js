// Checks that MongoDB, Hindsight and Groq are reachable with the keys in .env.
// Usage: npm run check   (never prints the keys themselves)
import mongoose from 'mongoose';
import Groq from 'groq-sdk';
import { HindsightClient } from '@vectorize-io/hindsight-client';
import { config } from './config.js';
import { connectDb } from './db.js';

const hide = (s) =>
  String(s)
    .replace(/(mongodb(\+srv)?:\/\/[^:]+:)[^@]+@/g, '$1***@')
    .replace(/\b(hsk|gsk)_[A-Za-z0-9]+/g, '$1_***')
    .slice(0, 220);

try {
  await connectDb();
  console.log(`MongoDB   ok  (main database: ${mongoose.connection.name})`);
  await mongoose.disconnect();
} catch (e) {
  console.log('MongoDB   FAILED:', hide(e.message));
}

const hs = new HindsightClient({ baseUrl: config.hindsightUrl, apiKey: config.hindsightApiKey });
try {
  await hs.getBankConfig(`${config.bankPrefix}connection-check`);
  console.log('Hindsight ok');
} catch (e) {
  // 404 for this made-up bank means the key was accepted.
  if (e.statusCode === 404) console.log('Hindsight ok  (key accepted)');
  else console.log(`Hindsight FAILED (status ${e.statusCode}):`, hide(e.message));
}

try {
  const groq = new Groq({ apiKey: config.groqApiKey });
  const r = await groq.chat.completions.create({
    model: config.groqModel,
    messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    max_completion_tokens: 60,
  });
  console.log(`Groq      ok  (model replied: ${JSON.stringify((r.choices[0]?.message?.content || '').trim())})`);
} catch (e) {
  console.log(`Groq      FAILED (status ${e.status}):`, hide(e.message));
}
