// AC3 · REPI durante el entrenamiento. Compone lo que ya calcula Training Intelligence (objetivos por fila, ajuste después de
// cada serie, tendencias, propuestas) en mensajes breves: el briefing antes del ejercicio, la lectura de cada serie, el cierre de
// la sesión, la versión corta por falta de tiempo y los reemplazos. No calcula cargas nuevas ni toca registros: si falta un
// dato, lo dice.
import type { Evidence, ExerciseBriefInput, ExerciseRef } from "./types";
import { adjustAfterSet, exerciseRows, type DoneRow, type ExCtx, type IntelEvent, type Proposal, type RowCtx, type RowTarget } from "../intelligence";
import { epley1rm, fmtSeconds, parseReps } from "../training";
import { GUARD_TEXT, type GuardCode } from "../load-safety";
import type { ExerciseDetail, SetKind } from "../prescription";
import { normalizePlan } from "../stages";
import { fmtArDate } from "./quiet";
import { fmtKg, listEs, norm, numEs } from "./util";

export type Tone = "normal" | "breve";

// ── Antes del ejercicio ────────────────────────────────────────────────────────────────────────────────────────────────
type LastSetLite = { w: number | null; r: number | null };
/** «3 × 10 con 60 kg», «60 kg × 10, 10, 9», «50 kg × 12 · 55 kg × 10». */
export function setsText(sets: LastSetLite[]): string | null {
  const s = sets.filter((x) => x.r != null && x.r > 0);
  if (!s.length) return null;
  const ws = new Set(s.map((x) => x.w ?? 0)), rs = new Set(s.map((x) => x.r));
  const w = s[0].w;
  if (ws.size === 1 && rs.size === 1) return `${s.length} × ${s[0].r}${w ? ` con ${fmtKg(w)}` : ""}`;
  if (ws.size === 1) return `${w ? `${fmtKg(w)} × ` : ""}${s.map((x) => x.r).join(", ")}`;
  return s.map((x) => `${x.w ? fmtKg(x.w) : "sin carga"} × ${x.r}`).join(" · ");
}
function prescribedText(p: ExerciseBriefInput["prescribed"]): string {
  const t = parseReps(p.reps);
  const scheme = (p.scheme ?? []).map((x) => x.trim()).filter(Boolean);
  if (scheme.length > 1 && new Set(scheme).size > 1) return `Hoy tenés indicadas ${scheme.length} series: ${listEs(scheme)} repeticiones.`;
  if (t.kind === "reps") return t.min === t.max ? `Hoy tenés indicadas ${p.sets} ${p.sets === 1 ? "serie" : "series"} de ${t.min}.` : `Hoy tenés indicado trabajar entre ${t.min} y ${t.max} repeticiones.`;
  if (t.kind === "time") return `Hoy tenés indicado ${fmtSeconds(t.seconds)} por serie.`;
  return `Hoy tenés indicado: ${p.reps}.`;
}
function recText(input: ExerciseBriefInput): string {
  const r = input.recommendation, p = input.prescribed;
  if (p.coachLoad && p.loadKg != null) return `Vamos con la carga que indicó tu profe: ${fmtKg(p.loadKg)}.`;
  if (r && (r.status === "coach" || r.action === "follow_coach" || r.action === "reduce_effort") && r.weightKg != null)
    return r.action === "reduce_effort" ? `Tu profe indicó ${fmtKg(r.weightKg)}. Hoy no fuerces: si molesta, pará y avisale.` : `Vamos con la carga que indicó tu profe: ${fmtKg(r.weightKg)}.`;
  if (!r || r.status === "no_data" || r.action === "none")
    return input.last ? "No tengo una referencia comparable para calcular la carga de hoy: elegí una con la que completes el rango con buena técnica."
      : "Todavía no tengo registros comparables de este ejercicio: elegí una carga con la que completes el rango con buena técnica.";
  const w = r.weightKg;
  switch (r.action) {
    case "increase_reps": return w ? `Mantenemos la carga e intentamos acercarnos a ${r.repsMax ?? r.reps}.` : `Buscamos sumar una repetición${r.reps ? `: ${r.reps}` : ""}.`;
    case "increase_load": return w ? `Completaste el rango: hoy probamos ${fmtKg(w)} y volvemos a ${r.repsMin ?? r.reps}.` : "Llegaste al tope del rango: probá con carga o una variante más difícil.";
    case "hold": return w ? `Repetimos ${fmtKg(w)} y buscamos ${r.reps ?? r.repsMin} en todas las series.` : "Repetimos lo de la última vez.";
    case "reduce_load": return w ? `Bajamos a ${fmtKg(w)} para completar el rango.` : "Bajamos un poco la exigencia para completar el rango.";
    case "estimate": return w ? `Es otro rango que la última vez: ${fmtKg(w)} es una estimación prudente; ajustala en la primera serie.` : "Es otro rango que la última vez: ajustá la carga en la primera serie.";
    case "reference": return w || r.reps ? `Tu referencia es la última vez${w ? `: ${fmtKg(w)}` : ""}${r.reps ? `${w ? " ×" : ":"} ${r.reps}` : ""}.` : "Tu referencia es la última vez.";
    default: return r.why ?? "";
  }
}
const MISSING_TEXT: Record<string, string> = {
  increment_unknown: "No sé el salto de carga de este equipo: tomá la carga como referencia.",
  low_quality: "La referencia viene de un registro importado: tomala como orientación.",
  rir: "Tu rutina no indica RIR: terminá cada serie con una o dos repeticiones de margen.",
  rest: "Tu rutina no indica descanso.",
  label_no_history: "Esta serie tiene nombre propio y todavía no tiene historia: elegí la carga vos.",
};

