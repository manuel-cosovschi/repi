// REPI Exercise Motion: el cuadro. Pose del instante → cuerpo resuelto → equipamiento → primitivas ordenadas en capas, más el
// encuadre (calculado una vez por ejercicio con todo el recorrido, así la cámara no se mueve).
import { drawBody, limb, pathOf } from "./draw";
import type { MuscleId } from "./muscles";
import { add, len, mul, norm, poseAt, solve, sub, trunkAt, type Body } from "./rig";
import type { Bind, MotionSpec, Pose, Prim, Prop, Vec } from "./types";

type Ctx = { b: Body; pose: Pose };

/** Punto ligado al cuerpo: «hand.near», «knee.far», «shoulder», «hip», «head», «chest», «pelvis», con «+dx,dy» opcional. */
function point(ctx: Ctx, ref: string): Vec {
  const [name, off] = ref.split("+");
  const [part, side = "near"] = name.split(".") as [string, "near" | "far"];
  const { b } = ctx;
  const sideOf = (r: Record<"near" | "far", Vec>) => r[side];
  let p: Vec;
  switch (part) {
    case "hand": p = sideOf(b.hand); break;
    case "elbow": p = sideOf(b.elbow); break;
    case "shoulder": p = sideOf(b.shoulder); break;
    case "hip": p = sideOf(b.hip); break;
    case "knee": p = sideOf(b.knee); break;
    case "foot": case "ankle": p = sideOf(b.ankle); break;
    case "toe": p = sideOf(b.toe); break;
    case "heel": p = sideOf(b.heel); break;
    case "head": p = b.head; break;
    case "neck": p = b.neck; break;
    case "pelvis": p = b.pelvis; break;
    case "chest": p = trunkAt(b, 0.72, 11); break;
    case "back": p = trunkAt(b, 0.8, -11); break;
    case "shin": p = add(sideOf(b.ankle), mul(norm(sub(sideOf(b.knee), sideOf(b.ankle))), 9)); break;
    case "thigh": p = add(sideOf(b.knee), mul(norm(sub(sideOf(b.hip), sideOf(b.knee))), 12)); break;
    case "upperarm": p = add(sideOf(b.elbow), mul(norm(sub(sideOf(b.shoulder), sideOf(b.elbow))), 7)); break;
    default: throw new Error(`motion: punto desconocido «${ref}»`);
  }
  if (off) { const [dx, dy] = off.split(",").map(Number); p = add(p, [dx || 0, dy || 0]); }
  return p;
}
function num(ctx: Ctx, v: Bind): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.startsWith("props.")) return ctx.pose.props?.[v.slice(6)] ?? 0;
  throw new Error(`motion: número inválido ${JSON.stringify(v)}`);
}
function vec(ctx: Ctx, v: Bind | Bind[] | boolean | undefined): Vec {
  if (typeof v === "string") return point(ctx, v);
  if (Array.isArray(v)) return [num(ctx, v[0] as Bind), num(ctx, v[1] as Bind)];
  throw new Error(`motion: punto inválido ${JSON.stringify(v)}`);
}
const n = (ctx: Ctx, p: Prop, k: string, d: number) => (p[k] === undefined ? d : num(ctx, p[k] as Bind));
const circle = (c: Vec, r: number, cls: string, o?: number): Prim => ({ el: "circle", cx: c[0], cy: -c[1], r, cls, o });
const line = (a: Vec, b: Vec, cls: string, w: number): Prim => ({ el: "line", x1: a[0], y1: -a[1], x2: b[0], y2: -b[1], cls, w });
const capsule = (a: Vec, b: Vec, w: number, cls: string): Prim => ({ el: "path", d: pathOf(limb(a, b, w, w, w, 0.5)), cls });

