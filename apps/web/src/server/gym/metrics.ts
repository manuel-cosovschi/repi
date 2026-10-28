// Métricas del gym (F-GP-01..05, F-GM-01/05, F-GO-01/02/03). Todo sale de eventos reales del período elegido:
// turnos, tareas, revisiones de programa, sesiones y reseñas. Sin dato → null ("Sin datos"), nunca cero inventado.
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { METRIC_DEFS, PERIODS, REVIEW_MIN_N, median, per10h, reviewAggregate, type Period, type ReviewStatus } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, addDays, audit } from "../access/util";
import { createTask, gymContext, need, rolesAt, rosterCounts, scopedLocations, staleHandoffs } from "./services";

const { user, staffMembership, gymLocation, gymMember, program, programVersion, programAssignment, workoutSession, shiftLog, gymTask, review, organization } = schema;

type Win = { from: Date; to: Date };
const win = (period: Period, now = new Date()): Win => ({ from: addDays(now, -PERIODS[period]), to: now });
const overlapH = (a: Date, b: Date | null, w: Win) => Math.max(0, Math.min((b ?? w.to).getTime(), w.to.getTime()) - Math.max(a.getTime(), w.from.getTime())) / 3_600_000;
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

/** Métricas por persona para un conjunto de sedes. Las de resultados de entrenamiento no se atribuyen a personas. */
export async function personMetrics(orgId: string, locationIds: string[], userIds: string[], w: Win, now = new Date()) {
  const out = new Map<string, ReturnType<typeof empty>>();
  function empty() {
    return { hours: 0, req: 0, per10: null as number | null, respMin: null as number | null, overdue: 0, fuOnTime: null as number | null, fuN: 0, pn: 0, pu: 0, onb: 0, uniq: 0, inUse: null as number | null, inUseN: 0, rn: 0, ra: null as number | null, lowSample: true };
  }
  for (const u of userIds) out.set(u, empty());
  if (!userIds.length || !locationIds.length) return out;
  const shifts = await db.select().from(shiftLog).where(and(inArray(shiftLog.userId, userIds), inArray(shiftLog.locationId, locationIds), lt(shiftLog.startedAt, w.to), or(isNull(shiftLog.endedAt), gte(shiftLog.endedAt, w.from))));
  for (const s of shifts) out.get(s.userId)!.hours += overlapH(s.startedAt, s.endedAt, w);
  const done = await db.select().from(gymTask).where(and(inArray(gymTask.locationId, locationIds), inArray(gymTask.completedBy, userIds), gte(gymTask.completedAt, w.from), lt(gymTask.completedAt, w.to)));
  const taken = await db.select().from(gymTask).where(and(inArray(gymTask.locationId, locationIds), inArray(gymTask.takenBy, userIds), gte(gymTask.takenAt, w.from), lt(gymTask.takenAt, w.to)));
  const open = await db.select().from(gymTask).where(and(inArray(gymTask.locationId, locationIds), inArray(gymTask.assigneeUserId, userIds), inArray(gymTask.status, ["open", "in_progress", "follow_up"]), isNotNull(gymTask.dueAt), lt(gymTask.dueAt, now)));
  const followDue = await db.select().from(gymTask).where(and(inArray(gymTask.locationId, locationIds), eq(gymTask.category, "seguimiento"), isNotNull(gymTask.dueAt), gte(gymTask.dueAt, w.from), lt(gymTask.dueAt, w.to)));
  const revs = await db.select({ v: programVersion, gm: program.gymMemberId }).from(programVersion).innerJoin(program, eq(program.id, programVersion.programId))
    .innerJoin(gymMember, eq(gymMember.id, program.gymMemberId))
    .where(and(eq(program.kind, "member_copy"), inArray(gymMember.locationId, locationIds), inArray(programVersion.createdBy, userIds), gte(programVersion.createdAt, w.from), lt(programVersion.createdAt, w.to)));
  const reviews = await db.select().from(review).where(and(inArray(review.locationId, locationIds), inArray(review.trainerUserId, userIds), gte(review.createdAt, w.from), lt(review.createdAt, w.to)));
  // Programas en uso: programa institucional cuya versión vigente firmó la persona, con sesión del socio en 14 días.
  const cur = await db.select({ author: programVersion.createdBy, gm: program.gymMemberId }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId)).innerJoin(programVersion, eq(programVersion.id, program.currentVersionId))
    .innerJoin(gymMember, eq(gymMember.id, program.gymMemberId))
    .where(and(eq(programAssignment.status, "active"), inArray(gymMember.locationId, locationIds), inArray(programVersion.createdBy, userIds)));
  const active14 = cur.length ? new Set((await db.selectDistinct({ gm: workoutSession.gymMemberId }).from(workoutSession)
    .where(and(inArray(workoutSession.gymMemberId, cur.map((c) => c.gm!)), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, addDays(now, -14))))).map((x) => x.gm)) : new Set();

  for (const [u, m] of out) {
    m.hours = Math.round(m.hours * 10) / 10;
    const mine = done.filter((t) => t.completedBy === u);
    m.req = mine.length;
    m.per10 = per10h(m.req, m.hours);
    m.respMin = r1(median(taken.filter((t) => t.takenBy === u && t.source !== "entrenador").map((t) => (t.takenAt!.getTime() - t.createdAt.getTime()) / 60_000)));
    m.overdue = open.filter((t) => t.assigneeUserId === u).length;
    const fu = followDue.filter((t) => t.completedBy === u || (t.status !== "done" && t.assigneeUserId === u));
    m.fuN = fu.length;
    m.fuOnTime = fu.length ? Math.round((fu.filter((t) => t.completedBy === u && t.completedAt && t.completedAt <= t.dueAt!).length / fu.length) * 100) : null;
    m.pn = revs.filter((r) => r.v.createdBy === u && r.v.number === 1).length;
    m.pu = revs.filter((r) => r.v.createdBy === u && r.v.number > 1).length;
    m.onb = mine.filter((t) => t.category === "onboarding").length;
    m.uniq = new Set(mine.map((t) => t.gymMemberId).filter(Boolean)).size;
    const progs = cur.filter((c) => c.author === u);
    m.inUseN = progs.length;
    m.inUse = progs.length ? Math.round((progs.filter((p) => active14.has(p.gm)).length / progs.length) * 100) : null;
    const agg = reviewAggregate(reviews.filter((r) => r.trainerUserId === u).map((r) => ({ stars: r.stars, dims: [r.dim1, r.dim2, r.dim3], status: r.status as ReviewStatus })));
    m.rn = agg.n; m.ra = agg.avg; m.lowSample = agg.lowSample;
  }
  return out;
}

