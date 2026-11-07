// Contacto comercial (anexo §3): coach y gym ya no se dan de alta solos. Se registra el interés y Admin hace el alta.
// D205: también aliados/inversores, email o WhatsApp, y el origen anónimo de la visita (Experience Hub).
import { z } from "zod";
import { body, handle, limit } from "@/server/access/http";
import { createLead } from "@/server/commercial/services";

const S = z.object({
  kind: z.enum(["gym", "coach", "partner"]), orgName: z.string().max(120).nullable().optional(), contactName: z.string().max(80),
  email: z.string().max(200).nullable().optional(), phone: z.string().max(40).nullable().optional(), message: z.string().max(600).nullable().optional(),
  source: z.string().max(20).nullable().optional(), campaign: z.string().max(80).nullable().optional(), interest: z.string().max(20).nullable().optional(), referralCode: z.string().max(12).nullable().optional(),
  // Antispam (D205): campo trampa invisible y tiempo desde que se mostró el formulario. Quien lo completa o tarda menos de
  // 2 s recibe la misma respuesta, pero no se guarda nada.
  website: z.string().max(200).optional(), elapsedMs: z.number().int().min(0).max(86_400_000).optional(),
});

export const POST = handle(async (req) => {
  await limit("lead", 5);
  const { website, elapsedMs, ...lead } = await body(req, S);
  if (website || (elapsedMs !== undefined && elapsedMs < 2000)) return { ok: true };
  return createLead(lead);
});
