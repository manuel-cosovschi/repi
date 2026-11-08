// Servicios de programación (coach) y ejecución (alumno). Toda autorización se resuelve aquí.
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  activeSeconds, applySessionAction, bestE1rm, matchProgramExercises, sharedWishes, type TrainingWishes, type ExerciseDetail, clampClientTime, cleanSetNote, decideSetWrite, isChangeReason, rankAlternatives, withApproved, type ExerciseChangeReason, defaultRepsFor, detectPR, localDate, nextDayIndex, sameDoc, validateProgramDoc, volumeKg, weekOf,
  weeklyAdherence, FEEL_ALERTS, isSetFeel, parseReps, type LoggedSet, type ProgramDoc, type SetFeel,
  applyLoad, coachSetLoads, suggestNext, type LastSet, workoutAutoClose, WORKOUT_IDLE_CLOSE_MS,
  progressionApplies, kindAt, GENERAL_PAIN_DAYS, PAIN_LOOKBACK_DAYS, type SafetySignals, exerciseKey,
  rowFlags, rowRef, sessionMetrics, exerciseComplete, type SetKind, validateDetail, mainSets, circuitIssues, MAX_PLAN_ROWS,
  acceptInterval, decideSkip, interruptInterval, newerThan, toServerMs, type IntervalState,
  loadIncrement, setTarget,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit, type Tx } from "../access/util";
import { requireGymAction } from "../gym/access-control";
import { createOwnExercise, ensureExerciseCatalog, visibleIn } from "./library";
import { todaysPick } from "../gym/floor-now";
import { importedLastSets } from "./history-import";
import { aiOn } from "../ai/openai";

const { user, organization, staffMembership, coachClient, consentGrant, invitation, exercise, program, programVersion,
  programDay, programExercise, programAssignment, workoutSession, setLog, setSkip, syncConflict, gymMember, gymLocation, userPref, sessionExerciseChange, exerciseSubstitution, studentRequest,
  painReport, injury, checkin } = schema;

const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);

// ── Autorización ────────────────────────────────────────────────────────────
export async function requireCoach(actorId: string, orgId: string, q: Tx | typeof db = db) {
  const [row] = await q.select({ org: organization }).from(staffMembership)
    .innerJoin(organization, eq(organization.id, staffMembership.orgId))
    .where(and(eq(staffMembership.userId, actorId), eq(staffMembership.orgId, orgId), eq(staffMembership.role, "coach_owner"),
      eq(staffMembership.status, "active"), eq(organization.kind, "coach")));
  if (!row) throw NOT_FOUND(); // no revela si la organización existe
  return row.org;
}

/** Relación del coach con acceso a entrenamientos (grant fijo 'training' activo). */
export async function requireClientOf(orgId: string, coachClientId: string, tx: Tx | typeof db = db) {
  const [rel] = await tx.select({ rel: coachClient, name: user.name, userId: user.id }).from(coachClient)
    .innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(coachClient.id, coachClientId), eq(coachClient.coachOrgId, orgId), ne(coachClient.status, "ended")));
  if (!rel) throw NOT_FOUND(); // una relación terminada no deja leer nada nuevo del alumno
  const [g] = await tx.select({ id: consentGrant.id }).from(consentGrant)
    .where(and(eq(consentGrant.relationId, coachClientId), eq(consentGrant.item, "training"), eq(consentGrant.status, "active")));
  if (!g) throw new AccessError("no_grant", "Este cliente todavía no aceptó compartir sus entrenamientos.", 403);
  return rel;
}

// ── Biblioteca ──────────────────────────────────────────────────────────────
export async function listLibrary(actorId: string, orgId: string) {
  await requireCoach(actorId, orgId);
  await ensureExerciseCatalog();
  return db.select({ id: exercise.id, name: exercise.name, group: exercise.muscleGroup, kind: exercise.kind, own: sql<boolean>`${exercise.orgId} is not null` })
    .from(exercise).where(visibleIn(orgId)).orderBy(asc(exercise.name));
}

/** Ejercicio propio del coach (D129): para lo que no está en el catálogo base. */
export async function coachCreateExercise(actorId: string, orgId: string, p: { name: string; group: string; kind: string }) {
  await requireCoach(actorId, orgId);
  return createOwnExercise(actorId, orgId, p);
}

// ── Programas ───────────────────────────────────────────────────────────────
type DocEx = ProgramDoc["days"][number]["exercises"][number] & { id?: string };
type Doc = { name: string; weeks: number; note: string; days: { id?: string; name: string; exercises: DocEx[] }[] };

export async function readVersion(versionId: string, tx: Tx | typeof db = db): Promise<{ version: typeof programVersion.$inferSelect; doc: Doc }> {
  const [v] = await tx.select().from(programVersion).where(eq(programVersion.id, versionId));
  if (!v) throw NOT_FOUND();
  const days = await tx.select().from(programDay).where(eq(programDay.versionId, v.id)).orderBy(asc(programDay.position));
  const exs = days.length ? await tx.select().from(programExercise).where(inArray(programExercise.dayId, days.map((d) => d.id))).orderBy(asc(programExercise.position)) : [];
  return {
    version: v,
    doc: {
      name: v.name, weeks: v.weeks, note: v.note,
      days: days.map((d) => ({
        id: d.id, name: d.name,
        exercises: exs.filter((e) => e.dayId === d.id).map((e) => ({ id: e.id, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: e.note, ...(e.detail ? { detail: e.detail as ExerciseDetail } : {}) })),
      })),
    },
  };
}
export const plain = (d: Doc): ProgramDoc => ({ name: d.name, weeks: d.weeks, note: d.note, days: d.days.map((x) => ({ name: x.name, exercises: x.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, note: e.note ?? null, ...(e.detail ? { detail: e.detail } : {}) })) })) });

export async function writeDays(tx: Tx, versionId: string, doc: ProgramDoc) {
  for (const [i, d] of doc.days.entries()) {
    const [day] = await tx.insert(programDay).values({ versionId, position: i, name: d.name }).returning();
    if (d.exercises.length) {
      await tx.insert(programExercise).values(d.exercises.map((e, j) => ({ dayId: day.id, position: j, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: e.note ?? null, detail: e.detail ?? null })));
    }
  }
}

/**
 * Edición en el lugar (versión todavía sin entrenamientos) conservando los IDs por posición. QA 29/10 (DATA-2): el
 * teléfono pudo bajar los días y ejercicios y empezar sin red; si se borraban y recreaban, ese entrenamiento offline se
 * rechazaba entero al sincronizar. Sólo lo que sobra se borra y sólo lo que falta se crea.
 */
async function rewriteDays(tx: Tx, versionId: string, doc: ProgramDoc) {
  const days = await tx.select().from(programDay).where(eq(programDay.versionId, versionId)).orderBy(asc(programDay.position));
  const extraDays = days.slice(doc.days.length).map((d) => d.id);
  if (extraDays.length) await tx.delete(programDay).where(inArray(programDay.id, extraDays));
  for (const [i, d] of doc.days.entries()) {
    const old = days[i];
    const dayId = old ? old.id : (await tx.insert(programDay).values({ versionId, position: i, name: d.name }).returning())[0].id;
    if (old) await tx.update(programDay).set({ name: d.name, position: i }).where(eq(programDay.id, old.id));
    const exs = old ? await tx.select({ id: programExercise.id }).from(programExercise).where(eq(programExercise.dayId, dayId)).orderBy(asc(programExercise.position)) : [];
    const extraExs = exs.slice(d.exercises.length).map((e) => e.id);
    if (extraExs.length) await tx.delete(programExercise).where(inArray(programExercise.id, extraExs));
    for (const [j, e] of d.exercises.entries()) {
      const row = { dayId, position: j, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: e.note ?? null, detail: e.detail ?? null };
      if (exs[j]) await tx.update(programExercise).set(row).where(eq(programExercise.id, exs[j].id));
      else await tx.insert(programExercise).values(row);
    }
  }
}

export async function newVersion(tx: Tx, programId: string, number: number, doc: ProgramDoc, actorId: string, reason: string | null = null) {
  const [v] = await tx.insert(programVersion).values({ programId, number, name: doc.name, weeks: doc.weeks, note: doc.note, createdBy: actorId, reason }).returning();
  await writeDays(tx, v.id, doc);
  await tx.update(program).set({ currentVersionId: v.id, updatedAt: new Date() }).where(eq(program.id, programId));
  return v;
}

const BLANK: ProgramDoc = { name: "Programa sin nombre", weeks: 4, note: "", days: [{ name: "Día 1", exercises: [] }] };

/**
 * Programa nuevo (en blanco o con un documento). SI2: con `imported`, viene de una importación revisada; queda como borrador sin
 * asignar y es idempotente por `opId` (un reintento o un doble toque devuelve el mismo programa).
 */
