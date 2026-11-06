import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../auth";
import { db } from "@/db";
import { AccessError, audit, rateLimit } from "./util";
import { maskPath, logError } from "../log";

export async function sessionUserId(): Promise<string> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  return s.user.id;
}

/** Rutas abiertas a quien no tiene sesión (soporte): el usuario si la hay, si no null. */
export async function optionalUserId(): Promise<string | null> {
  const s = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  return s?.user.id ?? null;
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
      actorUserId: s?.user.id ?? null, action: "access.denied", resourceType: "api", resourceId: maskPath(new URL(req.url).pathname).slice(0, 200), result: "denied",
      meta: { code: e.code, status: e.status, method: req.method },
    });
  } catch (err) { logError("audit.denied", err, req); }
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const originOf = (u?: string) => { try { return u ? new URL(u).origin : null; } catch { return null; } };

/**
 * D197 (06/06): defensa contra CSRF además de la cookie SameSite=Lax. Una escritura que el navegador marca como de otro
 * sitio (Origin ajeno, Origin inválido o Sec-Fetch-Site: cross-site) se rechaza antes de tocar el servicio. Sin Origin
 * ni Sec-Fetch-Site (cron, servidores, pruebas) sigue igual: esas llamadas no llevan la cookie de una persona.
 */
export function crossSiteWrite(req: Request): boolean {
  if (!UNSAFE.has(req.method)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "cross-site";
  const o = originOf(origin);
  if (!o) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  if (new URL(o).host === host) return false;
  const trusted = [process.env.BETTER_AUTH_URL, process.env.NEXT_PUBLIC_APP_URL, ...(process.env.AUTH_TRUSTED_ORIGINS ?? "").split(",")].map((x) => originOf(x?.trim()));
  return !trusted.includes(o);
}

export function handle<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    if (crossSiteWrite(req)) return NextResponse.json({ error: "Esta acción tiene que hacerse desde REPI.", code: "cross_site" }, { status: 403 });
    try {
      const data = await fn(req, ctx);
      if (data instanceof Response) return data;
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
