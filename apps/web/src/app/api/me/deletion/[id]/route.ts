import { handle, sessionUserId } from "@/server/access/http";
import { cancelDeletion } from "@/server/privacy/services";

// Cancelar un pedido de eliminación todavía pendiente.
export const DELETE = handle<{ params: Promise<{ id: string }> }>(async (_req, { params }) => cancelDeletion(await sessionUserId(), (await params).id));
