"use client";
// Registra la visita una vez por carga de página (con su origen: QR, UTM, otro sitio o directo).
import { useEffect } from "react";
import type { Profile } from "@/lib/site-events";
import { track, visitContext } from "@/lib/site-track";

export function Tracker({ profile }: { profile: Profile | null }) {
  useEffect(() => { visitContext(); track("landing_view", { profile }); }, [profile]);
  return null;
}
