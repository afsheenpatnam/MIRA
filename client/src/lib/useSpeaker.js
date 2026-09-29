import { useCallback, useEffect, useRef, useState } from 'react';
import { Voice } from './voice.js';
import { Listener } from './listener.js';

const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? Math.min(ms, 60) : ms));
const RATES = [1, 1.25, 1.5, 0.85];

/**
 * Drives the pop-up orb. The speech is prepared first and the orb pops up at the exact
 * moment the voice starts (`pending` hides it until then), then it pops away when done.
 */
export function useSpeaker() {
  const [cast, setCast] = useState(null);
  const ctl = useRef({ stopped: false });

  const prepare = (label, full, words) => {
    Listener.suspend(); // MIRA must not hear itself
    setCast({ label, words, idx: -1, progress: '', full, pending: true, closing: false, paused: false });
  };
  const reveal = () => setCast((c) => c && { ...c, pending: false });
  const close = async () => {
    setCast((c) => c && { ...c, pending: false, closing: true, idx: 1e9 });
    await wait(620);
    setCast(null);
    Listener.resume();
  };

  /** The short answer: one utterance, word-by-word subtitles. */
  const speakBrief = async (label, text) => {
    ctl.current = { stopped: false };
    const my = ctl.current;
    prepare(label, false, text.split(/\s+/));
    await Voice.say(text, {
      onStart: reveal,
      onWord: (i) => setCast((c) => c && { ...c, idx: i }),
    });
    if (!my.stopped) await wait(450);
    await close();
  };

  /**
   * A longer reply: spoken as one continuous utterance (no gaps between sentences).
   * The subtitle shows the current sentence and highlights its words; onSentence(i) tracks it.
   */
  const speakSentences = async (label, sentences, onSentence) => {
    ctl.current = { stopped: false, restart: false, reading: true };
    const my = ctl.current;
    let from = 0;
    let current = 0;
    prepare(label, true, sentences[0].split(/\s+/));

    while (!my.stopped) {
      const part = sentences.slice(from);
      // Which sentence each word belongs to, so a word index maps back to its sentence.
      const owner = [];
      const firstWord = [];
      part.forEach((s, si) => {
        firstWord[si] = owner.length;
        s.split(/\s+/).filter(Boolean).forEach(() => owner.push(si));
      });
      let shown = -1;
      const ok = await Voice.say(part.join(' '), {
        onStart: reveal,
        onWord: (k) => {
          const si = owner[Math.min(k, owner.length - 1)];
          if (si !== shown) {
            shown = si;
            current = from + si;
            onSentence?.(current);
            setCast((c) => c && { ...c, words: part[si].split(/\s+/), progress: `${current + 1} of ${sentences.length}` });
          }
          setCast((c) => c && { ...c, idx: k - firstWord[si] });
        },
      });
      if (my.restart) { my.restart = false; from = current; continue; } // speed changed: resume from this sentence
      if (ok || my.stopped) break;
      break;
    }
    onSentence?.(-1);
    if (!my.stopped) await wait(350);
    await close();
  };

  const togglePause = useCallback(() => {
    if (Voice.paused) Voice.resume(); else Voice.pause();
    setCast((c) => c && { ...c, paused: Voice.paused });
  }, []);
  const stop = useCallback(() => {
    ctl.current.stopped = true;
    Voice.stop();
  }, []);
  const cycleRate = useCallback(() => {
    Voice.rate = RATES[(RATES.indexOf(Voice.rate) + 1) % RATES.length];
    setCast((c) => c && { ...c });
    if (ctl.current.reading) { ctl.current.restart = true; Voice.stop(); }
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') stop(); };
    addEventListener('keydown', onKey);
    return () => { removeEventListener('keydown', onKey); Voice.stop(); };
  }, [stop]);

  return { cast, speakBrief, speakSentences, togglePause, stop, cycleRate };
}
