// D209 · Enlace personal de un vendedor (/conoce?ref=V-XXXXXX). Se recuerda en la pestaña; el servidor sólo lo acepta si es de
// un vendedor activo y lo guarda como origen del contacto, nunca como una venta atribuida. Lo usan el formulario y, desde 4.0,
// los enlaces de WhatsApp (el código viaja en el mensaje, así la referencia no se pierde si la persona escribe en vez de
// completar el formulario).
const REF_KEY = "repi:ref:v1";
export function referral(): string | null {
  try {
    const q = new URLSearchParams(location.search).get("ref");
    if (q && /^V-[A-Z0-9]{6}$/i.test(q)) { sessionStorage.setItem(REF_KEY, q.toUpperCase()); return q.toUpperCase(); }
    return sessionStorage.getItem(REF_KEY);
  } catch { return null; }
}
/** El enlace de WhatsApp con la referencia del vendedor al final del mensaje (si hay una y todavía no está). */
export function withReferral(href: string): string {
  const r = referral();
  if (!r || !/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)) return href;
  try {
    const u = new URL(href), t = u.searchParams.get("text") ?? "";
    if (t.includes(r)) return href;
    u.searchParams.set("text", `${t} (Ref. ${r})`.trim());
    return u.toString();
  } catch { return href; }
}
