// D217 · Progress Intelligence 2.0: lo que se sabe de UN ejercicio de la persona, separado en cuatro conceptos que nunca se
// mezclan en una misma cifra:
//   A. Máximo realmente registrado (dato histórico: una serie válida que existió).
//   B. Capacidad estimada (1RM y cargas por repeticiones con Epley; metodología, serie de referencia, límites e incertidumbre).
//   C. Próxima carga de trabajo (la de Training Intelligence: `nextProposal` sobre las sesiones comparables; acá sólo se redacta).
//   D. Objetivo personal o acordado (una meta de la persona o del entrenador; nunca una predicción de REPI).
//
// Reglas: sólo series válidas (las anuladas no llegan; las corregidas llegan con su valor vigente). Las aproximaciones nunca
// cuentan; drops, mini series y clusters no son «mejor serie» ni referencia de estimaciones; peso corporal se mide en
// repeticiones y lo cronometrado en segundos (nunca como 0 kg). Lo importado conserva su procedencia y una fecha aproximada
// sigue marcada como aproximada; no sirve de referencia para estimar (no se sabe cuán reciente es). Sin datos suficientes, se
// dice qué falta en lugar de inventar.
import { epley1rm } from "./training";
import { floorToStep } from "./load-safety";
import { progressToGoal, type Proposal, type Trend } from "./intelligence";
import type { PersonalProfile, ProfileMeta } from "./wishes";
import { TRAINING_WISH_GOALS } from "./wishes";

/** Clase de la serie para Progreso (la de TI simplificada). */
export type PICls = "work" | "top" | "backoff" | "amrap" | "warmup" | "stage" | "timed";
/** Una serie válida del ejercicio (de REPI o importada). Kilos siempre en kg. */
export type PISet = {
  at: string; day: string; sessionId: string | null; source: "session" | "import"; approx: boolean;
  w: number | null; r: number | null; sec: number | null; rir: number | null; cls: PICls;
};
export type PIMetric = "load" | "reps" | "time";
type Ref = { w: number; r: number; day: string; at: string; source: "session" | "import"; approx: boolean; sessionId: string | null };

const DAY = 86_400_000;
/** «Las últimas semanas»: 6 semanas. */
export const RECENT_DAYS = 42;
/** Referencia para estimar: series de 1 a 10 repeticiones (más allá Epley pierde precisión y no se extrapola). */
export const ESTIMATE_MAX_REPS = 10;
/** Una estimación se ofrece sólo hasta ±4 repeticiones de la serie de referencia. */
export const ESTIMATE_SPAN = 4;
/** Referencia para estimar: de los últimos 120 días (una marca vieja no describe la capacidad de hoy). */
export const ESTIMATE_DAYS = 120;
export const ESTIMATE_METHOD = "Fórmula de Epley: 1RM ≈ peso × (1 + repeticiones ÷ 30). Es una estimación, no una repetición máxima ejecutada.";
export const ESTIMATE_LIMITS = "Varía según la técnica, el descanso, el día y el ejercicio; el margen habitual es de ±5 a 10 %. No es una garantía ni una orden de subir la carga, y no hace falta probar un máximo real.";
export const BEST_SET_CRITERION = "Mayor 1RM estimado entre series de trabajo de 1 a 12 repeticiones (sin aproximaciones, drops, mini series ni series por tiempo).";

const counts = (s: PISet) => s.cls !== "warmup" && s.cls !== "timed";
const loaded = (s: PISet) => counts(s) && s.w != null && s.w > 0 && s.r != null && s.r > 0;
/** Mejor serie y referencia de estimaciones: trabajo, top set, back-off y AMRAP (no etapas). */
const bestable = (s: PISet) => loaded(s) && s.cls !== "stage";
const refOf = (s: PISet): Ref => ({ w: s.w!, r: s.r!, day: s.day, at: s.at, source: s.source, approx: s.approx, sessionId: s.sessionId });
const ms = (s: { at: string }) => Date.parse(s.at);