/**
 * Briefing antes de un ejercicio: lo hecho la última vez, lo indicado hoy y lo que recomienda Training Intelligence (o la carga
 * del profe, que manda), más advertencias por restricciones, protecciones y datos faltantes. Con tono breve, una sola línea.
 */
export function briefExercise(input: ExerciseBriefInput, tone: Tone = "normal"): { text: string; evidence: Evidence; warnings: string[] } {
  const last = input.last ? setsText(input.last.sets) : null;
  const warnings: string[] = [];
  for (const g of input.recommendation?.guards ?? []) if (g in GUARD_TEXT && g !== "range_change" && g !== "method") warnings.push(GUARD_TEXT[g as GuardCode]);
  if (input.recommendation?.review) warnings.push(input.recommendation.review);
  for (const r of input.restrictions) warnings.push(`Tenés registrado: ${r}. Si molesta, pará y consultalo con tu profe.`);
  for (const m of input.missing) warnings.push(MISSING_TEXT[m] ?? `Falta un dato: ${m}.`);
  const rec = recText(input);
  const parts = tone === "breve" ? [rec] : [last ? `La última vez hiciste ${last}.` : null, prescribedText(input.prescribed), rec];
  const evidence: Evidence = {
    basis: input.last && last ? `Última sesión comparable: ${fmtArDate(input.last.at)} (${last}).` : "No hay una sesión comparable anterior de este ejercicio.",
    excluded: "No se comparan aproximaciones, etapas de un método ni series anuladas.",
    sessions: input.last ? [{ at: input.last.at }] : [],
    via: "rules",
  };
  return { text: parts.filter(Boolean).join(" "), evidence, warnings: tone === "breve" ? warnings.slice(0, 1) : warnings };
}

// ── Después de cada serie ──────────────────────────────────────────────────────────────────────────────────────────────
export type SetCode = IntelEvent["code"] | "warmup_note" | "stage_progress" | "stage_done" | "amrap_beat" | "amrap_match" | "amrap_below"
  | "time_beat" | "time_match" | "target_met" | "pr_possible" | "no_result" | "silent";
export type SetMessage = { speak: boolean; text: string; code: SetCode; priority: 1 | 2 | 3 | 4 | 5; restPlusSec: number | null; targets: RowTarget[]; changed: number[] };

/** ¿Las series principales del ejercicio tienen distintas repeticiones (pirámide)? */
export function isPyramid(ex: ExCtx): boolean {
  const t = ex.detail?.technique;
  if (t === "pyramid" || t === "reverse_pyramid") return true;
  const main = exerciseRows(ex).filter((r) => r.stage === 0 && (r.cls === "main" || r.cls === "top"));
  return new Set(main.map((r) => r.reps.replace(/\s/g, "").replace("–", "-"))).size > 1;
}
const BRIEF_TEXT: Partial<Record<SetCode, string>> = {
  harder: "Más exigente de lo previsto: en la próxima mantené la carga.",
  short: "Te quedaste corto: en la próxima bajá un poco la carga.",
  coach_hold: "Más exigente de lo previsto. La próxima la indicó tu profe: si no sale, avisale.",
  easier: "Vas con margen. A mitad de sesión no subimos la carga.",
  range_done: "Rango completo en todas. La próxima puede tocar progresar.",
  target_met: "Objetivo cumplido.",
};
const stageName = (c: RowCtx, k: number, n: number) => (c.cls === "drop" ? `Drop ${k} de ${n}` : c.cls === "cluster" ? `Bloque ${k + 1} de ${n + 1}` : `Mini serie ${k} de ${n}`);

/**
 * Lee la serie recién registrada y decide si REPI habla. Envuelve `adjustAfterSet` (que sólo mantiene o baja, nunca sube en la
 * sesión ni toca cargas del profe) y agrega lo que le falta: las aproximaciones no se comparan; las etapas de drop, rest-pause,
 * myo o cluster no se tratan como series independientes; AMRAP y tiempo se comparan con la vez pasada sin reproches; dentro de
 * una superserie o circuito no se ofrece descanso extra. Devuelve un solo mensaje con su prioridad (1 = seguridad).
 */
