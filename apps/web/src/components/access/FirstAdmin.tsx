"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { Wordmark } from "./Wordmark";
import { PasswordInput } from "./PasswordInput";

const KEY = "repi:first-admin-ticket";
type Me = { user: { name: string; email: string; twoFactorEnabled: boolean } };
export function FirstAdmin() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const incoming = window.location.hash.slice(1);
    if (incoming && /^[A-Za-z0-9_-]{43}$/.test(incoming)) sessionStorage.setItem(KEY, incoming);
    // El secreto nunca queda en una query, historial navegable o enlace al formulario de acceso.
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    setToken(sessionStorage.getItem(KEY) ?? "");
    api<Me>("me").then(setMe).catch((e: unknown) => {
      if (!(e instanceof ApiError && e.status === 401)) setError("No pudimos comprobar tu sesión. Recargá para volver a intentar.");
    }).finally(() => setReady(true));
  }, []);
  async function submit() {
    setBusy(true); setError("");
    try {
      if (me) {
        const result = await api<{ href: string }>("/api/admin-bootstrap", { body: { token } });
        sessionStorage.removeItem(KEY); window.location.assign(result.href); return;
      }
      if (verifying) {
        const r = await authClient.emailOtp.verifyEmail({ email, otp });
        if (r.error) throw new Error(r.error.message ?? "Revisá el código que te llegó por email.");
        setMe(await api<Me>("me")); setPassword(""); return;
      }
      await api("sign-up", { body: { flow: "owner", name, email, password, terms } });
      setVerifying(true); setPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos continuar. Probá de nuevo."); }
    finally { setBusy(false); }
  }
  const title = !token ? "Abrí tu enlace privado" : me ? "Activá tu administración" : verifying ? "Verificá tu email" : "Tu cuenta administradora";
  return <form className="ac-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <div className="ac-top"><Wordmark width={62} /><span className="ac-step">Configuración inicial</span></div>
    <div className="ac-head"><h1>{title}</h1><p className="ac-sub">Repi Admin se activa con tu cuenta personal, tu email verificado y una verificación en dos pasos.</p></div>
    {!ready ? <p role="status">Comprobando tu sesión…</p> : !token ? <p>Usá el enlace guardado en el archivo privado de configuración. Por seguridad vence en 24 horas y sólo sirve una vez.</p> : me ? <>
      <div className="ac-info"><span><strong>{me.user.name}</strong><small>{me.user.email}</small></span></div>
      {!me.user.twoFactorEnabled ? <><p>Activá los dos pasos y guardá los códigos de recuperación en un lugar seguro.</p><a className="ac-cta" href="/acceso?step=twofaSetup&next=%2Factivar-admin">Configurar dos pasos</a></> : <button className="ac-cta" disabled={busy}>{busy ? "Activando…" : "Activar mi administración"}</button>}
    </> : verifying ? <>
      <p>Ingresá el código enviado a {email}.</p><div className="ac-field"><label htmlFor="admin-otp">Código de seis dígitos</label><input id="admin-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} required /></div>
      <button className="ac-cta" disabled={busy || otp.length !== 6}>{busy ? "Verificando…" : "Verificar email"}</button>
      <a href="/acceso?next=%2Factivar-admin">Ingresar o recuperar una cuenta existente</a>
    </> : <>
      <div className="ac-field"><label htmlFor="admin-name">Nombre y apellido</label><input id="admin-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></div>
      <div className="ac-field"><label htmlFor="admin-email">Tu email</label><input id="admin-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
      <div className="ac-field"><label htmlFor="admin-password">Creá tu contraseña</label><PasswordInput id="admin-password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} /><span className="ac-hint">Al menos 8 caracteres, con letras y números.</span></div>
      <label><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} required /> Acepto los <a href="/legal/terms" target="_blank" rel="noreferrer">términos</a> y la <a href="/legal/privacy" target="_blank" rel="noreferrer">política de privacidad</a>.</label>
      <button className="ac-cta" disabled={busy || !terms}>{busy ? "Preparando…" : "Crear mi cuenta"}</button>
      <a href="/acceso?next=%2Factivar-admin">Ya tengo cuenta</a>
    </>}
    {error && <p className="ac-error" role="alert">{error}</p>}
  </form>;
}
