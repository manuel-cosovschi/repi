import { describe, expect, it } from "vitest";
import { appointmentIcs, arParts, arToUtc, overlaps } from "./agenda";

describe("agenda (F-CO-10)", () => {
  it("hora argentina ↔ UTC y fechas inexistentes", () => {
    expect(arToUtc("2026-10-30", "18:00")!.toISOString()).toBe("2026-10-30T21:00:00.000Z");
    expect(arToUtc("2026-10-30", "23:30")!.toISOString()).toBe("2026-10-31T02:30:00.000Z");
    expect(arParts(new Date("2026-10-31T02:30:00Z"))).toEqual({ date: "2026-10-30", time: "23:30" });
    expect(arToUtc("2026-02-31", "10:00")).toBeNull();
    expect(arToUtc("2026-10-30", "24:00")).toBeNull();
    expect(arToUtc("30/10/2026", "10:00")).toBeNull();
  });
  it("superposición de turnos", () => {
    const a = new Date("2026-10-30T21:00:00Z");
    expect(overlaps(a, 60, new Date("2026-10-30T21:30:00Z"), 60)).toBe(true);
    expect(overlaps(a, 60, new Date("2026-10-30T22:00:00Z"), 60)).toBe(false);
    expect(overlaps(a, 60, new Date("2026-10-30T20:00:00Z"), 60)).toBe(false);
  });
  it("iCalendar con UTC, escapes y cancelación", () => {
    const ics = appointmentIcs({ id: "abc", startsAt: new Date("2026-10-30T21:00:00Z"), durationMin: 45, title: "Sesión con Agustín", place: "Gym Norte, sala 2; piso 1", now: new Date("2026-10-27T12:00:00Z") });
    expect(ics).toContain("DTSTART:20261030T210000Z\r\nDTEND:20261030T214500Z");
    expect(ics).toContain("LOCATION:Gym Norte\\, sala 2\; piso 1");
    expect(ics).toContain("UID:abc@repiclub.com");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(appointmentIcs({ id: "x", startsAt: new Date(), durationMin: 30, title: "t", cancelled: true })).toContain("STATUS:CANCELLED");
  });
});
