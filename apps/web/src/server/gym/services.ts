// Operación del gym (Etapa 5): turno, cola de asistencia, traspaso, socios, programa institucional, notas, equipo y turnos.
// Fuente: REPI Desktop Gym.dc.html. Toda autorización se resuelve acá por capacidad y sede (MASTER_PROMPT §11).
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  FOLLOWUP_DUE_DAYS, HANDOFF_ESCALATE_MIN, REVIEW_ELIGIBLE, REVIEW_INVITE_COOLDOWN_DAYS, REVIEW_INVITE_TTL_DAYS, SHIFT_CODES, TASK_CATEGORY,
  GYM_HOURS, coverage, floorActionAllowed, gymCan, gymOpenAt, shiftAutoEnd, gymCaps, requiresTwoFactor, sharedWishes, type TrainingWishes, type GymRole, isShiftCode, isTaskCategory, localDate, shiftHours, validateProgramDoc, weekOf,
  type GymCap, type ProgramDoc, type ShiftCode, type TaskCategory, type TaskPriority,
  fmtWeeklyHours, inWeeklyHours, slotOn, weeklyHoursOk, type WeeklyHours,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, addDays, audit, type Tx } from "../access/util";
import { addIso, assertLibrary, lastTimeByExercise, newVersion, plain, readVersion } from "../training/services";
import { createOwnExercise, ensureExerciseCatalog, visibleIn } from "../training/library";
import { cleanBrief, draftProgram, reviseOf, type ProgramBrief } from "../training/program-ai";

const { staffHours, user, organization, gymLocation, staffMembership, gymMember, consentGrant, rosterEntry, program, programVersion, programAssignment,
  workoutSession, shiftPlan, shiftLog, gymTask, gymHandoff, gymHandoffItem, gymNote, reviewInvite, mediaObject, userPref } = schema;

export const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const FORBIDDEN = () => new AccessError("forbidden", "Tu rol no tiene acceso a esta acción.", 403);

// ── Contexto y permisos ─────────────────────────────────────────────────────
export type GymCtx = {
  userId: string; name: string; org: typeof organization.$inferSelect; roles: string[]; caps: GymCap[];
  /** null = todas las sedes de la organización (dueño). */
  locationIds: string[] | null; afterHoursAccess: boolean;
  memberships: { role: string; locationId: string | null; afterHoursAccess: boolean }[];
};

export async function gymContext(actorId: string, orgId: string): Promise<GymCtx> {
  const rows = await db.select({ m: staffMembership, org: organization, name: user.name }).from(staffMembership)
    .innerJoin(organization, eq(organization.id, staffMembership.orgId)).innerJoin(user, eq(user.id, staffMembership.userId))
    .where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active"), eq(organization.kind, "gym")));
  if (!rows.length) throw NOT_FOUND(); // no revela si el gym existe
  const roles = rows.map((r) => r.m.role);
  // La página exige 2FA al dueño (D25); la API también, para que no se pueda saltear el guardia de la superficie.
  if (requiresTwoFactor({ gymRoles: roles as GymRole[] })) {
    const [u] = await db.select({ on: user.twoFactorEnabled }).from(user).where(eq(user.id, actorId));
    if (!u?.on) throw new AccessError("twofa_required", "Activá la verificación en dos pasos para entrar a este espacio.", 403);
  }
  const all = rows.some((r) => !r.m.locationId);
  return {
    userId: actorId, name: rows[0].name, org: rows[0].org, roles, caps: gymCaps(roles),
    locationIds: all ? null : [...new Set(rows.map((r) => r.m.locationId!))], afterHoursAccess: rows.some((r) => r.m.afterHoursAccess),
    memberships: rows.map(({ m }) => ({ role: m.role, locationId: m.locationId, afterHoursAccess: m.afterHoursAccess })),
  };
}
/** Cada contexto es nuevo por operación. Acotar capacidad también acota sus sedes: nunca unir rol de A con sede de B. */
function restrictContext(ctx: GymCtx, memberships: GymCtx["memberships"]) {
  if (!memberships.length) throw FORBIDDEN();
  ctx.memberships = memberships;
  ctx.roles = [...new Set(memberships.map(m => m.role))];
  ctx.caps = gymCaps(ctx.roles);
  ctx.locationIds = memberships.some(m => m.locationId === null) ? null : [...new Set(memberships.map(m => m.locationId!))];
  ctx.afterHoursAccess = memberships.some(m => m.afterHoursAccess);
}
export function need(ctx: GymCtx, cap: GymCap) { restrictContext(ctx, ctx.memberships.filter(m => gymCan([m.role], cap))); }
export function needRoles(ctx: GymCtx, roles: string[]) { restrictContext(ctx, ctx.memberships.filter(m => roles.includes(m.role))); }
export const rolesAt = (ctx: GymCtx, locationId: string) => ctx.memberships.filter(m => m.locationId === null || m.locationId === locationId).map(m => m.role);
const afterHoursAt = (ctx: GymCtx, locationId: string) => ctx.memberships.some(m => m.afterHoursAccess && (m.locationId === null || m.locationId === locationId) && gymCan([m.role], "floor.work"));
export const inScope = (ctx: GymCtx, locationId: string) => ctx.locationIds === null || ctx.locationIds.includes(locationId);

/** Sede pedida (o la primera permitida). Una sede ajena responde 404. */
export async function scopedLocation(ctx: GymCtx, locationId?: string | null) {
  const locs = await db.select().from(gymLocation).where(eq(gymLocation.orgId, ctx.org.id)).orderBy(asc(gymLocation.createdAt));
  const allowed = locs.filter((l) => inScope(ctx, l.id));
  const loc = locationId ? allowed.find((l) => l.id === locationId) : allowed[0];
  if (!loc) throw NOT_FOUND();
  restrictContext(ctx, ctx.memberships.filter(m => m.locationId === null || m.locationId === loc.id));
  return { loc, allowed };
}
export async function scopedLocations(ctx: GymCtx, locationId?: string | null) {
  const all = await db.select().from(gymLocation).where(eq(gymLocation.orgId, ctx.org.id)).orderBy(asc(gymLocation.createdAt));
  const allowed = all.filter(l => inScope(ctx, l.id));
  if (!locationId) return allowed;
  const one = allowed.find((l) => l.id === locationId);
  if (!one) throw NOT_FOUND();
  return [one];
}

const FLOOR_ROLES = ["floor_trainer", "coordinator"] as const;
/** Estados activos de una tarea; WORKING = asignables y trabajables (REPI Connect suma «en atención» y «seguimiento», D126). */
export const ACTIVE = ["open", "pending_acceptance", "in_progress", "follow_up"] as const;
export const WORKING = ["open", "in_progress", "follow_up"] as const;
const isWorking = (s: string) => (WORKING as readonly string[]).includes(s);
/** Tarea que se puede cerrar al guardar el programa del socio: de programa o técnica, activa y libre o tomada por quien guarda. */
const PROGRAM_TASKS = ["programa_nuevo", "actualizar_programa", "onboarding", "tecnica"];
const closesWithProgram = (t: { status: string; category: string; assigneeUserId: string | null }, actorId: string) =>
  isWorking(t.status) && PROGRAM_TASKS.includes(t.category) && (!t.assigneeUserId || t.assigneeUserId === actorId);

