import * as BABYLON from "@babylonjs/core";
import { CHUTE, PUSHER } from "./config.js";

/**
 * 기계의 그 순간 상태를 URL 해시에 담는다.
 *
 * 코인 하나당 10바이트: 위치 16bit×3 + 회전 32bit(smallest-three).
 * 그 위에 브라우저 내장 CompressionStream('deflate-raw')을 씌우고 base64url로 만든다.
 * 해시(#)에 두므로 서버로 가지 않고 길이 제한에도 여유가 있다.
 */
const VERSION = 3;
export const BOUNDS = { x: [-1.6, 1.6], y: [-0.8, 3.2], z: [-2.2, 2.6] };
const HEADER = 16;
const PER_COIN = 11; // 위치 6 + 회전 4 + 종류 1

export const q16 = (v, [lo, hi]) => Math.max(0, Math.min(65535, Math.round(((v - lo) / (hi - lo)) * 65535)));
const dq16 = (n, [lo, hi]) => lo + (n / 65535) * (hi - lo);

function packQuat(q) {
  const c = [q.x, q.y, q.z, q.w];
  let maxI = 0;
  for (let i = 1; i < 4; i++) if (Math.abs(c[i]) > Math.abs(c[maxI])) maxI = i;
  const sign = c[maxI] < 0 ? -1 : 1;
  const rest = [];
  for (let i = 0; i < 4; i++) if (i !== maxI) rest.push(c[i] * sign);
  const S = Math.SQRT1_2;
  const enc = rest.map((v) => Math.max(0, Math.min(1023, Math.round(((v / S) * 0.5 + 0.5) * 1023))));
  return ((maxI << 30) | (enc[0] << 20) | (enc[1] << 10) | enc[2]) >>> 0;
}

function unpackQuat(v) {
  v = v >>> 0;
  const maxI = (v >>> 30) & 3;
  const S = Math.SQRT1_2;
  const dec = [(v >>> 20) & 1023, (v >>> 10) & 1023, v & 1023].map((n) => ((n / 1023) * 2 - 1) * S);
  const rest = Math.sqrt(Math.max(0, 1 - dec.reduce((s, x) => s + x * x, 0)));
  const out = [0, 0, 0, 0];
  let j = 0;
  for (let i = 0; i < 4; i++) out[i] = i === maxI ? rest : dec[j++];
  return new BABYLON.Quaternion(out[0], out[1], out[2], out[3]);
}

function toBase64Url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("deflate-raw");
    const blob = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(blob);
  } catch {
    return null;
  }
}

async function inflate(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const blob = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(blob);
}

/**
 * 지금 이 순간의 기계 상태 → base64url 문자열.
 *
 * 압축이 실제로 먹히도록 두 가지를 한다:
 *  1. 코인을 (y, z, x) 순으로 정렬 — 이웃한 값이 비슷해진다
 *  2. 값을 바이트 평면으로 쪼갠다 (상위 바이트끼리, 하위 바이트끼리)
 * 상위 바이트 평면은 같은 값이 길게 반복되므로 deflate가 크게 줄인다.
 */
export async function encodeState(game) {
  const coins = game.pool.entries
    .filter((e) => e.active)
    .map((e) => ({
      x: q16(e.mesh.position.x, BOUNDS.x),
      y: q16(e.mesh.position.y, BOUNDS.y),
      z: q16(e.mesh.position.z, BOUNDS.z),
      q: packQuat(e.mesh.rotationQuaternion ?? BABYLON.Quaternion.Identity()),
      k: e.jumbo ? 1 : 0,
    }))
    .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

  const n = coins.length;
  const buf = new ArrayBuffer(HEADER + n * PER_COIN);
  const dv = new DataView(buf);
  const planes = new Uint8Array(buf, HEADER);
  const put = (planeIndex, i, v) => (planes[planeIndex * n + i] = v);
  for (let i = 0; i < n; i++) {
    const c = coins[i];
    put(0, i, c.x >> 8); put(1, i, c.x & 255);
    put(2, i, c.y >> 8); put(3, i, c.y & 255);
    put(4, i, c.z >> 8); put(5, i, c.z & 255);
    put(6, i, (c.q >>> 24) & 255); put(7, i, (c.q >>> 16) & 255);
    put(8, i, (c.q >>> 8) & 255); put(9, i, c.q & 255);
    put(10, i, c.k);
  }

  dv.setUint8(0, VERSION);
  dv.setUint8(1, 0); // 예약
  dv.setUint16(2, n, true);
  dv.setUint16(4, Math.min(65535, game.wallet), true);
  dv.setUint32(6, Math.min(0xffffffff, game.won), true);
  dv.setUint16(10, q16(game.machine.getSliderX(), [-CHUTE.slideLimit, CHUTE.slideLimit]), true);
  dv.setUint16(12, q16((game.simTime % PUSHER.period) / PUSHER.period, [0, 1]), true);
  dv.setUint16(14, Math.min(65535, game.inserted), true);

  const raw = new Uint8Array(buf);
  const packed = await deflate(raw);
  const useZip = packed && packed.length < raw.length;
  const body = useZip ? packed : raw;
  const out = new Uint8Array(body.length + 1);
  out[0] = useZip ? 1 : 0;
  out.set(body, 1);
  return toBase64Url(out);
}

export async function decodeState(str) {
  const all = fromBase64Url(str);
  const body = all[0] === 1 ? await inflate(all.subarray(1)) : all.subarray(1);
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (dv.getUint8(0) !== VERSION) throw new Error("저장 형식 버전이 다릅니다");

  const count = dv.getUint16(2, true);
  const state = {
    wallet: dv.getUint16(4, true),
    won: dv.getUint32(6, true),
    sliderX: dq16(dv.getUint16(10, true), [-CHUTE.slideLimit, CHUTE.slideLimit]),
    phase: dq16(dv.getUint16(12, true), [0, 1]),
    inserted: dv.getUint16(14, true),
    coins: [],
  };

  const planes = body.subarray(HEADER);
  const get = (planeIndex, i) => planes[planeIndex * count + i];
  for (let i = 0; i < count; i++) {
    const x = (get(0, i) << 8) | get(1, i);
    const y = (get(2, i) << 8) | get(3, i);
    const z = (get(4, i) << 8) | get(5, i);
    const q = ((get(6, i) << 24) | (get(7, i) << 16) | (get(8, i) << 8) | get(9, i)) >>> 0;
    state.coins.push({
      pos: new BABYLON.Vector3(dq16(x, BOUNDS.x), dq16(y, BOUNDS.y), dq16(z, BOUNDS.z)),
      rot: unpackQuat(q),
      jumbo: get(10, i) === 1,
    });
  }
  return state;
}

export async function buildShareUrl(game) {
  const code = await encodeState(game);
  const base = `${location.origin}${location.pathname}`;
  return { url: `${base}#s=${code}`, chars: code.length };
}

export function readStateParam() {
  const m = /[#&]s=([A-Za-z0-9_-]+)/.exec(location.hash);
  return m ? m[1] : null;
}
