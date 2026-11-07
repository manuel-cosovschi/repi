"use client";
// La sala en 3D (React Three Fiber). Se carga con importación dinámica después del primer pintado y sólo en los niveles
// «high» y «medium» (store.detectQuality). Dibuja el plano, las zonas, los equipos, las personas en movimiento, el QR de la
// recepción y el pedido socio → entrenador. La cámara sigue la toma que piden las escenas (store.stage) con amortiguación.
// Sin texturas ni modelos externos: geometría propia y liviana. Al desmontar, R3F libera el contexto y la GPU.
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FLOOR, GEAR, HERO_RACK, PEOPLE, QR_SPOT, SHOTS, ZONES, along } from "./model";
import { stage, type Quality } from "./store";

const C = { navy: "#0B0F14", floor: "#0F1620", surface: "#1A2433", steel: "#2D3B4F", line: "#4A5D78", edge: "#5A6E8A", cyan: "#00D1FF", teal: "#5DE6D8", white: "#F8FAFC" };
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function lineGeometry(points: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return g;
}

/** Grilla del piso (cada 2 m) y contornos de zonas. */
function Floor() {
  const grid = useMemo(() => {
    const p: number[] = [];
    for (let x = -FLOOR.w / 2; x <= FLOOR.w / 2; x += 2) p.push(x, 0.01, -FLOOR.d / 2, x, 0.01, FLOOR.d / 2);
    for (let z = -FLOOR.d / 2; z <= FLOOR.d / 2; z += 2) p.push(-FLOOR.w / 2, 0.01, z, FLOOR.w / 2, 0.01, z);
    return lineGeometry(p);
  }, []);
  const zones = useMemo(() => ZONES.map((z) => {
    const x0 = z.x - z.w / 2, x1 = z.x + z.w / 2, z0 = z.z - z.d / 2, z1 = z.z + z.d / 2, y = 0.02;
    return { id: z.id, geo: lineGeometry([x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0]) };
  }), []);
  const gridMat = useRef<THREE.LineBasicMaterial>(null);
  const zoneMats = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  const wall = useMemo(() => {
    const w = FLOOR.w / 2, d = FLOOR.d / 2;
    return lineGeometry([-w, 0.02, -d, w, 0.02, -d, w, 0.02, -d, w, 0.02, d, w, 0.02, d, -w, 0.02, d, -w, 0.02, d, -w, 0.02, -d]);
  }, []);
  useFrame(() => {
    const s = stage.get();
    if (gridMat.current) gridMat.current.opacity = 0.55 * s.lit;
    zones.forEach((z, i) => {
      const m = zoneMats.current[i];
      if (!m) return;
      const on = s.focus === z.id;
      m.color.set(on ? C.cyan : C.line);
      m.opacity = s.lit;
    });
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[FLOOR.w + 30, FLOOR.d + 30]} />
        <meshStandardMaterial color={C.floor} roughness={0.95} />
      </mesh>
      {ZONES.map((z) => (
        <mesh key={`f-${z.id}`} rotation-x={-Math.PI / 2} position={[z.x, 0.012, z.z]}><planeGeometry args={[z.w, z.d]} /><meshBasicMaterial color={C.surface} transparent opacity={0.55} /></mesh>
      ))}
      <lineSegments geometry={grid}><lineBasicMaterial ref={gridMat} color={C.steel} transparent opacity={0} /></lineSegments>
      <lineSegments geometry={wall}><lineBasicMaterial color={C.line} transparent opacity={0.9} /></lineSegments>
      {zones.map((z, i) => (
        <lineSegments key={z.id} geometry={z.geo}><lineBasicMaterial ref={(m) => { zoneMats.current[i] = m; }} color={C.steel} transparent opacity={0} /></lineSegments>
      ))}
    </group>
  );
}

