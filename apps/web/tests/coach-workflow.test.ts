// D192 · Flujo del entrenador (pedido de Urko): Load Set y tipos personalizados, copiar un día entre programas y alumnos, con
// permisos, versiones, idempotencia y sin datos cruzados. Servidor + base de prueba descartable (repi_test), sin simulaciones.
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyDetail, localDate, setTarget, type ExerciseDetail, type ProgramDoc, type SetSpec } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as dc from "@/server/training/day-copy";
import * as st from "@/server/training/set-types";
import * as gym from "@/server/gym/services";
import { DetailZ } from "@/server/training/detail-schema";
import { resetRateLimits } from "@/server/access/util";

const { setLog, programVersion, workoutSession, trainingTarget, trainingProposal } = schema;
let n = 0;
async function verified(name = "Persona CW") {
  const email = `cw${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
const EX: Record<string, string> = {};
beforeAll(async () => {
  for (const name of ["Press banca CW", "Remo con barra CW", "Press inclinado CW", "Elevaciones laterales CW", "Extensión de tríceps CW", "Sentadilla CW"]) {
    EX[name] = (await db.insert(schema.exercise).values({ name, muscleGroup: "Pecho" }).onConflictDoNothing().returning())[0]?.id
      ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

const S = (kind: SetSpec["kind"], reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });
const D = (setPlan: SetSpec[] | null, p: Partial<ExerciseDetail> = {}): ExerciseDetail => ({ ...emptyDetail(), technique: "custom", setPlan, ...p });
const ex = (name: string, sets: number, reps: string, detail?: ExerciseDetail | null, note: string | null = null) => ({ exerciseId: EX[name], name, sets, reps, rir: 2, restSec: 90, note, ...(detail ? { detail } : {}) });
/** Torso A del pedido: top set + Load Set + back-off + drop, superserie, circuito y notas. */
const torsoA = () => ({
  name: "Torso A", exercises: [
    ex("Press banca CW", 5, "6-8", D([S("top", "3-5", { weightKg: 80, note: "pausa abajo" }), S("work", "6-8", { label: "Load Set", weightKg: 72.5, rir: 2 }), S("backoff", "8-10", { weightKg: 65 }), S("backoff", "8-10", { weightKg: 65 }), S("drop", "al fallo", { weightKg: 50, restSec: 0 })], { technique: "top_backoff" }), "Ana: cuidá el hombro izquierdo"),
    ex("Remo con barra CW", 3, "8-10", D([S("work", "8-10", { weightKg: 60 }), S("work", "8-10", { weightKg: 60 }), S("work", "8-10", { weightKg: 60 })], { group: "A", groupKind: "superset" })),
    ex("Press inclinado CW", 3, "8-10", D([S("work", "8-10"), S("work", "8-10"), S("work", "8-10")], { group: "A", groupKind: "superset" })),
    ex("Elevaciones laterales CW", 3, "12-15", D([S("work", "12-15"), S("work", "12-15"), S("work", "12-15")], { group: "B", groupKind: "circuit", rounds: 3 })),
    ex("Extensión de tríceps CW", 3, "10-12", D([S("work", "10-12"), S("work", "10-12"), S("work", "10-12")], { group: "B", groupKind: "circuit", rounds: 3 })),
  ],
});
const program = (days: ProgramDoc["days"], name = "Hipertrofia"): ProgramDoc => ({ name, weeks: 4, note: "", days });

async function coachWorld() {
  const coach = await verified("Coach CW");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach CW ${n}-${Date.now()}` });
  const client = async (name: string) => {
    const u = await verified(name);
    const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
    const rel = await acc.acceptInvitation(u.id, inv.code, []);
    return { user: u.id, rel: rel.relationId };
  };
  const a = await client("Alumna A CW"), b = await client("Alumno B CW");
  const tplA = await tr.createTemplate(coach.id, org.id, program([torsoA(), { name: "Piernas", exercises: [ex("Sentadilla CW", 3, "5")] }]));
  await tr.assignProgram(coach.id, org.id, tplA, { coachClientIds: [a.rel], startsOn: localDate(new Date()) });
  const tplB = await tr.createTemplate(coach.id, org.id, program([{ name: "Día 1", exercises: [ex("Sentadilla CW", 3, "5", D([S("work", "5"), S("work", "5"), S("work", "5")], { group: "A", groupKind: "superset" }))] }, { name: "Día 2", exercises: [] }], "Fuerza B"));
  await tr.assignProgram(coach.id, org.id, tplB, { coachClientIds: [b.rel], startsOn: localDate(new Date()) });
  const progOf = async (rel: string) => (await db.select({ id: schema.program.id }).from(schema.programAssignment).innerJoin(schema.program, eq(schema.program.id, schema.programAssignment.programId))
    .where(and(eq(schema.programAssignment.coachClientId, rel), eq(schema.programAssignment.status, "active"))))[0].id;
  return { coach: coach.id, org: org.id, a: { ...a, pid: await progOf(a.rel) }, b: { ...b, pid: await progOf(b.rel) }, tplA, tplB };
}
const dayOf = async (user: string, i = 0) => { const t = await tr.myTraining(user); if (t.state !== "ready") throw new Error(t.state); return t.program.days[i].id; };
async function train(user: string, rows: { w: number | null; r: number }[][], day = 0) {
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: await dayOf(user, day) });
  const ses = await tr.getSession(user, sid);
  for (const [k, sets] of rows.entries()) for (const [i, x] of sets.entries())
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: ses.exercises[k].id, setIndex: i, weightKg: x.w, reps: x.r, rir: 2, feel: null });
  await tr.sessionAction(user, sid, "finish");
  return sid;
}
/** Huella de los resultados reales de una persona (set_log + sesiones): no puede cambiar al copiar programación. */
async function results(user: string) {
  const [r] = await db.execute<{ h: string }>(sql`select md5(coalesce(string_agg(sl.id || ':' || coalesce(sl.weight_kg::text,'') || ':' || coalesce(sl.reps::text,'') || ':' || sl.program_exercise_id, ',' order by sl.id), '')) || ':' ||
    (select md5(coalesce(string_agg(ws.id || ws.status || ws.version_id, ',' order by ws.id), '')) from workout_session ws where ws.user_id = ${user}) as h
    from set_log sl join workout_session w on w.id = sl.session_id where w.user_id = ${user}`) as unknown as { h: string }[];
  return r.h;
}
const preview = (w: Awaited<ReturnType<typeof coachWorld>>, from: { programId: string; day: number }, to: dc.PasteTarget, choice: dc.CopyChoice | null = null) => dc.coachDayCopyPreview(w.coach, w.org, { from, to, choice });
async function paste(w: Awaited<ReturnType<typeof coachWorld>>, from: { programId: string; day: number }, to: dc.PasteTarget, choice?: Partial<dc.CopyChoice>, requestId = randomUUID()) {
  const pv = await preview(w, from, to);
  return dc.coachPasteDay(w.coach, w.org, { from, to, choice: { ...pv.options, ...choice }, expect: pv.fingerprint, requestId });
}
const docOf = async (w: { coach: string; org: string }, pid: string) => (await tr.getProgram(w.coach, w.org, pid)).doc;

