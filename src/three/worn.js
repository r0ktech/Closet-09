import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bar, flipX, poly, roundedRect } from './garments.js';

/*
 * Worn garments for the try-on view.
 *
 * The mannequin is defined by a body profile: torso cross-sections (half-width,
 * half-depth) at heights, plus arm and leg paths. Garments are generated as
 * shells around that same body: the torso is lofted from ring to ring, sleeves
 * and trouser legs are tubes along the limbs, and trims (pockets, lapels,
 * plackets) are 2D shapes wrapped onto the curved surface.
 *
 * Sizes change the ease (gap between body and fabric) rather than scaling the
 * garment, so S hugs and L drapes. All three sizes share one topology and are
 * stored as morph targets, so switching size animates.
 *
 * Coordinates: y = 0 is the base of the neck, y = -1.4 the ankles.
 */

/* ------------------------------ body profile ----------------------------- */

// [y, half-width, half-depth]
const TORSO = [
  [0.11, 0.04, 0.043],
  [0.03, 0.045, 0.05],
  [0.0, 0.065, 0.058],
  [-0.02, 0.12, 0.075],
  [-0.045, 0.165, 0.09],
  [-0.08, 0.176, 0.102],
  [-0.13, 0.168, 0.112],
  [-0.24, 0.158, 0.118],
  [-0.36, 0.14, 0.105],
  [-0.44, 0.13, 0.097],
  [-0.56, 0.148, 0.103],
  [-0.66, 0.162, 0.106],
  [-0.74, 0.15, 0.098],
];

