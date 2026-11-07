// D205 · QR permanente. Lo impreso apunta siempre a repiclub.com/qr (o /qr/<campaña>); el destino se cambia acá, sin
// reimprimir. La redirección es temporal (307) y sin caché, así ningún navegador ni proxy memoriza un destino viejo.
// Seguridad: el destino sólo puede ser una ruta interna de esta lista (nunca una URL armada con datos de la visita), así que
// /qr no puede usarse como redirección abierta.

/** Destinos permitidos. Agregar uno nuevo es un cambio de código revisado, no un parámetro. */
export const QR_DESTINATIONS = ["/conoce", "/conoce/gimnasios", "/conoce/entrenadores", "/conoce/deportistas", "/conoce/aliados", "/demo", "/instalar"] as const;
export type QrDestination = (typeof QR_DESTINATIONS)[number];

export type QrCampaign = {
  /** Adónde lleva hoy. */
  to: QrDestination;
  /** UTM que se agregan al destino para medir de dónde viene la visita. */
  utm: { source: string; medium: string; campaign: string };
  /** Para el equipo: qué material lleva este QR. */
  note: string;
};

/**
 * Campañas. `default` es la de repiclub.com/qr a secas: la remera de los ATICMA Awards 2026. Para otro material (folleto,
 * stand, tarjeta), sumá una clave y usá repiclub.com/qr/<clave>: así se distingue en la medición sin tocar la remera.
 */
export const QR_CAMPAIGNS: Record<string, QrCampaign> = {
  default: { to: "/conoce", utm: { source: "qr", medium: "remera", campaign: "aticma-2026" }, note: "Remera REPI · ATICMA Awards 2026 (repiclub.com/qr)" },
  folleto: { to: "/conoce", utm: { source: "qr", medium: "folleto", campaign: "folleto-2026" }, note: "Folleto comercial (repiclub.com/qr/folleto)" },
  stand: { to: "/conoce", utm: { source: "qr", medium: "stand", campaign: "stand-2026" }, note: "Stand o cartel en eventos (repiclub.com/qr/stand)" },
  gimnasios: { to: "/conoce/gimnasios", utm: { source: "qr", medium: "impreso", campaign: "gimnasios-2026" }, note: "Material para dueños de gimnasio (repiclub.com/qr/gimnasios)" },
  entrenadores: { to: "/conoce/entrenadores", utm: { source: "qr", medium: "impreso", campaign: "entrenadores-2026" }, note: "Material para personal trainers (repiclub.com/qr/entrenadores)" },
};

const isDestination = (x: string): x is QrDestination => (QR_DESTINATIONS as readonly string[]).includes(x);

/**
 * Resuelve una campaña (clave desconocida → la de /qr). `override` (variable REPI_QR_DESTINATION) cambia el destino de /qr sin
 * tocar el código, pero sólo a un destino de la lista; cualquier otro valor se ignora.
 */
export function resolveQr(key: string | undefined, override?: string | null): { key: string; url: string; campaign: QrCampaign } {
  const k = key && Object.hasOwn(QR_CAMPAIGNS, key) ? key : "default";
  const c = QR_CAMPAIGNS[k];
  const to = k === "default" && override && isDestination(override.trim()) ? (override.trim() as QrDestination) : c.to;
  const q = new URLSearchParams({ utm_source: c.utm.source, utm_medium: c.utm.medium, utm_campaign: c.utm.campaign });
  return { key: k, url: `${to}?${q}`, campaign: { ...c, to } };
}
