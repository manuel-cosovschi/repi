"use client";
// PP1 (D199) · Progreso › Entrenamiento: resumen del período (útil desde la primera sesión) y evolución por ejercicio.
// Todo se calcula en el servidor con las series válidas (anuladas fuera, corregidas con su valor vigente); el teléfono sólo
// pide el resumen y el ejercicio elegido, nunca todo el historial. Unidades: se guardan kg y se muestran en la unidad elegida.
import { useCallback, useEffect, useMemo, useState } from "react";
import { PROGRESS_RANGES, kgTo, volumeIn, type ProgressRange, type WeightUnit } from "@repi/domain";
import { api } from "@/lib/api";
import { ProgressChart, type ChartPoint } from "./ProgressChart";
import { useUnit } from "./units";

type Summary = {
  totals: { sessions: number; sets: number; reps: number; volumeKg: number; activeMinutes: number; exercises: number };
  last: { id: string; day: string; dayName: string } | null; weeks: { from: string; sessions: number }[];
  marks: { id: string; name: string; sessions: number; topKg: number | null; repsAtTop: number | null; e1rm: number | null; maxReps: number | null; maxSec: number | null }[];
};
type ExItem = { id: string; name: string; group: string; kind: string; sessions: number; lastDay: string; imported: boolean };
type Point = { day: string; at: string; source: "session" | "import"; sessionId: string | null; dayName: string | null; sets: number; reps: number; volumeKg: number;
  topKg: number | null; repsAtTop: number | null; e1rm: number | null; best: { weightKg: number; reps: number } | null; maxReps: number | null; maxSec: number | null; record: boolean; first: boolean };
type ExProgress = { exercise: { id: string; name: string; group: string; kind: string }; metric: "load" | "reps" | "time"; points: Point[]; records: number; truncated: boolean;
  totals: { sessions: number; sets: number; volumeKg: number; firstDay: string | null }; best: { day: string; e1rm: number; set: { weightKg: number; reps: number } } | null };
type Metric = "e1rm" | "top" | "reps" | "volume" | "bw" | "time";

