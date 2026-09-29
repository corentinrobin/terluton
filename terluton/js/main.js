// Terluton — simulateur de vol relativiste dans le système solaire
import * as THREE from 'three';
import { AU, C, SUN, PLANETS, MINOR, MOONS } from './data.js';
import {
  planetOrbit, minorOrbit, moonOrbit, equatorialToVector, equatorialBasis, J2000_MS, seeded,
} from './orbits.js';
import { paintBody, paintClouds, paintRing, paintGlow, fbm } from './textures.js';
import { createStarfield } from './stars.js';
import { AmbientMusic } from './audio.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const C2 = C * C;
const W0_EARTH = 62.636856; // km²/s² : potentiel du géoïde terrestre (gravité + rotation)
const Y_AXIS = new V3(0, 1, 0);
const GM_SUN = SUN.gm;

// Consignes de vitesse (km/s)
const SPEEDS = [0, 0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000,
  0.1 * C, 0.2 * C, 0.3 * C, 0.5 * C, 0.7 * C, 0.8 * C, 0.9 * C, 0.95 * C, 0.99 * C, 0.999 * C, 0.9999 * C, 0.99999 * C];
const PRESETS = [[0, 'Arrêt'], [4, '1 km/s'], [7, '1 000 km/s'], [9, '0,1 c'], [12, '0,5 c'], [15, '0,9 c'], [17, '0,99 c'], [19, '0,9999 c']];
const WARPS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7];
const WARP_LABELS = ['×1', '×10', '×100', '×10³', '×10⁴', '×10⁵', '×10⁶', '×10⁷'];
const FLATTENING = { jupiter: 0.06487, saturn: 0.09796, uranus: 0.0229, neptune: 0.0171 };
const COLORS = {
  sun: '#ffd27a', mercury: '#c9bfb2', venus: '#f3dcA0', earth: '#6fb4ff', mars: '#ff8a5c', jupiter: '#f0cfa2',
  saturn: '#f3dc9c', uranus: '#9ee8f0', neptune: '#7f9bff', pluto: '#f0d2b4', halley: '#9fe3ff',
};
const NAV_ORDER = ['sun', 'mercury', 'venus', 'earth', 'mars', 'ceres', 'vesta', 'pallas', 'hygiea',
  'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'halley'];

// ---------------------------------------------------------------- Rendu
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.0005, 3e10);
scene.add(camera);
const stars = createStarfield(renderer.getPixelRatio());
stars.resize(camera.aspect, camera.fov);

const sunLight = new THREE.PointLight(0xffffff, 3.3, 0, 0);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x6070a0, 0.06));

// ---------------------------------------------------------------- État
const sim = { t: (Date.now() - J2000_MS) / 1000, warpIndex: 0, paused: false, started: false };
const clock = { earth: sim.t, drift: 0, devE: 0, devS: 0, phiS: 0, gamma: 1, beta: 0 };
const ship = {
  q: new THREE.Quaternion(), rel: new V3(), abs: new V3(), bary: new V3(), ref: null,
  speed: 0, throttle: 0, view: 'cockpit',
};
const ap = { mode: null, target: null }; // mode : 'align' | 'auto'
const ui = { target: null, labels: true, orbits: true };

const bodies = [];
const byId = {};

// ---------------------------------------------------------------- Corps célestes
function addBody(def, kind, parent, orbit) {
  const b = {
    id: def.id, name: def.name, def, kind, parent, orbit, children: [],
    radius: def.radius, gm: def.gm, pos: new V3(), rel: new V3(), vel: new V3(),
    color: COLORS[def.id] || (kind === 'moon' ? '#a9c9d6' : '#d8c6ae'),
    type: def.type || (kind === 'moon' ? `Satellite de ${parent.name}` : 'Petit corps'),
    sx: 0, sy: 0, onScreen: false, rpx: 0, dist: 0,
  };
  if (parent) parent.children.push(b);
  bodies.push(b);
  byId[b.id] = b;
  return b;
}

function createBodies() {
  const sun = addBody(SUN, 'sun', null, null);
  sun.pole = equatorialToVector(...SUN.pole);
  for (const p of PLANETS) {
    const b = addBody(p, 'planet', sun, planetOrbit(p, sim.t));
    b.pole = equatorialToVector(...p.pole);
  }
  for (const m of MINOR) {
    const b = addBody(m, 'minor', sun, minorOrbit(m));
    const rnd = seeded(m.id + 'pole');
    b.pole = equatorialToVector(rnd() * 360, rnd() * 120 - 60);
  }
  for (const p of PLANETS) {
    const parent = byId[p.id];
    const basis = equatorialBasis(parent.pole);
    for (const m of MOONS[p.id] || []) {
      const b = addBody(m, 'moon', parent, moonOrbit(m, basis));
      b.pole = parent.pole;
    }
  }
  // Rayon du référentiel local (sphère d'influence élargie)
  for (const b of bodies) {
    if (b.kind === 'sun') { b.frameR = Infinity; continue; }
    const a = b.orbit.a;
    const soi = a * Math.pow(b.gm / b.parent.gm, 0.4);
    b.frameR = b.kind === 'moon' ? Math.min(Math.max(soi, b.radius * 20), a * 0.45) : Math.max(soi, b.radius * 40);
  }
}

const tmpA = new V3();
function absPosition(b, t, out) {
  if (!b.orbit) return out.set(0, 0, 0);
  absPosition(b.parent, t, out);
  return out.add(b.orbit.position(t, tmpA));
}
const vp = new V3(), vm = new V3();
function velocity(b, t, out) {
  if (!b.orbit) return out.set(0, 0, 0);
  const h = 5;
  absPosition(b, t + h, vp);
  absPosition(b, t - h, vm);
  return out.subVectors(vp, vm).divideScalar(2 * h);
}

function updateBodies(t) {
  for (const b of bodies) {
    if (!b.orbit) { b.pos.set(0, 0, 0); continue; }
    b.orbit.position(t, b.pos).add(b.parent.pos);
  }
}

// ---------------------------------------------------------------- Maillages
const sphereHi = new THREE.SphereGeometry(1, 128, 64);
const sphereMid = new THREE.SphereGeometry(1, 64, 32);
// Lunes synchrones : la longitude 0 (centre des cartes) doit faire face à la planète (+Z après lookAt)
const moonHi = sphereHi.clone().rotateY(-Math.PI / 2);
const moonMid = sphereMid.clone().rotateY(-Math.PI / 2);
const glowTexture = new THREE.CanvasTexture(paintGlow(256, [
  [0, 'rgba(255,250,235,1)'], [0.12, 'rgba(255,225,160,0.85)'], [0.35, 'rgba(255,170,80,0.22)'], [1, 'rgba(255,120,40,0)'],
]));
const softGlow = new THREE.CanvasTexture(paintGlow(128));

