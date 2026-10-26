"use client";
// Anexo 26/10/2026: bandeja compartida de solicitudes por QR (piso en turno + recepción + gerencia), accesos habilitados,
// QR fijo por sede, condiciones comerciales del cliente, avisos push del dispositivo y alertas de sala en vivo.
// La autorización real (turno efectivo, sede, rol) la resuelve el servidor en cada acción.
import { useEffect, useState } from "react";
import { renderSVG } from "uqr";
import { api } from "@/lib/api";
import { disablePush, enablePush, pushState, setPushPaused, type PushState } from "@/lib/push";
import { Modal } from "@/components/ui/Modal";
import { Head, can, fmt, when, useAct, useLoad, type Shell } from "./shared";

const KIND: Record<string, string> = { initial: "Alta", expansion: "Ampliación de sede", reactivation: "Reactivación" };
const AS: Record<string, string> = { floor: "piso en turno", reception: "recepción", manager: "gerencia", owner: "dueño" };
const ST: Record<string, [string, string]> = { pending: ["Pendiente", "warn"], approved: ["Aprobada", "ok"], rejected: ["Rechazada", "mute"], cancelled: ["Cancelada", "mute"], expired: ["Vencida", "mute"] };

// ── Avisos push de este dispositivo ─────────────────────────────────────────
export function PushCard({ flash, who }: { flash: (t: string) => void; who: "floor" | "member" }) {
  const [st, setSt] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => pushState().then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); flash(ok); } catch (e) { flash((e as Error).message); } finally { setBusy(false); load(); }
  };
  if (!st) return null;
  const on = st.subscribed && st.permission === "granted";
  const txt = !st.supported ? "Este navegador no admite avisos push."
    : !st.configured ? "Los avisos push no están configurados en este entorno: la bandeja se actualiza sola cada 10 segundos."
    : on ? (st.paused ? "Avisos pausados: no se envían a tus dispositivos." : "Avisos activos en este dispositivo.")
    : who === "floor" ? "Activá los avisos para enterarte al instante de nuevas solicitudes y de socios que piden atención en sala." : "Activá los avisos para saber cuándo resuelven tu solicitud.";
  return (
    <div className="gy-incoming" role="region" aria-label="Avisos en este dispositivo">
      <span style={{ flex: "1 1 260px", fontSize: 14 }}><b>Avisos push</b><br /><small className="muted">{txt} Un aviso enviado no garantiza que llegue: lo pendiente siempre queda en la bandeja.</small></span>
      {st.supported && st.configured && !on && <button type="button" className="btn pri" aria-busy={busy || undefined} onClick={() => act(enablePush, "Avisos activados en este dispositivo.")}>Activar avisos</button>}
      {on && <button type="button" className="btn" aria-busy={busy || undefined} onClick={() => act(() => setPushPaused(!st.paused), st.paused ? "Avisos reanudados." : "Avisos pausados.")}>{st.paused ? "Reanudar" : "Pausar"}</button>}
      {on && <button type="button" className="btn" aria-busy={busy || undefined} onClick={() => act(disablePush, "Este dispositivo ya no recibe avisos.")}>Desactivar aquí</button>}
    </div>
  );
}

// ── Bandeja de solicitudes ──────────────────────────────────────────────────
type JoinRow = {
  id: string; code: string; name: string; email: string; location: string; locationId: string; kind: string; status: string;
  createdAt: string; expiresAt: string | null; decidedBy: string | null; decidedAt: string | null; decidedAs: string | null; method: string | null; self: boolean;
};
type Inbox = { canActAt: { id: string; name: string; as: string }[]; floorWithoutShift: boolean; methods: Record<string, string>; reasons: Record<string, string>; requests: JoinRow[] };

