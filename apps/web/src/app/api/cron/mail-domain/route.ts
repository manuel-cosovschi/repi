import { cronAuthorized } from "@/server/cron";
import { logError } from "@/server/log";
import { resendDomain } from "@/server/mailer";

export const dynamic = "force-dynamic";

// Operación (D84): alta/verificación del dominio remitente en Resend. Devuelve sólo registros DNS públicos, nunca la clave.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  const u = new URL(req.url);
  try { return Response.json(await resendDomain(u.searchParams.get("domain") ?? "repiclub.com", u.searchParams.get("verify") === "1", u.searchParams.get("harden") === "1")); }
  catch (err) { logError("cron.mail_domain", err, req); return Response.json({ error: "Resend no respondió como se esperaba" }, { status: 502 }); }
}
