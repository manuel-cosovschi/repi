// D192 · Flujo de trabajo del entrenador (pedido de Urko, Smart Center Gym): distribuir cargas planificadas por el profe y
// copiar un día completo a otro día, a otro programa del mismo alumno, al de otro alumno o a una plantilla.
//
// Reglas que valen para todo este módulo (funciones puras, las usan el editor y el servidor):
//  · Una distribución de cargas es programación del profe, no una recomendación de Training Intelligence: se calcula sólo
//    cuando el profe la pide, se ve antes de aplicarla y se deshace como cualquier edición. Sólo toca la carga de las series
//    principales elegidas; nunca las etapas (drops, mini series), ni repeticiones, RIR o descansos.
//  · Copiar un día copia programación, nunca resultados: ni sesiones, ni series registradas, ni objetivos o propuestas de
//    Training Intelligence (viven en otras tablas y no viajan). Cada fila copiada recibe una identidad nueva (`spec_id`): el
//    destino arma su propia historia y no se confunde con la del origen. Las cargas y notas del profe viajan sólo si el profe
//    lo elige (para otra persona, por defecto no).
import { GROUP_LETTERS, type ExerciseDetail, type SetSpec } from "./prescription";
import { flatten, mainSets, materialize, newSpecId } from "./stages";
import type { ProgramDoc } from "./training";

// ── Distribuir cargas ──────────────────────────────────────────────────────
export type DistMode = "step_up" | "step_down" | "pct_up" | "pct_down" | "repeat";
export const DIST_MODES: Record<DistMode, string> = {
  step_up: "Subir un valor fijo por serie", step_down: "Bajar un valor fijo por serie",
  pct_up: "Subir un porcentaje por serie", pct_down: "Bajar un porcentaje por serie", repeat: "Mismo peso en todas",
};

/**
 * Cargas en la unidad que usa el profe (kg o lb), una por serie elegida, desde `start`. `step` es un valor fijo; `pct`, el
 * porcentaje sobre la serie anterior. `round` redondea a ese salto (por ejemplo, el del equipo); sin él, a 2 decimales. Nunca
 * baja de 0. Devuelve null si falta un dato.
 */
export function loadSeries(o: { mode: DistMode; start: number | null; step?: number | null; pct?: number | null; count: number; round?: number | null }): number[] | null {
  const n = Math.max(0, Math.min(40, Math.floor(o.count)));
  if (o.start == null || !Number.isFinite(o.start) || o.start < 0 || !n) return null;
  const r = (x: number) => { const v = o.round && o.round > 0 ? Math.round(x / o.round) * o.round : x; return Math.max(0, Math.round(v * 100) / 100); };
  const out: number[] = [];
  if (o.mode === "repeat") return Array.from({ length: n }, () => r(o.start!));
  if (o.mode === "step_up" || o.mode === "step_down") {
    if (o.step == null || !Number.isFinite(o.step) || o.step <= 0) return null;
    for (let i = 0; i < n; i++) out.push(r(o.start + (o.mode === "step_up" ? 1 : -1) * i * o.step));
    return out;
  }
  if (o.pct == null || !Number.isFinite(o.pct) || o.pct <= 0 || o.pct >= 100) return null;
  let v = o.start;
  for (let i = 0; i < n; i++) { out.push(r(v)); v = v * (o.mode === "pct_up" ? 1 + o.pct / 100 : 1 - o.pct / 100); }
  return out;
}

const kgTxt = (n: number | null) => (n == null ? "sin peso" : `${String(Math.round(n * 100) / 100).replace(".", ",")} kg`);

/**
 * Aplica cargas (kg) a la serie principal de los bloques elegidos, en orden (`blocks[i]` recibe `kg[i]`). No toca etapas ni
 * otros campos. Devuelve el detalle nuevo y la lista de cambios (lo que reemplaza una carga ya cargada se dice).
 */
export function setMainLoads(detail: ExerciseDetail, base: { sets: number; reps: string; rir: number | null }, blocks: number[], kg: (number | null)[]): { detail: ExerciseDetail; changes: string[]; replaced: number } {
  const bs = materialize(detail, base);
  const changes: string[] = [];
  let replaced = 0;
  const next = bs.map((b, bi) => {
    const pos = blocks.indexOf(bi);
    if (pos < 0 || pos >= kg.length) return b;
    const w = kg[pos];
    if ((b[0].weightKg ?? null) === (w ?? null)) return b;
    if (b[0].weightKg != null) replaced++;
    changes.push(`Serie ${bi + 1}: ${kgTxt(b[0].weightKg)} → ${kgTxt(w)}.`);
    return [{ ...b[0], weightKg: w }, ...b.slice(1)];
  });
  const technique = detail.technique === "straight" && changes.length && new Set(next.map((b) => b[0].weightKg)).size > 1 ? "custom" : detail.technique;
  return { detail: { ...detail, technique, setPlan: flatten(next) }, changes, replaced };
}

// ── Copiar un día ──────────────────────────────────────────────────────────
export type DayEx = ProgramDoc["days"][number]["exercises"][number];
export type DayDoc = { name: string; exercises: DayEx[] };
export type CopyOptions = {
  /** keep: también las cargas programadas por el profe · strip: sólo la estructura (recomendado para otra persona). */
  weights: "keep" | "strip";
  /** Notas del profe del ejercicio y de cada serie (pueden mencionar a la persona de origen). */
  notes: boolean;
  /** Ejercicios del origen que no se copian (por ejemplo, no disponibles en el destino). */
  skip?: ReadonlySet<string>;
};
export type CopyStats = { exercises: number; rows: number; weightsRemoved: number; notesRemoved: number; skipped: string[]; groups: string[]; methods: string[] };

