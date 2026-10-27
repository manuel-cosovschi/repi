import { handle, sessionUserId } from "@/server/access/http";
import { myGoals } from "@/server/training/goals";

// Objetivos acordados con mis coaches (F-HX-02, D97). Sólo lectura.
export const GET = handle(async () => myGoals(await sessionUserId()));
