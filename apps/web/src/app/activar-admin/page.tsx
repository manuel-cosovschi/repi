import type { Metadata } from "next";
import { AccessShell } from "@/components/access/AccessShell";
import { FirstAdmin } from "@/components/access/FirstAdmin";
import "@/styles/access.css";
export const metadata: Metadata = { title: "Activar administración · REPI", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function FirstAdminPage() { return <AccessShell><FirstAdmin /></AccessShell>; }
