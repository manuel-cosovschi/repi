// D207 · REPI Sales Force & Commission OS: recorridos A–J con persistencia real sobre repi_test.
import { randomUUID } from "node:crypto";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { localDate, type CommissionRules } from "@repi/domain";
import { db, schema } from "@/db";
import * as cm from "@/server/commercial/services";
import * as bp from "@/server/commercial/payments";
import * as reps from "@/server/sales/reps";
import * as crm from "@/server/sales/crm";
import * as deals from "@/server/sales/deals";
import * as com from "@/server/sales/commissions";
import * as pay from "@/server/sales/payouts";
import * as ins from "@/server/sales/insights";
import { listWorkspaces } from "@/server/access/services";
import { requireRep } from "@/server/sales/core";

const uid = () => randomUUID();
const k = () => randomUUID().replace(/-/g, "");
async function admin() {
  const id = uid();
  await db.insert(schema.user).values({ id, name: "Admin ventas", email: `${id}@test.repi.local`, emailVerified: true, platformRole: "admin", twoFactorEnabled: true });
  return id;
}
async function person(email: string, verified = true) {
  const id = uid();
  await db.insert(schema.user).values({ id, name: "Persona", email, emailVerified: verified });
  return id;
}
async function tokenFor(email: string) {
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  return m.body.match(/\/ventas\/activar\/([A-Za-z0-9_-]+)/)![1];
}
/** Flujo A completo: alta, invitación y aceptación. */
async function onboardRep(adminId: string, over: Partial<reps.RepInput> = {}) {
  const email = `${uid()}@vendedor.repi.local`;
  const r = await reps.createRep(adminId, { name: "Vendedora Prueba", email, province: "Córdoba", city: "Córdoba", ...over });
  await reps.sendRepInvitation(adminId, r.id);
  const userId = await person(email);
  await reps.acceptRepInvitation(userId, await tokenFor(email));
  return { repId: r.id, userId, email, code: r.code };
}
const RULES = (over: Partial<CommissionRules> = {}): CommissionRules => ({
  currency: "ARS", components: [{ type: "fixed_per_sale", amountMinor: 20000_00, trigger: "contract_enabled" }, { type: "recurring_pct", bps: 1000, months: 6 }],
  holdDays: 0, minPayoutMinor: 0, capPerDealMinor: null, onContractStop: "stop", afterTermination: "stop", ...over,
});
async function planFor(adminId: string, repId: string, rules = RULES()) {
  const p = await com.createPlan(adminId, { name: `Plan ${k().slice(0, 6)}` });
  const v = await com.saveDraftVersion(adminId, p.id, { rules, effectiveFrom: "2026-01-01" });
  await com.approveVersion(adminId, v.id);
  await reps.assignPlan(adminId, repId, { planVersionId: v.id, effectiveFrom: "2026-01-01", reason: "Acuerdo comercial de prueba" });
  return v.id;
}
const dealInput = (over: Partial<deals.DealInput> = {}): deals.DealInput => ({
  idempotencyKey: k(), clientKind: "gym", businessName: `Gimnasio ${k().slice(0, 8)}`, contactName: "Dueña Prueba", contactEmail: `${uid()}@cliente.repi.local`,
  members: 300, unitPriceMinor: 500_00, currency: "ARS", periodicity: "monthly", contractStart: "2026-10-01", durationMonths: 12, evidence: "Propuesta firmada P-001 (prueba)", closedOn: "2026-10-01", ...over,
});
async function approvedClient(adminId: string, userId: string, over: Partial<deals.DealInput> = {}) {
  const d = await deals.declareDeal(userId, dealInput(over));
  const rev = (await deals.dealReview(adminId, d.id)).deal.revision;
  const r = await deals.approveDeal(adminId, d.id, { revision: rev, link: { mode: "create" }, quantity: over.members ?? 300, unitPriceMinor: over.unitPriceMinor ?? 500_00, effectiveFrom: over.contractStart ?? "2026-10-01", applyTerms: true });
  return { dealId: d.id, ...r };
}

