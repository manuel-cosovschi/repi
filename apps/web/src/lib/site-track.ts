"use client";
// D205 · Medición del sitio comercial, del lado del navegador. Sin cookies ni terceros: un id aleatorio por pestaña
// (sessionStorage), el origen de la visita (QR, UTM, otro sitio o directo) y nombres de evento de una lista cerrada.
// Si el navegador pide no ser rastreado (Global Privacy Control o Do Not Track), no se envía nada.
import type { Profile, SiteEventName, Source } from "./site-events";

type Attribution = { source: Source; campaign: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null };
const KEY = "repi:site:v1";
let memo: { visit: string; attr: Attribution } | null = null;

const optedOut = () => {
  try {
    const n = navigator as Navigator & { globalPrivacyControl?: boolean };
    return n.globalPrivacyControl === true || n.doNotTrack === "1";
  } catch { return false; }
};
const device = () => { const w = typeof innerWidth === "number" ? innerWidth : 1024; return w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop"; };
const rid = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16); };

/** Lee el origen de la URL de entrada una sola vez por pestaña; después se reutiliza (la persona navega entre perfiles). */
export function visitContext() {
  if (memo) return memo;
  try { const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null"); if (saved?.visit) return (memo = saved); } catch { /* */ }
  const q = new URLSearchParams(location.search);
  // Recortados a lo que aceptan la medición y el formulario: una campaña con nombre largo no puede hacer perder un contacto.
  const cut = (v: string | null, n: number) => (v ? v.slice(0, n) : null);
  const utmSource = cut(q.get("utm_source"), 40), utmMedium = cut(q.get("utm_medium"), 40), utmCampaign = cut(q.get("utm_campaign"), 80);
  let ref = "";
  try { ref = document.referrer ? new URL(document.referrer).host : ""; } catch { /* */ }
  const source: Source = utmSource === "qr" ? "qr" : utmSource ? "utm" : ref && ref !== location.host ? "referral" : "direct";
  memo = { visit: rid(), attr: { source, campaign: utmCampaign ?? (source === "referral" ? ref.slice(0, 60).replace(/[^a-z0-9.-]/gi, "") || null : null), utmSource, utmMedium, utmCampaign } };
  try { sessionStorage.setItem(KEY, JSON.stringify(memo)); } catch { /* */ }
  return memo;
}

export function track(name: SiteEventName, extra: { profile?: Profile | null; target?: string | null } = {}) {
  if (typeof window === "undefined" || optedOut()) return;
  const { visit, attr } = visitContext();
  const body = JSON.stringify({ name, visit, ...attr, profile: extra.profile ?? null, target: extra.target ?? null, path: location.pathname, device: device() });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/site/event", new Blob([body], { type: "text/plain" }))) return;
  } catch { /* */ }
  fetch("/api/site/event", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
}