export function interpretSet(p: {
  ex: ExCtx; targets: RowTarget[]; done: DoneRow[]; justDone: number; increment?: number | null;
  /** El ejercicio está en una superserie o circuito (sin descanso entre ejercicios). */
  grouped?: boolean;
  /** Mejor 1RM estimado previo (toda la historia, sin anuladas). Sin historia previa no hay récord. */
  bestE1rm?: number | null;
  tone?: Tone;
}): SetMessage {
  const ctxs = exerciseRows(p.ex);
  const c = ctxs[p.justDone];
  const d = p.done.find((x) => x.index === p.justDone);
  const t = p.targets[p.justDone];
  const out = (code: SetCode, text: string, priority: SetMessage["priority"], speak: boolean, extra: Partial<SetMessage> = {}): SetMessage => {
    const brief = p.tone === "breve" && code !== "pain" ? BRIEF_TEXT[code] : undefined;
    return { speak, text: brief ?? text, code, priority, restPlusSec: null, targets: p.targets, changed: [], ...extra };
  };
  if (!c || !d || d.r == null || d.r <= 0) return out("no_result", "", 5, false);
  if (c.cls === "warmup") {
    const first = ctxs.find((x) => x.cls === "warmup")?.index === p.justDone;
    return out("warmup_note", "Esta era una serie de aproximación. No la vamos a comparar con tus series principales.", 5, first);
  }
  if (d.feel === "molestia") {
    const adj = adjustAfterSet({ ex: p.ex, targets: p.targets, done: p.done, justDone: p.justDone, increment: p.increment });
    return out("pain", adj.event?.text ?? "Registraste una molestia. Considerá detener el ejercicio y consultar a tu entrenador.", 1, true, { targets: adj.targets, changed: adj.changed });
  }
  if (c.stage > 0) {
    // Una etapa (drop, mini serie, bloque) es parte de su serie: va al fallo o con poca reserva a propósito, no se evalúa sola.
    const stages = ctxs.filter((x) => x.block === c.block && x.stage > 0);
    const k = stages.findIndex((x) => x.index === c.index) + 1, n = stages.length;
    return k < n ? out("stage_progress", `${stageName(c, k, n)} hecho. Seguí con la siguiente etapa.`, 5, false)
      : out("stage_done", `Terminaste la serie con sus ${numEs(n, false)} etapas.`, 5, false);
  }
  if (c.cls === "amrap" || c.cls === "amrap_time" || c.cls === "timed") {
    const ref = t?.repsTarget ?? t?.prev?.r ?? null;
    const sameLoad = c.cls !== "amrap" || t?.weightKg == null || d.w == null || d.w >= t.weightKg - 0.03;
    if (ref == null || !sameLoad) return out("silent", "", 5, false);
    const unit = c.cls === "amrap" ? "repeticiones" : c.cls === "timed" ? "" : ((normalizePlan(p.ex.detail?.setPlan).rows[c.index]?.countUnit ?? "rounds") === "reps" ? "repeticiones" : "rondas");
    const fmt = (n: number) => (c.cls === "timed" ? fmtSeconds(n) : `${n} ${unit}`);
    if (d.r > ref) return out(c.cls === "amrap" ? "amrap_beat" : "time_beat", `${c.cls === "timed" ? `Aguantaste ${fmt(d.r)}` : `Hiciste ${fmt(d.r)}`}: superaste ${c.cls === "timed" ? "los" : "las"} ${fmt(ref)} de la vez pasada.`, 4, true);
    if (d.r === ref) return out(c.cls === "amrap" ? "amrap_match" : "time_match", `Igualaste ${c.cls === "timed" ? "los" : "las"} ${fmt(ref)} de la vez pasada.`, 5, false);
    return out("amrap_below", "", 5, false); // por debajo: sin reproches; la tendencia lo mira entre sesiones
  }
  const adj = adjustAfterSet({ ex: p.ex, targets: p.targets, done: p.done, justDone: p.justDone, increment: p.increment });
  const ev = adj.event;
  const keep = { targets: adj.targets, changed: adj.changed };
  if (ev) {
    let text = ev.text;
    if ((ev.code === "harder" || ev.code === "short") && isPyramid(p.ex))
      text = "La serie fue más exigente de lo previsto. En las próximas series de la pirámide no fuerces la subida: si hace falta, repetí esta carga.";
    return out(ev.code, text, ev.priority, true, { ...keep, restPlusSec: p.grouped ? null : ev.restPlusSec });
  }
  const e1 = d.w != null && d.w > 0 ? epley1rm(d.w, d.r) : null;
  if (e1 != null && p.bestE1rm != null && p.bestE1rm > 0 && e1 > p.bestE1rm)
    return out("pr_possible", `Es tu mejor marca estimada en este ejercicio (1RM estimado ${fmtKg(e1)}). Queda registrada.`, 4, true, keep);
  const lastMain = !ctxs.some((x) => x.index > p.justDone && x.stage === 0 && x.cls === c.cls && x.label === c.label);
  const inRange = !!t && t.repsMin != null && d.r >= t.repsMin && (t.repsMax == null || d.r <= t.repsMax + 2);
  if (inRange && lastMain)
    return out("target_met", "Completaste las repeticiones objetivo. Mantenemos la programación de hoy y lo tenemos en cuenta para tu próximo entrenamiento.", 5, true, keep);
  return out("silent", "", 5, false, keep);
}

