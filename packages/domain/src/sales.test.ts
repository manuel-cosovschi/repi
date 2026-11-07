import { describe, expect, it } from "vitest";
import {
  applyBps, canMoveStage, dealPreview, desiredEntries, diffLedger, duplicateSignals, entryState, nextPayoutDate, payoutCutoff,
  bracketFor, describeBrackets, repCapabilities, splitAmount, tierBonusFor, validateRules, validateSplit, type CommissionRules, type DealForCommission,
} from "./sales";

const rules = (over: Partial<CommissionRules> = {}): CommissionRules => ({
  currency: "ARS", components: [], holdDays: 0, minPayoutMinor: 0, capPerDealMinor: null, onContractStop: "stop", afterTermination: "stop", ...over,
});
const deal = (over: Partial<DealForCommission> = {}): DealForCommission => ({
  id: "d1", kind: "new", currency: "ARS", contractStart: "2026-01-01", approvedOn: "2026-01-05", members: 300, previousMembers: 0,
  split: [{ repId: "r1", shareBps: 10000 }], contractEnabledOn: null, contractStoppedOn: null, ...over,
});
const pay = (id: string, amountMinor: number, receivedOn: string, status: "recorded" | "voided" = "recorded") => ({ id, amountMinor, currency: "ARS", receivedOn, status });

describe("dinero y vista previa del cierre", () => {
  it("redondea al centavo, mitades hacia arriba, sin flotantes", () => {
    expect(applyBps(150000_00, 1000)).toBe(15000_00);
    expect(applyBps(5, 1000)).toBe(1); // 0,5 → 1
    expect(applyBps(4, 1000)).toBe(0);
    expect(applyBps(-5, 1000)).toBe(-1);
  });
  it("300 socios × ARS 500 = ARS 150.000 mensuales (ejemplo ilustrativo, no precio real)", () => {
    const p = dealPreview({ members: 300, unitPriceMinor: 500_00, periodicity: "monthly", contractStart: "2026-02-01", durationMonths: 12 });
    expect(p.ok && p.monthlyNet).toBe(150000_00);
    expect(p.ok && p.totalContract).toBe(1_800_000_00);
    expect(p.ok && p.reviewOn).toBe("2027-02-01");
  });
  it("descuento, período trimestral y cargo inicial", () => {
    const p = dealPreview({ members: 100, unitPriceMinor: 1000_00, periodicity: "quarterly", contractStart: "2026-01-31", durationMonths: 6, discountBps: 1000, setupFeeMinor: 5000_00 });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.monthlyNet).toBe(90000_00);
    expect(p.perPeriod).toBe(270000_00);
    expect(p.totalContract).toBe(545000_00);
    expect(p.effectiveUnitMinor).toBe(900_00);
    expect(p.reviewOn).toBe("2026-07-31");
  });
  it("rechaza valores inválidos sin inventar defaults", () => {
    const p = dealPreview({ members: 0, unitPriceMinor: 0, periodicity: "monthly", contractStart: "x" });
    expect(p.ok).toBe(false);
  });
});

describe("estados, pipeline y frecuencias", () => {
  it("capacidades por estado: desvinculado conserva lectura de su dinero sin CRM", () => {
    expect(repCapabilities("active")).toMatchObject({ crmWrite: true, dealsWrite: true });
    expect(repCapabilities("paused")).toMatchObject({ crmRead: true, crmWrite: false, moneyRead: true });
    expect(repCapabilities("terminated")).toMatchObject({ crmRead: false, moneyRead: true });
    expect(repCapabilities("invited")).toMatchObject({ crmRead: false, moneyRead: false });
  });
  it("el vendedor no puede marcar ganado ni pendiente de validación", () => {
    expect(canMoveStage("negotiation", "won", "rep")).toBe(false);
    expect(canMoveStage("negotiation", "pending_validation", "rep")).toBe(false);
    expect(canMoveStage("negotiation", "declared", "rep")).toBe(true);
    expect(canMoveStage("contacted", "lost", "rep")).toBe(true);
    expect(canMoveStage("lost", "contacted", "rep")).toBe(true);
    expect(canMoveStage("won", "negotiation", "rep")).toBe(false);
    expect(canMoveStage("pending_validation", "won", "system")).toBe(true);
  });
  it("cortes de liquidación", () => {
    expect(payoutCutoff("monthly", "2026-11-07")).toBe("2026-10-31");
    expect(payoutCutoff("biweekly", "2026-11-07")).toBe("2026-10-31");
    expect(payoutCutoff("biweekly", "2026-11-20")).toBe("2026-11-15");
    expect(payoutCutoff("weekly", "2026-11-07")).toBe("2026-11-01"); // sábado → domingo anterior
    expect(payoutCutoff("per_sale", "2026-11-07")).toBe("2026-11-07");
    expect(nextPayoutDate("monthly", "2026-11-07")).toBe("2026-11-30");
    expect(nextPayoutDate("weekly", "2026-11-07")).toBe("2026-11-08");
  });
});

