import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate, presetPlan, type ProgramDoc } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as cp from "@/server/coachpay/services";
import { AccessError, resetRateLimits } from "@/server/access/util";

const emailOf = async (id: string) => (await db.select({ e: schema.user.email }).from(schema.user).where(eq(schema.user.id, id)))[0].e;

const PW = "prueba1234";
let n = 0;
const mail = () => `tr${++n}.${Date.now()}@test.repi.local`;
async function verified(email = mail(), name = "Persona Prueba") {
  const r = await acc.signUpPerson({ name, email, password: PW, terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const expectErr = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(AccessError);
  expect((e as AccessError).code).toBe(code);
};

let EX: Record<string, string> = {};
beforeAll(async () => {
  for (const [name, g] of [["Press de banca", "Pecho"], ["Remo con barra", "Espalda"], ["Sentadilla", "Piernas"], ["Prensa", "Piernas"]]) {
    const [e] = await db.insert(schema.exercise).values({ name, muscleGroup: g }).onConflictDoNothing().returning();
    EX[name] = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

const ex = (name: string, sets = 3, reps = "8-10", restSec = 120) => ({ exerciseId: EX[name], name, sets, reps, rir: 2, restSec });
const DOC = () => ({
  name: "Hipertrofia · 2 días", weeks: 6, note: "Semana de carga",
  days: [{ name: "Torso A", exercises: [ex("Press de banca", 3), ex("Remo con barra", 3)] }, { name: "Piernas", exercises: [ex("Sentadilla", 2, "6-8", 150), ex("Prensa", 2)] }],
});

async function coachWithClients(k = 1) {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach, { brand: `Coach ${n}` });
  const clients: { userId: string; relId: string }[] = [];
  for (let i = 0; i < k; i++) {
    const u = await verified();
    const inv = await acc.inviteCoachClient(coach, org.id, { email: await emailOf(u) });
    const r = await acc.acceptInvitation(u, inv.code, []);
    clients.push({ userId: u, relId: r.relationId });
  }
  return { coach, orgId: org.id, clients };
}
const today = () => localDate(new Date());

describe("programas versionados y asignación", () => {
  it("asignar crea copias independientes; editar la plantilla después no toca a los clientes", async () => {
    const { coach, orgId, clients: [a, b] } = await coachWithClients(2);
    const pid = await tr.createTemplate(coach, orgId, DOC());
    expect((await tr.saveProgram(coach, orgId, pid, DOC())).created).toBe(false); // sin cambios, sin versión
    const r = await tr.assignProgram(coach, orgId, pid, { coachClientIds: [a.relId, b.relId], startsOn: today() });
    expect(r.names).toHaveLength(2);
    const edited = { ...DOC(), name: "Hipertrofia v2" };
    expect(await tr.saveProgram(coach, orgId, pid, edited)).toEqual({ version: 2, created: true });
    const ta = await tr.myTraining(a.userId);
    expect(ta.state === "ready" && ta.program.name).toBe("Hipertrofia · 2 días");
    // Copias distintas: editar la de A no cambia la de B.
    const detA = await tr.clientDetail(coach, orgId, a.relId);
    await tr.saveProgram(coach, orgId, detA.program!.programId, { ...DOC(), name: "Sólo para A" });
    const tb = await tr.myTraining(b.userId);
    expect(tb.state === "ready" && tb.program.name).toBe("Hipertrofia · 2 días");
    expect((await tr.listTemplates(coach, orgId))[0]).toMatchObject({ name: "Hipertrofia v2", clients: 2, version: 2 });
  });
  it("otro coach no ve ni asigna programas ajenos; no se asigna a clientes de otra organización", async () => {
    const one = await coachWithClients(1);
    const two = await coachWithClients(1);
    const pid = await tr.createTemplate(one.coach, one.orgId, DOC());
    await expectErr(tr.getProgram(two.coach, one.orgId, pid), "not_found");
    await expectErr(tr.getProgram(two.coach, two.orgId, pid), "not_found");
    await expectErr(tr.assignProgram(one.coach, one.orgId, pid, { coachClientIds: [two.clients[0].relId], startsOn: today() }), "not_found");
    await expectErr(tr.clientDetail(two.coach, two.orgId, one.clients[0].relId), "not_found");
  });
  it("valida documento, biblioteca y fecha", async () => {
    const { coach, orgId, clients: [a] } = await coachWithClients(1);
    await expectErr(tr.createTemplate(coach, orgId, { ...DOC(), days: [] }), "invalid");
    await expectErr(tr.createTemplate(coach, orgId, { ...DOC(), days: [{ name: "X", exercises: [{ ...ex("Sentadilla"), exerciseId: randomUUID() }] }] }), "invalid");
    const pid = await tr.createTemplate(coach, orgId, DOC());
    await expectErr(tr.assignProgram(coach, orgId, pid, { coachClientIds: [a.relId], startsOn: "2020-01-01" }), "invalid");
  });
});

describe("sesión del alumno", () => {
  async function ready() {
    const ctx = await coachWithClients(1);
    const pid = await tr.createTemplate(ctx.coach, ctx.orgId, DOC());
    await tr.assignProgram(ctx.coach, ctx.orgId, pid, { coachClientIds: [ctx.clients[0].relId], startsOn: today() });
    const t = await tr.myTraining(ctx.clients[0].userId);
    if (t.state !== "ready") throw new Error("sin programa");
    return { ...ctx, user: ctx.clients[0].userId, t };
  }

  it("F-CL-14: aviso de programa nuevo con autor; al editarlo pasa a actualizado y la versión anterior se puede consultar", async () => {
    const ctx = await ready();
    expect(ctx.t.program.update).toMatchObject({ kind: "new", hasPrevious: false });
    expect(ctx.t.program.update?.author).toBeTruthy();
    await expectErr(tr.previousVersion(ctx.user), "not_found");
    const [a] = await db.select().from(schema.programAssignment).where(and(eq(schema.programAssignment.coachClientId, ctx.clients[0].relId), eq(schema.programAssignment.status, "active")));
    await db.update(schema.programAssignment).set({ assignedAt: new Date(Date.now() - 5 * 60_000) }).where(eq(schema.programAssignment.id, a.id)); // asignado hace 5 min
    const doc = DOC();
    doc.days[0].exercises[0].sets = 5;
    await tr.saveProgram(ctx.coach, ctx.orgId, a.programId, doc); // sin sesiones: se edita en el lugar
    const t2 = await tr.myTraining(ctx.user);
    if (t2.state !== "ready") throw new Error("sin programa");
    expect(t2.program.version).toBe(1);
    expect(t2.program.update).toMatchObject({ kind: "updated", hasPrevious: false });
    expect(t2.program.update?.key).not.toBe(ctx.t.program.update?.key);
    // Ya entrenó con esa versión: la próxima edición crea la versión 2 y la 1 queda consultable.
    await tr.startSession(ctx.user, { id: randomUUID(), dayId: t2.program.days[0].id });
    doc.days[0].exercises[0].sets = 3;
    await tr.saveProgram(ctx.coach, ctx.orgId, a.programId, doc);
    const t3 = await tr.myTraining(ctx.user);
    if (t3.state !== "ready") throw new Error("sin programa");
    expect(t3.program.version).toBe(2);
    expect(t3.program.update).toMatchObject({ kind: "updated", hasPrevious: true });
    const prev = await tr.previousVersion(ctx.user);
    expect(prev.number).toBe(1);
    expect(prev.days[0].exercises[0].sets).toBe(5);
  });

  it("el día elegido abre sus ejercicios (Piernas no abre Torso A) y el inicio es idempotente", async () => {
    const { user, t } = await ready();
    expect(t.program.nextDay).toBe(0);
    const id = randomUUID();
    const s = await tr.startSession(user, { id, dayId: t.program.days[1].id });
    expect(s.dayName).toBe("Piernas");
    expect((await tr.startSession(user, { id, dayId: t.program.days[1].id })).id).toBe(id);
    await expectErr(tr.startSession(user, { id: randomUUID(), dayId: t.program.days[0].id }), "open_session");
    const g = await tr.getSession(user, id);
    expect(g.exercises.map((e) => e.name)).toEqual(["Sentadilla", "Prensa"]);
    expect(g.exercises[0].restSec).toBe(150); // descanso por ejercicio, no global
  });

  it("series idempotentes, validadas y aisladas por usuario", async () => {
    const { user, t } = await ready();
    const sid = randomUUID();
    await tr.startSession(user, { id: sid, dayId: t.program.days[0].id });
    const pe = (await tr.getSession(user, sid)).exercises[0];
    const setId = randomUUID();
    await tr.logSet(user, sid, { id: setId, programExerciseId: pe.id, setIndex: 0, weightKg: 80, reps: 10, rir: 2 });
    await tr.logSet(user, sid, { id: setId, programExerciseId: pe.id, setIndex: 0, weightKg: 82.5, reps: 9, rir: 1 }); // reintento/edición
    const rows = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weightKg: "82.5", reps: 9, rir: 1 });
    await expectErr(tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe.id, setIndex: 3, weightKg: 80, reps: 10, rir: null }), "invalid");
    await expectErr(tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe.id, setIndex: 1, weightKg: 80.123, reps: 10, rir: null }), "invalid");
    const otro = await verified();
    await expectErr(tr.logSet(otro, sid, { id: randomUUID(), programExerciseId: pe.id, setIndex: 1, weightKg: 80, reps: 10, rir: null }), "not_found");
    await expectErr(tr.getSession(otro, sid), "not_found");
  });

  it("pausa no suma tiempo; finalizar sin series descarta; con series completa y acepta RPE", async () => {
    const { user, t } = await ready();
    const s1 = randomUUID();
    const t0 = new Date("2030-01-01T10:00:00Z");
    await tr.startSession(user, { id: s1, dayId: t.program.days[0].id }, t0);
    await db.update(schema.workoutSession).set({ startedAt: t0, lastResumedAt: t0 }).where(eq(schema.workoutSession.id, s1));
    await tr.sessionAction(user, s1, "pause", new Date("2030-01-01T10:10:00Z"));
    await tr.sessionAction(user, s1, "resume", new Date("2030-01-01T10:40:00Z"));
    expect((await tr.getSession(user, s1, new Date("2030-01-01T10:45:00Z"))).elapsedSec).toBe(15 * 60);
    expect((await tr.sessionAction(user, s1, "finish")).status).toBe("abandoned");

    const s2 = randomUUID();
    await tr.startSession(user, { id: s2, dayId: t.program.days[0].id });
    const pe = (await tr.getSession(user, s2)).exercises[0];
    await expectErr(tr.sessionFeedback(user, s2, { rpe: 7 }), "invalid");
    await tr.logSet(user, s2, { id: randomUUID(), programExerciseId: pe.id, setIndex: 0, weightKg: 80, reps: 10, rir: 2 });
    expect((await tr.sessionAction(user, s2, "finish")).status).toBe("completed");
    expect((await tr.sessionAction(user, s2, "finish")).status).toBe("completed");
    await tr.sessionFeedback(user, s2, { rpe: 8, note: "Hombro bien" });
    const t2 = await tr.myTraining(user);
    expect(t2.state === "ready" && t2.program.nextDay).toBe(1); // rotación: después de Torso A viene Piernas
    expect(t2.stats.weekDone).toBe(1);
  });

  it("récord sólo contra historia comparable; el resumen sale de lo registrado", async () => {
    const { user, t, coach, orgId, clients } = await ready();
    const day = t.program.days[0];
    const run = async (w: number, r: number) => {
      const id = randomUUID();
      await tr.startSession(user, { id, dayId: day.id });
      const pe = (await tr.getSession(user, id)).exercises[0];
      await tr.logSet(user, id, { id: randomUUID(), programExerciseId: pe.id, setIndex: 0, weightKg: w, reps: r, rir: null });
      await tr.sessionAction(user, id, "finish");
      return tr.sessionSummary(user, id);
    };
    const first = await run(85, 6);
    expect(first.prs).toHaveLength(0);
    expect(first).toMatchObject({ setsDone: 1, setsTotal: 6, exDone: 0, exTotal: 2, volumeKg: 510 });
    const second = await run(87.5, 7);
    expect(second.prs[0]).toMatchObject({ exercise: "Press de banca", previous: { weightKg: 85, reps: 6 }, current: { weightKg: 87.5, reps: 7 } });
    const third = await run(80, 5);
    expect(third.prs).toHaveLength(0);
    const det = await tr.clientDetail(coach, orgId, clients[0].relId);
    expect(det.sessions.filter((s) => s.status === "completed")).toHaveLength(3);
    const ov = await tr.coachOverview(coach, orgId);
    expect(ov.kpis).toMatchObject({ active: 1, noProgram: 0, weekSessions: 3, adherence: 100 });
  });

  it("editar el programa del cliente durante la semana no reescribe una sesión ya iniciada", async () => {
    const { user, t, coach, orgId, clients } = await ready();
    const sid = randomUUID();
    await tr.startSession(user, { id: sid, dayId: t.program.days[0].id });
    const det = await tr.clientDetail(coach, orgId, clients[0].relId);
    const d = DOC();
    d.days[0].exercises = [ex("Sentadilla", 5, "5")];
    expect((await tr.saveProgram(coach, orgId, det.program!.programId, d)).created).toBe(true);
    expect((await tr.getSession(user, sid)).exercises.map((e) => e.name)).toEqual(["Press de banca", "Remo con barra"]);
    const after = await tr.myTraining(user);
    expect(after.state === "ready" && after.program.days[0].exercises.map((e) => e.name)).toEqual(["Sentadilla"]);
  });

  it("programa con inicio futuro: estado programado y sin sesión", async () => {
    const ctx = await coachWithClients(1);
    const pid = await tr.createTemplate(ctx.coach, ctx.orgId, DOC());
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await tr.assignProgram(ctx.coach, ctx.orgId, pid, { coachClientIds: [ctx.clients[0].relId], startsOn: future });
    const t = await tr.myTraining(ctx.clients[0].userId);
    expect(t.state).toBe("scheduled");
    await expectErr(tr.startSession(ctx.clients[0].userId, { id: randomUUID(), dayId: randomUUID() }), "not_started");
  });

  it("sin programa: estado vacío útil", async () => {
    const ctx = await coachWithClients(1);
    expect((await tr.myTraining(ctx.clients[0].userId)).state).toBe("no_program");
    const ov = await tr.coachOverview(ctx.coach, ctx.orgId);
    expect(ov.kpis.noProgram).toBe(1);
    expect(ov.clients[0].adherence).toBeNull();
  });
});