/** Historial de la tarea (gym_task_event, D126). Sólo agrega filas; un trigger impide editarlas. */
export async function addEvent(tx: Tx | typeof db, t: { id: string; orgId: string }, e: {
  actor: string | null; kind: (typeof schema.gymTaskEvent.$inferInsert)["kind"]; from?: string | null; to?: string | null; toUserId?: string | null;
  note?: string | null; memberNote?: string | null; dueAt?: Date | null; at?: Date;
}) {
  await tx.insert(schema.gymTaskEvent).values({
    ...(e.at ? { createdAt: e.at } : {}),
    taskId: t.id, orgId: t.orgId, actorUserId: e.actor, kind: e.kind, fromStatus: e.from ?? null, toStatus: e.to ?? null, toUserId: e.toUserId ?? null,
    note: e.note ? e.note.trim().slice(0, 500) : null, memberNote: e.memberNote ? e.memberNote.trim().slice(0, 500) : null, dueAt: e.dueAt ?? null,
  });
}
/** Personal de sala de una sede (para traspasos, reasignación y grilla). */
export async function floorStaff(orgId: string, locationId: string) {
  const rows = await db.selectDistinctOn([staffMembership.userId], { userId: staffMembership.userId, name: user.name, role: staffMembership.role, afterHoursAccess: staffMembership.afterHoursAccess })
    .from(staffMembership).innerJoin(user, eq(user.id, staffMembership.userId))
    .where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active"), inArray(staffMembership.role, [...FLOOR_ROLES]),
      or(eq(staffMembership.locationId, locationId), isNull(staffMembership.locationId))))
    .orderBy(staffMembership.userId);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function activeShift(userId: string, tx: Tx | typeof db = db) {
  const [s] = await tx.select().from(shiftLog).where(and(eq(shiftLog.userId, userId), isNull(shiftLog.endedAt)));
  return s ?? null;
}
/** D08: turno activo en esa sede, o permiso de trabajo fuera de turno. */
export async function gate(ctx: GymCtx, locationId: string, what: string, tx: Tx | typeof db = db) {
  await ensureScheduledShift(ctx.userId, new Date(), tx); // D170: dentro de su horario el turno ya está abierto
  const s = await activeShift(ctx.userId, tx);
  const r = floorActionAllowed({ shiftActive: !!s && s.locationId === locationId, afterHoursAccess: afterHoursAt(ctx, locationId) });
  if (!r.ok) throw new AccessError("no_shift", `Iniciá tu turno para ${what}.`, 409);
  return r.offShift;
}

// ── Turno (F-GT-01) ─────────────────────────────────────────────────────────
export async function myShift(actorId: string, orgId: string, locationId?: string | null, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  const { loc, allowed } = await scopedLocation(ctx, locationId);
  await ensureScheduledShift(actorId, now);
  const active = await activeShift(actorId);
  const today = localDate(now);
  const [hours] = await db.select().from(staffHours).where(and(eq(staffHours.userId, actorId), eq(staffHours.locationId, loc.id)));
  const [plan] = await db.select().from(shiftPlan).where(and(eq(shiftPlan.userId, actorId), eq(shiftPlan.locationId, loc.id), eq(shiftPlan.date, today)));
  const [lastEnded] = await db.select().from(shiftLog).where(and(eq(shiftLog.userId, actorId), eq(shiftLog.locationId, loc.id), gte(shiftLog.startedAt, new Date(`${today}T03:00:00Z`))))
    .orderBy(desc(shiftLog.startedAt)).limit(1);
  const q = await queueCounts(ctx, loc.id);
  return {
    location: { id: loc.id, name: loc.name }, locations: allowed.map((l) => ({ id: l.id, name: l.name })),
    status: active ? (active.locationId === loc.id ? "on" : "elsewhere") : lastEnded?.endedAt ? "ended" : "off",
    startedAt: active?.startedAt ?? null, activeLocationId: active?.locationId ?? null,
    plan: plan ? { code: plan.code, ...SHIFT_CODES[plan.code] } : null,
    hours: hours ? { days: hours.days, from: hours.from, to: hours.to, text: fmtWeeklyHours(hours) } : null,
    auto: active?.source === "schedule", autoEndsAt: active?.source === "schedule" && hours ? slotOn(hours, active.startedAt).end : null,
    afterHoursAccess: afterHoursAt(ctx, loc.id), ...q,
  };
}

async function queueCounts(ctx: GymCtx, locationId: string) {
  const rows = await db.select({ status: gymTask.status, assignee: gymTask.assigneeUserId, n: sql<number>`count(*)::int` }).from(gymTask)
    .where(and(eq(gymTask.locationId, locationId), inArray(gymTask.status, [...ACTIVE]))).groupBy(gymTask.status, gymTask.assigneeUserId);
  const [done] = await db.select({ n: sql<number>`count(*)::int` }).from(gymTask)
    .where(and(eq(gymTask.locationId, locationId), eq(gymTask.completedBy, ctx.userId), gte(gymTask.completedAt, addDays(new Date(), -7))));
  return {
    shared: rows.filter((r) => (r.status === "open" || r.status === "follow_up") && !r.assignee).reduce((a, r) => a + r.n, 0),
    mine: rows.filter((r) => isWorking(r.status) && r.assignee === ctx.userId).reduce((a, r) => a + r.n, 0),
    incoming: rows.filter((r) => r.status === "pending_acceptance" && r.assignee === ctx.userId).reduce((a, r) => a + r.n, 0),
    doneWeek: done?.n ?? 0,
  };
}

/** D158: las pruebas de integración corren a cualquier hora; en producción la regla siempre aplica (y las demos no la tienen). */
const hoursApply = (org: { isDemo: boolean }) => !org.isDemo && process.env.REPI_GYM_HOURS !== "off";

export async function startShift(actorId: string, orgId: string, locationId: string, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  const { loc } = await scopedLocation(ctx, locationId);
  if (hoursApply(ctx.org) && !gymOpenAt(now)) {
    throw new AccessError("gym_closed", `El gimnasio abre de ${GYM_HOURS.open.slice(0, 2).replace(/^0/, "")} a ${GYM_HOURS.close.slice(0, 2)}: el turno se inicia en ese horario.`, 409);
  }
  if (await activeShift(actorId)) throw new AccessError("shift_active", "Ya tenés un turno iniciado.", 409);
  const [plan] = await db.select().from(shiftPlan).where(and(eq(shiftPlan.userId, actorId), eq(shiftPlan.locationId, loc.id), eq(shiftPlan.date, localDate(now))));
  const [s] = await db.insert(shiftLog).values({ orgId, locationId: loc.id, userId: actorId, planId: plan?.id ?? null, startedAt: now }).returning();
  await audit(db, { actorUserId: actorId, orgId, action: "shift.started", resourceType: "shift_log", resourceId: s.id, meta: { planned: !!plan } });
  return { startedAt: s.startedAt, planned: !!plan };
}

/**
 * D158: nadie del equipo figura en turno fuera del horario del gimnasio. Los turnos que quedaron abiertos terminan solos al
 * cierre del día en que empezaron (las horas del desempeño no se inflan). Lo corre el cron de cada minuto; las demos no.
 */
export async function closeShiftsAfterHours(now = new Date()) {
  const open = await db.select({ s: shiftLog, isDemo: organization.isDemo }).from(shiftLog)
    .innerJoin(organization, eq(organization.id, shiftLog.orgId)).where(isNull(shiftLog.endedAt));
  let closed = 0;
  for (const { s, isDemo } of open) {
    if (!hoursApply({ isDemo })) continue;
    const end = shiftAutoEnd(s.startedAt, now);
    if (!end) continue;
    const r = await db.update(shiftLog).set({ endedAt: end }).where(and(eq(shiftLog.id, s.id), isNull(shiftLog.endedAt))).returning({ id: shiftLog.id });
    if (!r.length) continue;
    closed++;
    await audit(db, { actorUserId: null, orgId: s.orgId, action: "shift.auto_ended", resourceType: "shift_log", resourceId: s.id, meta: { endedAt: end.toISOString(), reason: "gym_hours" } });
  }
  return closed;
}

// ── Horario habitual del profesor (D170) ────────────────────────────────────
/** Franja del horario que cubre `now` para esta persona (con rol de sala vigente en esa sede), si la hay. */
async function scheduledSlot(userId: string, now: Date, tx: Tx | typeof db = db) {
  const rows = await tx.select({ h: staffHours, isDemo: organization.isDemo }).from(staffHours).innerJoin(organization, eq(organization.id, staffHours.orgId))
    .innerJoin(staffMembership, and(eq(staffMembership.userId, staffHours.userId), eq(staffMembership.orgId, staffHours.orgId), eq(staffMembership.status, "active"),
      inArray(staffMembership.role, [...FLOOR_ROLES]), or(isNull(staffMembership.locationId), eq(staffMembership.locationId, staffHours.locationId))))
    .where(eq(staffHours.userId, userId));
  return rows.find((r) => inWeeklyHours(r.h, now) && (!hoursApply(r) || gymOpenAt(now))) ?? null;
}

/**
 * Dentro de su horario el turno se abre solo (sin «Iniciar turno»). Si ya tuvo un turno en esa franja (por ejemplo, lo
 * cerró con el traspaso), no se reabre. Idempotente: un solo turno abierto por persona (índice único).
 */