describe("duplicados", () => {
  it("CUIT, email o teléfono son señales fuertes; nombre parecido solo es posible", () => {
    expect(duplicateSignals({ name: "Gym Norte", cuit: "20-12345678-9" }, { name: "Otro", cuit: "20123456789" }).strong).toBe(true);
    expect(duplicateSignals({ name: "Gimnasio Atlas", phone: "+54 9 11 4444-5555" }, { name: "Atlas Fitness", phone: "1144445555" }).signals).toContain("phone");
    const n = duplicateSignals({ name: "Gimnasio Atlas" }, { name: "Atlas Fitness Club" });
    expect(n).toEqual({ signals: ["name"], strong: false });
    expect(duplicateSignals({ name: "Atlas", city: "Rosario" }, { name: "Atlas Gym", city: "rosario" }).strong).toBe(true);
    expect(duplicateSignals({ name: "A", email: "x@gmail.com" }, { name: "B", email: "y@gmail.com" }).signals).toEqual([]);
    expect(duplicateSignals({ name: "A", email: "x@atlas.com.ar" }, { name: "B", website: "www.atlas.com.ar" }).signals).toEqual(["domain"]);
  });
});

describe("planes de comisión", () => {
  it("valida sin completar valores faltantes", () => {
    expect(validateRules({ currency: "ARS", components: [] })).not.toEqual([]);
    expect(validateRules(rules({ components: [{ type: "recurring_pct", bps: 1000, months: 6 }] }))).toEqual([]);
    expect(validateRules(rules({ components: [{ type: "tier_bonus", metric: "approved_deals", tiers: [{ min: 3, amountMinor: 1 }, { min: 2, amountMinor: 2 }] }] }))).toHaveLength(1);
  });
  it("reparto exacto", () => {
    expect(validateSplit([{ repId: "a", shareBps: 5000 }, { repId: "b", shareBps: 4000 }])).toMatch(/100/);
    expect(splitAmount(101, [{ repId: "a", shareBps: 5000 }, { repId: "b", shareBps: 5000 }])).toEqual([{ repId: "a", amount: 50 }, { repId: "b", amount: 51 }].map((x, i) => (i === 0 ? { ...x, amount: 50 } : x)));
    const s = splitAmount(100_01, [{ repId: "a", shareBps: 3333 }, { repId: "b", shareBps: 3333 }, { repId: "c", shareBps: 3334 }]);
    expect(s.reduce((a, x) => a + x.amount, 0)).toBe(100_01);
  });
  it("un cierre aprobado no devenga porcentajes: sólo los cobros registrados", () => {
    const r = rules({ components: [{ type: "first_payment_pct", bps: 5000 }, { type: "recurring_pct", bps: 1000, months: 6 }] });
    expect(desiredEntries(r, deal(), [], {}, "2026-03-01").entries).toEqual([]);
    const { entries } = desiredEntries(r, deal(), [pay("p1", 150000_00, "2026-01-10"), pay("p2", 150000_00, "2026-02-10"), pay("p3", 150000_00, "2026-07-02"), pay("px", 99, "2026-02-11", "voided")], {}, "2026-08-01");
    expect(entries.filter((e) => e.component === "first_payment_pct").map((e) => e.amountMinor)).toEqual([75000_00]);
    // 10 % durante 6 meses: enero y febrero sí; julio fuera de la ventana; la anulada no cuenta
    expect(entries.filter((e) => e.component === "recurring_pct").map((e) => e.sourceId)).toEqual(["p1", "p2"]);
  });
  it("fijo y por socio según su momento; por socio en una ampliación usa sólo los adicionales", () => {
    const r = rules({ components: [{ type: "fixed_per_sale", amountMinor: 20000_00, trigger: "contract_enabled" }, { type: "per_member", amountMinor: 100_00, trigger: "deal_approved" }] });
    const before = desiredEntries(r, deal(), [], {}, "2026-01-06");
    expect(before.entries.map((e) => e.component)).toEqual(["per_member"]);
    expect(before.entries[0].amountMinor).toBe(300 * 100_00);
    expect(before.excluded.some((x) => x.componentIndex === 0)).toBe(true);
    const after = desiredEntries(r, deal({ contractEnabledOn: "2026-01-08" }), [], {}, "2026-01-09");
    expect(after.entries).toHaveLength(2);
    const mod = desiredEntries(r, deal({ kind: "modification", members: 350, previousMembers: 300 }), [], {}, "2026-01-09");
    expect(mod.entries.find((e) => e.component === "per_member")?.amountMinor).toBe(50 * 100_00);
  });
  it("tope por venta, desvinculación y suspensión del contrato", () => {
    const r = rules({ components: [{ type: "recurring_pct", bps: 1000, months: 12 }], capPerDealMinor: 25000_00 });
    const pays = [pay("p1", 150000_00, "2026-01-10"), pay("p2", 150000_00, "2026-02-10"), pay("p3", 150000_00, "2026-03-10")];
    const capped = desiredEntries(r, deal(), pays, {}, "2026-04-01");
    expect(capped.entries.map((e) => e.amountMinor)).toEqual([15000_00, 10000_00]);
    const term = desiredEntries(rules({ components: [{ type: "recurring_pct", bps: 1000, months: 12 }] }), deal(), pays, { r1: "2026-02-01" }, "2026-04-01");
    expect(term.entries.map((e) => e.sourceId)).toEqual(["p1"]);
    const keep = desiredEntries(rules({ components: [{ type: "recurring_pct", bps: 1000, months: 12 }], afterTermination: "continue" }), deal(), pays, { r1: "2026-02-01" }, "2026-04-01");
    expect(keep.entries).toHaveLength(3);
    const stop = desiredEntries(rules({ components: [{ type: "recurring_pct", bps: 1000, months: 12 }] }), deal({ contractStoppedOn: "2026-03-01" }), pays, {}, "2026-04-01");
    expect(stop.entries.map((e) => e.sourceId)).toEqual(["p1", "p2"]);
  });
  it("monto fijo en otra moneda no se convierte: queda excluido con motivo", () => {
    const r = rules({ currency: "USD", components: [{ type: "fixed_per_sale", amountMinor: 100_00, trigger: "deal_approved" }] });
    const x = desiredEntries(r, deal(), [], {}, "2026-02-01");
    expect(x.entries).toEqual([]);
    expect(x.excluded[0].reason).toMatch(/USD/);
  });
  it("escalones", () => {
    expect(tierBonusFor([{ min: 2, amountMinor: 10 }, { min: 5, amountMinor: 50 }], 4)?.amountMinor).toBe(10);
    expect(tierBonusFor([{ min: 2, amountMinor: 10 }], 1)).toBeNull();
  });
});

