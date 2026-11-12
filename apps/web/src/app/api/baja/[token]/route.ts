// D218 · Baja por enlace (POST desde /baja/[token]). Idempotente y sin revelar si el expediente existe.
import { readUnsubscribeToken } from "@/server/leads/core";
import { unsubscribeByLink } from "@/server/leads/messaging";
import { limit } from "@/server/access/http";
import { logError } from "@/server/log";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = readUnsubscribeToken(token.slice(0, 200));
  if (!id) return new Response(null, { status: 404 });
  try { await limit(`baja:${id}`, 10); await unsubscribeByLink(id); } catch (e) { logError("leads.unsubscribe", e, req); }
  return Response.redirect(new URL(`/baja/${encodeURIComponent(token)}?ok=1`, req.url), 303);
}
