"use client";
// D191 · Training Intelligence: ANTERIOR → REPI → REAL para la serie o etapa en curso. Tres datos distintos que nunca se
// mezclan: lo que hizo la vez comparable anterior, el objetivo (de REPI o indicado por el profe) y lo que registró hoy. La
// tarjeta no registra nada: «Usar» sólo carga el borrador, que la persona puede cambiar antes de completar la serie.
import type { RowTarget, WeightUnit } from "@repi/domain";
import { kg } from "./types";

type T = RowTarget & { id?: string };
const SHOW_RANGE = new Set(["increase_load", "reduce_load", "estimate", "follow_coach", "reduce_effort"]);

/** Texto del objetivo en la unidad de la persona: «62,5 kg × 8–10». Vacío si no hay un número que mostrar. */
export function targetLine(t: T, unit: WeightUnit) {
  const a = SHOW_RANGE.has(t.action) ? t.repsMin ?? t.repsTarget : t.repsTarget ?? t.repsMin;
  const b = SHOW_RANGE.has(t.action) ? t.repsMax : null;
  const reps = a == null ? null : b != null && b !== a ? `${a}–${b}` : `${a}`;
  return [t.weightKg != null && t.weightKg > 0 ? kg(t.weightKg, unit) : null, reps].filter(Boolean).join(" × ");
}

export function TargetCard({ t, unit, real, label, onUse, canUse }: {
  t: T; unit: WeightUnit; label: string;
  /** Lo registrado en esta fila hoy (null: todavía no). */
  real: { w: number; r: number; rir: number | null } | null;
  onUse: (w: number | null, r: number | null) => void; canUse: boolean;
}) {
  const line = targetLine(t, unit);
  const prev = t.prev ? `${t.prev.w != null && t.prev.w > 0 ? `${kg(t.prev.w, unit)} × ` : ""}${t.prev.r ?? "—"}${t.prev.rir != null ? ` · RIR ${t.prev.rir}` : ""}` : null;
  const head = t.source === "coach" ? "Tu profe indicó" : t.status === "not_applicable" ? "REPI" : "REPI recomienda";
  const reps = t.repsTarget ?? t.repsMin;
  return (
    <section className={`ti-card${t.status === "limited" ? " is-limited" : ""}`} aria-label={`Objetivo de ${label}`}>
      <div className="ti-cols">
        <div><small>Anterior</small><b>{prev ?? "Sin referencia"}</b></div>
        <div className="ti-main"><small>{head}</small><b>{line || (t.pending ? "Elegí la carga" : "—")}</b>{t.rirTarget != null && t.status !== "not_applicable" && <small className="ti-rir">RIR {t.rirTarget}</small>}</div>
        <div><small>Real</small><b>{real ? `${real.w > 0 ? `${kg(real.w, unit)} × ` : ""}${real.r}${real.rir != null ? ` · RIR ${real.rir}` : ""}` : "Por registrar"}</b></div>
      </div>
      {t.why && <p className="ti-why">{t.why}</p>}
      {t.review && <p className="ti-review" role="note">{t.review}</p>}
      {t.prev?.source === "import" && <p className="ti-quality">Referencia de tu historial importado: puede no ser la misma serie.</p>}
      {canUse && !real && (t.weightKg != null || reps != null) && t.status !== "not_applicable" && t.action !== "none" && line && (
        <button type="button" className="ghost sm" onClick={() => onUse(t.weightKg, reps)}>Usar {line}</button>
      )}
    </section>
  );
}
