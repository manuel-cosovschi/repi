// REPI Sales Intelligence 1.0 (D218) · núcleo: guardas, configuración, zonas por defecto y bitácora del expediente.
// Toda la captación vive en REPI Admin (Admin con 2FA). Nada de este módulo envía mensajes por sí solo.
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { DEFAULT_BOOKING, DEFAULT_CADENCE, DEFAULT_WEIGHTS, localDate, type BookingConfig, validateCadence, validateWeights, type Cadence, type PriceExample, type PriceTier, type ScoreWeights } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, type Tx } from "../access/util";
import { requireAdmin } from "../commercial/services";

export const { leadArea, leadBusiness, leadFact, leadRun, leadCampaign, leadMessage, leadActivity, leadTask, leadSuppression, leadSetting } = schema;
export const NF = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
export const bad = (msg: string) => new AccessError("invalid", msg, 400);
export const today = (d = new Date()) => localDate(d);
export const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) || null : null);
export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://repiclub.com";

/** Interruptor: REPI_LEADS=off apaga el módulo (rutas 404, jobs quietos) sin tocar datos. */
export const leadsEnabled = () => process.env.REPI_LEADS !== "off";
export async function leadsAdmin(actorId: string) { if (!leadsEnabled()) throw NF(); return requireAdmin(actorId); }