function makeTexture(cnv) {
  const tex = cnv instanceof HTMLImageElement ? new THREE.Texture(cnv) : new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function irregularGeometry(id, amount) {
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const p = geo.attributes.position;
  const rnd = seeded(id + 'shape');
  const s = rnd() * 50;
  const stretch = [1 + amount * (0.6 + rnd() * 0.6), 1 - amount * 0.25, 1];
  const v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 1.3 + s, v.y * 1.3, v.z * 1.3, 4) * amount * 1.8 + fbm(v.x * 4, v.y * 4 + s, v.z * 4, 3) * amount * 0.35;
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x * stretch[0], v.y * stretch[1], v.z * stretch[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

const atmoVertex = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const atmoFragment = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor; uniform vec3 uSun; uniform float uStrength;
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    #include <logdepthbuf_fragment>
    float f = pow(1.0 - abs(dot(vN, vV)), 2.4);
    float l = smoothstep(-0.3, 0.5, dot(vW, uSun));
    gl_FragColor = vec4(uColor * f * l * uStrength, 1.0);
  }`;

function buildMesh(b, texCanvas) {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.quaternion.setFromUnitVectors(Y_AXIS, b.pole);
  group.add(tilt);
  const hi = b.kind === 'sun' || b.kind === 'planet' || b.radius > 1000;
  const isMoon = b.kind === 'moon';
  let geo;
  if (b.def.irregular) {
    geo = irregularGeometry(b.id, b.def.irregular);
    if (isMoon) geo.rotateY(-Math.PI / 2);
  } else geo = isMoon ? (hi ? moonHi : moonMid) : (hi ? sphereHi : sphereMid);
  const tex = makeTexture(texCanvas);
  const mat = b.kind === 'sun'
    ? new THREE.MeshBasicMaterial({ map: tex })
    : new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(b.radius);
  if (FLATTENING[b.id]) mesh.scale.y *= 1 - FLATTENING[b.id];
  tilt.add(mesh);
  Object.assign(b, { group, tilt, mesh });
  scene.add(group);

  if (b.kind === 'sun') {
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9,
    }));
    corona.scale.setScalar(b.radius * 10);
    const point = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false,
    }));
    point.scale.setScalar(0.07);
    group.add(corona, point);
  }

  const atm = b.def.atmosphere;
  if (atm) {
    const scale = b.id === 'titan' ? 1.1 : b.kind === 'planet' && b.radius > 20000 ? 1.018 : 1.03;
    const m = new THREE.Mesh(sphereMid, new THREE.ShaderMaterial({
      vertexShader: atmoVertex, fragmentShader: atmoFragment,
      uniforms: { uColor: { value: new THREE.Color(atm[0], atm[1], atm[2]) }, uSun: { value: new V3() }, uStrength: { value: atm[3] * 1.4 } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    m.scale.copy(mesh.scale).multiplyScalar(scale);
    tilt.add(m);
    b.atmo = m;
  }

  if (b.def.rings) {
    const { inner, outer, style } = b.def.rings;
    const rg = new THREE.RingGeometry(inner, outer, 256, 1);
    const pos = rg.attributes.position, uv = rg.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    const rtex = makeTexture(paintRing(style, inner, outer));
    const ring = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({
      map: rtex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, metalness: 0,
      emissive: 0xffffff, emissiveMap: rtex, emissiveIntensity: 0.3,
    }));
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }

  if (b.def.comet) {
    const tg = new THREE.ConeGeometry(1, 1, 32, 1, true);
    tg.translate(0, -0.5, 0);
    b.tail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({
      color: 0x9fe3ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    b.coma = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow, color: 0xbff0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    scene.add(b.tail);
    group.add(b.coma);
  }
}

function buildOrbitLine(b) {
  const n = b.kind === 'moon' ? 256 : 2048;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(b.orbit.points(n), 3));
  const base = b.kind === 'moon' ? 0.28 : b.kind === 'planet' ? 0.38 : 0.22;
  const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({
    color: new THREE.Color(b.color), transparent: true, opacity: base, depthWrite: false,
  }));
  line.frustumCulled = false;
  line.userData.base = base;
  scene.add(line);
  b.orbitLine = line;
}

let belt, trojans;
function buildBelts() {
  const rnd = seeded('belt');
  const gauss = () => rnd() + rnd() + rnd() - 1.5;
  const make = (n, fn, color, opacity) => {
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) fn(arr, i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({
      color, size: 1.3, sizeAttenuation: false, transparent: true, opacity, depthWrite: false,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    return pts;
  };
  belt = make(16000, (arr, k) => {
    let a;
    do { a = 2.1 + rnd() * 1.25; } while (Math.abs(a - 2.5) < 0.03 || Math.abs(a - 2.82) < 0.03 || Math.abs(a - 2.95) < 0.02);
    const r = a * AU * (1 + (rnd() - 0.5) * 0.2), th = rnd() * Math.PI * 2;
    arr[k] = r * Math.cos(th); arr[k + 1] = r * gauss() * 0.14; arr[k + 2] = -r * Math.sin(th);
  }, 0xa89a88, 0.3);
  trojans = make(5000, (arr, k) => {
    const side = rnd() < 0.5 ? 1 : -1;
    const th = side * Math.PI / 3 + gauss() * 0.35;
    const r = 5.2 * AU * (1 + gauss() * 0.05);
    arr[k] = r * Math.cos(th); arr[k + 1] = r * gauss() * 0.18; arr[k + 2] = -r * Math.sin(th);
  }, 0x9a8f7e, 0.25);
}

// Vaisseau (vue extérieure)
const shipModel = new THREE.Group();
const engineGlows = [];
function buildShip() {
  const hull = new THREE.MeshStandardMaterial({ color: 0xc9d3dc, metalness: 0.65, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232c36, metalness: 0.5, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b2a3a, metalness: 0.9, roughness: 0.1, emissive: 0x0a3a4a, emissiveIntensity: 0.6 });
  const neon = new THREE.MeshBasicMaterial({ color: 0x5cf2ff });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
    shipModel.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.0021, 0.0034, 0.022, 20), hull, 0, 0, 0.002, -Math.PI / 2);
  add(new THREE.ConeGeometry(0.0021, 0.011, 20), hull, 0, 0, -0.0145, -Math.PI / 2);
  add(new THREE.SphereGeometry(0.0015, 20, 12), glass, 0, 0.0016, -0.007, 0, 0, 0, 1, 0.7, 2.4);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.013, 0.0005, 0.0075), hull, s * 0.0085, -0.0006, 0.0065, 0, s * 0.42, s * -0.08);
    add(new THREE.BoxGeometry(0.0006, 0.0006, 0.007), neon, s * 0.0148, -0.0012, 0.0095, 0, s * 0.42, 0);
    add(new THREE.CylinderGeometry(0.0016, 0.0019, 0.009, 16), dark, s * 0.0038, 0, 0.0125, -Math.PI / 2);
    add(new THREE.CircleGeometry(0.0014, 20), neon, s * 0.0038, 0, 0.01705, 0, 0, 0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow, color: 0x7ff6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.position.set(s * 0.0038, 0, 0.0185);
    shipModel.add(glow);
    engineGlows.push(glow);
  }
  add(new THREE.BoxGeometry(0.0005, 0.006, 0.006), hull, 0, 0.0035, 0.009, -0.35, 0, 0);
  shipModel.visible = false;
  scene.add(shipModel);
}

// ---------------------------------------------------------------- Chargement
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

// Vraies cartes (dossier textures/). fill : zones non photographiées comblées par la texture procédurale.
// Sources : NASA 3D Resources (domaine public) et Solar System Scope (CC BY 4.0).
const REAL_MAPS = {
  sun: 'sun.jpg', mercury: 'mercury.jpg', venus: 'venus.jpg', earth: 'earth.jpg', moon: 'moon.jpg', mars: 'mars.jpg',
  jupiter: 'jupiter.jpg', saturn: 'saturn.jpg', uranus: 'uranus.jpg', neptune: 'neptune.jpg', pluto: 'pluto.jpg',
  phobos: 'phobos.jpg', deimos: 'deimos.jpg',
  io: { file: 'io.jpg', fill: true }, europa: 'europa.jpg', ganymede: 'ganymede.jpg', callisto: 'callisto.jpg',
  mimas: 'mimas.jpg', enceladus: 'enceladus.jpg', tethys: 'tethys.jpg', dione: 'dione.jpg', rhea: 'rhea.jpg',
  titan: 'titan.jpg', iapetus: 'iapetus.jpg',
  miranda: { file: 'miranda.jpg', fill: true }, ariel: { file: 'ariel.jpg', fill: true }, umbriel: { file: 'umbriel.jpg', fill: true },
  titania: { file: 'titania.jpg', fill: true }, oberon: { file: 'oberon.jpg', fill: true },
  triton: { file: 'triton.jpg', fill: true }, charon: 'charon.jpg',
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Texture introuvable : ${src}`));
    img.src = src;
  });
}

