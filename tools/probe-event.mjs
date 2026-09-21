/** 대형 동전과 코인 러시가 물리적으로 제대로 도는지 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const g = { addColorStop() {} };
const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? null : () => g), set: () => true });
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx; } };
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { GRAVITY, SUB_STEP_MS, EVENT } from "../src/config.js";
import { buildMachine } from "../src/machine.js";
import { CoinPool } from "../src/coins.js";
import { Game } from "../src/game.js";
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
game.prefill();
scene.useConstantAnimationDeltaTime = true;

// 1) 대형 동전 하나를 직접 넣어 슈트를 통과해 덱에 앉는지
game.wallet = 999;
game.nextJumboIn = 1;
machine.setSliderX(0.5);
game.insert();
const jum = pool.entries.find((e) => e.jumbo && e.active);
let stuck = null;
for (let i = 0; i < 300; i++) { scene.animate(); game.update(1 / 60); if (i === 90) stuck = jum.mesh.position.clone(); }
console.log(`대형 동전: 지름 ${(pool.jumboR * 2 * 10).toFixed(1)}cm (일반 ${(0.21 * 2 * 10).toFixed(1)}cm)`);
console.log(`  1.5초 뒤 (${stuck.x.toFixed(2)}, ${stuck.y.toFixed(2)}, ${stuck.z.toFixed(2)}) → 5초 뒤 (${jum.mesh.position.x.toFixed(2)}, ${jum.mesh.position.y.toFixed(2)}, ${jum.mesh.position.z.toFixed(2)})`);
console.log(`  덱(y 0.58)에 안착: ${jum.mesh.position.y > 0.45 && jum.mesh.position.y < 0.9 ? "예" : "아니오"}`);

// 2) 장시간: 대형 동전이 실제로 배출되고 러시가 터지는지
let rushes = 0, jumbosIn = 0, jumbosOut = 0;
const origRush = game.startRush.bind(game);
game.startRush = (n) => { rushes++; jumbosOut++; origRush(n); };
let lastIns = game.inserted;
for (let i = 0; i < 60 * 60 * 12; i++) { // 12분
  if (i % 60 === 0) {
    const before = game.nextJumboIn;
    machine.setSliderX((Math.random() - 0.5) * 1.5);
    game.wallet = 999;
    game.insert();
    if (before <= 1) jumbosIn++;
  }
  scene.animate();
  game.update(1 / 60);
}
console.log(`\n12분 플레이 (1초에 1개 투입)`);
console.log(`  대형 동전 투입 ${jumbosIn}개 → 배출 ${jumbosOut}개, 코인 러시 ${rushes}회`);
console.log(`  총 투입 ${game.inserted}, 획득 ${game.won}, 수익률 ${Math.round(game.won / game.inserted * 100)}%`);
console.log(`  필드 ${pool.activeCount}개 (대형 ${pool.entries.filter((e) => e.jumbo && e.active).length}개)`);
process.exit(0);