// ── Configuración ────────────────────────────────────────────────────────────
export type Schedule = { enabled: boolean; days: number[]; discovery: string; enrich: string; score: string; compose: string; outreach: string; followup: string; report: string };
export type Settings = {
  weights: ScoreWeights;
  cadence: Cadence;
  schedule: Schedule;
  sender: { name: string; company: string; product: string; site: string; whatsapp: string; replyTo: string };
  /** Texto exacto de prueba social autorizado por el titular. Vacío = no se nombra a ningún cliente. */
  socialProof: string;
  /** Clientes que se pueden nombrar (autorización registrada). */
  allowedClientNames: string[];
  presentationUrl: string;
  demoUrl: string;
  limits: { discoveryAreasPerRun: number; enrichPerRun: number; composePerRun: number; emailPerDay: number; maxChars: number };
  /** Canales con envío por proveedor. Apagados: sólo preparación y confirmación manual. */
  channels: { emailSend: boolean; whatsappApi: boolean };
  aiCompose: boolean;
  aiClassify: boolean;
  customStages: string[];
  /**
   * Piloto automático (autorizado por el titular el 12/11/2026: «Tiene que estar todo automatizado»). Sólo email: primer
   * mensaje y un seguimiento, dentro de la franja y el tope diario, con identificación y baja. WhatsApp e Instagram no se
   * automatizan (las plataformas no permiten mensajes en frío).
   */
  autopilot: { enabled: boolean; dailyLimit: number; window: { from: string; to: string }; followups: boolean; minScore: number; social: boolean; socialDailyLimit: number };
  /** Agenda pública: el gimnasio elige un horario y llega una invitación de calendario al titular. */
  booking: BookingConfig & { enabled: boolean; meetingUrl: string };
  /** Avisos al titular por email (reuniones, recordatorios, resumen diario sólo si hay algo). */
  notify: { email: boolean; meetingReminderMin: number };
  /**
   * Precio por socio (dossier comercial 2026): tramos de referencia SÓLO para estimar el valor de las oportunidades, y ejemplos
   * ilustrativos que se citan al responder una consulta de precios. El precio real se acuerda con cada gimnasio: no cotiza.
   */
  pricing: { currency: "ARS"; tiers: PriceTier[]; examples: PriceExample[] };
};
export const DEFAULT_SETTINGS: Settings = {
  weights: DEFAULT_WEIGHTS,
  cadence: DEFAULT_CADENCE,
  schedule: { enabled: false, days: [1, 2, 3, 4, 5], discovery: "08:00", enrich: "08:30", score: "09:00", compose: "09:30", outreach: "10:00", followup: "17:30", report: "18:00" },
  sender: { name: "Manuel", company: "Sovare", product: "Repi", site: "repiclub.com", whatsapp: "223 538-3082", replyTo: "sovare.studio@gmail.com" },
  // Autorizado por el titular el 12/11/2026 (D218): nombrar a Smart Center Gym y las implementaciones en curso.
  socialProof: "Ya funciona en Smart Center Gym, en Mar del Plata, y estamos en proceso de implementación en varios gimnasios más de Mar del Plata, Balcarce y Tandil.",
  allowedClientNames: ["Smart Center Gym"],
  presentationUrl: "https://repiclub.com/conoce/gimnasios",
  demoUrl: "https://repiclub.com/conoce/gimnasios",
  limits: { discoveryAreasPerRun: 2, enrichPerRun: 12, composePerRun: 10, emailPerDay: 20, maxChars: 900 },
  channels: { emailSend: false, whatsappApi: false },
  aiCompose: false,
  aiClassify: false,
  customStages: [],
  autopilot: { enabled: false, dailyLimit: 8, window: { from: "10:00", to: "17:30" }, followups: true, minScore: 40, social: false, socialDailyLimit: 10 },
  booking: { ...DEFAULT_BOOKING, enabled: true, meetingUrl: "" },
  notify: { email: true, meetingReminderMin: 60 },
  // Dossier comercial 2026, p. 6: 400 socios × $200 = $80.000/mes; 500 socios × $170 = $85.000/mes (ejemplos ilustrativos).
  pricing: { currency: "ARS", tiers: [{ minMembers: 0, unitMinor: 20000 }, { minMembers: 500, unitMinor: 17000 }], examples: [{ members: 400, unitMinor: 20000 }, { members: 500, unitMinor: 17000 }] },
};
export async function getSettings(tx: Tx | typeof db = db): Promise<Settings> {
  const rows = await tx.select().from(leadSetting);
  const s = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
  for (const r of rows) if (r.key in s) s[r.key] = typeof s[r.key] === "object" && !Array.isArray(s[r.key]) && r.value && typeof r.value === "object" ? { ...(s[r.key] as object), ...(r.value as object) } : r.value;
  return s as Settings;
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Valida y guarda una parte de la configuración. Devuelve la configuración completa. */
export async function saveSettings(actorId: string, patch: Partial<Settings>) {
  await leadsAdmin(actorId);
  const cur = await getSettings();
  const next = { ...cur, ...patch } as Settings;
  const w = validateWeights(next.weights); if (w) throw bad(w);
  const c = validateCadence(next.cadence); if (c) throw bad(c);
  const sc = next.schedule;
  for (const k of ["discovery", "enrich", "score", "compose", "outreach", "followup", "report"] as const) if (!HHMM.test(sc[k] ?? "")) throw bad("Los horarios van como HH:MM.");
  const ap = next.autopilot;
  if (!HHMM.test(ap.window.from) || !HHMM.test(ap.window.to) || ap.window.from >= ap.window.to) throw bad("La franja del piloto automático va como HH:MM a HH:MM.");
  if (ap.dailyLimit < 0 || ap.dailyLimit > 30) throw bad("El piloto automático manda entre 0 y 30 emails por día.");
  const bk = next.booking;
  if (!HHMM.test(bk.from) || !HHMM.test(bk.to) || bk.from >= bk.to || ![15, 20, 30, 45, 60].includes(bk.slotMin) || bk.horizonDays < 1 || bk.horizonDays > 21) throw bad("Agenda inválida.");
  if (next.sender.replyTo && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(next.sender.replyTo)) throw bad("El email de respuesta no es válido.");
  if (!Array.isArray(sc.days) || sc.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw bad("Días inválidos.");
  if (!next.sender.name.trim() || !next.sender.company.trim()) throw bad("Falta el remitente.");
  if (next.limits.emailPerDay > 100 || next.limits.emailPerDay < 0) throw bad("El límite diario de emails va de 0 a 100.");
  if (next.limits.discoveryAreasPerRun < 1 || next.limits.discoveryAreasPerRun > 6 || next.limits.enrichPerRun > 40 || next.limits.composePerRun > 40) throw bad("Límites fuera de rango.");
  if (next.customStages.length > 10) throw bad("Hasta 10 etapas propias.");
  await db.transaction(async (tx) => {
    for (const [k, v] of Object.entries(patch)) {
      await tx.insert(leadSetting).values({ key: k, value: v, updatedBy: actorId }).onConflictDoUpdate({ target: leadSetting.key, set: { value: v, updatedBy: actorId, updatedAt: new Date() } });
    }
    await tx.insert(schema.auditEvent).values({ actorUserId: actorId, action: "leads.settings", resourceType: "lead_setting", result: "ok", meta: { keys: Object.keys(patch) } });
  });
  return getSettings();
}

// ── Zonas (cobertura configurable sin tocar código) ─────────────────────────
// Coordenadas del centro de cada localidad (aprox., OpenStreetMap) y radio de búsqueda. Nivel 1 encendido; 2 y 3, apagados.
export const DEFAULT_AREAS: { name: string; province: string; tier: number; lat: number; lng: number; radiusKm: number }[] = [
  { name: "Mar del Plata", province: "Buenos Aires", tier: 1, lat: -38.0055, lng: -57.5426, radiusKm: 14 },
  { name: "Balcarce", province: "Buenos Aires", tier: 1, lat: -37.8462, lng: -58.2552, radiusKm: 5 },
  { name: "Batán", province: "Buenos Aires", tier: 1, lat: -38.0066, lng: -57.7102, radiusKm: 4 },
  { name: "Miramar", province: "Buenos Aires", tier: 1, lat: -38.2706, lng: -57.8389, radiusKm: 5 },
  { name: "Necochea", province: "Buenos Aires", tier: 2, lat: -38.5545, lng: -58.7396, radiusKm: 6 },
  { name: "Quequén", province: "Buenos Aires", tier: 2, lat: -38.5300, lng: -58.7031, radiusKm: 3 },
  { name: "Tandil", province: "Buenos Aires", tier: 2, lat: -37.3217, lng: -59.1332, radiusKm: 7 },
  { name: "Pinamar", province: "Buenos Aires", tier: 2, lat: -37.1080, lng: -56.8613, radiusKm: 6 },
  { name: "Villa Gesell", province: "Buenos Aires", tier: 2, lat: -37.2639, lng: -56.9733, radiusKm: 5 },
  { name: "Partido de La Costa", province: "Buenos Aires", tier: 2, lat: -36.6500, lng: -56.7000, radiusKm: 30 },
  { name: "La Plata", province: "Buenos Aires", tier: 3, lat: -34.9214, lng: -57.9545, radiusKm: 9 },
  { name: "Bahía Blanca", province: "Buenos Aires", tier: 3, lat: -38.7183, lng: -62.2663, radiusKm: 9 },
  { name: "CABA", province: "Ciudad de Buenos Aires", tier: 3, lat: -34.6037, lng: -58.3816, radiusKm: 12 },
  { name: "Gran Buenos Aires", province: "Buenos Aires", tier: 3, lat: -34.6500, lng: -58.5500, radiusKm: 30 },
  { name: "Rosario", province: "Santa Fe", tier: 3, lat: -32.9468, lng: -60.6393, radiusKm: 10 },
  { name: "Córdoba", province: "Córdoba", tier: 3, lat: -31.4201, lng: -64.1888, radiusKm: 12 },
];
export async function ensureAreas(tx: Tx | typeof db = db) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(leadArea);
  if (n > 0) return;
  await tx.insert(leadArea).values(DEFAULT_AREAS.map((a) => ({ ...a, enabled: a.tier === 1 }))).onConflictDoNothing();
}
/** Nivel geográfico por ciudad (nombre de zona configurada). */
/** Dentro de una transacción, pasar su `tx`: no pedir otra conexión del pool mientras se retiene una (guarda transactions.check). */
export async function tierByCity(tx: Tx | typeof db = db): Promise<Map<string, { tier: number; areaId: string }>> {
  await ensureAreas(tx);
  const rows = await tx.select().from(leadArea);
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return new Map(rows.map((r) => [fold(r.name), { tier: r.tier, areaId: r.id }]));
}

// ── Bitácora ─────────────────────────────────────────────────────────────────
export async function logLead(tx: Tx | typeof db, a: { businessId: string; kind: string; summary: string; payload?: Record<string, unknown> | null; actorUserId?: string | null; actorRole: "admin" | "rep" | "system" }) {
  await tx.insert(leadActivity).values({ ...a, summary: a.summary.slice(0, 1000), actorUserId: a.actorUserId ?? null, payload: a.payload ?? null });
}
export async function getLead(id: string, tx: Tx | typeof db = db) {
  const [b] = await tx.select().from(leadBusiness).where(eq(leadBusiness.id, id));
  if (!b) throw NF();
  return b;
}

// ── Baja por enlace (email) ─────────────────────────────────────────────────
const secret = () => process.env.BETTER_AUTH_SECRET ?? "repi-dev-only";
export const unsubscribeToken = (businessId: string) => `${businessId}.${createHmac("sha256", secret()).update(`lead-unsub:${businessId}`).digest("base64url").slice(0, 22)}`;
export function readUnsubscribeToken(token: string): string | null {
  const [id, mac] = token.split(".");
  if (!id || !mac) return null;
  const want = unsubscribeToken(id).split(".")[1];
  const a = Buffer.from(mac), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
export const unsubscribeUrl = (businessId: string) => `${appUrl()}/baja/${unsubscribeToken(businessId)}`;
/** Enlaces firmados por lead para la agenda pública y para «ya me respondió» (desde el aviso al titular). */
const signed = (purpose: string) => ({
  token: (id: string) => `${id}.${createHmac("sha256", secret()).update(`lead-${purpose}:${id}`).digest("base64url").slice(0, 22)}`,
  read(token: string): string | null {
    const [id, mac] = token.split(".");
    if (!id || !mac) return null;
    const want = this.token(id).split(".")[1];
    const a = Buffer.from(mac), b = Buffer.from(want);
    return a.length === b.length && timingSafeEqual(a, b) ? id : null;
  },
});
export const bookingSigner = signed("book");
export const stopSigner = signed("stop");
export const bookingUrl = (businessId: string) => `${appUrl()}/agenda/${bookingSigner.token(businessId)}`;
export const stopUrl = (businessId: string) => `${appUrl()}/api/captacion/respondio/${stopSigner.token(businessId)}`;

// ── Casilla de respuestas (Resend) ───────────────────────────────────────────
/** Estado de la casilla de respuestas de Captación en Resend. Lo escribe sólo el sistema (inbound.ts), fuera de Ajustes. */
export type InboundState = { status: "ok" | "error"; address: string | null; inboxId: string | null; webhookId: string | null; error: string | null; checkedAt: string };
export const INBOUND_KEY = "inbound";
export async function inboundState(tx: Tx | typeof db = db): Promise<InboundState | null> {
  const [r] = await tx.select().from(leadSetting).where(eq(leadSetting.key, INBOUND_KEY));
  return (r?.value as InboundState | undefined) ?? null;
}
/**
 * A dónde responden los gimnasios: la casilla de REPI cuando está activa (registra la respuesta y se la reenvía al
 * titular); si no, el email comercial de Ajustes.
 */
export async function replyAddress(s: Settings): Promise<string | null> {
  const st = await inboundState().catch(() => null);
  return st?.status === "ok" && st.address ? st.address : s.sender.replyTo || null;
}
