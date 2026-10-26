"use client";
// Sesión activa y resumen (App Alumno v4 · «Entrenamiento activo» / «Entrenamiento completado»).
// Fuente de verdad en el dispositivo: IndexedDB. Cada cambio se guarda localmente y se sincroniza por la cola;
// reloj y descanso por timestamp; conflictos visibles con las dos versiones (Etapa 3).
import { useCallback, useEffect, useMemo, useState } from "react";
import { FEEL_ALERTS, SET_FEEL, WEIGHT_STEPS, activeSeconds, formatClock, parseReps, parseWeight, restLeft, stepReps, stepWeight, volumeKg, type SetFeel } from "@repi/domain";
import { api } from "@/lib/api";
import { getLocal, putLocal, delLocal, fromServer, localAction, setKey, type LocalSession } from "@/lib/offline/store";
import { dropSession, enqueue, flush, pendingFor, subscribe, type SyncState } from "@/lib/offline/queue";
import { kg, metaTxt, prevTxt, type Summary } from "./types";
import { PainSheet } from "./FollowSheets";

const RING = 207.35;
type DoneData = {
  id: string; dayName: string; activeMs: number; exDone: number; exTotal: number; setsDone: number; setsTotal: number; volumeKg: number;
  prs: Summary["prs"]; rows: { name: string; txt: string }[]; rpe: number | null; sessionNote: string | null; local: boolean;
};

function localSummary(s: LocalSession): DoneData {
  const done = Object.entries(s.sets).filter(([, x]) => x.done);
  return {
    id: s.id, dayName: s.dayName, activeMs: s.activeMs, local: true, prs: [], rpe: s.rpe, sessionNote: s.sessionNote,
    exDone: s.exercises.filter((e) => Array.from({ length: e.sets }, (_, i) => s.sets[setKey(e.id, i)]?.done).every(Boolean)).length,
    exTotal: s.exercises.length, setsDone: done.length, setsTotal: s.exercises.reduce((a, e) => a + e.sets, 0),
    volumeKg: volumeKg(done.map(([, x]) => ({ exerciseId: "", weightKg: x.w, reps: x.r, completed: true }))),
    rows: s.exercises.map((e) => {
      const xs = Array.from({ length: e.sets }, (_, i) => s.sets[setKey(e.id, i)]).filter((x) => x?.done);
      return xs.length ? { name: e.name, txt: `${xs.length} × ${[...new Set(xs.map((x) => kg(x.w)))].join(" / ")}` } : null;
    }).filter(Boolean) as { name: string; txt: string }[],
  };
}
function serverSummary(x: Summary): DoneData {
  return {
    id: x.id, dayName: x.dayName, activeMs: x.activeMs, exDone: x.exDone, exTotal: x.exTotal, setsDone: x.setsDone, setsTotal: x.setsTotal, volumeKg: x.volumeKg,
    prs: x.prs, rpe: x.rpe, sessionNote: x.sessionNote, local: false,
    rows: x.exercises.filter((e) => e.logs.length).map((e) => ({ name: e.name, txt: `${e.logs.length} × ${[...new Set(e.logs.map((l) => kg(l.weightKg)))].join(" / ")}` })),
  };
}

