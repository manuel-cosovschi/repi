// Planillas para el historial anterior (D140): Excel (.xlsx) y OpenDocument (.ods) se leen en el teléfono y se convierten a
// CSV, que después sigue el camino de siempre (columnas reconocibles sin IA; si no, IA). Sin librerías: un .xlsx/.ods es un
// ZIP con XML; se descomprime con DecompressionStream («deflate-raw»). Numbers y .xls viejos no se leen: se pide exportar.

const MAX_ROWS = 5000;

/** Lee del ZIP sólo las entradas que pide `want` (por nombre). */
export async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Map<string, string>> {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  // Fin del directorio central: firma 0x06054b50 buscada desde el final (puede haber comentario).
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("No es una planilla válida.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = u8.slice(start, start + size);
    if (method === 0) out.set(name, dec.decode(data));
    else if (method === 8) out.set(name, dec.decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()));
  }
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m);
const texts = (xml: string) => [...xml.matchAll(/<(?:t|text:p|text:span)(?:\s[^>]*)?>([\s\S]*?)<\/(?:t|text:p|text:span)>/g)].map((m) => unxml(m[1].replace(/<[^>]+>/g, ""))).join("");

/** Número de serie de Excel (días desde 1899-12-30) a dd/mm/aaaa. */
export function excelDate(serial: number) {
  const d = new Date(Math.round((serial - 25569) * 86_400_000));
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}
const colIndex = (ref: string) => { let n = 0; for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? "") n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

/** Hoja de Excel (XML) a filas, con los textos compartidos ya resueltos. */
export function xlsxSheetRows(sheetXml: string, sharedXml: string | null): string[][] {
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];
  const rows: string[][] = [];
  // Excel escribe las filas vacías como <row …/>: sin contenido, no se mezclan con la siguiente.
  for (const r of sheetXml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const val = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? texts(body) : type === "b" ? (v === "1" ? "VERDADERO" : "FALSO") : unxml(v ?? "");
      const i = ref ? colIndex(ref) : row.length;
      while (row.length < i) row.push("");
      row[i] = val;
    }
    rows.push(row);
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}

/** Hojas de un .ods (content.xml) a filas; respeta celdas y filas repetidas (sin expandir las vacías del final). */
export function odsSheets(contentXml: string): { name: string; rows: string[][] }[] {
  const out: { name: string; rows: string[][] }[] = [];
  for (const t of contentXml.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)) {
    const name = unxml(/table:name="([^"]*)"/.exec(t[1])?.[1] ?? "");
    const rows: string[][] = [];
    for (const r of t[2].matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const row: string[] = [];
      for (const c of (r[2] ?? "").matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
        const rep = Math.min(Number(/table:number-columns-repeated="(\d+)"/.exec(c[1])?.[1] ?? 1), 50);
        const date = /office:date-value="(\d{4})-(\d{2})-(\d{2})/.exec(c[1]);
        const val = date ? `${date[3]}/${date[2]}/${date[1]}` : texts(c[2] ?? "") || unxml(/office:value="([^"]*)"/.exec(c[1])?.[1] ?? "");
        for (let k = 0; k < rep; k++) row.push(val);
      }
      while (row.length && !row[row.length - 1]) row.pop();
      const rep = Math.min(Number(/table:number-rows-repeated="(\d+)"/.exec(r[1])?.[1] ?? 1), row.length ? 50 : 1);
      for (let k = 0; k < rep && rows.length < MAX_ROWS; k++) rows.push(row);
    }
    out.push({ name, rows });
  }
  return out;
}

/** Fechas de Excel: en columnas cuyo encabezado dice fecha/día, los números de serie pasan a dd/mm/aaaa. */
function fixExcelDates(rows: string[][]) {
  const h = rows[0] ?? [];
  const dateCols = h.map((x, i) => (/fecha|date|d[ií]a\b|day/i.test(x) ? i : -1)).filter((i) => i >= 0);
  return rows.map((r, j) => (j === 0 ? r : r.map((x, i) => (dateCols.includes(i) && /^\d{4,5}(\.\d+)?$/.test(x) && +x > 20000 && +x < 80000 ? excelDate(+x) : x))));
}

export function toCsv(rows: string[][]) {
  const clean = rows.filter((r) => r.some((x) => x.trim()));
  return clean.map((r) => r.map((x) => (/[",\n;]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(",")).join("\n");
}

/** Archivo .xlsx/.ods a texto CSV (varias hojas: una detrás de otra con su nombre, para que la IA las lea). */
export async function spreadsheetToCsv(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith(".ods")) {
    const z = await unzip(buf, (n) => n === "content.xml");
    const sheets = odsSheets(z.get("content.xml") ?? "").filter((s) => s.rows.some((r) => r.some(Boolean)));
    return sheets.length === 1 ? toCsv(sheets[0].rows) : sheets.map((s) => `Hoja: ${s.name}\n${toCsv(s.rows)}`).join("\n\n");
  }
  const z = await unzip(buf, (n) => n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheetNames = [...(z.get("xl/workbook.xml") ?? "").matchAll(/<sheet\b[^>]*name="([^"]*)"/g)].map((m) => unxml(m[1]));
  const files = [...z.keys()].filter((n) => n.startsWith("xl/worksheets/")).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  const sheets = files.map((f, i) => ({ name: sheetNames[i] ?? `Hoja ${i + 1}`, rows: fixExcelDates(xlsxSheetRows(z.get(f)!, z.get("xl/sharedStrings.xml") ?? null)) }))
    .filter((s) => s.rows.some((r) => r.some(Boolean)));
  if (!sheets.length) throw new Error("La planilla está vacía.");
  return sheets.length === 1 ? toCsv(sheets[0].rows) : sheets.map((s) => `Hoja: ${s.name}\n${toCsv(s.rows)}`).join("\n\n");
}
