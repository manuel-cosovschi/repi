"use client";
// Nutrición › Hoy (D221). El día que muestra el servidor (guardado en el teléfono) con lo pendiente encima: altas, ediciones y
// borrados que todavía no subieron se ven marcados «Pendiente de sincronizar», con valores calculados acá con la misma copia
// del alimento. Un día parcial nunca se presenta como el día completo: lo marca la persona.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fmtNutrient, gramsOf, isComplete, sumNutrients, INSUFFICIENT_DAY, MEALS, NOT_MEDICAL, PARTIAL_DAY_NOTE,
  type FoodSnapshot, type Meal, type Quantity,
} from "@repi/domain";
import { api, ApiError } from "@/lib/api";
import { cacheDay, cachedDay, enqueueNutri, newEntryId, pendingFor } from "@/lib/offline/nutrition";
import { RepiAsk } from "@/components/brain/RepiAsk";
import { Loading, SkelCard } from "@/components/motion/Skeleton";
import { Sheet } from "../Sheet";
import {
  addDays, BASE, dayShort, dayTitle, errText, fmtTotal, isNetwork, kcalProt, MAIN, mealByHour, mealName, MODE_LABEL, qtyText, SHORT, today, tryNutrients,
  type DayView, type Entry, type Favorite,
} from "./lib";
import { AddFood } from "./AddFood";
import { EntrySheet } from "./EntrySheet";
import type { Undo } from "./Nutrition";

type Pend = Awaited<ReturnType<typeof pendingFor>>;
export type LogFn = (food: FoodSnapshot, quantity: Quantity, meal: Meal, id: string) => Promise<void>;

/** Día del servidor + lo pendiente del teléfono. Los totales se recalculan con el mismo motor que usa el servidor. */
function merge(day: string, s: DayView | null, p: Pend | null) {
  let entries: Entry[] = s ? s.meals.flatMap((m) => m.entries) : [];
  if (p) {
    entries = entries.filter((e) => !p.deleted.has(e.id)).map((e) => {
      const u = p.updated.get(e.id);
      if (!u) return e;
      const q = u.quantity ?? e.quantity;
      const r = u.quantity ? tryNutrients(e.food, q) : null;
      const n = r?.ok ? r.n : e.nutrients;
      let g = e.grams;
      try { g = gramsOf(e.food, q); } catch { /* se muestra lo último confirmado */ }
      return { ...e, quantity: q, meal: u.meal ?? e.meal, nutrients: n, grams: g, pending: true };
    });
    const have = new Set(entries.map((e) => e.id));
    for (const a of p.adds) if (a.day === day && !have.has(a.id)) entries.push({ ...a, revision: 0, pending: true });
  }
  const meals = MEALS.map((m) => ({ meal: m, entries: entries.filter((e) => e.meal === m) })).filter((m) => m.entries.length)
    .map((m) => ({ ...m, totals: sumNutrients(m.entries.map((e) => e.nutrients)) }));
  const totals = sumNutrients(entries.map((e) => e.nutrients));
  const complete = s?.complete ?? false;
  const status = totals.items === 0 ? "empty" : complete ? "complete" : "partial";
  const note = status === "partial" ? (meals.length <= 1 ? INSUFFICIENT_DAY : PARTIAL_DAY_NOTE) : null;
  return { meals, totals, complete, status, note, targets: s?.targets ?? {}, pending: entries.filter((e) => e.pending).length };
}

