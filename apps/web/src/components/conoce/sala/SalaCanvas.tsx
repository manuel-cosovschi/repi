"use client";
// La sala en 3D (React Three Fiber) · Experience 4.0 «The Living Gym» (docs/comercial/EXPERIENCE_4.md). Se carga con
// importación dinámica después del primer pintado y sólo en los niveles «high» y «medium» (store.detectQuality).
// En 4.0 la sala deja de ser un plano lejano y pasa a ser un lugar: jaulas, bancos, máquinas y cintas a escala real, paredes
// al fondo y a los costados, divisiones de vidrio, la pantalla de REPI Control en la recepción (con la captura real de la
// rutina), las pantallas del equipo y de la oficina, personas con cuerpo y cabeza (Valentina hace press de banca y la barra
// sube y baja; Julián hace sentadillas), sombras de contacto y luz por zona. La cámara viaja en arco entre tomas (órbita
// alrededor del punto de mira, no una línea recta), con lente propia por toma, y respira apenas cuando nadie hace scroll.
// «Del plano a la sala» (apertura): el 3D entra en la cenital `plan`, con el mismo encuadre que el SVG y los equipos sin
// altura; la cámara baja en grúa y la sala se levanta desde el punto donde cayó el punto de la «ı».
// La red de la sala (`flow`), los pulsos (`pings`) y el pedido socio → entrenador (`request`) muestran por dónde viaja lo
// que se registra. Sin modelos externos ni sombras proyectadas: geometría propia unida por tipo e instanciada (≈ 30 llamadas
// de dibujo) y sombras de contacto con una textura generada. Colores planos (`flat`, sin tone mapping): el cian y el turquesa
// son los de la marca. Si WebGL falla o se pierde el contexto, queda el SVG (Stage). Al desmontar, R3F libera la GPU.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COACH_SCREEN, FLOOR, FOV, GEAR, GEAR_KIND, JULIAN, KIOSK, LINKS, OFFICE_SCREEN, PEOPLE, QR_SPOT, SHOTS, SVG_S, VALENTINA, ZONES, gatherGrow, isNarrow, lensPx, linkAt, placePerson, svgFit, type GearKind, type Shot, type ShotId, type ZoneId } from "./model";
import { pings, pointer, stage, type Quality } from "./store";

// Paleta: una sola fuente, los tokens --x-* de styles/conoce3.css. Se lee una vez al montar (three.js no entiende var()).
const TOKENS = { navy: "--x-navy", floor: "--x-floor", surface: "--x-surface", steel: "--x-steel", line: "--x-plan", edge: "--x-edge", gear: "--x-gear", cyan: "--x-cyan", teal: "--x-teal", white: "--x-white", muted: "--x-muted" } as const;
const C = {} as Record<keyof typeof TOKENS, string>;
function readPalette() {
  const cs = getComputedStyle(document.querySelector(".x3") ?? document.documentElement);
  for (const [k, v] of Object.entries(TOKENS)) C[k as keyof typeof TOKENS] = cs.getPropertyValue(v).trim() || "gray";
}
/** Tonos de los equipos, derivados de la paleta (acero y navy): estructura, tapizado, metal y contrapesos. */
const TONE = { frame: "#33455C", pad: "#1C2838", metal: "#7C8FA8", dark: "#141D2A", top: "#2A3A50", wall: "#121A26" } as const;

// Luces (constantes: las personas calculan con ellas su color para que el lado iluminado sea el cian exacto de la marca).
const AMBIENT = 0.9, KEY = 1.25;

/** Tiempo de la escena: avanza con cada cuadro salvo cuando la persona pausó las animaciones. Es propio (no el reloj de R3F,
 *  que se reinicia al cambiar el modo de dibujo), así las personas siguen donde estaban al volver a mostrarse. */
const sceneTime = { t: 0 };
/** «Del plano a la sala»: cuánto se levantó la sala (0 = plano sin altura, 1 = sala entera). Lo mueve la cámara (Rig). */
const build = { v: 1 };
function Clock() {
  useFrame((_, dt) => { if (!stage.get().paused) sceneTime.t += Math.min(dt, 0.1); });
  return null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x); };
const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

/** Cuánto se ve el plano (piso, zonas, equipos) durante la vuelta al punto: 1 → 0, igual que el SVG. */
function planFade(gather: number) { const x = clamp01(gather / 0.9); return 1 - x * x * (3 - 2 * x); }
/** Cuánto se levantó un equipo: la sala crece desde donde cayó el punto (Valentina) hacia afuera. */
function riseAt(x: number, z: number) {
  if (build.v >= 1) return 1;
  const d = Math.hypot(x - VALENTINA[0], z - VALENTINA[1]) / 24;
  return easeOut((build.v * 1.5 - d * 0.5) / 1);
}

function lineGeometry(points: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return g;
}
/** Una pieza con su color en los vértices (para unir todas las piezas de un equipo en una sola geometría y un solo material). */
function part(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.Float32BufferAttribute(arr, 3));
  g.deleteAttribute("uv");
  return g;
}
const bx = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => part(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
const join = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts, false)!; parts.forEach((p) => p.dispose()); return g; };

/** Textura radial generada (blanco al centro, transparente al borde): luz por zona, sombras de contacto y brillos. */
function radialTexture(stops: [number, string][]) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Degradé vertical de las paredes: algo de luz del piso abajo y navy arriba (se funden con el fondo). */
function wallTexture() {
  const c = document.createElement("canvas"); c.width = 4; c.height = 128;
  const g = c.getContext("2d")!, grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, "#1B2636"); grad.addColorStop(0.5, "#131C29"); grad.addColorStop(1, "#0C1118");
  g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── Geometría de cada tipo de equipo (origen en el piso, en el centro de su planta) ──────────────────────────────────
