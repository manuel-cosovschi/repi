"use client";
// REPI Ventas (D209): panel privado del vendedor. Mobile-first (barra inferior en el teléfono, lateral en escritorio).
// Todo dato viene de /api/ventas, que valida en el servidor que cada registro sea del vendedor. Sin métricas inventadas:
// contratado, cobrado y comisiones se muestran separados y con su definición.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CurrencyCircleDollar, DotsThreeOutline, House, Kanban, List, PlusCircle } from "@phosphor-icons/react";
import {
  ACTIVITY_KINDS, BILLING_PERIODICITY, BOARD_STAGES, DEAL_KIND, PAYOUT_FREQUENCY, PROSPECT_SOURCES, STAGES, canMoveStage, dealPreview, describeComponent, fmtMoney, localDate, parseMoney,
  type CommissionRules, type Currency, type Stage,
} from "@repi/domain";
import { api, ApiError } from "@/lib/api";
import { signOutSafely } from "@/lib/session-cleanup";
import { Wordmark } from "@/components/access/Wordmark";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { Modal } from "@/components/ui/Modal";
import { Ic } from "@/components/ui/Ic";
import { Head, Seg, fmt, initials, useLoad, when } from "@/components/gym/shared";

type Screen = "home" | "pipeline" | "sell" | "deals" | "clients" | "commissions" | "payouts" | "targets" | "materials" | "notices" | "profile";
const NAV: [Screen, string][] = [["home", "Inicio"], ["pipeline", "Prospectos"], ["sell", "Registrar venta"], ["deals", "Mis ventas"], ["clients", "Mis clientes"], ["commissions", "Comisiones"],
  ["payouts", "Liquidaciones"], ["targets", "Objetivos"], ["materials", "Material de ventas"], ["notices", "Avisos"], ["profile", "Mi perfil"]];
const MONEY_ONLY: Screen[] = ["commissions", "payouts", "notices", "profile", "clients", "home"];
export const money = (m: number | null | undefined, c: string = "ARS") => (m == null ? "—" : fmtMoney(m, c as Currency));
/** «7 nov 2026» desde una fecha ISO (AAAA-MM-DD), sin corrimiento por zona horaria. */
export const dayTxt = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : iso;
/** Condiciones del plan en una línea, omitiendo las que no aplican (sin retención, sin mínimo, sin tope). */
export const planTerms = (r: CommissionRules) => [
  r.holdDays ? `se libera para liquidar ${r.holdDays} ${r.holdDays === 1 ? "día" : "días"} después de devengarse` : "se libera para liquidar apenas se devenga",
  r.minPayoutMinor ? `mínimo de liquidación ${money(r.minPayoutMinor, r.currency)}` : null,
  r.capPerDealMinor ? `tope por venta ${money(r.capPerDealMinor, r.currency)}` : null,
  r.notes || null,
].filter(Boolean).join(" · ");
export const curMap = (o: Record<string, number> | null | undefined) => { const e = Object.entries(o ?? {}).filter(([, v]) => v); return e.length ? e.map(([c, v]) => money(v, c)).join(" · ") : "—"; };
const today = () => localDate(new Date());
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
const STATUS_CHIP: Record<string, string> = { declared: "info", needs_correction: "warn", approved: "ok", rejected: "bad", withdrawn: "mute" };
const STATE_CHIP: Record<string, string> = { accrued: "info", available: "ok", in_payout: "warn", paid: "mute", reversed: "bad", adjustment: "info" };

type Me = { name: string; status: string; canSellCoaches: boolean; profileDone: boolean };
type Row = {
  prospectId: string; name: string; kind: string; city: string | null; province: string | null; contactName: string | null; phone: string | null; email: string | null; duplicateStatus: string;
  opportunityId: string | null; stage: Stage | null; stageLabel: string; category: string | null; estMembers: number | null; estUnitPriceMinor: number | null; currency: string; potentialMinor: number | null;
  nextContactOn: string | null; overdue: boolean; revision: number | null; missing: string[];
};

export function SalesApp({ me, initial }: { me: Me; initial: { s?: string; p?: string; b?: string; deal?: string } }) {
  const start = (NAV.some(([k]) => k === initial.s) ? initial.s : initial.s === "ventas" ? "deals" : initial.s === "liquidaciones" ? "payouts" : initial.s === "comisiones" ? "commissions" : initial.s === "clientes" ? "clients" : initial.s === "perfil" ? "profile" : initial.s === "objetivos" ? "targets" : "home") as Screen;
  const crm = me.status === "active" || me.status === "paused";
  const [screen, setScreen] = useState<Screen>(crm || MONEY_ONLY.includes(start) ? start : "commissions");
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (initial.p) setOpen(initial.p); }, [initial.p]); // los modales usan document: se abren tras montar
  const [sell, setSell] = useState<SellInit | null>(null);
  const [newProspect, setNewProspect] = useState(false);
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((t: string) => { clearTimeout(tt.current); setToast(t); tt.current = setTimeout(() => setToast(null), 3500); }, []);
  const notices = useLoad<{ id: string; readAt: string | null }[]>("/api/ventas/notices");
  const unread = notices.data?.filter((n) => !n.readAt).length ?? 0;
  const go = (k: Screen, init?: SellInit) => { setScreen(k); setDrawer(false); if (k === "sell") setSell(init ?? null); window.scrollTo(0, 0); };
  const nav = NAV.filter(([k]) => crm || MONEY_ONLY.includes(k));

  return (
    <div className="co sv" data-drawer={drawer ? "1" : "0"}>
      <aside className="co-side ui-dark" aria-label="Navegación">
        <div className="co-brand"><Wordmark width={58} /><span className="tag">Ventas</span></div>
        <nav className="co-nav" aria-label="Principal">
          {nav.map(([k, l]) => (
            <button key={k} type="button" aria-current={screen === k ? "page" : undefined} onClick={() => go(k)}>
              <span className="lbl">{l}</span>{k === "notices" && unread > 0 && <span className="nbadge" aria-label={`${unread} avisos sin leer`}>{unread}</span>}
            </button>
          ))}
        </nav>
        <div className="co-me">
          <span className="av">{initials(me.name)}</span>
          <span><b>{me.name}</b><small><button type="button" onClick={async () => { if (!await signOutSafely()) return; window.location.href = "/acceso"; }} style={{ border: 0, background: "none", color: "inherit", padding: 0, font: "inherit", cursor: "pointer" }}>Cerrar sesión</button> · <a href="/acceso?step=workspace" style={{ color: "inherit" }}>Espacios</a> · <a href="/cuenta?desde=/ventas" style={{ color: "inherit" }}>Mi cuenta</a></small></span>
        </div>
        <div className="co-theme"><ThemePicker compact /></div>
      </aside>
      {drawer && <div className="co-scrim" onClick={() => setDrawer(false)} />}
      <main className="co-main">
        <div className="co-topbar ui-dark">
          <button type="button" aria-label="Abrir menú" aria-expanded={drawer} onClick={() => setDrawer(true)}><Ic i={List} size={22} color="var(--ui-text)" /></button>
          <Wordmark width={50} /><span style={{ marginLeft: "auto", fontSize: 13, color: "var(--ui-muted)" }}>REPI Ventas</span>
        </div>
        <div className="co-content" key={screen} data-section={screen}>
          {me.status === "paused" && <p className="gy-warn" style={{ margin: 0 }}>Tu cuenta comercial está en pausa: podés consultar todo, pero no cargar cambios.</p>}
          {!crm && <p className="gy-warn" style={{ margin: 0 }}>Tu acceso comercial está cerrado. Seguís viendo tus comisiones, liquidaciones y pagos.</p>}
          {screen === "home" && <Home me={me} go={go} onNewProspect={() => setNewProspect(true)} openProspect={setOpen} flash={flash} />}
          {screen === "pipeline" && <Pipeline canWrite={me.status === "active"} openProspect={setOpen} onNew={() => setNewProspect(true)} />}
          {screen === "sell" && <SellWizard key={JSON.stringify(sell)} init={sell} me={me} flash={flash} done={() => go("deals")} />}
          {screen === "deals" && <Deals flash={flash} canWrite={me.status === "active"} focus={initial.deal} edit={(d) => go("sell", { edit: d })} />}
          {screen === "clients" && <Clients canWrite={me.status === "active"} sellTo={(c, kind) => go("sell", { orgId: c.orgId, name: c.name, clientKind: c.kind, kind })} />}
          {screen === "commissions" && <Commissions />}
          {screen === "payouts" && <Payouts focus={initial.b} />}
          {screen === "targets" && <Targets />}
          {screen === "materials" && <Materials flash={flash} />}
          {screen === "notices" && <Notices reload={notices.reload} />}
          {screen === "profile" && <Profile flash={flash} />}
        </div>
      </main>
      <nav className="sv-bottom" aria-label="Accesos rápidos">
        {(crm ? [["home", "Inicio", House], ["pipeline", "Prospectos", Kanban], ["sell", "Vender", PlusCircle], ["commissions", "Comisiones", CurrencyCircleDollar]] as const
          : [["home", "Inicio", House], ["commissions", "Comisiones", CurrencyCircleDollar], ["payouts", "Pagos", CurrencyCircleDollar], ["notices", "Avisos", Bell]] as const).map(([k, l, I]) => (
          <button key={k} type="button" className={k === "sell" ? "sv-plus" : undefined} aria-current={screen === k ? "page" : undefined} onClick={() => go(k)}><Ic i={I} size={22} color="currentColor" />{l}</button>
        ))}
        <button type="button" aria-expanded={drawer} onClick={() => setDrawer(true)}><Ic i={DotsThreeOutline} size={22} color="currentColor" />Más{unread > 0 && <span className="sr-only">, {unread} avisos sin leer</span>}</button>
      </nav>
      {open && <ProspectSheet id={open} canWrite={me.status === "active"} flash={flash} onClose={() => setOpen(null)} sell={(init) => { setOpen(null); go("sell", init); }} />}
      {newProspect && <ProspectModal me={me} flash={flash} onClose={(id) => { setNewProspect(false); if (id) { setOpen(id); if (screen !== "pipeline") go("pipeline"); } }} />}
      <div aria-live="polite" className="sr-only">{toast}</div>
      {toast && <div className="co-toast" aria-hidden="true">{toast}</div>}
    </div>
  );
}

