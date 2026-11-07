"use client";
// Asistente REPI (D209) · cierre de la sesión en la pantalla «Entrenamiento completado», después de las marcas. Lo arma el
// servidor con datos reales (previsto contra hecho, la sesión comparable anterior, marcas, omitidos, adaptaciones y una
// propuesta prudente para la próxima): acá sólo se muestra. Sin conexión, o si la sesión todavía no llegó, se dice que el
// análisis sale al sincronizar; nunca bloquea salir ni la celebración.
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useUnit } from "@/components/member/units";
import { localizeWeights } from "@repi/domain";
import { useBrain } from "./BrainProvider";
import { OriginTag } from "./parts";
import { ORIGIN_LABEL, presentEvidence, reviewNextLine } from "./presenter";
import type { ReviewExercise, ReviewView } from "./types";

const CMP: Record<ReviewExercise["comparison"], string> = { more: "Mejor que la anterior", same: "Igual que la anterior", fewer: "Por debajo de la anterior", first: "Primera vez", not_comparable: "Sin comparación" };

export function SessionReview({ sessionId, local }: { sessionId: string; local: boolean }) {
  const brain = useBrain();
  const unit = useUnit();
  const [r, setR] = useState<ReviewView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "none">("loading");
  const load = useCallback(() => {
    if (local || brain.offline) { setState("none"); return; }
    setState("loading");
    api<ReviewView>(`/api/me/brain/session/${sessionId}/review`).then((x) => { setR(x); setState("ready"); })
      .catch((e) => setState(e instanceof ApiError && (e.status === 404 || e.status === 409) ? "none" : "error"));
  }, [sessionId, local, brain.offline]);
  useEffect(() => { if (brain.enabled) load(); }, [brain.enabled, load]);
  if (!brain.enabled) return null;

  const head = <div className="rp-card-top"><span className="rp-badge">REPI</span><span className="rp-origin" data-kind="rules">{ORIGIN_LABEL.rules}</span></div>;
  if (local || brain.offline) return (
    <section className="rp-card is-quiet" aria-label="Análisis de REPI">{head}<p className="rp-card-body">REPI arma el análisis de la sesión cuando se sincronice. Tu entrenamiento ya quedó en el teléfono.</p></section>
  );
  if (state === "none") return null;
  if (state === "loading") return <section className="rp-card is-quiet" aria-label="Análisis de REPI">{head}<p className="mb-muted rp-card-body">REPI está armando el análisis…</p></section>;
  if (state === "error" || !r) return (
    <section className="rp-card is-quiet" aria-label="Análisis de REPI">{head}
      <p className="mb-muted rp-card-body">El análisis de REPI no está disponible ahora. <button type="button" className="linkbtn" onClick={load}>Reintentar</button></p></section>
  );

  const v = r.review;
  const loc = (t: string) => localizeWeights(t, unit);
  const next = reviewNextLine(v);
  return (
    <section className="rp-card rp-review" aria-labelledby="rp-rev-h">
      <div className="rp-card-top"><span className="rp-badge">REPI</span><OriginTag o={presentEvidence(v.evidence, unit).origin} /></div>
      <h2 id="rp-rev-h" className="rp-card-title">Tu cierre</h2>
      <p className="rp-card-body">{loc(v.text)}</p>
      {v.exercises.length > 0 && (
        <ul className="rp-rev" aria-label="Ejercicio por ejercicio">
          {v.exercises.map((e) => (
            <li key={e.exerciseId}>
              <span><b>{e.name}</b><small>{e.status === "skipped" ? "Omitido hoy" : `${e.doneMain} de ${e.plannedMain} ${e.plannedMain === 1 ? "serie" : "series"}`}</small></span>
              {e.status !== "skipped" && <span className="rp-cmp" data-cmp={e.comparison}>{CMP[e.comparison]}{e.delta ? <small>{loc(e.delta)}</small> : null}</span>}
            </li>
          ))}
        </ul>
      )}
      {v.marks.length > 0 && <ul className="rp-marks" aria-label="Marcas de hoy">{v.marks.map((m, i) => <li key={i}>{loc(m.text)}</li>)}</ul>}
      {v.adaptations.length > 0 && <p className="rp-small"><small>Adaptaciones</small>{v.adaptations.join(" · ")}</p>}
      {/* El texto del cierre ya puede incluir la propuesta y la pregunta: no se repiten («Lo decide tu profe» ya viene del dominio). */}
      {next && <p className="rp-next"><small>Para la próxima</small>{loc(next)}</p>}
      {v.ask && !v.text.includes(v.ask) && <p className="rp-card-body">{loc(v.ask)}</p>}
      <div className="rp-card-acts">
        <button type="button" className="ghost sm" onClick={() => brain.showWhy({ claim: "Cómo armé tu cierre", evidence: presentEvidence(v.evidence, unit), chat: { section: "review", ref: { sessionId } } })}>Ver por qué</button>
        <button type="button" className="ghost sm" onClick={() => brain.open({ section: "review", ref: { sessionId }, subject: r.dayName })}>Hablar con REPI</button>
      </div>
    </section>
  );
}
