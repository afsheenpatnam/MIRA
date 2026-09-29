import { useCallback, useEffect, useRef, useState } from 'react';
import Orb, { OrbMark } from '../components/Orb.jsx';
import Cast from '../components/Cast.jsx';
import Console from '../components/Console.jsx';
import History from '../components/History.jsx';
import Insights from '../components/Insights.jsx';
import Sources from '../components/Sources.jsx';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';
import { useSpeaker } from '../lib/useSpeaker.js';
import { Voice } from '../lib/voice.js';
import { Listener } from '../lib/listener.js';
import ListenOverlay from '../components/ListenOverlay.jsx';
import { threadToMessages } from '../lib/thread.js';

const WAKE_KEY = 'mira.handsfree';
const readWake = () => { try { return localStorage.getItem(WAKE_KEY) === '1'; } catch { return false; } };
const saveWake = (on) => { try { localStorage.setItem(WAKE_KEY, on ? '1' : '0'); } catch { /* storage blocked */ } };

const VIEWS = [
  { id: 'console', path: '/app', label: 'Console', hint: 'Ask about an outage',
    icon: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /> },
  { id: 'history', path: '/app/history', label: 'History', hint: 'Incidents and fixes',
    icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
  { id: 'insights', path: '/app/insights', label: 'Insights', hint: 'Patterns and risks',
    icon: <path d="M5 20V11M12 20V5M19 20v-6" /> },
  { id: 'sources', path: '/app/sources', label: 'Data sources', hint: 'Import and connect',
    icon: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></> },
];

const initials = (name = '') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function Workspace({ path }) {
  const view = VIEWS.find((v) => v.path === path) || VIEWS[0];
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(Voice.muted);
  const [messages, setMessages] = useState([]);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);
  const speaker = useSpeaker();

  const load = useCallback(() => {
    setError('');
    Promise.all([api.me(), api.workspace()])
      .then(([m, workspace]) => setMe({ user: m.user, workspace }))
      .catch((err) => (err.status === 401 ? navigate('/login', { replace: true }) : setError(err.message)));
  }, []);
  const refreshWorkspace = useCallback(() => {
    api.workspace().then((workspace) => setMe((m) => (m ? { ...m, workspace } : m))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!api.hasToken()) navigate('/login', { replace: true });
    else load();
  }, [load]);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 3400);
  }, []);

  const logout = () => {
    Voice.stop();
    api.logout();
    navigate('/');
  };
  const toggleVoice = () => {
    Voice.muted = !Voice.muted;
    if (Voice.muted) Voice.stop();
    setMuted(Voice.muted);
    toast(Voice.muted ? 'Voice off. MIRA shows subtitles only.' : 'Voice on.');
  };

  /* ---------- talking to MIRA ---------- */
  const [listen, setListen] = useState(Listener.state);
  const [wakeOn, setWakeOn] = useState(false);
  const [pendingVoice, setPendingVoice] = useState(null);
  const viewRef = useRef(view.id);
  viewRef.current = view.id;
  const castRef = useRef(null);
  castRef.current = speaker.cast;

  useEffect(() => Listener.subscribe(setListen), []);
  useEffect(() => {
    Listener.handlers.onCommand = (text, source) => {
      setPendingVoice({ text, source, id: Date.now() });
      if (viewRef.current !== 'console') navigate('/app');
    };
    Listener.handlers.onNothing = (source) => {
      if (source !== 'followup') toast("I didn't catch that. Try again, or type your question.");
    };
    Listener.handlers.onError = (msg) => {
      toast(msg);
      if (!Listener.wakeOn) { setWakeOn(false); saveWake(false); }
    };
    return () => {
      Listener.handlers = { onCommand: null, onNothing: null, onError: null };
      Listener.stopWake();
      Listener.cancel();
    };
  }, [toast]);
  // Hands-free stays on between visits if it was on before.
  useEffect(() => {
    if (Listener.supported && readWake()) { Listener.startWake(); setWakeOn(true); }
  }, []);
  // Ctrl+Space: talk without clicking.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey && e.code === 'Space')) return;
      e.preventDefault();
      if (Listener.supported && !castRef.current && Listener.state.mode !== 'command') Listener.capture('shortcut');
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // Reopens a past conversation from History in the Console, ready to continue.
  const [resume, setResume] = useState(null);
  const openThread = async (id) => {
    if (speaker.cast) return;
    try {
      const items = await api.thread(id);
      const last = items[items.length - 1];
      setMessages(threadToMessages(items));
      setResume({ incidentId: last.id, alert: last.alert, token: Date.now() });
      navigate('/app');
    } catch (err) {
      toast(err.message);
    }
  };

  const toggleWake = () => {
    if (!Listener.supported) { toast('Voice input works in Chrome or Edge.'); return; }
    if (wakeOn) {
      Listener.stopWake();
      setWakeOn(false);
      saveWake(false);
      toast('Hands-free off.');
    } else {
      Listener.startWake();
      setWakeOn(true);
      saveWake(true);
      toast('Hands-free on. Say "Hey MIRA" and then your question.');
    }
  };

  if (!me) {
    return (
      <div className="ws-loading">
        <div className="ws-loading-orb"><Orb /></div>
        {error ? (
          <>
            <p className="err-text">{error}</p>
            <div className="row">
              <button className="a-btn primary" onClick={load}>Try again</button>
              <button className="a-btn" onClick={logout}>Back to home</button>
            </div>
          </>
        ) : <p>Opening your workspace…</p>}
      </div>
    );
  }

  const { user, workspace } = me;

  return (
    <div className="shell">
      <aside className="side2">
        <a className="side-logo" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}><OrbMark />MIRA</a>

        <div className="co-card">
          <div className="co-top">
            <span className="co-glyph">{workspace.glyph}</span>
            <div><b>{workspace.name}</b><small>{workspace.sectorLabel}</small></div>
          </div>
          <span className="co-lock"><i />Private workspace</span>
        </div>

        <nav className="side-nav" aria-label="Workspace">
          {VIEWS.map((v) => (
            <a key={v.id} href={v.path} className={v.id === view.id ? 'on' : ''} aria-current={v.id === view.id ? 'page' : undefined} aria-label={v.label}
              onClick={(e) => { e.preventDefault(); if (!speaker.cast) navigate(v.path); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{v.icon}</svg>
              <span><b>{v.label}</b><small>{v.hint}</small></span>
            </a>
          ))}
        </nav>

        <div className="side-status">
          <span className={`live${workspace.incidents ? '' : ' idle'}`} />
          {workspace.incidents ? 'Incidents learned' : 'No history imported'}
          <b>{workspace.incidents || ''}</b>
        </div>

        <div className="me">
          <span className="me-av">{initials(user.name)}</span>
          <span className="me-t"><b>{user.name}</b><small>{user.role}</small></span>
          <button className="me-out" onClick={logout} aria-label="Log out" title="Log out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></svg>
          </button>
        </div>
      </aside>

      <main className="main2">
        <header className="top2">
          <div>
            <h1>{view.label}</h1>
            <p>{workspace.name} · {view.hint}</p>
          </div>
          <div className="top2-right">
            {workspace.incidents > 0 && <span className="pill2"><i />{workspace.incidents} incidents</span>}
            <button className={`wake2${wakeOn ? ' on' : ''}${listen.mode === 'wake' ? ' live' : ''}`} onClick={toggleWake} aria-pressed={wakeOn}
              title={wakeOn ? 'Hands-free is on. Say "Hey MIRA". Click to turn off.' : 'Turn on hands-free: say "Hey MIRA" to talk'}>
              <span className="wk-dot" />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              <span className="wk-t">{wakeOn ? 'Hey MIRA · on' : 'Hey MIRA'}</span>
            </button>
            <button className={`icon2${muted ? ' off' : ''}`} onClick={toggleVoice} aria-label={muted ? 'Turn voice on' : 'Turn voice off'} title={muted ? 'Voice off' : 'Voice on'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" />{muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}</svg>
            </button>
            {view.id === 'console' && messages.length > 0 && (
              <button className="a-btn" onClick={() => { if (!speaker.cast) setMessages([]); }}>+ New incident</button>
            )}
          </div>
        </header>

        <div className="view2" key={view.id}>
          {view.id === 'console' && (
            <Console user={user} workspace={workspace} speaker={speaker} messages={messages} setMessages={setMessages}
              onAnswered={refreshWorkspace} toast={toast} listen={listen} resume={resume}
              pendingVoice={pendingVoice} onVoiceHandled={() => setPendingVoice(null)} />
          )}
          {view.id === 'history' && <History workspace={workspace} onOpen={openThread} />}
          {view.id === 'insights' && <Insights workspace={workspace} speaker={speaker} />}
          {view.id === 'sources' && <Sources workspace={workspace} toast={toast} onImported={refreshWorkspace} />}
        </div>

        <Cast speaker={speaker} />
        {!speaker.cast && <ListenOverlay state={listen} />}
      </main>
      <div className={`toast${toastMsg ? ' show' : ''}`} role="status" aria-live="polite">{toastMsg}</div>
    </div>
  );
}
