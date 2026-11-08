"use client";
import { StudentPreview } from "./StudentPreview";
import { SharedWishes, type SharedWishesView } from "./SharedWishes";
import { useMemo, useRef, useState } from "react";
import { EXERCISE_CHANGE_REASONS, activityOf, formatClock, formatRest, prescriptionText, type ExerciseChangeReason, type ProgramDoc } from "@repi/domain";
import { api } from "@/lib/api";
import { SensitiveTab } from "./CoachHealth";
import { fmtDate, fmtIsoDay, initials, nf, relTime, type ClientRow, type Overview, type Screen } from "./types";
import { Ic } from "@/components/ui/Ic";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react";
import { ClientPayTab } from "./CoachPayments";
import { GoalsTab } from "./CoachGoals";
import { ImportModal } from "./ImportModal";
import { useLoad } from "@/components/gym/shared";
import { featureOn } from "@/lib/features";
import { SessionLog, type LoggedExercise } from "./SessionLog";
import { IntelSection } from "./CoachIntelligence";
import { stashTiDraft, type TiDraft } from "./ProposalDraft";
import { RepiSignals } from "./RepiSignals";
import { useCached } from "@/lib/cache";
import { Skel } from "@/components/motion/Skeleton";
import { SlideIndicator } from "@/components/motion/SlideIndicator";

type Detail = {
  id: string; name: string; status: string; since: string; grants: string[];
  program: { programId: string; startsOn: string; version: number; doc: ProgramDoc } | null;
  wishes?: SharedWishesView | null;
  sessions: { id: string; dayName: string; status: string; startedAt: string; endedAt: string | null; rpe: number | null; note: string | null; durationSec: number; sets: number; volumeKg: number;
    changes?: { exercise: string; kind: "skip" | "substitute"; reason: ExerciseChangeReason; substitute: string | null }[]; exercises: LoggedExercise[] }[];
};
// Nutrición y Mi cuerpo sólo con su módulo encendido (FEATURE_FLAGS.md): sin carga del alumno serían pantallas vacías.
const TABS: [string, string][] = ([["res", "Resumen"], ["rend", "Rendimiento"], ["prog", "Rutinas"], ["progreso", "Progreso"], ["salud", "Salud"], ["nutri", "Nutrición"], ["body", "Mi cuerpo"], ["pay", "Pagos"]] as [string, string][])
  .filter(([k]) => (k !== "nutri" || featureOn("nutrition")) && (k !== "body" || featureOn("body")));
const FILTERS: [string, string][] = [["all", "Todos"], ["active", "Activos"], ["noprog", "Sin programa"], ["paused", "En pausa"]];
const SORTS: [string, string][] = [["name", "Nombre"], ["adh", "Adherencia"], ["last", "Actividad"]];

