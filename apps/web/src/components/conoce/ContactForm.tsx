"use client";
// Formulario de /conoce (D205): «Solicitá una demo de REPI». Usa la misma recepción que el sitio y Acceso (/api/access/lead →
// commercial_lead → REPI Admin › Contactos). Email o WhatsApp, empresa opcional para aliados, antispam (campo trampa + tiempo)
// y el origen anónimo de la visita. No crea cuentas, espacios ni cobros.
import { useEffect, useRef, useState } from "react";
import { isEmail } from "@repi/domain";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/site-events";
import { track, visitContext } from "@/lib/site-track";

type Kind = "gym" | "coach" | "partner";
// D209: enlace personal de un vendedor (/conoce?ref=V-XXXXXX). Se recuerda en la pestaña; el servidor sólo lo acepta si es de
// un vendedor activo y lo guarda como origen del contacto, nunca como una venta atribuida.
const REF_KEY = "repi:ref:v1";
function referral(): string | null {
  try {
    const q = new URLSearchParams(location.search).get("ref");
    if (q && /^V-[A-Z0-9]{6}$/i.test(q)) { sessionStorage.setItem(REF_KEY, q.toUpperCase()); return q.toUpperCase(); }
    return sessionStorage.getItem(REF_KEY);
  } catch { return null; }
}
const KIND_OF: Record<Profile, Kind> = { gimnasios: "gym", entrenadores: "coach", deportistas: "gym", aliados: "partner" };
const KINDS: [Kind, string][] = [["gym", "Un gimnasio"], ["coach", "Soy entrenador"], ["partner", "Empresa o alianza"]];

export function ContactForm({ initial }: { initial: Profile | null }) {
  const [kind, setKind] = useState<Kind>(initial ? KIND_OF[initial] : "gym");
  const [interest, setInterest] = useState<Profile | null>(initial);
  const [meeting, setMeeting] = useState(false);
  const [f, setF] = useState({ contactName: "", orgName: "", email: "", phone: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const shown = useRef(Date.now());
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ profile: Profile; meeting?: boolean }>).detail; setInterest(d.profile); setKind(KIND_OF[d.profile]); setMeeting(!!d.meeting); };
    window.addEventListener("repi:interest", on);
    return () => window.removeEventListener("repi:interest", on);
  }, []);
  useEffect(() => { referral(); }, []);
  useEffect(() => { if (done) { doneRef.current?.focus(); doneRef.current?.scrollIntoView({ block: "center" }); } }, [done]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const badEmail = !!f.email && !isEmail(f.email);
  const phoneOk = f.phone.replace(/\D/g, "").length >= 8;
  const orgLabel = kind === "gym" ? "Nombre del gimnasio" : kind === "coach" ? "Nombre comercial o tu marca" : "Empresa (opcional)";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.contactName.trim().length < 2) return setErr("Contanos tu nombre.");
    if (kind !== "partner" && f.orgName.trim().length < 2) return setErr(`Completá: ${orgLabel.toLowerCase()}.`);
    if (f.email ? badEmail : !phoneOk) return setErr("Dejanos un email válido o un WhatsApp con código de área.");
    setBusy(true); setErr(null);
    const { attr } = visitContext();
    try {
      await api("lead", { body: {
        kind, orgName: f.orgName || null, contactName: f.contactName, email: f.email || null, phone: f.phone || null,
        message: [meeting ? "Pide una reunión." : "", f.message].filter(Boolean).join(" ") || null,
        source: attr.source, campaign: attr.utmCampaign ?? attr.campaign, interest, website: f.website, elapsedMs: Date.now() - shown.current,
        referralCode: referral(),
      } });
      track("form_submit", { profile: interest, target: kind });
      if (meeting || kind === "partner") track("meeting_request", { profile: interest, target: "form" });
      setDone(true);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="cn-form cn-done" role="status" tabIndex={-1} ref={doneRef}>
        <h3>¡Listo! Recibimos tu consulta</h3>
        <p>Te escribimos {f.email ? <>a <b>{f.email}</b></> : <>por WhatsApp al <b>{f.phone}</b></>} para coordinar. Mientras tanto, podés probar la demo guiada.</p>
        <p className="cn-fine">No se creó ninguna cuenta ni se cobra nada: el alta la hace el equipo de REPI después de acordar las condiciones.</p>
      </div>
    );
  }
  return (
    <form className="cn-form" onSubmit={submit} noValidate aria-label="Solicitar una demo de REPI">
      <fieldset>
        <legend>¿Qué te interesa?</legend>
        <div className="cn-seg-row">
          {KINDS.map(([k, l]) => <label key={k} className="cn-seg"><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} /> {l}</label>)}
        </div>
      </fieldset>
      <label className="cn-field">Tu nombre<input value={f.contactName} onChange={set("contactName")} maxLength={80} autoComplete="name" required /></label>
      <label className="cn-field">{orgLabel}<input value={f.orgName} onChange={set("orgName")} maxLength={120} autoComplete="organization" required={kind !== "partner"} /></label>
      <div className="cn-two">
        <label className="cn-field">Email<input type="email" inputMode="email" value={f.email} onChange={set("email")} maxLength={200} autoComplete="email" aria-invalid={badEmail || undefined} aria-describedby="cn-either" /></label>
        <label className="cn-field">WhatsApp<input type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} maxLength={40} autoComplete="tel" placeholder="223 000-0000" aria-describedby="cn-either" /></label>
      </div>
      <p id="cn-either" className="cn-fine">Con uno de los dos alcanza.</p>
      <label className="cn-field">Mensaje (opcional)<textarea value={f.message} onChange={set("message")} maxLength={500} rows={3} placeholder={kind === "gym" ? "Sedes y socios aproximados" : kind === "coach" ? "¿Cuántos alumnos tenés?" : "Contanos qué te gustaría conversar"} /></label>
      {/* Campo trampa: invisible para personas; los bots lo completan. */}
      <div className="cn-hp" aria-hidden="true"><label>Sitio web<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label></div>
      <div aria-live="assertive">{err && <p className="cn-err" role="alert">{err}</p>}</div>
      <button type="submit" className="cn-btn pri wide" aria-busy={busy || undefined} disabled={busy}>{busy ? "Enviando…" : meeting ? "Pedir una reunión" : "Solicitar una demo"}</button>
      <p className="cn-fine">Usamos tus datos sólo para responderte. <a href="/legal/privacy">Privacidad</a>.</p>
    </form>
  );
}