// ── Inicio ──────────────────────────────────────────────────────────────────
type Metrics = { confirmed: number; membersSold: number; pending: number; newClients: number; activeClients: number; negotiating: number; members: number; contracted: Record<string, number>; collected: Record<string, number> };
type Totals = Record<string, Record<string, number>>;
type Dash = {
  rep: { code: string; name: string; profileCompletedAt: string | null }; period: { label: string; key: string }; current: Metrics; previous: Metrics; commissions: Totals;
  quality: { open: number; withNext: number; overdue: number; stale: number }; nextPayout: { frequency: string; date: string | null; note: string | null };
  targets: { id: string; label: string; target: number; actual: number; pct: number | null; metric: string; currency: string | null }[]; definitions: Record<string, string>;
};
type Agenda = { tasks: { id: string; prospectId: string; name: string; summary: string; dueOn: string; overdue: boolean; kind: string }[]; followUps: { opportunityId: string; prospectId: string; name: string; stage: string; nextContactOn: string; overdue: boolean }[]; stale: { prospectId: string; name: string; stage: string }[] };

function Delta({ a, b }: { a: number; b: number }) {
  if (a === b) return <small>Igual que el período anterior</small>;
  return <small className={a > b ? "up" : "down"}>{a > b ? "▲" : "▼"} {Math.abs(a - b)} vs. período anterior ({b})</small>;
}
function Home({ me, go, onNewProspect, openProspect, flash }: { me: Me; go: (k: Screen) => void; onNewProspect: () => void; openProspect: (id: string) => void; flash: (t: string) => void }) {
  const [period, setPeriod] = useState("month");
  const d = useLoad<Dash>(`/api/ventas/dashboard?period=${period}`);
  const crm = me.status === "active" || me.status === "paused";
  const ag = useLoad<Agenda>(crm ? "/api/ventas/agenda" : null);
  const [profileDone, setProfileDone] = useState(me.profileDone);
  const done = async (id: string) => { try { await api(`/api/ventas/activities/${id}/done`, { body: {} }); ag.reload(); } catch (e) { flash((e as Error).message); } };
  if (!profileDone && me.status === "active") return (<><Head kicker="Antes de empezar" title={`Hola, ${me.name.split(" ")[0]}`} /><ProfileForm first flash={flash} onSaved={() => setProfileDone(true)} /></>);
  const v = d.data;
  return (
    <>
      <Head kicker={v ? `Código comercial ${v.rep.code}` : "Tu operación comercial"} title="Inicio">
        <Seg label="Período" value={period} onChange={setPeriod} options={[["month", "Este mes"], ["prev_month", "Mes anterior"], ["quarter", "3 meses"], ["year", "Año"]]} />
      </Head>
      {crm && me.status === "active" && (
        <div className="sv-quick">
          <button type="button" className="btn pri" onClick={onNewProspect}>Nuevo prospecto</button>
          <button type="button" className="btn" onClick={() => go("pipeline")}>Registrar visita</button>
          <button type="button" className="btn" onClick={() => go("sell")}>Registrar venta</button>
          <button type="button" className="btn" onClick={() => go("commissions")}>Mis comisiones</button>
        </div>
      )}
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!v ? <p className="muted">Cargando…</p> : <>
        <section className="sv-sec" aria-label="Ventas">
          <h2>Ventas · {v.period.label}</h2>
          <div className="sv-kpis">
            <div className="sv-kpi"><span>Ventas confirmadas</span><strong>{v.current.confirmed}</strong><Delta a={v.current.confirmed} b={v.previous.confirmed} /></div>
            <div className="sv-kpi"><span>Pendientes de aprobación</span><strong>{v.current.pending}</strong><small>Hoy</small></div>
            <div className="sv-kpi"><span>Nuevos clientes habilitados</span><strong>{v.current.newClients}</strong><Delta a={v.current.newClients} b={v.previous.newClients} /></div>
            <div className="sv-kpi"><span>Clientes activos</span><strong>{v.current.activeClients}</strong><small>Con contrato habilitado</small></div>
            <div className="sv-kpi"><span>En negociación</span><strong>{v.current.negotiating}</strong><small>Interesado a cierre declarado</small></div>
            <div className="sv-kpi"><span>Socios contratados</span><strong>{v.current.members}</strong><small>Cantidad acordada, no usuarios activos</small></div>
            <div className="sv-kpi"><span>Contratado mensual</span><strong style={{ fontSize: 20 }}>{curMap(v.current.contracted)}</strong><small>Cantidad × precio vigentes</small></div>
            <div className="sv-kpi"><span>Cobrado por REPI</span><strong style={{ fontSize: 20 }}>{curMap(v.current.collected)}</strong><small>Pagos registrados en el período</small></div>
          </div>
        </section>
        <section className="sv-sec" aria-label="Comisiones">
          <h2>Comisiones</h2>
          {Object.keys(v.commissions).length === 0 ? <div className="empty">Todavía no tenés comisiones devengadas. Se generan con eventos verificados (aprobación, habilitación o cobros registrados, según tu plan).</div> : Object.entries(v.commissions).map(([cur, t]) => (
            <div key={cur} className="sv-kpis">
              <div className="sv-kpi"><span>Pendientes de validación (est.)</span><strong style={{ fontSize: 20 }}>{money(t.pending_validation, cur)}</strong><small>Ventas sin aprobar</small></div>
              <div className="sv-kpi"><span>Devengadas</span><strong style={{ fontSize: 20 }}>{money(t.accrued, cur)}</strong><small>En retención</small></div>
              <div className="sv-kpi"><span>Disponibles para liquidar</span><strong style={{ fontSize: 20 }}>{money(t.available, cur)}</strong></div>
              <div className="sv-kpi"><span>En liquidación</span><strong style={{ fontSize: 20 }}>{money(t.in_payout, cur)}</strong></div>
              <div className="sv-kpi"><span>Pagadas</span><strong style={{ fontSize: 20 }}>{money(t.paid, cur)}</strong></div>
            </div>
          ))}
          <p className="sv-note">Próxima liquidación: {v.nextPayout.date ? `${fmt(`${v.nextPayout.date}T12:00:00Z`, { day: "numeric", month: "long" })} (${v.nextPayout.frequency.toLowerCase()})` : `${v.nextPayout.frequency}${v.nextPayout.note ? ` · ${v.nextPayout.note}` : ""}`}. Cambiar la frecuencia no cambia importes.</p>
        </section>
        {v.targets.length > 0 && <section className="sv-sec" aria-label="Objetivos del mes"><h2>Objetivo del mes</h2><TargetBars items={v.targets} /></section>}
        {crm && ag.data && (
          <section className="sv-sec" aria-label="Próximas acciones">
            <h2>Próximas acciones</h2>
            {!ag.data.tasks.length && !ag.data.followUps.length && !ag.data.stale.length && <div className="empty">Sin pendientes para los próximos 3 días.</div>}
            {ag.data.tasks.map((t) => (
              <div key={t.id} className="sv-row"><span className="main"><b>{t.summary}</b><small>{t.name} · {ACTIVITY_KINDS[t.kind as keyof typeof ACTIVITY_KINDS]} · {t.dueOn}{t.overdue ? " · vencida" : ""}</small></span>
                {t.overdue && <span className="chip warn">Vencida</span>}<button type="button" className="btn sm" onClick={() => openProspect(t.prospectId)}>Abrir</button>
                {me.status === "active" && <button type="button" className="btn sm" onClick={() => done(t.id)}>Hecha</button>}</div>
            ))}
            {ag.data.followUps.map((f) => (
              <div key={f.opportunityId} className="sv-row"><span className="main"><b>Seguimiento: {f.name}</b><small>{f.stage} · próximo contacto {f.nextContactOn}</small></span>{f.overdue && <span className="chip warn">Vencido</span>}<button type="button" className="btn sm" onClick={() => openProspect(f.prospectId)}>Abrir</button></div>
            ))}
            {ag.data.stale.map((f) => (
              <div key={f.prospectId} className="sv-row"><span className="main"><b>Sin movimiento hace 14 días: {f.name}</b><small>{f.stage}</small></span><button type="button" className="btn sm" onClick={() => openProspect(f.prospectId)}>Abrir</button></div>
            ))}
            <p className="sv-note">Calidad del pipeline: {v.quality.withNext} de {v.quality.open} oportunidades abiertas tienen próximo contacto · {v.quality.overdue} seguimientos vencidos.</p>
          </section>
        )}
        <details className="card"><summary style={{ cursor: "pointer", fontWeight: 600 }}>Cómo se calcula cada indicador</summary>
          <dl className="sv-preview" style={{ gridTemplateColumns: "1fr" }}>{Object.entries(v.definitions).map(([k2, t]) => <dd key={k2} style={{ textAlign: "left", fontWeight: 400 }}>{t}</dd>)}</dl>
        </details>
      </>}
    </>
  );
}
function TargetBars({ items }: { items: Dash["targets"] }) {
  return <div className="card">{items.map((t) => (
    <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><b>{t.label}</b><span className="sv-money">{t.metric === "contract_value" ? `${money(t.actual, t.currency ?? "ARS")} / ${money(t.target, t.currency ?? "ARS")}` : `${t.actual} / ${t.target}`} · {t.pct ?? 0}%</span></span>
      <div className="sv-bar" role="progressbar" aria-label={t.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, t.pct ?? 0)}><i style={{ width: `${Math.min(100, t.pct ?? 0)}%` }} /></div>
    </div>
  ))}<p className="sv-note">Sólo cuentan ventas aprobadas y actividades registradas: una venta declarada no suma hasta que REPI la aprueba.</p></div>;
}

