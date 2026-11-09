// Experience 3.0 · «La sala en vivo» (docs/comercial/EXPERIENCE_3.md, EXPERIENCE_3_MOTION_2.md). Modelo único de la sala: lo
// dibujan la escena 3D (SalaCanvas) y la alternativa liviana en SVG (SalaSvg) con las mismas zonas, equipos, personas y tomas.
// Unidades: metros aproximados; x hacia la derecha, z hacia el frente (la recepción da a la calle), y hacia arriba.

export type ZoneId = "recepcion" | "racks" | "maquinas" | "box" | "oficina" | "cardio";
export type Zone = { id: ZoneId; label: string; x: number; z: number; w: number; d: number };
export const FLOOR = { w: 40, d: 26 } as const;

export const ZONES: Zone[] = [
  { id: "recepcion", label: "Recepción", x: -14.5, z: 8.5, w: 8, d: 6 },
  { id: "racks", label: "Peso libre", x: -2, z: -2.5, w: 12, d: 9 },
  { id: "maquinas", label: "Máquinas", x: 11.5, z: -3.5, w: 13, d: 11 },
  { id: "box", label: "Entrenadores", x: -14.5, z: -5.5, w: 8, d: 8 },
  { id: "oficina", label: "Oficina", x: 14, z: 8.5, w: 8, d: 6 },
  { id: "cardio", label: "Cardio", x: 0, z: 8.5, w: 14, d: 5 },
];
export const zoneById = (id: ZoneId) => ZONES.find((z) => z.id === id)!;

/** Equipos (cajas bajas con bordes): [x, z, ancho, profundidad, alto]. */
export const GEAR: [number, number, number, number, number][] = [
  // racks y bancos
  [-6, -5, 2.2, 1.4, 2.2], [-2, -5, 2.2, 1.4, 2.2], [2, -5, 2.2, 1.4, 2.2], [-6, 0, 2.2, 1.4, 2.2], [-2, 0, 2.2, 1.4, 2.2], [2, 0, 2.2, 1.4, 2.2],
  // máquinas
  [7, -7, 2.4, 1.6, 1.6], [11, -7, 2.4, 1.6, 1.6], [15, -7, 2.4, 1.6, 1.6], [7, -3, 2.4, 1.6, 1.6], [11, -3, 2.4, 1.6, 1.6], [15, -3, 2.4, 1.6, 1.6], [7, 1, 2.4, 1.6, 1.6], [11, 1, 2.4, 1.6, 1.6],
  // cardio
  [-5, 8.5, 1.2, 2.4, 1.2], [-2.5, 8.5, 1.2, 2.4, 1.2], [0, 8.5, 1.2, 2.4, 1.2], [2.5, 8.5, 1.2, 2.4, 1.2], [5, 8.5, 1.2, 2.4, 1.2],
  // mostrador de recepción, escritorio del box y de la oficina
  [-14.5, 9.5, 4.5, 1, 1.1], [-14.5, -5.5, 3, 1.2, 0.8], [14, 8.5, 3.2, 1.4, 0.8],
];

/** Medidas de un equipo en 3D: menos de la mitad de su planta (como mucho 0,9 m) y el 30 % del alto. Losas bajas que marcan dónde
 *  está cada cosa sin tapar a las personas ni competir con la interfaz. */
export const gear3d = ([x, z, w, d, h]: [number, number, number, number, number]) => ({ x, z, w: Math.min(0.9, w * 0.45), d: Math.min(0.9, d * 0.45), h: h * 0.3 });

/** El QR de la sede (recepción). */
export const QR_SPOT: [number, number] = [-11.5, 10.8];

/** Personajes de la historia (los mismos nombres que la demo real): Valentina entrena press de banca en el rack (hero y 03),
 *  Julián hace sentadilla y pide «Que venga alguien» (05) y Sofía, la entrenadora de sala, responde «Voy» y camina hasta él. */
export const VALENTINA: [number, number] = [-2, 1.2];
export const JULIAN: [number, number] = [-6, -3.6];
/** Dónde queda Sofía al llegar al lado de Julián. */
export const BESIDE_JULIAN: [number, number] = [-7.3, -2.6];

