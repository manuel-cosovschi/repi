import { handle, sessionUserId } from "@/server/access/http";
import { previousVersion } from "@/server/training/services";

// Versión anterior del programa vigente (F-CL-14).
export const GET = handle(async () => previousVersion(await sessionUserId()));