// ── Pipeline ────────────────────────────────────────────────────────────────
function Pipeline({ canWrite, openProspect, onNew }: { canWrite: boolean; openProspect: (id: string) => void; onNew: () => void }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"board" | "table">("board");
  const [query, setQuery] = useState("");
  const d = useLoad<{ rows: Row[] }>(`/api/ventas/pipeline${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const rows = d.data?.rows ?? [];
  return (
    <>
      <Head kicker="Tus gimnasios y oportunidades. Sólo ves lo que tenés asignado." title="Prospectos">{canWrite && <button type="button" className="btn pri" onClick={onNew}>Nuevo prospecto</button>}</Head>
      <div className="sv-filter">
        <input type="search" aria-label="Buscar prospectos" placeholder="Buscar por nombre, ciudad o contacto" value={q} onChange={(e) => setQ(e.target.value)} />
        <Seg label="Vista" value={view} onChange={setView} options={[["board", "Tablero"], ["table", "Tabla"]]} />
      </div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : !rows.length ? <div className="empty">{query ? "Sin resultados." : "Todavía no cargaste prospectos. Empezá por el gimnasio que visitaste hoy."}</div>
        : view === "board" ? (
          <div className="sv-board" tabIndex={0} aria-label="Tablero de oportunidades">
            {BOARD_STAGES.map((s) => {
              const items = rows.filter((r) => r.stage === s);
              return (
                <section key={s} className="sv-col" aria-label={STAGES[s]}>
                  <h3><span>{STAGES[s]}</span><span>{items.length}</span></h3>
                  {items.map((r) => (
                    <button key={r.prospectId} type="button" className="sv-card" onClick={() => openProspect(r.prospectId)}>
                      <b>{r.name}</b>
                      <small>{[r.city, r.estMembers ? `${r.estMembers} socios` : null].filter(Boolean).join(" · ") || "Sin datos"}</small>
                      {r.potentialMinor ? <small className="sv-money">Potencial {money(r.potentialMinor, r.currency)}/mes</small> : null}
                      {r.overdue && <span className="chip warn">Seguimiento vencido</span>}
                      {r.duplicateStatus === "review" && <span className="chip info">Duplicado en revisión</span>}
                    </button>
                  ))}
                </section>
              );
            })}
            {rows.some((r) => !r.stage) && <section className="sv-col" aria-label="Sin oportunidad"><h3>Sin oportunidad</h3>{rows.filter((r) => !r.stage).map((r) => <button key={r.prospectId} type="button" className="sv-card" onClick={() => openProspect(r.prospectId)}><b>{r.name}</b></button>)}</section>}
          </div>
        ) : (
          <section className="card" style={{ padding: 0 }}><div style={{ overflowX: "auto" }} tabIndex={0}>
            <table className="gy-table"><thead><tr><th>Negocio</th><th>Etapa</th><th>Socios est.</th><th>Potencial/mes</th><th>Próximo contacto</th><th>Faltan</th><th><span className="sr-only">Abrir</span></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.prospectId}><th scope="row">{r.name}<br /><small className="muted">{r.city ?? ""}</small></th><td>{r.stageLabel}</td><td>{r.estMembers ?? "—"}</td><td className="sv-money">{money(r.potentialMinor, r.currency)}</td>
                  <td>{r.nextContactOn ?? "—"}{r.overdue && <> <span className="chip warn">Vencido</span></>}</td><td><small>{r.missing.join(", ") || "—"}</small></td><td><button type="button" className="btn sm" onClick={() => openProspect(r.prospectId)}>Abrir</button></td></tr>
              ))}</tbody></table></div></section>
        )}
    </>
  );
}

type Match = { type: string; name: string | null; signals: string[]; strong: boolean };
function ProspectModal({ me, flash, onClose }: { me: Me; flash: (t: string) => void; onClose: (id: string | null) => void }) {
  const [f, setF] = useState<Record<string, string>>({ kind: "gym", source: "field", currency: "ARS" });
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [why, setWhy] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (v?: string) => (v?.trim() ? Number(v.replace(/\D/g, "")) : null);
  const save = async (ack = false) => {
    if ((f.name ?? "").trim().length < 2) { flash("Escribí el nombre comercial."); return; }
    const price = f.price?.trim() ? parseMoney(f.price, f.currency as Currency) : null;
    if (f.price?.trim() && price == null) { flash("Revisá el precio estimado."); return; }
    setBusy(true);
    try {
      const r = await api<{ id: string; duplicateReview: boolean }>("/api/ventas/prospects", { body: {
        kind: f.kind, name: f.name, legalName: f.legalName || null, cuit: f.cuit || null, city: f.city || null, province: f.province || null, address: f.address || null, estMembers: num(f.estMembers), locations: num(f.locations),
        website: f.website || null, instagram: f.instagram || null, phone: f.phone || null, email: f.email || null, contactName: f.contactName || null, contactRole: f.contactRole || null,
        contactChannel: (f.contactChannel || null) as never, notes: f.notes || null, source: f.source,
        opportunity: { estMembers: num(f.estMembers), estUnitPriceMinor: price, currency: f.currency, category: (f.category || null) as never, nextContactOn: f.nextContactOn || null, expectedCloseOn: f.expectedCloseOn || null },
        duplicateAck: ack, duplicateMessage: ack ? why || null : null,
      } });
      flash(r.duplicateReview ? "Prospecto guardado. REPI va a revisar la posible duplicación." : "Prospecto guardado.");
      onClose(r.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "possible_duplicate") setMatches((e.data?.matches as Match[]) ?? []);
      else flash((e as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <Modal label="Nuevo prospecto" onClose={() => onClose(null)} wide>
      <div className="mhead"><h2>Nuevo prospecto</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(null)}>×</button></div>
      {matches ? (
        <>
          <p className="gy-warn" style={{ margin: 0 }}>Puede que este negocio ya esté en REPI. No se fusiona nada automáticamente.</p>
          <ul className="sv-timeline">{matches.map((m, i) => <li key={i}><b>{m.type === "client" ? `Cliente de REPI: ${m.name}` : m.type === "mine" ? `Tu prospecto: ${m.name}` : "Prospecto de otro vendedor"}</b><small>Coincide: {m.signals.join(", ")}{m.strong ? " · señal fuerte" : ""}</small></li>)}</ul>
          <label className="field">Si querés cargarlo igual, contá por qué (REPI lo revisa)<textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} /></label>
          <div className="mfoot"><button type="button" className="btn" onClick={() => setMatches(null)}>Volver</button><button type="button" className="btn pri" aria-busy={busy || undefined} onClick={() => save(true)}>Cargar y pedir revisión</button></div>
        </>
      ) : (
        <>
          <div className="grid-2">
            <label className="field">Nombre comercial *<input value={f.name ?? ""} onChange={set("name")} autoComplete="organization" /></label>
            {me.canSellCoaches && <label className="field">Tipo<select value={f.kind} onChange={set("kind")}><option value="gym">Gimnasio</option><option value="coach">Entrenador independiente</option></select></label>}
            <label className="field">Contacto<input value={f.contactName ?? ""} onChange={set("contactName")} autoComplete="name" /></label>
            <label className="field">Cargo<input value={f.contactRole ?? ""} onChange={set("contactRole")} placeholder="Dueño, gerente…" /></label>
            <label className="field">Teléfono o WhatsApp<input type="tel" inputMode="tel" value={f.phone ?? ""} onChange={set("phone")} autoComplete="tel" /></label>
            <label className="field">Email<input type="email" value={f.email ?? ""} onChange={set("email")} autoComplete="email" /></label>
            <label className="field">Canal preferido<select value={f.contactChannel ?? ""} onChange={set("contactChannel")}><option value="">—</option><option value="whatsapp">WhatsApp</option><option value="phone">Teléfono</option><option value="email">Email</option><option value="in_person">En persona</option></select></label>
            <label className="field">Ciudad<input value={f.city ?? ""} onChange={set("city")} /></label>
            <label className="field">Provincia<input value={f.province ?? ""} onChange={set("province")} /></label>
            <label className="field">Socios estimados<input inputMode="numeric" value={f.estMembers ?? ""} onChange={set("estMembers")} /></label>
            <label className="field">Precio estimado por socio/mes<input inputMode="decimal" value={f.price ?? ""} onChange={set("price")} placeholder="Opcional" /></label>
            <label className="field">Moneda<select value={f.currency} onChange={set("currency")}><option>ARS</option><option>USD</option></select></label>
            <label className="field">Próximo contacto<input type="date" value={f.nextContactOn ?? ""} onChange={set("nextContactOn")} /></label>
            <label className="field">Origen<select value={f.source} onChange={set("source")}>{Object.entries(PROSPECT_SOURCES).filter(([k]) => !["web_lead", "referral_link", "repi_ads"].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          <details><summary style={{ cursor: "pointer", fontWeight: 600, minHeight: 44, display: "flex", alignItems: "center" }}>Más datos (opcionales)</summary>
            <div className="grid-2">
              <label className="field">Razón social<input value={f.legalName ?? ""} onChange={set("legalName")} /></label>
              <label className="field">CUIT<input inputMode="numeric" value={f.cuit ?? ""} onChange={set("cuit")} /></label>
              <label className="field">Dirección comercial<input value={f.address ?? ""} onChange={set("address")} /></label>
              <label className="field">Sedes<input inputMode="numeric" value={f.locations ?? ""} onChange={set("locations")} /></label>
              <label className="field">Sitio web<input value={f.website ?? ""} onChange={set("website")} /></label>
              <label className="field">Instagram<input value={f.instagram ?? ""} onChange={set("instagram")} /></label>
              <label className="field">Categoría<select value={f.category ?? ""} onChange={set("category")}><option value="">—</option><option value="hot">Caliente</option><option value="warm">Tibia</option><option value="cold">Fría</option></select></label>
              <label className="field">Cierre estimado<input type="date" value={f.expectedCloseOn ?? ""} onChange={set("expectedCloseOn")} /></label>
            </div>
            <label className="field">Notas comerciales<textarea rows={2} value={f.notes ?? ""} onChange={set("notes")} maxLength={2000} /></label>
          </details>
          <p className="sv-note">No hace falta CUIT ni DNI para empezar. Antes de guardar, REPI busca si el negocio ya existe.</p>
          <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(null)}>Cancelar</button><button type="button" className="btn pri" aria-busy={busy || undefined} onClick={() => save(false)}>Guardar prospecto</button></div>
        </>
      )}
    </Modal>
  );
}

type Detail = {
  prospect: Record<string, string | number | null> & { id: string; name: string; kind: string; phone: string | null; email: string | null; duplicateStatus: string; orgId: string | null };
  opportunities: { id: string; stage: Stage; stageLabel: string; revision: number; estMembers: number | null; estUnitPriceMinor: number | null; currency: string; category: string | null; nextContactOn: string | null; expectedCloseOn: string | null; lostReason: string | null; missing: string[]; kind: string }[];
  activities: { id: string; kind: string; kindLabel: string | null; summary: string; actor: string; dueOn: string | null; doneAt: string | null; overdue: boolean; createdAt: string }[];
  deals: { id: string; status: string }[];
};
function ProspectSheet({ id, canWrite, flash, onClose, sell }: { id: string; canWrite: boolean; flash: (t: string) => void; onClose: () => void; sell: (i: SellInit) => void }) {
  const d = useLoad<Detail>(`/api/ventas/prospects/${id}`);
  const [act, setAct] = useState({ kind: "call", summary: "", dueOn: "" });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const v = d.data;
  const o = v?.opportunities[0];
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); flash(ok); await d.reload(); } catch (e) { flash((e as Error).message); } finally { setBusy(false); } };
  const move = (to: Stage) => {
    if (!o) return;
    const reason = to === "lost" ? window.prompt("¿Por qué se perdió?") : null;
    if (to === "lost" && !reason?.trim()) return;
    void run(() => api(`/api/ventas/opportunities/${o.id}/stage`, { body: { to, reason, revision: o.revision } }), `Etapa: ${STAGES[to]}.`);
  };
  const digits = (v?.prospect.phone ?? "").replace(/\D/g, "");
  return (
    <Modal label={v ? `Prospecto ${v.prospect.name}` : "Prospecto"} onClose={onClose} wide>
      <div className="mhead"><h2>{v?.prospect.name ?? "Cargando…"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {v && <>
        <p className="sv-note">{[v.prospect.kind === "coach" ? "Entrenador" : "Gimnasio", v.prospect.city, v.prospect.province, v.prospect.contactName && `Contacto: ${v.prospect.contactName}${v.prospect.contactRole ? ` (${v.prospect.contactRole})` : ""}`, v.prospect.estMembers && `${v.prospect.estMembers} socios est.`].filter(Boolean).join(" · ")}</p>
        {v.prospect.duplicateStatus === "review" && <p className="gy-warn" style={{ margin: 0 }}>REPI está revisando si este negocio ya existía.</p>}
        <div className="sv-contact">
          {digits.length >= 8 && <a href={`tel:${digits}`}>Llamar</a>}
          {digits.length >= 8 && <a href={`https://wa.me/${digits.startsWith("54") ? digits : `54${digits}`}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {v.prospect.email && <a href={`mailto:${v.prospect.email}`}>Email</a>}
        </div>
        {(digits.length >= 8 || v.prospect.email) && <p className="sv-note">Estos enlaces abren tu teléfono o tu correo: REPI no envía ni registra mensajes. Después anotá el contacto abajo.</p>}
        {o && (
          <section className="card">
            <h2>Oportunidad · <span className="chip info">{o.stageLabel}</span></h2>
            {o.lostReason && o.stage === "lost" && <p className="sv-note">Motivo: {o.lostReason}</p>}
            <dl className="sv-preview">
              <dt>Socios estimados</dt><dd>{o.estMembers ?? "—"}</dd>
              <dt>Precio estimado por socio</dt><dd>{money(o.estUnitPriceMinor, o.currency)}</dd>
              <dt>Valor potencial mensual</dt><dd>{o.estMembers && o.estUnitPriceMinor ? money(o.estMembers * o.estUnitPriceMinor, o.currency) : "—"}</dd>
              <dt>Próximo contacto</dt><dd>{o.nextContactOn ?? "—"}</dd><dt>Cierre estimado</dt><dd>{o.expectedCloseOn ?? "—"}</dd>
            </dl>
            {o.missing.length > 0 && <p className="sv-note">Para avanzar falta: {o.missing.join(", ")}.</p>}
            {canWrite && <>
              <label className="field">Mover a
                <select value="" onChange={(e) => e.target.value && move(e.target.value as Stage)} disabled={busy}>
                  <option value="">Elegí una etapa…</option>
                  {BOARD_STAGES.filter((s) => canMoveStage(o.stage, s, "rep")).map((s) => <option key={s} value={s}>{STAGES[s]}</option>)}
                </select>
              </label>
              <div className="sv-filter">
                {!["won", "pending_validation"].includes(o.stage) && <button type="button" className="btn sm" onClick={() => setEdit({ estMembers: String(o.estMembers ?? ""), price: o.estUnitPriceMinor ? String(o.estUnitPriceMinor / 100) : "", nextContactOn: o.nextContactOn ?? "", expectedCloseOn: o.expectedCloseOn ?? "", category: o.category ?? "" })}>Editar oportunidad</button>}
                {["negotiation", "proposal", "declared", "demo"].includes(o.stage) && <button type="button" className="btn sm pri" onClick={() => sell({ prospectId: v.prospect.id, opportunityId: o.id, name: v.prospect.name, clientKind: v.prospect.kind as "gym" | "coach", contactName: (v.prospect.contactName as string) ?? "", contactEmail: v.prospect.email ?? "", contactPhone: v.prospect.phone ?? "", city: (v.prospect.city as string) ?? "", province: (v.prospect.province as string) ?? "", members: o.estMembers ?? undefined, price: o.estUnitPriceMinor ?? undefined, currency: o.currency })}>Registrar venta</button>}
                <button type="button" className="btn sm" onClick={async () => { const m = window.prompt("¿Qué hay que revisar? (por ejemplo: otro vendedor reclama este cliente)"); if (m?.trim()) await run(() => api("/api/ventas/requests", { body: { kind: "attribution_claim", prospectId: v.prospect.id, message: m } }), "Solicitud enviada a REPI."); }}>Pedir revisión a REPI</button>
              </div>
            </>}
            {edit && (
              <div className="grid-2">
                <label className="field">Socios estimados<input inputMode="numeric" value={edit.estMembers} onChange={(e) => setEdit({ ...edit, estMembers: e.target.value })} /></label>
                <label className="field">Precio por socio/mes ({o.currency})<input inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></label>
                <label className="field">Próximo contacto<input type="date" value={edit.nextContactOn} onChange={(e) => setEdit({ ...edit, nextContactOn: e.target.value })} /></label>
                <label className="field">Cierre estimado<input type="date" value={edit.expectedCloseOn} onChange={(e) => setEdit({ ...edit, expectedCloseOn: e.target.value })} /></label>
                <label className="field">Categoría<select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}><option value="">—</option><option value="hot">Caliente</option><option value="warm">Tibia</option><option value="cold">Fría</option></select></label>
                <div className="mfoot" style={{ alignItems: "end" }}><button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button>
                  <button type="button" className="btn pri" disabled={busy} onClick={() => { const price = edit.price.trim() ? parseMoney(edit.price, o.currency as Currency) : null; if (edit.price.trim() && price == null) { flash("Revisá el precio."); return; }
                    void run(() => api(`/api/ventas/opportunities/${o.id}`, { body: { estMembers: edit.estMembers ? Number(edit.estMembers.replace(/\D/g, "")) : null, estUnitPriceMinor: price, nextContactOn: edit.nextContactOn || null, expectedCloseOn: edit.expectedCloseOn || null, category: edit.category || null, revision: o.revision } }), "Oportunidad actualizada.").then(() => setEdit(null)); }}>Guardar</button></div>
              </div>
            )}
          </section>
        )}
        {canWrite && (
          <section className="card">
            <h2>Registrar actividad</h2>
            <div className="grid-2">
              <label className="field">Tipo<select value={act.kind} onChange={(e) => setAct({ ...act, kind: e.target.value })}>{Object.entries(ACTIVITY_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              {(act.kind === "task" || act.kind === "reminder") && <label className="field">Fecha<input type="date" value={act.dueOn} onChange={(e) => setAct({ ...act, dueOn: e.target.value })} /></label>}
            </div>
            <label className="field">{act.kind === "task" || act.kind === "reminder" ? "Qué hay que hacer" : "Qué pasó"}<textarea rows={2} value={act.summary} maxLength={1000} onChange={(e) => setAct({ ...act, summary: e.target.value })} /></label>
            <div className="mfoot"><button type="button" className="btn pri" disabled={busy} onClick={() => run(() => api(`/api/ventas/prospects/${id}/activities`, { body: { kind: act.kind, summary: act.summary, opportunityId: o?.id ?? null, dueOn: act.dueOn || null } }), "Actividad registrada.").then(() => setAct({ kind: act.kind, summary: "", dueOn: "" }))}>Registrar</button></div>
          </section>
        )}
        <section className="card"><h2>Historial</h2>
          <ul className="sv-timeline">{v.activities.map((a) => (
            <li key={a.id}><b>{a.kindLabel ? `${a.kindLabel}: ` : ""}</b>{a.summary}{a.dueOn && <> · <span className={`chip ${a.doneAt ? "ok" : a.overdue ? "warn" : "mute"}`}>{a.doneAt ? "Hecha" : `Para el ${a.dueOn}`}</span></>}<small>{a.actor} · {when(a.createdAt)}</small></li>
          ))}</ul>
        </section>
      </>}
    </Modal>
  );
}

