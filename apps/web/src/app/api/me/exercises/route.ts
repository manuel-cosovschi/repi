// D158: biblioteca de ejercicios para armar «Mis rutinas» (catálogo de REPI y los propios del coach o gimnasio).
import { handle, sessionUserId } from "@/server/access/http";
import { myExerciseLibrary } from "@/server/training/own-routines";

export const GET = handle(async () => myExerciseLibrary(await sessionUserId()));
