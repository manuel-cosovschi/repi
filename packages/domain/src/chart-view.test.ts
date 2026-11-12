import { describe, expect, it } from "vitest";
import {
  CHART_DAY_MS as D, clampWindow, dayToMs, ensureVisible, fmtChartDay, fullWindow, gapSegments, isFullWindow, minSpanFor, msToDay,
  navIndex, nearestIndex, niceRound, niceTicks, panWindow, rangeText, sameDayGroups, timeTicks, visibleSlice, windowFromRange,
  yScale, zoomWindow,
} from "./chart-view";

const day = dayToMs;
const full = { x0: day("2026-01-01"), x1: day("2026-12-31") };

describe("ventana", () => {
  it("días a ms y vuelta, sin corrimiento de huso", () => {
    expect(msToDay(day("2026-03-03"))).toBe("2026-03-03");
    expect(day("2026-03-04") - day("2026-03-03")).toBe(D);
  });
  it("todo el período y ventana mínima de 7 días (o el período si es más corto)", () => {
    expect(fullWindow([])).toBeNull();
    expect(fullWindow([day("2026-05-01"), day("2026-02-01"), day("2026-03-01")])).toEqual({ x0: day("2026-02-01"), x1: day("2026-05-01") });
    expect(minSpanFor(full)).toBe(7 * D);
    expect(minSpanFor({ x0: day("2026-01-01"), x1: day("2026-01-04") })).toBe(3 * D);
  });
  it("clamp: no sale del período ni baja de la mínima", () => {
    expect(clampWindow({ x0: full.x0 - 10 * D, x1: full.x0 + 20 * D }, full)).toEqual({ x0: full.x0, x1: full.x0 + 30 * D });
    expect(clampWindow({ x0: full.x1 - 5 * D, x1: full.x1 + 25 * D }, full)).toEqual({ x0: full.x1 - 30 * D, x1: full.x1 });
    const w = clampWindow({ x0: day("2026-06-10"), x1: day("2026-06-11") }, full);
    expect(w.x1 - w.x0).toBe(7 * D);
    expect((w.x0 + w.x1) / 2).toBe((day("2026-06-10") + day("2026-06-11")) / 2);
    expect(clampWindow({ x0: 0, x1: 1e15 }, full)).toEqual(full);
  });
  it("zoom centrado en el ancla y zoom que conserva la posición del ancla (pellizco)", () => {
    const a = day("2026-06-15");
    const z = zoomWindow(full, full, 0.5, { anchor: a, mode: "center" });
    expect(z.x1 - z.x0).toBeCloseTo((full.x1 - full.x0) / 2);
    expect((z.x0 + z.x1) / 2).toBeCloseTo(a);
    const k = zoomWindow(full, full, 0.5, { anchor: a, mode: "keep" });
    expect((a - k.x0) / (k.x1 - k.x0)).toBeCloseTo((a - full.x0) / (full.x1 - full.x0));
    // Cerca del borde, el clamp gana: la ventana no sale del período.
    expect(zoomWindow(full, full, 0.5, { anchor: full.x0, mode: "center" }).x0).toBe(full.x0);
    // Alejar nunca pasa de todo el período; acercar nunca baja de 7 días.
    expect(zoomWindow(z, full, 10)).toEqual(full);
    const tiny = zoomWindow(full, full, 0.0001);
    expect(tiny.x1 - tiny.x0).toBe(7 * D);
  });
  it("desplazar y «ver todo»", () => {
    const w = { x0: day("2026-03-01"), x1: day("2026-04-01") };
    expect(panWindow(w, full, -365 * D)).toEqual({ x0: full.x0, x1: full.x0 + (w.x1 - w.x0) });
    expect(panWindow(w, full, 7 * D)).toEqual({ x0: w.x0 + 7 * D, x1: w.x1 + 7 * D });
    expect(isFullWindow(full, full)).toBe(true);
    expect(isFullWindow(w, full)).toBe(false);
  });
  it("selección con el mouse: en cualquier orden, ensanchada a la mínima", () => {
    expect(windowFromRange(day("2026-04-01"), day("2026-03-01"), full)).toEqual({ x0: day("2026-03-01"), x1: day("2026-04-01") });
    const w = windowFromRange(day("2026-03-01"), day("2026-03-02"), full);
    expect(w.x1 - w.x0).toBe(7 * D);
  });
  it("ensureVisible corre lo mínimo para que el punto entre (con margen)", () => {
    const w = { x0: day("2026-03-01"), x1: day("2026-03-31") };
    expect(ensureVisible(w, full, day("2026-03-15"))).toBe(w);
    const r = ensureVisible(w, full, day("2026-04-10"));
    expect(r.x1 - r.x0).toBe(w.x1 - w.x0);
    expect(r.x1).toBeGreaterThan(day("2026-04-10"));
    const l = ensureVisible(w, full, day("2026-01-01"));
    expect(l.x0).toBe(full.x0);
  });
});