// ── Registrar venta ─────────────────────────────────────────────────────────
type DealRow = {
  id: string; status: string; statusLabel: string; kind: string; kindLabel: string; businessName: string; clientKind: "gym" | "coach"; orgId: string | null; prospectId: string | null; opportunityId: string | null;
  contactName: string; contactEmail: string | null; contactPhone: string | null; city: string | null; province: string | null; address: string | null; locations: string[] | null; legalName: string | null; cuit: string | null;
  members: number; unitPriceMinor: number; currency: string; periodicity: string; contractStart: string; durationMonths: number | null; renewalNote: string | null; discountBps: number; setupFeeMinor: number;
  specialConditions: string | null; evidence: string; closedOn: string; notes: string | null; reviewNote: string | null; revision: number; createdAt: string; approvedAt: string | null;
  preview: { monthlyNet: number; perPeriod: number; totalContract: number | null; discountMinor: number } | null;
  estimate: { lines: { label: string; amountMinor: number | null; currency: string; note: string }[]; disclaimer: string } | null;
};
type SellInit = { edit?: DealRow; prospectId?: string; opportunityId?: string; orgId?: string; name?: string; clientKind?: "gym" | "coach"; kind?: "renewal" | "modification"; contactName?: string; contactEmail?: string; contactPhone?: string; city?: string; province?: string; members?: number; price?: number; currency?: string };