// Remplace les zones noires (sans données) par la texture procédurale, teintée à la couleur moyenne de la carte
function fillGaps(img, b) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const real = ctx.getImageData(0, 0, w, h);
  const d = real.data;
  ctx.drawImage(paintBody(b.def.look, 512, 256, b.id), 0, 0, w, h);
  const proc = ctx.getImageData(0, 0, w, h).data;

  const B = 12, gw = Math.ceil(w / B), gh = Math.ceil(h / B);
  const cov = new Float32Array(gw * gh), cnt = new Float32Array(gw * gh);
  const mean = [0, 0, 0], pmean = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4;
    const lum = (d[k] + d[k + 1] + d[k + 2]) / 765;
    const g = ((y / B) | 0) * gw + ((x / B) | 0);
    cov[g] += lum; cnt[g]++;
    if (lum > 0.06) { mean[0] += d[k]; mean[1] += d[k + 1]; mean[2] += d[k + 2]; n++; }
    pmean[0] += proc[k]; pmean[1] += proc[k + 1]; pmean[2] += proc[k + 2];
  }
  const tint = mean.map((m, i) => (m / Math.max(n, 1)) / Math.max(pmean[i] / (w * h), 1));
  for (let i = 0; i < cov.length; i++) cov[i] /= cnt[i];
  // Érosion (le bord des images, assombri près du limbe, est écarté) puis lissage
  const meanLum = (mean[0] + mean[1] + mean[2]) / (765 * Math.max(n, 1));
  const ero = new Float32Array(cov.length);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let m = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const yy = Math.min(gh - 1, Math.max(0, gy + dy)), xx = (gx + dx + gw) % gw;
      m = Math.min(m, cov[yy * gw + xx]);
    }
    ero[gy * gw + gx] = Math.min(1, Math.max(0, (m / meanLum - 0.3) / 0.45));
  }
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let sum = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = Math.min(gh - 1, Math.max(0, gy + dy)), xx = (gx + dx + gw) % gw;
      sum += ero[yy * gw + xx]; c++;
    }
    cov[gy * gw + gx] = sum / c;
  }
  const covAt = (fx, fy) => {
    fx = Math.min(Math.max(fx - 0.5, 0), gw - 1); fy = Math.min(Math.max(fy - 0.5, 0), gh - 1);
    const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(x0 + 1, gw - 1), y1 = Math.min(y0 + 1, gh - 1);
    const tx = fx - x0, ty = fy - y0;
    const a = cov[y0 * gw + x0] * (1 - tx) + cov[y0 * gw + x1] * tx;
    const c = cov[y1 * gw + x0] * (1 - tx) + cov[y1 * gw + x1] * tx;
    return a * (1 - ty) + c * ty;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = covAt(x / B, y / B);
    const m = c * c * (3 - 2 * c);
    const k = (y * w + x) * 4;
    for (let i = 0; i < 3; i++) d[k + i] = d[k + i] * m + Math.min(255, proc[k + i] * tint[i]) * (1 - m);
  }
  ctx.putImageData(real, 0, 0);
  return cnv;
}

async function loadRealMaps(onEach) {
  const maps = {};
  await Promise.all(Object.entries(REAL_MAPS).map(async ([id, spec]) => {
    const file = typeof spec === 'string' ? spec : spec.file;
    try { maps[id] = { img: await loadImage(`textures/${file}`), fill: !!spec.fill }; } catch (e) { console.warn(e.message); }
    onEach(id);
  }));
  try { maps.earthClouds = await loadImage('textures/earth_clouds.jpg'); } catch (e) { console.warn(e.message); }
  return maps;
}
function texSize(b) {
  if (b.kind === 'sun') return [512, 256];
  if (b.kind === 'planet' || b.id === 'moon') return [1024, 512];
  if (b.radius > 1000) return [512, 256];
  if (b.radius > 150) return [256, 128];
  return [128, 64];
}

