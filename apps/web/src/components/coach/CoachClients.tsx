"use client";
import { useEffect, useMemo, useState } from "react";
import { formatClock, formatRest, type ProgramDoc } from "@repi/domain";
import { api } from "@/lib/api";
import { SensitiveTab } from "./CoachHealth";
import { fmtDate, fmtIsoDay, initials, nf, relTime, type ClientRow, type Overview, type Screen } from "./types";
import { Ic } from "@/components/ui/Ic";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { ClientPayTab } from "./CoachPayments";

type Detail = {
  id: string; name: string; status: string; since: string; grants: string[];
  program: { programId: string; startsOn: string; version: number; doc: ProgramDoc } | null;
  sessions: { id: string; dayName: string; status: string; startedAt: string; endedAt: string | null; rpe: number | null; note: string | null; durationSec: number; sets: number; volumeKg: number }[];
};
const TABS: [string, string][] = [["res", "Resumen"], ["rend", "Rendimiento"], ["prog", "Rutinas"], ["progreso", "Progreso"], ["salud", "Salud"], ["nutri", "Nutrición"], ["body", "Mi cuerpo"], ["pay", "Pagos"]];
const FILTERS: [string, string][] = [["all", "Todos"], ["active", "Activos"], ["noprog", "Sin programa"], ["paused", "En pausa"]];
const SORTS: [string, string][] = [["name", "Nombre"], ["adh", "Adherencia"], ["last", "Actividad"]];