export function metricOfSets(sets: PISet[], kind?: string | null): PIMetric {
  if (sets.some(loaded)) return "load";
  if (sets.some((s) => counts(s) && s.r != null && s.r > 0)) return "reps";
  if (sets.some((s) => s.cls === "timed" && (s.sec ?? s.r) != null)) return "time";
  return kind === "time" ? "time" : kind === "bodyweight" ? "reps" : "load";
}

/** A: la carga más alta de una serie válida (con sus repeticiones y fecha); empate → más repeticiones, después la más reciente. */
export function maxLoad(sets: PISet[]): Ref | null {
  let best: PISet | null = null;
  for (const s of sets) if (loaded(s) && (!best || s.w! > best.w! || (s.w === best.w && (s.r! > best.r! || (s.r === best.r && ms(s) > ms(best)))))) best = s;
  return best ? refOf(best) : null;
}
/** Mejor serie comparable (criterio `BEST_SET_CRITERION`) con su 1RM estimado. */
export function bestSet(sets: PISet[]): (Ref & { e1rm: number }) | null {
  let best: (Ref & { e1rm: number }) | null = null;
  for (const s of sets) {
    if (!bestable(s)) continue;
    const e = epley1rm(s.w!, s.r!);
    if (e != null && (!best || e > best.e1rm || (e === best.e1rm && ms(s) > Date.parse(best.at)))) best = { ...refOf(s), e1rm: e };
  }
  return best;
}
const maxBy = (sets: PISet[], v: (s: PISet) => number | null) => {
  let best: PISet | null = null, bv = -Infinity;
  for (const s of sets) { const x = v(s); if (x != null && x > bv) { best = s; bv = x; } }
  return best ? { s: best, v: bv } : null;
};

/** Estimación de carga para `reps` repeticiones desde un 1RM estimado (redondeada hacia abajo al paso de carga). */
export const loadForReps = (e1rm: number, reps: number) => (reps === 1 ? floorToStep(e1rm) : floorToStep(e1rm / (1 + reps / 30)));

export type Estimate = { reps: number; weightKg: number; confidence: "media" | "baja" };
/**
 * B: estimaciones por repeticiones desde la mejor serie RECIENTE de 1 a 10 repeticiones (REPI o importada con fecha real).
 * Sólo cerca de la serie de referencia (±4 reps) y nunca de 1 repetición (eso es el 1RM estimado, que se muestra aparte).
 */
export function estimates(sets: PISet[], now: Date, reps: number[] = [3, 5, 6, 8, 10, 12]): { ref: Ref & { e1rm: number }; rows: Estimate[]; method: string; limits: string } | null {
  const since = now.getTime() - ESTIMATE_DAYS * DAY;
  const ref = bestSet(sets.filter((s) => !s.approx && ms(s) >= since && (s.r ?? 0) <= ESTIMATE_MAX_REPS));
  if (!ref) return null;
  const rows = reps.filter((n) => n > 1 && Math.abs(n - ref.r) <= ESTIMATE_SPAN).map((n) => ({ reps: n, weightKg: loadForReps(ref.e1rm, n), confidence: (Math.abs(n - ref.r) <= 2 ? "media" : "baja") as Estimate["confidence"] }))
    .filter((x) => x.weightKg > 0);
  return { ref, rows, method: ESTIMATE_METHOD, limits: ESTIMATE_LIMITS };
}

export type RecordEvent = { day: string; at: string; kind: "e1rm" | "load" | "reps" | "time"; value: number; prev: number; sessionId: string | null; source: "session" | "import"; approx: boolean };
/**
 * Récords en orden: una sesión (o un día importado) supera su mejor marca ANTERIOR. La primera marca no es récord. 1RM
 * estimado contra 1RM estimado y carga contra carga (nunca se mezclan escalas). Sin carga: repeticiones; por tiempo: segundos.
 */
