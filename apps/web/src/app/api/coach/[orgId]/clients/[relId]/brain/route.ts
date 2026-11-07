import { handle, sessionUserId } from "@/server/access/http";
import { coachInsights } from "@/server/brain/coach";

// D210: señales de REPI sobre un alumno para su entrenador (dificultad creciente, rechazos, propuestas y pedidos pendientes).
// Requiere relación vigente con el permiso de entrenamientos del alumno; nunca muestra su memoria ni su conversación con REPI.
export const GET = handle<{ params: Promise<{ orgId: string; relId: string }> }>(async (_r, { params }) => {
  const { orgId, relId } = await params;
  return coachInsights(await sessionUserId(), orgId, relId);
});