/** Personas: recorrido cerrado por estaciones (x, z) y tipo. Socios en cian, equipo en turquesa. Determinístico. Las tres
 *  primeras son los personajes (el nivel «medium» dibuja sólo las primeras nueve: siempre están). */
export type Person = { kind: "member" | "staff"; path: [number, number][]; speed: number; phase: number; id?: "valentina" | "julian" | "sofia" };
export const PEOPLE: Person[] = [
  { kind: "member", id: "valentina", path: [VALENTINA], speed: 0, phase: 0 },
  { kind: "member", id: "julian", path: [JULIAN], speed: 0, phase: 0 },
  { kind: "staff", id: "sofia", path: [[-14, -3], [-9, -1], [-4.2, 2.4], [3, -1], [9, 0], [3, 3], [-9, 1], [-14, -3]], speed: 0.018, phase: 0 },
  { kind: "member", path: [[-12, 10], [-6, 6], [-3, 6.8], [-3, 6.8], [-6, 6], [-12, 10]], speed: 0.03, phase: 0.1 },
  { kind: "member", path: [[2, -3.6], [2, 1.2], [6, 3], [11, 2.2], [11, 2.2]], speed: 0.035, phase: 0.2 },
  { kind: "member", path: [[7, -5.6], [7, -5.6], [11, -5.6], [11, -5.6]], speed: 0.045, phase: 0.7 },
  { kind: "member", path: [[15, -5.6], [15, -1.6], [15, -1.6], [15, -5.6]], speed: 0.04, phase: 0.5 },
  { kind: "member", path: [[-5, 6.8], [-5, 6.8], [0, 6.8], [0, 6.8]], speed: 0.05, phase: 0.9 },
  { kind: "member", path: [[2.5, 6.8], [5, 6.8], [5, 6.8], [2.5, 6.8]], speed: 0.04, phase: 0.3 },
  { kind: "member", path: [[7, -1.6], [7, -1.6], [11, -1.6], [11, -1.6], [7, -1.6]], speed: 0.03, phase: 0.6 },
  { kind: "member", path: [[-13, 7], [-9, 4], [-2, -3.6], [-2, -3.6], [-9, 4], [-13, 7]], speed: 0.025, phase: 0.85 },
  { kind: "member", path: [[2, -3.6], [2, -3.6], [-2, -3.6]], speed: 0.04, phase: 0.15 },
  { kind: "staff", path: [[-12, 9.5], [-12, 9.5], [-9, 9], [-12, 9.5]], speed: 0.03, phase: 0.5 },
  { kind: "staff", path: [[13, 8], [13, 8], [15, 9], [13, 8]], speed: 0.02, phase: 0.2 },
];

/** Posición en un recorrido para el tiempo t (segundos). */
export function along(p: Person, t: number): [number, number] {
  const segs = p.path.length;
  if (segs === 1) return p.path[0];
  const u = (((t * p.speed + p.phase) % 1) + 1) % 1 * segs;
  const i = Math.floor(u), f = u - i;
  const a = p.path[i % segs], b = p.path[(i + 1) % segs];
  const e = f * f * (3 - 2 * f);
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x); };

/** Demora de cada persona al volver al punto (cierre): Valentina primero, las demás escalonadas por distancia al origen. */
export function gatherDelay(i: number, start: [number, number], origin: [number, number]) {
  if (PEOPLE[i]?.id === "valentina") return 0;
  return 0.08 + Math.min(1, Math.hypot(start[0] - origin[0], start[1] - origin[1]) / 22) * 0.32;
}

/** Vueltas que da cada persona alrededor del centro al volver al punto (cierre): la sala gira como un remolino alrededor
 *  del logo antes de quedar en un solo punto. */
const ORBIT = Math.PI * 2;

/** Posición de la persona i con todo lo que la escena pide: su recorrido, Sofía que camina hasta Julián (`walk`) y la vuelta
 *  al punto del cierre (`gather`: una espiral de una vuelta que se cierra en el centro, no una línea recta). La usan el SVG
 *  y el 3D por igual. */
