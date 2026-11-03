// D183: series principales con etapas conectadas, métodos no destructivos, circuitos por vueltas y métricas consistentes,
// de punta a punta contra la base de pruebas (crear la rutina, asignarla, entrenar, sincronizar, resumir, historial).
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMethod, emptyDetail, localDate, type ExerciseDetail, type ProgramDoc } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as ac from "@/server/gym/access-control";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";

let n = 0;
const mail = () => `cm${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Métodos") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const emailOf = async (id: string) => (await db.select({ e: schema.user.email }).from(schema.user).where(eq(schema.user.id, id)))[0].e;
const err = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);

const EX: Record<string, string> = {};
beforeAll(async () => {
  for (const [name, g] of [["Press métodos", "Pecho"], ["Curl métodos", "Bíceps"], ["Extensión métodos", "Tríceps"], ["Sentadilla métodos", "Piernas"], ["Remo métodos", "Espalda"]]) {
    const [e] = await db.insert(schema.exercise).values({ name, muscleGroup: g }).onConflictDoNothing().returning();
    EX[name] = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

async function coachWithClient() {
  const coach = await verified("Coach Métodos");
  const org = await acc.createCoachOrganization(coach, { brand: `Coach métodos ${n}` });
  const u = await verified("Alumna Métodos");
  const inv = await acc.inviteCoachClient(coach, org.id, { email: await emailOf(u) });
  const r = await acc.acceptInvitation(u, inv.code, []);
  return { coach, orgId: org.id, userId: u, relId: r.relationId };
}
const E = (name: string, sets: number, reps: string, detail?: ExerciseDetail | null) => ({ exerciseId: EX[name], name, sets, reps, rir: 2, restSec: 90, ...(detail ? { detail } : {}) });
const doc = (exercises: ReturnType<typeof E>[]): ProgramDoc => ({ name: "Métodos", weeks: 4, note: "", days: [{ name: "Día A", exercises }] });

async function assignAndStart(w: Awaited<ReturnType<typeof coachWithClient>>, d: ProgramDoc) {
  const pid = await tr.createTemplate(w.coach, w.orgId, d);
  await tr.assignProgram(w.coach, w.orgId, pid, { coachClientIds: [w.relId], startsOn: localDate(new Date()) });
  // Cerca de la medianoche AR, «hoy» del servidor puede caer antes del inicio: se corre a ayer como en las otras pruebas.
  await db.update(schema.programAssignment).set({ startsOn: localDate(new Date(Date.now() - 2 * 86_400_000)) }).where(eq(schema.programAssignment.coachClientId, w.relId));
  const t = await tr.myTraining(w.userId);
  if (t.state !== "ready") throw new Error("sin programa");
  const id = randomUUID();
  await tr.startSession(w.userId, { id, dayId: t.program.days[0].id });
  return { id, pid, s: await tr.getSession(w.userId, id) };
}
const log = (userId: string, sid: string, peId: string, setIndex: number, weightKg: number | null, reps: number, id = randomUUID()) =>
  tr.logSet(userId, sid, { id, programExerciseId: peId, setIndex, weightKg, reps, rir: 1 });

describe("D183 · escenario A: drop set sólo en la cuarta serie", () => {
  it("el alumno ve 4 series y la cuarta con 2 drops; registra todo; el resumen no cuenta los drops como series", async () => {
    const w = await coachWithClient();
    const drop = applyMethod(null, { sets: 4, reps: "10", rir: 2 }, "drop_set", [3]).detail;
    const { id, s } = await assignAndStart(w, doc([E("Press métodos", 4, "10", drop)]));
    const e = s.exercises[0];
    expect(e.sets).toBe(6); // filas registrables
    expect(e.detail?.setPlan?.map((r) => `${r.block}.${r.stage}:${r.kind}`)).toEqual(["0.0:work", "1.0:work", "2.0:work", "3.0:work", "3.1:drop", "3.2:drop"]);
    for (const [i, w8, r] of [[0, 60, 10], [1, 60, 10], [2, 60, 10], [3, 60, 10], [4, 50, 8], [5, 40, 10]] as const) await log(w.userId, id, e.id, i, w8, r);
    await tr.sessionAction(w.userId, id, "finish");
    const sum = await tr.sessionSummary(w.userId, id);
    expect([sum.setsDone, sum.setsTotal, sum.exDone]).toEqual([4, 4, 1]);
    expect(sum.metrics).toMatchObject({ mainDone: 4, stagesDone: 2, rowsDone: 6, tonnageKg: 2400 + 400 + 400 });
    expect(sum.volumeKg).toBe(3200);
    // Cada registro guarda a qué serie y etapa pertenece (con la identidad estable de la fila).
    const rows = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, id));
    const byIdx = new Map(rows.map((r) => [r.setIndex, r]));
    expect([byIdx.get(4)!.setKind, byIdx.get(4)!.blockIndex, byIdx.get(4)!.stageIndex, byIdx.get(4)!.specId]).toEqual(["drop", 3, 1, e.detail!.setPlan![4].id]);
    expect([byIdx.get(0)!.setKind, byIdx.get(0)!.blockIndex, byIdx.get(0)!.stageIndex]).toEqual(["work", 0, 0]);
    // Historial: «4 series», no 6.
    expect((await tr.myHistory(w.userId))[0]).toMatchObject({ sets: 4, volumeKg: 3200 });
  });
});

describe("D183 · escenario B: rest-pause con 3 mini series, cortado antes", () => {
  it("la sesión parcial se conserva y la serie cuenta como hecha", async () => {
    const w = await coachWithClient();
    const rp = applyMethod(null, { sets: 1, reps: "10", rir: 1 }, "rest_pause", [0], { stages: 3 }).detail;
    const { id, s } = await assignAndStart(w, doc([E("Press métodos", 1, "10", rp)]));
    const e = s.exercises[0];
    await log(w.userId, id, e.id, 0, 60, 10);
    await log(w.userId, id, e.id, 1, 60, 4);
    const mid = await tr.getSession(w.userId, id);
    expect(mid.exercises[0].logs.map((l) => [l.setIndex, l.reps])).toEqual([[0, 10], [1, 4]]); // parcial guardado
    await tr.sessionAction(w.userId, id, "finish");
    const sum = await tr.sessionSummary(w.userId, id);
    expect([sum.setsDone, sum.setsTotal, sum.exDone]).toEqual([1, 1, 1]);
    expect(sum.metrics).toMatchObject({ stagesPlanned: 3, stagesDone: 1, reps: 14 });
  });
});

describe("D183 · escenario C: circuito de 4 ejercicios × 3 vueltas", () => {
  it("dos vueltas completas y una parcial: resultados individuales por ejercicio y por vuelta", async () => {
    const w = await coachWithClient();
    const c = { ...emptyDetail(), group: "A", groupKind: "circuit" as const, rounds: 3 };
    const names = ["Press métodos", "Remo métodos", "Sentadilla métodos", "Curl métodos"];
    const { id, s } = await assignAndStart(w, doc(names.map((nm) => E(nm, 3, "12", c))));
    for (let round = 0; round < 3; round++) for (const [i, e] of s.exercises.entries()) {
      if (round === 2 && i >= 2) continue; // tercera vuelta parcial
      await log(w.userId, id, e.id, round, 20, 12);
    }
    await tr.sessionAction(w.userId, id, "finish");
    const sum = await tr.sessionSummary(w.userId, id);
    expect([sum.setsDone, sum.setsTotal, sum.exDone]).toEqual([10, 12, 2]);
    expect(sum.exercises.map((e) => e.logs.length)).toEqual([3, 3, 2, 2]);
  });
  it("las vueltas gobiernan: un circuito con series distintas a las vueltas no se guarda", async () => {
    const w = await coachWithClient();
    const c = { ...emptyDetail(), group: "A", groupKind: "circuit" as const, rounds: 3 };
    const e = await err(tr.createTemplate(w.coach, w.orgId, doc([E("Press métodos", 3, "12", c), E("Remo métodos", 4, "12", c)])));
    expect(e?.message).toMatch(/circuito A tiene 3 vueltas, pero Remo métodos tiene 4 series/);
  });
});

describe("D183 · escenario D: historial anterior al nuevo formato", () => {
  it("un plan plano con drops sin bloques ni identidad se lee igual, sin perder pesos ni reps, y guardarlo sin cambios no crea versión", async () => {
    const w = await coachWithClient();
    const { id, pid, s } = await assignAndStart(w, doc([E("Press métodos", 3, "10")]));
    // Simula una versión guardada antes de D183 (formato D134): drops como filas sueltas, sin id/bloque/etapa.
    const legacy = { technique: "drop_set", setPlan: [
      { kind: "work", reps: "10", weightKg: 60, pct1rm: null, rir: 0, rpe: null, restSec: null, note: null },
      { kind: "drop", reps: "al fallo", weightKg: 48, pct1rm: null, rir: null, rpe: null, restSec: 0, note: "−20 %" },
      { kind: "drop", reps: "al fallo", weightKg: 36, pct1rm: null, rir: null, rpe: null, restSec: 0, note: "−20 %" },
    ], group: null, groupKind: null, rounds: null, tempo: null, variant: null, unilateral: false, progression: null };
    await db.update(schema.programExercise).set({ detail: legacy }).where(eq(schema.programExercise.id, s.exercises[0].id));
    // Registros viejos: sin las columnas nuevas.
    for (const [i, kg, r] of [[0, 60, 10], [1, 48, 8], [2, 36, 7]] as const)
      await db.insert(schema.setLog).values({ id: randomUUID(), sessionId: id, programExerciseId: s.exercises[0].id, exerciseId: EX["Press métodos"], setIndex: i, weightKg: String(kg), reps: r, completedAt: new Date() });
    await tr.sessionAction(w.userId, id, "finish");
    const sum = await tr.sessionSummary(w.userId, id);
    expect(sum.exercises[0].logs.map((l) => [l.weightKg, l.reps])).toEqual([[60, 10], [48, 8], [36, 7]]);
    expect([sum.setsDone, sum.setsTotal]).toEqual([1, 1]);
    expect(sum.metrics).toMatchObject({ stagesDone: 2, tonnageKg: 600 + 384 + 252 });
    // La versión quedó en uso: guardar el mismo documento (que ahora se normaliza con bloques e identidad) no crea otra.
    const full = await tr.clientDetail(w.coach, w.orgId, w.relId);
    const prog = await tr.getProgram(w.coach, w.orgId, full.program!.programId);
    expect((await tr.saveProgram(w.coach, w.orgId, full.program!.programId, prog.doc)).created).toBe(false);
    expect(pid).toBeTruthy();
  });
});

describe("D183 · persistencia: reintentos, otro dispositivo, cambio de rutina", () => {
  it("reintentar la misma etapa no duplica; otro dispositivo en la misma etapa genera conflicto, no un segundo registro", async () => {
    const w = await coachWithClient();
    const drop = applyMethod(null, { sets: 1, reps: "10", rir: 2 }, "drop_set", [0], { stages: 1 }).detail;
    const { id, s } = await assignAndStart(w, doc([E("Press métodos", 1, "10", drop)]));
    const pe = s.exercises[0].id, setId = randomUUID();
    await log(w.userId, id, pe, 1, 45, 8, setId);
    await log(w.userId, id, pe, 1, 45, 8, setId); // reintento de la cola
    const other = await tr.logSet(w.userId, id, { id: randomUUID(), programExerciseId: pe, setIndex: 1, weightKg: 40, reps: 9, rir: 1, baseRevision: 0 });
    expect(other.status).toBe("conflict");
    const rows = await db.select().from(schema.setLog).where(and(eq(schema.setLog.sessionId, id), eq(schema.setLog.setIndex, 1)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weightKg: "45", reps: 8, stageIndex: 1, setKind: "drop" });
    // Modificación posterior de la etapa: nueva revisión, misma fila.
    await tr.logSet(w.userId, id, { id: setId, programExerciseId: pe, setIndex: 1, weightKg: 45, reps: 9, rir: 1, baseRevision: 1 });
    const [after] = await db.select().from(schema.setLog).where(eq(schema.setLog.id, setId));
    expect([after.reps, after.revision]).toEqual([9, 2]);
  });
  it("el profe agrega una etapa antes de otra después de entrenar: lo registrado conserva su identidad y su lugar", async () => {
    const w = await coachWithClient();
    const { id, pid, s } = await assignAndStart(w, doc([E("Press métodos", 3, "10")]));
    const pe = s.exercises[0];
    await log(w.userId, id, pe.id, 1, 60, 10);
    await tr.sessionAction(w.userId, id, "finish");
    const full = await tr.clientDetail(w.coach, w.orgId, w.relId);
    const prog = await tr.getProgram(w.coach, w.orgId, full.program!.programId);
    const cur = prog.doc.days[0].exercises[0];
    const next = applyMethod(cur.detail ?? null, { sets: cur.sets, reps: cur.reps, rir: cur.rir }, "drop_set", [0], { stages: 1 }).detail;
    const r = await tr.saveProgram(w.coach, w.orgId, full.program!.programId, { ...prog.doc, days: [{ ...prog.doc.days[0], exercises: [{ ...cur, detail: next, sets: next.setPlan!.length }] }] });
    expect(r.created).toBe(true); // versión nueva: la sesión hecha no cambia
    const [l] = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, id));
    expect([l.setIndex, l.specId, l.blockIndex]).toEqual([1, "r1", 1]);
    const v2 = await tr.getProgram(w.coach, w.orgId, full.program!.programId);
    const plan = v2.doc.days[0].exercises[0].detail!.setPlan!;
    expect(plan.map((x) => x.id)).toEqual(["r0", plan[1].id, "r1", "r2"]); // la fila hecha («r1») mantiene su identidad
    expect(pid).toBeTruthy();
  });
  it("permisos: otra persona no registra en una sesión ajena; otro coach no edita el programa", async () => {
    const w = await coachWithClient();
    const { id, s } = await assignAndStart(w, doc([E("Press métodos", 2, "10")]));
    const stranger = await verified("Ajena");
    expect(await err(log(stranger, id, s.exercises[0].id, 0, 60, 10))).toBeInstanceOf(AccessError);
    const other = await coachWithClient();
    const full = await tr.clientDetail(w.coach, w.orgId, w.relId);
    expect(await err(tr.saveProgram(other.coach, other.orgId, full.program!.programId, doc([E("Press métodos", 2, "10")])))).toBeInstanceOf(AccessError);
    expect(await err(tr.saveProgram(other.coach, w.orgId, full.program!.programId, doc([E("Press métodos", 2, "10")])))).toBeInstanceOf(AccessError);
  });
});

describe("D183 · escenario F: control de ingreso presencial en pausa", () => {
  async function gymMember(enabled: boolean) {
    const owner = await verified("Dueño pausa");
    const org = await acc.createGymOrganization(owner, { name: `Gym pausa ${n}-${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    if (enabled) await ac.setAccessEnabled(org.id, true, owner);
    const floor = await verified("Profe pausa");
    await db.insert(schema.staffMembership).values({ userId: floor, orgId: org.id, locationId: A.id, role: "floor_trainer" });
    await gym.startShift(floor, org.id, A.id);
    const userId = await verified("Socio pausa");
    const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId, status: "active" }).returning();
    await db.insert(schema.consentGrant).values({ userId, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
    const drop = applyMethod(null, { sets: 2, reps: "10", rir: 2 }, "drop_set", [1], { stages: 1 }).detail;
    await gym.saveMemberProgram(floor, org.id, m.id, { doc: doc([E("Remo métodos", 3, "10", drop)]), reason: "Inicial" });
    await db.update(schema.programAssignment).set({ startsOn: localDate(new Date(Date.now() - 2 * 86_400_000)) }).where(eq(schema.programAssignment.gymMemberId, m.id));
    return { owner, org: org.id, userId, memberId: m.id };
  }
  it("con el control desactivado: empieza, registra etapas, sincroniza y termina sin QR ni pase", async () => {
    const g = await gymMember(false);
    const t = await tr.myTraining(g.userId);
    if (t.state !== "ready") throw new Error("sin programa");
    const id = randomUUID();
    const s0 = await tr.startSession(g.userId, { id, dayId: t.program.days[0].id });
    expect(s0.presenceCheckinId).toBeNull();
    const s = await tr.getSession(g.userId, id);
    for (const i of [0, 1, 2]) await log(g.userId, id, s.exercises[0].id, i, 40, 10);
    await tr.sessionAction(g.userId, id, "finish");
    const sum = await tr.sessionSummary(g.userId, id);
    expect([sum.status, sum.setsDone, sum.setsTotal]).toEqual(["completed", 2, 2]);
    const st = await ac.myPresence(g.userId);
    expect(st.gyms[0]?.startNeedsCheckin ?? false).toBe(false);
  });
  it("encendido y después apagado por el gimnasio: deja de pedir el ingreso; la membresía vencida sigue bloqueando", async () => {
    const g = await gymMember(true);
    const t = await tr.myTraining(g.userId);
    if (t.state !== "ready") throw new Error("sin programa");
    expect((await err(tr.startSession(g.userId, { id: randomUUID(), dayId: t.program.days[0].id })))?.code).toBe("presence_required");
    await ac.setAccessEnabled(g.org, false, g.owner);
    const id = randomUUID();
    await tr.startSession(g.userId, { id, dayId: t.program.days[0].id });
    const s = await tr.getSession(g.userId, id);
    await log(g.userId, id, s.exercises[0].id, 0, 40, 10);
    await db.update(schema.gymMember).set({ status: "suspended" }).where(eq(schema.gymMember.id, g.memberId));
    expect(await err(log(g.userId, id, s.exercises[0].id, 1, 40, 10))).toBeInstanceOf(AccessError); // permisos y relación se conservan
  });
});
