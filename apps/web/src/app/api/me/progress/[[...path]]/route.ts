// Personal Progress & Body Tracking 1.0 (D199, D200). Todo es de la persona con sesión: no hay parámetro de usuario y los
// servicios filtran por su id (un id ajeno responde 404). Los módulos apagados responden 404.
import { z } from "zod";
import { isProgressRange, type ProgressRange } from "@repi/domain";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import { featureOn, type Feature } from "@/lib/features";
import * as ex from "@/server/progress/exercises";
import * as bd from "@/server/progress/body";
import * as ph from "@/server/progress/photos";
import { sessionCalories } from "@/server/progress/calories";

type Ctx = { params: Promise<{ path?: string[] }> };
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const on = (f: Feature) => { if (!featureOn(f)) throw NF(); };
const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const grams = z.number().int().min(20_000).max(400_000);
const rangeOf = (req: Request): ProgressRange => { const r = new URL(req.url).searchParams.get("range"); return isProgressRange(r) ? r : "90d"; };

export const GET = handle<Ctx>(async (req, { params }) => {
  const [a, b] = (await params).path ?? [];
  const me = await sessionUserId();
  const u = new URL(req.url);
  if (a === "summary") { on("progress"); return ex.myProgressSummary(me, rangeOf(req)); }
  if (a === "exercises" && !b) { on("progress"); return ex.myProgressExercises(me, { q: u.searchParams.get("q"), offset: Number(u.searchParams.get("offset")) || 0 }); }
  if (a === "exercises" && b) { on("progress"); return ex.myExerciseProgress(me, id.parse(b), rangeOf(req)); }
  if (a === "body") { on("body_weight"); return bd.myBody(me, rangeOf(req)); }
  if (a === "calories" && b) { on("calories"); return sessionCalories(me, id.parse(b)); }
  if (a === "photos") return ph.myProgressPhotos(me);
  throw NF();
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const [a, b, c] = (await params).path ?? [];
  const me = await sessionUserId();
  await limit(`progress:${me}`, 40);
  if (a === "body" && b === "weights" && !c) { on("body_weight"); return bd.saveWeight(me, await body(req, z.object({ day, weightG: grams }))); }
  if (a === "body" && b === "weights" && c) { on("body_weight"); return bd.updateWeight(me, id.parse(c), await body(req, z.object({ day: day.optional(), weightG: grams.optional() }))); }
  if (a === "body" && b === "goal") {
    on("body_weight");
    return bd.setGoal(me, await body(req, z.object({ targetG: grams, targetOn: day.nullable().optional(), start: z.object({ day, weightG: grams }).nullable().optional() })));
  }
  if (a === "photos" && !b) {
    await limit(`progress-photo:${me}`, 10);
    // FSA1: el tamaño se controla antes de leer el cuerpo (la foto es de hasta 3 MB; margen para el formulario).
    const len = Number(req.headers.get("content-length") ?? "0");
    if (!len || len > 4 * 1024 * 1024) throw new AccessError("invalid_file", "La foto tiene que ser JPG, PNG o WebP de hasta 3 MB.", 413);
    const f = (await req.formData()).get("file");
    const meta = z.object({ day, pose: z.enum(["front", "side", "back", "other"]).nullable().optional() }).parse({ day: new URL(req.url).searchParams.get("day"), pose: new URL(req.url).searchParams.get("pose") || null });
    if (!(f instanceof File)) throw new AccessError("invalid_file", "Elegí una foto.");
    return ph.uploadProgressPhoto(me, { mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()), day: meta.day, pose: meta.pose });
  }
  if (a === "photos" && b) return ph.updateProgressPhoto(me, id.parse(b), await body(req, z.object({ day: day.optional(), pose: z.enum(["front", "side", "back", "other"]).nullable().optional() })));
  throw NF();
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const [a, b, c] = (await params).path ?? [];
  const me = await sessionUserId();
  await limit(`progress:${me}`, 40);
  if (a === "body" && b === "weights" && c) { on("body_weight"); return bd.deleteWeight(me, id.parse(c)); }
  if (a === "body" && b === "goal") { on("body_weight"); return bd.clearGoal(me); }
  if (a === "photos" && b) return ph.deleteProgressPhoto(me, id.parse(b));
  throw NF();
});
