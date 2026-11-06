"use client";
// PP1 (D199) · Progreso › Mi cuerpo: peso corporal, objetivo y su gráfico. Privado: sólo lo ve la persona (ni coach, ni
// gimnasio, ni comunidad, ni rankings). Guardar necesita conexión y recién se muestra «Guardado» cuando el servidor lo
// confirma (no hay registro offline a medias). Una medición por día: guardar otra ese día la reemplaza y se avisa.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bodyGoalText, bodyWeightIn, fmtBodyWeight, fmtWeightDelta, localDate, parseBodyWeight, type BodyGoalProgress, type ProgressRange,
} from "@repi/domain";
import { api } from "@/lib/api";
import { ProgressChart, type ChartPoint } from "./ProgressChart";
import { RangePicker } from "./ProgressTraining";
import { Sheet } from "./Sheet";
import { useUnit } from "./units";
import { AgeGate } from "./AgeGate";

type Entry = { id: string; day: string; weightG: number; source: string; createdAt: string; updatedAt: string; edited: boolean };
type Body =
  | { available: false; reason: "minor" | "age_unknown" }
  | { available: true; entries: Entry[]; summary: { first: { day: string; weightG: number }; last: { day: string; weightG: number }; count: number; netG: number } | null;
      current: { day: string; weightG: number } | null; start: { day: string; weightG: number; source: "manual" | "first_entry" } | null;
      goal: { targetG: number; targetOn: string | null; startSource: string; revision: number } | null; progress: BodyGoalProgress | null };

const dayTxt = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const today = () => localDate(new Date());

