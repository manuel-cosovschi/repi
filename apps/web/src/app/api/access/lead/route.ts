// Contacto comercial (anexo §3): coach y gym ya no se dan de alta solos. Se registra el interés y Admin hace el alta.
import { z } from "zod";
import { body, handle, limit } from "@/server/access/http";
import { createLead } from "@/server/commercial/services";

const S = z.object({ kind: z.enum(["gym", "coach"]), orgName: z.string().max(120), contactName: z.string().max(80), email: z.string().max(200), phone: z.string().max(40).nullable().optional(), message: z.string().max(600).nullable().optional() });

export const POST = handle(async (req) => {
  await limit("lead", 5);
  return createLead(await body(req, S));
});
