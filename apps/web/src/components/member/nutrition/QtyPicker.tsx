"use client";
// Cantidad + unidad con vista previa de nutrientes calculada en el teléfono con el mismo motor del servidor (nutrientsFor).
// Sólo se ofrecen unidades válidas para el alimento (nunca ml para un alimento en gramos: no suponemos densidades).
import { useId } from "react";
import { fmtNutrient, MEALS, type FoodSnapshot, type Meal, type Quantity } from "@repi/domain";
import { MAIN, mealName, num, parseAmount, SHORT, sourceLine, stateLabel, tryNutrients, unitOptions } from "./lib";

export function QtyPicker({ food, amount, unit, onAmount, onUnit }: {
  food: FoodSnapshot; amount: string; unit: Quantity["unit"]; onAmount: (v: string) => void; onUnit: (u: Quantity["unit"]) => void;
}) {
  const id = useId();
  const opts = unitOptions(food);
  const a = parseAmount(amount);
  const r = a ? tryNutrients(food, { amount: a, unit }) : null;
  return (
    <div className="pp-form nu-qty">
      <label htmlFor={`${id}-a`}>Cantidad</label>
      <div className="nu-qty-row">
        <input id={`${id}-a`} inputMode="decimal" value={amount} aria-describedby={`${id}-p`} onChange={(e) => onAmount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7))} />
        <div className="nu-units" role="radiogroup" aria-label="Unidad">
          {opts.map((o) => <button key={o.unit} type="button" role="radio" aria-checked={o.unit === unit} onClick={() => onUnit(o.unit)}>{o.label}</button>)}
        </div>
      </div>
      <div id={`${id}-p`} className="nu-preview" aria-live="polite">
        {!a ? <span className="mb-muted">Indicá una cantidad mayor que cero.</span>
          : !r?.ok ? <span className="mb-err">{r?.message}</span>
          : <dl>{MAIN.map((k) => <div key={k}><dt>{SHORT[k]}</dt><dd>{fmtNutrient(k, r.n[k])}</dd></div>)}</dl>}
      </div>
    </div>
  );
}

/** Nombre, estado (crudo/cocido), fuente, coincidencia aproximada y nota. */
export function FoodInfo({ food, full, noNote }: { food: FoodSnapshot; full?: boolean; noNote?: boolean }) {
  const st = stateLabel(food);
  return (
    <div className="nu-foodinfo">
      <div className="nu-badges">
        {st && <span className="nu-chip mute">{st}</span>}
        <span className="nu-chip info">{food.source.label}</span>
        {food.source.match === "approx" && <span className="nu-chip warn">aproximado</span>}
      </div>
      {food.source.match === "approx" && <p className="nu-small">Coincidencia aproximada: es el equivalente más cercano de la fuente para este alimento.</p>}
      {food.note && !noNote && <p className="nu-small">{food.note}</p>}
      {full && <p className="nu-small mb-muted">{sourceLine(food)}{food.source.url && <> <a className="nu-link" href={food.source.url} target="_blank" rel="noopener noreferrer">Ver en la fuente</a></>}</p>}
      {full && food.source.attribution && <p className="nu-small mb-muted">{food.source.attribution}</p>}
    </div>
  );
}

export function MealChips({ value, onPick, label = "Comida" }: { value: Meal; onPick: (m: Meal) => void; label?: string }) {
  return (
    <fieldset className="sheet-group nu-meals"><legend>{label}</legend>
      <div>{MEALS.map((m) => <button key={m} type="button" aria-pressed={value === m} onClick={() => onPick(m)}>{mealName(m)}</button>)}</div>
    </fieldset>
  );
}

/** «245 kcal · 12 g proteína por 100 g». */
export const per = (f: FoodSnapshot) => `${fmtNutrient("energyKcal", f.values.energyKcal)} · ${fmtNutrient("proteinG", f.values.proteinG)} proteína por ${f.basis.unit === "g" || f.basis.unit === "ml" ? `${num(f.basis.amount)} ${f.basis.unit}` : f.basis.unit === "unidad" ? "unidad" : "porción"}`;
