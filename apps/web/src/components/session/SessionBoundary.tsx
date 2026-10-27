"use client";
import { useEffect } from "react";
import { clearPrivateDeviceData, LOGOUT_KEY } from "@/lib/session-cleanup";

/** Invalida vistas abiertas en otras pestañas, incluidas las restauradas desde bfcache. */
export function SessionBoundary() {
  useEffect(() => {
    let generation = localStorage.getItem(LOGOUT_KEY);
    let leaving = false;
    const invalidate = () => {
      if (leaving) return;
      leaving = true;
      // Ocultar de inmediato los datos privados mientras IndexedDB termina su transacción.
      document.body.style.visibility = "hidden";
      void clearPrivateDeviceData().finally(() => window.location.replace("/acceso"));
    };
    const check = () => { if (localStorage.getItem(LOGOUT_KEY) !== generation) invalidate(); };
    const changed = (e: StorageEvent) => { if (e.key === LOGOUT_KEY) { generation = e.newValue; invalidate(); } };
    window.addEventListener("storage", changed);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    return () => { window.removeEventListener("storage", changed); window.removeEventListener("pageshow", check); document.removeEventListener("visibilitychange", check); };
  }, []);
  return null;
}
