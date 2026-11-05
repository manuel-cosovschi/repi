// D198: señal del workflow «Respaldo» cuando un respaldo quedó verificado y publicado. Se autentica con el token OIDC de
// GitHub del workflow de respaldo en main (sin secretos guardados) o con BACKUP_HEARTBEAT_SECRET. Si no, la ruta no existe.
import { z } from "zod";
import { heartbeatSource, recordBackupHeartbeat } from "@/server/ops/backup-watch";

export const dynamic = "force-dynamic";
const Body = z.object({ tag: z.string().max(80), run: z.string().max(24) });

export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  const source = await heartbeatSource(req, p.success ? p.data.run : "");
  if (!source) return new Response(null, { status: 404 });
  if (!p.success) return Response.json({ ok: false }, { status: 400 });
  const r = await recordBackupHeartbeat({ ...p.data, source });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