/** Equipos: cajas oscuras con bordes; se iluminan cuando su zona está en foco. */
function Gear() {
  const items = useMemo(() => GEAR.map(([x, z, w, d, h]) => {
    const box = new THREE.BoxGeometry(w, h, d);
    const zone = ZONES.find((zn) => Math.abs(x - zn.x) <= zn.w / 2 && Math.abs(z - zn.z) <= zn.d / 2)?.id ?? null;
    return { x, z, h, box, edges: new THREE.EdgesGeometry(box), zone };
  }), []);
  const mats = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  useFrame(() => {
    const s = stage.get();
    items.forEach((it, i) => {
      const m = mats.current[i];
      if (!m) return;
      const on = s.focus != null && it.zone === s.focus;
      m.color.set(on ? C.cyan : C.edge);
      m.opacity = s.lit;
    });
  });
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={[it.x, it.h / 2, it.z]}>
          <mesh geometry={it.box} castShadow><meshStandardMaterial color="#1E2A3A" roughness={0.6} metalness={0.25} /></mesh>
          <lineSegments geometry={it.edges}><lineBasicMaterial ref={(m) => { mats.current[i] = m; }} color={C.steel} transparent opacity={0} /></lineSegments>
        </group>
      ))}
    </group>
  );
}

/** Personas en movimiento (instancias). Socios cian, equipo turquesa. */
function People({ count }: { count: number }) {
  const list = useMemo(() => PEOPLE.slice(0, count), [count]);
  const members = useRef<THREE.InstancedMesh>(null);
  const staff = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const s = stage.get(), t = clock.getElapsedTime();
    let mi = 0, si = 0;
    list.forEach((p, i) => {
      const [x, z] = along(p, t);
      const sc = Math.max(0.001, s.lit);
      dummy.position.set(x, 0.42, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
      if (p.kind === "member") members.current?.setMatrixAt(mi++, dummy.matrix); else staff.current?.setMatrixAt(si++, dummy.matrix);
      dummy.position.set(x, 0.03, z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.setScalar(sc * (1 + 0.15 * Math.sin(t * 2 + i))); dummy.updateMatrix();
      halos.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [members.current, staff.current, halos.current]) if (m) m.instanceMatrix.needsUpdate = true;
  });
  const nm = list.filter((p) => p.kind === "member").length, ns = list.length - nm;
  return (
    <group>
      <instancedMesh ref={members} args={[undefined, undefined, nm]}>
        <capsuleGeometry args={[0.2, 0.42, 4, 10]} />
        <meshStandardMaterial color={C.cyan} emissive={C.cyan} emissiveIntensity={0.9} />
      </instancedMesh>
      <instancedMesh ref={staff} args={[undefined, undefined, ns]}>
        <capsuleGeometry args={[0.22, 0.46, 4, 10]} />
        <meshStandardMaterial color={C.teal} emissive={C.teal} emissiveIntensity={0.8} />
      </instancedMesh>
      <instancedMesh ref={halos} args={[undefined, undefined, list.length]}>
        <ringGeometry args={[0.42, 0.5, 32]} />
        <meshBasicMaterial color={C.cyan} transparent opacity={0.35} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}

/** QR de la sede en la recepción y el pedido socio → entrenador (un pulso que viaja y vuelve con «Voy»). */
function Signals() {
  const pulse = useRef<THREE.Mesh>(null);
  const trail = useRef<THREE.Line>(null);
  const qr = useRef<THREE.Mesh>(null);
  const from = new THREE.Vector3(HERO_RACK[0], 0.6, HERO_RACK[1] + 1.2), to = new THREE.Vector3(-14.5, 0.6, -4.5);
  const mid = new THREE.Vector3((from.x + to.x) / 2, 3.2, (from.z + to.z) / 2);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(from, mid, to), []); // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), [curve]);
  useFrame(({ clock }) => {
    const s = stage.get();
    if (pulse.current && trail.current) {
      const on = s.request != null;
      pulse.current.visible = on; trail.current.visible = on;
      if (on) {
        const u = s.request! < 0.5 ? s.request! * 2 : 2 - s.request! * 2; // ida (pedido) y vuelta («Voy»)
        pulse.current.position.copy(curve.getPoint(Math.min(1, Math.max(0, u))));
        (pulse.current.material as THREE.MeshBasicMaterial).color.set(s.request! < 0.5 ? C.cyan : C.teal);
      }
    }
    if (qr.current) (qr.current.material as THREE.MeshBasicMaterial).opacity = s.lit * (0.55 + 0.45 * Math.abs(Math.sin(clock.getElapsedTime() * 1.6)));
  });
  return (
    <group>
      <mesh ref={pulse} visible={false}><sphereGeometry args={[0.32, 16, 16]} /><meshBasicMaterial color={C.cyan} /></mesh>
      {/* @ts-expect-error: <line> de three, no el SVG */}
      <line ref={trail} geometry={geo} visible={false}><lineBasicMaterial color={C.cyan} transparent opacity={0.6} /></line>
      <mesh ref={qr} position={[QR_SPOT[0], 1.3, QR_SPOT[1]]}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial color={C.cyan} transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Onda del punto cian al caer sobre la sala (hero). */
function Drop() {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = stage.get();
    if (!ring.current) return;
    const k = Math.min(1, s.lit * 1.4);
    ring.current.scale.setScalar(0.5 + k * 30);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
    ring.current.visible = k < 0.999 && s.lit > 0;
  });
  return <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}><ringGeometry args={[0.9, 1, 64]} /><meshBasicMaterial color={C.cyan} transparent opacity={0} /></mesh>;
}

