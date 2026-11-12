"use client";
// D217 · Progress Intelligence 2.0 · D: metas del ejercicio. Las propias (la persona las crea, marca logradas o quita) y las
// acordadas con el entrenador (sólo lectura). Una meta nunca es una predicción de REPI ni cambia la programación.
// REPI Control (gimnasio que supervisa la planificación): no se crean metas acá; se le puede preparar un pedido al equipo.
import { useState } from "react";
import { kgTo, localDate, parseWeightIn, type WeightUnit } from "@repi/domain";
import { api } from "@/lib/api";
import { RepiAsk } from "@/components/brain/RepiAsk";
import { useBrain } from "@/components/brain/BrainProvider";
import { CARD_IDS } from "./ProgressIntelCards";
import { dayTxt, n1, secTxt, wFmt, type PI } from "./ProgressIntelShared";

type Self = PI["goals"]["self"][number];
type Coach = PI["goals"]["coach"][number];
type Kind = "load" | "e1rm" | "reps" | "time";

const repsTxt = (n: number) => `${n} ${n === 1 ? "repetición" : "repeticiones"}`;

function goalLabel(g: { kind: string; target: number; targetReps: number | null }, unit: WeightUnit) {
  const fmt = wFmt(unit);
  if (g.kind === "load") return `${fmt(g.target)} × ${g.targetReps ?? 1}`;
  if (g.kind === "e1rm") return `1RM estimado ${fmt(g.target)}`;
  if (g.kind === "time") return secTxt(g.target);
  return repsTxt(g.target);
}

/** Texto de estado en la unidad elegida (el servidor lo redacta en kg; mismas reglas que goalStatus del dominio). */
function statusText(g: Self, unit: WeightUnit) {
  if (unit === "kg" || (g.kind !== "load" && g.kind !== "e1rm")) return g.text;
  const fmt = wFmt(unit);
  if (g.kind === "load") {
    const reps = g.targetReps ?? 1, goal = `${fmt(g.target)} × ${reps}`;
    return g.met ? `Lograste tu meta de ${goal}.`
      : g.bestAtTarget ? `Tu meta es ${goal}. La mejor serie registrada con ese peso fue de ${repsTxt(g.bestAtTarget.r)}.`
      : g.current != null ? `Tu meta es ${goal}. Con ${reps} repeticiones, tu carga más alta registrada es ${fmt(g.current)}.`
      : `Tu meta es ${goal}. Todavía no hay series con ${reps} repeticiones o más para comparar.`;
  }
  return g.current == null ? `Tu meta es un 1RM estimado de ${fmt(g.target)}. Faltan series de 1 a 12 repeticiones con carga para estimarlo.`
    : g.met ? `Tu 1RM estimado (${fmt(g.current)}) ya alcanza tu meta de ${fmt(g.target)}. Es una estimación, no un máximo ejecutado.`
    : `Tu meta es un 1RM estimado de ${fmt(g.target)}. Hoy se estima en ${fmt(g.current)} (estimación).`;
}
function formulaText(g: Self, unit: WeightUnit) {
  if (unit === "kg" || g.pct == null || g.current == null || (g.kind !== "load" && g.kind !== "e1rm")) return g.formula;
  const c = n1(kgTo(g.current, unit)), t = n1(kgTo(g.target, unit));
  return g.baseline != null && g.baseline !== g.target ? `(${c} − ${n1(kgTo(g.baseline, unit))}) ÷ (${t} − ${n1(kgTo(g.baseline, unit))}) ${unit}` : `${c} ÷ ${t} ${unit}`;
}

