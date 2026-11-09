// Consola de Repi Admin (anexo §3–4, §9). Toda autorización (Admin + 2FA) vive en los servicios. Sin cobros reales.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import * as cm from "@/server/commercial/services";
import * as pv from "@/server/privacy/services";
import * as sp from "@/server/support/services";
import * as bp from "@/server/commercial/payments";
import * as an from "@/server/announcements/services";
import * as se from "@/server/site/events";
import * as ab from "@/server/brain/admin";
import { salesGet, salesPost } from "@/server/sales/admin-routes";
import { ADMIN_DEADLINE_MS } from "@/server/deadline";

// Incidente 07/11 (corte a los 300 s): REPI Admin responde 503 a los 25 s si algo no termina, y la función se corta a los 60 s.
export const maxDuration = 60;
const admin = { deadlineMs: ADMIN_DEADLINE_MS };

type Ctx = { params: Promise<{ path?: string[] }> };
const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET = handle<Ctx>(async (req, { params }) => {
  const [a, b, c] = (await params).path ?? [];
  const me = await sessionUserId();
  const u = new URL(req.url);
  if (a === "sales") return salesGet(me, ((await params).path ?? []).slice(1), u.searchParams); // D209
  if (a === "summary") return cm.adminSummary(me);
  if (a === "announcements") return an.adminAnnouncements(me); // D202
  if (a === "site") return se.siteSummary(me, Number(u.searchParams.get("days")) || 30); // D205
  if (a === "brain" && !b) return ab.brainMetrics(me, { days: Number(u.searchParams.get("days")) || 7 }); // D210: Coaching IA (agregados)
  if (a === "clients") return cm.listClients(me);
  if (a === "privacy") return pv.listPrivacyRequests(me);
  if (a === "support") { const f = u.searchParams.get("filter"); return sp.listTickets(me, f === "resolved" || f === "all" || f === "ideas" ? f : "active"); }
  if (a === "contracts" && b && c === "payments") return bp.contractPayments(me, b);
  if (a === "contracts" && b) {
    const start = u.searchParams.get("start"), end = u.searchParams.get("end");
    return cm.contractDetail(me, b, start && end && day.safeParse(start).success && day.safeParse(end).success ? { start, end } : undefined);
  }
  throw NF();
}, admin);

