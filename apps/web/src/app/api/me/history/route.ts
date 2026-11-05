import { handle, sessionUserId } from "@/server/access/http";
import * as h from "@/server/training/history";

// D195: historial con sesiones activas y anuladas (paginado por fecha de fin).
export const GET = handle(async (req) => h.historyList(await sessionUserId(), { before: new URL(req.url).searchParams.get("before") }));
