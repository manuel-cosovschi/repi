"use client";
// Constructor de programas (F-CO-08). Autoguardado real: cada cambio se persiste; si la versión ya fue
// asignada o usada en una sesión, el servidor crea una versión nueva y el historial no cambia.
import { useCallback, useEffect, useRef, useState } from "react";
import { formatRest, parseRest } from "@repi/domain";
import { api } from "@/lib/api";
import { ApprovedSubs, subsLabel, useSubstitutions } from "./ApprovedSubs";
import { AssignModal } from "./AssignModal";
import { featureOn } from "@/lib/features";
import type { EditableDoc, LibEx, Overview, ProgramFull, TemplateRow } from "./types";

type Save = { s: "idle" } | { s: "saving" } | { s: "saved"; v: number } | { s: "error"; m: string };

export function ProgramBuilder({ orgId, ov, pid, setPid, flash, onNewProgram, onAssigned }: {
  orgId: string; ov: Overview; pid: string | null; setPid: (id: string | null) => void; flash: (t: string) => void; onNewProgram: () => void; onAssigned: () => void;
}) {
  const [list, setList] = useState<TemplateRow[] | null>(null);
  const listRef = useRef(list);
  listRef.current = list;
  const [prog, setProg] = useState<ProgramFull | null>(null);
  const [doc, setDoc] = useState<EditableDoc | null>(null);
  const [day, setDay] = useState(0);
  const [lib, setLib] = useState<LibEx[]>([]);
  const [libQ, setLibQ] = useState("");
  const [save, setSave] = useState<Save>({ s: "idle" });
  const [assign, setAssign] = useState(false);
  const [subsFor, setSubsFor] = useState<string | null>(null); // ejercicio con el panel de reemplazos abierto
  const { subs, setSubs } = useSubstitutions(orgId);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadList = useCallback(() => api<{ programs: TemplateRow[] }>(`/api/coach/${orgId}/programs`).then((r) => { setList(r.programs); return r.programs; }), [orgId]);
  useEffect(() => { loadList().then((ps) => { if (!pid && ps[0]) setPid(ps[0].id); }).catch((e) => flash(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api<{ exercises: LibEx[] }>(`/api/coach/${orgId}/library`).then((r) => setLib(r.exercises)).catch(() => {}); }, [orgId]);
  useEffect(() => {
    if (!pid) { setProg(null); setDoc(null); return; }
    dirty.current = false; setSave({ s: "idle" }); setAssign(false);
    // Mientras carga el elegido no queda a la vista el anterior: «Asignar» usaría el programa equivocado (F-05).
    if (prog?.id !== pid) { setProg(null); setDoc(null); }
    let live = true; // una respuesta tardía de un programa ya dejado no pisa al actual
    // Un programa recién creado tiene que aparecer en la lista sin esperar al primer guardado (F-03).
    api<ProgramFull>(`/api/coach/${orgId}/programs/${pid}`).then((p) => { if (!live) return; setProg(p); setDoc(p.doc); setDay(0); if (listRef.current && !listRef.current.some((x) => x.id === p.id)) loadList(); }).catch((e) => { if (!live) return; flash(e.message); setPid(null); });
    return () => { live = false; };
  }, [orgId, pid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autoguardado con debounce; el estado visible refleja el resultado real del servidor.
  useEffect(() => {
    if (!doc || !prog || !dirty.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSave({ s: "saving" });
      try {
        const r = await api<{ version: number; created: boolean }>(`/api/coach/${orgId}/programs/${prog.id}`, { method: "PUT", body: strip(doc) });
        setSave({ s: "saved", v: r.version });
        if (r.created) {
          flash(`Versión ${r.version} guardada. Las sesiones ya registradas y otras asignaciones no cambian.`);
          setProg((p) => p && { ...p, version: r.version, locked: false });
        }
        dirty.current = false;
        loadList();
      } catch (e) { setSave({ s: "error", m: (e as Error).message }); }
    }, 700);
    return () => clearTimeout(timer.current);
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (fn: (d: EditableDoc) => EditableDoc) => { dirty.current = true; setDoc((d) => (d ? fn(d) : d)); };
  const setDayDoc = (fn: (x: EditableDoc["days"][number]) => EditableDoc["days"][number]) => edit((d) => ({ ...d, days: d.days.map((x, i) => (i === day ? fn(x) : x)) }));
  const cur = doc?.days[day] ?? doc?.days[0];
  const libq = libQ.trim().toLowerCase();

  const duplicate = async () => {
    if (!prog) return;
    try { const r = await api<{ id: string }>(`/api/coach/${orgId}/programs/${prog.id}/duplicate`, { body: {} }); await loadList(); setPid(r.id); flash("Programa duplicado. Estás editando la copia."); }
    catch (e) { flash((e as Error).message); }
  };
  const forTxt = !prog ? "" : prog.kind === "client_copy" ? `Programa de ${prog.forClient ?? "un cliente"} · versión ${prog.version}` : `Programa · ${prog.clients.map((c) => c.split(" ")[0]).join(", ") || "sin clientes asignados"} · versión ${prog.version}`;

  return (
    <>
      <div className="co-head">
        <div style={{ flex: "1 1 320px" }}>
          <span className="co-kicker">{forTxt} {saveLabel(save)}</span>
          {doc ? <input className="pname" value={doc.name} onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))} aria-label="Nombre del programa" maxLength={120} />
            : <h1 tabIndex={-1}>Programas</h1>}
        </div>
        {prog && (
          <div className="co-actions">
            <button type="button" className="btn" onClick={duplicate}>Duplicar</button>
            {prog.kind === "template" && <button type="button" className="btn pri" onClick={() => setAssign(true)}>Asignar a clientes</button>}
          </div>
        )}
      </div>
      {save.s === "error" && <p role="alert" className="err-box">No se guardó: {save.m}</p>}
      <div className="split">
        <div className="side-pane">
          <span className="lbl-up" style={{ padding: "6px 8px" }}>Mis programas</span>
          {list?.map((p) => (
            <button type="button" key={p.id} className="prow" aria-current={p.id === pid} onClick={() => setPid(p.id)}>
              <b>{p.name}</b><span className="muted">{p.weeks} sem · {p.days} días · {p.clients ? `${p.clients} ${p.clients === 1 ? "cliente" : "clientes"}` : "sin asignar"}</span>
            </button>
          ))}
          {list && !list.length && <span className="muted" style={{ padding: 8 }}>Todavía no creaste programas.</span>}
          <button type="button" className="dashed" onClick={onNewProgram}>+ Programa en blanco</button>
        </div>
        {doc && cur ? (
          <section className="card" style={{ flex: "3 1 480px", minWidth: 0, gap: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <div className="seg" role="tablist" aria-label="Días del programa">
                {doc.days.map((d, i) => <button key={i} type="button" role="tab" aria-selected={i === day} onClick={() => setDay(i)}>{d.name || `Día ${i + 1}`}</button>)}
                <button type="button" aria-label="Agregar día" onClick={() => { edit((d) => ({ ...d, days: [...d.days, { name: `Día ${d.days.length + 1}`, exercises: [] }] })); setDay(doc.days.length); }}>+</button>
              </div>
              <span className="muted" style={{ fontSize: 13 }}>
                <input className="weeks" type="number" min={1} max={52} value={doc.weeks} aria-label="Semanas"
                  onChange={(e) => { const w = Math.max(1, Math.min(52, Number(e.target.value) || 1)); edit((d) => ({ ...d, weeks: w })); }} /> semanas · {doc.days.length} días por semana
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label className="dayname"><span>Nombre del día</span><input value={cur.name} onChange={(e) => setDayDoc((x) => ({ ...x, name: e.target.value }))} placeholder="Ej.: Torso A, Piernas, Empuje" maxLength={60} /></label>
              {doc.days.length > 1 && <button type="button" className="btn danger" style={{ height: 44, borderRadius: 10 }} onClick={() => { const i = day; edit((d) => ({ ...d, days: d.days.filter((_, j) => j !== i) })); setDay(Math.max(0, i - 1)); }}>Quitar día</button>}
            </div>
            <div className="exhead" aria-hidden="true"><span className="c-name">Ejercicio</span><span className="c-s">Series</span><span className="c-r">Reps</span><span className="c-rir">RIR</span><span className="c-rest">Descanso</span><span className="c-act" /></div>
            {cur.exercises.map((e, i) => (
              <div key={`${prog?.id}-${prog?.version}-${day}-${i}-${e.exerciseId}`}>
                <ExRow n={i} e={e} subs={subsLabel(subs.filter((x) => x.exerciseId === e.exerciseId).length)} subsOpen={subsFor === `${i}:${e.exerciseId}`}
                  onSubs={() => setSubsFor((v) => (v === `${i}:${e.exerciseId}` ? null : `${i}:${e.exerciseId}`))}
                  onChange={(patch) => setDayDoc((x) => ({ ...x, exercises: x.exercises.map((y, k) => (k === i ? { ...y, ...patch } : y)) }))}
                  onMove={(dir) => setDayDoc((x) => { const a = x.exercises.slice(); const j = i + dir; [a[i], a[j]] = [a[j], a[i]]; return { ...x, exercises: a }; })}
                  onRemove={() => setDayDoc((x) => ({ ...x, exercises: x.exercises.filter((_, k) => k !== i) }))} />
                {subsFor === `${i}:${e.exerciseId}` && <ApprovedSubs orgId={orgId} ex={e} lib={lib} subs={subs} setSubs={setSubs} flash={flash} />}
              </div>
            ))}
            {!cur.exercises.length && <div className="empty">Agregá ejercicios desde la biblioteca.</div>}
            <label className="field">Indicación para el cliente<textarea className="note" rows={2} value={doc.note} maxLength={1000} onChange={(e) => edit((d) => ({ ...d, note: e.target.value }))} /></label>
          </section>
        ) : (
          <section className="card" style={{ flex: "3 1 480px" }}><div className="empty">{pid ? "Cargando programa…" : list?.length ? "Elegí un programa." : "Creá tu primer programa en blanco."}</div></section>
        )}
        <div className="side-pane" style={{ gap: 6 }}>
          <span className="lbl-up" style={{ padding: "6px 8px" }}>Biblioteca</span>
          <label className="search" style={{ height: 38 }}><input value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Buscar ejercicio" aria-label="Buscar ejercicio" /></label>
          {lib.filter((l) => !libq || (l.name + l.group).toLowerCase().includes(libq)).map((l) => (
            <button type="button" key={l.id} className="librow" disabled={!cur} aria-label={`Agregar ${l.name}`}
              onClick={() => { if (!cur) return; setDayDoc((x) => ({ ...x, exercises: [...x.exercises, { exerciseId: l.id, name: l.name, sets: 3, reps: l.kind === "time" ? "40 s" : "8-12", rir: l.kind === "time" ? null : 2, restSec: 90 }] })); flash(`${l.name} agregado a ${cur.name}.`); }}>
              <span>{l.name}<small>{l.group}</small></span><i aria-hidden="true">+</i>
            </button>
          ))}
          <span className="muted" style={{ padding: "6px 8px", fontSize: 11 }}>Catálogo base sin videos todavía (medios licenciados pendientes).</span>
        </div>
      </div>
      {assign && prog && doc && <AssignModal orgId={orgId} ov={ov} programId={prog.id} name={doc.name} flash={flash}
        onClose={() => setAssign(false)} onDone={() => { setAssign(false); onAssigned(); loadList(); api<ProgramFull>(`/api/coach/${orgId}/programs/${prog.id}`).then(setProg).catch(() => {}); }} />}
    </>
  );
}

const strip = (d: EditableDoc) => ({ name: d.name, weeks: d.weeks, note: d.note, days: d.days.map((x) => ({ name: x.name, exercises: x.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir, restSec: e.restSec, note: e.note ?? null })) })) });
const saveLabel = (s: Save) => s.s === "saving" ? "· Guardando…" : s.s === "saved" ? "· Guardado" : s.s === "error" ? "· Error al guardar" : "";

function ExRow({ n, e, subs, subsOpen, onSubs, onChange, onMove, onRemove }: {
  n: number; e: EditableDoc["days"][number]["exercises"][number]; subs: string; subsOpen: boolean; onSubs: () => void;
  onChange: (p: Partial<EditableDoc["days"][number]["exercises"][number]>) => void; onMove: (d: 1 | -1) => void; onRemove: () => void;
}) {
  const [rest, setRest] = useState(formatRest(e.restSec));
  const [reps, setReps] = useState(e.reps);
  const restBad = parseRest(rest) == null || (parseRest(rest) ?? 0) > 900;
  return (
    <div className="exrow">
      <span className="c-name"><code>{String(n + 1).padStart(2, "0")}</code>{e.name}
        {featureOn("adaptive") && <button type="button" className="subs-btn" aria-expanded={subsOpen} onClick={onSubs} aria-label={`${subs} de ${e.name}`}>{subs}</button>}</span>
      <span className="c-s"><input type="number" min={1} max={20} value={e.sets} aria-label={`Series de ${e.name}`} onChange={(ev) => onChange({ sets: Math.max(1, Math.min(20, Number(ev.target.value) || 1)) })} /></span>
      <span className="c-r"><input value={reps} aria-label={`Repeticiones de ${e.name}`} aria-invalid={!reps.trim() || undefined} maxLength={40}
        onChange={(ev) => { setReps(ev.target.value); if (ev.target.value.trim()) onChange({ reps: ev.target.value }); }} /></span>
      <span className="c-rir"><input type="number" min={0} max={5} value={e.rir ?? ""} aria-label={`RIR de ${e.name}`} placeholder="—"
        onChange={(ev) => onChange({ rir: ev.target.value === "" ? null : Math.max(0, Math.min(5, Number(ev.target.value))) })} /></span>
      <span className="c-rest"><input value={rest} aria-label={`Descanso de ${e.name}`} aria-invalid={restBad || undefined} placeholder="m:ss"
        onChange={(ev) => { setRest(ev.target.value); const s = parseRest(ev.target.value); if (s != null && s <= 900) onChange({ restSec: s }); }}
        onBlur={() => setRest(formatRest(e.restSec))} /></span>
      <span className="c-act">
        <button type="button" className="ibtn" aria-label={`Subir ${e.name}`} disabled={n === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="ibtn" aria-label={`Quitar ${e.name}`} onClick={onRemove}>×</button>
      </span>
    </div>
  );
}
