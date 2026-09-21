export class Hud {
  constructor(root) {
    const $ = (sel) => root.querySelector(sel);
    this.el = {
      wallet: $("#stat-wallet"),
      inserted: $("#stat-in"),
      won: $("#stat-won"),
      rate: $("#stat-rate"),
      ledger: $(".ledger"),
      settingsBtn: $("#btn-settings"),
      closeBtn: $("#btn-close"),
      sheet: $("#settings"),
      refill: $("#btn-refill"),
      auto: $("#btn-auto"),
      sound: $("#btn-sound"),
      share: $("#btn-share"),
      setup: $("#btn-setup"),
      setupBody: $("#setup-body"),
      presets: $("#presets"),
      hint: $("#hint"),
      toast: $("#toast"),
      fps: $("#fps"),
    };
    this._last = {};
    this._toastTimer = null;
  }

  _set(node, key, value) {
    if (this._last[key] === value) return;
    this._last[key] = value;
    node.textContent = value;
  }

  update(game) {
    this._set(this.el.wallet, "w", String(game.wallet));
    this._set(this.el.inserted, "i", String(game.inserted));
    this._set(this.el.won, "g", String(game.won));
    const rate = game.inserted ? Math.round((game.won / game.inserted) * 100) : null;
    this._set(this.el.rate, "r", rate === null ? "—" : `${rate}%`);
    if (rate !== null) {
      this.el.rate.classList.toggle("up", rate >= 100);
      this.el.rate.classList.toggle("down", rate < 60);
    }
    this.el.ledger.classList.toggle("broke", game.wallet <= 0);
  }

  setFps(v) {
    this._set(this.el.fps, "fps", `${v} FPS`);
  }

  pulseWon() {
    const c = this.el.won.parentElement;
    c.classList.remove("pulse");
    void c.offsetWidth;
    c.classList.add("pulse");
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove("show"), 1800);
  }

  hideHint() {
    this.el.hint.classList.add("gone");
  }

  setSettingsOpen(on) {
    this.el.sheet.classList.toggle("open", on);
    this.el.sheet.setAttribute("aria-hidden", String(!on));
    this.el.settingsBtn.setAttribute("aria-expanded", String(on));
  }

  get settingsOpen() {
    return this.el.sheet.classList.contains("open");
  }

  _toggle(btn, on, labels = ["꺼짐", "켜짐"]) {
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? labels[1] : labels[0];
  }

  setAuto(on) {
    this._toggle(this.el.auto, on);
  }

  setMuted(muted) {
    this._toggle(this.el.sound, !muted);
  }

  setSetup(on) {
    this._toggle(this.el.setup, on);
    this.el.setupBody.classList.toggle("open", on);
  }
}
