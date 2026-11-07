"use client";
// Escena 03 · El entrenamiento cobra vida. La cámara baja al rack (toma «training») y el teléfono se acerca con la serie real
// de la app. Cinco pasos por scroll: el ejercicio, lo que hiciste la última vez, lo que REPI propone (con la razón), la serie
// que registrás y cómo se ajusta la próxima. Todos los números salen del motor real (@repi/domain/intelligence) con un
// ejemplo fijo, el mismo del simulador que sigue debajo para probarlo a mano.
import { useMemo, useRef, useState } from "react";
import { adjustAfterSet, recommendExercise, type HistRow } from "@repi/domain/intelligence";
import { gsap, PIN_MQ, STACK_MQ, useGSAP } from "./gsap";
import { Roll } from "./Roll";
import { IntelSim } from "../IntelSim";

const EX = { sets: 3, reps: "8-10", rir: 2, restSec: 120, detail: null };
const hist = (sid: string, at: string, reps: number[], w: number): HistRow[] =>
  reps.map((r, i) => ({ sessionId: sid, at, specId: `r${i}`, kind: "work", stage: 0, reps: "8-10", w, r, rir: 2, feel: null, source: "repi" }));
const kg = (n: number | null | undefined) => (n == null ? "—" : `${String(n).replace(".", ",")} kg`);

function useEngine() {
  return useMemo(() => {
    const now = new Date();
    const d = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    const base = recommendExercise({ ex: EX, now, history: [...hist("a", d(3), [10, 10, 10], 60), ...hist("b", d(7), [10, 9, 9], 60)] });
    const real = { w: base[0].weightKg, r: 6, feel: "dificil" as const };
    const after = adjustAfterSet({ ex: EX, targets: base, done: [{ index: 0, w: real.w, r: real.r, rir: 1, feel: real.feel }], justDone: 0 });
    return { base, real, after };
  }, []);
}

const STEPS = [
  { t: "Tu ejercicio de hoy.", d: "Press de banca, 3 series de 8 a 10 con RIR 2: lo que indicó el profe, en el teléfono." },
  { t: "Lo que hiciste la última vez.", d: "REPI compara la misma serie, del mismo tipo: hace tres días completaste las tres en el tope del rango." },
  { t: "Lo que REPI propone.", d: "Un objetivo concreto para esta serie, con la razón a la vista." },
  { t: "La serie que hiciste.", d: "Registrás carga y repeticiones con un toque y marcás cómo se sintió." },
  { t: "La próxima se ajusta.", d: "Si costó más de lo previsto, mantiene o baja. Nunca sube a mitad de la sesión." },
];

export function Training() {
  const root = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const { base, real, after } = useEngine();
  const t0 = base[0];
  const next = after.targets[1];
  useGSAP(() => {
    const mm = gsap.matchMedia();
    // Sin movimiento o con poco alto: todos los pasos a la vista (CSS los apila) y la serie completa.
    mm.add(STACK_MQ, () => { setStep(4); });
    mm.add(PIN_MQ, () => {
      setStep(0);
      const q = gsap.utils.selector(root);
      // En pantallas angostas el teléfono está arriba del título: entra sin bajar para no taparlo.
      const narrow = window.matchMedia("(max-width: 899px)").matches;
      gsap.timeline({
        scrollTrigger: {
          // La escena queda fija con position: sticky (CSS, sin saltos de diseño); acá sólo se recorre el tramo con scrub.
          trigger: q(".x3-train-track")[0], start: "top top", end: "bottom bottom", scrub: 0.6,
          onUpdate: (s) => setStep(Math.min(4, Math.floor(s.progress * 5.2))),
        },
      })
        .fromTo(q(".x3-phone"), narrow ? { rotateX: 24, rotateZ: -5, y: -24, scale: 0.84 } : { rotateX: 38, rotateZ: -8, y: 140, scale: 0.78 }, { rotateX: 8, rotateZ: -2, y: 0, scale: 1, ease: "power2.out", duration: 0.25 })
        .to(q(".x3-phone"), { rotateX: 0, rotateZ: 0, rotateY: -10, duration: 0.5, ease: "none" })
        .to(q(".x3-phone"), { rotateY: 0, scale: 1.04, duration: 0.25, ease: "power1.inOut" });
    });
    return () => mm.revert();
  }, { scope: root });

  const rec = t0.text || "—";
  return (
    <section ref={root} id="en-accion" className="x3-train" data-shot="training" aria-labelledby="cn-train">
      <div className="x3-train-track">
        <div className="x3-train-pin">
          <div className="x3-wrap x3-train-grid">
            <div className="x3-train-copy">
              <h2 id="cn-train" className="x3-h2">El entrenamiento <em>cobra vida.</em></h2>
              <ol className="x3-train-steps">
                {STEPS.map((s, i) => (
                  <li key={s.t} data-on={i === step ? "1" : i < step ? "done" : undefined} aria-current={i === step ? "step" : undefined}>
                    <b>{s.t}</b><span>{i === 2 ? <>{s.d} <i>«{t0.why}»</i></> : i === 4 && after.event?.text ? <>{s.d} <i>«{after.event.text}»</i></> : s.d}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="x3-phone-stage" aria-hidden={false}>
              <figure className="x3-phone" data-step={step}>
                <div className="x3-phone-screen">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={step < 2 ? "/conoce/shots/training.webp" : "/conoce/shots/intelligence.webp"} alt={step < 2 ? "La sesión de entrenamiento en REPI" : "La serie con Anterior, REPI recomienda y Real en REPI"} width={390} height={844} loading="lazy" decoding="async" />
                </div>
                <figcaption className="x3-set" aria-live="polite">
                  <span className="x3-set-ex">Press de banca · Serie 1</span>
                  <span className="x3-set-cols">
                    <span data-on={step >= 1 ? "1" : undefined}><small>Anterior</small><Roll value={step >= 1 && t0.prev ? `${kg(t0.prev.w)} × ${t0.prev.r}` : "—"} /></span>
                    <span data-on={step >= 2 ? "1" : undefined} className="rec"><small>REPI recomienda</small><Roll value={step >= 2 ? rec : "—"} /></span>
                    <span data-on={step >= 3 ? "1" : undefined}><small>Real</small><Roll value={step >= 3 ? `${kg(real.w)} × ${real.r}` : "—"} /></span>
                  </span>
                  <span className="x3-set-next" data-on={step >= 4 ? "1" : undefined}>Serie 2 · <Roll value={step >= 4 ? next?.text || "—" : "—"} /></span>
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </div>
      <div className="x3-wrap x3-train-try">
        <h3>Probalo vos, con el motor real.</h3>
        <IntelSim />
      </div>
    </section>
  );
}
