// D205 · Redirección del QR permanente (repiclub.com/qr y /qr/<campaña>). Temporal (307), sin caché y sin indexar.
import { resolveQr } from "@/lib/qr";
import { limit } from "../access/http";
import { recordSiteEvent } from "./events";

export async function qrRedirect(key?: string) {
  const { key: k, url, campaign } = resolveQr(key, process.env.REPI_QR_DESTINATION);
  // El escaneo se cuenta acá (funciona aunque el teléfono bloquee scripts). Sin IP, user agent ni identificador. Más de 30 por
  // minuto desde la misma IP siguen redirigiendo pero no se cuentan (evita inflar la medición).
  try {
    await limit("qr-scan", 30);
    await recordSiteEvent({
      name: "qr_scan", source: "qr", campaign: campaign.utm.campaign, utmSource: campaign.utm.source, utmMedium: campaign.utm.medium,
      utmCampaign: campaign.utm.campaign, path: k === "default" ? "/qr" : `/qr/${k}`,
    });
  } catch { /* límite alcanzado o base no disponible: la redirección sigue igual */ }
  return new Response(null, {
    status: 307,
    // Location relativa: siempre al mismo dominio por el que entró.
    headers: { Location: url, "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" },
  });
}
