"use client";
// REPI Admin (anexo 26/10 §3–4, §9): alta comercial, aceptación registrada, habilitación, cantidad y precio por cliente
// con versiones, vista previa del período, cierre simulado e invitación de bienvenida al responsable.
// No hay cobros reales: ciclo, prorrateo, mora y proveedor de pagos siguen pendientes (§12).
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { fmtMoney, parseMoney, type Currency } from "@repi/domain";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { signOutSafely } from "@/lib/session-cleanup";
import { Wordmark } from "@/components/access/Wordmark";
import { Modal } from "@/components/ui/Modal";
import { AdminGuide } from "./AdminGuide";
import { Head, fmt, initials, useLoad } from "@/components/gym/shared";
import { Ic } from "@/components/ui/Ic";
import { List } from "@phosphor-icons/react";

type Client = {
  orgId: string; name: string; kind: "gym" | "coach"; demo: boolean; commercialStatus: string; contractId: string | null; stage: string | null; stageLabel: string;
  agreed: number | null; unitPrice: string | null; enabledAccesses: number; overAgreed: boolean;
};
type Lead = { id: string; kind: "gym" | "coach"; orgName: string; contactName: string; email: string; phone: string | null; message: string | null; status: string; createdAt: string };
type Clients = { clients: Client[]; demo: Client[]; leads: Lead[] };
type Term = { id: string; kind: "quantity" | "unit_price"; version: number; value: number; currency: string | null; effectiveFrom: string; reason: string; evidence: string | null; author: string; display: string; createdAt: string };
type Detail = {
  contract: { id: string; orgId: string; kind: "gym" | "coach"; legalName: string; responsibleName: string; responsibleEmail: string; currency: Currency; scope: string; scopeNote: string | null; quantityDefinition: string | null;
    status: "draft" | "accepted" | "enabled" | "suspended" | "ended"; termsVersion: string | null; acceptedRef: string | null; acceptedAt: string | null; enabledAt: string | null; trialUntil: string | null };
  org: { name: string; commercialStatus: string }; enabledAccesses: number; overAgreed: boolean; quantityAgeDays: number | null; terms: Term[];
  preview: { ok: boolean; reason?: string; subtotalTxt?: string; note?: string | null; period: { start: string; end: string }; changes: { kind: string; version: number; effectiveFrom: string }[];
    lines?: { concept: string; quantity: number; unitMinor: number; totalMinor: number }[]; currency?: Currency };
  invitations: { id: string; email: string | null; status: string; delivery: "pending" | "submitted" | "local_only" | "failed" | null; expiresAt: string; createdAt: string }[];
  snapshots: { id: string; periodStart: string; periodEnd: string; quantity: number; unitPriceMinor: number; currency: string; subtotalTxt: string; createdAt: string }[];
  corrections: { id: string; text: string; status: string; answer: string | null; createdAt: string }[];
  notices: { id: string; kind: string; title: string; body: string; at: string; delivery: "submitted" | "local_only" | "failed" | null; ackAt: string | null; ackBy: string | null }[];
  pending: string[];
};
// Correo de avisos de condiciones (F-BL-05). Igual que la bienvenida: «aceptado por el proveedor» no se destaca.
const NOTICE_MAIL = { local_only: ["Sólo buzón local", "mute"], failed: ["Correo rechazado · el aviso sigue en la app", "bad"] } as const;
const CST: Record<string, [string, string]> = { draft: ["Borrador", "mute"], accepted: ["Aceptado", "info"], enabled: ["Habilitado", "ok"], suspended: ["Suspendido", "warn"], ended: ["Finalizado", "mute"] };
const today = () => new Date().toISOString().slice(0, 10);
const monthOf = (d: string) => { const [y, m] = d.split("-").map(Number); const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); return { start: `${d.slice(0, 7)}-01`, end }; };

// Estado del envío de la bienvenida (D88). "Aceptada por el proveedor" no se muestra: es lo esperado y no prueba entrega.
const DELIVERY = { pending: "Envío en curso", local_only: "Sólo buzón local", failed: "Envío rechazado · reenviar" } as const;

type Screen = "summary" | "clients" | "leads" | "support" | "privacy" | "guide";

