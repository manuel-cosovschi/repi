"use client";
// Agenda del coach (F-CO-10, D98). Fuente: REPI Desktop Coach («Agenda de hoy»: hora, cliente, modalidad y detalle).
// Turnos presenciales u online separados del entrenamiento: el coach marca asistencia; el alumno confirma en su app.
import { useState } from "react";
import { APPT_DURATIONS, APPT_RESPONSE, APPT_STATUS, arParts, type ApptModality, type ApptResponse, type ApptStatus } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Head, useLoad } from "@/components/gym/shared";
import type { Overview } from "./types";

export type Appt = {
  id: string; coachClientId: string; client?: string; startsAt: string; date: string; time: string; durationMin: number; modality: ApptModality;
  place: string | null; note: string | null; status: ApptStatus; clientResponse: ApptResponse; cancelReason: string | null;
};
const ST: Record<ApptStatus, string> = { scheduled: "info", cancelled: "mute", done: "ok", no_show: "warn" };
const RS: Record<ApptResponse, string> = { pending: "mute", confirmed: "ok", declined: "bad" };
const addDays = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);
const mondayOf = (iso: string) => { const wd = new Date(`${iso}T12:00:00Z`).getUTCDay(); return addDays(iso, -((wd + 6) % 7)); };
const dayLabel = (iso: string) => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const where = (a: Appt) => `${a.modality === "online" ? "Online" : "Presencial"}${a.place ? ` · ${a.place}` : ""}`;

/** «Agenda de hoy» del panel: lectura de la agenda real. */
export function TodayAgenda({ orgId, go }: { orgId: string; go: () => void }) {
  const today = arParts(new Date()).date;
  const d = useLoad<Appt[]>(`/api/coach/${orgId}/agenda?from=${today}&days=1`);
  const items = d.data?.filter((a) => a.status !== "cancelled") ?? [];
  return (
    <>
      {d.err && <span className="muted">{d.err}</span>}
      {!d.data ? <span className="muted">Cargando…</span> : !items.length ? <span className="muted" style={{ fontSize: 14 }}>No tenés sesiones agendadas para hoy.</span> : items.map((a) => (
        <div key={a.id} className="todo"><span className="mono" style={{ width: 52, color: "#006B88" }}>{a.time}</span><span><b>{a.client}</b><small>{where(a)}{a.note ? ` · ${a.note}` : ""}</small></span>
          <span className={`chip ${RS[a.clientResponse]}`}>{APPT_RESPONSE[a.clientResponse]}</span></div>
      ))}
      <button type="button" className="btn sm" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={go}>Ver agenda</button>
    </>
  );
}

