// Regresión de /conoce 4.0 («Cada serie deja un dato», 13/11/2026): la rueda por dígito de Roll sólo se usa entre valores de
// la misma forma. Entre textos distintos, cada letra vieja quedaba dibujada en la caja de la letra nueva de la misma
// posición y se recortaba («62,5 kg × 6» → «8 sesiones» mostraba «62, 5 IG» partido); ahora cambia el bloque entero.
import { describe, expect, it } from "vitest";
import { sameShape } from "@/components/conoce/x3/Roll";

describe("Roll · cuándo rueda cada dígito", () => {
  it("mismo largo y sólo cambian dígitos: rueda por dígito (el contador de repeticiones)", () => {
    expect(sameShape("62,5 kg × 1", "62,5 kg × 2")).toBe(true);
    expect(sameShape("+7,5 kg", "+9,5 kg")).toBe(true);
    expect(sameShape("60 kg × 10", "60 kg × 10")).toBe(true);
  });
  it("largo distinto, letras distintas o un dígito contra una letra: cambia el bloque entero", () => {
    expect(sameShape("62,5 kg × 6", "8 sesiones")).toBe(false);
    expect(sameShape("8 sesiones", "+10 kg")).toBe(false);
    expect(sameShape("+10 kg", "Vos y tu equipo")).toBe(false);
    expect(sameShape("La serie que registraste", "Se suma a tu historial")).toBe(false);
    expect(sameShape("62,5 kg × 9", "62,5 kg × 10")).toBe(false);
    expect(sameShape("60 kg", "6a kg")).toBe(false);
  });
});
