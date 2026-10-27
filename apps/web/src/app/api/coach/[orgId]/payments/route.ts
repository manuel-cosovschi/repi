import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as cp from "@/server/coachpay/services";

type Ctx = { params: Promise<{ orgId: string }> };
// Cobros manuales a alumnos (F-BL-01, D80): registro sin pasarela.
export const GET = handle<Ctx>(async (_r, { params }) => cp.coachPayments(await sessionUserId(), (await params).orgId));
export const POST = handle<Ctx>(async (req, { params }) => {
  const me = await sessionUserId();
  await limit(`coach-pay:${me}`, 60);
  return cp.createCharge(me, (await params).orgId, await body(req, z.object({
    coachClientId: z.string().max(64), concept: z.string().max(120), amountMinor: z.number().int(), currency: z.string().max(3), dueOn: z.string().max(10),
  })));
});
