// Registro de este dispositivo para avisos push (anexo 26/10 §7). Sólo por acción explícita de la persona.
import { api } from "./api";

export type PushState = { supported: boolean; permission: NotificationPermission | "unsupported"; subscribed: boolean; configured: boolean; paused: boolean; devices: number;
  /** D210: avisos del Asistente REPI. `eligible` = adulto confirmado (a un menor no se le ofrecen); `enabled` = activados. */
  coaching?: { enabled: boolean; eligible: boolean } };
type PushStatus = { configured: boolean; publicKey: string | null; devices: number; paused: boolean; coaching?: { enabled: boolean; eligible: boolean } };

const swUrl = () => (process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?mode=push");
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushState(): Promise<PushState> {
  const st = await api<PushStatus>("/api/push");
  if (!supported()) return { supported: false, permission: "unsupported", subscribed: false, configured: st.configured, paused: st.paused, devices: st.devices, coaching: st.coaching };
  return { supported: true, permission: Notification.permission, subscribed: !!(await currentSub()), configured: st.configured, paused: st.paused, devices: st.devices, coaching: st.coaching };
}

/**
 * Registra este dispositivo. D210: con `coaching: true` (Perfil → Asistente REPI, socio adulto) el servidor además activa los
 * avisos de REPI fuera de la app; un menor o una edad sin confirmar responde 403 y no se registra nada.
 */
export async function enablePush(opts: { coaching?: boolean } = {}): Promise<{ ok: boolean; coaching?: boolean }> {
  if (!supported()) throw new Error("Este navegador no admite avisos push. En iPhone, agregá REPI a la pantalla de inicio primero.");
  const st = await api<{ configured: boolean; publicKey: string | null }>("/api/push");
  if (!st.configured || !st.publicKey) throw new Error("Los avisos push no están configurados en este entorno.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("No diste permiso para avisos. Podés activarlo desde la configuración del navegador.");
  const reg = await navigator.serviceWorker.register(swUrl(), { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(st.publicKey) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return api<{ ok: boolean; coaching?: boolean }>("/api/push/subscribe", { body: { endpoint: j.endpoint, keys: j.keys, ...(opts.coaching ? { coaching: true } : {}) } });
}

export async function disablePush() {
  const sub = supported() ? await currentSub() : null;
  if (!sub) return;
  await api("/api/push/unsubscribe", { body: { endpoint: sub.endpoint } });
  await sub.unsubscribe().catch(() => {});
}

export const setPushPaused = (paused: boolean) => api("/api/push/pause", { body: { paused } });