describe("libro inmutable", () => {
  it("agrega lo que falta y revierte con asiento negativo lo que dejó de corresponder; nunca edita", () => {
    const r = rules({ components: [{ type: "first_payment_pct", bps: 1000 }] });
    const d1 = desiredEntries(r, deal(), [pay("p1", 1000_00, "2026-01-10")], {}, "2026-02-01").entries;
    const first = diffLedger([], d1);
    expect(first.add.map((a) => a.finalKey)).toEqual([d1[0].key]);
    // repetir no duplica
    expect(diffLedger([{ key: d1[0].key, amountMinor: 100_00, reversalOf: null }], d1)).toEqual({ add: [], reverse: [] });
    // se anula p1 y aparece p2: revierte p1 y devenga p2
    const d2 = desiredEntries(r, deal(), [pay("p1", 1000_00, "2026-01-10", "voided"), pay("p2", 2000_00, "2026-01-20")], {}, "2026-02-01").entries;
    const second = diffLedger([{ key: d1[0].key, amountMinor: 100_00, reversalOf: null }], d2);
    expect(second.reverse.map((x) => x.key)).toEqual([d1[0].key]);
    expect(second.add[0].amountMinor).toBe(200_00);
    // si p1 vuelve a corresponder después de revertido, entra con clave nueva
    const third = diffLedger([{ key: d1[0].key, amountMinor: 100_00, reversalOf: null }, { key: `rev:${d1[0].key}`, amountMinor: -100_00, reversalOf: d1[0].key }], d1);
    expect(third.add[0].finalKey).toBe(`${d1[0].key}#2`);
  });
  it("estado visible", () => {
    expect(entryState({ amountMinor: 1, availableOn: "2026-02-01", reversed: false, payoutStatus: null, isReversal: false }, "2026-01-15")).toBe("accrued");
    expect(entryState({ amountMinor: 1, availableOn: "2026-01-01", reversed: false, payoutStatus: null, isReversal: false }, "2026-01-15")).toBe("available");
    expect(entryState({ amountMinor: 1, availableOn: "2026-01-01", reversed: false, payoutStatus: "approved", isReversal: false }, "2026-01-15")).toBe("in_payout");
    expect(entryState({ amountMinor: 1, availableOn: "2026-01-01", reversed: true, payoutStatus: "paid", isReversal: false }, "2026-01-15")).toBe("paid");
  });
});

