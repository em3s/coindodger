import * as BABYLON from "@babylonjs/core";
import { SUB_STEP_MS, WALLET_START, COIN, PREFILL, DECK_Y, FIELD, FIELD_CAP, CHUTE } from "./config.js";
import { pusherZ } from "./machine.js";
import { PUSHER as PUSHER_CFG } from "./config.js";

const PUSHER_PERIOD = PUSHER_CFG.period;

const V3 = BABYLON.Vector3;

export const PRESET_LABELS = {
  empty: "비우기",
  standard: "기본",
  loaded: "가득",
  brink: "배출 직전",
  edge: "가장자리 아슬아슬",
  towers: "탑 쌓기",
};

export class Game {
  constructor(scene, machine, pool, sfx, hud) {
    this.scene = scene;
    this.machine = machine;
    this.pool = pool;
    this.sfx = sfx;
    this.hud = hud;

    this.simTime = 0;
    this.wallet = WALLET_START;
    this.won = 0;
    this.inserted = 0;
    this.streak = 0;
    this.lastPayoutAt = -99;
    this.autoDrop = false;
    this.autoTimer = 0;
    this.setupMode = false;
    this.freeCoins = 0; // 세팅 모드에서 놓은 코인

    this.fresh = []; // 착지음 감지 대상
    // 배출 판정은 물리 트리거 대신 위치로 한다.
    // 트리거 볼륨 안에서 코인을 풀로 회수하면 Havok에 TRIGGER_EXITED가 영영 가지 않아
    // 내부 페어 목록이 계속 쌓인다(스텝 중 WASM out-of-bounds로 터진다).
    this.payoutY = -0.45;
    this._burst = this._createBurst(scene);
  }

  _createBurst(scene) {
    const tex = new BABYLON.DynamicTexture("spark", 64, scene, true);
    try {
      const c = tex.getContext();
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,248,214,1)");
      g.addColorStop(0.4, "rgba(255,206,110,0.8)");
      g.addColorStop(1, "rgba(255,180,60,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      tex.update(false);
    } catch {
      /* 헤드리스 */
    }

    const ps = new BABYLON.ParticleSystem("payoutBurst", 400, scene);
    ps.particleTexture = tex;
    ps.emitter = new V3(0, 0, 0);
    ps.minEmitBox = new V3(-0.05, -0.05, -0.05);
    ps.maxEmitBox = new V3(0.05, 0.05, 0.05);
    ps.color1 = new BABYLON.Color4(1, 0.9, 0.55, 1);
    ps.color2 = new BABYLON.Color4(1, 0.65, 0.2, 1);
    ps.colorDead = new BABYLON.Color4(1, 0.5, 0.1, 0);
    ps.minSize = 0.04;
    ps.maxSize = 0.16;
    ps.minLifeTime = 0.18;
    ps.maxLifeTime = 0.5;
    ps.emitRate = 0;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new V3(0, -25, 0);
    ps.direction1 = new V3(-2.5, 2.5, -2.5);
    ps.direction2 = new V3(2.5, 6, 2.5);
    ps.minEmitPower = 0.6;
    ps.maxEmitPower = 2.2;
    ps.updateSpeed = 0.012;
    ps.start();
    return ps;
  }

  start() {
    // 푸셔 구동: 매 서브스텝마다 목표 위치만 갱신하고 속도는 Havok이 역산한다.
    this.scene.onBeforePhysicsObservable.add(() => {
      if (this.setupMode) return; // 세팅 중에는 푸셔를 멈춰 배치가 흐트러지지 않게 한다
      this.simTime += SUB_STEP_MS / 1000;
      const root = this.machine.pusherRoot;
      root.position.z = pusherZ(this.simTime);
      root.computeWorldMatrix(true);
    });
  }

  /** 실제 기계처럼 시작부터 코인이 깔려 있게 한다 */
  prefill() {
    this._fill(PREFILL.lower, -1.05, 1.05, 0.18, 1.68, 0.045);
    this._fill(PREFILL.upper, -1.05, 1.05, -1.38, -0.25, DECK_Y + 0.045);
  }

