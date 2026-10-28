"use client";
// Mi cuenta (D119). La verificación en dos pasos es optativa: se activa con el mismo paso de /acceso (contraseña → app de
// códigos → códigos de respaldo) y se quita confirmando la contraseña. REPI no la exige a ningún rol.
import { useState } from "react";
import { ArrowLeft, ShieldCheck } from "@phosphor-icons/react";
import { authClient } from "@/lib/auth-client";
import { Ic } from "@/components/ui/Ic";
import { Wordmark } from "./Wordmark";

export function Account({ name, email, twoFactor, from }: { name: string; email: string; twoFactor: boolean; from?: string }) {
  const [on, setOn] = useState(twoFactor);
  const [pw, setPw] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const here = `/cuenta${from ? `?desde=${encodeURIComponent(from)}` : ""}`;
  const back = () => { window.location.href = from ?? "/acceso?step=workspace"; };

  const disable = async () => {
    setErr(null);
    if (!pw) return setErr("Escribí tu contraseña.");
    setBusy(true);
    try {
      const r = await authClient.twoFactor.disable({ password: pw });
      if (r.error) return setErr("La contraseña no es correcta.");
      setOn(false); setAsking(false); setPw(""); setDone("Listo: desde ahora entrás sólo con tu contraseña.");
    } finally { setBusy(false); }
  };

  return (
    <div className="ac-form">
      <div className="ac-top">
        <button type="button" className="ac-back" onClick={back} aria-label="Volver"><Ic i={ArrowLeft} size={22} /></button>
        <Wordmark width={62} />
      </div>
      <div className="ac-head">
        <h1 tabIndex={-1}>Mi cuenta</h1>
        <p className="ac-sub">{name} · {email}</p>
      </div>

      <section className="ac-info" style={{ alignItems: "flex-start" }} aria-labelledby="acc-2fa">
        <span className="ac-ini" aria-hidden="true"><Ic i={ShieldCheck} size={22} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <strong id="acc-2fa">Verificación en dos pasos · {on ? "activada" : "desactivada"}</strong>
          <small>
            {on
              ? "Al entrar te pedimos tu contraseña y un código de tu app de autenticación."
              : "Opcional. Suma un código de una app del teléfono (Google Authenticator, 1Password) además de la contraseña. Recomendada si administrás un gimnasio o muchos alumnos."}
          </small>
        </span>
      </section>

      {done && <p role="status" className="ac-sub" style={{ margin: 0 }}>{done}</p>}

      {!on && <a className="ac-cta" href={`/acceso?step=twofaSetup&next=${encodeURIComponent(here)}`}>Activar verificación en dos pasos</a>}

      {on && !asking && <button type="button" className="ac-sec" onClick={() => { setAsking(true); setDone(null); }}>Quitar verificación en dos pasos</button>}
      {on && asking && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void disable(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="ac-field"><label htmlFor="acc-pw">Confirmá tu contraseña</label>
            <input id="acc-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div aria-live="assertive">{err && <p role="alert" className="ac-error">{err}</p>}</div>
          <button type="submit" className="ac-cta" aria-busy={busy || undefined}>{busy ? "Quitando…" : "Quitar"}</button>
          <button type="button" className="ac-sec" onClick={() => { setAsking(false); setPw(""); setErr(null); }}>Cancelar</button>
        </form>
      )}
    </div>
  );
}