// ── Cierre de la sesión ────────────────────────────────────────────────────────────────────────────────────────────────
export type ReviewSet = { w: number | null; r: number | null; rir?: number | null; feel?: string | null; kind?: SetKind | null; stage?: number | null; timed?: boolean; voided?: boolean };
/** Mejores marcas anteriores a hoy (toda la historia válida, sin anuladas). */
export type PriorMarks = { e1rm: number | null; maxLoadKg: number | null; repsAtLoad: { w: number; r: number }[]; bestReps: number | null; bestSec: number | null };
export type Measure = "load" | "reps" | "time";
export type Mark = { type: "load" | "reps_at_load" | "e1rm" | "reps" | "time"; value: number; previous: number; tie: boolean; text: string };
export type ReviewExercise = {
  exercise: ExerciseRef;
  measure?: Measure;
  /** Series principales previstas hoy (sin aproximaciones ni etapas). */
  plannedMain: number;
  sets: ReviewSet[];
  skipped?: boolean;
  substitutedBy?: ExerciseRef | null;
  previous?: { at: string; sets: ReviewSet[] } | null;
  before?: PriorMarks | null;
  proposal?: Proposal | null;
};
export type ExerciseReview = {
  exerciseId: string; name: string; status: "done" | "partial" | "skipped"; doneMain: number; plannedMain: number;
  comparison: "more" | "same" | "fewer" | "first" | "not_comparable"; delta: string | null; mark: Mark | null;
};
export type SessionReview = {
  text: string; planned: number; done: number; exercises: ExerciseReview[]; skipped: string[]; adaptations: string[]; marks: Mark[];
  fatigue: boolean; next: { kind: Proposal["kind"] | "none"; text: string; requiresCoach: boolean }; ask: string | null; evidence: Evidence;
};

const MAIN_KINDS: readonly (SetKind | null | undefined)[] = ["work", "top", "failure", "amrap", null, undefined];
/** Series principales válidas: sin anuladas, aproximaciones ni etapas, con resultado. */
export const mainSets = (sets: ReviewSet[]) => sets.filter((s) => !s.voided && (s.stage ?? 0) === 0 && MAIN_KINDS.includes(s.kind) && s.r != null && s.r > 0);
const measureOf = (e: ReviewExercise): Measure => e.measure ?? (e.sets.some((s) => s.timed) ? "time" : mainSets(e.sets).some((s) => (s.w ?? 0) > 0) ? "load" : "reps");
const bestE1 = (sets: ReviewSet[]) => Math.max(0, ...sets.map((s) => (s.w && s.r ? epley1rm(s.w, s.r) ?? 0 : 0)));
const REL = 0.01;

/** Compara las series principales de hoy con las de la sesión comparable anterior (misma carga: repeticiones; si no, 1RM estimado). */
export function compareWithPrevious(today: ReviewSet[], prev: ReviewSet[], measure: Measure): { comparison: ExerciseReview["comparison"]; delta: string | null } {
  // Mismo número de series de cada lado (las primeras, en orden): un ejercicio hecho a medias no se compara con la sesión
  // anterior completa, ni una sesión completa con una anterior a medias (revisión AC3, hallazgo 5).
  const n = Math.min(mainSets(today).length, mainSets(prev).length);
  const a = mainSets(today).slice(0, n), b = mainSets(prev).slice(0, n);
  if (!n) return { comparison: "not_comparable", delta: null };
  const dir = (x: number, y: number, tol = 0): ExerciseReview["comparison"] => (x > y + tol ? "more" : x < y - tol ? "fewer" : "same");
  if (measure === "time") {
    const x = Math.max(...a.map((s) => s.r!)), y = Math.max(...b.map((s) => s.r!));
    const c = dir(x, y);
    return { comparison: c, delta: c === "same" ? "mantuviste el tiempo de la sesión anterior" : `${c === "more" ? "aguantaste" : "hiciste"} ${fmtSeconds(x)} (la vez anterior, ${fmtSeconds(y)})` };
  }
  if (measure === "reps") {
    const x = a.reduce((n, s) => n + s.r!, 0), y = b.reduce((n, s) => n + s.r!, 0);
    const c = dir(x, y);
    return { comparison: c, delta: c === "same" ? "repetiste las repeticiones de la sesión anterior" : `hiciste ${numEs(Math.abs(x - y), false)} ${Math.abs(x - y) === 1 ? "repetición" : "repeticiones"} ${c === "more" ? "más" : "menos"} que la sesión anterior` };
  }
  const ta = Math.max(...a.map((s) => s.w ?? 0)), tb = Math.max(...b.map((s) => s.w ?? 0));
  if (Math.abs(ta - tb) < 0.03) {
    const x = a.filter((s) => Math.abs((s.w ?? 0) - ta) < 0.03).reduce((n, s) => n + s.r!, 0);
    const y = b.filter((s) => Math.abs((s.w ?? 0) - tb) < 0.03).reduce((n, s) => n + s.r!, 0);
    const c = dir(x, y), k = Math.abs(x - y);
    return { comparison: c, delta: c === "same" ? `repetiste lo de la sesión anterior con ${fmtKg(ta)}` : `hiciste ${numEs(k, false)} ${k === 1 ? "repetición" : "repeticiones"} ${c === "more" ? "más" : "menos"} que la sesión anterior con ${fmtKg(ta)}` };
  }
  const ea = bestE1(a), eb = bestE1(b);
  const c = ea > 0 && eb > 0 ? dir(ea, eb, eb * REL) : dir(ta, tb);
  return { comparison: c, delta: `${ta > tb ? "subiste" : "bajaste"} de ${fmtKg(tb)} a ${fmtKg(ta)}` };
}

