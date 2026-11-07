"use client";
// Escenario fijo detrás de la página: la sala (SVG al instante; 3D cuando el equipo lo permite, cargado después del primer
// pintado) y el director de tomas. Cada sección declara `data-shot` (toma de cámara) y opcionalmente `data-solid` (la tapa:
// la sala deja de dibujarse). El scroll mezcla la toma anterior con la de la sección que entra: es reversible por diseño.
// El director guarda la posición de cada sección en el documento (al montar, al cambiar el tamaño y en cada refresh de
// ScrollTrigger) y en cada cuadro sólo lee scrollY: no mide el diseño mientras se hace scroll.
// El 3D es decorativo: si su código no carga, si WebGL falla o si se pierde el contexto, queda el SVG y la página sigue igual.
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollTrigger, watchLayout, whenIdle } from "../x3/gsap";
import { SalaSvg } from "./SalaSvg";
import { detectQuality, stage, type Quality } from "./store";
import type { ShotId } from "./model";

const load3d = () => import("./SalaCanvas");
const SalaCanvas = dynamic(load3d, { ssr: false });

/** Si el 3D falla al cargar o al crear el contexto, no muestra nada (queda el SVG) en lugar de tirar abajo la página. */
class Quiet extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function useShotDirector() {
  useEffect(() => {
    type Sec = { el: HTMLElement; top: number; h: number; shot: ShotId; solid: boolean };
    let secs: Sec[] = [];
    let raf = 0;
    // Lee todas las posiciones de una vez (fuera del scroll) y las guarda relativas al documento.
    const measure = () => {
      const y = window.scrollY;
      secs = [...document.querySelectorAll<HTMLElement>("[data-shot]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { el, top: r.top + y, h: r.height, shot: el.dataset.shot as ShotId, solid: el.dataset.solid === "1" };
      });
    };
    const update = () => {
      raf = 0;
      const vh = window.innerHeight, y = window.scrollY;
      let i = -1, t = 0;
      for (let k = 0; k < secs.length; k++) {
        const top = secs[k].top - y;
        if (top <= vh * 0.85) { i = k; t = Math.min(1, Math.max(0, (vh * 0.85 - top) / (vh * 0.6))); }
      }
      const cur = secs[i], prev = secs[i - 1];
      const covered = secs.some((s) => s.solid && s.top - y <= 0 && s.top + s.h - y >= vh);
      stage.set({ a: prev?.shot ?? "hero", b: cur?.shot ?? "hero", t: cur ? t : 1, hidden: covered });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    const remeasure = () => { measure(); onScroll(); };
    // La primera medición, en un momento libre (la página arranca en el hero, que es la toma inicial de la tienda); después,
    // en cada refresh de ScrollTrigger y al cambiar el tamaño.
    const cancel = whenIdle(remeasure, 1000);
    // Un perfil elegido cambia su toma (`data-shot`): sólo cambia el nombre, no las posiciones, pero se relee todo junto.
    const mo = new MutationObserver(remeasure);
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-shot"] });
    ScrollTrigger.addEventListener("refresh", remeasure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", remeasure);
    return () => {
      cancel(); mo.disconnect(); ScrollTrigger.removeEventListener("refresh", remeasure);
      window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", remeasure); cancelAnimationFrame(raf);
    };
  }, []);
}

/** Capas que dependen de la tienda y no del nivel: el velo frío (`tone`) y la luz del encendido del hero (máscara radial). */
function useLayers(world: React.RefObject<HTMLDivElement | null>, tone: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let lastTone = "", lastReveal = "";
    const upd = () => {
      const s = stage.get();
      const tn = String(+s.tone.toFixed(3));
      if (tn !== lastTone && tone.current) { tone.current.style.opacity = tn; lastTone = tn; }
      const w = world.current; if (!w) return;
      const rv = s.reveal;
      const key = rv ? `${rv.x | 0}|${rv.y | 0}|${rv.r | 0}` : "";
      if (key === lastReveal) return;
      lastReveal = key;
      if (!rv) { delete w.dataset.reveal; return; }
      w.dataset.reveal = "";
      w.style.setProperty("--ox", `${rv.x.toFixed(0)}px`); w.style.setProperty("--oy", `${rv.y.toFixed(0)}px`); w.style.setProperty("--r", `${rv.r.toFixed(0)}px`);
    };
    upd();
    return stage.subscribe(upd);
  }, [world, tone]);
}

export function Stage() {
  const [quality, setQuality] = useState<Quality | null>(null);
  const [still, setStill] = useState(false);
  /** mount: se monta el 3D (navegador libre). shown: el 3D ya dibujó su primer cuadro y reemplaza al SVG. */
  const [mount3d, setMount3d] = useState(false);
  const [shown3d, setShown3d] = useState(false);
  const world = useRef<HTMLDivElement>(null), tone = useRef<HTMLDivElement>(null);
  useShotDirector();
  useLayers(world, tone);
  useEffect(() => watchLayout(), []);
  useEffect(() => {
    const q = detectQuality();
    setQuality(q);
    setStill(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    document.documentElement.dataset.sala = q;
    if (q === "low") return;
    // El 3D entra cuando el navegador está libre y terminó el encendido del hero (la caída del punto no compite con la carga
    // del código ni con la compilación de la escena): el título (LCP) y los botones ya están pintados. El SVG sigue visible
    // hasta que el 3D dibuja su primer cuadro (sin hueco mientras baja el código).
    const go = () => { void load3d().catch(() => {}); setMount3d(true); };
    const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    let id = 0, done = false;
    const schedule = () => { if (done) return; done = true; off(); clearTimeout(cap); id = ric ? ric(go, { timeout: 1200 }) : window.setTimeout(go, 300); };
    const settled = () => { const s = stage.get(); return s.lit >= 1 && !s.reveal; };
    const off = stage.subscribe(() => { if (settled()) schedule(); });
    const cap = window.setTimeout(schedule, 4000); // si el encendido no llega (pestaña oculta, error), igual entra
    if (settled()) schedule();
    return () => { off(); clearTimeout(cap); if (!ric) clearTimeout(id); };
  }, []);
  // Al cambiar de nivel cambia la proyección a pantalla: las escenas que ubican cosas sobre la sala se vuelven a medir.
  useEffect(() => {
    if (stage.get().gl === shown3d) return;
    stage.set({ gl: shown3d });
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 60);
    return () => clearTimeout(id);
  }, [shown3d]);
  const ready = useCallback(() => setShown3d(true), []);
  const fail = useCallback(() => { setShown3d(false); setMount3d(false); }, []);
  const on3d = mount3d && quality !== null && quality !== "low";
  return (
    <div className="sala" aria-hidden="true" data-3d={shown3d ? "1" : "0"}>
      <div ref={world} className="sala-world">
        <SalaSvg animate={quality !== null && quality !== "low" && !shown3d} still={still} />
        {on3d && <div className="sala-3d"><Quiet onError={fail}><SalaCanvas quality={quality} onReady={ready} onLost={fail} /></Quiet></div>}
      </div>
      <div ref={tone} className="sala-tone" />
      <div className="sala-vignette" />
    </div>
  );
}
