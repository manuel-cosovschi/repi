"use client";
// Editor de prescripción avanzada (D134), para coaches y entrenadores de sala: técnica (top set, drop set, pirámide…),
// cada serie con su tipo, repeticiones, peso, % del 1RM, RIR o RPE, descanso y nota; combinaciones (A1-A2, circuitos),
// tempo, variante, unilateral y progresión. Lo que no se toca queda como «N series × reps».
// D183: series principales con etapas conectadas (drops, mini series, bloques de cluster). Elegir un método ya no reemplaza
// la programación: se elige a qué series aplicarlo, se ve qué cambia y se confirma; cada cambio se puede deshacer. Cerrar
// con cambios sin guardar pregunta antes (y arrastrar para seleccionar texto no cierra el panel, D179).
import { useMemo, useState, type InputHTMLAttributes } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  DEFAULT_STAGES, GROUP_KIND_LABEL, GROUP_LETTERS, MAX_BLOCKS, MAX_STAGES, SET_KIND_LABEL, STAGE_KINDS, TECHNIQUES, applyMethod, defaultSelection, emptyDetail, flatten,
  isStraightPlan, materialize, newSpecId, normalizePlan, presetPlan, setTarget, setTargetText, stageLabel, structureText, uniformPlan, validateDetail,
  type ExerciseDetail, type GroupKind, type MethodOptions, type PlanRow, type SetKind, type Technique,
} from "@repi/domain";

type Ex = { name: string; sets: number; reps: string; rir: number | null; restSec: number; detail?: ExerciseDetail | null };

/** Resumen de una línea para la fila del constructor: «Drop set · 4 series · 4.ª con drops (2) · A1 · tempo 3-1-1-0». */
export function detailSummary(e: Ex, label?: string | null) {
  const d = e.detail;
  if (!d) return null;
  const straightKg = isStraightPlan(d) && uniformPlan(d.setPlan) ? d.setPlan![0].weightKg : null; // D173: series rectas con peso
  return [d.technique !== "straight" ? TECHNIQUES[d.technique].label : null, label ? `${label}${d.groupKind === "circuit" ? ` (circuito${d.rounds ? ` × ${d.rounds}` : ""})` : ""}` : null,
    d.tempo ? `tempo ${d.tempo}` : null, d.variant, d.unilateral ? "unilateral" : null, d.emomSec ? `cada ${d.emomSec} s` : null,
    straightKg != null ? `${straightKg.toLocaleString("es-AR")} kg en todas las series` : d.setPlan ? structureText(d, e.sets) : null].filter(Boolean).join(" · ");
}

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

/** Métodos que se aplican a series elegidas (EMOM y «personalizada» son del ejercicio entero). */
const PER_SERIES: Technique[] = ["straight", "drop_set", "rest_pause", "myo_reps", "cluster", "top_backoff", "amrap_last", "amrap_time", "pyramid", "reverse_pyramid"];
const STAGE_WORD: Partial<Record<Technique, [string, string]>> = { drop_set: ["drop", "drops"], rest_pause: ["mini serie", "mini series"], myo_reps: ["mini serie", "mini series"], cluster: ["bloque", "bloques"] };
const newStage = (kind: SetKind, main: PlanRow): PlanRow => ({
  kind, reps: kind === "drop" ? "al fallo" : kind === "cluster" ? main.reps : "máx.", weightKg: kind === "drop" ? null : main.weightKg, pct1rm: null, rir: null, rpe: null,
  restSec: kind === "drop" ? 0 : 20, note: null, id: newSpecId(), block: main.block, stage: 1,
});

