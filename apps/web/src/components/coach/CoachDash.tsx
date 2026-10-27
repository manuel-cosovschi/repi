"use client";
import { fmtDate, type Overview, type Screen } from "./types";

const greet = () => { const h = Number(new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", hour12: false }).format(new Date())); return h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches"; };

export function CoachDash({ ov, first, onInvite, onNewProgram, go }: {
  ov: Overview; first: string; onInvite: () => void; onNewProgram: () => void; go: (s: Screen, e?: { sel?: string; pid?: string | null }) => void;
}) {
  const today = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const k = ov.kpis;
  const kpis: [string, string, string, () => void][] = [
    ["Clientes activos", String(k.active), `${ov.clients.length} con relación vigente`, () => go("clients")],
    ["Sin programa", String(k.noProgram), "Clientes activos sin asignación", () => go("clients")],
    ["Sesiones esta semana", String(k.weekSessions), "Completadas, lunes a domingo", () => go("clients")],
    ["Adherencia media", k.adherence == null ? "—" : `${k.adherence}%`, "Sesiones hechas ÷ días del programa", () => go("clients")],
  ];
  const todos = [
    ...ov.clients.filter((c) => c.status === "active" && !c.program).map((c) => ({ t: `${c.name} no tiene programa`, d: "Asignale uno para que lo vea en su app", dot: "#00D1FF", cta: "Asignar programa", go: () => go("builder") })),
    ...ov.clients.filter((c) => c.program && c.adherence === 0).map((c) => ({ t: `${c.name} no entrenó esta semana`, d: `Programa: ${c.program!.name}`, dot: "#F59E0B", cta: "Ver ficha", go: () => go("clients", { sel: c.id }) })),
    ...(k.pendingInvites ? [{ t: `${k.pendingInvites} ${k.pendingInvites === 1 ? "invitación pendiente" : "invitaciones pendientes"}`, d: "Esperando que la persona acepte en su app", dot: "#5DE6D8", cta: "Invitar otra", go: onInvite }] : []),
  ];
  return (
    <>
      <div className="co-head">
        <div><span className="co-kicker">{today.charAt(0).toUpperCase() + today.slice(1)}</span><h1 tabIndex={-1}>{greet()}, {first}</h1></div>
        <div className="co-actions"><button type="button" className="btn" onClick={onInvite}>Invitar cliente</button><button type="button" className="btn pri" onClick={onNewProgram}>Nuevo programa</button></div>
      </div>
      {ov.org.status === "trial" && (
        <div className="banner"><span><strong>Estás en período de prueba.</strong>{ov.org.trialEndsAt ? ` Termina el ${fmtDate(ov.org.trialEndsAt, { day: "numeric", month: "long" })}.` : ""} Tus condiciones (alumnos vigentes acordados y precio) están en «Condiciones REPI».</span></div>
      )}
      <div className="grid-kpi">
        {kpis.map(([l, v, sub, fn]) => <button type="button" key={l} className="kpi" onClick={fn}><span>{l}</span><strong>{v}</strong><small>{sub}</small></button>)}
      </div>
      <div className="grid-2">
        <section className="card" style={{ gap: 6 }}>
          <h2 style={{ marginBottom: 6 }}>Pendientes</h2>
          {todos.map((t) => (
            <div key={t.t} className="todo"><span className="dot" style={{ background: t.dot }} /><span><b>{t.t}</b><small>{t.d}</small></span><button type="button" className="btn sm" onClick={t.go}>{t.cta}</button></div>
          ))}
          {!todos.length && <span className="muted" style={{ fontSize: 14, padding: "12px 0" }}>Todo al día.</span>}
        </section>
        <section className="card" style={{ gap: 6 }}>
          <h2 style={{ marginBottom: 6 }}>Agenda de hoy</h2>
          <span className="muted" style={{ fontSize: 14 }}>El calendario y la asistencia presencial todavía no están disponibles (F-CO-10).</span>
        </section>
      </div>
    </>
  );
}
