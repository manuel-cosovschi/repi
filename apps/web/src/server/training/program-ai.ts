// D155: el profe (de sala o coach) carga objetivo, días, minutos, nivel, preferencias y lesiones o limitaciones, y REPI
// propone un programa completo con ejercicios de la biblioteca del gimnasio o del coach. Es un borrador: queda en el editor
// para revisar y guardar; nada se asigna solo. Lo que se escribe acá (incluidas las lesiones) viaja sólo para armar la
// propuesta, sin nombre ni datos de la persona, y no se guarda. Sin IA (o si falla) se arma con reglas.
import { eq, isNull, or } from "drizzle-orm";
import { TRAINING_WISH_GOALS, validateProgramDoc, type ProgramDoc, type TrainingWishGoal } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { aiJson, aiOn } from "../ai/openai";
import { ensureExerciseCatalog } from "./library";

const { exercise } = schema;

export const LEVELS = { beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzado" } as const;
export type ProgramBrief = {
  goal: TrainingWishGoal | null; daysPerWeek: number; minutes: number | null; level: keyof typeof LEVELS;
  likes: string; avoid: string; limitations: string; notes: string;
};
export type ProgramDraft = { doc: ProgramDoc; headline: string; summary: string; caution: string | null; byRules: boolean };

const GROUPS = ["Piernas", "Glúteos", "Pecho", "Espalda", "Hombros", "Brazos", "Core"];
const SPLITS: Record<number, { name: string; groups: string[] }[]> = {
  1: [{ name: "Cuerpo completo", groups: ["Piernas", "Pecho", "Espalda", "Hombros", "Core"] }],
  2: [{ name: "Cuerpo completo A", groups: ["Piernas", "Pecho", "Espalda", "Core"] }, { name: "Cuerpo completo B", groups: ["Glúteos", "Hombros", "Espalda", "Brazos"] }],
  3: [{ name: "Cuerpo completo A", groups: ["Piernas", "Pecho", "Espalda", "Core"] }, { name: "Cuerpo completo B", groups: ["Glúteos", "Hombros", "Espalda", "Brazos"] }, { name: "Cuerpo completo C", groups: ["Piernas", "Pecho", "Hombros", "Core"] }],
  4: [{ name: "Torso A", groups: ["Pecho", "Espalda", "Hombros", "Brazos"] }, { name: "Piernas A", groups: ["Piernas", "Glúteos", "Piernas", "Core"] }, { name: "Torso B", groups: ["Espalda", "Pecho", "Hombros", "Brazos"] }, { name: "Piernas B", groups: ["Glúteos", "Piernas", "Glúteos", "Core"] }],
  5: [{ name: "Empuje", groups: ["Pecho", "Hombros", "Pecho", "Brazos"] }, { name: "Tracción", groups: ["Espalda", "Espalda", "Brazos", "Core"] }, { name: "Piernas", groups: ["Piernas", "Glúteos", "Piernas", "Core"] }, { name: "Torso", groups: ["Pecho", "Espalda", "Hombros", "Brazos"] }, { name: "Piernas y glúteos", groups: ["Glúteos", "Piernas", "Glúteos", "Core"] }],
  6: [{ name: "Empuje A", groups: ["Pecho", "Hombros", "Brazos"] }, { name: "Tracción A", groups: ["Espalda", "Espalda", "Brazos"] }, { name: "Piernas A", groups: ["Piernas", "Glúteos", "Core"] }, { name: "Empuje B", groups: ["Hombros", "Pecho", "Brazos"] }, { name: "Tracción B", groups: ["Espalda", "Brazos", "Core"] }, { name: "Piernas B", groups: ["Glúteos", "Piernas", "Core"] }],
};
const repsFor = (g: TrainingWishGoal | null) => (g === "strength" ? "4-6" : g === "fat_loss" || g === "health" || g === "habit" ? "12-15" : "8-12");
const restFor = (g: TrainingWishGoal | null) => (g === "strength" ? 180 : g === "fat_loss" ? 60 : 90);

const SYSTEM = `Sos un entrenador de fuerza con experiencia. Un profesor de un gimnasio te pasa los datos de un alumno y armás un programa semanal completo y seguro, que él va a revisar. Respondé en español rioplatense. Hablás como REPI, la app: nunca digas «IA», «modelo» ni «inteligencia artificial».
Reglas:
- Exactamente «diasPorSemana» días, con nombres claros (p. ej. «Torso A», «Piernas», «Cuerpo completo B») y un reparto equilibrado de grupos musculares en la semana.
- Usá SÓLO ejercicios de «biblioteca» (código exacto). Entre 4 y 7 por día según los minutos (≈ 8–10 min por ejercicio), primero los multiarticulares.
- Series, repeticiones, RIR y descanso según objetivo y nivel: principiante 2–3 series, RIR 2–3, máquinas y variantes simples; avanzado más volumen y RIR 0–2. Fuerza 3–6 reps con descansos largos; músculo 6–12; bajar grasa o salud 10–15 con descansos cortos.
- «limitaciones» (lesiones o molestias que contó el profesor): evitá los ejercicios que carguen esa zona o que la persona no deba hacer y elegí alternativas más seguras; anotá en «note» del ejercicio el cuidado si hace falta. No diagnostiques ni des indicaciones médicas; en «caution» recordá que ante dolor se consulte a un profesional de la salud.
- Respetá «leGusta» y «prefiereEvitar». reps como texto («8-12», «10»). restSec en segundos. note: máximo 60 caracteres o vacío.
- name: nombre corto del programa según el objetivo y el reparto (p. ej. «Hipertrofia · 4 días»). NUNCA menciones lesiones, dolores, limitaciones ni datos de la persona en name ni en note: el nombre lo ve todo el equipo.
- headline: máximo 60 caracteres. summary: máximo 220, cómo está armado y por qué. weeks: entre 4 y 8.`;
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["headline", "summary", "caution", "name", "weeks", "note", "days"],
  properties: {
    headline: { type: "string" }, summary: { type: "string" }, caution: { type: ["string", "null"] }, name: { type: "string" }, weeks: { type: "integer" }, note: { type: "string" },
    days: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "exercises"], properties: {
      name: { type: "string" },
      exercises: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "sets", "reps", "rir", "restSec", "note"], properties: {
        code: { type: "string" }, sets: { type: "integer" }, reps: { type: "string" }, rir: { type: ["integer", "null"] }, restSec: { type: "integer" }, note: { type: "string" } } } },
    } } },
  },
};
type Out = { headline: string; summary: string; caution: string | null; name: string; weeks: number; note: string;
  days: { name: string; exercises: { code: string; sets: number; reps: string; rir: number | null; restSec: number; note: string }[] }[] };

