import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as cp from "@/server/coachpay/services";

type Ctx = { params: Promise<{ orgId: string; id: string }> };
const B = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pay"), paidOn: z.string().max(10), method: z.string().max(20), note: z.string().max(300).nullable().optional() }),
  z.object({ action: z.literal("void"), reason: z.string().max(200) }),
]);
// Registrar pago o anular un cargo (queda en el historial con su motivo).
export const POST = handle<Ctx>(async (req, { params }) => {
  const me = await sessionUserId();
  const { orgId, id } = await params;
  const b = await body(req, B);
  return b.action === "pay" ? cp.registerPayment(me, orgId, id, b) : cp.voidCharge(me, orgId, id, b.reason);
});
