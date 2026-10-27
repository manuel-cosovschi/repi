import { handle, sessionUserId } from "@/server/access/http";
import { clientPerformance } from "@/server/training/services";

// Pestaña «Rendimiento» de la ficha (F-CO-04).
export const GET = handle<{ params: Promise<{ orgId: string; relId: string }> }>(async (_r, { params }) => {
  const { orgId, relId } = await params;
  return clientPerformance(await sessionUserId(), orgId, relId);
});
