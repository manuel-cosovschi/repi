"use client";
// Escena 02 · Del caos al orden. Sobre la sala flotan fragmentos sueltos de un gimnasio sin sistema (rutina en papel, planilla,
// mensajes, una consulta sin respuesta, un panel vacío). Al hacer scroll, REPI los une con trazos de luz y los ordena en un
// solo lugar; el texto pasa de «Antes» a «Ahora». Fijada y con scrub: es reversible. Movimiento reducido o pantalla baja
// (menos de 560 px de alto, p. ej. con zoom): los dos estados se muestran uno debajo del otro, sin animación ni recorte.
import { useRef } from "react";
import { Wordmark } from "@/components/access/Wordmark";
import { gsap, PIN_MQ, ScrollTrigger, useGSAP } from "./gsap";

const FRAGS = [
  { id: "paper", cls: "paper", x: 9, y: 18, r: -6, body: <><b>Rutina</b><span>Sentadilla 4×8</span><span>Prensa 3×12</span><span className="smudge">Remo ¿?</span></> },
  { id: "sheet", cls: "sheet", x: 70, y: 14, r: 4, body: <><b>planilla_socios_v3.xlsx</b><span className="cells">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</span></> },
  { id: "chat", cls: "chat", x: 76, y: 58, r: 3, body: <><small>Socio · 19:42</small><span>Profe, ¿qué me toca hoy?</span></> },
  { id: "ask", cls: "chat alt", x: 6, y: 62, r: -3, body: <><small>Socio · 20:05</small><span>¿Cuánto le pongo a la prensa?</span></> },
  { id: "prog", cls: "prog", x: 40, y: 8, r: -2, body: <><b>Progreso</b><span className="flat">— sin datos —</span></> },
  { id: "panel", cls: "panel", x: 60, y: 82, r: 2, body: <><b>Sala · hoy</b><span>¿Quién entrenó?</span><span>¿Quién necesitó ayuda?</span></> },
  { id: "call", cls: "call", x: 26, y: 84, r: 5, body: <><b>Pedido de ayuda</b><span>Nadie lo vio</span></> },
] as const;

export function Problem() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(PIN_MQ, () => {
      const q = gsap.utils.selector(root);
      const pin = q(".x3-prob-pin")[0] as HTMLElement;
      const frags = q(".x3-frag") as HTMLElement[];
      const lines = q(".x3-prob-lines line") as unknown as SVGLineElement[];
      const hub = () => { const r = pin.getBoundingClientRect(); return { x: r.width / 2, y: r.height * 0.5 }; };
      // Cada trazo va del centro del fragmento al centro de la escena (se recalcula al cambiar el tamaño). Primero se leen todas
      // las medidas y después se escribe: un solo cálculo de diseño.
      const place = () => {
        const pr = pin.getBoundingClientRect(), h = hub();
        const rects = frags.map((f) => f.getBoundingClientRect());
        rects.forEach((r, i) => {
          const l = lines[i];
          l.setAttribute("x1", String(r.left - pr.left + r.width / 2)); l.setAttribute("y1", String(r.top - pr.top + r.height / 2));
          l.setAttribute("x2", String(h.x)); l.setAttribute("y2", String(h.y));
          const len = Math.hypot(r.left - pr.left + r.width / 2 - h.x, r.top - pr.top + r.height / 2 - h.y);
          l.style.strokeDasharray = String(len); l.style.strokeDashoffset = String(len);
        });
      };
      place();
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        // Fijada con position: sticky (CSS, sin saltos de diseño): el tramo es el alto extra de la sección.
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 0.8, invalidateOnRefresh: true, onRefreshInit: place },
      });
      tl.to(lines, { strokeDashoffset: 0, duration: 0.3, stagger: 0.03 }, 0.15)
        .to(q(".x3-prob-before"), { opacity: 0, y: -24, filter: "blur(8px)", duration: 0.12 }, 0.5)
        .to(frags, {
          x: (i: number) => { const r = frags[i].getBoundingClientRect(), pr = pin.getBoundingClientRect(); return hub().x - (r.left - pr.left + r.width / 2); },
          y: (i: number) => { const r = frags[i].getBoundingClientRect(), pr = pin.getBoundingClientRect(); return hub().y - (r.top - pr.top + r.height / 2); },
          rotate: 0, scale: 0.2, opacity: 0, duration: 0.25, stagger: 0.015, ease: "power2.in",
        }, 0.48)
        .to(lines, { opacity: 0, duration: 0.1 }, 0.68)
        .fromTo(q(".x3-prob-core"), { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.16, ease: "back.out(2)" }, 0.66)
        .fromTo(q(".x3-prob-after"), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.14, ease: "power2.out" }, 0.74)
        .fromTo(q(".x3-prob-roles li"), { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.1, stagger: 0.04, ease: "power2.out" }, 0.8);
      // Si cambia el alto de la página (pestañas de perfiles, preguntas, puertas de demos), se recalculan las escenas fijadas una
      // sola vez y fuera del cuadro de la interacción.
      let lastH = Math.round(document.body.getBoundingClientRect().height), timer = 0;
      const ro = new ResizeObserver(([e]) => {
        const h = Math.round(e.contentRect.height); if (h === lastH) return;
        lastH = h; clearTimeout(timer); timer = window.setTimeout(() => ScrollTrigger.refresh(), 150);
      });
      ro.observe(document.body);
      return () => { ro.disconnect(); clearTimeout(timer); };
    });
    return () => mm.revert();
  }, { scope: root });

  return (
    <section ref={root} id="problema" className="x3-prob" data-shot="problem" aria-labelledby="cn-prob">
      <div className="x3-prob-pin">
        <svg className="x3-prob-lines" aria-hidden="true">{FRAGS.map((f) => <line key={f.id} />)}</svg>
        <div className="x3-frags" aria-hidden="true">
          {FRAGS.map((f) => (
            <div key={f.id} className={`x3-frag ${f.cls}`} style={{ left: `${f.x}%`, top: `${f.y}%`, rotate: `${f.r}deg` }}>{f.body}</div>
          ))}
        </div>
        <div className="x3-prob-copy x3-prob-before">
          <h2 id="cn-prob">Antes, cada dato <em>en otro lado.</em></h2>
          <p>La rutina en papel, el progreso en una planilla, las consultas en el chat y el dueño sin ver qué pasa en su sala.</p>
        </div>
        {/* Los fragmentos convergen en el logo real (nunca el nombre escrito con otra tipografía). */}
        <div className="x3-prob-core" aria-hidden="true"><Wordmark width={132} /></div>
        <div className="x3-prob-copy x3-prob-after">
          <p className="x3-prob-big">Ahora, cada persona con el contexto que necesita.</p>
          <ul className="x3-prob-roles">
            <li><b>El socio</b> sabe qué hacer en cada serie.</li>
            <li><b>El entrenador</b> sabe a quién atender.</li>
            <li><b>El dueño</b> ve lo que pasa en su sala.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
