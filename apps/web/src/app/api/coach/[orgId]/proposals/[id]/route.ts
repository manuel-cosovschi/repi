import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { decideProposal } from "@/server/training/intelligence";

// D191: el coach decide sobre una propuesta de REPI. Nunca cambia la rutina: para aplicar un cambio, edita el programa.
const B = z.object({ status: z.enum(["accepted", "modified", "rejected", "kept"]), note: z.string().max(200).nullable().optional() });
export const POST = handle<{ params: Promise<{ orgId: string; id: string }> }>(async (req, { params }) => {
  const { orgId, id } = await params;
  return decideProposal(await sessionUserId(), orgId, id, await body(req, B));
});
