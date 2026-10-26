"use client";
// Pestañas sensibles de la ficha (Salud, Nutrición, Mi cuerpo). Sin grant: bloqueo + «Pedir acceso» (F-PR-06/F-CO-15).
import { useCallback, useEffect, useState } from "react";
import { ACCESS_ITEMS, INJURY_STATUS, PAIN_CONTEXT, type AccessItem, type InjuryStatus } from "@repi/domain";
import { api } from "@/lib/api";
import { ACCESS_ST } from "./CoachInbox";
import { fmtDate } from "./types";

type Health = {
  granted: boolean;
  injuries: { id: string; zone: string; detail: string | null; status: InjuryStatus; since: string | null }[];
  pains: { id: string; zone: string; level: number; context: keyof typeof PAIN_CONTEXT; exerciseName: string | null; note: string | null; createdAt: string; sharedOne: boolean }[];
  checkins: { date: string; energy: number; sleep: number; mood: number }[];
  access: Record<AccessItem, { status: string; retryAt: string | null }>;
};
const INJ_CHIP: Record<InjuryStatus, string> = { active: "bad", monitoring: "warn", resolved: "ok" };

function LockCard({ orgId, relId, item, first, status, retryAt, onRequested, flash }: { orgId: string; relId: string; item: AccessItem; first: string; status: string; retryAt: string | null; onRequested: () => void; flash: (t: string) => void }) {
  const [busy, setBusy] = useState(false);
  const label = ACCESS_ITEMS[item].label;
  const ask = async () => {
    setBusy(true);
    try { await api(`/api/coach/${orgId}/clients/${relId}/access`, { body: { item } }); flash(`Le enviamos a ${first} una solicitud. Decide en su app qué compartir.`); onRequested(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  const canAsk = (status === "none" || status === "denied" || status === "expired") && !retryAt; // D38: 7 días tras un rechazo
  return (
    <section className="card lock" style={{ flexDirection: "row" }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5B6B80" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2>{label}: no compartido</h2>
        <span className="muted" style={{ fontSize: 14 }}>Sin acceso hasta que {first} lo habilite. {ACCESS_ITEMS[item].reason}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {status !== "none" && ACCESS_ST[status] && <span className={`chip ${ACCESS_ST[status][1]}`}>{ACCESS_ST[status][0]}</span>}
          {canAsk && <button type="button" className="btn sm pri" aria-busy={busy || undefined} onClick={ask}>{status === "none" ? "Pedir acceso" : "Volver a pedir"}</button>}
          {retryAt && <span className="muted">Podés volver a pedirlo desde el {fmtDate(retryAt, { day: "numeric", month: "long" })}.</span>}
        </div>
      </div>
    </section>
  );
}

export function SensitiveTab({ orgId, relId, name, item, flash }: { orgId: string; relId: string; name: string; item: AccessItem; flash: (t: string) => void }) {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const first = name.split(" ")[0];
  const load = useCallback(() => {
    // Salud trae los registros (y deja constancia de la lectura); los demás tipos sólo el estado de acceso.
    const url = item === "health" ? `/api/coach/${orgId}/clients/${relId}/health` : `/api/coach/${orgId}/clients/${relId}/access`;
    return api<Health | Health["access"]>(url).then((x) => setH(item === "health" ? (x as Health) : { granted: (x as Health["access"])[item]?.status === "granted", injuries: [], pains: [], checkins: [], access: x as Health["access"] })).catch((e) => setErr(e.message));
  }, [orgId, relId, item]);
  useEffect(() => { load(); }, [load]);
  if (err) return <p role="alert" className="err-box">{err}</p>;
  if (!h) return <p className="muted">Cargando…</p>;
  const status = h.access[item]?.status ?? "none";
  const retryAt = h.access[item]?.retryAt ?? null;
  if (item !== "health") {
    return h.granted
      ? <div className="empty">{ACCESS_ITEMS[item].label}: {first} lo comparte, pero la carga desde la app todavía no está disponible.</div>
      : <LockCard orgId={orgId} relId={relId} item={item} first={first} status={status} retryAt={retryAt} onRequested={load} flash={flash} />;
  }
  return (
    <>
      {!h.granted && <LockCard orgId={orgId} relId={relId} item="health" first={first} status={status} retryAt={retryAt} onRequested={load} flash={flash} />}
      {h.granted && (
        <section className="card">
          <h2>Lesiones y antecedentes</h2>
          {h.injuries.map((i) => (
            <div key={i.id} className="trow"><b style={{ flex: "0 0 140px" }}>{i.zone}</b><span style={{ flex: 1 }}>{i.detail ?? "Sin detalle"}{i.since ? ` · desde ${i.since}` : ""}</span><span className={`chip ${INJ_CHIP[i.status]}`}>{INJURY_STATUS[i.status]}</span></div>
          ))}
          {!h.injuries.length && <span className="muted" style={{ fontSize: 14 }}>{first} no cargó lesiones ni antecedentes.</span>}
          <span className="muted">Cargado por {first} desde su app. REPI no diagnostica: ante dolor persistente, derivá a un profesional de la salud.</span>
        </section>
      )}
      {(h.granted || h.pains.length > 0) && (
        <section className="card">
          <h2>Molestias reportadas{!h.granted ? " · compartidas una a una" : ""}</h2>
          {h.pains.length > 0 && (
            <div className="bars10" role="img" aria-label={`Intensidad de las últimas molestias: ${h.pains.slice(0, 10).map((p) => `${p.zone} ${p.level}`).join(", ")}`}>
              {h.pains.slice(0, 10).reverse().map((p) => <div key={p.id}><i style={{ height: `${Math.max(4, p.level * 10)}%`, background: p.level >= 4 ? "#F59E0B" : "#5DE6D8" }} /><span>{p.level}</span></div>)}
            </div>
          )}
          {h.pains.map((p) => (
            <div key={p.id} className="trow"><span className="muted" style={{ flex: "0 0 110px" }}>{fmtDate(p.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><b style={{ flex: "0 0 120px" }}>{p.zone}</b><span style={{ flex: 1 }}>{p.exerciseName ?? PAIN_CONTEXT[p.context]}{p.note ? ` · “${p.note}”` : ""}</span><span className={`chip ${p.level >= 4 ? "warn" : "mute"}`}>{p.level}/10</span></div>
          ))}
          {!h.pains.length && <span className="muted" style={{ fontSize: 14 }}>Sin molestias reportadas.</span>}
        </section>
      )}
      <section className="card">
        <h2>Check-in antes de entrenar</h2>
        {h.checkins.map((c) => (
          <div key={c.date} className="trow"><span className="muted" style={{ flex: "0 0 90px" }}>{c.date.split("-").reverse().slice(0, 2).join("/")}</span><span style={{ flex: 1 }}>Energía {c.energy}/5 · Sueño {c.sleep}/5 · Ánimo {c.mood}/5</span></div>
        ))}
        {!h.checkins.length && <span className="muted" style={{ fontSize: 14 }}>Sin check-ins todavía.</span>}
      </section>
    </>
  );
}
