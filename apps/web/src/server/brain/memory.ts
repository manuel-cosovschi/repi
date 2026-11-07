// Memoria de REPI (D209, contrato §3 «memory.ts» y §5). Guarda preferencias declaradas, decisiones, resultados y contexto
// temporal, con procedencia, vencimiento por tipo, corrección y borrado. Los hechos (marcas, programa, sesiones) NO se
// guardan: se leen de la base. Todo filtra por el userId de la sesión: un id ajeno responde 404, igual que uno inexistente.
// La política (normalización, lista negra de inferencias) es del dominio; acá se acota el formato y se evita duplicar.
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { MemoryItem, MemoryKind } from "@repi/domain/brain/types";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { arDayStart } from "./store";

const { brainMemory } = schema;
const DAY = 86_400_000;
export const MEMORY_MAX_ACTIVE = 200;
/** Lo revocado (dato de origen que cambió) se conserva un tiempo corto por trazabilidad y después se purga. */
export const MEMORY_REVOKED_RETENTION_DAYS = 30;
const KINDS: readonly MemoryKind[] = ["preference", "decision", "outcome", "temporal"];
const SOURCES: readonly MemoryItem["source"][] = ["user", "system", "coach"];
const KEY_RE = /^[a-z0-9_:.\-]{1,80}$/;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos ese recuerdo.", 404);

/** Vencimiento por tipo: temporal, fin del día (hora argentina); decisiones y resultados, 180 días; preferencias, nunca. */
export function defaultExpiry(kind: MemoryKind, now = new Date()): Date | null {
  if (kind === "temporal") return new Date(arDayStart(now).getTime() + DAY);
  if (kind === "decision" || kind === "outcome") return new Date(now.getTime() + 180 * DAY);
  return null;
}
const MAX_TTL: Record<MemoryKind, number | null> = { temporal: 2 * DAY, decision: 180 * DAY, outcome: 180 * DAY, preference: null };

type Row = typeof brainMemory.$inferSelect;
const view = (r: Row): MemoryItem => ({
  id: r.id, kind: r.kind, key: r.key, value: r.value ?? null, text: r.text, source: r.source, ref: r.ref ?? null,
  createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
});
const active = (now: Date) => and(isNull(brainMemory.revokedAt), or(isNull(brainMemory.expiresAt), gt(brainMemory.expiresAt, now)));

function cleanText(t: unknown) {
  const s = typeof t === "string" ? t.trim().replace(/\s+/g, " ") : "";
  if (!s || s.length > 280) throw new AccessError("invalid", "El recuerdo necesita un texto corto (hasta 280 caracteres).");
  return s;
}
function cleanValue(v: unknown) {
  if (v === undefined) return null;
  const j = JSON.stringify(v);
  if (j === undefined || j.length > 2_000) throw new AccessError("invalid", "El dato del recuerdo es demasiado largo.");
  return v;
}
function cleanRef(r: unknown) {
  if (r == null) return null;
  if (typeof r !== "object" || Array.isArray(r) || JSON.stringify(r).length > 500
    || Object.values(r).some((x) => x !== null && typeof x !== "string" && typeof x !== "number")) throw new AccessError("invalid", "Referencia inválida.");
  return r as Record<string, string | number | null>;
}

/** Memoria vigente (sin revocar ni vencer), lo más reciente primero. */
export async function listMemory(userId: string, now = new Date()): Promise<MemoryItem[]> {
  const rows = await db.select().from(brainMemory).where(and(eq(brainMemory.userId, userId), active(now)))
    .orderBy(desc(brainMemory.createdAt)).limit(MEMORY_MAX_ACTIVE);
  return rows.map(view);
}

/**
 * Guarda un recuerdo. Si ya hay uno vigente igual (mismo tipo, clave y valor), devuelve ese (created: false): repetir
 * «no me gusta el remo» no lo duplica. Sin `expiresAt`, vence según el tipo; uno explícito no puede pasar el tope del tipo.
 */
