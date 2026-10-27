import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { demoRoleOf } from "@/server/sandbox/services";

// ¿La sesión actual es una demo guiada? Devuelve el perfil para el recorrido (D85). Nunca datos de otra persona.
export async function GET() {
  const s = await auth.api.getSession({ headers: await headers() });
  return Response.json(s ? await demoRoleOf(s.user.email) : null, { headers: { "cache-control": "private, no-store" } });
}
