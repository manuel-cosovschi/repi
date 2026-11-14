"use client";
// Nutrición › Progreso (D221). Descriptivo, nunca causal: promedios sólo de días que la persona marcó completos (mínimo 3),
// los días parciales se muestran marcados como tales y nunca como el día entero. Entrenamientos del período al lado, sin
// atribuir efectos.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtNutrient, isComplete, type Totals } from "@repi/domain";
import { api } from "@/lib/api";
import { Loading, SkelCard } from "@/components/motion/Skeleton";
import { ProgressChart, type ChartPoint } from "../ProgressChart";
import { addDays, BASE, dayShort, daysBetween, errText, fmtTotal, MAIN, MODE_LABEL, SHORT, today, type TargetKey, type Targets } from "./lib";

type Trend = { average: number | null; usableDays: number; excludedDays: number; min: number | null; max: number | null };
type Progress = {
  from: string; to: string;
  days: { day: string; status: "empty" | "partial" | "complete"; totals: Totals; meals: number; workouts: number }[];
  summary: { days: number; loggedDays: number; completeDays: number; partialDays: number; emptyDays: number; trends: Record<string, Trend> };
  workouts: number; sentence: string; targets: Targets; consistency: Partial<Record<TargetKey, { met: number; of: number } | null>>; mealsDist: Record<string, number>;
};
type Range = "7" | "30" | "custom";
const STATUS: Record<string, string> = { partial: "Parcial", complete: "Completo", empty: "Sin registro" };
const CONS: Record<TargetKey, string> = {
  proteinG: "Cumpliste tu objetivo de proteína", energyKcal: "Estuviste en tu objetivo de energía", carbsG: "Estuviste en tu objetivo de carbohidratos", fatG: "Estuviste en tu objetivo de grasas",
};

