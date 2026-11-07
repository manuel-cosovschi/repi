"use client";
// Escena 01 · Apertura: «El punto cae y se vuelve persona» (Motion 2 P2). La sala llega apagada desde el servidor (sin el ciclo
// brillante → oscuro → brillante). A los 0,4 s el punto cian de la «ı» se desprende, sube un poco y cae en arco sobre el rack
// de Valentina (la proyección real de ese punto de la sala, a un costado del texto: nunca lo cruza). Al tocar el piso se aplasta,
// salen dos anillos y la luz se expande desde ahí: la sala se enciende por radio y cada persona aparece cuando la luz la
// alcanza. El impacto es un evento de luz: el punto crece al caer (≥ 20 px), se aplasta fuerte, salen dos anillos grandes, un
// frente de luz recorre el piso y el contorno de cada zona se dibuja cuando el frente la alcanza (SalaSvg). El punto vuelve
// al tamaño de una persona y queda como Valentina, con su anillo que respira, y el logo recupera su punto. El título, los textos y los
// botones llegan pintados desde el servidor (LCP) y nunca se ocultan al hidratar; al bajar se corren como un telón (scrub).
// Movimiento reducido, pausa guardada o llegada con scroll: el estado final, sin caída.
import { useRef } from "react";
import { ArrowDown, MapPin, Play } from "@phosphor-icons/react";
import { HERO_VARIANTS, VIDEOS, type HeroVariant } from "@/content/conoce";
import { stage } from "../sala/store";
import { VALENTINA } from "../sala/model";
import { DemoButton } from "../DemoButton";
import { gsap, MOTION_MQ, reduced, useGSAP } from "./gsap";
import { useFilm } from "./FilmPlayer";

type Box = { left: number; top: number; right: number; bottom: number };
const savedPause = () => { try { return localStorage.getItem("repi:conoce:motion") === "paused"; } catch { return false; } };

