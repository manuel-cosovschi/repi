"use client";
// La sala en 3D (React Three Fiber). Se carga con importación dinámica después del primer pintado y sólo en los niveles
// «high» y «medium» (store.detectQuality). Dibuja el plano, las zonas, los equipos, las personas en movimiento, el QR de la
// recepción y el pedido socio → entrenador. La cámara sigue la toma que piden las escenas (store.stage) con amortiguación y
// el encuadre corrido hacia el lado libre del texto (setViewOffset). Arranca en la toma cenital `plan`, con el mismo encuadre
// que el SVG, y recién después baja a la toma del hero: el 3D entra sin cambiar el punto de vista.
// Sin texturas ni modelos externos: geometría propia y liviana. Al desmontar, R3F libera el contexto y la GPU.
// Colores planos (`flat`, sin tone mapping) y personas sin luz: el cian del 3D es el mismo hex que el del SVG y el primer cuadro
// del 3D tiene el mismo brillo que el último del SVG. Con el mouse (escritorio), las personas cerca del puntero se agrandan y
// la zona de abajo se marca, igual que en el SVG.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FLOOR, GEAR, JULIAN, PEOPLE, QR_SPOT, SHOTS, SVG_S, ZONES, gatherGrow, gear3d, lensPx, placePerson, svgFit, type Shot, type ShotId, type ZoneId } from "./model";
import { pointer, stage, type Quality } from "./store";

// Paleta: una sola fuente, los tokens --x-* de styles/conoce3.css. Se lee una vez al montar (three.js no entiende var()).
const TOKENS = { navy: "--x-navy", floor: "--x-floor", surface: "--x-surface", steel: "--x-steel", line: "--x-plan", edge: "--x-edge", gear: "--x-gear", cyan: "--x-cyan", teal: "--x-teal", white: "--x-white", muted: "--x-muted" } as const;
const C = {} as Record<keyof typeof TOKENS, string>;
function readPalette() {
  const cs = getComputedStyle(document.querySelector(".x3") ?? document.documentElement);
  for (const [k, v] of Object.entries(TOKENS)) C[k as keyof typeof TOKENS] = cs.getPropertyValue(v).trim() || "gray";
}

/** Tiempo de la escena: avanza con cada cuadro salvo cuando la persona pausó las animaciones. Es propio (no el reloj de R3F,
 *  que se reinicia al cambiar el modo de dibujo), así las personas siguen donde estaban al volver a mostrarse. */
const sceneTime = { t: 0 };
function Clock() {
  useFrame((_, dt) => { if (!stage.get().paused) sceneTime.t += Math.min(dt, 0.1); });
  return null;
}

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
  const camera = useThree((st) => st.camera);
  const size = useThree((st) => st.size);
  const ray = useMemo(() => ({ r: new THREE.Raycaster(), ndc: new THREE.Vector2(), hit: new THREE.Vector3(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) }), []);
  const wall = useMemo(() => {
    const w = FLOOR.w / 2, d = FLOOR.d / 2;
    return lineGeometry([-w, 0.02, -d, w, 0.02, -d, w, 0.02, -d, w, 0.02, d, w, 0.02, d, -w, 0.02, d, -w, 0.02, d, -w, 0.02, -d]);
  }, []);
  useFrame(() => {
    const s = stage.get();
    const lv = 0.25 + 0.75 * s.lit; // como el SVG: apagada se ve a .25
    if (gridMat.current) gridMat.current.opacity = 0.55 * lv;
    // Zona bajo el puntero: el rayo de la cámara (con su lente) contra el piso.
    let near: ZoneId | null = null;
    if (pointer.on && s.gather === 0) {
      ray.ndc.set((pointer.x / size.width) * 2 - 1, -(pointer.y / size.height) * 2 + 1);
      ray.r.setFromCamera(ray.ndc, camera);
      if (ray.r.ray.intersectPlane(ray.plane, ray.hit)) near = ZONES.find((z) => Math.abs(ray.hit.x - z.x) <= z.w / 2 && Math.abs(ray.hit.z - z.z) <= z.d / 2)?.id ?? null;
    }
    zones.forEach((z, i) => {
      const m = zoneMats.current[i];
      if (!m) return;
      const on = s.focus === z.id, pre = !on && (s.preview === z.id || near === z.id);
      m.color.set(on ? C.white : pre ? C.muted : C.edge);
      m.opacity = lv;
    });
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[FLOOR.w + 30, FLOOR.d + 30]} />
        <meshBasicMaterial color={C.floor} />
      </mesh>
      {ZONES.map((z) => (
        <mesh key={`f-${z.id}`} rotation-x={-Math.PI / 2} position={[z.x, 0.012, z.z]}><planeGeometry args={[z.w, z.d]} /><meshBasicMaterial color={C.surface} transparent opacity={0.7} /></mesh>
      ))}
      <lineSegments geometry={grid}><lineBasicMaterial ref={gridMat} color={C.steel} transparent opacity={0} /></lineSegments>
      <lineSegments geometry={wall}><lineBasicMaterial color={C.line} transparent opacity={0.9} /></lineSegments>
      {zones.map((z, i) => (
        <lineSegments key={z.id} geometry={z.geo}><lineBasicMaterial ref={(m) => { zoneMats.current[i] = m; }} color={C.steel} transparent opacity={0} /></lineSegments>
      ))}
    </group>
  );
}

