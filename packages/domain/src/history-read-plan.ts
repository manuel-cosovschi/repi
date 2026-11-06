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