export function NutritionProgress({ online, tick }: { online: boolean; tick: number }) {
  const [range, setRange] = useState<Range>("7");
  const [from, setFrom] = useState(() => addDays(today(), -29));
  const [to, setTo] = useState(today);
  const [p, setP] = useState<Progress | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const span = range === "7" ? { from: addDays(today(), -6), to: today() } : range === "30" ? { from: addDays(today(), -29), to: today() } : { from, to };
  const invalid = range === "custom" ? (!from || !to ? "Elegí las dos fechas." : from > to ? "La fecha de inicio tiene que ser anterior a la de fin." : to > today() ? "La fecha de fin no puede ser futura." : daysBetween(from, to) > 364 ? "Elegí un período de hasta 365 días." : null) : null;
  const load = useCallback(async () => {
    if (invalid) return;
    setErr(null);
    try { setP(await api<Progress>(`${BASE}/progress?from=${span.from}&to=${span.to}`)); } catch (e) { setErr(errText(e)); }
  }, [span.from, span.to, invalid]);
  useEffect(() => { if (online) void load(); }, [load, online, tick]);

  // Sólo días completos y sin faltantes: un día parcial no es todo lo que la persona comió y, graficado, parecería una caída.
  // Los parciales se ven en la tabla de abajo, rotulados.
  const series = (k: "proteinG" | "energyKcal") => (p?.days ?? []).filter((d) => d.status === "complete" && isComplete(d.totals, k)).map<ChartPoint>((d) => ({
    id: `${k}-${d.day}`, day: d.day, y: Math.round(d.totals.values[k]!),
    label: `${dayShort(d.day)} · ${fmtNutrient(k, d.totals.values[k])}`,
    detail: <small>Día marcado completo{d.workouts ? ` · ${d.workouts} ${d.workouts === 1 ? "entrenamiento" : "entrenamientos"}` : ""}</small>,
  }));
  const prot = useMemo(() => series("proteinG"), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const kcal = useMemo(() => series("energyKcal"), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const avg = (k: TargetKey) => p?.summary.trends[k]?.average ?? null;
  const tl = (k: TargetKey) => (p?.targets[k] ? { y: p.targets[k]!.value, label: `Objetivo ${fmtNutrient(k, p.targets[k]!.value)} (${MODE_LABEL[p.targets[k]!.mode]})` } : null);

  if (!online) return <div className="pc-empty" role="status">Sin conexión: el progreso se calcula con todos tus registros y necesita conexión. Podés seguir registrando en «Hoy».</div>;
  return (
    <>
      <section className="pp-card" aria-labelledby="nu-pr">
        <h3 id="nu-pr">Período</h3>
        <div className="pp-ranges" role="group" aria-label="Período del progreso de nutrición">
          {([["7", "7 días"], ["30", "30 días"], ["custom", "Personalizado"]] as [Range, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>)}
        </div>
        {range === "custom" && (
          <div className="pp-form">
            <div className="pp-row2">
              <label>Desde<input type="date" value={from} max={to || today()} onChange={(e) => setFrom(e.target.value)} /></label>
              <label>Hasta<input type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
            {invalid && <p className="mb-err" role="alert">{invalid}</p>}
          </div>
        )}
        {err && <p className="mb-err" role="alert">{err} <button type="button" className="linkbtn" onClick={() => void load()}>Reintentar</button></p>}
        {!p && !err ? <div aria-busy="true" className="nu-col"><Loading what="tu progreso" /><SkelCard h={90} lines={1} /></div> : p && (
          <>
            <div className="pp-kpis nu-kpis">
              <div><strong>{p.summary.loggedDays}</strong><span>días con registro (de {p.summary.days})</span></div>
              <div><strong>{p.summary.completeDays}</strong><span>días completos</span></div>
              <div><strong>{avg("proteinG") == null ? "—" : fmtNutrient("proteinG", avg("proteinG"))}</strong><span>proteína por día{avg("proteinG") == null ? "" : ` · promedio de ${p.summary.trends.proteinG.usableDays} días completos`}</span></div>
              <div><strong>{avg("energyKcal") == null ? "—" : fmtNutrient("energyKcal", avg("energyKcal"))}</strong><span>energía por día{avg("energyKcal") == null ? "" : ` · promedio de ${p.summary.trends.energyKcal.usableDays} días completos`}</span></div>
            </div>
            {(avg("proteinG") == null || avg("energyKcal") == null) && <p className="nu-note" role="note">Faltan días completos (mínimo 3) para mostrar promedios. Marcá «Registré todo lo que comí» en los días que registres completos: los parciales no cuentan.</p>}
            <p className="nu-sentence">{p.sentence}</p>
            {MAIN.some((k) => p.consistency[k]) && (
              <ul className="nu-cons">
                {MAIN.filter((k) => p.consistency[k]).map((k) => <li key={k}>{CONS[k]} en {p.consistency[k]!.met} de {p.consistency[k]!.of} {p.consistency[k]!.of === 1 ? "día completo" : "días completos"}.</li>)}
              </ul>
            )}
          </>
        )}
      </section>
      {p && (
        <>
          <section className="pp-card" aria-labelledby="nu-ch-p">
            <h3 id="nu-ch-p">Proteína por día</h3>
            <ProgressChart title="Proteína por día" points={prot} fmt={(v) => `${v.toLocaleString("es-AR")} g`} target={tl("proteinG")} empty="Todavía no hay días completos en este período." />
            <small className="mb-muted nu-small">El gráfico usa sólo los días que marcaste completos. Los días parciales están en la lista de abajo.</small>
          </section>
          <section className="pp-card" aria-labelledby="nu-ch-e">
            <h3 id="nu-ch-e">Energía por día</h3>
            <ProgressChart title="Energía por día" points={kcal} fmt={(v) => `${v.toLocaleString("es-AR")} kcal`} target={tl("energyKcal")} empty="Todavía no hay días completos en este período." />
          </section>
          <section className="pp-card" aria-labelledby="nu-tbl">
            <h3 id="nu-tbl">Días del período</h3>
            {p.summary.loggedDays === 0 ? <p className="mb-muted nu-small">No hay comidas registradas en este período.</p> : (
              <details className="nu-details">
                <summary>Ver cada día ({p.summary.loggedDays})</summary>
                <ul className="pp-rows" aria-label="Días con registro">
                  {[...p.days].reverse().filter((d) => d.status !== "empty" || d.workouts).map((d) => (
                    <li key={d.day}>
                      <span><b>{dayShort(d.day)}</b> <span className={`nu-chip ${d.status === "complete" ? "ok" : d.status === "partial" ? "info" : "mute"}`}>{STATUS[d.status]}</span><br />
                        <span className="mb-muted">{d.status === "empty" ? "Sin comidas registradas" : MAIN.map((k) => `${SHORT[k]} ${fmtTotal(d.totals, k)}`).join(" · ")}</span></span>
                      <span className="mb-muted nu-small">{d.workouts ? `${d.workouts} entren.` : ""}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <details className="pp-card nu-details">
            <summary>Cómo se calcula</summary>
            <ul className="nu-howto">
              <li>Cada registro guarda los valores del alimento en ese momento: biblioteca de REPI (USDA FoodData Central, SR Legacy), la etiqueta (Open Food Facts) o lo que cargaste vos.</li>
              <li>Cuando una fuente no informa la energía pero sí proteínas, carbohidratos y grasas, se calcula con los factores de Atwater (4, 4 y 9 kcal por gramo) y se rotula «calculada».</li>
              <li>Un dato que falta es «sin dato», nunca 0. Si algún alimento no lo informa, el total se muestra como mínimo («≥»).</li>
              <li>Los promedios usan sólo los días que marcaste completos y sin faltantes, con un mínimo de 3. Los días parciales se muestran pero no cuentan.</li>
              <li>Los entrenamientos aparecen al lado para que veas los dos registros juntos; no afirmamos que uno cause cambios en el otro.</li>
            </ul>
          </details>
        </>
      )}
    </>
  );
}
