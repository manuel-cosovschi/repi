// REPI Admin › Ventas (D209). Despacho de /api/admin/sales/*. Cada servicio exige Admin con 2FA (salesAdmin).
import { z } from "zod";
import { body } from "../access/http";
import { AccessError } from "../access/util";
import { myNotices, readNotices, salesAdmin } from "./core";
import * as reps from "./reps";
import * as crm from "./crm";
import * as deals from "./deals";
import * as com from "./commissions";
import * as pay from "./payouts";
import * as ins from "./insights";

const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const s = (n: number) => z.string().max(n).nullable().optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const key = z.string().max(64);
const repInput = z.object({
  name: z.string().max(120), email: z.string().max(200), phone: s(40), city: s(80), province: s(80), zone: s(120), regionId: s(64), managerRepId: s(64),
  engagement: z.enum(["independent", "agency", "employee", "other"]).optional(), canSellCoaches: z.boolean().optional(),
  payoutFrequency: z.enum(["per_sale", "weekly", "biweekly", "monthly", "custom"]).optional(), payoutNote: s(300), agreementRef: s(200),
});
const component = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fixed_per_sale"), amountMinor: z.number().int(), trigger: z.enum(["deal_approved", "contract_enabled", "first_payment"]) }),
  z.object({ type: z.literal("first_payment_pct"), bps: z.number().int() }),
  z.object({ type: z.literal("recurring_pct"), bps: z.number().int(), months: z.number().int() }),
  z.object({ type: z.literal("per_member"), amountMinor: z.number().int(), trigger: z.enum(["deal_approved", "contract_enabled", "first_payment"]), maxMembers: z.number().int().nullable().optional() }),
  z.object({ type: z.literal("tier_bonus"), metric: z.enum(["approved_deals", "agreed_members"]), tiers: z.array(z.object({ min: z.number().int(), amountMinor: z.number().int() })).max(10) }),
]);
const rules = z.object({
  currency: z.enum(["ARS", "USD"]), components: z.array(component).min(1).max(8), holdDays: z.number().int(), minPayoutMinor: z.number().int(), capPerDealMinor: z.number().int().nullable(),
  onContractStop: z.enum(["stop", "continue"]), afterTermination: z.enum(["stop", "continue"]), notes: s(1000),
});

export async function salesGet(me: string, path: string[], q: URLSearchParams): Promise<unknown> {
  const [a, b, c] = path;
  switch (a) {
    case "overview": return ins.controlCenter(me, { period: q.get("period"), repId: q.get("repId"), province: q.get("province"), clientKind: q.get("clientKind"), source: q.get("source") });
    case "reps":
      if (!b) return reps.listReps(me, { q: q.get("q"), status: q.get("status"), province: q.get("province"), sort: q.get("sort"), page: Number(q.get("page")) || 1 });
      if (b === "options") return reps.repOptions(me);
      return ins.repProfile(me, b);
    case "regions": return reps.listRegions(me);
    case "prospects": return b ? crm.adminProspectDetail(me, b) : crm.adminProspects(me, { q: q.get("q"), repId: q.get("repId"), stage: q.get("stage"), province: q.get("province"), unassigned: q.get("unassigned") === "1", page: Number(q.get("page")) || 1 });
    case "deals": return b ? deals.dealReview(me, b) : deals.adminDeals(me, { status: q.get("status"), repId: q.get("repId") });
    case "attribution": if (b) return deals.attributionHistory(me, b); break;
    case "requests": return deals.listRequests(me, q.get("status") === "all" ? "all" : "open");
    case "plans": return com.listPlans(me);
    case "ledger": return com.adminLedger(me, { repId: q.get("repId"), state: q.get("state") });
    case "payouts":
      if (b === "preview") return pay.payoutPreview(me);
      return b ? pay.adminBatch(me, b) : pay.adminBatches(me, { repId: q.get("repId"), status: q.get("status") });
    case "materials": return ins.adminMaterials(me);
    case "notices": await salesAdmin(me); return myNotices(me);
    case "export":
      if (b === "ledger" || b === "payments") {
        const csv = await pay.exportCsv(me, b);
        return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="repi-${b === "ledger" ? "comisiones" : "pagos-vendedores"}-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
      }
  }
  void c;
  throw NF();
}

