"use client";
// Entrenador de sala: Mi turno, Cola de asistencia y Traspaso (REPI Desktop Gym.dc.html · sc.shift/queue/handoff).
import { useEffect, useState } from "react";
import { TASK_CATEGORY, TASK_PRIORITY, mentionsHealth } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Head, PRI_CHIP, SOURCE, fmt, useAct, useLoad, when, type Shell, type Task } from "./shared";
import { FloorAlertsCard } from "./Access";
import { HOURS_EVENT, HoursModal } from "./Hours";

type ShiftView = {
  location: { id: string; name: string }; status: "off" | "on" | "ended" | "elsewhere"; startedAt: string | null;
  plan: { code: string; label: string; from: string; to: string } | null; afterHoursAccess: boolean;
  hours: { days: number[]; from: string; to: string; text: string } | null; auto: boolean; autoEndsAt: string | null;
  shared: number; mine: number; incoming: number; doneWeek: number;
};
type Queue = { shared: Task[]; mine: Task[]; done: Task[] };

const today = () => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "numeric", month: "long" }).format(new Date());

export function ShiftScreen({ shell }: { shell: Shell }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const s = useLoad<ShiftView>(`/api/gym/${shell.orgId}/shift?loc=${loc}`);
  const q = useLoad<Queue>(`/api/gym/${shell.orgId}/queue?loc=${loc}`);
  const { busy, run } = useAct(shell.flash);
  const [editHours, setEditHours] = useState(false);
  const reloadShift = s.reload;
  useEffect(() => { window.addEventListener(HOURS_EVENT, reloadShift); return () => window.removeEventListener(HOURS_EVENT, reloadShift); }, [reloadShift]);
  const reload = () => { s.reload(); q.reload(); shell.refreshBadges(); };
  const start = () => run("start", () => api(`/api/gym/${shell.orgId}/shift/start`, { body: { loc } }), "Turno iniciado. Tu cola de asistencia está activa.").then(reload);
  const accept = (t: Task) => run(t.id, () => api(`/api/gym/${shell.orgId}/tasks/${t.id}/accept`, { body: {} }), `Aceptaste el traspaso ${t.ref}.`).then(reload);
  const v = s.data;
  const first = shell.ctx.name.split(" ")[0];
  const incoming = q.data?.mine.filter((t) => t.status === "pending_acceptance") ?? [];
  const prev = q.data?.mine.filter((t) => t.status === "open") ?? [];
  const status = !v ? "" : v.status === "on" ? `En turno desde ${fmt(v.startedAt, { hour: "2-digit", minute: "2-digit" })}` : v.status === "ended" ? "Turno cerrado" : v.status === "elsewhere" ? "Tenés un turno iniciado en otra sede" : "Sin iniciar";
  const dot = !v ? "#94A3B8" : v.status === "on" ? "#10B981" : v.status === "ended" ? "#5DE6D8" : "#94A3B8";
  return (
    <>
      <Head kicker={`${shell.ctx.org.name}${v ? ` · ${v.location.name}` : ""} · ${today()}`} title={`Hola, ${first}`} />
      {(s.err || q.err) && <p role="alert" className="err-box">{s.err ?? q.err}</p>}
      {v && (
        <div className="gy-hero">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#94A3B8" }}>Tu turno de hoy</span>
            <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.01em" }}>{v.plan ? `${v.plan.from} – ${v.plan.to}` : v.hours ? `${v.hours.from} – ${v.hours.to}` : "Sin turno planificado"}</span>
            <span style={{ fontSize: 14, color: "#CBD5E1", display: "flex", gap: 8, alignItems: "center" }}><span className="dot" style={{ background: dot }} />{status}{v.plan ? ` · ${v.plan.label}` : ""}</span>
            {v.auto && v.autoEndsAt && <span style={{ fontSize: 13, color: "#5DE6D8" }}>Se abrió solo por tu horario y se cierra a las {fmt(v.autoEndsAt, { hour: "2-digit", minute: "2-digit" })}.</span>}
            <span style={{ fontSize: 13, color: "#94A3B8" }}>{v.hours ? `Tu horario: ${v.hours.text}` : "Sin horario cargado: el turno se inicia a mano."} <button type="button" className="linkbtn" style={{ color: "#5DE6D8", background: "none", border: 0, padding: 0, height: "auto", font: "inherit", fontWeight: 600, cursor: "pointer" }} onClick={() => setEditHours(true)}>{v.hours ? "Cambiar" : "Cargar horario"}</button></span>
            {v.afterHoursAccess && <span style={{ fontSize: 12, color: "#5DE6D8" }}>Gerencia te habilitó trabajo fuera de turno: lo que completes así queda marcado.</span>}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(v.status === "off" || v.status === "ended") && <button type="button" className="btn pri" style={{ height: 48 }} aria-busy={busy === "start" || undefined} onClick={start}>{v.status === "ended" ? "Iniciar otro turno" : "Iniciar turno"}</button>}
            {v.status === "on" && <>
              <button type="button" className="btn pri" onClick={() => shell.go("queue")}>Ver cola de asistencia</button>
              <button type="button" className="btn gy-ghost" onClick={() => shell.go("handoff")}>Terminar turno</button>
            </>}
          </div>
        </div>
      )}
      {editHours && v && <HoursModal shell={shell} current={v.hours ? [{ locationId: v.location.id, location: v.location.name, ...v.hours }] : []} onClose={(saved) => { setEditHours(false); if (saved) reload(); }} />}
      {loc && <FloorAlertsCard shell={shell} loc={loc} highlight={shell.sel} />}
      {v && (
        <div className="grid-kpi">
          {([[v.shared, "Sin asignar en la cola"], [v.mine, "Asignadas a vos"], [v.doneWeek, "Completadas · 7 días"], [v.incoming, "Traspasos por aceptar"]] as [number, string][]).map(([n, l]) => (
            <button type="button" key={l} className="kpi" onClick={() => shell.go("queue")}><strong>{n}</strong><span>{l}</span></button>
          ))}
        </div>
      )}
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))" }}>
        <section className="card">
          <h2>Traspasos recibidos</h2>
          {!incoming.length && <span className="muted" style={{ fontSize: 14 }}>No tenés traspasos esperando tu aceptación.</span>}
          {incoming.map((t) => (
            <div key={t.id} className="gy-incoming">
              <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 12, color: "#006B88", fontWeight: 600 }}>{t.handoffFrom ? `Traspaso de ${t.handoffFrom.name}` : "Traspaso"} · {t.ref}</span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{t.member ?? "Sin socio"} · {TASK_CATEGORY[t.category]}</span>
                <span className="muted" style={{ fontSize: 13 }}>{t.summary}</span>
              </div>
              <button type="button" className="btn sm pri" aria-busy={busy === t.id || undefined} onClick={() => accept(t)}>Aceptar</button>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>Tus pendientes abiertos</h2>
          {!prev.length && <span className="muted" style={{ fontSize: 14 }}>No tenés tareas abiertas.</span>}
          {prev.map((t) => (
            <div key={t.id} className="todo">
              <span className="dot" style={{ background: t.overdue ? "#F59E0B" : "#00D1FF" }} />
              <span><b>{t.member ?? "Sin socio"}</b><small>{TASK_CATEGORY[t.category]} · {SOURCE[t.source] ?? t.source}{t.overdue ? " · vencida" : ""}</small></span>
              {t.gymMemberId && <button type="button" className="btn sm" onClick={() => shell.go("members", { sel: t.gymMemberId })}>Abrir socio</button>}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

export function TaskCard({ t, children }: { t: Task; children?: React.ReactNode }) {
  return (
    <div className="gy-task">
      <div style={{ flex: "2 1 260px", display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip info">{TASK_CATEGORY[t.category]}</span>
          <span className={`chip ${PRI_CHIP[t.priority]}`}>{TASK_PRIORITY[t.priority]}</span>
          <span style={{ font: "500 11px var(--font-mono)", color: "#5B6B80" }}>{t.ref}</span>
          {t.status === "pending_acceptance" && <span className="chip info">Traspaso pendiente</span>}
          {t.overdue && <span className="chip warn">Vencida</span>}
          {t.completedOffShift && <span className="chip mute">Fuera de turno</span>}
        </div>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{t.member ?? "Sin socio asociado"}</span>
        {t.summary && <span className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>{t.summary}</span>}
        {t.videoId && <video src={`/api/media/${t.videoId}`} controls preload="metadata" style={{ width: "100%", maxWidth: 360, maxHeight: 220, borderRadius: 10, background: "#0B0F14" }} aria-label={`Video adjunto a ${t.ref}`} />}
      </div>
      <div style={{ flex: "1 1 150px", display: "flex", flexDirection: "column", gap: 2, fontSize: 13 }}>
        <span className="muted">{t.handoffFrom ? `Traspaso de ${t.handoffFrom.name}` : SOURCE[t.source] ?? t.source}</span>
        <span>{t.status === "done" ? `Completada ${when(t.completedAt)}` : `Creada ${when(t.createdAt)}`}</span>
        {t.dueAt && t.status !== "done" && <span className="muted">Objetivo: {fmt(t.dueAt, { day: "numeric", month: "short" })}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{children}</div>
    </div>
  );
}

export function QueueScreen({ shell }: { shell: Shell }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const s = useLoad<ShiftView>(`/api/gym/${shell.orgId}/shift?loc=${loc}`);
  const q = useLoad<Queue>(`/api/gym/${shell.orgId}/queue?loc=${loc}`);
  const [tab, setTab] = useState<"shared" | "mine" | "done">("shared");
  const [newTask, setNewTask] = useState(false);
  const { busy, run } = useAct(shell.flash);
  const reload = () => { q.reload(); s.reload(); shell.refreshBadges(); };
  const act = (t: Task, what: "take" | "complete" | "accept", ok: (r: unknown) => string) => run(t.id + what, () => api(`/api/gym/${shell.orgId}/tasks/${t.id}/${what}`, { body: {} }), ok).then(reload);
  const gate = s.data && s.data.status !== "on" && !s.data.afterHoursAccess;
  const list = q.data?.[tab] ?? [];
  const empty = { shared: "No hay solicitudes sin asignar. Buen trabajo de equipo.", mine: "No tenés tareas abiertas.", done: "Todavía no completaste tareas en los últimos 7 días." }[tab];
  return (
    <>
      <Head kicker={`${shell.ctx.org.name}${s.data ? ` · ${s.data.location.name}` : ""}`} title="Cola de asistencia">
        <div className="seg" role="tablist" aria-label="Cola">
          {([["shared", "Cola compartida"], ["mine", "Asignadas a mí"], ["done", "Completadas"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span className="muted">{q.data?.[k].length ?? ""}</span></button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => setNewTask(true)}>Nueva tarea</button>
      </Head>
      {gate && (
        <div className="gy-warn"><span style={{ flex: "1 1 260px" }}>Iniciá tu turno para tomar o completar solicitudes. Podés ver la cola igual.</span>
          {s.data?.status !== "elsewhere" && <button type="button" className="btn sm gy-dark" onClick={() => run("start", () => api(`/api/gym/${shell.orgId}/shift/start`, { body: { loc } }), "Turno iniciado.").then(reload)}>Iniciar turno</button>}
        </div>
      )}
      {q.err && <p role="alert" className="err-box">{q.err}</p>}
      {!q.data ? <p className="muted">Cargando…</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((t) => (
            <TaskCard key={t.id} t={t}>
              {tab === "shared" && <button type="button" className="btn sm pri" aria-busy={busy === t.id + "take" || undefined} onClick={() => act(t, "take", () => `Tomaste ${t.ref}. Ahora está en "Asignadas a mí".`)}>Tomar</button>}
              {t.status === "pending_acceptance" && <button type="button" className="btn sm pri" onClick={() => act(t, "accept", () => `Aceptaste el traspaso ${t.ref}.`)}>Aceptar</button>}
              {tab === "mine" && t.status === "open" && <button type="button" className="btn sm pri" aria-busy={busy === t.id + "complete" || undefined}
                onClick={() => act(t, "complete", (r) => (r as { invite: string | null }).invite === "pending" ? `${t.ref} completada. ${t.member?.split(" ")[0] ?? "El socio"} recibirá una invitación opcional para opinar.` : `${t.ref} completada y registrada.`)}>Completar</button>}
              {t.gymMemberId && <button type="button" className="btn sm" onClick={() => shell.go("members", { sel: t.gymMemberId })}>Abrir socio</button>}
            </TaskCard>
          ))}
          {!list.length && <div className="empty">{empty}</div>}
        </div>
      )}
      {newTask && <NewTaskModal shell={shell} loc={loc!} onClose={(ok) => { setNewTask(false); if (ok) reload(); }} />}
    </>
  );
}


export function NewTaskModal({ shell, loc, gymMemberId, memberName, onClose }: { shell: Shell; loc: string; gymMemberId?: string; memberName?: string; onClose: (ok: boolean) => void }) {
  const floor = shell.ctx.caps.includes("floor.work");
  const [cat, setCat] = useState<keyof typeof TASK_CATEGORY>(gymMemberId ? "seguimiento" : "consulta");
  const [to, setTo] = useState<"me" | "pool">(floor ? "me" : "pool");
  const [sum, setSum] = useState("");
  const { busy, run } = useAct(shell.flash);
  const save = async () => {
    const r = await run("save", () => api<{ ref: string }>(`/api/gym/${shell.orgId}/tasks`, { body: { loc, gymMemberId: gymMemberId ?? null, category: cat, summary: sum, assignToMe: to === "me" } }), (x) => `Tarea ${(x as { ref: string }).ref} creada.`);
    if (r) onClose(true);
  };
  const cats = (gymMemberId ? ["seguimiento", "tecnica", "actualizar_programa", "onboarding"] : ["consulta", "seguimiento", "tecnica", "onboarding", "programa_nuevo"]) as (keyof typeof TASK_CATEGORY)[];
  return (
    <Modal label="Nueva tarea" onClose={() => onClose(false)}>
      <div className="mhead"><h2>Nueva tarea{memberName ? ` · ${memberName}` : ""}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <div className="pills" role="group" aria-label="Tipo">{cats.map((c) => <button key={c} type="button" className="pill" aria-pressed={cat === c} onClick={() => setCat(c)}>{TASK_CATEGORY[c]}</button>)}</div>
      {floor && <div className="pills" role="group" aria-label="Asignación">{([["me", "Asignarme"], ["pool", "Cola compartida"]] as const).map(([k, l]) => <button key={k} type="button" className="pill" aria-pressed={to === k} onClick={() => setTo(k)}>{l}</button>)}</div>}
      <label className="field">Resumen
        <textarea className="note" rows={3} value={sum} onChange={(e) => setSum(e.target.value)} maxLength={500} placeholder="Qué hay que hacer, sin datos de salud ni mensajes privados" />
      </label>
      {mentionsHealth(sum) && <p className="gy-warn" role="note" style={{ margin: 0 }}>Parece que mencionás datos de salud. Los resúmenes de tareas los ve el equipo: dejá sólo lo operativo.</p>}
      {cat === "seguimiento" && <span className="muted">Fecha objetivo: 7 días desde hoy.</span>}
      <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button><button type="button" className="btn pri" aria-busy={busy === "save" || undefined} aria-disabled={sum.trim().length < 3} onClick={() => sum.trim().length >= 3 ? save() : shell.flash("Escribí un resumen breve de la tarea.")}>Crear tarea</button></div>
    </Modal>
  );
}

type HandoffView = { tasks: Task[]; targets: { id: string; name: string; next: { date: string; label: string; from: string; to: string } | null }[]; history: { at: string; from: string; to: string; n: number }[] };

export function HandoffScreen({ shell }: { shell: Shell }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const s = useLoad<ShiftView>(`/api/gym/${shell.orgId}/shift?loc=${loc}`);
  const h = useLoad<HandoffView>(`/api/gym/${shell.orgId}/handoff?loc=${loc}`);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [sums, setSums] = useState<Record<string, string>>({});
  const [to, setTo] = useState<string>("pool");
  const { busy, run } = useAct(shell.flash);
  const sel = h.data?.tasks.filter((t) => !off[t.id]) ?? [];
  const toName = to === "pool" ? "la cola compartida" : h.data?.targets.find((x) => x.id === to)?.name ?? "";
  const send = () => run("close", () => api(`/api/gym/${shell.orgId}/shift/close`, { body: { loc, toUserId: to === "pool" ? null : to, items: sel.map((t) => ({ taskId: t.id, summary: sums[t.id] ?? t.summary ?? "" })) } }),
    sel.length ? `Turno cerrado. ${sel.length} tarea${sel.length === 1 ? "" : "s"} ${to === "pool" ? "volvieron a la cola" : "esperan aceptación"}.` : "Turno cerrado sin pendientes.")
    .then(() => { s.reload(); h.reload(); shell.refreshBadges(); });
  const health = sel.some((t) => mentionsHealth(sums[t.id] ?? t.summary ?? ""));
  return (
    <>
      <Head kicker="El resumen no incluye tus notas personales ni datos de salud" title="Traspaso de turno" />
      {s.data && s.data.status !== "on" && <div className="gy-warn"><span>{s.data.status === "ended" ? "Ya cerraste tu turno. Los traspasos enviados esperan aceptación." : "Iniciá tu turno para poder cerrarlo con traspaso."}</span></div>}
      {h.err && <p role="alert" className="err-box">{h.err}</p>}
      {h.data && s.data?.status === "on" && (
        <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))" }}>
          <section className="card">
            <h2>Pendientes a traspasar</h2>
            {!h.data.tasks.length && <span className="muted" style={{ fontSize: 14 }}>No tenés tareas abiertas. Podés cerrar el turno.</span>}
            {h.data.tasks.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", borderBottom: "1px solid #EEF2F6", padding: "10px 0" }}>
                <input type="checkbox" checked={!off[t.id]} onChange={() => setOff((x) => ({ ...x, [t.id]: !x[t.id] }))} aria-label={`Traspasar ${t.ref}`} style={{ width: 20, height: 20, accentColor: "#00D1FF", marginTop: 2 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{t.member ?? "Sin socio"} · {TASK_CATEGORY[t.category]} <span className="muted">{t.ref}</span></span>
                  <textarea className="note" rows={2} value={sums[t.id] ?? t.summary ?? ""} disabled={!!off[t.id]} onChange={(e) => setSums((x) => ({ ...x, [t.id]: e.target.value }))} aria-label={`Resumen de ${t.ref}`} maxLength={500} />
                </div>
              </div>
            ))}
            {health && <p className="gy-warn" role="note" style={{ margin: 0 }}>Algún resumen parece mencionar datos de salud. Dejá sólo lo operativo.</p>}
          </section>
          <section className="card">
            <h2>¿A quién se lo pasás?</h2>
            {[...h.data.targets.map((x) => ({ id: x.id, label: x.name, sub: x.next ? `Próximo turno: ${x.next.label} ${x.next.from}–${x.next.to} · ${x.next.date.split("-").reverse().slice(0, 2).join("/")}` : "Sin turno planificado" })),
              { id: "pool", label: "Cola compartida", sub: "La toma quien esté en turno" }].map((o) => (
              <label key={o.id} className="mrow" style={{ border: `1px solid ${to === o.id ? "#00D1FF" : "#E2E8F0"}` }}>
                <input type="radio" name="to" checked={to === o.id} onChange={() => setTo(o.id)} />
                <span><b style={{ fontSize: 14 }}>{o.label}</b><small className="muted">{o.sub}</small></span>
              </label>
            ))}
            <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{sel.length ? `${sel.length} tarea${sel.length === 1 ? "" : "s"} a ${toName}. ${to === "pool" ? "Vuelven a la cola sin asignar." : "Quedan pendientes hasta que la acepte: enviar no es aceptar."}` : "No traspasás tareas."}</span>
            <button type="button" className="btn pri" aria-busy={busy === "close" || undefined} onClick={send}>Cerrar turno{sel.length ? " y traspasar" : ""}</button>
          </section>
        </div>
      )}
      {h.data && (
        <section className="card">
          <h2>Historial de traspasos</h2>
          {!h.data.history.length && <span className="muted" style={{ fontSize: 14 }}>Sin traspasos todavía.</span>}
          {h.data.history.map((x, i) => <div key={i} className="trow"><span className="muted" style={{ flex: "0 0 130px" }}>{when(x.at)}</span><span>{x.from} traspasó {x.n} tarea{x.n === 1 ? "" : "s"} a {x.to}</span></div>)}
        </section>
      )}
    </>
  );
}
