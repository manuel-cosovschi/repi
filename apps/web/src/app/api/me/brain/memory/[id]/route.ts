// Borrar un recuerdo propio (D209). Definitivo; deshace lo que había cambiado en las preferencias (tono, categoría apagada).
import { handle, sessionUserId } from "@/server/access/http";
import { forgetMemory } from "@/server/brain/actions";

type Ctx = { params: Promise<{ id: string }> };
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const userId = await sessionUserId();
  return forgetMemory(userId, (await params).id.slice(0, 64));
});
