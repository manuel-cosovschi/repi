"use client";
// Resultado de escanear el QR de ingreso con la cámara del sistema (D127). Lee el token del fragmento, lo borra de la barra de
// direcciones y lo valida en el servidor. Nunca redirige a otro sitio ni muestra éxito sin respuesta del servidor.
import { useEffect, useState } from "react";
import { extractToken, sendCheckin } from "@/components/member/Presence";

type R = Awaited<ReturnType<typeof sendCheckin>>;
const hm = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function CheckinLanding() {
  const [r, setR] = useState<R | null>(null);
  useEffect(() => {
    const token = extractToken(window.location.href);
    window.history.replaceState(null, "", "/ingreso");
    if (!token) { setR({ ok: false, reason: "invalid_token", message: "No encontramos un QR de ingreso válido. Escaneá el que muestra la pantalla del gimnasio." }); return; }
    void sendCheckin(token, "optional").then(setR);
  }, []);
  return (
    <div className="ac-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 tabIndex={-1}>Validar ingreso</h1>
      {!r && <p role="status">Validando con el servidor…</p>}
      {r?.ok && <>
        <p role="status"><b>Ingreso validado en {r.pass.location}</b> · {r.gym}. Podés iniciar tu entrenamiento presencial hasta las {hm(r.pass.expiresAt)}.</p>
        <a className="ac-btn" href="/app?t=train">Ir a entrenar</a>
      </>}
      {r && !r.ok && <>
        <p role="alert">{r.message}</p>
        <a className="ac-btn" href="/app?t=train">Volver a mi rutina</a>
      </>}
      <small style={{ color: "#94A3B8", lineHeight: 1.45 }}>El ingreso validado sirve para las funciones presenciales de ese gimnasio y vence solo. No guarda tu ubicación.</small>
    </div>
  );
}
