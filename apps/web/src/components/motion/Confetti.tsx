"use client";
// M02: overlay decorativo de partículas. pointer-events: none, oculto a lectores de pantalla, se desmonta solo a los 1200 ms.
// No se monta con movimiento reducido (lo decide quien lo usa).
import { useEffect, useRef } from "react";
import { CONFETTI, at, particles } from "@/lib/confetti";

export function Confetti({ seed, origin, onDone }: { seed: number; origin: () => { x: number; y: number } | null; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) { onDone(); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
    size();
    const ps = particles(seed);
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = now - t0;
      const o = origin() ?? { x: innerWidth / 2, y: innerHeight * 0.22 };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of ps) {
        const s = at(p, t);
        if (!s) continue;
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.translate(o.x + s.x, o.y + s.y);
        ctx.rotate(s.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < CONFETTI.end) raf = requestAnimationFrame(frame);
      else onDone();
    };
    raf = requestAnimationFrame(frame);
    // Garantía de desmontaje aunque el navegador no entregue cuadros (pestaña en segundo plano, ahorro de energía).
    const stop = setTimeout(onDone, CONFETTI.end + 100);
    addEventListener("resize", size);
    return () => { cancelAnimationFrame(raf); clearTimeout(stop); removeEventListener("resize", size); };
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