export function placePerson(i: number, t: number, s: { walk: number; gather: number; origin: [number, number] }): [number, number] {
  const p = PEOPLE[i];
  let [x, z] = along(p, t);
  if (p.id === "sofia" && s.walk > 0) { const k = smooth(s.walk); x += (BESIDE_JULIAN[0] - x) * k; z += (BESIDE_JULIAN[1] - z) * k; }
  if (s.gather > 0) {
    const d = gatherDelay(i, [x, z], s.origin);
    const k = smooth((s.gather - d) / (1 - d));
    if (k > 0) {
      // El radio se cierra con k y el ángulo avanza una vuelta: todas giran en el mismo sentido, alrededor del logo.
      const dx = x - s.origin[0], dz = z - s.origin[1], r = Math.hypot(dx, dz) * (1 - k), a = Math.atan2(dz, dx) + ORBIT * k;
      x = s.origin[0] + r * Math.cos(a); z = s.origin[1] + r * Math.sin(a);
    }
  }
  return [x, z];
}

/** Al final de la vuelta al punto, el punto que queda (Valentina) crece con todo lo que se tragó: de una persona (≈14 px) a
 *  ≈20 px, el tamaño con el que la página lo toma y lo lleva a la «ı». */
export const gatherGrow = (gather: number) => 1 + 0.45 * smooth((gather - 0.55) / 0.4);

/** Tomas de cámara por escena: posición y punto de mira del 3D, y `svg` (centro x, z y zoom) para la misma toma en el plano.
 *  El zoom del SVG llega hasta 2,4: más cerca, las personas y los equipos dejan de leerse como plano. En 3D las tomas quedan
 *  altas y lejos (≈ 30–40 m): ningún equipo (que en 3D se dibuja bajo y chico, `gear3d`) pasa de ≈ 58 px en ninguna pantalla
 *  entre 393 × 659 y 1920 × 1080 (comprobado con la cámara de destino y su lente), así la sala sigue siendo un plano detrás de
 *  la interfaz y no un decorado. */
export type Shot = { pos: [number, number, number]; look: [number, number, number]; svg: [number, number, number] };
export const SVG_ZOOM_MAX = 2.4;
export const SHOTS = {
  dark: { pos: [22, 34, 34], look: [2, 0, 0], svg: [0, 0, 0.9] },
  /** Cenital del 3D con el mismo encuadre que el SVG del hero: el 3D entra sin cambiar el punto de vista (SalaCanvas la
   *  recalcula en el cliente con el tamaño de la pantalla; estos valores son sólo el respaldo). */
  plan: { pos: [0, 30, 0.01], look: [0, 0, 0], svg: [0, 0, 1] },
  hero: { pos: [16.4, 24, 28.8], look: [2, 0, 0], svg: [0, 0, 1] },
  problem: { pos: [-11.6, 26.1, 29], look: [0, 0, 0], svg: [0, 0, 1.15] },
  training: { pos: [-0.5, 28.8, 23.4], look: [-2, 0.4, -0.4], svg: [-2, 0.4, 2.4] },
  gimnasios: { pos: [0, 24.8, 30.3], look: [0, 0, 7], svg: [0, 7, 1.6] },
  entrenadores: { pos: [-8.6, 27, 18], look: [-14, 0, -5], svg: [-13, -4, 2.4] },
  deportistas: { pos: [0.9, 28.8, 22.2], look: [-2, 0.4, -1], svg: [-2, 0, 2.4] },
  aliados: { pos: [0, 46, 0.5], look: [0, 0, 0], svg: [0, 0, 0.85] },
  /** Modalidades (escena «Dos formas de entrenar»): Completo mira la sala donde se entrena con el teléfono (peso libre y
   *  máquinas); Control, el box del equipo que planifica y la recepción, donde va la pantalla de consulta. */
  completo: { pos: [6, 30, 23], look: [2, 0, -1.5], svg: [2, -1.5, 1.5] },
  control: { pos: [-7, 30, 26], look: [-13, 0, 1], svg: [-13, 1, 1.3] },
  showcase: { pos: [20.2, 28, 20.4], look: [9, 0, -2], svg: [9, -2, 2] },
  rack: { pos: [3.8, 28.8, 22.3], look: [-2, 0.4, -1.2], svg: [-2, -1, 2.2] },
  box: { pos: [-7, 28, 18.8], look: [-14, 0, -5], svg: [-13, -4, 2.2] },
  pedido: { pos: [-0.4, 31.4, 23.7], look: [-9.5, 0, -3.5], svg: [-9.5, -3.2, 1.9] },
  cardio: { pos: [7.2, 21.6, 27.2], look: [0, 0, 8], svg: [0, 7.5, 2] },
  open: { pos: [0, 26.4, 28.5], look: [0, 0, 1], svg: [0, 0, 1.1] },
  finale: { pos: [0, 52, 6], look: [0, 0, 0], svg: [0, 0, 0.8] },
} satisfies Record<string, Shot>;
export type ShotId = keyof typeof SHOTS;

