// D218 · Piloto automático de Captación (autorizado por el titular el 12/11/2026: «Tiene que estar todo automatizado… para que
// yo no tenga que hacer nada hasta que me llegue un WhatsApp o una reunión en el calendario o un reminder»).
// - Email: primer mensaje y un seguimiento, sin intervención, dentro de la franja y el tope diario; identificación y baja.
//   Las respuestas van al email comercial del titular; cada mensaje invita a WhatsApp y a la agenda.
// - WhatsApp e Instagram NO se automatizan: las plataformas prohíben mensajes en frío sin consentimiento.
// - Agenda pública: el gimnasio elige horario → reunión, invitación de calendario (.ics) al titular y al gimnasio.
// - Avisos al titular por email: reunión agendada, recordatorio antes de cada reunión y resumen diario sólo si hay algo.
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { bookingSlots, canAutoMove, emailNorm, icsInvite, normPhoneAR, type LeadStage } from "@repi/domain";
import { db, schema } from "@/db";
import { deliverMail } from "../mailer";
import { logError } from "../log";
import {
  appUrl, bookingSigner, getLead, getSettings, leadBusiness, leadCampaign, leadMessage, leadTask, logLead, replyAddress, stopSigner, stopUrl, today, unsubscribeUrl,
} from "./core";
import { createDraft, sendEmailNow } from "./messaging";

const AUTOPILOT_NAME = "Piloto automático · email";
/** Hora y día en Argentina (UTC−3). */
const ar = (d: Date) => { const a = new Date(d.getTime() - 3 * 3600_000); return { day: a.getUTCDay(), hhmm: a.toISOString().slice(11, 16), date: a.toISOString().slice(0, 10), stamp: a.toISOString().slice(0, 16) }; };

/** Emails de los Admin de REPI (cuentas verificadas). Nunca se escriben en el código ni en los registros. */
async function adminEmails(): Promise<string[]> {
  const rows = await db.select({ email: schema.user.email }).from(schema.user).where(and(eq(schema.user.platformRole, "admin"), eq(schema.user.emailVerified, true)));
  return [...new Set(rows.map((r) => r.email).filter((e) => e && !e.endsWith(".invalid")))];
}
/** Admin de REPI + email comercial de respuestas (donde está el calendario del titular), sin repetir. */
export async function ownerEmails(): Promise<string[]> {
  const s = await getSettings();
  return [...new Set([...(await adminEmails()), ...(s.sender.replyTo ? [s.sender.replyTo.toLowerCase()] : [])])];
}
export async function notifyOwner(subject: string, body: string, attachments?: { filename: string; content: string; contentType?: string }[]) {
  const s = await getSettings();
  if (!s.notify.email) return 0;
  let n = 0;
  for (const to of await ownerEmails()) {
    try { await deliverMail({ to, subject, body, attachments }); n++; } catch (e) { logError("leads.notify_owner", e); }
  }
  return n;
}

/** Campaña permanente del piloto automático: aprobada por el titular (autorización general del 12/11), envío por proveedor. */
async function autopilotCampaign() {
  const [c] = await db.select().from(leadCampaign).where(eq(leadCampaign.name, AUTOPILOT_NAME)).orderBy(desc(leadCampaign.createdAt)).limit(1);
  if (c && c.status === "approved") return c;
  if (c && c.status !== "approved") return null; // pausada o cerrada a mano: el piloto se detiene
  const [n] = await db.insert(leadCampaign).values({
    name: AUTOPILOT_NAME, channel: "email", variant: "email", status: "approved", maxRecipients: 1000, dailyLimit: 30, approvedAt: new Date(),
    approval: { recipients: [], messageIds: [], textHash: "autopilot", count: 0, sendMode: "provider",
      costNote: "Email por el proveedor configurado (Resend), dentro del plan; tope diario en Ajustes.",
      consentNote: "Autorización general del titular (12/11/2026) para el piloto automático por email: primer contacto B2B a la dirección pública del negocio, con identificación y baja en un clic; un seguimiento." },
  }).returning();
  return n;
}
async function approveForAutopilot(campaignId: string, messageId: string, businessId: string) {
  await db.update(leadMessage).set({ status: "approved", approvedAt: new Date(), campaignId }).where(eq(leadMessage.id, messageId));
  await db.update(leadCampaign).set({
    approval: sql`jsonb_set(jsonb_set(jsonb_set(${leadCampaign.approval}, '{messageIds}', coalesce(${leadCampaign.approval}->'messageIds', '[]'::jsonb) || to_jsonb(${messageId}::text)), '{recipients}', coalesce(${leadCampaign.approval}->'recipients', '[]'::jsonb) || to_jsonb(${businessId}::text)), '{count}', to_jsonb(coalesce((${leadCampaign.approval}->>'count')::int, 0) + 1))`,
    updatedAt: new Date(),
  }).where(eq(leadCampaign.id, campaignId));
}