/**
 * Marcas de hoy contra la mejor historia previa, con una sola definición para todo REPI: por carga (más kilos que nunca), por
 * repeticiones con una carga (más repeticiones que nunca con esa carga o más), por 1RM estimado (Epley, 1–12 reps); sin carga,
 * por repeticiones; por tiempo, por segundos. Sin historia previa no hay marca (la primera vez no es un récord).
 */
export function detectMarks(today: ReviewSet[], before: PriorMarks | null | undefined, measure: Measure): Mark[] {
  if (!before) return [];
  const a = mainSets(today);
  if (!a.length) return [];
  const marks: Mark[] = [];
  if (measure === "time") {
    const x = Math.max(...a.map((s) => s.r!));
    if (before.bestSec != null && x > before.bestSec) marks.push({ type: "time", value: x, previous: before.bestSec, tie: false, text: `aguantaste ${fmtSeconds(x)}, tu mejor tiempo` });
    return marks;
  }
  if (measure === "reps") {
    const x = Math.max(...a.map((s) => s.r!));
    if (before.bestReps != null && x > before.bestReps) marks.push({ type: "reps", value: x, previous: before.bestReps, tie: false, text: `hiciste ${x} repeticiones en una serie, tu mejor marca` });
    else if (before.bestReps != null && x === before.bestReps) marks.push({ type: "reps", value: x, previous: before.bestReps, tie: true, text: "igualaste tu mejor marca" });
    return marks;
  }
  const top = Math.max(...a.map((s) => s.w ?? 0));
  if (before.maxLoadKg != null && top > before.maxLoadKg) marks.push({ type: "load", value: top, previous: before.maxLoadKg, tie: false, text: `levantaste ${fmtKg(top)}, la carga más alta que registraste` });
  const e = bestE1(a);
  if (before.e1rm != null && e > 0) {
    if (e > before.e1rm) marks.push({ type: "e1rm", value: e, previous: before.e1rm, tie: false, text: "superaste tu mejor marca estimada" });
    else if (Math.abs(e - before.e1rm) < 0.05 && !marks.length) marks.push({ type: "e1rm", value: e, previous: before.e1rm, tie: true, text: "igualaste tu mejor marca" });
  }
  for (const s of a) {
    const prior = before.repsAtLoad.filter((x) => x.w >= (s.w ?? 0) - 0.03).map((x) => x.r);
    if ((s.w ?? 0) > 0 && prior.length && s.r! > Math.max(...prior) && !marks.some((m) => m.type === "reps_at_load")) {
      marks.push({ type: "reps_at_load", value: s.r!, previous: Math.max(...prior), tie: false, text: `hiciste ${s.r} repeticiones con ${fmtKg(s.w!)}, más que nunca con esa carga` });
    }
  }
  const order = { load: 0, e1rm: 1, reps_at_load: 2, reps: 3, time: 4 } as const;
  return marks.sort((x, y) => Number(x.tie) - Number(y.tie) || order[x.type] - order[y.type]);
}

const PROPOSAL_RANK: Record<Proposal["kind"], number> = { deload: 0, review: 1, rest: 2, hold: 3, reps: 4, load: 5 };
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Cierre de la sesión: series hechas contra las previstas, comparación de cada ejercicio con su sesión comparable anterior,
 * marcas, ejercicios omitidos o sin terminar, adaptaciones y una nota prudente para la próxima (no siempre subir: puede ser
 * mantener, sumar repeticiones o revisar con el profe). Todo sale de los datos de entrada; la evidencia dice qué se comparó.
 */