/** Encuadre corrido hacia el lado libre del texto, en fracciones de la pantalla: `w` en pantallas anchas (texto a la izquierda:
 *  la sala se corre a la derecha) y `n` en angostas (texto abajo: la sala sube). En el SVG es un desplazamiento; en el 3D,
 *  `camera.setViewOffset`. */
const LENS: Partial<Record<ShotId, { w: [number, number]; n: [number, number] }>> = {
  plan: { w: [0.2, 0], n: [0, -0.2] },
  hero: { w: [0.2, 0], n: [0, -0.2] },
  training: { w: [0.22, 0], n: [0, -0.26] },
  gimnasios: { w: [0.18, 0.06], n: [0, -0.18] },
  entrenadores: { w: [0.18, 0.06], n: [0, -0.18] },
  deportistas: { w: [0.18, 0.06], n: [0, -0.18] },
  completo: { w: [0.2, 0], n: [0, -0.2] },
  control: { w: [0.2, 0], n: [0, -0.2] },
  showcase: { w: [0.2, 0], n: [0, -0.2] },
  rack: { w: [0.2, 0], n: [0, -0.2] },
  box: { w: [0.2, 0], n: [0, -0.2] },
  pedido: { w: [0.2, 0], n: [0, -0.2] },
  cardio: { w: [0.2, 0], n: [0, -0.2] },
  open: { w: [0.2, 0], n: [0, -0.2] },
};
export const isNarrow = (vw: number) => vw < 760;
/** Corrimiento del encuadre de una toma en píxeles para una pantalla de vw × vh. */
export function lensPx(shot: ShotId, vw: number, vh: number): [number, number] {
  const l = LENS[shot]; if (!l) return [0, 0];
  const [fx, fy] = isNarrow(vw) ? l.n : l.w;
  return [fx * vw, fy * vh];
}

// ── Geometría del SVG (compartida con la proyección y la toma cenital del 3D) ─────────────────────────────────
/** px por metro en el viewBox del SVG. */
export const SVG_S = 20;
export const SVG_W = FLOOR.w * SVG_S, SVG_D = FLOOR.d * SVG_S;
export const svgX = (x: number) => (x + FLOOR.w / 2) * SVG_S, svgZ = (z: number) => (z + FLOOR.d / 2) * SVG_S;
/** Escala y margen del viewBox con `preserveAspectRatio="xMidYMid slice"` en una pantalla de vw × vh. */
export function svgFit(vw: number, vh: number) {
  const s0 = Math.max(vw / SVG_W, vh / SVG_D);
  return { s0, ox: (vw - SVG_W * s0) / 2, oy: (vh - SVG_D * s0) / 2 };
}
/** Píxeles de pantalla de un punto del mundo en el SVG, con la toma y el encuadre dados. */
export function svgProject(x: number, z: number, shot: ShotId, vw: number, vh: number) {
  const [cx, cz, zoom] = SHOTS[shot].svg, [lx, ly] = lensPx(shot, vw, vh), { s0, ox, oy } = svgFit(vw, vh);
  const ux = SVG_W / 2 + zoom * (svgX(x) - svgX(cx)), uy = SVG_D / 2 + zoom * (svgZ(z) - svgZ(cz));
  return { x: ox + ux * s0 + lx, y: oy + uy * s0 + ly };
}
