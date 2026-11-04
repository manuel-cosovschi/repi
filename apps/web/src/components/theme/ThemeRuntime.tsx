"use client";
// D188: mantiene el tema aplicado en todo el documento (montado una vez en el layout raíz). No renderiza nada ni guarda
// estado de React: el modo vive en <html data-theme>, así que cambiarlo no reinicia pantallas, temporizadores ni formularios.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyTheme, forgetThemeOwner, getThemeState, syncStatusBar, syncThemeWithAccount } from "@/lib/theme";
import { DARK_MQ, THEME_KEY } from "@/lib/theme-boot";
import { parseLocalTheme } from "@repi/domain";

/** Espacios con sesión: ahí la apariencia se sincroniza con la cuenta. */
const SIGNED_IN = /^\/(?:app|coach|gym|admin|cuenta)(?:\/|$)/;

export function ThemeRuntime() {
  const path = usePathname();
  useEffect(() => {
    applyTheme(getThemeState().pref);
    const mq = matchMedia(DARK_MQ);
    // Automático acompaña al dispositivo en vivo (claro ↔ oscuro) sin tocar la preferencia guardada.
    const onSystem = () => { if (getThemeState().pref === "system") applyTheme("system"); };
    // Otra pestaña cambió el tema o cerró la sesión.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) applyTheme(parseLocalTheme(e.newValue)?.pref ?? "system");
      if (e.key === "repi:logout") forgetThemeOwner();
    };
    const onOnline = () => { if (SIGNED_IN.test(location.pathname)) void syncThemeWithAccount(); };
    mq.addEventListener("change", onSystem);
    addEventListener("storage", onStorage);
    addEventListener("online", onOnline);
    return () => { mq.removeEventListener("change", onSystem); removeEventListener("storage", onStorage); removeEventListener("online", onOnline); };
  }, []);
  useEffect(() => {
    syncStatusBar();
    if (SIGNED_IN.test(path)) void syncThemeWithAccount();
  }, [path]);
  return null;
}