export function NutritionDay({ online, tick, sync, scan, flash, showUndo }: {
  online: boolean; tick: number; sync: () => Promise<void>; scan: boolean; flash: (t: string) => void; showUndo: (u: Undo) => void;
}) {
  const [day, setDay] = useState(today);
  const [server, setServer] = useState<DayView | null>(null);
  const [cacheInfo, setCacheInfo] = useState<"server" | "cache" | "none" | null>(null);
  const [pend, setPend] = useState<Pend | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [add, setAdd] = useState<Meal | null>(null);
  const [edit, setEdit] = useState<Entry | null>(null);
  const [favFor, setFavFor] = useState<Meal | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [optComplete, setOptComplete] = useState<boolean | null>(null); // el interruptor responde en el acto

  const load = useCallback(async () => {
    setPend(await pendingFor(day));
    if (online) {
      try {
        const d = await api<DayView>(`${BASE}/day/${day}`);
        setServer(d); setCacheInfo("server"); setErr(null); void cacheDay(day, d); return;
      } catch (e) { if (!isNetwork(e)) { setErr(errText(e)); return; } }
    }
    const c = await cachedDay<DayView>(day);
    setServer(c?.v ?? null); setCacheInfo(c ? "cache" : "none"); setErr(null);
  }, [day, online]);
  useEffect(() => { void load(); }, [load, tick]);
  useEffect(() => { setMsg(null); setOptComplete(null); }, [day]);

  const s = server?.day === day ? server : null;
  const v = useMemo(() => merge(day, s, pend), [day, s, pend]);
  const loading = !s && cacheInfo !== "none" && !(cacheInfo === "cache" || err);

  // ── Acciones: toda alta, edición y borrado pasa primero por la cola (funciona igual sin conexión) ──
  const log: LogFn = useCallback(async (food, quantity, meal, id) => {
    await enqueueNutri({ op: "add", id, day, meal, ref: { kind: food.kind, id: food.refId }, quantity, food, at: new Date().toISOString() });
    await sync();
  }, [day, sync]);
  const removeIds = useCallback(async (ids: string[]) => {
    for (const id of ids) await enqueueNutri({ op: "delete", id, at: new Date().toISOString() });
    await sync();
  }, [sync]);
  const applyFavorite = useCallback(async (f: Favorite, meal: Meal) => {
    let ids: string[];
    if (online) {
      try {
        const r = await api<{ entries: Entry[] }>(`${BASE}/favorites/${f.id}/apply`, { body: { opId: newEntryId(), day, meal } });
        ids = r.entries.map((e) => e.id);
      } catch (e) { if (!isNetwork(e)) { flash(errText(e)); return; } ids = await queueFavorite(f, meal); }
    } else ids = await queueFavorite(f, meal);
    await sync();
    showUndo({ text: `Registrada «${f.name}» en ${mealName(meal)}.`, undo: () => void removeIds(ids) });
    async function queueFavorite(fv: Favorite, m: Meal) {
      const out: string[] = [];
      for (const it of fv.items) { const id = newEntryId(); out.push(id); await enqueueNutri({ op: "add", id, day, meal: m, ref: { kind: it.food.kind, id: it.food.refId }, quantity: it.quantity, food: it.food, at: new Date().toISOString() }); }
      return out;
    }
  }, [online, day, sync, flash, showUndo, removeIds]);

  const copyYesterday = async (meal: Meal | null) => {
    if (busy) return;
    setBusy(`copy:${meal ?? "day"}`); setMsg(null);
    try {
      const r = await api<{ entries: Entry[]; duplicate: boolean }>(`${BASE}/copy`, { body: { opId: newEntryId(), fromDay: addDays(day, -1), toDay: day, fromMeal: meal, toMeal: meal } });
      const n = r.entries.length;
      showUndo({ text: n ? `Copiamos ${n} ${n === 1 ? "registro" : "registros"} del día anterior.` : "No había nada nuevo para copiar.", undo: n ? () => void removeIds(r.entries.map((e) => e.id)) : undefined });
      await sync();
    } catch (e) { setMsg(e instanceof ApiError && e.code === "empty" ? `El día anterior no tiene ${meal ? `${mealName(meal).toLowerCase()} registrada` : "comidas registradas"}.` : errText(e)); }
    finally { setBusy(null); }
  };
  const setComplete = async (complete: boolean) => {
    if (busy) return;
    setBusy("complete"); setMsg(null); setOptComplete(complete);
    try {
      await api(`${BASE}/day/${day}`, { body: { complete } });
      flash(complete ? "Día marcado como completo." : "El día volvió a parcial.");
      await load();
    } catch (e) { setMsg(errText(e)); } finally { setOptComplete(null); setBusy(null); }
  };

  const isToday = day >= today();
  const partialOf = (k: (typeof MAIN)[number]) => !isComplete(v.totals, k) && v.totals.coverage[k].known > 0;
  return (
    <>
      <div className="nu-daynav">
        <button type="button" className="nu-navbtn" aria-label="Día anterior" onClick={() => setDay((d) => addDays(d, -1))}>‹</button>
        <h2 aria-live="polite">{dayTitle(day)}<small>{dayShort(day)}</small></h2>
        <button type="button" className="nu-navbtn" aria-label="Día siguiente" disabled={isToday} onClick={() => setDay((d) => (d >= today() ? d : addDays(d, 1)))}>›</button>
      </div>
      {err && <p className="mb-err" role="alert">{err} <button type="button" className="linkbtn" onClick={() => void load()}>Reintentar</button></p>}
      {cacheInfo === "none" && !online && <p className="mb-muted nu-small" role="status">Este día no está guardado en el teléfono: se ve sólo lo que registres ahora sin conexión.</p>}
      {loading && !err ? <div aria-busy="true" className="nu-col"><Loading what="tu día" /><SkelCard h={150} lines={2} /></div> : (
        <>
          <section className="pp-card nu-totals" aria-labelledby="nu-tot">
            <div className="pp-head">
              <h3 id="nu-tot">Totales del día</h3>
              {v.status !== "empty" && <span className={`nu-chip ${v.status === "complete" ? "ok" : "info"}`}>{v.status === "complete" ? "Completo" : "Parcial: muestra sólo lo que registraste"}</span>}
            </div>
            {v.status === "empty" ? <p className="mb-muted nu-small">Todavía no registraste comidas este día.</p> : (
              <dl className="nu-grid">
                {MAIN.map((k) => {
                  const t = v.targets[k], val = v.totals.values[k];
                  const pct = t && val != null ? Math.max(0, Math.min(100, (val / t.value) * 100)) : null;
                  return (
                    <div key={k}>
                      <dt>{SHORT[k]}</dt>
                      <dd><strong>{fmtTotal(v.totals, k)}</strong>
                        {t && <span className="nu-target">{val == null ? "sin dato" : fmtNutrient(k, val, partialOf(k))} de {fmtNutrient(k, t.value)} <small>({MODE_LABEL[t.mode]})</small></span>}
                        {pct != null && <span className="nu-bar" role="img" aria-label={`${SHORT[k]}: ${fmtNutrient(k, val, partialOf(k))} de ${fmtNutrient(k, t!.value)}`}><i style={{ width: `${pct}%` }} /></span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
            {v.note && <p className="nu-note" role="note">{v.note}</p>}
            {v.pending > 0 && <p className="nu-small mb-muted" role="status">{v.pending === 1 ? "1 registro pendiente de sincronizar" : `${v.pending} registros pendientes de sincronizar`}: los valores se calcularon en el teléfono.</p>}
            {v.status !== "empty" && (
              <label className="nu-switch">
                <input type="checkbox" role="switch" checked={optComplete ?? v.complete} disabled={!online || busy === "complete" || !s} onChange={(e) => void setComplete(e.target.checked)} />
                <span><b>Registré todo lo que comí {isToday ? "hoy" : "este día"}</b><small>Sólo los días completos cuentan para los promedios. {online ? "" : "Necesita conexión."}</small></span>
              </label>
            )}
          </section>

          <button type="button" className="cta" onClick={() => setAdd(mealByHour())}>Registrar comida</button>
          {msg && <p className="mb-err" role="alert">{msg}</p>}

          {v.meals.length === 0 && (
            <div className="pc-empty nu-empty">
              <p>Registrá lo que comas cuando quieras: no hace falta completar cuatro comidas. Tus alimentos recientes y tus comidas favoritas aparecen primero para registrarlos en un toque.</p>
              {online && <button type="button" className="ghost sm" disabled={!!busy} onClick={() => void copyYesterday(null)}>Copiar todo el día anterior</button>}
            </div>
          )}

          {v.meals.map((m) => (
            <section key={m.meal} className="pp-card nu-meal" aria-labelledby={`nu-m-${m.meal}`}>
              <div className="pp-head">
                <h3 id={`nu-m-${m.meal}`}>{mealName(m.meal)}</h3>
                <span className="mb-muted nu-small">{fmtTotal(m.totals, "energyKcal")} · {fmtTotal(m.totals, "proteinG")} proteína</span>
              </div>
              <ul className="nu-entries" aria-label={`Registros de ${mealName(m.meal)}`}>
                {m.entries.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="nu-entry" onClick={() => setEdit(e)} aria-label={`${e.food.name}, ${qtyText(e.food, e.quantity, e.grams)}${e.pending ? ", pendiente de sincronizar" : ""}. Editar`}>
                      <span className="nu-entry-main"><b>{e.food.name}</b><small>{qtyText(e.food, e.quantity, e.grams)}</small></span>
                      <span className="nu-entry-val"><small>{kcalProt(e.nutrients)}</small>{e.pending && <span className="nu-chip warn">Pendiente de sincronizar</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="nu-actions">
                <button type="button" className="linkbtn nu-act" onClick={() => setAdd(m.meal)}>+ Agregar a {mealName(m.meal).toLowerCase()}</button>
                {online && <button type="button" className="linkbtn nu-act" disabled={!!busy} onClick={() => void copyYesterday(m.meal)}>Repetir del día anterior</button>}
                {online && <button type="button" className="linkbtn nu-act" onClick={() => setFavFor(m.meal)}>Guardar como favorita</button>}
              </div>
            </section>
          ))}

          <div className="nu-quick" role="group" aria-label="Agregar a otra comida">
            {MEALS.filter((m) => !v.meals.some((x) => x.meal === m)).map((m) => (
              <button key={m} type="button" className="nu-pill" onClick={() => setAdd(m)}>+ {mealName(m)}</button>
            ))}
          </div>
          {v.meals.length > 0 && online && <button type="button" className="linkbtn nu-act" disabled={!!busy} onClick={() => void copyYesterday(null)}>Copiar todo el día anterior</button>}

          <div className="nu-ask">
            <RepiAsk section="progress" subject="Nutrición" label="Preguntale a REPI por tus comidas"
              chips={[{ label: "¿Cuánta proteína llevo hoy?", text: "¿Cuánta proteína llevo hoy?" }, { label: "¿Cómo vengo esta semana?", text: "¿Cómo vengo esta semana con mis comidas?" }, { label: "¿Qué comí ayer?", text: "¿Qué comí ayer?" }]} />
          </div>
          <p className="mb-muted nu-small">{NOT_MEDICAL}</p>
        </>
      )}

      {add && <AddFood day={day} meal={add} online={online} scan={scan} onClose={() => setAdd(null)} log={log} applyFavorite={applyFavorite} removeIds={removeIds} showUndo={showUndo} />}
      {edit && <EntrySheet entry={edit} online={online} onClose={() => setEdit(null)} flash={flash} sync={sync}
        onChanged={async () => { setEdit(null); await sync(); }} />}
      {favFor && <FavoriteSheet day={day} meal={favFor} pending={v.meals.find((m) => m.meal === favFor)?.entries.some((e) => e.pending) ?? false}
        onClose={() => setFavFor(null)} onDone={(t) => { setFavFor(null); flash(t); }} />}
    </>
  );
}

function FavoriteSheet({ day, meal, pending, onClose, onDone }: { day: string; meal: Meal; pending: boolean; onClose: () => void; onDone: (t: string) => void }) {
  const [name, setName] = useState(`Mi ${mealName(meal).toLowerCase()}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (busy) return;
    if (name.trim().length < 2) { setErr("Escribí un nombre de 2 a 60 letras."); return; }
    setBusy(true); setErr(null);
    try { await api(`${BASE}/favorites`, { body: { name: name.trim(), day, meal } }); onDone(`Guardamos «${name.trim()}» en tus favoritas.`); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Guardar como favorita" sub={`Guarda los alimentos y cantidades de ${mealName(meal).toLowerCase()} para registrarlos en un toque otro día.`} onClose={onClose} closeLabel="Cancelar">
      <div className="pp-form">
        <label>Nombre<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        {pending && <p className="sheet-warn">Hay registros de esta comida que todavía no se sincronizaron: se guarda lo que ya llegó al servidor.</p>}
        {err && <p className="mb-err" role="alert">{err}</p>}
        <button type="button" className="cta" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar favorita"}</button>
      </div>
    </Sheet>
  );
}
