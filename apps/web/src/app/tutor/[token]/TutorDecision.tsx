"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Wordmark } from "@/components/access/Wordmark";

export function TutorDecision({ token }: { token: string }) {
  const [req, setReq] = useState<{ minorFirstName: string; guardianName: string } | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ minorFirstName: string; guardianName: string }>(`tutor/${token}`).then(setReq).catch((e) => setErr(e.message)); }, [token]);
  const decide = async (approve: boolean) => {
    try { const r = await api<{ status: "approved" | "rejected" }>(`tutor/${token}`, { body: { approve } }); setDone(r.status); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="ac-form">
      <div className="ac-top"><Wordmark width={62} /><span className="ac-step" /></div>
      <div className="ac-head">
        <h1>{done ? (done === "approved" ? "Autorización registrada" : "Pedido rechazado") : req ? `${req.minorFirstName} te pide autorización` : "Autorización de cuenta"}</h1>
        {req && !done && <p className="ac-sub">Hola {req.guardianName}. {req.minorFirstName} quiere usar REPI para ver su programa y registrar entrenamientos.</p>}
      </div>
      {req && !done && (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <li className="ac-row"><span className="ac-ini">1</span><span><strong>Si aprobás</strong><small>Podrá elegir compartir salud y fotos de progreso con su coach y aparecer con nombre en rankings.</small></span></li>
            <li className="ac-row"><span className="ac-ini">2</span><span><strong>Si rechazás</strong><small>La cuenta sigue con entrenamientos únicamente; sin fotos, videos de récords ni datos de salud.</small></span></li>
          </ul>
          <p className="ac-note">Política de menores en revisión legal (versión minors-v1).</p>
          <button type="button" className="ac-cta" onClick={() => decide(true)}>Autorizar</button>
          <button type="button" className="ac-sec" onClick={() => decide(false)}>Rechazar</button>
        </>
      )}
      {done && <p className="ac-sub">Ya podés cerrar esta ventana.</p>}
      {err && <p role="alert" className="ac-error">{err}</p>}
    </div>
  );
}
