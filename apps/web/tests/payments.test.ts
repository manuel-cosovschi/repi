import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as cm from "@/server/commercial/services";
import { contractPayments, recordPayment, voidPayment } from "@/server/commercial/payments";
import { resetRateLimits } from "@/server/access/util";

// F-AD-04 / N-O22 / D102: pagos externos registrados con evidencia y conciliados contra cierres; no es cobro de REPI.
let n = 0;
async function verified(name = "Persona Pagos") {
  const email = `pg${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
async function admin() {
  const u = await verified("Admin Pagos");
  await db.update(schema.user).set({ platformRole: "admin", twoFactorEnabled: true }).where(eq(schema.user.id, u));
  return u;
}
beforeEach(() => resetRateLimits());

describe("pagos externos registrados", () => {
  it("registra con evidencia, concilia contra el cierre, anula con motivo y aparece en el resumen del mes", async () => {
    const ad = await admin();
    const c = await cm.createClient(ad, { kind: "coach", orgName: `Coach Pagos ${n}`, legalName: "Coach Pagos SA", responsibleName: "Resp", responsibleEmail: `resp${n}@example.test`, currency: "ARS" });
    await cm.addTerm(ad, c.contractId, { kind: "quantity", value: 20, effectiveFrom: "2026-09-01", reason: "Acuerdo" });
    await cm.addTerm(ad, c.contractId, { kind: "unit_price", value: 500_000, effectiveFrom: "2026-09-01", reason: "Acuerdo" }); // $5.000 por alumno
    const close = await cm.closePeriodSimulated(ad, c.contractId, { start: "2026-09-01", end: "2026-09-30" });
    const before = await cm.adminSummary(ad);
    const today = localDate(new Date());
    await expect(recordPayment(ad, c.contractId, { amountMinor: 1000, receivedOn: today, method: "transferencia", reference: " " })).rejects.toMatchObject({ code: "invalid" });
    await expect(recordPayment(ad, c.contractId, { amountMinor: 1000, receivedOn: "2099-01-01", method: "transferencia", reference: "OP-1" })).rejects.toMatchObject({ code: "invalid" });
    await expect(recordPayment(ad, c.contractId, { amountMinor: 0, receivedOn: today, method: "transferencia", reference: "OP-1" })).rejects.toMatchObject({ code: "invalid" });
    const p1 = await recordPayment(ad, c.contractId, { amountMinor: 6_000_000, receivedOn: today, method: "transferencia", reference: "OP-778899", snapshotId: close.id });
    let v = await contractPayments(ad, c.contractId);
    expect(v.reconciliation[0]).toMatchObject({ state: "partial", period: "2026-09-01 → 2026-09-30" });
    await recordPayment(ad, c.contractId, { amountMinor: 4_000_000, receivedOn: today, method: "deposito", reference: "Comprobante 12", snapshotId: close.id });
    v = await contractPayments(ad, c.contractId);
    expect(v.reconciliation[0].state).toBe("paid");
    const after = await cm.adminSummary(ad);
    expect(after.collected).toBeNull();
    expect(after.externalPaymentsMonth.join()).not.toBe(before.externalPaymentsMonth.join());
    await expect(voidPayment(ad, p1.id, "x")).rejects.toMatchObject({ code: "invalid" });
    await voidPayment(ad, p1.id, "Transferencia rebotada");
    v = await contractPayments(ad, c.contractId);
    expect(v.reconciliation[0].state).toBe("partial");
    expect(v.payments.find((p) => p.id === p1.id)).toMatchObject({ status: "voided", voidReason: "Transferencia rebotada" });
    await expect(voidPayment(ad, p1.id, "otra vez")).rejects.toMatchObject({ status: 404 });
    const acts = (await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.resourceId, p1.id)))).map((x) => x.action);
    expect(acts).toEqual(expect.arrayContaining(["billing.payment_recorded", "billing.payment_voided"]));
  });

  it("sólo Admin con 2FA; el cierre debe ser del mismo contrato", async () => {
    const ad = await admin(), cualquiera = await verified();
    const a = await cm.createClient(ad, { kind: "coach", orgName: `A ${n}`, legalName: "A SA", responsibleName: "Resp", responsibleEmail: `a${n}@example.test`, currency: "ARS" });
    const b = await cm.createClient(ad, { kind: "coach", orgName: `B ${n}`, legalName: "B SA", responsibleName: "Resp", responsibleEmail: `b${n}@example.test`, currency: "ARS" });
    await cm.addTerm(ad, b.contractId, { kind: "quantity", value: 1, effectiveFrom: "2026-09-01", reason: "Acuerdo inicial" });
    await cm.addTerm(ad, b.contractId, { kind: "unit_price", value: 100, effectiveFrom: "2026-09-01", reason: "Acuerdo inicial" });
    const closeB = await cm.closePeriodSimulated(ad, b.contractId, { start: "2026-09-01", end: "2026-09-30" });
    await expect(recordPayment(ad, a.contractId, { amountMinor: 100, receivedOn: "2026-10-01", method: "efectivo", reference: "Recibo 1", snapshotId: closeB.id })).rejects.toMatchObject({ code: "invalid" });
    await expect(contractPayments(cualquiera, a.contractId)).rejects.toMatchObject({ status: 404 });
    await expect(recordPayment(cualquiera, a.contractId, { amountMinor: 100, receivedOn: "2026-10-01", method: "efectivo", reference: "Recibo 1" })).rejects.toMatchObject({ status: 404 });
  });
});
