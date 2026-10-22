// 00 표지 — 밝은 회색 무대 위에 떠 있는 돌들. 가운데 각인 돌(BREATH SCHOOL)을 고르면
// 흩어져 있던 현무암 돌들이 "슉" 밀려났다가 각인 돌 뒤로 한 겹씩 포개지며 아치 모양의 흐름이 된다.
// 색보다 형태와 빛의 이동으로 변화를 보여준다.

import * as THREE from './vendor/three/three.module.js';
import { OBJLoader } from './vendor/three/OBJLoader.js';
import { GLTFLoader } from './vendor/three/GLTFLoader.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BG = '#c9c9c6';

// ---- 화면 마크업 ---------------------------------------------------------

const HAND_TEXT = {
  loading: ['손 인식을 준비하고 있습니다', '카메라 영상은 이 기기 밖으로 나가지 않습니다'],
  ready: ['손바닥을 화면 쪽으로 보여주세요', '손이 인식되면 화면에 표시가 나타납니다'],
  tracking: ['손을 가운데 돌에 가져다 대세요', '주먹을 쥐면 선택됩니다'],
  failed: ['카메라를 쓸 수 없습니다', '마우스로 가운데 돌을 눌러 시작하세요'],
};
let handState = 'loading';

function hintHtml(hand) {
  const [title, sub] = HAND_TEXT[hand];
  return `<i></i><span><b>${title}</b><small>${sub}</small></span>`;
}

export function coverView({ archive, toast, hand = handState }) {
  handState = hand;
  const noCam = hand === 'failed';
  const options = toast
    ? `<p class="cover-status" role="status">${toast}</p>`
    : `<button class="cover-option primary gesture-target" data-action="start-camera"${noCam ? ' disabled' : ''}><span class="opt-index">01</span><span class="opt-body"><b>손으로 체험 시작</b><small>${noCam ? '카메라를 쓸 수 없어 선택할 수 없습니다' : '손을 대고 주먹을 쥐면 선택됩니다'}</small></span><span class="opt-arrow">→</span><span class="dwell"></span></button>
       <button class="cover-option gesture-target" data-action="start-mouse"><span class="opt-index">02</span><span class="opt-body"><b>마우스로 체험</b></span><span class="opt-arrow">→</span><span class="dwell"></span></button>`;
  return `<section class="cover-stone${flowing ? ' is-flowing' : ''}" data-hand="${hand}">
    <div class="cover-canvas" data-stage3d></div>
    <header class="cover-top">
      <div class="cover-brand">제주 수중 플로깅 기록 릴레이</div>
      <div class="cover-meta">누적 기록 <span>${String(archive).padStart(3, '0')}</span></div>
    </header>
    <button class="cover-core${coreArmed ? ' gesture-target' : ''}" data-dwell="935" data-cover-core aria-label="가운데 각인 돌 선택"></button>
    <div class="cover-copy">
      <h1>오늘의 바다를<br>다음 사람에게.</h1>
      <p class="cover-lead">한 번의 수거, 남겨둔 위치, 바뀐 경로.<br>현장의 판단이 돌 한 겹이 되어 다음 참가자에게 쌓입니다.</p>
    </div>
    <div class="cover-actions">
      <p class="cover-hint" data-cover-hint>${hintHtml(hand)}</p>
      <div class="cover-options"><p class="cover-return">가운데 돌에 다시 손을 대면 처음으로 돌아갑니다</p>${options}</div>
    </div>
  </section>`;
}

// 손 인식 상태가 바뀔 때 화면 전체를 다시 그리지 않고 안내 문구만 바꾼다
export function setCoverHand(hand) {
  if (hand === handState) return;
  handState = hand;
  if (!root) return;
  root.dataset.hand = hand;
  const hint = root.querySelector('[data-cover-hint]');
  if (hint) hint.innerHTML = hintHtml(hand);
  const primary = root.querySelector('[data-action="start-camera"]');
  if (primary) {
    primary.disabled = hand === 'failed';
    primary.querySelector('small').textContent = hand === 'failed' ? '카메라를 쓸 수 없어 선택할 수 없습니다' : '손을 대고 주먹을 쥐면 선택됩니다';
  }
}

// ---- 절차적 돌 ----------------------------------------------------------

function hash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0,0,0), c(1,0,0), u), l(c(0,1,0), c(1,1,0), u), v),
           l(l(c(0,0,1), c(1,0,1), u), l(c(0,1,1), c(1,1,1), u), v), w) * 2 - 1;
}
function fbm(x, y, z, oct = 4) { let a = .5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); a *= .5; f *= 2.03; } return s; }

