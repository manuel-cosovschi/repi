"use client";
// REPI Connect en Gym (D126): bandeja del profesor de sala (tomar, atender, registrar, seguimiento, transferir, resolver)
// y tablero «Seguimiento de sala» para dueño, gerencia y coordinación con indicadores agregados.
import { useEffect, useState } from "react";
import { CONNECT_PRIORITY_RULE, TASK_PRIORITY, fmtMinutes, mentionsHealth } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Bars, Head, HBar, LocSelect, PRI_CHIP, Seg, SOURCE, can, fmt, nf, useAct, useLoad, when, type Shell } from "./shared";

type Card = {
  id: string; ref: string; member: string | null; gymMemberId: string | null; label: string; reason: string | null; priority: keyof typeof TASK_PRIORITY; source: string;
  summary: string; exercise: string | null; fromSession: boolean; state: string; stateLabel: string; status: string;
  assignee: { id: string; name: string } | null; completedBy: string | null; createdAt: string; takenAt: string | null; completedAt: string | null; dueAt: string | null;
  ageMin: number; overdue: boolean; lastNote: { kind: string; text: string | null; by: string | null; at: string } | null;
};
type Mate = { id: string; name: string; role: string; onShift: boolean; availability: "available" | "busy" | null };
type Board = {
  location: { id: string; name: string }; me: { onShift: boolean; availability: "available" | "busy" | null; canCancel: boolean }; team: Mate[];
  counts: { pending: number; mine: number; inProgress: number; incoming: number; followUps: number; dueSoon: number; resolvedWeek: number };
  incoming: Card[]; mine: Card[]; pending: Card[]; followUps: Card[]; others: Card[]; closed: Card[];
};
type Detail = Card & {
  context: { exercise: string | null; program: string | null; setIndex: number | null; fromSession: boolean; privateSession: boolean;
    sets: { setIndex: number; weightKg: string | null; reps: number | null; rir: number | null; feel: string | null }[]; recent: { at: string; weightKg: string | null; reps: number | null }[] } | null;
  program: string | null; feedback: string | null;
  events: { id: string; kind: string; at: string; by: string | null; to: string | null; note: string | null; memberNote: string | null; dueAt: string | null }[];
  previous: { id: string; ref: string; label: string; stateLabel: string; createdAt: string; completedBy: string | null }[];
  targets: Mate[];
  actions: { take: boolean; start: boolean; note: boolean; followUp: boolean; transfer: boolean; accept: boolean; decline: boolean; resolve: boolean; cancel: boolean };
};

