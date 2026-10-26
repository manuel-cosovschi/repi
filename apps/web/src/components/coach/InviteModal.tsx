"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";

// F-CO-13: invitación real (código + enlace). El alumno acepta y elige qué compartir.
// Anexo 26/10: la invitación es personal: va a un email y sólo la acepta una cuenta verificada con ese email.
export function InviteModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [res, setRes] = useState<{ code: string; expiresAt: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const link = res ? `${window.location.origin}/acceso?code=${res.code}` : "";
  return (
    <Modal label="Invitar cliente" onClose={onClose}>
      <div className="mhead"><h2>Invitar cliente</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <span className="muted" style={{ fontSize: 13 }}>Le llega un enlace personal a su email: sólo lo puede aceptar con una cuenta de ese email. Al aceptar, elige qué datos compartir con vos. Vence en 14 días.</span>
      {!res ? (
        <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { setRes(await api(`/api/access/coach/${orgId}/invitations`, { body: { email } })); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="field">Email del alumno<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="alumno@email.com" /></label>
          {err && <p role="alert" className="err-box">{err}</p>}
          <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className="btn pri" aria-busy={busy || undefined}>{busy ? "Generando…" : "Generar invitación"}</button></div>
        </form>
      ) : (
        <>
          <p role="status" style={{ margin: 0, fontSize: 14 }}>Invitación lista para {email}. Le llega por email; también podés pasarle el enlace o el código (sólo funciona con ese email):</p>
          <div style={{ background: "#F3F5F8", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <strong style={{ font: "600 24px var(--font-mono)", letterSpacing: ".2em" }}>{res.code}</strong>
            <span style={{ fontSize: 13, wordBreak: "break-all", color: "#007EA0" }}>{link}</span>
          </div>
          <div className="mfoot">
            <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(link).catch(() => {}); }}>Copiar enlace</button>
            <button type="button" className="btn pri" onClick={onClose}>Listo</button>
          </div>
        </>
      )}
    </Modal>
  );
}
