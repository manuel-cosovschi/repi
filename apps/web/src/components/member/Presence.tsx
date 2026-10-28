"use client";
// Validación de ingreso al gimnasio (D127): el socio escanea el QR dinámico de la sede con la cámara (permiso explícito) o pide
// que lo valide el equipo. El servidor decide; acá nunca se da por válido nada que el servidor no confirmó.
import { useCallback, useEffect, useRef, useState } from "react";
import { CHECKIN_METHOD_LABEL, type CheckinMethod } from "@repi/domain";
import { api, ApiError } from "@/lib/api";
import { Sheet } from "./Sheet";

export type GymPresence = {
  orgId: string; gym: string; location: string; membership: string; membershipLabel: string; accessUntil: string | null;
  enabled: boolean; mode: string; startNeedsCheckin: boolean; geoMode: "off" | "optional" | "required";
  pass: { id: string; location: string; method: CheckinMethod; issuedAt: string; expiresAt: string } | null;
};
type CheckinResult = { ok: true; duplicate: boolean; gym: string; pass: NonNullable<GymPresence["pass"]> } | { ok: false; reason: string; message: string };

const hm = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Acepta el token o el enlace de ingreso de REPI. Nunca navega a la URL escaneada (sin redirecciones). */
export function extractToken(text: string): string | null {
  const t = (text ?? "").trim();
  if (/^RA1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t)) return t;
  try {
    const u = new URL(t);
    const okHost = u.hostname === "repiclub.com" || u.hostname === "www.repiclub.com" || (typeof window !== "undefined" && u.origin === window.location.origin);
    if (!okHost || u.pathname !== "/ingreso") return null;
    const c = new URLSearchParams(u.hash.slice(1)).get("c");
    return c && /^RA1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(c) ? c : null;
  } catch { return null; }
}

/** Cámara trasera + lector de QR. BarcodeDetector cuando existe (Chrome Android); si no, jsQR sobre el cuadro (Safari iOS). */
export function QrScanner({ onCode, onError }: { onCode: (text: string) => void; onError: (msg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  useEffect(() => {
    let stream: MediaStream | null = null, timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { onError("Este navegador no permite usar la cámara. Abrí REPI desde Safari o Chrome (con https)."); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }); }
      catch (e) { onError((e as Error).name === "NotAllowedError" ? "No diste permiso para la cámara. Habilitalo en los ajustes del navegador o pedí la validación en recepción." : "No pudimos abrir la cámara."); return; }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const v = video.current!;
      v.srcObject = stream;
      v.setAttribute("playsinline", "true"); // iOS: sin pantalla completa
      await v.play().catch(() => {});
      type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      let detector: Detector | null = null;
      try { detector = BD ? new BD({ formats: ["qr_code"] }) : null; } catch { detector = null; }
      const jsQR = detector ? null : (await import("jsqr")).default;
      const tick = async () => {
        if (stopped || done.current) return;
        if (v.readyState >= 2 && v.videoWidth) {
          try {
            let text: string | null = null;
            if (detector) text = (await detector.detect(v))[0]?.rawValue ?? null;
            else if (ctx && jsQR) {
              const w = Math.min(640, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w; canvas.height = h;
              ctx.drawImage(v, 0, 0, w, h);
              text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
            if (text) { done.current = true; onCode(text); return; }
          } catch { /* cuadro ilegible: sigue */ }
        }
        timer = setTimeout(tick, 220);
      };
      void tick();
    })();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pr-scan">
      <video ref={video} muted playsInline aria-label="Vista de la cámara para escanear el QR" />
      <span className="pr-frame" aria-hidden="true" />
    </div>
  );
}

/** Lectura única de la ubicación, sólo si el gimnasio la usa y en el momento de validar. Nada en segundo plano. */
function readGeo(): Promise<{ lat: number; lng: number; accuracyM: number; ageSec: number } | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((res) => navigator.geolocation.getCurrentPosition(
    (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, ageSec: Math.round((Date.now() - p.timestamp) / 1000) }),
    () => res(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }));
}

export async function sendCheckin(token: string, geoMode: GymPresence["geoMode"] | undefined): Promise<CheckinResult> {
  if (!navigator.onLine) return { ok: false, reason: "offline", message: "Sin conexión: el ingreso se valida con internet. Probá de nuevo en un momento." };
  const geo = geoMode && geoMode !== "off" ? await readGeo() : null;
  try { return await api<CheckinResult>("/api/me/gym/checkin", { body: { token, geo } }); }
  catch (e) { return { ok: false, reason: e instanceof ApiError ? e.code : "error", message: (e as Error).message }; }
}

