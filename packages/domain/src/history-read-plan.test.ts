import { describe, expect, it } from "vitest";
import { splitHistoryText } from "./history-import";
import { parseHistoryNotes, partitionHistoryNotes } from "./history-notes";
import { buildHistoryReadParts } from "./history-read-plan";

const today = "2026-11-06";

describe("plan de lectura del historial", () => {
  it("agrupa sesiones completas con años resueltos antes de dividir", () => {
    const source = "31/12/2023\nPress 1x5 80kg\n01/01\nRemo 1x10 20kg\n02/01/2024\nPress 1x4 80kg";
    const parts = buildHistoryReadParts(source, today, 256);
    expect(parts).toHaveLength(1);
    expect(parts[0].context).toBe("");
    expect(parseHistoryNotes(parts[0].text, today)?.sets.map((set) => set.day)).toEqual(["2023-12-31", "2024-01-01", "2024-01-02"]);
  });

  it("no separa una sesión que cabe en una parte ni pierde líneas desconocidas", () => {
    const source = "Año 2024\n" + Array.from({ length: 12 }, (_, i) => `${i + 1}/03\nPress variante ${String.fromCharCode(65 + i)} (80kg)\n5;5;5;4${i === 5 ? "\nComentario por interpretar" : ""}`).join("\n");
    const parts = buildHistoryReadParts(source, today, 256);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.text.length <= 256 && part.context === "")).toBe(true);
    expect(parts.map((part) => part.text).join("\n")).toBe(partitionHistoryNotes(source, today)!.blocks.map((block) => block.text).join("\n"));
    expect(parts.every((part) => /^2024-03-\d{2}\n/.test(part.text))).toBe(true);
    expect(parts.map((part) => part.text).join("\n")).toContain("Comentario por interpretar");
  });

  it("divide una sesión gigante sin repetir texto y lleva la fecha y ejercicio como contexto", () => {
    const body = "Press (80kg)\n" + "5;5;5;4\n".repeat(120);
    const parts = buildHistoryReadParts(`2024\n12/03\n${body}`, today, 256);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.text.length <= 256)).toBe(true);
    expect(parts.map((part) => part.text).join("")).toBe(`2024-03-12\n${body}`);
    expect(parts[1].context).toContain("2024-03-12");
    expect(parts[1].context).toContain("Press (80kg)");
  });

  it("mantiene el original y su contexto cuando la cronología no se puede canonicalizar", () => {
    const source = "Mi historial\n31/12\nPress 2x5 80kg\n01/01\nRemo 2x10 20kg\n".repeat(8);
    const parts = buildHistoryReadParts(source, today, 256);
    expect(parts).toEqual(splitHistoryText(source, 256));
    expect(parts.map((part) => part.text).join("")).toBe(source);
    expect(buildHistoryReadParts("", today)).toEqual([]);
    expect(() => buildHistoryReadParts(source, today, 255)).toThrow(RangeError);
  });
});
