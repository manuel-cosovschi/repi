// REPI Connect · seguimiento de sala (D126). Extiende la cola de asistencia (gym_task, F-GT-02) y el traspaso de turno
// (F-GT-04): mismo modelo, mismos permisos por capacidad y sede, sin base paralela. Se activa por gimnasio desde REPI Admin
// (organization.connect_enabled) y existe un interruptor general (features.ts → connect).
// Privacidad: el equipo de sala ve el pedido, el contexto del ejercicio y el historial institucional; la gerencia y el
// dueño sólo ven indicadores agregados; nadie del gym ve chats con el coach privado, salud ni las sesiones de ese programa.
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  CONNECT_ACTIVE, CONNECT_AVAILABILITY, CONNECT_COMMENT_MAX, CONNECT_DUE_SOON_HOURS, CONNECT_FOLLOWUP_DEFAULT_DAYS, CONNECT_NOTE_MAX, CONNECT_REASONS,
  CONNECT_STATE_LABEL, CONNECT_WAIT_ALERT_MIN, TASK_CATEGORY, connectMetrics, connectNext, connectPriority, connectSort, connectState, gymCan, isConnectReason,
  localDate, type ConnectAction, type ConnectAvailability, type ConnectReason, type ConnectStatus, type TaskPriority,
} from "@repi/domain";
import { db, schema } from "@/db";
import { featureOn } from "@/lib/features";
import { AccessError, addDays, audit, type Tx } from "../access/util";
import { enqueue } from "../push/services";
import { floorOnShift } from "../join/services";
import { alertLocation } from "./alerts";
import { NOT_FOUND, activeShift, addEvent, floorStaff, gate, gymContext, inScope, lockTask, maybeInvite, myGymRelations, need, nextNumber, scopedLocation, scopedLocations, type GymCtx } from "./services";

const { user, organization, gymLocation, gymMember, gymTask, gymTaskEvent, gymHandoff, gymHandoffItem, shiftLog, workoutSession, setLog, programExercise,
  programAssignment, program, programVersion } = schema;

type Task = typeof gymTask.$inferSelect;
const first = (name: string | null | undefined) => (name ?? "").split(" ")[0] || "Alguien del equipo";
const clip = (s: string | null | undefined, max: number) => (s ?? "").trim().slice(0, max);

// ── Activación ──────────────────────────────────────────────────────────────
export const connectOn = (org: { connectEnabled: boolean; kind?: string }) => featureOn("connect") && org.connectEnabled && (org.kind ?? "gym") === "gym";
const OFF = () => new AccessError("connect_off", "REPI Connect no está activo en este gimnasio.", 409);
function requireConnect(ctx: GymCtx) { if (!connectOn(ctx.org)) throw OFF(); }

const reasonLabel = (t: Pick<Task, "reason" | "category">) => (t.reason && isConnectReason(t.reason) ? CONNECT_REASONS[t.reason].label : TASK_CATEGORY[t.category]);

// ── Socio ───────────────────────────────────────────────────────────────────
type CreateInput = {
  reason: string; comment?: string | null; clientKey?: string | null; gymMemberId?: string | null;
  context?: { sessionId?: string | null; programExerciseId?: string | null; exerciseId?: string | null; setIndex?: number | null } | null;
};

/** Contexto estructurado del ejercicio. Sólo se guardan referencias a la sesión si es del programa del gym; de un programa con coach privado queda sólo el ejercicio. */
async function resolveContext(userId: string, gymMemberId: string, c: NonNullable<CreateInput["context"]>) {
  // La sesión puede no haber llegado al servidor todavía (se empezó sin conexión): queda sólo el ejercicio de la biblioteca.
  const byExercise = async () => {
    if (!c.exerciseId) return null;
    const [e] = await db.select({ id: schema.exercise.id, name: schema.exercise.name }).from(schema.exercise).where(eq(schema.exercise.id, c.exerciseId));
    return e ? { exerciseId: e.id, exerciseName: e.name, fromSession: false } : null;
  };
  if (!c.sessionId || !c.programExerciseId) return byExercise();
  const [s] = await db.select().from(workoutSession).where(and(eq(workoutSession.id, c.sessionId), eq(workoutSession.userId, userId)));
  if (!s) return byExercise();
  const [pe] = await db.select({ id: programExercise.id, exerciseId: programExercise.exerciseId, name: programExercise.name, dayId: programExercise.dayId })
    .from(programExercise).where(eq(programExercise.id, c.programExerciseId));
  if (!pe || pe.dayId !== s.dayId) throw new AccessError("invalid", "Ese ejercicio no es de este entrenamiento.");
  const fromSession = s.status === "in_progress" || s.status === "paused";
  if (s.gymMemberId !== gymMemberId) return { exerciseId: pe.exerciseId, exerciseName: pe.name, fromSession };
  const [pv] = await db.select({ name: programVersion.name }).from(programVersion).where(eq(programVersion.id, s.versionId));
  const setIndex = Number.isInteger(c.setIndex) && c.setIndex! >= 0 && c.setIndex! < 50 ? c.setIndex! : undefined;
  return { exerciseId: pe.exerciseId, exerciseName: pe.name, sessionId: s.id, programExerciseId: pe.id, setIndex, programName: pv?.name, fromSession };
}

