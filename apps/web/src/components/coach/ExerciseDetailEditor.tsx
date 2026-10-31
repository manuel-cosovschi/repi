"use client";
// Editor de prescripción avanzada (D134), para coaches y entrenadores de sala: técnica (top set, drop set, pirámide…),
// cada serie con su tipo, repeticiones, peso, % del 1RM, RIR o RPE, descanso y nota; combinaciones (A1-A2, circuitos),
// tempo, variante, unilateral y progresión. Lo que no se toca queda como «N series × reps».
import { useState, type InputHTMLAttributes } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  GROUP_KIND_LABEL, GROUP_LETTERS, SET_KIND_LABEL, TECHNIQUES, emptyDetail, isStraightPlan, presetPlan, setTarget, setTargetText, uniformPlan, validateDetail,
  type ExerciseDetail, type GroupKind, type SetKind, type SetSpec, type Technique,
} from "@repi/domain";

type Ex = { name: string; sets: number; reps: string; rir: number | null; restSec: number; detail?: ExerciseDetail | null };

/** Resumen de una línea para la fila del constructor: «Top set + back-off · A1 · tempo 3-1-1-0». */
export function detailSummary(e: Ex, label?: string | null) {
  const d = e.detail;
  if (!d) return null;
  const straightKg = isStraightPlan(d) && uniformPlan(d.setPlan) ? d.setPlan![0].weightKg : null; // D173: series rectas con peso
  return [d.technique !== "straight" ? TECHNIQUES[d.technique].label : null, label ? `${label}${d.groupKind === "circuit" ? " (circuito)" : ""}` : null,
    d.tempo ? `tempo ${d.tempo}` : null, d.variant, d.unilateral ? "unilateral" : null,
    straightKg != null ? `${straightKg.toLocaleString("es-AR")} kg en todas las series` : d.setPlan ? `${d.setPlan.length} series a medida` : null].filter(Boolean).join(" · ");
}

const blank = (reps: string): SetSpec => ({ kind: "work", reps, weightKg: null, pct1rm: null, rir: null, rpe: null, restSec: null, note: null });
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/**
 * QA 29/10 (UX-5): campo numérico que conserva lo tipeado («42,» o «7.») mientras se escribe; antes se reconvertía a número
 * en cada tecla y no dejaba cargar decimales. Lo inválido no se guarda como NaN: queda el último valor bueno.
 */
