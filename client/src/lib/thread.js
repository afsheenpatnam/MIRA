import { splitSentences } from './voice.js';

const time = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Stored questions are already masked ("[CARD HIDDEN]"); show those parts in the masked style.
function partsOf(text = '') {
  return String(text).split(/(\[[A-Z ]+ HIDDEN\])/).filter(Boolean).map((t) => ({ text: t, masked: /^\[[A-Z ]+ HIDDEN\]$/.test(t) }));
}

/** Turns a saved conversation into Console messages, so it can be read and continued. */
export function threadToMessages(items) {
  const out = [{ id: `resume-${items[0].id}`, role: 'system', text: `Conversation from ${when(items[0].at)}` }];
  for (const i of items) {
    out.push({ id: `u-${i.id}`, role: 'user', parts: partsOf(i.alert), at: time(i.at) });
    out.push({
      id: `m-${i.id}`, role: 'mira', kind: 'answer', status: 'done', resumed: true, at: time(i.at),
      incidentId: i.id, alert: i.alert, question: i.alert, brief: i.brief, full: i.full,
      sentences: splitSentences(i.full || i.brief || ''), guide: i.guide, used: i.used || [], generic: i.generic,
      followUp: i.followUp, isFollowUp: i.followUp, feedback: i.outcome || null, match: i.match,
    });
  }
  return out;
}
