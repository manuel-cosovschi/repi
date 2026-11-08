"use client";
// D195 · «Ver cómo lo verá el alumno» (bloque 05/06). Vista previa de sólo lectura del programa vigente del cliente, con el
// mismo orden, etiquetas (A1, A2), métodos, series con su carga y repeticiones, descansos y notas que ve el alumno al abrir
// el día. No es suplantación: no usa la sesión del alumno, no inicia entrenamientos, no registra nada ni muestra datos
// personales (anterior, sugerencias de REPI): se arma sólo con el documento del programa que el profe ya ve.
// Ejercicios por tiempo: una actividad (cinta, bici, remo…) se ve como la ve el alumno: «10 min · 5 km/h · incl. 3», sin series.
import { useState } from "react";
import { METRICS_PROFILE_LABEL, TECHNIQUES, activityOf, formatRest, groupLabels, mainSets, planBlocks, prescriptionText, setTarget, type ProgramDoc, type ProgramExerciseDoc } from "@repi/domain";
import { Modal } from "@/components/ui/Modal";

const kgTxt = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} kg`;

function methodLine(e: ProgramExerciseDoc, label: string | null, all: ProgramExerciseDoc[], idx: number) {
  const d = e.detail;
  if (!d) return null;
  const mates = d.group ? all.filter((x, i) => i !== idx && x.detail?.group === d.group).map((x) => x.name) : [];
  return [
    d.technique !== "straight" ? TECHNIQUES[d.technique].label : null,
    label && mates.length ? `${d.groupKind === "circuit" ? `Circuito${d.rounds ? ` × ${d.rounds} vueltas` : ""}` : "Combinado"} con ${mates.join(", ")}` : null,
    d.tempo ? `Tempo ${d.tempo}` : null, d.variant, d.unilateral ? "Por lado" : null, d.progression,
  ].filter(Boolean).join(" · ") || null;
}

export function StudentPreview({ doc, version, who, onClose }: { doc: ProgramDoc; version: number; who: string; onClose: () => void }) {
  const [day, setDay] = useState(0);
  const d = doc.days[day];
  const labels = d ? groupLabels(d.exercises) : [];
  return (
    <Modal label={`Vista previa del programa de ${who}`} onClose={onClose} wide>
      <div className="sp-head">
        <div><h2>Así lo ve {who}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Vista previa de sólo lectura: no inicia entrenamientos ni registra nada. «Anterior» y lo que sugiere REPI dependen del historial de {who} y no se muestran acá.</p></div>
        <button type="button" className="btn" onClick={onClose}>Cerrar</button>
      </div>
      <div className="sp-phone">
        <span className="sp-kick">{doc.name} · versión {version}</span>
        {doc.note && <p className="sp-note"><small>Indicación del programa</small>{doc.note}</p>}
        <div className="sp-days" role="group" aria-label="Días">
          {doc.days.map((x, i) => <button type="button" key={`${x.name}:${i}`} aria-pressed={i === day} onClick={() => setDay(i)}>{x.name}</button>)}
        </div>
        {!d ? <p className="muted">Este programa no tiene días.</p> : (
          <>
            <span className="sp-sum">{d.exercises.length} {d.exercises.length === 1 ? "ejercicio" : "ejercicios"} · {d.exercises.reduce((a, e) => a + mainSets(e.detail, e.sets), 0)} series</span>
            <ol className="sp-list">
              {d.exercises.map((e, i) => {
                const blocks = planBlocks(e.detail, e.sets);
                const m = methodLine(e, labels[i], d.exercises, i);
                const act = activityOf(e.detail);
                return (
                  <li key={`${e.exerciseId}:${i}`} className="sp-ex">
                    <div className="sp-ex-head">
                      {labels[i] && <span className="sp-tag">{labels[i]}</span>}
                      <b>{e.name}</b>
                      {!(act && !e.restSec) && <span className="muted">Descanso {formatRest(e.restSec)}</span>}
                    </div>
                    {m && <small className="sp-method">{m}</small>}
                    <ul className="sp-sets" aria-label={act ? `Indicación de ${e.name}` : `Series de ${e.name}`}>
                      {act ? <li><span>{METRICS_PROFILE_LABEL[act.profile]}</span><span>{prescriptionText(e)}</span></li> : blocks.flatMap((b) => b.rows.map((ri) => {
                        const t = setTarget(e, ri);
                        const name = t.stage > 0 ? `↳ ${t.label ?? "Etapa"}` : `Serie ${b.index + 1}${t.label ? ` · ${t.label}` : ""}`;
                        const val = [t.weightKg != null ? kgTxt(t.weightKg) : t.pct1rm != null ? `${t.pct1rm} % 1RM` : null, t.reps, t.rpe != null ? `RPE ${t.rpe}` : t.rir != null ? `RIR ${t.rir}` : null].filter(Boolean).join(" · ");
                        return <li key={ri} className={t.stage > 0 ? "stage" : undefined}><span>{name}</span><span>{val || "—"}</span>{t.note && <small>{t.note}</small>}</li>;
                      }))}
                    </ul>
                    {e.note && <p className="sp-exnote">Nota: {e.note}</p>}
                  </li>
                );
              })}
              {!d.exercises.length && <li className="muted">Este día no tiene ejercicios todavía.</li>}
            </ol>
          </>
        )}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Las cargas se muestran en kg; {who} las ve en la unidad que eligió. Si cambiás el programa, la vista previa se actualiza al guardarlo.</p>
    </Modal>
  );
}
