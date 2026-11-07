// D205 · Experience Hub: vocabulario cerrado de la medición del sitio comercial. Lo comparten el navegador (que sólo manda
// estos nombres) y el servidor (que descarta cualquier otro). Sin datos personales: ni nombres, ni emails, ni teléfonos.

export const SITE_EVENTS = [
  "landing_view", // se abrió /conoce (o un perfil)
  "scene_view", // Experience 3.0: llegó a una escena (target = escena), una vez por visita
  "film_open", // abrió un film en la sala de proyección (target = id del video)
  "qr_scan", // pasó por /qr (lo registra el servidor al redirigir)
  "profile_select", // eligió un perfil en el selector
  "video_play", "video_progress", "video_complete", // centro audiovisual (target = id del video; progress con 25/50/75)
  "demo_click", // tocó una tarjeta de demo (target = perfil de la demo)
  "demo_start", // la demo se creó y se abrió
  "demo_error", // la demo no se pudo crear (límite, demasiadas abiertas)
  "intel_try", // usó el simulador de Training Intelligence
  "feature_click", // abrió una función (target = id)
  "whatsapp_click", "email_click", "contact_click", // contacto directo o ir al formulario
  "form_submit", // envió el formulario
  "meeting_request", // envió el formulario pidiendo reunión (aliados) o tocó «Agendar una reunión»
] as const;
export type SiteEventName = (typeof SITE_EVENTS)[number];

export const PROFILES = ["gimnasios", "entrenadores", "deportistas", "aliados"] as const;
export type Profile = (typeof PROFILES)[number];
export const isProfile = (x: unknown): x is Profile => typeof x === "string" && (PROFILES as readonly string[]).includes(x);

export const SOURCES = ["qr", "utm", "referral", "direct"] as const;
export type Source = (typeof SOURCES)[number];
export const DEVICES = ["mobile", "tablet", "desktop"] as const;

/** Campañas, UTM y destinos: minúsculas, letras, números, guiones, puntos y guiones bajos; máximo 60. Lo demás se descarta. */
export function cleanTag(x: unknown, max = 60): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim().toLowerCase().replace(/\s+/g, "-").slice(0, max);
  return /^[a-z0-9][a-z0-9._-]*$/.test(t) ? t : null;
}

/** Rutas públicas del sitio que se pueden registrar (nunca rutas de la app con identificadores). */
export function cleanPath(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const p = x.split(/[?#]/)[0].slice(0, 80);
  return /^\/(conoce(\/[a-z]+)?|qr(\/[a-z0-9-]+)?)?$/.test(p) ? p : null;
}