export function ExerciseDetailEditor({ e, onSave, onClose }: { e: Ex; onSave: (p: { detail: ExerciseDetail | null; sets: number }) => void; onClose: () => void }) {
  const initial = useMemo(() => {
    const d = e.detail ?? emptyDetail();
    return d.setPlan ? { ...d, setPlan: normalizePlan(d.setPlan).rows } : d;
  }, [e.detail]);
  const [d, setD] = useState<ExerciseDetail>(initial);
  const [past, setPast] = useState<ExerciseDetail[]>([]);
  const [ref, setRef] = useState(() => (isStraightPlan(e.detail) && e.detail!.setPlan![0].weightKg != null ? String(e.detail!.setPlan![0].weightKg).replace(".", ",") : ""));
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<{ m: Technique; sel: number[]; o: MethodOptions } | null>(null);
  const base = { sets: e.sets, reps: e.reps, rir: e.rir };
  const plan = d.setPlan;
  const blocks = plan ? materialize(d, base) : null;
  const nBlocks = blocks?.length ?? e.sets;
  const review = plan ? normalizePlan(plan).review : false;
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  // Cada cambio queda en el historial para deshacerlo.
  const change = (next: ExerciseDetail) => { setPast((p) => [...p.slice(-30), d]); setD(next); setErr(null); };
  const undo = () => { const prev = past[past.length - 1]; if (!prev) return; setPast(past.slice(0, -1)); setD(prev); setPending(null); };
  const setBlocks = (bs: PlanRow[][], technique = d.technique) => change({ ...d, technique, setPlan: flatten(bs) });
  const close = () => { if (!dirty || window.confirm("Tenés cambios sin guardar en series y técnica. ¿Descartarlos?")) onClose(); };

  const pick = (m: Technique) => {
    if (m === "custom") { change({ ...d, technique: "custom", setPlan: plan ?? flatten(materialize(d, base)) }); setPending(null); return; }
    setPending({ m, sel: PER_SERIES.includes(m) ? defaultSelection(m, nBlocks) : [], o: { stages: DEFAULT_STAGES[m], durationSec: 600, countUnit: "rounds", emomSec: d.emomSec ?? 60 } });
  };
  const preview = pending ? applyMethod(d, base, pending.m, pending.sel, pending.o) : null;
  // D173: en series rectas, el peso de referencia es el peso de todas las series (se guarda); vacío, vuelven a ser «N × reps».
  const changeRef = (v: string) => {
    setRef(v);
    if (d.technique !== "straight") return;
    const w = numOrNull(v);
    if (plan) change({ ...d, setPlan: plan.map((r) => ({ ...r, weightKg: w != null && Number.isFinite(w) ? w : null })) });
    else change({ ...d, setPlan: presetPlan("straight", { sets: e.sets, reps: e.reps, rir: e.rir, weightKg: w }) });
  };
  // Cambiar una fila sola vuelve «Personalizada» a una técnica de series rectas; si todas siguen iguales, sigue siendo rectas.
  const setRow = (bi: number, si: number, patch: Partial<PlanRow>) => {
    if (!blocks) return;
    const bs = blocks.map((b, i) => (i !== bi ? b : b.map((r, j) => (j === si ? { ...r, ...patch } : r))));
    const flat = flatten(bs);
    setBlocks(bs, d.technique === "straight" && !uniformPlan(flat) ? "custom" : d.technique);
  };
  const addStage = (bi: number) => {
    if (!blocks) return;
    const b = blocks[bi];
    const kind = (b[1]?.kind ?? (b[0].kind === "cluster" ? "cluster" : "drop")) as SetKind;
    setBlocks(blocks.map((x, i) => (i === bi ? [...x, newStage(kind, x[0])] : x)), d.technique === "straight" ? "custom" : d.technique);
  };
  const removeRow = (bi: number, si: number) => {
    if (!blocks) return;
    if (si > 0) return setBlocks(blocks.map((b, i) => (i === bi ? b.filter((_, j) => j !== si) : b)));
    if (blocks.length <= 1) return;
    if (blocks[bi].length > 1 && !window.confirm(`¿Quitar la serie ${bi + 1} con sus ${blocks[bi].length - 1} etapas?`)) return;
    setBlocks(blocks.filter((_, i) => i !== bi));
  };
  const duplicate = (bi: number) => blocks && blocks.length < MAX_BLOCKS && setBlocks([...blocks.slice(0, bi + 1), blocks[bi].map((r) => ({ ...r, id: newSpecId() })), ...blocks.slice(bi + 1)]);
  const move = (bi: number, dir: -1 | 1) => { if (!blocks) return; const a = blocks.slice(); [a[bi], a[bi + dir]] = [a[bi + dir], a[bi]]; setBlocks(a); };
  const perSet = () => change({ ...d, technique: d.technique === "straight" ? "custom" : d.technique, setPlan: flatten(materialize(d, base)) });
  // Clusters cargados antes de D183: el profe dice cómo se hacían (REPI no lo adivina).
  const resolveReview = (asOne: boolean) => {
    if (!plan) return;
    const norm = normalizePlan(plan).rows;
    const out: PlanRow[][] = [];
    norm.forEach((r, i) => {
      const { review, ...x } = r;
      const prev = norm[i - 1];
      if (asOne && review && prev?.review && prev.kind === "cluster" && r.kind === "cluster") out[out.length - 1].push(x as PlanRow);
      else out.push([x as PlanRow]);
    });
    change({ ...d, setPlan: flatten(out) });
  };
  const save = () => {
    const r = validateDetail(d, e.sets);
    if (!r.ok) return setErr(r.error);
    onSave({ detail: r.detail, sets: r.sets });
  };
  const sel = { height: 38, borderRadius: 9, border: "1px solid var(--light-border-strong)", padding: "0 8px", font: "500 14px var(--font-ui)", background: "var(--light-surface)", width: "100%" } as const;
  const target = (i: number) => setTargetText(setTarget({ ...e, detail: d }, i));
  let rowIdx = -1;

  return (
    <Modal label={`Series y técnica · ${e.name}`} onClose={close} wide>
      <div className="dx">
        <div className="mhead"><h2>{e.name} · series y técnica</h2><button type="button" className="x" aria-label="Cerrar" onClick={close}>×</button></div>

        <section className="dx-sec"><b>Método</b>
          <div className="pills">{(Object.keys(TECHNIQUES) as Technique[]).map((t) => (
            <button key={t} type="button" className="pill" aria-pressed={pending ? pending.m === t : d.technique === t} title={TECHNIQUES[t].what} onClick={() => pick(t)}>{TECHNIQUES[t].label}</button>
          ))}</div>
          <small className="muted">{TECHNIQUES[pending?.m ?? d.technique].what}</small>
          {pending && preview && (
            <div className="dx-apply" role="group" aria-label={`Aplicar ${TECHNIQUES[pending.m].label}`}>
              {PER_SERIES.includes(pending.m) && (
                <div className="dx-apply-row"><span className="dx-lbl">¿A qué series?</span>
                  <div className="pills">
                    {Array.from({ length: nBlocks }, (_, i) => (
                      <button key={i} type="button" className="pill" aria-pressed={pending.sel.includes(i)}
                        onClick={() => setPending({ ...pending, sel: pending.sel.includes(i) ? pending.sel.filter((x) => x !== i) : [...pending.sel, i].sort((a, b) => a - b) })}>Serie {i + 1}</button>
                    ))}
                    <button type="button" className="linkbtn" onClick={() => setPending({ ...pending, sel: [nBlocks - 1] })}>Sólo la última</button>
                    <button type="button" className="linkbtn" onClick={() => setPending({ ...pending, sel: Array.from({ length: nBlocks }, (_, i) => i) })}>Todas</button>
                  </div></div>
              )}
              <div className="dx-grid">
                {STAGE_WORD[pending.m] && <label className="field">{pending.m === "cluster" ? "Bloques por serie" : `${STAGE_WORD[pending.m]![1][0].toUpperCase()}${STAGE_WORD[pending.m]![1].slice(1)} por serie`}
                  <NumInput inputMode="numeric" value={pending.o.stages ?? null} onChange={(n) => setPending({ ...pending, o: { ...pending.o, stages: n ?? undefined } })} placeholder={String(DEFAULT_STAGES[pending.m] ?? 2)} /></label>}
                {pending.m === "top_backoff" && pending.sel.length > 1 && <label className="field">Top set<select style={sel} value={pending.o.topBlock ?? Math.min(...pending.sel)} onChange={(ev) => setPending({ ...pending, o: { ...pending.o, topBlock: Number(ev.target.value) } })}>
                  {pending.sel.map((i) => <option key={i} value={i}>Serie {i + 1}</option>)}</select></label>}
                {pending.m === "amrap_time" && <>
                  <label className="field">Duración (min)<NumInput inputMode="decimal" value={pending.o.durationSec != null ? pending.o.durationSec / 60 : null} onChange={(n) => setPending({ ...pending, o: { ...pending.o, durationSec: n == null ? undefined : Math.round(n * 60) } })} placeholder="10" /></label>
                  <label className="field">Se registra<select style={sel} value={pending.o.countUnit ?? "rounds"} onChange={(ev) => setPending({ ...pending, o: { ...pending.o, countUnit: ev.target.value as "reps" | "rounds" } })}>
                    <option value="rounds">Rondas</option><option value="reps">Repeticiones totales</option></select></label></>}
                {pending.m === "emom" && <label className="field">Intervalo (s)<NumInput inputMode="numeric" value={pending.o.emomSec ?? null} onChange={(n) => setPending({ ...pending, o: { ...pending.o, emomSec: n ?? undefined } })} placeholder="60" /></label>}
              </div>
              <div className="dx-preview" role="status">
                <span className="dx-lbl">Qué cambia</span>
                {preview.changes.length ? <ul>{preview.changes.map((c, i) => <li key={i}>{c}</li>)}</ul> : <span className="muted">{PER_SERIES.includes(pending.m) && !pending.sel.length ? "Elegí al menos una serie." : "La programación queda igual; cambia sólo el método."}</span>}
                <small className="muted">Resultado: {structureText(preview.detail, preview.detail.setPlan?.length ?? e.sets)}. Las series que no elegiste no cambian.</small>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn sm pri" disabled={PER_SERIES.includes(pending.m) && !pending.sel.length} onClick={() => { change(preview.detail); setPending(null); }}>Aplicar</button>
                <button type="button" className="btn sm" onClick={() => setPending(null)}>Cancelar</button>
              </div>
            </div>
          )}
          {d.technique === "straight" && !pending && <label className="field" style={{ maxWidth: 260 }}>Peso de referencia (kg, opcional)<input inputMode="decimal" value={ref} onChange={(ev) => changeRef(ev.target.value)} placeholder="Ej.: 100" />
            <small className="muted" style={{ fontWeight: 400 }}>Con series rectas, es el peso de todas las series.</small></label>}
        </section>

        <section className="dx-sec"><div className="dx-set-h"><b>Series</b>
          <small className="muted">{structureText(d, plan?.length ?? e.sets)}</small>
          <button type="button" className="btn sm" style={{ marginLeft: "auto" }} disabled={!past.length} onClick={undo}>Deshacer</button></div>
          {review && (
            <div className="dx-review" role="alert">
              <span>Estos bloques de cluster se cargaron antes de que REPI agrupara etapas y no se sabe cómo se hacían. Quedan como series separadas hasta que lo confirmes.</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn sm" onClick={() => resolveReview(false)}>Cada fila es una serie</button>
                <button type="button" className="btn sm" onClick={() => resolveReview(true)}>Son bloques de una misma serie</button>
              </div>
            </div>
          )}
          {!blocks ? (
            <>
              <span className="muted">{e.sets} series × {e.reps}{e.rir != null ? ` · RIR ${e.rir}` : ""}, todas iguales.</span>
              <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={perSet}>Editar serie por serie</button>
            </>
          ) : (
            <>
              {blocks.map((b, bi) => (
                <div key={b[0].id} className="dx-set dx-block">
                  {b.map((s, si) => { rowIdx++; const i = rowIdx; return (
                    <div key={s.id} className={si ? "dx-stage" : undefined}>
                      <div className="dx-set-h">
                        <b>{si ? stageLabel(s.kind, si) : `Serie ${bi + 1}`}</b><small className="muted">{target(i)}</small>
                        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                          {si === 0 && <>
                            <button type="button" className="ibtn" aria-label={`Subir serie ${bi + 1}`} disabled={bi === 0} onClick={() => move(bi, -1)}>↑</button>
                            <button type="button" className="ibtn" aria-label={`Bajar serie ${bi + 1}`} disabled={bi === blocks.length - 1} onClick={() => move(bi, 1)}>↓</button>
                            <button type="button" className="ibtn" aria-label={`Duplicar serie ${bi + 1}`} title="Duplicar con sus etapas" disabled={blocks.length >= MAX_BLOCKS} onClick={() => duplicate(bi)}>⧉</button>
                          </>}
                          <button type="button" className="ibtn" aria-label={si ? `Quitar ${stageLabel(s.kind, si)} de la serie ${bi + 1}` : `Quitar serie ${bi + 1}`} disabled={si === 0 && blocks.length <= 1} onClick={() => removeRow(bi, si)}>×</button>
                        </span></div>
                      <div className="dx-grid">
                        <label className="field">Tipo<select style={sel} value={s.kind} onChange={(ev) => setRow(bi, si, { kind: ev.target.value as SetKind, ...(ev.target.value === "drop" ? { restSec: 0 } : {}) })}>
                          {(Object.keys(SET_KIND_LABEL) as SetKind[]).filter((k) => !si || STAGE_KINDS.includes(k)).map((k) => <option key={k} value={k}>{si && k === "rest_pause" ? "Mini serie" : si && k === "cluster" ? "Bloque de cluster" : SET_KIND_LABEL[k]}</option>)}</select></label>
                        <label className="field">Reps<input value={s.reps} maxLength={20} onChange={(ev) => setRow(bi, si, { reps: ev.target.value })} placeholder="8-10, AMRAP, 40 s" /></label>
                        <label className="field">Peso (kg)<NumInput inputMode="decimal" value={s.weightKg} onChange={(n) => setRow(bi, si, { weightKg: n })} placeholder={si && s.kind === "drop" ? "Lo elige" : "—"} /></label>
                        {si === 0 && <label className="field">% 1RM<NumInput inputMode="decimal" value={s.pct1rm} onChange={(n) => setRow(bi, si, { pct1rm: n })} placeholder="—" /></label>}
                        <label className="field">RIR<NumInput inputMode="numeric" value={s.rir} onChange={(n) => setRow(bi, si, { rir: n })} placeholder="—" /></label>
                        {si === 0 && <label className="field">RPE<NumInput inputMode="decimal" value={s.rpe} onChange={(n) => setRow(bi, si, { rpe: n })} placeholder="—" /></label>}
                        <label className="field">{si ? "Pausa antes (s)" : "Descanso (s)"}<NumInput inputMode="numeric" value={s.restSec} onChange={(n) => setRow(bi, si, { restSec: n })} placeholder={si ? "0" : String(e.restSec)} /></label>
                        {s.kind === "amrap" && si === 0 && <label className="field">Por tiempo (min)<NumInput inputMode="decimal" value={s.durationSec ? s.durationSec / 60 : null} onChange={(n) => setRow(bi, si, n ? { durationSec: Math.round(n * 60), countUnit: s.countUnit ?? "rounds" } : { durationSec: null, countUnit: null })} placeholder="—" /></label>}
                        <label className="field dx-note">Nota<input value={s.note ?? ""} maxLength={80} onChange={(ev) => setRow(bi, si, { note: ev.target.value || null })} placeholder="Ej.: subí 2,5 kg, pausa abajo" /></label>
                      </div>
                    </div>
                  ); })}
                  <button type="button" className="linkbtn dx-add-stage" disabled={b.length - 1 >= MAX_STAGES} onClick={() => addStage(bi)}>+ Etapa conectada a la serie {bi + 1}</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn sm" disabled={blocks.length >= MAX_BLOCKS} onClick={() => setBlocks([...blocks, [{ ...blocks[blocks.length - 1][0], id: newSpecId() }]])}>+ Agregar serie</button>
              </div>
            </>
          )}
        </section>

        <section className="dx-sec"><b>Combinar con otros ejercicios</b>
          <small className="muted">Mismo grupo = se hacen juntos, uno detrás del otro (A1, A2…). Ponele la misma letra a los ejercicios del día que quieras combinar.</small>
          <div className="dx-grid">
            <label className="field">Grupo<select style={sel} value={d.group ?? ""} onChange={(ev) => change({ ...d, group: ev.target.value || null, groupKind: ev.target.value ? d.groupKind ?? "superset" : null })}>
              <option value="">Sin combinar</option>{GROUP_LETTERS.map((g) => <option key={g} value={g}>Grupo {g}</option>)}</select></label>
            {d.group && <label className="field">Tipo<select style={sel} value={d.groupKind ?? "superset"} onChange={(ev) => change({ ...d, groupKind: ev.target.value as GroupKind })}>
              {(Object.keys(GROUP_KIND_LABEL) as GroupKind[]).map((k) => <option key={k} value={k}>{GROUP_KIND_LABEL[k]}</option>)}</select></label>}
            {d.group && d.groupKind === "circuit" && <label className="field">Vueltas<NumInput inputMode="numeric" value={d.rounds ?? null} onChange={(n) => change({ ...d, rounds: n })} placeholder="3" /></label>}
          </div>
          {d.group && d.groupKind === "circuit" && <small className="muted">Cada vuelta es una serie de cada ejercicio del grupo. Al guardar, todos los ejercicios del circuito quedan con {d.rounds ?? "esa cantidad de"} series (te preguntamos antes de quitar alguna).</small>}
        </section>

        <section className="dx-sec"><b>Más detalle</b>
          <div className="dx-grid">
            <label className="field">Tempo<input value={d.tempo ?? ""} maxLength={12} onChange={(ev) => change({ ...d, tempo: ev.target.value || null })} placeholder="3-1-1-0" />
              <small className="muted" style={{ fontWeight: 400 }}>Bajada-pausa-subida-pausa en segundos. X = explosivo.</small></label>
            <label className="field">Variante<input value={d.variant ?? ""} maxLength={60} onChange={(ev) => change({ ...d, variant: ev.target.value || null })} placeholder="Agarre cerrado, con pausa, rango parcial" /></label>
            <label className="field dx-note">Progresión<input value={d.progression ?? ""} maxLength={120} onChange={(ev) => change({ ...d, progression: ev.target.value || null })} placeholder="+2,5 kg por semana si completás todas las series" /></label>
          </div>
          <label className="crow" style={{ gap: 8 }}><input type="checkbox" checked={d.unilateral} onChange={(ev) => change({ ...d, unilateral: ev.target.checked })} />Unilateral (las repeticiones son por lado)</label>
        </section>

        {err && <p className="err-box" role="alert">{err}</p>}
        <div className="mfoot">
          <button type="button" className="btn" onClick={close}>Cancelar</button>
          <button type="button" className="btn pri" disabled={!!pending} title={pending ? "Aplicá o cancelá el método antes de guardar." : undefined} onClick={save}>Guardar</button>
        </div>
      </div>
    </Modal>
  );
}