/** El equipamiento. Cada pieza es geometría simple en el mundo; las que se mueven siguen a la mano, al pie o a un valor animado. */
function drawProp(ctx: Ctx, p: Prop): Prim[] {
  switch (p.kind) {
    case "tube": return [capsule(vec(ctx, p.a), vec(ctx, p.b), n(ctx, p, "w", 4), "mo-steel")];
    case "pad": return [capsule(vec(ctx, p.a), vec(ctx, p.b), n(ctx, p, "t", 9), "mo-pad")];
    case "plate": return [capsule(vec(ctx, p.a), vec(ctx, p.b), n(ctx, p, "t", 3.5), "mo-steel")];
    case "disc": { // disco de barra visto de costado (va semitransparente: la mano queda adentro, del otro lado del disco)
      const c = vec(ctx, p.at), r = n(ctx, p, "r", 21);
      return [circle(c, r, "mo-plate", 0.62), circle(c, r * 0.62, "mo-plate-ring", 0.9), circle(c, 3.2, "mo-hub")];
    }
    case "dumbbell": { // mancuerna vista desde la punta
      const c = vec(ctx, p.at), r = n(ctx, p, "r", 8.5);
      return [circle(c, r, "mo-plate"), circle(c, r * 0.45, "mo-hub")];
    }
    case "dumbbell-side": { // mancuerna vista de costado: mango con dos discos, en la dirección `dir` (grados desde la horizontal)
      const c = vec(ctx, p.at), a = (n(ctx, p, "dir", 0) * Math.PI) / 180, h = n(ctx, p, "half", 9), u: Vec = [Math.cos(a), Math.sin(a)];
      const e1 = add(c, mul(u, h)), e2 = add(c, mul(u, -h));
      return [line(e1, e2, "mo-steel-line", 2.6), capsule(add(e1, mul(u, -1.5)), add(e1, mul(u, 3)), 14, "mo-plate"), capsule(add(e2, mul(u, 1.5)), add(e2, mul(u, -3)), 14, "mo-plate")];
    }
    case "bar": { // barra vista de frente o de arriba: de un punto a otro, con discos en las puntas si `plates`
      const a = vec(ctx, p.a), b = vec(ctx, p.b), u = norm(sub(b, a)), ext = n(ctx, p, "ext", 0);
      const a2 = add(a, mul(u, -ext)), b2 = add(b, mul(u, ext));
      const out: Prim[] = [line(a2, b2, "mo-steel-line", n(ctx, p, "w", 2.8))];
      if (p.plates) { const r = n(ctx, p, "r", 22.5); for (const e of [a2, b2]) out.push(capsule(add(e, mul(u, -2.5)), add(e, mul(u, 2.5)), r * 2, "mo-plate")); }
      return out;
    }
    case "handle": return [circle(vec(ctx, p.at), n(ctx, p, "r", 3), "mo-hub")];
    case "roller": return [circle(vec(ctx, p.at), n(ctx, p, "r", 6), "mo-pad")];
    case "pulley": return [circle(vec(ctx, p.at), n(ctx, p, "r", 4.5), "mo-steel"), circle(vec(ctx, p.at), 1.4, "mo-hub")];
    case "cable": return [line(vec(ctx, p.a), vec(ctx, p.b), "mo-cable", 1.4)];
    case "rope": { // soga de tríceps: dos cabos desde el punto de enganche hacia las manos
      const top = vec(ctx, p.at);
      return [line(top, vec(ctx, p.to), "mo-rope", 3), circle(vec(ctx, p.to), 2.6, "mo-hub")];
    }
    case "lever": { // brazo de máquina que gira en `pivot` y llega al punto de contacto `at`
      const pv = vec(ctx, p.pivot), at = vec(ctx, p.at);
      const out: Prim[] = [capsule(pv, at, n(ctx, p, "w", 4.5), "mo-steel"), circle(pv, 3.6, "mo-hub")];
      if (p.roller) out.push(circle(at, n(ctx, p, "r", 6), "mo-pad"));
      return out;
    }
    case "stack": { // columna de pesas
      const x = n(ctx, p, "x", 0), y0 = n(ctx, p, "y", 0), w = n(ctx, p, "w", 22), h = n(ctx, p, "h", 200);
      const box: Vec[] = [[x - w / 2, y0], [x + w / 2, y0], [x + w / 2, y0 + h], [x - w / 2, y0 + h]];
      const out: Prim[] = [{ el: "path", d: pathOf(box), cls: "mo-frame" }];
      const lift = p.lift !== undefined ? num(ctx, p.lift as Bind) : 0;
      for (let i = 0; i < 6; i++) { const yy = y0 + 6 + i * 6 + (i >= 4 ? lift : 0); out.push(line([x - w / 2 + 4, yy], [x + w / 2 - 4, yy], "mo-steel-line", 3.6)); }
      return out;
    }
    case "mat": return [capsule([n(ctx, p, "x1", -60), 1.2], [n(ctx, p, "x2", 60), 1.2], 2.4, "mo-mat")];
    case "post": return [capsule([n(ctx, p, "x", 0), 0], [n(ctx, p, "x", 0), n(ctx, p, "h", 200)], n(ctx, p, "w", 5), "mo-frame")];
    default: throw new Error(`motion: equipamiento desconocido «${p.kind}»`);
  }
}

