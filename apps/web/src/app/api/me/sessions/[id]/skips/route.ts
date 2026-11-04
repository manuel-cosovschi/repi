// D184: omitir una etapa conectada o deshacer la omisión (idempotente; gana el cambio más reciente; un resultado manda).
import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const B = z.object({ programExerciseId: z.string().max(64), setIndex: z.number().int().min(0).max(39), skipped: z.boolean(), at: z.string().max(40).optional() });
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => tr.setStageSkip(await sessionUserId(), (await params).id, await body(req, B)));
