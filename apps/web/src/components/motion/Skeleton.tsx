"use client";
// M06 (docs/MOTION_NAVEGACION.md §5): la primera visita ya tiene la forma final. Los esqueletos (--ui-skeleton) ocupan el
// alto de la tarjeta real y son decorativos (aria-hidden): la sección anuncia «Cargando …» con un role=status oculto.
// `Reveal` hace entrar un bloque opcional que llega después de pintar (alto 0 → real en 200 ms); si ya estaba al montar
// (dato de caché), aparece al instante.
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { EASE, play } from "@/lib/motion";

export function Skel({ w = "100%", h = 14, r = 6, style, className }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties; className?: string }) {
  return <span aria-hidden="true" className={className ? `skel ${className}` : "skel"} style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/** Tarjeta en esqueleto del alto de la real: título y renglones. */
export function SkelCard({ h = 96, lines = 2, title = true, className, style }: { h?: number; lines?: number; title?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" className={className ? `skel-card ${className}` : "skel-card"} style={{ minHeight: h, ...style }}>
      {title && <Skel w="42%" h={16} />}
      {Array.from({ length: lines }, (_, i) => <Skel key={i} w={i === lines - 1 ? "64%" : "100%"} h={12} />)}
    </div>
  );
}

/** Estado de carga para lectores de pantalla (los esqueletos son aria-hidden). */
export function Loading({ what }: { what: string }) {
  return <span role="status" className="sr-only">Cargando {what}</span>;
}

/**
 * Bloque opcional que aparece cuando llega su dato. Si `on` ya era verdadero al montar, no anima. Entra con alto 0 → real
 * (y el espacio del gap del contenedor) en 200 ms y opacidad en 160 ms; con movimiento reducido, al instante.
 */
export function Reveal({ on, children, className, style }: { on: boolean; children?: ReactNode; className?: string; style?: CSSProperties }) {
  const first = useRef(on);
  const done = useRef(on);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!on || done.current) return;
    done.current = true;
    const el = ref.current;
    if (!el || first.current) return;
    const h = el.getBoundingClientRect().height;
    if (!h) return;
    const gap = el.parentElement ? parseFloat(getComputedStyle(el.parentElement).rowGap) || 0 : 0;
    play(el, [{ height: "0px", marginTop: `${-gap}px`, overflow: "hidden" }, { height: `${h}px`, marginTop: "0px", overflow: "hidden" }], { duration: 200, easing: EASE.std });
    play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: EASE.std });
  }, [on]);
  if (!on) return null;
  return <div ref={ref} className={className} style={style}>{children}</div>;
}
