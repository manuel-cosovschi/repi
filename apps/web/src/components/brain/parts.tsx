"use client";
// Asistente REPI (D210) · piezas compartidas de la familia: la etiqueta de procedencia y la evidencia («¿Por qué te digo esto?»).
import { useId, useState } from "react";
import type { EvidenceVM, Origin } from "./presenter";

/** «Dato registrado» · «Calculado por REPI» · «Sugerencia con IA» · «Seguridad». Siempre visible junto a lo que dice REPI. */
export function OriginTag({ o }: { o: Origin }) {
  return <span className="rp-origin" data-kind={o.kind}>{o.label}</span>;
}

/** Evidencia en el cuerpo: qué se comparó, qué sesiones y qué se dejó afuera. */
export function EvidenceBody({ e }: { e: EvidenceVM }) {
  return (
    <div className="rp-ev">
      <p><small>Qué usé</small>{e.basis}</p>
      {e.sessions.length > 0 && <p><small>Sesiones</small>{e.sessions.join(" · ")}</p>}
      {e.excluded && <p><small>Qué dejé afuera</small>{e.excluded}</p>}
      <OriginTag o={e.origin} />
    </div>
  );
}

/** Dentro del panel (y del entrenamiento) la explicación se despliega en el lugar: nada modal mientras se entrena. */
export function EvidenceInline({ e }: { e: EvidenceVM }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rp-why">
      <button type="button" className="linkbtn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((x) => !x)}>{open ? "Ocultar explicación" : "¿Por qué te digo esto?"}</button>
      <div id={id} hidden={!open}>{open && <EvidenceBody e={e} />}</div>
    </div>
  );
}