export async function ensureScheduledShift(userId: string, now = new Date(), tx: Tx | typeof db = db) {
  if (await activeShift(userId, tx)) return null;
  const slot = await scheduledSlot(userId, now, tx);
  if (!slot) return null;
  const { start } = slotOn(slot.h, now);
  // Las horas cuentan desde que se abre (el cron corre cada minuto), no desde el inicio teórico de la franja.
  const [had] = await tx.select({ id: shiftLog.id }).from(shiftLog).where(and(eq(shiftLog.userId, userId), eq(shiftLog.locationId, slot.h.locationId), gte(shiftLog.startedAt, start))).limit(1);
  if (had) return null;
  const [plan] = await tx.select({ id: shiftPlan.id }).from(shiftPlan).where(and(eq(shiftPlan.userId, userId), eq(shiftPlan.locationId, slot.h.locationId), eq(shiftPlan.date, localDate(now))));
  const [s] = await tx.insert(shiftLog).values({ orgId: slot.h.orgId, locationId: slot.h.locationId, userId, planId: plan?.id ?? null, startedAt: now, source: "schedule" })
    .onConflictDoNothing().returning();
  if (s) await audit(tx, { actorUserId: null, orgId: slot.h.orgId, action: "shift.started", resourceType: "shift_log", resourceId: s.id, meta: { source: "schedule" } });
  return s ?? null;
}

/** Cron de cada minuto: abre los turnos de quienes entran en su horario y cierra los abiertos por horario al terminar la franja. */
export async function syncScheduledShifts(now = new Date()) {
  let opened = 0, closed = 0;
  const auto = await db.select({ s: shiftLog, h: staffHours }).from(shiftLog)
    .leftJoin(staffHours, and(eq(staffHours.userId, shiftLog.userId), eq(staffHours.locationId, shiftLog.locationId)))
    .where(and(isNull(shiftLog.endedAt), eq(shiftLog.source, "schedule")));
  for (const { s, h } of auto) {
    const end = h ? slotOn(h, s.startedAt).end : null;
    if (!end || now < end) continue;
    const r = await db.update(shiftLog).set({ endedAt: end }).where(and(eq(shiftLog.id, s.id), isNull(shiftLog.endedAt))).returning({ id: shiftLog.id });
    if (r.length) { closed++; await audit(db, { actorUserId: null, orgId: s.orgId, action: "shift.auto_ended", resourceType: "shift_log", resourceId: s.id, meta: { endedAt: end.toISOString(), reason: "schedule" } }); }
  }
  const people = await db.selectDistinct({ userId: staffHours.userId }).from(staffHours).innerJoin(organization, eq(organization.id, staffHours.orgId)).where(eq(organization.isDemo, false));
  for (const p of people) if (await ensureScheduledShift(p.userId, now)) opened++;
  return { opened, closed };
}

/** Horario de quien entra (o, con permiso de planificar turnos, de alguien de su equipo). */
export async function staffHoursFor(actorId: string, orgId: string, userId?: string | null) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, userId && userId !== actorId ? "shifts.plan" : "floor.work");
  const who = userId ?? actorId;
  const rows = await db.select({ h: staffHours, loc: gymLocation.name }).from(staffHours).innerJoin(gymLocation, eq(gymLocation.id, staffHours.locationId))
    .where(and(eq(staffHours.userId, who), eq(staffHours.orgId, orgId)));
  const floor = gymCan(ctx.roles, "floor.work") && ctx.roles.some((r) => (FLOOR_ROLES as readonly string[]).includes(r));
  return {
    hours: rows.filter((r) => inScope(ctx, r.h.locationId)).map((r) => ({ locationId: r.h.locationId, location: r.loc, days: r.h.days, from: r.h.from, to: r.h.to, text: fmtWeeklyHours(r.h) })),
    // Pedírselo a quien trabaja en sala y todavía no lo cargó.
    missing: who === actorId && floor && !rows.length,
  };
}

export async function setStaffHours(actorId: string, orgId: string, p: { locationId: string; days: number[]; from: string; to: string; userId?: string | null }) {
  const ctx = await gymContext(actorId, orgId);
  const who = p.userId ?? actorId;
  need(ctx, who !== actorId ? "shifts.plan" : "floor.work");
  const { loc } = await scopedLocation(ctx, p.locationId);
  const h: WeeklyHours = { days: [...new Set(p.days)].sort(), from: p.from, to: p.to };
  if (!weeklyHoursOk(h)) throw new AccessError("invalid", "Elegí al menos un día y una franja válida (la hora de fin, después de la de inicio).");
  if (!(await floorStaff(orgId, loc.id)).some((x) => x.userId === who)) throw new AccessError("invalid", "Esa persona no trabaja en sala en esta sede.");
  await db.insert(staffHours).values({ orgId, locationId: loc.id, userId: who, ...h, setBy: actorId })
    .onConflictDoUpdate({ target: [staffHours.userId, staffHours.locationId], set: { ...h, setBy: actorId, updatedAt: new Date() } });
  await audit(db, { actorUserId: actorId, orgId, action: "staff.hours_set", resourceType: "staff_hours", resourceId: who, meta: { locationId: loc.id, ...h } });
  return staffHoursFor(actorId, orgId, who === actorId ? null : who);
}

// ── Cola de asistencia (F-GT-02) ────────────────────────────────────────────
const taskCols = {
  id: gymTask.id, number: gymTask.number, gymMemberId: gymTask.gymMemberId, category: gymTask.category, priority: gymTask.priority, status: gymTask.status,
  source: gymTask.source, summary: gymTask.summary, videoId: gymTask.videoId, assigneeUserId: gymTask.assigneeUserId, createdAt: gymTask.createdAt,
  dueAt: gymTask.dueAt, takenAt: gymTask.takenAt, completedAt: gymTask.completedAt, completedBy: gymTask.completedBy, completedOffShift: gymTask.completedOffShift,
  locationId: gymTask.locationId,
};
type TaskRow = { [K in keyof typeof taskCols]: (typeof gymTask.$inferSelect)[K extends "id" ? "id" : K] };

async function decorate(rows: TaskRow[], withSummary: boolean) {
  const userIds = [...new Set(rows.flatMap((r) => [r.assigneeUserId, r.completedBy]).filter(Boolean) as string[])];
  const memberIds = [...new Set(rows.map((r) => r.gymMemberId).filter(Boolean) as string[])];
  const names = userIds.length ? new Map((await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))).map((u) => [u.id, u.name])) : new Map();
  const members = memberIds.length ? new Map((await db.select({ id: gymMember.id, name: user.name }).from(gymMember).innerJoin(user, eq(user.id, gymMember.userId)).where(inArray(gymMember.id, memberIds))).map((m) => [m.id, m.name])) : new Map();
  const handoffs = rows.length ? await db.select({ taskId: gymHandoffItem.taskId, from: user.name, at: gymHandoff.createdAt, toUserId: gymHandoff.toUserId, acceptedAt: gymHandoffItem.acceptedAt })
    .from(gymHandoffItem).innerJoin(gymHandoff, eq(gymHandoff.id, gymHandoffItem.handoffId)).innerJoin(user, eq(user.id, gymHandoff.fromUserId))
    .where(inArray(gymHandoffItem.taskId, rows.map((r) => r.id))).orderBy(desc(gymHandoff.createdAt)) : [];
  return rows.map((r) => {
    const h = handoffs.find((x) => x.taskId === r.id);
    return {
      id: r.id, ref: `T-${r.number}`, member: r.gymMemberId ? members.get(r.gymMemberId) ?? null : null, gymMemberId: r.gymMemberId,
      category: r.category, priority: r.priority, status: r.status, source: r.source, ...(withSummary ? { summary: r.summary, hasVideo: !!r.videoId, videoId: r.videoId } : {}),
      assignee: r.assigneeUserId ? { id: r.assigneeUserId, name: names.get(r.assigneeUserId) ?? "" } : null,
      completedBy: r.completedBy ? names.get(r.completedBy) ?? null : null, completedOffShift: r.completedOffShift,
      createdAt: r.createdAt, dueAt: r.dueAt, takenAt: r.takenAt, completedAt: r.completedAt,
      overdue: isWorking(r.status) && !!r.dueAt && r.dueAt < new Date(),
      handoffFrom: h ? { name: h.from, at: h.at } : null,
    };
  });
}

export async function listQueue(actorId: string, orgId: string, locationId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  const { loc } = await scopedLocation(ctx, locationId);
  const shared = await db.select(taskCols).from(gymTask).where(and(eq(gymTask.locationId, loc.id), inArray(gymTask.status, ["open", "follow_up"]), isNull(gymTask.assigneeUserId))).orderBy(asc(gymTask.createdAt));
  const mine = await db.select(taskCols).from(gymTask).where(and(eq(gymTask.locationId, loc.id), inArray(gymTask.status, [...ACTIVE]), eq(gymTask.assigneeUserId, actorId))).orderBy(asc(gymTask.createdAt));
  const done = await db.select(taskCols).from(gymTask).where(and(eq(gymTask.locationId, loc.id), eq(gymTask.completedBy, actorId), gte(gymTask.completedAt, addDays(new Date(), -7)))).orderBy(desc(gymTask.completedAt));
  return { shared: await decorate(shared, true), mine: await decorate(mine, true), done: await decorate(done, true) };
}

