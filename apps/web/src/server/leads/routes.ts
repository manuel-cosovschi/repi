// REPI Admin › Captación (D218). Despacho de /api/admin/captacion/*. Cada servicio exige Admin con 2FA (leadsAdmin).
import { z } from "zod";
import { INTENTS, LEAD_STAGES, OBJECTIONS, VARIANTS } from "@repi/domain";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { body } from "../access/http";
import { NF, ensureAreas, getSettings, leadArea, leadsAdmin, saveSettings } from "./core";
import * as crm from "./crm";
import * as msg from "./messaging";
import * as camp from "./campaigns";
import * as ins from "./insights";
import * as pipe from "./pipeline";

const s = (n: number) => z.string().max(n).nullable().optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const leadInput = z.object({
  name: z.string().max(160), city: z.string().max(80), province: s(80), locality: s(80), address: s(200), website: s(300), instagram: s(120), facebook: s(300),
  email: s(200), phone: s(40), whatsapp: s(40), category: s(30), positioning: s(300), branches: z.number().int().nullable().optional(), estMembers: z.number().int().nullable().optional(),
  contactName: s(120), contactRole: s(80), notes: s(1000), sourceUrl: s(500),
});
const srcRef = z.object({ url: s(500), type: s(40), seenAt: s(20) });
const importRow = leadInput.partial().extend({ name: z.string().max(160), city: z.string().max(80).nullable(), sources: z.record(z.string(), srcRef).optional(), externalRef: s(120) });

export async function leadsGet(me: string, path: string[], q: URLSearchParams): Promise<unknown> {
  const [a, b] = path;
  switch (a) {
    case "today": return ins.todayView(me);
    case "list": return crm.listLeads(me, { q: q.get("q"), stage: q.get("stage"), city: q.get("city"), band: q.get("band"), view: q.get("view"), page: Number(q.get("page")) || 1, sort: q.get("sort") });
    case "lead": if (b) return crm.leadDetail(me, b); break;
    case "dashboard": return ins.dashboard(me, { days: Number(q.get("days")) || 30 });
    case "campaigns": return b ? camp.campaignDetail(me, b) : camp.listCampaigns(me);
    case "runs": return pipe.runsList(me);
    case "settings": { await leadsAdmin(me); await ensureAreas(); return { settings: await getSettings(), areas: await db.select().from(leadArea).orderBy(leadArea.tier, leadArea.name) }; }
    case "export": {
      if (b === "csv" || b === "xls") {
        const data = b === "csv" ? await crm.exportCsv(me) : await crm.exportXls(me);
        const stamp = new Date().toISOString().slice(0, 10);
        return new Response(data, { headers: { "content-type": b === "csv" ? "text/csv; charset=utf-8" : "application/vnd.ms-excel; charset=utf-8", "content-disposition": `attachment; filename="repi-captacion-${stamp}.${b}"`, "cache-control": "no-store" } });
      }
    }
  }
  throw NF();
}

