// D218 · «Ya me respondió» desde el aviso por email al titular: frena los seguimientos de ese gimnasio. Enlace firmado; un
// escáner que lo abra sólo puede frenar envíos, nunca disparar uno.
import { stopByLink } from "@/server/leads/autopilot";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const r = await stopByLink((await params).token.slice(0, 200));
  const msg = r ? `Listo: frené los seguimientos a ${r.name}. No le llega ningún mensaje más hasta que alguien lo retome.` : "Enlace inválido.";
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>REPI · Captación</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5"><h1 style="font-size:22px">${r ? "Hecho" : "No encontrado"}</h1><p>${msg.replace(/</g, "&lt;")}</p></body></html>`;
  return new Response(html, { status: r ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
