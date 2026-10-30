"use client";
// D158: «Mis rutinas». Para quien entrena con su propia rutina (tenga o no programa asignado): la arma con ejercicios de la
// biblioteca, la guarda y la entrena cuando quiere. En el entrenamiento registra pesos, repeticiones, RIR, cómo se sintió
// cada serie y sus notas, y al terminar el esfuerzo de la sesión y lo que pensó. La primera vez usa el peso que puso acá;
// después manda su última marca y la sugerencia de REPI.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Play, Plus } from "@phosphor-icons/react";
import { EXERCISE_GROUPS, kgTo, parseWeightIn, type WeightUnit } from "@repi/domain";
import { api } from "@/lib/api";
import { Ic } from "@/components/ui/Ic";
import { IntInput } from "@/components/ui/IntInput";
import { Sheet } from "./Sheet";
import { kg } from "./types";
import { useUnit } from "./units";

type Lib = { id: string; name: string; group: string; kind: "load_reps" | "bodyweight" | "time" };
type Ex = { exerciseId: string; sets: number; reps: string; weightKg: number | null; restSec: number | null; note: string | null };
type Saved = { id: string; name: string; lastUsedAt: string | null; exercises: (Ex & { name: string; group: string; kind: Lib["kind"]; prev: { weightKg: number | null; reps: number | null } | null })[] };
type Row = Ex & { key: string; name: string; group: string; kind: Lib["kind"]; w: string };

const MAX_EX = 12;
const defaultReps = (k: Lib["kind"]) => (k === "time" ? "30 s" : k === "bodyweight" ? "12" : "10");
const fmtDate = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(iso));
const wTxt = (w: number | null, unit: WeightUnit) => (w == null ? "" : String(kgTo(w, unit)).replace(".", ","));

export function OwnRoutines({ offline, flash, onStart, busyOpen }: { offline: boolean; flash: (m: string) => void; onStart: (id: string) => void; busyOpen: boolean }) {
  const [list, setList] = useState<Saved[] | null>(null);
  const [edit, setEdit] = useState<Saved | "new" | null>(null);
  const unit = useUnit();
  const load = useCallback(() => api<Saved[]>("/api/me/routines").then(setList).catch(() => setList((l) => l ?? [])), []);
  useEffect(() => { void load(); }, [load]);
  const open = (r: Saved | "new") => { if (offline) { flash("Necesitás conexión para armar o editar tus rutinas."); return; } setEdit(r); };
  return (
    <section className="or" aria-labelledby="or-h">
      <div className="or-head">
        <h2 id="or-h">Mis rutinas</h2>
        {!!list?.length && <button type="button" className="linkbtn" onClick={() => open("new")}><Ic i={Plus} size={16} /> Nueva</button>}
      </div>
      {list && !list.length && (
        <div className="dashed-card">
          <strong>¿Tenés tu propia rutina?</strong>
          <span>Cargala acá y registrá en cada entrenamiento pesos, repeticiones, intensidad y tus notas. Es tuya: la usás cuando quieras, con o sin programa de tu profe.</span>
          <button type="button" className="cta sm" onClick={() => open("new")}><Ic i={Plus} size={16} color="#0B0F14" /> Cargar mi rutina</button>
        </div>
      )}
      {list?.map((r) => (
        <div key={r.id} className="or-card">
          <div className="or-title"><b>{r.name}</b><small className="mb-muted">{r.exercises.length} {r.exercises.length === 1 ? "ejercicio" : "ejercicios"}{r.lastUsedAt ? ` · última vez ${fmtDate(r.lastUsedAt)}` : ""}</small></div>
          <ul>{r.exercises.map((e, i) => (
            <li key={i}><span>{e.name}</span><span>{e.sets}×{e.reps}{e.prev?.weightKg ? ` · última vez ${kg(e.prev.weightKg, unit)}` : e.weightKg ? ` · ${kg(e.weightKg, unit)}` : ""}</span></li>
          ))}</ul>
          <div className="or-actions">
            <button type="button" className="cta sm" disabled={offline} onClick={() => onStart(r.id)}>
              <Ic i={Play} size={16} weight="fill" color="#0B0F14" />{busyOpen ? "Continuar el que está en curso" : "Empezar"}
            </button>
            <button type="button" className="ghost sm" onClick={() => open(r)}>Editar</button>
          </div>
        </div>
      ))}
      {edit && <Editor initial={edit === "new" ? null : edit} unit={unit} flash={flash} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void load(); }} />}
    </section>
  );
}

