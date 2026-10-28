"use client";
// REPI Connect del socio (D126): pedir ayuda al equipo de sala en pocos toques y seguir el estado real del pedido.
// Sin tiempos de respuesta inventados ni presencia de profesores: sólo el estado que registró el equipo.
import { useEffect, useRef, useState } from "react";
import { CONNECT_EXERCISE_REASONS, CONNECT_REASONS, CONNECT_SAFETY, mentionsRisk, type ConnectReason } from "@repi/domain";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";

export type ConnectContext = { sessionId: string; programExerciseId: string; exerciseId: string; exerciseName: string; setIndex: number | null };
type Req = {
  id: string; ref: string; label: string; exercise: string | null; comment: string | null; state: string; stateLabel: string; assignee: string | null;
  createdAt: string; completedAt: string | null; dueAt: string | null; canCancel: boolean; feedback: string | null; canFeedback: boolean; unseen: boolean;
};
type Board = { enabled: false; requests: [] } | { enabled: true; place: string; requests: Req[] };
type Detail = {
  id: string; ref: string; label: string; exercise: string | null; state: string; stateLabel: string; canCancel: boolean; canComment: boolean;
  feedback: string | null; canFeedback: boolean; timeline: { at: string; text: string; note?: string | null }[];
};

const TONE: Record<string, string> = { pendiente: "#94A3B8", asignada: "#00D1FF", transferida: "#00D1FF", en_atencion: "#5DE6D8", seguimiento: "#F59E0B", resuelta: "#10B981", cancelada: "#64748B" };
const hm = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const ACTIVE = ["pendiente", "asignada", "transferida", "en_atencion", "seguimiento"];

/** Pedido al equipo de sala. Desde un ejercicio adjunta la referencia; sin ejercicio sale desde Inicio. */
export function ConnectHelpSheet({ place, context, coachName, onCoach, onClose, onSent, flash }: {
  place: string; context?: ConnectContext | null; coachName?: string | null; onCoach?: () => void; onClose: () => void; onSent?: () => void; flash: (t: string) => void;
}) {
  const reasons = (context ? CONNECT_EXERCISE_REASONS : (Object.keys(CONNECT_REASONS) as ConnectReason[]));
  const [reason, setReason] = useState<ConnectReason | null>(context ? "ejercicio" : null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID()); // mismo pedido aunque se reintente por falta de red
  const gymName = place.split(" · ")[0];
  const ready = !!reason && (reason !== "otro" || comment.trim().length >= 3);
  const submit = async () => {
    if (!reason) { flash("Elegí qué necesitás."); return; }
    if (!ready) { flash("Contá brevemente qué necesitás."); return; }
    if (!navigator.onLine) { flash("Sin conexión: el pedido necesita internet. Si es algo del momento, avisá en persona."); return; }
    setBusy(true);
    try {
      const r = await api<{ duplicate: boolean; ref: string }>("/api/me/gym/connect", { body: {
        reason, comment: comment.trim() || null, clientKey: key.current,
        context: context ? { sessionId: context.sessionId, programExerciseId: context.programExerciseId, exerciseId: context.exerciseId, setIndex: context.setIndex } : null,
      } });
      flash(r.duplicate ? "Ya tenés este pedido abierto. Lo ves en «Mis pedidos»." : `Pedido enviado al equipo de sala de ${gymName}. Seguí el estado en «Mis pedidos».`);
      onSent?.();
      onClose();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Pedir ayuda" sub={context ? `Sobre ${context.exerciseName}${context.setIndex != null ? ` · serie ${context.setIndex + 1}` : ""}. Le llega al equipo de sala de ${gymName}.` : `Le llega al equipo de sala de ${gymName}. No incluye tus mensajes con tu coach.`}
      closeLabel="Cancelar" onClose={onClose}
      groups={[
        ...(coachName && onCoach ? [{ label: "Para", opts: [["gym", `Equipo de sala · ${gymName}`], ["coach", `${coachName.split(" ")[0]} · tu coach`]] as [string, string][], value: "gym", onPick: (x: string | number) => { if (x === "coach") onCoach(); } }] : []),
        { label: "¿Qué necesitás?", opts: reasons.map((r) => [r, CONNECT_REASONS[r].label] as [string, string]), value: reason, onPick: (x) => setReason(x as ConnectReason) },
      ]}
      warn={mentionsRisk(comment) ? `${CONNECT_SAFETY} No hace falta que cuentes detalles de salud en el pedido.` : null}
      text={{ value: comment, onChange: (v) => setComment(v.slice(0, 300)), placeholder: reason === "otro" ? "Contá qué necesitás" : "Comentario breve (opcional)" }}
      action={{ label: "Enviar pedido", ready, busy, onSubmit: submit }}>
      {!mentionsRisk(comment) && <p className="sheet-sub cx-safety">{CONNECT_SAFETY}</p>}
    </Sheet>
  );
}

/** Tarjeta en Inicio con los pedidos activos y el último resultado sin ver. */
export function ConnectCard({ onOpen, refresh }: { onOpen: (id?: string) => void; refresh: number }) {
  const [b, setB] = useState<Board | null>(null);
  useEffect(() => { api<Board>("/api/me/gym/connect").then(setB).catch(() => setB(null)); }, [refresh]);
  if (!b?.enabled) return null;
  const active = b.requests.filter((r) => ACTIVE.includes(r.state));
  const news = b.requests.filter((r) => r.unseen);
  if (!active.length && !news.length) return null;
  const top = news[0] ?? active[0];
  return (
    <button type="button" className="hbanner cx-card" onClick={() => onOpen(news[0]?.id)}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: TONE[top.state] ?? "#00D1FF", flex: "none" }} />
      <span><b>{news.length ? (top.state === "resuelta" ? "Tu pedido fue resuelto" : "Tu pedido se cerró") : active.length === 1 ? `Tu pedido: ${top.stateLabel.toLowerCase()}` : `${active.length} pedidos en curso`}</b>
        <small>{top.label}{top.exercise ? ` · ${top.exercise}` : ""}{top.assignee && top.state !== "pendiente" ? ` · ${top.assignee}` : ""}</small></span>
      <em>Ver</em>
    </button>
  );
}

