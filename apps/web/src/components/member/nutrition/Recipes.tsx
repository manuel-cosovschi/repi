"use client";
// Recetas propias (D221): el total sale de los ingredientes; el peso cocido NO es la suma de los crudos. Con peso final se
// registra en gramos de la preparación; sin peso final, por porciones (o la receta entera como una porción).
import { useCallback, useEffect, useState } from "react";
import { fmtNutrient, sumNutrients, type FoodSnapshot, type Quantity } from "@repi/domain";
import { api } from "@/lib/api";
import { BASE, defaultQty, errText, fmtTotal, MAIN, num, parseAmount, SHORT, tryNutrients, unitOptions, type Recipe } from "./lib";
import { per } from "./QtyPicker";

type Ing = { key: string; food: FoodSnapshot; amount: string; unit: Quantity["unit"] };
let seq = 0;
const ingKey = () => `i${++seq}`;

export function Recipes({ online, onUse }: { online: boolean; onUse: (f: FoodSnapshot) => void }) {
  const [list, setList] = useState<Recipe[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Recipe | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ recipes: Recipe[] }>(`${BASE}/recipes`).then((r) => { setList(r.recipes); setErr(null); }).catch((e) => setErr(errText(e))), []);
  useEffect(() => { if (online) void load(); }, [load, online]);
  const del = async (r: Recipe) => {
    if (busy) return;
    setBusy(true);
    try { await api(`${BASE}/recipes/${r.id}`, { method: "DELETE" }); await load(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  if (edit) return <RecipeEditor recipe={edit === "new" ? null : edit} onCancel={() => setEdit(null)} onSaved={async () => { setEdit(null); await load(); }} />;
  return (
    <div className="nu-col">
      {err && <p className="mb-err" role="alert">{err}</p>}
      <button type="button" className="ghost" onClick={() => setEdit("new")}>Nueva receta</button>
      {!list ? <p className="mb-muted nu-small">Cargando…</p> : !list.length ? <p className="mb-muted nu-small">Todavía no tenés recetas. Cargá los ingredientes una vez y después registrás una porción en un toque.</p> : (
        <ul className="nu-list" aria-label="Mis recetas">
          {list.map((r) => (
            <li key={r.id} className="pp-card nu-recipe">
              <b>{r.name}</b>
              <small>{r.servings ? `Rinde ${num(r.servings)} ${r.servings === 1 ? "porción" : "porciones"}` : "Sin porciones definidas"}{r.finalWeightG ? ` · peso final ${num(r.finalWeightG)} g` : " · sin peso final"}</small>
              <small>{per(r.food)}</small>
              {r.food.note && <small className="mb-muted">{r.food.note}</small>}
              <div className="nu-actions">
                <button type="button" className="cta sm" onClick={() => onUse(r.food)} aria-label={`Registrar ${r.name}`}>Registrar</button>
                <button type="button" className="linkbtn nu-act" onClick={() => setEdit(r)} aria-label={`Editar ${r.name}`}>Editar</button>
                <button type="button" className="linkbtn nu-act" disabled={busy} onClick={() => void del(r)} aria-label={`Eliminar ${r.name}`}>Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecipeEditor({ recipe, onCancel, onSaved }: { recipe: Recipe | null; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [ings, setIngs] = useState<Ing[]>(() => (recipe?.ingredients ?? []).map((i) => ({ key: ingKey(), food: i.food, amount: num(i.quantity.amount, 2), unit: i.quantity.unit })));
  const [servings, setServings] = useState(recipe?.servings ? String(recipe.servings) : "");
  const [finalW, setFinalW] = useState(recipe?.finalWeightG ? String(recipe.finalWeightG) : "");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSnapshot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) { setResults(null); return; }
    const t = setTimeout(() => {
      api<{ results: FoodSnapshot[] }>(`${BASE}/foods?q=${encodeURIComponent(term)}`).then((r) => setResults(r.results.filter((f) => f.kind !== "recipe"))).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  const computed = ings.map((i) => { const a = parseAmount(i.amount); return a ? tryNutrients(i.food, { amount: a, unit: i.unit }) : null; });
  const ok = computed.every((c) => c?.ok);
  const totals = sumNutrients(computed.flatMap((c) => (c?.ok ? [c.n] : [])));
  const sv = parseAmount(servings), fw = parseAmount(finalW);
  const save = async () => {
    if (busy) return;
    if (name.trim().length < 2) { setErr("Escribí el nombre de la receta."); return; }
    if (!ings.length) { setErr("Agregá al menos un ingrediente."); return; }
    if (!ok) { setErr("Revisá las cantidades de los ingredientes."); return; }
    setBusy(true); setErr(null);
    try {
      await api(recipe ? `${BASE}/recipes/${recipe.id}` : `${BASE}/recipes`, { body: {
        name: name.trim(), servings: sv ?? null, finalWeightG: fw ?? null,
        ingredients: ings.map((i) => ({ ref: { kind: i.food.kind, id: i.food.refId }, quantity: { amount: parseAmount(i.amount)!, unit: i.unit } })),
      } });
      await onSaved();
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  const upd = (k: string, p: Partial<Ing>) => setIngs((l) => l.map((i) => (i.key === k ? { ...i, ...p } : i)));

  return (
    <div className="nu-col">
      <div className="pp-form">
        <h3 className="nu-h">{recipe ? "Editar receta" : "Nueva receta"}</h3>
        <label>Nombre<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Guiso de lentejas" /></label>
      </div>
      <h4 className="nu-h">Ingredientes</h4>
      {!ings.length && <p className="mb-muted nu-small">Buscá cada ingrediente y su cantidad tal como entra a la receta (crudo o cocido, según corresponda).</p>}
      <ul className="nu-list" aria-label="Ingredientes">
        {ings.map((i, k) => {
          const c = computed[k];
          return (
            <li key={i.key} className="pp-card nu-ing">
              <div className="pp-head"><b>{i.food.name}</b><button type="button" className="linkbtn nu-act" onClick={() => setIngs((l) => l.filter((x) => x.key !== i.key))} aria-label={`Quitar ${i.food.name}`}>Quitar</button></div>
              <div className="nu-qty-row">
                <label className="pp-form nu-amt"><span>Cantidad</span><input inputMode="decimal" value={i.amount} onChange={(e) => upd(i.key, { amount: e.target.value.replace(/[^\d.,]/g, "").slice(0, 7) })} /></label>
                <label className="pp-form nu-unitsel"><span>Unidad</span>
                  <select value={i.unit} onChange={(e) => upd(i.key, { unit: e.target.value as Quantity["unit"] })}>{unitOptions(i.food).map((o) => <option key={o.unit} value={o.unit}>{o.label}</option>)}</select>
                </label>
              </div>
              <small className="nu-small">{!c ? "Indicá la cantidad." : c.ok ? `${fmtNutrient("energyKcal", c.n.energyKcal)} · ${fmtNutrient("proteinG", c.n.proteinG)} proteína` : c.message}</small>
            </li>
          );
        })}
      </ul>
      <label className="nu-search"><span className="sr-only">Buscar ingrediente</span>
        <input type="search" value={q} placeholder="Agregar ingrediente (ej.: lentejas)" autoComplete="off" onChange={(e) => setQ(e.target.value.slice(0, 60))} />
      </label>
      {results && (
        <ul className="nu-list" aria-label="Ingredientes encontrados">
          {!results.length && <li className="mb-muted nu-small">Sin resultados.</li>}
          {results.slice(0, 8).map((f) => (
            <li key={`${f.kind}:${f.refId}`}><button type="button" className="nu-food" onClick={() => {
              const d = defaultQty(f);
              setIngs((l) => [...l, { key: ingKey(), food: f, amount: num(d.amount, 2), unit: d.unit }]); setQ(""); setResults(null);
            }}><b>{f.name}</b><small>{per(f)}</small></button></li>
          ))}
        </ul>
      )}
      <div className="pp-form">
        <div className="pp-row2">
          <label>Porciones que rinde<input inputMode="decimal" value={servings} placeholder="opcional" onChange={(e) => setServings(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))} /></label>
          <label>Peso final cocido (g)<input inputMode="decimal" value={finalW} placeholder="opcional" onChange={(e) => setFinalW(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} /></label>
        </div>
        <p className="nu-note" role="note">El peso de la preparación terminada no es la suma de los ingredientes crudos (el agua se absorbe o se evapora). Si pesás la olla terminada, podés registrar en gramos; si no, se registra por porciones{sv ? "" : " (sin porciones, la receta entera cuenta como una)"}.</p>
      </div>
      {ings.length > 0 && (
        <div className="pp-card">
          <b>Total de la receta</b>
          <dl className="nu-grid sm">{MAIN.map((k) => <div key={k}><dt>{SHORT[k]}</dt><dd>{fmtTotal(totals, k)}</dd></div>)}</dl>
          {sv && totals.items > 0 && <small>Por porción ({num(sv)}): {fmtNutrient("energyKcal", totals.values.energyKcal == null ? null : totals.values.energyKcal / sv)} · {fmtNutrient("proteinG", totals.values.proteinG == null ? null : totals.values.proteinG / sv)} proteína</small>}
        </div>
      )}
      {err && <p className="mb-err" role="alert">{err}</p>}
      <button type="button" className="cta" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar receta"}</button>
      <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
    </div>
  );
}