function SellWizard({ init, me, flash, done }: { init: SellInit | null; me: Me; flash: (t: string) => void; done: () => void }) {
  const e = init?.edit;
  const key = useRef(newKey());
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const pipe = useLoad<{ rows: Row[] }>(!init ? "/api/ventas/pipeline" : null);
  const [f, setF] = useState<Record<string, string>>(() => ({
    prospectId: e?.prospectId ?? init?.prospectId ?? "", opportunityId: e?.opportunityId ?? init?.opportunityId ?? "", orgId: e?.orgId ?? init?.orgId ?? "", kind: e?.kind ?? init?.kind ?? "new",
    clientKind: e?.clientKind ?? init?.clientKind ?? "gym", businessName: e?.businessName ?? init?.name ?? "", legalName: e?.legalName ?? "", cuit: e?.cuit ?? "",
    contactName: e?.contactName ?? init?.contactName ?? "", contactEmail: e?.contactEmail ?? init?.contactEmail ?? "", contactPhone: e?.contactPhone ?? init?.contactPhone ?? "",
    city: e?.city ?? init?.city ?? "", province: e?.province ?? init?.province ?? "", address: e?.address ?? "", locations: (e?.locations ?? []).join(", "),
    members: String(e?.members ?? init?.members ?? ""), price: e ? String(e.unitPriceMinor / 100).replace(".", ",") : init?.price ? String(init.price / 100).replace(".", ",") : "", currency: e?.currency ?? init?.currency ?? "ARS",
    periodicity: e?.periodicity ?? "monthly", contractStart: e?.contractStart ?? "", durationMonths: e?.durationMonths ? String(e.durationMonths) : "", discount: e?.discountBps ? String(e.discountBps / 100).replace(".", ",") : "",
    setupFee: e?.setupFeeMinor ? String(e.setupFeeMinor / 100).replace(".", ",") : "", specialConditions: e?.specialConditions ?? "", renewalNote: e?.renewalNote ?? "",
    closedOn: e?.closedOn ?? today(), evidence: e?.evidence ?? "", notes: e?.notes ?? "",
  }));
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: ev.target.value }));
  const unit = parseMoney(f.price ?? "", f.currency as Currency);
  const setup = f.setupFee?.trim() ? parseMoney(f.setupFee, f.currency as Currency) : 0;
  const discountBps = f.discount?.trim() ? Math.round(Number(f.discount.replace(",", ".")) * 100) : 0;
  const preview = useMemo(() => dealPreview({ members: Number(f.members), unitPriceMinor: unit ?? 0, periodicity: f.periodicity as never, contractStart: f.contractStart, durationMonths: f.durationMonths ? Number(f.durationMonths) : null, discountBps, setupFeeMinor: setup ?? 0 }),
    [f.members, unit, f.periodicity, f.contractStart, f.durationMonths, discountBps, setup]);
  const stepErrors = [
    [(f.businessName ?? "").trim().length < 2 && "nombre del gimnasio o cliente", (f.contactName ?? "").trim().length < 2 && "responsable", !f.contactEmail.trim() && f.contactPhone.replace(/\D/g, "").length < 8 && "email o teléfono del responsable"],
    [!preview.ok && "condiciones válidas (cantidad, precio, inicio)", unit == null && "precio por socio", setup == null && "cargo inicial válido"],
    [!f.closedOn && "fecha de cierre", (f.evidence ?? "").trim().length < 5 && "evidencia del acuerdo"],
  ].map((x) => x.filter(Boolean) as string[]);
  const next = () => { const errs = stepErrors[step] ?? []; if (errs.length) { flash(`Falta: ${errs.join(", ")}.`); return; } setStep(step + 1); window.scrollTo(0, 0); };
  const pick = (id: string) => {
    const r = pipe.data?.rows.find((x) => x.prospectId === id);
    setF((x) => ({ ...x, prospectId: id, opportunityId: r?.opportunityId ?? "", businessName: r?.name ?? x.businessName, contactName: r?.contactName ?? x.contactName, contactEmail: r?.email ?? x.contactEmail, contactPhone: r?.phone ?? x.contactPhone,
      city: r?.city ?? x.city, province: r?.province ?? x.province, clientKind: (r?.kind as "gym") ?? x.clientKind, members: r?.estMembers ? String(r.estMembers) : x.members, price: r?.estUnitPriceMinor ? String(r.estUnitPriceMinor / 100).replace(".", ",") : x.price, currency: r?.currency ?? x.currency }));
  };
  const submit = async () => {
    setBusy(true);
    const payload = {
      prospectId: f.prospectId || null, opportunityId: f.opportunityId || null, kind: f.kind, clientKind: f.clientKind, orgId: f.orgId || null, businessName: f.businessName, legalName: f.legalName || null, cuit: f.cuit || null,
      contactName: f.contactName, contactEmail: f.contactEmail || null, contactPhone: f.contactPhone || null, city: f.city || null, province: f.province || null, address: f.address || null,
      locations: f.locations.split(",").map((x) => x.trim()).filter(Boolean), members: Number(f.members), unitPriceMinor: unit, currency: f.currency, periodicity: f.periodicity, contractStart: f.contractStart,
      durationMonths: f.durationMonths ? Number(f.durationMonths) : null, renewalNote: f.renewalNote || null, discountBps, setupFeeMinor: setup ?? 0, specialConditions: f.specialConditions || null, evidence: f.evidence, closedOn: f.closedOn, notes: f.notes || null,
    };
    try {
      if (e) await api(`/api/ventas/deals/${e.id}`, { body: { ...payload, revision: e.revision } });
      else await api("/api/ventas/deals", { body: { ...payload, idempotencyKey: key.current } });
      flash(e ? "Corrección enviada a REPI." : "Venta enviada. REPI la revisa antes de habilitar al cliente.");
      done();
    } catch (x) { flash((x as Error).message); } finally { setBusy(false); }
  };
  if (me.status !== "active") return <><Head title="Registrar venta" /><div className="empty">Tu cuenta comercial no permite cargar ventas en este momento.</div></>;
  const STEP = ["Cliente", "Condiciones", "Cierre", "Revisar"];
  return (
    <>
      <Head kicker={e ? "Corregí lo que pidió REPI y volvé a enviarla" : f.kind !== "new" ? `${DEAL_KIND[f.kind as "renewal"]} · ${f.businessName}` : "Cargá el cliente que acabás de cerrar"} title={e ? "Corregir venta" : "Registrar venta"} />
      {e?.reviewNote && <p className="gy-warn" style={{ margin: 0 }}>REPI pidió: {e.reviewNote}</p>}
      <ol className="sv-steps" aria-label={`Paso ${step + 1} de 4: ${STEP[step]}`}>{STEP.map((s, i) => <li key={s} data-on={i <= step ? "1" : "0"}><span className="sr-only">{s}</span></li>)}</ol>
      <section className="card">
        <h2>{step + 1} · {STEP[step]}</h2>
        {step === 0 && <>
          {!init && !e && pipe.data && pipe.data.rows.length > 0 && <label className="field">Prospecto de origen (opcional)<select value={f.prospectId} onChange={(x) => pick(x.target.value)}><option value="">Ninguno</option>{pipe.data.rows.filter((r) => r.stage !== "won" && r.stage !== "pending_validation").map((r) => <option key={r.prospectId} value={r.prospectId}>{r.name}</option>)}</select></label>}
          <div className="grid-2">
            <label className="field">Gimnasio o cliente *<input value={f.businessName} onChange={set("businessName")} disabled={!!f.orgId} /></label>
            {me.canSellCoaches && !f.orgId && <label className="field">Tipo<select value={f.clientKind} onChange={set("clientKind")}><option value="gym">Gimnasio</option><option value="coach">Entrenador independiente</option></select></label>}
            <label className="field">Responsable *<input value={f.contactName} onChange={set("contactName")} autoComplete="name" /></label>
            <label className="field">Email del responsable<input type="email" value={f.contactEmail} onChange={set("contactEmail")} autoComplete="email" /></label>
            <label className="field">Teléfono<input type="tel" value={f.contactPhone} onChange={set("contactPhone")} autoComplete="tel" /></label>
            <label className="field">Ciudad<input value={f.city} onChange={set("city")} /></label>
            <label className="field">Provincia<input value={f.province} onChange={set("province")} /></label>
            <label className="field">Dirección<input value={f.address} onChange={set("address")} /></label>
            {f.clientKind === "gym" && <label className="field">Sedes (separadas por coma)<input value={f.locations} onChange={set("locations")} placeholder="Centro, Norte" /></label>}
            <label className="field">Razón social (si se conoce)<input value={f.legalName} onChange={set("legalName")} /></label>
            <label className="field">CUIT (si corresponde)<input inputMode="numeric" value={f.cuit} onChange={set("cuit")} /></label>
          </div>
          <p className="sv-note">REPI crea la cuenta del cliente con el email del responsable recién cuando aprueba la venta y se firma el acuerdo.</p>
        </>}
        {step === 1 && <>
          <div className="grid-2">
            <label className="field">Socios acordados *<input inputMode="numeric" value={f.members} onChange={set("members")} /></label>
            <label className="field">Precio pactado por socio/mes *<input inputMode="decimal" value={f.price} onChange={set("price")} placeholder="Ej.: 500 o 1.250,50" /></label>
            <label className="field">Moneda<select value={f.currency} onChange={set("currency")}><option>ARS</option><option>USD</option></select></label>
            <label className="field">Facturación al cliente<select value={f.periodicity} onChange={set("periodicity")}>{Object.entries(BILLING_PERIODICITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field">Inicio del contrato *<input type="date" value={f.contractStart} onChange={set("contractStart")} /></label>
            <label className="field">Duración en meses (si se acordó)<input inputMode="numeric" value={f.durationMonths} onChange={set("durationMonths")} /></label>
            <label className="field">Descuento % (si corresponde)<input inputMode="decimal" value={f.discount} onChange={set("discount")} /></label>
            <label className="field">Cargo inicial (si corresponde)<input inputMode="decimal" value={f.setupFee} onChange={set("setupFee")} /></label>
          </div>
          <label className="field">Renovación acordada<input value={f.renewalNote} onChange={set("renewalNote")} placeholder="Opcional" /></label>
          <label className="field">Condiciones especiales<textarea rows={2} value={f.specialConditions} onChange={set("specialConditions")} maxLength={1000} /></label>
          <PreviewBox p={preview} currency={f.currency} members={Number(f.members)} unit={unit} />
        </>}
        {step === 2 && <>
          <div className="grid-2"><label className="field">Fecha de cierre *<input type="date" max={today()} value={f.closedOn} onChange={set("closedOn")} /></label></div>
          <label className="field">Evidencia del acuerdo * <textarea rows={3} value={f.evidence} onChange={set("evidence")} maxLength={1000} placeholder="Link a la propuesta firmada, número de presupuesto, mail de aceptación…" /></label>
          <label className="field">Observaciones<textarea rows={2} value={f.notes} onChange={set("notes")} maxLength={1000} /></label>
          <p className="sv-note">La evidencia queda para que REPI la revise. No subas datos personales de socios.</p>
        </>}
        {step === 3 && <>
          <dl className="sv-preview">
            <dt>Cliente</dt><dd>{f.businessName}</dd><dt>Responsable</dt><dd>{f.contactName}</dd><dt>Tipo</dt><dd>{DEAL_KIND[f.kind as "new"]}</dd>
            <dt>Socios acordados</dt><dd>{f.members}</dd><dt>Precio por socio</dt><dd>{money(unit, f.currency)}</dd><dt>Inicio</dt><dd>{f.contractStart}</dd><dt>Cierre</dt><dd>{f.closedOn}</dd>
          </dl>
          <PreviewBox p={preview} currency={f.currency} members={Number(f.members)} unit={unit} />
          <p className="sv-note">Al enviar, la venta queda pendiente de revisión. Aprobarla no es lo mismo que el contrato firmado, la habilitación del cliente ni un cobro: cada paso lo registra REPI.</p>
        </>}
        <div className="mfoot">
          {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>Atrás</button>}
          {step < 3 ? <button type="button" className="btn pri" onClick={next}>Siguiente</button> : <button type="button" className="btn pri" aria-busy={busy || undefined} disabled={busy} onClick={submit}>{e ? "Enviar corrección" : "Enviar venta"}</button>}
        </div>
      </section>
    </>
  );
}
function PreviewBox({ p, currency, members, unit }: { p: ReturnType<typeof dealPreview>; currency: string; members: number; unit: number | null }) {
  if (!p.ok) return <p className="sv-note">Completá cantidad, precio e inicio para ver la vista previa.</p>;
  return (
    <div className="card" style={{ background: "var(--ui-surface-2)" }} aria-live="polite">
      <h2>Vista previa del acuerdo</h2>
      <dl className="sv-preview">
        <dt>{members} socios × {money(unit, currency)}</dt><dd>{money(p.monthlyGross, currency)}/mes</dd>
        {p.discountMinor > 0 && <><dt>Descuento</dt><dd>−{money(p.discountMinor, currency)}/mes</dd></>}
        <dt>Importe mensual</dt><dd>{money(p.monthlyNet, currency)}</dd>
        <dt>Por período de facturación ({p.periodMonths} {p.periodMonths === 1 ? "mes" : "meses"})</dt><dd>{money(p.perPeriod, currency)}</dd>
        {p.setupFeeMinor > 0 && <><dt>Cargo inicial</dt><dd>{money(p.setupFeeMinor, currency)}</dd></>}
        <dt>Total contractual estimado</dt><dd>{p.totalContract != null ? money(p.totalContract, currency) : "Sin duración acordada"}</dd>
        <dt>Próxima revisión</dt><dd>{p.reviewOn}</dd>
      </dl>
      <p className="sv-note">Antes de ajustes contractuales. La cantidad pactada se factura aunque no todos los socios usen la app; los usuarios habilitados son otra métrica.</p>
    </div>
  );
}

// ── Mis ventas ──────────────────────────────────────────────────────────────
function Deals({ flash, canWrite, focus, edit }: { flash: (t: string) => void; canWrite: boolean; focus?: string; edit: (d: DealRow) => void }) {
  const d = useLoad<DealRow[]>("/api/ventas/deals");
  const withdraw = async (id: string) => { if (!window.confirm("¿Retirar esta venta? REPI deja de revisarla.")) return; try { await api(`/api/ventas/deals/${id}/withdraw`, { body: {} }); flash("Venta retirada."); d.reload(); } catch (e) { flash((e as Error).message); } };
  return (
    <>
      <Head kicker="Estado de lo que declaraste. Aprobada ≠ contrato firmado ≠ cliente habilitado ≠ cobrado." title="Mis ventas" />
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <div className="empty">Todavía no registraste ventas.</div> : d.data.map((x) => (
        <section key={x.id} className="card" style={focus === x.id ? { borderColor: "var(--ui-accent)" } : undefined}>
          <div className="mhead"><h2>{x.businessName} <small className="muted">· {x.kindLabel}</small></h2><span className={`chip ${STATUS_CHIP[x.status] ?? "mute"}`}>{x.statusLabel}</span></div>
          <p className="sv-note">{x.members} socios × {money(x.unitPriceMinor, x.currency)} · inicio {x.contractStart} · declarada {fmt(x.createdAt)}{x.approvedAt ? ` · aprobada ${fmt(x.approvedAt)}` : ""}</p>
          {x.preview && <p className="sv-note">Mensual {money(x.preview.monthlyNet, x.currency)}{x.preview.totalContract != null ? ` · total estimado ${money(x.preview.totalContract, x.currency)}` : ""}</p>}
          {x.reviewNote && <p className={x.status === "needs_correction" ? "gy-warn" : "sv-note"} style={{ margin: 0 }}>REPI: {x.reviewNote}</p>}
          {x.estimate && <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Comisión estimada</summary><ul className="sv-timeline">{x.estimate.lines.map((l, i) => <li key={i}>{l.label}: <b>{l.amountMinor != null ? money(l.amountMinor, l.currency) : "a definir"}</b><small>{l.note}</small></li>)}</ul><p className="sv-note">{x.estimate.disclaimer}</p></details>}
          {canWrite && (x.status === "declared" || x.status === "needs_correction") && <div className="mfoot">
            <button type="button" className="btn sm" onClick={() => withdraw(x.id)}>Retirar</button>
            <button type="button" className={`btn sm${x.status === "needs_correction" ? " pri" : ""}`} onClick={() => edit(x)}>{x.status === "needs_correction" ? "Corregir y reenviar" : "Editar"}</button>
          </div>}
        </section>
      ))}
    </>
  );
}

