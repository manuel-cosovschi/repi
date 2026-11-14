// REPI Exercise Motion: el esqueleto. Proporciones de un adulto de 1,78 m (atlético, sin rasgos de género), cinemática
// inversa de dos segmentos para brazos y piernas e interpolación de poses. Funciones puras: corren igual en el servidor,
// en el navegador y en las pruebas.
import type { Ease, Key, Pair, Pose, Side, Vec, View } from "./types";

export const RIG = {
  thigh: 44, shin: 44, ankleH: 8, heel: 6, toe: 19,
  trunk: 50, neck: 19, headR: 10.5,
  upperArm: 30, foreGrip: 33, // del codo al centro del agarre (antebrazo + mano)
  shoulderHalf: 19, hipHalf: 9, // vista frontal
} as const;

export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
export const len = (a: Vec) => Math.hypot(a[0], a[1]);
export const norm = (a: Vec): Vec => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: Vec, b: Vec, t: number): Vec => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const rad = (d: number) => (d * Math.PI) / 180;
/** Dirección unitaria a `deg` grados de la vertical, girando hacia +x. */
export const dirFromVertical = (deg: number): Vec => [Math.sin(rad(deg)), Math.cos(rad(deg))];
const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];

/**
 * Cinemática inversa de dos segmentos: articulación intermedia (rodilla o codo) del lado que indica `hint`. Si el objetivo
 * queda fuera de alcance se estira el miembro hacia él y se informa cuánto faltó (`miss`, en cm) para que la validación lo vea.
 */