/** Paso «outreach»: manda los emails del día (seguimientos vencidos primero, después primeros contactos por puntaje). */
export async function stepOutreach(opts: { now?: Date; budgetMs?: number } = {}) {
  const now = opts.now ?? new Date();
  const s = await getSettings();
  const out = { firstContacts: 0, followups: 0, skipped: [] as string[], errors: [] as string[], reason: null as string | null };
  if (!s.autopilot.enabled) { out.reason = "piloto automático apagado"; return out; }
  if (!s.channels.emailSend) { out.reason = "envío de email apagado en Ajustes"; return out; }
  const c = ar(now);
  if (!s.schedule.days.includes(c.day) || c.hhmm < s.autopilot.window.from || c.hhmm > s.autopilot.window.to) { out.reason = "fuera de la franja de envío"; return out; }
  const camp = await autopilotCampaign();
  if (!camp) { out.reason = "la campaña del piloto está pausada o cerrada"; return out; }
  const [{ n: sentToday }] = await db.select({ n: sql<number>`count(*)::int` }).from(leadMessage)
    .where(and(eq(leadMessage.provider, "mailer"), eq(leadMessage.status, "sent"), gte(leadMessage.sentAt, new Date(`${c.date}T00:00:00-03:00`))));
  let budget = Math.min(s.autopilot.dailyLimit, s.limits.emailPerDay) - sentToday;
  if (budget <= 0) { out.reason = "tope diario alcanzado"; return out; }
  const until = Date.now() + (opts.budgetMs ?? 20_000);
  const send = async (messageId: string, businessId: string) => {
    await approveForAutopilot(camp.id, messageId, businessId);
    await sendEmailNow(null, messageId);
    budget--;
  };
  // 1) Seguimientos por email vencidos de leads que el piloto contactó (sin respuesta registrada).
  if (s.autopilot.followups) {
    const due = await db.select({ m: leadMessage, b: leadBusiness }).from(leadMessage).innerJoin(leadBusiness, eq(leadBusiness.id, leadMessage.businessId))
      .innerJoin(leadTask, and(eq(leadTask.businessId, leadMessage.businessId), eq(leadTask.kind, "followup"), eq(leadTask.status, "open"), lte(leadTask.dueOn, c.date)))
      .where(and(eq(leadMessage.direction, "out"), eq(leadMessage.channel, "email"), eq(leadMessage.status, "draft"), sql`coalesce(${leadMessage.step}, 0) > 0`,
        eq(leadBusiness.doNotContact, false), eq(leadBusiness.sequenceStopped, false), isNull(leadBusiness.lastReplyAt),
        sql`exists (select 1 from lead_message f where f.business_id = ${leadBusiness.id} and f.campaign_id = ${camp.id} and f.status = 'sent')`))
      .limit(20);
    for (const { m, b } of due) {
      if (budget <= 0 || Date.now() > until) break;
      if (m.guardIssues.length) { out.skipped.push(`${b.name}: seguimiento con advertencias`); continue; }
      try { await send(m.id, b.id); out.followups++; } catch (e) { out.errors.push(`${b.name}: ${(e as Error).message}`); break; }
    }
  }
  // 2) Primeros contactos por email: mejores puntajes, sin exclusiones, sin vendedor ni envíos previos.
  if (budget > 0 && Date.now() < until) {
    const leads = await db.select().from(leadBusiness).where(and(
      inArray(leadBusiness.stage, ["validated", "qualified", "to_contact", "prepared"]), eq(leadBusiness.doNotContact, false), isNull(leadBusiness.exclusion), isNull(leadBusiness.repId),
      isNull(leadBusiness.reviewOfId), isNull(leadBusiness.firstSentOn), sql`${leadBusiness.email} is not null`, sql`${leadBusiness.score} >= ${s.autopilot.minScore}`,
    )).orderBy(desc(leadBusiness.score), asc(leadBusiness.name)).limit(budget + 5);
    for (const b of leads) {
      if (budget <= 0 || Date.now() > until) break;
      if (!emailNorm(b.email)) { out.skipped.push(`${b.name}: email inválido`); continue; }
      try {
        const [existing] = await db.select().from(leadMessage).where(and(eq(leadMessage.businessId, b.id), eq(leadMessage.direction, "out"), eq(leadMessage.channel, "email"), inArray(leadMessage.status, ["draft", "approved"]), sql`coalesce(${leadMessage.step}, 0) = 0`)).limit(1);
        const m = existing ?? await createDraft(null, b.id, { variant: "email", channel: "email", campaignId: camp.id });
        if (m.guardIssues.length) { out.skipped.push(`${b.name}: mensaje con advertencias`); continue; }
        await send(m.id, b.id);
        out.firstContacts++;
      } catch (e) { out.errors.push(`${b.name}: ${(e as Error).message}`); if (/proveedor|límite/.test((e as Error).message)) break; }
    }
  }
  return out;
}

