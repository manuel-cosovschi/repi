// D191 · Cierre y endurecimiento de Training Intelligence 2.0 (servidor + base de prueba descartable, sin simulaciones):
// acceso del equipo de sala con consentimiento y sin acceso por administrar; propuestas aceptadas, mantenidas y rechazadas;
// aplicación explícita por la programación (versión nueva, historial intacto); kg/lb; saltos de carga por equipo; molestia;
// top set + back-off y rest-pause; historial importado e insuficiente.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyLoad, emptyDetail, kgTo, localDate, localizeWeights, toKg, type ExerciseDetail, type ProgramDoc, type SetSpec } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as ti from "@/server/training/intelligence";
import * as gym from "@/server/gym/services";
import * as settings from "@/server/settings/services";
import { resetRateLimits } from "@/server/access/util";

const { trainingTarget, trainingProposal, setLog, programVersion } = schema;
let n = 0;
async function verified(name = "Persona TI") {
  const email = `tih${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let ROW = "", CURL = "";
beforeAll(async () => {
  const ins = async (name: string) => (await db.insert(schema.exercise).values({ name, muscleGroup: "Espalda" }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  ROW = await ins("Remo con barra TIH");
  CURL = await ins("Curl con mancuernas TIH");
});
beforeEach(() => resetRateLimits());

const S = (kind: SetSpec["kind"], reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });
type Ex = { exerciseId?: string; name?: string; sets: number; reps: string; rir?: number | null; detail?: ExerciseDetail | null };
const doc = (exs: Ex[]): ProgramDoc => ({ name: "Sala", weeks: 4, note: "",
  days: [{ name: "A", exercises: exs.map((e) => ({ exerciseId: e.exerciseId ?? ROW, name: e.name ?? "Remo con barra TIH", sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: 120, note: null, ...(e.detail ? { detail: e.detail } : {}) })) }] });

async function coachMember(exs: Ex[]) {
  const coach = await verified("Coach TIH");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach TIH ${n}` });
  const u = await verified("Alumno TIH");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(coach.id, org.id, doc(exs));
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  return { user: u.id, coach: coach.id, org: org.id, rel: rel.relationId };
}
/** Gimnasio con dos sedes, dueño (2FA), gerencia, recepción, sala en A (con turno), sala en B, y un socio de A que comparte. */
async function gymWorld(exs: Ex[]) {
  const owner = await verified("Dueño TIH");
  await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, owner.id)); // así el rechazo es por permiso, no por 2FA
  const org = await acc.createGymOrganization(owner.id, { name: `Gym TIH ${n}-${Date.now()}` });
  const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
  const [B] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Norte" }).returning();
  const staff = async (role: "manager" | "reception" | "floor_trainer" | "coordinator", loc: string | null, name: string) => {
    const s = await verified(name);
    await db.insert(schema.staffMembership).values({ userId: s.id, orgId: org.id, locationId: loc, role });
    return s.id;
  };
  const floor = await staff("floor_trainer", A.id, "Sala A TIH");
  const floorB = await staff("floor_trainer", B.id, "Sala B TIH");
  const manager = await staff("manager", A.id, "Gerencia TIH");
  const reception = await staff("reception", A.id, "Recepción TIH");
  await gym.startShift(floor, org.id, A.id);
  const u = await verified("Socio TIH");
  const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u.id, status: "active" }).returning();
  await db.insert(schema.consentGrant).values({ userId: u.id, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
  await gym.saveMemberProgram(floor, org.id, m.id, { doc: doc(exs), reason: "Inicial" });
  return { owner: owner.id, org: org.id, A: A.id, floor, floorB, manager, reception, user: u.id, memberId: m.id };
}
const dayId = async (user: string) => { const t = await tr.myTraining(user); if (t.state !== "ready") throw new Error(t.state); return t.program.days[0].id; };
async function open(user: string) { const sid = randomUUID(); await tr.startSession(user, { id: sid, dayId: await dayId(user) }); return sid; }
async function train(user: string, rows: { w: number | null; r: number; rir?: number | null; feel?: string | null }[][], at?: Date) {
  const sid = await open(user);
  const ses = await tr.getSession(user, sid, at);
  for (const [k, sets] of rows.entries()) for (const [i, x] of sets.entries())
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: ses.exercises[k].id, setIndex: i, weightKg: x.w, reps: x.r, rir: x.rir ?? null, feel: x.feel ?? null }, at);
  await tr.sessionAction(user, sid, "finish", at);
  return sid;
}
/** 4 sesiones con el rango completo y carga en subida: tendencia «progresando» y propuesta de carga. */
async function progressing(user: string, base = 55) {
  const t0 = Date.now();
  for (const [k, w] of [base, base + 2.5, base + 5, base + 7.5].entries()) await train(user, [[{ w, r: 10 }, { w, r: 10 }, { w, r: 10 }]], new Date(t0 - (4 - k) * 3 * 86_400_000));
}
const logsOf = (user: string) => db.select({ id: setLog.id, w: setLog.weightKg, r: setLog.reps, rev: setLog.revision }).from(setLog)
  .innerJoin(schema.workoutSession, eq(schema.workoutSession.id, setLog.sessionId)).where(eq(schema.workoutSession.userId, user)).orderBy(asc(setLog.id));

