"use client";
// Ayuda y soporte (N-O11, D93). Pública: quien no puede entrar también escribe. Con sesión muestra sus consultas y la
// respuesta de REPI. Antes del formulario, los caminos propios (recuperar contraseña, códigos de respaldo): REPI no
// cambia credenciales ni entra a la cuenta de nadie.
import { useEffect, useState } from "react";
import { ArrowLeft, Key, ShieldCheck } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { pendingFor } from "@/lib/offline/queue";
import { detectEnv } from "@/lib/platform";
import { Ic } from "@/components/ui/Ic";
import { Wordmark } from "./Wordmark";
import { CONTACT, SUPPORT } from "@/lib/contact";

type Cat = "access" | "training" | "sync" | "billing" | "privacy" | "other";
const CATS: [Cat, string][] = [["access", "No puedo entrar"], ["training", "Entrenamiento"], ["sync", "Datos sin guardar"], ["billing", "Pagos o contrato"], ["privacy", "Privacidad"], ["other", "Otro"]];
const STATUS = { open: "Recibida", in_progress: "En revisión", resolved: "Respondida" } as const;
type Mine = { code: string; category: Cat | "idea"; message: string; status: keyof typeof STATUS; resolution: string | null; createdAt: string; resolvedAt: string | null };
type Diag = { appVersion?: string; platform?: string; standalone?: boolean; online?: boolean; pendingSync?: number; path?: string };

const day = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