/**
 * Contenido de un día listo para pegar: mismo orden, series, etapas, métodos, grupos y circuitos; identidades nuevas en cada
 * fila; sin ids de ejercicios del programa de origen. Nunca incluye resultados (no los tiene: sólo lee la programación).
 */
export function copyDayContent(day: DayDoc, o: CopyOptions): { day: DayDoc; stats: CopyStats } {
  const stats: CopyStats = { exercises: 0, rows: 0, weightsRemoved: 0, notesRemoved: 0, skipped: [], groups: [], methods: [] };
  const exercises: DayEx[] = [];
  for (const e of day.exercises) {
    if (o.skip?.has(e.exerciseId)) { stats.skipped.push(e.name); continue; }
    let detail: ExerciseDetail | null = e.detail ? (JSON.parse(JSON.stringify(e.detail)) as ExerciseDetail) : null;
    if (detail?.setPlan) {
      detail.setPlan = detail.setPlan.map((r): SetSpec => {
        const x: SetSpec = { ...r, id: newSpecId() };
        if (o.weights === "strip" && x.weightKg != null) { x.weightKg = null; stats.weightsRemoved++; }
        if (!o.notes && x.note) { x.note = null; stats.notesRemoved++; }
        return x;
      });
      stats.rows += detail.setPlan.length;
    } else stats.rows += e.sets;
    if (detail?.group && !stats.groups.includes(detail.group)) stats.groups.push(detail.group);
    if (detail && detail.technique !== "straight" && !stats.methods.includes(detail.technique)) stats.methods.push(detail.technique);
    const note = o.notes ? e.note ?? null : null;
    if (!o.notes && e.note) stats.notesRemoved++;
    // Sin `id`: el ejercicio de destino es una fila nueva del programa de destino.
    exercises.push({ exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, note, ...(detail ? { detail } : {}) });
    stats.exercises++;
  }
  return { day: { name: day.name, exercises }, stats };
}

export type PasteMode = "append" | "replace" | "new_day";
export const PASTE_MODES: Record<PasteMode, string> = { new_day: "Crear un día nuevo", append: "Agregar al final del día", replace: "Reemplazar el contenido del día" };

/**
 * Pega el contenido en los días de destino. `append` agrega al final y cambia las letras de los grupos copiados que ya se usan
 * en ese día (si no, una superserie copiada se mezclaría con una del destino). `replace` cambia sólo los ejercicios (el día
 * conserva su nombre). `new_day` agrega un día al final con el nombre del origen.
 */
export function pasteDay(days: DayDoc[], content: DayDoc, mode: PasteMode, target: number, maxDays = 14): { ok: true; days: DayDoc[]; day: number; remapped: Record<string, string> } | { ok: false; error: string } {
  if (mode === "new_day") {
    if (days.length >= maxDays) return { ok: false, error: `El programa ya tiene ${maxDays} días: elegí un día existente.` };
    const name = content.name?.trim() || `Día ${days.length + 1}`;
    return { ok: true, days: [...days, { name: name.slice(0, 60), exercises: content.exercises }], day: days.length, remapped: {} };
  }
  if (!Number.isInteger(target) || target < 0 || target >= days.length) return { ok: false, error: "Elegí el día de destino." };
  if (mode === "replace") return { ok: true, days: days.map((d, i) => (i === target ? { ...d, exercises: content.exercises } : d)), day: target, remapped: {} };
  const used = new Set(days[target].exercises.map((e) => e.detail?.group).filter(Boolean) as string[]);
  const incoming = [...new Set(content.exercises.map((e) => e.detail?.group).filter(Boolean) as string[])];
  const free = GROUP_LETTERS.filter((g) => !used.has(g) && !incoming.includes(g));
  const remapped: Record<string, string> = {};
  for (const g of incoming) {
    if (!used.has(g)) continue;
    const to = free.shift();
    if (!to) return { ok: false, error: "No quedan letras de grupo libres en ese día (A–H): pegalo en un día nuevo." };
    remapped[g] = to;
  }
  const exs = content.exercises.map((e) => (e.detail?.group && remapped[e.detail.group] ? { ...e, detail: { ...e.detail, group: remapped[e.detail.group] } } : e));
  return { ok: true, days: days.map((d, i) => (i === target ? { ...d, exercises: [...d.exercises, ...exs] } : d)), day: target, remapped };
}

/** Huella del documento (para detectar que el destino cambió entre la vista previa y la confirmación). */
export function docFingerprint(doc: ProgramDoc): string {
  const s = JSON.stringify(doc);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 + c, 2246822519) ^ (h2 >>> 13); }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}${s.length.toString(16)}`;
}

/** Resumen de un día para la vista previa: «Press banca · 4 series · Top set + back-off · A1». */
export function daySummary(day: DayDoc) {
  // Series principales (D183): los drops y mini series son etapas, no series de más.
  return day.exercises.map((e) => ({ name: e.name, sets: mainSets(e.detail, e.sets), technique: e.detail?.technique ?? "straight", group: e.detail?.group ?? null, weights: (e.detail?.setPlan ?? []).filter((r) => r.weightKg != null).length }));
}
