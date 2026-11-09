// REPI Control (D213): API de la pantalla de consulta de rutinas. No usa sesión de persona: la pantalla se autoriza con su secreto
// (encabezado x-repi-kiosk, nunca en la URL) y la consulta con un token de vida corta (x-repi-kiosk-session). Todo es no-store.
import { z } from "zod";
import { NextResponse } from "next/server";
import { body, handle, limit } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import * as k from "@/server/gym/kiosk";
import { readObject, StorageRangeError } from "@/server/storage";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ path: string[] }> };
const NO_STORE = { "cache-control": "private, no-store, max-age=0", "x-robots-tag": "noindex" };
const json = (d: unknown) => NextResponse.json(d, { headers: NO_STORE });
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const dev = (req: Request) => req.headers.get("x-repi-kiosk") ?? "";
const tok = (req: Request) => req.headers.get("x-repi-kiosk-session") ?? "";
const kt = () => import("@/server/gym/kiosk-training");

export const GET = handle<Ctx>(async (req, { params }) => {
  const [a, b] = (await params).path ?? [];
  if (a === "hello") { await limit("kiosk-hello", 60); return json(await k.kioskHello(dev(req))); }
  if (a === "program") { await limit("kiosk-program", 60); return json(await k.kioskProgram(dev(req), tok(req))); }
  if (a === "workout") { await limit("kiosk-workout", 120); return json(await (await kt()).kioskWorkout(dev(req), tok(req))); }
  if (a === "media" && b) {
    await limit("kiosk-media", 120);
    const mo = await k.kioskMedia(b, new URL(req.url).searchParams.get("t") ?? "");
    try {
      const o = await readObject(mo.storageKey, req.headers.get("range"));
      return new Response(o.stream, { status: o.status, headers: { ...NO_STORE, "content-type": mo.mime, ...(o.size ? { "content-length": String(o.size) } : {}), ...(o.contentRange ? { "content-range": o.contentRange } : {}), "accept-ranges": "bytes" } });
    } catch (e) {
      if (e instanceof StorageRangeError) return new Response(null, { status: 416, headers: { ...NO_STORE, "content-range": `bytes */${e.total}` } });
      throw e;
    }
  }
  throw NF();
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const [a] = (await params).path ?? [];
  if (a === "identify") {
    await limit("kiosk-identify", 30);
    const p = await body(req, z.object({ code: z.string().max(12), pin: z.string().max(12) }));
    return json(await k.kioskIdentify(dev(req), p));
  }
  // D216: registrar el entrenamiento. Cada escritura vuelve a validar la pantalla, la consulta y la credencial en el servidor.
  if (a === "workout") {
    await limit("kiosk-write", 120);
    const [, b] = (await params).path ?? [];
    const t = await kt();
    if (!b) {
      const p = await body(req, z.object({ opId: z.string().uuid(), dayIndex: z.number().int().min(0).max(20) }));
      return json(await t.kioskStartWorkout(dev(req), tok(req), p));
    }
    if (b === "sets") {
      const num = z.number().finite().nullable();
      const p = await body(req, z.object({
        sessionId: z.string().uuid(), programExerciseId: z.string().min(1).max(64),
        sets: z.array(z.object({
          id: z.string().uuid(), setIndex: z.number().int().min(0).max(39), skipped: z.boolean().optional(), weightKg: num, reps: z.number().int().nullable(),
          rir: z.number().int().min(0).max(5).nullable(), metrics: z.record(z.string().max(20), z.number().finite()).nullable().optional(), baseRevision: z.number().int().min(0).optional(),
        })).min(1).max(40),
      }));
      return json(await t.kioskLogExercise(dev(req), tok(req), p));
    }
    if (b === "finish") {
      const p = await body(req, z.object({ sessionId: z.string().uuid() }));
      return json(await t.kioskFinishWorkout(dev(req), tok(req), p.sessionId));
    }
    throw NF();
  }
  if (a === "end") {
    const p = await body(req, z.object({ reason: z.enum(["done", "idle"]).optional() }));
    return json(await k.kioskEnd(dev(req), tok(req), p.reason ?? "done"));
  }
  throw NF();
});
