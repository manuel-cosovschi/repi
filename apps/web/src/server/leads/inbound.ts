// D218 · Casilla de respuestas de Captación (pedido del titular: «que no tenga que hacer nada»).
// Los emails de captación salen con «responder a» una casilla de REPI en Resend. Cada respuesta entra por el webhook
// /api/captacion/entrante: REPI la vuelve a leer en Resend con su propia clave (el cuerpo del webhook no se cree), la
// registra en el expediente (clasificación, fin de seguimientos, tareas) y se la reenvía al titular con «responder a» el
// gimnasio, así contesta desde su correo de siempre. Si la casilla no se puede crear (plan sin casillas, API caída), los
// emails siguen respondiendo al email comercial de Ajustes y se reintenta cada 6 horas.
import { and, eq } from "drizzle-orm";
import { emailNorm } from "@repi/domain";
import { db } from "@/db";
import { deliverMail } from "../mailer";
import { logError } from "../log";
import { appUrl, getLead, getSettings, INBOUND_KEY, inboundState, leadMessage, leadSetting, type InboundState } from "./core";
import { findLeadByContact } from "./crm";
import { recordReplyAs } from "./messaging";
import { ownerEmails } from "./autopilot";

const API = "https://api.resend.com";
const INBOX_NAME = "REPI Captación";
export const INBOUND_PATH = "/api/captacion/entrante";
const RETRY_MS = 6 * 3600_000;

type Api = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<{ ok: boolean; status: number; data: T | null }>;
const resendApi = (): Api | null => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return async (path, init) => {
    const r = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}), signal: AbortSignal.timeout(10_000),
    });
    return { ok: r.ok, status: r.status, data: r.ok ? ((await r.json().catch(() => null)) as never) : null };
  };
};
/** Dominio remitente (MAIL_FROM «Nombre <x@dominio>»): la casilla vive en el mismo dominio verificado. */
const mailDomain = () => (process.env.MAIL_FROM ?? "").match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? null;

async function saveState(st: InboundState) {
  await db.insert(leadSetting).values({ key: INBOUND_KEY, value: st }).onConflictDoUpdate({ target: leadSetting.key, set: { value: st, updatedAt: new Date() } });
  return st;
}

/**
 * Crea (o encuentra) la casilla y el webhook. Idempotente: corre desde el job de cada minuto, pero sólo trabaja si nunca
 * corrió o si el último intento falló hace más de 6 horas.
 */
export async function ensureInbound(now = new Date(), opts: { force?: boolean } = {}): Promise<InboundState | null> {
  const cur = await inboundState();
  if (!opts.force && cur && (cur.status === "ok" || now.getTime() - new Date(cur.checkedAt).getTime() < RETRY_MS)) return cur;
  const api = resendApi(), domain = mailDomain();
  if (!api || !domain || (process.env.NODE_ENV !== "production" && !opts.force)) return cur;
  const fail = (error: string) => saveState({ status: "error", address: null, inboxId: cur?.inboxId ?? null, webhookId: cur?.webhookId ?? null, error, checkedAt: now.toISOString() });
  try {
    const list = await api<{ data: { id: string; name: string | null; email_address: string }[] }>("/inboxes");
    if (!list.ok) return fail(`Resend no permite casillas en esta cuenta (${list.status}).`);
    let inbox = list.data?.data.find((i) => i.name === INBOX_NAME);
    if (!inbox) {
      const s = await getSettings();
      const made = await api<{ id: string; name: string; email_address: string }>("/inboxes", { method: "POST", body: { email_address: `respuestas@${domain}`, name: INBOX_NAME, forwarding: true, from_name: `${s.sender.name} · ${s.sender.product}` } });
      if (!made.ok || !made.data) return fail(`Resend no creó la casilla (${made.status}).`);
      inbox = made.data;
    }
    const full = await api<{ receiving_address: string | null; email_address: string }>(`/inboxes/${encodeURIComponent(inbox.id)}`);
    const address = full.data?.receiving_address ?? null;
    if (!address) return fail("La casilla no tiene dirección de recepción.");
    const endpoint = `${appUrl()}${INBOUND_PATH}`;
    const hooks = await api<{ data: { id: string; endpoint: string }[] }>("/webhooks");
    let hook = hooks.data?.data.find((h) => h.endpoint === endpoint);
    if (!hook) {
      const made = await api<{ id: string }>("/webhooks", { method: "POST", body: { endpoint, events: ["inbox.email.received", "email.received"] } });
      if (!made.ok || !made.data) return fail(`Resend no creó el aviso de respuestas (${made.status}).`);
      hook = { id: made.data.id, endpoint };
    }
    return saveState({ status: "ok", address: address.toLowerCase(), inboxId: inbox.id, webhookId: hook.id, error: null, checkedAt: now.toISOString() });
  } catch (e) {
    logError("leads.inbound.setup", e);
    return fail("Resend no respondió.");
  }
}

