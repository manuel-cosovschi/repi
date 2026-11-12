"use client";
// Control propio de la serie en curso (D148). Series por tiempo: cronómetro con el objetivo, aviso al llegar (vibración y un
// pitido corto) y «Listo» guarda los segundos hechos. AMRAP o al fallo: botón grande que cuenta cada repetición con un toque.
// Lo que se guarda es lo mismo que con los botones − y + (segundos o repeticiones): el registro y la sincronización no cambian.
// Ejercicios por tiempo (07/11/2026): `ActivityTimer`, cronómetro compacto de una actividad (cinta, bici, remo…) con el objetivo
// en minutos; «Listo» deja el tiempo hecho como duración real, que la persona puede corregir antes de completar.
import { useEffect, useRef, useState } from "react";
import { fmtSeconds, formatClock } from "@repi/domain";

type Ctl = { mode: "time"; seconds: number } | { mode: "amrap" } | { mode: "amrap_time"; seconds: number; unit: "reps" | "rounds" };

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx(), o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.25); o.onended = () => void ac.close();
  } catch { /* sin audio */ }
}

export function SetControl({ ctl, onSet }: { ctl: Ctl; onSet: (r: number) => void }) {
  if (ctl.mode === "amrap_time") return <AmrapTimeSet seconds={ctl.seconds} unit={ctl.unit} onSet={onSet} />;
  return ctl.mode === "time" ? <TimeSet target={ctl.seconds} onSet={onSet} /> : <AmrapSet onSet={onSet} />;
}

/**
 * D183: AMRAP por tiempo («AMRAP 10 min»): cuenta regresiva con la duración programada (aviso al terminar) y un contador de
 * rondas o repeticiones. Lo que se guarda es el total contado; la duración sale del plan (no se multiplica por kilos).
 */
function AmrapTimeSet({ seconds, unit, onSet }: { seconds: number; unit: "reps" | "rounds"; onSet: (r: number) => void }) {
  const [since, setSince] = useState<number | null>(null);
  const [acc, setAcc] = useState(0);
  const [n, setN] = useState(0);
  const [, tick] = useState(0);
  const warned = useRef(false);
  const elapsed = acc + (since ? (Date.now() - since) / 1000 : 0);
  const left = Math.max(0, Math.ceil(seconds - elapsed));
  useEffect(() => { if (since == null) return; const t = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(t); }, [since]);
  useEffect(() => { if (since != null && !warned.current && left <= 0) { warned.current = true; setAcc(seconds); setSince(null); navigator.vibrate?.([200, 100, 200]); beep(); } });
  const put = (v: number) => { const x = Math.max(0, v); setN(x); onSet(x); navigator.vibrate?.(15); };
  const word = unit === "rounds" ? ["ronda", "rondas"] : ["repetición", "repeticiones"];
  return (
    <div className="set-ctl" role="group" aria-label={`AMRAP de ${formatClock(seconds)}: contador de ${word[1]}`}>
      <div className="set-ctl-clock" aria-live="off"><strong>{formatClock(left)}</strong><small>{left ? `AMRAP ${formatClock(seconds)} · quedan` : "Tiempo cumplido"}</small></div>
      <div className="set-ctl-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, elapsed / Math.max(1, seconds))})` }} /></div>
      <button type="button" className="set-ctl-tap" onClick={() => put(n + 1)} aria-label={`Sumar una ${word[0]}. Van ${n}`}>
        <strong>{n}</strong><small>{`Tocá al terminar cada ${word[0]}`}</small>
      </button>
      <div className="set-ctl-act">
        {left > 0 && (since == null
          ? <button type="button" className="cta sm" onClick={() => setSince(Date.now())}>{acc ? "Seguir" : "Empezar"}</button>
          : <button type="button" className="ghost sm" onClick={() => { setAcc(elapsed); setSince(null); }}>Pausar</button>)}
        <button type="button" className="ghost sm" disabled={!n} onClick={() => put(n - 1)}>−1</button>
      </div>
    </div>
  );
}

