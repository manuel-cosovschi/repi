// D205 · Experience Hub: eventos anónimos del sitio comercial. Acepta JSON por fetch o por sendBeacon (text/plain), un evento
// o una tanda de hasta 3 (el navegador manda de a uno). Nombres fuera de la lista se ignoran sin error. Nunca devuelve datos.
import { handle, limit } from "@/server/access/http";
import { recordSiteEvent, type SiteEventInput } from "@/server/site/events";

const MAX_BYTES = 4096;

export const POST = handle(async (req) => {
  await limit("site-event", 240);
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return new Response(null, { status: 413 });
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const list = (Array.isArray(data) ? data : [data]).slice(0, 3).filter((x): x is SiteEventInput => !!x && typeof x === "object");
  for (const e of list) await recordSiteEvent({ ...e, name: e.name === "qr_scan" ? null : e.name }); // el escaneo lo registra sólo /qr
  return new Response(null, { status: 204 });
});
