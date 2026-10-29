// D153: «No vino el profe» / «Quiero entrenar por mi cuenta» cuando todavía no hay rutina asignada. REPI arma la rutina de
// hoy con ejercicios de la biblioteca (los del catálogo y los propios del coach o del gimnasio), según lo que la persona
// busca entrenando, su check-in y sus marcas previas. Sin la IA (o si tarda o falla) se arma con reglas: cuerpo completo,
// un ejercicio por grupo, más o menos según los minutos disponibles. No recibe datos de salud, nombre ni email.
import { and, eq, isNull, or } from "drizzle-orm";
import { TRAINING_WISH_GOALS, hasWishes, localDate, type TrainingWishes } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { aiFastModel, aiJson, aiOn } from "../ai/openai";
import { mySettings } from "../settings/services";
import { ensureExerciseCatalog } from "./library";
import { lastSetByExercise, myActive, myTraining } from "./services";

const { exercise, checkin } = schema;

type Prev = { weightKg: number | null; reps: number | null } | null;
export type RoutineEx = { id: string; exerciseId: string; name: string; group: string; sets: number; reps: string; weightKg: number | null; restSec: number; note: string; prev: Prev };
export type SoloRoutine = { kind: "routine"; dayName: string; headline: string; summary: string; caution: string | null; exercises: RoutineEx[]; byRules: boolean };

// Orden de cuerpo completo; los minutos disponibles definen cuántos grupos entran.
const GROUPS = ["Piernas", "Pecho", "Espalda", "Hombros", "Glúteos", "Core", "Brazos"];
const countFor = (min: number | null) => (min == null ? 6 : min <= 30 ? 4 : min <= 45 ? 5 : min <= 60 ? 6 : 7);
const repsFor = (goal: TrainingWishes["goal"] | undefined) => (goal === "strength" ? "5-6" : goal === "fat_loss" || goal === "health" || goal === "habit" ? "12-15" : "8-12");
const restFor = (goal: TrainingWishes["goal"] | undefined) => (goal === "strength" ? 150 : goal === "fat_loss" ? 60 : 90);

const SYSTEM = `Sos un entrenador de fuerza. La persona todavía no tiene rutina asignada y quiere entrenar hoy por su cuenta. Armá UNA sesión de cuerpo completo segura y simple. Respondé en español rioplatense, breve. Hablás como REPI, la app: nunca digas «IA», «modelo» ni «inteligencia artificial».
Reglas:
- Elegí entre 4 y 7 ejercicios SÓLO de «biblioteca» (usá el código exacto). Uno por grupo muscular, empezando por los grandes (piernas, empuje, tracción). Preferí los que ya hizo («ultimaMarca»).
- Respetá «loQueBusca»: objetivo (fuerza: 5–6 reps; músculo: 8–12; bajar grasa o salud: 12–15), minutos disponibles (menos minutos, menos ejercicios y series), lo que le gusta y lo que prefiere evitar.
- 2 a 4 series. Peso: con «ultimaMarca», igual o un poco menos; sin marca, weightKg null y una nota para empezar liviano.
- Si el check-in muestra poca energía o mal sueño, menos series y cargas moderadas, y avisalo en «caution».
- No des consejos médicos. headline: máximo 50 caracteres. summary: máximo 160. note: máximo 60.
- Con «pedidoDeLaPersona», respetalo (p. ej. «sólo tren superior», «no hay barras», «tengo 20 minutos»).`;
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["headline", "summary", "caution", "exercises"],
  properties: {
    headline: { type: "string" }, summary: { type: "string" }, caution: { type: ["string", "null"] },
    exercises: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "sets", "reps", "weightKg", "note"],
      properties: { code: { type: "string" }, sets: { type: "integer" }, reps: { type: "string" }, weightKg: { type: ["number", "null"] }, note: { type: "string" } } } },
  },
};
type Out = { headline: string; summary: string; caution: string | null; exercises: { code: string; sets: number; reps: string; weightKg: number | null; note: string }[] };

