// D203: la persona declara su fecha de nacimiento cuando su cuenta no la tiene. Una sola vez: no reemplaza una existente.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { declareBirthDate } from "@/server/access/services";

export const POST = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`birth-date:${me}`, 5);
  return declareBirthDate(me, (await body(req, z.object({ birth: z.string().max(20) }))).birth);
});