const STATE_CHIP: Record<string, string> = { pendiente: "warn", asignada: "info", transferida: "info", en_atencion: "ok", seguimiento: "warn", resuelta: "ok", cancelada: "mute" };
const AVAIL: Record<string, string> = { available: "Disponible", busy: "Ocupado" };
const age = (m: number) => (m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`);
const EV: Record<string, string> = {
  created: "Pedido creado", taken: "Tomó la solicitud", started: "Empezó la atención", note: "Registró", follow_up: "Dejó seguimiento", transferred: "Transfirió",
  accepted: "Aceptó el traspaso", declined: "Rechazó el traspaso", reassigned: "Reasignó", resolved: "Resolvió", cancelled: "Canceló", member_comment: "Comentario del socio", feedback: "Opinión del socio",
};
const mateTxt = (m: Mate) => (m.onShift ? `En turno · ${AVAIL[m.availability ?? "available"]} (declarado)` : "Fuera de turno");

function ConnectCard({ c, onOpen, onTake, busy }: { c: Card; onOpen: () => void; onTake?: () => void; busy?: boolean }) {
  return (
    <div className="gy-task cx-task">
      <div style={{ flex: "2 1 260px", display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`chip ${STATE_CHIP[c.state] ?? "info"}`}>{c.stateLabel}</span>
          <span className={`chip ${PRI_CHIP[c.priority]}`} title={CONNECT_PRIORITY_RULE}>{TASK_PRIORITY[c.priority]}</span>
          <span style={{ font: "500 11px var(--font-mono)", color: "#5B6B80" }}>{c.ref}</span>
          {c.fromSession && <span className="chip info">Entrenando ahora</span>}
          {c.overdue && <span className="chip bad">Seguimiento vencido</span>}
        </div>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{c.member ?? "Sin socio asociado"} · {c.label}{c.exercise ? ` · ${c.exercise}` : ""}</span>
        {c.summary && c.summary !== `${c.label}${c.exercise ? ` · ${c.exercise}` : ""}` && <span className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>«{c.summary}»</span>}
        {c.lastNote?.text && <span style={{ fontSize: 13, color: "#334155" }}><b>{c.lastNote.kind === "member_comment" ? "Socio" : c.lastNote.by?.split(" ")[0]}:</b> {c.lastNote.text}</span>}
      </div>
      <div style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 2, fontSize: 13 }}>
        <span className="muted">{SOURCE[c.source] ?? c.source} · {age(c.ageMin)}</span>
        <span>{c.assignee ? (c.state === "transferida" ? `Para ${c.assignee.name}` : c.assignee.name) : "Sin responsable"}</span>
        {c.dueAt && c.state === "seguimiento" && <span className="muted">Seguimiento: {fmt(c.dueAt, { day: "numeric", month: "short" })}</span>}
        {c.completedAt && <span className="muted">{c.state === "resuelta" ? `Resuelta ${when(c.completedAt)}${c.completedBy ? ` · ${c.completedBy}` : ""}` : ""}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {onTake && <button type="button" className="btn sm pri" aria-busy={busy || undefined} onClick={onTake}>Tomar</button>}
        <button type="button" className="btn sm" onClick={onOpen}>Abrir</button>
      </div>
    </div>
  );
}

/** Bandeja «Sala» del profesor. Reemplaza a la cola de asistencia cuando el gimnasio tiene Connect activo. */
export function ConnectQueueScreen({ shell }: { shell: Shell }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const b = useLoad<Board>(`/api/gym/${shell.orgId}/connect/board?loc=${loc}`);
  const [tab, setTab] = useState<"me" | "pending" | "follow" | "team" | "closed">("me");
  const [open, setOpen] = useState<string | null>(shell.sel);
  const { busy, run } = useAct(shell.flash);
  const reload = () => { b.reload(); shell.refreshBadges(); };
  useEffect(() => { const t = setInterval(() => { if (!document.hidden && !open) b.reload(); }, 30_000); return () => clearInterval(t); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const take = (c: Card) => run(c.id, () => api(`/api/gym/${shell.orgId}/connect/tasks/${c.id}`, { body: { action: "take" } }), `Tomaste ${c.ref}.`).then(reload);
  const avail = (v: "available" | "busy") => run("av", () => api(`/api/gym/${shell.orgId}/connect/availability`, { body: { availability: v } }), v === "busy" ? "Quedaste como ocupado." : "Quedaste como disponible.").then(reload);
  const v = b.data;
  const lists = v ? { me: [...v.incoming, ...v.mine], pending: v.pending, follow: v.followUps, team: v.others, closed: v.closed } : null;
  const empty = { me: "No tenés solicitudes ni traspasos.", pending: "No hay pedidos sin tomar.", follow: "No hay seguimientos de otros profesores ni libres.", team: "Nadie más está atendiendo pedidos ahora.", closed: "Sin pedidos cerrados en los últimos 7 días." }[tab];
  return (
    <>
      <Head kicker={`${shell.ctx.org.name}${v ? ` · ${v.location.name}` : ""} · REPI Connect`} title="Sala">
        <Seg label="Bandeja" value={tab} onChange={setTab} options={[["me", `Para vos ${v ? v.incoming.length + v.mine.length : ""}`], ["pending", `Pendientes ${v?.pending.length ?? ""}`], ["follow", `Seguimientos ${v?.followUps.length ?? ""}`], ["team", "Equipo"], ["closed", "Cerradas"]]} />
      </Head>
      {b.err && <p role="alert" className="err-box">{b.err}</p>}
      {v && !v.me.onShift && (
        <div className="gy-warn"><span style={{ flex: "1 1 260px" }}>Iniciá tu turno para tomar y atender pedidos. Podés ver la bandeja igual.</span>
          <button type="button" className="btn sm gy-dark" onClick={() => run("start", () => api(`/api/gym/${shell.orgId}/shift/start`, { body: { loc } }), "Turno iniciado.").then(reload)}>Iniciar turno</button>
        </div>
      )}
      {v && (
        <>
          <div className="grid-kpi">
            {([[v.counts.incoming, "Traspasos para aceptar", "me"], [v.counts.mine, `Tuyas · ${v.counts.inProgress} en atención`, "me"], [v.counts.pending, "Pendientes sin tomar", "pending"],
              [v.counts.followUps, `Seguimientos · ${v.counts.dueSoon} por vencer`, "follow"], [v.counts.resolvedWeek, "Resueltas · 7 días", "closed"]] as [number, string, typeof tab][]).map(([n, l, k]) => (
              <button type="button" key={l} className="kpi" onClick={() => setTab(k)}><strong>{n}</strong><span>{l}</span></button>
            ))}
          </div>
          <section className="card cx-team">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Equipo de sala</h2>
              {v.me.onShift && (
                <div className="pills" role="group" aria-label="Tu disponibilidad" style={{ marginLeft: "auto" }}>
                  {(["available", "busy"] as const).map((k) => <button key={k} type="button" className="pill" aria-pressed={v.me.availability === k} aria-busy={busy === "av" || undefined} onClick={() => avail(k)}>{AVAIL[k]}</button>)}
                </div>
              )}
            </div>
            <div className="cx-mates">
              {v.team.map((m) => <span key={m.id} className={`cx-mate${m.onShift ? " on" : ""}`}><b>{m.name}</b><small>{mateTxt(m)}</small></span>)}
            </div>
            <small className="muted">La disponibilidad la indica cada profesor: no es ubicación ni confirma que esté en la sala.</small>
          </section>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lists![tab].map((c) => <ConnectCard key={c.id} c={c} busy={busy === c.id} onOpen={() => setOpen(c.id)} onTake={!c.assignee && (c.state === "pendiente" || c.state === "seguimiento") ? () => take(c) : undefined} />)}
            {!lists![tab].length && <div className="empty">{empty}</div>}
          </div>
        </>
      )}
      {!v && !b.err && <p className="muted">Cargando…</p>}
      {open && <ConnectTaskModal shell={shell} id={open} onClose={(changed) => { setOpen(null); shell.setSel(null); if (changed) reload(); }} />}
    </>
  );
}

type Form = null | "note" | "follow" | "transfer" | "resolve" | "cancel";

function ConnectTaskModal({ shell, id, onClose }: { shell: Shell; id: string; onClose: (changed: boolean) => void }) {
  const d = useLoad<Detail>(`/api/gym/${shell.orgId}/connect/tasks/${id}`);
  const [form, setForm] = useState<Form>(null);
  const [f, setF] = useState({ note: "", memberNote: "", done: "", pending: "", next: "", dueAt: "", toUserId: "", forShift: false });
  const [changed, setChanged] = useState(false);
  const { busy, run } = useAct(shell.flash);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const act = async (action: string, ok: string, body: object = {}) => {
    const r = await run(action, () => api(`/api/gym/${shell.orgId}/connect/tasks/${id}`, { body: { action, ...body } }), ok);
    if (r) { setChanged(true); setForm(null); setF({ note: "", memberNote: "", done: "", pending: "", next: "", dueAt: "", toUserId: "", forShift: false }); d.reload(); }
  };
  const t = d.data;
  const health = mentionsHealth([f.note, f.done, f.pending, f.next].join(" "));
  const a = t?.actions;
  return (
    <Modal label={t ? `${t.ref} · ${t.label}` : "Solicitud"} onClose={() => onClose(changed)} wide>
      <div className="mhead"><h2>{t ? `${t.ref} · ${t.label}` : "Cargando…"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(changed)}>×</button></div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {t && (
        <div className="cx-detail">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className={`chip ${STATE_CHIP[t.state] ?? "info"}`}>{t.stateLabel}</span>
            <span className={`chip ${PRI_CHIP[t.priority]}`} title={CONNECT_PRIORITY_RULE}>Prioridad {TASK_PRIORITY[t.priority].toLowerCase()}</span>
            {t.fromSession && <span className="chip info">Pidió durante su entrenamiento</span>}
            <span className="muted" style={{ fontSize: 13 }}>{when(t.createdAt)} · {t.assignee ? `Responsable: ${t.assignee.name}` : "Sin responsable"}</span>
          </div>
          <section className="cx-box">
            <b>{t.member ?? "Sin socio"}</b>{t.program && <small className="muted">Programa del gym: {t.program}</small>}
            {t.summary !== `${t.label}${t.exercise ? ` · ${t.exercise}` : ""}` && <p style={{ margin: 0 }}>«{t.summary}»</p>}
            {t.gymMemberId && <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => shell.go("members", { sel: t.gymMemberId })}>Abrir ficha del socio</button>}
          </section>
          {t.context && (
            <section className="cx-box">
              <b>Ejercicio: {t.context.exercise ?? "—"}{t.context.setIndex != null ? ` · serie ${t.context.setIndex + 1}` : ""}</b>
              {t.context.privateSession && <small className="muted">El pedido salió de un entrenamiento de su coach privado: el gym no ve esas series.</small>}
              {!!t.context.sets.length && <small>En esta sesión: {t.context.sets.map((x) => `S${x.setIndex + 1} ${x.weightKg ?? "PC"}×${x.reps ?? "—"}${x.rir != null ? ` RIR ${x.rir}` : ""}`).join(" · ")}</small>}
              {!!t.context.recent.length && <small className="muted">Últimas series con el programa del gym: {t.context.recent.map((x) => `${x.weightKg ?? "PC"}×${x.reps ?? "—"}`).join(" · ")}</small>}
            </section>
          )}
          <section>
            <h3 className="cx-h3">Historial</h3>
            <ol className="cx-events">
              {t.events.map((e) => (
                <li key={e.id}><span className="muted">{when(e.at)}</span>
                  <span><b>{e.kind === "member_comment" || e.kind === "created" ? (t.member ?? "Socio") : e.by ?? "—"}</b> · {EV[e.kind] ?? e.kind}{e.to ? ` a ${e.to}` : ""}{e.dueAt ? ` (para el ${fmt(e.dueAt, { day: "numeric", month: "short" })})` : ""}
                    {e.note && e.kind !== "feedback" && <q>{e.note}</q>}{e.kind === "feedback" && <q>{e.note === "yes" ? "Le sirvió" : "No le sirvió"}</q>}
                    {e.memberNote && <q className="cx-to-member">Para el socio: {e.memberNote}</q>}</span></li>
              ))}
            </ol>
          </section>
          {!!t.previous.length && (
            <section><h3 className="cx-h3">Pedidos anteriores</h3>
              {t.previous.map((p) => <div key={p.id} className="trow"><span className="muted" style={{ flex: "0 0 120px" }}>{when(p.createdAt)}</span><span>{p.ref} · {p.label} · {p.stateLabel}{p.completedBy ? ` · ${p.completedBy}` : ""}</span></div>)}
            </section>
          )}
          {form === "note" && <label className="field">Qué hiciste<textarea className="note" rows={3} maxLength={500} value={f.note} onChange={set("note")} placeholder="Ej.: corregí la trayectoria con 30 kg" /></label>}
          {(form === "follow" || form === "transfer") && (
            <div className="cx-form">
              {form === "transfer" && (
                <label className="field">Para
                  <select value={f.toUserId} onChange={set("toUserId")}><option value="">Elegí un profesor</option>{t.targets.map((m) => <option key={m.id} value={m.id}>{m.name} · {mateTxt(m)}</option>)}</select>
                </label>
              )}
              <label className="field">Qué se hizo<input value={f.done} maxLength={200} onChange={set("done")} /></label>
              <label className="field">Qué queda pendiente<input value={f.pending} maxLength={200} onChange={set("pending")} /></label>
              <label className="field">Próximo paso sugerido<input value={f.next} maxLength={200} onChange={set("next")} /></label>
              {form === "follow" && <>
                <label className="field">Fecha del seguimiento<input type="date" value={f.dueAt} onChange={set("dueAt")} /></label>
                <div className="pills" role="group" aria-label="Quién lo sigue">
                  <button type="button" className="pill" aria-pressed={!f.forShift} onClick={() => setF((x) => ({ ...x, forShift: false }))}>Lo sigo yo</button>
                  <button type="button" className="pill" aria-pressed={f.forShift} onClick={() => setF((x) => ({ ...x, forShift: true }))}>Para el próximo turno</button>
                </div>
                <small className="muted">Sin fecha, vence en 7 días. «Para el próximo turno» lo deja libre para quien esté en sala.</small>
              </>}
            </div>
          )}
          {(form === "resolve" || form === "cancel") && (
            <div className="cx-form">
              <label className="field">{form === "resolve" ? "Qué hiciste (queda en el historial del equipo)" : "Motivo de la cancelación"}<textarea className="note" rows={2} maxLength={500} value={f.note} onChange={set("note")} /></label>
              <label className="field">Mensaje para el socio (opcional)<textarea className="note" rows={2} maxLength={500} value={f.memberNote} onChange={set("memberNote")} placeholder="Lo ve en «Mis pedidos»" /></label>
            </div>
          )}
          {health && <p className="gy-warn" role="note" style={{ margin: 0 }}>Parece que mencionás datos de salud. El historial lo ve el equipo: dejá sólo lo operativo.</p>}
          <div className="mfoot" style={{ flexWrap: "wrap" }}>
            {form ? <>
              <button type="button" className="btn" onClick={() => setForm(null)}>Volver</button>
              {form === "note" && <button type="button" className="btn pri" aria-busy={busy === "note" || undefined} onClick={() => act("note", "Registrado en el historial.", { note: f.note })}>Guardar registro</button>}
              {form === "follow" && <button type="button" className="btn pri" aria-busy={busy === "follow_up" || undefined} onClick={() => act("follow_up", f.forShift ? "Seguimiento libre para el próximo turno." : "Seguimiento agendado.", { done: f.done, pending: f.pending, next: f.next, dueAt: f.dueAt ? `${f.dueAt}T15:00:00-03:00` : null, forShift: f.forShift })}>Dejar seguimiento</button>}
              {form === "transfer" && <button type="button" className="btn pri" aria-busy={busy === "transfer" || undefined} onClick={() => (f.toUserId ? act("transfer", "Transferido. Queda pendiente hasta que lo acepte.", { toUserId: f.toUserId, done: f.done, pending: f.pending, next: f.next }) : shell.flash("Elegí a quién transferir."))}>Transferir</button>}
              {form === "resolve" && <button type="button" className="btn pri" aria-busy={busy === "resolve" || undefined} onClick={() => act("resolve", `${t.ref} resuelta.`, { note: f.note, memberNote: f.memberNote })}>Marcar resuelta</button>}
              {form === "cancel" && <button type="button" className="btn" aria-busy={busy === "cancel" || undefined} onClick={() => act("cancel", `${t.ref} cancelada.`, { note: f.note, memberNote: f.memberNote })}>Cancelar solicitud</button>}
            </> : <>
              {a?.take && <button type="button" className="btn pri" aria-busy={busy === "take" || undefined} onClick={() => act("take", `Tomaste ${t.ref}.`)}>Tomar</button>}
              {a?.accept && <button type="button" className="btn pri" aria-busy={busy === "accept" || undefined} onClick={() => act("accept", `Aceptaste ${t.ref}.`)}>Aceptar traspaso</button>}
              {a?.decline && <button type="button" className="btn" aria-busy={busy === "decline" || undefined} onClick={() => act("decline", `${t.ref} volvió a la cola.`)}>Rechazar</button>}
              {a?.start && <button type="button" className="btn pri" aria-busy={busy === "start" || undefined} onClick={() => act("start", "En atención.")}>Atender ahora</button>}
              {a?.note && <button type="button" className="btn" onClick={() => setForm("note")}>Registrar</button>}
              {a?.followUp && <button type="button" className="btn" onClick={() => setForm("follow")}>Dejar seguimiento</button>}
              {a?.transfer && <button type="button" className="btn" onClick={() => setForm("transfer")}>Transferir</button>}
              {a?.resolve && <button type="button" className="btn pri" onClick={() => setForm("resolve")}>Resolver</button>}
              {a?.cancel && <button type="button" className="btn" onClick={() => setForm("cancel")}>Cancelar</button>}
            </>}
          </div>
        </div>
      )}
    </Modal>
  );
}

type Report = {
  enabled: boolean; days: number; openNow: number; oldestPendingMin: number | null;
  stateNow?: { pendiente: number; enCurso: number; seguimiento: number; transferida: number };
  metrics: { received: number; resolved: number; cancelled: number; open: number; resolvedPct: number | null; firstResponseMedianMin: number | null; firstResponseAvgMin: number | null;
    resolutionMedianMin: number | null; resolutionAvgMin: number | null; followUps: number; transfers: number; membersHelped: number; feedback: { answered: number; helpful: number; helpfulPct: number | null } };
  weekly: { label: string; received: number; resolved: number }[];
  byLocation: ({ id: string; name: string; openNow: number } & Report["metrics"])[];
  team: { name: string; taken: number; notes: number; followUps: number; transfers: number; resolved: number }[];
};

/** Tablero de gestión. Sólo números del servicio: nunca el texto de los pedidos, notas del equipo, chats ni salud. */
export function ConnectReportScreen({ shell }: { shell: Shell }) {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [loc, setLoc] = useState<string | null>(shell.ctx.roles.includes("owner") ? null : shell.loc);
  const r = useLoad<Report>(`/api/gym/${shell.orgId}/connect/report?days=${days}${loc ? `&loc=${loc}` : ""}`);
  const v = r.data, m = v?.metrics;
  return (
    <>
      <Head kicker="REPI Connect · datos registrados en la app, sin texto de pedidos ni notas" title="Seguimiento de sala">
        <LocSelect shell={shell} allowAll={shell.ctx.roles.includes("owner")} value={loc} onChange={setLoc} />
        <Seg label="Período" value={days} onChange={setDays} options={[["7", "7 días"], ["30", "30 días"], ["90", "90 días"]]} />
      </Head>
      {r.err && <p role="alert" className="err-box">{r.err}</p>}
      {v && !v.enabled && <div className="empty">REPI Connect no está activo en este gimnasio. Se activa por gimnasio durante el piloto; pedíselo a REPI.</div>}
      {v && m && (
        <>
          <div className="grid-kpi">
            <div className="kpi"><strong>{nf(m.received)}</strong><span>Pedidos recibidos</span><small>{v.days} días</small></div>
            <div className="kpi"><strong>{nf(m.resolved)}</strong><span>Resueltos</span><small>{m.resolvedPct == null ? "Sin pedidos" : `${m.resolvedPct}% de los recibidos`}</small></div>
            <div className="kpi"><strong>{nf(v.openNow)}</strong><span>Abiertos ahora</span><small>{v.oldestPendingMin != null ? `El más antiguo sin tomar: ${fmtMinutes(v.oldestPendingMin)}` : "Ninguno sin tomar"}</small></div>
            <div className="kpi"><strong>{fmtMinutes(m.firstResponseMedianMin)}</strong><span>Primera atención (mediana)</span><small>Desde el pedido hasta que alguien lo toma</small></div>
            <div className="kpi"><strong>{fmtMinutes(m.resolutionMedianMin)}</strong><span>Resolución (mediana)</span><small>Promedio: {fmtMinutes(m.resolutionAvgMin)}</small></div>
            <div className="kpi"><strong>{nf(m.membersHelped)}</strong><span>Socios atendidos</span><small>Con al menos un pedido resuelto</small></div>
            <div className="kpi"><strong>{nf(m.followUps)}</strong><span>Seguimientos dejados</span></div>
            <div className="kpi"><strong>{nf(m.transfers)}</strong><span>Traspasos entre profesores</span></div>
            <div className="kpi"><strong>{m.feedback.helpfulPct == null ? "Sin datos" : `${m.feedback.helpfulPct}%`}</strong><span>«¿Te sirvió?» · sí</span><small>{m.feedback.answered} respuestas optativas</small></div>
          </div>
          <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))" }}>
            <section className="card"><h2>Pedidos por semana</h2><Bars label="Pedidos recibidos por semana" data={v.weekly.map((w) => ({ label: w.label, n: w.received }))} /></section>
            <section className="card"><h2>Resueltos por semana</h2><Bars label="Pedidos resueltos por semana" color="#5DE6D8" data={v.weekly.map((w) => ({ label: w.label, n: w.resolved }))} /></section>
          </div>
          {v.stateNow && (
            <section className="card"><h2>Estado ahora</h2>
              {([["Pendientes sin tomar", v.stateNow.pendiente], ["Asignados o en atención", v.stateNow.enCurso], ["Seguimientos", v.stateNow.seguimiento], ["Traspasos sin aceptar", v.stateNow.transferida]] as [string, number][])
                .map(([l, n]) => <HBar key={l} label={l} n={n} max={Math.max(1, v.openNow)} />)}
            </section>
          )}
          {v.byLocation.length > 0 && (
            <section className="card"><h2>Por sede</h2>
              <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Tabla (deslizá para ver más columnas)"><table className="gy-table"><thead><tr><th>Sede</th><th>Recibidos</th><th>Resueltos</th><th>Abiertos</th><th>Primera atención</th><th>Resolución</th></tr></thead>
                <tbody>{v.byLocation.map((l) => <tr key={l.id}><th>{l.name}</th><td>{l.received}</td><td>{l.resolved}</td><td>{l.openNow}</td><td>{fmtMinutes(l.firstResponseMedianMin)}</td><td>{fmtMinutes(l.resolutionMedianMin)}</td></tr>)}</tbody></table></div>
            </section>
          )}
          {can(shell.ctx, "team.read") && (
            <section className="card"><h2>Uso por el equipo</h2>
              <small className="muted">Acciones registradas en REPI en el período, en orden alfabético. No es un ranking: la cantidad depende de turnos, sede y socios; más pedidos no significa peor rendimiento.</small>
              {!v.team.length ? <div className="empty">Todavía no hay acciones registradas.</div> : (
                <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Tabla (deslizá para ver más columnas)"><table className="gy-table"><thead><tr><th>Profesor</th><th>Tomados</th><th>Registros</th><th>Seguimientos</th><th>Traspasos</th><th>Resueltos</th></tr></thead>
                  <tbody>{v.team.map((p) => <tr key={p.name}><th>{p.name}</th><td>{p.taken}</td><td>{p.notes}</td><td>{p.followUps}</td><td>{p.transfers}</td><td>{p.resolved}</td></tr>)}</tbody></table></div>
              )}
            </section>
          )}
          <small className="muted">Las cifras salen de pedidos reales registrados en REPI. Sin pedidos en el período los tiempos dicen «Sin datos». La gestión no ve el texto de los pedidos, las notas del equipo, los chats ni datos de salud.</small>
        </>
      )}
    </>
  );
}
