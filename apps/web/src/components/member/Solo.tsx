"use client";
// Adaptive Coach fase 1 (D108): «Quiero entrenar por mi cuenta» y «No vino el profe». Muestra lo que ya existe (rutina
// asignada, sesión abierta) y reglas simples. «No vino el profe» no afirma una ausencia: sólo cambia el texto y, en el
// gimnasio, ofrece pedir ayuda a otro entrenador de sala. D133: además pide a la IA el día y las cargas sugeridas para hoy
// (en «por mi cuenta», a pedido), siempre dentro del programa asignado. D138: la persona puede responderle (ocupado, no hay,
// me molesta o un mensaje) y la IA rearma con alternativas compatibles; al empezar, los cambios quedan aplicados en la sesión.
import { useEffect, useState } from "react";
import { EXERCISE_CHANGE_REASONS, type ExerciseChangeReason, type SoloPlan, type SoloVariant } from "@repi/domain";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";

type Prev = { weightKg: number | null; reps: number | null } | null;
export type AdviceEx = { id: string; name: string; sets: number; reps: string; weightKg: number | null; note: string; prev?: Prev;
  swap: { exerciseId: string; name: string; approved: boolean; prev: Prev } | null; skip: boolean; reason: ExerciseChangeReason | null };
export type Advice = { dayId: string; dayName: string; headline: string; summary: string; caution: string | null; exercises: AdviceEx[] };
type Turn = { role: "user" | "assistant"; text: string };
/** D153: rutina de hoy sin programa asignado (ejercicios de la biblioteca). */
export type Routine = { kind: "routine"; dayName: string; headline: string; summary: string; caution: string | null; byRules: boolean;
  exercises: { id: string; exerciseId: string; name: string; group: string; sets: number; reps: string; weightKg: number | null; restSec: number; note: string; prev: Prev }[] };
// Problemas que la persona marca con un toque; el resto lo cuenta en el mensaje.
const ISSUES: [ExerciseChangeReason, string][] = [["busy", "Ocupada"], ["no_equipment", "No hay"], ["discomfort", "Me molesta"]];

// Precarga (D133): se pide al abrir Entrenar, una vez por día y pestaña, para que «No vino el profe» la muestre al instante.
let cached: { key: string; p: Promise<Advice> } | null = null;
function advice(force = false) {
  const key = new Date().toDateString();
  if (force || !cached || cached.key !== key) {
    const p = api<Advice>("/api/me/solo/ai", { body: {} });
    cached = { key, p };
    p.catch(() => { if (cached?.p === p) cached = { key, p }; }); // el error queda en caché hasta «Reintentar»
  }
  return cached.p;
}

export function SoloEntry({ onOpen, prefetch = true }: { onOpen: (v: SoloVariant) => void; prefetch?: boolean }) {
  useEffect(() => { if (prefetch && navigator.onLine) advice().catch(() => {}); }, [prefetch]); // sin programa no hay día que sugerir (D153)
  return (
    <div className="solo-card">
      <button type="button" className="ghost" onClick={() => onOpen("coach_absent")}>No vino el profe, dame mi rutina para hoy</button>
      <button type="button" className="linkbtn" onClick={() => onOpen("solo")}>Quiero entrenar por mi cuenta</button>
    </div>
  );
}

