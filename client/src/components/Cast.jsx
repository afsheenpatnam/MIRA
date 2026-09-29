import Orb from './Orb.jsx';
import { Voice } from '../lib/voice.js';

/**
 * The orb that pops up over the agent while MIRA is speaking. It is mounted (hidden) while the
 * voice is loading and pops up the instant the voice starts, so sound and animation begin together.
 */
export default function Cast({ speaker }) {
  const { cast, togglePause, stop, cycleRate } = speaker;
  if (!cast) return null;
  return (
    <div className={`cast${cast.pending ? ' pending' : ''}${cast.closing ? ' out' : ''}${!cast.paused && !cast.closing && !cast.pending ? ' talk' : ''}`}
      aria-hidden={cast.pending ? 'true' : undefined}>
      <div className="cslot"><span className="ring" /><span className="ring r2" /><Orb /></div>
      <div className="clabel"><span className="ceq"><i /><i /><i /><i /></span><span>{cast.label}</span></div>
      <p className="cap2" aria-live="polite">
        {cast.words.map((w, i) => (
          <span key={i} className={`w${i <= cast.idx ? ' on' : ''}${i === cast.idx ? ' now' : ''}`}>{w} </span>
        ))}
      </p>
      <div className="cprog">{cast.progress}</div>
      <div className="cctl">
        <button onClick={togglePause} aria-label={cast.paused ? 'Resume' : 'Pause'}>
          {cast.paused
            ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
        </button>
        {cast.full && <button onClick={cycleRate} aria-label="Reading speed">{Voice.rate}×</button>}
        <button onClick={stop} aria-label="Stop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div>
    </div>
  );
}
