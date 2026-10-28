import { describe, expect, it } from "vitest";
import { CONNECT_REASONS, connectMetrics, connectNext, connectPriority, connectSort, connectState, fmtMinutes, isConnectReason, mentionsRisk } from "./connect";
import { median } from "./gym";

const A = "prof-a", B = "prof-b";

describe("REPI Connect · estados", () => {
  it("muestra pendiente o asignada según tenga responsable", () => {
    expect(connectState({ status: "open", assigneeUserId: null })).toBe("pendiente");
    expect(connectState({ status: "open", assigneeUserId: A })).toBe("asignada");
    expect(connectState({ status: "in_progress", assigneeUserId: A })).toBe("en_atencion");
    expect(connectState({ status: "follow_up", assigneeUserId: null })).toBe("seguimiento");
    expect(connectState({ status: "pending_acceptance", assigneeUserId: B })).toBe("transferida");
  });

  it("sólo se toma lo que no tiene responsable; tomar algo ajeno informa que ya está tomado", () => {
    expect(connectNext({ status: "open", assigneeUserId: null }, "take", A)).toEqual({ ok: true, status: "open" });
    expect(connectNext({ status: "follow_up", assigneeUserId: null }, "take", A)).toEqual({ ok: true, status: "follow_up" });
    expect(connectNext({ status: "open", assigneeUserId: B }, "take", A)).toEqual({ ok: false, code: "taken" });
    expect(connectNext({ status: "pending_acceptance", assigneeUserId: B }, "take", A)).toEqual({ ok: false, code: "invalid" });
  });

  it("atender, registrar, seguimiento, transferir y resolver exigen que sea propia", () => {
    for (const a of ["start", "note", "follow_up", "transfer", "resolve"] as const) {
      expect(connectNext({ status: "open", assigneeUserId: B }, a, A)).toEqual({ ok: false, code: "not_mine" });
    }
    expect(connectNext({ status: "open", assigneeUserId: A }, "start", A)).toEqual({ ok: true, status: "in_progress" });
    expect(connectNext({ status: "in_progress", assigneeUserId: A }, "follow_up", A)).toEqual({ ok: true, status: "follow_up" });
    expect(connectNext({ status: "follow_up", assigneeUserId: A }, "resolve", A)).toEqual({ ok: true, status: "done" });
    expect(connectNext({ status: "in_progress", assigneeUserId: A }, "transfer", A)).toEqual({ ok: true, status: "pending_acceptance" });
  });

  it("un traspaso lo acepta o rechaza sólo quien lo recibe", () => {
    expect(connectNext({ status: "pending_acceptance", assigneeUserId: B }, "accept", B)).toEqual({ ok: true, status: "open" });
    expect(connectNext({ status: "pending_acceptance", assigneeUserId: B }, "accept", A)).toEqual({ ok: false, code: "invalid" });
    expect(connectNext({ status: "pending_acceptance", assigneeUserId: B }, "resolve", B)).toEqual({ ok: false, code: "invalid" });
  });

  it("cerradas no cambian; el socio cancela sólo antes de que lo atiendan", () => {
    expect(connectNext({ status: "done", assigneeUserId: A }, "cancel", A)).toEqual({ ok: false, code: "closed" });
    expect(connectNext({ status: "cancelled", assigneeUserId: null }, "take", A)).toEqual({ ok: false, code: "closed" });
    expect(connectNext({ status: "open", assigneeUserId: A }, "member_cancel", "socio")).toEqual({ ok: true, status: "cancelled" });
    expect(connectNext({ status: "in_progress", assigneeUserId: A }, "member_cancel", "socio")).toEqual({ ok: false, code: "invalid" });
  });
});

describe("REPI Connect · motivos, prioridad y orden", () => {
  it("cada motivo cae en una categoría existente de la cola", () => {
    expect(Object.keys(CONNECT_REASONS)).toHaveLength(8);
    expect(CONNECT_REASONS.ejercicio.category).toBe("tecnica");
    expect(isConnectReason("rutina_nueva")).toBe(true);
    expect(isConnectReason("urgencia")).toBe(false);
  });

  it("prioridad por reglas visibles: entrenando ahora o rutina nueva es alta", () => {
    expect(connectPriority({ reason: "duda", fromSession: true })).toBe("alta");
    expect(connectPriority({ reason: "rutina_nueva", fromSession: false })).toBe("alta");
    expect(connectPriority({ reason: "duda", fromSession: false })).toBe("media");
  });

  it("ordena traspasos y lo propio antes que la cola libre, y por prioridad y antigüedad", () => {
    const rows = [
      { id: "libre-vieja", status: "open", assigneeUserId: null, priority: "media" as const, createdAt: "2026-10-28T10:00:00Z" },
      { id: "libre-alta", status: "open", assigneeUserId: null, priority: "alta" as const, createdAt: "2026-10-28T11:00:00Z" },
      { id: "traspaso", status: "pending_acceptance", assigneeUserId: A, priority: "media" as const, createdAt: "2026-10-28T12:00:00Z" },
      { id: "atencion", status: "in_progress", assigneeUserId: A, priority: "media" as const, createdAt: "2026-10-28T12:30:00Z" },
    ];
    expect(connectSort(rows).map((r) => r.id)).toEqual(["traspaso", "atencion", "libre-alta", "libre-vieja"]);
  });

  it("detecta palabras de riesgo para reforzar la orientación, sin diagnosticar", () => {
    expect(mentionsRisk("Me duele el hombro en el press")).toBe(true);
    expect(mentionsRisk("Estoy mareado")).toBe(true);
    expect(mentionsRisk("Quiero cambiar el remo")).toBe(false);
  });
});

describe("REPI Connect · métricas", () => {
  const t = (min: number) => new Date(Date.UTC(2026, 9, 28, 10, min));
  it("calcula tiempos sólo con casos medibles y no inventa ceros", () => {
    const m = connectMetrics([
      { status: "done", createdAt: t(0), takenAt: t(4), completedAt: t(20), gymMemberId: "m1", feedback: "yes", transfers: 1, followUps: 1 },
      { status: "done", createdAt: t(0), takenAt: t(10), completedAt: t(40), gymMemberId: "m1", feedback: "no", transfers: 0, followUps: 0 },
      { status: "open", createdAt: t(0), takenAt: null, completedAt: null, gymMemberId: "m2", feedback: null, transfers: 0, followUps: 0 },
      { status: "cancelled", createdAt: t(0), takenAt: null, completedAt: null, gymMemberId: "m3", feedback: null, transfers: 0, followUps: 0 },
    ]);
    expect(m).toMatchObject({ received: 4, resolved: 2, open: 1, cancelled: 1, resolvedPct: 50, firstResponseMedianMin: 7, resolutionMedianMin: 30, transfers: 1, followUps: 1, membersHelped: 1 });
    expect(m.feedback).toEqual({ answered: 2, helpful: 1, helpfulPct: 50 });
    const empty = connectMetrics([]);
    expect(empty.firstResponseMedianMin).toBeNull();
    expect(empty.resolvedPct).toBeNull();
  });

  it("mediana y formato de duración", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
    expect(fmtMinutes(null)).toBe("Sin datos");
    expect(fmtMinutes(12)).toBe("12 min");
    expect(fmtMinutes(185)).toBe("3 h 5 min");
    expect(fmtMinutes(60 * 48)).toBe("2 días");
  });
});
