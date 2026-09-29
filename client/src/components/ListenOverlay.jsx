import Orb from './Orb.jsx';
import { Listener } from '../lib/listener.js';

const HINTS = {
  wake: 'Go ahead, I\'m listening…',
  mic: 'Say what\'s breaking, or just chat…',
  shortcut: 'Say what\'s breaking, or just chat…',
  followup: 'Anything else? Reply or ask a follow-up…',
};

/** The orb pops up while MIRA listens and shows your words as you speak. */
export default function ListenOverlay({ state, hint }) {
  const active = state.mode === 'command' || (state.mode === 'wake' && state.wakeHeard);
  if (!active) return null;
  const source = state.mode === 'wake' ? 'wake' : state.source;
  const idle = hint && source !== 'followup' ? hint : HINTS[source] || HINTS.mic;
  return (
    <div className="cast listen">
      <div className="cslot"><span className="ring" /><span className="ring r2" /><Orb /></div>
      <div className="clabel"><span className="mic-dot" />{source === 'followup' ? 'MIRA · still listening' : 'MIRA · listening'}</div>
      <p className={`cap2 heard${state.interim ? '' : ' hint'}`} aria-live="polite">{state.interim || idle}</p>
      <div className="cctl">
        {state.mode === 'command' && (
          <button onClick={() => Listener.finish()} aria-label="Done, send it" disabled={!state.interim}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
          </button>
        )}
        <button onClick={() => (state.mode === 'command' ? Listener.cancel() : Listener.dismissWake())} aria-label="Stop listening">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
