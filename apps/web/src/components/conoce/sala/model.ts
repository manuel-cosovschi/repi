// Experience 3.0 · «La sala en vivo» (docs/comercial/EXPERIENCE_3.md). Modelo único de la sala: lo dibujan la escena 3D
// (SalaCanvas) y la alternativa liviana en SVG (SalaSvg) con las mismas zonas, equipos, personas y tomas de cámara.
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
/** El rack donde entrena Valentina en la escena del entrenamiento. */
export const HERO_RACK: [number, number] = [-2, 0];

/** Personas: recorrido cerrado por estaciones (x, z) y tipo. Socios en cian, equipo en turquesa. Determinístico. */
export type Person = { kind: "member" | "staff"; path: [number, number][]; speed: number; phase: number };
export const PEOPLE: Person[] = [
  { kind: "member", path: [[-12, 10], [-6, 6], [-2, 1.2], [-2, 1.2], [-6, 6], [-12, 10]], speed: 0.03, phase: 0.1 },
  { kind: "member", path: [[-6, 1.2], [-6, 1.2], [-6, -3.6], [-6, -3.6]], speed: 0.05, phase: 0.4 },
  { kind: "member", path: [[2, -3.6], [2, 1.2], [6, 3], [11, 2.2], [11, 2.2]], speed: 0.035, phase: 0.2 },
  { kind: "member", path: [[7, -5.6], [7, -5.6], [11, -5.6], [11, -5.6]], speed: 0.045, phase: 0.7 },
  { kind: "member", path: [[15, -5.6], [15, -1.6], [15, -1.6], [15, -5.6]], speed: 0.04, phase: 0.5 },
  { kind: "member", path: [[-5, 6.8], [-5, 6.8], [0, 6.8], [0, 6.8]], speed: 0.05, phase: 0.9 },
  { kind: "member", path: [[2.5, 6.8], [5, 6.8], [5, 6.8], [2.5, 6.8]], speed: 0.04, phase: 0.3 },
  { kind: "member", path: [[7, -1.6], [7, -1.6], [11, -1.6], [11, -1.6], [7, -1.6]], speed: 0.03, phase: 0.6 },
  { kind: "member", path: [[-13, 7], [-9, 4], [-2, -3.6], [-2, -3.6], [-9, 4], [-13, 7]], speed: 0.025, phase: 0.85 },
  { kind: "member", path: [[2, -3.6], [2, -3.6], [-2, -3.6]], speed: 0.04, phase: 0.15 },
  { kind: "staff", path: [[-14, -3], [-9, -1], [-3, 1.8], [3, -1], [9, 0], [3, 3], [-9, 1], [-14, -3]], speed: 0.018, phase: 0 },
  { kind: "staff", path: [[-12, 9.5], [-12, 9.5], [-9, 9], [-12, 9.5]], speed: 0.03, phase: 0.5 },
  { kind: "staff", path: [[13, 8], [13, 8], [15, 9], [13, 8]], speed: 0.02, phase: 0.2 },
];

/** Posición en un recorrido para el tiempo t (segundos). */
export function along(p: Person, t: number): [number, number] {
  const segs = p.path.length;
  const u = (((t * p.speed + p.phase) % 1) + 1) % 1 * segs;
  const i = Math.floor(u), f = u - i;
  const a = p.path[i % segs], b = p.path[(i + 1) % segs];
  const e = f * f * (3 - 2 * f);
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
}

/** Tomas de cámara por escena: posición y punto de mira. El SVG usa `svg` (centro x, z y zoom) para la misma toma. */
export type Shot = { pos: [number, number, number]; look: [number, number, number]; svg: [number, number, number] };
export const SHOTS = {
  dark: { pos: [22, 34, 34], look: [2, 0, 0], svg: [0, 0, 0.9] },
  hero: { pos: [14, 20, 24], look: [2, 0, 0], svg: [0, 0, 1] },
  problem: { pos: [-8, 18, 20], look: [0, 0, 0], svg: [0, 0, 1.15] },
  training: { pos: [-0.4, 3.4, 4.2], look: [-2, 0.9, -0.4], svg: [-2, 0, 4] },
  gimnasios: { pos: [0, 16, 22], look: [0, 0, 7], svg: [0, 7, 1.6] },
  entrenadores: { pos: [-9, 8, 5], look: [-14, 0, -5], svg: [-13, -4, 2.6] },
  deportistas: { pos: [1.5, 4.5, 4.5], look: [-2, 0.8, -1], svg: [-2, 0, 3.6] },
  aliados: { pos: [0, 46, 0.5], look: [0, 0, 0], svg: [0, 0, 0.85] },
  showcase: { pos: [16, 12, 12], look: [9, 0, -2], svg: [9, -2, 2] },
  finale: { pos: [0, 52, 6], look: [0, 0, 0], svg: [0, 0, 0.8] },
} satisfies Record<string, Shot>;
export type ShotId = keyof typeof SHOTS;