export function Hero({ variant = "a" }: { variant?: HeroVariant }) {
  const root = useRef<HTMLElement>(null);
  const film = useFilm();
  const copy = HERO_VARIANTS[variant] ?? HERO_VARIANTS.a;
  const brand = VIDEOS["film-marca"];
  useGSAP(() => {
    if (reduced()) { stage.set({ lit: 1, reveal: null }); return; }
    const q = gsap.utils.selector(root);
    const drop = q(".x3-drop")[0] as HTMLElement, mark = q(".x3-hero-wm i")[0] as HTMLElement, rings = q(".x3-hero-ring") as HTMLElement[];
    const front = q(".x3-hero-front")[0] as unknown as SVGSVGElement | undefined, fc = front?.querySelector("circle") as SVGCircleElement | null;
    // Cada visita empieza con la sala apagada (la tienda es compartida: al volver a /conoce, `lit` podía haber quedado en 1).
    stage.set({ lit: 0, reveal: null });
    let tl: gsap.core.Timeline | null = null;
    const finish = () => {
      tl?.progress(1); tl?.kill(); tl = null;
      stage.set({ lit: 1, reveal: null });
      gsap.set(drop, { clearProps: "all" }); gsap.set(rings, { clearProps: "all" }); gsap.set(mark, { opacity: 1 });
      if (front) front.style.opacity = "0";
    };
    const go = () => {
      // Pausa guardada, o la persona ya bajó: sin caída.
      if (savedPause() || stage.get().paused || window.scrollY > 12) { finish(); return; }
      // Medición (una vez): el punto de la «ı», el impacto (Valentina en la toma cenital, igual al SVG y al 3D que entra) y las
      // cajas del texto que la caída no puede cruzar.
      const dr = drop.getBoundingClientRect();
      const s0 = { x: dr.left + dr.width / 2, y: dr.top + dr.height / 2 };
      const hit = stage.project(VALENTINA[0], VALENTINA[1], "plan");
      const texts: Box[] = q(".x3-hero-h1 .ln > span, .x3-hero-sub, .x3-hero-lead, .x3-hero-cta, .x3-hero-proof").map((e) => (e as HTMLElement).getBoundingClientRect());
      // El punto crece al caer hasta 22 px (se ve también en el teléfono, donde la «ı» mide 12 px), se aplasta y vuelve al
      // tamaño de una persona de la sala (14 px) antes de quedar como Valentina.
      const size = dr.width, BIG = 22 / size, LAND = 14 / size;
      // Arco: x lineal e y acelerada (power2.in); si así rozara el texto, la curva se mantiene alta más tiempo (power3/4/6).
      const crosses = (k: number) => {
        for (let i = 1; i < 40; i++) {
          const u = i / 40, x = s0.x + (hit.x - s0.x) * u, y = s0.y - 12 + (hit.y - s0.y + 12) * Math.pow(u, k), r = size / 2 + 6;
          if (texts.some((b) => x + r > b.left && x - r < b.right && y + r > b.top && y - r < b.bottom)) return true;
        }
        return false;
      };
      const k = [2, 3, 4, 6].find((v) => !crosses(v)) ?? 6;
      const dx = hit.x - s0.x, dy = hit.y - s0.y;
      // El punto viaja fijo a la pantalla (si la persona hace scroll durante la caída, igual llega a la sala).
      gsap.set(drop, { position: "fixed", left: dr.left, top: dr.top, width: dr.width, height: dr.height, opacity: 1, x: 0, y: 0 });
      gsap.set(mark, { opacity: 0 });
      gsap.set(rings, { position: "fixed", left: hit.x, top: hit.y, xPercent: -50, yPercent: -50, scale: 0.2, opacity: 0 });
      const light = { r: 0 };
      const maxR = Math.hypot(Math.max(hit.x, window.innerWidth - hit.x), Math.max(hit.y, window.innerHeight - hit.y)) + 160;
      tl = gsap.timeline({ onComplete: () => { tl = null; } })
        .to(drop, { y: -12, duration: 0.2, ease: "power2.out" })
        .to(drop, { x: dx, duration: 0.9, ease: "none" }, ">")
        .to(drop, { y: dy, duration: 0.9, ease: `power${Math.min(4, k)}.in` }, "<")
        .to(drop, { scale: BIG, duration: 0.9, ease: "power1.in" }, "<")
        .addLabel("impact")
        // Impacto: un aplaste fuerte, un rebote y vuelve a ser un punto del tamaño de una persona de la sala.
        .to(drop, { scaleX: 2.7 * BIG, scaleY: 0.28 * BIG, duration: 0.09, ease: "power2.out" }, "impact")
        .to(drop, { scaleX: BIG, scaleY: BIG, duration: 0.32, ease: "back.out(2.6)" }, ">")
        .to(drop, { scale: LAND, duration: 0.45, ease: "power2.inOut" }, ">")
        .to(rings[0], { scale: 7, opacity: 0, duration: 0.9, ease: "power2.out", startAt: { opacity: 1, scale: 0.3 } }, "impact")
        .to(rings[1], { scale: 12, opacity: 0, duration: 1.2, ease: "power2.out", startAt: { opacity: 0.7, scale: 0.3 } }, "impact+=0.1")
        // La luz se expande desde el impacto: un frente (un círculo fino) recorre el piso, la sala se enciende por radio, cada
        // zona se dibuja y cada persona aparece cuando la luz la alcanza.
        .add(() => { stage.set({ lit: 1, reveal: { x: hit.x, y: hit.y, r: 0 } }); if (fc) { fc.setAttribute("cx", hit.x.toFixed(0)); fc.setAttribute("cy", hit.y.toFixed(0)); } }, "impact")
        .to(light, { r: maxR, duration: 2, ease: "power1.out", onUpdate: () => {
          stage.set({ reveal: { x: hit.x, y: hit.y, r: light.r } });
          if (fc && front) { fc.setAttribute("r", light.r.toFixed(0)); front.style.opacity = String(+(0.75 * (1 - light.r / maxR)).toFixed(3)); }
        }, onComplete: () => { stage.set({ reveal: null }); if (front) front.style.opacity = "0"; } }, "impact")
        // El logo recupera su punto y el punto de la caída queda como Valentina (la sala ya la dibuja ahí).
        .to(mark, { opacity: 1, duration: 0.3 }, "impact+=0.3")
        .to(drop, { opacity: 0, duration: 0.5 }, "impact+=0.6");
    };
    const start = gsap.delayedCall(0.4, go);
    // «Pausar animaciones» durante la apertura: salta a su estado final.
    const off = stage.subscribe(() => { if (stage.get().paused && (tl || start.isActive())) { start.kill(); finish(); } });
    // Telón al bajar: las dos líneas del título se separan y los textos suben y se apagan (scrub, reversible).
    const mm = gsap.matchMedia();
    mm.add(MOTION_MQ, () => {
      gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom 15%", scrub: 0.5 } })
        .to(q(".x3-hero-sub, .x3-hero-lead, .x3-hero-cta, .x3-hero-proof"), { y: -40, opacity: 0, duration: 0.5, stagger: 0.04 }, 0)
        .to(q(".x3-hero-h1 .ln:first-child > span"), { xPercent: -12, opacity: 0, duration: 0.7 }, 0.2)
        .to(q(".x3-hero-h1 .ln:last-child > span"), { xPercent: 12, opacity: 0, duration: 0.7 }, 0.2)
        .to(q(".x3-hero-wm img, .x3-hero-wm > i"), { opacity: 0, duration: 0.5 }, 0.3);
    });
    return () => { start.kill(); off(); tl?.kill(); mm.revert(); stage.set({ lit: 1, reveal: null }); };
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
        <p className="x3-hero-proof"><MapPin size={16} weight="bold" aria-hidden="true" /><span>Ya funciona en gimnasios de Mar del Plata.</span></p>
      </div>
      <span className="x3-hero-ring" aria-hidden="true" /><span className="x3-hero-ring" aria-hidden="true" />
      {/* El frente de luz del encendido: un círculo fino (el trazo no crece con el radio). */}
      <svg className="x3-hero-front" aria-hidden="true"><circle cx="0" cy="0" r="0" /></svg>
      <a className="x3-scroll" href="#problema" aria-label="Seguir: el problema que resuelve REPI"><ArrowDown size={18} weight="bold" aria-hidden="true" /></a>
    </section>
  );
}