export const POST = handle<Ctx>(async (req, { params }) => {
  const [a, b, c] = (await params).path ?? [];
  const me = await sessionUserId();
  await limit(`admin:${me}`, 60);
  if (a === "sales") return salesPost(me, ((await params).path ?? []).slice(1), req); // D209
  if (a === "clients" && !b) {
    return cm.createClient(me, await body(req, z.object({
      kind: z.enum(["gym", "coach"]), orgName: z.string().max(120), legalName: z.string().max(160).nullable().optional(), responsibleName: z.string().max(80), responsibleEmail: z.string().max(200), currency: z.string().max(3),
      scope: z.enum(["organization", "locations"]).optional(), scopeNote: z.string().max(300).nullable().optional(), quantityDefinition: z.string().max(300).nullable().optional(), locations: z.array(z.string().max(80)).max(30).optional(),
    })));
  }
  if (a === "support" && b && !c) {
    return sp.updateTicket(me, b, await body(req, z.object({
      status: z.enum(["open", "in_progress", "resolved"]).optional(), severity: z.enum(["normal", "incident"]).optional(),
      internalNote: z.string().max(1000).nullable().optional(), resolution: z.string().max(1000).nullable().optional(),
    })));
  }
  if (a === "payments" && b && c === "void") return bp.voidPayment(me, b, (await body(req, z.object({ reason: z.string().max(200) }))).reason);
  if (a === "privacy" && b && c === "resolve") return pv.resolvePrivacyRequest(me, b, await body(req, z.object({ status: z.enum(["done", "rejected"]), resolution: z.string().max(500) })));
  if (a === "clients" && b && c === "regularize") {
    return cm.regularize(me, b, await body(req, z.object({ legalName: z.string().max(160).nullable().optional(), responsibleName: z.string().max(80), responsibleEmail: z.string().max(200), currency: z.string().max(3) })));
  }
  if (a === "contracts" && b) {
    switch (c) {
      case "accept": return cm.recordAcceptance(me, b, await body(req, z.object({ method: z.enum(["external", "in_app"]), ref: z.string().max(200), acceptedAt: day, termsVersion: z.string().max(40) })));
      case "enable": return cm.enableClient(me, b, await body(req, z.object({ trialUntil: day.nullable().optional() })));
      case "suspend": return cm.suspendClient(me, b, (await body(req, z.object({ reason: z.string().max(300) }))).reason);
      case "trial": return cm.setTrial(me, b, await body(req, z.object({ trialUntil: day.nullable(), reason: z.string().max(300) })));
      case "definition": return cm.setQuantityDefinition(me, b, await body(req, z.object({ definition: z.string().max(300), reason: z.string().max(300) })));
      case "terms": return cm.addTerm(me, b, await body(req, z.object({ kind: z.enum(["quantity", "unit_price"]), value: z.number().int().nonnegative(), effectiveFrom: day, reason: z.string().max(300), evidence: z.string().max(300).nullable().optional() })));
      case "payments": return bp.recordPayment(me, b, await body(req, z.object({
        amountMinor: z.number().int(), receivedOn: day, method: z.enum(["transferencia", "deposito", "efectivo", "otro"]), reference: z.string().max(200),
        snapshotId: z.string().max(64).nullable().optional(), note: z.string().max(300).nullable().optional(),
      })));
      case "close": return cm.closePeriodSimulated(me, b, await body(req, z.object({ start: day, end: day })));
      case "invite": return cm.sendOwnerInvitation(me, b);
      case "revoke-invite": return cm.revokeOwnerInvitation(me, b);
      case "update": return cm.updateClient(me, b, await body(req, z.object({
        orgName: z.string().max(120).optional(), legalName: z.string().max(160).nullable().optional(), currency: z.string().max(3).optional(),
        scope: z.enum(["organization", "locations"]).optional(), scopeNote: z.string().max(300).nullable().optional(),
        acceptedRef: z.string().max(200).optional(), acceptedAt: day.optional(), termsVersion: z.string().max(40).optional(), enabledAt: day.optional(),
      })));
      case "access": return cm.setClientAccessControl(me, b, (await body(req, z.object({ on: z.boolean() }))).on);
      case "control": return cm.setClientControl(me, b, await body(req, z.object({ routinePolicy: z.enum(["open", "supervised"]).optional(), kioskEnabled: z.boolean().optional() })));
      case "connect": return cm.setClientConnect(me, b, (await body(req, z.object({ on: z.boolean() }))).on);
      case "delete": return cm.deleteClient(me, b, (await body(req, z.object({ confirmName: z.string().max(160) }))).confirmName);
      case "responsible": return cm.changeResponsible(me, b, await body(req, z.object({ name: z.string().max(80), email: z.string().max(200) })));
    }
  }
  // Novedades de REPI (D202): borrador, edición, publicación (ahora o programada), archivo.
  if (a === "announcements") {
    const draft = z.object({ kind: z.enum(["feature", "improvement", "important", "guide", "notice"]), title: z.string().max(200), summary: z.string().max(600), ctaLabel: z.string().max(60).nullable().optional(),
      destination: z.string().max(40), audience: z.array(z.enum(["all", "member", "coach", "floor", "gym_admin", "admin"])).min(1).max(6) });
    if (!b) return an.createAnnouncement(me, await body(req, draft));
    if (!c) return an.updateAnnouncement(me, b, await body(req, draft.extend({ revision: z.number().int().positive() })));
    if (c === "publish") return an.publishAnnouncement(me, b, await body(req, z.object({ at: z.string().max(40).nullable().optional() })));
    if (c === "archive") return an.archiveAnnouncement(me, b);
    if (c === "unschedule") return an.unscheduleAnnouncement(me, b);
  }
  if (a === "leads" && b) return cm.setLeadStatus(me, b, (await body(req, z.object({ status: z.enum(["contacted", "converted", "discarded"]) }))).status);
  if (a === "corrections" && b) return cm.answerCorrection(me, b, (await body(req, z.object({ answer: z.string().max(800) }))).answer);
  throw NF();
}, admin);

// D210 · Coaching IA: límites de la IA del cerebro (global u organización). Validación estricta en el servicio.
export const PUT = handle<Ctx>(async (req, { params }) => {
  const [a, b] = (await params).path ?? [];
  const me = await sessionUserId();
  await limit(`admin:${me}`, 60);
  if (a === "brain" && (!b || b === "policy")) return ab.updateBrainPolicy(me, await body(req, z.object({ scope: z.string().max(80), config: z.record(z.string(), z.unknown()) })));
  throw NF();
}, admin);
