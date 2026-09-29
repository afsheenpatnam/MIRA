import { useEffect, useRef, useState } from 'react';
import Orb, { OrbAvatar } from './Orb.jsx';
import FixGuide from './FixGuide.jsx';
import Smooth from './Smooth.jsx';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';
import { splitSentences } from '../lib/voice.js';
import { maskParts } from '../lib/mask.js';
import { wait } from '../lib/useSpeaker.js';
import { Listener } from '../lib/listener.js';

let nextId = 1;
const uid = () => `m${nextId++}`;
let lastVoice = null;
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const Speaker = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></svg>;
const SUG_ICONS = [
  <path key="a" d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  <><circle key="b1" cx="12" cy="12" r="8.5" /><path key="b2" d="M12 7.5V12l3 2" /></>,
  <path key="c" d="M3 12h4l3-8 4 16 3-8h4" />,
];

export default function Console({ user, workspace, speaker, messages, setMessages, onAnswered, toast, listen, resume, pendingVoice, onVoiceHandled }) {
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [reading, setReading] = useState(null);
  // The answer the next question refers to. Cleared with ✕ to ask about a new incident instead.
  const [followUp, setFollowUp] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const ready = workspace.incidents > 0;

  useEffect(() => { if (!messages.length) setFollowUp(null); }, [messages.length]);
  // A conversation reopened from History continues from its last answer.
  useEffect(() => {
    if (resume) setFollowUp({ incidentId: resume.incidentId, alert: resume.alert });
  }, [resume?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ready) api.suggestions().then((d) => setSuggestions(d.suggestions)).catch(() => {});
  }, [ready]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const patch = (id, changes) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...changes } : m)));

  // The last few lines of the conversation, so casual replies flow naturally.
  const recentLines = () => messages.filter((m) => m.role !== 'system').slice(-6).map((m) => (m.role === 'user'
    ? { role: 'user', text: m.parts.map((p) => p.text).join('') }
    : { role: 'mira', text: m.reply || m.brief || '' })).filter((l) => l.text);

  // After a spoken question, keep listening briefly so the conversation can continue hands-free.
  const listenForReply = (viaVoice) => {
    if (viaVoice && Listener.supported) setTimeout(() => Listener.capture('followup', { timeout: 6000 }), 350);
  };

  // Sends a message and fills in MIRA's reply `mid`: a casual reply or a full incident answer.
  const run = async (mid, text, followUpOf, recent, viaVoice) => {
    setBusy(true);
    try {
      const data = await api.message(text, followUpOf, recent);
      if (data.type === 'chat') {
        patch(mid, { kind: 'chat', status: 'speaking', reply: data.reply, action: data.action });
        await speaker.speakBrief('MIRA', data.reply);
        patch(mid, { status: 'done' });
        listenForReply(viaVoice);
        return;
      }
      const isFollowUp = Boolean(data.followUp);
      patch(mid, { kind: 'answer', isFollowUp, status: 'found', used: data.used, memoriesFound: data.memoriesFound });
      await wait(900);
      patch(mid, { status: 'speaking' });
      await speaker.speakBrief(isFollowUp ? 'MIRA · explaining' : 'MIRA · short answer', data.brief);
      patch(mid, { status: 'done', ...data, sentences: splitSentences(data.full) });
      setFollowUp({ incidentId: data.incidentId, alert: text });
      onAnswered();
      listenForReply(viaVoice);
    } catch (err) {
      patch(mid, { status: 'error', error: err.message, retryable: err.retryable !== false });
    } finally {
      setBusy(false);
    }
  };

  const ask = (raw, { viaVoice = false } = {}) => {
    const text = (raw || '').trim();
    if (!text || busy || speaker.cast) return false;
    setInput('');
    const mid = uid();
    const followUpOf = followUp?.incidentId;
    const recent = recentLines();
    setMessages((list) => [...list,
      { id: uid(), role: 'user', parts: maskParts(text), at: now(), viaVoice },
      { id: mid, role: 'mira', kind: 'pending', status: 'thinking', at: now(), question: text, followUpOf, recent, viaVoice },
    ]);
    run(mid, text, followUpOf, recent, viaVoice);
    return true;
  };

  const retry = (m) => {
    if (busy || speaker.cast) return;
    patch(m.id, { kind: 'pending', status: 'thinking', error: '' });
    run(m.id, m.question, m.followUpOf, m.recent, false);
  };

  // Words spoken via "Hey MIRA", the mic button or Ctrl+Space arrive here. Each is asked once,
  // even when the Console has just opened and React runs this effect twice.
  useEffect(() => {
    if (!pendingVoice || busy || speaker.cast || lastVoice === pendingVoice.id) return;
    lastVoice = pendingVoice.id;
    ask(pendingVoice.text, { viaVoice: true });
    onVoiceHandled();
  }, [pendingVoice, busy, speaker.cast]); // eslint-disable-line react-hooks/exhaustive-deps

  const askInsights = async () => {
    if (busy || speaker.cast || !ready) return;
    setBusy(true);
    const mid = uid();
    setMessages((list) => [...list,
      { id: uid(), role: 'user', parts: [{ text: 'What have you learned from our incidents?', masked: false }], at: now() },
      { id: mid, role: 'mira', kind: 'insight', status: 'thinking', at: now() },
    ]);
    try {
      const data = await api.insights();
      const sentences = splitSentences(data.lessons || 'I have not found a pattern yet.');
      patch(mid, { status: 'done', ...data, sentences });
      await speaker.speakSentences('MIRA · what I have learned', sentences, (i) => setReading(i < 0 ? null : { id: mid, i }));
    } catch (err) {
      patch(mid, { status: 'error', error: err.message });
    } finally {
      setBusy(false);
    }
  };

  const readFull = async (m) => {
    if (busy || speaker.cast) return;
    setBusy(true);
    try {
      await speaker.speakSentences('MIRA · full reply', m.sentences, (i) => setReading(i < 0 ? null : { id: m.id, i }));
    } finally {
      setBusy(false);
    }
  };

  const feedback = async (m, worked) => {
    patch(m.id, { feedback: 'saving' });
    try {
      await api.feedback(m.incidentId, worked);
      patch(m.id, { feedback: worked ? 'worked' : 'failed' });
      toast(worked ? 'Saved. MIRA will recommend this fix first next time.' : 'Saved. MIRA will stop suggesting this fix.');
    } catch (err) {
      patch(m.id, { feedback: null });
      toast(err.message);
    }
  };

  const started = messages.length > 0;
  const firstName = user.name.split(' ')[0];

  return (
    <div className="console">
      <div className="c-scroll" ref={scrollRef}>
        {!started ? (
          <div className="c-hello">
            <div className="c-orb"><span className="halo" /><span className="halo h2" />{!speaker.cast && <Orb />}</div>
            <p className="c-greet">{greeting()}, {firstName}</p>
            {ready ? (
              <>
                <h2>What's breaking at <em>{workspace.name}</em>?</h2>
                <p className="c-sub">Describe the alert or paste the error. MIRA checks your {workspace.incidents} past incidents, tells you the fix out loud and warns you about fixes that failed before.</p>
                <div className="c-sugs">
                  {suggestions.map((s, i) => (
                    <button key={s.title} className="c-sug" style={{ animationDelay: `${0.1 + i * 0.07}s` }} onClick={() => ask(s.prompt)}>
                      <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{SUG_ICONS[i % 3]}</svg></span>
                      <span className="tx"><b>{s.title}</b><small>{s.hint}</small></span>
                      <span className="arr">→</span>
                    </button>
                  ))}
                  <button className="c-sug learn" style={{ animationDelay: '.31s' }} onClick={askInsights}>
                    <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg></span>
                    <span className="tx"><b>What has MIRA learned?</b><small>Patterns across your incidents</small></span>
                    <span className="arr">→</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Import your incident history to start</h2>
                <p className="c-sub">MIRA answers outages only from {workspace.name}'s own past incidents. Upload your incident exports or post-mortems once, and it's ready to help. You can still say hi in the meantime.</p>
                <button className="a-btn primary c-cta" onClick={() => navigate('/app/sources')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
                  Import incident history
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="c-thread">
            {messages.map((m) => (m.role === 'system' ? (
              <div key={m.id} className="sys-note"><span>↺ {m.text}</span></div>
            ) : m.role === 'user' ? (
              <div key={m.id} className="u-msg">
                <div className="u-bub">
                  {m.parts.map((p, i) => (p.masked ? <span key={i} className="mask">{p.text}</span> : <span key={i}>{p.text}</span>))}
                </div>
                <div className="u-meta">
                  {m.viaVoice && <span className="said">🎙 spoken</span>}
                  {firstName} · {m.at}
                  {m.parts.some((p) => p.masked) && <span className="masked">🔒 {m.parts.filter((p) => p.masked).length} private value(s) hidden</span>}
                </div>
              </div>
            ) : m.kind === 'chat' || (m.kind === 'pending' && m.status === 'thinking') ? (
              <ChatReply key={m.id} m={m} />
            ) : (
              <Answer key={m.id} m={m} reading={reading?.id === m.id ? reading.i : -1}
                busy={busy} onRead={() => readFull(m)} onFeedback={(w) => feedback(m, w)} onRetry={() => retry(m)} />
            )))}
          </div>
        )}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <div className="cmp-box">
          {followUp && (
            <div className="fu-chip">
              <span className="fu-ic">↳</span>
              <span className="fu-t">Talking about: <b>{followUp.alert.length > 70 ? `${followUp.alert.slice(0, 68)}…` : followUp.alert}</b></span>
              <button type="button" onClick={() => setFollowUp(null)} aria-label="Start a new topic" title="Start a new topic">✕</button>
            </div>
          )}
          <textarea ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            aria-label="Message MIRA"
            placeholder={!ready ? 'Say hi, or import your incident history to ask about outages…'
              : followUp ? 'Ask a follow-up, e.g. "How do I check step 2?", or just chat…'
                : `Describe what's breaking at ${workspace.name}, or just say hi…`} />
          <div className="cmp-row">
            {started && ready && <button type="button" className="cmp-chip" onClick={askInsights} disabled={busy}>✦ What has MIRA learned?</button>}
            <span className="cmp-chip safe" title="Card numbers, UPI IDs, emails and phone numbers are hidden before MIRA reads them">🔒 Private data hidden</span>
            <span className="cmp-hint">{Listener.supported ? 'Enter to send · Ctrl+Space to talk' : 'Enter to send'}</span>
            <button type="button" className={`cmp-mic${listen?.mode === 'command' ? ' on' : ''}`}
              onClick={() => (listen?.mode === 'command' ? Listener.finish() : Listener.capture('mic'))}
              disabled={!Listener.supported || busy || Boolean(speaker.cast)}
              aria-label={listen?.mode === 'command' ? 'Stop and send' : 'Speak to MIRA'}
              title={Listener.supported ? 'Speak to MIRA (Ctrl+Space)' : 'Voice input works in Chrome or Edge'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </button>
            <button className="cmp-send" disabled={busy || !input.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/** A casual reply: a light chat bubble instead of an incident card. Shows typing dots while MIRA reads the message. */
function ChatReply({ m }) {
  const thinking = m.status === 'thinking';
  return (
    <div className="b-msg">
      <OrbAvatar className="sm" />
      <div className="b-body">
        <div className={`b-bub${thinking ? ' typing' : ''}`}>
          {thinking ? <span className="dots3" aria-label="MIRA is typing"><i /><i /><i /></span> : <span className="swap">{m.reply}</span>}
        </div>
        {m.action === 'import' && !thinking && (
          <button className="a-btn primary b-act" onClick={() => navigate('/app/sources')}>Import incident history</button>
        )}
        <div className="u-meta">MIRA · {m.at}</div>
      </div>
    </div>
  );
}

// How the answer relates to the company's own history.
const MATCH = {
  known: { label: 'Seen before', title: 'Based on how your team fixed this before' },
  partial: { label: 'Similar incidents', title: 'Based on related past incidents plus general practice' },
  new: { label: 'New issue · general approach', title: "Nothing like this in your history yet, so this is MIRA's own engineering approach" },
};

function Answer({ m, reading, busy, onRead, onFeedback, onRetry }) {
  const [compare, setCompare] = useState(false);
  const head = (
    <header className="ans-head">
      <OrbAvatar />
      <b>MIRA</b>
      {m.status === 'done' && MATCH[m.match] && <span className={`match2 ${m.match}`} title={MATCH[m.match].title}>{MATCH[m.match].label}</span>}
      <time>{m.at}</time>
    </header>
  );

  let body;
  if (m.status === 'error') {
    body = (
      <div className="swap" key="error">
        <div className="ans-err">{m.error}</div>
        {m.question && m.retryable && (
          <footer className="ans-acts"><button className="a-btn primary" onClick={onRetry} disabled={busy}>↻ Try again</button></footer>
        )}
      </div>
    );
  } else if (m.status !== 'done') {
    const steps = m.kind === 'insight'
      ? [['Looking for patterns in your incidents', m.status === 'thinking' ? 'active' : 'done']]
      : [
        ['Hid private data', 'done'],
        [m.isFollowUp ? 'Checking my last answer and your past incidents' : 'Searching your past incidents', m.status === 'thinking' ? 'active' : 'done'],
        ...(m.status !== 'thinking' ? [[`Found ${m.memoriesFound} related incident${m.memoriesFound === 1 ? '' : 's'}`, 'done']] : []),
        ...(m.status === 'speaking' ? [[m.isFollowUp ? 'Explaining' : 'Speaking the short answer', 'active']] : []),
      ];
    body = (
      <div className="swap" key="working">
        <ol className="steps2">
          {steps.map(([label, st]) => <li key={label} className={st}><i />{label}</li>)}
        </ol>
        {m.used?.length > 0 && <Recall used={m.used} />}
      </div>
    );
  } else {
    const text = (
      <p className={m.kind === 'insight' ? 'ans-full lessons' : 'ans-full'}>
        {m.sentences.map((s, i) => <span key={i} className={i === reading ? 'now' : undefined}>{s} </span>)}
      </p>
    );
    body = m.kind === 'insight' ? (
      <div className="swap" key="done">
        <div className="ans-label">What I have learned</div>
        {text}
        <div className="recall">
          {m.causes?.slice(0, 3).map((c) => <span key={c.label} className="rchip"><b>{c.count}×</b>{c.label}</span>)}
          {m.risky?.slice(0, 2).map((r) => <span key={r.service} className="rchip risk"><b>RISK</b>{r.service}</span>)}
        </div>
        <footer className="ans-acts"><button className="a-btn primary" onClick={onRead} disabled={busy}><Speaker />Read again</button></footer>
      </div>
    ) : (
      <div className="swap" key="done">
        <Recall used={m.used} feedback={m.feedback} />
        <div className="ans-short"><span>{m.followUp ? 'Answer' : 'In short'}</span><p>{m.brief}</p></div>
        {m.guide && (
          <FixGuide guide={m.guide} label={m.followUp ? 'STEP BY STEP' : 'FIX PLAN'}
            heading={m.alert?.length > 90 ? `${m.alert.slice(0, 88)}…` : m.alert} fileName={`mira-fix-plan-${m.incidentId}`} />
        )}
        <div className="ans-label">Full reply</div>
        {text}
        <footer className="ans-acts">
          <button className="a-btn primary" onClick={onRead} disabled={busy}><Speaker />Read full reply</button>
          {m.generic && <button className="a-btn" onClick={() => setCompare((v) => !v)}>{compare ? 'Hide comparison' : 'Compare with a generic answer'}</button>}
          <span className="grow" />
          <button className="a-btn good" onClick={() => onFeedback(true)} disabled={Boolean(m.feedback)}>✓ Fix worked</button>
          <button className="a-btn bad" onClick={() => onFeedback(false)} disabled={Boolean(m.feedback)}>✕ Didn't work</button>
        </footer>
        {compare && (
          <div className="ans-cmp swap">
            <span>An assistant without your history would say</span>
            <p>{m.generic || 'No answer.'}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <article className={`ans${m.status !== 'done' && m.status !== 'error' ? ' working' : ''}`}>
      {head}
      <Smooth>{body}</Smooth>
    </article>
  );
}

function Recall({ used = [], feedback }) {
  if (!used.length && !feedback) return null;
  return (
    <div className="recall">
      <span className="rl">Based on</span>
      {used.map((u, i) => (
        <span key={i} className={`rchip${u.label === 'LESSON' ? ' lesson' : ''}`} style={{ animationDelay: `${i * 0.1}s` }}><b>{u.label}</b>{u.detail}</span>
      ))}
      {(feedback === 'worked' || feedback === 'failed') && (
        <span className="rchip new"><b>SAVED</b>{feedback === 'worked' ? 'fix worked' : 'fix failed'}</span>
      )}
    </div>
  );
}
