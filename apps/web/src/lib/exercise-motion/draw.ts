// REPI Exercise Motion: el dibujo. Convierte un cuerpo resuelto y el equipamiento en primitivas SVG con clases por tema
// (estilos en styles/motion.css). Estilo «Motion Lab»: figura técnica de volúmenes limpios, sin rasgos de persona, con la
// zona que trabaja marcada en el propio cuerpo.
import { add, lerpV, mul, norm, sub, trunkAt, type Body } from "./rig";
import type { MuscleId } from "./muscles";
import type { Prim, Side, Vec } from "./types";

/** Mundo (y hacia arriba) → pantalla (y hacia abajo). */
export const scr = (p: Vec): Vec => [p[0], -p[1]];
const f = (n: number) => Math.round(n * 10) / 10;
export const pathOf = (pts: Vec[]) => "M" + pts.map((p) => `${f(p[0])},${f(-p[1])}`).join("L") + "Z";

/** Contorno de un segmento con forma (ancho en el inicio, el vientre y el final), con extremos redondeados. */
export function limb(p0: Vec, p1: Vec, w0: number, wm: number, w1: number, belly = 0.38): Vec[] {
  const u = norm(sub(p1, p0)), v: Vec = [-u[1], u[0]];
  const T = [0, 0.12, 0.25, belly, 0.55, 0.72, 0.88, 1];
  const width = (t: number) => (t <= belly ? w0 + (wm - w0) * Math.sin((t / belly) * (Math.PI / 2)) : wm + (w1 - wm) * (1 - Math.cos(((t - belly) / (1 - belly)) * (Math.PI / 2))));
  const left = T.map((t) => add(lerpV(p0, p1, t), mul(v, width(t) / 2)));
  const right = T.map((t) => add(lerpV(p0, p1, t), mul(v, -width(t) / 2))).reverse();
  const cap = (c: Vec, r: number, from: Vec, n = 6) => Array.from({ length: n }, (_, i) => {
    const a = Math.atan2(from[1], from[0]) - (Math.PI * (i + 1)) / (n + 1);
    return add(c, [Math.cos(a) * r, Math.sin(a) * r]);
  });
  return [...left, ...cap(p1, w1 / 2, v), ...right, ...cap(p0, w0 / 2, mul(v, -1))];
}

/** Medio contorno de un segmento, del lado `n` (para marcar el músculo que trabaja). */
function halfLimb(p0: Vec, p1: Vec, w0: number, wm: number, w1: number, n: Vec, from = 0.12, to = 0.88): Vec[] {
  const u = norm(sub(p1, p0));
  let v: Vec = [-u[1], u[0]];
  if (v[0] * n[0] + v[1] * n[1] < 0) v = mul(v, -1);
  const T = Array.from({ length: 7 }, (_, i) => from + ((to - from) * i) / 6);
  const w = (t: number) => (t < 0.38 ? w0 + (wm - w0) * (t / 0.38) : wm + (w1 - wm) * ((t - 0.38) / 0.62));
  const out = T.map((t) => add(lerpV(p0, p1, t), mul(v, w(t) / 2 - 0.4)));
  const inn = T.map((t) => add(lerpV(p0, p1, t), mul(v, w(t) * 0.04))).reverse();
  return [...out, ...inn];
}

type Mark = { primary: Set<MuscleId>; secondary: Set<MuscleId> };
const tone = (m: Mark, ids: MuscleId[]) => (ids.some((x) => m.primary.has(x)) ? "mo-hot" : ids.some((x) => m.secondary.has(x)) ? "mo-warm" : null);

/** Lado convexo de una articulación (hacia donde «apunta» la rodilla o el codo); si el miembro está recto, `fallback`. */
function convex(a: Vec, j: Vec, b: Vec, fallback: Vec): Vec {
  const mid = lerpV(a, b, 0.5), d = sub(j, mid);
  return Math.hypot(d[0], d[1]) > 1.2 ? norm(d) : fallback;
}

