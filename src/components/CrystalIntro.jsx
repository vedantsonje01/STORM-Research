import { useEffect, useRef, useState, useCallback } from 'react';
import ParticleCanvas from './ParticleCanvas.jsx';
import { StormText } from './BoltLogo.jsx';
import AboutPage from './AboutPage.jsx';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

const USER_KEY = 'storm_user';

function isLoggedIn() {
  try { return !!localStorage.getItem(USER_KEY); } catch { return false; }
}

function loginUser(email) {
  localStorage.setItem(USER_KEY, JSON.stringify({ email, ts: Date.now() }));
}

// ── Deterministic RNG (seeded) ─────────────────────────────────────────────
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ── WebGL availability probe ───────────────────────────────────────────────
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────
//  Three.js scene factory functions (framework-agnostic)
// ─────────────────────────────────────────────────────────────────────────

// Rough, vertically-elongated faceted ice/quartz stone.
function makeCrystal() {
  const simplex = new SimplexNoise();

  // PolyhedronGeometry (Icosahedron's base) is already non-indexed.
  const geo = new THREE.IcosahedronGeometry(1, 1);

  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  const cache = new Map();
  const key = (x, y, z) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

  const FREQ_1 = 1.15, AMP_1 = 0.42;
  const FREQ_2 = 2.7,  AMP_2 = 0.16;
  const FREQ_3 = 5.5,  AMP_3 = 0.06;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = key(v.x, v.y, v.z);
    let disp;
    if (cache.has(k)) {
      disp = cache.get(k);
    } else {
      const n =
        simplex.noise3d(v.x * FREQ_1, v.y * FREQ_1, v.z * FREQ_1) * AMP_1 +
        simplex.noise3d(v.x * FREQ_2, v.y * FREQ_2, v.z * FREQ_2) * AMP_2 +
        simplex.noise3d(v.x * FREQ_3, v.y * FREQ_3, v.z * FREQ_3) * AMP_3;
      disp = 1 + n;
      cache.set(k, disp);
    }
    v.multiplyScalar(disp);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.scale(0.82, 1.32, 0.82);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x081120,
    metalness: 0.0,
    roughness: 0.15,
    transmission: 1.0,
    thickness: 2.2,
    ior: 1.8,
    attenuationColor: new THREE.Color(0x1c5ba8),
    attenuationDistance: 0.6,
    clearcoat: 1.0,
    clearcoatRoughness: 0.22,
    specularColor: new THREE.Color(0x9fd4ff),
    specularIntensity: 0.9,
    envMapIntensity: 0.9,
    flatShading: true,
    transparent: true,
    side: THREE.FrontSide,
    emissive: new THREE.Color(0x07294f),
    emissiveIntensity: 0.32,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return { mesh, geo, mat };
}

