"use client";
// D195 · Historial corregible del alumno (bloque 05/06). Lista con estado, detalle de la sesión serie por serie y corrección
// en una sola hoja: peso, repeticiones, RIR, sensación y nota; anular o restaurar una serie o la sesión entera; agregar una
// serie prescripta que se hizo y no se registró. Todo pasa por el servidor (con conexión): nada se marca como guardado antes
// de que el servidor lo confirme. Anular es reversible y lo dice antes de hacerlo.
import { useCallback, useEffect, useState } from "react";
import { HISTORY_STATUS_LABEL, SET_FEEL, correctionSummary, formatClock, kgTo, parseWeightIn, volumeIn, type SetFeel, type WeightUnit } from "@repi/domain";
import { api, ApiError } from "@/lib/api";
import { RepiAsk } from "@/components/brain/RepiAsk";
import { delLocal, getLocal } from "@/lib/offline/store";
import { pendingFor } from "@/lib/offline/queue";
import { Sheet } from "./Sheet";
import { kg } from "./types";
import { useUnit } from "./units";
import { Hint } from "./Hint";
import { SessionCalories } from "./SessionCalories";

export type HistoryItem = {
  id: string; dayName: string; startedAt: string; endedAt: string; durationSec: number; status: "completed" | "voided";
  exercises: number; sets: number; volumeKg: number; rpe: number | null; voidedAt: string | null; corrected: boolean; voidedSets: number;
};
type SetLogV = { id: string; setIndex: number; weightKg: number | null; reps: number | null; rir: number | null; feel: string | null; note: string | null; completedAt: string; revision: number; voidedAt: string | null; voidReason: string | null; corrected: boolean; added: boolean };
type Row = { setIndex: number; label: string | null; kind: string; block: number; stage: number; timed: boolean; warmup: boolean; planned: { reps: string; weightKg: number | null }; log: SetLogV | null; skipped: boolean };
type Ex = { id: string; name: string; doneName: string; sets: number; reps: string; change: { kind: string; reason: string; substitute: string | null } | null; rows: Row[];
  compare: { previous: { weightKg: number | null; reps: number | null }; current: { weightKg: number | null; reps: number | null } } | null };
type Detail = {
  id: string; dayName: string; status: "completed" | "voided"; startedAt: string; endedAt: string; durationSec: number; rpe: number | null; note: string | null; revision: number;
  voidedAt: string | null; voidReason: string | null; actions: { edit: boolean; voidSession: boolean; restoreSession: boolean };
  metrics: { sets: number; stages: number; reps: number; volumeKg: number };
  prs: { exercise: string; current: { weightKg: number; reps: number }; previous: { weightKg: number; reps: number } }[];
  exercises: Ex[]; previous: { id: string; endedAt: string } | null;
  corrections: { id: string; action: string; setLogId: string | null; before: Record<string, unknown>; after: Record<string, unknown>; reason: string | null; at: string; byOwner: boolean }[];
};

const dateTxt = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const timeTxt = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const rid = () => crypto.randomUUID();
const setName = (r: Row) => (r.stage > 0 ? `${r.label ?? "Etapa"} de la serie ${r.block + 1}` : `Serie ${r.block + 1}${r.label ? ` · ${r.label}` : ""}`);
const ACTION_TXT: Record<string, string> = { set_edit: "Serie corregida", set_void: "Serie anulada", set_restore: "Serie restaurada", set_add: "Serie agregada", session_void: "Entrenamiento anulado", session_restore: "Entrenamiento restaurado" };

/** Cuando el servidor confirmó una corrección: la copia del teléfono de esa sesión (resumen viejo) se descarta si no tiene pendientes. */
async function dropStaleLocal(id: string) {
  try { if ((await getLocal(id)) && !(await pendingFor(id))) await delLocal(id); } catch { /* sin almacenamiento local */ }
}