function TimeSet({ target, onSet }: { target: number; onSet: (r: number) => void }) {
  // Por hora del dispositivo (no por ticks): sigue bien aunque la pantalla se apague un momento.
  const [acc, setAcc] = useState(0);
  const [since, setSince] = useState<number | null>(null);
  const [, tick] = useState(0);
  const warned = useRef(false);
  const elapsed = acc + (since ? (Date.now() - since) / 1000 : 0);
  useEffect(() => {
    if (since == null) return;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [since]);
  useEffect(() => {
    if (since != null && !warned.current && elapsed >= target) { warned.current = true; navigator.vibrate?.([200, 100, 200]); beep(); }
  });
  const sec = Math.floor(elapsed);
  const stop = () => { setAcc(elapsed); setSince(null); };
  const reset = () => { setAcc(0); setSince(null); warned.current = false; };
  return (
    <div className="set-ctl" role="group" aria-label="Cronómetro de la serie">
      <div className="set-ctl-clock" aria-live="off"><strong>{formatClock(sec)}</strong><small>Objetivo {fmtSeconds(target)}{sec >= target ? " · cumplido" : ""}</small></div>
      <div className="set-ctl-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, elapsed / Math.max(1, target))})` }} /></div>
      <div className="set-ctl-act">
        {since == null
          ? <button type="button" className="cta sm" onClick={() => setSince(Date.now())}>{acc ? "Seguir" : "Empezar"}</button>
          : <button type="button" className="ghost sm" onClick={stop}>Pausar</button>}
        <button type="button" className="ghost sm" disabled={!sec} onClick={() => { stop(); onSet(sec); }}>Listo: {sec < 60 ? `${sec} s` : formatClock(sec)}</button>
        {(acc > 0 || since != null) && <button type="button" className="linkbtn" onClick={reset}>Reiniciar</button>}
      </div>
    </div>
  );
}

function AmrapSet({ onSet }: { onSet: (r: number) => void }) {
  const [n, setN] = useState(0);
  const put = (v: number) => { const x = Math.max(0, v); setN(x); onSet(x); navigator.vibrate?.(15); };
  return (
    <div className="set-ctl" role="group" aria-label="Contador de repeticiones">
      <button type="button" className="set-ctl-tap" onClick={() => put(n + 1)} aria-label={`Sumar una repetición. Van ${n}`}>
        <strong>{n}</strong><small>{n ? "Tocá en cada repetición" : "Tocá en cada repetición que hagas"}</small>
      </button>
      <div className="set-ctl-act">
        <button type="button" className="ghost sm" disabled={!n} onClick={() => put(n - 1)}>−1</button>
        {n > 0 && <button type="button" className="linkbtn" onClick={() => put(0)}>Volver a 0</button>}
      </div>
    </div>
  );
}

/** Cronómetro de una actividad guardado en este teléfono: tiempo acumulado, desde cuándo corre (hora del dispositivo) y cuándo cambió. */
type TimerState = { acc: number; since: number | null; at: number };
const TIMER_PREFIX = "repi_acttimer:"; // «repi_»: se borra con los datos locales al cambiar de cuenta (wipeLocal)
const TIMER_TTL = 12 * 3600_000;
function readTimer(key: string | undefined): TimerState | null {
  if (!key) return null;
  try {
    // Limpieza de cronómetros viejos (otra sesión, un día anterior).
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(TIMER_PREFIX) || k === TIMER_PREFIX + key) continue;
      const t = JSON.parse(localStorage.getItem(k) ?? "null") as TimerState | null;
      if (!t || Date.now() - t.at > TIMER_TTL) localStorage.removeItem(k);
    }
    const t = JSON.parse(localStorage.getItem(TIMER_PREFIX + key) ?? "null") as TimerState | null;
    return t && Date.now() - t.at < TIMER_TTL && Number.isFinite(t.acc) ? t : null;
  } catch { return null; }
}
function writeTimer(key: string | undefined, t: TimerState | null) {
  if (!key) return;
  try { if (t && (t.acc > 0 || t.since != null)) localStorage.setItem(TIMER_PREFIX + key, JSON.stringify(t)); else localStorage.removeItem(TIMER_PREFIX + key); } catch { /* sin almacenamiento */ }
}

/**
 * Ejercicios por tiempo: cronómetro de una actividad. Cuenta desde 0 con el objetivo a la vista («de 10:00»), avisa al llegar
 * (vibración y pitido) y sigue contando si la persona sigue. Por hora del dispositivo, como el de las series por tiempo.
 * Sin objetivo (un remo indicado por distancia) es un cronómetro común. Nunca registra solo: «Listo» carga la duración.
 * `storeKey` (sesión, ejercicio y serie): el cronómetro se guarda en el teléfono y sigue corriendo aunque la persona vaya a ver
 * otro ejercicio, toque otra serie, pause o recargue la app (antes volvía a 00:00 y se perdían los minutos de cinta).
 */
export function ActivityTimer({ target, onSet, storeKey }: { target: number | null; onSet: (sec: number) => void; storeKey?: string }) {
  const [saved] = useState(() => readTimer(storeKey));
  const [acc, setAccState] = useState(saved?.acc ?? 0);
  const [since, setSinceState] = useState<number | null>(saved?.since ?? null);
  const [, tick] = useState(0);
  const elapsed = acc + (since ? (Date.now() - since) / 1000 : 0);
  const warned = useRef(!!target && elapsed >= target); // si ya se había cumplido, no vuelve a sonar al volver
  const setAcc = (v: number) => { setAccState(v); writeTimer(storeKey, { acc: v, since: null, at: Date.now() }); };
  const setSince = (v: number | null) => { setSinceState(v); writeTimer(storeKey, { acc, since: v, at: Date.now() }); };
  useEffect(() => {
    if (since == null) return;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [since]);
  useEffect(() => {
    if (target && since != null && !warned.current && elapsed >= target) { warned.current = true; navigator.vibrate?.([200, 100, 200]); beep(); }
  });
  const sec = Math.floor(elapsed);
  const stop = () => { setSinceState(null); setAcc(elapsed); };
  const reset = () => { setSinceState(null); setAcc(0); warned.current = false; };
  return (
    <div className="act-timer" role="group" aria-label="Cronómetro de la actividad">
      <div className="act-timer-row">
        <span className="act-clock" aria-live="off"><strong>{formatClock(sec)}</strong>
          <small>{target ? `de ${formatClock(target)}${sec >= target ? " · cumplido" : ""}` : "Cronómetro"}</small></span>
        {since == null
          ? <button type="button" className="cta sm" onClick={() => setSince(Date.now())}>{acc ? "Seguir" : "Empezar"}</button>
          : <button type="button" className="ghost sm" onClick={stop}>Pausar</button>}
        <button type="button" className="ghost sm" disabled={!sec} aria-label={sec ? `Listo: usar ${fmtSeconds(sec)} como duración` : "Listo"}
          onClick={() => { stop(); onSet(sec); }}>Listo</button>
      </div>
      {target ? <div className="set-ctl-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, elapsed / Math.max(1, target))})` }} /></div> : null}
      {(acc > 0 || since != null) && <button type="button" className="linkbtn act-reset" onClick={reset}>Reiniciar cronómetro</button>}
    </div>
  );
}