export async function memberCreate(userId: string, p: CreateInput, now = new Date()) {
  const rels = await myGymRelations(userId);
  const r = p.gymMemberId ? rels.find((x) => x.m.id === p.gymMemberId) : rels.find((x) => connectOn(x.org)) ?? rels[0];
  if (!r) throw new AccessError("no_gym", "No sos socio activo de un gym en REPI.", 409);
  if (!connectOn(r.org)) throw OFF();
  if (!isConnectReason(p.reason)) throw new AccessError("invalid", "Elegí el motivo.");
  const reason: ConnectReason = p.reason;
  const comment = clip(p.comment, CONNECT_COMMENT_MAX);
  if (reason === "otro" && comment.length < 3) throw new AccessError("invalid", "Contá brevemente qué necesitás.");
  const clientKey = p.clientKey ? clip(p.clientKey, 64) : null;
  if (clientKey) {
    const [prev] = await db.select({ id: gymTask.id, number: gymTask.number }).from(gymTask).where(and(eq(gymTask.createdBy, userId), eq(gymTask.clientKey, clientKey)));
    if (prev) return { id: prev.id, ref: `T-${prev.number}`, duplicate: true, place: `${r.org.name} · ${r.loc.name}` };
  }
  const context = p.context ? await resolveContext(userId, r.m.id, p.context) : null;
  // Un pedido igual (mismo motivo y ejercicio) todavía abierto no se duplica: se devuelve el existente.
  const open = await db.select({ id: gymTask.id, number: gymTask.number, context: gymTask.context }).from(gymTask)
    .where(and(eq(gymTask.gymMemberId, r.m.id), eq(gymTask.reason, reason), inArray(gymTask.status, CONNECT_ACTIVE)));
  const same = open.find((o) => (o.context?.exerciseId ?? null) === (context?.exerciseId ?? null));
  if (same) return { id: same.id, ref: `T-${same.number}`, duplicate: true, place: `${r.org.name} · ${r.loc.name}` };
  const locationId = context?.fromSession ? await alertLocation({ id: r.m.id, orgId: r.org.id, locationId: r.loc.id }, now) : r.loc.id;
  const category = CONNECT_REASONS[reason].category;
  const priority: TaskPriority = connectPriority({ reason, fromSession: !!context?.fromSession });
  const summary = comment || `${CONNECT_REASONS[reason].label}${context?.exerciseName ? ` · ${context.exerciseName}` : ""}`;
  const t = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, "gym_task", r.org.id);
    const [row] = await tx.insert(gymTask).values({
      number, orgId: r.org.id, locationId, gymMemberId: r.m.id, category, priority, source: "app", summary, reason, context, clientKey, createdBy: userId, createdAt: now,
    }).onConflictDoNothing().returning();
    if (!row) return null; // reintento concurrente con la misma clave
    await addEvent(tx, row, { actor: userId, kind: "created", to: "open", note: comment || null, at: now });
    await audit(tx, { actorUserId: userId, orgId: r.org.id, action: "connect.request_created", resourceType: "gym_task", resourceId: row.id, meta: { reason, fromSession: !!context?.fromSession } });
    return row;
  });
  if (!t) {
    const [prev] = await db.select({ id: gymTask.id, number: gymTask.number }).from(gymTask).where(and(eq(gymTask.createdBy, userId), eq(gymTask.clientKey, clientKey!)));
    return { id: prev.id, ref: `T-${prev.number}`, duplicate: true, place: `${r.org.name} · ${r.loc.name}` };
  }
  // Aviso a quienes están en turno en esa sede. Texto mínimo (puede verse en la pantalla bloqueada): sin nombre del socio.
  const to = (await floorOnShift(r.org.id, locationId)).filter((u) => u !== userId);
  await enqueue(to, { kind: "assist_new", dedupe: `assist:${t.id}`, title: "Nuevo pedido en sala", body: CONNECT_REASONS[reason].label + (context?.exerciseName ? ` · ${context.exerciseName}` : ""), url: `/gym/${r.org.id}?s=queue&sel=${t.id}` });
  return { id: t.id, ref: `T-${t.number}`, duplicate: false, place: `${r.org.name} · ${r.loc.name}`, notified: to.length };
}

async function memberTask(userId: string, taskId: string) {
  const rels = await myGymRelations(userId);
  const [t] = rels.length ? await db.select().from(gymTask).where(and(eq(gymTask.id, taskId), inArray(gymTask.gymMemberId, rels.map((r) => r.m.id)), eq(gymTask.createdBy, userId))) : [];
  if (!t) throw NOT_FOUND();
  const rel = rels.find((r) => r.m.id === t.gymMemberId)!;
  return { t, rel };
}

/** Línea de tiempo que ve el socio: sin registros internos del equipo ni nombres completos. */
function memberTimeline(events: { e: typeof gymTaskEvent.$inferSelect; actor: string | null; to: string | null }[], userId: string) {
  const out: { at: Date; text: string; note?: string | null }[] = [];
  for (const { e, actor, to } of events) {
    const at = e.createdAt;
    switch (e.kind) {
      case "created": out.push({ at, text: "Enviaste el pedido", note: e.note }); break;
      case "taken": out.push({ at, text: `Lo tomó ${first(actor)}` }); break;
      case "started": out.push({ at, text: `${first(actor)} te está atendiendo` }); break;
      case "follow_up": out.push({ at, text: e.dueAt ? `Quedó un seguimiento para el ${localDate(e.dueAt).split("-").reverse().slice(0, 2).join("/")}` : "Quedó un seguimiento pendiente" }); break;
      case "transferred": out.push({ at, text: "Pasó a otro profesor para continuar" }); break;
      case "accepted": out.push({ at, text: `Lo continúa ${first(actor)}` }); break;
      case "declined": out.push({ at, text: "Volvió a la cola del equipo de sala" }); break;
      case "reassigned": out.push({ at, text: e.toUserId ? `Lo continúa ${first(to)}` : "Volvió a la cola del equipo de sala" }); break;
      case "resolved": out.push({ at, text: `Resuelto por ${first(actor)}`, note: e.memberNote }); break;
      case "cancelled": out.push({ at, text: e.actorUserId === userId ? "Lo cancelaste" : "El equipo lo cerró sin resolver", note: e.memberNote }); break;
      case "member_comment": out.push({ at, text: "Agregaste un comentario", note: e.note }); break;
      case "feedback": out.push({ at, text: e.note === "yes" ? "Te sirvió la ayuda" : "Nos contaste que no te sirvió" }); break;
    }
  }
  return out;
}

