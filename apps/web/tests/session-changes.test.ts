import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { resetRateLimits } from "@/server/access/util";

// F-HX-21 / D106: nota por serie, saltar y reemplazar un ejercicio sólo en la sesión; el programa no cambia.
let n = 0;
async function verified() {
  const email = `sc${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name: "Persona Cambios", email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
const EX: Record<string, string> = {};
beforeAll(async () => {
  for (const [name, g, kind] of [["Sentadilla", "Piernas", "load_reps"], ["Prensa", "Piernas", "load_reps"], ["Press de banca", "Pecho", "load_reps"], ["Plancha", "Core", "time"]] as const) {
    const [e] = await db.insert(schema.exercise).values({ name, muscleGroup: g, kind }).onConflictDoNothing().returning();
    EX[name] = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

async function session() {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach cambios ${n}` });
  const u = await verified();
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const doc = { name: "Piernas", weeks: 4, note: "", days: [{ name: "Piernas", exercises: [
    { exerciseId: EX["Sentadilla"], name: "Sentadilla", sets: 3, reps: "6-8", rir: 2, restSec: 120 },
    { exerciseId: EX["Plancha"], name: "Plancha", sets: 2, reps: "30s", rir: null, restSec: 60 },
  ] }] };
  const pid = await tr.createTemplate(coach.id, org.id, doc);
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  const t = await tr.myTraining(u.id);
  if (t.state !== "ready") throw new Error("sin programa");
  const sid = randomUUID();
  await tr.startSession(u.id, { id: sid, dayId: t.program.days[0].id });
  const g = await tr.getSession(u.id, sid);
  return { coach, org, user: u.id, sid, squat: g.exercises[0], plank: g.exercises[1], dayId: t.program.days[0].id };
}

describe("cambios en la sesión activa", () => {
  it("nota por serie: se guarda limpia, una nota distinta es edición y se ve en la sesión", async () => {
    const { user, sid, squat } = await session();
    const id = randomUUID();
    await tr.logSet(user, sid, { id, programExerciseId: squat.id, setIndex: 0, weightKg: 60, reps: 8, rir: 2, note: "  agarre   cerrado " });
    const r = await tr.logSet(user, sid, { id, programExerciseId: squat.id, setIndex: 0, weightKg: 60, reps: 8, rir: 2, note: "rodilla ok" });
    expect(r).toMatchObject({ note: "rodilla ok", revision: 2 });
    expect((await tr.getSession(user, sid)).exercises[0].logs[0].note).toBe("rodilla ok");
  });

  it("reemplazo: sólo compatibles, series nuevas con el ejercicio hecho, programa intacto y vuelta al original", async () => {
    const { user, sid, squat, plank, dayId } = await session();
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: squat.id, setIndex: 0, weightKg: 60, reps: 8, rir: 2 });
    const alt = await tr.sessionAlternatives(user, sid, squat.id);
    expect(alt.alternatives[0]).toMatchObject({ id: EX["Prensa"], sameGroup: true });
    expect(alt.alternatives.some((x) => x.id === EX["Plancha"] || x.id === EX["Sentadilla"])).toBe(false);
    await expect(tr.setExerciseChange(user, sid, { programExerciseId: squat.id, change: { kind: "substitute", reason: "busy", exerciseId: EX["Plancha"] } })).rejects.toMatchObject({ code: "invalid" });
    const c = await tr.setExerciseChange(user, sid, { programExerciseId: squat.id, change: { kind: "substitute", reason: "busy", exerciseId: EX["Prensa"] } });
    expect(c.change).toMatchObject({ kind: "substitute", substitute: { exerciseId: EX["Prensa"], name: "Prensa" } });
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: squat.id, setIndex: 1, weightKg: 120, reps: 10, rir: 2 });
    const logs = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid));
    expect(logs.find((l) => l.setIndex === 0)!.exerciseId).toBe(EX["Sentadilla"]);
    expect(logs.find((l) => l.setIndex === 1)!.exerciseId).toBe(EX["Prensa"]);
    const prog = await db.select().from(schema.programExercise).where(eq(schema.programExercise.dayId, dayId));
    expect(prog.map((p) => p.exerciseId)).toEqual([EX["Sentadilla"], EX["Plancha"]]);
    expect((await tr.getSession(user, sid)).exercises[0].change?.kind).toBe("substitute");
    expect((await tr.setExerciseChange(user, sid, { programExerciseId: squat.id, change: null })).change).toBeNull();
    expect((await tr.getSession(user, sid)).exercises[0].change).toBeNull();
    void plank;
  });

  it("saltar con motivo: el resumen lo cuenta aparte; sesión cerrada o ajena no se cambia", async () => {
    const { coach, org, user, sid, squat, plank } = await session();
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: squat.id, setIndex: 0, weightKg: 60, reps: 8, rir: 2, note: "bajé hasta paralelo" });
    await expect(tr.setExerciseChange(user, sid, { programExerciseId: plank.id, change: { kind: "skip", reason: "nope" as never } })).rejects.toMatchObject({ code: "invalid" });
    await tr.setExerciseChange(user, sid, { programExerciseId: plank.id, change: { kind: "skip", reason: "no_time" } });
    const otro = await verified();
    await expect(tr.setExerciseChange(otro.id, sid, { programExerciseId: plank.id, change: null })).rejects.toMatchObject({ code: "not_found" });
    await tr.sessionAction(user, sid, "finish");
    const sum = await tr.sessionSummary(user, sid);
    expect(sum).toMatchObject({ exSkipped: 1, exDone: 0, setsDone: 1 });
    expect(sum.exercises[1].change).toMatchObject({ kind: "skip", reason: "no_time" });
    await expect(tr.setExerciseChange(user, sid, { programExerciseId: plank.id, change: null })).rejects.toMatchObject({ code: "closed" });
    const det = await tr.clientDetail(coach.id, org.id, (await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, sid)))[0].coachClientId!);
    expect(det.sessions[0].setNotes).toEqual([{ exercise: "Sentadilla", set: 1, note: "bajé hasta paralelo" }]);
    expect(det.sessions[0].changes).toEqual([{ exercise: "Plancha", kind: "skip", reason: "no_time", substitute: null }]);
    const ev = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.resourceId, sid), eq(schema.auditEvent.action, "session.exercise_skip")));
    expect(ev).toHaveLength(1);
  });
});
