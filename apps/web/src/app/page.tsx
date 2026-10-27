import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { listWorkspaces, memberOnboardingState } from "@/server/access/services";
import { PublicSite } from "@/components/site/PublicSite";
import "@/styles/site.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "REPI · Entrenamiento para coaches, gimnasios y alumnos",
  description: "Programas, registro de cada serie y seguimiento para personal trainers, gimnasios y sus alumnos. Una cuenta y una app que se instala desde el navegador.",
};

type SP = Promise<Record<string, string | string[] | undefined>>;

// Punto de inicio estable (también del ícono en inicio, que abre /?source=pwa). Sin sesión: el sitio público (F-PU-01),
// salvo desde el ícono instalado, que va directo a Acceso. Con sesión y un único espacio listo: directo a ese espacio;
// si no, Acceso decide el paso pendiente o el selector.
export default async function Home({ searchParams }: { searchParams: SP }) {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) {
    if ((await searchParams).source === "pwa") redirect("/acceso");
    return <PublicSite />;
  }
  const [ws, member] = await Promise.all([listWorkspaces(s.user.id), memberOnboardingState(s.user.id)]);
  if (!member.step && ws.length === 1 && !ws[0].needs2fa) redirect(ws[0].href);
  redirect("/acceso?step=workspace");
}
