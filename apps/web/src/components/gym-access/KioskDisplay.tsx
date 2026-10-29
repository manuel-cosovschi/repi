"use client";
// Tablet de recepción (D127): guarda el secreto de la pantalla en este equipo, pide el QR vigente con un encabezado y lo muestra
// a pantalla completa. Si REPI o el gimnasio la revocan, se borra el secreto y explica cómo autorizarla de nuevo.
import { useCallback, useEffect, useState } from "react";
import { LiveQrView, useLiveQr, type LiveQrData } from "./LiveQr";

const KEY = "repi-access-display";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v: string | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } };

export function KioskDisplay() {
  const [secret, setSecret] = useState<string | null | undefined>(undefined);
  const [stored, setStored] = useState(true);
  useEffect(() => {
    const k = new URLSearchParams(window.location.hash.slice(1)).get("k");
    if (k) { write(k); window.history.replaceState(null, "", "/ingreso/pantalla"); }
    const s = k ?? read();
    setStored(!k || read() === k);
    setSecret(s);
  }, []);
  // Mantener la pantalla encendida mientras muestra el QR (si el navegador lo permite).
  useEffect(() => {
    if (!secret) return;
    let lock: { release: () => Promise<void> } | null = null;
    const ask = async () => { try { lock = await (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { lock = null; } };
    void ask();
    const again = () => { if (document.visibilityState === "visible") void ask(); };
    document.addEventListener("visibilitychange", again);
    return () => { document.removeEventListener("visibilitychange", again); void lock?.release().catch(() => {}); };
  }, [secret]);
  const fetchQr = useCallback(async (): Promise<LiveQrData> => {
    const r = await fetch("/api/access-display", { headers: { "x-repi-display": secret ?? "" }, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401) { write(null); setSecret(null); }
      throw Object.assign(new Error(j.error ?? "No pudimos cargar el QR. Revisá la conexión."), { code: j.code ?? String(r.status) });
    }
    return j as LiveQrData;
  }, [secret]);
  const { qr, err, left } = useLiveQr(fetchQr, !!secret);
  if (secret === undefined) return <div className="gq"><p className="gq-small">Cargando…</p></div>;
  if (!secret) return (
    <div className="gq">
      <div className="gq-top"><span className="gq-brand">REPI</span></div>
      <h1 className="gq-title">Pantalla de ingreso</h1>
      <p className="gq-help">Esta pantalla no está autorizada. En REPI, el dueño o la gerencia del gimnasio entra a <b>Acceso y presencia › Pantallas</b>, crea una para esta sede y abre el enlace en este equipo.</p>
      <p className="gq-small">El enlace se usa una sola vez por equipo y se puede revocar en cualquier momento.</p>
    </div>
  );
  return (
    <>
      <LiveQrView qr={qr} left={left} err={err} title="Pantalla de ingreso" />
      {!stored && <p className="gq-warn" role="status">Este navegador no guarda datos: si se cierra la pestaña, abrí de nuevo el enlace de la pantalla.</p>}
    </>
  );
}
