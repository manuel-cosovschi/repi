// «No vino el profe» con IA (D133). Sobre el plan con reglas de D108, una sugerencia personalizada para hoy: qué día del
// programa hacer y con qué cargas, según los registros recientes, el historial importado, los objetivos y el check-in del día.
// Sólo propone ejercicios del programa asignado (no inventa rutinas) y no recibe datos de salud, nombre ni email.
// D138: la persona puede responder («la máquina está ocupada», «no hay», «me molesta») y la IA rearma la rutina con esa
// información, cambiando sólo por alternativas compatibles de la biblioteca (primero las aprobadas por su profe) o salteando.
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { EXERCISE_CHANGE_REASONS, TRAINING_WISH_GOALS, hasWishes, isChangeReason, localDate, type ExerciseChangeReason } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { aiFastModel, aiJson, aiOn } from "../ai/openai";
import { dayAlternatives, myTraining } from "./services";
import { myGoals } from "./goals";
import { mySettings } from "../settings/services";

const { workoutSession, setLog, checkin } = schema;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["dayId", "headline", "summary", "exercises", "caution"],
  properties: {
    dayId: { type: ["string", "null"] },
    headline: { type: "string" },
    summary: { type: "string" },
    exercises: { type: "array", items: { type: "object", additionalProperties: false, required: ["programExerciseId", "sets", "reps", "weightKg", "note", "swapToExerciseId", "skip", "reason"], properties: {
      programExerciseId: { type: "string" }, sets: { type: "integer" }, reps: { type: "string" }, weightKg: { type: ["number", "null"] }, note: { type: "string" },
      swapToExerciseId: { type: ["string", "null"] }, skip: { type: "boolean" }, reason: { type: ["string", "null"], enum: [...Object.keys(EXERCISE_CHANGE_REASONS), null] },
    } } },
    caution: { type: ["string", "null"] },
  },
};
type Out = { dayId: string | null; headline: string; summary: string; exercises: { programExerciseId: string; sets: number; reps: string; weightKg: number | null; note: string; swapToExerciseId: string | null; skip: boolean; reason: string | null }[]; caution: string | null };

/** Respuesta de la persona a la sugerencia (D138): qué no se puede y por qué, más lo que quiera contar. */
export type AiFollowUp = { dayId: string | null; message: string; issues: { programExerciseId: string; reason: ExerciseChangeReason }[]; turns: { role: "user" | "assistant"; text: string }[] };

const SYSTEM = `Sos un entrenador de fuerza que ayuda a una persona cuando su profesor no está. Respondé en español rioplatense, breve y concreto. Hablás como REPI, la app: nunca digas «IA», «modelo» ni «inteligencia artificial».
Reglas:
- Elegí UN día del programa asignado (dayId exacto de la lista) para hoy: normalmente el «próximo», salvo que ya lo haya hecho hoy o la semana muestre otra cosa.
- Para cada ejercicio de ese día proponé series, repeticiones y peso usando su última marca: progresá poco (+2,5 kg o +1 repetición) si completó bien; mantené o bajá un 5–10 % si el check-in muestra poca energía o mal sueño. Sin dato previo, weightKg null y una nota para empezar liviano.
- Usá sólo los programExerciseId del día elegido. No agregues ejercicios nuevos ni cambies los del programa.
- Tené en cuenta «loQueBusca» (objetivo, tiempo disponible, gustos y lo que prefiere evitar) para el enfoque, las reps y las notas; si tiene pocos minutos, sugerí menos series. No cambies el programa por eso.
- No des consejos médicos. Si hay señales de fatiga, sugerí descansar o bajar la intensidad en «caution».
- headline: máximo 50 caracteres. summary: máximo 160 caracteres. note: máximo 60 caracteres.
- Sin «respuestaDeLaPersona»: swapToExerciseId null, skip false y reason null en todos.
- Con «respuestaDeLaPersona»: es su respuesta a tu sugerencia anterior. Respetá lo que cuenta. Mantené el mismo día salvo que pida otro.
  Para cada ejercicio con problema (o que su mensaje mencione como ocupado, inexistente o molesto) poné en swapToExerciseId UNO de sus «alternativas» (preferí aprobadoPorProfe y el mismo músculo) con peso según su ultimaMarca; si ninguna sirve o le molesta, skip true. reason: busy (ocupado), no_equipment (no hay), discomfort (molestia), no_time u other.
  Nunca uses un exerciseId que no esté en sus alternativas. Si es molestia, sugerí bajar la carga o saltear y recomendá avisar a su profe en «caution»; no diagnostiques.
  En summary hablale de vos y contestá en una oración a lo que dijo y qué cambiaste. Si cambiás un ejercicio sin ultimaMarca, weightKg null y nota para empezar liviano.`;

