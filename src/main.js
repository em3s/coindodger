import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

import { GRAVITY, SUB_STEP_MS, CAMERA, CHUTE, DECK_Y, BASE_URL } from "./config.js";
import { createEnvironment } from "./materials.js";
import { buildMachine } from "./machine.js";
import { CoinPool } from "./coins.js";
import { Game } from "./game.js";
import { Hud } from "./hud.js";
import { Sfx } from "./audio.js";
import { buildShareUrl, decodeState, readStateParam } from "./state.js";
import { registerSW } from "virtual:pwa-register";

/** 모바일/저사양에서는 렌더 비용을 낮춘다. 물리는 동일하게 둔다 — 상태 호환을 위해. */
const IS_TOUCH =
  (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches) ||
  window.innerWidth < 820;

const V3 = BABYLON.Vector3;

const canvas = document.getElementById("stage");
const engine = new BABYLON.Engine(
  canvas,
  true,
  { stencil: true, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false },
  true
);
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.3 : 2));

async function boot() {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.016, 0.018, 0.028, 1);
  scene.ambientColor = new BABYLON.Color3(0.1, 0.1, 0.12);

  createEnvironment(scene);

  // ---------- 카메라 (고정 시점) ----------
  // 사용자가 돌리거나 당길 수 없다. 화면비에 맞춰 반경만 다시 잡는다.
  const camera = new BABYLON.ArcRotateCamera(
    "cam",
    CAMERA.alpha,
    CAMERA.beta,
    10,
    new V3(...CAMERA.target),
    scene
  );
  camera.fov = CAMERA.fov;
  camera.minZ = 0.1;
  camera.maxZ = 200;
  camera.inputs.clear(); // 마우스·터치·휠 입력을 전부 뗀다

  const fitCamera = () => {
    const aspect = engine.getAspectRatio(camera) || 1;
    const vHalf = Math.tan(camera.fov / 2);
    const hHalf = vHalf * aspect;
    camera.radius = Math.max(CAMERA.fitHalfW / hHalf, CAMERA.fitHalfH / vHalf) * CAMERA.fitPad;
  };
  fitCamera();

  // ---------- 조명 ----------
  const key = new BABYLON.DirectionalLight("key", new V3(-0.32, -1, 0.34), scene);
  key.position = new V3(3.2, 9, -3.4);
  key.intensity = 1.7;
  key.diffuse = new BABYLON.Color3(1.0, 0.96, 0.9);
  key.shadowMinZ = 2;
  key.shadowMaxZ = 22;

  const shadowGen = new BABYLON.ShadowGenerator(IS_TOUCH ? 1024 : 2048, key);
  shadowGen.usePercentageCloserFiltering = true;
  shadowGen.filteringQuality = IS_TOUCH
    ? BABYLON.ShadowGenerator.QUALITY_LOW
    : BABYLON.ShadowGenerator.QUALITY_HIGH;
  shadowGen.bias = 0.006;
  shadowGen.normalBias = 0.012;
  shadowGen.darkness = 0.32;
  shadowGen.transparencyShadow = false;

  const warm = new BABYLON.PointLight("warm", new V3(0, 3.4, 0.9), scene);
  warm.diffuse = new BABYLON.Color3(1.0, 0.72, 0.36);
  warm.intensity = 1.8;
  warm.range = 14;

  const cool = new BABYLON.PointLight("cool", new V3(-2.2, 2.4, -1.5), scene);
  cool.diffuse = new BABYLON.Color3(0.28, 0.6, 1.0);
  cool.intensity = 1.2;
  cool.range = 12;

  // ---------- 바닥(배경) ----------
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 60, height: 60 }, scene);
  ground.position.y = -1.9;
  const gm = new BABYLON.PBRMaterial("groundMat", scene);
  gm.albedoColor = new BABYLON.Color3(0.028, 0.03, 0.042);
  gm.metallic = 0.5;
  gm.roughness = 0.55;
  ground.material = gm;
  ground.receiveShadows = true;
  ground.isPickable = false;

  // ---------- 물리 ----------
  const havok = await HavokPhysics({ locateFile: (f) => `${BASE_URL}${f}` });
  const plugin = new BABYLON.HavokPlugin(true, havok);
  scene.enablePhysics(new V3(0, GRAVITY, 0), plugin);
  scene.getPhysicsEngine().setSubTimeStep(SUB_STEP_MS);

  // ---------- 머신 / 코인 ----------
  const machine = buildMachine(scene, shadowGen);
  const pool = new CoinPool(scene, shadowGen);

  // ---------- 포스트 프로세싱 ----------
  let ssao = null;
  if (!IS_TOUCH) {
    ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]);
    ssao.totalStrength = 1.05;
    ssao.radius = 0.3;
    ssao.base = 0.12;
    ssao.samples = 16;
    ssao.maxZ = 30;
    ssao.minZAspect = 0.25;
  }

  const pipeline = new BABYLON.DefaultRenderingPipeline("pipe", true, scene, [camera]);
  pipeline.samples = IS_TOUCH ? 1 : 4;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.82;
  pipeline.bloomWeight = 0.42;
  pipeline.bloomKernel = IS_TOUCH ? 24 : 48;
  pipeline.bloomScale = 0.6;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.18;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = 1.0;
  pipeline.imageProcessing.contrast = 1.22;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.6;
  pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);

  const glow = new BABYLON.GlowLayer("glow", scene, { blurKernelSize: 40 });
  glow.intensity = 0.38;
  if (IS_TOUCH) glow.blurKernelSize = 24;

  // ---------- 게임 ----------
  const sfx = new Sfx();
  const hudRoot = document.getElementById("hud");
  const hud = new Hud(hudRoot);
  const game = new Game(scene, machine, pool, sfx, hud);
  game.start();

  // URL에 상태가 있으면 그걸 되살리고, 없으면 실제 기계처럼 채워둔 상태로 시작한다
  const stateParam = readStateParam();
  let restored = 0;
  if (stateParam) {
    try {
      restored = game.restoreState(await decodeState(stateParam));
    } catch (err) {
      console.warn("상태 복원 실패:", err);
    }
  }
  if (!restored) game.prefill();

  // ---------- 방치 모드 ----------
  // 기본은 딤 처리된 화면에 시계만. 뒤에서 기계는 계속 돈다.
  // 화면을 만지면 5초간 깨어난다.
  const WAKE_MS = 5000;
  let wakeUntil = 0;
  const isAwake = () => performance.now() < wakeUntil;
  const wake = () => {
    wakeUntil = performance.now() + WAKE_MS;
    document.body.classList.add("awake");
  };

  const clockTime = document.getElementById("clock-time");
  const clockDate = document.getElementById("clock-date");
  let lastMinute = -1;
  const updateClock = () => {
    const d = new Date();
    const m = d.getMinutes();
    clockTime.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (m !== lastMinute) {
      lastMinute = m;
      clockDate.textContent = d.toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "long",
      });
    }
  };
  updateClock();

  // ---------- 입력 ----------
  // 화면을 탭하면 그 자리로 투입구가 옮겨 가고 동전이 들어간다.
  // 별도의 조준 UI를 두지 않는다 — 화면에는 기계만 남긴다.
  let dragMode = null;
  const held = new Set();

  // 덱 높이의 수평면. 탭한 지점을 그대로 x로 읽는다.
  const aimPlane = BABYLON.Plane.FromPositionAndNormal(new V3(0, DECK_Y, 0), new V3(0, 1, 0));
  const fieldMeshes = [machine.meshes.floor, machine.meshes.frontFloor, machine.meshes.pusherPlate];

  const pointerToX = () => {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, BABYLON.Matrix.Identity(), camera);
    const dist = ray.intersectsPlane(aimPlane);
    if (dist === null || dist < 0) return null;
    return ray.origin.add(ray.direction.scale(dist)).x;
  };

  let firstInsertDone = false;
  const insertAt = (x) => {
    if (x !== null) machine.setSliderX(x);
    if (!game.insert()) return;
    if (!firstInsertDone) {
      firstInsertDone = true;
      hud.hideHint();
    }
  };

  let downAt = 0;
  let downPos = { x: 0, y: 0 };
  let wasAwakeOnDown = false;
  scene.onPointerObservable.add((info) => {
    const e = info.event;
    switch (info.type) {
      case BABYLON.PointerEventTypes.POINTERDOWN:
        wasAwakeOnDown = isAwake(); // 깨우기 전에 이전 상태를 기억해 둔다
        wake();
        downAt = performance.now();
        downPos = { x: e.clientX, y: e.clientY };
        dragMode = null;
        sfx.resume();
        break;
      case BABYLON.PointerEventTypes.POINTERUP: {
        const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        if (moved > 8 || performance.now() - downAt > 450) break;
        if (hud.settingsOpen) {
          hud.setSettingsOpen(false);
          wake();
          break;
        }
        if (!wasAwakeOnDown) break; // 딤 상태에서의 첫 터치는 깨우기만 한다
        wake();
        if (game.setupMode) {
          const hit = scene.pick(scene.pointerX, scene.pointerY, (m) => fieldMeshes.includes(m));
          if (hit?.hit && hit.pickedPoint) game.placeCoinAt(hit.pickedPoint);
        } else {
          insertAt(pointerToX());
        }
        break;
      }
    }
  });

  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());
  window.addEventListener("keydown", (e) => {
    held.add(e.code);
    wake();
    if (e.repeat) return;
    switch (e.code) {
      case "Space":
        e.preventDefault();
        sfx.resume();
        insertAt(null);
        break;
      case "KeyT":
        toggleAuto();
        break;
      case "KeyM":
        toggleSound();
        break;
      case "KeyE":
        toggleSetup();
        break;
      case "Escape":
        hud.setSettingsOpen(false);
        break;
      default:
        break;
    }
  });

  const toggleAuto = () => {
    game.autoDrop = !game.autoDrop;
    game.autoTimer = 0;
    sfx.resume();
    hud.setAuto(game.autoDrop);
  };
  const toggleSound = () => {
    sfx.setMuted(!sfx.muted);
    hud.setMuted(sfx.muted);
  };
  const toggleSetup = () => {
    game.setSetupMode(!game.setupMode);
    hud.setSetup(game.setupMode);
    if (game.setupMode) hud.setSettingsOpen(true);
  };

  hud.el.settingsBtn.addEventListener("click", () => {
    wake();
    hud.setSettingsOpen(!hud.settingsOpen);
  });
  hud.el.closeBtn.addEventListener("click", () => hud.setSettingsOpen(false));
  hud.el.refill.addEventListener("click", () => game.addCoins(50));
  hud.el.auto.addEventListener("click", toggleAuto);
  hud.el.sound.addEventListener("click", toggleSound);
  hud.el.setup.addEventListener("click", toggleSetup);
  hud.el.presets.addEventListener("click", (ev) => {
    const key = ev.target?.dataset?.preset;
    if (key) game.applyPreset(key);
  });

  hud.el.share.addEventListener("click", async () => {
    try {
      const { url, chars } = await buildShareUrl(game);
      history.replaceState(null, "", url);
      try {
        await navigator.clipboard.writeText(url);
        hud.toast(`링크를 복사했습니다 · ${(chars / 1024).toFixed(1)}KB`);
      } catch {
        hud.toast("주소창에 링크를 넣었습니다 — 복사해 주세요");
      }
    } catch (err) {
      console.warn(err);
      hud.toast("링크를 만들지 못했습니다");
    }
  });

  // ---------- PWA: 설치 + 업데이트 알림 ----------
  // 새 버전을 몰래 갈아끼우지 않는다. 배너로 알리고, 누르면 그때 적용한다.
  const updateEl = document.getElementById("update");
  const updateBtn = document.getElementById("btn-update");
  const buildInfo = document.getElementById("build-info");
  buildInfo.textContent = `빌드 ${new Date(__BUILD_TIME__).toLocaleString("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  })}`;

  const applyUpdate = registerSW({
    onNeedRefresh() {
      updateEl.hidden = false;
      requestAnimationFrame(() => updateEl.classList.add("show"));
    },
    onRegisteredSW(_url, reg) {
      // 켜둔 채로 며칠 지나는 화면이라 주기적으로 새 버전을 확인한다
      if (reg) setInterval(() => reg.update(), 30 * 60 * 1000);
    },
  });
  updateBtn.addEventListener("click", () => {
    updateBtn.textContent = "적용 중…";
    applyUpdate(true);
  });

  hud.setSetup(false);
  hud.setMuted(false);
  game.autoDrop = true; // 방치형이 기본이다
  hud.setAuto(true);

  // ---------- 루프 ----------
  let fpsAcc = 0;
  let clockAcc = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    game.update(dt);

    // 슬라이더: 방향키/AD로 좌우
    let dir = 0;
    if (held.has("ArrowLeft") || held.has("KeyA")) dir -= 1;
    if (held.has("ArrowRight") || held.has("KeyD")) dir += 1;
    if (dir) machine.setSliderX(machine.getSliderX() + dir * CHUTE.slideSpeed * dt);
    // 코인 러시 동안 마퀴가 빠르게 번쩍인다
    const now = performance.now();
    machine.marqueeMat.emissiveIntensity = game.rushing
      ? 1.5 + 1.1 * Math.sin(now / 90)
      : 0.85 + 0.25 * Math.sin(now / 900);

    // 설정 시트를 열어두거나 세팅 모드면 계속 깨어 있는다
    if (hud.settingsOpen || game.setupMode) wake();
    else if (!isAwake()) document.body.classList.remove("awake");

    clockAcc += dt;
    if (clockAcc > 1) {
      clockAcc = 0;
      updateClock();
    }

    fpsAcc += dt;
    if (fpsAcc > 0.5) {
      fpsAcc = 0;
      hud.setFps(Math.round(engine.getFps()));
    }
  });

  // 개발용 핸들 (콘솔에서 즉시 튜닝)
  window.__cd = { BABYLON, scene, engine, camera, game, machine, pool, sfx, hud,
                  lights: { key, warm, cool }, shadowGen, pipeline, ssao, glow, ground };

  await scene.whenReadyAsync();

  document.getElementById("loader").classList.add("hide");
  hudRoot.hidden = false;
  setTimeout(() => document.getElementById("loader").remove(), 800);

  // 딤 상태에선 30fps로 그린다 — 물리는 실시간 델타로 계속 정확히 돈다.
  // 방치해두는 화면이라 이 절반이 그대로 전력 절약이 된다.
  let lastDraw = 0;
  engine.runRenderLoop(() => {
    const now = performance.now();
    if (!isAwake() && now - lastDraw < 32) return;
    lastDraw = now;
    scene.render();
  });
  // 화면 회전·리사이즈 때 다시 맞춘다
  const refit = () => {
    engine.resize();
    fitCamera();
  };
  window.addEventListener("resize", refit);
  window.addEventListener("orientationchange", () => setTimeout(refit, 150));

  hud.toast("동전을 넣어보세요");
  return scene;
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById("loader");
  if (l) l.innerHTML = `<p style="color:#ff8a8a">시작 실패: ${err?.message ?? err}</p>`;
});
