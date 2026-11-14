"use client";
// Editar un registro: cantidad, unidad y comida (por la cola: funciona sin conexión y el servidor controla la revisión; si
// cambió en otro dispositivo, se avisa y se muestra la versión vigente), borrar con confirmación y, sólo si la persona lo
// pide, corregirlo con la versión vigente de la fuente (el historial nunca cambia en silencio).
import { useState } from "react";
import type { Meal, Quantity } from "@repi/domain";
import { api, ApiError } from "@/lib/api";
import { enqueueNutri } from "@/lib/offline/nutrition";
import { Sheet } from "../Sheet";
import { BASE, errText, mealName, num, parseAmount, qtyText, tryNutrients, type Entry } from "./lib";
import { FoodInfo, MealChips, QtyPicker } from "./QtyPicker";

export function EntrySheet({ entry, online, onClose, onChanged, flash, sync }: {
  entry: Entry; online: boolean; onClose: () => void; onChanged: () => Promise<void>; flash: (t: string) => void; sync: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(num(entry.quantity.amount, 2));
  const [unit, setUnit] = useState<Quantity["unit"]>(entry.quantity.unit);
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const a = parseAmount(amount);
  const calc = a ? tryNutrients(entry.food, { amount: a, unit }) : null;
  const qChanged = a !== entry.quantity.amount || unit !== entry.quantity.unit;
  const changed = qChanged || meal !== entry.meal;
  const canRefresh = !entry.pending && entry.food.kind !== "barcode" && online;

  const save = async () => {
    if (busy || !changed) return;
    if (!a || !calc?.ok) { setErr(calc && !calc.ok ? calc.message : "Indicá una cantidad mayor que cero."); return; }
    setBusy(true);
    await enqueueNutri({ op: "update", id: entry.id, revision: entry.revision || 1, ...(qChanged ? { quantity: { amount: a, unit } } : {}), ...(meal !== entry.meal ? { meal } : {}), at: new Date().toISOString() });
    flash(online ? "Cambios guardados." : "Cambios guardados en el teléfono: se sincronizan al volver la conexión.");
    await onChanged();
  };
  const del = async () => {
    if (busy) return;
    setBusy(true);
    await enqueueNutri({ op: "delete", id: entry.id, at: new Date().toISOString() });
    flash("Registro eliminado.");
    await onChanged();
  };
  const refresh = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ changed: boolean }>(`${BASE}/entries/${entry.id}/refresh`, { body: { revision: entry.revision } });
      flash(r.changed ? "Actualizamos el registro con la versión vigente de la fuente." : "La fuente no cambió: el registro queda igual.");
      await onChanged();
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.code === "stale") { setErr("Este registro cambió en otro dispositivo. Cerrá y volvé a abrirlo para ver la versión vigente."); await sync(); return; }
      setErr(errText(e));
    }
  };

  return (
    <Sheet title={entry.food.name} sub={`${mealName(entry.meal)} · ${qtyText(entry.food, entry.quantity, entry.grams)}${entry.pending ? " · pendiente de sincronizar" : ""}`} onClose={onClose} closeLabel="Cancelar">
      <QtyPicker food={entry.food} amount={amount} unit={unit} onAmount={setAmount} onUnit={setUnit} />
      <MealChips value={meal} onPick={setMeal} />
      {err && <p className="mb-err" role="alert">{err}</p>}
      <button type="button" className="cta" disabled={busy || !changed} aria-busy={busy || undefined} onClick={() => void save()}>Guardar cambios</button>
      <FoodInfo food={entry.food} full />
      {canRefresh && (
        <div className="nu-col">
          <button type="button" className="ghost" disabled={busy} onClick={() => void refresh()}>Corregir con la versión vigente de la fuente</button>
          <small className="mb-muted nu-small">Cada registro guarda los valores del momento en que lo cargaste. Esto los reemplaza por los actuales de la fuente.</small>
        </div>
      )}
      {!ask ? <button type="button" className="ghost hx-danger" disabled={busy} onClick={() => setAsk(true)}>Eliminar registro</button> : (
        <div className="conflict" role="alert"><strong>¿Eliminar este registro?</strong><span>{entry.food.name} · {qtyText(entry.food, entry.quantity, entry.grams)}</span>
          <div><button type="button" className="cta sm" disabled={busy} onClick={() => void del()}>Eliminar</button><button type="button" className="ghost sm" onClick={() => setAsk(false)}>No</button></div></div>
      )}
    </Sheet>
  );
}
