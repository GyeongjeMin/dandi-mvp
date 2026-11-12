/**
 * 3D 단디 렌더러 + 절차적(procedural) 애니메이션
 *
 * - public/models/dandi.glb 를 불러와 이름 붙은 노드(Head, EyeL, MouthOpen, Tail …)를 매 프레임 움직입니다.
 * - 동작은 '상태 머신(machine.ts)'의 현재 상태를 목표값으로 삼고, 모든 값을 지수 감쇠로 부드럽게 따라가게 해서
 *   상태가 바뀌어도 갑자기 튀지 않습니다. (Tolan 이 쓰는 '상태 머신 + 절차적 애니메이션 층' 방식)
 * - 눈 깜빡임·호흡·두리번거림 같은 '살아 있는 느낌'은 상태와 무관하게 늘 겹쳐 흐르는 층이고,
 *   대화 상태(듣기·생각·말하기)와 표정은 실제 대화 이벤트로만 바뀝니다.
 * - 움직임 줄이기: 진폭과 속도를 크게 낮추고, 통통 튀는 동작을 끕니다.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { initialAvatarState, type AvatarState } from './machine';

export interface AvatarInfo { triangles: number; nodes: number; materials: number }
export interface AvatarOptions {
  url?: string;
  reduceMotion?: boolean;
  interactive?: boolean;         // 끌어서 돌려 보기
  onReady?: (info: AvatarInfo) => void;
  onError?: (e: Error) => void;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const bump = (u: number) => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u)); // 0→1→0

type Nodes = Record<string, THREE.Object3D | undefined>;

export class DandiAvatar {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  private root: THREE.Object3D | null = null;
  private n: Nodes = {};
  private base = new Map<THREE.Object3D, { pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3 }>();
  private cheekMats: THREE.MeshStandardMaterial[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private state: AvatarState = initialAvatarState;
  private reduce: boolean;
  // 부드럽게 따라가는 값들
  private v = { pitch: 0, yaw: 0, roll: 0, lean: 0, bounce: 0, happy: 0, lid: 0, cheek: 0.22, mouth: 0, wide: 1, lookX: 0, lookY: 0, tail: 0.08, userYaw: 0 };
  // 깜빡임·두리번·끄덕임 타이밍
  private nextBlink = 2;
  private blinkStart = -1;
  private nextLook = 3;
  private look = { yaw: 0, pitch: 0 };
  private nodStart = -10;
  private lastHeard = 0;
  private drag: { x: number; yaw: number } | null = null;
  private releasedAt = 0;
  private spinFrom = -1;

  constructor(private container: HTMLElement, private opts: AvatarOptions = {}) {
    this.reduce = !!opts.reduceMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = opts.interactive ? 'pan-y' : 'auto';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    // 조명: 따뜻한 하늘빛 + 정면 주광 + 보조광 + 뒤쪽 윤곽광, 은은한 실내 반사(천 질감용)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#fffaf4', '#a99488', 1.35));
    const key = new THREE.DirectionalLight('#fff4ea', 1.7); key.position.set(2.2, 4, 5); this.scene.add(key);
    const fill = new THREE.DirectionalLight('#ffe8dc', 0.6); fill.position.set(-3.5, 2, 2.5); this.scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 1.1); rim.position.set(0.5, 3.5, -4); this.scene.add(rim);
    this.scene.add(this.contactShadow());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; });
    this.io.observe(container);
    document.addEventListener('visibilitychange', this.onVisibility);
    if (opts.interactive) this.bindPointer(canvas);
    this.resize();
    this.load(opts.url ?? '/models/dandi.glb');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    (window as unknown as { __dandi3d?: DandiAvatar }).__dandi3d = this; // 개발자 도구에서 상태 확인용
  }

  // ── 바깥에서 부르는 함수 ──
  setState(s: AvatarState) { this.state = s; }
  setReduceMotion(b: boolean) { this.reduce = b; }
  /** 한 바퀴 돌아 보이기 (3D 확인용) */
  spin() { this.spinFrom = this.t; }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── 준비 ──
  private load(url: string) {
    new GLTFLoader().load(url, (gltf) => {
      const root = gltf.scene.getObjectByName('Dandi') ?? gltf.scene;
      this.root = root;
      this.scene.add(gltf.scene);
      let triangles = 0, nodes = 0;
      const mats = new Set<THREE.Material>();
      gltf.scene.traverse((o) => {
        nodes++;
        if (o.name) this.n[o.name] = o;
        this.base.set(o, { pos: o.position.clone(), rot: o.rotation.clone(), scale: o.scale.clone() });
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          triangles += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
          if (o.name.startsWith('Cheek')) this.cheekMats.push(m.material as THREE.MeshStandardMaterial);
        }
      });
      this.opts.onReady?.({ triangles: Math.round(triangles), nodes, materials: mats.size });
    }, undefined, (e) => this.opts.onError?.(e instanceof Error ? e : new Error(String(e))));
  }

  private contactShadow(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(90,60,40,0.55)');
    grd.addColorStop(1, 'rgba(90,60,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.002, 0.05);
    return m;
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 캐릭터(높이 약 3, 폭 약 1.9)가 화면에 꽉 차되 잘리지 않는 거리
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dist = Math.max(1.72 / tan, 1.12 / (tan * aspect));
    this.camera.position.set(0, 1.62, dist);
    this.camera.lookAt(0, 1.42, 0);
    this.camera.updateProjectionMatrix();
  }

  private onVisibility = () => {
    if (!document.hidden) { this.last = performance.now(); }
  };

  private bindPointer(el: HTMLCanvasElement) {
    el.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, yaw: this.v.userYaw }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.v.userYaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012;
    });
    const up = () => { this.drag = null; this.releasedAt = this.t; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // ── 매 프레임 ──
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden || !this.visible) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    if (this.root) this.animate(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private animate(dt: number) {
    const s = this.state, t = this.t, v = this.v;
    const amp = this.reduce ? 0.35 : 1;           // 움직임 줄이기
    const speed = this.reduce ? 0.6 : 1;
    const ts = t * speed;

    // 1) 늘 흐르는 층: 깜빡임, 두리번거림
    if (t >= this.nextBlink && this.blinkStart < 0) this.blinkStart = t;
    let blink = 0;
    if (this.blinkStart >= 0) {
      const u = (t - this.blinkStart) / 0.17;
      blink = bump(u);
      if (u >= 1) { this.blinkStart = -1; this.nextBlink = t + 2.4 + Math.random() * 3.6 + (Math.random() < 0.15 ? -2.2 : 0); }
    }
    if (t >= this.nextLook) {
      const calm = s.mode === 'idle';
      this.look = { yaw: calm ? (Math.random() - 0.5) * 0.36 : 0, pitch: calm ? (Math.random() - 0.5) * 0.1 : 0 };
      this.nextLook = t + 3.5 + Math.random() * 4;
    }

    // 2) 상태별 목표 자세
    let pitch = 0, yaw = 0, roll = 0, lean = 0, lookX = 0, lookY = 0, mouth = 0.0, tail = 0.08;
    switch (s.mode) {
      case 'idle':
        yaw = this.look.yaw; pitch = this.look.pitch; roll = 0.025 * Math.sin(ts * 0.5);
        lookX = this.look.yaw * 0.05;
        break;
      case 'listening': {
        // 어르신 쪽으로 몸을 기울이고 고개를 살짝 갸웃 + 말소리가 들어올 때 끄덕임
        pitch = 0.08; roll = 0.07; lean = 0.045;
        if (s.heardAt !== this.lastHeard) {
          this.lastHeard = s.heardAt;
          if (t - this.nodStart > 1.3) this.nodStart = t;
        }
        break;
      }
      case 'thinking':
        // 고개를 기울이고 눈을 위로 — 대답을 준비하는 중
        pitch = -0.07; roll = -0.13; yaw = 0.14 + 0.035 * Math.sin(ts * 0.8);
        lookX = 0.012; lookY = 0.016;
        break;
      case 'speaking': {
        yaw = 0.06 * Math.sin(ts * 0.7); roll = 0.03 * Math.sin(ts * 0.9); pitch = 0.02;
        if (s.speaking) {
          // 실제 음성합성이 소리를 내는 동안에만 입이 움직임 (단어 경계에서 한 번 더 크게)
          const syl = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 3.3 + 1.4 * Math.sin(t * 1.9));
          const word = Math.max(0, 1 - (performance.now() - s.wordAt) / 180);
          mouth = 0.22 + 0.62 * syl * syl + 0.3 * word;
        } else mouth = 0.04;
        break;
      }
    }

    // 3) 표정 층
    let happy = 0, lid = 0, cheek = 0.22, wide = 1, bounce = 0;
    if (s.emotion === 'happy') {
      happy = 1; cheek = 0.62; wide = 1.12; tail = 0.24;
      bounce = (s.mode === 'speaking' ? 0.03 : 0.012) * Math.abs(Math.sin(ts * 3.6));
      roll += 0.05 * Math.sin(ts * 1.8);
    } else if (s.emotion === 'comforting') {
      // 차분하고 따뜻하게: 눈을 살짝 내리깔고, 고개를 기울여 천천히 끄덕임
      lid = 1; cheek = 0.42; wide = 0.94; roll += 0.1; pitch += 0.05; tail = 0.05;
      if ((s.mode === 'speaking' || s.mode === 'listening') && t - this.nodStart > 2.8) this.nodStart = t;
    }
    if (happy > 0.5 && s.mode === 'speaking') mouth *= 1.1;

    // 끄덕임 (내려갔다 올라오는 한 번)
    const nodU = (t - this.nodStart) / (s.emotion === 'comforting' ? 1.3 : 0.9);
    pitch += (s.emotion === 'comforting' ? 0.06 : 0.085) * bump(nodU);

    // 4) 부드럽게 따라가기 (빠른 값은 입, 느린 값은 자세)
    const r = this.reduce ? 3 : 5;
    v.pitch = damp(v.pitch, pitch * amp, r, dt);
    v.yaw = damp(v.yaw, yaw * amp, r * 0.7, dt);
    v.roll = damp(v.roll, roll * amp, r * 0.8, dt);
    v.lean = damp(v.lean, lean * amp, r * 0.6, dt);
    v.bounce = damp(v.bounce, this.reduce ? 0 : bounce, 10, dt);
    v.happy = damp(v.happy, happy, 6, dt);
    v.lid = damp(v.lid, lid, 4, dt);
    v.cheek = damp(v.cheek, cheek, 3, dt);
    v.mouth = damp(v.mouth, Math.min(1, mouth * (this.reduce ? 0.7 : 1)), 18, dt);
    v.wide = damp(v.wide, wide, 6, dt);
    v.lookX = damp(v.lookX, lookX, 6, dt);
    v.lookY = damp(v.lookY, lookY, 6, dt);
    v.tail = damp(v.tail, tail * amp, 2, dt);
    if (!this.drag && t - this.releasedAt > 1.2) v.userYaw = damp(v.userYaw, 0, 1.5, dt);

    // 5) 노드에 적용
    const breath = Math.sin((ts * Math.PI * 2) / 3.8);
    const set = (name: string, fn: (o: THREE.Object3D, b: { pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3 }) => void) => {
      const o = this.n[name];
      const b = o && this.base.get(o);
      if (o && b) fn(o, b);
    };
    let spin = 0;
    if (this.spinFrom >= 0) {
      const u = (t - this.spinFrom) / 2.6;
      if (u >= 1) this.spinFrom = -1; else spin = Math.PI * 2 * (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
    }
    set('Dandi', (o, b) => { o.rotation.y = b.rot.y + v.userYaw + spin; o.position.y = b.pos.y + v.bounce; });
    set('Body', (o, b) => { o.rotation.x = b.rot.x + v.lean; o.rotation.z = b.rot.z + v.roll * 0.15; });
    set('BodyMesh', (o, b) => { o.scale.y = b.scale.y * (1 + 0.012 * amp * breath); o.scale.x = b.scale.x * (1 - 0.004 * amp * breath); });
    set('Belly', (o, b) => { o.scale.y = b.scale.y * (1 + 0.014 * amp * breath); });
    set('Head', (o, b) => {
      o.rotation.set(b.rot.x + v.pitch, b.rot.y + v.yaw, b.rot.z + v.roll);
      o.position.y = b.pos.y + 0.012 * amp * breath + 0.02 * v.mouth;
    });
    for (const side of ['L', 'R']) {
      const sgn = side === 'L' ? -1 : 1;
      // 눈: 깜빡임 × 내리깐 눈 × 웃는 눈일 때 숨김
      const open = (1 - blink) * (1 - 0.28 * v.lid) * (1 - v.happy);
      set(`Eye${side}`, (o, b) => {
        o.scale.y = b.scale.y * Math.max(0.02, open);
        o.position.x = b.pos.x + v.lookX;
        o.position.y = b.pos.y + v.lookY - 0.012 * v.lid;
      });
      set(`EyeHappy${side}`, (o, b) => { o.scale.y = Math.max(0.001, v.happy) * b.scale.x; });
      set(`Arm${side}`, (o, b) => {
        o.rotation.x = b.rot.x - 0.03 * amp * breath - (s.mode === 'speaking' ? 0.04 * amp * Math.sin(ts * 1.3 + sgn) : 0);
        o.rotation.z = b.rot.z + sgn * 0.04 * v.happy * Math.sin(ts * 3.6);
      });
      set(`Ear${side}`, (o, b) => {
        o.rotation.z = b.rot.z + sgn * (s.mode === 'listening' ? -0.12 : 0) * amp + 0.04 * bump((t - this.nodStart) / 0.9);
      });
    }
    set('MouthOpen', (o) => { o.scale.y = Math.max(0.001, v.mouth); o.scale.x = 0.85 + 0.25 * v.mouth; });
    set('Mouth', (o, b) => { o.scale.x = b.scale.x * v.wide; o.position.y = b.pos.y - 0.008 * v.mouth; });
    set('Tail', (o, b) => { o.rotation.y = b.rot.y + v.tail * Math.sin(ts * (1.2 + 2.2 * v.happy)); });
    for (const m of this.cheekMats) m.opacity = v.cheek;
  }
}