/** Resultados de entrenamiento: sólo agregados de sede (no se atribuyen a personas). */
export async function locationOutcomes(locationIds: string[], now = new Date()) {
  if (!locationIds.length) return null;
  const members = await db.select({ id: gymMember.id }).from(gymMember).where(and(inArray(gymMember.locationId, locationIds), eq(gymMember.status, "active")));
  if (!members.length) return { members: 0, withProgram: null, trained30: null, twoPerWeek: null, sessions30: 0 };
  const ids = members.map((m) => m.id);
  const withProg = await db.select({ id: programAssignment.gymMemberId }).from(programAssignment).where(and(inArray(programAssignment.gymMemberId, ids), eq(programAssignment.status, "active")));
  const s = await db.select({ gm: workoutSession.gymMemberId, endedAt: workoutSession.endedAt }).from(workoutSession)
    .where(and(inArray(workoutSession.gymMemberId, ids), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, addDays(now, -30))));
  const s28 = s.filter((x) => x.endedAt! >= addDays(now, -28));
  const per = new Map<string, number>();
  for (const x of s28) per.set(x.gm!, (per.get(x.gm!) ?? 0) + 1);
  const trained = new Set(s.map((x) => x.gm));
  return {
    members: ids.length, sessions30: s.length,
    withProgram: Math.round((withProg.length / ids.length) * 100),
    trained30: Math.round((trained.size / ids.length) * 100),
    twoPerWeek: Math.round(([...per.values()].filter((n) => n >= 8).length / ids.length) * 100), // 2+ por semana en 4 semanas
  };
}

async function staffIn(orgId: string, locationIds: string[]) {
  const rows = await db.selectDistinctOn([staffMembership.userId], { id: staffMembership.userId, name: user.name, locationId: staffMembership.locationId })
    .from(staffMembership).innerJoin(user, eq(user.id, staffMembership.userId))
    .where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active"), inArray(staffMembership.role, ["floor_trainer", "coordinator"]),
      or(isNull(staffMembership.locationId), inArray(staffMembership.locationId, locationIds))))
    .orderBy(staffMembership.userId);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Turno de referencia de cada persona (el código más planificado en el período) para dar contexto a la comparación. */
