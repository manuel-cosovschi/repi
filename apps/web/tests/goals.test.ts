import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { resetRateLimits } from "@/server/access/util";
import { createGoal, listGoals, myGoals, updateGoal } from "@/server/training/goals";

// F-CO-03 / F-HX-02 / D97: objetivos acordados con progreso calculado desde lo registrado.
let n = 0;
async function verified(name = "Persona Objetivos") {
  const email = `go${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let BENCH = "";
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Press de banca", muscleGroup: "Pecho" }).onConflictDoNothing().returning();
  BENCH = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Press de banca")))[0].id;
});
beforeEach(() => resetRateLimits());

async function ready() {
  const coach = await verified("Coach Objetivos");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach Obj ${n}` });
  const u = await verified("Alumno Objetivos");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(coach.id, org.id, { name: "Fuerza", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: BENCH, name: "Press de banca", sets: 3, reps: "5", rir: 2, restSec: 120 }] }] });
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  const t = await tr.myTraining(u.id);
  if (t.state !== "ready") throw new Error("sin programa");
  const run = async (w: number, r: number) => {
    const id = randomUUID();
    await tr.startSession(u.id, { id, dayId: t.program.days[0].id });
    const pe = (await tr.getSession(u.id, id)).exercises[0];
    await tr.logSet(u.id, id, { id: randomUUID(), programExerciseId: pe.id, setIndex: 0, weightKg: w, reps: r, rir: null });
    await tr.sessionAction(u.id, id, "finish");
  };
  return { coach: coach.id, orgId: org.id, relId: rel.relationId, user: u.id, run };
}

describe("objetivos del cliente", () => {
  it("carga × reps: línea base al acordar, progreso con nuevas series y visible al alumno", async () => {
    const c = await ready();
    await c.run(80, 5);
    const g = await createGoal(c.coach, c.orgId, c.relId, { kind: "load", exerciseId: BENCH, target: 90, targetReps: 5 });
    expect(g).toMatchObject({ title: "Press de banca 90 kg × 5", unit: "kg", baseline: 80, current: 80, progress: 0 });
    await c.run(87.5, 3); // menos repeticiones que las pedidas: no cuenta
    await c.run(85, 6);
    const [now] = (await listGoals(c.coach, c.orgId, c.relId)).goals;
    expect(now).toMatchObject({ current: 85, progress: 0.5 });
    const mine = await myGoals(c.user);
    expect(mine[0]).toMatchObject({ id: g.id, current: 85, progress: 0.5, by: "Coach Objetivos" });
    expect(mine[0].source).toContain("28 días");
  });

  it("frecuencia y 1RM estimado sin datos previos: base vacía y actual ÷ meta", async () => {
    const c = await ready();
    const f = await createGoal(c.coach, c.orgId, c.relId, { kind: "frequency", target: 4 });
    expect(f).toMatchObject({ title: "4 entrenamientos por semana", baseline: 0, current: 0, progress: 0 });
    const e = await createGoal(c.coach, c.orgId, c.relId, { kind: "e1rm", exerciseId: BENCH, target: 100 });
    expect(e).toMatchObject({ baseline: null, current: null, progress: null });
    await c.run(90, 3);
    const goals = (await listGoals(c.coach, c.orgId, c.relId)).goals;
    expect(goals.find((x) => x.id === f.id)).toMatchObject({ current: 0.25, progress: 0.0625 });
    expect(goals.find((x) => x.id === e.id)!.current).toBeCloseTo(99, 1);
  });

  it("manual: valor con fecha, meta que baja; cerrar y reabrir auditado; validaciones", async () => {
    const c = await ready();
    await expect(createGoal(c.coach, c.orgId, c.relId, { kind: "manual", target: 86, title: "x", unit: "cm" })).rejects.toMatchObject({ code: "invalid" });
    await expect(createGoal(c.coach, c.orgId, c.relId, { kind: "load", exerciseId: BENCH, target: 90 })).rejects.toMatchObject({ code: "invalid" });
    await expect(createGoal(c.coach, c.orgId, c.relId, { kind: "frequency", target: 3, dueOn: "2020-01-01" })).rejects.toMatchObject({ code: "invalid" });
    const g = await createGoal(c.coach, c.orgId, c.relId, { kind: "manual", target: 86, title: "Perímetro de cintura", unit: "cm", baseline: 90 });
    expect(g).toMatchObject({ baseline: 90, current: 90, progress: 0 });
    const u = await updateGoal(c.coach, c.orgId, g.id, { manualValue: 89 });
    expect(u).toMatchObject({ current: 89, progress: 0.25 });
    expect(u.manualAt).toBeTruthy();
    const f = await createGoal(c.coach, c.orgId, c.relId, { kind: "frequency", target: 3 });
    await expect(updateGoal(c.coach, c.orgId, f.id, { manualValue: 2 })).rejects.toMatchObject({ code: "invalid" });
    expect(await updateGoal(c.coach, c.orgId, g.id, { status: "achieved" })).toMatchObject({ status: "achieved" });
    expect((await updateGoal(c.coach, c.orgId, g.id, { status: "active" })).closedAt).toBeNull();
    const acts = (await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.resourceId, g.id)))).map((x) => x.action);
    expect(acts).toEqual(expect.arrayContaining(["goal.created", "goal.updated", "goal.achieved", "goal.active"]));
  });

  it("otro coach no ve ni toca; ejercicio de otra biblioteca se rechaza", async () => {
    const c = await ready();
    const g = await createGoal(c.coach, c.orgId, c.relId, { kind: "frequency", target: 3 });
    const other = await verified("Otro Coach");
    const org2 = await acc.createCoachOrganization(other.id, { brand: `Otro ${n}` });
    await expect(listGoals(other.id, org2.id, c.relId)).rejects.toMatchObject({ status: 404 });
    await expect(updateGoal(other.id, org2.id, g.id, { status: "cancelled" })).rejects.toMatchObject({ status: 404 });
    const [own] = await db.insert(schema.exercise).values({ name: `Propio ${n}`, muscleGroup: "Pecho", orgId: org2.id }).returning();
    await expect(createGoal(c.coach, c.orgId, c.relId, { kind: "e1rm", exerciseId: own.id, target: 50 })).rejects.toMatchObject({ code: "invalid" });
    expect(await myGoals(other.id)).toEqual([]);
  });
});
