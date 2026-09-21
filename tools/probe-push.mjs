import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const g = { addColorStop() {} };
const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? null : () => g), set: () => true });
globalThis.OffscreenCanvas = class { constructor(w,h){this.width=w;this.height=h;} getContext(){return ctx;} };
import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { GRAVITY, SUB_STEP_MS, PUSHER, FIELD } from "/Users/em/d/live/game/coindodger/src/config.js";
import { buildMachine } from "/Users/em/d/live/game/coindodger/src/machine.js";
import { CoinPool } from "/Users/em/d/live/game/coindodger/src/coins.js";
import { Game } from "/Users/em/d/live/game/coindodger/src/game.js";
import { Sfx } from "/Users/em/d/live/game/coindodger/src/audio.js";
const hud={update(){},setFps(){},pulseWon(){},toast(){},setAuto(){},setMuted(){},setSetup(){},el:{}};
const engine=new BABYLON.NullEngine(); const scene=new BABYLON.Scene(engine);
const wasm=readFileSync("/Users/em/d/live/game/coindodger/node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm");
scene.enablePhysics(new BABYLON.Vector3(0,GRAVITY,0), new BABYLON.HavokPlugin(true, await HavokPhysics({wasmBinary:wasm})));
scene.getPhysicsEngine().setSubTimeStep(SUB_STEP_MS);
const machine=buildMachine(scene,null); const pool=new CoinPool(scene,null);
const game=new Game(scene,machine,pool,new Sfx(),hud); game.start();
scene.useConstantAnimationDeltaTime=true;
game.setSetupMode(true); game.applyPreset("brink");
for(let i=0;i<240;i++){scene.animate();game.update(1/60);}
game.setSetupMode(false);
console.log("t(s) | face  | 하단 최후미  최전방 | 배출");
for(let c=0;c<8;c++){
  for(let i=0;i<180;i++){scene.animate();game.update(1/60);}
  const low=pool.entries.filter(e=>e.active).map(e=>e.mesh.position).filter(p=>p.y<0.3);
  const face=machine.pusherRoot.position.z+PUSHER.bodyD;
  console.log(`${((c+1)*3).toString().padStart(4)} | ${face.toFixed(2).padStart(5)} | ${Math.min(...low.map(p=>p.z)).toFixed(2).padStart(6)} ${Math.max(...low.map(p=>p.z)).toFixed(2).padStart(9)} | ${game.won}`);
}
console.log("립 위치:", FIELD.frontZ, " 푸셔 면 최대:", (PUSHER.zMax+PUSHER.bodyD).toFixed(2));
process.exit(0);
