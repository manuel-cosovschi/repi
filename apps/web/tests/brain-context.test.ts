import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@repi/domain";
import { contextForAi, missingList } from "@repi/domain/brain";
import { db, schema } from "@/db";
import { resetRateLimits } from "@/server/access/util";
import * as tr from "@/server/training/services";
import * as fu from "@/server/followup/services";
import { buildContext, loadContext } from "@/server/brain/context";
import { createMemory } from "@/server/brain/memory";
import { brainHome } from "@/server/brain/home";
import { coachWorld, daysAgo, err, pastSession, rawPerson, startToday } from "./brain-chat.world";

// D210 · C1 · Contexto del cerebro (context.buildContext / loadContext) con datos reales: perfil y edad, deseos, relación,
// programa y día que toca, procedencia de rutinas importadas, sesión abierta, historial, check-in, molestias, cuerpo (sólo
// adultos), memoria. La referencia de la pantalla se valida contra la base (casos 40, 53, 55, 59, 60, 63).
beforeEach(() => resetRateLimits());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const DAY = 86_400_000;
const wishes = (userId: string, w: Record<string, unknown>) => db.insert(schema.userPref).values({ userId, wishes: w as never }).onConflictDoUpdate({ target: schema.userPref.userId, set: { wishes: w as never } });