// ── Mis clientes ────────────────────────────────────────────────────────────
type Client = { orgId: string; name: string; kind: "gym" | "coach"; contractStatus: string; stageLabel: string; role: string; agreed: number | null; unitPrice: string | null; monthlyMinor: number | null; currency: string; enabledAccesses: number; collectedMinor: number; since: string };
function Clients({ canWrite, sellTo }: { canWrite: boolean; sellTo: (c: Client, kind: "renewal" | "modification") => void }) {
  const d = useLoad<Client[]>("/api/ventas/clients");
  return (
    <>
      <Head kicker="Clientes con atribución vigente a vos. Sólo datos comerciales: nunca entrenamiento, salud ni chats de socios." title="Mis clientes" />
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <div className="empty">Cuando REPI apruebe una venta tuya, el cliente aparece acá con su estado de alta.</div> : d.data.map((c) => (
        <div key={c.orgId} className="sv-row">
          <span className="main"><b>{c.name}</b><small>{c.stageLabel} · {c.role} · desde {c.since}</small>
            <small>Acordado: {c.agreed ?? "—"} socios × {c.unitPrice ?? "—"} = <span className="sv-money">{money(c.monthlyMinor, c.currency)}</span>/mes · cobrado por REPI: <span className="sv-money">{money(c.collectedMinor, c.currency)}</span> · accesos habilitados: {c.enabledAccesses}</small></span>
          <span className={`chip ${c.contractStatus === "enabled" ? "ok" : c.contractStatus === "suspended" ? "warn" : "mute"}`}>{{ draft: "Contrato en borrador", accepted: "Acuerdo aceptado", enabled: "Habilitado", suspended: "Suspendido", ended: "Finalizado" }[c.contractStatus] ?? c.contractStatus}</span>
          {canWrite && <button type="button" className="btn sm" onClick={() => sellTo(c, "modification")}>Ampliación o renegociación</button>}
          {canWrite && <button type="button" className="btn sm" onClick={() => sellTo(c, "renewal")}>Renovación</button>}
        </div>
      ))}
    </>
  );
}

