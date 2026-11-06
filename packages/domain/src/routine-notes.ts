// Vía rápida de la rutina actual escrita con series explícitas. El historial con fechas y los
// métodos/indicaciones que necesitan interpretación siguen por el lector completo.
import { parseHistoryNotes } from "./history-notes";
import type { ImportedRoutineDay, ImportedRoutineEx } from "./routine-import";

const routineHeading = /^(?:d[ií]a|day)\s+(?:[a-z]|\d{1,2})\s*:?$/i;
const weekdayHeading = /^(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*:?$/i;
// Sólo encabezados de fecha: «2.5 kg» dentro de una prescripción es una carga, no el 2 de mayo.
const actualDate = /^\s*(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|fecha)\s*[,.:–-]?\s*)?(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)(?=\s|:|$)(?!\s*(?:kgs?|kilogramos?|lbs?|libras?|ladrillos?|placas?|bloques?)\b)|^\s*(?:a[nñ]o\s*[:–-]?\s*)?(?:19|20)\d{2}\s*:?$/im;
const needsInterpretation = /\b(?:descanso|rest|pausa|rir|rpe|tempo|drop|myo|cluster|amrap|emom|superserie|biserie|triserie|circuito|pir[aá]mide|fallo)\b/i;

/** Todas las líneas deben corresponder a días, ejercicios y series representables; nunca devuelve una rutina parcial. */
export function parseRoutineNotes(text: string): { days: ImportedRoutineDay[]; notes: string[] } | null {
  if (!text.trim() || actualDate.test(text) || needsInterpretation.test(text)) return null;
  const groups: { name: string; blocks: string[][] }[] = [];
  let day: (typeof groups)[number] | undefined;
  let block: string[] | undefined;
  for (const original of text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    const line = original.trim().replace(/^[•*-]\s+/, "");
    if (!line) continue;
    if (routineHeading.test(line) || weekdayHeading.test(line)) {
      if (day && !day.blocks.length) return null;
      day = { name: line.replace(/:\s*$/, "").trim(), blocks: [] };
      groups.push(day); block = undefined;
      continue;
    }
    if (!day) { day = { name: "Mi rutina", blocks: [] }; groups.push(day); }
    if (/^[\p{L}\p{M}]/u.test(line)) {
      block = [line]; day.blocks.push(block);
    } else {
      if (!block) return null;
      block.push(line);
    }
  }
  if (!groups.length || groups.some((group) => !group.blocks.length)) return null;
  const days: ImportedRoutineDay[] = [];
  const notes = new Set<string>();
  for (const group of groups) {
    const exercises: ImportedRoutineEx[] = [];
    for (const lines of group.blocks) {
      // La fecha sólo habilita el parser de series compartido; nunca se devuelve ni se guarda como sesión histórica.
      const parsed = parseHistoryNotes(`01/01/2000\n${lines.join("\n")}`, "2000-01-01");
      if (!parsed || parsed.sets.length > 10) return null;
      const first = parsed.sets[0];
      if (!first || parsed.sets.some((set) => set.exercise !== first.exercise || set.weightKg !== first.weightKg || set.reps == null || set.seconds != null)) return null;
      // La rutina básica tiene una sola carga por ejercicio; cargas diferentes necesitan el editor de métodos.
      if (first.weightKg != null && first.weightKg > 500) return null;
      const values = parsed.sets.map((set) => set.reps!);
      const reps = values.every((value) => value === values[0]) ? String(values[0]) : values.join("-");
      const note = parsed.notes.join(" · ") || null;
      if (reps.length > 20 || note && note.length > 120) return null;
      exercises.push({ name: first.exercise, sets: values.length, reps, weightKg: first.weightKg, restSec: null, note });
      for (const value of parsed.notes) notes.add(value);
    }
    days.push({ name: group.name, exercises });
  }
  return { days, notes: [...notes] };
}