export function JoinsScreen({ shell }: { shell: Shell }) {
  const d = useLoad<Inbox>(`/api/gym/${shell.orgId}/joins`);
  const [open, setOpen] = useState<{ r: JoinRow; approve: boolean } | null>(null);
  // Bandeja compartida: se refresca sola (otra persona puede resolver la misma solicitud).
  useEffect(() => { const t = setInterval(() => { d.reload(); }, 10_000); return () => clearInterval(t); }, [d.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = d.data;
  const pending = v?.requests.filter((r) => r.status === "pending") ?? [];
  const done = v?.requests.filter((r) => r.status !== "pending").sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt)) ?? [];
  const actHere = (r: JoinRow) => !!v?.canActAt.some((l) => l.id === r.locationId);
  return (
    <>
      <Head kicker="Socios que escanearon el QR de la sede. Las resuelve el piso en turno o recepción; gerencia y dueño, como respaldo." title="Solicitudes de acceso" />
      <PushCard flash={shell.flash} who="floor" />
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {v?.floorWithoutShift && <p className="gy-warn" role="note" style={{ margin: 0 }}>Para resolver solicitudes tenés que tener el turno iniciado en esta sede. <button type="button" className="gy-link" onClick={() => shell.go("shift")}>Ir a Mi turno</button></p>}
      {!v ? <p className="muted">Cargando…</p> : (
        <section className="card" aria-label="Pendientes">
          <h2 style={{ margin: 0, fontSize: 18 }}>Pendientes <span className="chip warn">{pending.length}</span></h2>
          {!pending.length && <div className="empty">No hay solicitudes pendientes.</div>}
          {pending.map((r) => (
            <div key={r.id} className="gy-task">
              <span style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 2 }}>
                <b>{r.name || "Sin nombre"}</b>
                <small className="muted">{r.email} · {r.location}</small>
                <small className="muted">{KIND[r.kind] ?? r.kind} · pedida {when(r.createdAt)}{r.expiresAt ? ` · vence ${fmt(r.expiresAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</small>
              </span>
              <span className="chip info" aria-label={`Código ${r.code}`} style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{r.code}</span>
              {actHere(r) && !r.self ? <>
                <button type="button" className="btn pri" onClick={() => setOpen({ r, approve: true })}>Aprobar</button>
                <button type="button" className="btn" onClick={() => setOpen({ r, approve: false })}>Rechazar</button>
              </> : <small className="muted">{r.self ? "Es tu propia solicitud" : "Sin turno activo en esta sede"}</small>}
            </div>
          ))}
          <span className="muted" style={{ fontSize: 13 }}>El código ayuda a encontrar la solicitud; no prueba identidad ni pertenencia. Confirmá con la persona o en el sistema del gimnasio.</span>
        </section>
      )}
      {done.length > 0 && (
        <section className="card" aria-label="Resueltas en los últimos 7 días">
          <h2 style={{ margin: 0, fontSize: 18 }}>Resueltas · 7 días</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="gy-table">
              <thead><tr><th>Persona</th><th>Sede</th><th>Estado</th><th>Quién</th><th>Cómo</th></tr></thead>
              <tbody>{done.map((r) => (
                <tr key={r.id}><th scope="row">{r.name}<br /><small className="muted">{KIND[r.kind]}</small></th><td>{r.location}</td>
                  <td><span className={`chip ${ST[r.status]?.[1] ?? "mute"}`}>{ST[r.status]?.[0] ?? r.status}</span></td>
                  <td>{r.decidedBy ? `${r.decidedBy} (${AS[r.decidedAs ?? ""] ?? r.decidedAs})` : "—"}<br /><small className="muted">{r.decidedAt ? when(r.decidedAt) : ""}</small></td>
                  <td style={{ whiteSpace: "normal", maxWidth: 260 }}>{r.method ? v?.methods[r.method] ?? r.method : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
      {open && v && <DecideModal shell={shell} inbox={v} row={open.r} approve={open.approve} onClose={(ok) => { setOpen(null); if (ok) d.reload(); }} />}
    </>
  );
}

function DecideModal({ shell, inbox, row, approve, onClose }: { shell: Shell; inbox: Inbox; row: JoinRow; approve: boolean; onClose: (ok: boolean) => void }) {
  const [method, setMethod] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { busy, run } = useAct(shell.flash);
  const ready = approve ? !!method : !!reason;
  const send = async () => {
    const r = await run("go", () => api(`/api/gym/${shell.orgId}/joins/${row.id}`, { body: { approve, method: method ?? undefined, reason: reason ?? undefined, note: note || undefined } }),
      approve ? `Acceso aprobado para ${row.name}.` : "Solicitud rechazada. La persona ve el motivo.");
    onClose(!!r);
    if (!r) shell.refreshBadges();
  };
  return (
    <Modal label={approve ? "Aprobar acceso" : "Rechazar solicitud"} onClose={() => onClose(false)}>
      <div className="mhead"><h2>{approve ? "Aprobar acceso" : "Rechazar solicitud"} · {row.name}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <span className="muted">{row.email} · {row.location} · código <b style={{ fontFamily: "var(--font-mono)" }}>{row.code}</b> · {KIND[row.kind]}</span>
      {approve ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <legend className="field" style={{ marginBottom: 8 }}>¿Cómo confirmaste que es socio/a de esta sede?</legend>
          {Object.entries(inbox.methods).map(([k, l]) => (
            <label key={k} className="gy-task" style={{ cursor: "pointer", padding: "10px 14px" }}><input type="radio" name="method" checked={method === k} onChange={() => setMethod(k)} /> {l}</label>
          ))}
        </fieldset>
      ) : (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <legend className="field" style={{ marginBottom: 8 }}>Motivo (la persona ve este texto)</legend>
          {Object.entries(inbox.reasons).map(([k, l]) => (
            <label key={k} className="gy-task" style={{ cursor: "pointer", padding: "10px 14px" }}><input type="radio" name="reason" checked={reason === k} onChange={() => setReason(k)} /> {l}</label>
          ))}
        </fieldset>
      )}
      <label className="field">Nota interna (opcional, no la ve el socio)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </label>
      <div className="mfoot">
        <button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button>
        <button type="button" className="btn pri" aria-busy={busy === "go" || undefined} aria-disabled={!ready} onClick={() => ready ? send() : shell.flash(approve ? "Elegí cómo lo confirmaste." : "Elegí el motivo.")}>{approve ? "Confirmar acceso" : "Rechazar"}</button>
      </div>
    </Modal>
  );
}

// ── Accesos habilitados y QR por sede ───────────────────────────────────────
type Access = { id: string; name: string; email: string; location: string; extraLocations: string[]; status: "active" | "suspended" | "ended"; since: string };
const AST: Record<string, [string, string]> = { active: ["Habilitado", "ok"], suspended: ["Pausado", "warn"], ended: ["Baja", "mute"] };

export function AccessesScreen({ shell }: { shell: Shell }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const d = useLoad<Access[]>(`/api/gym/${shell.orgId}/accesses?q=${encodeURIComponent(term)}`);
  const [confirm, setConfirm] = useState<{ a: Access; action: "suspend" | "end" | "reactivate" } | null>(null);
  const { busy, run } = useAct(shell.flash);
  const owner = shell.ctx.roles.some((r) => r === "owner" || r === "manager");
  const doIt = async () => {
    if (!confirm) return;
    const ok = { suspend: "Acceso pausado.", end: "Acceso dado de baja.", reactivate: "Acceso reactivado." }[confirm.action];
    await run("x", () => api(`/api/gym/${shell.orgId}/accesses/${confirm.a.id}/${confirm.action}`, { body: {} }), ok);
    setConfirm(null); d.reload();
  };
  return (
    <>
      <Head kicker="Quiénes tienen acceso a REPI por este gimnasio. La facturación de REPI no depende de esta lista: usa el total acordado." title="Accesos de socios" />
      {owner && <JoinQrCard shell={shell} />}
      <section className="card" aria-label="Accesos">
        <label className="search"><span className="sr-only">Buscar</span><input placeholder="Buscar por nombre o email" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {d.err && <p role="alert" className="err-box">{d.err}</p>}
        {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <div className="empty">{term ? "Sin resultados." : "Todavía no hay accesos habilitados."}</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="gy-table">
              <thead><tr><th>Socio/a</th><th>Sede</th><th>Estado</th><th>Desde</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>{d.data.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.name}<br /><small className="muted">{a.email}</small></th>
                  <td>{a.location}{a.extraLocations.length ? <><br /><small className="muted">+ {a.extraLocations.join(", ")}</small></> : null}</td>
                  <td><span className={`chip ${AST[a.status][1]}`}>{AST[a.status][0]}</span></td>
                  <td>{fmt(a.since)}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {a.status === "active" && <button type="button" className="btn sm" onClick={() => setConfirm({ a, action: "suspend" })}>Pausar</button>}
                    {a.status !== "ended" && <button type="button" className="btn sm" onClick={() => setConfirm({ a, action: "end" })}>Dar de baja</button>}
                    {a.status !== "active" && <button type="button" className="btn sm" onClick={() => setConfirm({ a, action: "reactivate" })}>Reactivar</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {confirm && (
        <Modal label="Confirmar cambio de acceso" onClose={() => setConfirm(null)}>
          <div className="mhead"><h2>{{ suspend: "Pausar acceso", end: "Dar de baja", reactivate: "Reactivar acceso" }[confirm.action]} · {confirm.a.name}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => setConfirm(null)}>×</button></div>
          <p style={{ margin: 0, fontSize: 14 }}>{confirm.action === "reactivate" ? "La persona vuelve a confirmar qué comparte con el gimnasio antes de entrar." : "Desde ahora no puede registrar entrenamientos nuevos con el gimnasio. Su historial no se borra y sigue siendo suyo."}</p>
          <div className="mfoot"><button type="button" className="btn" onClick={() => setConfirm(null)}>Cancelar</button><button type="button" className={`btn ${confirm.action === "end" ? "danger" : "pri"}`} aria-busy={busy === "x" || undefined} onClick={doIt}>Confirmar</button></div>
        </Modal>
      )}
    </>
  );
}

type LinkView = { location: { id: string; name: string }; active: { slug: string; createdAt: string } | null; history: { createdAt: string; revokedAt: string | null }[] };

export function JoinQrCard({ shell }: { shell: Shell }) {
  const d = useLoad<LinkView[]>(`/api/gym/${shell.orgId}/join-links`);
  const { busy, run } = useAct(shell.flash);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const url = (slug: string) => `${origin}/unirse/${slug}`;
  const download = (l: LinkView) => {
    if (!l.active) return;
    const blob = new Blob([renderSVG(url(l.active.slug), { border: 2 })], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `QR-REPI-${l.location.name.replace(/\W+/g, "-")}.svg`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <section className="card" aria-label="QR de alta por sede">
      <h2 style={{ margin: 0, fontSize: 18 }}>QR de recepción por sede</h2>
      <span className="muted" style={{ fontSize: 13 }}>Imprimilo y dejalo en recepción. Quien lo escanea pide acceso; nadie entra sin que el equipo lo confirme. Si se filtra, regeneralo: el anterior deja de funcionar.</span>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {d.data?.map((l) => (
          <div key={l.location.id} className="gy-task" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <b>{l.location.name}</b>
            {l.active && origin ? <>
              <div aria-label={`QR de ${l.location.name}`} role="img" style={{ width: 168, height: 168, alignSelf: "center", background: "#fff", padding: 6, borderRadius: 10 }}
                dangerouslySetInnerHTML={{ __html: renderSVG(url(l.active.slug), { border: 1 }) }} />
              <small className="muted" style={{ wordBreak: "break-all" }}>{url(l.active.slug)}</small>
              <small className="muted">Generado {fmt(l.active.createdAt)}</small>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn sm" onClick={() => download(l)}>Descargar</button>
                <button type="button" className="btn sm" onClick={() => navigator.clipboard?.writeText(url(l.active!.slug)).then(() => shell.flash("Enlace copiado."))}>Copiar enlace</button>
                <button type="button" className="btn sm" aria-busy={busy === `r${l.location.id}` || undefined} onClick={() => run(`r${l.location.id}`, () => api(`/api/gym/${shell.orgId}/join-links/${l.location.id}/regenerate`, { body: {} }), "QR regenerado. El anterior ya no sirve.").then(() => d.reload())}>Regenerar</button>
                <button type="button" className="btn sm danger" aria-busy={busy === `x${l.location.id}` || undefined} onClick={() => run(`x${l.location.id}`, () => api(`/api/gym/${shell.orgId}/join-links/${l.location.id}/revoke`, { body: {} }), "QR desactivado.").then(() => d.reload())}>Desactivar</button>
              </div>
            </> : <>
              <span className="muted" style={{ fontSize: 13 }}>{l.active ? "…" : "Sin QR activo."}</span>
              <button type="button" className="btn pri sm" aria-busy={busy === `r${l.location.id}` || undefined} onClick={() => run(`r${l.location.id}`, () => api(`/api/gym/${shell.orgId}/join-links/${l.location.id}/regenerate`, { body: {} }), "QR generado.").then(() => d.reload())}>Generar QR</button>
            </>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Alertas de sala en vivo (sensación por serie) ───────────────────────────
type Alert = { id: string; member: string; exercise: string; feel: string; feelLabel: string; set: { n: number; weightKg: number | null; reps: number | null } | null; createdAt: string; ackBy: string | null; ackAt: string | null };

export function FloorAlertsCard({ shell, loc, highlight }: { shell: Shell; loc: string; highlight?: string | null }) {
  const d = useLoad<Alert[]>(`/api/gym/${shell.orgId}/alerts?loc=${loc}`);
  const { busy, run } = useAct(shell.flash);
  useEffect(() => { const t = setInterval(() => { d.reload(); }, 10_000); return () => clearInterval(t); }, [d.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!can(shell.ctx, "floor.work")) return null;
  const open = d.data?.filter((a) => !a.ackBy) ?? [];
  return (
    <section className="card" aria-label="Socios que piden atención" aria-live="polite">
      <h2 style={{ margin: 0, fontSize: 18 }}>En sala ahora {open.length > 0 && <span className="chip warn">{open.length}</span>}</h2>
      {!d.data ? <p className="muted">Cargando…</p> : !d.data.length ? <div className="empty">Nadie pidió atención en la última hora.</div> : d.data.map((a) => (
        <div key={a.id} className="gy-task" style={a.id === highlight ? { borderColor: "var(--core-cyan)" } : undefined}>
          <span style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 2 }}>
            <b>{a.member} · {a.exercise}</b>
            <small className="muted">{a.set ? `Serie ${a.set.n}${a.set.weightKg != null ? ` · ${a.set.weightKg.toLocaleString("es-AR")} kg` : ""}${a.set.reps != null ? ` × ${a.set.reps}` : ""} · ` : ""}{when(a.createdAt)}</small>
          </span>
          <span className={`chip ${a.feel === "ayuda" || a.feel === "molestia" ? "warn" : "info"}`}>{a.feelLabel}</span>
          {a.ackBy ? <small className="muted">Va {a.ackBy}</small>
            : <button type="button" className="btn pri sm" aria-busy={busy === a.id || undefined} onClick={() => run(a.id, () => api(`/api/gym/${shell.orgId}/alerts/${a.id}/ack`, { body: {} }), "Marcado: vas vos.").then(() => d.reload())}>Voy</button>}
        </div>
      ))}
      <span className="muted" style={{ fontSize: 13 }}>Avisa cuando un socio marca una serie como difícil, al límite, con molestia o pide un entrenador. Es una señal para acercarte, no un diagnóstico.</span>
    </section>
  );
}

// ── Condiciones comerciales (vista del cliente) ─────────────────────────────
type Conditions = {
  commercialStatus: string; enabledAccesses: number;
  contract: { status: string; legalName: string; currency: string; scope: string; scopeNote: string | null; quantityDefinition: string | null; termsVersion: string | null; acceptedAt: string | null; trialUntil: string | null } | null;
  terms: { kind: "quantity" | "unit_price"; version: number; display: string; effectiveFrom: string; current: boolean }[];
  corrections: { text: string; status: string; answer: string | null; at: string }[];
};
const CST: Record<string, string> = { draft: "Borrador", accepted: "Aceptado", enabled: "Habilitado", suspended: "Suspendido", ended: "Finalizado" };

export function ConditionsScreen({ orgId, flash, unit }: { orgId: string; flash: (t: string) => void; unit: "socios" | "alumnos" }) {
  const d = useLoad<Conditions>(`/api/conditions/${orgId}`);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const v = d.data;
  const cur = (k: "quantity" | "unit_price") => v?.terms.filter((t) => t.kind === k && t.current).at(-1) ?? null;
  const send = async () => {
    setBusy(true);
    try { await api(`/api/conditions/${orgId}`, { body: { text } }); setText(""); flash("Pedido enviado a REPI."); d.reload(); } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <Head kicker="Lo que acordaste con REPI. Sólo REPI Admin modifica estos valores; si algo no coincide, pedí la corrección." title="Condiciones y facturación REPI" />
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!v ? <p className="muted">Cargando…</p> : !v.contract ? <div className="empty">{v.commercialStatus === "legacy" ? "Tu espacio es anterior al nuevo esquema comercial: REPI va a registrar tus condiciones. Mientras tanto seguís operando." : "Todavía no hay condiciones registradas."}</div> : <>
        <div className="grid-kpi">
          <div className="kpi"><strong>{cur("quantity")?.display ?? "—"}</strong><span>{unit === "socios" ? "Socios acordados" : "Alumnos vigentes acordados"}</span></div>
          <div className="kpi"><strong style={{ fontSize: 22 }}>{cur("unit_price")?.display ?? "—"}</strong><span>Precio por {unit === "socios" ? "socio" : "alumno"}</span></div>
          <div className="kpi"><strong>{v.enabledAccesses}</strong><span>Accesos habilitados hoy (no factura)</span></div>
          <div className="kpi"><strong style={{ fontSize: 18 }}>{CST[v.contract.status] ?? v.contract.status}</strong><span>Estado del acuerdo</span></div>
        </div>
        <section className="card">
          <dl className="gy-defs">
            <div><dt>Razón social</dt><dd>{v.contract.legalName}</dd></div>
            <div><dt>Qué se factura</dt><dd>{unit === "socios" ? "Todos los socios del acuerdo, usen o no REPI y tengan o no cuenta." : "Todos tus alumnos vigentes, tengan o no la app activada o un programa asignado."} El total lo carga REPI Admin.</dd></div>
            {v.contract.quantityDefinition && <div><dt>Definición de vigente</dt><dd>{v.contract.quantityDefinition}</dd></div>}
            <div><dt>Alcance</dt><dd>{v.contract.scope === "locations" ? "Sedes incluidas en el acuerdo" : "Toda la organización"}{v.contract.scopeNote ? ` · ${v.contract.scopeNote}` : ""}</dd></div>
            <div><dt>Aceptación</dt><dd>{v.contract.acceptedAt ? `${fmt(v.contract.acceptedAt, { day: "numeric", month: "long", year: "numeric" })} · versión ${v.contract.termsVersion ?? "—"}` : "Pendiente"}</dd></div>
            {v.contract.trialUntil && <div><dt>Prueba acordada</dt><dd>Hasta {v.contract.trialUntil}</dd></div>}
            <div><dt>Ciclo, prorrateo y mora</dt><dd>A definir en el acuerdo comercial. No se generan cobros automáticos desde REPI en esta versión.</dd></div>
          </dl>
          <h3 style={{ margin: "8px 0 0", fontSize: 15 }}>Historial</h3>
          <table className="gy-table"><thead><tr><th>Concepto</th><th>Valor</th><th>Desde</th><th>Versión</th></tr></thead>
            <tbody>{v.terms.map((t) => <tr key={`${t.kind}${t.version}`}><td>{t.kind === "quantity" ? "Cantidad acordada" : "Precio por unidad"}</td><td>{t.display}</td><td>{t.effectiveFrom}</td><td>{t.version}{!t.current ? " · futura" : ""}</td></tr>)}</tbody></table>
        </section>
        <section className="card" aria-label="Pedir corrección">
          <h2 style={{ margin: 0, fontSize: 18 }}>¿Algo no coincide?</h2>
          <textarea className="note" rows={3} maxLength={800} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: acordamos 400 socios desde el 1/11, no 450." />
          <button type="button" className="btn pri" style={{ alignSelf: "flex-start" }} aria-busy={busy || undefined} aria-disabled={text.trim().length < 5} onClick={() => text.trim().length >= 5 ? send() : flash("Contá qué hay que corregir.")}>Pedir corrección</button>
          {v.corrections.map((c, i) => <div key={i} className="gy-task"><span style={{ flex: 1 }}>{c.text}{c.answer && <><br /><small className="muted">REPI: {c.answer}</small></>}</span><span className={`chip ${c.status === "open" ? "warn" : "ok"}`}>{c.status === "open" ? "Abierto" : "Respondido"}</span></div>)}
        </section>
      </>}
    </>
  );
}
