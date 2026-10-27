import { cronAuthorized } from "@/server/cron";
import { logError } from "@/server/log";
import { sendViaProvider } from "@/server/mailer";

export const dynamic = "force-dynamic";

// Operación (D84): correo de prueba por el mismo camino que usa la app, para comprobar la entrega real del proveedor.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response(null, { status: 404 });
  const to = new URL(req.url).searchParams.get("to") ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return Response.json({ error: "email inválido" }, { status: 400 });
  try {
    await sendViaProvider({ to, subject: "Prueba de correo de REPI", body: "Este es un correo de prueba enviado desde REPI (repiclub.com).\nSi lo recibiste, los códigos de verificación, invitaciones y bienvenidas ya pueden llegar.\n\nNo hace falta responder." });
    return Response.json({ sent: true });
  } catch (err) { logError("cron.mail_test", err, req); return Response.json({ sent: false, error: err instanceof Error ? err.message : "error" }, { status: 502 }); }
}