export function recordEvents(sets: PISet[], metric: PIMetric): RecordEvent[] {
  const groups = new Map<string, PISet[]>();
  for (const s of [...sets].sort((a, b) => ms(a) - ms(b))) { const k = s.sessionId ?? `imp:${s.day}`; groups.set(k, [...(groups.get(k) ?? []), s]); }
  const out: RecordEvent[] = [];
  const best: Record<string, number | null> = { e1rm: null, load: null, reps: null, time: null };
  const push = (kind: RecordEvent["kind"], v: number | null, g: PISet[]) => {
    if (v == null) return;
    const b = best[kind];
    if (b != null && v > b) out.push({ day: g[0].day, at: g[0].at, kind, value: v, prev: b, sessionId: g[0].sessionId, source: g[0].source, approx: g[0].approx });
    if (b == null || v > b) best[kind] = v;
  };
  for (const g of groups.values()) {
    if (metric === "load") {
      push("e1rm", bestSet(g)?.e1rm ?? null, g);
      push("load", maxLoad(g)?.w ?? null, g);
    } else if (metric === "reps") push("reps", maxBy(g.filter((s) => counts(s) && !(s.w && s.w > 0)), (s) => s.r)?.v ?? null, g);
    else push("time", maxBy(g.filter((s) => s.cls === "timed"), (s) => s.sec ?? s.r)?.v ?? null, g);
  }
  return out;
}

export type Regularity = { sessions28: number; perWeek: number | null; target: number | null; adherencePct: number | null; avgGapDays: number | null; lastDay: string | null; formula: string };
/** Regularidad del ejercicio y de la persona: sólo fechas reales (lo importado con fecha aproximada no cuenta acá). */
export function regularity(sets: PISet[], allSessionDays: string[], now: Date, target: number | null): Regularity {
  const real = sets.filter((s) => !s.approx);
  const days = [...new Set(real.map((s) => s.day))].sort();
  const gaps = days.slice(1).map((d, i) => (Date.parse(`${d}T12:00:00Z`) - Date.parse(`${days[i]}T12:00:00Z`)) / DAY);
  const since = new Date(now.getTime() - 28 * DAY).toISOString().slice(0, 10);
  const s28 = [...new Set(allSessionDays.filter((d) => d >= since))].length;
  const perWeek = Math.round((s28 / 4) * 10) / 10;
  return {
    sessions28: s28, perWeek: allSessionDays.length ? perWeek : null, target,
    adherencePct: target ? Math.min(100, Math.round((perWeek / target) * 100)) : null,
    avgGapDays: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
    lastDay: days[days.length - 1] ?? null,
    formula: target ? `Entrenamientos de las últimas 4 semanas ÷ 4, contra ${target} por semana que declaraste.` : "Entrenamientos de las últimas 4 semanas ÷ 4.",
  };
}

export type Effort = { sets: number; withRir: number; avgRir: number | null; atFailure: number };
export function effort(sets: PISet[], now: Date, days = RECENT_DAYS): Effort {
  const since = now.getTime() - days * DAY;
  const xs = sets.filter((s) => !s.approx && ms(s) >= since && counts(s) && s.cls !== "stage");
  const rirs = xs.map((s) => s.rir).filter((x): x is number => x != null);
  return { sets: xs.length, withRir: rirs.length, avgRir: rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null, atFailure: rirs.filter((x) => x === 0).length };
}