async function eventsOf(taskIds: string[]) {
  if (!taskIds.length) return [];
  const toUser = schema.user;
  const rows = await db.select({ e: gymTaskEvent, actor: user.name }).from(gymTaskEvent).leftJoin(user, eq(user.id, gymTaskEvent.actorUserId))
    .where(inArray(gymTaskEvent.taskId, taskIds)).orderBy(asc(gymTaskEvent.createdAt));
  const toIds = [...new Set(rows.map((r) => r.e.toUserId).filter(Boolean) as string[])];
  const names = toIds.length ? new Map((await db.select({ id: toUser.id, name: toUser.name }).from(toUser).where(inArray(toUser.id, toIds))).map((u) => [u.id, u.name])) : new Map<string, string>();
  return rows.map((r) => ({ ...r, to: r.e.toUserId ? names.get(r.e.toUserId) ?? null : null }));
}

/** Panel del socio: activado o no, y sus pedidos con estado real. */
export async function memberBoard(userId: string) {
  const rels = await myGymRelations(userId);
  const on = rels.filter((r) => connectOn(r.org));
  if (!on.length) return { enabled: false as const, requests: [] };
  const rows = await db.select({ t: gymTask, who: user.name }).from(gymTask).leftJoin(user, eq(user.id, gymTask.assigneeUserId))
    .where(and(inArray(gymTask.gymMemberId, on.map((r) => r.m.id)), eq(gymTask.createdBy, userId), eq(gymTask.source, "app"))).orderBy(desc(gymTask.createdAt)).limit(30);
  return {
    enabled: true as const,
    place: `${on[0].org.name} · ${on[0].loc.name}`, gymMemberId: on[0].m.id,
    requests: rows.map(({ t, who }) => ({
      id: t.id, ref: `T-${t.number}`, reason: t.reason, label: reasonLabel(t), exercise: t.context?.exerciseName ?? null,
      comment: t.summary !== `${reasonLabel(t)}${t.context?.exerciseName ? ` · ${t.context.exerciseName}` : ""}` ? t.summary : null,
      state: connectState(t), stateLabel: CONNECT_STATE_LABEL[connectState(t)], assignee: t.assigneeUserId && t.status !== "pending_acceptance" ? first(who) : null,
      createdAt: t.createdAt, completedAt: t.completedAt, dueAt: t.status === "follow_up" ? t.dueAt : null,
      canCancel: connectNext(t, "member_cancel", userId).ok, feedback: t.feedback, canFeedback: t.status === "done" && !t.feedback,
      unseen: (t.status === "done" || t.status === "cancelled") && !t.seenByMemberAt,
    })),
  };
}

export async function memberDetail(userId: string, taskId: string) {
  const { t } = await memberTask(userId, taskId);
  const ev = await eventsOf([t.id]);
  if ((t.status === "done" || t.status === "cancelled") && !t.seenByMemberAt) await db.update(gymTask).set({ seenByMemberAt: new Date() }).where(eq(gymTask.id, t.id));
  return {
    id: t.id, ref: `T-${t.number}`, label: reasonLabel(t), exercise: t.context?.exerciseName ?? null, state: connectState(t), stateLabel: CONNECT_STATE_LABEL[connectState(t)],
    timeline: memberTimeline(ev, userId), canCancel: connectNext(t, "member_cancel", userId).ok, canComment: CONNECT_ACTIVE.includes(t.status as ConnectStatus),
    feedback: t.feedback, canFeedback: t.status === "done" && !t.feedback,
  };
}

export async function memberCancel(userId: string, taskId: string) {
  const { t: t0 } = await memberTask(userId, taskId);
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(gymTask).where(eq(gymTask.id, t0.id)).for("update");
    if (t.status === "cancelled") return { ok: true, already: true };
    const n = connectNext(t, "member_cancel", userId);
    if (!n.ok) throw new AccessError("invalid", t.status === "done" ? "Ese pedido ya está resuelto." : "Alguien del equipo ya lo está atendiendo: no se puede cancelar.", 409);
    await tx.update(gymTask).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: userId }).where(eq(gymTask.id, t.id));
    await addEvent(tx, t, { actor: userId, kind: "cancelled", from: t.status, to: "cancelled" });
    return { ok: true, already: false };
  });
}

export async function memberComment(userId: string, taskId: string, text: string) {
  const { t } = await memberTask(userId, taskId);
  const note = clip(text, CONNECT_COMMENT_MAX);
  if (note.length < 2) throw new AccessError("invalid", "Escribí el comentario.");
  if (!CONNECT_ACTIVE.includes(t.status as ConnectStatus)) throw new AccessError("closed", "Ese pedido ya está cerrado. Si necesitás algo más, hacé un pedido nuevo.", 409);
  await addEvent(db, t, { actor: userId, kind: "member_comment", note });
  return { ok: true };
}

/** «¿Te sirvió la ayuda?»: optativa, una vez, sólo con el pedido resuelto. */
export async function memberFeedback(userId: string, taskId: string, helpful: boolean) {
  const { t } = await memberTask(userId, taskId);
  if (t.status !== "done") throw new AccessError("invalid", "Podés opinar cuando el pedido esté resuelto.", 409);
  const [u] = await db.update(gymTask).set({ feedback: helpful ? "yes" : "no", feedbackAt: new Date() }).where(and(eq(gymTask.id, t.id), isNull(gymTask.feedback))).returning({ id: gymTask.id });
  if (u) await addEvent(db, t, { actor: userId, kind: "feedback", note: helpful ? "yes" : "no" });
  return { ok: true, already: !u };
}

// ── Equipo de sala ──────────────────────────────────────────────────────────
async function staffCtx(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  requireConnect(ctx);
  need(ctx, "floor.work");
  return ctx;
}