export function Support({ from }: { from?: string }) {
  const [mine, setMine] = useState<Mine[] | null | "anon">(null);
  const [cat, setCat] = useState<Cat | null>(null);
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [attach, setAttach] = useState(true);
  const [diag, setDiag] = useState<Diag>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const load = () => api<Mine[]>("/api/me/support").then(setMine).catch(() => setMine("anon"));
  useEffect(() => {
    void load();
    (async () => {
      const env = detectEnv();
      const d: Diag = {
        appVersion: document.querySelector<HTMLMetaElement>('meta[name="repi-version"]')?.content?.slice(0, 12) || undefined,
        platform: navigator.userAgent, standalone: env.standalone, online: navigator.onLine,
        path: from?.startsWith("/") ? from : undefined,
      };
      try { d.pendingSync = await pendingFor(); } catch { /* sin IndexedDB */ }
      setDiag(d);
    })();
  }, [from]);

  const anon = mine === "anon";
  const send = async () => {
    setErr(null);
    if (!cat) return setErr("Elegí un tema.");
    if (msg.trim().length < 10) return setErr("Contanos un poco más (al menos 10 caracteres).");
    if (anon && !/^\S+@\S+\.\S+$/.test(email.trim())) return setErr("Escribí un email para poder responderte.");
    setBusy(true);
    try {
      const r = await api<{ code: string }>("/api/support", { body: { category: cat, message: msg, email: anon ? email.trim() : null, diagnostics: attach ? diag : null } });
      setSent(r.code); setMsg(""); setCat(null);
      if (!anon) void load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const back = () => { if (history.length > 1) history.back(); else window.location.href = from?.startsWith("/") ? from : "/"; };

  return (
    <div className="ac-form">
      <div className="ac-top">
        <button type="button" className="ac-back" onClick={back} aria-label="Volver"><Ic i={ArrowLeft} size={22} /></button>
        <Wordmark width={62} />
      </div>
      <div className="ac-head">
        <h1 tabIndex={-1}>Ayuda y soporte</h1>
        <p className="ac-sub">Escribinos qué pasó y te respondemos{anon ? " al correo que indiques" : Array.isArray(mine) ? " acá y por email" : ""}. REPI nunca te va a pedir tu contraseña ni tus códigos.</p>
      </div>

      {anon && (cat === "access" || cat === null) && (
        <>
          <a className="ac-opt" href="/acceso?step=rec1">
            <span className="ac-opt-ic" aria-hidden="true"><Ic i={Key} size={22} color="#00D1FF" /></span>
            <span><strong>Olvidé mi contraseña</strong><small>Te mandamos un código a tu email para crear una nueva. Es lo más rápido.</small></span>
          </a>
          <div className="ac-info">
            <span className="ac-ini" aria-hidden="true"><Ic i={ShieldCheck} size={22} /></span>
            <span><strong>¿Perdiste la app de autenticación?</strong><small>Ingresá con uno de tus códigos de respaldo. Si no los tenés, escribinos: vamos a verificar que sos vos antes de cualquier cambio.</small></span>
          </div>
        </>
      )}

      {sent ? (
        <div className="ac-info" role="status">
          <span className="ac-ini" aria-hidden="true">✓</span>
          <span><strong>Recibimos tu consulta · <span style={{ whiteSpace: "nowrap" }}>{sent}</span></strong><small>Guardá este código por si nos escribís de nuevo. {anon ? "Te respondemos al correo que dejaste." : "La respuesta aparece abajo."}</small></span>
        </div>
      ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <fieldset className="ac-chips"><legend>Tema</legend>
            <div>{CATS.map(([k, l]) => <button type="button" key={k} className="ac-chip" aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>)}</div>
          </fieldset>
          {anon && (
            <div className="ac-field"><label htmlFor="sp-email">Tu email</label>
              <input id="sp-email" type="email" inputMode="email" autoComplete="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
              <span className="ac-hint">Para responderte. No confirma si existe una cuenta con ese correo.</span>
            </div>
          )}
          <div className="ac-field"><label htmlFor="sp-msg">¿Qué pasó?</label>
            <textarea id="sp-msg" rows={5} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)}
              placeholder="Qué estabas haciendo, qué esperabas y qué viste. No incluyas contraseñas ni datos de salud." />
          </div>
          <div className="ac-check">
            <input id="sp-diag" type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            <label htmlFor="sp-diag">Adjuntar datos técnicos: versión de REPI{diag.appVersion ? ` (${diag.appVersion})` : ""}, navegador y dispositivo, si está instalada, conexión y {diag.pendingSync ?? 0} cambio(s) sin sincronizar. Nada de tus entrenamientos ni mensajes.</label>
          </div>
          <div aria-live="assertive">{err && <p role="alert" className="ac-error">{err}</p>}</div>
          <button type="submit" className="ac-cta" disabled={mine === null} aria-busy={busy || undefined}>{busy ? "Enviando…" : "Enviar consulta"}</button>
        </form>
      )}
      {sent && <button type="button" className="ac-sec" onClick={() => setSent(null)}>Escribir otra consulta</button>}

      <section aria-labelledby="sp-direct" className="ac-info" style={{ alignItems: "flex-start" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <strong id="sp-direct">Contacto directo</strong>
          <small><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> · <a href={CONTACT.whatsapp} target="_blank" rel="noreferrer">WhatsApp {CONTACT.phoneLabel}</a></small>
          <small><b>Urgencias:</b> {SUPPORT.urgent}</small>
          <small><b>Gimnasios y coaches:</b> errores y dudas de uso incluidos en el acuerdo. {SUPPORT.custom}</small>
        </span>
      </section>

      {Array.isArray(mine) && mine.length > 0 && (
        <section aria-labelledby="sp-mine" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 id="sp-mine" style={{ margin: "8px 0 0", fontSize: 16 }}>Tus consultas</h2>
          {mine.map((t) => (
            <div key={t.code} className="ac-info" style={{ alignItems: "flex-start" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <strong>{CATS.find(([k]) => k === t.category)?.[1] ?? "Sugerencia"} · <span className={`ac-badge${t.status === "resolved" ? " ok" : ""}`}>{STATUS[t.status]}</span></strong>
                <small>{t.code} · {day(t.createdAt)}</small>
                <small style={{ overflowWrap: "anywhere" }}>{t.message}</small>
                {t.resolution && <small style={{ color: "var(--t-ink)" }}><b>REPI:</b> {t.resolution}</small>}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
