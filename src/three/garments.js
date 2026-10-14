import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
 * Procedural garments. Every garment is drawn in its own 2D coordinate space
 * (metres-ish): the neckline/waistband sits at y = 0 and the piece hangs
 * downward. Outlines are extruded with a soft bevel so they read as padded
 * fabric, and trims (ribs, lapels, pockets) are thin extrusions on the front.
 */

const BODY_DEPTH = 0.035;
const BODY_BEVEL = 0.026;
const BODY_OPTS = {
  depth: BODY_DEPTH,
  bevelEnabled: true,
  bevelThickness: BODY_BEVEL,
  bevelSize: 0.016,
  bevelSegments: 5,
  curveSegments: 24,
};
const TRIM_OPTS = {
  depth: 0.003,
  bevelEnabled: true,
  bevelThickness: 0.004,
  bevelSize: 0.003,
  bevelSegments: 2,
  curveSegments: 16,
};

export const FRONT_Z = BODY_DEPTH / 2 + BODY_BEVEL;
const TRIM_Z = FRONT_Z + 0.002;

function extrude(shape, opts = BODY_OPTS, z = 0) {
  const g = new THREE.ExtrudeGeometry(shape, opts);
  g.translate(0, 0, z - opts.depth / 2);
  return g;
}

const trim = (shape, z = TRIM_Z) => extrude(shape, TRIM_OPTS, z);

/**
 * Symmetric outline. Starts at (0, startY), walks down the right side through
 * `segs` (each `{ p, c? }`, `c` = quadratic control point), ends on x = 0, then
 * mirrors the same path back up the left side.
 */
export function mirrored(startY, segs) {
  const s = new THREE.Shape();
  s.moveTo(0, startY);
  for (const seg of segs) {
    if (seg.c) s.quadraticCurveTo(seg.c[0], seg.c[1], seg.p[0], seg.p[1]);
    else s.lineTo(seg.p[0], seg.p[1]);
  }
  const pts = [[0, startY], ...segs.map((seg) => seg.p)];
  for (let i = segs.length - 1; i >= 0; i--) {
    const to = pts[i];
    const seg = segs[i];
    if (seg.c) s.quadraticCurveTo(-seg.c[0], seg.c[1], -to[0], to[1]);
    else s.lineTo(-to[0], to[1]);
  }
  return s;
}

export function poly(points) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

export const flipX = (points) => points.map(([x, y]) => [-x, y]);

export function bar(x1, y1, x2, y2, w) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  return poly([
    [x1 + nx, y1 + ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny],
    [x1 - nx, y1 - ny],
  ]);
}