/** Estado del equipo en la sede: en turno o no, y la disponibilidad que cada uno declaró. Nunca ubicación. */
async function teamNow(orgId: string, locationId: string) {
  const staff = await floorStaff(orgId, locationId);
  const shifts = staff.length ? await db.select().from(shiftLog).where(and(inArray(shiftLog.userId, staff.map((s) => s.userId)), isNull(shiftLog.endedAt))) : [];
  return staff.map((s) => {
    const sh = shifts.find((x) => x.userId === s.userId && x.locationId === locationId);
    return { id: s.userId, name: s.name, role: s.role, onShift: !!sh, availability: sh ? (sh.availability as ConnectAvailability) : null };
  });
}

const cardCols = {
  id: gymTask.id, number: gymTask.number, gymMemberId: gymTask.gymMemberId, category: gymTask.category, priority: gymTask.priority, status: gymTask.status,
  source: gymTask.source, summary: gymTask.summary, reason: gymTask.reason, context: gymTask.context, assigneeUserId: gymTask.assigneeUserId,
  createdAt: gymTask.createdAt, dueAt: gymTask.dueAt, takenAt: gymTask.takenAt, startedAt: gymTask.startedAt, completedAt: gymTask.completedAt, completedBy: gymTask.completedBy,
  locationId: gymTask.locationId,
};
type Card = { [K in keyof typeof cardCols]: Task[K] };

async function decorateCards(rows: Card[], now = new Date()) {
  const uids = [...new Set(rows.flatMap((r) => [r.assigneeUserId, r.completedBy]).filter(Boolean) as string[])];
  const mids = [...new Set(rows.map((r) => r.gymMemberId).filter(Boolean) as string[])];
  const names = uids.length ? new Map((await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, uids))).map((u) => [u.id, u.name])) : new Map<string, string>();
  const members = mids.length ? new Map((await db.select({ id: gymMember.id, name: user.name }).from(gymMember).innerJoin(user, eq(user.id, gymMember.userId)).where(inArray(gymMember.id, mids))).map((m) => [m.id, m.name])) : new Map<string, string>();
  const last = rows.length ? await db.selectDistinctOn([gymTaskEvent.taskId], { taskId: gymTaskEvent.taskId, kind: gymTaskEvent.kind, note: gymTaskEvent.note, at: gymTaskEvent.createdAt, actor: user.name })
    .from(gymTaskEvent).leftJoin(user, eq(user.id, gymTaskEvent.actorUserId))
    .where(and(inArray(gymTaskEvent.taskId, rows.map((r) => r.id)), inArray(gymTaskEvent.kind, ["note", "follow_up", "transferred", "member_comment"])))
    .orderBy(gymTaskEvent.taskId, desc(gymTaskEvent.createdAt)) : [];
  return rows.map((r) => {
    const st = connectState(r);
    const l = last.find((x) => x.taskId === r.id);
    return {
      id: r.id, ref: `T-${r.number}`, member: r.gymMemberId ? members.get(r.gymMemberId) ?? null : null, gymMemberId: r.gymMemberId,
      label: reasonLabel(r), reason: r.reason, category: r.category, priority: r.priority, source: r.source, summary: r.summary, exercise: r.context?.exerciseName ?? null,
      fromSession: !!r.context?.fromSession, state: st, stateLabel: CONNECT_STATE_LABEL[st], status: r.status,
      assignee: r.assigneeUserId ? { id: r.assigneeUserId, name: names.get(r.assigneeUserId) ?? "" } : null, completedBy: r.completedBy ? names.get(r.completedBy) ?? null : null,
      createdAt: r.createdAt, takenAt: r.takenAt, startedAt: r.startedAt, completedAt: r.completedAt, dueAt: r.dueAt,
      ageMin: Math.max(0, Math.round((now.getTime() - r.createdAt.getTime()) / 60_000)), overdue: r.status === "follow_up" && !!r.dueAt && r.dueAt < now,
      lastNote: l ? { kind: l.kind, text: l.note, by: l.actor, at: l.at } : null,
    };
  });
}

/** Bandeja del profesor: lo suyo, lo recibido, la cola libre, los seguimientos y lo que atienden otros, ya ordenado. */
export async function staffBoard(actorId: string, orgId: string, locationId?: string | null, now = new Date()) {
  const ctx = await staffCtx(actorId, orgId);
  const { loc, allowed } = await scopedLocation(ctx, locationId);
  const active = connectSort(await db.select(cardCols).from(gymTask).where(and(eq(gymTask.locationId, loc.id), inArray(gymTask.status, CONNECT_ACTIVE))).limit(300));
  const resolved = await db.select(cardCols).from(gymTask).where(and(eq(gymTask.locationId, loc.id), eq(gymTask.status, "done"), gte(gymTask.completedAt, addDays(now, -7))))
    .orderBy(desc(gymTask.completedAt)).limit(50);
  const cancelled = await db.select(cardCols).from(gymTask).where(and(eq(gymTask.locationId, loc.id), eq(gymTask.status, "cancelled"), gte(gymTask.cancelledAt, addDays(now, -7))))
    .orderBy(desc(gymTask.cancelledAt)).limit(20);
  const cards = await decorateCards([...active, ...resolved, ...cancelled], now);
  const by = (f: (c: (typeof cards)[number]) => boolean) => cards.filter(f);
  const mine = by((c) => c.assignee?.id === actorId && ["asignada", "en_atencion", "seguimiento"].includes(c.state));
  const incoming = by((c) => c.state === "transferida" && c.assignee?.id === actorId);
  const pending = by((c) => c.state === "pendiente");
  const followUps = by((c) => c.state === "seguimiento" && c.assignee?.id !== actorId);
  const others = by((c) => ["asignada", "en_atencion", "transferida"].includes(c.state) && c.assignee?.id !== actorId);
  const closed = by((c) => c.state === "resuelta" || c.state === "cancelada");
  const sh = await activeShift(actorId);
  const dueSoon = active.filter((t) => t.status === "follow_up" && t.dueAt && t.dueAt.getTime() - now.getTime() < CONNECT_DUE_SOON_HOURS * 3_600_000).length;
  return {
    location: { id: loc.id, name: loc.name }, locations: allowed.map((l) => ({ id: l.id, name: l.name })),
    me: { onShift: !!sh && sh.locationId === loc.id, availability: sh && sh.locationId === loc.id ? sh.availability : null, canCancel: gymCan(ctx.roles, "task.reassign") },
    team: await teamNow(orgId, loc.id),
    counts: { pending: pending.length, mine: mine.length, inProgress: mine.filter((c) => c.state === "en_atencion").length, incoming: incoming.length, followUps: active.filter((t) => t.status === "follow_up").length, dueSoon, resolvedWeek: closed.filter((c) => c.state === "resuelta").length },
    incoming, mine, pending, followUps, others, closed,
  };
}

