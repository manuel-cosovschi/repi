"use client";
// Escena 08 · Cierre. La cámara sube y toda la sala converge en el punto cian, que vuelve al logo. «CADA REPETICIÓN CUENTA.» y
// las acciones con jerarquía: la consulta de un gimnasio pesa más; entrenador, demo y WhatsApp acompañan.
import { useRef } from "react";
import { ArrowRight, ChatCircle } from "@phosphor-icons/react";
import { CONTACT } from "@/lib/contact";
import { track } from "@/lib/site-track";
import { DemoButton } from "../DemoButton";
import { TrackLink } from "../TrackLink";
import { gsap, reduced, useGSAP } from "./gsap";

const wa = (t: string) => `${CONTACT.whatsapp}?text=${encodeURIComponent(t)}`;

export function Finale() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (reduced()) return;
    const q = gsap.utils.selector(root);
    gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 70%", end: "top 10%", scrub: 0.6 } })
      .fromTo(q(".x3-fin-wm"), { scale: 0.6, opacity: 0, filter: "blur(10px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", ease: "power2.out" })
      .fromTo(q(".x3-fin-h .ln > span"), { yPercent: 105 }, { yPercent: 0, stagger: 0.15, ease: "expo.out" }, "<0.2")
      .fromTo(q(".x3-fin-act > *"), { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.08 }, "<0.3");
  }, { scope: root });
  return (
    <section ref={root} id="cierre" className="x3-fin" data-shot="finale" aria-labelledby="cn-fin">
      <div className="x3-wrap x3-fin-in">
        <span className="wm x3-fin-wm" role="img" aria-label="repi">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wm_full.png" alt="" width={315} height={154} loading="lazy" />
          <i />
        </span>
        <h2 id="cn-fin" className="x3-fin-h"><span className="ln"><span>Cada repetición</span></span><span className="ln"><span>cuenta.</span></span></h2>
        <div className="x3-fin-act">
          <a className="x3-btn pri lg" href="#contacto" onClick={() => track("contact_click", { profile: "gimnasios", target: "cierre" })}>Quiero REPI en mi gimnasio <ArrowRight size={20} weight="bold" aria-hidden="true" /></a>
          <TrackLink event="whatsapp_click" profile="entrenadores" target="cierre" external className="x3-btn ghost" href={wa("Hola, soy entrenador personal y quiero usar REPI con mis alumnos. ¿Me cuentan cómo empezar?")}>Soy entrenador</TrackLink>
          <DemoButton role="member" label="Probar la demo" className="x3-btn ghost" target="cierre" />
          <TrackLink event="whatsapp_click" target="cierre-hablar" external className="x3-btn text" href={wa("Hola, conocí REPI y quiero hablar con el equipo.")}><ChatCircle size={18} weight="bold" aria-hidden="true" />Hablar con REPI</TrackLink>
        </div>
      </div>
    </section>
  );
}