export function sessionReview(input: { at: string; exercises: ReviewExercise[]; adaptations?: string[]; rpe?: number | null; tone?: Tone }): SessionReview {
  const exs: ExerciseReview[] = [];
  const marks: Mark[] = [];
  let planned = 0, done = 0, hard = 0, mainTotal = 0;
  const highlights: string[] = [];
  const sessions = new Map<string, string>();
  for (const e of input.exercises) {
    const m = mainSets(e.sets);
    const measure = measureOf(e);
    planned += e.plannedMain;
    done += e.plannedMain > 0 ? Math.min(m.length, e.plannedMain) : m.length; // series de más no inflan el «de las previstas»
    mainTotal += m.length;
    hard += m.filter((s) => s.rir === 0 || s.feel === "limite" || s.feel === "dificil").length;
    const status: ExerciseReview["status"] = e.skipped || !m.length ? "skipped" : m.length < e.plannedMain ? "partial" : "done";
    // Sin terminar: se dice que quedó sin terminar, no que fue «menos» que la anterior (K1).
    const cmp = status === "partial" ? { comparison: "not_comparable" as const, delta: null }
      : e.previous ? compareWithPrevious(e.sets, e.previous.sets, measure) : { comparison: (e.before ? "not_comparable" : "first") as ExerciseReview["comparison"], delta: null };
    if (e.previous && cmp.comparison !== "not_comparable") sessions.set(e.exercise.name, e.previous.at);
    const mk = status === "skipped" ? null : detectMarks(e.sets, e.before, measure)[0] ?? null;
    if (mk) marks.push(mk);
    const name = (e.substitutedBy ?? e.exercise).name;
    if (mk && highlights.length < 2) highlights.push(`en ${name} ${mk.text}`);
    else if (!mk && cmp.comparison === "more" && cmp.delta && highlights.length < 2) highlights.push(`en ${name} ${cmp.delta}`);
    exs.push({ exerciseId: e.exercise.id, name, status, doneMain: m.length, plannedMain: e.plannedMain, comparison: status === "skipped" ? "not_comparable" : cmp.comparison, delta: cmp.delta, mark: mk });
  }
  const skipped = exs.filter((x) => x.status === "skipped").map((x) => x.name);
  const partial = exs.filter((x) => x.status === "partial").map((x) => x.name);
  const adaptations = [
    ...input.exercises.filter((e) => e.substitutedBy).map((e) => `reemplazaste ${e.exercise.name} por ${e.substitutedBy!.name}`),
    ...(input.adaptations ?? []),
  ];
  const fatigue = (mainTotal > 0 && hard / mainTotal >= 0.5) || (input.rpe != null && input.rpe >= 9);

  // Próxima sesión: la propuesta más prudente de las que trae Training Intelligence; si no hay, una nota según el día.
  // Con fatiga o con trabajo sin hacer no se propone subir carga. La propuesta nombra su ejercicio.
  const cautious = fatigue || skipped.length > 0 || partial.length > 0;
  const props = input.exercises.filter((e) => e.proposal).map((e) => ({ p: e.proposal!, name: (e.substitutedBy ?? e.exercise).name }))
    .sort((a, b) => PROPOSAL_RANK[a.p.kind] - PROPOSAL_RANK[b.p.kind]);
  const chosen = props.find((x) => x.p.kind === "deload" || x.p.kind === "review") ?? (fatigue ? null : props.find((x) => !(cautious && x.p.kind === "load")) ?? null);
  const pick = chosen?.p ?? null;
  const pickText = chosen ? `Para ${chosen.name}: ${chosen.p.text ? chosen.p.text[0].toLowerCase() + chosen.p.text.slice(1) : ""}` : "";
  const next: SessionReview["next"] = pick
    ? { kind: pick.kind, requiresCoach: pick.requiresCoach, text: pick.requiresCoach ? `${pickText} Lo decide tu profe.` : pickText }
    : fatigue ? { kind: "hold", requiresCoach: false, text: "Fue una sesión exigente: la próxima mantené las cargas y priorizá completar el rango con buena técnica." }
      : { kind: "none", requiresCoach: false, text: "La próxima, mantené la programación y buscá repetir o mejorar lo de hoy." };
  const ask = skipped.length || partial.length ? "¿Querés que lo tengamos en cuenta para tu próxima sesión?" : null;

  const lines: string[] = [];
  lines.push(planned > 0 ? `Hoy completaste ${done} de las ${planned} series previstas.` : `Hoy registraste ${done} ${done === 1 ? "serie" : "series"}.`);
  if (highlights.length) lines.push(`${cap(listEs(highlights))}.`);
  const lastEx = exs[exs.length - 1];
  if (lastEx && lastEx.status !== "done" && skipped.length + partial.length === 1) lines.push(`El último ejercicio quedó sin terminar.`);
  else {
    if (skipped.length) lines.push(`${cap(listEs(skipped))} ${skipped.length === 1 ? "quedó" : "quedaron"} sin hacer.`);
    if (partial.length) lines.push(`${cap(listEs(partial))} ${partial.length === 1 ? "quedó" : "quedaron"} sin terminar.`);
  }
  if (adaptations.length) lines.push(`Hoy ${listEs(adaptations)}.`);
  if (!ask || pick) lines.push(next.text);
  if (ask) lines.push(ask);
  const text = input.tone === "breve" ? [lines[0], highlights.length ? lines[1] : null, ask ?? next.text].filter(Boolean).join(" ") : lines.join(" ");

  const compared = [...sessions.entries()];
  const evidence: Evidence = {
    basis: compared.length ? `Comparé cada ejercicio con su sesión comparable anterior: ${compared.map(([n, at]) => `${n} (${fmtArDate(at)})`).join(", ")}.` : "No había sesiones comparables anteriores para comparar.",
    excluded: "Excluí las series anuladas, las de aproximación y las etapas de drop, rest-pause o cluster.",
    sessions: compared.map(([n, at]) => ({ at, label: n })),
    via: "rules",
  };
  return { text, planned, done, exercises: exs, skipped, adaptations, marks, fatigue, next, ask, evidence };
}

