// Preferencias del asistente REPI (D210, Perfil → Asistente REPI). PUT cambia sólo lo enviado (validado estricto).
import { handle, sessionUserId } from "@/server/access/http";
import { getPrefs, updatePrefs } from "@/server/brain/prefs";

export const GET = handle(async () => ({ prefs: await getPrefs(await sessionUserId()) }));
export const PUT = handle(async (req) => {
  const userId = await sessionUserId();
  const patch = await req.json().catch(() => null);
  return { prefs: await updatePrefs(userId, patch) };
});
