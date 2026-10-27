import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../auth";
import { AccessError, rateLimit } from "./util";
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

export function handle<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const data = await fn(req, ctx);
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof AccessError) return NextResponse.json({ error: e.message, code: e.code, ...(e.data ? { data: e.data } : {}) }, { status: e.status });
      if (e instanceof z.ZodError) return NextResponse.json({ error: "Revisá los datos ingresados.", code: "invalid" }, { status: 400 });
      logError("api", e, req);
      return NextResponse.json({ error: "Algo falló de nuestro lado. Probá de nuevo.", code: "error" }, { status: 500 });
    }
  };
}

export const body = async <T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> => schema.parse(await req.json().catch(() => ({})));
