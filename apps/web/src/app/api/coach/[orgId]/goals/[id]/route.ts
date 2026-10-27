import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { updateGoal } from "@/server/training/goals";

// Registrar valor, plazo/nota o cerrar un objetivo (F-CO-03, D97).
export const POST = handle<{ params: Promise<{ orgId: string; id: string }> }>(async (req, { params }) => {
  const { orgId, id } = await params;
  return updateGoal(await sessionUserId(), orgId, id, await body(req, z.object({
    status: z.enum(["active", "achieved", "cancelled"]).optional(), manualValue: z.number().nullable().optional(),
    dueOn: z.string().max(10).nullable().optional(), note: z.string().max(300).nullable().optional(),
  })));
});