export function AdminApp({ me }: { me: { name: string } }) {
  const [screen, setScreen] = useState<Screen>("summary");
  const [drawer, setDrawer] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((t: string) => { clearTimeout(tt.current); setToast(t); tt.current = setTimeout(() => setToast(null), 3500); }, []);
  const list = useLoad<Clients>("/api/admin/clients");
  const [create, setCreate] = useState(false);
  const [regularize, setRegularize] = useState<Client | null>(null);
  const newLeads = list.data?.leads.filter((l) => l.status === "new").length ?? 0;
  const sum = useLoad<Sum>("/api/admin/summary");
  const openSupport = sum.data?.supportOpen ?? 0;

  return (
    <div className="co" data-drawer={drawer ? "1" : "0"}>
      <aside className="co-side" aria-label="Navegación">
        <div className="co-brand"><Wordmark width={58} /><span className="tag">Admin</span></div>
        <nav className="co-nav" aria-label="Principal">
          {([["summary", "Resumen"], ["clients", "Clientes"], ["leads", "Contactos"], ["support", "Soporte"], ["privacy", "Privacidad"], ["guide", "Guía"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-current={screen === k ? "page" : undefined} onClick={() => { setScreen(k); setSel(null); setDrawer(false); if (k === "summary") void sum.reload(); }}>
              <span className="lbl">{l}</span>{k === "leads" && newLeads > 0 && <span className="nbadge" aria-label={`${newLeads} contactos nuevos`}>{newLeads}</span>}
              {k === "support" && openSupport > 0 && <span className="nbadge" aria-label={`${openSupport} consultas abiertas`}>{openSupport}</span>}
            </button>
          ))}
        </nav>
        <div className="co-me">
          <span className="av">{initials(me.name)}</span>
          <span><b>{me.name}</b><small><button type="button" onClick={async () => { if (!await signOutSafely()) return; window.location.href = "/acceso"; }} style={{ border: 0, background: "none", color: "inherit", padding: 0, font: "inherit", cursor: "pointer" }}>Cerrar sesión</button> · <a href="/ayuda?desde=/admin" style={{ color: "inherit" }}>Ayuda</a></small></span>
        </div>
      </aside>
      {drawer && <div className="co-scrim" onClick={() => setDrawer(false)} />}
      <main className="co-main">
        <div className="co-topbar">
          <button type="button" aria-label="Abrir menú" onClick={() => setDrawer(true)}><Ic i={List} size={22} color="#F8FAFC" /></button>
          <Wordmark width={50} /><span style={{ marginLeft: "auto", fontSize: 13, color: "#94A3B8" }}>REPI Admin</span></div>
        <div className="co-content" key={`${screen}-${sel ?? ""}`} data-section={screen}>
          {list.err && <p role="alert" className="err-box">{list.err}</p>}
          {screen === "clients" && !sel && (
            <>
              <Head kicker="Alta comercial, condiciones por cliente y habilitación. Sin cobros reales: el cierre es simulado." title="Clientes">
                <button type="button" className="btn pri" onClick={() => setCreate(true)}>Nuevo cliente</button>
              </Head>
              {!list.data ? <p className="muted">Cargando…</p> : <>
                <ClientTable rows={list.data.clients} onOpen={(c) => c.contractId ? setSel(c.contractId) : setRegularize(c)} empty="Todavía no hay clientes." />
                {list.data.demo.length > 0 && <>
                  <h2 style={{ margin: "8px 0 0", fontSize: 16 }}>Datos de demostración <span className="chip mute">No facturables</span></h2>
                  <ClientTable rows={list.data.demo} onOpen={(c) => c.contractId ? setSel(c.contractId) : setRegularize(c)} empty="" />
                </>}
              </>}
            </>
          )}
          {screen === "clients" && sel && <ContractView id={sel} flash={flash} back={() => { setSel(null); list.reload(); }} />}
          {screen === "summary" && <Summary d={sum} go={(k) => { setScreen(k); setSel(null); }} />}
          {screen === "support" && <SupportDesk flash={flash} onChange={sum.reload} />}
          {screen === "privacy" && <PrivacyRequests flash={flash} />}
          {screen === "guide" && <AdminGuide />}
          {screen === "leads" && <Leads rows={list.data?.leads ?? null} flash={flash} reload={list.reload} onCreate={() => { setScreen("clients"); setCreate(true); }} />}
        </div>
      </main>
      {create && <ClientModal flash={flash} onClose={(id) => { setCreate(false); list.reload(); if (id) { setScreen("clients"); setSel(id); } }} />}
      {regularize && <ClientModal flash={flash} regularize={regularize} onClose={(id) => { setRegularize(null); list.reload(); if (id) setSel(id); }} />}
      <div aria-live="polite" className="sr-only">{toast}</div>
      {toast && <div className="co-toast" aria-hidden="true">{toast}</div>}
    </div>
  );
}

function ClientTable({ rows, onOpen, empty }: { rows: Client[]; onOpen: (c: Client) => void; empty: string }) {
  if (!rows.length) return empty ? <div className="empty">{empty}</div> : null;
  return (
    <section className="card"><div style={{ overflowX: "auto" }}>
      <table className="gy-table">
        <thead><tr><th>Cliente</th><th>Etapa</th><th>Acordado</th><th>Precio por unidad</th><th>Accesos habilitados</th><th><span className="sr-only">Abrir</span></th></tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.orgId}>
            <th scope="row">{c.name}<br /><small className="muted">{c.kind === "gym" ? "Gimnasio" : "Coach"}</small></th>
            <td><span className={`chip ${c.commercialStatus === "enabled" ? "ok" : c.commercialStatus === "legacy" ? "warn" : c.commercialStatus === "suspended" ? "warn" : "mute"}`}>{c.stageLabel}</span></td>
            <td>{c.agreed ?? "—"}</td>
            <td>{c.unitPrice ?? "—"}</td>
            <td>{c.enabledAccesses}{c.overAgreed && <> <span className="chip warn" title="Más accesos que el total acordado: revisar. No genera cobro extra ni bloqueo.">Supera lo acordado</span></>}</td>
            <td><button type="button" className="btn sm" onClick={() => onOpen(c)}>{c.contractId ? "Abrir" : "Regularizar"}</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div></section>
  );
}

function Leads({ rows, flash, reload, onCreate }: { rows: Lead[] | null; flash: (t: string) => void; reload: () => void; onCreate: () => void }) {
  const set = async (id: string, status: string) => { try { await api(`/api/admin/leads/${id}`, { body: { status } }); reload(); } catch (e) { flash((e as Error).message); } };
  return (
    <>
      <Head kicker="Coaches y gimnasios que pidieron que los contacten desde Acceso. No crean espacios ni cuentas operativas." title="Contactos comerciales" />
      {!rows ? <p className="muted">Cargando…</p> : !rows.length ? <div className="empty">No hay contactos.</div> : rows.map((l) => (
        <div key={l.id} className="gy-task">
          <span style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 2 }}>
            <b>{l.orgName} <small className="muted">· {l.kind === "gym" ? "Gimnasio" : "Coach"}</small></b>
            <small className="muted">{l.contactName} · {l.email}{l.phone ? ` · ${l.phone}` : ""} · {fmt(l.createdAt)}</small>
            {l.message && <small>{l.message}</small>}
          </span>
          <span className={`chip ${l.status === "new" ? "warn" : l.status === "converted" ? "ok" : "mute"}`}>{{ new: "Nuevo", contacted: "Contactado", converted: "Convertido", discarded: "Descartado" }[l.status] ?? l.status}</span>
          {l.status === "new" && <button type="button" className="btn sm" onClick={() => set(l.id, "contacted")}>Marcar contactado</button>}
          {l.status !== "converted" && l.status !== "discarded" && <button type="button" className="btn sm" onClick={() => { void set(l.id, "converted"); onCreate(); }}>Dar de alta</button>}
          {l.status !== "discarded" && l.status !== "converted" && <button type="button" className="btn sm" onClick={() => set(l.id, "discarded")}>Descartar</button>}
        </div>
      ))}
    </>
  );
}

// F-AD-01: resumen desde acuerdos y eventos reales, sin DEMO. «Acordado» y «adopción» van separados; no hay «cobrado».
type Sum = { clients: { total: number; enabled: number; draft: number; legacy: number; gyms: number; coaches: number }; agreed: number; adoption: number; overAgreed: number;
  collected: null; externalPaymentsMonth: string[]; leadsNew: number; privacyPending: number; deniedLast7d: number; pushFailedLast24h: number; supportOpen: number; incidentsOpen: number };
