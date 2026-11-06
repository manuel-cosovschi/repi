// Novedades de REPI para coach y gimnasio (D202). La audiencia sale de los roles reales en la base; el alumno las ve en su
// centro de notificaciones (/api/me/notifications).
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { markAnnouncementsRead, myAnnouncements } from "@/server/announcements/services";

const area = z.enum(["coach", "gym"]);
export const GET = handle(async (req) => {
  const u = new URL(req.url);
  return myAnnouncements(await sessionUserId(), area.parse(u.searchParams.get("area")), { orgId: u.searchParams.get("org")?.slice(0, 64) ?? null });
});
export const POST = handle(async (req) => {
  const me = await sessionUserId();
  await limit(`announcements:${me}`, 30);
  const p = await body(req, z.object({ area, org: z.string().max(64).nullable().optional(), ids: z.array(z.string().max(64)).max(100).nullable().optional() }));
  return markAnnouncementsRead(me, p.area, { orgId: p.org ?? null, ids: p.ids ?? null });
});
