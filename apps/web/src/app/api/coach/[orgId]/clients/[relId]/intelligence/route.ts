import { handle, sessionUserId } from "@/server/access/http";
import { clientIntelligence } from "@/server/training/intelligence";

// D191: Training Intelligence en la ficha del alumno (Rendimiento). Requiere el permiso de entrenamientos del alumno.
export const GET = handle<{ params: Promise<{ orgId: string; relId: string }> }>(async (_r, { params }) => {
  const { orgId, relId } = await params;
  return clientIntelligence(await sessionUserId(), orgId, relId);
});
