"use client";
// Editor de prescripción avanzada (D134), para coaches y entrenadores de sala: técnica (top set, drop set, pirámide…),
// cada serie con su tipo, repeticiones, peso, % del 1RM, RIR o RPE, descanso y nota; combinaciones (A1-A2, circuitos),
// tempo, variante, unilateral y progresión. Lo que no se toca queda como «N series × reps».
// D183: series principales con etapas conectadas (drops, mini series, bloques de cluster). Elegir un método ya no reemplaza
// la programación: se elige a qué series aplicarlo, se ve qué cambia y se confirma; cada cambio se puede deshacer. Cerrar
// con cambios sin guardar pregunta antes (y arrastrar para seleccionar texto no cierra el panel, D179).
// D192 (pedido de Urko): sin perder esas protecciones, el método se elige y se ajusta en el mismo paso. La vista previa es una
// tabla con todas las series editables (tipo, repeticiones, peso, RIR, descanso) y una herramienta para distribuir cargas
// (fijo o porcentaje, siempre a pedido y con vista previa); «Aplicar» lo confirma todo junto y «Deshacer» lo revierte. Los
// tipos admiten un nombre propio (Load Set o los del profe) sin cambiar cómo funciona la serie.
// Ejercicios por tiempo (07/11/2026): una actividad (cinta, bici, remo…) no tiene técnica, series serie por serie, tempo, saltos de
// carga ni «unilateral»: los editores no abren este panel para ella. Si igual llega una, sólo quedan la combinación y el detalle
// que conserva (variante y progresión), y al guardar se valida la duración con la actividad.
import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  DEFAULT_STAGES, EQUIPMENT, activityOf, GROUP_KIND_LABEL, loadIncrement, GROUP_LETTERS, MAX_BLOCKS, MAX_STAGES, TECHNIQUES, applyMethod, defaultSelection, emptyDetail, flatten,
  isStraightPlan, kgTo, localizeWeights, materialize, newSpecId, normalizePlan, presetPlan, rowKindName, setMainLoads, setTarget, setTargetText, structureText, toKg, uniformPlan, validateDetail,
  type Equipment, type ExerciseDetail, type GroupKind, type MethodOptions, type PlanRow, type SetKind, type Technique, type WeightUnit,
} from "@repi/domain";
import { SetTable, pickPatch, type Structural } from "./SetTable";
import { LoadDistributor } from "./LoadDistributor";
import { NewSetTypeForm, SetTypesManager, useSetTypes, type SetTypeRow, type SetTypesApi } from "./SetTypes";

type Ex = { name: string; sets: number; reps: string; rir: number | null; restSec: number; detail?: ExerciseDetail | null };