describe("puntos", () => {
  const xs = ["2026-01-05", "2026-01-10", "2026-01-10", "2026-02-01", "2026-06-01"].map(day);
  it("visibles: sólo los de la ventana, bordes incluidos (búsqueda binaria)", () => {
    expect(visibleSlice(xs, { x0: day("2026-01-10"), x1: day("2026-02-01") })).toEqual({ start: 1, end: 4 });
    expect(visibleSlice(xs, { x0: day("2026-03-01"), x1: day("2026-04-01") })).toEqual({ start: 4, end: 4 });
    const many = Array.from({ length: 5000 }, (_, i) => full.x0 + i * 3_600_000);
    expect(visibleSlice(many, { x0: many[100], x1: many[249] })).toEqual({ start: 100, end: 250 });
  });
  it("mismo día: se separan en orden estable y cuentan los registros del día", () => {
    expect(sameDayGroups(xs)).toEqual([
      { offset: 0, count: 1 }, { offset: -0.5, count: 2 }, { offset: 0.5, count: 2 }, { offset: 0, count: 1 }, { offset: 0, count: 1 },
    ]);
    expect(sameDayGroups(["a", "a", "a"]).map((g) => g.offset)).toEqual([-1, 0, 1]);
  });
  it("tramos de más de 8 semanas: punteados (sin inventar puntos)", () => {
    expect(gapSegments(xs)).toEqual([false, false, false, true]);
    expect(gapSegments([day("2026-01-01"), day("2026-02-26")])).toEqual([false]); // 56 días justos: no
    expect(gapSegments([])).toEqual([]);
  });
  it("punto más cercano a un toque: binaria, 2D y con distancia máxima", () => {
    const px = [10, 40, 48, 90, 200];
    const py = [50, 50, 10, 50, 50];
    expect(nearestIndex(px, 43)).toBe(1);
    expect(nearestIndex(px, 43, { ys: py, ty: 12 })).toBe(2);
    expect(nearestIndex(px, 150, { maxDist: 24 })).toBe(-1);
    expect(nearestIndex(px, 500)).toBe(4);
    expect(nearestIndex(px, -50)).toBe(0);
    expect(nearestIndex([], 3)).toBe(-1);
    // Corrimiento del mismo día: casi ordenado; con slack encuentra el verdadero.
    expect(nearestIndex([100, 96, 104], 95, { slack: 8 })).toBe(1);
    const big = Array.from({ length: 10_000 }, (_, i) => i * 0.3);
    expect(nearestIndex(big, 1500.1)).toBe(5000);
  });
  it("teclado: siguiente/anterior, primero/último; sin selección arranca por lo visible", () => {
    const vis = { start: 3, end: 7 };
    expect(navIndex(null, "next", 10, vis)).toBe(3);
    expect(navIndex(null, "prev", 10, vis)).toBe(6);
    expect(navIndex(5, "next", 10, vis)).toBe(6);
    expect(navIndex(9, "next", 10, vis)).toBe(9);
    expect(navIndex(0, "prev", 10, vis)).toBe(0);
    expect(navIndex(4, "first", 10, vis)).toBe(0);
    expect(navIndex(4, "last", 10, vis)).toBe(9);
    expect(navIndex(null, "next", 0, vis)).toBeNull();
    expect(navIndex(null, "prev", 10, { start: 4, end: 4 })).toBe(3);
  });
});