export function CoachClients({ orgId, ov, sel, setSel, onInvite, go, flash }: {
  orgId: string; ov: Overview; sel: string | null; setSel: (id: string) => void; onInvite: () => void; flash: (t: string) => void;
  go: (s: Screen, e?: { sel?: string; pid?: string | null }) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [tab, setTab] = useState("res");
  const [det, setDet] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let l = ov.clients.filter((c) => (!qq || c.name.toLowerCase().includes(qq)) &&
      (filter === "all" || (filter === "active" && c.status === "active") || (filter === "noprog" && !c.program) || (filter === "paused" && c.status === "paused")));
    l = l.slice().sort((a, b) => sort === "adh" ? (a.adherence ?? -1) - (b.adherence ?? -1) : sort === "last" ? (b.lastSessionAt ?? "").localeCompare(a.lastSessionAt ?? "") : a.name.localeCompare(b.name));
    return l;
  }, [ov.clients, q, filter, sort]);
  const current: ClientRow | undefined = ov.clients.find((c) => c.id === sel) ?? list[0];
  useEffect(() => {
    if (!current) { setDet(null); return; }
    setDet(null); setErr(null);
    api<Detail>(`/api/coach/${orgId}/clients/${current.id}`).then(setDet).catch((e) => setErr(e.message));
  }, [orgId, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="co-head">
        <div><span className="co-kicker">{ov.clients.length} {ov.clients.length === 1 ? "cliente" : "clientes"}</span><h1 tabIndex={-1}>Clientes</h1></div>
        <div className="co-actions"><button type="button" className="btn" onClick={onInvite}>Invitar cliente</button></div>
      </div>
      {!ov.clients.length ? (
        <div className="empty">Todavía no tenés clientes. Invitá al primero: recibe un enlace y acepta desde su app.</div>
      ) : (
        <div className="split">
          <div className="list-pane">
            <label className="search"><Ic i={MagnifyingGlass} size={16} color="#5B6B80" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" /></label>
            <div className="pills">{FILTERS.map(([k, l]) => <button type="button" key={k} className="pill" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
            <div className="sorts">Ordenar: {SORTS.map(([k, l]) => <button type="button" key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}</div>
            {list.map((c) => (
              <button type="button" key={c.id} className="crow" aria-current={c.id === current?.id} onClick={() => { setSel(c.id); setTab("res"); }}>
                <span className="av36">{initials(c.name)}</span>
                <span><b>{c.name}</b><small className="muted">{c.program?.name ?? "Sin programa"} · {relTime(c.lastSessionAt)}</small></span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  <strong style={{ fontSize: 13 }}>{c.adherence == null ? "—" : `${c.adherence}%`}</strong>
                  {!c.program && c.status === "active" && <span className="chip warn">Sin programa</span>}
                  {c.status === "paused" && <span className="chip mute">En pausa</span>}
                </span>
              </button>
            ))}
            {!list.length && <span className="muted" style={{ padding: 20, textAlign: "center", fontSize: 14 }}>Sin resultados.</span>}
          </div>
          <div className="detail-pane">
            {err && <p role="alert" className="err-box">{err}</p>}
            {current && (
              <section className="card who" style={{ flexDirection: "row" }}>
                <span className="av56">{initials(current.name)}</span>
                <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 22, fontWeight: 600 }}>{current.name}</span><span className="muted" style={{ fontSize: 13 }}>Cliente desde {fmtDate(current.since, { month: "short", year: "numeric" })}{current.status === "paused" ? " · En pausa" : ""}</span></div>
                <div className="co-actions">
                  {det?.program ? <button type="button" className="btn pri" onClick={() => go("builder", { pid: det.program!.programId })}>Editar programa</button>
                    : <button type="button" className="btn pri" onClick={() => go("builder", { pid: null })}>Asignar programa</button>}
                </div>
              </section>
            )}
            <div className="tabs" role="tablist" aria-label="Ficha del cliente">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
            {!det ? <p className="muted">Cargando ficha…</p> : <Tab tab={tab} det={det} row={current!} orgId={orgId} flash={flash} />}
          </div>
        </div>
      )}
    </>
  );
}

function Tab({ tab, det, row, orgId, flash }: { tab: string; det: Detail; row: ClientRow; orgId: string; flash: (t: string) => void }) {
  const done = det.sessions.filter((s) => s.status === "completed");
  if (tab === "res") return (
    <>
      <div className="grid-kpi">
        <div className="stat"><span>Adherencia</span><strong>{row.adherence == null ? "—" : `${row.adherence}%`}</strong><small className="muted">Semana actual · {row.weekDone} de {row.program?.days ?? "—"}</small></div>
        <div className="stat"><span>Última sesión</span><strong>{relTime(row.lastSessionAt)}</strong><small className="muted">{done[0]?.dayName ?? ""}</small></div>
        <div className="stat"><span>Programa</span><strong style={{ fontSize: 18 }}>{det.program ? det.program.doc.name : "Sin programa"}</strong><small className="muted">{det.program ? `Desde ${fmtIsoDay(det.program.startsOn)} · versión ${det.program.version}` : "Asignale uno desde Programas"}</small></div>
        <div className="stat"><span>Sesiones registradas</span><strong>{done.length}</strong><small className="muted">Últimas 20</small></div>
      </div>
      <Sessions det={det} />
    </>
  );
  if (tab === "prog") return det.program ? (
    <section className="card">
      <h2>{det.program.doc.name}</h2>
      <span className="muted">{det.program.doc.weeks} semanas · {det.program.doc.days.length} días · versión {det.program.version}{det.program.doc.note ? ` · ${det.program.doc.note}` : ""}</span>
      {det.program.doc.days.map((d) => (
        <div key={d.name} className="trow" style={{ alignItems: "flex-start" }}><b style={{ flex: "0 0 140px" }}>{d.name}</b><span style={{ flex: 1 }}>{d.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}${e.rir != null ? ` · RIR ${e.rir}` : ""} · ${formatRest(e.restSec)}`).join(" — ") || "Sin ejercicios"}</span></div>
      ))}
    </section>
  ) : <div className="empty">Sin programa asignado.</div>;
  if (tab === "pay") return <ClientPayTab key={det.id} orgId={orgId} relId={det.id} name={det.name} flash={flash} />;
  const SENS: Record<string, "health" | "nutrition" | "measurements"> = { salud: "health", nutri: "nutrition", body: "measurements" };
  if (SENS[tab]) return <SensitiveTab key={`${det.id}-${tab}`} orgId={orgId} relId={det.id} name={det.name} item={SENS[tab]} flash={flash} />;
  const msg: Record<string, string> = {
    rend: "1RM estimado y volumen por grupo todavía no están disponibles. Los check-ins están en la pestaña Salud.",
    progreso: "Los gráficos de progreso todavía no están disponibles. El registro de sesiones está en Resumen.",
  };
  return <div className="empty">{msg[tab]}</div>;
}

function Sessions({ det }: { det: Detail }) {
  return (
    <section className="card">
      <h2>Registro de sesiones</h2>
      {!det.sessions.length ? <span className="muted" style={{ fontSize: 14 }}>Todavía no registró entrenamientos.</span> : (
        <div className="table">
          {det.sessions.map((s) => (
            <div key={s.id} className="trow">
              <span style={{ flex: "0 0 90px" }} className="muted">{fmtDate(s.endedAt ?? s.startedAt, { weekday: "short", day: "numeric", month: "short" })}</span>
              <b style={{ flex: "1 1 120px" }}>{s.dayName}</b>
              <span style={{ flex: "0 0 auto" }}>{s.status === "completed" ? `${formatClock(s.durationSec)} · ${s.sets} series · ${nf(s.volumeKg)} kg` : <span className="chip info">En curso</span>}</span>
              {s.rpe != null && <span className="chip mute">RPE {s.rpe}</span>}
              {s.note && <span style={{ flexBasis: "100%", fontSize: 13, color: "#334155" }}>“{s.note}”</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
