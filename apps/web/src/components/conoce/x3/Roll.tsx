"use client";
// Número que se transforma (Roll v2): cada dígito que cambia rueda dentro de su máscara (el anterior sale hacia arriba y el
// nuevo llega desde abajo), sólo con translateY y opacidad: sin desenfoque ni escala, en cifras tabulares, así sirve también
// a tamaño de pantalla. Lo leen los lectores de pantalla como texto normal (aria-live en quien lo usa).
import { useEffect, useRef, useState } from "react";

export function Roll({ value, className }: { value: string; className?: string }) {
  const [shown, setShown] = useState(value);
  const [prev, setPrev] = useState<string | null>(null);
  const t = useRef<number | null>(null);
  useEffect(() => {
    if (value === shown) return;
    setPrev(shown); setShown(value);
    if (t.current) clearTimeout(t.current);
    t.current = window.setTimeout(() => setPrev(null), 460);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sin relleno: las cifras quedan alineadas a la izquierda y no se corren cuando termina el cambio (CLS 0).
  const a = shown, b = prev ?? shown;
  return (
    <span className={`x3-roll${className ? ` ${className}` : ""}`}>
      <span className="x3-sr">{shown}</span>
      <span aria-hidden="true" className="x3-roll-digits">
        {Array.from(a).map((ch, i) => (
          // Clave por valor: cada cambio crea cifras nuevas en vez de correr las que ya estaban (un ancho distinto no cuenta
          // como desplazamiento del diseño, CLS 0).
          <span key={`${shown}:${i}`} className="x3-roll-d" data-change={prev != null && b[i] !== ch ? "1" : undefined}>
            {prev != null && b[i] !== ch && b[i] != null && <span className="x3-roll-old">{b[i]}</span>}
            <span className="x3-roll-new">{ch === " " ? " " : ch}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
