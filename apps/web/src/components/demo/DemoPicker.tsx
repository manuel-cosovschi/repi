"use client";
// Elección de perfil para la demo guiada (D85). Cada opción arma un entorno propio y entra directo, con la guía abierta.
import { useState } from "react";
import { Barbell, Buildings, DeviceMobile, UsersThree, CaretRight, type Icon } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Ic } from "@/components/ui/Ic";
import { Wordmark } from "@/components/access/Wordmark";

const ROLES: [string, string, string, Icon][] = [
  ["owner", "Dueño o gerente de gimnasio", "Altas por QR, equipo, servicio, comunidad y condiciones.", Buildings],
  ["floor", "Entrenador de sala", "Avisos en vivo de la sala, cola de pedidos y fichas de socios.", UsersThree],
  ["member", "Alumno o socio", "Entrenar desde el teléfono, progreso, chat y el gimnasio en la app.", DeviceMobile],
  ["coach", "Personal trainer", "Alumnos, programas, rendimiento, mensajes y cobros.", Barbell],
];

export function DemoPicker() {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = async (role: string) => {
    setBusy(role); setErr(null);
    try {
      try { sessionStorage.removeItem(`repi:tour:${role}`); } catch { /* */ }
      const r = await api<{ href: string }>("/api/demo", { body: { role } });
      window.location.href = r.href;
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  };
  return (
    <div className="ac-form">
      <div className="ac-top"><Wordmark width={62} /><span className="ac-step">Demo guiada</span></div>
      <div className="ac-head">
        <h1 tabIndex={-1}>Probá REPI en dos minutos</h1>
        <p className="ac-sub">Elegí cómo querés verlo. Entrás a un gimnasio y un coach de ejemplo, con una guía que te muestra cada paso. Sin cuenta.</p>
      </div>
      {ROLES.map(([k, t, d, icon]) => (
        <button key={k} type="button" className="ac-opt" onClick={() => go(k)} disabled={!!busy} aria-busy={busy === k || undefined}>
          <span className="ac-opt-ic" aria-hidden="true"><Ic i={icon} size={22} color="#00D1FF" /></span>
          <span><strong>{t}</strong><small>{busy === k ? "Armando tu demo…" : d}</small></span>
          <Ic i={CaretRight} size={16} style={{ color: "var(--t-muted)" }} />
        </button>
      ))}
      <div aria-live="assertive">{err && <p role="alert" className="ac-error">{err}</p>}</div>
      <p className="ac-note">Datos ficticios, sólo para vos, que se borran a las 6 horas. Podés tocar todo: nada afecta a gimnasios ni personas reales.</p>
      <div className="ac-link"><span>¿Ya usás REPI?</span><button type="button" onClick={() => { window.location.href = "/acceso"; }}>Ingresar</button></div>
    </div>
  );
}