export function BodyWeight({ flash, offline }: { flash: (t: string) => void; offline?: boolean }) {
  const unit = useUnit();
  const [range, setRange] = useState<ProgressRange>("90d");
  const [b, setB] = useState<Body | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Entry | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const load = useCallback(() => { setErr(null); return api<Body>(`/api/me/progress/body?range=${range}`).then(setB).catch((e) => setErr((e as Error).message)); }, [range]);
  useEffect(() => { if (!offline) void load(); }, [load, offline]);

  const save = async () => {
    if (busy) return; // doble toque: un solo pedido (y el servidor deja una medición por día)
    const g = parseBodyWeight(val, unit);
    if (g == null) { setFormErr(`Ingresá tu peso en ${unit} (por ejemplo ${unit === "kg" ? "72,5" : "160"}).`); return; }
    setBusy(true); setFormErr(null);
    try {
      const r = await api<{ replaced: boolean; unchanged: boolean }>("/api/me/progress/body/weights", { body: { day, weightG: g } });
      flash(r.unchanged ? "Esa medición ya estaba guardada." : r.replaced ? `Guardado: reemplazamos la medición del ${dayTxt(day)}.` : "Peso guardado.");
      setVal(""); setDay(today()); await load();
    } catch (e) { setFormErr(`${(e as Error).message} No se guardó: podés reintentar.`); } finally { setBusy(false); }
  };

  const goalLine = b?.available && b.goal ? { y: bodyWeightIn(b.goal.targetG, unit), label: `Objetivo ${fmtBodyWeight(b.goal.targetG, unit)}` } : null;
  const pts = useMemo<ChartPoint[]>(() => (b?.available ? b.entries : []).map((e) => ({
    id: e.id, day: e.day, y: bodyWeightIn(e.weightG, unit), label: `${dayTxt(e.day)} · ${fmtBodyWeight(e.weightG, unit)}`,
    detail: <small>Medición registrada por vos{e.edited ? " · editada" : ""}</small>,
  })), [b, unit]);

  if (offline) return <div className="pc-empty" role="status">Sin conexión: tu peso se muestra y se guarda con conexión, para no marcar como guardado algo que todavía no llegó.</div>;
  if (err) return <p className="mb-err" role="alert">{err} <button type="button" className="linkbtn" onClick={() => void load()}>Reintentar</button></p>;
  if (!b) return <span className="mb-muted">Cargando…</span>;
  if (!b.available) return b.reason === "age_unknown" ? <AgeGate what="El seguimiento del peso corporal" onDone={() => void load()} />
    : <div className="pc-empty" role="note">El seguimiento del peso corporal no está disponible para menores de 18 años.</div>;
  const pct = b.progress && "pct" in b.progress ? b.progress.pct : null;
  return (
    <>
      <p className="mb-muted" role="note" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>Privado: sólo lo ves vos. Tu coach, tu gimnasio y otras personas no acceden a tu peso ni a tu objetivo.</p>
      <section className="pp-card" aria-labelledby="bw-add">
        <h2 id="bw-add">Registrar peso</h2>
        <div className="pp-form">
          <div className="pp-row2">
            <label>Peso ({unit})<input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} placeholder={unit === "kg" ? "72,5" : "160"} aria-describedby="bw-err" /></label>
            <label>Fecha<input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></label>
          </div>
          <button type="button" className="cta" aria-busy={busy || undefined} disabled={busy || !val} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar"}</button>
          <span id="bw-err">{formErr && <span className="mb-err" role="alert">{formErr}</span>}</span>
          <small className="mb-muted">Una medición por día: si ya registraste ese día, se reemplaza.</small>
        </div>
      </section>

      <section className="pp-card" aria-labelledby="bw-goal">
        <div className="pp-head"><h2 id="bw-goal">Objetivo</h2><button type="button" className="linkbtn" onClick={() => setGoalOpen(true)}>{b.goal ? "Cambiar" : "Definir objetivo"}</button></div>
        <div className="pp-kpis">
          <div><strong>{b.start ? fmtBodyWeight(b.start.weightG, unit) : "—"}</strong><span>Inicial{b.start ? ` · ${dayTxt(b.start.day)}${b.start.source === "manual" ? " (indicado por vos)" : ""}` : ""}</span></div>
          <div><strong>{b.current ? fmtBodyWeight(b.current.weightG, unit) : "—"}</strong><span>Actual{b.current ? ` · ${dayTxt(b.current.day)}` : ""}</span></div>
          <div><strong>{b.goal ? fmtBodyWeight(b.goal.targetG, unit) : "—"}</strong><span>Objetivo{b.goal?.targetOn ? ` · ${dayTxt(b.goal.targetOn)}` : ""}</span></div>
        </div>
        {b.progress && (
          <>
            {pct != null && b.progress.state !== "maintain" && <div className="pp-goalbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Recorrido hacia la meta"><i style={{ width: `${pct}%` }} /></div>}
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{bodyGoalText(b.progress, unit)}</p>
          </>
        )}
        {!b.goal && <span className="mb-muted" style={{ fontSize: 14 }}>Definí un objetivo si querés ver tu recorrido. Es opcional.</span>}
      </section>

      <section className="pp-card" aria-labelledby="bw-chart">
        <div className="pp-head"><h2 id="bw-chart">Evolución del peso</h2></div>
        <RangePicker value={range} onChange={setRange} label="Período del gráfico de peso" />
        {b.summary && (
          <div className="pp-kpis">
            <div><strong>{fmtBodyWeight(b.summary.first.weightG, unit)}</strong><span>Primero · {dayTxt(b.summary.first.day)}</span></div>
            <div><strong>{fmtBodyWeight(b.summary.last.weightG, unit)}</strong><span>Último · {dayTxt(b.summary.last.day)}</span></div>
            <div><strong>{fmtWeightDelta(b.summary.netG, unit)}</strong><span>Variación neta</span></div>
          </div>
        )}
        <ProgressChart title="Peso corporal" points={pts} fmt={(v) => `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${unit}`} target={goalLine}
          empty="Todavía no registraste tu peso en este período." />
        {b.entries.length > 0 && (
          <details>
            <summary style={{ cursor: "pointer", fontSize: 14 }}>Mediciones ({b.entries.length})</summary>
            <ul className="pp-rows" aria-label="Mediciones de peso">
              {[...b.entries].reverse().map((e) => (
                <li key={e.id}><span>{fmtBodyWeight(e.weightG, unit)}<br /><span className="mb-muted">{dayTxt(e.day)}{e.edited ? " · editada" : ""}</span></span>
                  <button type="button" className="linkbtn" aria-label={`Editar la medición del ${dayTxt(e.day)}`} onClick={() => setEdit(e)}>Editar</button></li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {edit && <EditEntry e={edit} unit={unit} onClose={() => setEdit(null)} onDone={async (m) => { setEdit(null); flash(m); await load(); }} />}
      {goalOpen && <GoalSheet b={b} unit={unit} onClose={() => setGoalOpen(false)} onDone={async (m) => { setGoalOpen(false); flash(m); await load(); }} />}
    </>
  );
}

function EditEntry({ e, unit, onClose, onDone }: { e: Entry; unit: "kg" | "lb"; onClose: () => void; onDone: (m: string) => void }) {
  const [val, setVal] = useState(String(bodyWeightIn(e.weightG, unit)).replace(".", ","));
  const [day, setDay] = useState(e.day);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const save = async () => {
    const g = parseBodyWeight(val, unit);
    if (g == null) { setErr(`Ingresá un peso válido en ${unit}.`); return; }
    setBusy(true); setErr(null);
    try { await api(`/api/me/progress/body/weights/${e.id}`, { body: { day, weightG: g } }); onDone("Medición actualizada."); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const del = async () => {
    setBusy(true); setErr(null);
    try { await api(`/api/me/progress/body/weights/${e.id}`, { method: "DELETE" }); onDone("Medición eliminada."); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  return (
    <Sheet title="Editar medición" sub={dayTxt(e.day)} onClose={onClose} closeLabel="Cancelar">
      <div className="pp-form">
        <div className="pp-row2">
          <label>Peso ({unit})<input inputMode="decimal" value={val} onChange={(x) => setVal(x.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} /></label>
          <label>Fecha<input type="date" value={day} max={localDate(new Date())} onChange={(x) => setDay(x.target.value)} /></label>
        </div>
        {err && <p className="mb-err" role="alert">{err}</p>}
        <button type="button" className="cta" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>Guardar cambios</button>
        {!ask ? <button type="button" className="ghost hx-danger" disabled={busy} onClick={() => setAsk(true)}>Eliminar medición</button> : (
          <div className="conflict" role="alert"><strong>¿Eliminar esta medición?</strong><span>Se borra definitivamente.</span>
            <div style={{ display: "flex", gap: 8 }}><button type="button" className="cta sm" disabled={busy} onClick={() => void del()}>Eliminar</button><button type="button" className="ghost sm" onClick={() => setAsk(false)}>No</button></div></div>
        )}
      </div>
    </Sheet>
  );
}

function GoalSheet({ b, unit, onClose, onDone }: { b: Extract<Body, { available: true }>; unit: "kg" | "lb"; onClose: () => void; onDone: (m: string) => void }) {
  const [target, setTarget] = useState(b.goal ? String(bodyWeightIn(b.goal.targetG, unit)).replace(".", ",") : "");
  const [targetOn, setTargetOn] = useState(b.goal?.targetOn ?? "");
  const [manual, setManual] = useState(b.start?.source === "manual");
  const [sVal, setSVal] = useState(b.start?.source === "manual" ? String(bodyWeightIn(b.start.weightG, unit)).replace(".", ",") : "");
  const [sDay, setSDay] = useState(b.start?.source === "manual" ? b.start.day : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const t = parseBodyWeight(target, unit);
    if (t == null) { setErr(`Ingresá tu objetivo en ${unit}.`); return; }
    const sg = manual ? parseBodyWeight(sVal, unit) : null;
    if (manual && (sg == null || !sDay)) { setErr("Completá el peso y la fecha de tu punto de partida."); return; }
    setBusy(true); setErr(null);
    try { await api("/api/me/progress/body/goal", { body: { targetG: t, targetOn: targetOn || null, start: manual ? { day: sDay, weightG: sg } : null } }); onDone("Objetivo guardado."); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try { await api("/api/me/progress/body/goal", { method: "DELETE" }); onDone("Objetivo quitado. Tus mediciones no cambian."); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  return (
    <Sheet title="Objetivo de peso" onClose={onClose} closeLabel="Cancelar">
      <div className="pp-form">
        <div className="pp-row2">
          <label>Objetivo ({unit})<input inputMode="decimal" value={target} onChange={(x) => setTarget(x.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} /></label>
          <label>Fecha objetivo (opcional)<input type="date" value={targetOn} min={localDate(new Date())} onChange={(x) => setTargetOn(x.target.value)} /></label>
        </div>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><input type="checkbox" checked={manual} onChange={(x) => setManual(x.target.checked)} style={{ width: 20, height: 20 }} />Indicar otro punto de partida (si no, tu primera medición)</label>
        {manual && (
          <div className="pp-row2">
            <label>Peso inicial ({unit})<input inputMode="decimal" value={sVal} onChange={(x) => setSVal(x.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} /></label>
            <label>Fecha<input type="date" value={sDay} max={localDate(new Date())} onChange={(x) => setSDay(x.target.value)} /></label>
          </div>
        )}
        <small className="mb-muted">Mantener tu peso también es un objetivo: poné el mismo valor que tu punto de partida.</small>
        {err && <p className="mb-err" role="alert">{err}</p>}
        <button type="button" className="cta" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>Guardar objetivo</button>
        {b.goal && <button type="button" className="ghost" disabled={busy} onClick={() => void clear()}>Quitar objetivo</button>}
      </div>
    </Sheet>
  );
}