// ── Comisiones y liquidaciones ──────────────────────────────────────────────
type Entry = { id: string; client: string | null; concept: string; amountMinor: number; currency: string; accrualOn: string; availableOn: string; state: string; stateLabel: string; reason: string | null; sourceType: string; baseMinor: number | null; rateBps: number | null };
type Coms = { entries: Entry[]; totals: Totals; estimates: { dealId: string; client: string; estimate: DealRow["estimate"] }[]; batches: { id: string; status: string; currency: string; totalMinor: number; paidMinor: number; cutoffOn: string; createdAt: string }[] };
function Commissions() {
  const d = useLoad<Coms>("/api/ventas/commissions");
  const prof = useLoad<{ plan: { name: string; version: number; rules: CommissionRules; effectiveFrom: string } | null }>("/api/ventas/profile");
  const [state, setState] = useState("all");
  const v = d.data;
  const months = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of (v?.entries ?? []).filter((x) => state === "all" || x.state === state)) (m.get(e.availableOn.slice(0, 7)) ?? m.set(e.availableOn.slice(0, 7), []).get(e.availableOn.slice(0, 7))!).push(e);
    return [...m.entries()];
  }, [v, state]);
  const plan = prof.data?.plan;
  return (
    <>
      <Head kicker="Derecho económico (devengada) ≠ disponible para liquidar ≠ pagada. Cada comisión dice de qué cliente, período y concepto viene." title="Comisiones" />
      {plan && <section className="card"><h2>Tu plan: {plan.name} v{plan.version} <small className="muted">desde el {dayTxt(plan.effectiveFrom)}</small></h2>
        <ul className="sv-timeline">{plan.rules.components.map((c, i) => <li key={i}>{describeComponent(c, (m) => money(m, plan.rules.currency))}</li>)}</ul>
        <p className="sv-note">{planTerms(plan.rules)[0].toUpperCase() + planTerms(plan.rules).slice(1)}.</p></section>}
      {prof.data && !plan && <p className="gy-warn" style={{ margin: 0 }}>Todavía no tenés un plan de comisiones asignado. REPI lo define según tu acuerdo comercial.</p>}
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!v ? <p className="muted">Cargando…</p> : <>
        {Object.entries(v.totals).map(([cur, t]) => (
          <div key={cur} className="sv-kpis">
            {(["pending_validation", "accrued", "available", "in_payout", "paid"] as const).map((k) => <div key={k} className="sv-kpi"><span>{{ pending_validation: "Pendientes de validación (est.)", accrued: "Devengadas", available: "Disponibles", in_payout: "En liquidación", paid: "Pagadas" }[k]}</span><strong style={{ fontSize: 20 }}>{money(t[k], cur)}</strong></div>)}
            {t.reversed !== 0 && <div className="sv-kpi"><span>Revertidas</span><strong style={{ fontSize: 20 }}>{money(t.reversed, cur)}</strong><small>Compensadas por su reversión</small></div>}
          </div>
        ))}
        {v.estimates.length > 0 && <section className="sv-sec"><h2>Estimadas · ventas sin aprobar</h2>{v.estimates.map((x) => <div key={x.dealId} className="sv-row"><span className="main"><b>{x.client}</b><small>{x.estimate?.lines.map((l) => `${l.label}: ${l.amountMinor != null ? money(l.amountMinor, l.currency) : "a definir"}`).join(" · ") ?? "Sin plan"}</small></span><span className="chip mute">Estimada</span></div>)}</section>}
        <div className="sv-filter"><label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>Ver
          <select value={state} onChange={(e) => setState(e.target.value)}><option value="all">Todas</option><option value="accrued">Devengadas</option><option value="available">Disponibles</option><option value="in_payout">En liquidación</option><option value="paid">Pagadas</option><option value="reversed">Revertidas</option></select></label></div>
        {!months.length ? <div className="empty">Sin comisiones para mostrar.</div> : months.map(([m, items]) => (
          <section key={m} className="sv-sec" aria-label={`Disponibles desde ${m}`}>
            <h2>{fmt(`${m}-15T12:00:00Z`, { month: "long", year: "numeric" })}</h2>
            {items.map((e) => (
              <div key={e.id} className="sv-row"><span className="main"><b>{e.concept}</b><small>{e.client ?? "—"} · devengada {e.accrualOn} · disponible {e.availableOn}{e.reason ? ` · ${e.reason}` : ""}</small></span>
                <span className={`sv-money${e.amountMinor < 0 ? " sv-neg" : ""}`}>{money(e.amountMinor, e.currency)}</span><span className={`chip ${STATE_CHIP[e.state] ?? "mute"}`}>{e.stateLabel}</span></div>
            ))}
          </section>
        ))}
      </>}
    </>
  );
}

type Batch = { batch: { id: string; status: string; currency: string; totalMinor: number; paidMinor: number; cutoffOn: string; createdAt: string; approvedAt: string | null }; items: { entryId: string; concept: string; client: string | null; amountMinor: number; accrualOn: string }[]; payments: { id: string; amountMinor: number; paidOn: string; methodLabel: string; reference: string; status: string; voidReason: string | null }[] };
export const BATCH_ST: Record<string, [string, string]> = { draft: ["En preparación", "mute"], approved: ["Aprobada · a pagar", "info"], partially_paid: ["Pago parcial", "warn"], paid: ["Pagada", "ok"], cancelled: ["Cancelada", "mute"] };
function Payouts({ focus }: { focus?: string }) {
  const d = useLoad<Coms>("/api/ventas/commissions");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (focus) setOpen(focus); }, [focus]);
  return (
    <>
      <Head kicker="Liquidaciones internas de tus comisiones y los pagos que registró REPI. No son facturas ni comprobantes fiscales." title="Liquidaciones" />
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.batches.length ? <div className="empty">Todavía no hay liquidaciones.</div> : d.data.batches.map((b) => (
        <div key={b.id} className="sv-row"><span className="main"><b>Corte al {dayTxt(b.cutoffOn)}</b><small>Pagado {money(b.paidMinor, b.currency)} de {money(b.totalMinor, b.currency)}</small></span>
          <span className="sv-money">{money(b.totalMinor, b.currency)}</span><span className={`chip ${BATCH_ST[b.status]?.[1] ?? "mute"}`}>{BATCH_ST[b.status]?.[0] ?? b.status}</span>
          <button type="button" className="btn sm" onClick={() => setOpen(b.id)}>Ver</button></div>
      ))}
      {open && <BatchModal url={`/api/ventas/payouts/${open}`} onClose={() => setOpen(null)} />}
    </>
  );
}
export function BatchModal({ url, onClose, actions }: { url: string; onClose: () => void; actions?: (b: Batch, reload: () => void) => React.ReactNode }) {
  const d = useLoad<Batch>(url);
  const b = d.data;
  return (
    <Modal label="Liquidación" onClose={onClose} wide>
      <div className="mhead"><h2>Liquidación {b ? `· corte ${b.batch.cutoffOn}` : ""}</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {b && <>
        <p className="sv-note"><span className={`chip ${BATCH_ST[b.batch.status]?.[1]}`}>{BATCH_ST[b.batch.status]?.[0]}</span> · Total {money(b.batch.totalMinor, b.batch.currency)} · pagado {money(b.batch.paidMinor, b.batch.currency)} · saldo {money(b.batch.totalMinor - b.batch.paidMinor, b.batch.currency)}</p>
        <section className="card" style={{ padding: 0 }}><div style={{ overflowX: "auto" }} tabIndex={0}><table className="gy-table"><thead><tr><th>Concepto</th><th>Cliente</th><th>Devengada</th><th>Importe</th></tr></thead>
          <tbody>{b.items.map((i) => <tr key={i.entryId}><td>{i.concept}</td><td>{i.client ?? "—"}</td><td>{i.accrualOn}</td><td className={`sv-money${i.amountMinor < 0 ? " sv-neg" : ""}`}>{money(i.amountMinor, b.batch.currency)}</td></tr>)}</tbody></table></div></section>
        <h2>Pagos registrados</h2>
        {!b.payments.length ? <p className="sv-note">Sin pagos registrados.</p> : <ul className="sv-timeline">{b.payments.map((p) => <li key={p.id} style={p.status === "voided" ? { opacity: .6 } : undefined}><b className="sv-money">{money(p.amountMinor, b.batch.currency)}</b> · {p.methodLabel} · {p.paidOn} · ref. {p.reference}{p.status === "voided" && <> · <span className="chip bad">Anulado: {p.voidReason}</span></>}</li>)}</ul>}
        {actions?.(b, d.reload)}
        <a className="btn" href={`/ventas/liquidacion/${b.batch.id}`} target="_blank" rel="noopener" style={{ display: "inline-grid", placeItems: "center", textDecoration: "none" }}>Resumen imprimible</a>
      </>}
    </Modal>
  );
}

