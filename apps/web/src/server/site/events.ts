// D205 · Experience Hub: registro anónimo de eventos del sitio comercial y su resumen para REPI Admin.
// Nada de lo que se guarda identifica a una persona (ver schema.siteEvent). Registrar nunca rompe la página: si falla, se loguea.
import { and, desc, gte, lt, sql } from "drizzle-orm";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { logErrorAt } from "../log";
import { requireAdmin } from "../commercial/services";
import { DEVICES, SITE_EVENTS, SOURCES, cleanPath, cleanTag, isProfile, type SiteEventName } from "@/lib/site-events";

const { siteEvent, commercialLead } = schema;
export const SITE_EVENT_RETENTION_DAYS = 400;

export type SiteEventInput = {
  name: unknown; visit?: unknown; profile?: unknown; target?: unknown; source?: unknown; campaign?: unknown;
  utmSource?: unknown; utmMedium?: unknown; utmCampaign?: unknown; path?: unknown; device?: unknown;
};

const oneOf = <T extends string>(list: readonly T[], x: unknown): T | null => (typeof x === "string" && (list as readonly string[]).includes(x) ? (x as T) : null);

/** Normaliza un evento: nombre de la lista o nada; el resto se recorta o se descarta. */
export function cleanSiteEvent(e: SiteEventInput) {
  const name = oneOf(SITE_EVENTS, e.name);
  if (!name) return null;
  const visit = typeof e.visit === "string" && /^[a-z0-9]{8,32}$/.test(e.visit) ? e.visit : null;
  return {
    name, visit, profile: isProfile(e.profile) ? e.profile : null, target: cleanTag(e.target, 40),
    source: oneOf(SOURCES, e.source), campaign: cleanTag(e.campaign), utmSource: cleanTag(e.utmSource), utmMedium: cleanTag(e.utmMedium),
    utmCampaign: cleanTag(e.utmCampaign), path: cleanPath(e.path), device: oneOf(DEVICES, e.device),
  };
}

export async function recordSiteEvent(e: SiteEventInput): Promise<boolean> {
  const row = cleanSiteEvent(e);
  if (!row) return false;
  try {
    await db.insert(siteEvent).values(row);
    return true;
  } catch (err) {
    logErrorAt("site.event", err, row.name);
    return false;
  }
}

/** El job diario borra lo que pasó la retención. */
export async function purgeSiteEvents(now = new Date()) {
  const cutoff = new Date(now.getTime() - SITE_EVENT_RETENTION_DAYS * 86_400_000);
  const r = await db.delete(siteEvent).where(lt(siteEvent.at, cutoff)).returning({ id: siteEvent.id });
  return r.length;
}

const FUNNEL: SiteEventName[] = ["landing_view", "profile_select", "mode_select", "video_play", "demo_click", "demo_start", "intel_try", "whatsapp_click", "email_click", "contact_click", "form_submit", "meeting_request"];

/**
 * Resumen para REPI Admin (sólo Admin con 2FA). Últimos `days` días: visitas únicas, escaneos del QR por campaña, el embudo
 * por evento separando QR del resto, perfiles elegidos, demos y contactos con su origen. Son conteos, no personas.
 */
export async function siteSummary(actorId: string, days = 30, now = new Date()) {
  await requireAdmin(actorId);
  // `days` 0 = hoy: desde la medianoche de Argentina (UTC−3, sin horario de verano), no las últimas 24 horas.
  const d = days === 0 ? 0 : Math.min(365, Math.max(1, Math.round(days)));
  const since = d === 0 ? startOfDayAr(now) : new Date(now.getTime() - d * 86_400_000);
  const w = gte(siteEvent.at, since);
  const fromQr = sql<boolean>`coalesce(${siteEvent.source} = 'qr', false)`;
  const [byEvent, scans, profiles, demos, campaigns, visits, leads] = await Promise.all([
    db.select({ name: siteEvent.name, qr: fromQr, n: sql<number>`count(*)::int`, visits: sql<number>`count(distinct ${siteEvent.visit})::int` })
      .from(siteEvent).where(w).groupBy(siteEvent.name, fromQr),
    db.select({ campaign: siteEvent.campaign, n: sql<number>`count(*)::int` }).from(siteEvent).where(and(w, sql`${siteEvent.name} = 'qr_scan'`)).groupBy(siteEvent.campaign),
    db.select({ profile: siteEvent.profile, n: sql<number>`count(*)::int` }).from(siteEvent).where(and(w, sql`${siteEvent.name} = 'profile_select'`)).groupBy(siteEvent.profile),
    db.select({ target: siteEvent.target, name: siteEvent.name, n: sql<number>`count(*)::int` }).from(siteEvent).where(and(w, sql`${siteEvent.name} in ('demo_click', 'demo_start', 'demo_error')`)).groupBy(siteEvent.target, siteEvent.name),
    db.select({ source: siteEvent.utmSource, medium: siteEvent.utmMedium, campaign: siteEvent.utmCampaign, visits: sql<number>`count(distinct ${siteEvent.visit})::int` })
      .from(siteEvent).where(and(w, sql`${siteEvent.name} = 'landing_view'`)).groupBy(siteEvent.utmSource, siteEvent.utmMedium, siteEvent.utmCampaign).orderBy(desc(sql`4`)).limit(20),
    db.select({ day: sql<string>`to_char(${siteEvent.at} at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`, qr: fromQr, n: sql<number>`count(distinct ${siteEvent.visit})::int` })
      .from(siteEvent).where(and(w, sql`${siteEvent.name} = 'landing_view'`)).groupBy(sql`1`, fromQr).orderBy(sql`1`),
    db.select({ source: commercialLead.source, campaign: commercialLead.campaign, kind: commercialLead.kind, productMode: commercialLead.productMode, n: sql<number>`count(*)::int` })
      .from(commercialLead).where(gte(commercialLead.createdAt, since)).groupBy(commercialLead.source, commercialLead.campaign, commercialLead.kind, commercialLead.productMode),
  ]);
  const funnel = FUNNEL.map((name) => {
    const rows = byEvent.filter((r) => r.name === name);
    const qr = rows.find((r) => r.qr), other = rows.find((r) => !r.qr);
    return { name, total: (qr?.n ?? 0) + (other?.n ?? 0), qr: qr?.n ?? 0, other: other?.n ?? 0, visitsQr: qr?.visits ?? 0, visitsOther: other?.visits ?? 0 };
  });
  return { days: d, since: since.toISOString(), funnel, scans, profiles, demos, campaigns, visitsByDay: visits, leads };
}

/** Medianoche de hoy en Argentina (UTC−3 todo el año). */
export const startOfDayAr = (now = new Date()) => new Date(`${localDate(now)}T00:00:00-03:00`);