// Bright white-hot branching internal caustic web (HDR additive tubes).
function makeCausticWeb() {
  const group = new THREE.Group();
  group.renderOrder = 1;

  const rng = seeded(20240611);
  const BRANCHES = 13;
  const STEPS = 6;
  const STEP_LEN = 0.155;
  const JITTER = 0.55;
  const MAX_R = 0.82;

  const curves = [];

  function walk(start, dir, steps, stepLen, jitter, depth) {
    const pts = [start.clone()];
    const d = dir.clone().normalize();
    let p = start.clone();
    for (let i = 0; i < steps; i++) {
      d.x += (rng() - 0.5) * jitter;
      d.y += (rng() - 0.5) * jitter;
      d.z += (rng() - 0.5) * jitter;
      d.normalize();
      p = p.clone().addScaledVector(d, stepLen * (0.7 + rng() * 0.6));
      if (p.length() > MAX_R) p.setLength(MAX_R);
      pts.push(p.clone());
      if (depth > 0 && i > 1 && rng() < 0.55) {
        const subDir = d.clone();
        subDir.x += (rng() - 0.5) * 1.2;
        subDir.y += (rng() - 0.5) * 1.2;
        subDir.z += (rng() - 0.5) * 1.2;
        walk(p, subDir, Math.max(2, steps - i - 2), stepLen * 0.8, jitter * 1.3, depth - 1);
      }
    }
    if (pts.length >= 2) curves.push(new THREE.CatmullRomCurve3(pts));
  }

  for (let b = 0; b < BRANCHES; b++) {
    const dir = new THREE.Vector3(rng() * 2 - 1, (rng() * 2 - 1) * 1.3, rng() * 2 - 1);
    const start = new THREE.Vector3(
      (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12,
    );
    walk(start, dir, STEPS, STEP_LEN, JITTER, 1);
  }

  const geos = [];
  const mats = [];
  const tubes = [];
  for (let i = 0; i < curves.length; i++) {
    const c = curves[i];
    const radius = 0.0085 + rng() * 0.007;
    const g = new THREE.TubeGeometry(c, 28, radius, 6, false);
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x9be8ff),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.userData.phase = rng() * Math.PI * 2;
    mesh.userData.baseColor = new THREE.Color(0x9be8ff);
    geos.push(g); mats.push(m); tubes.push(mesh);
    group.add(mesh);
  }

  // Bright nodes at branch tips.
  const nodeGeo = new THREE.SphereGeometry(0.013, 8, 8);
  const nodes = [];
  for (const c of curves) {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffffff),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
    });
    const n = new THREE.Mesh(nodeGeo, m);
    n.position.copy(c.getPoint(1));
    n.userData.phase = rng() * Math.PI * 2;
    mats.push(m);
    nodes.push(n);
    group.add(n);
  }
  geos.push(nodeGeo);

  function update(t) {
    const pulse = 0.75 + Math.sin(t * 1.6) * 0.25;
    for (const tube of tubes) {
      const flick = 0.7 + Math.sin(t * 6.0 + tube.userData.phase) * 0.3;
      const k = pulse * flick;
      tube.material.color.copy(tube.userData.baseColor).multiplyScalar(1.55 + k * 0.95);
      tube.material.opacity = 0.6 + k * 0.3;
    }
    for (const n of nodes) {
      const f = 0.6 + Math.sin(t * 7.0 + n.userData.phase) * 0.4;
      n.material.color.setRGB(1.35 * f, 1.5 * f, 1.7 * f);
      n.scale.setScalar(0.55 + f * 0.4);
    }
    group.rotation.y = -t * 0.10;
    group.rotation.z = Math.sin(t * 0.4) * 0.05;
  }

  function dispose() {
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
  }

  return { group, update, dispose };
}

// Core glow: HDR sphere + soft additive halo sprite.
function makeCoreGlow() {
  const group = new THREE.Group();
  const disposables = [];

  const coreGeo = new THREE.SphereGeometry(0.13, 24, 24);
  const coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xbfeaff),
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);
  disposables.push(coreGeo, coreMat);

  function makeGlowTexture() {
    const size = 128;
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = size;
    const ctx = cnv.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, 'rgba(200,238,255,1.0)');
    g.addColorStop(0.25, 'rgba(120,200,255,0.55)');
    g.addColorStop(0.6, 'rgba(60,150,230,0.18)');
    g.addColorStop(1.0, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cnv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const haloTex = makeGlowTexture();
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    color: new THREE.Color(0x6fd0ff),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 0.9,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(1.1);
  group.add(halo);
  disposables.push(haloTex, haloMat);

  function update(t) {
    const pulse = 0.85 + Math.sin(t * 1.4) * 0.15;
    core.material.color.setRGB(0.7, 0.88, 1.0).multiplyScalar(1.6 + pulse * 0.7);
    core.scale.setScalar(0.7 + pulse * 0.12);
    const haloPulse = 0.9 + Math.sin(t * 1.4 + 0.6) * 0.2;
    halo.scale.setScalar(0.78 + haloPulse * 0.16);
    halo.material.opacity = 0.42 + haloPulse * 0.16;
  }

  function dispose() { disposables.forEach((d) => d.dispose()); }

  return { group, update, dispose };
}

