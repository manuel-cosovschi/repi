"use client";
// STF-09 (D214): gestionar el acceso de una persona del equipo desde «Equipo» (dueño y gerencia). Cambiar el rol o la sede, o
// quitarla del equipo. El servidor decide qué filas se pueden tocar (el dueño, cualquiera que no sea dueño; la gerencia, sala y
// recepción de su sede) y devuelve a la cola las tareas que la persona ya no puede atender. Nada se borra: queda el historial.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { useLoad, type Shell } from "./shared";

type Access = {
  userId: string; name: string;
  memberships: { id: string; role: string; roleLabel: string; locationId: string | null; location: string; editable: boolean }[];
  roles: { id: string; label: string }[];
  locations: { id: string | null; name: string }[];
};
type Done = { kind: "role"; changed: boolean; tasksReturned?: number; shiftsClosed?: number } | { kind: "revoke"; revoked: number; remaining: number; tasksReturned: number; shiftsClosed: number };

const tasksTxt = (n: number) => (n === 0 ? "No tenía tareas pendientes para devolver." : n === 1 ? "1 tarea pendiente volvió a la cola de su sede." : `${n} tareas pendientes volvieron a la cola de su sede.`);

export function StaffAccessModal({ shell, userId, name, onClose, onChanged }: { shell: Shell; userId: string; name: string; onClose: () => void; onChanged: () => void }) {
  const a = useLoad<Access>(`/api/gym/${shell.orgId}/team/${userId}`);
  const [step, setStep] = useState<"edit" | "revoke" | "done">("edit");
  const [role, setRole] = useState<string | null>(null);
  const [loc, setLoc] = useState<string | null | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<null | "role" | "revoke">(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (step !== "edit") title.current?.focus(); }, [step]);
  const first = name.split(" ")[0];
  const d = a.data;
  const editable = d?.memberships.filter((m) => m.editable) ?? [];
  const kept = d?.memberships.filter((m) => !m.editable) ?? [];
  // Lo que se muestra elegido: lo que la persona tocó o, si no, su fila editable actual (si el rol se puede asignar).
  const base = editable[0];
  const curRole = role ?? (base && d?.roles.some((r) => r.id === base.role) ? base.role : null);
  const curLoc = loc !== undefined ? loc : base ? base.locationId : (d?.locations[0]?.id ?? null);
  const locOk = !!d?.locations.some((l) => l.id === curLoc);
  const same = editable.length === 1 && base.role === curRole && (base.locationId ?? null) === (curLoc ?? null);
  const close = () => { if (!busy) (done ? onChanged : onClose)(); };

  const saveRole = async () => {
    if (busy || !curRole || !locOk || same) return;
    setBusy("role"); setErr(null);
    try {
      const r = await api<{ changed: boolean; tasksReturned?: number; shiftsClosed?: number }>(`/api/gym/${shell.orgId}/team/${userId}/role`, { body: { role: curRole, locationId: curLoc ?? null } });
      setDone({ kind: "role", ...r }); setStep("done");
      shell.flash(r.changed ? `Actualizaste el acceso de ${first}.` : "No había nada para cambiar.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const revoke = async () => {
    if (busy) return;
    setBusy("revoke"); setErr(null);
    try {
      const r = await api<{ revoked: number; remaining: number; tasksReturned: number; shiftsClosed: number }>(`/api/gym/${shell.orgId}/team/${userId}/revoke`, { body: { reason: reason.trim() || null } });
      setDone({ kind: "revoke", ...r }); setStep("done");
      shell.flash(r.remaining ? `Quitaste a ${first} de lo que gestionás. Conserva otros roles.` : `${first} ya no tiene acceso al gimnasio.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <Modal label={`Acceso de ${name}`} onClose={close}>
      <div className="mhead">
        <h2 ref={title} tabIndex={-1}>{step === "revoke" ? `¿Quitar a ${first} del equipo?` : step === "done" ? "Listo" : `Acceso de ${name}`}</h2>
        <button type="button" className="x" aria-label="Cerrar" disabled={!!busy} onClick={close}>×</button>
      </div>
      {a.err && !d && <p role="alert" className="err-box" style={{ margin: 0 }}>{a.err}</p>}
      {!d && !a.err && <p className="muted" role="status">Cargando…</p>}

      {d && step === "edit" && (
        <>
          <div className="sa-now" role="group" aria-label="Acceso actual">
            <small className="muted">Hoy</small>
            {d.memberships.map((m) => (
              <div key={m.id} className="trow"><span style={{ flex: 1 }}><b>{m.roleLabel}</b> · {m.location}</span>{!m.editable && <span className="chip mute">No lo podés cambiar</span>}</div>
            ))}
          </div>
          {!editable.length ? (
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>Su acceso lo cambia el dueño del gimnasio (y el de un dueño, REPI).</p>
          ) : (
            <>
              <fieldset className="sa-box">
                <legend>Cambiar rol o sede</legend>
                <div className="pills" role="group" aria-label="Rol">
                  {d.roles.map((r) => <button key={r.id} type="button" className="pill" aria-pressed={curRole === r.id} disabled={!!busy} onClick={() => { setRole(r.id); setErr(null); }}>{r.label}</button>)}
                </div>
                <label className="field">Sede
                  <select value={curLoc ?? ""} disabled={!!busy} onChange={(e) => { setLoc(e.target.value || null); setErr(null); }}>
                    {!locOk && <option value={curLoc ?? ""} disabled>Elegí una sede</option>}
                    {d.locations.map((l) => <option key={l.id ?? "all"} value={l.id ?? ""}>{l.name}</option>)}
                  </select>
                </label>
                <small className="muted">{editable.length > 1 ? "Queda con un solo rol y una sede. " : ""}Si deja de trabajar en una sede, sus tareas pendientes de esa sede vuelven a la cola.</small>
                <button type="button" className="btn pri" style={{ alignSelf: "flex-start" }} disabled={!!busy || !curRole || !locOk || same} aria-busy={busy === "role" || undefined} onClick={() => void saveRole()}>
                  {busy === "role" ? "Guardando…" : "Guardar cambio"}</button>
              </fieldset>
              <div className="sa-box sa-danger">
                <b>Quitar del equipo</b>
                <small className="muted">Pierde el acceso al instante. Su historial se conserva.</small>
                <button type="button" className="btn danger" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={() => { setErr(null); setStep("revoke"); }}>Quitar del equipo</button>
              </div>
            </>
          )}
          {err && <p role="alert" className="err-box" style={{ margin: 0 }}>{err}</p>}
          <div className="mfoot sa-foot"><button type="button" className="btn" disabled={!!busy} onClick={close}>Cerrar</button></div>
        </>
      )}

      {d && step === "revoke" && (
        <>
          <ul className="sa-list">
            <li>Pierde el acceso al instante, también en las pantallas que tenga abiertas.</li>
            <li>Sus tareas pendientes vuelven a la cola de su sede y se cierra su turno abierto.</li>
            <li>Su historial (tareas, turnos, reseñas y lo que registró) se conserva.</li>
            {kept.length > 0 && <li>Conserva lo que no podés cambiar: {kept.map((m) => `${m.roleLabel} · ${m.location}`).join(", ")}.</li>}
          </ul>
          <label className="field">Motivo (opcional, queda en la auditoría)
            <textarea rows={2} maxLength={200} value={reason} disabled={!!busy} onChange={(e) => setReason(e.target.value)} placeholder="Por ejemplo: dejó de trabajar en el gimnasio" /></label>
          {err && <p role="alert" className="err-box" style={{ margin: 0 }}>{err}</p>}
          <div className="mfoot sa-foot">
            <button type="button" className="btn" disabled={!!busy} onClick={() => { setErr(null); setStep("edit"); }}>Volver</button>
            <button type="button" className="btn danger gy-strong" disabled={!!busy} aria-busy={busy === "revoke" || undefined} onClick={() => void revoke()}>{busy === "revoke" ? "Quitando…" : "Sí, quitar acceso"}</button>
          </div>
        </>
      )}

      {step === "done" && done && (
        <>
          <div role="status" className="sa-done">
            {done.kind === "revoke" ? (
              <>
                <b>{done.remaining ? `Quitaste a ${first} de lo que gestionás.` : `${name} ya no tiene acceso al gimnasio.`}</b>
                <span>{tasksTxt(done.tasksReturned)}{done.shiftsClosed ? " Se cerró su turno abierto." : ""}</span>
                {done.remaining > 0 && <span className="muted">Conserva otros roles que gestiona el dueño.</span>}
              </>
            ) : done.changed ? (
              <>
                <b>Actualizaste el acceso de {first}.</b>
                <span>{tasksTxt(done.tasksReturned ?? 0)}{done.shiftsClosed ? " Se cerró su turno abierto en la sede que dejó." : ""}</span>
              </>
            ) : <b>No había nada para cambiar.</b>}
          </div>
          <div className="mfoot sa-foot"><button type="button" className="btn pri" onClick={onChanged}>Listo</button></div>
        </>
      )}
    </Modal>
  );
}
