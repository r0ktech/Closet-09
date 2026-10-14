import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { WornGarment } from '../three/Garment.jsx';
import { GARMENT_META } from '../three/garments.js';
import { getMannequin, getWorn } from '../three/worn.js';
import { MEASURE_LABELS, SIZES } from '../data/products.js';

const mannequinMat = new THREE.MeshStandardMaterial({ color: '#e6dfd5', roughness: 0.55 });
const SPACING = 0.86;

export default function ProductViewer({ product, color, size, compare, onPickSize }) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, -0.3, 2.6], fov: 30 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.45} color="#fff4e6" />
      <directionalLight position={[1.8, 2.5, 3]} intensity={2.2} color="#fff3e4" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.02} />
      <directionalLight position={[-2.5, 0.5, 1.5]} intensity={0.6} color="#e6ecff" />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={1.4} position={[0, 2, 3]} scale={[5, 2, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#ffe6c8" position={[-3, 0, 1]} rotation-y={Math.PI / 2} scale={[3, 3, 1]} />
      </Environment>

      <Framing product={product} compare={compare} />

      {compare ? (
        SIZES.map((s, i) => (
          <Figure
            key={s}
            product={product}
            color={color}
            size={s}
            x={(i - 1) * SPACING}
            label={{ active: s === size, onPick: () => onPickSize(s) }}
          />
        ))
      ) : (
        <Figure product={product} color={color} size={size} x={0} showDims />
      )}

      <ContactShadows position={[0, -1.46, 0]} opacity={0.35} scale={4} blur={2.6} far={1.5} />
    </Canvas>
  );
}

// Re-frame the camera whenever the product or compare mode changes.
function Framing({ product, compare }) {
  const { camera, size, controls } = useThree();
  const meta = GARMENT_META[product.type];
  useEffect(() => {
    const aspect = size.width / size.height;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const viewH = compare ? 1.95 : meta.viewH;
    const viewW = compare ? SPACING * 3 + 0.2 : 1.4;
    const focusY = compare ? -0.62 : meta.focusY;
    const dist = Math.max(viewH / 2 / tan, viewW / 2 / (tan * aspect));
    camera.position.set(0, focusY + 0.08, dist);
    if (controls) {
      controls.target.set(0, focusY, 0);
      controls.update();
    }
  }, [product, compare, size.width, size.height, controls]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      minAzimuthAngle={-0.75}
      maxAzimuthAngle={0.75}
      minPolarAngle={1.15}
      maxPolarAngle={1.85}
      minDistance={1.1}
      maxDistance={6}
    />
  );
}

function Figure({ product, color, size, x, showDims, label }) {
  const meta = GARMENT_META[product.type];
  const values = product.measurements[size];
  const dims = getWorn(product.type, product.variant).dims[size];

  return (
    <group position-x={x}>
      <mesh geometry={getMannequin()} material={mannequinMat} castShadow receiveShadow />
      <WornGarment type={product.type} variant={product.variant} color={color} size={size} />
      {showDims && <Dims dims={dims} values={values} />}
      {label && (
        <Html position={[0, -1.6, 0]} center zIndexRange={[10, 0]}>
          <button type="button" className={`cmp-label${label.active ? ' is-active' : ''}`} onClick={label.onPick}>
            <strong>{size}</strong>
            <span>
              {MEASURE_LABELS[meta.dims.h.key]} {values[meta.dims.h.key]} cm
            </span>
          </button>
        </Html>
      )}
    </group>
  );
}

const DIM_COLOR = '#8a5a3b';

function Dims({ dims, values }) {
  const { h, v } = dims;
  const tick = 0.025;
  const hz = h.z;
  const vz = v.z;
  const vx = v.x;
  return (
    <group>
      <Line points={[[-h.half, h.y, hz], [h.half, h.y, hz]]} color={DIM_COLOR} lineWidth={1.5} />
      <Line points={[[-h.half, h.y - tick, hz], [-h.half, h.y + tick, hz]]} color={DIM_COLOR} lineWidth={1.5} />
      <Line points={[[h.half, h.y - tick, hz], [h.half, h.y + tick, hz]]} color={DIM_COLOR} lineWidth={1.5} />
      <Html position={[0, h.y + 0.045, hz]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <span className="dim-label">
          {MEASURE_LABELS[h.key]} · {values[h.key]} cm
        </span>
      </Html>

      <Line points={[[vx, v.top, vz], [vx, v.bottom, vz]]} color={DIM_COLOR} lineWidth={1.5} dashed dashSize={0.02} gapSize={0.012} />
      <Line points={[[vx - tick, v.top, vz], [vx + tick, v.top, vz]]} color={DIM_COLOR} lineWidth={1.5} />
      <Line points={[[vx - tick, v.bottom, vz], [vx + tick, v.bottom, vz]]} color={DIM_COLOR} lineWidth={1.5} />
      <Html position={[vx + (vx === 0 ? 0 : 0.03), (v.top + v.bottom) / 2, vz]} center={vx === 0} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <span className={`dim-label${vx === 0 ? '' : ' dim-label--side'}`}>
          {MEASURE_LABELS[v.key]} · {values[v.key]} cm
        </span>
      </Html>
    </group>
  );
}