async function usualShift(userIds: string[], locationIds: string[], w: Win) {
  if (!userIds.length) return new Map<string, string>();
  const rows = await db.select({ u: schema.shiftPlan.userId, code: schema.shiftPlan.code, n: sql<number>`count(*)::int` }).from(schema.shiftPlan)
    .where(and(inArray(schema.shiftPlan.userId, userIds), inArray(schema.shiftPlan.locationId, locationIds), gte(schema.shiftPlan.date, w.from.toISOString().slice(0, 10))))
    .groupBy(schema.shiftPlan.userId, schema.shiftPlan.code).orderBy(desc(sql`count(*)`));
  const m = new Map<string, string>();
  const L: Record<string, string> = { M: "Mañana", T: "Tarde", N: "Noche", P: "Mañana", F: "Fin de semana" };
  for (const r of rows) if (!m.has(r.u)) m.set(r.u, L[r.code]);
  return m;
}

export async function performanceCenter(actorId: string, orgId: string, locationId: string | null, period: Period, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "team.read");
  const locs = await scopedLocations(ctx, locationId);
  const ids = locs.map((l) => l.id);
  const w = win(period, now);
  const staff = await staffIn(orgId, ids);
  const m = await personMetrics(orgId, ids, staff.map((s) => s.id), w, now);
  const shifts = await usualShift(staff.map((s) => s.id), ids, w);
  const locName = new Map(locs.map((l) => [l.id, l.name]));
  return {
    period, locations: locs.map((l) => ({ id: l.id, name: l.name })), defs: METRIC_DEFS, minN: REVIEW_MIN_N,
    rows: staff.map((s) => ({ id: s.id, name: s.name, sede: s.locationId ? locName.get(s.locationId) ?? "" : "Todas", turno: shifts.get(s.id) ?? null, ...m.get(s.id)! })),
    outcomes: await locationOutcomes(ids, now),
  };
}

export async function trainerDetail(actorId: string, orgId: string, trainerId: string, period: Period, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "team.read");
  const locs = await scopedLocations(ctx, null);
  const ids = locs.map((l) => l.id);
  const staff = await staffIn(orgId, ids);
  const s = staff.find((x) => x.id === trainerId);
  if (!s) {
    // Fuera de la sede o del alcance de gestión: denegado y registrado (SCR-GX-02).
    await audit(db, { actorUserId: actorId, orgId, action: "team.detail_denied", resourceType: "staff", resourceId: trainerId, result: "denied" });
    throw new AccessError("not_found", "No encontramos a esta persona en tus sedes.", 404);
  }
  const w = win(period, now);
  const m = (await personMetrics(orgId, ids, [trainerId], w, now)).get(trainerId)!;
  const weeks = await Promise.all(Array.from({ length: 8 }, async (_, i) => {
    const from = addDays(now, -7 * (8 - i)); const to = addDays(from, 7);
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(gymTask).where(and(eq(gymTask.completedBy, trainerId), inArray(gymTask.locationId, ids), gte(gymTask.completedAt, from), lt(gymTask.completedAt, to)));
    return { label: `S${i + 1}`, n: r?.n ?? 0 };
  }));
  const revs = await db.select({ r: review, member: user.name }).from(review).innerJoin(user, eq(user.id, review.memberUserId))
    .where(and(eq(review.trainerUserId, trainerId), inArray(review.locationId, ids), gte(review.createdAt, w.from))).orderBy(desc(review.createdAt));
  const agg = reviewAggregate(revs.map(({ r }) => ({ stars: r.stars, dims: [r.dim1, r.dim2, r.dim3], status: r.status as ReviewStatus })));
  const tasks = await db.select().from(gymTask).where(and(inArray(gymTask.locationId, ids), or(eq(gymTask.assigneeUserId, trainerId), eq(gymTask.completedBy, trainerId)))).orderBy(desc(gymTask.createdAt)).limit(8);
  const named = gymCanNamed(ctx.roles);
  return {
    id: s.id, name: s.name, period, metrics: m, weeks, dist: agg.dist,
    reviews: revs.filter(({ r }) => r.status !== "removed").slice(0, 6).map(({ r, member }) => ({ id: r.id, stars: r.stars, text: r.status === "published" ? r.text : null, hidden: r.status !== "published", member: named && gymCanNamed(rolesAt(ctx, r.locationId)) ? member : null, at: r.createdAt })),
    tasks: tasks.map((t) => ({ ref: `T-${t.number}`, category: t.category, status: t.status, completedAt: t.completedAt, completedByThem: t.completedBy === trainerId })),
    private: [
      ["Conversaciones privadas", "Mensajes entre entrenador y socios"],
      ["Notas personales del entrenador", "Sólo las ve quien las escribió"],
      ["Datos de salud y Mi cuerpo de socios", "Requieren permiso explícito y con propósito"],
    ],
  };
}
const gymCanNamed = (roles: string[]) => roles.some((r) => r === "owner" || r === "manager");

