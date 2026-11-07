// REPI en Inicio (D210): la tarjeta principal, los avisos vigentes y la línea de «hoy». Sólo con sesión; todo es de la persona.
import { handle, sessionUserId } from "@/server/access/http";
import { brainHome } from "@/server/brain/home";

export const GET = handle(async () => brainHome(await sessionUserId()));
