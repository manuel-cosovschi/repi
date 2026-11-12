"use client";
// Escena 08 · Cierre: «Vuelta al punto» (Motion 2 P4, la firma de cierre). La sala, vista desde arriba, encendida y caminando.
// Con el scroll, cada persona deja su recorrido y gira en espiral alrededor del centro hasta volver a él (Valentina primero,
// las demás por distancia); zonas, equipos y grilla se encogen hacia ahí. Queda un solo punto cian, que creció con todo lo
// que se tragó: es el punto de la «ı» del logo, que sube en arco y se acomoda en su lugar con un aplaste breve. Recién ahí
// nace el logo: las letras se abren desde el punto con el mismo círculo que en 02 (antes no hay logo a medias: nada gris ni
// sin punto). Después «CADA REPETICIÓN CUENTA.» sube en sus máscaras, las acciones aparecen y un trazo cian subraya la
// principal. Todo sigue al scroll (reversible: al subir, la sala se rearma y las personas retoman sus recorridos), salvo el
// nacimiento del logo, que es un evento corto al llegar el punto (y al revés al subir): en reposo el logo está entero o no
// está. Movimiento reducido o pantalla baja: el estado final, quieto.
import { useRef } from "react";
import { ArrowRight, ChatCircle } from "@phosphor-icons/react";
import { waLink as wa } from "@/lib/contact";
import { track } from "@/lib/site-track";
import { stage } from "../sala/store";
import { gatherGrow } from "../sala/model";
import { DemoButton } from "../DemoButton";
import { TrackLink } from "../TrackLink";
import { pickMode } from "../interest";
import { MODES } from "@/content/conoce";
import { quad } from "./curves";
import { gsap, PIN_MQ, ScrollTrigger, useGSAP, whenIdle } from "./gsap";

