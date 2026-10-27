import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../auth";
import { db } from "@/db";
import { AccessError, audit, rateLimit } from "./util";
import { logError } from "../log";

export async function sessionUserId(): Promise<string> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  return s.user.id;
}

export async function limit(bucket: string, max = 10, windowMs = 60_000) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  await rateLimit(`${bucket}:${ip}`, max, windowMs);
}

/**
 * F-PR-04: cada acceso denegado (403/404 de un servicio) queda en la auditoría con quién, qué ruta y qué código,
 * sin cuerpos ni parámetros. Nunca rompe la respuesta: si el registro falla, sólo se loguea.
 */
export async function recordDenied(req: Request, e: AccessError) {
  if (e.status !== 403 && e.status !== 404) return;
  try {
    const s = await auth.api.getSession({ headers: req.headers });
    await audit(db, {
      actorUserId: s?.user.id ?? null, action: "access.denied", resourceType: "api", resourceId: new URL(req.url).pathname.slice(0, 200), result: "denied",
      meta: { code: e.code, status: e.status, method: req.method },
    });
  } catch (err) { logError("audit.denied", err, req); }
}

export function handle<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const data = await fn(req, ctx);
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof AccessError) {
        await recordDenied(req, e);
        return NextResponse.json({ error: e.message, code: e.code, ...(e.data ? { data: e.data } : {}) }, { status: e.status });
      }
      if (e instanceof z.ZodError) return NextResponse.json({ error: "Revisá los datos ingresados.", code: "invalid" }, { status: 400 });
      logError("api", e, req);
      return NextResponse.json({ error: "Algo falló de nuestro lado. Probá de nuevo.", code: "error" }, { status: 500 });
    }
  };
}

export const body = async <T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> => schema.parse(await req.json().catch(() => ({})));