describe("cobros manuales del coach (F-BL-01, D80)", () => {
  it("cargo → pago → KPIs por moneda; anular exige motivo; otro coach no ve nada; el alumno ve lo suyo", async () => {
    const { coach, orgId, clients } = await coachWithClients(2);
    const [a, b] = clients;
    const now = new Date("2026-10-15T15:00:00Z");
    await expectErr(cp.createCharge(coach, orgId, { coachClientId: a.relId, concept: " ", amountMinor: 100, currency: "ARS", dueOn: "2026-10-10" }), "invalid");
    await expectErr(cp.createCharge(coach, orgId, { coachClientId: a.relId, concept: "Plan", amountMinor: 0, currency: "ARS", dueOn: "2026-10-10" }), "invalid");
    const vencido = await cp.createCharge(coach, orgId, { coachClientId: a.relId, concept: "Plan octubre", amountMinor: 3_000_000, currency: "ARS", dueOn: "2026-10-10" });
    await cp.createCharge(coach, orgId, { coachClientId: a.relId, concept: "Plan noviembre", amountMinor: 3_000_000, currency: "ARS", dueOn: "2026-11-10" });
    const usd = await cp.createCharge(coach, orgId, { coachClientId: b.relId, concept: "Online", amountMinor: 5_000, currency: "USD", dueOn: "2026-10-20" });
    let p = await cp.coachPayments(coach, orgId, now);
    expect(p.totals.ARS).toEqual({ collectedMonth: 0, pending: 3_000_000, overdue: 3_000_000 });
    expect(p.totals.USD).toEqual({ collectedMonth: 0, pending: 5_000, overdue: 0 });
    await expectErr(cp.registerPayment(coach, orgId, vencido.id, { paidOn: "2099-01-01", method: "efectivo" }), "invalid");
    await cp.registerPayment(coach, orgId, vencido.id, { paidOn: "2026-10-12", method: "transferencia", note: "CBU" });
    await expectErr(cp.registerPayment(coach, orgId, vencido.id, { paidOn: "2026-10-12", method: "efectivo" }), "invalid");
    p = await cp.coachPayments(coach, orgId, now);
    expect(p.totals.ARS).toEqual({ collectedMonth: 3_000_000, pending: 3_000_000, overdue: 0 });
    await expectErr(cp.voidCharge(coach, orgId, usd.id, " "), "invalid");
    await cp.voidCharge(coach, orgId, usd.id, "Se cargó dos veces");
    expect((await cp.coachPayments(coach, orgId, now)).totals.USD).toEqual({ collectedMonth: 0, pending: 0, overdue: 0 });
    const hist = await cp.clientCharges(coach, orgId, b.relId, now);
    expect(hist.charges[0]).toMatchObject({ status: "void", voidReason: "Se cargó dos veces" });
    // Otro coach no accede ni por id.
    const otro = await coachWithClients(1);
    await expectErr(cp.coachPayments(otro.coach, orgId), "not_found");
    await expectErr(cp.registerPayment(otro.coach, otro.orgId, vencido.id, { paidOn: "2026-10-12", method: "efectivo" }), "not_found");
    await expectErr(cp.createCharge(coach, orgId, { coachClientId: otro.clients[0].relId, concept: "X", amountMinor: 1, currency: "ARS", dueOn: "2026-10-10" }), "not_found");
    // El alumno ve sus cargos (no los de otra persona ni anulados nunca pagados).
    const mine = await cp.myCharges(a.userId, now);
    expect(mine.coaches).toHaveLength(1);
    expect(mine.coaches[0].charges.map((c) => c.concept).sort()).toEqual(["Plan noviembre", "Plan octubre"]);
    expect((await cp.myCharges(b.userId, now)).coaches).toEqual([]);
  });
});