// ── Objetivos, material, avisos y perfil ────────────────────────────────────
function Targets() {
  const d = useLoad<{ month: string; items: Dash["targets"] }[]>("/api/ventas/targets");
  return (
    <>
      <Head kicker="Los define REPI con vos. Miden lo aprobado y lo registrado, no lo declarado." title="Objetivos" />
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : d.data.map((m) => (
        <section key={m.month} className="sv-sec"><h2>{fmt(`${m.month}-15T12:00:00Z`, { month: "long", year: "numeric" })}</h2>{m.items.length ? <TargetBars items={m.items} /> : <div className="empty">Sin objetivos cargados para este mes.</div>}</section>
      ))}
    </>
  );
}
type Mat = { id: string; kind: string; kindLabel: string; title: string; description: string | null; url: string | null; body: string | null; version: number; validUntil: string | null; expired: boolean; updatedAt: string };
function Materials({ flash }: { flash: (t: string) => void }) {
  const d = useLoad<Mat[]>("/api/ventas/materials");
  const share = async (m: Mat) => {
    const url = m.url?.startsWith("/") ? `${location.origin}${m.url}` : m.url;
    try {
      if (navigator.share) { await navigator.share({ title: m.title, text: m.description ?? m.title, url: url ?? undefined }); return; }
      await navigator.clipboard.writeText(url ?? `${m.title}\n\n${m.body ?? ""}`); flash("Copiado para compartir.");
    } catch { /* cancelado */ }
  };
  const kinds = [...new Set((d.data ?? []).map((m) => m.kindLabel))];
  return (
    <>
      <Head kicker="Recursos aprobados por REPI para presentar y vender. Revisá la vigencia antes de compartir condiciones." title="Material de ventas" />
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <div className="empty">REPI todavía no publicó material.</div> : kinds.map((k) => (
        <section key={k} className="sv-sec"><h2>{k}</h2>{d.data!.filter((m) => m.kindLabel === k).map((m) => (
          <div key={m.id} className="card">
            <div className="mhead"><b>{m.title} <small className="muted">v{m.version}</small></b>{m.expired && <span className="chip warn">Vencido el {m.validUntil}: no lo uses como vigente</span>}</div>
            {m.description && <p className="sv-note">{m.description}</p>}
            {m.body && <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Leer</summary><p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{m.body}</p></details>}
            <div className="sv-filter">{m.url && <a className="btn sm" href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-grid", placeItems: "center", textDecoration: "none" }}>Abrir</a>}<button type="button" className="btn sm" onClick={() => share(m)}>Compartir</button></div>
          </div>
        ))}</section>
      ))}
    </>
  );
}
function Notices({ reload }: { reload: () => void }) {
  const d = useLoad<{ id: string; title: string; body: string; url: string | null; readAt: string | null; createdAt: string }[]>("/api/ventas/notices");
  useEffect(() => { if (d.data?.some((n) => !n.readAt)) void api("/api/ventas/notices/read", { body: {} }).then(reload).catch(() => {}); }, [d.data, reload]);
  return (
    <>
      <Head title="Avisos" />
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <div className="empty">Sin avisos.</div> : d.data.map((n) => (
        <div key={n.id} className="sv-row"><span className="main"><b>{n.title}{!n.readAt && <> <span className="chip info">Nuevo</span></>}</b><small>{n.body}</small><small>{when(n.createdAt)}</small></span>{n.url && <a className="btn sm" href={n.url} style={{ display: "inline-grid", placeItems: "center", textDecoration: "none" }}>Ver</a>}</div>
      ))}
    </>
  );
}
type Prof = { rep: { code: string; name: string; email: string; phone: string | null; city: string | null; province: string | null; zone: string | null; statusLabel: string; payoutFrequency: keyof typeof PAYOUT_FREQUENCY; payoutNote: string | null; canSellCoaches: boolean; joinedAt: string | null };
  manager: string | null; plan: { name: string; version: number } | null; frequencyRequest: { status: string; payload: { to: keyof typeof PAYOUT_FREQUENCY }; resolution: string | null; createdAt: string } | null; referralUrl: string };
function ProfileForm({ first, flash, onSaved, p }: { first?: boolean; flash: (t: string) => void; onSaved: () => void; p?: Prof }) {
  const [f, setF] = useState({ phone: p?.rep.phone ?? "", city: p?.rep.city ?? "", province: p?.rep.province ?? "", zone: p?.rep.zone ?? "" });
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await api("/api/ventas/profile", { body: f }); flash("Perfil guardado."); onSaved(); } catch (e) { flash((e as Error).message); } finally { setBusy(false); } };
  return (
    <section className="card">
      <h2>{first ? "Completá tu perfil comercial" : "Datos de contacto"}</h2>
      {first && <p className="sv-note">Con estos datos REPI te asigna zona y prospectos. Después entrás a tu panel.</p>}
      <div className="grid-2">
        <label className="field">Teléfono *<input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></label>
        <label className="field">Ciudad *<input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
        <label className="field">Provincia *<input value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })} /></label>
        <label className="field">Zona en la que trabajás<input value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} /></label>
      </div>
      <div className="mfoot"><button type="button" className="btn pri" aria-busy={busy || undefined} onClick={save}>{first ? "Guardar y entrar" : "Guardar"}</button></div>
    </section>
  );
}
function Profile({ flash }: { flash: (t: string) => void }) {
  const d = useLoad<Prof>("/api/ventas/profile");
  const [freq, setFreq] = useState("");
  const [msg, setMsg] = useState("");
  const v = d.data;
  const ask = async () => { try { await api("/api/ventas/profile/frequency", { body: { frequency: freq, message: msg || null } }); flash("Solicitud enviada a REPI."); setFreq(""); setMsg(""); d.reload(); } catch (e) { flash((e as Error).message); } };
  return (
    <>
      <Head kicker={v ? `${v.rep.code} · ${v.rep.statusLabel}` : undefined} title="Mi perfil" />
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {v && <>
        <section className="card"><h2>{v.rep.name}</h2>
          <dl className="sv-preview"><dt>Email</dt><dd>{v.rep.email}</dd><dt>Código comercial</dt><dd>{v.rep.code}</dd><dt>Responsable</dt><dd>{v.manager ?? "—"}</dd><dt>Vende a entrenadores</dt><dd>{v.rep.canSellCoaches ? "Sí" : "No"}</dd><dt>Plan</dt><dd>{v.plan ? `${v.plan.name} v${v.plan.version}` : "Sin asignar"}</dd><dt>Desde</dt><dd>{v.rep.joinedAt ? fmt(v.rep.joinedAt, { day: "numeric", month: "short", year: "numeric" }) : "—"}</dd></dl>
        </section>
        <ProfileForm flash={flash} onSaved={d.reload} p={v} />
        <section className="card"><h2>Frecuencia de liquidación</h2>
          <p className="sv-note">Actual: <b>{PAYOUT_FREQUENCY[v.rep.payoutFrequency]}</b>{v.rep.payoutNote ? ` (${v.rep.payoutNote})` : ""}. Sólo cambia cuándo se agrupan tus comisiones disponibles: no cambia importes ni adelanta comisiones.</p>
          {v.frequencyRequest && <p className="sv-note">Última solicitud: {PAYOUT_FREQUENCY[v.frequencyRequest.payload.to]} · <span className={`chip ${v.frequencyRequest.status === "approved" ? "ok" : v.frequencyRequest.status === "rejected" ? "bad" : "info"}`}>{{ open: "En revisión", approved: "Aprobada", rejected: "Rechazada" }[v.frequencyRequest.status]}</span>{v.frequencyRequest.resolution ? ` · ${v.frequencyRequest.resolution}` : ""}</p>}
          <div className="grid-2"><label className="field">Pedir otra frecuencia<select value={freq} onChange={(e) => setFreq(e.target.value)}><option value="">Elegí…</option>{Object.entries(PAYOUT_FREQUENCY).filter(([k]) => k !== "custom" && k !== v.rep.payoutFrequency).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field">Comentario<input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} /></label></div>
          <div className="mfoot"><button type="button" className="btn" disabled={!freq} onClick={ask}>Enviar solicitud</button></div>
        </section>
        <section className="card"><h2>Tu enlace personal</h2>
          <p className="sv-note">Compartilo con gimnasios: si dejan sus datos desde ese enlace, REPI registra que llegaron por vos como origen. Una visita anónima no atribuye una venta.</p>
          <div className="sv-filter"><input readOnly value={v.referralUrl} aria-label="Enlace personal" onFocus={(e) => e.target.select()} style={{ flex: "1 1 260px" }} />
            <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(v.referralUrl); flash("Enlace copiado."); } catch { flash("No se pudo copiar: seleccionalo y copialo."); } }}>Copiar</button></div>
        </section>
      </>}
    </>
  );
}
