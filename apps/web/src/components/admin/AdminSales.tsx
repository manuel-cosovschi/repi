"use client";
// REPI Admin › Ventas y Vendedores (D209). Toda acción llama a /api/admin/sales, que exige Admin con 2FA y audita.
// Contratado, cobrado y comisiones van separados y con su definición. Nada de esto emite cobros ni transferencias.
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  BILLING_PERIODICITY, COMPONENT_LABEL, DEAL_STATUS, DUP_SIGNAL_LABEL, ENGAGEMENT, MATERIAL_KINDS, PAYOUT_FREQUENCY, REP_STATUS, STAGES, TARGET_METRICS, TRIGGER_LABEL, applyBps, bracketFor, describeComponent, localDate, parseMoney, validateRules,
  type CommissionComponent, type CommissionRules, type Currency, type MemberBracket, type RepStatus, type Stage,
} from "@repi/domain";
import { api, ApiError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Head, Seg, fmt, useLoad, when } from "@/components/gym/shared";
import { BATCH_ST, BatchModal, curMap, dayTxt, money, planTerms } from "@/components/sales/SalesApp";

type Flash = (t: string) => void;
const today = () => localDate(new Date());
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
const REP_CHIP: Record<string, string> = { invited: "mute", pending_acceptance: "info", active: "ok", paused: "warn", suspended: "warn", terminated: "mute" };
const DEAL_CHIP: Record<string, string> = { declared: "info", needs_correction: "warn", approved: "ok", rejected: "bad", withdrawn: "mute" };
const go = async (fn: () => Promise<unknown>, flash: Flash, ok: string, after?: () => void) => { try { await fn(); flash(ok); after?.(); return true; } catch (e) { flash((e as Error).message); return false; } };
type Opt = { id: string; name: string; code: string; status: string };

