// GitHub Pages처럼 하위 경로(/coindodger/)로 배포될 수 있으므로 에셋은 이 값을 기준으로 찾는다.
// Vite가 빌드 때 치환하고, 헤드리스 Node 실행에서는 import.meta.env가 없어 "/"로 떨어진다.
export const BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";

// 단위계: 1 unit = 10 cm, 시간 = 초.
// 따라서 중력은 9.81 m/s² = 98.1 unit/s². 실제 스케일과 물리적으로 동일하되,
// 물체 크기가 0.1~10 unit 범위에 들어와 솔버 정밀도가 가장 좋은 구간에서 돈다.
export const GRAVITY = -98.1;
export const SUB_STEP_MS = 1000 / 240; // 240Hz 고정 서브스텝

export const FIELD = {
  halfW: 1.25, // 폭 25cm
  backZ: -1.6,
  frontZ: 1.6,
  floorT: 0.3,
  wallH: 2.3,
  backWallTop: 1.3, // 스크레이퍼 역할만 하면 되므로 낮게 — 슈트가 그 위로 지나간다
  wallT: 0.16,
};

// 푸셔: 하단 몸통(미는 면) + 그 위를 덮는 상단 데크 플레이트.
// 플레이트는 항상 뒷벽 아래까지 뻗어 있어서, 뒷벽이 스크레이퍼 역할을 한다.
// 실제 기계와 같은 원리: 플레이트가 후퇴할 때 뒷벽이 코인을 붙잡아
// 코인이 플레이트 기준으로 앞으로 밀려나며 매 사이클 전진한다.
export const PUSHER = {
  w: 2.36,
  bodyD: 1.2,
  bodyH: 0.5,
  plateD: 1.8,
  plateT: 0.06,
  zMax: -1.1, // 최대 전진 위치
  stroke: 0.45,
  period: 3.0,
};

export const DECK_Y = PUSHER.bodyH + PUSHER.plateT; // 상단 데크 높이 0.56

export const COIN = {
  r: 0.21, // 지름 4.2cm
  h: 0.05, // 두께 5mm
  mass: 0.01,
  friction: 0.33,
  restitution: 0.06,
  linDamp: 0.2,
  angDamp: 0.6,
  max: 280, // 동시 존재 상한
};

// 실제 기계의 투입 경로: 상단 투입구 → 슈트(경사로)를 미끄러져 내려가 → 뒷벽에 맞고 덱에 낙하.
// 코인은 이 값들로 "순간이동"하지 않는다. 슈트 입구에 놓일 뿐이고 이후는 전부 물리다.
// 실제 기계의 투입 경로: 투입구 → 슈트를 미끄러져 내려가 → 스토퍼에 막혀 덱 위로 낙하.
//
// 슈트 전체가 착지 지점(z≈-1.2)보다 "뒤"에 있다. 카메라가 앞에 있으므로
// 뒤쪽 물체는 원리적으로 플레이필드를 가릴 수 없다 — 시야가 트인다.
// 실제 기계의 투입 경로: 투입구 → 완만한 슈트를 천천히 미끄러져 내려가 → 덱 위로 낙하.
//
// 경사를 마찰각(약 1.2°) 바로 위인 5°로 잡아 코인이 느리게 기어 내려온다.
// 빠져나올 때 속도가 작아서 스토퍼 없이도 덱 뒤쪽(z≈-1.2)에 떨어진다.
// 스토퍼를 두면 그 틈에 대형 동전이 끼기 때문에 아예 없앴다.
//
// 슈트 전체가 착지 지점보다 뒤에 있다 — 카메라가 앞에 있으니 플레이필드를 가릴 수 없다.
export const CHUTE = {
  topY: 1.99,
  topZ: -2.7,
  endY: 1.9,
  endZ: -1.7,
  width: 2.2,
  thickness: 0.05,
  railH: 0.16,
  friction: 0.02,
  restitution: 0.02,
  slotY: 2.12,
  slotZ: -2.38,
  spawnY: 2.08,
  spawnZ: -2.35,
  slideLimit: 0.88,
  slideSpeed: 1.5,
  insertVel: { x: 0, y: -0.2, z: 1.2 },
};

// 시점은 고정이다. 사용자가 돌리거나 당길 수 없고, 화면비에 맞춰 반경만 자동으로 잡는다.
export const CAMERA = {
  alpha: Math.PI / 2,
  beta: 0.8,
  fov: 0.62,
  // 목표점은 기계 중심보다 살짝 아래 — 그래야 기계가 화면 위쪽에 앉는다.
  target: [0, 0.68, 0.2],
  // 담아야 할 범위: 뒤쪽 투입구부터 배출 립 아래까지. 마퀴/후드는 잘려도 된다.
  // 세로 화면에서는 가로(1.5)가 제약이라 세로 값이 커져도 손해가 없다.
  fitHalfW: 1.5,
  fitHalfH: 3.15,
  fitPad: 1.04,
};

// ---- 이벤트 ----
// 대형 동전은 연출이 아니라 진짜로 크고 무거운 강체다 (부피 ~7배 → 질량도 ~7배).
// 더미에 박히면 주변을 밀어내고, 배출구로 떨어뜨리면 코인 러시가 터진다.
export const EVENT = {
  jumboEvery: [16, 30], // 이 범위에서 무작위로 등장
  jumboScale: 1.6,
  jumboThick: 1.25,
  jumboValue: 5,
  jumboSlide: 0.7, // 대형은 폭이 커서 가드레일 안쪽까지만
  jumboPool: 8,
  rushCoins: 12,
  rushEvery: 0.16, // 초당 약 6개씩 쏟아진다
};

export const WALLET_START = 100;

// 시작할 때 미리 깔아두는 코인 (실제 기계는 절대 비어 있지 않다)
export const PREFILL = { lower: 92, upper: 64 };

// 동시 접촉 수가 너무 커지면 물리 엔진이 불안정해진다. 이 이상은 투입을 막는다.
export const FIELD_CAP = 230;
