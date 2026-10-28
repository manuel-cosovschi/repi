"use client";
// Sesión activa y resumen (App Alumno v4 · «Entrenamiento activo» / «Entrenamiento completado»).
// Fuente de verdad en el dispositivo: IndexedDB. Cada cambio se guarda localmente y se sincroniza por la cola;
// reloj y descanso por timestamp; conflictos visibles con las dos versiones (Etapa 3).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXERCISE_CHANGE_REASONS, FEEL_ALERTS, SET_FEEL, WEIGHT_STEPS, WEIGHT_STEPS_LB, activeSeconds, formatClock, kgTo, parseReps, parseWeightIn, restLeft, stepReps, stepWeightIn, volumeIn, volumeKg, type SetFeel, type WeightUnit } from "@repi/domain";
import { api } from "@/lib/api";
import { getLocal, putLocal, delLocal, fromServer, localAction, setKey, type ExChange, type LocalEx, type LocalSession } from "@/lib/offline/store";
import { dropSession, enqueue, flush, pendingFor, subscribe, type SyncState } from "@/lib/offline/queue";
import { kg, metaTxt, prevTxt, type Summary } from "./types";
import { useUnit } from "./units";
import { PainSheet } from "./FollowSheets";
import { PlatesSheet } from "./PlatesSheet";
import { ExerciseChangeSheet } from "./ExerciseChange";
import { Sheet } from "./Sheet";
import { cancelRestAlert, disableRestAlert, enableRestAlert, restAlertState, scheduleRestAlert, type RestAlertState } from "@/lib/restAlert";
import { Confetti } from "@/components/motion/Confetti";
import { StepSlider } from "@/components/motion/StepSlider";
import { seedOf } from "@/lib/confetti";
import { prefersReducedMotion } from "@/lib/motion";
import { Ic } from "@/components/ui/Ic";
import { ArrowLeft, ArrowsClockwise, CaretLeft, CaretRight, ChatCircleText, Check, NotePencil, Pause, Play, Trophy } from "@phosphor-icons/react";
import { featureOn } from "@/lib/features";

const RING = 207.35;
type DoneData = {
  id: string; dayName: string; activeMs: number; exDone: number; exSkipped: number; exTotal: number; setsDone: number; setsTotal: number; volumeKg: number;
  prs: Summary["prs"]; rows: { name: string; txt: string }[]; rpe: number | null; sessionNote: string | null; local: boolean;
};

/** Nombre de lo que se hizo (F-HX-21): el reemplazo, si lo hubo. */
const doneName = (e: { name: string; change?: ExChange | null }) => (e.change?.kind === "substitute" && e.change.substitute ? `${e.change.substitute.name} (en lugar de ${e.name})` : e.name);
const skipTxt = (c?: ExChange | null) => `Salteado · ${c ? EXERCISE_CHANGE_REASONS[c.reason].toLowerCase() : ""}`;

function localSummary(s: LocalSession, unit: WeightUnit): DoneData {
  const done = Object.entries(s.sets).filter(([, x]) => x.done);
  const full = (e: LocalEx) => Array.from({ length: e.sets }, (_, i) => s.sets[setKey(e.id, i)]?.done).every(Boolean);
  return {
    id: s.id, dayName: s.dayName, activeMs: s.activeMs, local: true, prs: [], rpe: s.rpe, sessionNote: s.sessionNote,
    exDone: s.exercises.filter(full).length, exSkipped: s.exercises.filter((e) => e.change?.kind === "skip" && !full(e)).length,
    exTotal: s.exercises.length, setsDone: done.length, setsTotal: s.exercises.reduce((a, e) => a + e.sets, 0),
    volumeKg: volumeKg(done.map(([, x]) => ({ exerciseId: "", weightKg: x.w, reps: x.r, completed: true }))),
    rows: s.exercises.map((e) => {
      const xs = Array.from({ length: e.sets }, (_, i) => s.sets[setKey(e.id, i)]).filter((x) => x?.done);
      const sets = xs.length ? `${xs.length} × ${[...new Set(xs.map((x) => kg(x.w, unit)))].join(" / ")}` : "";
      if (e.change?.kind === "skip" && !full(e)) return { name: e.name, txt: sets ? `${sets} · ${skipTxt(e.change)}` : skipTxt(e.change) };
      return xs.length ? { name: doneName(e), txt: sets } : null;
    }).filter(Boolean) as { name: string; txt: string }[],
  };
}
function serverSummary(x: Summary, unit: WeightUnit): DoneData {
  return {
    id: x.id, dayName: x.dayName, activeMs: x.activeMs, exDone: x.exDone, exSkipped: x.exSkipped ?? 0, exTotal: x.exTotal, setsDone: x.setsDone, setsTotal: x.setsTotal, volumeKg: x.volumeKg,
    prs: x.prs, rpe: x.rpe, sessionNote: x.sessionNote, local: false,
    rows: x.exercises.filter((e) => e.logs.length || e.change?.kind === "skip").map((e) => {
      const sets = e.logs.length ? `${e.logs.length} × ${[...new Set(e.logs.map((l) => kg(l.weightKg, unit)))].join(" / ")}` : "";
      if (e.change?.kind === "skip" && e.logs.length < e.sets) return { name: e.name, txt: sets ? `${sets} · ${skipTxt(e.change)}` : skipTxt(e.change) };
      return { name: doneName(e), txt: sets };
    }),
  };
}