export function Workout({ sessionId, coachFirst, gym, onExit, flash }: { sessionId: string; coachFirst: string; gym: boolean; onExit: (to: "train" | "home" | "prog") => void; flash: (t: string) => void }) {
  const [s, setS] = useState<LocalSession | null>(null);
  const [exIdx, setExIdx] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [rir, setRir] = useState<number | null>(null);
  const [feel, setFeel] = useState<SetFeel | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sync, setSync] = useState<SyncState>({ kind: "idle", pending: 0 });
  const [summary, setSummary] = useState<DoneData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pain, setPain] = useState(false);

  const commit = useCallback(async (next: LocalSession) => { setS(next); await putLocal(next); }, []);

  const showSummary = useCallback(async (local: LocalSession) => {
    // Con conexión y sin pendientes: resumen del servidor (incluye récords). Si no, el local.
    try {
      if ((await pendingFor(local.id)) === 0) { setSummary(serverSummary(await api<Summary>(`/api/me/sessions/${local.id}/summary`))); return; }
    } catch { /* sin red */ }
    setSummary(localSummary(local));
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
    const firstOpen = x.exercises.findIndex((e) => Array.from({ length: e.sets }, (_, i) => x!.sets[setKey(e.id, i)]).some((y) => !y.done));
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
    const sets = { ...s.sets, [k]: { ...curRow, rir: wasDone ? curRow.rir : rir, feel: f, done: true, at: curRow.at ?? new Date().toISOString() } };
    if (!wasDone) for (let i = cur + 1; i < ex.sets; i++) { const kk = setKey(ex.id, i); if (!sets[kk].done) sets[kk] = { ...sets[kk], w: curRow.w }; }
    const more = !wasDone && Array.from({ length: ex.sets }, (_, i) => sets[setKey(ex.id, i)]).some((x) => !x.done);
    const next = { ...s, sets, rest: more && ex.restSec > 0 ? { end: Date.now() + ex.restSec * 1000, total: ex.restSec, left: ex.restSec, paused: false } : s.rest };
    setRir(null); setFeel(null); setSel(null);
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

  if (err) return <div className="mb-scroll nobar"><p role="alert" className="mb-err">{err}</p><button type="button" className="ghost" onClick={() => onExit("train")}>Volver</button></div>;
  if (summary) return <Done sum={summary} coachFirst={coachFirst} onExit={onExit} flash={flash} />;
  const painSheet = pain && s && ex ? <PainSheet exerciseName={ex.name} sessionId={s.id} flash={flash} onClose={() => setPain(false)} /> : null;
  if (!s || !ex) return <div className="mb-scroll nobar"><p className="mb-muted">Cargando entrenamiento…</p></div>;

  const exComplete = rows.every((r) => r.done);
  const rowsOf = (i: number) => Array.from({ length: s.exercises[i].sets }, (_, j) => s.sets[setKey(s.exercises[i].id, j)]);
  const nextEx = s.exercises.findIndex((_, i) => i > exIdx && rowsOf(i).some((r) => !r.done));
  const anyOpen = s.exercises.some((_, i) => rowsOf(i).some((r) => !r.done));
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
          <button type="button" className="mb-icon" aria-label="Volver" style={{ marginLeft: -8 }} onClick={() => onExit("train")}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F8FAFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></button>
          <div>
            <strong>{s.dayName}</strong>
            <small><span aria-label={`Duración ${formatClock(elapsed)}`}>{formatClock(elapsed)}</span> · <span role="status" style={{ color: savedInk }}>{savedTxt}</span> · <button type="button" className="linkbtn" onClick={() => act(paused ? "resume" : "pause")}>{paused ? "Reanudar" : "Pausar"}</button></small>
          </div>
          <button type="button" className="fin" onClick={finish} aria-busy={busy || undefined}>Finalizar</button>
        </div>
        {sync.kind === "error" && <p role="alert" className="mb-err">{sync.error}</p>}
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
              <span>{x.conflict!.appliedIsMine ? "Guardada" : "Este dispositivo"}: {kg(x.w)} × {x.r}. {x.conflict!.appliedIsMine ? "Desde otro dispositivo" : "Otro dispositivo"}: {kg(x.conflict!.other.weightKg)} × {x.conflict!.other.reps}. No se pisó ninguna.</span>
              <div><button type="button" className="cta sm" onClick={() => resolveSet(k, "mine")}>Usar {kg(x.w)} × {x.r}</button><button type="button" className="ghost sm" onClick={() => resolveSet(k, "other")}>Usar {kg(x.conflict!.other.weightKg)} × {x.conflict!.other.reps}</button></div>
            </div>
          );
        })}
        <div className="prog" aria-hidden="true">{s.exercises.map((e, i) => <i key={e.id} className={rowsOf(i).every((r) => r.done) ? "done" : i === exIdx ? "cur" : ""} />)}</div>
        <div className="excard">
          <div className="excard-top">
            <div><small>Ejercicio {exIdx + 1} de {s.exercises.length}</small><strong>{ex.name}</strong><small>{metaTxt(ex)}{ex.rir != null ? ` · RIR ${ex.rir}` : ""}</small></div>
            <div className="nav2">
              <button type="button" aria-label="Ejercicio anterior" disabled={exIdx === 0} onClick={() => { setExIdx(exIdx - 1); setSel(null); setRir(null); }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B0F14" strokeWidth="2" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg></button>
              <button type="button" aria-label="Ejercicio siguiente" disabled={exIdx === s.exercises.length - 1} onClick={() => { setExIdx(exIdx + 1); setSel(null); setRir(null); }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B0F14" strokeWidth="2" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg></button>
            </div>
          </div>
          <div className="video" aria-hidden="true">video demostración (pendiente)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><small>Serie anterior</small><span style={{ fontSize: 15, fontWeight: 500 }}>{prevTxt(ex.prev)}</span></div>
          <div className="sets" role="list" aria-label="Series">
            <div className="sets-h" aria-hidden="true"><span>Serie</span><span>Peso (kg)</span><span>{repsKind === "time" ? "Seg" : "Reps"}</span><span /></div>
            {rows.map((r, i) => (
              <button type="button" role="listitem" key={i} className="setrow" aria-current={i === cur} onClick={() => { setSel(i); setRir(r.rir); }}
                aria-label={`Serie ${i + 1}: ${String(r.w).replace(".", ",")} kg, ${r.r} ${repsKind === "time" ? "segundos" : "repeticiones"}${r.done ? ", completada" : ""}${r.conflict ? ", con conflicto" : ""}`}>
                <span>{i + 1}</span><span>{String(r.w).replace(".", ",")}</span><span>{r.r}</span>
                <span className={`ck${r.done ? " on" : ""}${r.conflict ? " bad" : ""}`}>{r.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
              </button>
            ))}
          </div>
        </div>
        {(ex.note || s.note) && (
          <div className="coach-tip"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" style={{ flex: "none", marginTop: 2 }}><path d="M4 5h16v11H9l-5 4z" /></svg><span>{ex.note || s.note}</span></div>
        )}
      </div>
      <div className="dock">
        {paused ? (
          <>
            <span className="mb-muted" style={{ textAlign: "center", fontSize: 14 }}>Entrenamiento en pausa · {formatClock(elapsed)}</span>
            <button type="button" className="cta" onClick={() => act("resume")}>Reanudar</button>
          </>
        ) : rest && left > 0 && sel == null ? (
          <>
            <div className="rest">
              <div><span className="mb-muted" style={{ fontSize: 14 }}>Descanso</span><strong role="timer" aria-live="off">{formatClock(left)}</strong></div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div className="ring">
                  <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" stroke="#1A2433" strokeWidth="4" /><circle cx="36" cy="36" r="33" fill="none" stroke="#00D1FF" strokeWidth="4" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - left / rest.total)} style={{ transition: "stroke-dashoffset 250ms linear" }} /></svg>
                  <button type="button" aria-label={rest.paused ? "Reanudar descanso" : "Pausar descanso"} onClick={() => commit({ ...s, rest: rest.paused ? { ...rest, paused: false, end: Date.now() + rest.left * 1000 } : { ...rest, paused: true, left, end: null } })}>
                    {rest.paused ? <svg width="20" height="20" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="#0B0F14" /></svg> : <svg width="20" height="20" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" fill="#0B0F14" /><rect x="14" y="5" width="4" height="14" rx="1" fill="#0B0F14" /></svg>}
                  </button>
                </div>
                <button type="button" className="plus30" onClick={() => commit({ ...s, rest: rest.paused ? { ...rest, left: rest.left + 30, total: rest.total + 30 } : { ...rest, end: (rest.end ?? Date.now()) + 30_000, total: rest.total + 30 } })}>+30s</button>
              </div>
            </div>
            <div className="rest-foot"><span>Próxima: serie {cur + 1} · {String(curRow?.w ?? 0).replace(".", ",")} kg × {curRow?.r}</span><button type="button" className="linkbtn" onClick={() => commit({ ...s, rest: null })}>Saltar descanso</button></div>
          </>
        ) : curRow && (!exComplete || sel != null) ? (
          <>
            <div className="steppers">
              <WeightStepper key={`${ex.id}:${cur}`} exerciseId={ex.exerciseId} w={curRow.w} onChange={(w) => editCur({ w })} flash={flash} />
              <div className="stepper"><button type="button" aria-label="Menos repeticiones" onClick={() => editCur({ r: stepReps(curRow.r, -1) })}>−</button><span><strong>{curRow.r}</strong><small>{repsKind === "time" ? "seg" : "reps"}</small></span><button type="button" aria-label="Más repeticiones" onClick={() => editCur({ r: stepReps(curRow.r, 1) })}>+</button></div>
            </div>
            <div className="rir" role="group" aria-label="Reps en reserva (opcional)"><span>Reps en reserva</span>
              {([[0, "0"], [1, "1"], [2, "2"], [3, "3"], [4, "4+"]] as const).map(([k, l]) => (
                <button type="button" key={k} aria-pressed={(curRow.done ? curRow.rir : rir) === k} onClick={() => (curRow.done ? editCur({ rir: curRow.rir === k ? null : k }) : setRir(rir === k ? null : k))}>{l}</button>
              ))}
              <button type="button" className="painbtn" aria-label="Reportar molestia" onClick={() => setPain(true)}>Molestia</button>
            </div>
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
            <span className="mb-muted" style={{ textAlign: "center", fontSize: 14 }}>{ex.name} completo · {rows.length} series</span>
            {nextEx >= 0 ? <button type="button" className="cta" onClick={() => { setExIdx(nextEx); setSel(null); }}>Siguiente: {s.exercises[nextEx].name}</button>
              : anyOpen ? <button type="button" className="cta" onClick={() => { setExIdx(s.exercises.findIndex((_, i) => rowsOf(i).some((r) => !r.done))); setSel(null); }}>Ir a la serie pendiente</button>
                : <button type="button" className="cta" onClick={finish} aria-busy={busy || undefined}>Finalizar entrenamiento</button>}
          </>
        )}
      </div>
      {painSheet}
    </div>
  );
}

function Done({ sum, coachFirst, onExit, flash }: { sum: DoneData; coachFirst: string; onExit: (to: "train" | "home" | "prog") => void; flash: (t: string) => void }) {
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
    setSent((await pendingFor(sum.id)) ? "local" : "server");
  };
  const pr = sum.prs[0];
  const complete = sum.setsDone >= sum.setsTotal;
  return (
    <div className="mb-scroll nobar" style={{ paddingTop: "max(60px, env(safe-area-inset-top))" }}>
      <div className="done-hero">
        <div className="done-ring"><svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="44" fill="none" stroke="#1A2433" strokeWidth="4" /><circle className="arc" cx="48" cy="48" r="44" fill="none" stroke="#00D1FF" strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - sum.setsDone / Math.max(1, sum.setsTotal)} /></svg>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#00D1FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
        <h1 tabIndex={-1}>{complete ? `¡${sum.dayName} completo!` : `${sum.dayName} registrado`}</h1>
        <span className="mb-muted" style={{ fontSize: 15 }}>Cada repetición cuenta. Hoy sumaste {sum.setsDone} {sum.setsDone === 1 ? "serie" : "series"}.</span>
      </div>
      {sum.local && <p className="mb-note" role="status">Guardado en el teléfono. Se sincroniza al volver la conexión; los récords se calculan ahí.</p>}
      <div className="stats3">
        <div><strong>{formatClock(dur)}</strong><span>Duración activa</span></div>
        <div><strong>{sum.exDone}/{sum.exTotal}</strong><span>Ejercicios</span></div>
        <div><strong>{sum.setsDone}/{sum.setsTotal}</strong><span>Series</span></div>
      </div>
      {pr && (
        <div className="pr">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 14v3M8 20h8M9.5 17h5v3h-5z" /></svg>
          <div><small>Nuevo récord personal · 1RM estimado</small><strong>{pr.exercise} · {kg(pr.current.weightKg)} × {pr.current.reps}</strong>
            <span>Anterior: {kg(pr.previous.weightKg)} × {pr.previous.reps}{pr.previousAt ? ` · ${new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(pr.previousAt))}` : ""} · Epley {String(pr.previous.e1rm).replace(".", ",")} → {String(pr.current.e1rm).replace(".", ",")} kg</span></div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 16 }}>Resumen</h2>
        {sum.rows.map((r) => <div key={r.name} className="sumrow"><span>{r.name}</span><span className="mb-muted">{r.txt}</span></div>)}
        <div className="sumrow"><span>Volumen total</span><span className="mb-muted">{sum.volumeKg.toLocaleString("es-AR")} kg</span></div>
      </div>
      <div className="fb">
        <h2 style={{ fontSize: 16 }}>¿Cómo te fue?</h2>
        {sent === "no" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><span className="mb-muted" style={{ fontSize: 13 }} id="rpe-l">Esfuerzo de la sesión (1 = muy fácil · 10 = máximo)</span>
              <div className="rpe" role="group" aria-labelledby="rpe-l">{Array.from({ length: 10 }, (_, i) => i + 1).map((v) => <button type="button" key={v} aria-pressed={rpe === v} onClick={() => setRpe(v)}>{v}</button>)}</div></div>
            <textarea rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder={`Nota para ${coachFirst} (opcional)`} aria-label="Nota de la sesión" />
            <div style={{ display: "flex", gap: 8 }}><button type="button" className="cta" style={{ height: 44, fontSize: 15, flex: 1 }} onClick={send}>Enviar a {coachFirst}</button><button type="button" className="ghost sm" style={{ height: 44 }} onClick={() => setPain(true)}>Reportar molestia</button></div>
          </>
        ) : sent === "local" ? <span style={{ fontSize: 14, color: "#F59E0B" }}>Guardado en el teléfono · le llega a {coachFirst} al volver la conexión.</span>
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

/** Peso con paso elegible (0,25 a 2,5 kg) y carga directa con decimales: hay discos y mancuernas de pesos intermedios. */
function WeightStepper({ exerciseId, w, onChange, flash }: { exerciseId: string; w: number; onChange: (w: number) => void; flash: (t: string) => void }) {
  const key = `repi:wstep:${exerciseId}`;
  const [step, setStep] = useState<number>(() => { try { const v = Number(localStorage.getItem(key)); return (WEIGHT_STEPS as readonly number[]).includes(v) ? v : 2.5; } catch { return 2.5; } });
  const [typing, setTyping] = useState<string | null>(null);
  const [steps, setSteps] = useState(false);
  const pick = (v: number) => { setStep(v); setSteps(false); try { localStorage.setItem(key, String(v)); } catch { /* sin almacenamiento: vale para esta sesión */ } };
  const done = () => {
    if (typing == null) return;
    const v = parseWeight(typing);
    if (v == null) flash("Peso inválido: hasta 2 decimales, entre 0 y 1000 kg.");
    else onChange(v);
    setTyping(null);
  };
  const fmtKg = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return (
    <div className="stepper wstep">
      <button type="button" aria-label={`Menos ${fmtKg(step)} kg`} onClick={() => onChange(stepWeight(w, -1, step))}>−</button>
      <span>
        {typing != null
          ? <input autoFocus inputMode="decimal" aria-label="Peso en kg" value={typing} onChange={(e) => setTyping(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7))}
            onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); done(); } if (e.key === "Escape") setTyping(null); }} />
          : <button type="button" className="wval" aria-label={`${fmtKg(w)} kg. Tocá para escribir el peso`} onClick={() => setTyping(String(w).replace(".", ","))}><strong>{fmtKg(w)}</strong></button>}
        <button type="button" className="wsteps" aria-expanded={steps} aria-label={`Paso de ${fmtKg(step)} kg. Cambiar`} onClick={() => setSteps((x) => !x)}>kg · ±{fmtKg(step)}</button>
      </span>
      <button type="button" aria-label={`Más ${fmtKg(step)} kg`} onClick={() => onChange(stepWeight(w, 1, step))}>+</button>
      {steps && (
        <div className="wstep-pop" role="group" aria-label="Paso del peso">
          {WEIGHT_STEPS.map((v) => <button type="button" key={v} aria-pressed={v === step} onClick={() => pick(v)}>{fmtKg(v)}</button>)}
        </div>
      )}
    </div>
  );
}