function Summary({ d, go }: { d: { data: Sum | null; err: string | null }; go: (k: Exclude<Screen, "summary">) => void }) {
  const k = d.data;
  const tiles: [string, string, string, () => void][] = k ? [
    ["Clientes habilitados", String(k.clients.enabled), `${k.clients.total} en total · ${k.clients.gyms} gyms · ${k.clients.coaches} coaches`, () => go("clients")],
    ["Por habilitar", String(k.clients.draft), k.clients.legacy ? `${k.clients.legacy} a regularizar` : "Borrador o aceptados", () => go("clients")],
    ["Cantidad acordada", String(k.agreed), "Suma de contratos habilitados (base de facturación)", () => go("clients")],
    ["Accesos habilitados", String(k.adoption), k.overAgreed ? `${k.overAgreed} cliente(s) por encima de lo acordado` : "Adopción real; no se factura por esto", () => go("clients")],
    ["Pagos externos (mes)", k.externalPaymentsMonth.length ? k.externalPaymentsMonth.join(" · ") : "—", "Registrados a mano; REPI no cobra ni factura", () => go("clients")],
    ["Contactos nuevos", String(k.leadsNew), "Pidieron que los contacten", () => go("leads")],
    ["Consultas de soporte", String(k.supportOpen), k.incidentsOpen ? `${k.incidentsOpen} incidente(s) abierto(s)` : "Abiertas o en revisión", () => go("support")],
    ["Pedidos de privacidad", String(k.privacyPending), "Eliminaciones pendientes", () => go("privacy")],
    ["Accesos denegados (7 días)", String(k.deniedLast7d), `Avisos push fallidos (24 h): ${k.pushFailedLast24h}`, () => go("clients")],
  ] : [];
  return (
    <>
      <Head kicker="Acuerdos, adopción y operación. Excluye datos DEMO. Sin cobros reales." title="Resumen"><button type="button" className="btn" onClick={() => go("guide")}>Cómo dar de alta un cliente</button></Head>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!k ? <p className="muted">Cargando…</p> : (
        <div className="grid-kpi">
          {tiles.map(([l, v, sub, fn]) => <button type="button" key={l} className="kpi" onClick={fn}><span>{l}</span><strong>{v}</strong><small>{sub}</small></button>)}
        </div>
      )}
    </>
  );
}

// Soporte e incidentes (N-O11, D93). Procedimiento: docs/SOPORTE_OPERACION.md. Identificación mínima: nombre y correo
// de la cuenta si escribió con sesión; sin sesión, el correo no está verificado y no se liga a ninguna cuenta.
// Desde acá no se entra a la cuenta de nadie ni se cambian credenciales.
type Ticket = {
  id: string; code: string; identity: "session" | "unverified"; contactEmail: string; category: string; message: string; status: "open" | "in_progress" | "resolved";
  severity: "normal" | "incident"; internalNote: string | null; resolution: string | null; createdAt: string; resolvedAt: string | null;
  diagnostics: Record<string, string | number | boolean> | null; account: { name: string | null; email: string | null; emailVerified: boolean | null } | null;
};
const TCAT: Record<string, string> = { access: "No puede entrar", training: "Entrenamiento", sync: "Datos sin guardar", billing: "Pagos o contrato", privacy: "Privacidad", other: "Otro" };
const TST: Record<Ticket["status"], [string, string]> = { open: ["Nueva", "warn"], in_progress: ["En revisión", "info"], resolved: ["Respondida", "ok"] };
const DIAG: Record<string, string> = { appVersion: "Versión", platform: "Navegador", standalone: "Instalada", online: "Con conexión", pendingSync: "Sin sincronizar", path: "Pantalla" };
function SupportDesk({ flash, onChange }: { flash: (t: string) => void; onChange: () => void }) {
  const [filter, setFilter] = useState<"active" | "resolved" | "all">("active");
  const list = useLoad<Ticket[]>(`/api/admin/support?filter=${filter}`);
  const [open, setOpen] = useState<Ticket | null>(null);
  return (
    <>
      <Head kicker="Consultas de alumnos, staff y clientes. Respondé por el correo de contacto y registrá acá qué se hizo. Sin sesión, el correo no está verificado: no hagas cambios de cuenta sin verificar identidad." title="Soporte">
        <select aria-label="Filtrar consultas" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="btn">
          <option value="active">Abiertas</option><option value="resolved">Respondidas</option><option value="all">Todas</option>
        </select>
      </Head>
      {list.err && <p role="alert" className="err-box">{list.err}</p>}
      {!list.data ? <p className="muted">Cargando…</p> : !list.data.length ? <div className="empty">{filter === "active" ? "No hay consultas abiertas." : "No hay consultas."}</div> : list.data.map((t) => (
        <div key={t.id} className="gy-task">
          <span style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <b>{t.code} · {TCAT[t.category] ?? t.category}{t.severity === "incident" && <> <span className="chip bad">Incidente</span></>}</b>
            <small className="muted">{t.account ? `${t.account.name ?? "Cuenta"} · ${t.account.email}` : `${t.contactEmail} · sin sesión (no verificado)`} · {fmt(t.createdAt)}</small>
            <small style={{ overflowWrap: "anywhere" }}>{t.message.length > 180 ? `${t.message.slice(0, 180)}…` : t.message}</small>
          </span>
          <span className={`chip ${TST[t.status][1]}`}>{TST[t.status][0]}</span>
          <button type="button" className="btn sm" onClick={() => setOpen(t)}>Abrir</button>
        </div>
      ))}
      {open && <TicketModal t={open} flash={flash} onClose={(changed) => { setOpen(null); if (changed) { list.reload(); onChange(); } }} />}
    </>
  );
}

