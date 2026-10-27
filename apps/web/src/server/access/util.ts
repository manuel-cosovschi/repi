import { createHash, createHmac, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { makeInviteCode, normalizeDni } from "@repi/domain";
import { db, schema } from "@/db";
import { requireEnv } from "../env";

export class AccessError extends Error {
  constructor(public code: string, message: string, public status = 400, public data?: Record<string, unknown>) {
    super(message);
  }
}

export const dniHmac = (dni: string) =>
  createHmac("sha256", requireEnv("ROSTER_HMAC_SECRET")).update(normalizeDni(dni)).digest("hex");
export const dniLast3 = (dni: string) => normalizeDni(dni).slice(-3);
export const newInviteCode = () => makeInviteCode((n) => randomBytes(n));
export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function audit(
  tx: Tx | typeof db,
  e: { actorUserId?: string | null; orgId?: string | null; action: string; resourceType: string; resourceId?: string | null; result?: "ok" | "denied" | "error"; meta?: Record<string, unknown> },
) {
  await tx.insert(schema.auditEvent).values({ result: "ok", ...e });
}
export type { Tx };

// Límite simple en memoria por clave (IP+ruta). Limitación conocida: no se comparte entre procesos.
/** Ventana fija por clave, atómica en la base (D74): vale igual con varias instancias serverless. */
export async function rateLimit(key: string, max: number, windowMs: number) {
  const secs = Math.max(1, Math.round(windowMs / 1000));
  const t = schema.appRateLimit;
  const [row] = await db.insert(t).values({ key, windowStart: new Date(), count: 1 }).onConflictDoUpdate({
    target: t.key,
    set: {
      count: sql`case when ${t.windowStart} < now() - make_interval(secs => ${secs}) then 1 else ${t.count} + 1 end`,
      windowStart: sql`case when ${t.windowStart} < now() - make_interval(secs => ${secs}) then now() else ${t.windowStart} end`,
    },
  }).returning({ count: t.count });
  if (row.count > max) throw new AccessError("rate_limited", "Demasiados intentos. Esperá un minuto y probá de nuevo.", 429);
}
export const resetRateLimits = async () => { await db.delete(schema.appRateLimit); await db.delete(schema.rateLimit); };