/** Detalle con contexto autorizado: ejercicio, series de la sesión del programa del gym, historial institucional y pedidos previos. */
export async function staffTask(actorId: string, orgId: string, taskId: string, now = new Date()) {
  const ctx = await staffCtx(actorId, orgId);
  const [t] = await db.select().from(gymTask).where(and(eq(gymTask.id, taskId), eq(gymTask.orgId, orgId)));
  if (!t || !inScope(ctx, t.locationId)) throw NOT_FOUND();
  const [card] = await decorateCards([t], now);
  const ev = await eventsOf([t.id]);
  const c = t.context;
  let sets: { setIndex: number; weightKg: string | null; reps: number | null; rir: number | null; feel: string | null }[] = [];
  let recent: { at: Date; weightKg: string | null; reps: number | null }[] = [];
  let privateSession = false;
  if (c?.sessionId && c.programExerciseId) {
    sets = await db.select({ setIndex: setLog.setIndex, weightKg: setLog.weightKg, reps: setLog.reps, rir: setLog.rir, feel: setLog.feel }).from(setLog)
      .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
      .where(and(eq(setLog.sessionId, c.sessionId), eq(setLog.programExerciseId, c.programExerciseId), eq(workoutSession.gymMemberId, t.gymMemberId ?? "-"))).orderBy(asc(setLog.setIndex));
  } else if (c?.exerciseId) privateSession = true;
  if (c?.exerciseId && t.gymMemberId) {
    // Últimas series de ese ejercicio en sesiones del programa del gym (nunca las del coach privado).
    recent = await db.select({ at: setLog.completedAt, weightKg: setLog.weightKg, reps: setLog.reps }).from(setLog).innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
      .where(and(eq(workoutSession.gymMemberId, t.gymMemberId), eq(setLog.exerciseId, c.exerciseId))).orderBy(desc(setLog.completedAt)).limit(6);
  }
  const prog = t.gymMemberId ? await db.select({ name: programVersion.name, n: programVersion.number }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId)).innerJoin(programVersion, eq(programVersion.id, program.currentVersionId))
    .where(and(eq(programAssignment.gymMemberId, t.gymMemberId), eq(programAssignment.status, "active"))) : [];
  const prev = t.gymMemberId ? await decorateCards(await db.select(cardCols).from(gymTask).where(and(eq(gymTask.gymMemberId, t.gymMemberId), ne(gymTask.id, t.id))).orderBy(desc(gymTask.createdAt)).limit(5), now) : [];
  const staff = (await teamNow(orgId, t.locationId)).filter((s) => s.id !== actorId);
  const can = (a: ConnectAction) => connectNext(t, a, actorId).ok;
  return {
    ...card,
    context: c ? { exercise: c.exerciseName ?? null, program: c.programName ?? null, setIndex: c.setIndex ?? null, fromSession: !!c.fromSession, sets, recent, privateSession } : null,
    program: prog[0] ? `${prog[0].name} · v${prog[0].n}` : null,
    events: ev.map(({ e, actor, to }) => ({ id: e.id, kind: e.kind, at: e.createdAt, by: actor, to, note: e.note, memberNote: e.memberNote, dueAt: e.dueAt, from: e.fromStatus, toStatus: e.toStatus })),
    previous: prev.map((p) => ({ id: p.id, ref: p.ref, label: p.label, stateLabel: p.stateLabel, createdAt: p.createdAt, completedBy: p.completedBy })),
    feedback: t.feedback,
    targets: staff.map((s) => ({ id: s.id, name: s.name, onShift: s.onShift, availability: s.availability })),
    actions: {
      take: can("take"), start: can("start") && t.status !== "in_progress", note: can("note"), followUp: can("follow_up"), transfer: can("transfer"),
      accept: can("accept"), decline: can("decline"), resolve: can("resolve"), cancel: gymCan(ctx.roles, "task.reassign") && CONNECT_ACTIVE.includes(t.status as ConnectStatus),
    },
  };
}

type ActInput = { note?: string | null; memberNote?: string | null; toUserId?: string | null; dueAt?: string | null; done?: string | null; pending?: string | null; next?: string | null; forShift?: boolean };
const MSG: Record<string, string> = {
  closed: "Esta solicitud ya está cerrada.", not_mine: "Tomá la solicitud antes de hacer eso.", invalid: "Esa acción no corresponde al estado actual de la solicitud.",
};

