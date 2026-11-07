// «Lo que REPI recuerda» (D209): la memoria vigente de la persona, con procedencia y vencimiento. Nadie más la lee.
import { handle, sessionUserId } from "@/server/access/http";
import { listMemory } from "@/server/brain/memory";

export const GET = handle(async () => ({ items: await listMemory(await sessionUserId()) }));
