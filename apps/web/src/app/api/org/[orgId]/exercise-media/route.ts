// D164: videos de ejercicios del gimnasio o del coach. GET lista la biblioteca con su estado; POST pone un enlace, asocia un
// video ya subido (subida directa, /api/uploads) o lo quita.
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as em from "@/server/training/exercise-media";

type Ctx = { params: Promise<{ orgId: string }> };
export const GET = handle<Ctx>(async (req, { params }) => {
  const u = new URL(req.url);
  return em.listExerciseMedia(await sessionUserId(), (await params).orgId, { q: u.searchParams.get("q") ?? "", only: u.searchParams.get("only") === "1" });
});

const B = z.object({ exerciseId: z.string().max(64), link: z.string().max(600).optional(), mediaId: z.string().max(64).optional(), remove: z.boolean().optional() });
export const POST = handle<Ctx>(async (req, { params }) => {
  const me = await sessionUserId();
  await limit(`exercise-media:${me}`, 120, 3_600_000);
  const orgId = (await params).orgId;
  const b = await body(req, B);
  if (b.remove) return em.removeExerciseMedia(me, orgId, b.exerciseId);
  if (b.mediaId) return em.setExerciseUpload(me, orgId, b.exerciseId, b.mediaId);
  return em.setExerciseLink(me, orgId, b.exerciseId, b.link ?? "");
});
