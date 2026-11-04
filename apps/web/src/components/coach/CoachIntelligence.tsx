"use client";
// D191 · Training Intelligence en la ficha del alumno (pestaña Rendimiento). Tendencia por ejercicio del programa, objetivos de
// REPI y cómo se resolvieron, y propuestas para la próxima programación. Decidir sobre una propuesta NO cambia la rutina: para
// aplicar un cambio, el coach edita el programa como siempre (crea la versión nueva con su autoría).
import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/components/gym/shared";

type Trend = { kind: string; confidence: "none" | "possible" | "consistent"; sessions: number; text: string };
type Ex = {
  exerciseId: string; name: string; prescribed: string;
  last: { at: string; sets: { w: number | null; r: number | null; rir: number | null; kind: string | null; stage: number | null }[] } | null;
  trend: Trend | null; targets: { accepted: number; modified: number; not_done: number };
  proposal: { id: string; status: string; kind: string; text: string; weightKg: number | null; requiresCoach: boolean; basis: string } | null;
};
type View = { formula: string; exercises: Ex[]; adherence: { sessions28d: number } | null };
const CONF: Record<Trend["confidence"], string> = { none: "datos insuficientes", possible: "tendencia posible", consistent: "tendencia consistente" };
const KIND: Record<string, string> = { load: "Carga", reps: "Repeticiones", hold: "Mantener", review: "Revisar", deload: "Posible descarga", rest: "Descanso" };
const kg = (n: number | null) => (n == null ? "" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} kg`);

export function IntelSection({ orgId, relId }: { orgId: string; relId: string }) {
  const d = useLoad<View>(`/api/coach/${orgId}/clients/${relId}/intelligence`);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (d.err) return <p role="alert" className="err-box">{d.err}</p>;
  if (!d.data) return <p className="muted">Cargando Training Intelligence…</p>;
  const { exercises, formula, adherence } = d.data;
  const decide = async (id: string, status: "accepted" | "rejected" | "kept") => {
    setBusy(id); setMsg(null);
    try {
      await api(`/api/coach/${orgId}/proposals/${id}`, { body: { status } });
      setMsg(status === "accepted" ? "Propuesta aceptada. La rutina no cambió: aplicala editando el programa en Rutinas." : status === "rejected" ? "Propuesta rechazada." : "Se mantiene la programación original.");
      await d.reload();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <section className="card" aria-labelledby="ti-h">
      <h2 id="ti-h">Training Intelligence</h2>
      <span className="muted" style={{ fontSize: 13 }}>{formula}{adherence ? ` Entrenamientos completados con vos en 28 días: ${adherence.sessions28d}.` : ""}</span>
      {msg && <p role="status" style={{ fontSize: 13, margin: 0 }}>{msg}</p>}
      {!exercises.length ? <div className="empty">Sin programa activo o sin series registradas todavía.</div> : (
        <div className="table">
          {exercises.map((e) => {
            const t = e.targets, total = t.accepted + t.modified + t.not_done;
            const last = e.last?.sets.filter((x) => (x.stage ?? 0) === 0 && x.kind !== "warmup") ?? [];
            return (
              <div key={e.exerciseId} className="trow" style={{ alignItems: "flex-start" }}>
                <b style={{ flex: "1 1 180px" }}>{e.name}<small className="muted" style={{ display: "block", fontWeight: 400 }}>Programado: {e.prescribed}</small>
                  {last.length > 0 && <small className="muted" style={{ display: "block", fontWeight: 400 }}>Última: {last.map((x) => `${x.w ? `${kg(x.w)} × ` : ""}${x.r ?? "—"}${x.rir != null ? ` (RIR ${x.rir})` : ""}`).join(" · ")}</small>}</b>
                <div style={{ flex: "2 1 240px", display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  {e.trend && <span><span className={`chip ${e.trend.kind === "progressing" ? "ok" : e.trend.kind === "declining" ? "warn" : "mute"}`}>{CONF[e.trend.confidence]}</span> {e.trend.text}</span>}
                  {total > 0 && <span className="muted">Objetivos de REPI (28 días): {t.accepted} hechos como se propuso · {t.modified} con otra carga o reps · {t.not_done} sin hacer</span>}
                  {e.proposal && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 10, background: "var(--ui-surface-2)", border: "1px solid var(--ui-divider)" }}>
                      <span><span className="chip info">{KIND[e.proposal.kind] ?? "Propuesta"}</span> {e.proposal.text}</span>
                      <small className="muted">{e.proposal.basis} No se aplica sola.</small>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" className="btn sm pri" disabled={busy === e.proposal.id} onClick={() => void decide(e.proposal!.id, "accepted")}>Aceptar</button>
                        <button type="button" className="btn sm" disabled={busy === e.proposal.id} onClick={() => void decide(e.proposal!.id, "kept")}>Mantener programación</button>
                        <button type="button" className="btn sm" disabled={busy === e.proposal.id} onClick={() => void decide(e.proposal!.id, "rejected")}>Rechazar</button>
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
