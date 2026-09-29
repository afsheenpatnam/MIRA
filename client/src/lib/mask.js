// Same rules as server/src/services/mask.js, used only to show the engineer's
// message masked right away. The server masks again before anything is stored.
const RULES = [
  ['CARD HIDDEN', /\b(?:\d[ -]?){11,18}\d\b/g],
  ['EMAIL HIDDEN', /[\w.+-]+@[\w-]+\.[a-z.]{2,}/gi],
  ['UPI ID HIDDEN', /\b[\w.-]+@(?:ok[a-z]+|ybl|paytm|upi|axl|ibl|apl)\b/gi],
  ['PHONE HIDDEN', /(?:\+91[ -]?)?\b[6-9]\d{9}\b/g],
];

/** Returns [{ text, masked }] parts so React can render the masked bits differently. */
export function maskParts(input) {
  let parts = [{ text: input, masked: false }];
  for (const [label, re] of RULES) {
    parts = parts.flatMap((p) => {
      if (p.masked) return [p];
      const out = [];
      let last = 0;
      for (const m of p.text.matchAll(re)) {
        if (m.index > last) out.push({ text: p.text.slice(last, m.index), masked: false });
        out.push({ text: `[${label}]`, masked: true });
        last = m.index + m[0].length;
      }
      if (last < p.text.length) out.push({ text: p.text.slice(last), masked: false });
      return out;
    });
  }
  return parts;
}
