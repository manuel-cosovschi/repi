import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { createAppointment, listAgenda } from "@/server/training/agenda";

// Agenda del coach (F-CO-10, D98). ?from=AAAA-MM-DD&days=N (hora argentina).
type Ctx = { params: Promise<{ orgId: string }> };
export const GET = handle<Ctx>(async (req, { params }) => {
  const u = new URL(req.url);
  return listAgenda(await sessionUserId(), (await params).orgId, { from: u.searchParams.get("from") ?? "", days: Number(u.searchParams.get("days") ?? 7) });
});
export const POST = handle<Ctx>(async (req, { params }) => {
  const me = await sessionUserId();
  await limit(`appt:${me}`, 30);
  return createAppointment(me, (await params).orgId, await body(req, z.object({
    coachClientId: z.string().max(64), date: z.string().max(10), time: z.string().max(5), durationMin: z.number().int(),
    modality: z.enum(["presencial", "online"]), place: z.string().max(160).nullable().optional(), note: z.string().max(300).nullable().optional(),
  })));
});