  /** 뒤(뒷벽/푸셔 면)에서부터 앞으로 채운다 — 더미가 뒷벽에 물려 있어야 스크레이핑이 걸린다 */
  _fill(count, x0, x1, z0, z1, y) {
    const stepX = 0.44;
    const stepZ = 0.44;
    const cols = Math.floor((x1 - x0) / stepX) + 1;
    const rows = Math.floor((z1 - z0) / stepZ) + 1;
    let n = 0;
    for (let layer = 0; n < count && layer < 6; layer++) {
      for (let r = 0; r < rows && n < count; r++) {
        for (let c = 0; c < cols && n < count; c++) {
          // 격자 그대로 두면 인공적으로 보인다. 흔들어서 자연스러운 더미로 만든다.
          const x = x0 + c * stepX + (Math.random() - 0.5) * 0.16;
          const z = z0 + r * stepZ + (Math.random() - 0.5) * 0.16;
          const lift = layer * COIN.h * 1.6 + Math.random() * COIN.h * 0.8;
          this.pool.place(x, y + lift, z, Math.random() * Math.PI * 2);
          n++;
        }
      }
    }
  }

  /** 립 아래로 떨어진 코인을 수거한다. 물리 스텝 밖(렌더 루프)에서만 호출된다. */
  _collect() {
    const entries = this.pool.entries;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.active) continue;
      const p = e.mesh.position;
      if (p.y > this.payoutY) continue;
      const paid = p.z > FIELD.frontZ - 0.25 && Math.abs(p.x) < FIELD.frontHalfW + 0.12;
      if (paid && !this.setupMode) this._payout(e);
      else this.pool.despawn(e); // 옆 낙하구로 빠졌거나 세팅 중
    }
  }

  _payout(entry) {
    const p = entry.mesh.position.clone();
    this.pool.despawn(entry);
    this.wallet += 1;
    this.won += 1;

    const now = performance.now() / 1000;
    this.streak = now - this.lastPayoutAt < 1.4 ? this.streak + 1 : 0;
    this.lastPayoutAt = now;

    this._burst.emitter = p;
    this._burst.manualEmitCount = 16 + Math.min(this.streak, 6) * 4;
    this.sfx.payout(this.streak);
    this.hud.pulseWon();
  }

  /** 투입구에 코인을 넣는다. 위치는 슬라이더가 정하고, 그 뒤는 전부 물리다. */
  insert() {
    if (this.setupMode) return false;
    if (this.wallet <= 0) return false;
    if (this.pool.available <= 0) return false;
    if (this.pool.activeCount >= FIELD_CAP) {
      this.hud.toast("기계가 가득 찼습니다");
      return false;
    }
    const entry = this.pool.spawn(this.machine.slotSpawn(), CHUTE.insertVel);
    if (!entry) return false;
    this.wallet -= 1;
    this.inserted += 1;
    this.sfx.drop();
    this.fresh.push({ entry, t: 0, vy: 0 });
    return true;
  }

  /** 슬라이더를 x로 옮기고 투입 (자동 투입 / 헤드리스 시뮬용) */
  drop(x) {
    if (typeof x === "number") this.machine.setSliderX(x);
    return this.insert();
  }

  // ---------- 세팅 모드 ----------
  setSetupMode(on) {
    this.setupMode = on;
    if (!on) this.hud.toast("영업 시작");
  }

  /** 세팅 모드에서 필드를 클릭한 자리에 코인을 놓는다 (무료) */
  placeCoinAt(point) {
    if (this.pool.available <= 0 || this.pool.activeCount >= FIELD_CAP) return false;
    const e = this.pool.place(
      point.x,
      point.y + COIN.r * 0.6,
      point.z,
      Math.random() * Math.PI * 2
    );
    if (e) this.freeCoins++;
    return !!e;
  }

  /** URL로 받은 상태를 그대로 되살린다 */
  restoreState(state) {
    this.clearAll();
    for (const c of state.coins) this.pool.placeExact(c.pos, c.rot);
    this.wallet = state.wallet;
    this.won = state.won;
    this.inserted = state.inserted;
    this.simTime = state.phase * PUSHER_PERIOD;
    this.machine.setSliderX(state.sliderX);
    return state.coins.length;
  }

  /** 동전은 자동으로 채워지지 않는다. 명시적으로 눌렀을 때만 늘어난다. */
  addCoins(n) {
    this.wallet += n;
    this.hud.toast(`동전 ${n}개를 추가했습니다`);
  }

  clearAll() {
    for (const e of this.pool.entries) if (e.active) this.pool.despawn(e);
  }

  /** 운영자가 손님에게 "될 것 같은" 그림을 만들어 두는 세팅들 */
  applyPreset(name) {
    this.clearAll();
    const deck = DECK_Y + 0.045;
    switch (name) {
      case "empty":
        break;
      case "standard":
        this.prefill();
        break;
      case "loaded": // 가득 — 묵직하게 쌓아둔 기계
        this._fill(76, -0.9, 0.9, 0.2, 1.62, 0.045);
        this._fill(52, -1.0, 1.0, -1.35, -0.25, deck);
        break;
      case "brink": // 배출 직전 — 앞줄이 립 밖으로 걸쳐 한 번만 밀면 떨어진다
        this._fill(62, -0.88, 0.88, 0.2, 1.5, 0.045);
        this._fill(34, -1.0, 1.0, -1.35, -0.4, deck);
        for (let i = 0; i < 6; i++) {
          const x = -0.75 + i * 0.3;
          this.pool.place(x, 0.045, FIELD.frontZ - 0.06, Math.random() * Math.PI, 0.02);
          this.pool.place(x + 0.15, 0.045 + COIN.h * 1.1, FIELD.frontZ - 0.2, Math.random() * Math.PI, 0.02);
        }
        break;
      case "edge": // 가장자리 아슬아슬 — 덱 앞끝과 립에 걸쳐둔 코인들
        this._fill(44, -0.88, 0.88, 0.2, 1.35, 0.045);
        this._fill(30, -1.0, 1.0, -1.35, -0.55, deck);
        // 립과 덱 앞끝에 아슬아슬하게 걸쳐둔 줄
        for (let i = 0; i < 6; i++) {
          const x = -0.75 + i * 0.3;
          this.pool.place(x, 0.045, FIELD.frontZ - 0.14, Math.random() * Math.PI, 0.02);
          this.pool.place(x * 0.85, deck, -0.28, Math.random() * Math.PI, 0.02);
        }
        break;
      case "towers": // 탑 — 눈에 띄게 세워둔 더미
        this._fill(44, -0.88, 0.88, 0.22, 1.3, 0.045);
        this._fill(26, -1.0, 1.0, -1.35, -0.6, deck);
        // 배출구 바로 앞에 똑바로 세운 탑 — 기울기를 주면 무너진다
        for (const [tx, tz] of [[-0.58, 1.58], [0, 1.66], [0.58, 1.58]]) {
          for (let k = 0; k < 8; k++) {
            this.pool.place(tx, 0.045 + k * COIN.h * 1.02, tz, Math.random() * Math.PI, 0);
          }
        }
        break;
    }
    this.hud.toast(`세팅: ${PRESET_LABELS[name] ?? name}`);
  }

  update(dt) {
    this._collect();

    if (this.autoDrop && !this.setupMode) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.autoTimer = 0.8;
        this.machine.setSliderX(this.machine.getSliderX() + (Math.random() - 0.5) * 0.5);
        this.insert();
      }
    }

    // 착지음
    for (let i = this.fresh.length - 1; i >= 0; i--) {
      const f = this.fresh[i];
      f.t += dt;
      if (!f.entry.active || f.t > 2.5) {
        this.fresh.splice(i, 1);
        continue;
      }
      const vy = f.entry.body.getLinearVelocity().y;
      if (f.vy < -6 && vy > -1.5) {
        this.sfx.clink(0.7 + Math.random() * 0.3);
        this.fresh.splice(i, 1);
        continue;
      }
      f.vy = vy;
    }

    this.hud.update(this);
  }

  get onField() {
    return this.pool.activeCount;
  }

  get capacity() {
    return COIN.max;
  }
}
