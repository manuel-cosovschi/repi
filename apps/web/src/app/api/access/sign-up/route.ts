import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({
  // Anexo 26/10: sin autoalta de coach/gym. "owner" = responsable invitado por Admin; "member" = socio que llega por QR.
  flow: z.enum(["invite", "member", "owner"]),
  name: z.string().max(120), email: z.string().max(200), password: z.string().max(200),
  terms: z.boolean(), birth: z.string().max(10).optional(), code: z.string().max(20).optional(),
});

// Registro con aceptación legal registrada en servidor (F-ID-15). Envía el código de verificación.
export const POST = handle(async (req) => {
  await limit("sign-up", 8);
  const b = await body(req, S);
  // La fecha de nacimiento se pide a alumnos y socios (política de menores). El equipo de un gimnasio entra con una
  // invitación de equipo vigente y no la carga (F-12): se valida con el código, no con lo que diga el cliente.
  const bound = b.flow === "invite" && !!b.code && (await svc.assertInvitationEmail(b.code, b.email));
  const staff = b.flow === "invite" && !!b.code && (await svc.lookupInvitation(b.code).then((i) => i.kind === "gym_staff", () => false));
  const r = await svc.signUpPerson({
    name: b.name, email: b.email, password: b.password, terms: b.terms,
    birth: b.flow === "owner" || staff ? undefined : (b.birth ?? ""), organizationTerms: b.flow === "owner", sendOtp: !bound,
  });
  // D130: invitación personal abierta con su mismo email: cuenta verificada, se entra con la contraseña sin código.
  if (bound && r.userId && (await svc.verifyByInvitation(r.userId, b.code!))) return { email: r.email, minor: r.minor, verified: true };
  if (bound && !r.existing) await svc.sendSignupOtp(r.email);
  return { email: r.email, minor: r.minor, verified: false, existing: r.existing };
});