/** Número legible por organización, serializado con un lock transaccional (sin carreras). */
async function nextNumber(tx: Tx, table: "gym_task" | "moderation_case", orgId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${table}:${orgId}`}))`);
  const r = await tx.execute(sql`select coalesce(max(number), ${table === "gym_task" ? 1000 : 10}) + 1 as n from ${sql.identifier(table)} where org_id = ${orgId}`);
  return Number((r as unknown as { n: number }[])[0].n);
}
export { nextNumber };

export async function memberInLocation(orgId: string, locationId: string, gymMemberId: string, tx: Tx | typeof db = db) {
  const [m] = await tx.select({ m: gymMember, name: user.name }).from(gymMember).innerJoin(user, eq(user.id, gymMember.userId))
    .where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId), eq(gymMember.locationId, locationId)));
  if (!m) throw NOT_FOUND();
  return m;
}

export async function createTask(actorId: string, orgId: string, locationId: string, p: {
  gymMemberId?: string | null; category: string; priority?: TaskPriority; summary: string; assignToMe?: boolean; dueAt?: string | null;
}) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "task.create");
  const { loc } = await scopedLocation(ctx, locationId);
  if (!isTaskCategory(p.category)) throw new AccessError("invalid", "Elegí el tipo de tarea.");
  const summary = (p.summary ?? "").trim();
  if (summary.length < 3) throw new AccessError("invalid", "Escribí un resumen breve de la tarea.");
  const priority = p.priority && ["alta", "media", "baja"].includes(p.priority) ? p.priority : "media";
  if (p.gymMemberId) await memberInLocation(orgId, loc.id, p.gymMemberId);
  const mine = !!p.assignToMe && gymCan(ctx.roles, "floor.work");
  const source = gymCan(ctx.roles, "floor.work") ? "entrenador" : ctx.roles.includes("reception") ? "recepcion" : "gerencia";
  const dueAt = p.dueAt ? new Date(p.dueAt) : p.category === "seguimiento" ? addDays(new Date(), FOLLOWUP_DUE_DAYS) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new AccessError("invalid", "La fecha objetivo no es válida.");
  return db.transaction(async (tx) => {
    if (mine) await gate(ctx, loc.id, "asignarte tareas", tx);
    const number = await nextNumber(tx, "gym_task", orgId);
    const [t] = await tx.insert(gymTask).values({
      number, orgId, locationId: loc.id, gymMemberId: p.gymMemberId ?? null, category: p.category as TaskCategory, priority, source, summary: summary.slice(0, 500),
      createdBy: actorId, assigneeUserId: mine ? actorId : null, takenAt: mine ? new Date() : null, takenBy: mine ? actorId : null, dueAt,
    }).returning();
    await addEvent(tx, t, { actor: actorId, kind: "created", to: "open", note: summary });
    if (mine) await addEvent(tx, t, { actor: actorId, kind: "taken", from: "open", to: "open" });
    await audit(tx, { actorUserId: actorId, orgId, action: "task.created", resourceType: "gym_task", resourceId: t.id, meta: { category: t.category, source } });
    return { id: t.id, ref: `T-${t.number}` };
  });
}

export async function lockTask(tx: Tx, ctx: GymCtx, taskId: string) {
  const [t] = await tx.select().from(gymTask).where(and(eq(gymTask.id, taskId), eq(gymTask.orgId, ctx.org.id))).for("update");
  if (!t || !inScope(ctx, t.locationId)) throw NOT_FOUND();
  return t;
}

/** Tomar: en transacción con bloqueo; si otra persona la tomó antes, se informa quién (sin dos asignados incompatibles). */
export async function takeTask(actorId: string, orgId: string, taskId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  return db.transaction(async (tx) => {
    const t = await lockTask(tx, ctx, taskId);
    await gate(ctx, t.locationId, "tomar solicitudes", tx);
    if ((t.status !== "open" && t.status !== "follow_up") || t.assigneeUserId) {
      if (t.assigneeUserId === actorId) return { ref: `T-${t.number}`, already: true };
      const [who] = t.assigneeUserId ? await tx.select({ name: user.name }).from(user).where(eq(user.id, t.assigneeUserId)) : [];
      throw new AccessError("taken", who ? `${who.name} ya tomó T-${t.number}.` : `T-${t.number} ya no está en la cola.`, 409);
    }
    await tx.update(gymTask).set({ assigneeUserId: actorId, takenAt: t.takenAt ?? new Date(), takenBy: t.takenBy ?? actorId }).where(eq(gymTask.id, t.id));
    await addEvent(tx, t, { actor: actorId, kind: "taken", from: t.status, to: t.status });
    await audit(tx, { actorUserId: actorId, orgId, action: "task.taken", resourceType: "gym_task", resourceId: t.id });
    return { ref: `T-${t.number}`, already: false };
  });
}

async function completeInTx(tx: Tx, ctx: GymCtx, t: typeof gymTask.$inferSelect, offShift: boolean, now = new Date()) {
  await tx.update(gymTask).set({ status: "done", completedAt: now, completedBy: ctx.userId, completedOffShift: offShift }).where(eq(gymTask.id, t.id));
  await addEvent(tx, t, { actor: ctx.userId, kind: "resolved", from: t.status, to: "done" });
  await audit(tx, { actorUserId: ctx.userId, orgId: ctx.org.id, action: "task.completed", resourceType: "gym_task", resourceId: t.id, meta: { offShift } });
  return maybeInvite(tx, t, ctx.userId, now);
}

/**
 * Interacción elegible → invitación opcional a reseñar (F-RV-01). [S] Una por tarea; si el socio recibió otra en los
 * últimos 14 días queda "suppressed" (registrada, no se muestra).
 */
export async function maybeInvite(tx: Tx, t: typeof gymTask.$inferSelect, trainerId: string, now: Date) {
  if (!t.gymMemberId || !REVIEW_ELIGIBLE.includes(t.category as TaskCategory)) return { invite: null };
  const [m] = await tx.select({ userId: gymMember.userId, status: gymMember.status }).from(gymMember).where(eq(gymMember.id, t.gymMemberId));
  if (!m || m.status !== "active" || m.userId === trainerId) return { invite: null };
  const [recent] = await tx.select({ id: reviewInvite.id }).from(reviewInvite)
    .where(and(eq(reviewInvite.memberUserId, m.userId), eq(reviewInvite.orgId, t.orgId), ne(reviewInvite.status, "suppressed"), gte(reviewInvite.createdAt, addDays(now, -REVIEW_INVITE_COOLDOWN_DAYS))));
  const status = recent ? "suppressed" : "pending";
  await tx.insert(reviewInvite).values({ orgId: t.orgId, locationId: t.locationId, taskId: t.id, memberUserId: m.userId, trainerUserId: trainerId, category: t.category, status, expiresAt: addDays(now, REVIEW_INVITE_TTL_DAYS) })
    .onConflictDoNothing();
  return { invite: status };
}

export async function completeTask(actorId: string, orgId: string, taskId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  return db.transaction(async (tx) => {
    const t = await lockTask(tx, ctx, taskId);
    if (t.status === "done") {
      if (t.completedBy === actorId) return { ref: `T-${t.number}`, invite: null, already: true };
      throw new AccessError("closed", `T-${t.number} ya fue completada.`, 409);
    }
    if (!isWorking(t.status) || t.assigneeUserId !== actorId) throw new AccessError("not_assigned", "Tomá la tarea antes de completarla.", 409);
    const offShift = await gate(ctx, t.locationId, "completar tareas", tx);
    const r = await completeInTx(tx, ctx, t, offShift);
    return { ref: `T-${t.number}`, invite: r.invite, already: false };
  });
}

