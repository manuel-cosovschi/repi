"use client";
// GSAP con ScrollTrigger registrado una sola vez (Experience 3.0). Único motor de animación de /conoce.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Movimiento reducido: las escenas muestran su estado final, sin cámara ni scrub. */
export const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** Escenas fijadas (pin + scrub) sólo con movimiento y con alto suficiente: con poco alto (zoom fuerte, teléfono acostado)
 *  el contenido no entra en una pantalla y se muestra apilado, como con movimiento reducido. Para gsap.matchMedia. */
export const PIN_MQ = "(prefers-reduced-motion: no-preference) and (min-height: 560px)";
export const STACK_MQ = "(prefers-reduced-motion: reduce), (max-height: 559px)";
export { gsap, ScrollTrigger, useGSAP };
