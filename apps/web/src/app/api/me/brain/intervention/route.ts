// Avisos de REPI (D209): visto, aceptar, descartar o «no mostrar algo parecido». Queda como decisión en la memoria.
import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { markIntervention } from "@/server/brain/store";
import { recordDecision } from "@/server/brain/events";

const B = z.object({ id: z.string().max(64), op: z.enum(["shown", "accepted", "dismissed", "never"]) }).strict();
export const POST = handle(async (req) => {
  const userId = await sessionUserId();
  const b = await body(req, B);
  const r = await markIntervention(userId, b.id, b.op);
  if (r.changed && b.op !== "shown") await recordDecision(userId, { decision: b.op === "accepted" ? "accepted" : b.op === "never" ? "never" : "dismissed", what: r.intervention.kind, label: r.intervention.title || null, ref: { interventionId: b.id } });
  return r;
});
