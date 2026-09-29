import { useEffect, useRef, useState } from 'react';
import Orb, { OrbAvatar } from './Orb.jsx';
import Smooth from './Smooth.jsx';
import { adminApi } from '../lib/adminApi.js';
import { splitSentences } from '../lib/voice.js';
import { Listener } from '../lib/listener.js';

let nextId = 1;
const uid = () => `a${nextId++}`;
let lastPending = null;
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export const BRIEF_ME = 'What happened on the platform today?';

const QUICK = ['Which companies need attention?', 'Any security concerns today?', 'What changed since yesterday?'];

const Speaker = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></svg>;

/** MIRA for the platform admin: spoken briefings and answers built from usage counts and the audit ledger. */
export default function AdminMira({ admin, speaker, messages, setMessages, listen, pending, onPendingHandled }) {
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [reading, setReading] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const patch = (id, changes) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  const recentLines = () => messages.slice(-6)
    .map((m) => (m.role === 'user' ? { role: 'user', text: m.text } : { role: 'mira', text: m.brief || '' }))
    .filter((l) => l.text);

  const run = async (mid, text, recent) => {
    setBusy(true);
    try {
      const data = await adminApi.ask(text, recent);
      if (data.type === 'chat') {
        patch(mid, { kind: 'chat', status: 'speaking', brief: data.brief, suggest: data.suggest });
        await speaker.speakBrief('MIRA', data.brief);
        patch(mid, { status: 'done' });
        return;
      }
      patch(mid, { kind: 'answer', status: 'speaking', ...data });
      await speaker.speakBrief('MIRA · briefing', data.brief);
      patch(mid, { status: 'done', sentences: splitSentences(data.full || data.brief) });
    } catch (err) {
      patch(mid, { kind: 'answer', status: 'error', error: err.message });
    } finally {
      setBusy(false);
    }
  };

  const ask = (raw, { viaVoice = false } = {}) => {
    const text = (raw || '').trim();
    if (!text || busy || speaker.cast) return false;
    setInput('');
    const mid = uid();
    const recent = recentLines();
    setMessages((list) => [...list,
      { id: uid(), role: 'user', text, at: now(), viaVoice },
      { id: mid, role: 'mira', kind: 'pending', status: 'thinking', at: now(), question: text, recent },
    ]);
    run(mid, text, recent);
    return true;
  };

  const retry = (m) => {
    if (busy || speaker.cast) return;
    patch(m.id, { kind: 'pending', status: 'thinking', error: '' });
    run(m.id, m.question, m.recent);
  };

  const readFull = async (m) => {
    if (busy || speaker.cast) return;
    setBusy(true);
    try {
      await speaker.speakSentences('MIRA · full briefing', m.sentences, (i) => setReading(i < 0 ? null : { id: m.id, i }));
    } finally {
      setBusy(false);
    }
  };

  // Anything said through the mic arrives here. Each one is asked once, even if React runs this effect twice.
  useEffect(() => {
    if (!pending || busy || speaker.cast || lastPending === pending.id) return;
    lastPending = pending.id;
    ask(pending.text, { viaVoice: pending.viaVoice });
    onPendingHandled();
  }, [pending, busy, speaker.cast]); // eslint-disable-line react-hooks/exhaustive-deps

  const started = messages.length > 0;
  const firstName = admin.name.split(' ')[0];
  const locked = busy || Boolean(speaker.cast);

  return (
    <div className="console">
      <div className="c-scroll" ref={scrollRef}>
        {!started ? (
          <div className="c-hello">
            <div className="c-orb"><span className="halo" /><span className="halo h2" />{!speaker.cast && <Orb />}</div>
            <p className="c-greet">{greeting()}, {firstName}</p>
            <h2>What happened <em>today</em>?</h2>
            <p className="c-sub">MIRA checks every company and the audit logs, then tells you out loud.</p>
            <button type="button" className="am-go" onClick={() => ask(BRIEF_ME)}>
              <span className="spark">✦</span>Give me today's update<span className="arr">→</span>
            </button>
            <div className="am-next center">
              {QUICK.map((q, i) => <button key={q} type="button" className="am-q" style={{ animationDelay: `${0.25 + i * 0.07}s` }} onClick={() => ask(q)}>{q}</button>)}
            </div>
          </div>
        ) : (
          <div className="c-thread">
            {messages.map((m) => (m.role === 'user' ? (
              <div key={m.id} className="u-msg">
                <div className="u-bub">{m.text}</div>
                <div className="u-meta">{m.viaVoice && <span className="said">🎙 spoken</span>}{firstName} · {m.at}</div>
              </div>
            ) : m.kind === 'chat' || m.kind === 'pending' ? (
              <div key={m.id} className="b-msg">
                <OrbAvatar className="sm" />
                <div className="b-body">
                  <div className={`b-bub${m.kind === 'pending' ? ' typing' : ''}`}>
                    {m.kind === 'pending'
                      ? <span className="dots3" aria-label="MIRA is checking the platform"><i /><i /><i /></span>
                      : <span className="swap">{m.brief}</span>}
                  </div>
                  {m.status === 'done' && <Suggest items={m.suggest} onAsk={ask} disabled={locked} />}
                  <div className="u-meta">MIRA · {m.at}</div>
                </div>
              </div>
            ) : (
              <Briefing key={m.id} m={m} reading={reading?.id === m.id ? reading.i : -1} locked={locked}
                onRead={() => readFull(m)} onAsk={ask} onRetry={() => retry(m)} />
            )))}
          </div>
        )}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <div className="cmp-box">
          <textarea ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            aria-label="Ask MIRA about the platform"
            placeholder={'Ask MIRA about today, a company, or security…'} />
          <div className="cmp-row">
            {started && <button type="button" className="cmp-chip" onClick={() => ask(BRIEF_ME)} disabled={locked}>✦ Today's update</button>}
            <span className="cmp-hint">{Listener.supported ? 'Enter to send · Ctrl+Space to talk' : 'Enter to send'}</span>
            <button type="button" className={`cmp-mic${listen?.mode === 'command' ? ' on' : ''}`}
              onClick={() => (listen?.mode === 'command' ? Listener.finish() : Listener.capture('mic'))}
              disabled={!Listener.supported || locked}
              aria-label={listen?.mode === 'command' ? 'Stop and send' : 'Speak to MIRA'}
              title={Listener.supported ? 'Speak to MIRA (Ctrl+Space)' : 'Voice input works in Chrome or Edge'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </button>
            <button className="cmp-send" disabled={locked || !input.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Suggest({ items, onAsk, disabled }) {
  if (!items?.length) return null;
  return (
    <div className="am-next">
      {items.map((s, i) => (
        <button key={s} type="button" className="am-q" style={{ animationDelay: `${i * 0.06}s` }} onClick={() => onAsk(s)} disabled={disabled}>{s}</button>
      ))}
    </div>
  );
}

/** A spoken briefing: key figures, the short answer, then the full reply that can be read aloud. */
function Briefing({ m, reading, locked, onRead, onAsk, onRetry }) {
  let body;
  if (m.status === 'error') {
    body = (
      <div className="swap" key="error">
        <div className="ans-err">{m.error}</div>
        <footer className="ans-acts"><button className="a-btn primary" onClick={onRetry} disabled={locked}>↻ Try again</button></footer>
      </div>
    );
  } else {
    body = (
      <div className="swap" key="body">
        {m.points?.length > 0 && (
          <div className="am-points">
            {m.points.map((p, i) => (
              <div key={p.label} className={`am-pt ${p.tone}`} style={{ animationDelay: `${i * 0.07}s` }}>
                <span>{p.label}</span><b>{p.value}</b>
              </div>
            ))}
          </div>
        )}
        <div className="ans-short"><span>In short</span><p>{m.brief}</p></div>
        {m.status === 'done' && (
          <div className="swap">
            <div className="ans-label">Full briefing</div>
            <p className="ans-full">{m.sentences.map((s, i) => <span key={i} className={i === reading ? 'now' : undefined}>{s} </span>)}</p>
            <footer className="ans-acts">
              <button className="a-btn primary" onClick={onRead} disabled={locked}><Speaker />Read full briefing</button>
            </footer>
            <Suggest items={m.suggest} onAsk={onAsk} disabled={locked} />
          </div>
        )}
      </div>
    );
  }
  return (
    <article className={`ans${m.status === 'speaking' ? ' working' : ''}`}>
      <header className="ans-head">
        <OrbAvatar />
        <b>MIRA</b>
        <span className="match2 partial">Today's update</span>
        <time>{m.at}</time>
      </header>
      <Smooth>{body}</Smooth>
    </article>
  );
}
