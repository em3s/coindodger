/** 슈트를 타고 내려간 코인이 실제로 어디에 닿는지 추적한다 */
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
import { GRAVITY, SUB_STEP_MS, DECK_Y } from "../src/config.js";
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
scene.useConstantAnimationDeltaTime = true;

// 빈 기계에 한 개씩 넣고 최종 정지 위치를 본다
const landings = [];
for (let k = 0; k < 12; k++) {
  game.clearAll();
  machine.setSliderX([-0.88, -0.45, 0, 0.45, 0.88][k % 5]);
  game.wallet = 10;
  game.insert();
  const e = pool.entries.find((x) => x.active);
  let firstTouchZ = null;
  for (let i = 0; i < 180; i++) {
    scene.animate();
    game.update(1 / 60);
    if (firstTouchZ === null && e.mesh.position.y < DECK_Y + 0.12 && e.mesh.position.y > 0.2) firstTouchZ = e.mesh.position.z;
  }
  landings.push({
    slider: +machine.getSliderX().toFixed(2),
    deckTouchZ: firstTouchZ === null ? null : +firstTouchZ.toFixed(2),
    restX: +e.mesh.position.x.toFixed(2),
    restZ: +e.mesh.position.z.toFixed(2),
    restY: +e.mesh.position.y.toFixed(2),
  });
}
console.table(landings);
const dz = landings.filter((l) => l.deckTouchZ !== null).map((l) => l.deckTouchZ);
console.log("덱 최초 접촉 z:", dz.length ? `${Math.min(...dz).toFixed(2)} ~ ${Math.max(...dz).toFixed(2)}` : "없음(하단으로 직행)");
console.log("x 편차(슬라이더 대비):", landings.map((l) => +(l.restX - l.slider).toFixed(2)).join(", "));
process.exit(0);
