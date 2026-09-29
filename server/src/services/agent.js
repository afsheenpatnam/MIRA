import mongoose from 'mongoose';
import { incidentsFor } from '../models/Incident.js';
import { mask } from './mask.js';
import { recallSimilar, retainOne, reflectOn } from './hindsight.js';
import { chatJson, chatText } from './groq.js';
import { SECTORS } from '../sectors.js';

const today = () => new Date().toISOString().slice(0, 10);
const LEARNED = { source: 'import' };
const STEP_KINDS = ['database', 'config', 'restart', 'deploy', 'rollback', 'network', 'cache', 'queue', 'scale', 'code', 'security', 'monitor', 'communicate', 'investigate'];

// Models sometimes use non-breaking hyphens and other typographic dashes; keep plain ones for display and speech.
const clean = (s) => String(s || '').replace(/[‐-―−]/g, '-').trim();

/** MIRA answers only from the company's own imported history. */
export async function learnedCount(workspace) {
  return incidentsFor(workspace).countDocuments(LEARNED);
}
export function needsData() {
  return Object.assign(new Error('Import your incident history first. MIRA answers only from your own past incidents.'), { status: 409 });
}

function memoryPrompt(workspace, alert, memories) {
  const list = memories.length
    ? memories.map((m, i) => `${i + 1}. ${m.when ? `[${String(m.when).slice(0, 10)}] ` : ''}${m.text}`).join('\n')
    : '(no related memories found)';
  const context = SECTORS[workspace.sector]?.context || 'a technology company';

  return [
    {
      role: 'system',
      content: `You are MIRA, an expert on-call site reliability engineer for ${workspace.name}, ${context}.
Read the engineer's message carefully and understand the actual problem before answering. Then decide how it relates to ${workspace.name}'s incident history (listed by the user):
- "known": a past incident clearly matches. Base the fix on it: what worked, which fixes FAILED (tell them not to try those), who fixed it and how long it took.
- "partial": past incidents are related but not the same. Use what applies from them, and fill the gaps with sound engineering practice.
- "new": nothing in the history matches. Still solve it. Use your own engineering knowledge to give a real, practical approach: the most likely causes, how to confirm which one it is, how to fix it, what NOT to do (common mistakes that make this kind of problem worse), and how to check it is fixed.
Rules:
- Always give a concrete way forward. Never answer only with a request for more details; you may ask for one detail at the end if it would change the fix.
- Company-specific facts (incident codes, people, times, their settings) must come from the history. Never invent them. General commands and practices are fine.
- Prefer safe, reversible, read-only checks before risky changes. Never suggest deleting data or blocking commands in production.
- For new issues the cause is not known yet: diagnose first, and make fixes conditional on what the check shows (for example "if the crash log shows a missing class, then..."). Don't present a guess as the cause.
- "brief" and "full" are read aloud: no markdown, no bullet points, no symbols like * or #.
Return a JSON object with exactly these keys:
"match": "known", "partial" or "new".
"brief": at most 28 words. Known: start with "This matches INC-xxxx." Partial: start with "This looks similar to INC-xxxx." New: start with "This looks new for ${workspace.name}." Then the single most important action, and the one thing not to do.
"full": 5 to 8 plain sentences. Say how it relates to the history (or that it is new), the likely cause, then at most three steps using "First," "Second," "Third,", then what not to do. For known incidents end with who fixed it and how long it took, if the history says so. For new ones end with: once it is fixed, tap Fix worked so MIRA remembers it.
"used": up to 4 objects {"label": incident code or "LESSON", "detail": 2 to 5 words such as "3 weeks ago" or "restart failed 3 of 3"} for the history you relied on; empty for new issues.
"guide": a visual fix plan {"steps": 3 to 5 objects {"title": 2 to 6 words, "detail": one short sentence with the exact check, command, setting or place to look, "kind": one of ${STEP_KINDS.join(', ')}}, "avoid": 1 to 3 short phrases (fixes that failed before, or common mistakes for new issues), "verify": one short sentence on how to confirm it is fixed, "eta": expected time such as "about 15 minutes" or ""}.`,
    },
    {
      role: 'user',
      content: `Today is ${today()}.\n\nMemories from ${workspace.name}:\n${list}\n\nNew alert:\n${alert}`,
    },
  ];
}

