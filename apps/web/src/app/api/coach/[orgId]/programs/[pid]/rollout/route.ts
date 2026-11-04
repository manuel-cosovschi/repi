// D194: actualizar los programas de los alumnos desde una plantilla. GET: alumnos, versiones y comparación (no cambia nada).
// POST: aplica lo elegido (idempotente por `requestId`; 409 si la plantilla o un programa cambió desde la vista previa).
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { applyTemplateRollout, templateRolloutPreview } from "@/server/training/template-rollout";

const Key = z.string().regex(/^[A-Za-z0-9:#_-]{3,120}$/);
const RolloutZ = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  template: z.string().min(8).max(64),
  targets: z.array(z.object({ programId: z.string().min(1).max(64), fingerprint: z.string().min(8).max(64), apply: z.array(Key).max(400) }).strict()).min(1).max(100),
}).strict();

type Ctx = { params: Promise<{ orgId: string; pid: string }> };
export const GET = handle<Ctx>(async (_r, { params }) => { const { orgId, pid } = await params; return templateRolloutPreview(await sessionUserId(), orgId, pid); });
export const POST = handle<Ctx>(async (req, { params }) => {
  const { orgId, pid } = await params;
  const me = await sessionUserId();
  await limit(`template-rollout:${me}`, 30);
  return applyTemplateRollout(me, orgId, pid, await body(req, RolloutZ));
});