describe("rendimiento del cliente (F-CO-04)", () => {
  it("1RM estimado por Epley desde series reales, volumen por grupo y sin acceso de otro coach", async () => {
    const ctx = await coachWithClients(1);
    const pid = await tr.createTemplate(ctx.coach, ctx.orgId, DOC());
    await tr.assignProgram(ctx.coach, ctx.orgId, pid, { coachClientIds: [ctx.clients[0].relId], startsOn: today() });
    const user = ctx.clients[0].userId;
    const t = await tr.myTraining(user);
    if (t.state !== "ready") throw new Error("sin programa");
    const sid = randomUUID();
    await tr.startSession(user, { id: sid, dayId: t.program.days[0].id });
    const s = await tr.getSession(user, sid);
    const bench = s.exercises.find((e) => e.name === "Press de banca")!;
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: bench.id, setIndex: 0, weightKg: 100, reps: 10, rir: 2 });
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: bench.id, setIndex: 1, weightKg: 60, reps: 15, rir: 2 }); // > 12 reps: no estima
    const p = await tr.clientPerformance(ctx.coach, ctx.orgId, ctx.clients[0].relId);
    expect(p.exercises.find((e) => e.name === "Press de banca")?.best).toEqual({ e1rm: 133.3, weightKg: 100, reps: 10 });
    expect(p.groups.find((g) => g.group === "Pecho")?.thisWeek).toBe(1900);
    expect(p.formula).toMatch(/Epley/);
    const otro = await coachWithClients(1);
    await expectErr(tr.clientPerformance(otro.coach, otro.orgId, ctx.clients[0].relId), "not_found");
  });
});

