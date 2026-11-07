"use client";
// Escena 01 · Apertura. El punto cian de la «ı» se desprende del wordmark, cae sobre la sala y la enciende (líneas, zonas y
// personas). El título y los botones están en el HTML desde el servidor (LCP), visibles y usables desde el primer instante:
// la animación no los toca. Movimiento reducido: sala encendida directamente.
import { useRef } from "react";
import { ArrowDown, MapPin, Play } from "@phosphor-icons/react";
import { HERO_VARIANTS, VIDEOS, type HeroVariant } from "@/content/conoce";
import { stage } from "../sala/store";
import { DemoButton } from "../DemoButton";
import { gsap, reduced, useGSAP } from "./gsap";
import { useFilm } from "./FilmPlayer";

export function Hero({ variant = "a" }: { variant?: HeroVariant }) {
  const root = useRef<HTMLElement>(null);
  const film = useFilm();
  const copy = HERO_VARIANTS[variant] ?? HERO_VARIANTS.a;
  const brand = VIDEOS["film-marca"];
  useGSAP(() => {
    if (reduced()) { stage.set({ lit: 1 }); return; }
    // Sólo se animan las piezas decorativas: el punto de la «ı» y la sala. El título, los textos y los botones llegan pintados
    // desde el servidor (LCP) y nunca se vuelven a ocultar al hidratar. Cada visita empieza con la sala apagada (la tienda es
    // compartida: si se vuelve a /conoce desde otra página, `lit` podría haber quedado en 1).
    stage.set({ lit: 0 });
    const q = gsap.utils.selector(root);
    const lit = { v: 0 };
    const tl = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.4 });
    tl.to(q(".x3-drop"), { opacity: 1, duration: 0.01 })
      .to(q(".x3-hero-wm i"), { opacity: 0, duration: 0.01 }, "<")
      // El punto se separa del logo, cae sobre la sala y la enciende.
      .fromTo(q(".x3-drop"), { y: 0, scale: 1 }, { y: () => window.innerHeight * 0.46, scale: 0.55, duration: 0.85, ease: "power2.in" })
      .to(q(".x3-drop"), { scaleX: 2.6, scaleY: 0.2, opacity: 0, duration: 0.35, ease: "power2.out" })
      .to(lit, { v: 1, duration: 1.6, ease: "power2.out", onUpdate: () => stage.set({ lit: lit.v }) }, "<")
      .to(q(".x3-hero-wm i"), { opacity: 1, duration: 0.4 }, "<0.4");
    return () => { tl.kill(); stage.set({ lit: 1 }); };
  }, { scope: root });

  const watch = () => {
    if (brand?.src) film(brand);
    else document.getElementById("en-accion")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
  };
  return (
    <section ref={root} id="cn-hero" className="x3-hero" data-shot="hero" aria-labelledby="cn-title">
      <div className="x3-wrap x3-hero-in">
        <span className="wm x3-hero-wm" role="img" aria-label="repi">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wm_full.png" alt="" width={315} height={154} fetchPriority="high" />
          <i />
          <span className="x3-drop" aria-hidden="true" />
        </span>
        <h1 id="cn-title" className="x3-hero-h1">
          {copy.title.map((l) => <span key={l} className="ln"><span>{l}</span></span>)}
        </h1>
        <p className="x3-hero-sub">{copy.sub}</p>
        <p className="x3-hero-lead">{copy.lead}</p>
        <div className="x3-hero-cta">
          <button type="button" className="x3-btn pri" onClick={watch}><Play size={18} weight="fill" aria-hidden="true" />Mirá REPI en acción</button>
          <DemoButton role="member" label="Probá la demo" className="x3-btn ghost" target="hero" />
        </div>
        <p className="x3-hero-proof"><MapPin size={16} weight="bold" aria-hidden="true" /><span>En funcionamiento en <b>Smart Center Gym</b>, Mar del Plata.</span></p>
      </div>
      <a className="x3-scroll" href="#problema" aria-label="Seguir: el problema que resuelve REPI"><ArrowDown size={18} weight="bold" aria-hidden="true" /></a>
    </section>
  );
}
