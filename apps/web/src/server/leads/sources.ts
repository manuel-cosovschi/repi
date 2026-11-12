// D218 · Fuentes autorizadas.
// 1) OpenStreetMap vía Overpass API: datos abiertos bajo ODbL (reutilizables con atribución «© colaboradores de OpenStreetMap»).
//    Una consulta por zona, secuencial, con tiempo límite y un User-Agent identificable. Sin Google Maps ni scraping de redes.
// 2) Sitio oficial del gimnasio: sólo si robots.txt lo permite; inicio y, si existe, la página de contacto. Extrae datos
//    comerciales publicados por el propio negocio (mailto, tel, WhatsApp, Instagram, Facebook). Nunca datos de personas.
import { asCategory, domainOf, emailNorm, igHandle, type LeadCategory } from "@repi/domain";
import type { Candidate } from "./store";
import { today } from "./core";

const UA = "REPI-Captacion/1.0 (+https://repiclub.com/conoce)";
export const OVERPASS_URL = () => process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
/** Servidores públicos de Overpass (misma base de OSM): si el principal no responde a tiempo, se prueba el siguiente. */
export const OVERPASS_URLS = () => process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

type OsmEl = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
export function overpassQuery(lat: number, lng: number, radiusKm: number) {
  const r = Math.round(radiusKm * 1000);
  const a = `(around:${r},${lat},${lng})`;
  return `[out:json][timeout:18];(nwr["leisure"="fitness_centre"]${a};nwr["amenity"="gym"]${a};nwr["sport"~"crossfit|fitness"]["leisure"="sports_centre"]${a};);out center tags;`;
}
/** Elemento de OSM → candidato. Sin nombre no hay negocio identificable. */
export function osmToCandidate(e: OsmEl, area: { name: string; province: string | null }): Candidate | null {
  const t = e.tags ?? {};
  const name = (t.name ?? t.brand ?? "").trim();
  if (!name) return null;
  const url = `https://www.openstreetmap.org/${e.type}/${e.id}`;
  const sport = `${t.sport ?? ""}`.toLowerCase();
  const category: LeadCategory = sport.includes("crossfit") ? "crossfit" : t.leisure === "sports_centre" ? "sports_center" : t.brand ? "chain" : "unknown";
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  return {
    name, city: t["addr:city"] ?? area.name, province: area.province, address: street || null,
    lat: e.lat ?? e.center?.lat ?? null, lng: e.lon ?? e.center?.lon ?? null,
    website: t.website ?? t["contact:website"] ?? null, phone: t.phone ?? t["contact:phone"] ?? null, whatsapp: t["contact:whatsapp"] ?? null,
    email: t.email ?? t["contact:email"] ?? null, instagram: t["contact:instagram"] ?? null, facebook: t["contact:facebook"] ?? null,
    category: asCategory(category), positioning: t.opening_hours === "24/7" ? "Abierto 24 h (OSM)" : null,
    externalRef: `osm:${e.type}/${e.id}`, source: { type: "osm", url, observedAt: today() },
  };
}
/**
 * Consulta OSM para una zona. `budgetMs` acota la espera total (la función serverless se corta a los 60 s): cada servidor
 * recibe lo que queda, y si el primero no responde a tiempo o da error se prueba el siguiente.
 */
export async function discoverOsm(area: { name: string; province: string | null; lat: number; lng: number; radiusKm: number }, fetcher: typeof fetch = fetch, budgetMs = 25_000): Promise<Candidate[]> {
  const until = Date.now() + budgetMs;
  const errors: string[] = [];
  for (const url of fetcher === fetch ? OVERPASS_URLS() : [OVERPASS_URL()]) {
    const left = until - Date.now();
    if (left < 4000) break;
    try {
      const res = await fetcher(url, {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
        body: `data=${encodeURIComponent(overpassQuery(area.lat, area.lng, area.radiusKm))}`, signal: AbortSignal.timeout(Math.min(left, 20_000)),
      });
      if (res.status === 429) { errors.push(`${new URL(url).host}: pidió esperar (429)`); continue; }
      if (!res.ok) { errors.push(`${new URL(url).host}: respondió ${res.status}`); continue; }
      const j = (await res.json()) as { elements?: OsmEl[] };
      return (j.elements ?? []).map((e) => osmToCandidate(e, area)).filter(Boolean) as Candidate[];
    } catch (e) { errors.push(`${new URL(url).host}: ${(e as Error).name === "TimeoutError" ? "no respondió a tiempo" : (e as Error).message}`); }
  }
  throw new Error(`OpenStreetMap no respondió (${errors.join("; ") || "sin tiempo"}): se reintenta en la próxima corrida`);
}

