// D195 · Historial corregible (bloque 05/06). Reglas puras compartidas por el servidor y el teléfono para corregir, anular y
// restaurar registros ya guardados. Nada acá escribe: decide qué cambió, si es válido y qué hay que confirmar.
// Principios: una corrección nunca borra (anular es reversible), nunca inventa una serie que no se registró, pasa por el mismo
// validador que el registro en vivo (peso decimal exacto ≤ 1000 kg, repeticiones, segundos, RIR 0–5, sensación, nota) y deja
// los valores anteriores para poder explicarla y deshacerla.
import { ACTIVITY_MAX_SEC, activityValuesText, cleanSetMetrics, isActivityProfile, sameMetrics, type MetricsProfile, type SetMetrics } from "./activity";
import { SET_FEEL, type SetFeel } from "./commercial";
import { SET_NOTE_MAX } from "./session-changes";

/** `metrics` (ejercicios por tiempo): velocidad, inclinación, nivel… de una actividad. Opcional: sin él, no se toca. */
export type CorrectableValues = { weightKg: number | null; reps: number | null; rir: number | null; feel: string | null; note: string | null; metrics?: SetMetrics | null };
export type CorrectionField = keyof CorrectableValues;
export const CORRECTION_FIELDS: readonly CorrectionField[] = ["weightKg", "reps", "rir", "feel", "note", "metrics"];
export const CORRECTION_REASON_MAX = 200;
/** Cambio de carga a partir del cual se pide confirmar (un 200 por 100 o un 10 por 100 suelen ser errores de tipeo). */
export const LARGE_CHANGE_RATIO = 0.5;

const WEIGHT_RE = /^\d{1,4}(\.\d{1,2})?$/;
export const MAX_REPS = 200;
export const MAX_TIMED_SEC = 3600;
/** Tope de segundos de una fila por tiempo: 4 horas en una actividad (cinta, bici, remo…), 1 hora en el resto (una plancha). */
export const maxTimedSec = (activity: boolean) => (activity ? ACTIVITY_MAX_SEC : MAX_TIMED_SEC);

export type CorrectionError = { field: CorrectionField | "reason"; message: string };

/**
 * Valida los valores nuevos con las mismas reglas que el registro en vivo. `timed`: la fila son segundos o un total por tiempo.
 * `profile` (ejercicios por tiempo): en una actividad (cinta, bici, remo…) los segundos llegan hasta 4 horas y las métricas se
 * validan con los rangos de su perfil.
 */
export function validateCorrection(v: CorrectableValues, o: { timed: boolean; reason?: string | null; profile?: MetricsProfile | null }): CorrectionError[] {
  const out: CorrectionError[] = [];
  if (v.weightKg != null && (!Number.isFinite(v.weightKg) || v.weightKg < 0 || !WEIGHT_RE.test(String(v.weightKg)) || v.weightKg > 1000))
    out.push({ field: "weightKg", message: "El peso no es válido: hasta 2 decimales, entre 0 y 1000 kg." });
  const activity = isActivityProfile(o.profile);
  // La actividad sólo amplía el tope de tiempo (1 h → 4 h): una fila que cuenta repeticiones (una cinta vieja «3 × 10-12») sigue
  // con el tope de 200, aunque el ejercicio sea una cinta.
  const maxReps = o.timed ? maxTimedSec(activity) : MAX_REPS;
  if (v.reps != null && (!Number.isInteger(v.reps) || v.reps < 0 || v.reps > maxReps))
    out.push({ field: "reps", message: o.timed ? (activity ? "La duración va hasta 4 horas." : "Los segundos no son válidos.") : `Las repeticiones van de 0 a ${MAX_REPS}.` });
  // Una serie corregida a 0 repeticiones no es un resultado: para eso está «Anular serie».
  if (v.reps === 0) out.push({ field: "reps", message: o.timed ? "0 segundos no es una serie hecha: si no la hiciste, anulala." : "0 repeticiones no es una serie hecha: si no la hiciste, anulala." });
  if (v.metrics != null) {
    const m = cleanSetMetrics(o.profile, v.metrics);
    if (!m.ok) out.push({ field: "metrics", message: m.error });
  }
  if (v.rir != null && (!Number.isInteger(v.rir) || v.rir < 0 || v.rir > 5)) out.push({ field: "rir", message: "El RIR va de 0 a 4+." });
  if (v.feel != null && !(v.feel in SET_FEEL)) out.push({ field: "feel", message: "Elegí cómo se sintió la serie." });
  if (v.note != null && v.note.length > SET_NOTE_MAX) out.push({ field: "note", message: `La nota tiene hasta ${SET_NOTE_MAX} caracteres.` });
  if (o.reason != null && o.reason.length > CORRECTION_REASON_MAX) out.push({ field: "reason", message: `El motivo tiene hasta ${CORRECTION_REASON_MAX} caracteres.` });
  return out;
}