/** Resumen de una línea para la fila del constructor: «Drop set · 4 series · 4.ª con drops (2) · A1 · tempo 3-1-1-0». */
export function detailSummary(e: Ex, label?: string | null) {
  const d = e.detail;
  if (!d) return null;
  const straightKg = isStraightPlan(d) && uniformPlan(d.setPlan) ? d.setPlan![0].weightKg : null; // D173: series rectas con peso
  return [d.technique !== "straight" ? TECHNIQUES[d.technique].label : null, label ? `${label}${d.groupKind === "circuit" ? ` (circuito${d.rounds ? ` × ${d.rounds}` : ""})` : ""}` : null,
    d.tempo ? `tempo ${d.tempo}` : null, d.variant, d.load && loadIncrement(d) != null ? `${EQUIPMENT[d.load.equipment].toLowerCase()}, salto ${loadIncrement(d)!.toLocaleString("es-AR")} kg` : null, d.unilateral ? "unilateral" : null, d.emomSec ? `cada ${d.emomSec} s` : null,
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

/** D192: unidad con la que el profe escribe los pesos en el editor (sólo presentación: se guarda en kg). */
const UNIT_KEY = "repi:editor-unit";
const readUnit = (): WeightUnit => { try { return localStorage.getItem(UNIT_KEY) === "lb" ? "lb" : "kg"; } catch { return "kg"; } };

type Pending = { m: Technique; sel: number[]; o: MethodOptions; edits: Record<string, Partial<PlanRow>> };
const EDIT_KEYS: [keyof PlanRow, string][] = [["reps", "repeticiones"], ["weightKg", "peso"], ["rir", "RIR"], ["restSec", "descanso"]];
const valTxt = (k: keyof PlanRow, v: unknown) => (v == null || v === "" ? "—" : k === "weightKg" ? `${String(v).replace(".", ",")} kg` : k === "restSec" ? `${v} s` : String(v));
/** Lo que el profe cambió a mano en la vista previa (además de lo que cambia el método), para revisarlo antes de aplicar. */
function editDiff(before: PlanRow[], after: PlanRow[]) {
  const out: string[] = [];
  const blocks = materialize({ ...emptyDetail(), setPlan: after }, { sets: after.length, reps: "", rir: null });
  blocks.forEach((b, bi) => b.forEach((r, si) => {
    const o = before.find((x) => x.id === r.id);
    if (!o) return;
    const name = si ? `Serie ${bi + 1}, ${rowKindName(r).toLowerCase()} ${si}` : `Serie ${bi + 1}`;
    if ((o.label ?? null) !== (r.label ?? null) || o.kind !== r.kind) out.push(`${name}: pasa a ${rowKindName(r)}.`);
    for (const [k, w] of EDIT_KEYS) if ((o[k] ?? null) !== (r[k] ?? null)) out.push(`${name}: ${w} ${valTxt(k, o[k])} → ${valTxt(k, r[k])}.`);
  }));
  return out;
}

/**
 * D184: el mismo editor en la app del alumno (`member`: modal oscuro desde abajo, con los tokens del alumno).
 * D192: `types` = biblioteca de tipos propios del profe (coach o sede); sin ella sólo están los tipos de REPI y Load Set.
 */
export function ExerciseDetailEditor({ e, onSave, onClose, member = false, types: typesApi = null }: {
  e: Ex; onSave: (p: { detail: ExerciseDetail | null; sets: number }) => void; onClose: () => void; member?: boolean; types?: SetTypesApi | null;
}) {
  const initial = useMemo(() => {
    const d = e.detail ?? emptyDetail();
    return d.setPlan ? { ...d, setPlan: normalizePlan(d.setPlan).rows } : d;
  }, [e.detail]);
  const [d, setD] = useState<ExerciseDetail>(initial);
  const [past, setPast] = useState<ExerciseDetail[]>([]);
  const [unit, setUnitState] = useState<WeightUnit>("kg");
  useEffect(() => setUnitState(readUnit()), []);
  const setUnit = (u: WeightUnit) => { setUnitState(u); try { localStorage.setItem(UNIT_KEY, u); } catch { /* sin almacenamiento: sólo esta vez */ } };
  const [ref, setRef] = useState<number | null>(() => (isStraightPlan(e.detail) && e.detail!.setPlan![0].weightKg != null ? e.detail!.setPlan![0].weightKg : null));
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dist, setDist] = useState(false); // distribuir cargas (en la tabla o dentro del método elegido)
  const [newType, setNewType] = useState<{ bi: number; si: number; where: "plan" | "pending" } | null>(null);
  const [manage, setManage] = useState(false);
  const types = useSetTypes(member ? null : typesApi);
  const typeList: SetTypeRow[] = types?.list ?? [];
  const base = { sets: e.sets, reps: e.reps, rir: e.rir };
  const plan = d.setPlan;
  const blocks = plan ? materialize(d, base) : null;
  const nBlocks = blocks?.length ?? e.sets;
  const review = plan ? normalizePlan(plan).review : false;
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const inc = loadIncrement(d);
  const act = activityOf(d); // actividad: sin método, series, tempo, equipo ni «unilateral»

  // Cada cambio queda en el historial para deshacerlo. D192: lo que se tipea seguido en un mismo campo («4», «47», «47,5») es
  // un solo paso de «Deshacer», no uno por tecla.
  const lastEdit = useRef<{ key: string; at: number } | null>(null);
  const change = (next: ExerciseDetail, key?: string) => {
    const now = Date.now(), same = !!key && lastEdit.current?.key === key && now - lastEdit.current.at < 2500;
    lastEdit.current = key ? { key, at: now } : null;
    if (!same) setPast((p) => [...p.slice(-30), d]);
    setD(next); setErr(null);
  };
  const undo = () => { const prev = past[past.length - 1]; if (!prev) return; setPast(past.slice(0, -1)); setD(prev); setPending(null); setDist(false); };
  const setBlocks = (bs: PlanRow[][], technique = d.technique, key?: string) => change({ ...d, technique, setPlan: flatten(bs) }, key);
  const close = () => { if ((!dirty && !pending) || window.confirm("Tenés cambios sin guardar en series y técnica. ¿Descartarlos?")) onClose(); };

  const pick = (m: Technique) => {
    setDist(false); setNewType(null);
    if (m === "custom") { change({ ...d, technique: "custom", setPlan: plan ?? flatten(materialize(d, base)) }); setPending(null); return; }
    setPending({ m, sel: PER_SERIES.includes(m) ? defaultSelection(m, nBlocks) : [], o: { stages: DEFAULT_STAGES[m], durationSec: 600, countUnit: "rounds", emomSec: d.emomSec ?? 60 }, edits: {} });
  };
  // El método se calcula una vez por selección y opciones: así lo que el profe edita en la vista previa conserva su fila.
  const applied = useMemo(() => (pending ? applyMethod(d, base, pending.m, pending.sel, pending.o) : null), // eslint-disable-line react-hooks/exhaustive-deps
    [d, pending?.m, pending?.sel, pending?.o, e.sets, e.reps, e.rir]);
  const preview = useMemo(() => {
    if (!pending || !applied) return null;
    const rows = (applied.detail.setPlan ?? []).map((r) => ({ ...r, ...(pending.edits[r.id!] ?? {}) })) as PlanRow[];
    const detail: ExerciseDetail = { ...applied.detail, setPlan: rows.length ? rows : applied.detail.setPlan };
    return { detail, changes: [...applied.changes, ...editDiff((applied.detail.setPlan ?? []) as PlanRow[], rows)], blocks: materialize(detail, base) };
  }, [applied, pending?.edits]); // eslint-disable-line react-hooks/exhaustive-deps
  const editPending = (bi: number, si: number, patch: Partial<PlanRow>) => {
    if (!pending || !preview) return;
    const id = preview.blocks[bi]?.[si]?.id;
    if (id) setPending({ ...pending, edits: { ...pending.edits, [id]: { ...pending.edits[id], ...patch } } });
  };
  // D173: en series rectas, el peso de referencia es el peso de todas las series (se guarda); vacío, vuelven a ser «N × reps».
  const changeRef = (w: number | null) => {
    setRef(w);
    if (d.technique !== "straight") return;
    if (plan) change({ ...d, setPlan: plan.map((r) => ({ ...r, weightKg: w })) });
    else change({ ...d, setPlan: presetPlan("straight", { sets: e.sets, reps: e.reps, rir: e.rir, weightKg: w }) });
  };
  // Cambiar una fila sola vuelve «Personalizada» a una técnica de series rectas; si todas siguen iguales, sigue siendo rectas.
  const setRow = (bi: number, si: number, patch: Partial<PlanRow>) => {
    if (!blocks) return;
    const bs = blocks.map((b, i) => (i !== bi ? b : b.map((r, j) => (j === si ? { ...r, ...patch } : r))));
    const flat = flatten(bs);
    setBlocks(bs, d.technique === "straight" && !uniformPlan(flat) ? "custom" : d.technique, `${blocks[bi][si]?.id}:${Object.keys(patch).sort().join(",")}`);
  };
  const toCustom = () => (d.technique === "straight" ? "custom" : d.technique);
  const structural: Structural | null = blocks ? {
    canAddBlock: blocks.length < MAX_BLOCKS,
    canAddStage: (bi) => blocks[bi].length - 1 < MAX_STAGES,
    addStage: (bi) => {
      const b = blocks[bi];
      const kind = (b[1]?.kind ?? (b[0].kind === "cluster" ? "cluster" : "drop")) as SetKind;
      setBlocks(blocks.map((x, i) => (i === bi ? [...x, newStage(kind, x[0])] : x)), toCustom());
    },
    remove: (bi, si) => {
      if (si > 0) return setBlocks(blocks.map((b, i) => (i === bi ? b.filter((_, j) => j !== si) : b)));
      if (blocks.length <= 1) return;
      if (blocks[bi].length > 1 && !window.confirm(`¿Quitar la serie ${bi + 1} con sus ${blocks[bi].length - 1} etapas?`)) return;
      setBlocks(blocks.filter((_, i) => i !== bi));
    },
    duplicate: (bi) => { if (blocks.length < MAX_BLOCKS) setBlocks([...blocks.slice(0, bi + 1), blocks[bi].map((r) => ({ ...r, id: newSpecId() })), ...blocks.slice(bi + 1)]); },
    // D192: una serie nueva justo después (por ejemplo, el Load Set después del top set): sin carga ni etiqueta heredadas.
    insertAfter: (bi) => {
      if (blocks.length >= MAX_BLOCKS) return;
      const m = blocks[bi][0];
      const row: PlanRow = { kind: "work", reps: m.reps, weightKg: null, pct1rm: null, rir: m.rir, rpe: null, restSec: m.restSec, note: null, id: newSpecId(), block: bi + 1, stage: 0 };
      setBlocks([...blocks.slice(0, bi + 1), [row], ...blocks.slice(bi + 1)], toCustom());
    },
    move: (bi, dir) => { const a = blocks.slice(); [a[bi], a[bi + dir]] = [a[bi + dir], a[bi]]; setBlocks(a); },
  } : null;
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
    const r = validateDetail(d, e.sets, e.reps);
    if (!r.ok) return setErr(r.error);
    onSave({ detail: r.detail, sets: r.sets });
  };
  const sel = { minHeight: 38, borderRadius: 9, border: "1px solid var(--ui-control-border)", padding: "0 8px", font: "500 14px var(--font-ui)", background: "var(--ui-input-bg)", color: "var(--ui-text)", width: "100%" } as const;
  const target = (i: number) => localizeWeights(setTargetText(setTarget({ ...e, detail: d }, i)), unit);
  const workBlocks = (bs: PlanRow[][]) => bs.map((b, i) => (b[0].kind === "warmup" ? -1 : i)).filter((i) => i >= 0);
  const typeCreated = (t: SetTypeRow) => {
    if (!newType) return;
    const p = { kind: t.kind, label: t.name, typeId: t.id, defaults: t.defaults };
    if (newType.where === "pending" && preview) { const row = preview.blocks[newType.bi]?.[newType.si]; if (row) editPending(newType.bi, newType.si, pickPatch(row, p)); }
    else if (blocks) { const row = blocks[newType.bi]?.[newType.si]; if (row) setRow(newType.bi, newType.si, pickPatch(row, p)); }
    setNewType(null);
  };
  const canCreate = !!types?.available && !member;

  return (
    <Modal label={`${act ? "Combinar y detalle" : "Series y técnica"} · ${e.name}`} onClose={close} wide className={member ? "dx-host" : undefined}>
      <div className="dx">
        <div className="mhead"><h2>{e.name} · {act ? "combinar y detalle" : "series y técnica"}</h2>
          {!act && <span className="dx-unit" role="group" aria-label="Unidad de peso">
            {(["kg", "lb"] as WeightUnit[]).map((u) => <button key={u} type="button" className="pill" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u}</button>)}
          </span>}
          <button type="button" className="x" aria-label="Cerrar" onClick={close}>×</button></div>

        {!act && <section className="dx-sec"><b>Método</b>
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
              {/* D192: todas las series del resultado, editables acá mismo (sin confirmar y volver a buscar cada serie). */}
              <div className="dx-set-h"><span className="dx-lbl">Así quedan las series</span><small className="muted">Las marcadas son las que cambia el método. Podés ajustar pesos, repeticiones, RIR, descanso y tipo antes de aplicar.</small>
                <button type="button" className="btn sm" style={{ marginLeft: "auto" }} aria-expanded={dist} onClick={() => setDist(!dist)}>Distribuir cargas</button></div>
              {dist && <LoadDistributor blocks={preview.blocks} unit={unit} incrementKg={inc} initialSel={PER_SERIES.includes(pending.m) && pending.sel.length > 1 ? pending.sel : workBlocks(preview.blocks)}
                onCancel={() => setDist(false)}
                onUse={(bs, kg) => { const edits = { ...pending.edits }; bs.forEach((bi, k) => { const id = preview.blocks[bi]?.[0]?.id; if (id) edits[id] = { ...edits[id], weightKg: kg[k] }; }); setPending({ ...pending, edits }); setDist(false); }} />}
              <SetTable caption={`Vista previa de ${TECHNIQUES[pending.m].label}`} blocks={preview.blocks} unit={unit} exRest={e.restSec} types={typeList} canCreateType={canCreate}
                onCreateType={(bi, si) => setNewType({ bi, si, where: "pending" })} onRow={editPending} highlight={new Set(PER_SERIES.includes(pending.m) ? pending.sel : [])}
                changed={new Set(Object.keys(pending.edits))} />
              {newType?.where === "pending" && types && <NewSetTypeForm types={types} stage={newType.si > 0} onCreated={typeCreated} onCancel={() => setNewType(null)} />}
              <div className="dx-preview" role="status">
                <span className="dx-lbl">Qué cambia</span>
                {preview.changes.length ? <ul>{preview.changes.map((c, i) => <li key={i}>{localizeWeights(c, unit)}</li>)}</ul> : <span className="muted">{PER_SERIES.includes(pending.m) && !pending.sel.length ? "Elegí al menos una serie." : "La programación queda igual; cambia sólo el método."}</span>}
                <small className="muted">Resultado: {structureText(preview.detail, preview.detail.setPlan?.length ?? e.sets)}. Las series que no elegiste no cambian. Se aplica todo junto y se puede deshacer.</small>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn sm pri" disabled={PER_SERIES.includes(pending.m) && !pending.sel.length} onClick={() => { change(preview.detail); setPending(null); setDist(false); setNewType(null); }}>Aplicar</button>
                <button type="button" className="btn sm" onClick={() => { setPending(null); setDist(false); setNewType(null); }}>Cancelar</button>
              </div>
            </div>
          )}
          {d.technique === "straight" && !pending && <label className="field" style={{ maxWidth: 260 }}>Peso de referencia ({unit}, opcional)<NumInput inputMode="decimal" value={ref == null ? null : kgTo(ref, unit)} onChange={(n) => changeRef(n == null ? null : toKg(n, unit))} placeholder="Ej.: 100" />
            <small className="muted" style={{ fontWeight: 400 }}>Con series rectas, es el peso de todas las series.</small></label>}
        </section>}

        {!pending && !act && <section className="dx-sec"><div className="dx-set-h"><b>Series</b>
          <small className="muted">{structureText(d, plan?.length ?? e.sets)}</small>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn sm" aria-expanded={dist} onClick={() => setDist(!dist)}>Distribuir cargas</button>
            <button type="button" className="btn sm" disabled={!past.length} onClick={undo}>Deshacer</button>
          </span></div>
          {review && (
            <div className="dx-review" role="alert">
              <span>Estos bloques de cluster se cargaron antes de que REPI agrupara etapas y no se sabe cómo se hacían. Quedan como series separadas hasta que lo confirmes.</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn sm" onClick={() => resolveReview(false)}>Cada fila es una serie</button>
                <button type="button" className="btn sm" onClick={() => resolveReview(true)}>Son bloques de una misma serie</button>
              </div>
            </div>
          )}
          {dist && <LoadDistributor blocks={blocks ?? materialize(d, base)} unit={unit} incrementKg={inc} initialSel={workBlocks(blocks ?? materialize(d, base))} onCancel={() => setDist(false)}
            onUse={(bs, kg) => { change(setMainLoads(d, base, bs, kg).detail); setDist(false); }} />}
          {!blocks ? (
            <>
              <span className="muted">{e.sets} series × {e.reps}{e.rir != null ? ` · RIR ${e.rir}` : ""}, todas iguales.</span>
              <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={perSet}>Editar serie por serie</button>
            </>
          ) : (
            <>
              <SetTable caption={`Series de ${e.name}`} blocks={blocks} unit={unit} exRest={e.restSec} types={typeList} canCreateType={canCreate}
                onCreateType={(bi, si) => setNewType({ bi, si, where: "plan" })} onRow={setRow} structural={structural} rowText={target} />
              {newType?.where === "plan" && types && <NewSetTypeForm types={types} stage={newType.si > 0} onCreated={typeCreated} onCancel={() => setNewType(null)} />}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" className="btn sm" disabled={blocks.length >= MAX_BLOCKS} onClick={() => setBlocks([...blocks, [{ ...blocks[blocks.length - 1][0], id: newSpecId() }]])}>+ Agregar serie</button>
                {canCreate && <button type="button" className="linkbtn" aria-expanded={manage} onClick={() => setManage(!manage)}>Mis tipos de serie</button>}
              </div>
              {manage && types && <SetTypesManager types={types} onClose={() => setManage(false)} />}
            </>
          )}
        </section>}

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
            {!act && <label className="field">Tempo<input value={d.tempo ?? ""} maxLength={12} onChange={(ev) => change({ ...d, tempo: ev.target.value || null })} placeholder="3-1-1-0" />
              <small className="muted" style={{ fontWeight: 400 }}>Bajada-pausa-subida-pausa en segundos. X = explosivo.</small></label>}
            <label className="field">Variante<input value={d.variant ?? ""} maxLength={60} onChange={(ev) => change({ ...d, variant: ev.target.value || null })} placeholder="Agarre cerrado, con pausa, rango parcial" /></label>
            <label className="field dx-note">Progresión<input value={d.progression ?? ""} maxLength={120} onChange={(ev) => change({ ...d, progression: ev.target.value || null })} placeholder={act ? "+1 minuto por semana" : "+2,5 kg por semana si completás todas las series"} /></label>
          </div>
          {!act && <label className="crow" style={{ gap: 8 }}><input type="checkbox" checked={d.unilateral} onChange={(ev) => change({ ...d, unilateral: ev.target.checked })} />Unilateral (las repeticiones son por lado)</label>}
        </section>

        {/* D191: con el menor salto real del equipo, REPI propone cargas que se pueden armar; sin él, son una referencia a ajustar. */}
        {!act && <section className="dx-sec" aria-label="Equipo y saltos de carga"><b>Equipo y saltos de carga</b>
          <small className="muted">Opcional. El menor salto de carga con el que se arma este ejercicio (por ejemplo, mancuernas de 2 en 2 kg o discos de 1,25 kg por lado). REPI ajusta sus propuestas a ese salto; sin él, la carga propuesta es una referencia.</small>
          <div className="dx-grid">
            <label className="field">Equipo<select style={sel} value={d.load?.equipment ?? ""} onChange={(ev) => change({ ...d, load: ev.target.value ? { equipment: ev.target.value as Equipment, incrementKg: d.load?.incrementKg ?? (null as unknown as number), perSide: d.load?.perSide } : null })}>
              <option value="">Sin indicar</option>{(Object.keys(EQUIPMENT) as Equipment[]).map((k) => <option key={k} value={k}>{EQUIPMENT[k]}</option>)}</select></label>
            {d.load && <label className="field">Menor salto (kg)<NumInput inputMode="decimal" value={d.load.incrementKg ?? null} onChange={(n) => change({ ...d, load: { ...d.load!, incrementKg: n as number } })} placeholder={d.load.equipment === "dumbbell" ? "2" : d.load.equipment === "barbell" ? "1,25" : "5"} /></label>}
          </div>
          {d.load && (d.load.equipment === "barbell" || d.load.equipment === "plate_loaded") && <label className="crow" style={{ gap: 8 }}><input type="checkbox" checked={!!d.load.perSide} onChange={(ev) => change({ ...d, load: { ...d.load!, perSide: ev.target.checked } })} />El salto es por lado (se carga igual de los dos lados)</label>}
          {d.load && loadIncrement(d) != null && <small className="muted">Salto total: {loadIncrement(d)!.toLocaleString("es-AR")} kg.</small>}
        </section>}

        {err && <p className="err-box" role="alert">{err}</p>}
        <div className="mfoot">
          <button type="button" className="btn" onClick={close}>Cancelar</button>
          <button type="button" className="btn pri" disabled={!!pending} title={pending ? "Aplicá o cancelá el método antes de guardar." : undefined} onClick={save}>Guardar</button>
        </div>
      </div>
    </Modal>
  );
}