export function SoloSheet({ variant, onClose, onStart, onStartRoutine, onContinue, onHelp, onMessage }: {
  variant: SoloVariant; onClose: () => void; onStart: (dayId: string, ai?: Advice) => void; onStartRoutine: (r: Routine) => void; onContinue: () => void; onHelp: () => void; onMessage: () => void;
}) {
  const [plan, setPlan] = useState<SoloPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ai, setAi] = useState<Advice | null>(null);
  const [aiState, setAiState] = useState<"idle" | "busy" | "error">("idle");
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, ExerciseChangeReason>>({});
  const [msg, setMsg] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const askAi = (force = false) => {
    setAiState("busy"); setAiErr(null);
    advice(force).then((a) => { setAi(a); setAiState("idle"); }).catch((e) => { setAiErr((e as Error).message); setAiState("error"); });
  };
  // D138: la respuesta viaja con el día que venía y los problemas marcados; la nueva sugerencia reemplaza a la anterior.
  const reply = () => {
    if (!ai || aiState === "busy") return;
    const list = Object.entries(issues).map(([programExerciseId, reason]) => ({ programExerciseId, reason }));
    const said = [msg.trim(), ...list.map((i) => `${ai.exercises.find((e) => e.id === i.programExerciseId)?.name}: ${EXERCISE_CHANGE_REASONS[i.reason].toLowerCase()}`)].filter(Boolean).join(" · ");
    if (!said) return;
    const hist: Turn[] = [...turns, { role: "assistant" as const, text: `${ai.headline}. ${ai.summary}` }, { role: "user" as const, text: said }].slice(-6);
    setAiState("busy"); setAiErr(null);
    api<Advice>("/api/me/solo/ai", { body: { follow: { dayId: ai.dayId, message: msg.trim(), issues: list, turns: turns.slice(-4) } } })
      .then((a) => {
        setAi(a); setTurns(hist); setIssues({}); setMsg(""); setAiState("idle");
        cached = { key: new Date().toDateString(), p: Promise.resolve(a) };
      })
      .catch((e) => { setAiErr((e as Error).message); setAiState("error"); });
  };
  const canAi = !!plan && plan.options.some((o) => o.action === "start");
  const noProgram = plan?.mode === "no_program" || plan?.mode === "scheduled";
  useEffect(() => { if (variant === "coach_absent" && canAi && aiState === "idle" && !ai) askAi(); }, [variant, canAi]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api<SoloPlan>(`/api/me/solo?v=${variant}`).then(setPlan)
      .catch(() => setErr("Sin conexión no podemos revisar tu día. Igual podés empezar la rutina asignada desde Entrenar."));
  }, [variant]);
  const run = (o: SoloPlan["options"][number]) => {
    onClose();
    if (o.action === "start" && o.dayId) onStart(o.dayId);
    else if (o.action === "continue") onContinue();
    else if (o.action === "ask_help") onHelp();
    else if (o.action === "message") onMessage();
  };
  return (
    <Sheet title={plan?.title ?? (variant === "coach_absent" ? "Tu rutina para hoy" : "Entrenar por tu cuenta")} onClose={onClose} warn={err}>
      {!plan && !err && <p className="sheet-sub" role="status">Revisando tu programa y tus entrenamientos…</p>}
      {plan && <>
        {plan.reasons.map((r) => <p key={r} className="sheet-sub">{r}</p>)}
        {plan.warnings.map((w) => <p key={w} className="sheet-warn" role="note">{w}</p>)}
        <div className="xc-actions">
          {plan.options.map((o, i) => (
            <button key={o.label} type="button" className={i === 0 && o.action !== "message" ? "cta" : "ghost"} onClick={() => run(o)}>
              {o.label}{o.caution ? " (no recomendado)" : ""}
            </button>
          ))}
        </div>
        {noProgram && <RoutineCard onStart={(r) => { onClose(); onStartRoutine(r); }} />}
        {canAi && (
          <div className="ai-card" aria-live="polite">
            {aiState === "busy" && <p className="sheet-sub" role="status">{ai ? "REPI está rearmando tu rutina con lo que contaste…" : "REPI está armando tu rutina para hoy…"}</p>}
            {aiState === "error" && <p className="sheet-warn">{aiErr} <button type="button" className="linkbtn" onClick={() => (ai ? reply() : askAi(true))}>Reintentar</button></p>}
            {aiState === "idle" && !ai && <button type="button" className="ghost" onClick={() => askAi()}>Sugerencia personalizada de REPI</button>}
            {ai && <>
              <b>{ai.headline}</b>
              <p className="sheet-sub">{ai.summary}</p>
              {ai.caution && <p className="sheet-warn" role="note">{ai.caution}</p>}
              {turns.length > 0 && <p className="sheet-sub ai-said">Le dijiste: «{turns[turns.length - 1].text}»</p>}
              <ul>{ai.exercises.map((e) => (
                <li key={e.id} className={e.skip ? "ai-skip" : undefined}>
                  <span>{e.swap ? <>{e.swap.name} <small className="ai-swap">en lugar de {e.name}{e.swap.approved ? " · aprobado por tu profe" : ""}</small></> : e.name}</span>
                  <span>{e.skip ? "Saltear hoy" : `${e.sets}×${e.reps}${e.weightKg != null ? ` · ${e.weightKg.toLocaleString("es-AR")} kg` : ""}`}</span>
                  {e.note && <small>{e.note}</small>}
                  <span className="ai-issues" role="group" aria-label={`Problema con ${e.swap?.name ?? e.name}`}>
                    {ISSUES.map(([k, label]) => (
                      <button key={k} type="button" className="ai-chip" aria-pressed={issues[e.id] === k}
                        onClick={() => setIssues((x) => { const n = { ...x }; if (n[e.id] === k) delete n[e.id]; else n[e.id] = k; return n; })}>{label}</button>
                    ))}
                  </span>
                </li>
              ))}</ul>
              <form className="ai-reply" onSubmit={(ev) => { ev.preventDefault(); reply(); }}>
                <label className="sheet-sub" htmlFor="ai-reply">¿Algo no se puede? Marcalo arriba o contale a REPI</label>
                <textarea id="ai-reply" rows={2} maxLength={400} value={msg} onChange={(ev) => setMsg(ev.target.value)} placeholder="Ej.: el rack está ocupado y no hay mancuernas de más de 20 kg" />
                <button type="submit" className="ghost" disabled={aiState === "busy" || (!msg.trim() && !Object.keys(issues).length)}>Rearmar mi rutina</button>
              </form>
              <button type="button" className="cta" disabled={aiState === "busy"} onClick={() => { onClose(); onStart(ai.dayId, ai); }}>Empezar {ai.dayName}</button>
            </>}
          </div>
        )}
        <p className="sheet-sub solo-foot">{noProgram ? "REPI usa la biblioteca de ejercicios, tus registros, lo que buscás entrenando y tu check-in, sin datos de salud (lo procesa OpenAI). Es sólo para hoy: tu programa lo arma tu profe." : ai ? "REPI tuvo en cuenta tu programa, tus registros, tus objetivos, lo que buscás entrenando, tu check-in y lo que le contestes, sin datos de salud (lo procesa OpenAI). Los cambios valen sólo por hoy; tu programa no cambia. Revisala: tu profe decide." : "Opciones resueltas con tu programa y tus registros."}</p>
      </>}
    </Sheet>
  );
}

