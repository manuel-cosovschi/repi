"use client";
// D155: «Armar con REPI». El profe carga objetivo, días, minutos, nivel, preferencias y lesiones o limitaciones, y REPI
// propone un programa completo con la biblioteca. La propuesta reemplaza lo que hay en el editor sólo si el profe la usa;
// después se revisa y se guarda como siempre. Lo escrito acá no se guarda.
// D161: antes de usarla, la propuesta se edita a mano (series, reps, RIR, orden, cambiar, quitar o agregar ejercicios) y se le
// puede pedir a REPI un cambio puntual sobre lo que quedó, sin rearmarla de cero.
import { useState } from "react";
import { TRAINING_WISH_GOALS, type ProgramDoc, type TrainingWishGoal } from "@repi/domain";
import { api } from "@/lib/api";
import type { SharedWishesView } from "./SharedWishes";
import { IntInput } from "@/components/ui/IntInput";

type Draft = { doc: ProgramDoc; headline: string; summary: string; caution: string | null; byRules: boolean };
type Lib = { id: string; name: string; group: string; kind: string }[];
type Days = ProgramDoc["days"];
const LEVELS = [["beginner", "Principiante"], ["intermediate", "Intermedio"], ["advanced", "Avanzado"]] as const;
const goalKey = (g: string | null | undefined) =>
  (Object.entries(TRAINING_WISH_GOALS).find(([k, v]) => k === g || v === g)?.[0] as TrainingWishGoal | undefined) ?? null;

