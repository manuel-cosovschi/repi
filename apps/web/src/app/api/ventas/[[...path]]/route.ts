// REPI Sales Dashboard (D209). Toda autorización vive en los servicios: cada operación resuelve el vendedor desde la sesión
// (nunca desde parámetros) y filtra por sus propios registros. Un recurso ajeno responde 404 y queda en la auditoría.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import { assertEnabled, myNotices, readNotices } from "@/server/sales/core";
import * as reps from "@/server/sales/reps";
import * as crm from "@/server/sales/crm";
import * as deals from "@/server/sales/deals";
import * as com from "@/server/sales/commissions";
import * as pay from "@/server/sales/payouts";
import * as ins from "@/server/sales/insights";

type Ctx = { params: Promise<{ path?: string[] }> };
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const s = (n: number) => z.string().max(n).nullable().optional();
const int = z.number().int().nullable().optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const prospect = z.object({
  kind: z.enum(["gym", "coach"]).optional(), name: z.string().max(120), legalName: s(160), cuit: s(20), city: s(80), province: s(80), address: s(200), estMembers: int, locations: int,
  website: s(200), instagram: s(120), phone: s(40), email: s(200), contactName: s(80), contactRole: s(80), contactChannel: z.enum(["whatsapp", "phone", "email", "in_person"]).nullable().optional(),
  notes: s(2000), source: s(30), capturedOn: day.nullable().optional(),
});
const opportunity = z.object({
  kind: z.enum(["new", "renewal", "modification"]).optional(), category: z.enum(["hot", "warm", "cold"]).nullable().optional(), probabilityPct: int, estMembers: int, estUnitPriceMinor: int,
  currency: z.enum(["ARS", "USD"]).optional(), nextContactOn: day.nullable().optional(), expectedCloseOn: day.nullable().optional(), notes: s(2000),
});
const deal = z.object({
  prospectId: s(64), opportunityId: s(64), kind: z.enum(["new", "renewal", "modification"]).optional(), clientKind: z.enum(["gym", "coach"]), orgId: s(64),
  businessName: z.string().max(120), legalName: s(160), cuit: s(20), contactName: z.string().max(80), contactEmail: s(200), contactPhone: s(40), city: s(80), province: s(80), address: s(200),
  locations: z.array(z.string().max(80)).max(30).nullable().optional(), members: z.number().int(), unitPriceMinor: z.number().int(), currency: z.enum(["ARS", "USD"]), periodicity: z.string().max(20),
  contractStart: z.string().max(10), durationMonths: int, renewalNote: s(300), discountBps: int, setupFeeMinor: int, specialConditions: s(1000), evidence: z.string().max(1000), closedOn: z.string().max(10), notes: s(1000),
});

export const GET = handle<Ctx>(async (req, { params }) => {
  assertEnabled();
  const [a, b] = (await params).path ?? [];
  const u = new URL(req.url);
  if (a === "activar" && b) { await limit("sales-invite-info", 20); return reps.lookupRepInvitation(b); }
  const me = await sessionUserId();
  switch (a) {
    case "dashboard": return ins.myDashboard(me, u.searchParams.get("period") ?? "month");
    case "pipeline": return crm.myPipeline(me, { q: u.searchParams.get("q"), stage: u.searchParams.get("stage") });
    case "prospects": if (b) return crm.prospectDetail(me, b); break;
    case "agenda": return crm.myAgenda(me);
    case "deals": return b ? deals.myDeal(me, b) : deals.myDeals(me);
    case "clients": return deals.myClients(me);
    case "commissions": return com.myCommissions(me);
    case "payouts": if (b) return pay.myBatch(me, b); break;
    case "targets": return ins.myTargets(me);
    case "materials": return ins.myMaterials(me);
    case "notices": return myNotices(me);
    case "profile": return reps.myProfile(me);
  }
  throw NF();
});

export const POST = handle<Ctx>(async (req, { params }) => {
  assertEnabled();
  const [a, b, c] = (await params).path ?? [];
  if (a === "activar" && b) { await limit("sales-invite-accept", 10); return reps.acceptRepInvitation(await sessionUserId(), b); }
  const me = await sessionUserId();
  await limit(`ventas:${me}`, 60);
  if (a === "prospects" && !b) return crm.createProspect(me, await body(req, prospect.extend({ opportunity: opportunity.nullable().optional(), duplicateAck: z.boolean().optional(), duplicateMessage: s(500) })));
  if (a === "prospects" && b && !c) return crm.updateProspect(me, b, await body(req, prospect.partial()));
  if (a === "prospects" && b && c === "opportunities") return crm.createOpportunity(me, b, await body(req, opportunity));
  if (a === "prospects" && b && c === "activities") return crm.addActivity(me, b, await body(req, z.object({ kind: z.string().max(20), summary: z.string().max(1000), opportunityId: s(64), dueOn: day.nullable().optional() })));
  if (a === "opportunities" && b && !c) return crm.updateOpportunity(me, b, await body(req, opportunity.extend({ revision: z.number().int() })));
  if (a === "opportunities" && b && c === "stage") return crm.moveStage(me, b, await body(req, z.object({ to: z.string().max(30), reason: s(300), revision: z.number().int() })));
  if (a === "activities" && b && c === "done") return crm.completeActivity(me, b);
  if (a === "duplicates") return crm.checkDuplicates(me, await body(req, z.object({ name: z.string().max(120), cuit: s(20), email: s(200), phone: s(40), website: s(200), city: s(80) })));
  if (a === "deals" && !b) return deals.declareDeal(me, await body(req, deal.extend({ idempotencyKey: z.string().max(64) })));
  if (a === "deals" && b && !c) return deals.updateDeal(me, b, await body(req, deal.extend({ revision: z.number().int() })));
  if (a === "deals" && b && c === "withdraw") return deals.withdrawDeal(me, b);
  if (a === "requests") return deals.requestReview(me, await body(req, z.object({ kind: z.enum(["duplicate_review", "attribution_claim"]), prospectId: s(64), message: z.string().max(1000) })));
  if (a === "profile" && !b) return reps.updateMyProfile(me, await body(req, z.object({ phone: s(40), city: s(80), province: s(80), zone: s(120) })));
  if (a === "profile" && b === "frequency") return reps.requestPayoutFrequency(me, await body(req, z.object({ frequency: z.enum(["per_sale", "weekly", "biweekly", "monthly", "custom"]), message: s(500) })));
  if (a === "notices" && b === "read") return readNotices(me);
  throw NF();
});
