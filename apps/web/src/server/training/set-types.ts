// D192 · Tipos de serie personalizados del profe («Load Set», «Serie de control»). Biblioteca privada de cada profe en cada
// organización: nadie más la ve ni la cambia, y no viaja a otras organizaciones. Quién puede usarla lo decide quien llama
// (coach independiente: dueño de su organización; gimnasio: quien arma programas en la sede, `program.edit`).
//
// El plan guarda una copia del nombre y del tipo real (`SetSpec.label`, `SetSpec.kind`): renombrar o quitar un tipo de la
// lista nunca cambia programas, versiones congeladas ni series registradas. Sin la migración 0044 aplicada, la lista queda
// vacía y crear avisa; Load Set (de REPI) funciona igual porque no necesita esta tabla.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { SET_KIND_LABEL, SET_LABEL_PRESETS, cleanSetLabel, labelKey, type SetKind } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";

const { setType } = schema;
export type SetTypeScope = { orgId: string; userId: string };
export type SetTypeDefaults = { reps?: string | null; rir?: number | null; rpe?: number | null; restSec?: number | null };
export type SetTypeInput = { name?: string; kind?: string; defaults?: SetTypeDefaults | null };
export const MAX_SET_TYPES = 40;

const KINDS = Object.keys(SET_KIND_LABEL) as SetKind[];
const NOT_FOUND = () => new AccessError("not_found", "No encontramos ese tipo de serie.", 404);
const MISSING = () => new AccessError("unavailable", "Los tipos personalizados todavía no están habilitados en este entorno. Load Set ya está disponible en la lista.", 503);
/** La tabla todavía no existe (migración 0044 pendiente). */
const missingTable = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.code === "42P01" || (e as { cause?: { code?: string } })?.cause?.code === "42P01";

const out = (r: typeof setType.$inferSelect) => ({ id: r.id, name: r.name, kind: r.kind as SetKind, kindLabel: SET_KIND_LABEL[r.kind as SetKind], defaults: r.defaults ?? {}, updatedAt: r.updatedAt });

function cleanDefaults(d: SetTypeDefaults | null | undefined): SetTypeDefaults {
  if (!d) return {};
  const o: SetTypeDefaults = {};
  const num = (x: unknown, a: number, b: number, what: string) => {
    if (x == null || x === "") return null;
    const v = Number(x);
    if (!Number.isFinite(v) || v < a || v > b) throw new AccessError("invalid", `${what} va de ${a} a ${b}.`);
    return v;
  };
  if (typeof d.reps === "string" && d.reps.trim()) o.reps = d.reps.trim().slice(0, 20);
  const rir = num(d.rir, 0, 5, "El RIR"); if (rir != null) o.rir = Math.round(rir);
  const rpe = num(d.rpe, 1, 10, "El RPE"); if (rpe != null) o.rpe = Math.round(rpe * 2) / 2;
  const rest = num(d.restSec, 0, 900, "El descanso (segundos)"); if (rest != null) o.restSec = Math.round(rest);
  return o;
}
function cleanName(raw: unknown) {
  const l = cleanSetLabel(raw);
  if (!l.ok) throw new AccessError("invalid", l.error);
  if (SET_LABEL_PRESETS.some((p) => labelKey(p.label) === labelKey(l.label))) throw new AccessError("invalid", `«${l.label}» ya viene en REPI: elegilo de la lista.`);
  return l.label;
}
function cleanKind(raw: unknown): SetKind {
  if (!KINDS.includes(raw as SetKind)) throw new AccessError("invalid", "Elegí cómo funciona la serie (efectiva, top set, back-off…).");
  return raw as SetKind;
}
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) {
    if (missingTable(e)) throw MISSING();
    if ((e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505") throw new AccessError("invalid", "Ya tenés un tipo con ese nombre.", 409);
    throw e;
  }
}
const mine = (s: SetTypeScope, id: string) => and(eq(setType.id, id), eq(setType.orgId, s.orgId), eq(setType.ownerUserId, s.userId), isNull(setType.archivedAt));

/** Tipos activos del profe en esta organización (sin la tabla todavía: lista vacía y `available: false`). */
export async function listSetTypes(s: SetTypeScope) {
  try {
    const rows = await db.select().from(setType).where(and(eq(setType.orgId, s.orgId), eq(setType.ownerUserId, s.userId), isNull(setType.archivedAt))).orderBy(asc(setType.name));
    return { available: true, types: rows.map(out) };
  } catch (e) {
    if (missingTable(e)) return { available: false, types: [] };
    throw e;
  }
}

export async function createSetType(s: SetTypeScope, p: SetTypeInput) {
  const name = cleanName(p.name), kind = cleanKind(p.kind), defaults = cleanDefaults(p.defaults);
  return guard(() => db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(setType).where(and(eq(setType.orgId, s.orgId), eq(setType.ownerUserId, s.userId), isNull(setType.archivedAt)));
    if (n >= MAX_SET_TYPES) throw new AccessError("invalid", `Podés tener hasta ${MAX_SET_TYPES} tipos propios. Quitá alguno que no uses.`);
    const [r] = await tx.insert(setType).values({ orgId: s.orgId, ownerUserId: s.userId, name, kind, defaults }).returning();
    await audit(tx, { actorUserId: s.userId, orgId: s.orgId, action: "set_type.created", resourceType: "set_type", resourceId: r.id, meta: { kind } });
    return out(r);
  }));
}

/** Renombrar o cambiar valores por defecto: sólo los usos nuevos; los programas y registros anteriores conservan su nombre. */
export async function updateSetType(s: SetTypeScope, id: string, p: SetTypeInput) {
  const patch: Partial<typeof setType.$inferInsert> = { updatedAt: new Date() };
  if (p.name !== undefined) patch.name = cleanName(p.name);
  if (p.kind !== undefined) patch.kind = cleanKind(p.kind);
  if (p.defaults !== undefined) patch.defaults = cleanDefaults(p.defaults);
  return guard(() => db.transaction(async (tx) => {
    const [r] = await tx.update(setType).set(patch).where(mine(s, id)).returning();
    if (!r) throw NOT_FOUND(); // de otro profe, de otra organización o ya quitado: no se distingue
    await audit(tx, { actorUserId: s.userId, orgId: s.orgId, action: "set_type.updated", resourceType: "set_type", resourceId: id, meta: { fields: Object.keys(patch).filter((k) => k !== "updatedAt") } });
    return out(r);
  }));
}

/** Quitar de la lista (no se borra la fila ni nada que lo use). */
export async function archiveSetType(s: SetTypeScope, id: string) {
  return guard(() => db.transaction(async (tx) => {
    const [r] = await tx.update(setType).set({ archivedAt: new Date(), updatedAt: new Date() }).where(mine(s, id)).returning({ id: setType.id });
    if (!r) throw NOT_FOUND();
    await audit(tx, { actorUserId: s.userId, orgId: s.orgId, action: "set_type.archived", resourceType: "set_type", resourceId: id });
    return { ok: true };
  }));
}
