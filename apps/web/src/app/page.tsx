import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { listWorkspaces, memberOnboardingState } from "@/server/access/services";

export const dynamic = "force-dynamic";

// Punto de inicio estable (también del ícono en inicio). Sin sesión: Acceso, que retoma un alta guardada.
// Con sesión y un único espacio listo: directo a ese espacio; si no, Acceso decide el paso pendiente o el selector.
export default async function Home() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) redirect("/acceso");
  const [ws, member] = await Promise.all([listWorkspaces(s.user.id), memberOnboardingState(s.user.id)]);
  if (!member.step && ws.length === 1 && !ws[0].needs2fa) redirect(ws[0].href);
  redirect("/acceso?step=workspace");
}
