/**
 * 단디 3D 모델(GLB) 생성 스크립트
 *   실행: (client 폴더에서) npm run model
 *   결과: public/models/dandi.glb
 *
 * 원본 제품 사진(public/landing/dandi-original.jpg)의 정면·옆면 비율을 재서 만든 '실제 3D 메시'입니다.
 *  - 단위: 1 = 사진 정면 기준 100px, 바닥이 y=0, 정면이 +z
 *  - 부드러운 봉제 인형 질감: KHR_materials_sheen(천 표면 광택) 재질
 *  - 표정·동작을 웹에서 코드로 움직일 수 있도록, 움직이는 부위는 이름 붙은 노드(관절 역할)로 분리
 *      Dandi > Body > { BodyMesh, Belly, FootL/R, Tail, ArmL/R, Shell, Head > { EyeL/R, EyeHappyL/R, Mouth, MouthOpen, CheekL/R, EarL/R, ... } }
 *  - 같은 이름 규칙으로 Blender 에서 다시 만든 GLB 로 바꿔 끼워도 웹 애니메이션 코드가 그대로 동작합니다. (docs/3d-model.md)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// ── Node 에서 GLTFExporter 를 돌리기 위한 최소 폴리필 (브라우저 FileReader 대신) ──
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.({ target: this }); this.onload?.({ target: this }); }); }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
      this.onloadend?.({ target: this }); this.onload?.({ target: this });
    });
  }
};

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..', 'public', 'models', 'dandi.glb');

// ── 색 (사진에서 추출) ──
const C = {
  fur: '#8c7064',        // 갈색 털 (사진의 회갈색)
  furDark: '#7d6155',    // 발·옆구리
  cream: '#e9e1d2',      // 얼굴·배
  belly: '#e4d6c5',
  innerEar: '#6f4d3f',
  nose: '#6a4538',
  eyeOuter: '#3a2119',
  iris: '#7d4b37',
  pupil: '#2a1712',
  white: '#ffffff',
  mouth: '#55352b',
  mouthIn: '#5b2c25',
  shell: '#d9b6a3',
  shellRib: '#a77f6d',
  blush: '#e8a08c',
};

// 봉제 인형 질감: 거칠고(roughness 높음) 천 광택(sheen)
const plush = (color, sheenColor = '#fff3e6') => new THREE.MeshPhysicalMaterial({
  name: `plush_${color}`, color, roughness: 0.92, metalness: 0, sheen: 1, sheenRoughness: 0.75, sheenColor,
});
const matte = (color, name, roughness = 0.6) => new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0 });
const M = {
  fur: plush(C.fur, '#c8b4aa'),
  furDark: plush(C.furDark, '#b9a397'),
  cream: plush(C.cream),
  belly: plush(C.belly),
  innerEar: plush(C.innerEar, '#a8826f'),
  nose: matte(C.nose, 'nose', 0.45),
  eyeOuter: matte(C.eyeOuter, 'eye_outer', 0.25),
  iris: matte(C.iris, 'eye_iris', 0.3),
  pupil: matte(C.pupil, 'eye_pupil', 0.25),
  shine: new THREE.MeshStandardMaterial({ name: 'eye_shine', color: C.white, emissive: C.white, emissiveIntensity: 0.9, roughness: 0.2 }),
  mouth: matte(C.mouth, 'mouth_line', 0.7),
  mouthIn: matte(C.mouthIn, 'mouth_inside', 0.8),
  shell: plush(C.shell, '#fff0e6'),
  shellRib: plush(C.shellRib, '#d6b2a2'),
  blush: new THREE.MeshStandardMaterial({ name: 'blush', color: C.blush, roughness: 1, transparent: true, opacity: 0.22, depthWrite: false }),
};

const SEG = 40; // 구 분할 수 (휴대폰에서도 가볍게)
const ellipsoid = (name, mat, [rx, ry, rz], [x, y, z] = [0, 0, 0], seg = SEG) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), mat);
  m.name = name; m.scale.set(rx, ry, rz); m.position.set(x, y, z);
  return m;
};
const group = (name, [x, y, z] = [0, 0, 0]) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); return g; };
const tube = (name, mat, pts, r, seg = 24) => {
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 8, false), mat);
  m.name = name;
  // 끝을 둥글게
  for (const p of [pts[0], pts[pts.length - 1]]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat); cap.position.set(...p); m.add(cap); }
  return m;
};
/** 회전체(LatheGeometry): [반지름, 높이] 윤곽선을 y축으로 돌려 만든 매끈한 몸통 */
const lathe = (name, mat, profile, seg = 48) => {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const curve = new THREE.SplineCurve(pts);
  const m = new THREE.Mesh(new THREE.LatheGeometry(curve.getPoints(48), seg), mat);
  m.name = name;
  return m;
};
/** 타원체 표면 위의 점 (얼굴 부품을 머리·주둥이 표면에 정확히 붙이기 위해) */
const onEllipsoid = (c, r, x, y, push = 0) => {
  const k = 1 - ((x - c[0]) / r[0]) ** 2 - ((y - c[1]) / r[1]) ** 2;
  return [x, y, c[2] + r[2] * Math.sqrt(Math.max(0, k)) + push];
};