/** Sólo la respuesta nueva: sin la cita del mensaje anterior ni la firma del teléfono. */
export function replyOnly(text: string): string {
  let t = text.replace(/\r\n/g, "\n");
  const cut = [
    t.search(/\n[^\n]{0,8}(El|On)\s[^\n]{0,200}\n?[^\n]{0,200}(escribió|wrote):/),
    t.search(/\n-{2,}\s*(Mensaje original|Original Message|Forwarded message|Mensaje reenviado)/i),
    t.search(/\n(De|From):\s.+\n(Enviado|Sent|Fecha|Date):/),
    t.search(/\n>/),
  ].filter((i) => i >= 0);
  if (cut.length) t = t.slice(0, Math.min(...cut));
  t = t.replace(/\n(Enviado desde|Sent from|Obtener Outlook)[^\n]*\s*$/i, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
const htmlToText = (h: string) => h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
  .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
const addressOf = (from: string) => (from.match(/<([^<>]+)>\s*$/)?.[1] ?? from).trim().toLowerCase();
const nameOf = (from: string) => from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() ?? null;

type Received = { id: string; from: string; to: string[]; subject: string; text: string; at: string };

/** Lee el email en Resend con la clave propia: el cuerpo del webhook sólo sirve para saber qué buscar. */
async function fetchReceived(api: Api, st: InboundState, ev: { type?: string; data?: Record<string, unknown> }): Promise<Received | "ignore" | null> {
  const d = ev.data ?? {};
  const id = typeof d.email_id === "string" ? d.email_id : null;
  if (!id || !/^[\w-]{6,80}$/.test(id)) return "ignore";
  if (ev.type === "inbox.email.received") {
    if (!st.inboxId || d.inbox_id !== st.inboxId || typeof d.thread_id !== "string" || !/^[\w-]{6,80}$/.test(d.thread_id)) return "ignore";
    const r = await api<{ id: string; direction: string; from: string; to: string[]; subject: string | null; text: string | null; html: string | null; received_at: string }>(`/inboxes/${encodeURIComponent(st.inboxId)}/threads/${d.thread_id}/emails/${id}`);
    if (!r.ok || !r.data) return r.status === 404 ? "ignore" : null;
    if (r.data.direction !== "inbound") return "ignore";
    return { id, from: r.data.from, to: r.data.to ?? [], subject: r.data.subject ?? "", text: r.data.text ?? htmlToText(r.data.html ?? ""), at: r.data.received_at };
  }
  if (ev.type === "email.received") {
    const r = await api<{ id: string; from: string; to: string[]; received_for?: string[]; subject: string; text: string | null; html: string | null; created_at: string }>(`/emails/receiving/${id}`);
    if (!r.ok || !r.data) return r.status === 404 ? "ignore" : null;
    const rcpt = [...(r.data.to ?? []), ...(r.data.received_for ?? [])].map(addressOf);
    if (!st.address || !rcpt.includes(st.address)) return "ignore"; // otra casilla de la cuenta: no es de Captación
    return { id, from: r.data.from, to: r.data.to ?? [], subject: r.data.subject ?? "", text: r.data.text ?? htmlToText(r.data.html ?? ""), at: r.data.created_at };
  }
  return "ignore";
}

/** Procesa un aviso de Resend. Devuelve el código HTTP: 500 hace que Resend reintente. */
export async function handleInbound(ev: { type?: string; data?: Record<string, unknown> }): Promise<{ status: number; result: string }> {
  const st = await inboundState();
  const api = resendApi();
  if (!st || st.status !== "ok" || !api) return { status: 200, result: "inactive" };
  const got = await fetchReceived(api, st, ev);
  if (got === "ignore") return { status: 200, result: "ignored" };
  if (!got) return { status: 500, result: "fetch_failed" };
  // Resend puede avisar dos veces (casilla y recepción): una sola respuesta por email.
  const [dup] = await db.select({ id: leadMessage.id }).from(leadMessage).where(and(eq(leadMessage.provider, "resend_inbound"), eq(leadMessage.providerId, got.id))).limit(1);
  if (dup) return { status: 200, result: "duplicate" };
  const from = addressOf(got.from);
  const text = replyOnly(got.text).slice(0, 3900) || got.subject || "(sin texto)";
  const day = new Date(new Date(got.at || Date.now()).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const auto = /^(mailer-daemon|postmaster|no-?reply)@/i.test(from);
  const leadId = auto || !emailNorm(from) ? null : await findLeadByContact("email", from);
  let recorded: Awaited<ReturnType<typeof recordReplyAs>> | null = null;
  if (leadId) {
    try { recorded = await recordReplyAs(null, leadId, { channel: "email", text, receivedOn: day, provider: "resend_inbound", providerId: got.id }); }
    catch (e) { logError("leads.inbound.record", e); return { status: 500, result: "record_failed" }; }
  }
  const lead = leadId ? await getLead(leadId).catch(() => null) : null;
  const who = lead?.name ?? nameOf(got.from) ?? from;
  const head = recorded
    ? `REPI la registró en la ficha de ${lead?.name} como «${recorded.label}»${recorded.needsReview ? " (conviene revisarla)" : ""}${recorded.followUpOn ? `, con seguimiento el ${recorded.followUpOn}` : ""}. Los seguimientos automáticos a este gimnasio quedaron frenados.`
    : auto ? "Es un aviso automático del servidor de correo (rebote o similar): no se registró en ningún gimnasio."
    : "No coincide con ningún gimnasio de Captación: no se registró. Si es de uno, cargá este email en su ficha.";
  const body = `${who} <${from}> respondió${got.subject ? ` («${got.subject}»)` : ""}:\n\n${text}\n\n—\n${head}\nPara contestarle, respondé este email: le llega a ${from}.\nFicha: ${appUrl()}/admin?s=captacion`;
  let sent = 0;
  for (const to of await ownerEmails()) {
    try { await deliverMail({ to, subject: `Respuesta de ${who}${got.subject ? `: ${got.subject.replace(/^(re|rv|fw|fwd):\s*/i, "")}` : ""}`.slice(0, 180), body, replyTo: from }); sent++; }
    catch (e) { logError("leads.inbound.forward", e); }
  }
  // Sin registro y sin reenvío, la respuesta se perdería: que Resend reintente.
  if (!recorded && !sent) return { status: 500, result: "forward_failed" };
  return { status: 200, result: recorded ? `recorded:${recorded.intent}` : "forwarded" };
}
