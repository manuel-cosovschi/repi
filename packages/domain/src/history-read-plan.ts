import { splitHistoryText, type HistoryTextChunk } from "./history-import";
import { partitionHistoryNotes } from "./history-notes";

/** Bloques acotados con fechas completas; una continuación conserva su fecha y ejercicio en contexto. */
export function buildHistoryReadParts(text: string, today: string, maxChars = 12_000): HistoryTextChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 256) throw new RangeError("El tamaño de bloque debe ser un entero de al menos 256 caracteres.");
  const partitioned = partitionHistoryNotes(text, today);
  if (!partitioned) return splitHistoryText(text, maxChars);
  const parts: HistoryTextChunk[] = [];
  let pending = "";
  const flush = () => {
    if (pending) parts.push({ text: pending, context: "" });
    pending = "";
  };
  for (const block of partitioned.blocks) {
    if (block.text.length > maxChars) {
      flush();
      parts.push(...splitHistoryText(block.text, maxChars));
    } else {
      if (pending && pending.length + 1 + block.text.length > maxChars) flush();
      pending += `${pending ? "\n" : ""}${block.text}`;
    }
  }
  flush();
  return parts;
}

// ── Fechas escritas en el historial (incidente 09/11) ────────────────────────────────────────────────────────────────
// Un historial sin fechas no puede ubicarse en el tiempo. La lectura automática llegó a ponerle la fecha del día de la
// importación a miles de series. Regla: una serie importada sólo se acepta si su fecha (o su día y mes) está escrita en el texto.
const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const okDay = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
export type HistoryDateEvidence = { full: Set<string>; monthDay: Set<string>; count: number };

/**
 * Fechas que aparecen escritas en el texto: completas (AAAA-MM-DD) y día-mes sin año (MM-DD). Estricto a propósito: «12.5kg» u
 * «8-10» (rango de repeticiones) no son fechas. Vale una fecha con año (12/03/2024, 2024-03-12), un mes en palabras
 * («7 de junio») o un día-mes con barra en una línea propia («12/3», «Lunes 12/3:»).
 */
export function historyDateEvidence(text: string): HistoryDateEvidence {
  const full = new Set<string>(), monthDay = new Set<string>();
  let count = 0;
  const add = (y: number | null, m: number, d: number) => {
    if (!okDay(m, d)) return;
    count++;
    monthDay.add(`${pad(m)}-${pad(d)}`);
    if (y != null && y >= 1990 && y <= 2100) full.add(`${y}-${pad(m)}-${pad(d)}`);
  };
  for (const x of text.matchAll(/(?<![\d.])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d.]*\d)/g)) add(Number(x[1]), Number(x[2]), Number(x[3]));
  for (const x of text.matchAll(/(?<![\d/.-])(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?![\d/.-]*\d)(?!\s*kg)/gi)) {
    add(x[4].length === 2 ? 2000 + Number(x[4]) : Number(x[4]), Number(x[3]), Number(x[1]));
  }
  for (const line of text.split(/\r\n|\r|\n/)) {
    const x = /^\s*(?:[a-záéíóúñ]+\.?,?\s+)?(\d{1,2})\/(\d{1,2})\s*[:.\-–]?\s*$/i.exec(line);
    if (x) add(null, Number(x[2]), Number(x[1]));
  }
  // El mes, completo o abreviado y en la misma línea: «4\nMartillo» no es el 4 de marzo.
  for (const x of text.matchAll(/(?<![\d.])(\d{1,2})[ \t]*(?:de[ \t]+)?(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\.?(?![a-záéíóúñ])(?:[ \t]*(?:de|del)?[ \t]*(\d{4}))?/gi)) {
    add(x[3] ? Number(x[3]) : null, MONTHS[x[2].toLowerCase().slice(0, 3)], Number(x[1]));
  }
  return { full, monthDay, count };
}

/** true si la fecha `day` (AAAA-MM-DD) está escrita en el historial (completa, o su día y mes si allí no figura el año). */
export function dateIsWritten(day: string, ev: HistoryDateEvidence) {
  return ev.full.has(day) || ev.monthDay.has(day.slice(5));
}

/** Mensaje cuando el historial no tiene ninguna fecha: no se lee ni se carga nada. */
export const NO_DATES_MESSAGE = "Tu historial no tiene fechas. Para cargarlo a tu progreso, REPI necesita la fecha de cada entrenamiento escrita arriba de ese día (por ejemplo «12/03» o «12/03/2025»). REPI no inventa fechas: no se cargó nada.";

// ── Historial sin fechas: fechas aproximadas que elige la persona (09/11) ───────────────────────────────────────────────
// Muchas personas anotan sus entrenamientos sin fecha, uno debajo del otro. REPI no las inventa: la persona dice cuándo fue el
// último y cuántos días por semana entrenaba, y cada entrenamiento (un bloque separado por líneas en blanco, con números) se
// ubica en orden. La vista previa y lo cargado quedan marcados como fechas aproximadas.
export type ApproxDates = { last: string; perWeek: number; newestFirst?: boolean };
const isoAdd = (iso: string, days: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };

/** Bloques de entrenamiento de un texto sin fechas: grupos de líneas sin líneas en blanco que tienen algún número. */
export function undatedSessions(text: string): string[] {
  return text.split(/(?:\r?\n[ \t]*){2,}/).map((b) => b.replace(/^\s*\n|\s+$/g, "")).filter((b) => /\d/.test(b));
}

/** El mismo texto con una fecha AAAA-MM-DD arriba de cada entrenamiento, de la más vieja a la más nueva. */
export function datedFromUndated(text: string, o: ApproxDates): { text: string; sessions: number; from: string | null; to: string | null } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.last) || !Number.isInteger(o.perWeek) || o.perWeek < 1 || o.perWeek > 7) throw new RangeError("Fecha o frecuencia inválida.");
  const blocks = undatedSessions(text);
  const ordered = o.newestFirst ? [...blocks].reverse() : blocks;
  const n = ordered.length;
  const step = 7 / o.perWeek;
  const days = ordered.map((_, k) => isoAdd(o.last, -Math.round((n - 1 - k) * step)));
  return { text: ordered.map((b, k) => `${days[k]}\n${b}`).join("\n\n"), sessions: n, from: days[0] ?? null, to: days.at(-1) ?? null };
}
