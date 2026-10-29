import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as svc from "@/server/access/services";

const S = z.object({ email: z.string().max(200), role: z.string().max(40), locationId: z.string().max(64).nullable().optional() });

export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  // SEC-3 (QA 29/10): cada invitación manda un correo real; tope por persona para que no sirva para mandar spam.
  const me = await sessionUserId();
  await limit(`invite:${me}`, 30, 3_600_000);
  const inv = await svc.inviteGymStaff(me, (await params).orgId, await body(req, S));
  return { id: inv.id, code: inv.code, email: inv.email, role: inv.role, status: inv.status, delivery: inv.delivery };
});

// Pendientes que la persona puede reenviar o revocar (F-08); el alcance por sede lo resuelve el servicio.
export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_req, { params }) => ({
  invitations: await svc.pendingStaffInvitations(await sessionUserId(), (await params).orgId),
}));