function rockGeometry(seed, stretch) {
  const src = new THREE.IcosahedronGeometry(1, 18);
  const pos = src.attributes.position;
  // 같은 위치의 꼭짓점을 하나로 묶어 매끈한 노멀을 얻는다
  const map = new Map(), verts = [], index = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let id = map.get(k);
    if (id === undefined) { id = verts.length / 3; map.set(k, id); verts.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    index.push(id);
  }
  src.dispose();
  // 깨진 단면처럼 보이게 하는 절단면
  const cuts = Array.from({ length: 8 + Math.floor(hash(seed, 1, 2) * 5) }, (_, j) => {
    const n = new THREE.Vector3(hash(seed, j, 3) - .5, hash(seed, j, 4) - .5, hash(seed, j, 5) - .5).normalize();
    return { n, d: .32 + hash(seed, j, 6) * .34 };
  });
  const p = new THREE.Vector3();
  const uv = [];
  for (let i = 0; i < verts.length; i += 3) {
    p.set(verts[i], verts[i + 1], verts[i + 2]).normalize();
    uv.push(.5 + Math.atan2(p.z, p.x) / (2 * Math.PI), .5 + Math.asin(p.y) / Math.PI);
    const r = 1 + fbm(p.x * 1.4 + seed, p.y * 1.4, p.z * 1.4) * .26 + fbm(p.x * 7 + seed, p.y * 7, p.z * 7, 3) * .045;
    p.multiplyScalar(r);
    for (const { n, d } of cuts) {
      const s = p.dot(n);
      if (s > d) p.addScaledVector(n, -(s - d) * .96 + fbm(p.x * 9, p.y * 9, p.z * 9 + seed, 2) * .012);
    }
    verts[i] = p.x * stretch[0]; verts[i + 1] = p.y * stretch[1]; verts[i + 2] = p.z * stretch[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function greyTexture(src, { brightness = 1, contrast = 1, repeat = 1 } = {}) {
  const tex = new THREE.Texture();
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.filter = `grayscale(1) brightness(${brightness}) contrast(${contrast})`;
    ctx.drawImage(img, 0, 0);
    tex.image = c; tex.needsUpdate = true;
  };
  img.src = src;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

// ---- 배치: 흩어진 상태와 포개진 흐름 -------------------------------------------

// [x, y, z, 크기, 늘림 xyz, 톤(0 어두움 ~ 1 밝음)]
const ROCKS = [
  [-11.8, 2.0, -1.0, 3.9, [1, 1.35, .8], .9],
  [4.6, 7.4, -5.0, 2.2, [1.3, .8, .9], .7],
  [10.6, 3.4, -1.5, 3.5, [.8, 1.5, .7], .35],
  [13.6, -3.6, 1.0, 3.8, [1, 1.2, .9], .8],
  [1.8, -8.9, -2.5, 4.0, [1.4, 1, .8], .85],
  [-14.8, .9, -2.5, 2.8, [.9, 1.4, .8], .45],
  [-4.6, -3.6, -8.0, 1.5, [1.2, .9, 1], .75],
  [13.4, 8.2, 5.0, 4.2, [1, 1.3, .9], .25],
  [-5.4, 2.6, 1.8, .5, [1, .8, .9], .9],
  [5.6, -2.2, 2.2, .42, [1.2, .9, 1], .8],
  [-4.2, -2.6, 2.6, .3, [1, 1, 1], .85],
];

function flowSlot(i, n, time) {
  // 각인 돌 뒤를 넘어가는 아치. 돌이 한 겹씩 포개져 하나의 흐름을 만든다.
  const u = i / (n - 1);
  const a = Math.PI * (.95 - u * .9);
  const drift = reduced ? 0 : Math.sin(time * .55 + u * 5) * .18;
  return {
    pos: [Math.cos(a) * 11, -.9 + Math.sin(a) * 6.6 + drift, -3.6 - Math.sin(a) * 2.4],
    rot: [.35 + u * .25, -.9 + u * 1.8 + (reduced ? 0 : Math.sin(time * .3 + i) * .04), a - Math.PI / 2],
    scale: 1.55 + Math.sin(u * Math.PI) * .35,
  };
}

// ---- 돌탑(01 이후 페이지) --------------------------------------------------
// 각인 돌을 받침으로 삼고, 큰 돌부터 작은 돌 순서로 한 겹씩 쌓는다.
const CAIRN_X = 6.2, CAIRN_BASE = -2.25, CAIRN_K = 1.12;
const STACK = [4, 3, 0, 2, 7, 5, 1];
const STACK_SCALE = [1.3, 1.2, 1.1, 1.0, .92, .84, .76].map(v => v * CAIRN_K);
// 돌마다 가운데 축 근처의 윗면·아랫면 높이를 재서, 위 돌이 아래 돌에 실제로 닿도록 얹는다 (build에서 돌을 만든 뒤 계산)
const cairnSlots = {};
let cairnTopY = 0; // 돌탑 꼭대기 윗면 높이 — 07에서 내 돌을 올릴 자리
function contactFaces(geometry) {
  // 가운데 축 근처 윗면·아랫면 높이. 가장 튀어나온 점과 평균의 사이값을 써서, 점 하나로 떠 보이지도 파묻히지도 않게 한다.
  const pos = geometry.attributes.position;
  let tmax = -Infinity, bmin = Infinity, ts = 0, tn = 0, bs = 0, bn = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (x * x + z * z > .25) continue;
    const y = pos.getY(i);
    if (y > 0) { ts += y; tn++; if (y > tmax) tmax = y; } else { bs += y; bn++; if (y < bmin) bmin = y; }
  }
  return { top: tmax * .72 + (ts / tn) * .28, bottom: bmin * .72 + (bs / bn) * .28 };
}
function computeCairn() {
  const slots = cairnSlots;
  let top = CAIRN_BASE;
  STACK.forEach((idx, k) => {
    const sc = STACK_SCALE[k], flatY = sc * (1 - .45);
    const face = contactFaces(rocks[idx].mesh.geometry);
    const y = top - face.bottom * flatY - .05;
    slots[idx] = { pos: [CAIRN_X + (hash(idx, 4, 4) - .5) * .3, y, .3], rot: [(hash(idx, 6, 1) - .5) * .16, k * 1.1, (hash(idx, 6, 2) - .5) * .14], scale: sc, flat: 1, order: k };
    top = y + face.top * flatY;
  });
  cairnTopY = top;
  // 탑 옆에 기대어 놓인 돌과 발치의 작은 돌
  slots[6] = { pos: [CAIRN_X - 2.8, -4.0, .6], rot: [.4, .6, .3], scale: .7, flat: .6, order: 2 };
  slots[8] = { pos: [CAIRN_X + 2.55, -4.05, .8], rot: [.2, 1, .1], scale: .5, flat: .4, order: 1 };
  slots[9] = { pos: [CAIRN_X - 3.05, -4.75, 1.4], rot: [.5, .2, .4], scale: .36, flat: .4, order: 1 };
  slots[10] = { pos: [CAIRN_X + 2.95, -4.65, 1.4], rot: [.1, .7, .2], scale: .3, flat: .4, order: 1 };
}

// ---- 02 FIELD KIT --------------------------------------------------------
// 가방 하나가 먼저 오고, 받으면 안에서 제품들이 차례로 나와 두 줄로 정렬된다.
// 4개씩 두 줄. 모든 제품을 같은 크기의 칸(CELL)에 맞춰 넣고, 이름은 줄마다 같은 높이에 둔다.
const CELL = { w: 2.3, h: 2.35 };
const KIT_COLS = [.5, 3.6, 6.7, 9.8], KIT_ROWS = [2.55, -2.2];
const KIT = [
  { file: 'kit_bag', rot: [.1, -.45, 0] },
  { file: 'emergency_tag', rot: [.05, -.35, 0] },
  { file: 'land_wear', rot: [.04, -.3, 0] },
  { file: 'wetsuit', rot: [.04, -.3, 0] },
  { file: 'wangnun_trace', rot: [.22, -.5, 0] },
  { file: 'fins', rot: [.95, -.6, 0] },
  { file: 'weight_belt', rot: [.9, -.4, 0] },
  { file: 'tewak', rot: [.35, -.3, 0] },
].map((d, i) => ({ ...d, slot: [KIT_COLS[i % 4], KIT_ROWS[Math.floor(i / 4)]] }));
const BAG_CLOSED = { pos: [4.6, .35, 0], scale: 2.1 };
const kitItems = [];
let kitRequested = false, kitOpen = false, kitOpenAt = 0;

export function preloadKit() {
  if (kitRequested || !scene) return;
  kitRequested = true;
  const loader = new GLTFLoader();
  loadToday(loader);
  loadMine(loader);
  loadHands(loader);
  loadBalance(loader);
  KIT.forEach((def, i) => {
    loader.load(`assets/kit/${def.file}.glb`, gltf => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      model.position.sub(c);
      // 칸 안에 들어가도록 가로·세로·깊이 중 가장 빡빡한 쪽에 맞춘다
      const fit = Math.min(CELL.w / size.x, CELL.h / size.y, CELL.w / size.z);
      const inner = new THREE.Group(); inner.add(model); inner.scale.setScalar(fit);
      const pivot = new THREE.Group(); pivot.add(inner);
      model.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material) { o.material.roughness = Math.max(.55, o.material.roughness ?? 1); } } });
      const start = BAG_CLOSED.pos;
      const item = { i, def, pivot, p: new THREE.Vector3(...start), v: new THREE.Vector3(), e: new THREE.Vector3(...def.rot), ev: new THREE.Vector3(), s: 0, sv: 0, box: new THREE.Box3(), hover: false, corr: 0 };
      pivot.visible = false;
      scene.add(pivot); kitItems[i] = item;
    });
  });
}

export function setKitOpen(open) {
  if (open === kitOpen) return;
  kitOpen = open; kitOpenAt = performance.now();
  const bag = kitItems[0];
  if (open && bag && !reduced) { bag.v.z += 14; bag.sv += 1.2; }
}

// ---- 03 TODAY 돌 ---------------------------------------------------------
// 앱의 TODAY 돌. 오른쪽(기록 보관소 쪽)에서 날아와 가운데에 뜨고, 받으면 한 바퀴 돌며 기록을 넘겨준다.
const TODAY_HOME = { pos: [4.6, .4, 0], scale: 6 };
const today = { pivot: null, p: new THREE.Vector3(16, 1, -2), v: new THREE.Vector3(), e: new THREE.Vector3(0, -1.2, 0), ev: new THREE.Vector3(), s: 0, sv: 0, spin: 0, box: new THREE.Box3() };
let todayReceived = false;

function loadToday(loader) {
  loader.load('assets/record/today_stone.glb', gltf => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    model.position.sub(c);
    const inner = new THREE.Group(); inner.add(model); inner.scale.setScalar(1 / size.y);
    model.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    today.pivot = new THREE.Group(); today.pivot.add(inner); today.pivot.visible = false;
    todayInner = inner;
    scene.add(today.pivot);
    if (mine.group) today.pivot.add(mine.group);
  });
}

// ---- 06~완료: 내 기록 돌 --------------------------------------------------
// 빈 돌 두 종류 중 하나에, 고른 기록의 문양이 앞면에 새겨진다. TODAY 돌과 같은 자리·움직임을 쓰고 모습만 바뀐다.
let todayInner = null;
const mine = { group: null, stones: [], faces: [], type: 0, canvas: null, ctx: null, tex: null, marks: [], icons: {}, anim: 0, count: 0, map: null };
// 문양은 돌에 파인 것처럼: 안쪽은 어둡게 가라앉고, 빛 받는 쪽 가장자리에 얇은 밝은 턱
const ENGRAVE_GLSL = `
  vec2 euv = (vObjPos.xy - uMin.xy) / uSize.xy;
  float face = smoothstep(.12, .45, normalize(vObjNrm).z);
  float a0 = texture2D(uEngrave, euv).a * face;
  float a1 = texture2D(uEngrave, euv + vec2(-.0035, .0035)).a * face;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .1, a0);
  diffuseColor.rgb += clamp(a1 - a0, 0., 1.) * .28;`;
