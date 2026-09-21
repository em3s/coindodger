/** URL 상태 저장: 크기와 복원 정확도 확인 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const g = { addColorStop() {} };
const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? null : () => g), set: () => true });
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx; } };
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { GRAVITY, SUB_STEP_MS } from "../src/config.js";
import { buildMachine } from "../src/machine.js";
import { CoinPool } from "../src/coins.js";
import { Game } from "../src/game.js";
import { Sfx } from "../src/audio.js";
import { encodeState, decodeState, q16, BOUNDS } from "../src/state.js";

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

// 좀 굴려서 실제 플레이 상태로 만든다
game.wallet = 999;
for (let i = 0; i < 3600; i++) {
  if (i % 60 === 0) { machine.setSliderX((Math.random() - 0.5) * 1.4); game.wallet = 999; game.insert(); }
  if (i === 1200) { game.nextJumboIn = 1; game.insert(); } // 대형 동전도 섞어서 저장 테스트
  scene.animate(); game.update(1 / 60);
}
machine.setSliderX(0.37);

// ---- 1) 코덱 정확도: 물리를 섞지 않고 인코딩→디코딩만 비교 ----
const snap = pool.entries
  .filter((e) => e.active)
  .map((e) => ({ p: e.mesh.position.clone(), q: e.mesh.rotationQuaternion.clone() }));
machine.setSliderX(0.37);
const before = { wallet: game.wallet, won: game.won, inserted: game.inserted, slider: machine.getSliderX() };

const code = await encodeState(game);
const rawBytes = 16 + snap.length * 10;
console.log(`코인 ${snap.length}개 (대형 ${pool.entries.filter((e) => e.active && e.jumbo).length}개)`);
console.log(`  원본 ${rawBytes} B → URL 문자열 ${code.length} 자 (원본 대비 ${(code.length / rawBytes * 100).toFixed(0)}%)`);
console.log(`  전체 URL ≈ ${code.length + 40} 자`);

const st = await decodeState(code);
// 인코딩과 똑같이 "양자화한 값" 기준으로 정렬해야 짝이 맞는다
const qk = (p) => [q16(p.y, BOUNDS.y), q16(p.z, BOUNDS.z), q16(p.x, BOUNDS.x)];
const cmp = (ka, kb) => ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
const sa = [...snap].sort((a, b) => cmp(qk(a.p), qk(b.p)));
const sb = [...st.coins].sort((a, b) => cmp(qk(a.pos), qk(b.pos)));
let maxPos = 0, maxRot = 0;
for (let i = 0; i < sa.length; i++) {
  maxPos = Math.max(maxPos, BABYLON.Vector3.Distance(sa[i].p, sb[i].pos));
  const d = Math.abs(BABYLON.Quaternion.Dot(sa[i].q, sb[i].rot));
  maxRot = Math.max(maxRot, 2 * Math.acos(Math.min(1, d)) * (180 / Math.PI));
}
console.log(`코덱 왕복 오차: 위치 최대 ${(maxPos * 100).toFixed(3)} mm, 자세 최대 ${maxRot.toFixed(2)}°`);
console.log(`  지갑 ${st.wallet}/${before.wallet} · 획득 ${st.won}/${before.won} · 투입 ${st.inserted}/${before.inserted} · 슬라이더 ${st.sliderX.toFixed(3)}/${before.slider.toFixed(3)}`);

// ---- 2) 복원 후 안정성: 푸셔를 멈춘 채 튀지 않는지 ----
game.restoreState(st);
game.setSetupMode(true);
const idx = pool.entries.map((e, i) => (e.active ? i : -1)).filter((i) => i >= 0);
for (let i = 0; i < 6; i++) { scene.animate(); game.update(1 / 60); }
const pre = idx.map((i) => pool.entries[i].mesh.position.clone());
for (let i = 0; i < 180; i++) { scene.animate(); game.update(1 / 60); }
const deltas = idx.map((e, k) => BABYLON.Vector3.Distance(pre[k], pool.entries[e].mesh.position)).sort((x, y) => x - y);
console.log(`복원: 코인 ${pool.activeCount}개`);
console.log(`  푸셔 정지 3초 뒤 이동 — 중앙값 ${(deltas[Math.floor(deltas.length / 2)] * 100).toFixed(2)} mm, 최대 ${(deltas[deltas.length - 1] * 100).toFixed(1)} mm, 5mm 초과 ${deltas.filter((d) => d > 0.05).length}개`);
process.exit(0);
