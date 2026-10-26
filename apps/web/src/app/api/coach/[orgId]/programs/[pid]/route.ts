import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const Ex = z.object({ exerciseId: z.string().max(64), name: z.string().max(120), sets: z.number().int(), reps: z.string().max(40), rir: z.number().int().nullable(), restSec: z.number().int(), note: z.string().max(300).nullable().optional() });
const Doc = z.object({ name: z.string().max(120), weeks: z.number().int(), note: z.string().max(1000), days: z.array(z.object({ name: z.string().max(60), exercises: z.array(Ex).max(30) })).max(14) });

export const GET = handle<{ params: Promise<{ orgId: string; pid: string }> }>(async (_r, { params }) => { const p = await params; return tr.getProgram(await sessionUserId(), p.orgId, p.pid); });
export const PUT = handle<{ params: Promise<{ orgId: string; pid: string }> }>(async (req, { params }) => { const p = await params; return tr.saveProgram(await sessionUserId(), p.orgId, p.pid, await body(req, Doc)); });
export const DELETE = handle<{ params: Promise<{ orgId: string; pid: string }> }>(async (_r, { params }) => { const p = await params; await tr.archiveProgram(await sessionUserId(), p.orgId, p.pid); return { ok: true }; });