function engraveMaterial(mat, geo, size, triplanar) {
  const u = { uEngrave: { value: mine.tex }, uMin: { value: geo.boundingBox.min.clone() }, uSize: { value: size.clone() }, uTri: { value: mine.map } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vObjNrm = normal;');
    const tri = triplanar ? `
      vec3 tw = abs(normalize(vObjNrm)); tw /= (tw.x + tw.y + tw.z);
      vec3 tp = vObjPos / uSize.y * .9 + .5;
      vec3 tc = texture2D(uTri, tp.yz * .5 + .25).rgb * tw.x + texture2D(uTri, tp.xz * .5 + .25).rgb * tw.y + texture2D(uTri, tp.xy * .5 + .25).rgb * tw.z;
      diffuseColor.rgb *= tc;` : '';
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec3 vObjNrm; uniform sampler2D uEngrave; uniform sampler2D uTri; uniform vec3 uMin; uniform vec3 uSize;')
      .replace('#include <map_fragment>', '#include <map_fragment>' + tri + ENGRAVE_GLSL);
  };
  mat.needsUpdate = true;
}
function mineStone(root, i, triplanar) {
  root.updateMatrixWorld(true);
  let geo = null, src = null;
  root.traverse(o => { if (o.isMesh && !geo) { geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); src = o.material; } });
  geo.computeBoundingBox(); const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
  geo.translate(-c.x, -c.y, -c.z); geo.computeBoundingBox();
  if (!geo.attributes.normal) geo.computeVertexNormals();
  let mat;
  if (triplanar) mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .92, metalness: 0 });
  else { mat = src.clone(); mine.map = mat.map; }
  engraveMaterial(mat, geo, size, triplanar);
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true;
  const holder = new THREE.Group(); holder.add(mesh); holder.scale.setScalar(1 / size.y); holder.visible = i === mine.type;
  mine.stones[i] = holder; mine.group.add(holder);
  mine.faces[i] = faceMap(geo);
  if (i === mine.type) drawMine();
}
// 돌 앞면(정면을 향한 면)의 실제 모양을 64×64 칸으로 재고, 칸마다 외곽까지의 거리를 구한다.
// 캔버스 좌표와 같게 x는 왼→오, y는 위→아래(돌의 위쪽이 0).
function faceMap(geo) {
  const N = 64, g = new Uint8Array(N * N), p = geo.attributes.position, n = geo.attributes.normal, bb = geo.boundingBox;
  const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y;
  for (let i = 0; i < p.count; i++) {
    if (n.getZ(i) < .55) continue;
    const gx = Math.min(N - 1, Math.floor((p.getX(i) - bb.min.x) / sx * N)), gy = Math.min(N - 1, Math.floor((bb.max.y - p.getY(i)) / sy * N));
    g[gy * N + gx] = 1;
  }
  // 점 사이 빈칸 메우기: 이웃 다섯 칸 이상이 면이면 면으로
  let f = g;
  for (let pass = 0; pass < 3; pass++) {
    const src = f; f = src.slice();
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (src[y * N + x]) continue; let c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += src[(y + dy) * N + x + dx];
      if (c >= 4) f[y * N + x] = 1;
    }
  }
  // 바깥(면이 아닌 칸)에서부터의 실제 거리(칸 단위) — 대각선도 정확히 재도록 두 번 훑는다(chamfer)
  const dist = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) dist[k] = f[k] ? 1e9 : 0;
  const D = 1, DD = Math.SQRT2;
  const get = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? 0 : dist[y * N + x];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = y * N + x; if (!dist[k]) continue;
    dist[k] = Math.min(dist[k], get(x - 1, y) + D, get(x, y - 1) + D, get(x - 1, y - 1) + DD, get(x + 1, y - 1) + DD);
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const k = y * N + x; if (!dist[k]) continue;
    dist[k] = Math.min(dist[k], get(x + 1, y) + D, get(x, y + 1) + D, get(x + 1, y + 1) + DD, get(x - 1, y + 1) + DD);
  }
  let cx = 0, cy = 0, m = 0;
  for (let k = 0; k < N * N; k++) if (f[k]) { cx += k % N; cy += (k / N) | 0; m++; }
  // 외곽에서 가장 먼 지점(앞면 안쪽 중심)과 무게중심의 중간을 문양 배치 기준점으로 쓴다
  let best = 0, px = N / 2, py = N / 2;
  for (let k = 0; k < N * N; k++) if (dist[k] > best) { best = dist[k]; px = k % N; py = (k / N) | 0; }
  const gx = m ? cx / m : N / 2, gy = m ? cy / m : N / 2;
  return { N, dist, cx: ((gx + px) / 2 + .5) / N, cy: ((gy + py) / 2 + .5) / N };
}
// 기본 배치를 돌 앞면 중심에 맞추고, 모든 문양이 외곽에서 충분히 떨어질 때까지 안쪽으로 모으며 줄인다
const MINE_EDGE = .12; // 외곽 여백 (앞면 폭 대비)
function fitLayout(lay, face) {
  if (!face) return lay;
  const at = (u, v) => { const x = Math.max(0, Math.min(face.N - 1, Math.floor(u * face.N))), y = Math.max(0, Math.min(face.N - 1, Math.floor(v * face.N))); return face.dist[y * face.N + x] / face.N; };
  let s = 1;
  for (let it = 0; it < 24; it++) {
    const out = lay.map(([cx, cy, sz]) => [face.cx + (cx - .5) * s, face.cy + (cy - .5) * s, sz * s]);
    if (out.every(([u, v, sz]) => at(u, v) >= sz * .42 + MINE_EDGE)) return out;
    s *= .96;
  }
  return lay.map(([cx, cy, sz]) => [face.cx + (cx - .5) * s, face.cy + (cy - .5) * s, sz * s]);
}
function loadMine(loader) {
  mine.canvas = document.createElement('canvas'); mine.canvas.width = mine.canvas.height = 1024;
  mine.ctx = mine.canvas.getContext('2d');
  mine.tex = new THREE.CanvasTexture(mine.canvas); mine.tex.colorSpace = THREE.NoColorSpace;
  mine.group = new THREE.Group(); mine.group.visible = false;
  // 0: 질감 있는 매끈한 돌(받은 GLB 그대로), 1: 숨구멍 많은 돌 — 같은 질감 이미지를 입힌다
  loader.load('assets/record/textured_stone.glb', gltf => {
    mineStone(gltf.scene, 0, false);
    loader.load('assets/record/blank_stone_2.glb', g2 => mineStone(g2.scene, 1, true));
  });
  if (today.pivot) today.pivot.add(mine.group);
}
function mineIcon(id) {
  if (mine.icons[id]) return mine.icons[id];
  const entry = { img: null, ready: false };
  mine.icons[id] = entry;
  fetch(`assets/record/icons/icon-${id}.svg`).then(r => r.text()).then(txt => {
    const svg = txt.replace(/fill:\s*#[0-9a-fA-F]{3,6}/g, 'fill: #ffffff');
    const img = new Image(); img.onload = () => { entry.img = img; entry.ready = true; drawMine(); };
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  });
  return entry;
}
// 개수에 따른 문양 배치 (돌 앞면 0~1 좌표, 크기)
const MINE_LAYOUT = {
  1: [[.5, .5, .42]],
  2: [[.33, .5, .37], [.67, .5, .37]],
  3: [[.5, .34, .3], [.34, .65, .28], [.66, .65, .28]],
  4: [[.335, .335, .32], [.665, .335, .32], [.335, .665, .32], [.665, .665, .32]],
};
function drawMine(now = performance.now()) {
  const { ctx, canvas } = mine; if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lay = fitLayout(MINE_LAYOUT[mine.marks.length] || [], mine.faces[mine.type]);
  let busy = false;
  mine.marks.forEach((m, i) => {
    const e = mineIcon(m.icon); if (!e.ready) return;
    const [cx, cy, sz] = lay[i];
    const t = Math.min(1, (now - m.at) / 700); if (t < 1) busy = true;
    const k = 1 + (1 - t) * .35, W = canvas.width * sz * k, ar = e.img.width / e.img.height;
    const w = ar >= 1 ? W : W * ar, h = ar >= 1 ? W / ar : W;
    ctx.globalAlpha = t; ctx.drawImage(e.img, cx * canvas.width - w / 2, cy * canvas.height - h / 2, w, h);
  });
  ctx.globalAlpha = 1; mine.tex.needsUpdate = true;
  mine.anim = busy ? 1 : 0;
}
// app.js에서 고른 기록이 바뀔 때마다 호출: [{id, icon}], 돌 종류(0|1)
export function setMineRecords(list, type = 0) {
  const now = performance.now(), prev = new Map(mine.marks.map(m => [m.id, m]));
  mine.marks = list.map(r => prev.get(r.id) || { id: r.id, icon: r.icon, at: now });
  list.forEach(r => mineIcon(r.icon));
  if (type !== mine.type) { mine.type = type; mine.stones.forEach((st, i) => st && (st.visible = i === type)); if (!reduced) { today.spin += Math.PI * 2; today.v.y += 3; } }
  mine.count = list.length;
  drawMine(now);
}

// 06 선별: 기록을 고를 때마다 돌이 살짝 들썩인다
export function bumpToday(dir = 1) {
  if (!today.pivot || reduced) return;
  today.v.y += 3.2 * dir; today.ev.y += .5 * dir;
}
export function setTodayReceived(v) {
  if (v === todayReceived) return;
  todayReceived = v;
  if (v && !reduced) { today.spin += Math.PI * 2; today.sv -= 2.2; today.v.z += 6; }
}

// ---- 07 전달: 내 돌(TODAY)을 잡아 돌탑 꼭대기에 올린다 ----------------------
const RELAY = { home: [.6, .3, 0], homeScale: 3.4, grabScale: 2.4, topScale: 1.7, reach: 1.9, holdSec: .5 };
const relay = { grab: false, placed: false, near: 0, onPlaced: null };
const _rp = new THREE.Vector3(), _rw = new THREE.Vector3();
export function relayGrab() { if (relay.placed || relay.grab) return; relay.grab = true; if (!reduced) { today.v.z += 4; today.ev.y += 1.2; } }
// 손을 펴면: 꼭대기 근처면 올려놓고, 아니면 제자리로 돌아간다
export function relayRelease() {
  if (!relay.grab || relay.placed) return '';
  if (relay.near > 0) {
    relay.placed = true; relay.grab = false;
    if (!reduced) STACK.forEach((idx, k) => { const r = rocks[idx]; r.v.y -= 1.5 + k * .7; r.fv += .5; });
    relay.onPlaced?.();
    return 'placed';
  }
  relay.grab = false; relay.near = 0;
  return 'dropped';
}
export function onRelayPlaced(fn) { relay.onPlaced = fn; }
export function resetRelay() { relay.grab = relay.placed = false; relay.near = 0; }
function relayTop() { return [CAIRN_X, cairnTopY + RELAY.topScale * .42, .3]; }
function pointerWorld(out) {
  _rp.set(pointer.x, -pointer.y, .5).unproject(camera).sub(camera.position).normalize();
  return out.copy(camera.position).addScaledVector(_rp, -camera.position.z / _rp.z);
}

function updateToday(time, dt) {
  if (!today.pivot) return;
  const showMine = mode === 'review' || mode === 'relay';
  if (todayInner) todayInner.visible = !showMine; if (mine.group) mine.group.visible = showMine;
  if (mine.anim) drawMine();
  const on = mode === 'today' || mode === 'review', small = mode === 'buddy', onBal = mode === 'balance' && bal.group && bal.ready, onRelay = mode === 'relay';
  const px = pointer.sx, py = pointer.sy;
  const aim = on && !!host?.closest('section')?.querySelector('[data-today-core].gaze, [data-today-core]:hover');
  const bt = onBal ? balanceTodayTarget() : null;
  let rt = null;
  if (onRelay) {
    if (relay.placed) rt = relayTop();
    else if (relay.grab) { pointerWorld(_rw); rt = [_rw.x, _rw.y, 1]; }
    else rt = [RELAY.home[0] + pointer.x * .3, RELAY.home[1] - pointer.y * .2 + (reduced ? 0 : Math.sin(time * .8) * .12), 0];
  }
  const tp = rt ? rt : bt ? [bt.x, bt.y, bt.z] : on ? [TODAY_HOME.pos[0] + px * .45, TODAY_HOME.pos[1] - py * .3 + (reduced ? 0 : Math.sin(time * .8) * .1), 0]
    : small ? [TODAY_BUDDY.pos[0] + px * .2, TODAY_BUDDY.pos[1] + (isJoined() ? .9 : 0) - py * .15 + (reduced ? 0 : Math.sin(time * .7) * .08), TODAY_BUDDY.pos[2]] : [16, 1, -2];
  const ts = mode === 'review' ? TODAY_HOME.scale * (.82 + mine.count * .06) : onRelay ? (relay.placed ? RELAY.topScale : relay.grab ? RELAY.grabScale : RELAY.homeScale) : onBal ? BAL.todayH : on ? TODAY_HOME.scale * (aim && !todayReceived ? 1.05 : 1) : small ? TODAY_BUDDY.scale : 0;
  // 저울 위에서는 굴러가는 만큼 옆으로 돈다
  // 06 선별: 새겨진 문양이 잘 보이도록 돌이 정면을 더 바라본다(옆면이 덜 보이게)
  const tr = mode === 'review' ? [.05 + py * .12, -.1 + px * .25 + today.spin + (reduced ? 0 : Math.sin(time * .35) * .05), (reduced ? 0 : Math.sin(time * .5) * .02)]
    : onRelay && relay.placed ? [.06, -.3, 0] : onBal ? [.1, -.3 + today.spin, bal.tilt - bal.along * 2.2] : [.12 + py * .3, -.35 + px * .6 + today.spin + (reduced ? 0 : Math.sin(time * .35) * .12), (reduced ? 0 : Math.sin(time * .5) * .03)];
  const k = reduced ? 300 : onBal ? 90 : onRelay && relay.grab ? 110 : 40, c = reduced ? 35 : onBal ? 14 : onRelay && relay.grab ? 16 : 9.5;
  for (let a = 0; a < 3; a++) {
    const ax = 'xyz'[a];
    [today.p[ax], today.v[ax]] = spring(today.p[ax], today.v[ax], tp[a], k, c, dt);
    [today.e[ax], today.ev[ax]] = spring(today.e[ax], today.ev[ax], tr[a], a === 1 ? 26 : k * .7, a === 1 ? 7 : c, dt);
  }
  [today.s, today.sv] = spring(today.s, today.sv, ts, k, c, dt);
  today.pivot.visible = today.s > .03;
  today.pivot.position.copy(today.p); today.pivot.rotation.set(today.e.x, today.e.y, today.e.z); today.pivot.scale.setScalar(Math.max(.001, today.s));
  if (onRelay && relay.grab && !relay.placed) {
    const [tx, ty] = relayTop();
    if (Math.hypot(today.p.x - tx, today.p.y - ty) < RELAY.reach) relay.near += dt; else relay.near = 0;
    if (!fistMode && relay.near > RELAY.holdSec) {
      relay.placed = true; relay.grab = false;
      if (!reduced) STACK.forEach((idx, k) => { const r = rocks[idx]; r.v.y -= 1.5 + k * .7; r.fv += .5; });
      relay.onPlaced?.();
    }
  }
}

// 돌 위의 손 선택 영역과 돌 아래 안내 문구를 돌 위치에 맞춘다
function placeTodayDom() {
  const page = host?.closest('section');
  if (!page || !today.pivot) return;
  today.box.setFromObject(today.pivot);
  const [x1, y1] = project(today.box.min.x, today.box.max.y, today.p.z), [x2, y2] = project(today.box.max.x, today.box.min.y, today.p.z);
  const core = page.querySelector('[data-today-core]'), hint = page.querySelector('[data-today-hint]');
  if (core) Object.assign(core.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
  if (hint) hint.style.transform = `translate3d(${Math.round((x1 + x2) / 2)}px,${Math.round(y2 + 26)}px,0) translateX(-50%)`;
  page.classList.toggle('today-loaded', true);
}

// 07: 잡기 영역은 돌 위에, 올릴 자리 표시는 돌탑 꼭대기에
function placeRelayDom() {
  const page = host?.closest('section');
  if (!page || !today.pivot) return;
  today.box.setFromObject(today.pivot);
  const [x1, y1] = project(today.box.min.x, today.box.max.y, today.p.z), [x2, y2] = project(today.box.max.x, today.box.min.y, today.p.z);
  const core = page.querySelector('[data-relay-core]'), hint = page.querySelector('[data-relay-hint]'), target = page.querySelector('[data-relay-target]');
  if (core) Object.assign(core.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
  if (hint) hint.style.transform = `translate3d(${Math.round((x1 + x2) / 2)}px,${Math.round(y2 + 26)}px,0) translateX(-50%)`;
  if (target) { const [tx, ty] = project(...relayTop()); target.style.transform = `translate3d(${Math.round(tx)}px,${Math.round(ty)}px,0)`; }
  page.classList.toggle('relay-grab', relay.grab);
  page.classList.toggle('relay-near', relay.near > 0);
  page.classList.toggle('today-loaded', true);
}

// ---- 04 버디 확인: 왼손 돌(YOU) · 오른손 돌(BUDDY) ------------------------------
// 두 손 돌 사이 위쪽에 03에서 받은 TODAY 돌이 작게 떠서 '함께 보는 참고 기록'이 된다.
const HANDS = {
  you: { file: 'hand_left', pos: [2.2, -.1, 0], rot: [.08, .28, 0] },
  buddy: { file: 'hand_right', pos: [9.4, -.1, 0], rot: [.08, -.28, 0] },
};
const HAND_H = 4.2, TODAY_BUDDY = { pos: [5.8, 2.55, -1], scale: 2.1 };
const handStones = {};
const buddyState = { you: false, buddy: false };
// 두 손이 모두 확인되면 두 돌이 가운데로 모여 하나의 '양손 돌'로 바뀐다
const JOIN = { pos: [5.8, -.2, .4], width: 7.4 };
const joined = { pivot: null, p: new THREE.Vector3(...JOIN.pos), v: new THREE.Vector3(), e: new THREE.Vector3(.08, 0, 0), ev: new THREE.Vector3(), s: 0, sv: 0 };
let joinAt = 0;
const isJoined = () => buddyState.you && buddyState.buddy;

function loadHands(loader) {
  loader.load('assets/buddy/hands_joined.glb', gltf => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    model.position.sub(c);
    const inner = new THREE.Group(); inner.add(model); inner.scale.setScalar(1 / size.x);
    model.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    joined.pivot = new THREE.Group(); joined.pivot.add(inner); joined.pivot.visible = false; scene.add(joined.pivot);
  });
  Object.entries(HANDS).forEach(([side, def]) => {
    loader.load(`assets/buddy/${def.file}.glb`, gltf => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      model.position.sub(c);
      const inner = new THREE.Group(); inner.add(model); inner.scale.setScalar(1 / size.y);
      model.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      const pivot = new THREE.Group(); pivot.add(inner); pivot.visible = false; scene.add(pivot);
      handStones[side] = { side, def, pivot, p: new THREE.Vector3(def.pos[0] + (side === 'you' ? -8 : 8), -9, 0), v: new THREE.Vector3(), e: new THREE.Vector3(...def.rot), ev: new THREE.Vector3(), s: 0, sv: 0, box: new THREE.Box3() };
    });
  });
}

export function setBuddyCheck(side, v = true) {
  if (buddyState[side] === v) return;
  buddyState[side] = v;
  const h = handStones[side];
  if (v && h && !reduced) { h.v.y -= 3; h.sv -= .5; } // 손을 올리는 순간 "꾹" 눌렸다가 떠오른다
  if (isJoined()) joinAt = performance.now();
}
export function resetBuddy() { buddyState.you = buddyState.buddy = false; joinAt = 0; }

function updateHands(time, dt) {
  const on = mode === 'buddy';
  const px = pointer.sx, py = pointer.sy;
  Object.values(handStones).forEach(h => {
    const checked = buddyState[h.side];
    const aim = on && !!host?.closest('section')?.querySelector(`[data-hand-stone="${h.side}"].gaze, [data-hand-stone="${h.side}"]:hover`);
    const merging = on && isJoined();
    const tp = merging ? [JOIN.pos[0], JOIN.pos[1], JOIN.pos[2]]
      : on ? [h.def.pos[0] + px * .3, h.def.pos[1] - py * .2 + (checked ? .35 : 0) + (reduced ? 0 : Math.sin(time * .8 + (h.side === 'you' ? 0 : 1.6)) * .08), checked ? 1 : aim ? .5 : 0] : [h.def.pos[0] + (h.side === 'you' ? -8 : 8), -9, 0];
    // 가운데로 끌려가다(0.28초) 부딪히는 순간 사라진다
    const ts = merging ? (performance.now() - joinAt > 280 || reduced ? 0 : HAND_H * .8) : on ? HAND_H * (aim && !checked ? 1.04 : 1) : 0;
    const tr = [h.def.rot[0] + py * .2, h.def.rot[1] + px * .35, 0];
    const k = reduced ? 300 : merging ? 120 : 42, c = reduced ? 35 : merging ? 16 : 9.5;
    for (let a = 0; a < 3; a++) {
      const ax = 'xyz'[a];
      [h.p[ax], h.v[ax]] = spring(h.p[ax], h.v[ax], tp[a], k, c, dt);
      [h.e[ax], h.ev[ax]] = spring(h.e[ax], h.ev[ax], tr[a], k * .7, c, dt);
    }
    [h.s, h.sv] = spring(h.s, h.sv, ts, k, c, dt);
    h.pivot.visible = h.s > .03;
    h.pivot.position.copy(h.p); h.pivot.rotation.set(h.e.x, h.e.y, h.e.z); h.pivot.scale.setScalar(Math.max(.001, h.s));
  });
  // 양손 돌: 두 돌이 부딪히는 순간 "뿅" — 작게 시작해 한 번 크게 튀었다가 자리 잡는다
  if (joined.pivot) {
    const show = on && isJoined() && (reduced || performance.now() - joinAt > 260);
    if (show && !joined.shown) { joined.shown = true; joined.s = .2; if (!reduced) { joined.sv = 38; joined.ev.y += 5; } }
    if (!show) joined.shown = false;
    const tp = [JOIN.pos[0] + px * .3, JOIN.pos[1] - py * .2 + (reduced ? 0 : Math.sin(time * .8) * .08), JOIN.pos[2]];
    const tr = [.08 + py * .2, px * .35, 0];
    const k = reduced ? 300 : 70, c = reduced ? 35 : 8.5;
    for (let a = 0; a < 3; a++) {
      const ax = 'xyz'[a];
      [joined.p[ax], joined.v[ax]] = spring(joined.p[ax], joined.v[ax], tp[a], k, c, dt);
      [joined.e[ax], joined.ev[ax]] = spring(joined.e[ax], joined.ev[ax], tr[a], k * .5, c, dt);
    }
    [joined.s, joined.sv] = spring(joined.s, joined.sv, show ? JOIN.width : 0, k, c, dt);
    joined.pivot.visible = joined.s > .03;
    joined.pivot.position.copy(joined.p); joined.pivot.rotation.set(joined.e.x, joined.e.y, joined.e.z); joined.pivot.scale.setScalar(Math.max(.001, joined.s));
  }
}

// 손 돌 위 선택 영역, 체크 목록, 세 돌을 잇는 선을 3D 위치에 맞춘다
function placeBuddyDom() {
  const page = host?.closest('section');
  if (!page) return;
  Object.values(handStones).forEach(h => {
    h.box.setFromObject(h.pivot);
    const [x1, y1] = project(h.box.min.x, h.box.max.y, h.p.z), [x2, y2] = project(h.box.max.x, h.box.min.y, h.p.z);
    const target = page.querySelector(`[data-hand-stone="${h.side}"]`), list = page.querySelector(`[data-hand-list="${h.side}"]`);
    if (target) Object.assign(target.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
    // 체크 목록은 돌의 기본 위치 기준으로 고정 — 돌이 들썩여도 글은 흔들리지 않는다
    const [lx, ly] = project(h.def.pos[0], h.def.pos[1] - HAND_H / 2, 0);
    if (list) list.style.transform = `translate3d(${Math.round(lx)}px,${Math.round(ly + 26)}px,0) translateX(-50%)`;
  });
  // 두 돌 사이 안내는 두 돌의 기본 위치 가운데에 둔다
  const hint = page.querySelector('[data-buddy-hint]');
  if (hint) { const [hx, hy] = project((HANDS.you.pos[0] + HANDS.buddy.pos[0]) / 2, HANDS.you.pos[1], 0); hint.style.transform = `translate3d(${Math.round(hx)}px,${Math.round(hy)}px,0) translate(-50%,-50%)`; }
  page.classList.toggle('hands-loaded', Object.keys(handStones).length === 2);
}

// ---- 05 경로 판단: 저울 ----------------------------------------------------
// 동그란 돌 위에 납작한 돌을 얹은 저울. 손을 좌우로 움직이면 기울고, TODAY 돌(이전 기록)이 낮은 쪽으로 굴러간다.
// 한쪽으로 기운 채 잠시 버티면 그쪽 경로가 팀의 판단으로 확정된다. 왼쪽 = 01 동측 변경, 오른쪽 = 02 서측 대기
// 손 트래킹 모드: 시간이 지나 자동 확정하지 않고, 주먹을 쥐어야 확정·내려놓기
let fistMode = false;
export function setFistMode(v) { fistMode = !!v; }
const BAL = { x: 0, pivotY: -2.2, pivotH: 3.3, len: 16.5, depth: 4.4, maxTilt: .2, todayH: 2.6, holdSec: 1.2 };
const bal = { group: null, pivot: null, ready: false, armed: false, tilt: 0, tv: 0, along: 0, av: 0, hold: 0, committed: 0, s: 0, sv: 0, plankTop: .45, onCommit: null, lastLean: 0 };

function normalizedClone(gltf, by) {
  const model = gltf.scene.clone(true);
  const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  model.position.sub(c);
  const inner = new THREE.Group(); inner.add(model); inner.scale.setScalar(1 / size[by]);
  model.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return { inner, size };
}
function loadBalance(loader) {
  let round = null, flat = null;
  const build = () => {
    if (!round || !flat || bal.group) return;
    // 받침: 동그란 돌
    const p = normalizedClone(round, 'y'); bal.pivot = new THREE.Group(); bal.pivot.add(p.inner); bal.pivot.scale.setScalar(BAL.pivotH);
    bal.pivot.position.set(BAL.x, BAL.pivotY, 0); bal.pivot.rotation.y = .6; bal.pivot.visible = false; scene.add(bal.pivot);
    // 판: 납작한 돌 — 정면에서 보면 긴 돌판
    const f = normalizedClone(flat, 'x'); const plank = new THREE.Group(); plank.add(f.inner); plank.scale.set(BAL.len, BAL.len, BAL.depth); // 앞뒤 깊이는 줄여 긴 돌판으로
    bal.plankTop = BAL.len * (f.size.y / f.size.x) / 2;
    bal.group = new THREE.Group(); bal.group.add(plank);
    // 양 끝 멈춤 돌(작은 동그란 돌) — TODAY 돌이 굴러가 부딪히는 곳
    [-1, 1].forEach(side => {
      const st = normalizedClone(round, 'y'); const g = new THREE.Group(); g.add(st.inner); g.scale.setScalar(.9);
      g.position.set(side * (BAL.len / 2 - .8), bal.plankTop + .38, 0); g.rotation.y = side * .8; bal.group.add(g);
    });
    bal.group.position.set(BAL.x, BAL.pivotY + BAL.pivotH / 2 + bal.plankTop - .12, 0);
    bal.group.visible = false; scene.add(bal.group);
  };
  loader.load('assets/route/stone_round.glb', g => { round = g; build(); });
  loader.load('assets/route/stone_flat.glb', g => { flat = g; build(); });
}

export function setBalanceReady(v) { if (v && !bal.ready) bal.armed = false; bal.ready = v; if (!v) { bal.committed = 0; bal.hold = 0; } }
export function onBalanceCommit(fn) { bal.onCommit = fn; }
export function balanceFist() {
  if (!bal.ready || bal.committed || !bal.armed || Math.abs(bal.lean || 0) <= .85) return false;
  bal.committed = bal.lean > 0 ? -1 : 1; bal.hold = BAL.holdSec;
  if (!reduced) { today.v.y += 4; today.ev.z += 6 * bal.committed; }
  bal.onCommit?.(bal.committed < 0 ? 'choose-safe' : 'choose-original');
  return true;
}
export function resetBalance() { bal.committed = 0; bal.hold = 0; }
// 경로 이름을 눌렀을 때(마우스): 그쪽으로 기울여 확정한다
export function commitBalance(action) {
  if (!bal.group) return false;
  if (bal.committed) return true;
  bal.committed = action === 'choose-safe' ? -1 : 1; bal.hold = BAL.holdSec;
  if (!reduced) { today.v.y += 4; today.ev.z += 6 * bal.committed; }
  bal.onCommit?.(action);
  return true;
}

const _w = new THREE.Vector3();
function updateBalance(dt, time) {
  if (!bal.group) return;
  const on = mode === 'balance' && bal.ready;
  [bal.s, bal.sv] = spring(bal.s, bal.sv, on ? 1 : 0, reduced ? 300 : 60, reduced ? 35 : 10, dt);
  bal.group.visible = bal.pivot.visible = bal.s > .02;
  const lift = (1 - bal.s) * -6;
  bal.pivot.position.y = BAL.pivotY + lift; bal.group.position.y = BAL.pivotY + BAL.pivotH / 2 + bal.plankTop - .12 + lift;
  // 손 위치 → 기울기. 왼쪽으로 움직이면 왼쪽(01)이 내려간다
  const want = bal.committed ? bal.committed * -BAL.maxTilt : THREE.MathUtils.clamp(-pointer.sx * 2, -1, 1) * BAL.maxTilt; // 화면 가로 75% 지점이면 최대로 기운다
  [bal.tilt, bal.tv] = spring(bal.tilt, bal.tv, want, reduced ? 300 : 30, reduced ? 35 : 7, dt);
  bal.group.rotation.z = bal.tilt;
  const lean = bal.tilt / BAL.maxTilt; // +1 = 왼쪽으로 기울어짐
  // TODAY 돌은 낮은 쪽으로 굴러간다
  const wantAlong = bal.committed ? bal.committed * .86 : -lean * .86; // 최대로 기울면 판석 끝까지 굴러간다
  [bal.along, bal.av] = spring(bal.along, bal.av, wantAlong, reduced ? 300 : 22, reduced ? 35 : 6, dt);
  // 한쪽으로 충분히 기운 채 버티면 확정
  // 페이지에 들어왔을 때 손이 이미 한쪽 끝에 있어도 저절로 확정되지 않도록, 한 번 가운데를 지나야 버티기가 시작된다
  if (on && Math.abs(pointer.x * 1.4) < .35) bal.armed = true; // 실제 손 위치 기준(부드럽게 따라가는 값은 가운데를 지나쳐 버린다)
  if (on && !bal.committed) {
    const leaning = bal.armed && Math.abs(lean) > .85;
    if (fistMode) bal.hold = leaning ? BAL.holdSec * .999 : 0; // 링이 다 차면 '주먹을 쥐면 확정'
    else if (leaning) bal.hold += dt; else bal.hold = Math.max(0, bal.hold - dt * 2);
    if (bal.hold >= BAL.holdSec) {
      bal.committed = lean > 0 ? -1 : 1; bal.hold = BAL.holdSec;
      if (!reduced) { today.v.y += 4; today.ev.z += 6 * bal.committed; }
      bal.onCommit?.(bal.committed < 0 ? 'choose-safe' : 'choose-original');
    }
  }
  bal.lean = lean;
}

// TODAY 돌이 저울판 위 어디에 있는지
function balanceTodayTarget() {
  _w.set(bal.along * BAL.len / 2, bal.plankTop + BAL.todayH / 2 - .15, 0);
  return bal.group.localToWorld(_w.clone());
}

function placeBalanceDom() {
  const page = host?.closest('section');
  if (!page || !bal.group) return;
  const lean = bal.lean || 0;
  page.style.setProperty('--lean', lean.toFixed(3));
  page.classList.toggle('lean-left', lean > .35); page.classList.toggle('lean-right', lean < -.35);
  // 선택지 글은 양 끝 돌 바로 아래에 붙는다
  [['left', -1], ['right', 1]].forEach(([name, side]) => {
    const el = page.querySelector(`.bal-end.${name}`);
    if (!el) return;
    _w.set(side * (BAL.len / 2 - .8), -bal.plankTop - .1, 0); bal.group.localToWorld(_w);
    const [x, y] = project(_w.x, _w.y, _w.z);
    el.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y + 26)}px,0) translateX(-50%)`;
  });
  const ring = page.querySelector('[data-bal-hold]');
  if (ring) {
    const side = lean > 0 ? -1 : 1;
    _w.set(side * (BAL.len / 2 - .8), bal.plankTop + 2.1, 0); bal.group.localToWorld(_w);
    const [x, y] = project(_w.x, _w.y, _w.z);
    ring.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0) translate(-50%,-100%)`;
    ring.style.setProperty('--p', `${Math.round(bal.hold / BAL.holdSec * 100)}%`);
    ring.classList.toggle('on', bal.hold > .05 || !!bal.committed);
  }
}