// ═════════════════════════ 조립 ═════════════════════════
const dandi = group('Dandi');
const body = group('Body');
dandi.add(body);

// 몸통: 아래가 넓은 서양배 모양 (정면 사진 폭 비율), 앞뒤로 약간 납작
const bodyMesh = lathe('BodyMesh', M.fur, [
  [0.0, 0.02], [0.5, 0.03], [0.68, 0.1], [0.76, 0.3], [0.77, 0.52], [0.73, 0.82], [0.65, 1.12], [0.54, 1.38], [0.38, 1.56], [0.0, 1.66],
]);
bodyMesh.scale.set(1, 1, 0.86);
body.add(bodyMesh);
body.add(ellipsoid('Belly', M.belly, [0.5, 0.6, 0.3], [0, 0.86, 0.36]));
body.add(ellipsoid('FootL', M.furDark, [0.21, 0.11, 0.27], [-0.44, 0.08, 0.42]));
body.add(ellipsoid('FootR', M.furDark, [0.21, 0.11, 0.27], [0.44, 0.08, 0.42]));

// 꼬리: 몸 뒤 아래에서 뒤로 길게 뻗은 납작한 노 모양 (옆모습 사진), 끝부분 아래는 크림색
const tail = group('Tail', [0, 0.26, -0.5]);
const tailMesh = lathe('TailMesh', M.fur, [
  [0.0, 0.0], [0.26, 0.04], [0.3, 0.25], [0.27, 0.6], [0.2, 0.95], [0.12, 1.25], [0.04, 1.42], [0.0, 1.45],
], 32);
tailMesh.scale.set(1.3, 1, 0.72); // 좌우로 넓고 위아래로 납작
tailMesh.rotation.x = -Math.PI / 2 - 0.12; // 뒤(-z)로 눕히고 끝이 바닥에 닿게
tail.add(tailMesh);
tail.add(ellipsoid('TailTip', M.cream, [0.2, 0.05, 0.3], [0, -0.2, -1.12], 24));
body.add(tail);

// 조개: 아래가 뾰족한 부채꼴, 가장자리에 물결, 앞면에 갈비 무늬
const shellShape = new THREE.Shape();
const apex = new THREE.Vector2(0, -0.26);
shellShape.moveTo(apex.x, apex.y);
const R = 0.46;
for (let i = 0; i <= 64; i++) {
  const a = THREE.MathUtils.lerp(-0.86, 0.86, i / 64); // 부채 각도
  const wave = 1 + 0.035 * Math.cos((i / 64) * Math.PI * 14);
  shellShape.lineTo(apex.x + Math.sin(a) * R * wave, apex.y + Math.cos(a) * R * wave);
}
shellShape.lineTo(apex.x, apex.y);
const shellGeo = new THREE.ExtrudeGeometry(shellShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 4, curveSegments: 48 });
shellGeo.center();
const shell = new THREE.Mesh(shellGeo, M.shell);
shell.name = 'Shell';
shell.position.set(0, 0.92, 0.7);
shell.rotation.x = -0.12;
for (let i = -3; i <= 3; i++) {
  const a = i * 0.22;
  const p0 = [0, -0.2, 0.085];
  const p1 = [Math.sin(a) * 0.19, -0.2 + Math.cos(a) * 0.19, 0.1];
  const p2 = [Math.sin(a) * 0.38, -0.2 + Math.cos(a) * 0.38, 0.085];
  shell.add(tube(`ShellRib${i + 3}`, M.shellRib, [p0, p1, p2], 0.011, 12));
}
body.add(shell);