describe("A · alta e invitación de vendedor", () => {
  it("Admin crea, invita y el vendedor accede; el token es de un solo uso y ligado al email", async () => {
    const a = await admin();
    const email = `${uid()}@vendedor.repi.local`;
    const r = await reps.createRep(a, { name: "Ana Ventas", email, province: "Mendoza" });
    expect(r.code).toMatch(/^V-[A-Z2-9]{6}$/);
    await expect(reps.createRep(a, { name: "Duplicada", email })).rejects.toMatchObject({ code: "exists" });
    const first = await reps.sendRepInvitation(a, r.id);
    expect(first.delivery).toBe("local_only");
    const oldToken = await tokenFor(email);
    await reps.sendRepInvitation(a, r.id); // reenviar revoca la anterior
    const token = await tokenFor(email);
    expect(token).not.toBe(oldToken);
    expect((await reps.lookupRepInvitation(oldToken)).state).toBe("revoked");
    const other = await person(`${uid()}@otro.repi.local`);
    await expect(reps.acceptRepInvitation(other, token)).rejects.toMatchObject({ code: "email_mismatch" });
    const unverified = await person(`x${uid()}@vendedor.repi.local`, false);
    await expect(reps.acceptRepInvitation(unverified, token)).rejects.toMatchObject({ code: "unverified" });
    const me = await person(email);
    expect(await reps.acceptRepInvitation(me, token)).toMatchObject({ href: "/ventas" });
    await expect(reps.acceptRepInvitation(me, token)).rejects.toMatchObject({ code: "invalid_link" });
    expect((await requireRep(me)).status).toBe("active");
    expect((await listWorkspaces(me)).some((w) => w.href === "/ventas")).toBe(true);
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, me));
    expect(u.platformRole).toBeNull(); // nunca se vuelve Admin
    const [ev] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.action, "sales.rep_accept"), eq(schema.auditEvent.result, "denied"))).limit(1);
    expect(ev).toBeTruthy();
  });
  it("una invitación vencida no sirve y un no-admin no puede crear vendedores", async () => {
    const a = await admin();
    const email = `${uid()}@vendedor.repi.local`;
    const r = await reps.createRep(a, { name: "Beto Ventas", email });
    await reps.sendRepInvitation(a, r.id);
    const token = await tokenFor(email);
    await db.update(schema.salesRepInvitation).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.salesRepInvitation.repId, r.id));
    expect((await reps.lookupRepInvitation(token)).state).toBe("expired");
    await expect(reps.acceptRepInvitation(await person(email), token)).rejects.toMatchObject({ code: "invalid_link" });
    const nobody = await person(`${uid()}@x.repi.local`);
    await expect(reps.createRep(nobody, { name: "Yo mismo", email: `${uid()}@x.repi.local` })).rejects.toMatchObject({ status: 404 });
    await expect(requireRep(nobody)).rejects.toMatchObject({ status: 404 });
  });
});

