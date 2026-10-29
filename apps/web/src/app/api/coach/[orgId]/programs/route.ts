import { z } from "zod";
import { DetailZ } from "@/server/training/detail-schema";
import { body, handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

const Ex = z.object({ exerciseId: z.string().max(64), name: z.string().max(120), sets: z.number().int(), reps: z.string().max(40), rir: z.number().int().nullable(), restSec: z.number().int(), note: z.string().max(300).nullable().optional(), detail: DetailZ });
const Doc = z.object({ name: z.string().max(120), weeks: z.number().int(), note: z.string().max(1000), days: z.array(z.object({ name: z.string().max(60), exercises: z.array(Ex).max(30) })).max(14) });

export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_r, { params }) => ({ programs: await tr.listTemplates(await sessionUserId(), (await params).orgId) }));
export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  const raw = await req.json().catch(() => ({}));
  const doc = raw && raw.doc ? Doc.parse(raw.doc) : undefined;
  return { id: await tr.createTemplate(await sessionUserId(), (await params).orgId, doc) };
});