export async function salesPost(me: string, path: string[], req: Request): Promise<unknown> {
  const [a, b, c] = path;
  if (a === "reps" && !b) return reps.createRep(me, await body(req, repInput));
  if (a === "reps" && b) {
    switch (c) {
      case undefined: return reps.updateRep(me, b, await body(req, repInput.partial()));
      case "status": { const x = await body(req, z.object({ to: z.enum(["active", "paused", "suspended", "terminated"]), reason: z.string().max(300) })); return reps.setRepStatus(me, b, x.to, x.reason); }
      case "invite": return reps.sendRepInvitation(me, b);
      case "revoke-invite": return reps.revokeRepInvitation(me, b);
      case "plan": return reps.assignPlan(me, b, await body(req, z.object({ planVersionId: z.string().max(64), effectiveFrom: day, reason: z.string().max(300) })));
      case "targets": return ins.setTarget(me, b, await body(req, z.object({ month: z.string().max(7), metric: z.string().max(30), target: z.number().int(), currency: s(3) })));
      case "reassign": return crm.reassignPortfolio(me, b, await body(req, z.object({ toRepId: z.string().max(64), reason: z.string().max(300), includeClients: z.boolean() })));
    }
  }
  if (a === "reps-bulk" && b === "status") {
    // Acción masiva segura: un motivo para todos, cada cambio valida su transición y queda auditado por separado.
    const p = await body(req, z.object({ ids: z.array(z.string().max(64)).min(1).max(50), to: z.enum(["active", "paused", "suspended"]), reason: z.string().max(300) }));
    const results = [];
    for (const id of p.ids) { try { results.push({ id, ...(await reps.setRepStatus(me, id, p.to, p.reason)) }); } catch (e) { results.push({ id, error: (e as Error).message }); } }
    return { results };
  }
  if (a === "targets" && b && c === "delete") return ins.deleteTarget(me, b);
  if (a === "regions") return reps.saveRegion(me, await body(req, z.object({ id: s(64), name: z.string().max(80), provinces: s(300), note: s(300), active: z.boolean().optional() })));
  if (a === "prospects" && b && c === "assign") return crm.assignProspect(me, b, await body(req, z.object({ repId: z.string().max(64), reason: z.string().max(300) })));
  if (a === "leads" && b && c === "prospect") return crm.leadToProspect(me, b, await body(req, z.object({ repId: s(64) })));
  if (a === "deals" && b) {
    switch (c) {
      case "correction": return deals.requestDealCorrection(me, b, await body(req, z.object({ note: z.string().max(1000), revision: z.number().int() })));
      case "reject": return deals.rejectDeal(me, b, await body(req, z.object({ note: z.string().max(1000), revision: z.number().int() })));
      case "approve": return deals.approveDeal(me, b, await body(req, z.object({
        revision: z.number().int(), link: z.discriminatedUnion("mode", [z.object({ mode: z.literal("create") }), z.object({ mode: z.literal("existing"), contractId: z.string().max(64) })]),
        quantity: z.number().int(), unitPriceMinor: z.number().int(), effectiveFrom: day, applyTerms: z.boolean(), termsReason: s(300), planVersionId: s(64),
        split: z.array(z.object({ repId: z.string().max(64), shareBps: z.number().int() })).max(5).nullable().optional(),
        attribution: z.object({ originRepId: s(64), assignedRepId: s(64) }).nullable().optional(), replaceAttribution: z.boolean().optional(), note: s(1000),
      })));
    }
  }
  if (a === "clients" && b && c === "reassign") return deals.reassignClient(me, b, await body(req, z.object({ repId: z.string().max(64), reason: z.string().max(300) })));
  if (a === "requests" && b) return deals.resolveRequest(me, b, await body(req, z.object({ decision: z.enum(["approve", "reject"]), resolution: z.string().max(1000), action: z.enum(["clear", "associate", "archive"]).nullable().optional(), orgId: s(64) })));
  if (a === "plans" && !b) return com.createPlan(me, await body(req, z.object({ name: z.string().max(120), description: s(600) })));
  if (a === "plans" && b && c === "versions") return com.saveDraftVersion(me, b, await body(req, z.object({ versionId: s(64), rules, effectiveFrom: day, notes: s(600) })) as never);
  if (a === "plans" && b && c === "archive") return com.archivePlan(me, b);
  if (a === "plan-versions" && b && c === "approve") return com.approveVersion(me, b);
  if (a === "commissions" && b === "sync") return com.syncAll(me);
  if (a === "commissions" && b === "tiers") return com.evaluateTiers(me, (await body(req, z.object({ month: z.string().max(7) }))).month);
  if (a === "commissions" && b === "adjust") return com.adjustCommission(me, await body(req, z.object({ repId: z.string().max(64), amountMinor: z.number().int(), currency: z.enum(["ARS", "USD"]), reason: z.string().max(500), dealId: s(64), idempotencyKey: s(64) })));
  if (a === "payouts" && !b) return pay.generateBatch(me, await body(req, z.object({ repId: z.string().max(64), currency: z.enum(["ARS", "USD"]), cutoffOn: day.nullable().optional(), idempotencyKey: key, note: s(300), ignoreMinimum: z.boolean().optional() })));
  if (a === "payouts" && b) {
    switch (c) {
      case "approve": return pay.approveBatch(me, b);
      case "cancel": return pay.cancelBatch(me, b, (await body(req, z.object({ reason: z.string().max(300) }))).reason);
      case "payments": return pay.recordPayout(me, b, await body(req, z.object({ amountMinor: z.number().int(), paidOn: day, method: z.enum(["transferencia", "deposito", "efectivo", "otro"]), reference: z.string().max(200), note: s(300), idempotencyKey: key })));
    }
  }
  if (a === "payout-payments" && b && c === "void") return pay.voidPayout(me, b, (await body(req, z.object({ reason: z.string().max(300) }))).reason);
  if (a === "materials" && !b) return ins.saveMaterial(me, await body(req, z.object({ id: s(64), kind: z.string().max(30), title: z.string().max(160), description: s(600), url: s(500), body: s(8000), validUntil: day.nullable().optional() })));
  if (a === "materials" && b && c === "status") return ins.setMaterialStatus(me, b, (await body(req, z.object({ status: z.enum(["draft", "published", "archived"]) }))).status);
  if (a === "notices" && b === "read") { await salesAdmin(me); return readNotices(me); }
  throw NF();
}
