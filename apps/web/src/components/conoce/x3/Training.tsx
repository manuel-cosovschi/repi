"use client";
// Escena 03 · «La serie, en grande y con datos reales» (Motion 2 P3). La serie de Valentina contada como un subtítulo enorme:
// el ejercicio, lo que hizo la última vez, lo que REPI recomienda (con la razón del motor), la serie que hizo (las repeticiones
// cuentan de 1 a 6 con el scroll) y cómo se ajusta la siguiente. Todos los números salen del motor real
// (@repi/domain/intelligence) con un ejemplo fijo, el mismo del simulador de abajo. El teléfono muestra interfaz real: recortes
// de la captura de la sesión sin ningún número y el TargetCard real de la app alimentado por el mismo motor, así lo que dice el
// subtítulo y lo que muestra la pantalla es siempre lo mismo. Fijada con sticky; sólo cambia el estado al cambiar de paso o de
// repetición. El teléfono y el subtítulo entran mientras el título todavía sale (ningún cuadro queda sólo con la sala).
// Movimiento reducido o pantalla baja: tabla quieta con los valores.
import { useEffect, useRef, useState } from "react";
import { targetLine } from "@/components/member/TargetCard";
import { stage } from "../sala/store";
import { gsap, PIN_MQ, ScrollTrigger, STACK_MQ, useGSAP } from "./gsap";
import { Roll } from "./Roll";
import { Say } from "./Say";
import { IntelSim } from "../IntelSim";
import { EngineScreen, kg, useEngine } from "./EngineScreen";

/** Tramo de cada paso en el progreso de la escena (y el conteo de repeticiones del paso 4). */
const AT = [0, 0.16, 0.32, 0.5, 0.76];
const REPS = [0.52, 0.72];

