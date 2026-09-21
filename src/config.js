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
  frontZ: 1.8,
  // 앞쪽 구간은 바닥이 좁아져 양옆이 낙하구가 된다.
  // 실제 기계와 같은 구조로, 밀려난 코인 일부가 여기로 빠지며 개체수가 스스로 조절된다.
  gutterZ: 0.6,
  frontHalfW: 0.97,
  floorT: 0.3,
  wallH: 2.3,
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
export const CHUTE = {
  // 경사로 (정지 강체, 미끄러운 재질)
  topY: 2.35,
  topZ: 1.08,
  endY: 1.75,
  endZ: -0.15,
  width: 1.9,
  thickness: 0.05,
  railH: 0.13,
  friction: 0.06,
  restitution: 0.02,
  // 좌우로 미는 투입구 슬라이더 (실제 기종의 mechanical slider)
  slotY: 2.8,
  slotZ: 1.0,
  // 코인이 놓이는 자리 — 경사로 위끝에서 살짝 아래, 표면 바로 위
  spawnY: 2.7,
  spawnZ: 1.0,
  slideLimit: 0.82,
  slideSpeed: 1.5, // unit/s
  // 투입 순간 코인에 주는 속도 (손으로 밀어 넣는 정도)
  insertVel: { x: 0, y: -0.55, z: -1.1 },
};

// 시점은 고정이다. 사용자가 돌리거나 당길 수 없고, 화면비에 맞춰 반경만 자동으로 잡는다.
export const CAMERA = {
  alpha: Math.PI / 2,
  beta: 0.8,
  fov: 0.62,
  // 목표점은 기계 중심보다 살짝 아래 — 그래야 기계가 화면 위쪽에 앉아
  // 아래쪽 조작부(슬라이더·버튼)가 플레이필드를 덜 가린다.
  target: [0, 0.68, 0.2],
  // 담아야 할 범위는 "장식을 뺀 핵심"이다 — 투입구(y 2.9)부터 배출 립 아래(y -0.9)까지.
  // 위쪽 마퀴/후드는 잘려도 된다. 그래야 플레이필드가 크게 보인다.
  //  - 반폭 1.5 = 좌우 벽 바깥면
  //  - 반높이 2.8 = (높이 3.8·cos44° + 깊이 3.6·sin44°) / 2 + 여유 — 비스듬히 본 세로 투영
  fitHalfW: 1.5,
  fitHalfH: 2.8,
  fitPad: 1.04,
};

export const WALLET_START = 100;

// 시작할 때 미리 깔아두는 코인 (실제 기계는 절대 비어 있지 않다)
export const PREFILL = { lower: 80, upper: 56 };

// 동시 접촉 수가 너무 커지면 물리 엔진이 불안정해진다. 이 이상은 투입을 막는다.
export const FIELD_CAP = 230;