export async function acceptHandoff(actorId: string, orgId: string, taskId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  return db.transaction(async (tx) => {
    const t = await lockTask(tx, ctx, taskId);
    if (t.status !== "pending_acceptance" || t.assigneeUserId !== actorId) throw new AccessError("invalid", "Este traspaso no está pendiente para vos.", 409);
    await tx.update(gymTask).set({ status: "open" }).where(eq(gymTask.id, t.id));
    await tx.update(gymHandoffItem).set({ acceptedAt: new Date(), acceptedBy: actorId }).where(and(eq(gymHandoffItem.taskId, t.id), isNull(gymHandoffItem.acceptedAt)));
    await addEvent(tx, t, { actor: actorId, kind: "accepted", from: t.status, to: "open" });
    await audit(tx, { actorUserId: actorId, orgId, action: "handoff.accepted", resourceType: "gym_task", resourceId: t.id });
    return { ref: `T-${t.number}` };
  });
}

/** Reasignar (gerencia/coordinación). Una tarea completada no se reasigna; la atribución se discute por disputa. */
export async function reassignTask(actorId: string, orgId: string, taskId: string, toUserId: string | null) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "task.reassign");
  return db.transaction(async (tx) => {
    const t = await lockTask(tx, ctx, taskId);
    if (t.status === "done" || t.status === "cancelled") throw new AccessError("closed", "Esta tarea ya está cerrada.", 409);
    if (toUserId && !(await floorStaff(orgId, t.locationId)).some((s) => s.userId === toUserId)) throw new AccessError("invalid", "Esa persona no trabaja en la sala de esta sede.");
    const status = t.status === "follow_up" ? "follow_up" : "open";
    await tx.update(gymTask).set({ assigneeUserId: toUserId, status, takenAt: toUserId ? t.takenAt ?? new Date() : t.takenAt }).where(eq(gymTask.id, t.id));
    await addEvent(tx, t, { actor: actorId, kind: "reassigned", from: t.status, to: status, toUserId });
    await audit(tx, { actorUserId: actorId, orgId, action: "task.reassigned", resourceType: "gym_task", resourceId: t.id, meta: { from: t.assigneeUserId, to: toUserId } });
    return { ref: `T-${t.number}` };
  });
}

/** Tareas para gerencia: sólo metadatos (sin resumen ni video). */
export async function managerTasks(actorId: string, orgId: string, locationId: string | null, filter: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "task.reassign");
  const locs = await scopedLocations(ctx, locationId);
  const ids = locs.map((l) => l.id);
  const cond = {
    shared: and(inArray(gymTask.status, ["open", "follow_up"]), isNull(gymTask.assigneeUserId)),
    open: and(inArray(gymTask.status, [...WORKING]), sql`${gymTask.assigneeUserId} is not null`),
    pending: eq(gymTask.status, "pending_acceptance"),
    done: and(eq(gymTask.status, "done"), gte(gymTask.completedAt, addDays(new Date(), -30))),
    all: or(inArray(gymTask.status, [...ACTIVE]), and(eq(gymTask.status, "done"), gte(gymTask.completedAt, addDays(new Date(), -30)))),
  }[filter as "all"] ?? undefined;
  const rows = await db.select(taskCols).from(gymTask).where(and(inArray(gymTask.locationId, ids), cond)).orderBy(desc(gymTask.createdAt)).limit(200);
  const staff = locationId ? await floorStaff(orgId, locationId) : [];
  return { tasks: await decorate(rows, false), staff: staff.map((s) => ({ id: s.userId, name: s.name })) };
}

// ── Traspaso de turno (F-GT-04) ─────────────────────────────────────────────
export async function handoffOptions(actorId: string, orgId: string, locationId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  const { loc } = await scopedLocation(ctx, locationId);
  const today = localDate(new Date());
  const staff = (await floorStaff(orgId, loc.id)).filter((s) => s.userId !== actorId);
  const plans = staff.length ? await db.select().from(shiftPlan).where(and(eq(shiftPlan.locationId, loc.id), inArray(shiftPlan.userId, staff.map((s) => s.userId)), gte(shiftPlan.date, today))).orderBy(asc(shiftPlan.date)) : [];
  const mine = await db.select(taskCols).from(gymTask).where(and(eq(gymTask.locationId, loc.id), inArray(gymTask.status, [...WORKING]), eq(gymTask.assigneeUserId, actorId))).orderBy(asc(gymTask.createdAt));
  const history = await db.select({ at: gymHandoff.createdAt, from: gymHandoff.fromUserId, to: gymHandoff.toUserId, n: sql<number>`(select count(*)::int from gym_handoff_item i where i.handoff_id = ${gymHandoff.id})` })
    .from(gymHandoff).where(and(eq(gymHandoff.locationId, loc.id), or(eq(gymHandoff.fromUserId, actorId), eq(gymHandoff.toUserId, actorId)))).orderBy(desc(gymHandoff.createdAt)).limit(8);
  const names = new Map([[actorId, ctx.name], ...staff.map((s) => [s.userId, s.name] as [string, string])]);
  return {
    tasks: await decorate(mine, true),
    targets: staff.map((s) => {
      const next = plans.find((p) => p.userId === s.userId);
      return { id: s.userId, name: s.name, next: next ? { date: next.date, ...SHIFT_CODES[next.code] } : null };
    }),
    history: history.map((h) => ({ at: h.at, from: names.get(h.from) ?? "Otra persona", to: h.to ? names.get(h.to) ?? "Otra persona" : "la cola compartida", n: h.n })),
  };
}

/**
 * Cierra el turno traspasando pendientes. Con destinatario quedan "pending_acceptance" hasta que acepte;
 * a la cola compartida quedan abiertas sin asignar. Las tareas no elegidas siguen asignadas a quien cierra.
 */
export async function closeShift(actorId: string, orgId: string, locationId: string, p: { toUserId: string | null; items: { taskId: string; summary: string }[] }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  const { loc } = await scopedLocation(ctx, locationId);
  if (p.toUserId && !(await floorStaff(orgId, loc.id)).some((s) => s.userId === p.toUserId && s.userId !== actorId)) throw new AccessError("invalid", "Elegí a quién traspasar.");
  return db.transaction(async (tx) => {
    const s = await activeShift(actorId, tx);
    if (!s || s.locationId !== loc.id) throw new AccessError("no_shift", "No tenés un turno iniciado en esta sede.", 409);
    let handoffId: string | null = null;
    if (p.items.length) {
      const [h] = await tx.insert(gymHandoff).values({ orgId, locationId: loc.id, fromUserId: actorId, toUserId: p.toUserId, shiftLogId: s.id }).returning();
      handoffId = h.id;
      for (const it of p.items) {
        const t = await lockTask(tx, ctx, it.taskId);
        if (!isWorking(t.status) || t.assigneeUserId !== actorId || t.locationId !== loc.id) throw new AccessError("invalid", `T-${t.number} ya no está asignada a vos.`, 409);
        const summary = (it.summary ?? "").trim().slice(0, 500) || t.summary;
        // Un pedido del socio conserva su texto original; lo que deja quien traspasa queda en el historial (D126).
        const status = p.toUserId ? "pending_acceptance" : t.status === "follow_up" ? "follow_up" : "open";
        await tx.update(gymTask).set({ ...(t.source === "app" && t.reason ? {} : { summary }), assigneeUserId: p.toUserId, status }).where(eq(gymTask.id, t.id));
        await tx.insert(gymHandoffItem).values({ handoffId: h.id, taskId: t.id, summary });
        await addEvent(tx, t, { actor: actorId, kind: "transferred", from: t.status, to: status, toUserId: p.toUserId, note: summary });
      }
    }
    await tx.update(shiftLog).set({ endedAt: new Date() }).where(eq(shiftLog.id, s.id));
    await audit(tx, { actorUserId: actorId, orgId, action: "shift.closed", resourceType: "shift_log", resourceId: s.id, meta: { handoff: handoffId, items: p.items.length, to: p.toUserId } });
    return { handedOff: p.items.length };
  });
}

/** Traspasos sin aceptar pasado el inicio del turno del destinatario + 30 min (propuesta [S]): se muestran a coordinación. */
export async function staleHandoffs(orgId: string, locationIds: string[], now = new Date()) {
  if (!locationIds.length) return [];
  const rows = await db.select({ taskId: gymTask.id, number: gymTask.number, to: gymTask.assigneeUserId, at: gymHandoff.createdAt, locationId: gymTask.locationId })
    .from(gymTask).innerJoin(gymHandoffItem, eq(gymHandoffItem.taskId, gymTask.id)).innerJoin(gymHandoff, eq(gymHandoff.id, gymHandoffItem.handoffId))
    .where(and(eq(gymTask.orgId, orgId), inArray(gymTask.locationId, locationIds), eq(gymTask.status, "pending_acceptance"), isNull(gymHandoffItem.acceptedAt)));
  const out = [];
  for (const r of rows) {
    if (!r.to) continue;
    const [s] = await db.select().from(shiftLog).where(and(eq(shiftLog.userId, r.to), gte(shiftLog.startedAt, r.at))).orderBy(asc(shiftLog.startedAt)).limit(1);
    if (s && now.getTime() - s.startedAt.getTime() > HANDOFF_ESCALATE_MIN * 60_000) out.push({ ref: `T-${r.number}`, taskId: r.taskId, toUserId: r.to, since: s.startedAt });
  }
  return out;
}

