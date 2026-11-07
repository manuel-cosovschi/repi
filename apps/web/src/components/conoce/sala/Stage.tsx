"use client";
// Escenario fijo detrás de la página: la sala (SVG al instante; 3D cuando el equipo lo permite, cargado después del primer
// pintado) y el director de tomas. Cada sección declara `data-shot` (toma de cámara) y opcionalmente `data-solid` (la tapa:
// la sala deja de dibujarse). El scroll mezcla la toma anterior con la de la sección que entra: es reversible por diseño.
// El 3D es decorativo: si su código no carga, si WebGL falla o si se pierde el contexto, queda el SVG y la página sigue igual.
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
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
    type Sec = { el: HTMLElement; shot: ShotId; solid: boolean };
    let secs: Sec[] = [];
    let raf = 0;
    const measure = () => { secs = [...document.querySelectorAll<HTMLElement>("[data-shot]")].map((el) => ({ el, shot: el.dataset.shot as ShotId, solid: el.dataset.solid === "1" })); };
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      let i = -1, t = 0;
      for (let k = 0; k < secs.length; k++) {
        const top = secs[k].el.getBoundingClientRect().top;
        if (top <= vh * 0.85) { i = k; t = Math.min(1, Math.max(0, (vh * 0.85 - top) / (vh * 0.6))); }
      }
      const cur = secs[i], prev = secs[i - 1];
      const covered = secs.some((s) => { if (!s.solid) return false; const r = s.el.getBoundingClientRect(); return r.top <= 0 && r.bottom >= vh; });
      stage.set({ a: prev?.shot ?? "dark", b: cur?.shot ?? "hero", t: cur ? t : 1, hidden: covered });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    measure(); update();
    const mo = new MutationObserver(() => { measure(); onScroll(); });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-shot"] });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { mo.disconnect(); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
}

export function Stage() {
  const [quality, setQuality] = useState<Quality | null>(null);
  const [still, setStill] = useState(false);
  /** mount: se monta el 3D (navegador libre). shown: el 3D ya dibujó su primer cuadro y reemplaza al SVG. */
  const [mount3d, setMount3d] = useState(false);
  const [shown3d, setShown3d] = useState(false);
  useShotDirector();
  useEffect(() => {
    const q = detectQuality();
    setQuality(q);
    setStill(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    document.documentElement.dataset.sala = q;
    if (q === "low") return;
    // El 3D entra cuando el navegador está libre: el título (LCP) y los botones ya están pintados. El SVG sigue visible hasta
    // que el 3D dibuja su primer cuadro (sin hueco mientras baja el código).
    const go = () => { void load3d().catch(() => {}); setMount3d(true); };
    const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = ric ? ric(go, { timeout: 1800 }) : window.setTimeout(go, 900);
    return () => { if (!ric) clearTimeout(id); };
  }, []);
  const ready = useCallback(() => setShown3d(true), []);
  const fail = useCallback(() => { setShown3d(false); setMount3d(false); }, []);
  const on3d = mount3d && quality !== null && quality !== "low";
  return (
    <div className="sala" aria-hidden="true" data-3d={shown3d ? "1" : "0"}>
      <SalaSvg animate={quality !== null && quality !== "low" && !shown3d} still={still} />
      {on3d && <div className="sala-3d"><Quiet onError={fail}><SalaCanvas quality={quality} onReady={ready} onLost={fail} /></Quiet></div>}
      <div className="sala-vignette" />
    </div>
  );
}
