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

/** Posición de la persona i con todo lo que la escena pide: su recorrido, Sofía que camina hasta Julián (`walk`) y la vuelta
 *  al punto del cierre (`gather`, por una curva: no en línea recta). La usan el SVG y el 3D por igual. */
export function placePerson(i: number, t: number, s: { walk: number; gather: number; origin: [number, number] }): [number, number] {
  const p = PEOPLE[i];
  let [x, z] = along(p, t);
  if (p.id === "sofia" && s.walk > 0) { const k = smooth(s.walk); x += (BESIDE_JULIAN[0] - x) * k; z += (BESIDE_JULIAN[1] - z) * k; }
  if (s.gather > 0) {
    const d = gatherDelay(i, [x, z], s.origin);
    const k = smooth((s.gather - d) / (1 - d));
    if (k > 0) {
      const dx = s.origin[0] - x, dz = s.origin[1] - z, len = Math.hypot(dx, dz) || 1;
      const bend = Math.sin(Math.PI * k) * Math.min(4, len * 0.22) * (i % 2 ? 1 : -1);
      x += dx * k + (-dz / len) * bend; z += dz * k + (dx / len) * bend;
    }
  }
  return [x, z];
}

/** Tomas de cámara por escena: posición y punto de mira del 3D, y `svg` (centro x, z y zoom) para la misma toma en el plano.
 *  El zoom del SVG llega hasta 2,4: más cerca, las personas y los equipos dejan de leerse como plano. */
export type Shot = { pos: [number, number, number]; look: [number, number, number]; svg: [number, number, number] };
export const SVG_ZOOM_MAX = 2.4;
export const SHOTS = {
  dark: { pos: [22, 34, 34], look: [2, 0, 0], svg: [0, 0, 0.9] },
  /** Cenital del 3D con el mismo encuadre que el SVG del hero: el 3D entra sin cambiar el punto de vista (SalaCanvas la
   *  recalcula en el cliente con el tamaño de la pantalla; estos valores son sólo el respaldo). */
  plan: { pos: [0, 30, 0.01], look: [0, 0, 0], svg: [0, 0, 1] },
  hero: { pos: [14, 20, 24], look: [2, 0, 0], svg: [0, 0, 1] },
  problem: { pos: [-8, 18, 20], look: [0, 0, 0], svg: [0, 0, 1.15] },
  training: { pos: [1.5, 7.5, 9], look: [-2, 0.6, 0.4], svg: [-2, 0.4, 2.4] },
  gimnasios: { pos: [0, 16, 22], look: [0, 0, 7], svg: [0, 7, 1.6] },
  entrenadores: { pos: [-9, 9, 6], look: [-14, 0, -5], svg: [-13, -4, 2.4] },
  deportistas: { pos: [2, 8, 9], look: [-2, 0.5, -1], svg: [-2, 0, 2.4] },
  aliados: { pos: [0, 46, 0.5], look: [0, 0, 0], svg: [0, 0, 0.85] },
  showcase: { pos: [16, 12, 12], look: [9, 0, -2], svg: [9, -2, 2] },
  rack: { pos: [4, 9, 10], look: [-2, 0.5, -1.2], svg: [-2, -1, 2.2] },
  box: { pos: [-7, 10, 5], look: [-14, 0, -5], svg: [-13, -4, 2.2] },
  pedido: { pos: [-3, 15, 11], look: [-9.5, 0, -3.5], svg: [-9.5, -3.2, 1.9] },
  cardio: { pos: [7, 10, 19], look: [0, 0, 8], svg: [0, 7.5, 2] },
  open: { pos: [0, 24, 26], look: [0, 0, 1], svg: [0, 0, 1.1] },
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
