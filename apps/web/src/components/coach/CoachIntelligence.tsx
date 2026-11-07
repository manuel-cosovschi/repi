"use client";
// D191 · Training Intelligence en la ficha del alumno (coach: pestaña Rendimiento) o del socio (Gym: equipo de sala con
// permiso para su programa). Tendencia por ejercicio del programa, objetivos de REPI y cómo se resolvieron, y propuestas
// para la próxima programación. Decidir sobre una propuesta NO cambia la rutina: «Revisar en el editor» la lleva al editor
// de siempre, donde sólo cambia el borrador si se aplica y se guarda con una versión nueva y su autoría.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/components/gym/shared";
import type { TiDraft } from "./ProposalDraft";

type Trend = { kind: string; confidence: "none" | "possible" | "consistent"; sessions: number; text: string };
type Ex = {
  exerciseId: string; name: string; prescribed: string;
  last: { at: string; sets: { w: number | null; r: number | null; rir: number | null; kind: string | null; stage: number | null }[] } | null;
  trend: Trend | null; targets: { accepted: number; modified: number; not_done: number };
  proposal: { id: string; status: string; kind: string; text: string; weightKg: number | null; requiresCoach: boolean; basis: string } | null;
};
type View = { formula: string; exercises: Ex[]; adherence: { sessions28d: number } | null; programId: string | null };
const CONF: Record<Trend["confidence"], string> = { none: "datos insuficientes", possible: "tendencia posible", consistent: "tendencia consistente" };
const DECIDED: Record<string, string> = { accepted: "Aceptada: todavía no se aplicó a la rutina", modified: "Aceptada con cambios", kept: "Se mantuvo la programación", rejected: "Rechazada" };
export const PROPOSAL_KIND: Record<string, string> = { load: "Carga", reps: "Repeticiones", hold: "Mantener", review: "Revisar", deload: "Posible descarga", rest: "Descanso" };
const KIND = PROPOSAL_KIND;
// La ficha del coach y la de Gym muestran todo en kg (como el resto de esos paneles); la unidad del alumno es de su app.
const kg = (n: number | null) => (n == null ? "" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} kg`);

export function IntelSection({ load, decideUrl, relId, kind, who = "con vos", onReview, onLoaded }: {
  load: string; decideUrl: (proposalId: string) => string; relId: string; kind: TiDraft["kind"]; who?: string;
  /** Abre el editor de programas de siempre con la propuesta a la vista (no la aplica). */
  onReview?: (d: TiDraft) => void;
  /** D210: cada carga puede abrir o cerrar propuestas; «Señales de REPI» se actualiza para contar lo mismo. */
  onLoaded?: () => void;
}) {
  const d = useLoad<View>(load);
  useEffect(() => { if (d.data) onLoaded?.(); }, [d.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (d.err) return <p role="alert" className="err-box">{d.err}</p>;
  if (!d.data) return <p className="muted">Cargando Training Intelligence…</p>;
  const { exercises, formula, adherence, programId } = d.data;
  const decide = async (id: string, status: "accepted" | "rejected" | "kept") => {
    setBusy(id); setMsg(null);
    try {
      await api(decideUrl(id), { body: { status } });
      setMsg(status === "accepted" ? "Propuesta marcada como aceptada. La rutina todavía no cambió: para aplicarla, usá «Revisar en el editor» y guardá el programa." : status === "rejected" ? "Propuesta rechazada. La rutina no cambió." : "Se mantiene la programación original.");
      await d.reload();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <section className="card" aria-labelledby={`ti-h-${relId}`}>
      <h2 id={`ti-h-${relId}`} tabIndex={-1}>Training Intelligence</h2>
      <span className="muted" style={{ fontSize: 13 }}>{formula}{adherence ? ` Entrenamientos completados ${who} en 28 días: ${adherence.sessions28d}.` : ""}</span>
      {msg && <p role="status" style={{ fontSize: 13, margin: 0 }}>{msg}</p>}
      {!exercises.length ? <div className="empty">Sin programa activo o sin series registradas todavía.</div> : (
        <div className="table">
          {exercises.map((e) => {
            const t = e.targets, total = t.accepted + t.modified + t.not_done;
            const last = e.last?.sets.filter((x) => (x.stage ?? 0) === 0 && x.kind !== "warmup") ?? [];
            const p = e.proposal;
            return (
              <div key={e.exerciseId} className="trow" style={{ alignItems: "flex-start" }}>
                <b style={{ flex: "1 1 180px" }}>{e.name}<small className="muted" style={{ display: "block", fontWeight: 400 }}>Programado: {e.prescribed}</small>
                  {last.length > 0 && <small className="muted" style={{ display: "block", fontWeight: 400 }}>Última: {last.map((x) => `${x.w ? `${kg(x.w)} × ` : ""}${x.r ?? "—"}${x.rir != null ? ` (RIR ${x.rir})` : ""}`).join(" · ")}</small>}</b>
                <div style={{ flex: "2 1 240px", display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  {e.trend && <span><span className={`chip ${e.trend.kind === "progressing" ? "ok" : e.trend.kind === "declining" ? "warn" : "mute"}`}>{CONF[e.trend.confidence]}</span> {e.trend.text}</span>}
                  {total > 0 && <span className="muted">Objetivos de REPI (28 días): {t.accepted} hechos como se propuso · {t.modified} con otra carga o reps · {t.not_done} sin hacer</span>}
                  {p && (
                    <div className="ti-proposal" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 10, background: "var(--ui-surface-2)", border: "1px solid var(--ui-divider)" }}>
                      <span><span className="chip info">{KIND[p.kind] ?? "Propuesta"}</span> {p.text}</span>
                      <small className="muted">{p.basis} Decidir no cambia la rutina: aceptar sólo registra tu decisión. Para aplicarla, revisala en el editor y guardá el programa.</small>
                      {p.status !== "open" && <small><span className="chip mute">{DECIDED[p.status] ?? p.status}</span> Vuelve a proponerse con la próxima sesión registrada.</small>}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {onReview && programId && (p.status === "open" || p.status === "accepted") && <button type="button" className="btn sm pri" onClick={() => onReview({ kind, relId, programId, proposalId: p.id, exerciseId: e.exerciseId, name: e.name, text: p.text, weightKg: p.weightKg })}>Revisar en el editor</button>}
                        {p.status === "open" && <>
                        <button type="button" className="btn sm" disabled={busy === p.id} onClick={() => void decide(p.id, "accepted")}>Aceptar (sin aplicar)</button>
                        <button type="button" className="btn sm" disabled={busy === p.id} onClick={() => void decide(p.id, "kept")}>Mantener programación</button>
                        <button type="button" className="btn sm" disabled={busy === p.id} onClick={() => void decide(p.id, "rejected")}>Rechazar</button>
                        </>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
