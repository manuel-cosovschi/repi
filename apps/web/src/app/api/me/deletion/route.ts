import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as pv from "@/server/privacy/services";

// Pedido de eliminación de cuenta (F-PR-02, D75): queda registrado; REPI lo atiende con el procedimiento operativo.
export const GET = handle(async () => pv.myPrivacyRequests(await sessionUserId()));
export const POST = handle(async (req) => {
  const uid = await sessionUserId();
  await limit("privacy-delete", 5);
  return pv.requestDeletion(uid, (await body(req, z.object({ note: z.string().max(500).nullable().optional() }))).note);
});