// ── Socios y programa institucional (F-GT-03) ───────────────────────────────
const memberStatus = (since: Date, lastAt: Date | null, now: Date) => {
  const days = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (!lastAt) return days(since) <= 14 ? { label: "Nueva", tone: "info" } : { label: "Sin entrenamientos", tone: "mute" };
  if (days(lastAt) > 10) return { label: `Sin venir ${days(lastAt)} días`, tone: "warn" };
  return { label: "Activa", tone: "ok" };
};

export async function listMembers(actorId: string, orgId: string, locationId: string, q = "", now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "member.read");
  const { loc } = await scopedLocation(ctx, locationId);
  const rows = await db.select({ m: gymMember, name: user.name }).from(gymMember).innerJoin(user, eq(user.id, gymMember.userId))
    .where(and(eq(gymMember.locationId, loc.id), eq(gymMember.status, "active"), q ? sql`${user.name} ilike ${"%" + q.slice(0, 60) + "%"}` : undefined)).orderBy(asc(user.name)).limit(200);
  const ids = rows.map((r) => r.m.id);
  const last = ids.length ? await db.select({ id: workoutSession.gymMemberId, at: sql<Date>`max(${workoutSession.endedAt})`, n30: sql<number>`count(*) filter (where ${workoutSession.endedAt} >= ${addDays(now, -30).toISOString()})::int` })
    .from(workoutSession).where(and(inArray(workoutSession.gymMemberId, ids), eq(workoutSession.status, "completed"))).groupBy(workoutSession.gymMemberId) : [];
  const progs = ids.length ? await db.select({ id: programAssignment.gymMemberId, name: programVersion.name, n: programVersion.number }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId)).innerJoin(programVersion, eq(programVersion.id, program.currentVersionId))
    .where(and(inArray(programAssignment.gymMemberId, ids), eq(programAssignment.status, "active"))) : [];
  // Aprobados que todavía no confirmaron en su app qué comparten (F-14): sólo el nombre, para que sala sepa que vienen.
  const awaiting = q ? [] : await db.select({ name: user.name }).from(gymMember).innerJoin(user, eq(user.id, gymMember.userId))
    .where(and(eq(gymMember.locationId, loc.id), eq(gymMember.status, "pending_consent"))).orderBy(asc(user.name)).limit(50);
  return {
    location: { id: loc.id, name: loc.name },
    awaiting: awaiting.map((a) => a.name),
    members: rows.map((r) => {
      const l = last.find((x) => x.id === r.m.id);
      const lastAt = l?.at ? new Date(l.at) : null;
      const pg = progs.find((x) => x.id === r.m.id);
      return { id: r.m.id, name: r.name, since: r.m.createdAt, lastSessionAt: lastAt, visits30: l?.n30 ?? 0, program: pg ? { name: pg.name, revision: pg.n } : null, status: memberStatus(r.m.createdAt, lastAt, now) };
    }),
  };
}

/** Datos que el gym nunca ve (DEC-10/11): se listan con candado en la ficha. */
export const GYM_NEVER_SEES = ["Salud, nutrición y Mi cuerpo", "App del socio y su coach privado", "Conversaciones con su coach"];

/** D154: al editar el programa de un socio, lo que hizo la última vez en cada ejercicio con este gym (con su consentimiento). */
export async function memberLastTimes(actorId: string, orgId: string, gymMemberId: string, exerciseIds: string[]) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "member.read");
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
  const [g] = await db.select({ id: consentGrant.id }).from(consentGrant).where(and(eq(consentGrant.relationId, m.id), eq(consentGrant.item, "attendance_training"), eq(consentGrant.status, "active")));
  if (!g) return {};
  return Object.fromEntries(await lastTimeByExercise(m.userId, exerciseIds.slice(0, 60), undefined, { gymMemberId: m.id }));
}

export async function memberDetail(actorId: string, orgId: string, gymMemberId: string, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "member.read");
  const [m] = await db.select({ m: gymMember, name: user.name }).from(gymMember).innerJoin(user, eq(user.id, gymMember.userId))
    .where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.m.locationId)) throw NOT_FOUND();
  const [g] = await db.select({ id: consentGrant.id }).from(consentGrant).where(and(eq(consentGrant.relationId, m.m.id), eq(consentGrant.item, "attendance_training"), eq(consentGrant.status, "active")));
  const prog = await memberProgram(m.m.id);
  const sessions = g ? await db.select({ endedAt: workoutSession.endedAt, dayName: workoutSession.dayName }).from(workoutSession)
    .where(and(eq(workoutSession.gymMemberId, m.m.id), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, addDays(now, -56)))).orderBy(desc(workoutSession.endedAt)) : [];
  const week0 = weekOf(now)[0];
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = addIso(week0, -7 * (7 - i)); const to = addIso(from, 7);
    return { label: `S${i + 1}`, n: sessions.filter((s) => { const d = localDate(s.endedAt!); return d >= from && d < to; }).length };
  });
  const notes = await db.select({ n: gymNote, author: user.name }).from(gymNote).innerJoin(user, eq(user.id, gymNote.authorUserId))
    .where(and(eq(gymNote.gymMemberId, m.m.id), isNull(gymNote.deletedAt), or(eq(gymNote.kind, "institutional"), eq(gymNote.authorUserId, actorId)))).orderBy(desc(gymNote.createdAt));
  const tasks = await db.select(taskCols).from(gymTask).where(and(eq(gymTask.gymMemberId, m.m.id), inArray(gymTask.status, [...ACTIVE]))).orderBy(asc(gymTask.createdAt));
  const lastAt = sessions[0]?.endedAt ?? null;
  // D147: lo que busca entrenando, sólo para quien arma su programa y sólo si el socio eligió compartirlo.
  const builds = !!g && gymCan(rolesAt(ctx, m.m.locationId), "program.edit");
  const [pref] = builds ? await db.select({ wishes: userPref.wishes }).from(userPref).where(eq(userPref.userId, m.m.userId)) : [];
  return {
    id: m.m.id, name: m.name, since: m.m.createdAt, status: memberStatus(m.m.createdAt, lastAt, now), trainingShared: !!g,
    wishes: builds ? sharedWishes(pref?.wishes as TrainingWishes | null) : null,
    lastSessionAt: lastAt, visits30: sessions.filter((s) => s.endedAt! >= addDays(now, -30)).length, weeks,
    program: prog, tasks: await decorate(tasks, gymCan(rolesAt(ctx, m.m.locationId), "floor.work")),
    programTaskId: tasks.find((t) => closesWithProgram(t, actorId))?.id ?? null,
    notes: notes.map((x) => ({ id: x.n.id, kind: x.n.kind, text: x.n.text, author: x.author, mine: x.n.authorUserId === actorId, at: x.n.createdAt })),
    canEdit: gymCan(rolesAt(ctx, m.m.locationId), "program.edit"), canWriteNotes: gymCan(rolesAt(ctx, m.m.locationId), "floor.work"), restricted: GYM_NEVER_SEES,
  };
}

async function memberProgram(gymMemberId: string) {
  const [a] = await db.select().from(programAssignment).where(and(eq(programAssignment.gymMemberId, gymMemberId), eq(programAssignment.status, "active")));
  if (!a) return null;
  const [p] = await db.select().from(program).where(eq(program.id, a.programId));
  const { version, doc } = await readVersion(p.currentVersionId!);
  const revs = await db.select({ v: programVersion, author: user.name }).from(programVersion).innerJoin(user, eq(user.id, programVersion.createdBy))
    .where(eq(programVersion.programId, p.id)).orderBy(desc(programVersion.number)).limit(10);
  return {
    programId: p.id, startsOn: a.startsOn, revision: version.number, doc,
    revisions: revs.map((r) => ({ number: r.v.number, author: r.author, reason: r.v.reason, at: r.v.createdAt })),
  };
}

/**
 * Programa institucional: cada guardado es una revisión nueva con autor y motivo visible al equipo (las sesiones
 * anteriores conservan su versión). Opcionalmente completa en la misma transacción la tarea relacionada.
 */
