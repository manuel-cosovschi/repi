// D191 · Training Intelligence 2.0 (bloque 04/06). Motor determinista de objetivos por serie y por etapa.
//
// Tres objetos distintos que nunca se pisan entre sí:
//   1. La programación del profe (plan del ejercicio, versión congelada de la sesión).
//   2. El objetivo que calcula REPI para cada fila (este módulo; se guarda en `training_target`).
//   3. El resultado real que registra la persona (`set_log`).
//
// Capas (funciones puras, las usan el servidor y el teléfono sin conexión):
//   · Contexto de la fila (`rowContext`): tipo de serie, etapa, rango, carga y descanso del plan.
//   · Comparabilidad (`compareRows`, `comparableHistory`): qué resultados anteriores son la misma referencia.
//   · Recomendación (`recommendExercise`): reutiliza la doble progresión y las protecciones de D182 (`suggestNext`, señales de
//     seguridad). No hay un segundo motor de progresión: este módulo decide QUÉ historia corresponde a cada fila y aplica las
//     reglas propias de cada método (drop, back-off, rest-pause, cluster, AMRAP, EMOM, series por tiempo).
//   · Ajuste durante la sesión (`adjustAfterSet`): después de cada serie, sólo puede mantener o bajar exigencia; nunca sube.
//   · Tendencias y propuestas (`exerciseTrend`, `nextProposal`): ventanas de varias sesiones; nunca cambian la rutina.
//   · Progreso hacia metas (`progressToGoal`): porcentajes sólo con línea base, meta y valor actual medibles.
//
// Todo número sale de reglas con nombre y explicación. Son heurísticas conservadoras del producto, no fórmulas médicas.
import type { ExerciseDetail, SetKind } from "./prescription";
import { labelKey, loadIncrement, setTarget } from "./prescription";
import { normalizePlan } from "./stages";
import { epley1rm, parseReps } from "./training";
import { BACKOFF_FACTOR, DROP_FACTOR, GUARD_TEXT, floorToStep, loadStep, type GuardCode, type SafetySignals } from "./load-safety";
import { suggestNext, type LastSet } from "./progression";
import { goalProgress } from "./goals";

/** Versión del algoritmo: se guarda con cada objetivo. Cambiarla no reescribe objetivos ya emitidos. */
export const TI_VERSION = "ti2.1";
/**
 * Ventanas (justificación en docs/TRAINING_INTELLIGENCE_2.md §Historial): hasta 6 sesiones comparables en 180 días. La
 * recomendación de hoy usa la última comparable (doble progresión); las anteriores sólo dan contexto y tendencias. Un
 * registro importado vale hasta 365 días y siempre con calidad baja.
 */
export const TI_WINDOW = { sessions: 6, days: 180, importDays: 365 } as const;
/** Una tendencia necesita al menos 3 sesiones; «consistente», al menos 4 con la misma dirección. */
export const TREND_MIN = 3;

// ── Contexto de la fila ────────────────────────────────────────────────────
export type ExCtx = { sets: number; reps: string; rir: number | null; restSec: number; detail?: ExerciseDetail | null };
/** Clase de comparación: dos filas sólo son la misma referencia si tienen la misma clase y la misma etapa. */
export type RowClass = "main" | "top" | "backoff" | "warmup" | "drop" | "rest_pause" | "cluster" | "amrap" | "amrap_time" | "timed";
export type RowCtx = {
  index: number; specId: string; kind: SetKind; cls: RowClass; block: number; stage: number; reps: string;
  /** D192: etiqueta del profe normalizada («load set»). Dos filas con etiquetas distintas nunca son la misma referencia. */
  label: string | null;
  planKg: number | null; rir: number | null; rpe: number | null; restSec: number; durationSec: number | null;
  unilateral: boolean; emom: boolean; technique: string;
};

export function rowClass(kind: SetKind | null | undefined, reps: string | null | undefined, durationSec?: number | null): RowClass {
  const k = kind ?? "work";
  if (k === "amrap") return durationSec ? "amrap_time" : "amrap";
  if (reps && parseReps(reps).kind === "time") return "timed";
  if (k === "work" || k === "failure") return "main";
  return k;
}

export function rowContext(e: ExCtx, i: number): RowCtx {
  const t = setTarget(e, i);
  const { rows } = normalizePlan(e.detail?.setPlan);
  const specId = rows[i]?.id ?? `r${i}`;
  return {
    index: i, specId, kind: t.kind, cls: rowClass(t.kind, t.reps, t.durationSec), block: t.block, stage: t.stage, reps: t.reps, label: labelKey(rows[i]?.label),
    planKg: t.weightKg ?? null, rir: t.rir ?? e.rir ?? null, rpe: t.rpe ?? null, restSec: t.restSec ?? e.restSec,
    durationSec: t.durationSec ?? null, unilateral: !!e.detail?.unilateral, emom: !!e.detail?.emomSec, technique: e.detail?.technique ?? "straight",
  };
}
export const exerciseRows = (e: ExCtx) => Array.from({ length: Math.max(0, e.sets) }, (_, i) => rowContext(e, i));