export function Workout({ sessionId, coachFirst, gym, onExit, flash }: { sessionId: string; coachFirst: string; gym: boolean; onExit: (to: "train" | "home" | "prog") => void; flash: (t: string) => void }) {
  const unit = useUnit();
  const [s, setS] = useState<LocalSession | null>(null);
  const [exIdx, setExIdx] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [rir, setRir] = useState<number | null>(null);
  const [feel, setFeel] = useState<SetFeel | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sync, setSync] = useState<SyncState>({ kind: "idle", pending: 0 });
  const [summary, setSummary] = useState<DoneData | null>(null);
  // M02: sólo el cierre hecho en esta pantalla puede celebrar; abrir un resumen existente o recargar no.
  const [justFinished, setJustFinished] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pain, setPain] = useState(false);
  const [plates, setPlates] = useState(false);
  const [changing, setChanging] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  // Nota de la serie en edición (F-HX-21): como RIR y sensación, se guarda al completar o guardar la serie.
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [restAlert, setRestAlert] = useState<RestAlertState>("unsupported");
  useEffect(() => { setRestAlert(restAlertState()); return cancelRestAlert; }, []);

  const commit = useCallback(async (next: LocalSession) => { setS(next); await putLocal(next); }, []);

  const showSummary = useCallback(async (local: LocalSession) => {
    // Con conexión y sin pendientes: resumen del servidor (incluye récords). Si no, el local.
    try {
      if ((await pendingFor(local.id)) === 0) { setSummary(serverSummary(await api<Summary>(`/api/me/sessions/${local.id}/summary`), unit)); return; }
    } catch { /* sin red */ }
    setSummary(localSummary(local, unit));
  }, []);

  const load = useCallback(async () => {
    const local = await getLocal(sessionId);
    const pending = await pendingFor(sessionId);
    let x: LocalSession | undefined = local;
    if (!local || (pending === 0 && !local.conflict)) {
      try {
        const srv = await api<Parameters<typeof fromServer>[0]>(`/api/me/sessions/${sessionId}`);
        x = fromServer(srv, local?.rest);
        await putLocal(x);
      } catch (e) {
        if (!local) { setErr((e as Error).message || "Sin conexión y sin datos de este entrenamiento en el teléfono."); return; }
      }
    } else void flush();
    if (!x) return;
    setS(x);
    if (x.status === "completed" || x.status === "abandoned") { await showSummary(x); return; }
    const firstOpen = x.exercises.findIndex((e) => e.change?.kind !== "skip" && Array.from({ length: e.sets }, (_, i) => x!.sets[setKey(e.id, i)]).some((y) => !y.done));
    setExIdx(firstOpen < 0 ? Math.max(0, x.exercises.length - 1) : firstOpen);
  }, [sessionId, showSummary]);
  useEffect(() => { load().catch((e) => setErr((e as Error).message)); }, [load]);
  useEffect(() => subscribe(async (st) => {
    setSync(st);
    // Tras sincronizar, el estado local (revisiones, conflictos) puede haber cambiado.
    const fresh = await getLocal(sessionId);
    if (fresh) setS((cur) => (cur && fresh.updatedAt > cur.updatedAt ? fresh : cur));
  }), [sessionId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  const rest = s?.rest ?? null;
  const left = rest ? (rest.paused ? rest.left : restLeft(rest.end, now)) : 0;
  useEffect(() => { if (s && rest && !rest.paused && left <= 0) { void commit({ ...s, rest: null }); flash("Descanso terminado. ¡A la próxima serie!"); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const ex = s?.exercises[exIdx];
  // F-HX-22: aviso local al terminar el descanso si la app pasa a segundo plano (opcional, por dispositivo).
  const restEnd = rest && !rest.paused ? rest.end : null;
  useEffect(() => {
    if (!restEnd || restAlert !== "on") { cancelRestAlert(); return; }
    scheduleRestAlert(restEnd, ex ? `Seguí con ${ex.change?.substitute?.name ?? ex.name}.` : "Seguí con la próxima serie.");
  }, [restEnd, restAlert]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (s && ex ? Array.from({ length: ex.sets }, (_, i) => s.sets[setKey(ex.id, i)]) : []), [s, ex]);
  const cur = sel ?? rows.findIndex((r) => !r.done);
  const curRow = cur >= 0 ? rows[cur] : null;
  const repsKind = ex ? parseReps(ex.reps).kind : "reps";
  const elapsed = s ? activeSeconds(s.activeMs, s.status === "in_progress" ? s.lastResumedAt : null, new Date(now)) : 0;
  const paused = s?.status === "paused";
  const conflicts = s ? Object.entries(s.sets).filter(([, x]) => x.conflict) : [];

  // Resultado del aviso al piso (llega cuando la serie se sincroniza).
  useEffect(() => {
    const on = (e: Event) => {
      const n = (e as CustomEvent<{ notified: number }>).detail?.notified ?? 0;
      flash(n > 0 ? "Le avisamos al equipo de sala en turno." : "No hay nadie de sala con avisos activos: buscá a alguien en el salón.");
    };
    window.addEventListener("repi:floor-alert", on);
    return () => window.removeEventListener("repi:floor-alert", on);
  }, [flash]);

  const editCur = (p: Partial<{ w: number; r: number; rir: number | null; feel: string | null }>) => {
    if (!s || !ex || cur < 0) return;
    void commit({ ...s, sets: { ...s.sets, [setKey(ex.id, cur)]: { ...s.sets[setKey(ex.id, cur)], ...p } } });
  };
  const complete = async () => {
    if (!s || !ex || cur < 0 || !curRow) return;
    const k = setKey(ex.id, cur);
    const wasDone = curRow.done;
    const f = wasDone ? curRow.feel ?? null : feel;
    const sets = { ...s.sets, [k]: { ...curRow, rir: wasDone ? curRow.rir : rir, feel: f, note: noteDraft?.trim() || null, done: true, at: curRow.at ?? new Date().toISOString() } };
    if (!wasDone) for (let i = cur + 1; i < ex.sets; i++) { const kk = setKey(ex.id, i); if (!sets[kk].done) sets[kk] = { ...sets[kk], w: curRow.w }; }
    const more = !wasDone && Array.from({ length: ex.sets }, (_, i) => sets[setKey(ex.id, i)]).some((x) => !x.done);
    const next = { ...s, sets, rest: more && ex.restSec > 0 ? { end: Date.now() + ex.restSec * 1000, total: ex.restSec, left: ex.restSec, paused: false } : s.rest };
    setRir(null); setFeel(null); setSel(null); setNoteDraft(null);
    await commit(next);
    await enqueue({ key: `set:${s.id}:${k}`, kind: "set", sid: s.id, peId: ex.id, idx: cur });
    if (!wasDone && gym && f && FEEL_ALERTS.includes(f as SetFeel) && !navigator.onLine) flash("Sin conexión: el aviso a sala sale al reconectar (si pasaron menos de 10 minutos).");
    if (wasDone) flash(`Serie ${cur + 1} actualizada.`);
  };
  const act = async (action: "pause" | "resume") => {
    if (!s) return;
    const n = localAction(s, action);
    if (!n) return;
    await commit(n);
    await enqueue({ key: `action:${s.id}:${Date.now()}`, kind: "action", sid: s.id, action, at: new Date().toISOString() });
    if (action === "pause") flash("Entrenamiento en pausa. El reloj se detuvo.");
  };
  const finish = async () => {
    if (!s) return;
    // «Finalizar» está siempre en la cabecera: terminar con series pendientes se confirma (F-06). Lo registrado queda igual.
    const left = s.exercises.reduce((n, e, i) => n + (skippedAt(i) ? 0 : rowsOf(i).filter((r) => !r.done).length), 0);
    if (left && anyDone && !window.confirm(`Te ${left === 1 ? "queda 1 serie" : `quedan ${left} series`} sin hacer. ¿Terminar igual? Lo que registraste queda guardado.`)) return;
    setBusy(true);
    try {
      const n = localAction(s, "finish");
      if (!n) { await showSummary(s); return; }
      if (n.status === "abandoned") {
        // Sin series: nada que registrar. Si el inicio todavía no llegó al servidor, se descarta sólo acá.
        if (!s.synced) { await dropSession(s.id); await delLocal(s.id); }
        else { await commit({ ...n, rest: null }); await enqueue({ key: `action:${s.id}:${Date.now()}`, kind: "action", sid: s.id, action: "finish", at: new Date().toISOString() }); }
        flash("No registraste series: la sesión se descartó.");
        onExit("train");
        return;
      }
      const done = { ...n, rest: null };
      await commit(done);
      await enqueue({ key: `action:${s.id}:${Date.now()}`, kind: "action", sid: s.id, action: "finish", at: new Date().toISOString() });
      await flush();
      // Si otra pasada de la cola seguía en curso, esperar (hasta ~2 s) a que se vacíe: así el resumen sale del servidor
      // con récords confirmados. Sin conexión no se espera: el resumen local lo dice y no celebra como confirmado (M02).
      for (let i = 0; i < 12 && navigator.onLine && (await pendingFor(s.id)) > 0; i++) { await new Promise((r) => setTimeout(r, 160)); await flush(); }
      setJustFinished(true);
      await showSummary(done);
      window.scrollTo(0, 0);
    } finally { setBusy(false); }
  };
  const resolveOpen = async (choice: "close_other" | "discard") => {
    if (!s) return;
    if (choice === "discard") { await dropSession(s.id); await delLocal(s.id); flash("Descartaste el entrenamiento de este dispositivo."); onExit("home"); return; }
    await commit({ ...s, conflict: undefined, closeOther: true });
    await flush();
  };
  const resolveSet = async (k: string, choice: "mine" | "other") => {
    if (!s) return;
    const x = s.sets[k];
    if (!x.conflict) return;
    // El servidor guarda «server» (aplicada) y «local» (la que quedó en conflicto); se traduce según de quién es cada una.
    const keep = x.conflict.appliedIsMine ? (choice === "mine" ? "server" : "local") : (choice === "mine" ? "local" : "server");
    try {
      await api(`/api/me/conflicts/${x.conflict.id}`, { body: { keep } });
      const srv = await api<Parameters<typeof fromServer>[0]>(`/api/me/sessions/${s.id}`);
      const fresh = fromServer(srv, s.rest);
      await commit({ ...s, sets: { ...s.sets, [k]: fresh.sets[k] } });
      flash(choice === "mine" ? "Quedó la serie de este dispositivo." : "Quedó la serie del otro dispositivo.");
    } catch (e) { flash((e as Error).message); }
  };

  /** Saltar, reemplazar o volver al original sólo en esta sesión (F-HX-21). Viaja por la cola como el resto. */
  const applyChange = async (c: ExChange | null, prev?: LocalEx["prev"]) => {
    if (!s || !ex) return;
    const wasSub = ex.change?.kind === "substitute";
    const nextEx: LocalEx = {
      ...ex, change: c,
      prev: c?.kind === "substitute" ? prev ?? null : wasSub ? ex.origPrev ?? null : ex.prev,
      origPrev: c?.kind === "substitute" ? (wasSub ? ex.origPrev ?? null : ex.prev) : undefined,
    };
    const sets = { ...s.sets };
    // Otro ejercicio no tiene la misma carga: las series pendientes arrancan de su último registro (o de 0).
    if (c?.kind === "substitute") for (let i = 0; i < ex.sets; i++) { const k = setKey(ex.id, i); if (!sets[k].done) sets[k] = { ...sets[k], w: prev?.weightKg ?? 0 }; }
    const exercises = s.exercises.map((e) => (e.id === ex.id ? nextEx : e));
    setSel(null); setRir(null); setFeel(null); setNoteDraft(null);
    await commit({ ...s, exercises, sets });
    await enqueue({ key: `exchange:${s.id}:${ex.id}`, kind: "exchange", sid: s.id, peId: ex.id });
    flash(!c ? `Volviste a ${ex.name}.` : c.kind === "skip" ? `Salteaste ${ex.name}.` : `Hacés ${c.substitute?.name} en lugar de ${ex.name}.`);
  };

  if (err) return <div className="mb-scroll nobar"><p role="alert" className="mb-err">{err}</p><button type="button" className="ghost" onClick={() => onExit("train")}>Volver</button></div>;
  if (summary) return <Done sum={summary} coachFirst={coachFirst} onExit={onExit} flash={flash} justFinished={justFinished} />;
  const painSheet = pain && s && ex ? <PainSheet exerciseName={ex.name} sessionId={s.id} flash={flash} onClose={() => setPain(false)} /> : null;
  if (!s || !ex) return <div className="mb-scroll nobar"><p className="mb-muted">Cargando entrenamiento…</p></div>;

  const rowsOf = (i: number) => Array.from({ length: s.exercises[i].sets }, (_, j) => s.sets[setKey(s.exercises[i].id, j)]);
  // Salteado = resuelto para avanzar y finalizar; sus series no hechas no se registran.
  const skippedAt = (i: number) => s.exercises[i].change?.kind === "skip";
  const resolved = (i: number) => skippedAt(i) || rowsOf(i).every((r) => r.done);
  const exSkipped = skippedAt(exIdx);
  const exComplete = rows.every((r) => r.done) || exSkipped;
  const nextEx = s.exercises.findIndex((_, i) => i > exIdx && !resolved(i));
  const anyOpen = s.exercises.some((_, i) => !resolved(i));
  const sub = ex.change?.kind === "substitute" ? ex.change.substitute : null;
  const anyDone = Object.values(s.sets).some((x) => x.done);
  const savedTxt = sync.kind === "saving" ? "Guardando…"
    : sync.kind === "offline" ? `Sin conexión · ${sync.pending} pendiente${sync.pending === 1 ? "" : "s"}`
      : sync.kind === "pending" ? `Pendiente de sincronizar (${sync.pending})`
        : sync.kind === "error" ? "Error al guardar"
          : sync.kind === "conflict" || conflicts.length ? "Conflicto por resolver"
            : anyDone ? (s.synced ? "Guardado" : "Guardado en el teléfono") : "Sin series todavía";
  const savedInk = sync.kind === "error" || sync.kind === "conflict" || conflicts.length ? "#FCA5A5" : sync.kind === "offline" || sync.kind === "pending" ? "#F59E0B" : "#5DE6D8";

  return (
    <div className="wo">
      <div className="wo-body">
        <div className="wo-head">
          <button type="button" className="mb-icon" aria-label="Volver" style={{ marginLeft: -8 }} onClick={() => onExit("train")}><Ic i={ArrowLeft} size={22} color="#F8FAFC" /></button>
          <div>
            <strong>{s.dayName}</strong>
            <small><span aria-label={`Duración ${formatClock(elapsed)}`}>{formatClock(elapsed)}</span> · <span role="status" style={{ color: savedInk }}>{savedTxt}</span> · <button type="button" className="linkbtn" onClick={() => act(paused ? "resume" : "pause")}>{paused ? "Reanudar" : "Pausar"}</button></small>
          </div>
          <button type="button" className="fin" onClick={finish} aria-busy={busy || undefined}>Finalizar</button>
        </div>
        {s.rejected ? (
          <div className="conflict" role="alert">
            <strong>No se pudo guardar en tu cuenta</strong>
            <span>{s.rejected.message} Tus series siguen en este teléfono y no se borran. Si tu acceso vuelve a estar vigente, se guardan solas.</span>
            <div><button type="button" className="cta sm" onClick={() => void flush()}>Reintentar</button><button type="button" className="ghost sm" onClick={async () => {
              if (!window.confirm("¿Descartar este entrenamiento de este teléfono? No se puede deshacer.")) return;
              await dropSession(s.id); await delLocal(s.id); flash("Descartaste el entrenamiento de este teléfono."); onExit("home");
            }}>Descartar de este teléfono</button></div>
          </div>
        ) : sync.kind === "error" && <p role="alert" className="mb-err">{sync.error}</p>}
        {s.conflict?.kind === "open_session" && (
          <div className="conflict" role="alert">
            <strong>Hay otro entrenamiento abierto en otro dispositivo</strong>
            <span>{s.conflict.other.dayName} · empezó {new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(s.conflict.other.startedAt))} · {s.conflict.other.sets} {s.conflict.other.sets === 1 ? "serie" : "series"}. Lo de este dispositivo sigue guardado en el teléfono.</span>
            <div><button type="button" className="cta sm" onClick={() => resolveOpen("close_other")}>Cerrar el otro y seguir con este</button><button type="button" className="ghost sm" onClick={() => resolveOpen("discard")}>Descartar este</button></div>
          </div>
        )}
        {conflicts.map(([k, x]) => {
          const [peId, idx] = k.split(":");
          const e = s.exercises.find((y) => y.id === peId);
          return (
            <div key={k} className="conflict" role="alert">
              <strong>Serie {Number(idx) + 1} de {e?.name}: hay dos versiones</strong>
              <span>{x.conflict!.appliedIsMine ? "Guardada" : "Este dispositivo"}: {kg(x.w, unit)} × {x.r}. {x.conflict!.appliedIsMine ? "Desde otro dispositivo" : "Otro dispositivo"}: {kg(x.conflict!.other.weightKg, unit)} × {x.conflict!.other.reps}. No se pisó ninguna.</span>
              <div><button type="button" className="cta sm" onClick={() => resolveSet(k, "mine")}>Usar {kg(x.w, unit)} × {x.r}</button><button type="button" className="ghost sm" onClick={() => resolveSet(k, "other")}>Usar {kg(x.conflict!.other.weightKg, unit)} × {x.conflict!.other.reps}</button></div>
            </div>
          );
        })}
        <div className="prog" aria-hidden="true">{s.exercises.map((e, i) => <i key={e.id} className={resolved(i) ? "done" : i === exIdx ? "cur" : ""} />)}</div>
        <div className="excard">
          <div className="excard-top">
            <div><small>Ejercicio {exIdx + 1} de {s.exercises.length}</small><strong>{sub ? sub.name : ex.name}</strong><small>{metaTxt(ex)}{ex.rir != null ? ` · RIR ${ex.rir}` : ""}</small>
              {ex.change && <small className="xc-tag">{sub ? `En lugar de ${ex.name}` : "Salteado"} · {EXERCISE_CHANGE_REASONS[ex.change.reason].toLowerCase()}</small>}</div>
            <div className="nav2">
              {!paused && <button type="button" aria-label={`Cambiar ${ex.name} en este entrenamiento`} onClick={() => setChanging(true)}><Ic i={ArrowsClockwise} size={16} /></button>}
              <button type="button" aria-label="Ejercicio anterior" disabled={exIdx === 0} onClick={() => { setExIdx(exIdx - 1); setSel(null); setRir(null); setNoteDraft(null); }}><Ic i={CaretLeft} size={16} /></button>
              <button type="button" aria-label="Ejercicio siguiente" disabled={exIdx === s.exercises.length - 1} onClick={() => { setExIdx(exIdx + 1); setSel(null); setRir(null); setNoteDraft(null); }}><Ic i={CaretRight} size={16} /></button>
            </div>
          </div>
          {featureOn("exercise_video") && <div className="video" aria-hidden="true">video demostración (pendiente)</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><small>Serie anterior</small><span style={{ fontSize: 15, fontWeight: 500 }}>{prevTxt(ex.prev)}</span></div>
          <div className="sets" role="list" aria-label="Series">
            <div className="sets-h" aria-hidden="true"><span>Serie</span><span>Peso ({unit})</span><span>{repsKind === "time" ? "Seg" : "Reps"}</span><span /></div>
            {rows.map((r, i) => (
              <button type="button" role="listitem" key={i} className="setrow" aria-current={i === cur} onClick={() => { setSel(i); setRir(r.rir); setNoteDraft(r.note ?? null); }}
                aria-label={`Serie ${i + 1}: ${kg(r.w, unit)}, ${r.r} ${repsKind === "time" ? "segundos" : "repeticiones"}${r.done ? ", completada" : ""}${r.note ? ", con nota" : ""}${r.conflict ? ", con conflicto" : ""}`}>
                <span>{i + 1}{r.note && <Ic i={NotePencil} size={11} color="#94A3B8" style={{ marginLeft: 3 }} />}</span><span>{String(r.w).replace(".", ",")}</span><span>{r.r}</span>
                <span className={`ck${r.done ? " on" : ""}${r.conflict ? " bad" : ""}`}>{r.done && <Ic i={Check} size={12} color="#fff" />}</span>
              </button>
            ))}
          </div>
        </div>
        {(ex.note || s.note) && (
          <div className="coach-tip"><Ic i={ChatCircleText} size={16} color="#94A3B8" style={{ marginTop: 2 }} /><span>{ex.note || s.note}</span></div>
        )}
      </div>
      <div className="dock">
        {paused ? (
          <>
            <span className="mb-muted" style={{ textAlign: "center", fontSize: 14 }}>Entrenamiento en pausa · {formatClock(elapsed)}</span>
            <button type="button" className="cta" onClick={() => act("resume")}>Reanudar</button>
          </>
        ) : rest && left > 0 && sel == null && !exSkipped ? (
          <>
            <div className="rest">
              <div><span className="mb-muted" style={{ fontSize: 14 }}>Descanso</span><strong role="timer" aria-live="off">{formatClock(left)}</strong></div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div className="ring">
                  <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" stroke="#1A2433" strokeWidth="4" /><circle cx="36" cy="36" r="33" fill="none" stroke="#00D1FF" strokeWidth="4" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - left / rest.total)} style={{ transition: "stroke-dashoffset 250ms linear" }} /></svg>
                  <button type="button" aria-label={rest.paused ? "Reanudar descanso" : "Pausar descanso"} onClick={() => commit({ ...s, rest: rest.paused ? { ...rest, paused: false, end: Date.now() + rest.left * 1000 } : { ...rest, paused: true, left, end: null } })}>
                    {rest.paused ? <Ic i={Play} size={20} weight="fill" color="#0B0F14" /> : <Ic i={Pause} size={20} weight="fill" color="#0B0F14" />}
                  </button>
                </div>
                <button type="button" className="plus30" onClick={() => commit({ ...s, rest: rest.paused ? { ...rest, left: rest.left + 30, total: rest.total + 30 } : { ...rest, end: (rest.end ?? Date.now()) + 30_000, total: rest.total + 30 } })}>+30s</button>
              </div>
            </div>
            <div className="rest-foot"><span>Próxima: serie {cur + 1} · {kg(curRow?.w ?? 0, unit)} × {curRow?.r}</span><button type="button" className="linkbtn" onClick={() => commit({ ...s, rest: null })}>Saltar descanso</button></div>
            {restAlert !== "unsupported" && (
              <div className="rest-alert">
                {restAlert === "on" ? <>
                  <span>Te avisamos al terminar si salís de la app. El teléfono puede demorarlo.</span>
                  <button type="button" className="linkbtn" onClick={() => { disableRestAlert(); setRestAlert("off"); }}>Desactivar</button>
                </> : restAlert === "denied" ? <span>Las notificaciones están bloqueadas para REPI en este navegador.</span> : <>
                  <span>¿Salís de la app durante el descanso?</span>
                  <button type="button" className="linkbtn" onClick={async () => { const st = await enableRestAlert(); setRestAlert(st); flash(st === "on" ? "Listo: te avisamos al terminar el descanso." : "Sin permiso de notificaciones no podemos avisarte."); }}>Avisarme al terminar</button>
                </>}
              </div>
            )}
          </>
        ) : exSkipped && sel == null ? (
          <>
            <span className="mb-muted" style={{ textAlign: "center", fontSize: 14 }}>{ex.name}: {skipTxt(ex.change).toLowerCase()}. Tu coach lo va a ver.</span>
            <button type="button" className="ghost" onClick={() => applyChange(null)}>Retomar {ex.name}</button>
            {nextEx >= 0 ? <button type="button" className="cta" onClick={() => { setExIdx(nextEx); setSel(null); }}>Siguiente: {s.exercises[nextEx].name}</button>
              : anyOpen ? <button type="button" className="cta" onClick={() => { setExIdx(s.exercises.findIndex((_, i) => !resolved(i))); setSel(null); }}>Ir a lo pendiente</button>
                : <button type="button" className="cta" onClick={finish} aria-busy={busy || undefined}>Finalizar entrenamiento</button>}
          </>
        ) : curRow && (!exComplete || sel != null) ? (
          <>
            <div className="steppers">
              <WeightStepper key={`${ex.id}:${cur}:${unit}`} exerciseId={ex.exerciseId} unit={unit} w={curRow.w} onChange={(w) => editCur({ w })} flash={flash} />
              <div className="stepper"><button type="button" aria-label="Menos repeticiones" onClick={() => editCur({ r: stepReps(curRow.r, -1) })}>−</button><span><strong>{curRow.r}</strong><small>{repsKind === "time" ? "seg" : "reps"}</small></span><button type="button" aria-label="Más repeticiones" onClick={() => editCur({ r: stepReps(curRow.r, 1) })}>+</button></div>
            </div>
            <div className="wo-tools">
              {repsKind !== "time" && curRow.w > 0 && <button type="button" className="linkbtn" onClick={() => setPlates(true)}>Discos y entrada en calor</button>}
              <button type="button" className="linkbtn" onClick={() => setNoteOpen(true)}>{noteDraft?.trim() ? "Editar nota" : "Nota de la serie"}</button>
            </div>
            {noteDraft?.trim() && <span className="feel-note">Nota: {noteDraft.trim()}</span>}
            <RirControl key={`${ex.id}:${cur}`} value={curRow.done ? curRow.rir : rir} onChange={(v) => (curRow.done ? editCur({ rir: v }) : setRir(v))} onPain={() => setPain(true)} />
            <div className="feel" role="group" aria-label="¿Cómo se sintió la serie? (opcional)">
              {(Object.keys(SET_FEEL) as SetFeel[]).filter((k) => gym || k !== "ayuda").map((k) => {
                const on = (curRow.done ? curRow.feel ?? null : feel) === k;
                return <button type="button" key={k} aria-pressed={on} data-alert={FEEL_ALERTS.includes(k) && gym ? "1" : undefined}
                  onClick={() => (curRow.done ? editCur({ feel: on ? null : k }) : setFeel(on ? null : k))}>{k === "ayuda" ? "Que venga alguien" : SET_FEEL[k]}</button>;
              })}
            </div>
            {gym && (curRow.done ? curRow.feel : feel) && FEEL_ALERTS.includes((curRow.done ? curRow.feel : feel) as SetFeel) && <span className="feel-note">Al completarla avisamos al equipo de sala en turno para que se acerque.</span>}
            <button type="button" className="cta" onClick={complete}>{curRow.done ? `Guardar serie ${cur + 1}` : `Completar serie ${cur + 1}`}</button>
          </>
        ) : (
          <>
            <span className="mb-muted" style={{ textAlign: "center", fontSize: 14 }}>{sub ? sub.name : ex.name} completo · {rows.length} series</span>
            {nextEx >= 0 ? <button type="button" className="cta" onClick={() => { setExIdx(nextEx); setSel(null); }}>Siguiente: {s.exercises[nextEx].name}</button>
              : anyOpen ? <button type="button" className="cta" onClick={() => { setExIdx(s.exercises.findIndex((_, i) => !resolved(i))); setSel(null); }}>Ir a la serie pendiente</button>
                : <button type="button" className="cta" onClick={finish} aria-busy={busy || undefined}>Finalizar entrenamiento</button>}
          </>
        )}
      </div>
      {painSheet}
      {plates && curRow && <PlatesSheet kgWeight={curRow.w} unit={unit} onClose={() => setPlates(false)} />}
      {changing && <ExerciseChangeSheet sessionId={s.id} ex={ex} unit={unit} onApply={applyChange} onPain={() => setPain(true)} onClose={() => setChanging(false)} />}
      {noteOpen && curRow && <SetNoteSheet n={cur + 1} done={curRow.done} value={noteDraft ?? ""} onSave={(v) => setNoteDraft(v.trim() ? v.slice(0, 200) : null)} onClose={() => setNoteOpen(false)} />}
    </div>
  );
}

/** Nota de una serie (F-HX-21): queda con la serie al completarla o guardarla, y la ve el coach de la relación. */
function SetNoteSheet({ n, done, value, onSave, onClose }: { n: number; done: boolean; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  return (
    <Sheet title={`Nota de la serie ${n}`} sub={`Ej.: «agarre cerrado», «molestó la rodilla en la última». Se guarda al ${done ? "guardar" : "completar"} la serie. Hasta 200 caracteres.`} onClose={onClose}
      text={{ value: v, onChange: (x) => setV(x.slice(0, 200)), placeholder: "Escribí la nota" }}
      action={{ label: v.trim() ? "Listo" : value ? "Borrar nota" : "Cerrar", ready: true, onSubmit: () => { onSave(v); onClose(); } }} />
  );
}

/** M02: «full» con partículas sólo si el cierre se confirmó en el servidor y está completo; parcial u offline, confirmación discreta. */
function celebrationFor(sum: DoneData, justFinished: boolean): "full" | "quiet" | null {
  if (!justFinished) return null;
  const k = `repi:celebrated:${sum.id}`;
  try { if (sessionStorage.getItem(k)) return null; sessionStorage.setItem(k, "1"); } catch { /* sin almacenamiento: vale el estado en memoria */ }
  return !sum.local && sum.setsDone >= sum.setsTotal ? "full" : "quiet";
}

function Done({ sum, coachFirst, onExit, flash, justFinished }: { sum: DoneData; coachFirst: string; onExit: (to: "train" | "home" | "prog") => void; flash: (t: string) => void; justFinished: boolean }) {
  const unit = useUnit();
  const [cel] = useState(() => celebrationFor(sum, justFinished));
  const [burst, setBurst] = useState(() => cel === "full" && !prefersReducedMotion());
  const ring = useRef<HTMLDivElement>(null);
  const [rpe, setRpe] = useState<number | null>(sum.rpe);
  const [note, setNote] = useState(sum.sessionNote ?? "");
  const [sent, setSent] = useState<"no" | "local" | "server">(sum.rpe != null ? "server" : "no");
  const [pain, setPain] = useState(false);
  const dur = Math.floor(sum.activeMs / 1000);
  const send = async () => {
    if (!rpe) { flash("Elegí el esfuerzo de la sesión."); return; }
    const s = await getLocal(sum.id);
    if (s) await putLocal({ ...s, rpe, sessionNote: note || null });
    await enqueue({ key: `feedback:${sum.id}`, kind: "feedback", sid: sum.id });
    await flush();
    // Si otra pasada de la cola estaba en curso, esperar a que termine antes de decir «guardado en el teléfono».
    for (let i = 0; i < 12 && navigator.onLine && (await pendingFor(sum.id)) > 0; i++) { await new Promise((r) => setTimeout(r, 160)); await flush(); }
    setSent((await pendingFor(sum.id)) ? "local" : "server");
  };
  const pr = sum.prs[0];
  const complete = sum.setsDone >= sum.setsTotal;
  return (
    <div className="mb-scroll nobar done" data-cel={cel ?? undefined} style={{ paddingTop: "max(60px, env(safe-area-inset-top))" }}>
      {burst && <Confetti seed={seedOf(sum.id)} origin={() => { const r = ring.current?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }} onDone={() => setBurst(false)} />}
      <div className="done-hero">
        <div className="done-ring" ref={ring}><svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="44" fill="none" stroke="#1A2433" strokeWidth="4" /><circle className="arc" cx="48" cy="48" r="44" fill="none" stroke="#00D1FF" strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - sum.setsDone / Math.max(1, sum.setsTotal)} /></svg>
          <Ic i={Check} size={34} color="#00D1FF" /></div>
        <h1 tabIndex={-1}>{complete ? `¡${sum.dayName} completo!` : `${sum.dayName} registrado`}</h1>
        <span className="mb-muted" style={{ fontSize: 15 }}>Cada repetición cuenta. Hoy sumaste {sum.setsDone} {sum.setsDone === 1 ? "serie" : "series"}.</span>
      </div>
      {sum.local && <p className="mb-note" role="status">Guardado en el teléfono. Se sincroniza al volver la conexión; los récords se calculan ahí.</p>}
      <div className="stats3">
        <div><strong>{formatClock(dur)}</strong><span>Duración activa</span></div>
        <div><strong>{sum.exDone}/{sum.exTotal}</strong><span>{sum.exSkipped ? `Ejercicios · ${sum.exSkipped} salteado${sum.exSkipped === 1 ? "" : "s"}` : "Ejercicios"}</span></div>
        <div><strong>{sum.setsDone}/{sum.setsTotal}</strong><span>Series</span></div>
      </div>
      {pr && (
        <div className="pr" data-reveal={cel ? "1" : undefined}>
          <Ic i={Trophy} size={34} color="#F59E0B" />
          <div><small>Nuevo récord personal · 1RM estimado</small><strong>{pr.exercise} · {kg(pr.current.weightKg, unit)} × {pr.current.reps}</strong>
            <span>Anterior: {kg(pr.previous.weightKg, unit)} × {pr.previous.reps}{pr.previousAt ? ` · ${new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(pr.previousAt))}` : ""} · Epley {kgTo(pr.previous.e1rm, unit).toLocaleString("es-AR")} → {kgTo(pr.current.e1rm, unit).toLocaleString("es-AR")} {unit}</span></div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 16 }}>Resumen</h2>
        {sum.rows.map((r) => <div key={r.name} className="sumrow"><span>{r.name}</span><span className="mb-muted">{r.txt}</span></div>)}
        <div className="sumrow"><span>Volumen total</span><span className="mb-muted">{volumeIn(sum.volumeKg, unit).toLocaleString("es-AR")} {unit}</span></div>
      </div>
      <div className="fb">
        <h2 style={{ fontSize: 16 }}>¿Cómo te fue?</h2>
        {sent === "no" ? (
          <>
            <StepSlider label="Esfuerzo de la sesión (1 = muy fácil · 10 = máximo)" steps={RPE_STEPS} value={rpe} onChange={setRpe} ends={["1 · muy fácil", "10 · máximo"]}
              show={(v) => `${v} de 10`} collapsed={(v) => (v == null ? "Registrar esfuerzo" : `Esfuerzo ${v} de 10 · cambiar`)} />
            <textarea rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder={`Nota para ${coachFirst} (opcional)`} aria-label="Nota de la sesión" />
            <div style={{ display: "flex", gap: 8 }}><button type="button" className="cta" style={{ height: 44, fontSize: 15, flex: 1 }} onClick={send}>Enviar {coachFirst.startsWith("el ") ? `al ${coachFirst.slice(3)}` : `a ${coachFirst}`}</button><button type="button" className="ghost sm" style={{ height: 44 }} onClick={() => setPain(true)}>Reportar molestia</button></div>
          </>
        ) : sent === "local" ? <span style={{ fontSize: 14, color: "#F59E0B" }}>Guardado en el teléfono · le llega {coachFirst.startsWith("el ") ? `al ${coachFirst.slice(3)}` : `a ${coachFirst}`} al volver la conexión.</span>
          : <span style={{ fontSize: 14, color: "#5DE6D8" }}>Enviado ✓ {coachFirst} lo ve en tu ficha.</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button type="button" className="cta" onClick={() => onExit("prog")}>Ver mi progreso</button>
        <button type="button" className="ghost" onClick={() => onExit("home")}>Volver al inicio</button>
      </div>
      {pain && <PainSheet sessionId={sum.id} flash={flash} onClose={() => setPain(false)} />}
    </div>
  );
}

/** Peso con paso elegible (0,25 a 2,5 kg o 0,5 a 5 lb) y carga directa con decimales en la unidad elegida (F-HX-23).
 *  Se guarda siempre en kg: en lb el ± parte del valor mostrado para no acumular redondeos. */
function WeightStepper({ exerciseId, unit, w, onChange, flash }: { exerciseId: string; unit: WeightUnit; w: number; onChange: (w: number) => void; flash: (t: string) => void }) {
  const key = `repi:wstep:${unit === "kg" ? "" : "lb:"}${exerciseId}`;
  const opts: readonly number[] = unit === "kg" ? WEIGHT_STEPS : WEIGHT_STEPS_LB;
  const [step, setStep] = useState<number>(() => { try { const v = Number(localStorage.getItem(key)); return opts.includes(v) ? v : unit === "kg" ? 2.5 : 5; } catch { return unit === "kg" ? 2.5 : 5; } });
  const [typing, setTyping] = useState<string | null>(null);
  const [steps, setSteps] = useState(false);
  const pick = (v: number) => { setStep(v); setSteps(false); try { localStorage.setItem(key, String(v)); } catch { /* sin almacenamiento: vale para esta sesión */ } };
  const done = () => {
    if (typing == null) return;
    const v = parseWeightIn(typing, unit);
    if (v == null) flash(`Peso inválido: hasta 2 decimales, entre 0 y ${unit === "kg" ? "1000 kg" : "2204 lb"}.`);
    else onChange(v);
    setTyping(null);
  };
  const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const shown = kgTo(w, unit);
  return (
    <div className="stepper wstep">
      <button type="button" aria-label={`Menos ${fmt(step)} ${unit}`} onClick={() => onChange(stepWeightIn(w, -1, step, unit))}>−</button>
      <span>
        {typing != null
          ? <input autoFocus inputMode="decimal" aria-label={`Peso en ${unit}`} value={typing} onChange={(e) => setTyping(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7))}
            onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); done(); } if (e.key === "Escape") setTyping(null); }} />
          : <button type="button" className="wval" aria-label={`${fmt(shown)} ${unit}. Tocá para escribir el peso`} onClick={() => setTyping(String(shown).replace(".", ","))}><strong>{fmt(shown)}</strong></button>}
        <button type="button" className="wsteps" aria-expanded={steps} aria-label={`Paso de ${fmt(step)} ${unit}. Cambiar`} onClick={() => setSteps((x) => !x)}>{unit} · ±{fmt(step)}</button>
      </span>
      <button type="button" aria-label={`Más ${fmt(step)} ${unit}`} onClick={() => onChange(stepWeightIn(w, 1, step, unit))}>+</button>
      {steps && (
        <div className="wstep-pop" role="group" aria-label="Paso del peso">
          {opts.map((v) => <button type="button" key={v} aria-pressed={v === step} onClick={() => pick(v)}>{fmt(v)}</button>)}
        </div>
      )}
    </div>
  );
}