function Bar({ pct, label }: { pct: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return <div className="pp-goalbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}><i style={{ width: `${v}%` }} /></div>;
}

export function IntelGoals({ pi, unit, onChanged }: { pi: PI; unit: WeightUnit; onChanged: () => Promise<void> | void }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const brainOn = useBrain().enabled;
  const name = pi.exercise.name;
  const coach = pi.goals.coach.filter((g) => g.status === "active" || g.status === "achieved");
  const close = async (g: Self, status: "achieved" | "cancelled") => {
    setBusy(g.id); setErr(null); setMsg(null);
    try {
      await api(`/api/me/progress/goals/${encodeURIComponent(g.id)}`, { body: { status } });
      setMsg(status === "achieved" ? "Meta marcada como lograda." : "Meta quitada. Tus registros no cambian.");
      await onChanged();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(null); }
  };
  return (
    <section className="pp-card" id={CARD_IDS.goals} tabIndex={-1} aria-labelledby="pgi-goals-h">
      <div className="pp-head"><h2 id="pgi-goals-h">Metas</h2>
        {pi.goals.canSet && !adding && <button type="button" className="linkbtn" onClick={() => { setAdding(true); setMsg(null); }}>Agregar meta</button>}</div>
      <small className="mb-muted">Una meta es tuya o la acuerdan con tu entrenador. No es una predicción de REPI ni cambia tu programación.</small>
      {msg && <p className="mb-note" role="status">{msg}</p>}
      {err && <p className="mb-err" role="alert">{err}</p>}
      {pi.goals.self.length > 0 && (
        <ul className="pgi-goals" aria-label={`Tus metas en ${name}`}>
          {pi.goals.self.map((g) => (
            <li key={g.id}>
              <div className="pgi-goal-h"><b>{goalLabel(g, unit)}</b>{g.met && <span className="hx-chip pgi-ok">Lograda</span>}</div>
              <span className="pgi-text">{statusText(g, unit)}</span>
              {g.pct != null && <Bar pct={g.pct} label={`Recorrido hacia ${goalLabel(g, unit)}`} />}
              {(g.dueOn || g.note) && <small className="mb-muted">{g.dueOn ? `Plazo: ${dayTxt(g.dueOn)}.` : ""}{g.note ? ` ${g.note}` : ""}</small>}
              <div className="pgi-acts">
                <button type="button" className="linkbtn" disabled={busy === g.id} onClick={() => void close(g, "achieved")}>La logré</button>
                <button type="button" className="linkbtn" disabled={busy === g.id} onClick={() => void close(g, "cancelled")}>Quitar</button>
                <button type="button" className="linkbtn" aria-expanded={why === g.id} onClick={() => setWhy((w) => (w === g.id ? null : g.id))}>{why === g.id ? "Ocultar" : "¿Cómo se calcula?"}</button>
              </div>
              {why === g.id && <div className="pgi-why"><p>{formulaText(g, unit)}</p><p>Se compara con tus series registradas{g.kind === "e1rm" ? " (1RM estimado: es una estimación)" : ""}. El porcentaje aparece sólo si hay un punto de partida medido.</p></div>}
            </li>
          ))}
        </ul>
      )}
      {coach.length > 0 && (
        <ul className="pgi-goals" aria-label={`Metas acordadas con tu entrenador en ${name}`}>
          {coach.map((g) => <CoachGoal key={g.id} g={g} unit={unit} />)}
        </ul>
      )}
      {!pi.goals.self.length && !coach.length && !adding && pi.goals.canSet && <span className="mb-muted pgi-text">Todavía no tenés metas en {name}.</span>}
      {!pi.goals.canSet && (
        <div className="pgi-supervised">
          <span className="pgi-text">En tu gimnasio las metas las define el equipo. Podés pedirles una{brainOn ? "" : " desde «Pedir ayuda»"}.</span>
          <RepiAsk section="progress" refs={{ exerciseId: pi.exercise.id }} subject={name} label="Preparar un pedido con REPI"
            chips={[{ label: "Pedir una meta al equipo", text: `Preparar una consulta para mi entrenador: quiero pedir una meta en ${name}.` }]} />
        </div>
      )}
      {adding && pi.goals.canSet && <GoalForm pi={pi} unit={unit} onCancel={() => setAdding(false)}
        onDone={async (m) => { setAdding(false); setMsg(m); await onChanged(); }} />}
    </section>
  );
}

function CoachGoal({ g, unit }: { g: Coach; unit: WeightUnit }) {
  const kgUnit = g.unit === "kg";
  const cur = g.current == null ? null : kgUnit ? wFmt(unit)(g.current) : `${n1(g.current)} ${g.unit}`;
  return (
    <li>
      <div className="pgi-goal-h"><b>{g.title}</b>{g.status === "achieved" && <span className="hx-chip pgi-ok">Lograda</span>}</div>
      <small className="mb-muted">Acordado con tu entrenador{g.by ? ` (${g.by})` : ""}{g.dueOn ? ` · plazo ${dayTxt(g.dueOn)}` : ""}</small>
      {cur && <span className="pgi-text">Hoy: {cur}.</span>}
      {g.progress != null && <Bar pct={g.progress * 100} label={`Recorrido hacia ${g.title}`} />}
    </li>
  );
}

function GoalForm({ pi, unit, onCancel, onDone }: { pi: PI; unit: WeightUnit; onCancel: () => void; onDone: (msg: string) => Promise<void> }) {
  const [kind, setKind] = useState<Kind>(pi.metric === "load" ? "load" : pi.metric);
  const [val, setVal] = useState("");
  const [reps, setReps] = useState("5");
  const [min, setMin] = useState("");
  const [sec, setSec] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = localDate(new Date());
  const save = async () => {
    let target: number | null = null, targetReps: number | null = null;
    if (kind === "load" || kind === "e1rm") {
      target = parseWeightIn(val, unit);
      if (target == null || target <= 0) { setErr(`Ingresá la carga en ${unit}.`); return; }
      if (kind === "load") {
        targetReps = Number(reps);
        if (!Number.isInteger(targetReps) || targetReps < 1 || targetReps > 30) { setErr("Indicá las repeticiones (1 a 30)."); return; }
      }
    } else if (kind === "reps") {
      target = Number(val);
      if (!Number.isInteger(target) || target < 1 || target > 500) { setErr("Indicá las repeticiones (1 a 500)."); return; }
    } else {
      const m = min.trim() ? Number(min) : 0, s = sec.trim() ? Number(sec) : 0;
      target = m * 60 + s;
      if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || s > 59 || target < 1 || target > 7200) { setErr("Indicá el tiempo (hasta 120 minutos; segundos de 0 a 59)."); return; }
    }
    setBusy(true); setErr(null);
    try {
      await api("/api/me/progress/goals", { body: { kind, exerciseId: pi.exercise.id, target, targetReps, dueOn: due || null } });
      await onDone("Meta guardada. La vas a ver acá y en el gráfico.");
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  const ref = pi.metric === "load" ? (kind === "load" ? pi.max : null) : null;
  return (
    <div className="pp-form pgi-form" role="group" aria-label={`Nueva meta en ${pi.exercise.name}`}>
      {pi.metric === "load" && (
        <div className="pp-ranges" role="group" aria-label="Tipo de meta">
          <button type="button" aria-pressed={kind === "load"} onClick={() => setKind("load")}>Carga × repeticiones</button>
          <button type="button" aria-pressed={kind === "e1rm"} onClick={() => setKind("e1rm")}>1RM estimado</button>
        </div>
      )}
      {(kind === "load" || kind === "e1rm") && (
        <div className={kind === "load" ? "pp-row2" : undefined}>
          <label>{kind === "load" ? "Carga" : "1RM estimado"} ({unit})<input inputMode="decimal" value={val} placeholder={ref ? n1(kgTo(ref.w, unit)) : undefined}
            onChange={(x) => setVal(x.target.value.replace(/[^\d.,]/g, "").slice(0, 7))} /></label>
          {kind === "load" && <label>Repeticiones<input inputMode="numeric" value={reps} onChange={(x) => setReps(x.target.value.replace(/\D/g, "").slice(0, 2))} /></label>}
        </div>
      )}
      {kind === "reps" && <label>Repeticiones en una serie<input inputMode="numeric" value={val} placeholder={pi.bestReps ? String(pi.bestReps.reps) : undefined} onChange={(x) => setVal(x.target.value.replace(/\D/g, "").slice(0, 3))} /></label>}
      {kind === "time" && (
        <div className="pp-row2">
          <label>Minutos<input inputMode="numeric" value={min} onChange={(x) => setMin(x.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
          <label>Segundos<input inputMode="numeric" value={sec} onChange={(x) => setSec(x.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
        </div>
      )}
      <label>Plazo (opcional)<input type="date" value={due} min={today} onChange={(x) => setDue(x.target.value)} /></label>
      {kind === "e1rm" && <small className="mb-muted">Se compara con tu 1RM estimado (Epley): no hace falta probar un máximo real.</small>}
      {err && <p className="mb-err" role="alert">{err}</p>}
      <div className="pgi-acts">
        <button type="button" className="cta sm" disabled={busy} aria-busy={busy || undefined} onClick={() => void save()}>Guardar meta</button>
        <button type="button" className="ghost sm" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
