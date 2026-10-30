import { describe, expect, it } from "vitest";
import {
  bandsCovered, coverage, gymOpenAt, shiftAutoEnd, deliveryState, floorActionAllowed, gymCan, median, mentionsHealth, per10h, ratio, REVIEW_MIN_N, reviewAggregate, shiftHours, workoutAutoClose,
} from "./gym";

describe("capacidades por rol (matriz 06)", () => {
  it("entrenador de sala trabaja en sala pero no modera ni ve reseñas con nombre", () => {
    expect(gymCan(["floor_trainer"], "floor.work")).toBe(true);
    expect(gymCan(["floor_trainer"], "reviews.moderate")).toBe(false);
    expect(gymCan(["floor_trainer"], "reviews.read_named")).toBe(false);
  });
  it("gerente modera y reasigna pero no trabaja la cola ni lee mensajes de sala", () => {
    expect(gymCan(["manager"], "reviews.moderate")).toBe(true);
    expect(gymCan(["manager"], "task.reassign")).toBe(true);
    expect(gymCan(["manager"], "floor.work")).toBe(false);
    expect(gymCan(["manager"], "messages.floor")).toBe(false);
  });
  it("recepción sólo crea tareas y aprueba altas; la unión de roles suma", () => {
    expect(gymCan(["reception"], "member.read")).toBe(false);
    expect(gymCan(["reception", "floor_trainer"], "member.read")).toBe(true);
  });
});

describe("turno (D08)", () => {
  it("sin turno ni permiso fuera de turno no se actúa; con permiso queda marcado", () => {
    expect(floorActionAllowed({ shiftActive: false, afterHoursAccess: false })).toEqual({ ok: false });
    expect(floorActionAllowed({ shiftActive: false, afterHoursAccess: true })).toEqual({ ok: true, offShift: true });
    expect(floorActionAllowed({ shiftActive: true, afterHoursAccess: false })).toEqual({ ok: true, offShift: false });
  });
  it("horas y franjas de cada código", () => {
    expect(shiftHours("M")).toBe(6);
    expect(shiftHours("T")).toBe(5);
    expect(shiftHours("N")).toBe(5);
    expect(bandsCovered("P")).toEqual(["M"]);
    expect(bandsCovered("F")).toEqual(["M", "T"]); // 9 a 15 cubre media mañana y más de media tarde
  });
  it("D158: el gimnasio abre de 6 a 22 y un turno olvidado termina solo al cierre", () => {
    const at = (iso: string) => new Date(iso);
    expect(gymOpenAt(at("2026-10-29T06:00:00-03:00"))).toBe(true);
    expect(gymOpenAt(at("2026-10-29T21:59:00-03:00"))).toBe(true);
    expect(gymOpenAt(at("2026-10-29T22:00:00-03:00"))).toBe(false);
    expect(gymOpenAt(at("2026-10-29T05:59:00-03:00"))).toBe(false);
    const start = at("2026-10-29T17:30:00-03:00");
    expect(shiftAutoEnd(start, at("2026-10-29T21:00:00-03:00"))).toBeNull();
    expect(shiftAutoEnd(start, at("2026-10-29T22:01:00-03:00"))).toEqual(at("2026-10-29T22:00:00-03:00"));
    expect(shiftAutoEnd(start, at("2026-10-30T09:00:00-03:00"))).toEqual(at("2026-10-29T22:00:00-03:00")); // al día siguiente, igual al cierre
    // Abierto fuera de horario (antes de la regla): termina ya, sin sumar horas.
    expect(shiftAutoEnd(at("2026-10-29T05:00:00-03:00"), at("2026-10-29T05:30:00-03:00"))).toEqual(at("2026-10-29T05:30:00-03:00"));
    expect(shiftAutoEnd(at("2026-10-29T23:00:00-03:00"), at("2026-10-29T23:10:00-03:00"))).toEqual(at("2026-10-29T23:00:00-03:00"));
  });
  it("D160: un entrenamiento abierto se cierra solo a las 22 en el gym o tras 6 horas sin actividad", () => {
    const at = (iso: string) => new Date(iso);
    const start = at("2026-10-30T20:00:00-03:00");
    const gym = { startedAt: start, lastActivityAt: at("2026-10-30T21:40:00-03:00"), gymHours: true };
    expect(workoutAutoClose(gym, at("2026-10-30T21:50:00-03:00"))).toBe(false);
    expect(workoutAutoClose(gym, at("2026-10-30T22:00:00-03:00"))).toBe(true);
    // Con un coach (sin horario de gym) sigue abierto de noche, pero no más de 6 horas sin actividad.
    expect(workoutAutoClose({ ...gym, gymHours: false }, at("2026-10-30T23:30:00-03:00"))).toBe(false);
    expect(workoutAutoClose({ ...gym, gymHours: false }, at("2026-10-31T03:40:00-03:00"))).toBe(true);
  });
  it("cobertura detecta huecos y no exige la noche del domingo", () => {
    const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const { gaps } = coverage([["M", "M", "M", "M", "M", null, null], ["T", "T", "T", "T", "T", null, null], ["N", "N", "N", "N", null, null, null]], days);
    expect(gaps).toContain("Vie noche");
    expect(gaps).toContain("Sáb mañana");
    expect(gaps).not.toContain("Dom noche");
  });
});