function TicketModal({ t, flash, onClose }: { t: Ticket; flash: (t: string) => void; onClose: (changed: boolean) => void }) {
  const [note, setNote] = useState(t.internalNote ?? "");
  const [reply, setReply] = useState(t.resolution ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (patch: Partial<Pick<Ticket, "status" | "severity">>, msg: string) => {
    setBusy(true);
    try {
      await api(`/api/admin/support/${t.id}`, { body: { ...patch, internalNote: note, resolution: reply } });
      flash(msg); onClose(true);
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal label={`Consulta ${t.code}`} onClose={() => onClose(false)} wide>
      <div className="mhead"><h2>{t.code} · {TCAT[t.category] ?? t.category}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <p className="muted" style={{ margin: 0 }}>
        {t.account ? <>Con sesión: <b>{t.account.name}</b> · {t.account.email}{t.account.emailVerified ? " (verificado)" : " (sin verificar)"}</>
          : <>Sin sesión · escribió <b>{t.contactEmail}</b>. Identidad no verificada: antes de cualquier cambio de cuenta, verificá con el procedimiento.</>}
        {" "}· {fmt(t.createdAt)}
      </p>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>{t.message}</p>
      {t.diagnostics && (
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", margin: 0, fontSize: 13 }}>
          {Object.entries(t.diagnostics).map(([k, v]) => (
            <Fragment key={k}><dt className="muted">{DIAG[k] ?? k}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{typeof v === "boolean" ? (v ? "Sí" : "No") : String(v)}</dd></Fragment>
          ))}
        </dl>
      )}
      <label className="field">Nota interna (no la ve la persona)<textarea className="note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <label className="field">{t.identity === "session" ? "Respuesta (la ve en Ayuda y soporte)" : "Qué se respondió por correo"}<textarea className="note" rows={3} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} /></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button type="button" className="btn" disabled={busy} onClick={() => save({ severity: t.severity === "incident" ? "normal" : "incident" }, t.severity === "incident" ? "Ya no figura como incidente." : "Marcada como incidente.")}>
          {t.severity === "incident" ? "Quitar incidente" : "Marcar como incidente"}</button>
        {t.status === "open" && <button type="button" className="btn" disabled={busy} onClick={() => save({ status: "in_progress" }, "En revisión.")}>Tomar</button>}
        {t.status === "resolved"
          ? <button type="button" className="btn" disabled={busy} onClick={() => save({ status: "open" }, "Consulta reabierta.")}>Reabrir</button>
          : <button type="button" className="btn pri" disabled={busy} onClick={() => save({ status: "resolved" }, "Consulta respondida.")}>Marcar como respondida</button>}
        {t.status !== "resolved" && <button type="button" className="btn" disabled={busy} onClick={() => save({}, "Guardado.")}>Guardar</button>}
      </div>
    </Modal>
  );
}

// Pedidos de eliminación de cuenta (F-PR-02, D75). Se ejecutan a mano con docs/PRIVACIDAD_OPERACION.md y acá se registra el resultado.
type PReq = { id: string; userId: string | null; emailAtRequest: string; status: string; note: string | null; resolution: string | null; createdAt: string; resolvedAt: string | null };
function PrivacyRequests({ flash }: { flash: (t: string) => void }) {
  const list = useLoad<PReq[]>("/api/admin/privacy");
  const resolve = async (r: PReq, status: "done" | "rejected") => {
    const resolution = window.prompt(status === "done" ? "¿Qué se eliminó y qué se conservó (y por qué)?" : "¿Por qué no se puede eliminar?");
    if (!resolution?.trim()) return;
    try { await api(`/api/admin/privacy/${r.id}/resolve`, { body: { status, resolution } }); flash("Pedido actualizado."); list.reload(); } catch (e) { flash((e as Error).message); }
  };
  const ST: Record<string, [string, string]> = { pending: ["Pendiente", "warn"], done: ["Resuelto", "ok"], rejected: ["Rechazado", "mute"], cancelled: ["Cancelado por la persona", "mute"] };
  return (
    <>
      <Head kicker="Pedidos de eliminación de cuenta. Seguí el procedimiento de docs/PRIVACIDAD_OPERACION.md y registrá el resultado: esta pantalla no borra datos." title="Privacidad" />
      {list.err && <p role="alert" className="err-box">{list.err}</p>}
      {!list.data ? <p className="muted">Cargando…</p> : !list.data.length ? <div className="empty">No hay pedidos.</div> : list.data.map((r) => (
        <div key={r.id} className="gy-task">
          <span style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 2 }}>
            <b>{r.emailAtRequest}</b>
            <small className="muted">Pedido {fmt(r.createdAt)}{r.resolvedAt ? ` · cerrado ${fmt(r.resolvedAt)}` : ""}{r.userId ? "" : " · cuenta ya eliminada"}</small>
            {r.note && <small>{r.note}</small>}
            {r.resolution && <small className="muted">{r.resolution}</small>}
          </span>
          <span className={`chip ${ST[r.status]?.[1] ?? "mute"}`}>{ST[r.status]?.[0] ?? r.status}</span>
          {r.status === "pending" && <button type="button" className="btn sm" onClick={() => resolve(r, "done")}>Registrar como resuelto</button>}
          {r.status === "pending" && <button type="button" className="btn sm" onClick={() => resolve(r, "rejected")}>Rechazar</button>}
        </div>
      ))}
    </>
  );
}

