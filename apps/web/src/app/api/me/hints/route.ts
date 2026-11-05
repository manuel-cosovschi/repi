import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { HINT_KEYS, myHints, resetHints, setHint } from "@/server/settings/services";

// D195: ayudas de primera vez vistas u omitidas (sólo claves y fechas).
export const GET = handle(async () => myHints(await sessionUserId()));
export const POST = handle(async (req) => {
  const p = await body(req, z.union([z.object({ key: z.enum(HINT_KEYS), seen: z.boolean().default(true) }).strict(), z.object({ reset: z.literal(true) }).strict()]));
  return "reset" in p ? resetHints(await sessionUserId()) : setHint(await sessionUserId(), p.key, p.seen);
});