describe("prescripción avanzada (D134)", () => {
  it("el detalle (top set, drop, combinación, tempo) se guarda, se asigna y llega a la sesión con las series del plan", async () => {
    const { coach, orgId, clients: [a] } = await coachWithClients(1);
    const d: ProgramDoc = DOC();
    const plan = presetPlan("top_backoff", { sets: 3, reps: "8", weightKg: 100 });
    d.days[0].exercises[0] = { ...d.days[0].exercises[0], sets: 99, detail: { technique: "top_backoff", setPlan: plan, group: "A", groupKind: "superset", rounds: null, tempo: "3-1-1-0", variant: "con pausa", unilateral: false, progression: null } };
    d.days[0].exercises[1] = { ...d.days[0].exercises[1], detail: { technique: "straight", setPlan: null, group: "A", groupKind: "superset", rounds: null, tempo: null, variant: null, unilateral: false, progression: null } };
    const pid = await tr.createTemplate(coach, orgId, d);
    await tr.assignProgram(coach, orgId, pid, { coachClientIds: [a.relId], startsOn: today() });
    const t = await tr.myTraining(a.userId);
    if (t.state !== "ready") throw new Error("sin programa");
    const ex0 = t.program.days[0].exercises[0];
    expect(ex0).toMatchObject({ sets: 3, detail: { technique: "top_backoff", group: "A", tempo: "3-1-1-0", setPlan: [{ kind: "top", weightKg: 100 }, { kind: "backoff" }, { kind: "backoff" }] } });
    const id = randomUUID();
    await tr.startSession(a.userId, { id, dayId: t.program.days[0].id });
    const s = await tr.getSession(a.userId, id);
    expect(s.exercises[0].detail?.setPlan?.[0]).toMatchObject({ kind: "top", reps: "3-5", rpe: 8 });
    expect(s.exercises[1].detail).toMatchObject({ group: "A" });
    // Plan inválido: rechazado con el motivo.
    const bad: ProgramDoc = DOC();
    bad.days[0].exercises[0] = { ...bad.days[0].exercises[0], detail: { technique: "custom", setPlan: [{ kind: "work", reps: "8", weightKg: 4000, pct1rm: null, rir: null, rpe: null, restSec: null, note: null }], group: null, groupKind: null, rounds: null, tempo: null, variant: null, unilateral: false, progression: null } };
    await expect(tr.createTemplate(coach, orgId, bad)).rejects.toThrow(/peso/);
  });
});