export const cleanReason = (s: string | null | undefined) => (s == null ? null : s.trim().replace(/\s+/g, " ").slice(0, CORRECTION_REASON_MAX) || null);

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
const sameField = (f: CorrectionField, a: unknown, b: unknown) => (f === "metrics" ? sameMetrics(a as SetMetrics | null, b as SetMetrics | null) : same(a, b));

/** Sólo los campos que cambian, con su valor anterior y nuevo. null = no hay nada que corregir. */
export function diffValues(before: CorrectableValues, after: Partial<CorrectableValues>) {
  const b: Partial<CorrectableValues> = {}, a: Partial<CorrectableValues> = {};
  for (const f of CORRECTION_FIELDS) {
    if (!(f in after)) continue;
    const nv = after[f] ?? null;
    if (sameField(f, before[f], nv)) continue;
    (b as Record<string, unknown>)[f] = before[f] ?? null;
    (a as Record<string, unknown>)[f] = nv;
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

/** Avisos que piden una confirmación explícita (nunca bloquean una corrección válida). */
export function correctionWarnings(before: CorrectableValues, after: Partial<CorrectableValues>): ("large_load_change" | "large_reps_change")[] {
  const w: ("large_load_change" | "large_reps_change")[] = [];
  const bw = before.weightKg, aw = after.weightKg;
  if (aw !== undefined && bw != null && aw != null && bw > 0 && Math.abs(aw - bw) / bw >= LARGE_CHANGE_RATIO) w.push("large_load_change");
  const br = before.reps, ar = after.reps;
  if (ar !== undefined && br != null && ar != null && br > 0 && Math.abs(ar - br) / br >= LARGE_CHANGE_RATIO && Math.abs(ar - br) >= 4) w.push("large_reps_change");
  return w;
}

/** Texto breve de una corrección para la persona («80 kg × 8 → 85 kg × 8»). Las sensaciones van con su nombre; la nota no se repite. */
export function correctionSummary(c: { before: Partial<CorrectableValues>; after: Partial<CorrectableValues> }, fmtKg: (kg: number) => string): string {
  const parts: string[] = [];
  const v = (f: CorrectionField, x: unknown) => {
    if (x == null) return "—";
    if (f === "weightKg") return fmtKg(Number(x));
    if (f === "rir") return `RIR ${x}`;
    if (f === "feel") return SET_FEEL[x as SetFeel] ?? String(x);
    if (f === "reps") return `${x}`;
    if (f === "metrics") return activityValuesText(x as SetMetrics) || "—";
    return "";
  };
  const label: Record<CorrectionField, string> = { weightKg: "Peso", reps: "Repeticiones", rir: "RIR", feel: "Sensación", note: "Nota", metrics: "Actividad" };
  for (const f of CORRECTION_FIELDS) {
    if (!(f in c.after)) continue;
    if (f === "note") { parts.push("Nota editada"); continue; }
    parts.push(`${label[f]}: ${v(f, c.before[f])} → ${v(f, c.after[f])}`);
  }
  return parts.join(" · ");
}

/** Estado visible de una sesión en el historial (D195). Una anulada no cuenta para nada, pero se puede abrir y restaurar. */
export type HistoryStatus = "completed" | "voided";
export const HISTORY_STATUS_LABEL: Record<HistoryStatus, string> = { completed: "Completada", voided: "Anulada" };

/** Qué acciones permite una sesión según su estado. Las abiertas se editan en la pantalla de entrenamiento, no acá. */
export function historyActions(status: string) {
  if (status === "completed") return { edit: true, voidSession: true, restoreSession: false };
  if (status === "voided") return { edit: false, voidSession: false, restoreSession: true };
  return { edit: false, voidSession: false, restoreSession: false };
}
