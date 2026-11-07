"use client";
// Barra «Cristal flotante» de la app del alumno (G · Atlética, REPI_SELECCION_VISUAL.md) con M06 «Carril»
// (docs/MOTION_NAVEGACION.md §4): el indicador sale como un sprint en el mismo toque (estado urgente, antes de dibujar la
// sección), el ícono destino arranca con rebote, al aparecer Gym los botones se reacomodan (FLIP) y tocar otra vez la
// pestaña activa lleva el scroll arriba. Marcado y nombres accesibles iguales a los de antes (pruebas por rol y nombre).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { Ic } from "@/components/ui/Ic";
import { prefetch } from "@/lib/cache";
import { EASE, M06, canAnimate, play } from "@/lib/motion";
import { featureOn } from "@/lib/features";
import { preloadHints } from "./Hint";

/** Lectura anticipada en el pointerdown: los endpoints de la primera vista de cada sección (gana 50–100 ms en la primera
 *  visita). Las URL son exactamente las que pide cada sección (la caché es por URL). */
const PREFETCH: Record<string, string[]> = {
  gym: ["/api/me/gym/home"], msgs: ["/api/messages"],
  prog: [...(featureOn("progress") ? ["/api/me/progress/summary?range=90d", "/api/me/progress/exercises?q="] : []), "/api/me/level"],
};

export function TabBar<K extends string>({ tabs, active, onGo, badge }: {
  tabs: readonly (readonly [K, string, Icon])[];
  active: string;
  onGo: (k: K) => void;
  badge?: (k: K) => ReactNode;
}) {
  // El indicador, el color y aria-current siguen al toque (urgente); el contenido llega con startTransition (onGo).
  const [cur, setCur] = useState(active);
  const [seen, setSeen] = useState(active);
  if (seen !== active) { setSeen(active); setCur(active); }
  const i = tabs.findIndex((x) => x[0] === cur);
  const nav = useRef<HTMLElement>(null);
  const ind = useRef<HTMLElement>(null);
  // Las ayudas vistas (marcas «Nuevo» de Progreso) se leen en segundo plano al abrir la app: al entrar a la sección ya se
  // sabe si van, y se dibujan en el primer cuadro sin correr los botones.
  useEffect(() => { preloadHints(); }, []);

  // FLIP cuando aparece la pestaña Gym (4 → 5 columnas): los botones se reacomodan y el nuevo entra con escala.
  const rects = useRef(new Map<string, number>());
  const n = tabs.length;
  useLayoutEffect(() => {
    const btns = [...(nav.current?.querySelectorAll<HTMLElement>(":scope > button[data-k]") ?? [])];
    const before = rects.current;
    if (before.size && before.size !== btns.length && canAnimate()) {
      for (const b of btns) {
        const old = before.get(b.dataset.k!);
        const now = b.getBoundingClientRect().left;
        if (old == null) play(b, [{ transform: "scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: M06.sprint, easing: EASE.spring });
        else if (Math.abs(old - now) > .5) play(b, [{ transform: `translateX(${old - now}px)` }, { transform: "none" }], { duration: M06.sprint, easing: EASE.std });
      }
    }
    rects.current = new Map(btns.map((b) => [b.dataset.k!, b.getBoundingClientRect().left]));
  }, [n]);

  // Sprint: traslación al destino (240 ms, --ease-std) más estiramiento sobre `scale` (independiente de la traslación). Se
  // arranca con startTime explícito: el indicador ya se mueve en el primer cuadro después del toque. Un toque nuevo lo
  // redirige desde donde está. Sin animación (movimiento reducido), salta: lo ubica el CSS con --i.
  const prevI = useRef(i);
  useLayoutEffect(() => {
    const from = prevI.current;
    prevI.current = i;
    const el = ind.current;
    if (!el || from === i || from < 0 || i < 0 || !canAnimate()) return;
    const w = el.offsetWidth;
    let x0 = from * w;
    for (const a of el.getAnimations()) {
      if (a.id !== "sprint") continue;
      x0 = new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
      a.cancel();
    }
    const now = document.timeline.currentTime;
    const run = (a: Animation | null, id: string) => { if (!a) return; a.id = id; try { if (now != null) a.startTime = now; } catch { /* */ } };
    run(play(el, [{ transform: `translateX(${x0}px)` }, { transform: `translateX(${i * w}px)` }], { duration: M06.sprint, easing: EASE.std }), "sprint");
    if (typeof CSS !== "undefined" && CSS.supports?.("scale", "1")) {
      const s = 1 + Math.min(.32, .16 * Math.abs(i - from));
      run(play(el, [{ scale: "1 1" }, { scale: `${s} .9`, offset: .4 }, { scale: "1 1" }], { duration: M06.sprint, easing: "ease-out" }), "stretch");
    }
  }, [i]);

  const pick = (k: K) => {
    if (k === cur && k === active) {
      // Convención de iOS: tocar la pestaña activa vuelve arriba (sin animar la sección).
      window.scrollTo({ top: 0, behavior: canAnimate() ? "smooth" : "instant" });
      return;
    }
    setCur(k);
    // El contenido arranca en el cuadro siguiente: el indicador se pinta primero y el render de la sección (en
    // startTransition dentro de onGo) nunca demora su arranque.
    requestAnimationFrame(() => onGo(k));
  };

  return (
    <nav ref={nav} className="tabbar" aria-label="Principal" style={{ ["--n" as string]: n, ["--i" as string]: i }}>
      <i ref={ind} className="tab-ind" aria-hidden="true" data-off={i >= 0 ? undefined : "1"} />
      {tabs.map(([k, l, d]) => (
        <button key={k} data-k={k} type="button" aria-current={cur === k ? "page" : undefined} style={{ position: "relative" }}
          onPointerDown={() => PREFETCH[k]?.forEach(prefetch)} onClick={() => pick(k)}>
          <Ic i={d} size={24} /><span className="tab-lbl">{l}</span>
          {badge?.(k)}
        </button>
      ))}
    </nav>
  );
}
