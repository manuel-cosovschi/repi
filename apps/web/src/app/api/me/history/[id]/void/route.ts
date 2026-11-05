import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as h from "@/server/training/history";

const B = z.object({ requestId: z.string().max(64), voided: z.boolean(), reason: z.string().max(400).nullable().optional(), baseRevision: z.number().int().min(0).optional() }).strict();
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => h.sessionVoided(await sessionUserId(), (await params).id, await body(req, B)));
