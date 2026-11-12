import { z } from "zod";
import { PROFILE_VIAS } from "@repi/domain";
import { body, handle, sessionUserId } from "@/server/access/http";
import { markProfileAsked, myProfile, updateProfile } from "@/server/settings/profile";

// D217: perfil de entrenamiento de la propia persona (sin parámetro de usuario: siempre el de la sesión).
// POST { patch, via } cambia sólo lo enviado; POST { asked } registra que el formulario breve ya se ofreció en ese lugar.
const WHERE = ["onboarding", "routines", "import", "solo", "coach_absent", "brain"] as const;
export const GET = handle(async () => myProfile(await sessionUserId()));
export const POST = handle(async (req) => {
  const p = await body(req, z.union([
    z.object({ patch: z.record(z.string(), z.unknown()), via: z.enum(PROFILE_VIAS as [string, ...string[]]) }).strict(),
    z.object({ asked: z.enum(WHERE) }).strict(),
  ]));
  const uid = await sessionUserId();
  if ("asked" in p) { await markProfileAsked(uid, p.asked); return myProfile(uid); }
  return updateProfile(uid, p.patch, p.via as never);
});