// 해안: 02에서는 돌들이 화면 아래로 내려가 영상 속 현무암 해안처럼 깔린다
const SHORE = [
  [1.6, -7.7, .5, 2.5], [5.2, -8.0, -.5, 2.9], [8.8, -7.6, .8, 2.3], [13.9, -7.4, 0, 3.0], [-2.4, -8.5, -1, 2.3],
  [14.9, -3.9, -1.5, 2.1], [3.3, -6.9, 2.2, .95], [10.6, -6.7, 2.6, .85], [6.9, -6.6, 3.0, .42], [-.2, -7.0, 3.1, .38], [9.3, -6.5, 3.4, .3],
];

const _v = new THREE.Vector3();
function project(x, y, z) { _v.set(x, y, z).project(camera); return [(_v.x + 1) / 2 * host.clientWidth, (1 - _v.y) / 2 * host.clientHeight]; }

function updateKit(now, time, dt) {
  const t = now - kitOpenAt;
  // 손바닥(또는 마우스) 위치를 따라 제품이 상하좌우로 고개를 돌리고 살짝 따라온다
  const px = pointer.sx, py = pointer.sy;
  kitItems.forEach((it, i) => {
    if (!it) return;
    const def = it.def;
    const look = [def.rot[0] + py * .35, def.rot[1] + px * .7 + (reduced ? 0 : Math.sin(time * .4 + i * .9) * .08), def.rot[2]];
    let tp, ts, tr = look;
    if (mode !== 'kit') { tp = [BAG_CLOSED.pos[0], -12, 0]; ts = 0; }
    else if (!kitOpen) {
      if (i === 0) { tp = [BAG_CLOSED.pos[0] + px * .5, BAG_CLOSED.pos[1] - py * .35 + (reduced ? 0 : Math.sin(time * .8) * .1), 0]; ts = BAG_CLOSED.scale * (it.hover ? 1.05 : 1); }
      else { tp = BAG_CLOSED.pos; ts = 0; }
    } else {
      // 가방: 관람객 쪽으로 다가왔다가(받는 순간) 자기 자리로. 제품: 가방에서 순서대로 튀어나온다
      const release = i === 0 ? 480 : 560 + (i - 1) * 120;
      const out = t > release;
      const slot = [def.slot[0] + it.corr + px * .22, def.slot[1] - py * .18, it.hover ? 1.2 : 0];
      if (i === 0) { tp = out ? slot : [BAG_CLOSED.pos[0], BAG_CLOSED.pos[1], 3.5]; ts = out ? (it.hover ? 1.14 : 1) : BAG_CLOSED.scale * 1.08; }
      else { tp = out ? slot : BAG_CLOSED.pos; ts = out ? (it.hover ? 1.14 : 1) : 0; }
      if (it.hover) tr = [def.rot[0] * .5 + py * .25, px * .5 + (reduced ? 0 : Math.sin(time * 1.2) * .15), 0];
      if (out && !it.launched) { it.launched = true; if (i > 0 && !reduced) { it.v.y += 7; it.v.z += 5; it.ev.y += 6; } }
    }
    if (!kitOpen) it.launched = false;
    const k = reduced ? 300 : 55, c = reduced ? 35 : 10.5;
    for (let a = 0; a < 3; a++) {
      const ax = 'xyz'[a];
      [it.p[ax], it.v[ax]] = spring(it.p[ax], it.v[ax], tp[a], k, c, dt);
      [it.e[ax], it.ev[ax]] = spring(it.e[ax], it.ev[ax], tr[a], k * .7, c, dt);
    }
    [it.s, it.sv] = spring(it.s, it.sv, ts, k, c, dt);
    it.pivot.visible = it.s > .03;
    it.pivot.position.copy(it.p); it.pivot.rotation.set(it.e.x, it.e.y, it.e.z); it.pivot.scale.setScalar(Math.max(.001, it.s));
  });
}

