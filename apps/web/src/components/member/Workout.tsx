"use client";
// Sesión activa y resumen (App Alumno v4 · «Entrenamiento activo» / «Entrenamiento completado»).
// Fuente de verdad en el dispositivo: IndexedDB. Cada cambio se guarda localmente y se sincroniza por la cola;
// reloj y descanso por timestamp; conflictos visibles con las dos versiones (Etapa 3).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXERCISE_CHANGE_REASONS, FEEL_ALERTS, TECHNIQUES, comboNext, groupLabels, setTarget, setTargetText, type ExerciseDetail, SET_FEEL, WEIGHT_STEPS, WEIGHT_STEPS_LB, activeSeconds, formatClock, kgTo, parseReps, parseWeightIn, restLeft, setControl, stepReps, stepWeightIn, volumeIn, volumeKg, type SetFeel, type WeightUnit } from "@repi/domain";
import { WORKOUT_IDLE_PROMPT_MS, carriesLoad, cleanDecimalDraft, isReducedKind, kindAt, reducedLoadHint } from "@repi/domain";
import { comboStep, exerciseComplete, groupRounds, intervalView, planBlocks, sessionMetrics, adjustAfterSet, type RowTarget } from "@repi/domain";
import { TargetCard } from "./TargetCard";
import { api } from "@/lib/api";
import { getLocal, putLocal, delLocal, fromServer, keepLocalOnly, localAction, rowResolved, setKey, type ExChange, type LocalEx, type LocalInterval, type LocalSession } from "@/lib/offline/store";
import { dropSession, enqueue, flush, pendingFor, subscribe, type SyncState } from "@/lib/offline/queue";
import { kg, metaTxt, prevTxt, type Summary } from "./types";
import { useUnit } from "./units";
import { PainSheet } from "./FollowSheets";
import { PlatesSheet } from "./PlatesSheet";
import { SetControl } from "./SetControl";
import { ExerciseChangeSheet } from "./ExerciseChange";
import { ConnectHelpSheet } from "./Connect";
import { PresenceSheet } from "./Presence";
import { Sheet } from "./Sheet";
import { cancelRestAlert, disableRestAlert, enableRestAlert, restAlertState, scheduleRestAlert, type RestAlertState } from "@/lib/restAlert";
import { Confetti } from "@/components/motion/Confetti";
import { StepSlider } from "@/components/motion/StepSlider";
import { seedOf } from "@/lib/confetti";
import { prefersReducedMotion } from "@/lib/motion";
import { Ic } from "@/components/ui/Ic";
import { ArrowLeft, ArrowsClockwise, CaretLeft, CaretRight, ChatCircleText, Check, NotePencil, Pause, Play, PlayCircle, Trophy } from "@phosphor-icons/react";
import { featureOn } from "@/lib/features";
import { Nudges, type Nudge } from "./Nudges";

const RING = 207.35;
type DoneData = {
  id: string; dayName: string; activeMs: number; exDone: number; exSkipped: number; exTotal: number; setsDone: number; setsTotal: number; volumeKg: number;
  stagesDone: number; // D183: etapas conectadas hechas (drops, mini series): se informan aparte de las series
  stagesSkipped: number; // D184: etapas que quedaron sin hacer («Terminar la serie acá»): no son resultados
  prs: Summary["prs"]; rows: { name: string; txt: string }[]; rpe: number | null; sessionNote: string | null; local: boolean;
};

/** Nombre de lo que se hizo (F-HX-21): el reemplazo, si lo hubo. */
const doneName = (e: { name: string; change?: ExChange | null }) => (e.change?.kind === "substitute" && e.change.substitute ? `${e.change.substitute.name} (en lugar de ${e.name})` : e.name);
const skipTxt = (c?: ExChange | null) => `Salteado · ${c ? EXERCISE_CHANGE_REASONS[c.reason].toLowerCase() : ""}`;

/** D183: misma cuenta que el servidor (metrics.ts): series principales, etapas aparte, sin aproximación en el volumen. */
function localSummary(s: LocalSession, unit: WeightUnit): DoneData {
  const logsOf = (e: LocalEx) => Array.from({ length: e.sets }, (_, i) => ({ i, x: s.sets[setKey(e.id, i)] })).filter((y) => y.x?.done).map((y) => ({ setIndex: y.i, weightKg: y.x.w, reps: y.x.r }));
  const full = (e: LocalEx) => exerciseComplete(e, (k) => !!s.sets[setKey(e.id, k)]?.done);
  const skippedOf = (e: LocalEx) => Array.from({ length: e.sets }, (_, i) => i).filter((i) => s.sets[setKey(e.id, i)]?.skip && !s.sets[setKey(e.id, i)]?.done);
  const m = sessionMetrics(s.exercises.map((e) => ({ ex: e, logs: logsOf(e), skipped: skippedOf(e) })));
  return {
    id: s.id, dayName: s.dayName, activeMs: s.activeMs, local: true, prs: [], rpe: s.rpe, sessionNote: s.sessionNote,
    exDone: s.exercises.filter(full).length, exSkipped: s.exercises.filter((e) => e.change?.kind === "skip" && !full(e)).length,
    exTotal: s.exercises.length, setsDone: m.mainDone + m.warmupDone, setsTotal: m.mainPlanned + m.warmupPlanned, stagesDone: m.stagesDone, stagesSkipped: m.stagesSkipped,
    volumeKg: m.tonnageKg,
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
    stagesDone: x.metrics?.stagesDone ?? 0, stagesSkipped: x.metrics?.stagesSkipped ?? 0,
    prs: x.prs, rpe: x.rpe, sessionNote: x.sessionNote, local: false,
    rows: x.exercises.filter((e) => e.logs.length || e.change?.kind === "skip").map((e) => {
      const sets = e.logs.length ? `${e.logs.length} × ${[...new Set(e.logs.map((l) => kg(l.weightKg, unit)))].join(" / ")}` : "";
      if (e.change?.kind === "skip" && !exerciseComplete(e, (k) => e.logs.some((l) => l.setIndex === k))) return { name: e.name, txt: sets ? `${sets} · ${skipTxt(e.change)}` : skipTxt(e.change) };
      return { name: doneName(e), txt: sets };
    }),
  };
}