export function ProgramAssistant({ url, wishes, hasContent, library = [], onUse }: { url: string; wishes?: SharedWishesView | null; hasContent: boolean; library?: Lib; onUse: (doc: ProgramDoc) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    goal: goalKey(wishes?.goal), daysPerWeek: wishes?.daysPerWeek && wishes.daysPerWeek <= 6 ? wishes.daysPerWeek : 3, minutes: wishes?.minutes ?? 60 as number | null,
    level: "beginner" as (typeof LEVELS)[number][0], likes: wishes?.likes ?? "", avoid: wishes?.avoid ?? "", limitations: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [change, setChange] = useState("");
  const [revising, setRevising] = useState(false);
  const [picker, setPicker] = useState<null | { day: number; idx: number | null }>(null); // idx null: agregar al día
  const [q, setQ] = useState("");
  const ask = async () => {
    setBusy(true); setErr(null);
    try { setDraft(await api<Draft>(url, { body: f })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  // Cambio puntual: viaja la propuesta como está (con lo editado a mano) y vuelve con sólo eso cambiado.
  const revise = async () => {
    if (!draft || change.trim().length < 3) return;
    setRevising(true); setErr(null);
    try { setDraft(await api<Draft>(url, { body: { ...f, change: change.trim(), current: draft.doc } })); setChange(""); setPicker(null); }
    catch (e) { setErr((e as Error).message); } finally { setRevising(false); }
  };
  const editDays = (fn: (days: Days) => Days) => setDraft((d) => (d ? { ...d, doc: { ...d.doc, days: fn(d.doc.days) } } : d));
  const inDay = (di: number, fn: (xs: Days[number]["exercises"]) => Days[number]["exercises"]) => editDays((days) => days.map((d, i) => (i === di ? { ...d, exercises: fn(d.exercises) } : d)));
  const setEx = (di: number, ei: number, p: Partial<Days[number]["exercises"][number]>) => inDay(di, (xs) => xs.map((e, j) => (j === ei ? { ...e, ...p } : e)));
  const move = (di: number, ei: number, dir: -1 | 1) => inDay(di, (xs) => {
    const j = ei + dir;
    if (j < 0 || j >= xs.length) return xs;
    const ys = [...xs]; [ys[ei], ys[j]] = [ys[j], ys[ei]]; return ys;
  });
  const choose = (x: Lib[number]) => {
    if (!picker) return;
    const { day, idx } = picker;
    inDay(day, (xs) => idx == null ? [...xs, { exerciseId: x.id, name: x.name, sets: 3, reps: "8-12", rir: 2, restSec: 90, note: null }]
      : xs.map((e, j) => (j === idx ? { ...e, exerciseId: x.id, name: x.name, note: null } : e)));
    setPicker(null); setQ("");
  };
  const found = picker ? library.filter((x) => x.kind !== "time" && (!q.trim() || `${x.name} ${x.group}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 8) : [];
  const pickerUi = (
    <div className="pa-pick">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la biblioteca" aria-label="Buscar ejercicio" />
      <ul>{found.map((x) => <li key={x.id}><button type="button" onClick={() => choose(x)}><span>{x.name}</span><small>{x.group}</small></button></li>)}</ul>
      {!found.length && <small className="muted">Sin resultados.</small>}
      <button type="button" className="btn" onClick={() => { setPicker(null); setQ(""); }}>Cancelar</button>
    </div>
  );
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
      <button type="button" className={draft ? "btn" : "btn pri"} aria-busy={busy || undefined} onClick={() => { if (!draft || window.confirm("¿Armar otra propuesta desde cero? Se pierden los cambios que hiciste en esta.")) void ask(); }}>
        {busy ? "REPI está armando el programa…" : draft ? "Armar otra desde cero" : "Armar propuesta"}</button>
      {draft && (
        <div className="pa-draft" aria-live="polite">
          <b>{draft.headline}</b>
          <span className="muted" style={{ fontSize: 13 }}>{draft.summary}</span>
          {draft.caution && <p className="pa-warn" role="note">{draft.caution}</p>}
          <small className="muted">Podés ajustarla antes de usarla: series, repeticiones, RIR, orden, cambiar o quitar ejercicios.</small>
          {draft.doc.days.map((d, di) => (
            <div key={di} className="pa-day"><b>{d.name}</b>
              <ul>{d.exercises.map((e, ei) => (
                <li key={`${ei}:${e.exerciseId}`} className="pa-ex">
                  <span className="pa-ex-name">{e.name}</span>
                  <span className="pa-ex-acts">
                    <button type="button" className="ibtn" aria-label={`Subir ${e.name}`} disabled={ei === 0} onClick={() => move(di, ei, -1)}>↑</button>
                    <button type="button" className="ibtn" aria-label={`Bajar ${e.name}`} disabled={ei === d.exercises.length - 1} onClick={() => move(di, ei, 1)}>↓</button>
                    {library.length > 0 && <button type="button" className="btn pa-sm" aria-expanded={picker?.day === di && picker.idx === ei} onClick={() => { setPicker({ day: di, idx: ei }); setQ(""); }}>Cambiar</button>}
                    <button type="button" className="ibtn" aria-label={`Quitar ${e.name}`} onClick={() => inDay(di, (xs) => xs.filter((_, j) => j !== ei))}>×</button>
                  </span>
                  <span className="pa-ex-fields">
                    <label>Series<IntInput min={1} max={20} value={e.sets} onChange={(n) => n != null && setEx(di, ei, { sets: n })} /></label>
                    <label>Reps<input value={e.reps} maxLength={20} onChange={(ev) => setEx(di, ei, { reps: ev.target.value })} /></label>
                    <label>RIR<IntInput min={0} max={5} nullable value={e.rir} onChange={(n) => setEx(di, ei, { rir: n })} placeholder="—" /></label>
                  </span>
                  {e.note && <small>{e.note}</small>}
                  {picker?.day === di && picker.idx === ei && pickerUi}
                </li>
              ))}</ul>
              {library.length > 0 && (picker?.day === di && picker.idx == null ? pickerUi
                : <button type="button" className="dashed pa-add" onClick={() => { setPicker({ day: di, idx: null }); setQ(""); }}>+ Agregar ejercicio</button>)}
            </div>
          ))}
          <div className="pa-change">
            <label className="field">Pedile un cambio a REPI<input value={change} maxLength={300} onChange={(e) => setChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void revise(); } }} placeholder="Ej.: cambiá la sentadilla por prensa, o sumá un ejercicio de core al día B" /></label>
            <button type="button" className="btn" disabled={change.trim().length < 3} aria-busy={revising || undefined} onClick={() => void revise()}>{revising ? "REPI está aplicando el cambio…" : "Aplicar cambio"}</button>
            <small className="muted">Cambia sólo lo que pedís; el resto de la propuesta, incluido lo que editaste, queda igual.</small>
          </div>
          <button type="button" className="btn pri" onClick={() => {
            if (hasContent && !window.confirm("¿Reemplazar lo que hay en el editor por la propuesta de REPI?")) return;
            onUse(draft.doc); setOpen(false);
          }}>Usar esta propuesta</button>
        </div>
      )}
    </section>
  );
}
