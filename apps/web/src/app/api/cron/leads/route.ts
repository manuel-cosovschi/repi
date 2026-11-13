// D218 · Captación: entrada interna con CRON_SECRET (la misma clave que el job de cada minuto, guardada en Vault). Sirve para
// lanzar un paso o importar investigación desde la base (pg_net) o una automatización, sin sesión de Admin. Nunca envía mensajes.
import { z } from "zod";
import { cronAuthorized } from "@/server/cron";
import { logError } from "@/server/log";
import { leadsEnabled } from "@/server/leads/core";
import { importExclusionsAs, importLeadsAs, type ImportRow } from "@/server/leads/crm";
import { runStepSystem, STEPS } from "@/server/leads/pipeline";
import { recordReplyAs } from "@/server/leads/messaging";
import { findLeadByContact } from "@/server/leads/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const src = z.object({ url: z.string().max(500).nullable().optional(), type: z.string().max(40).nullable().optional(), seenAt: z.string().max(20).nullable().optional() });
const row = z.object({
  name: z.string().max(160), city: z.string().max(80).nullable(), province: z.string().max(80).nullable().optional(), locality: z.string().max(80).nullable().optional(),
  address: z.string().max(200).nullable().optional(), website: z.string().max(300).nullable().optional(), instagram: z.string().max(120).nullable().optional(), facebook: z.string().max(300).nullable().optional(),
  email: z.string().max(200).nullable().optional(), phone: z.string().max(40).nullable().optional(), whatsapp: z.string().max(40).nullable().optional(), category: z.string().max(30).nullable().optional(),
  positioning: z.string().max(300).nullable().optional(), branches: z.number().int().nullable().optional(), estMembers: z.number().int().nullable().optional(), notes: z.string().max(1000).nullable().optional(),
  sources: z.record(z.string(), src).optional(),
});
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run"), step: z.enum(STEPS), areaIds: z.array(z.string().max(64)).max(20).optional() }),
  z.object({ action: z.literal("reply"), channel: z.enum(["email", "whatsapp", "instagram"]), from: z.string().max(200), text: z.string().max(4000), receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }),
  z.object({ action: z.literal("import"), label: z.string().max(120), rows: z.array(row).max(500), exclusions: z.array(z.object({ name: z.string().max(160), city: z.string().max(80).nullable().optional(), reason: z.string().max(200) })).max(50).optional() }),
]);

export async function POST(req: Request) {
  if (!cronAuthorized(req) || !leadsEnabled()) return new Response(null, { status: 404 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  const p = parsed.data;
  try {
    if (p.action === "reply") {
      const id = await findLeadByContact(p.channel, p.from);
      if (!id) return Response.json({ matched: false });
      return Response.json({ matched: true, ...(await recordReplyAs(null, id, { channel: p.channel, text: p.text, receivedOn: p.receivedOn ?? null })) });
    }
    if (p.action === "run") return Response.json(await runStepSystem(p.step, { areaIds: p.areaIds, budgetMs: 40_000 }));
    const imported = await importLeadsAs(null, p.rows as ImportRow[], { label: p.label });
    const excluded = p.exclusions?.length ? await importExclusionsAs(null, p.exclusions) : null;
    return Response.json({ imported: { ...imported, errors: imported.errors.slice(0, 10) }, excluded });
  } catch (e) {
    logError("cron.leads", e, req);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