describe("escala vertical", () => {
  it("divisiones redondas", () => {
    expect(niceRound(2.4)).toBe(2.5);
    expect(niceRound(0.13)).toBe(0.1);
    expect(niceRound(7)).toBe(5);
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(67.7, 74.8)).toEqual([66, 68, 70, 72, 74, 76]);
    expect(niceTicks(0.1, 0.3).every((v) => String(v).length < 6)).toBe(true);
  });
  it("70 → 72,5 kg: se ve el cambio sin exagerarlo (rango mínimo 10 % del valor medio)", () => {
    const s = yScale([70, 72.5]);
    expect(s.minSpan).toBeCloseTo(7.125);
    expect(s.hi - s.lo).toBeGreaterThanOrEqual(7.125);
    expect(s.lo).toBeLessThanOrEqual(70);
    expect(s.hi).toBeGreaterThanOrEqual(72.5);
    expect((72.5 - 70) / (s.hi - s.lo)).toBeLessThan(0.4);
  });
  it("rango mínimo: 2 × la menor diferencia o 1 unidad", () => {
    expect(yScale([3, 4]).minSpan).toBe(2); // 2 × 1
    expect(yScale([5, 5]).minSpan).toBe(1);
    expect(yScale([0.2, 0.25]).minSpan).toBe(1);
  });
  it("valores no negativos: el rango no baja de cero", () => {
    const s = yScale([0.5]);
    expect(s.lo).toBe(0);
  });
  it("desde cero y meta", () => {
    expect(yScale([70, 72.5], { fromZero: true }).lo).toBe(0);
    const near = yScale([80, 82], { target: 76 });
    expect(near.targetIn).toBe(true);
    expect(near.lo).toBeLessThanOrEqual(76);
    const far = yScale([80, 82], { target: 20 });
    expect(far.targetIn).toBe(false);
    expect(far.lo).toBeGreaterThan(20);
  });
  it("sin puntos visibles: usa los extra (vecinos) o la meta", () => {
    expect(yScale([], { extra: [50, 60] }).lo).toBeLessThanOrEqual(50);
    expect(yScale([], { target: 76 }).targetIn).toBe(true);
  });
});

describe("eje X y anuncio", () => {
  it("días en ventanas cortas, con lunes o meses al alejar", () => {
    const d = timeTicks(day("2026-03-02"), day("2026-03-08"), { maxTicks: 8, refYear: 2026 });
    expect(d.map((t) => t.label)).toEqual(["2 mar", "3 mar", "4 mar", "5 mar", "6 mar", "7 mar", "8 mar"]);
    const w = timeTicks(day("2026-03-01"), day("2026-04-30"), { maxTicks: 6, refYear: 2026 });
    expect(w[0].unit).toBe("week");
    expect(w.every((t) => new Date(t.ms).getUTCDay() === 1)).toBe(true);
    const m = timeTicks(day("2026-01-15"), day("2026-12-20"), { maxTicks: 6, refYear: 2026 });
    expect(m.map((t) => t.label)).toEqual(["mar", "may", "jul", "sept", "nov"]);
    expect(m.length).toBeLessThanOrEqual(6);
  });
  it("con año cuando la ventana cruza de año", () => {
    const t = timeTicks(day("2025-11-01"), day("2026-02-28"), { maxTicks: 6, refYear: 2026 });
    expect(t.map((x) => x.label)).toEqual(["nov 2025", "dic", "ene 2026", "feb"]);
    const y = timeTicks(day("2019-06-01"), day("2026-06-01"), { maxTicks: 5 });
    expect(y.every((x) => /^\d{4}$/.test(x.label))).toBe(true);
    expect(y.length).toBeLessThanOrEqual(5);
  });
  it("un solo día", () => {
    expect(timeTicks(day("2026-03-03"), day("2026-03-03"), { refYear: 2026 })).toEqual([{ ms: day("2026-03-03"), label: "3 mar", unit: "day" }]);
    expect(fmtChartDay(day("2026-09-03"), true)).toBe("3 sept 2026");
  });
  it("rango visible anunciado", () => {
    expect(rangeText(day("2026-03-03"), day("2026-06-12"), 14, 2026)).toBe("Mostrando del 3 mar al 12 jun · 14 registros");
    expect(rangeText(day("2025-12-20"), day("2026-01-10"), 1, 2026)).toBe("Mostrando del 20 dic 2025 al 10 ene 2026 · 1 registro");
    expect(rangeText(day("2025-03-03"), day("2025-06-12"), 0, 2026)).toBe("Mostrando del 3 mar al 12 jun 2025 · sin registros en este tramo");
    expect(rangeText(day("2026-03-03"), day("2026-03-03"), 1, 2026)).toBe("Mostrando el 3 mar · 1 registro");
  });
});
