import { describe, expect, it } from "vitest";
import { dateIsWritten, datedFromUndated, historyDateEvidence, undatedSessions } from "./history-read-plan";
import { normalizeImport } from "./history-import";

describe("fechas escritas en un historial (incidente 09/11)", () => {
  it("reconoce fechas completas, día y mes, y meses en palabras", () => {
    const ev = historyDateEvidence("2024-03-12\nPress\n15/04/2025\nSentadilla\n3/5\nCurl 10;8\n7 de junio de 2023\n2 mar");
    expect(dateIsWritten("2024-03-12", ev)).toBe(true);
    expect(dateIsWritten("2025-04-15", ev)).toBe(true);
    expect(dateIsWritten("2026-05-03", ev)).toBe(true); // «3/5» sin año: vale el día y el mes
    expect(dateIsWritten("2023-06-07", ev)).toBe(true);
    expect(dateIsWritten("2026-03-02", ev)).toBe(true);
  });
  it("un historial sin fechas no tiene ninguna, aunque tenga pesos, repeticiones y semanas", () => {
    const text = "Semana 1\nDía A\nPress plano (105kg)\n5;5;5;4\nPolea (5 ladrillos) 17;16;13\nSillon MAX 12+drop\nSemana de descarga\n";
    const ev = historyDateEvidence(text);
    expect(ev.count).toBe(0);
    expect(dateIsWritten("2026-11-09", ev)).toBe(false); // la fecha de hoy no se acepta si no está escrita
  });
  it("no toma una fecha que no está escrita, aunque esté cerca", () => {
    const ev = historyDateEvidence("12/03/2024\nPress plano 5;5;5;4");
    expect(dateIsWritten("2024-03-12", ev)).toBe(true);
    expect(dateIsWritten("2024-03-13", ev)).toBe(false);
    expect(dateIsWritten("2026-11-09", ev)).toBe(false);
  });
});

describe("nombres del historial", () => {
  it("unifica nombres que sólo difieren en espacios, tildes o mayúsculas, con la forma más usada", () => {
    const set = (exercise: string, day = "2025-03-12") => ({ day, exercise, weightKg: 10, reps: 10, seconds: null });
    const out = normalizeImport([set("Pull over"), set("Pullover"), set("Pullover", "2025-03-14"), set("Jalon al pecho"), set("Jalón al pecho"), set("Jalón al pecho", "2025-03-14"), set("Remo con barra")], "2026-11-09");
    expect([...new Set(out.sets.map((x) => x.exercise))].sort()).toEqual(["Jalón al pecho", "Pullover", "Remo con barra"]);
    expect(out.summary.exercises).toBe(3);
  });
});

// Con la forma del historial real del incidente (sin fechas, bloques separados por líneas en blanco, pesos con decimales).
const UNDATED = "  \n  \nSentadillas:   \n130kg: 4;3:3:3  \n100kg:6  \nPress militar   \n22kg: 12;10;10;9  \nPolea (5)  \n13;13;13;  \n  \nRemo acostado 70kg  \n8;8;7;8  \n" +
  "Jpc en banco  \n  \n  \nPress banca 90kg  \n7;6;5;4  \nCurl (12.5kg)  \n8-10;8;8;7-10  \n  \nSEMANA DE DESCARGA  \n  \nSentadila 130kg  \n4;3;4;2  \n52.5kg:10;8  \n";
describe("historial sin fechas", () => {
  it("decimales y rangos no cuentan como fechas", () => {
    expect(historyDateEvidence(UNDATED).count).toBe(0);
    expect(historyDateEvidence("Curl (12.5kg)\n8-10;8\n82.5kg:4\nMartillo (17.5)").count).toBe(0);
  });
  it("cada bloque con números es un entrenamiento; las notas sueltas no", () => {
    expect(undatedSessions(UNDATED)).toHaveLength(4);
  });
  it("ubica los entrenamientos en orden hasta el último que indica la persona, según cuántos días por semana entrena", () => {
    const out = datedFromUndated(UNDATED, { last: "2026-11-09", perWeek: 3 });
    expect(out).toMatchObject({ sessions: 4, from: "2026-11-02", to: "2026-11-09" });
    const heads = out.text.split("\n").filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l));
    expect(heads).toEqual(["2026-11-02", "2026-11-04", "2026-11-07", "2026-11-09"]);
    expect(out.text.indexOf("Sentadillas:")).toBeLessThan(out.text.indexOf("Sentadila 130kg"));
    expect(historyDateEvidence(out.text).full.size).toBe(4);
    const rev = datedFromUndated(UNDATED, { last: "2026-11-09", perWeek: 3, newestFirst: true });
    expect(rev.text.indexOf("Sentadila 130kg")).toBeLessThan(rev.text.indexOf("Sentadillas:")); // la lista empieza por el más reciente
  });
});
