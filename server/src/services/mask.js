// Hides sensitive values before text is stored in memory or sent to the LLM.
const RULES = [
  { label: 'CARD HIDDEN', pattern: /\b(?:\d[ -]?){11,18}\d\b/g },
  { label: 'EMAIL HIDDEN', pattern: /[\w.+-]+@[\w-]+\.[a-z.]{2,}/gi },
  { label: 'UPI ID HIDDEN', pattern: /\b[\w.-]+@(?:ok[a-z]+|ybl|paytm|upi|axl|ibl|apl)\b/gi },
  { label: 'PHONE HIDDEN', pattern: /(?:\+91[ -]?)?\b[6-9]\d{9}\b/g },
  { label: 'SECRET HIDDEN', pattern: /\b(password|passwd|token|api[_-]?key|secret)\s*[:=]\s*\S+/gi },
];

export function mask(input = '') {
  let text = String(input);
  let count = 0;
  for (const { label, pattern } of RULES) {
    text = text.replace(pattern, (match, key) => {
      count += 1;
      return label === 'SECRET HIDDEN' ? `${key}=[${label}]` : `[${label}]`;
    });
  }
  return { text, count };
}