/** The engineer is asking about MIRA's previous answer: explain it, step by step, in plain words. */
function followUpPrompt(workspace, question, prev, memories) {
  const list = memories.length
    ? memories.map((m, i) => `${i + 1}. ${m.when ? `[${String(m.when).slice(0, 10)}] ` : ''}${m.text}`).join('\n')
    : '(no related memories found)';
  const context = SECTORS[workspace.sector]?.context || 'a technology company';
  const prevSteps = prev.guide?.steps?.map((s, i) => `${i + 1}. ${s.title}: ${s.detail}`).join('\n') || '(none)';

  return [
    {
      role: 'system',
      content: `You are MIRA, the on-call incident agent for ${workspace.name}, ${context}.
The engineer is asking a follow-up question about your previous answer. They may not understand a step or may want to know how to do or check something.
Rules:
- Answer their question directly and clearly, like a patient senior engineer talking a junior through it.
- For every step say: what to do, exactly how to do it (the command to run, the file or dashboard to open, the setting to look at), and what they should see if it is right or wrong.
- You may use standard, widely known commands and tools (for example redis-cli INFO memory, kubectl describe, SQL queries, log searches). Use placeholders like <redis-host> when a name is not known.
- Prefer safe, read-only checks first. Never suggest commands that block or delete data in production: use SCAN, not KEYS; never FLUSHALL, DROP or DELETE without a WHERE.
- If a step repeats something that failed before (for example a restart), say why it is different this time (for example "this restart only applies the new setting").
- Company-specific facts (service names, incident codes, people, values) must come from the previous answer or the memories. Never invent them.
- "brief" and "full" are read aloud: no markdown, no bullet points, no symbols like * or #, and do not read out long commands in them; say "run the command shown in step 2" instead.
Return a JSON object with exactly these keys:
"brief": at most 30 words that directly answer the question.
"full": 6 to 10 plain sentences explaining the steps in order, using "First," "Second," "Third,".
"used": up to 4 objects {"label": incident code or "LESSON", "detail": 2 to 5 words} for memories you relied on (may be empty).
"guide": {"steps": 3 to 5 objects {"title": 2 to 6 words, "detail": one or two short sentences with the exact command or place to look and what a good or bad result looks like, "kind": one of ${STEP_KINDS.join(', ')}}, "avoid": 0 to 2 short phrases, "verify": one short sentence on how to confirm, "eta": expected time or ""}.`,
    },
    {
      role: 'user',
      content: `Previous alert:\n${prev.alert}\n\nYour previous answer:\n${prev.full}\n\nYour previous fix plan:\n${prevSteps}\n\nMemories from ${workspace.name}:\n${list}\n\nFollow-up question from the engineer:\n${question}`,
    },
  ];
}

/**
 * Reads the engineer's message and decides what it is. For casual messages it also writes the reply,
 * so small talk costs one quick call and never touches incident memory.
 */