// ── Vista lateral ────────────────────────────────────────────────────────────
function torsoSide(b: Body): Vec[] {
  const at = (t: number, off: number): Vec => trunkAt(b, t, off);
  // Perfil: adelante (abdomen, pecho) y atrás (glúteo, lumbar, espalda alta), de la cadera al hombro.
  const fr: [number, number][] = [[-0.14, 7], [0.05, 11], [0.28, 11], [0.5, 12], [0.66, 14], [0.8, 13], [0.93, 9], [1.04, 5]];
  const bk: [number, number][] = [[1.04, -6], [0.92, -12], [0.78, -13], [0.6, -11], [0.38, -9.5], [0.18, -12], [0.02, -15], [-0.14, -12]];
  return [...fr.map(([t, o]) => at(t, o)), ...bk.map(([t, o]) => at(t, o))];
}
function torsoSideMarks(b: Body, m: Mark): Prim[] {
  const at = (t: number, off: number): Vec => trunkAt(b, t, off);
  const zone = (ids: MuscleId[], pts: [number, number][]): Prim | null => { const c = tone(m, ids); return c ? { el: "path", d: pathOf(pts.map(([t, o]) => at(t, o))), cls: c } : null; };
  return [
    zone(["pectoral", "pectoral_superior"], [[0.6, 1], [0.6, 11.5], [0.7, 13.8], [0.8, 12], [0.88, 9.5], [0.88, 1]]),
    zone(["recto_abdominal", "oblicuos"], [[0.08, 1], [0.08, 9.9], [0.3, 9.7], [0.5, 11.1], [0.56, 11.1], [0.56, 1]]),
    zone(["dorsal", "serrato"], [[0.42, -1], [0.42, -9.7], [0.6, -10.8], [0.76, -12.2], [0.76, -1]]),
    zone(["espalda_media", "trapecio", "infraespinoso"], [[0.76, -1], [0.76, -12.2], [0.9, -11.5], [1.0, -7.3], [1.0, -1]]),
    zone(["lumbar"], [[0.06, -1], [0.06, -13.6], [0.2, -11.5], [0.4, -9.7], [0.4, -1]]),
    zone(["gluteo_mayor", "gluteo_medio"], [[-0.12, -2.3], [-0.12, -12.4], [0.02, -15.3], [0.12, -13], [0.12, -2.3]]),
  ].filter((x): x is Prim => !!x);
}

function legSide(b: Body, s: Side, m: Mark | null, far: boolean): Prim[] {
  const hip = b.hip[s], knee = b.knee[s], ank = b.ankle[s], toe = b.toe[s], heel = b.heel[s];
  const cls = far ? "mo-body-far" : "mo-body";
  const out: Prim[] = [
    { el: "path", d: pathOf(limb(hip, knee, 18, 17, 11.5, 0.3)), cls },
    { el: "path", d: pathOf(limb(knee, ank, 11.5, 12.5, 7, 0.32)), cls },
    { el: "path", d: pathOf([add(heel, [0, 1.5]), lerpV(heel, toe, 0.25), toe, add(toe, mul(norm(sub(toe, heel)), -2)), add(lerpV(heel, toe, 0.6), add(mul(norm(sub(toe, heel)), 0), [0, 0])), add(ank, mul(norm(sub(toe, heel)), 4)), add(ank, mul(norm(sub(toe, heel)), -3))]), cls },
  ];
  if (m && !far) {
    const kneeOut = convex(hip, knee, ank, b.front.every((x) => x === 0) ? [0, 1] : b.front);
    const toeDir = norm(sub(toe, heel));
    const marks: [MuscleId[], Vec, Vec, Vec, number, number, number][] = [
      [["cuadriceps"], hip, knee, kneeOut, 18, 17, 11.5],
      [["isquiotibiales"], hip, knee, mul(kneeOut, -1), 18, 17, 11.5],
      [["gemelos", "soleo"], knee, ank, mul(toeDir, -1), 11.5, 12.5, 7],
    ];
    for (const [ids, a, z, side, w0, wm, w1] of marks) { const c = tone(m, ids); if (c) out.push({ el: "path", d: pathOf(halfLimb(a, z, w0, wm, w1, side)), cls: c }); }
  }
  return out;
}

