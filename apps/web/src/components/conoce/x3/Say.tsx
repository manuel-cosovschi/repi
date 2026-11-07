"use client";
// Afirmaciones cinéticas (Motion 2): Barlow Condensed 700 partida por palabra ya en el HTML del servidor (sin saltos al
// hidratar). El texto real va para los lectores de pantalla y la copia visual va oculta para ellos, con cada palabra en su
// máscara. `*así*` marca la palabra clave: llega apagada, se enciende en blanco y debajo se dibuja un subrayado blanco.
// Por defecto acompaña al scroll (de «top 85%» a «top 45%», reversible); con `auto={false}` la anima la escena (sayIn/sayOut).
// Movimiento reducido: el estado final, quieto (es el CSS por defecto).
import { Fragment, useRef, type ElementType } from "react";
import { gsap, MOTION_MQ, useGSAP } from "./gsap";

type Word = { t: string; k: boolean };
/** «Antes, cada dato *en otro lado.*» → palabras; la frase clave va entera en una sola máscara (con su subrayado de corrido). */
export function splitSay(text: string) {
  const words: Word[] = [];
  text.split(/(\*[^*]+\*)/).filter(Boolean).forEach((part) => {
    if (part.startsWith("*") && part.endsWith("*")) { words.push({ t: part.slice(1, -1).trim(), k: true }); return; }
    part.split(/\s+/).filter(Boolean).forEach((t) => words.push({ t, k: false }));
  });
  return { words, plain: text.replace(/\*/g, "") };
}

export function Say({ text, as: Tag = "h2", id, className, auto = true, snap = false }: { text: string; as?: ElementType; id?: string; className?: string; auto?: boolean; snap?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const { words, plain } = splitSay(text);
  useGSAP(() => {
    if (!auto) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_MQ, () => {
      const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: root.current, start: "top 85%", end: "top 45%", scrub: 0.5 } });
      sayIn(tl, root.current!, 0, 1, snap);
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [text] });
  return (
    <Tag ref={root} id={id} className={`x3-say${className ? ` ${className}` : ""}`}>
      <span className="x3-sr">{plain}</span>
      <span className="x3-say-v" aria-hidden="true">
        {words.map((w, i) => (
          <Fragment key={i}>
            {i > 0 && " "}
            <span className={`x3-w${w.k ? " k" : ""}`}><span className="x3-wi">{w.t}{w.k && <i className="x3-u" />}</span></span>
          </Fragment>
        ))}
      </span>
    </Tag>
  );
}

/** Entrada palabra por palabra (cada una sube en su máscara), la clave se enciende y su subrayado se dibuja. Con `snap`, la
 *  frase clave no sube: aparece entera de un cuadro al siguiente al 85 % de la entrada (y se va igual al subir). */
export function sayIn(tl: gsap.core.Timeline, el: Element, at: number | string, span = 1, snap = false) {
  const q = gsap.utils.selector(el);
  const ws = q(snap ? ".x3-w:not(.k) .x3-wi" : ".x3-wi"), ks = q(".k .x3-wi"), us = q(".x3-u");
  tl.fromTo(ws, { yPercent: 112 }, { yPercent: 0, duration: 0.55 * span, stagger: (0.35 * span) / Math.max(1, ws.length), ease: "power3.out" }, at);
  if (snap && ks.length) { tl.set(ks, { yPercent: 112, opacity: 1 }, at).set(ks, { yPercent: 0 }, typeof at === "number" ? at + 0.85 * span : ">"); }
  else if (ks.length) tl.fromTo(ks, { opacity: 0.42 }, { opacity: 1, duration: 0.25 * span, ease: "power1.in" }, `>-${0.15 * span}`);
  if (us.length) tl.fromTo(us, { scaleX: 0 }, { scaleX: 1, duration: 0.3 * span, stagger: 0.05 * span, ease: "power2.inOut" }, "<");
  return tl;
}

/** Salida palabra por palabra hacia arriba, cada una dentro de su máscara. */
export function sayOut(tl: gsap.core.Timeline, el: Element, at: number | string, span = 1) {
  const ws = gsap.utils.selector(el)(".x3-wi");
  tl.to(ws, { yPercent: -112, duration: 0.5 * span, stagger: (0.3 * span) / Math.max(1, ws.length), ease: "power2.in" }, at);
  return tl;
}
