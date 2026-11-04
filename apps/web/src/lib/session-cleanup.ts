"use client";
import { authClient } from "./auth-client";
import { pendingFor } from "./offline/queue";
import { clearEntry } from "./entry";
import { wipeLocal } from "./offline/store";
import { forgetThemeOwner } from "./theme";

export const LOGOUT_KEY = "repi:logout";
export async function clearPrivateDeviceData() {
  await wipeLocal();
  if (typeof caches !== "undefined") {
    for (const key of await caches.keys()) if (key.startsWith("repi-")) await caches.delete(key);
  }
  // Las altas pendientes tienen tokens personales; tampoco se transfieren a otra cuenta.
  sessionStorage.removeItem("repi:first-admin-ticket");
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
  const result = await authClient.signOut();
  if (result.error) throw new Error(result.error.message ?? "No pudimos cerrar la sesión. Revisá tu conexión.");
  // Avisar antes del borrado detiene inmediatamente otras vistas que podrían volver a escribir la cola.
  localStorage.setItem(LOGOUT_KEY, `${Date.now()}:${Math.random()}`);
  await clearPrivateDeviceData();
  return true;
}