export function Workout({ sessionId, coachFirst, gym, gymOrgId = null, demo = false, connectPlace = null, onExit, onNudge, flash, programChanged = false, onDismissChange }: {
  sessionId: string; coachFirst: string; gym: boolean; gymOrgId?: string | null; demo?: boolean; connectPlace?: string | null; onExit: (to: "train" | "home" | "prog") => void; onNudge?: (n: Nudge) => void; flash: (t: string) => void;
  programChanged?: boolean; onDismissChange?: () => void; // D143: el coach cambió la rutina con este entrenamiento abierto
}) {
  const [asking, setAsking] = useState(false); // REPI Connect (D126): pedido al equipo de sala sobre este ejercicio
  const [revalidate, setRevalidate] = useState(false); // D127: el ingreso venció durante el entrenamiento
  const unit = useUnit();
  const [s, setS] = useState<LocalSession | null>(null);
  const [exIdx, setExIdx] = useState(0);
  const [outdated, setOutdated] = useState(false); // D145: la sesión quedó con una versión anterior al abrirla
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
  const [howto, setHowto] = useState(false); // D164: video de cómo se hace
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
        const srv = await api<Parameters<typeof fromServer>[0] & { outdated?: boolean }>(`/api/me/sessions/${sessionId}`);
        // D184: las omisiones y el intervalo EMOM vienen del servidor (también los de otro dispositivo). Sólo se suben las
        // omisiones que este teléfono tenía guardadas de antes y el servidor no conoce.
        const known = new Set(srv.exercises.flatMap((e) => ((e as { skips?: { setIndex: number }[] }).skips ?? []).map((k) => setKey(e.id, k.setIndex))));
        const kept = keepLocalOnly(fromServer(srv, local?.rest), local, known);
        x = kept.session;
        await putLocal(x);
        for (const k of kept.upload) { const [peId, idx] = k.split(":"); await enqueue({ key: `skip:${x.id}:${k}`, kind: "skip", sid: x.id, peId, idx: Number(idx) }); }
        setOutdated(!!srv.outdated);
      } catch (e) {
        if (!local) { setErr((e as Error).message || "Sin conexión y sin datos de este entrenamiento en el teléfono."); return; }
      }
    } else void flush();
    if (!x) return;
    setS(x);
    if (x.status === "completed" || x.status === "abandoned") { await showSummary(x); return; }
    const firstOpen = x.exercises.findIndex((e) => e.change?.kind !== "skip" && Array.from({ length: e.sets }, (_, i) => x!.sets[setKey(e.id, i)]).some((y) => !rowResolved(y)));
    setExIdx(firstOpen < 0 ? Math.max(0, x.exercises.length - 1) : firstOpen);
  }, [sessionId, showSummary]);
  useEffect(() => { load().catch((e) => setErr((e as Error).message)); }, [load]);
  useEffect(() => subscribe(async (st) => {
    setSync(st);
    // Tras sincronizar, el estado local (revisiones, conflictos) puede haber cambiado.
    const fresh = await getLocal(sessionId);
    if (!fresh) return;
    setS((cur) => {
      if (!cur || fresh.updatedAt <= cur.updatedAt) return cur;
      // QA 29/10: la sincronización sólo cambia series ya hechas (ids, revisiones, conflictos). Lo que la persona está
      // cargando en una serie sin completar es de la pantalla: una copia leída antes de su última tecla no lo pisa.
      let kept = false;
      const sets = Object.fromEntries(Object.entries(fresh.sets).map(([k, v]) => {
        const mine = cur.sets[k];
        if (mine && (!v.done || (mine.done && !v.done)) && (mine.w !== v.w || mine.r !== v.r || mine.done !== v.done)) { kept = true; return [k, mine]; }
        return [k, v];
      }));
      // D185: el descanso es sólo de esta pantalla y la sincronización nunca lo cambia. Una copia leída antes de «Saltar
      // descanso» (la respuesta de la serie llegó justo después) lo volvía a poner y el descanso «volvía».
      const restMoved = JSON.stringify(cur.rest ?? null) !== JSON.stringify(fresh.rest ?? null);
      if (!kept && !restMoved) return fresh;
      const merged = { ...fresh, sets, rest: cur.rest ?? null };
      void putLocal(merged);
      return merged;
    });
  }), [sessionId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  const rest = s?.rest ?? null;
  const left = rest ? (rest.paused ? rest.left : restLeft(rest.end, now)) : 0;
  useEffect(() => { if (s && rest && !rest.paused && left <= 0) { void commit({ ...s, rest: null }); flash("Descanso terminado. ¡A la próxima serie!"); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  // D160: «¿Seguís entrenando?» al salir con el entrenamiento abierto y tras 20 minutos sin tocar nada (no durante un descanso).
  // La última actividad arranca de lo guardado (inicio, reanudación, última serie): si la app se abre horas después, pregunta.
  const [still, setStill] = useState<null | "leave" | "idle">(null);
  const lastAct = useRef(Date.now());
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!s || seeded.current === s.id) return;
    seeded.current = s.id;
    lastAct.current = Math.max(Date.parse(s.startedAt), s.lastResumedAt ? Date.parse(s.lastResumedAt) : 0, ...Object.values(s.sets).map((x) => (x.at ? Date.parse(x.at) : 0)));
  }, [s]);
  const idle = !!s && s.status === "in_progress" && !(rest && !rest.paused) && now - lastAct.current >= WORKOUT_IDLE_PROMPT_MS;
  useEffect(() => { if (idle && !still && !summary) setStill("idle"); }, [idle]); // eslint-disable-line react-hooks/exhaustive-deps

  const ex = s?.exercises[exIdx];
  // F-HX-22: aviso local al terminar el descanso si la app pasa a segundo plano (opcional, por dispositivo).
  const restEnd = rest && !rest.paused ? rest.end : null;
  useEffect(() => {
    if (!restEnd || restAlert !== "on") { cancelRestAlert(); return; }
    scheduleRestAlert(restEnd, ex ? `Seguí con ${ex.change?.substitute?.name ?? ex.name}.` : "Seguí con la próxima serie.");
  }, [restEnd, restAlert]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (s && ex ? Array.from({ length: ex.sets }, (_, i) => s.sets[setKey(ex.id, i)]) : []), [s, ex]);
  const labels = useMemo(() => (s ? groupLabels(s.exercises) : []), [s]); // D134: A1, A2…
  const cur = sel ?? rows.findIndex((r) => !rowResolved(r));
  const curRow = cur >= 0 ? rows[cur] : null;
  // D183: series principales (bloques) y etapas conectadas del ejercicio en curso.
  const blocks = useMemo(() => (ex ? planBlocks(ex.detail, ex.sets) : []), [ex]);
  const blockOf = (i: number) => blocks.findIndex((b) => b.rows.includes(i));
  const curT = ex && cur >= 0 ? setTarget(ex, cur) : null;
  const rowName = (i: number) => { const t = ex ? setTarget(ex, i) : null; return t && t.stage > 0 ? `${t.label} de la serie ${t.block + 1}` : `serie ${blockOf(i) + 1}`; };
  const repsKind = ex ? parseReps(ex.reps).kind : "reps";
  // D148: cronómetro (series por tiempo) o contador (AMRAP, al fallo) para la serie en curso.
  const ctl = curT ? setControl(curT) : null;
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
    void commit({ ...s, sets: { ...s.sets, [setKey(ex.id, cur)]: { ...s.sets[setKey(ex.id, cur)], ...p, ...(p.w !== undefined ? { pend: false } : {}) } } });
  };
  /**
   * Descanso al terminar la fila `i` (D183): si sigue una etapa de la misma serie, la pausa de esa etapa (un drop, 0; un
   * rest-pause, 20 s); si terminó la serie, el descanso de la serie. En un EMOM, lo que falta para el próximo intervalo.
   */
  const restAfter = (x: LocalSession, i: number, sets: LocalSession["sets"]) => {
    if (!ex) return 0;
    const b = blocks[blockOf(i)];
    const nextStage = b?.rows.find((k) => k > i && !rowResolved(sets[setKey(ex.id, k)]));
    if (nextStage != null) return setTarget(ex, nextStage).restSec ?? 0;
    const emom = ex.detail?.emomSec;
    if (emom) { const st = x.iv?.peId === ex.id && x.iv.status === "running" ? x.iv.start : null; return st ? Math.max(0, Math.round((st + emom * 1000 - Date.now()) / 1000)) : emom; }
    return setTarget(ex, b?.main ?? i).restSec ?? ex.restSec;
  };
  /** Después de resolver la fila `i` (hecha u omitida): descanso, combinación (A1 → A2) y cola de sincronización. */
  const advance = async (sets: LocalSession["sets"], i: number, wasDone: boolean, enqueueSet: boolean, extra: Partial<LocalSession> = {}) => {
    if (!s || !ex) return;
    const more = Array.from({ length: ex.sets }, (_, k) => sets[setKey(ex.id, k)]).some((y) => !rowResolved(y));
    let restS = restAfter(s, i, sets);
    // D137 + D183: en una superserie o circuito se alterna al terminar cada serie con sus etapas, sin descansar entre ejercicios.
    const flow = !wasDone ? comboStep(s.exercises, (e, k) => rowResolved(sets[setKey(s.exercises[e].id, k)]), exIdx, i) : null;
    if (flow) restS = flow.endOfRound ? restS : 0;
    const emom = ex.detail?.emomSec;
    // D184: al terminar una serie de un EMOM, el intervalo siguiente empieza cuando termina el actual (se sincroniza).
    const bi = blockOf(i);
    const ivChange = !!emom && !wasDone && !!blocks[bi]?.rows.every((k) => rowResolved(sets[setKey(ex.id, k)]));
    const iv: LocalInterval | null = ivChange ? (bi + 1 < blocks.length ? { peId: ex.id, block: bi + 1, start: Date.now() + restS * 1000, emomSec: emom!, status: "running" } : null) : s.iv ?? null;
    // Editar una serie ya hecha no toca el descanso; si no, un descanso viejo no queda tapando una etapa sin pausa (un drop).
    const next = { ...s, ...extra, sets, iv, ivAt: ivChange ? new Date().toISOString() : s.ivAt ?? null, rest: wasDone ? s.rest : (more || flow) && restS > 0 ? { end: Date.now() + restS * 1000, total: restS, left: restS, paused: false } : null };
    setRir(null); setFeel(null); setSel(null); setNoteDraft(null);
    if (flow) { setExIdx(flow.idx); if (!flow.endOfRound) flash(`Seguí con ${labels[flow.idx] ?? ""} ${s.exercises[flow.idx].change?.substitute?.name ?? s.exercises[flow.idx].name}, sin descanso.`.replace("  ", " ")); else if (flow.rounds > 1) flash(`Vuelta ${flow.round + 1} de ${flow.rounds}.`); }
    await commit(next);
    if (enqueueSet) await enqueue({ key: `set:${s.id}:${setKey(ex.id, i)}`, kind: "set", sid: s.id, peId: ex.id, idx: i });
    if (ivChange) await enqueue({ key: `interval:${s.id}`, kind: "interval", sid: s.id });
  };
  /** D184: empezar el intervalo EMOM de la serie en curso (también para volver a empezarlo si venció o se interrumpió). */
  const startInterval = async () => {
    if (!s || !ex?.detail?.emomSec || cur < 0) return;
    await commit({ ...s, iv: { peId: ex.id, block: blockOf(cur), start: Date.now(), emomSec: ex.detail.emomSec, status: "running" }, ivAt: new Date().toISOString() });
    await enqueue({ key: `interval:${s.id}`, kind: "interval", sid: s.id });
  };
  /** D184: una etapa omitida vuelve a quedar pendiente (corrección); en todos los dispositivos al sincronizar. */
  const unskip = async (i: number) => {
    if (!s || !ex) return;
    const k = setKey(ex.id, i);
    await commit({ ...s, sets: { ...s.sets, [k]: { ...s.sets[k], skip: false, skipAt: new Date().toISOString() } } });
    await enqueue({ key: `skip:${s.id}:${k}`, kind: "skip", sid: s.id, peId: ex.id, idx: i });
    flash(`${rowName(i)[0].toUpperCase()}${rowName(i).slice(1)} vuelve a estar pendiente.`);
  };
  const complete = async () => {
    if (!s || !ex || cur < 0 || !curRow) return;
    const k = setKey(ex.id, cur);
    const wasDone = curRow.done;
    // D182: una serie reducida (aproximación, back-off, drop) sin peso del plan no se completa con un peso que nadie eligió.
    if (curRow.pend && !wasDone) { flash("Elegí el peso de esta serie antes de completarla."); return; }
    // D184: 0 repeticiones (o 0 s) no es una serie hecha: un drop «al fallo» empieza en 0 y se completaba así, como si se
    // hubiera hecho. Si no se hizo, es «Terminar la serie acá» (queda omitida, no como resultado).
    if (!wasDone && curRow.r <= 0) { flash(curT && curT.stage > 0 ? "Marcá cuántas repeticiones hiciste, o «Terminar la serie acá» si no la hiciste." : `Marcá ${repsKind === "time" ? "los segundos" : "las repeticiones"} que hiciste antes de completarla.`); return; }
    const f = wasDone ? curRow.feel ?? null : feel;
    const { skip: _sk, ...row } = curRow;
    const sets = { ...s.sets, [k]: { ...row, rir: wasDone ? curRow.rir : rir, feel: f, note: noteDraft?.trim() || null, done: true, at: curRow.at ?? new Date().toISOString() } };
    // El peso hecho pasa a las series siguientes compatibles; nunca a una reducida ni desde una aproximación (D182).
    if (!wasDone) for (let i = cur + 1; i < ex.sets; i++) { const kk = setKey(ex.id, i); if (!sets[kk].done && !sets[kk].pend && carriesLoad(kindAt(ex.detail, cur), kindAt(ex.detail, i))) sets[kk] = { ...sets[kk], w: curRow.w }; }
    // D191: con el resultado guardado en el teléfono, las mismas reglas que el servidor ajustan los objetivos siguientes (sólo
    // mantener o bajar; nunca la serie hecha) y dejan un único mensaje, que no se repite en este ejercicio. Funciona sin conexión.
    const extra: Partial<LocalSession> = {};
    if (!wasDone) {
      extra.intel = null;
      if (ex.targets?.length && !ex.change) {
        const done = Array.from({ length: ex.sets }, (_, i) => ({ i, x: sets[setKey(ex.id, i)] })).filter((y) => y.x?.done).map((y) => ({ index: y.i, w: y.x.w, r: y.x.r, rir: y.x.rir, feel: y.x.feel ?? null }));
        const full = Array.from({ length: ex.sets }, (_, i) => ex.targets!.find((t) => t.setIndex === i)) as RowTarget[];
        const a = adjustAfterSet({ ex, targets: full, done, justDone: cur });
        if (a.changed.length) extra.exercises = s.exercises.map((e) => (e.id === ex.id ? { ...e, targets: a.targets.filter(Boolean) } : e));
        const key = a.event ? `${ex.id}:${a.event.code}` : null;
        if (a.event && key && !(s.intelSeen ?? []).includes(key)) { extra.intel = { key, text: a.event.text, restPlusSec: a.event.restPlusSec, at: new Date().toISOString() }; extra.intelSeen = [...(s.intelSeen ?? []), key]; }
      }
    }
    await advance(sets, cur, wasDone, true, extra);
    if (!wasDone && gym && f && FEEL_ALERTS.includes(f as SetFeel) && !navigator.onLine) flash("Sin conexión: el aviso a sala sale al reconectar (si pasaron menos de 10 minutos).");
    if (wasDone) flash(`${rowName(cur)[0].toUpperCase()}${rowName(cur).slice(1)} actualizada.`);
  };
  /** D183: cortar la serie en esta etapa (rest-pause, drop, myo): las etapas que faltan quedan omitidas y no se registran. */
  const endBlockHere = async () => {
    if (!s || !ex || cur < 0) return;
    const b = blocks[blockOf(cur)];
    const left = b.rows.filter((k) => k >= cur && !s.sets[setKey(ex.id, k)].done);
    if (!left.length) return;
    const sets = { ...s.sets };
    const at = new Date().toISOString();
    for (const k of left) sets[setKey(ex.id, k)] = { ...sets[setKey(ex.id, k)], skip: true, skipAt: at };
    await advance(sets, left[left.length - 1], false, false);
    // D184: la omisión se guarda en el servidor (offline, por la cola): los otros dispositivos la ven y no es un resultado.
    for (const k of left) await enqueue({ key: `skip:${s.id}:${setKey(ex.id, k)}`, kind: "skip", sid: s.id, peId: ex.id, idx: k });
    flash(`Serie ${b.index + 1} terminada: ${left.length === 1 ? "1 etapa quedó sin hacer" : `${left.length} etapas quedaron sin hacer`}.`);
  };
  const act = async (action: "pause" | "resume") => {
    if (!s) return;
    const n = localAction(s, action);
    if (!n) return;
    // D184: pausar interrumpe el intervalo EMOM en curso (lo mismo hace el servidor al recibir la pausa).
    await commit(action === "pause" && n.iv?.status === "running" ? { ...n, iv: { ...n.iv, status: "interrupted" }, ivAt: new Date().toISOString() } : n);
    await enqueue({ key: `action:${s.id}:${Date.now()}`, kind: "action", sid: s.id, action, at: new Date().toISOString() });
    if (action === "pause") flash("Entrenamiento en pausa. El reloj se detuvo.");
  };
  /** D185: cortar un entrenamiento sin ejercicios (no hay series: queda descartado, en el servidor también). */
  const discardEmpty = async () => {
    if (!s) return;
    setBusy(true);
    try {
      const n = localAction(s, "finish");
      if (!s.synced) { await dropSession(s.id); await delLocal(s.id); }
      else if (n) {
        await commit({ ...n, rest: null });
        await enqueue({ key: `action:${s.id}:${Date.now()}`, kind: "action", sid: s.id, action: "finish", at: new Date().toISOString() });
        await flush();
      }
      flash("Cortaste el entrenamiento vacío. Ya podés empezar otro día.");
      onExit("train");
    } finally { setBusy(false); }
  };
  const finish = async (confirmed = false) => {
    if (!s) return;
    // «Finalizar» está siempre en la cabecera: terminar con series pendientes se confirma (F-06). Lo registrado queda igual.
    const left = s.exercises.reduce((n, e, i) => n + (skippedAt(i) ? 0 : mainLeft(i)), 0);
    if (!confirmed && left && anyDone && !window.confirm(`Te ${left === 1 ? "queda 1 serie" : `quedan ${left} series`} sin hacer. ¿Cortar el entrenamiento acá? Lo que registraste queda guardado.`)) return;
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
    if (choice === "discard") {
      if (!window.confirm("¿Descartar el entrenamiento de este dispositivo? Las series que hiciste acá se pierden.")) return;
      await dropSession(s.id); await delLocal(s.id); flash("Descartaste el entrenamiento de este dispositivo."); onExit("home"); return;
    }
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

  /**
   * D145: aplicar ya la rutina que el coach acaba de guardar. Primero se guarda todo lo pendiente (las series viajan con
   * la versión anterior); después el servidor mueve lo hecho a la versión nueva y devuelve la sesión actualizada.
   */
  const [upgrading, setUpgrading] = useState(false);
  const applyNewRoutine = async () => {
    if (!s || upgrading) return;
    if (!navigator.onLine) { flash("Necesitás conexión para aplicar la rutina nueva."); return; }
    setUpgrading(true);
    try {
      await flush();
      if (await pendingFor(s.id)) { flash("Todavía se están guardando tus series. Probá de nuevo en unos segundos."); return; }
      const r = await api<{ changed: boolean; kept: string[]; session: Parameters<typeof fromServer>[0] }>(`/api/me/sessions/${s.id}/upgrade`, { body: {} });
      const fresh = fromServer(r.session, s.rest);
      const at = fresh.exercises.findIndex((e) => e.exerciseId === ex?.exerciseId);
      setExIdx(at >= 0 ? at : 0); setSel(null); setRir(null); setNoteDraft(null);
      await commit(fresh);
      onDismissChange?.(); setOutdated(false);
      flash(!r.changed ? "Ya tenías la rutina al día." : r.kept.length ? `Rutina nueva aplicada. Lo que hiciste de ${r.kept.join(", ")} quedó guardado.` : "Rutina nueva aplicada a este entrenamiento.");
    } catch (e) { flash((e as Error).message); } finally { setUpgrading(false); }
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
    if (c?.kind === "substitute") for (let i = 0; i < ex.sets; i++) { const k = setKey(ex.id, i); if (!sets[k].done && !isReducedKind(kindAt(ex.detail, i))) sets[k] = { ...sets[k], w: prev?.weightKg ?? 0 }; }
    const exercises = s.exercises.map((e) => (e.id === ex.id ? nextEx : e));
    setSel(null); setRir(null); setFeel(null); setNoteDraft(null);
    await commit({ ...s, exercises, sets });
    await enqueue({ key: `exchange:${s.id}:${ex.id}`, kind: "exchange", sid: s.id, peId: ex.id });
    flash(!c ? `Volviste a ${ex.name}.` : c.kind === "skip" ? `Salteaste ${ex.name}.` : `Hacés ${c.substitute?.name} en lugar de ${ex.name}.`);
  };

  if (err) return <div className="mb-scroll nobar"><p role="alert" className="mb-err">{err}</p><button type="button" className="ghost" onClick={() => onExit("train")}>Volver</button></div>;
  if (summary) return <Done sum={summary} coachFirst={coachFirst} onExit={onExit} flash={flash} justFinished={justFinished} onNudge={gym && !demo ? onNudge : undefined} />;
  const painSheet = pain && s && ex ? <PainSheet exerciseName={ex.name} sessionId={s.id} flash={flash} onClose={() => setPain(false)} /> : null;
  // D185: un día sin ejercicios (el coach lo dejó vacío o lo cambió después de empezar) dejaba la pantalla en «Cargando
  // entrenamiento…» para siempre, y como el entrenamiento seguía abierto, «Empezar» y «Continuar» volvían a abrirlo. Ahora
  // se explica y se puede cortar: sin series no se registra nada (queda descartado, como «Finalizar» sin series).
  if (s && !s.exercises.length && s.status !== "completed" && s.status !== "abandoned") return (
    <div className="mb-scroll nobar">
      <h1 tabIndex={-1}>{s.dayName}</h1>
      <p className="mb-note" role="alert">Este entrenamiento no tiene ejercicios: el día estaba vacío o tu coach lo cambió. No se registró nada.</p>
      <p className="mb-muted">Cortalo para empezar otro día de tu rutina. Si tu coach te pasó una rutina nueva, ya la vas a ver en Entrenar.</p>
      <button type="button" className="cta" aria-busy={busy || undefined} onClick={() => void discardEmpty()}>Cortar este entrenamiento</button>
      <button type="button" className="ghost" onClick={() => onExit("train")}>Volver</button>
    </div>
  );
  if (s && !ex && s.exercises.length) { setExIdx(0); return null; } // índice fuera de rango (la rutina cambió): al primero
  if (!s || !ex) return <div className="mb-scroll nobar"><p className="mb-muted">Cargando entrenamiento…</p></div>;

  const rowsOf = (i: number) => Array.from({ length: s.exercises[i].sets }, (_, j) => s.sets[setKey(s.exercises[i].id, j)]);
  // D183: series principales que faltan (una etapa omitida o pendiente no cuenta como serie).
  const mainLeft = (i: number) => planBlocks(s.exercises[i].detail, s.exercises[i].sets).filter((b) => !b.rows.some((k) => rowsOf(i)[k]?.done)).length;
  // Salteado = resuelto para avanzar y finalizar; sus series no hechas no se registran.
  const skippedAt = (i: number) => s.exercises[i].change?.kind === "skip";
  const resolved = (i: number) => skippedAt(i) || rowsOf(i).every(rowResolved);
  const exSkipped = skippedAt(exIdx);
  const exComplete = rows.every(rowResolved) || exSkipped;
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
  const savedInk = sync.kind === "error" || sync.kind === "conflict" || conflicts.length ? "var(--ui-error-text)" : sync.kind === "offline" || sync.kind === "pending" ? "var(--ui-warning-text)" : "var(--ui-accent-2)";

  const pendingSets = s.exercises.reduce((n, _, i) => n + (skippedAt(i) ? 0 : mainLeft(i)), 0);
  const grp = ex.detail?.group ? groupRounds(s.exercises, ex.detail.group) : null;
  const roundTxt = grp && labels[exIdx] && cur >= 0 ? `${ex.detail?.groupKind === "circuit" ? "Vuelta" : "Ronda"} ${blockOf(cur) + 1} de ${grp.programmed ?? grp.max}` : null;
  const keep = () => { lastAct.current = Date.now(); setStill(null); };
  // D191: objetivo de la fila en curso (no con un reemplazo hecho en el teléfono: el objetivo era del ejercicio original).
  const curTarget = !ex.change && cur >= 0 ? ex.targets?.find((t) => t.setIndex === cur) ?? null : null;
  // Suma tiempo al descanso en curso sin reiniciarlo (sólo si la persona lo toca); la propuesta queda usada y no se repite.
  const addRest = (sec: number) => rest && commit({ ...s, rest: rest.paused ? { ...rest, left: rest.left + sec, total: rest.total + sec } : { ...rest, end: (rest.end ?? Date.now()) + sec * 1000, total: rest.total + sec },
    intel: s.intel ? { ...s.intel, restPlusSec: null } : null });
  return (
    <div className="wo" onPointerDownCapture={() => { lastAct.current = Date.now(); }} onKeyDownCapture={() => { lastAct.current = Date.now(); }}>
      <div className="wo-body">
        <div className="wo-head">
          <button type="button" className="mb-icon" aria-label="Volver" style={{ marginLeft: -8 }} onClick={() => (s.rejected ? onExit("train") : setStill("leave"))}><Ic i={ArrowLeft} size={22} color="var(--ui-text)" /></button>
          <div>
            <strong>{s.dayName}</strong>
            <small><span aria-label={`Duración ${formatClock(elapsed)}`}>{formatClock(elapsed)}</span> · <span role="status" style={{ color: savedInk }}>{savedTxt}</span> · <button type="button" className="linkbtn tgt" onClick={() => act(paused ? "resume" : "pause")}>{paused ? "Reanudar" : "Pausar"}</button></small>
          </div>
          <button type="button" className="fin" onClick={() => void finish()} aria-busy={busy || undefined}>Finalizar</button>
        </div>
        {s.rejected ? (
          <div className="conflict" role="alert">
            <strong>{s.rejected.code === "presence_required" ? "Validá tu ingreso para seguir guardando" : "No se pudo guardar en tu cuenta"}</strong>
            <span>{s.rejected.message} Tus series siguen en este teléfono y no se borran. {s.rejected.code === "presence_required" ? "Cuando valides el ingreso se guardan solas." : s.rejected.code === "relation_inactive" ? "Si tu acceso vuelve a estar vigente, se guardan solas." : "Podés reintentar o descartarlo de este teléfono."}</span>
            <div>{s.rejected.code === "presence_required" && <button type="button" className="cta sm" onClick={() => setRevalidate(true)}>Validar ingreso</button>}
              <button type="button" className={s.rejected.code === "presence_required" ? "ghost sm" : "cta sm"} onClick={() => void flush()}>Reintentar</button><button type="button" className="ghost sm" onClick={async () => {
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
        {(programChanged || outdated) && (
          <div className="conflict" role="status">
            <strong>{coachFirst[0].toUpperCase()}{coachFirst.slice(1)} actualizó tu rutina</strong>
            <span>Lo que ya registraste queda guardado. Podés aplicar los cambios a este entrenamiento o seguir así y aplicarlos desde el próximo.</span>
            <div><button type="button" className="cta sm" aria-busy={upgrading || undefined} disabled={upgrading} onClick={() => void applyNewRoutine()}>{upgrading ? "Aplicando…" : "Aplicar ahora"}</button>
              <button type="button" className="ghost sm" onClick={() => { setOutdated(false); onDismissChange?.(); }}>Seguir así</button></div>
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
            <div><small>Ejercicio {exIdx + 1} de {s.exercises.length}</small><strong>{labels[exIdx] ? `${labels[exIdx]} · ` : ""}{sub ? sub.name : ex.name}</strong><small>{metaTxt(ex)}{ex.rir != null && !ex.detail?.setPlan ? ` · RIR ${ex.rir}` : ""}</small>
              {ex.detail && <small className="xc-tag">{detailLine(ex.detail, labels[exIdx], s.exercises, exIdx)}</small>}
              {roundTxt && <small className="xc-tag" aria-live="polite">{roundTxt}</small>}
              {ex.change && <small className="xc-tag">{sub ? `En lugar de ${ex.name}` : "Salteado"} · {EXERCISE_CHANGE_REASONS[ex.change.reason].toLowerCase()}</small>}</div>
            <div className="nav2">
              {!paused && <button type="button" aria-label={`Cambiar ${ex.name} en este entrenamiento`} onClick={() => setChanging(true)}><Ic i={ArrowsClockwise} size={16} /></button>}
              <button type="button" aria-label="Ejercicio anterior" disabled={exIdx === 0} onClick={() => { setExIdx(exIdx - 1); setSel(null); setRir(null); setNoteDraft(null); }}><Ic i={CaretLeft} size={16} /></button>
              <button type="button" aria-label="Ejercicio siguiente" disabled={exIdx === s.exercises.length - 1} onClick={() => { setExIdx(exIdx + 1); setSel(null); setRir(null); setNoteDraft(null); }}><Ic i={CaretRight} size={16} /></button>
            </div>
          </div>
          {/* D164: video del gimnasio o del coach; si no cargaron uno, búsqueda en YouTube (provisoria). */}
          {featureOn("exercise_video") && (ex.media?.kind === "video"
            ? <button type="button" className="wo-howto" onClick={() => setHowto(true)}><Ic i={PlayCircle} size={18} /> Ver cómo se hace</button>
            : <a className="wo-howto" href={ex.media?.url ?? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${sub ? sub.name : ex.name} técnica`)}`} target="_blank" rel="noopener noreferrer">
              <Ic i={PlayCircle} size={18} /> {ex.media ? "Ver cómo se hace" : "Buscar cómo se hace en YouTube"}</a>)}
          {curTarget ? (
            <TargetCard t={curTarget} unit={unit} label={rowName(cur)} canUse={!paused && !!curRow && !curRow.done}
              real={curRow?.done ? { w: curRow.w, r: curRow.r, rir: curRow.rir } : null}
              onUse={(w, r) => { editCur({ ...(w != null ? { w } : {}), ...(r != null ? { r } : {}) }); flash("Objetivo cargado: ajustalo si hace falta antes de completar."); }} />
          ) : <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><small>Serie anterior</small><span style={{ fontSize: 15, fontWeight: 500 }}>{prevTxt(ex.prev)}</span></div>}
          {!curTarget && ex.suggest && !ex.change && !ex.detail?.setPlan?.some((p) => p.weightKg != null) && (
            <div className="wo-suggest" role="note">
              <small>REPI sugiere hoy</small>
              <b>{ex.suggest.weightKg != null ? `${kg(ex.suggest.weightKg, unit)} × ` : ""}{ex.suggest.reps} reps</b>
              <span>{ex.suggest.why}</span>
            </div>
          )}
          <div className="sets" role="list" aria-label="Series">
            <div className="sets-h" aria-hidden="true"><span>Serie</span><span>Peso ({unit})</span><span>{repsKind === "time" ? "Seg" : "Reps"}</span><span /></div>
            {/* D183: cada serie principal con sus etapas conectadas debajo (drops, mini series, bloques de cluster). */}
            {blocks.map((b) => (
              <div key={b.main} className={`setblock${b.stages ? " has-stages" : ""}`} role="presentation">
                {b.rows.map((i) => {
                  const r = rows[i];
                  if (!r) return null;
                  const t = setTarget(ex, i);
                  const stage = t.stage > 0;
                  const state = r.done ? "completada" : r.skip ? "sin hacer" : i === cur ? "en curso" : "pendiente";
                  return (
                    <button type="button" role="listitem" key={i} className={`setrow${stage ? " stage" : ""}${r.skip && !r.done ? " skipped" : ""}`} aria-current={i === cur} onClick={() => { setSel(i); setRir(r.rir); setNoteDraft(r.note ?? null); }}
                      aria-label={`${stage ? `${t.label} de la serie ${b.index + 1}` : `Serie ${b.index + 1}${t.label ? `, ${t.label}` : ""}`}: ${r.pend && !r.done ? "peso por elegir" : kg(r.w, unit)}, ${r.r} ${repsKind === "time" ? "segundos" : t.countUnit === "rounds" ? "rondas" : "repeticiones"}, ${state}${r.note ? ", con nota" : ""}${r.conflict ? ", con conflicto" : ""}`}>
                      <span>{stage ? <small className="set-stage" aria-hidden="true">↳ {t.label}</small> : <>{b.index + 1}</>}{r.note && <Ic i={NotePencil} size={11} color="var(--ui-muted)" style={{ marginLeft: 3 }} />}
                        {!stage && ex.detail?.setPlan?.[i] && <small className="set-tg">{setTargetText(t)}</small>}
                        {stage && <small className="set-tg">{setTargetText({ ...t, label: null })}</small>}</span>
                      <span>{r.pend && !r.done ? "—" : String(r.w).replace(".", ",")}</span><span>{r.skip && !r.done ? "—" : r.r}</span>
                      <span className={`ck${r.done ? " on" : ""}${r.conflict ? " bad" : ""}`}>{r.done && <Ic i={Check} size={12} color="var(--ui-on-primary)" />}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {(ex.note || s.note) && (
          <div className="coach-tip"><Ic i={ChatCircleText} size={16} color="var(--ui-muted)" style={{ marginTop: 2 }} /><span>{ex.note || s.note}</span></div>
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
                  <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" style={{ stroke: "var(--ui-chart-track)" }} strokeWidth="4" /><circle cx="36" cy="36" r="33" fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - left / rest.total)} style={{ stroke: "var(--ui-accent)", transition: "stroke-dashoffset 250ms linear" }} /></svg>
                  <button type="button" aria-label={rest.paused ? "Reanudar descanso" : "Pausar descanso"} onClick={() => commit({ ...s, rest: rest.paused ? { ...rest, paused: false, end: Date.now() + rest.left * 1000 } : { ...rest, paused: true, left, end: null } })}>
                    {rest.paused ? <Ic i={Play} size={20} weight="fill" color="var(--ui-page)" /> : <Ic i={Pause} size={20} weight="fill" color="var(--ui-page)" />}
                  </button>
                </div>
                <button type="button" className="plus30" onClick={() => commit({ ...s, rest: rest.paused ? { ...rest, left: rest.left + 30, total: rest.total + 30 } : { ...rest, end: (rest.end ?? Date.now()) + 30_000, total: rest.total + 30 } })}>+30s</button>
              </div>
            </div>
            {s.intel && <p className="ti-rest" role="status">{s.intel.text}{s.intel.restPlusSec ? <> <button type="button" className="linkbtn" onClick={() => void addRest(s.intel!.restPlusSec!)}>Sumar {s.intel.restPlusSec} s</button></> : null}</p>}
            <div className="rest-foot"><span>Próxima: {cur >= 0 ? rowName(cur) : "serie"} · {curRow?.pend ? "peso por elegir" : kg(curRow?.w ?? 0, unit)} × {curRow?.r}</span><button type="button" className="linkbtn" onClick={() => commit({ ...s, rest: null })}>Saltar descanso</button></div>
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
                : <button type="button" className="cta" onClick={() => void finish()} aria-busy={busy || undefined}>Completar entrenamiento</button>}
          </>
        ) : curRow && (!exComplete || sel != null) ? (
          <>
            {curT && curT.stage > 0 && !curRow.done && (
              <div className="wo-stage" role="note"><b>{curT.label} · serie {curT.block + 1}</b>
                <span>{curT.kind === "drop" ? "Bajá la carga y seguí sin descanso." : curT.kind === "cluster" ? `Pausa de ${curT.restSec ?? 0} s entre bloques, misma carga.` : `Pausa corta (${curT.restSec ?? 0} s) y seguí con la misma carga.`}</span>
                <button type="button" className="ghost sm" onClick={() => void endBlockHere()}>Terminar la serie acá</button></div>
            )}
            {curRow.skip && !curRow.done && (
              <div className="wo-stage" role="note"><b>{rowName(cur)[0].toUpperCase()}{rowName(cur).slice(1)}: sin hacer</b>
                <span>Quedó sin hacer al terminar la serie antes. Si la hiciste, completala; si no, dejala así.</span>
                <button type="button" className="ghost sm" onClick={() => void unskip(cur)}>Volver a pendiente</button></div>
            )}
            {ex.detail?.emomSec && !curRow.done && (curT?.stage ?? 0) === 0 && (() => {
              // D184: el intervalo viene del servidor si se empezó en otro dispositivo. Si venció sin registrar la serie o se
              // pausó el entrenamiento, no se calcula en qué momento estaría: se vuelve a empezar.
              const iv = s.iv?.peId === ex.id && s.iv.block === blockOf(cur) ? s.iv : null;
              const v = iv ? intervalView({ peId: iv.peId, block: iv.block, startedAt: new Date(iv.start).toISOString(), emomSec: iv.emomSec, status: iv.status, at: "" }, now) : null;
              return (
                <div className="wo-stage" role="note"><b>EMOM · intervalo {blockOf(cur) + 1} de {blocks.length} · cada {ex.detail.emomSec} s</b>
                  {v?.phase === "running" ? <span role="timer" aria-live="off">Intervalo en curso: {formatClock(v.leftSec)} para el próximo.</span>
                    : v?.phase === "upcoming" ? <span role="timer" aria-live="off">El intervalo {blockOf(cur) + 1} empieza en {formatClock(v.leftSec)}.</span>
                      : <>{v?.phase === "expired" && <span>El intervalo terminó sin registrar la serie.</span>}
                        {v?.phase === "interrupted" && <span>El intervalo se interrumpió con la pausa.</span>}
                        <button type="button" className="ghost sm" onClick={() => void startInterval()}>{v ? "Volver a empezar el intervalo" : "Empezar el intervalo"}</button></>}
                </div>
              );
            })()}
            {!curRow.done && ctl && <SetControl key={`ctl:${ex.id}:${cur}`} ctl={ctl} onSet={(r) => editCur({ r })} />}
            {curRow.pend && !curRow.done && curTarget?.weightKg == null && (() => {
              // D182: referencia del método para confirmar (back-off −15 % del top, drop −20 % de la anterior). Nunca se aplica sola.
              const hint = reducedLoadHint(ex.detail?.setPlan, cur, rows.map((x) => (x.pend && !x.done ? null : x.w)));
              return (
                <div className="wo-suggest" role="note">
                  <small>{setTarget(ex, cur).label ?? "Serie"} · elegí el peso</small>
                  {hint ? <><b>Referencia: {kg(hint.weightKg, unit)}</b><span>{hint.why}. Es una aproximación: ajustala si hace falta.</span>
                    <button type="button" className="ghost sm" onClick={() => editCur({ w: hint.weightKg })}>Usar {kg(hint.weightKg, unit)}</button></>
                    : <span>Esta serie va con menos carga que la principal. Marcá el peso con − y + o tocá el número para escribirlo.</span>}
                </div>
              );
            })()}
            <div className="steppers">
              <WeightStepper key={`${ex.id}:${cur}:${unit}`} exerciseId={ex.exerciseId} unit={unit} w={curRow.w} onChange={(w) => editCur({ w })} flash={flash} />
              <div className="stepper"><button type="button" aria-label="Menos repeticiones" onClick={() => editCur({ r: stepReps(curRow.r, -1) })}>−</button><span><strong>{curRow.r}</strong><small>{repsKind === "time" ? "seg" : "reps"}</small></span><button type="button" aria-label="Más repeticiones" onClick={() => editCur({ r: stepReps(curRow.r, 1) })}>+</button></div>
            </div>
            <div className="wo-tools">
              {repsKind !== "time" && curRow.w > 0 && <button type="button" className="linkbtn" onClick={() => setPlates(true)}>Discos y entrada en calor</button>}
              <button type="button" className="linkbtn" onClick={() => setNoteOpen(true)}>{noteDraft?.trim() ? "Editar nota" : "Nota de la serie"}</button>
              {connectPlace && <button type="button" className="linkbtn" onClick={() => setAsking(true)}>Pedir ayuda a sala</button>}
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
            <button type="button" className="cta" onClick={complete}>{curRow.done ? `Guardar ${rowName(cur)}` : `Completar ${rowName(cur)}`}</button>
          </>
        ) : (
          <>
            <span className="mb-muted" style={{ textAlign: "center", fontSize: 14 }}>{sub ? sub.name : ex.name} completo · {blocks.length} {blocks.length === 1 ? "serie" : "series"}</span>
            {!ex.change && ex.outlook?.proposal && <p className="ti-outlook"><small>Para la próxima sesión</small>{ex.outlook.proposal.text}{ex.outlook.proposal.requiresCoach ? " Lo decide tu profe." : ""}</p>}
            {nextEx >= 0 ? <button type="button" className="cta" onClick={() => { setExIdx(nextEx); setSel(null); }}>Siguiente: {s.exercises[nextEx].name}</button>
              : anyOpen ? <button type="button" className="cta" onClick={() => { setExIdx(s.exercises.findIndex((_, i) => !resolved(i))); setSel(null); }}>Ir a la serie pendiente</button>
                : <button type="button" className="cta" onClick={() => void finish()} aria-busy={busy || undefined}>Completar entrenamiento</button>}
          </>
        )}
      </div>
      {painSheet}
      {plates && curRow && <PlatesSheet kgWeight={curRow.w} unit={unit} onClose={() => setPlates(false)} />}
      {changing && <ExerciseChangeSheet sessionId={s.id} ex={ex} unit={unit} onApply={applyChange} onPain={() => setPain(true)} onClose={() => setChanging(false)} />}
      {revalidate && <PresenceSheet orgId={gymOrgId} demo={demo} flash={flash} onClose={() => setRevalidate(false)} onValidated={() => { setRevalidate(false); void flush(); }} />}
      {asking && connectPlace && <ConnectHelpSheet place={connectPlace} flash={flash} onClose={() => setAsking(false)}
        context={{ sessionId: s.id, programExerciseId: ex.id, exerciseId: (sub ?? ex).exerciseId, exerciseName: sub ? sub.name : ex.name, setIndex: cur }} />}
      {still && (
        <Sheet title="¿Seguís entrenando?" closeLabel="Seguir" onClose={keep}
          sub={still === "idle" ? `Hace ${Math.round((now - lastAct.current) / 60_000)} minutos que no registrás nada.` : `Si salís, «${s.dayName}» queda abierto y lo retomás desde Entrenar.`}>
          <button type="button" className="cta" onClick={keep}>Sí, sigo entrenando</button>
          <button type="button" className="ghost" onClick={async () => { setStill(null); if (s.status === "in_progress") await act("pause"); if (still === "leave") onExit("train"); }}>
            {still === "leave" ? "Pausar y seguir más tarde" : "Pausar el entrenamiento"}</button>
          <button type="button" className="ghost" aria-busy={busy || undefined} onClick={() => { setStill(null); void finish(true); }}>
            {!anyDone ? "Cortar entrenamiento (sin series, se descarta)" : pendingSets ? "Cortar entrenamiento acá" : "Completar entrenamiento"}</button>
          {anyDone && pendingSets > 0 && <p className="sheet-sub">Lo que registraste queda guardado; las {pendingSets} series que faltan no se cuentan.</p>}
        </Sheet>
      )}
      {howto && ex.media?.kind === "video" && (
        <Sheet title={sub ? sub.name : ex.name} sub="Cómo se hace, según tu gimnasio o tu coach." closeLabel="Cerrar" onClose={() => setHowto(false)}>
          <video className="wo-howto-video" src={ex.media.url} controls playsInline autoPlay muted loop preload="metadata" />
        </Sheet>
      )}
      {noteOpen && curRow && <SetNoteSheet n={rowName(cur)} done={curRow.done} value={noteDraft ?? ""} onSave={(v) => setNoteDraft(v.trim() ? v.slice(0, 200) : null)} onClose={() => setNoteOpen(false)} />}
    </div>
  );
}

/** Nota de una serie (F-HX-21): queda con la serie al completarla o guardarla, y la ve el coach de la relación. */
function SetNoteSheet({ n, done, value, onSave, onClose }: { n: string; done: boolean; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  return (
    <Sheet title={`Nota: ${n}`} sub={`Ej.: «agarre cerrado», «molestó la rodilla en la última». Se guarda al ${done ? "guardar" : "completar"} la serie. Hasta 200 caracteres.`} onClose={onClose}
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

function Done({ sum, coachFirst, onExit, flash, justFinished, onNudge }: { sum: DoneData; coachFirst: string; onExit: (to: "train" | "home" | "prog") => void; flash: (t: string) => void; justFinished: boolean; onNudge?: (n: Nudge) => void }) {
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
    <div className="mb-scroll nobar done" data-cel={cel ?? undefined} style={{ paddingTop: "max(60px, calc(var(--safe-top) + 16px))" }}>
      {burst && <Confetti seed={seedOf(sum.id)} origin={() => { const r = ring.current?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }} onDone={() => setBurst(false)} />}
      <div className="done-hero">
        <div className="done-ring" ref={ring}><svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="44" fill="none" style={{ stroke: "var(--ui-chart-track)" }} strokeWidth="4" /><circle className="arc" cx="48" cy="48" r="44" fill="none" style={{ stroke: "var(--ui-accent)" }} strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - sum.setsDone / Math.max(1, sum.setsTotal)} /></svg>
          <Ic i={Check} size={34} color="var(--ui-accent)" /></div>
        <h1 tabIndex={-1}>{complete ? `¡${sum.dayName} completo!` : `${sum.dayName} registrado`}</h1>
        <span className="mb-muted" style={{ fontSize: 15 }}>Cada repetición cuenta. Hoy sumaste {sum.setsDone} {sum.setsDone === 1 ? "serie" : "series"}{sum.stagesDone ? ` y ${sum.stagesDone} ${sum.stagesDone === 1 ? "etapa" : "etapas"} (drops, mini series)` : ""}.{sum.stagesSkipped ? ` ${sum.stagesSkipped === 1 ? "1 etapa quedó" : `${sum.stagesSkipped} etapas quedaron`} sin hacer.` : ""}</span>
      </div>
      {sum.local && <p className="mb-note" role="status">Guardado en el teléfono. Se sincroniza al volver la conexión; los récords se calculan ahí.</p>}
      <div className="stats3">
        <div><strong>{formatClock(dur)}</strong><span>Duración activa</span></div>
        <div><strong>{sum.exDone}/{sum.exTotal}</strong><span>{sum.exSkipped ? `Ejercicios · ${sum.exSkipped} salteado${sum.exSkipped === 1 ? "" : "s"}` : "Ejercicios"}</span></div>
        <div><strong>{sum.setsDone}/{sum.setsTotal}</strong><span>Series</span></div>
      </div>
      {pr && (
        <div className="pr" data-reveal={cel ? "1" : undefined}>
          <Ic i={Trophy} size={34} color="var(--ui-warning)" />
          <div><small>Nuevo récord personal · 1RM estimado</small><strong>{pr.exercise} · {kg(pr.current.weightKg, unit)} × {pr.current.reps}</strong>
            <span>Anterior: {kg(pr.previous.weightKg, unit)} × {pr.previous.reps}{pr.previousAt ? ` · ${new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(pr.previousAt))}` : ""} · Epley {kgTo(pr.previous.e1rm, unit).toLocaleString("es-AR")} → {kgTo(pr.current.e1rm, unit).toLocaleString("es-AR")} {unit}</span></div>
        </div>
      )}
      {/* D168: con lo que acaba de levantar, dónde entraría en desafíos y rankings del gym. */}
      {onNudge && !sum.local && <Nudges go={onNudge} flash={flash} only={["challenge", "ranking_optin", "club"]} max={1} title="Con lo que venís levantando" />}
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
        ) : sent === "local" ? <span style={{ fontSize: 14, color: "var(--ui-warning-text)" }}>Guardado en el teléfono · le llega {coachFirst.startsWith("el ") ? `al ${coachFirst.slice(3)}` : `a ${coachFirst}`} al volver la conexión.</span>
          : <span style={{ fontSize: 14, color: "var(--ui-accent-2)" }}>Enviado ✓ {coachFirst} lo ve en tu ficha.</span>}
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
    // D182: borrar todo y salir del campo no cambia el peso ni muestra un error (no se registra un 0 que nadie escribió).
    if (!typing.trim()) { setTyping(null); return; }
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
          ? <input autoFocus inputMode="decimal" aria-label={`Peso en ${unit}`} value={typing} placeholder={fmt(shown)} onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setTyping(cleanDecimalDraft(e.target.value))}
            onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); done(); } if (e.key === "Escape") setTyping(null); }} />
          : <button type="button" className="wval" aria-label={`${fmt(shown)} ${unit}. Tocá para escribir el peso`} onClick={() => setTyping(shown ? String(shown).replace(".", ",") : "")}><strong>{fmt(shown)}</strong></button>}
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

/** D134: técnica, combinación (con qué se alterna), tempo y variante del ejercicio, en una línea. */
function detailLine(d: ExerciseDetail, label: string | null | undefined, all: { name: string; detail?: ExerciseDetail | null; change?: ExChange | null }[], idx: number) {
  const mates = d.group ? all.filter((x, i) => i !== idx && x.detail?.group === d.group && x.change?.kind !== "skip").map((x) => x.change?.substitute?.name ?? x.name) : [];
  return [
    d.technique !== "straight" ? TECHNIQUES[d.technique].label : null,
    label && mates.length ? `${d.groupKind === "circuit" ? `Circuito${d.rounds ? ` × ${d.rounds} vueltas` : ""}` : "Combinado"} con ${mates.join(", ")}` : null,
    d.tempo ? `Tempo ${d.tempo}` : null, d.variant, d.unilateral ? "Por lado" : null, d.progression,
  ].filter(Boolean).join(" · ");
}

