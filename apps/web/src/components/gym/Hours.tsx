"use client";
// D170: horario habitual del profesor. Con él el turno empieza y termina solo; al entrar sin horario, la app lo pide.
import { useState } from "react";
import { WEEKDAYS, fmtWeeklyHours, weeklyHoursOk } from "@repi/domain";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { useAct, useLoad, type Shell } from "./shared";

export type HoursView = { hours: { locationId: string; location: string; days: number[]; from: string; to: string; text: string }[]; missing: boolean };
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // la semana empieza el lunes

/** Editor de días y franja de una sede. */
export function HoursModal({ shell, current, onClose }: { shell: Shell; current: HoursView["hours"]; onClose: (saved: boolean) => void }) {
  const locs = shell.ctx.locations;
  const [loc, setLoc] = useState(shell.loc ?? current[0]?.locationId ?? locs[0]?.id ?? "");
  const cur = current.find((h) => h.locationId === loc);
  const [days, setDays] = useState<number[]>(cur?.days ?? [1, 2, 3, 4, 5]);
  const [from, setFrom] = useState(cur?.from ?? "");
  const [to, setTo] = useState(cur?.to ?? "");
  const { busy, run } = useAct(shell.flash);
  const h = { days, from, to };
  const ok = weeklyHoursOk(h);
  const save = () => run("hours", () => api(`/api/gym/${shell.orgId}/hours`, { body: { locationId: loc, days, from, to } }), `Horario guardado: ${fmtWeeklyHours(h)}. Tu turno empieza y termina solo.`)
    .then((r) => { if (r) onClose(true); });
  return (
    <Modal label="Tu horario" onClose={() => onClose(false)}>
      <h2 style={{ margin: 0 }}>Tu horario en sala</h2>
      <p className="muted" style={{ margin: 0, lineHeight: 1.45 }}>Con tu horario, el turno empieza y termina solo: no hace falta «Iniciar turno». Si te vas antes, cerrá el turno con el traspaso; ese día no se vuelve a abrir.</p>
      {locs.length > 1 && (
        <label className="field">Sede
          <select value={loc} onChange={(e) => { const v = e.target.value; setLoc(v); const c = current.find((x) => x.locationId === v); if (c) { setDays(c.days); setFrom(c.from); setTo(c.to); } }}>
            {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      <div className="pills" role="group" aria-label="Días">
        {ORDER.map((d) => <button key={d} type="button" className="pill" aria-pressed={days.includes(d)} onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>{WEEKDAYS[d]}</button>)}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="field" style={{ flex: "1 1 120px" }}>Desde<input type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field" style={{ flex: "1 1 120px" }}>Hasta<input type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {ok && <span style={{ fontSize: 14, fontWeight: 600 }}>{fmtWeeklyHours(h)}</span>}
      <div className="mfoot">
        <button type="button" className="btn" onClick={() => onClose(false)}>Más tarde</button>
        <button type="button" className="btn pri" aria-busy={busy === "hours" || undefined} aria-disabled={!ok} onClick={() => (ok ? save() : shell.flash("Elegí los días y el horario (la hora de fin, después de la de inicio)."))}>Guardar horario</button>
      </div>
    </Modal>
  );
}

/** Avisa a «Mi turno» que el horario cambió. */
export const HOURS_EVENT = "repi:hours";

/**
 * Al entrar al panel: si trabaja en sala y no cargó su horario, se lo pide una vez por sesión del navegador. En la demo
 * guiada no aparece solo (taparía la guía): queda «Cargar horario» en Mi turno.
 */
export function HoursPrompt({ shell }: { shell: Shell }) {
  const demo = typeof document !== "undefined" && document.cookie.includes("repi_demo=");
  const v = useLoad<HoursView>(demo ? null : `/api/gym/${shell.orgId}/hours`);
  const key = `repi:hours-later:${shell.orgId}`;
  const [later, setLater] = useState(() => { try { return sessionStorage.getItem(key) === "1"; } catch { return false; } });
  if (!v.data?.missing || later) return null;
  return <HoursModal shell={shell} current={[]} onClose={(saved) => {
    if (saved) { v.reload(); window.dispatchEvent(new Event(HOURS_EVENT)); return; }
    try { sessionStorage.setItem(key, "1"); } catch { /* sin almacenamiento: vuelve a preguntar */ }
    setLater(true);
  }} />;
}
