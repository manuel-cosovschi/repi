"use client";
// QR de ingreso que se renueva solo (D127). Lo usan la pantalla autorizada de recepción y el QR a pantalla completa del equipo.
// El QR sólo lleva un token firmado de la sede con vencimiento corto: no identifica a nadie y nunca se guarda.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderSVG } from "uqr";

export type LiveQrData = { token: string; url: string; expiresAt: string; ttlSec: number; location: string; gym?: string };

/** Pide un QR nuevo unos segundos antes de que venza el actual. Ante un error lo muestra y reintenta. */
export function useLiveQr(fetchQr: () => Promise<LiveQrData>, enabled = true) {
  const [qr, setQr] = useState<LiveQrData | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetchRef = useRef(fetchQr);
  fetchRef.current = fetchQr;
  const load = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const q = await fetchRef.current();
      setQr(q); setErr(null);
      const left = new Date(q.expiresAt).getTime() - Date.now();
      timer.current = setTimeout(load, Math.max(3_000, left - 4_000));
    } catch (e) {
      const x = e as Error & { code?: string };
      setErr({ code: x.code ?? "error", message: x.message });
      timer.current = setTimeout(load, 15_000);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // Al volver a la pestaña o recuperar conexión, QR nuevo enseguida (los timers se frenan en segundo plano).
    const wake = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => { clearTimeout(timer.current); clearInterval(tick); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [enabled, load]);
  const left = qr ? Math.max(0, Math.ceil((new Date(qr.expiresAt).getTime() - now) / 1000)) : 0;
  return { qr, err, left, reload: load };
}

export function QrCode({ url, label, size = 320 }: { url: string; label: string; size?: number | string }) {
  const svg = useMemo(() => renderSVG(url, { border: 2, ecc: "L" }), [url]);
  return <div className="gq-code" role="img" aria-label={label} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** QR grande con cuenta regresiva. `onClose` lo muestra como capa a pantalla completa (equipo); sin él, ocupa la página (tablet). */
export function LiveQrView({ qr, left, err, title, onClose }: { qr: LiveQrData | null; left: number; err: { message: string } | null; title: string; onClose?: () => void }) {
  const frac = qr ? Math.min(1, left / qr.ttlSec) : 0;
  return (
    <div className={onClose ? "gq gq-layer" : "gq"} role={onClose ? "dialog" : undefined} aria-modal={onClose ? true : undefined} aria-label={onClose ? title : undefined}>
      <div className="gq-top">
        <span className="gq-brand">REPI</span>
        <span className="gq-where">{qr ? [qr.gym, qr.location].filter(Boolean).join(" · ") : title}</span>
        {onClose && <button type="button" className="gq-close" onClick={onClose}>Cerrar</button>}
      </div>
      <h1 className="gq-title">Validá tu ingreso</h1>
      {qr && !err ? (
        <>
          <QrCode url={qr.url} label={`Código QR de ingreso de ${qr.location}. Se renueva cada ${qr.ttlSec} segundos.`} size="min(68vh, 82vw)" />
          <div className="gq-bar" aria-hidden="true"><i style={{ transform: `scaleX(${frac})` }} /></div>
          <p className="gq-help">Abrí REPI › Entrenar › <b>Validar ingreso</b> y escaneá. También funciona con la cámara del teléfono.</p>
          <p className="gq-small" aria-live="off">Se renueva solo cada {qr.ttlSec} s · quedan {left} s</p>
        </>
      ) : (
        <p className="gq-err" role="alert">{err?.message ?? "Cargando el QR…"}</p>
      )}
    </div>
  );
}