export function roundedRect(x, y, w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y - r);
  s.lineTo(x + w, y - h + r);
  s.quadraticCurveTo(x + w, y - h, x + w - r, y - h);
  s.lineTo(x + r, y - h);
  s.quadraticCurveTo(x, y - h, x, y - h + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Neckline spec: { neck: half-width at top, dip: depth at centre, cx/cy: control point }
function neckBand(n, t) {
  const s = new THREE.Shape();
  s.moveTo(-n.neck, 0);
  s.quadraticCurveTo(-n.cx, n.cy, 0, -n.dip);
  s.quadraticCurveTo(n.cx, n.cy, n.neck, 0);
  s.lineTo(n.neck + t * 0.9, -t * 0.3);
  s.quadraticCurveTo(n.cx + t * 0.4, n.cy - t, 0, -n.dip - t);
  s.quadraticCurveTo(-n.cx - t * 0.4, n.cy - t, -n.neck - t * 0.9, -t * 0.3);
  s.closePath();
  return s;
}

// The back of the garment seen through the front neckline.
function neckBack(n, rise = 0.014) {
  const s = new THREE.Shape();
  s.moveTo(-n.neck, 0);
  s.quadraticCurveTo(-n.cx, n.cy, 0, -n.dip);
  s.quadraticCurveTo(n.cx, n.cy, n.neck, 0);
  s.quadraticCurveTo(0, rise * 2, -n.neck, 0);
  return s;
}

function teeShape({ w, len, sh, n }) {
  return mirrored(-n.dip, [
    { p: [n.neck, 0], c: [n.cx, n.cy] },
    { p: [sh, -0.035] },
    { p: [sh + 0.135, -0.17], c: [sh + 0.09, -0.07] },
    { p: [sh + 0.07, -0.25] },
    { p: [w - 0.006, -0.19] },
    { p: [w, -len], c: [w - 0.012, -0.45] },
    { p: [0, -len - 0.01], c: [w / 2, -len - 0.015] },
  ]);
}

function longSleeveShape({ w, len, sh, cuffX, n }) {
  return mirrored(-n.dip, [
    { p: [n.neck, 0], c: [n.cx, n.cy] },
    { p: [sh, -0.035] },
    { p: [cuffX, -len + 0.06], c: [sh + 0.09, -0.15] },
    { p: [cuffX - 0.075, -len + 0.035] },
    { p: [w + 0.005, -0.25], c: [w + 0.03, -0.42] },
    { p: [w, -len], c: [w - 0.01, -0.5] },
    { p: [0, -len - 0.01], c: [w / 2, -len - 0.015] },
  ]);
}

function hemBand(w, len, h) {
  const s = new THREE.Shape();
  s.moveTo(-w + 0.002, -len + h);
  s.lineTo(w - 0.002, -len + h);
  s.lineTo(w, -len);
  s.quadraticCurveTo(w / 2, -len - 0.015, 0, -len - 0.01);
  s.quadraticCurveTo(-w / 2, -len - 0.015, -w, -len);
  s.closePath();
  return s;
}

// Cuff ribs for long sleeves, both sides.
function cuffBands({ w, len, sh, cuffX }, h = 0.055) {
  const o = new THREE.Vector2(cuffX, -len + 0.06);
  const i = new THREE.Vector2(cuffX - 0.075, -len + 0.035);
  const up = o.clone().sub(new THREE.Vector2(sh + 0.09, -0.15)).normalize().multiplyScalar(-h);
  const upIn = new THREE.Vector2(w + 0.03, -0.42).sub(i).normalize().multiplyScalar(h);
  const right = [
    [o.x, o.y],
    [i.x, i.y],
    [i.x + upIn.x, i.y + upIn.y],
    [o.x + up.x, o.y + up.y],
  ];
  return [poly(right), poly(flipX(right))];
}

function disc(r, x, y, z, thickness = 0.004) {
  const g = new THREE.CylinderGeometry(r, r, thickness, 18);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function cord(x, y1, y2, z, r = 0.0045) {
  const g = new THREE.CylinderGeometry(r, r, Math.abs(y2 - y1), 8);
  g.translate(x, (y1 + y2) / 2, z);
  return g;
}

/* ------------------------------------------------------------------------ */

const builders = {
  tee() {
    const n = { neck: 0.075, dip: 0.075, cx: 0.065, cy: -0.072 };
    const spec = { w: 0.215, len: 0.7, sh: 0.2, n };
    return [
      ['base', extrude(teeShape(spec))],
      ['shade', trim(neckBand(n, 0.018))],
      ['inner', extrude(neckBack(n), TRIM_OPTS, -0.012)],
    ];
  },

  longsleeve() {
    // Wide boat neck.
    const n = { neck: 0.11, dip: 0.035, cx: 0.09, cy: -0.035 };
    const spec = { w: 0.205, len: 0.68, sh: 0.2, cuffX: 0.345, n };
    return [
      ['base', extrude(longSleeveShape(spec))],
      ['shade', trim(neckBand(n, 0.012))],
      ['inner', extrude(neckBack(n, 0.01), TRIM_OPTS, -0.012)],
      ...stripes(spec),
    ];
  },

  sweater() {
    const n = { neck: 0.075, dip: 0.07, cx: 0.065, cy: -0.068 };
    const spec = { w: 0.215, len: 0.68, sh: 0.205, cuffX: 0.355, n };
    return [
      ['base', extrude(longSleeveShape(spec))],
      ['shade', trim(neckBand(n, 0.026))],
      ['shade', trim(hemBand(spec.w, spec.len, 0.065))],
      ...cuffBands(spec, 0.065).map((s) => ['shade', trim(s)]),
      ['inner', extrude(neckBack(n), TRIM_OPTS, -0.012)],
    ];
  },

  hoodie() {
    const n = { neck: 0.085, dip: 0.06, cx: 0.075, cy: -0.058 };
    const spec = { w: 0.235, len: 0.72, sh: 0.22, cuffX: 0.38, n };
    const hood = mirrored(0.1, [
      { p: [0.14, 0.03], c: [0.135, 0.1] },
      { p: [0.16, -0.14], c: [0.18, -0.04] },
      { p: [0, -0.22], c: [0.12, -0.22] },
    ]);
    const pocket = poly([
      [-0.125, -0.42],
      [0.125, -0.42],
      [0.165, -0.6],
      [-0.165, -0.6],
    ]);
    return [
      ['base', extrude(longSleeveShape(spec))],
      ['shade', extrude(hood, { ...BODY_OPTS, depth: 0.02 }, -0.05)],
      ['shade', trim(neckBand(n, 0.034))],
      ['inner', extrude(neckBack(n, 0.03), TRIM_OPTS, -0.015)],
      ['base', trim(pocket)],
      ['shade', trim(hemBand(spec.w, spec.len, 0.07))],
      ...cuffBands(spec, 0.07).map((s) => ['shade', trim(s)]),
      ['string', cord(-0.045, -0.07, -0.27, TRIM_Z + 0.012)],
      ['string', cord(0.045, -0.07, -0.25, TRIM_Z + 0.012)],
      ['metal', cord(-0.045, -0.27, -0.29, TRIM_Z + 0.012, 0.006)],
      ['metal', cord(0.045, -0.25, -0.27, TRIM_Z + 0.012, 0.006)],
    ];
  },

  shirt() {
    const n = { neck: 0.06, dip: 0.05, cx: 0.05, cy: -0.05 };
    const spec = { w: 0.21, len: 0.74, sh: 0.2, cuffX: 0.34, n };
    const collar = [
      [0.004, -0.05],
      [0.064, 0.006],
      [0.092, -0.008],
      [0.055, -0.118],
    ];
    const parts = [
      ['base', extrude(longSleeveShape(spec))],
      ['base', trim(poly(collar), TRIM_Z + 0.003)],
      ['base', trim(poly(flipX(collar)), TRIM_Z + 0.004)],
      ['shade', extrude(neckBack(n, 0.03), TRIM_OPTS, -0.01)],
      ['shade', trim(bar(0, -0.06, 0, -0.75, 0.034))],
      ['shade', trim(roundedRect(0.065, -0.2, 0.085, 0.1, 0.006))],
      ...cuffBands(spec, 0.075).map((s) => ['shade', trim(s)]),
    ];
    for (let y = -0.13; y > -0.72; y -= 0.11) parts.push(['pearl', disc(0.008, 0, y, TRIM_Z + 0.008)]);
    return parts;
  },

  blazer: () => tailored({ len: 0.76, w: 0.225, double: false }),
  coat: () => tailored({ len: 1.0, w: 0.24, double: true }),

  dress: () => dress({ n: { neck: 0.08, dip: 0.12, cx: 0.07, cy: -0.12 }, wrap: false }),
  wrap: () => dress({ n: { neck: 0.075, dip: 0.27, cx: 0.04, cy: -0.14 }, wrap: true }),

  pants() {
    const legs = mirrored(0, [
      { p: [0.19, 0] },
      { p: [0.215, -0.3], c: [0.218, -0.12] },
      { p: [0.205, -1.0] },
      { p: [0.04, -1.0] },
      { p: [0, -0.32] },
    ]);
    const parts = [
      ['base', extrude(legs)],
      ['shade', trim(poly([[-0.19, 0], [0.19, 0], [0.192, -0.055], [-0.192, -0.055]]))],
      ['shade', trim(bar(0.02, -0.06, 0.02, -0.26, 0.004))],
      ['shade', trim(bar(0.12, -0.06, 0.122, -0.995, 0.004))],
      ['shade', trim(bar(-0.12, -0.06, -0.122, -0.995, 0.004))],
      ['shade', trim(bar(0.205, -0.07, 0.15, -0.06, 0.004))],
      ['shade', trim(bar(-0.205, -0.07, -0.15, -0.06, 0.004))],
      ['metal', disc(0.01, 0.0, -0.028, TRIM_Z + 0.008)],
    ];
    for (const x of [-0.15, -0.06, 0.06, 0.15]) {
      parts.push(['shade', trim(roundedRect(x - 0.008, 0.004, 0.016, 0.07, 0.003), TRIM_Z + 0.004)]);
    }
    return parts;
  },
};

function stripes({ w, len }) {
  const out = [];
  for (let y = -0.16; y > -len + 0.04; y -= 0.075) {
    out.push(['stripe', trim(poly([[-w + 0.004, y], [w - 0.004, y], [w - 0.004, y - 0.03], [-w + 0.004, y - 0.03]]), TRIM_Z - 0.004)]);
  }
  return out;
}

function tailored({ len, w, double }) {
  const n = { neck: 0.07, dip: double ? 0.3 : 0.34, cx: 0.035, cy: double ? -0.15 : -0.17 };
  const spec = { w, len, sh: 0.225, cuffX: 0.37, n };
  const wide = double ? 0.03 : 0;
  const lapel = [
    [0.07, 0],
    [0.105 + wide * 0.5, -0.015],
    [0.13 + wide, -0.12],
    [0.1 + wide, -0.13],
    [0.12 + wide, -0.16],
    [0.012, -n.dip - 0.03],
    [0, -n.dip],
  ];
  const shirtFill = poly([[-0.075, 0.01], [0.075, 0.01], [0, -n.dip - 0.01]]);
  const parts = [
    ['base', extrude(longSleeveShape(spec))],
    ['shade', trim(poly(lapel))],
    ['shade', trim(poly(flipX(lapel)), TRIM_Z + 0.0015)],
    ['shirt', extrude(shirtFill, TRIM_OPTS, -0.005)],
    ['shade', trim(bar(0, -n.dip - 0.02, 0, -len + 0.005, 0.004))],
    ['shade', trim(roundedRect(-0.19, -0.25, 0.09, 0.016, 0.004))],
  ];
  const flapY = double ? -0.66 : -0.52;
  parts.push(['shade', trim(roundedRect(0.075, flapY, 0.12, 0.045, 0.006))]);
  parts.push(['shade', trim(roundedRect(-0.195, flapY, 0.12, 0.045, 0.006))]);
  const rows = double ? [-0.4, -0.52, -0.64] : [-0.42, -0.53];
  for (const y of rows) {
    if (double) {
      parts.push(['horn', disc(0.012, -0.065, y, TRIM_Z + 0.01)]);
      parts.push(['horn', disc(0.012, 0.065, y, TRIM_Z + 0.01)]);
    } else {
      parts.push(['horn', disc(0.012, 0.0, y, TRIM_Z + 0.01)]);
    }
  }
  return parts;
}

function dress({ n, wrap }) {
  const body = mirrored(-n.dip, [
    { p: [n.neck, 0], c: [n.cx, n.cy] },
    { p: [n.neck + 0.035, 0] },
    { p: [0.165, -0.14], c: [0.125, -0.12] },
    { p: [0.15, -0.36], c: [0.17, -0.26] },
    { p: [0.33, -1.0], c: [0.2, -0.62] },
    { p: [0, -1.03], c: [0.17, -1.045] },
  ]);
  const sash = poly([[-0.156, -0.33], [0.156, -0.33], [0.152, -0.39], [-0.152, -0.39]]);
  const parts = [
    ['base', extrude(body)],
    ['inner', extrude(neckBack(n, -0.02), TRIM_OPTS, -0.012)],
    [wrap ? 'base' : 'shade', trim(sash)],
  ];
  if (wrap) {
    parts.push(['shade', trim(bar(-0.12, -0.39, 0.16, -0.98, 0.004))]);
    parts.push(['base', trim(poly([[0.1, -0.385], [0.13, -0.385], [0.16, -0.62], [0.13, -0.625]]), TRIM_Z + 0.006)]);
    parts.push(['base', trim(poly([[0.12, -0.385], [0.145, -0.385], [0.21, -0.57], [0.185, -0.58]]), TRIM_Z + 0.012)]);
    parts.push(['shade', trim(roundedRect(0.095, -0.335, 0.055, 0.06, 0.012), TRIM_Z + 0.008)]);
  }
  return parts;
}

/* ------------------------------------------------------------------------ */

const cache = new Map();

/** Returns `[{ tone, geometry }]`, merged per tone and cached per type. */
export function getGarment(type) {
  if (cache.has(type)) return cache.get(type);
  const byTone = {};
  for (const [tone, g] of builders[type]()) {
    (byTone[tone] ||= []).push(g.index ? g.toNonIndexed() : g);
  }
  const parts = Object.entries(byTone).map(([tone, gs]) => ({
    tone,
    geometry: gs.length === 1 ? gs[0] : mergeGeometries(gs),
  }));
  cache.set(type, parts);
  return parts;
}

/*
 * Per-type metadata:
 *  hanger  – which hanger the piece uses
 *  length  – how far it hangs below y = 0
 *  bodyY   – where y = 0 sits on the mannequin (neck for tops, waist for pants)
 *  focusY / viewH – framing in the detail viewer
 *  dims    – the measurement callouts drawn in the detail viewer
 */
const topDims = (w, len, x, y = -0.27, key = 'chest') => ({
  h: { key, y, half: w },
  v: { key: 'length', x, top: -0.035, bottom: -len },
});

export const GARMENT_META = {
  tee: { hanger: 'top', length: 0.71, bodyY: 0, focusY: -0.3, viewH: 1.15, dims: topDims(0.212, 0.71, 0.27, -0.24) },
  longsleeve: { hanger: 'top', length: 0.69, bodyY: 0, focusY: -0.33, viewH: 1.2, dims: topDims(0.203, 0.69, 0.42) },
  sweater: { hanger: 'top', length: 0.69, bodyY: 0, focusY: -0.33, viewH: 1.2, dims: topDims(0.213, 0.69, 0.43) },
  hoodie: { hanger: 'top', length: 0.73, bodyY: 0, focusY: -0.33, viewH: 1.25, dims: topDims(0.233, 0.73, 0.46) },
  shirt: { hanger: 'top', length: 0.75, bodyY: 0, focusY: -0.35, viewH: 1.25, dims: topDims(0.208, 0.75, 0.42) },
  blazer: { hanger: 'top', length: 0.77, bodyY: 0, focusY: -0.36, viewH: 1.25, dims: topDims(0.223, 0.77, 0.45) },
  coat: { hanger: 'top', length: 1.01, bodyY: 0, focusY: -0.45, viewH: 1.5, dims: topDims(0.238, 1.01, 0.45) },
  dress: {
    hanger: 'top', length: 1.04, bodyY: 0, focusY: -0.5, viewH: 1.5,
    dims: { h: { key: 'waist', y: -0.36, half: 0.15 }, v: { key: 'length', x: 0.38, top: 0, bottom: -1.03 } },
  },
  wrap: {
    hanger: 'top', length: 1.04, bodyY: 0, focusY: -0.5, viewH: 1.5,
    dims: { h: { key: 'waist', y: -0.36, half: 0.15 }, v: { key: 'length', x: 0.38, top: 0, bottom: -1.03 } },
  },
  pants: {
    hanger: 'clip', length: 1.0, bodyY: -0.42, focusY: -0.9, viewH: 1.35,
    dims: { h: { key: 'waist', y: -0.028, half: 0.19 }, v: { key: 'inseam', x: 0, top: -0.32, bottom: -1.0 } },
  },
};

/* ---------------------------- Hangers ----------------------------------- */

const hangerCache = {};

export function getHanger(kind) {
  if (hangerCache[kind]) return hangerCache[kind];
  const V = THREE.Vector3;
  const hook = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new V(0, -0.125, 0),
      new V(0, -0.08, 0),
      new V(-0.008, -0.045, 0),
      new V(-0.025, -0.012, 0),
      new V(-0.018, 0.017, 0),
      new V(0, 0.027, 0),
      new V(0.019, 0.017, 0),
      new V(0.026, -0.004, 0),
      new V(0.02, -0.02, 0),
    ]),
    48,
    0.0035,
    8,
  );
  let wood;
  if (kind === 'clip') {
    wood = new THREE.CylinderGeometry(0.009, 0.009, 0.46, 12);
    wood.rotateZ(Math.PI / 2);
    wood.translate(0, -0.13, 0);
    const clips = [-0.16, 0.16].map((x) => {
      const g = new THREE.BoxGeometry(0.03, 0.05, 0.026);
      g.translate(x, -0.15, 0);
      return g.toNonIndexed();
    });
    hangerCache[kind] = { hook, wood: wood.toNonIndexed(), metal: mergeGeometries(clips) };
  } else {
    wood = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new V(-0.205, -0.172, 0),
        new V(-0.1, -0.14, 0),
        new V(0, -0.128, 0),
        new V(0.1, -0.14, 0),
        new V(0.205, -0.172, 0),
      ]),
      40,
      0.011,
      10,
    );
    const caps = [-0.205, 0.205].map((x) => {
      const g = new THREE.SphereGeometry(0.011, 10, 8);
      g.translate(x, -0.172, 0);
      return g.toNonIndexed();
    });
    hangerCache[kind] = { hook, wood: mergeGeometries([wood.toNonIndexed(), ...caps]), metal: null };
  }
  return hangerCache[kind];
}

export const HANG_OFFSET = { top: -0.125, clip: -0.165 };
