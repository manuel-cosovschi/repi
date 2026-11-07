// REPI Sales Force (D207) · núcleo compartido: guardas del vendedor, avisos y bitácora comercial.
// Toda autorización se valida acá, en el servidor. Un vendedor nunca es Admin ni ve datos privados de socios.
import { and, eq, isNull } from "drizzle-orm";
import { localDate, repCapabilities, type RepStatus } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit, type Tx } from "../access/util";
import { requireAdmin } from "../commercial/services";

export const { salesRep, salesNotice, salesActivity } = schema;
export const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
export const today = (d = new Date()) => localDate(d);
export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) || null : null);

/** Interruptor de emergencia: REPI_SALES=off apaga el módulo (rutas 404) sin tocar datos. */
export const salesEnabled = () => process.env.REPI_SALES !== "off";
export function assertEnabled() { if (!salesEnabled()) throw NF(); }

export type Rep = typeof salesRep.$inferSelect;
export type Cap = keyof ReturnType<typeof repCapabilities>;

/**
 * El vendedor vinculado a esta cuenta, con la capacidad pedida según su estado. Sin relación de vendedor → 404 (no revela
 * que el área existe). Con estado insuficiente → 403 con motivo. Nunca se infiere de parámetros del cliente.
 */
export async function requireRep(userId: string, cap: Cap = "crmRead"): Promise<Rep> {
  assertEnabled();
  const [r] = await db.select().from(salesRep).where(eq(salesRep.userId, userId));
  if (!r) throw NF();
  if (!repCapabilities(r.status as RepStatus)[cap]) {
    throw new AccessError("rep_status", r.status === "paused" ? "Tu cuenta comercial está en pausa: podés consultar, pero no cargar cambios."
      : r.status === "terminated" || r.status === "suspended" ? "Tu acceso comercial está cerrado. Seguís viendo tus comisiones y liquidaciones." : "Tu cuenta comercial todavía no está activa.", 403);
  }
  return r;
}
export async function salesAdmin(actorId: string) { assertEnabled(); return requireAdmin(actorId); }

/** Aviso dentro de REPI (campanita de Ventas / Admin). Deduplicado por clave: repetir una acción no duplica avisos. */
export async function notify(tx: Tx | typeof db, userId: string | null | undefined, n: { kind: string; title: string; body: string; url?: string | null; dedupeKey: string }) {
  if (!userId) return;
  await tx.insert(salesNotice).values({ userId, kind: n.kind, title: n.title.slice(0, 160), body: n.body.slice(0, 600), url: n.url ?? null, dedupeKey: n.dedupeKey.slice(0, 200) }).onConflictDoNothing();
}
export async function notifyRep(tx: Tx | typeof db, repId: string | null | undefined, n: Parameters<typeof notify>[2]) {
  if (!repId) return;
  const [r] = await tx.select({ userId: salesRep.userId }).from(salesRep).where(eq(salesRep.id, repId));
  await notify(tx, r?.userId, { ...n, dedupeKey: `${n.dedupeKey}:${repId}` });
}
export async function notifyAdmins(tx: Tx | typeof db, n: Parameters<typeof notify>[2]) {
  const admins = await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.platformRole, "admin"));
  for (const a of admins) await notify(tx, a.id, { ...n, dedupeKey: `${n.dedupeKey}:${a.id}` });
}

export async function logActivity(tx: Tx | typeof db, a: {
  prospectId?: string | null; opportunityId?: string | null; dealId?: string | null; repId?: string | null; actorUserId: string | null;
  actorRole: "rep" | "admin" | "system"; kind: string; summary: string; dueOn?: string | null;
}) {
  const [row] = await tx.insert(salesActivity).values({ ...a, summary: a.summary.slice(0, 1000) }).returning();
  return row;
}
export { audit, AccessError };

export async function myNotices(userId: string) {
  const rows = await db.select().from(salesNotice).where(eq(salesNotice.userId, userId)).orderBy(schema.salesNotice.createdAt);
  return rows.reverse().slice(0, 100).map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, url: n.url, readAt: n.readAt, createdAt: n.createdAt }));
}
export async function readNotices(userId: string) {
  await db.update(salesNotice).set({ readAt: new Date() }).where(and(eq(salesNotice.userId, userId), isNull(salesNotice.readAt)));
  return { ok: true };
}
