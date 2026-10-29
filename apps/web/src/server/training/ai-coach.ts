// «No vino el profe» con IA (D133). Sobre el plan con reglas de D108, una sugerencia personalizada para hoy: qué día del
// programa hacer y con qué cargas, según los registros recientes, el historial importado, los objetivos y el check-in del día.
// Sólo propone ejercicios del programa asignado (no inventa rutinas) y no recibe datos de salud, nombre ni email.
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { aiFastModel, aiJson, aiOn } from "../ai/openai";
import { myTraining } from "./services";
import { myGoals } from "./goals";

const { workoutSession, setLog, checkin } = schema;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["dayId", "headline", "summary", "exercises", "caution"],
  properties: {
    dayId: { type: ["string", "null"] },
    headline: { type: "string" },
    summary: { type: "string" },
    exercises: { type: "array", items: { type: "object", additionalProperties: false, required: ["programExerciseId", "sets", "reps", "weightKg", "note"], properties: {
      programExerciseId: { type: "string" }, sets: { type: "integer" }, reps: { type: "string" }, weightKg: { type: ["number", "null"] }, note: { type: "string" },
    } } },
    caution: { type: ["string", "null"] },
  },
};
type Out = { dayId: string | null; headline: string; summary: string; exercises: { programExerciseId: string; sets: number; reps: string; weightKg: number | null; note: string }[]; caution: string | null };

const SYSTEM = `Sos un entrenador de fuerza que ayuda a una persona cuando su profesor no está. Respondé en español rioplatense, breve y concreto.
Reglas:
- Elegí UN día del programa asignado (dayId exacto de la lista) para hoy: normalmente el «próximo», salvo que ya lo haya hecho hoy o la semana muestre otra cosa.
- Para cada ejercicio de ese día proponé series, repeticiones y peso usando su última marca: progresá poco (+2,5 kg o +1 repetición) si completó bien; mantené o bajá un 5–10 % si el check-in muestra poca energía o mal sueño. Sin dato previo, weightKg null y una nota para empezar liviano.
- Usá sólo los programExerciseId del día elegido. No agregues ejercicios nuevos ni cambies los del programa.
- No des consejos médicos. Si hay señales de fatiga, sugerí descansar o bajar la intensidad en «caution».
- headline: máximo 50 caracteres. summary: máximo 160 caracteres. note: máximo 60 caracteres.`;

export async function aiSoloAdvice(userId: string, now = new Date()) {
  if (!aiOn()) throw new AccessError("ai_unavailable", "La sugerencia con IA no está disponible en este momento.", 503);
  const t = await myTraining(userId, now);
  if (t.state !== "ready" || !t.program) throw new AccessError("no_program", "Todavía no tenés un programa asignado: pedíselo a tu coach o al equipo de sala.", 409);
  const today = localDate(now);
  const recent = await db.select({ id: workoutSession.id, dayName: workoutSession.dayName, endedAt: workoutSession.endedAt, rpe: workoutSession.rpe }).from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, new Date(now.getTime() - 21 * 86_400_000))))
    .orderBy(desc(workoutSession.endedAt)).limit(12);
  const sets = recent.length ? await db.select({ s: setLog.sessionId }).from(setLog).where(inArray(setLog.sessionId, recent.map((r) => r.id))) : [];
  const [ci] = await db.select().from(checkin).where(and(eq(checkin.userId, userId), eq(checkin.date, today)));
  const goals = (await myGoals(userId, now).catch(() => [])).filter((g) => g.progress != null || g.current != null).slice(0, 5);
  const next = t.program.days[t.program.nextDay];
  const ctx = {
    hoy: today, relacion: t.relation?.kind === "gym" ? "programa del gimnasio" : "programa de su coach",
    programa: t.program.name, proximoDia: next ? { dayId: next.id, nombre: next.name } : null,
    dias: t.program.days.map((d) => ({ dayId: d.id, nombre: d.name, ejercicios: d.exercises.map((e) => ({ programExerciseId: e.id, nombre: e.name, series: e.sets, reps: e.reps, rir: e.rir, ultimaMarca: e.prev })) })),
    ultimosEntrenamientos: recent.map((r) => ({ dia: r.dayName, fecha: r.endedAt ? localDate(r.endedAt) : null, rpe: r.rpe, series: sets.filter((x) => x.s === r.id).length })),
    checkinHoy: ci ? { energia: ci.energy, sueno: ci.sleep, animo: ci.mood } : null,
    objetivos: goals.map((g) => ({ objetivo: g.title, actual: g.current, meta: g.target, progreso: g.progress })),
  };
  const out = await aiJson<Out>({ name: "rutina_de_hoy", system: SYSTEM, parts: [{ type: "text", text: JSON.stringify(ctx) }], schema: SCHEMA, fast: true, maxTokens: 900, timeoutMs: 15_000 });
  // Validación: sólo días y ejercicios reales del programa; números en rango.
  const day = t.program.days.find((d) => d.id === out.dayId) ?? next ?? t.program.days[0];
  const exs = day.exercises.map((e) => {
    const a = out.exercises.find((x) => x.programExerciseId === e.id);
    const w = a?.weightKg != null && a.weightKg >= 0 && a.weightKg <= 1000 ? Math.round(a.weightKg * 4) / 4 : null;
    return { id: e.id, name: e.name, sets: a && a.sets >= 1 && a.sets <= 10 ? a.sets : e.sets, reps: (a?.reps || e.reps).slice(0, 20), weightKg: w, note: (a?.note ?? "").slice(0, 120), prev: e.prev };
  });
  await audit(db, { actorUserId: userId, action: "adaptive.ai_advice", resourceType: "program_day", resourceId: day.id, meta: { model: aiFastModel(), usesAI: true } });
  return { dayId: day.id, dayName: day.name, headline: out.headline.slice(0, 80), summary: out.summary.slice(0, 400), caution: out.caution?.slice(0, 200) ?? null, exercises: exs };
}