describe("comisión del primer mes según socios", () => {
  const brackets = [{ minMembers: 50, bps: 3500 }, { minMembers: 300, bps: 5000 }, { minMembers: 400, bps: 6500 }];
  const r = rules({ components: [{ type: "first_month_by_members", brackets }] });
  it("elige el tramo por cantidad de socios, con los bordes en el tramo superior", () => {
    expect(bracketFor(brackets, 49)).toBeNull();
    expect(bracketFor(brackets, 50)?.bps).toBe(3500);
    expect(bracketFor(brackets, 299)?.bps).toBe(3500);
    expect(bracketFor(brackets, 300)?.bps).toBe(5000);
    expect(bracketFor(brackets, 399)?.bps).toBe(5000);
    expect(bracketFor(brackets, 400)?.bps).toBe(6500);
    expect(bracketFor(brackets, 5000)?.bps).toBe(6500);
    expect(describeBrackets(brackets)).toBe("50 a 299 socios → 35 % · 300 a 399 socios → 50 % · 400 o más socios → 65 %");
  });
  it("valida tramos crecientes y porcentajes", () => {
    expect(validateRules(r)).toEqual([]);
    expect(validateRules(rules({ components: [{ type: "first_month_by_members", brackets: [{ minMembers: 300, bps: 5000 }, { minMembers: 50, bps: 3500 }] }] }))).toHaveLength(1);
    expect(validateRules(rules({ components: [{ type: "first_month_by_members", brackets: [{ minMembers: 50, bps: 0 }] }] }))).toHaveLength(1);
    expect(validateRules(rules({ components: [{ type: "first_month_by_members", brackets: [] }] }))).toHaveLength(1);
  });
  it("devenga sólo sobre el primer cobro registrado, con el % del tramo", () => {
    expect(desiredEntries(r, deal({ members: 450 }), [], {}, "2026-03-01").entries).toEqual([]);
    const { entries } = desiredEntries(r, deal({ members: 450 }), [pay("p1", 90000_00, "2026-01-10"), pay("p2", 90000_00, "2026-02-10")], {}, "2026-03-01");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sourceId: "p1", baseMinor: 90000_00, rateBps: 6500, amountMinor: 58500_00 });
    const mid = desiredEntries(r, deal({ members: 350 }), [pay("p1", 70000_00, "2026-01-10")], {}, "2026-03-01").entries;
    expect(mid[0].amountMinor).toBe(35000_00);
  });
  it("con cobro trimestral toma la parte de un mes", () => {
    const { entries } = desiredEntries(r, deal({ members: 400, periodicityMonths: 3 }), [pay("p1", 240000_00, "2026-01-10")], {}, "2026-03-01");
    expect(entries[0]).toMatchObject({ baseMinor: 80000_00, amountMinor: 52000_00 });
  });
  it("por debajo del primer tramo no comisiona y lo explica", () => {
    const res = desiredEntries(r, deal({ members: 40 }), [pay("p1", 8000_00, "2026-01-10")], {}, "2026-03-01");
    expect(res.entries).toEqual([]);
    expect(res.excluded[0].reason).toMatch(/40 socios/);
  });
  it("anular el primer cobro mueve la comisión al siguiente cobro válido", () => {
    const { entries } = desiredEntries(r, deal({ members: 300 }), [pay("p1", 60000_00, "2026-01-10", "voided"), pay("p2", 60000_00, "2026-01-12")], {}, "2026-03-01");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sourceId: "p2", amountMinor: 30000_00 });
  });
});
