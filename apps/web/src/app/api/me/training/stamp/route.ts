// D143: marca del programa vigente para que la app del alumno vea los cambios del coach en segundos.
import { handle, sessionUserId } from "@/server/access/http";
import { trainingStamp } from "@/server/training/services";

export const GET = handle(async () => trainingStamp(await sessionUserId()));