export function CoachAgenda({ orgId, ov, flash }: { orgId: string; ov: Overview; flash: (t: string) => void }) {
  const today = arParts(new Date()).date;
  const [from, setFrom] = useState(mondayOf(today));
  const d = useLoad<Appt[]>(`/api/coach/${orgId}/agenda?from=${from}&days=7`);
  const [modal, setModal] = useState<{ edit?: Appt; date?: string } | null>(null);
  const act = async (a: Appt, body: Record<string, unknown>, msg: string) => {
    try { await api(`/api/coach/${orgId}/agenda/${a.id}`, { body }); flash(msg); d.reload(); } catch (e) { flash((e as Error).message); }
  };
  const cancel = (a: Appt) => {
    const reason = window.prompt(`¿Por qué cancelás la sesión con ${a.client}? Lo ve en su app.`);
    if (reason?.trim()) void act(a, { action: "cancel", reason }, "Sesión cancelada.");
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const started = (a: Appt) => new Date(a.startsAt).getTime() <= Date.now();
  return (
    <>
      <Head kicker="Sesiones presenciales u online con tus clientes. La asistencia la marcás vos; no depende de que registren el entrenamiento." title="Agenda">
        <button type="button" className="btn pri" onClick={() => setModal({})}>Nueva sesión</button>
      </Head>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn sm" aria-label="Semana anterior" onClick={() => setFrom(addDays(from, -7))}>‹</button>
        <b style={{ minWidth: 200, textAlign: "center" }}>Semana del {dayLabel(from)}</b>
        <button type="button" className="btn sm" aria-label="Semana siguiente" onClick={() => setFrom(addDays(from, 7))}>›</button>
        {from !== mondayOf(today) && <button type="button" className="btn sm" onClick={() => setFrom(mondayOf(today))}>Hoy</button>}
      </div>
      {d.err && <p role="alert" className="err-box">{d.err}</p>}
      {!d.data ? <p className="muted">Cargando…</p> : days.map((day) => {
        const list = d.data!.filter((a) => a.date === day);
        return (
          <section key={day} className="card" style={{ gap: 6 }} aria-label={dayLabel(day)}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h2 style={{ margin: 0, flex: 1, textTransform: "capitalize", fontSize: 15 }}>{dayLabel(day)}{day === today ? " · hoy" : ""}</h2>
              {day >= today && <button type="button" className="btn sm" onClick={() => setModal({ date: day })}>Agendar</button>}
            </div>
            {!list.length ? <span className="muted" style={{ fontSize: 13 }}>Sin sesiones.</span> : list.map((a) => (
              <div key={a.id} className="trow" style={{ alignItems: "flex-start", opacity: a.status === "cancelled" ? 0.6 : 1 }}>
                <span className="mono" style={{ flex: "0 0 92px" }}>{a.time} · {a.durationMin}′</span>
                <span style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <b>{a.client}</b><small className="muted">{where(a)}{a.note ? ` · ${a.note}` : ""}{a.cancelReason ? ` · Motivo: ${a.cancelReason}` : ""}</small>
                </span>
                <span className={`chip ${ST[a.status]}`}>{APPT_STATUS[a.status]}</span>
                {a.status === "scheduled" && <span className={`chip ${RS[a.clientResponse]}`}>{APPT_RESPONSE[a.clientResponse]}</span>}
                {a.status === "scheduled" && started(a) && <>
                  <button type="button" className="btn sm" onClick={() => act(a, { action: "done" }, "Asistencia registrada.")}>Asistió</button>
                  <button type="button" className="btn sm" onClick={() => act(a, { action: "no_show" }, "Registrado: no asistió.")}>No asistió</button>
                </>}
                {a.status === "scheduled" && !started(a) && <button type="button" className="btn sm" onClick={() => setModal({ edit: a })}>Reprogramar</button>}
                {a.status === "scheduled" && <button type="button" className="btn sm" onClick={() => cancel(a)}>Cancelar</button>}
                {a.status !== "cancelled" && <a className="btn sm" href={`/api/agenda/${a.id}/ics`}>.ics</a>}
              </div>
            ))}
          </section>
        );
      })}
      {modal && <ApptModal orgId={orgId} ov={ov} edit={modal.edit} date={modal.date ?? today} flash={flash} onClose={(ok) => { setModal(null); if (ok) d.reload(); }} />}
    </>
  );
}

function ApptModal({ orgId, ov, edit, date, flash, onClose }: { orgId: string; ov: Overview; edit?: Appt; date: string; flash: (t: string) => void; onClose: (ok: boolean) => void }) {
  const clients = ov.clients.filter((c) => c.status === "active");
  const [f, setF] = useState({ rel: edit?.coachClientId ?? clients[0]?.id ?? "", date: edit?.date ?? date, time: edit?.time ?? "18:00", durationMin: edit?.durationMin ?? 60, modality: edit?.modality ?? "presencial" as ApptModality, place: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      if (edit) await api(`/api/coach/${orgId}/agenda/${edit.id}`, { body: { action: "reschedule", date: f.date, time: f.time, durationMin: f.durationMin } });
      else await api(`/api/coach/${orgId}/agenda`, { body: { coachClientId: f.rel, date: f.date, time: f.time, durationMin: f.durationMin, modality: f.modality, place: f.place || null, note: f.note || null } });
      flash(edit ? "Sesión reprogramada. Tu cliente tiene que volver a confirmar." : "Sesión agendada. Tu cliente la ve en su app.");
      onClose(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const title = edit ? `Reprogramar · ${edit.client}` : "Nueva sesión";
  return (
    <Modal label={title} onClose={() => onClose(false)}>
      <div className="mhead"><h2>{title}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!edit && <label className="field">Cliente<select required value={f.rel} onChange={(e) => setF({ ...f, rel: e.target.value })}>
          {!clients.length && <option value="">Sin clientes activos</option>}{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "1 1 150px" }}>Día<input type="date" required value={f.date} min={arParts(new Date()).date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="field" style={{ flex: "0 0 110px" }}>Hora<input type="time" required step={300} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
          <label className="field" style={{ flex: "0 0 120px" }}>Duración<select value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })}>{APPT_DURATIONS.map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>Hora de Argentina.</span>
        {!edit && <>
          <label className="field">Modalidad<select value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value as ApptModality })}><option value="presencial">Presencial</option><option value="online">Online (videollamada)</option></select></label>
          <label className="field">{f.modality === "online" ? "Enlace o indicación (opcional)" : "Lugar (opcional)"}<input maxLength={160} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder={f.modality === "online" ? "Te paso el enlace por chat" : "Gym Norte · sala 2"} /></label>
          <label className="field">Nota (opcional)<input maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Evaluación de técnica" /></label>
        </>}
        {err && <p role="alert" className="err-box">{err}</p>}
        <div className="mfoot"><button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button><button type="submit" className="btn pri" aria-busy={busy || undefined} disabled={!edit && !f.rel}>{busy ? "Guardando…" : edit ? "Reprogramar" : "Agendar"}</button></div>
      </form>
    </Modal>
  );
}
