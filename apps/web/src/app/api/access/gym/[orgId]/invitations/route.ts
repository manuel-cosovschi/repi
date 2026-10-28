import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({ email: z.string().max(200), role: z.string().max(40), locationId: z.string().max(64).nullable().optional() });

export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  const inv = await svc.inviteGymStaff(await sessionUserId(), (await params).orgId, await body(req, S));
  return { id: inv.id, code: inv.code, email: inv.email, role: inv.role, status: inv.status, delivery: inv.delivery };
});

// Pendientes que la persona puede reenviar o revocar (F-08); el alcance por sede lo resuelve el servicio.
export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_req, { params }) => ({
  invitations: await svc.pendingStaffInvitations(await sessionUserId(), (await params).orgId),
}));