const RPE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const RIR_STEPS = [0, 1, 2, 3, 4] as const;
/**
 * M04, variante de serie: RIR 0–4+ (se guarda 0–4, «Sin registrar» = null). No se convierte a RPE: más reserva no es más esfuerzo.
 * Un valor histórico fuera de la escala visible (5, que el servidor admite) se muestra tal cual y no se reescribe.
 */
function RirControl({ value, onChange, onPain }: { value: number | null; onChange: (v: number | null) => void; onPain: () => void }) {
  const legacy = value != null && !(RIR_STEPS as readonly number[]).includes(value);
  return (
    <div className="rirx">
      {legacy ? <span className="ss-pill" role="note">RIR guardado: {value}</span>
        : <StepSlider label="Reps en reserva" steps={RIR_STEPS} value={value} onChange={onChange} ends={["0 · ninguna", "4+ · cuatro o más"]}
          show={(v) => (v === 4 ? "4+" : String(v))} collapsed={(v) => (v == null ? "Reps en reserva: sin registrar" : `Reps en reserva: ${v === 4 ? "4+" : v}`)} />}
      {value != null && <button type="button" className="ghost sm" onClick={() => onChange(null)}>Sin registrar</button>}
      <button type="button" className="painbtn" aria-label="Reportar molestia" onClick={onPain}>Molestia</button>
    </div>
  );
}