/** Dónde queda el centro de la jaula de sentadilla respecto de su planta (la persona entrena adentro, 1,4 m al frente). */
const SQUAT_Z = 1.4;
/** Soportes del banco respecto del centro de quien está acostado (la cabeza queda del lado de los soportes). */
const BENCH_UP = -0.72;
function gearGeometry(kind: GearKind, w: number, d: number): THREE.BufferGeometry {
  const F = TONE.frame, P = TONE.pad, M = TONE.metal, D = TONE.dark, T = TONE.top;
  switch (kind) {
    case "squat": {
      const z0 = SQUAT_Z, ps: THREE.BufferGeometry[] = [bx(2.1, 0.05, 2.1, D, 0, 0.025, z0)];
      for (const sx of [-0.62, 0.62]) for (const sz of [-0.6, 0.6]) ps.push(bx(0.08, 2.3, 0.08, F, sx, 1.15, z0 + sz));
      for (const sz of [-0.6, 0.6]) ps.push(bx(1.32, 0.08, 0.08, F, 0, 2.3, z0 + sz));
      for (const sx of [-0.62, 0.62]) ps.push(bx(0.08, 0.08, 1.28, F, sx, 2.3, z0), bx(0.05, 0.05, 1.2, M, sx, 0.62, z0), bx(0.3, 0.06, 1.4, F, sx, 0.03, z0));
      return join(ps);
    }
    case "bench": {
      // Soportes de la barra a 0,48 m de la planta y el banco hacia el frente: quien entrena queda acostado a 1,2 m (VALENTINA).
      const up = 1.2 + BENCH_UP, ps: THREE.BufferGeometry[] = [bx(1.9, 0.04, 2.6, D, 0, 0.02, 1.0)];
      for (const sx of [-0.58, 0.58]) ps.push(bx(0.08, 1.12, 0.08, F, sx, 0.56, up), bx(0.1, 0.1, 0.14, M, sx, 1.02, up + 0.07), bx(0.28, 0.05, 0.9, F, sx, 0.03, up + 0.2));
      ps.push(bx(1.24, 0.07, 0.07, F, 0, 0.3, up));
      ps.push(bx(0.32, 0.1, 1.34, P, 0, 0.44, 1.2 - 0.02), bx(0.06, 0.38, 0.06, F, 0, 0.2, 0.7), bx(0.3, 0.38, 0.06, F, 0, 0.2, 1.74));
      return join(ps);
    }
    case "machine": {
      const ps = [
        bx(0.95, 0.1, 1.55, F, 0, 0.05, 0), bx(0.6, 1.78, 0.3, F, 0, 0.89, -0.56), bx(0.42, 1.15, 0.08, M, 0, 0.75, -0.39),
        bx(0.44, 0.1, 0.44, P, 0, 0.5, 0.26), bx(0.42, 0.62, 0.09, P, 0, 0.9, 0.0, -0.18), bx(0.06, 0.44, 0.06, F, 0, 0.26, 0.26),
        bx(0.06, 0.06, 0.62, M, -0.34, 1.12, 0.14), bx(0.06, 0.06, 0.62, M, 0.34, 1.12, 0.14), bx(0.74, 0.06, 0.06, F, 0, 1.72, -0.3),
      ];
      return join(ps);
    }
    case "treadmill": {
      const ps = [
        bx(0.86, 0.2, 1.95, F, 0, 0.1, 0), bx(0.6, 0.02, 1.5, D, 0, 0.21, 0.12),
        bx(0.06, 1.2, 0.06, F, -0.38, 0.78, -0.82, 0.12), bx(0.06, 1.2, 0.06, F, 0.38, 0.78, -0.82, 0.12),
        bx(0.86, 0.32, 0.12, T, 0, 1.36, -0.9, -0.5), bx(0.05, 0.05, 0.7, M, -0.38, 1.02, -0.5), bx(0.05, 0.05, 0.7, M, 0.38, 1.02, -0.5),
      ];
      return join(ps);
    }
    case "counter":
      return join([bx(w, 0.98, d * 0.8, F, 0, 0.49, 0), bx(w + 0.14, 0.06, d, T, 0, 1.01, 0), bx(w, 0.12, d * 0.8 + 0.02, D, 0, 0.06, 0)]);
    default:
      return join([bx(w, 0.06, d, T, 0, 0.75, 0), bx(0.08, 0.75, d * 0.9, F, -w / 2 + 0.1, 0.375, 0), bx(0.08, 0.75, d * 0.9, F, w / 2 - 0.1, 0.375, 0), bx(w * 0.9, 0.4, 0.05, D, 0, 0.5, -d / 2 + 0.1)]);
  }
}
/** La barra con sus discos (a lo ancho, eje x), con el centro en el origen. */
function barbellGeometry() {
  const ps = [part(new THREE.CylinderGeometry(0.02, 0.02, 2.05, 8), TONE.metal, 0, 0, 0, 0, 0, Math.PI / 2)];
  for (const s of [-1, 1]) {
    ps.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 20), TONE.dark, s * 0.82, 0, 0, 0, 0, Math.PI / 2));
    ps.push(part(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20), "#24344A", s * 0.88, 0, 0, 0, 0, Math.PI / 2));
    ps.push(part(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), TONE.metal, s * 0.94, 0, 0, 0, 0, Math.PI / 2));
  }
  return join(ps);
}

