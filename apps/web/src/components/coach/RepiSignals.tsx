"use client";
// D209 · «Señales de REPI» para quien programa al alumno: el coach privado (ficha → Rendimiento) y el equipo de sala o
// coordinación con permiso para su programa (ficha del socio en Gym). Es el análisis de REPI sobre lo registrado en ESA relación
// (GET …/brain): dificultad creciente, rechazos, propuestas y pedidos pendientes. Nunca la conversación ni la memoria del alumno
// con REPI, ni sus textos: sólo cantidades y evidencia. No calcula nada: muestra lo que devuelve el servidor.
// Las propuestas de Training Intelligence se deciden en su sección (abajo); los pedidos del alumno, que esa sección no lista,
// se revisan en el editor de siempre (ProposalDraft) y se deciden con las mismas rutas. Decidir nunca cambia el programa.
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { CoachInsight, InsightsView, PendingItem } from "@/server/brain/coach";
import { PROPOSAL_KIND } from "./CoachIntelligence";
import type { TiDraft } from "./ProposalDraft";

type Failure = { status: number; code: string; message: string };
type Decision = "accepted" | "kept" | "rejected";
const ORIGIN: Record<CoachInsight["kind"], "calc" | "data"> = {
  difficulty_rising: "calc", rejected_substitutions: "data", rejected_recommendations: "data", pending_proposals: "data", student_requests: "data",
};
const ORIGIN_TEXT = { calc: "Calculado por REPI", data: "Dato registrado" } as const;
const ASK: Record<Decision, { verb: string; preview: string; done: string }> = {
  accepted: { verb: "Aceptar (sin aplicar)", preview: "Queda registrado que lo aceptás. El programa no cambia: para aplicarlo, revisalo en el editor y guardá.", done: "Pedido aceptado. El programa todavía no cambió." },
  kept: { verb: "Mantener programación", preview: "Queda registrado que mantenés lo programado. El programa no cambia.", done: "Se mantiene la programación. El programa no cambió." },
  rejected: { verb: "Rechazar", preview: "Queda registrado que lo rechazás. El programa no cambia.", done: "Pedido rechazado. El programa no cambió." },
};

/** Carga con el estado del error (403/404 se tratan aparte: en la sala no se insinúa nada privado). */
function useSignals(url: string) {
  const [data, setData] = useState<InsightsView | null>(null);
  const [fail, setFail] = useState<Failure | null>(null);
  const load = useCallback(async () => {
    try { setFail(null); setData(await api<InsightsView>(url)); }
    catch (e) { const a = e instanceof ApiError ? e : null; setFail({ status: a?.status ?? 0, code: a?.code ?? "network", message: (e as Error).message }); }
  }, [url]);
  useEffect(() => { setData(null); void load(); }, [load]);
  return { data, fail, reload: load };
}