describe("Equipo de sala: acceso legítimo y nada más", () => {
  it("sala de la sede con el consentimiento del socio: ve tendencia y propuesta (sin historial importado ni datos de salud)", async () => {
    const g = await gymWorld([{ sets: 3, reps: "8-10" }]);
    await progressing(g.user);
    // Historial importado del socio: es suyo, no de la sede.
    const [imp] = await db.insert(schema.historyImport).values({ userId: g.user, source: "csv", parsed: {}, status: "confirmed" }).returning();
    await db.insert(schema.historyEntry).values({ importId: imp.id, userId: g.user, day: localDate(new Date(Date.now() - 2 * 86_400_000)), exerciseId: ROW, exerciseName: "Remo", setIndex: 0, weightKg: "200", reps: 10 });
    const v = await gym.memberIntelligence(g.floor, g.org, g.memberId);
    const ex = v.exercises[0];
    expect(ex.trend).toMatchObject({ kind: "progressing" });
    expect(ex.proposal).toMatchObject({ kind: "load", weightKg: 65, status: "open" });
    expect(ex.last?.sets.every((s) => s.w !== 200)).toBe(true);
    expect(JSON.stringify(v)).not.toMatch(/molestia|lesi[oó]n|salud|check-?in/i);
    const [p] = await db.select().from(trainingProposal).where(eq(trainingProposal.id, ex.proposal!.id));
    expect(p).toMatchObject({ gymMemberId: g.memberId, coachClientId: null });
  });
  it("dueño y gerencia no la ven por administrar; recepción tampoco; otra sede u otro gimnasio: no existe", async () => {
    const g = await gymWorld([{ sets: 3, reps: "8-10" }]);
    for (const who of [g.owner, g.manager, g.reception]) await expect(gym.memberIntelligence(who, g.org, g.memberId)).rejects.toMatchObject({ status: 403 });
    await expect(gym.memberIntelligence(g.floorB, g.org, g.memberId)).rejects.toMatchObject({ status: 404 });
    const other = await gymWorld([{ sets: 1, reps: "10" }]);
    await expect(gym.memberIntelligence(other.floor, other.org, g.memberId)).rejects.toMatchObject({ status: 404 });
    await expect(gym.memberIntelligence(other.floor, g.org, g.memberId)).rejects.toMatchObject({ status: 404 });
    await expect(gym.memberIntelligence(g.user, g.org, g.memberId)).rejects.toMatchObject({ status: 404 }); // el socio no es del equipo
  });
  it("el dueño que además es profe de sala en esa sede sí (su rol de sala, no el de dueño)", async () => {
    const g = await gymWorld([{ sets: 1, reps: "10" }]);
    await db.insert(schema.staffMembership).values({ userId: g.owner, orgId: g.org, locationId: g.A, role: "floor_trainer" });
    expect((await gym.memberIntelligence(g.owner, g.org, g.memberId)).exercises).toHaveLength(1);
  });
  it("sin el consentimiento (o revocado): 403, también para decidir", async () => {
    const g = await gymWorld([{ sets: 3, reps: "8-10" }]);
    await progressing(g.user);
    const v = await gym.memberIntelligence(g.floor, g.org, g.memberId);
    await db.update(schema.consentGrant).set({ status: "revoked" }).where(and(eq(schema.consentGrant.relationId, g.memberId), eq(schema.consentGrant.item, "attendance_training")));
    await expect(gym.memberIntelligence(g.floor, g.org, g.memberId)).rejects.toMatchObject({ status: 403, code: "consent_required" });
    await expect(gym.decideMemberProposal(g.floor, g.org, v.exercises[0].proposal!.id, { status: "accepted" })).rejects.toMatchObject({ status: 403 });
  });
  it("propuestas cruzadas: el coach no decide las de la sede ni la sede las del coach", async () => {
    const g = await gymWorld([{ sets: 3, reps: "8-10" }]);
    await progressing(g.user);
    const gp = (await gym.memberIntelligence(g.floor, g.org, g.memberId)).exercises[0].proposal!;
    const c = await coachMember([{ sets: 3, reps: "8-10" }]);
    await progressing(c.user);
    const cp = (await ti.clientIntelligence(c.coach, c.org, c.rel)).exercises[0].proposal!;
    await expect(ti.decideProposal(c.coach, c.org, gp.id, { status: "accepted" })).rejects.toMatchObject({ status: 404 });
    await expect(gym.decideMemberProposal(g.floor, g.org, cp.id, { status: "accepted" })).rejects.toMatchObject({ status: 404 });
    // Otro alumno del mismo coach no se cruza; un coach independiente sin el alumno: 404.
    const c2 = await coachMember([{ sets: 1, reps: "10" }]);
    await expect(ti.clientIntelligence(c2.coach, c2.org, c.rel)).rejects.toMatchObject({ status: 404 });
  });
});