/** D155: propuesta de programa armada por REPI con los datos que carga el profe (borrador: se revisa y se guarda aparte). */
export async function memberProgramDraft(actorId: string, orgId: string, gymMemberId: string, brief: Partial<ProgramBrief> & { change?: string; current?: ProgramDoc }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "program.edit");
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
  const b = cleanBrief(brief);
  const revise = reviseOf(brief);
  const d = await draftProgram(orgId, b, revise);
  // Sin el texto de limitaciones ni preferencias (datos de salud) ni el pedido de cambio: sólo que se pidió y cómo salió.
  await audit(db, { actorUserId: actorId, orgId, action: "member_program.ai_draft", resourceType: "gym_member", resourceId: m.id,
    meta: { byRules: d.byRules, days: d.doc.days.length, hadLimitations: !!b.limitations, revised: !!revise } });
  return d;
}

export async function saveMemberProgram(actorId: string, orgId: string, gymMemberId: string, p: { doc: ProgramDoc; reason: string; completeTaskId?: string | null }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "program.edit");
  const reason = (p.reason ?? "").trim();
  if (reason.length < 3) throw new AccessError("invalid", "Contá el motivo del cambio: lo ve el equipo.");
  const v = validateProgramDoc(p.doc);
  if (!v.ok) throw new AccessError("invalid", v.error);
  if (!v.doc.days.some((d) => d.exercises.length)) throw new AccessError("invalid", "Agregá al menos un ejercicio.");
  await assertLibrary(orgId, v.doc);
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId))).for("update");
    if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
    if (m.status !== "active") throw new AccessError("invalid", "Este socio no está activo.");
    const offShift = await gate(ctx, m.locationId, "editar programas", tx);
    const [a] = await tx.select().from(programAssignment).where(and(eq(programAssignment.gymMemberId, m.id), eq(programAssignment.status, "active")));
    let number = 1;
    if (a) {
      const [pr] = await tx.select().from(program).where(eq(program.id, a.programId)).for("update");
      const cur = await readVersion(pr.currentVersionId!, tx);
      if (JSON.stringify(plain(cur.doc)) === JSON.stringify(v.doc)) throw new AccessError("invalid", "No hay cambios para guardar.");
      number = cur.version.number + 1;
      await tx.update(programVersion).set({ locked: true }).where(eq(programVersion.id, cur.version.id));
      await newVersion(tx, pr.id, number, v.doc, actorId, reason.slice(0, 300));
    } else {
      const [pr] = await tx.insert(program).values({ orgId, kind: "member_copy", gymMemberId: m.id, createdBy: actorId }).returning();
      await newVersion(tx, pr.id, 1, v.doc, actorId, reason.slice(0, 300));
      await tx.insert(programAssignment).values({ gymMemberId: m.id, programId: pr.id, startsOn: localDate(new Date()), assignedBy: actorId, assignedAt: new Date() }); // ver F-CL-14
    }
    await audit(tx, { actorUserId: actorId, orgId, action: number === 1 ? "member_program.created" : "member_program.revised", resourceType: "gym_member", resourceId: m.id, meta: { revision: number, offShift } });
    let completed: { ref: string; invite: string | null } | null = null;
    if (p.completeTaskId) {
      const t = await lockTask(tx, ctx, p.completeTaskId);
      if (t.gymMemberId !== m.id || !closesWithProgram(t, actorId)) throw new AccessError("invalid", "La tarea elegida no está disponible.", 409);
      if (!t.assigneeUserId) await tx.update(gymTask).set({ assigneeUserId: actorId, takenAt: new Date(), takenBy: t.takenBy ?? actorId }).where(eq(gymTask.id, t.id));
      const r = await completeInTx(tx, ctx, t, offShift);
      completed = { ref: `T-${t.number}`, invite: r.invite };
    }
    return { revision: number, completed };
  });
}

export async function addNote(actorId: string, orgId: string, gymMemberId: string, p: { kind: "institutional" | "personal"; text: string }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "floor.work");
  if (!["institutional", "personal"].includes(p.kind)) throw new AccessError("invalid", "Tipo de nota inválido.");
  const text = (p.text ?? "").trim();
  if (text.length < 2) throw new AccessError("invalid", "Escribí la nota.");
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
  const [n] = await db.insert(gymNote).values({ orgId, locationId: m.locationId, gymMemberId: m.id, authorUserId: actorId, kind: p.kind, text: text.slice(0, 1000) }).returning();
  return { id: n.id };
}

export async function gymLibrary(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "program.edit");
  await ensureExerciseCatalog();
  return db.select({ id: schema.exercise.id, name: schema.exercise.name, group: schema.exercise.muscleGroup, kind: schema.exercise.kind, own: sql<boolean>`${schema.exercise.orgId} is not null` }).from(schema.exercise)
    .where(visibleIn(orgId)).orderBy(asc(schema.exercise.name));
}

/** Ejercicio propio del gimnasio (D129): entrenadores de sala y gestión con permiso de armar programas. */
export async function gymCreateExercise(actorId: string, orgId: string, p: { name: string; group: string; kind: string }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "program.edit");
  return createOwnExercise(actorId, orgId, p);
}

// ── Equipo y turnos (F-GM-02, F-GM-04) ──────────────────────────────────────
export async function teamList(actorId: string, orgId: string, locationId: string | null) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "team.read");
  const locs = await scopedLocations(ctx, locationId);
  const ids = locs.map((l) => l.id);
  const rows = await db.select({ m: staffMembership, name: user.name, email: user.email }).from(staffMembership).innerJoin(user, eq(user.id, staffMembership.userId))
    .where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active"), ne(staffMembership.role, "owner"),
      or(isNull(staffMembership.locationId), inArray(staffMembership.locationId, ids))));
  const uids = [...new Set(rows.map((r) => r.m.userId))];
  const active = uids.length ? await db.select().from(shiftLog).where(and(inArray(shiftLog.userId, uids), inArray(shiftLog.locationId, ids), isNull(shiftLog.endedAt))) : [];
  const open = uids.length ? await db.select({ u: gymTask.assigneeUserId, n: sql<number>`count(*)::int` }).from(gymTask)
    .where(and(inArray(gymTask.assigneeUserId, uids), inArray(gymTask.locationId, ids), inArray(gymTask.status, [...ACTIVE]))).groupBy(gymTask.assigneeUserId) : [];
  const today = localDate(new Date());
  const plans = uids.length ? await db.select().from(shiftPlan).where(and(inArray(shiftPlan.userId, uids), inArray(shiftPlan.locationId, ids), eq(shiftPlan.date, today))) : [];
  const locName = new Map(locs.map((l) => [l.id, l.name]));
  return {
    canManage: ctx.roles.some((r) => r === "owner" || r === "manager"),
    staff: uids.map((id) => {
      const mine = rows.filter((r) => r.m.userId === id);
      const sh = active.find((a) => a.userId === id);
      const pl = plans.find((p) => p.userId === id);
      return {
        id, name: mine[0].name, roles: [...new Set(mine.map((r) => r.m.role))], location: mine[0].m.locationId ? locName.get(mine[0].m.locationId) ?? "Otra sede" : "Todas las sedes",
        onShift: !!sh, shiftSince: sh?.startedAt ?? null, plannedToday: pl ? { code: pl.code, ...SHIFT_CODES[pl.code] } : null,
        openTasks: open.find((o) => o.u === id)?.n ?? 0, afterHoursAccess: mine.some((r) => r.m.afterHoursAccess),
      };
    }).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function setAfterHours(actorId: string, orgId: string, userId: string, on: boolean) {
  const ctx = await gymContext(actorId, orgId);
  needRoles(ctx, ["owner", "manager"]);
  const rows = await db.select().from(staffMembership).where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.userId, userId), eq(staffMembership.status, "active"), inArray(staffMembership.role, [...FLOOR_ROLES])));
  const allowed = rows.filter(r => r.locationId ? inScope(ctx, r.locationId) : ctx.locationIds === null);
  if (!allowed.length) throw NOT_FOUND();
  await db.update(staffMembership).set({ afterHoursAccess: on }).where(inArray(staffMembership.id, allowed.map(r => r.id)));
  await audit(db, { actorUserId: actorId, orgId, action: on ? "staff.after_hours_granted" : "staff.after_hours_revoked", resourceType: "staff_membership", resourceId: userId });
  return { afterHoursAccess: on };
}

