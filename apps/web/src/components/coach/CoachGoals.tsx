"use client";
// Objetivos del cliente (F-CO-03, D97). Fuente: REPI Desktop Coach SCR-C-02a («Objetivos · acordados con …»): título,
// actual de meta, % y barra. El % se calcula desde la línea base con lo registrado; el manual lo carga el coach con fecha.
import { useState } from "react";
import { parseWeight } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { useLoad } from "@/components/gym/shared";

export type Goal = {
  id: string; kind: "e1rm" | "load" | "frequency" | "manual"; title: string; unit: string; target: number; targetReps: number | null; baseline: number | null;
  current: number | null; progress: number | null; source: string; manualAt: string | null; dueOn: string | null; status: "active" | "achieved" | "cancelled";
  note: string | null; createdAt: string; closedAt: string | null;
};
const n = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const day = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
const ST = { active: ["En curso", "info"], achieved: ["Logrado", "ok"], cancelled: ["Cancelado", "mute"] } as const;
export const barColor = (p: number | null) => (p == null ? "#CBD5E1" : p >= 0.9 ? "#00D1FF" : p >= 0.6 ? "#5DE6D8" : "#F59E0B");

export function GoalLine({ g }: { g: Goal }) {
  const pct = g.progress == null ? null : Math.round(g.progress * 100);
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 240px", minWidth: 0 }}>
      <span style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b>{g.title}</b>
        <span className="muted" style={{ fontSize: 13 }}>{g.current == null ? "Datos insuficientes" : <>{n(g.current)} de {n(g.target)} {g.unit} · <strong>{pct}%</strong></>}</span>
      </span>
      <span className="goalbar" role="img" aria-label={pct == null ? "Sin datos para calcular el avance" : `Avance ${pct}%`}><i style={{ width: `${pct ?? 0}%`, background: barColor(g.progress) }} /></span>
      <small className="muted">{g.baseline != null ? `Desde ${n(g.baseline)} ${g.unit} al acordar · ` : ""}{g.dueOn ? `Plazo ${day(g.dueOn)} · ` : ""}{g.kind === "manual" && g.manualAt ? `Último valor ${day(g.manualAt)} · ` : ""}{g.source}</small>
      {g.note && <small>{g.note}</small>}
    </span>
  );
}

export function GoalsTab({ orgId, relId, name, flash }: { orgId: string; relId: string; name: string; flash: (t: string) => void }) {
  const d = useLoad<{ goals: Goal[] }>(`/api/coach/${orgId}/clients/${relId}/goals`);
  const [create, setCreate] = useState(false);
  const act = async (g: Goal, body: Record<string, unknown>, msg: string) => {
    try { await api(`/api/coach/${orgId}/goals/${g.id}`, { body }); flash(msg); d.reload(); } catch (e) { flash((e as Error).message); }
  };
  const record = (g: Goal) => {
    const v = window.prompt(`Valor actual de «${g.title}» en ${g.unit}:`);
    if (v == null) return;
    const x = Number(v.trim().replace(",", "."));
    if (!v.trim() || !Number.isFinite(x)) { flash("Escribí un número."); return; }
    void act(g, { manualValue: x }, "Valor registrado.");
  };
  const first = name.split(" ")[0];
  const active = d.data?.goals.filter((g) => g.status === "active") ?? [];
  const closed = d.data?.goals.filter((g) => g.status !== "active") ?? [];
  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, flex: 1 }}>Objetivos</h2>
        <button type="button" className="btn sm pri" onClick={() => setCreate(true)}>Nuevo objetivo</button>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>Acordados con {first}. {first} los ve en su app con el mismo cálculo. El avance va desde el valor al acordar hasta la meta; no promete resultados.</span>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <span className="muted">Cargando…</span> : !d.data.goals.length ? <span className="muted" style={{ fontSize: 14 }}>Todavía no hay objetivos cargados.</span> : (
        <div className="table">
          {[...active, ...closed].map((g) => (
            <div key={g.id} className="trow" style={{ alignItems: "flex-start", opacity: g.status === "cancelled" ? 0.6 : 1 }}>
              <GoalLine g={g} />
              <span className={`chip ${ST[g.status][1]}`}>{ST[g.status][0]}</span>
              {g.status === "active" && g.kind === "manual" && <button type="button" className="btn sm" onClick={() => record(g)}>Registrar valor</button>}
              {g.status === "active" && <button type="button" className="btn sm" onClick={() => act(g, { status: "achieved" }, "Objetivo marcado como logrado.")}>Logrado</button>}
              {g.status === "active" && <button type="button" className="btn sm" onClick={() => act(g, { status: "cancelled" }, "Objetivo cancelado.")}>Cancelar</button>}
              {g.status !== "active" && <button type="button" className="btn sm" onClick={() => act(g, { status: "active" }, "Objetivo reabierto.")}>Reabrir</button>}
            </div>
          ))}
        </div>
      )}
      {create && <GoalModal orgId={orgId} relId={relId} flash={flash} onClose={(ok) => { setCreate(false); if (ok) d.reload(); }} />}
    </section>
  );
}

