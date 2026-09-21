/** WebAudio 합성음. 에셋 없이 동전 소리/획득음을 만든다. */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this._noise = null;
  }

  _ensure() {
    if (this.ctx) return;
    const Ctx =
      typeof window === "undefined" ? null : window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  }

  resume() {
    this._ensure();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(v) {
    this.muted = v;
    if (this.master) this.master.gain.value = v ? 0 : 0.35;
  }

  /** 금속 동전 낙하음: 노이즈 임펄스 + 고주파 부분음 */
  clink(gain = 1) {
    this._ensure();
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600 + Math.random() * 1400;
    bp.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.2);

    const base = 1750 + Math.random() * 700;
    for (const [mult, amp, dur] of [[1, 0.22, 0.28], [2.41, 0.12, 0.2], [3.83, 0.07, 0.15]]) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * mult;
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(amp * gain, t + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(og).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** 획득음: 상승 3음 */
  payout(streak = 0) {
    this._ensure();
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const root = 660 * Math.pow(2, Math.min(streak, 6) / 12);
    [0, 4, 7].forEach((semi, i) => {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = root * Math.pow(2, semi / 12);
      const g = this.ctx.createGain();
      const s = t + i * 0.045;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.16, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.3);
      o.connect(g).connect(this.master);
      o.start(s);
      o.stop(s + 0.35);
    });
  }

  /** 대형 동전 등장 — 낮고 묵직한 종 */
  jumbo() {
    this._ensure();
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [330, 495, 660].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = this.ctx.createGain();
      const s = t + i * 0.02;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.2 / (i + 1), s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 1.1);
      o.connect(g).connect(this.master);
      o.start(s);
      o.stop(s + 1.2);
    });
  }

  /** 코인 러시 — 상승 아르페지오 */
  jackpot() {
    this._ensure();
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16, 19, 24].forEach((semi, i) => {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = 523.25 * Math.pow(2, semi / 12);
      const g = this.ctx.createGain();
      const s = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.18, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.42);
      o.connect(g).connect(this.master);
      o.start(s);
      o.stop(s + 0.5);
    });
  }

  drop() {
    this._ensure();
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.15);
  }
}
