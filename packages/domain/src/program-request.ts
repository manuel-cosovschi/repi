// D206: lo que necesita saber el profe para armar un programa. Al pedir «Pedir mi programa» (al coach o al equipo de sala)
// la persona completa estas preferencias; sin ellas el pedido llegaba vacío («Quiero que me armen un programa.») y el profe
// no sabía qué armar. Las lesiones o limitaciones son obligatorias como decisión («No tengo» o cuáles): las ve sólo quien
// atiende el pedido, viajan con el pedido y no se publican en otro lado. No es un diagnóstico.
import { ESSENTIAL_FIELDS, TRAINING_WISH_GOALS, goalAllowed, type ProfileField, type TrainingWishGoal, type TrainingWishes } from "./wishes";

export const BRIEF_LEVELS = {
  beginner: "Principiante (menos de 6 meses entrenando)",
  intermediate: "Intermedio (6 meses a 2 años)",
  advanced: "Avanzado (más de 2 años)",
} as const;
export type BriefLevel = keyof typeof BRIEF_LEVELS;
export const BRIEF_LEVEL_SHORT: Record<BriefLevel, string> = { beginner: "Principiante", intermediate: "Intermedio", advanced: "Avanzado" };

export const BRIEF_FOCUS = {
  piernas: "Piernas", gluteos: "Glúteos", pecho: "Pecho", espalda: "Espalda", hombros: "Hombros", brazos: "Brazos", core: "Abdomen y core",
  cardio: "Resistencia y cardio", movilidad: "Movilidad y postura",
} as const;
export type BriefFocus = keyof typeof BRIEF_FOCUS;

export const BRIEF_PLACES = {
  gym: "En el gimnasio",
  home_equipped: "En casa, con mancuernas o algo de equipo",
  home_none: "En casa, sin equipo",
  outdoor: "Al aire libre",
} as const;
export type BriefPlace = keyof typeof BRIEF_PLACES;

export type ProgramRequestBrief = {
  goal: TrainingWishGoal;
  daysPerWeek: number;
  minutes: number;
  level: BriefLevel;
  /** false = «No tengo»; true = tiene y las describe en `limitationsDetail`. Siempre respondido. */
  hasLimitations: boolean;
  limitationsDetail: string | null;
  focus: BriefFocus[];
  place: BriefPlace | null;
  likes: string | null;
  avoid: string | null;
  notes: string | null;
  /** Cuándo se completó (ISO). */
  at: string;
};

export const BRIEF_TEXT_MAX = 300;
const txt = (v: unknown, max = BRIEF_TEXT_MAX) => {
  if (v == null) return null;
  if (typeof v !== "string") throw new Error("Texto inválido.");
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length > max) throw new Error(`Hasta ${max} caracteres.`);
  return t || null;
};

/** Valida lo que completó la persona. Los obligatorios tienen un mensaje propio para mostrar junto al campo. */
export function cleanProgramBrief(input: unknown, now = new Date()): { ok: true; brief: ProgramRequestBrief } | { ok: false; error: string; field: string } {
  const x = (input ?? {}) as Record<string, unknown>;
  if (!(typeof x.goal === "string" && x.goal in TRAINING_WISH_GOALS)) return { ok: false, field: "goal", error: "Elegí tu objetivo principal." };
  const days = Number(x.daysPerWeek);
  if (!Number.isInteger(days) || days < 1 || days > 7) return { ok: false, field: "daysPerWeek", error: "Elegí cuántos días por semana podés entrenar." };
  const min = Number(x.minutes);
  if (!Number.isInteger(min) || min < 15 || min > 180) return { ok: false, field: "minutes", error: "Elegí cuánto tiempo tenés por entrenamiento." };
  if (!(typeof x.level === "string" && x.level in BRIEF_LEVELS)) return { ok: false, field: "level", error: "Elegí tu experiencia entrenando." };
  if (typeof x.hasLimitations !== "boolean") return { ok: false, field: "hasLimitations", error: "Contanos si tenés alguna lesión, molestia o limitación (o elegí «No tengo»)." };
  try {
    const detail = x.hasLimitations ? txt(x.limitationsDetail, 500) : null;
    if (x.hasLimitations && (!detail || detail.length < 3)) return { ok: false, field: "limitationsDetail", error: "Contá qué lesión, molestia o limitación tenés para que tu profe la tenga en cuenta." };
    const focus = Array.isArray(x.focus) ? [...new Set(x.focus.filter((f): f is BriefFocus => typeof f === "string" && f in BRIEF_FOCUS))].slice(0, 5) : [];
    const place = typeof x.place === "string" && x.place in BRIEF_PLACES ? (x.place as BriefPlace) : null;
    return { ok: true, brief: {
      goal: x.goal as TrainingWishGoal, daysPerWeek: days, minutes: min, level: x.level as BriefLevel,
      hasLimitations: x.hasLimitations, limitationsDetail: detail, focus, place,
      likes: txt(x.likes), avoid: txt(x.avoid), notes: txt(x.notes), at: now.toISOString(),
    } };
  } catch (e) { return { ok: false, field: "notes", error: (e as Error).message }; }
}

/** ¿Un valor guardado (jsonb) es una respuesta completa? Las versiones viejas o parciales cuentan como faltantes. */
export function isCompleteBrief(b: unknown): b is ProgramRequestBrief {
  if (!b || typeof b !== "object") return false;
  const r = cleanProgramBrief(b);
  return r.ok;
}

