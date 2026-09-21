import * as BABYLON from "@babylonjs/core";
import { COIN, EVENT } from "./config.js";
import { createCoinMaterial, createJumboMaterial } from "./materials.js";

const V3 = BABYLON.Vector3;

/**
 * 코인 풀.
 * - 메쉬: 마스터 1개 + GPU 인스턴스 N개 (드로우콜 1회)
 * - 물리: 코인마다 PhysicsShapeCylinder 1개. 풀에서 빼둘 때 충돌 필터를 0으로 만들어
 *   시뮬레이션에서 제외한다 (모션 타입 전환이나 원거리 순간이동보다 안전하다)
 * 질량은 셰이프에서 자동 계산된 값을 그대로 쓴다. 코인끼리는 동일 질량이고
 * 나머지 상대(바닥/벽/푸셔)는 무한 질량이라 절대값은 결과에 영향을 주지 않는다.
 */
export class CoinPool {
  constructor(scene, shadowGen) {
    this.scene = scene;
    this.entries = [];
    this.byBody = new Map();
    this.activeCount = 0;
    this._cursor = 0;

    const uvCap = new BABYLON.Vector4(0, 0, 0.5, 1);
    const uvSide = new BABYLON.Vector4(0.5, 0, 1, 1);
    const makeMaster = (name, r, h, mat) => {
      const m = BABYLON.MeshBuilder.CreateCylinder(
        name,
        { diameter: r * 2, height: h, tessellation: 36, faceUV: [uvCap, uvSide, uvCap] },
        scene
      );
      m.material = mat;
      m.isVisible = false; // 마스터는 숨겨도 인스턴스는 그려진다
      m.isPickable = false;
      m.receiveShadows = true;
      m.alwaysSelectAsActiveMesh = true;
      if (shadowGen) shadowGen.addShadowCaster(m, true);
      return m;
    };

    this.jumboR = COIN.r * EVENT.jumboScale;
    this.jumboH = COIN.h * EVENT.jumboScale * EVENT.jumboThick;
    this.master = makeMaster("coinMaster", COIN.r, COIN.h, createCoinMaterial(scene));
    this.jumboMaster = makeMaster("jumboMaster", this.jumboR, this.jumboH, createJumboMaterial(scene));

    for (let i = 0; i < COIN.max; i++) this.entries.push(this._create(i, false));
    for (let i = 0; i < EVENT.jumboPool; i++) this.entries.push(this._create(COIN.max + i, true));
  }

  _create(i, jumbo) {
    const mesh = (jumbo ? this.jumboMaster : this.master).createInstance(`coin${i}`);
    mesh.rotationQuaternion = BABYLON.Quaternion.Identity();
    mesh.position.set(0, -6 - i * 0.001, 0);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.setEnabled(false);

    // 셰이프는 코인마다 따로 만든다. 충돌 필터를 개별로 꺼야 풀링이 안전하다.
    const r = jumbo ? this.jumboR : COIN.r;
    const h = jumbo ? this.jumboH : COIN.h;
    const shape = new BABYLON.PhysicsShapeCylinder(
      new V3(0, -h / 2, 0),
      new V3(0, h / 2, 0),
      r,
      this.scene
    );
    shape.material = { friction: COIN.friction, restitution: COIN.restitution };

    const body = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.DYNAMIC, false, this.scene);
    body.shape = shape;
    body.setLinearDamping(COIN.linDamp);
    body.setAngularDamping(COIN.angDamp);

    const entry = { mesh, body, shape, jumbo, active: false, index: i, queued: false };
    this._sleep(entry);
    this.byBody.set(body, entry);
    return entry;
  }

  /** 다이내믹 바디를 즉시 순간이동시키는 정석 절차 (한 스텝만 프리스텝을 연다) */
  _teleport(entry, pos, quat) {
    const { mesh, body } = entry;
    body.setLinearVelocity(V3.ZeroReadOnly);
    body.setAngularVelocity(V3.ZeroReadOnly);
    mesh.position.copyFrom(pos);
    if (quat) mesh.rotationQuaternion.copyFrom(quat);
    body.disablePreStep = false;
    this.scene.onAfterPhysicsObservable.addOnce(() => {
      body.disablePreStep = true;
    });
  }

  /** 가장 오래 쉰 코인을 재사용. 남는 게 없으면 null */
  _take(jumbo = false) {
    const n = this.entries.length;
    for (let k = 1; k <= n; k++) {
      const idx = (this._cursor + k) % n;
      const e = this.entries[idx];
      if (!e.active && e.jumbo === jumbo) {
        this._cursor = idx;
        return e;
      }
    }
    return null;
  }

  /** 시뮬레이션에서 빼둔다: 아무와도 충돌하지 않고, 중력도 받지 않아 그 자리에서 잠든다 */
  _sleep(entry) {
    entry.shape.filterMembershipMask = 0;
    entry.shape.filterCollideMask = 0;
    entry.body.setGravityFactor(0);
    entry.body.setLinearVelocity(V3.ZeroReadOnly);
    entry.body.setAngularVelocity(V3.ZeroReadOnly);
    entry.mesh.setEnabled(false);
  }

  _activate(entry) {
    entry.active = true;
    this.activeCount++;
    entry.shape.filterMembershipMask = 1;
    entry.shape.filterCollideMask = 0xffffffff;
    entry.body.setGravityFactor(1);
    entry.mesh.setEnabled(true);
  }

  /** 시작 시 미리 깔아두는 코인 — 지정한 자리에 거의 눕혀서 배치 */
  place(x, y, z, yaw, tilt = 0.06) {
    const entry = this._take();
    if (!entry) return null;
    this._activate(entry);
    const q = BABYLON.Quaternion.FromEulerAngles(
      (Math.random() - 0.5) * tilt,
      yaw,
      (Math.random() - 0.5) * tilt
    );
    this._teleport(entry, new V3(x, y, z), q);
    return entry;
  }

  /** 슈트 입구에 코인을 놓는다. 이후 이동은 전부 물리가 한다. */
  /** 저장된 상태를 그대로 복원할 때 — 위치와 자세를 정확히 지정한다 */
  placeExact(pos, quat, jumbo = false) {
    const entry = this._take(jumbo);
    if (!entry) return null;
    this._activate(entry);
    this._teleport(entry, pos, quat);
    return entry;
  }

  spawn(pos, vel, jumbo = false) {
    const entry = this._take(jumbo);
    if (!entry) return null;

    const q = BABYLON.Quaternion.FromEulerAngles(
      (Math.random() - 0.5) * 0.25,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.25
    );
    this._activate(entry);
    this._teleport(entry, pos, q);
    if (vel) {
      entry.body.setLinearVelocity(
        new V3(vel.x + (Math.random() - 0.5) * 0.15, vel.y, vel.z * (0.94 + Math.random() * 0.12))
      );
    }
    entry.body.setAngularVelocity(
      new V3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2)
    );
    return entry;
  }

  despawn(entry) {
    if (!entry.active) return;
    entry.active = false;
    this.activeCount--;
    this._sleep(entry);
  }

  entryOfBody(body) {
    return this.byBody.get(body);
  }

  get available() {
    return COIN.max - this.activeCount;
  }

  get jumboReady() {
    return this.entries.some((e) => e.jumbo && !e.active);
  }
}