async function load() {
  createBodies();
  const steps = bodies.length + Object.keys(REAL_MAPS).length + 3;
  let done = 0;
  const progress = (txt) => {
    done++;
    $('progress-fill').style.width = `${(done / steps) * 100}%`;
    $('progress-text').textContent = txt;
  };
  const maps = await loadRealMaps((id) => progress(`Réception des cartes : ${byId[id]?.name ?? id}`));
  for (const b of bodies) {
    const real = maps[b.id];
    let tex;
    if (real) tex = real.fill ? fillGaps(real.img, b) : real.img;
    else { const [w, h] = texSize(b); tex = paintBody(b.def.look, w, h, b.id); }
    buildMesh(b, tex);
    if (b.orbit) buildOrbitLine(b);
    progress(`Cartographie : ${b.name}`);
    await nextFrame();
  }
  const earth = byId.earth;
  const cloudMat = maps.earthClouds
    ? new THREE.MeshStandardMaterial({ alphaMap: makeTexture(maps.earthClouds), color: 0xffffff, transparent: true, depthWrite: false, roughness: 1 })
    : new THREE.MeshStandardMaterial({ map: makeTexture(paintClouds(1024, 512)), transparent: true, depthWrite: false, roughness: 1 });
  if (maps.earthClouds) cloudMat.alphaMap.colorSpace = THREE.NoColorSpace;
  const clouds = new THREE.Mesh(sphereHi, cloudMat);
  clouds.scale.setScalar(earth.radius * 1.006);
  earth.tilt.add(clouds);
  earth.clouds = clouds;
  progress('Formation des nuages terrestres');
  await nextFrame();
  buildBelts();
  progress('Ceinture d’astéroïdes et troyens');
  buildShip();
  buildLabels();
  buildNav();
  buildControls();
  progress('Systèmes de bord opérationnels');
  $('progress-text').textContent = 'Prêt au départ';
  $('start').disabled = false;
  resetShip();
  requestAnimationFrame(loop);
}

function resetShip() {
  sim.t = (Date.now() - J2000_MS) / 1000;
  clock.earth = sim.t;
  clock.drift = 0;
  updateBodies(sim.t);
  const earth = byId.earth;
  const toSun = new V3().subVectors(byId.sun.pos, earth.pos).normalize();
  const offset = toSun.clone().applyAxisAngle(Y_AXIS, 1.25).multiplyScalar(26000);
  offset.y += 5000;
  ship.ref = earth;
  ship.rel.copy(offset);
  ship.abs.copy(earth.pos).add(offset);
  ship.speed = 0;
  ship.throttle = 0;
  lookAtQuaternion(offset.clone().negate(), Y_AXIS, ship.q);
  setTarget(earth);
}

// ---------------------------------------------------------------- Pilotage
const mat4 = new THREE.Matrix4();
function lookAtQuaternion(dir, up, out) {
  mat4.lookAt(new V3(0, 0, 0), dir, up);
  return out.setFromRotationMatrix(mat4);
}

const keys = new Set();
const held = { KeyW: 0, KeyS: 0 };
const input = { dx: 0, dy: 0 };
const qTmp = new THREE.Quaternion();
const fwd = new V3();

function rotateShip(axis, angle) {
  qTmp.setFromAxisAngle(axis, angle);
  ship.q.multiply(qTmp).normalize();
}

function manualOverride() {
  if (ap.mode) { ap.mode = null; toast('Pilotage manuel'); }
}

function handleInput(dt) {
  const k = camera.fov / 60;
  let yaw = 0, pitch = 0, roll = 0;
  if (keys.has('ArrowLeft')) yaw += 1;
  if (keys.has('ArrowRight')) yaw -= 1;
  if (keys.has('ArrowUp')) pitch += 1;
  if (keys.has('ArrowDown')) pitch -= 1;
  if (keys.has('KeyQ')) roll += 1;
  if (keys.has('KeyE')) roll -= 1;
  if (yaw || pitch || roll || input.dx || input.dy) manualOverride();
  rotateShip(new V3(0, 1, 0), (yaw * 0.9 * dt - input.dx * 0.0025) * k);
  rotateShip(new V3(1, 0, 0), (pitch * 0.9 * dt - input.dy * 0.0025) * k);
  rotateShip(new V3(0, 0, 1), roll * 1.3 * dt);
  input.dx = input.dy = 0;
  for (const code of ['KeyW', 'KeyS']) {
    if (!keys.has(code)) continue;
    held[code] += dt;
    if (held[code] > 0.4) { held[code] -= 0.13; setThrottle(ship.throttle + (code === 'KeyW' ? 1 : -1)); }
  }
}

function setThrottle(i) {
  ship.throttle = Math.max(0, Math.min(SPEEDS.length - 1, i));
  $('throttle').value = ship.throttle;
  document.querySelectorAll('#presets button').forEach((b) => b.classList.toggle('on', +b.dataset.i === ship.throttle));
}

function arrivalDistance(b) {
  if (b.kind === 'sun') return b.radius * 4;
  const r = b.def.rings ? Math.max(b.radius * 3.2, b.def.rings.outer * 1.25) : b.radius * 4;
  return Math.max(r, b.radius + 2);
}

const toTarget = new V3();
function updateShip(dt, simDt) {
  fwd.set(0, 0, -1).applyQuaternion(ship.q);
  let desired = SPEEDS[ship.throttle];
  let limit = Infinity, maxStep = Infinity;

  if (ap.mode && ap.target) {
    toTarget.subVectors(ap.target.pos, ship.abs);
    const dist = toTarget.length();
    const arrive = arrivalDistance(ap.target);
    const up = new V3(0, 1, 0).applyQuaternion(ship.q);
    const goal = lookAtQuaternion(toTarget, up, new THREE.Quaternion());
    const angle = ship.q.angleTo(goal);
    ship.q.rotateTowards(goal, Math.max(dt * 1.6, angle * dt * 2.5));
    if (ap.mode === 'align') {
      if (angle < 0.002) { ap.mode = null; toast(`Cap sur ${ap.target.name}`); }
    } else {
      const remain = dist - arrive;
      if (angle > 0.08) limit = 0;
      else limit = Math.max(0, remain) / (0.9 * Math.max(WARPS[sim.warpIndex], 1));
      maxStep = Math.max(0, remain);
      if (remain < Math.max(ap.target.radius * 0.02, 0.5)) {
        ap.mode = null;
        ship.speed = 0;
        setThrottle(0);
        setRef(ap.target);
        toast(`Arrivée : ${ap.target.name}`);
      }
    }
  }

  const a = 1 - Math.exp(-dt * 2.4);
  ship.speed += (desired - ship.speed) * a;
  if (Math.abs(desired - ship.speed) < 1e-6) ship.speed = desired;
  if (ship.speed > limit) ship.speed = limit;
  const step = Math.min(ship.speed * simDt, maxStep);
  ship.rel.addScaledVector(fwd, step);
  ship.abs.addVectors(ship.ref.pos, ship.rel);

  // Proximité : on ne traverse pas les corps
  for (const b of bodies) {
    const d = tmpA.subVectors(ship.abs, b.pos);
    const min = b.radius * 1.002 + 0.03;
    const len = d.length();
    if (len < min) {
      ship.abs.copy(b.pos).addScaledVector(d.divideScalar(len || 1), min);
      if (ship.speed > 0 && fwd.dot(d) < 0) {
        ship.speed = 0; setThrottle(0); ap.mode = null;
        toast(`Alerte proximité : ${b.name}`);
      }
    }
  }

  // Changement de référentiel local
  let best = byId.sun;
  for (const b of bodies) {
    if (b.kind === 'planet' || b.kind === 'minor') {
      if (tmpA.subVectors(ship.abs, b.pos).length() < b.frameR) best = b;
    }
  }
  for (const m of best.children) {
    if (tmpA.subVectors(ship.abs, m.pos).length() < m.frameR) best = m;
  }
  if (best !== ship.ref) setRef(best);
  ship.rel.subVectors(ship.abs, ship.ref.pos);
}

