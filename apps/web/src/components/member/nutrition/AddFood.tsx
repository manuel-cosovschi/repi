"use client";
// Registrar comida (D221): primero lo frecuente (recientes y favoritas: un toque registra con la última cantidad y se puede
// deshacer), después la búsqueda en tus alimentos, recetas y la biblioteca. También «Escribir lo que comí» (propuesta
// editable, nunca se guarda sola), código de barras, carga manual y recetas. Doble toque seguro: el id del registro se genera
// una vez por alta y los botones se desactivan mientras se registra.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FoodSnapshot, Meal, Quantity } from "@repi/domain";
import { api } from "@/lib/api";
import { cachedQuick, cacheQuick, newEntryId } from "@/lib/offline/nutrition";
import { Sheet } from "../Sheet";
import {
  BASE, defaultQty, errText, fmtTotal, isNetwork, kcalProt, mealName, num, parseAmount, qtyText, tryNutrients, unitOptions,
  type Favorite, type Quick, type Recent,
} from "./lib";
import { FoodInfo, MealChips, per, QtyPicker } from "./QtyPicker";
import type { LogFn } from "./NutritionDay";
import type { Undo } from "./Nutrition";
import { BarcodeLookup, ManualFood } from "./FoodForms";
import { Recipes } from "./Recipes";

type Mode = "pick" | "qty" | "parse" | "barcode" | "manual" | "recipes";
type Sel = { food: FoodSnapshot; amount: string; unit: Quantity["unit"]; id: string; back: Mode };
type ParseItem = { text: string; query: string; quantity: Quantity | null; quantityText: string | null; candidates: FoodSnapshot[]; issues: { code: string; message: string }[] };
type Row = ParseItem & { id: string; pick: number; amount: string; unit: Quantity["unit"]; include: boolean };

