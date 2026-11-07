import { handle, sessionUserId } from "@/server/access/http";
import { coachPendingSignals } from "@/server/brain/coach";

// D210: cantidades para «Pendientes» del panel del coach (propuestas abiertas y pedidos del alumno desde REPI, por alumno con
// relación vigente y permiso de entrenamientos). Sólo números: nunca textos del alumno.
export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_r, { params }) => {
  const { orgId } = await params;
  return coachPendingSignals(await sessionUserId(), orgId);
});