// ── Shatter: fragments ──────────────────────────────────────────────────────
function makeShardGeometry(rng, size) {
  // detail 1 → chunkier, more solid-looking shards (less spiky than detail 0)
  const g = new THREE.IcosahedronGeometry(size, 1);
  const pos = g.attributes.position;
  // Flatten on one axis so shards read as angular crystal CHIPS, not blobs,
  // but keep the per-vertex jitter tight so they don't look spiky/cartoonish.
  const flat = 0.5 + rng() * 0.4;
  const flatAxis = Math.floor(rng() * 3);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * (0.78 + rng() * 0.4);
    let y = pos.getY(i) * (0.78 + rng() * 0.4);
    let z = pos.getZ(i) * (0.78 + rng() * 0.4);
    if (flatAxis === 0) x *= flat;
    else if (flatAxis === 1) y *= flat;
    else z *= flat;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function createFragments(parent, crystalMaterial, opts = {}) {
  const {
    center = new THREE.Vector3(0, 0, 0),
    radius = 0.82,
    height = 1.32,
    count = 30,
    seed = 1337,
  } = opts;

  const rng = seeded(seed);
  const fragments = [];
  const geos = [];
  const mats = [];

  // Solid icy crystal-chip material: real reflections + a little translucency,
  // depth-written so shards look like genuine 3D objects (not flat glowing cutouts).
  const baseMat = new THREE.MeshPhysicalMaterial({
    color: 0x9ec2e6,
    metalness: 0.0,
    roughness: 0.34,
    transmission: 0.32,
    thickness: 0.4,
    ior: 1.55,
    clearcoat: 0.8,
    clearcoatRoughness: 0.3,
    specularColor: new THREE.Color(0xbfe0ff),
    specularIntensity: 0.8,
    envMapIntensity: 1.0,
    flatShading: true,
    transparent: true,
    depthWrite: true,
    emissive: new THREE.Color(0x12325a),
    emissiveIntensity: 0.26,
  });

  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = Math.cbrt(rng());
    const lx = Math.sin(phi) * Math.cos(theta) * radius * r;
    const ly = Math.cos(phi) * height * r;
    const lz = Math.sin(phi) * Math.sin(theta) * radius * r;

    const local = new THREE.Vector3(lx, ly, lz);
    const worldPos = local.clone().add(center);

    const size = (0.10 + rng() * 0.22) * radius;
    const geo = makeShardGeometry(rng, size);
    const mat = baseMat.clone();
    mat.opacity = 1;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(worldPos);
    mesh.rotation.set(rng() * 6.28, rng() * 6.28, rng() * 6.28);
    mesh.visible = false;
    mesh.renderOrder = 2;
    parent.add(mesh);

    const dir = local.clone();
    if (dir.lengthSq() < 1e-6) dir.set(rng() - 0.5, rng() - 0.5, rng() - 0.5);
    dir.normalize();

    geos.push(geo); mats.push(mat);
    fragments.push({
      mesh, dir,
      vel: new THREE.Vector3(),
      angVel: new THREE.Vector3(),
      life: 0,
    });
  }
  baseMat.dispose();
  return { fragments, geos, mats };
}

function resetFragments(fragments, opts = {}) {
  const { speed = 8.0, spin = 7.0 } = opts;
  for (const f of fragments) {
    f.mesh.visible = true;
    f.mesh.material.opacity = 1;

    // Blast outward across the SCREEN PLANE (x = horizontal, y = vertical).
    // The z-component (toward/away from camera) is damped so shards spread to
    // every side of the screen instead of just toward the lens — and there is
    // no gravity, so they keep flying out rather than falling down.
    const p = f.mesh.position;
    const outward = new THREE.Vector3(p.x, p.y, p.z * 0.25);
    if (outward.lengthSq() < 1e-4) {
      const a = Math.random() * Math.PI * 2;
      outward.set(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.3);
    }
    outward.normalize();
    // A little angular scatter so it doesn't look like a perfect starburst.
    outward.x += (Math.random() - 0.5) * 0.45;
    outward.y += (Math.random() - 0.5) * 0.45;
    outward.z += (Math.random() - 0.5) * 0.15;
    outward.normalize();

    f.vel.copy(outward).multiplyScalar(speed * (0.75 + Math.random() * 0.6));
    f.angVel.set(
      (Math.random() - 0.5) * spin,
      (Math.random() - 0.5) * spin,
      (Math.random() - 0.5) * spin,
    );
    f.life = 0;
  }
}

const SHATTER_DURATION = 1.5;
const DRAG = 0.97; // gentle ease-out; no gravity so shards fly outward and stay

