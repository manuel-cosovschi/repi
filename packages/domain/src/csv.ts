// Importación CSV (F-CO-11, D99). Parser sin dependencias para planillas de Excel/Sheets en es-AR: separador «;» (Excel
// en español), «,» o tabulador; comillas con "" escapado, saltos dentro de comillas, CRLF y BOM. Mapeo sugerido por
// encabezado; la validación por fila y la deduplicación final las hace el servidor.

export const CSV_MAX_ROWS = 200;

/** Separador más frecuente fuera de comillas en la primera línea. */
function detectDelimiter(text: string): string {
  const first: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    else if (!q && (ch === "\n" || ch === "\r")) break;
    else if (!q && ch in first) first[ch]++;
  }
  return Object.entries(first).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(first).sort((a, b) => b[1] - a[1])[0][0] : ",";
}

export function parseCsv(input: string): { headers: string[]; rows: string[][] } {
  const text = input.replace(/^﻿/, "");
  const d = detectDelimiter(text);
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  const clean = out.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
  return { headers: clean[0] ?? [], rows: clean.slice(1) };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Columnas sugeridas por encabezado (índice o null). La persona puede corregirlas antes de la vista previa. */
export function guessColumns(headers: string[]) {
  const find = (re: RegExp, not?: RegExp) => { const i = headers.findIndex((h) => re.test(norm(h)) && !(not?.test(norm(h)))); return i < 0 ? null : i; };
  return {
    email: find(/mail|correo/),
    name: find(/^(nombre|name|alumn|client)/, /^(apellido|last)/),
    lastName: find(/apellido|last ?name|surname/, /nombre y apellido/),
  };
}

/** Filas → { name, email } con el mapeo elegido. Nombre = nombre + apellido si hay columna aparte. */
export function mapRows(rows: string[][], cols: { email: number | null; name: number | null; lastName: number | null }) {
  return rows.slice(0, CSV_MAX_ROWS).map((r, i) => ({
    line: i + 2, // +1 por el encabezado, +1 porque las planillas cuentan desde 1
    email: cols.email == null ? "" : (r[cols.email] ?? "").trim(),
    name: [cols.name == null ? "" : r[cols.name] ?? "", cols.lastName == null ? "" : r[cols.lastName] ?? ""].map((x) => x.trim()).filter(Boolean).join(" ").slice(0, 80),
  }));
}