/** Equipos: en el piso, el mismo contorno que dibuja el SVG (así el cambio de SVG a 3D no cambia el plano) y, en el centro,
 *  una losa baja y oscura con bordes (`gear3d`: chica, para que ninguna pase de ≈ 60 px). Se iluminan cuando su zona está en
 *  foco. */
function Gear() {
  const items = useMemo(() => GEAR.map((g) => {
    const { x, z, w, d, h } = gear3d(g);
    const box = new THREE.BoxGeometry(w, h, d);
    const zone = ZONES.find((zn) => Math.abs(x - zn.x) <= zn.w / 2 && Math.abs(z - zn.z) <= zn.d / 2)?.id ?? null;
    return { x, z, h, box, edges: new THREE.EdgesGeometry(box), zone };
  }), []);
  // Contornos de la planta de cada equipo (todos en una sola geometría de líneas).
  const plan = useMemo(() => {
    const p: number[] = [], y = 0.015;
    for (const [x, z, w, d] of GEAR) { const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2; p.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0); }
    return lineGeometry(p);
  }, []);
  const planMat = useRef<THREE.LineBasicMaterial>(null);
  const mats = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  useFrame(() => {
    const s = stage.get();
    items.forEach((it, i) => {
      const m = mats.current[i];
      if (!m) return;
      const on = s.focus != null && it.zone === s.focus;
      m.color.set(on ? C.white : C.edge);
      m.opacity = 0.25 + 0.75 * s.lit;
    });
    if (planMat.current) planMat.current.opacity = 0.7 * (0.25 + 0.75 * s.lit);
  });
  return (
    <group>
      <lineSegments geometry={plan}><lineBasicMaterial ref={planMat} color={C.edge} transparent opacity={0} /></lineSegments>
      {items.map((it, i) => (
        <group key={i} position={[it.x, it.h / 2, it.z]}>
          <mesh geometry={it.box} castShadow><meshStandardMaterial color={C.gear} roughness={0.6} metalness={0.25} /></mesh>
          <lineSegments geometry={it.edges}><lineBasicMaterial ref={(m) => { mats.current[i] = m; }} color={C.steel} transparent opacity={0} /></lineSegments>
        </group>
      ))}
    </group>
  );
}

/** Personas en movimiento (instancias). Socios cian, equipo turquesa (también sus halos), sin luz ni sombra: el mismo color que
 *  los puntos del SVG; en la sala «sin REPI», acero. Valentina (la primera) está siempre, con un anillo que respira, y al final
 *  de la vuelta al punto crece con todo lo que se tragó. Lejos se ven en su tamaño; cerca se achican para no superar ~56 px en
 *  pantalla (siguen siendo personas en un plano, no figuras). Con el mouse cerca, se agrandan un poco. */