describe("reseñas (DEC-07/08)", () => {
  const r = (stars: number, status: "published" | "removed" = "published") => ({ stars, dims: [stars, null, stars], status });
  it("n = 0 y n = 1: sin promedio", () => {
    expect(reviewAggregate([])).toMatchObject({ n: 0, avg: null, lowSample: true });
    expect(reviewAggregate([r(5)])).toMatchObject({ n: 1, avg: null, lowSample: true });
  });
  it(`con ${REVIEW_MIN_N} se muestra promedio; las retiradas no cuentan`, () => {
    const rows = [r(5), r(4), r(5), r(4), r(5), r(1, "removed")];
    const a = reviewAggregate(rows);
    expect(a.n).toBe(5);
    expect(a.avg).toBe(4.6);
    expect(a.dist.find((d) => d.stars === 1)!.n).toBe(0);
    expect(a.dims[1].avg).toBeNull(); // dimensión sin datos
  });
  it("moderar recalcula: retirar una baja el n por debajo del umbral", () => {
    const rows = [r(5), r(4), r(5), r(4), r(1)];
    expect(reviewAggregate(rows).avg).toBe(3.8);
    rows[4] = r(1, "removed");
    expect(reviewAggregate(rows)).toMatchObject({ n: 4, avg: null });
  });
});

describe("métricas sin convertir ausente en cero", () => {
  it("mediana, cociente y por 10 h", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(ratio(1, 0)).toBeNull();
    expect(per10h(5, 0)).toBeNull();
    expect(per10h(12, 24)).toBe(5);
    expect(per10h(1, 0.1)).toBeNull(); // muestra insuficiente de horas
  });
});

describe("mensajería y textos", () => {
  it("estado de entrega: enviado → entregado → leído", () => {
    const t = new Date("2026-10-26T12:00:00Z");
    expect(deliveryState(t, [{ deliveredAt: null, readAt: null }])).toBe("sent");
    expect(deliveryState(t, [{ deliveredAt: new Date("2026-10-26T12:01:00Z"), readAt: null }])).toBe("delivered");
    expect(deliveryState(t, [{ deliveredAt: new Date("2026-10-26T12:01:00Z"), readAt: new Date("2026-10-26T12:02:00Z") }])).toBe("read");
    expect(deliveryState(t, [{ deliveredAt: new Date("2026-10-26T11:00:00Z"), readAt: new Date("2026-10-26T11:00:00Z") }])).toBe("sent");
  });
  it("detecta menciones de salud en resúmenes", () => {
    expect(mentionsHealth("Tiene dolor lumbar")).toBe(true);
    expect(mentionsHealth("Quiere pasar de 3 a 4 días")).toBe(false);
  });
});
