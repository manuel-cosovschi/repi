// D217 · Personalización y Progress Intelligence 2.0 contra la base descartable (repi_test), con servicios reales y sin IA.
// Cubre el perfil canónico (estado, procedencia, menores, invalidación), su consumo por el cerebro y Training Intelligence, la
// vista inteligente por ejercicio (coherente con TI), las metas propias y la seguridad (dueño, coach, REPI Control).
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { resetRateLimits } from "@/server/access/util";
import * as pf from "@/server/settings/profile";
import * as st from "@/server/settings/services";
import { loadContext } from "@/server/brain/context";
import { trendsFor } from "@/server/brain/orchestrator";
import { upsertIntervention } from "@/server/brain/store";
import * as ins from "@/server/progress/insight";
import * as goals from "@/server/progress/goals";
import * as cg from "@/server/training/goals";
import * as hist from "@/server/training/history";
import * as tr from "@/server/training/services";
import * as own from "@/server/training/own-routines";
import { coachWorld, daysAgo, err, pastSession, rawPerson, send, startToday } from "./brain-chat.world";

beforeEach(() => resetRateLimits());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

/** Cinco sesiones de press banca (8-10) subiendo de a una repetición con la misma carga y una con carga mayor. */
async function benchHistory(user: string) {
  const ids: string[] = [];
  for (const [d, w, r] of [[28, 60, 8], [24, 60, 9], [20, 60, 10], [16, 62.5, 8], [12, 62.5, 9]] as const)
    ids.push(await pastSession(user, daysAgo(d), { "Press banca": [[w, r, 2], [w, r, 2], [w, r - 1, 1]] }));
  return ids;
}

