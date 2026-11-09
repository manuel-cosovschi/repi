// STF-09 (D214): quitar a alguien del equipo o cambiarle el rol o la sede, desde el producto.
// - El dueño gestiona a cualquiera que no sea dueño. La gerencia, sólo roles de sala o recepción de su sede (nunca gerencia ni
//   filas «todas las sedes» si su gerencia es de una sede). Nadie se modifica a sí mismo. Los dueños los cambia REPI.
// - Efecto en el servidor: gymContext lee staff_membership.status = 'active' en cada pedido, así que una pantalla abierta pierde
//   el permiso en el pedido siguiente. Las tareas que la persona tenía vuelven a la cola de su sede con un evento, se cierra su
//   turno abierto y queda auditoría. Nada se borra: la fila queda como «revoked» con quién y cuándo.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { GYM_ROLE_LABEL, type GymRole } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit, type Tx } from "../access/util";
import { ACTIVE, addEvent, gymContext, type GymCtx } from "./services";

const { staffMembership, gymTask, shiftLog, gymLocation, user } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos a esa persona en tu equipo.", 404);
const FORBIDDEN = (m = "No podés cambiar el acceso de esa persona.") => new AccessError("forbidden", m, 403);
export const MANAGEABLE_ROLES = ["manager", "coordinator", "floor_trainer", "reception"] as const;
type Manageable = (typeof MANAGEABLE_ROLES)[number];

/** ¿El actor puede tocar una fila (rol + sede)? */
function canTouch(ctx: GymCtx, row: { role: string; locationId: string | null }) {
  if (row.role === "owner" || row.role === "coach_owner") return false;
  if (ctx.roles.includes("owner")) return true;
  if (row.role === "manager") return false;
  const mgr = ctx.memberships.filter((m) => m.role === "manager");
  if (row.locationId === null) return mgr.some((m) => m.locationId === null);
  return mgr.some((m) => m.locationId === null || m.locationId === row.locationId);
}

async function manageCtx(actorId: string, orgId: string, targetUserId: string) {
  const ctx = await gymContext(actorId, orgId);
  if (!ctx.roles.some((r) => r === "owner" || r === "manager")) throw FORBIDDEN("Sólo el dueño o la gerencia gestionan el equipo.");
  if (targetUserId === actorId) throw FORBIDDEN("No podés cambiar tu propio acceso. Pedíselo al dueño o a REPI.");
  return ctx;
}

/**
 * Devuelve a la cola las tareas activas que la persona ya no puede atender (de las sedes que pierde o todas al revocar) y
 * cierra su turno abierto en esas sedes.
 */
async function releaseWork(tx: Tx, orgId: string, actorId: string, userId: string, keepLocations: string[] | null, why: string) {
  const tasks = await tx.select({ id: gymTask.id, status: gymTask.status, locationId: gymTask.locationId }).from(gymTask)
    .where(and(eq(gymTask.orgId, orgId), eq(gymTask.assigneeUserId, userId), inArray(gymTask.status, [...ACTIVE]))).for("update");
  const lose = tasks.filter((t) => keepLocations === null ? false : !keepLocations.includes(t.locationId));
  const all = keepLocations === null ? [] : lose;
  for (const t of all) {
    await tx.update(gymTask).set({ assigneeUserId: null, status: "open" }).where(eq(gymTask.id, t.id));
    await addEvent(tx, { id: t.id, orgId }, { actor: actorId, kind: "reassigned", from: t.status, to: "open", toUserId: null, note: why });
  }
  const shifts = await tx.select({ id: shiftLog.id, locationId: shiftLog.locationId }).from(shiftLog)
    .where(and(eq(shiftLog.orgId, orgId), eq(shiftLog.userId, userId), isNull(shiftLog.endedAt)));
  const closing = shifts.filter((s) => keepLocations !== null && !keepLocations.includes(s.locationId));
  if (closing.length) await tx.update(shiftLog).set({ endedAt: new Date() }).where(inArray(shiftLog.id, closing.map((s) => s.id)));
  return { tasksReturned: all.length, shiftsClosed: closing.length };
}

/** Sedes donde la persona sigue pudiendo trabajar con las filas activas que le quedan (null = todas). */
async function remainingLocations(tx: Tx, orgId: string, userId: string): Promise<string[] | null> {
  const rows = await tx.select({ locationId: staffMembership.locationId }).from(staffMembership)
    .where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.userId, userId), eq(staffMembership.status, "active")));
  if (rows.some((r) => r.locationId === null)) return null;
  return [...new Set(rows.map((r) => r.locationId!))];
}

/** Lo que el actor puede gestionar de una persona: sus filas activas tocables y las sedes que puede asignar. */
export async function staffAccess(actorId: string, orgId: string, targetUserId: string) {
  const ctx = await manageCtx(actorId, orgId, targetUserId);
  const rows = await db.select({ m: staffMembership, name: user.name }).from(staffMembership).innerJoin(user, eq(user.id, staffMembership.userId))
    .where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.userId, targetUserId), eq(staffMembership.status, "active")));
  if (!rows.length) throw NOT_FOUND();
  const locs = await db.select({ id: gymLocation.id, name: gymLocation.name }).from(gymLocation).where(eq(gymLocation.orgId, orgId));
  const assignable = locs.filter((l) => ctx.locationIds === null || ctx.locationIds.includes(l.id));
  return {
    userId: targetUserId, name: rows[0].name,
    memberships: rows.map(({ m }) => ({ id: m.id, role: m.role, roleLabel: GYM_ROLE_LABEL[m.role as GymRole] ?? m.role, locationId: m.locationId,
      location: m.locationId ? locs.find((l) => l.id === m.locationId)?.name ?? "Otra sede" : "Todas las sedes", editable: canTouch(ctx, m) })),
    roles: (ctx.roles.includes("owner") ? MANAGEABLE_ROLES : MANAGEABLE_ROLES.filter((r) => r !== "manager")).map((r) => ({ id: r, label: GYM_ROLE_LABEL[r] })),
    locations: [...(ctx.locationIds === null ? [{ id: null as string | null, name: "Todas las sedes" }] : []), ...assignable],
  };
}

