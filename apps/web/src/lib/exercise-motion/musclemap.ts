// Mapa muscular de REPI Exercise Motion: la misma figura, de pie, vista de frente y de espalda, con una zona por músculo.
// Las zonas salen de las articulaciones resueltas (no de una imagen), así que coinciden con el cuerpo de las demostraciones.
import { drawBody, limb, pathOf } from "./draw";
import type { MuscleId } from "./muscles";
import { add, lerpV, mul, norm, solve, sub } from "./rig";
import type { Pose, Prim, Side, Vec } from "./types";

const POSE: Pose = { pelvis: [0, 95.5], trunk: 0, hand: { near: [-31, 88], far: [31, 88] }, foot: { near: [-11, 8], far: [11, 8] }, elbow: { near: [-1, 0], far: [1, 0] } };
const BODY = solve(POSE, "front");
const at = (t: number, x: number): Vec => [BODY.pelvis[0] + x, BODY.pelvis[1] + t * 50];
const poly = (pts: [number, number][], mirror = 1) => pathOf(pts.map(([t, x]) => at(t, x * mirror)));
/** Banda a lo largo de un hueso, de `a` a `b` (fracciones), de ancho `w`, corrida `off` hacia un costado (+ = hacia +x). */
function band(p0: Vec, p1: Vec, a: number, b: number, w: number, off = 0) {
  const s = add(lerpV(p0, p1, a), [off, 0]), e = add(lerpV(p0, p1, b), [off, 0]);
  return pathOf(limb(s, e, w * 0.8, w, w * 0.7, 0.45));
}
const circle = (c: Vec, r: number) => { const pts: Vec[] = Array.from({ length: 18 }, (_, i) => add(c, [Math.cos((i / 18) * Math.PI * 2) * r, Math.sin((i / 18) * Math.PI * 2) * r])); return pathOf(pts); };

export type MapSide = "front" | "back";
export type Zone = { muscle: MuscleId; side: MapSide; d: string };

function zonesFor(s: Side): Zone[] {
  const sg = s === "near" ? -1 : 1; // near = lado derecho de la figura, en x negativa
  const sh = BODY.shoulder[s], el = BODY.elbow[s], hd = BODY.hand[s], hip = BODY.hip[s], kn = BODY.knee[s], an = BODY.ankle[s];
  const out = norm(sub(el, sh));
  const z = (muscle: MuscleId, side: MapSide, d: string): Zone => ({ muscle, side, d });
  return [
    // Frente
    z("pectoral", "front", poly([[0.62, 1], [0.62, 15], [0.74, 17.5], [0.8, 17.8], [0.8, 1]], sg)),
    z("pectoral_superior", "front", poly([[0.8, 1], [0.8, 17.8], [0.88, 18], [0.9, 6], [0.86, 1]], sg)),
    z("deltoide_anterior", "front", circle(add(sh, add(mul(out, 4), [-sg * 2.5, -1])), 5.2)),
    z("deltoide_lateral", "front", circle(add(sh, add(mul(out, 3), [sg * 3.5, 1])), 5.2)),
    z("biceps", "front", band(sh, el, 0.3, 0.9, 7.5)),
    z("antebrazo", "front", band(el, hd, 0.1, 0.75, 7)),
    z("serrato", "front", poly([[0.56, 13.5], [0.72, 16.2], [0.68, 12], [0.56, 11.5]], sg)),
    z("recto_abdominal", "front", poly([[0.1, 0.6], [0.1, 5.5], [0.58, 6], [0.58, 0.6]], sg)),
    z("oblicuos", "front", poly([[0.12, 7], [0.5, 8], [0.5, 13], [0.12, 14]], sg)),
    z("flexores_cadera", "front", poly([[-0.04, 5], [0.08, 7], [0.08, 12], [-0.1, 10]], sg)),
    z("gluteo_medio", "front", poly([[-0.16, 11.5], [0.04, 14.5], [0.04, 16.5], [-0.16, 16.5]], sg)),
    z("trapecio", "front", poly([[0.95, 6], [1.03, 9], [0.98, 16], [0.93, 14]], sg)),
    z("cuadriceps", "front", band(hip, kn, 0.14, 0.88, 11.5, sg * 1)),
    z("aductores", "front", band(hip, kn, 0.08, 0.6, 5.5, -sg * 5)),
    z("gemelos", "front", band(kn, an, 0.12, 0.5, 4.5, -sg * 3)),
    // Espalda
    z("trapecio", "back", poly([[0.66, 0.6], [0.86, 6], [1.0, 8], [1.03, 4], [1.04, 0.6]], sg)),
    z("deltoide_posterior", "back", circle(add(sh, mul(out, 3.5)), 6.4)),
    z("infraespinoso", "back", poly([[0.72, 7], [0.86, 8], [0.9, 15.5], [0.78, 15]], sg)),
    z("espalda_media", "back", poly([[0.62, 0.6], [0.66, 6.5], [0.86, 7], [0.82, 0.6]], sg)),
    z("dorsal", "back", poly([[0.34, 6.5], [0.62, 7], [0.76, 15.5], [0.66, 17.5], [0.48, 14], [0.34, 10]], sg)),
    z("lumbar", "back", poly([[0.06, 0.6], [0.06, 6.5], [0.36, 6], [0.36, 0.6]], sg)),
    z("gluteo_mayor", "back", poly([[-0.24, 1], [0.04, 1], [0.04, 11], [-0.06, 15], [-0.24, 13]], sg)),
    z("gluteo_medio", "back", poly([[0.04, 8], [0.12, 9], [0.08, 16], [-0.04, 16]], sg)),
    z("triceps", "back", band(sh, el, 0.28, 0.9, 7.5)),
    z("antebrazo", "back", band(el, hd, 0.1, 0.75, 7)),
    z("isquiotibiales", "back", band(hip, kn, 0.22, 0.88, 11)),
    z("aductores", "back", band(hip, kn, 0.1, 0.5, 4.5, -sg * 5.5)),
    z("gemelos", "back", band(kn, an, 0.08, 0.5, 10)),
    z("soleo", "back", band(kn, an, 0.5, 0.82, 7.5)),
  ];
}

export const ZONES: Zone[] = [...zonesFor("near"), ...zonesFor("far")];
/** Silueta (igual de frente y de espalda) y su encuadre en pantalla. */
export const SILHOUETTE: Prim[] = (() => { const b = drawBody(BODY, null); return [...b.back, ...b.torso, ...b.front].map((p) => (p.cls === "mo-visor" ? null : p)).filter((p): p is Prim => !!p); })();
export const MAP_VIEWBOX: [number, number, number, number] = [-52, -192, 104, 196];
/** Músculos que se pueden ubicar en el mapa (en qué lado se ven). */
export const sidesOf = (m: MuscleId): MapSide[] => [...new Set(ZONES.filter((z) => z.muscle === m).map((z) => z.side))];