export function HistoryList({ items, onOpen }: { items: HistoryItem[]; onOpen: (id: string) => void }) {
  const unit = useUnit();
  return (
    <ul className="hist hx-list" aria-label="Entrenamientos">
      {items.map((s) => (
        <li key={s.id}><button type="button" className={`hx-row${s.status === "voided" ? " is-void" : ""}`} onClick={() => onOpen(s.id)}
          aria-label={`${s.dayName}, ${dateTxt(s.endedAt)}${s.status === "voided" ? ", anulado" : ""}. ${s.sets} series. Abrir detalle`}>
          <span><b>{s.dayName}</b>{s.status === "voided" && <span className="hx-chip bad">Anulado</span>}{s.corrected && s.status !== "voided" && <span className="hx-chip">Corregido</span>}<br />
            <small className="mb-muted">{dateTxt(s.endedAt)} · {formatClock(s.durationSec)}{s.rpe ? ` · RPE ${s.rpe}` : ""}</small></span>
          <span className="mb-muted">{s.status === "voided" ? "No cuenta" : `${s.sets} series · ${volumeIn(s.volumeKg, unit).toLocaleString("es-AR")} ${unit}`}</span>
        </button></li>
      ))}
    </ul>
  );
}

/** Detalle de una sesión del historial con sus acciones. `onChanged` recarga la lista y el progreso. */
export function HistorySession({ id, flash, onClose, onChanged, offline, onRegisterWeight }: { id: string; flash: (t: string) => void; onClose: () => void; onChanged: () => void; offline?: boolean; onRegisterWeight?: () => void }) {
  const unit = useUnit();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ ex: Ex; row: Row } | null>(null);
  const [busy, setBusy] = useState(false);
  const [askVoid, setAskVoid] = useState(false);
  const load = useCallback(() => api<Detail>(`/api/me/history/${id}`).then((x) => { setD(x); setErr(null); }).catch((e) => setErr((e as Error).message)), [id]);
  useEffect(() => { void load(); }, [load]);
  const changed = async (msg: string) => { flash(msg); await dropStaleLocal(id); await load(); onChanged(); };
  const restore = async () => {
    if (!d) return;
    setBusy(true);
    try { await api(`/api/me/history/${d.id}/void`, { body: { requestId: rid(), voided: false, baseRevision: d.revision } }); await changed("Entrenamiento restaurado: vuelve a contar en tu progreso."); }
    catch (e) { flash((e as Error).message); await load(); } finally { setBusy(false); }
  };
  const title = d ? d.dayName : "Entrenamiento";
  return (
    <Sheet title={title} sub={d ? `${dateTxt(d.startedAt)} · empezó ${timeTxt(d.startedAt)} · ${formatClock(d.durationSec)} activos` : undefined} closeLabel="Cerrar" onClose={onClose}>
      {err && <p role="alert" className="mb-err">{err} <button type="button" className="linkbtn" onClick={() => void load()}>Reintentar</button></p>}
      {!d && !err && <p className="mb-muted">Cargando…</p>}
      {d && (
        <div className="hx-detail">
          {d.status === "voided" && (
            <div className="conflict" role="status">
              <strong>Anulaste este entrenamiento{d.voidedAt ? ` el ${timeTxt(d.voidedAt)}` : ""}</strong>
              <span>No cuenta en tu progreso, récords ni recomendaciones. Sus series siguen guardadas{d.voidReason ? ` · Motivo: ${d.voidReason}` : ""}.</span>
              <div><button type="button" className="cta sm" aria-busy={busy || undefined} disabled={busy || offline} onClick={() => void restore()}>Restaurar entrenamiento</button></div>
            </div>
          )}
          <div className="stats3">
            <div><strong>{d.metrics.sets}</strong><span>Series</span></div>
            <div><strong>{d.metrics.reps}</strong><span>Repeticiones</span></div>
            <div><strong>{volumeIn(d.metrics.volumeKg, unit).toLocaleString("es-AR")}</strong><span>Volumen ({unit})</span></div>
          </div>
          {/* D209: preguntar por esta sesión (se cierra la hoja para que el panel no quede debajo). */}
          {d.status === "completed" && !offline && <RepiAsk section="history" refs={{ sessionId: d.id }} subject={d.dayName} label="Preguntale a REPI por esta sesión" before={onClose}
            chips={[{ label: "¿Cómo me fue?", text: "¿Cómo me fue respecto de la anterior?" }, { label: "¿Qué hago la próxima?", text: "¿Qué hago la próxima?" }]} />}
          {d.status === "completed" && !offline && <SessionCalories sessionId={d.id} refresh={d.revision} onRegisterWeight={onRegisterWeight} />}
          {d.prs.length > 0 && <p className="hx-pr" role="note">Récord: {d.prs.map((p) => `${p.exercise} ${kg(p.current.weightKg, unit)} × ${p.current.reps}`).join(" · ")}</p>}
          {d.actions.edit && <Hint id="history_edit" text="Tocá una serie para corregir peso, repeticiones o RIR, o anularla si la marcaste por error. Tus récords y recomendaciones se recalculan con lo corregido." />}
          {d.exercises.map((e) => (
            <section key={e.id} className="hx-ex" aria-label={e.doneName}>
              <div className="hx-ex-head"><b>{e.change?.kind === "substitute" && e.change.substitute ? `${e.change.substitute} (en lugar de ${e.name})` : e.name}</b>
                {e.change?.kind === "skip" && <span className="hx-chip">Salteado</span>}
                {e.compare && <small className="mb-muted">Mejor serie: {kg(e.compare.current.weightKg, unit)} × {e.compare.current.reps} · la vez anterior {kg(e.compare.previous.weightKg, unit)} × {e.compare.previous.reps}</small>}</div>
              <ul className="hx-sets" aria-label={`Series de ${e.doneName}`}>
                {e.rows.map((r) => {
                  const l = r.log;
                  const val = l ? `${r.timed ? `${l.reps ?? "—"} s` : `${l.weightKg != null && l.weightKg > 0 ? `${kg(l.weightKg, unit)} × ` : ""}${l.reps ?? "—"}`}${l.rir != null ? ` · RIR ${l.rir}` : ""}${l.feel ? ` · ${SET_FEEL[l.feel as SetFeel] ?? l.feel}` : ""}` : r.skipped ? "Sin hacer" : "No registrada";
                  const can = d.actions.edit && !offline;
                  return (
                    <li key={r.setIndex}><button type="button" className={`hx-set${r.stage > 0 ? " stage" : ""}${l?.voidedAt ? " is-void" : ""}${!l ? " is-empty" : ""}`} disabled={!can}
                      onClick={() => setEdit({ ex: e, row: r })} aria-label={`${setName(r)}: ${val}${l?.voidedAt ? ", anulada" : ""}${l?.corrected ? ", corregida" : ""}${can ? ". Tocá para corregir" : ""}`}>
                      <span>{r.stage > 0 ? `↳ ${r.label ?? "Etapa"}` : `${r.block + 1}${r.label ? ` · ${r.label}` : ""}`}</span>
                      <span>{val}{l?.note && <small className="mb-muted"> · «{l.note}»</small>}</span>
                      <span>{l?.voidedAt ? <span className="hx-chip bad">Anulada</span> : l?.added ? <span className="hx-chip">Agregada</span> : l?.corrected ? <span className="hx-chip">Corregida</span> : null}</span>
                    </button></li>
                  );
                })}
              </ul>
            </section>
          ))}
          {d.corrections.length > 0 && (
            <details className="hx-log">
              <summary>Cambios ({d.corrections.length})</summary>
              <ul>{d.corrections.map((c) => (
                <li key={c.id}><b>{ACTION_TXT[c.action] ?? c.action}</b> · {timeTxt(c.at)}{c.byOwner ? "" : " · por otra persona"}
                  {c.action === "set_edit" && <><br /><small>{correctionSummary({ before: c.before, after: c.after }, (n) => kg(n, unit))}</small></>}
                  {c.reason && <><br /><small className="mb-muted">Motivo: {c.reason}</small></>}</li>
              ))}</ul>
            </details>
          )}
          <p className="mb-muted" style={{ fontSize: 12 }}>Fecha del entrenamiento: {timeTxt(d.startedAt)}. Las correcciones guardan su propia fecha y no cambian cuándo entrenaste.</p>
          {offline && <p className="mb-note" role="status">Sin conexión: podés ver el entrenamiento, pero corregirlo necesita conexión.</p>}
          {d.actions.voidSession && !offline && <button type="button" className="ghost hx-danger" onClick={() => setAskVoid(true)}>Eliminar entrenamiento</button>}
        </div>
      )}
      {edit && d && <SetEditSheet sessionId={d.id} ex={edit.ex} row={edit.row} unit={unit} onClose={() => setEdit(null)} flash={flash}
        onDone={async (m) => { setEdit(null); await changed(m); }} onStale={async () => { await load(); }} />}
      {askVoid && d && <VoidSessionSheet d={d} onClose={() => setAskVoid(false)} flash={flash} onDone={async () => { setAskVoid(false); await changed("Entrenamiento anulado. Podés restaurarlo desde tu historial."); }} />}
    </Sheet>
  );
}

