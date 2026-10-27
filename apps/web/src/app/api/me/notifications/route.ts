import { handle, sessionUserId } from "@/server/access/http";
import { myNotifications } from "@/server/notifications/feed";

// Centro de notificaciones del alumno (F-NT-01, D94): lista con destino dentro de la app y marca de leído.
export const GET = handle(async () => myNotifications(await sessionUserId()));
