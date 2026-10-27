import { describe, expect, it } from "vitest";
import { platesFor, warmupFor } from "./plates";

describe("calculadora de discos", () => {
  it("arma el peso exacto por lado con barra de 20 kg", () => {
    expect(platesFor(100, 20, "kg")).toEqual({ perSide: [{ plate: 25, count: 1 }, { plate: 15, count: 1 }], total: 100, exact: true, missing: 0 });
    expect(platesFor(62.5, 20, "kg")!.perSide).toEqual([{ plate: 20, count: 1 }, { plate: 1.25, count: 1 }]);
    expect(platesFor(20, 20, "kg")).toMatchObject({ perSide: [], total: 20, exact: true });
  });
  it("si no se arma exacto, da el más cercano por debajo y cuánto falta", () => {
    expect(platesFor(101, 20, "kg")).toMatchObject({ total: 100, exact: false, missing: 1 });
    expect(platesFor(82.6, 20, "kg")).toMatchObject({ total: 82.5, exact: false });
  });
  it("libras con barra de 45 lb y pesos por debajo de la barra", () => {
    expect(platesFor(225, 45, "lb")!.perSide).toEqual([{ plate: 45, count: 2 }]);
    expect(platesFor(135, 45, "lb")!.perSide).toEqual([{ plate: 45, count: 1 }]);
    expect(platesFor(15, 20, "kg")).toBeNull();
    expect(platesFor(Number.NaN, 20, "kg")).toBeNull();
  });
});

describe("entrada en calor sugerida", () => {
  it("escalones redondeados a lo armable y siempre por debajo del trabajo", () => {
    expect(warmupFor(100, 20, "kg")).toEqual([
      { weight: 20, reps: 10, label: "Barra sola" }, { weight: 40, reps: 5, label: "40 %" }, { weight: 60, reps: 3, label: "60 %" }, { weight: 80, reps: 2, label: "80 %" },
    ]);
    expect(warmupFor(47.5, 20, "kg").map((x) => x.weight)).toEqual([20, 27.5, 37.5]);
  });
  it("pesos livianos: sin escalones repetidos ni iguales a la barra; nada si el trabajo es la barra", () => {
    expect(warmupFor(30, 20, "kg").map((x) => x.weight)).toEqual([20, 22.5]); // 40 % y 60 % quedan bajo la barra
    expect(warmupFor(20, 20, "kg")).toEqual([]);
    expect(warmupFor(225, 45, "lb").map((x) => x.weight)).toEqual([45, 90, 135, 180]);
  });
});
