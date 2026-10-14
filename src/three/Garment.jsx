import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getGarment, getHanger } from './garments.js';
import { getWorn } from './worn.js';

let fabricTexture;

// A tiling twill/knit bump texture, generated once and shared by every fabric.
function getFabricTexture() {
  if (fabricTexture) return fabricTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const twill = Math.sin(((x + y) * Math.PI * 2) / 8) * 26;
      const weft = Math.sin((y * Math.PI * 2) / 4) * 10;
      const v = 128 + twill + weft + (Math.random() - 0.5) * 38;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  fabricTexture = new THREE.CanvasTexture(canvas);
  fabricTexture.wrapS = fabricTexture.wrapT = THREE.RepeatWrapping;
  fabricTexture.repeat.set(9, 9);
  fabricTexture.anisotropy = 8;
  return fabricTexture;
}

const WHITE = new THREE.Color('#ffffff');
const NAVY = new THREE.Color('#25314d');
const ECRU = new THREE.Color('#ece5d6');

function makeMaterials() {
  const bumpMap = getFabricTexture();
  const fabric = (o = {}) =>
    new THREE.MeshPhysicalMaterial({
      roughness: 0.86,
      sheen: 1,
      sheenRoughness: 0.65,
      bumpMap,
      bumpScale: 1.4,
      ...o,
    });
  return {
    base: fabric(),
    shade: fabric(),
    panel: fabric(),
    inner: fabric({ roughness: 1 }),
    innerBack: fabric({ roughness: 1, side: THREE.BackSide }),
    stripe: fabric(),
    string: fabric({ roughness: 0.7 }),
    shirt: fabric({ color: '#f1ede6' }),
    pearl: new THREE.MeshStandardMaterial({ color: '#f4f0e8', roughness: 0.25 }),
    horn: new THREE.MeshStandardMaterial({ color: '#2b2320', roughness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: '#c4ab7c', metalness: 1, roughness: 0.32 }),
  };
}

const hsl = {};

function applyColor(m, c) {
  c.getHSL(hsl);
  m.base.color.copy(c);
  m.base.sheenColor.copy(c).lerp(WHITE, 0.45);
  // Trims read a touch darker (or lighter, on very dark fabric).
  m.shade.color.copy(c).multiplyScalar(hsl.l < 0.18 ? 1.45 : 0.82);
  m.shade.sheenColor.copy(m.base.sheenColor);
  m.panel.color.copy(c).multiplyScalar(hsl.l < 0.18 ? 1.18 : 0.94);
  m.panel.sheenColor.copy(m.base.sheenColor);
  m.inner.color.copy(c).multiplyScalar(0.5);
  m.innerBack.color.copy(m.inner.color);
  m.stripe.color.copy(hsl.l > 0.55 ? NAVY : ECRU);
  m.string.color.copy(c).lerp(WHITE, 0.65);
}

// Shared colour handling: materials whose colours ease toward `color`.
function useFabric(color) {
  const mats = useMemo(makeMaterials, []);
  const current = useMemo(() => new THREE.Color(color), []); // eslint-disable-line react-hooks/exhaustive-deps
  const target = useRef(new THREE.Color(color));

  useMemo(() => applyColor(mats, current), [mats, current]);
  useEffect(() => {
    target.current.set(color);
  }, [color]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame((_, dt) => {
    const t = target.current;
    if (Math.abs(current.r - t.r) + Math.abs(current.g - t.g) + Math.abs(current.b - t.b) < 0.002) return;
    current.lerp(t, 1 - Math.exp(-9 * dt));
    applyColor(mats, current);
  });
  return mats;
}

/** A flat garment for the hanger. Colour changes ease in rather than snapping. */
export function Garment({ type, color, shadows = true }) {
  const parts = getGarment(type);
  const mats = useFabric(color);

  return (
    <group>
      {parts.map((p) => (
        <mesh key={p.tone} geometry={p.geometry} material={mats[p.tone]} castShadow={shadows} receiveShadow={shadows} />
      ))}
    </group>
  );
}

const SIZE_WEIGHTS = { S: [1, 0], M: [0, 0], L: [0, 1] };

/** A garment worn on the mannequin; size changes morph between S, M and L. */
export function WornGarment({ type, variant, color, size }) {
  const { parts } = getWorn(type, variant);
  const mats = useFabric(color);
  const meshes = useRef([]);

  const attach = (i) => (m) => {
    meshes.current[i] = m;
    if (m && !m.morphTargetInfluences) {
      m.updateMorphTargets();
      m.morphTargetInfluences.splice(0, 2, ...SIZE_WEIGHTS[size]);
    }
  };

  useFrame((_, dt) => {
    const [ts, tl] = SIZE_WEIGHTS[size];
    const k = 1 - Math.exp(-8 * dt);
    for (const m of meshes.current) {
      const inf = m?.morphTargetInfluences;
      if (!inf) continue;
      inf[0] += (ts - inf[0]) * k;
      inf[1] += (tl - inf[1]) * k;
    }
  });

  let n = 0;
  return (
    <group>
      {parts.map((p) => {
        const front = <mesh key={p.tone} ref={attach(n++)} geometry={p.geometry} material={mats[p.tone]} castShadow receiveShadow />;
        if (p.tone !== 'base') return front;
        // The inside of the garment, visible through the neck, hem and cuffs.
        return [front, <mesh key="inside" ref={attach(n++)} geometry={p.geometry} material={mats.innerBack} receiveShadow />];
      })}
    </group>
  );
}

const woodMat = new THREE.MeshStandardMaterial({ color: '#8a5d3b', roughness: 0.45 });
const hookMat = new THREE.MeshStandardMaterial({ color: '#cdb486', metalness: 1, roughness: 0.28 });

export function Hanger({ kind }) {
  const h = getHanger(kind);
  return (
    <group>
      <mesh geometry={h.hook} material={hookMat} castShadow />
      <mesh geometry={h.wood} material={woodMat} castShadow />
      {h.metal && <mesh geometry={h.metal} material={hookMat} castShadow />}
    </group>
  );
}
