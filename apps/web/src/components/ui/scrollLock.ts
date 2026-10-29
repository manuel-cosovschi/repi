"use client";
import { useEffect } from "react";

// QA 29/10 (A11Y-5): con una hoja o un modal abierto el fondo no se desplaza (en iOS el dedo arrastraba la página de
// atrás). Contador para hojas anidadas: el último en cerrarse devuelve el scroll.
let locks = 0;
let saved = "";
export function useScrollLock() {
  useEffect(() => {
    const html = document.documentElement;
    if (locks++ === 0) { saved = html.style.overflow; html.style.overflow = "hidden"; }
    return () => { if (--locks === 0) html.style.overflow = saved; };
  }, []);
}
