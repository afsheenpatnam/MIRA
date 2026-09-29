import Groq from 'groq-sdk';
import { config } from '../config.js';

const groq = new Groq({ apiKey: config.groqApiKey });

export async function chatText(messages, { temperature = 0.3, maxTokens = 600 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await groq.chat.completions.create({
        model: config.groqModel,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
      });
      return (res.choices[0]?.message?.content || '').trim();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    // Models sometimes wrap JSON in prose or code fences; take the outermost object.
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('The model did not return JSON.');
  }
}

/** Asks for a JSON object and retries once if the reply can't be parsed. */
export async function chatJson(messages, { temperature = 0.3, maxTokens = 1200 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await groq.chat.completions.create({
        model: config.groqModel,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
        response_format: { type: 'json_object' },
      });
      return parseJson(res.choices[0]?.message?.content || '');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