/** Filas para mostrarle al profe (en el orden en que las necesita). `alert` marca lo que tiene que mirar sí o sí. */
export function briefRows(b: ProgramRequestBrief): { label: string; value: string; alert?: boolean }[] {
  const rows: { label: string; value: string; alert?: boolean }[] = [
    { label: "Objetivo", value: TRAINING_WISH_GOALS[b.goal] },
    { label: "Disponibilidad", value: `${b.daysPerWeek} ${b.daysPerWeek === 1 ? "día" : "días"} por semana · ${b.minutes} min` },
    { label: "Experiencia", value: BRIEF_LEVEL_SHORT[b.level] },
    { label: "Lesiones o limitaciones", value: b.hasLimitations ? (b.limitationsDetail ?? "Sí") : "No tiene", alert: b.hasLimitations },
  ];
  if (b.focus.length) rows.push({ label: "Quiere priorizar", value: b.focus.map((f) => BRIEF_FOCUS[f]).join(", ") });
  if (b.place) rows.push({ label: "Dónde entrena", value: BRIEF_PLACES[b.place] });
  if (b.likes) rows.push({ label: "Le gusta", value: b.likes });
  if (b.avoid) rows.push({ label: "Prefiere evitar", value: b.avoid });
  if (b.notes) rows.push({ label: "Notas", value: b.notes });
  return rows;
}

/** Texto del pedido (lo que ya muestran las bandejas): una línea por dato. Límite de la columna: `max`. */
export function briefSummary(b: ProgramRequestBrief, max = 1000): string {
  const t = ["Quiero que me armen un programa.", ...briefRows(b).map((r) => `${r.label}: ${r.value}`)].join("\n");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Para precargar «Armar con REPI» (D155) con lo que pidió la persona. Días 1–6 (el asistente arma hasta 6). */
export function briefToAssistant(b: ProgramRequestBrief) {
  return {
    goal: b.goal, daysPerWeek: Math.min(6, b.daysPerWeek), minutes: b.minutes, level: b.level,
    likes: [b.focus.length ? `Priorizar: ${b.focus.map((f) => BRIEF_FOCUS[f]).join(", ")}` : "", b.likes ?? ""].filter(Boolean).join(". "),
    avoid: b.avoid ?? "",
    limitations: b.hasLimitations ? (b.limitationsDetail ?? "") : "",
    notes: [b.place ? BRIEF_PLACES[b.place] : "", b.notes ?? ""].filter(Boolean).join(". "),
  };
}

/** Lo que muestran las bandejas del profe: filas si hay preferencias; `missing` si es un pedido de programa sin ellas. */
export function briefView(isProgram: boolean, b: unknown): { rows: { label: string; value: string; alert?: boolean }[]; missing: boolean } | null {
  if (!isProgram) return null;
  return isCompleteBrief(b) ? { rows: briefRows(b), missing: false } : { rows: [], missing: true };
}

/** «a» + destinatario sin «a el» (F-15): «al equipo de sala», «a Agustín». */
export const toWhom = (to: string) => (to.startsWith("el ") ? `al ${to.slice(3)}` : `a ${to}`);

// ── Pedidos ya respondidos sin datos (13/11/2026) ───────────────────────────
// Quien pidió su programa antes de D206 no cargó objetivo, días, experiencia ni lesiones. Mientras el pedido seguía abierto
// veía «Completá tu pedido de programa»; cuando el profe lo respondía (le asignaba el programa) el aviso desaparecía y los
// datos no llegaban nunca: ni a REPI (perfil de entrenamiento) ni a quien arma la rutina.

/** «Ahora no» en el aviso de un pedido ya respondido: no vuelve a mostrarse hasta pasados estos días. */
export const LATE_BRIEF_SNOOZE_DAYS = 14;
/** ¿Sigue en pausa el aviso? `at`: cuándo tocó «Ahora no» (ISO). Una fecha inválida o futura no lo esconde para siempre. */
export function lateBriefSnoozed(at: string | null | undefined, now = new Date()): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  return age >= 0 && age < LATE_BRIEF_SNOOZE_DAYS * 86_400_000;
}

/**
 * Lo que el pedido aporta al perfil de entrenamiento (Training Profile). El objetivo sólo si la política de edad lo permite:
 * antes, un objetivo corporal sin edad adulta confirmada hacía fallar el guardado entero y se perdían también días, minutos
 * y experiencia. Las lesiones nunca van al perfil (viajan sólo con el pedido).
 */
export function briefProfilePatch(b: ProgramRequestBrief, age: "adult" | "minor" | "unknown"): Partial<TrainingWishes> {
  return {
    ...(goalAllowed(b.goal, age) ? { goal: b.goal } : {}),
    daysPerWeek: b.daysPerWeek, minutes: Math.min(240, b.minutes), experience: b.level,
    ...(b.likes ? { likes: b.likes.slice(0, 200) } : {}), ...(b.avoid ? { avoid: b.avoid.slice(0, 200) } : {}),
  };
}

/**
 * Lo esencial que el perfil no tiene y un pedido anterior de la persona sí (p. ej. la experiencia de los pedidos anteriores a
 * D217, que no se copiaba). Sólo completa huecos: nunca pisa lo que la persona declaró después.
 */
export function briefProfileGaps(b: ProgramRequestBrief, w: TrainingWishes | null | undefined, age: "adult" | "minor" | "unknown"): Partial<TrainingWishes> {
  const from = briefProfilePatch(b, age) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of ESSENTIAL_FIELDS as readonly ProfileField[]) {
    if ((w as Record<string, unknown> | null | undefined)?.[f] == null && from[f] != null) out[f] = from[f];
  }
  return out as Partial<TrainingWishes>;
}