// 팔: 어깨에서 조개 쪽으로 감싸 안는 통통한 캡슐 (어깨가 회전 중심)
const arm = (name, side) => {
  const g = group(name, [side * 0.6, 1.3, 0.12]);
  const hand = new THREE.Vector3(side * -0.36, -0.36, 0.56);
  const len = hand.length();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, len - 0.1, 8, 20), M.fur);
  m.name = `${name}Mesh`;
  m.position.copy(hand.clone().multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hand.clone().normalize());
  m.scale.set(1, 1, 0.9);
  g.add(m);
  g.add(ellipsoid(`${name}Paw`, M.fur, [0.15, 0.13, 0.12], [hand.x * 1.02, hand.y, hand.z + 0.02], 24));
  return g;
};
body.add(arm('ArmL', -1));
body.add(arm('ArmR', 1));

// ── 머리 (목 위치가 회전 중심) ──
const NECK = [0, 1.45, 0.02];
const head = group('Head', NECK);
body.add(head);
const at = (p) => [p[0] - NECK[0], p[1] - NECK[1], p[2] - NECK[2]]; // 절대좌표 → 머리 기준
const HC = [0, 2.1, 0];              // 머리 중심
const HR = [0.77, 0.67, 0.68];       // 머리 반지름 (정면보다 살짝 넓게)
head.add(ellipsoid('HeadMesh', M.fur, HR, at(HC)));
// 얼굴 아래쪽 크림색 (볼이 넓게)
const FC = [0, 1.84, 0.27], FR = [0.73, 0.43, 0.5];
head.add(ellipsoid('Face', M.cream, FR, at(FC)));
// 두 눈 사이로 올라오는 크림색 + 앞으로 나온 주둥이
head.add(ellipsoid('Brow', M.cream, [0.22, 0.24, 0.2], at([0, 2.07, 0.52]), 24));
head.add(ellipsoid('Snout', M.cream, [0.3, 0.22, 0.2], at([0, 1.86, 0.6])));
// 귀
for (const s of [-1, 1]) {
  const ear = group(s < 0 ? 'EarL' : 'EarR', at([s * 0.67, 2.43, 0.02]));
  ear.add(ellipsoid(`${ear.name}Outer`, M.fur, [0.15, 0.15, 0.08]));
  ear.add(ellipsoid(`${ear.name}Inner`, M.innerEar, [0.085, 0.09, 0.03], [0, -0.01, 0.06], 20));
  ear.rotation.z = s * -0.35;
  head.add(ear);
}
// 눈: 큰 갈색 눈 + 반짝임 (Eye 그룹의 세로 크기로 깜빡임, EyeHappy 로 웃는 눈 ^ ^)
for (const s of [-1, 1]) {
  const ex = s * 0.37, ey = 2.17;
  const p = onEllipsoid(HC, HR, ex, ey, -0.02);
  const eye = group(s < 0 ? 'EyeL' : 'EyeR', at(p));
  eye.rotation.y = s * 0.42;
  eye.rotation.x = -0.08;
  eye.add(ellipsoid(`${eye.name}Outer`, M.eyeOuter, [0.12, 0.13, 0.05], [0, 0, 0], 28));
  eye.add(ellipsoid(`${eye.name}Iris`, M.iris, [0.088, 0.098, 0.04], [0, -0.008, 0.016], 24));
  eye.add(ellipsoid(`${eye.name}Pupil`, M.pupil, [0.05, 0.056, 0.03], [0, -0.004, 0.032], 20));
  eye.add(ellipsoid(`${eye.name}Shine`, M.shine, [0.034, 0.034, 0.015], [s * -0.035 + 0.035, 0.045, 0.05], 12));
  eye.add(ellipsoid(`${eye.name}Shine2`, M.shine, [0.016, 0.016, 0.01], [-0.032, -0.045, 0.048], 10));
  head.add(eye);
  // 웃는 눈: 위로 볼록한 호 (평소엔 세로 크기 0으로 숨김)
  const happy = group(s < 0 ? 'EyeHappyL' : 'EyeHappyR', at([p[0], p[1] - 0.01, p[2] + 0.03]));
  happy.rotation.y = s * 0.42;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 8, 24, Math.PI), M.eyeOuter);
  arc.name = `${happy.name}Arc`;
  happy.add(arc);
  happy.scale.set(1, 0.001, 1);
  head.add(happy);
  // 볼 홍조 (불투명도로 표정 표현)
  const cp = onEllipsoid(FC, FR, s * 0.46, 1.94, 0.01);
  const cheek = ellipsoid(s < 0 ? 'CheekL' : 'CheekR', M.blush, [0.085, 0.065, 0.02], at(cp), 20);
  cheek.rotation.y = s * 0.55;
  head.add(cheek);
}
// 코: 둥근 역삼각형
const nose = ellipsoid('Nose', M.nose, [0.13, 0.085, 0.085], at([0, 1.95, 0.79]), 28);
nose.geometry = nose.geometry.clone();
{ // 아래쪽을 좁혀 역삼각형으로
  const pos = nose.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setX(i, pos.getX(i) * (y < 0 ? 1 + y * 0.45 : 1)); }
  nose.geometry.computeVertexNormals();
}
head.add(nose);
// 입: 'w' 모양 선 (Mouth) + 말할 때 벌어지는 입 안 (MouthOpen, 평소엔 세로 0)
const mouthPts = [[-0.27, 0.035], [-0.18, -0.03], [-0.09, -0.04], [0, 0.005], [0.09, -0.04], [0.18, -0.03], [0.27, 0.035]]
  .map(([x, dy]) => at(onEllipsoid(FC, FR, x, 1.71 + dy, 0.004)));