const ORIGIN: [number, number] = [0, 0];
/** Tamaño (px) del punto de la sala al final de la vuelta: una persona (14 px) que creció con todo lo que se tragó. */
const ROOM_DOT = 14 * gatherGrow(1);
/** Progreso en que el punto llega a la «ı» (y nace el logo). */
const LAND = 0.72;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const eOut = (x: number) => 1 - (1 - x) * (1 - x), eIO = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function Finale() {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(PIN_MQ, () => {
      const q = gsap.utils.selector(root);
      const sec = root.current!, pin = q(".x3-fin-pin")[0] as HTMLElement;
      const wm = q(".x3-fin-wm")[0] as HTMLElement, img = wm.querySelector("img") as HTMLElement, dot = wm.querySelector("i") as HTMLElement;
      const ring = q(".x3-fin-ring")[0] as HTMLElement, lines = q(".x3-fin-h .ln > span") as HTMLElement[], acts = q(".x3-fin-act > :not(.cn-demo-act), .x3-fin-act > .cn-demo-act > *") as HTMLElement[];
      const under = q(".x3-fin-under")[0] as HTMLElement;
      // Medición (en el refresh): el centro del punto de la «ı» y el punto de la sala donde todo converge, en la toma final.
      let path = quad([0, 0], [0, 0], [0, 0]), dotPx = 24, cx = 0, cy = 0, R = 1;
      let p = 0, last = -1;
      // Nacimiento del logo: el círculo que abre las letras desde el punto (0 → 1), como evento corto al llegar el punto.
      const birth = { v: 0 };
      let born = false, tw: gsap.core.Tween | null = null;
      const clip = () => { img.style.clipPath = birth.v >= 1 ? "none" : `circle(${(eIO(birth.v) * R).toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px)`; };
      const measure = () => {
        const pr = pin.getBoundingClientRect(), wr = wm.getBoundingClientRect();
        dotPx = 0.1012 * wr.width;
        const iC: [number, number] = [wr.left - pr.left + 0.8892 * wr.width + dotPx / 2, wr.top - pr.top + 0.0158 * wr.height + dotPx / 2];
        cx = 0.8892 * wr.width + dotPx / 2; cy = 0.0158 * wr.height + dotPx / 2;
        R = Math.hypot(Math.max(cx, wr.width - cx), Math.max(cy, wr.height - cy)) + 2;
        const o = stage.project(ORIGIN[0], ORIGIN[1], "finale");
        // Arco: del centro de la sala sube por encima del punto y baja a acomodarse en la «ı».
        const from: [number, number] = [o.x - iC[0], o.y - iC[1]];
        path = quad(from, [from[0] * 0.25, -Math.max(70, Math.abs(from[1]) * 0.35)], [0, 0]);
        last = -1; render(); clip();
      };
      const render = () => {
        if (p === last) return;
        last = p;
        // .12–.50: la sala vuelve al punto en espiral. .56: el punto pasa de la sala a la página.
        const out = p >= 0.56;
        stage.set({ gather: +seg(p, 0.12, 0.5).toFixed(4), origin: ORIGIN, dotOut: out });
        // El punto viajero es el <i> real del logo: sale del centro de la sala con el tamaño que tenía ahí, sube en arco y se
        // acomoda (.56–.72) con un aplaste breve.
        const u = seg(p, 0.56, LAND);
        if (!out) { dot.style.opacity = "0"; dot.style.transform = ""; }
        else {
          const [x, y] = path.at(eIO(u)), s0 = ROOM_DOT / dotPx, sc = s0 + (1 - s0) * eOut(u);
          const sq = seg(p, LAND, LAND + 0.04), squash = sq > 0 && sq < 1 ? Math.sin(Math.PI * sq) * 0.3 : 0;
          dot.style.opacity = "1";
          dot.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(sc * (1 + squash)).toFixed(3)}, ${(sc * (1 - squash)).toFixed(3)})`;
        }
        // El logo nace cuando el punto llega (y se recoge si se sube antes de eso). Pausado: sin la transición.
        const want = p >= LAND;
        if (want !== born) {
          born = want; tw?.kill();
          if (stage.get().paused) { birth.v = want ? 1 : 0; clip(); }
          else tw = gsap.to(birth, { v: want ? 1 : 0, duration: want ? 0.6 : 0.3, ease: "none", onUpdate: clip });
        }
        // Un anillo sale una sola vez cuando el punto se acomoda.
        const rg = seg(p, LAND, LAND + 0.12);
        ring.style.opacity = rg > 0 && rg < 1 ? String(+(0.8 * (1 - rg)).toFixed(3)) : "0";
        ring.style.transform = `scale(${(0.06 + 0.94 * eOut(rg)).toFixed(3)})`;
        // «CADA REPETICIÓN / CUENTA.» sube en sus máscaras; las acciones, escalonadas; el trazo subraya la principal.
        lines.forEach((l, i) => { l.style.transform = `translateY(${(135 * (1 - eOut(seg(p, 0.74 + i * 0.05, 0.84 + i * 0.05)))).toFixed(1)}%)`; });
        acts.forEach((a, i) => { const v = eOut(seg(p, 0.82 + i * 0.03, 0.9 + i * 0.03)); a.style.opacity = String(+v.toFixed(3)); a.style.transform = `translateY(${(18 * (1 - v)).toFixed(1)}px)`; });
        under.style.transform = `scaleX(${eIO(seg(p, 0.86, 0.94)).toFixed(3)})`;
      };
      // El disparador y la primera medición, en un momento libre (no en el cuadro de la hidratación); después, cada refresh.
      let trig: ScrollTrigger | null = null;
      const idle = whenIdle(() => { trig = ScrollTrigger.create({ trigger: sec, start: "top top", end: "bottom bottom", scrub: 0.6, onRefreshInit: measure, onUpdate: (s) => { p = s.progress; render(); } }); measure(); });
      return () => {
        idle(); trig?.kill(); tw?.kill();
        stage.set({ gather: 0, dotOut: false });
        for (const el of [dot, img, ring, under, ...lines, ...acts]) { el.style.transform = ""; el.style.opacity = ""; }
        img.style.clipPath = "";
      };
    });
    return () => mm.revert();
  }, { scope: root });
  return (
    <section ref={root} id="cierre" className="x3-fin" data-shot="finale" aria-labelledby="cn-fin">
      <div className="x3-fin-pin">
        <div className="x3-wrap x3-fin-in">
          <span className="wm x3-fin-wm" role="img" aria-label="repi">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wm_full.png" alt="" width={315} height={154} loading="lazy" />
            <i />
            <span className="x3-fin-ring" aria-hidden="true" />
          </span>
          <h2 id="cn-fin" className="x3-fin-h"><span className="ln"><span>Cada repetición</span></span> <span className="ln"><span>cuenta.</span></span></h2>
          <div className="x3-fin-act">
            <a className="x3-btn pri lg" href="#contacto" onClick={() => track("contact_click", { profile: "gimnasios", target: "cierre" })}><span className="x3-fin-under" aria-hidden="true" />Quiero REPI en mi gimnasio <ArrowRight size={20} weight="bold" aria-hidden="true" /></a>
            <TrackLink event="whatsapp_click" profile="entrenadores" target="cierre" external className="x3-btn ghost" href={wa("Hola, soy entrenador personal y quiero usar REPI con mis alumnos. ¿Me cuentan cómo empezar?")}>Soy entrenador</TrackLink>
            <DemoButton role="member" label="Probar la demo" className="x3-btn ghost" target="cierre" />
            <TrackLink event="whatsapp_click" target="cierre-hablar" external className="x3-btn text" href={wa("Hola, conocí REPI y quiero hablar con el equipo.")}><ChatCircle size={18} weight="bold" aria-hidden="true" />Hablar con REPI</TrackLink>
            {/* D215: las dos modalidades, sin otro botón: lleva a «Dos formas de entrenar» con la elegida. */}
            <p className="x3-fin-modes">Para gimnasios, en dos modalidades: {(["completo", "control"] as const).map((id, i) => <span key={id}>{i > 0 && " y "}<a href="#modos" onClick={() => { pickMode(id); track("feature_click", { profile: "gimnasios", target: `cierre-modo-${id}` }); }}>{MODES[id].name}</a></span>)}.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
