"use client";
// Asistente REPI (D209) · tarjeta de Inicio, después del «próximo entrenamiento». Una sola prioridad del día (la elige el motor
// de relevancia en el servidor) con Ver por qué · Empezar · Hablar con REPI · Descartar · No mostrar algo parecido. Descartar y
// «no mostrar algo parecido» quedan en el servidor (no en el teléfono). Sin aviso, una línea de «hoy» y la entrada al chat.
import { useEffect, useRef } from "react";
import { useUnit } from "@/components/member/units";
import { useBrain } from "./BrainProvider";
import { OriginTag } from "./parts";
import { presentIntervention, ORIGIN_LABEL, type HomeCardVM } from "./presenter";
import type { CardAction, InterventionView } from "./types";

export function RepiCard({ onStart, onOpen, onResolved, startName }: {
  /** El inicio de siempre (con su check-in y validación de ingreso): nunca un segundo camino para empezar. */
  onStart: (dayKey: string | null) => void;
  /** «Ver cambios», «Revisar», «Ver cierre»…: a qué pantalla lleva cada aviso. */
  onOpen: (card: InterventionView) => void;
  onResolved?: (card: InterventionView) => void;
  startName?: string | null;
}) {
  const brain = useBrain();
  const unit = useUnit();
  const card = brain.home?.card ?? null;
  const shown = useRef<string | null>(null);
  // Visto en la app: así no se vuelve a empujar por push.
  useEffect(() => {
    if (!card || card.status !== "pending" || shown.current === card.id) return;
    shown.current = card.id;
    void brain.resolve(card.id, "shown");
  }, [card, brain]);
  if (!brain.enabled || brain.offline) return null;

  if (!card) return (
    <section className="rp-card is-quiet" aria-label="Asistente REPI">
      <div className="rp-card-top"><span className="rp-badge">REPI</span>{brain.home && <span className="rp-origin" data-kind="rules">{ORIGIN_LABEL.rules}</span>}</div>
      {brain.home?.today.text && <p className="rp-card-body">{brain.home.today.text}</p>}
      <button type="button" className="ghost sm" onClick={() => brain.open({ section: "home" })}>Hablar con REPI</button>
    </section>
  );

  const vm: HomeCardVM = presentIntervention(card, unit);
  const run = async (a: CardAction) => {
    switch (a.id) {
      case "why":
        if (vm.evidence) brain.showWhy({ claim: vm.title, evidence: vm.evidence, feedback: { target: "intervention", id: card.id }, chat: { section: "home", ref: card.data } });
        return;
      case "chat": brain.open({ section: "home", ref: card.data, subject: vm.title }); return;
      case "start": void brain.resolve(card.id, "accepted"); onResolved?.(card); onStart(brain.home?.today.dayKey ?? null); return;
      case "open": case "accept": case "modify":
        if (await brain.resolve(card.id, "accepted")) onResolved?.(card);
        if (a.id === "modify") brain.open({ section: "home", ref: card.data, subject: vm.title }); else onOpen(card);
        return;
      case "dismiss": case "never":
        if (await brain.resolve(card.id, a.id === "never" ? "never" : "dismissed")) onResolved?.(card);
        return;
    }
  };
  // «Empezar» no repite el nombre del botón del hero («Comenzar entrenamiento»): dice qué día abre.
  const label = (a: CardAction) => (a.id === "start" && startName ? `${a.label} ${startName}` : a.label);
  return (
    <section className="rp-card" aria-labelledby="rp-card-h" data-cat={card.category}>
      <div className="rp-card-top"><span className="rp-badge">REPI</span><OriginTag o={vm.origin} /></div>
      <h2 id="rp-card-h" className="rp-card-title">{vm.title}</h2>
      {vm.body && <p className="rp-card-body">{vm.body}</p>}
      <div className="rp-card-acts">
        {vm.primary.map((a, i) => (
          <button key={a.id} type="button" className={i === 0 && (a.id === "start" || a.id === "open" || a.id === "accept" || a.id === "modify") ? "cta sm" : "ghost sm"} onClick={() => void run(a)}>{label(a)}</button>
        ))}
      </div>
      {vm.secondary.length > 0 && (
        <div className="rp-card-more">
          {vm.secondary.map((a) => <button key={a.id} type="button" className="linkbtn" onClick={() => void run(a)}>{a.label}</button>)}
        </div>
      )}
    </section>
  );
}