/** Hoja «Validá tu ingreso». `demo`: atajos que piden al servidor un QR real de la demo (sólo cuentas de la demo). */
export function PresenceSheet({ orgId, onClose, onValidated, flash, demo }: {
  orgId: string | null | undefined; onClose: () => void; onValidated: (p: GymPresence["pass"]) => void; flash: (t: string) => void; demo?: boolean;
}) {
  const [g, setG] = useState<GymPresence | null>(null);
  const [view, setView] = useState<"intro" | "scan" | "desk">("intro");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ gyms: GymPresence[] }>("/api/me/gym/presence").then((r) => setG(r.gyms.find((x) => x.orgId === orgId) ?? r.gyms[0] ?? null)).catch((e) => setMsg((e as Error).message));
  }, [orgId]);
  const submit = useCallback(async (token: string) => {
    setBusy(true); setMsg(null);
    const r = await sendCheckin(token, g?.geoMode);
    setBusy(false);
    if (r.ok) { flash(`Ingreso validado en ${r.pass.location} hasta las ${hm(r.pass.expiresAt)}.`); onValidated(r.pass); return; }
    setView("intro"); setMsg(r.message);
  }, [g?.geoMode, flash, onValidated]);
  const onCode = (text: string) => {
    const tk = extractToken(text);
    if (!tk) { setView("intro"); setMsg("Ese QR no es el de ingreso de REPI. Escaneá el que muestra la pantalla del gimnasio."); return; }
    void submit(tk);
  };
  const demoQr = async (which: "own" | "other") => {
    try { const q = await api<{ token: string }>("/api/me/gym/demo-qr", { body: { gym: which } }); await submit(q.token); } catch (e) { setMsg((e as Error).message); }
  };
  const gym = g?.gym ?? "tu gimnasio";
  if (view === "scan") return (
    <Sheet title="Escanear QR del gimnasio" sub="Apuntá al QR que muestra la pantalla de recepción. Se renueva solo cada pocos segundos." closeLabel="Volver" onClose={() => setView("intro")}>
      <QrScanner onCode={onCode} onError={(m) => { setView("intro"); setMsg(m); }} />
      {busy && <p className="sheet-sub" role="status">Validando con el servidor…</p>}
    </Sheet>
  );
  if (view === "desk") return (
    <Sheet title="Validar en recepción" sub={`En recepción de ${gym} pueden validar tu ingreso con tu carnet de la app, o un profesor de sala desde REPI. Cuando lo hagan, volvé acá: el entrenamiento se habilita solo.`} closeLabel="Volver" onClose={() => setView("intro")}
      action={{ label: "Ya me validaron", ready: true, onSubmit: async () => {
        const r = await api<{ gyms: GymPresence[] }>("/api/me/gym/presence").catch(() => null);
        const x = r?.gyms.find((y) => y.orgId === (orgId ?? g?.orgId));
        if (x?.pass) { flash(`Ingreso validado hasta las ${hm(x.pass.expiresAt)}.`); onValidated(x.pass); } else setMsg("Todavía no figura tu ingreso. Pedile al equipo que lo valide.");
      } }} />
  );
  return (
    <Sheet title="Validá tu ingreso" sub={`Para iniciar un entrenamiento presencial de ${gym}, validá tu ingreso. Tu rutina, tu historial y tu progreso siguen disponibles desde cualquier lugar.`} closeLabel="Volver a mi rutina" onClose={onClose}>
      {g && g.membership !== "active" && <p className="sheet-warn" role="alert">Tu membresía en {g.gym} está {g.membershipLabel.toLowerCase()}. Consultá en recepción.</p>}
      {msg && <p className="sheet-warn" role="alert">{msg}</p>}
      {g?.geoMode && g.geoMode !== "off" && <p className="sheet-sub">Este gimnasio también usa la ubicación del teléfono, una sola vez, al validar. No se guarda dónde estás: sólo si estabas cerca de la sede.</p>}
      <button type="button" className="cta" onClick={() => { setMsg(null); setView("scan"); }} aria-busy={busy || undefined}>Escanear QR del gimnasio</button>
      <button type="button" className="ghost" onClick={() => setView("desk")}>Solicitar ayuda en recepción</button>
      {demo && (
        <div className="pr-demo">
          <small>Demo · sin otra pantalla a mano: el servidor genera el QR real de la sede, igual que la tablet de recepción.</small>
          <span><button type="button" className="ghost sm" disabled={busy} onClick={() => demoQr("own")}>Usar el QR de Gym Norte</button>
            <button type="button" className="ghost sm" disabled={busy} onClick={() => demoQr("other")}>Probar el QR de otro gimnasio</button></span>
        </div>
      )}
    </Sheet>
  );
}

/** Estado en Inicio y Entrenar: habilitado (hasta qué hora), requerido o membresía inactiva. */
export function PresenceChip({ p, onValidate }: { p: GymPresence; onValidate: () => void }) {
  if (!p.enabled || !p.startNeedsCheckin) return null;
  if (p.membership !== "active") return <div className="pr-chip bad"><b>Membresía {p.membershipLabel.toLowerCase()}</b><small>{p.gym}: consultá en recepción.</small></div>;
  if (p.pass) return <div className="pr-chip ok"><b>Acceso presencial habilitado</b><small>{p.pass.location} · hasta las {hm(p.pass.expiresAt)} · {CHECKIN_METHOD_LABEL[p.pass.method]}</small></div>;
  return (
    <button type="button" className="pr-chip" onClick={onValidate}>
      <b>Check-in requerido para entrenar en {p.gym}</b><small>Tu rutina la ves igual. Para iniciar el entrenamiento presencial, validá tu ingreso.</small><em>Validar</em>
    </button>
  );
}