// ── Poco tiempo ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type ShortenExercise = {
  exercise: ExerciseRef; sets: number; reps: string; restSec: number; rir?: number | null; detail?: ExerciseDetail | null;
  /** Filas ya registradas hoy (no se omiten nunca). */
  setsDone: number;
  /** Indicación esencial del profe (se conserva primero). */
  essential?: boolean;
  /** Prioridad explícita (menor = más importante). Sin ella, manda el orden del programa (los compuestos suelen ir primero). */
  priority?: number | null;
};
/** Rango de «me quedan N minutos»: el mismo para entender el texto, armar la versión corta y aplicarla (acción apply_short_session). */
export const SHORT_MINUTES = { min: 5, max: 180 } as const;
export type ShortenPlan = { keep: ExerciseRef[]; skip: ExerciseRef[]; note: string; minutesNeeded: number; minutesKept: number; fits: boolean };
const SEC_PER_REP = 3, SET_SETUP_SEC = 10, TRANSITION_SEC = 60, FREE_SET_SEC = 45;

/** Segundos estimados para terminar un ejercicio (filas pendientes × (trabajo + descanso) + cambio de ejercicio). */
export function remainingSeconds(e: ShortenExercise): number {
  const rows = exerciseRows({ sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, detail: e.detail ?? null });
  const left = rows.slice(Math.max(0, e.setsDone));
  if (!left.length) return 0;
  const emom = e.detail?.emomSec ?? null;
  let sec = TRANSITION_SEC;
  for (const r of left) {
    if (emom && r.stage === 0) { sec += emom; continue; }
    const t = parseReps(r.reps);
    const work = r.durationSec ?? (t.kind === "reps" ? t.max * SEC_PER_REP + SET_SETUP_SEC : t.kind === "time" ? t.seconds + SET_SETUP_SEC : FREE_SET_SEC);
    sec += work + Math.max(0, r.restSec ?? 0);
  }
  return sec;
}

/**
 * Versión corta de la sesión de hoy para los minutos que quedan. Conservadora: nunca omite lo que ya tiene series registradas,
 * conserva primero lo esencial del profe y el orden del programa, no parte superseries ni circuitos y no cambia series ni
 * cargas: sólo propone qué ejercicios dejar para otro día. Vale sólo por hoy.
 */
export function shortenSession(plan: { exercises: ShortenExercise[] }, minutesLeft: number, done: string[] = []): ShortenPlan {
  const all = plan.exercises;
  const doneSet = new Set(done);
  const pending = all.filter((e) => e.setsDone < e.sets);
  const need = Math.ceil(pending.reduce((n, e) => n + remainingSeconds(e), 0) / 60);
  if (!Number.isFinite(minutesLeft) || minutesLeft < SHORT_MINUTES.min || minutesLeft > SHORT_MINUTES.max)
    return { keep: pending.map((e) => e.exercise), skip: [], note: `No entendí cuántos minutos te quedan. Decime un número entre ${SHORT_MINUTES.min} y ${SHORT_MINUTES.max}.`, minutesNeeded: need, minutesKept: need, fits: false };
  // Unidades: un ejercicio suelto o un grupo (superserie / circuito) entero.
  const units: { exs: ShortenExercise[]; order: number; inProgress: boolean; essential: boolean; priority: number; sec: number }[] = [];
  const byGroup = new Map<string, number>();
  pending.forEach((e) => {
    const g = e.detail?.group ?? null;
    const order = all.indexOf(e);
    const inProgress = e.setsDone > 0 || doneSet.has(e.exercise.id);
    if (g && byGroup.has(g)) {
      const u = units[byGroup.get(g)!];
      u.exs.push(e); u.inProgress ||= inProgress; u.essential ||= !!e.essential; u.priority = Math.min(u.priority, e.priority ?? Infinity); u.sec += remainingSeconds(e);
      return;
    }
    if (g) byGroup.set(g, units.length);
    units.push({ exs: [e], order, inProgress, essential: !!e.essential, priority: e.priority ?? Infinity, sec: remainingSeconds(e) });
  });
  const ranked = [...units].sort((a, b) => Number(b.inProgress) - Number(a.inProgress) || Number(b.essential) - Number(a.essential) || a.priority - b.priority || a.order - b.order);
  const budget = minutesLeft * 60;
  let used = 0;
  const keepU = new Set<number>();
  for (const u of ranked) {
    const i = units.indexOf(u);
    if (u.inProgress || used + u.sec <= budget) { keepU.add(i); used += u.sec; }
  }
  if (!keepU.size && ranked.length) { const i = units.indexOf(ranked[0]); keepU.add(i); used += ranked[0].sec; }
  const keep = units.filter((_, i) => keepU.has(i)).sort((a, b) => a.order - b.order).flatMap((u) => u.exs.map((e) => e.exercise));
  const skip = units.filter((_, i) => !keepU.has(i)).sort((a, b) => a.order - b.order).flatMap((u) => u.exs.map((e) => e.exercise));
  const kept = Math.ceil(used / 60);
  const fits = used <= budget;
  const names = (xs: ExerciseRef[]) => listEs(xs.map((x) => x.name));
  const note = !skip.length
    ? fits ? `Te alcanza el tiempo: lo que queda lleva unos ${need} minutos.` : `Lo que queda lleva unos ${need} minutos. Lo que ya empezaste no lo corto: terminalo y, si no da, lo dejamos ahí.`
    : `Con ${minutesLeft} minutos conservamos ${names(keep)} y dejamos ${names(skip)} para otro día.${fits ? "" : ` Igual te lleva unos ${kept} minutos: si no llegás, cortá ahí.`} Vale sólo por hoy: tu rutina no cambia.`;
  return { keep, skip, note, minutesNeeded: need, minutesKept: kept, fits };
}