function Editor({ initial, unit, flash, onClose, onSaved }: { initial: Saved | null; unit: WeightUnit; flash: (m: string) => void; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => (initial?.exercises ?? []).map((e, i) => ({ ...e, key: `${i}:${e.exerciseId}`, w: wTxt(e.weightKg, unit) })));
  const [picking, setPicking] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const set = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const add = (e: Lib) => {
    if (rows.length >= MAX_EX) { flash(`Una rutina puede tener hasta ${MAX_EX} ejercicios.`); return; }
    setRows((r) => [...r, { key: `${Date.now()}:${e.id}`, exerciseId: e.id, name: e.name, group: e.group, kind: e.kind, sets: 3, reps: defaultReps(e.kind), weightKg: null, w: "", restSec: null, note: null }]);
    setPicking(false);
  };
  const badW = rows.findIndex((r) => r.w.trim() !== "" && parseWeightIn(r.w, unit) == null);
  const ready = name.trim().length >= 2 && rows.length > 0 && rows.every((r) => r.reps.trim()) && badW < 0;
  const save = async () => {
    if (!ready) { setWarn(name.trim().length < 2 ? "Ponele un nombre a la rutina." : !rows.length ? "Agregá al menos un ejercicio." : badW >= 0 ? `Revisá el peso de ${rows[badW].name}.` : "Completá las repeticiones de cada ejercicio."); return; }
    setBusy(true); setWarn(null);
    try {
      await api("/api/me/routines", { body: { id: initial?.id ?? null, name: name.trim(), exercises: rows.map((r) => ({
        exerciseId: r.exerciseId, sets: r.sets, reps: r.reps.trim(), weightKg: r.w.trim() ? parseWeightIn(r.w, unit) : null, restSec: r.restSec, note: r.note?.trim() || null,
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
          <legend>{i + 1}. {r.name} <small>{r.group}</small></legend>
          <div className="or-ex-grid">
            <label>Series<IntInput value={r.sets} min={1} max={10} onChange={(n) => n != null && set(i, { sets: n })} aria-label={`Series de ${r.name}`} /></label>
            <label>{r.kind === "time" ? "Tiempo" : "Repes"}<input value={r.reps} maxLength={20} onChange={(e) => set(i, { reps: e.target.value })} placeholder={defaultReps(r.kind)} aria-label={`${r.kind === "time" ? "Tiempo" : "Repeticiones"} de ${r.name}`} /></label>
            {r.kind !== "time" && <label>Peso ({unit})<input inputMode="decimal" value={r.w} maxLength={7} aria-invalid={r.w.trim() !== "" && parseWeightIn(r.w, unit) == null || undefined}
              onChange={(e) => set(i, { w: e.target.value.replace(/[^\d.,]/g, "") })} placeholder={r.kind === "bodyweight" ? "—" : "Opcional"} aria-label={`Peso de ${r.name} en ${unit}`} /></label>}
          </div>
          <input className="or-note" value={r.note ?? ""} maxLength={120} onChange={(e) => set(i, { note: e.target.value })} placeholder="Nota (opcional): agarre, pausa, máquina…" aria-label={`Nota de ${r.name}`} />
          <div className="or-ex-actions">
            <button type="button" className="linkbtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${r.name}`}><Ic i={ArrowUp} size={16} /></button>
            <button type="button" className="linkbtn" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${r.name}`}><Ic i={ArrowDown} size={16} /></button>
            <button type="button" className="linkbtn" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        </fieldset>
      ))}
      {picking ? <Picker onPick={add} onCancel={rows.length ? () => setPicking(false) : undefined} taken={new Set(rows.map((r) => r.exerciseId))} />
        : rows.length < MAX_EX && <button type="button" className="ghost" onClick={() => setPicking(true)}><Ic i={Plus} size={16} /> Agregar ejercicio</button>}
      {initial && <button type="button" className="linkbtn or-del" disabled={busy} onClick={() => void remove()}>Borrar rutina</button>}
    </Sheet>
  );
}

function Picker({ onPick, onCancel, taken }: { onPick: (e: Lib) => void; onCancel?: () => void; taken: Set<string> }) {
  const [lib, setLib] = useState<Lib[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  useEffect(() => { api<Lib[]>("/api/me/exercises").then(setLib).catch((e) => setErr((e as Error).message)); }, []);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const found = useMemo(() => {
    const t = norm(q.trim());
    return (lib ?? []).filter((e) => (!group || e.group === group) && (!t || norm(e.name).includes(t))).slice(0, 40);
  }, [lib, q, group]);
  return (
    <div className="or-pick" role="group" aria-label="Agregar ejercicio">
      <label className="or-field">Buscar ejercicio<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej.: sentadilla, remo, press" /></label>
      <div className="wish-goals" role="group" aria-label="Grupo muscular">
        {EXERCISE_GROUPS.map((g) => <button key={g} type="button" className="ai-chip" aria-pressed={group === g} onClick={() => setGroup(group === g ? null : g)}>{g}</button>)}
      </div>
      {err && <p className="sheet-warn">{err}</p>}
      {!lib && !err && <p className="sheet-sub" role="status">Cargando ejercicios…</p>}
      {lib && (
        <ul className="or-results">
          {found.map((e) => (
            <li key={e.id}><button type="button" onClick={() => onPick(e)}><span>{e.name}</span><small>{e.group}{taken.has(e.id) ? " · ya está" : ""}</small></button></li>
          ))}
          {!found.length && <li className="sheet-sub">No encontramos ese ejercicio. Probá con otro nombre o pedile a tu profe que lo sume a la biblioteca.</li>}
        </ul>
      )}
      {onCancel && <button type="button" className="linkbtn" onClick={onCancel}>Cancelar</button>}
    </div>
  );
}
