import { handle, sessionUserId } from "@/server/access/http";
import { memberInsights } from "@/server/brain/coach";

// D209: señales de REPI sobre un socio para el equipo de sala y coordinación de su sede (program.edit + consentimiento
// attendance_training). Dueño y gerencia: 403. Nunca muestra memoria ni conversación del socio con REPI.
export const GET = handle<{ params: Promise<{ orgId: string; memberId: string }> }>(async (_r, { params }) => {
  const { orgId, memberId } = await params;
  return memberInsights(await sessionUserId(), orgId, memberId);
});
