// D191 · Training Intelligence 2.0 de punta a punta (servidor + base de prueba): objetivos por fila persistidos e idempotentes,
// separados del plan y de lo registrado; ajuste después de cada serie sin reescribir nada; vista y propuestas del coach con
// permisos; cierre de la sesión; rendimiento con historial largo.
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyDetail, localDate, type ExerciseDetail, type SetSpec } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as ti from "@/server/training/intelligence";
import * as fu from "@/server/followup/services";
import { resetRateLimits } from "@/server/access/util";

const { trainingTarget, trainingProposal, setLog, programExercise } = schema;
let n = 0;
async function verified() {
  const email = `ti${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name: "Persona TI", email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let BENCH = "", SQUAT = "";
beforeAll(async () => {
  const ins = async (name: string) => (await db.insert(schema.exercise).values({ name, muscleGroup: "Pecho" }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  BENCH = await ins("Press de banca TI");
  SQUAT = await ins("Sentadilla TI");
});
beforeEach(() => resetRateLimits());

const S = (kind: SetSpec["kind"], reps: string, p: Partial<SetSpec> = {}): SetSpec => ({ kind, reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null, ...p });
type Ex = { exerciseId?: string; name?: string; sets: number; reps: string; rir?: number | null; detail?: ExerciseDetail | null };
async function member(exs: Ex[]) {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach TI ${n}` });
  const u = await verified();
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(coach.id, org.id, { name: "Base", weeks: 4, note: "",
    days: [{ name: "A", exercises: exs.map((e) => ({ exerciseId: e.exerciseId ?? BENCH, name: e.name ?? "Press de banca TI", sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: 120, ...(e.detail ? { detail: e.detail } : {}) })) }] });
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  return { user: u.id, coach: coach.id, org: org.id, rel: rel.relationId };
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
const current = (sid: string) => db.select().from(trainingTarget).where(and(eq(trainingTarget.sessionId, sid), isNull(trainingTarget.supersededAt)));

describe("Persistencia (E)", () => {
  it("crear, recuperar y repetir sin duplicar (también pedidos simultáneos)", async () => {
    const m = await member([{ sets: 3, reps: "8-10", rir: 2 }]);
    await train(m.user, [[{ w: 60, r: 10, rir: 2 }, { w: 60, r: 10, rir: 2 }, { w: 60, r: 10, rir: 2 }]]);
    const sid = await open(m.user);
    const [a, b, c] = await Promise.all([tr.getSession(m.user, sid), tr.getSession(m.user, sid), tr.getSession(m.user, sid)]);
    expect(a.exercises[0].targets.map((t) => t.weightKg)).toEqual([62.5, 62.5, 62.5]);
    expect(a.exercises[0].targets[0]).toMatchObject({ action: "increase_load", text: "62,5 kg × 8–10", rirTarget: 2, algo: "ti2.1", prev: { w: 60, r: 10 } });
    expect(b.exercises[0].targets.map((t) => t.id)).toEqual(c.exercises[0].targets.map((t) => t.id));
    expect(await db.select().from(trainingTarget).where(eq(trainingTarget.sessionId, sid))).toHaveLength(3);
    // El plan del profe no cambió (programa ≠ objetivo).
    const [pe] = await db.select().from(programExercise).where(eq(programExercise.id, a.exercises[0].id));
    expect(pe.detail).toBeNull();
  });
  it("resultado distinto al objetivo: el registro manda; objetivo «modificado»; la siguiente se ajusta con seq 2 y queda trazado", async () => {
    const m = await member([{ sets: 3, reps: "8-10", rir: 2 }]);
    await train(m.user, [[{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }]]);
    const sid = await open(m.user);
    const pe = (await tr.getSession(m.user, sid)).exercises[0];
    const id = randomUUID();
    const r = await tr.logSet(m.user, sid, { id, programExerciseId: pe.id, setIndex: 0, weightKg: 62.5, reps: 5, rir: 0, feel: null });
    expect(r.intel?.event).toMatchObject({ code: "short" });
    const [log] = await db.select().from(setLog).where(eq(setLog.id, id));
    expect([log.weightKg, log.reps, log.rir]).toEqual(["62.5", 5, 0]); // nunca se reemplaza por lo sugerido
    const rows = await db.select().from(trainingTarget).where(eq(trainingTarget.sessionId, sid));
    expect(rows.find((x) => x.setIndex === 0)).toMatchObject({ decision: "modified", setLogId: id, supersededAt: null });
    const s1 = rows.filter((x) => x.setIndex === 1).sort((a, b) => a.seq - b.seq);
    expect(s1.map((x) => [x.seq, x.weightKg, !!x.supersededAt])).toEqual([[1, "62.5", true], [2, "60", false]]);
    // Reintento idéntico de la serie (cola offline): no duplica objetivos ni cambia nada.
    await tr.logSet(m.user, sid, { id, programExerciseId: pe.id, setIndex: 0, weightKg: 62.5, reps: 5, rir: 0, feel: null, baseRevision: 1 });
    expect(await db.select().from(trainingTarget).where(eq(trainingTarget.sessionId, sid))).toHaveLength(rows.length);
    // Una edición de la serie ya decidida no recalcula ni reescribe objetivos.
    await tr.logSet(m.user, sid, { id, programExerciseId: pe.id, setIndex: 0, weightKg: 62.5, reps: 9, rir: 2, feel: null, baseRevision: 1 });
    expect((await current(sid)).find((x) => x.setIndex === 1)?.weightKg).toBe("60");
    const again = await tr.getSession(m.user, sid);
    expect(again.exercises[0].targets[1].weightKg).toBe(60);
  });
  it("sesión terminada: lo no hecho queda «no hecho» y nunca se recalcula", async () => {
    const m = await member([{ sets: 3, reps: "8-10" }]);
    await train(m.user, [[{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }]]);
    const sid = await open(m.user);
    const pe = (await tr.getSession(m.user, sid)).exercises[0];
    await tr.logSet(m.user, sid, { id: randomUUID(), programExerciseId: pe.id, setIndex: 0, weightKg: 62.5, reps: 9, rir: 2, feel: null });
    await tr.sessionAction(m.user, sid, "finish");
    const rows = await current(sid);
    expect(rows.map((x) => x.decision).sort()).toEqual(["accepted", "not_done", "not_done"]);
    const before = (await db.select().from(trainingTarget).where(eq(trainingTarget.sessionId, sid))).length;
    await fu.saveCheckin(m.user, { energy: 1, sleep: 1, mood: 1 }); // aunque cambien las señales
    await tr.getSession(m.user, sid);
    expect(await db.select().from(trainingTarget).where(eq(trainingTarget.sessionId, sid))).toHaveLength(before);
  });
  it("reemplazo de ejercicio en la sesión: los objetivos sin registrar quedan obsoletos y se emiten para el ejercicio real", async () => {
    const m = await member([{ sets: 2, reps: "8-10" }]);
    await train(m.user, [[{ w: 60, r: 10 }, { w: 60, r: 10 }]]);
    const sid = await open(m.user);
    const pe = (await tr.getSession(m.user, sid)).exercises[0];
    await tr.setExerciseChange(m.user, sid, { programExerciseId: pe.id, change: { kind: "substitute", reason: "busy", exerciseId: SQUAT } });
    const s = await tr.getSession(m.user, sid);
    expect(s.exercises[0].targets.every((t) => t.status === "no_data")).toBe(true); // sentadilla sin historia: sin números
    const all = await db.select().from(trainingTarget).where(eq(trainingTarget.sessionId, sid));
    expect(all.filter((x) => x.supersededAt).length).toBe(2);
    expect(all.filter((x) => !x.supersededAt).every((x) => x.exerciseId === SQUAT)).toBe(true);
  });
});

