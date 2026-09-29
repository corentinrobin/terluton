// Mécanique orbitale képlérienne.
// Repère de rendu : écliptique J2000 converti en coordonnées three.js (x, z, -y), Y = nord écliptique.
import * as THREE from 'three';
import { AU } from './data.js';

export const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const OBLIQUITY = 23.43928 * D2R;
const GM_SUN = 1.32712440018e11;
export const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

// RA/Dec équatoriales (degrés) → vecteur unitaire three.js
export function equatorialToVector(ra, dec, out = new THREE.Vector3()) {
  const a = ra * D2R, d = dec * D2R;
  const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  const ye = y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY);
  const ze = -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
  return out.set(x, ze, -ye).normalize();
}

export function solveKepler(M, e) {
  M = ((M % TAU) + TAU) % TAU;
  if (M > Math.PI) M -= TAU;
  let E = e < 0.8 ? M : (M >= 0 ? Math.PI : -Math.PI);
  for (let i = 0; i < 50; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

// Coordonnées périfocales (xp, yp) → plan de référence (x, y, z) selon ω, Ω, i (radians)
function rotate(xp, yp, w, O, I, out) {
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  out[0] = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  out[1] = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  out[2] = (sw * sI) * xp + (cw * sI) * yp;
  return out;
}

const tmp = [0, 0, 0];

// Une orbite générique : éléments {a (km), e, i, O, w (rad)} et fonction anomalie moyenne(t)
export class Orbit {
  constructor({ a, e, i, O, w, meanAnomaly, basis = null }) {
    Object.assign(this, { a, e, i, O, w, meanAnomaly, basis });
  }

  // Position relative au foyer, dans le repère three.js
  position(t, out = new THREE.Vector3()) {
    const E = solveKepler(this.meanAnomaly(t), this.e);
    return this.fromEccentric(E, out);
  }

  fromEccentric(E, out) {
    const xp = this.a * (Math.cos(E) - this.e);
    const yp = this.a * Math.sqrt(1 - this.e * this.e) * Math.sin(E);
    rotate(xp, yp, this.w, this.O, this.i, tmp);
    if (this.basis) {
      const [X, Y, Z] = this.basis;
      return out.set(
        X.x * tmp[0] + Y.x * tmp[1] + Z.x * tmp[2],
        X.y * tmp[0] + Y.y * tmp[1] + Z.y * tmp[2],
        X.z * tmp[0] + Y.z * tmp[1] + Z.z * tmp[2],
      );
    }
    return out.set(tmp[0], tmp[2], -tmp[1]);
  }

  // Points de l'ellipse (échantillonnage uniforme en anomalie excentrique)
  points(n) {
    const arr = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      this.fromEccentric((k / n) * TAU, v);
      arr[k * 3] = v.x; arr[k * 3 + 1] = v.y; arr[k * 3 + 2] = v.z;
    }
    return arr;
  }
}

// Planètes : éléments JPL avec dérive séculaire, figés au siècle courant pour l'orbite tracée
export function planetOrbit(p, tNow) {
  const T = tNow / (86400 * 36525);
  const el = p.el.map((v, k) => v + p.rate[k] * T);
  const [a, e, I, L, wbar, O] = el;
  const nDeg = p.rate[3] / (86400 * 36525); // degrés par seconde
  return new Orbit({
    a: a * AU, e, i: I * D2R, O: O * D2R, w: (wbar - O) * D2R,
    meanAnomaly: (t) => (L + nDeg * (t - tNow) - wbar) * D2R,
  });
}

// Petits corps héliocentriques
export function minorOrbit(m) {
  const [aAU, e, i, O, w, M0] = m.kep;
  const a = aAU * AU;
  const n = Math.sqrt(GM_SUN / (a * a * a)); // rad/s
  const tPeri = m.perihelion != null ? (m.perihelion - J2000_MS) / 1000 : null;
  return new Orbit({
    a, e, i: i * D2R, O: O * D2R, w: w * D2R,
    meanAnomaly: tPeri != null ? (t) => n * (t - tPeri) : (t) => M0 * D2R + n * t,
  });
}

// Base du plan équatorial d'un corps (X, Y dans le plan, Z = pôle)
export function equatorialBasis(pole) {
  const Z = pole.clone().normalize();
  let X = new THREE.Vector3(0, 1, 0).cross(Z);
  if (X.lengthSq() < 1e-8) X.set(1, 0, 0);
  X.normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
  return [X, Y, Z];
}

// Pseudo-aléatoire déterministe à partir d'une chaîne
export function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function moonOrbit(m, parentBasis) {
  const rnd = seeded(m.id);
  const period = m.period * 86400;
  const M0 = rnd() * TAU;
  const basis = m.ecliptic ? null : parentBasis;
  return new Orbit({
    a: m.a, e: m.e, i: m.inc * D2R, O: m.ecliptic ? 125.08 * D2R : rnd() * TAU, w: rnd() * TAU, basis,
    meanAnomaly: (t) => M0 + (TAU * t) / period,
  });
}
