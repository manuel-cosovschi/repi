"use client";
// Aviso de fin de descanso con la app en segundo plano (F-HX-22, D107). Opcional y por dispositivo: usa el permiso de
// notificaciones del navegador y una notificación local del service worker, sin servidor ni push. No promete exactitud:
// con la app en segundo plano el sistema puede demorar o congelar el temporizador (en iPhone es habitual); por eso la
// pantalla lo dice y el descanso igual termina por hora real al volver.
const KEY = "repi:rest-alert";
export type RestAlertState = "on" | "off" | "denied" | "unsupported";

const supported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
const wanted = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

export function restAlertState(): RestAlertState {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && wanted() ? "on" : "off";
}

/** Pide permiso (desde un toque de la persona) y recuerda la preferencia en este dispositivo. */
export async function enableRestAlert(): Promise<RestAlertState> {
  if (!supported()) return "unsupported";
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (p !== "granted") return p === "denied" ? "denied" : "off";
  try { localStorage.setItem(KEY, "1"); } catch { /* sin almacenamiento: vale mientras dure la pantalla */ }
  return "on";
}
export function disableRestAlert() { try { localStorage.removeItem(KEY); } catch { /* */ } cancelRestAlert(); }

let timer: ReturnType<typeof setTimeout> | undefined;
/** Programa el aviso para la hora de fin. Si la app está a la vista no notifica: vibra (si el teléfono lo permite). */
export function scheduleRestAlert(endMs: number, body: string) {
  cancelRestAlert();
  if (restAlertState() !== "on") return;
  timer = setTimeout(() => void fire(body), Math.max(0, endMs - Date.now()));
}
export function cancelRestAlert() { clearTimeout(timer); timer = undefined; }

async function fire(body: string) {
  timer = undefined;
  if (document.visibilityState === "visible") { navigator.vibrate?.(200); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("Descanso terminado", { body, tag: "repi-rest", icon: "/icons/icon-192.png", data: { url: "/app", focusOnly: true } });
  } catch { /* sin permiso vigente o sin service worker: queda el aviso en pantalla al volver */ }
}