export async function createTemplate(actorId: string, orgId: string, doc: ProgramDoc = BLANK, imported?: { opId: string; source: string; file: string } | null) {
  await requireCoach(actorId, orgId);
  const v = validateProgramDoc(doc);
  if (!v.ok) throw new AccessError("invalid", v.error);
  await assertLibrary(orgId, v.doc);
  if (imported && !/^[A-Za-z0-9_-]{8,64}$/.test(imported.opId)) throw new AccessError("invalid", "Falta el identificador de la importación.");
  return db.transaction(async (tx) => {
    if (imported) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`program-import:${orgId}:${imported.opId}`}))`);
      const [prior] = await tx.select({ id: schema.auditEvent.resourceId }).from(schema.auditEvent)
        .where(and(eq(schema.auditEvent.orgId, orgId), eq(schema.auditEvent.action, "program.imported"), sql`${schema.auditEvent.meta}->>'opId' = ${imported.opId}`)).limit(1);
      if (prior?.id) return prior.id;
    }
    const [p] = await tx.insert(program).values({ orgId, kind: "template", createdBy: actorId }).returning();
    await newVersion(tx, p.id, 1, v.doc, actorId);
    await audit(tx, { actorUserId: actorId, orgId, action: "program.created", resourceType: "program", resourceId: p.id });
    if (imported) await audit(tx, { actorUserId: actorId, orgId, action: "program.imported", resourceType: "program", resourceId: p.id,
      meta: { opId: imported.opId, source: String(imported.source).slice(0, 10), file: String(imported.file).slice(0, 10), days: v.doc.days.length, exercises: v.doc.days.reduce((n, d) => n + d.exercises.length, 0) } });
    return p.id;
  });
}

export async function assertLibrary(orgId: string, doc: ProgramDoc, q: Tx | typeof db = db) {
  const ids = [...new Set(doc.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  if (!ids.length) return;
  const ok = await q.select({ id: exercise.id }).from(exercise).where(and(inArray(exercise.id, ids), visibleIn(orgId)));
  if (ok.length !== ids.length) throw new AccessError("invalid", "Hay ejercicios que no están en tu biblioteca.");
}

export async function loadProgram(orgId: string, programId: string, tx: Tx | typeof db = db) {
  const [p] = await tx.select().from(program).where(and(eq(program.id, programId), eq(program.orgId, orgId), isNull(program.archivedAt)));
  if (!p || !p.currentVersionId) throw NOT_FOUND();
  return p;
}

export async function listTemplates(actorId: string, orgId: string) {
  await requireCoach(actorId, orgId);
  const rows = await db.select({ p: program, v: programVersion }).from(program)
    .innerJoin(programVersion, eq(programVersion.id, program.currentVersionId))
    .where(and(eq(program.orgId, orgId), eq(program.kind, "template"), isNull(program.archivedAt))).orderBy(desc(program.updatedAt));
  const days = rows.length ? await db.select({ versionId: programDay.versionId, n: sql<number>`count(*)::int` }).from(programDay)
    .where(inArray(programDay.versionId, rows.map((r) => r.v.id))).groupBy(programDay.versionId) : [];
  const assigned = rows.length ? await db.select({ src: program.sourceProgramId, n: sql<number>`count(*)::int` }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId))
    .where(and(eq(programAssignment.status, "active"), inArray(program.sourceProgramId, rows.map((r) => r.p.id)))).groupBy(program.sourceProgramId) : [];
  return rows.map((r) => ({
    id: r.p.id, name: r.v.name, weeks: r.v.weeks, version: r.v.number,
    days: days.find((d) => d.versionId === r.v.id)?.n ?? 0, clients: assigned.find((a) => a.src === r.p.id)?.n ?? 0,
  }));
}

export async function getProgram(actorId: string, orgId: string, programId: string) {
  await requireCoach(actorId, orgId);
  const p = await loadProgram(orgId, programId);
  const { version, doc } = await readVersion(p.currentVersionId!);
  let forClient: string | null = null;
  if (p.kind === "client_copy" && p.coachClientId) {
    const [r] = await db.select({ name: user.name }).from(coachClient).innerJoin(user, eq(user.id, coachClient.userId)).where(eq(coachClient.id, p.coachClientId));
    forClient = r?.name ?? null;
  }
  const clients = p.kind === "template" ? await db.select({ name: user.name }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId)).innerJoin(coachClient, eq(coachClient.id, programAssignment.coachClientId))
    .innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(programAssignment.status, "active"), eq(program.sourceProgramId, p.id))) : [];
  return { id: p.id, kind: p.kind, forClient, clients: clients.map((c) => c.name), version: version.number, locked: version.locked, doc };
}

/** Guarda el documento. Si la versión vigente está congelada, crea una versión nueva (el pasado no cambia). */
export async function saveProgram(actorId: string, orgId: string, programId: string, input: ProgramDoc) {
  await requireCoach(actorId, orgId);
  const v = validateProgramDoc(input);
  if (!v.ok) throw new AccessError("invalid", v.error);
  await assertLibrary(orgId, v.doc);
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(program).where(and(eq(program.id, programId), eq(program.orgId, orgId), isNull(program.archivedAt))).for("update");
    if (!p?.currentVersionId) throw NOT_FOUND();
    const cur = await readVersion(p.currentVersionId, tx);
    return writeProgramDoc(tx, { actorId, orgId, programId: p.id, cur, doc: v.doc });
  });
}

/**
 * Escribe un documento ya validado sobre la versión vigente (`cur`, leída con el programa bloqueado). Si la versión está
 * congelada (asignada o usada en una sesión), crea una versión nueva: el pasado y un entrenamiento abierto no cambian. D192:
 * es el mismo camino para el autoguardado del constructor y para pegar un día (no hay una segunda forma de guardar).
 */
export async function writeProgramDoc(tx: Tx, p: { actorId: string; orgId: string; programId: string; cur: Awaited<ReturnType<typeof readVersion>>; doc: ProgramDoc }) {
  const { cur, doc } = p;
  // D183: lo guardado se normaliza igual que lo nuevo (identidad y bloques de planes anteriores): sin cambios reales, sin versión nueva.
  const before = validateProgramDoc(plain(cur.doc));
  if (sameDoc(before.ok ? before.doc : plain(cur.doc), doc)) return { version: cur.version.number, created: false };
  if (cur.version.locked) {
    const nv = await newVersion(tx, p.programId, cur.version.number + 1, doc, p.actorId);
    await audit(tx, { actorUserId: p.actorId, orgId: p.orgId, action: "program.versioned", resourceType: "program", resourceId: p.programId, meta: { version: nv.number } });
    return { version: nv.number, created: true };
  }
  await tx.update(programVersion).set({ name: doc.name, weeks: doc.weeks, note: doc.note }).where(eq(programVersion.id, cur.version.id));
  await rewriteDays(tx, cur.version.id, doc);
  await tx.update(program).set({ updatedAt: new Date() }).where(eq(program.id, p.programId));
  return { version: cur.version.number, created: false };
}

export async function duplicateProgram(actorId: string, orgId: string, programId: string) {
  await requireCoach(actorId, orgId);
  const p = await loadProgram(orgId, programId);
  const { doc } = await readVersion(p.currentVersionId!);
  return createTemplate(actorId, orgId, { ...plain(doc), name: `${doc.name} (copia)`.slice(0, 120) });
}

/**
 * Eliminar un programa (D175): sale de la lista del coach. Una plantilla no le cambia nada a quien ya la tiene (cada cliente
 * tiene su copia). El programa de un cliente, además, deja de estar asignado: el cliente queda sin programa hasta que le
 * asignen otro. El historial (versiones, entrenamientos) no se borra.
 */
export async function archiveProgram(actorId: string, orgId: string, programId: string) {
  await requireCoach(actorId, orgId);
  const p = await loadProgram(orgId, programId);
  return db.transaction(async (tx) => {
    await tx.update(program).set({ archivedAt: new Date() }).where(eq(program.id, programId));
    const ended = p.kind === "client_copy" ? await tx.update(programAssignment).set({ status: "ended", endedAt: new Date() })
      .where(and(eq(programAssignment.programId, programId), eq(programAssignment.status, "active"))).returning() : [];
    await audit(tx, { actorUserId: actorId, orgId, action: "program.archived", resourceType: "program", resourceId: programId, meta: { kind: p.kind, unassigned: ended.length } });
    return { unassigned: ended.length };
  });
}

/**
 * Asignar: cada cliente recibe su propia copia (versión 1 = snapshot de la versión vigente de la plantilla).
 * La versión de origen queda congelada; la asignación activa anterior se cierra sin borrarse.
 */
export async function assignProgram(actorId: string, orgId: string, programId: string, p: { coachClientIds: string[]; startsOn: string }) {
  await requireCoach(actorId, orgId);
  const ids = [...new Set(p.coachClientIds)];
  if (!ids.length) throw new AccessError("invalid", "Elegí al menos un cliente.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startsOn) || p.startsOn < localDate(new Date())) throw new AccessError("invalid", "La fecha de inicio no puede ser anterior a hoy.");
  const src = await loadProgram(orgId, programId);
  const { version, doc } = await readVersion(src.currentVersionId!);
  if (!doc.days.some((d) => d.exercises.length)) throw new AccessError("invalid", "Agregá ejercicios antes de asignar.");
  return db.transaction(async (tx) => {
    const names: string[] = [];
    await tx.update(programVersion).set({ locked: true }).where(eq(programVersion.id, version.id));
    for (const relId of ids) {
      const rel = await requireClientOf(orgId, relId, tx);
      if (rel.rel.status !== "active") throw new AccessError("invalid", `${rel.name} no está activo.`);
      const [copy] = await tx.insert(program).values({ orgId, kind: "client_copy", coachClientId: relId, sourceProgramId: src.kind === "template" ? src.id : src.sourceProgramId, sourceVersionId: version.id, createdBy: actorId }).returning();
      await newVersion(tx, copy.id, 1, plain(doc), actorId);
      await tx.update(programAssignment).set({ status: "ended", endedAt: new Date() }).where(and(eq(programAssignment.coachClientId, relId), eq(programAssignment.status, "active")));
      // Hora de la app (no la de la transacción): posterior a la de la copia, así una edición se distingue de la asignación (F-CL-14).
      const [a] = await tx.insert(programAssignment).values({ coachClientId: relId, programId: copy.id, startsOn: p.startsOn, assignedBy: actorId, assignedAt: new Date() }).returning();
      await audit(tx, { actorUserId: actorId, orgId, action: "program.assigned", resourceType: "program_assignment", resourceId: a.id, meta: { source: src.id, version: version.number } });
      // Asignar responde el «Pedir mi programa» abierto, como completar la tarea en el gym (F-17).
      await tx.update(studentRequest).set({ status: "done", resolvedBy: actorId, resolvedAt: new Date() })
        .where(and(eq(studentRequest.coachClientId, relId), eq(studentRequest.kind, "programa"), eq(studentRequest.status, "open")));
      names.push(rel.name);
    }
    return { names };
  });
}

// ── Panel y ficha del coach ─────────────────────────────────────────────────
async function weekCompletedByRelation(relIds: string[], now: Date) {
  if (!relIds.length) return new Map<string, number>();
  const week = weekOf(now);
  const rows = await db.select({ rel: workoutSession.coachClientId, endedAt: workoutSession.endedAt }).from(workoutSession)
    .where(and(inArray(workoutSession.coachClientId, relIds), eq(workoutSession.status, "completed"),
      gte(workoutSession.endedAt, new Date(`${week[0]}T03:00:00Z`)), lt(workoutSession.endedAt, new Date(`${addIso(week[6], 1)}T03:00:00Z`))));
  const m = new Map<string, number>();
  for (const r of rows) if (r.rel) m.set(r.rel, (m.get(r.rel) ?? 0) + 1);
  return m;
}
export const addIso = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

export async function coachOverview(actorId: string, orgId: string, now = new Date()) {
  const org = await requireCoach(actorId, orgId);
  const rels = await db.select({ rel: coachClient, name: user.name }).from(coachClient).innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(coachClient.coachOrgId, orgId), inArray(coachClient.status, ["active", "paused"]))).orderBy(asc(user.name));
  const relIds = rels.map((r) => r.rel.id);
  const assigns = relIds.length ? await db.select({ a: programAssignment, v: programVersion }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId)).innerJoin(programVersion, eq(programVersion.id, program.currentVersionId))
    .where(and(inArray(programAssignment.coachClientId, relIds), eq(programAssignment.status, "active"))) : [];
  const dayCounts = assigns.length ? await db.select({ versionId: programDay.versionId, n: sql<number>`count(*)::int` }).from(programDay)
    .where(inArray(programDay.versionId, assigns.map((a) => a.v.id))).groupBy(programDay.versionId) : [];
  const last = relIds.length ? await db.select({ rel: workoutSession.coachClientId, at: sql<Date>`max(${workoutSession.endedAt})` }).from(workoutSession)
    .where(and(inArray(workoutSession.coachClientId, relIds), eq(workoutSession.status, "completed"))).groupBy(workoutSession.coachClientId) : [];
  const week = await weekCompletedByRelation(relIds, now);
  const clients = rels.map((r) => {
    const a = assigns.find((x) => x.a.coachClientId === r.rel.id);
    const days = a ? dayCounts.find((d) => d.versionId === a.v.id)?.n ?? 0 : null;
    const done = week.get(r.rel.id) ?? 0;
    const lastAt = last.find((l) => l.rel === r.rel.id)?.at ?? null;
    return {
      id: r.rel.id, name: r.name, status: r.rel.status, since: r.rel.createdAt,
      program: a ? { name: a.v.name, startsOn: a.a.startsOn, days } : null,
      weekDone: done, adherence: weeklyAdherence(done, days), lastSessionAt: lastAt ? new Date(lastAt).toISOString() : null,
    };
  });
  const [pendingInv] = await db.select({ n: sql<number>`count(*)::int` }).from(invitation)
    .where(and(eq(invitation.orgId, orgId), eq(invitation.status, "pending"), gte(invitation.expiresAt, now)));
  const withProg = clients.filter((c) => c.adherence != null);
  return {
    org: { id: org.id, name: org.name, specialty: org.specialty, modality: org.modality, status: org.status, trialEndsAt: org.trialEndsAt },
    clients,
    kpis: {
      active: clients.filter((c) => c.status === "active").length,
      noProgram: clients.filter((c) => c.status === "active" && !c.program).length,
      weekSessions: clients.reduce((a, c) => a + c.weekDone, 0),
      adherence: withProg.length ? Math.round(withProg.reduce((a, c) => a + (c.adherence ?? 0), 0) / withProg.length) : null,
      pendingInvites: pendingInv?.n ?? 0,
    },
  };
}

/**
 * F-CO-04: rendimiento del cliente desde series reales de esta relación (últimas 8 semanas).
 * 1RM estimado con Epley (series de 1 a 12 reps con carga; heurística revisable, no un test máximo) y su tendencia
 * contra las 4 semanas previas; volumen (Σ peso × reps) por grupo muscular esta semana vs la anterior.
 */
export async function clientPerformance(actorId: string, orgId: string, coachClientId: string, now = new Date()) {
  await requireCoach(actorId, orgId);
  await requireClientOf(orgId, coachClientId);
  const since = new Date(now.getTime() - 56 * 86_400_000), mid = new Date(now.getTime() - 28 * 86_400_000);
  const rows = await db.select({ l: setLog, name: exercise.name, group: exercise.muscleGroup }).from(setLog)
    .innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId)).innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .where(and(eq(workoutSession.coachClientId, coachClientId), inArray(workoutSession.status, ["completed", "in_progress", "paused"]), isNull(setLog.voidedAt), gte(setLog.completedAt, since)));
  const byEx = new Map<string, { name: string; group: string; recent: typeof rows; before: typeof rows }>();
  for (const r of rows) {
    const e = byEx.get(r.l.exerciseId) ?? { name: r.name, group: r.group, recent: [], before: [] };
    (r.l.completedAt >= mid ? e.recent : e.before).push(r);
    byEx.set(r.l.exerciseId, e);
  }
  const timed = await timedPeIds(rows.map((r) => r.l.programExerciseId));
  const exercises = [...byEx.values()].map((e) => {
    const cur = bestE1rm(e.recent.map((r) => toLogged(r.l, timed)));
    const prev = bestE1rm(e.before.map((r) => toLogged(r.l, timed)));
    return { name: e.name, group: e.group, best: cur, previous: prev, sets: e.recent.length };
  }).filter((e) => e.best || e.previous).sort((a, b) => (b.best?.e1rm ?? 0) - (a.best?.e1rm ?? 0));
  const week = weekOf(now);
  const start = new Date(`${week[0]}T03:00:00Z`), prevStart = new Date(start.getTime() - 7 * 86_400_000);
  const groups = new Map<string, { thisWeek: number; lastWeek: number }>();
  for (const r of rows) {
    const g = groups.get(r.group) ?? { thisWeek: 0, lastWeek: 0 };
    const v = volumeKg([toLogged(r.l, timed)]);
    if (r.l.completedAt >= start) g.thisWeek += v; else if (r.l.completedAt >= prevStart) g.lastWeek += v;
    groups.set(r.group, g);
  }
  return {
    formula: "1RM estimado (Epley) = peso × (1 + repeticiones / 30), con series de 1 a 12 repeticiones. Es una estimación, no un máximo medido.",
    exercises,
    groups: [...groups.entries()].map(([group, v]) => ({ group, thisWeek: Math.round(v.thisWeek * 10) / 10, lastWeek: Math.round(v.lastWeek * 10) / 10 }))
      .filter((g) => g.thisWeek || g.lastWeek).sort((a, b) => b.thisWeek - a.thisWeek),
  };
}

/**
 * D178: lo que registró la persona en cada sesión, serie por serie (ejercicio real hecho, peso, repeticiones o segundos,
 * RIR y sensación), en el orden en que lo hizo. Lo ven su coach y el equipo de sala con quien compartió su entrenamiento.
 */
export async function sessionLogs(sessionIds: string[]) {
  const out = new Map<string, { exercise: string; timed: boolean; sets: { n: number; weightKg: number | null; reps: number | null; rir: number | null; feel: string | null; note: string | null; label: string | null; corrected?: boolean }[] }[]>();
  if (!sessionIds.length) return out;
  // D192: el nombre de la serie (Top set, Load Set, Drop 1…) sale de la versión congelada que se entrenó: renombrar después un
  // tipo propio no cambia lo que se muestra de sesiones anteriores.
  const rows = await db.select({ l: setLog, name: exercise.name, pe: { sets: programExercise.sets, reps: programExercise.reps, detail: programExercise.detail } }).from(setLog).innerJoin(exercise, eq(exercise.id, setLog.exerciseId))
    .leftJoin(programExercise, eq(programExercise.id, setLog.programExerciseId))
    .where(and(inArray(setLog.sessionId, sessionIds), isNull(setLog.voidedAt))).orderBy(asc(setLog.completedAt));
  const timed = await timedPeIds(rows.map((r) => r.l.programExerciseId));
  // D195: la persona corrigió o agregó esta serie desde su historial (se muestra; quien la ve no puede cambiarla).
  const corrected = new Set((await db.selectDistinct({ id: schema.trainingCorrection.setLogId }).from(schema.trainingCorrection)
    .where(and(inArray(schema.trainingCorrection.sessionId, sessionIds), inArray(schema.trainingCorrection.action, ["set_edit", "set_add"])))).map((r) => r.id));
  for (const { l, name, pe } of rows) {
    const list = out.get(l.sessionId) ?? [];
    const key = `${l.programExerciseId}:${l.exerciseId}`;
    let ex = list.find((x) => (x as { key?: string }).key === key);
    if (!ex) { ex = Object.assign({ exercise: name, timed: timed.has(l.programExerciseId), sets: [] }, { key }); list.push(ex); }
    const label = pe?.detail ? setTarget({ sets: pe.sets, reps: pe.reps, rir: null, restSec: 0, detail: pe.detail as ExerciseDetail }, l.setIndex).label : null;
    ex.sets.push({ n: l.setIndex + 1, weightKg: l.weightKg == null ? null : Number(l.weightKg), reps: l.reps, rir: l.rir, feel: l.feel, note: l.note, label, ...(corrected.has(l.id) ? { corrected: true } : {}) });
    out.set(l.sessionId, list);
  }
  for (const list of out.values()) for (const ex of list) { delete (ex as { key?: string }).key; ex.sets.sort((a, b) => a.n - b.n); }
  return out;
}

export async function clientDetail(actorId: string, orgId: string, coachClientId: string) {
  await requireCoach(actorId, orgId);
  const rel = await requireClientOf(orgId, coachClientId);
  const [a] = await db.select().from(programAssignment).where(and(eq(programAssignment.coachClientId, coachClientId), eq(programAssignment.status, "active")));
  let prog = null;
  if (a) {
    const [p] = await db.select().from(program).where(eq(program.id, a.programId));
    const { version, doc } = await readVersion(p.currentVersionId!);
    prog = { programId: p.id, startsOn: a.startsOn, version: version.number, doc };
  }
  const sessions = await db.select().from(workoutSession).where(and(eq(workoutSession.coachClientId, coachClientId), inArray(workoutSession.status, ["completed", "in_progress", "paused"])))
    .orderBy(desc(workoutSession.startedAt)).limit(20);
  const sets = sessions.length ? await db.select().from(setLog).where(and(inArray(setLog.sessionId, sessions.map((s) => s.id)), isNull(setLog.voidedAt))) : [];
  // F-HX-21 (D106): el coach ve qué ejercicios se saltaron o reemplazaron y las notas por serie, con su motivo.
  const changes = sessions.length ? await db.select({ c: sessionExerciseChange, pe: programExercise.name, sub: exercise.name }).from(sessionExerciseChange)
    .innerJoin(programExercise, eq(programExercise.id, sessionExerciseChange.programExerciseId)).leftJoin(exercise, eq(exercise.id, sessionExerciseChange.substituteExerciseId))
    .where(inArray(sessionExerciseChange.sessionId, sessions.map((s) => s.id))) : [];
  const timed = await timedPeIds(sets.map((x) => x.programExerciseId));
  const noted = sets.filter((x) => x.note);
  const peNames = new Map((noted.length ? await db.select({ id: programExercise.id, name: programExercise.name }).from(programExercise)
    .where(inArray(programExercise.id, [...new Set(noted.map((x) => x.programExerciseId))])) : []).map((r) => [r.id, r.name]));
  const logs = await sessionLogs(sessions.map((s) => s.id));
  const grants = await db.select({ item: consentGrant.item }).from(consentGrant).where(and(eq(consentGrant.relationId, coachClientId), eq(consentGrant.status, "active")));
  // D147: lo que busca entrenando, sólo si el alumno eligió compartirlo con quien arma su rutina.
  const [pref] = await db.select({ wishes: userPref.wishes }).from(userPref).where(eq(userPref.userId, rel.userId));
  return {
    id: coachClientId, name: rel.name, status: rel.rel.status, since: rel.rel.createdAt, grants: grants.map((g) => g.item), program: prog,
    wishes: sharedWishes(pref?.wishes as TrainingWishes | null),
    sessions: sessions.map((s) => {
      const ss = sets.filter((x) => x.sessionId === s.id);
      return {
        id: s.id, dayName: s.dayName, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt, rpe: s.rpe, note: s.note,
        durationSec: activeSeconds(s.activeMs, s.status === "in_progress" ? s.lastResumedAt : null, new Date()), sets: ss.length,
        volumeKg: volumeKg(ss.map((x) => toLogged(x, timed))),
        changes: changes.filter((x) => x.c.sessionId === s.id).map((x) => ({ exercise: x.pe, kind: x.c.kind, reason: x.c.reason, substitute: x.sub })),
        setNotes: ss.filter((x) => x.note).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
          .map((x) => ({ exercise: peNames.get(x.programExerciseId) ?? "", set: x.setIndex + 1, note: x.note! })),
        exercises: logs.get(s.id) ?? [],
      };
    }),
  };
}

/**
 * Pausar, reactivar o terminar la relación con un alumno (MVP Coach, D115). Pausar le saca el programa al alumno hasta
 * reactivar (el chat sigue); terminar cierra el programa asignado, revoca lo que había compartido y deja el chat de sólo
 * lectura. Nada borra el historial del alumno. Para volver después de terminar, el coach lo invita de nuevo.
 */
export async function setClientStatus(actorId: string, orgId: string, coachClientId: string, status: "active" | "paused" | "ended") {
  await requireCoach(actorId, orgId);
  return db.transaction(async (tx) => {
    const [rel] = await tx.select().from(coachClient).where(and(eq(coachClient.id, coachClientId), eq(coachClient.coachOrgId, orgId))).for("update");
    if (!rel) throw NOT_FOUND();
    if (rel.status === "ended") throw new AccessError("ended", "Esta relación ya terminó. Para volver a entrenarlo, invitalo de nuevo.", 409);
    if (rel.status === status) return { status };
    await tx.update(coachClient).set({ status }).where(eq(coachClient.id, rel.id));
    if (status === "ended") {
      await tx.update(programAssignment).set({ status: "ended", endedAt: new Date() }).where(and(eq(programAssignment.coachClientId, rel.id), eq(programAssignment.status, "active")));
      await tx.update(consentGrant).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(consentGrant.relationId, rel.id), eq(consentGrant.status, "active")));
    }
    await audit(tx, { actorUserId: actorId, orgId, action: `coach_client.${status}`, resourceType: "coach_client", resourceId: rel.id });
    return { status };
  });
}

// ── Alumno ──────────────────────────────────────────────────────────────────
/**
 * Serie registrada → serie para métricas. D183: `timed` puede traer la clasificación por fila (`flags`, de `timedPeIds`):
 * aproximación, series por tiempo y AMRAP en rondas no suman volumen ni récords (metrics.ts).
 */
export const toLogged = (s: typeof setLog.$inferSelect, timed?: PlanIndex): LoggedSet => {
  const f = timed?.flags?.(s.programExerciseId, s.setIndex);
  return { exerciseId: s.exerciseId, weightKg: s.weightKg == null ? null : Number(s.weightKg), reps: s.reps, completed: true, at: s.completedAt.toISOString(),
    timed: (f ? f.timed : timed?.has(s.programExerciseId)) || undefined, warmup: f?.warmup || undefined, rounds: f?.rounds || undefined };
};
/** Ejercicios del programa con su plan: `has` = prescripción por tiempo (D148, QA DATA-6); `flags` = qué es cada fila (D183). */
export type PlanIndex = ReadonlySet<string> & { flags?: (peId: string, setIndex: number) => ReturnType<typeof rowFlags> };
export async function timedPeIds(peIds: Iterable<string>): Promise<PlanIndex> {
  const ids = [...new Set(peIds)];
  if (!ids.length) return new Set();
  const rows = await db.select({ id: programExercise.id, reps: programExercise.reps, sets: programExercise.sets, detail: programExercise.detail }).from(programExercise).where(inArray(programExercise.id, ids));
  const byId = new Map(rows.map((r) => [r.id, { sets: r.sets, reps: r.reps, detail: r.detail as ExerciseDetail | null }]));
  const out = new Set(rows.filter((r) => parseReps(r.reps).kind === "time").map((r) => r.id)) as Set<string> & { flags?: PlanIndex["flags"] };
  out.flags = (peId, i) => { const e = byId.get(peId); return e ? rowFlags(e, i) : { kind: "work" as SetKind, block: i, stage: 0, timed: false, warmup: false, rounds: false, durationSec: null }; };
  return out;
}

/** Relación de entrenamiento: coach privado o programa institucional del gym. Cada una con sus datos y permisos propios. */
export type TrainingRelation = {
  id: string; kind: "coach" | "gym"; orgId: string; orgName: string;
  name: string; // coach o "Equipo de sala"
  place: string; // organización (y sede)
  assignment: typeof programAssignment.$inferSelect | null;
};

export async function myRelations(userId: string): Promise<TrainingRelation[]> {
  const coachRows = await db.select({ rel: coachClient, org: organization }).from(coachClient).innerJoin(organization, eq(organization.id, coachClient.coachOrgId))
    .where(and(eq(coachClient.userId, userId), eq(coachClient.status, "active"))).orderBy(asc(coachClient.createdAt));
  const gymRows = await db.select({ m: gymMember, org: organization, loc: gymLocation }).from(gymMember)
    .innerJoin(organization, eq(organization.id, gymMember.orgId)).innerJoin(gymLocation, eq(gymLocation.id, gymMember.locationId))
    .where(and(eq(gymMember.userId, userId), eq(gymMember.status, "active"))).orderBy(asc(gymMember.createdAt));
  const out: TrainingRelation[] = [];
  for (const r of coachRows) {
    const [coach] = await db.select({ name: user.name }).from(staffMembership).innerJoin(user, eq(user.id, staffMembership.userId))
      .where(and(eq(staffMembership.orgId, r.org.id), eq(staffMembership.role, "coach_owner"), eq(staffMembership.status, "active")));
    const [a] = await db.select().from(programAssignment).where(and(eq(programAssignment.coachClientId, r.rel.id), eq(programAssignment.status, "active")));
    out.push({ id: r.rel.id, kind: "coach", orgId: r.org.id, orgName: r.org.name, name: coach?.name ?? r.org.name, place: r.org.name, assignment: a ?? null });
  }
  for (const r of gymRows) {
    const [a] = await db.select().from(programAssignment).where(and(eq(programAssignment.gymMemberId, r.m.id), eq(programAssignment.status, "active")));
    out.push({ id: r.m.id, kind: "gym", orgId: r.org.id, orgName: r.org.name, name: "Equipo de sala", place: `${r.org.name} · ${r.loc.name}`, assignment: a ?? null });
  }
  return out;
}

/**
 * Relación activa (D11/GAP-24, propuesta): la que la persona eligió; si no eligió, la primera con programa vigente
 * (coach privado antes que gym), y si ninguna tiene programa, la primera relación.
 */
export async function myActive(userId: string) {
  const rels = await myRelations(userId);
  if (!rels.length) return null;
  const [pref] = await db.select({ activeRelationId: userPref.activeRelationId }).from(userPref).where(eq(userPref.userId, userId));
  const picked = rels.find((r) => r.id === pref?.activeRelationId) ?? rels.find((r) => r.assignment) ?? rels[0];
  return { ...picked, all: rels };
}

export async function setActiveRelation(userId: string, relationId: string) {
  const rels = await myRelations(userId);
  if (!rels.some((r) => r.id === relationId)) throw NOT_FOUND();
  await db.insert(userPref).values({ userId, activeRelationId: relationId }).onConflictDoUpdate({ target: userPref.userId, set: { activeRelationId: relationId, updatedAt: new Date() } });
  return { activeRelationId: relationId };
}

/**
 * Marca liviana del programa vigente (D143): cambia cuando el coach o el equipo de sala editan, versionan o reasignan. La app
 * del alumno la consulta cada pocos segundos y sólo recarga el programa completo si cambió.
 */
export async function trainingStamp(userId: string) {
  const [r] = await db.execute<{ k: string | null }>(sql`
    select string_agg(pa.id || ':' || coalesce(p.current_version_id, '') || ':' || (extract(epoch from p.updated_at) * 1000)::bigint, ',' order by pa.id) as k
    from program_assignment pa join program p on p.id = pa.program_id
    left join coach_client cc on cc.id = pa.coach_client_id left join gym_member gm on gm.id = pa.gym_member_id
    where pa.status = 'active' and (cc.user_id = ${userId} or gm.user_id = ${userId})`);
  return { stamp: r?.k ?? "" };
}

/** Última serie registrada por ejercicio (excluye la sesión indicada). */
/**
 * D154: series de la última sesión terminada en que la persona hizo cada ejercicio (base de la progresión sugerida).
 * Con `excludeSessionId`, sin contar la sesión en curso.
 */
export type LastTime = { at: Date; sets: LastSet[]; reps: string | null };
export async function lastTimeByExercise(userId: string, exerciseIds: string[], excludeSessionId?: string, scope?: { coachClientId?: string; gymMemberId?: string }) {
  const out = new Map<string, LastTime>();
  if (!exerciseIds.length) return out;
  const latest = await db.selectDistinctOn([setLog.exerciseId], { exerciseId: setLog.exerciseId, sessionId: setLog.sessionId, at: setLog.completedAt })
    .from(setLog).innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), isNull(setLog.voidedAt), inArray(setLog.exerciseId, exerciseIds),
      excludeSessionId ? ne(workoutSession.id, excludeSessionId) : undefined,
      // El coach o el gym ven sólo lo entrenado con ellos (nunca el entrenamiento con otro coach o gimnasio).
      scope?.coachClientId ? eq(workoutSession.coachClientId, scope.coachClientId) : undefined,
      scope?.gymMemberId ? eq(workoutSession.gymMemberId, scope.gymMemberId) : undefined))
    .orderBy(setLog.exerciseId, desc(setLog.completedAt));
  if (!latest.length) return out;
  // D182: con la sensación de cada serie, su tipo según el plan de esa sesión (versión congelada) y las repeticiones indicadas.
  const rows = await db.select({ exerciseId: setLog.exerciseId, sessionId: setLog.sessionId, idx: setLog.setIndex, w: setLog.weightKg, r: setLog.reps, rir: setLog.rir, feel: setLog.feel,
    peReps: programExercise.reps, detail: programExercise.detail, setKind: setLog.setKind })
    .from(setLog).innerJoin(programExercise, eq(programExercise.id, setLog.programExerciseId))
    .where(and(inArray(setLog.sessionId, [...new Set(latest.map((l) => l.sessionId))]), inArray(setLog.exerciseId, exerciseIds), isNull(setLog.voidedAt))).orderBy(asc(setLog.setIndex));
  for (const l of latest) {
    const mine = rows.filter((x) => x.sessionId === l.sessionId && x.exerciseId === l.exerciseId);
    out.set(l.exerciseId, { at: l.at, reps: mine[0]?.peReps ?? null, sets: mine.map((x) => ({ weightKg: x.w == null ? null : Number(x.w), reps: x.r, rir: x.rir, feel: x.feel,
      kind: (x.setKind as SetKind | null) ?? kindAt(x.detail as ExerciseDetail | null, x.idx) })) }); // D183: el tipo guardado al registrar, o el de la versión
  }
  return out;
}

/**
 * D182: señales de seguridad del propio alumno para sus sugerencias (no se muestran a nadie más). Molestias reportadas por
 * ejercicio (nombre) en los últimos PAIN_LOOKBACK_DAYS; molestia general reciente o lesión activa/en seguimiento; check-in de hoy.
 */
export type Signals = { painOrInjury: boolean; lowReadiness: boolean; painNames: Set<string>; now: Date };
export async function trainingSignals(userId: string, now = new Date()): Promise<Signals> {
  const [pains, inj, [ci]] = await Promise.all([
    db.select({ name: painReport.exerciseName, at: painReport.createdAt }).from(painReport)
      .where(and(eq(painReport.userId, userId), gte(painReport.createdAt, new Date(now.getTime() - PAIN_LOOKBACK_DAYS * 86_400_000)))),
    db.select({ id: injury.id }).from(injury).where(and(eq(injury.userId, userId), inArray(injury.status, ["active", "monitoring"]), isNull(injury.deletedAt))).limit(1),
    db.select().from(checkin).where(and(eq(checkin.userId, userId), eq(checkin.date, localDate(now)))),
  ]);
  const general = pains.some((x) => !x.name && x.at.getTime() >= now.getTime() - GENERAL_PAIN_DAYS * 86_400_000);
  return {
    painOrInjury: general || inj.length > 0, lowReadiness: !!ci && (ci.energy <= 2 || ci.sleep <= 2),
    painNames: new Set(pains.filter((x) => x.name).map((x) => exerciseKey(x.name!))), now,
  };
}

/**
 * Sugerencia de hoy para un ejercicio del programa: nada si el profe ya indicó la carga en el plan (manda el profe) ni si el
 * plan tiene series distintas (top set, back-off, drop, rest-pause, pirámide, AMRAP): una carga única sería incorrecta (D182).
 */
const suggestionFor = (e: { name: string; reps: string; sets: number; detail?: unknown }, last: LastTime | undefined, sig?: Signals) => {
  const detail = e.detail as ExerciseDetail | null;
  if (!last || coachSetLoads(detail) || !progressionApplies(detail)) return null;
  const signals: SafetySignals | undefined = sig && {
    painExercise: sig.painNames.has(exerciseKey(e.name)), painOrInjury: sig.painOrInjury, lowReadiness: sig.lowReadiness,
    daysSinceLast: Math.floor((sig.now.getTime() - last.at.getTime()) / 86_400_000),
  };
  return suggestNext({ reps: e.reps, sets: e.sets, last: last.sets, lastReps: last.reps, signals });
};

/** D155: propuesta de programa armada por REPI para el coach (plantilla o copia de un cliente). Borrador: no se guarda. */
export async function coachProgramDraft(actorId: string, orgId: string, brief: Partial<import("./program-ai").ProgramBrief> & { change?: string; current?: ProgramDoc }) {
  await requireCoach(actorId, orgId);
  const { cleanBrief, draftProgram, reviseOf } = await import("./program-ai");
  const b = cleanBrief(brief);
  const revise = reviseOf(brief);
  const d = await draftProgram(orgId, b, revise);
  await audit(db, { actorUserId: actorId, orgId, action: "program.ai_draft", resourceType: "organization", resourceId: orgId,
    meta: { byRules: d.byRules, days: d.doc.days.length, hadLimitations: !!b.limitations, revised: !!revise } });
  return d;
}

/** D154: para el coach que actualiza la copia de un cliente, lo que el cliente hizo la última vez en cada ejercicio. */
export async function coachProgramLastTimes(actorId: string, orgId: string, programId: string, exerciseIds: string[]) {
  await requireCoach(actorId, orgId);
  const p = await loadProgram(orgId, programId);
  if (p.kind !== "client_copy" || !p.coachClientId) return {};
  const rel = await requireClientOf(orgId, p.coachClientId).catch(() => null); // sin consentimiento de entrenamientos, nada
  if (!rel) return {};
  return Object.fromEntries(await lastTimeByExercise(rel.userId, exerciseIds.slice(0, 60), undefined, { coachClientId: p.coachClientId }));
}

export async function lastSetByExercise(userId: string, exerciseIds: string[], excludeSessionId?: string) {
  if (!exerciseIds.length) return new Map<string, { weightKg: number | null; reps: number | null; at: Date }>();
  const rows = await db.selectDistinctOn([setLog.exerciseId], { exerciseId: setLog.exerciseId, weightKg: setLog.weightKg, reps: setLog.reps, completedAt: setLog.completedAt })
    .from(setLog).innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
    .where(and(eq(workoutSession.userId, userId), inArray(workoutSession.status, ["completed", "in_progress", "paused"]), isNull(setLog.voidedAt), inArray(setLog.exerciseId, exerciseIds),
      excludeSessionId ? ne(workoutSession.id, excludeSessionId) : undefined))
    .orderBy(setLog.exerciseId, desc(setLog.completedAt));
  const m = new Map<string, { weightKg: number | null; reps: number | null; at: Date }>();
  for (const r of rows) m.set(r.exerciseId, { weightKg: r.weightKg == null ? null : Number(r.weightKg), reps: r.reps, at: r.completedAt });
  // D132: si todavía no lo registró en REPI, la última marca de su historial importado sugiere el peso inicial.
  const missing = exerciseIds.filter((id) => !m.has(id));
  if (missing.length) for (const [id, x] of await importedLastSets(userId, missing)) m.set(id, { weightKg: x.weightKg, reps: x.reps, at: new Date(`${x.day}T12:00:00-03:00`) });
  return m;
}

export async function myTraining(userId: string, now = new Date()) {
  const act = await myActive(userId);
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const [pref] = await db.select({ weightUnit: userPref.weightUnit }).from(userPref).where(eq(userPref.userId, userId));
  const week = weekOf(now);
  const relation = act ? { id: act.id, kind: act.kind, name: act.name, org: act.place, orgId: act.orgId } : null;
  const relations = act ? act.all.map((r) => ({ id: r.id, kind: r.kind, name: r.name, org: r.place, hasProgram: !!r.assignment })) : [];
  const base = {
    userId, firstName: (u?.name ?? "").split(" ")[0], coach: act?.kind === "coach" ? { name: act.name, org: act.place } : null,
    relation, relations, today: localDate(now), week, weightUnit: pref?.weightUnit ?? ("kg" as const),
    // D184: si la sugerencia de REPI está configurada en este servidor. Sin ella el teléfono no la pide por adelantado (antes
    // cada apertura de Entrenar terminaba en un 503 esperado) y «No vino el profe» usa las reglas, como siempre.
    ai: aiOn(),
  };
  const open = await db.select().from(workoutSession).where(and(eq(workoutSession.userId, userId), inArray(workoutSession.status, ["in_progress", "paused"])));
  const completed = await db.select({ endedAt: workoutSession.endedAt, dayId: workoutSession.dayId, id: workoutSession.id }).from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, new Date(`${addIso(week[0], -7)}T03:00:00Z`))))
    .orderBy(desc(workoutSession.endedAt));
  const doneDates = completed.map((c) => localDate(c.endedAt!));
  const thisWeek = completed.filter((c) => week.includes(localDate(c.endedAt!)));
  const lastWeek = completed.filter((c) => !week.includes(localDate(c.endedAt!)));
  const vol = async (ids: string[]) => {
    if (!ids.length) return 0;
    const ls = await db.select().from(setLog).where(and(inArray(setLog.sessionId, ids), isNull(setLog.voidedAt)));
    const timed = await timedPeIds(ls.map((l) => l.programExerciseId));
    return volumeKg(ls.map((l) => toLogged(l, timed)));
  };
  const stats = { weekDone: thisWeek.length, doneDates, volumeThisWeek: await vol(thisWeek.map((c) => c.id)), volumeLastWeek: await vol(lastWeek.map((c) => c.id)) };
  if (!act?.assignment) return { ...base, state: "no_program" as const, stats, openSession: open[0]?.id ?? null, openSessionDay: open[0]?.dayName ?? null };
  if (act.assignment.startsOn > base.today) return { ...base, state: "scheduled" as const, startsOn: act.assignment.startsOn, stats, openSession: open[0]?.id ?? null, openSessionDay: open[0]?.dayName ?? null };
  const [p] = await db.select().from(program).where(eq(program.id, act.assignment.programId));
  const { version, doc } = await readVersion(p.currentVersionId!);
  const exIds = [...new Set(doc.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  const [prev, lastTime, sig] = await Promise.all([lastSetByExercise(userId, exIds), lastTimeByExercise(userId, exIds), trainingSignals(userId, now)]);
  const [lastDone] = await db.select({ dayId: workoutSession.dayId, dayName: workoutSession.dayName }).from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.assignmentId, act.assignment.id), eq(workoutSession.status, "completed")))
    .orderBy(desc(workoutSession.endedAt)).limit(1);
  // La rotación sigue por posición aunque la versión haya cambiado: se busca el día por nombre+posición.
  const dayIds = doc.days.map((d) => d.id!);
  let lastIdx: string | null = null;
  if (lastDone) {
    const [d] = await db.select({ position: programDay.position }).from(programDay).where(eq(programDay.id, lastDone.dayId));
    lastIdx = d && dayIds[d.position] ? dayIds[d.position] : null;
  }
  // D185: la rotación saltea los días sin ejercicios (empezarlos dejaba un entrenamiento vacío abierto).
  let next = nextDayIndex(dayIds, lastIdx);
  for (let k = 0; k < doc.days.length && next >= 0 && !doc.days[next].exercises.length; k++) next = (next + 1) % doc.days.length;
  // F-CL-14: programa nuevo o actualizado, con autor. Cada asignación arranca en la versión 1 de su copia: una versión
  // nueva (si ya se entrenó con la anterior) o una edición en el lugar (si todavía no) cuentan como actualización.
  // Margen de 60 s: en asignaciones anteriores la hora de la copia y la de la asignación salían de relojes distintos.
  const edited = p.updatedAt.getTime() > act.assignment.assignedAt.getTime() + 60_000;
  const updated = version.number > 1 || edited;
  const [author] = await db.select({ name: user.name }).from(user).where(eq(user.id, updated ? version.createdBy : act.assignment.assignedBy));
  const update = {
    key: `${version.id}:${p.updatedAt.getTime()}`, kind: updated ? ("updated" as const) : ("new" as const), author: author?.name ?? null,
    at: (updated ? (edited ? p.updatedAt : version.createdAt) : act.assignment.assignedAt).toISOString(), reason: version.reason, hasPrevious: version.number > 1,
  };
  return {
    ...base, state: "ready" as const, stats, openSession: open[0]?.id ?? null, openSessionDay: open[0]?.dayName ?? null, startsOn: act.assignment.startsOn,
    program: {
      name: doc.name, weeks: doc.weeks, note: doc.note, version: version.number, nextDay: next, update,
      days: doc.days.map((d) => ({
        id: d.id!, name: d.name,
        exercises: d.exercises.map((e) => {
          const pv = prev.get(e.exerciseId);
          return { id: e.id!, exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, detail: e.detail ?? null, prev: pv ? { weightKg: pv.weightKg, reps: pv.reps } : null,
            suggest: suggestionFor(e, lastTime.get(e.exerciseId), sig) };
        }),
      })),
    },
  };
}

async function mySession(userId: string, sessionId: string, tx: Tx | typeof db = db, lock = false) {
  const q = tx.select().from(workoutSession).where(and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)));
  const [s] = lock ? await q.for("update") : await q;
  if (!s) throw NOT_FOUND();
  return s;
}

/** Sin relación vigente (baja, suspensión) no se registran series nuevas: el historial queda, el acceso no. */
async function assertRelationActive(tx: Tx, s: typeof workoutSession.$inferSelect) {
  if (s.coachClientId) {
    const [cc] = await tx.select({ st: coachClient.status }).from(coachClient).where(eq(coachClient.id, s.coachClientId));
    if (cc && cc.st !== "active") throw new AccessError("relation_inactive", "Tu acceso con este coach no está vigente.", 403);
  }
  if (s.gymMemberId) {
    const [gm] = await tx.select({ st: gymMember.status, until: gymMember.accessUntil }).from(gymMember).where(eq(gymMember.id, s.gymMemberId));
    if (gm && gm.st !== "active") throw new AccessError("relation_inactive", "Tu acceso a este gym no está vigente. Consultá en recepción.", 403);
    // D127: vigencia cargada por el gimnasio. Vencida corta series nuevas; lo registrado queda.
    if (gm?.until && gm.until < localDate(new Date())) throw new AccessError("relation_inactive", "Tu membresía en este gym venció. Consultá en recepción.", 403);
  }
}

/**
 * D127: con el control de acceso activo, iniciar y registrar un entrenamiento del programa del gimnasio exige un ingreso
 * validado de esa misma organización. Lo hecho sin conexión dentro de la vigencia se acepta al sincronizar (ver passCovers).
 */
async function gymPresence(tx: Tx, userId: string, gymMemberId: string, action: "gym.workout.start" | "gym.workout.log_set", now: Date, clientAt: Date, preferPassId?: string | null) {
  const [gm] = await tx.select({ orgId: gymMember.orgId }).from(gymMember).where(eq(gymMember.id, gymMemberId));
  if (!gm) return null;
  return requireGymAction({ userId, orgId: gm.orgId, action, clientAt, preferPassId }, now, tx);
}

/**
 * Hotfix P0 (D193): programa vigente de una sesión abierta. Si el profe le volvió a asignar un programa a la persona con el
 * entrenamiento abierto, la asignación de la sesión quedó cerrada y la vigente es otra de la misma relación: antes no se
 * avisaba ni se podía «Aplicar ahora», y la persona seguía con la copia vieja (sin las cargas nuevas). Una rutina propia
 * (`solo`) nunca pasa a un programa asignado.
 */
async function liveAssignment(tx: Tx | typeof db, s: typeof workoutSession.$inferSelect): Promise<{ assignmentId: string; versionId: string } | null> {
  const [own] = await tx.select({ a: programAssignment, kind: program.kind, v: program.currentVersionId }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId)).where(eq(programAssignment.id, s.assignmentId));
  if (!own || own.kind === "solo") return null;
  if (own.a.status === "active") return own.v ? { assignmentId: own.a.id, versionId: own.v } : null;
  const rel = own.a.coachClientId ? eq(programAssignment.coachClientId, own.a.coachClientId) : own.a.gymMemberId ? eq(programAssignment.gymMemberId, own.a.gymMemberId) : null;
  if (!rel) return null;
  const [next] = await tx.select({ id: programAssignment.id, v: program.currentVersionId }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId))
    .where(and(rel, eq(programAssignment.status, "active"), sql`${program.kind} <> 'solo'`));
  return next?.v ? { assignmentId: next.id, versionId: next.v } : null;
}

/**
 * La validación de ingreso es para el programa del gimnasio (modo híbrido: «iniciar y registrar un entrenamiento del programa
 * del gimnasio»). Las rutinas propias del alumno (D158) y la rutina de hoy de REPI (D153) no son el programa del gym: se
 * entrenan sin check-in, igual que se ven desde cualquier lugar.
 */
async function isSoloSession(tx: Tx, s: typeof workoutSession.$inferSelect) {
  const [r] = await tx.select({ kind: program.kind }).from(programVersion).innerJoin(program, eq(program.id, programVersion.programId)).where(eq(programVersion.id, s.versionId));
  return r?.kind === "solo";
}

const BAD_TIME = () => new AccessError("invalid_time", "La hora del dispositivo no es válida. Revisá la fecha y hora del teléfono.");

/**
 * Inicia una sesión con ID generado en el cliente. Acepta la hora real de inicio (también offline, ventana de 72 h).
 * El día puede pertenecer a una versión anterior del programa asignado: la sesión conserva la versión con la que se hizo.
 * Si otro dispositivo tiene una sesión abierta, es conflicto: sólo se cierra la otra si la persona lo elige (closeOther).
 */
export async function startSession(userId: string, p: { id: string; dayId: string; startedAt?: string; closeOther?: boolean }, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(p.id)) throw new AccessError("invalid", "Identificador de sesión inválido.");
  const startedAt = clampClientTime(p.startedAt, now);
  if (startedAt === "invalid") throw BAD_TIME();
  const act = await myActive(userId);
  if (!act?.assignment) throw new AccessError("no_program", "Todavía no tenés un programa asignado.", 409);
  if (act.assignment.startsOn > localDate(startedAt)) throw new AccessError("not_started", `Tu programa empieza el ${act.assignment.startsOn}.`, 409);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(workoutSession).where(eq(workoutSession.id, p.id));
    if (existing) { if (existing.userId !== userId) throw NOT_FOUND(); return existing; } // reintento idempotente
    const [day] = await tx.select({ d: programDay }).from(programDay).innerJoin(programVersion, eq(programVersion.id, programDay.versionId))
      .where(and(eq(programDay.id, p.dayId), eq(programVersion.programId, act.assignment!.programId)));
    if (!day) throw new AccessError("invalid", "Ese día no es parte de tu programa actual.");
    // D185: un día sin ejercicios no se empieza (quedaba un entrenamiento abierto que la app no podía mostrar).
    const [{ n: exCount }] = await tx.select({ n: sql<number>`count(*)::int` }).from(programExercise).where(eq(programExercise.dayId, day.d.id));
    if (!exCount) throw new AccessError("empty_day", `«${day.d.name}» todavía no tiene ejercicios. Avisale a tu coach o elegí otro día.`, 409);
    const [openS] = await tx.select().from(workoutSession).where(and(eq(workoutSession.userId, userId), inArray(workoutSession.status, ["in_progress", "paused"]))).for("update");
    if (openS) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(setLog).where(eq(setLog.sessionId, openS.id));
      if (!p.closeOther) {
        throw new AccessError("open_session", `Hay otro entrenamiento abierto (${openS.dayName}). Elegí qué hacer con él.`, 409,
          { other: { id: openS.id, dayName: openS.dayName, startedAt: openS.startedAt, sets: n } });
      }
      const closed = applySessionAction(openS, "finish", now, n > 0)!;
      await tx.update(workoutSession).set({ ...closed, revision: openS.revision + 1, updatedAt: now }).where(eq(workoutSession.id, openS.id));
      await audit(tx, { actorUserId: userId, action: "session.closed_for_other", resourceType: "workout_session", resourceId: openS.id, meta: { by: p.id, sets: n } });
    }
    const presenceCheckinId = act.kind === "gym" ? await gymPresence(tx, userId, act.id, "gym.workout.start", now, startedAt) : null;
    await tx.update(programVersion).set({ locked: true }).where(eq(programVersion.id, day.d.versionId));
    const [s] = await tx.insert(workoutSession).values({
      id: p.id, userId, coachClientId: act.kind === "coach" ? act.id : null, gymMemberId: act.kind === "gym" ? act.id : null, assignmentId: act.assignment!.id, versionId: day.d.versionId, dayId: day.d.id, dayName: day.d.name,
      startedAt, lastResumedAt: startedAt, presenceCheckinId, floorTrainerId: act.kind === "gym" ? await todaysPick(act.id, now, tx) : null,
    }).returning();
    return s;
  });
}

/**
 * D153: entrenar sin rutina asignada («No vino el profe» / «Quiero entrenar por mi cuenta» antes de que el coach o el gym
 * armen el programa). La rutina de hoy (ejercicios de la biblioteca) queda guardada como un programa propio de un día,
 * cerrado de entrada: no cuenta como programa asignado ni cambia lo que el coach o el gym ven como rutina, pero la sesión
 * es una sesión normal (series, sincronización, historial, progreso; el coach o el gym la ven en el historial).
 */
/**
 * Rutina de un día sin programa: la que arma REPI (D153) o una propia del alumno (D158, `source: "own"`). En la propia, el
 * peso que puso el alumno queda como plan de cada serie sólo en los ejercicios que nunca registró; con historial manda su
 * última marca y la sugerencia de REPI (D154), como en cualquier entrenamiento.
 */
export async function startSoloRoutine(userId: string, p: { id: string; dayName: string; source?: "repi" | "own"; exercises: { exerciseId: string; sets: number; reps: string; restSec?: number | null; weightKg?: number | null; note?: string | null; detail?: ExerciseDetail | null }[] }, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(p.id)) throw new AccessError("invalid", "Identificador de sesión inválido.");
  const act = await myActive(userId);
  if (!act) throw new AccessError("no_relation", "Para entrenar con REPI necesitás estar con un coach o un gimnasio.", 409);
  if (!p.exercises.length || p.exercises.length > 12) throw new AccessError("invalid", "La rutina tiene que tener entre 1 y 12 ejercicios.");
  // D184: el mismo detalle (técnica, etapas conectadas, superserie o circuito) y el mismo validador que el programa del coach.
  const details = p.exercises.map((e) => {
    if (!e.reps?.trim() || e.reps.length > 20) throw new AccessError("invalid", "Revisá las repeticiones.");
    const v = validateDetail(e.detail ?? null, e.sets);
    if (!v.ok) throw new AccessError("invalid", v.error);
    const main = mainSets(v.detail, v.sets);
    if (!Number.isInteger(v.sets) || v.sets < 1 || main < 1 || main > 10 || v.sets > MAX_PLAN_ROWS) throw new AccessError("invalid", "Cada ejercicio va con 1 a 10 series.");
    return v;
  });
  const ids = [...new Set(p.exercises.map((e) => e.exerciseId))];
  const lib = await db.select().from(exercise).where(and(inArray(exercise.id, ids), visibleIn(act.orgId, userId)));
  if (lib.length !== ids.length) throw new AccessError("invalid", "Hay ejercicios que no están en la biblioteca.");
  const byId = new Map(lib.map((e) => [e.id, e]));
  const own = p.source === "own";
  const dayName = (p.dayName.trim() || (own ? "Mi rutina" : "Rutina de hoy")).slice(0, 60);
  const prevMarks = own ? await lastSetByExercise(userId, ids) : new Map();
  const okKg = (w: number | null | undefined): w is number => w != null && w > 0 && w <= 500;
  const kgTxt = (w: number) => `${String(Math.round(w * 4) / 4).replace(".", ",")} kg`;
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(workoutSession).where(eq(workoutSession.id, p.id));
    if (existing) { if (existing.userId !== userId) throw NOT_FOUND(); return existing; } // reintento idempotente
    const [openS] = await tx.select().from(workoutSession).where(and(eq(workoutSession.userId, userId), inArray(workoutSession.status, ["in_progress", "paused"]))).for("update");
    if (openS) throw new AccessError("open_session", `Ya tenés un entrenamiento abierto (${openS.dayName}). Terminalo o seguilo desde Entrenar.`, 409);
    const presenceCheckinId = null; // rutina propia o de REPI: no es el programa del gym, no pide check-in (ver isSoloSession)
    const rel = act.kind === "coach" ? { coachClientId: act.id } : { gymMemberId: act.id };
    const [pr] = await tx.insert(program).values({ orgId: act.orgId, kind: "solo", ...rel, createdBy: userId }).returning();
    const [v] = await tx.insert(programVersion).values({ programId: pr.id, number: 1, name: dayName, weeks: 1, note: "", createdBy: userId, reason: own ? "Rutina propia del alumno" : "Rutina de hoy armada por REPI", locked: true }).returning();
    await tx.update(program).set({ currentVersionId: v.id }).where(eq(program.id, pr.id));
    const [day] = await tx.insert(programDay).values({ versionId: v.id, position: 0, name: dayName }).returning();
    const bad = circuitIssues(p.exercises.map((e, j) => ({ name: byId.get(e.exerciseId)!.name, sets: details[j].sets, reps: e.reps, detail: details[j].detail })))[0];
    if (bad) throw new AccessError("invalid", `El circuito ${bad.group} tiene ${bad.rounds} vueltas, pero ${bad.exercise} tiene ${bad.blocks} series.`);
    await tx.insert(programExercise).values(p.exercises.map((e, j) => ({ dayId: day.id, position: j, exerciseId: e.exerciseId, name: byId.get(e.exerciseId)!.name,
      sets: details[j].sets, reps: e.reps.trim(), rir: null, restSec: e.restSec != null && e.restSec >= 0 && e.restSec <= 600 ? e.restSec : 90,
      // Con método, el plan manda (las cargas que tenga, o por elegir con la última marca). Sin método, como siempre: el peso de
      // la rutina la primera vez (D158).
      detail: details[j].detail ? withFirstLoad(details[j].detail!, own && okKg(e.weightKg) && !prevMarks.get(e.exerciseId) ? Math.round(e.weightKg * 100) / 100 : null)
        : own && okKg(e.weightKg) && !prevMarks.get(e.exerciseId) ? applyLoad(null, details[j].sets, e.reps.trim(), Math.round(e.weightKg * 100) / 100) : null,
      // REPI: la carga sugerida va en la nota (el peso inicial de cada serie sale de su última marca, como siempre).
      note: [!own && okKg(e.weightKg) ? `Sugerido: ${kgTxt(e.weightKg)}` : null, e.note?.trim().slice(0, 120) || null].filter(Boolean).join(". ") || null })));
    // Asignación ya cerrada: la sesión necesita una, pero no es «el programa» de la persona.
    const [a] = await tx.insert(programAssignment).values({ ...rel, programId: pr.id, startsOn: localDate(now), status: "ended", assignedBy: userId, assignedAt: now, endedAt: now }).returning();
    const [s] = await tx.insert(workoutSession).values({
      id: p.id, userId, coachClientId: act.kind === "coach" ? act.id : null, gymMemberId: act.kind === "gym" ? act.id : null, assignmentId: a.id, versionId: v.id, dayId: day.id, dayName,
      startedAt: now, lastResumedAt: now, presenceCheckinId, floorTrainerId: act.kind === "gym" ? await todaysPick(act.id, now, tx) : null,
    }).returning();
    await audit(tx, { actorUserId: userId, action: own ? "own_routine.started" : "adaptive.solo_routine_started", resourceType: "workout_session", resourceId: s.id, meta: { exercises: p.exercises.length } });
    return s;
  });
}

/** D184: con plan, el peso de la rutina va en las series principales que no tienen carga (nunca en drops ni back-off). */
function withFirstLoad(d: ExerciseDetail, kg: number | null): ExerciseDetail {
  if (kg == null || !d.setPlan) return d;
  return { ...d, setPlan: d.setPlan.map((r) => ((r.stage ?? 0) === 0 && r.weightKg == null && (r.kind === "work" || r.kind === "amrap" || r.kind === "failure" || r.kind === "top") ? { ...r, weightKg: kg } : r)) };
}

/** D191: objetivos vigentes (y los que falten, en una sesión abierta) y la tendencia de cada ejercicio. */
async function sessionIntel(userId: string, s: typeof workoutSession.$inferSelect, exs: (typeof programExercise.$inferSelect)[], logs: { programExerciseId: string; setIndex: number }[], now: Date) {
  const ti = await import("./intelligence");
  const sx = await ti.sessionExercises(s.id, exs, logs);
  // D195: cargas reales de la sede del socio (catálogo de equipamiento). Sin catálogo o en una sesión de coach: como siempre.
  const gym = s.gymMemberId ? await import("../gym/equipment").then((m) => m.laddersForMember(s.gymMemberId, sx.map((e) => e.doing))).catch(() => null) : null;
  const { targets, history } = await ti.ensureTargets(userId, s, sx, now, gym);
  const ladders = new Map(sx.map((e) => [e.id, ti.ladderFor(e, gym)]));
  const outlook = new Map<string, import("./intelligence").Outlook>();
  if (s.status === "in_progress" || s.status === "paused") {
    const hist = history && sx.every((e) => e.skipped || history.has(e.doing)) ? history : await ti.historyRows(userId, sx.map((e) => e.doing), { excludeSessionId: s.id, now });
    const owned = !(await isSoloSession(db as unknown as Tx, s));
    for (const e of sx) if (!e.skipped) outlook.set(e.id, ti.outlookFor(e, hist.get(e.doing) ?? [], now, owned, false, ladders.get(e.id)?.incrementKg ?? null));
  }
  return { targets, outlook, ladders };
}

export async function getSession(userId: string, sessionId: string, now = new Date()) {
  const s = await mySession(userId, sessionId);
  const dayExs = await db.select().from(programExercise).where(eq(programExercise.dayId, s.dayId)).orderBy(asc(programExercise.position));
  const [v] = await db.select({ note: programVersion.note }).from(programVersion).where(eq(programVersion.id, s.versionId));
  const logs = await db.select().from(setLog).where(and(eq(setLog.sessionId, s.id), isNull(setLog.voidedAt)));
  const skips = await db.select().from(setSkip).where(eq(setSkip.sessionId, s.id)); // D184: etapas omitidas (y deshechas)
  // QA 29/10 (DATA-5): series de un ejercicio que la rutina nueva ya no tiene («Aplicar ahora») siguen a la vista, al final.
  const inDay = new Set(dayExs.map((e) => e.id));
  const keptIds = [...new Set(logs.map((l) => l.programExerciseId).filter((id) => !inDay.has(id)))];
  const keptExs = keptIds.length ? await db.select().from(programExercise).where(inArray(programExercise.id, keptIds)).orderBy(asc(programExercise.position)) : [];
  const exs = [...dayExs, ...keptExs];
  // F-HX-21: saltos y reemplazos de esta sesión. El «anterior» y el peso inicial salen del ejercicio que realmente se hace.
  const changes = await db.select({ c: sessionExerciseChange, name: exercise.name, kind: exercise.kind }).from(sessionExerciseChange)
    .leftJoin(exercise, eq(exercise.id, sessionExerciseChange.substituteExerciseId)).where(eq(sessionExerciseChange.sessionId, s.id));
  const changeOf = new Map(changes.map((x) => [x.c.programExerciseId, x]));
  const doing = (e: typeof exs[number]) => changeOf.get(e.id)?.c.substituteExerciseId ?? e.exerciseId;
  const doneIds = [...new Set([...exs.map((e) => e.exerciseId), ...exs.map(doing)])];
  const [prev, lastTime, sig, media] = await Promise.all([lastSetByExercise(userId, doneIds, s.id), lastTimeByExercise(userId, doneIds, s.id), trainingSignals(userId, now),
    sessionOrg(s.versionId).then((orgId) => import("./exercise-media").then((m) => m.mediaFor(orgId, doneIds)))]); // D164: video de cómo se hace
  // D145: abierta con una versión anterior a la vigente (el coach la cambió) → la app ofrece «Aplicar ahora».
  const open = s.status === "in_progress" || s.status === "paused";
  // D193: también si el profe le reasignó el programa (otra asignación de la misma relación).
  const live = open ? await liveAssignment(db, s) : null;
  const cur = live ? { v: live.versionId } : null;
  const intel = await sessionIntel(userId, s, exs, logs, now).catch(() => null); // D191: nunca impide abrir el entrenamiento
  return {
    id: s.id, dayId: s.dayId, dayName: s.dayName, status: s.status, note: v?.note ?? "", rpe: s.rpe, sessionNote: s.note, outdated: !!cur?.v && cur.v !== s.versionId,
    startedAt: s.startedAt, endedAt: s.endedAt, activeMs: s.activeMs, lastResumedAt: s.lastResumedAt,
    elapsedSec: activeSeconds(s.activeMs, s.status === "in_progress" ? s.lastResumedAt : null, now), revision: s.revision,
    conflicts: await listConflicts(userId, s.id),
    // D184: intervalo EMOM en curso (hora del servidor) y la hora del servidor al responder, para que cada dispositivo lo
    // traduzca a su reloj sin depender de que estén sincronizados.
    interval: open ? (s.intervalState as IntervalState | null) ?? null : null, serverNow: now.toISOString(),
    exercises: exs.map((e) => {
      const pv = prev.get(doing(e));
      const ch = changeOf.get(e.id);
      return {
        id: e.id, exerciseId: e.exerciseId, name: e.name, kept: !inDay.has(e.id) || undefined, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: e.note, detail: (e.detail as ExerciseDetail | null) ?? null,
        prev: pv ? { weightKg: pv.weightKg, reps: pv.reps } : null,
        suggest: suggestionFor(e as { name: string; reps: string; sets: number; detail: unknown }, lastTime.get(doing(e)), sig), // D154, D182
        defaultWeight: pv?.weightKg ?? null, defaultReps: defaultRepsFor(e.reps),
        media: media.get(doing(e)) ?? null,
        // D191: objetivo de REPI por fila (serie o etapa) y tendencia del ejercicio. Separado del plan y de lo registrado.
        targets: intel?.targets.get(e.id) ?? [], outlook: intel?.outlook.get(e.id) ?? null,
        // D195: saltos y cargas disponibles con que REPI calculó (plan, sede o desconocido), para el ajuste en el teléfono.
        ladder: intel?.ladders.get(e.id) ?? null,
        change: ch ? { kind: ch.c.kind, reason: ch.c.reason, substitute: ch.c.substituteExerciseId ? { exerciseId: ch.c.substituteExerciseId, name: ch.name ?? "" } : null } : null,
        logs: logs.filter((l) => l.programExerciseId === e.id).sort((a, b) => a.setIndex - b.setIndex)
          .map((l) => ({ id: l.id, setIndex: l.setIndex, exerciseId: l.exerciseId, weightKg: l.weightKg == null ? null : Number(l.weightKg), reps: l.reps, rir: l.rir, feel: l.feel, note: l.note, completedAt: l.completedAt, revision: l.revision })),
        // D184: cada omisión con su estado (también las deshechas, para resolver entre dispositivos). Un registro manda: una
        // etapa con resultado nunca se muestra omitida (ver `skippedRows`).
        skips: skips.filter((k) => k.programExerciseId === e.id).sort((a, b) => a.setIndex - b.setIndex)
          .map((k) => ({ setIndex: k.setIndex, skipped: k.skipped, changedAt: k.changedAt.toISOString() })),
      };
    }),
  };
}

const WEIGHT_RE = /^\d{1,4}(\.\d{1,2})?$/;
const MAX_REPS = 200, MAX_TIMED_SEC = 3600;
type SetInput = { id: string; programExerciseId: string; setIndex: number; weightKg: number | null; reps: number | null; rir: number | null; feel?: string | null; note?: string | null; baseRevision?: number; at?: string };
const setOut = (r: typeof setLog.$inferSelect) => ({ id: r.id, setIndex: r.setIndex, weightKg: r.weightKg == null ? null : Number(r.weightKg), reps: r.reps, rir: r.rir, feel: r.feel, note: r.note, revision: r.revision });

/**
 * Registra o edita una serie. Idempotente por clave (sesión, ejercicio, serie). Con `baseRevision` detecta ediciones
 * concurrentes de otro dispositivo: si los valores difieren se guarda el conflicto con ambas versiones y no se pisa nada.
 */
export async function logSet(userId: string, sessionId: string, p: SetInput, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(p.id)) throw new AccessError("invalid", "Identificador de serie inválido.");
  if (p.weightKg != null && (!WEIGHT_RE.test(String(p.weightKg)) || p.weightKg > 1000)) throw new AccessError("invalid", "El peso no es válido.");
  // DATA-1 (QA 29/10): en series por tiempo `reps` son segundos (D148); el tope de 200 va para repeticiones (ver abajo).
  if (p.reps != null && (!Number.isInteger(p.reps) || p.reps < 0 || p.reps > MAX_TIMED_SEC)) throw new AccessError("invalid", "Las repeticiones no son válidas.");
  if (p.rir != null && (!Number.isInteger(p.rir) || p.rir < 0 || p.rir > 5)) throw new AccessError("invalid", "El RIR va de 0 a 4+.");
  if (p.feel != null && !isSetFeel(p.feel)) throw new AccessError("invalid", "Elegí cómo se sintió la serie.");
  const feel = (p.feel ?? null) as SetFeel | null;
  const note = cleanSetNote(p.note);
  const at = clampClientTime(p.at, now);
  if (at === "invalid") throw BAD_TIME();
  const res = await db.transaction(async (tx) => {
    const s = await mySession(userId, sessionId, tx, true);
    if (s.status === "abandoned") throw new AccessError("closed", "Esta sesión fue descartada.", 409);
    // D195: una sesión anulada no recibe cambios (un teléfono atrasado no la revive); se restaura desde el historial.
    if (s.status === "voided") throw new AccessError("voided", "Anulaste este entrenamiento. Restauralo desde tu historial para cambiarlo.", 409);
    await assertRelationActive(tx, s);
    if (s.gymMemberId && !(await isSoloSession(tx, s))) await gymPresence(tx, userId, s.gymMemberId, "gym.workout.log_set", now, at, s.presenceCheckinId);
    let [pe] = await tx.select().from(programExercise).where(and(eq(programExercise.id, p.programExerciseId), eq(programExercise.dayId, s.dayId)));
    // DATA-5: también un ejercicio de la rutina anterior que ya tiene series en esta sesión (quedó tras «Aplicar ahora»).
    if (!pe && (await tx.select({ id: setLog.id }).from(setLog).where(and(eq(setLog.sessionId, sessionId), eq(setLog.programExerciseId, p.programExerciseId))).limit(1)).length)
      [pe] = await tx.select().from(programExercise).where(eq(programExercise.id, p.programExerciseId));
    if (!pe) throw new AccessError("invalid", "Ese ejercicio no es parte de esta sesión.");
    if (!Number.isInteger(p.setIndex) || p.setIndex < 0 || p.setIndex >= pe.sets) throw new AccessError("invalid", "Esa serie no está prescripta.");
    // D183: la fila del plan dice si son segundos (serie por tiempo) o un total de un AMRAP por tiempo; si no, el tope es 200.
    const flags = rowFlags({ sets: pe.sets, reps: pe.reps, detail: pe.detail as ExerciseDetail | null }, p.setIndex);
    if (p.reps != null && p.reps > MAX_REPS && !flags.timed && !flags.durationSec) throw new AccessError("invalid", "Las repeticiones no son válidas.");
    const ref = rowRef(pe.detail as ExerciseDetail | null, pe.sets, p.setIndex);
    const [ex] = await tx.select().from(setLog).where(and(eq(setLog.sessionId, sessionId), eq(setLog.programExerciseId, pe.id), eq(setLog.setIndex, p.setIndex))).for("update");
    const server = ex ? { id: ex.id, revision: ex.revision, weightKg: ex.weightKg == null ? null : Number(ex.weightKg), reps: ex.reps, rir: ex.rir, feel: ex.feel, note: ex.note } : null;
    // Sin baseRevision (edición en línea inmediata) se asume la revisión vigente del mismo registro.
    const base = p.baseRevision ?? (ex && ex.id === p.id ? ex.revision : 0);
    const d = decideSetWrite(server, { id: p.id, baseRevision: base, weightKg: p.weightKg, reps: p.reps, rir: p.rir, feel, note });
    const w = p.weightKg == null ? null : String(p.weightKg);
    if (d.kind === "noop") return { ...setOut(ex!), status: "ok" as const, raise: null };
    if (d.kind === "conflict") {
      const key = `${pe.id}:${p.setIndex}`;
      const client = { id: p.id, weightKg: p.weightKg, reps: p.reps, rir: p.rir, feel, note, baseRevision: base, at: at.toISOString() };
      const [c] = await tx.insert(syncConflict).values({ userId, sessionId, kind: "set", targetKey: key, serverPayload: server!, clientPayload: client })
        .onConflictDoUpdate({ target: [syncConflict.sessionId, syncConflict.targetKey], targetWhere: sql`status = 'open'`, set: { serverPayload: server!, clientPayload: client } })
        .returning();
      await audit(tx, { actorUserId: userId, action: "sync.conflict", resourceType: "set_log", resourceId: ex!.id, meta: { reason: d.reason } });
      return { ...setOut(ex!), status: "conflict" as const, conflictId: c.id, reason: d.reason, raise: null };
    }
    // Con reemplazo vigente, la serie nueva queda con el ejercicio realmente hecho (historial y récords correctos).
    const [chg] = d.kind === "insert" ? await tx.select({ sub: sessionExerciseChange.substituteExerciseId }).from(sessionExerciseChange)
      .where(and(eq(sessionExerciseChange.sessionId, sessionId), eq(sessionExerciseChange.programExerciseId, pe.id))) : [];
    const [row] = d.kind === "insert"
      ? await tx.insert(setLog).values({ id: p.id, sessionId, programExerciseId: pe.id, exerciseId: chg?.sub ?? pe.exerciseId, setIndex: p.setIndex, weightKg: w, reps: p.reps, rir: p.rir, feel, note, completedAt: at,
        specId: ref?.id ?? null, setKind: ref?.kind ?? null, blockIndex: ref?.block ?? null, stageIndex: ref?.stage ?? null }).returning()
      : await tx.update(setLog).set({ weightKg: w, reps: p.reps, rir: p.rir, feel, note, revision: ex!.revision + 1, updatedAt: now }).where(eq(setLog.id, ex!.id)).returning();
    await tx.update(workoutSession).set({ updatedAt: now }).where(eq(workoutSession.id, sessionId));
    // Sólo una sensación nueva que pide atención dispara aviso al piso (y sólo en el programa del gym).
    const raise = feel && FEEL_ALERTS.includes(feel) && feel !== (ex?.feel ?? null) && s.gymMemberId
      ? { gymMemberId: s.gymMemberId, sessionId, setLogId: row.id, exerciseName: pe.name, feel, at } : null;
    return { ...setOut(row), status: "ok" as const, raise };
  });
  // Aviso al piso después de confirmar la serie: la serie nunca depende del push. Import diferido (evita ciclo).
  const { raise, ...base } = res;
  // D191: Training Intelligence después de confirmar la serie: fija la decisión del objetivo y, si corresponde, ajusta los de
  // las filas siguientes (sólo mantener o bajar). Una falla acá nunca afecta el registro.
  const intel = base.status === "ok" ? await import("./intelligence").then((m) => m.afterSetLogged(userId, sessionId, p.programExerciseId, p.setIndex, now)).catch(() => null) : null;
  const out = { ...base, intel };
  if (!raise) return { ...out, alert: null };
  const { raiseFloorAlert } = await import("../gym/alerts");
  return { ...out, alert: await raiseFloorAlert(raise, now).catch(() => null) };
}

export async function listConflicts(userId: string, sessionId?: string) {
  const rows = await db.select().from(syncConflict).where(and(eq(syncConflict.userId, userId), eq(syncConflict.status, "open"), sessionId ? eq(syncConflict.sessionId, sessionId) : undefined));
  return rows.map((r) => ({ id: r.id, sessionId: r.sessionId, kind: r.kind, targetKey: r.targetKey, server: r.serverPayload, client: r.clientPayload, createdAt: r.createdAt }));
}

/** La persona elige qué versión queda. La otra queda registrada en el conflicto resuelto (auditable). */
export async function resolveConflict(userId: string, conflictId: string, keep: "local" | "server") {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(syncConflict).where(and(eq(syncConflict.id, conflictId), eq(syncConflict.userId, userId))).for("update");
    if (!c) throw NOT_FOUND();
    if (c.status !== "open") return { status: c.status };
    if (keep === "local" && c.kind === "set") {
      const [peId, idx] = c.targetKey.split(":");
      const cl = c.clientPayload as { weightKg: number | null; reps: number | null; rir: number | null; feel?: string | null; note?: string | null };
      const [ex] = await tx.select().from(setLog).where(and(eq(setLog.sessionId, c.sessionId), eq(setLog.programExerciseId, peId), eq(setLog.setIndex, Number(idx)))).for("update");
      if (ex) await tx.update(setLog).set({ weightKg: cl.weightKg == null ? null : String(cl.weightKg), reps: cl.reps, rir: cl.rir, feel: cl.feel ?? null, note: cl.note ?? null, revision: ex.revision + 1, updatedAt: new Date() }).where(eq(setLog.id, ex.id));
    }
    const status = keep === "local" ? "kept_local" as const : "kept_server" as const;
    await tx.update(syncConflict).set({ status, resolvedAt: new Date() }).where(eq(syncConflict.id, c.id));
    await audit(tx, { actorUserId: userId, action: "sync.resolved", resourceType: "sync_conflict", resourceId: c.id, meta: { keep } });
    return { status };
  });
}

// ── Saltar o reemplazar un ejercicio en esta sesión (F-HX-21, D106) ─────────
/** Alternativas compatibles para un ejercicio de la sesión: biblioteca global + la de la organización del programa. */
export async function sessionAlternatives(userId: string, sessionId: string, programExerciseId: string) {
  const s = await mySession(userId, sessionId);
  const [pe] = await db.select({ pe: programExercise, kind: exercise.kind, group: exercise.muscleGroup }).from(programExercise).innerJoin(exercise, eq(exercise.id, programExercise.exerciseId))
    .where(and(eq(programExercise.id, programExerciseId), eq(programExercise.dayId, s.dayId)));
  if (!pe) throw new AccessError("invalid", "Ese ejercicio no es parte de esta sesión.");
  const orgId = await sessionOrg(s.versionId);
  const lib = await db.select({ id: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup, kind: exercise.kind }).from(exercise)
    .where(visibleIn(orgId, userId));
  // Reemplazos aprobados por el coach o el gimnasio (Adaptive Coach 1b): primero y marcados, sin habilitar incompatibles.
  const approved = await db.select({ id: exerciseSubstitution.substituteExerciseId, note: exerciseSubstitution.note }).from(exerciseSubstitution)
    .where(and(eq(exerciseSubstitution.orgId, orgId), eq(exerciseSubstitution.exerciseId, pe.pe.exerciseId))).orderBy(asc(exerciseSubstitution.createdAt));
  const list = withApproved(rankAlternatives({ id: pe.pe.exerciseId, kind: pe.kind, muscleGroup: pe.group }, lib), approved).slice(0, 60);
  const prev = await lastSetByExercise(userId, list.map((x) => x.id), s.id);
  const [o] = await db.select({ kind: organization.kind }).from(organization).where(eq(organization.id, orgId));
  return { group: pe.group, approvedBy: o?.kind ?? null, alternatives: list.map((x) => ({ ...x, sameGroup: x.muscleGroup === pe.group, prev: prev.get(x.id) ? { weightKg: prev.get(x.id)!.weightKg, reps: prev.get(x.id)!.reps } : null })) };
}
/**
 * D138: alternativas para varios ejercicios de un día (para que la IA de «No vino el profe» rearme la rutina cuando algo no
 * se puede). Mismo criterio que en la sesión: compatibles por tipo de registro, aprobados por el profe primero. Sin los que
 * ya están en el día.
 */
// Palabras que no dicen qué movimiento es (equipamiento y conectores): no cuentan para el parecido.
const STOP_WORDS = new Set(["con", "del", "las", "los", "una", "barra", "mancuerna", "mancuernas", "maquina", "polea", "banda", "elastica", "disco", "multipower", "smith", "kettlebell", "cable", "apoyo", "banco"]);
export async function dayAlternatives(userId: string, dayId: string, perExercise = 5) {
  const rows = await db.select({ peId: programExercise.id, exerciseId: programExercise.exerciseId, kind: exercise.kind, group: exercise.muscleGroup, versionId: programDay.versionId })
    .from(programExercise).innerJoin(exercise, eq(exercise.id, programExercise.exerciseId)).innerJoin(programDay, eq(programDay.id, programExercise.dayId))
    .where(eq(programExercise.dayId, dayId));
  const out = new Map<string, { exerciseId: string; name: string; approved: boolean; note: string | null; prev: { weightKg: number | null; reps: number | null } | null }[]>();
  if (!rows.length) return out;
  const orgId = await sessionOrg(rows[0].versionId);
  const lib = await db.select({ id: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup, kind: exercise.kind }).from(exercise)
    .where(visibleIn(orgId, userId));
  const subs = await db.select({ ex: exerciseSubstitution.exerciseId, id: exerciseSubstitution.substituteExerciseId, note: exerciseSubstitution.note }).from(exerciseSubstitution)
    .where(and(eq(exerciseSubstitution.orgId, orgId), inArray(exerciseSubstitution.exerciseId, rows.map((r) => r.exerciseId)))).orderBy(asc(exerciseSubstitution.createdAt));
  const inDay = new Set(rows.map((r) => r.exerciseId));
  // Entre los compatibles, primero los de nombre parecido al original (press → press con mancuernas), así la lista corta
  // que ve la IA trae los reemplazos naturales y no sólo el orden alfabético.
  const words = (x: string) => new Set(x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
  const nameOf = new Map(lib.map((x) => [x.id, x.name]));
  const lists = rows.map((r) => {
    const own = words(nameOf.get(r.exerciseId) ?? "");
    const near = (x: { name: string }) => [...words(x.name)].filter((w) => own.has(w)).length;
    const ranked = rankAlternatives({ id: r.exerciseId, kind: r.kind, muscleGroup: r.group }, lib.filter((x) => !inDay.has(x.id)))
      .map((x, i) => ({ x, i, k: (x.muscleGroup === r.group ? 10 : 0) + near(x) })).sort((a, b) => b.k - a.k || a.i - b.i).map((y) => y.x);
    return { peId: r.peId, list: withApproved(ranked, subs.filter((x) => x.ex === r.exerciseId)).slice(0, perExercise) };
  });
  const prev = await lastSetByExercise(userId, [...new Set(lists.flatMap((l) => l.list.map((x) => x.id)))]);
  for (const l of lists) out.set(l.peId, l.list.map((x) => ({ exerciseId: x.id, name: x.name, approved: x.approved, note: x.approvedNote, prev: prev.get(x.id) ? { weightKg: prev.get(x.id)!.weightKg, reps: prev.get(x.id)!.reps } : null })));
  return out;
}
/** Organización del programa de la sesión. Dentro de una transacción, con su `tx`: otra conexión del pool mientras la transacción
 * retiene la suya puede quedar esperando para siempre si el pool se agota (hallazgo 15 de la revisión AC3). */
async function sessionOrg(versionId: string, q: Tx | typeof db = db) {
  const [r] = await q.select({ org: program.orgId }).from(programVersion).innerJoin(program, eq(program.id, programVersion.programId)).where(eq(programVersion.id, versionId));
  return r.org;
}

/**
 * Saltar (con motivo) o reemplazar por otro ejercicio compatible; `change: null` vuelve al original. Sólo con la sesión
 * abierta y el acceso vigente. Las series ya hechas no cambian; las que se registren después usan el ejercicio elegido.
 */
export async function setExerciseChange(userId: string, sessionId: string, p: {
  programExerciseId: string; change: { kind: "skip" | "substitute"; reason: ExerciseChangeReason; exerciseId?: string | null } | null;
}, now = new Date()) {
  return db.transaction(async (tx) => {
    const s = await mySession(userId, sessionId, tx, true);
    if (s.status !== "in_progress" && s.status !== "paused") throw new AccessError("closed", "Este entrenamiento ya terminó.", 409);
    await assertRelationActive(tx, s);
    if (s.gymMemberId && !(await isSoloSession(tx, s))) await gymPresence(tx, userId, s.gymMemberId, "gym.workout.log_set", now, now, s.presenceCheckinId);
    const [pe] = await tx.select({ pe: programExercise, kind: exercise.kind }).from(programExercise).innerJoin(exercise, eq(exercise.id, programExercise.exerciseId))
      .where(and(eq(programExercise.id, p.programExerciseId), eq(programExercise.dayId, s.dayId)));
    if (!pe) throw new AccessError("invalid", "Ese ejercicio no es parte de esta sesión.");
    const where = and(eq(sessionExerciseChange.sessionId, s.id), eq(sessionExerciseChange.programExerciseId, pe.pe.id));
    if (!p.change) {
      const del = await tx.delete(sessionExerciseChange).where(where).returning();
      if (del.length) await audit(tx, { actorUserId: userId, action: "session.exercise_restored", resourceType: "workout_session", resourceId: s.id, meta: { programExerciseId: pe.pe.id } });
      return { change: null };
    }
    if (!isChangeReason(p.change.reason)) throw new AccessError("invalid", "Elegí el motivo.");
    let sub: { id: string; name: string } | null = null;
    if (p.change.kind === "substitute") {
      const orgId = await sessionOrg(s.versionId, tx);
      const [x] = await tx.select({ id: exercise.id, name: exercise.name, kind: exercise.kind }).from(exercise)
        .where(and(eq(exercise.id, p.change.exerciseId ?? ""), visibleIn(orgId, userId)));
      if (!x) throw new AccessError("invalid", "Ese ejercicio no está en la biblioteca.");
      if (x.id === pe.pe.exerciseId || x.kind !== pe.kind) throw new AccessError("invalid", "Elegí un ejercicio distinto que se registre igual (cargas, peso corporal o tiempo).");
      sub = x;
    } else if (p.change.kind !== "skip") throw new AccessError("invalid", "Cambio no válido.");
    const values = { kind: p.change.kind, reason: p.change.reason, substituteExerciseId: sub?.id ?? null, updatedAt: now };
    await tx.insert(sessionExerciseChange).values({ sessionId: s.id, programExerciseId: pe.pe.id, ...values })
      .onConflictDoUpdate({ target: [sessionExerciseChange.sessionId, sessionExerciseChange.programExerciseId], set: values });
    await audit(tx, { actorUserId: userId, action: `session.exercise_${p.change.kind}`, resourceType: "workout_session", resourceId: s.id,
      meta: { programExerciseId: pe.pe.id, reason: p.change.reason, ...(sub ? { substitute: sub.id } : {}) } });
    return { change: { kind: p.change.kind, reason: p.change.reason, substitute: sub ? { exerciseId: sub.id, name: sub.name } : null } };
  });
}

/** D184: filas omitidas vigentes de un ejercicio (las que no tienen registro). */
export const skippedRows = (e: { logs: { setIndex: number }[]; skips?: { setIndex: number; skipped: boolean }[] }) =>
  (e.skips ?? []).filter((k) => k.skipped && !e.logs.some((l) => l.setIndex === k.setIndex)).map((k) => k.setIndex);

/**
 * D184: omitir una etapa conectada («Terminar la serie acá») o deshacer la omisión. Idempotente por (sesión, ejercicio, fila).
 * Sólo etapas (drop, mini serie, bloque de cluster), nunca una serie principal. Entre dispositivos gana el cambio más
 * reciente; si la etapa tiene un resultado, el resultado manda y la omisión no se aplica (nunca pisa lo registrado).
 * También con el entrenamiento terminado: corregir una omisión es corregir el registro, como editar una serie.
 */
export async function setStageSkip(userId: string, sessionId: string, p: { programExerciseId: string; setIndex: number; skipped: boolean; at?: string }, now = new Date()) {
  const at = clampClientTime(p.at, now);
  if (at === "invalid") throw BAD_TIME();
  return db.transaction(async (tx) => {
    const s = await mySession(userId, sessionId, tx, true); // bloquea la sesión: los cambios de la misma sesión van en fila
    if (s.status === "abandoned") throw new AccessError("closed", "Esta sesión fue descartada.", 409);
    // D195: una sesión anulada no recibe cambios (un teléfono atrasado no la revive); se restaura desde el historial.
    if (s.status === "voided") throw new AccessError("voided", "Anulaste este entrenamiento. Restauralo desde tu historial para cambiarlo.", 409);
    await assertRelationActive(tx, s);
    if (s.gymMemberId && !(await isSoloSession(tx, s))) await gymPresence(tx, userId, s.gymMemberId, "gym.workout.log_set", now, at, s.presenceCheckinId);
    let [pe] = await tx.select().from(programExercise).where(and(eq(programExercise.id, p.programExerciseId), eq(programExercise.dayId, s.dayId)));
    if (!pe && (await tx.select({ id: setLog.id }).from(setLog).where(and(eq(setLog.sessionId, sessionId), eq(setLog.programExerciseId, p.programExerciseId))).limit(1)).length)
      [pe] = await tx.select().from(programExercise).where(eq(programExercise.id, p.programExerciseId));
    if (!pe) throw new AccessError("invalid", "Ese ejercicio no es parte de esta sesión.");
    const ref = Number.isInteger(p.setIndex) && p.setIndex < pe.sets ? rowRef(pe.detail as ExerciseDetail | null, pe.sets, p.setIndex) : null;
    if (!ref) throw new AccessError("invalid", "Esa serie no está prescripta.");
    if (ref.stage === 0) throw new AccessError("invalid", "Sólo se puede dejar sin hacer una etapa conectada (drop o mini serie), no una serie.");
    const [logged] = await tx.select({ id: setLog.id }).from(setLog).where(and(eq(setLog.sessionId, sessionId), eq(setLog.programExerciseId, pe.id), eq(setLog.setIndex, p.setIndex)));
    const [cur] = await tx.select().from(setSkip).where(and(eq(setSkip.sessionId, sessionId), eq(setSkip.programExerciseId, pe.id), eq(setSkip.setIndex, p.setIndex)));
    const d = decideSkip(cur ? { skipped: cur.skipped, changedAt: cur.changedAt.toISOString() } : null, !!logged, { skipped: !!p.skipped, changedAt: at.toISOString() });
    if (d.apply) {
      const values = { skipped: !!p.skipped, changedAt: at, specId: ref.id, updatedAt: now };
      await tx.insert(setSkip).values({ sessionId, programExerciseId: pe.id, setIndex: p.setIndex, ...values })
        .onConflictDoUpdate({ target: [setSkip.sessionId, setSkip.programExerciseId, setSkip.setIndex], set: values });
      await tx.update(workoutSession).set({ updatedAt: now }).where(eq(workoutSession.id, sessionId));
      await audit(tx, { actorUserId: userId, action: p.skipped ? "session.stage_skipped" : "session.stage_restored", resourceType: "workout_session", resourceId: s.id,
        meta: { programExerciseId: pe.id, setIndex: p.setIndex, specId: ref.id } });
    }
    return { setIndex: p.setIndex, skipped: d.effective, changedAt: d.apply ? at.toISOString() : cur?.changedAt.toISOString() ?? null, logged: !!logged, applied: d.apply, reason: d.reason };
  });
}

/**
 * D184: intervalo EMOM en curso (o ninguno). El teléfono manda su hora de inicio y la hora a la que envía (las dos de su
 * reloj): el servidor la traduce a su hora, así que funciona aunque el pedido haya esperado en la cola o el reloj esté mal.
 * Gana el cambio más reciente. Un intervalo viejo o imposible no se guarda (no se inventa tiempo). Sin sesión abierta, nada.
 */
export async function setSessionInterval(userId: string, sessionId: string, p: {
  state: { peId: string; block: number; startedAt: string; emomSec: number; status: "running" | "interrupted" } | null; at: string; sentAt: string;
}, now = new Date()) {
  const sent = Date.parse(p.sentAt), at = Date.parse(p.at);
  if (!Number.isFinite(sent) || !Number.isFinite(at)) throw BAD_TIME();
  return db.transaction(async (tx) => {
    const s = await mySession(userId, sessionId, tx, true);
    const cur = (s.intervalState as IntervalState | null) ?? null;
    if (s.status !== "in_progress" && s.status !== "paused") return { interval: null, applied: false, serverNow: now.toISOString() };
    await assertRelationActive(tx, s);
    const atMs = Math.min(toServerMs(at, sent, now.getTime()), now.getTime());
    if (!newerThan(cur, atMs)) return { interval: cur, applied: false, serverNow: now.toISOString() };
    let next: IntervalState | null = null;
    if (p.state) {
      const [pe] = await tx.select({ id: programExercise.id, detail: programExercise.detail }).from(programExercise).where(and(eq(programExercise.id, p.state.peId), eq(programExercise.dayId, s.dayId)));
      if (!pe || !(pe.detail as ExerciseDetail | null)?.emomSec) throw new AccessError("invalid", "Ese ejercicio no es un EMOM de esta sesión.");
      next = acceptInterval({ ...p.state, at: p.at, sentAt: p.sentAt }, now.getTime());
      if (!next) return { interval: cur, applied: false, reason: "stale", serverNow: now.toISOString() };
    }
    await tx.update(workoutSession).set({ intervalState: next, updatedAt: now }).where(eq(workoutSession.id, s.id));
    return { interval: next, applied: true, serverNow: now.toISOString() };
  });
}

/**
 * D145: aplicar a un entrenamiento abierto la versión nueva que guardó el coach. Mismo día (por posición) en la versión
 * vigente; las series ya hechas se mueven al mismo ejercicio de la versión nueva (matchProgramExercises) y los cambios de
 * la sesión (saltar/reemplazar) también. Lo que no tiene pareja queda registrado con la versión anterior. Pide que no haya
 * conflictos abiertos: el teléfono sincroniza antes de pedirlo.
 */
export async function upgradeSession(userId: string, sessionId: string, now = new Date()) {
  const res = await db.transaction(async (tx) => {
    const s = await mySession(userId, sessionId, tx, true);
    if (s.status !== "in_progress" && s.status !== "paused") throw new AccessError("closed", "Este entrenamiento ya terminó.", 409);
    await assertRelationActive(tx, s);
    // D193: la versión vigente puede ser de otra asignación (el profe le reasignó el programa con el entrenamiento abierto).
    const live = await liveAssignment(tx, s);
    if (!live) throw new AccessError("no_program", "Tu programa ya no está asignado.", 409);
    const cur = { v: live.versionId };
    if (cur.v === s.versionId) return { changed: false, moved: 0, kept: [] as string[] };
    const [{ n: open }] = await tx.select({ n: sql<number>`count(*)::int` }).from(syncConflict).where(and(eq(syncConflict.sessionId, s.id), eq(syncConflict.status, "open")));
    if (open) throw new AccessError("conflicts", "Resolvé primero las series con dos versiones.", 409);
    const [oldDay] = await tx.select().from(programDay).where(eq(programDay.id, s.dayId));
    const oldEx = await tx.select().from(programExercise).where(eq(programExercise.dayId, s.dayId)).orderBy(asc(programExercise.position));
    // QA 29/10 (DATA-5): el día equivalente es el del mismo nombre o, si no, el que más ejercicios comparte; la posición
    // sólo desempata. Antes era sólo la posición: si el coach reordenaba los días, el entrenamiento cambiaba de día.
    const newDays = await tx.select().from(programDay).where(eq(programDay.versionId, cur.v));
    const newExAll = newDays.length ? await tx.select().from(programExercise).where(inArray(programExercise.dayId, newDays.map((d) => d.id))).orderBy(asc(programExercise.position)) : [];
    const oldIds = new Set(oldEx.map((e) => e.exerciseId));
    const score = (d: typeof newDays[number]) => (d.name.trim().toLowerCase() === oldDay.name.trim().toLowerCase() ? 1000 : 0)
      + newExAll.filter((e) => e.dayId === d.id && oldIds.has(e.exerciseId)).length * 10 + (d.position === oldDay.position ? 1 : 0);
    const newDay = newDays.map((d) => ({ d, k: score(d) })).filter((x) => x.k > 0).sort((a, b) => b.k - a.k)[0]?.d;
    if (!newDay) throw new AccessError("day_removed", "Ese día ya no está en tu rutina nueva: terminá este entrenamiento y seguí con la nueva.", 409);
    const newEx = newExAll.filter((e) => e.dayId === newDay.id);
    const map = matchProgramExercises(oldEx, newEx);
    let moved = 0;
    for (const [from, to] of Object.entries(map)) {
      moved += (await tx.update(setLog).set({ programExerciseId: to, updatedAt: now }).where(and(eq(setLog.sessionId, s.id), eq(setLog.programExerciseId, from))).returning({ id: setLog.id })).length;
      await tx.update(sessionExerciseChange).set({ programExerciseId: to, updatedAt: now }).where(and(eq(sessionExerciseChange.sessionId, s.id), eq(sessionExerciseChange.programExerciseId, from)));
      await tx.update(setSkip).set({ programExerciseId: to, updatedAt: now }).where(and(eq(setSkip.sessionId, s.id), eq(setSkip.programExerciseId, from))); // D184
    }
    // D184: el intervalo EMOM sigue con el mismo ejercicio en la versión nueva; si ya no está, se corta.
    const iv = (s.intervalState as IntervalState | null) ?? null;
    const ivNext = iv && map[iv.peId] ? { ...iv, peId: map[iv.peId] } : null;
    const logged = new Set((await tx.select({ pe: setLog.programExerciseId }).from(setLog).where(eq(setLog.sessionId, s.id))).map((r) => r.pe));
    const kept = oldEx.filter((e) => !map[e.id] && logged.has(e.id)).map((e) => e.name);
    await tx.update(programVersion).set({ locked: true }).where(eq(programVersion.id, cur.v));
    await tx.update(workoutSession).set({ assignmentId: live.assignmentId, versionId: cur.v, dayId: newDay.id, dayName: newDay.name, intervalState: ivNext, revision: s.revision + 1, updatedAt: now }).where(eq(workoutSession.id, s.id));
    await audit(tx, { actorUserId: userId, action: "session.upgraded", resourceType: "workout_session", resourceId: s.id, meta: { from: s.versionId, to: cur.v, moved, kept: kept.length, reassigned: live.assignmentId !== s.assignmentId } });
    return { changed: true, moved, kept };
  });
  return { ...res, session: await getSession(userId, sessionId, now) };
}

export async function sessionAction(userId: string, sessionId: string, action: "pause" | "resume" | "finish", now = new Date(), clientAt?: string) {
  const at = clampClientTime(clientAt, now);
  if (at === "invalid") throw BAD_TIME();
  const r = await db.transaction(async (tx) => {
    const s = await mySession(userId, sessionId, tx, true);
    if (action !== "finish") await assertRelationActive(tx, s);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(setLog).where(eq(setLog.sessionId, s.id));
    // Sin series no hay sesión que registrar: finalizar descarta (T15). Repetir una acción ya aplicada no cambia nada.
    const next = applySessionAction(s, action, clientAt ? at : now, n > 0);
    if (!next) return { status: s.status, revision: s.revision };
    // D184: pausar interrumpe el intervalo EMOM en curso (no sigue corriendo); terminar lo cierra.
    const iv = (s.intervalState as IntervalState | null) ?? null;
    const intervalState = action === "pause" ? interruptInterval(iv, now.toISOString()) : action === "finish" ? null : iv;
    await tx.update(workoutSession).set({ ...next, intervalState, revision: s.revision + 1, updatedAt: now }).where(eq(workoutSession.id, s.id));
    return { status: next.status, revision: s.revision + 1 };
  });
  // Logros de entrenamiento (F-GC-05) después de confirmar la sesión. Import diferido: evita un ciclo de módulos.
  // D191: objetivos de filas que no se hicieron quedan «no hecho» (nunca se borran ni se recalculan).
  if (r.status === "completed" || r.status === "abandoned") await import("./intelligence").then((m) => m.closeTargets(sessionId, now)).catch(() => null);
  if (r.status === "completed") {
    const { awardTrainingAchievements } = await import("../community/services");
    return { ...r, achievements: await awardTrainingAchievements(userId, now).catch(() => []) };
  }
  return r;
}

/**
 * D160: cierra los entrenamientos olvidados (cron de cada minuto). En el gimnasio, fuera del horario (a las 22 o si quedaron de
 * otro día); en cualquier caso, tras 6 horas sin actividad. Termina en la última actividad (no suma las horas de abandono):
 * con series queda completado, sin series se descarta, como «Finalizar». Si el teléfono manda después una serie de ese
 * entrenamiento, la conserva y la persona decide (QA 29/10, DATA-7).
 */
export async function closeIdleWorkouts(now = new Date()) {
  const lastSet = sql<string | null>`(select max(${setLog.completedAt}) from ${setLog} where ${setLog.sessionId} = ${workoutSession.id})`;
  const open = await db.select({ s: workoutSession, isDemo: organization.isDemo, lastSet }).from(workoutSession)
    .leftJoin(gymMember, eq(gymMember.id, workoutSession.gymMemberId)).leftJoin(organization, eq(organization.id, gymMember.orgId))
    .where(inArray(workoutSession.status, ["in_progress", "paused"]));
  let closed = 0;
  for (const r of open) {
    const lastActivityAt = new Date(Math.max(r.s.startedAt.getTime(), r.s.lastResumedAt?.getTime() ?? 0, r.lastSet ? new Date(r.lastSet).getTime() : 0));
    const gymHours = !!r.s.gymMemberId && r.isDemo === false && process.env.REPI_GYM_HOURS !== "off";
    if (!workoutAutoClose({ startedAt: r.s.startedAt, lastActivityAt, gymHours }, now)) continue;
    const status = await db.transaction(async (tx) => {
      const [s] = await tx.select().from(workoutSession).where(eq(workoutSession.id, r.s.id)).for("update");
      if (!s || s.revision !== r.s.revision) return null; // la persona lo tocó mientras tanto: queda para la próxima vuelta
      const next = applySessionAction(s, "finish", lastActivityAt, !!r.lastSet);
      if (!next) return null;
      await tx.update(workoutSession).set({ ...next, intervalState: null, revision: s.revision + 1, updatedAt: now }).where(eq(workoutSession.id, s.id));
      await audit(tx, { actorUserId: null, action: "workout.auto_closed", resourceType: "workout_session", resourceId: s.id,
        meta: { status: next.status, reason: gymHours && now.getTime() - lastActivityAt.getTime() < WORKOUT_IDLE_CLOSE_MS ? "gym_hours" : "idle" } });
      return next.status;
    });
    if (!status) continue;
    closed++;
    if (status === "completed") {
      const { awardTrainingAchievements } = await import("../community/services");
      await awardTrainingAchievements(r.s.userId, now).catch(() => []);
    }
  }
  return closed;
}

export async function sessionFeedback(userId: string, sessionId: string, p: { rpe: number; note?: string | null }) {
  if (!Number.isInteger(p.rpe) || p.rpe < 1 || p.rpe > 10) throw new AccessError("invalid", "Elegí el esfuerzo de la sesión.");
  const s = await mySession(userId, sessionId);
  if (s.status !== "completed") throw new AccessError("invalid", "Terminá el entrenamiento antes de enviar la nota.", 409);
  await db.update(workoutSession).set({ rpe: p.rpe, note: p.note?.trim().slice(0, 1000) || null, updatedAt: new Date() }).where(eq(workoutSession.id, s.id));
  return { ok: true };
}

/** Resumen derivado de series persistidas: nada de valores fijos (C25). */
export async function sessionSummary(userId: string, sessionId: string) {
  const s = await getSession(userId, sessionId);
  // Un ejercicio salteado cuenta como resuelto (no completo); las series hechas con un reemplazo cuentan para el reemplazo.
  // D183: «completo» = todas sus series principales registradas (una etapa omitida no lo deja incompleto). Las series que se
  // muestran son las principales; etapas y aproximación van aparte (metrics.ts).
  const full = (e: (typeof s.exercises)[number]) => exerciseComplete(e as { sets: number; reps: string; detail: ExerciseDetail | null }, (k) => e.logs.some((l) => l.setIndex === k));
  const exDone = s.exercises.filter(full).length;
  const exSkipped = s.exercises.filter((e) => e.change?.kind === "skip" && !full(e)).length;
  const metrics = sessionMetrics(s.exercises.map((e) => ({ ex: e as { sets: number; reps: string; detail: ExerciseDetail | null }, logs: e.logs, skipped: skippedRows(e) })));
  const setsDone = metrics.mainDone + metrics.warmupDone;
  const setsTotal = metrics.mainPlanned + metrics.warmupPlanned;
  const prs = [];
  for (const e of s.exercises) {
    for (const exId of new Set(e.logs.map((l) => l.exerciseId))) {
      const mine = e.logs.filter((l) => l.exerciseId === exId);
      const before = await db.select({ l: setLog }).from(setLog).innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId))
        .where(and(eq(workoutSession.userId, userId), eq(setLog.exerciseId, exId), ne(workoutSession.id, s.id), lt(setLog.completedAt, s.startedAt),
          inArray(workoutSession.status, ["completed"]), isNull(setLog.voidedAt)));
      const timedBefore = await timedPeIds(before.map((b) => b.l.programExerciseId));
      const cur = (l: (typeof mine)[number]) => rowFlags(e as { sets: number; reps: string; detail: ExerciseDetail | null }, l.setIndex);
      const pr = detectPR(before.map((b) => toLogged(b.l, timedBefore)), mine.map((l) => ({ exerciseId: exId, weightKg: l.weightKg, reps: l.reps, completed: true, timed: cur(l).timed || undefined, warmup: cur(l).warmup || undefined, rounds: cur(l).rounds || undefined })));
      if (pr) {
        const prevAt = before.map((b) => b.l).find((l) => Number(l.weightKg) === pr.previous.weightKg && l.reps === pr.previous.reps)?.completedAt ?? null;
        prs.push({ exercise: exId === e.exerciseId ? e.name : e.change?.substitute?.name ?? e.name, ...pr, previousAt: prevAt });
      }
    }
  }
  return {
    ...s, exDone, exSkipped, exTotal: s.exercises.length, setsDone, setsTotal, prs, metrics,
    volumeKg: metrics.tonnageKg,
  };
}

/** Sesiones terminadas (activas) con series y volumen válidos. La app usa el historial de D195 (history.ts), que suma anuladas. */
export async function myHistory(userId: string) {
  const sessions = await db.select().from(workoutSession).where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed")))
    .orderBy(desc(workoutSession.endedAt)).limit(30);
  const sets = sessions.length ? await db.select().from(setLog).where(and(inArray(setLog.sessionId, sessions.map((s) => s.id)), isNull(setLog.voidedAt))) : [];
  const timed = await timedPeIds(sets.map((x) => x.programExerciseId));
  return sessions.map((s) => {
    const ss = sets.filter((x) => x.sessionId === s.id);
    // D183: «series» = series principales hechas (sin etapas conectadas ni aproximación).
    const main = ss.filter((x) => { const f = timed.flags?.(x.programExerciseId, x.setIndex); return !f || (f.stage === 0 && !f.warmup); }).length;
    return { id: s.id, dayName: s.dayName, endedAt: s.endedAt, durationSec: Math.floor(s.activeMs / 1000), sets: main, volumeKg: volumeKg(ss.map((x) => toLogged(x, timed))), rpe: s.rpe };
  });
}

/** F-CL-14: la versión anterior del programa vigente, para comparar después de una actualización. Sólo de la asignación propia. */
export async function previousVersion(userId: string) {
  const act = await myActive(userId);
  if (!act?.assignment) throw NOT_FOUND();
  const [p] = await db.select().from(program).where(eq(program.id, act.assignment.programId));
  const { version: cur } = await readVersion(p.currentVersionId!);
  if (cur.number <= 1) throw NOT_FOUND();
  const [prev] = await db.select({ id: programVersion.id }).from(programVersion).where(and(eq(programVersion.programId, p.id), eq(programVersion.number, cur.number - 1)));
  if (!prev) throw NOT_FOUND();
  const { version, doc } = await readVersion(prev.id);
  return {
    number: version.number, name: doc.name, weeks: doc.weeks, createdAt: version.createdAt,
    days: doc.days.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec })) })),
  };
}