function People({ count }: { count: number }) {
  const list = useMemo(() => PEOPLE.slice(0, count), [count]);
  const members = useRef<THREE.InstancedMesh>(null);
  const staff = useRef<THREE.InstancedMesh>(null);
  const halosM = useRef<THREE.InstancedMesh>(null);
  const halosS = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const mats = useRef<{ m: THREE.MeshBasicMaterial | null; s: THREE.MeshBasicMaterial | null }>({ m: null, s: null });
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const proj = useMemo(() => new THREE.Vector3(), []);
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  const cold = useRef<boolean | null>(null);
  useFrame(() => {
    const s = stage.get(), t = sceneTime.t;
    if (cold.current !== s.cold && mats.current.m && mats.current.s) {
      cold.current = s.cold;
      for (const [m, c] of [[mats.current.m, C.cyan], [mats.current.s, C.teal]] as const) m.color.set(s.cold ? C.line : c);
    }
    const pxPerM = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const allIn = s.gather >= 0.985, rv = s.reveal;
    let mi = 0, si = 0;
    list.forEach((p, i) => {
      const [x, z] = placePerson(i, t, s);
      const d = camera.position.distanceTo(dummy.position.set(x, 0.42, z));
      const fit = Math.min(1, 56 / (1.0 * pxPerM / Math.max(0.1, d)));
      const hide = (allIn && i > 0) || (s.dotOut && i === 0);
      let pop = 1;
      if (rv || pointer.on) {
        proj.copy(dummy.position).project(camera);
        const sx = ((proj.x + 1) / 2) * size.width, sy = ((1 - proj.y) / 2) * size.height;
        if (rv) { const v = Math.min(1, Math.max(0, (rv.r - Math.hypot(sx - rv.x, sy - rv.y)) / 70 + 1)); pop = v * v * (3 - 2 * v); }
        if (pointer.on && s.gather === 0) { const v = Math.max(0, 1 - Math.hypot(sx - pointer.x, sy - pointer.y) / 150); pop *= 1 + 0.6 * v * v; }
      }
      const grow = i === 0 && s.gather > 0 ? gatherGrow(s.gather) : 1;
      const sc = hide ? 0.0001 : Math.max(0.001, s.lit * pop) * fit * grow;
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
      if (p.kind === "member") members.current?.setMatrixAt(mi, dummy.matrix); else staff.current?.setMatrixAt(si, dummy.matrix);
      dummy.position.set(x, 0.03, z); dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(s.cold || s.gather > 0.2 ? 0.0001 : sc * (1 + 0.15 * Math.sin(t * 2 + i))); dummy.updateMatrix();
      if (p.kind === "member") halosM.current?.setMatrixAt(mi++, dummy.matrix); else halosS.current?.setMatrixAt(si++, dummy.matrix);
      if (i === 0 && ring.current) {
        ring.current.position.set(x, 0.05, z);
        ring.current.scale.setScalar(fit * (1.05 + 0.25 * Math.sin(t * 2.2)));
        ring.current.visible = !hide && !s.cold && s.gather < 0.3 && s.lit > 0.5;
      }
    });
    for (const m of [members.current, staff.current, halosM.current, halosS.current]) if (m) m.instanceMatrix.needsUpdate = true;
  });
  const nm = list.filter((p) => p.kind === "member").length, ns = list.length - nm;
  return (
    <group>
      <instancedMesh ref={members} args={[undefined, undefined, nm]}>
        <capsuleGeometry args={[0.2, 0.42, 4, 10]} />
        <meshBasicMaterial ref={(m) => { mats.current.m = m; }} color={C.cyan} />
      </instancedMesh>
      <instancedMesh ref={staff} args={[undefined, undefined, ns]}>
        <capsuleGeometry args={[0.22, 0.46, 4, 10]} />
        <meshBasicMaterial ref={(m) => { mats.current.s = m; }} color={C.teal} />
      </instancedMesh>
      <instancedMesh ref={halosM} args={[undefined, undefined, nm]}>
        <ringGeometry args={[0.42, 0.5, 32]} />
        <meshBasicMaterial color={C.cyan} transparent opacity={0.35} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={halosS} args={[undefined, undefined, ns]}>
        <ringGeometry args={[0.42, 0.5, 32]} />
        <meshBasicMaterial color={C.teal} transparent opacity={0.35} side={THREE.DoubleSide} />
      </instancedMesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}><ringGeometry args={[0.62, 0.7, 48]} /><meshBasicMaterial color={C.cyan} transparent opacity={0.6} /></mesh>
    </group>
  );
}