export function AdminSales({ section, flash, initial }: { section: "sales" | "reps"; flash: Flash; initial?: { tab?: string; deal?: string; rep?: string } }) {
  const [tab, setTab] = useState(section === "reps" ? "reps" : initial?.tab ?? "overview");
  useEffect(() => { if (section === "reps") setTab("reps"); else if (tab === "reps") setTab("overview"); }, [section]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts = useLoad<Opt[]>("/api/admin/sales/reps/options");
  if (section === "reps") return <Reps flash={flash} opts={opts.data ?? []} reloadOpts={opts.reload} focus={initial?.rep} />;
  return (
    <>
      <Head kicker="Fuerza comercial: pipeline, cierres declarados, comisiones y liquidaciones. Sin cobros ni transferencias automáticas." title="Ventas" />
      <div className="tabs sv-tabs" role="tablist" aria-label="Secciones de ventas">
        {([["overview", "Panel"], ["deals", "Cierres"], ["pipeline", "Pipeline"], ["commissions", "Comisiones"], ["payouts", "Liquidaciones"], ["requests", "Solicitudes"], ["materials", "Material"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "overview" && <><AdminNotices /><Overview /></>}
      {tab === "deals" && <DealsQueue flash={flash} opts={opts.data ?? []} focus={initial?.deal} />}
      {tab === "pipeline" && <AdminPipeline flash={flash} opts={opts.data ?? []} />}
      {tab === "commissions" && <CommissionsAdmin flash={flash} opts={opts.data ?? []} />}
      {tab === "payouts" && <PayoutsAdmin flash={flash} />}
      {tab === "requests" && <Requests flash={flash} />}
      {tab === "materials" && <MaterialsAdmin flash={flash} />}
    </>
  );
}

function AdminNotices() {
  const d = useLoad<{ id: string; title: string; body: string; url: string | null; readAt: string | null; createdAt: string }[]>("/api/admin/sales/notices");
  const unread = (d.data ?? []).filter((n) => !n.readAt);
  if (!unread.length) return null;
  return (
    <section className="card" aria-label="Avisos de ventas"><div className="mhead"><h2>Avisos de ventas ({unread.length})</h2><button type="button" className="btn sm" onClick={async () => { await api("/api/admin/sales/notices/read", { body: {} }).catch(() => {}); d.reload(); }}>Marcar como leídos</button></div>
      <ul className="sv-timeline">{unread.slice(0, 8).map((n) => <li key={n.id}>{n.url ? <a href={n.url}>{n.title}</a> : n.title}<small>{n.body} · {when(n.createdAt)}</small></li>)}</ul></section>
  );
}

// ── Panel ejecutivo ─────────────────────────────────────────────────────────
type CC = {
  period: { label: string }; provinces: string[]; reps: { id: string; name: string }[];
  kpis: { activeReps: number; prospects: number; openOpportunities: number; approved: number; clientsObtained: number; membersSold: number; pendingReview: number; needsCorrection: number; conversionPct: number | null; avgDaysToClose: number | null;
    contracted: Record<string, number>; collected: Record<string, number>; commissions: Record<string, Record<string, number>>; retentionLostPct: number | null; attributedClients: number };
  byStage: Record<Stage, number>; perRep: { id: string; name: string; code: string; province: string | null; status: string; approved: number; membersSold: number; pending: number; activeClients: number; contracted: Record<string, number>; collected: Record<string, number>; accrued: Record<string, number>; owed: Record<string, number>; paid: Record<string, number>; openOpps: number }[];
  byProvince: { province: string; approved: number; members: number; reps: number }[]; trend: { month: string; approved: number; members: number }[]; definitions: Record<string, string>;
};
function Bars({ rows, label }: { rows: [string, number][]; label: string }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return <div className="sv-hbar" role="list" aria-label={label}>{rows.map(([k, v]) => <Fragment key={k}><span role="listitem">{k}</span><div className="sv-bar" aria-hidden="true"><i style={{ width: `${(v / max) * 100}%` }} /></div><b className="sv-money">{v}</b></Fragment>)}</div>;
}
function Overview() {
  const [f, setF] = useState({ period: "month", repId: "", province: "", clientKind: "", source: "" });
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const d = useLoad<CC>(`/api/admin/sales/overview?${q}`);
  const v = d.data;
  const sumCur = (k: string) => { const o: Record<string, number> = {}; for (const [c, t] of Object.entries(v?.kpis.commissions ?? {})) o[c] = t[k] ?? 0; return curMap(o); };
  return (
    <>
      <div className="sv-filter">
        <Seg label="Período" value={f.period} onChange={(p) => setF({ ...f, period: p })} options={[["month", "Mes"], ["prev_month", "Mes anterior"], ["quarter", "3 meses"], ["year", "Año"]]} />
        <select aria-label="Vendedor" value={f.repId} onChange={(e) => setF({ ...f, repId: e.target.value })}><option value="">Todos los vendedores</option>{v?.reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select aria-label="Provincia" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value })}><option value="">Todas las provincias</option>{v?.provinces.map((p) => <option key={p}>{p}</option>)}</select>
        <select aria-label="Tipo de cliente" value={f.clientKind} onChange={(e) => setF({ ...f, clientKind: e.target.value })}><option value="">Gyms y coaches</option><option value="gym">Gimnasios</option><option value="coach">Coaches</option></select>
        <select aria-label="Fuente" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Toda fuente</option><option value="field">Contacto propio</option><option value="web_lead">Contacto web</option><option value="referral_link">Enlace del vendedor</option><option value="referral">Recomendación</option><option value="event">Evento</option></select>
        <a className="btn sm" href="/api/admin/sales/export/ledger" style={{ display: "inline-grid", placeItems: "center", textDecoration: "none" }}>Exportar comisiones (CSV)</a>
      </div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!v ? <p className="muted">Cargando…</p> : <>
        <div className="sv-kpis">
          <div className="sv-kpi"><span>Vendedores activos</span><strong>{v.kpis.activeReps}</strong></div>
          <div className="sv-kpi"><span>Prospectos</span><strong>{v.kpis.prospects}</strong><small>{v.kpis.openOpportunities} oportunidades abiertas</small></div>
          <div className="sv-kpi"><span>Ventas aprobadas</span><strong>{v.kpis.approved}</strong><small>{v.period.label} · {v.kpis.clientsObtained} clientes nuevos</small></div>
          <div className="sv-kpi"><span>Socios contratados</span><strong>{v.kpis.membersSold}</strong><small>En ventas aprobadas del período</small></div>
          <div className="sv-kpi"><span>Por revisar</span><strong>{v.kpis.pendingReview}</strong><small>{v.kpis.needsCorrection} con corrección pedida</small></div>
          <div className="sv-kpi"><span>Conversión</span><strong>{v.kpis.conversionPct != null ? `${v.kpis.conversionPct}%` : "—"}</strong><small>Tiempo a cierre: {v.kpis.avgDaysToClose != null ? `${v.kpis.avgDaysToClose} días` : "—"}</small></div>
          <div className="sv-kpi"><span>Contratado mensual (atribuido)</span><strong style={{ fontSize: 18 }}>{curMap(v.kpis.contracted)}</strong><small>MRR contractual, no cobrado</small></div>
          <div className="sv-kpi"><span>Cobrado (atribuido)</span><strong style={{ fontSize: 18 }}>{curMap(v.kpis.collected)}</strong><small>Pagos registrados en el período</small></div>
          <div className="sv-kpi"><span>Comisiones devengadas + disponibles</span><strong style={{ fontSize: 18 }}>{sumCur("available")}</strong><small>En retención: {sumCur("accrued")}</small></div>
          <div className="sv-kpi"><span>En liquidación / pagadas</span><strong style={{ fontSize: 18 }}>{sumCur("in_payout")}</strong><small>Pagadas: {sumCur("paid")}</small></div>
          <div className="sv-kpi"><span>Bajas de clientes adquiridos</span><strong>{v.kpis.retentionLostPct != null ? `${v.kpis.retentionLostPct}%` : "—"}</strong><small>{v.kpis.attributedClients} clientes atribuidos</small></div>
        </div>
        <div className="grid-2">
          <section className="card"><h2>Prospectos por etapa</h2><Bars label="Prospectos por etapa" rows={(Object.keys(STAGES) as Stage[]).map((s) => [STAGES[s], v.byStage[s] ?? 0])} /></section>
          <section className="card"><h2>Evolución (6 meses)</h2><Bars label="Ventas aprobadas por mes" rows={v.trend.map((t) => [`${fmt(`${t.month}-15T12:00:00Z`, { month: "short", year: "2-digit" })} · ${t.members} socios`, t.approved])} /></section>
        </div>
        <section className="card" style={{ padding: 0 }}><div style={{ overflowX: "auto" }} tabIndex={0}>
          <table className="gy-table"><caption className="sr-only">Rendimiento por vendedor</caption><thead><tr><th>Vendedor</th><th>Aprobadas</th><th>Socios</th><th>Pendientes</th><th>Clientes activos</th><th>Contratado/mes</th><th>Cobrado</th><th>Devengado (período)</th><th>Se le debe</th><th>Pagado</th></tr></thead>
            <tbody>{v.perRep.map((r) => <tr key={r.id}><th scope="row">{r.name}<br /><small className="muted">{r.code} · {r.province ?? "—"} · {REP_STATUS[r.status as RepStatus]}</small></th><td>{r.approved}</td><td>{r.membersSold}</td><td>{r.pending}</td><td>{r.activeClients}</td><td className="sv-money">{curMap(r.contracted)}</td><td className="sv-money">{curMap(r.collected)}</td><td className="sv-money">{curMap(r.accrued)}</td><td className="sv-money">{curMap(r.owed)}</td><td className="sv-money">{curMap(r.paid)}</td></tr>)}</tbody>
          </table></div></section>
        {v.byProvince.length > 0 && <section className="card"><h2>Por provincia</h2><Bars label="Ventas aprobadas por provincia" rows={v.byProvince.map((p) => [`${p.province} · ${p.reps} vendedor(es)`, p.approved])} /></section>}
        <details className="card"><summary style={{ cursor: "pointer", fontWeight: 600 }}>Fórmulas y fuentes</summary><ul className="sv-timeline">{Object.values(v.definitions).map((t) => <li key={t}>{t}</li>)}</ul></details>
      </>}
    </>
  );
}

// ── Vendedores ──────────────────────────────────────────────────────────────
type RepRow = { id: string; code: string; name: string; email: string; city: string | null; province: string | null; status: string; statusLabel: string; payoutFrequency: string; openOpportunities: number; approvedDeals: number; pendingDeals: number; createdAt: string };
function Reps({ flash, opts, reloadOpts, focus }: { flash: Flash; opts: Opt[]; reloadOpts: () => void; focus?: string }) {
  const [f, setF] = useState({ q: "", status: "", province: "", sort: "name", page: 1 });
  const [q, setQ] = useState("");
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q, page: 1 })), 300); return () => clearTimeout(t); }, [q]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, String(v)])).toString();
  const d = useLoad<{ total: number; page: number; pageSize: number; provinces: string[]; rows: RepRow[] }>(`/api/admin/sales/reps?${qs}`);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (focus) setOpen(focus); }, [focus]);
  const [create, setCreate] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const bulk = async (to: "active" | "paused" | "suspended") => {
    const reason = window.prompt(`Motivo para ${sel.length} vendedor(es):`);
    if (!reason?.trim()) return;
    try { const r = await api<{ results: { id: string; error?: string }[] }>("/api/admin/sales/reps-bulk/status", { body: { ids: sel, to, reason } }); const bad = r.results.filter((x) => x.error).length; flash(bad ? `${r.results.length - bad} actualizados; ${bad} no admitían ese cambio.` : "Estados actualizados."); setSel([]); d.reload(); } catch (e) { flash((e as Error).message); }
  };
  const v = d.data;
  return (
    <>
      <Head kicker="Representantes comerciales de REPI en todo el país. Un vendedor nunca es Admin ni ve datos de socios." title="Vendedores"><button type="button" className="btn pri" onClick={() => setCreate(true)}>Nuevo vendedor</button></Head>
      <div className="sv-filter">
        <input type="search" aria-label="Buscar vendedores" placeholder="Nombre, email, código o ciudad" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Estado" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">Todos los estados</option>{Object.entries(REP_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Provincia" value={f.province} onChange={(e) => setF({ ...f, province: e.target.value, page: 1 })}><option value="">Todas las provincias</option>{v?.provinces.map((p) => <option key={p}>{p}</option>)}</select>
        <select aria-label="Ordenar" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}><option value="name">Por nombre</option><option value="recent">Más recientes</option><option value="status">Por estado</option></select>
      </div>
      {sel.length > 0 && <div className="gy-warn" style={{ margin: 0 }}>{sel.length} seleccionado(s): <button type="button" className="btn sm" onClick={() => bulk("active")}>Activar</button><button type="button" className="btn sm" onClick={() => bulk("paused")}>Pausar</button><button type="button" className="btn sm" onClick={() => bulk("suspended")}>Suspender</button><button type="button" className="btn sm" onClick={() => setSel([])}>Quitar selección</button></div>}
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!v ? <p className="muted">Cargando…</p> : !v.rows.length ? <div className="empty">{f.q || f.status || f.province ? "Ningún vendedor coincide con los filtros." : "Todavía no hay vendedores. Creá el primero e invitalo por email."}</div> : (
        <section className="card" style={{ padding: 0 }}><div style={{ overflowX: "auto" }} tabIndex={0}>
          <table className="gy-table sv-reps-table"><thead><tr><th><span className="sr-only">Seleccionar</span></th><th>Vendedor</th><th>Estado</th><th>Zona</th><th>Oportunidades</th><th>Ventas</th><th>Liquidación</th><th><span className="sr-only">Abrir</span></th></tr></thead>
            <tbody>{v.rows.map((r) => <tr key={r.id}>
              <td><input type="checkbox" aria-label={`Seleccionar ${r.name}`} checked={sel.includes(r.id)} onChange={(e) => setSel((x) => e.target.checked ? [...x, r.id] : x.filter((y) => y !== r.id))} /></td>
              <th scope="row">{r.name}<br /><small className="muted">{r.code} · {r.email}</small></th><td><span className={`chip ${REP_CHIP[r.status]}`}>{r.statusLabel}</span></td><td data-label="Zona">{[r.city, r.province].filter(Boolean).join(", ") || "—"}</td>
              <td data-label="Oportunidades">{r.openOpportunities}</td><td data-label="Ventas">{r.approvedDeals} aprob.{r.pendingDeals ? ` · ${r.pendingDeals} pend.` : ""}</td><td data-label="Liquidación">{PAYOUT_FREQUENCY[r.payoutFrequency as keyof typeof PAYOUT_FREQUENCY]}</td>
              <td><button type="button" className="btn sm" onClick={() => setOpen(r.id)}>Abrir</button></td></tr>)}</tbody></table></div></section>
      )}
      {v && v.total > v.pageSize && <div className="sv-filter"><button type="button" className="btn sm" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Anterior</button><span className="muted">Página {v.page} de {Math.ceil(v.total / v.pageSize)} · {v.total} vendedores</span><button type="button" className="btn sm" disabled={v.page * v.pageSize >= v.total} onClick={() => setF({ ...f, page: f.page + 1 })}>Siguiente</button></div>}
      {create && <RepModal flash={flash} opts={opts} onClose={(id) => { setCreate(false); d.reload(); reloadOpts(); if (id) setOpen(id); }} />}
      {open && <RepProfile id={open} flash={flash} opts={opts} onClose={() => { setOpen(null); d.reload(); reloadOpts(); }} />}
    </>
  );
}
type RepForm = Record<string, string | boolean>;
function RepModal({ flash, opts, onClose, edit }: { flash: Flash; opts: Opt[]; onClose: (id: string | null) => void; edit?: { id: string } & RepForm }) {
  const regions = useLoad<{ id: string; name: string; active: boolean }[]>("/api/admin/sales/regions");
  const [f, setF] = useState<RepForm>(edit ?? { engagement: "independent", payoutFrequency: "monthly", canSellCoaches: false });
  const [busy, setBusy] = useState(false);
  const s = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (invite: boolean) => {
    setBusy(true);
    const body = { name: s("name"), email: s("email"), phone: s("phone") || null, city: s("city") || null, province: s("province") || null, zone: s("zone") || null, regionId: s("regionId") || null, managerRepId: s("managerRepId") || null,
      engagement: s("engagement"), canSellCoaches: !!f.canSellCoaches, payoutFrequency: s("payoutFrequency"), payoutNote: s("payoutNote") || null, agreementRef: s("agreementRef") || null };
    try {
      if (edit) { await api(`/api/admin/sales/reps/${edit.id}`, { body }); flash("Vendedor actualizado."); onClose(edit.id); return; }
      const r = await api<{ id: string }>("/api/admin/sales/reps", { body });
      if (invite) { try { await api(`/api/admin/sales/reps/${r.id}/invite`, { body: {} }); flash("Vendedor creado e invitado."); } catch (e) { flash(`Vendedor creado. La invitación falló: ${(e as Error).message}`); } }
      else flash("Vendedor creado. Invitalo cuando esté listo.");
      onClose(r.id);
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal label={edit ? "Editar vendedor" : "Nuevo vendedor"} onClose={() => onClose(null)} wide>
      <div className="mhead"><h2>{edit ? `Editar · ${s("name")}` : "Nuevo vendedor"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(null)}>×</button></div>
      <div className="grid-2">
        <label className="field">Nombre y apellido *<input value={s("name")} onChange={set("name")} /></label>
        <label className="field">Email *<input type="email" value={s("email")} onChange={set("email")} /></label>
        <label className="field">Teléfono<input type="tel" value={s("phone")} onChange={set("phone")} /></label>
        <label className="field">Ciudad<input value={s("city")} onChange={set("city")} /></label>
        <label className="field">Provincia<input value={s("province")} onChange={set("province")} /></label>
        <label className="field">Zona comercial<input value={s("zone")} onChange={set("zone")} /></label>
        <label className="field">Región<select value={s("regionId")} onChange={set("regionId")}><option value="">—</option>{regions.data?.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="field">Responsable comercial<select value={s("managerRepId")} onChange={set("managerRepId")}><option value="">—</option>{opts.filter((o) => o.id !== edit?.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <label className="field">Tipo de vinculación<select value={s("engagement")} onChange={set("engagement")}>{Object.entries(ENGAGEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field">Frecuencia de liquidación<select value={s("payoutFrequency")} onChange={set("payoutFrequency")}>{Object.entries(PAYOUT_FREQUENCY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {s("payoutFrequency") === "custom" && <label className="field">Detalle de la frecuencia *<input value={s("payoutNote")} onChange={set("payoutNote")} /></label>}
        <label className="field">Referencia del acuerdo comercial<input value={s("agreementRef")} onChange={set("agreementRef")} placeholder="Ej.: contrato firmado 2026-11 (por fuera)" /></label>
      </div>
      <label className="sv-checks"><label><input type="checkbox" checked={!!f.canSellCoaches} onChange={(e) => setF({ ...f, canSellCoaches: e.target.checked })} /> Puede vender a entrenadores independientes (si su acuerdo lo permite)</label></label>
      <p className="sv-note">El plan de comisiones se asigna desde la ficha. REPI no guarda CBU ni alias: los pagos se coordinan por fuera y se registran con su referencia.</p>
      <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(null)}>Cancelar</button>
        {!edit && <button type="button" className="btn" aria-busy={busy || undefined} onClick={() => save(false)}>Crear sin invitar</button>}
        <button type="button" className="btn pri" aria-busy={busy || undefined} onClick={() => save(!edit)}>{edit ? "Guardar" : "Crear e invitar"}</button></div>
    </Modal>
  );
}
type Profile = {
  rep: { id: string; code: string; name: string; email: string; phone: string | null; city: string | null; province: string | null; zone: string | null; status: string; statusLabel: string; engagement: string; canSellCoaches: boolean; payoutFrequency: string; payoutNote: string | null;
    regionId: string | null; managerRepId: string | null; agreementRef: string | null; statusReason: string | null; joinedAt: string | null; createdAt: string; userLinked: boolean };
  region: string | null; manager: string | null; invitations: { id: string; status: string; delivery: string; expiresAt: string; createdAt: string }[];
  plans: { id: string; plan: string; version: number; effectiveFrom: string; reason: string; rules: CommissionRules }[];
  clients: { orgId: string; name: string; contractStatus: string; roles: string[] }[]; deals: { id: string; businessName: string; status: string; members: number; unitPriceMinor: number; currency: string; createdAt: string }[];
  funnel: Record<Stage, number>; commissions: Record<string, Record<string, number>>; batches: { id: string; status: string; currency: string; totalMinor: number; paidMinor: number; cutoffOn: string }[];
  targets: { id: string; label: string; target: number; actual: number; pct: number | null }[]; activity: { id: string; kind: string; summary: string; prospect: string | null; at: string; actorRole: string }[];
  alerts: string[]; history: { action: string; result: string; at: string }[];
};
type Plans = { id: string; name: string; status: string; description: string | null; versions: { id: string; version: number; status: string; effectiveFrom: string; rules: CommissionRules; reps: number; notes: string | null }[] }[];
function RepProfile({ id, flash, opts, onClose }: { id: string; flash: Flash; opts: Opt[]; onClose: () => void }) {
  const d = useLoad<Profile>(`/api/admin/sales/reps/${id}`);
  const plans = useLoad<Plans>("/api/admin/sales/plans");
  const [edit, setEdit] = useState(false);
  const [pa, setPa] = useState({ planVersionId: "", effectiveFrom: today(), reason: "" });
  const [tg, setTg] = useState({ month: today().slice(0, 7), metric: "approved_deals", target: "", currency: "ARS" });
  const [mv, setMv] = useState({ toRepId: "", reason: "", includeClients: true });
  const v = d.data;
  const status = async (to: string, label: string) => { const reason = window.prompt(`Motivo para ${label.toLowerCase()}:`); if (!reason?.trim()) return; await go(() => api(`/api/admin/sales/reps/${id}/status`, { body: { to, reason } }), flash, `Vendedor: ${label}.`, d.reload); };
  const [quick, setQuick] = useState(false);
  const approved = (plans.data ?? []).filter((p) => p.status === "active").flatMap((p) => p.versions.filter((x) => x.status === "approved").map((x) => ({ id: x.id, label: `${p.name} · v${x.version}`, rules: x.rules })));
  const approvedRules = new Map(approved.map((x) => [x.id, x.rules.components.map((c) => describeComponent(c, (m) => money(m, x.rules.currency))).join(" · ")]));
  return (
    <Modal label={v ? `Vendedor ${v.rep.name}` : "Vendedor"} onClose={onClose} wide>
      <div className="mhead"><h2>{v?.rep.name ?? "Cargando…"} {v && <span className={`chip ${REP_CHIP[v.rep.status]}`}>{v.rep.statusLabel}</span>}</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {v && <>
        <p className="sv-note">{v.rep.code} · {v.rep.email} · {v.rep.phone ?? "sin teléfono"} · {[v.rep.city, v.rep.province].filter(Boolean).join(", ") || "sin zona"}{v.region ? ` · región ${v.region}` : ""}{v.manager ? ` · responsable ${v.manager}` : ""} · {ENGAGEMENT[v.rep.engagement as keyof typeof ENGAGEMENT]} · alta {fmt(v.rep.createdAt)}{v.rep.joinedAt ? ` · aceptó ${fmt(v.rep.joinedAt)}` : ""}{v.rep.statusReason ? ` · motivo del estado: ${v.rep.statusReason}` : ""}</p>
        {v.alerts.length > 0 && <p className="gy-warn" style={{ margin: 0 }}>{v.alerts.join(" · ")}</p>}
        <div className="sv-filter">
          <button type="button" className="btn sm" onClick={() => setEdit(true)}>Editar perfil y permisos</button>
          {(v.rep.status === "invited" || v.rep.status === "pending_acceptance") && <button type="button" className="btn sm pri" onClick={() => go(() => api(`/api/admin/sales/reps/${id}/invite`, { body: {} }), flash, "Invitación enviada.", d.reload)}>{v.invitations.length ? "Reenviar invitación" : "Invitar por email"}</button>}
          {v.rep.status === "pending_acceptance" && <button type="button" className="btn sm" onClick={() => go(() => api(`/api/admin/sales/reps/${id}/revoke-invite`, { body: {} }), flash, "Invitación revocada.", d.reload)}>Revocar invitación</button>}
          {v.rep.status === "active" && <button type="button" className="btn sm" onClick={() => status("paused", "Pausado")}>Pausar</button>}
          {["paused", "suspended", "terminated"].includes(v.rep.status) && <button type="button" className="btn sm" onClick={() => status("active", "Reactivado")}>Reactivar</button>}
          {["active", "paused"].includes(v.rep.status) && <button type="button" className="btn sm" onClick={() => status("suspended", "Suspendido")}>Suspender</button>}
          {v.rep.status !== "terminated" && <button type="button" className="btn sm danger" onClick={() => status("terminated", "Desvinculado")}>Desvincular</button>}
        </div>
        {v.invitations.length > 0 && <p className="sv-note">Invitaciones: {v.invitations.slice(0, 3).map((i) => `${{ pending: "pendiente", accepted: "aceptada", revoked: "revocada", expired: "vencida" }[i.status]} (${{ pending: "envío en curso", submitted: "email enviado", local_only: "sólo buzón local", failed: "el email no se pudo enviar" }[i.delivery]}, ${fmt(i.createdAt)})`).join(" · ")}</p>}
        <section className="card"><h2>Plan de comisiones</h2>
          {v.plans.length ? <ul className="sv-timeline">{v.plans.map((p) => <li key={p.id}><b>{p.plan} v{p.version}</b> desde el {dayTxt(p.effectiveFrom)} · {p.reason}<small>{p.rules.components.map((c) => describeComponent(c, (m) => money(m, p.rules.currency))).join(" · ")}</small></li>)}</ul> : <p className="sv-note">Sin plan asignado: sus ventas aprobadas no devengan comisiones hasta asignarlo.</p>}
          {plans.data && (approved.length === 0 || quick) ? (
            <QuickPlan repId={id} flash={flash} canCancel={approved.length > 0} onCancel={() => setQuick(false)} onDone={() => { setQuick(false); plans.reload(); d.reload(); }} />
          ) : plans.data ? <>
            <div className="grid-2">
              <label className="field">Plan<select value={pa.planVersionId} onChange={(e) => setPa({ ...pa, planVersionId: e.target.value })}><option value="">Elegí un plan…</option>{approved.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
              <label className="field">Vigente desde<input type="date" value={pa.effectiveFrom} onChange={(e) => setPa({ ...pa, effectiveFrom: e.target.value })} /></label>
            </div>
            {pa.planVersionId && <p className="sv-note">{approvedRules.get(pa.planVersionId)}</p>}
            <label className="field">Motivo<input value={pa.reason} onChange={(e) => setPa({ ...pa, reason: e.target.value })} placeholder="Acuerdo firmado, renegociación…" /></label>
            <div className="mfoot"><button type="button" className="btn" onClick={() => setQuick(true)}>Crear plan nuevo</button><button type="button" className="btn pri" disabled={!pa.planVersionId || pa.reason.trim().length < 3} onClick={() => go(() => api(`/api/admin/sales/reps/${id}/plan`, { body: pa }), flash, "Plan asignado.", () => { setPa({ ...pa, planVersionId: "", reason: "" }); d.reload(); })}>Asignar plan</button></div>
            <p className="sv-note">Aplica a ventas cerradas desde esa fecha. Las ventas ya aprobadas conservan el plan con el que se aprobaron.</p>
          </> : <p className="muted">Cargando planes…</p>}
        </section>
        <section className="card"><h2>Objetivos</h2>
          {v.targets.length > 0 && <ul className="sv-timeline">{v.targets.map((t) => <li key={t.id}>{t.label}: <b>{t.actual} / {t.target}</b> ({t.pct ?? 0}%) <button type="button" className="btn sm" onClick={() => go(() => api(`/api/admin/sales/targets/${t.id}/delete`, { body: {} }), flash, "Objetivo quitado.", d.reload)}>Quitar</button></li>)}</ul>}
          <div className="grid-2">
            <label className="field">Mes<input type="month" value={tg.month} onChange={(e) => setTg({ ...tg, month: e.target.value })} /></label>
            <label className="field">Métrica<select value={tg.metric} onChange={(e) => setTg({ ...tg, metric: e.target.value })}>{Object.entries(TARGET_METRICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field">Meta{tg.metric === "contract_value" ? ` (${tg.currency})` : ""}<input inputMode="decimal" value={tg.target} onChange={(e) => setTg({ ...tg, target: e.target.value })} /></label>
          </div>
          <div className="mfoot"><button type="button" className="btn" onClick={() => { const t = tg.metric === "contract_value" ? parseMoney(tg.target, tg.currency as Currency) : Number(tg.target); if (!t || t <= 0) { flash("Escribí una meta válida."); return; } void go(() => api(`/api/admin/sales/reps/${id}/targets`, { body: { month: tg.month, metric: tg.metric, target: t, currency: tg.metric === "contract_value" ? tg.currency : null } }), flash, "Objetivo guardado.", d.reload); }}>Guardar objetivo</button></div>
        </section>
        <div className="grid-2">
          <section className="card"><h2>Funnel</h2><Bars label="Funnel del vendedor" rows={(Object.keys(STAGES) as Stage[]).map((s) => [STAGES[s], v.funnel[s] ?? 0])} /></section>
          <section className="card"><h2>Comisiones</h2>{Object.keys(v.commissions).length ? Object.entries(v.commissions).map(([c, t]) => <dl key={c} className="sv-preview"><dt>Devengadas ({c})</dt><dd>{money(t.accrued, c)}</dd><dt>Disponibles</dt><dd>{money(t.available, c)}</dd><dt>En liquidación</dt><dd>{money(t.in_payout, c)}</dd><dt>Pagadas</dt><dd>{money(t.paid, c)}</dd></dl>) : <p className="sv-note">Sin comisiones.</p>}
            {v.batches.length > 0 && <p className="sv-note">Liquidaciones: {v.batches.map((b) => `${dayTxt(b.cutoffOn)} ${BATCH_ST[b.status]?.[0]} ${money(b.totalMinor, b.currency)}`).join(" · ")}</p>}</section>
        </div>
        <section className="card"><h2>Clientes ({v.clients.length})</h2>{v.clients.length ? <ul className="sv-timeline">{v.clients.map((c) => <li key={c.orgId}>{c.name}<small>{c.roles.join(", ")} · contrato {c.contractStatus}</small></li>)}</ul> : <p className="sv-note">Sin clientes atribuidos.</p>}</section>
        <section className="card"><h2>Ventas</h2>{v.deals.length ? <ul className="sv-timeline">{v.deals.map((x) => <li key={x.id}>{x.businessName} · {x.members} × {money(x.unitPriceMinor, x.currency)} <span className={`chip ${DEAL_CHIP[x.status]}`}>{DEAL_STATUS[x.status as keyof typeof DEAL_STATUS]}</span><small>{fmt(x.createdAt)}</small></li>)}</ul> : <p className="sv-note">Sin ventas.</p>}</section>
        <section className="card"><h2>Reasignar cartera</h2>
          <div className="grid-2">
            <label className="field">Hacia<select value={mv.toRepId} onChange={(e) => setMv({ ...mv, toRepId: e.target.value })}><option value="">Elegí un vendedor activo…</option>{opts.filter((o) => o.id !== id && o.status === "active").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <label className="field">Motivo<input value={mv.reason} onChange={(e) => setMv({ ...mv, reason: e.target.value })} /></label>
          </div>
          <label className="sv-checks"><label><input type="checkbox" checked={mv.includeClients} onChange={(e) => setMv({ ...mv, includeClients: e.target.checked })} /> Incluir clientes asignados (el vendedor que cerró y sus comisiones devengadas se conservan)</label></label>
          <div className="mfoot"><button type="button" className="btn" disabled={!mv.toRepId} onClick={() => go(async () => { const r = await api<{ prospects: number; clients: number; skipped: number }>(`/api/admin/sales/reps/${id}/reassign`, { body: mv }); flash(`Reasignados: ${r.prospects} prospectos y ${r.clients} clientes${r.skipped ? ` (${r.skipped} quedan para revisión manual)` : ""}.`); }, flash, "Cartera reasignada.", d.reload)}>Reasignar</button></div>
        </section>
        <section className="card"><h2>Actividad reciente</h2>{v.activity.length ? <ul className="sv-timeline">{v.activity.map((a) => <li key={a.id}>{a.summary}<small>{a.prospect ?? "—"} · {a.actorRole === "rep" ? "vendedor" : a.actorRole === "admin" ? "Admin" : "REPI"} · {when(a.at)}</small></li>)}</ul> : <p className="sv-note">Sin actividad.</p>}</section>
        <details className="card"><summary style={{ cursor: "pointer", fontWeight: 600 }}>Historial de auditoría</summary><ul className="sv-timeline">{v.history.map((h, i) => <li key={i}>{h.action}{h.result !== "ok" ? ` (${h.result})` : ""}<small>{when(h.at)}</small></li>)}</ul></details>
      </>}
      {edit && v && <RepModal flash={flash} opts={opts} edit={{ id, name: v.rep.name, email: v.rep.email, phone: v.rep.phone ?? "", city: v.rep.city ?? "", province: v.rep.province ?? "", zone: v.rep.zone ?? "", regionId: v.rep.regionId ?? "", managerRepId: v.rep.managerRepId ?? "", engagement: v.rep.engagement, canSellCoaches: v.rep.canSellCoaches, payoutFrequency: v.rep.payoutFrequency, payoutNote: v.rep.payoutNote ?? "", agreementRef: v.rep.agreementRef ?? "" }} onClose={() => { setEdit(false); d.reload(); }} />}
    </Modal>
  );
}

// ── Cierres ─────────────────────────────────────────────────────────────────
type AdminDeal = { id: string; businessName: string; status: string; statusLabel: string; kindLabel: string; repName: string; repCode: string; members: number; unitPriceMinor: number; currency: string; createdAt: string; contractStart: string };
function DealsQueue({ flash, opts, focus }: { flash: Flash; opts: Opt[]; focus?: string }) {
  const [status, setStatus] = useState("open");
  const d = useLoad<AdminDeal[]>(`/api/admin/sales/deals?status=${status}`);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (focus) setOpen(focus); }, [focus]); // los modales usan document: se abren tras montar (no en SSR)
  return (
    <>
      <div className="sv-filter"><select aria-label="Estado de las ventas" value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Por revisar</option>{Object.entries(DEAL_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="">Todas</option></select></div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <div className="empty">No hay ventas {status === "open" ? "por revisar" : "con ese estado"}.</div> : d.data.map((x) => (
        <div key={x.id} className="sv-row"><span className="main"><b>{x.businessName} <small className="muted">· {x.kindLabel}</small></b><small>{x.repName} ({x.repCode}) · {x.members} socios × {money(x.unitPriceMinor, x.currency)} · inicio {x.contractStart} · {when(x.createdAt)}</small></span>
          <span className={`chip ${DEAL_CHIP[x.status]}`}>{x.statusLabel}</span><button type="button" className="btn sm" onClick={() => setOpen(x.id)}>Revisar</button></div>
      ))}
      {open && <DealReview id={open} flash={flash} opts={opts} onClose={() => { setOpen(null); d.reload(); }} />}
    </>
  );
}
type Review = {
  deal: AdminDeal & { revision: number; kind: string; clientKind: string; contactName: string; contactEmail: string | null; contactPhone: string | null; city: string | null; province: string | null; legalName: string | null; cuit: string | null; locations: string[] | null;
    periodicity: string; durationMonths: number | null; discountBps: number; setupFeeMinor: number; specialConditions: string | null; evidence: string; closedOn: string; notes: string | null; reviewNote: string | null; renewalNote: string | null;
    preview: { monthlyNet: number; perPeriod: number; totalContract: number | null; effectiveUnitMinor: number } | null };
  rep: { id: string; name: string; code: string };
  duplicates: { type: string; id: string; name: string; signals: string[]; strong: boolean; mine: boolean }[];
  candidateContracts: { id: string; orgId: string; status: string; name: string; strong: boolean }[];
  attribution: { assignedRepId: string | null; closingRepId: string | null } | null;
  plan: { versionId: string; name: string; version: number } | null; plans: { id: string; name: string; version: number }[];
  estimate: { lines: { label: string; amountMinor: number | null; currency: string; note: string }[] } | null;
  history: { summary: string; actor: string; at: string }[];
};
function DealReview({ id, flash, opts, onClose }: { id: string; flash: Flash; opts: Opt[]; onClose: () => void }) {
  const d = useLoad<Review>(`/api/admin/sales/deals/${id}`);
  const [a, setA] = useState<Record<string, string | boolean>>({});
  const [note, setNote] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const v = d.data;
  useEffect(() => {
    if (!v) return;
    // Vincular sólo se preselecciona ante una coincidencia fuerte (CUIT, email, teléfono, nombre y ciudad) o una renovación.
    setA({ mode: v.candidateContracts.some((c) => c.strong) || v.deal.kind !== "new" ? "existing" : "create", contractId: v.candidateContracts[0]?.id ?? "", quantity: String(v.deal.members), price: String(v.deal.unitPriceMinor / 100).replace(".", ","),
      effectiveFrom: v.deal.contractStart, applyTerms: true, planVersionId: v.plan?.versionId ?? "", assignedRepId: v.rep.id, split2: "", share2: "" });
  }, [v]);
  if (!v) return <Modal label="Venta" onClose={onClose} wide><p className="muted">{d.err ?? "Cargando…"}</p></Modal>;
  const x = v.deal;
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  const decide = (kind: "correction" | "reject") => { if (note.trim().length < 5) { flash("Escribí la nota para el vendedor."); return; } void go(() => api(`/api/admin/sales/deals/${id}/${kind}`, { body: { note, revision: x.revision } }), flash, kind === "reject" ? "Venta rechazada." : "Corrección pedida.", onClose); };
  const approve = async (replace = false) => {
    const unit = parseMoney(s("price"), x.currency as Currency);
    if (!unit) { flash("Revisá el precio aprobado."); return; }
    const share2 = s("split2") ? Math.round(Number(s("share2").replace(",", ".")) * 100) : 0;
    const split = s("split2") && share2 > 0 ? [{ repId: v.rep.id, shareBps: 10000 - share2 }, { repId: s("split2"), shareBps: share2 }] : null;
    try {
      await api(`/api/admin/sales/deals/${id}/approve`, { body: {
        revision: x.revision, link: s("mode") === "create" ? { mode: "create" } : { mode: "existing", contractId: s("contractId") }, quantity: Number(s("quantity")), unitPriceMinor: unit, effectiveFrom: s("effectiveFrom"),
        applyTerms: !!a.applyTerms, planVersionId: s("planVersionId") || null, split, attribution: { assignedRepId: s("assignedRepId") || null }, replaceAttribution: replace, note: note || null,
      } });
      flash(s("mode") === "create" ? "Venta aprobada: cliente creado en borrador. Seguí en Clientes con la aceptación y la habilitación." : "Venta aprobada y vinculada al contrato.");
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "attribution_conflict") setConflict(e.message); else flash((e as Error).message);
    }
  };
  const open = x.status === "declared";
  return (
    <Modal label={`Venta ${x.businessName}`} onClose={onClose} wide>
      <div className="mhead"><h2>{x.businessName} <span className={`chip ${DEAL_CHIP[x.status]}`}>{x.statusLabel}</span></h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <p className="sv-note">{v.rep.name} ({v.rep.code}) · {x.kindLabel} · {x.clientKind === "coach" ? "Coach" : "Gimnasio"} · cerrada {x.closedOn}</p>
      <dl className="sv-preview">
        <dt>Responsable</dt><dd>{x.contactName} · {x.contactEmail ?? "sin email"} · {x.contactPhone ?? "—"}</dd><dt>Ubicación</dt><dd>{[x.city, x.province].filter(Boolean).join(", ") || "—"}{x.locations?.length ? ` · sedes: ${x.locations.join(", ")}` : ""}</dd>
        {(x.legalName || x.cuit) && <><dt>Razón social / CUIT</dt><dd>{x.legalName ?? "—"} · {x.cuit ?? "—"}</dd></>}
        <dt>Socios acordados × precio</dt><dd>{x.members} × {money(x.unitPriceMinor, x.currency)}</dd>
        <dt>Facturación · inicio · duración</dt><dd>{BILLING_PERIODICITY[x.periodicity as keyof typeof BILLING_PERIODICITY]?.[0] ?? x.periodicity} · {x.contractStart} · {x.durationMonths ? `${x.durationMonths} meses` : "sin duración"}</dd>
        {x.discountBps > 0 && <><dt>Descuento</dt><dd>{x.discountBps / 100}% (precio efectivo {money(x.preview?.effectiveUnitMinor, x.currency)})</dd></>}
        {x.setupFeeMinor > 0 && <><dt>Cargo inicial</dt><dd>{money(x.setupFeeMinor, x.currency)}</dd></>}
        {x.preview && <><dt>Mensual · total estimado</dt><dd>{money(x.preview.monthlyNet, x.currency)} · {x.preview.totalContract != null ? money(x.preview.totalContract, x.currency) : "—"}</dd></>}
      </dl>
      <p className="sv-note"><b>Evidencia:</b> {x.evidence}</p>
      {x.specialConditions && <p className="sv-note"><b>Condiciones especiales:</b> {x.specialConditions}</p>}
      {x.renewalNote && <p className="sv-note"><b>Renovación:</b> {x.renewalNote}</p>}
      {x.notes && <p className="sv-note"><b>Observaciones:</b> {x.notes}</p>}
      {v.duplicates.length > 0 && <section className="card"><h2>Coincidencias</h2><ul className="sv-timeline">{v.duplicates.map((m) => <li key={`${m.type}${m.id}`}><b>{m.type === "client" ? "Cliente" : m.mine ? "Prospecto del mismo vendedor" : "Prospecto"}: {m.name}</b><small>{m.signals.join(", ")}{m.strong ? " · fuerte" : ""}</small></li>)}</ul></section>}
      {v.estimate && <p className="sv-note"><b>Comisión estimada ({v.plan?.name} v{v.plan?.version}):</b> {v.estimate.lines.map((l) => `${l.label} ${l.amountMinor != null ? money(l.amountMinor, l.currency) : "—"}`).join(" · ")}</p>}
      {!v.plan && <p className="gy-warn" style={{ margin: 0 }}>El vendedor no tiene plan vigente a la fecha de cierre: elegí uno o la venta no devengará comisiones.</p>}
      {open && <section className="card">
        <h2>Aprobar</h2>
        <div className="grid-2">
          <label className="field">Vínculo<select value={s("mode")} onChange={(e) => setA({ ...a, mode: e.target.value })}>{x.kind === "new" && <option value="create">Crear cliente nuevo (borrador)</option>}<option value="existing">Vincular a contrato existente</option></select></label>
          {s("mode") === "existing" && <label className="field">Contrato<select value={s("contractId")} onChange={(e) => setA({ ...a, contractId: e.target.value })}><option value="">Elegí…</option>{v.candidateContracts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status}){c.strong ? " · coincidencia fuerte" : ""}</option>)}</select></label>}
          <label className="field">Cantidad aprobada<input inputMode="numeric" value={s("quantity")} onChange={(e) => setA({ ...a, quantity: e.target.value })} /></label>
          <label className="field">Precio por socio aprobado ({x.currency})<input inputMode="decimal" value={s("price")} onChange={(e) => setA({ ...a, price: e.target.value })} /></label>
          <label className="field">Fecha de efecto<input type="date" value={s("effectiveFrom")} onChange={(e) => setA({ ...a, effectiveFrom: e.target.value })} /></label>
          <label className="field">Plan de comisiones<select value={s("planVersionId")} onChange={(e) => setA({ ...a, planVersionId: e.target.value })}><option value="">{v.plan ? "El vigente del vendedor" : "Sin plan"}</option>{v.plans.map((p) => <option key={p.id} value={p.id}>{p.name} v{p.version}</option>)}</select></label>
          <label className="field">Vendedor asignado al cliente<select value={s("assignedRepId")} onChange={(e) => setA({ ...a, assignedRepId: e.target.value })}>{opts.filter((o) => o.status === "active" || o.id === v.rep.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="field">Reparto con otro vendedor (opcional)<select value={s("split2")} onChange={(e) => setA({ ...a, split2: e.target.value })}><option value="">Sin reparto</option>{opts.filter((o) => o.id !== v.rep.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          {s("split2") && <label className="field">% para el segundo vendedor<input inputMode="decimal" value={s("share2")} onChange={(e) => setA({ ...a, share2: e.target.value })} /></label>}
        </div>
        {s("mode") === "existing" && <label className="sv-checks"><label><input type="checkbox" checked={!!a.applyTerms} onChange={(e) => setA({ ...a, applyTerms: e.target.checked })} /> Registrar cantidad y precio como nuevas versiones con esa fecha (no reescribe períodos cerrados)</label></label>}
        <p className="sv-note">Aprobar no registra la aceptación del contrato, no habilita al cliente ni registra cobros: eso sigue en Clientes. Los descuentos y cargos iniciales no se aplican solos; si corresponden, cargá el precio efectivo acordado.</p>
        {conflict && <p className="gy-warn" style={{ margin: 0 }}>{conflict} <button type="button" className="btn sm" onClick={() => { setConflict(null); void approve(true); }}>Cambiar atribución y aprobar</button></p>}
        <label className="field">Nota (la ve el vendedor si pedís corrección o rechazás)<textarea rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="mfoot"><button type="button" className="btn danger" onClick={() => decide("reject")}>Rechazar</button><button type="button" className="btn" onClick={() => decide("correction")}>Pedir corrección</button><button type="button" className="btn pri" onClick={() => approve(false)}>Aprobar</button></div>
      </section>}
      {x.reviewNote && <p className="sv-note"><b>Última nota:</b> {x.reviewNote}</p>}
      <details className="card"><summary style={{ cursor: "pointer", fontWeight: 600 }}>Historial</summary><ul className="sv-timeline">{v.history.map((h, i) => <li key={i}>{h.summary}<small>{h.actor} · {when(h.at)}</small></li>)}</ul></details>
    </Modal>
  );
}

// ── Pipeline global ─────────────────────────────────────────────────────────
type APRow = { prospectId: string; name: string; city: string | null; province: string | null; stageLabel: string; repName: string | null; estMembers: number | null; potentialMinor: number | null; currency: string; overdue: boolean; duplicateStatus: string };
function AdminPipeline({ flash, opts }: { flash: Flash; opts: Opt[] }) {
  const [f, setF] = useState({ q: "", repId: "", stage: "", unassigned: "" });
  const [q, setQ] = useState("");
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, q })), 300); return () => clearTimeout(t); }, [q]);
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams([...Object.entries(f).filter(([, v]) => v), ["page", String(page)]]).toString();
  const d = useLoad<{ rows: APRow[]; hasMore: boolean }>(`/api/admin/sales/prospects?${qs}`);
  const [assign, setAssign] = useState<APRow | null>(null);
  const [to, setTo] = useState({ repId: "", reason: "" });
  return (
    <>
      <div className="sv-filter">
        <input type="search" aria-label="Buscar prospectos" placeholder="Nombre, ciudad o email" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Vendedor" value={f.repId} onChange={(e) => setF({ ...f, repId: e.target.value, unassigned: "" })}><option value="">Todos</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <select aria-label="Etapa" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">Toda etapa</option>{Object.entries(STAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="sv-checks"><label><input type="checkbox" checked={!!f.unassigned} onChange={(e) => setF({ ...f, unassigned: e.target.checked ? "1" : "", repId: "" })} /> Sin asignar</label></label>
      </div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.rows.length ? <div className="empty">Sin prospectos. Los contactos web se convierten en prospectos desde Contactos.</div> : (
        <section className="card" style={{ padding: 0 }}><div style={{ overflowX: "auto" }} tabIndex={0}>
          <table className="gy-table"><thead><tr><th>Negocio</th><th>Vendedor</th><th>Etapa</th><th>Socios est.</th><th>Potencial/mes</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{d.data.rows.map((r) => <tr key={r.prospectId}><th scope="row">{r.name}<br /><small className="muted">{[r.city, r.province].filter(Boolean).join(", ")}{r.duplicateStatus === "review" ? " · duplicado en revisión" : ""}</small></th><td>{r.repName ?? <span className="chip warn">Sin asignar</span>}</td><td>{r.stageLabel}{r.overdue && <> <span className="chip warn">Vencido</span></>}</td><td>{r.estMembers ?? "—"}</td><td className="sv-money">{money(r.potentialMinor, r.currency)}</td>
              <td><button type="button" className="btn sm" onClick={() => { setAssign(r); setTo({ repId: "", reason: "" }); }}>{r.repName ? "Reasignar" : "Asignar"}</button></td></tr>)}</tbody></table></div></section>
      )}
      <div className="sv-filter"><button type="button" className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span className="muted">Página {page}</span><button type="button" className="btn sm" disabled={!d.data?.hasMore} onClick={() => setPage(page + 1)}>Siguiente</button></div>
      {assign && <Modal label="Asignar prospecto" onClose={() => setAssign(null)}>
        <div className="mhead"><h2>{assign.repName ? "Reasignar" : "Asignar"} · {assign.name}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => setAssign(null)}>×</button></div>
        <label className="field">Vendedor<select value={to.repId} onChange={(e) => setTo({ ...to, repId: e.target.value })}><option value="">Elegí…</option>{opts.filter((o) => o.status === "active").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <label className="field">Motivo<input value={to.reason} onChange={(e) => setTo({ ...to, reason: e.target.value })} /></label>
        <p className="sv-note">El vendedor de origen se conserva. Queda en el historial del prospecto.</p>
        <div className="mfoot"><button type="button" className="btn" onClick={() => setAssign(null)}>Cancelar</button><button type="button" className="btn pri" disabled={!to.repId} onClick={() => go(() => api(`/api/admin/sales/prospects/${assign.prospectId}/assign`, { body: to }), flash, "Prospecto asignado.", () => { setAssign(null); d.reload(); })}>Asignar</button></div>
      </Modal>}
    </>
  );
}

// ── Comisiones: planes, libro, ajustes ──────────────────────────────────────
type Ledger = { entries: { id: string; repName: string; client: string | null; concept: string; amountMinor: number; currency: string; accrualOn: string; availableOn: string; state: string; stateLabel: string; reason: string | null }[]; totals: Record<string, Record<string, number>> };
function CommissionsAdmin({ flash, opts }: { flash: Flash; opts: Opt[] }) {
  const plans = useLoad<Plans>("/api/admin/sales/plans");
  const [repId, setRepId] = useState("");
  const [state, setState] = useState("");
  const led = useLoad<Ledger>(`/api/admin/sales/ledger?${new URLSearchParams([...(repId ? [["repId", repId]] : []), ...(state ? [["state", state]] : [])])}`);
  const [editor, setEditor] = useState<{ planId: string; versionId?: string; rules?: CommissionRules; effectiveFrom?: string } | null>(null);
  const [newPlan, setNewPlan] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [adj, setAdj] = useState({ repId: "", amount: "", sign: "1", currency: "ARS", reason: "" });
  const [month, setMonth] = useState("");
  return (
    <>
      <section className="card"><h2>Planes de comisión</h2>
        <p className="sv-note">Ningún modelo se activa solo: creá el plan, definí sus reglas, aprobá la versión y asignala a cada vendedor. Una versión aprobada no se edita: los cambios son versiones nuevas con vigencia, y lo ya devengado no cambia.</p>
        {!plans.data ? <p className="muted">Cargando…</p> : !plans.data.some((p) => p.status === "active") && <p className="sv-note">Todavía no hay planes activos. Escribí un nombre abajo y tocá «Crear plan».</p>}
        {plans.data && [...plans.data.filter((p) => p.status === "active"), ...(showArchived ? plans.data.filter((p) => p.status !== "active") : [])].map((p) => (
          <div key={p.id} className="card" style={{ background: "var(--ui-surface-2)" }}>
            <div className="mhead"><b>{p.name}{p.status === "archived" && <> <span className="chip mute">Archivado</span></>}</b>{p.status === "active" && <div className="sv-filter"><button type="button" className="btn sm" onClick={() => setEditor({ planId: p.id })}>Nueva versión</button><button type="button" className="btn sm" onClick={() => window.confirm("¿Archivar el plan? Las asignaciones vigentes siguen.") && go(() => api(`/api/admin/sales/plans/${p.id}/archive`, { body: {} }), flash, "Plan archivado.", plans.reload)}>Archivar</button></div>}</div>
            {!p.versions.length ? <p className="sv-note">Sin versiones.</p> : <ul className="sv-timeline">{p.versions.map((v) => <li key={v.id}><b>v{v.version}</b> · desde el {dayTxt(v.effectiveFrom)} · <span className={`chip ${v.status === "approved" ? "ok" : "mute"}`}>{v.status === "approved" ? "Aprobada" : "Borrador"}</span> · {v.reps} vendedor(es)
              <small>{v.rules.components.map((c) => describeComponent(c, (m) => money(m, v.rules.currency))).join(" · ")} · {planTerms(v.rules)} · contrato suspendido: {v.rules.onContractStop === "stop" ? "deja de comisionar" : "sigue"} · tras desvinculación: {v.rules.afterTermination === "stop" ? "deja de comisionar" : "sigue"}</small>
              {v.status === "draft" && <span className="sv-filter"><button type="button" className="btn sm" onClick={() => setEditor({ planId: p.id, versionId: v.id, rules: v.rules, effectiveFrom: v.effectiveFrom })}>Editar</button><button type="button" className="btn sm pri" onClick={() => window.confirm("¿Aprobar esta versión? Después no se puede editar.") && go(() => api(`/api/admin/sales/plan-versions/${v.id}/approve`, { body: {} }), flash, "Versión aprobada.", plans.reload)}>Aprobar</button></span>}</li>)}</ul>}
          </div>
        ))}
        <div className="sv-filter"><input aria-label="Nombre del plan nuevo" placeholder="Nombre del plan nuevo" value={newPlan} onChange={(e) => setNewPlan(e.target.value)} /><button type="button" className="btn" disabled={newPlan.trim().length < 2} onClick={() => go(async () => { const r = await api<{ id: string }>("/api/admin/sales/plans", { body: { name: newPlan.trim() } }); setNewPlan(""); plans.reload(); setEditor({ planId: r.id }); }, flash, "Plan creado: definí sus reglas.")}>Crear plan</button></div>
        {plans.data?.some((p) => p.status !== "active") && <button type="button" className="btn sm" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Ocultar archivados" : `Ver archivados (${plans.data.filter((p) => p.status !== "active").length})`}</button>}
      </section>
      <section className="card"><h2>Libro de comisiones</h2>
        <div className="sv-filter">
          <select aria-label="Vendedor" value={repId} onChange={(e) => setRepId(e.target.value)}><option value="">Todos</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <select aria-label="Estado" value={state} onChange={(e) => setState(e.target.value)}><option value="">Todo estado</option><option value="accrued">Devengadas</option><option value="available">Disponibles</option><option value="in_payout">En liquidación</option><option value="paid">Pagadas</option><option value="reversed">Revertidas</option></select>
          <button type="button" className="btn sm" onClick={() => go(async () => { const r = await api<{ contracts: number; added: number; reversed: number }>("/api/admin/sales/commissions/sync", { body: {} }); flash(`Recalculado: ${r.contracts} contratos, ${r.added} asientos nuevos, ${r.reversed} reversiones.`); }, flash, "Listo.", led.reload)}>Recalcular desde eventos</button>
          <input type="month" aria-label="Mes cerrado para bonos" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button type="button" className="btn sm" disabled={!month} onClick={() => go(async () => { const r = await api<{ created: number }>("/api/admin/sales/commissions/tiers", { body: { month } }); flash(`Bonos escalonados: ${r.created} nuevos.`); }, flash, "Listo.", led.reload)}>Evaluar bonos del mes</button>
          <a className="btn sm" href="/api/admin/sales/export/ledger" style={{ display: "inline-grid", placeItems: "center", textDecoration: "none" }}>CSV</a>
        </div>
        {led.data && Object.entries(led.data.totals).map(([c, t]) => <p key={c} className="sv-note">{c}: devengadas {money(t.accrued, c)} · disponibles {money(t.available, c)} · en liquidación {money(t.in_payout, c)} · pagadas {money(t.paid, c)}</p>)}
        {!led.data ? <p className="muted">Cargando…</p> : !led.data.entries.length ? <div className="empty">Sin asientos.</div> : (
          <div style={{ overflowX: "auto" }} tabIndex={0}><table className="gy-table"><thead><tr><th>Vendedor</th><th>Concepto</th><th>Cliente</th><th>Devengada</th><th>Disponible</th><th>Importe</th><th>Estado</th></tr></thead>
            <tbody>{led.data.entries.map((e) => <tr key={e.id}><td>{e.repName}</td><td>{e.concept}{e.reason ? <><br /><small className="muted">{e.reason}</small></> : null}</td><td>{e.client ?? "—"}</td><td>{e.accrualOn}</td><td>{e.availableOn}</td><td className={`sv-money${e.amountMinor < 0 ? " sv-neg" : ""}`}>{money(e.amountMinor, e.currency)}</td><td>{e.stateLabel}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <section className="card"><h2>Ajuste manual</h2>
        <div className="grid-2">
          <label className="field">Vendedor<select value={adj.repId} onChange={(e) => setAdj({ ...adj, repId: e.target.value })}><option value="">Elegí…</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="field">Tipo<select value={adj.sign} onChange={(e) => setAdj({ ...adj, sign: e.target.value })}><option value="1">A favor del vendedor</option><option value="-1">En contra (descuento)</option></select></label>
          <label className="field">Importe<input inputMode="decimal" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></label>
          <label className="field">Moneda<select value={adj.currency} onChange={(e) => setAdj({ ...adj, currency: e.target.value })}><option>ARS</option><option>USD</option></select></label>
        </div>
        <label className="field">Motivo (queda en el libro y lo ve el vendedor)<input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></label>
        <div className="mfoot"><button type="button" className="btn" onClick={() => { const m = parseMoney(adj.amount, adj.currency as Currency); if (!m || !adj.repId) { flash("Completá vendedor e importe."); return; } void go(() => api("/api/admin/sales/commissions/adjust", { body: { repId: adj.repId, amountMinor: m * Number(adj.sign), currency: adj.currency, reason: adj.reason, idempotencyKey: newKey() } }), flash, "Ajuste registrado.", () => { setAdj({ ...adj, amount: "", reason: "" }); led.reload(); }); }}>Registrar ajuste</button></div>
      </section>
      {editor && <PlanEditor {...editor} flash={flash} onClose={() => { setEditor(null); plans.reload(); }} />}
    </>
  );
}
function PlanEditor({ planId, versionId, rules, effectiveFrom, flash, onClose }: { planId: string; versionId?: string; rules?: CommissionRules; effectiveFrom?: string; flash: Flash; onClose: () => void }) {
  const [r, setR] = useState<CommissionRules>(rules ?? { currency: "ARS", components: [{ type: "first_month_by_members", brackets: DEFAULT_BRACKETS }], holdDays: 0, minPayoutMinor: 0, capPerDealMinor: null, onContractStop: "stop", afterTermination: "stop", notes: "" });
  const [from, setFrom] = useState(effectiveFrom ?? today());
  const [add, setAdd] = useState<CommissionComponent["type"]>("first_month_by_members");
  const cur = r.currency as Currency;
  const mIn = (minor: number | null | undefined) => (minor ? String(minor / 100).replace(".", ",") : "");
  const setC = (i: number, c: Partial<CommissionComponent>) => setR({ ...r, components: r.components.map((x, j) => (j === i ? ({ ...x, ...c } as CommissionComponent) : x)) });
  const blank: Record<CommissionComponent["type"], CommissionComponent> = {
    fixed_per_sale: { type: "fixed_per_sale", amountMinor: 0, trigger: "deal_approved" }, first_payment_pct: { type: "first_payment_pct", bps: 0 }, recurring_pct: { type: "recurring_pct", bps: 0, months: 0 },
    per_member: { type: "per_member", amountMinor: 0, trigger: "deal_approved", maxMembers: null }, tier_bonus: { type: "tier_bonus", metric: "approved_deals", tiers: [{ min: 0, amountMinor: 0 }] },
    first_month_by_members: { type: "first_month_by_members", brackets: DEFAULT_BRACKETS },
  };
  const pct = (bps: number) => (bps ? String(bps / 100).replace(".", ",") : "");
  const toBps = (s: string) => Math.round(Number(s.replace(",", ".")) * 100) || 0;
  const errs = validateRules(r);
  const save = (approve: boolean) => {
    if (errs.length) { flash(errs.join(" ")); return; }
    if (approve && !window.confirm("¿Aprobar esta versión? Después no se puede editar: los cambios se hacen con una versión nueva.")) return;
    void go(async () => {
      const v = await api<{ id: string }>(`/api/admin/sales/plans/${planId}/versions`, { body: { versionId: versionId ?? null, rules: r, effectiveFrom: from } });
      if (approve) await api(`/api/admin/sales/plan-versions/${v.id}/approve`, { body: {} });
    }, flash, approve ? "Versión aprobada: ya la podés asignar desde la ficha de cada vendedor." : "Borrador guardado. Aprobalo para poder asignarlo.", onClose);
  };
  const trig = (v: string, on: (t: "deal_approved" | "contract_enabled" | "first_payment") => void) => <label className="field">Momento<select value={v} onChange={(e) => on(e.target.value as never)}>{Object.entries(TRIGGER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>;
  return (
    <Modal label="Versión del plan" onClose={onClose} wide>
      <div className="mhead"><h2>{versionId ? "Editar borrador" : "Nueva versión"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <div className="grid-2">
        <label className="field">Moneda de los montos fijos<select value={r.currency} onChange={(e) => setR({ ...r, currency: e.target.value as "ARS" })}><option>ARS</option><option>USD</option></select></label>
        <label className="field">Vigente desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      </div>
      {r.components.map((c, i) => (
        <div key={i} className="card" style={{ background: "var(--ui-surface-2)" }}>
          <div className="mhead"><b>{COMPONENT_LABEL[c.type]}</b><button type="button" className="btn sm" onClick={() => setR({ ...r, components: r.components.filter((_, j) => j !== i) })}>Quitar</button></div>
          <div className="grid-2">
            {(c.type === "fixed_per_sale" || c.type === "per_member") && <label className="field">{c.type === "per_member" ? "Monto por socio" : "Monto por venta"} ({cur})<input inputMode="decimal" defaultValue={mIn(c.amountMinor)} onBlur={(e) => setC(i, { amountMinor: parseMoney(e.target.value, cur) ?? 0 })} /></label>}
            {(c.type === "fixed_per_sale" || c.type === "per_member") && trig(c.trigger, (t) => setC(i, { trigger: t }))}
            {c.type === "per_member" && <label className="field">Máximo de socios (opcional)<input inputMode="numeric" defaultValue={c.maxMembers ?? ""} onBlur={(e) => setC(i, { maxMembers: e.target.value ? Number(e.target.value) : null })} /></label>}
            {(c.type === "first_payment_pct" || c.type === "recurring_pct") && <label className="field">Porcentaje<input inputMode="decimal" defaultValue={pct(c.bps)} onBlur={(e) => setC(i, { bps: toBps(e.target.value) })} /></label>}
            {c.type === "recurring_pct" && <label className="field">Meses comisionables desde el inicio<input inputMode="numeric" defaultValue={c.months || ""} onBlur={(e) => setC(i, { months: Number(e.target.value) || 0 })} /></label>}
            {c.type === "tier_bonus" && <label className="field">Métrica del mes<select value={c.metric} onChange={(e) => setC(i, { metric: e.target.value as "approved_deals" })}><option value="approved_deals">Ventas aprobadas</option><option value="agreed_members">Socios contratados</option></select></label>}
          </div>
          {c.type === "first_month_by_members" && <BracketsEditor value={c.brackets} onChange={(b) => setC(i, { brackets: b })} />}
          {c.type === "tier_bonus" && <>
            {c.tiers.map((t, j) => <div key={j} className="grid-2"><label className="field">Desde (cantidad)<input inputMode="numeric" defaultValue={t.min || ""} onBlur={(e) => setC(i, { tiers: c.tiers.map((x, k) => (k === j ? { ...x, min: Number(e.target.value) || 0 } : x)) })} /></label><label className="field">Bono ({cur})<input inputMode="decimal" defaultValue={mIn(t.amountMinor)} onBlur={(e) => setC(i, { tiers: c.tiers.map((x, k) => (k === j ? { ...x, amountMinor: parseMoney(e.target.value, cur) ?? 0 } : x)) })} /></label></div>)}
            <button type="button" className="btn sm" onClick={() => setC(i, { tiers: [...c.tiers, { min: 0, amountMinor: 0 }] })}>Agregar escalón</button>
          </>}
        </div>
      ))}
      <div className="sv-filter"><select aria-label="Tipo de componente" value={add} onChange={(e) => setAdd(e.target.value as never)}>{COMPONENT_ORDER.map((k) => <option key={k} value={k}>{COMPONENT_LABEL[k]}</option>)}</select><button type="button" className="btn sm" onClick={() => setR({ ...r, components: [...r.components, blank[add]] })}>Agregar componente</button></div>
      <p className="sv-note">Híbrido = varios componentes. Los porcentajes se aplican sólo sobre cobros registrados por Admin y no anulados; una anulación revierte su comisión.</p>
      <div className="grid-2">
        <label className="field">Días de retención antes de liberar<input inputMode="numeric" value={String(r.holdDays)} onChange={(e) => setR({ ...r, holdDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
        <label className="field">Mínimo de liquidación ({cur})<input inputMode="decimal" defaultValue={mIn(r.minPayoutMinor)} onBlur={(e) => setR({ ...r, minPayoutMinor: e.target.value.trim() ? parseMoney(e.target.value, cur) ?? 0 : 0 })} /></label>
        <label className="field">Tope por venta ({cur}, opcional)<input inputMode="decimal" defaultValue={mIn(r.capPerDealMinor)} onBlur={(e) => setR({ ...r, capPerDealMinor: e.target.value.trim() ? parseMoney(e.target.value, cur) : null })} /></label>
        <label className="field">Si el contrato se suspende o termina<select value={r.onContractStop} onChange={(e) => setR({ ...r, onContractStop: e.target.value as "stop" })}><option value="stop">Los cobros posteriores no comisionan</option><option value="continue">Siguen comisionando</option></select></label>
        <label className="field">Tras la desvinculación del vendedor<select value={r.afterTermination} onChange={(e) => setR({ ...r, afterTermination: e.target.value as "stop" })}><option value="stop">Los eventos posteriores no comisionan</option><option value="continue">Siguen comisionando (según acuerdo)</option></select></label>
      </div>
      <label className="field">Exclusiones y condiciones del acuerdo real (texto)<textarea rows={2} value={r.notes ?? ""} onChange={(e) => setR({ ...r, notes: e.target.value })} maxLength={1000} /></label>
      <p className="sv-note">REPI no infiere reglas fiscales, laborales ni legales: cargá lo que dice el acuerdo firmado con cada vendedor.</p>
      {errs.length > 0 && r.components.length > 0 && <p className="gy-warn" style={{ margin: 0 }}>{errs.join(" ")}</p>}
      <div className="mfoot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="button" className="btn" onClick={() => save(false)}>Guardar borrador</button><button type="button" className="btn pri" disabled={errs.length > 0} onClick={() => save(true)}>Guardar y aprobar</button></div>
    </Modal>
  );
}

// ── Comisión por tamaño del gimnasio ────────────────────────────────────────
// Valores iniciales que propuso el titular (07/11/2026); se editan antes de guardar y cada plan guarda los suyos.
const DEFAULT_BRACKETS: MemberBracket[] = [{ minMembers: 50, bps: 3500 }, { minMembers: 300, bps: 5000 }, { minMembers: 400, bps: 6500 }];
const COMPONENT_ORDER: CommissionComponent["type"][] = ["first_month_by_members", "first_payment_pct", "recurring_pct", "fixed_per_sale", "per_member", "tier_bonus"];
const pctTxt = (bps: number) => `${(bps / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;

/** Tramos «desde N socios → % del primer mes». Entradas como texto para poder borrar y reescribir sin saltos. */
function BracketsEditor({ value, onChange }: { value: MemberBracket[]; onChange: (b: MemberBracket[]) => void }) {
  const [rows, setRows] = useState(() => value.map((b) => ({ min: String(b.minMembers), pct: String(b.bps / 100).replace(".", ",") })));
  const [ex, setEx] = useState({ members: "350", price: "" });
  const push = (next: { min: string; pct: string }[]) => {
    setRows(next);
    onChange(next.map((r) => ({ minMembers: Number(r.min.replace(/\D/g, "")) || 0, bps: Math.round(Number(r.pct.replace(",", ".")) * 100) || 0 })));
  };
  const set = (i: number, k: "min" | "pct", val: string) => push(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  const parsed = value.filter((b) => b.minMembers > 0 && b.bps > 0);
  const sorted = [...parsed].sort((a, b) => a.minMembers - b.minMembers);
  const unordered = parsed.some((b, i) => i > 0 && b.minMembers <= parsed[i - 1].minMembers);
  const m = Number(ex.members.replace(/\D/g, "")) || 0;
  const price = parseMoney(ex.price, "ARS");
  const hit = m ? bracketFor(sorted, m) : null;
  return (
    <div className="sv-brackets">
      <p className="sv-note">Se lleva un porcentaje <b>sólo del primer mes</b> que pague el gimnasio, según cuántos socios tiene el acuerdo. Cada tramo va desde la cantidad indicada hasta la del tramo siguiente.</p>
      {rows.map((r, i) => {
        const next = rows[i + 1]?.min;
        const to = next && Number(next) > 1 ? `a ${Number(next) - 1}` : "o más";
        return (
          <div key={i} className="sv-bracket">
            <label className="field">Desde (socios)<input inputMode="numeric" value={r.min} onChange={(e) => set(i, "min", e.target.value)} aria-describedby={`br-to-${i}`} /><small id={`br-to-${i}`} className="sv-bracket-to">{r.min ? (to === "o más" ? "en adelante" : `hasta ${to.slice(2)}`) : " "}</small></label>
            <label className="field">% del primer mes<input inputMode="decimal" value={r.pct} onChange={(e) => set(i, "pct", e.target.value)} /><small className="sv-bracket-to">&nbsp;</small></label>
            <button type="button" className="sv-bracket-x" aria-label={`Quitar tramo ${i + 1}`} title="Quitar tramo" disabled={rows.length === 1} onClick={() => push(rows.filter((_, j) => j !== i))}>×</button>
          </div>
        );
      })}
      <button type="button" className="btn sm" disabled={rows.length >= 10} onClick={() => push([...rows, { min: "", pct: "" }])}>Agregar tramo</button>
      {unordered && <p className="gy-warn" role="alert" style={{ margin: 0 }}>Ordená los tramos de menor a mayor cantidad de socios, sin repetir.</p>}
      {sorted.length > 0 && !unordered && <p className="sv-note">Queda así: {sorted.map((b, i) => `${b.minMembers}${sorted[i + 1] ? ` a ${sorted[i + 1].minMembers - 1}` : " o más"} socios → ${pctTxt(b.bps)}`).join(" · ")}. Menos de {sorted[0].minMembers} socios: sin comisión.</p>}
      <div className="sv-bracket-ex">
        <b>Probar con un ejemplo</b>
        <div className="grid-2">
          <label className="field">Socios del gimnasio<input inputMode="numeric" value={ex.members} onChange={(e) => setEx({ ...ex, members: e.target.value })} /></label>
          <label className="field">Precio por socio (ARS, opcional)<input inputMode="decimal" value={ex.price} onChange={(e) => setEx({ ...ex, price: e.target.value })} placeholder="Ej.: 200" /></label>
        </div>
        <p className="sv-note" aria-live="polite">{!m ? "Escribí una cantidad de socios." : !hit ? `${m} socios: sin comisión (por debajo del primer tramo).` : price ? `${m} socios → ${pctTxt(hit.bps)} de un primer mes de ${money(m * price, "ARS")} = ${money(applyBps(m * price, hit.bps), "ARS")}.` : `${m} socios → ${pctTxt(hit.bps)} del primer mes.`}</p>
      </div>
    </div>
  );
}

/** Alta en un paso desde la ficha: crea el plan, aprueba su primera versión y la asigna al vendedor. */
function QuickPlan({ repId, flash, canCancel, onCancel, onDone }: { repId: string; flash: Flash; canCancel: boolean; onCancel: () => void; onDone: () => void }) {
  const [name, setName] = useState("Primer mes según socios");
  const [brackets, setBrackets] = useState<MemberBracket[]>(DEFAULT_BRACKETS);
  const [from, setFrom] = useState(today());
  const [reason, setReason] = useState("Acuerdo comercial");
  const [busy, setBusy] = useState(false);
  const rules: CommissionRules = { currency: "ARS", components: [{ type: "first_month_by_members", brackets: [...brackets].filter((b) => b.minMembers || b.bps) }], holdDays: 0, minPayoutMinor: 0, capPerDealMinor: null, onContractStop: "stop", afterTermination: "continue", notes: null };
  const errs = validateRules(rules);
  const create = async () => {
    if (name.trim().length < 2) { flash("Poné un nombre al plan."); return; }
    if (errs.length) { flash(errs.join(" ")); return; }
    if (reason.trim().length < 3) { flash("Escribí el motivo de la asignación."); return; }
    setBusy(true);
    try {
      const plan = await api<{ id: string }>("/api/admin/sales/plans", { body: { name: name.trim() } });
      const ver = await api<{ id: string }>(`/api/admin/sales/plans/${plan.id}/versions`, { body: { versionId: null, rules, effectiveFrom: from } });
      await api(`/api/admin/sales/plan-versions/${ver.id}/approve`, { body: {} });
      await api(`/api/admin/sales/reps/${repId}/plan`, { body: { planVersionId: ver.id, effectiveFrom: from, reason: reason.trim() } });
      flash("Plan creado y asignado.");
      onDone();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="sv-quick">
      <p className="sv-note">{canCancel ? "Plan nuevo para este vendedor." : "Todavía no hay planes. Armá el primero acá: queda guardado y lo podés asignar a otros vendedores."}</p>
      <label className="field">Nombre del plan<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
      <BracketsEditor value={brackets} onChange={setBrackets} />
      <div className="grid-2">
        <label className="field">Vigente desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field">Motivo<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Acuerdo firmado, renegociación…" /></label>
      </div>
      <p className="sv-note">Se devenga cuando registrás el primer cobro del gimnasio. Si el pago es trimestral o anual, se toma la parte de un mes. Si el vendedor se desvincula antes del cobro, igual le corresponde; si el contrato se suspende antes, no. Para otras reglas, usá Ventas › Comisiones.</p>
      <div className="mfoot">{canCancel && <button type="button" className="btn" onClick={onCancel}>Cancelar</button>}<button type="button" className="btn pri" disabled={busy || errs.length > 0} onClick={create}>{busy ? "Guardando…" : "Crear y asignar"}</button></div>
    </div>
  );
}

// ── Liquidaciones ───────────────────────────────────────────────────────────
type PP = { asOf: string; rows: { repId: string; repName: string; repStatus: string; frequencyLabel: string; cutoff: string; currency: string; totalMinor: number; entries: number; laterMinor: number; minPayoutMinor: number; hasOpen: boolean; due: boolean }[] };
type BRow = { id: string; repName: string; status: string; currency: string; totalMinor: number; paidMinor: number; cutoffOn: string; createdAt: string };
function PayoutsAdmin({ flash }: { flash: Flash }) {
  const pv = useLoad<PP>("/api/admin/sales/payouts/preview");
  const [status, setStatus] = useState("");
  const bs = useLoad<BRow[]>(`/api/admin/sales/payouts${status ? `?status=${status}` : ""}`);
  const [open, setOpen] = useState<string | null>(null);
  const reload = () => { pv.reload(); bs.reload(); };
  const gen = (r: PP["rows"][number], ignoreMinimum = false, untilToday = false) => go(() => api("/api/admin/sales/payouts", { body: { repId: r.repId, currency: r.currency, cutoffOn: untilToday ? today() : r.cutoff, idempotencyKey: newKey(), ignoreMinimum } }), flash, "Borrador de liquidación generado.", reload);
  return (
    <>
      <section className="card"><h2>Para liquidar</h2>
        <p className="sv-note">Agrupado según la frecuencia de cada vendedor. Sólo entran comisiones disponibles hasta el corte; cada una puede estar en una sola liquidación.</p>
        {!pv.data ? <p className="muted">Cargando…</p> : !pv.data.rows.length ? <div className="empty">No hay comisiones disponibles.</div> : pv.data.rows.map((r) => (
          <div key={`${r.repId}${r.currency}`} className="sv-row"><span className="main"><b>{r.repName}{r.repStatus === "terminated" ? " (desvinculado)" : ""}</b><small>{r.frequencyLabel} · corte {r.cutoff} · {r.entries} comisiones{r.laterMinor ? ` · después del corte: ${money(r.laterMinor, r.currency)}` : ""}{r.minPayoutMinor ? ` · mínimo ${money(r.minPayoutMinor, r.currency)}` : ""}</small></span>
            <span className="sv-money">{money(r.totalMinor, r.currency)}</span>
            {r.hasOpen ? <span className="chip info">Liquidación abierta</span> : r.due ? <button type="button" className="btn sm pri" onClick={() => gen(r)}>Generar borrador</button> : r.totalMinor > 0 ? <button type="button" className="btn sm" onClick={() => window.confirm("Está debajo del mínimo del plan. ¿Generar igual?") && gen(r, true)}>Generar (bajo mínimo)</button> : <span className="chip mute">Nada al corte</span>}
            {!r.hasOpen && r.laterMinor > 0 && <button type="button" className="btn sm" onClick={() => window.confirm(`Liquidar también lo disponible después del corte (${money(r.laterMinor, r.currency)}), hasta hoy. Sólo entran comisiones ya disponibles. ¿Seguir?`) && gen(r, true, true)}>Liquidar disponible hasta hoy</button>}</div>
        ))}
      </section>
      <section className="card"><h2>Liquidaciones</h2>
        <div className="sv-filter"><select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todas</option>{Object.entries(BATCH_ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select><a className="btn sm" href="/api/admin/sales/export/payments" style={{ display: "inline-grid", placeItems: "center", textDecoration: "none" }}>Exportar pagos (CSV)</a></div>
        {!bs.data ? <p className="muted">Cargando…</p> : !bs.data.length ? <div className="empty">Sin liquidaciones.</div> : bs.data.map((b) => (
          <div key={b.id} className="sv-row"><span className="main"><b>{b.repName}</b><small>Corte al {dayTxt(b.cutoffOn)} · pagado {money(b.paidMinor, b.currency)} de {money(b.totalMinor, b.currency)}</small></span><span className={`chip ${BATCH_ST[b.status]?.[1]}`}>{BATCH_ST[b.status]?.[0]}</span><button type="button" className="btn sm" onClick={() => setOpen(b.id)}>Abrir</button></div>
        ))}
      </section>
      {open && <BatchModal url={`/api/admin/sales/payouts/${open}`} onClose={() => { setOpen(null); reload(); }} actions={(b, re) => <BatchActions b={b} flash={flash} reload={() => { re(); reload(); }} />} />}
    </>
  );
}
function BatchActions({ b, flash, reload }: { b: Parameters<NonNullable<Parameters<typeof BatchModal>[0]["actions"]>>[0]; flash: Flash; reload: () => void }) {
  const [p, setP] = useState({ amount: "", paidOn: today(), method: "transferencia", reference: "", note: "" });
  const key = useMemo(() => newKey(), [b.batch.paidMinor]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = b.batch.status;
  const cur = b.batch.currency as Currency;
  return (
    <section className="card">
      <div className="sv-filter">
        {st === "draft" && <button type="button" className="btn pri" onClick={() => go(() => api(`/api/admin/sales/payouts/${b.batch.id}/approve`, { body: {} }), flash, "Liquidación aprobada.", reload)}>Aprobar liquidación</button>}
        {(st === "draft" || st === "approved") && <button type="button" className="btn" onClick={() => { const reason = window.prompt("Motivo de la cancelación:"); if (reason?.trim()) void go(() => api(`/api/admin/sales/payouts/${b.batch.id}/cancel`, { body: { reason } }), flash, "Liquidación cancelada: las comisiones vuelven a estar disponibles.", reload); }}>Cancelar</button>}
      </div>
      {(st === "approved" || st === "partially_paid") && <>
        <h2>Registrar pago</h2>
        <div className="grid-2">
          <label className="field">Importe ({cur})<input inputMode="decimal" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} placeholder={money(b.batch.totalMinor - b.batch.paidMinor, cur)} /></label>
          <label className="field">Fecha<input type="date" max={today()} value={p.paidOn} onChange={(e) => setP({ ...p, paidOn: e.target.value })} /></label>
          <label className="field">Medio<select value={p.method} onChange={(e) => setP({ ...p, method: e.target.value })}><option value="transferencia">Transferencia</option><option value="deposito">Depósito</option><option value="efectivo">Efectivo</option><option value="otro">Otro</option></select></label>
          <label className="field">Referencia o comprobante *<input value={p.reference} onChange={(e) => setP({ ...p, reference: e.target.value })} /></label>
        </div>
        <label className="field">Nota<input value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} /></label>
        <div className="mfoot"><button type="button" className="btn pri" onClick={() => { const m = p.amount.trim() ? parseMoney(p.amount, cur) : b.batch.totalMinor - b.batch.paidMinor; if (!m) { flash("Importe inválido."); return; } void go(() => api(`/api/admin/sales/payouts/${b.batch.id}/payments`, { body: { amountMinor: m, paidOn: p.paidOn, method: p.method, reference: p.reference, note: p.note || null, idempotencyKey: key } }), flash, "Pago registrado.", reload); }}>Registrar pago</button></div>
        <p className="sv-note">REPI no transfiere dinero: registrá el pago hecho por fuera con su comprobante.</p>
      </>}
      {b.payments.filter((x) => x.status === "recorded").map((x) => <button key={x.id} type="button" className="btn sm" onClick={() => { const reason = window.prompt("¿Por qué se anula este pago?"); if (reason?.trim()) void go(() => api(`/api/admin/sales/payout-payments/${x.id}/void`, { body: { reason } }), flash, "Pago anulado.", reload); }}>Anular pago de {money(x.amountMinor, cur)}</button>)}
    </section>
  );
}

// ── Solicitudes y material ──────────────────────────────────────────────────
type Req = { id: string; kind: string; repName: string; prospectName: string | null; message: string | null; payload: { to?: string; matches?: { type: string; id: string; signals: string[] }[] } | null; status: string; resolution: string | null; createdAt: string };
function Requests({ flash }: { flash: Flash }) {
  const [all, setAll] = useState(false);
  const d = useLoad<Req[]>(`/api/admin/sales/requests${all ? "?status=all" : ""}`);
  const resolve = async (r: Req, decision: "approve" | "reject", action?: "clear" | "associate" | "archive") => {
    const orgId = action === "associate" ? r.payload?.matches?.find((m) => m.type === "client")?.id ?? window.prompt("ID de la organización a asociar:") : null;
    if (action === "associate" && !orgId) return;
    const resolution = window.prompt("Resolución (la ve el vendedor):");
    if (!resolution?.trim()) return;
    await go(() => api(`/api/admin/sales/requests/${r.id}`, { body: { decision, resolution, action: action ?? null, orgId } }), flash, "Solicitud resuelta.", d.reload);
  };
  const KIND: Record<string, string> = { duplicate_review: "Posible duplicado", attribution_claim: "Reclamo o revisión", payout_frequency: "Cambio de frecuencia" };
  return (
    <>
      <div className="sv-filter"><label className="sv-checks"><label><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Ver también resueltas</label></label></div>
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <div className="empty">Sin solicitudes abiertas.</div> : d.data.map((r) => (
        <div key={r.id} className="sv-row"><span className="main"><b>{KIND[r.kind]} · {r.repName}</b>
          <small>{r.prospectName ? `${r.prospectName} · ` : ""}{r.kind === "payout_frequency" && r.payload?.to ? `Pide: ${PAYOUT_FREQUENCY[r.payload.to as keyof typeof PAYOUT_FREQUENCY]} · ` : ""}{r.message ?? ""} · {when(r.createdAt)}</small>
          {r.payload?.matches && <small>Coincide con: {r.payload.matches.map((m) => `${m.type === "client" ? "cliente" : "prospecto"} (${m.signals.map((x) => DUP_SIGNAL_LABEL[x as keyof typeof DUP_SIGNAL_LABEL] ?? x).join(", ")})`).join(" · ")}</small>}
          {r.resolution && <small>Resolución: {r.resolution}</small>}</span>
          {r.status !== "open" ? <span className={`chip ${r.status === "approved" ? "ok" : "mute"}`}>{r.status === "approved" ? "Aprobada" : "Rechazada"}</span> : <>
            {r.kind === "payout_frequency" && <button type="button" className="btn sm pri" onClick={() => resolve(r, "approve")}>Aprobar</button>}
            {r.kind === "duplicate_review" && <><button type="button" className="btn sm" onClick={() => resolve(r, "approve", "clear")}>No es duplicado</button><button type="button" className="btn sm" onClick={() => resolve(r, "approve", "associate")}>Asociar al cliente</button><button type="button" className="btn sm" onClick={() => resolve(r, "approve", "archive")}>Archivar</button></>}
            {r.kind === "attribution_claim" && <button type="button" className="btn sm" onClick={() => resolve(r, "approve")}>Resolver</button>}
            <button type="button" className="btn sm" onClick={() => resolve(r, "reject")}>Rechazar</button></>}
        </div>
      ))}
    </>
  );
}
type AMat = { id: string; kind: string; title: string; description: string | null; url: string | null; body: string | null; version: number; status: string; validUntil: string | null; updatedAt: string };
function MaterialsAdmin({ flash }: { flash: Flash }) {
  const d = useLoad<AMat[]>("/api/admin/sales/materials");
  const [f, setF] = useState<Record<string, string> | null>(null);
  const save = () => f && go(() => api("/api/admin/sales/materials", { body: { id: f.id || null, kind: f.kind, title: f.title, description: f.description || null, url: f.url || null, body: f.body || null, validUntil: f.validUntil || null } }), flash, "Material guardado.", () => { setF(null); d.reload(); });
  const st = (m: AMat, status: string) => go(() => api(`/api/admin/sales/materials/${m.id}/status`, { body: { status } }), flash, status === "published" ? "Publicado para los vendedores." : "Estado actualizado.", d.reload);
  return (
    <>
      <div className="sv-filter"><button type="button" className="btn pri" onClick={() => setF({ kind: "presentation", title: "" })}>Nuevo material</button></div>
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <div className="empty">Sin material. Subí presentaciones, PDFs, guiones u objeciones para el equipo.</div> : d.data.map((m) => (
        <div key={m.id} className="sv-row"><span className="main"><b>{m.title} <small className="muted">v{m.version} · {MATERIAL_KINDS[m.kind as keyof typeof MATERIAL_KINDS]}</small></b><small>{m.description ?? m.url ?? ""}{m.validUntil ? ` · vigente hasta ${m.validUntil}` : ""}</small></span>
          <span className={`chip ${m.status === "published" ? "ok" : "mute"}`}>{{ draft: "Borrador", published: "Publicado", archived: "Archivado" }[m.status]}</span>
          <button type="button" className="btn sm" onClick={() => setF({ id: m.id, kind: m.kind, title: m.title, description: m.description ?? "", url: m.url ?? "", body: m.body ?? "", validUntil: m.validUntil ?? "" })}>Editar</button>
          {m.status !== "published" && <button type="button" className="btn sm" onClick={() => st(m, "published")}>Publicar</button>}
          {m.status === "published" && <button type="button" className="btn sm" onClick={() => st(m, "archived")}>Archivar</button>}</div>
      ))}
      {f && <Modal label="Material de ventas" onClose={() => setF(null)} wide>
        <div className="mhead"><h2>{f.id ? "Editar material" : "Nuevo material"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => setF(null)}>×</button></div>
        <div className="grid-2">
          <label className="field">Tipo<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(MATERIAL_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field">Título<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="field">Enlace (https:// o ruta de REPI)<input value={f.url ?? ""} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://… o /conoce/gimnasios" /></label>
          <label className="field">Vigente hasta (para precios o condiciones)<input type="date" value={f.validUntil ?? ""} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></label>
        </div>
        <label className="field">Descripción<input value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="field">Texto (guion, respuesta a objeción, preguntas frecuentes…)<textarea rows={5} value={f.body ?? ""} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={8000} /></label>
        <p className="sv-note">Editar el contenido de un material sube su versión. Lo vencido se muestra a los vendedores con advertencia.</p>
        <div className="mfoot"><button type="button" className="btn" onClick={() => setF(null)}>Cancelar</button><button type="button" className="btn pri" onClick={save}>Guardar</button></div>
      </Modal>}
    </>
  );
}