export async function weekPlan(actorId: string, orgId: string, locationId: string, weekStart?: string | null, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "shifts.plan");
  const { loc } = await scopedLocation(ctx, locationId);
  const start = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekOf(new Date(`${weekStart}T15:00:00Z`))[0] : weekOf(now)[0];
  const days = Array.from({ length: 7 }, (_, i) => addIso(start, i));
  const staff = await floorStaff(orgId, loc.id);
  const plans = staff.length ? await db.select().from(shiftPlan).where(and(eq(shiftPlan.locationId, loc.id), inArray(shiftPlan.date, days))) : [];
  const rows = staff.map((s) => ({ userId: s.userId, name: s.name, cells: days.map((d) => (plans.find((p) => p.userId === s.userId && p.date === d)?.code ?? null) as ShiftCode | null) }));
  const labels = days.map((d) => { const [, m, dd] = d.split("-"); return `${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][days.indexOf(d)]} ${Number(dd)}/${Number(m)}`; });
  const cov = coverage(rows.map((r) => r.cells), labels);
  return {
    location: { id: loc.id, name: loc.name }, weekStart: start, prevWeek: addIso(start, -7), nextWeek: addIso(start, 7), days, labels,
    rows: rows.map((r) => ({ ...r, hours: r.cells.reduce((a, c) => a + (c ? shiftHours(c) : 0), 0) })),
    coverage: cov.cells, gaps: cov.gaps, codes: SHIFT_CODES,
  };
}

export async function setPlanCell(actorId: string, orgId: string, locationId: string, p: { userId: string; date: string; code: string | null }) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "shifts.plan");
  const { loc } = await scopedLocation(ctx, locationId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new AccessError("invalid", "Fecha inválida.");
  if (p.date < addIso(localDate(new Date()), -7)) throw new AccessError("invalid", "No se editan semanas pasadas.");
  if (p.code !== null && !isShiftCode(p.code)) throw new AccessError("invalid", "Turno inválido.");
  if (!(await floorStaff(orgId, loc.id)).some((s) => s.userId === p.userId)) throw NOT_FOUND();
  if (p.code === null) await db.delete(shiftPlan).where(and(eq(shiftPlan.userId, p.userId), eq(shiftPlan.locationId, loc.id), eq(shiftPlan.date, p.date)));
  else await db.insert(shiftPlan).values({ orgId, locationId: loc.id, userId: p.userId, date: p.date, code: p.code as ShiftCode, createdBy: actorId })
    .onConflictDoUpdate({ target: [shiftPlan.userId, shiftPlan.locationId, shiftPlan.date], set: { code: p.code as ShiftCode, createdBy: actorId, updatedAt: new Date() } });
  return { ok: true };
}

// ── Acceso a datos privados desde gestión (SCR-GX-02): siempre denegado y auditado ──
export async function tryPrivate(actorId: string, orgId: string, targetUserId: string, what: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "team.read");
  await audit(db, { actorUserId: actorId, orgId, action: "private.read_attempt", resourceType: "staff_private", resourceId: targetUserId, result: "denied", meta: { what: what.slice(0, 80) } });
  throw new AccessError("denied_private", "Fuera del alcance de gestión: no está disponible para ningún rol del gym. El intento quedó registrado.", 403);
}

// ── Socio: pedido al equipo de sala (D41) ───────────────────────────────────
export async function myGymRelations(userId: string) {
  return db.select({ m: gymMember, org: organization, loc: gymLocation }).from(gymMember)
    .innerJoin(organization, eq(organization.id, gymMember.orgId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.userId, userId), eq(gymMember.status, "active"))).orderBy(asc(gymMember.createdAt));
}

/** Pedido del socio desde la app → tarea en la cola compartida de su sede. Sólo su texto: nunca mensajes con su coach. */
export async function createMemberTask(userId: string, p: { gymMemberId?: string | null; kind: string; text: string; videoId?: string | null }) {
  const rels = await myGymRelations(userId);
  const r = p.gymMemberId ? rels.find((x) => x.m.id === p.gymMemberId) : rels[0];
  if (!r) throw new AccessError("no_gym", "No sos socio activo de un gym en REPI.", 409);
  const category = ({ rutina: "actualizar_programa", tecnica: "tecnica", consulta: "consulta", programa: "programa_nuevo" } as Record<string, TaskCategory>)[p.kind];
  const text = (p.text ?? "").trim();
  if (!category || text.length < 3) throw new AccessError("invalid", "Contá qué necesitás.");
  if (p.videoId) {
    const [v] = await db.select().from(mediaObject).where(and(eq(mediaObject.id, p.videoId), eq(mediaObject.ownerUserId, userId), isNull(mediaObject.deletedAt)));
    const used = await db.select({ id: gymTask.id }).from(gymTask).where(eq(gymTask.videoId, p.videoId));
    const usedReq = await db.select({ id: schema.studentRequest.id }).from(schema.studentRequest).where(eq(schema.studentRequest.videoId, p.videoId));
    if (!v || used.length || usedReq.length) throw new AccessError("invalid", "El video no es válido.");
  }
  if (category === "programa_nuevo") {
    const [open] = await db.select({ id: gymTask.id }).from(gymTask).where(and(eq(gymTask.gymMemberId, r.m.id), eq(gymTask.category, "programa_nuevo"), inArray(gymTask.status, [...ACTIVE])));
    if (open) return { id: open.id, place: `${r.org.name} · ${r.loc.name}`, duplicate: true };
  }
  return db.transaction(async (tx) => {
    const number = await nextNumber(tx, "gym_task", r.org.id);
    const [t] = await tx.insert(gymTask).values({
      number, orgId: r.org.id, locationId: r.loc.id, gymMemberId: r.m.id, category, priority: category === "programa_nuevo" ? "alta" : "media", source: "app",
      summary: text.slice(0, 500), videoId: p.videoId ?? null, createdBy: userId,
    }).returning();
    await addEvent(tx, t, { actor: userId, kind: "created", to: "open", note: text.slice(0, 500) });
    await audit(tx, { actorUserId: userId, orgId: r.org.id, action: "task.created", resourceType: "gym_task", resourceId: t.id, meta: { source: "app", category } });
    return { id: t.id, place: `${r.org.name} · ${r.loc.name}`, duplicate: false };
  });
}

/** Pedidos del socio al equipo de sala, con estado legible y sin datos de quién lo tomó más allá del nombre. */
export async function myGymTasks(userId: string) {
  const rels = await myGymRelations(userId);
  if (!rels.length) return [];
  const rows = await db.select({ t: gymTask, who: user.name }).from(gymTask).leftJoin(user, eq(user.id, gymTask.completedBy))
    .where(and(inArray(gymTask.gymMemberId, rels.map((r) => r.m.id)), eq(gymTask.source, "app"), ne(gymTask.status, "cancelled"))).orderBy(desc(gymTask.createdAt)).limit(20);
  return rows.map((r) => ({
    id: r.t.id, category: r.t.category, label: TASK_CATEGORY[r.t.category], text: r.t.summary, createdAt: r.t.createdAt,
    status: r.t.status === "done" ? "done" : r.t.assigneeUserId ? "taken" : "open", doneBy: r.who, completedAt: r.t.completedAt, unseen: r.t.status === "done" && !r.t.seenByMemberAt,
  }));
}
export async function markGymTaskSeen(userId: string, taskId: string) {
  const rels = await myGymRelations(userId);
  await db.update(gymTask).set({ seenByMemberAt: new Date() }).where(and(eq(gymTask.id, taskId), inArray(gymTask.gymMemberId, rels.length ? rels.map((r) => r.m.id) : ["-"])));
}

// ── Padrón vs cuentas (para panel y participación) ──────────────────────────
export async function rosterCounts(orgId: string, locationIds: string[]) {
  const [roster] = await db.select({ n: sql<number>`count(*)::int` }).from(rosterEntry).where(and(eq(rosterEntry.orgId, orgId), inArray(rosterEntry.locationId, locationIds)));
  const [members] = await db.select({ n: sql<number>`count(*)::int`, linked: sql<number>`count(${gymMember.rosterEntryId})::int` }).from(gymMember)
    .where(and(eq(gymMember.orgId, orgId), inArray(gymMember.locationId, locationIds), eq(gymMember.status, "active")));
  // Adopción = socios con cuenta vinculados a una entrada del padrón ÷ padrón (no se cuenta a quien no figura en el padrón).
  const linked = members?.linked ?? 0, r = roster?.n ?? 0;
  return { roster: r, members: members?.n ?? 0, linked, adoption: r ? Math.round((Math.min(linked, r) / r) * 100) : null };
}
