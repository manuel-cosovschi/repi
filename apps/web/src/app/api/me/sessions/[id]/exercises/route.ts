// Saltar o reemplazar un ejercicio en esta sesión (F-HX-21, D106). GET ?pe= lista alternativas compatibles.
import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params }) =>
  tr.sessionAlternatives(await sessionUserId(), (await params).id, new URL(req.url).searchParams.get("pe")?.slice(0, 64) ?? ""));

const B = z.object({
  programExerciseId: z.string().max(64),
  change: z.object({ kind: z.enum(["skip", "substitute"]), reason: z.enum(["busy", "no_equipment", "discomfort", "no_time", "other"]), exerciseId: z.string().max(64).nullable().optional() }).nullable(),
});
export const POST = handle<Ctx>(async (req, { params }) => tr.setExerciseChange(await sessionUserId(), (await params).id, await body(req, B)));
