// Voice input: a one-off "capture" (mic button, Ctrl+Space, follow-up window) and an
// optional hands-free "wake" mode that waits for "Hey MIRA". Uses the browser's
// speech recognition (Chrome and Edge). Listening pauses while MIRA speaks so it
// never hears itself.
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// Recognisers often hear "Mira" as Meera, Mera, Myra, Mirror...
const NAME = '(?:mira|meera|mera|mirra|myra|mirror|meira|maira|miira|mia|nira)';
const WAKE = new RegExp(`\\b(?:hey|hi|hello|ok|okay|hay|a|yo)\\s*,?\\s*${NAME}\\b[\\s,.!?]*`, 'i');

export function matchWake(text) {
  const m = WAKE.exec(text);
  return m ? { rest: text.slice(m.index + m[0].length) } : null;
}
const stripWake = (text) => (matchWake(text) ? matchWake(text).rest : text).trim();

let audio;
/** A short two-note chime so the user knows MIRA is listening. */
export function chime(up = true) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const now = audio.currentTime;
    [up ? 660 : 880, up ? 880 : 660].forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.08, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.16);
      o.connect(g).connect(audio.destination);
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 0.18);
    });
  } catch { /* audio not available */ }
}

export const Listener = {
  supported: Boolean(SR),
  wakeOn: false,
  suspended: false,
  rec: null,
  state: { mode: 'off', interim: '', source: null, wakeHeard: false },
  subs: new Set(),
  handlers: { onCommand: null, onNothing: null, onError: null },

  subscribe(fn) {
    this.subs.add(fn);
    fn({ ...this.state });
    return () => this.subs.delete(fn);
  },
  emit(patch) {
    Object.assign(this.state, patch);
    const snapshot = { ...this.state };
    this.subs.forEach((fn) => fn(snapshot));
  },

  _make(continuous) {
    const r = new SR();
    r.lang = 'en-IN';
    r.continuous = continuous;
    r.interimResults = true;
    r.maxAlternatives = 1;
    return r;
  },
  _drop() {
    const r = this.rec;
    this.rec = null;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    try { r.abort(); } catch { /* already stopped */ }
  },
  _fail(e) {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      this.wakeOn = false;
      this.handlers.onError?.('Microphone access is blocked. Allow the microphone for this site in the browser, then try again.');
    } else if (e.error === 'network') {
      this.handlers.onError?.("Voice recognition couldn't reach the speech service. Check your connection.");
    } else if (e.error === 'audio-capture') {
      this.handlers.onError?.('No microphone was found.');
    }
  },

  /** Hands-free: listen continuously for "Hey MIRA". */
  startWake() {
    if (!SR) return;
    this.wakeOn = true;
    if (!this.suspended && this.state.mode !== 'command') this._wake();
  },
  stopWake() {
    this.wakeOn = false;
    if (this.state.mode === 'wake') {
      this._drop();
      this.emit({ mode: 'off', interim: '', wakeHeard: false });
    }
  },
  _wake() {
    this._drop();
    const r = this._make(true);
    this.rec = r;
    this.emit({ mode: 'wake', interim: '', wakeHeard: false });
    r.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      const text = res[0].transcript;
      const hit = matchWake(text);
      if (!hit) return;
      if (!this.state.wakeHeard) chime(true);
      this.emit({ wakeHeard: true, interim: hit.rest.trim() });
      if (!res.isFinal) return;
      const rest = hit.rest.trim();
      if (rest.split(/\s+/).filter(Boolean).length >= 2) {
        // "Hey MIRA, checkout is failing" in one breath.
        this._drop();
        this.emit({ mode: 'off', interim: '', wakeHeard: false });
        this.handlers.onCommand?.(rest, 'wake');
        this._rewake();
      } else {
        // Just "Hey MIRA": listen for the question next.
        this.capture('wake', { chimeOnStart: false });
      }
    };
    r.onerror = (e) => this._fail(e);
    r.onend = () => {
      this.rec = null;
      if (this.state.mode !== 'wake') return;
      this.emit({ mode: 'off', wakeHeard: false });
      this._rewake();
    };
    try { r.start(); } catch { /* already started */ }
  },
  _rewake() {
    if (this.wakeOn && !this.suspended) setTimeout(() => { if (this.wakeOn && !this.suspended && this.state.mode === 'off') this._wake(); }, 300);
  },

  /** One question: from the mic button, Ctrl+Space, "Hey MIRA", or the follow-up window. */
  capture(source, { timeout = 7000, chimeOnStart = true } = {}) {
    if (!SR) return;
    this._drop();
    const r = this._make(false);
    this.rec = r;
    let finalText = '';
    let heard = false;
    let cancelled = false;
    this._cancel = () => { cancelled = true; try { r.abort(); } catch { /* stopped */ } };
    this._finish = () => { try { r.stop(); } catch { /* stopped */ } };
    if (chimeOnStart) chime(true);
    this.emit({ mode: 'command', interim: '', source, wakeHeard: false });
    const silence = setTimeout(() => { if (!heard) { try { r.stop(); } catch { /* stopped */ } } }, timeout);

    r.onresult = (e) => {
      heard = true;
      let fin = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i += 1) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else interim += t;
      }
      finalText = fin;
      this.emit({ interim: stripWake(`${fin} ${interim}`) });
    };
    r.onerror = (e) => this._fail(e);
    r.onend = () => {
      clearTimeout(silence);
      this.rec = null;
      const text = stripWake(finalText || this.state.interim);
      this.emit({ mode: 'off', interim: '', source: null });
      if (!cancelled && text) {
        chime(false);
        this.handlers.onCommand?.(text, source);
      } else if (!cancelled) {
        this.handlers.onNothing?.(source);
      }
      this._rewake();
    };
    try { r.start(); } catch { /* already started */ }
  },
  /** Ignore a "Hey MIRA" that was heard by mistake and keep waiting for the next one. */
  dismissWake() {
    this.emit({ wakeHeard: false, interim: '' });
  },
  /** Stop listening now and send what was heard. */
  finish() { this._finish?.(); },
  /** Stop listening and discard. */
  cancel() { this._cancel?.(); },

  /** Pause all listening while MIRA speaks. */
  suspend() {
    this.suspended = true;
    if (this.state.mode === 'wake') {
      this._drop();
      this.emit({ mode: 'off', interim: '', wakeHeard: false });
    }
  },
  resume() {
    this.suspended = false;
    this._rewake();
  },
};
