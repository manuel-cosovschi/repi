"use client";
// M06 (docs/MOTION_NAVEGACION.md §6): indicador deslizante medido para segmentos, pestañas y el menú lateral, con el patrón
// de M01 (DayTabs): toma la posición y el tamaño del elemento elegido (aria-selected / aria-current / aria-pressed) y se
// mueve en 200 ms con --ease-std; un toque nuevo lo redirige desde donde está (transición CSS). No anima al aparecer ni con
// movimiento reducido (salta). Decorativo: aria-hidden, sin rol; la semántica del tablist o del nav no cambia.
import { useLayoutEffect, useRef, type RefCallback } from "react";
import { EASE, M06, canAnimate, play } from "@/lib/motion";

const SEL = ':scope > [aria-selected="true"], :scope > [aria-current="page"], :scope > [aria-current="true"], :scope > [aria-pressed="true"]';

export function SlideIndicator({ variant = "fill" }: { variant?: "fill" | "line" }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const ind = ref.current;
    const host = ind?.parentElement;
    if (!ind || !host) return;
    host.classList.add("slide-host");
    let first = true;
    const place = () => {
      const sel = host.querySelector<HTMLElement>(SEL);
      if (!sel || !sel.offsetWidth) { ind.style.opacity = "0"; first = true; return; }
      const x = sel.offsetLeft, w = sel.offsetWidth;
      const h = variant === "line" ? 2 : sel.offsetHeight;
      const y = variant === "line" ? sel.offsetTop + sel.offsetHeight - 2 : sel.offsetTop;
      if (first || !canAnimate()) ind.setAttribute("data-instant", "");
      ind.style.opacity = "";
      ind.style.transform = `translate(${x}px, ${y}px)`;
      ind.style.width = `${w}px`;
      ind.style.height = `${h}px`;
      if (ind.hasAttribute("data-instant")) { void ind.offsetWidth; ind.removeAttribute("data-instant"); }
      first = false;
    };
    place();
    const mo = new MutationObserver(place);
    mo.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-selected", "aria-current", "aria-pressed"] });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    ro?.observe(host);
    return () => { mo.disconnect(); ro?.disconnect(); host.classList.remove("slide-host"); };
  }, [variant]);
  return <i ref={ref} className="slide-ind" data-variant={variant} data-instant="" aria-hidden="true" />;
}

/** Panel de segmento que entra (160 ms, 8 px en el sentido del cambio y opacidad), sin salida. */
export function useEnter<K extends string>(key: K, order: readonly K[]): RefCallback<HTMLElement> {
  const prev = useRef(key);
  const el = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = key;
    if (from === key || !el.current) return;
    const d = Math.sign(order.indexOf(key) - order.indexOf(from)) || 1;
    play(el.current, [{ opacity: 0, transform: `translateX(${8 * d}px)` }, { opacity: 1, transform: "none" }], { duration: M06.seg, easing: EASE.out });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (n) => { el.current = n; };
}