describe("B · captación y pipeline", () => {
  it("registra prospecto, oportunidad y actividad; respeta las transiciones", async () => {
    const a = await admin();
    const { userId } = await onboardRep(a);
    const p = await crm.createProspect(userId, { name: `Atlas ${k().slice(0, 6)}`, city: "Córdoba", phone: `11${Date.now().toString().slice(-8)}`, contactName: "Laura", estMembers: 250 });
    expect(p.opportunityId).toBeTruthy();
    await crm.addActivity(userId, p.id, { kind: "visit", summary: "Visita a la recepción", opportunityId: p.opportunityId });
    await expect(crm.addActivity(userId, p.id, { kind: "task", summary: "Llamar" })).rejects.toMatchObject({ code: "invalid" });
    let rev = (await crm.prospectDetail(userId, p.id)).opportunities[0].revision;
    const moved = await crm.moveStage(userId, p.opportunityId!, { to: "contacted", revision: rev });
    await expect(crm.moveStage(userId, p.opportunityId!, { to: "interested", revision: rev })).rejects.toMatchObject({ code: "stale" });
    rev = moved.revision;
    await expect(crm.moveStage(userId, p.opportunityId!, { to: "won", revision: rev })).rejects.toMatchObject({ code: "invalid_transition" });
    const detail = await crm.prospectDetail(userId, p.id);
    expect(detail.activities.map((x) => x.kind)).toEqual(expect.arrayContaining(["visit", "stage", "created"]));
    expect(detail.activities.find((x) => x.kind === "visit")?.actor).toBe("Persona");
    const pipe = await crm.myPipeline(userId);
    expect(pipe.rows.find((r) => r.prospectId === p.id)?.stage).toBe("contacted");
  });
  it("advierte duplicados fuertes sin fusionar y, si el vendedor sigue, pide revisión a Admin", async () => {
    const a = await admin();
    const one = await onboardRep(a), two = await onboardRep(a);
    const phone = `351${Date.now().toString().slice(-7)}`;
    await crm.createProspect(one.userId, { name: "Gimnasio Norte", phone });
    const err = await crm.createProspect(two.userId, { name: "Norte Fitness", phone }).catch((e) => e);
    expect(err.code).toBe("possible_duplicate");
    expect(err.data.matches[0]).toMatchObject({ type: "other", name: null, strong: true }); // sin datos del otro vendedor
    const ok = await crm.createProspect(two.userId, { name: "Norte Fitness", phone, duplicateAck: true, duplicateMessage: "Me contactaron directo" });
    expect(ok.duplicateReview).toBe(true);
    const reqs = await deals.listRequests(a);
    const req = reqs.find((r) => r.prospectId === ok.id)!;
    await deals.resolveRequest(a, req.id, { decision: "approve", resolution: "Son sucursales distintas", action: "clear" });
    expect((await crm.prospectDetail(two.userId, ok.id)).prospect.duplicateStatus).toBe("cleared");
  });
});

