"use client";
// Contacto comercial del sitio público (F-PU-01, D104). Misma ruta que Acceso (/api/access/lead): registra el interés y
// REPI Admin hace el alta después de acordar condiciones. No crea cuentas, espacios ni cobros.
import { useEffect, useRef, useState } from "react";
import { isEmail } from "@repi/domain";
import { api } from "@/lib/api";

export function LeadForm() {
  const [kind, setKind] = useState<"gym" | "coach">("gym");
  const [f, setF] = useState({ orgName: "", contactName: "", email: "", phone: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLDivElement>(null);
  // El formulario se achica al confirmar: llevar la vista (y el lector de pantalla) al mensaje.
  useEffect(() => { if (done) { doneRef.current?.focus(); doneRef.current?.scrollIntoView({ block: "center" }); } }, [done]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const badEmail = !!f.email && !isEmail(f.email);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.orgName.trim().length < 2 || f.contactName.trim().length < 2 || !isEmail(f.email)) return setErr("Completá el nombre, tu nombre y un email válido.");
    setBusy(true); setErr(null);
    try {
      await api("lead", { body: { kind, orgName: f.orgName, contactName: f.contactName, email: f.email, phone: f.phone || null, message: f.message || null } });
      setDone(true);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  if (done) {
    return (
      <div className="st-form st-done" role="status" tabIndex={-1} ref={doneRef}>
        <h3>Recibimos tus datos</h3>
        <p>Te escribimos a <b>{f.email}</b> para conocer tu {kind === "gym" ? "gimnasio" : "trabajo"} y acordar alcance, cantidad y precio. No se creó ningún espacio ni se cobra nada hasta que el acuerdo esté registrado.</p>
      </div>
    );
  }
  return (
    <form className="st-form" onSubmit={submit} noValidate aria-label="Contacto comercial">
      <fieldset>
        <legend>¿Qué querés sumar a REPI?</legend>
        <label className="st-seg"><input type="radio" name="kind" checked={kind === "gym"} onChange={() => setKind("gym")} /> Un gimnasio</label>
        <label className="st-seg"><input type="radio" name="kind" checked={kind === "coach"} onChange={() => setKind("coach")} /> Soy personal trainer</label>
      </fieldset>
      <label className="st-field">{kind === "gym" ? "Nombre del gimnasio" : "Nombre comercial"}<input value={f.orgName} onChange={set("orgName")} maxLength={120} autoComplete="organization" required /></label>
      <label className="st-field">Tu nombre y apellido<input value={f.contactName} onChange={set("contactName")} maxLength={80} autoComplete="name" required /></label>
      <label className="st-field">Email de contacto<input type="email" inputMode="email" value={f.email} onChange={set("email")} maxLength={200} autoComplete="email" aria-invalid={badEmail || undefined} required /></label>
      <label className="st-field">Teléfono (opcional)<input type="tel" value={f.phone} onChange={set("phone")} maxLength={40} autoComplete="tel" /></label>
      <label className="st-field">{kind === "gym" ? "Sedes y socios aproximados (opcional)" : "¿Cuántos alumnos tenés? (opcional)"}<textarea value={f.message} onChange={set("message")} maxLength={300} rows={3} /></label>
      {err && <p className="st-form-err" role="alert">{err}</p>}
      <button type="submit" className="st-btn pri" aria-busy={busy || undefined}>Quiero que me contacten</button>
      <p className="st-form-note">Usamos estos datos sólo para responderte. El alta la hace el equipo de REPI después de acordar las condiciones con vos.</p>
    </form>
  );
}
