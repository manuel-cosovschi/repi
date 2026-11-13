// D218 · Aviso de Resend cuando un gimnasio responde un email de Captación. No se confía en el cuerpo: REPI vuelve a
// leer el email en Resend con su propia clave antes de registrarlo (inbound.ts). Un aviso falso no puede inventar una
// respuesta: como mucho hace buscar un email que no existe.
import { handleInbound } from "@/server/leads/inbound";
import { leadsEnabled } from "@/server/leads/core";
import { logError } from "@/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!leadsEnabled()) return new Response(null, { status: 404 });
  const raw = await req.text();
  if (raw.length > 200_000) return new Response(null, { status: 413 });
  let ev: { type?: string; data?: Record<string, unknown> };
  try { ev = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  try {
    const r = await handleInbound(ev);
    return Response.json({ result: r.result }, { status: r.status });
  } catch (e) {
    logError("leads.inbound", e, req);
    return Response.json({ result: "error" }, { status: 500 });
  }
}