export async function myPerformance(actorId: string, orgId: string, period: Period, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "perf.own");
  const locs = await scopedLocations(ctx, null);
  return { period, defs: METRIC_DEFS, minN: REVIEW_MIN_N, metrics: (await personMetrics(orgId, locs.map((l) => l.id), [actorId], win(period, now), now)).get(actorId)! };
}

// ── Panel de sede (F-GM-01) ─────────────────────────────────────────────────
export async function managerPanel(actorId: string, orgId: string, locationId: string | null, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "team.read");
  const locs = await scopedLocations(ctx, locationId);
  const ids = locs.map((l) => l.id);
  const counts = await rosterCounts(orgId, ids);
  const onShift = await db.select({ id: shiftLog.userId, name: user.name, since: shiftLog.startedAt }).from(shiftLog).innerJoin(user, eq(user.id, shiftLog.userId))
    .where(and(inArray(shiftLog.locationId, ids), isNull(shiftLog.endedAt))).orderBy(asc(shiftLog.startedAt));
  const tasks = await db.select({ status: gymTask.status, assignee: gymTask.assigneeUserId, due: gymTask.dueAt, cat: gymTask.category }).from(gymTask)
    .where(and(inArray(gymTask.locationId, ids), inArray(gymTask.status, ["open", "pending_acceptance", "in_progress", "follow_up"])));
  const [done7] = await db.select({ n: sql<number>`count(*)::int` }).from(gymTask).where(and(inArray(gymTask.locationId, ids), eq(gymTask.status, "done"), gte(gymTask.completedAt, addDays(now, -7))));
  const openTasks = onShift.length ? await db.select({ u: gymTask.assigneeUserId, n: sql<number>`count(*)::int` }).from(gymTask)
    .where(and(inArray(gymTask.assigneeUserId, onShift.map((o) => o.id)), inArray(gymTask.status, ["open", "in_progress", "follow_up"]))).groupBy(gymTask.assigneeUserId) : [];
  const revs = await db.select().from(review).where(and(inArray(review.locationId, ids), gte(review.createdAt, addDays(now, -30))));
  const agg = reviewAggregate(revs.map((r) => ({ stars: r.stars, dims: [r.dim1, r.dim2, r.dim3], status: r.status as ReviewStatus })));
  const members = await db.select({ id: gymMember.id }).from(gymMember).where(and(inArray(gymMember.locationId, ids), eq(gymMember.status, "active")));
  const weeks = await Promise.all(Array.from({ length: 8 }, async (_, i) => {
    const from = addDays(now, -7 * (8 - i)); const to = addDays(from, 7);
    const [r] = members.length ? await db.select({ n: sql<number>`count(*)::int` }).from(workoutSession)
      .where(and(inArray(workoutSession.gymMemberId, members.map((m) => m.id)), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, from), lt(workoutSession.endedAt, to))) : [{ n: 0 }];
    return { label: `S${i + 1}`, n: r?.n ?? 0 };
  }));
  const recent = await db.select({ r: review, trainer: user.name }).from(review).innerJoin(user, eq(user.id, review.trainerUserId))
    .where(and(inArray(review.locationId, ids), eq(review.status, "published"))).orderBy(desc(review.createdAt)).limit(3);
  const followAll = tasks.filter((t) => t.cat === "seguimiento");
  return {
    locations: locs.map((l) => ({ id: l.id, name: l.name })),
    kpis: {
      roster: counts.roster, members: counts.members, adoption: counts.adoption,
      onShift: onShift.length, shared: tasks.filter((t) => (t.status === "open" || t.status === "follow_up") && !t.assignee).length,
      followOverdue: followAll.filter((t) => t.due && t.due < now).length, followOpen: followAll.length,
      satisfaction: agg.avg, reviews30: agg.n,
    },
    onShift: onShift.map((o) => ({ ...o, openTasks: openTasks.find((x) => x.u === o.id)?.n ?? 0 })),
    taskBars: [
      { label: "Sin asignar", n: tasks.filter((t) => (t.status === "open" || t.status === "follow_up") && !t.assignee).length },
      { label: "Asignadas", n: tasks.filter((t) => t.status !== "pending_acceptance" && t.assignee).length },
      { label: "Traspaso pendiente", n: tasks.filter((t) => t.status === "pending_acceptance").length },
      { label: "Completadas (7 días)", n: done7?.n ?? 0 },
    ],
    weeks, stale: await staleHandoffs(orgId, ids, now),
    recentReviews: recent.map(({ r, trainer }) => ({ id: r.id, stars: r.stars, text: r.text, trainer, at: r.createdAt })),
  };
}

