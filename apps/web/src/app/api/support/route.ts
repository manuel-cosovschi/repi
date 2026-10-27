// Soporte (N-O11, D93): abierto también sin sesión, para quien no puede entrar. La respuesta es la misma exista o no
// una cuenta con ese correo; con sesión, la consulta queda ligada a la cuenta.
import { z } from "zod";
import { body, handle, limit, optionalUserId } from "@/server/access/http";
import { SUPPORT_CATEGORIES, openTicket } from "@/server/support/services";

const S = z.object({
  category: z.enum(SUPPORT_CATEGORIES), message: z.string().max(2000), email: z.string().max(200).nullable().optional(),
  diagnostics: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const POST = handle(async (req) => {
  await limit("support", 5, 600_000);
  const p = await body(req, S);
  const uid = await optionalUserId();
  return openTicket({ userId: uid, email: uid ? null : p.email, category: p.category, message: p.message, diagnostics: p.diagnostics });
});