export function CoachClients({ orgId, ov, sel, setSel, initialTab, onInvite, onImported, go, flash, solo, onOpen }: {
  orgId: string; ov: Overview; sel: string | null; setSel: (id: string | null) => void; initialTab?: string | null; onInvite: () => void; onImported: () => void; flash: (t: string) => void;
  go: (s: Screen, e?: { sel?: string; pid?: string | null }) => void;
  /** Ficha sola (pedido del titular, 07/11/2026): sin la lista, con «Volver» a la pantalla de origen. */
  solo?: { back: { label: string; go: () => void } | null };
  /** Abrir la ficha como página cuando la lista y la ficha no entran lado a lado. */
  onOpen?: (id: string, name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [importing, setImporting] = useState(false);
  const okTab = (t?: string | null): t is string => !!t && TABS.some(([k]) => k === t);
  const [tab, setTab] = useState(() => (okTab(initialTab) ? initialTab : "res"));
  // M06: la pantalla queda viva entre visitas, así que un pedido nuevo de pestaña (D210: «Revisar» → Rendimiento) se aplica
  // también sin volver a montar.
  const [askedTab, setAskedTab] = useState(initialTab);
  if (initialTab !== askedTab) { setAskedTab(initialTab); if (okTab(initialTab)) setTab(initialTab); }
  const [preview, setPreview] = useState(false); // D195: vista previa de sólo lectura

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let l = ov.clients.filter((c) => (!qq || c.name.toLowerCase().includes(qq)) &&
      (filter === "all" || (filter === "active" && c.status === "active") || (filter === "noprog" && !c.program) || (filter === "paused" && c.status === "paused")));
    l = l.slice().sort((a, b) => sort === "adh" ? (a.adherence ?? -1) - (b.adherence ?? -1) : sort === "last" ? (b.lastSessionAt ?? "").localeCompare(a.lastSessionAt ?? "") : a.name.localeCompare(b.name));
    return l;
  }, [ov.clients, q, filter, sort]);
  const current: ClientRow | undefined = ov.clients.find((c) => c.id === sel) ?? (solo ? undefined : list[0]);
  // M06: ficha cacheada por id (al volver, al instante; nunca la de otro cliente) y revalidada siempre.
  const D = useCached<Detail>(current ? `/api/coach/${orgId}/clients/${current.id}` : null);
  const det = D.data, err = det ? null : D.err;
  const splitRef = useRef<HTMLDivElement>(null);
  const pickRow = (c: ClientRow) => {
    // Lista y ficha no entran lado a lado (836 px, ver .split): la ficha se abre como página, sin quedar debajo de la lista.
    if (onOpen && (splitRef.current?.clientWidth ?? 9999) < 836) { onOpen(c.id, c.name); return; }
    setSel(c.id); setTab("res");
  };

  // Pausar, reactivar o terminar la relación (D115); terminar saca al alumno de esta lista.
  const relStatus = async (status: "active" | "paused" | "ended", ask?: string) => {
    if (!current || (ask && !window.confirm(ask))) return;
    try {
      await api(`/api/coach/${orgId}/clients/${current.id}/status`, { body: { status } });
      flash(status === "paused" ? `La relación con ${current.name} quedó en pausa.` : status === "active" ? `La relación con ${current.name} volvió a estar activa.` : `Terminaste la relación con ${current.name}.`);
      onImported();
    } catch (e) { flash((e as Error).message); }
  };

  const detail = (
    <div className="detail-pane">
      {!solo && <button type="button" className="btn sm co-list-back" onClick={() => setSel(null)}><Ic i={ArrowLeft} size={16} /> Todos los clientes</button>}
      {err && <p role="alert" className="err-box">{err}</p>}
      {solo && !current && <div className="empty">Ese cliente ya no está en tu lista.</div>}
      {current && (
        <section className="card who" style={{ flexDirection: "row" }}>
          <span className="av56">{initials(current.name)}</span>
          <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 4 }}>{!solo && <span style={{ fontSize: 22, fontWeight: 600 }}>{current.name}</span>}<span className="muted" style={{ fontSize: 13 }}>Cliente desde {fmtDate(current.since, { month: "short", year: "numeric" })}{current.status === "paused" ? " · En pausa" : ""}</span></div>
          <div className="co-actions">
            {det?.program && <button type="button" className="btn" onClick={() => go("builder", { pid: null })}>Cambiar programa</button>}
            {det?.program && <button type="button" className="btn" onClick={() => setPreview(true)}>Ver cómo lo verá {current.name.split(" ")[0]}</button>}
            {det?.program ? <button type="button" className="btn pri" onClick={() => go("builder", { pid: det.program!.programId })}>Editar programa</button>
              : <button type="button" className="btn pri" onClick={() => go("builder", { pid: null })}>Asignar programa</button>}
            {current.status === "active" && <button type="button" className="btn" onClick={() => relStatus("paused", `¿Pausar a ${current.name.split(" ")[0]}? Deja de ver su programa hasta que lo reactives; el chat y su historial quedan.`)}>Pausar</button>}
            {current.status === "paused" && <button type="button" className="btn" onClick={() => relStatus("active")}>Reactivar</button>}
            <button type="button" className="btn danger" onClick={() => relStatus("ended", `¿Terminar la relación con ${current.name}? Se cierra su programa, deja de compartir sus datos con vos y el chat queda de sólo lectura. Su historial no se borra. Para volver, lo invitás de nuevo.`)}>Terminar</button>
          </div>
        </section>
      )}
      {current && <div className="tabs" role="tablist" aria-label="Ficha del cliente"><SlideIndicator variant="line" />{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>}
      {current && (!det ? <ClientSkeleton /> : <Tab tab={tab} det={det} row={current} orgId={orgId} flash={flash} go={go} />)}
    </div>
  );
  if (solo) return (
    <>
      {solo.back && <nav className="gy-back" aria-label="Volver"><button type="button" className="btn sm" onClick={solo.back.go}><Ic i={ArrowLeft} size={16} /> Volver a {solo.back.label}</button></nav>}
      <div className="co-head"><div><span className="co-kicker">Ficha del cliente</span><h1 tabIndex={-1}>{current?.name ?? "Ficha del cliente"}</h1></div></div>
      {detail}
      {preview && det?.program && current && <StudentPreview doc={det.program.doc} version={det.program.version} who={current.name.split(" ")[0]} onClose={() => setPreview(false)} />}
    </>
  );
  return (
    <>
      <div className="co-head">
        <div><span className="co-kicker">{ov.clients.length} {ov.clients.length === 1 ? "cliente" : "clientes"}</span><h1 tabIndex={-1}>Clientes</h1></div>
        <div className="co-actions"><button type="button" className="btn" onClick={() => setImporting(true)}>Importar CSV</button><button type="button" className="btn" onClick={onInvite}>Invitar cliente</button></div>
      </div>
      {!ov.clients.length ? (
        <div className="empty">Todavía no tenés clientes. Invitá al primero: recibe un enlace y acepta desde su app.</div>
      ) : (
        <div className="split co-clients" ref={splitRef} data-sel={sel ? "1" : "0"}>
          <div className="list-pane">
            <label className="search"><Ic i={MagnifyingGlass} size={16} color="var(--ui-muted)" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" /></label>
            <div className="pills">{FILTERS.map(([k, l]) => <button type="button" key={k} className="pill" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
            <div className="sorts">Ordenar: {SORTS.map(([k, l]) => <button type="button" key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}</div>
            {list.map((c) => (
              <button type="button" key={c.id} className="crow" aria-current={c.id === current?.id} onClick={() => pickRow(c)}>
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
          {detail}
        </div>
      )}
      {preview && det?.program && current && <StudentPreview doc={det.program.doc} version={det.program.version} who={current.name.split(" ")[0]} onClose={() => setPreview(false)} />}
      {importing && <ImportModal orgId={orgId} flash={flash} onClose={(changed) => { setImporting(false); if (changed) onImported(); }} />}
    </>
  );
}

function Tab({ tab, det, row, orgId, flash, go }: { tab: string; det: Detail; row: ClientRow; orgId: string; flash: (t: string) => void; go: (s: Screen, e?: { sel?: string; pid?: string | null }) => void }) {
  const done = det.sessions.filter((s) => s.status === "completed");
  if (tab === "res") return (
    <>
      <div className="grid-kpi">
        <div className="stat"><span>Adherencia</span><strong>{row.adherence == null ? "—" : `${row.adherence}%`}</strong><small className="muted">Semana actual · {row.weekDone} de {row.program?.days ?? "—"}</small></div>
        <div className="stat"><span>Última sesión</span><strong>{relTime(row.lastSessionAt)}</strong><small className="muted">{done[0]?.dayName ?? ""}</small></div>
        <div className="stat"><span>Programa</span><strong style={{ fontSize: 18 }}>{det.program ? det.program.doc.name : "Sin programa"}</strong><small className="muted">{det.program ? `Desde ${fmtIsoDay(det.program.startsOn)} · versión ${det.program.version}` : "Asignale uno desde Programas"}</small></div>
        <div className="stat"><span>Sesiones registradas</span><strong>{done.length}</strong><small className="muted">Últimas 20</small></div>
      </div>
      <SharedWishes w={det.wishes} who={det.name.split(" ")[0]} />
      <Sessions det={det} />
    </>
  );
  if (tab === "prog") return det.program ? (
    <section className="card">
      <h2>{det.program.doc.name}</h2>
      <span className="muted">{det.program.doc.weeks} semanas · {det.program.doc.days.length} días · versión {det.program.version}{det.program.doc.note ? ` · ${det.program.doc.note}` : ""}</span>
      {/* Ejercicios por tiempo: una actividad se lee como se indicó («Cinta (caminata) 10 min · 5 km/h · incl. 3»), sin series × reps. */}
      {det.program.doc.days.map((d) => (
        <div key={d.name} className="trow" style={{ alignItems: "flex-start" }}><b style={{ flex: "0 0 140px" }}>{d.name}</b><span style={{ flex: 1 }}>
          {d.exercises.map((e) => activityOf(e.detail) ? `${e.name} ${prescriptionText(e)}${e.restSec ? ` · ${formatRest(e.restSec)}` : ""}` : `${e.name} ${e.sets}×${e.reps}${e.rir != null ? ` · RIR ${e.rir}` : ""} · ${formatRest(e.restSec)}`).join(" — ") || "Sin ejercicios"}</span></div>
      ))}
    </section>
  ) : <div className="empty">Sin programa asignado.</div>;
  if (tab === "rend") return <PerfTab key={det.id} orgId={orgId} relId={det.id} programId={det.program?.programId ?? null} go={go} />;
  if (tab === "pay") return <ClientPayTab key={det.id} orgId={orgId} relId={det.id} name={det.name} flash={flash} />;
  const SENS: Record<string, "health" | "nutrition" | "measurements"> = { salud: "health", nutri: "nutrition", body: "measurements" };
  if (SENS[tab]) return <SensitiveTab key={`${det.id}-${tab}`} orgId={orgId} relId={det.id} name={det.name} item={SENS[tab]} flash={flash} />;
  if (tab === "progreso") return <GoalsTab key={det.id} orgId={orgId} relId={det.id} name={det.name} flash={flash} />;
  return null;
}

function Sessions({ det }: { det: Detail }) {
  return (
    <section className="card">
      <h2>Registro de sesiones</h2>
      {!det.sessions.length ? <span className="muted" style={{ fontSize: 14 }}>Todavía no registró entrenamientos.</span> : (
        <SessionLog sessions={det.sessions}
          line={(s) => `${formatClock(s.durationSec)} · ${s.sets} series · ${nf(s.volumeKg)} kg`}
          extra={(s) => s.changes?.map((c) => <span key={c.exercise} style={{ flexBasis: "100%", fontSize: 13, color: "var(--ui-text-2)" }}>{c.kind === "skip" ? `Salteó ${c.exercise}` : `Hizo ${c.substitute} en lugar de ${c.exercise}`} · {EXERCISE_CHANGE_REASONS[c.reason].toLowerCase()}</span>)} />
      )}
    </section>
  );
}

// F-CO-04: rendimiento desde series reales. Fórmula visible; tendencia contra las 4 semanas previas.
type Perf = { formula: string; exercises: { name: string; group: string; best: { e1rm: number; weightKg: number; reps: number } | null; previous: { e1rm: number } | null; sets: number }[];
  groups: { group: string; thisWeek: number; lastWeek: number }[] };
function PerfTab({ orgId, relId, programId, go }: { orgId: string; relId: string; programId: string | null; go: (s: Screen, e?: { sel?: string; pid?: string | null }) => void }) {
  // D191: la propuesta se revisa en el constructor de siempre (programa del cliente), donde sólo cambia el borrador si se aplica.
  const review = (t: TiDraft) => { stashTiDraft(t); go("builder", { pid: t.programId }); };
  const decideUrl = (id: string) => `/api/coach/${orgId}/proposals/${id}`;
  // D210: «Señales de REPI» arriba (análisis de lo registrado con vos; nunca su conversación ni su memoria) y, debajo, Training Intelligence.
  const [tick, setTick] = useState(0);
  const intel = <>
    <RepiSignals kind="coach" relId={relId} programId={programId} load={`/api/coach/${orgId}/clients/${relId}/brain`} decideUrl={decideUrl} onReview={review} refresh={tick} />
    <IntelSection kind="coach" relId={relId} load={`/api/coach/${orgId}/clients/${relId}/intelligence`} decideUrl={decideUrl} onReview={review} onLoaded={() => setTick((n) => n + 1)} />
  </>;
  const d = useLoad<Perf>(`/api/coach/${orgId}/clients/${relId}/performance`);
  if (d.err) return <p role="alert" className="err-box">{d.err}</p>;
  if (!d.data) return <p className="muted">Cargando…</p>;
  const { exercises, groups, formula } = d.data;
  const report = <a className="btn" href={`/coach/${orgId}/informe/${relId}`} style={{ alignSelf: "flex-start" }}>Informe mensual (imprimible)</a>;
  if (!exercises.length && !groups.length) return <>{report}{intel}<div className="empty">Todavía no hay series con carga en las últimas 8 semanas.</div></>;
  const kg = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`;
  return (
    <>
      {report}
      {intel}
      <section className="card">
        <h2>1RM estimado</h2>
        <span className="muted" style={{ fontSize: 13 }}>{formula} Últimas 4 semanas contra las 4 anteriores.</span>
        <div className="table">
          {exercises.map((e) => {
            const diff = e.best && e.previous ? Math.round((e.best.e1rm - e.previous.e1rm) * 10) / 10 : null;
            return (
              <div key={e.name} className="trow">
                <b style={{ flex: "1 1 160px" }}>{e.name}<small className="muted" style={{ display: "block", fontWeight: 400 }}>{e.group}</small></b>
                <span style={{ flex: "0 0 auto" }}>{e.best ? <>{kg(e.best.e1rm)} <small className="muted">({kg(e.best.weightKg)} × {e.best.reps})</small></> : <span className="muted">Sin series recientes</span>}</span>
                {diff != null && <span className={`chip ${diff > 0 ? "ok" : diff < 0 ? "warn" : "mute"}`}>{diff > 0 ? "+" : ""}{kg(diff)}</span>}
              </div>
            );
          })}
        </div>
      </section>
      <section className="card">
        <h2>Volumen por grupo</h2>
        <span className="muted" style={{ fontSize: 13 }}>Σ peso × repeticiones de series con carga. Semana actual contra la anterior.</span>
        <div className="table">
          {groups.map((g) => (
            <div key={g.group} className="trow">
              <b style={{ flex: "1 1 140px" }}>{g.group}</b>
              <span style={{ flex: "0 0 auto" }}>{kg(g.thisWeek)} <small className="muted">· antes {kg(g.lastWeek)}</small></span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/** M06: ficha del cliente en esqueleto con su forma (indicadores y sesiones), en lugar de «Cargando ficha…». */
function ClientSkeleton() {
  return (
    <>
      <span role="status" className="sr-only">Cargando la ficha</span>
      <div className="grid-kpi" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="stat"><Skel w="50%" h={12} /><Skel w="40%" h={26} style={{ margin: "4px 0" }} /><Skel w="70%" h={11} /></div>)}</div>
      <section className="card" aria-hidden="true" style={{ minHeight: 220, gap: 10 }}><Skel w="30%" h={16} /><Skel h={12} /><Skel h={12} /><Skel w="75%" h={12} /></section>
    </>
  );
}