describe("buildContext con datos reales", () => {
  it("arma perfil, relación, programa, sesión abierta, historial, check-in, molestias, cuerpo, procedencia y memoria; es barato", async () => {
    const w = await coachWorld();
    await wishes(w.user, { goal: "strength", daysPerWeek: 4, minutes: 45, likes: "press", avoid: "burpees" });
    await pastSession(w.user, daysAgo(20), { "Press banca": [[60, 8, 2], [60, 8, 2], [60, 8, 2]] });
    await pastSession(w.user, daysAgo(3), { "Press banca": [[60, 9, 2], [60, 9, 2], [60, 9, 2]] });
    const voided = await pastSession(w.user, daysAgo(2), { "Press banca": [[60, 9, 2]] });
    await db.update(schema.workoutSession).set({ status: "voided", voidedAt: new Date() }).where(eq(schema.workoutSession.id, voided));
    await fu.saveCheckin(w.user, { energy: 2, sleep: 3, mood: 4 });
    await fu.reportPain(w.user, { zone: "Rodilla der.", level: 3, context: "out", exerciseName: "Sentadilla" });
    for (const [d, g] of [[30, 82000], [10, 81000], [1, 80000]] as const) await db.insert(schema.bodyWeightEntry).values({ userId: w.user, measuredOn: localDate(new Date(Date.now() - d * DAY)), weightG: g });
    await db.insert(schema.bodyGoal).values({ userId: w.user, targetWeightG: 76000 });
    await createMemory(w.user, { kind: "preference", key: "avoid_exercise:remo_con_barra", value: { name: "remo con barra" }, text: "No te gusta el remo con barra.", source: "user" });
    await db.insert(schema.ownRoutine).values({ userId: w.user, name: "Importada", exercises: [], origin: { kind: "import", opId: "op-ctx-1", day: 0, at: new Date().toISOString(), source: "text", file: "text", dayName: "Día 1", exercises: [
      { written: "Sentadilla", exerciseId: w.EX["Sentadilla"], sets: 3, reps: "10", weightKg: null, perSet: null, restSec: null, rir: null, rpe: null, tempo: null, technique: null, unknown: ["weight", "rest"], completed: ["weight"], suggested: [] },
      { written: "Prensa", exerciseId: w.EX["Prensa"], sets: null, reps: null, weightKg: null, perSet: null, restSec: null, rir: null, rpe: null, tempo: null, technique: null, unknown: ["sets", "reps"], completed: [], suggested: ["sets"] },
    ] } });
    const { sid, pe } = await startToday(w.user);
    await tr.logSet(w.user, sid, { id: randomUUID(), programExerciseId: pe["Jalón al pecho"], setIndex: 0, weightKg: 50, reps: 10, rir: 2 });
    await tr.setExerciseChange(w.user, sid, { programExerciseId: pe["Remo con barra"], change: { kind: "substitute", reason: "busy", exerciseId: w.EX["Curl femoral"] } });

    await loadContext(w.user, { section: "workout" }); // en caliente (primera conexión, caché de planes)
    const sc = await loadContext(w.user, { section: "workout" });
    const c = sc.ctx;
    expect(sc.ms).toBeLessThan(300); // objetivo ~150 ms en local (ver AC3_API_SOCIO.md); con margen para la máquina de CI
    expect(c.section).toBe("workout");
    expect(c.person.age).toMatchObject({ value: "adult", quality: "high" });
    expect(c.person.unit).toBe("kg");
    expect(c.person.goals.value).toEqual(["fuerza"]);
    expect([c.person.weeklyTarget.value, c.person.minutesAvailable.value]).toEqual([4, 45]);
    expect(c.person.avoids.value).toEqual(expect.arrayContaining(["remo con barra", "burpees"]));
    expect(c.relation).toMatchObject({ kind: "coach", hasCoach: true });
    expect(c.program).toMatchObject({ owner: "coach", nextDay: { name: "Piernas" } });
    expect(c.program.days.map((d) => [d.name, d.exercises])).toEqual([["Espalda y pecho", 3], ["Piernas", 2]]);
    // Procedencia: «peso» se completó a mano; «series» fue sugerida; quedan sin completar descanso y repeticiones.
    expect(c.program.imported).toEqual({ unknown: 2, suggested: 1, completed: 1 });
    expect(c.session).toMatchObject({ open: true, id: sid, dayName: "Espalda y pecho", substitutions: 1 });
    expect(c.session.current).toMatchObject({ exercise: { id: pe["Jalón al pecho"], name: "Jalón al pecho" }, setIndex: 1, setsDone: 1, setsPlanned: 3 });
    expect(c.session.pending.map((e) => e.name)).toEqual(["Jalón al pecho", "Press banca", "Curl femoral"]);
    expect(c.history).toMatchObject({ sessions30d: 2, sessions7d: 1, voided30d: 1, daysSinceLast: 3 });
    expect(c.readiness.energy).toMatchObject({ value: 2, source: "check_in", consent: "health" });
    expect(c.restrictions.value).toEqual([expect.objectContaining({ label: "molestia (Rodilla der.)", exercise: "Sentadilla" })]);
    expect(c.body.value).toMatchObject({ weightKg: 80, goalKg: 76, entries: 3 });
    expect(c.memory.map((m) => m.key)).toContain("avoid_exercise:remo_con_barra");
    expect(sc.execOwner).toBe("coach");
    expect(sc.restrictedNames).toEqual(["Sentadilla"]);

    // Para la IA: sin ids, emails, organización ni salud (no hay consentimiento para mandarla a un modelo).
    const ai = contextForAi(c, { healthConsent: false });
    const s = JSON.stringify(ai.data);
    expect(s).not.toContain(sid);
    expect(s).not.toContain(pe["Press banca"]);
    expect(s).not.toContain(w.email);
    expect(s).not.toContain(w.org.id);
    expect(ai.data.healthOmitted).toBe(true);
    expect(ai.data).not.toHaveProperty("restrictions");
    expect(ai.data.readiness).toEqual({ lastRpe: null });
    expect(Object.values(ai.refs)).toContain(pe["Press banca"]);
  });

  it("menor de edad: sin cuerpo (aunque haya registros) y sin objetivos de peso; edad desconocida lo dice (casos 59, 60)", async () => {
    const minor = await rawPerson("2012-03-01");
    await wishes(minor, { goal: "fat_loss", daysPerWeek: 3, minutes: 40, likes: null, avoid: null });
    await db.insert(schema.bodyWeightEntry).values({ userId: minor, measuredOn: localDate(new Date()), weightG: 50000 });
    const c = await buildContext(minor);
    expect(c.person.age.value).toBe("minor");
    expect(c.body).toMatchObject({ value: null, quality: "none" });
    expect(c.person.goals.value).toEqual([]);
    expect(c.relation.kind).toBe("none");
    expect(c.program.versionId).toBeNull();
    const unknown = await buildContext(await rawPerson(null));
    expect(unknown.person.age).toMatchObject({ value: "unknown", quality: "none" });
    expect(missingList(unknown)).toContain("No sé tu edad (completá tu fecha de nacimiento en Perfil).");
  });

  it("la referencia de la pantalla se valida: lo ajeno o inexistente es 404, el formato inválido 400 (casos 40, 63)", async () => {
    const a = await coachWorld();
    const { sid, pe } = await startToday(a.user);
    const [routine] = await db.insert(schema.ownRoutine).values({ userId: a.user, name: "Mía", exercises: [] }).returning();
    const own = await loadContext(a.user, { ref: { programExerciseId: pe["Press banca"], sessionId: sid, routineId: routine.id, setIndex: 1 } });
    expect(own.ref).toMatchObject({ exercise: { name: "Press banca", peId: pe["Press banca"] }, sessionId: sid, routineId: routine.id, setIndex: 1 });
    const b = await coachWorld();
    for (const ref of [{ sessionId: sid }, { programExerciseId: pe["Press banca"] }, { exerciseId: a.EX["Press banca"] }, { routineId: routine.id }, { sessionId: randomUUID() }]) {
      expect(await err(loadContext(b.user, { ref }))).toMatchObject({ code: "not_found", status: 404 });
    }
    expect(await err(loadContext(b.user, { ref: { sessionId: "x'; drop table--" } }))).toMatchObject({ code: "invalid", status: 400 });
    expect(await err(loadContext(b.user, { ref: { setIndex: 99 } }))).toMatchObject({ code: "invalid" });
  });
});