// ── Participación (F-GM-05) ─────────────────────────────────────────────────
export async function engagement(actorId: string, orgId: string, locationId: string | null, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "team.read");
  const locs = await scopedLocations(ctx, locationId);
  const ids = locs.map((l) => l.id);
  const counts = await rosterCounts(orgId, ids);
  const out = await locationOutcomes(ids, now);
  const members = await db.select({ id: gymMember.id, createdAt: gymMember.createdAt }).from(gymMember).where(and(inArray(gymMember.locationId, ids), eq(gymMember.status, "active")));
  const withProg = members.length ? await db.select({ id: programAssignment.gymMemberId }).from(programAssignment).where(and(inArray(programAssignment.gymMemberId, members.map((m) => m.id)), eq(programAssignment.status, "active"))) : [];
  const freq = await Promise.all(Array.from({ length: 8 }, async (_, i) => {
    const from = addDays(now, -7 * (8 - i)); const to = addDays(from, 7);
    const [r] = members.length ? await db.select({ n: sql<number>`count(*)::int` }).from(workoutSession)
      .where(and(inArray(workoutSession.gymMemberId, members.map((m) => m.id)), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, from), lt(workoutSession.endedAt, to))) : [{ n: 0 }];
    return { label: `S${i + 1}`, perMember: members.length ? Math.round(((r?.n ?? 0) / members.length) * 10) / 10 : null };
  }));
  const trained30 = out && out.members ? Math.round(((out.trained30 ?? 0) * out.members) / 100) : 0;
  return {
    funnel: [
      { label: "Padrón del gym", n: counts.roster, note: "Cargado por el gym" },
      { label: "Con cuenta REPI", n: counts.members, note: null },
      { label: "Con programa asignado", n: withProg.length, note: null },
      { label: "Entrenaron en 30 días", n: trained30, note: null },
      { label: "Participan en Repi Club", n: null, note: "Repi Club se construye en la Etapa 6" },
    ],
    freq, withoutProgram: members.length - withProg.length, newThisMonth: members.filter((m) => m.createdAt >= addDays(now, -30)).length,
  };
}

/** Crea una tarea "Programa nuevo" en la cola por cada socio sin programa (sin duplicar las ya abiertas). */
export async function createProgramTasks(actorId: string, orgId: string, locationId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "task.create");
  const [loc] = await scopedLocations(ctx, locationId);
  const members = await db.select({ id: gymMember.id }).from(gymMember).where(and(eq(gymMember.locationId, loc.id), eq(gymMember.status, "active")));
  if (!members.length) return { created: 0 };
  const ids = members.map((m) => m.id);
  const withProg = new Set((await db.select({ id: programAssignment.gymMemberId }).from(programAssignment).where(and(inArray(programAssignment.gymMemberId, ids), eq(programAssignment.status, "active")))).map((x) => x.id));
  const pending = new Set((await db.select({ id: gymTask.gymMemberId }).from(gymTask).where(and(inArray(gymTask.gymMemberId, ids), eq(gymTask.category, "programa_nuevo"), inArray(gymTask.status, ["open", "pending_acceptance", "in_progress", "follow_up"])))).map((x) => x.id));
  const targets = ids.filter((id) => !withProg.has(id) && !pending.has(id)).slice(0, 100);
  for (const id of targets) await createTask(actorId, orgId, loc.id, { gymMemberId: id, category: "programa_nuevo", summary: "Socio sin programa vigente." });
  return { created: targets.length };
}