const dayTxt = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const n1 = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 1 });
const secTxt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`);
const METRIC_TXT: Record<Metric, string> = { e1rm: "1RM estimado", top: "Carga máxima", reps: "Reps con la carga máxima", volume: "Volumen", bw: "Repeticiones", time: "Tiempo" };
const METRIC_HELP: Record<Metric, string> = {
  e1rm: "Estimación (Epley) desde series de 1 a 12 repeticiones con carga. No es un máximo medido.",
  top: "La carga más alta registrada en cada sesión.",
  reps: "Repeticiones logradas con la carga más alta de cada sesión.",
  volume: "Peso × repeticiones de la sesión. Más volumen puede ser más series: no es lo mismo que más fuerza.",
  bw: "Mejor serie sin carga externa, en repeticiones (peso corporal: no se cuenta como 0 kg).",
  time: "Serie más larga de la sesión.",
};

export function RangePicker({ value, onChange, label }: { value: ProgressRange; onChange: (r: ProgressRange) => void; label: string }) {
  return (
    <div className="pp-ranges" role="group" aria-label={label}>
      {(Object.keys(PROGRESS_RANGES) as ProgressRange[]).map((k) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{PROGRESS_RANGES[k]}</button>)}
    </div>
  );
}

function valueFor(p: Point, m: Metric): number | null {
  switch (m) {
    case "e1rm": return p.e1rm;
    case "top": return p.topKg;
    case "reps": return p.repsAtTop;
    case "volume": return p.volumeKg || null;
    case "bw": return p.maxReps;
    case "time": return p.maxSec;
  }
}
function fmtFor(m: Metric, unit: WeightUnit) {
  if (m === "e1rm" || m === "top") return (v: number) => `${n1(kgTo(v, unit))} ${unit}`;
  if (m === "volume") return (v: number) => `${volumeIn(v, unit).toLocaleString("es-AR")} ${unit}`;
  if (m === "time") return (v: number) => secTxt(Math.round(v));
  return (v: number) => `${Math.round(v)} reps`;
}

export function ProgressTraining({ onOpenSession, offline }: { onOpenSession: (id: string) => void; offline?: boolean }) {
  const unit = useUnit();
  const [range, setRange] = useState<ProgressRange>("90d");
  const [sum, setSum] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [list, setList] = useState<ExItem[] | null>(null);
  const [exId, setExId] = useState<string | null>(null);
  const [ex, setEx] = useState<ExProgress | null>(null);
  const [exErr, setExErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("e1rm");
  const [pick, setPick] = useState(false);

  // Ejercicio inicial: el más entrenado del período (primera de «tus marcas»); si no, el más reciente de la lista.
  const loadSum = useCallback(() => { setErr(null); api<Summary>(`/api/me/progress/summary?range=${range}`).then(setSum).catch((e) => setErr((e as Error).message)); }, [range]);
  useEffect(() => { if (!offline) loadSum(); }, [loadSum, offline]);
  useEffect(() => {
    if (offline) return;
    const t = setTimeout(() => { api<{ exercises: ExItem[] }>(`/api/me/progress/exercises?q=${encodeURIComponent(q.trim())}`).then((r) => setList(r.exercises)).catch(() => setList([])); }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, offline]);
  useEffect(() => { if (!exId && sum && list?.length && !q) setExId(sum.marks[0]?.id ?? list[0].id); }, [exId, sum, list, q]);
  useEffect(() => {
    if (!exId || offline) return;
    let off = false;
    setExErr(null);
    api<ExProgress>(`/api/me/progress/exercises/${encodeURIComponent(exId)}?range=${range}`).then((r) => {
      if (off) return;
      setEx(r);
      setMetric((m) => (r.metric === "load" ? (["e1rm", "top", "reps", "volume"].includes(m) ? m : "e1rm") : r.metric === "reps" ? "bw" : "time"));
    }).catch((e) => { if (!off) { setEx(null); setExErr((e as Error).message); } });
    return () => { off = true; };
  }, [exId, range, offline]);

  const metrics: Metric[] = ex?.metric === "load" ? ["e1rm", "top", "reps", "volume"] : ex?.metric === "reps" ? ["bw"] : ex ? ["time"] : [];
  const fmt = fmtFor(metric, unit);
  const pts = useMemo<ChartPoint[]>(() => (ex?.points ?? []).flatMap((p, i) => {
    const y = valueFor(p, metric);
    if (y == null) return [];
    const set = p.topKg != null ? `${n1(kgTo(p.topKg, unit))} ${unit} × ${p.repsAtTop}` : p.maxReps != null ? `${p.maxReps} reps` : p.maxSec != null ? secTxt(p.maxSec) : "";
    return [{
      id: `${p.sessionId ?? p.day}-${i}`, day: p.day, y, record: p.record, first: p.first,
      label: `${dayTxt(p.day)} · ${fmt(y)}`,
      detail: <>
        <small>{p.source === "import" ? "Historial importado" : p.dayName}{set ? ` · mejor serie ${set}` : ""} · {p.sets} {p.sets === 1 ? "serie" : "series"}{p.volumeKg ? ` · volumen ${volumeIn(p.volumeKg, unit).toLocaleString("es-AR")} ${unit}` : ""}{p.e1rm && metric !== "e1rm" ? ` · 1RM est. ${n1(kgTo(p.e1rm, unit))} ${unit}` : ""}</small>
        {p.record && <small>Récord: superaste tu mejor marca anterior.</small>}
        {p.first && <small>Primera marca registrada de este ejercicio.</small>}
        {p.sessionId && <button type="button" className="linkbtn" style={{ alignSelf: "flex-start", height: 32 }} onClick={() => onOpenSession(p.sessionId!)}>Ver el entrenamiento</button>}
      </>,
    }];
  }), [ex, metric, unit, fmt, onOpenSession]);

  if (offline) return <div className="pc-empty" role="status">Sin conexión: tus gráficos se calculan en el servidor con tu historial completo. Volvé a abrirlos cuando tengas señal.</div>;
  const t = sum?.totals;
  const maxW = Math.max(1, ...(sum?.weeks ?? []).map((w) => w.sessions));
  return (
    <>
      <section className="pp-card" aria-labelledby="pp-sum">
        <div className="pp-head"><h2 id="pp-sum">Tu período</h2></div>
        <RangePicker value={range} onChange={setRange} label="Período" />
        {err && <p className="mb-err" role="alert">{err} <button type="button" className="linkbtn" onClick={loadSum}>Reintentar</button></p>}
        {!sum && !err && <span className="mb-muted">Cargando…</span>}
        {t && t.sessions === 0 && <span className="mb-muted" style={{ fontSize: 14 }}>Sin entrenamientos registrados en este período.</span>}
        {t && t.sessions > 0 && (
          <>
            <div className="pp-kpis">
              <div><strong>{t.sessions}</strong><span>{t.sessions === 1 ? "Sesión" : "Sesiones"}</span></div>
              <div><strong>{t.sets}</strong><span>Series</span></div>
              <div><strong>{t.reps.toLocaleString("es-AR")}</strong><span>Repeticiones</span></div>
              <div><strong>{volumeIn(t.volumeKg, unit).toLocaleString("es-AR")}</strong><span>Volumen ({unit})</span></div>
              <div><strong>{t.activeMinutes}</strong><span>Minutos activos</span></div>
            </div>
            {t.sessions === 1 && <p className="mb-note" role="note" style={{ margin: 0 }}>Ya tenés tu primer registro. Seguí entrenando para comparar cómo evolucionás.</p>}
            {sum!.weeks.length > 1 && (
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 8 }}>Frecuencia · sesiones por semana</h3>
                <div className="volbars" style={{ height: 80 }} role="img" aria-label={`Sesiones por semana: ${sum!.weeks.map((w) => `semana del ${dayTxt(w.from)}: ${w.sessions}`).join(", ")}`}>
                  {sum!.weeks.map((w) => <div key={w.from}><i style={{ height: `${(w.sessions / maxW) * 100}%` }} /><span>{w.sessions}</span></div>)}
                </div>
              </div>
            )}
            {!!sum!.marks.length && (
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 4 }}>{t.sessions === 1 ? "Tus primeras marcas" : "Tus mejores marcas del período"}</h3>
                <ul className="pp-rows">
                  {sum!.marks.map((m) => (
                    <li key={m.id}><button type="button" className="linkbtn" style={{ textAlign: "left", padding: 0, height: "auto" }} onClick={() => { setExId(m.id); setPick(false); }}>{m.name}</button>
                      <span className="mb-muted">{m.topKg != null ? `${n1(kgTo(m.topKg, unit))} ${unit} × ${m.repsAtTop}` : m.maxReps != null ? `${m.maxReps} reps` : m.maxSec != null ? secTxt(m.maxSec) : "—"}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="pp-card" aria-labelledby="pp-ex">
        <div className="pp-head"><h2 id="pp-ex">Evolución por ejercicio</h2>
          {!!list?.length && <button type="button" className="linkbtn" aria-expanded={pick} onClick={() => setPick((x) => !x)}>{pick ? "Cerrar" : "Cambiar ejercicio"}</button>}</div>
        {list && !list.length && !q && <span className="mb-muted" style={{ fontSize: 14 }}>Cuando registres series, acá vas a ver cómo evoluciona cada ejercicio.</span>}
        {(pick || (list && !exId)) && !!(list?.length || q) && (
          <>
            <label className="search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ejercicio" aria-label="Buscar ejercicio" /></label>
            <div className="pp-exlist" role="list">
              {list?.map((x) => (
                <button key={x.id} type="button" role="listitem" aria-current={x.id === exId ? "true" : undefined} onClick={() => { setExId(x.id); setPick(false); }}>
                  <span>{x.name}<br /><small>{x.group}{x.imported ? " · importado" : ""}</small></span><small>{x.sessions} {x.sessions === 1 ? "sesión" : "sesiones"}</small>
                </button>
              ))}
              {list && !list.length && <span className="mb-muted" style={{ padding: 12 }}>Ningún ejercicio coincide con «{q}».</span>}
            </div>
          </>
        )}
        {exErr && <p className="mb-err" role="alert">{exErr}</p>}
        {ex ? (
          <>
            <div><b style={{ fontSize: 17 }}>{ex.exercise.name}</b><br /><small className="mb-muted">{ex.exercise.group} · desde {ex.totals.firstDay ? dayTxt(ex.totals.firstDay) : "—"}{ex.records ? ` · ${ex.records} ${ex.records === 1 ? "récord" : "récords"} en el período` : ""}</small></div>
            {metrics.length > 1 && (
              <div className="pp-ranges" role="group" aria-label="Métrica">
                {metrics.map((m) => <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}>{METRIC_TXT[m]}</button>)}
              </div>
            )}
            <ProgressChart key={`${ex.exercise.id}-${metric}-${range}`} title={`${METRIC_TXT[metric]} de ${ex.exercise.name}`} points={pts} fmt={fmt}
              empty={ex.points.length ? `No hay registros de ${METRIC_TXT[metric].toLowerCase()} en este período.` : "Sin registros de este ejercicio en el período elegido."} />
            <small className="mb-muted">{METRIC_HELP[metric]}</small>
            {ex.best && metric !== "volume" && <small className="mb-muted">Mejor 1RM estimado del período: {n1(kgTo(ex.best.e1rm, unit))} {unit} ({n1(kgTo(ex.best.set.weightKg, unit))} {unit} × {ex.best.set.reps}, {dayTxt(ex.best.day)}).</small>}
            {ex.truncated && <small className="mb-muted">Se muestran tus últimas 5.000 series de este ejercicio.</small>}
            {pts.length > 0 && (
              <details>
                <summary style={{ cursor: "pointer", fontSize: 14 }}>Ver todos los registros ({pts.length})</summary>
                <ul className="pp-rows" aria-label={`Registros de ${ex.exercise.name}`}>
                  {[...ex.points].reverse().map((p, i) => (
                    <li key={i}><span>{dayTxt(p.day)}{p.record && <span className="hx-chip">Récord</span>}{p.source === "import" && <span className="hx-chip">Importado</span>}<br />
                      <span className="mb-muted">{p.topKg != null ? `${n1(kgTo(p.topKg, unit))} ${unit} × ${p.repsAtTop}` : p.maxReps != null ? `${p.maxReps} reps` : p.maxSec != null ? secTxt(p.maxSec) : ""} · {p.sets} {p.sets === 1 ? "serie" : "series"}</span></span>
                      {p.sessionId ? <button type="button" className="linkbtn" onClick={() => onOpenSession(p.sessionId!)}>Ver</button> : <span />}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : exId && !exErr ? <span className="mb-muted">Cargando…</span> : null}
      </section>
    </>
  );
}
