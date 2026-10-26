import { describe, expect, it } from "vitest";
import { accessRetryAt, coachSeesPain, isAccessItem, scale10, scale5, videoOk } from "./followup";

describe("seguimiento", () => {
  it("escalas", () => {
    expect(scale5(3)).toBe(true); expect(scale5(0)).toBe(false); expect(scale5(2.5)).toBe(false);
    expect(scale10(0)).toBe(true); expect(scale10(11)).toBe(false);
  });
  it("molestia visible al coach sólo con Salud o con el reporte compartido a esa relación", () => {
    expect(coachSeesPain({ sharedWithRelationId: null }, "r1", false)).toBe(false);
    expect(coachSeesPain({ sharedWithRelationId: "r1" }, "r1", false)).toBe(true);
    expect(coachSeesPain({ sharedWithRelationId: "r2" }, "r1", false)).toBe(false);
    expect(coachSeesPain({ sharedWithRelationId: null }, "r1", true)).toBe(true);
  });
  it("ítems de acceso válidos; entrenamientos no se piden (siempre compartidos)", () => {
    expect(isAccessItem("health")).toBe(true);
    expect(isAccessItem("training")).toBe(false);
  });
  it("espera de 7 días tras un rechazo (D38)", () => {
    const denied = new Date("2026-10-20T12:00:00Z");
    expect(accessRetryAt(denied, new Date("2026-10-26T12:00:00Z"))?.toISOString()).toBe("2026-10-27T12:00:00.000Z");
    expect(accessRetryAt(denied, new Date("2026-10-27T12:00:01Z"))).toBeNull();
    expect(accessRetryAt(null, new Date())).toBeNull();
  });
  it("video: tipo y tamaño", () => {
    expect(videoOk("video/mp4", 1000)).toBe(true);
    expect(videoOk("image/png", 1000)).toBe(false);
    expect(videoOk("video/mp4", 61 * 1024 * 1024)).toBe(false);
  });
});
