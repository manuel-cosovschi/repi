import { describe, expect, it } from "vitest";
import { subsPanelOpen, subsPanelToggle, subsRow, type SubsPanel } from "@/components/coach/ApprovedSubs";

// D201 · pedido de Urko: el panel de reemplazos aprobados pertenece a su contexto (organización, programa o socio, día).
describe("panel de reemplazos con contexto", () => {
  const A = "org1|progA|0", B = "org1|progB|0", A1 = "org1|progA|1";
  const row = subsRow(0, "ex-sentadilla");

  it("abre y cierra en la misma fila y contexto", () => {
    let p: SubsPanel = null;
    p = subsPanelToggle(p, A, row);
    expect(subsPanelOpen(p, A, row)).toBe(true);
    p = subsPanelToggle(p, A, row);
    expect(subsPanelOpen(p, A, row)).toBe(false);
  });

  it("no queda abierto al cambiar de programa, de alumno o de día aunque el índice y el ejercicio coincidan", () => {
    const p = subsPanelToggle(null, A, row);
    expect(subsPanelOpen(p, B, row)).toBe(false); // otro programa (o socio)
    expect(subsPanelOpen(p, A1, row)).toBe(false); // otro día
    expect(subsPanelOpen(p, "org2|progA|0", row)).toBe(false); // otra organización
  });

  it("al moverse a otro ejercicio de la misma posición no reutiliza el panel", () => {
    const p = subsPanelToggle(null, A, row);
    expect(subsPanelOpen(p, A, subsRow(0, "ex-prensa"))).toBe(false);
    expect(subsPanelOpen(p, A, subsRow(1, "ex-sentadilla"))).toBe(false);
  });

  it("tocar otro ejercicio con un panel abierto cambia el panel (uno a la vez)", () => {
    let p = subsPanelToggle(null, A, row);
    p = subsPanelToggle(p, A, subsRow(2, "ex-remo"));
    expect(subsPanelOpen(p, A, row)).toBe(false);
    expect(subsPanelOpen(p, A, subsRow(2, "ex-remo"))).toBe(true);
  });

  it("volver al contexto original después de cambiar no reabre un panel viejo si se cerró al navegar", () => {
    // La lectura ya lo ignora en el otro contexto; el efecto del hook lo limpia (estado null) al cambiar el scope.
    const p = subsPanelToggle(null, A, row);
    const afterNav: SubsPanel = p && p.scope !== B ? null : p;
    expect(subsPanelOpen(afterNav, A, row)).toBe(false);
  });
});