// 제품 칸(이름·설명·손 선택 영역), 가방 선택 영역, 가방 안내 문구를 3D 위치에 맞춰 둔다
function placeKitDom() {
  const page = host?.closest('section');
  if (!page) return;
  kitItems.forEach((it, i) => {
    if (!it) return;
    const cell = page.querySelector(`[data-kit-cell="${i}"]`);
    if (!cell) return;
    // 칸의 위치는 제품의 움직임과 상관없이 고정 — 이름이 줄마다 가지런히 선다
    const [x1, y1] = project(it.def.slot[0] - CELL.w / 2, it.def.slot[1] + CELL.h / 2, 0);
    const [x2, y2] = project(it.def.slot[0] + CELL.w / 2, it.def.slot[1] - CELL.h / 2, 0);
    const key = `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)}`;
    if (cell.dataset.rect !== key) {
      cell.dataset.rect = key;
      Object.assign(cell.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, '--item-h': `${y2 - y1}px` });
    }
    it.hover = kitOpen && (cell.matches(':hover') || cell.classList.contains('gaze'));
    // 비스듬히 돌린 물체는 눈에 보이는 중심이 칸 중심에서 벗어난다(원근 때문에 바깥 칸일수록 더).
    // 자리 잡은 뒤 실제 꼭짓점을 화면에 투영해 가로 범위를 재고, 그 가운데가 칸 가운데에 오도록 두 번 보정한다.
    if (kitOpen && (it.measured || 0) < 2 && Math.abs(it.s - 1) < .02 && it.v.length() < .03) {
      it.measured = (it.measured || 0) + 1;
      let minX = Infinity, maxX = -Infinity;
      it.pivot.updateMatrixWorld(true);
      it.pivot.traverse(o => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 3000));
        for (let k = 0; k < pos.count; k += step) {
          _v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld).project(camera);
          const sx = (_v.x + 1) / 2 * host.clientWidth;
          if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
        }
      });
      const offPx = (minX + maxX) / 2 - ((x1 + x2) / 2 + pointer.sx * .22 * (x2 - x1) / CELL.w);
      it.corr -= offPx * CELL.w / (x2 - x1);
    }
    if (!kitOpen) it.measured = false;
  });
  const bag = kitItems[0];
  const core = page.querySelector('[data-kit-core]'), hint = page.querySelector('[data-kit-bag-hint]');
  if (bag && !kitOpen) {
    bag.box.setFromObject(bag.pivot);
    const [x1, y1] = project(bag.box.min.x, bag.box.max.y, bag.p.z), [x2, y2] = project(bag.box.max.x, bag.box.min.y, bag.p.z);
    if (core) Object.assign(core.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
    bag.hover = !!core && (core.matches(':hover') || core.classList.contains('gaze'));
    if (hint) hint.style.transform = `translate3d(${Math.round((x1 + x2) / 2)}px,${Math.round(y2 + 28)}px,0) translateX(-50%)`;
  }
  page.classList.toggle('kit-loaded', kitItems.filter(Boolean).length === KIT.length);
}