function routerPrompt(workspace, user, text, prev, recent) {
  const context = SECTORS[workspace.sector]?.context || 'a technology company';
  const firstName = user.name.split(' ')[0];
  const convo = recent.length ? recent.map((m) => `${m.role === 'user' ? firstName : 'MIRA'}: ${m.text}`).join('\n') : '(this is the first message)';
  return [
    {
      role: 'system',
      content: `You are MIRA, a friendly AI on-call teammate for the engineers at ${workspace.name}, ${context}. You are talking with ${firstName}.
Decide what ${firstName}'s latest message is:
- "incident": they describe a production problem, alert, error, outage or slowness, or paste a log.
${prev ? '- "followup": they ask about, question, or want more detail on your previous answer (shown below).\n' : ''}- "chat": anything else: greetings, thanks, how are you, how they feel (stressed, tired, happy, frustrated), small talk, jokes, questions about you or what you can do, or general questions.
If it is "chat", also write "reply":
- Warm and natural, 1 to 3 short sentences, like a kind teammate. Use ${firstName}'s name now and then, not every time.
- If they seem stressed, tired or frustrated, acknowledge it kindly first, then offer help.
- If they ask what you can do: you remember ${workspace.name}'s past incidents, answer out loud, show step-by-step fix plans, and learn from every fix.
- Offer help with an outage only when it fits naturally. Never invent incidents or company facts.
- Answer the latest message. Don't repeat something you already said earlier in the conversation.
- It is read aloud: no markdown, no emojis, no lists.
Return JSON: {"intent": "chat" | "incident"${prev ? ' | "followup"' : ''}, "reply": "only when intent is chat, otherwise empty"}`,
    },
    {
      role: 'user',
      content: `${prev ? `Your previous answer was about: ${prev.alert}\nIt said: ${prev.brief}\n\n` : ''}Conversation so far:\n${convo}\n\nLatest message from ${firstName}:\n${text}`,
    },
  ];
}

/**
 * Entry point for everything typed in the Console: casual chat, a new incident, or a follow-up.
 * `recent` is the last few lines of the conversation, used only to keep the chat natural.
 */
export async function converse(workspace, user, rawText, { followUpOf, recent = [] } = {}) {
  const { text } = mask(rawText);
  const safeRecent = recent.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'mira', text: mask(String(m.text || '')).text.slice(0, 400) }));
  const prev = followUpOf ? await incidentsFor(workspace).findOne({ _id: followUpOf, source: 'live' }).lean() : null;

  // Long pasted logs are clearly incidents; everything else is routed by the model.
  const looksLikeLog = text.length > 280 && /\b(error|exception|warn|failed|timeout)\b/i.test(text);
  let intent = looksLikeLog ? 'incident' : null;
  let reply = '';
  if (!intent) {
    const routed = await chatJson(routerPrompt(workspace, user, text, prev, safeRecent), { maxTokens: 300, temperature: 0.6 });
    intent = ['chat', 'incident', 'followup'].includes(routed.intent) ? routed.intent : 'incident';
    if (intent === 'followup' && !prev) intent = 'incident';
    reply = clean(routed.reply);
  }

  if (intent === 'chat') {
    return { type: 'chat', reply: reply || `Hi ${user.name.split(' ')[0]}, I'm here. Tell me what's going on.` };
  }
  if (!(await learnedCount(workspace))) {
    return {
      type: 'chat',
      action: 'import',
      reply: `I'd love to help with that, ${user.name.split(' ')[0]}, but I haven't learned ${workspace.name}'s incident history yet. Import it in Data sources and I'll be ready.`,
    };
  }
  const answer = await investigate(workspace, user, rawText, { followUpOf: intent === 'followup' ? followUpOf : undefined });
  return { type: 'answer', ...answer };
}

function genericPrompt(alert) {
  return [
    {
      role: 'system',
      content:
        'You are a general assistant with no knowledge of this company or its past incidents. Reply with generic troubleshooting advice in 2 or 3 plain sentences. No markdown.',
    },
    { role: 'user', content: alert },
  ];
}

function cleanGuide(g) {
  if (!g || typeof g !== 'object') return null;
  const steps = (Array.isArray(g.steps) ? g.steps : [])
    .map((s) => ({
      title: clean(s?.title).slice(0, 60),
      detail: clean(s?.detail).slice(0, 260),
      kind: STEP_KINDS.includes(s?.kind) ? s.kind : 'investigate',
    }))
    .filter((s) => s.title)
    .slice(0, 5);
  if (!steps.length) return null;
  return {
    steps,
    avoid: (Array.isArray(g.avoid) ? g.avoid : []).map((a) => clean(a).slice(0, 80)).filter(Boolean).slice(0, 2),
    verify: clean(g.verify).slice(0, 180),
    eta: clean(g.eta).slice(0, 40),
  };
}

