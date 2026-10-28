import { describe, expect, it } from "vitest";
import { actionNeedsPresence, distanceM, evaluateGeo, geoDecision, LATE_SYNC_HOURS, membershipState, passCovers, validPolicy } from "./gym-access";

describe("Gym Access · membresía", () => {
  it("evalúa estado y vigencia en el servidor", () => {
    expect(membershipState("active", null, "2026-10-28")).toBe("active");
    expect(membershipState("active", "2026-10-28", "2026-10-28")).toBe("active");
    expect(membershipState("active", "2026-10-27", "2026-10-28")).toBe("expired");
    expect(membershipState("suspended", null, "2026-10-28")).toBe("paused");
    expect(membershipState("ended", null, "2026-10-28")).toBe("cancelled");
    expect(membershipState("pending_consent", null, "2026-10-28")).toBe("pending");
  });
});

describe("Gym Access · política", () => {
  const p = (mode: "open" | "hybrid" | "strict", strictActions: ("gym.assistance.request" | "gym.challenge.attempt")[] = []) => ({ enabled: true, mode, strictActions });
  it("OPEN no exige nada; HYBRID sólo iniciar y registrar; STRICT suma sólo lo configurado", () => {
    expect(actionNeedsPresence(p("open"), "gym.workout.start")).toBe(false);
    expect(actionNeedsPresence(p("hybrid"), "gym.workout.start")).toBe(true);
    expect(actionNeedsPresence(p("hybrid"), "gym.workout.log_set")).toBe(true);
    expect(actionNeedsPresence(p("hybrid"), "gym.assistance.request")).toBe(false);
    expect(actionNeedsPresence(p("strict"), "gym.assistance.request")).toBe(false);
    expect(actionNeedsPresence(p("strict", ["gym.assistance.request"]), "gym.assistance.request")).toBe(true);
    expect(actionNeedsPresence(p("strict", ["gym.assistance.request"]), "gym.challenge.attempt")).toBe(false);
    expect(actionNeedsPresence({ enabled: false, mode: "strict", strictActions: [] }, "gym.workout.start")).toBe(false);
  });
  it("valida rangos y acciones configurables", () => {
    expect(validPolicy({ qrTtlSec: 30, passHours: 3, mode: "hybrid" }).ok).toBe(true);
    expect(validPolicy({ qrTtlSec: 5 }).ok).toBe(false);
    expect(validPolicy({ passHours: 24 }).ok).toBe(false);
    expect(validPolicy({ strictActions: ["gym.workout.start"] }).ok).toBe(false);
  });
});

describe("Gym Access · vigencia del ingreso", () => {
  const issuedAt = new Date("2026-10-28T15:00:00Z"), expiresAt = new Date("2026-10-28T18:00:00Z");
  const pass = { issuedAt, expiresAt, revokedAt: null };
  it("cubre por hora del servidor y, sin conexión, sólo lo hecho dentro de la vigencia y sincronizado a tiempo", () => {
    expect(passCovers(pass, new Date("2026-10-28T16:00:00Z"))).toBe(true);
    expect(passCovers(pass, new Date("2026-10-28T18:00:01Z"))).toBe(false);
    expect(passCovers(pass, new Date("2026-10-28T20:00:00Z"), new Date("2026-10-28T17:30:00Z"))).toBe(true);
    expect(passCovers(pass, new Date("2026-10-28T20:00:00Z"), new Date("2026-10-28T18:30:00Z"))).toBe(false);
    expect(passCovers(pass, new Date(expiresAt.getTime() + (LATE_SYNC_HOURS + 1) * 3_600_000), new Date("2026-10-28T17:30:00Z"))).toBe(false);
    expect(passCovers({ ...pass, revokedAt: new Date() }, new Date("2026-10-28T16:00:00Z"))).toBe(false);
  });
});

describe("Gym Access · ubicación opcional", () => {
  const site = { lat: -34.5889, lng: -58.4108, radiusM: 150 };
  it("distancia y resultado de una lectura", () => {
    expect(Math.round(distanceM(site, { lat: -34.5889, lng: -58.4108 }))).toBe(0);
    expect(evaluateGeo(site, { lat: -34.5890, lng: -58.4109, accuracyM: 20, ageSec: 5 })).toBe("inside");
    expect(evaluateGeo(site, { lat: -34.62, lng: -58.44, accuracyM: 20, ageSec: 5 })).toBe("outside");
    expect(evaluateGeo(site, { lat: -34.5889, lng: -58.4108, accuracyM: 900, ageSec: 5 })).toBe("inaccurate");
    expect(evaluateGeo(site, { lat: -34.5889, lng: -58.4108, accuracyM: 20, ageSec: 600 })).toBe("stale");
    expect(evaluateGeo(site, null)).toBe("unavailable");
  });
  it("con ubicación obligatoria, sin lectura confiable se deriva a validación del equipo", () => {
    expect(geoDecision("required", true, "inside")).toEqual({ ok: true, method: "qr_geo" });
    expect(geoDecision("required", true, "unavailable")).toEqual({ ok: false, reason: "geo_denied" });
    expect(geoDecision("required", true, "outside")).toEqual({ ok: false, reason: "geo_far" });
    expect(geoDecision("optional", true, "unavailable")).toEqual({ ok: true, method: "qr" });
    expect(geoDecision("required", false, null)).toEqual({ ok: true, method: "qr" });
    expect(geoDecision("off", true, "outside")).toEqual({ ok: true, method: "qr" });
  });
});
