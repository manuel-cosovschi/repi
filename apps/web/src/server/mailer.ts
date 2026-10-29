import { db, schema } from "@/db";
import { isDemoDeploy } from "./deploy";
import { renderMailHtml } from "./mail-template";

export type Mail = { to: string; subject: string; body: string };

// Adaptador de correo (T05, D24, D70). Drivers:
// · "resend": API HTTP de Resend con MAIL_FROM y RESEND_API_KEY (proveedor y dominio remitente los define el titular).
// · buzón DEV: desarrollo, tests y despliegue DEMO declarado (D68).
// En producción sin proveedor configurado falla de forma explícita en lugar de fingir un envío.
// Nunca se registra el cuerpo: lleva códigos y enlaces personales.
export async function sendMail(mail: Mail): Promise<void> {
  // Dominio reservado (demo guiada, D85): nunca sale a un proveedor; queda en el buzón DEV.
  if (mail.to.toLowerCase().endsWith(".invalid")) { await db.insert(schema.devMailbox).values(mail); return; }
  const resend = resendConfig();
  // Con proveedor nunca se copia al buzón DEV, tampoco en DEMO (D111): los correos llevan códigos y enlaces personales y
  // el buzón lo lee REPI Admin. Un rechazo del proveedor es un error visible, no un envío fingido.
  if (resend) return sendResend(resend, mail);
  if (process.env.NODE_ENV === "production" && !isDemoDeploy()) {
    throw new Error("No hay proveedor de email configurado (docs/DECISIONS.md D24)");
  }
  await db.insert(schema.devMailbox).values(mail);
}

export type Delivery = "submitted" | "local_only";
/**
 * Como sendMail, pero informa qué pasó y nunca silencia un rechazo del proveedor, tampoco en DEMO: para envíos que la UI
 * presenta como enviados (bienvenida comercial). "submitted" sólo significa que el proveedor lo aceptó, no que llegó.
 */
export async function deliverMail(mail: Mail): Promise<Delivery> {
  if (mail.to.toLowerCase().endsWith(".invalid")) { await db.insert(schema.devMailbox).values(mail); return "local_only"; }
  const resend = resendConfig();
  if (resend) {
    await sendResend(resend, mail);
    return "submitted";
  }
  if (process.env.NODE_ENV === "production" && !isDemoDeploy()) {
    throw new Error("No hay proveedor de email configurado (docs/DECISIONS.md D24)");
  }
  await db.insert(schema.devMailbox).values(mail);
  return "local_only";
}

/** Para avisos internos (D149): sólo con proveedor real; sin él (desarrollo, tests) no se manda nada. */
export const providerConfigured = () => { try { return !!resendConfig(); } catch { return false; } };

type ResendConfig = { key: string; from: string; replyTo?: string };
function resendConfig(): ResendConfig | null {
  // Con RESEND_API_KEY cargada alcanza: MAIL_DRIVER sólo hace falta para forzar el driver.
  if ((process.env.MAIL_DRIVER || (process.env.RESEND_API_KEY ? "resend" : "")) !== "resend") return null;
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) throw new Error("MAIL_DRIVER=resend exige RESEND_API_KEY y MAIL_FROM");
  return { key, from, replyTo: process.env.MAIL_REPLY_TO || undefined };
}

/**
 * Dominio remitente en Resend (D84): lo da de alta si falta, pide verificarlo y devuelve los registros DNS a cargar.
 * Corre en el servidor con la clave del entorno; quien lo dispara (job con CRON_SECRET) nunca ve la clave.
 */
export async function resendDomain(name: string, verify = false) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { configured: false as const };
  const h = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const api = async (path: string, init?: RequestInit) => {
    const r = await fetch(`https://api.resend.com${path}`, { ...init, headers: h, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new MailError(`email: Resend ${path} respondió ${r.status}`, r.status, r.status >= 500);
    return r.json();
  };
  const list = (await api("/domains")) as { data: { id: string; name: string }[] };
  let d = list.data.find((x) => x.name === name);
  if (!d) d = (await api("/domains", { method: "POST", body: JSON.stringify({ name, region: "sa-east-1" }) })) as { id: string; name: string };
  if (verify) await api(`/domains/${d.id}/verify`, { method: "POST" });
  const full = (await api(`/domains/${d.id}`)) as { name: string; status: string; records: { record: string; type: string; name: string; value: string; priority?: number; status: string }[] };
  return { configured: true as const, name: full.name, status: full.status, records: full.records.map(({ record, type, name: n, value, priority, status }) => ({ record, type, name: n, value, priority, status })) };
}

/** Envío directo por el proveedor, sin buzón ni tolerancia DEMO: para comprobar la entrega (D84). */
export async function sendViaProvider(mail: Mail) {
  const c = resendConfig();
  if (!c) throw new Error("No hay proveedor de email configurado (docs/DECISIONS.md D24)");
  await sendResend(c, mail);
}

export class MailError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) { super(message); }
}

async function sendResend(c: ResendConfig, m: Mail) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    // D149: versión HTML con la estética de REPI y la de texto de siempre (clientes sin HTML, lectores de pantalla).
    body: JSON.stringify({ from: c.from, to: [m.to], subject: m.subject, text: m.body, html: renderMailHtml(m), ...(c.replyTo ? { reply_to: c.replyTo } : {}) }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e: unknown) => { throw new MailError(`email: sin respuesta del proveedor (${e instanceof Error ? e.name : "error"})`, 0, true); });
  if (!res.ok) throw new MailError(`email: el proveedor rechazó el envío (${res.status})`, res.status, res.status === 429 || res.status >= 500);
}