describe("Copiar un día · coach independiente", () => {
  it("entre dos alumnos: estructura completa, sin pesos ni notas por defecto, identidades nuevas; el origen y los resultados no cambian", async () => {
    const w = await coachWorld();
    await train(w.a.user, [[{ w: 80, r: 5 }, { w: 72.5, r: 8 }, { w: 65, r: 10 }, { w: 65, r: 10 }, { w: 50, r: 12 }]]);
    const beforeA = await results(w.a.user), beforeB = await results(w.b.user), srcBefore = JSON.stringify(await docOf(w, w.a.pid));
    const pv = await preview(w, { programId: w.a.pid, day: 0 }, { programId: w.b.pid, mode: "replace", day: 1 });
    expect(pv).toMatchObject({ samePerson: false, options: { weights: "strip", notes: false }, target: { dayName: "Día 2", existing: 0, resulting: 5 }, unavailable: [] });
    expect(JSON.stringify(pv)).not.toMatch(/Ana: cuidá|72\.5|"w":/); // la vista previa no trae notas ni resultados
    const r = await paste(w, { programId: w.a.pid, day: 0 }, { programId: w.b.pid, mode: "replace", day: 1 });
    expect(r).toMatchObject({ day: 1, repeated: false });
    const b = await docOf(w, w.b.pid);
    const day = b.days[1];
    expect(day.name).toBe("Día 2");
    expect(day.exercises.map((e) => [e.name, e.sets, e.detail?.technique, e.detail?.group ?? null, e.detail?.groupKind ?? null, e.detail?.rounds ?? null])).toEqual([
      ["Press banca CW", 5, "top_backoff", null, null, null], ["Remo con barra CW", 3, "custom", "A", "superset", null], ["Press inclinado CW", 3, "custom", "A", "superset", null],
      ["Elevaciones laterales CW", 3, "custom", "B", "circuit", 3], ["Extensión de tríceps CW", 3, "custom", "B", "circuit", 3]]);
    const bench = day.exercises[0].detail!.setPlan!;
    expect(bench.map((x) => [x.kind, x.label ?? null, x.weightKg, x.note, x.block, x.stage])).toEqual([["top", null, null, null, 0, 0], ["work", "Load Set", null, null, 1, 0], ["backoff", null, null, null, 2, 0], ["backoff", null, null, null, 3, 0], ["drop", null, null, null, 3, 1]]);
    expect(day.exercises[0].note).toBeNull();
    const srcIds = (await docOf(w, w.a.pid)).days[0].exercises.flatMap((e) => e.detail?.setPlan?.map((x) => x.id) ?? []);
    expect(bench.some((x) => srcIds.includes(x.id))).toBe(false);
    expect(JSON.stringify(await docOf(w, w.a.pid))).toBe(srcBefore);
    expect(await results(w.a.user)).toBe(beforeA);
    expect(await results(w.b.user)).toBe(beforeB);
    const [au] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.action, "program.day_pasted"), eq(schema.auditEvent.resourceId, w.b.pid)));
    expect(JSON.stringify(au.meta)).not.toMatch(/Alumn|Ana|@/); // sin datos identificatorios en la auditoría
  });

  it("Training Intelligence sin datos cruzados: el destino calcula con su propia historia (la de A no viaja)", async () => {
    const w = await coachWorld();
    for (let k = 0; k < 2; k++) await train(w.a.user, [[{ w: 80, r: 5 }, { w: 72.5, r: 8 }, { w: 65, r: 10 }, { w: 65, r: 10 }, { w: 50, r: 12 }]]);
    await paste(w, { programId: w.a.pid, day: 0 }, { programId: w.b.pid, mode: "replace", day: 1 });
    const sid = randomUUID();
    await tr.startSession(w.b.user, { id: sid, dayId: await dayOf(w.b.user, 1) });
    const ses = await tr.getSession(w.b.user, sid);
    const bench = ses.exercises[0];
    expect(bench.targets.length).toBeGreaterThan(0);
    expect(bench.targets.every((t) => t.weightKg == null && t.prev == null)).toBe(true); // nada de los 80 / 72,5 kg de A
    const aLogs = (await db.select({ id: setLog.id }).from(setLog).innerJoin(workoutSession, eq(workoutSession.id, setLog.sessionId)).where(eq(workoutSession.userId, w.a.user))).map((x) => x.id);
    expect(aLogs.length).toBe(10);
    const bTargets = await db.select({ d: trainingTarget.detail }).from(trainingTarget).where(eq(trainingTarget.userId, w.b.user));
    expect(bTargets.length).toBeGreaterThan(0);
    expect(aLogs.some((id) => JSON.stringify(bTargets).includes(id))).toBe(false);
    const [{ p }] = await db.select({ p: sql<number>`count(*)::int` }).from(trainingProposal).where(eq(trainingProposal.coachClientId, w.b.rel));
    expect(p).toBe(0);
  });

  it("con pesos por elección explícita; agregar al final no mezcla superseries; crear un día nuevo; día vacío", async () => {
    const w = await coachWorld();
    await paste(w, { programId: w.a.pid, day: 0 }, { programId: w.b.pid, mode: "append", day: 0 }, { weights: "keep" });
    let b = await docOf(w, w.b.pid);
    expect(b.days[0].exercises.map((e) => e.detail?.group ?? null)).toEqual(["A", null, "C", "C", "B", "B"]);
    expect(b.days[0].exercises[1].detail!.setPlan!.map((x) => x.weightKg)).toEqual([80, 72.5, 65, 65, 50]);
    await paste(w, { programId: w.a.pid, day: 1 }, { programId: w.b.pid, mode: "new_day", day: null });
    b = await docOf(w, w.b.pid);
    expect(b.days.map((d) => d.name)).toEqual(["Día 1", "Día 2", "Piernas"]);
    const empty = await paste(w, { programId: w.b.pid, day: 1 }, { programId: w.tplB, mode: "new_day", day: null });
    expect(empty.day).toBe(2);
    expect((await docOf(w, w.tplB)).days[2].exercises).toEqual([]);
  });

  it("dentro del mismo programa y entre programas del mismo alumno: conserva pesos y notas por defecto", async () => {
    const w = await coachWorld();
    const pv = await preview(w, { programId: w.a.pid, day: 0 }, { programId: w.a.pid, mode: "new_day", day: null });
    expect(pv).toMatchObject({ samePerson: true, options: { weights: "keep", notes: true } });
    await paste(w, { programId: w.a.pid, day: 0 }, { programId: w.a.pid, mode: "new_day", day: null });
    const a = await docOf(w, w.a.pid);
    expect(a.days.map((d) => d.name)).toEqual(["Torso A", "Piernas", "Torso A"]);
    expect(a.days[2].exercises[0].note).toBe("Ana: cuidá el hombro izquierdo");
    // Las filas copiadas tienen identidades nuevas, únicas y distintas de las del día de origen (que, sin identidad propia, usan r0, r1…).
    const ids = (d: (typeof a.days)[number]) => d.exercises.flatMap((e) => e.detail?.setPlan?.map((x) => x.id) ?? []);
    expect(new Set(ids(a.days[2])).size).toBe(ids(a.days[2]).length);
    expect(ids(a.days[2]).some((x) => ids(a.days[0]).includes(x))).toBe(false);
    // Otro programa de la misma alumna (el anterior queda al asignarle uno nuevo).
    const oldPid = w.a.pid;
    await tr.assignProgram(w.coach, w.org, w.tplB, { coachClientIds: [w.a.rel], startsOn: localDate(new Date()) });
    const [cur] = await db.select({ id: schema.program.id }).from(schema.programAssignment).innerJoin(schema.program, eq(schema.program.id, schema.programAssignment.programId))
      .where(and(eq(schema.programAssignment.coachClientId, w.a.rel), eq(schema.programAssignment.status, "active")));
    const pv2 = await preview(w, { programId: oldPid, day: 0 }, { programId: cur.id, mode: "replace", day: 1 });
    expect(pv2).toMatchObject({ samePerson: true, options: { weights: "keep", notes: true } });
  });

  it("desde una plantilla a un programa de cliente", async () => {
    const w = await coachWorld();
    await paste(w, { programId: w.tplA, day: 0 }, { programId: w.b.pid, mode: "replace", day: 1 });
    expect((await docOf(w, w.b.pid)).days[1].exercises.map((e) => e.name)).toEqual(["Press banca CW", "Remo con barra CW", "Press inclinado CW", "Elevaciones laterales CW", "Extensión de tríceps CW"]);
  });

  it("reintento con el mismo identificador: no duplica; cambios desde la vista previa: conflicto (409) sin escribir", async () => {
    const w = await coachWorld();
    const from = { programId: w.a.pid, day: 0 }, to: dc.PasteTarget = { programId: w.b.pid, mode: "append", day: 1 };
    const pv = await preview(w, from, to);
    const req = randomUUID();
    const r1 = await dc.coachPasteDay(w.coach, w.org, { from, to, choice: pv.options, expect: pv.fingerprint, requestId: req });
    const r2 = await dc.coachPasteDay(w.coach, w.org, { from, to, choice: pv.options, expect: pv.fingerprint, requestId: req });
    expect(r2).toMatchObject({ version: r1.version, day: r1.day, repeated: true });
    expect((await docOf(w, w.b.pid)).days[1].exercises).toHaveLength(5);
    // Otra pestaña cambia el destino entre la vista previa y la confirmación.
    const pv3 = await preview(w, from, to);
    const doc = await docOf(w, w.b.pid);
    await tr.saveProgram(w.coach, w.org, w.b.pid, tr.plain({ ...doc, weeks: 6 }));
    await expect(dc.coachPasteDay(w.coach, w.org, { from, to, choice: pv3.options, expect: pv3.fingerprint, requestId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect((await docOf(w, w.b.pid)).days[1].exercises).toHaveLength(5);
  });

  it("programa congelado y entrenamiento abierto: versión nueva; la sesión abierta y el historial siguen con la anterior", async () => {
    const w = await coachWorld();
    await train(w.b.user, [[{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }]]);
    const open = randomUUID();
    await tr.startSession(w.b.user, { id: open, dayId: await dayOf(w.b.user) });
    const before = await tr.getSession(w.b.user, open);
    const [s0] = await db.select({ v: workoutSession.versionId }).from(workoutSession).where(eq(workoutSession.id, open));
    const v0 = (await tr.getProgram(w.coach, w.org, w.b.pid)).version;
    const hist = await results(w.b.user);
    const r = await paste(w, { programId: w.a.pid, day: 0 }, { programId: w.b.pid, mode: "replace", day: 0 });
    expect(r).toMatchObject({ created: true, version: v0 + 1 });
    const after = await tr.getSession(w.b.user, open);
    expect(after.exercises.map((e) => [e.id, e.name])).toEqual(before.exercises.map((e) => [e.id, e.name]));
    const [s1] = await db.select({ v: workoutSession.versionId }).from(workoutSession).where(eq(workoutSession.id, open));
    expect(s1.v).toBe(s0.v);
    const [old] = await db.select({ locked: programVersion.locked }).from(programVersion).where(eq(programVersion.id, s0.v!));
    expect(old.locked).toBe(true);
    expect(await results(w.b.user)).toBe(hist);
  });

  it("permisos: otro coach, un alumno y otra organización no encuentran nada; una relación terminada tampoco", async () => {
    const w = await coachWorld(), other = await coachWorld();
    const from = { programId: w.a.pid, day: 0 };
    await expect(dc.coachDayCopyPreview(other.coach, other.org, { from, to: { programId: other.b.pid, mode: "new_day", day: null } })).rejects.toMatchObject({ status: 404 });
    await expect(dc.coachDayCopyPreview(other.coach, w.org, { from, to: { programId: w.b.pid, mode: "new_day", day: null } })).rejects.toMatchObject({ status: 404 });
    await expect(dc.coachDayCopyPreview(w.b.user, w.org, { from, to: { programId: w.b.pid, mode: "new_day", day: null } })).rejects.toMatchObject({ status: 404 });
    await expect(dc.coachDayCopyPreview(w.coach, w.org, { from: { programId: other.a.pid, day: 0 }, to: { programId: w.b.pid, mode: "new_day", day: null } })).rejects.toMatchObject({ status: 404 });
    await expect(dc.coachDayCopyPreview(w.coach, w.org, { from, to: { programId: other.b.pid, mode: "new_day", day: null } })).rejects.toMatchObject({ status: 404 });
    await expect(dc.coachPasteDay(other.coach, w.org, { from, to: { programId: w.b.pid, mode: "new_day", day: null }, choice: { weights: "keep", notes: true }, expect: "x", requestId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    await tr.setClientStatus(w.coach, w.org, w.b.rel, "ended");
    await expect(dc.coachDayCopyPreview(w.coach, w.org, { from, to: { programId: w.b.pid, mode: "new_day", day: null } })).rejects.toMatchObject({ status: 404 });
    const targets = await dc.coachPasteTargets(w.coach, w.org);
    expect(targets.programs.some((p) => p.id === w.b.pid)).toBe(false);
    expect(targets.programs.some((p) => p.id === other.a.pid)).toBe(false);
  });

  it("ejercicio privado no disponible en el destino: se informa; sólo se copia sin él si el coach lo elige", async () => {
    const w = await coachWorld(), other = await coachWorld();
    const [priv] = await db.insert(schema.exercise).values({ name: `Privado ajeno ${n}`, muscleGroup: "Pecho", orgId: other.org }).returning();
    // Dato heredado: el ejercicio de otra organización quedó en el programa de origen (no se puede guardar así hoy).
    const [day0] = await db.select().from(schema.programDay).innerJoin(schema.program, eq(schema.program.currentVersionId, schema.programDay.versionId)).where(and(eq(schema.program.id, w.a.pid), eq(schema.programDay.position, 0)));
    await db.insert(schema.programExercise).values({ dayId: day0.program_day.id, position: 9, exerciseId: priv.id, name: priv.name, sets: 3, reps: "10", rir: null, restSec: 60 });
    const pv = await preview(w, { programId: w.a.pid, day: 0 }, { programId: w.b.pid, mode: "replace", day: 1 });
    expect(pv.unavailable).toEqual([priv.name]);
    await expect(dc.coachPasteDay(w.coach, w.org, { from: { programId: w.a.pid, day: 0 }, to: { programId: w.b.pid, mode: "replace", day: 1 }, choice: pv.options, expect: pv.fingerprint, requestId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    await paste(w, { programId: w.a.pid, day: 0 }, { programId: w.b.pid, mode: "replace", day: 1 }, { skipUnavailable: true });
    expect((await docOf(w, w.b.pid)).days[1].exercises.map((e) => e.exerciseId)).not.toContain(priv.id);
  });
});

describe("Copiar un día · equipo de sala", () => {
  async function gymWorld() {
    const owner = await verified("Dueño CW");
    await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, owner.id));
    const org = await acc.createGymOrganization(owner.id, { name: `Gym CW ${n}-${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const [B] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Norte" }).returning();
    const staff = async (role: "reception" | "floor_trainer", loc: string, name: string) => { const s = await verified(name); await db.insert(schema.staffMembership).values({ userId: s.id, orgId: org.id, locationId: loc, role }); return s.id; };
    const floor = await staff("floor_trainer", A.id, "Sala A CW"), floorB = await staff("floor_trainer", B.id, "Sala B CW"), reception = await staff("reception", A.id, "Recepción CW");
    await gym.startShift(floor, org.id, A.id);
    const member = async (name: string) => { const u = await verified(name); const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u.id, status: "active" }).returning(); return { user: u.id, id: m.id }; };
    const m1 = await member("Socio 1 CW"), m2 = await member("Socio 2 CW");
    await gym.saveMemberProgram(floor, org.id, m1.id, { doc: program([torsoA()]), reason: "Inicial" });
    await gym.saveMemberProgram(floor, org.id, m2.id, { doc: program([{ name: "Día A", exercises: [ex("Sentadilla CW", 3, "5")] }]), reason: "Inicial" });
    return { org: org.id, owner: owner.id, floor, floorB, reception, m1, m2 };
  }
  it("entrenador de sala autorizado: copia el día del socio 1 al borrador del socio 2 y lo guarda como revisión", async () => {
    const g = await gymWorld();
    const days = await dc.memberProgramDays(g.floor, g.org, g.m1.id);
    expect(days.program?.days.map((d) => d.name)).toEqual(["Torso A"]);
    const c = await dc.memberDayCopy(g.floor, g.org, g.m1.id, { day: 0, forMemberId: g.m2.id });
    expect(c).toMatchObject({ samePerson: false, options: { weights: "strip", notes: false }, unavailable: [] });
    expect(c.day.exercises[0].detail!.setPlan!.every((x) => x.weightKg == null && !x.note)).toBe(true);
    const d2 = await gym.memberDetail(g.floor, g.org, g.m2.id);
    const doc = tr.plain(d2.program!.doc);
    const r = await gym.saveMemberProgram(g.floor, g.org, g.m2.id, { doc: { ...doc, days: [...doc.days, c.day] }, reason: "Copiado Torso A" });
    expect(r.revision).toBe(2);
    const after = await gym.memberDetail(g.floor, g.org, g.m2.id);
    expect(after.program!.doc.days[1].exercises[1].detail!.setPlan![0].label ?? null).toBeNull();
    expect(after.program!.doc.days[1].exercises[0].detail!.setPlan![1].label).toBe("Load Set");
    const same = await dc.memberDayCopy(g.floor, g.org, g.m1.id, { day: 0, forMemberId: g.m1.id });
    expect(same.options).toEqual({ weights: "keep", notes: true });
  });
  it("otra sede, recepción y el dueño sin rol de sala no copian; otra organización no existe", async () => {
    const g = await gymWorld(), other = await gymWorld();
    await expect(dc.memberDayCopy(g.floorB, g.org, g.m1.id, { day: 0, forMemberId: g.m2.id })).rejects.toMatchObject({ status: 404 });
    await expect(dc.memberDayCopy(g.reception, g.org, g.m1.id, { day: 0, forMemberId: g.m2.id })).rejects.toMatchObject({ status: 403 });
    await expect(dc.memberDayCopy(g.floor, g.org, other.m1.id, { day: 0, forMemberId: g.m2.id })).rejects.toMatchObject({ status: 404 });
    await expect(dc.memberDayCopy(g.floor, g.org, g.m1.id, { day: 0, forMemberId: other.m2.id })).rejects.toMatchObject({ status: 404 });
    await expect(dc.memberProgramDays(other.floor, g.org, g.m1.id)).rejects.toMatchObject({ status: 404 }); // sin rol en ese gimnasio: no existe
  });
});

describe("Load Set y tipos personalizados", () => {
  it("la ruta conserva la etiqueta (zod no la descarta)", () => {
    const d = DetailZ.parse({ technique: "custom", setPlan: [{ kind: "work", reps: "6-8", weightKg: 90, label: "Load Set", typeId: "abc-1" }] });
    expect(d?.setPlan?.[0]).toMatchObject({ label: "Load Set", typeId: "abc-1" });
  });

  it("Load Set después del top set: se guarda, el alumno lo ve con su nombre, se registra, aparece en el historial y TI usa su propia historia", async () => {
    const w = await coachWorld();
    const doc = await docOf(w, w.b.pid);
    const plan = D([S("top", "3-5", { weightKg: 100 }), S("work", "6-8", { label: "Load Set", rir: 2, restSec: 180 }), S("backoff", "8-10", { weightKg: 80 })]);
    await tr.saveProgram(w.coach, w.org, w.b.pid, tr.plain({ ...doc, days: [{ ...doc.days[0], exercises: [{ ...doc.days[0].exercises[0], sets: 3, reps: "6-8", detail: { ...plan, technique: "top_backoff" } }] }, doc.days[1]] }));
    const saved = (await docOf(w, w.b.pid)).days[0].exercises[0];
    expect(saved.detail!.setPlan![1]).toMatchObject({ kind: "work", label: "Load Set", weightKg: null, rir: 2, restSec: 180 });
    const sid = randomUUID();
    await tr.startSession(w.b.user, { id: sid, dayId: await dayOf(w.b.user) });
    const ses = await tr.getSession(w.b.user, sid);
    const e = ses.exercises[0];
    expect(setTarget(e as never, 1)).toMatchObject({ label: "Load Set", kind: "work" });
    // Sin historia propia, el Load Set no hereda la carga del top set ni calcula una.
    expect(e.targets[1]).toMatchObject({ weightKg: null, status: "no_data" });
    for (const [i, x] of [{ w: 100, r: 5 }, { w: 85, r: 8 }, { w: 80, r: 10 }].entries())
      await tr.logSet(w.b.user, sid, { id: randomUUID(), programExerciseId: e.id, setIndex: i, weightKg: x.w, reps: x.r, rir: 2, feel: null });
    const sum = await tr.sessionSummary(w.b.user, sid);
    expect(sum.metrics.mainDone).toBe(3); // el Load Set cuenta como una serie efectiva, sin duplicar
    await tr.sessionAction(w.b.user, sid, "finish");
    const det = await tr.clientDetail(w.coach, w.org, w.b.rel);
    const log = JSON.stringify(det);
    expect(log).toMatch(/"label":"Load Set"/);
    expect(log).toMatch(/"label":"Top set"/);
    // Próxima sesión: el Load Set progresa con su propia historia (85 × 8, rango completo), no con la del top set.
    const sid2 = randomUUID();
    await tr.startSession(w.b.user, { id: sid2, dayId: await dayOf(w.b.user) });
    const t2 = (await tr.getSession(w.b.user, sid2)).exercises[0].targets;
    expect(t2[1]).toMatchObject({ action: "increase_load", weightKg: 87.5 });
    expect(t2[1].prev).toMatchObject({ w: 85, r: 8 });
    expect(t2[0]).toMatchObject({ source: "coach", weightKg: 100 });
  });

  it("crear, reutilizar, renombrar y quitar un tipo propio sin tocar programas ni registros anteriores", async () => {
    const w = await coachWorld();
    const scope = { orgId: w.org, userId: w.coach };
    const t = await st.createSetType(scope, { name: "Serie de control", kind: "work", defaults: { rir: 3, restSec: 120 } });
    expect(t).toMatchObject({ name: "Serie de control", kind: "work", defaults: { rir: 3, restSec: 120 } });
    await st.createSetType(scope, { name: "Serie técnica", kind: "warmup" });
    expect((await st.listSetTypes(scope)).types.map((x) => x.name)).toEqual(["Serie de control", "Serie técnica"]);
    const doc = await docOf(w, w.b.pid);
    await tr.saveProgram(w.coach, w.org, w.b.pid, tr.plain({ ...doc, days: [{ ...doc.days[0], exercises: [{ ...doc.days[0].exercises[0], detail: D([S("work", "5"), S("work", "5", { label: t.name, typeId: t.id }), S("work", "5")]) }] }, doc.days[1]] }));
    const sid = await train(w.b.user, [[{ w: 100, r: 5 }, { w: 90, r: 5 }, { w: 100, r: 5 }]]);
    await st.updateSetType(scope, t.id, { name: "Serie de chequeo" });
    expect((await docOf(w, w.b.pid)).days[0].exercises[0].detail!.setPlan![1].label).toBe("Serie de control");
    expect(JSON.stringify(await tr.clientDetail(w.coach, w.org, w.b.rel))).toMatch(/"label":"Serie de control"/);
    await st.archiveSetType(scope, t.id);
    expect((await st.listSetTypes(scope)).types.map((x) => x.name)).toEqual(["Serie técnica"]);
    expect((await docOf(w, w.b.pid)).days[0].exercises[0].detail!.setPlan![1].label).toBe("Serie de control");
    const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(setLog).where(eq(setLog.sessionId, sid));
    expect(c).toBe(3);
    // Un nombre ya quitado se puede volver a crear.
    await expect(st.createSetType(scope, { name: "Serie de control", kind: "work" })).resolves.toMatchObject({ name: "Serie de control" });
  });

  it("nombres inválidos, repetidos o de REPI; tipo real inválido", async () => {
    const w = await coachWorld();
    const scope = { orgId: w.org, userId: w.coach };
    await st.createSetType(scope, { name: "Serie pesada", kind: "work" });
    await expect(st.createSetType(scope, { name: "serie  PESADA", kind: "work" })).rejects.toMatchObject({ status: 409 });
    for (const name of ["", "x", "Top set", "Load Set", "load set", "🔥🔥", "a".repeat(31)]) await expect(st.createSetType(scope, { name, kind: "work" })).rejects.toMatchObject({ status: 400 });
    await expect(st.createSetType(scope, { name: "Serie rara", kind: "magic" })).rejects.toMatchObject({ status: 400 });
    await expect(st.createSetType(scope, { name: "Serie rara", kind: "work", defaults: { rir: 9 } })).rejects.toMatchObject({ status: 400 });
  });

  it("privados: otro profe (u otra organización) no los ve ni los cambia", async () => {
    const w = await coachWorld(), other = await coachWorld();
    const t = await st.createSetType({ orgId: w.org, userId: w.coach }, { name: "Serie de volumen", kind: "work" });
    expect((await st.listSetTypes({ orgId: other.org, userId: other.coach })).types).toEqual([]);
    expect((await st.listSetTypes({ orgId: other.org, userId: w.coach })).types).toEqual([]);
    await expect(st.updateSetType({ orgId: other.org, userId: other.coach }, t.id, { name: "Robado" })).rejects.toMatchObject({ status: 404 });
    await expect(st.archiveSetType({ orgId: w.org, userId: other.coach }, t.id)).rejects.toMatchObject({ status: 404 });
    expect((await st.listSetTypes({ orgId: w.org, userId: w.coach })).types.map((x) => x.name)).toEqual(["Serie de volumen"]);
  });

  it("sin la migración 0044 aplicada: la lista queda vacía y crear avisa (el resto del editor sigue)", async () => {
    const w = await coachWorld();
    await db.execute(sql`alter table set_type rename to set_type_off`);
    try {
      expect(await st.listSetTypes({ orgId: w.org, userId: w.coach })).toEqual({ available: false, types: [] });
      await expect(st.createSetType({ orgId: w.org, userId: w.coach }, { name: "Serie X", kind: "work" })).rejects.toMatchObject({ status: 503 });
      const doc = await docOf(w, w.b.pid);
      await expect(tr.saveProgram(w.coach, w.org, w.b.pid, tr.plain({ ...doc, days: [{ ...doc.days[0], exercises: [{ ...doc.days[0].exercises[0], detail: D([S("work", "5", { label: "Load Set" }), S("work", "5"), S("work", "5")]) }] }, doc.days[1]] }))).resolves.toBeTruthy();
    } finally {
      await db.execute(sql`alter table set_type_off rename to set_type`);
    }
  });
});

describe("Tipos personalizados en el gimnasio", () => {
  it("cada entrenador de sala tiene su lista; recepción no accede", async () => {
    const owner = await verified("Dueño ST");
    const org = await acc.createGymOrganization(owner.id, { name: `Gym ST ${n}-${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const mk = async (role: "floor_trainer" | "reception") => { const s = await verified(role); await db.insert(schema.staffMembership).values({ userId: s.id, orgId: org.id, locationId: A.id, role }); return s.id; };
    const f1 = await mk("floor_trainer"), f2 = await mk("floor_trainer"), rec = await mk("reception");
    const ctx = async (u: string) => { const c = await gym.gymContext(u, org.id); gym.need(c, "program.edit"); return { orgId: org.id, userId: u }; };
    const t = await st.createSetType(await ctx(f1), { name: "Load Set Urko", kind: "work" });
    expect((await st.listSetTypes(await ctx(f2))).types).toEqual([]);
    await expect(st.updateSetType(await ctx(f2), t.id, { name: "Otro" })).rejects.toMatchObject({ status: 404 });
    await expect(ctx(rec)).rejects.toMatchObject({ status: 403 });
  });
});
