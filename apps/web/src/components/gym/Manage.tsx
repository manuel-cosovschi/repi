"use client";
// Gerencia y coordinación: Panel, Equipo, Tareas, Turnos, Participación (REPI Desktop Gym.dc.html · sc.mdash/staff/tasks/shifts/engage).
import { useState } from "react";
import { GYM_ROLE_LABEL, INVITABLE_GYM_ROLES, TASK_CATEGORY, TASK_PRIORITY, type GymRole } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { TrainerDetail } from "./Perf";
import { Bars, Head, HBar, LocSelect, PRI_CHIP, dec, fmt, initials, nf, stars, useAct, useLoad, when, type Shell, type Task } from "./shared";

type Panel = {
  kpis: { roster: number; members: number; adoption: number | null; onShift: number; shared: number; followOverdue: number; followOpen: number; satisfaction: number | null; reviews30: number };
  onShift: { id: string; name: string; since: string; openTasks: number }[]; taskBars: { label: string; n: number }[]; weeks: { label: string; n: number }[];
  stale: { ref: string; taskId: string; toUserId: string; since: string }[]; recentReviews: { id: string; stars: number; text: string | null; trainer: string; at: string }[];
};

export function PanelScreen({ shell }: { shell: Shell }) {
  const p = useLoad<Panel>(`/api/gym/${shell.orgId}/panel${shell.loc ? `?loc=${shell.loc}` : ""}`);
  const k = p.data?.kpis;
  const locName = shell.ctx.locations.find((l) => l.id === shell.loc)?.name ?? shell.ctx.locations[0]?.name;
  return (
    <>
      <Head kicker={`${shell.ctx.org.name} · ${locName}`} title="Panel de la sede" />
      {p.err && <p role="alert" className="err-box">{p.err}</p>}
      {k && (
        <div className="grid-kpi">
          {([["Socios en padrón", nf(k.roster), "Cargados por el gym", "engage"], ["Socios en REPI", nf(k.members), k.adoption == null ? "Sin padrón para comparar" : `${k.adoption}% del padrón tiene cuenta`, "engage"],
            ["Entrenadores en turno", nf(k.onShift), "Ahora", "shifts"], ["Solicitudes sin asignar", nf(k.shared), "Cola compartida", "tasks"],
            ["Seguimientos vencidos", nf(k.followOverdue), `De ${k.followOpen} abiertos`, "tasks"], ["Satisfacción", k.satisfaction == null ? "—" : dec(k.satisfaction), k.satisfaction == null ? `Muestra insuficiente (${k.reviews30})` : `${k.reviews30} reseñas · 30 días`, "reviews"]] as const).map(([l, v, s, to]) => (
            <button type="button" key={l} className="kpi" onClick={() => shell.go(to)}><span>{l}</span><strong>{v}</strong><small>{s}</small></button>
          ))}
        </div>
      )}
      {!!p.data?.stale.length && <div className="gy-warn"><span>{p.data.stale.length} traspaso{p.data.stale.length === 1 ? "" : "s"} sin aceptar a más de 30 minutos del inicio del turno de quien lo recibe ({p.data.stale.map((s) => s.ref).join(", ")}). Revisalos en Tareas.</span></div>}
      {p.data && (
        <div className="grid-2">
          <section className="card">
            <h2>En turno ahora</h2>
            {!p.data.onShift.length && <span className="muted" style={{ fontSize: 14 }}>Nadie inició turno.</span>}
            {p.data.onShift.map((o) => <button key={o.id} type="button" className="crow" onClick={() => shell.go("staff", { sel: o.id })}><span className="av36">{initials(o.name)}</span><span><b>{o.name}</b><small className="muted">Desde {fmt(o.since, { hour: "2-digit", minute: "2-digit" })}</small></span><span className="chip mute">{o.openTasks} abiertas</span></button>)}
          </section>
          <section className="card">
            <h2>Tareas</h2>
            {p.data.taskBars.map((b) => <HBar key={b.label} label={b.label} n={b.n} max={Math.max(1, ...p.data!.taskBars.map((x) => x.n))} />)}
          </section>
          <section className="card"><h2>Sesiones registradas por semana</h2><Bars data={p.data.weeks} label="Sesiones por semana" /><span className="muted">Entrenamientos del programa institucional de socios de la sede.</span></section>
          <section className="card">
            <h2>Reseñas recientes</h2>
            {p.data.recentReviews.map((r) => <div key={r.id} className="trow"><span style={{ color: "#007EA0" }}>{stars(r.stars)}</span><span style={{ flex: 1 }}>{r.text ?? <i className="muted">Sin comentario</i>}</span><span className="muted">{r.trainer} · {fmt(r.at)}</span></div>)}
            {!p.data.recentReviews.length && <span className="muted" style={{ fontSize: 14 }}>Sin reseñas todavía.</span>}
            <button type="button" className="gy-link" onClick={() => shell.go("reviews")}>Ver análisis de reseñas</button>
          </section>
        </div>
      )}
    </>
  );
}

