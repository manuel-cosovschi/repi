// D218 · Reserva de la agenda pública (POST del formulario de /agenda/[token]).
import { bookMeeting } from "@/server/leads/autopilot";
import { limit } from "@/server/access/http";
import { logError } from "@/server/log";

export const maxDuration = 30;
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = (q: string) => Response.redirect(new URL(`/agenda/${encodeURIComponent(token)}?${q}`, req.url), 303);
  try {
    await limit("agenda", 10);
    const f = await req.formData();
    const r = await bookMeeting(token.slice(0, 200), { slot: String(f.get("slot") ?? ""), name: String(f.get("name") ?? ""), phone: String(f.get("phone") ?? ""), email: String(f.get("email") ?? "") || null, note: String(f.get("note") ?? "") || null });
    return r.ok ? back("ok=1") : back(`error=${encodeURIComponent(r.error)}`);
  } catch (e) {
    logError("leads.booking", e, req);
    return back(`error=${encodeURIComponent("No pudimos agendar. Probá de nuevo o escribinos por WhatsApp.")}`);
  }
}
