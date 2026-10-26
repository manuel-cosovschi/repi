import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const B = z.object({ id: z.string().max(36), programExerciseId: z.string().max(64), setIndex: z.number().int(), weightKg: z.number().nullable(), reps: z.number().int().nullable(), rir: z.number().int().nullable(), feel: z.string().max(20).nullable().optional(), baseRevision: z.number().int().min(0).optional(), at: z.string().max(40).optional() });
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => tr.logSet(await sessionUserId(), (await params).id, await body(req, B)));
