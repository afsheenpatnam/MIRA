import Orb from './Orb.jsx';
import { navigate } from '../lib/router.js';

const POINTS = [
  ['Answers from your own incidents', 'Recalls how your team fixed similar outages.'],
  ['Private by design', 'Each company gets its own workspace. Private data is hidden.'],
  ['Voice and visual fix plans', 'Hear the fix, then follow it step by step.'],
];

/** Shared left panel for the login and sign-up pages. */
export default function AuthLayout({ title, children }) {
  return (
    <div className="login">
      <aside className="login-brand">
        <a className="login-back" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>← Back to MIRA</a>
        <div className="login-orb"><Orb /></div>
        <h1>{title}</h1>
        <ul className="login-points">
          {POINTS.map(([b, s], i) => (
            <li key={b} style={{ animationDelay: `${0.2 + i * 0.08}s` }}><span className="tick">✓</span><div><b>{b}</b><small>{s}</small></div></li>
          ))}
        </ul>
      </aside>
      <main className="login-panel">{children}</main>
    </div>
  );
}
