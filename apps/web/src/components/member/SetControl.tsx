"use client";
// Control propio de la serie en curso (D148). Series por tiempo: cronómetro con el objetivo, aviso al llegar (vibración y un
// pitido corto) y «Listo» guarda los segundos hechos. AMRAP o al fallo: botón grande que cuenta cada repetición con un toque.
// Lo que se guarda es lo mismo que con los botones − y + (segundos o repeticiones): el registro y la sincronización no cambian.
import { useEffect, useRef, useState } from "react";
import { formatClock } from "@repi/domain";

type Ctl = { mode: "time"; seconds: number } | { mode: "amrap" };

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
  return ctl.mode === "time" ? <TimeSet target={ctl.seconds} onSet={onSet} /> : <AmrapSet onSet={onSet} />;
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
      <div className="set-ctl-clock" aria-live="off"><strong>{formatClock(sec)}</strong><small>Objetivo {target} s{sec >= target ? " · cumplido" : ""}</small></div>
      <div className="set-ctl-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, elapsed / Math.max(1, target))})` }} /></div>
      <div className="set-ctl-act">
        {since == null
          ? <button type="button" className="cta sm" onClick={() => setSince(Date.now())}>{acc ? "Seguir" : "Empezar"}</button>
          : <button type="button" className="ghost sm" onClick={stop}>Pausar</button>}
        <button type="button" className="ghost sm" disabled={!sec} onClick={() => { stop(); onSet(sec); }}>Listo: {sec} s</button>
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