export type Frame = { prims: Prim[]; say?: string; miss: number };

/** Cuadro en el instante `u` (0–1) del ciclo. */
export function renderFrame(spec: MotionSpec, u: number, muscles: { primary: MuscleId[]; secondary: MuscleId[] } | null): Frame {
  const { pose, say } = poseAt(spec.keys, u);
  const b = solve(pose, spec.view);
  const ctx: Ctx = { b, pose };
  const layer = (l: "back" | "mid" | "front") => spec.props.filter((p) => (p.layer ?? "mid") === l).flatMap((p) => drawProp(ctx, p));
  const body = drawBody(b, muscles);
  // Sombra de contacto bajo el cuerpo.
  const shadowX = (b.ankle.near[0] + b.ankle.far[0] + b.pelvis[0]) / 3;
  const shadow: Prim = { el: "path", d: ellipse([shadowX, 0], 42, 3.2), cls: "mo-shadow" };
  return { say, miss: b.miss, prims: [...(spec.camera === "top" ? [] : [shadow]), ...layer("back"), ...body.back, ...layer("mid"), ...body.torso, ...body.front, ...layer("front")] };
}
function ellipse(c: Vec, rx: number, ry: number) {
  const pts: Vec[] = Array.from({ length: 20 }, (_, i) => [c[0] + Math.cos((i / 20) * Math.PI * 2) * rx, c[1] + Math.sin((i / 20) * Math.PI * 2) * ry]);
  return pathOf(pts);
}

/** Caja de todas las primitivas de un cuadro (en pantalla). */
function bounds(prims: Prim[], box: [number, number, number, number]) {
  const grow = (x: number, y: number) => { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); };
  for (const p of prims) {
    if (p.el === "circle") { grow(p.cx - p.r, p.cy - p.r); grow(p.cx + p.r, p.cy + p.r); }
    else if (p.el === "line") { grow(p.x1, p.y1); grow(p.x2, p.y2); }
    else { const nums = p.d.match(/-?\d+(\.\d+)?/g)!.map(Number); for (let i = 0; i + 1 < nums.length; i += 2) grow(nums[i], nums[i + 1]); }
  }
}

const viewCache = new WeakMap<MotionSpec, { viewBox: [number, number, number, number]; miss: number }>();
/** Encuadre fijo (todo el recorrido + margen, con el piso abajo) y el peor desajuste de la cinemática en el ciclo. */
export function framing(spec: MotionSpec) {
  const hit = viewCache.get(spec);
  if (hit) return hit;
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  let miss = 0;
  for (let i = 0; i < 48; i++) { const fr = renderFrame(spec, i / 48, null); bounds(fr.prims, box); miss = Math.max(miss, fr.miss); }
  let [x0, y0, x1, y1] = box;
  if (spec.frame) [x0, y0, x1, y1] = [spec.frame[0], -(spec.frame[1] + spec.frame[3]), spec.frame[0] + spec.frame[2], -spec.frame[1]];
  const top = spec.camera === "top";
  // Cenital: se dibuja con rotate(-90) → (x, y) pasa a (y, −x).
  if (top) [x0, y0, x1, y1] = [y0, -x1, y1, -x0];
  const pad = 14;
  x0 -= pad; x1 += pad; y0 -= pad; y1 = top ? y1 + pad : Math.max(y1, 0) + 10;
  // Proporción mínima 4:3 para que todas las demostraciones se vean del mismo tamaño en el visor.
  let w = x1 - x0, h = y1 - y0;
  if (w / h < 4 / 3) { const nw = (h * 4) / 3; x0 -= (nw - w) / 2; w = nw; }
  else if (w / h > 16 / 9) { const nh = (w * 9) / 16; y0 -= nh - h; h = nh; }
  const out = { viewBox: [x0, y0, w, h] as [number, number, number, number], miss };
  viewCache.set(spec, out);
  return out;
}

/** Transformación SVG del grupo del cuadro (sólo la cámara cenital gira). */
export const frameTransform = (spec: MotionSpec) => (spec.camera === "top" ? "rotate(-90)" : undefined);

/** Distancia entre dos puntos de la pose (para las validaciones de las pruebas). */
export const dist = (a: Vec, b: Vec) => len(sub(a, b));
