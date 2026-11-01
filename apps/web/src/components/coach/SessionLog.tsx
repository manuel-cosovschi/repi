"use client";
// D178: lo que anotó cada alumno o socio en sus sesiones, serie por serie (peso × repeticiones o segundos, RIR, sensación y
// nota), con la comparación contra la vez anterior que hizo ese ejercicio. Lo usan el coach (ficha del alumno) y el equipo
// de sala (ficha del socio que compartió su entrenamiento).
import { useState, type ReactNode } from "react";
import { SET_FEEL, formatClock, isSetFeel } from "@repi/domain";
import { fmtDate, nf } from "./types";

export type LoggedSet = { n: number; weightKg: number | null; reps: number | null; rir: number | null; feel: string | null; note: string | null };
export type LoggedExercise = { exercise: string; timed: boolean; sets: LoggedSet[] };
export type LoggedSession = { id: string; dayName: string; status: string; startedAt: string; endedAt: string | null; rpe: number | null; note: string | null; exercises: LoggedExercise[] };

const best = (e: LoggedExercise) => e.sets.reduce<LoggedSet | null>((b, s) => {
  if (e.timed) return (s.reps ?? 0) > (b?.reps ?? -1) ? s : b;
  const w = s.weightKg ?? 0, bw = b?.weightKg ?? -1;
  return w > bw || (w === bw && (s.reps ?? 0) > (b?.reps ?? 0)) ? s : b;
}, null);

/** Mejor serie contra la mejor de la última vez que hizo el mismo ejercicio (sesiones más nuevas primero). */
function trend(sessions: LoggedSession[], i: number, e: LoggedExercise): { text: string; tone: "ok" | "warn" | "mute" } | null {
  const prev = sessions.slice(i + 1).map((s) => s.exercises.find((x) => x.exercise === e.exercise)).find(Boolean);
  const a = best(e), b = prev && best(prev);
  if (!a || !b) return null;
  if (e.timed) {
    const d = (a.reps ?? 0) - (b.reps ?? 0);
    return d ? { text: `${d > 0 ? "+" : ""}${d} s vs. la vez anterior`, tone: d > 0 ? "ok" : "warn" } : { text: "Igual que la vez anterior", tone: "mute" };
  }
  const dw = (a.weightKg ?? 0) - (b.weightKg ?? 0), dr = (a.reps ?? 0) - (b.reps ?? 0);
  if (dw) return { text: `${dw > 0 ? "+" : ""}${nf(dw)} kg vs. la vez anterior`, tone: dw > 0 ? "ok" : "warn" };
  if (dr) return { text: `${dr > 0 ? "+" : ""}${dr} rep. con el mismo peso`, tone: dr > 0 ? "ok" : "warn" };
  return { text: "Igual que la vez anterior", tone: "mute" };
}

export const setText = (s: LoggedSet, timed: boolean) => {
  const amount = timed ? `${s.reps ?? "—"} s` : `${s.reps ?? "—"} rep.`;
  return s.weightKg != null && s.weightKg > 0 ? `${nf(s.weightKg)} kg × ${amount}` : timed ? amount : `${amount} sin carga`;
};

/** Ejercicios y series de una sesión. */
export function LoggedSets({ sessions, i }: { sessions: LoggedSession[]; i: number }) {
  const s = sessions[i];
  if (!s.exercises.length) return <span className="muted slog-empty">No anotó series en esta sesión.</span>;
  return (
    <div className="slog-ex">
      {s.exercises.map((e, k) => {
        const t = trend(sessions, i, e);
        return (
          <div key={k} className="slog-item">
            <div className="slog-name"><b>{e.exercise}</b>{t && <span className={`chip ${t.tone}`}>{t.text}</span>}</div>
            <ol>
              {e.sets.map((x) => (
                <li key={x.n}>
                  <span className="slog-n">{x.n}</span>
                  <span className="slog-v">{setText(x, e.timed)}</span>
                  {x.rir != null && <span className="muted">RIR {x.rir}</span>}
                  {x.feel && isSetFeel(x.feel) && <span className={`chip ${x.feel === "molestia" || x.feel === "ayuda" ? "bad" : "mute"}`}>{SET_FEEL[x.feel]}</span>}
                  {x.note && <span className="slog-note">“{x.note}”</span>}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

const summary = (s: LoggedSession) => {
  const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
  const vol = s.exercises.reduce((v, e) => v + (e.timed ? 0 : e.sets.reduce((a, x) => a + (x.weightKg ?? 0) * (x.reps ?? 0), 0)), 0);
  const dur = s.endedAt ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000) : 0;
  return [dur > 0 ? formatClock(dur) : null, `${sets} serie${sets === 1 ? "" : "s"}`, vol ? `${nf(Math.round(vol))} kg` : null].filter(Boolean).join(" · ");
};

/**
 * Lista de sesiones con su detalle desplegable; la más reciente abierta. `line` reemplaza el resumen de la fila y
 * `extra` agrega renglones propios de cada panel (cambios de ejercicio, por ejemplo).
 */
export function SessionLog<T extends LoggedSession>({ sessions, line, extra }: { sessions: T[]; line?: (s: T) => ReactNode; extra?: (s: T) => ReactNode }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(sessions[0] ? [sessions[0].id] : []));
  const flip = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="table">
      {sessions.map((s, i) => {
        const on = open.has(s.id);
        return (
          <div key={s.id} className="trow slog">
            <span style={{ flex: "0 0 90px" }} className="muted">{fmtDate(s.endedAt ?? s.startedAt, { weekday: "short", day: "numeric", month: "short" })}</span>
            <b style={{ flex: "1 1 120px" }}>{s.dayName}</b>
            <span style={{ flex: "0 0 auto" }}>{s.status === "completed" ? (line ? line(s) : summary(s)) : <span className="chip info">En curso</span>}</span>
            {s.rpe != null && <span className="chip mute">RPE {s.rpe}</span>}
            <button type="button" className="slog-toggle" aria-expanded={on} onClick={() => flip(s.id)}>{on ? "Ocultar series" : "Ver series"}</button>
            {s.note && <span style={{ flexBasis: "100%", fontSize: 13, color: "#334155" }}>“{s.note}”</span>}
            {extra?.(s)}
            {on && <LoggedSets sessions={sessions} i={i} />}
          </div>
        );
      })}
    </div>
  );
}