// ── Objetivos por ejercicio (D) ─────────────────────────────────────────────
export type ExerciseGoalKind = "load" | "e1rm" | "reps" | "time";
export type ExerciseGoalIn = { kind: ExerciseGoalKind; target: number; targetReps: number | null; baseline: number | null };
export type GoalStatus = { met: boolean; current: number | null; pct: number | null; formula: string; text: string; bestAtTarget: { w: number; r: number; day: string } | null };
const kgTxt = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} kg`;
/**
 * Estado de una meta con lo registrado. Meta «carga × reps»: la mejor serie con ese peso o más (y la carga más alta con esas
 * repeticiones). El porcentaje sólo con línea base medible (`progressToGoal`); nunca un porcentaje inventado.
 */
export function goalStatus(g: ExerciseGoalIn, sets: PISet[], fmt: (kg: number) => string = kgTxt): GoalStatus {
  if (g.kind === "load") {
    const reps = g.targetReps ?? 1;
    const atW = maxBy(sets.filter((s) => loaded(s) && s.w! >= g.target - 1e-9), (s) => s.r);
    const withR = maxBy(sets.filter((s) => loaded(s) && s.r! >= reps), (s) => s.w);
    const current = withR?.v ?? null;
    const met = !!atW && atW.v >= reps;
    const p = progressToGoal({ metric: "load", baseline: g.baseline, target: g.target, current, unit: "kg" });
    const goalTxt = `${fmt(g.target)} × ${reps}`;
    const text = met ? `Lograste tu meta de ${goalTxt}.`
      : atW ? `Tu meta es ${goalTxt}. La mejor serie registrada con ese peso fue de ${atW.v} ${atW.v === 1 ? "repetición" : "repeticiones"}.`
      : withR ? `Tu meta es ${goalTxt}. Con ${reps} repeticiones, tu carga más alta registrada es ${fmt(withR.v)}.`
      : `Tu meta es ${goalTxt}. Todavía no hay series con ${reps} repeticiones o más para comparar.`;
    return { met, current, pct: met ? 100 : p.pct, formula: p.formula, text, bestAtTarget: atW ? { w: atW.s.w!, r: atW.v, day: atW.s.day } : null };
  }
  if (g.kind === "e1rm") {
    const b = bestSet(sets);
    const current = b?.e1rm ?? null;
    const p = progressToGoal({ metric: "e1rm", baseline: g.baseline, target: g.target, current, unit: "kg" });
    const met = current != null && current >= g.target;
    return { met, current, pct: met ? 100 : p.pct, formula: p.formula, bestAtTarget: null,
      text: current == null ? `Tu meta es un 1RM estimado de ${fmt(g.target)}. Faltan series de 1 a 12 repeticiones con carga para estimarlo.`
        : met ? `Tu 1RM estimado (${fmt(current)}) ya alcanza tu meta de ${fmt(g.target)}. Es una estimación, no un máximo ejecutado.`
        : `Tu meta es un 1RM estimado de ${fmt(g.target)}. Hoy se estima en ${fmt(current)} (estimación).` };
  }
  const isTime = g.kind === "time";
  const best = isTime ? maxBy(sets.filter((s) => s.cls === "timed"), (s) => s.sec ?? s.r) : maxBy(sets.filter((s) => counts(s) && s.r != null), (s) => s.r);
  const current = best?.v ?? null;
  const unit = isTime ? "s" : "repeticiones";
  const p = progressToGoal({ metric: "reps", baseline: g.baseline, target: g.target, current, unit });
  const met = current != null && current >= g.target;
  const tTxt = isTime ? secs(g.target) : `${g.target} repeticiones`;
  return { met, current, pct: met ? 100 : p.pct, formula: p.formula, bestAtTarget: null,
    text: current == null ? `Tu meta es ${tTxt}. Todavía no hay registros para comparar.`
      : met ? `Lograste tu meta de ${tTxt}.` : `Tu meta es ${tTxt}. Tu mejor registro es ${isTime ? secs(current) : `${current} repeticiones`}.` };
}
const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`);

// ── Intervenciones de REPI dentro de Progreso ───────────────────────────────
export type InsightCode = "improving" | "record" | "stable" | "few_data" | "goal_changed" | "exercise_goal" | "returning" | "declining" | "effort_up" | "approx_dates";
export type Insight = { code: InsightCode; priority: number; text: string; basis: string };
/**
 * Mensajes contextuales (máx. 3, el más importante primero). Usan la tendencia de Training Intelligence tal cual (la misma
 * que ve el cerebro): Progreso nunca calcula otra tendencia. `seen` (códigos ya mostrados) evita repetir lo mismo.
 */
