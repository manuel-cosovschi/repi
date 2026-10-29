import { describe, expect, it } from "vitest";
import { applySessionAction, clampClientTime, decideSetWrite } from "./sync";

const srv = { id: "a", revision: 2, weightKg: 80, reps: 10, rir: 2 };
describe("decideSetWrite", () => {
  it("inserta si no existe", () => expect(decideSetWrite(null, { id: "a", baseRevision: 0, weightKg: 80, reps: 10, rir: null })).toEqual({ kind: "insert" }));
  it("reintento con los mismos valores es noop aunque la base sea vieja", () => expect(decideSetWrite(srv, { id: "a", baseRevision: 1, weightKg: 80, reps: 10, rir: 2 })).toEqual({ kind: "noop" }));
  it("actualiza si la base coincide", () => expect(decideSetWrite(srv, { id: "a", baseRevision: 2, weightKg: 82.5, reps: 9, rir: 1 })).toEqual({ kind: "update" }));
  it("conflicto si otro dispositivo creó la misma serie con otros valores", () =>
    expect(decideSetWrite(srv, { id: "b", baseRevision: 0, weightKg: 85, reps: 8, rir: null })).toEqual({ kind: "conflict", reason: "other_device" }));
  it("conflicto si la base quedó vieja y los valores difieren", () =>
    expect(decideSetWrite(srv, { id: "a", baseRevision: 1, weightKg: 85, reps: 8, rir: 2 })).toEqual({ kind: "conflict", reason: "stale_base" }));
  it("DATA-8: respuesta perdida y corrección del mismo dispositivo = actualización; si alguien más la editó, conflicto", () => {
    const first = { ...srv, revision: 1 };
    expect(decideSetWrite(first, { id: "a", baseRevision: 0, weightKg: 85, reps: 8, rir: 2 })).toEqual({ kind: "update" });
    expect(decideSetWrite({ ...srv, revision: 2 }, { id: "a", baseRevision: 0, weightKg: 85, reps: 8, rir: 2 })).toEqual({ kind: "conflict", reason: "stale_base" });
  });
});

describe("applySessionAction con hora del cliente", () => {
  const start = new Date("2026-10-26T10:00:00Z");
  const base = { status: "in_progress" as const, activeMs: 0, lastResumedAt: start, startedAt: start };
  it("pausa offline usa la hora real de la pausa", () => {
    expect(applySessionAction(base, "pause", new Date("2026-10-26T10:20:00Z"), true)).toMatchObject({ status: "paused", activeMs: 20 * 60_000 });
  });
  it("un timestamp anterior al inicio no resta tiempo", () => {
    expect(applySessionAction(base, "finish", new Date("2026-10-26T09:00:00Z"), true)).toMatchObject({ status: "completed", activeMs: 0 });
  });
  it("finalizar dos veces no aplica; sin series descarta", () => {
    expect(applySessionAction({ ...base, status: "completed" }, "finish", start, true)).toBeNull();
    expect(applySessionAction(base, "finish", start, false)?.status).toBe("abandoned");
  });
});

describe("clampClientTime", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  it("acepta pasado dentro de 72 h y recorta futuro pequeño", () => {
    expect(clampClientTime("2026-10-25T12:00:00Z", now)).toEqual(new Date("2026-10-25T12:00:00Z"));
    expect(clampClientTime("2026-10-26T12:03:00Z", now)).toEqual(now);
  });
  it("rechaza futuro lejano, muy viejo o inválido", () => {
    expect(clampClientTime("2026-10-26T13:00:00Z", now)).toBe("invalid");
    expect(clampClientTime("2026-10-20T12:00:00Z", now)).toBe("invalid");
    expect(clampClientTime("x", now)).toBe("invalid");
  });
});
