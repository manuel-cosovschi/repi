// Revisión AC3 (K3): con el Asistente REPI apagado (flag `assistant`), el bloque «Señales de REPI» del coach y de la sala no se
// muestra ni pide nada, igual que en la app del socio. Puro: render en el servidor, sin base ni red.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { RepiSignals } from "@/components/coach/RepiSignals";

const KEEP = process.env.NEXT_PUBLIC_REPI_FEATURES;
afterEach(() => { if (KEEP === undefined) delete process.env.NEXT_PUBLIC_REPI_FEATURES; else process.env.NEXT_PUBLIC_REPI_FEATURES = KEEP; });
const html = () => renderToStaticMarkup(createElement(RepiSignals, { load: "/api/coach/o1/clients/r1/brain", kind: "coach", relId: "r1", programId: null, decideUrl: (id: string) => `/x/${id}` }));

describe("Señales de REPI para el personal según el flag del asistente", () => {
  it("apagado: no hay sección", () => {
    process.env.NEXT_PUBLIC_REPI_FEATURES = "-assistant";
    expect(html()).toBe("");
  });
  it("encendido: la sección aparece (cargando)", () => {
    process.env.NEXT_PUBLIC_REPI_FEATURES = "assistant";
    expect(html()).toContain("Señales de REPI");
  });
});
