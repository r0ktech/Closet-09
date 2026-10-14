import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Html, Lightformer, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { Garment, Hanger } from '../three/Garment.jsx';
import { GARMENT_META, HANG_OFFSET } from '../three/garments.js';

const RAIL_Y = 0.62;
const RAIL_L = -2.05;
const RAIL_R = 2.05;
const MIN_GAP = 0.17; // hangers packed shoulder-to-shoulder
const OPEN_GAP = 0.5; // room the focused piece gets so it can turn to face you
const RACK_ANGLE = -1.0; // packed clothes are turned mostly side-on
const FACE_ANGLE = -0.06;
const DRAG_THRESHOLD = 6; // px before a press becomes a shove instead of a click

const WALNUT = '#5a3b27';
const PANEL = '#e4d9c9';

export default function ClosetScene({ products, colorFor, onSelect, onHover, controlRef }) {
  return (
    <>
      <color attach="background" args={['#ebe4da']} />
      <fog attach="fog" args={['#ebe4da', 7, 14]} />
      <ambientLight intensity={0.35} color="#fff3e2" />
      <hemisphereLight args={['#fff6ea', '#8a7460', 0.55]} />
      <directionalLight
        position={[2.2, 3.6, 4.2]}
        intensity={2.1}
        color="#fff1df"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
      />
      <pointLight position={[0, 0.84, 0.25]} intensity={2.2} distance={3.5} decay={2} color="#ffd9a8" />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={1.6} color="#fff4e6" position={[0, 3, 3]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#ffe2c0" position={[-4, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#ffffff" position={[4, 0, 2]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
      </Environment>

      <Wardrobe />
      <Rack products={products} colorFor={colorFor} onSelect={onSelect} onHover={onHover} controlRef={controlRef} />
    </>
  );
}

/* ------------------------------ The rack -------------------------------- */

function Rack({ products, colorFor, onSelect, onHover, controlRef }) {
  const { camera, gl, size } = useThree();
  const n = products.length;
  const groups = useRef([]);
  const tagRef = useRef();
  const [hovered, setHovered] = useState(-1);
  const hoveredRef = useRef(-1);
  const gapsRef = useRef([]);

  const metas = useMemo(() => products.map((p) => GARMENT_META[p.type]), [products]);

  const sim = useMemo(() => {
    const spacing = Math.min(0.3, (RAIL_R - RAIL_L - 0.4) / Math.max(1, n - 1));
    const start = (-spacing * (n - 1)) / 2;
    return products.map((_, i) => {
      const x = start + i * spacing;
      return { x, rest: x, v: 0, prevV: 0, theta: 0, omega: 0, rotY: RACK_ANGLE, z: 0 };
    });
  }, [products, n]);

  const input = useRef({
    ndc: new THREE.Vector2(9, 9),
    x: 0,
    y: 0,
    inside: false,
    down: false,
    downAt: [0, 0],
    pressed: -1,
    drag: -1,
    grabOffset: 0,
    moved: false,
    mode: 'pointer',
    focus: Math.floor(n / 2),
    hovered: -1,
    lastShove: -10,
    camX: 0,
  });

  const ray = useMemo(() => ({ caster: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit: new THREE.Vector3() }), []);

  // Project the pointer onto the plane of the rail.
  const updateWorld = () => {
    const inp = input.current;
    ray.caster.setFromCamera(inp.ndc, camera);
    if (ray.caster.ray.intersectPlane(ray.plane, ray.hit)) {
      inp.x = ray.hit.x;
      inp.y = ray.hit.y;
    }
  };

  // Which garment is under the pointer (by rail position + its hanging length).
  const pick = () => {
    const inp = input.current;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const bottom = RAIL_Y + HANG_OFFSET[metas[i].hanger] - metas[i].length - 0.03;
      if (inp.y > RAIL_Y + 0.04 || inp.y < bottom) continue;
      const d = Math.abs(sim[i].x - inp.x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const reach = best === inp.hovered ? 0.34 : 0.28;
    if (bestD > reach) return -1;
    // A little hysteresis so the focus doesn't flicker between neighbours.
    const cur = inp.hovered;
    if (cur >= 0 && best !== cur && Math.abs(sim[cur].x - inp.x) < bestD + 0.05 && Math.abs(sim[cur].x - inp.x) < reach) return cur;
    return best;
  };

  useEffect(() => {
    const el = gl.domElement;
    const inp = input.current;
    el.style.touchAction = 'none';

    const setNdc = (e) => {
      const r = el.getBoundingClientRect();
      inp.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const move = (e) => {
      setNdc(e);
      inp.mode = 'pointer';
      updateWorld();
      inp.inside = true;
      if (inp.down && !inp.moved) {
        const dx = e.clientX - inp.downAt[0];
        const dy = e.clientY - inp.downAt[1];
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          inp.moved = true;
          if (inp.pressed >= 0) {
            inp.drag = inp.pressed;
            inp.grabOffset = sim[inp.drag].x - inp.x;
          }
        }
      }
    };
    const down = (e) => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      setNdc(e);
      updateWorld();
      inp.mode = 'pointer';
      inp.inside = true;
      inp.down = true;
      inp.moved = false;
      inp.downAt = [e.clientX, e.clientY];
      inp.pressed = pick();
      inp.hovered = inp.pressed;
    };
    const up = (e) => {
      if (!inp.down) return;
      inp.down = false;
      if (!inp.moved && inp.pressed >= 0) onSelect(inp.pressed);
      if (inp.drag >= 0) inp.lastShove = performance.now() / 1000;
      inp.drag = -1;
      inp.pressed = -1;
      if (e.pointerType !== 'mouse') inp.inside = false;
    };
    const leave = () => {
      if (!inp.down) inp.inside = false;
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
      el.style.cursor = '';
    };
  }, [gl, camera, n, onSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard / button control from the page.
  useEffect(() => {
    const inp = input.current;
    controlRef.current = {
      step(d) {
        inp.mode = 'key';
        const from = inp.hovered >= 0 ? inp.hovered : inp.focus;
        inp.focus = Math.max(0, Math.min(n - 1, from + d));
      },
      select() {
        const i = inp.hovered >= 0 ? inp.hovered : inp.focus;
        if (i >= 0) onSelect(i);
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, n, onSelect]);

  useFrame((state, rawDt) => {
    if (rawDt <= 0) return;
    const dt = Math.min(rawDt, 1 / 30);
    const inp = input.current;
    const now = state.clock.elapsedTime;
    if (inp.mode === 'pointer') updateWorld();

    // --- who is in focus
    let h = -1;
    if (inp.drag >= 0) h = -1;
    else if (inp.mode === 'pointer') h = inp.inside ? pick() : -1;
    else h = inp.focus;
    inp.hovered = h;
    if (h !== hoveredRef.current) {
      hoveredRef.current = h;
      setHovered(h);
      onHover(h);
    }

    // --- 1D rail physics: hangers can't pass through each other
    // Gaps ease open/closed so a hover parts the clothes instead of flinging them.
    const gaps = gapsRef.current;
    const gk = 1 - Math.exp(-6 * dt);
    for (let i = 0; i < n - 1; i++) {
      const want = h >= 0 && (i === h || i + 1 === h) ? OPEN_GAP : MIN_GAP;
      gaps[i] = (gaps[i] ?? MIN_GAP) + (want - (gaps[i] ?? MIN_GAP)) * gk;
    }
    const g = inp.drag;
    const prev = sim.map((s) => s.x);
    const sinceShove = performance.now() / 1000 - inp.lastShove;
    const settle = g >= 0 ? 0 : THREE.MathUtils.clamp((sinceShove - 2.5) / 2, 0, 1) * 1.1;

    for (let i = 0; i < n; i++) {
      const s = sim[i];
      s.v *= Math.exp(-5 * dt);
      s.v += (s.rest - s.x) * settle * dt;
      s.x += s.v * dt;
    }
    if (g >= 0) {
      let lo = RAIL_L;
      let hi = RAIL_R;
      for (let i = 0; i < g; i++) lo += gaps[i];
      for (let i = g; i < n - 1; i++) hi -= gaps[i];
      const target = THREE.MathUtils.clamp(inp.x + inp.grabOffset, lo, hi);
      sim[g].x = prev[g] + (target - prev[g]) * (1 - Math.exp(-30 * dt));
    }
    for (let iter = 0; iter < 8; iter++) {
      for (let i = 0; i < n - 1; i++) {
        const a = sim[i];
        const b = sim[i + 1];
        const c = gaps[i] - (b.x - a.x);
        if (c <= 0) continue;
        if (i === g) b.x += c;
        else if (i + 1 === g) a.x -= c;
        else {
          a.x -= c / 2;
          b.x += c / 2;
        }
      }
      if (g !== 0) sim[0].x = Math.max(sim[0].x, RAIL_L);
      if (g !== n - 1) sim[n - 1].x = Math.min(sim[n - 1].x, RAIL_R);
    }

    for (let i = 0; i < n; i++) {
      const s = sim[i];
      s.v = THREE.MathUtils.clamp((s.x - prev[i]) / dt, -4, 4);
      // Pendulum driven by the hook's acceleration along the rail.
      const acc = THREE.MathUtils.clamp((s.v - s.prevV) / dt, -18, 18);
      s.prevV = s.v;
      s.omega += (-22 * s.theta - 1.6 * acc - 3.2 * s.omega) * dt;
      s.theta = THREE.MathUtils.clamp(s.theta + s.omega * dt, -0.55, 0.55);

      const facing = i === h;
      const k = 1 - Math.exp(-7 * dt);
      s.rotY += ((facing ? FACE_ANGLE : RACK_ANGLE) - s.rotY) * k;
      s.z += ((facing ? 0.17 : 0) - s.z) * k;

      const grp = groups.current[i];
      if (grp) {
        grp.position.set(s.x, RAIL_Y, s.z);
        grp.rotation.set(0, s.rotY, s.theta, 'ZYX');
      }
    }

    // Price tag follows the focused piece.
    if (tagRef.current && h >= 0) {
      const m = metas[h];
      tagRef.current.position.set(sim[h].x, RAIL_Y + HANG_OFFSET[m.hanger] - m.length - 0.07, sim[h].z + 0.12);
    }

    // --- camera: gentle parallax on wide screens, follow the focus on narrow ones
    const aspect = size.width / size.height;
    const dist = aspect >= 1.5 ? 4.15 : aspect >= 1 ? 4.7 : 5.6;
    const focusX = h >= 0 ? sim[h].x : g >= 0 ? sim[g].x : inp.camX;
    let tx;
    if (aspect < 1.3) {
      inp.camX = THREE.MathUtils.clamp(focusX, -1.5, 1.5);
      tx = inp.camX;
    } else {
      tx = (inp.mode === 'pointer' && inp.inside ? inp.ndc.x : 0) * 0.18;
    }
    const ty = 0.05 + (inp.inside ? inp.ndc.y : 0) * 0.04;
    const ck = 1 - Math.exp(-3 * dt);
    camera.position.x += (tx - camera.position.x) * ck;
    camera.position.y += (ty - camera.position.y) * ck;
    camera.position.z += (dist - camera.position.z) * ck;
    camera.lookAt(camera.position.x * 0.85, -0.12, 0);

    gl.domElement.style.cursor = g >= 0 ? 'grabbing' : h >= 0 && inp.mode === 'pointer' ? 'grab' : 'default';
  });

  return (
    <group>
      {products.map((p, i) => {
        const meta = metas[i];
        return (
          <group key={p.id} ref={(el) => (groups.current[i] = el)}>
            <Hanger kind={meta.hanger} />
            <group position-y={HANG_OFFSET[meta.hanger]}>
              <Garment type={p.type} color={colorFor(p).hex} />
            </group>
          </group>
        );
      })}
      <group ref={tagRef}>
        {hovered >= 0 && products[hovered] && (
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="hang-tag" key={products[hovered].id}>
              <span className="hang-tag__name">{products[hovered].name}</span>
              <span className="hang-tag__price">${products[hovered].price}</span>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

/* ------------------------------ Wardrobe -------------------------------- */

const walnutMat = new THREE.MeshStandardMaterial({ color: WALNUT, roughness: 0.55 });
const walnutDark = new THREE.MeshStandardMaterial({ color: '#46301f', roughness: 0.6 });
const panelMat = new THREE.MeshStandardMaterial({ color: PANEL, roughness: 0.9 });
const brassMat = new THREE.MeshStandardMaterial({ color: '#c9a66b', metalness: 1, roughness: 0.25 });

const FOLDED = [
  ['#d6c4a4', '#7d2f35', '#2f4a3a', '#cfc8bc'],
  ['#27324a', '#b5603f', '#e9e2d4'],
  ['#98a487', '#3b3b3e', '#e6c5c2', '#a9a7a2'],
];

function Wardrobe() {
  const W = 4.6;
  return (
    <group>
      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.3, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#d9cfc1" roughness={0.95} />
      </mesh>
      {/* back panel with vertical boards */}
      <mesh position={[0, 0, -0.52]} receiveShadow material={panelMat}>
        <boxGeometry args={[W, 2.4, 0.04]} />
      </mesh>
      {Array.from({ length: 11 }, (_, i) => (
        <mesh key={i} position={[-W / 2 + (i + 1) * (W / 12), 0, -0.497]} material={panelMat} receiveShadow>
          <boxGeometry args={[0.006, 2.4, 0.006]} />
        </mesh>
      ))}
      {/* carcass */}
      <mesh position={[-W / 2 - 0.04, -0.05, -0.02]} material={walnutMat} castShadow receiveShadow>
        <boxGeometry args={[0.08, 2.55, 1.04]} />
      </mesh>
      <mesh position={[W / 2 + 0.04, -0.05, -0.02]} material={walnutMat} castShadow receiveShadow>
        <boxGeometry args={[0.08, 2.55, 1.04]} />
      </mesh>
      <mesh position={[0, 1.2, -0.02]} material={walnutMat} castShadow receiveShadow>
        <boxGeometry args={[W + 0.16, 0.08, 1.04]} />
      </mesh>
      {/* drawer base */}
      <mesh position={[0, -1.13, -0.02]} material={walnutMat} receiveShadow castShadow>
        <boxGeometry args={[W, 0.34, 1.0]} />
      </mesh>
      {[-1.15, 0, 1.15].map((x) => (
        <group key={x} position={[x * 1.33, -1.13, 0.49]}>
          <mesh material={walnutDark} receiveShadow>
            <boxGeometry args={[1.48, 0.26, 0.02]} />
          </mesh>
          <mesh position={[0, 0.04, 0.02]} rotation-z={Math.PI / 2} material={brassMat}>
            <cylinderGeometry args={[0.009, 0.009, 0.28, 12]} />
          </mesh>
        </group>
      ))}
      {/* shelf */}
      <mesh position={[0, 0.9, -0.05]} material={walnutMat} castShadow receiveShadow>
        <boxGeometry args={[W, 0.04, 0.92]} />
      </mesh>
      <mesh position={[0, 0.874, 0.36]}>
        <boxGeometry args={[W - 0.1, 0.008, 0.02]} />
        <meshStandardMaterial color="#fff1d6" emissive="#ffd9a3" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      {FOLDED.map((stack, si) => (
        <group key={si} position={[-1.55 + si * 1.45, 0.92, -0.08]}>
          {stack.map((c, i) => (
            <RoundedBox key={i} args={[0.5 - i * 0.012, 0.062, 0.36]} radius={0.025} smoothness={3} position={[(i % 2) * 0.012, 0.031 + i * 0.062, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={c} roughness={0.92} />
            </RoundedBox>
          ))}
        </group>
      ))}
      <mesh position={[1.75, 1.0, -0.12]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.17, 40]} />
        <meshStandardMaterial color="#c9b8a0" roughness={0.8} />
      </mesh>
      {/* rail */}
      <mesh position={[0, RAIL_Y, 0]} rotation-z={Math.PI / 2} material={brassMat} castShadow>
        <cylinderGeometry args={[0.016, 0.016, W, 24]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 - 0.02), RAIL_Y, 0]} rotation-z={Math.PI / 2} material={brassMat}>
          <cylinderGeometry args={[0.04, 0.04, 0.04, 24]} />
        </mesh>
      ))}
      {/* a pair of shoe boxes on the floor of the closet */}
      {[0, 1].map((i) => (
        <mesh key={i} position={[-1.75 + i * 0.04, -0.9 + i * 0.12, -0.15]} castShadow receiveShadow>
          <boxGeometry args={[0.46, 0.12, 0.3]} />
          <meshStandardMaterial color={i ? '#b9a78f' : '#2f2b28'} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}
