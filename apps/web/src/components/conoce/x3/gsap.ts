"use client";
// GSAP con ScrollTrigger registrado una sola vez (Experience 3.0). Único motor de animación de /conoce.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Movimiento reducido: las escenas muestran su estado final, sin cámara ni scrub. */
export const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export { gsap, ScrollTrigger, useGSAP };
