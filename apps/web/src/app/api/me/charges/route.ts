import { handle, sessionUserId } from "@/server/access/http";
import { myCharges } from "@/server/coachpay/services";

// Lo que el alumno tiene registrado con su coach (F-HX-06). No incluye la suscripción del coach con REPI.
export const GET = handle(async () => myCharges(await sessionUserId()));
