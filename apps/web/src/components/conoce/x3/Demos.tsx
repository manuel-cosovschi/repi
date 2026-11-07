"use client";
// Escena 06 · «No te lo contamos. Probalo.» Cuatro puertas grandes, una por rol: la elegida se abre y muestra qué se va a
// explorar (con una pantalla real) y el botón inicia la demo real (POST /api/demo). En escritorio se abre al pasar o enfocar;
// en el teléfono, con un toque. Nada se simula: si la demo falla, DemoButton lo dice y ofrece WhatsApp.
import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { DEMOS } from "@/content/conoce";
import { DemoButton } from "../DemoButton";

export function Demos() {
  const [open, setOpen] = useState(0);
  return (
    <section id="demos" className="x3-dm" data-shot="aliados" aria-labelledby="cn-dm">
      <div className="x3-wrap">
        <h2 id="cn-dm" className="x3-h2 big">No te lo contamos. <em>Probalo.</em></h2>
        <p className="x3-lead">Demos guiadas sobre la app real, con un gimnasio y un coach ficticios. Sin cuenta, desde tu teléfono.</p>
        <div className="x3-doors">
          {DEMOS.map((d, i) => (
            <article key={d.role} className="x3-door" data-open={i === open ? "1" : undefined} onMouseEnter={() => setOpen(i)} onFocus={() => setOpen(i)} aria-labelledby={`dm-${d.role}`}>
              <button type="button" className="x3-door-tab" aria-expanded={i === open} aria-controls={`dm-b-${d.role}`} onClick={() => setOpen(i)}>
                <span id={`dm-${d.role}`}>{d.title}</span><small>{d.steps} pasos guiados</small>
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
