// Textures procédurales (bruit 3D échantillonné sur la sphère : aucune couture)
import { seeded } from './orbits.js';

// ---------- Bruit de Perlin amélioré ----------
const perm = new Uint8Array(512);
{
  const rnd = seeded('terluton-noise');
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
function grad(h, x, y, z) {
  const u = (h & 15) < 8 ? x : y;
  const v = (h & 15) < 4 ? y : ((h & 15) === 12 || (h & 15) === 14 ? x : z);
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
export function noise(x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  x -= X; y -= Y; z -= Z;
  const xi = X & 255, yi = Y & 255, zi = Z & 255;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = perm[xi] + yi, AA = perm[A] + zi, AB = perm[A + 1] + zi;
  const B = perm[xi + 1] + yi, BA = perm[B] + zi, BB = perm[B + 1] + zi;
  return lerp(
    lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
      lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}
export function fbm(x, y, z, oct = 5, lac = 2.0, gain = 0.5) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x, y, z); n += a; a *= gain; x *= lac; y *= lac; z *= lac; }
  return s / n;
}
function ridged(x, y, z, oct = 4) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(noise(x, y, z))); n += a; a *= 0.5; x *= 2.1; y *= 2.1; z *= 2.1; }
  return s / n;
}

// ---------- Cratères (cellulaire) ----------
function hash(ix, iy, iz, k) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647) ^ Math.imul(k, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Renvoie une variation de relief : négatif dans la cuvette, positif sur le rebord
function craters(x, y, z, density = 0.7) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  let h = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const cx = X + i, cy = Y + j, cz = Z + k;
    if (hash(cx, cy, cz, 0) > density) continue;
    const dx = cx + hash(cx, cy, cz, 1) - x, dy = cy + hash(cx, cy, cz, 2) - y, dz = cz + hash(cx, cy, cz, 3) - z;
    const r = 0.15 + 0.4 * hash(cx, cy, cz, 4) ** 2;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / r;
    if (d > 1.5) continue;
    if (d < 1) h -= (1 - d * d) * 0.8;
    h += Math.exp(-((d - 1) * (d - 1)) / 0.02) * 0.6;
  }
  return h;
}
// Distance à la cellule la plus proche (motifs « cantaloup », taches)
function cells(x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  let best = 9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const cx = X + i, cy = Y + j, cz = Z + k;
    const dx = cx + hash(cx, cy, cz, 1) - x, dy = cy + hash(cx, cy, cz, 2) - y, dz = cz + hash(cx, cy, cz, 3) - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function mix(out, a, b, t) { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; }
function set(out, c, k = 1) { out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out; }

// ---------- Styles de surface ----------
// Chaque style : (x, y, z, lat, lon, out, s) avec s = décalage propre au corps
const LOOKS = {
  sun(x, y, z, lat, lon, o, s) {
    const g = fbm(x * 18 + s, y * 18, z * 18, 3) * 0.5 + fbm(x * 4, y * 4 + s, z * 4, 3) * 0.5;
    const k = 0.85 + g * 0.35;
    return set(o, [1.0, 0.78 + g * 0.1, 0.42 + g * 0.1], k);
  },
  mercury(x, y, z, lat, lon, o, s) {
    const b = fbm(x * 3 + s, y * 3, z * 3, 5);
    const c = craters(x * 7 + s, y * 7, z * 7) * 0.12 + craters(x * 18, y * 18 + s, z * 18) * 0.07 + craters(x * 40, y * 40, z * 40 + s, 0.5) * 0.04;
    return set(o, [0.56, 0.53, 0.5], 0.8 + b * 0.25 + c);
  },
  venus(x, y, z, lat, lon, o, s) {
    const w = fbm(x * 2 + s, y * 2, z * 2, 4);
    const band = Math.sin(lat * 7 + w * 5 + fbm(x * 6, y * 6, z * 6 + s, 3) * 2);
    mix(o, [0.82, 0.68, 0.42], [0.98, 0.9, 0.7], 0.5 + band * 0.25 + w * 0.3);
    return o;
  },
  earth(x, y, z, lat, lon, o, s) {
    const h = fbm(x * 1.4 + s, y * 1.4, z * 1.4, 7) + fbm(x * 5, y * 5, z * 5 + s, 3) * 0.15;
    const alat = Math.abs(lat) * 57.3;
    const ice = alat + fbm(x * 8, y * 8, z * 8, 3) * 12;
    if (ice > 74) return set(o, [0.93, 0.95, 0.98]);
    if (h < 0.03) {
      const d = smooth(-0.35, 0.03, h);
      return mix(o, [0.01, 0.04, 0.14], [0.05, 0.2, 0.38], d * d);
    }
    const dry = smooth(0.1, 0.45, 1 - Math.abs(alat - 25) / 20 + fbm(x * 4 + 7, y * 4, z * 4, 4) * 0.8);
    const cold = smooth(50, 68, alat);
    mix(o, [0.12, 0.3, 0.1], [0.72, 0.6, 0.4], dry);
    mix(o, o, [0.45, 0.45, 0.38], cold);
    const mnt = smooth(0.3, 0.55, h);
    mix(o, o, [0.5, 0.45, 0.4], mnt);
    if (h > 0.5 && alat > 25) mix(o, o, [0.95, 0.95, 0.97], smooth(0.5, 0.6, h));
    return o;
  },
  mars(x, y, z, lat, lon, o, s) {
    const alat = Math.abs(lat) * 57.3;
    if (alat + fbm(x * 6, y * 6, z * 6, 3) * 8 > 80) return set(o, [0.95, 0.93, 0.9]);
    const b = fbm(x * 2 + s, y * 2, z * 2, 6);
    const dark = smooth(0.0, 0.25, b);
    mix(o, [0.78, 0.42, 0.22], [0.42, 0.24, 0.16], dark);
    const c = craters(x * 10, y * 10 + s, z * 10) * 0.06 + craters(x * 25 + s, y * 25, z * 25, 0.5) * 0.04;
    return set(o, o, 0.9 + fbm(x * 12, y * 12, z * 12, 3) * 0.2 + c);
  },
  jupiter(x, y, z, lat, lon, o, s) {
    const tq = fbm(x * 3 + s, y * 3, z * 3, 5);
    const q = lat + tq * 0.06 + fbm(x * 2, y * 30, z * 2, 3) * 0.01;
    const band = smooth(-0.35, 0.35, Math.sin(q * 16 + Math.sin(q * 5) * 1.5));
    const band2 = Math.sin(q * 43 + 1.3) * 0.5 + 0.5;
    mix(o, [0.55, 0.36, 0.24], [0.96, 0.92, 0.84], band);
    mix(o, o, [0.8, 0.6, 0.44], band2 * 0.3);
    mix(o, o, [0.98, 0.95, 0.9], smooth(0.25, 0.5, fbm(x * 6, y * 40, z * 6 + s, 3)) * 0.35);
    const polar = smooth(0.9, 1.3, Math.abs(lat));
    mix(o, o, [0.55, 0.5, 0.48], polar);
    // Grande Tache rouge
    const dl = (lat + 0.39) / 0.09, dlo = Math.atan2(Math.sin(lon - 1.2), Math.cos(lon - 1.2)) / 0.2;
    const r = dl * dl + dlo * dlo + tq * 0.3;
    if (r < 1.3) mix(o, o, [0.75, 0.33, 0.2], smooth(1.3, 0.4, r));
    return set(o, o, 0.92 + fbm(x * 20, y * 60, z * 20, 2) * 0.12);
  },
  saturn(x, y, z, lat, lon, o, s) {
    const q = lat + fbm(x * 3 + s, y * 3, z * 3, 4) * 0.025;
    const band = Math.sin(q * 20) * 0.5 + 0.5;
    mix(o, [0.78, 0.66, 0.45], [0.96, 0.88, 0.66], band * 0.6 + 0.3);
    mix(o, o, [0.6, 0.62, 0.62], smooth(1.1, 1.45, Math.abs(lat)));
    return set(o, o, 0.95 + fbm(x * 8, y * 50, z * 8, 2) * 0.08);
  },
  uranus(x, y, z, lat, lon, o, s) {
    const band = Math.sin(lat * 10 + fbm(x * 3, y * 3 + s, z * 3, 3) * 0.3) * 0.5 + 0.5;
    mix(o, [0.6, 0.83, 0.87], [0.7, 0.9, 0.92], band * 0.4 + smooth(0.6, 1.4, lat) * 0.5);
    return o;
  },
  neptune(x, y, z, lat, lon, o, s) {
    const tq = fbm(x * 3 + s, y * 3, z * 3, 4);
    const band = Math.sin(lat * 12 + tq * 1.5) * 0.5 + 0.5;
    mix(o, [0.16, 0.3, 0.78], [0.3, 0.5, 0.95], band);
    const streak = smooth(0.55, 0.8, fbm(x * 3, y * 25, z * 3 + s, 3) + 0.3);
    mix(o, o, [0.85, 0.9, 1.0], streak * 0.5 * smooth(0.2, 0.5, Math.abs(Math.sin(lat * 3))));
    const dl = (lat + 0.35) / 0.1, dlo = Math.atan2(Math.sin(lon - 3), Math.cos(lon - 3)) / 0.2;
    if (dl * dl + dlo * dlo < 1) mix(o, o, [0.08, 0.14, 0.4], smooth(1, 0.3, dl * dl + dlo * dlo));
    return o;
  },
  pluto(x, y, z, lat, lon, o, s) {
    const b = fbm(x * 3 + s, y * 3, z * 3, 5);
    mix(o, [0.7, 0.58, 0.46], [0.85, 0.75, 0.62], b + 0.5);
    // Tombaugh Regio (le « cœur »)
    const hx = Math.cos(0.35) * Math.cos(Math.PI), hz = Math.cos(0.35) * Math.sin(Math.PI), hy = Math.sin(0.35);
    const dh = Math.acos(Math.max(-1, Math.min(1, x * hx + y * hy + z * hz))) + b * 0.4;
    if (dh < 0.75) mix(o, o, [0.96, 0.93, 0.89], smooth(0.75, 0.55, dh));
    else if (Math.abs(lat) < 0.35 + b * 0.3) mix(o, o, [0.32, 0.16, 0.1], smooth(0.35, 0.1, Math.abs(lat) - b * 0.2));
    return set(o, o, 0.95 + craters(x * 12, y * 12, z * 12 + s, 0.4) * 0.05);
  },
  moon(x, y, z, lat, lon, o, s) {
    const m = fbm(x * 1.8 + s, y * 1.8, z * 1.8, 5);
    const maria = smooth(0.05, 0.15, m) * (x > -0.2 ? 1 : 0.4);
    mix(o, [0.64, 0.62, 0.59], [0.3, 0.3, 0.31], maria);
    const c = craters(x * 6, y * 6 + s, z * 6) * 0.12 + craters(x * 16 + s, y * 16, z * 16) * 0.07 + craters(x * 40, y * 40, z * 40 + s, 0.5) * 0.05;
    return set(o, o, 0.9 + fbm(x * 10, y * 10, z * 10, 3) * 0.15 + c * (1 - maria * 0.6));
  },
  io(x, y, z, lat, lon, o, s) {
    const b = fbm(x * 3 + s, y * 3, z * 3, 5);
    mix(o, [0.92, 0.85, 0.35], [0.95, 0.65, 0.25], smooth(-0.1, 0.3, b));
    mix(o, o, [0.95, 0.95, 0.85], smooth(0.2, 0.4, fbm(x * 5, y * 5 + s, z * 5, 4)));
    const v = cells(x * 7 + s, y * 7, z * 7);
    if (v < 0.12) mix(o, o, [0.15, 0.08, 0.05], smooth(0.12, 0.04, v));
    else if (v < 0.22) mix(o, o, [0.75, 0.3, 0.15], smooth(0.22, 0.12, v) * 0.7);
    return o;
  },
  europa(x, y, z, lat, lon, o, s) {
    const b = fbm(x * 3 + s, y * 3, z * 3, 4);
    mix(o, [0.88, 0.84, 0.76], [0.72, 0.62, 0.5], smooth(0.05, 0.35, b));
    const l1 = ridged(x * 4 + s, y * 4, z * 4, 4), l2 = ridged(x * 9, y * 9 + s, z * 9, 3);
    mix(o, o, [0.55, 0.35, 0.22], smooth(0.9, 0.97, l1) * 0.8);
    mix(o, o, [0.6, 0.42, 0.3], smooth(0.92, 0.98, l2) * 0.6);
    return o;
  },
  ganymede(x, y, z, lat, lon, o, s) {
    const b = fbm(x * 2.5 + s, y * 2.5, z * 2.5, 5);
    mix(o, [0.42, 0.38, 0.33], [0.72, 0.7, 0.66], smooth(-0.05, 0.1, b));
    const gr = ridged(x * 12, y * 12 + s, z * 12, 3);
    const c = craters(x * 9, y * 9, z * 9 + s, 0.5) * 0.1;
    return set(o, o, 0.92 + gr * 0.08 + c);
  },
  callisto(x, y, z, lat, lon, o, s) {
    const b = fbm(x * 3 + s, y * 3, z * 3, 4);
    set(o, [0.33, 0.3, 0.26], 0.9 + b * 0.2);
    const v = cells(x * 14 + s, y * 14, z * 14);
    if (v < 0.18) mix(o, o, [0.85, 0.82, 0.78], smooth(0.18, 0.05, v));
    return set(o, o, 1 + craters(x * 20, y * 20, z * 20 + s) * 0.08);
  },
  titan(x, y, z, lat, lon, o, s) {
    const b = fbm(x * 2 + s, y * 2, z * 2, 3);
    mix(o, [0.8, 0.55, 0.22], [0.9, 0.68, 0.33], 0.5 + b * 0.5 + Math.sin(lat * 4) * 0.1);
    return o;
  },
  enceladus(x, y, z, lat, lon, o, s) {
    set(o, [0.95, 0.96, 0.98], 0.95 + fbm(x * 6 + s, y * 6, z * 6, 3) * 0.08);
    if (lat < -1.0) {
      const st = Math.abs(Math.sin((x * 3 + z * 1.5 + fbm(x * 4, y * 4, z * 4, 2) * 0.4) * 9));
      mix(o, o, [0.55, 0.75, 0.9], smooth(0.12, 0.0, st) * smooth(-1.0, -1.25, lat));
    }
    return set(o, o, 1 + craters(x * 12, y * 12 + s, z * 12, 0.4) * 0.05);
  },
  iapetus(x, y, z, lat, lon, o, s) {
    const d = Math.cos(lon - Math.PI / 2) * Math.cos(lat) + fbm(x * 4 + s, y * 4, z * 4, 4) * 0.3;
    mix(o, [0.85, 0.83, 0.78], [0.18, 0.12, 0.08], smooth(0.1, 0.3, d));
    return set(o, o, 1 + craters(x * 9, y * 9, z * 9 + s) * 0.08);
  },
  miranda(x, y, z, lat, lon, o, s) {
    const r = ridged(x * 3 + s, y * 3, z * 3, 4);
    mix(o, [0.55, 0.55, 0.55], [0.8, 0.8, 0.8], smooth(0.6, 0.85, r));
    return set(o, o, 1 + craters(x * 10, y * 10, z * 10 + s, 0.5) * 0.08);
  },
  triton(x, y, z, lat, lon, o, s) {
    const v = cells(x * 12 + s, y * 12, z * 12);
    mix(o, [0.8, 0.7, 0.66], [0.62, 0.55, 0.52], smooth(0.2, 0.5, v));
    if (lat < -0.3) mix(o, o, [0.92, 0.85, 0.82], smooth(-0.3, -0.6, lat));
    const st = fbm(x * 3, y * 20 + s, z * 3, 3);
    return mix(o, o, [0.35, 0.3, 0.3], smooth(0.35, 0.5, st) * 0.6);
  },
  charon(x, y, z, lat, lon, o, s) {
    set(o, [0.58, 0.57, 0.56], 0.9 + fbm(x * 3 + s, y * 3, z * 3, 4) * 0.2);
    mix(o, o, [0.45, 0.25, 0.17], smooth(0.9, 1.2, lat + fbm(x * 4, y * 4, z * 4, 3) * 0.3));
    return set(o, o, 1 + craters(x * 10, y * 10 + s, z * 10) * 0.08);
  },
  ceres(x, y, z, lat, lon, o, s) {
    set(o, [0.38, 0.37, 0.36], 0.9 + fbm(x * 3 + s, y * 3, z * 3, 4) * 0.2);
    const bright = Math.hypot(x - 0.95, y - 0.3, z) < 0.07;
    if (bright) set(o, [0.95, 0.95, 0.95]);
    return set(o, o, 1 + craters(x * 9, y * 9, z * 9 + s) * 0.1 + craters(x * 25, y * 25 + s, z * 25, 0.5) * 0.05);
  },
  ice(x, y, z, lat, lon, o, s) {
    set(o, [0.82, 0.82, 0.83], 0.88 + fbm(x * 3 + s, y * 3, z * 3, 4) * 0.2);
    return set(o, o, 1 + craters(x * 8, y * 8 + s, z * 8) * 0.1 + craters(x * 20 + s, y * 20, z * 20, 0.5) * 0.06);
  },
  darkice(x, y, z, lat, lon, o, s) {
    set(o, [0.45, 0.45, 0.47], 0.88 + fbm(x * 3 + s, y * 3, z * 3, 4) * 0.2);
    return set(o, o, 1 + craters(x * 8, y * 8 + s, z * 8) * 0.12 + craters(x * 20 + s, y * 20, z * 20, 0.5) * 0.06);
  },
  rock(x, y, z, lat, lon, o, s) {
    set(o, [0.5, 0.46, 0.42], 0.8 + fbm(x * 3 + s, y * 3, z * 3, 4) * 0.3);
    return set(o, o, 1 + craters(x * 6, y * 6 + s, z * 6) * 0.14 + craters(x * 16 + s, y * 16, z * 16, 0.5) * 0.08);
  },
  redrock(x, y, z, lat, lon, o, s) {
    set(o, [0.6, 0.35, 0.24], 0.8 + fbm(x * 3 + s, y * 3, z * 3, 4) * 0.3);
    return set(o, o, 1 + craters(x * 6, y * 6 + s, z * 6) * 0.14);
  },
  sponge(x, y, z, lat, lon, o, s) {
    const v = cells(x * 9 + s, y * 9, z * 9), v2 = cells(x * 20, y * 20 + s, z * 20);
    set(o, [0.72, 0.66, 0.56], 0.5 + smooth(0.1, 0.5, v) * 0.4 + smooth(0.1, 0.4, v2) * 0.2);
    return o;
  },
  comet(x, y, z, lat, lon, o, s) {
    return set(o, [0.2, 0.18, 0.16], 0.8 + fbm(x * 4 + s, y * 4, z * 4, 4) * 0.4);
  },
};

// Génère une texture équirectangulaire (ligne 0 = pôle nord)
export function paintBody(look, w, h, seedStr) {
  const fn = LOOKS[look] || LOOKS.rock;
  const rnd = seeded(seedStr);
  const s = rnd() * 100;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const o = [0, 0, 0];
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2;
      fn(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat, lon, o, s);
      const k = (j * w + i) * 4;
      d[k] = clamp01(o[0]) * 255; d[k + 1] = clamp01(o[1]) * 255; d[k + 2] = clamp01(o[2]) * 255; d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function paintClouds(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const beltT = Math.abs(Math.sin(lat * 3)); // bandes nuageuses (ITCZ, latitudes moyennes)
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2;
      const x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      const wx = fbm(x * 2 + 3, y * 2, z * 2, 3);
      const n = fbm(x * 3 + wx * 1.5, y * 6 + wx, z * 3 - wx, 6);
      const fine = fbm(x * 14, y * 14, z * 14, 3) * 0.12;
      const a = smooth(0.08, 0.4, n + fine + beltT * 0.1 - 0.06);
      const k = (j * w + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = a * a * 215;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------- Anneaux : profil radial (couleur + opacité) ----------
const RING_PROFILES = {
  saturn(r, n) {
    let a = 0, c = [0.85, 0.78, 0.65];
    if (r < 74500) { a = 0.04; c = [0.6, 0.55, 0.5]; }
    else if (r < 92000) { a = 0.16 + n * 0.1; c = [0.62, 0.56, 0.48]; }
    else if (r < 117580) { a = 0.8 + n * 0.18; c = [0.88, 0.8, 0.66]; }
    else if (r < 122170) { a = 0.06; c = [0.5, 0.45, 0.4]; }
    else if (r < 136775) { a = 0.6 + n * 0.12; c = [0.8, 0.74, 0.64]; if (Math.abs(r - 133590) < 170 || Math.abs(r - 136505) < 25) a = 0.03; }
    else if (Math.abs(r - 140220) < 120) { a = 0.55; c = [0.85, 0.8, 0.72]; }
    return [c, a];
  },
  uranus(r) {
    const rings = [[41837, 3], [42234, 3], [42571, 3], [44718, 8], [45661, 8], [47176, 3], [47627, 3], [48300, 6], [51149, 45]];
    let a = 0;
    for (const [rr, w] of rings) a = Math.max(a, Math.exp(-((r - rr) ** 2) / (2 * Math.max(w, 12) ** 2)) * (rr === 51149 ? 0.85 : 0.55));
    return [[0.45, 0.45, 0.48], a];
  },
  neptune(r) {
    let a = 0;
    if (r > 40900 && r < 42900) a = 0.08;
    if (r > 53200 && r < 57200) a = Math.max(a, 0.05);
    a = Math.max(a, Math.exp(-((r - 53200) ** 2) / (2 * 60 ** 2)) * 0.4);
    a = Math.max(a, Math.exp(-((r - 57200) ** 2) / (2 * 60 ** 2)) * 0.25);
    a = Math.max(a, Math.exp(-((r - 62932) ** 2) / (2 * 50 ** 2)) * 0.5);
    return [[0.55, 0.5, 0.48], a];
  },
  jupiter(r) {
    let a = 0;
    if (r < 122500) a = 0.03 * smooth(92000, 115000, r);
    else if (r < 129000) a = 0.16;
    else a = 0.035 * smooth(226000, 150000, r);
    return [[0.6, 0.45, 0.35], a];
  },
};

export function paintRing(style, inner, outer, w = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, 1);
  const prof = RING_PROFILES[style];
  for (let i = 0; i < w; i++) {
    const r = inner + ((i + 0.5) / w) * (outer - inner);
    const n = fbm(r / 900, 0.5, 0.5, 4) + fbm(r / 90, 1.5, 0.5, 2) * 0.5;
    const [c, a] = prof(r, n);
    const k = i * 4;
    img.data[k] = c[0] * 255 * (0.9 + n * 0.2); img.data[k + 1] = c[1] * 255 * (0.9 + n * 0.2);
    img.data[k + 2] = c[2] * 255 * (0.9 + n * 0.2); img.data[k + 3] = clamp01(a) * 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function paintGlow(size = 256, stops = [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
