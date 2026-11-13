"use client";
// Escena 07 · En gimnasios reales. Pedido del titular (07/11), con la prueba social que autorizó el 12/11 (D218, ajuste): funciona
// en Smart Center Gym (nombrado una sola vez, en el panel del caso) y está en proceso de implementación en varios gimnasios más de Mar del Plata, Balcarce y Tandil. Además,
// Smart Center Gym (logo autorizado por el gimnasio el 07/11/2026) aparece una sola vez, como caso de éxito, en un panel oscuro
// donde su logo (blanco y verde) se ve. Sin cifras ni testimonios: cuando un gimnasio comparta resultados, se suman acá.
// Motion 2 (P7): el crema entra con un borde curvo (no una línea recta); la línea de «Cómo se empieza» se dibuja con el scroll
// (vertical en el teléfono) y el último paso late una vez; el panel del caso se revela una sola vez con una máscara.
import { useRef } from "react";
import { STEPS } from "@/content/conoce";
import { gsap, MOTION_MQ, ScrollTrigger, useGSAP } from "./gsap";

export function Proof() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION_MQ, () => {
      const q = gsap.utils.selector(root);
      const line = q(".x3-steps-line")[0] as HTMLElement, last = q(".x3-steps li:last-child")[0] as HTMLElement;
      const vertical = () => window.matchMedia("(max-width: 899px)").matches;
      const draw = ScrollTrigger.create({
        trigger: q(".x3-steps")[0], start: "top 80%", end: "bottom 60%", scrub: 0.5, invalidateOnRefresh: true,
        onUpdate: (s) => {
          line.style.transform = vertical() ? `scaleY(${s.progress.toFixed(3)})` : `scaleX(${s.progress.toFixed(3)})`;
          if (s.progress > 0.98) last.dataset.lit = "1"; else delete last.dataset.lit;
        },
      });
      gsap.fromTo(q(".x3-case"), { clipPath: "inset(0 0 100% 0 round 12px)" }, { clipPath: "inset(0 0 0% 0 round 12px)", duration: 0.9, ease: "expo.inOut", scrollTrigger: { trigger: q(".x3-case")[0], start: "top 85%", once: true } });
      return () => { draw.kill(); line.style.transform = ""; delete last.dataset.lit; };
    });
    return () => mm.revert();
  }, { scope: root });
  return (
    <section ref={root} id="caso" className="x3-proof" data-shot="finale" data-solid="1" aria-labelledby="cn-caso">
      {/* Borde curvo navy → crema: dibujo fijo, fuera del flujo (no reserva ni mueve nada). */}
      <svg className="x3-curve up" viewBox="0 0 1440 56" preserveAspectRatio="none" aria-hidden="true"><path d="M0,56 C360,6 1080,6 1440,56 Z" /></svg>
      <div className="x3-wrap x3-proof-grid">
        <div>
          <h2 id="cn-caso" className="x3-h2 ink">Ya funciona en <em>Mar del Plata.</em></h2>
          <div className="x3-proof-text">
            <p>REPI ya funciona en Mar del Plata y estamos en proceso de implementación en varios gimnasios más de Mar del Plata, Balcarce y Tandil. Los socios piden acceso con el QR de su sede, el equipo los aprueba y entrenan con su rutina en el teléfono, incluida la que ya tenían. El equipo de sala recibe los pedidos de ayuda y los profes ven cómo entrena cada uno.</p>
          </div>
        </div>
        <figure className="x3-case">
          <figcaption className="x3-case-k">Caso de éxito</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/conoce/smart-center-gym.webp" alt="Smart Center Gym" width={260} height={70} loading="lazy" decoding="async" />
          <p>En Smart Center Gym, Mar del Plata, los socios entrenan con su programa en el teléfono y piden ayuda al equipo de sala desde su serie.</p>
        </figure>
      </div>
      <div className="x3-wrap">
        <h3 className="x3-h3 ink" id="empezar">Cómo se empieza.</h3>
        <div className="x3-steps-wrap"><span className="x3-steps-line" aria-hidden="true" /><ol className="x3-steps">{STEPS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ol></div>
      </div>
      {/* Y el espejo: el crema termina con la misma curva hacia el cierre. */}
      <svg className="x3-curve down" viewBox="0 0 1440 56" preserveAspectRatio="none" aria-hidden="true"><path d="M0,0 C360,50 1080,50 1440,0 Z" /></svg>
    </section>
  );
}
