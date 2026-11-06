"use client";
// D203 · Funciones sólo para adultos (peso corporal, fotos de progreso, calorías) cuando la cuenta no tiene fecha de
// nacimiento: nunca se supone adulta. La persona la declara una vez (como en el registro); no se puede cambiar desde la
// app. Si resulta menor, aplican las reglas de menores y del adulto responsable de siempre. Entrenar no se bloquea.
import { useState } from "react";
import { localDate } from "@repi/domain";
import { api } from "@/lib/api";

export function AgeGate({ what, onDone }: { what: string; onDone: (eligibility: "adult" | "minor" | "unknown") => void }) {
  const [birth, setBirth] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    if (busy || !birth || !ok) return;
    setBusy(true); setErr(null);
    try { const r = await api<{ eligibility: "adult" | "minor" | "unknown" }>("/api/me/birth-date", { body: { birth } }); onDone(r.eligibility); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="pp-card" aria-labelledby="age-gate">
      <h2 id="age-gate">Confirmá tu fecha de nacimiento</h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{what} es sólo para mayores de 18 años y tu cuenta no tiene la fecha registrada. Se usa únicamente para aplicar las reglas de menores; tus entrenamientos no cambian.</p>
      <div className="pp-form">
        <label>Fecha de nacimiento<input type="date" value={birth} max={localDate(new Date())} min="1900-01-01" onChange={(e) => setBirth(e.target.value)} /></label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ width: 20, height: 20 }} />Es mi fecha real. Entiendo que después no la puedo cambiar desde la app.</label>
        {err && <p className="mb-err" role="alert">{err}</p>}
        <button type="button" className="cta" disabled={busy || !birth || !ok} aria-busy={busy || undefined} onClick={() => void send()}>Confirmar</button>
      </div>
    </section>
  );
}
