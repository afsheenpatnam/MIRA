import { useEffect, useState } from 'react';
import AuthLayout from '../components/AuthLayout.jsx';
import { OrbMark } from '../components/Orb.jsx';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already logged in: go straight to the workspace.
  useEffect(() => {
    if (api.hasToken()) api.me().then(() => navigate('/app', { replace: true })).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(email, password);
      navigate('/app');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Your company's memory, on call.">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark"><OrbMark />MIRA</div>
        <h2>Log in to your workspace</h2>
        <p className="sub">Welcome back.</p>

        <label htmlFor="email">Work email</label>
        <div className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>

        <label htmlFor="password">Password</label>
        <div className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </div>

        <div className="login-err" role="alert">{error}</div>
        <button className="login-go" disabled={busy}>
          {busy ? <><span className="spin" />Opening workspace…</> : <>Log in <span>→</span></>}
        </button>

        <p className="login-switch">New to MIRA? <a href="/signup" onClick={(e) => { e.preventDefault(); navigate('/signup'); }}>Create your workspace</a></p>
      </form>
    </AuthLayout>
  );
}
