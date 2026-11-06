"use client";
// PP1 (D199) · Gasto estimado de una sesión: rango aproximado (nunca un número exacto), con su explicación y sin juicios ni
// consejos de alimentación. Sin peso registrado no se usa ninguno oculto: se ofrece registrarlo.
import { useEffect, useState } from "react";
import { CALORIE_NOTE, CALORIE_REASON, type CalorieEstimate } from "@repi/domain";
import { api } from "@/lib/api";
import { featureOn } from "@/lib/features";

type Res = { estimate: CalorieEstimate; weight: { day: string } | null; rpe: number | null };
const KIND: Record<string, string> = { strength: "musculación", cardio: "cardio", mixed: "musculación y cardio" };

export function SessionCalories({ sessionId, onRegisterWeight, refresh = 0 }: { sessionId: string; onRegisterWeight?: () => void; refresh?: number }) {
  const [r, setR] = useState<Res | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!featureOn("calories")) return;
    let off = false;
    api<Res>(`/api/me/progress/calories/${encodeURIComponent(sessionId)}`).then((x) => { if (!off) setR(x); }).catch(() => { if (!off) setR(null); });
    return () => { off = true; };
  }, [sessionId, refresh]);
  if (!featureOn("calories") || !r) return null;
  const e = r.estimate;
  if (!e.ok) {
    if (e.reason === "voided" || e.reason === "too_long" || e.reason === "too_short") return null;
    return (
      <div className="pp-kcal" role="note">
        <span>{CALORIE_REASON[e.reason]}</span>
        {(e.reason === "no_weight" || e.reason === "age_unknown") && onRegisterWeight && <button type="button" className="linkbtn" style={{ alignSelf: "flex-start", height: 32, padding: 0 }} onClick={onRegisterWeight}>{e.reason === "age_unknown" ? "Confirmar en Mi cuerpo" : "Registrar mi peso"}</button>}
      </div>
    );
  }
  return (
    <div className="pp-kcal" aria-label={`Gasto estimado: aproximadamente ${e.low} a ${e.high} kilocalorías`}>
      <span className="mb-muted" style={{ fontSize: 12 }}>Estimación</span>
      <strong>Gasto estimado: aproximadamente {e.low.toLocaleString("es-AR")}–{e.high.toLocaleString("es-AR")} kcal</strong>
      <small className="mb-muted">{CALORIE_NOTE}</small>
      <button type="button" className="linkbtn" aria-expanded={more} style={{ alignSelf: "flex-start", height: 28, padding: 0 }} onClick={() => setMore((x) => !x)}>{more ? "Ocultar cómo se calcula" : "Cómo se calcula"}</button>
      {more && (
        <small className="mb-muted" style={{ lineHeight: 1.45 }}>
          {e.minutes} min activos de {KIND[e.kind]} (incluye los descansos) × tu peso del {r.weight ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${r.weight.day}T12:00:00Z`)) : "día"} × valores MET de referencia
          {e.mets.strength ? ` (musculación ${e.mets.strength[0]}–${e.mets.strength[1]})` : ""}{e.mets.cardio ? ` (cardio ${e.mets.cardio[0]}–${e.mets.cardio[1]})` : ""}
          {r.rpe ? `, ajustados por tu esfuerzo ${r.rpe}/10` : ", sin esfuerzo registrado (rango más amplio)"}. Fuente: Compendium of Physical Activities. Es el gasto total de ese tiempo, no una medición: no sirve para calcular comidas.
        </small>
      )}
    </div>
  );
}
