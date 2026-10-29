import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({ name: z.string().max(120), email: z.string().max(200), relation: z.string().max(40) });

export const POST = handle(async (req) => {
  await limit("guardian", 5);
  // SEC-10 (QA 29/10): manda un correo a la dirección que se escriba: tope diario por persona.
  const me = await sessionUserId();
  await limit(`guardian:${me}`, 5, 86_400_000);
  return svc.requestGuardianConsent(me, await body(req, S));
});
export const GET = handle(async () => ({ status: await svc.guardianStatus(await sessionUserId()) }));
