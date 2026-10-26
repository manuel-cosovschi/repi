import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

// Relación activa elegida (coach privado o gym) para Entrenar (D11/GAP-24).
export const POST = handle(async (req) => tr.setActiveRelation(await sessionUserId(), (await body(req, z.object({ relationId: z.string().max(64) }))).relationId));
