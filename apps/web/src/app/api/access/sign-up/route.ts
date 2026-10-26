import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({
  // Anexo 26/10: sin autoalta de coach/gym. "owner" = responsable invitado por Admin; "member" = socio que llega por QR.
  flow: z.enum(["invite", "member", "owner"]),
  name: z.string().max(120), email: z.string().max(200), password: z.string().max(200),
  terms: z.boolean(), birth: z.string().max(10).optional(),
});

// Registro con aceptación legal registrada en servidor (F-ID-15). Envía el código de verificación.
export const POST = handle(async (req) => {
  await limit("sign-up", 8);
  const b = await body(req, S);
  const r = await svc.signUpPerson({
    name: b.name, email: b.email, password: b.password, terms: b.terms,
    birth: b.flow === "owner" ? undefined : (b.birth ?? ""), organizationTerms: b.flow === "owner",
  });
  return { email: r.email, minor: r.minor };
});
