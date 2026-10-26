import { handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

export const GET = handle(async () => ({ sessions: await tr.myHistory(await sessionUserId()) }));
