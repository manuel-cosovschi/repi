// D210 · Motor proactivo de REPI de punta a punta (servidor + base de prueba): señales reales (sesiones, Training Intelligence,
// programa, check-in), candidatos del dominio, decide y brain_intervention. Casos del máster §25: 41–46, 48–50 y 54. Nada
// llama a un modelo (sin OPENAI_API_KEY en las pruebas).
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@repi/domain";
import { addArDays, arInstant, arParts, arWeekStart } from "@repi/domain/brain/quiet";
import { db, schema } from "@/db";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { resetRateLimits } from "@/server/access/util";
import { updatePrefs } from "@/server/brain/prefs";
import { markIntervention } from "@/server/brain/store";
import { homeCandidates, proactiveFor, resetProactiveThrottle, runProactive } from "@/server/brain/proactive";

const { brainIntervention, notificationOutbox, programAssignment, userPref } = schema;
const H = 3_600_000, D = 24 * H;
let n = 0, EX = "", EX_NAME = "";

const person = async (birthDate: string | null = "1990-01-01") => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: `Persona Proactiva ${++n}`, email: `${id}@test.repi.local`, emailVerified: true, birthDate });
  return { id, email: `${id}@test.repi.local` };
};
beforeAll(async () => {
  EX_NAME = "Press inclinado AC3";
  EX = (await db.insert(schema.exercise).values({ name: EX_NAME, muscleGroup: "Pecho" }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, EX_NAME)))[0].id;
});
beforeEach(() => { resetRateLimits(); resetProactiveThrottle(); });
afterEach(() => { vi.unstubAllEnvs(); });

