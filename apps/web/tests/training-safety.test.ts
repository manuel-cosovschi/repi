// D182: protecciones de carga de punta a punta (servidor + base de prueba). La sugerencia de hoy compara sólo con un rango
// compatible, frena la suba ante molestias, lesión, esfuerzo máximo o poca energía, no se calcula para planes con series
// distintas, y la IA de «No vino el profe» queda dentro de los mismos límites que las reglas.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDetail, localDate, presetPlan, type ExerciseDetail } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as fu from "@/server/followup/services";
import { aiSoloAdvice } from "@/server/training/ai-coach";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified() {
  const email = `ts${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name: "Persona Seguridad", email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
let SQ = "";
beforeAll(async () => {
  const [e] = await db.insert(schema.exercise).values({ name: "Press de banca", muscleGroup: "Pecho" }).onConflictDoNothing().returning();
  SQ = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Press de banca")))[0].id;
});
beforeEach(() => resetRateLimits());

type Day = { name: string; sets: number; reps: string; detail?: ExerciseDetail | null };
async function member(days: Day[]) {
  const coach = await verified();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach seguridad ${n}` });
  const u = await verified();
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(coach.id, org.id, { name: "Base", weeks: 4, note: "",
    days: days.map((d) => ({ name: d.name, exercises: [{ exerciseId: SQ, name: "Press de banca", sets: d.sets, reps: d.reps, rir: null, restSec: 120, ...(d.detail ? { detail: d.detail } : {}) }] })) });
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  return u.id;
}
/** Hace el día `dayIdx` con esas series (peso, reps y opcionales) y lo termina. */
async function train(user: string, dayIdx: number, sets: { w: number; r: number; rir?: number | null; feel?: string | null }[]) {
  const t = await tr.myTraining(user);
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: t.program!.days[dayIdx].id });
  const pe = (await tr.getSession(user, sid)).exercises[0];
  for (const [i, x] of sets.entries()) await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe.id, setIndex: i, weightKg: x.w, reps: x.r, rir: x.rir ?? null, feel: x.feel ?? null });
  await tr.sessionAction(user, sid, "finish");
}
const todays = async (user: string, dayIdx: number) => (await tr.myTraining(user)).program!.days[dayIdx].exercises[0].suggest;

describe("D182 · sugerencia de hoy con comparables y seguridad", () => {
  it("cambio de rutina: 100 kg × 5 en un día de 5 reps → en el de 10-12 estima 75 kg (no 90)", async () => {
    const u = await member([{ name: "Fuerza", sets: 3, reps: "5" }, { name: "Hipertrofia", sets: 3, reps: "10-12" }]);
    await train(u, 0, [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 5 }]);
    expect(await todays(u, 1)).toMatchObject({ action: "estimate", weightKg: 75, reps: 10, guards: ["range_change"] });
    expect(await todays(u, 0)).toMatchObject({ action: "up", weightKg: 105 }); // mismo rango: progresa
  });
  it("molestia o RIR 0 la última vez: no sube", async () => {
    const u = await member([{ name: "A", sets: 3, reps: "8-10" }]);
    await train(u, 0, [{ w: 60, r: 10 }, { w: 60, r: 10, feel: "molestia" }, { w: 60, r: 10 }]);
    expect(await todays(u, 0)).toMatchObject({ action: "down", weightKg: 52.5, guards: ["pain_exercise"] });
    const v = await member([{ name: "A", sets: 3, reps: "8-10" }]);
    await train(v, 0, [{ w: 60, r: 10, rir: 0 }, { w: 60, r: 10, rir: 0 }, { w: 60, r: 10, rir: 0 }]);
    expect(await todays(v, 0)).toMatchObject({ action: "hold", weightKg: 60, guards: ["max_effort"] });
  });
  it("molestia reportada en el ejercicio, lesión activa o check-in bajo: no sube; sin señales, sube", async () => {
    const u = await member([{ name: "A", sets: 3, reps: "8-10" }]);
    await train(u, 0, [{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }]);
    expect(await todays(u, 0)).toMatchObject({ action: "up", weightKg: 62.5 });
    await fu.saveCheckin(u, { energy: 1, sleep: 4, mood: 3 });
    expect(await todays(u, 0)).toMatchObject({ action: "hold", guards: ["low_readiness"] });
    await fu.saveCheckin(u, { energy: 4, sleep: 4, mood: 4 });
    const inj = await fu.addInjury(u, { zone: "Hombro", status: "monitoring" });
    expect(await todays(u, 0)).toMatchObject({ action: "hold", guards: ["pain_or_injury"] });
    await fu.updateInjury(u, (inj as { id: string }).id, { delete: true });
    await fu.reportPain(u, { zone: "Hombro der.", level: 4, context: "now", exerciseName: "Press de banca" });
    expect(await todays(u, 0)).toMatchObject({ action: "down", guards: ["pain_exercise"] });
  });
  it("top set + back-off o drop set: no hay una carga única para todo el ejercicio", async () => {
    const tb = { ...emptyDetail(), technique: "top_backoff" as const, setPlan: presetPlan("top_backoff", { sets: 3, reps: "5" }) };
    const u = await member([{ name: "A", sets: 3, reps: "5", detail: tb }]);
    await train(u, 0, [{ w: 100, r: 5 }, { w: 85, r: 8 }, { w: 85, r: 8 }]);
    expect(await todays(u, 0)).toBeNull();
  });
});