// ── Reemplazos ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export type AltCurrent = { exerciseId: string; name: string; muscleGroup?: string | null; kind?: string | null; pattern?: string | null; equipment?: string | null };
export type AltOption = AltCurrent & { approvedByCoach?: boolean; approvedNote?: string | null; hasHistory?: boolean };
export type AltContext = {
  reason?: "busy" | "no_equipment" | "discomfort" | "dislike" | "no_time" | "other" | null;
  /** Lo que la persona prefiere evitar (nombres o ids). */
  avoids?: string[];
  /** Restricciones vigentes que nombran ejercicios (nombres o ids). */
  restrictions?: string[];
  /** Ejercicios ya hechos o en la sesión (no se repiten). */
  exclude?: string[];
  /** Equipos que se sabe que no están disponibles. */
  unavailableEquipment?: string[];
};
export type Alternative = { exerciseId: string; name: string; why: string; approvedByCoach: boolean };

/**
 * Una o dos alternativas reales para el ejercicio actual, sólo de la lista recibida (nunca inventa máquinas ni supone que
 * están libres). Primero las aprobadas por el entrenador; después las del mismo patrón o grupo muscular con equipo conocido.
 * Descarta lo que la persona evita, lo restringido, lo que usa el mismo equipo ocupado y lo que no se registra igual.
 */
export function rankAlternatives(current: AltCurrent, options: AltOption[], ctx: AltContext = {}): Alternative[] {
  const avoid = (ctx.avoids ?? []).map(norm).filter(Boolean);
  const restricted = (ctx.restrictions ?? []).map(norm).filter(Boolean);
  const exclude = new Set(ctx.exclude ?? []);
  const unavailable = new Set((ctx.unavailableEquipment ?? []).map(norm));
  const matches = (o: AltOption, list: string[]) => list.some((a) => a === norm(o.exerciseId) || norm(o.name).includes(a));
  const sameEquipBlocked = ctx.reason === "busy" || ctx.reason === "no_equipment";
  const scored = options.map((o, i) => {
    if (o.exerciseId === current.exerciseId || exclude.has(o.exerciseId)) return null;
    if (o.kind && current.kind && o.kind !== current.kind) return null;
    if (matches(o, avoid) || matches(o, restricted)) return null;
    if (o.equipment && unavailable.has(norm(o.equipment))) return null;
    if (sameEquipBlocked && o.equipment && current.equipment && norm(o.equipment) === norm(current.equipment)) return null;
    const samePattern = !!o.pattern && !!current.pattern && norm(o.pattern) === norm(current.pattern);
    const sameMuscle = !!o.muscleGroup && !!current.muscleGroup && norm(o.muscleGroup) === norm(current.muscleGroup);
    if (!o.approvedByCoach && !samePattern && !sameMuscle) return null;
    if (!o.approvedByCoach && ctx.reason === "discomfort" && samePattern) return null; // con molestia, no el mismo movimiento
    const score = (o.approvedByCoach ? 100 : 0) + (samePattern ? 20 : 0) + (sameMuscle ? 10 : 0) + (o.hasHistory ? 3 : 0) + (o.equipment ? 2 : 0);
    const why = [
      o.approvedByCoach ? `Tu entrenador lo aprobó como alternativa${o.approvedNote ? `: ${o.approvedNote}` : "."}` : null,
      samePattern ? "Mismo patrón de movimiento." : sameMuscle ? "Trabaja el mismo grupo muscular." : null,
      o.hasHistory ? "Ya lo registraste antes." : null,
    ].filter(Boolean).join(" ");
    return { o, i, score, why };
  }).filter((x): x is NonNullable<typeof x> => !!x);
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 2).map(({ o, why }) => ({ exerciseId: o.exerciseId, name: o.name, why, approvedByCoach: !!o.approvedByCoach }));
}
