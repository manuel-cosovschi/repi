"use client";
// D195 · Guía de la serie en curso (bloque 05/06): ANTERIOR / PROFE / REPI / REAL en una lista legible en un teléfono de 320 px,
// en lugar de columnas chicas. Se adapta a lo que hay: sin historial dice «Sin referencia» sin esconder lo indicado; si REPI
// no propone otra carga no repite el mismo número dos veces; una revisión o una advertencia de seguridad se muestran aparte.
// Nunca registra nada: «Usar» sólo carga el borrador, y lo sugerido nunca se confunde con lo hecho. Consume los contratos de
// Training Intelligence 2.0 (RowTarget) sin cambiarlos.
import { useState } from "react";
import { localizeWeights, type RowTarget, type WeightUnit } from "@repi/domain";
import { kg } from "./types";
import { targetLine } from "./TargetCard";
import { Hint } from "./Hint";

type T = RowTarget & { id?: string };
type Plan = { weightKg: number | null; reps: string; timed: boolean };
type Suggest = { weightKg: number | null; reps: number; why: string } | null;

export function SetGuide({ t, plan, prevFallback, suggest, real, draft, unit, label, canUse, onUse }: {
  t: T | null; plan: Plan; prevFallback: { weightKg: number | null; reps: number | null } | null; suggest: Suggest;
  real: { w: number; r: number; rir: number | null } | null; draft: { w: number; r: number } | null;
  unit: WeightUnit; label: string; canUse: boolean; onUse: (w: number | null, r: number | null) => void;
}) {
  const [why, setWhy] = useState(false);
  const unitR = plan.timed ? " s" : "";
  const coachLine = plan.weightKg != null && plan.weightKg > 0 ? `${kg(plan.weightKg, unit)} × ${plan.reps}` : `${plan.reps}${plan.timed ? "" : " reps"}`;
  // REPI: el objetivo calculado por reglas. Con la carga del profe, sólo si propone otra cosa (o una revisión).
  const rules = t && t.source === "rules" && t.status !== "not_applicable" ? t : null;
  const line = rules ? targetLine(rules, unit) : "";
  const sameAsCoach = !!rules && plan.weightKg != null && rules.weightKg != null && Math.abs(rules.weightKg - plan.weightKg) < 0.01;
  const safety = !!t && (t.status === "limited" || t.guards.length > 0);
  const prev = t?.prev
    ? `${t.prev.w != null && t.prev.w > 0 ? `${kg(t.prev.w, unit)} × ` : ""}${t.prev.r ?? "—"}${unitR}${t.prev.rir != null ? ` · RIR ${t.prev.rir}` : ""}`
    : prevFallback ? `${prevFallback.weightKg != null && prevFallback.weightKg > 0 ? `${kg(prevFallback.weightKg, unit)} × ` : ""}${prevFallback.reps ?? "—"}${unitR}` : null;
  const useW = rules?.weightKg ?? (suggest?.weightKg ?? null);
  const useR = rules ? rules.repsTarget ?? rules.repsMin : suggest?.reps ?? null;
  const useTxt = rules ? line : suggest ? `${suggest.weightKg != null ? `${kg(suggest.weightKg, unit)} × ` : ""}${suggest.reps}` : "";
  const differs = !!draft && ((useW != null && Math.abs(useW - draft.w) > 0.005) || (useR != null && !plan.timed && useR !== draft.r));
  const showUse = canUse && !real && !!useTxt && differs && !(rules?.pending) && rules?.action !== "none";
  const explain = (rules?.why || suggest?.why) ? localizeWeights(rules?.why || suggest!.why, unit) : null;
  return (
    <section className="sg ti-card" aria-label={`Objetivo de ${label}`}>
      <dl className="sg-rows">
        <div className="sg-row is-coach"><dt>Tu profe indicó</dt><dd><b>{coachLine}</b>{plan.weightKg == null && !plan.timed && <small>sin carga indicada</small>}</dd></div>
        {rules && !sameAsCoach && (
          <div className={`sg-row is-repi${safety ? " is-safety" : ""}`}><dt>REPI recomienda</dt>
            <dd><b>{line || (rules.pending ? "Elegí la carga" : rules.status === "no_data" ? "Sin datos suficientes" : "—")}</b>{rules.rirTarget != null && <small>RIR {rules.rirTarget}</small>}</dd></div>
        )}
        {rules && sameAsCoach && <div className="sg-row is-repi"><dt>REPI recomienda</dt><dd><span>Mantener lo indicado</span></dd></div>}
        {!rules && suggest && plan.weightKg == null && (
          <div className="sg-row is-repi"><dt>REPI sugiere hoy</dt><dd><b>{useTxt}</b></dd></div>
        )}
        <div className="sg-row"><dt>Anterior</dt><dd>{prev ? <span>{prev}{t?.prev?.source === "import" && <small> · importado</small>}</span> : <span className="sg-none">Sin referencia</span>}</dd></div>
        <div className="sg-row is-real"><dt>Real (hoy)</dt><dd>{real ? <b>{real.w > 0 ? `${kg(real.w, unit)} × ` : ""}{real.r}{unitR}{real.rir != null ? ` · RIR ${real.rir}` : ""}</b> : <span className="sg-none">Por registrar</span>}</dd></div>
      </dl>
      {t?.source === "coach" && t.why && <p className="sg-note">{localizeWeights(t.why, unit)}</p>}
      {t?.review && <p className="sg-note is-review" role="note">{localizeWeights(t.review, unit)}</p>}
      {safety && explain && <p className="sg-note is-safety" role="note">{explain}</p>}
      {rules?.reasons.includes("increment_unknown") && rules.weightKg != null && <p className="sg-note">Carga de referencia: ajustala a los discos o mancuernas que tengas.</p>}
      {rules?.reasons.includes("equipment_fit") && <p className="sg-note">Ajustado a las cargas que hay en tu sede.</p>}
      {(showUse || (explain && !safety)) && (
        <div className="sg-acts">
          {showUse && <button type="button" className="ghost sm" onClick={() => onUse(useW, plan.timed ? null : useR)}>Usar {useTxt}</button>}
          {explain && !safety && <button type="button" className="linkbtn" aria-expanded={why} onClick={() => setWhy((x) => !x)}>{why ? "Ocultar explicación" : "¿Por qué?"}</button>}
        </div>
      )}
      {why && explain && !safety && <p className="sg-note" role="note">{explain}</p>}
      {(rules || suggest) && <Hint id="ti_intro" text="«REPI recomienda» es una sugerencia calculada con tus series anteriores. No reemplaza lo que indicó tu profe: eso se ve siempre primero, y lo que registrás es lo que hiciste de verdad." />}
    </section>
  );
}