/** Una acción del profesor sobre una solicitud, en transacción con bloqueo de fila (dos personas nunca la toman a la vez). */
export async function staffAct(actorId: string, orgId: string, taskId: string, action: Exclude<ConnectAction, "member_cancel">, p: ActInput = {}, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  requireConnect(ctx);
  if (action === "cancel") need(ctx, "task.reassign"); else need(ctx, "floor.work");
  const res = await db.transaction(async (tx) => {
    const t = await lockTask(tx, ctx, taskId);
    const ref = `T-${t.number}`;
    if (action === "take" && t.assigneeUserId === actorId) return { ref, already: true, t, to: t.status };
    const n = connectNext(t, action, actorId);
    if (!n.ok) {
      if (n.code === "taken") {
        const [who] = await tx.select({ name: user.name }).from(user).where(eq(user.id, t.assigneeUserId!));
        throw new AccessError("taken", `${who?.name ?? "Otra persona"} ya tomó ${ref}.`, 409);
      }
      throw new AccessError(n.code, MSG[n.code], 409);
    }
    // Aceptar o rechazar un traspaso no exige turno (igual que en el traspaso de cierre de turno); cancelar es de gestión.
    const offShift = ["cancel", "accept", "decline"].includes(action) ? false : await gate(ctx, t.locationId, "atender solicitudes", tx);
    const note = clip(p.note, CONNECT_NOTE_MAX), memberNote = clip(p.memberNote, CONNECT_NOTE_MAX);
    const base = { actor: actorId, from: t.status, to: n.status, at: now };
    switch (action) {
      case "take":
        await tx.update(gymTask).set({ assigneeUserId: actorId, takenAt: t.takenAt ?? now, takenBy: t.takenBy ?? actorId }).where(eq(gymTask.id, t.id));
        await addEvent(tx, t, { ...base, kind: "taken" });
        break;
      case "start":
        await tx.update(gymTask).set({ status: "in_progress", startedAt: t.startedAt ?? now }).where(eq(gymTask.id, t.id));
        await addEvent(tx, t, { ...base, kind: "started" });
        break;
      case "note":
        if (note.length < 3) throw new AccessError("invalid", "Escribí qué hiciste.");
        await addEvent(tx, t, { ...base, kind: "note", note });
        break;
      case "follow_up": {
        const text = [p.done && `Hecho: ${clip(p.done, 200)}`, p.pending && `Pendiente: ${clip(p.pending, 200)}`, p.next && `Próximo paso: ${clip(p.next, 200)}`, note].filter(Boolean).join(" · ");
        if (text.length < 3) throw new AccessError("invalid", "Contá qué se hizo y qué queda pendiente.");
        const due = p.dueAt ? new Date(p.dueAt) : addDays(now, CONNECT_FOLLOWUP_DEFAULT_DAYS);
        if (Number.isNaN(due.getTime()) || due.getTime() < now.getTime() - 86_400_000) throw new AccessError("invalid", "La fecha del seguimiento no es válida.");
        const keep = !p.forShift;
        await tx.update(gymTask).set({ status: "follow_up", dueAt: due, assigneeUserId: keep ? actorId : null }).where(eq(gymTask.id, t.id));
        await addEvent(tx, t, { ...base, kind: "follow_up", note: text, dueAt: due, toUserId: keep ? actorId : null });
        break;
      }
      case "transfer": {
        if (!p.toUserId || p.toUserId === actorId || !(await floorStaff(orgId, t.locationId)).some((s) => s.userId === p.toUserId)) throw new AccessError("invalid", "Elegí a quién transferir: tiene que trabajar en la sala de esta sede.");
        const text = [p.done && `Hecho: ${clip(p.done, 200)}`, p.pending && `Pendiente: ${clip(p.pending, 200)}`, p.next && `Próximo paso: ${clip(p.next, 200)}`, note].filter(Boolean).join(" · ");
        if (text.length < 3) throw new AccessError("invalid", "Dejá qué se hizo y qué queda para quien sigue.");
        const sh = await activeShift(actorId, tx);
        const [h] = await tx.insert(gymHandoff).values({ orgId, locationId: t.locationId, fromUserId: actorId, toUserId: p.toUserId, shiftLogId: sh?.locationId === t.locationId ? sh.id : null }).returning();
        await tx.insert(gymHandoffItem).values({ handoffId: h.id, taskId: t.id, summary: text });
        await tx.update(gymTask).set({ status: "pending_acceptance", assigneeUserId: p.toUserId }).where(eq(gymTask.id, t.id));
        await addEvent(tx, t, { ...base, kind: "transferred", toUserId: p.toUserId, note: text });
        break;
      }
      case "accept":
      case "decline":
        await tx.update(gymTask).set({ status: "open", assigneeUserId: action === "accept" ? actorId : null, ...(action === "accept" ? { takenAt: t.takenAt ?? now, takenBy: t.takenBy ?? actorId } : {}) }).where(eq(gymTask.id, t.id));
        if (action === "accept") await tx.update(gymHandoffItem).set({ acceptedAt: now, acceptedBy: actorId }).where(and(eq(gymHandoffItem.taskId, t.id), isNull(gymHandoffItem.acceptedAt)));
        await addEvent(tx, t, { ...base, kind: action === "accept" ? "accepted" : "declined", note: note || null });
        break;
      case "resolve": {
        if (note.length < 3) throw new AccessError("invalid", "Registrá qué hiciste antes de resolver.");
        await tx.update(gymTask).set({ status: "done", completedAt: now, completedBy: actorId, completedOffShift: offShift }).where(eq(gymTask.id, t.id));
        await addEvent(tx, t, { ...base, kind: "resolved", note, memberNote: memberNote || null });
        const inv = await maybeInvite(tx, t, actorId, now);
        await audit(tx, { actorUserId: actorId, orgId, action: "task.completed", resourceType: "gym_task", resourceId: t.id, meta: { offShift, connect: true } });
        return { ref, already: false, t, to: n.status, invite: inv.invite };
      }
      case "cancel":
        if (note.length < 3) throw new AccessError("invalid", "Contá por qué se cancela.");
        await tx.update(gymTask).set({ status: "cancelled", cancelledAt: now, cancelledBy: actorId }).where(eq(gymTask.id, t.id));
        await addEvent(tx, t, { ...base, kind: "cancelled", note, memberNote: memberNote || null });
        break;
    }
    await audit(tx, { actorUserId: actorId, orgId, action: `connect.${action}`, resourceType: "gym_task", resourceId: t.id, meta: { from: t.status, to: n.status, offShift } });
    return { ref, already: false, t, to: n.status, invite: null as string | null };
  });
  // Avisos después de confirmar: el traspaso a quien lo recibe; el cierre al socio. Nunca bloquean la acción.
  const t = res.t;
  if (action === "transfer" && p.toUserId) {
    await enqueue([p.toUserId], { kind: "assist_transfer", dedupe: `assistx:${t.id}:${Date.now()}`, title: "Te transfirieron un seguimiento", body: `${res.ref} · ${reasonLabel(t)}`, url: `/gym/${orgId}?s=queue&sel=${t.id}` });
  }
  if ((action === "resolve" || action === "cancel") && t.source === "app") {
    const [m] = t.gymMemberId ? await db.select({ userId: gymMember.userId }).from(gymMember).where(eq(gymMember.id, t.gymMemberId)) : [];
    if (m) await enqueue([m.userId], { kind: "assist_update", dedupe: `assistdone:${t.id}`, title: action === "resolve" ? "Tu pedido fue resuelto" : "Tu pedido se cerró", body: reasonLabel(t), url: `/app?pedido=${t.id}` });
  }
  return { ref: res.ref, status: res.to, already: res.already, invite: "invite" in res ? res.invite : null };
}

