import { describe, expect, it } from "vitest";
import { CONSENT_CATALOG } from "@repi/domain";
import { FEATURES, consentOffered, parseFeatures } from "@/lib/features";

// Interruptores por módulo (FEATURE_FLAGS.md): lo incompleto arranca apagado y el override no inventa módulos.
describe("feature flags", () => {
  it("los módulos sin carga real arrancan apagados", () => {
    expect(FEATURES.body.on).toBe(false);
    expect(FEATURES.nutrition.on).toBe(false);
  });
  it("los videos de ejercicios están encendidos desde que el panel los carga (D164)", () => {
    expect(FEATURES.exercise_video.on).toBe(true);
  });
  it("el override enciende, apaga e ignora claves desconocidas", () => {
    expect(parseFeatures(" body , -club, inventado, -")).toEqual({ body: true, club: false });
    expect(parseFeatures(undefined)).toEqual({});
  });
  it("no se ofrece compartir datos de un módulo apagado (D117)", () => {
    const offered = CONSENT_CATALOG.coach_client.filter((c) => consentOffered(c.key)).map((c) => c.key);
    expect(offered).toEqual(["training", "health"]);
  });
});
