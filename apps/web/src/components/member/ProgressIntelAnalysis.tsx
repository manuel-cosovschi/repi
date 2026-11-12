"use client";
// D217 · Progress Intelligence 2.0: lo que REPI ve en este ejercicio (hasta 3 mensajes del servidor, el más importante
// primero) y el acceso a «Preguntale a REPI» con atajos del ejercicio. Cada mensaje explica en qué se basa («¿Por qué?»),
// se puede marcar «Entendido» (se recuerda en este navegador si se puede) y lleva a la tarjeta que corresponde.
// Si la persona apagó los mensajes proactivos, el servidor no manda ninguno y la lista no se muestra.
import { useState } from "react";
import type { WeightUnit } from "@repi/domain";
import { RepiAsk } from "@/components/brain/RepiAsk";
import { useBrain } from "@/components/brain/BrainProvider";
import { CARD_IDS, nextLine } from "./ProgressIntelCards";
import { dayTxt, goTo, n1, useDismissed, wFmt, type PI } from "./ProgressIntelShared";

type Ins = PI["insights"][number];
const TREND_CODES = new Set(["improving", "stable", "declining", "effort_up", "returning", "few_data", "goal_changed"]);

export function IntelAnalysis({ pi, unit, onOpenSession }: { pi: PI; unit: WeightUnit; onOpenSession: (id: string) => void }) {
  const brainOn = useBrain().enabled;
  const dis = useDismissed();
  const [why, setWhy] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  const ex = pi.exercise;
  const key = (i: Ins) => `${ex.id}:${i.code}`;
  const list = pi.insights.filter((i) => !dis.has(key(i))).slice(0, 3);
  if (!list.length && !brainOn) return null;
  const fmt = wFmt(unit);
  const hasNext = !!nextLine(pi, unit);
  const usedRows = pi.next?.used ?? [];
  const chips = [
    { label: "¿Cuál es mi máximo?", text: `¿Cuál es mi máximo en ${ex.name}?` },
    ...(pi.metric === "load" ? [{ label: "¿Cuánto podría tirar para 8?", text: `¿Cuánto podría tirar para 8 repeticiones en ${ex.name}?` }] : []),
    { label: "¿Qué intento la próxima vez?", text: `¿Qué intento la próxima vez en ${ex.name}?` },
    { label: "Preparar una consulta para mi entrenador", text: `Preparar una consulta para mi entrenador sobre ${ex.name}` },
  ];
  const actions = (i: Ins) => {
    const out: { label: string; on: () => void; expanded?: boolean }[] = [];
    if (i.code === "record") out.push({ label: "Consultar mi mejor marca", on: () => goTo(CARD_IDS.max) });
    if (i.code === "exercise_goal") out.push({ label: "Ver objetivo", on: () => goTo(CARD_IDS.goals) });
    if (TREND_CODES.has(i.code) && hasNext) out.push({ label: "Ver propuesta para la próxima sesión", on: () => goTo(CARD_IDS.next) });
    return out;
  };
  return (
    <section className="pp-card" aria-labelledby="pgi-an-h">
      <div className="pp-head"><h2 id="pgi-an-h">Lo que ve REPI</h2></div>
      {list.length > 0 && (
        <ul className="pgi-ins">
          {list.map((i) => {
            const k = key(i), open = why === k;
            return (
              <li key={k}>
                <span className="pgi-text">{i.text}</span>
                <div className="pgi-acts">
                  <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setWhy(open ? null : k)}>{open ? "Ocultar" : "¿Por qué?"}</button>
                  {actions(i).map((a) => <button key={a.label} type="button" className="linkbtn" onClick={a.on}>{a.label}</button>)}
                  <button type="button" className="linkbtn" onClick={() => dis.dismiss(k)} aria-label={`Entendido: ocultar «${i.text}»`}>Entendido</button>
                </div>
                {open && (
                  <div className="pgi-why">
                    <p>{i.basis}</p>
                    <p>REPI usó:</p>
                    <ul>{pi.personal.uses.filter((u) => u.key !== "missing").map((u) => <li key={u.key}>{u.text}</li>)}</ul>
                    {pi.personal.status !== "complete" && <p><b>No personalizada del todo: completá tu perfil.</b></p>}
                    {TREND_CODES.has(i.code) && usedRows.length > 0 && (
                      <>
                        <button type="button" className="linkbtn" aria-expanded={used} onClick={() => setUsed((x) => !x)}>{used ? "Ocultar sesiones" : "Ver sesiones utilizadas"}</button>
                        {used && (
                          <ul className="pp-rows" aria-label="Sesiones comparables utilizadas">
                            {usedRows.map((u, j) => (
                              <li key={`${u.day}-${j}`}>
                                <span>{dayTxt(u.day)}<br /><span className="mb-muted">{u.w ? `${fmt(u.w)} × ${u.r ?? "?"}` : `${u.r ?? "?"} reps`}{u.rir != null ? ` · RIR ${n1(u.rir)}` : ""}</span></span>
                                {u.sessionIds.length ? <span className="pgi-acts">{u.sessionIds.map((s, x) => <button key={s} type="button" className="linkbtn" onClick={() => onOpenSession(s)}>{u.sessionIds.length > 1 ? `Ver ${x + 1}` : "Ver"}</button>)}</span>
                                  : <span className="hx-chip">Importado</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <RepiAsk section="progress" refs={{ exerciseId: ex.id }} subject={ex.name} label="Preguntale a REPI sobre este ejercicio" chips={chips} />
    </section>
  );
}
