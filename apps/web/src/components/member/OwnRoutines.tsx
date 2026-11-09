"use client";
// D158: «Mis rutinas». Para quien entrena con su propia rutina (tenga o no programa asignado): la arma con ejercicios de la
// biblioteca, la guarda y la entrena cuando quiere. En el entrenamiento registra pesos, repeticiones, RIR, cómo se sintió
// cada serie y sus notas, y al terminar el esfuerzo de la sesión y lo que pensó. La primera vez usa el peso que puso acá;
// después manda su última marca y la sugerencia de REPI.
// D162: también se cargan desde una foto, una captura, un PDF, una planilla o texto (un día por rutina). Se ordenan como los
// días de un programa y «Te toca hoy» marca la siguiente a la última que entrenó; en Inicio aparece igual.
// D184: cada ejercicio puede llevar un método (drop set, rest-pause, myo-reps, cluster, top set + back-off, AMRAP, EMOM,
// pirámide) y combinarse en superserie o circuito, con el mismo editor y las mismas reglas que el programa del coach.
// Ejercicios por tiempo (07/11/2026): una actividad (cinta, bici, remo, elíptico, escaladora, sólo duración) se configura con los
// mismos campos que en el constructor del coach (ActivityFields): una cinta, sólo duración en minutos, velocidad e inclinación.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Play, Plus } from "@phosphor-icons/react";
import {
  EXERCISE_GROUPS, METRICS_PROFILE_HINT, METRICS_PROFILE_LABEL, activityOf, guessExerciseGroup, guessExerciseKind, guessMetricsProfile, isActivityProfile, kindOfProfile, matchesExerciseQuery,
  cleanDecimalDraft, groupLabels, isStraightPlan, kgTo, mainSets, parseReps, parseWeightIn, parseWeightKeeping, prescriptionText, repsText, syncCircuit, circuitIssues, resizeBlocks,
  type ExerciseDetail, type MetricsProfile, type WeightUnit,
} from "@repi/domain";
import { ExerciseDetailEditor, detailSummary } from "@/components/coach/ExerciseDetailEditor";
import { ActivityFields, editorProfile, rowDefaults } from "@/components/coach/ActivityFields";
import { api } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { Skel, SkelCard } from "@/components/motion/Skeleton";
import { RepiAsk } from "@/components/brain/RepiAsk";
import { Ic } from "@/components/ui/Ic";
import { RoutineImportSheet } from "./RoutineImport";
import { IntInput } from "@/components/ui/IntInput";
import { Sheet } from "./Sheet";
import { kg } from "./types";
import { useUnit } from "./units";

/** `profile`: perfil resuelto por el servidor (guardado → catálogo → nombre → tipo); una app con la API anterior no lo trae. */
export type Lib = { id: string; name: string; group: string; kind: "load_reps" | "bodyweight" | "time"; mine?: boolean; profile?: string | null };
/** Qué se configura en un ejercicio nuevo (los tres primeros, como se decía antes; las actividades, con su nombre). */
const PROFILE_CHIPS: [MetricsProfile, string][] = [
  ["strength", "Con peso"], ["bodyweight", "Peso corporal"], ["hold", "Segundos"],
  ["treadmill", METRICS_PROFILE_LABEL.treadmill], ["bike", METRICS_PROFILE_LABEL.bike], ["rower", METRICS_PROFILE_LABEL.rower],
  ["elliptical", METRICS_PROFILE_LABEL.elliptical], ["stair", METRICS_PROFILE_LABEL.stair], ["duration", METRICS_PROFILE_LABEL.duration],
];
type Ex = { exerciseId: string; sets: number; reps: string; weightKg: number | null; restSec: number | null; note: string | null; detail?: ExerciseDetail | null };
type Saved = { id: string; name: string; lastUsedAt: string | null; next?: boolean; imported?: boolean; exercises: (Ex & { name: string; group: string; kind: Lib["kind"]; prev: { weightKg: number | null; reps: number | null } | null })[] };
type Row = Ex & { key: string; name: string; group: string; kind: Lib["kind"]; w: string; profile: MetricsProfile };

