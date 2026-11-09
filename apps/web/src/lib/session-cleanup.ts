"use client";
import { authClient } from "./auth-client";
import { pendingFor } from "./offline/queue";
import { clearEntry } from "./entry";
import { wipeLocal } from "./offline/store";
import { forgetThemeOwner } from "./theme";
import { disablePush } from "./push";

export const LOGOUT_KEY = "repi:logout";
/**
 * FSA1 (seguridad): borradores con datos de otras personas o de salud que la app guarda en el navegador para no perder
 * trabajo (programa del coach, programa y motivo del socio en el gym, revisión de un programa o historial importado).
 * No quedan para la cuenta siguiente en un teléfono o una tablet compartidos.
 */
export const PRIVATE_LOCAL_PREFIXES = ["repi:program-draft:", "repi:gym-program-draft:", "repi:import:"] as const;
const PRIVATE_SESSION_KEYS = ["repi:first-admin-ticket", "repi:ti-draft"] as const;
export async function clearPrivateDeviceData() {
  await wipeLocal();
  try { for (const k of Object.keys(localStorage)) if (PRIVATE_LOCAL_PREFIXES.some((p) => k.startsWith(p))) localStorage.removeItem(k); } catch { /* sin almacenamiento */ }
  if (typeof caches !== "undefined") {
    for (const key of await caches.keys()) if (key.startsWith("repi-")) await caches.delete(key);
  }
  // Las altas pendientes tienen tokens personales; tampoco se transfieren a otra cuenta, ni la propuesta de Training
  // Intelligence de un alumno a medio revisar.
  for (const k of PRIVATE_SESSION_KEYS) sessionStorage.removeItem(k);
  // D192: referencias de «Copiar día» (por organización): no quedan para la cuenta siguiente.
  for (const k of Object.keys(sessionStorage)) if (k.startsWith("repi:day-clip:")) sessionStorage.removeItem(k);
  clearEntry();
  // D188: la apariencia queda en el navegador, pero sin cuenta ni cambio pendiente.
  forgetThemeOwner();
}
/** Una única salida para Alumno, Coach, Gym, Admin y cambio de cuenta en Acceso. */
export async function signOutSafely(): Promise<boolean> {
  const pending = await pendingFor();
  if (pending && !window.confirm(`Hay ${pending} cambios sin sincronizar. Si cerrás sesión se pierden. ¿Cerrar igual?`)) return false;
  // FSA1: los avisos push de esta cuenta dejan de llegar a este dispositivo (con la sesión todavía abierta para darlo de baja).
  await disablePush().catch(() => {});
  const result = await authClient.signOut();
  if (result.error) throw new Error(result.error.message ?? "No pudimos cerrar la sesión. Revisá tu conexión.");
  // Avisar antes del borrado detiene inmediatamente otras vistas que podrían volver a escribir la cola.
  localStorage.setItem(LOGOUT_KEY, `${Date.now()}:${Math.random()}`);
  await clearPrivateDeviceData();
  return true;
}
