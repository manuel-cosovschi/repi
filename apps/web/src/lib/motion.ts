// Utilidades de movimiento compartidas (motion.md §10). Duraciones y curvas salen de los tokens (@repi/domain/tokens);
// las específicas de M01–M05 se documentan en motion.md y no se reemplazan por el fundido general de 160 ms.
import { useEffect, useState } from "react";
import { tokens } from "@repi/domain/tokens";

export const EASE = tokens.motion.easing; // std, out, in, spring (curva, no resorte físico)
export const DUR = tokens.motion.duration_ms;

export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * M06 «Carril» (docs/MOTION_NAVEGACION.md): se anima por JavaScript sólo con Web Animations presente y sin movimiento
 * reducido. La regla global de CSS (`animation: none !important`) no alcanza a Element.animate: toda animación por JS pasa
 * por acá.
 */
export const canAnimate = () => typeof window !== "undefined" && typeof Element !== "undefined" && typeof Element.prototype.animate === "function" && !prefersReducedMotion();

/** Element.animate con la guarda de canAnimate(); devuelve la animación o null (sin animar, queda el estado final de CSS). */
export function play(el: Element | null | undefined, keyframes: Keyframe[] | PropertyIndexedKeyframes, opts: KeyframeAnimationOptions): Animation | null {
  if (!el || !canAnimate()) return null;
  try { return el.animate(keyframes, opts); } catch { return null; }
}

/** Tiempos y distancias de M06 (motion.md §13). Todo termina en ≤ 240 ms y sólo mueve transform, opacity y clip-path. */
export const M06 = {
  exit: DUR.section_exit,          // salida de sección: 100 ms, --ease-in
  enter: DUR.section_enter,        // entrada de sección: 200 ms, --ease-out, sin retardo
  enterDesk: DUR.screen_desktop,   // entrada en el eje vertical del escritorio: 220 ms
  stagger: DUR.stagger,            // formación: paso de 20 ms
  form: 180,                       // formación: cada bloque en 180 ms
  sprint: DUR.screen_mobile,       // indicador de la barra y arranque del ícono: 240 ms
  slide: 200,                      // indicador deslizante (segmentos y menú lateral), como M01
  title: 200, line: 240,           // corte de meta: título 200 ms, línea 240 ms
  seg: 160,                        // panel de segmento: 160 ms, sin salida
  press: DUR.press,                // toque: 90 ms
  exitFast: DUR.exit,              // salidas de hojas, avisos y fondos
  shift: 24, depth: 32, away: 12,  // px: entrada, profundidad y salida en el eje x
  yIn: 12, yOut: 6,                // px: entrada y salida en el eje y (escritorio staff)
  rise: 12,                        // px: «volver» (al salir del entrenamiento)
} as const;

/** Preferencia de movimiento reducido, reactiva a cambios del sistema. */
export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!m) return;
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}
