"use client";
// D154: al actualizar la rutina de un cliente o socio, REPI sugiere la carga de cada ejercicio según lo que hizo la última vez
// (misma regla que ve el alumno al entrenar). El profe la aplica con un toque —queda en el plan serie por serie— o la ignora.
import { useEffect, useMemo, useState } from "react";
import { applyLoad, canApplyLoad, fmtWeight, lastSummary, suggestNext, type ExerciseDetail, type LastSet } from "@repi/domain";
import { api } from "@/lib/api";

export type LastTimes = Record<string, { at: string; sets: LastSet[] }>;

/** Última vez de cada ejercicio de la rutina. `url` sin `ids`: se agregan los ejercicios actuales (se recarga si cambian). */
export function useLastTimes(url: string | null, exerciseIds: string[]) {
  const key = [...new Set(exerciseIds)].sort().join(",");
  const [data, setData] = useState<LastTimes>({});
  useEffect(() => {
    if (!url || !key) return;
    let live = true;
    api<LastTimes>(`${url}${url.includes("?") ? "&" : "?"}ids=${key}`).then((d) => { if (live) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, [url, key]);
  return data;
}

const day = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(iso));

export function LoadSuggestion({ e, last, onApply }: {
  e: { sets: number; reps: string; detail?: ExerciseDetail | null }; last?: { at: string; sets: LastSet[] }; onApply: (detail: ExerciseDetail) => void;
}) {
  const sg = useMemo(() => (last ? suggestNext({ reps: e.reps, sets: e.sets, last: last.sets }) : null), [e.reps, e.sets, last]);
  if (!last || !last.sets.length) return null;
  const planned = e.detail?.setPlan?.[0]?.weightKg ?? null;
  const applied = sg?.weightKg != null && e.detail?.setPlan?.every((s) => s.weightKg === sg.weightKg);
  return (
    <span className="ex-sug" role="note">
      <span>La última vez ({day(last.at)}): {lastSummary(last.sets)}</span>
      {sg && <span><b>REPI sugiere: {sg.weightKg != null ? `${fmtWeight(sg.weightKg, "kg")} × ` : ""}{sg.reps}</b>{planned != null && !applied ? ` (ahora ${fmtWeight(planned, "kg")})` : ""}</span>}
      {sg?.weightKg != null && canApplyLoad(e.detail) && (applied
        ? <small>Aplicada</small>
        : <button type="button" className="btn sm" onClick={() => onApply(applyLoad(e.detail, e.sets, e.reps, sg.weightKg!))}>Aplicar {fmtWeight(sg.weightKg, "kg")}</button>)}
    </span>
  );
}
