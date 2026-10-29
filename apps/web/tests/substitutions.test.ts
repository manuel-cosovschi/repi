import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as subs from "@/server/training/substitutions";
import { resetRateLimits } from "@/server/access/util";

// Adaptive Coach 1b (EXT-05): reemplazos aprobados por el coach, primeros en las alternativas de la sesión.
let n = 0;
async function verified() {
  const email = `sb${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name: "Persona Reemplazos", email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
const EX: Record<string, string> = {};
beforeAll(async () => {
  for (const [name, g, kind] of [["Sentadilla", "Piernas", "load_reps"], ["Prensa", "Piernas", "load_reps"], ["Sentadilla hack", "Piernas", "load_reps"], ["Plancha", "Core", "time"]] as const) {
    const [e] = await db.insert(schema.exercise).values({ name, muscleGroup: g, kind }).onConflictDoNothing().returning();
    EX[name] = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

async function setup() {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach reemplazos ${n}` });
  const u = await verified();
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(coach.id, org.id, { name: "Piernas", weeks: 4, note: "", days: [{ name: "Piernas", exercises: [
    { exerciseId: EX["Sentadilla"], name: "Sentadilla", sets: 3, reps: "6-8", rir: 2, restSec: 120 },
  ] }] });
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  const t = await tr.myTraining(u.id);
  if (t.state !== "ready") throw new Error("sin programa");
  const sid = randomUUID();
  await tr.startSession(u.id, { id: sid, dayId: t.program.days[0].id });
  const g = await tr.getSession(u.id, sid);
  return { coach, org, user: u.id, sid, squat: g.exercises[0] };
}

describe("reemplazos aprobados", () => {
  it("el aprobado aparece primero y marcado, con la indicación del coach; quitarlo vuelve al orden normal", async () => {
    const { coach, org, user, sid, squat } = await setup();
    const before = await tr.sessionAlternatives(user, sid, squat.id);
    expect(before.alternatives.some((x) => x.approved)).toBe(false);
    const { substitution } = await subs.addSubstitution(coach.id, org.id, { exerciseId: EX["Sentadilla"], substituteExerciseId: EX["Sentadilla hack"], note: "  si el rack está   ocupado " });
    expect(substitution).toMatchObject({ name: "Sentadilla hack", note: "si el rack está ocupado" });
    const alt = await tr.sessionAlternatives(user, sid, squat.id);
    expect(alt.approvedBy).toBe("coach");
    expect(alt.alternatives[0]).toMatchObject({ id: EX["Sentadilla hack"], approved: true, approvedNote: "si el rack está ocupado" });
    expect(alt.alternatives.find((x) => x.id === EX["Prensa"])).toMatchObject({ approved: false });
    expect((await subs.listSubstitutions(coach.id, org.id)).substitutions).toHaveLength(1);
    await subs.removeSubstitution(coach.id, org.id, substitution.id);
    expect((await tr.sessionAlternatives(user, sid, squat.id)).alternatives.some((x) => x.approved)).toBe(false);
    const log = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.orgId, org.id), eq(schema.auditEvent.resourceType, "exercise_substitution")));
    expect(log.map((l) => l.action).sort()).toEqual(["substitution.add", "substitution.remove"]);
  });

  it("D138: alternativas del día para la IA, con el aprobado primero y sin incompatibles", async () => {
    const { coach, org, user } = await setup();
    await subs.addSubstitution(coach.id, org.id, { exerciseId: EX["Sentadilla"], substituteExerciseId: EX["Prensa"], note: "si no hay rack" });
    const t = await tr.myTraining(user);
    if (t.state !== "ready") throw new Error("sin programa");
    const day = t.program.days[0];
    const alts = await tr.dayAlternatives(user, day.id);
    const list = alts.get(day.exercises[0].id)!;
    expect(list[0]).toMatchObject({ exerciseId: EX["Prensa"], approved: true, note: "si no hay rack" });
    expect(list.some((x) => x.exerciseId === EX["Plancha"] || x.exerciseId === EX["Sentadilla"])).toBe(false);
    expect(list.length).toBeLessThanOrEqual(5);
  });

  it("sólo compatibles, sin duplicados y sólo quien arma programas en esa organización", async () => {
    const { coach, org, user, sid, squat } = await setup();
    await expect(subs.addSubstitution(coach.id, org.id, { exerciseId: EX["Sentadilla"], substituteExerciseId: EX["Plancha"] })).rejects.toMatchObject({ code: "invalid" });
    await expect(subs.addSubstitution(coach.id, org.id, { exerciseId: EX["Sentadilla"], substituteExerciseId: EX["Sentadilla"] })).rejects.toMatchObject({ code: "invalid" });
    await subs.addSubstitution(coach.id, org.id, { exerciseId: EX["Sentadilla"], substituteExerciseId: EX["Prensa"] });
    await expect(subs.addSubstitution(coach.id, org.id, { exerciseId: EX["Sentadilla"], substituteExerciseId: EX["Prensa"] })).rejects.toMatchObject({ code: "duplicate" });
    // El alumno y otro coach no ven ni editan los reemplazos de esta organización.
    await expect(subs.listSubstitutions(user, org.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(subs.addSubstitution(user, org.id, { exerciseId: EX["Sentadilla"], substituteExerciseId: EX["Sentadilla hack"] })).rejects.toMatchObject({ code: "not_found" });
    const other = await setup();
    await expect(subs.removeSubstitution(other.coach.id, org.id, (await subs.listSubstitutions(coach.id, org.id)).substitutions[0].id)).rejects.toMatchObject({ code: "not_found" });
    // Lo aprobado por otra organización no se cuela en la sesión de este alumno.
    await subs.addSubstitution(other.coach.id, other.org.id, { exerciseId: EX["Sentadilla"], substituteExerciseId: EX["Sentadilla hack"] });
    const alt = await tr.sessionAlternatives(user, sid, squat.id);
    expect(alt.alternatives.filter((x) => x.approved).map((x) => x.id)).toEqual([EX["Prensa"]]);
  });
});
