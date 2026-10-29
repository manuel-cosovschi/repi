import { handle, sessionUserId } from "@/server/access/http";
import * as tr from "@/server/training/services";

// D145: aplicar a este entrenamiento abierto la rutina que acaba de guardar el coach.
export const POST = handle<{ params: Promise<{ id: string }> }>(async (_r, { params }) => tr.upgradeSession(await sessionUserId(), (await params).id));
