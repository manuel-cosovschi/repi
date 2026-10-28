import { describe, expect, it } from "vitest";
import { FEATURES, parseFeatures } from "@/lib/features";

// Interruptores por módulo (FEATURE_FLAGS.md): lo incompleto arranca apagado y el override no inventa módulos.
describe("feature flags", () => {
  it("los módulos sin carga real arrancan apagados", () => {
    expect(FEATURES.body.on).toBe(false);
    expect(FEATURES.nutrition.on).toBe(false);
    expect(FEATURES.exercise_video.on).toBe(false);
  });
  it("el override enciende, apaga e ignora claves desconocidas", () => {
    expect(parseFeatures(" body , -club, inventado, -")).toEqual({ body: true, club: false });
    expect(parseFeatures(undefined)).toEqual({});
  });
});
