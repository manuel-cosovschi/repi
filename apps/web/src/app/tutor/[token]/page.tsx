import { AccessShell } from "@/components/access/AccessShell";
import { TutorDecision } from "./TutorDecision";
import "@/styles/access.css";

// Extensión propuesta (F-ID-13): página del enlace que recibe el adulto responsable.
export default async function TutorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AccessShell><TutorDecision token={token} /></AccessShell>;
}
