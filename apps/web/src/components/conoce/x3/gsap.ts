"use client";
// GSAP con ScrollTrigger registrado una sola vez (Experience 3.0). Único motor de animación de /conoce.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  // En los teléfonos, la barra del navegador que aparece y desaparece cambia el alto de la ventana: no se recalcula todo por eso.
  ScrollTrigger.config({ ignoreMobileResize: true });
}

/** Movimiento reducido: las escenas muestran su estado final, sin cámara ni scrub. */
export const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** Escenas fijadas (sticky + scrub) sólo con movimiento y con alto suficiente: con poco alto (zoom fuerte, teléfono acostado)
 *  el contenido no entra en una pantalla y se muestra apilado, como con movimiento reducido. Para gsap.matchMedia. */
export const PIN_MQ = "(prefers-reduced-motion: no-preference) and (min-height: 560px)";
export const STACK_MQ = "(prefers-reduced-motion: reduce), (max-height: 559px)";
/** Con movimiento (cualquier alto): entradas que acompañan al scroll. */
export const MOTION_MQ = "(prefers-reduced-motion: no-preference)";

/** Un solo observador para toda la página: si cambia el alto del documento (pestañas de perfiles, preguntas, puertas de
 *  demos) o terminan de cargar las fuentes, ScrollTrigger se recalcula una vez, fuera del cuadro de la interacción. Lo monta
 *  el escenario (Stage), que existe una sola vez. Devuelve la limpieza. */
export function watchLayout() {
  let lastH = Math.round(document.body.getBoundingClientRect().height), timer = 0, alive = true;
  const ro = new ResizeObserver(([e]) => {
    const h = Math.round(e.contentRect.height); if (h === lastH) return;
    lastH = h; clearTimeout(timer); timer = window.setTimeout(() => ScrollTrigger.refresh(), 150);
  });
  ro.observe(document.body);
  const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 200));
  void document.fonts?.ready.then(() => idle(() => { if (alive) ScrollTrigger.refresh(); }, { timeout: 1500 }));
  return () => { alive = false; ro.disconnect(); clearTimeout(timer); };
}
export { gsap, ScrollTrigger, useGSAP };
