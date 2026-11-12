import { z } from "zod";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { AccessError } from "@/server/access/util";
import * as jobs from "@/server/training/history-import-job";

export const maxDuration = 300;
type Ctx = { params: Promise<{ path?: string[] }> };
const notFound = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const Id = z.string().min(1).max(64);
const Start = z.object({
  fileName: z.string().max(200), parts: z.number().int().min(1).max(jobs.HISTORY_JOB_MAX_PARTS),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  approx: z.object({ sessions: z.number().int().min(1).max(20_000), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).optional(),
});
const Part = z.object({
  index: z.number().int().min(0).max(jobs.HISTORY_JOB_MAX_PARTS - 1),
  text: z.string().min(1).max(jobs.HISTORY_JOB_PART_LENGTH),
  context: z.string().max(jobs.HISTORY_JOB_PART_LENGTH).optional(),
});

export const GET = handle<Ctx>(async (_req, { params }) => {
  const path = (await params).path ?? [];
  const me = await sessionUserId();
  if (path.length !== 2 || path[1] !== "status") throw notFound();
  return jobs.historyImportJobStatus(me, Id.parse(path[0]));
});

export const POST = handle<Ctx>(async (req, { params }) => {
  const path = (await params).path ?? [];
  const me = await sessionUserId();
  if (!path.length) {
    const input = await body(req, Start);
    // Un historial largo cuenta una sola vez, aunque tenga cientos de partes o reintentos de red.
    await limit("history-import", 12, 3_600_000);
    await limit(`history-import:${me}`, 30, 86_400_000);
    return jobs.startHistoryImportJob(me, input);
  }
  if (path.length !== 2) throw notFound();
  const id = Id.parse(path[0]);
  if (path[1] === "part") {
    const input = await body(req, Part);
    await limit(`history-import-parts:${me}:${id}`, 3000, 3_600_000);
    return jobs.readHistoryImportJobPart(me, id, input);
  }
  if (path[1] === "finish") {
    await limit(`history-import-finish:${me}:${id}`, 60, 3_600_000);
    return jobs.finishHistoryImportJob(me, id);
  }
  if (path[1] === "remove") return jobs.removeHistoryImportJob(me, id);
  throw notFound();
});