// ---- 장면 --------------------------------------------------------------

let hemi, rim, bgColor;
let renderer, scene, camera, key, hero, heroPivot, rocks = [], raf = 0, host = null, root = null;
let flowing = false, burstAt = 0, t0 = 0, last = 0, aiming = false, lightMix = 0;
let mode = 'cover', modeAt = 0, camLift = 0;
const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
let handPointer = null;

// 손 좌표도 시점 이동에 쓴다 (app.js의 손 추적 루프에서 호출)
export function setCoverPointer(x, y) {
  handPointer = { x: (x / innerWidth - .5) * 2, y: (y / innerHeight - .5) * 2 }; pointer.x = handPointer.x; pointer.y = handPointer.y;
  if (!coreArmed && root) rearmCore(x, y);
}
let coreArmed = true;
function rearmCore(x, y) {
  const core = root.querySelector('[data-cover-core]');
  const r = core?.getBoundingClientRect();
  if (!r || (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) return;
  coreArmed = true; core.classList.add('gesture-target');
}
const hv = { x: 0, y: .7, z: 0, rx: 0, ry: 0, s: .85, vx: 0, vy: 0, vz: 0, vrx: 0, vry: 0, vs: 0 };

function build() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  bgColor = new THREE.Color(BG); scene.background = bgColor;
  camera = new THREE.PerspectiveCamera(30, 16 / 9, .1, 200);
  camera.position.set(0, 0, 27);

  hemi = new THREE.HemisphereLight('#ffffff', '#4a4a48', .38); scene.add(hemi);
  key = new THREE.DirectionalLight('#ffffff', 4.4);
  key.position.set(-9, 11, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -18, right: 18, top: 14, bottom: -14, near: 1, far: 60 });
  key.shadow.bias = -.0004; key.shadow.normalBias = .03;
  scene.add(key);
  rim = new THREE.DirectionalLight('#ffffff', .6); rim.position.set(10, -4, -6); scene.add(rim);

  const basalt = greyTexture('assets/basalt_rough.webp', { brightness: 1.9, contrast: .75, repeat: 2 });
  const basaltBump = greyTexture('assets/basalt_close.webp', { contrast: 1.2, repeat: 2 });

  ROCKS.forEach(([x, y, z, s, stretch, tone], i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setScalar(.28 + tone * .7), map: basalt, bumpMap: basaltBump, bumpScale: 3.2, roughness: 1, metalness: 0,
    });
    const mesh = new THREE.Mesh(rockGeometry(i * 7.31 + 1, stretch), mat);
    mesh.geometry.computeBoundingBox();
    mesh.castShadow = mesh.receiveShadow = true;
    const spin = [hash(i, 1, 9) * 6.28, hash(i, 2, 9) * 6.28, hash(i, 3, 9) * 6.28];
    const r = {
      mesh, i, home: { pos: [x, y, z], rot: spin, scale: s },
      p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(), e: new THREE.Vector3(...spin), ev: new THREE.Vector3(), s, sv: 0,
      bob: hash(i, 5, 5) * 6.28, f: 0, fv: 0,
    };
    mesh.position.copy(r.p); mesh.rotation.set(...spin); mesh.scale.setScalar(s);
    scene.add(mesh); rocks.push(r);
  });

  computeCairn();

  heroPivot = new THREE.Group();
  heroPivot.position.set(0, .7, 0);
  scene.add(heroPivot);
  const heroTex = greyTexture('assets/stone3d/engraved_stone_color.jpg', { brightness: 1.25, contrast: 1.05 });
  heroTex.wrapS = heroTex.wrapT = THREE.ClampToEdgeWrapping;
  new OBJLoader().load('assets/stone3d/engraved_stone.obj', obj => {
    obj.traverse(ch => {
      if (!ch.isMesh) return;
      ch.geometry.center();
      ch.material = new THREE.MeshStandardMaterial({ color: '#ffffff', map: heroTex, bumpMap: heroTex, bumpScale: 1.4, roughness: .96 });
      ch.castShadow = ch.receiveShadow = true;
    });
    obj.scale.setScalar(9.4 / 98);
    hero = obj;
    heroPivot.add(obj);
    host?.closest('section')?.classList.add('is-ready');
  });
}