// ── Equipo ──────────────────────────────────────────────────────────────────
type Team = { canManage: boolean; staff: { id: string; name: string; roles: string[]; location: string; onShift: boolean; shiftSince: string | null; plannedToday: { label: string; from: string; to: string } | null; openTasks: number; afterHoursAccess: boolean }[] };

export function TeamScreen({ shell }: { shell: Shell }) {
  const owner = shell.ctx.roles.includes("owner");
  const t = useLoad<Team>(`/api/gym/${shell.orgId}/team${shell.loc ? `?loc=${shell.loc}` : ""}`);
  const [q, setQ] = useState("");
  const [invite, setInvite] = useState(false);
  const { run } = useAct(shell.flash);
  if (shell.sel) return <TrainerDetail shell={shell} id={shell.sel} onBack={() => shell.setSel(null)} backLabel={owner ? "Equipo y servicio" : "Equipo"} />;
  const list = (t.data?.staff ?? []).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string, on: boolean) => run(id, () => api(`/api/gym/${shell.orgId}/team/${id}/after-hours`, { body: { on } }), on ? "Trabajo fuera de turno habilitado. Queda marcado en la atribución." : "Trabajo fuera de turno deshabilitado.").then(() => t.reload());
  return (
    <>
      <Head kicker={shell.ctx.org.name} title="Equipo">{t.data?.canManage && <button type="button" className="btn pri" onClick={() => setInvite(true)}>Invitar al equipo</button>}</Head>
      {t.err && <p role="alert" className="err-box">{t.err}</p>}
      <label className="search" style={{ maxWidth: 420 }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona" aria-label="Buscar persona" /></label>
      <section className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="gy-table">
          <thead><tr><th scope="col">Persona</th><th scope="col">Rol</th><th scope="col">Hoy</th><th scope="col">Tareas abiertas</th><th scope="col">Fuera de turno</th></tr></thead>
          <tbody>
            {list.map((s) => {
              const floor = s.roles.some((r) => r === "floor_trainer" || r === "coordinator");
              return (
                <tr key={s.id}>
                  <td>{floor ? <button type="button" className="gy-person" onClick={() => shell.setSel(s.id)}><span className="av36" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(s.name)}</span><span><b>{s.name}</b><small className="muted">{s.location}</small></span></button>
                    : <span className="gy-person"><span className="av36" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(s.name)}</span><span><b>{s.name}</b><small className="muted">{s.location}</small></span></span>}</td>
                  <td>{s.roles.map((r) => GYM_ROLE_LABEL[r as GymRole] ?? r).join(", ")}</td>
                  <td>{s.onShift ? <span className="chip ok">En turno desde {fmt(s.shiftSince, { hour: "2-digit", minute: "2-digit" })}</span> : s.plannedToday ? <span className="chip mute">{s.plannedToday.label} {s.plannedToday.from}–{s.plannedToday.to}</span> : <span className="muted">—</span>}</td>
                  <td>{floor ? s.openTasks : "—"}</td>
                  <td>{floor && t.data!.canManage ? <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={s.afterHoursAccess} onChange={(e) => toggle(s.id, e.target.checked)} />{s.afterHoursAccess ? "Habilitado" : "No"}</label> : floor ? (s.afterHoursAccess ? "Habilitado" : "No") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {t.data && !list.length && <div className="empty" style={{ margin: 16 }}>Sin personas.</div>}
      </section>
      <span className="muted">“Fuera de turno” permite tomar y completar tareas sin turno iniciado (trabajo remoto autorizado). La política final está pendiente (D08).</span>
      {invite && <InviteStaff shell={shell} onClose={() => { setInvite(false); t.reload(); }} />}
    </>
  );
}

function InviteStaff({ shell, onClose }: { shell: Shell; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<GymRole>("floor_trainer");
  const [loc, setLoc] = useState(shell.loc ?? shell.ctx.locations[0]?.id ?? "");
  const [code, setCode] = useState<string | null>(null);
  const { busy, run } = useAct(shell.flash);
  const send = async () => {
    const r = await run("inv", () => api<{ id: string }>(`/api/access/gym/${shell.orgId}/invitations`, { body: { email, role, locationId: loc || null } }));
    if (r) setCode(email);
  };
  return (
    <Modal label="Invitar al equipo" onClose={onClose}>
      <div className="mhead"><h2>Invitar al equipo</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      {code ? (<><p style={{ margin: 0 }}>Le enviamos la invitación a <b>{code}</b>. Vence en 7 días.</p><div className="mfoot"><button type="button" className="btn pri" onClick={onClose}>Listo</button></div></>) : (
        <>
          <label className="field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <div className="pills" role="group" aria-label="Rol">{INVITABLE_GYM_ROLES.filter((r) => r !== "manager" || shell.ctx.roles.includes("owner")).map((r) => <button key={r} type="button" className="pill" aria-pressed={role === r} onClick={() => setRole(r)}>{GYM_ROLE_LABEL[r]}</button>)}</div>
          <LocSelect shell={shell} value={loc} onChange={(v) => setLoc(v ?? "")} />
          <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn pri" aria-busy={busy === "inv" || undefined} onClick={send}>Enviar invitación</button></div>
        </>
      )}
    </Modal>
  );
}

// ── Tareas (gerencia: sólo metadatos) ───────────────────────────────────────
export function TasksScreen({ shell }: { shell: Shell }) {
  const [filter, setFilter] = useState("all");
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const t = useLoad<{ tasks: Task[]; staff: { id: string; name: string }[] }>(`/api/gym/${shell.orgId}/tasks?loc=${loc}&filter=${filter}`);
  const [re, setRe] = useState<Task | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const { busy, run } = useAct(shell.flash);
  const st = (x: Task): [string, string] => x.status === "done" ? ["Completada", "ok"] : x.status === "pending_acceptance" ? ["Traspaso pendiente", "info"] : x.assignee ? ["Asignada", "mute"] : ["Sin asignar", "warn"];
  return (
    <>
      <Head kicker="Sólo metadatos: el contenido de cada pedido lo ve el equipo de sala" title="Tareas" />
      <div className="pills" role="group" aria-label="Filtro">{[["all", "Todas"], ["shared", "Sin asignar"], ["open", "Asignadas"], ["pending", "Traspasos"], ["done", "Completadas · 30 días"]].map(([k, l]) => <button key={k} type="button" className="pill" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
      {t.err && <p role="alert" className="err-box">{t.err}</p>}
      <section className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="gy-table">
          <thead><tr><th scope="col">Tarea</th><th scope="col">Socio</th><th scope="col">Tipo</th><th scope="col">Prioridad</th><th scope="col">Estado</th><th scope="col">Responsable</th><th scope="col">Creada</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>
            {t.data?.tasks.map((x) => {
              const [l, c] = st(x);
              return (
                <tr key={x.id}>
                  <td style={{ font: "500 12px var(--font-mono)" }}>{x.ref}</td><td>{x.member ?? "—"}</td><td>{TASK_CATEGORY[x.category]}</td>
                  <td><span className={`chip ${PRI_CHIP[x.priority]}`}>{TASK_PRIORITY[x.priority]}</span></td>
                  <td><span className={`chip ${c}`}>{l}</span>{x.overdue && <> <span className="chip warn">Vencida</span></>}</td>
                  <td>{x.status === "done" ? x.completedBy ?? "Sin atribución" : x.assignee?.name ?? "—"}</td><td>{when(x.createdAt)}</td>
                  <td>{x.status !== "done" && <button type="button" className="btn sm" onClick={() => { setRe(x); setTo(x.assignee?.id ?? null); }}>Reasignar</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {t.data && !t.data.tasks.length && <div className="empty" style={{ margin: 16 }}>Sin tareas en este filtro.</div>}
      </section>
      {re && t.data && (
        <Modal label={`Reasignar ${re.ref}`} onClose={() => setRe(null)}>
          <div className="mhead"><h2>Reasignar {re.ref}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => setRe(null)}>×</button></div>
          {[...t.data.staff.map((s) => ({ id: s.id as string | null, name: s.name })), { id: null, name: "Cola compartida (sin asignar)" }].map((s) => (
            <label key={s.id ?? "pool"} className="mrow" style={{ border: `1px solid ${to === s.id ? "#00D1FF" : "#E2E8F0"}` }}><input type="radio" name="to" checked={to === s.id} onChange={() => setTo(s.id)} /><span style={{ fontSize: 14 }}>{s.name}</span></label>
          ))}
          <div className="mfoot"><button type="button" className="btn" onClick={() => setRe(null)}>Cancelar</button>
            <button type="button" className="btn pri" aria-busy={busy === "re" || undefined} onClick={() => run("re", () => api(`/api/gym/${shell.orgId}/tasks/${re.id}/reassign`, { body: { toUserId: to } }), `${re.ref} reasignada.`).then((r) => { if (r) { setRe(null); t.reload(); } })}>Reasignar</button></div>
        </Modal>
      )}
    </>
  );
}

// ── Turnos ──────────────────────────────────────────────────────────────────
type Week = { location: { id: string; name: string }; weekStart: string; prevWeek: string; nextWeek: string; days: string[]; labels: string[]; rows: { userId: string; name: string; cells: (string | null)[]; hours: number }[];
  coverage: Record<"M" | "T" | "N", number>[]; gaps: string[]; codes: Record<string, { label: string; from: string; to: string }> };
const CYCLE = ["M", "T", "N", "P", "F", null] as const;

export function ShiftsScreen({ shell }: { shell: Shell }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const [week, setWeek] = useState<string | null>(null);
  const w = useLoad<Week>(`/api/gym/${shell.orgId}/shifts?loc=${loc}${week ? `&week=${week}` : ""}`);
  const { run } = useAct(shell.flash);
  const cycle = async (userId: string, date: string, cur: string | null) => {
    const next = CYCLE[(CYCLE.indexOf(cur as (typeof CYCLE)[number]) + 1) % CYCLE.length];
    w.setData((d) => d && { ...d, rows: d.rows.map((r) => r.userId === userId ? { ...r, cells: r.cells.map((c, i) => d.days[i] === date ? next : c) } : r) });
    await run("cell", () => api(`/api/gym/${shell.orgId}/shifts`, { body: { loc, userId, date, code: next } }));
    w.reload();
  };
  const lbl = (c: string | null) => (c && w.data ? `${w.data.codes[c].from.slice(0, 2)}–${w.data.codes[c].to.slice(0, 2)}` : "—");
  return (
    <>
      <Head kicker={w.data ? `${shell.ctx.org.name} · ${w.data.location.name}` : ""} title="Turnos">
        <button type="button" className="btn sm" onClick={() => setWeek(w.data?.prevWeek ?? null)}>← Semana anterior</button>
        <button type="button" className="btn sm" onClick={() => setWeek(w.data?.nextWeek ?? null)}>Semana siguiente →</button>
      </Head>
      {w.err && <p role="alert" className="err-box">{w.err}</p>}
      {w.data && (
        <>
          <div className={w.data.gaps.length ? "gy-warn" : "banner"}><span>{w.data.gaps.length ? `${w.data.gaps.length} franjas sin cobertura: ${w.data.gaps.slice(0, 5).join(", ")}${w.data.gaps.length > 5 ? "…" : ""}` : "Toda la semana tiene cobertura."} Criterio propuesto: al menos una persona por franja (la noche del domingo no se exige).</span></div>
          <section className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="gy-table gy-grid">
              <thead><tr><th scope="col">Persona</th>{w.data.labels.map((l) => <th key={l} scope="col">{l}</th>)}<th scope="col">Horas</th></tr></thead>
              <tbody>
                {w.data.rows.map((r) => (
                  <tr key={r.userId}><th scope="row">{r.name}</th>
                    {r.cells.map((c, i) => <td key={i}><button type="button" className={`gy-cell${c === "N" ? " night" : c ? " on" : ""}`} aria-label={`${r.name}, ${w.data!.labels[i]}: ${c ? w.data!.codes[c].label : "sin turno"}. Cambiar`} onClick={() => cycle(r.userId, w.data!.days[i], c)}>{lbl(c)}</button></td>)}
                    <td>{dec(r.hours)} h</td></tr>
                ))}
                {(["M", "T", "N"] as const).map((b) => (
                  <tr key={b}><th scope="row" className="muted">{b === "M" ? "Mañana" : b === "T" ? "Tarde" : "Noche"}</th>
                    {w.data!.coverage.map((c, i) => { const gap = !c[b] && !(b === "N" && i === 6); return <td key={i}><span className={`chip ${gap ? "bad" : "ok"}`}>{gap ? "Sin cobertura" : c[b] ? `${c[b]} en sala` : "—"}</span></td>; })}<td /></tr>
                ))}
              </tbody>
            </table>
            {!w.data.rows.length && <div className="empty" style={{ margin: 16 }}>No hay personal de sala en esta sede.</div>}
          </section>
          <span className="muted">Tocá una celda para rotar: mañana 07–13, tarde 13–19, noche 19–23, mañana parcial 09–13, fin de semana 09–15, libre.</span>
        </>
      )}
    </>
  );
}

// ── Participación ───────────────────────────────────────────────────────────
type Eng = { funnel: { label: string; n: number | null; note: string | null }[]; freq: { label: string; perMember: number | null }[]; withoutProgram: number; newThisMonth: number };

export function EngageScreen({ shell }: { shell: Shell }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const e = useLoad<Eng>(`/api/gym/${shell.orgId}/engage?loc=${loc}`);
  const { busy, run } = useAct(shell.flash);
  const max = Math.max(1, ...(e.data?.funnel.map((f) => f.n ?? 0) ?? [1]));
  const create = () => run("t", () => api<{ created: number }>(`/api/gym/${shell.orgId}/engage/program-tasks`, { body: { loc } }), (r) => { const n = (r as { created: number }).created; return n ? `Se crearon ${n} tareas "Programa nuevo" en la cola compartida.` : "No hay socios sin programa ni tarea pendiente."; }).then(() => e.reload());
  return (
    <>
      <Head kicker="Agregados de la sede · sin datos de salud" title="Participación de socios" />
      {e.err && <p role="alert" className="err-box">{e.err}</p>}
      {e.data && (
        <div className="grid-2">
          <section className="card"><h2>Embudo</h2>{e.data.funnel.map((f) => <HBar key={f.label} label={f.label} n={f.n} max={max} note={f.note} />)}</section>
          <section className="card"><h2>Sesiones por socio por semana</h2><Bars data={e.data.freq.map((f) => ({ label: f.label, n: f.perMember }))} label="Sesiones por socio" fmtV={(v) => dec(v)} /></section>
          <section className="card">
            <h2>Socios en REPI sin programa</h2><strong style={{ fontSize: 28 }}>{nf(e.data.withoutProgram)}</strong>
            {shell.ctx.caps.includes("task.create") && <div><button type="button" className="btn sm pri" aria-busy={busy === "t" || undefined} onClick={create}>Crear tareas de programa</button></div>}
            <span className="muted">Una tarea por socio, sin duplicar las que ya están abiertas.</span>
          </section>
          <section className="card"><h2>Socios nuevos en 30 días</h2><strong style={{ fontSize: 28 }}>{nf(e.data.newThisMonth)}</strong><span className="muted">Desafíos y Repi Club: Etapa 6.</span></section>
        </div>
      )}
    </>
  );
}