export function twoBone(root: Vec, target: Vec, a: number, b: number, hint: Vec) {
  const d = sub(target, root);
  const dist = len(d);
  const reach = Math.min(Math.max(dist, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const miss = dist > a + b ? dist - (a + b) : dist < Math.abs(a - b) ? Math.abs(a - b) - dist : 0;
  const u = norm(d);
  const cosA = (a * a + reach * reach - b * b) / (2 * a * reach);
  const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
  // Las dos soluciones giran `ang` a un lado u otro de la recta raíz→objetivo; gana la que queda del lado de `hint`.
  const side = Math.sign(cross(u, hint)) || 1;
  const c = Math.cos(ang * side), s = Math.sin(ang * side);
  const joint: Vec = add(root, mul([u[0] * c - u[1] * s, u[0] * s + u[1] * c], a));
  const end: Vec = add(root, mul(u, reach));
  return { joint, end: dist > a + b || dist < Math.abs(a - b) ? end : target, miss };
}

export type Body = {
  view: View;
  pelvis: Vec; up: Vec; front: Vec;
  /** Columna: punto medio y eje de la mitad superior (igual a `up`/`front` si no hay flexión). */
  mid: Vec; up2: Vec; front2: Vec;
  hip: Record<Side, Vec>; shoulder: Record<Side, Vec>; neck: Vec; head: Vec; headDir: Vec;
  knee: Record<Side, Vec>; ankle: Record<Side, Vec>; heel: Record<Side, Vec>; toe: Record<Side, Vec>;
  elbow: Record<Side, Vec>; hand: Record<Side, Vec>;
  miss: number;
};

/** Fracción del tronco (desde la cadera) donde se dobla la columna. */
export const SPINE_K = 0.45;
/** Punto del tronco a la fracción `t` (0 cadera, 1 hombros) y `off` cm hacia el frente, siguiendo la flexión de la columna. */
export function trunkAt(b: Pick<Body, "pelvis" | "up" | "front" | "mid" | "up2" | "front2">, t: number, off: number): Vec {
  if (t <= SPINE_K) return add(add(b.pelvis, mul(b.up, t * RIG.trunk)), mul(b.front, off));
  return add(add(b.mid, mul(b.up2, (t - SPINE_K) * RIG.trunk)), mul(b.front2, off));
}

const pick = <T,>(p: Pair<T>, s: Side): T => (s === "near" ? p.near : p.far ?? p.near);

/** Pose → posición de cada articulación. */
export function solve(pose: Pose, view: View): Body {
  const up = dirFromVertical(pose.trunk);
  // Frente del cuerpo: lateral, la normal hacia donde mira; frontal, hacia el observador (no se dibuja en profundidad).
  const front: Vec = view === "side" ? [up[1], -up[0]] : [0, 0];
  const across: Vec = [up[1], -up[0]]; // frontal: de derecha (near, −x) a izquierda (far, +x) de la figura
  const pelvis = pose.pelvis;
  const hip = {
    near: view === "side" ? pelvis : add(pelvis, mul(across, -RIG.hipHalf)),
    far: view === "side" ? pelvis : add(pelvis, mul(across, RIG.hipHalf)),
  };
  // Columna en dos tramos: la mitad inferior sigue `trunk` y la superior suma `curl` (sólo en la lateral).
  const curl = view === "side" ? pose.curl ?? 0 : 0;
  const mid = add(pelvis, mul(up, RIG.trunk * SPINE_K));
  const up2 = dirFromVertical(pose.trunk + curl);
  const front2: Vec = view === "side" ? [up2[1], -up2[0]] : [0, 0];
  const top = add(mid, mul(up2, RIG.trunk * (1 - SPINE_K)));
  const shoulder = {
    near: view === "side" ? add(top, mul(front2, -1)) : add(top, mul(across, -RIG.shoulderHalf)),
    far: view === "side" ? add(top, mul(front2, -1)) : add(top, mul(across, RIG.shoulderHalf)),
  };
  const headDir = dirFromVertical(pose.trunk + curl + (view === "side" ? pose.head ?? 0 : 0));
  const neck = add(top, mul(up2, 3));
  const head = add(top, mul(headDir, RIG.neck));
  let miss = 0;
  const knee = {} as Record<Side, Vec>, ankle = {} as Record<Side, Vec>, heel = {} as Record<Side, Vec>, toe = {} as Record<Side, Vec>;
  const elbow = {} as Record<Side, Vec>, hand = {} as Record<Side, Vec>;
  for (const s of ["near", "far"] as const) {
    const sign = s === "near" ? -1 : 1;
    const kHint = pose.knee?.[s] ?? (view === "side" ? front : mul(across, sign * 0.15));
    const k = pose.scale ?? {};
    const leg = twoBone(hip[s], pick(pose.foot, s), RIG.thigh * (k.thigh ?? 1), RIG.shin * (k.shin ?? 1), view === "side" ? kHint : add(kHint, [0, 0.01]));
    knee[s] = leg.joint; ankle[s] = leg.end; miss = Math.max(miss, leg.miss);
    const tilt = rad(pose.footTilt?.[s] ?? 0);
    // Pie: en la lateral apunta a +x (hacia adelante del mundo) salvo que el tronco esté de cabeza; la inclinación lo gira.
    const fwd: Vec = view === "side" ? [Math.cos(-tilt), Math.sin(-tilt)] : [sign * 0.35 * Math.cos(tilt), -Math.sin(tilt) * 0.6];
    // La planta queda `ankleH` por debajo del tobillo, perpendicular al pie (en la lateral gira con la inclinación).
    const sole: Vec = view === "side" ? mul([fwd[1], -fwd[0]], RIG.ankleH) : [0, -RIG.ankleH * Math.cos(tilt)];
    toe[s] = add(ankle[s], add(mul(fwd, RIG.toe), sole));
    heel[s] = add(ankle[s], add(mul(fwd, -RIG.heel), sole));
    const eHint = pose.elbow?.[s] ?? (view === "side" ? add(mul(front, -1), [0, -1]) : [sign, -0.6]);
    const arm = twoBone(shoulder[s], pick(pose.hand, s), RIG.upperArm * (k.upperArm ?? 1), RIG.foreGrip * (k.foreArm ?? 1), eHint);
    elbow[s] = arm.joint; hand[s] = arm.end; miss = Math.max(miss, arm.miss);
  }
  return { view, pelvis, up, front, mid, up2, front2, hip, shoulder, neck, head, headDir, knee, ankle, heel, toe, elbow, hand, miss };
}

const EASE: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

function mixVec(a: Vec | undefined, b: Vec | undefined, t: number): Vec | undefined {
  if (!a && !b) return undefined;
  return lerpV(a ?? b!, b ?? a!, t);
}
function mixPair(a: Pair<Vec>, b: Pair<Vec>, t: number): Pair<Vec> {
  return { near: lerpV(a.near, b.near, t), far: mixVec(a.far ?? a.near, b.far ?? b.near, t) };
}
function mixRec<T extends number | Vec>(a: Partial<Record<string, T>> | undefined, b: Partial<Record<string, T>> | undefined, t: number) {
  if (!a && !b) return undefined;
  const out: Record<string, T> = {};
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const x = a?.[k] ?? b?.[k], y = b?.[k] ?? a?.[k];
    out[k] = (typeof x === "number" ? lerp(x, y as number, t) : lerpV(x as Vec, y as Vec, t)) as T;
  }
  return out;
}

/** Pose en el instante `u` (0–1) del ciclo, interpolando entre poses clave con su curva. */
export function poseAt(keys: Key[], u: number): { pose: Pose; say?: string } {
  const x = ((u % 1) + 1) % 1;
  let i = keys.length - 1;
  for (let k = 0; k < keys.length; k++) if (keys[k].t <= x) i = k;
  const a = keys[i], b = keys[(i + 1) % keys.length];
  const span = (b.t > a.t ? b.t : b.t + 1) - a.t;
  const raw = span > 0 ? ((x < a.t ? x + 1 : x) - a.t) / span : 0;
  const t = EASE[a.ease ?? "inOut"](Math.max(0, Math.min(1, raw)));
  const p = a.pose, q = b.pose;
  const say = [...keys].reverse().find((k) => k.t <= x && k.say)?.say ?? keys.filter((k) => k.say).at(-1)?.say;
  return {
    say,
    pose: {
      pelvis: lerpV(p.pelvis, q.pelvis, t), trunk: lerp(p.trunk, q.trunk, t), curl: lerp(p.curl ?? 0, q.curl ?? 0, t), head: lerp(p.head ?? 0, q.head ?? 0, t),
      hand: mixPair(p.hand, q.hand, t), foot: mixPair(p.foot, q.foot, t),
      footTilt: mixRec(p.footTilt, q.footTilt, t), knee: mixRec(p.knee, q.knee, t), elbow: mixRec(p.elbow, q.elbow, t),
      scale: mixRec(p.scale, q.scale, t), props: mixRec(p.props, q.props, t),
    },
  };
}