function setRef(b) {
  if (ship.ref === b) return;
  ship.ref = b;
  ship.rel.subVectors(ship.abs, b.pos);
  $('ref-name').textContent = b.name;
  $('frame-hint').textContent = `/ ${b.name}`;
  toast(`Référentiel local : ${b.name}`);
}

// ---------------------------------------------------------------- Relativité
function relativisticAdd(v, u, out) {
  const vv = v.lengthSq();
  if (vv < 1e-12) return out.copy(u);
  const g = 1 / Math.sqrt(1 - vv / C2);
  const vu = v.dot(u);
  const upar = new V3().copy(v).multiplyScalar(vu / vv);
  const uperp = new V3().copy(u).sub(upar);
  return out.copy(upar).add(v).addScaledVector(uperp, 1 / g).multiplyScalar(1 / (1 + vu / C2));
}

function potential(p, exclude) {
  let phi = 0;
  for (const b of bodies) {
    if (b === exclude) continue;
    const r = Math.max(tmpA.subVectors(p, b.pos).length(), b.radius);
    phi -= b.gm / r;
  }
  return phi;
}

// dτ/dt − 1, calculé sans perte de précision pour β et Φ minuscules
function rateDeviation(beta2, phiC2) {
  const s = -beta2 / (1 + Math.sqrt(1 - beta2));
  return s * (1 + phiC2) + phiC2;
}

const earthVel = new V3(), refVel = new V3(), relVel = new V3();
function updateRelativity(simDt) {
  const earth = byId.earth;
  velocity(earth, sim.t, earthVel);
  velocity(ship.ref, sim.t, refVel);
  fwd.set(0, 0, -1).applyQuaternion(ship.q);
  relVel.copy(fwd).multiplyScalar(ship.speed);
  relativisticAdd(refVel, relVel, ship.bary);
  const beta2 = Math.min(ship.bary.lengthSq() / C2, 1 - 1e-15);
  clock.beta = Math.sqrt(beta2);
  clock.gamma = 1 / Math.sqrt(1 - beta2);
  clock.phiS = potential(ship.abs, null) / C2;
  clock.devS = rateDeviation(beta2, clock.phiS);
  const phiE = (-W0_EARTH + potential(earth.pos, earth)) / C2;
  clock.devE = rateDeviation(earthVel.lengthSq() / C2, phiE);
  clock.earth += simDt * (1 + clock.devE);
  clock.drift += simDt * (clock.devS - clock.devE);
}

// ---------------------------------------------------------------- Placement & rendu
const sunDir = new V3();
const camOffset = new V3();
function placeScene() {
  const sun = byId.sun;
  for (const b of bodies) {
    b.rel.subVectors(b.pos, ship.abs);
    b.group.position.copy(b.rel);
    b.dist = b.rel.length();
  }
  for (const b of bodies) {
    const rot = b.def.rotation;
    if (b.kind === 'moon') b.mesh.lookAt(b.parent.group.position);
    else if (rot) b.mesh.rotation.y = ((sim.t / (rot * 3600)) % 1) * Math.PI * 2;
    if (b.atmo) b.atmo.material.uniforms.uSun.value.subVectors(sun.rel, b.rel).normalize();
    if (b.orbitLine) {
      b.orbitLine.position.copy(b.parent.rel);
      if (b.kind === 'moon') {
        const d = b.parent.dist, a = b.orbit.a;
        const f = 1 - THREE.MathUtils.smoothstep(d, a * 40, a * 600);
        b.orbitLine.visible = f > 0.01 && ui.orbits;
        b.orbitLine.material.opacity = b.orbitLine.userData.base * f;
      } else {
        b.orbitLine.visible = ui.orbits;
        b.orbitLine.material.opacity = b.orbitLine.userData.base;
      }
      if (b === ui.target && b.orbitLine.visible) b.orbitLine.material.opacity = 0.75;
    }
  }
  if (byId.earth.clouds) byId.earth.clouds.rotation.y = ((sim.t / (26 * 3600)) % 1) * Math.PI * 2;

  // Comète : queue opposée au Soleil
  const halley = byId.halley;
  if (halley && halley.tail) {
    const rAU = halley.pos.length() / AU;
    const len = rAU < 4 ? 4e7 * Math.min(1, (1.2 / rAU) ** 2) : 0;
    halley.tail.visible = len > 1e4;
    halley.coma.scale.setScalar(Math.max(halley.radius * 30, len * 0.02));
    halley.coma.visible = rAU < 6;
    if (halley.tail.visible) {
      halley.tail.position.copy(halley.rel);
      halley.tail.quaternion.setFromUnitVectors(new V3(0, -1, 0), sunDir.copy(halley.pos).normalize());
      halley.tail.scale.set(len * 0.06, len, len * 0.06);
    }
  }

  sunLight.position.copy(sun.rel);
  belt.position.copy(sun.rel);
  trojans.position.copy(sun.rel);
  belt.rotation.y = Math.sqrt(GM_SUN / (2.7 * AU) ** 3) * sim.t;
  const jup = byId.jupiter.pos;
  trojans.rotation.y = Math.atan2(-jup.z, jup.x);

  camera.quaternion.copy(ship.q);
  if (ship.view === 'ext') camera.position.copy(camOffset.set(0, 0.012, 0.072).applyQuaternion(ship.q));
  else camera.position.set(0, 0, 0);
  shipModel.visible = ship.view === 'ext';
  shipModel.quaternion.copy(ship.q);
  const thrust = ship.speed > 0 ? 0.35 + 0.65 * Math.min(1, ship.speed / (0.9 * C)) : 0.08;
  for (const g of engineGlows) g.scale.setScalar(0.0012 + thrust * 0.008);

  const beta = clock.beta;
  const vdir = beta > 0 ? ship.bary.clone().normalize() : new V3(0, 0, -1);
  stars.update(camera.quaternion, vdir, beta);
}