function VoidSessionSheet({ d, onClose, onDone, flash }: { d: Detail; onClose: () => void; onDone: () => void; flash: (t: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api(`/api/me/history/${d.id}/void`, { body: { requestId: rid(), voided: true, reason: reason.trim() || null, baseRevision: d.revision } }); onDone(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="¿Eliminar este entrenamiento?" sub={`«${d.dayName}» del ${dateTxt(d.startedAt)} sale de tu historial activo, de tu progreso, de tus récords y de las recomendaciones de REPI. No se borra: lo podés restaurar cuando quieras.`}
      onClose={onClose} closeLabel="Cancelar" text={{ value: reason, onChange: (v) => setReason(v.slice(0, 200)), placeholder: "Motivo (opcional): era de prueba, lo cargué dos veces…" }}
      action={{ label: busy ? "Eliminando…" : "Eliminar entrenamiento", ready: !busy, busy, onSubmit: () => void go() }}>
      <p className="mb-muted" style={{ fontSize: 12 }}>¿Querés borrar tus datos de REPI para siempre? Eso es otra cosa: se pide desde Perfil → Privacidad.</p>
    </Sheet>
  );
}

const FEELS = Object.keys(SET_FEEL).filter((k) => k !== "ayuda") as SetFeel[];

/** Hoja de corrección de una serie: cambia sólo lo que la persona toca; la anulación es reversible. */
function SetEditSheet({ sessionId, ex, row, unit, onClose, onDone, onStale, flash }: {
  sessionId: string; ex: Ex; row: Row; unit: WeightUnit; onClose: () => void; onDone: (msg: string) => void; onStale: () => void; flash: (t: string) => void;
}) {
  const l = row.log;
  const shownW = l?.weightKg != null ? kgTo(l.weightKg, unit) : null;
  const initialW = shownW != null ? String(shownW).replace(".", ",") : "";
  const initialR = l?.reps != null ? String(l.reps) : "";
  const [w, setW] = useState(initialW);
  const [r, setR] = useState(initialR);
  const [rir, setRir] = useState<number | null>(l?.rir ?? null);
  const [feel, setFeel] = useState<string | null>(l?.feel ?? null);
  const [note, setNote] = useState(l?.note ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const voided = !!l?.voidedAt;
  const values = () => {
    const out: Record<string, unknown> = {};
    const wk = w.trim() ? parseWeightIn(w, unit) : null;
    if (w.trim() && wk == null) throw new Error(`Peso inválido: hasta 2 decimales, entre 0 y ${unit === "kg" ? "1000 kg" : "2204 lb"}.`);
    // Sólo si la persona cambió lo escrito: en lb, reenviar lo mostrado «corregiría» un redondeo de la conversión.
    if (l == null || w !== initialW) out.weightKg = wk;
    const reps = r.trim() ? Number(r) : null;
    if (r.trim() && (!Number.isInteger(reps) || reps! < 0)) throw new Error(row.timed ? "Los segundos tienen que ser un número entero." : "Las repeticiones tienen que ser un número entero.");
    if (l == null || r !== initialR) out.reps = reps;
    if (l == null || rir !== l.rir) out.rir = rir;
    if (l == null || feel !== l.feel) out.feel = feel;
    if (l == null || (note.trim() || null) !== (l.note ?? null)) out.note = note.trim() || null;
    return out;
  };
  const send = async (confirm = false) => {
    setMsg(null);
    let v: Record<string, unknown>;
    try { v = values(); } catch (e) { setMsg((e as Error).message); return; }
    if (l && !Object.keys(v).length) { onClose(); return; }
    setBusy(true);
    try {
      if (l) await api(`/api/me/history/${sessionId}/sets/${l.id}`, { body: { requestId: rid(), baseRevision: l.revision, values: v, reason: reason.trim() || null, confirm } });
      else await api(`/api/me/history/${sessionId}/sets`, { body: { requestId: rid(), programExerciseId: ex.id, setIndex: row.setIndex, values: v, reason: reason.trim() || null, confirm } });
      onDone(l ? `${setName(row)} corregida. Tu progreso ya usa el valor nuevo.` : `${setName(row)} agregada.`);
    } catch (e) {
      const x = e as ApiError;
      if (x.code === "confirm_required" && window.confirm(`${x.message}\n\n¿Guardar igual?`)) { setBusy(false); await send(true); return; }
      if (x.code === "correction_conflict") { setMsg("Esta serie cambió en otro dispositivo mientras la corregías. Te mostramos los valores actuales: revisalos y volvé a guardar."); onStale(); }
      else setMsg(x.message);
    } finally { setBusy(false); }
  };
  const toggleVoid = async () => {
    if (!l) return;
    if (!voided && !window.confirm(`¿Anular ${setName(row).toLowerCase()}? Deja de contar en tu progreso y récords. La podés restaurar.`)) return;
    setBusy(true);
    try { await api(`/api/me/history/${sessionId}/sets/${l.id}/void`, { body: { requestId: rid(), voided: !voided, reason: reason.trim() || null } }); onDone(voided ? "Serie restaurada." : "Serie anulada. La podés restaurar desde acá."); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title={`${l ? "Corregir" : "Agregar"} · ${setName(row)}`} sub={`${ex.doneName} · indicado: ${row.planned.reps}${row.planned.weightKg != null ? ` · ${kg(row.planned.weightKg, unit)}` : ""}`} closeLabel="Cancelar" onClose={onClose}>
      {voided ? (
        <p className="sheet-warn" role="note">Esta serie está anulada{l?.voidReason ? ` (${l.voidReason})` : ""}. Restaurala para que vuelva a contar o para corregirla.</p>
      ) : (
        <>
          {!l && <p className="sheet-warn" role="note">Sólo agregá una serie que hiciste de verdad. Queda con la hora del cierre del entrenamiento y marcada como agregada después.</p>}
          <div className="hx-fields">
            {!row.timed && <label className="hx-field">Peso ({unit})<input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Peso corporal" /></label>}
            <label className="hx-field">{row.timed ? "Segundos" : "Repeticiones"}<input inputMode="numeric" value={r} onChange={(e) => setR(e.target.value.replace(/\D/g, ""))} aria-label={row.timed ? "Segundos" : "Repeticiones"} /></label>
          </div>
          <fieldset className="sheet-group"><legend>Reps en reserva (RIR, opcional)</legend><div>
            {[0, 1, 2, 3, 4].map((v) => <button type="button" key={v} aria-pressed={rir === v} onClick={() => setRir(rir === v ? null : v)}>{v === 4 ? "4+" : v}</button>)}
            {rir != null && rir > 4 && <button type="button" aria-pressed="true" onClick={() => setRir(null)}>RIR {rir}</button>}</div></fieldset>
          <fieldset className="sheet-group"><legend>Sensación (opcional)</legend><div>
            {FEELS.map((k) => <button type="button" key={k} aria-pressed={feel === k} onClick={() => setFeel(feel === k ? null : k)}>{SET_FEEL[k]}</button>)}</div></fieldset>
          <label className="hx-field">Nota (opcional)<input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></label>
        </>
      )}
      <label className="hx-field">Motivo del cambio (opcional)<input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: cargué mal el disco" /></label>
      {msg && <p className="mb-err" role="alert">{msg}</p>}
      {!voided && <button type="button" className="cta" aria-busy={busy || undefined} disabled={busy} onClick={() => void send()}>{busy ? "Guardando…" : l ? "Guardar corrección" : "Agregar serie"}</button>}
      {l && <button type="button" className={voided ? "cta" : "ghost hx-danger"} aria-busy={busy || undefined} disabled={busy} onClick={() => void toggleVoid()}>{voided ? "Restaurar serie" : "Anular serie (la marqué por error)"}</button>}
    </Sheet>
  );
}
