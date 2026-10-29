import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { soloPlan } from "@/server/training/adaptive";
import { soloRoutine } from "@/server/training/solo-routine";
import { resetRateLimits } from "@/server/access/util";

// Adaptive Coach fase 1 (D108): «entrenar por mi cuenta» con datos existentes y reglas; nunca IA ni rutina inventada.
let n = 0;
async function verified() {
  const email = `ad${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name: "Persona Adaptive", email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let SQ = "";
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Sentadilla", muscleGroup: "Piernas" }).onConflictDoNothing().returning();
  SQ = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Sentadilla")))[0].id;
});
beforeEach(() => resetRateLimits());

async function member(withProgram = true) {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach adaptive ${n}` });
  const u = await verified();
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  if (withProgram) {
    const ex = (sets: number) => ({ exerciseId: SQ, name: "Sentadilla", sets, reps: "6-8", rir: 2, restSec: 120 });
    const pid = await tr.createTemplate(coach.id, org.id, { name: "Base", weeks: 4, note: "", days: [{ name: "Día A", exercises: [ex(2)] }, { name: "Día B", exercises: [ex(3)] }] });
    await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  }
  return u.id;
}

describe("Adaptive Coach · entrenar por mi cuenta", () => {
  it("muestra la rutina asignada; con sesión abierta ofrece continuar; después de entrenar hoy propone descansar", async () => {
    const user = await member();
    const p1 = await soloPlan(user, "coach_absent");
    expect(p1).toMatchObject({ mode: "original", adp: "ADP-01", usesAI: false, title: "Hoy te toca Día A" });
    const sid = randomUUID();
    await tr.startSession(user, { id: sid, dayId: p1.options[0].dayId! });
    const pe = (await tr.getSession(user, sid)).exercises[0];
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe.id, setIndex: 0, weightKg: 60, reps: 8, rir: 2 });
    expect(await soloPlan(user, "solo")).toMatchObject({ mode: "continue", reasons: ["Hiciste 1 de 2 series. Lo hecho queda guardado: no se repite."] });
    await tr.sessionAction(user, sid, "finish");
    const p3 = await soloPlan(user, "solo");
    expect(p3).toMatchObject({ mode: "extra_day", adp: "ADP-03" });
    expect(p3.options.find((o) => o.action === "start")).toMatchObject({ label: "Hacer igual Día B", caution: true });
    const ev = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, user), eq(schema.auditEvent.action, "adaptive.solo_plan")));
    expect(ev).toHaveLength(3);
    expect(ev.every((e) => (e.meta as { usesAI: boolean }).usesAI === false)).toBe(true);
  });
  it("sin programa el plan con reglas no inventa un día del programa", async () => {
    const user = await member(false);
    const p = await soloPlan(user, "solo");
    expect(p.mode).toBe("no_program");
    expect(p.options.some((o) => o.action === "start")).toBe(false);
  });

  it("D153: sin rutina asignada, REPI arma la rutina de hoy con la biblioteca y se puede entrenar; no pasa a ser el programa", async () => {
    const user = await member(false);
    const r = await soloRoutine(user); // sin clave de OpenAI en las pruebas: se arma con reglas
    expect(r.kind).toBe("routine");
    expect(r.exercises.length).toBeGreaterThanOrEqual(2);
    expect(new Set(r.exercises.map((e) => e.group)).size).toBe(r.exercises.length); // un ejercicio por grupo
    const sid = randomUUID();
    await tr.startSoloRoutine(user, { id: sid, dayName: r.dayName, exercises: r.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, weightKg: 40, note: e.note })) });
    expect((await tr.startSoloRoutine(user, { id: sid, dayName: r.dayName, exercises: [{ exerciseId: r.exercises[0].exerciseId, sets: 1, reps: "8" }] })).id).toBe(sid); // reintento idempotente
    const s = await tr.getSession(user, sid);
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(r.exercises.map((e) => e.exerciseId));
    expect(s.exercises[0].note).toMatch(/^Sugerido: 40 kg/);
    expect(s.outdated).toBe(false);
    await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 40, reps: 10, rir: 2 });
    // Sigue sin programa asignado (no reemplaza lo que arme el coach) y el entrenamiento abierto se ofrece para continuar.
    const t = await tr.myTraining(user);
    expect(t.state).toBe("no_program");
    expect(t.openSession).toBe(sid);
    expect((await soloPlan(user, "solo")).mode).toBe("continue");
    await expect(tr.startSoloRoutine(user, { id: randomUUID(), dayName: "Otra", exercises: [{ exerciseId: r.exercises[0].exerciseId, sets: 1, reps: "8" }] })).rejects.toMatchObject({ code: "open_session" });
    expect((await tr.sessionAction(user, sid, "finish")).status).toBe("completed");
    expect((await tr.myHistory(user))[0]).toMatchObject({ id: sid, dayName: "Rutina de hoy", volumeKg: 400 });
    // Validaciones: ejercicio fuera de la biblioteca o series fuera de rango.
    await expect(tr.startSoloRoutine(user, { id: randomUUID(), dayName: "X", exercises: [{ exerciseId: randomUUID(), sets: 3, reps: "8" }] })).rejects.toMatchObject({ code: "invalid" });
    await expect(tr.startSoloRoutine(user, { id: randomUUID(), dayName: "X", exercises: [{ exerciseId: r.exercises[0].exerciseId, sets: 50, reps: "8" }] })).rejects.toMatchObject({ code: "invalid" });
  });

  it("D153: con rutina asignada se usa la del programa, y sin coach ni gym no hay rutina", async () => {
    const withProgram = await member();
    await expect(soloRoutine(withProgram)).rejects.toMatchObject({ code: "has_program" });
    const alone = await verified();
    await expect(soloRoutine(alone.id)).rejects.toMatchObject({ code: "no_relation" });
    await expect(tr.startSoloRoutine(alone.id, { id: randomUUID(), dayName: "X", exercises: [{ exerciseId: SQ, sets: 3, reps: "8" }] })).rejects.toMatchObject({ code: "no_relation" });
  });
});