const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);
export function cleanBrief(b: Partial<ProgramBrief>): ProgramBrief {
  const days = Math.round(Number(b.daysPerWeek));
  const min = b.minutes == null ? null : Math.round(Number(b.minutes));
  return {
    goal: b.goal && b.goal in TRAINING_WISH_GOALS ? b.goal : null,
    daysPerWeek: days >= 1 && days <= 6 ? days : 3,
    minutes: min != null && min >= 15 && min <= 180 ? min : null,
    level: b.level && b.level in LEVELS ? b.level : "beginner",
    likes: clip(b.likes, 300), avoid: clip(b.avoid, 300), limitations: clip(b.limitations, 500), notes: clip(b.notes, 300),
  };
}

/** Propuesta de programa para un alumno, con la biblioteca de la organización (catálogo + propios). */
export async function draftProgram(orgId: string, brief: ProgramBrief): Promise<ProgramDraft> {
  await ensureExerciseCatalog();
  const lib = (await db.select().from(exercise).where(or(isNull(exercise.orgId), eq(exercise.orgId, orgId))))
    .filter((e) => e.kind !== "time" && GROUPS.includes(e.muscleGroup));
  if (lib.length < 4) throw new AccessError("no_library", "La biblioteca todavía no tiene ejercicios suficientes para armar un programa.", 409);
  const perDay = brief.minutes == null ? 5 : Math.max(3, Math.min(7, Math.round(brief.minutes / 9)));
  const sets = brief.level === "beginner" ? 3 : brief.level === "advanced" ? 4 : 3;

  const byRules = (): ProgramDraft => {
    const used = new Map<string, number>();
    const pick = (g: string) => {
      const opts = lib.filter((e) => e.muscleGroup === g).sort((a, b) => Number(b.kind === "load_reps") - Number(a.kind === "load_reps") || a.name.localeCompare(b.name, "es"));
      if (!opts.length) return null;
      const k = used.get(g) ?? 0; used.set(g, k + 1);
      return opts[k % opts.length];
    };
    const split = SPLITS[brief.daysPerWeek] ?? SPLITS[3];
    const days = split.map((d) => {
      const groups = [...d.groups, ...GROUPS].slice(0, Math.max(perDay, d.groups.length)).slice(0, perDay);
      const seen = new Set<string>();
      const exercises = groups.map(pick).filter((e): e is NonNullable<typeof e> => !!e && !seen.has(e.id) && !!seen.add(e.id)).map((e) => ({
        exerciseId: e.id, name: e.name, sets: e.muscleGroup === "Core" ? 3 : sets, reps: e.muscleGroup === "Core" && e.kind === "bodyweight" ? "12-15" : repsFor(brief.goal),
        rir: brief.level === "beginner" ? 2 : 1, restSec: restFor(brief.goal), note: null,
      }));
      return { name: d.name, exercises };
    });
    return {
      byRules: true, headline: `${brief.daysPerWeek} días · ${brief.goal ? TRAINING_WISH_GOALS[brief.goal] : "general"}`,
      summary: "Propuesta con reglas (REPI no estuvo disponible): reparto equilibrado por grupos. Revisá las limitaciones antes de guardar.",
      caution: brief.limitations ? "Contaste limitaciones: revisá a mano cada ejercicio que cargue esa zona." : null,
      doc: { name: `Programa ${brief.daysPerWeek} días`, weeks: 6, note: "", days },
    };
  };

  let draft: ProgramDraft;
  if (!aiOn()) draft = byRules();
  else {
    const cands = GROUPS.flatMap((g) => lib.filter((e) => e.muscleGroup === g).sort((a, b) => a.name.localeCompare(b.name, "es")).slice(0, 18));
    const code = new Map(cands.map((e, i) => [`x${i + 1}`, e]));
    const ctx = {
      diasPorSemana: brief.daysPerWeek, minutosPorSesion: brief.minutes, nivel: LEVELS[brief.level],
      objetivo: brief.goal ? TRAINING_WISH_GOALS[brief.goal] : null, leGusta: brief.likes || null, prefiereEvitar: brief.avoid || null,
      limitaciones: brief.limitations || null, notasDelProfe: brief.notes || null,
      biblioteca: [...code].map(([k, e]) => ({ code: k, nombre: e.name, grupo: e.muscleGroup, tipo: e.kind === "bodyweight" ? "peso corporal" : "con carga" })),
    };
    try {
      const r = await aiJson<Out>({ name: "programa_alumno", system: SYSTEM, parts: [{ type: "text", text: JSON.stringify(ctx) }], schema: SCHEMA, fast: true, maxTokens: 2200, timeoutMs: 40_000 });
      const days = r.days.slice(0, 6).map((d, i) => {
        const seen = new Set<string>();
        return { name: clip(d.name, 60) || `Día ${i + 1}`, exercises: d.exercises.flatMap((x) => {
          const e = code.get(x.code);
          if (!e || seen.has(e.id)) return [];
          seen.add(e.id);
          return [{ exerciseId: e.id, name: e.name, sets: Math.min(Math.max(x.sets, 1), 6), reps: clip(x.reps, 20) || repsFor(brief.goal),
            rir: x.rir != null && x.rir >= 0 && x.rir <= 5 ? x.rir : null, restSec: x.restSec >= 30 && x.restSec <= 300 ? x.restSec : restFor(brief.goal), note: clip(x.note, 120) || null }];
        }).slice(0, 8) };
      }).filter((d) => d.exercises.length);
      draft = days.length
        ? { byRules: false, headline: clip(r.headline, 80), summary: clip(r.summary, 400), caution: r.caution ? clip(r.caution, 300) : null,
          doc: { name: clip(r.name, 120) || `Programa ${brief.daysPerWeek} días`, weeks: r.weeks >= 1 && r.weeks <= 12 ? r.weeks : 6, note: clip(r.note, 500), days } }
        : byRules();
    } catch { draft = byRules(); }
  }
  // El nombre y la nota general del programa los ve todo el equipo: si mencionan lo que se contó de salud, se reemplazan.
  const words = brief.limitations.toLowerCase().split(/[^a-záéíóúñü]+/).filter((w) => w.length >= 5);
  const health = /lesi|dolor|molest|hernia|lumbar|rodill|hombro|tendin|operad|cirug/;
  const leaks = (t: string) => { const x = t.toLowerCase(); return health.test(x) || words.some((w) => x.includes(w)); };
  if (leaks(draft.doc.name)) draft.doc.name = `Programa ${brief.daysPerWeek} días${brief.goal ? ` · ${TRAINING_WISH_GOALS[brief.goal]}` : ""}`;
  if (leaks(draft.doc.note)) draft.doc.note = "";
  const v = validateProgramDoc(draft.doc);
  if (!v.ok) throw new AccessError("invalid", `No se pudo armar la propuesta: ${v.error}`, 409);
  return { ...draft, doc: v.doc };
}
