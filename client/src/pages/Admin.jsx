import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrbMark } from '../components/Orb.jsx';
import Cast from '../components/Cast.jsx';
import ListenOverlay from '../components/ListenOverlay.jsx';
import AdminMira from '../components/AdminMira.jsx';
import AuditLog from '../components/AuditLog.jsx';
import { adminApi } from '../lib/adminApi.js';
import { navigate } from '../lib/router.js';
import { useSpeaker } from '../lib/useSpeaker.js';
import { Voice } from '../lib/voice.js';
import { Listener } from '../lib/listener.js';

const date = (d) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
const ago = (d) => {
  if (!d) return 'Never';
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
const rate = (w, f) => (w + f ? `${Math.round((w / (w + f)) * 100)}%` : '–');

function Tile({ label, value, sub }) {
  return <div className="adm-tile"><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}

/* ---------- login ---------- */

function AdminLogin({ onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await adminApi.login(email, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="adm-login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark"><OrbMark />MIRA <span className="adm-badge">Admin</span></div>
        <h2>Platform admin</h2>
        <p className="sub">For the team running MIRA. Company accounts can't log in here.</p>
        <label htmlFor="a-email">Admin email</label>
        <div className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>
          <input id="a-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <label htmlFor="a-pass">Password</label>
        <div className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <input id="a-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="login-err" role="alert">{error}</div>
        <button className="login-go" disabled={busy}>{busy ? <><span className="spin" />Checking…</> : <>Log in <span>→</span></>}</button>
        <p className="login-switch"><a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>← Back to MIRA</a></p>
      </form>
    </div>
  );
}

/* ---------- companies ---------- */

function Companies({ onOpen }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { adminApi.companies().then(setList).catch((e) => setError(e.message)); }, []);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list || []).filter((c) => !s || [c.name, c.sectorLabel, c.owner?.email, c.owner?.name].some((v) => v?.toLowerCase().includes(s)));
  }, [list, q]);
  if (error) return <div className="pane-pad"><div className="ans-err">{error}</div></div>;
  if (!list) return <div className="pane-pad"><div className="skeleton" /><div className="skeleton" /></div>;
  return (
    <div className="pane-pad">
      {list.length > 5 && (
        <div className="hist-bar">
          <input className="search2" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies or owners…" aria-label="Search companies" />
        </div>
      )}
      {list.length === 0 ? <div className="empty2"><b>No companies yet</b><p>Companies appear here as soon as they sign up.</p></div> : (
        <div className="adm-table">
          <table>
            <thead><tr><th>Company</th><th>Owner</th><th className="num">Incidents</th><th className="num">Questions</th><th>Last active</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} onClick={() => onOpen(c.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(c.id); }}>
                  <td><span className="cell-co"><span className="co-glyph sm">{c.name[0]?.toUpperCase()}</span><span><b>{c.name}</b><small>{c.sectorLabel}</small></span></span></td>
                  <td className="muted">{c.owner?.email || '–'}</td>
                  <td className="num">{c.imported}</td>
                  <td className="num">{c.questions}</td>
                  <td className="muted">{ago(c.lastActive)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CompanyDetail({ id, onBack, onDeleted }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState('');
  useEffect(() => { adminApi.company(id).then(setData).catch((e) => setError(e.message)); }, [id]);

  if (error) return <div className="pane-pad"><div className="ans-err">{error}</div><button className="a-btn" style={{ marginTop: 12 }} onClick={onBack}>← All companies</button></div>;
  if (!data) return <div className="pane-pad"><div className="skeleton" /><div className="skeleton" /></div>;
  const c = data.company;

  const remove = async () => {
    setDeleting(true);
    setDelError('');
    try {
      await adminApi.deleteCompany(id, confirm);
      onDeleted(c.name);
    } catch (e) {
      setDelError(e.message);
      setDeleting(false);
    }
  };

  return (
    <div className="pane-pad">
      <button className="a-btn adm-back" onClick={onBack}>← All companies</button>
      <header className="adm-head">
        <span className="co-glyph">{c.name[0]?.toUpperCase()}</span>
        <div>
          <h2>{c.name}</h2>
          <p>{c.sectorLabel} · joined {date(c.createdAt)} · own database and memory bank</p>
        </div>
      </header>
      <div className="adm-tiles four">
        <Tile label="Incidents learned" value={c.imported} sub={`${c.files} file${c.files === 1 ? '' : 's'} imported`} />
        <Tile label="Questions asked" value={c.questions} sub={`${c.conversations} conversations`} />
        <Tile label="Fix success rate" value={rate(c.worked, c.failed)} sub={`${c.worked} worked · ${c.failed} failed`} />
        <Tile label="Last active" value={ago(c.lastActive)} />
      </div>
      <div className="adm-grid even">
        <section className="ins-card"><h3>People</h3><p>{data.users.length} account{data.users.length === 1 ? '' : 's'}</p>
          <ul className="list2">{data.users.map((u) => <li key={u.email} className="adm-li"><b>{u.name}</b><small>{u.email} · {u.role}</small></li>)}</ul>
        </section>
        <section className="ins-card"><h3>Imports</h3><p>Files added to this company's history</p>
          {data.imports.length === 0 ? <p className="hint2">Nothing imported yet.</p> : (
            <ul className="list2">{data.imports.slice(0, 6).map((s, i) => <li key={i} className="adm-li"><b>{s.name}</b><small>{s.incidents} incidents · {date(s.at)}</small></li>)}</ul>
          )}
        </section>
      </div>
      <section className="adm-danger">
        <h3>Delete this company</h3>
        <p>Permanently removes {c.name}'s users, its database and its memory. This cannot be undone.</p>
        <div className="row">
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={`Type ${c.name} to confirm`} aria-label="Type the company name to confirm" />
          <button className="a-btn danger" disabled={confirm !== c.name || deleting} onClick={remove}>{deleting ? 'Deleting…' : 'Delete company'}</button>
        </div>
        {delError && <p className="del-err">{delError}</p>}
      </section>
    </div>
  );
}

/* ---------- shell ---------- */

const VIEWS = [
  { id: 'today', label: 'Today', hint: 'Ask MIRA what happened', icon: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /> },
  { id: 'companies', label: 'Companies', hint: 'Every workspace', icon: <><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18" /></> },
  { id: 'audit', label: 'Audit logs', hint: 'Who did what, and when', icon: <><path d="M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /></> },
];

export default function Admin() {
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(adminApi.hasToken());
  const [view, setView] = useState('today');
  const [company, setCompany] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);
  const speaker = useSpeaker();
  const [muted, setMuted] = useState(Voice.muted);
  const [messages, setMessages] = useState([]);
  // Words spoken through the microphone, waiting to be asked in Today.
  const [pending, setPending] = useState(null);
  const [listen, setListen] = useState(Listener.state);
  const castRef = useRef(null);
  castRef.current = speaker.cast;
  const adminRef = useRef(null);
  adminRef.current = admin;

  useEffect(() => {
    if (!adminApi.hasToken()) return;
    adminApi.me().then(setAdmin).catch(() => {}).finally(() => setChecking(false));
  }, []);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 3400);
  }, []);
  const go = (id) => { if (!speaker.cast) { setView(id); setCompany(null); } };

  // Talking to MIRA: the mic button or Ctrl+Space.
  useEffect(() => Listener.subscribe(setListen), []);
  useEffect(() => {
    Listener.handlers.onCommand = (text) => { setPending({ text, viaVoice: true, id: Date.now() }); setView('today'); setCompany(null); };
    Listener.handlers.onNothing = (source) => { if (source !== 'followup') toast("I didn't catch that. Try again, or type your question."); };
    Listener.handlers.onError = (msg) => toast(msg);
    const onKey = (e) => {
      if (!(e.ctrlKey && e.code === 'Space')) return;
      e.preventDefault();
      if (adminRef.current && Listener.supported && !castRef.current && Listener.state.mode !== 'command') Listener.capture('shortcut');
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      Listener.handlers = { onCommand: null, onNothing: null, onError: null };
      Listener.cancel();
    };
  }, [toast]);

  const toggleVoice = () => {
    Voice.muted = !Voice.muted;
    if (Voice.muted) Voice.stop();
    setMuted(Voice.muted);
    toast(Voice.muted ? 'Voice off. MIRA shows subtitles only.' : 'Voice on.');
  };
  const logout = () => { Voice.stop(); adminApi.logout(); setAdmin(null); setMessages([]); setView('today'); };

  if (checking) return <div className="ws-loading"><p>Checking admin session…</p></div>;
  if (!admin) return <AdminLogin onDone={setAdmin} />;

  const current = VIEWS.find((v) => v.id === view);
  return (
    <div className="shell">
      <aside className="side2">
        <a className="side-logo" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}><OrbMark />MIRA <span className="adm-badge">Admin</span></a>
        <nav className="side-nav" aria-label="Admin">
          {VIEWS.map((v) => (
            <a key={v.id} href="#" className={v.id === view ? 'on' : ''} aria-current={v.id === view ? 'page' : undefined} aria-label={v.label}
              onClick={(e) => { e.preventDefault(); go(v.id); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{v.icon}</svg>
              <span><b>{v.label}</b><small>{v.hint}</small></span>
            </a>
          ))}
        </nav>
        <span className="spacer" style={{ flex: 1 }} />
        <div className="me">
          <span className="me-av">{admin.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
          <span className="me-t"><b>{admin.name}</b><small>Platform admin</small></span>
          <button className="me-out" onClick={logout} aria-label="Log out" title="Log out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></svg>
          </button>
        </div>
      </aside>
      <main className="main2">
        <header className="top2">
          <div>
            <h1>{company ? 'Company details' : current.label}</h1>
            <p>{view === 'today' ? new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : current.hint}</p>
          </div>
          <div className="top2-right">
            <button className={`icon2${muted ? ' off' : ''}`} onClick={toggleVoice} aria-label={muted ? 'Turn voice on' : 'Turn voice off'} title={muted ? 'Voice off' : 'Voice on'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" />{muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}</svg>
            </button>
            {view === 'today' && messages.length > 0 && (
              <button className="a-btn" onClick={() => { if (!speaker.cast) setMessages([]); }}>+ New chat</button>
            )}
          </div>
        </header>
        <div className="view2" key={`${view}-${company || ''}`}>
          {view === 'today' && (
            <AdminMira admin={admin} speaker={speaker} messages={messages} setMessages={setMessages} listen={listen}
              pending={pending} onPendingHandled={() => setPending(null)} />
          )}
          {view === 'companies' && !company && <Companies onOpen={setCompany} />}
          {view === 'companies' && company && (
            <CompanyDetail id={company} onBack={() => setCompany(null)}
              onDeleted={(name) => { setCompany(null); toast(`${name} was deleted.`); }} />
          )}
          {view === 'audit' && <AuditLog toast={toast} />}
        </div>
        <Cast speaker={speaker} />
        {!speaker.cast && <ListenOverlay state={listen} hint="Ask about today, companies or security…" />}
      </main>
      <div className={`toast${toastMsg ? ' show' : ''}`} role="status" aria-live="polite">{toastMsg}</div>
    </div>
  );
}
