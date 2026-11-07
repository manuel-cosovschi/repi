"use client";
// Inicia una demo guiada real (POST /api/demo, D85) desde /conoce. Mismo mecanismo seguro que /demo: entorno ficticio propio,
// sesión de demo en este navegador, borrado a las 6 h. Sin credenciales ni datos reales.
import { useState } from "react";
import { api } from "@/lib/api";
import { track } from "@/lib/site-track";
import { CONTACT } from "@/lib/contact";
import type { Profile } from "@/lib/site-events";
import type { DemoRole } from "@/content/conoce";

export function DemoButton({ role, profile, label = "Probar esta demo", className = "cn-btn pri", target }: { role: DemoRole; profile?: Profile | null; label?: string; className?: string; target?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    track("demo_click", { profile, target: target ?? role });
    try {
      try { sessionStorage.removeItem(`repi:tour:${role}`); } catch { /* */ }
      const r = await api<{ href: string }>("/api/demo", { body: { role } });
      track("demo_start", { profile, target: role });
      window.location.href = r.href;
    } catch (e) {
      track("demo_error", { profile, target: role });
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="cn-demo-act">
      <button type="button" className={className} onClick={go} aria-busy={busy || undefined} disabled={busy}>{busy ? "Armando tu demo…" : label}</button>
      <div aria-live="polite">{err && <p className="cn-err" role="alert">{err} <a href={`${CONTACT.whatsapp}?text=${encodeURIComponent("Hola, quise probar la demo de REPI y no pude. ¿Me muestran cómo funciona?")}`} target="_blank" rel="noreferrer">Escribinos por WhatsApp</a>.</p>}</div>
    </div>
  );
}