// ── Sitio oficial ────────────────────────────────────────────────────────────
/** robots.txt mínimo: reglas de «User-agent: *» (y del nuestro). Sin robots.txt, permitido. */
export function robotsAllows(robots: string, path: string): boolean {
  let applies = false; const dis: string[] = []; const allow: string[] = [];
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const [k, ...rest] = line.split(":"); const v = rest.join(":").trim(); const key = k.trim().toLowerCase();
    if (key === "user-agent") applies = v === "*" || /repi/i.test(v);
    else if (applies && key === "disallow" && v) dis.push(v);
    else if (applies && key === "allow" && v) allow.push(v);
  }
  const longest = (xs: string[]) => xs.filter((p) => path.startsWith(p)).reduce((a, p) => Math.max(a, p.length), -1);
  return longest(allow) >= longest(dis);
}
export type SiteFacts = { emails: string[]; phones: string[]; whatsapps: string[]; instagram: string | null; facebook: string | null; contactUrl: string | null; title: string | null };
/** Extrae datos comerciales de un HTML. Emails sólo del propio dominio o genéricos del negocio (info@, contacto@…). */
export function extractSiteFacts(html: string, baseUrl: string): SiteFacts {
  const dom = domainOf(baseUrl);
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const emails = new Set<string>(), phones = new Set<string>(), was = new Set<string>();
  let instagram: string | null = null, facebook: string | null = null, contactUrl: string | null = null;
  for (const h of hrefs) {
    if (/^mailto:/i.test(h)) { const e = emailNorm(h.slice(7).split("?")[0]); if (e) emails.add(e); }
    else if (/^tel:/i.test(h)) phones.add(decodeURIComponent(h.slice(4)));
    else if (/wa\.me\/|api\.whatsapp\.com\/send/i.test(h)) { const m = h.match(/wa\.me\/(\d+)|phone=(\d+)/); if (m) was.add(m[1] ?? m[2]); }
    else if (/instagram\.com\//i.test(h) && !instagram) instagram = igHandle(h);
    else if (/facebook\.com\//i.test(h) && !facebook && !/sharer|share\.php|plugins/.test(h)) facebook = h.split("?")[0];
    else if (!contactUrl && /contact/i.test(h) && !/^https?:\/\//i.test(h.replace(baseUrl, ""))) { try { contactUrl = new URL(h, baseUrl).toString(); } catch { /* enlace roto */ } }
  }
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const e = emailNorm(m[0]); if (!e) continue;
    const [local, host] = e.split("@");
    if (host === dom || /^(info|contacto|hola|administracion|ventas|recepcion|gym|gimnasio)$/.test(local)) emails.add(e);
  }
  const title = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i)?.[1].trim() ?? null;
  return { emails: [...emails].slice(0, 3), phones: [...phones].slice(0, 3), whatsapps: [...was].slice(0, 2), instagram, facebook, contactUrl, title };
}
async function getText(url: string, fetcher: typeof fetch, maxBytes = 400_000): Promise<string | null> {
  const res = await fetcher(url, { headers: { "user-agent": UA, accept: "text/html,text/plain" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/(html|plain)/.test(type) && !url.endsWith("robots.txt")) return null;
  const buf = await res.arrayBuffer();
  return new TextDecoder().decode(buf.slice(0, maxBytes));
}
/** Lee el sitio oficial respetando robots.txt. Devuelve null si no se pudo o no está permitido (con motivo). */
export async function readOfficialSite(website: string, fetcher: typeof fetch = fetch): Promise<{ ok: true; facts: SiteFacts; pages: string[] } | { ok: false; reason: string }> {
  let base: URL;
  try { base = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`); } catch { return { ok: false, reason: "dirección inválida" }; }
  if (!domainOf(base.toString())) return { ok: false, reason: "no es un sitio propio" };
  const robots = await getText(`${base.origin}/robots.txt`, fetcher, 50_000).catch(() => null);
  if (robots && !robotsAllows(robots, base.pathname || "/")) return { ok: false, reason: "robots.txt no lo permite" };
  const html = await getText(base.toString(), fetcher).catch(() => null);
  if (!html) return { ok: false, reason: "no respondió" };
  const facts = extractSiteFacts(html, base.toString());
  const pages = [base.toString()];
  if (facts.contactUrl && new URL(facts.contactUrl).origin === base.origin && (!robots || robotsAllows(robots, new URL(facts.contactUrl).pathname))) {
    const c = await getText(facts.contactUrl, fetcher).catch(() => null);
    if (c) {
      const more = extractSiteFacts(c, facts.contactUrl);
      facts.emails = [...new Set([...facts.emails, ...more.emails])].slice(0, 3);
      facts.phones = [...new Set([...facts.phones, ...more.phones])].slice(0, 3);
      facts.whatsapps = [...new Set([...facts.whatsapps, ...more.whatsapps])].slice(0, 2);
      facts.instagram ??= more.instagram; facts.facebook ??= more.facebook;
      pages.push(facts.contactUrl);
    }
  }
  return { ok: true, facts, pages };
}
