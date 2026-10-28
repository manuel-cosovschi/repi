// Reemplazos aprobados de la organización (Adaptive Coach 1b). Coach dueño o staff del gimnasio con «program.edit».
import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import * as subs from "@/server/training/substitutions";

type Ctx = { params: Promise<{ orgId: string }> };
const id = z.string().min(1).max(64);

export const GET = handle<Ctx>(async (_r, { params }) => subs.listSubstitutions(await sessionUserId(), (await params).orgId));

const B = z.object({ exerciseId: id, substituteExerciseId: id, note: z.string().max(300).nullable().optional() });
export const POST = handle<Ctx>(async (req, { params }) => {
  const me = await sessionUserId();
  await limit(`subs:${me}`, 60);
  return subs.addSubstitution(me, (await params).orgId, await body(req, B));
});

export const DELETE = handle<Ctx>(async (req, { params }) =>
  subs.removeSubstitution(await sessionUserId(), (await params).orgId, new URL(req.url).searchParams.get("id")?.slice(0, 64) ?? ""));
