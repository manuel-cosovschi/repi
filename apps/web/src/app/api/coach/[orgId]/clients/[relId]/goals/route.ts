import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { createGoal, listGoals } from "@/server/training/goals";

// Objetivos del cliente (F-CO-03, D97).
type Ctx = { params: Promise<{ orgId: string; relId: string }> };
export const GET = handle<Ctx>(async (_r, { params }) => {
  const { orgId, relId } = await params;
  return listGoals(await sessionUserId(), orgId, relId);
});
export const POST = handle<Ctx>(async (req, { params }) => {
  const { orgId, relId } = await params;
  const me = await sessionUserId();
  await limit(`goal:${me}`, 30);
  return createGoal(me, orgId, relId, await body(req, z.object({
    kind: z.enum(["e1rm", "load", "frequency", "manual"]), exerciseId: z.string().max(64).nullable().optional(), target: z.number(),
    targetReps: z.number().int().nullable().optional(), title: z.string().max(120).nullable().optional(), unit: z.string().max(12).nullable().optional(),
    baseline: z.number().nullable().optional(), dueOn: z.string().max(10).nullable().optional(), note: z.string().max(300).nullable().optional(),
  })));
});
