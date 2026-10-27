"use client";
// Cobros a alumnos (F-BL-01, F-CO-17; D80). Fuente: REPI Desktop Coach (SCR-C pagos): KPIs cobrado/por cobrar/vencido,
// tabla de clientes con próximo vencimiento y «Registrar pago». Es un registro manual: REPI no cobra ni mueve dinero,
// y no se mezcla con lo que REPI le factura al coach (Condiciones REPI). Los totales nunca suman monedas distintas.
import { useState } from "react";
import { CURRENCIES, fmtMoney, parseMoney, type Currency } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { useLoad } from "@/components/gym/shared";

export type Charge = {
  id: string; coachClientId: string; concept: string; amountMinor: number; currency: string; dueOn: string; status: "pending" | "paid" | "void";
  overdue: boolean; paidOn: string | null; method: string | null; note: string | null; voidReason: string | null;
};
type Totals = Record<string, { collectedMonth: number; pending: number; overdue: number }>;
type Payments = { today: string; totals: Totals; clients: { id: string; name: string; status: string; next: Charge | null; openCount: number; lastPaidOn: string | null }[] };

const money = (minor: number, cur: string) => fmtMoney(minor, cur as Currency);
const day = (iso: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const METHOD: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", otro: "Otro" };
const sum = (t: Totals, k: "collectedMonth" | "pending" | "overdue") => Object.entries(t).filter(([, v]) => v[k] > 0).map(([c, v]) => money(v[k], c)).join(" · ") || "—";

export function chargeChip(c: Charge) {
  if (c.status === "paid") return <span className="chip ok">Pagado {c.paidOn ? day(c.paidOn) : ""}</span>;
  if (c.status === "void") return <span className="chip mute">Anulado</span>;
  return c.overdue ? <span className="chip warn">Vencido</span> : <span className="chip info">Por cobrar</span>;
}

export function CoachPayments({ orgId, flash, openClient }: { orgId: string; flash: (t: string) => void; openClient: (relId: string) => void }) {
  const d = useLoad<Payments>(`/api/coach/${orgId}/payments`);
  const [create, setCreate] = useState<string | null | undefined>(undefined); // undefined: cerrado; null: elegir cliente
  const [pay, setPay] = useState<Charge | null>(null);
  const k = d.data;
  return (
    <>
      <div className="co-head">
        <div><h1 tabIndex={-1}>Cobros a alumnos</h1><span className="muted">Registro manual de lo que te pagan tus clientes. REPI no cobra por vos; esto no incluye lo que REPI te factura.</span></div>
        <button type="button" className="btn pri" onClick={() => setCreate(null)}>Nuevo cargo</button>
      </div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!k ? <p className="muted">Cargando…</p> : (
        <>
          <div className="grid-kpi">
            <div className="stat"><span>Cobrado este mes</span><strong style={{ fontSize: 20 }}>{sum(k.totals, "collectedMonth")}</strong><small className="muted">Pagos registrados</small></div>
            <div className="stat"><span>Por cobrar</span><strong style={{ fontSize: 20 }}>{sum(k.totals, "pending")}</strong><small className="muted">Cargos sin vencer</small></div>
            <div className="stat"><span>Vencido</span><strong style={{ fontSize: 20 }}>{sum(k.totals, "overdue")}</strong><small className="muted">Pendientes con fecha pasada</small></div>
          </div>
          <section className="card">
            <h2>Clientes</h2>
            {!k.clients.length ? <span className="muted" style={{ fontSize: 14 }}>Todavía no tenés clientes.</span> : (
              <div className="table">
                {k.clients.map((c) => (
                  <div key={c.id} className="trow">
                    <button type="button" style={{ flex: "1 1 160px", textAlign: "left", fontWeight: 600, border: 0, background: "none", padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }} onClick={() => openClient(c.id)}>{c.name}</button>
                    <span style={{ flex: "1 1 200px" }}>{c.next ? <>{c.next.concept} · {money(c.next.amountMinor, c.next.currency)} · vence {day(c.next.dueOn)}{c.openCount > 1 ? <small className="muted"> · +{c.openCount - 1}</small> : null}</> : <span className="muted">Sin cargos pendientes{c.lastPaidOn ? ` · último pago ${day(c.lastPaidOn)}` : ""}</span>}</span>
                    {c.next && chargeChip(c.next)}
                    {c.next ? <button type="button" className="btn sm" onClick={() => setPay(c.next)}>Registrar pago</button>
                      : c.status !== "ended" && <button type="button" className="btn sm" onClick={() => setCreate(c.id)}>Nuevo cargo</button>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {create !== undefined && k && <ChargeModal orgId={orgId} clients={k.clients.filter((c) => c.status !== "ended")} preset={create} flash={flash} onClose={(ok) => { setCreate(undefined); if (ok) d.reload(); }} />}
      {pay && <PayModal orgId={orgId} charge={pay} flash={flash} onClose={(ok) => { setPay(null); if (ok) d.reload(); }} />}
    </>
  );
}

export function ChargeModal({ orgId, clients, preset, flash, onClose }: { orgId: string; clients: { id: string; name: string }[]; preset: string | null; flash: (t: string) => void; onClose: (ok: boolean) => void }) {
  const [f, setF] = useState({ rel: preset ?? clients[0]?.id ?? "", concept: "", amount: "", currency: "ARS", dueOn: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const minor = parseMoney(f.amount, f.currency as Currency);
    if (minor == null || minor <= 0) { setErr("Escribí un importe válido (por ejemplo 25.000 o 25000,50)."); return; }
    setBusy(true); setErr(null);
    try { await api(`/api/coach/${orgId}/payments`, { body: { coachClientId: f.rel, concept: f.concept, amountMinor: minor, currency: f.currency, dueOn: f.dueOn } }); flash("Cargo registrado."); onClose(true); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal label="Nuevo cargo" onClose={() => onClose(false)}>
      <div className="mhead"><h2>Nuevo cargo</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="field">Cliente<select value={f.rel} onChange={(e) => setF({ ...f, rel: e.target.value })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field">Concepto<input required maxLength={120} value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} placeholder="Plan mensual noviembre" /></label>
        <div style={{ display: "flex", gap: 10 }}>
          <label className="field" style={{ flex: 1 }}>Importe<input required inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="25.000" /></label>
          <label className="field" style={{ flex: "0 0 110px" }}>Moneda<select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        <label className="field">Vence<input type="date" required value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></label>
        {err && <p role="alert" className="err-box">{err}</p>}
        <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button><button type="submit" className="btn pri" aria-busy={busy || undefined} disabled={!f.rel}>{busy ? "Guardando…" : "Registrar cargo"}</button></div>
      </form>
    </Modal>
  );
}

export function PayModal({ orgId, charge, flash, onClose }: { orgId: string; charge: Charge; flash: (t: string) => void; onClose: (ok: boolean) => void }) {
  const [f, setF] = useState({ paidOn: new Date().toISOString().slice(0, 10), method: "transferencia", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api(`/api/coach/${orgId}/payments/${charge.id}`, { body: { action: "pay", paidOn: f.paidOn, method: f.method, note: f.note || null } }); flash("Pago registrado."); onClose(true); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal label="Registrar pago" onClose={() => onClose(false)}>
      <div className="mhead"><h2>Registrar pago</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <span className="muted" style={{ fontSize: 13 }}>{charge.concept} · {money(charge.amountMinor, charge.currency)} · vence {day(charge.dueOn)}. Registralo cuando el pago ya te llegó.</span>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="field">Fecha de pago<input type="date" required value={f.paidOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></label>
        <label className="field">Medio<select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field">Nota (opcional)<input maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Comprobante, referencia…" /></label>
        {err && <p role="alert" className="err-box">{err}</p>}
        <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button><button type="submit" className="btn pri" aria-busy={busy || undefined}>{busy ? "Guardando…" : "Registrar pago"}</button></div>
      </form>
    </Modal>
  );
}

/** Pestaña «Pagos» de la ficha del cliente: historial con anulación (siempre con motivo). */
export function ClientPayTab({ orgId, relId, name, flash }: { orgId: string; relId: string; name: string; flash: (t: string) => void }) {
  const d = useLoad<{ today: string; totals: Totals; charges: Charge[] }>(`/api/coach/${orgId}/clients/${relId}/charges`);
  const [create, setCreate] = useState(false);
  const [pay, setPay] = useState<Charge | null>(null);
  const annul = async (c: Charge) => {
    const reason = window.prompt(`¿Por qué anulás «${c.concept}»? Queda en el historial.`);
    if (!reason?.trim()) return;
    try { await api(`/api/coach/${orgId}/payments/${c.id}`, { body: { action: "void", reason } }); flash("Cargo anulado."); d.reload(); } catch (e) { flash((e as Error).message); }
  };
  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, flex: 1 }}>Pagos</h2>
        <button type="button" className="btn sm pri" onClick={() => setCreate(true)}>Nuevo cargo</button>
      </div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <span className="muted">Cargando…</span> : !d.data.charges.length ? <span className="muted" style={{ fontSize: 14 }}>Sin cargos registrados para {name.split(" ")[0]}.</span> : (
        <>
          <span className="muted" style={{ fontSize: 13 }}>Por cobrar: {sum(d.data.totals, "pending")} · Vencido: {sum(d.data.totals, "overdue")}</span>
          <div className="table">
            {d.data.charges.map((c) => (
              <div key={c.id} className="trow">
                <span style={{ flex: "0 0 80px" }} className="muted">{day(c.dueOn)}</span>
                <b style={{ flex: "1 1 160px" }}>{c.concept}</b>
                <span style={{ flex: "0 0 auto" }}>{money(c.amountMinor, c.currency)}</span>
                {chargeChip(c)}
                {c.status === "pending" && <button type="button" className="btn sm" onClick={() => setPay(c)}>Registrar pago</button>}
                {c.status !== "void" && <button type="button" className="btn sm" onClick={() => annul(c)}>Anular</button>}
                {(c.method || c.note || c.voidReason) && <span style={{ flexBasis: "100%", fontSize: 13 }} className="muted">{[c.method ? METHOD[c.method] : null, c.note, c.voidReason ? `Anulado: ${c.voidReason}` : null].filter(Boolean).join(" · ")}</span>}
              </div>
            ))}
          </div>
        </>
      )}
      {create && <ChargeModal orgId={orgId} clients={[{ id: relId, name }]} preset={relId} flash={flash} onClose={(ok) => { setCreate(false); if (ok) d.reload(); }} />}
      {pay && <PayModal orgId={orgId} charge={pay} flash={flash} onClose={(ok) => { setPay(null); if (ok) d.reload(); }} />}
    </section>
  );
}
