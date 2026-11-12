// D218 · Campañas. Antes del primer envío se muestra destinatarios, canal, textos, cantidad, costo estimado y la base del
// contacto; recién con la aprobación explícita del Admin los mensajes quedan «aprobados». WhatsApp sin consentimiento
// registrado: siempre envío manual uno a uno (wa.me). Email por proveedor: sólo si el canal está habilitado en Ajustes.
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { VARIANTS, LEAD_STAGE_LABEL, type LeadStage, type Variant } from "@repi/domain";
import { db } from "@/db";
import { bad, getLead, getSettings, leadBusiness, leadCampaign, leadMessage, leadsAdmin, logLead, NF } from "./core";
import { bestChannel, contactLinks, createDraft, sendEmailNow, type Channel } from "./messaging";

export async function listCampaigns(actorId: string) {
  await leadsAdmin(actorId);
  const rows = await db.select().from(leadCampaign).orderBy(desc(leadCampaign.createdAt));
  const counts = await db.select({ c: leadMessage.campaignId, status: leadMessage.status, n: sql<number>`count(*)::int` }).from(leadMessage).where(sql`${leadMessage.campaignId} is not null`).groupBy(leadMessage.campaignId, leadMessage.status);
  return rows.map((c) => ({ ...c, counts: Object.fromEntries(counts.filter((x) => x.c === c.id).map((x) => [x.status, x.n])) }));
}
export async function createCampaign(actorId: string, p: { name: string; channel: Channel | "best"; variant?: string | null; areaIds?: string[]; minScore?: number; maxRecipients?: number; dailyLimit?: number }) {
  await leadsAdmin(actorId);
  if (!p.name.trim()) throw bad("Poné un nombre.");
  if (!["whatsapp", "email", "instagram", "best"].includes(p.channel)) throw bad("Canal inválido.");
  const variant = (p.variant && (VARIANTS as readonly string[]).includes(p.variant) ? p.variant : p.channel === "email" ? "email" : "first_contact") as Variant;
  const max = Math.min(Math.max(p.maxRecipients ?? 10, 1), 100);
  const [c] = await db.insert(leadCampaign).values({ name: p.name.trim().slice(0, 120), channel: p.channel, variant, areaIds: p.areaIds ?? [], minScore: Math.max(0, Math.min(100, p.minScore ?? 0)), maxRecipients: max, dailyLimit: Math.min(Math.max(p.dailyLimit ?? 10, 1), 50), createdBy: actorId }).returning();
  return c;
}