function armSide(b: Body, s: Side, m: Mark | null, far: boolean): Prim[] {
  const sh = b.shoulder[s], el = b.elbow[s], hd = b.hand[s];
  const cls = far ? "mo-body-far" : "mo-body";
  const wrist = add(hd, mul(norm(sub(el, hd)), 6));
  const out: Prim[] = [
    { el: "path", d: pathOf(limb(sh, el, 12.5, 11, 8, 0.4)), cls },
    { el: "path", d: pathOf(limb(el, wrist, 8, 8.5, 6, 0.3)), cls },
    { el: "circle", ...circ(hd, 4.2), cls },
  ];
  if (m && !far) {
    const out2 = convex(sh, el, hd, b.front.every((x) => x === 0) ? [1, 0] : b.front);
    // En el codo flexionado el bíceps queda del lado cóncavo y el tríceps del convexo.
    const bic = mul(out2, -1);
    const deltoid = tone(m, ["deltoide_anterior", "deltoide_lateral", "deltoide_posterior"]);
    if (deltoid) out.push({ el: "path", d: pathOf(limb(sh, lerpV(sh, el, 0.32), 13.5, 12.5, 10, 0.4)), cls: deltoid });
    const c1 = tone(m, ["biceps"]); if (c1) out.push({ el: "path", d: pathOf(halfLimb(sh, el, 12.5, 11, 8, bic, 0.3)), cls: c1 });
    const c2 = tone(m, ["triceps"]); if (c2) out.push({ el: "path", d: pathOf(halfLimb(sh, el, 12.5, 11, 8, out2, 0.3)), cls: c2 });
    const c3 = tone(m, ["antebrazo"]); if (c3) out.push({ el: "path", d: pathOf(limb(el, wrist, 7, 7.5, 5, 0.3)), cls: c3 });
  }
  return out;
}

function headPrims(b: Body, far = false): Prim[] {
  const out: Prim[] = [
    { el: "path", d: pathOf(limb(b.neck, add(b.neck, mul(norm(sub(b.head, b.neck)), 12)), 9, 8.5, 8)), cls: "mo-body" },
    { el: "circle", ...circ(b.head, 10.5), cls: far ? "mo-body-far" : "mo-body" },
  ];
  if (b.view === "side") {
    // Visor: indica hacia dónde mira la figura, sin dibujar una cara.
    const hd = norm(sub(b.head, b.neck)), fr: Vec = [hd[1], -hd[0]];
    const a = add(b.head, add(mul(fr, 7.6), mul(hd, 3))), z = add(b.head, add(mul(fr, 9.6), mul(hd, -1.5)));
    out.push({ el: "line", x1: a[0], y1: -a[1], x2: z[0], y2: -z[1], cls: "mo-visor", w: 2.6 });
  }
  return out;
}

const circ = (c: Vec, r: number) => ({ cx: f(c[0]), cy: f(-c[1]), r });

