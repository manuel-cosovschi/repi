// Utilidades de movimiento compartidas (motion.md §10). Duraciones y curvas salen de los tokens (@repi/domain/tokens);
// las específicas de M01–M05 se documentan en motion.md y no se reemplazan por el fundido general de 160 ms.
import { useEffect, useState } from "react";
import { tokens } from "@repi/domain/tokens";

export const EASE = tokens.motion.easing; // std, out, in, spring (curva, no resorte físico)
export const DUR = tokens.motion.duration_ms;

export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
