// D209 · Enlace personal de un vendedor (/conoce?ref=V-XXXXXX). Se recuerda en la pestaña; el servidor sólo lo acepta si es de
// un vendedor activo y lo guarda como origen del contacto, nunca como una venta atribuida. Sólo lo usa el formulario, como dato
// oculto: el visitante no ve el código en ningún lado de la página ni en los mensajes de WhatsApp (pedido del titular, 13/11).
const REF_KEY = "repi:ref:v1";
export function referral(): string | null {
  try {
    const q = new URLSearchParams(location.search).get("ref");
    if (q && /^V-[A-Z0-9]{6}$/i.test(q)) { sessionStorage.setItem(REF_KEY, q.toUpperCase()); return q.toUpperCase(); }
    return sessionStorage.getItem(REF_KEY);
  } catch { return null; }
}
