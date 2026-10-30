// D166: nivel REPI y trofeos. GET calcula el nivel, otorga los trofeos alcanzados y devuelve los que falta mostrar;
// POST marca vistos los desbloqueos (al cerrar la animación).
import { handle, sessionUserId } from "@/server/access/http";
import { markTrophiesSeen, myLevel } from "@/server/community/levels";

export const GET = handle(async () => myLevel(await sessionUserId()));

export const POST = handle(async () => markTrophiesSeen(await sessionUserId()));
