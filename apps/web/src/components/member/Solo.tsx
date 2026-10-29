"use client";
// Adaptive Coach fase 1 (D108): «Quiero entrenar por mi cuenta» y «No vino el profe». Muestra lo que ya existe (rutina
// asignada, sesión abierta) y reglas simples. «No vino el profe» no afirma una ausencia: sólo cambia el texto y, en el
// gimnasio, ofrece pedir ayuda a otro entrenador de sala. D133: además pide a la IA el día y las cargas sugeridas para hoy
// (en «por mi cuenta», a pedido), siempre dentro del programa asignado.
import { useEffect, useState } from "react";
import type { SoloPlan, SoloVariant } from "@repi/domain";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";

type Advice = { dayId: string; dayName: string; headline: string; summary: string; caution: string | null; exercises: { id: string; name: string; sets: number; reps: string; weightKg: number | null; note: string }[] };

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

export function SoloEntry({ onOpen }: { onOpen: (v: SoloVariant) => void }) {
  useEffect(() => { if (navigator.onLine) advice().catch(() => {}); }, []);
  return (
    <div className="solo-card">
      <button type="button" className="ghost" onClick={() => onOpen("coach_absent")}>No vino el profe, dame mi rutina para hoy</button>
      <button type="button" className="linkbtn" onClick={() => onOpen("solo")}>Quiero entrenar por mi cuenta</button>
    </div>
  );
}

export function SoloSheet({ variant, onClose, onStart, onContinue, onHelp, onMessage }: {
  variant: SoloVariant; onClose: () => void; onStart: (dayId: string) => void; onContinue: () => void; onHelp: () => void; onMessage: () => void;
}) {
  const [plan, setPlan] = useState<SoloPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ai, setAi] = useState<Advice | null>(null);
  const [aiState, setAiState] = useState<"idle" | "busy" | "error">("idle");
  const [aiErr, setAiErr] = useState<string | null>(null);
  const askAi = (force = false) => {
    setAiState("busy"); setAiErr(null);
    advice(force).then((a) => { setAi(a); setAiState("idle"); }).catch((e) => { setAiErr((e as Error).message); setAiState("error"); });
  };
  const canAi = !!plan && plan.options.some((o) => o.action === "start");
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
        {canAi && (
          <div className="ai-card" aria-live="polite">
            {aiState === "busy" && <p className="sheet-sub" role="status">Armando tu sugerencia para hoy con IA…</p>}
            {aiState === "error" && <p className="sheet-warn">{aiErr} <button type="button" className="linkbtn" onClick={() => askAi(true)}>Reintentar</button></p>}
            {aiState === "idle" && !ai && <button type="button" className="ghost" onClick={() => askAi()}>Sugerencia personalizada con IA</button>}
            {ai && <>
              <b>{ai.headline}</b>
              <p className="sheet-sub">{ai.summary}</p>
              {ai.caution && <p className="sheet-warn" role="note">{ai.caution}</p>}
              <ul>{ai.exercises.map((e) => (
                <li key={e.id}><span>{e.name}</span><span>{e.sets}×{e.reps}{e.weightKg != null ? ` · ${e.weightKg.toLocaleString("es-AR")} kg` : ""}</span>{e.note && <small>{e.note}</small>}</li>
              ))}</ul>
              <button type="button" className="cta" onClick={() => { onClose(); onStart(ai.dayId); }}>Empezar {ai.dayName}</button>
            </>}
          </div>
        )}
        <p className="sheet-sub solo-foot">{ai ? "Sugerencia de IA (OpenAI) con tu programa, tus registros, tus objetivos y tu check-in, sin datos de salud. Revisala: tu profe decide." : "Opciones resueltas con tu programa y tus registros."}</p>
      </>}
    </Sheet>
  );
}
