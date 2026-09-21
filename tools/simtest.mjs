/**
 * 헤드리스 물리 시뮬레이션 하니스.
 * 브라우저 없이 Havok 물리를 결정론적으로 돌려서 배출률과 안정성을 측정한다.
 *   node tools/simtest.mjs [총초] [투입간격초]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Node에는 캔버스가 없다. Babylon의 DynamicTexture가 생성만 되도록 최소 스텁을 둔다.
const gradientStub = { addColorStop() {} };
const ctxStub = new Proxy(
  {},
  {
    get: (_t, k) => (k === "canvas" ? null : () => gradientStub),
    set: () => true,
  }
);
globalThis.OffscreenCanvas = class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return ctxStub;
  }
};

import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

import { GRAVITY, SUB_STEP_MS, FIELD_CAP } from "../src/config.js";
import { buildMachine } from "../src/machine.js";
import { CoinPool } from "../src/coins.js";
import { Game } from "../src/game.js";
import { Sfx } from "../src/audio.js";

const hudStub = {
  update() {},
  setFps() {},
  pulseWon() {},
  toast() {},
  setAuto() {},
  setMuted() {},
  el: {},
};

const seconds = Number(process.argv[2] ?? 240);
const dropEvery = Number(process.argv[3] ?? 1.0);
// 투입 x 패턴: "spread"(기본, 좌우로 흩뿌림) | "sides"(좌우 끝 두 지점만) | "center"
const xMode = process.argv[4] ?? "spread";
let sideFlip = 0;
const pickX = () => {
  if (xMode === "sides") return (sideFlip++ % 2 ? 1 : -1) * 0.85;
  if (xMode === "center") return (Math.random() - 0.5) * 0.2;
  return (Math.random() - 0.5) * 1.5;
};

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);

// Node에는 file:// fetch가 없으므로 wasm을 직접 넘긴다
const wasmBinary = readFileSync(
  fileURLToPath(new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url))
);
const havok = await HavokPhysics({ wasmBinary });
scene.enablePhysics(new BABYLON.Vector3(0, GRAVITY, 0), new BABYLON.HavokPlugin(true, havok));
scene.getPhysicsEngine().setSubTimeStep(SUB_STEP_MS);

const machine = buildMachine(scene, null);
const pool = new CoinPool(scene, null);
const game = new Game(scene, machine, pool, new Sfx(), hudStub);
game.start();
game.prefill();

scene.useConstantAnimationDeltaTime = true; // 프레임당 16ms 고정
const dt = 1 / 60;
const frames = Math.round(seconds * 60);
const dropFrames = Math.max(1, Math.round(dropEvery * 60));
const segment = Math.round(frames / 10);

let lastWon = 0;
let lastIns = 0;
let peak = 0;
const t0 = Date.now();

console.log("초  | 투입  획득  회수율 | 필드  최대 | 하단/상단 슈트");
for (let i = 0; i < frames; i++) {
  if (i > 300 && i % dropFrames === 0) {
    if (game.wallet < 5) game.wallet = 999;
    game.drop(pickX());
  }
  try {
    scene.animate();
  } catch (err) {
    console.error(`\n💥 ${(i / 60).toFixed(1)}초에 물리 엔진 크래시: ${err.message}`);
    console.error(`   필드 코인 ${pool.activeCount}개, 최대 ${peak}개, 투입 ${game.inserted}, 획득 ${game.won}`);
    process.exit(1);
  }
  game.update(dt);
  peak = Math.max(peak, pool.activeCount);

  if (i % segment === segment - 1) {
    const ins = game.inserted - lastIns;
    const won = game.won - lastWon;
    lastIns = game.inserted;
    lastWon = game.won;
    const pos = pool.entries.filter((e) => e.active).map((e) => e.mesh.position);
    const low = pos.filter((p) => p.y < 0.3).length;
    const inChute = pos.filter((p) => p.y > 1.5).length;
    console.log(
      `${String(Math.round((i + 1) / 60)).padStart(3)} | ${String(ins).padStart(4)} ${String(won).padStart(5)}  ${(ins ? (won / ins) * 100 : 0).toFixed(0).padStart(5)}% | ${String(pool.activeCount).padStart(4)} ${String(peak).padStart(5)} | ${low}/${pos.length - low - inChute} 슈트${inChute}`
    );
  }
}

const wall = ((Date.now() - t0) / 1000).toFixed(1);
console.log(
  `\n✅ ${seconds}초 시뮬 완료 (실시간 ${wall}s) — 총 투입 ${game.inserted}, 획득 ${game.won}, 회수율 ${((game.won / game.inserted) * 100).toFixed(0)}%`
);
console.log(`   필드 최대 ${peak}개 (상한 ${FIELD_CAP})`);
process.exit(0);
