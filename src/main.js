import * as BABYLON from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

import { GRAVITY, SUB_STEP_MS, CAMERA, CHUTE, BASE_URL } from "./config.js";
import { createEnvironment } from "./materials.js";
import { buildMachine } from "./machine.js";
import { CoinPool } from "./coins.js";
import { Game } from "./game.js";
import { Hud } from "./hud.js";
import { Sfx } from "./audio.js";
import { buildShareUrl, decodeState, readStateParam } from "./state.js";

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

  // ---------- 카메라 ----------
  const camera = new BABYLON.ArcRotateCamera(
    "cam",
    CAMERA.alpha,
    CAMERA.beta,
    10,
    new V3(...CAMERA.target),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerBetaLimit = CAMERA.betaMin;
  camera.upperBetaLimit = CAMERA.betaMax;
  // 화면비에 맞춰 기계가 항상 화면에 꽉 차게 반경을 잡는다
  const fitCamera = () => {
    const aspect = engine.getAspectRatio(camera) || 1;
    const vHalf = Math.tan(camera.fov / 2);
    const hHalf = vHalf * aspect;
    const r = Math.max(CAMERA.fitHalfW / hHalf, CAMERA.fitHalfH / vHalf) * CAMERA.fitPad;
    camera.lowerRadiusLimit = r * 0.5;
    camera.upperRadiusLimit = r * 1.6;
    return r;
  };
  camera.radius = fitCamera();
  camera.lowerAlphaLimit = CAMERA.alpha - CAMERA.alphaSpread;
  camera.upperAlphaLimit = CAMERA.alpha + CAMERA.alphaSpread;
  camera.wheelDeltaPercentage = 0.02;
  camera.panningSensibility = 0;
  camera.inertia = 0.82;
  camera.minZ = 0.1;
  camera.maxZ = 200;
  camera.fov = 0.62;

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

  // ---------- 입력 ----------
  // 조준은 마우스로 아무 데나 찍는 게 아니라, 실제 기종처럼 투입구 슬라이더를 좌우로 민다.
  let lastInteract = performance.now();
  let userZoomed = false;
  let dragMode = null; // 'slider' | null
  const held = new Set();

  const sliderPlane = BABYLON.Plane.FromPositionAndNormal(
    new V3(0, CHUTE.slotY, CHUTE.slotZ),
    new V3(0, 0, 1)
  );
  const isSliderMesh = (m) => m === machine.knob || m === machine.meshes.slotHousing || m === machine.meshes.slotMouth;
  const fieldMeshes = [machine.meshes.floor, machine.meshes.frontFloor, machine.meshes.pusherPlate];

  const pointerToSlider = () => {
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, BABYLON.Matrix.Identity(), camera);
    const dist = ray.intersectsPlane(sliderPlane);
    if (dist === null) return;
    machine.setSliderX(ray.origin.add(ray.direction.scale(dist)).x);
  };

  let downAt = 0;
  let downPos = { x: 0, y: 0 };
  scene.onPointerObservable.add((info) => {
    const e = info.event;
    switch (info.type) {
      case BABYLON.PointerEventTypes.POINTERDOWN: {
        downAt = performance.now();
        downPos = { x: e.clientX, y: e.clientY };
        lastInteract = performance.now();
        sfx.resume();
        const hit = scene.pick(scene.pointerX, scene.pointerY, isSliderMesh);
        if (hit?.hit) {
          dragMode = "slider";
          camera.detachControl();
          pointerToSlider();
        }
        break;
      }
      case BABYLON.PointerEventTypes.POINTERMOVE:
        if (dragMode === "slider") pointerToSlider();
        break;
      case BABYLON.PointerEventTypes.POINTERUP: {
        const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        const tapped = moved < 6 && performance.now() - downAt < 450;
        if (dragMode === "slider") {
          dragMode = null;
          camera.attachControl(canvas, true);
          if (tapped) game.insert(); // 투입구를 톡 누르면 투입
        } else if (tapped) {
          if (game.setupMode) {
            const hit = scene.pick(scene.pointerX, scene.pointerY, (m) => fieldMeshes.includes(m));
            if (hit?.hit && hit.pickedPoint) game.placeCoinAt(hit.pickedPoint);
          } else {
            game.insert();
          }
        }
        lastInteract = performance.now();
        break;
      }
      case BABYLON.PointerEventTypes.POINTERWHEEL:
        lastInteract = performance.now();
        userZoomed = true;
        break;
    }
  });

  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());
  window.addEventListener("keydown", (e) => {
    held.add(e.code);
    if (e.repeat) return;
    switch (e.code) {
      case "Space":
        e.preventDefault();
        sfx.resume();
        game.insert();
        break;
      case "KeyT":
        toggleAuto();
        break;
      case "KeyR":
        resetCamera();
        break;
      case "KeyM":
        toggleSound();
        break;
      case "KeyE":
        toggleSetup();
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
  const resetCamera = () => {
    camera.alpha = CAMERA.alpha;
    camera.beta = CAMERA.beta;
    camera.radius = fitCamera();
    camera.target.copyFromFloats(...CAMERA.target);
    userZoomed = false;
  };
  const toggleSetup = () => {
    game.setSetupMode(!game.setupMode);
    hud.setSetup(game.setupMode);
  };

  hud.el.insert.addEventListener("click", () => {
    sfx.resume();
    game.insert();
  });
  hud.el.auto.addEventListener("click", toggleAuto);
  hud.el.sound.addEventListener("click", toggleSound);
  hud.el.reset.addEventListener("click", resetCamera);
  hud.el.setup.addEventListener("click", toggleSetup);
  // 투입 위치 슬라이더 (터치에서도 쓸 수 있는 실제 조작부)
  const sliderInput = hud.el.slider;
  const syncSliderInput = () => {
    const v = machine.getSliderX() / CHUTE.slideLimit;
    if (Math.abs(parseFloat(sliderInput.value) - v) > 0.004) sliderInput.value = String(v);
  };
  sliderInput.addEventListener("input", () => {
    machine.setSliderX(parseFloat(sliderInput.value) * CHUTE.slideLimit);
    lastInteract = performance.now();
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

  hud.el.presets.addEventListener("click", (ev) => {
    const key = ev.target?.dataset?.preset;
    if (key) game.applyPreset(key);
  });
  hud.setSetup(false);
  hud.setAuto(false);
  hud.setMuted(false);

  // ---------- 루프 ----------
  let fpsAcc = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    game.update(dt);

    // 슬라이더: 방향키/AD로 좌우
    let dir = 0;
    if (held.has("ArrowLeft") || held.has("KeyA")) dir -= 1;
    if (held.has("ArrowRight") || held.has("KeyD")) dir += 1;
    if (dir) {
      machine.setSliderX(machine.getSliderX() + dir * CHUTE.slideSpeed * dt);
      lastInteract = performance.now();
    }
    syncSliderInput();
    machine.marqueeMat.emissiveIntensity = 0.85 + 0.25 * Math.sin(performance.now() / 900);

    // 오래 가만히 두면 카메라가 아주 느리게 흔들린다
    const idle = (performance.now() - lastInteract) / 1000;
    if (idle > 8) {
      camera.alpha = CAMERA.alpha + Math.sin(performance.now() / 6400) * 0.07;
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

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => {
    engine.resize();
    const r = fitCamera();
    camera.radius = Math.min(Math.max(camera.radius, camera.lowerRadiusLimit), camera.upperRadiusLimit);
    if (!userZoomed) camera.radius = r;
  });

  hud.toast("동전을 넣어보세요");
  return scene;
}

boot().catch((err) => {
  console.error(err);
  const l = document.getElementById("loader");
  if (l) l.innerHTML = `<p style="color:#ff8a8a">시작 실패: ${err?.message ?? err}</p>`;
});
