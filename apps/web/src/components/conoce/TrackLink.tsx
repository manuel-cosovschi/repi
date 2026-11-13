"use client";
// Enlace que registra el evento de contacto antes de salir (sendBeacon no se pierde al abrir WhatsApp o el correo).
import type { Profile, SiteEventName } from "@/lib/site-events";
import { track } from "@/lib/site-track";

export function TrackLink({ event, profile, target, href, className, children, external, ariaLabel }: {
  event: SiteEventName; profile?: Profile | null; target?: string; href: string; className?: string; children: React.ReactNode; external?: boolean; ariaLabel?: string;
}) {
  return (
    <a href={href} className={className} aria-label={ariaLabel} onClick={() => track(event, { profile, target })} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
    </a>
  );
}