export async function aiSoloAdvice(userId: string, now = new Date(), follow?: AiFollowUp) {
  if (!aiOn()) throw new AccessError("ai_unavailable", "La sugerencia de REPI no está disponible en este momento.", 503);
  const t = await myTraining(userId, now);
  if (t.state !== "ready" || !t.program) throw new AccessError("no_program", "Todavía no tenés un programa asignado: pedíselo a tu coach o al equipo de sala.", 409);
  const today = localDate(now);
  const recent = await db.select({ id: workoutSession.id, dayName: workoutSession.dayName, endedAt: workoutSession.endedAt, rpe: workoutSession.rpe }).from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), gte(workoutSession.endedAt, new Date(now.getTime() - 21 * 86_400_000))))
    .orderBy(desc(workoutSession.endedAt)).limit(12);
  const sets = recent.length ? await db.select({ s: setLog.sessionId }).from(setLog).where(inArray(setLog.sessionId, recent.map((r) => r.id))) : [];
  const [ci] = await db.select().from(checkin).where(and(eq(checkin.userId, userId), eq(checkin.date, today)));
  const goals = (await myGoals(userId, now).catch(() => [])).filter((g) => g.progress != null || g.current != null).slice(0, 5);
  const { wishes } = await mySettings(userId); // D139: lo que la persona busca entrenando
  const next = t.program.days[t.program.nextDay];
  const ctx = {
    hoy: today, relacion: t.relation?.kind === "gym" ? "programa del gimnasio" : "programa de su coach",
    programa: t.program.name, proximoDia: next ? { dayId: next.id, nombre: next.name } : null,
    dias: t.program.days.map((d) => ({ dayId: d.id, nombre: d.name, ejercicios: d.exercises.map((e) => ({ programExerciseId: e.id, nombre: e.name, series: e.sets, reps: e.reps, rir: e.rir, ultimaMarca: e.prev })) })),
    ultimosEntrenamientos: recent.map((r) => ({ dia: r.dayName, fecha: r.endedAt ? localDate(r.endedAt) : null, rpe: r.rpe, series: sets.filter((x) => x.s === r.id).length })),
    checkinHoy: ci ? { energia: ci.energy, sueno: ci.sleep, animo: ci.mood } : null,
    objetivos: goals.map((g) => ({ objetivo: g.title, actual: g.current, meta: g.target, progreso: g.progress })),
    loQueBusca: wishes && hasWishes(wishes) ? { objetivo: wishes.goal ? TRAINING_WISH_GOALS[wishes.goal] : null, diasPorSemana: wishes.daysPerWeek, minutosDisponibles: wishes.minutes, leGusta: wishes.likes, prefiereEvitar: wishes.avoid } : null,
  };
  // D138: con respuesta de la persona, alternativas compatibles del día que venía haciendo (o del próximo).
  const followDay = follow ? t.program.days.find((d) => d.id === follow.dayId) ?? next ?? t.program.days[0] : null;
  const alts = followDay ? await dayAlternatives(userId, followDay.id, 8) : null;
  const named = (id: string) => followDay?.exercises.find((e) => e.id === id)?.name ?? null;
  const fullCtx = !follow || !followDay || !alts ? ctx : {
    ...ctx,
    // Para responder rápido, sólo el día que venía (salvo que pida otro: ahí basta con el nombre de los demás días).
    dias: ctx.dias.map((d) => (d.dayId === followDay.id ? d : { dayId: d.dayId, nombre: d.nombre, ejercicios: [] })),
    respuestaDeLaPersona: {
      diaQueVeniaHaciendo: { dayId: followDay.id, nombre: followDay.name },
      mensaje: follow.message.slice(0, 400) || null,
      problemas: follow.issues.filter((i) => named(i.programExerciseId)).map((i) => ({ programExerciseId: i.programExerciseId, ejercicio: named(i.programExerciseId), motivo: EXERCISE_CHANGE_REASONS[i.reason] })),
      conversacionPrevia: follow.turns.slice(-4).map((x) => `${x.role === "user" ? "Persona" : "Vos"}: ${x.text.slice(0, 300)}`),
    },
    alternativas: followDay.exercises.map((e) => ({ programExerciseId: e.id, ejercicio: e.name, opciones: (alts.get(e.id) ?? []).map((a) => ({ exerciseId: a.exerciseId, nombre: a.name, aprobadoPorProfe: a.approved, notaDelProfe: a.note, ultimaMarca: a.prev })) })),
  };
  const out = await aiJson<Out>({ name: "rutina_de_hoy", system: SYSTEM, parts: [{ type: "text", text: JSON.stringify(fullCtx) }], schema: SCHEMA, fast: true, maxTokens: 900, timeoutMs: 15_000 });
  // Validación: sólo días y ejercicios reales del programa; números en rango.
  const day = t.program.days.find((d) => d.id === out.dayId) ?? next ?? t.program.days[0];
  const exs = day.exercises.map((e) => {
    const a = out.exercises.find((x) => x.programExerciseId === e.id);
    const w = a?.weightKg != null && a.weightKg >= 0 && a.weightKg <= 1000 ? Math.round(a.weightKg * 4) / 4 : null;
    // D138: el cambio sólo vale si es una alternativa real de ese ejercicio; el motivo, el que eligió la persona si lo dijo.
    const opt = a?.swapToExerciseId ? alts?.get(e.id)?.find((x) => x.exerciseId === a.swapToExerciseId) ?? null : null;
    const said = follow?.issues.find((i) => i.programExerciseId === e.id)?.reason;
    const reason: ExerciseChangeReason = said ?? (isChangeReason(a?.reason) ? a.reason : "other");
    const skip = !opt && !!a?.skip && !!alts;
    // Otro ejercicio no lleva la carga del original: sin marca propia, sin peso sugerido (la nota dice empezar liviano).
    const sw = opt ? (opt.prev?.weightKg != null && w != null ? Math.min(w, Math.round(opt.prev.weightKg * 1.1 * 4) / 4) : null) : w;
    return { id: e.id, name: e.name, sets: a && a.sets >= 1 && a.sets <= e.sets ? a.sets : e.sets, reps: (a?.reps || e.reps).slice(0, 20), weightKg: skip ? null : sw, note: (a?.note ?? "").slice(0, 120), prev: e.prev,
      swap: opt ? { exerciseId: opt.exerciseId, name: opt.name, approved: opt.approved, prev: opt.prev } : null, skip, reason: opt || skip ? reason : null };
  });
  await audit(db, { actorUserId: userId, action: "adaptive.ai_advice", resourceType: "program_day", resourceId: day.id, meta: { model: aiFastModel(), usesAI: true, followUp: !!follow, changes: exs.filter((e) => e.swap || e.skip).length } });
  return { dayId: day.id, dayName: day.name, headline: out.headline.slice(0, 80), summary: out.summary.slice(0, 400), caution: out.caution?.slice(0, 200) ?? null, exercises: exs };
}
