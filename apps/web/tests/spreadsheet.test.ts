import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseHistoryCsv } from "@repi/domain";
import { excelDate, odsSheets, spreadsheetToCsv, unzip, xlsxSheetRows } from "@/lib/spreadsheet";

// D140: planillas de Excel y OpenDocument leídas en el teléfono, sin librerías.
function zip(files: Record<string, string>) {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name), raw = Buffer.from(text), data = deflateRawSync(raw);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(raw.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    locals.push(l, n, data); central.push(c, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}
const asFile = (b: Buffer, name: string) => new File([new Uint8Array(b)], name);

const SHARED = `<sst><si><t>Fecha</t></si><si><t>Ejercicio</t></si><si><t>Peso</t></si><si><t>Reps</t></si><si><r><t>Press </t></r><r><t>de banca</t></r></si><si><t>Sentadilla &amp; pausa</t></si></sst>`;
const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2" s="1"><v>45231</v></c><c r="B2" t="s"><v>4</v></c><c r="C2"><v>62.5</v></c><c r="D2"><v>8</v></c></row>
<row r="3"><c r="A3" s="1"><v>45232</v></c><c r="B3" t="s"><v>5</v></c><c r="D3"><v>5</v></c></row>
</sheetData></worksheet>`;

describe("planillas Excel y OpenDocument", () => {
  it("convierte fechas de serie de Excel", () => expect(excelDate(45231)).toBe("01/11/2023"));

  it("lee una hoja de Excel con textos compartidos, celdas vacías y texto enriquecido", () => {
    const rows = xlsxSheetRows(SHEET, SHARED);
    expect(rows[1]).toEqual(["45231", "Press de banca", "62.5", "8"]);
    expect(rows[2]).toEqual(["45232", "Sentadilla & pausa", "", "5"]);
  });

  it("un .xlsx entero queda como CSV que el importador lee sin IA", async () => {
    const f = asFile(zip({ "xl/workbook.xml": `<workbook><sheets><sheet name="Historial" sheetId="1"/></sheets></workbook>`, "xl/sharedStrings.xml": SHARED, "xl/worksheets/sheet1.xml": SHEET }), "mi-historial.xlsx");
    const csv = await spreadsheetToCsv(f);
    expect(csv.split("\n")[1]).toBe("01/11/2023,Press de banca,62.5,8");
    const sets = parseHistoryCsv(csv)!;
    expect(sets[0]).toMatchObject({ day: "2023-11-01", exercise: "Press de banca", weightKg: 62.5, reps: 8 });
  });

  it("un .ods con fechas, celdas repetidas y filas vacías", async () => {
    const content = `<office:document-content><office:body><office:spreadsheet><table:table table:name="Hoja1">
<table:table-row><table:table-cell><text:p>Fecha</text:p></table:table-cell><table:table-cell><text:p>Ejercicio</text:p></table:table-cell><table:table-cell><text:p>Peso</text:p></table:table-cell><table:table-cell><text:p>Reps</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="date" office:date-value="2024-03-05"><text:p>05/03/24</text:p></table:table-cell><table:table-cell><text:p>Remo con barra</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="50"><text:p>50</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="10"><text:p>10</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1000"/></table:table-row>
<table:table-row table:number-rows-repeated="1048000"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>
</table:table></office:spreadsheet></office:body></office:document-content>`;
    expect(odsSheets(content)[0].rows).toHaveLength(3);
    const csv = await spreadsheetToCsv(asFile(zip({ "content.xml": content }), "historial.ods"));
    expect(csv).toBe("Fecha,Ejercicio,Peso,Reps\n05/03/2024,Remo con barra,50,10");
    expect((await unzip(new Uint8Array(zip({ "a.txt": "hola" })).buffer, () => true)).get("a.txt")).toBe("hola");
  });
});