describe("D182 · la IA pasa por el mismo validador", () => {
  const stubAi = (weightKg: number | null) => vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
    const ctx = JSON.parse(JSON.parse(init.body).messages[1].content[0].text);
    const d = ctx.dias[0];
    const out = { dayId: d.dayId, headline: "Hoy", summary: "Dale.", caution: null, exercises: d.ejercicios.map((e: { programExerciseId: string }) => ({ programExerciseId: e.programExerciseId, sets: 3, reps: "8", weightKg, note: "" })) };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }), { status: 200 });
  });
  const withAi = async <T,>(fn: () => Promise<T>) => {
    const key = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "test";
    try { return await fn(); } finally { vi.unstubAllGlobals(); if (key) process.env.OPENAI_API_KEY = key; else delete process.env.OPENAI_API_KEY; }
  };
  it("una suba excesiva se recorta a la progresión de las reglas; una menor se acepta", async () => {
    const u = await member([{ name: "A", sets: 3, reps: "8-10" }]);
    await train(u, 0, [{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }]);
    const hi = await withAi(() => { stubAi(120); return aiSoloAdvice(u); });
    expect(hi.exercises[0]).toMatchObject({ weightKg: 62.5 });
    expect(hi.exercises[0].checks[0]).toMatch(/progresión/);
    const lo = await withAi(() => { stubAi(55); return aiSoloAdvice(u); });
    expect(lo.exercises[0]).toMatchObject({ weightKg: 55, checks: [] });
  });
  it("con molestia la IA no puede subir; sin historial no propone kilos", async () => {
    const u = await member([{ name: "A", sets: 3, reps: "8-10" }]);
    await train(u, 0, [{ w: 60, r: 10, feel: "molestia" }, { w: 60, r: 10 }, { w: 60, r: 10 }]);
    expect((await withAi(() => { stubAi(65); return aiSoloAdvice(u); })).exercises[0].weightKg).toBe(52.5);
    const fresh = await member([{ name: "A", sets: 3, reps: "8-10" }]);
    expect((await withAi(() => { stubAi(40); return aiSoloAdvice(fresh); })).exercises[0]).toMatchObject({ weightKg: null });
  });
  it("con carga del profe en el plan la IA no la cambia; respuesta inválida o caída: error claro, sin cargas", async () => {
    const fixed = { ...emptyDetail(), setPlan: presetPlan("straight", { sets: 3, reps: "8-10", weightKg: 70 }) };
    const u = await member([{ name: "A", sets: 3, reps: "8-10", detail: fixed }]);
    await train(u, 0, [{ w: 70, r: 10 }, { w: 70, r: 10 }, { w: 70, r: 10 }]);
    expect((await withAi(() => { stubAi(90); return aiSoloAdvice(u); })).exercises[0]).toMatchObject({ weightKg: null, checks: ["Carga indicada por tu profe."] });
    await expect(withAi(() => { vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 })); return aiSoloAdvice(u); })).rejects.toMatchObject({ code: "ai_unavailable" });
    await expect(withAi(() => { vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: "no es json" } }] }), { status: 200 })); return aiSoloAdvice(u); }))
      .rejects.toMatchObject({ code: "ai_bad_output" });
  });
});