function sample(keys, y, k) {
  const last = keys.length - 1;
  if (y >= keys[0][0]) return keys[0][k];
  if (y <= keys[last][0]) return keys[last][k];
  let i = 0;
  while (keys[i + 1][0] > y) i++;
  const t = (keys[i][0] - y) / (keys[i][0] - keys[i + 1][0]);
  const p0 = keys[Math.max(0, i - 1)][k];
  const p1 = keys[i][k];
  const p2 = keys[i + 1][k];
  const p3 = keys[Math.min(last, i + 2)][k];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

const bodyW = (y) => sample(TORSO, y, 1);
const bodyD = (y) => sample(TORSO, y, 2);
const BODY = { w: bodyW, d: bodyD };

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const ARM = [V(0.15, -0.085), V(0.19, -0.13), V(0.235, -0.38, -0.01), V(0.265, -0.62, 0.015), V(0.272, -0.72, 0.025)];
const armR = (t) => THREE.MathUtils.lerp(0.046, 0.026, Math.min(1, t * 1.1));
const LEG = [V(0.08, -0.62), V(0.086, -1.0, 0.005), V(0.082, -1.37)];
const legR = (t) => (t < 0.5 ? THREE.MathUtils.lerp(0.09, 0.058, t / 0.5) : THREE.MathUtils.lerp(0.058, 0.04, (t - 0.5) / 0.5));

const SQ = 2.3; // superellipse exponent: slightly squarer than an ellipse, like a torso

const mirrorPts = (pts) => pts.map((p) => V(-p.x, p.y, p.z));

/* ------------------------------ mesh builders ---------------------------- */

// Build an indexed grid from rows of points; seam columns are duplicated for UVs
// and their normals averaged afterwards. Winding is fixed to face away from `centers`.
function grid(rows, centers, uvs) {
  const R = rows.length;
  const C = rows[0].length;
  const pos = new Float32Array(R * C * 3);
  const uv = new Float32Array(R * C * 2);
  rows.forEach((row, j) =>
    row.forEach((p, i) => {
      const k = j * C + i;
      p.toArray(pos, k * 3);
      uv[k * 2] = uvs[j][i][0];
      uv[k * 2 + 1] = uvs[j][i][1];
    }),
  );
  const index = [];
  for (let j = 0; j < R - 1; j++) {
    for (let i = 0; i < C - 1; i++) {
      const a = j * C + i;
      const b = a + C;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // Orientation check against the first ring centre.
  const j0 = Math.floor(R / 2);
  const i0 = Math.floor(C / 4);
  const pa = rows[j0][i0];
  const n = new THREE.Vector3().subVectors(rows[j0 + (j0 + 1 < R ? 1 : -1)][i0], pa).cross(new THREE.Vector3().subVectors(rows[j0][i0 + 1], pa));
  if (j0 + 1 >= R) n.negate();
  if (n.dot(new THREE.Vector3().subVectors(pa, centers[j0])) < 0) {
    for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  for (let j = 0; j < R; j++) {
    const a = j * C;
    const b = a + C - 1;
    const v = new THREE.Vector3().fromBufferAttribute(nrm, a).add(new THREE.Vector3().fromBufferAttribute(nrm, b)).normalize();
    nrm.setXYZ(a, v.x, v.y, v.z);
    nrm.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

function ringPoint(w, d, phi) {
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  return [w * Math.sign(s) * Math.abs(s) ** (2 / SQ), d * Math.sign(c) * Math.abs(c) ** (2 / SQ)];
}

/** Loft around a surface between per-angle top and bottom edges (phi = 0 is centre front). */
function loft(surface, yTop, yBot, { U = 96, Vn = 64, lift = 0 } = {}) {
  const rows = [];
  const centers = [];
  const uvs = [];
  for (let j = 0; j <= Vn; j++) {
    const v = j / Vn;
    const row = [];
    const uvRow = [];
    let cy = 0;
    for (let i = 0; i <= U; i++) {
      const phi = -Math.PI + (2 * Math.PI * i) / U;
      const top = yTop(phi);
      const y = top + (yBot(phi) - top) * v;
      const [x, z] = ringPoint(surface.w(y) + lift, surface.d(y) + lift, phi);
      row.push(V(x, y, z));
      uvRow.push([phi * 0.15, y]);
      cy += y;
    }
    rows.push(row);
    uvs.push(uvRow);
    centers.push(V(0, cy / (U + 1), 0));
  }
  return grid(rows, centers, uvs);
}

/** Tube along a path; `radius(t)` in metres, optional t-range for bands. */
function tube(points, radius, { t0 = 0, t1 = 1, segs = 48, radial = 36, flatten = 0.92 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points);
  const Z = V(0, 0, 1);
  const rows = [];
  const centers = [];
  const uvs = [];
  for (let j = 0; j <= segs; j++) {
    const t = t0 + ((t1 - t0) * j) / segs;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const zAxis = Z.clone().sub(T.clone().multiplyScalar(T.dot(Z))).normalize();
    const xAxis = new THREE.Vector3().crossVectors(T, zAxis).normalize();
    const r = radius(t);
    const row = [];
    const uvRow = [];
    for (let i = 0; i <= radial; i++) {
      const a = (2 * Math.PI * i) / radial;
      row.push(p.clone().addScaledVector(xAxis, Math.cos(a) * r).addScaledVector(zAxis, Math.sin(a) * r * flatten));
      uvRow.push([a * r, t * 0.8]);
    }
    rows.push(row);
    uvs.push(uvRow);
    centers.push(p);
  }
  return grid(rows, centers, uvs);
}

function ellipsoid(rx, ry, rz, x, y, z, ws = 32, hs = 24) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

/* --------------------------- wrapping 2D trims --------------------------- */

// Longest-edge bisection so flat shapes can bend around the body.
function subdivide(geo, maxLen) {
  let pos = Array.from(geo.attributes.position.array);
  let uv = Array.from(geo.attributes.uv.array);
  for (let pass = 0; pass < 14; pass++) {
    const np = [];
    const nu = [];
    let split = false;
    for (let t = 0; t < pos.length; t += 9) {
      const P = [0, 1, 2].map((k) => pos.slice(t + k * 3, t + k * 3 + 3));
      const Uv = [0, 1, 2].map((k) => uv.slice((t / 3 + k) * 2, (t / 3 + k) * 2 + 2));
      const len = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
      const edges = [len(0, 1), len(1, 2), len(2, 0)];
      const e = edges.indexOf(Math.max(...edges));
      if (edges[e] <= maxLen) {
        P.forEach((p) => np.push(...p));
        Uv.forEach((u) => nu.push(...u));
        continue;
      }
      split = true;
      const a = e;
      const b = (e + 1) % 3;
      const c = (e + 2) % 3;
      const m = P[a].map((v, k) => (v + P[b][k]) / 2);
      const mu = Uv[a].map((v, k) => (v + Uv[b][k]) / 2);
      np.push(...P[a], ...m, ...P[c], ...m, ...P[b], ...P[c]);
      nu.push(...Uv[a], ...mu, ...Uv[c], ...mu, ...Uv[b], ...Uv[c]);
    }
    pos = np;
    uv = nu;
    if (!split) break;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function project(surface, x, y, lift) {
  const w = surface.w(y) + lift;
  const d = surface.d(y) + lift;
  const s = THREE.MathUtils.clamp(x / w, -1, 1);
  const sinP = Math.abs(s) ** (SQ / 2);
  const cosP = Math.sqrt(Math.max(0, 1 - sinP * sinP));
  return V(x, y, d * cosP ** (2 / SQ));
}

/** A 2D shape (garment space) wrapped onto `surface`, `lift` above the fabric. */
function wrap(shape, surface, { lift = 0.004, depth = 0.003, sx = 1, sy = 1 } = {}) {
  const flat = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
  const g = subdivide(flat, 0.014);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = project(surface, p.getX(i) * sx, p.getY(i) * sy, lift + p.getZ(i));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function button(surface, x, y, r, lift = 0.006) {
  const g = new THREE.CylinderGeometry(r, r, 0.005, 16);
  g.rotateX(Math.PI / 2);
  const p = project(surface, x, y, lift);
  const above = project(surface, x + 0.002, y, lift);
  g.rotateY(-Math.atan2(above.z - p.z, 0.002) * 0.9);
  g.translate(p.x, p.y, p.z);
  return g;
}

/* ------------------------------ garment specs ---------------------------- */

const SIZE_P = {
  S: { e: 0.008, len: 0.97 },
  M: { e: 0.022, len: 1 },
  L: { e: 0.038, len: 1.03 },
};

const CHEST = -0.24;

// Tops fall straight from the chest; everything above follows the body.
function topSurface(e) {
  return {
    w: (y) => (y > CHEST ? bodyW(y) : Math.max(bodyW(y), bodyW(CHEST) * 0.99)) + e,
    d: (y) => (y > CHEST ? bodyD(y) : Math.max(bodyD(y), bodyD(CHEST) * 0.97)) + e,
  };
}

function dressSurface(e, hemW, hemD) {
  const WAIST = -0.44;
  const HEM = -1.03;
  return {
    w: (y) => {
      if (y > WAIST) return bodyW(y) + e * 0.6;
      const t = ((WAIST - y) / (WAIST - HEM)) ** 1.15;
      return Math.max(bodyW(y) + e * 0.6, THREE.MathUtils.lerp(bodyW(WAIST) + e * 0.6, hemW + e, t));
    },
    d: (y) => {
      if (y > WAIST) return bodyD(y) + e * 0.6;
      const t = ((WAIST - y) / (WAIST - HEM)) ** 1.15;
      return Math.max(bodyD(y) + e * 0.6, THREE.MathUtils.lerp(bodyD(WAIST) + e * 0.6, hemD + e, t));
    },
  };
}

// Top edge of a garment around the neck: `base` height, dipping by `dip` at the front.
function neckline(base, dip, phi0, shape = 'round') {
  return (phi) => {
    const a = Math.abs(phi);
    if (a >= phi0) return base;
    const k = 1 - a / phi0;
    return base - dip * (shape === 'v' ? k : Math.sin((k * Math.PI) / 2));
  };
}

const at = (y) => () => y;
const shift = (fn, dy) => (phi) => fn(phi) + dy;

function sleeves(e, { long = true, loose = 0, cuff = 0.06, gathered = false }) {
  // Starts inside the torso so the open end of the tube never shows at the shoulder.
  const path = long
    ? [V(0.13, -0.068), V(0.19, -0.12), V(0.238, -0.38, -0.01), V(0.27, -0.64, 0.016)]
    : [V(0.13, -0.068), V(0.19, -0.12), V(0.212, -0.25, -0.004)];
  const span = long ? 0.64 : 0.24;
  const cuffT = cuff ? 1 - cuff / span : 1;
  const ribR = armR(0.88) + 0.012 + e * 0.15;
  const sleeveR = (t) => {
    const base = long ? THREE.MathUtils.lerp(0.064, 0.04, t) : THREE.MathUtils.lerp(0.066, 0.062, t);
    const shoulder = 0.72 + 0.28 * THREE.MathUtils.smoothstep(t, 0.02, 0.2);
    let r = (base + e * 0.5 + loose) * shoulder;
    // A ribbed cuff pulls the sleeve in, so the fabric gathers just above it.
    if (gathered) r = THREE.MathUtils.lerp(r, ribR + 0.004, THREE.MathUtils.smoothstep(t, cuffT - 0.09, cuffT + 0.005));
    return r;
  };
  const cuffR = (t) => (gathered ? ribR : sleeveR(t) + 0.003);
  const out = [];
  for (const pts of [path, mirrorPts(path)]) {
    out.push(['base', tube(pts, sleeveR, { t1: gathered ? cuffT + 0.01 : 1 })]);
    if (cuff) out.push(['shade', tube(pts, cuffR, { t0: cuffT, t1: 1, segs: 8 })]);
  }
  return out;
}

const BUILDERS = {
  tee(p) {
    const e = p.e + 0.004;
    const S = topSurface(e);
    const top = neckline(0.0, 0.07, 1.0);
    const hem = at(-0.7 * p.len);
    return [
      ['base', loft(S, top, hem)],
      ['shade', loft(S, top, shift(top, -0.018), { Vn: 4, lift: 0.003 })],
      ...sleeves(e, { long: false, cuff: 0.02 }),
    ];
  },

  longsleeve(p) {
    const S = topSurface(p.e);
    const top = neckline(-0.02, 0.03, 1.3);
    const len = 0.68 * p.len;
    const parts = [
      ['base', loft(S, top, at(-len))],
      ['shade', loft(S, top, shift(top, -0.012), { Vn: 3, lift: 0.003 })],
      ...sleeves(p.e, { cuff: 0 }),
    ];
    for (let k = 0; k < 7; k++) {
      const y = (-0.16 - k * 0.075) * p.len;
      parts.push(['stripe', loft(S, at(y), at(y - 0.03 * p.len), { Vn: 2, lift: 0.002 })]);
    }
    return parts;
  },

  sweater(p) {
    const S = topSurface(p.e);
    const top = neckline(0.0, 0.065, 1.0);
    const len = 0.68 * p.len;
    return [
      ['base', loft(S, top, at(-len))],
      ['shade', loft(S, top, shift(top, -0.026), { Vn: 4, lift: 0.004 })],
      ['shade', loft(S, at(-len + 0.065), at(-len), { Vn: 4, lift: 0.004 })],
      ...sleeves(p.e, { cuff: 0.065, gathered: true }),
    ];
  },

  hoodie(p) {
    const e = p.e + 0.016;
    const S = topSurface(e);
    const rib = topSurface(e - 0.022);
    const top = neckline(0.012, 0.055, 0.95);
    const len = 0.72 * p.len;
    const grow = 1 + (e - 0.038) * 2.2; // the hood scales with the size

    // The hood's double-layered opening edge, lying around the neck and crossing at the front.
    const rim = [
      V(0.004, -0.112, 0.162),
      V(0.05, -0.066, 0.142),
      V(0.096, -0.012, 0.096),
      V(0.122, 0.028, 0.02),
      V(0.104, 0.052, -0.072),
      V(0.05, 0.064, -0.126),
      V(0, 0.066, -0.138),
    ].map((v) => V(v.x * grow, v.y, v.z * grow));
    // Left edge front -> back, then right edge back -> front; the two ends overlap at the front.
    const rimPath = [...mirrorPts(rim.slice(0, -1)), ...rim.slice().reverse()];
    rimPath[0] = V(0.022 * grow, -0.12, 0.162 * grow);
    rimPath[rimPath.length - 1] = V(-0.022 * grow, -0.122, 0.17 * grow);
    const rimR = (t) => 0.036 * (0.5 + 0.45 * THREE.MathUtils.smoothstep(t, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(t, 0.88, 1)));

    // The rest of the hood: fabric folded down over the upper back.
    const hoodBack = ellipsoid(0.15 * grow, 0.17, 0.062, 0, -0.1, -0.128 * grow - 0.012, 40, 28);

    const pocket = new THREE.Shape();
    pocket.moveTo(-0.105, -0.4);
    pocket.lineTo(0.105, -0.4);
    pocket.quadraticCurveTo(0.118, -0.5, 0.172, -0.52);
    pocket.lineTo(0.172, -0.61);
    pocket.lineTo(-0.172, -0.61);
    pocket.lineTo(-0.172, -0.52);
    pocket.quadraticCurveTo(-0.118, -0.5, -0.105, -0.4);

    const parts = [
      ['base', loft(S, top, at(-len + 0.045))],
      ['shade', loft(rib, at(-len + 0.068), at(-len), { Vn: 6 })],
      ['base', tube(rimPath, rimR, { segs: 90, radial: 20, flatten: 0.5 })],
      ['base', hoodBack],
      ['panel', wrap(pocket, S, { sy: p.len, lift: 0.004, depth: 0.007 })],
      ['shade', wrap(bar(0.105, -0.4, 0.172, -0.52, 0.004), S, { sy: p.len, lift: 0.0115 })],
      ['shade', wrap(bar(-0.105, -0.4, -0.172, -0.52, 0.004), S, { sy: p.len, lift: 0.0115 })],
      ['shade', wrap(bar(-0.1, -0.415, 0.1, -0.415, 0.003), S, { sy: p.len, lift: 0.0115 })],
      ...sleeves(e, { cuff: 0.07, loose: 0.006, gathered: true }),
    ];

    // Round drawcords from metal eyelets, ending in metal tips.
    for (const side of [-1, 1]) {
      const x0 = 0.038 * side;
      const drop = side > 0 ? 0.25 : 0.27;
      const pts = [0, 0.25, 0.5, 0.75, 1].map((k) => {
        const y = -0.085 - drop * k;
        return project(S, x0 + side * 0.006 * Math.sin(k * 3), y, 0.012);
      });
      const cord = tube(pts, () => 0.0045, { segs: 30, radial: 10, flatten: 1, t1: 0.93 });
      parts.push(['string', cord]);
      parts.push(['metal', tube(pts, () => 0.0055, { segs: 4, radial: 10, flatten: 1, t0: 0.93, t1: 1 })]);
      const eye = new THREE.TorusGeometry(0.008, 0.0028, 8, 20);
      const at0 = project(S, x0, -0.085, 0.006);
      eye.translate(at0.x, at0.y, at0.z);
      parts.push(['metal', eye]);
    }
    return parts;
  },

  shirt(p) {
    const S = topSurface(p.e);
    const top = neckline(0.0, 0.05, 0.5, 'v');
    const len = 0.74 * p.len;
    const collar = [[0.006, -0.045], [0.058, -0.004], [0.095, -0.03], [0.058, -0.125]];
    const parts = [
      ['base', loft(S, top, at(-len))],
      ['base', loft(S, (phi) => (Math.abs(phi) < 0.42 ? top(phi) : 0.032), top, { Vn: 6, lift: 0.002 })],
      ['base', wrap(poly(collar), S, { lift: 0.007 })],
      ['base', wrap(poly(flipX(collar)), S, { lift: 0.0085 })],
      ['shade', wrap(bar(0, -0.06, 0, -0.735, 0.034), S, { sy: p.len })],
      ['shade', wrap(roundedRect(0.06, -0.2, 0.08, 0.095, 0.006), S, { sy: p.len })],
      ...sleeves(p.e, { cuff: 0.075 }),
    ];
    for (let k = 0; k < 6; k++) parts.push(['pearl', button(S, 0, (-0.12 - k * 0.105) * p.len, 0.008, 0.008)]);
    return parts;
  },

  blazer: (p) => tailored(p, { len: 0.76, double: false }),
  coat: (p) => tailored(p, { len: 1.0, double: true }),

  dress(p) {
    const S = dressSurface(p.e, 0.3, 0.24);
    const top = neckline(-0.12, 0.05, 0.7, 'v');
    const hem = -1.03 * (0.985 + (p.len - 1) * 0.5);
    const strap = [V(0.085, -0.15, 0.13), V(0.098, -0.04, 0.075), V(0.102, -0.003, 0), V(0.098, -0.04, -0.075), V(0.085, -0.15, -0.12)];
    return [
      ['base', loft(S, top, at(hem), { Vn: 90 })],
      ['shade', loft(S, at(-0.335), at(-0.385), { Vn: 4, lift: 0.004 })],
      ['base', tube(strap, () => 0.006, { segs: 24, radial: 10, flatten: 0.6 })],
      ['base', tube(mirrorPts(strap), () => 0.006, { segs: 24, radial: 10, flatten: 0.6 })],
    ];
  },

  wrap(p) {
    const S = dressSurface(p.e, 0.33, 0.26);
    const top = neckline(-0.015, 0.27, 0.6, 'v');
    const hem = -1.03 * (0.985 + (p.len - 1) * 0.5);
    return [
      ['base', loft(S, top, at(hem), { Vn: 96 })],
      ['shade', wrap(bar(-0.11, -0.39, 0.17, -0.98, 0.004), S)],
      ['base', loft(S, at(-0.335), at(-0.39), { Vn: 4, lift: 0.004 })],
      ['base', wrap(poly([[0.1, -0.385], [0.13, -0.385], [0.16, -0.62], [0.13, -0.625]]), S, { lift: 0.009 })],
      ['base', wrap(poly([[0.12, -0.385], [0.145, -0.385], [0.21, -0.57], [0.185, -0.58]]), S, { lift: 0.014 })],
      ['shade', wrap(roundedRect(0.095, -0.335, 0.055, 0.06, 0.012), S, { lift: 0.011 })],
    ];
  },

  pants(p, variant) {
    const e = p.e * 0.7;
    // Trousers fall straight from the widest point of the hip.
    const S = { w: (y) => bodyW(Math.max(y, -0.66)) + e, d: (y) => bodyD(Math.max(y, -0.66)) + e };
    const hemR = variant === 'wide' ? 0.115 : 0.078;
    // Legs start at the crotch and are sized to meet the hip shell there.
    const leg = [V(0.076, -0.7), V(0.086, -1.02, 0.004), V(0.09, -1.4)];
    const top = bodyW(-0.66) + e - 0.076;
    const r = (t) => Math.max(legR(0.1 + t * 0.9) + e + 0.002, THREE.MathUtils.lerp(top, hemR + e * 0.8, t));
    const parts = [
      ['base', loft(S, at(-0.42), at(-0.76), { Vn: 30 })],
      ['shade', loft(S, at(-0.42), at(-0.475), { Vn: 4, lift: 0.004 })],
      ['base', tube(leg, r, { segs: 60 })],
      ['base', tube(mirrorPts(leg), r, { segs: 60 })],
      ['shade', wrap(bar(0.022, -0.485, 0.022, -0.66, 0.004), S)],
      ['metal', button(S, 0, -0.447, 0.01, 0.009)],
    ];
    for (const x of [-0.15, -0.07, 0.07, 0.15]) parts.push(['shade', wrap(roundedRect(x - 0.008, -0.414, 0.016, 0.07, 0.003), S, { lift: 0.008 })]);
    return parts;
  },
};

function tailored(p, { len, double }) {
  const e = p.e + 0.012;
  const S = topSurface(e);
  const dip = double ? 0.3 : 0.34;
  const top = neckline(0.004, dip, 0.42, 'v');
  const L = len * p.len;
  const wide = double ? 0.03 : 0;
  const lapel = [[0.06, -0.01], [0.1 + wide * 0.5, -0.03], [0.128 + wide, -0.12], [0.1 + wide, -0.13], [0.12 + wide, -0.16], [0.012, -dip - 0.03], [0, -dip]];
  const shirt = topSurface(0.006);
  const parts = [
    ['base', loft(S, top, at(-L), { Vn: 80 })],
    ['shirt', loft(shirt, neckline(0.0, 0.05, 0.9), at(-dip - 0.05), { Vn: 24 })],
    ['shade', wrap(poly(lapel), S, { lift: 0.005 })],
    ['shade', wrap(poly(flipX(lapel)), S, { lift: 0.0065 })],
    ['shade', wrap(bar(0, -dip - 0.02, 0, -len + 0.005, 0.004), S, { sy: p.len })],
    ['shade', wrap(roundedRect(-0.15, -0.25, 0.08, 0.016, 0.004), S)],
    ...sleeves(e, { cuff: 0, loose: 0.006 }),
  ];
  const flapY = double ? -0.62 : -0.52;
  parts.push(['shade', wrap(roundedRect(0.06, flapY, 0.11, 0.045, 0.006), S, { lift: 0.006 })]);
  parts.push(['shade', wrap(roundedRect(-0.17, flapY, 0.11, 0.045, 0.006), S, { lift: 0.006 })]);
  for (const y of double ? [-0.4, -0.5, -0.6] : [-0.42, -0.52]) {
    if (double) {
      parts.push(['horn', button(S, -0.065, y, 0.012, 0.01)]);
      parts.push(['horn', button(S, 0.065, y, 0.012, 0.01)]);
    } else parts.push(['horn', button(S, 0, y, 0.012, 0.01)]);
  }
  return parts;
}

/* ------------------------------ dims ------------------------------------- */

function dimsFor(type, p, variant) {
  switch (type) {
    case 'dress':
    case 'wrap': {
      const S = dressSurface(p.e, 0, 0);
      const y = -0.36;
      return { h: { key: 'waist', y, half: S.w(y), z: S.d(y) + 0.04 }, v: { key: 'length', x: 0.42, top: type === 'wrap' ? -0.015 : -0.12, bottom: -1.03 * (0.985 + (p.len - 1) * 0.5), z: 0.1 } };
    }
    case 'pants': {
      const y = -0.447;
      return { h: { key: 'waist', y, half: bodyW(y) + p.e * 0.7, z: bodyD(y) + p.e + 0.04 }, v: { key: 'inseam', x: 0, top: -0.74, bottom: -1.4, z: 0.13 } };
    }
    default: {
      const e = p.e + (type === 'hoodie' ? 0.016 : type === 'blazer' || type === 'coat' ? 0.012 : 0);
      const S = topSurface(e);
      const base = { tee: 0.7, longsleeve: 0.68, sweater: 0.68, hoodie: 0.72, shirt: 0.74, blazer: 0.76, coat: 1.0 }[type];
      return { h: { key: 'chest', y: CHEST, half: S.w(CHEST), z: S.d(CHEST) + 0.04 }, v: { key: 'length', x: 0.42, top: 0, bottom: -base * p.len, z: 0.1 } };
    }
  }
}

/* ------------------------------ public API ------------------------------- */

function mergeByTone(list) {
  const byTone = new Map();
  for (const [tone, g] of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(name)) ng.deleteAttribute(name);
    if (!byTone.has(tone)) byTone.set(tone, []);
    byTone.get(tone).push(ng);
  }
  return new Map([...byTone].map(([tone, gs]) => [tone, mergeGeometries(gs)]));
}

const wornCache = new Map();

/**
 * Returns `{ parts: [{ tone, geometry }], dims: { S, M, L } }`. Geometry is the
 * M size, with morph targets [S, L].
 */
export function getWorn(type, variant) {
  const key = `${type}:${variant ?? ''}`;
  if (wornCache.has(key)) return wornCache.get(key);
  const built = Object.fromEntries(['S', 'M', 'L'].map((s) => [s, mergeByTone(BUILDERS[type](SIZE_P[s], variant))]));
  const parts = [...built.M].map(([tone, g]) => {
    g.morphAttributes.position = [built.S.get(tone).attributes.position, built.L.get(tone).attributes.position];
    g.morphAttributes.normal = [built.S.get(tone).attributes.normal, built.L.get(tone).attributes.normal];
    g.computeBoundingSphere();
    g.boundingSphere.radius *= 1.1;
    return { tone, geometry: g };
  });
  const dims = Object.fromEntries(['S', 'M', 'L'].map((s) => [s, dimsFor(type, SIZE_P[s], variant)]));
  const out = { parts, dims };
  wornCache.set(key, out);
  return out;
}

let mannequin;

export function getMannequin() {
  if (mannequin) return mannequin;
  const parts = [
    loft(BODY, at(0.115), at(-0.745), { Vn: 90 }),
    ellipsoid(0.0855, 0.107, 0.096, 0, 0.215, 0.005),
    ellipsoid(0.15, 0.02, 0.098, 0, -0.742, 0, 32, 8),
  ];
  for (const pts of [ARM, mirrorPts(ARM)]) {
    parts.push(tube(pts, armR, { flatten: 0.95 }));
    const end = pts[pts.length - 1];
    parts.push(ellipsoid(0.026, 0.03, 0.024, end.x, end.y, end.z, 16, 12));
    parts.push(ellipsoid(0.044, 0.044, 0.044, pts[0].x, pts[0].y - 0.005, 0, 20, 14));
  }
  for (const pts of [LEG, mirrorPts(LEG)]) {
    parts.push(tube(pts, legR, { flatten: 1 }));
    const end = pts[pts.length - 1];
    parts.push(ellipsoid(0.042, 0.03, 0.09, end.x, end.y - 0.025, 0.035, 20, 12));
  }
  mannequin = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  return mannequin;
}
