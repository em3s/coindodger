/** 세팅 모드 프리셋이 안착하는지 (물리적으로 무너지지 않는지) 확인 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const gradientStub = { addColorStop() {} };
const ctxStub = new Proxy({}, { get: (_t, k) => (k === "canvas" ? null : () => gradientStub), set: () => true });
globalThis.OffscreenCanvas = class {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() { return ctxStub; }
};
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { GRAVITY, SUB_STEP_MS, FIELD } from "../src/config.js";
import { buildMachine } from "../src/machine.js";
import { CoinPool } from "../src/coins.js";
import { Game, PRESET_LABELS } from "../src/game.js";
import { Sfx } from "../src/audio.js";

const hud = { update(){}, setFps(){}, pulseWon(){}, toast(){}, setAuto(){}, setMuted(){}, setSetup(){}, el:{} };
const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const wasmBinary = readFileSync(fileURLToPath(new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url)));
scene.enablePhysics(new BABYLON.Vector3(0, GRAVITY, 0), new BABYLON.HavokPlugin(true, await HavokPhysics({ wasmBinary })));
scene.getPhysicsEngine().setSubTimeStep(SUB_STEP_MS);
const machine = buildMachine(scene, null);
const pool = new CoinPool(scene, null);
const game = new Game(scene, machine, pool, new Sfx(), hud);
game.start();
scene.useConstantAnimationDeltaTime = true;

const rows = [];
for (const name of Object.keys(PRESET_LABELS)) {
  game.setSetupMode(true);
  game.applyPreset(name);
  const placed = pool.activeCount;
  for (let i = 0; i < 240; i++) { scene.animate(); game.update(1 / 60); }  // 세팅 중(푸셔 정지) 안정화
  const settled = pool.activeCount;
  const pos = pool.entries.filter((e) => e.active).map((e) => e.mesh.position);
  const towerZone = pos.filter((p) => p.z > 1.45 && p.y < 0.5);
  const towerTop = towerZone.length ? Math.max(...towerZone.map((p) => p.y)) : 0;
  const atLip = pos.filter((p) => p.z > FIELD.frontZ - 0.45 && p.y < 0.3).length;

  game.setSetupMode(false);           // 영업 시작 — 푸셔 재가동
  const won0 = game.won;
  const ins0 = game.inserted;
  game.wallet = 999;
  for (let i = 0; i < 3600; i++) {     // 60초, 1초에 한 개씩 투입
    if (i % 60 === 0) { machine.setSliderX((Math.random() - 0.5) * 1.4); game.insert(); }
    scene.animate(); game.update(1 / 60);
  }
  rows.push({
    프리셋: PRESET_LABELS[name],
    놓음: placed,
    안정후: settled,
    "유실(세팅중)": placed - settled,
    "탑높이(립앞)": +towerTop.toFixed(2),
    립근처: atLip,
    투입: game.inserted - ins0,
    "→배출": game.won - won0,
  });
}
console.table(rows);
process.exit(0);
