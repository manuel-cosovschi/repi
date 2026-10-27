"use client";
// M03 (motion.md): carga ambiental acotada al panel que realmente está cargando.
// · No aparece si los datos llegan antes de 180 ms (sin espera mínima ni porcentajes inventados).
// · Entra en 200 ms; la esfera flota ±4 px en 2400 ms (seno) con escala .98–1.02.
// · Al resolver: el ambiente sale en 200 ms y el contenido entra en 240 ms, solapados (interactivo antes de 320 ms).
// · Error o vacío: lo resuelve quien lo usa con su propia UI y reintento; este componente nunca queda en bucle.
// · Movimiento reducido: indicador y texto estáticos; resultado inmediato.
// Listo para Body Intelligence cuando exista su flujo real (hoy no hay endpoint: pendiente en motion.md).
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

export const AMBIENT_DELAY_MS = 180;

/** Fases del revelado para un recurso que pasa de pendiente a listo (o error). */
export function useReveal(settled: boolean) {
  const [ambient, setAmbient] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const wasAmbient = useRef(false);
  useEffect(() => {
    if (settled) {
      if (wasAmbient.current) {
        wasAmbient.current = false;
        setAmbient(false);
        if (prefersReducedMotion()) return; // resultado inmediato, sin cruce
        setLeaving(true);
        const t = setTimeout(() => setLeaving(false), 240);
        return () => clearTimeout(t);
      }
      return;
    }
    const t = setTimeout(() => { wasAmbient.current = true; setAmbient(true); }, AMBIENT_DELAY_MS);
    return () => clearTimeout(t);
  }, [settled]);
  return { ambient, leaving };
}

export function Ambient({ label, leaving = false }: { label: string; leaving?: boolean }) {
  return (
    <div className={`ambient${leaving ? " out" : ""}`} role={leaving ? undefined : "status"} aria-hidden={leaving || undefined}>
      <span className="ambient-halo" aria-hidden="true" />
      <span className="ambient-orb" aria-hidden="true" />
      <span className="ambient-txt">{label}</span>
    </div>
  );
}
