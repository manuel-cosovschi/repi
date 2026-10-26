import { handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

export const GET = handle<{ params: Promise<{ id: string }> }>(async (_r, { params }) => tr.getSession(await sessionUserId(), (await params).id));
