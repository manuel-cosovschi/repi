"use client";
// D192 · Distribuir cargas (programación del profe, no una recomendación de Training Intelligence). El profe elige desde qué
// peso, cómo sube o baja y a qué series; ve la secuencia y lo que reemplaza antes de usarla. Nada se aplica solo.
import { useState } from "react";
import { DIST_MODES, kgTo, loadSeries, toKg, type DistMode, type PlanRow, type WeightUnit } from "@repi/domain";

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const fmt = (n: number, unit: WeightUnit) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${unit}`;

/**
 * `blocks`: series del ejercicio; `initialSel`: las que se proponen (sin aproximaciones). `incrementKg`: salto del equipo, si se
 * configuró (sólo redondea en kg). Devuelve por `onUse` los bloques elegidos y sus cargas en kg.
 */
export function LoadDistributor({ blocks, initialSel, unit, incrementKg, onUse, onCancel }: {
  blocks: PlanRow[][]; initialSel: number[]; unit: WeightUnit; incrementKg: number | null;
  onUse: (sel: number[], kg: number[]) => void; onCancel: () => void;
}) {
  const first = blocks[initialSel[0] ?? 0]?.[0]?.weightKg;
  const [mode, setMode] = useState<DistMode>("step_up");
  const [start, setStart] = useState(first != null ? String(kgTo(first, unit)).replace(".", ",") : "");
  const [step, setStep] = useState(unit === "kg" ? "5" : "10");
  const [pct, setPct] = useState("5");
  const [sel, setSel] = useState<number[]>(initialSel.length ? initialSel : blocks.map((_, i) => i));
  const pctMode = mode === "pct_up" || mode === "pct_down";
  const values = loadSeries({ mode, start: num(start), step: num(step), pct: num(pct), count: sel.length, round: unit === "kg" ? incrementKg : null });
  const replaced = values ? sel.filter((bi, k) => blocks[bi]?.[0].weightKg != null && Math.abs(kgTo(blocks[bi][0].weightKg!, unit) - values[k]) > 0.001).length : 0;
  const use = () => {
    if (!values) return;
    if (replaced && !window.confirm(`Esto reemplaza ${replaced === 1 ? "1 peso ya cargado" : `${replaced} pesos ya cargados`}. ¿Seguir? (Podés deshacerlo.)`)) return;
    onUse(sel, values.map((v) => toKg(v, unit)));
  };
  return (
    <div className="dx-dist" role="group" aria-label="Distribuir cargas">
      <div className="dx-set-h"><b>Distribuir cargas</b><small className="muted">Programación tuya: no es una recomendación de REPI.</small></div>
      <div className="dx-grid">
        <label className="field">Cómo<select className="dx-sel" value={mode} onChange={(e) => setMode(e.target.value as DistMode)}>
          {(Object.keys(DIST_MODES) as DistMode[]).map((m) => <option key={m} value={m}>{DIST_MODES[m]}</option>)}</select></label>
        <label className="field">Desde ({unit})<input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} placeholder="Ej.: 40" onFocus={(e) => e.currentTarget.select()} /></label>
        {mode !== "repeat" && !pctMode && <label className="field">Cada serie ({unit})<input inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} onFocus={(e) => e.currentTarget.select()} /></label>}
        {pctMode && <label className="field">Cada serie (%)<input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} onFocus={(e) => e.currentTarget.select()} /></label>}
      </div>
      <div className="dx-apply-row"><span className="dx-lbl">Series</span>
        <div className="pills">
          {blocks.map((b, i) => (
            <button key={b[0].id} type="button" className="pill" aria-pressed={sel.includes(i)} onClick={() => setSel(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort((a, c) => a - c))}>Serie {i + 1}</button>
          ))}
        </div></div>
      <div className="dx-preview" role="status">
        <span className="dx-lbl">Vista previa</span>
        {values ? <span>{sel.map((bi, k) => `S${bi + 1}: ${fmt(values[k], unit)}`).join(" → ")}</span> : <span className="muted">Indicá el peso inicial{mode === "repeat" ? "" : pctMode ? " y el porcentaje (entre 0 y 100)" : " y cuánto cambia por serie"}.</span>}
        {values && replaced > 0 && <small className="dx-warn">Reemplaza {replaced === 1 ? "1 peso ya cargado" : `${replaced} pesos ya cargados`}.</small>}
        {values && pctMode && unit === "kg" && incrementKg && <small className="muted">Redondeado al salto del equipo ({incrementKg.toLocaleString("es-AR")} kg).</small>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn sm pri" disabled={!values || !sel.length} onClick={use}>Usar estas cargas</button>
        <button type="button" className="btn sm" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
