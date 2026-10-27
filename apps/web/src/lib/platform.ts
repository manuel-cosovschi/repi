// Entorno del navegador para la guía de agregar a inicio (anexo PWA §Variantes por plataforma).
// La detección sólo elige qué instrucciones mostrar primero: la persona siempre puede cambiar a mano.
export type Platform = "ios" | "android" | "other";
export type Env = { platform: Platform; mobile: boolean; standalone: boolean; inApp: boolean };

export function detectEnv(): Env {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  // Navegadores internos de apps de mensajería y redes: no permiten agregar a inicio.
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Twitter|TikTok|musical_ly|LinkedInApp|Snapchat|GSA\//.test(ua);
  return { platform: ios ? "ios" : android ? "android" : "other", mobile: ios || android, standalone, inApp };
}

/** Evento real del navegador para instalar (Chrome/Edge en Android). Lo captura el script de layout antes de hidratar. */
export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export const installEvent = () => (window as { __repiBIP?: InstallEvent }).__repiBIP ?? null;
export const forgetInstallEvent = () => { (window as { __repiBIP?: InstallEvent }).__repiBIP = undefined; };

const GUIDE_KEY = "repi:guide";
export const guideDone = () => { try { return localStorage.getItem(GUIDE_KEY) !== null; } catch { return false; } };
export const markGuide = (how: "added") => { try { localStorage.setItem(GUIDE_KEY, how); } catch {} };