describe("Propuestas: decidir no cambia la rutina; aplicar es editar y guardar como siempre", () => {
  it("coach: aceptar, mantener y rechazar quedan registrados y el programa sigue igual", async () => {
    const c = await coachMember([{ sets: 3, reps: "8-10" }]);
    await progressing(c.user);
    const v = await ti.clientIntelligence(c.coach, c.org, c.rel);
    const before = await db.select().from(programVersion).where(eq(programVersion.programId, v.programId!));
    const p1 = v.exercises[0].proposal!;
    expect(await ti.decideProposal(c.coach, c.org, p1.id, { status: "kept" })).toMatchObject({ status: "kept" });
    // Decidida y sin sesiones nuevas: se muestra la decisión, no se vuelve a proponer lo mismo.
    expect((await ti.clientIntelligence(c.coach, c.org, c.rel)).exercises[0].proposal).toMatchObject({ id: p1.id, status: "kept" });
    // Con una sesión nueva, una propuesta nueva (una abierta por ejercicio y tipo).
    await train(c.user, [[{ w: 65, r: 10 }, { w: 65, r: 10 }, { w: 65, r: 10 }]]);
    const p2 = (await ti.clientIntelligence(c.coach, c.org, c.rel)).exercises[0].proposal!;
    expect(p2).toMatchObject({ status: "open", weightKg: 67.5 });
    expect(p2.id).not.toBe(p1.id);
    expect(await ti.decideProposal(c.coach, c.org, p2.id, { status: "accepted" })).toMatchObject({ status: "accepted" });
    expect(await ti.decideProposal(c.coach, c.org, p2.id, { status: "rejected" })).toMatchObject({ status: "accepted" }); // una decisión no se pisa
    const after = await db.select().from(programVersion).where(eq(programVersion.programId, v.programId!));
    expect(after).toEqual(before);
    const audits = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.resourceId, p2.id));
    expect(audits.map((a) => a.action)).toEqual(["training_proposal.accepted"]);
  });
  it("coach: aplicar la carga propuesta guardando el programa crea una versión nueva; las sesiones hechas no cambian y la próxima sigue al profe", async () => {
    const c = await coachMember([{ sets: 3, reps: "8-10" }]);
    await progressing(c.user);
    const v = await ti.clientIntelligence(c.coach, c.org, c.rel);
    const p = v.exercises[0].proposal!;
    const logs0 = await logsOf(c.user);
    const [prog] = await db.select().from(schema.program).where(eq(schema.program.id, v.programId!));
    const cur = await tr.readVersion(prog.currentVersionId!);
    const d0 = cur.doc as ProgramDoc;
    // Lo mismo que hace «Aplicar» en el editor: applyLoad sobre el borrador, y el guardado normal del coach.
    const next: ProgramDoc = { ...d0, days: d0.days.map((x) => ({ ...x, exercises: x.exercises.map((e) => (e.exerciseId === ROW ? { ...e, detail: applyLoad(e.detail ?? null, e.sets, e.reps, p.weightKg!) } : e)) })) };
    const r = await tr.saveProgram(c.coach, c.org, prog.id, next);
    expect(r).toMatchObject({ created: true, version: cur.version.number + 1 });
    expect(await logsOf(c.user)).toEqual(logs0); // resultados reales intactos
    const old = await db.select().from(programVersion).where(eq(programVersion.id, cur.version.id));
    expect(old[0].number).toBe(cur.version.number);
    const sid = await open(c.user);
    const t = (await tr.getSession(c.user, sid)).exercises[0].targets;
    expect(t.every((x) => x.source === "coach" && x.weightKg === 65)).toBe(true);
  });
  it("sala: aplicar desde el editor del programa institucional crea la revisión con su autoría", async () => {
    const g = await gymWorld([{ sets: 3, reps: "8-10" }]);
    await progressing(g.user);
    const p = (await gym.memberIntelligence(g.floor, g.org, g.memberId)).exercises[0].proposal!;
    const detail = await gym.memberDetail(g.floor, g.org, g.memberId);
    const d0 = detail.program!.doc as ProgramDoc;
    const next: ProgramDoc = { ...d0, days: d0.days.map((x) => ({ ...x, exercises: x.exercises.map((e) => ({ ...e, detail: applyLoad(e.detail ?? null, e.sets, e.reps, p.weightKg!) })) })) };
    const logs0 = await logsOf(g.user);
    const r = await gym.saveMemberProgram(g.floor, g.org, g.memberId, { doc: next, reason: "Training Intelligence: Remo" });
    expect(r.revision).toBe(detail.program!.revision + 1);
    expect(await gym.decideMemberProposal(g.floor, g.org, p.id, { status: "accepted", note: "Aplicada desde el editor del programa" })).toMatchObject({ status: "accepted" });
    expect(await logsOf(g.user)).toEqual(logs0);
    // El dueño no aplica ni decide por administrar.
    await expect(gym.decideMemberProposal(g.owner, g.org, p.id, { status: "rejected" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("kg / lb: la unidad es sólo presentación", () => {
  it("alumno en lb: registrar lo que ve cuenta como lo propuesto; objetivos y registros quedan en kg", async () => {
    const c = await coachMember([{ sets: 3, reps: "8-10" }]);
    await train(c.user, [[{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }]]);
    await settings.updateSettings(c.user, { weightUnit: "lb" });
    const sid = await open(c.user);
    const s = await tr.getSession(c.user, sid);
    const t0 = s.exercises[0].targets[0];
    expect(t0.weightKg).toBe(62.5);
    const shown = kgTo(t0.weightKg!, "lb"); // 137,8 lb en la tarjeta
    expect(shown).toBe(137.8);
    expect(localizeWeights(t0.text, "lb")).toBe("137,8 lb × 8–10");
    await tr.logSet(c.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: toKg(shown, "lb"), reps: 9, rir: 2 });
    const [row] = await db.select().from(trainingTarget).where(and(eq(trainingTarget.sessionId, sid), eq(trainingTarget.setIndex, 0), isNull(trainingTarget.supersededAt)));
    expect(row).toMatchObject({ decision: "accepted", weightKg: "62.5" });
    const [log] = await db.select().from(setLog).where(and(eq(setLog.sessionId, sid), eq(setLog.setIndex, 0)));
    expect(Number(log.weightKg)).toBe(62.51); // lo que cargó, sin redondear de nuevo
  });
  it("cambiar de kg a lb a mitad de la sesión no recalcula ni reescribe objetivos; con decimales tampoco", async () => {
    const c = await coachMember([{ sets: 3, reps: "8-10" }]);
    await train(c.user, [[{ w: 61.25, r: 10 }, { w: 61.25, r: 10 }, { w: 61.25, r: 10 }]]);
    const sid = await open(c.user);
    const a = await tr.getSession(c.user, sid);
    await tr.logSet(c.user, sid, { id: randomUUID(), programExerciseId: a.exercises[0].id, setIndex: 0, weightKg: 63.75, reps: 10, rir: 2 });
    await settings.updateSettings(c.user, { weightUnit: "lb" });
    const b = await tr.getSession(c.user, sid);
    expect(b.exercises[0].targets.map((t) => [t.id, t.weightKg])).toEqual(a.exercises[0].targets.map((t) => [t.id, t.weightKg]));
    expect(a.exercises[0].targets[0].weightKg).toBe(63.75);
    await settings.updateSettings(c.user, { weightUnit: "kg" });
    const all = await db.select().from(trainingTarget).where(eq(trainingTarget.sessionId, sid));
    expect(all.every((t) => t.weightKg === "63.75")).toBe(true);
    expect((await logsOf(c.user)).filter((l) => l.w === "61.25")).toHaveLength(3); // el historial queda en kg tal cual
  });
});

describe("Saltos de carga por equipo (configurados en el ejercicio del programa)", () => {
  it("mancuernas de 2 kg: 22 → 24; sin configurar, referencia marcada; sustituto: salto desconocido", async () => {
    const withLoad = { ...emptyDetail(), load: { equipment: "dumbbell" as const, incrementKg: 2 } };
    const c = await coachMember([{ exerciseId: CURL, name: "Curl con mancuernas TIH", sets: 3, reps: "8-10", detail: withLoad }, { sets: 3, reps: "8-10" }]);
    await train(c.user, [[{ w: 22, r: 10 }, { w: 22, r: 10 }, { w: 22, r: 10 }], [{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }]]);
    const sid = await open(c.user);
    const s = await tr.getSession(c.user, sid);
    expect(s.exercises[0].targets[0]).toMatchObject({ weightKg: 24, action: "increase_load" });
    expect(s.exercises[0].targets[0].reasons).toContain("increment_fit");
    expect(s.exercises[1].targets[0]).toMatchObject({ weightKg: 62.5 });
    expect(s.exercises[1].targets[0].reasons).toContain("increment_unknown");
    // El detalle guardado conserva el equipo (zod + validateDetail) y el programa no cambió por recomendar.
    const [pe] = await db.select().from(schema.programExercise).where(eq(schema.programExercise.id, s.exercises[0].id));
    expect((pe.detail as ExerciseDetail).load).toEqual({ equipment: "dumbbell", incrementKg: 2 });
  });
  it("barra con 1,25 kg por lado: progresa de a 2,5 y baja a un múltiplo armable", async () => {
    const bar = { ...emptyDetail(), load: { equipment: "barbell" as const, incrementKg: 1.25, perSide: true } };
    const c = await coachMember([{ sets: 3, reps: "8-10", detail: bar }]);
    await train(c.user, [[{ w: 61.25, r: 10 }, { w: 61.25, r: 10 }, { w: 61.25, r: 10 }]]);
    const sid = await open(c.user);
    const s = await tr.getSession(c.user, sid);
    expect(s.exercises[0].targets[0].weightKg).toBe(63.75);
    const r = await tr.logSet(c.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 63.75, reps: 4, rir: 0 });
    expect(r.intel?.event?.code).toBe("short");
    const later = r.intel!.targets.filter((t) => t.setIndex > 0);
    expect(later.every((t) => t.weightKg! <= 63.75 - 2.5 && Math.round((t.weightKg! / 2.5) * 100) % 100 === 0)).toBe(true);
  });
});

describe("Durante el entrenamiento: molestia, métodos e historial", () => {
  it("molestia en una serie: las siguientes no suben y quedan limitadas; lo hecho no se toca", async () => {
    const c = await coachMember([{ sets: 3, reps: "8-10" }]);
    await train(c.user, [[{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }]]);
    const sid = await open(c.user);
    const s = await tr.getSession(c.user, sid);
    const id = randomUUID();
    const r = await tr.logSet(c.user, sid, { id, programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 60, reps: 8, rir: 2, feel: "molestia" });
    expect(r.intel?.event?.code).toBe("pain");
    const later = r.intel!.targets.filter((t) => t.setIndex > 0);
    expect(later.every((t) => t.weightKg! <= 60 && t.status === "limited" && t.guards.includes("pain_exercise"))).toBe(true);
    const [log] = await db.select().from(setLog).where(eq(setLog.id, id));
    expect([Number(log.weightKg), log.reps, log.feel]).toEqual([60, 8, "molestia"]);
  });
  it("top set + back-off y rest-pause: cada fila con su regla", async () => {
    const top = { ...emptyDetail(), technique: "top_backoff" as const, setPlan: [S("top", "5", { id: "tTOP", block: 0, stage: 0 }), S("backoff", "8", { id: "tBO1", block: 1, stage: 0 }), S("backoff", "8", { id: "tBO2", block: 2, stage: 0 })] };
    const rp = { ...emptyDetail(), technique: "rest_pause" as const, setPlan: [S("work", "8-10", { id: "rMAIN", block: 0, stage: 0 }), S("rest_pause", "al fallo", { id: "rRP1", block: 0, stage: 1, restSec: 20 })] };
    const c = await coachMember([{ sets: 3, reps: "5", detail: top }, { exerciseId: CURL, name: "Curl con mancuernas TIH", sets: 2, reps: "8-10", detail: rp }]);
    const sid = await open(c.user);
    const s = await tr.getSession(c.user, sid);
    expect(s.exercises[0].targets.map((t) => t.status)).toEqual(["no_data", "no_data", "no_data"]); // sin historia: no inventa
    for (const [i, w, r] of [[0, 100, 5], [1, 85, 8], [2, 85, 8]] as const) await tr.logSet(c.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: i, weightKg: w, reps: r, rir: 1 });
    for (const [i, w, r] of [[0, 20, 10], [1, 20, 4]] as const) await tr.logSet(c.user, sid, { id: randomUUID(), programExerciseId: s.exercises[1].id, setIndex: i, weightKg: w, reps: r, rir: 0 });
    await tr.sessionAction(c.user, sid, "finish");
    const sid2 = await open(c.user);
    const t = (await tr.getSession(c.user, sid2)).exercises;
    expect(t[0].targets[0]).toMatchObject({ kind: "top", weightKg: 105, action: "increase_load" }); // D182: desde 100 kg el salto es de 5
    expect(t[0].targets.slice(1).every((x) => x.kind === "backoff" && x.weightKg === 85 && x.pending)).toBe(true); // su propia historia, no −15 % del nuevo top
    expect(t[1].targets[1]).toMatchObject({ kind: "rest_pause", action: "hold" });
    expect(t[1].targets[1].weightKg).toBe(t[1].targets[0].weightKg); // misma carga que la serie principal
  });
  it("historial importado: referencia de calidad baja para el alumno; con datos insuficientes, ninguna tendencia", async () => {
    const c = await coachMember([{ sets: 3, reps: "8-10" }]);
    const [imp] = await db.insert(schema.historyImport).values({ userId: c.user, source: "csv", parsed: {}, status: "confirmed" }).returning();
    const day = localDate(new Date(Date.now() - 20 * 86_400_000));
    await db.insert(schema.historyEntry).values([0, 1, 2].map((i) => ({ importId: imp.id, userId: c.user, day, exerciseId: ROW, exerciseName: "Remo", setIndex: i, weightKg: "50", reps: 10 })));
    const sid = await open(c.user);
    const t = (await tr.getSession(c.user, sid)).exercises[0];
    expect(t.targets[0]).toMatchObject({ quality: "low", prev: { w: 50, source: "import" } });
    const v = await ti.clientIntelligence(c.coach, c.org, c.rel);
    expect(v.exercises[0]).toMatchObject({ last: null, proposal: null });
    expect(v.exercises[0].trend).toMatchObject({ kind: "insufficient", confidence: "none" });
  });
});
