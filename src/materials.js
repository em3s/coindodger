import * as BABYLON from "@babylonjs/core";
import { BASE_URL } from "./config.js";

/** 헤드리스(NullEngine)에는 2D 캔버스가 없다. 텍스처 페인팅 실패가 게임을 죽이지 않게 한다. */
function paint(tex, draw) {
  try {
    const c = tex.getContext();
    if (!c) return tex;
    draw(c);
    tex.update(false);
  } catch {
    /* 헤드리스 환경 */
  }
  return tex;
}

/** 프리필터드 IBL. PBR 반사/앰비언트를 전부 여기서 받는다. */
export function createEnvironment(scene) {
  const env = BABYLON.CubeTexture.CreateFromPrefilteredData(`${BASE_URL}env/studio.env`, scene);
  env.name = "studioEnv";
  env.gammaSpace = false;
  env.level = 1.0;
  scene.environmentTexture = env;
  scene.environmentIntensity = 1.35;
  return env;
}

function pbr(name, scene, opts = {}) {
  const m = new BABYLON.PBRMaterial(name, scene);
  m.albedoColor = opts.color ?? new BABYLON.Color3(0.5, 0.5, 0.5);
  m.metallic = opts.metallic ?? 0;
  m.roughness = opts.roughness ?? 0.5;
  m.environmentIntensity = opts.envIntensity ?? 1.0;
  if (opts.emissive) {
    m.emissiveColor = opts.emissive;
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  return m;
}

/** 코인 앞뒷면 문양 + 옆면 널링을 하나의 아틀라스로 그린다. (좌: 캡, 우: 튜브) */
function createCoinTexture(scene) {
  const size = 1024;
  const tex = new BABYLON.DynamicTexture("coinTex", { width: size, height: size / 2 }, scene, true);
  const W = size / 2;
  const H = size / 2;
  paint(tex, (c) => {

  // --- 좌측: 코인 면 ---
  const cx = W / 2;
  const cy = H / 2;
  const R = H * 0.5;
  const g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  g.addColorStop(0, "#fffaea");
  g.addColorStop(0.45, "#ffeaae");
  g.addColorStop(0.8, "#f3cd78");
  g.addColorStop(1, "#dfb056");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  // 테두리 링
  c.strokeStyle = "rgba(255,240,195,0.85)";
  c.lineWidth = H * 0.035;
  c.beginPath();
  c.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = "rgba(120,78,12,0.5)";
  c.lineWidth = H * 0.018;
  c.beginPath();
  c.arc(cx, cy, R * 0.74, 0, Math.PI * 2);
  c.stroke();

  // 중앙 별
  c.fillStyle = "rgba(255,247,214,0.95)";
  c.beginPath();
  const spikes = 5;
  const rOut = R * 0.38;
  const rIn = R * 0.16;
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? rOut : rIn;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
  }
  c.closePath();
  c.fill();

  // --- 우측: 옆면 널링(reeded edge) ---
  c.fillStyle = "#e0ae46";
  c.fillRect(W, 0, W, H);
  for (let i = 0; i < 160; i++) {
    const x = W + (i / 160) * W;
    c.fillStyle = i % 2 === 0 ? "rgba(255,236,178,0.55)" : "rgba(120,78,12,0.45)";
    c.fillRect(x, 0, W / 160 / 2, H);
  }

  });
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

export function createCoinMaterial(scene) {
  const m = pbr("coinMat", scene, {
    color: new BABYLON.Color3(1.0, 0.82, 0.42),
    metallic: 1.0,
    roughness: 0.38,
  });
  m.albedoTexture = createCoinTexture(scene);
  m.useRoughnessFromMetallicTextureAlpha = false;
  m.environmentIntensity = 1.5;
  m.freeze();
  return m;
}

/** 플레이필드/푸셔 상판: 살짝 러프한 브러시드 메탈 */
export function createDeckMaterial(scene, tint = new BABYLON.Color3(0.26, 0.285, 0.34)) {
  const size = 512;
  const tex = new BABYLON.DynamicTexture("deckTex", size, scene, true);
  paint(tex, (c) => {
  c.fillStyle = "#6f757d";
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const y = Math.random() * size;
    const len = 20 + Math.random() * 180;
    const x = Math.random() * size;
    c.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.05})`;
    c.lineWidth = 0.6 + Math.random();
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y + (Math.random() - 0.5) * 1.5);
    c.stroke();
  }
  });
  tex.anisotropicFilteringLevel = 8;

  const m = pbr("deckMat", scene, { color: tint, metallic: 0.9, roughness: 0.3 });
  m.albedoTexture = tex;
  m.albedoTexture.uScale = 3;
  m.albedoTexture.vScale = 3;
  return m;
}

export function createCabinetMaterial(scene) {
  return pbr("cabinetMat", scene, {
    color: new BABYLON.Color3(0.085, 0.092, 0.125),
    metallic: 0.25,
    roughness: 0.42,
  });
}

export function createTrimMaterial(scene) {
  return pbr("trimMat", scene, {
    color: new BABYLON.Color3(0.83, 0.62, 0.25),
    metallic: 1.0,
    roughness: 0.22,
  });
}

export function createGlassMaterial(scene) {
  const m = new BABYLON.PBRMaterial("glassMat", scene);
  m.metallic = 0;
  m.roughness = 0.06;
  m.alpha = 0.055;
  m.albedoColor = new BABYLON.Color3(0.75, 0.85, 0.95);
  m.backFaceCulling = false;
  m.environmentIntensity = 1.6;
  m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
  return m;
}

export function createNeonMaterial(scene, color) {
  const m = new BABYLON.PBRMaterial("neonMat", scene);
  m.albedoColor = new BABYLON.Color3(0.02, 0.02, 0.02);
  m.metallic = 0;
  m.roughness = 0.9;
  m.emissiveColor = color;
  m.emissiveIntensity = 1.0;
  return m;
}