export function progressInsights(p: {
  trend: Trend | null; records: RecordEvent[]; lastSessionDay: string | null; profile: PersonalProfile | null; profileMeta?: ProfileMeta | null;
  goal?: GoalStatus | null; approxShare?: number; now: Date; seen?: InsightCode[];
}): Insight[] {
  const out: Insight[] = [];
  const t = p.trend;
  const lastRec = p.records[p.records.length - 1];
  if (lastRec && p.lastSessionDay && lastRec.day === p.lastSessionDay)
    out.push({ code: "record", priority: 1, text: "Acabás de superar tu mejor marca registrada para este ejercicio.", basis: `Comparado con todo tu historial anterior de este ejercicio.` });
  if (t?.kind === "progressing" && t.confidence === "consistent")
    out.push({ code: "improving", priority: 2, text: `En tus últimas ${t.sessions} sesiones comparables mejoraste con una carga similar o mayor. Es una señal positiva.`, basis: t.basis });
  else if (t?.kind === "progressing") out.push({ code: "improving", priority: 3, text: t.text, basis: t.basis });
  if (t?.kind === "plateau" || t?.kind === "stable") {
    const g = p.profile?.goal;
    out.push({ code: "stable", priority: 3, basis: t.basis,
      text: `Tus últimas sesiones estuvieron bastante parejas.${g === "strength" ? " Si tu objetivo sigue siendo ganar fuerza, podemos revisar la progresión prevista." : g === "muscle" ? " Para ganar músculo, sumar repeticiones dentro del rango también es progreso." : ""}` });
  }
  if (t?.kind === "declining") out.push({ code: "declining", priority: 2, text: t.text, basis: t.basis });
  if (t?.kind === "effort_up") out.push({ code: "effort_up", priority: 2, text: t.text, basis: t.basis });
  if (t?.kind === "returning") out.push({ code: "returning", priority: 2, text: t.text, basis: t.basis });
  if (!t || t.kind === "insufficient") out.push({ code: "few_data", priority: 4, text: "Todavía no hay suficientes entrenamientos comparables para evaluar una tendencia.", basis: t?.basis ?? "Se necesitan al menos 3 sesiones comparables." });
  const gc = p.profileMeta?.fields?.goal;
  if (gc && p.profile?.goal && p.now.getTime() - Date.parse(gc.at) <= 14 * DAY && (p.profileMeta?.version ?? 0) > 1)
    out.push({ code: "goal_changed", priority: 2, text: `Cambiaste tu objetivo a «${TRAINING_WISH_GOALS[p.profile.goal].toLowerCase()}». Las próximas recomendaciones lo tienen en cuenta, respetando la programación vigente.`, basis: "Tu perfil de entrenamiento." });
  if (p.goal && !p.goal.met) out.push({ code: "exercise_goal", priority: 3, text: p.goal.text, basis: p.goal.formula });
  if ((p.approxShare ?? 0) > 0) out.push({ code: "approx_dates", priority: 5, text: "Parte de este historial tiene fechas aproximadas (importado sin fechas): la evolución respeta el orden, no las fechas exactas.", basis: "Historial importado." });
  const seen = new Set(p.seen ?? []);
  return out.filter((x) => !seen.has(x.code)).sort((a, b) => a.priority - b.priority).slice(0, 3);
}

/**
 * C: la propuesta de Training Intelligence redactada para Progreso (misma cifra que ve el cerebro y el entrenamiento).
 * «La última vez completaste 70 kg × 10 en tus series principales. En una próxima sesión comparable podrías…»
 */