const ADDR = { whatsapp: sql`${leadBusiness.whatsapp}`, email: sql`${leadBusiness.email}`, instagram: sql`${leadBusiness.instagram}`, best: sql`coalesce(${leadBusiness.whatsapp}, ${leadBusiness.email}, ${leadBusiness.instagram})` } as const;
/** Arma la lista: contactables por el canal, sin exclusiones ni vendedor asignado, sin envíos previos, mejores primero. */
export async function buildCampaign(actorId: string, id: string) {
  await leadsAdmin(actorId);
  const [c] = await db.select().from(leadCampaign).where(eq(leadCampaign.id, id));
  if (!c) throw NF();
  if (c.status !== "draft") throw bad("Sólo se arma una campaña en borrador.");
  const leads = await db.select().from(leadBusiness).where(and(
    inArray(leadBusiness.stage, ["validated", "qualified", "to_contact", "prepared"]), eq(leadBusiness.doNotContact, false), isNull(leadBusiness.exclusion), isNull(leadBusiness.repId), isNull(leadBusiness.reviewOfId),
    sql`${ADDR[c.channel]} is not null`, sql`${leadBusiness.score} >= ${c.minScore}`, isNull(leadBusiness.firstSentOn),
    c.areaIds.length ? inArray(leadBusiness.areaId, c.areaIds) : sql`true`,
  )).orderBy(desc(leadBusiness.score), asc(leadBusiness.name)).limit(c.maxRecipients);
  let added = 0;
  for (const b of leads) {
    const ch = c.channel === "best" ? bestChannel(b) : c.channel;
    if (!ch) continue;
    const [existing] = await db.select().from(leadMessage).where(and(eq(leadMessage.businessId, b.id), eq(leadMessage.direction, "out"), eq(leadMessage.channel, ch), inArray(leadMessage.status, ["draft", "approved"]), sql`coalesce(${leadMessage.step}, 0) = 0`)).limit(1);
    if (existing) { if (existing.campaignId !== c.id) await db.update(leadMessage).set({ campaignId: c.id }).where(eq(leadMessage.id, existing.id)); }
    else await createDraft(actorId, b.id, { variant: (c.channel === "best" ? "first_contact" : c.variant) as Variant, channel: ch, campaignId: c.id });
    added++;
  }
  return { added };
}
export async function campaignDetail(actorId: string, id: string) {
  await leadsAdmin(actorId);
  const [c] = await db.select().from(leadCampaign).where(eq(leadCampaign.id, id));
  if (!c) throw NF();
  const s = await getSettings();
  const msgs = await db.select({ m: leadMessage, b: leadBusiness }).from(leadMessage).innerJoin(leadBusiness, eq(leadBusiness.id, leadMessage.businessId)).where(eq(leadMessage.campaignId, id)).orderBy(desc(leadBusiness.score));
  const recipients = msgs.map(({ m, b }) => ({
    messageId: m.id, businessId: b.id, name: b.name, city: b.city, score: b.score, stage: b.stage, stageLabel: LEAD_STAGE_LABEL[b.stage as LeadStage] ?? b.stage, to: m.toAddress,
    channel: m.channel, subject: m.subject, body: m.body, status: m.status, guardIssues: m.guardIssues, generatedBy: m.generatedBy, sentAt: m.sentAt, error: m.error,
    reason: (b.scoreLines as { points: number; why: string }[]).slice().sort((x, y) => y.points - x.points).slice(0, 2).map((l) => l.why).join(" · "),
    links: m.status === "approved" ? contactLinks(m, b, s.sender) : [],
  }));
  return { campaign: c, recipients, preview: approvalPreview(c, recipients, s.channels.emailSend) };
}
function approvalPreview(c: typeof leadCampaign.$inferSelect, r: { status: string; guardIssues: string[] }[], emailSend: boolean) {
  const live = r.filter((x) => x.status === "draft" || x.status === "approved");
  const sendMode: "manual" | "provider" = c.channel === "email" && emailSend ? "provider" : "manual";
  return {
    count: live.length, blocked: live.filter((x) => x.guardIssues.length).length, sendMode,
    costNote: c.channel === "best" ? "Sin costo: cada mensaje se envía a mano por el mejor canal publicado del gimnasio (WhatsApp con wa.me, Gmail o Instagram)." : c.channel === "whatsapp" ? "Sin costo: envío manual desde WhatsApp (wa.me), uno por uno." : c.channel === "email" ? (sendMode === "provider" ? `Email por el proveedor configurado (Resend): dentro del plan actual; tope ${c.dailyLimit} por día.` : "Sin costo: se abre Gmail con el borrador y se envía a mano.") : "Sin costo: mensaje manual desde el perfil de Instagram.",
    consentNote: c.channel === "best" ? "Primer contacto comercial B2B a datos que el negocio publica. Sin consentimiento registrado: nada automático; cada mensaje lo envía una persona. Los emails llevan identificación y baja; responder «no» o «baja» corta todo." : c.channel === "whatsapp" ? "Primer contacto comercial B2B al número que el negocio publica. Sin consentimiento registrado: no se usa API ni envío automático; cada mensaje lo envía una persona y responde «no» o «baja» corta todo." : c.channel === "email" ? "Email comercial B2B a la dirección pública del negocio, con identificación del remitente y baja en un clic (Ley 25.326, art. 27: el destinatario puede pedir el retiro o bloqueo)." : "Mensaje directo manual al perfil empresarial. Sin automatización.",
  };
}
export async function submitCampaign(actorId: string, id: string) {
  await leadsAdmin(actorId);
  const d = await campaignDetail(actorId, id);
  if (d.campaign.status !== "draft") throw bad("La campaña no está en borrador.");
  if (!d.preview.count) throw bad("No hay destinatarios: armá la lista primero.");
  await db.update(leadCampaign).set({ status: "pending_approval", updatedAt: new Date() }).where(eq(leadCampaign.id, id));
  return { ok: true };
}
/** Aprobación explícita: congela destinatarios y textos (hash). Editar un texto después lo saca de la aprobación. */
export async function approveCampaign(actorId: string, id: string, p: { confirm: boolean }) {
  await leadsAdmin(actorId);
  if (p.confirm !== true) throw bad("Confirmá que revisaste destinatarios y textos.");
  const s = await getSettings();
  const d = await campaignDetail(actorId, id);
  if (d.campaign.status !== "pending_approval") throw bad("Primero enviá la campaña a aprobación.");
  const live = d.recipients.filter((r) => r.status === "draft" || r.status === "approved");
  if (!live.length) throw bad("No hay mensajes para aprobar.");
  if (live.some((r) => r.guardIssues.length)) throw bad("Hay mensajes con advertencias: corregilos o sacalos de la campaña.");
  const textHash = createHash("sha256").update(live.map((r) => `${r.messageId}:${r.subject ?? ""}:${r.body}`).join("\n")).digest("hex");
  const approval = { recipients: live.map((r) => r.businessId), messageIds: live.map((r) => r.messageId), textHash, count: live.length, costNote: d.preview.costNote, consentNote: d.preview.consentNote, sendMode: d.preview.sendMode };
  await db.transaction(async (tx) => {
    await tx.update(leadMessage).set({ status: "approved", approvedBy: actorId, approvedAt: new Date() }).where(inArray(leadMessage.id, approval.messageIds));
    await tx.update(leadCampaign).set({ status: "approved", approval, approvedBy: actorId, approvedAt: new Date(), updatedAt: new Date() }).where(eq(leadCampaign.id, id));
    for (const r of live) await logLead(tx, { businessId: r.businessId, kind: "approved", summary: `Mensaje aprobado en la campaña «${d.campaign.name}» (${d.preview.sendMode === "provider" ? "envío por proveedor" : "envío manual"})`, actorUserId: actorId, actorRole: "admin" });
    await tx.insert((await import("@/db")).schema.auditEvent).values({ actorUserId: actorId, action: "leads.campaign_approved", resourceType: "lead_campaign", resourceId: id, result: "ok", meta: { count: approval.count, channel: d.campaign.channel, sendMode: approval.sendMode, textHash, emailSend: s.channels.emailSend } });
  });
  return { ok: true, ...approval };
}
export async function setCampaignStatus(actorId: string, id: string, status: "paused" | "approved" | "closed" | "draft") {
  await leadsAdmin(actorId);
  const [c] = await db.select().from(leadCampaign).where(eq(leadCampaign.id, id));
  if (!c) throw NF();
  if (status === "approved" && c.status !== "paused") throw bad("Sólo se reanuda una campaña pausada.");
  if (status === "draft" && c.status !== "pending_approval") throw bad("Sólo vuelve a borrador una campaña pendiente de aprobación.");
  await db.update(leadCampaign).set({ status, updatedAt: new Date() }).where(eq(leadCampaign.id, id));
  if (status === "closed") await db.update(leadMessage).set({ status: "cancelled" }).where(and(eq(leadMessage.campaignId, id), inArray(leadMessage.status, ["draft", "approved"])));
  return { ok: true };
}
/** Envía por proveedor los emails aprobados pendientes, respetando el tope diario. Se detiene ante el primer rechazo. */
export async function sendCampaignBatch(actorId: string, id: string) {
  await leadsAdmin(actorId);
  const [c] = await db.select().from(leadCampaign).where(eq(leadCampaign.id, id));
  if (!c || c.status !== "approved" || c.approval?.sendMode !== "provider") throw bad("La campaña no está aprobada para envío por proveedor.");
  const pending = await db.select({ id: leadMessage.id }).from(leadMessage).where(and(eq(leadMessage.campaignId, id), eq(leadMessage.status, "approved"))).limit(c.dailyLimit);
  let sent = 0;
  for (const m of pending) {
    try { await sendEmailNow(actorId, m.id); sent++; } catch (e) {
      await db.update(leadCampaign).set({ status: "paused", updatedAt: new Date() }).where(eq(leadCampaign.id, id));
      return { sent, paused: true, reason: (e as Error).message };
    }
  }
  return { sent, paused: false };
}
export async function removeFromCampaign(actorId: string, messageId: string) {
  await leadsAdmin(actorId);
  const [m] = await db.select().from(leadMessage).where(eq(leadMessage.id, messageId));
  if (!m) throw NF();
  if (m.status === "sent") throw bad("Ya se envió.");
  await db.update(leadMessage).set({ campaignId: null, status: "draft", approvedAt: null, approvedBy: null }).where(eq(leadMessage.id, messageId));
  await getLead(m.businessId);
  return { ok: true };
}
