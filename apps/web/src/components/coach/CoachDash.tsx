"use client";
import { Hint } from "@/components/member/Hint";
import { fmtDate, type Overview, type Screen } from "./types";
import { TodayAgenda } from "./CoachAgenda";
import { useLoad } from "@/components/gym/shared";
import type { PendingSignals } from "@/server/brain/coach";
import { featureOn } from "@/lib/features";

/** D210: como mucho tres alumnos con propuestas de REPI por revisar; el resto se resume en una línea. */
const MAX_REPI_LINES = 3;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const greet = () => { const h = Number(new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", hour12: false }).format(new Date())); return h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches"; };

export function CoachDash({ orgId, ov, first, onInvite, onNewProgram, go }: {
  orgId: string; ov: Overview; first: string; onInvite: () => void; onNewProgram: () => void; go: (s: Screen, e?: { sel?: string; pid?: string | null; tab?: "rend" }) => void;
}) {
  // D210: propuestas abiertas y pedidos del alumno desde REPI (sólo cantidades). Si no carga, «Pendientes» sigue como siempre.
  // Con el Asistente REPI apagado (flag `assistant`) no se pide ni se muestra nada.
  const repi = useLoad<PendingSignals>(featureOn("assistant") ? `/api/coach/${orgId}/brain` : null).data;
  const today = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const k = ov.kpis;
  const kpis: [string, string, string, () => void][] = [
    ["Clientes activos", String(k.active), `${ov.clients.length} con relación vigente`, () => go("clients")],
    ["Sin programa", String(k.noProgram), "Clientes activos sin asignación", () => go("clients")],
    ["Sesiones esta semana", String(k.weekSessions), "Completadas, lunes a domingo", () => go("clients")],
    ["Adherencia media", k.adherence == null ? "—" : `${k.adherence}%`, "Sesiones hechas ÷ días del programa", () => go("clients")],
  ];
  const todos = [
    ...ov.clients.filter((c) => c.status === "active" && !c.program).map((c) => ({ t: `${c.name} no tiene programa`, d: "Asignale uno para que lo vea en su app", dot: "var(--ui-accent)", cta: "Asignar programa", go: () => go("builder") })),
    ...ov.clients.filter((c) => c.program && c.adherence === 0).map((c) => ({ t: `${c.name} no entrenó esta semana`, d: `Programa: ${c.program!.name}`, dot: "var(--ui-warning)", cta: "Ver ficha", go: () => go("clients", { sel: c.id }) })),
    ...(k.pendingInvites ? [{ t: `${k.pendingInvites} ${k.pendingInvites === 1 ? "invitación pendiente" : "invitaciones pendientes"}`, d: "Esperando que la persona acepte en su app", dot: "var(--ui-accent-2)", cta: "Invitar otra", go: onInvite }] : []),
    ...repiTodos(repi, ov, go),
  ];
  return (
    <>
      <div className="co-head">
        <div><span className="co-kicker">{today.charAt(0).toUpperCase() + today.slice(1)}</span><h1 tabIndex={-1}>{greet()}, {first}</h1></div>
        <div className="co-actions"><button type="button" className="btn" onClick={onInvite}>Invitar cliente</button><button type="button" className="btn pri" onClick={onNewProgram}>Nuevo programa</button></div>
      </div>
      {/* D195: primeros pasos, una sola vez: se cierra y no vuelve; la Guía queda siempre en el menú. */}
      {(!ov.clients.length || k.noProgram > 0) && (
        <Hint id="coach_start" title="Primeros pasos" text={`${ov.clients.length ? "✓" : "1."} Invitá a un alumno · ${k.noProgram === 0 && ov.clients.length ? "✓" : "2."} Armá y asigná su programa · 3. Revisá «Ver cómo lo verá» en su ficha.`}>
          <button type="button" className="linkbtn" style={{ alignSelf: "flex-start", minHeight: 32 }} onClick={() => go("guide")}>Ver la guía completa</button>
        </Hint>
      )}
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
          <TodayAgenda orgId={orgId} go={() => go("agenda")} />
        </section>
      </div>
    </>
  );
}

/** Líneas de «Pendientes» con señales de REPI: propuestas por revisar (y cuántas son pedidos del alumno). Abre su Rendimiento. */
function repiTodos(repi: PendingSignals | null, ov: Overview, go: (s: Screen, e?: { sel?: string; tab?: "rend" }) => void) {
  if (!repi?.clients.length) return [];
  const named = repi.clients.map((c) => ({ ...c, name: ov.clients.find((x) => x.id === c.relId)?.name })).filter((c) => c.name);
  const lines = named.slice(0, MAX_REPI_LINES).map((c) => ({
    t: `${c.name}: ${plural(c.pendingProposals, "propuesta para revisar", "propuestas para revisar")}`,
    d: `${!c.studentRequests ? "Señales de REPI" : c.studentRequests === c.pendingProposals ? `${c.studentRequests === 1 ? "Es un pedido suyo" : "Son pedidos suyos"} desde REPI`
      : `${plural(c.studentRequests, "es pedido suyo", "son pedidos suyos")} desde REPI`} · el programa no cambia solo`,
    dot: "var(--ui-accent)", cta: "Revisar", go: () => go("clients", { sel: c.relId, tab: "rend" }),
  }));
  const rest = named.slice(MAX_REPI_LINES);
  if (rest.length) {
    lines.push({
      t: `${plural(rest.length, "alumno más", "alumnos más")} con propuestas para revisar`,
      d: `${plural(rest.reduce((s, c) => s + c.pendingProposals, 0), "propuesta", "propuestas")} · Señales de REPI en la pestaña Rendimiento`,
      dot: "var(--ui-accent)", cta: "Ver clientes", go: () => go("clients", { sel: rest[0].relId, tab: "rend" }),
    });
  }
  return lines;
}