describe("Métodos, profe y seguridad", () => {
  it("drop set (escenario D): cada etapa con su propia referencia; nunca la carga del top", async () => {
    const plan = [S("work", "10", { id: "sMAIN1", block: 0, stage: 0 }), S("drop", "al fallo", { id: "sDROP1", block: 0, stage: 1, restSec: 0 }), S("drop", "al fallo", { id: "sDROP2", block: 0, stage: 2, restSec: 0 })];
    const m = await member([{ sets: 3, reps: "10", detail: { ...emptyDetail(), technique: "drop_set", setPlan: plan } }]);
    await train(m.user, [[{ w: 60, r: 10 }, { w: 50, r: 8 }, { w: 40, r: 10 }]]);
    const sid = await open(m.user);
    const t = (await tr.getSession(m.user, sid)).exercises[0].targets;
    expect(t.map((x) => [x.kind, x.stage, x.weightKg])).toEqual([["work", 0, 62.5], ["drop", 1, 50], ["drop", 2, 40]]);
    expect(t[1]).toMatchObject({ pending: true, prev: { w: 50, r: 8, level: "exact" } });
  });
  it("carga del profe (escenario C): manda el plan; REPI no la reemplaza", async () => {
    const plan = [S("work", "8", { weightKg: 80 }), S("work", "8", { weightKg: 80 })];
    const m = await member([{ sets: 2, reps: "8", detail: { ...emptyDetail(), technique: "straight", setPlan: plan } }]);
    await train(m.user, [[{ w: 80, r: 5 }, { w: 80, r: 5 }]]);
    const sid = await open(m.user);
    const t = (await tr.getSession(m.user, sid)).exercises[0].targets;
    expect(t.every((x) => x.status === "coach" && x.weightKg === 80 && x.source === "coach")).toBe(true);
  });
  it("fatiga (escenario E): poca energía hoy → no sube", async () => {
    const m = await member([{ sets: 3, reps: "8-10" }]);
    await train(m.user, [[{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }]]);
    await fu.saveCheckin(m.user, { energy: 1, sleep: 2, mood: 3 });
    const sid = await open(m.user);
    const t = (await tr.getSession(m.user, sid)).exercises[0].targets[0];
    expect(t).toMatchObject({ action: "hold", weightKg: 60, status: "limited" });
    expect(t.guards).toContain("low_readiness");
  });
  it("alumno nuevo (escenario A): sin referencia, entrena igual; la sesión siguiente ya tiene objetivo", async () => {
    const m = await member([{ sets: 2, reps: "8-10" }]);
    const sid = await open(m.user);
    const s = await tr.getSession(m.user, sid);
    expect(s.exercises[0].targets[0]).toMatchObject({ status: "no_data", weightKg: null });
    for (const i of [0, 1]) await tr.logSet(m.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: i, weightKg: 40, reps: 8, rir: null });
    await tr.sessionAction(m.user, sid, "finish");
    const sid2 = await open(m.user);
    expect((await tr.getSession(m.user, sid2)).exercises[0].targets[0]).toMatchObject({ status: "ready", weightKg: 40, action: "increase_reps" });
  });
});

