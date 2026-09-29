import { useState } from 'react';
import AuthLayout from '../components/AuthLayout.jsx';
import { OrbMark } from '../components/Orb.jsx';
import { api } from '../lib/api.js';
import { navigate } from '../lib/router.js';

const SECTORS = [
  { id: 'fintech', label: 'Fintech', hint: 'Payments, UPI, banking',
    icon: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M3 10h18M7 15h3" /></> },
  { id: 'ecommerce', label: 'E-commerce', hint: 'Stores, checkout, delivery',
    icon: <><path d="M4 5h2l2 10h10l2-7H7" /><circle cx="10" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></> },
  { id: 'edtech', label: 'EdTech', hint: 'Classes, exams, results',
    icon: <><path d="M12 4 2 9l10 5 10-5z" /><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></> },
];

export default function Signup() {
  const preset = new URLSearchParams(location.search).get('sector');
  const [sector, setSector] = useState(SECTORS.some((s) => s.id === preset) ? preset : '');
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!sector) { setError('Choose your sector.'); return; }
    setBusy(true);
    setError('');
    try {
      await api.signup({ sector, company, name, email, password });
      navigate('/app/sources');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Give your on-call team a memory.">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark"><OrbMark />MIRA</div>
        <h2>Create your workspace</h2>
        <p className="sub">Your company gets its own private workspace.</p>

        <span className="lbl3" id="sector-label">Your sector</span>
        <div className="sector-pick" role="radiogroup" aria-labelledby="sector-label">
          {SECTORS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={sector === s.id} className={`sec-card${sector === s.id ? ' on' : ''}`}
              onClick={() => { setSector(s.id); setError(''); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
              <b>{s.label}</b>
              <small>{s.hint}</small>
              <span className="dot3" aria-hidden="true" />
            </button>
          ))}
        </div>

        <label htmlFor="company">Company name</label>
        <div className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18" /></svg>
          <input id="company" required maxLength={40} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Your company" autoComplete="organization" />
        </div>

        <label htmlFor="name">Your name</label>
        <div className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          <input id="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="name" />
        </div>

        <label htmlFor="su-email">Work email</label>
        <div className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>
          <input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
        </div>

        <label htmlFor="su-password">Password</label>
        <div className="field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <input id="su-password" type={show ? 'text' : 'password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
          <button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </div>

        <div className="login-err" role="alert">{error}</div>
        <button className="login-go" disabled={busy}>
          {busy ? <><span className="spin" />Creating your workspace…</> : <>Create workspace <span>→</span></>}
        </button>

        <p className="login-switch">Already have an account? <a href="/login" onClick={(e) => { e.preventDefault(); navigate('/login'); }}>Log in</a></p>
      </form>
    </AuthLayout>
  );
}