// ── Historial y comparabilidad ─────────────────────────────────────────────
/** Una fila registrada antes (de REPI o importada). `reps` es lo que estaba indicado en esa versión, si se conoce. */
export type HistRow = {
  sessionId: string; at: string; setLogId?: string | null; specId: string | null; kind: SetKind | null; stage: number | null;
  reps: string | null; durationSec?: number | null; w: number | null; r: number | null; rir: number | null; feel: string | null;
  unilateral?: boolean; source: "repi" | "import";
  /** D192: etiqueta del profe en esa fila de la versión registrada (null = nombre de REPI). */
  label?: string | null;
};
export type Match = "exact" | "equivalent" | "general" | "none";
const LEGACY_ID = /^r\d+$/;

/** ¿El resultado `past` es una referencia válida para la fila `cur`? Nunca fuerza una equivalencia dudosa. */
export function compareRows(cur: RowCtx, past: HistRow): { level: Match; why: string } {
  if (past.r == null || past.r <= 0) return { level: "none", why: "sin resultado registrado" };
  if (cur.cls === "warmup") return { level: "none", why: "las aproximaciones no son referencia" };
  // D192: un Load Set (u otra etiqueta) sólo se compara con filas de la misma etiqueta; el importado no trae etiquetas.
  if (cur.label && past.source === "import") return { level: "none", why: "historial importado sin la etiqueta de la serie" };
  if (past.source === "import") {
    // Un registro importado no trae tipo de serie, etapa ni método: sólo sirve como referencia general de una serie principal.
    return cur.cls === "main" && cur.stage === 0 && past.w != null ? { level: "general", why: "historial importado (sin tipo de serie)" } : { level: "none", why: "historial importado sin etapa" };
  }
  if (!!past.unilateral !== cur.unilateral) return { level: "none", why: "unilateral y bilateral no se comparan" };
  const pc = rowClass(past.kind, past.reps, past.durationSec);
  if (pc !== cur.cls) return { level: "none", why: "otro tipo de serie" };
  if (labelKey(past.label) !== cur.label) return { level: "none", why: "otra etiqueta de serie" };
  if ((past.stage ?? 0) !== cur.stage) return { level: "none", why: "otra etapa" };
  if (cur.cls === "amrap_time" && (past.durationSec ?? null) !== cur.durationSec) return { level: "none", why: "otra duración" };
  if (past.specId && past.specId === cur.specId && !LEGACY_ID.test(cur.specId)) return { level: "exact", why: "misma fila del plan" };
  return { level: "equivalent", why: "mismo tipo de serie y etapa" };
}

export type Quality = "high" | "medium" | "low" | "none";
export type HistSession = { sessionId: string; at: string; source: "repi" | "import"; rows: (HistRow & { level: Match })[] };

/** Sesiones anteriores con filas comparables a `cur`, de la más reciente a la más antigua, dentro de la ventana. */
export function comparableHistory(cur: RowCtx, rows: HistRow[], now: Date, w = TI_WINDOW): { sessions: HistSession[]; quality: Quality } {
  const by = new Map<string, HistSession>();
  for (const r of rows) {
    const age = (now.getTime() - Date.parse(r.at)) / 86_400_000;
    if (!(age >= -1) || age > (r.source === "import" ? w.importDays : w.days)) continue;
    const c = compareRows(cur, r);
    if (c.level === "none") continue;
    const s = by.get(r.sessionId) ?? { sessionId: r.sessionId, at: r.at, source: r.source, rows: [] };
    if (Date.parse(r.at) > Date.parse(s.at)) s.at = r.at;
    s.rows.push({ ...r, level: c.level });
    by.set(r.sessionId, s);
  }
  const sessions = [...by.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, w.sessions);
  const last = sessions[0];
  if (!last) return { sessions, quality: "none" };
  const best = last.rows.some((r) => r.level === "exact") ? "exact" : last.rows.some((r) => r.level === "equivalent") ? "equivalent" : "general";
  const age = (now.getTime() - Date.parse(last.at)) / 86_400_000;
  const quality: Quality = best === "general" || last.source === "import" ? "low" : age <= 28 && sessions.length >= 2 ? "high" : "medium";
  return { sessions, quality };
}

// ── Objetivo por fila ──────────────────────────────────────────────────────
export type TargetAction = "increase_load" | "increase_reps" | "hold" | "reduce_load" | "reduce_effort" | "estimate" | "follow_coach" | "reference" | "stop" | "none";
/** ready: hay objetivo · no_data: falta referencia · limited: una señal de seguridad lo frenó · coach: manda el plan · not_applicable. */
export type TargetStatus = "ready" | "no_data" | "limited" | "coach" | "not_applicable";
export type RowTarget = {
  setIndex: number; specId: string; kind: SetKind; block: number; stage: number;
  status: TargetStatus; action: TargetAction; source: "rules" | "coach"; quality: Quality;
  weightKg: number | null; repsMin: number | null; repsMax: number | null; repsTarget: number | null;
  rirTarget: number | null; rpeTarget: number | null; restSec: number | null; restSuggestSec: number | null;
  /** La carga la elige o confirma la persona (series reducidas): nunca se precarga sola. */
  pending: boolean;
  guards: GuardCode[]; reasons: string[];
  /** «62,5 kg × 8–10». Vacío cuando no hay objetivo numérico. */
  text: string;
  /** Explicación breve, basada sólo en las reglas que se ejecutaron. */
  why: string;
  /** Diferencia con la carga del profe que vale revisar (nunca cambia el plan). */
  review: string | null;
  prev: { w: number | null; r: number | null; rir: number | null; at: string; level: Match; source: "repi" | "import" } | null;
  refs: { sessionId: string; setLogId: string | null; at: string; w: number | null; r: number | null; rir: number | null }[];
  coach: { weightKg: number | null; reps: string } | null;
  algo: string;
};