describe("perfil de entrenamiento (casos 1–12)", () => {
  it("1–4 · sin perfil → parcial → completo; sólo se pregunta lo que falta y queda la procedencia", async () => {
    const w = await coachWorld();
    expect(await pf.myProfile(w.user)).toMatchObject({ status: "none", missing: ["goal", "experience", "daysPerWeek", "minutes"], version: 0 });
    const a = await pf.updateProfile(w.user, { goal: "muscle", daysPerWeek: 4 }, "routines");
    expect(a).toMatchObject({ status: "partial", missing: ["experience", "minutes"], changed: ["goal", "daysPerWeek"], version: 1 });
    expect(a.profile!.meta!.fields.goal!.via).toBe("routines");
    const b = await pf.updateProfile(w.user, { experience: "intermediate", minutes: 60 }, "onboarding");
    expect(b).toMatchObject({ status: "complete", missing: [], version: 2 });
    expect(b.profile).toMatchObject({ goal: "muscle", daysPerWeek: 4, experience: "intermediate", minutes: 60 });
    // Repetir lo mismo no cambia nada (no sube la versión ni audita).
    expect(await pf.updateProfile(w.user, { goal: "muscle" }, "profile")).toMatchObject({ changed: [], version: 2 });
    const audits = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, w.user), eq(schema.auditEvent.action, "profile.updated")));
    expect(audits).toHaveLength(2);
    expect(JSON.stringify(audits.map((x) => x.meta))).not.toContain("muscle"); // sin valores en la auditoría
  });
  it("8 · cancelar el formulario: queda registrado dónde se ofreció y no se vuelve a ofrecer ahí", async () => {
    const w = await coachWorld();
    await pf.markProfileAsked(w.user, "solo");
    expect((await pf.myProfile(w.user)).asked).toHaveProperty("solo");
    expect((await pf.myProfile(w.user)).status).toBe("none");
  });
  it("7 · cambiar el objetivo cancela los avisos que dependían de él; el programa no cambia", async () => {
    const w = await coachWorld();
    await pf.updateProfile(w.user, { goal: "muscle", daysPerWeek: 3 }, "profile");
    const before = await tr.myTraining(w.user);
    const { intervention } = await upsertIntervention(w.user, { kind: "weekly_summary", dedupeKey: `weekly_summary:${randomUUID()}`, priority: 5, channel: "card", category: "weekly",
      title: "Tu semana", body: "2 de 3", evidence: null, actions: [], data: {}, expiresAt: new Date(Date.now() + 7 * 86_400_000), programVersionId: null } as never);
    await pf.updateProfile(w.user, { goal: "strength" }, "profile");
    const [row] = await db.select().from(schema.brainIntervention).where(eq(schema.brainIntervention.id, intervention.id));
    expect(row).toMatchObject({ status: "cancelled", reason: "profile_changed" });
    const after = await tr.myTraining(w.user);
    expect(after.state === "ready" && before.state === "ready" && after.program!.days).toEqual(before.state === "ready" && before.program!.days);
  });
  it("11–12 · menores y edad sin confirmar: un objetivo corporal no se acepta", async () => {
    const minor = await rawPerson(`${new Date().getFullYear() - 15}-03-01`);
    expect(await err(pf.updateProfile(minor, { goal: "fat_loss" }, "profile"))).toMatchObject({ code: "invalid" });
    expect((await pf.updateProfile(minor, { goal: "habit", experience: "beginner" }, "profile")).status).toBe("partial");
    const unknown = await rawPerson(null);
    expect(await err(pf.updateProfile(unknown, { goal: "fat_loss" }, "profile"))).toMatchObject({ code: "invalid" });
    expect((await pf.myProfile(unknown)).age).toBe("unknown");
  });
  it("valida campos y no acepta datos de salud ni campos desconocidos", async () => {
    const w = await coachWorld();
    expect(await err(pf.updateProfile(w.user, { lesion: "rodilla" }, "profile"))).toMatchObject({ code: "invalid" });
    expect(await err(pf.updateProfile(w.user, { daysPerWeek: 9 }, "profile"))).toMatchObject({ code: "invalid" });
    expect(await err(pf.updateProfile(w.user, { goal: "x" }, "nowhere" as never))).toMatchObject({ code: "invalid" });
  });
  it("la pantalla anterior (D139) guarda sobre el perfil canónico sin borrar la experiencia", async () => {
    const w = await coachWorld();
    await pf.updateProfile(w.user, { experience: "advanced" }, "onboarding");
    await st.updateSettings(w.user, { wishes: { goal: "strength", daysPerWeek: 3, minutes: 50, likes: null, avoid: null } });
    expect((await pf.myProfile(w.user)).profile).toMatchObject({ goal: "strength", experience: "advanced", daysPerWeek: 3, minutes: 50 });
  });
});

