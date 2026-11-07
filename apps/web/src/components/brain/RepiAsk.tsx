"use client";
// Asistente REPI (D210) · entrada contextual «Preguntale a REPI». Abre el panel con el contexto de la pantalla (sólo
// identificadores; el servidor los valida). Sin el módulo encendido no se muestra. Nunca empieza con el nombre de una pestaña
// (la guía de la demo busca el primer botón que empieza con «Inicio», «Entrenar», «Progreso», «Mensajes» o «Gym»).
import { ChatCircleDots } from "@phosphor-icons/react";
import { Ic } from "@/components/ui/Ic";
import { useBrain, type OpenOpts } from "./BrainProvider";
import type { BrainRef } from "./types";

/** `refs`: identificadores de la pantalla (se llama así porque `ref` es una prop reservada de React). */
export function RepiAsk({ label = "Preguntale a REPI", aria, className = "linkbtn rp-ask", before, refs, ...rest }: Omit<OpenOpts, "ref"> & { refs?: BrainRef | null; label?: string; aria?: string; className?: string; before?: () => void }) {
  const o: OpenOpts = { ...rest, ref: refs ?? null };
  const brain = useBrain();
  if (!brain.enabled) return null;
  return (
    <button type="button" className={className} aria-label={aria} onClick={() => {
      // Desde una hoja modal: primero se cierra (el panel no queda debajo del fondo) y después se abre.
      if (before) { before(); setTimeout(() => brain.open(o), 0); } else brain.open(o);
    }}>
      <Ic i={ChatCircleDots} size={16} />{label}
    </button>
  );
}
