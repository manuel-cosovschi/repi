"use client";
// Escenario fijo detrás de la página: la sala (SVG al instante; 3D cuando el equipo lo permite, cargado después del primer
// pintado) y el director de tomas. Cada sección declara `data-shot` (toma de cámara) y opcionalmente `data-solid` (la tapa:
// la sala deja de dibujarse). El scroll mezcla la toma anterior con la de la sección que entra: es reversible por diseño.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SalaSvg } from "./SalaSvg";
import { detectQuality, stage, type Quality } from "./store";
import type { ShotId } from "./model";

const SalaCanvas = dynamic(() => import("./SalaCanvas"), { ssr: false });

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
  const [ready3d, setReady3d] = useState(false);
  useShotDirector();
  useEffect(() => {
    const q = detectQuality();
    setQuality(q);
    document.documentElement.dataset.sala = q;
    if (q === "low") return;
    // El 3D entra cuando el navegador está libre: el título (LCP) y los botones ya están pintados.
    const go = () => setReady3d(true);
    const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = ric ? ric(go, { timeout: 1800 }) : window.setTimeout(go, 900);
    return () => { if (!ric) clearTimeout(id); };
  }, []);
  return (
    <div className="sala" aria-hidden="true" data-3d={ready3d ? "1" : "0"}>
      <SalaSvg animate={quality !== null && quality !== "low"} />
      {ready3d && quality && quality !== "low" && <div className="sala-3d"><SalaCanvas quality={quality} /></div>}
      <div className="sala-vignette" />
    </div>
  );
}