// ── Cola de WhatsApp e Instagram (la envía Claude en el Mac del titular, con sus cuentas) ──────────────────
const SOCIAL_NAME = "Piloto automático · WhatsApp e Instagram";
async function socialCampaign() {
  const [c] = await db.select().from(leadCampaign).where(eq(leadCampaign.name, SOCIAL_NAME)).orderBy(desc(leadCampaign.createdAt)).limit(1);
  if (c) return c.status === "approved" ? c : null;
  const [n] = await db.insert(leadCampaign).values({
    name: SOCIAL_NAME, channel: "best", variant: "first_contact", status: "approved", maxRecipients: 1000, dailyLimit: 10, approvedAt: new Date(),
    approval: { recipients: [], messageIds: [], textHash: "autopilot-social", count: 0, sendMode: "manual",
      costNote: "Sin costo: los envía Claude desde las cuentas de WhatsApp e Instagram del titular, uno por uno, a ritmo normal.",
      consentNote: "Pedido del titular (12/11/2026): «Usa WhatsApp e Instagram igual… Yo me ocupo de lo que prohíben las plataformas». Sólo a datos comerciales publicados por el negocio; un «no» o «baja» corta todo." },
  }).returning();
  return n;
}
/**
 * Prepara la cola del día: primeros contactos por WhatsApp (o Instagram si no hay WhatsApp) para gimnasios sin email ni
 * envíos previos, y aprueba los seguimientos vencidos por esos canales. No envía: queda «aprobado» con su enlace.
 */