const fmtKg = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} kg`;
const rangeTxt = (a: number | null, b: number | null) => (a == null ? "" : b == null || a === b ? `${a}` : `${a}–${b}`);
const targetText = (w: number | null, a: number | null, b: number | null, unit = "") => [w != null && w > 0 ? fmtKg(w) : null, a != null ? `${rangeTxt(a, b)}${unit}` : null].filter(Boolean).join(" × ");

/** Ajusta una carga a los saltos del equipo si se conocen (`inc`); si no, al paso de carga del producto. Siempre hacia abajo. */
export function fitIncrement(w: number, inc?: number | null) {
  if (!(w > 0)) return 0;
  if (inc && inc > 0) return Math.max(0, Math.floor(w / inc + 1e-9) * inc);
  return floorToStep(w);
}
/** Carga siguiente: la del menor salto disponible del equipo (si se conoce) o el paso de carga del producto. */
export const nextLoad = (w: number, inc?: number | null) => Math.round((w + (inc && inc > 0 ? inc : loadStep(w))) * 100) / 100;

const ACTION_OF: Record<string, TargetAction> = { up: "increase_load", reps: "increase_reps", hold: "hold", down: "reduce_load", estimate: "estimate" };

export type RecommendInput = {
  ex: ExCtx; history: HistRow[]; now: Date;
  /** Señales del propio alumno (D182). `daysSinceLast` se calcula acá con la historia comparable. */
  signals?: Omit<SafetySignals, "daysSinceLast">;
  /** Menor salto de carga disponible en el equipo (kg). Sin indicarlo, el configurado en el ejercicio (`detail.load`);
   *  `null` = desconocido (p. ej. un ejercicio sustituto con otro equipo). */
  increment?: number | null;
};
const incOf = (p: { ex: ExCtx; increment?: number | null }) => (p.increment !== undefined ? p.increment : loadIncrement(p.ex.detail));

function base(c: RowCtx, p: Partial<RowTarget>): RowTarget {
  const t = parseReps(c.reps);
  return {
    setIndex: c.index, specId: c.specId, kind: c.kind, block: c.block, stage: c.stage,
    status: "no_data", action: "none", source: "rules", quality: "none", weightKg: null,
    repsMin: t.kind === "reps" ? t.min : null, repsMax: t.kind === "reps" ? t.max : null, repsTarget: null,
    rirTarget: c.rir, rpeTarget: c.rpe, restSec: c.restSec, restSuggestSec: null, pending: false,
    guards: [], reasons: [], text: "", why: "", review: null, prev: null, refs: [], coach: c.planKg != null ? { weightKg: c.planKg, reps: c.reps } : null, algo: TI_VERSION,
    ...p,
  };
}
const NO_REF = "Todavía no tenemos una referencia comparable para esta serie.";

/** Objetivos de todas las filas del ejercicio (en orden: las etapas usan el objetivo de la serie de la que dependen). */
export function recommendExercise(input: RecommendInput): RowTarget[] {
  const p = { ...input, increment: incOf(input) };
  const ctxs = exerciseRows(p.ex);
  const out: RowTarget[] = [];
  for (const c of ctxs) out.push(recommendRow(p, c, ctxs, out));
  return out;
}

function lastOf(c: RowCtx, p: RecommendInput) {
  const h = comparableHistory(c, p.history, p.now);
  const s = h.sessions[0];
  const own = s ? (s.rows.find((r) => r.level === "exact") ?? s.rows.find((r) => r.specId === c.specId) ?? s.rows[0]) : null;
  const prev = own && s ? { w: own.w, r: own.r, rir: own.rir, at: s.at, level: own.level, source: s.source } : null;
  const refs = s ? s.rows.map((r) => ({ sessionId: s.sessionId, setLogId: r.setLogId ?? null, at: r.at, w: r.w, r: r.r, rir: r.rir })) : [];
  return { h, s, own, prev, refs };
}

function recommendRow(p: RecommendInput, c: RowCtx, all: RowCtx[], done: RowTarget[]): RowTarget {
  if (c.cls === "warmup") return base(c, { status: "not_applicable", why: "Aproximación: elegí la carga según cómo te sientas; no se usa para progresar." });
  const { h, s, own, prev, refs } = lastOf(c, p);
  const days = s ? Math.floor((p.now.getTime() - Date.parse(s.at)) / 86_400_000) : null;
  const signals: SafetySignals = { ...(p.signals ?? {}), daysSinceLast: days };
  const coach = c.planKg != null;
  const withCoach = (t: RowTarget): RowTarget => {
    if (!coach) return t;
    // El profe fijó la carga: manda el plan. Las señales de seguridad se muestran igual (no se ocultan), y una diferencia
    // material con lo que calcularían las reglas queda como revisión, nunca como cambio.
    const safety = t.guards.filter((g) => g !== "range_change" && g !== "method");
    const differs = t.weightKg != null && Math.abs(t.weightKg - c.planKg!) >= loadStep(c.planKg!) && t.action !== "none";
    const review = safety.length ? safety.map((g) => GUARD_TEXT[g]).join(" ")
      : differs ? `Con tu última vez, REPI hubiera propuesto ${fmtKg(t.weightKg!)}. Podría convenir revisar el objetivo con tu profe.` : null;
    return { ...t, status: "coach", action: safety.some((g) => g === "pain_exercise" || g === "pain_or_injury") ? "reduce_effort" : "follow_coach", source: "coach",
      weightKg: c.planKg, pending: false, text: targetText(c.planKg, t.repsMin, t.repsMax), why: "Carga indicada por tu profe.", review, reasons: [...t.reasons, "coach_load"] };
  };

  // Series por tiempo y AMRAP por tiempo: la referencia es el resultado; nunca se calculan kilos a partir de segundos.
  if (c.cls === "timed" || c.cls === "amrap_time") {
    if (!prev) return withCoach(base(c, { why: NO_REF, reasons: ["no_history"] }));
    const unit = c.cls === "timed" ? " s" : "";
    return withCoach(base(c, { status: "ready", action: "reference", quality: h.quality, prev, refs, weightKg: prev.w, repsTarget: prev.r, text: targetText(prev.w, prev.r, null, unit),
      why: c.cls === "timed" ? `La vez pasada: ${prev.r} s. Es tu referencia; no se calculan kilos a partir de segundos.` : `La vez pasada: ${prev.r}. Es tu referencia para este AMRAP por tiempo.`, reasons: ["reference_time"] }));
  }

  // Series principales y top sets: doble progresión de D182 con las filas comparables de la última vez.
  if (c.cls === "main" || c.cls === "top") {
    const sameCls = all.filter((x) => x.cls === c.cls && x.stage === 0 && x.label === c.label).length;
    if (!s) return withCoach(base(c, { why: NO_REF, reasons: ["no_history"] }));
    const last: LastSet[] = s.rows.map((r) => ({ weightKg: r.w, reps: r.r, rir: r.rir, feel: r.feel, kind: c.cls === "top" ? "top" : "work" }));
    const sg = suggestNext({ reps: c.reps, sets: sameCls, last, lastReps: s.rows[0]?.reps ?? null, signals });
    if (!sg) {
      // «Al fallo» o rango libre: referencia de la última vez, sin progresión automática.
      return withCoach(base(c, { status: "ready", action: "reference", quality: h.quality, prev, refs, weightKg: prev?.w ?? null, repsTarget: prev?.r ?? null,
        text: targetText(prev?.w ?? null, prev?.r ?? null, null), why: `La vez pasada: ${targetText(prev?.w ?? null, prev?.r ?? null, null)}. Sin un rango de repeticiones no se calcula una progresión.`, reasons: ["reference_free"] }));
    }
    let w = sg.weightKg;
    const action = ACTION_OF[sg.action] ?? "hold";
    if (w != null && p.increment) {
      const top = Math.max(0, ...s.rows.map((r) => r.w ?? 0));
      w = action === "increase_load" ? nextLoad(top, p.increment) : fitIncrement(w, p.increment);
    }
    // Una carga nueva (subir, bajar o estimar) sin el salto del equipo es una referencia: puede no existir tal cual.
    const newLoad = w != null && w > 0 && (action === "increase_load" || action === "reduce_load" || action === "estimate");
    const guards = sg.guards ?? [];
    const limited = guards.some((g) => g !== "range_change");
    const t = base(c, {
      status: limited ? "limited" : "ready", action: w == null && action === "increase_load" ? "increase_reps" : action, quality: h.quality, prev, refs, guards,
      // Al cambiar la carga se muestra el rango (volvés al piso); al mantenerla, las repeticiones que tocan hoy.
      weightKg: w, repsTarget: sg.reps, text: targetText(w, sg.reps, sg.action === "hold" || sg.action === "reps" ? null : parseRepsMax(c.reps)),
      why: sg.why, reasons: [`progression_${sg.action}`, ...(h.quality === "low" ? ["low_quality"] : []), ...(newLoad ? [p.increment ? "increment_fit" : "increment_unknown"] : [])],
    });
    return withCoach(t);
  }

  // AMRAP por repeticiones: misma carga que la última vez; la meta es igualar o superar las repeticiones. Nunca sube kilos solo.
  if (c.cls === "amrap") {
    if (!prev || !own) return withCoach(base(c, { why: NO_REF, reasons: ["no_history"] }));
    const pain = !!signals.painExercise || !!signals.painOrInjury || own.feel === "molestia";
    const g: GuardCode[] = pain ? [signals.painExercise || own.feel === "molestia" ? "pain_exercise" : "pain_or_injury"] : [];
    return withCoach(base(c, { status: pain ? "limited" : "ready", action: "hold", quality: h.quality, prev, refs, guards: g, weightKg: own.w, repsTarget: own.r,
      text: targetText(own.w, own.r, null), why: `AMRAP: misma carga que la última vez; la meta es igualar o superar ${own.r} repeticiones.${g.map((x) => ` ${GUARD_TEXT[x]}`).join("")}`, reasons: ["amrap_hold"] }));
  }

  // Etapas y series reducidas: cada una con su propia historia, nunca con la carga de la serie principal copiada.
  const parentIdx = c.stage > 0 ? c.index - 1 : all.findIndex((x) => x.cls === "top" && x.index < c.index);
  const parent = parentIdx >= 0 ? done[parentIdx] ?? null : null;
  const parentKg = parent?.weightKg ?? all[parentIdx]?.planKg ?? null;
  const painG: GuardCode[] = signals.painExercise ? ["pain_exercise"] : signals.painOrInjury ? ["pain_or_injury"] : [];

  if (c.cls === "rest_pause" || c.cls === "cluster") {
    // Mini series y bloques de cluster: misma carga que la serie principal (lo pide el método); la referencia de reps es la propia.
    const w = c.planKg ?? parentKg;
    const what = c.cls === "cluster" ? "Bloque de cluster" : "Mini serie";
    return withCoach(base(c, { status: w != null || prev ? "ready" : "no_data", action: "hold", quality: h.quality, prev, refs, guards: [...painG, "method"], weightKg: w, repsTarget: own?.r ?? null,
      text: targetText(w, own?.r ?? parseRepsMin(c.reps), null),
      why: `${what}: misma carga que la serie principal${own?.r ? `; la vez pasada hiciste ${own.r}` : ""}. No se sube la carga de una mini serie por completar otra.`, reasons: ["method_same_load"] }));
  }

  // Drop y back-off: con historia propia, se repite esa carga (sin subirla sola); sin historia, una referencia para confirmar.
  const factor = c.cls === "drop" ? DROP_FACTOR : BACKOFF_FACTOR;
  const label = c.cls === "drop" ? `Drop ${c.stage}` : "Back-off";
  const cap = parentKg != null && parentKg > 0 ? Math.max(0, parentKg - loadStep(parentKg)) : null;
  if (own && own.w != null && own.w > 0) {
    let w = cap != null ? Math.min(own.w, cap) : own.w;
    if (painG.length) w = fitIncrement(w * 0.9, p.increment);
    return withCoach(base(c, { status: painG.length ? "limited" : "ready", action: painG.length ? "reduce_load" : "hold", quality: h.quality, prev, refs, guards: painG, pending: true,
      weightKg: w, repsTarget: own.r, text: targetText(w, own.r, null),
      why: `${label}: la carga se calcula aparte de la serie principal. La vez pasada: ${targetText(own.w, own.r, null)}.${w < own.w ? " Queda por debajo de la serie anterior." : ""}${painG.map((g) => ` ${GUARD_TEXT[g]}`).join("")}`,
      reasons: ["stage_own_history"] }));
  }
  if (parentKg != null && parentKg > 0) {
    const w = fitIncrement(parentKg * factor, p.increment);
    return withCoach(base(c, { status: "no_data", action: "reference", quality: "none", pending: true, weightKg: w > 0 ? w : null, guards: painG,
      text: w > 0 ? fmtKg(w) : "", why: `${label}: sin una referencia propia todavía. Aproximación: ${c.cls === "drop" ? "−20 % de la serie anterior" : "−15 % del top set"}; ajustala en la serie.`, reasons: ["stage_reference", p.increment ? "increment_fit" : "increment_unknown"] }));
  }
  return withCoach(base(c, { pending: true, why: `${label}: ${NO_REF.toLowerCase()} Elegí la carga en la serie.`, reasons: ["no_history"] }));
}
const parseRepsMax = (reps: string) => { const t = parseReps(reps); return t.kind === "reps" ? t.max : null; };
const parseRepsMin = (reps: string) => { const t = parseReps(reps); return t.kind === "reps" ? t.min : null; };

// ── Durante la sesión ──────────────────────────────────────────────────────
export type DoneRow = { index: number; w: number | null; r: number | null; rir: number | null; feel: string | null };
/** Prioridad (menor = más importante): 1 seguridad · 2 profe · 3 próxima serie · 4 progreso · 5 secundaria. */
export type IntelEvent = { code: "pain" | "harder" | "short" | "easier" | "range_done" | "coach_hold"; priority: 1 | 2 | 3 | 4 | 5; text: string; row: number; restPlusSec: number | null };

/**
 * Después de completar la fila `justDone`: decide si cambia el objetivo de las filas siguientes del mismo ejercicio. Sólo puede
 * mantener o bajar exigencia (nunca sube en la sesión), nunca toca filas ya registradas ni cargas del profe, y no inventa nada
 * si falta el resultado. Devuelve un único mensaje (el más importante) o ninguno.
 */
export function adjustAfterSet(p: { ex: ExCtx; targets: RowTarget[]; done: DoneRow[]; justDone: number; increment?: number | null }): { targets: RowTarget[]; event: IntelEvent | null; changed: number[] } {
  const inc = incOf(p);
  const ctxs = exerciseRows(p.ex);
  const c = ctxs[p.justDone];
  const d = p.done.find((x) => x.index === p.justDone);
  const t = p.targets[p.justDone];
  if (!c || !d || d.r == null || d.r <= 0 || c.cls === "warmup") return { targets: p.targets, event: null, changed: [] };
  const doneIdx = new Set(p.done.map((x) => x.index));
  const later = ctxs.filter((x) => x.index > p.justDone && !doneIdx.has(x.index));
  const same = later.filter((x) => x.cls === c.cls && x.stage === c.stage && x.label === c.label);
  const next = p.targets.slice();
  const changed: number[] = [];
  const set = (i: number, patch: Partial<RowTarget>, reason: string) => {
    const cur = next[i];
    if (!cur || cur.source === "coach") return;
    const w = patch.weightKg !== undefined ? patch.weightKg : cur.weightKg;
    const same = w === cur.weightKg && (patch.action ?? cur.action) === cur.action;
    if (same) return;
    next[i] = { ...cur, ...patch, text: targetText(w, patch.repsTarget ?? cur.repsMin ?? cur.repsTarget, cur.repsMax), reasons: [...cur.reasons, reason] };
    changed.push(i);
  };
  const restPlus = c.stage === 0 && !c.emom && (c.cls === "main" || c.cls === "top" || c.cls === "backoff") ? 30 : null;
  const coachNext = same.some((x) => p.targets[x.index]?.source === "coach");

  if (d.feel === "molestia") {
    for (const x of later) { const cur = next[x.index]; if (cur && cur.weightKg != null && d.w != null && cur.weightKg > d.w) set(x.index, { weightKg: d.w, action: "hold", status: "limited", guards: [...new Set([...cur.guards, "pain_exercise" as const])] }, "in_session_pain"); else if (cur && (cur.action === "increase_load" || cur.action === "increase_reps")) set(x.index, { action: "hold", status: "limited", guards: [...new Set([...cur.guards, "pain_exercise" as const])] }, "in_session_pain"); }
    const text = "Registraste una molestia. No voy a recomendar subir el peso en este ejercicio. Considerá detenerlo y consultar a tu entrenador o profesional de salud.";
    for (const i of changed) next[i] = { ...next[i], why: text };
    return { targets: next, changed, event: { code: "pain", priority: 1, row: p.justDone, restPlusSec: null, text } };
  }
  const minR = t?.repsMin ?? null;
  const short = minR != null && d.r < minR;
  const harder = d.rir === 0 || d.feel === "limite" || (t?.rirTarget != null && d.rir != null && d.rir < t.rirTarget - 1) || short;
  if (harder) {
    const far = minR != null && minR - d.r >= 3 && d.w != null && d.w > 0;
    for (const x of same) {
      const cur = next[x.index];
      if (!cur || cur.weightKg == null || d.w == null) continue;
      if (far) set(x.index, { weightKg: Math.min(cur.weightKg, fitIncrement(d.w - (inc ?? loadStep(d.w)), inc)), action: "reduce_load" }, "in_session_short");
      else if (cur.weightKg > d.w) set(x.index, { weightKg: d.w, action: "hold" }, "in_session_harder");
      else if (cur.action === "increase_load" || cur.action === "increase_reps") set(x.index, { action: "hold" }, "in_session_harder");
    }
    const text = coachNext ? "La serie fue más exigente de lo previsto. Tu profe indicó la carga de la próxima: hacela con buena técnica y, si no sale, avisale."
      : far ? `La serie fue bastante más exigente de lo esperado (${d.r} de ${minR}). Para la siguiente, bajá un poco la carga y priorizá completar el rango.`
        : "La serie fue más exigente de lo previsto. Para la siguiente, mantené la carga y priorizá completar el rango sin forzar una subida.";
    for (const i of changed) next[i] = { ...next[i], why: text }; // la fila ajustada explica el ajuste que se ejecutó
    return { targets: next, changed, event: { code: coachNext ? "coach_hold" : far ? "short" : "harder", priority: coachNext ? 2 : 3, row: p.justDone, restPlusSec: restPlus, text } };
  }
  const maxR = t?.repsMax ?? null;
  if (maxR != null && d.r >= maxR && same.length === 0 && (c.cls === "main" || c.cls === "top")) {
    return { targets: next, changed, event: { code: "range_done", priority: 4, row: p.justDone, restPlusSec: null, text: "Completaste el rango en todas tus series de trabajo. Si fue con margen, la próxima sesión puede tocar progresar." } };
  }
  if ((d.feel === "facil" || (d.rir != null && d.rir >= (t?.rirTarget ?? 2) + 2)) && same.length) {
    return { targets: next, changed, event: { code: "easier", priority: 4, row: p.justDone, restPlusSec: null, text: "Vas con margen. No subo la carga a mitad de la sesión: mantené el objetivo y, si se repite, la próxima vez puede tocar progresar." } };
  }
  return { targets: next, changed, event: null };
}

/** De varios mensajes, el más importante (y uno solo): seguridad > profe > próxima serie > progreso > secundaria. */
export const topEvent = (xs: (IntelEvent | null | undefined)[]) => xs.filter((x): x is IntelEvent => !!x).sort((a, b) => a.priority - b.priority)[0] ?? null;

/** ¿Cómo se resolvió el objetivo? accepted: misma carga (o sin carga) y reps dentro del rango; modified: otra cosa. */
/** Cargar en lb lo que se ve (1 decimal) vuelve a kg con hasta ~0,03 kg de diferencia: sigue siendo «lo propuesto». */
const LB_ROUNDING_KG = 0.03;
export function decisionFor(t: Pick<RowTarget, "weightKg" | "repsMin" | "repsMax" | "repsTarget" | "action">, real: { w: number | null; r: number | null }): "accepted" | "modified" {
  if (t.action === "none" || t.action === "reference") return "modified";
  const sameW = t.weightKg == null || real.w == null ? (t.weightKg ?? 0) === (real.w ?? 0) : Math.abs(t.weightKg - real.w) < LB_ROUNDING_KG;
  const lo = t.repsMin ?? t.repsTarget, hi = t.repsMax ?? t.repsTarget;
  const inRange = lo == null || real.r == null ? true : real.r >= lo && real.r <= (hi ?? lo) + 2;
  return sameW && inRange ? "accepted" : "modified";
}

// ── Tendencias entre sesiones ──────────────────────────────────────────────
export type SessionPoint = { at: string; w: number | null; r: number | null; rir: number | null; hard: boolean; completedAll: boolean; topOfRange: boolean; score: number };
/** Punto de cada sesión comparable de la serie principal: la mejor serie de trabajo (1RM estimado, o kilos y reps). */
export function sessionPoints(cur: RowCtx, history: HistRow[], now: Date, plannedSets: number): SessionPoint[] {
  const { sessions } = comparableHistory(cur, history, now);
  const max = parseRepsMax(cur.reps);
  return sessions.map((s) => {
    const best = s.rows.reduce((a, b) => (score(b) > score(a) ? b : a));
    const rows = s.rows;
    return {
      at: s.at, w: best.w, r: best.r, rir: best.rir, hard: rows.some((x) => x.rir === 0 || x.feel === "limite" || x.feel === "dificil"),
      completedAll: rows.length >= plannedSets, topOfRange: max != null && rows.every((x) => (x.r ?? 0) >= max), score: score(best),
    };
  }).reverse(); // cronológico
}
function score(r: { w: number | null; r: number | null }) {
  const w = r.w ?? 0, n = r.r ?? 0;
  const e = w > 0 ? epley1rm(w, n) : null;
  return e ?? (w > 0 ? w * (1 + Math.min(n, 30) / 30) : n); // fuera de 1–12 reps, la misma fórmula sólo para ordenar (no se muestra)
}

export type TrendKind = "insufficient" | "progressing" | "plateau" | "declining" | "variable" | "stable" | "effort_up" | "returning";
export type Trend = { kind: TrendKind; confidence: "none" | "possible" | "consistent"; sessions: number; text: string; basis: string };
const REL = 0.01; // un cambio menor al 1 % del rendimiento estimado se toma como «igual»

/** Tendencia con las sesiones comparables (más antigua primero). Nunca declara un estancamiento con una sola sesión. */
export function exerciseTrend(points: SessionPoint[]): Trend {
  const n = points.length;
  const basis = `Últimas ${n} ${n === 1 ? "sesión comparable" : "sesiones comparables"} (máx. ${TI_WINDOW.sessions} en ${TI_WINDOW.days} días), mejor serie de trabajo de cada una.`;
  if (n < TREND_MIN) return { kind: "insufficient", confidence: "none", sessions: n, basis, text: "Todavía no hay sesiones suficientes para ver una tendencia." };
  const last = points[n - 1], prev = points[n - 2];
  const gap = (Date.parse(last.at) - Date.parse(prev.at)) / 86_400_000;
  const peak = Math.max(...points.slice(0, -1).map((p) => p.score));
  if (gap > 28 && last.score < peak) return { kind: "returning", confidence: "possible", sessions: n, basis, text: "Volviste después de una pausa larga: retomá de a poco antes de buscar marcas." };
  const deltas = points.slice(1).map((p, i) => { const a = points[i].score; return a > 0 ? (p.score - a) / a : 0; });
  const recent = deltas.slice(-3);
  const ups = recent.filter((d) => d > REL).length, downs = recent.filter((d) => d < -REL).length, flats = recent.filter((d) => Math.abs(d) <= REL).length;
  const cons = (k: number) => (recent.length >= 3 && k >= 3 ? "consistent" : "possible") as Trend["confidence"];
  if (ups >= 2 && downs === 0) return { kind: "progressing", confidence: cons(ups), sessions: n, basis, text: "Venís progresando en este ejercicio." };
  if (downs >= 2 && ups === 0) return { kind: "declining", confidence: cons(downs), sessions: n, basis, text: "El rendimiento viene bajando en las últimas sesiones." };
  if (flats === recent.length) {
    const rirs = points.map((p) => p.rir).filter((x): x is number => x != null);
    const effortUp = rirs.length >= 3 && rirs[0] - rirs[rirs.length - 1] >= 1;
    if (effortUp) return { kind: "effort_up", confidence: cons(flats), sessions: n, basis, text: "Mismo rendimiento con más esfuerzo: revisá descanso y recuperación." };
    if (n >= 4) return { kind: "plateau", confidence: n >= 5 ? "consistent" : "possible", sessions: n, basis, text: `Rendimiento estable en las últimas ${n} sesiones.` };
    return { kind: "stable", confidence: "possible", sessions: n, basis, text: "Rendimiento estable." };
  }
  return { kind: "variable", confidence: "possible", sessions: n, basis, text: "El rendimiento varía de una sesión a otra." };
}

export type ProposalKind = "load" | "reps" | "hold" | "review" | "deload" | "rest";
export type Proposal = { kind: ProposalKind; text: string; weightKg: number | null; reps: number | null; requiresCoach: boolean; basis: string };

/**
 * Propuesta para la próxima sesión (nunca se aplica sola). Con programa del profe, cualquier cambio de la programación queda
 * como propuesta para su revisión (`requiresCoach`). No propone cambios de volumen (cantidad de series): sólo sugiere revisarlo.
 */
export function nextProposal(trend: Trend, points: SessionPoint[], o: { repsMin: number | null; repsMax: number | null; coachOwned: boolean; increment?: number | null; fatigue?: boolean }): Proposal | null {
  const last = points[points.length - 1];
  if (!last || trend.kind === "insufficient") return null;
  const n = points.length;
  if (trend.kind === "returning") return { kind: "hold", text: trend.text, weightKg: last.w, reps: null, requiresCoach: false, basis: trend.basis };
  if (trend.kind === "declining") {
    return o.fatigue || points.slice(-3).some((p) => p.hard)
      ? { kind: "deload", requiresCoach: true, weightKg: null, reps: null, basis: trend.basis, text: "El rendimiento viene por debajo durante varias sesiones y reportaste más esfuerzo. Podría ser conveniente revisar el volumen o la recuperación con tu entrenador." }
      : { kind: "review", requiresCoach: o.coachOwned, weightKg: null, reps: null, basis: trend.basis, text: "El rendimiento bajó en las últimas sesiones. Conviene mirar descanso, sueño y técnica antes de subir la carga." };
  }
  if (trend.kind === "effort_up") return { kind: "rest", requiresCoach: false, weightKg: last.w, reps: null, basis: trend.basis, text: trend.text };
  if (trend.kind === "plateau" && trend.confidence === "consistent" && !(last.topOfRange && last.completedAll)) {
    return { kind: "review", requiresCoach: true, weightKg: null, reps: null, basis: trend.basis, text: `Rendimiento igual hace ${n} sesiones sin completar el rango. Podría convenir revisar con tu entrenador el rango, el descanso o la variante.` };
  }
  const recent = points.slice(-3);
  const stableLoad = last.w != null && recent.every((p) => p.w === last.w);
  if (last.w && last.w > 0 && last.completedAll && last.topOfRange && !last.hard) {
    const w = nextLoad(last.w, o.increment);
    return { kind: "load", requiresCoach: o.coachOwned, weightKg: w, reps: o.repsMin, basis: trend.basis,
      text: `${stableLoad && recent.length >= 3 ? `En tus últimas ${recent.length} sesiones completaste el rango con una carga estable.` : "Completaste el rango en todas las series."} En la próxima podrías probar el incremento disponible más pequeño (${fmtKg(w)}).` };
  }
  if (o.repsMax != null && (last.r ?? 0) < o.repsMax) return { kind: "reps", requiresCoach: false, weightKg: last.w, reps: Math.min(o.repsMax, (last.r ?? 0) + 1), basis: trend.basis, text: "Mantené el peso y buscá sumar repeticiones dentro del rango antes de subir la carga." };
  return { kind: "hold", requiresCoach: false, weightKg: last.w, reps: null, basis: trend.basis, text: "Mantené la carga actual." };
}

// ── Progreso hacia metas medibles ──────────────────────────────────────────
export type GoalMetric = "load" | "reps" | "adherence" | "e1rm";
/**
 * Porcentaje defendible: (actual − base) ÷ (meta − base) sobre una métrica medible (kg, repeticiones o sesiones), con la fórmula
 * escrita. Sin valor actual o sin meta, «datos insuficientes». Nunca porcentajes de «desarrollo» corporal.
 */
export function progressToGoal(p: { metric: GoalMetric; baseline: number | null; target: number; current: number | null; unit: string; period?: string | null }): { pct: number | null; formula: string; status: "ok" | "insufficient" } {
  const r = goalProgress({ baseline: p.baseline, target: p.target, current: p.current });
  const n = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const per = p.period ? ` (${p.period})` : "";
  if (r == null) return { pct: null, status: "insufficient", formula: `Faltan datos medidos para calcular el avance${per}.` };
  const formula = p.baseline != null && p.baseline !== p.target
    ? `(${n(p.current!)} − ${n(p.baseline)}) ÷ (${n(p.target)} − ${n(p.baseline)}) ${p.unit}${per}`
    : `${n(p.current!)} ÷ ${n(p.target)} ${p.unit}${per}`;
  return { pct: Math.round(r * 100), status: "ok", formula };
}
