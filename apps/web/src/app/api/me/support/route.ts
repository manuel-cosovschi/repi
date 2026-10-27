import { handle, sessionUserId } from "@/server/access/http";
import { myTickets } from "@/server/support/services";

// Consultas de soporte propias (N-O11, D93), con la respuesta de REPI. Nunca las enviadas sin sesión.
export const GET = handle(async () => myTickets(await sessionUserId()));
