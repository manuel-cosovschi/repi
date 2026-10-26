import { handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

export const GET = handle(async () => ({ conflicts: await tr.listConflicts(await sessionUserId()) }));