function updateFragments(fragments, dt) {
  dt = Math.min(dt, 1 / 30);
  let allDone = true;
  for (const f of fragments) {
    if (!f.mesh.visible) continue;
    f.life += dt;
    const t = f.life / SHATTER_DURATION;
    f.vel.multiplyScalar(Math.pow(DRAG, dt * 60));
    f.mesh.position.addScaledVector(f.vel, dt);
    f.mesh.rotation.x += f.angVel.x * dt;
    f.mesh.rotation.y += f.angVel.y * dt;
    f.mesh.rotation.z += f.angVel.z * dt;
    const fade = t < 0.45 ? 1 : 1 - Math.pow((t - 0.45) / 0.55, 1.5);
    f.mesh.material.opacity = Math.max(0, fade);
    if ('emissiveIntensity' in f.mesh.material) {
      f.mesh.material.emissiveIntensity = 0.26 * (0.7 + (1 - t) * 0.6);
    }
    if (t >= 1) f.mesh.visible = false;
    else allDone = false;
  }
  return allDone;
}

// ── Shatter: flash + shockwave ──────────────────────────────────────────────
function makeRadialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(200,230,255,0.9)');
  grd.addColorStop(0.6, 'rgba(79,195,247,0.25)');
  grd.addColorStop(1.0, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createFlashAndShockwave(scene, center) {
  const tex = makeRadialTexture();
  const flashMat = new THREE.SpriteMaterial({
    map: tex, color: 0x9fd4ff,
    transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false,
  });
  const flashSprite = new THREE.Sprite(flashMat);
  flashSprite.position.copy(center);
  flashSprite.scale.setScalar(0.001);
  flashSprite.renderOrder = 999;
  flashSprite.visible = false;
  scene.add(flashSprite);

  return {
    flashSprite, _life: undefined,
    dispose() { tex.dispose(); flashMat.dispose(); },
  };
}

function triggerFlash(fx) {
  fx.flashSprite.visible = true;
  fx.flashSprite.material.opacity = 1;
  fx.flashSprite.scale.setScalar(0.001);
  fx._life = 0;
}

function updateFlash(fx, dt, radius) {
  if (fx._life === undefined) return;
  dt = Math.min(dt, 1 / 30);
  fx._life += dt;
  const t = fx._life;
  const FLASH_DUR = 0.22;
  if (t <= FLASH_DUR && fx.flashSprite.visible) {
    const ft = t / FLASH_DUR;
    fx.flashSprite.scale.setScalar((0.5 + ft * 3.0) * radius * 3);
    fx.flashSprite.material.opacity = 1 - ft;
  } else if (fx.flashSprite.visible) {
    fx.flashSprite.visible = false;
  }
}

// ── Ambient particles (cheap dust drifting in the void) ─────────────────────
function makeParticles() {
  const COUNT = 140;
  const positions = new Float32Array(COUNT * 3);
  const rng = seeded(8675309);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3 + 0] = (rng() - 0.5) * 9;
    positions[i * 3 + 1] = (rng() - 0.5) * 6;
    positions[i * 3 + 2] = (rng() - 0.5) * 5 - 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x4fc3f7,
    size: 0.03,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: true,
  });
  const points = new THREE.Points(geo, mat);
  function update(t) {
    points.rotation.y = t * 0.02;
    mat.opacity = 0.35 + Math.sin(t * 0.8) * 0.12;
  }
  function dispose() { geo.dispose(); mat.dispose(); }
  return { points, update, dispose };
}

// ─────────────────────────────────────────────────────────────────────────
//  Component
// ─────────────────────────────────────────────────────────────────────────

