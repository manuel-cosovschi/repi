"use client";
// M05 (motion.md): novedades del gym en tarjetas deslizables. Un solo controlador: scroll horizontal nativo con
// scroll-snap (respeta el gesto vertical y la inercia del navegador). Botones Anterior/Siguiente de 44 px y teclado.
// El índice sale de la tarjeta realmente visible y se actualiza al asentarse (sin anuncios continuos).
// Sin autoplay, sin 3D, sin scroll infinito. Movimiento reducido: los botones saltan sin animación.
import { useCallback, useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Ic } from "@/components/ui/Ic";
import { prefersReducedMotion } from "@/lib/motion";

export function Carousel<T extends { id: string }>({ items, label, render, resetKey }: { items: T[]; label: string; render: (x: T) => React.ReactNode; resetKey: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);
  const curId = useRef<string | null>(items[0]?.id ?? null);

  const visible = useCallback(() => {
    const el = track.current;
    if (!el) return 0;
    const cards = [...el.children] as HTMLElement[];
    const left = el.scrollLeft + 1;
    let best = 0;
    cards.forEach((c, i) => { if (c.offsetLeft - el.offsetLeft <= left) best = i; });
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) best = cards.length - 1;
    return best;
  }, []);

  // Asentamiento: scrollend donde existe; si no, una espera corta tras el último evento de scroll.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout>;
    const settle = () => { const i = visible(); setCur(i); curId.current = items[i]?.id ?? null; };
    const onScroll = () => { clearTimeout(t); t = setTimeout(settle, 120); };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", settle);
    return () => { clearTimeout(t); el.removeEventListener("scroll", onScroll); el.removeEventListener("scrollend", settle); };
  }, [items, visible]);

  // Otro gimnasio o sede: volver al inicio. Una recarga conserva la tarjeta actual por id si sigue existiendo.
  useEffect(() => { track.current?.scrollTo({ left: 0 }); setCur(0); curId.current = items[0]?.id ?? null; }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const i = items.findIndex((x) => x.id === curId.current);
    go(i >= 0 ? i : Math.min(cur, items.length - 1), true);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (i: number, instant = false) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: instant || prefersReducedMotion() ? "auto" : "smooth" });
    setCur(i); curId.current = items[i]?.id ?? null;
  };

  if (!items.length) return null;
  const many = items.length > 1;
  return (
    <section className="crs" aria-roledescription="carrusel" aria-label={label} data-many={many ? "1" : undefined}>
      <div className="crs-track" ref={track} tabIndex={many ? 0 : -1} aria-label={many ? `${label}: deslizá o usá las flechas` : undefined}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(Math.min(items.length - 1, cur + 1)); } if (e.key === "ArrowLeft") { e.preventDefault(); go(Math.max(0, cur - 1)); } }}>
        {items.map((x, i) => (
          <div key={x.id} className="crs-card" role="group" aria-roledescription="tarjeta" aria-label={`${i + 1} de ${items.length}`}>{render(x)}</div>
        ))}
      </div>
      {many && (
        <div className="crs-bar">
          <button type="button" className="crs-btn" aria-label="Novedad anterior" disabled={cur === 0} onClick={() => go(cur - 1)}><Ic i={CaretLeft} size={18} /></button>
          <span className="crs-count" aria-live="polite">{cur + 1} de {items.length}</span>
          <button type="button" className="crs-btn" aria-label="Novedad siguiente" disabled={cur >= items.length - 1} onClick={() => go(cur + 1)}><Ic i={CaretRight} size={18} /></button>
        </div>
      )}
    </section>
  );
}
