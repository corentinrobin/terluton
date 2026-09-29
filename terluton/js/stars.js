// Ciel étoilé avec aberration relativiste et effet Doppler
import * as THREE from 'three';
import { equatorialToVector, seeded } from './orbits.js';

const vertexShader = /* glsl */`
  attribute float aMag;
  attribute float aTemp;
  uniform vec3 uVel;
  uniform float uBeta;
  uniform float uGamma;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;

  vec3 blackbody(float T) {
    T = clamp(T, 1000.0, 40000.0) / 100.0;
    float r = T <= 66.0 ? 1.0 : clamp(1.292936 * pow(T - 60.0, -0.1332047), 0.0, 1.0);
    float g = T <= 66.0 ? clamp(0.3900816 * log(T) - 0.6318414, 0.0, 1.0)
                        : clamp(1.129891 * pow(T - 60.0, -0.0755148), 0.0, 1.0);
    float b = T >= 66.0 ? 1.0 : (T <= 19.0 ? 0.0 : clamp(0.5432068 * log(T - 10.0) - 1.196254, 0.0, 1.0));
    return vec3(r, g, b);
  }

  void main() {
    vec3 d = normalize(position);
    vec3 dp = d;
    float D = 1.0;
    if (uBeta > 1e-7) {
      float ct = dot(d, uVel);
      float ctp = (ct + uBeta) / (1.0 + uBeta * ct);          // aberration
      vec3 perp = d - ct * uVel;
      float pl = length(perp);
      perp = pl > 1e-7 ? perp / pl : vec3(0.0);
      dp = ctp * uVel + sqrt(max(0.0, 1.0 - ctp * ctp)) * perp;
      D = uGamma * (1.0 + uBeta * ct);                        // facteur Doppler
    }
    float T = aTemp * D;
    vColor = blackbody(T);
    float visible = smoothstep(700.0, 2800.0, T) * (1.0 / (1.0 + max(0.0, T - 60000.0) / 60000.0));
    float flux = pow(10.0, -0.4 * aMag) * clamp(pow(D, 2.0), 0.0, 60.0) * visible;
    vAlpha = clamp(pow(flux, 0.36) * 1.7, 0.0, 1.0);
    gl_PointSize = clamp(1.7 + pow(flux, 0.3) * 3.6, 1.0, 10.0) * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(dp * 100.0, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, r);
    a = a * a;
    gl_FragColor = vec4(vColor * vAlpha * a, 1.0);
  }
`;

function sampleTemperature(rnd) {
  const u = rnd();
  if (u < 0.08) return 3000 + rnd() * 900;   // M
  if (u < 0.35) return 3900 + rnd() * 1300;  // K
  if (u < 0.65) return 5200 + rnd() * 800;   // G
  if (u < 0.85) return 6000 + rnd() * 1500;  // F
  if (u < 0.96) return 7500 + rnd() * 2500;  // A
  return 10000 + rnd() * 20000;              // B/O
}

export function createStarfield(pixelRatio) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const rnd = seeded('stars');

  // Base galactique (J2000)
  const NGP = equatorialToVector(192.85948, 27.12825);
  const GC = equatorialToVector(266.405, -28.936);
  const GY = new THREE.Vector3().crossVectors(NGP, GC).normalize();

  const pos = [], mag = [], temp = [];
  const v = new THREE.Vector3();
  const push = (dir, m, t) => { pos.push(dir.x * 100, dir.y * 100, dir.z * 100); mag.push(m); temp.push(t); };

  // Étoiles réparties sur tout le ciel
  for (let i = 0; i < 9000; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    v.set(r * Math.cos(a), z, r * Math.sin(a));
    const k = 0.45, mmin = -1.2, mmax = 7.2;
    const m = mmin + Math.log10(1 + rnd() * (10 ** (k * (mmax - mmin)) - 1)) / k;
    push(v, m, sampleTemperature(rnd));
  }
  // Voie lactée : étoiles faibles concentrées dans le plan galactique
  for (let i = 0; i < 110000; i++) {
    const l = rnd() * Math.PI * 2;
    const center = Math.pow(Math.cos(l / 2) ** 2, 3); // plus dense vers le centre galactique
    if (rnd() > 0.35 + center * 0.65) continue;
    const g = (rnd() + rnd() + rnd() - 1.5) * (0.12 + center * 0.14);
    const b = g + (Math.abs(Math.sin(l * 3.1)) < 0.2 && Math.abs(g) < 0.03 && center > 0.2 ? 0.04 : 0);
    const cb = Math.cos(b);
    v.set(0, 0, 0)
      .addScaledVector(GC, cb * Math.cos(l)).addScaledVector(GY, cb * Math.sin(l)).addScaledVector(NGP, Math.sin(b)).normalize();
    push(v, 7.5 + rnd() * 3.5 - center * 1.2, 3500 + rnd() * 5000);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aMag', new THREE.Float32BufferAttribute(mag, 1));
  geo.setAttribute('aTemp', new THREE.Float32BufferAttribute(temp, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uVel: { value: new THREE.Vector3(0, 0, 1) }, uBeta: { value: 0 }, uGamma: { value: 1 },
      uPixelRatio: { value: pixelRatio },
    },
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    scene, camera,
    // velocity : vecteur vitesse barycentrique (km/s), beta = |v|/c
    update(quaternion, velDir, beta) {
      camera.quaternion.copy(quaternion);
      const u = material.uniforms;
      u.uVel.value.copy(velDir);
      u.uBeta.value = beta;
      u.uGamma.value = 1 / Math.sqrt(1 - beta * beta);
    },
    resize(aspect, fov) { camera.aspect = aspect; camera.fov = fov; camera.updateProjectionMatrix(); },
  };
}

