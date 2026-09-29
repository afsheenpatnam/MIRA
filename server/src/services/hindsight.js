import { HindsightClient } from '@vectorize-io/hindsight-client';
import { config } from '../config.js';

const client = new HindsightClient({
  baseUrl: config.hindsightUrl,
  apiKey: config.hindsightApiKey,
  userAgent: 'mira-incident-agent/1.0',
});

/**
 * Retries a Hindsight call when the network drops or the service is briefly busy.
 * Writes are safe to retry because every retain uses a fixed document id (replaced, not duplicated).
 */
async function withRetry(fn, tries = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.statusCode;
      const transient = status === undefined || status === 429 || status >= 500;
      if (!transient || attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 700 * attempt));
    }
  }
}

export function bankIdFor(slug) {
  return `${config.bankPrefix}${slug}`;
}

/** Creates the company's bank, or updates its missions if it already exists. */
export async function ensureBank(bankId, { name, context }) {
  await client.createBank(bankId, {
    name: `${name} incident memory`,
    reflectMission: `You are the on-call memory for ${name}, ${context}. Explain what usually breaks, why, which fixes worked and which fixes failed. Be concrete and name services and incident codes.`,
    retainMission: `Extract production incidents: the service, the symptom, the root cause, every fix that was tried and whether it worked or failed, who resolved it, and how long it took. Keep incident codes like INC-0412.`,
  });
}

/** Creates (or updates) a bank with its own missions. */
export async function ensureBankWith(bankId, { name, reflectMission, retainMission }) {
  await withRetry(() => client.createBank(bankId, { name, reflectMission, retainMission }));
}

/** Stores several memories in one call. Each item: { content, timestamp, context, documentId, tags } */
export async function retainMany(bankId, items) {
  return withRetry(() => client.retainBatch(
    bankId,
    items.map((item) => ({
      content: item.content,
      timestamp: item.timestamp,
      context: item.context,
      document_id: item.documentId,
      tags: item.tags,
    }))
  ));
}

export async function deleteBank(bankId) {
  return client.deleteBank(bankId);
}

/** How much a bank holds: documents MIRA sent and memories Hindsight extracted from them. */
export async function bankStats(bankId) {
  const [docs, mems] = await Promise.all([
    withRetry(() => client.listDocuments(bankId, { limit: 1 })),
    withRetry(() => client.listMemories(bankId, { limit: 1 })),
  ]);
  return { documents: docs.total, memories: mems.total };
}

export async function retainOne(bankId, content, options = {}) {
  return withRetry(() => client.retain(bankId, content, options));
}

/** Finds the memories most related to an alert. */
export async function recallSimilar(bankId, query, limit = 8) {
  const response = await withRetry(() => client.recall(bankId, query, { budget: 'mid', maxTokens: 2500 }));
  return (response.results || []).slice(0, limit).map((r) => ({
    id: r.id,
    text: r.text,
    type: r.type || null,
    when: r.occurred_start || r.mentioned_at || null,
  }));
}

/** Asks Hindsight to reason over the whole bank. */
export async function reflectOn(bankId, query) {
  const response = await withRetry(() => client.reflect(bankId, query, { budget: 'mid' }));
  return response.text || '';
}
