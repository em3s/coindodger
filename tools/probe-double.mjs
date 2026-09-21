/** 100개로 시작해서 200개(2배)까지 가는가. 갈 때까지 얼마나 걸리는가. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const g = { addColorStop() {} };
const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? null : () => g), set: () => true });
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx; } };
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { GRAVITY, SUB_STEP_MS, WALLET_START } from "../src/config.js";
import { buildMachine } from "../src/machine.js";
import { CoinPool } from "../src/coins.js";
import { Game } from "../src/game.js";
import { Sfx } from "../src/audio.js";

const TRIALS = Number(process.argv[2] ?? 6);
const MAX_SEC = Number(process.argv[3] ?? 420);
const GOAL = WALLET_START * 2;

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
for (let t = 0; t < TRIALS; t++) {
  game.clearAll();
  game.prefill();
  game.wallet = WALLET_START;
  game.won = 0;
  game.inserted = 0;
  game.rushLeft = 0;
  game.nextJumboIn = Game.rollJumboGap();
  for (let i = 0; i < 180; i++) { scene.animate(); game.update(1 / 60); } // 더미 안정화

  let minWallet = game.wallet, reachedAt = null, broke = null;
  for (let f = 0; f < MAX_SEC * 60; f++) {
    if (f % 60 === 0 && game.wallet > 0) {
      machine.setSliderX((Math.random() - 0.5) * 1.6);
      game.insert();
    }
    scene.animate();
    game.update(1 / 60);
    minWallet = Math.min(minWallet, game.wallet);
    if (reachedAt === null && game.wallet >= GOAL) reachedAt = f / 60;
    if (broke === null && game.wallet <= 0) broke = f / 60;
    if (reachedAt !== null) break;
  }
  rows.push({
    회차: t + 1,
    "2배 달성": reachedAt !== null ? `${Math.round(reachedAt)}초` : "실패",
    투입: game.inserted,
    최종지갑: game.wallet,
    "최저 지갑": minWallet,
    "바닥친 시점": broke !== null ? `${Math.round(broke)}초` : "-",
  });
  console.log(`  ${t + 1}회차: ${rows[t]["2배 달성"]} (투입 ${game.inserted}, 최저 ${minWallet})`);
}

console.table(rows);
const ok = rows.filter((r) => r["2배 달성"] !== "실패");
const times = ok.map((r) => parseInt(r["2배 달성"]));
console.log(`2배 달성 ${ok.length}/${TRIALS}회` + (times.length ? ` · 평균 ${Math.round(times.reduce((a, b) => a + b) / times.length)}초, 최단 ${Math.min(...times)}초, 최장 ${Math.max(...times)}초` : ""));
console.log(`최저 지갑 평균 ${Math.round(rows.reduce((a, r) => a + r["최저 지갑"], 0) / rows.length)}개 (시작 ${WALLET_START})`);
process.exit(0);