function NumInput({ value, onChange, ...rest }: { value: number | null; onChange: (n: number | null) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState(value == null ? "" : String(value).replace(".", ","));
  const shown = numOrNull(draft) === value || (draft.trim() !== "" && Number.isNaN(numOrNull(draft))) ? draft : value == null ? "" : String(value).replace(".", ",");
  return <input {...rest} value={shown} onChange={(ev) => { setDraft(ev.target.value); const n = numOrNull(ev.target.value); if (n === null || Number.isFinite(n)) onChange(n); }} />;
}

export function ExerciseDetailEditor({ e, onSave, onClose }: { e: Ex; onSave: (p: { detail: ExerciseDetail | null; sets: number }) => void; onClose: () => void }) {
  const [d, setD] = useState<ExerciseDetail>(e.detail ?? emptyDetail());
  const [ref, setRef] = useState(() => (isStraightPlan(e.detail) && e.detail!.setPlan![0].weightKg != null ? String(e.detail!.setPlan![0].weightKg).replace(".", ",") : ""));
  const [err, setErr] = useState<string | null>(null);
  const plan = d.setPlan;
  const pick = (t: Technique) => {
    const p = presetPlan(t, { sets: plan?.length ?? e.sets, reps: e.reps, rir: e.rir, weightKg: numOrNull(ref) });
    setD({ ...d, technique: t, setPlan: p });
  };
  // D173: en series rectas, el peso de referencia es el peso de todas las series (se guarda); vacío, vuelven a ser «N × reps».
  const changeRef = (v: string) => {
    setRef(v);
    if (d.technique === "straight") setD({ ...d, setPlan: presetPlan("straight", { sets: plan?.length ?? e.sets, reps: plan?.[0]?.reps ?? e.reps, rir: plan ? plan[0].rir : e.rir, weightKg: numOrNull(v) }) });
  };
  // Cambiar una serie sola la vuelve «Personalizada»; si todas siguen iguales, sigue siendo «Series rectas».
  const setAt = (i: number, patch: Partial<SetSpec>) => {
    const next = (plan ?? []).map((s, j) => (j === i ? { ...s, ...patch } : s));
    setD({ ...d, technique: d.technique === "straight" && !uniformPlan(next) ? "custom" : d.technique, setPlan: next });
  };
  const perSet = () => setD({ ...d, technique: d.technique === "straight" ? "custom" : d.technique, setPlan: Array.from({ length: e.sets }, () => ({ ...blank(e.reps), rir: e.rir })) });
  const save = () => {
    const r = validateDetail(d, e.sets);
    if (!r.ok) return setErr(r.error);
    onSave({ detail: r.detail, sets: r.sets });
  };
  const sel = { height: 38, borderRadius: 9, border: "1px solid #C9D2DD", padding: "0 8px", font: "500 14px var(--font-ui)", background: "#fff", width: "100%" } as const;
  return (
    <Modal label={`Series y técnica · ${e.name}`} onClose={onClose} wide>
      <div className="dx">
        <div className="mhead"><h2>{e.name} · series y técnica</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>

        <section className="dx-sec"><b>Técnica</b>
          <div className="pills">{(Object.keys(TECHNIQUES) as Technique[]).map((t) => (
            <button key={t} type="button" className="pill" aria-pressed={d.technique === t} title={TECHNIQUES[t].what} onClick={() => pick(t)}>{TECHNIQUES[t].label}</button>
          ))}</div>
          <small className="muted">{TECHNIQUES[d.technique].what}</small>
          <label className="field" style={{ maxWidth: 260 }}>Peso de referencia (kg, opcional)<input inputMode="decimal" value={ref} onChange={(ev) => changeRef(ev.target.value)} placeholder="Ej.: 100" />
            <small className="muted" style={{ fontWeight: 400 }}>{d.technique === "straight" ? "Con series rectas, es el peso de todas las series." : "Al elegir una técnica calcula los pesos de cada serie (top set, back-off, drops). Después los ajustás."}</small></label>
        </section>

        <section className="dx-sec"><b>Series</b>
          {!plan ? (
            <>
              <span className="muted">{e.sets} series × {e.reps}{e.rir != null ? ` · RIR ${e.rir}` : ""}, todas iguales.</span>
              <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={perSet}>Editar serie por serie</button>
            </>
          ) : (
            <>
              {plan.map((s, i) => (
                <div key={i} className="dx-set">
                  <div className="dx-set-h"><b>Serie {i + 1}</b><small className="muted">{setTargetText(setTarget({ ...e, detail: d }, i))}</small>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      <button type="button" className="ibtn" aria-label={`Duplicar serie ${i + 1}`} title="Duplicar" disabled={plan.length >= 20} onClick={() => setD({ ...d, setPlan: [...plan.slice(0, i + 1), { ...s }, ...plan.slice(i + 1)] })}>⧉</button>
                      <button type="button" className="ibtn" aria-label={`Quitar serie ${i + 1}`} disabled={plan.length <= 1} onClick={() => setD({ ...d, setPlan: plan.filter((_, j) => j !== i) })}>×</button>
                    </span></div>
                  <div className="dx-grid">
                    <label className="field">Tipo<select style={sel} value={s.kind} onChange={(ev) => setAt(i, { kind: ev.target.value as SetKind, ...(ev.target.value === "drop" ? { restSec: 0 } : {}) })}>
                      {(Object.keys(SET_KIND_LABEL) as SetKind[]).map((k) => <option key={k} value={k}>{SET_KIND_LABEL[k]}</option>)}</select></label>
                    <label className="field">Reps<input value={s.reps} maxLength={20} onChange={(ev) => setAt(i, { reps: ev.target.value })} placeholder="8-10, AMRAP, 40 s" /></label>
                    <label className="field">Peso (kg)<NumInput inputMode="decimal" value={s.weightKg} onChange={(n) => setAt(i, { weightKg: n })} placeholder="—" /></label>
                    <label className="field">% 1RM<NumInput inputMode="decimal" value={s.pct1rm} onChange={(n) => setAt(i, { pct1rm: n })} placeholder="—" /></label>
                    <label className="field">RIR<NumInput inputMode="numeric" value={s.rir} onChange={(n) => setAt(i, { rir: n })} placeholder="—" /></label>
                    <label className="field">RPE<NumInput inputMode="decimal" value={s.rpe} onChange={(n) => setAt(i, { rpe: n })} placeholder="—" /></label>
                    <label className="field">Descanso (s)<NumInput inputMode="numeric" value={s.restSec} onChange={(n) => setAt(i, { restSec: n })} placeholder={String(e.restSec)} /></label>
                    <label className="field dx-note">Nota<input value={s.note ?? ""} maxLength={80} onChange={(ev) => setAt(i, { note: ev.target.value || null })} placeholder="Ej.: subí 2,5 kg, pausa abajo" /></label>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn sm" disabled={plan.length >= 20} onClick={() => setD({ ...d, setPlan: [...plan, { ...(plan[plan.length - 1] ?? blank(e.reps)) }] })}>+ Agregar serie</button>
                <button type="button" className="btn sm" onClick={() => setD({ ...d, technique: "straight", setPlan: presetPlan("straight", { sets: plan.length, reps: e.reps, rir: e.rir, weightKg: numOrNull(ref) }) })}>Volver a series iguales</button>
              </div>
            </>
          )}
        </section>

        <section className="dx-sec"><b>Combinar con otros ejercicios</b>
          <small className="muted">Mismo grupo = se hacen juntos, uno detrás del otro (A1, A2…). Ponele la misma letra a los ejercicios del día que quieras combinar.</small>
          <div className="dx-grid">
            <label className="field">Grupo<select style={sel} value={d.group ?? ""} onChange={(ev) => setD({ ...d, group: ev.target.value || null, groupKind: ev.target.value ? d.groupKind ?? "superset" : null })}>
              <option value="">Sin combinar</option>{GROUP_LETTERS.map((g) => <option key={g} value={g}>Grupo {g}</option>)}</select></label>
            {d.group && <label className="field">Tipo<select style={sel} value={d.groupKind ?? "superset"} onChange={(ev) => setD({ ...d, groupKind: ev.target.value as GroupKind })}>
              {(Object.keys(GROUP_KIND_LABEL) as GroupKind[]).map((k) => <option key={k} value={k}>{GROUP_KIND_LABEL[k]}</option>)}</select></label>}
            {d.group && d.groupKind === "circuit" && <label className="field">Vueltas<input inputMode="numeric" value={d.rounds ?? ""} onChange={(ev) => setD({ ...d, rounds: numOrNull(ev.target.value) })} placeholder="3" /></label>}
          </div>
        </section>

        <section className="dx-sec"><b>Más detalle</b>
          <div className="dx-grid">
            <label className="field">Tempo<input value={d.tempo ?? ""} maxLength={12} onChange={(ev) => setD({ ...d, tempo: ev.target.value || null })} placeholder="3-1-1-0" />
              <small className="muted" style={{ fontWeight: 400 }}>Bajada-pausa-subida-pausa en segundos. X = explosivo.</small></label>
            <label className="field">Variante<input value={d.variant ?? ""} maxLength={60} onChange={(ev) => setD({ ...d, variant: ev.target.value || null })} placeholder="Agarre cerrado, con pausa, rango parcial" /></label>
            <label className="field dx-note">Progresión<input value={d.progression ?? ""} maxLength={120} onChange={(ev) => setD({ ...d, progression: ev.target.value || null })} placeholder="+2,5 kg por semana si completás todas las series" /></label>
          </div>
          <label className="crow" style={{ gap: 8 }}><input type="checkbox" checked={d.unilateral} onChange={(ev) => setD({ ...d, unilateral: ev.target.checked })} />Unilateral (las repeticiones son por lado)</label>
        </section>

        {err && <p className="err-box" role="alert">{err}</p>}
        <div className="mfoot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn pri" onClick={save}>Guardar</button>
        </div>
      </div>
    </Modal>
  );
}