describe("personalización (casos 13–25)", () => {
  it("el cerebro conoce objetivo, experiencia y disponibilidad declarados; si faltan, lo dice", async () => {
    const w = await coachWorld();
    let sc = await loadContext(w.user, { section: "progress" });
    expect(sc.ctx.person.experience.value).toBeNull();
    expect(sc.ctx.person.profile).toEqual({ status: "none", version: 0 });
    await pf.updateProfile(w.user, { goal: "strength", experience: "advanced", daysPerWeek: 3, minutes: 75, dislikes: [{ id: w.EX["Prensa"], name: "Prensa" }] }, "profile");
    sc = await loadContext(w.user, { section: "progress" });
    expect(sc.ctx.person.experience.value).toBe("avanzado");
    expect(sc.ctx.person.goals.value).toEqual(["fuerza"]);
    expect(sc.ctx.person.weeklyTarget.value).toBe(3);
    expect(sc.ctx.person.profile).toMatchObject({ status: "complete", version: 1 });
    expect(sc.avoids).toContain("Prensa");
    expect(sc.personal).toMatchObject({ goal: "strength", experience: "advanced", status: "complete" });
  });
  it("18 · programa del profe: el perfil de principiante NO agrega guía de esfuerzo ni cambia cargas; sí el énfasis del objetivo", async () => {
    const w = await coachWorld();
    await benchHistory(w.user);
    await pf.updateProfile(w.user, { goal: "health", experience: "beginner", daysPerWeek: 2, minutes: 45 }, "profile");
    const { session } = await startToday(w.user);
    const bench = session.exercises.find((e) => e.name === "Press banca")!;
    const rows = await db.select().from(schema.trainingTarget).where(and(eq(schema.trainingTarget.programExerciseId, bench.id)));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !(r.detail.reasons ?? []).includes("profile_beginner_effort"))).toBe(true);
  });
  it("13–14 · rutina propia de una principiante: guía de esfuerzo «no al fallo» en las series principales, sin cambiar la carga", async () => {
    const w = await coachWorld();
    await benchHistory(w.user);
    await pf.updateProfile(w.user, { goal: "health", experience: "beginner", daysPerWeek: 2, minutes: 45 }, "profile");
    const r = await own.saveOwnRoutine(w.user, { name: "Mi pecho", exercises: [{ exerciseId: w.EX["Press banca"], sets: 3, reps: "8-10", weightKg: null, restSec: 90, note: null }] });
    const sid = randomUUID();
    await own.startOwnRoutine(w.user, r.id, sid);
    await tr.getSession(w.user, sid);
    const rows = await db.select().from(schema.trainingTarget).where(eq(schema.trainingTarget.sessionId, sid));
    const main = rows.find((x) => x.setIndex === 0)!;
    expect(main.detail.reasons).toContain("profile_beginner_effort");
    expect(main.rirTarget).toBe(2);
    expect(main.weightKg).not.toBeNull(); // la carga sale de su historial comparable, igual que sin perfil
  });
  it("15 · sin historial: ninguna carga inventada aunque el perfil esté completo", async () => {
    const w = await coachWorld();
    await pf.updateProfile(w.user, { goal: "health", experience: "beginner", daysPerWeek: 2, minutes: 45 }, "profile");
    const { session } = await startToday(w.user);
    const bench = session.exercises.find((e) => e.name === "Press banca")!;
    const rows = await db.select().from(schema.trainingTarget).where(eq(schema.trainingTarget.programExerciseId, bench.id));
    expect(rows.every((r) => r.weightKg == null && r.status === "no_data")).toBe(true);
  });
});