export async function leadsPost(me: string, path: string[], req: Request): Promise<unknown> {
  const [a, b, c] = path;
  if (a === "lead" && !b) return crm.saveManual(me, await body(req, leadInput));
  if (a === "lead" && b) {
    switch (c) {
      case "update": return crm.saveManual(me, await body(req, leadInput), b);
      case "stage": return msg.setStage(me, b, await body(req, z.object({ stage: z.string().max(40), note: s(300), lostReason: s(200) })));
      case "note": return msg.addNote(me, b, (await body(req, z.object({ text: z.string().max(2000) }))).text);
      case "task": return msg.addTask(me, b, await body(req, z.object({ kind: z.string().max(30), dueOn: day, dueAt: s(16), note: s(500) })));
      case "draft": return msg.createDraft(me, b, await body(req, z.object({ variant: z.enum(VARIANTS), channel: z.enum(["whatsapp", "email", "instagram"]).nullable().optional(), objection: z.enum(OBJECTIONS).nullable().optional(), useAi: z.boolean().optional() })));
      case "reply": return msg.recordReply(me, b, await body(req, z.object({ channel: z.string().max(20), text: z.string().max(4000), receivedOn: day.nullable().optional() })));
      case "suppress": return msg.suppress(me, b, (await body(req, z.object({ reason: z.string().max(200) }))).reason);
      case "exclude": return crm.setExclusion(me, b, await body(req, z.object({ exclude: z.boolean(), note: s(200) })));
      case "signals": return crm.setTechSignals(me, b, (await body(req, z.object({ signals: z.array(z.object({ kind: z.string().max(30), evidence: z.string().max(200) })).max(5) }))).signals);
      case "review": return crm.resolveReview(me, b, (await body(req, z.object({ action: z.enum(["distinct", "merge"]) }))).action);
      case "assign": return crm.assignToRep(me, b, await body(req, z.object({ repId: z.string().max(64), reason: z.string().max(300) })));
      case "enrich": return pipe.runStep(me, "enrich", { ids: [b] });
      case "refresh": return pipe.refreshOne(me, b);
    }
  }
  if (a === "fact" && b) return crm.verifyFact(me, b, (await body(req, z.object({ status: z.enum(["verified", "rejected"]) }))).status);
  if (a === "message" && b) {
    switch (c) {
      case "edit": return msg.updateDraft(me, b, await body(req, z.object({ body: z.string().max(4000), subject: s(200) })));
      case "sent": return msg.confirmSent(me, b, await body(req, z.object({ sentOn: day.nullable().optional() })));
      case "cancel": return msg.cancelMessage(me, b);
      case "send-email": await leadsAdmin(me); return msg.sendEmailNow(me, b);
      case "review": return msg.reviewReply(me, b, (await body(req, z.object({ intent: z.enum(INTENTS) }))).intent);
      case "uncampaign": return camp.removeFromCampaign(me, b);
    }
  }
  if (a === "task" && b) return msg.closeTask(me, b, (await body(req, z.object({ status: z.enum(["done", "cancelled"]) }))).status);
  if (a === "campaigns" && !b) return camp.createCampaign(me, await body(req, z.object({ name: z.string().max(120), channel: z.enum(["whatsapp", "email", "instagram", "best"]), variant: s(30), areaIds: z.array(z.string().max(64)).max(20).optional(), minScore: z.number().int().optional(), maxRecipients: z.number().int().optional(), dailyLimit: z.number().int().optional() })));
  if (a === "campaigns" && b) {
    switch (c) {
      case "build": return camp.buildCampaign(me, b);
      case "submit": return camp.submitCampaign(me, b);
      case "approve": return camp.approveCampaign(me, b, await body(req, z.object({ confirm: z.boolean() })));
      case "status": return camp.setCampaignStatus(me, b, (await body(req, z.object({ status: z.enum(["paused", "approved", "closed", "draft"]) }))).status);
      case "send": return camp.sendCampaignBatch(me, b);
    }
  }
  if (a === "run" && b) return pipe.runStep(me, b as pipe.Step, await body(req, z.object({ areaIds: z.array(z.string().max(64)).max(20).optional() })));
  if (a === "import") return crm.importLeads(me, (await body(req, z.object({ label: z.string().max(120), rows: z.array(importRow).max(500) }))).rows as crm.ImportRow[], { label: "Importación" });
  if (a === "exclusions") return crm.importExclusions(me, (await body(req, z.object({ rows: z.array(z.object({ name: z.string().max(160), city: s(80), reason: z.string().max(200) })).max(300) }))).rows);
  if (a === "agent") return ins.askAgent(me, (await body(req, z.object({ question: z.string().max(300) }))).question);
  if (a === "settings") {
    const p = await body(req, z.object({
      weights: z.record(z.string(), z.number().int()).optional(), cadence: z.object({ steps: z.array(z.number().int()).max(6), businessDaysOnly: z.boolean() }).optional(),
      schedule: z.object({ enabled: z.boolean(), days: z.array(z.number().int()).max(7), discovery: z.string(), enrich: z.string(), score: z.string(), compose: z.string(), outreach: z.string(), followup: z.string(), report: z.string() }).optional(),
      sender: z.object({ name: z.string().max(80), company: z.string().max(80), product: z.string().max(40), site: z.string().max(80), whatsapp: z.string().max(40), replyTo: z.string().max(200) }).optional(),
      autopilot: z.object({ enabled: z.boolean(), dailyLimit: z.number().int(), window: z.object({ from: z.string(), to: z.string() }), followups: z.boolean(), minScore: z.number().int().min(0).max(100) }).optional(),
      booking: z.object({ enabled: z.boolean(), days: z.array(z.number().int().min(0).max(6)).max(7), from: z.string(), to: z.string(), slotMin: z.number().int(), horizonDays: z.number().int(), minNoticeHours: z.number().int().min(0).max(72), meetingUrl: z.string().max(300) }).optional(),
      notify: z.object({ email: z.boolean(), meetingReminderMin: z.number().int().min(5).max(240) }).optional(),
      socialProof: z.string().max(300).optional(), allowedClientNames: z.array(z.string().max(80)).max(20).optional(), presentationUrl: z.string().max(300).optional(), demoUrl: z.string().max(300).optional(),
      limits: z.object({ discoveryAreasPerRun: z.number().int(), enrichPerRun: z.number().int(), composePerRun: z.number().int(), emailPerDay: z.number().int(), maxChars: z.number().int() }).optional(),
      channels: z.object({ emailSend: z.boolean(), whatsappApi: z.literal(false) }).optional(), aiCompose: z.boolean().optional(), aiClassify: z.boolean().optional(),
      customStages: z.array(z.string().max(40)).max(10).optional(), pricing: z.object({ currency: z.literal("ARS"), tiers: z.array(z.object({ minMembers: z.number().int().min(0), unitMinor: z.number().int().positive() })).min(1).max(8), examples: z.array(z.object({ members: z.number().int().positive(), unitMinor: z.number().int().positive() })).max(3) }).optional(),
    }));
    if (p.customStages?.some((x) => (LEAD_STAGES as readonly string[]).includes(x))) throw NF();
    const out = await saveSettings(me, p as never);
    if (p.weights) await pipe.runStep(me, "score");
    return out;
  }
  if (a === "area" && b) {
    await leadsAdmin(me);
    const p = await body(req, z.object({ enabled: z.boolean().optional(), tier: z.number().int().min(1).max(3).optional(), radiusKm: z.number().min(1).max(60).optional() }));
    await db.update(leadArea).set(p).where(eq(leadArea.id, b));
    return { ok: true };
  }
  if (a === "area" && !b) {
    await leadsAdmin(me);
    const p = await body(req, z.object({ name: z.string().max(80), province: s(80), tier: z.number().int().min(1).max(3), lat: z.number().min(-56).max(-21), lng: z.number().min(-74).max(-53), radiusKm: z.number().min(1).max(60) }));
    const [r] = await db.insert(leadArea).values({ ...p, enabled: true }).onConflictDoNothing().returning();
    return r ?? { exists: true };
  }
  throw NF();
}
