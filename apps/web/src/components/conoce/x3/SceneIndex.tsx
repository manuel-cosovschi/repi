"use client";
// Índice de escenas en el costado (escritorio) y medición de llegada a cada escena: un `scene_view` por escena y visita, sin
// rastrear el scroll. También marca la escena activa para el índice y lo retira sobre las secciones claras.
import { useEffect, useState } from "react";
import { track } from "@/lib/site-track";

/** Secciones claras: el índice (tinta clara) no se lee encima y se retira mientras están a la vista. */
const LIGHT = new Set(["caso", "contacto"]);
const SCENES: [string, string][] = [["cn-hero", "Inicio"], ["problema", "El problema"], ["en-accion", "En acción"], ["perfiles", "Perspectivas"], ["modos", "Modalidades"], ["funciones", "Producto"], ["demos", "Demos"], ["caso", "En gimnasios"], ["contacto", "Contacto"]];

export function SceneIndex() {
  const [on, setOn] = useState("cn-hero");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Set<string>();
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = e.target.id; setOn(id);
      if (!seen.has(id)) { seen.add(id); track("scene_view", { target: id }); }
    }), { rootMargin: "-40% 0px -55% 0px" });
    SCENES.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return (
    <nav className="x3-index" aria-label="Escenas" data-off={LIGHT.has(on) ? "" : undefined}>
      <ol>{SCENES.map(([id, l]) => <li key={id}><a href={`#${id}`} aria-current={on === id ? "true" : undefined}><span>{l}</span></a></li>)}</ol>
    </nav>
  );
}