describe("Progress Intelligence (casos 26–41)", () => {
  it("máximo real, mejor serie, 1RM estimado, estimaciones, récords y la MISMA propuesta que Training Intelligence", async () => {
    const w = await coachWorld();
    await benchHistory(w.user);
    await pf.updateProfile(w.user, { goal: "strength", experience: "intermediate", daysPerWeek: 3, minutes: 60 }, "profile");
    const x = await ins.myExerciseInsight(w.user, w.EX["Press banca"]);
    expect(x.metric).toBe("load");
    expect(x.max).toMatchObject({ w: 62.5, r: 9 });
    expect(x.bestSet).toMatchObject({ w: 62.5, r: 9, e1rm: 81.3 });
    expect(x.bestSet!.criterion).toContain("1 a 12 repeticiones");
    expect(x.e1rm!.method).toContain("no una repetición máxima ejecutada");
    expect(x.estimates!.rows.every((r) => Math.abs(r.reps - x.estimates!.ref.r) <= 4)).toBe(true);
    expect(x.records.count).toBeGreaterThan(0);
    expect(x.regularity.target).toBe(3);
    // Coherencia: la propuesta de Progreso es la de Training Intelligence en el cerebro (mismo cálculo y mismo perfil).
    const sc = await loadContext(w.user, { section: "progress", ref: { exerciseId: w.EX["Press banca"] } });
    const tr2 = (await trendsFor(sc, [sc.ref.exercise!], new Date())).get(sc.ref.exercise!.ref)!;
    expect(x.next!.proposal).toEqual(tr2.proposal);
    expect(x.next!.trend).toEqual(tr2.trend);
    expect(x.next!.used.length).toBe(tr2.points.length);
    expect(x.personal.status).toBe("complete");
  });
  it("36–37 · serie anulada no cuenta; serie corregida cuenta con su valor vigente, sin duplicar", async () => {
    const w = await coachWorld();
    const [s1] = await benchHistory(w.user);
    const last = (await benchHistory(w.user)).at(-1)!;
    const logs = (s: Awaited<ReturnType<typeof hist.historySession>>) => s.exercises.flatMap((e) => e.rows.map((r) => r.log).filter((l): l is NonNullable<typeof l> => !!l));
    const top = logs(await hist.historySession(w.user, last)).find((l) => Number(l.weightKg) === 62.5)!;
    await hist.setVoided(w.user, last, top.id, { requestId: randomUUID(), voided: true });
    const all = (await ins.exerciseSets(w.user, w.EX["Press banca"])).sets;
    expect(all.length).toBe(29); // 10 sesiones × 3 series − 1 anulada
    const first = logs(await hist.historySession(w.user, s1))[0];
    await hist.correctSet(w.user, s1, first.id, { requestId: randomUUID(), baseRevision: first.revision, values: { weightKg: 90 }, confirm: true });
    const x = await ins.myExerciseInsight(w.user, w.EX["Press banca"]);
    expect(x.max).toMatchObject({ w: 90 });
    expect((await ins.exerciseSets(w.user, w.EX["Press banca"])).sets.length).toBe(29);
  });
  it("34–35 · historial importado con fecha aproximada: marcado, sin contar como regularidad ni referencia de estimaciones", async () => {
    const w = await coachWorld();
    const [imp] = await db.insert(schema.historyImport).values({ userId: w.user, status: "confirmed", source: "notes", parsed: { approx: { sessions: 2, from: "2025-01-01", to: "2025-01-08" }, sets: [], matches: {}, notes: [], dropped: 0, capped: false }, sessions: 2, sets: 2 }).returning();
    await db.insert(schema.historyEntry).values([
      { importId: imp.id, userId: w.user, day: "2025-01-01", exerciseId: w.EX["Sentadilla"], exerciseName: "Sentadilla", setIndex: 0, weightKg: "100", reps: 5 },
      { importId: imp.id, userId: w.user, day: "2025-01-08", exerciseId: w.EX["Sentadilla"], exerciseName: "Sentadilla", setIndex: 0, weightKg: "105", reps: 5 },
    ]);
    const x = await ins.myExerciseInsight(w.user, w.EX["Sentadilla"]);
    expect(x.max).toMatchObject({ w: 105, approx: true, source: "import" });
    expect(x.estimates).toBeNull();
    expect(x.data).toMatchObject({ imported: 2, approx: 2 });
    expect(x.regularity.avgGapDays).toBeNull();
  });
});

