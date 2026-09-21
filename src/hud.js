export class Hud {
  constructor(root) {
    this.el = {
      wallet: root.querySelector("#stat-wallet"),
      won: root.querySelector("#stat-won"),
      field: root.querySelector("#stat-field"),
      wonCard: root.querySelector("#card-won"),
      insert: root.querySelector("#btn-insert"),
      auto: root.querySelector("#btn-auto"),
      sound: root.querySelector("#btn-sound"),
      setup: root.querySelector("#btn-setup"),
      panel: root.querySelector("#setup-panel"),
      presets: root.querySelector("#presets"),
      slider: root.querySelector("#slider"),
      share: root.querySelector("#btn-share"),
      toast: root.querySelector("#toast"),
      fps: root.querySelector("#fps"),
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
    this._set(this.el.won, "g", String(game.won));
    this._set(this.el.field, "f", `${game.onField} / ${game.capacity}`);
    this.el.insert.disabled = game.wallet <= 0 || game.setupMode;
  }

  setFps(v) {
    this._set(this.el.fps, "fps", `${v} FPS`);
  }

  pulseWon() {
    const c = this.el.wonCard;
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

  setAuto(on) {
    this.el.auto.classList.toggle("on", on);
    this.el.auto.setAttribute("aria-pressed", String(on));
  }

  setSetup(on) {
    this.el.setup.classList.toggle("on", on);
    this.el.setup.setAttribute("aria-pressed", String(on));
    this.el.panel.classList.toggle("open", on);
    this.el.insert.disabled = on;
  }

  setMuted(muted) {
    this.el.sound.classList.toggle("off", muted);
    this.el.sound.textContent = muted ? "🔇 소리 꺼짐" : "🔊 소리 켜짐";
  }
}
