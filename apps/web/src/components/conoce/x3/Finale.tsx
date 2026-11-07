"use client";
// Escena 08 · Cierre: «Vuelta al punto» (Motion 2 P4, la firma de cierre). La sala, vista desde arriba, encendida y caminando.
// Con el scroll, cada persona deja su recorrido y vuelve por una curva al centro (Valentina primero, las demás por distancia);
// zonas, equipos y grilla se encogen hacia ahí. Queda un solo punto cian: es el punto de la «ı» del logo, que sube en arco, se
// acomoda en su lugar con un aplaste breve, el logo pasa de acero a blanco y sale un anillo. Después «CADA REPETICIÓN CUENTA.»
// sube en sus máscaras, las acciones aparecen y un trazo cian subraya la principal. Todo sigue al scroll (reversible: al subir,
// la sala se rearma y las personas retoman sus recorridos). Movimiento reducido o pantalla baja: el estado final, quieto.
import { useRef } from "react";
import { ArrowRight, ChatCircle } from "@phosphor-icons/react";
import { CONTACT } from "@/lib/contact";
import { track } from "@/lib/site-track";
import { stage } from "../sala/store";
import { DemoButton } from "../DemoButton";
import { TrackLink } from "../TrackLink";
import { quad } from "./curves";
import { gsap, PIN_MQ, ScrollTrigger, useGSAP } from "./gsap";

const wa = (t: string) => `${CONTACT.whatsapp}?text=${encodeURIComponent(t)}`;
const ORIGIN: [number, number] = [0, 0];
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
      let path = quad([0, 0], [0, 0], [0, 0]), dotPx = 24;
      let p = 0, last = -1;
      const measure = () => {
        const pr = pin.getBoundingClientRect(), wr = wm.getBoundingClientRect();
        dotPx = 0.1012 * wr.width;
        const iC: [number, number] = [wr.left - pr.left + 0.8892 * wr.width + dotPx / 2, wr.top - pr.top + 0.0158 * wr.height + dotPx / 2];
        const o = stage.project(ORIGIN[0], ORIGIN[1], "finale");
        // Arco: del centro de la sala sube por encima del punto y baja a acomodarse en la «ı».
        const from: [number, number] = [o.x - iC[0], o.y - iC[1]];
        path = quad(from, [from[0] * 0.25, -Math.max(70, Math.abs(from[1]) * 0.35)], [0, 0]);
        last = -1; render();
      };
      const render = () => {
        if (p === last) return;
        last = p;
        // .12–.50: la sala vuelve al punto. .56: el punto pasa de la sala a la página.
        const out = p >= 0.56;
        stage.set({ gather: +seg(p, 0.12, 0.5).toFixed(4), origin: ORIGIN, dotOut: out });
        // El punto viajero es el <i> real del logo: sale del centro de la sala, sube en arco y se acomoda (.56–.74).
        const u = seg(p, 0.56, 0.72);
        if (!out) { dot.style.opacity = "0"; dot.style.transform = ""; }
        else {
          const [x, y] = path.at(eIO(u)), s0 = 14 / dotPx, sc = s0 + (1 - s0) * eOut(u);
          const sq = seg(p, 0.72, 0.76), squash = sq > 0 && sq < 1 ? Math.sin(Math.PI * sq) * 0.3 : 0;
          dot.style.opacity = "1";
          dot.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(sc * (1 + squash)).toFixed(3)}, ${(sc * (1 - squash)).toFixed(3)})`;
        }
        // El logo, en acero (.35) hasta que el punto llega; después, blanco. Un anillo sale una sola vez.
        img.style.opacity = String(+(0.35 + 0.65 * eOut(seg(p, 0.7, 0.76))).toFixed(3));
        const rg = seg(p, 0.72, 0.84);
        ring.style.opacity = rg > 0 && rg < 1 ? String(+(0.8 * (1 - rg)).toFixed(3)) : "0";
        ring.style.transform = `scale(${(0.06 + 0.94 * eOut(rg)).toFixed(3)})`;
        // «CADA REPETICIÓN / CUENTA.» sube en sus máscaras; las acciones, escalonadas; el trazo subraya la principal.
        lines.forEach((l, i) => { l.style.transform = `translateY(${(135 * (1 - eOut(seg(p, 0.72 + i * 0.05, 0.82 + i * 0.05)))).toFixed(1)}%)`; });
        acts.forEach((a, i) => { const v = eOut(seg(p, 0.8 + i * 0.03, 0.88 + i * 0.03)); a.style.opacity = String(+v.toFixed(3)); a.style.transform = `translateY(${(18 * (1 - v)).toFixed(1)}px)`; });
        under.style.transform = `scaleX(${eIO(seg(p, 0.84, 0.92)).toFixed(3)})`;
      };
      const trig = ScrollTrigger.create({ trigger: sec, start: "top top", end: "bottom bottom", scrub: 0.6, onRefreshInit: measure, onUpdate: (s) => { p = s.progress; render(); } });
      measure();
      return () => {
        trig.kill();
        stage.set({ gather: 0, dotOut: false });
        for (const el of [dot, img, ring, under, ...lines, ...acts]) { el.style.transform = ""; el.style.opacity = ""; }
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
          </div>
        </div>
      </div>
    </section>
  );
}
