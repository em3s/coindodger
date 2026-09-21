import * as BABYLON from "@babylonjs/core";
import { FIELD, PUSHER, DECK_Y, CHUTE } from "./config.js";
import {
  createDeckMaterial,
  createCabinetMaterial,
  createTrimMaterial,
  createGlassMaterial,
  createNeonMaterial,
} from "./materials.js";

const V3 = BABYLON.Vector3;

function box(name, w, h, d, pos, mat, scene) {
  const m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  m.position.copyFromFloats(pos[0], pos[1], pos[2]);
  m.material = mat;
  m.receiveShadows = true;
  return m;
}

/** from→to 방향으로 눕힌 박스. localOffset은 (오른쪽, 위, 진행방향) 기준 */
function orientedBox(name, from, to, w, h, localOffset, mat, scene) {
  const dir = to.subtract(from);
  const len = dir.length();
  const fwd = dir.normalize();
  let right = V3.Cross(V3.Up(), fwd);
  if (right.lengthSquared() < 1e-6) right = new V3(1, 0, 0);
  right.normalize();
  const up = V3.Cross(fwd, right).normalize();

  const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: len }, scene);
  mesh.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(
    BABYLON.Vector3.RotationFromAxis(right, up, fwd)
  );
  mesh.position = from
    .add(to)
    .scale(0.5)
    .add(right.scale(localOffset.x))
    .add(up.scale(localOffset.y))
    .add(fwd.scale(localOffset.z));
  mesh.material = mat;
  mesh.receiveShadows = true;
  return mesh;
}

function staticBody(mesh, scene, friction, restitution) {
  const agg = new BABYLON.PhysicsAggregate(
    mesh,
    BABYLON.PhysicsShapeType.BOX,
    { mass: 0, friction, restitution },
    scene
  );
  return agg;
}

/** 물리 없는 장식 메쉬 */
function decor(mesh) {
  mesh.isPickable = false;
  return mesh;
}