const mouthGroup = group('Mouth');
mouthGroup.add(tube('MouthLine', M.mouth, mouthPts, 0.013, 48));
head.add(mouthGroup);
const mouthOpen = group('MouthOpen', at(onEllipsoid(FC, FR, 0, 1.655, -0.012)));
mouthOpen.add(ellipsoid('MouthOpenMesh', M.mouthIn, [0.075, 0.055, 0.03], [0, 0, 0], 20));
mouthOpen.scale.y = 0.001; // 평소엔 닫힘 (웹에서 0~1 로 벌림)
head.add(mouthOpen);
// 수염
const whiskers = group('Whiskers');
for (const s of [-1, 1]) {
  for (let k = 0; k < 3; k++) {
    const y0 = 1.86 - k * 0.055;
    const a = onEllipsoid(FC, FR, s * 0.4, y0, 0.006), b = onEllipsoid(FC, FR, s * 0.53, y0 - 0.03 + k * 0.02, 0.006);
    whiskers.add(tube(`Whisker${s < 0 ? 'L' : 'R'}${k}`, M.mouth, [at(a), at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.01, (a[2] + b[2]) / 2 + 0.004]), at(b)], 0.006, 8));
  }
}
head.add(whiskers);

// ── 저장 ──
dandi.updateMatrixWorld(true);
// 텍스처를 쓰지 않으므로 UV 좌표는 빼서 파일을 가볍게
dandi.traverse((o) => { if (o.isMesh && o.geometry.attributes.uv) o.geometry.deleteAttribute('uv'); });
let tris = 0;
dandi.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
const scene = new THREE.Scene();
scene.add(dandi);
const glb = await new Promise((resolve, reject) => new GLTFExporter().parse(scene, resolve, reject, { binary: true }));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(glb));
console.log(`단디 3D 모델 저장: ${path.relative(process.cwd(), OUT)} (${(glb.byteLength / 1024).toFixed(0)} KB, 삼각형 약 ${Math.round(tris).toLocaleString()}개)`);