/** Cámara: mezcla entre las tomas a y b según t, con amortiguación (y un leve paralaje con el mouse en escritorio). */
function Rig({ parallax }: { parallax: boolean }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const goalPos = useMemo(() => new THREE.Vector3(), []), goalLook = useMemo(() => new THREE.Vector3(), []);
  const mouse = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!parallax) return;
    const on = (e: PointerEvent) => { mouse.current.x = e.clientX / window.innerWidth - 0.5; mouse.current.y = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, [parallax]);
  useFrame((_, dt) => {
    const s = stage.get(), A = SHOTS[s.a], B = SHOTS[s.b], k = ease(Math.min(1, Math.max(0, s.t)));
    goalPos.set(A.pos[0] + (B.pos[0] - A.pos[0]) * k + mouse.current.x * 1.2, A.pos[1] + (B.pos[1] - A.pos[1]) * k - mouse.current.y * 0.8, A.pos[2] + (B.pos[2] - A.pos[2]) * k);
    goalLook.set(A.look[0] + (B.look[0] - A.look[0]) * k, A.look[1] + (B.look[1] - A.look[1]) * k, A.look[2] + (B.look[2] - A.look[2]) * k);
    const damp = 1 - Math.exp(-dt * 3.2);
    camera.position.lerp(goalPos, damp);
    look.current.lerp(goalLook, damp);
    camera.lookAt(look.current);
  });
  return null;
}

/** Deja de dibujar cuando una sección sólida tapa la sala o la pestaña no se ve. */
function Pauser() {
  const { setFrameloop } = useThree();
  useEffect(() => {
    const upd = () => setFrameloop(stage.get().hidden || document.hidden ? "never" : "always");
    const off = stage.subscribe(upd);
    document.addEventListener("visibilitychange", upd);
    upd();
    return () => { off(); document.removeEventListener("visibilitychange", upd); };
  }, [setFrameloop]);
  return null;
}

export default function SalaCanvas({ quality }: { quality: Quality }) {
  const high = quality === "high";
  return (
    <Canvas className="sala-canvas" dpr={high ? [1, 2] : [1, 1.5]} shadows={high} gl={{ antialias: high, powerPreference: high ? "high-performance" : "low-power", alpha: false }}
      camera={{ fov: 38, near: 0.1, far: 200, position: SHOTS.dark.pos }} aria-hidden="true">
      <color attach="background" args={[C.navy]} />
      <fog attach="fog" args={[C.navy, 45, 130]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[12, 30, 14]} intensity={1.1} castShadow={high} shadow-mapSize={[1024, 1024]} />
      <hemisphereLight args={[C.teal, C.navy, 0.25]} />
      <Floor />
      <Gear />
      <People count={high ? PEOPLE.length : 9} />
      <Signals />
      <Drop />
      <Rig parallax={high} />
      <Pauser />
    </Canvas>
  );
}