// ── Dueño: ejecutivo, sedes y configuración (F-GO-01/02/03, F-RV-05) ───────
export async function executive(actorId: string, orgId: string, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "gym.config");
  const locs = await scopedLocations(ctx, null);
  const per = await Promise.all(locs.map(async (l) => {
    const c = await rosterCounts(orgId, [l.id]);
    const o = await locationOutcomes([l.id], now);
    const revs = await db.select().from(review).where(and(eq(review.locationId, l.id), gte(review.createdAt, addDays(now, -90))));
    const agg = reviewAggregate(revs.map((r) => ({ stars: r.stars, dims: [r.dim1, r.dim2, r.dim3], status: r.status as ReviewStatus })));
    const fu = await db.select().from(gymTask).where(and(eq(gymTask.locationId, l.id), eq(gymTask.category, "seguimiento"), isNotNull(gymTask.dueAt), gte(gymTask.dueAt, addDays(now, -30)), lt(gymTask.dueAt, now)));
    const staffN = (await staffIn(orgId, [l.id])).filter((s) => s.locationId === l.id).length;
    return {
      id: l.id, name: l.name, roster: c.roster, members: c.members, linked: c.linked, adoption: c.adoption,
      sessions30: o?.sessions30 ?? 0, perMember30: o && o.members ? Math.round(((o.sessions30 ?? 0) / o.members) * 10) / 10 : null,
      followOnTime: fu.length ? Math.round((fu.filter((t) => t.completedAt && t.completedAt <= t.dueAt!).length / fu.length) * 100) : null,
      satisfaction: agg.avg, reviews: agg.n, trainers: staffN,
    };
  }));
  const sum = (k: "roster" | "members" | "linked" | "sessions30") => per.reduce((a, x) => a + x[k], 0);
  const allRevs = per.reduce((a, x) => a + x.reviews, 0);
  const allRevRows = await db.select().from(review).where(and(eq(review.orgId, orgId), gte(review.createdAt, addDays(now, -90))));
  return {
    kpis: {
      roster: sum("roster"), members: sum("members"), adoption: sum("roster") ? Math.round((Math.min(sum("linked"), sum("roster")) / sum("roster")) * 100) : null, sessions30: sum("sessions30"),
      satisfaction: reviewAggregate(allRevRows.map((r) => ({ stars: r.stars, dims: [r.dim1, r.dim2, r.dim3], status: r.status as ReviewStatus }))).avg, reviews: allRevs, locations: locs.length,
    },
    locations: per,
  };
}

export async function gymConfig(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "gym.config");
  const locs = await db.select().from(gymLocation).where(eq(gymLocation.orgId, orgId));
  const staff = await db.select({ role: staffMembership.role, n: sql<number>`count(distinct ${staffMembership.userId})::int` }).from(staffMembership)
    .where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active"))).groupBy(staffMembership.role);
  const n = (r: string) => staff.find((s) => s.role === r)?.n ?? 0;
  const counts = await rosterCounts(orgId, locs.map((l) => l.id));
  const [progs] = await db.select({ n: sql<number>`count(*)::int` }).from(program).where(and(eq(program.orgId, orgId), eq(program.kind, "member_copy")));
  return {
    org: { name: ctx.org.name, status: ctx.org.status, trialEndsAt: ctx.org.trialEndsAt, reviewResponses: ctx.org.reviewResponses },
    steps: [
      { title: "Registrar el gym", detail: ctx.org.name, done: true },
      { title: "Configurar sedes", detail: locs.map((l) => l.name).join(", ") || "Sin sedes", done: locs.length > 0 },
      { title: "Agregar entrenadores de sala", detail: `${n("floor_trainer")} activos`, done: n("floor_trainer") > 0 },
      { title: "Asignar roles y permisos", detail: `${n("manager")} gerentes · ${n("coordinator")} coordinación · ${n("reception")} recepción`, done: n("manager") > 0 },
      { title: "Cargar padrón de socios", detail: `${counts.roster} en padrón · ${counts.members} con cuenta`, done: counts.roster > 0, pending: "La importación por CSV todavía no está disponible." },
      { title: "Crear programas institucionales", detail: `${progs?.n ?? 0} programas de socios`, done: (progs?.n ?? 0) > 0 },
      { title: "Activar el espacio del gym", detail: ctx.org.status === "active" ? "Activo" : "En prueba", done: ctx.org.status === "active", pending: "Requiere contrato y precios confirmados (D01–D05, Etapa 7)." },
    ],
  };
}

export async function setReviewResponses(actorId: string, orgId: string, on: boolean) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "gym.config");
  await db.update(organization).set({ reviewResponses: on }).where(eq(organization.id, orgId));
  await audit(db, { actorUserId: actorId, orgId, action: on ? "policy.review_responses_on" : "policy.review_responses_off", resourceType: "organization", resourceId: orgId });
  return { reviewResponses: on };
}