function render() {
  renderer.clear();
  renderer.render(stars.scene, stars.camera);
  renderer.clearDepth();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- Étiquettes
const labelsEl = $('labels');
function buildLabels() {
  for (const b of bodies) {
    const el = document.createElement('div');
    el.className = `label ${b.kind}`;
    el.style.color = b.color;
    el.innerHTML = `<span class="mk"></span><span class="tx"><span class="nm"></span><span class="ds"></span></span>`;
    el.querySelector('.nm').textContent = b.name;
    el.addEventListener('click', () => setTarget(b));
    el.addEventListener('dblclick', () => { setTarget(b); engageAutopilot(); });
    el.style.display = 'none';
    labelsEl.appendChild(el);
    b.label = el;
    b.labelDist = el.querySelector('.ds');
    b.labelMk = el.querySelector('.mk');
    b.labelShown = false;
  }
}

const vc = new V3();
let labelFrame = 0;
function updateLabels() {
  const W = window.innerWidth, H = window.innerHeight;
  const focal = (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const refreshText = labelFrame++ % 6 === 0;
  const occluders = [];
  for (const b of bodies) {
    vc.copy(b.group.position).applyMatrix4(camera.matrixWorldInverse);
    const z = -vc.z;
    b.onScreen = z > 0;
    if (z <= 0) continue;
    b.sx = W / 2 + (vc.x / z) * focal;
    b.sy = H / 2 - (vc.y / z) * focal;
    b.camDist = z;
    b.rpx = (b.radius / Math.max(b.dist, b.radius * 1.0001)) * focal;
    if (b.rpx > 3) occluders.push(b);
  }
  for (const b of bodies) {
    let show = b.onScreen && b.sx > -80 && b.sx < W + 80 && b.sy > -40 && b.sy < H + 40;
    const isTarget = b === ui.target;
    if (show && !ui.labels && !isTarget) show = false;
    if (show && b.kind === 'moon' && !isTarget) {
      const p = b.parent;
      if (p.onScreen && Math.hypot(b.sx - p.sx, b.sy - p.sy) < 34 + p.rpx) show = false;
    }
    if (show) {
      for (const o of occluders) {
        if (o === b || o.dist >= b.dist) continue;
        if (Math.hypot(b.sx - o.sx, b.sy - o.sy) < o.rpx * 0.97) { show = false; break; }
      }
    }
    if (show !== b.labelShown) { b.label.style.display = show ? '' : 'none'; b.labelShown = show; }
    if (!show) continue;
    const big = b.rpx > 7;
    const off = big ? b.rpx * 0.72 : 0;
    b.labelMk.style.visibility = big ? 'hidden' : '';
    b.label.style.transform = `translate(${(b.sx + off).toFixed(1)}px, ${(b.sy - off).toFixed(1)}px) translateY(-50%)`;
    if (refreshText) b.labelDist.textContent = fmtDist(Math.max(0, b.dist - b.radius));
  }
  updateEdgeArrow(W, H);
}

const arrow = $('edge-arrow');
function updateEdgeArrow(W, H) {
  const t = ui.target;
  if (!t || !sim.started) { arrow.style.display = 'none'; return; }
  const inView = t.onScreen && t.sx > 40 && t.sx < W - 40 && t.sy > 40 && t.sy < H - 40;
  if (inView) { arrow.style.display = 'none'; return; }
  vc.copy(t.group.position).applyMatrix4(camera.matrixWorldInverse);
  let dx = vc.x, dy = vc.y;
  if (Math.hypot(dx, dy) < 1e-9) dy = -1;
  const m = 70;
  const s = Math.min((W / 2 - m) / Math.abs(dx || 1e-9), (H / 2 - m) / Math.abs(dy || 1e-9));
  const x = W / 2 + dx * s, y = H / 2 - dy * s;
  arrow.style.display = 'block';
  arrow.style.transform = `translate(${x}px, ${y}px)`;
  arrow.firstChild.style.transform = `translateY(-50%) rotate(${Math.atan2(-dy, dx)}rad)`;
  arrow.lastChild.textContent = t.name;
}

// ---------------------------------------------------------------- Cible & navigation
function setTarget(b) {
  if (ui.target) ui.target.label?.classList.remove('target');
  ui.target = b;
  b.label?.classList.add('target');
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('selected', el.dataset.id === b.id));
  $('t-name').textContent = b.name;
  $('t-type').textContent = b.type;
  $('t-radius').textContent = `${fmtNum(b.radius, b.radius < 100 ? 1 : 0)} km`;
  $('t-info').textContent = b.def.info || '';
  if (ap.mode && ap.target !== b) { ap.mode = null; }
  updateHud(true);
}

const moonsOf = (b) => b.children.filter((c) => c.kind === 'moon');

function flatOrder() {
  const list = [];
  for (const id of NAV_ORDER) { const b = byId[id]; list.push(b, ...moonsOf(b)); }
  return list;
}

function cycleTarget(dir) {
  const list = flatOrder();
  const i = list.indexOf(ui.target);
  setTarget(list[(i + dir + list.length) % list.length]);
}

function engageAutopilot() {
  const t = ui.target;
  if (!t) return;
  if (ap.mode === 'auto') { ap.mode = null; toast('Pilote automatique désengagé'); updateHud(true); return; }
  if (t === ship.ref && ship.rel.length() - arrivalDistance(t) < t.radius * 0.1) { toast(`Déjà en orbite de ${t.name}`); return; }
  if (ship.throttle < 9) setThrottle(15);
  ap.mode = 'auto'; ap.target = t;
  toast(`Pilote automatique → ${t.name}`);
  updateHud(true);
}

function alignToTarget() {
  if (!ui.target) return;
  ap.mode = 'align'; ap.target = ui.target;
}

function buildNav() {
  const list = $('nav-list');
  for (const id of NAV_ORDER) {
    const b = byId[id];
    const moons = moonsOf(b);
    const group = document.createElement('div');
    group.className = 'nav-group folded';
    group.appendChild(navItem(b, moons.length));
    if (moons.length) {
      const sub = document.createElement('div');
      sub.className = 'nav-moons';
      for (const m of moons) sub.appendChild(navItem(m, 0));
      group.appendChild(sub);
    }
    list.appendChild(group);
  }
  $('nav-toggle').addEventListener('click', () => {
    const nav = $('nav');
    nav.classList.toggle('collapsed');
    $('nav-toggle').textContent = nav.classList.contains('collapsed') ? '+' : '–';
  });
}

function navItem(b, n) {
  const el = document.createElement('div');
  el.className = 'nav-item';
  el.dataset.id = b.id;
  el.innerHTML = `<span class="dot"></span><span class="nm"></span>${n ? `<span class="exp">${n} ▸</span>` : ''}`;
  el.querySelector('.dot').style.background = b.color;
  el.querySelector('.nm').textContent = b.name;
  el.addEventListener('click', (e) => {
    if (e.target.classList.contains('exp')) {
      const g = el.parentElement;
      g.classList.toggle('folded');
      e.target.textContent = `${n} ${g.classList.contains('folded') ? '▸' : '▾'}`;
      return;
    }
    setTarget(b);
  });
  el.addEventListener('dblclick', () => { setTarget(b); engageAutopilot(); });
  return el;
}

// ---------------------------------------------------------------- Interface
function buildControls() {
  const presets = $('presets');
  for (const [i, label] of PRESETS) {
    const btn = document.createElement('button');
    btn.textContent = label; btn.dataset.i = i;
    btn.addEventListener('click', () => { setThrottle(i); btn.blur(); });
    presets.appendChild(btn);
  }
  const warp = $('warp');
  const pause = document.createElement('button');
  pause.textContent = '❚❚'; pause.title = 'Pause (P)'; pause.id = 'btn-pause';
  pause.addEventListener('click', () => togglePause());
  warp.appendChild(pause);
  WARPS.forEach((w, i) => {
    const btn = document.createElement('button');
    btn.textContent = WARP_LABELS[i]; btn.dataset.i = i; btn.title = `Touche ${i + 1}`;
    btn.addEventListener('click', () => setWarp(i));
    warp.appendChild(btn);
  });
  setWarp(0);
  setThrottle(0);

  $('throttle').addEventListener('input', (e) => { setThrottle(+e.target.value); });
  $('throttle').addEventListener('change', (e) => e.target.blur());
  $('btn-align').addEventListener('click', alignToTarget);
  $('btn-auto').addEventListener('click', engageAutopilot);
  $('btn-view').addEventListener('click', toggleView);
  $('btn-orbits').addEventListener('click', toggleOrbits);
  $('btn-labels').addEventListener('click', toggleLabels);
  $('btn-music').addEventListener('click', toggleMusic);
  $('btn-help').addEventListener('click', toggleHelp);
  $('help-close').addEventListener('click', toggleHelp);
  $('volume').addEventListener('input', (e) => music.setVolume(+e.target.value));
  $('volume').addEventListener('change', (e) => e.target.blur());
  document.querySelectorAll('button').forEach((b) => b.addEventListener('mouseup', () => b.blur()));
}

function setWarp(i) {
  sim.warpIndex = i;
  sim.paused = false;
  document.querySelectorAll('#warp button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i && b.id !== 'btn-pause'));
  $('btn-pause').classList.remove('on');
  if (i > 0) toast(`Temps accéléré ${WARP_LABELS[i]}`);
}
function togglePause() {
  sim.paused = !sim.paused;
  $('btn-pause').classList.toggle('on', sim.paused);
  toast(sim.paused ? 'Pause' : 'Reprise');
}
function toggleView() {
  ship.view = ship.view === 'cockpit' ? 'ext' : 'cockpit';
  $('btn-view').classList.toggle('on', ship.view === 'ext');
  $('reticle').style.opacity = ship.view === 'ext' ? 0.25 : '';
  toast(ship.view === 'ext' ? 'Vue extérieure' : 'Vue cockpit');
}
function toggleOrbits() { ui.orbits = !ui.orbits; $('btn-orbits').classList.toggle('on', ui.orbits); }
function toggleLabels() { ui.labels = !ui.labels; $('btn-labels').classList.toggle('on', ui.labels); labelsEl.classList.toggle('off', !ui.labels); }
function toggleMusic() { music.setEnabled(!music.enabled); $('btn-music').classList.toggle('on', music.enabled); }
function toggleHelp() { $('help').classList.toggle('hidden'); }

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------- Formatage
const nf = (d) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const nfCache = {};
function fmtNum(v, d = 0) { return (nfCache[d] ||= nf(d)).format(v).replace(/ | /g, ' '); }

function fmtDist(km) {
  if (km < 1) return `${fmtNum(km * 1000)} m`;
  if (km < 1e6) return `${fmtNum(km)} km`;
  if (km < 0.1 * AU) return `${fmtNum(km / 1e6, 2)} M km`;
  return `${fmtNum(km / AU, km < 10 * AU ? 3 : 2)} UA`;
}

function fmtDuration(s) {
  if (!isFinite(s)) return '—';
  if (s < 1) return `${fmtNum(s * 1000, 0)} ms`;
  if (s < 60) return `${fmtNum(s, 1)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
  if (s < 365.25 * 86400) return `${Math.floor(s / 86400)} j ${Math.floor((s % 86400) / 3600)} h`;
  return `${fmtNum(s / (365.25 * 86400), s < 3.15e8 ? 2 : 1)} ans`;
}

function fmtDrift(d) {
  const sign = d < 0 ? '−' : '+';
  const a = Math.abs(d);
  if (a < 1e-6) return `${sign}${fmtNum(a * 1e9, 2)} ns`;
  if (a < 1e-3) return `${sign}${fmtNum(a * 1e6, 3)} µs`;
  if (a < 1) return `${sign}${fmtNum(a * 1e3, 3)} ms`;
  if (a < 60) return `${sign}${fmtNum(a, 4)} s`;
  return `${sign}${fmtDuration(a)}`;
}

function fmtSci(v) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  const sup = String(e).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
  return `${fmtNum(m, 2).replace('-', '−')}×10${sup}`;
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function setClock(prefix, sec) {
  const d = new Date(J2000_MS + sec * 1000);
  if (isNaN(d)) return;
  $(`${prefix}-date`).textContent = dateFmt.format(d);
  $(`${prefix}-time`).textContent = timeFmt.format(d);
}

function fmtBeta(b) {
  if (b === 0) return '0';
  if (b < 1e-3) return fmtSci(b);
  if (b < 0.9) return fmtNum(b, 4);
  const nines = Math.min(12, Math.max(4, Math.ceil(-Math.log10(1 - b)) + 2));
  return fmtNum(b, nines);
}

function fmtSpeed(kms) {
  if (kms < 1) return [fmtNum(kms * 1000, kms < 0.01 ? 1 : 0), 'm/s'];
  if (kms < 100) return [fmtNum(kms, 2), 'km/s'];
  return [fmtNum(kms, 0), 'km/s'];
}

// ---------------------------------------------------------------- Tableau de bord
let lastHud = 0;
function updateHud(force = false) {
  const now = performance.now();
  if (!force && now - lastHud < 100) return;
  lastHud = now;
  if (!ship.ref) return;

  setClock('earth', clock.earth);
  setClock('ship', clock.earth + clock.drift);
  $('drift').textContent = fmtDrift(clock.drift);
  const ratio = (1 + clock.devS) / (1 + clock.devE);
  $('rate').textContent = Math.abs(ratio - 1) < 1e-4
    ? `1 s ${ratio >= 1 ? '+' : '−'} ${fmtNum(Math.abs(ratio - 1) * 1e9, 3)} ns`
    : `${fmtNum(ratio, ratio < 0.01 ? 6 : 4)} s`;
  $('gamma').textContent = clock.gamma < 1.0001 ? `1 + ${fmtSci(clock.gamma - 1)}` : fmtNum(clock.gamma, clock.gamma < 10 ? 4 : 2);
  $('grav').textContent = fmtSci(clock.phiS);

  const [sv, su] = fmtSpeed(ship.speed);
  $('spd-val').textContent = sv;
  $('spd-unit').textContent = su;
  const betaRel = ship.speed / C;
  $('spd-beta').textContent = `${fmtBeta(betaRel)} c`;
  $('beta-fill').style.width = `${Math.min(100, betaRel * 100)}%`;
  const tgt = SPEEDS[ship.throttle];
  $('spd-target').textContent = tgt >= 0.1 * C ? `${fmtNum(tgt / C, tgt > 0.99 * C ? 5 : 2)} c` : fmtSpeed(tgt).join(' ');

  const t = ui.target;
  if (t) {
    const d = Math.max(0, tmpA.subVectors(t.pos, ship.abs).length() - t.radius);
    $('t-dist').textContent = fmtDist(d);
    $('t-light').textContent = fmtDuration(d / C);
    fwd.set(0, 0, -1).applyQuaternion(ship.q);
    const heading = tmpA.normalize().dot(fwd);
    const remain = Math.max(0, d + t.radius - arrivalDistance(t));
    let eta = Infinity;
    if (ap.mode === 'auto' && ap.target === t) eta = remain / Math.max(SPEEDS[ship.throttle], 1e-9);
    else if (ship.speed > 0 && heading > 0.985) eta = remain / ship.speed;
    const g = 1 / Math.sqrt(1 - Math.min(ship.speed / C, 0.999999999) ** 2);
    $('t-eta').textContent = fmtDuration(eta);
    $('t-eta-ship').textContent = fmtDuration(eta / (ap.mode === 'auto' ? 1 / Math.sqrt(1 - (SPEEDS[ship.throttle] / C) ** 2) : g));
    const btn = $('btn-auto');
    btn.classList.toggle('engaged', ap.mode === 'auto' && ap.target === t);
    const warp = WARPS[sim.warpIndex];
    $('ap-status').textContent = ap.mode === 'auto'
      ? `▶ PILOTE AUTO → ${ap.target.name.toUpperCase()} · ${fmtDuration(eta / warp)} réelles`
      : ap.mode === 'align' ? `◎ ALIGNEMENT → ${ap.target.name.toUpperCase()}` : '';
  }
  music.setIntensity(clock.beta);
}

// ---------------------------------------------------------------- Boucle
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const simDt = sim.started && !sim.paused ? dt * WARPS[sim.warpIndex] : 0;
  if (sim.started) handleInput(dt);
  else ship.q.multiply(qTmp.setFromAxisAngle(Y_AXIS, dt * 0.01));
  sim.t += simDt;
  updateBodies(sim.t);
  if (sim.started) updateShip(dt, simDt);
  else ship.abs.addVectors(ship.ref.pos, ship.rel);
  updateRelativity(simDt);
  placeScene();
  render();
  updateLabels();
  updateHud();
}

// ---------------------------------------------------------------- Événements
const music = new AmbientMusic();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  stars.resize(camera.aspect, camera.fov);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let dragging = false;
canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging'); });
canvas.addEventListener('pointerup', (e) => { dragging = false; canvas.releasePointerCapture(e.pointerId); canvas.classList.remove('dragging'); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging || !sim.started) return;
  input.dx += e.movementX;
  input.dy += e.movementY;
});
let wheelAcc = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!sim.started) return;
  wheelAcc += e.deltaY;
  while (Math.abs(wheelAcc) >= 60) {
    setThrottle(ship.throttle + (wheelAcc < 0 ? 1 : -1));
    wheelAcc -= Math.sign(wheelAcc) * 60;
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (!sim.started) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.tagName === 'INPUT') e.target.blur();
  const code = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(code);
  if (code === 'KeyW' || code === 'KeyS') { held[code] = 0; setThrottle(ship.throttle + (code === 'KeyW' ? 1 : -1)); return; }
  if (code === 'Space') { setThrottle(0); manualOverride(); return; }
  if (code === 'Tab') { cycleTarget(e.shiftKey ? -1 : 1); return; }
  if (code === 'Enter' || code === 'NumpadEnter') { engageAutopilot(); return; }
  const digit = /^(Digit|Numpad)([1-8])$/.exec(code);
  if (digit) { setWarp(+digit[2] - 1); return; }
  switch (e.key.toLowerCase()) {
    case 'f': alignToTarget(); break;
    case 'g': engageAutopilot(); break;
    case 'p': togglePause(); break;
    case 'v': toggleView(); break;
    case 'o': toggleOrbits(); break;
    case 'l': toggleLabels(); break;
    case 'm': toggleMusic(); break;
    case 'h': case '?': toggleHelp(); break;
    case 'escape': $('help').classList.add('hidden'); break;
    default: break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// Libellés des touches selon la disposition du clavier (AZERTY par défaut)
if (navigator.keyboard?.getLayoutMap) {
  navigator.keyboard.getLayoutMap().then((map) => {
    document.querySelectorAll('kbd[data-code]').forEach((k) => {
      const v = map.get(k.dataset.code);
      if (v) k.textContent = v.toUpperCase();
    });
  }).catch(() => {});
}

$('start').addEventListener('click', () => {
  music.start();
  resetShip();
  sim.started = true;
  $('intro').classList.add('fade');
  $('hud').classList.remove('hidden');
  setTimeout(() => $('intro').remove(), 1400);
  setTimeout(() => toast('Stationnaire à 26 000 km de la Terre — H pour l’aide'), 900);
  updateHud(true);
});

load().catch((err) => {
  console.error(err);
  $('progress-text').textContent = `Erreur : ${err.message}`;
});
