import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { listWorkspaces, memberOnboardingState } from "@/server/access/services";
import { ConoceHub } from "@/components/conoce/ConoceHub";
import { conoceMetadata, conoceViewport } from "./conoce/meta";
import "@/styles/site.css";
import "@/styles/conoce.css";
import "@/styles/conoce3.css";
import "@/styles/conoce4.css";

// 14/11/2026 (pedido del titular): repiclub.com muestra la misma presentación comercial que /conoce (que sigue existiendo).
export const viewport = conoceViewport;

export const dynamic = "force-dynamic";

export const metadata = conoceMetadata({
  path: "/",
  title: "REPI · Entrenamiento inteligente para gimnasios, entrenadores y alumnos",
  description: "Entrenamiento inteligente en la app de cada socio o planificación supervisada con pantalla en el gimnasio. Probá la demo sin cuenta o pedí una propuesta.",
});

type SP = Promise<Record<string, string | string[] | undefined>>;

// Punto de inicio estable (también del ícono en inicio, que abre /?source=pwa). Sin sesión: la presentación comercial de /conoce,
// salvo desde el ícono instalado, que va directo a Acceso. Con sesión y un único espacio listo: directo a ese espacio;
// si no, Acceso decide el paso pendiente o el selector.
export default async function Home({ searchParams }: { searchParams: SP }) {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) {
    if ((await searchParams).source === "pwa") redirect("/acceso");
    return <ConoceHub profile={null} />;
  }
  const [ws, member] = await Promise.all([listWorkspaces(s.user.id), memberOnboardingState(s.user.id)]);
  if (!member.step && ws.length === 1 && !ws[0].needs2fa) redirect(ws[0].href);
  redirect("/acceso?step=workspace");
}