const MAX_EX = 12;
const defaultReps = (k: Lib["kind"]) => (k === "time" ? "30 s" : k === "bodyweight" ? "12" : "10");
const secsOf = (reps: string) => { const t = parseReps(reps); return t.kind === "time" ? t.seconds : 0; };
/** Perfil de una fila guardada: la actividad indicada; si no, el del ejercicio (catálogo, nombre, tipo y grupo). */
const savedProfile = (e: { name: string; kind: string; group: string; detail?: ExerciseDetail | null }) => editorProfile(e, { kind: e.kind, group: e.group });
const fmtDate = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(iso));
/** Cómo se lee cada ejercicio en la tarjeta: «10 min · 5 km/h · incl. 3» (actividad), «20 min» (cardio anterior) o «3×10». */
function cardText(e: Saved["exercises"][number]) {
  if (activityOf(e.detail)) return prescriptionText({ ...e, rir: null });
  const sets = mainSets(e.detail, e.sets);
  return isActivityProfile(savedProfile(e)) && sets === 1 ? repsText(e.reps) : `${sets}×${repsText(e.reps)}`;
}
const wTxt = (w: number | null, unit: WeightUnit) => (w == null ? "" : String(kgTo(w, unit)).replace(".", ","));

export function OwnRoutines({ offline, flash, onStart, busyOpen }: { offline: boolean; flash: (m: string) => void; onStart: (id: string) => void; busyOpen: boolean }) {
  // M06: /api/me/routines compartido con «Te toca hoy» por la caché en memoria (un solo pedido, al instante al volver).
  const c = useCached<Saved[]>("/api/me/routines");
  const list = c.data ?? (c.err ? [] : null);
  const [edit, setEdit] = useState<Saved | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [dup, setDup] = useState<string | null>(null); // FSA1: un doble toque en «Duplicar» no crea dos copias
  const unit = useUnit();
  const load = c.reload;
  const open = (r: Saved | "new") => { if (offline) { flash("Necesitás conexión para armar o editar tus rutinas."); return; } setEdit(r); };
  const upload = () => { if (offline) { flash("Necesitás conexión para subir tu rutina."); return; } setImporting(true); };
  return (
    <section className="or" aria-labelledby="or-h">
      <div className="or-head">
        <h2 id="or-h">Mis rutinas</h2>
        {!!list?.length && <span className="or-head-acts">
          <button type="button" className="linkbtn" onClick={upload}>Subir</button>
          <button type="button" className="linkbtn" onClick={() => open("new")}><Ic i={Plus} size={16} /> Nueva</button>
        </span>}
      </div>
      {!list && <SkelCard h={150} lines={3} />}
      {list && !list.length && (
        <div className="dashed-card">
          <strong>¿Tenés tu propia rutina?</strong>
          <span>Cargala acá y registrá en cada entrenamiento pesos, repeticiones, intensidad y tus notas. Es tuya: la usás cuando quieras, con o sin programa de tu profe.</span>
          <button type="button" className="cta sm" onClick={() => open("new")}><Ic i={Plus} size={16} color="var(--ui-on-primary)" /> Cargarla a mano</button>
          <button type="button" className="ghost sm" onClick={upload}>Subir foto, captura o archivo</button>
        </div>
      )}
      {list?.map((r) => (
        <div key={r.id} className="or-card">
          <div className="or-title">{r.next && list.length > 1 && <span className="or-next">Te toca hoy</span>}<b>{r.name}</b><small className="mb-muted">{r.exercises.length} {r.exercises.length === 1 ? "ejercicio" : "ejercicios"}{r.imported ? " · importada" : ""}{r.lastUsedAt ? ` · última vez ${fmtDate(r.lastUsedAt)}` : ""}</small></div>
          <ul>{r.exercises.map((e, i) => (
            <li key={i}><span>{e.name}{e.detail && detailSummary({ ...e, rir: null, restSec: e.restSec ?? 90 }, groupLabels(r.exercises)[i]) && <small className="mb-muted or-method">{detailSummary({ ...e, rir: null, restSec: e.restSec ?? 90 }, groupLabels(r.exercises)[i])}</small>}</span>
              <span>{cardText(e)}{activityOf(e.detail) ? "" : e.prev?.weightKg ? ` · última vez ${kg(e.prev.weightKg, unit)}` : e.weightKg ? ` · ${kg(e.weightKg, unit)}` : ""}</span></li>
          ))}</ul>
          <div className="or-actions">
            <button type="button" className="cta sm" disabled={offline} onClick={() => onStart(r.id)}>
              <Ic i={Play} size={16} weight="fill" color="var(--ui-on-primary)" />{busyOpen ? "Continuar el que está en curso" : "Empezar"}
            </button>
            <button type="button" className="ghost sm" onClick={() => open(r)}>Editar</button>
            {/* D210: qué decía la rutina importada, qué faltaba, qué completaste y qué se sugirió (lo explica REPI con la procedencia). */}
            {r.imported && !offline && <RepiAsk section="routines" refs={{ routineId: r.id }} subject={r.name} label="Entender esta rutina" className="ghost sm rp-ask-btn" send="Explicame esta rutina" />}
            <button type="button" className="ghost sm" disabled={offline || dup != null} aria-busy={dup === r.id || undefined} onClick={async () => {
              if (dup) return;
              setDup(r.id);
              try { await api(`/api/me/routines/${r.id}/duplicate`, { body: {} }); flash(`Duplicaste «${r.name}».`); void load(); } catch (e) { flash((e as Error).message); } finally { setDup(null); }
            }}>Duplicar</button>
          </div>
        </div>
      ))}
      {importing && <RoutineImportSheet flash={flash} onClose={() => setImporting(false)} onDone={() => { setImporting(false); void load(); }} />}
      {edit && <Editor initial={edit === "new" ? null : edit} unit={unit} flash={flash} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
    </section>
  );
}

function Editor({ initial, unit, flash, onClose, onSaved }: { initial: Saved | null; unit: WeightUnit; flash: (m: string) => void; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => (initial?.exercises ?? []).map((e, i) => ({ ...e, key: `${i}:${e.exerciseId}`, w: wTxt(e.weightKg, unit), profile: savedProfile(e) })));
  const [picking, setPicking] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [tech, setTech] = useState<number | null>(null); // D184: ejercicio con el editor de series y técnica abierto
  const set = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const asEx = (r: Row) => ({ name: r.name, sets: r.sets, reps: r.reps.trim() || defaultReps(r.kind), rir: null, restSec: r.restSec ?? 90, detail: r.detail ?? null });
  /** D184: guardar «Series y técnica». En un circuito, todos quedan con una serie por vuelta (se pregunta antes de quitar). */
  const saveTech = (i: number, p: { detail: ExerciseDetail | null; sets: number }) => {
    const next = rows.map((x, j) => (j === i ? { ...x, detail: p.detail, sets: p.sets } : x));
    const sync = syncCircuit(next.map(asEx), i);
    if (sync.removed.length && !window.confirm(`El circuito tiene ${sync.rounds} vueltas: se quitan series de ${sync.removed.map((r) => `${r.exercise} (${r.blocks})`).join(", ")}. ¿Seguir?`)) { setRows(next); return; }
    setRows(next.map((x, j) => ({ ...x, sets: sync.exs[j].sets, detail: sync.exs[j].detail ?? null })));
  };
  const labels = groupLabels(rows.map(asEx));
  const issue = circuitIssues(rows.map(asEx))[0];
  const move = (i: number, d: -1 | 1) => setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n; });
  // Ejercicios por tiempo: una actividad entra con los valores de su perfil (una cinta: 10 min a 5 km/h, inclinación 0, sin series).
  const rowOf = (e: Lib): Row => {
    const profile = editorProfile({ name: e.name }, e);
    const base = { key: `${Date.now()}:${e.id}`, exerciseId: e.id, name: e.name, group: e.group, kind: e.kind, profile, weightKg: null, w: "", note: null };
    if (!isActivityProfile(profile)) return { ...base, sets: 3, reps: defaultReps(e.kind), restSec: null };
    const d = rowDefaults(profile);
    return { ...base, sets: d.sets, reps: d.reps, restSec: d.restSec, detail: d.detail ?? null };
  };
  const add = (e: Lib) => {
    if (rows.length >= MAX_EX) { flash(`Una rutina puede tener hasta ${MAX_EX} ejercicios.`); return; }
    setRows((r) => [...r, rowOf(e)]);
    setPicking(false);
  };
  // D186: un ejercicio a medio crear (nombre escrito en «Crear un ejercicio») se crea y se agrega al guardar la rutina, en un
  // solo paso. Antes había que tocar «Crear y agregar» y después «Guardar»; si se tocaba sólo «Guardar», se perdía.
  const pending = useRef<(() => Promise<Lib | null>) | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const badW = rows.findIndex((r) => r.w.trim() !== "" && parseWeightIn(r.w, unit) == null);
  const ready = name.trim().length >= 2 && (rows.length > 0 || hasPending) && rows.every((r) => r.reps.trim()) && badW < 0 && !issue;
  const save = async () => {
    let list = rows;
    if (pending.current && name.trim().length >= 2) {
      setBusy(true); setWarn(null);
      const e = await pending.current().finally(() => setBusy(false));
      if (!e) { setWarn("Completá el ejercicio nuevo (nombre y grupo muscular) o tocá «Cancelar» para no agregarlo."); return; }
      if (list.length >= MAX_EX) { setWarn(`Una rutina puede tener hasta ${MAX_EX} ejercicios.`); return; }
      list = [...rows, rowOf(e)];
      setRows(list); setPicking(false); setHasPending(false);
    }
    const okNow = name.trim().length >= 2 && list.length > 0 && list.every((r) => r.reps.trim()) && badW < 0 && !issue;
    if (!okNow) { setWarn(name.trim().length < 2 ? "Ponele un nombre a la rutina." : !rows.length ? "Agregá al menos un ejercicio." : badW >= 0 ? `Revisá el peso de ${rows[badW].name}.` : issue ? `El circuito ${issue.group} tiene ${issue.rounds} vueltas, pero ${issue.exercise} tiene ${issue.blocks} series. Igualalas en «Series y técnica».` : (() => { const r = list.find((x) => !x.reps.trim()); return r ? `Completá ${r.kind === "time" || isActivityProfile(r.profile) ? "el tiempo" : "las repeticiones"} de ${r.name}.` : "Completá las repeticiones de cada ejercicio."; })()); return; }
    setBusy(true); setWarn(null);
    try {
      await api("/api/me/routines", { body: { id: initial?.id ?? null, name: name.trim(), exercises: list.map((r) => ({
        exerciseId: r.exerciseId, sets: r.sets, reps: r.reps.trim(), weightKg: r.w.trim() ? parseWeightKeeping(r.w, unit, r.weightKg) : null, restSec: r.restSec, note: r.note?.trim() || null, detail: r.detail ?? null,
      })) } });
      flash(initial ? "Rutina actualizada." : "Rutina guardada. Ya la podés empezar.");
      onSaved();
    } catch (e) { setWarn((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!initial || !window.confirm(`¿Borrar «${initial.name}»? Lo que ya entrenaste con ella queda en tu historial.`)) return;
    setBusy(true);
    try { await api(`/api/me/routines/${initial.id}/delete`, { body: {} }); flash("Rutina borrada."); onSaved(); }
    catch (e) { setWarn((e as Error).message); setBusy(false); }
  };
  return (
    <Sheet title={initial ? "Editar rutina" : "Mi rutina"} sub="Elegí los ejercicios, las series y las repeticiones. El peso es opcional: después de la primera vez, REPI usa tu última marca." warn={warn} onClose={onClose}
      action={{ label: initial ? "Guardar cambios" : "Guardar rutina", ready, busy, onSubmit: () => void save() }}>
      <label className="or-field">Nombre<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Día A · piernas" /></label>
      {rows.map((r, i) => (
        <fieldset key={r.key} className="or-ex">
          <legend>{labels[i] ? `${labels[i]} · ` : `${i + 1}. `}{r.name} <small>{r.group}</small></legend>
          {/* Ejercicios por tiempo: una actividad muestra sólo su duración (en minutos) y sus campos; sin series, peso ni método. Una
              guardada antes como «1200 s» se ve igual y pasa a configurarse así al cambiar cualquier valor. */}
          {isActivityProfile(r.profile) ? (
            <ActivityFields variant="sheet" e={{ ...r, restSec: r.restSec ?? 0 }} profile={activityOf(r.detail)?.profile ?? r.profile}
              onChange={(p) => set(i, { detail: p.detail, ...(p.sets != null ? { sets: p.sets } : {}), ...(p.reps != null ? { reps: p.reps } : {}), ...(p.restSec != null ? { restSec: p.restSec } : {}) })} />
          ) : (
          <div className="or-ex-grid">
            {/* D184: con un plan serie por serie (método, etapas), las series salen del plan: se editan en «Series y técnica». */}
            <label>Series<IntInput value={mainSets(r.detail, r.sets)} min={1} max={10} disabled={!!r.detail?.setPlan && !isStraightPlan(r.detail)} onChange={(n) => n != null && set(i, r.detail?.setPlan ? resizeBlocks(asEx(r), n) : { sets: n })} aria-label={`Series de ${r.name}`} /></label>
            {r.kind === "time"
              ? <label>Segundos<IntInput value={r.reps.trim() ? secsOf(r.reps) || null : null} nullable min={1} max={3600} onChange={(n) => set(i, { reps: n ? `${n} s` : "" })} aria-label={`Segundos de ${r.name}`} /></label>
              : <label>Repes<input value={r.reps} maxLength={20} onChange={(e) => set(i, { reps: e.target.value })} placeholder={defaultReps(r.kind)} aria-label={`Repeticiones de ${r.name}`} /></label>}
            {r.kind !== "time" && <label>Peso ({unit})<input inputMode="decimal" value={r.w} maxLength={7} aria-invalid={r.w.trim() !== "" && parseWeightIn(r.w, unit) == null || undefined}
              onChange={(e) => set(i, { w: cleanDecimalDraft(e.target.value) })} placeholder={r.kind === "bodyweight" ? "—" : "Opcional"} aria-label={`Peso de ${r.name} en ${unit}`} /></label>}
          </div>
          )}
          <input className="or-note" value={r.note ?? ""} maxLength={120} onChange={(e) => set(i, { note: e.target.value })} placeholder="Nota (opcional): agarre, pausa, máquina…" aria-label={`Nota de ${r.name}`} />
          {!isActivityProfile(r.profile) && <div className="or-tech">
            {r.detail && <small className="mb-muted">{detailSummary(asEx(r), labels[i])}</small>}
            <button type="button" className="ghost sm" onClick={() => setTech(i)} aria-label={`Series y técnica de ${r.name}`}>{r.detail ? "Cambiar método" : "Método y series"}</button>
          </div>}
          <div className="or-ex-actions">
            <button type="button" className="linkbtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${r.name}`}><Ic i={ArrowUp} size={16} /></button>
            <button type="button" className="linkbtn" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${r.name}`}><Ic i={ArrowDown} size={16} /></button>
            <button type="button" className="linkbtn" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        </fieldset>
      ))}
      {picking ? <Picker onPick={add} onCancel={rows.length ? () => setPicking(false) : undefined} taken={new Set(rows.map((r) => r.exerciseId))} pending={pending} onPending={setHasPending} />
        : rows.length < MAX_EX && <button type="button" className="ghost" onClick={() => setPicking(true)}><Ic i={Plus} size={16} /> Agregar ejercicio</button>}
      {initial && <button type="button" className="linkbtn or-del" disabled={busy} onClick={() => void remove()}>Borrar rutina</button>}
      {tech != null && rows[tech] && !isActivityProfile(rows[tech].profile) && <ExerciseDetailEditor member e={asEx(rows[tech])} onClose={() => setTech(null)} onSave={(p) => { saveTech(tech, p); setTech(null); }} />}
    </Sheet>
  );
}

export function Picker({ onPick, onCancel, taken, initialQuery = "", pending, onPending }: {
  onPick: (e: Lib) => void; onCancel?: () => void; taken: Set<string>; initialQuery?: string;
  /** D186: la hoja que contiene el buscador crea el ejercicio a medio cargar al guardar (sin pasar por «Crear y agregar»). */
  pending?: MutableRefObject<(() => Promise<Lib | null>) | null>; onPending?: (has: boolean) => void;
}) {
  const [lib, setLib] = useState<Lib[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [group, setGroup] = useState<string | null>(null);
  // D163: lo que no está en la biblioteca, el alumno lo crea (sólo lo ve él).
  // D186: grupo y forma de registro sugeridos por el nombre (se ven marcados y se cambian con un toque); `mine` = los eligió la
  // persona y ya no se pisan al seguir escribiendo. Ejercicios por tiempo: en lugar del tipo de registro, qué se configura
  // (con peso, peso corporal, segundos, cinta, bici, remo, elíptico, escaladora o sólo duración); «Cinta caminadora» → cinta.
  const [creating, setCreating] = useState<{ name: string; group: string | null; profile: MetricsProfile; mine: { group: boolean; profile: boolean } } | null>(null);
  const [busy, setBusy] = useState(false);
  const guessP = (nm: string) => guessMetricsProfile(nm, guessExerciseKind(nm));
  const startCreate = (nm: string) => setCreating({ name: nm, group: group ?? guessExerciseGroup(nm), profile: guessP(nm), mine: { group: !!group, profile: false } });
  const typeName = (nm: string) => setCreating((c) => c && { ...c, name: nm, group: c.mine.group ? c.group : guessExerciseGroup(nm) ?? c.group, profile: c.mine.profile ? c.profile : guessP(nm) });
  /** Crea el ejercicio. Con algo sin completar lo dice (antes el botón quedaba apagado sin explicar por qué). */
  const create = async (pick = true): Promise<Lib | null> => {
    if (!creating) return null;
    if (creating.name.trim().length < 2) { setErr("Escribí el nombre del ejercicio."); return null; }
    if (!creating.group) { setErr("Elegí el grupo muscular del ejercicio."); return null; }
    setBusy(true); setErr(null);
    try {
      // `kind` va igual (lo que entiende una versión anterior del servidor); con `profile`, el servidor lo deduce del perfil.
      const e = await api<Lib>("/api/me/exercises", { body: { name: creating.name.trim(), group: creating.group, kind: kindOfProfile(creating.profile), profile: creating.profile } });
      setLib((l) => (l && !l.some((x) => x.id === e.id) ? [...l, e] : l));
      setCreating(null);
      if (pick) onPick(e);
      return e;
    } catch (x) { setErr((x as Error).message); return null; } finally { setBusy(false); }
  };
  const has = !!creating && creating.name.trim().length >= 2;
  useEffect(() => {
    if (pending) pending.current = has ? () => create(false) : null;
    onPending?.(has);
  });
  useEffect(() => () => { if (pending) pending.current = null; onPending?.(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api<Lib[]>("/api/me/exercises").then(setLib).catch((e) => setErr((e as Error).message)); }, []);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const found = useMemo(() => {
    // D186: por palabras («Remo en smith» encuentra «Remo en máquina Smith»).
    return (lib ?? []).filter((e) => (!group || e.group === group) && matchesExerciseQuery(e.name, q)).slice(0, 40);
  }, [lib, q, group]);
  // Sin coincidencia completa: los que comparten alguna palabra («Remo en smith» → los remos), para no crear uno repetido.
  const near = useMemo(() => {
    if (found.length || q.trim().length < 3) return [];
    const words = q.split(/\s+/).filter((w) => w.length >= 4);
    return (lib ?? []).filter((e) => (!group || e.group === group) && words.some((w) => matchesExerciseQuery(e.name, w))).slice(0, 8);
  }, [lib, q, group, found.length]);
  return (
    <div className="or-pick" role="group" aria-label="Agregar ejercicio">
      <label className="or-field">Buscar ejercicio<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej.: sentadilla, remo, press" /></label>
      <div className="wish-goals" role="group" aria-label="Grupo muscular">
        {EXERCISE_GROUPS.map((g) => <button key={g} type="button" className="ai-chip" aria-pressed={group === g} onClick={() => setGroup(group === g ? null : g)}>{g}</button>)}
      </div>
      {err && !creating && <p className="sheet-warn">{err}</p>}
      {!lib && !err && <p className="sheet-sub" role="status">Cargando ejercicios…</p>}
      {lib && (
        <ul className="or-results">
          {found.map((e) => (
            <li key={e.id}><button type="button" onClick={() => onPick(e)}><span>{e.name}</span><small>{e.group}{e.mine ? " · tuyo" : ""}{taken.has(e.id) ? " · ya está" : ""}</small></button></li>
          ))}
          {!found.length && <li className="sheet-sub">{near.length ? "No está con ese nombre. ¿Es alguno de estos? Si no, crealo abajo." : "No encontramos ese ejercicio en la biblioteca. Probá con otro nombre o crealo."}</li>}
          {near.map((e) => (
            <li key={e.id}><button type="button" onClick={() => onPick(e)}><span>{e.name}</span><small>{e.group}{e.mine ? " · tuyo" : ""}{taken.has(e.id) ? " · ya está" : ""}</small></button></li>
          ))}
        </ul>
      )}
      {lib && !creating && <button type="button" className="ghost sm" onClick={() => startCreate(q.trim())}>
        <Ic i={Plus} size={16} /> {q.trim().length >= 2 ? `Crear «${q.trim().slice(0, 40)}»` : "Crear un ejercicio"}</button>}
      {creating && (
        <div className="or-create" role="group" aria-label="Crear ejercicio">
          <label className="or-field">Nombre<input value={creating.name} maxLength={60} onChange={(e) => typeName(e.target.value)} placeholder="Ej.: Camilla de isquios" /></label>
          <span className="sheet-sub">Grupo muscular</span>
          <div className="wish-goals" role="group" aria-label="Grupo muscular del ejercicio nuevo">
            {EXERCISE_GROUPS.map((g) => <button key={g} type="button" className="ai-chip" aria-pressed={creating.group === g} onClick={() => { setErr(null); setCreating({ ...creating, group: g, mine: { ...creating.mine, group: true } }); }}>{g}</button>)}
          </div>
          <span className="sheet-sub">Qué cargás</span>
          <div className="wish-goals" role="group" aria-label="Cómo se registra">
            {PROFILE_CHIPS.map(([k, l]) => <button key={k} type="button" className="ai-chip" aria-pressed={creating.profile === k} onClick={() => setCreating({ ...creating, profile: k, mine: { ...creating.mine, profile: true } })}>{l}</button>)}
          </div>
          <small className="mb-muted">{METRICS_PROFILE_HINT[creating.profile]}</small>
          {err && <p className="sheet-warn" role="alert">{err}</p>}
          <div className="or-actions">
            <button type="button" className="cta sm" aria-busy={busy || undefined} onClick={() => void create()}>Crear y agregar</button>
            <button type="button" className="ghost sm" onClick={() => setCreating(null)}>Cancelar</button>
          </div>
          <small className="mb-muted">{!creating.mine.group && creating.group ? `Le pusimos ${creating.group} por el nombre: cambialo si no es. ` : ""}Es tuyo: lo ves vos en tus rutinas y tu progreso. No se suma a la biblioteca de tu profe ni del gimnasio.{pending ? " Si guardás la rutina, se agrega solo." : ""}</small>
        </div>
      )}
      {onCancel && <button type="button" className="linkbtn" onClick={onCancel}>Cancelar</button>}
    </div>
  );
}

/**
 * D162: en Inicio, sin programa asignado, la rutina propia que toca hoy (la siguiente a la última que entrenó). Sin rutinas
 * propias muestra `fallback` (la tarjeta de siempre: pedir programa o cargar la propia).
 */
export function NextOwnRoutine({ offline, busyOpen, onStart, fallback, skip = false }: { offline: boolean; busyOpen: boolean; onStart: (id: string) => void; fallback: ReactNode; skip?: boolean }) {
  // REPI Control (D213): `skip` (gimnasio supervisado) muestra sólo `fallback`, sin pedir ni ofrecer las rutinas propias.
  const c = useCached<Saved[]>(skip ? null : "/api/me/routines");
  if (skip) return <>{fallback}</>;
  const list = c.data ?? (c.err ? [] : null);
  const r = list?.find((x) => x.next) ?? list?.[0];
  // M06: la tarjeta se reserva (esqueleto del mismo alto) hasta saber si hay rutina propia; nunca aparece de golpe.
  if (!list) return <div className="or-card or-today" aria-hidden="true"><div className="or-title"><Skel w={86} h={12} /><Skel w="56%" h={18} /><Skel w="40%" h={12} /></div><div className="or-actions"><Skel w={104} h={40} r={20} /></div></div>;
  if (!r) return <>{fallback}</>;
  return (
    <div className="or-card or-today">
      <div className="or-title"><span className="or-next">{list.length > 1 ? "Te toca hoy" : "Tu rutina"}</span><b>{r.name}</b>
        <small className="mb-muted">{r.exercises.length} {r.exercises.length === 1 ? "ejercicio" : "ejercicios"}{r.imported ? " · importada" : ""}{r.lastUsedAt ? ` · última vez ${fmtDate(r.lastUsedAt)}` : ""}</small></div>
      <div className="or-actions">
        <button type="button" className="cta sm" disabled={offline} onClick={() => onStart(r.id)}>
          <Ic i={Play} size={16} weight="fill" color="var(--ui-on-primary)" />{busyOpen ? "Continuar el que está en curso" : "Empezar"}
        </button>
      </div>
    </div>
  );
}
