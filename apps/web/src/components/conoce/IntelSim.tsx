"use client";
// Simulador de Training Intelligence en /conoce (D205). Corre el MISMO motor que la app (packages/domain/intelligence.ts,
// recommendExercise + adjustAfterSet) sobre un ejemplo fijo: no hay textos inventados para la página. Lo que cambia es sólo
// la serie que la persona elige registrar.
import { useMemo, useState } from "react";
import { adjustAfterSet, recommendExercise, type HistRow, type RowTarget } from "@repi/domain/intelligence";
import { SET_FEEL, type SetFeel } from "@repi/domain/commercial";
import { track } from "@/lib/site-track";

const EX = { sets: 3, reps: "8-10", rir: 2, restSec: 120, detail: null };
const hist = (sid: string, at: string, reps: number[], w: number): HistRow[] =>
  reps.map((r, i) => ({ sessionId: sid, at, specId: `r${i}`, kind: "work", stage: 0, reps: "8-10", w, r, rir: 2, feel: null, source: "repi" }));
const FEELS: SetFeel[] = ["facil", "bien", "dificil", "limite", "molestia"];
const RIR_OF: Record<string, number> = { facil: 4, bien: 2, dificil: 1, limite: 0, molestia: 2 };
const kg = (n: number | null) => (n == null ? "—" : `${String(n).replace(".", ",")} kg`);

export function IntelSim() {
  // Referencia: la sesión anterior completó 60 kg × 10, 10, 10 (fecha relativa a hoy para que el ejemplo nunca «venza»).
  const base = useMemo(() => {
    const now = new Date();
    const d = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    return recommendExercise({ ex: EX, now, history: [...hist("a", d(3), [10, 10, 10], 60), ...hist("b", d(7), [10, 9, 9], 60)] });
  }, []);
  const [reps, setReps] = useState(8);
  const [feel, setFeel] = useState<SetFeel>("bien");
  const [result, setResult] = useState<{ targets: RowTarget[]; text: string | null; changed: number[]; reps: number; feel: SetFeel } | null>(null);

  const log = () => {
    const r = adjustAfterSet({ ex: EX, targets: base, done: [{ index: 0, w: base[0].weightKg, r: reps, rir: RIR_OF[feel], feel }], justDone: 0 });
    setResult({ targets: r.targets, text: r.event?.text ?? null, changed: r.changed, reps, feel });
    track("intel_try", { target: r.event?.code ?? "none" });
  };
  const rows = result?.targets ?? base;
  const t0 = base[0];

  return (
    <div className="cn-sim" aria-labelledby="cn-sim-t">
      <div className="cn-sim-head">
        <h3 id="cn-sim-t">Press de banca · 3 × 8–10 · RIR 2</h3>
        <p className="cn-sim-why"><b>Por qué {t0.text}:</b> {t0.why}</p>
      </div>
      <div className="cn-sim-table" role="table" aria-label="Series del ejercicio">
        <div role="row" className="cn-sim-row hd"><span role="columnheader">Serie</span><span role="columnheader">Anterior</span><span role="columnheader">REPI recomienda</span><span role="columnheader">Real</span></div>
        {rows.map((t, i) => (
          <div role="row" key={i} className={`cn-sim-row${result?.changed.includes(i) ? " changed" : ""}`}>
            <span role="cell">{i + 1}</span>
            <span role="cell">{t.prev ? `${kg(t.prev.w)} × ${t.prev.r}` : "—"}</span>
            <span role="cell" className="rec">{t.text || "—"}{result?.changed.includes(i) && <small> ajustada</small>}</span>
            <span role="cell">{i === 0 && result ? `${kg(t0.weightKg)} × ${result.reps}` : "—"}</span>
          </div>
        ))}
      </div>
      <fieldset className="cn-sim-in">
        <legend>Registrá la serie 1 con {kg(t0.weightKg)}</legend>
        <div className="cn-stepper">
          <span id="cn-reps-l">Repeticiones</span>
          <button type="button" aria-label="Una repetición menos" onClick={() => setReps((x) => Math.max(1, x - 1))}>−</button>
          <output aria-labelledby="cn-reps-l" aria-live="polite">{reps}</output>
          <button type="button" aria-label="Una repetición más" onClick={() => setReps((x) => Math.min(15, x + 1))}>+</button>
        </div>
        <div className="cn-feel" role="radiogroup" aria-label="¿Cómo se sintió?">
          {FEELS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={feel === f} className={feel === f ? "on" : ""} onClick={() => setFeel(f)}>{SET_FEEL[f]}</button>
          ))}
        </div>
        <button type="button" className="cn-btn pri" onClick={log}>Registrar serie</button>
      </fieldset>
      <div className="cn-sim-out" aria-live="polite">
        {result && (
          <p className={result.feel === "molestia" ? "warn" : ""}>
            {result.text ? <><b>REPI te dice:</b> {result.text}</> : <><b>Sin cambios.</b> La serie salió dentro de lo previsto: las próximas mantienen su objetivo.</>}
          </p>
        )}
      </div>
      <p className="cn-fine">Ejemplo con una sesión anterior de 60 kg × 10, 10, 10. Son reglas conservadoras con explicación, no una indicación médica. En la app, tu profe puede fijar la carga y REPI la respeta.</p>
    </div>
  );
}