describe("Coach: vista, propuestas y permisos", () => {
  it("ve tendencia y propuesta; decide sin que cambie la rutina; otro coach no accede", async () => {
    const m = await member([{ sets: 3, reps: "8-10" }]);
    const t0 = Date.now();
    for (const [k, w] of [55, 57.5, 60, 62.5].entries()) await train(m.user, [[{ w, r: 10 }, { w, r: 10 }, { w, r: 10 }]], new Date(t0 - (4 - k) * 3 * 86_400_000));
    const v = await ti.clientIntelligence(m.coach, m.org, m.rel);
    const ex = v.exercises[0];
    expect(ex.trend).toMatchObject({ kind: "progressing" });
    expect(ex.proposal).toMatchObject({ kind: "load", weightKg: 65, requiresCoach: true, status: "open" });
    const again = await ti.clientIntelligence(m.coach, m.org, m.rel); // idempotente: la misma propuesta abierta
    expect(again.exercises[0].proposal?.id).toBe(ex.proposal!.id);
    const before = await db.select().from(programExercise).where(eq(programExercise.exerciseId, BENCH));
    expect(await ti.decideProposal(m.coach, m.org, ex.proposal!.id, { status: "rejected", note: "Mantengo la semana" })).toMatchObject({ status: "rejected" });
    const after = await db.select().from(programExercise).where(eq(programExercise.exerciseId, BENCH));
    expect(after.map((x) => x.detail)).toEqual(before.map((x) => x.detail));
    const [p] = await db.select().from(trainingProposal).where(eq(trainingProposal.id, ex.proposal!.id));
    expect(p).toMatchObject({ status: "rejected", decidedBy: m.coach, note: "Mantengo la semana" });
    const other = await member([{ sets: 1, reps: "10" }]);
    await expect(ti.clientIntelligence(other.coach, other.org, m.rel)).rejects.toMatchObject({ status: 404 });
    await expect(ti.decideProposal(other.coach, other.org, ex.proposal!.id, { status: "accepted" })).rejects.toMatchObject({ status: 404 });
    await expect(ti.clientIntelligence(m.user, m.org, m.rel)).rejects.toMatchObject({ status: 404 }); // el alumno no es coach
  });
  it("sin permiso de entrenamientos del alumno, nada", async () => {
    const m = await member([{ sets: 1, reps: "10" }]);
    await db.update(schema.consentGrant).set({ status: "revoked" }).where(and(eq(schema.consentGrant.relationId, m.rel), eq(schema.consentGrant.item, "training")));
    await expect(ti.clientIntelligence(m.coach, m.org, m.rel)).rejects.toMatchObject({ status: 403 });
  });
});

describe("Rendimiento (tiempos medidos en esta base local)", () => {
  it("abrir una sesión de 6 ejercicios con 30 sesiones de historia y registrar una serie", async () => {
    const m = await member(Array.from({ length: 6 }, () => ({ sets: 4, reps: "8-10" })));
    const t0 = Date.now();
    // 30 sesiones × 6 ejercicios × 4 series = 720 filas de historia (insertadas directo para no tardar minutos).
    for (let k = 0; k < 30; k++) await train(m.user, Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => ({ w: 50 + k, r: 9 }))), new Date(t0 - (30 - k) * 2 * 86_400_000));
    const sid = await open(m.user);
    const a = performance.now(); await tr.getSession(m.user, sid); const first = performance.now() - a;
    const b = performance.now(); const s = await tr.getSession(m.user, sid); const warm = performance.now() - b;
    const c = performance.now(); await tr.logSet(m.user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 80, reps: 9, rir: 2 }); const log = performance.now() - c;
    const d = performance.now(); await Promise.all(Array.from({ length: 8 }, () => tr.getSession(m.user, sid))); const conc = performance.now() - d;
    console.log(`[TI bench] getSession primera vez ${first.toFixed(0)} ms · repetida ${warm.toFixed(0)} ms · logSet+ajuste ${log.toFixed(0)} ms · 8 getSession simultáneos ${conc.toFixed(0)} ms`);
    expect(s.exercises.every((e) => e.targets.length === 4)).toBe(true);
    expect(await db.select().from(trainingTarget).where(eq(trainingTarget.sessionId, sid))).toHaveLength(24);
  }, 240_000);
});