export function AddFood({ day, meal: initialMeal, online, scan, onClose, log, applyFavorite, removeIds, showUndo }: {
  day: string; meal: Meal; online: boolean; scan: boolean; onClose: () => void; log: LogFn;
  applyFavorite: (f: Favorite, meal: Meal) => Promise<void>; removeIds: (ids: string[]) => Promise<void>; showUndo: (u: Undo) => void;
}) {
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [mode, setMode] = useState<Mode>("pick");
  const [quick, setQuick] = useState<Quick | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSnapshot[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prefill, setPrefill] = useState("");
  const quickRef = useRef<Quick | null>(null);
  const knownRef = useRef<FoodSnapshot[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const cached = await cachedQuick<Quick>();
      if (live && cached) setQuick(cached);
      if (!online) { if (live && !cached) setQuick({ recent: [], favorites: [] }); return; }
      try {
        const [r, f] = await Promise.all([api<{ recent: Recent[] }>(`${BASE}/foods/recent`), api<{ favorites: Favorite[] }>(`${BASE}/favorites`)]);
        const next: Quick = { recent: r.recent, favorites: f.favorites, last: cached?.last ?? [] };
        if (live) setQuick(next);
        void cacheQuick(next);
      } catch { if (live && !cached) setQuick({ recent: [], favorites: [] }); }
    })();
    return () => { live = false; };
  }, [online]);

  // Búsqueda con espera de 300 ms y mínimo 2 letras. Sin conexión: sólo entre los alimentos ya vistos en el teléfono.
  const known = useMemo(() => {
    const m = new Map<string, FoodSnapshot>();
    for (const r of quick?.recent ?? []) m.set(`${r.food.kind}:${r.food.refId}`, r.food);
    for (const f of quick?.favorites ?? []) for (const i of f.items) m.set(`${i.food.kind}:${i.food.refId}`, i.food);
    for (const f of quick?.last ?? []) m.set(`${f.kind}:${f.refId}`, f);
    return [...m.values()];
  }, [quick]);
  useEffect(() => { quickRef.current = quick; knownRef.current = known; }, [quick, known]);
  const term = q.trim();
  useEffect(() => {
    setSearchErr(null);
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    if (!online) {
      const n = term.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      setResults(knownRef.current.filter((f) => f.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n)));
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api<{ results: FoodSnapshot[] }>(`${BASE}/foods?q=${encodeURIComponent(term)}`).then((r) => {
        setResults(r.results);
        const cur = quickRef.current;
        if (cur) { const next = { ...cur, last: r.results.slice(0, 15) }; setQuick(next); void cacheQuick(next); }
      }).catch((e) => { setResults(null); setSearchErr(isNetwork(e) ? "No pudimos buscar: revisá tu conexión." : errText(e)); }).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [term, online]);

  const pick = useCallback((food: FoodSnapshot, back: Mode, quantity?: Quantity) => {
    const d = quantity && tryNutrients(food, quantity).ok ? quantity : defaultQty(food);
    setSel({ food, amount: num(d.amount, 2), unit: d.unit, id: newEntryId(), back });
    setErr(null); setMode("qty");
  }, []);

  const doLog = async (food: FoodSnapshot, quantity: Quantity, id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await log(food, quantity, meal, id);
      showUndo({ text: `Registrado: ${food.name} (${qtyText(food, quantity)}) en ${mealName(meal).toLowerCase()}.`, undo: () => void removeIds([id]) });
      onClose();
    } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  const addSel = () => {
    if (!sel) return;
    const a = parseAmount(sel.amount);
    const r = a ? tryNutrients(sel.food, { amount: a, unit: sel.unit }) : null;
    if (!a || !r?.ok) { setErr(r && !r.ok ? r.message : "Indicá una cantidad mayor que cero."); return; }
    void doLog(sel.food, { amount: a, unit: sel.unit }, sel.id);
  };
  const fav = async (f: Favorite) => {
    if (busy) return;
    setBusy(true);
    try { await applyFavorite(f, meal); onClose(); } catch (e) { setErr(errText(e)); setBusy(false); }
  };

  const title = mode === "qty" ? "¿Cuánto?" : mode === "parse" ? "Escribir lo que comí" : mode === "barcode" ? "Código de barras" : mode === "manual" ? "Cargar a mano" : mode === "recipes" ? "Mis recetas" : "Registrar comida";
  const back = (to: Mode = "pick") => <button type="button" className="linkbtn nu-back" onClick={() => { setErr(null); setMode(to); }}>‹ Volver</button>;
  return (
    <Sheet title={title} sub={mode === "pick" ? `${dayLabel(day)} · elegí la comida y el alimento` : undefined} onClose={onClose} closeLabel="Cerrar">
      {mode !== "qty" && mode !== "recipes" && <MealChips value={meal} onPick={setMeal} />}
      {!online && mode !== "qty" && <p className="sheet-warn" role="status">Sin conexión: podés registrar recientes, favoritas y lo último que buscaste. Buscar en la biblioteca, interpretar texto y el código de barras necesitan conexión.</p>}

      {mode === "pick" && (
        <>
          <label className="nu-search"><span className="sr-only">Buscar alimento</span>
            <input type="search" value={q} placeholder="Buscar alimento (ej.: banana, pollo, arroz)" autoComplete="off" enterKeyHint="search" onChange={(e) => setQ(e.target.value.slice(0, 60))} aria-describedby="nu-search-st" />
          </label>
          <div id="nu-search-st" className="nu-small mb-muted" aria-live="polite">
            {term.length === 1 ? "Escribí al menos 2 letras." : searching ? "Buscando…" : results ? (results.length ? `${results.length} resultados${online ? "" : " (sin conexión: sólo alimentos ya vistos)"}` : online ? "Sin resultados. Probá con otro nombre o cargalo a mano." : "Sin conexión: no está entre los alimentos ya vistos en este teléfono.") : ""}
          </div>
          {searchErr && <p className="mb-err" role="alert">{searchErr}</p>}
          {results && results.length > 0 && (
            <ul className="nu-list" aria-label="Resultados">
              {results.map((f) => (
                <li key={`${f.kind}:${f.refId}`}><button type="button" className="nu-food" onClick={() => pick(f, "pick")}>
                  <b>{f.name}</b><FoodInfo food={f} /><small>{per(f)}</small>
                </button></li>
              ))}
            </ul>
          )}
          <div className="nu-tools" role="group" aria-label="Otras formas de registrar">
            <button type="button" className="nu-pill" disabled={!online} onClick={() => setMode("parse")}>Escribir lo que comí</button>
            {scan && <button type="button" className="nu-pill" disabled={!online} onClick={() => setMode("barcode")}>Código de barras</button>}
            <button type="button" className="nu-pill" disabled={!online} onClick={() => setMode("manual")}>Cargar a mano</button>
            <button type="button" className="nu-pill" disabled={!online} onClick={() => setMode("recipes")}>Mis recetas</button>
          </div>
          {!results && (
            <>
              <h3 className="nu-h">Recientes</h3>
              {!quick ? <p className="mb-muted nu-small">Cargando…</p> : !quick.recent.length ? <p className="mb-muted nu-small">Lo que registres aparece acá para repetirlo en un toque.</p> : (
                <ul className="nu-list" aria-label="Alimentos recientes">
                  {quick.recent.map((r) => (
                    <li key={`${r.food.kind}:${r.food.refId}`} className="nu-recent">
                      <button type="button" className="nu-food" disabled={busy} onClick={() => void doLog(r.food, r.quantity, newEntryId())} aria-label={`Registrar ${r.food.name}, ${qtyText(r.food, r.quantity)}, en ${mealName(meal).toLowerCase()}`}>
                        <b>{r.food.name}</b><small>{qtyText(r.food, r.quantity)} · {safeKP(r.food, r.quantity)}</small>
                      </button>
                      <button type="button" className="linkbtn nu-act" onClick={() => pick(r.food, "pick", r.quantity)} aria-label={`Elegir cantidad de ${r.food.name}`}>Cantidad</button>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="nu-h">Favoritas</h3>
              {quick && !quick.favorites.length ? <p className="mb-muted nu-small">Guardá una comida como favorita desde el día («Guardar como favorita») para registrarla entera en un toque.</p> : (
                <ul className="nu-list" aria-label="Comidas favoritas">
                  {(quick?.favorites ?? []).map((f) => (
                    <li key={f.id}><button type="button" className="nu-food" disabled={busy} onClick={() => void fav(f)} aria-label={`Registrar la favorita ${f.name} en ${mealName(meal).toLowerCase()}`}>
                      <b>{f.name}</b><small>{f.items.map((i) => i.food.name).join(", ")}</small><small>{fmtTotal(f.totals, "energyKcal")} · {fmtTotal(f.totals, "proteinG")} proteína</small>
                    </button></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {mode === "qty" && sel && (
        <>
          {back(sel.back)}
          <div className="nu-col"><b className="nu-name">{sel.food.name}</b><FoodInfo food={sel.food} full /></div>
          <QtyPicker food={sel.food} amount={sel.amount} unit={sel.unit} onAmount={(a) => setSel({ ...sel, amount: a })} onUnit={(u) => setSel({ ...sel, unit: u })} />
          <MealChips value={meal} onPick={setMeal} />
          {err && <p className="mb-err" role="alert">{err}</p>}
          <button type="button" className="cta" disabled={busy} aria-busy={busy || undefined} onClick={addSel}>{busy ? "Registrando…" : `Agregar a ${mealName(meal).toLowerCase()}`}</button>
        </>
      )}

      {mode === "parse" && <>{back()}<ParseText online={online} busy={busy} setMeal={setMeal} onAdd={async (rows) => {
        if (busy) return;
        setBusy(true);
        try {
          for (const r of rows) await log(r.food, r.quantity, meal, r.id);
          showUndo({ text: `Registramos ${rows.length} ${rows.length === 1 ? "alimento" : "alimentos"} en ${mealName(meal).toLowerCase()}.`, undo: () => void removeIds(rows.map((r) => r.id)) });
          onClose();
        } catch (e) { setErr(errText(e)); setBusy(false); }
      }} />{err && <p className="mb-err" role="alert">{err}</p>}</>}
      {mode === "barcode" && <>{back()}<BarcodeLookup onFound={(f) => pick(f, "barcode")} onManual={(code) => { setPrefill(code); setMode("manual"); }} /></>}
      {mode === "manual" && <>{back()}<ManualFood prefillBarcode={prefill} onCreated={(f) => pick(f, "manual")} /></>}
      {mode === "recipes" && <>{back()}<Recipes online={online} onUse={(f) => pick(f, "recipes")} /></>}
    </Sheet>
  );
}

function dayLabel(d: string) {
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
}
const safeKP = (f: FoodSnapshot, q: Quantity) => { const r = tryNutrients(f, q); return r.ok ? kcalProt(r.n) : "—"; };

/** «Almorcé 200 g de pollo cocido y una taza de arroz»: propuesta editable. Sólo se agregan las filas confirmadas. */
function ParseText({ online, busy, setMeal, onAdd }: { online: boolean; busy: boolean; setMeal: (m: Meal) => void; onAdd: (rows: { food: FoodSnapshot; quantity: Quantity; id: string }[]) => Promise<void> }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (loading || text.trim().length < 2) return;
    setLoading(true); setErr(null);
    try {
      const p = await api<{ meal: Meal | null; items: ParseItem[] }>(`${BASE}/parse`, { body: { text: text.trim() } });
      if (p.meal) setMeal(p.meal);
      setRows(p.items.map((it) => {
        const f = it.candidates[0];
        const q = f && it.quantity && tryNutrients(f, it.quantity).ok ? it.quantity : f ? defaultQty(f) : null;
        return { ...it, id: newEntryId(), pick: f ? 0 : -1, amount: it.quantity && q === it.quantity ? num(q.amount, 2) : "", unit: q?.unit ?? "g", include: !!f && !!it.quantity && q === it.quantity };
      }));
    } catch (e) { setErr(errText(e)); } finally { setLoading(false); }
  };
  const upd = (i: number, p: Partial<Row>) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const ready = (rows ?? []).filter((r) => r.include && r.pick >= 0).map((r) => {
    const f = r.candidates[r.pick], a = parseAmount(r.amount);
    return a && tryNutrients(f, { amount: a, unit: r.unit }).ok ? { food: f, quantity: { amount: a, unit: r.unit }, id: r.id } : null;
  });
  const valid = ready.filter((x): x is NonNullable<typeof x> => !!x);
  const invalid = ready.length - valid.length;
  return (
    <div className="nu-col">
      <label className="pp-form"><span>Contá qué comiste y cuánto</span>
        <textarea rows={3} maxLength={400} value={text} placeholder="Ej.: Almorcé 200 g de pollo cocido y una taza de arroz cocido" onChange={(e) => setText(e.target.value)} />
      </label>
      <small className="mb-muted nu-small">REPI arma una propuesta con la biblioteca de alimentos (sin IA). Revisala: no se guarda nada hasta que toques «Agregar».</small>
      <button type="button" className="ghost" disabled={!online || loading || text.trim().length < 2} aria-busy={loading || undefined} onClick={() => void run()}>{loading ? "Interpretando…" : "Interpretar"}</button>
      {err && <p className="mb-err" role="alert">{err}</p>}
      {rows && !rows.length && <p className="mb-muted nu-small" role="status">No encontramos alimentos en el texto. Probá separarlos con comas o buscalos uno por uno.</p>}
      {rows && rows.length > 0 && (
        <ol className="nu-parse" aria-label="Propuesta">
          {rows.map((r, i) => {
            const f = r.pick >= 0 ? r.candidates[r.pick] : null;
            const a = parseAmount(r.amount);
            const calc = f && a ? tryNutrients(f, { amount: a, unit: r.unit }) : null;
            return (
              <li key={r.id} className="pp-card">
                <label className="nu-check"><input type="checkbox" checked={r.include} disabled={!f} onChange={(e) => upd(i, { include: e.target.checked })} /><span>Incluir «{r.text}»{r.quantityText ? ` · leímos: ${r.quantityText}` : ""}</span></label>
                {r.issues.map((x) => <p key={x.code} className="sheet-warn">{x.message}</p>)}
                <fieldset className="nu-cands"><legend className="nu-small">Alimento</legend>
                  {r.candidates.map((c, k) => (
                    <label key={`${c.kind}:${c.refId}`} className="nu-radio"><input type="radio" name={`c-${r.id}`} checked={r.pick === k} onChange={() => {
                      const valid = unitOptions(c).some((o) => o.unit === r.unit);
                      const d = defaultQty(c);
                      upd(i, { pick: k, ...(valid ? {} : { unit: d.unit, amount: num(d.amount, 2) }) });
                    }} /><span>{c.name}{c.source.match === "approx" ? " · aproximado" : ""}<small> {per(c)}</small></span></label>
                  ))}
                  <label className="nu-radio"><input type="radio" name={`c-${r.id}`} checked={r.pick === -1} onChange={() => upd(i, { pick: -1, include: false })} /><span>Ninguno (no lo agrego)</span></label>
                </fieldset>
                {f && (
                  <div className="nu-qty-row">
                    <label className="pp-form nu-amt"><span>Cantidad</span><input inputMode="decimal" value={r.amount} onChange={(e) => upd(i, { amount: e.target.value.replace(/[^\d.,]/g, "").slice(0, 7) })} /></label>
                    <label className="pp-form nu-unitsel"><span>Unidad</span>
                      <select value={r.unit} onChange={(e) => upd(i, { unit: e.target.value as Quantity["unit"] })}>
                        {unitOptions(f).map((o) => <option key={o.unit} value={o.unit}>{o.label}</option>)}
                      </select>
                    </label>
                  </div>
                )}
                {f && <small className="nu-small" aria-live="polite">{!a ? "Indicá la cantidad para incluirlo." : calc && !calc.ok ? calc.message : calc?.ok ? kcalProt(calc.n) : ""}</small>}
              </li>
            );
          })}
        </ol>
      )}
      {rows && rows.length > 0 && (
        <>
          {invalid > 0 && <p className="sheet-warn">{invalid === 1 ? "Una fila incluida no tiene" : `${invalid} filas incluidas no tienen`} una cantidad válida: completala o desmarcala.</p>}
          <button type="button" className="cta" disabled={busy || !valid.length || invalid > 0} aria-busy={busy || undefined} onClick={() => void onAdd(valid)}>
            {busy ? "Registrando…" : `Agregar todo (${valid.length})`}
          </button>
        </>
      )}
    </div>
  );
}