export async function stepSocialQueue(opts: { now?: Date } = {}) {
  const s = await getSettings();
  const out = { queued: 0, followups: 0, skipped: [] as string[], reason: null as string | null };
  if (!s.autopilot.enabled || !s.autopilot.social) { out.reason = "cola de WhatsApp e Instagram apagada"; return out; }
  const camp = await socialCampaign();
  if (!camp) { out.reason = "la campaña de WhatsApp e Instagram está pausada o cerrada"; return out; }
  const d = ar(opts.now ?? new Date()).date;
  const [{ n: pending }] = await db.select({ n: sql<number>`count(*)::int` }).from(leadMessage).where(and(eq(leadMessage.campaignId, camp.id), eq(leadMessage.status, "approved")));
  let budget = Math.max(0, s.autopilot.socialDailyLimit - pending);
  // Seguimientos vencidos por WhatsApp/Instagram de leads que se contactaron por esos canales.
  const due = await db.select({ m: leadMessage, b: leadBusiness }).from(leadMessage).innerJoin(leadBusiness, eq(leadBusiness.id, leadMessage.businessId))
    .innerJoin(leadTask, and(eq(leadTask.businessId, leadMessage.businessId), eq(leadTask.kind, "followup"), eq(leadTask.status, "open"), lte(leadTask.dueOn, d)))
    .where(and(eq(leadMessage.direction, "out"), inArray(leadMessage.channel, ["whatsapp", "instagram"]), eq(leadMessage.status, "draft"), sql`coalesce(${leadMessage.step}, 0) > 0`,
      eq(leadBusiness.doNotContact, false), eq(leadBusiness.sequenceStopped, false), isNull(leadBusiness.lastReplyAt))).limit(20);
  for (const { m, b } of due) {
    if (budget <= 0) break;
    if (m.guardIssues.length) { out.skipped.push(`${b.name}: seguimiento con advertencias`); continue; }
    await approveForAutopilot(camp.id, m.id, b.id); budget--; out.followups++;
  }
  if (budget > 0) {
    const leads = await db.select().from(leadBusiness).where(and(
      inArray(leadBusiness.stage, ["validated", "qualified", "to_contact", "prepared"]), eq(leadBusiness.doNotContact, false), isNull(leadBusiness.exclusion), isNull(leadBusiness.repId),
      isNull(leadBusiness.reviewOfId), isNull(leadBusiness.firstSentOn), isNull(leadBusiness.email), sql`(${leadBusiness.whatsapp} is not null or ${leadBusiness.instagram} is not null)`,
      sql`${leadBusiness.score} >= ${s.autopilot.minScore}`,
    )).orderBy(desc(leadBusiness.score), asc(leadBusiness.name)).limit(budget);
    for (const b of leads) {
      const ch = b.whatsapp ? "whatsapp" : "instagram";
      const [existing] = await db.select().from(leadMessage).where(and(eq(leadMessage.businessId, b.id), eq(leadMessage.direction, "out"), eq(leadMessage.channel, ch), inArray(leadMessage.status, ["draft", "approved"]), sql`coalesce(${leadMessage.step}, 0) = 0`)).limit(1);
      const m = existing ?? await createDraft(null, b.id, { variant: ch === "instagram" ? "instagram" : "first_contact", channel: ch, campaignId: camp.id });
      if (m.status === "approved") continue;
      if (m.guardIssues.length) { out.skipped.push(`${b.name}: mensaje con advertencias`); continue; }
      await approveForAutopilot(camp.id, m.id, b.id); out.queued++;
    }
  }
  return out;
}

