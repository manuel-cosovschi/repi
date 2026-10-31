import { describe, expect, it } from "vitest";
import { fmtWeeklyHours, inWeeklyHours, slotOn, weeklyHoursOk } from "./gym";

describe("horario habitual del profesor (D170)", () => {
  const h = { days: [1, 2, 3, 4, 5], from: "16:00", to: "20:00" };
  it("valida días y franja", () => {
    expect(weeklyHoursOk(h)).toBe(true);
    expect(weeklyHoursOk({ ...h, days: [] })).toBe(false);
    expect(weeklyHoursOk({ ...h, from: "20:00", to: "16:00" })).toBe(false);
    expect(weeklyHoursOk({ ...h, from: "24:00" })).toBe(false);
  });
  it("dentro y fuera de la franja, hora AR", () => {
    expect(inWeeklyHours(h, new Date("2026-10-30T19:00:00Z"))).toBe(true); // viernes 16:00 AR
    expect(inWeeklyHours(h, new Date("2026-10-30T23:00:00Z"))).toBe(false); // viernes 20:00 AR: ya terminó
    expect(inWeeklyHours(h, new Date("2026-10-31T20:00:00Z"))).toBe(false); // sábado
    expect(slotOn(h, new Date("2026-10-30T20:00:00Z")).end.toISOString()).toBe("2026-10-30T23:00:00.000Z");
  });
  it("texto", () => {
    expect(fmtWeeklyHours(h)).toBe("Lun a vie · 16 a 20 h");
    expect(fmtWeeklyHours({ days: [5, 1, 3], from: "06:30", to: "12:00" })).toBe("Lun, mié y vie · 6:30 a 12 h");
    expect(fmtWeeklyHours({ days: [0, 1, 2, 3, 4, 5, 6], from: "06:00", to: "12:00" })).toBe("Todos los días · 6 a 12 h");
  });
});