function resize() {
  if (!host) return;
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function spring(cur, vel, target, k, c, dt) {
  const a = k * (target - cur) - c * vel; vel += a * dt; return [cur + vel * dt, vel];
}

function tick(now) {
  raf = requestAnimationFrame(tick);
  if (now < last) return; // 시간이 거꾸로 가면 건너뛴다
  const dt = Math.min(.033, (now - last) / 1000 || .016); last = now;
  const time = (now - t0) / 1000;

  pointer.sx += (pointer.x - pointer.sx) * .05; pointer.sy += (pointer.y - pointer.sy) * .05;
  const dark = mode === 'balance';
  scene.background = dark ? null : bgColor;
  hemi.intensity = dark ? .55 : .38; rim.intensity = dark ? 1.4 : .6; renderer.toneMappingExposure = dark ? 1.12 : 1.05;
  // 07 전달: 돌탑 꼭대기 위에 돌을 올릴 여유가 보이도록 카메라를 조금 뒤·위로
  const rl = mode === 'relay' ? 1 : 0;
  camLift += (rl - camLift) * .06;
  const par = dark || rl ? 0 : 1;
  camera.position.x = pointer.sx * .9 * par; camera.position.y = -pointer.sy * .6 * par + camLift * 1.3;
  camera.position.z = 27 + camLift * 6;
  camera.lookAt(0, camLift * 1.3, 0);

  // 흐름이 열리면 빛이 왼쪽 위에서 오른쪽 위로 옮겨 가며 그림자가 돌 위를 쓸고 지나간다
  lightMix += ((mode === 'cover' && flowing ? 1 : 0) - lightMix) * (reduced ? 1 : .025);
  key.position.set(-9 + lightMix * 17, 11 - lightMix * 2, 9 - lightMix * 3);

  rocks.forEach((r, idx) => {
    const order = Math.min(1, Math.hypot(r.home.pos[0], r.home.pos[1]) / 16); // 가운데에 가까운 돌부터 움직인다
    const delay = (flowing ? order * .35 : (1 - order) * .25) * 1000;
    const inFlow = flowing ? now - burstAt > delay : burstAt > 0 && now - burstAt <= delay;
    const shore = mode === 'kit' || mode === 'today' || mode === 'review' || mode === 'buddy' ? SHORE[idx] : null;
    const cairn = (mode === 'cairn' || mode === 'relay') ? cairnSlots[idx] : shore ? { pos: shore.slice(0, 3), rot: [.3 + idx, idx * 1.7, .2], scale: shore[3], flat: .45, order: idx % 4 } : null;
    // 돌탑으로 갈 땐 아래 돌부터 차례로 내려앉는다
    const cairnReady = cairn && now - modeAt > cairn.order * (shore ? 70 : 140);
    const slot = cairnReady ? cairn : (!cairn && inFlow) ? flowSlot(idx, rocks.length, time) : null;
    const bob = reduced ? 0 : Math.sin(time * .6 + r.bob) * .12;
    const tp = slot ? slot.pos : [r.home.pos[0], r.home.pos[1] + bob, r.home.pos[2]];
    const tr = cairnReady ? [slot.rot[0], slot.rot[1] + (reduced || shore ? 0 : Math.sin(time * .25 + idx) * .03), slot.rot[2]] : slot ? slot.rot : [r.home.rot[0] + (reduced ? 0 : time * .03), r.home.rot[1] + (reduced ? 0 : time * .02), r.home.rot[2]];
    const ts = cairnReady ? slot.scale : slot ? slot.scale * (r.home.scale > 1 ? 1 : .8) : r.home.scale;
    const tf = cairnReady ? slot.flat : 0;
    if (mode === 'balance') tp[1] = -20; // 저울 페이지에선 돌들이 화면 아래로 빠진다
    const k = reduced ? 300 : 38, c = reduced ? 35 : 9.5;
    for (let a = 0; a < 3; a++) {
      const ax = 'xyz'[a];
      [r.p[ax], r.v[ax]] = spring(r.p[ax], r.v[ax], tp[a], k, c, dt);
      [r.e[ax], r.ev[ax]] = spring(r.e[ax], r.ev[ax], tr[a], k * .7, c, dt);
    }
    [r.s, r.sv] = spring(r.s, r.sv, ts, k, c, dt);
    [r.f, r.fv] = spring(r.f, r.fv, tf, k * .6, c, dt);
    const s = Math.max(.05, r.s);
    r.mesh.position.copy(r.p); r.mesh.rotation.set(r.e.x, r.e.y, r.e.z);
    r.mesh.scale.set(s * (1 + r.f * .35), s * (1 - r.f * .45), s * (1 + r.f * .2));
  });

  if (hero) {
    const aim = aiming || !!root?.querySelector('.cover-core.gaze');
    const lookX = pointer.sx * (aim ? .35 : .12), lookY = pointer.sy * (aim ? .25 : .08);
    const onCairn = mode === 'cairn' || mode === 'relay', onKit = mode === 'kit' || mode === 'today' || mode === 'review' || mode === 'buddy';
    const tx = onKit ? 11.6 : onCairn ? CAIRN_X : 0, tz = onKit ? 2.2 : onCairn ? .3 : 0;
    const ty = mode === 'balance' ? -20 : onKit ? -5.75 : onCairn ? CAIRN_BASE - 1.2 : flowing ? 1.1 : .7 + (reduced ? 0 : Math.sin(time * .8) * .08);
    const ts = onKit ? .3 : onCairn ? .5 * CAIRN_K : flowing ? 1.08 : aim ? 1.05 : 1;
    [hv.x, hv.vx] = spring(hv.x, hv.vx, tx, 40, 10, dt);
    [hv.y, hv.vy] = spring(hv.y, hv.vy, ty, onCairn ? 40 : 60, 10, dt);
    [hv.z, hv.vz] = spring(hv.z, hv.vz, tz, 40, 10, dt);
    [hv.rx, hv.vrx] = spring(hv.rx, hv.vrx, onKit ? .35 : onCairn ? .22 : .12 + lookY, 60, 10, dt);
    [hv.ry, hv.vry] = spring(hv.ry, hv.vry, onKit ? -.55 : onCairn ? -.3 + pointer.sx * .05 : lookX + (flowing ? -.18 : .1), 60, 10, dt);
    [hv.s, hv.vs] = spring(hv.s, hv.vs, ts, 90, 11, dt);
    heroPivot.position.set(hv.x, hv.y, hv.z); heroPivot.rotation.set(hv.rx, hv.ry, 0); heroPivot.scale.setScalar(hv.s);
  }

  if (kitItems.length) updateKit(now, time, dt);
  updateToday(time, dt);
  updateHands(time, dt);
  updateBalance(dt, time);

  renderer.render(scene, camera);
  if (mode === 'cairn' && hero) placeCaption();
  if (mode === 'kit') placeKitDom();
  if (mode === 'today' || mode === 'review') placeTodayDom();
  if (mode === 'buddy') placeBuddyDom();
  if (mode === 'balance') placeBalanceDom();
  if (mode === 'relay') placeRelayDom();
}

// 돌탑 설명은 각인 돌 바로 아래에 붙어 따라다닌다
const box = new THREE.Box3(), probe = new THREE.Vector3();
let caption = null, capX = -1, capY = -1;
function placeCaption() {
  if (!caption || !caption.isConnected) caption = host?.closest('section')?.querySelector('[data-cairn-caption]');
  if (!caption) return;
  box.setFromObject(hero);
  probe.set(heroPivot.position.x, box.min.y, heroPivot.position.z).project(camera);
  const x = Math.round((probe.x + 1) / 2 * host.clientWidth), y = Math.round((1 - probe.y) / 2 * host.clientHeight) + 6;
  if (x === capX && y === capY) return;
  capX = x; capY = y;
  caption.style.transform = `translate3d(${x}px,${y}px,0) translateX(-50%)`;
}

function burst() {
  flowing = !flowing; burstAt = performance.now();
  root.classList.toggle('is-flowing', flowing);
  // 선택 직후 손이 돌 위에 그대로 있어도 바로 다시 토글되지 않게, 손이 돌 밖으로 한 번 나갔다 와야 다시 선택된다
  coreArmed = false;
  root.querySelector('[data-cover-core]')?.classList.remove('gesture-target');
  if (reduced) return;
  // "슉" — 각인 돌에서 바깥으로 밀려나는 첫 속도
  rocks.forEach(r => {
    const d = new THREE.Vector3(r.p.x, r.p.y, 0).normalize();
    r.v.addScaledVector(d, flowing ? 16 : 9); r.v.z += flowing ? 6 : -3;
    r.ev.x += (hash(r.i, 8, 1) - .5) * 9; r.ev.y += (hash(r.i, 8, 2) - .5) * 9;
  });
  hv.vs -= 1.6; hv.vry += flowing ? -3 : 3;
}

// ---- 연결 ---------------------------------------------------------------

// 3D 무대를 현재 페이지의 [data-stage3d] 자리에 붙인다. 캔버스는 하나를 계속 옮겨 쓰므로 페이지가 바뀌어도 돌이 이어서 움직인다.
export function mountStage(nextMode = 'cover') {
  const slot = document.querySelector('[data-stage3d]');
  if (!slot) return;
  if (nextMode !== mode) { mode = nextMode; modeAt = performance.now(); }
  if (!renderer) { build(); t0 = performance.now(); }
  host = slot;
  if (renderer.domElement.parentNode !== host) host.appendChild(renderer.domElement);
  const page = host.closest('section');
  if (hero) page?.classList.add('is-ready');
  resize();
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  if (mode === 'cover') bindCover(); else root = null;
}

// 기록이 확정될 때 돌탑 꼭대기 돌이 "탁" 눌렸다 올라온다
export function tapCairn() {
  const top = rocks[STACK[STACK.length - 1]];
  if (!top || reduced) return;
  STACK.forEach((idx, k) => { const r = rocks[idx]; r.v.y -= 2 + k * .9; r.fv += .6; });
}

export function mountCover() { mountStage('cover'); }

function bindCover() {
  const el = document.querySelector('.cover-stone');
  if (!el || el === root) return;
  root = el;
  root.classList.toggle('is-flowing', flowing);
  const core = el.querySelector('[data-cover-core]');
  core.addEventListener('click', burst);
  core.addEventListener('pointerenter', () => { aiming = true; });
  core.addEventListener('pointerleave', () => { aiming = false; if (!coreArmed) { coreArmed = true; core.classList.add('gesture-target'); } });
}

addEventListener('pointermove', e => {
  pointer.x = (e.clientX / innerWidth - .5) * 2; pointer.y = (e.clientY / innerHeight - .5) * 2;
});

export function unmountCover() {
  cancelAnimationFrame(raf); raf = 0; root = null; host = null;
}
export const unmountStage = unmountCover;

addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else if (host && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
});

// 확인용: 주소에 ?debug 가 있을 때만, 숨겨진 창에서도 장면 시간을 앞으로 감을 수 있다
if (new URLSearchParams(location.search).has('debug')) {
  window.__ffStage = (sec = 4) => {
    let t = last || performance.now();
    for (let i = 0; i < sec * 60; i++) { t += 1000 / 60; tick(t); cancelAnimationFrame(raf); }
    raf = 0;
  };
}