// ── Vista frontal ────────────────────────────────────────────────────────────
function torsoFront(b: Body): Vec[] {
  const { pelvis: h, up } = b;
  const ac: Vec = [up[1], -up[0]];
  const at = (t: number, x: number): Vec => add(add(h, mul(up, t * 50)), mul(ac, x));
  const half: [number, number][] = [[-0.14, 15], [0.05, 15.5], [0.3, 13], [0.5, 14.5], [0.72, 17], [0.88, 21], [0.98, 20], [1.04, 8]];
  return [...half.map(([t, x]) => at(t, x)), ...half.slice().reverse().map(([t, x]) => at(t, -x))];
}
function torsoFrontMarks(b: Body, m: Mark): Prim[] {
  const { pelvis: h, up } = b;
  const ac: Vec = [up[1], -up[0]];
  const at = (t: number, x: number): Vec => add(add(h, mul(up, t * 50)), mul(ac, x));
  const zone = (ids: MuscleId[], pts: [number, number][]) => { const c = tone(m, ids); return c ? [{ el: "path" as const, d: pathOf(pts.map(([t, x]) => at(t, x))), cls: c }] : []; };
  const pec = (sg: number): [number, number][] => [[0.62, 1 * sg], [0.62, 15 * sg], [0.74, 17.5 * sg], [0.88, 18 * sg], [0.9, 6 * sg], [0.84, 1 * sg]];
  return [
    ...zone(["pectoral", "pectoral_superior"], pec(1)), ...zone(["pectoral", "pectoral_superior"], pec(-1)),
    ...zone(["recto_abdominal"], [[0.1, 5.5], [0.58, 6], [0.58, -6], [0.1, -5.5]]),
    ...zone(["oblicuos"], [[0.12, 7], [0.5, 8], [0.5, 13], [0.12, 14]]), ...zone(["oblicuos"], [[0.12, -7], [0.5, -8], [0.5, -13], [0.12, -14]]),
    ...zone(["gluteo_medio"], [[-0.16, 11], [0.04, 14.5], [0.04, 17], [-0.16, 17]]), ...zone(["gluteo_medio"], [[-0.16, -11], [0.04, -14.5], [0.04, -17], [-0.16, -17]]),
    ...zone(["trapecio"], [[0.95, 6], [1.03, 9], [0.98, 16], [0.93, 14]]), ...zone(["trapecio"], [[0.95, -6], [1.03, -9], [0.98, -16], [0.93, -14]]),
  ];
}
function legFront(b: Body, s: Side, m: Mark | null): Prim[] {
  const hip = b.hip[s], knee = b.knee[s], ank = b.ankle[s], toe = b.toe[s];
  const out: Prim[] = [
    { el: "path", d: pathOf(limb(hip, knee, 17, 15.5, 11, 0.3)), cls: "mo-body" },
    { el: "path", d: pathOf(limb(knee, ank, 11, 11.5, 6.5, 0.32)), cls: "mo-body" },
    { el: "path", d: pathOf(limb(ank, toe, 7, 8, 6, 0.5)), cls: "mo-body" },
  ];
  if (m) {
    const inward: Vec = norm(sub(b.pelvis, hip));
    const c1 = tone(m, ["cuadriceps"]); if (c1) out.push({ el: "path", d: pathOf(limb(lerpV(hip, knee, 0.12), lerpV(hip, knee, 0.86), 11, 11.5, 7)), cls: c1 });
    const c2 = tone(m, ["aductores"]); if (c2) out.push({ el: "path", d: pathOf(halfLimb(hip, knee, 17, 15.5, 11, inward, 0.06, 0.72)), cls: c2 });
  }
  return out;
}
function armFront(b: Body, s: Side, m: Mark | null): Prim[] {
  const sh = b.shoulder[s], el = b.elbow[s], hd = b.hand[s];
  const wrist = add(hd, mul(norm(sub(el, hd)), 6));
  const out: Prim[] = [
    { el: "path", d: pathOf(limb(sh, el, 12, 10.5, 8, 0.4)), cls: "mo-body" },
    { el: "path", d: pathOf(limb(el, wrist, 8, 8, 6, 0.3)), cls: "mo-body" },
    { el: "circle", ...circ(hd, 4.2), cls: "mo-body" },
  ];
  if (m) {
    const d = tone(m, ["deltoide_lateral", "deltoide_anterior", "deltoide_posterior"]); if (d) out.push({ el: "circle", ...circ(add(sh, mul(norm(sub(el, sh)), 3)), 7.2), cls: d });
    const c = tone(m, ["biceps"]); if (c) out.push({ el: "path", d: pathOf(limb(lerpV(sh, el, 0.3), lerpV(sh, el, 0.9), 7, 7.5, 5.5)), cls: c });
  }
  return out;
}

/** El cuerpo completo, en capas: lo de atrás, el tronco y lo de adelante. Devuelve las tres para intercalar el equipamiento. */
export function drawBody(b: Body, muscles: { primary: MuscleId[]; secondary: MuscleId[] } | null) {
  const m: Mark | null = muscles ? { primary: new Set(muscles.primary), secondary: new Set(muscles.secondary) } : null;
  if (b.view === "side") {
    return {
      back: [...armSide(b, "far", null, true), ...legSide(b, "far", null, true)],
      torso: [{ el: "path" as const, d: pathOf(torsoSide(b)), cls: "mo-body" }, ...(m ? torsoSideMarks(b, m) : []), ...headPrims(b)],
      front: [...legSide(b, "near", m, false), ...armSide(b, "near", m, false)],
    };
  }
  return {
    back: [...legFront(b, "near", m), ...legFront(b, "far", m)],
    torso: [{ el: "path" as const, d: pathOf(torsoFront(b)), cls: "mo-body" }, ...(m ? torsoFrontMarks(b, m) : []), ...headPrims(b)],
    front: [...armFront(b, "near", m), ...armFront(b, "far", m)],
  };
}