/** Coach + alumno con un programa de un ejercicio (1 × 8–10). La asignación se adelanta para poder registrar sesiones pasadas. */
async function world(o: { birth?: string | null; reps?: string } = {}) {
  const coach = await person();
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach Proactivo ${n}` });
  const u = await person(o.birth === undefined ? "1990-01-01" : o.birth);
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(coach.id, org.id, { name: "Base", weeks: 4, note: "",
    days: [{ name: "Día A", exercises: [{ exerciseId: EX, name: EX_NAME, sets: 1, reps: o.reps ?? "8-10", rir: 2, restSec: 120 }] }] });
  await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  await db.update(programAssignment).set({ startsOn: "2020-01-01" }).where(eq(programAssignment.coachClientId, rel.relationId));
  return { coach: coach.id, org: org.id, user: u.id, rel: rel.relationId };
}
/** Una sesión terminada en `at` con las series indicadas del primer ejercicio. */
async function train(user: string, at: Date, sets: { w: number; r: number; rir?: number }[]) {
  const t = await tr.myTraining(user, at);
  if (t.state !== "ready") throw new Error(t.state);
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: t.program.days[0].id }, at);
  const ses = await tr.getSession(user, sid, at);
  for (const [i, x] of sets.entries()) await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: ses.exercises[0].id, setIndex: i, weightKg: x.w, reps: x.r, rir: x.rir ?? 2 }, at);
  await tr.sessionAction(user, sid, "finish", at);
  return sid;
}
const rows = (user: string) => db.select().from(brainIntervention).where(eq(brainIntervention.userId, user));
const byKind = async (user: string, kind: string) => (await rows(user)).filter((r) => r.kind === kind);
const copyProgram = async (rel: string) => (await db.select().from(programAssignment).where(and(eq(programAssignment.coachClientId, rel), eq(programAssignment.status, "active"))))[0].programId;
const doc = (reps: string) => ({ name: "Base", weeks: 4, note: "", days: [{ name: "Día A", exercises: [{ exerciseId: EX, name: EX_NAME, sets: 1, reps, rir: 2, restSec: 120 }] }] });

describe("logros y tendencias (casos 41–45)", () => {
  it("caso 41 · logro auténtico: marca personal con historia previa (la primera vez no es récord)", async () => {
    const w = await world();
    const now = new Date();
    await train(w.user, new Date(now.getTime() - 6 * D), [{ w: 60, r: 8 }]);
    // Primera sesión: sin historia no hay marca.
    expect((await proactiveFor(w.user, now)).emitted.some((i) => i.kind === "pr")).toBe(false);
    await train(w.user, new Date(now.getTime() - 4 * D), [{ w: 60, r: 8 }]);
    await train(w.user, new Date(now.getTime() - 20 * H), [{ w: 65, r: 8 }]);
    const r = await proactiveFor(w.user, now);
    const pr = r.emitted.find((i) => i.kind === "pr");
    expect(pr).toMatchObject({ category: "achievement", status: "pending", title: `Marca en ${EX_NAME}`, channel: "card" });
    expect(pr!.body.startsWith(`En ${EX_NAME} `)).toBe(true);
    expect(pr!.evidence?.basis).toContain("sin anuladas ni aproximaciones");
    expect(pr!.data).toMatchObject({ exerciseId: EX });
  });

  it("caso 41 · objetivo semanal cumplido con las sesiones registradas desde el lunes", async () => {
    const w = await world();
    await db.insert(userPref).values({ userId: w.user, wishes: { goal: null, daysPerWeek: 2, minutes: null, likes: null, avoid: null } });
    const now = new Date();
    await train(w.user, new Date(now.getTime() - 2 * 60_000), [{ w: 60, r: 8 }]); // minutos antes: siempre en esta semana
    await train(w.user, new Date(now.getTime() - 60_000), [{ w: 60, r: 8 }]);
    await proactiveFor(w.user, now);
    const [wk] = await byKind(w.user, "weekly_target_met");
    expect(wk).toMatchObject({ status: "pending", dedupeKey: `weekly_target:${arWeekStart(now)}` });
    expect(wk.payload.body).toBe("Completaste dos sesiones esta semana, justo la frecuencia que te habías propuesto.");
  });

  it("caso 42 · tendencia positiva con evidencia (fechas de las sesiones comparadas)", async () => {
    const w = await world();
    const now = new Date();
    for (const [d, kg] of [[9, 50], [6, 52.5], [3, 55]] as const) await train(w.user, new Date(now.getTime() - d * D), [{ w: kg, r: 8 }]);
    await train(w.user, new Date(now.getTime() - 20 * H), [{ w: 57.5, r: 8 }]);
    const r = await proactiveFor(w.user, now);
    const t = r.emitted.find((i) => i.kind === "progressing");
    expect(t).toMatchObject({ category: "progress", title: "Vas bien", status: "pending" });
    expect(t!.body).toBe(`Venís progresando en ${EX_NAME}: lo veo en tus últimas cuatro sesiones comparables.`);
    expect(t!.evidence?.sessions).toHaveLength(4);
    expect(t!.evidence?.basis).toMatch(/^Comparé las sesiones del \d\d\/\d\d, /);
    expect(t!.evidence?.excluded).toContain("anuladas");
  });

  it("caso 43 · datos insuficientes: la tendencia sin evidencia se calla (queda registrada) y no hay tarjeta", async () => {
    const w = await world();
    const now = new Date();
    // Sólo verifica la tendencia: los lunes el resumen semanal («Tu semana») se emite con todo derecho y rompía el caso
    // (CI del lunes 09/11, 00:06 en Argentina). Se apaga esa categoría para que el resultado no dependa del día.
    await updatePrefs(w.user, { categories: { weekly: false } });
    for (const [d, kg] of [[9, 50], [6, 52.5], [3, 55]] as const) await train(w.user, new Date(now.getTime() - d * D), [{ w: kg, r: 8 }]);
    await train(w.user, new Date(now.getTime() - 2 * D), [{ w: 55, r: 8 }]); // sube, sube, igual: «posible», 4 sesiones
    const r = await proactiveFor(w.user, now);
    expect(r.emitted).toEqual([]);
    expect(r.suppressed.insufficient_evidence).toBe(1);
    const [row] = await byKind(w.user, "progressing");
    expect(row).toMatchObject({ status: "suppressed", reason: "insufficient_evidence" });
    const home = await homeCandidates(w.user, now);
    expect(home).toEqual({ card: null, interventions: [] });
  });

  it("caso 44 · posible estancamiento con propuesta prudente (sin subir sola la carga)", async () => {
    const w = await world();
    const now = new Date();
    for (const d of [12, 9, 6, 3]) await train(w.user, new Date(now.getTime() - d * D), [{ w: 60, r: 8 }]);
    await train(w.user, new Date(now.getTime() - 20 * H), [{ w: 60, r: 8 }]);
    const r = await proactiveFor(w.user, now);
    const p = r.emitted.find((i) => i.kind === "plateau");
    expect(p).toMatchObject({ title: "Posible estancamiento", category: "progress" });
    expect(p!.body).toContain(`En ${EX_NAME} el rendimiento está estable hace cinco sesiones comparables.`);
    expect(p!.body).toContain("revisar con tu entrenador");
    expect(r.emitted.some((i) => i.kind === "pr")).toBe(false); // igualar no es marca
  });

  it("caso 45 · baja adherencia: «no registrás entrenamientos», nunca «faltaste»; se cancela al volver a registrar", async () => {
    const w = await world();
    const now = new Date();
    await train(w.user, new Date(now.getTime() - 8 * D), [{ w: 60, r: 8 }]);
    const r = await proactiveFor(w.user, now);
    const i = r.emitted.find((x) => x.kind === "inactivity")!;
    expect(i.body).toBe("Hace 8 días que no registrás entrenamientos. ¿Querés retomar?");
    expect(i.evidence?.basis).toContain("Si entrenaste sin registrar, no lo sé.");
    for (const x of [i.title, i.body, i.evidence?.basis ?? ""]) expect(x).not.toMatch(/falt(aste|ó)|no fuiste|ausen/i);
    await train(w.user, new Date(now.getTime() - H), [{ w: 60, r: 8 }]);
    const again = await proactiveFor(w.user, now);
    expect(again.cancelled).toBeGreaterThanOrEqual(1);
    expect((await byKind(w.user, "inactivity"))[0]).toMatchObject({ status: "cancelled", reason: "session_logged" });
  });

  it("resumen semanal sólo los lunes y sólo con la categoría encendida", async () => {
    const w = await world();
    const real = new Date();
    // El lunes más reciente a las 10 (hora AR) que ya pasó.
    let monday = arWeekStart(real);
    if (arInstant(monday, 10 * 60).getTime() > real.getTime()) monday = addArDays(monday, -7);
    const at = arInstant(monday, 10 * 60);
    const prev = addArDays(monday, -7);
    await train(w.user, arInstant(addArDays(prev, 1), 19 * 60), [{ w: 60, r: 8 }]);
    await train(w.user, arInstant(addArDays(prev, 3), 19 * 60), [{ w: 60, r: 8 }]);
    expect(arParts(at).dow).toBe(1);
    await proactiveFor(w.user, at);
    const [s] = await byKind(w.user, "weekly_summary");
    expect(s).toMatchObject({ status: "pending", dedupeKey: `weekly_summary:${prev}` });
    expect(s.payload.body).toBe("La semana pasada registraste dos sesiones.");
    // Otro lunes con la categoría apagada: queda callado con su motivo.
    const w2 = await world();
    await updatePrefs(w2.user, { categories: { weekly: false } });
    await train(w2.user, arInstant(addArDays(prev, 2), 19 * 60), [{ w: 60, r: 8 }]);
    await proactiveFor(w2.user, at);
    expect((await byKind(w2.user, "weekly_summary"))[0]).toMatchObject({ status: "suppressed", reason: "category_off" });
    // Un martes no hay resumen.
    const w3 = await world();
    await train(w3.user, arInstant(addArDays(prev, 2), 19 * 60), [{ w: 60, r: 8 }]);
    await proactiveFor(w3.user, arInstant(addArDays(monday, 1), 10 * 60));
    expect(await byKind(w3.user, "weekly_summary")).toEqual([]);
  });
});

describe("preferencias, prioridad y repetición (casos 46, 48, 49, 51)", () => {
  it("caso 46 · asistencia proactiva apagada: no se evalúa, no hay tarjeta y el cron la saltea", async () => {
    const w = await world();
    await updatePrefs(w.user, { proactive: false });
    await train(w.user, new Date(Date.now() - 8 * D), [{ w: 60, r: 8 }]);
    const r = await proactiveFor(w.user);
    expect(r).toMatchObject({ emitted: [], suppressed: {}, pushed: 0 });
    expect(await rows(w.user)).toEqual([]);
    expect((await homeCandidates(w.user)).card).toBeNull();
    const run = await runProactive(new Date(), { force: true, users: [w.user] });
    expect(run).toMatchObject({ ran: true, users: 0, evaluated: 0 });
  });

  it("caso 48 · varios eventos a la vez: sale lo más importante (tope diario) y el resto queda callado con su motivo", async () => {
    const w = await world();
    const now = new Date();
    await train(w.user, new Date(now.getTime() - 5 * D), [{ w: 60, r: 8 }]);
    await train(w.user, new Date(now.getTime() - 3 * D), [{ w: 60, r: 8 }]);
    await train(w.user, new Date(now.getTime() - 60_000), [{ w: 65, r: 8 }]); // hoy: cierre + marca
    await db.insert(schema.checkin).values({ userId: w.user, date: localDate(now), energy: 1, sleep: 3, mood: 3 });
    const r = await proactiveFor(w.user, now);
    expect(r.emitted.map((i) => i.category)).toEqual(["session", "session"]); // cierre y poca energía antes que el logro
    expect(r.emitted.map((i) => i.kind).sort()).toEqual(["low_energy", "session_review"]);
    expect((await byKind(w.user, "pr"))[0]).toMatchObject({ status: "suppressed", reason: "daily_cap" });
    const home = await homeCandidates(w.user, now);
    expect(home.card?.category).toBe("session");
    expect(home.interventions).toHaveLength(1);
    expect(home.interventions[0].id).not.toBe(home.card!.id);
  });

  it("caso 49 · el cron dos veces seguidas no duplica avisos ni push; fuera de franja no corre", async () => {
    const w = await world();
    await updatePrefs(w.user, { push: true, quietStart: "00:00", quietEnd: "00:00" });
    await train(w.user, new Date(Date.now() - 8 * D), [{ w: 60, r: 8 }]);
    const now = new Date();
    const a = await runProactive(now, { force: true, users: [w.user] });
    expect(a).toMatchObject({ ran: true, users: 1, evaluated: 1, failed: 0 });
    expect(a.emitted).toBeGreaterThanOrEqual(1);
    expect(a.pushed).toBe(1);
    const before = await rows(w.user);
    const [b, c] = await Promise.all([runProactive(now, { force: true, users: [w.user] }), runProactive(now, { force: true, users: [w.user] })]);
    expect(b.emitted + c.emitted).toBe(0);
    expect(b.duplicates).toBeGreaterThanOrEqual(1);
    expect((await rows(w.user)).map((r) => [r.id, r.status])).toEqual(before.map((r) => [r.id, r.status]));
    const pushes = await db.select().from(notificationOutbox).where(and(eq(notificationOutbox.userId, w.user), eq(notificationOutbox.kind, "brain_coaching")));
    expect(pushes).toHaveLength(1);
    expect(pushes[0].dedupeKey).toMatch(new RegExp(`^brain:reminder:[0-9a-f-]{36}:${w.user}$`));
    // Registro de la corrida sin personas ni contenido (para REPI Admin).
    const [audit] = await db.select().from(schema.auditEvent).where(eq(schema.auditEvent.action, "brain.proactive_run")).orderBy(sql`${schema.auditEvent.at} desc`).limit(1);
    expect(audit.actorUserId).toBeNull();
    expect(JSON.stringify(audit.meta)).not.toContain(w.user);
    // Franja horaria: a las 10 (AR) no corre; a las 9 corre sólo el 1/60 de las personas que le toca a ese minuto.
    const today = arParts(now).day;
    expect(await runProactive(arInstant(today, 10 * 60), { users: [w.user] })).toMatchObject({ ran: false, reason: "fuera de franja" });
    const [{ b: bucket }] = (await db.execute<{ b: number }>(sql`select mod(hashtext(${w.user})::bigint + 2147483648, 60)::int as b`)) as unknown as { b: number }[];
    const mine = await runProactive(arInstant(today, 9 * 60 + bucket), { users: [w.user] });
    expect(mine).toMatchObject({ ran: true, bucket, users: 1 });
    const other = await runProactive(arInstant(today, 9 * 60 + ((bucket + 1) % 60)), { users: [w.user] });
    expect(other).toMatchObject({ ran: true, users: 0 });
  });

  it("caso 51 · lo ya descartado no vuelve a aparecer ni se vuelve a avisar", async () => {
    const w = await world();
    await train(w.user, new Date(Date.now() - 8 * D), [{ w: 60, r: 8 }]);
    const r = await proactiveFor(w.user);
    const i = r.emitted.find((x) => x.kind === "inactivity")!;
    await markIntervention(w.user, i.id, "dismissed");
    resetProactiveThrottle();
    const again = await proactiveFor(w.user);
    expect(again.emitted).toEqual([]);
    expect(again.duplicates).toBeGreaterThanOrEqual(1);
    expect((await byKind(w.user, "inactivity")).map((x) => x.status)).toEqual(["dismissed"]);
    expect((await homeCandidates(w.user)).card).toBeNull();
  });
});

describe("programa del entrenador (casos 50 y 54)", () => {
  it("caso 54 · el coach actualiza el programa: una tarjeta por versión · caso 50 · otra versión vuelve obsoleta la anterior", async () => {
    const w = await world();
    const now = new Date();
    await train(w.user, new Date(now.getTime() - 3 * D), [{ w: 60, r: 8 }]); // congela la versión 1
    const pid = await copyProgram(w.rel);
    expect((await tr.saveProgram(w.coach, w.org, pid, doc("8-12"))).created).toBe(true); // versión 2
    const r1 = await proactiveFor(w.user, now);
    const v2 = r1.emitted.find((i) => i.kind === "program_updated")!;
    expect(v2).toMatchObject({ category: "coach", title: "Rutina actualizada", body: "Tu entrenador actualizó tu rutina. Te muestro qué cambió antes de empezar." });
    expect(v2.programVersionId).toBeTruthy();
    // Volver a evaluar no repite la tarjeta de la misma versión.
    expect((await proactiveFor(w.user, now)).emitted.filter((i) => i.kind === "program_updated")).toEqual([]);
    // Entrena con la versión 2 (la congela) y el coach vuelve a cambiar: versión 3.
    await train(w.user, new Date(now.getTime() - H), [{ w: 60, r: 8 }]);
    expect((await tr.saveProgram(w.coach, w.org, pid, doc("10-12"))).created).toBe(true);
    const r2 = await proactiveFor(w.user, now);
    expect(r2.cancelled).toBeGreaterThanOrEqual(1);
    const [old] = await db.select().from(brainIntervention).where(eq(brainIntervention.id, v2.id));
    expect(old).toMatchObject({ status: "cancelled", reason: "program_changed" });
    const v3 = r2.emitted.find((i) => i.kind === "program_updated")!;
    expect(v3.programVersionId).not.toBe(v2.programVersionId);
    expect((await homeCandidates(w.user, now)).card?.id).toBe(v3.id); // la instrucción del entrenador va primero
  });
});

describe("revisión AC3 (hallazgos 7 y 31)", () => {
  it("hallazgo 7 · el 1RM estimado previo sale de cada serie de 1 a 12: una AMRAP de 14 no tapa la serie de 10 a esa carga", async () => {
    const w = await world();
    const now = new Date();
    await train(w.user, new Date(now.getTime() - 8 * D), [{ w: 60, r: 14, rir: 0 }]);
    await train(w.user, new Date(now.getTime() - 6 * D), [{ w: 60, r: 10 }]);
    await train(w.user, new Date(now.getTime() - 4 * D), [{ w: 50, r: 10 }]);
    await train(w.user, new Date(now.getTime() - 20 * H), [{ w: 55, r: 12 }]); // 77 estimado, por debajo de 60 × 10 (80)
    await proactiveFor(w.user, now);
    expect(await byKind(w.user, "pr")).toEqual([]); // ni emitida ni callada: no hay marca
  });

  it("hallazgo 31 · con el módulo «assistant» apagado ni Inicio ni el cron generan avisos", async () => {
    const w = await world();
    await train(w.user, new Date(Date.now() - 8 * D), [{ w: 60, r: 8 }]);
    vi.stubEnv("NEXT_PUBLIC_REPI_FEATURES", "-assistant");
    expect(await proactiveFor(w.user)).toMatchObject({ emitted: [], pushed: 0 });
    expect((await homeCandidates(w.user)).card).toBeNull();
    expect(await runProactive(new Date(), { force: true, users: [w.user] })).toMatchObject({ ran: false, reason: "módulo apagado" });
    expect(await rows(w.user)).toEqual([]);
    vi.unstubAllEnvs();
    expect((await proactiveFor(w.user)).emitted.some((i) => i.kind === "inactivity")).toBe(true);
  });
});
