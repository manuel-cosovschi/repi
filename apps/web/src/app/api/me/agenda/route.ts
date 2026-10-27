import { handle, sessionUserId } from "@/server/access/http";
import { myAppointments } from "@/server/training/agenda";

// Sesiones agendadas con mis coaches (F-HX-07, D98).
export const GET = handle(async () => myAppointments(await sessionUserId()));
