"use client";
// D155: «Armar con REPI». El profe carga objetivo, días, minutos, nivel, preferencias y lesiones o limitaciones, y REPI
// propone un programa completo con la biblioteca. La propuesta reemplaza lo que hay en el editor sólo si el profe la usa;
// después se revisa y se guarda como siempre. Lo escrito acá no se guarda.
import { useState } from "react";
import { TRAINING_WISH_GOALS, type ProgramDoc, type TrainingWishGoal } from "@repi/domain";
import { api } from "@/lib/api";
import type { SharedWishesView } from "./SharedWishes";
import { IntInput } from "@/components/ui/IntInput";

type Draft = { doc: ProgramDoc; headline: string; summary: string; caution: string | null; byRules: boolean };
const LEVELS = [["beginner", "Principiante"], ["intermediate", "Intermedio"], ["advanced", "Avanzado"]] as const;
const goalKey = (g: string | null | undefined) =>
  (Object.entries(TRAINING_WISH_GOALS).find(([k, v]) => k === g || v === g)?.[0] as TrainingWishGoal | undefined) ?? null;

export function ProgramAssistant({ url, wishes, hasContent, onUse }: { url: string; wishes?: SharedWishesView | null; hasContent: boolean; onUse: (doc: ProgramDoc) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    goal: goalKey(wishes?.goal), daysPerWeek: wishes?.daysPerWeek && wishes.daysPerWeek <= 6 ? wishes.daysPerWeek : 3, minutes: wishes?.minutes ?? 60 as number | null,
    level: "beginner" as (typeof LEVELS)[number][0], likes: wishes?.likes ?? "", avoid: wishes?.avoid ?? "", limitations: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const ask = async () => {
    setBusy(true); setErr(null);
    try { setDraft(await api<Draft>(url, { body: f })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (!open) return <button type="button" className="btn pa-open" onClick={() => setOpen(true)}>Armar con REPI</button>;
  return (
    <section className="pa" aria-label="Armar el programa con REPI">
      <div className="pa-head"><b>Armar con REPI</b><button type="button" className="x" aria-label="Cerrar" onClick={() => setOpen(false)}>×</button></div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Contale a REPI lo que sabés de la persona y te propone el programa completo con la biblioteca. Lo revisás y lo guardás vos.</p>
      <div className="pa-grid">
        <label className="field">Objetivo<select value={f.goal ?? ""} onChange={(e) => setF({ ...f, goal: (e.target.value || null) as TrainingWishGoal | null })}>
          <option value="">Sin definir</option>{Object.entries(TRAINING_WISH_GOALS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="field">Días por semana<IntInput min={1} max={6} value={f.daysPerWeek} onChange={(n) => n != null && setF({ ...f, daysPerWeek: n })} /></label>
        <label className="field">Minutos por sesión<IntInput min={15} max={180} nullable value={f.minutes} onChange={(n) => setF({ ...f, minutes: n })} /></label>
        <label className="field">Nivel<select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as typeof f.level })}>{LEVELS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <label className="field">Le gusta<input value={f.likes} maxLength={300} onChange={(e) => setF({ ...f, likes: e.target.value })} placeholder="Ej.: máquinas, peso libre, entrenar piernas" /></label>
      <label className="field">Prefiere evitar<input value={f.avoid} maxLength={300} onChange={(e) => setF({ ...f, avoid: e.target.value })} placeholder="Ej.: cardio largo, saltos" /></label>
      <label className="field">Lesiones o limitaciones<textarea className="note" rows={2} value={f.limitations} maxLength={500} onChange={(e) => setF({ ...f, limitations: e.target.value })} placeholder="Ej.: molestia en el hombro derecho al levantar por encima de la cabeza" /></label>
      <label className="field">Otras indicaciones<input value={f.notes} maxLength={300} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Ej.: prepara un torneo de pádel en 2 meses" /></label>
      <small className="muted">Lo que escribís acá se usa sólo para armar esta propuesta (lo procesa OpenAI, sin el nombre de la persona) y no se guarda. No pongas datos que la identifiquen. REPI no reemplaza a un profesional de la salud.</small>
      {err && <p role="alert" className="err-box">{err}</p>}
      <button type="button" className="btn pri" aria-busy={busy || undefined} onClick={() => void ask()}>{busy ? "REPI está armando el programa…" : draft ? "Volver a armar" : "Armar propuesta"}</button>
      {draft && (
        <div className="pa-draft" aria-live="polite">
          <b>{draft.headline}</b>
          <span className="muted" style={{ fontSize: 13 }}>{draft.summary}</span>
          {draft.caution && <p className="pa-warn" role="note">{draft.caution}</p>}
          {draft.doc.days.map((d) => (
            <div key={d.name} className="pa-day"><b>{d.name}</b>
              <ul>{d.exercises.map((e) => <li key={e.exerciseId}><span>{e.name}</span><span>{e.sets} × {e.reps}{e.rir != null ? ` · RIR ${e.rir}` : ""}</span>{e.note && <small>{e.note}</small>}</li>)}</ul>
            </div>
          ))}
          <button type="button" className="btn pri" onClick={() => {
            if (hasContent && !window.confirm("¿Reemplazar lo que hay en el editor por la propuesta de REPI?")) return;
            onUse(draft.doc); setOpen(false);
          }}>Usar esta propuesta</button>
        </div>
      )}
    </section>
  );
}
