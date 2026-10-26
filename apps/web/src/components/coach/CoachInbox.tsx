"use client";
// Solicitudes del coach (REPI Desktop Coach.dc.html · sc.inbox): pedidos, molestias y check-ins, accesos e invitaciones.
import { useCallback, useEffect, useState } from "react";
import { PAIN_CONTEXT, PAIN_WARN_LEVEL, REQUEST_KIND, type RequestKind } from "@repi/domain";
import { api } from "@/lib/api";
import { fmtDate, type Screen } from "./types";

type Inbox = {
  requests: { id: string; relId: string; member: string; kind: RequestKind; text: string; status: "open" | "done"; createdAt: string; videoId: string | null; videoDeleted: boolean }[];
  pains: { id: string; relId: string; member: string; zone: string; level: number; context: keyof typeof PAIN_CONTEXT; exerciseName: string | null; note: string | null; createdAt: string; shared: boolean }[];
  checkins: { id: string; relId: string; member: string; date: string; energy: number; sleep: number; mood: number }[];
  access: { id: string; relId: string; member: string; label: string; status: "pending" | "granted" | "denied" | "expired"; createdAt: string }[];
  invitations: { id: string; code: string; email: string | null; expiresAt: string }[];
};
export const ACCESS_ST: Record<string, [string, string]> = {
  pending: ["Solicitud enviada · esperando respuesta", "warn"], granted: ["Acceso concedido", "ok"], denied: ["Rechazada por el alumno", "bad"], expired: ["Venció sin respuesta", "mute"],
};
const when = (iso: string) => fmtDate(iso, { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function CoachInbox({ orgId, flash, go, onChanged }: { orgId: string; flash: (t: string) => void; go: (s: Screen, e?: { sel?: string }) => void; onChanged: () => void }) {
  const [d, setD] = useState<Inbox | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<Inbox>(`/api/coach/${orgId}/inbox`).then(setD).catch((e) => setErr(e.message)), [orgId]);
  useEffect(() => { load().then(onChanged); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const resolve = async (id: string) => {
    try { await api(`/api/coach/${orgId}/requests/${id}/resolve`, { body: {} }); flash("Pedido marcado como resuelto. Le avisamos en su app."); await load(); onChanged(); }
    catch (e) { flash((e as Error).message); }
  };
  return (
    <>
      <div className="co-head"><div><span className="co-kicker">Pedidos, molestias e invitaciones que llegan desde la app de tus alumnos</span><h1 tabIndex={-1}>Solicitudes</h1></div></div>
      {err && <p role="alert" className="err-box">{err}</p>}
      {!d ? <p className="muted">Cargando…</p> : (
        <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))" }}>
          <section className="card">
            <h2>Pedidos de alumnos</h2>
            {d.requests.map((r) => (
              <div key={r.id} style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, opacity: r.status === "done" ? .65 : 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="chip info">{REQUEST_KIND[r.kind]}</span><b style={{ fontSize: 13 }}>{r.member}</b><span className="muted">{when(r.createdAt)}</span>
                  {r.status === "done" && <span className="chip ok">Resuelto</span>}
                </div>
                <span style={{ fontSize: 14, lineHeight: 1.45 }}>{r.text}</span>
                {r.videoDeleted && <span className="muted">Video eliminado: se borra 90 días después de resolver el pedido.</span>}
                {r.videoId && <video src={`/api/media/${r.videoId}`} controls preload="metadata" style={{ width: "100%", maxHeight: 260, borderRadius: 10, background: "#0B0F14" }} aria-label={`Video de técnica de ${r.member}`} />}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r.status === "open" && <button type="button" className="btn sm" onClick={() => resolve(r.id)}>Marcar resuelto</button>}
                  {r.kind === "programa" && r.status === "open" && <button type="button" className="btn sm pri" onClick={() => go("builder")}>Asignar programa</button>}
                  <button type="button" className="btn sm" onClick={() => go("clients", { sel: r.relId })}>Ver ficha</button>
                </div>
              </div>
            ))}
            {!d.requests.length && <span className="muted" style={{ fontSize: 14 }}>Sin pedidos. Llegan cuando un alumno toca "Pedir ayuda" en la app.</span>}
          </section>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="card">
              <h2>Molestias y check-ins recientes</h2>
              {d.pains.map((p) => (
                <button key={p.id} type="button" className="trow" style={{ border: 0, borderBottom: "1px solid #EEF2F6", background: "none", textAlign: "left", cursor: "pointer", width: "100%", font: "inherit", color: "inherit" }} onClick={() => go("clients", { sel: p.relId })}>
                  <span className="dot" style={{ background: p.level >= 4 ? "#F59E0B" : "#5DE6D8" }} />
                  <span style={{ flex: 1 }}><b>{p.member} · {p.zone} {p.level}/10</b> · {p.exerciseName ?? PAIN_CONTEXT[p.context]}{p.note ? ` · “${p.note}”` : ""}{p.shared ? " · compartida sólo este reporte" : ""}{p.level >= PAIN_WARN_LEVEL ? " · intensidad alta" : ""}</span>
                  <span className="muted">{when(p.createdAt)}</span>
                </button>
              ))}
              {d.checkins.map((c) => (
                <div key={c.id} className="trow"><span className="dot" style={{ background: "#9BB0C4" }} /><span style={{ flex: 1 }}><b>{c.member}</b> · check-in: energía {c.energy}/5 · sueño {c.sleep}/5 · ánimo {c.mood}/5</span><span className="muted">{c.date.split("-").reverse().slice(0, 2).join("/")}</span></div>
              ))}
              {!d.pains.length && !d.checkins.length && <span className="muted" style={{ fontSize: 14 }}>Nada nuevo desde la app. Las molestias sólo aparecen si el alumno compartió su salud o ese reporte.</span>}
            </section>
            <section className="card">
              <h2>Accesos a datos</h2>
              {d.access.map((a) => (
                <div key={a.id} className="trow"><span style={{ flex: 1 }}>{a.member} · {a.label}</span><span className={`chip ${ACCESS_ST[a.status][1]}`}>{ACCESS_ST[a.status][0]}</span></div>
              ))}
              {!d.access.length && <span className="muted" style={{ fontSize: 14 }}>Sin solicitudes enviadas.</span>}
            </section>
            <section className="card">
              <h2>Invitaciones</h2>
              {d.invitations.map((i) => (
                <div key={i.id} className="trow"><span style={{ flex: "1 1 160px" }}>{i.email ?? "Enlace sin email"}</span><span style={{ font: "600 13px var(--font-mono)", color: "#006B88" }}>{i.code}</span><span className="chip warn">Pendiente · vence {fmtDate(i.expiresAt)}</span>
                  {i.email && <button type="button" className="btn sm" onClick={async () => { try { await api("/api/access/invitations/resend", { body: { id: i.id } }); flash(`Invitación reenviada a ${i.email}. La anterior ya no sirve.`); await load(); } catch (e) { flash((e as Error).message); } }}>Reenviar</button>}</div>
              ))}
              {!d.invitations.length && <span className="muted" style={{ fontSize: 14 }}>No hay invitaciones pendientes.</span>}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
