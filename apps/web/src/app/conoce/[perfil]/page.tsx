// Enlaces directos por perfil para campañas (D205): /conoce/gimnasios, /entrenadores, /deportistas y /aliados.
import { notFound } from "next/navigation";
import { ConoceHub } from "@/components/conoce/ConoceHub";
import { PROFILE_CONTENT } from "@/content/conoce";
import { PROFILES, isProfile } from "@/lib/site-events";
import { conoceMetadata, conoceViewport } from "../meta";
import "@/styles/site.css";
import "@/styles/conoce.css";

type P = { params: Promise<{ perfil: string }> };
export const dynamicParams = false;
export const viewport = conoceViewport;
export const generateStaticParams = () => PROFILES.map((perfil) => ({ perfil }));

export async function generateMetadata({ params }: P) {
  const { perfil } = await params;
  if (!isProfile(perfil)) return {};
  return conoceMetadata({ path: `/conoce/${perfil}`, ...PROFILE_CONTENT[perfil].meta });
}

export default async function ConoceProfilePage({ params }: P) {
  const { perfil } = await params;
  if (!isProfile(perfil)) notFound();
  return <ConoceHub profile={perfil} />;
}
