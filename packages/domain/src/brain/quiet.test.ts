import { describe, expect, it } from "vitest";
import { addArDays, arDay, arDaysBetween, arInstant, arParts, arWeekStart, endOfArDay, fmtArDate, inQuiet, nextAllowed, parseHm } from "./quiet";

// 2026-11-07T15:00Z = sábado 12:00 en Buenos Aires (UTC−3, sin horario de verano).
const at = (iso: string) => new Date(iso);

describe("quiet · hora de Buenos Aires", () => {
  it.each([
    ["2026-11-07T15:00:00Z", "2026-11-07", 12 * 60, 6],
    ["2026-11-08T02:30:00Z", "2026-11-07", 23 * 60 + 30, 6], // 23:30 AR del sábado (ya es domingo en UTC)
    ["2026-11-08T03:00:00Z", "2026-11-08", 0, 0],
    ["2026-01-01T02:59:00Z", "2025-12-31", 23 * 60 + 59, 3],
  ])("%s → día local %s, minuto %i, día de semana %i", (iso, day, minutes, dow) => {
    const p = arParts(iso);
    expect(p.day).toBe(day);
    expect(p.minutes).toBe(minutes);
    expect(p.dow).toBe(dow);
  });
  it("instante local, fin del día y semana", () => {
    expect(arInstant("2026-11-07", 8 * 60).toISOString()).toBe("2026-11-07T11:00:00.000Z");
    expect(endOfArDay("2026-11-07T15:00:00Z").toISOString()).toBe("2026-11-08T02:59:59.999Z");
    expect(arWeekStart("2026-11-07T15:00:00Z")).toBe("2026-11-02"); // lunes
    expect(arWeekStart("2026-11-09T12:00:00Z")).toBe("2026-11-09");
    expect(addArDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(arDaysBetween("2026-11-01T23:00:00Z", "2026-11-07T15:00:00Z")).toBe(6);
    expect(fmtArDate("2026-10-12T15:00:00Z")).toBe("12/10");
  });
  it("horas válidas e inválidas", () => {
    expect(parseHm("22:00")).toBe(1320);
    expect(parseHm("08:05")).toBe(485);
    for (const bad of ["24:00", "7:00", "22:60", "", null, "aa:bb"]) expect(parseHm(bad as string)).toBeNull();
  });
});

describe("quiet · horario de silencio (caso 47)", () => {
  it.each([
    // [hora UTC, inicio, fin, ¿silencio?]
    ["2026-11-08T01:30:00Z", "22:00", "08:00", true], // 22:30 AR
    ["2026-11-07T10:59:00Z", "22:00", "08:00", true], // 07:59 AR
    ["2026-11-07T11:00:00Z", "22:00", "08:00", false], // 08:00 AR: termina el silencio
    ["2026-11-07T15:00:00Z", "22:00", "08:00", false],
    ["2026-11-08T00:59:00Z", "22:00", "08:00", false], // 21:59 AR
    ["2026-11-07T15:00:00Z", "13:00", "15:00", false], // 12:00 AR, ventana del mismo día
    ["2026-11-07T17:00:00Z", "13:00", "15:00", true],
    ["2026-11-07T15:00:00Z", "10:00", "10:00", false], // inicio = fin: sin silencio
    ["2026-11-07T15:00:00Z", "xx", "08:00", false], // inválido: no silencia
  ])("%s con %s–%s → %s", (iso, s, e, q) => {
    expect(inQuiet(iso, s, e)).toBe(q);
  });
  it("próximo instante permitido: el fin de la ventana, hoy o mañana", () => {
    expect(nextAllowed(at("2026-11-08T01:30:00Z"), "22:00", "08:00").toISOString()).toBe("2026-11-08T11:00:00.000Z"); // 22:30 → 08:00 del domingo
    expect(nextAllowed(at("2026-11-07T09:00:00Z"), "22:00", "08:00").toISOString()).toBe("2026-11-07T11:00:00.000Z"); // 06:00 → 08:00 del mismo día
    expect(nextAllowed(at("2026-11-07T15:00:00Z"), "22:00", "08:00").toISOString()).toBe("2026-11-07T15:00:00.000Z"); // fuera del silencio: ya
    expect(arDay(nextAllowed(at("2026-11-07T17:00:00Z"), "13:00", "15:00"))).toBe("2026-11-07");
  });
});