function ClientModal({ flash, onClose, regularize }: { flash: (t: string) => void; onClose: (contractId: string | null) => void; regularize?: Client }) {
  const [f, setF] = useState<Record<string, string>>({ kind: regularize?.kind ?? "gym", currency: "ARS", orgName: regularize?.name ?? "", scope: "organization" });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const r = regularize
        ? await api<{ contractId: string }>(`/api/admin/clients/${regularize.orgId}/regularize`, { body: { legalName: f.legalName ?? "", responsibleName: f.responsibleName ?? "", responsibleEmail: f.responsibleEmail ?? "", currency: f.currency } })
        : await api<{ contractId: string }>("/api/admin/clients", { body: {
          kind: f.kind, orgName: f.orgName ?? "", legalName: f.legalName ?? "", responsibleName: f.responsibleName ?? "", responsibleEmail: f.responsibleEmail ?? "", currency: f.currency,
          scope: f.scope, scopeNote: f.scopeNote || null, quantityDefinition: f.quantityDefinition || null,
          locations: f.kind === "gym" ? (f.locations ?? "").split(",").map((x) => x.trim()).filter(Boolean) : [],
        } });
      flash(regularize ? "Cliente regularizado: contrato en borrador, sigue operando." : "Cliente creado en borrador. Todavía no admite altas ni invitaciones.");
      onClose(r.contractId);
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal label={regularize ? "Regularizar cliente" : "Nuevo cliente"} onClose={() => onClose(null)} wide>
      <div className="mhead"><h2>{regularize ? `Regularizar · ${regularize.name}` : "Nuevo cliente"}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(null)}>×</button></div>
      {regularize && <p className="gy-warn" style={{ margin: 0 }}>Cliente anterior al anexo: se registra la ficha comercial sin suspenderlo ni cambiar sus accesos.</p>}
      <div className="grid-2">
        {!regularize && <label className="field">Tipo<select value={f.kind} onChange={set("kind")}><option value="gym">Gimnasio</option><option value="coach">Coach independiente</option></select></label>}
        {!regularize && <label className="field">Nombre visible<input value={f.orgName} onChange={set("orgName")} /></label>}
        <label className="field">Razón social<input value={f.legalName ?? ""} onChange={set("legalName")} /></label>
        <label className="field">Moneda<select value={f.currency} onChange={set("currency")}><option>ARS</option><option>USD</option></select></label>
        <label className="field">Responsable<input value={f.responsibleName ?? ""} onChange={set("responsibleName")} /></label>
        <label className="field">Email del responsable<input type="email" value={f.responsibleEmail ?? ""} onChange={set("responsibleEmail")} /></label>
        {!regularize && f.kind === "gym" && <label className="field">Sedes (separadas por coma)<input value={f.locations ?? ""} onChange={set("locations")} placeholder="Centro, Palermo" /></label>}
        {!regularize && <label className="field">Alcance<select value={f.scope} onChange={set("scope")}><option value="organization">Toda la organización</option><option value="locations">Sedes del acuerdo</option></select></label>}
      </div>
      {!regularize && <label className="field">Qué cuenta como vigente (si ya está acordado)<input value={f.quantityDefinition ?? ""} onChange={set("quantityDefinition")} placeholder="Pendiente de acuerdo si se deja vacío" /></label>}
      {!regularize && f.scope === "locations" && <label className="field">Cobertura y regla sin duplicados<input value={f.scopeNote ?? ""} onChange={set("scopeNote")} /></label>}
      <span className="muted" style={{ fontSize: 13 }}>Queda en borrador. La cantidad y el precio se cargan después, con versión, fecha de efecto y motivo.</span>
      <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(null)}>Cancelar</button><button type="button" className="btn pri" aria-busy={busy || undefined} onClick={save}>{regularize ? "Registrar ficha" : "Crear borrador"}</button></div>
    </Modal>
  );
}

// Pagos externos registrados (F-AD-04, N-O22, D102): constancia manual con evidencia y conciliación contra cierres.
// No es una pasarela, no es un cobro de REPI ni un comprobante fiscal.
type Pays = {
  currency: Currency; methods: Record<string, string>; unassignedTxt: string;
  payments: { id: string; snapshotId: string | null; amountTxt: string; receivedOn: string; method: string; reference: string; note: string | null; status: "recorded" | "voided"; voidReason: string | null; by: string }[];
  reconciliation: { snapshotId: string; period: string; expectedTxt: string; paidTxt: string; balanceTxt: string; state: "paid" | "partial" | "unpaid" | "over" }[];
};
const REC: Record<Pays["reconciliation"][number]["state"], [string, string]> = { paid: ["Saldado", "ok"], partial: ["Saldo pendiente", "warn"], unpaid: ["Sin pagos registrados", "mute"], over: ["Excedente", "info"] };
function PaymentsCard({ id, flash }: { id: string; flash: (t: string) => void }) {
  const d = useLoad<Pays>(`/api/admin/contracts/${id}/payments`);
  const [f, setF] = useState({ amount: "", receivedOn: today(), method: "transferencia", reference: "", snapshotId: "", note: "" });
  const [busy, setBusy] = useState(false);
  if (!d.data) return <section className="card"><h2 style={{ margin: 0, fontSize: 18 }}>5 · Pagos externos registrados</h2>{d.err ? <p role="alert" className="err-box">{d.err}</p> : <p className="muted">Cargando…</p>}</section>;
  const v = d.data;
  const save = async () => {
    const minor = parseMoney(f.amount, v.currency);
    if (minor == null || minor <= 0) { flash("Escribí un importe válido."); return; }
    setBusy(true);
    try {
      await api(`/api/admin/contracts/${id}/payments`, { body: { amountMinor: minor, receivedOn: f.receivedOn, method: f.method, reference: f.reference, snapshotId: f.snapshotId || null, note: f.note || null } });
      flash("Pago registrado. Es una constancia, no un comprobante fiscal."); setF({ ...f, amount: "", reference: "", note: "" }); d.reload();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  const annul = async (pid: string) => {
    const reason = window.prompt("¿Por qué se anula este pago? Queda en el historial.");
    if (!reason?.trim()) return;
    try { await api(`/api/admin/payments/${pid}/void`, { body: { reason } }); flash("Pago anulado."); d.reload(); } catch (e) { flash((e as Error).message); }
  };
  return (
    <section className="card" aria-label="Pagos externos registrados">
      <h2 style={{ margin: 0, fontSize: 18 }}>5 · Pagos externos registrados</h2>
      <span className="muted" style={{ fontSize: 13 }}>Propuesta de piloto: el cliente paga por fuera y acá queda la constancia con su evidencia. REPI no cobra ni mueve dinero; esto no es un comprobante fiscal.</span>
      {v.reconciliation.length > 0 && (
        <table className="gy-table"><thead><tr><th>Cierre</th><th>Esperado</th><th>Registrado</th><th>Estado</th></tr></thead>
          <tbody>{v.reconciliation.map((r) => <tr key={r.snapshotId}><td>{r.period}</td><td>{r.expectedTxt}</td><td>{r.paidTxt}</td>
            <td><span className={`chip ${REC[r.state][1]}`}>{REC[r.state][0]}{r.state === "partial" || r.state === "over" ? ` · ${r.balanceTxt}` : ""}</span></td></tr>)}</tbody></table>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "1 1 140px" }}>Importe ({v.currency})<input required inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="120.000" /></label>
          <label className="field" style={{ flex: "1 1 140px" }}>Fecha de pago<input type="date" required max={today()} value={f.receivedOn} onChange={(e) => setF({ ...f, receivedOn: e.target.value })} /></label>
          <label className="field" style={{ flex: "1 1 140px" }}>Medio<select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(v.methods).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "2 1 220px" }}>Evidencia<input required maxLength={200} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="N.º de operación, comprobante enviado por el cliente…" /></label>
          <label className="field" style={{ flex: "1 1 180px" }}>Cierre<select value={f.snapshotId} onChange={(e) => setF({ ...f, snapshotId: e.target.value })}><option value="">Sin asignar</option>{v.reconciliation.map((r) => <option key={r.snapshotId} value={r.snapshotId}>{r.period}</option>)}</select></label>
        </div>
        <label className="field">Nota (opcional)<input maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <button type="submit" className="btn" style={{ alignSelf: "flex-start" }} aria-busy={busy || undefined}>Registrar pago</button>
      </form>
      {!v.payments.length ? <span className="muted" style={{ fontSize: 14 }}>Sin pagos registrados.</span> : (
        <table className="gy-table"><thead><tr><th>Fecha</th><th>Importe</th><th>Medio y evidencia</th><th>Cierre</th><th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>{v.payments.map((p) => (
            <tr key={p.id} style={{ opacity: p.status === "voided" ? 0.55 : 1 }}>
              <td>{p.receivedOn}</td><td><b>{p.amountTxt}</b></td>
              <td>{v.methods[p.method] ?? p.method} · {p.reference}{p.note ? <><br /><small className="muted">{p.note}</small></> : null}<br /><small className="muted">Registró {p.by}{p.status === "voided" ? ` · Anulado: ${p.voidReason}` : ""}</small></td>
              <td>{v.reconciliation.find((r) => r.snapshotId === p.snapshotId)?.period ?? "Sin asignar"}</td>
              <td>{p.status === "recorded" && <button type="button" className="btn sm" onClick={() => annul(p.id)}>Anular</button>}</td>
            </tr>
          ))}</tbody></table>
      )}
      {v.unassignedTxt && v.payments.some((p) => !p.snapshotId && p.status === "recorded") && <span className="muted" style={{ fontSize: 13 }}>Sin asignar a un cierre: {v.unassignedTxt}</span>}
    </section>
  );
}