export function nextText(last: { w: number | null; r: number | null } | null, pr: Proposal | null, fmt: (kg: number) => string = kgTxt): string | null {
  if (!pr || !last) return null;
  const lastTxt = last.w ? `${fmt(last.w)} × ${last.r ?? "?"}` : `${last.r ?? "?"} repeticiones`;
  const head = `La última vez completaste ${lastTxt} en tus series principales.`;
  const tail = " Si la programación y el esfuerzo registrado lo permiten; no es una garantía.";
  switch (pr.kind) {
    case "load": return `${head} En una próxima sesión comparable podrías intentar ${fmt(pr.weightKg!)}${pr.reps ? ` × ${pr.reps}` : ""}.${tail}${pr.requiresCoach ? " Como sigue un programa, queda como propuesta para tu entrenador." : ""}`;
    case "reps": return `${head} En una próxima sesión comparable podrías mantener ${last.w ? fmt(last.w) : "la carga"} y buscar ${pr.reps} ${pr.reps === 1 ? "repetición" : "repeticiones"}.${tail}`;
    case "hold": return `${head} ${pr.text}`;
    default: return `${head} ${pr.text}`;
  }
}

/** «¿Cuánto me falta para llegar a X kg?»: contra la mayor carga REAL (A) y, aparte, contra el 1RM estimado (B). */
export function distanceTo(targetKg: number, sets: PISet[], fmt: (kg: number) => string = kgTxt): { real: number | null; estimated: number | null; text: string } {
  const m = maxLoad(sets), b = bestSet(sets);
  if (!m) return { real: null, estimated: null, text: `Todavía no hay series con carga para comparar con ${fmt(targetKg)}.` };
  const real = Math.round((targetKg - m.w) * 100) / 100;
  const estimated = b ? Math.round((targetKg - b.e1rm) * 100) / 100 : null;
  const a = real <= 0 ? `Ya registraste ${fmt(m.w)} × ${m.r}, por encima de ${fmt(targetKg)}.` : `Tu mayor carga registrada es ${fmt(m.w)} × ${m.r}: te faltan ${fmt(real)} para ${fmt(targetKg)}.`;
  const e = b && estimated != null ? (estimated <= 0 ? ` Tu 1RM estimado (${fmt(b.e1rm)}) ya lo supera, pero es una estimación: no es una carga ejecutada.` : ` Tu 1RM estimado es ${fmt(b.e1rm)} (estimación, no un máximo ejecutado).`) : "";
  return { real, estimated, text: a + e };
}

/** «¿Cuánto podría tirar para N repeticiones?»: estimación (B) con su serie de referencia, o por qué no se puede. */
export function capacityFor(reps: number, sets: PISet[], now: Date, fmt: (kg: number) => string = kgTxt): { weightKg: number | null; text: string } {
  if (!Number.isInteger(reps) || reps < 1 || reps > 20) return { weightKg: null, text: "Decime una cantidad de repeticiones entre 1 y 20." };
  const est = estimates(sets, now, [reps]);
  if (!est) return { weightKg: null, text: "No hay una serie reciente de 1 a 10 repeticiones con carga (de los últimos 4 meses y con fecha real) para estimarlo." };
  if (Math.abs(reps - est.ref.r) > ESTIMATE_SPAN || reps === 1) {
    if (reps === 1) return { weightKg: est.ref.e1rm, text: `Tu 1RM estimado es ${fmt(est.ref.e1rm)}, desde ${fmt(est.ref.w)} × ${est.ref.r}. Es una estimación: no hace falta probar un máximo real.` };
    return { weightKg: null, text: `Tu serie de referencia es de ${est.ref.r} repeticiones (${fmt(est.ref.w)}); estimar ${reps} queda demasiado lejos para que el número sea confiable.` };
  }
  const w = est.rows.find((r) => r.reps === reps)?.weightKg ?? loadForReps(est.ref.e1rm, reps);
  return { weightKg: w, text: `Estimación aproximada: ${fmt(w)} × ${reps}, desde tu serie de ${fmt(est.ref.w)} × ${est.ref.r}. Margen de ±5 a 10 %; no es una garantía ni una orden de subir la carga.` };
}
