import { useEffect, useRef } from 'react';
import { scrollToId } from '../lib/scroll.js';
import { OrbMark } from './Orb.jsx';
import { navigate } from '../lib/router.js';

export function Product() {
  return (
    <section className="sec light" id="product">
      <div className="wrap">
        <div className="center">
          <span className="eyebrow rv"><i>⚡</i>Why MIRA</span>
          <h2 className="t rv d1">Fix outages faster with your team's own history</h2>
        </div>
        <div className="split">
          <div className="visual rv"><div className="dots" /><b>Most outages have happened before. Someone just forgot the fix.</b></div>
          <div className="info rv d1">
            <div>
              <h3>MIRA brings back what your team already learned: the root cause, the fix that worked, and the fix that failed.</h3>
              <p>At 2 AM, an engineer describes the alert. MIRA checks your past incidents, answers out loud in seconds, and shows the fix step by step.</p>
            </div>
            <div className="caps">
              <span className="cap"><i>R</i>Recalls past incidents</span>
              <span className="cap"><i>▶</i>Answers with voice</span>
              <span className="cap"><i>✓</i>Learns from feedback</span>
              <span className="cap"><i>✕</i>Warns about failed fixes</span>
              <span className="cap"><i>🔒</i>Hides private data</span>
              <span className="cap"><i>1</i>Private workspace per company</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const SCRUB = [
  ...'MIRA remembers what your team forgets.'.split(' ').map((w) => [w, false]),
  ...'Every alert, every root cause, every fix that failed,'.split(' ').map((w) => [w, true]),
  ...'recalled in seconds.'.split(' ').map((w) => [w, false]),
];

export function Scrub() {
  const ref = useRef(null);
  useEffect(() => {
    const p = ref.current;
    const spans = [...p.querySelectorAll('span')];
    const update = () => {
      const r = p.getBoundingClientRect();
      const progress = Math.min(Math.max((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35), 0), 1);
      const lit = Math.round(progress * spans.length);
      spans.forEach((s, i) => {
        s.classList.toggle('lit', i < lit && !s.dataset.h);
        s.classList.toggle('hot', i < lit && Boolean(s.dataset.h));
      });
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      spans.forEach((s) => s.classList.add(s.dataset.h ? 'hot' : 'lit'));
      return undefined;
    }
    addEventListener('scroll', update, { passive: true });
    update();
    return () => removeEventListener('scroll', update);
  }, []);
  return (
    <section className="sec">
      <div className="wrap">
        <p className="scrub" ref={ref}>
          {SCRUB.map(([w, hot], i) => <span key={i} data-h={hot ? '1' : undefined}>{w} </span>)}
        </p>
      </div>
    </section>
  );
}

export function Bento() {
  return (
    <section className="sec" id="features" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="center"><span className="eyebrow rv"><i>✦</i>Built for on-call</span><h2 className="t rv d1">Everything an incident needs, in one agent</h2></div>
        <div className="bento">
          <div className="bx b1 rv">
            <h3>Answers from your own incidents</h3>
            <p>Import your ticket exports and post-mortems once. MIRA recalls how your team fixed similar outages, and which fixes did not work.</p>
            <div className="viz feed-viz">
              <span className="fchip"><i>CSV</i>incident exports</span>
              <span className="fchip"><i>PDF</i>post-mortems</span>
              <span className="fchip"><i>⚡</i>live alerts</span>
              <span className="farrow">→</span>
              <span className="forb" />
            </div>
          </div>
          <div className="bx b2 rv d1">
            <h3>Private data never reaches the AI</h3>
            <p>Card numbers, UPI IDs, emails and phone numbers are hidden before anything is stored or read by the model.</p>
            <div className="viz">
              <div className="minilog"><span className="e">ERROR</span> payment failed{'\n'}card=<span className="h">[CARD HIDDEN]</span>  upi=<span className="h">[UPI ID HIDDEN]</span>{'\n'}phone=<span className="h">[PHONE HIDDEN]</span></div>
            </div>
          </div>
          <div className="bx b3 rv"><h3>Speaks the answer</h3><p>A short spoken answer first, then the full plan on screen.</p>
            <div className="viz voicebx"><span className="ob" /><span className="eq"><i /><i /><i /><i /><i /></span></div></div>
          <div className="bx b4 rv d1"><h3>Shows the fix, step by step</h3><p>Every answer comes with a visual fix plan you can save and share.</p>
            <div className="viz plan-viz">
              <span><i>1</i>Find the cause</span>
              <span><i>2</i>Apply the fix</span>
              <span className="ok"><i>✓</i>Confirm it's fixed</span>
            </div></div>
          <div className="bx b5 rv d2"><h3>Learns from every fix</h3><p>"Worked" and "didn't work" go straight back into what MIRA knows.</p>
            <div className="viz mbars">{[31, 38, 44, 52, 57, 65, 71, 78].map((h, i) => <i key={h} style={{ height: `${h}%`, animationDelay: `${i * 0.05}s` }} />)}</div></div>
        </div>
      </div>
    </section>
  );
}

const SECTOR_CARDS = [
  { id: 'fintech', title: 'Fintech', items: ['UPI and payment gateway timeouts', 'OTP delivery drops during campaigns', 'Settlement and reconciliation failures'],
    art: <svg viewBox="0 0 300 150" aria-hidden="true"><rect x="70" y="40" width="160" height="80" rx="12" fill="#fff" stroke="rgba(0,0,0,.08)" /><rect x="86" y="58" width="40" height="28" rx="5" fill="#ff5b14" /><rect x="86" y="96" width="110" height="6" rx="3" fill="#e9e6e3" /><text x="214" y="80" textAnchor="end" style={{ font: "700 22px 'Plus Jakarta Sans',sans-serif", fill: '#151413' }}>₹</text></svg> },
  { id: 'ecommerce', title: 'E-commerce', items: ['Checkout errors during flash sales', 'Cache and inventory problems', 'Search, payment and courier failures'],
    art: <svg viewBox="0 0 300 150" aria-hidden="true"><path d="M90 50h120l-12 60H102z" fill="#fff" stroke="rgba(0,0,0,.1)" /><circle cx="112" cy="122" r="8" fill="#151413" /><circle cx="190" cy="122" r="8" fill="#151413" /><rect x="118" y="64" width="64" height="8" rx="4" fill="#ff5b14" /><rect x="118" y="80" width="44" height="8" rx="4" fill="#e9e6e3" /><text x="232" y="48" style={{ font: "700 12px 'Plus Jakarta Sans',sans-serif", fill: '#ff5b14' }}>SALE</text></svg> },
  { id: 'edtech', title: 'EdTech', items: ['Online exam answers not saving', 'Live classes buffering at peak hours', 'Results day traffic and fee payments'],
    art: <svg viewBox="0 0 300 150" aria-hidden="true"><rect x="84" y="46" width="132" height="84" rx="10" fill="#fff" stroke="rgba(0,0,0,.08)" /><rect x="98" y="60" width="104" height="52" rx="6" fill="#151413" /><path d="M140 74l22 12-22 12z" fill="#ff5b14" /><path d="M150 18l46 18-46 18-46-18z" fill="#ff5b14" /><path d="M186 40v18" stroke="#151413" strokeWidth="2.4" strokeLinecap="round" /><circle cx="186" cy="60" r="3" fill="#151413" /></svg> },
];

export function Sectors() {
  return (
    <section className="sec light" id="sectors">
      <div className="wrap">
        <div className="center"><span className="eyebrow rv"><i>◆</i>Sectors</span><h2 className="t rv d1">Built for your sector</h2>
          <p className="lead rv d2">Choose your sector when you sign up. Your company gets its own private workspace.</p></div>
        <div className="sectors">
          {SECTOR_CARDS.map((s, i) => (
            <article key={s.id} className={`sc rv${i ? ` d${i}` : ''}`}>
              <div className="art">{s.art}</div>
              <div className="txt">
                <h3>{s.title}</h3>
                <ul>{s.items.map((it) => <li key={it}>{it}</li>)}</ul>
                <button className="act p" onClick={() => navigate(`/signup?sector=${s.id}`)}>Sign up as {s.title} →</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className="sec cta-sec">
      <div className="wrap">
        <div className="cta-card rv">
          <span className="eyebrow"><i>✦</i>MIRA</span>
          <h2 style={{ marginTop: 18 }}>Stop solving the same outage twice.</h2>
          <p className="lead">Give your on-call team a memory that never sleeps.</p>
          <div className="cta-row">
            <button className="btn btn-w" onClick={() => navigate('/signup')}>Create your workspace</button>
            <button className="btn btn-g" onClick={() => navigate('/login')}>Log in</button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const go = (id) => (e) => { e.preventDefault(); scrollToId(id); };
  const to = (path) => (e) => { e.preventDefault(); navigate(path); };
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="foot">
          <div><div className="brand"><OrbMark />MIRA</div><p>Memory-Integrated Response Agent. An on-call AI that remembers every outage and learns from every fix.</p></div>
          <div><h4>Product</h4><a href="#product" onClick={go('product')}>Why MIRA</a><a href="#features" onClick={go('features')}>Features</a><a href="#sectors" onClick={go('sectors')}>Sectors</a></div>
          <div><h4>Account</h4><a href="/signup" onClick={to('/signup')}>Sign up</a><a href="/login" onClick={to('/login')}>Log in</a></div>
          <div><h4>Built with</h4><a href="https://hindsight.vectorize.io/" target="_blank" rel="noopener noreferrer">Hindsight</a><a href="https://groq.com/" target="_blank" rel="noopener noreferrer">Groq</a><span>MongoDB · Express · React · Node</span></div>
        </div>
        <div className="fbar"><span>© 2026 MIRA</span><span>Hack with Hyd</span></div>
      </div>
    </footer>
  );
}