/** Material con el color de los vértices, apagable hacia el fondo en la vuelta al punto. */
function useFadeMat() {
  const m = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

/** Piso, zonas, grilla, paredes y divisiones. La zona en foco se marca en blanco y su luz sube; con el mouse, la zona de abajo. */
function Room() {
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
  // Contornos de la planta de cada equipo, como en el SVG: se ven mientras la sala todavía es un plano y se van al levantarse.
  const plan = useMemo(() => {
    const p: number[] = [], y = 0.015;
    for (const [x, z, w, d] of GEAR) { const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2; p.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0); }
    return lineGeometry(p);
  }, []);
  const pool = useMemo(() => radialTexture([[0, "rgba(255,255,255,1)"], [0.55, "rgba(255,255,255,.32)"], [1, "rgba(255,255,255,0)"]]), []);
  const wallTex = useMemo(() => wallTexture(), []);
  // Paredes del fondo y de los costados con sus pilares, y las divisiones de vidrio del box y de la oficina (una geometría).
  const walls = useMemo(() => {
    const W = FLOOR.w / 2 + 0.3, D = FLOOR.d / 2 + 0.3, H = 3.6, ps: THREE.BufferGeometry[] = [];
    for (let x = -W; x <= W + 0.01; x += (2 * W) / 10) ps.push(bx(0.22, H, 0.22, TONE.top, x, H / 2, -D + 0.1));
    for (let z = -D + 5.3; z <= D; z += 5.3) ps.push(bx(0.22, H, 0.22, TONE.top, -W + 0.1, H / 2, z), bx(0.22, H, 0.22, TONE.top, W - 0.1, H / 2, z));
    ps.push(bx(2 * W, 0.1, 0.14, TONE.frame, 0, H - 0.5, -D + 0.12), bx(0.14, 0.1, 2 * D, TONE.frame, -W + 0.12, H - 0.5, 0), bx(0.14, 0.1, 2 * D, TONE.frame, W - 0.12, H - 0.5, 0));
    // Marcos de las divisiones (los vidrios van aparte, transparentes).
    for (const [x0, z0, x1, z1] of GLASS) {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      ps.push(bx(len, 0.06, 0.06, TONE.frame, cx, 2.3, cz, 0, ry), bx(len, 0.08, 0.08, TONE.frame, cx, 0.04, cz, 0, ry));
      ps.push(bx(0.07, 2.3, 0.07, TONE.frame, x0, 1.15, z0), bx(0.07, 2.3, 0.07, TONE.frame, x1, 1.15, z1));
    }
    return join(ps);
  }, []);
  const glass = useMemo(() => {
    const ps: THREE.BufferGeometry[] = [];
    for (const [x0, z0, x1, z1] of GLASS) ps.push(bx(Math.hypot(x1 - x0, z1 - z0), 2.2, 0.02, "#ffffff", (x0 + x1) / 2, 1.15, (z0 + z1) / 2, 0, Math.atan2(-(z1 - z0), x1 - x0)));
    return join(ps);
  }, []);
  const fade = useFadeMat();
  const gridMat = useRef<THREE.LineBasicMaterial>(null), planMat = useRef<THREE.LineBasicMaterial>(null);
  const zoneMats = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  const poolMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const surfMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const floorMat = useRef<THREE.MeshBasicMaterial>(null), wallMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]), glassMat = useRef<THREE.MeshBasicMaterial>(null);
  const up = useRef<THREE.Group>(null);
  const cBase = useMemo(() => new THREE.Color(), []), cBg = useMemo(() => new THREE.Color(), []);
  const camera = useThree((st) => st.camera);
  const size = useThree((st) => st.size);
  const ray = useMemo(() => ({ r: new THREE.Raycaster(), ndc: new THREE.Vector2(), hit: new THREE.Vector3(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) }), []);
  useEffect(() => () => { pool.dispose(); wallTex.dispose(); }, [pool, wallTex]);
  useFrame(() => {
    const s = stage.get();
    const f = planFade(s.gather), lv = (0.25 + 0.75 * s.lit) * f, rise = build.v;
    if (gridMat.current) gridMat.current.opacity = 0.5 * lv;
    if (planMat.current) { planMat.current.opacity = 0.7 * lv * (1 - smooth(rise * 1.6)); planMat.current.visible = rise < 0.7; }
    if (floorMat.current) floorMat.current.color.copy(cBase.set(C.floor)).lerp(cBg.set(C.navy), 1 - f);
    surfMats.current.forEach((m) => { if (m) m.opacity = 0.7 * f; });
    fade.color.setScalar(f * (0.25 + 0.75 * s.lit));
    wallMats.current.forEach((m) => { if (m) m.opacity = f * (0.25 + 0.75 * s.lit); });
    if (glassMat.current) glassMat.current.opacity = 0.09 * f * s.lit;
    if (up.current) { const k = easeOut(rise * 1.2); up.current.scale.y = Math.max(0.0001, k); up.current.visible = k > 0.002; }
    // Zona bajo el puntero: el rayo de la cámara (con su lente) contra el piso.
    let near: ZoneId | null = null;
    if (pointer.on && s.gather === 0) {
      ray.ndc.set((pointer.x / size.width) * 2 - 1, -(pointer.y / size.height) * 2 + 1);
      ray.r.setFromCamera(ray.ndc, camera);
      if (ray.r.ray.intersectPlane(ray.plane, ray.hit)) near = ZONES.find((z) => Math.abs(ray.hit.x - z.x) <= z.w / 2 && Math.abs(ray.hit.z - z.z) <= z.d / 2)?.id ?? null;
    }
    zones.forEach((z, i) => {
      const m = zoneMats.current[i], pm = poolMats.current[i];
      const on = s.focus === z.id, pre = !on && (s.preview === z.id || near === z.id);
      if (m) { m.color.set(on ? C.white : pre ? C.muted : C.edge); m.opacity = lv; }
      if (pm) { const goal = (on ? 0.34 : pre ? 0.2 : 0.085) * (s.cold ? 0.3 : 1) * lv * rise; pm.opacity += (goal - pm.opacity) * 0.12; }
    });
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[FLOOR.w + 60, FLOOR.d + 60]} />
        <meshBasicMaterial ref={floorMat} color={C.floor} />
      </mesh>
      {ZONES.map((z, i) => (
        <mesh key={`f-${z.id}`} rotation-x={-Math.PI / 2} position={[z.x, 0.012, z.z]}><planeGeometry args={[z.w, z.d]} /><meshBasicMaterial ref={(m) => { surfMats.current[i] = m; }} color={C.surface} transparent opacity={0.7} /></mesh>
      ))}
      {ZONES.map((z, i) => (
        <mesh key={`p-${z.id}`} rotation-x={-Math.PI / 2} position={[z.x, 0.016, z.z]} renderOrder={1}>
          <planeGeometry args={[z.w * 1.5, z.d * 1.5]} />
          <meshBasicMaterial ref={(m) => { poolMats.current[i] = m; }} map={pool} color={C.teal} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      <lineSegments geometry={grid}><lineBasicMaterial ref={gridMat} color={C.steel} transparent opacity={0} /></lineSegments>
      <lineSegments geometry={plan}><lineBasicMaterial ref={planMat} color={C.edge} transparent opacity={0} /></lineSegments>
      {zones.map((z, i) => (
        <lineSegments key={z.id} geometry={z.geo}><lineBasicMaterial ref={(m) => { zoneMats.current[i] = m; }} color={C.steel} transparent opacity={0} /></lineSegments>
      ))}
      <group ref={up}>
        <mesh position={[0, 1.8, -FLOOR.d / 2 - 0.3]}><planeGeometry args={[FLOOR.w + 0.6, 3.6]} /><meshBasicMaterial ref={(m) => { wallMats.current[0] = m; }} map={wallTex} transparent /></mesh>
        <mesh position={[-FLOOR.w / 2 - 0.3, 1.8, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[FLOOR.d + 0.6, 3.6]} /><meshBasicMaterial ref={(m) => { wallMats.current[1] = m; }} map={wallTex} transparent /></mesh>
        <mesh position={[FLOOR.w / 2 + 0.3, 1.8, 0]} rotation-y={-Math.PI / 2}><planeGeometry args={[FLOOR.d + 0.6, 3.6]} /><meshBasicMaterial ref={(m) => { wallMats.current[2] = m; }} map={wallTex} transparent /></mesh>
        <mesh geometry={walls} material={fade} />
        <mesh geometry={glass} renderOrder={3}><meshBasicMaterial ref={glassMat} color={C.muted} transparent opacity={0.09} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      </group>
    </group>
  );
}
/** Divisiones de vidrio (x0, z0, x1, z1): el box del equipo y la oficina, con su entrada libre. */
const GLASS: [number, number, number, number][] = [
  [-10.5, -9.5, -10.5, -4.2], [-18.5, -1.5, -13, -1.5],
  [10, 7.6, 10, 11.5], [11.6, 5.5, 18, 5.5],
];

/** Equipos: una geometría por tipo (todas sus piezas unidas, con el color en los vértices) e instancias. Se levantan desde el
 *  piso en la apertura y llevan su sombra de contacto. */
function Gear() {
  const fade = useFadeMat();
  const blob = useMemo(() => radialTexture([[0, "rgba(0,0,0,.62)"], [0.6, "rgba(0,0,0,.34)"], [1, "rgba(0,0,0,0)"]]), []);
  const groups = useMemo(() => {
    const by = new Map<string, { geo: THREE.BufferGeometry; at: [number, number][] }>();
    GEAR.forEach(([x, z, w, d], i) => {
      const kind = GEAR_KIND[i], key = kind === "counter" || kind === "desk" ? `${kind}-${i}` : kind;
      if (!by.has(key)) by.set(key, { geo: gearGeometry(kind, w, d), at: [] });
      by.get(key)!.at.push([x, z]);
    });
    // El mueble de las mancuernas contra la pared del fondo (peso libre).
    by.set("dumbbells", { geo: join([bx(5.2, 0.06, 0.5, TONE.frame, 0, 0.42, 0), bx(5.2, 0.06, 0.5, TONE.frame, 0, 0.82, 0), bx(0.08, 0.86, 0.5, TONE.frame, -2.6, 0.43, 0), bx(0.08, 0.86, 0.5, TONE.frame, 2.6, 0.43, 0),
      ...Array.from({ length: 12 }, (_, k) => bx(0.26, 0.13, 0.36, TONE.dark, -2.3 + k * 0.42, 0.52 + (k % 2) * 0.4, 0))]), at: [[-2, -6.6]] });
    return [...by.values()];
  }, []);
  const shadows = useMemo(() => [...GEAR.map(([x, z, w, d], i) => { const k = GEAR_KIND[i], oz = k === "squat" ? SQUAT_Z : k === "bench" ? 1.0 : 0; return [x, z + oz, Math.max(w, 1.6) + 0.9, (k === "bench" ? 2.8 : Math.max(d, 1.6)) + 0.9] as const; }), [-2, -6.6, 6, 1.6] as const], []);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const shadow = useRef<THREE.InstancedMesh>(null), shadowMat = useRef<THREE.MeshBasicMaterial>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const last = useRef(-1);
  useEffect(() => () => { blob.dispose(); groups.forEach((g) => g.geo.dispose()); }, [blob, groups]);
  useFrame(() => {
    const s = stage.get(), f = planFade(s.gather);
    if (shadowMat.current) shadowMat.current.opacity = 0.9 * f * s.lit * smooth(build.v * 1.4);
    if (build.v === last.current) return;
    last.current = build.v;
    groups.forEach((g, gi) => {
      const m = meshes.current[gi]; if (!m) return;
      g.at.forEach(([x, z], k) => {
        dummy.position.set(x, 0, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, Math.max(0.0001, riseAt(x, z)), 1); dummy.updateMatrix();
        m.setMatrixAt(k, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    });
    if (shadow.current) {
      shadows.forEach(([x, z, w, d], k) => { dummy.position.set(x, 0.022, z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(w, d, 1); dummy.updateMatrix(); shadow.current!.setMatrixAt(k, dummy.matrix); });
      shadow.current.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group>
      <instancedMesh ref={shadow} args={[undefined, undefined, shadows.length]} renderOrder={2} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={shadowMat} map={blob} transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      {groups.map((g, i) => <instancedMesh key={i} ref={(m) => { meshes.current[i] = m; }} args={[g.geo, fade, g.at.length]} frustumCulled={false} />)}
    </group>
  );
}

/** Barras: una en cada jaula y en cada banco. La de Valentina sube y baja (la escena 03 la mueve con el scroll; si no, entrena
 *  sola: seis repeticiones y un descanso) y la de Julián acompaña la sentadilla. */
const VAL_RACKED = { y: 1.08, z: VALENTINA[1] + BENCH_UP + 0.07 }, VAL_CHEST = { y: 0.86, z: VALENTINA[1] - 0.3 }, VAL_TOP = 1.24;
/** Fase de la serie que Valentina hace sola: 0 = barra en los soportes; si no, altura 0–1 de la repetición. */
function autoLift(t: number) {
  const c = t % 15;
  if (c < 1 || c > 11.8) return { racked: 1 - smooth(c < 1 ? c : (15 - c) / 3.2 > 1 ? 0 : 1 - (c - 11.8) / 0.9), up: 1 };
  const r = ((c - 1) % 1.8) / 1.8;
  return { racked: 0, up: r < 0.45 ? 1 - smooth(r / 0.45) : smooth((r - 0.45) / 0.55) };
}
/** Altura de la sentadilla de Julián (0 = de pie, 1 = abajo): cinco repeticiones y descanso. */
function squatAt(t: number) {
  const c = (t + 4) % 13;
  if (c > 9) return 0;
  const r = (c % 1.8) / 1.8;
  return r < 0.5 ? smooth(r / 0.5) : 1 - smooth((r - 0.5) / 0.5);
}
function liftPose(s: ReturnType<typeof stage.get>, t: number) {
  const rise = riseAt(VALENTINA[0], VALENTINA[1]);
  if (s.cold || s.gather > 0 || rise < 1) return { y: VAL_RACKED.y, z: VAL_RACKED.z, arms: 0 };
  if (s.lift != null) { const u = clamp01(s.lift); return { y: VAL_CHEST.y + (VAL_TOP - VAL_CHEST.y) * u, z: VAL_CHEST.z, arms: 1 }; }
  const a = autoLift(t);
  return { y: VAL_RACKED.y * a.racked + (VAL_CHEST.y + (VAL_TOP - VAL_CHEST.y) * a.up) * (1 - a.racked), z: VAL_RACKED.z * a.racked + VAL_CHEST.z * (1 - a.racked), arms: 1 - a.racked };
}
function Barbells() {
  const fade = useFadeMat();
  const geo = useMemo(() => barbellGeometry(), []);
  // Fijas: las otras jaulas y bancos. La 0 es la de Valentina (banco [-2, 0]) y la 1, la de Julián (jaula [-6, -5]).
  const spots = useMemo(() => GEAR.map(([x, z], i) => ({ x, z, kind: GEAR_KIND[i] })).filter((g) => g.kind === "squat" || g.kind === "bench"), []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(() => {
    const m = mesh.current; if (!m) return;
    const s = stage.get(), t = sceneTime.t;
    spots.forEach((g, i) => {
      const rise = riseAt(g.x, g.z);
      let y = g.kind === "squat" ? 1.42 : VAL_RACKED.y, z = g.kind === "squat" ? g.z + SQUAT_Z - 0.6 : g.z + 1.2 + BENCH_UP + 0.07;
      if (g.x === VALENTINA[0] && g.kind === "bench" && g.z === 0) { const p = liftPose(s, t); y = p.y; z = p.z; }
      else if (g.x === JULIAN[0] && g.kind === "squat" && g.z === -5 && !s.cold && s.gather === 0 && rise >= 1) { y = 1.28 - 0.42 * squatAt(t); z = JULIAN[1]; }
      dummy.position.set(g.x, y * rise, z); dummy.scale.setScalar(Math.max(0.0001, rise)); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo, fade, spots.length]} frustumCulled={false} />;
}

/** Personas (instancias): cuerpo y cabeza. Socios en cian, equipo en turquesa; en la sala «sin REPI», acero. El lado iluminado
 *  es el color exacto de la marca (el material compensa las luces). Valentina (la primera) hace press de banca acostada, con
 *  un anillo que respira; Julián hace sentadillas. De lejos son los puntos del plano; de cerca, figuras. En la vuelta al punto
 *  (cierre) todas vuelven al centro y queda una sola, que crece con todo lo que se tragó. Con el mouse cerca, se agrandan. */
function People({ count }: { count: number }) {
  const list = useMemo(() => PEOPLE.slice(0, count), [count]);
  const refs = useRef<{ mb: THREE.InstancedMesh | null; mh: THREE.InstancedMesh | null; sb: THREE.InstancedMesh | null; sh: THREE.InstancedMesh | null; hm: THREE.InstancedMesh | null; hs: THREE.InstancedMesh | null; sd: THREE.InstancedMesh | null }>({ mb: null, mh: null, sb: null, sh: null, hm: null, hs: null, sd: null });
  const ring = useRef<THREE.Mesh>(null), arms = useRef<THREE.InstancedMesh>(null);
  const body = useMemo(() => new THREE.CapsuleGeometry(0.19, 0.78, 4, 12).translate(0, 0.58, 0), []);
  const head = useMemo(() => new THREE.SphereGeometry(0.15, 14, 10), []);
  const blob = useMemo(() => radialTexture([[0, "rgba(0,0,0,.6)"], [0.5, "rgba(0,0,0,.3)"], [1, "rgba(0,0,0,0)"]]), []);
  // color·(ambiente + luz) + emisivo = 1 en el lado iluminado y ≈ .74 en el de sombra: volumen sin perder el color.
  const mats = useMemo(() => {
    const k = 0.26 / KEY, e = 0.74 - k * AMBIENT;
    const mk = (hex: string) => { const c = new THREE.Color(hex); return new THREE.MeshLambertMaterial({ color: c.clone().multiplyScalar(k), emissive: c.clone().multiplyScalar(e) }); };
    return { m: mk(C.cyan), s: mk(C.teal), k, e };
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const proj = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  const cold = useRef<boolean | null>(null);
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null);
  useEffect(() => () => { body.dispose(); head.dispose(); blob.dispose(); mats.m.dispose(); mats.s.dispose(); }, [body, head, blob, mats]);
  useFrame(() => {
    const s = stage.get(), t = sceneTime.t, R = refs.current;
    if (cold.current !== s.cold) {
      cold.current = s.cold;
      for (const [m, c] of [[mats.m, C.cyan], [mats.s, C.teal]] as const) { tmp.set(s.cold ? C.line : c); m.color.copy(tmp).multiplyScalar(mats.k); m.emissive.copy(tmp).multiplyScalar(mats.e); }
    }
    const allIn = s.gather >= 0.985, rv = s.reveal, gk = smooth(s.gather * 3);
    const pose = liftPose(s, t);
    let mi = 0, si = 0;
    list.forEach((p, i) => {
      const [x, z] = placePerson(i, t, s);
      const hide = (allIn && i > 0) || (s.dotOut && i === 0);
      let pop = 1;
      if (rv || pointer.on) {
        proj.set(x, 0.8, z).project(camera);
        const sx = ((proj.x + 1) / 2) * size.width, sy = ((1 - proj.y) / 2) * size.height;
        if (rv) { const v = clamp01((rv.r - Math.hypot(sx - rv.x, sy - rv.y)) / 70 + 1); pop = v * v * (3 - 2 * v); }
        if (pointer.on && s.gather === 0) { const v = Math.max(0, 1 - Math.hypot(sx - pointer.x, sy - pointer.y) / 150); pop *= 1 + 0.35 * v * v; }
      }
      const grow = i === 0 && s.gather > 0 ? gatherGrow(s.gather) : 1;
      const sc = hide ? 0.0001 : Math.max(0.001, s.lit * pop) * grow;
      // Postura: Valentina acostada en el banco (cuando la sala ya se levantó y no vuelve al punto); Julián sube y baja.
      const lie = p.id === "valentina" && !s.cold ? riseAt(x, z) * (1 - gk) : 0;
      const squat = p.id === "julian" && !s.cold && s.gather === 0 && build.v >= 1 ? squatAt(t) : 0;
      const bodyM = p.kind === "member" ? R.mb : R.sb, headM = p.kind === "member" ? R.mh : R.sh, k = p.kind === "member" ? mi : si;
      // Cuerpo: de pie (eje y) o acostado (eje z, sobre el banco a 0,46 m).
      dummy.position.set(x, lie * 0.65 - squat * 0.3, z + lie * 0.58);
      dummy.rotation.set(-lie * Math.PI / 2, 0, 0); dummy.scale.set(sc, sc * (1 - squat * 0.18), sc); dummy.updateMatrix();
      bodyM?.setMatrixAt(k, dummy.matrix);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, (1.33 - squat * 0.5) * (1 - lie) + 0.68 * lie, z - lie * 0.74); dummy.scale.setScalar(sc); dummy.updateMatrix();
      headM?.setMatrixAt(k, dummy.matrix);
      // Halo en el piso (no para quien está acostada: lleva su anillo) y sombra de contacto.
      dummy.position.set(x, 0.03, z); dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(s.cold || s.gather > 0.2 || lie > 0.5 ? 0.0001 : sc * (1 + 0.12 * Math.sin(t * 2 + i))); dummy.updateMatrix();
      (p.kind === "member" ? R.hm : R.hs)?.setMatrixAt(k, dummy.matrix);
      dummy.scale.setScalar(hide || s.gather > 0.1 ? 0.0001 : sc * (1 + lie * 0.9)); dummy.position.y = 0.024; dummy.updateMatrix();
      R.sd?.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, 0, 0);
      if (p.kind === "member") mi++; else si++;
      if (i === 0) {
        if (ring.current) {
          ring.current.position.set(x, 0.05, z);
          ring.current.scale.setScalar((1 + lie * 0.35) * (1.05 + 0.2 * Math.sin(t * 2.2)));
          ring.current.visible = !hide && !s.cold && s.gather < 0.3 && s.lit > 0.5;
        }
        // Los brazos: de los hombros a la barra, sólo mientras empuja.
        if (arms.current) {
          const on = lie > 0.98 && pose.arms > 0.05 && !hide, len = Math.max(0.05, pose.y - 0.78);
          for (const [a, sx] of [[0, -0.2], [1, 0.2]] as const) {
            dummy.position.set(x + sx, 0.78 + len / 2, pose.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(on ? sc : 0.0001, on ? len : 0.0001, on ? sc : 0.0001); dummy.updateMatrix();
            arms.current.setMatrixAt(a, dummy.matrix);
          }
          arms.current.instanceMatrix.needsUpdate = true;
        }
      }
    });
    if (shadowMat.current) shadowMat.current.opacity = 0.8 * s.lit * planFade(s.gather) * smooth(build.v * 1.4);
    for (const m of [R.mb, R.mh, R.sb, R.sh, R.hm, R.hs, R.sd]) if (m) m.instanceMatrix.needsUpdate = true;
  });
  const nm = list.filter((p) => p.kind === "member").length, ns = list.length - nm;
  const R = refs.current;
  return (
    <group>
      <instancedMesh ref={(m) => { R.sd = m; }} args={[undefined, undefined, list.length]} renderOrder={2} frustumCulled={false}>
        <planeGeometry args={[1.1, 1.1]} /><meshBasicMaterial ref={shadowMat} map={blob} transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={(m) => { R.mb = m; }} args={[body, mats.m, nm]} frustumCulled={false} />
      <instancedMesh ref={(m) => { R.mh = m; }} args={[head, mats.m, nm]} frustumCulled={false} />
      <instancedMesh ref={(m) => { R.sb = m; }} args={[body, mats.s, ns]} frustumCulled={false} />
      <instancedMesh ref={(m) => { R.sh = m; }} args={[head, mats.s, ns]} frustumCulled={false} />
      <instancedMesh ref={arms} args={[undefined, mats.m, 2]} frustumCulled={false}><cylinderGeometry args={[0.055, 0.055, 1, 8]} /></instancedMesh>
      <instancedMesh ref={(m) => { R.hm = m; }} args={[undefined, undefined, nm]} frustumCulled={false}>
        <ringGeometry args={[0.42, 0.5, 32]} /><meshBasicMaterial color={C.cyan} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={(m) => { R.hs = m; }} args={[undefined, undefined, ns]} frustumCulled={false}>
        <ringGeometry args={[0.42, 0.5, 32]} /><meshBasicMaterial color={C.teal} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </instancedMesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}><ringGeometry args={[0.62, 0.7, 48]} /><meshBasicMaterial color={C.cyan} transparent opacity={0.6} depthWrite={false} /></mesh>
    </group>
  );
}

/** Pantallas de la sala: la de REPI Control en la recepción (un tótem con la captura real de la rutina), la del equipo (box),
 *  la de la oficina y las consolas de las cintas. Son las superficies donde aparece lo que se registra: se encienden con la
 *  red (`flow`), con su zona en foco o con la modalidad Control (`kiosk`). */
const KIOSK_RY = 0.52;
function Screens() {
  const fade = useFadeMat();
  const stand = useMemo(() => join([
    bx(0.7, 0.05, 0.5, TONE.frame, 0, 0.025, 0), bx(0.1, 1.12, 0.1, TONE.frame, 0, 0.58, -0.04), bx(0.94, 0.62, 0.06, TONE.dark, 0, 1.36, 0, -0.26),
  ]), []);
  const monitor = useMemo(() => join([bx(0.3, 0.03, 0.2, TONE.frame, 0, 0.795, 0), bx(0.05, 0.26, 0.05, TONE.frame, 0, 0.92, 0), bx(0.98, 0.6, 0.05, TONE.dark, 0, 1.3, 0)]), []);
  const glow = useMemo(() => radialTexture([[0, "rgba(255,255,255,.9)"], [0.4, "rgba(255,255,255,.28)"], [1, "rgba(255,255,255,0)"]]), []);
  const kioskMat = useRef<THREE.MeshBasicMaterial>(null), kioskGlow = useRef<THREE.MeshBasicMaterial>(null), group = useRef<THREE.Group>(null);
  const officeMat = useRef<THREE.MeshBasicMaterial>(null), coachMat = useRef<THREE.MeshBasicMaterial>(null), qr = useRef<THREE.MeshBasicMaterial>(null), consoles = useRef<THREE.MeshBasicMaterial>(null);
  const treadmills = useMemo(() => GEAR.filter((_, i) => GEAR_KIND[i] === "treadmill"), []);
  const cons = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const cOn = useMemo(() => new THREE.Color(), []), cOff = useMemo(() => new THREE.Color(), []);
  // La captura real de la pantalla del gimnasio (la misma que usa la escena de modalidades), cargada después del primer cuadro.
  useEffect(() => {
    let alive = true, tex: THREE.Texture | null = null;
    const id = window.setTimeout(() => new THREE.TextureLoader().load("/conoce/shots/control-rutina.webp", (t) => {
      if (!alive) { t.dispose(); return; }
      tex = t; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      if (kioskMat.current) { kioskMat.current.map = t; kioskMat.current.needsUpdate = true; }
    }, undefined, () => { /* sin la captura queda la pantalla encendida, lisa */ }), 900);
    return () => { alive = false; clearTimeout(id); tex?.dispose(); };
  }, []);
  useEffect(() => {
    const m = cons.current; if (!m) return;
    treadmills.forEach(([x, z], i) => { dummy.position.set(x, 1.38, z - 0.83); dummy.rotation.set(-0.5, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.instanceMatrix.needsUpdate = true;
  }, [treadmills, dummy]);
  useEffect(() => () => { stand.dispose(); monitor.dispose(); glow.dispose(); }, [stand, monitor, glow]);
  useFrame(() => {
    const s = stage.get(), f = planFade(s.gather), lv = s.lit * f * (s.cold ? 0.25 : 1), t = sceneTime.t;
    if (group.current) { const k = easeOut(build.v * 1.2); group.current.scale.y = Math.max(0.0001, k); group.current.visible = k > 0.002 && f > 0.004; }
    // Encendida con la modalidad Control (su toma), con la zona recepción en foco o cuando una escena lo pide.
    const kiosk = Math.max(s.kiosk, s.focus === "recepcion" ? 1 : 0, s.b === "control" || s.b === "zRecepcion" ? s.t : 0, s.a === "control" || s.a === "zRecepcion" ? 1 - s.t : 0);
    // Con la captura cargada el material es blanco (se ve la interfaz); sin ella, cian liso. Apagada, navy acero.
    if (kioskMat.current) kioskMat.current.color.copy(cOff.set("#3A4D66")).lerp(cOn.set(kioskMat.current.map ? "#FFFFFF" : C.cyan), (0.45 + 0.55 * kiosk) * lv);
    if (kioskGlow.current) kioskGlow.current.opacity = (0.06 + 0.3 * kiosk) * lv * (0.9 + 0.1 * Math.sin(t * 1.7));
    const flow = Math.max(s.flow, 0);
    if (officeMat.current) officeMat.current.color.copy(cOff.set("#24354A")).lerp(cOn.set(C.teal), clamp01(0.3 + 0.7 * Math.max(flow, s.focus === "oficina" ? 1 : 0)) * lv);
    if (coachMat.current) coachMat.current.color.copy(cOff.set("#24354A")).lerp(cOn.set(C.teal), clamp01(0.3 + 0.7 * Math.max(flow, s.focus === "box" ? 1 : 0)) * lv);
    if (consoles.current) consoles.current.color.copy(cOff.set("#1F2C3D")).lerp(cOn.set(C.cyan), 0.5 * lv);
    if (qr.current) qr.current.opacity = lv * (0.55 + 0.45 * Math.abs(Math.sin(t * 1.6)));
  });
  return (
    <group ref={group}>
      <group position={[KIOSK[0], 0, KIOSK[1]]} rotation-y={KIOSK_RY}>
        <mesh geometry={stand} material={fade} />
        <mesh position={[0, 1.36, 0.036]} rotation-x={-0.26}><planeGeometry args={[0.88, 0.55]} /><meshBasicMaterial ref={kioskMat} color="#3A4D66" /></mesh>
        <mesh position={[0, 1.36, 0.3]} rotation-x={-0.26} renderOrder={4}><planeGeometry args={[3.4, 2.6]} /><meshBasicMaterial ref={kioskGlow} map={glow} color={C.cyan} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
      </group>
      <group position={[OFFICE_SCREEN[0], 0, OFFICE_SCREEN[1]]} rotation-y={-0.5}>
        <mesh geometry={monitor} material={fade} />
        <mesh position={[0, 1.3, 0.03]}><planeGeometry args={[0.9, 0.52]} /><meshBasicMaterial ref={officeMat} color="#24354A" /></mesh>
      </group>
      <group position={[COACH_SCREEN[0], 0, COACH_SCREEN[1]]} rotation-y={0.6}>
        <mesh geometry={monitor} material={fade} />
        <mesh position={[0, 1.3, 0.03]}><planeGeometry args={[0.9, 0.52]} /><meshBasicMaterial ref={coachMat} color="#24354A" /></mesh>
      </group>
      <instancedMesh ref={cons} args={[undefined, undefined, treadmills.length]} frustumCulled={false}>
        <planeGeometry args={[0.6, 0.2]} /><meshBasicMaterial ref={consoles} color="#1F2C3D" />
      </instancedMesh>
      <mesh position={[QR_SPOT[0], 1.3, QR_SPOT[1]]}>
        <planeGeometry args={[0.5, 0.5]} /><meshBasicMaterial ref={qr} color={C.cyan} transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** La red de la sala: recorridos sobre el piso por donde viaja lo que se registra (pulsos cian que avanzan cuando `flow` > 0),
 *  los pulsos de evento (`pings`: anillos que se abren) y el pedido Julián → entrenadora (un cometa que va y vuelve con «Voy»). */
function Net({ dense }: { dense: boolean }) {
  const lines = useMemo(() => {
    const p: number[] = [];
    for (const path of LINKS) for (let i = 1; i < path.length; i++) p.push(path[i - 1][0], 0.03, path[i - 1][1], path[i][0], 0.03, path[i][1]);
    return lineGeometry(p);
  }, []);
  const per = dense ? 3 : 2, total = LINKS.length * per;
  const lineMat = useRef<THREE.LineBasicMaterial>(null), dots = useRef<THREE.InstancedMesh>(null), dotMat = useRef<THREE.MeshBasicMaterial>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const pulse = useRef<THREE.Mesh>(null), trail = useRef<THREE.Line>(null);
  const curve = useMemo(() => {
    const from = new THREE.Vector3(JULIAN[0], 1.3, JULIAN[1]), to = new THREE.Vector3(COACH_SCREEN[0], 1.3, COACH_SCREEN[1] + 0.6);
    return new THREE.QuadraticBezierCurve3(from, new THREE.Vector3((from.x + to.x) / 2, 3.6, (from.z + to.z) / 2), to);
  }, []);
  const trailGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), [curve]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const flowNow = useRef(0);
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => pings.subscribe(() => invalidate()), [invalidate]);
  useEffect(() => () => { lines.dispose(); trailGeo.dispose(); }, [lines, trailGeo]);
  useFrame((_, dt) => {
    const s = stage.get(), t = sceneTime.t, f = planFade(s.gather);
    flowNow.current += (s.flow - flowNow.current) * (1 - Math.exp(-dt * 4));
    const fl = flowNow.current * f * s.lit;
    if (lineMat.current) { lineMat.current.opacity = 0.55 * fl; lineMat.current.visible = fl > 0.01; }
    if (dots.current && dotMat.current) {
      dots.current.visible = fl > 0.01;
      if (fl > 0.01) {
        LINKS.forEach((path, li) => {
          for (let j = 0; j < per; j++) {
            const u = (t * (0.16 + li * 0.013) + j / per + li * 0.37) % 1, [x, z] = linkAt(path, u);
            const k = Math.sin(Math.PI * u); // nace en el origen y se apaga al llegar
            dummy.position.set(x, 0.12, z); dummy.scale.setScalar(Math.max(0.0001, fl * (0.5 + 0.5 * k))); dummy.updateMatrix();
            dots.current!.setMatrixAt(li * per + j, dummy.matrix);
          }
        });
        dots.current.instanceMatrix.needsUpdate = true;
      }
    }
    // Pulsos de evento: cada anillo se abre 1,3 s y se apaga.
    const now = performance.now();
    rings.current.forEach((r, i) => {
      if (!r) return;
      const p = pings.list[i], age = p ? (now - p.at) / 1300 : 2;
      if (!p || age >= 1 || s.gather > 0) { r.visible = false; return; }
      const m = r.material as THREE.MeshBasicMaterial, e = easeOut(age);
      r.visible = true; r.position.set(p.x, 0.045, p.z); r.scale.setScalar(0.4 + 3.4 * e);
      m.color.set(p.kind === "staff" ? C.teal : p.kind === "data" ? C.white : C.cyan); m.opacity = 0.85 * (1 - age);
    });
    if (pulse.current && trail.current) {
      // Sólo en la toma del pedido y nunca durante la vuelta al punto (aunque un disparador tardío deje `request` escrito).
      const on = s.request != null && s.gather === 0 && (s.a === "pedido" || s.b === "pedido" || s.a === "zBox" || s.b === "zBox" || s.explore === "zBox");
      pulse.current.visible = on; trail.current.visible = on;
      if (on) {
        const u = s.request! < 0.5 ? s.request! * 2 : 2 - s.request! * 2; // ida (pedido) y vuelta («Voy»)
        pulse.current.position.copy(curve.getPoint(clamp01(u)));
        (pulse.current.material as THREE.MeshBasicMaterial).color.set(s.request! < 0.5 ? C.cyan : C.teal);
      }
    }
  });
  return (
    <group>
      <lineSegments geometry={lines}><lineBasicMaterial ref={lineMat} color={C.cyan} transparent opacity={0} depthWrite={false} /></lineSegments>
      <instancedMesh ref={dots} args={[undefined, undefined, total]} frustumCulled={false} visible={false}>
        <sphereGeometry args={[0.13, 10, 8]} /><meshBasicMaterial ref={dotMat} color={C.cyan} />
      </instancedMesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} ref={(m) => { rings.current[i] = m; }} rotation-x={-Math.PI / 2} visible={false} renderOrder={5}>
          <ringGeometry args={[0.9, 1, 48]} /><meshBasicMaterial color={C.cyan} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh ref={pulse} visible={false}><sphereGeometry args={[0.17, 12, 12]} /><meshBasicMaterial color={C.cyan} /></mesh>
      {/* @ts-expect-error: <line> de three, no el SVG */}
      <line ref={trail} geometry={trailGeo} visible={false}><lineBasicMaterial color={C.cyan} transparent opacity={0.6} /></line>
    </group>
  );
}

// ── Cámara ───────────────────────────────────────────────────────────────────────────────────────────────────────────
type Cam = { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
/** Toma cenital con el mismo encuadre que el SVG del hero (zoom, centro y lente): calculada con el tamaño de la pantalla. */
function planShot(vw: number, vh: number): Shot {
  const [cx, cz, zoom] = SHOTS.hero.svg, { s0 } = svgFit(vw, vh);
  const visH = vh / (SVG_S * s0 * zoom);
  const h = visH / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  return { pos: [cx, h, cz + 0.001], look: [cx, 0, cz], svg: SHOTS.hero.svg, far: 1 };
}
/** La toma `id` para una pantalla de vw × vh: en angosto la cámara se aleja del punto de mira (`far`). */
function camOf(id: ShotId, vw: number, vh: number, out: Cam): Cam {
  const sh: Shot = id === "plan" ? planShot(vw, vh) : SHOTS[id];
  const far = isNarrow(vw) ? sh.far ?? 1.3 : 1;
  out.look.set(...sh.look);
  out.pos.set(...sh.pos).sub(out.look).multiplyScalar(far).add(out.look);
  out.fov = sh.fov ?? FOV;
  return out;
}
const mkCam = (): Cam => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: FOV });
const sphA = new THREE.Spherical(), sphB = new THREE.Spherical(), vA = new THREE.Vector3(), vB = new THREE.Vector3();
/** Mezcla dos tomas en arco: el punto de mira va en línea recta y la cámara gira a su alrededor (radio, altura y rumbo
 *  interpolados), así entre dos tomas hay una órbita y no un deslizamiento que atraviesa la sala. */
function blendCam(A: Cam, B: Cam, k: number, out: Cam): Cam {
  out.look.lerpVectors(A.look, B.look, k);
  sphA.setFromVector3(vA.subVectors(A.pos, A.look)); sphB.setFromVector3(vB.subVectors(B.pos, B.look));
  // Desde arriba (cenital) el rumbo no significa nada: se toma el de la otra toma para no girar el plano.
  if (sphA.phi < 0.12) sphA.theta = sphB.theta; else if (sphB.phi < 0.12) sphB.theta = sphA.theta;
  let dth = sphB.theta - sphA.theta; if (dth > Math.PI) dth -= 2 * Math.PI; else if (dth < -Math.PI) dth += 2 * Math.PI;
  sphA.radius += (sphB.radius - sphA.radius) * k; sphA.phi += (sphB.phi - sphA.phi) * k; sphA.theta += dth * k;
  out.pos.setFromSpherical(sphA).add(out.look);
  out.fov = A.fov + (B.fov - A.fov) * k;
  return out;
}

/** Proyección del 3D (para las escenas): con la toma de destino, su lente y su encuadre, nunca con la cámara amortiguada. */
function Publish() {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  useEffect(() => {
    const tmp = new THREE.PerspectiveCamera(FOV, size.width / size.height, camera.near, camera.far);
    const v = new THREE.Vector3(), cam = mkCam();
    return stage.publish("gl", (x, z, shot) => {
      camOf(shot, size.width, size.height, cam);
      const [lx, ly] = lensPx(shot, size.width, size.height);
      tmp.fov = cam.fov; tmp.position.copy(cam.pos); tmp.lookAt(cam.look);
      tmp.setViewOffset(size.width, size.height, -lx, -ly, size.width, size.height);
      tmp.updateProjectionMatrix(); tmp.updateMatrixWorld();
      v.set(x, 0.42, z).project(tmp);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    });
  }, [camera, size]);
  return null;
}

/** Cámara: mezcla en arco entre las tomas a y b según t (scroll), o va a la toma que eligió la persona al explorar la sala
 *  (`explore`); amortiguada, con un leve paralaje con el mouse (escritorio) y una respiración lenta cuando nadie hace scroll.
 *  Apertura «del plano a la sala»: si la persona sigue arriba de todo, el 3D aparece en la cenital `plan` (igual que el SVG)
 *  con la sala sin altura, espera el fundido y baja en grúa 3,2 s hasta la toma del hero mientras la sala se levanta; si ya
 *  hizo scroll o pausó las animaciones, adopta la toma actual con la sala entera, sin viaje. */
function Rig({ parallax }: { parallax: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const look = useRef(new THREE.Vector3());
  const A = useMemo(mkCam, []), B = useMemo(mkCam, []), goal = useMemo(mkCam, []), from = useMemo(mkCam, []), now$ = useMemo(mkCam, []);
  const right = useMemo(() => new THREE.Vector3(), []), tmp = useMemo(() => new THREE.Vector3(), []);
  const lens = useRef<[number, number]>([0, 0]);
  const mouse = useRef({ x: 0, y: 0 });
  /** hold: quieta en `plan` mientras aparece; intro: baja a la toma; live: sigue al scroll. */
  const phase = useRef<{ mode: "init" | "hold" | "intro" | "live"; at: number }>({ mode: "init", at: 0 });
  const lit = useRef(0);
  useEffect(() => {
    if (!parallax) return;
    const on = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; mouse.current.x = e.clientX / window.innerWidth - 0.5; mouse.current.y = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, [parallax]);
  useFrame((state, dt) => {
    const s = stage.get(), now = state.clock.elapsedTime, vw = size.width, vh = size.height;
    let goalLens: [number, number];
    if (s.explore) { camOf(s.explore, vw, vh, goal); goalLens = lensPx(s.explore, vw, vh); }
    else {
      const k = easeIO(clamp01(s.t));
      blendCam(camOf(s.a, vw, vh, A), camOf(s.b, vw, vh, B), k, goal);
      const la = lensPx(s.a, vw, vh), lb = lensPx(s.b, vw, vh);
      goalLens = [la[0] + (lb[0] - la[0]) * k, la[1] + (lb[1] - la[1]) * k];
    }
    const ph = phase.current;
    const atTop = s.b === "hero" && s.t >= 1 && !s.explore && window.scrollY < 40;
    if (ph.mode === "init") {
      if (atTop && !s.paused) {
        camOf("plan", vw, vh, now$);
        camera.position.copy(now$.pos); look.current.copy(now$.look); camera.fov = now$.fov; camera.updateProjectionMatrix(); lens.current = lensPx("hero", vw, vh);
        build.v = 0;
        phase.current = { mode: "hold", at: now };
      } else { camera.position.copy(goal.pos); look.current.copy(goal.look); camera.fov = goal.fov; camera.updateProjectionMatrix(); lens.current = goalLens; build.v = 1; phase.current = { mode: "live", at: now }; }
    } else if (ph.mode === "hold") {
      // Espera el fundido (1,5 s) y que termine el encendido del hero (la luz que se expande desde el punto).
      if (s.lit < 1 || s.reveal) lit.current = now;
      if (!atTop || s.paused) phase.current = { mode: "live", at: now };
      else if (now - ph.at > 1.5 && now - lit.current > 0.5) { from.pos.copy(camera.position); from.look.copy(look.current); from.fov = camera.fov; phase.current = { mode: "intro", at: now }; }
    } else if (ph.mode === "intro") {
      const u = Math.min(1, (now - ph.at) / 3.2);
      if (!atTop || s.paused || u >= 1) phase.current = { mode: "live", at: now };
      else {
        // Grúa: baja por el mismo rumbo (el plano no gira mientras todavía se ve desde arriba) y la sala se levanta.
        blendCam(from, goal, easeIO(u), now$);
        camera.position.copy(now$.pos); look.current.copy(now$.look);
        if (Math.abs(camera.fov - now$.fov) > 0.01) { camera.fov = now$.fov; camera.updateProjectionMatrix(); }
        build.v = clamp01(u * 1.25);
      }
    }
    if (phase.current.mode === "live") {
      if (build.v < 1) build.v = Math.min(1, build.v + dt * 1.6); // si la persona bajó antes de tiempo, la sala termina de levantarse sola
      // Paralaje con el mouse y respiración (sólo con animaciones): proporcionales a la distancia, laterales a la mirada.
      const dist = tmp.subVectors(goal.pos, goal.look).length();
      right.crossVectors(tmp, camera.up).normalize();
      const breathe = s.paused ? 0 : 1;
      const ox = (-mouse.current.x * 0.045 + Math.sin(sceneTime.t * 0.21) * 0.012 * breathe) * dist, oy = (mouse.current.y * 0.025 + Math.sin(sceneTime.t * 0.16 + 1) * 0.006 * breathe) * dist;
      goal.pos.addScaledVector(right, ox); goal.pos.y += oy;
      const damp = 1 - Math.exp(-dt * 3.2);
      camera.position.lerp(goal.pos, damp);
      look.current.lerp(goal.look, damp);
      const nf = camera.fov + (goal.fov - camera.fov) * damp;
      if (Math.abs(nf - camera.fov) > 0.005) { camera.fov = nf; camera.updateProjectionMatrix(); }
    }
    camera.lookAt(look.current);
    const dl = 1 - Math.exp(-dt * 3.2), L = lens.current;
    const nx = L[0] + (goalLens[0] - L[0]) * dl, ny = L[1] + (goalLens[1] - L[1]) * dl;
    if (Math.abs(nx - L[0]) > 0.05 || Math.abs(ny - L[1]) > 0.05 || !camera.view) { lens.current = [nx, ny]; camera.setViewOffset(vw, vh, -nx, -ny, vw, vh); }
    // En modo «a pedido» (animaciones pausadas) sigue pidiendo cuadros hasta llegar a la toma.
    if (phase.current.mode !== "live" || build.v < 1 || camera.position.distanceToSquared(goal.pos) > 1e-4 || look.current.distanceToSquared(goal.look) > 1e-4 || Math.abs(nx - goalLens[0]) > 0.5) state.invalidate();
  });
  return null;
}

/** Vuelta al punto (cierre): el plano entero (piso, zonas, equipos, pantallas y red) se encoge hacia el origen y se apaga;
 *  apagado del todo, no se dibuja: queda sólo el punto, como en el SVG. */
function Gather({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = stage.get(), el = g.current; if (!el) return;
    const f = planFade(s.gather), sc = Math.max(0.0001, 1 - 0.98 * (1 - f));
    el.scale.setScalar(sc); el.position.set(s.origin[0] * (1 - sc), 0, s.origin[1] * (1 - sc));
    el.visible = f > 0.004;
  });
  return <group ref={g}>{children}</group>;
}

/** Modo de dibujo: nada si una sección sólida tapa la sala o la pestaña no se ve; «a pedido» (sólo la cámara, que sigue al
 *  scroll) si la persona pausó las animaciones; continuo en el resto. Sólo se cambia cuando el modo cambia: en R3F,
 *  setFrameloop reinicia el reloj y notifica a toda la escena. */
function Pauser() {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let last: "never" | "demand" | "always" | null = null;
    const upd = () => {
      const s = stage.get();
      const mode = s.hidden || document.hidden ? "never" : s.paused ? "demand" : "always";
      if (mode !== last) { last = mode; setFrameloop(mode); }
      if (mode === "demand") invalidate();
    };
    const off = stage.subscribe(upd);
    document.addEventListener("visibilitychange", upd);
    upd();
    return () => { off(); document.removeEventListener("visibilitychange", upd); };
  }, [setFrameloop, invalidate]);
  return null;
}

/** Avisa una sola vez, después del primer cuadro dibujado: recién ahí el 3D reemplaza al SVG. */
function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => { if (!done.current) { done.current = true; requestAnimationFrame(onReady); } });
  return null;
}

export default function SalaCanvas({ quality, onReady, onLost }: { quality: Quality; onReady: () => void; onLost: () => void }) {
  if (!C.navy) readPalette(); // antes del primer render de la escena: los materiales se crean con la paleta ya leída
  const high = quality === "high";
  return (
    <Canvas className="sala-canvas" flat dpr={high ? [1, 2] : [1, 1.5]} gl={{ antialias: high, powerPreference: high ? "high-performance" : "low-power", alpha: false }}
      camera={{ fov: SHOTS.hero.fov ?? FOV, near: 0.3, far: 220, position: SHOTS.hero.pos }} aria-hidden="true"
      onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", onLost, { once: true })}>
      <color attach="background" args={[C.navy]} />
      <fog attach="fog" args={[C.navy, 38, 120]} />
      <ambientLight intensity={AMBIENT} />
      <directionalLight position={[10, 26, 16]} intensity={KEY} />
      <hemisphereLight args={[C.teal, C.navy, 0.22]} />
      <Gather>
        <Room />
        <Gear />
        <Barbells />
        <Screens />
        <Net dense={high} />
      </Gather>
      <People count={high ? PEOPLE.length : 9} />
      <Clock />
      <Rig parallax={high} />
      <Publish />
      <Pauser />
      <Ready onReady={onReady} />
    </Canvas>
  );
}