describe("Inicio (GET /api/me/brain)", () => {
  it("devuelve la línea de hoy por reglas, los avisos (o ninguno) y las preferencias, sin romperse", async () => {
    const w = await coachWorld();
    const h = await brainHome(w.user);
    expect(h.today).toMatchObject({ sessionOpen: false, dayName: "Espalda y pecho", programOwner: "coach" });
    expect(h.today.text).toBe("Hoy te toca Espalda y pecho, con tres ejercicios.");
    expect(h.prefs).toEqual({ proactive: true, tone: "normal", autonomy: 1 });
    expect(Array.isArray(h.interventions)).toBe(true);
    const { sid } = await startToday(w.user);
    const h2 = await brainHome(w.user);
    expect(h2.today).toMatchObject({ sessionOpen: true, sessionId: sid, dayKey: null });
    expect(h2.today.text).toMatch(/^Estás entrenando Espalda y pecho\. Ahora toca Jalón al pecho\./);
  });
});

describe("versión del contexto (revisión AC3: hallazgo 22)", () => {
  it("con check-in hoy, la versión no cambia con la hora del pedido: sólo con los datos o el día", async () => {
    const w = await coachWorld();
    await fu.saveCheckin(w.user, { energy: 3, sleep: 4, mood: 3 });
    const t0 = new Date();
    const a = await loadContext(w.user, { section: "home" }, t0);
    const b = await loadContext(w.user, { section: "home" }, new Date(t0.getTime() + 1_000));
    expect(a.ctx.readiness.energy.value).toBe(3);
    expect(b.ctx.version).toBe(a.ctx.version);
    await fu.saveCheckin(w.user, { energy: 5, sleep: 4, mood: 3 });
    expect((await loadContext(w.user, { section: "home" }, t0)).ctx.version).not.toBe(a.ctx.version);
  });
});