// ── Agenda pública ───────────────────────────────────────────────────────────
async function takenSlots(): Promise<string[]> {
  const rows = await db.select({ at: leadTask.dueAt }).from(leadTask).where(and(eq(leadTask.kind, "meeting"), eq(leadTask.status, "open"), sql`${leadTask.dueAt} is not null`));
  return rows.map((r) => r.at as string);
}
export async function bookingView(token: string) {
  const id = bookingSigner.read(token);
  if (!id) return null;
  const [b] = await db.select().from(leadBusiness).where(eq(leadBusiness.id, id));
  if (!b || b.doNotContact) return null;
  const s = await getSettings();
  if (!s.booking.enabled) return { name: b.name, slots: [] as string[], booked: null as string | null, sender: s.sender, minutes: s.booking.slotMin };
  const [mine] = await db.select().from(leadTask).where(and(eq(leadTask.businessId, id), eq(leadTask.kind, "meeting"), eq(leadTask.status, "open"))).orderBy(desc(leadTask.createdAt)).limit(1);
  return { name: b.name, slots: bookingSlots(new Date(), s.booking, await takenSlots()), booked: mine?.dueAt ?? null, sender: s.sender, minutes: s.booking.slotMin };
}
export async function bookMeeting(token: string, p: { slot: string; name: string; phone: string; email?: string | null; note?: string | null }) {
  const id = bookingSigner.read(token);
  if (!id) return { ok: false as const, error: "Enlace inválido." };
  const s = await getSettings();
  if (!s.booking.enabled) return { ok: false as const, error: "La agenda no está disponible." };
  const name = p.name.trim().slice(0, 80), phone = p.phone.trim().slice(0, 40), email = emailNorm(p.email ?? null);
  if (!name || !phone) return { ok: false as const, error: "Dejanos tu nombre y un teléfono o WhatsApp." };
  const free = bookingSlots(new Date(), s.booking, await takenSlots());
  if (!free.includes(p.slot)) return { ok: false as const, error: "Ese horario ya no está disponible. Elegí otro." };
  const b = await getLead(id);
  const res = await db.transaction(async (tx) => {
    const [t] = await tx.insert(leadTask).values({ businessId: id, kind: "meeting", dueOn: p.slot.slice(0, 10), dueAt: p.slot, note: `Reunión agendada por ${name} (${phone})${p.note ? ` · ${p.note.slice(0, 200)}` : ""}`, dedupeKey: `booking:${id}:${p.slot}` }).onConflictDoNothing().returning();
    if (!t) return null;
    const stage = (["meeting_set"] as LeadStage[]).find((x) => canAutoMove(b.stage, x)) ?? b.stage;
    await tx.update(leadBusiness).set({
      stage, stageChangedAt: stage !== b.stage ? new Date() : b.stageChangedAt, intentFlags: { ...b.intentFlags, replied: true, positive: true, meeting: true },
      sequenceStopped: true, lastReplyAt: new Date(), contactName: b.contactName ?? name, nextAction: `Reunión ${p.slot.replace("T", " ")}`, nextActionOn: p.slot.slice(0, 10), updatedAt: new Date(),
    }).where(eq(leadBusiness.id, id));
    await tx.update(leadMessage).set({ status: "cancelled" }).where(and(eq(leadMessage.businessId, id), eq(leadMessage.direction, "out"), inArray(leadMessage.status, ["draft", "approved"])));
    await tx.update(leadTask).set({ status: "cancelled", doneAt: new Date() }).where(and(eq(leadTask.businessId, id), eq(leadTask.status, "open"), inArray(leadTask.kind, ["contact", "followup"])));
    await tx.insert(leadMessage).values({ businessId: id, direction: "in", channel: "booking", body: `Agendó una reunión para el ${p.slot.replace("T", " ")}. Contacto: ${name}, ${phone}${email ? `, ${email}` : ""}.${p.note ? ` Nota: ${p.note.slice(0, 300)}` : ""}`, status: "received", intent: "demo", confidence: 1, sentAt: new Date() });
    await logLead(tx, { businessId: id, kind: "meeting", summary: `Reunión agendada desde la agenda pública: ${p.slot.replace("T", " ")} (${name}, ${phone})`, actorRole: "system" });
    return t;
  });
  if (!res) return { ok: false as const, error: "Ese horario ya no está disponible. Elegí otro." };
  // Invitación de calendario: al titular (con organizador = email comercial) y, si dejó email, al gimnasio.
  const owner = s.sender.replyTo || "hola@repiclub.com";
  const desc = `Reunión de ${s.booking.slotMin} minutos con ${b.name} (${b.city ?? ""}).\nContacto: ${name} · ${phone}${email ? ` · ${email}` : ""}\n${s.booking.meetingUrl ? `Enlace: ${s.booking.meetingUrl}\n` : `${s.sender.name} llama al ${phone} a la hora acordada.\n`}Ficha: ${appUrl()}/admin?s=captacion`;
  const owners = await ownerEmails();
  const ics = icsInvite({ uid: `${res.id}@repiclub.com`, startLocal: p.slot, minutes: s.booking.slotMin, title: `REPI · ${b.name}`, description: desc, organizerEmail: owner, organizerName: `${s.sender.name} · ${s.sender.company}`,
    attendees: [...owners.map((e) => ({ email: e, name: s.sender.name })), ...(email ? [{ email, name }] : [])], location: s.booking.meetingUrl || `Llamada/WhatsApp al ${phone}` });
  const att = [{ filename: "invitacion.ics", content: Buffer.from(ics).toString("base64"), contentType: "text/calendar; method=REQUEST; charset=UTF-8" }];
  await notifyOwner(`Reunión agendada: ${b.name} · ${fmtSlot(p.slot)}`, `${b.name} eligió un horario para hablar de REPI.\n\nCuándo: ${fmtSlot(p.slot)} (${s.booking.slotMin} min)\nContacto: ${name} · ${phone}${email ? ` · ${email}` : ""}${p.note ? `\nNota: ${p.note}` : ""}\n\nLa invitación va adjunta para tu calendario. Te recuerdo ${s.notify.meetingReminderMin} minutos antes.`, att);
  if (email) {
    try { await deliverMail({ to: email, subject: `Reunión con ${s.sender.product} · ${fmtSlot(p.slot)}`, body: `Hola ${name.split(" ")[0]}, ¡gracias! Quedó agendada la reunión para el ${fmtSlot(p.slot)}.\n\n${s.booking.meetingUrl ? `Enlace: ${s.booking.meetingUrl}` : `${s.sender.name} te llama al ${phone}.`}\n\nSi necesitás cambiarla, respondé este mail o escribí por WhatsApp al ${s.sender.whatsapp}.\n\n${s.sender.name} · ${s.sender.company}`, replyTo: (await replyAddress(s)) || undefined, attachments: att }); }
    catch (e) { logError("leads.booking_confirm", e); }
  }
  return { ok: true as const, slot: p.slot };
}
const fmtSlot = (slot: string) => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${slot}:00-03:00`));

/** «Ya me respondió» desde el aviso: frena seguimientos de ese lead. Idempotente; un escáner de correo sólo puede frenar, nunca enviar. */
export async function stopByLink(token: string) {
  const id = stopSigner.read(token);
  if (!id) return null;
  const [b] = await db.select().from(leadBusiness).where(eq(leadBusiness.id, id));
  if (!b) return null;
  if (!b.lastReplyAt || !b.sequenceStopped) {
    await db.transaction(async (tx) => {
      const stage = canAutoMove(b.stage, "replied") ? "replied" : b.stage;
      await tx.update(leadBusiness).set({ lastReplyAt: b.lastReplyAt ?? new Date(), sequenceStopped: true, stage, intentFlags: { ...b.intentFlags, replied: true }, nextAction: "Respondió por fuera del sistema (email o WhatsApp)", updatedAt: new Date() }).where(eq(leadBusiness.id, id));
      await tx.update(leadMessage).set({ status: "cancelled" }).where(and(eq(leadMessage.businessId, id), eq(leadMessage.direction, "out"), inArray(leadMessage.status, ["draft", "approved"])));
      await tx.update(leadTask).set({ status: "cancelled", doneAt: new Date() }).where(and(eq(leadTask.businessId, id), eq(leadTask.status, "open"), inArray(leadTask.kind, ["contact", "followup"])));
      await logLead(tx, { businessId: id, kind: "reply", summary: "Marcado «ya respondió» desde el aviso por email: seguimientos frenados", actorRole: "admin" });
    });
  }
  return { name: b.name };
}

// ── Recordatorios ────────────────────────────────────────────────────────────
/** Cada minuto: aviso por email antes de cada reunión (una sola vez por reunión). */
export async function meetingReminders(now = new Date()) {
  const s = await getSettings();
  if (!s.notify.email) return 0;
  const from = ar(now).stamp, to = ar(new Date(now.getTime() + s.notify.meetingReminderMin * 60_000)).stamp;
  const rows = await db.select({ t: leadTask, b: leadBusiness }).from(leadTask).innerJoin(leadBusiness, eq(leadBusiness.id, leadTask.businessId))
    .where(and(eq(leadTask.kind, "meeting"), eq(leadTask.status, "open"), sql`${leadTask.dueAt} > ${from}`, sql`${leadTask.dueAt} <= ${to}`,
      sql`not exists (select 1 from lead_activity a where a.business_id = ${leadTask.businessId} and a.kind = 'reminder' and a.payload->>'taskId' = ${leadTask.id})`));
  let n = 0;
  for (const { t, b } of rows) {
    await logLead(db, { businessId: b.id, kind: "reminder", summary: `Recordatorio enviado: reunión ${t.dueAt?.replace("T", " ")}`, payload: { taskId: t.id }, actorRole: "system" });
    await notifyOwner(`En ${s.notify.meetingReminderMin} min: reunión con ${b.name}`, `Recordatorio: ${fmtSlot(t.dueAt as string)} tenés la reunión con ${b.name}.\n${t.note ?? ""}\n${b.phone ? `Teléfono: ${b.phone}\n` : ""}${s.booking.meetingUrl ? `Enlace: ${s.booking.meetingUrl}\n` : ""}`);
    n++;
  }
  return n;
}
/** Resumen diario por email: sólo si hay algo para el titular (reuniones, respuestas, tareas vencidas, errores o envíos). */
export async function dailyDigest(summary: { day: string; sent: number; replies: number; due: number; errors: { kind: string; error: string | null }[] }) {
  const s = await getSettings();
  if (!s.notify.email) return { emailed: 0 };
  const d = summary.day;
  const meetings = await db.select({ t: leadTask, name: leadBusiness.name }).from(leadTask).innerJoin(leadBusiness, eq(leadBusiness.id, leadTask.businessId))
    .where(and(eq(leadTask.kind, "meeting"), eq(leadTask.status, "open"), sql`${leadTask.dueOn} >= ${d}`)).orderBy(leadTask.dueAt).limit(10);
  const waiting = await db.select().from(leadBusiness).where(and(sql`${leadBusiness.firstSentOn} is not null`, isNull(leadBusiness.lastReplyAt), eq(leadBusiness.sequenceStopped, false), eq(leadBusiness.doNotContact, false))).orderBy(desc(leadBusiness.lastSentOn)).limit(30);
  const sentToday = await db.select({ name: leadBusiness.name, step: leadMessage.step }).from(leadMessage).innerJoin(leadBusiness, eq(leadBusiness.id, leadMessage.businessId))
    .where(and(eq(leadMessage.direction, "out"), eq(leadMessage.status, "sent"), gte(leadMessage.sentAt, new Date(`${d}T00:00:00-03:00`))));
  if (!meetings.length && !sentToday.length && !summary.errors.length) return { emailed: 0 };
  const lines = [
    `Resumen de Captación · ${d}`, "",
    meetings.length ? `Reuniones próximas:\n${meetings.map((m) => `• ${fmtSlot(m.t.dueAt as string)} · ${m.name}`).join("\n")}` : "Sin reuniones agendadas.",
    "", sentToday.length ? `Emails enviados hoy (${sentToday.length}):\n${sentToday.map((x) => `• ${x.name}${(x.step ?? 0) > 0 ? " (seguimiento)" : ""}`).join("\n")}` : "Hoy no se enviaron emails.",
    "", waiting.length ? `Esperando respuesta (${waiting.length}). Si alguno ya te contestó por WhatsApp o mail, tocá su enlace y no le llega el seguimiento:\n${waiting.map((w) => `• ${w.name}: ${stopUrl(w.id)}`).join("\n")}` : "",
    summary.errors.length ? `\nAvisos del sistema: ${summary.errors.map((e) => `${e.kind}: ${e.error ?? "error"}`).join(" · ")}` : "",
    "", `Ver todo: ${appUrl()}/admin?s=captacion`,
  ];
  return { emailed: await notifyOwner(`Captación · ${meetings.length ? `${meetings.length} reunión(es) · ` : ""}${sentToday.length} enviado(s) hoy`, lines.filter((l) => l !== undefined).join("\n")) };
}
export { unsubscribeUrl, today, normPhoneAR };
