import { navigate } from '../lib/router.js';

const WIRES = [
  { d: 'M190 100 H300 Q330 100 346 124 L390 186 Q402 200 424 200 H444', dur: '3.1s' },
  { d: 'M190 320 H300 Q330 320 346 296 L390 234 Q402 220 424 220 H444', dur: '3.7s', off: '-1.3s', rev: true },
  { d: 'M810 100 H700 Q670 100 654 124 L610 186 Q598 200 576 200 H556', dur: '3.4s', off: '-2s' },
  { d: 'M810 320 H700 Q670 320 654 296 L610 234 Q598 220 576 220 H556', dur: '2.9s', off: '-.7s', rev: true },
  { d: 'M60 210 H444', dur: '4.2s', off: '-1.6s' },
  { d: 'M940 210 H556', dur: '4.5s', off: '-3s', rev: true },
  { d: 'M500 40 V152', dur: '2.6s', off: '-.9s' },
  { d: 'M500 380 V268', dur: '2.8s', off: '-2.1s', rev: true },
];

const NODES = [
  { x: 126, y: 68, glyph: '₹', label: 'Fintech' },
  { x: 126, y: 288, glyph: '⌂', label: 'E-commerce', off: '-2s' },
  { x: 810, y: 68, glyph: '▶', label: 'EdTech', off: '-1s' },
  { x: 810, y: 288, glyph: '+', label: 'Your company', off: '-3s', empty: true },
];
const DOTS = [
  { x: 40, y: 190, s: 40, off: '-4s' }, { x: 920, y: 190, s: 40, off: '-5s' },
  { x: 482, y: 4, s: 36, off: '-1.5s' }, { x: 482, y: 380, s: 36, off: '-2.5s' },
];

export default function Hero() {
  return (
    <section className="hero center" id="top">
      <div className="wrap">
        <span className="eyebrow rv"><i>✦</i>Memory-Integrated Response Agent</span>
        <h1 className="rv d1">Every outage, remembered.</h1>
        <p className="lead rv d2">
          MIRA is an AI on-call engineer that learns from your company's past incidents. It recalls how outages were fixed,
          tells you out loud, shows the fix step by step, and learns from every fix.
        </p>
        <div className="cta rv d3">
          <button className="btn btn-o" onClick={() => navigate('/signup')}>Create your workspace</button>
          <button className="btn-link" onClick={() => navigate('/login')}>Log in <span>→</span></button>
        </div>
      </div>
      <div className="wrap">
        <div className="net rv d4">
          <svg viewBox="0 0 1000 420" role="img" aria-label="The MIRA agent at the centre, connected to companies in fintech, e-commerce and EdTech, each kept separate.">
            <defs>
              <linearGradient id="sg" x1="0" x2="1"><stop offset="0" stopColor="#ff5b14" stopOpacity="0" /><stop offset=".6" stopColor="#ff7a2a" /><stop offset="1" stopColor="#ffd2ad" /></linearGradient>
              <filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              <radialGradient id="halo"><stop offset="0" stopColor="#ff5b14" stopOpacity=".5" /><stop offset="1" stopColor="#ff5b14" stopOpacity="0" /></radialGradient>
              <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#232326" /><stop offset="1" stopColor="#101012" /></linearGradient>
            </defs>
            {WIRES.map((w) => <path key={w.d} className="wire" d={w.d} />)}
            {WIRES.map((w) => (
              <path key={`s${w.d}`} className={`spark${w.rev ? ' r' : ''}`} pathLength="100" d={w.d} style={{ '--d': w.dur, '--o': w.off || '0s' }} />
            ))}
            <circle className="core-h" cx="500" cy="210" r="120" fill="url(#halo)" />
            <rect x="444" y="152" width="112" height="116" rx="22" fill="url(#cf)" stroke="rgba(255,120,40,.55)" />
            <rect x="454" y="162" width="92" height="96" rx="16" fill="none" stroke="rgba(255,255,255,.06)" />
            <text x="500" y="214" textAnchor="middle" style={{ font: "500 28px 'Plus Jakarta Sans',sans-serif", fill: '#f4f2ef' }}>MIRA</text>
            <text x="500" y="238" textAnchor="middle" style={{ font: "600 10px 'Plus Jakarta Sans',sans-serif", fill: '#ff8a3d', letterSpacing: '.2em' }}>AGENT</text>
            {NODES.map((n) => (
              <g key={n.label} className="nd" style={{ '--o': n.off || '0s' }}>
                <rect x={n.x} y={n.y} width="64" height="64" rx="16" strokeDasharray={n.empty ? '4 4' : undefined} />
                <text className="nt" x={n.x + 32} y={n.y + 39} textAnchor="middle" style={n.empty ? { fill: '#6d6862' } : undefined}>{n.glyph}</text>
                <text className="nl" x={n.x + 32} y={n.y + 86} textAnchor="middle">{n.label}</text>
              </g>
            ))}
            {DOTS.map((d) => (
              <g key={`${d.x}-${d.y}`} className="nd" style={{ '--o': d.off }}>
                <rect x={d.x} y={d.y} width={d.s} height={d.s} rx="11" />
                <circle cx={d.x + d.s / 2} cy={d.y + d.s / 2} r="4" fill="#6d6862" />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}
