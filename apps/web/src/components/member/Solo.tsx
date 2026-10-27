"use client";
// Adaptive Coach fase 1 (D108): «Quiero entrenar por mi cuenta» y «No vino el profe». Muestra lo que ya existe (rutina
// asignada, sesión abierta) y reglas simples; no genera rutinas ni usa IA. «No vino el profe» no afirma una ausencia:
// sólo cambia el texto y, en el gimnasio, ofrece pedir ayuda a otro entrenador de sala.
import { useEffect, useState } from "react";
import type { SoloPlan, SoloVariant } from "@repi/domain";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";

export function SoloEntry({ onOpen }: { onOpen: (v: SoloVariant) => void }) {
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
        <p className="sheet-sub solo-foot">Resuelto con tu programa y tus registros, sin inteligencia artificial.</p>
      </>}
    </Sheet>
  );
}