/** Rutina de hoy sin programa asignado. `message`: lo que la persona pide al rearmar («sólo tren superior»). */
export async function soloRoutine(userId: string, now = new Date(), message?: string): Promise<SoloRoutine> {
  const act = await myActive(userId);
  if (!act) throw new AccessError("no_relation", "Para entrenar con REPI necesitás estar con un coach o un gimnasio.", 409);
  const t = await myTraining(userId, now);
  if (t.state === "ready") throw new AccessError("has_program", "Ya tenés una rutina asignada: usá «Tu rutina para hoy».", 409);
  await ensureExerciseCatalog();
  const [lib, { wishes }, [ci]] = await Promise.all([
    db.select().from(exercise).where(or(isNull(exercise.orgId), eq(exercise.orgId, act.orgId))),
    mySettings(userId),
    db.select().from(checkin).where(and(eq(checkin.userId, userId), eq(checkin.date, localDate(now)))),
  ]);
  const usable = lib.filter((e) => e.kind !== "time" && GROUPS.includes(e.muscleGroup));
  if (!usable.length) throw new AccessError("no_library", "Todavía no hay ejercicios en la biblioteca para armar tu rutina.", 409);
  const prev = await lastSetByExercise(userId, usable.map((e) => e.id));
  const w = wishes && hasWishes(wishes) ? wishes : null;
  const tired = !!ci && (ci.energy <= 2 || ci.sleep <= 2);

  // Reglas (respaldo y base): un ejercicio por grupo; primero los que ya hizo, después los de carga y por nombre.
  const pick = (g: string) => usable.filter((e) => e.muscleGroup === g)
    .sort((a, b) => Number(!!prev.get(b.id)) - Number(!!prev.get(a.id)) || Number(b.kind === "load_reps") - Number(a.kind === "load_reps") || a.name.localeCompare(b.name, "es"))[0];
  const base = (n: number) => GROUPS.map(pick).filter((e): e is NonNullable<typeof e> => !!e).slice(0, n);
  const mk = (e: typeof usable[number], sets: number, reps: string, weightKg: number | null, note: string): RoutineEx => {
    const pv = prev.get(e.id);
    return { id: e.id, exerciseId: e.id, name: e.name, group: e.muscleGroup, sets, reps, weightKg, restSec: restFor(w?.goal), note,
      prev: pv ? { weightKg: pv.weightKg, reps: pv.reps } : null };
  };
  const byRules = (): SoloRoutine => ({
    kind: "routine", byRules: true, dayName: "Rutina de hoy", headline: "Cuerpo completo para hoy",
    summary: w?.goal ? `Armada para «${TRAINING_WISH_GOALS[w.goal]}». Empezá liviano en lo que no hiciste antes.` : "Un ejercicio por grupo grande. Empezá liviano en lo que no hiciste antes.",
    caution: tired ? "Tu check-in dice que hoy estás con poca energía: bajá las cargas o hacé una serie menos." : null,
    exercises: base(countFor(w?.minutes ?? null)).map((e) => {
      const pv = prev.get(e.id);
      return mk(e, tired ? 2 : 3, e.kind === "bodyweight" && e.muscleGroup === "Core" ? "10-15" : repsFor(w?.goal), pv?.weightKg ?? null, pv ? "" : "Empezá liviano y subí si te queda cómodo");
    }),
  });

  let out: SoloRoutine;
  if (!aiOn()) out = byRules();
  else {
    // Códigos cortos (x1, x2…) en lugar de IDs: el modelo los copia sin errores. Hasta 12 candidatos por grupo.
    const cands = GROUPS.flatMap((g) => usable.filter((e) => e.muscleGroup === g)
      .sort((a, b) => Number(!!prev.get(b.id)) - Number(!!prev.get(a.id)) || a.name.localeCompare(b.name, "es")).slice(0, 12));
    const code = new Map(cands.map((e, i) => [`x${i + 1}`, e]));
    const ctx = {
      hoy: localDate(now), lugar: act.kind === "gym" ? "gimnasio" : "donde entrene (coach a distancia)",
      biblioteca: [...code].map(([k, e]) => ({ code: k, nombre: e.name, grupo: e.muscleGroup, tipo: e.kind === "bodyweight" ? "peso corporal" : "con carga", ultimaMarca: prev.get(e.id) ?? undefined })),
      checkinHoy: ci ? { energia: ci.energy, sueno: ci.sleep, animo: ci.mood } : null,
      loQueBusca: w ? { objetivo: w.goal ? TRAINING_WISH_GOALS[w.goal] : null, minutosDisponibles: w.minutes, leGusta: w.likes, prefiereEvitar: w.avoid } : null,
      pedidoDeLaPersona: message?.trim().slice(0, 400) || null,
    };
    try {
      const r = await aiJson<Out>({ name: "rutina_sin_programa", system: SYSTEM, parts: [{ type: "text", text: JSON.stringify(ctx) }], schema: SCHEMA, fast: true, maxTokens: 900, timeoutMs: 15_000 });
      const seen = new Set<string>();
      const exs = r.exercises.flatMap((x) => {
        const e = code.get(x.code);
        if (!e || seen.has(e.id)) return [];
        seen.add(e.id);
        const wk = x.weightKg != null && x.weightKg >= 0 && x.weightKg <= 500 ? Math.round(x.weightKg * 4) / 4 : null;
        return [mk(e, Math.min(Math.max(x.sets, 1), 5), (x.reps || repsFor(w?.goal)).slice(0, 20), wk, (x.note ?? "").slice(0, 120))];
      }).slice(0, 8);
      out = exs.length >= 2
        ? { kind: "routine", byRules: false, dayName: "Rutina de hoy", headline: r.headline.slice(0, 80), summary: r.summary.slice(0, 400), caution: r.caution?.slice(0, 200) ?? null, exercises: exs }
        : byRules();
    } catch { out = byRules(); }
  }
  await audit(db, { actorUserId: userId, action: "adaptive.solo_routine", resourceType: "user", resourceId: userId,
    meta: { byRules: out.byRules, usesAI: !out.byRules, model: out.byRules ? null : aiFastModel(), exercises: out.exercises.length, followUp: !!message } });
  return out;
}
