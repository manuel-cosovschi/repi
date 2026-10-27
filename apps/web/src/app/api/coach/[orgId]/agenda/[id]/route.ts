import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { updateAppointment } from "@/server/training/agenda";

// Cancelar, reprogramar o marcar asistencia (F-CO-10, D98).
export const POST = handle<{ params: Promise<{ orgId: string; id: string }> }>(async (req, { params }) => {
  const { orgId, id } = await params;
  return updateAppointment(await sessionUserId(), orgId, id, await body(req, z.object({
    action: z.enum(["cancel", "done", "no_show", "reschedule"]), reason: z.string().max(200).nullable().optional(),
    date: z.string().max(10).optional(), time: z.string().max(5).optional(), durationMin: z.number().int().optional(),
  })));
});
