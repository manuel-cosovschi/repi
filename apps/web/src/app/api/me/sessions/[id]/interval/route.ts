// D184: intervalo EMOM en curso de la sesión (o ninguno). Horas del dispositivo: el servidor las traduce a la suya.
import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const State = z.object({ peId: z.string().max(64), block: z.number().int().min(0).max(40), startedAt: z.string().max(40), emomSec: z.number().int().min(10).max(300), status: z.enum(["running", "interrupted"]) });
const B = z.object({ state: State.nullable(), at: z.string().max(40), sentAt: z.string().max(40) });
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => tr.setSessionInterval(await sessionUserId(), (await params).id, await body(req, B)));