function GoalModal({ orgId, relId, flash, onClose }: { orgId: string; relId: string; flash: (t: string) => void; onClose: (ok: boolean) => void }) {
  const lib = useLoad<{ exercises: { id: string; name: string; group: string }[] }>(`/api/coach/${orgId}/library`);
  const [f, setF] = useState({ kind: "load", exerciseId: "", target: "", reps: "5", title: "", unit: "", baseline: "", dueOn: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const ex = f.kind === "e1rm" || f.kind === "load";
  const save = async () => {
    const target = f.kind === "manual" ? Number(f.target.replace(",", ".")) : f.kind === "frequency" ? Number(f.target) : parseWeight(f.target);
    if (target == null || !Number.isFinite(target) || target <= 0) { setErr("Escribí una meta válida."); return; }
    if (ex && !f.exerciseId) { setErr("Elegí el ejercicio."); return; }
    const baseline = f.kind === "manual" && f.baseline.trim() ? Number(f.baseline.replace(",", ".")) : null;
    if (baseline != null && !Number.isFinite(baseline)) { setErr("El valor actual tiene que ser un número."); return; }
    setBusy(true); setErr(null);
    try {
      await api(`/api/coach/${orgId}/clients/${relId}/goals`, { body: {
        kind: f.kind, exerciseId: ex ? f.exerciseId : null, target, targetReps: f.kind === "load" ? Number(f.reps) : null,
        title: f.kind === "manual" ? f.title : null, unit: f.kind === "manual" ? f.unit : null, baseline, dueOn: f.dueOn || null, note: f.note || null,
      } });
      flash("Objetivo acordado."); onClose(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal label="Nuevo objetivo" onClose={() => onClose(false)}>
      <div className="mhead"><h2>Nuevo objetivo</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="field">Indicador<select value={f.kind} onChange={set("kind")}>
          <option value="load">Carga en un ejercicio (peso × repeticiones)</option>
          <option value="e1rm">1RM estimado en un ejercicio</option>
          <option value="frequency">Entrenamientos por semana</option>
          <option value="manual">Otro indicador (lo cargás vos)</option>
        </select></label>
        {ex && <label className="field">Ejercicio<select required value={f.exerciseId} onChange={set("exerciseId")}>
          <option value="">{lib.data ? "Elegí un ejercicio" : "Cargando…"}</option>
          {lib.data?.exercises.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.group}</option>)}
        </select></label>}
        {f.kind === "manual" && <>
          <label className="field">Qué se mide<input required maxLength={120} value={f.title} onChange={set("title")} placeholder="10 km en menos de 50 min, perímetro de brazo…" /></label>
          <span className="muted" style={{ fontSize: 12 }}>No cargues datos de salud o medidas corporales si la persona no te compartió ese dato en REPI.</span>
        </>}
        <div style={{ display: "flex", gap: 10 }}>
          <label className="field" style={{ flex: 1 }}>{f.kind === "frequency" ? "Entrenamientos por semana" : f.kind === "manual" ? "Meta" : "Meta (kg)"}
            <input required inputMode="decimal" value={f.target} onChange={set("target")} placeholder={f.kind === "frequency" ? "4" : "90"} /></label>
          {f.kind === "load" && <label className="field" style={{ flex: "0 0 110px" }}>Repeticiones<input required inputMode="numeric" value={f.reps} onChange={set("reps")} /></label>}
          {f.kind === "manual" && <label className="field" style={{ flex: "0 0 110px" }}>Unidad<input required maxLength={12} value={f.unit} onChange={set("unit")} placeholder="cm, min" /></label>}
        </div>
        {f.kind === "manual" && <label className="field">Valor actual (opcional)<input inputMode="decimal" value={f.baseline} onChange={set("baseline")} placeholder="Línea base para calcular el avance" /></label>}
        <label className="field">Plazo (opcional)<input type="date" value={f.dueOn} min={new Date().toISOString().slice(0, 10)} onChange={set("dueOn")} /></label>
        <label className="field">Nota (opcional)<input maxLength={300} value={f.note} onChange={set("note")} placeholder="Revisión cada 6 semanas" /></label>
        {err && <p role="alert" className="err-box">{err}</p>}
        <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button><button type="submit" className="btn pri" aria-busy={busy || undefined}>{busy ? "Guardando…" : "Acordar objetivo"}</button></div>
      </form>
    </Modal>
  );
}