/** Quita a la persona del equipo (todas las filas que el actor puede tocar). */
export async function revokeStaff(actorId: string, orgId: string, targetUserId: string, reason?: string | null) {
  const ctx = await manageCtx(actorId, orgId, targetUserId);
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(staffMembership)
      .where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.userId, targetUserId), eq(staffMembership.status, "active"))).for("update");
    if (!rows.length) throw NOT_FOUND();
    const mine = rows.filter((r) => canTouch(ctx, r));
    if (!mine.length) throw FORBIDDEN();
    const now = new Date();
    await tx.update(staffMembership).set({ status: "revoked", revokedAt: now, revokedBy: actorId, afterHoursAccess: false }).where(inArray(staffMembership.id, mine.map((r) => r.id)));
    const keep = await remainingLocations(tx, orgId, targetUserId);
    const why = "Volvió a la cola: se quitó el acceso de quien la tenía.";
    const work = rows.length === mine.length ? await releaseAll(tx, orgId, actorId, targetUserId, why) : await releaseWork(tx, orgId, actorId, targetUserId, keep ?? null, why);
    await audit(tx, { actorUserId: actorId, orgId, action: "staff.revoked", resourceType: "staff_membership", resourceId: targetUserId,
      meta: { roles: mine.map((r) => r.role), locations: mine.map((r) => r.locationId), partial: rows.length !== mine.length, reason: reason?.slice(0, 200) ?? null, ...work } });
    return { revoked: mine.length, remaining: rows.length - mine.length, ...work };
  });
}

/** Todas las tareas activas y turnos abiertos de la persona en la organización. */
async function releaseAll(tx: Tx, orgId: string, actorId: string, userId: string, why: string) {
  const tasks = await tx.select({ id: gymTask.id, status: gymTask.status }).from(gymTask)
    .where(and(eq(gymTask.orgId, orgId), eq(gymTask.assigneeUserId, userId), inArray(gymTask.status, [...ACTIVE]))).for("update");
  for (const t of tasks) {
    await tx.update(gymTask).set({ assigneeUserId: null, status: "open" }).where(eq(gymTask.id, t.id));
    await addEvent(tx, { id: t.id, orgId }, { actor: actorId, kind: "reassigned", from: t.status, to: "open", toUserId: null, note: why });
  }
  const closed = await tx.update(shiftLog).set({ endedAt: new Date() }).where(and(eq(shiftLog.orgId, orgId), eq(shiftLog.userId, userId), isNull(shiftLog.endedAt))).returning({ id: shiftLog.id });
  return { tasksReturned: tasks.length, shiftsClosed: closed.length };
}

/**
 * Cambia el rol o la sede: revoca las filas tocables y deja una sola activa con el rol y la sede nuevos (reactiva la fila
 * histórica si ya existía esa combinación). Si la persona deja de trabajar en una sede, sus tareas de esa sede vuelven a la cola.
 */
export async function changeStaffRole(actorId: string, orgId: string, targetUserId: string, p: { role: Manageable; locationId: string | null }) {
  const ctx = await manageCtx(actorId, orgId, targetUserId);
  if (!(MANAGEABLE_ROLES as readonly string[]).includes(p.role)) throw new AccessError("invalid", "Elegí un rol válido.");
  if (p.locationId) {
    const [l] = await db.select({ id: gymLocation.id }).from(gymLocation).where(and(eq(gymLocation.id, p.locationId), eq(gymLocation.orgId, orgId)));
    if (!l) throw new AccessError("invalid", "Elegí una sede de tu gimnasio.");
  }
  if (!canTouch(ctx, { role: p.role, locationId: p.locationId })) throw FORBIDDEN("No podés asignar ese rol en esa sede.");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(staffMembership)
      .where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.userId, targetUserId))).for("update");
    const active = rows.filter((r) => r.status === "active");
    if (!active.length) throw NOT_FOUND();
    const mine = active.filter((r) => canTouch(ctx, r));
    if (!mine.length) throw FORBIDDEN();
    const same = (r: { role: string; locationId: string | null }) => r.role === p.role && (r.locationId ?? null) === (p.locationId ?? null);
    if (mine.length === 1 && same(mine[0])) return { changed: false };
    const now = new Date();
    const drop = mine.filter((r) => !same(r));
    if (drop.length) await tx.update(staffMembership).set({ status: "revoked", revokedAt: now, revokedBy: actorId, afterHoursAccess: false }).where(inArray(staffMembership.id, drop.map((r) => r.id)));
    const existing = rows.find(same);
    if (existing) await tx.update(staffMembership).set({ status: "active", revokedAt: null, revokedBy: null }).where(eq(staffMembership.id, existing.id));
    else await tx.insert(staffMembership).values({ userId: targetUserId, orgId, role: p.role, locationId: p.locationId });
    const keep = await remainingLocations(tx, orgId, targetUserId);
    const work = await releaseWork(tx, orgId, actorId, targetUserId, keep, "Volvió a la cola: cambió la sede de quien la tenía.");
    await audit(tx, { actorUserId: actorId, orgId, action: "staff.role_changed", resourceType: "staff_membership", resourceId: targetUserId,
      meta: { from: drop.map((r) => ({ role: r.role, locationId: r.locationId })), to: { role: p.role, locationId: p.locationId }, ...work } });
    return { changed: true, ...work };
  });
}
