import { handle, sessionUserId } from "@/server/access/http";
import { clientCharges } from "@/server/coachpay/services";

// Pestaña «Pagos» de la ficha del cliente.
export const GET = handle<{ params: Promise<{ orgId: string; relId: string }> }>(async (_r, { params }) => {
  const { orgId, relId } = await params;
  return clientCharges(await sessionUserId(), orgId, relId);
});