export async function investigate(workspace, user, rawAlert, { followUpOf } = {}) {
  if (!(await learnedCount(workspace))) throw needsData();
  const { text: alert, count: maskedCount } = mask(rawAlert);

  // A follow-up is answered in the context of MIRA's earlier answer (from this company's own database).
  const Incident = incidentsFor(workspace);
  const prev = followUpOf ? await Incident.findOne({ _id: followUpOf, source: 'live' }).lean() : null;

  const memories = await recallSimilar(workspace.bankId, prev ? `${prev.alert}\n${alert}` : alert);

  const [answer, generic] = await Promise.all([
    chatJson(prev ? followUpPrompt(workspace, alert, prev, memories) : memoryPrompt(workspace, alert, memories), { maxTokens: 2200 }),
    prev ? Promise.resolve('') : chatText(genericPrompt(alert), { maxTokens: 250 }).catch(() => ''),
  ]);

  const brief = clean(answer.brief);
  const full = clean(answer.full);
  // One chip per incident code; lessons may repeat because each one is different.
  const seen = new Set();
  const used = (Array.isArray(answer.used) ? answer.used : [])
    .map((u) => ({ label: clean(u.label).slice(0, 24), detail: clean(u.detail).slice(0, 60) }))
    .filter((u) => u.label && (u.label === 'LESSON' || !seen.has(u.label)) && seen.add(u.label))
    .slice(0, 4);
  const guide = cleanGuide(answer.guide);
  const match = prev ? 'followup' : ['known', 'partial', 'new'].includes(answer.match) ? answer.match : used.length ? 'partial' : 'new';
  if (!brief || !full) throw new Error('MIRA could not form an answer. Try describing the alert again.');

  const _id = new mongoose.Types.ObjectId();
  const incident = await Incident.create({
    _id,
    source: 'live',
    followUpOf: prev?._id || null,
    threadId: prev ? prev.threadId || prev._id : _id,
    alert,
    askedBy: { name: user.name, email: user.email },
    brief,
    full,
    generic: clean(generic),
    used,
    guide,
    match,
    occurredAt: new Date(),
  });

  return {
    incidentId: incident._id,
    followUp: Boolean(prev),
    alert,
    maskedCount,
    memoriesFound: memories.length,
    brief,
    full,
    generic: clean(generic),
    used,
    guide,
    match,
  };
}

/** Saves the engineer's verdict back into the company's memory so the next recall ranks it. */
export async function recordFeedback(workspace, incident, { worked, note }) {
  const cleanNote = note ? mask(note).text.slice(0, 500) : '';
  const content = [
    `MIRA feedback for ${workspace.name} on ${today()}.`,
    `Alert: ${incident.alert}`,
    `MIRA suggested: ${incident.brief}`,
    `Result: the suggested fix ${worked ? 'WORKED' : 'DID NOT WORK'}.`,
    cleanNote && `Engineer note: ${cleanNote}`,
  ]
    .filter(Boolean)
    .join('\n');

  await retainOne(workspace.bankId, content, {
    timestamp: new Date(),
    context: 'engineer feedback on a MIRA suggestion',
    documentId: `feedback-${incident._id}`,
    tags: ['feedback', worked ? 'worked' : 'failed'],
  });

  incident.outcome = worked ? 'worked' : 'failed';
  incident.note = cleanNote;
  await incident.save();
}

/** Groups questions into conversations: a first question plus every follow-up after it. */
async function conversations(workspace) {
  const live = await incidentsFor(workspace).find({ source: 'live' }).sort({ createdAt: 1 }).limit(500).lean();
  const byId = new Map(live.map((i) => [String(i._id), i]));
  // Older follow-ups have no threadId, so walk back through followUpOf to the first question.
  const rootOf = (i) => {
    if (i.threadId) return String(i.threadId);
    let cur = i;
    for (let hops = 0; cur.followUpOf && byId.has(String(cur.followUpOf)) && hops < 50; hops += 1) cur = byId.get(String(cur.followUpOf));
    return String(cur._id);
  };
  const threads = new Map();
  for (const i of live) {
    const root = rootOf(i);
    if (!threads.has(root)) threads.set(root, []);
    threads.get(root).push(i);
  }
  return threads;
}

