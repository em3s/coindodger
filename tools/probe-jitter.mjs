/** 서브스텝을 낮추면 더미가 떨리거나 가라앉는지 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const g = { addColorStop() {} };
const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? null : () => g), set: () => true });
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx; } };
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { GRAVITY } from "../src/config.js";
import { buildMachine } from "../src/machine.js";
import { CoinPool } from "../src/coins.js";
import { Game } from "../src/game.js";
import { Sfx } from "../src/audio.js";

const hz = Number(process.argv[2] ?? 240);
const hud = { update(){}, setFps(){}, pulseWon(){}, toast(){}, setAuto(){}, setMuted(){}, setSetup(){}, el:{} };
const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const wasmBinary = readFileSync(fileURLToPath(new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url)));
scene.enablePhysics(new BABYLON.Vector3(0, GRAVITY, 0), new BABYLON.HavokPlugin(true, await HavokPhysics({ wasmBinary })));
scene.getPhysicsEngine().setSubTimeStep(1000 / hz);
const machine = buildMachine(scene, null);
const pool = new CoinPool(scene, null);
const game = new Game(scene, machine, pool, new Sfx(), hud);
game.start();
game.prefill();
scene.useConstantAnimationDeltaTime = true;

// 200개까지 채운 뒤 푸셔를 멈추고 완전히 가라앉힌다
game.wallet = 9999;
for (let i = 0; i < 60 * 90; i++) { if (i % 30 === 0) { machine.setSliderX((Math.random() - 0.5) * 1.6); game.insert(); } scene.animate(); game.update(1 / 60); }
game.setSetupMode(true);
for (let i = 0; i < 60 * 5; i++) { scene.animate(); game.update(1 / 60); }

const act = pool.entries.filter((e) => e.active);
const before = act.map((e) => e.mesh.position.clone());
const t0 = Date.now();
for (let i = 0; i < 60 * 3; i++) { scene.animate(); game.update(1 / 60); }
const wall = Date.now() - t0;
let moved = 0, sunk = 0;
act.forEach((e, i) => {
  moved += BABYLON.Vector3.Distance(before[i], e.mesh.position);
  sunk += before[i].y - e.mesh.position.y;
});
console.log(
  `${String(hz).padStart(3)}Hz | 코인 ${act.length}개 | 정지 3초 동안 평균 떨림 ${(moved / act.length * 100).toFixed(2)} mm, 평균 가라앉음 ${(sunk / act.length * 100).toFixed(2)} mm | 물리 3초분 계산 ${wall}ms`
);
process.exit(0);