export function Training() {
  const root = useRef<HTMLElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [rep, setRep] = useState(0);
  const engine = useEngine();
  const { base, real, after } = engine;
  const t0 = base[0], next = after.targets[1];
  // Los objetivos se escriben con la misma función que la tarjeta de la app: el subtítulo y la pantalla dicen siempre lo mismo.
  const rec = targetLine(t0, "kg") || "—", rec2 = next ? targetLine(next, "kg") || "—" : "—";
  const prev = t0.prev ? `${kg(t0.prev.w)} × ${t0.prev.r}` : "—";
  const reps = step > 3 ? real.r : Math.max(1, rep);
  const STEPS = [
    { k: "Tu ejercicio de hoy", v: "Press de banca", d: "3 series de 8 a 10 con RIR 2: lo que indicó el profe, en el teléfono." },
    { k: "Lo que hiciste la última vez", v: prev, d: "REPI compara la misma serie: hace tres días completaste las tres en el tope del rango." },
    { k: "REPI recomienda", v: rec, d: t0.why ?? "" },
    { k: "La serie que hiciste", v: `${kg(real.w)} × ${reps}`, d: "Registrás carga y repeticiones con un toque y marcás cómo se sintió: costó más de lo previsto." },
    { k: "La próxima se ajusta · Serie 2", v: rec2, d: after.event?.text ?? "" },
  ];
  useGSAP(() => {
    const mm = gsap.matchMedia();
    // Sin movimiento o con poco alto: la tabla quieta y la pantalla en su estado final.
    mm.add(STACK_MQ, () => { setStep(4); setRep(real.r); });
    mm.add(PIN_MQ, () => {
      setStep(0); setRep(0);
      const q = gsap.utils.selector(root);
      const track = q(".x3-train-track")[0] as HTMLElement;
      let last = "";
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          // La escena queda fija con position: sticky (CSS, sin saltos de diseño); acá sólo se recorre el tramo con scrub.
          trigger: track, start: "top top", end: "bottom bottom", scrub: 0.6,
          onUpdate: (s) => {
            const p = s.progress;
            const st = AT.reduce((a, v, i) => (p >= v ? i : a), 0);
            const r = st === 3 ? Math.min(real.r, 1 + Math.floor(Math.max(0, (p - REPS[0]) / (REPS[1] - REPS[0])) * real.r)) : st > 3 ? real.r : 0;
            const key = `${st}|${r}`;
            if (key !== last) { last = key; setStep(st); setRep(r); }
          },
        },
      });
      // El teléfono y el subtítulo entran mientras el título «cobra vida» todavía está a la vista (desde que el tramo asoma
      // abajo hasta que se fija): nunca queda un cuadro sólo con la sala. Después el teléfono gira apenas con el scroll (±6°)
      // y flota solo (CSS, se pausa).
      const entry = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: track, start: "top 75%", end: "top top", scrub: 0.6 } })
        .fromTo(q(".x3-phone"), { yPercent: 18, rotateX: 18, opacity: 0 }, { yPercent: 0, rotateX: 0, opacity: 1, duration: 0.7, ease: "power2.out" }, 0.1)
        .fromTo(q(".x3-train-say"), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.25);
      tl.fromTo(q(".x3-phone"), { rotateY: -6 }, { rotateY: 6, duration: 1 }, 0);
      // La sala, con el velo frío a .5 mientras se cuenta la serie (el teléfono y los números al frente).
      const veil = ScrollTrigger.create({ trigger: track, start: "top 40%", end: "bottom 60%", onToggle: (s) => stage.set({ tone: s.isActive ? 0.5 : 0 }) });
      return () => { veil.kill(); entry.scrollTrigger?.kill(); entry.kill(); stage.set({ tone: 0 }); };
    });
    return () => mm.revert();
  }, { scope: root });
  // Cada repetición registrada: un pulso corto del teléfono (1 %).
  useEffect(() => {
    if (!rep || !phone.current || step !== 3) return;
    const tw = gsap.fromTo(phone.current, { scale: 1.012 }, { scale: 1, duration: 0.28, ease: "power2.out" });
    return () => { tw.kill(); };
  }, [rep, step]);

  const cur = STEPS[step];
  return (
    <section ref={root} id="en-accion" className="x3-train" data-shot="training" aria-labelledby="cn-train">
      <div className="x3-wrap"><Say id="cn-train" className="x3-h2" text="El entrenamiento *cobra vida.*" /></div>
      <div className="x3-train-track">
        <div className="x3-train-pin">
          <div className="x3-wrap x3-train-grid">
            {/* Lo que leen los lectores de pantalla: los cinco pasos con sus valores; el paso actual marcado. */}
            <ol className="x3-sr">
              {STEPS.map((s, i) => <li key={s.k} aria-current={i === step ? "step" : undefined}>{s.k}: {i === 3 ? `${kg(real.w)} × ${real.r}` : s.v}. {s.d}</li>)}
            </ol>
            <div className="x3-train-say" aria-hidden="true" data-step={step}>
              <p className="x3-train-k"><Roll value={cur.k} /></p>
              <p className="x3-train-v" data-tone={step === 2 ? "rec" : step === 4 ? "next" : undefined}><Roll value={cur.v} /></p>
              <p className="x3-train-d" key={step}>{cur.d}</p>
              <ol className="x3-train-marks">{STEPS.map((s, i) => <li key={s.k} data-on={i === step ? "1" : i < step ? "done" : undefined} />)}</ol>
            </div>
            <div className="x3-phone-stage" aria-hidden="true">
              <div className="x3-phone">
                <div ref={phone} className="x3-phone-float">
                  <EngineScreen engine={engine} step={step} reps={reps} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Movimiento reducido o pantalla baja: los cuatro valores, quietos, con la razón y el evento del motor. */}
      <div className="x3-wrap x3-train-table" aria-hidden="true">
        <dl>
          <div><dt>Anterior</dt><dd>{prev}</dd></div>
          <div className="rec"><dt>REPI recomienda</dt><dd>{rec}</dd></div>
          <div><dt>Real</dt><dd>{kg(real.w)} × {real.r}</dd></div>
          <div className="next"><dt>Serie 2</dt><dd>{rec2}</dd></div>
        </dl>
        <p>{t0.why}</p>
        {after.event?.text && <p>{after.event.text}</p>}
      </div>
      <div className="x3-wrap x3-train-try">
        <h3>Probalo vos, con el motor real.</h3>
        <IntelSim />
      </div>
    </section>
  );
}