/** Disponibilidad declarada durante el turno. Fuera de turno no hay nada que declarar. */
export async function setAvailability(actorId: string, orgId: string, availability: string) {
  const ctx = await staffCtx(actorId, orgId);
  if (!(availability in CONNECT_AVAILABILITY)) throw new AccessError("invalid", "Elegí disponible u ocupado.");
  const sh = await activeShift(actorId);
  if (!sh || sh.orgId !== orgId || !inScope(ctx, sh.locationId)) throw new AccessError("no_shift", "Iniciá tu turno para indicar tu disponibilidad.", 409);
  await db.update(shiftLog).set({ availability: availability as ConnectAvailability }).where(eq(shiftLog.id, sh.id));
  return { availability };
}

// ── Gestión: indicadores agregados ──────────────────────────────────────────
/** Seguimiento de sala para dueño, gerencia y coordinación: sólo números y estados, nunca el texto de los pedidos ni notas. */
export async function connectReport(actorId: string, orgId: string, locationId: string | null, days = 30, now = new Date()) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "team.read");
  const enabled = connectOn(ctx.org);
  const locs = await scopedLocations(ctx, locationId);
  const ids = locs.map((l) => l.id);
  const span = [7, 30, 90].includes(days) ? days : 30;
  const since = addDays(now, -span);
  if (!ids.length) return { enabled, days: span, metrics: connectMetrics([]), weekly: [], byLocation: [], team: [], openNow: 0, oldestPendingMin: null };
  const rows = await db.select({ id: gymTask.id, status: gymTask.status, createdAt: gymTask.createdAt, takenAt: gymTask.takenAt, completedAt: gymTask.completedAt, gymMemberId: gymTask.gymMemberId, feedback: gymTask.feedback, locationId: gymTask.locationId })
    .from(gymTask).where(and(eq(gymTask.orgId, orgId), inArray(gymTask.locationId, ids), eq(gymTask.source, "app"), gte(gymTask.createdAt, since))).limit(5000);
  const ev = rows.length ? await db.select({ taskId: gymTaskEvent.taskId, kind: gymTaskEvent.kind, n: sql<number>`count(*)::int` }).from(gymTaskEvent)
    .where(and(inArray(gymTaskEvent.taskId, rows.map((r) => r.id)), inArray(gymTaskEvent.kind, ["transferred", "follow_up"]))).groupBy(gymTaskEvent.taskId, gymTaskEvent.kind) : [];
  const cnt = (id: string, k: string) => ev.find((e) => e.taskId === id && e.kind === k)?.n ?? 0;
  const mrows = rows.map((r) => ({ ...r, transfers: cnt(r.id, "transferred"), followUps: cnt(r.id, "follow_up") }));
  // Evolución semanal: 8 semanas, recibidos y resueltos (sobre los pedidos de la app).
  const wsince = addDays(now, -56);
  const wk = await db.select({ createdAt: gymTask.createdAt, status: gymTask.status }).from(gymTask)
    .where(and(eq(gymTask.orgId, orgId), inArray(gymTask.locationId, ids), eq(gymTask.source, "app"), gte(gymTask.createdAt, wsince))).limit(10000);
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const a = addDays(now, -56 + i * 7), b = addDays(now, -49 + i * 7);
    const inW = wk.filter((x) => x.createdAt >= a && x.createdAt < b);
    return { label: localDate(a).slice(5).split("-").reverse().join("/"), received: inW.length, resolved: inW.filter((x) => x.status === "done").length };
  });
  // Uso del equipo: acciones registradas por persona en el período. Orden alfabético: no es un ranking.
  const acts = await db.select({ actor: gymTaskEvent.actorUserId, kind: gymTaskEvent.kind, n: sql<number>`count(*)::int` }).from(gymTaskEvent)
    .innerJoin(gymTask, eq(gymTask.id, gymTaskEvent.taskId))
    .where(and(eq(gymTaskEvent.orgId, orgId), inArray(gymTask.locationId, ids), gte(gymTaskEvent.createdAt, since), inArray(gymTaskEvent.kind, ["taken", "started", "note", "follow_up", "transferred", "accepted", "resolved"])))
    .groupBy(gymTaskEvent.actorUserId, gymTaskEvent.kind);
  const actorIds = [...new Set(acts.map((a) => a.actor).filter(Boolean) as string[])];
  const names = actorIds.length ? new Map((await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, actorIds))).map((u) => [u.id, u.name])) : new Map<string, string>();
  const team = actorIds.map((id) => {
    const k = (x: string) => acts.filter((a) => a.actor === id && a.kind === x).reduce((s, a) => s + a.n, 0);
    return { name: names.get(id) ?? "Ex integrante", taken: k("taken") + k("accepted"), notes: k("note"), followUps: k("follow_up"), transfers: k("transferred"), resolved: k("resolved") };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const live = await db.select({ status: gymTask.status, assignee: gymTask.assigneeUserId, createdAt: gymTask.createdAt, locationId: gymTask.locationId }).from(gymTask)
    .where(and(eq(gymTask.orgId, orgId), inArray(gymTask.locationId, ids), eq(gymTask.source, "app"), inArray(gymTask.status, CONNECT_ACTIVE)));
  const pendingNow = live.filter((x) => x.status === "open" && !x.assignee);
  const oldest = pendingNow.length ? Math.round((now.getTime() - Math.min(...pendingNow.map((x) => x.createdAt.getTime()))) / 60_000) : null;
  const byLocation = locs.length > 1 ? locs.map((l) => ({ id: l.id, name: l.name, ...connectMetrics(mrows.filter((r) => r.locationId === l.id)), openNow: live.filter((x) => x.locationId === l.id).length })) : [];
  return {
    enabled, days: span, metrics: connectMetrics(mrows), weekly, byLocation, team, openNow: live.length,
    stateNow: { pendiente: pendingNow.length, enCurso: live.filter((x) => x.status === "in_progress" || (x.status === "open" && x.assignee)).length, seguimiento: live.filter((x) => x.status === "follow_up").length, transferida: live.filter((x) => x.status === "pending_acceptance").length },
    oldestPendingMin: oldest,
  };
}

// ── Reglas proactivas (cron) ────────────────────────────────────────────────
/**
 * Avisos internos por reglas fijas, deduplicados (nunca se repite el mismo aviso):
 * 1) pedido sin tomar hace CONNECT_WAIT_ALERT_MIN → a quienes están en turno en la sede, una vez;
 * 2) seguimiento que vence en CONNECT_DUE_SOON_HOURS o vencido → a su responsable (o al turno si quedó libre), uno por día.
 * Respeta la pausa de avisos de cada persona (processOutbox los marca «skipped»). Sin modelos de IA.
 */
export async function connectSweep(now = new Date()) {
  const orgs = featureOn("connect") ? await db.select({ id: organization.id }).from(organization).where(and(eq(organization.connectEnabled, true), eq(organization.kind, "gym"))) : [];
  if (!orgs.length) return { waiting: 0, due: 0 };
  const orgIds = orgs.map((o) => o.id);
  const waiting = await db.select({ id: gymTask.id, orgId: gymTask.orgId, locationId: gymTask.locationId, number: gymTask.number, reason: gymTask.reason, category: gymTask.category, loc: gymLocation.name })
    .from(gymTask).innerJoin(gymLocation, eq(gymLocation.id, gymTask.locationId))
    .where(and(inArray(gymTask.orgId, orgIds), eq(gymTask.status, "open"), isNull(gymTask.assigneeUserId), sql`${gymTask.createdAt} < ${new Date(now.getTime() - CONNECT_WAIT_ALERT_MIN * 60_000).toISOString()}`, gte(gymTask.createdAt, addDays(now, -2))))
    .limit(200);
  let w = 0, d = 0;
  for (const t of waiting) {
    const to = await floorOnShift(t.orgId, t.locationId);
    w += await enqueue(to, { kind: "assist_wait", dedupe: `assistwait:${t.id}`, title: `Pedido esperando · ${t.loc}`, body: `T-${t.number} · ${reasonLabel(t)} · sin tomar hace más de ${CONNECT_WAIT_ALERT_MIN} min`, url: `/gym/${t.orgId}?s=queue&sel=${t.id}` });
  }
  const due = await db.select({ id: gymTask.id, orgId: gymTask.orgId, locationId: gymTask.locationId, number: gymTask.number, reason: gymTask.reason, category: gymTask.category, assignee: gymTask.assigneeUserId, dueAt: gymTask.dueAt })
    .from(gymTask).where(and(inArray(gymTask.orgId, orgIds), eq(gymTask.status, "follow_up"), sql`${gymTask.dueAt} < ${new Date(now.getTime() + CONNECT_DUE_SOON_HOURS * 3_600_000).toISOString()}`)).limit(300);
  const today = localDate(now);
  for (const t of due) {
    const to = t.assignee ? [t.assignee] : await floorOnShift(t.orgId, t.locationId);
    const late = !!t.dueAt && t.dueAt < now;
    d += await enqueue(to, { kind: "assist_due", dedupe: `assistdue:${t.id}:${today}`, title: late ? "Seguimiento vencido" : "Seguimiento por vencer", body: `T-${t.number} · ${reasonLabel(t)}`, url: `/gym/${t.orgId}?s=queue&sel=${t.id}` });
  }
  return { waiting: w, due: d };
}

/** Avisos de Connect para el centro de avisos del staff: estado actual de cada pedido, sin texto del socio. */
export async function connectNoticeState(taskIds: string[]) {
  if (!taskIds.length) return new Map<string, { orgId: string; locationId: string; ref: string; label: string; state: string; stateLabel: string; loc: string }>();
  const rows = await db.select({ t: gymTask, loc: gymLocation.name }).from(gymTask).innerJoin(gymLocation, eq(gymLocation.id, gymTask.locationId)).where(inArray(gymTask.id, taskIds));
  return new Map(rows.map(({ t, loc }) => [t.id, { orgId: t.orgId, locationId: t.locationId, ref: `T-${t.number}`, label: reasonLabel(t), state: connectState(t), stateLabel: CONNECT_STATE_LABEL[connectState(t)], loc }]));
}

/** Para REPI Admin: activar o desactivar el piloto en un gimnasio. No borra ni cambia pedidos, rutinas ni cuentas. */
export async function setConnectEnabled(tx: Tx | typeof db, orgId: string, on: boolean) {
  const [o] = await tx.update(organization).set({ connectEnabled: on }).where(and(eq(organization.id, orgId), eq(organization.kind, "gym"))).returning({ id: organization.id });
  return !!o;
}