describe("metas por ejercicio (caso 31) y seguridad (58–64)", () => {
  it("meta propia «80 kg × 8»: estado con la mejor serie con ese peso; el coach no la ve ni la cambia", async () => {
    const w = await coachWorld();
    await benchHistory(w.user);
    const g = await goals.createSelfGoal(w.user, { kind: "load", exerciseId: w.EX["Press banca"], target: 62.5, targetReps: 10 }, async (id) => (await ins.exerciseSets(w.user, id)).sets);
    expect(g).toMatchObject({ origin: "self", kind: "load", target: 62.5, targetReps: 10, baseline: 60 });
    const x = await ins.myExerciseInsight(w.user, w.EX["Press banca"]);
    expect(x.goals.self[0].text).toBe("Tu meta es 62,5 kg × 10. La mejor serie registrada con ese peso fue de 9 repeticiones.");
    expect(x.goals.canSet).toBe(true);
    // El coach no la ve en su lista ni la puede cambiar; el alumno no puede cambiar una meta del coach.
    expect((await cg.listGoals(w.coach.id, w.org.id, w.relId)).goals).toHaveLength(0);
    expect(await err(cg.updateGoal(w.coach.id, w.org.id, g.id, { status: "cancelled" }))).toMatchObject({ status: 404 });
    const coachGoal = await cg.createGoal(w.coach.id, w.org.id, w.relId, { kind: "load", exerciseId: w.EX["Press banca"], target: 70, targetReps: 8 });
    expect(await err(goals.updateSelfGoal(w.user, coachGoal.id, { status: "cancelled" }))).toMatchObject({ status: 404 });
    expect((await ins.myExerciseInsight(w.user, w.EX["Press banca"])).goals.coach[0]).toMatchObject({ id: coachGoal.id, title: expect.stringContaining("70") });
    // Otra persona no puede tocar la meta propia.
    const other = await coachWorld();
    expect(await err(goals.updateSelfGoal(other.user, g.id, { status: "cancelled" }))).toMatchObject({ status: 404 });
    expect((await goals.updateSelfGoal(w.user, g.id, { status: "achieved" })).status).toBe("achieved");
  });
  it("58 · un usuario no puede leer el progreso de otro (ejercicio propio de otra persona o sin registros: 404)", async () => {
    const a = await coachWorld(), b = await coachWorld();
    await benchHistory(a.user);
    expect(await err(ins.myExerciseInsight(b.user, a.EX["Press banca"]))).toMatchObject({ status: 404 });
    const [own] = await db.insert(schema.exercise).values({ name: `Propio ${randomUUID()}`, muscleGroup: "Pecho", ownerUserId: a.user }).returning();
    expect(await err(ins.myExerciseInsight(b.user, own.id))).toMatchObject({ status: 404 });
    expect(await err(goals.createSelfGoal(b.user, { kind: "reps", exerciseId: own.id, target: 10 }, async () => []))).toMatchObject({ status: 404 });
  });
  it("10/61 · REPI Control: el socio de un gimnasio supervisado no fija metas desde Progreso", async () => {
    const owner = await rawPerson("1985-01-01"), member = await rawPerson("1990-01-01");
    const [org] = await db.insert(schema.organization).values({ kind: "gym", name: `Gym PI ${randomUUID()}`, status: "active", commercialStatus: "enabled", routinePolicy: "supervised", createdBy: owner }).returning();
    const [loc] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    await db.insert(schema.gymMember).values({ orgId: org.id, locationId: loc.id, userId: member, status: "active" });
    expect(await goals.canSetSelfGoals(member)).toEqual({ allowed: false, supervised: true });
    const [e] = await db.insert(schema.exercise).values({ name: `Sentadilla PI ${randomUUID()}`, muscleGroup: "Piernas" }).returning();
    expect(await err(goals.createSelfGoal(member, { kind: "reps", exerciseId: e.id, target: 10 }, async () => []))).toMatchObject({ code: "supervised", status: 403 });
    // El perfil sí es personal: se puede completar igual.
    expect((await pf.updateProfile(member, { goal: "health" }, "profile")).status).toBe("partial");
  });
  it("64 · REPI responde máximo real, capacidad, próxima carga y distancia con datos validados en el servidor", async () => {
    const w = await coachWorld();
    await benchHistory(w.user);
    const a = await send(w.user, "¿Cuál es el máximo que levanté en press banca?", { section: "progress" });
    expect(a.reply.text).toContain("Tu mayor carga registrada en Press banca es 62,5 kg × 9");
    expect(a.reply.text).toContain("no una repetición máxima ejecutada");
    const b = await send(w.user, "¿Cuánto podría tirar para 8 repeticiones en press banca?", { section: "progress" });
    expect(b.reply.text).toContain("Estimación aproximada");
    expect(b.reply.text).toContain("No es tu próxima carga de trabajo");
    const c = await send(w.user, "¿Cuánto me falta para llegar a 80 kg en press banca?", { section: "progress" });
    expect(c.reply.text).toContain("te faltan 17,5 kg para 80 kg");
    const d = await send(w.user, "¿Qué me recomendás intentar la próxima vez en press banca?", { section: "progress" });
    expect(d.reply.text).toMatch(/La última vez completaste|Todavía no tengo sesiones comparables/);
    expect(localDate(new Date())).toBeTruthy();
  });
});
