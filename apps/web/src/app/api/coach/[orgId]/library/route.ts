import { handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

export const GET = handle<{ params: Promise<{ orgId: string }> }>(async (_r, { params }) => ({ exercises: await tr.listLibrary(await sessionUserId(), (await params).orgId) }));
