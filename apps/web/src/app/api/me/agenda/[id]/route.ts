import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { respondAppointment } from "@/server/training/agenda";

// Confirmar o avisar que no puedo (F-HX-07, D98).
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) =>
  respondAppointment(await sessionUserId(), (await params).id, (await body(req, z.object({ response: z.enum(["confirmed", "declined"]) }))).response));