/** QR de la sede en la recepción y el pedido Julián → entrenadora (un pulso que viaja y vuelve con «Voy»). */
function Signals() {
  const pulse = useRef<THREE.Mesh>(null);
  const trail = useRef<THREE.Line>(null);
  const qr = useRef<THREE.Mesh>(null);
  const from = new THREE.Vector3(JULIAN[0], 0.6, JULIAN[1]), to = new THREE.Vector3(-14.5, 0.6, -4.5);
  const mid = new THREE.Vector3((from.x + to.x) / 2, 3.2, (from.z + to.z) / 2);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(from, mid, to), []); // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), [curve]);
  useFrame(() => {
    const s = stage.get();
    if (pulse.current && trail.current) {
      // Sólo en la toma del pedido y nunca durante la vuelta al punto (aunque un disparador tardío deje `request` escrito).
      const on = s.request != null && s.gather === 0 && (s.a === "pedido" || s.b === "pedido");
      pulse.current.visible = on; trail.current.visible = on;
      if (on) {
        const u = s.request! < 0.5 ? s.request! * 2 : 2 - s.request! * 2; // ida (pedido) y vuelta («Voy»)
        pulse.current.position.copy(curve.getPoint(Math.min(1, Math.max(0, u))));
        (pulse.current.material as THREE.MeshBasicMaterial).color.set(s.request! < 0.5 ? C.cyan : C.teal);
      }
    }
    if (qr.current) (qr.current.material as THREE.MeshBasicMaterial).opacity = s.lit * (0.55 + 0.45 * Math.abs(Math.sin(sceneTime.t * 1.6)));
  });
  return (
    <group>
      <mesh ref={pulse} visible={false}><sphereGeometry args={[0.16, 12, 12]} /><meshBasicMaterial color={C.cyan} /></mesh>
      {/* @ts-expect-error: <line> de three, no el SVG */}
      <line ref={trail} geometry={geo} visible={false}><lineBasicMaterial color={C.cyan} transparent opacity={0.6} /></line>
      <mesh ref={qr} position={[QR_SPOT[0], 1.3, QR_SPOT[1]]}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial color={C.cyan} transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Toma cenital con el mismo encuadre que el SVG del hero (zoom, centro y lente): calculada con el tamaño de la pantalla. */
function planShot(vw: number, vh: number, fov: number): Shot {
  const [cx, cz, zoom] = SHOTS.hero.svg, { s0 } = svgFit(vw, vh);
  const visH = vh / (SVG_S * s0 * zoom);
  const h = visH / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
  return { pos: [cx, h, cz + 0.001], look: [cx, 0, cz], svg: SHOTS.hero.svg };
}
const shotOf = (id: ShotId, vw: number, vh: number, fov: number): Shot => (id === "plan" ? planShot(vw, vh, fov) : SHOTS[id]);

/** Proyección del 3D (para las escenas): con la toma de destino y su lente, nunca con la cámara amortiguada. */
function Publish() {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  useEffect(() => {
    const tmp = new THREE.PerspectiveCamera(camera.fov, size.width / size.height, camera.near, camera.far);
    const v = new THREE.Vector3();
    return stage.publish("gl", (x, z, shot) => {
      const sh = shotOf(shot, size.width, size.height, camera.fov), [lx, ly] = lensPx(shot, size.width, size.height);
      tmp.position.set(...sh.pos); tmp.lookAt(...sh.look);
      tmp.setViewOffset(size.width, size.height, -lx, -ly, size.width, size.height);
      tmp.updateMatrixWorld();
      v.set(x, 0.42, z).project(tmp);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    });
  }, [camera, size]);
  return null;
}

const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Cámara: mezcla entre las tomas a y b según t, con amortiguación (y un leve paralaje con el mouse en escritorio). Entrada:
 *  si la persona sigue arriba de todo, el 3D aparece en la cenital `plan` (igual que el SVG), espera el fundido y baja en
 *  2,4 s hasta la toma del hero; si ya hizo scroll o pausó las animaciones, adopta la toma actual sin viaje. */
function Rig({ parallax }: { parallax: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const look = useRef(new THREE.Vector3());
  const goalPos = useMemo(() => new THREE.Vector3(), []), goalLook = useMemo(() => new THREE.Vector3(), []);
  const fromPos = useMemo(() => new THREE.Vector3(), []), fromLook = useMemo(() => new THREE.Vector3(), []);
  const lens = useRef<[number, number]>([0, 0]);
  const mouse = useRef({ x: 0, y: 0 });
  /** hold: quieta en `plan` mientras aparece; intro: baja a la toma; live: sigue al scroll. */
  const phase = useRef<{ mode: "init" | "hold" | "intro" | "live"; at: number }>({ mode: "init", at: 0 });
  const lit = useRef(0);
  useEffect(() => {
    if (!parallax) return;
    const on = (e: PointerEvent) => { mouse.current.x = e.clientX / window.innerWidth - 0.5; mouse.current.y = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, [parallax]);
  useFrame((state, dt) => {
    const s = stage.get(), now = state.clock.elapsedTime;
    const A = shotOf(s.a, size.width, size.height, camera.fov), B = shotOf(s.b, size.width, size.height, camera.fov), k = easeIO(Math.min(1, Math.max(0, s.t)));
    goalPos.set(A.pos[0] + (B.pos[0] - A.pos[0]) * k + mouse.current.x * 1.2, A.pos[1] + (B.pos[1] - A.pos[1]) * k - mouse.current.y * 0.8, A.pos[2] + (B.pos[2] - A.pos[2]) * k);
    goalLook.set(A.look[0] + (B.look[0] - A.look[0]) * k, A.look[1] + (B.look[1] - A.look[1]) * k, A.look[2] + (B.look[2] - A.look[2]) * k);
    const la = lensPx(s.a, size.width, size.height), lb = lensPx(s.b, size.width, size.height);
    const goalLens: [number, number] = [la[0] + (lb[0] - la[0]) * k, la[1] + (lb[1] - la[1]) * k];
    const ph = phase.current;
    const atTop = s.b === "hero" && s.t >= 1 && window.scrollY < 40;
    if (ph.mode === "init") {
      if (atTop && !s.paused) {
        const P = planShot(size.width, size.height, camera.fov);
        camera.position.set(...P.pos); look.current.set(...P.look); lens.current = lensPx("hero", size.width, size.height);
        phase.current = { mode: "hold", at: now };
      } else { camera.position.copy(goalPos); look.current.copy(goalLook); lens.current = goalLens; phase.current = { mode: "live", at: now }; }
    } else if (ph.mode === "hold") {
      // Espera el fundido (1,5 s) y que termine el encendido del hero (la luz que se expande desde el punto).
      if (s.lit < 1 || s.reveal) lit.current = now;
      if (!atTop || s.paused) phase.current = { mode: "live", at: now };
      else if (now - ph.at > 1.5 && now - lit.current > 0.5) { fromPos.copy(camera.position); fromLook.copy(look.current); phase.current = { mode: "intro", at: now }; }
    } else if (ph.mode === "intro") {
      const u = Math.min(1, (now - ph.at) / 2.4);
      if (!atTop || s.paused || u >= 1) phase.current = { mode: "live", at: now };
      else { const e = easeIO(u); camera.position.lerpVectors(fromPos, goalPos, e); look.current.lerpVectors(fromLook, goalLook, e); }
    }
    if (phase.current.mode === "live") {
      const damp = 1 - Math.exp(-dt * 3.2);
      camera.position.lerp(goalPos, damp);
      look.current.lerp(goalLook, damp);
    }
    camera.lookAt(look.current);
    const dl = 1 - Math.exp(-dt * 3.2), L = lens.current;
    const nx = L[0] + (goalLens[0] - L[0]) * dl, ny = L[1] + (goalLens[1] - L[1]) * dl;
    if (Math.abs(nx - L[0]) > 0.05 || Math.abs(ny - L[1]) > 0.05 || !camera.view) { lens.current = [nx, ny]; camera.setViewOffset(size.width, size.height, -nx, -ny, size.width, size.height); }
    // En modo «a pedido» (animaciones pausadas) sigue pidiendo cuadros hasta llegar a la toma.
    if (phase.current.mode !== "live" || camera.position.distanceToSquared(goalPos) > 1e-4 || look.current.distanceToSquared(goalLook) > 1e-4 || Math.abs(nx - goalLens[0]) > 0.5) state.invalidate();
  });
  return null;
}

/** Vuelta al punto (cierre): el plano entero (piso, zonas, equipos) se encoge hacia el origen. */
function Gather({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = stage.get(), el = g.current; if (!el) return;
    const x = Math.min(1, Math.max(0, s.gather / 0.9)), e = x * x * (3 - 2 * x), sc = Math.max(0.0001, 1 - 0.98 * e);
    el.scale.setScalar(sc); el.position.set(s.origin[0] * (1 - sc), 0, s.origin[1] * (1 - sc));
    el.visible = sc > 0.01;
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
    <Canvas className="sala-canvas" flat dpr={high ? [1, 2] : [1, 1.5]} shadows={high} gl={{ antialias: high, powerPreference: high ? "high-performance" : "low-power", alpha: false }}
      camera={{ fov: 38, near: 0.1, far: 200, position: SHOTS.hero.pos }} aria-hidden="true"
      onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", onLost, { once: true })}>
      <color attach="background" args={[C.navy]} />
      <fog attach="fog" args={[C.navy, 45, 130]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[12, 30, 14]} intensity={1.1} castShadow={high} shadow-mapSize={[1024, 1024]} />
      <hemisphereLight args={[C.teal, C.navy, 0.25]} />
      <Gather>
        <Floor />
        <Gear />
        <Signals />
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
