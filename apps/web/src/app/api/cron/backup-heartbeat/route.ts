// D198: señal del workflow «Respaldo» cuando un respaldo quedó verificado y publicado. Sin el secreto la ruta no existe.
import { z } from "zod";
import { heartbeatAuthorized, recordBackupHeartbeat } from "@/server/ops/backup-watch";

export const dynamic = "force-dynamic";
const Body = z.object({ tag: z.string().max(80), run: z.string().max(24) });

export async function POST(req: Request) {
  if (!heartbeatAuthorized(req)) return new Response(null, { status: 404 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false }, { status: 400 });
  const r = await recordBackupHeartbeat(p.data);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