describe("C · cierre, revisión y vínculo con el contrato real", () => {
  it("declarar es idempotente; corrección; aprobación crea el cliente en borrador con cantidad y precio versionados", async () => {
    const a = await admin();
    const { userId, repId } = await onboardRep(a);
    const planV = await planFor(a, repId);
    const p = await crm.createProspect(userId, { name: `Gym Sur ${k().slice(0, 6)}`, contactName: "Dueño" });
    const input = dealInput({ prospectId: p.id, opportunityId: p.opportunityId, contactEmail: undefined, contactPhone: "1155554444" });
    const d1 = await deals.declareDeal(userId, input);
    const d2 = await deals.declareDeal(userId, input);
    expect(d2).toMatchObject({ id: d1.id, repeated: true });
    expect((await crm.prospectDetail(userId, p.id)).opportunities[0].stage).toBe("pending_validation");
    let review = await deals.dealReview(a, d1.id);
    await expect(deals.approveDeal(a, d1.id, { revision: review.deal.revision, link: { mode: "create" }, quantity: 300, unitPriceMinor: 500_00, effectiveFrom: "2026-10-01", applyTerms: true }))
      .rejects.toMatchObject({ code: "invalid" }); // sin email del responsable no se crea el cliente
    await deals.requestDealCorrection(a, d1.id, { note: "Falta el email del responsable", revision: review.deal.revision });
    const mine = await deals.myDeal(userId, d1.id);
    expect(mine.status).toBe("needs_correction");
    const { idempotencyKey: _k, ...rest } = input;
    await deals.updateDeal(userId, d1.id, { ...rest, contactEmail: `${uid()}@cliente.repi.local`, revision: mine.revision });
    review = await deals.dealReview(a, d1.id);
    expect(review.deal.status).toBe("declared");
    expect(review.plan?.versionId).toBe(planV);
    const res = await deals.approveDeal(a, d1.id, { revision: review.deal.revision, link: { mode: "create" }, quantity: 300, unitPriceMinor: 500_00, effectiveFrom: "2026-10-01", applyTerms: true });
    const [contract] = await db.select().from(schema.clientContract).where(eq(schema.clientContract.id, res.contractId));
    expect(contract.status).toBe("draft"); // aprobar no habilita ni registra aceptación
    const terms = await db.select().from(schema.contractTerm).where(eq(schema.contractTerm.contractId, res.contractId));
    expect(terms.map((t) => [t.kind, t.version, t.value]).sort()).toEqual([["quantity", 1, 300], ["unit_price", 1, 500_00]]);
    const [attr] = await db.select().from(schema.salesAttribution).where(eq(schema.salesAttribution.orgId, res.orgId));
    expect(attr).toMatchObject({ closingRepId: repId, assignedRepId: repId, originRepId: repId });
    expect((await crm.prospectDetail(userId, p.id)).opportunities[0].stage).toBe("won");
    const [deal] = await db.select().from(schema.salesDeal).where(eq(schema.salesDeal.id, d1.id));
    expect(deal.planVersionId).toBe(planV);
    await expect(deals.approveDeal(a, d1.id, { revision: deal.revision, link: { mode: "create" }, quantity: 300, unitPriceMinor: 500_00, effectiveFrom: "2026-10-01", applyTerms: true })).rejects.toMatchObject({ code: "invalid_state" });
    // No se crea un cliente duplicado: otra venta del mismo email choca con el cliente existente.
    const again = await deals.declareDeal(userId, dealInput({ contactEmail: contract.responsibleEmail }));
    const rv = (await deals.dealReview(a, again.id));
    expect(rv.duplicates.some((m) => m.type === "client")).toBe(true);
    await expect(deals.approveDeal(a, again.id, { revision: rv.deal.revision, link: { mode: "create" }, quantity: 300, unitPriceMinor: 500_00, effectiveFrom: "2026-10-01", applyTerms: true })).rejects.toMatchObject({ code: "possible_duplicate" });
    // El vendedor no puede aprobar su propia venta ni usar servicios de Admin.
    await expect(deals.approveDeal(userId, again.id, { revision: rv.deal.revision, link: { mode: "create" }, quantity: 1, unitPriceMinor: 1, effectiveFrom: "2026-10-01", applyTerms: true })).rejects.toMatchObject({ status: 404 });
  });
  it("dos aprobaciones simultáneas producen un solo cliente", async () => {
    const a = await admin();
    const { userId } = await onboardRep(a);
    const d = await deals.declareDeal(userId, dealInput());
    const rev = (await deals.dealReview(a, d.id)).deal.revision;
    const go = () => deals.approveDeal(a, d.id, { revision: rev, link: { mode: "create" }, quantity: 300, unitPriceMinor: 500_00, effectiveFrom: "2026-10-01", applyTerms: true });
    const out = await Promise.allSettled([go(), go()]);
    expect(out.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const [deal] = await db.select().from(schema.salesDeal).where(eq(schema.salesDeal.id, d.id));
    const orgs = await db.select().from(schema.organization).where(eq(schema.organization.name, deal.businessName));
    expect(orgs).toHaveLength(1);
  });
});

describe("D–F · incorporación, comisiones y liquidación", () => {
  it("habilitación y cobros verificados devengan; anular revierte; el libro es inmutable; la liquidación no paga dos veces", async () => {
    const a = await admin();
    const { userId, repId } = await onboardRep(a);
    await planFor(a, repId);
    const c = await approvedClient(a, userId);
    expect((await com.myCommissions(userId)).entries).toHaveLength(0); // aprobar no devenga nada con este plan
    await cm.recordAcceptance(a, c.contractId, { method: "external", ref: "Contrato firmado", acceptedAt: "2026-10-02", termsVersion: "v1" });
    await cm.enableClient(a, c.contractId, {});
    const clients = await deals.myClients(userId);
    expect(clients.find((x) => x.orgId === c.orgId)).toMatchObject({ contractStatus: "enabled", agreed: 300, monthlyMinor: 150000_00 });
    let mine = await com.myCommissions(userId);
    expect(mine.entries.map((e) => e.amountMinor)).toEqual([20000_00]); // fijo al habilitar
    const p1 = await bp.recordPayment(a, c.contractId, { amountMinor: 150000_00, receivedOn: "2026-10-05", method: "transferencia", reference: "OP-1" });
    await bp.recordPayment(a, c.contractId, { amountMinor: 150000_00, receivedOn: "2026-11-03", method: "transferencia", reference: "OP-2" });
    mine = await com.myCommissions(userId);
    expect(mine.entries.filter((e) => e.component === "recurring_pct").map((e) => e.amountMinor)).toEqual([15000_00, 15000_00]);
    expect(await com.syncContract(c.contractId)).toEqual({ added: 0, reversed: 0 }); // idempotente
    await bp.voidPayment(a, p1.id, "Pago rebotado");
    mine = await com.myCommissions(userId);
    const reversal = mine.entries.find((e) => e.sourceType === "reversal")!;
    expect(reversal.amountMinor).toBe(-15000_00);
    expect(mine.totals.ARS.available).toBe(20000_00 + 15000_00);
    const [entry] = await db.select().from(schema.commissionEntry).where(eq(schema.commissionEntry.repId, repId)).limit(1);
    await expect(db.update(schema.commissionEntry).set({ amountMinor: 1 }).where(eq(schema.commissionEntry.id, entry.id))).rejects.toThrow();
    await expect(db.delete(schema.commissionEntry).where(eq(schema.commissionEntry.id, entry.id))).rejects.toThrow();

    // F · liquidación
    const key = k();
    const [b1, b2] = await Promise.allSettled([pay.generateBatch(a, { repId, currency: "ARS", cutoffOn: localDate(new Date()), idempotencyKey: key }), pay.generateBatch(a, { repId, currency: "ARS", cutoffOn: localDate(new Date()), idempotencyKey: key })]);
    const ids = [b1, b2].filter((x) => x.status === "fulfilled").map((x) => (x as PromiseFulfilledResult<{ id: string }>).value.id);
    expect(new Set(ids).size).toBe(1);
    await expect(pay.generateBatch(a, { repId, currency: "ARS", idempotencyKey: k() })).rejects.toMatchObject({ code: "exists" });
    const batchId = ids[0];
    let batch = await pay.adminBatch(a, batchId);
    expect(batch.batch.totalMinor).toBe(35000_00);
    await expect(pay.recordPayout(a, batchId, { amountMinor: 1, paidOn: "2026-11-07", method: "transferencia", reference: "TR-1", idempotencyKey: k() })).rejects.toMatchObject({ code: "invalid_state" });
    await pay.approveBatch(a, batchId);
    const pk = k();
    await Promise.all([pay.recordPayout(a, batchId, { amountMinor: 10000_00, paidOn: "2026-11-07", method: "transferencia", reference: "TR-1", idempotencyKey: pk }), pay.recordPayout(a, batchId, { amountMinor: 10000_00, paidOn: "2026-11-07", method: "transferencia", reference: "TR-1", idempotencyKey: pk })]);
    batch = await pay.adminBatch(a, batchId);
    expect(batch.batch).toMatchObject({ status: "partially_paid", paidMinor: 10000_00 });
    await expect(pay.recordPayout(a, batchId, { amountMinor: 30000_00, paidOn: "2026-11-07", method: "transferencia", reference: "TR-2", idempotencyKey: k() })).rejects.toMatchObject({ code: "overpay" });
    await pay.recordPayout(a, batchId, { amountMinor: 25000_00, paidOn: "2026-11-07", method: "transferencia", reference: "TR-2", idempotencyKey: k() });
    mine = await com.myCommissions(userId);
    expect(mine.batches[0]).toMatchObject({ status: "paid", paidMinor: 35000_00 });
    expect(mine.totals.ARS.paid).toBe(35000_00);
    expect(mine.totals.ARS.available).toBe(0);
    await expect(pay.generateBatch(a, { repId, currency: "ARS", idempotencyKey: k() })).rejects.toMatchObject({ code: "nothing" });
    const csv = await pay.exportCsv(a, "payments");
    expect(csv).toContain("TR-2");
    // Admin ve cuánto vende, aporta y se le debe
    const cc = await ins.controlCenter(a, { repId });
    expect(cc.perRep[0]).toMatchObject({ approved: 1, membersSold: 300 });
    expect(cc.perRep[0].paid.ARS).toBe(35000_00);
    // Un cliente con venta aprobada no se puede borrar
    await expect(cm.deleteClient(a, c.contractId, batch.items[0].client ?? "")).rejects.toMatchObject({ code: expect.stringMatching(/invalid/) });
  });
});

describe("G · renegociación", () => {
  it("una ampliación aprobada agrega versiones nuevas sin tocar las anteriores y comisiona sólo los socios adicionales", async () => {
    const a = await admin();
    const { userId, repId } = await onboardRep(a);
    await planFor(a, repId, RULES({ components: [{ type: "per_member", amountMinor: 100_00, trigger: "deal_approved" }] }));
    const c = await approvedClient(a, userId);
    const mod = await deals.declareDeal(userId, dealInput({ kind: "modification", orgId: c.orgId, members: 350, contractStart: "2026-11-01", closedOn: "2026-11-01" }));
    const rv = await deals.dealReview(a, mod.id);
    expect(rv.candidateContracts[0].id).toBe(c.contractId);
    await deals.approveDeal(a, mod.id, { revision: rv.deal.revision, link: { mode: "existing", contractId: c.contractId }, quantity: 350, unitPriceMinor: 500_00, effectiveFrom: "2026-11-01", applyTerms: true });
    const terms = await db.select().from(schema.contractTerm).where(and(eq(schema.contractTerm.contractId, c.contractId), eq(schema.contractTerm.kind, "quantity")));
    expect(terms.map((t) => [t.version, t.value, t.effectiveFrom]).sort()).toEqual([[1, 300, "2026-10-01"], [2, 350, "2026-11-01"]]);
    const e = (await com.myCommissions(userId)).entries.map((x) => x.amountMinor).sort((x, y) => x - y);
    expect(e).toEqual([50 * 100_00, 300 * 100_00]);
    const attrs = await deals.attributionHistory(a, c.orgId);
    expect(attrs).toHaveLength(2);
    expect(attrs.filter((x) => !x.endedAt)).toHaveLength(1);
  });
});

describe("H–J · desvinculación, aislamiento y reintentos", () => {
  it("desvinculado pierde el CRM, conserva sus comisiones; otro vendedor no ve nada ajeno", async () => {
    const a = await admin();
    const one = await onboardRep(a), two = await onboardRep(a);
    await planFor(a, one.repId, RULES({ components: [{ type: "fixed_per_sale", amountMinor: 5000_00, trigger: "deal_approved" }] }));
    const p = await crm.createProspect(one.userId, { name: `Privado ${k().slice(0, 6)}` });
    const c = await approvedClient(a, one.userId);
    // I · aislamiento
    await expect(crm.prospectDetail(two.userId, p.id)).rejects.toMatchObject({ status: 404 });
    await expect(crm.addActivity(two.userId, p.id, { kind: "note", summary: "Intento" })).rejects.toMatchObject({ status: 404 });
    await expect(deals.myDeal(two.userId, c.dealId)).rejects.toMatchObject({ status: 404 });
    expect((await deals.myClients(two.userId)).some((x) => x.orgId === c.orgId)).toBe(false);
    await expect(com.listPlans(one.userId)).rejects.toMatchObject({ status: 404 });
    await expect(pay.recordPayout(one.userId, "x", { amountMinor: 1, paidOn: "2026-11-01", method: "otro", reference: "xxx", idempotencyKey: k() })).rejects.toMatchObject({ status: 404 });
    const b = await pay.generateBatch(a, { repId: one.repId, currency: "ARS", cutoffOn: localDate(new Date()), idempotencyKey: k() });
    await expect(pay.myBatch(two.userId, b.id)).rejects.toMatchObject({ status: 404 });
    expect((await pay.myBatch(one.userId, b.id)).items).toHaveLength(1);
    // H · desvinculación
    await reps.setRepStatus(a, one.repId, "terminated", "Fin del acuerdo comercial");
    await expect(crm.myPipeline(one.userId)).rejects.toMatchObject({ code: "rep_status", status: 403 });
    await expect(deals.declareDeal(one.userId, dealInput())).rejects.toMatchObject({ code: "rep_status" });
    const money = await com.myCommissions(one.userId);
    expect(money.entries).toHaveLength(1);
    expect((await listWorkspaces(one.userId)).some((w) => w.href === "/ventas")).toBe(true);
    const [p2] = await db.select().from(schema.salesProspect).where(eq(schema.salesProspect.id, p.id));
    expect(p2.ownerRepId).toBe(one.repId); // historial intacto hasta que Admin reasigne
    const moved = await crm.reassignPortfolio(a, one.repId, { toRepId: two.repId, reason: "Desvinculación", includeClients: true });
    expect(moved.prospects).toBeGreaterThanOrEqual(1);
    expect(moved.clients).toBe(1);
    expect((await deals.myClients(two.userId)).some((x) => x.orgId === c.orgId)).toBe(true);
    const hist = await deals.attributionHistory(a, c.orgId);
    expect(hist.find((h) => !h.endedAt)).toMatchObject({ closingRepId: one.repId, assignedRepId: two.repId });
  });
  it("reintentos simultáneos de una venta generan una sola", async () => {
    const a = await admin();
    const { userId, repId } = await onboardRep(a);
    const input = dealInput();
    await Promise.all([deals.declareDeal(userId, input), deals.declareDeal(userId, input), deals.declareDeal(userId, input)]);
    const rows = await db.select().from(schema.salesDeal).where(and(eq(schema.salesDeal.repId, repId), eq(schema.salesDeal.idempotencyKey, input.idempotencyKey)));
    expect(rows).toHaveLength(1);
  });
  it("frecuencia: el vendedor la pide, Admin la aprueba y no cambia importes", async () => {
    const a = await admin();
    const { userId, repId } = await onboardRep(a);
    await reps.requestPayoutFrequency(userId, { frequency: "weekly" });
    await expect(reps.requestPayoutFrequency(userId, { frequency: "biweekly" })).rejects.toMatchObject({ code: "exists" });
    const req = (await deals.listRequests(a)).find((r) => r.repId === repId)!;
    await deals.resolveRequest(a, req.id, { decision: "approve", resolution: "Aprobado según acuerdo" });
    expect((await reps.myProfile(userId)).rep.payoutFrequency).toBe("weekly");
  });
  it("enlace personal: el contacto web guarda el código de un vendedor activo y Admin lo convierte en prospecto con origen", async () => {
    const a = await admin();
    const { code, repId, userId } = await onboardRep(a);
    const name = `Ref Gym ${k().slice(0, 6)}`;
    await cm.createLead({ kind: "gym", orgName: name, contactName: "Contacto", email: `${uid()}@lead.repi.local`, referralCode: code });
    await cm.createLead({ kind: "gym", orgName: `${name} B`, contactName: "Contacto", email: `${uid()}@lead.repi.local`, referralCode: "V-ZZZZZZ" });
    const leads = await db.select().from(schema.commercialLead).where(like(schema.commercialLead.orgName, `${name}%`));
    expect(leads.find((l) => l.orgName === name)?.referralCode).toBe(code);
    expect(leads.find((l) => l.orgName !== name)?.referralCode).toBeNull();
    const pr = await crm.leadToProspect(a, leads.find((l) => l.orgName === name)!.id, {});
    const d = await crm.prospectDetail(userId, pr.id);
    expect(d.prospect).toMatchObject({ source: "referral_link", originRepId: repId, ownerRepId: repId });
  });
  it("material: sólo lo publicado llega al vendedor y lo vencido se marca", async () => {
    const a = await admin();
    const { userId } = await onboardRep(a);
    const m = await ins.saveMaterial(a, { kind: "conditions", title: "Condiciones Q4", body: "Texto de prueba", validUntil: "2026-01-01" });
    expect((await ins.myMaterials(userId)).some((x) => x.id === m.id)).toBe(false);
    await ins.setMaterialStatus(a, m.id, "published");
    expect((await ins.myMaterials(userId)).find((x) => x.id === m.id)).toMatchObject({ expired: true });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.salesNotice);
    expect(n).toBeGreaterThan(0);
  });
});