/** The whole conversation that contains `incidentId`, oldest first. */
export async function thread(workspace, incidentId) {
  const threads = await conversations(workspace);
  for (const [, items] of threads) {
    if (items.some((i) => String(i._id) === String(incidentId))) {
      return items.map((i) => ({
        id: i._id, alert: i.alert, brief: i.brief, full: i.full, guide: i.guide, used: i.used, generic: i.generic,
        outcome: i.outcome, followUp: Boolean(i.followUpOf), match: i.match, askedBy: i.askedBy?.name, at: i.createdAt,
      }));
    }
  }
  return null;
}

export async function history(workspace) {
  const Incident = incidentsFor(workspace);
  const [threads, past] = await Promise.all([
    conversations(workspace),
    Incident.find(LEARNED).sort({ occurredAt: -1, createdAt: -1 }).limit(300).lean(),
  ]);
  const live = [...threads.values()]
    .map((items) => {
      const first = items[0];
      const last = items[items.length - 1];
      return {
        id: first._id, alert: first.alert, brief: last.brief, used: first.used,
        outcome: items.find((i) => i.outcome)?.outcome || null,
        messages: items.length, askedBy: first.askedBy?.name, at: first.createdAt, lastAt: last.createdAt,
      };
    })
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
    .slice(0, 40);
  return {
    live,
    past: past.map((i) => ({
      id: i._id, code: i.code, title: i.title, service: i.service, category: i.category,
      rootCause: i.rootCause, finalFix: i.finalFix, failedFixes: i.failedFixes,
      resolvedBy: i.resolvedBy, minutes: i.minutesToResolve, at: i.occurredAt || i.createdAt,
      origin: i.origin,
    })),
  };
}

/** Prompts built from the company's own history: its most frequent problems, newest example first. */
export async function suggestions(workspace) {
  const groups = await incidentsFor(workspace).aggregate([
    { $match: { ...LEARNED, category: { $nin: [null, '', 'Uncategorised'] } } },
    { $sort: { occurredAt: -1 } },
    { $group: { _id: '$category', count: { $sum: 1 }, title: { $first: '$title' }, service: { $first: '$service' }, alert: { $first: '$alert' } } },
    { $sort: { count: -1 } },
    { $limit: 3 },
  ]);
  return groups.map((g) => ({
    title: g._id,
    hint: `${g.count} past incident${g.count === 1 ? '' : 's'}${g.service ? ` · ${g.service}` : ''}`,
    prompt: g.alert || g.title,
  }));
}

export async function insights(workspace) {
  const Incident = incidentsFor(workspace);
  const total = await Incident.countDocuments(LEARNED);
  if (!total) throw needsData();

  const [lessonsRaw, byCategory, byService, outcomes] = await Promise.all([
    reflectOn(
      workspace.bankId,
      `In 3 short plain sentences for an on-call engineer at ${workspace.name}: the most common root cause, one fix that keeps failing, and the riskiest service. No markdown.`
    ),
    Incident.aggregate([
      { $match: LEARNED },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    Incident.aggregate([
      { $match: { ...LEARNED, service: { $nin: [null, ''] } } },
      { $group: { _id: '$service', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 4 },
    ]),
    Incident.aggregate([
      { $match: { source: 'live', outcome: { $ne: null } } },
      { $group: { _id: '$outcome', count: { $sum: 1 } } },
    ]),
  ]);

  const lessons = clean(lessonsRaw.replace(/[#*_`>]/g, '').replace(/\s+/g, ' '));
  const worked = outcomes.find((o) => o._id === 'worked')?.count || 0;
  const failed = outcomes.find((o) => o._id === 'failed')?.count || 0;

  return {
    lessons,
    causes: byCategory.map((c) => ({ label: c._id || 'Uncategorised', count: c.count })),
    risky: byService.map((s) => ({ service: s._id, count: s.count })),
    feedback: { worked, failed },
    total,
  };
}