export function buildMachine(scene, shadowGen) {
  const deckMat = createDeckMaterial(scene);
  const bodyDeckMat = createDeckMaterial(scene, new BABYLON.Color3(0.19, 0.21, 0.26));
  const cabMat = createCabinetMaterial(scene);
  const trimMat = createTrimMaterial(scene);
  const glassMat = createGlassMaterial(scene);

  const depth = FIELD.frontZ - FIELD.backZ;
  const midZ = (FIELD.frontZ + FIELD.backZ) / 2;
  const innerW = FIELD.halfW * 2;

  // ---- 하단 플레이필드: 뒤쪽은 전폭, 앞쪽은 좁아져 양옆에 낙하구가 생긴다 ----
  const backDepth = FIELD.gutterZ - FIELD.backZ;
  const floor = box(
    "floor",
    innerW,
    FIELD.floorT,
    backDepth,
    [0, -FIELD.floorT / 2, FIELD.backZ + backDepth / 2],
    deckMat,
    scene
  );
  staticBody(floor, scene, 0.3, 0.08);

  const frontDepth = FIELD.frontZ - FIELD.gutterZ;
  const frontFloor = box(
    "frontFloor",
    FIELD.frontHalfW * 2,
    FIELD.floorT,
    frontDepth,
    [0, -FIELD.floorT / 2, FIELD.gutterZ + frontDepth / 2],
    deckMat,
    scene
  );
  staticBody(frontFloor, scene, 0.3, 0.08);

  // 낙하구 안쪽 벽(장식) — 코인이 빠지는 통로를 눈으로 알 수 있게
  for (const sx of [-1, 1]) {
    const lip = box(
      `gutterLip${sx}`,
      0.06,
      0.5,
      frontDepth,
      [sx * (FIELD.frontHalfW + 0.03), -0.55, FIELD.gutterZ + frontDepth / 2],
      trimMat,
      scene
    );
    decor(lip);
  }

  // ---- 좌우 벽 ----
  for (const sx of [-1, 1]) {
    const wall = box(
      `wall${sx}`,
      FIELD.wallT,
      FIELD.wallH,
      depth,
      [sx * (FIELD.halfW + FIELD.wallT / 2), FIELD.wallH / 2 - FIELD.floorT, midZ],
      cabMat,
      scene
    );
    staticBody(wall, scene, 0.2, 0.05);
  }

  // ---- 뒷벽: 밑단이 데크 바로 위에 떠 있어 푸셔 플레이트가 그 아래로 지나간다.
  //      이 벽면이 스크레이퍼가 되어 코인을 매 사이클 앞으로 밀어낸다.
  //      높이는 낮게 — 그래야 슈트가 그 위로 코인을 넘길 수 있다. ----
  const backH = FIELD.backWallTop - DECK_Y;
  const backWall = box(
    "backWall",
    innerW + FIELD.wallT * 2,
    backH,
    FIELD.wallT,
    [0, DECK_Y + 0.02 + backH / 2, FIELD.backZ - FIELD.wallT / 2],
    cabMat,
    scene
  );
  staticBody(backWall, scene, 0.2, 0.05);

  // 배경 판 (물리 없음) — 캐비닛 안쪽이 뚫려 보이지 않게
  const backPanel = box(
    "backPanel",
    innerW + FIELD.wallT * 2,
    FIELD.wallH + 1.2,
    0.08,
    [0, (FIELD.wallH + 1.2) / 2 - FIELD.floorT, FIELD.backZ - 1.35],
    cabMat,
    scene
  );
  decor(backPanel);

  // ---- 푸셔 (ANIMATED 강체 + 컴파운드 셰이프) ----
  const pusherRoot = new BABYLON.TransformNode("pusherRoot", scene);
  pusherRoot.position.set(0, 0, PUSHER.zMax);

  const pusherBody = box(
    "pusherBody",
    PUSHER.w,
    PUSHER.bodyH,
    PUSHER.bodyD,
    [0, PUSHER.bodyH / 2, PUSHER.bodyD / 2],
    bodyDeckMat,
    scene
  );
  pusherBody.parent = pusherRoot;

  const pusherPlate = box(
    "pusherPlate",
    PUSHER.w,
    PUSHER.plateT,
    PUSHER.plateD,
    [0, PUSHER.bodyH + PUSHER.plateT / 2, PUSHER.bodyD - PUSHER.plateD / 2],
    deckMat,
    scene
  );
  pusherPlate.parent = pusherRoot;

  const container = new BABYLON.PhysicsShapeContainer(scene);
  const pusherMat = { friction: 0.42, restitution: 0.03 };

  const bodyShape = new BABYLON.PhysicsShapeBox(
    V3.Zero(),
    BABYLON.Quaternion.Identity(),
    new V3(PUSHER.w, PUSHER.bodyH, PUSHER.bodyD),
    scene
  );
  bodyShape.material = pusherMat;
  container.addChild(bodyShape, new V3(0, PUSHER.bodyH / 2, PUSHER.bodyD / 2));

  const plateShape = new BABYLON.PhysicsShapeBox(
    V3.Zero(),
    BABYLON.Quaternion.Identity(),
    new V3(PUSHER.w, PUSHER.plateT, PUSHER.plateD),
    scene
  );
  plateShape.material = pusherMat;
  container.addChild(plateShape, new V3(0, PUSHER.bodyH + PUSHER.plateT / 2, PUSHER.bodyD - PUSHER.plateD / 2));

  const pusherPhysics = new BABYLON.PhysicsBody(
    pusherRoot,
    BABYLON.PhysicsMotionType.ANIMATED,
    false,
    scene
  );
  pusherPhysics.shape = container;
  // ACTION: 목표 트랜스폼을 주면 Havok이 필요한 속도를 스스로 계산해 밀어낸다.
  pusherPhysics.setPrestepType(BABYLON.PhysicsPrestepType.ACTION);

  // ---- 배출 트레이 (시각) ----
  const trayY = -1.05;
  const tray = box("tray", innerW + 0.6, 0.16, 1.5, [0, trayY, FIELD.frontZ + 0.55], cabMat, scene);
  decor(tray);
  const trayLip = box("trayLip", innerW + 0.6, 0.5, 0.12, [0, trayY + 0.28, FIELD.frontZ + 1.28], trimMat, scene);
  decor(trayLip);

  // ---- 캐비닛 외장 ----
  const hoodZ = FIELD.backZ - 0.2;
  const hood = box("hood", innerW + 0.8, 1.3, 0.7, [0, FIELD.wallH + 0.5, hoodZ], cabMat, scene);
  decor(hood);

  const marqueeMat = createNeonMaterial(scene, new BABYLON.Color3(1.0, 0.55, 0.12));
  const marquee = box("marquee", innerW + 0.3, 0.7, 0.08, [0, FIELD.wallH + 0.55, hoodZ + 0.36], marqueeMat, scene);
  decor(marquee);

  const trimTop = [];
  for (const sx of [-1, 1]) {
    const t = box(
      `trim${sx}`,
      0.1,
      0.1,
      depth + 0.2,
      [sx * (FIELD.halfW + FIELD.wallT), FIELD.wallH - FIELD.floorT, midZ],
      trimMat,
      scene
    );
    decor(t);
    trimTop.push(t);
  }

  const neonStripMat = createNeonMaterial(scene, new BABYLON.Color3(0.15, 0.75, 1.0));
  for (const sx of [-1, 1]) {
    const strip = box(
      `neon${sx}`,
      0.05,
      0.07,
      depth - 0.4,
      [sx * (FIELD.halfW + FIELD.wallT + 0.06), 0.35, midZ],
      neonStripMat,
      scene
    );
    decor(strip);
  }

  // 전면 유리 (물리 없음 — 순수 장식)
  const glass = BABYLON.MeshBuilder.CreatePlane(
    "glass",
    { width: innerW + 0.4, height: FIELD.wallH + 1.0 },
    scene
  );
  glass.material = glassMat;
  glass.position.set(0, (FIELD.wallH + 1.0) / 2 - FIELD.floorT, FIELD.frontZ + 1.45);
  glass.rotation.y = Math.PI;
  decor(glass);

  // ---- 투입 슈트 (기계 뒤쪽) ----
  // 실제 기계와 같은 경로: 투입구에 넣으면 코인이 경사로를 미끄러져 내려가
  // 스토퍼에 막혀 전진이 끊기고 덱 위로 떨어진다. 코인 위치를 코드로 옮기는 부분은 없다.
  //
  // 슈트 전체가 착지 지점보다 뒤에 있다 — 카메라가 앞에 있으니 플레이필드를 가릴 수 없다.
  const chuteMat = createDeckMaterial(scene, new BABYLON.Color3(0.72, 0.75, 0.8));
  chuteMat.metallic = 0.25;
  chuteMat.roughness = 0.45;
  const chuteTop = new V3(0, CHUTE.topY, CHUTE.topZ);
  const chuteEnd = new V3(0, CHUTE.endY, CHUTE.endZ);

  const chuteFloor = orientedBox(
    "chuteFloor",
    chuteTop,
    chuteEnd,
    CHUTE.width,
    CHUTE.thickness,
    V3.Zero(),
    chuteMat,
    scene
  );
  staticBody(chuteFloor, scene, CHUTE.friction, CHUTE.restitution);

  for (const sx of [-1, 1]) {
    const rail = orientedBox(
      `chuteRail${sx}`,
      chuteTop,
      chuteEnd,
      0.06,
      CHUTE.railH,
      new V3(sx * (CHUTE.width / 2 + 0.03), CHUTE.railH / 2, 0),
      trimMat,
      scene
    );
    staticBody(rail, scene, 0.1, 0.02);
  }

  // 경사로 맨 뒤 막이 — 넣은 코인이 뒤로 빠지지 않게
  const chuteBack = box(
    "chuteBack",
    CHUTE.width + 0.12,
    0.26,
    0.06,
    [0, CHUTE.topY + 0.11, CHUTE.topZ - 0.08],
    cabMat,
    scene
  );
  staticBody(chuteBack, scene, 0.1, 0.02);

  // 투입구 슬라이더 (실제 기종의 mechanical slider — 탭한 자리로 옮겨 간다)
  const slideRail = box(
    "slideRail",
    CHUTE.slideLimit * 2 + 0.5,
    0.07,
    0.1,
    [0, CHUTE.slotY + 0.15, CHUTE.slotZ],
    trimMat,
    scene
  );
  decor(slideRail);

  const slotHousing = box("slotHousing", 0.4, 0.09, 0.2, [0, CHUTE.slotY, CHUTE.slotZ], cabMat, scene);
  decor(slotHousing);

  const slotMouthMat = createNeonMaterial(scene, new BABYLON.Color3(1.0, 0.72, 0.22));
  const slotMouth = box(
    "slotMouth",
    0.22,
    0.04,
    0.03,
    [0, CHUTE.slotY + 0.05, CHUTE.slotZ + 0.11],
    slotMouthMat,
    scene
  );
  decor(slotMouth);

  const knob = BABYLON.MeshBuilder.CreateCylinder(
    "sliderKnob",
    { diameter: 0.18, height: 0.12, tessellation: 20 },
    scene
  );
  knob.material = trimMat;
  knob.position.set(0, CHUTE.slotY + 0.19, CHUTE.slotZ);

  const sliderParts = [slotHousing, slotMouth, knob];
  let sliderX = 0;
  const setSliderX = (x) => {
    sliderX = Math.max(-CHUTE.slideLimit, Math.min(CHUTE.slideLimit, x));
    for (const m of sliderParts) m.position.x = sliderX;
    return sliderX;
  };
  /** 코인이 실제로 놓이는 자리 = 투입구 입구 */
  const slotSpawn = () => new V3(sliderX, CHUTE.spawnY, CHUTE.spawnZ);

  // ---- 그림자 ----
  if (shadowGen) {
    // 슈트는 그림자 캐스터에서 뺀다 — 얕은 각도에서 자기 그림자로 새까매진다
    for (const m of [pusherBody, pusherPlate, backWall, trayLip, frontFloor]) {
      shadowGen.addShadowCaster(m, false);
    }
  }

  return {
    pusherRoot,
    pusherPhysics,
    setSliderX,
    slotSpawn,
    getSliderX: () => sliderX,
    knob,
    marqueeMat,
    neonStripMat,
    trayY,
    meshes: { floor, frontFloor, pusherBody, pusherPlate, glass, marquee, chuteFloor, slotHousing, slotMouth, knob },
  };
}

/** 사인 운동. 위치만 주면 Havok이 속도를 역산한다. */
export function pusherZ(t) {
  const center = PUSHER.zMax - PUSHER.stroke / 2;
  return center + (PUSHER.stroke / 2) * Math.sin((2 * Math.PI * t) / PUSHER.period);
}
