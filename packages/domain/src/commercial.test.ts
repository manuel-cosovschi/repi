import { describe, expect, it } from "vitest";
import { activationStage, fmtMoney, overAgreed, parseMoney, parseWeight, previewPeriod, termAt, type Term } from "./commercial";

const t = (kind: Term["kind"], version: number, value: number, effectiveFrom: string): Term => ({ id: `${kind}${version}`, kind, version, value, currency: kind === "unit_price" ? "ARS" : null, effectiveFrom, createdAt: "2026-10-01" });

describe("facturación por cantidad acordada (anexo §9, criterios 12–16)", () => {
  it("1.000 socios acordados a ARS 450: la base es 1.000, no los usuarios habilitados", () => {
    const p = previewPeriod([t("quantity", 1, 1000, "2026-11-01"), t("unit_price", 1, 45000, "2026-11-01")], { start: "2026-11-01", end: "2026-11-30" });
    expect(p.ok && p.subtotal).toBe(45_000_000);
    expect(p.ok && fmtMoney(p.subtotal)).toBe("ARS 450.000,00");
  });
  it("coach con 40 alumnos acordados: base 40", () => {
    const p = previewPeriod([t("quantity", 1, 40, "2026-11-01"), t("unit_price", 1, 70000, "2026-11-01")], { start: "2026-11-01", end: "2026-11-30" });
    expect(p.ok && p.quantity!.value).toBe(40);
  });
  it("cambio futuro no altera un período anterior; sin cantidad no se reemplaza por cero", () => {
    const terms = [t("quantity", 1, 100, "2026-10-01"), t("unit_price", 1, 1000, "2026-10-01"), t("quantity", 2, 150, "2026-12-01")];
    expect(termAt(terms, "quantity", "2026-11-01")!.value).toBe(100);
    expect(termAt(terms, "quantity", "2026-12-01")!.value).toBe(150);
    const nov = previewPeriod(terms, { start: "2026-11-01", end: "2026-11-30" });
    expect(nov.ok && nov.subtotal).toBe(100_000);
    const none = previewPeriod([t("unit_price", 1, 1000, "2026-10-01")], { start: "2026-11-01", end: "2026-11-30" });
    expect(none).toMatchObject({ ok: false, reason: "Falta la cantidad acordada." });
    const mid = previewPeriod(terms, { start: "2026-11-15", end: "2026-12-14" });
    expect(mid.changes).toHaveLength(1); // se informa, no se prorratea
  });
  it("accesos por encima del total acordado → revisión, no cobro", () => {
    expect(overAgreed(1000, 1001)).toBe(true);
    expect(overAgreed(null, 5)).toBe(false);
  });
  it("dinero exacto", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("450")).toBe(45000);
    expect(parseMoney("12,5")).toBe(1250);
    expect(parseMoney("abc")).toBeNull();
    // Punto de miles sin decimales (como se escribe en es-AR): «25.000» y «1.250.000».
    expect(parseMoney("25.000")).toBe(2_500_000);
    expect(parseMoney("1.250.000")).toBe(125_000_000);
    expect(parseMoney("150.5")).toBe(15050);
    expect(parseMoney("1.2345")).toBeNull();
  });
});

describe("hitos de activación separados", () => {
  it("contrato, invitación, responsable y configuración", () => {
    expect(activationStage({ contract: "draft", invitationSent: false, ownerJoined: false, setupDone: false })).toBe("draft");
    expect(activationStage({ contract: "enabled", invitationSent: true, ownerJoined: false, setupDone: false })).toBe("invited");
    expect(activationStage({ contract: "enabled", invitationSent: true, ownerJoined: true, setupDone: false })).toBe("setup_pending");
    expect(activationStage({ contract: "suspended", invitationSent: true, ownerJoined: true, setupDone: true })).toBe("suspended");
  });
});

describe("pesos finos", () => {
  it("acepta 1,25 y 13,75; rechaza 3 decimales", () => {
    expect(parseWeight("13,75")).toBe(13.75);
    expect(parseWeight("1.25")).toBe(1.25);
    expect(parseWeight("2.125")).toBeNull();
    expect(parseWeight("")).toBeNull();
  });
});
