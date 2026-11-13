// D205 · Redirección del QR permanente (repiclub.com/qr y /qr/<campaña>). Temporal (307), sin caché y sin indexar.
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { resolveQr } from "@/lib/qr";
import { db, schema } from "@/db";
import { limit } from "../access/http";
import { logError } from "../log";
import { enqueue } from "../push/services";
import { recordSiteEvent } from "./events";

export async function qrRedirect(key?: string) {
  const { key: k, url, campaign } = resolveQr(key, process.env.REPI_QR_DESTINATION);
  // El escaneo se cuenta acá (funciona aunque el teléfono bloquee scripts). Sin IP, user agent ni identificador. Más de 30 por
  // minuto desde la misma IP siguen redirigiendo pero no se cuentan (evita inflar la medición).
  let counted = false;
  try {
    await limit("qr-scan", 30);
    counted = await recordSiteEvent({
      name: "qr_scan", source: "qr", campaign: campaign.utm.campaign, utmSource: campaign.utm.source, utmMedium: campaign.utm.medium,
      utmCampaign: campaign.utm.campaign, path: k === "default" ? "/qr" : `/qr/${k}`,
    });
  } catch { /* límite alcanzado o base no disponible: la redirección sigue igual */ }
  // 13/11/2026 (pedido del titular): cada escaneo avisa al teléfono de REPI Admin. Nunca demora ni rompe la redirección.
  if (counted) {
    try {
      const ua = (await headers()).get("user-agent");
      if (!isBot(ua) && process.env.REPI_QR_PUSH !== "off") {
        await limit("qr-push", 1, QR_PUSH_GAP_MS); // el mismo teléfono que vuelve a escanear no repite el aviso
        after(() => notifyQrScan(campaign.note).catch((e) => logError("qr.push", e)));
      }
    } catch { /* mismo teléfono dentro de los 10 minutos */ }
  }
  return new Response(null, {
    status: 307,
    // Location relativa: siempre al mismo dominio por el que entró.
    headers: { Location: url, "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" },
  });
}

/** Un mismo teléfono (misma IP) que escanea varias veces seguidas genera un solo aviso cada 10 minutos. */
export const QR_PUSH_GAP_MS = 10 * 60_000;

/** Vistas previas de enlaces (WhatsApp, Telegram, Slack…), buscadores y herramientas: no son una persona escaneando. */
export function isBot(ua: string | null | undefined) {
  if (!ua) return true;
  return /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|curl|wget|python|httpclient|okhttp|node-fetch|undici|axios|headless|lighthouse|pingdom|uptime/i.test(ua);
}

/** «Remera REPI · ATICMA Awards 2026 (repiclub.com/qr)» → «Remera REPI · ATICMA Awards 2026». */
export function qrScanText(note: string, today: number) {
  const where = note.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return { title: "Escanearon el QR de REPI", body: `${where} · ${today <= 1 ? "primer escaneo de hoy" : `${today} escaneos hoy`}.` };
}

/** Avisa a REPI Admin (platform_role = admin) por push: el material escaneado y cuántos escaneos van hoy (hora de Argentina). */
export async function notifyQrScan(note: string) {
  const admins = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.platformRole, "admin"));
  if (!admins.length) return 0;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.siteEvent).where(and(
    eq(schema.siteEvent.name, "qr_scan"),
    sql`(${schema.siteEvent.at} at time zone 'America/Argentina/Buenos_Aires')::date = (now() at time zone 'America/Argentina/Buenos_Aires')::date`,
  ));
  return enqueue(admins.map((a) => a.id), { kind: "site_qr", dedupe: `qr:${randomUUID()}`, ...qrScanText(note, n), url: "/admin?s=site" });
}