export default function CrystalIntro({ onComplete }) {
  const hostRef = useRef(null);
  const [stage, setStage] = useState('idle'); // idle → shattering → bolt-zoom → revealed → auth
  const [showAbout, setShowAbout] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stormText, setStormText] = useState('');
  const stageRef = useRef('idle');
  const apiRef = useRef(null);          // { startShatter() } exposed by the 3D effect
  const initedRef = useRef(false);      // StrictMode double-invoke guard
  const autoMode = useRef(isLoggedIn());

  useEffect(() => { stageRef.current = stage; }, [stage]);

  // Bolt-zoom → revealed transition
  useEffect(() => {
    if (stage !== 'bolt-zoom') return;
    const tid = setTimeout(() => {
      setStage('revealed');
    }, 800);
    return () => clearTimeout(tid);
  }, [stage]);

  // Typewriter for STORM after shatter (unchanged contract)
  useEffect(() => {
    if (stage !== 'revealed' && stage !== 'auth') return;
    const text = 'STORM';
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setStormText(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(iv);
        setTimeout(() => {
          if (autoMode.current) {
            onComplete();
          } else {
            setStage('auth');
          }
        }, 600);
      }
    }, 120);
    return () => clearInterval(iv);
  }, [stage === 'revealed']);

  // Three.js scene
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Graceful fallback: no WebGL → keep dark backdrop, allow click→complete path.
    if (!webglAvailable()) {
      apiRef.current = {
        startShatter() {
          // No 3D to animate; advance to reveal shortly so the STORM/auth flow runs.
          setTimeout(() => {
            if (stageRef.current === 'shattering') setStage('bolt-zoom');
          }, 400);
        },
      };
      return;
    }

    // StrictMode guard: only init one live context at a time.
    if (initedRef.current) return;
    initedRef.current = true;

    let disposed = false;
    let rafId = 0;
    const width = host.clientWidth || window.innerWidth;
    const height = host.clientHeight || window.innerHeight;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      // Context creation failed at runtime → fallback path.
      initedRef.current = false;
      apiRef.current = {
        startShatter() {
          setTimeout(() => {
            if (stageRef.current === 'shattering') setStage('bolt-zoom');
          }, 400);
        },
      };
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.setClearColor(0x050508, 0.0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 9.2);

    // Environment reflections (PMREM RoomEnvironment — no-arg in 0.185).
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    try {
      pmrem.compileEquirectangularShader();
      envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
    } catch (err) {
      // If env build fails, transmission still renders (just flatter).
      envRT = null;
    }

    // Lighting — sharp moving speculars on top of env fill.
    const ambient = new THREE.AmbientLight(0x14233d, 0.35);
    const keyLight = new THREE.PointLight(0xdcefff, 14, 0, 2);
    keyLight.position.set(-3, 3, 3);
    const fillLight = new THREE.PointLight(0x1e88d8, 9, 0, 2);
    fillLight.position.set(3, -1.5, 2);
    const rimLight = new THREE.PointLight(0x4fc3f7, 22, 0, 2);
    rimLight.position.set(0, 1.5, -4);
    scene.add(ambient, keyLight, fillLight, rimLight);

    // Build crystal + interior light. Web/core are children of the crystal so
    // they float with it, but the web counter-rotates internally for shimmer.
    const web = makeCausticWeb();
    const glow = makeCoreGlow();
    const { mesh: crystal, geo: crystalGeo, mat: crystalMat } = makeCrystal();
    crystal.add(web.group);
    crystal.add(glow.group);
    scene.add(crystal);

    const particles = makeParticles();
    scene.add(particles.points);

    // Shatter rig.
    const center = new THREE.Vector3(0, 0, 0);
    const { fragments, geos: fragGeos, mats: fragMats } =
      createFragments(scene, crystalMat, { center, radius: 0.82, height: 1.32, count: 30 });
    const fx = createFlashAndShockwave(scene, center);

    // Postprocessing: RenderPass → UnrealBloom → OutputPass.
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.55, // strength
      0.48, // radius
      0.78, // threshold (only the HDR interior web/core cross it; body stays under)
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    const clock = new THREE.Clock();
    let shatterStarted = false;
    const BASE_BLOOM = 0.55;

    apiRef.current = {
      startShatter() {
        if (shatterStarted || disposed) return;
        shatterStarted = true;
        crystal.visible = false; // hide solid crystal; shards take over
        resetFragments(fragments, { speed: 8.5, spin: 6 });
        triggerFlash(fx);
        bloomPass.strength = 1.15; // brief flare on the burst
      },
    };

    const animate = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = clock.getElapsedTime();

      particles.update(t);

      if (stageRef.current === 'idle') {
        crystal.rotation.y = t * 0.15;
        crystal.rotation.x = Math.sin(t * 0.25) * 0.06;
        crystal.position.y = Math.sin(t * 0.6) * 0.08;
        web.update(t);
        glow.update(t);
      } else if (stageRef.current === 'shattering') {
        web.update(t);
        glow.update(t);
        const done = updateFragments(fragments, dt);
        updateFlash(fx, dt, 0.9);
        bloomPass.strength += (BASE_BLOOM - bloomPass.strength) * Math.min(dt, 1 / 30) * 2.4;
        if (done) {
          stageRef.current = 'bolt-zoom';
          setStage('bolt-zoom');
        }
      }
      // 'revealed' / 'auth': scene is empty (crystal hidden, shards faded);
      // particles keep drifting behind the transparent HTML overlay.

      composer.render();
    };
    animate();

    const onResize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);

      web.dispose();
      glow.dispose();
      particles.dispose();
      fx.dispose();
      crystalGeo.dispose();
      crystalMat.dispose();
      fragGeos.forEach((g) => g.dispose());
      fragMats.forEach((m) => m.dispose());

      composer.dispose();
      if (envRT) envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
      // Allow a fresh init if React remounts (StrictMode dev cycle).
      initedRef.current = false;
      apiRef.current = null;
    };
  }, []);


  const handleClick = useCallback(() => {
    if (stageRef.current !== 'idle') return;
    stageRef.current = 'shattering';
    setStage('shattering');
    if (apiRef.current) {
      apiRef.current.startShatter();
    } else {
      // No 3D scene (WebGL unavailable and api never set): advance gracefully.
      setTimeout(() => {
        if (stageRef.current === 'shattering') setStage('bolt-zoom');
      }, 400);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    loginUser(email.trim());
    onComplete();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#050508' }}>
      {/* Three.js WebGL crystal mounts here, behind the HTML overlays */}
      <div
        ref={hostRef}
        onClick={handleClick}
        style={{
          position: 'absolute', inset: 0,
          cursor: stage === 'idle' ? 'pointer' : 'default',
        }}
      />

      {/* Neural network mesh behind auth */}
      {stage === 'auth' && <ParticleCanvas />}

      {/* "click to enter" hint */}
      {stage === 'idle' && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: '22%',
          textAlign: 'center', pointerEvents: 'none', zIndex: 2,
          color: 'rgba(129, 212, 250, 0.55)',
          fontSize: '13px', letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontFamily: "'Inter', system-ui, sans-serif",
          animation: 'hintPulse 2.6s ease-in-out infinite',
        }}>
          click to enter
        </div>
      )}

      {/* About STORM button */}
      {stage === 'idle' && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowAbout(true); }}
          style={{
            position: 'absolute', bottom: '8%', left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5, pointerEvents: 'auto',
            background: 'none', border: '1px solid rgba(79, 195, 247, 0.2)',
            borderRadius: 999, padding: '7px 20px',
            color: 'rgba(129, 212, 250, 0.5)',
            fontSize: '12px', letterSpacing: '0.1em',
            cursor: 'pointer',
            fontFamily: "'Inter', system-ui, sans-serif",
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(79, 195, 247, 0.5)'; e.currentTarget.style.color = 'rgba(129, 212, 250, 0.8)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(79, 195, 247, 0.2)'; e.currentTarget.style.color = 'rgba(129, 212, 250, 0.5)'; }}
        >
          About STORM
        </button>
      )}

      {/* About page overlay */}
      {showAbout && <AboutPage onBack={() => setShowAbout(false)} />}

      {/* Bolt zoom transition — starts during shatter, persists through bolt-zoom */}
      {(stage === 'shattering' || stage === 'bolt-zoom') && (
        <>
          <div style={{
            position: 'absolute',
            left: '50%', top: '50%',
            zIndex: 10,
            pointerEvents: 'none',
            animation: 'boltZoomIn 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}>
            <svg width="100" height="100" viewBox="0 0 32 32" style={{ display: 'block' }}>
              <path d="M19,5 L12,15 L16,15 L13,27 L20,17 L16,17 Z"
                fill="none" stroke="#4FC3F7" strokeWidth="1.2"
                strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{
            position: 'absolute', inset: 0, zIndex: 9,
            background: '#050508',
            pointerEvents: 'none',
            animation: 'boltScreenFade 2.2s ease-in forwards',
          }} />
        </>
      )}

      {/* STORM text reveal */}
      {(stage === 'revealed' || stage === 'auth') && (
        <div style={{
          position: 'absolute', left: 0, right: 0,
          top: stage === 'auth' ? '12%' : '50%',
          transform: stage === 'auth' ? 'none' : 'translateY(-50%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none', zIndex: 2,
          transition: 'top 0.6s ease',
        }}>
          <h1 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(56px, 10vw, 96px)',
            fontWeight: 400,
            letterSpacing: '-0.04em',
            color: '#E0E0E8',
            margin: 0,
            animation: 'stormReveal 0.8s ease-out both',
          }}>
            <StormText text={stormText} fontSize={96} />
          </h1>
          <p style={{
            color: 'rgba(129, 212, 250, 0.6)',
            fontSize: '14px',
            letterSpacing: '0.1em',
            marginTop: 12,
            opacity: stormText.length >= 5 ? 1 : 0,
            transition: 'opacity 0.6s ease',
          }}>
            Stanford's Research Methodology
          </p>
        </div>
      )}

      {/* Auth card */}
      {stage === 'auth' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 3,
        }}>
          <div style={{
            width: 380, padding: '36px 32px',
            background: 'rgba(17, 17, 24, 0.92)',
            border: '1px solid rgba(42, 42, 62, 0.8)',
            borderRadius: 14,
            backdropFilter: 'blur(20px)',
            animation: 'authCardIn 0.6s ease-out both',
            animationDelay: '0.2s',
            marginTop: 80,
          }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
              {['signin', 'signup'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAuthMode(mode)}
                  style={{
                    flex: 1, padding: '10px 0',
                    background: 'none', border: 'none',
                    color: authMode === mode ? '#4FC3F7' : '#6B7280',
                    fontSize: '13px', fontWeight: 600,
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                    borderBottom: authMode === mode ? '2px solid #4FC3F7' : '2px solid transparent',
                    transition: 'all 0.2s ease',
                    marginBottom: -1,
                  }}
                >
                  {mode === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label style={{
                  display: 'block', fontSize: '11px', fontWeight: 600,
                  letterSpacing: '0.08em', color: '#6B7280',
                  marginBottom: 8, textTransform: 'uppercase',
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  style={{
                    width: '100%', padding: '11px 14px',
                    background: 'rgba(10, 10, 15, 0.8)',
                    border: '1px solid rgba(42, 42, 62, 0.6)',
                    borderRadius: 8, color: '#E0E0E8',
                    fontSize: '14px', outline: 'none',
                    fontFamily: "'Inter', system-ui, sans-serif",
                    transition: 'border-color 0.2s ease',
                  }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block', fontSize: '11px', fontWeight: 600,
                  letterSpacing: '0.08em', color: '#6B7280',
                  marginBottom: 8, textTransform: 'uppercase',
                }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%', padding: '11px 14px',
                    background: 'rgba(10, 10, 15, 0.8)',
                    border: '1px solid rgba(42, 42, 62, 0.6)',
                    borderRadius: 8, color: '#E0E0E8',
                    fontSize: '14px', outline: 'none',
                    fontFamily: "'Inter', system-ui, sans-serif",
                    transition: 'border-color 0.2s ease',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={!email.trim() || !password.trim()}
                style={{
                  width: '100%', padding: '12px',
                  background: 'linear-gradient(135deg, #29B6F6, #4FC3F7)',
                  border: 'none', borderRadius: 8,
                  color: '#0A0A0F', fontSize: '14px',
                  fontWeight: 600, cursor: 'pointer',
                  opacity: (!email.trim() || !password.trim()) ? 0.5 : 1,
                  transition: 'opacity 0.2s ease, transform 0.15s ease',
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                {authMode === 'signin' ? 'Enter the Storm →' : 'Create Account →'}
              </button>
            </form>

            <button
              onClick={onComplete}
              style={{
                display: 'block', margin: '18px auto 0', padding: 0,
                background: 'none', border: 'none',
                color: '#6B7280', fontSize: '12px',
                cursor: 'pointer', transition: 'color 0.2s ease',
              }}
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
