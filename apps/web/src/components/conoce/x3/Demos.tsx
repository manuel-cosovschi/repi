"use client";
// Escena 06 · «No te lo contamos. Probalo.» Una puerta grande por demo (cuatro roles y la pantalla de REPI Control): la elegida se abre y muestra qué se va a
// explorar (con una pantalla real) y el botón inicia la demo real (POST /api/demo). En escritorio se abre al pasar o enfocar;
// en el teléfono, con un toque. Nada se simula: si la demo falla, DemoButton lo dice y ofrece WhatsApp.
// Motion 2 (P7): las puertas tienen tamaño fijo (abrir una no empuja a las vecinas: sin reflujo ni CLS); el cuerpo se revela
// con un barrido y la captura sube; con puntero fino la puerta abierta se inclina apenas hacia el cursor. «PROBALO.» entra de
// golpe al final de la entrada del título.
import { useRef, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { DEMOS } from "@/content/conoce";
import { DemoButton } from "../DemoButton";
import { Say } from "./Say";

export function Demos() {
  const [open, setOpen] = useState(0);
  const raf = useRef(0);
  /** Inclinación hacia el cursor (≤ 3°), sólo con puntero fino y con movimiento; un cuadro por movimiento. */
  const tilt = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || document.documentElement.dataset.motion === "paused" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = e.currentTarget, r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => { el.style.transform = `perspective(1200px) rotateY(${(x * 6).toFixed(2)}deg) rotateX(${(-y * 6).toFixed(2)}deg)`; });
  };
  const untilt = (e: React.PointerEvent<HTMLElement>) => { cancelAnimationFrame(raf.current); e.currentTarget.style.transform = ""; };
  return (
    <section id="demos" className="x3-dm" data-dim="0.5" data-shot="aliados" aria-labelledby="cn-dm">
      <div className="x3-wrap">
        <Say id="cn-dm" className="x3-h2 big" text="No te lo contamos. *Probalo.*" snap />
        <p className="x3-lead">Demos guiadas sobre la app real, con un gimnasio y un coach ficticios. Sin cuenta, desde tu teléfono.</p>
        <div className="x3-doors">
          {DEMOS.map((d, i) => (
            <article key={d.role} className="x3-door" data-open={i === open ? "1" : undefined} onMouseEnter={() => setOpen(i)} onFocus={() => setOpen(i)} onPointerMove={tilt} onPointerLeave={untilt} aria-labelledby={`dm-${d.role}`}>
              <button type="button" className="x3-door-tab" aria-expanded={i === open} aria-controls={`dm-b-${d.role}`} onClick={() => setOpen(i)}>
                <span id={`dm-${d.role}`}>{d.title}</span><small>{d.steps ? `${d.steps} pasos guiados` : "Sin guía: explorala libre"}</small>
              </button>
              <div className="x3-door-body" id={`dm-b-${d.role}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.shot} alt="" loading="lazy" decoding="async" width={390} height={844} />
                <div>
                  <p className="x3-door-who">Sos {d.persona}.</p>
                  <ul>{d.sees.map((s) => <li key={s}><CheckCircle size={18} weight="bold" aria-hidden="true" />{s}</li>)}</ul>
                  <p className="x3-fine">Para: {d.forWho}</p>
                  <DemoButton role={d.role} label="Iniciar esta demo" className="x3-btn pri" target={`demo-${d.role}`} />
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="x3-fine center">Datos ficticios que se borran a las 6 horas. Nada afecta a gimnasios ni personas reales. La demo abre su propia sesión en este navegador: si ya usás REPI, volvé a ingresar después.</p>
      </div>
    </section>
  );
}