export function RepiSignals({ load, kind, relId, programId, decideUrl, onReview, quietDenied = false, refresh = 0 }: {
  load: string; kind: TiDraft["kind"]; relId: string; programId: string | null;
  decideUrl: (proposalId: string) => string;
  /** Abre el editor de programas de siempre con el pedido a la vista (no lo aplica). */
  onReview?: (d: TiDraft) => void;
  /** Sala: ante 403/404 (sin permiso, otra sede, sin consentimiento) no se muestra nada. */
  quietDenied?: boolean;
  /** Cambia cuando Training Intelligence cargó o decidió algo (abre y cierra propuestas): se vuelve a leer sin vaciar la sección. */
  refresh?: number;
}) {
  const { data, fail, reload } = useSignals(load);
  useEffect(() => { if (refresh > 0) void reload(); }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const [msg, setMsg] = useState<string | null>(null);
  const hid = `rs-h-${relId}`;
  const where = kind === "coach" ? "con vos" : "en esta sede";
  if (fail && quietDenied && (fail.status === 403 || fail.status === 404)) return null;
  const head = (
    <div className="rs-head">
      <h2 id={hid}>Señales de REPI</h2>
      <span className="rs-tag">Análisis de REPI</span>
    </div>
  );
  if (fail) {
    const offline = fail.status === 0 && typeof navigator !== "undefined" && !navigator.onLine;
    return (
      <section className="card rs" aria-labelledby={hid}>
        {head}
        <p className="rs-note" role="status">
          {fail.status === 403 || fail.status === 404 ? fail.message
            : offline ? "Sin conexión: las señales de REPI se cargan cuando vuelva."
              : "No pudimos cargar las señales de REPI ahora. Lo demás de la ficha sigue igual."}
        </p>
        {fail.status !== 403 && fail.status !== 404 && <button type="button" className="btn sm rs-retry" onClick={() => void reload()}>Reintentar</button>}
      </section>
    );
  }
  if (!data) return <section className="card rs" aria-labelledby={hid} aria-busy="true">{head}<p className="muted">Cargando señales de REPI…</p></section>;
  return (
    <section className="card rs" aria-labelledby={hid}>
      {head}
      <p className="rs-sub">Lo que REPI ve en lo que registró {where} en los últimos {data.windowDays} días. No es su conversación ni su memoria con REPI: eso es privado.</p>
      <p className="rs-status" role="status">{msg}</p>
      {!data.insights.length ? (
        <div className="empty">Sin señales para revisar: no hay dificultad creciente, rechazos repetidos ni propuestas pendientes en este período.</div>
      ) : (
        <ul className="rs-list">
          {data.insights.map((i) => (
            <li key={i.kind} className="rs-item">
              <span className="rs-n" aria-hidden="true">{i.count}</span>
              <div className="rs-body">
                <p className="rs-text">{i.text}</p>
                <span className="rs-origin" data-o={ORIGIN[i.kind]}>{ORIGIN_TEXT[ORIGIN[i.kind]]}</span>
                {i.kind === "student_requests" && Object.keys(data.counts.studentRequests).length > 0 && (
                  <span className="rs-kinds">{Object.entries(data.counts.studentRequests).map(([k, n]) => <span key={k} className="chip mute">{PROPOSAL_KIND[k] ?? "Otro"}: {n}</span>)}</span>
                )}
                <details className="rs-why"><summary>¿Por qué?</summary><p>{i.evidence.basis}</p></details>
                {i.kind === "pending_proposals" && !!i.refs?.items?.length && (
                  <Pending items={i.refs.items} kind={kind} relId={relId} programId={programId} decideUrl={decideUrl} onReview={onReview}
                    onDone={(t) => { setMsg(t); void reload(); }} onFail={setMsg} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <details className="rs-excluded">
        <summary>Qué no incluye</summary>
        <ul>{data.notIncluded.map((x) => <li key={x}>{x}</li>)}</ul>
      </details>
    </section>
  );
}

function Pending({ items, kind, relId, programId, decideUrl, onReview, onDone, onFail }: {
  items: PendingItem[]; kind: TiDraft["kind"]; relId: string; programId: string | null; decideUrl: (id: string) => string;
  onReview?: (d: TiDraft) => void; onDone: (t: string) => void; onFail: (t: string) => void;
}) {
  const [ask, setAsk] = useState<{ id: string; status: Decision } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toTi = () => {
    const h = document.getElementById(`ti-h-${relId}`);
    if (!h) return;
    h.scrollIntoView({ behavior: "smooth", block: "start" });
    h.focus({ preventScroll: true });
  };
  /** Al cancelar, el foco vuelve a las acciones del mismo pedido (no se pierde en la página). */
  const refocus = (id: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-rs-prop="${CSS.escape(id)}"] .rs-acts button`)?.focus());
  const decide = async (id: string, status: Decision) => {
    setBusy(id);
    try { await api(decideUrl(id), { body: { status } }); setAsk(null); onDone(ASK[status].done); }
    catch (e) { onFail((e as Error).message); }
    finally { setBusy(null); }
  };
  return (
    <ul className="rs-props" aria-label="Propuestas pendientes">
      {items.map((it) => {
        const name = it.exerciseName ?? "Ejercicio del programa";
        const open = ask?.id === it.proposalId ? ask : null;
        return (
          <li key={it.proposalId} className="rs-prop" data-rs-prop={it.proposalId}>
            <div className="rs-prop-h">
              <span><b>{name}</b> · {PROPOSAL_KIND[it.kind] ?? "Propuesta"}</span>
              <span className={`chip ${it.source === "student" ? "info" : "mute"}`}>{it.source === "student" ? "Pedido del alumno" : "Training Intelligence"}</span>
            </div>
            {it.source === "ti" ? (
              <div className="rs-acts"><button type="button" className="btn sm" onClick={toTi}>Ver en Training Intelligence</button></div>
            ) : open ? (
              <div className="rs-confirm" role="group" aria-label={`${ASK[open.status].verb}: ${name}`}>
                <span>{ASK[open.status].preview}</span>
                <div className="rs-acts">
                  {/* El botón que abrió la confirmación desaparece: el foco pasa a «Confirmar». */}
                  <button type="button" className="btn sm pri" autoFocus aria-busy={busy === it.proposalId || undefined} disabled={busy === it.proposalId} onClick={() => void decide(it.proposalId, open.status)}>Confirmar</button>
                  <button type="button" className="btn sm" onClick={() => { setAsk(null); refocus(it.proposalId); }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="rs-acts">
                {onReview && programId && (
                  <button type="button" className="btn sm pri" onClick={() => onReview({
                    kind, relId, programId, proposalId: it.proposalId, exerciseId: it.exerciseId, name, weightKg: null, source: "student",
                    text: `Tu alumno pidió revisar ${PROPOSAL_KIND[it.kind]?.toLowerCase() ?? "este ejercicio"} desde REPI. Vos decidís si cambia algo.`,
                  })}>Revisar en el editor</button>
                )}
                {(["accepted", "kept", "rejected"] as const).map((s) => <button key={s} type="button" className="btn sm" onClick={() => setAsk({ id: it.proposalId, status: s })}>{ASK[s].verb}</button>)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
