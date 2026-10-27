import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as fu from "@/server/followup/services";
import { resetRateLimits } from "@/server/access/util";
import { clientMonthlyReport, monthBounds, myMonthlyReport } from "@/server/training/report";

// F-CO-16 / D96: informe mensual desde sesiones completadas; coach sólo su relación y sin check-ins.
let n = 0;
const mail = () => `rp${++n}.${Date.now()}@test.repi.local`;
async function verified(name = "Persona Informe") {
  const email = mail();
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let EX: Record<string, string> = {};
beforeAll(async () => {
  for (const [name, g] of [["Press de banca", "Pecho"], ["Sentadilla", "Piernas"]]) {
    const [e] = await db.insert(schema.exercise).values({ name, muscleGroup: g }).onConflictDoNothing().returning();
    EX[name] = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

async function ready() {
  const coach = await verified("Coach Informe");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach Informe ${n}` });
  const u = await verified("Alumna Informe");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(coach.id, org.id, { name: "Fuerza", weeks: 4, note: "", days: [{ name: "Día A", exercises: [
    { exerciseId: EX["Press de banca"], name: "Press de banca", sets: 3, reps: "5", rir: 2, restSec: 120 },
    { exerciseId: EX["Sentadilla"], name: "Sentadilla", sets: 3, reps: "5", rir: 2, restSec: 120 },
  ] }] });
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  const t = await tr.myTraining(u.id);
  if (t.state !== "ready") throw new Error("sin programa");
  const run = async (w: number, r: number, endedAt?: Date) => {
    const id = randomUUID();
    await tr.startSession(u.id, { id, dayId: t.program.days[0].id });
    const pe = (await tr.getSession(u.id, id)).exercises[0];
    await tr.logSet(u.id, id, { id: randomUUID(), programExerciseId: pe.id, setIndex: 0, weightKg: w, reps: r, rir: null });
    await tr.sessionAction(u.id, id, "finish");
    await tr.sessionFeedback(u.id, id, { rpe: 8 });
    if (endedAt) await db.update(schema.workoutSession).set({ endedAt }).where(eq(schema.workoutSession.id, id));
    return id;
  };
  return { coach: coach.id, orgId: org.id, relId: rel.relationId, user: u.id, run };
}

describe("informe mensual", () => {
  it("límites del mes en hora argentina; rechaza meses inválidos o futuros", () => {
    const now = new Date("2026-10-27T15:00:00Z");
    const b = monthBounds("2026-10", now);
    expect(b.start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(b.prevStart.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(b.label).toBe("octubre de 2026");
    expect(() => monthBounds("2026-13", now)).toThrow();
    expect(() => monthBounds("2026-11", now)).toThrow();
    expect(() => monthBounds("26-10", now)).toThrow();
  });

  it("totales, semanas, 1RM y comparación con el mes anterior desde lo registrado", async () => {
    const ctx = await ready();
    const month = localDate(new Date()).slice(0, 7);
    const b = monthBounds(month);
    await ctx.run(80, 5, new Date(b.start.getTime() - 3 * 86_400_000)); // mes anterior
    await ctx.run(85, 5);
    await ctx.run(90, 3);
    await fu.saveCheckin(ctx.user, { energy: 4, sleep: 3, mood: 5 });
    const r = await myMonthlyReport(ctx.user, month);
    expect(r.totals).toMatchObject({ sessions: 2, sets: 2, volumeKg: 85 * 5 + 90 * 3, avgRpe: 8, rpeCount: 2 });
    expect(r.previous).toEqual({ sessions: 1, volumeKg: 400 });
    expect(r.weeks.reduce((a, w) => a + w.sessions, 0)).toBe(2);
    const bench = r.exercises.find((e) => e.name === "Press de banca")!;
    expect(bench).toMatchObject({ sets: 2, topKg: 90 });
    expect(bench.best!.e1rm).toBeCloseTo(99.2, 1); // Epley: 85 × (1 + 5/30) = 99,17 > 90 × 1,1 = 99
    expect(bench.previous!.e1rm).toBeCloseTo(93.3, 1);
    expect(r.groups).toEqual([{ group: "Pecho", volumeKg: 695 }]);
    expect(r.checkins).toEqual({ count: 1, energy: 4, sleep: 3, mood: 5 });
    expect(r.person).toBe("Alumna Informe");
  });

  it("sin entrenamientos dice cero, no inventa; el coach ve su relación sin check-ins y otro coach no", async () => {
    const ctx = await ready();
    const month = localDate(new Date()).slice(0, 7);
    const empty = await myMonthlyReport(ctx.user, month);
    expect(empty.totals).toMatchObject({ sessions: 0, volumeKg: 0, avgRpe: null });
    expect(empty.exercises).toEqual([]);
    await ctx.run(70, 8);
    await fu.saveCheckin(ctx.user, { energy: 1, sleep: 1, mood: 1 });
    const c = await clientMonthlyReport(ctx.coach, ctx.orgId, ctx.relId, month);
    expect(c.totals.sessions).toBe(1);
    expect(c.checkins).toBeNull();
    expect(c.context).toMatchObject({ coach: "Coach Informe" });
    const other = await verified("Otro Coach");
    const org2 = await acc.createCoachOrganization(other.id, { brand: `Otro ${n}` });
    await expect(clientMonthlyReport(other.id, org2.id, ctx.relId, month)).rejects.toMatchObject({ status: 404 });
    await expect(clientMonthlyReport(other.id, ctx.orgId, ctx.relId, month)).rejects.toMatchObject({ status: 404 });
  });
});