/** «Mis pedidos»: lista, detalle con línea de tiempo, cancelar, comentar y «¿Te sirvió?». */
export function ConnectPanelSheet({ initialId, onClose, flash, onNew }: { initialId?: string | null; onClose: () => void; flash: (t: string) => void; onNew: () => void }) {
  const [b, setB] = useState<Board | null>(null);
  const [open, setOpen] = useState<string | null>(initialId ?? null);
  const [d, setD] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const loadList = () => api<Board>("/api/me/gym/connect").then(setB).catch((e) => flash((e as Error).message));
  const loadOne = (id: string) => api<Detail>(`/api/me/gym/connect/${id}`).then(setD).catch((e) => { flash((e as Error).message); setOpen(null); });
  useEffect(() => { void loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setD(null); setText(""); if (open) void loadOne(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (k: string, url: string, body: object, ok: string) => {
    setBusy(k);
    try { await api(url, { body }); flash(ok); if (open) await loadOne(open); await loadList(); } catch (e) { flash((e as Error).message); } finally { setBusy(null); }
  };
  if (open) {
    return (
      <Sheet title={d ? d.label : "Pedido"} sub={d ? `${d.ref}${d.exercise ? ` · ${d.exercise}` : ""} · ${d.stateLabel}` : "Cargando…"} closeLabel="Volver" onClose={() => setOpen(null)}>
        {d && <>
          <ol className="cx-time" aria-label="Historial del pedido">
            {d.timeline.map((x, i) => (
              <li key={i}><span className="cx-dot" style={{ background: i === d.timeline.length - 1 ? TONE[d.state] ?? "#00D1FF" : "#334155" }} />
                <span><b>{x.text}</b><small>{hm(x.at)}</small>{x.note && <q>{x.note}</q>}</span></li>
            ))}
          </ol>
          {d.canFeedback && (
            <div className="cx-fb"><b>¿Te sirvió la ayuda?</b><small>Es opcional. Lo usa el gym para mejorar el servicio.</small>
              <span><button type="button" className="cta sm" aria-busy={busy === "yes" || undefined} onClick={() => act("yes", `/api/me/gym/connect/${d.id}/feedback`, { helpful: true }, "¡Gracias por contarnos!")}>Sí</button>
                <button type="button" className="ghost sm" aria-busy={busy === "no" || undefined} onClick={() => act("no", `/api/me/gym/connect/${d.id}/feedback`, { helpful: false }, "Gracias. El equipo lo va a tener en cuenta.")}>No</button></span>
            </div>
          )}
          {d.canComment && (
            <div className="cx-comment">
              <textarea rows={2} value={text} maxLength={300} placeholder="Agregar un comentario para el equipo" aria-label="Agregar un comentario para el equipo" onChange={(e) => setText(e.target.value)} />
              {mentionsRisk(text) && <p className="sheet-warn" role="note">{CONNECT_SAFETY}</p>}
              <button type="button" className="ghost sm" disabled={text.trim().length < 2} aria-busy={busy === "c" || undefined}
                onClick={() => act("c", `/api/me/gym/connect/${d.id}/comment`, { text }, "Comentario agregado.").then(() => setText(""))}>Enviar comentario</button>
            </div>
          )}
          {d.canCancel && <button type="button" className="linkbtn cx-cancel" aria-busy={busy === "x" || undefined}
            onClick={() => { if (window.confirm("¿Cancelar este pedido? El equipo deja de verlo como pendiente.")) void act("x", `/api/me/gym/connect/${d.id}/cancel`, {}, "Pedido cancelado."); }}>Cancelar pedido</button>}
        </>}
      </Sheet>
    );
  }
  const reqs = b?.enabled ? b.requests : [];
  return (
    <Sheet title="Mis pedidos" sub={b?.enabled ? `Equipo de sala · ${b.place}. Ves el estado que registra el equipo.` : "Cargando…"} onClose={onClose}
      action={{ label: "Nuevo pedido", ready: true, onSubmit: onNew }}>
      {b && !reqs.length && <p className="sheet-sub">Todavía no hiciste pedidos al equipo de sala.</p>}
      <ul className="cx-list">
        {reqs.map((r) => (
          <li key={r.id}><button type="button" onClick={() => setOpen(r.id)}>
            <span className="cx-dot" style={{ background: TONE[r.state] ?? "#00D1FF" }} />
            <span><b>{r.label}{r.exercise ? ` · ${r.exercise}` : ""}</b>
              <small>{r.stateLabel}{r.assignee && !["pendiente", "transferida"].includes(r.state) ? ` · ${r.assignee}` : ""} · {hm(r.createdAt)}</small></span>
            {r.unseen && <i className="cx-new">Nuevo</i>}
          </button></li>
        ))}
      </ul>
    </Sheet>
  );
}
