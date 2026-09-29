// Browser text-to-speech with subtitles that follow the voice.
// - onStart fires the moment the voice actually starts, so the pop-up can open in sync with it.
// - If the voice reports word boundaries (Edge's voices do), those drive the highlight exactly.
// - Otherwise words are paced by length and punctuation, at a speed learned from earlier answers.
export const Voice = {
  ok: typeof window !== 'undefined' && 'speechSynthesis' in window,
  rate: 1,
  muted: false,
  voice: null,
  token: 0,
  speaking: false,
  paused: false,
  cps: 14.5, // characters per second at rate 1; refined after every utterance
  _res: null,
  _timer: null,

  pick() {
    if (!this.ok) return;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return;
    const score = (v) =>
      (/en-IN/i.test(v.lang) ? 6 : 0) +
      (/en-GB|en-US/i.test(v.lang) ? 3 : 0) +
      (/female|heera|neerja|zira|aria|jenny|samantha|libby|sonia|google uk english female/i.test(v.name) ? 4 : 0) +
      (/natural|online/i.test(v.name) ? 3 : 0) + // natural voices report word boundaries
      (/^en/i.test(v.lang) ? 1 : 0);
    this.voice = [...voices].sort((a, b) => score(b) - score(a))[0];
  },

  _release() {
    const resolve = this._res;
    this._res = null;
    if (resolve) resolve(false);
  },

  stop() {
    this.token += 1;
    this.speaking = false;
    this.paused = false;
    clearInterval(this._timer);
    if (this.ok) speechSynthesis.cancel();
    this._release();
  },

  /**
   * Speaks text. Calls onStart() when the voice starts and onWord(index) as each word is spoken.
   * Resolves true when finished, false when stopped.
   */
  say(text, { onWord, onStart } = {}) {
    this._release();
    const my = ++this.token;
    clearInterval(this._timer);
    this.paused = false;

    const words = [...text.matchAll(/\S+/g)].map((m) => ({ at: m.index, w: m[0] }));
    // Relative duration of each word: its letters plus a pause after punctuation.
    const weights = words.map(({ w }) => w.length + 1.5 + (/[.!?]["')]?$/.test(w) ? 6 : /[,;:]$/.test(w) ? 3 : 0));
    const ends = [];
    weights.reduce((sum, x, i) => (ends[i] = sum + x), 0);
    const total = ends[ends.length - 1] || 1;

    let index = -1;
    let boundaryMode = false;
    const show = (n) => {
      if (n !== index) {
        index = n;
        onWord?.(n);
      }
    };
    const useVoice = this.ok && !this.muted;

    return new Promise((resolve) => {
      this._res = resolve;
      let started = false;
      let elapsed = 0;
      let last = 0;

      const finish = () => {
        if (my !== this.token) return;
        clearInterval(this._timer);
        // Learn how fast this voice really speaks, so estimated subtitles stay in sync next time.
        if (useVoice && started && !boundaryMode && elapsed > 1200) {
          const measured = (text.length / (elapsed / 1000)) / this.rate;
          if (measured > 6 && measured < 30) this.cps = this.cps * 0.5 + measured * 0.5;
        }
        show(words.length - 1);
        this.speaking = false;
        this._res = null;
        resolve(true);
      };

      const begin = () => {
        if (started || my !== this.token) return;
        started = true;
        onStart?.();
        last = performance.now();
        this._timer = setInterval(() => {
          if (my !== this.token) return clearInterval(this._timer);
          const now = performance.now();
          if (!this.paused) elapsed += now - last;
          last = now;
          if (boundaryMode) return;
          const unitsPerSecond = (this.cps * this.rate * total) / Math.max(text.length, 1);
          const pos = (elapsed / 1000) * unitsPerSecond;
          let k = 0;
          while (k < ends.length - 1 && ends[k] <= pos) k += 1;
          show(k);
          if (!useVoice && pos >= total) finish();
        }, 40);
      };

      this.speaking = true;
      if (!useVoice) {
        begin();
        return;
      }

      // Cancelling right before speaking can delay or drop the new utterance, so only cancel if needed.
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      if (speechSynthesis.paused) speechSynthesis.resume();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = this.rate;
      u.pitch = 1.02;
      u.onstart = begin;
      u.onboundary = (e) => {
        if (my !== this.token || (e.name && e.name !== 'word')) return;
        if (!started) begin();
        boundaryMode = true;
        let k = 0;
        while (k + 1 < words.length && words[k + 1].at <= e.charIndex) k += 1;
        show(k); // may move backwards if the estimate ran ahead
      };
      u.onend = finish;
      u.onerror = finish;
      speechSynthesis.speak(u);
      // Some browsers never fire onstart; don't leave the pop-up waiting.
      setTimeout(() => begin(), 2500);
    });
  },

  pause() { this.paused = true; if (this.ok) speechSynthesis.pause(); },
  resume() { this.paused = false; if (this.ok) speechSynthesis.resume(); },
};

if (Voice.ok) {
  Voice.pick();
  speechSynthesis.onvoiceschanged = () => Voice.pick();
}

export const splitSentences = (text) => (text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text]).map((s) => s.trim()).filter(Boolean);