/** D153: sin rutina asignada, REPI arma la de hoy con ejercicios de la biblioteca. Se puede pedir otra cosa y rearmarla. */
function RoutineCard({ onStart }: { onStart: (r: Routine) => void }) {
  const [r, setR] = useState<Routine | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const ask = (message?: string) => {
    setBusy(true); setErr(null);
    api<Routine>("/api/me/solo/routine", { body: message ? { message } : {} })
      .then((x) => { setR(x); setMsg(""); }).catch((e) => setErr((e as Error).message)).finally(() => setBusy(false));
  };
  useEffect(() => { ask(); }, []);
  return (
    <div className="ai-card" aria-live="polite">
      {busy && <p className="sheet-sub" role="status">{r ? "REPI está rearmando tu rutina…" : "REPI está armando tu rutina para hoy…"}</p>}
      {err && <p className="sheet-warn">{err} <button type="button" className="linkbtn" onClick={() => ask(msg.trim() || undefined)}>Reintentar</button></p>}
      {r && <>
        <b>{r.headline}</b>
        <p className="sheet-sub">{r.summary}</p>
        {r.caution && <p className="sheet-warn" role="note">{r.caution}</p>}
        <ul>{r.exercises.map((e) => (
          <li key={e.id}>
            <span>{e.name} <small className="ai-swap">{e.group}</small></span>
            <span>{`${e.sets}×${e.reps}${e.weightKg != null ? ` · ${e.weightKg.toLocaleString("es-AR")} kg` : ""}`}</span>
            {e.note && <small>{e.note}</small>}
          </li>
        ))}</ul>
        <form className="ai-reply" onSubmit={(ev) => { ev.preventDefault(); if (msg.trim() && !busy) ask(msg.trim()); }}>
          <label className="sheet-sub" htmlFor="routine-reply">¿Querés otra cosa? Contale a REPI</label>
          <textarea id="routine-reply" rows={2} maxLength={400} value={msg} onChange={(ev) => setMsg(ev.target.value)} placeholder="Ej.: tengo 30 minutos y quiero sólo tren superior" />
          <button type="submit" className="ghost" disabled={busy || !msg.trim()}>Rearmar mi rutina</button>
        </form>
        <button type="button" className="cta" disabled={busy} onClick={() => onStart(r)}>Empezar rutina de hoy</button>
      </>}
    </div>
  );
}