function ContractView({ id, flash, back }: { id: string; flash: (t: string) => void; back: () => void }) {
  const [period, setPeriod] = useState(monthOf(today()));
  const d = useLoad<Detail>(`/api/admin/contracts/${id}?start=${period.start}&end=${period.end}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [term, setTerm] = useState<"quantity" | "unit_price" | null>(null);
  const [acc, setAcc] = useState({ ref: "", date: today(), version: "" });
  const [trial, setTrial] = useState("");
  const [answer, setAnswer] = useState<Record<string, string>>({});
  const act = async (key: string, url: string, body: unknown, ok: string | ((r: unknown) => string)) => {
    setBusy(key);
    // Recargar también ante error: un envío rechazado queda registrado y debe verse (D88).
    try { const r = await api(url, { body }); flash(typeof ok === "string" ? ok : ok(r)); d.reload(); } catch (e) { flash((e as Error).message); d.reload(); } finally { setBusy(null); }
  };
  const v = d.data;
  if (d.err) return <p role="alert" className="err-box">{d.err}</p>;
  if (!v) return <p className="muted">Cargando…</p>;
  const c = v.contract;
  const base = `/api/admin/contracts/${c.id}`;
  const unit = c.kind === "gym" ? "socios" : "alumnos";
  const pendingInv = v.invitations.find((i) => i.status === "pending" && new Date(i.expiresAt) > new Date());
  return (
    <>
      <button type="button" className="gy-link" onClick={back}>← Clientes</button>
      <Head kicker={`${c.kind === "gym" ? "Gimnasio" : "Coach"} · ${c.legalName} · responsable ${c.responsibleName} (${c.responsibleEmail})`} title={v.org.name}>
        <span className={`chip ${CST[c.status][1]}`}>{CST[c.status][0]}</span>
      </Head>
      {v.overAgreed && <p className="gy-warn" role="note" style={{ margin: 0 }}>Hay {v.enabledAccesses} accesos habilitados y el total acordado es menor. Revisá con el cliente: no se cobra extra ni se bloquea automáticamente.</p>}
      {v.quantityAgeDays != null && v.quantityAgeDays > 31 && <p className="gy-warn" role="note" style={{ margin: 0 }}>La cantidad acordada no se revisa hace {v.quantityAgeDays} días (revisión mensual propuesta).</p>}

      <div className="grid-2">
        <section className="card" aria-label="Acuerdo">
          <h2 style={{ margin: 0, fontSize: 18 }}>1 · Acuerdo y habilitación</h2>
          {c.status === "draft" && <>
            <span className="muted" style={{ fontSize: 13 }}>Registrá la aceptación hecha por fuera de la app (firma, email o PDF).</span>
            <label className="field">Referencia<input value={acc.ref} onChange={(e) => setAcc({ ...acc, ref: e.target.value })} placeholder="Ej.: PDF firmado 26/10, email de aceptación" /></label>
            <div className="grid-2">
              <label className="field">Fecha<input type="date" value={acc.date} onChange={(e) => setAcc({ ...acc, date: e.target.value })} /></label>
              <label className="field">Versión del acuerdo<input value={acc.version} onChange={(e) => setAcc({ ...acc, version: e.target.value })} placeholder="v1" /></label>
            </div>
            <button type="button" className="btn pri" aria-busy={busy === "acc" || undefined} onClick={() => act("acc", `${base}/accept`, { method: "external", ref: acc.ref, acceptedAt: acc.date, termsVersion: acc.version }, "Aceptación registrada.")}>Registrar aceptación</button>
          </>}
          {c.acceptedAt && <span style={{ fontSize: 14 }}>Aceptado {fmt(c.acceptedAt, { day: "numeric", month: "short", year: "numeric" })} · {c.acceptedRef} · versión {c.termsVersion}</span>}
          {(c.status === "accepted" || c.status === "suspended") && <>
            <label className="field">Prueba sin cargo hasta (sólo si se acordó)<input type="date" value={trial} onChange={(e) => setTrial(e.target.value)} /></label>
            <button type="button" className="btn pri" aria-busy={busy === "en" || undefined} onClick={() => act("en", `${base}/enable`, { trialUntil: trial || null }, "Cliente habilitado comercialmente.")}>{c.status === "suspended" ? "Rehabilitar" : "Habilitar cliente"}</button>
          </>}
          {c.status === "enabled" && <>
            <span style={{ fontSize: 14 }}>Habilitado {c.enabledAt ? fmt(c.enabledAt) : ""}{c.trialUntil ? ` · prueba hasta ${c.trialUntil}` : ""}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label className="field" style={{ flex: 1, minWidth: 160 }}>{c.trialUntil ? "Mover fin de prueba a" : "Conceder prueba hasta"}<input type="date" min={today()} value={trial} onChange={(e) => setTrial(e.target.value)} /></label>
              <button type="button" className="btn" aria-busy={busy === "tr" || undefined} onClick={() => { if (!trial) return flash("Elegí la fecha."); const r = window.prompt("Motivo del cambio (lo ve el cliente)"); if (r) void act("tr", `${base}/trial`, { trialUntil: trial, reason: r }, "Prueba actualizada. Se avisó al cliente."); }}>Guardar prueba</button>
              {c.trialUntil && <button type="button" className="btn" aria-busy={busy === "trx" || undefined} onClick={() => { const r = window.prompt("Motivo para quitar la prueba (lo ve el cliente)"); if (r) void act("trx", `${base}/trial`, { trialUntil: null, reason: r }, "Prueba quitada. Se avisó al cliente."); }}>Quitar prueba</button>}
            </div>
            <button type="button" className="btn danger" style={{ alignSelf: "flex-start" }} aria-busy={busy === "sus" || undefined} onClick={() => { const r = window.prompt("Motivo de la suspensión"); if (r) void act("sus", `${base}/suspend`, { reason: r }, "Cliente suspendido: no admite nuevas altas."); }}>Suspender</button>
          </>}
        </section>

        <section className="card" aria-label="Invitación al responsable">
          <h2 style={{ margin: 0, fontSize: 18 }}>2 · Invitación de bienvenida</h2>
          <span className="muted" style={{ fontSize: 13 }}>Ligada a {c.responsibleEmail}. Vence a los 7 días, es de un solo uso y reenviarla invalida la anterior. No se crean contraseñas desde Admin.</span>
          {v.invitations.slice(0, 4).map((i) => (
            <div key={i.id} className="trow"><span style={{ flex: 1 }}>{i.email}</span><span className={`chip ${i.status === "accepted" ? "ok" : i.status === "pending" && new Date(i.expiresAt) > new Date() ? "warn" : "mute"}`}>
              {i.status === "accepted" ? "Aceptada" : i.status === "revoked" ? "Revocada" : new Date(i.expiresAt) > new Date() ? `Pendiente · vence ${fmt(i.expiresAt)}` : "Vencida"}</span>
              {i.status === "pending" && i.delivery && i.delivery !== "submitted" && <span className={`chip ${i.delivery === "failed" ? "bad" : "mute"}`}>{DELIVERY[i.delivery]}</span>}</div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn pri" aria-disabled={c.status !== "enabled"} aria-busy={busy === "inv" || undefined}
              onClick={() => c.status === "enabled" ? act("inv", `${base}/invite`, {}, (r) => (r as { delivery?: string }).delivery === "local_only" ? "Invitación creada. Quedó en el buzón local: este entorno no envía correos reales." : pendingInv ? "El proveedor aceptó el reenvío. La anterior quedó revocada." : "El proveedor de correo aceptó la invitación.") : flash("Habilitá al cliente antes de invitar al responsable.")}>{pendingInv ? "Reenviar" : "Enviar invitación"}</button>
            {pendingInv && <button type="button" className="btn" aria-busy={busy === "rev" || undefined} onClick={() => act("rev", `${base}/revoke-invite`, {}, "Invitación revocada.")}>Revocar</button>}
            <button type="button" className="btn" onClick={() => { const name = window.prompt("Nombre del nuevo responsable", c.responsibleName); const email = name ? window.prompt("Email del nuevo responsable", c.responsibleEmail) : null; if (name && email) void act("resp", `${base}/responsible`, { name, email }, "Responsable actualizado. Las invitaciones vigentes se revocaron."); }}>Cambiar responsable</button>
          </div>
        </section>
      </div>

      <section className="card" aria-label="Condiciones">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>3 · Cantidad y precio por {unit === "socios" ? "socio" : "alumno"}</h2>
          <button type="button" className="btn sm" onClick={() => setTerm("quantity")}>Nueva cantidad</button>
          <button type="button" className="btn sm" onClick={() => setTerm("unit_price")}>Nuevo precio</button>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{c.kind === "gym" ? "Se factura por todos los socios del acuerdo, usen o no REPI." : "Se factura por todos los alumnos vigentes, tengan o no la app activada."} Accesos habilitados hoy: {v.enabledAccesses} (dato de adopción, no factura).</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 14 }}>
          <span style={{ flex: 1 }}><b>Qué cuenta como vigente:</b> {c.quantityDefinition ?? <span className="muted">sin definir</span>}</span>
          <button type="button" className="btn sm" aria-busy={busy === "def" || undefined} onClick={() => { const def = window.prompt("Qué cuenta como vigente", c.quantityDefinition ?? ""); const r = def ? window.prompt("Motivo del cambio (lo ve el cliente)") : null; if (def && r) void act("def", `${base}/definition`, { definition: def, reason: r }, "Criterio actualizado. Se avisó al cliente."); }}>Cambiar criterio</button>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>Cada cambio de cantidad, precio, prueba, suspensión o criterio le llega al cliente como aviso en «Condiciones REPI» y por correo al responsable.</span>
        {!v.terms.length ? <div className="empty">Sin condiciones cargadas.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="gy-table">
              <thead><tr><th>Concepto</th><th>Valor</th><th>Desde</th><th>Versión</th><th>Motivo</th><th>Autor</th></tr></thead>
              <tbody>{v.terms.map((t) => (
                <tr key={t.id}><td>{t.kind === "quantity" ? "Cantidad acordada" : "Precio por unidad"}</td><td>{t.display}</td><td>{t.effectiveFrom}</td><td>v{t.version}</td>
                  <td style={{ whiteSpace: "normal", maxWidth: 260 }}>{t.reason}{t.evidence ? <><br /><small className="muted">{t.evidence}</small></> : null}</td><td>{t.author}<br /><small className="muted">{fmt(t.createdAt)}</small></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-label="Vista previa del período">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>4 · Vista previa del período</h2>
          <label className="field">Mes<input type="month" value={period.start.slice(0, 7)} onChange={(e) => e.target.value && setPeriod(monthOf(`${e.target.value}-01`))} /></label>
        </div>
        {v.preview.ok && v.preview.lines ? <>
          <table className="gy-table"><thead><tr><th>Concepto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead>
            <tbody>{v.preview.lines.map((l) => <tr key={l.concept}><td>{l.concept}</td><td>{l.quantity}</td><td>{fmtMoney(l.unitMinor, v.preview.currency)}</td><td><b>{fmtMoney(l.totalMinor, v.preview.currency)}</b></td></tr>)}</tbody></table>
          {v.preview.note && <p className="gy-warn" style={{ margin: 0 }}>{v.preview.note}</p>}
          <span className="muted" style={{ fontSize: 13 }}>Sin mínimos, descuentos, tramos ni extras (no pactados). Impuestos y facturación fiscal: fuera de esta versión.</span>
          <button type="button" className="btn" style={{ alignSelf: "flex-start" }} aria-busy={busy === "close" || undefined} onClick={() => act("close", `${base}/close`, period, `Cierre simulado de ${period.start.slice(0, 7)} guardado. No es un cobro.`)}>Cierre simulado del período</button>
        </> : <div className="empty">No se puede calcular: {v.preview.reason}</div>}
        {v.snapshots.length > 0 && <>
          <h3 style={{ margin: "8px 0 0", fontSize: 15 }}>Cierres simulados</h3>
          <table className="gy-table"><thead><tr><th>Período</th><th>Cantidad</th><th>Unitario</th><th>Subtotal</th><th>Guardado</th></tr></thead>
            <tbody>{v.snapshots.map((s) => <tr key={s.id}><td>{s.periodStart} → {s.periodEnd}</td><td>{s.quantity}</td><td>{fmtMoney(s.unitPriceMinor, s.currency as Currency)}</td><td>{s.subtotalTxt}</td><td>{fmt(s.createdAt)}</td></tr>)}</tbody></table>
        </>}
      </section>

      <section className="card" aria-label="Avisos al cliente">
        <h2 style={{ margin: 0, fontSize: 18 }}>Avisos al cliente</h2>
        {!v.notices.length ? <span className="muted" style={{ fontSize: 14 }}>Sin avisos todavía.</span> : v.notices.slice(0, 12).map((n) => (
          <div key={n.id} className="trow" style={{ flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 220 }}>{n.title}<br /><small className="muted">{fmt(n.at)} · {n.body}</small></span>
            {n.delivery === null ? <span className="chip mute">Sin correo (demo)</span> : n.delivery !== "submitted" && <span className={`chip ${NOTICE_MAIL[n.delivery][1]}`}>{NOTICE_MAIL[n.delivery][0]}</span>}
            <span className={`chip ${n.ackAt ? "ok" : "warn"}`}>{n.ackAt ? `Entendido${n.ackBy ? ` · ${n.ackBy}` : ""} · ${fmt(n.ackAt)}` : "Sin confirmar"}</span>
          </div>
        ))}
      </section>

      <PaymentsCard id={id} flash={flash} />

      <div className="grid-2">
        <section className="card" aria-label="Pedidos de corrección">
          <h2 style={{ margin: 0, fontSize: 18 }}>Pedidos de corrección del cliente</h2>
          {!v.corrections.length && <span className="muted" style={{ fontSize: 14 }}>Sin pedidos.</span>}
          {v.corrections.map((x) => (
            <div key={x.id} className="gy-task" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <span>{x.text} <small className="muted">· {fmt(x.createdAt)}</small></span>
              {x.answer ? <small className="muted">Respuesta: {x.answer}</small> : <div style={{ display: "flex", gap: 6 }}>
                <input className="note" style={{ flex: 1, height: 36 }} value={answer[x.id] ?? ""} onChange={(e) => setAnswer({ ...answer, [x.id]: e.target.value })} placeholder="Respuesta al cliente" aria-label="Respuesta" />
                <button type="button" className="btn sm" onClick={() => act(`a${x.id}`, `/api/admin/corrections/${x.id}`, { answer: answer[x.id] ?? "" }, "Respuesta guardada.")}>Responder</button>
              </div>}
            </div>
          ))}
        </section>
        <section className="card" aria-label="Pendiente de acuerdo comercial">
          <h2 style={{ margin: 0, fontSize: 18 }}>Pendiente de acuerdo (§12)</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>{v.pending.map((p) => <li key={p}>{p}</li>)}</ul>
          <span className="muted" style={{ fontSize: 13 }}>No se infieren. Hasta acordarlos, no hay cobros reales.</span>
        </section>
      </div>
      {term && <TermModal kind={term} currency={c.currency} unit={unit} flash={flash} url={`${base}/terms`} onClose={(ok) => { setTerm(null); if (ok) d.reload(); }} />}
    </>
  );
}

function TermModal({ kind, currency, unit, url, flash, onClose }: { kind: "quantity" | "unit_price"; currency: Currency; unit: string; url: string; flash: (t: string) => void; onClose: (ok: boolean) => void }) {
  const [val, setVal] = useState("");
  const [from, setFrom] = useState(today());
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = kind === "quantity" ? (/^\d{1,8}$/.test(val.trim()) ? Number(val.trim()) : null) : parseMoney(val, currency);
  useEffect(() => { setVal(""); }, [kind]);
  const save = async () => {
    if (parsed == null) return flash(kind === "quantity" ? "Escribí una cantidad entera." : "Escribí un importe válido (hasta 2 decimales).");
    setBusy(true);
    try { await api(url, { body: { kind, value: parsed, effectiveFrom: from, reason, evidence: evidence || null } }); flash("Nueva versión guardada."); onClose(true); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal label={kind === "quantity" ? "Nueva cantidad acordada" : "Nuevo precio por unidad"} onClose={() => onClose(false)}>
      <div className="mhead"><h2>{kind === "quantity" ? `Nueva cantidad de ${unit}` : `Nuevo precio por ${unit === "socios" ? "socio" : "alumno"}`}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <div className="grid-2">
        <label className="field">{kind === "quantity" ? "Cantidad" : `Importe (${currency})`}<input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={kind === "quantity" ? "450" : "1.250,00"} /></label>
        <label className="field">Vigente desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      </div>
      {kind === "unit_price" && parsed != null && <span className="muted">Se guarda como {fmtMoney(parsed, currency)}.</span>}
      <label className="field">Motivo<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: acuerdo inicial, renegociación de noviembre" /></label>
      <label className="field">Evidencia (opcional)<input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Ej.: email del 26/10, anexo firmado" /></label>
      <span className="muted" style={{ fontSize: 13 }}>No reemplaza versiones anteriores ni modifica períodos cerrados.</span>
      <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button><button type="button" className="btn pri" aria-busy={busy || undefined} onClick={save}>Guardar versión</button></div>
    </Modal>
  );
}