export async function createMemory(userId: string, item: { kind: MemoryKind; key: string; value?: unknown; text: string; source: MemoryItem["source"]; ref?: MemoryItem["ref"]; expiresAt?: string | Date | null }, now = new Date()): Promise<{ item: MemoryItem; created: boolean }> {
  if (!KINDS.includes(item.kind)) throw new AccessError("invalid", "Tipo de recuerdo inválido.");
  if (!SOURCES.includes(item.source)) throw new AccessError("invalid", "Origen del recuerdo inválido.");
  if (!KEY_RE.test(item.key ?? "")) throw new AccessError("invalid", "Clave de recuerdo inválida.");
  const text = cleanText(item.text), value = cleanValue(item.value), ref = cleanRef(item.ref);
  let expiresAt = item.expiresAt === undefined ? defaultExpiry(item.kind, now) : item.expiresAt == null ? null : new Date(item.expiresAt);
  const max = MAX_TTL[item.kind];
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= now)) throw new AccessError("invalid", "El vencimiento tiene que ser futuro.");
  if (max != null && (!expiresAt || expiresAt.getTime() - now.getTime() > max)) expiresAt = new Date(now.getTime() + max);
  return db.transaction(async (tx) => {
    // Serializa por persona: dos pedidos iguales simultáneos no crean dos filas ni pasan el tope.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`brain-memory:${userId}`}))`);
    const [same] = await tx.select().from(brainMemory).where(and(eq(brainMemory.userId, userId), eq(brainMemory.kind, item.kind), eq(brainMemory.key, item.key),
      sql`${brainMemory.value} is not distinct from ${value === null ? null : JSON.stringify(value)}::jsonb`, active(now))).limit(1);
    if (same) return { item: view(same), created: false };
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(brainMemory).where(and(eq(brainMemory.userId, userId), active(now)));
    if (n >= MEMORY_MAX_ACTIVE) throw new AccessError("limit_reached", "REPI ya recuerda muchas cosas. Borrá alguna desde «Lo que REPI recuerda».", 409);
    const [r] = await tx.insert(brainMemory).values({ userId, kind: item.kind, key: item.key, value, text, source: item.source, ref, expiresAt }).returning();
    return { item: view(r), created: true };
  });
}

/** Corrección hecha por la persona: cambia el texto o el valor de un recuerdo vigente propio. */
export async function correctMemory(userId: string, id: string, patch: { text?: string; value?: unknown }, now = new Date()): Promise<MemoryItem> {
  const set: Partial<typeof brainMemory.$inferInsert> = {};
  if (patch.text !== undefined) set.text = cleanText(patch.text);
  if (patch.value !== undefined) set.value = cleanValue(patch.value);
  if (!Object.keys(set).length) throw new AccessError("invalid", "No hay nada para corregir.");
  const [r] = await db.update(brainMemory).set(set).where(and(eq(brainMemory.id, id), eq(brainMemory.userId, userId), active(now))).returning();
  if (!r) throw NOT_FOUND();
  await audit(db, { actorUserId: userId, action: "brain.memory_corrected", resourceType: "brain_memory", resourceId: id, meta: { fields: Object.keys(set) } });
  return view(r);
}

/** Invalida un recuerdo propio (deja de usarse; la purga lo borra después). Idempotente sobre uno ya revocado. */
export async function revokeMemory(userId: string, id: string, now = new Date()): Promise<{ revoked: boolean }> {
  const [r] = await db.update(brainMemory).set({ revokedAt: now }).where(and(eq(brainMemory.id, id), eq(brainMemory.userId, userId), isNull(brainMemory.revokedAt))).returning({ id: brainMemory.id });
  if (r) return { revoked: true };
  const [cur] = await db.select({ id: brainMemory.id }).from(brainMemory).where(and(eq(brainMemory.id, id), eq(brainMemory.userId, userId)));
  if (!cur) throw NOT_FOUND();
  return { revoked: false };
}

/** Invalida lo que dependía de un dato de origen que cambió (p. ej. { programVersionId } o { sessionId }). */
export async function revokeMemoryByRef(userId: string, ref: Record<string, string | number>, now = new Date()): Promise<number> {
  if (!Object.keys(ref).length) return 0;
  const rows = await db.update(brainMemory).set({ revokedAt: now })
    .where(and(eq(brainMemory.userId, userId), isNull(brainMemory.revokedAt), sql`${brainMemory.ref} @> ${JSON.stringify(cleanRef(ref))}::jsonb`))
    .returning({ id: brainMemory.id });
  return rows.length;
}

/** Borrado definitivo pedido por la persona («Lo que REPI recuerda» → Borrar). La auditoría no guarda el contenido. */
export async function deleteMemory(userId: string, id: string): Promise<void> {
  const [r] = await db.delete(brainMemory).where(and(eq(brainMemory.id, id), eq(brainMemory.userId, userId))).returning({ kind: brainMemory.kind });
  if (!r) throw NOT_FOUND();
  await audit(db, { actorUserId: userId, action: "brain.memory_deleted", resourceType: "brain_memory", resourceId: id, meta: { kind: r.kind } });
}

/** Purga diaria (todas las personas): lo vencido y lo revocado hace más de MEMORY_REVOKED_RETENTION_DAYS. */
export async function purgeExpiredMemory(now = new Date()): Promise<number> {
  const rows = await db.delete(brainMemory).where(or(lt(brainMemory.expiresAt, now), lt(brainMemory.revokedAt, new Date(now.getTime() - MEMORY_REVOKED_RETENTION_DAYS * DAY))))
    .returning({ id: brainMemory.id });
  return rows.length;
}
