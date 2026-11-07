"use client";
// Número que se transforma: cada dígito cambia con profundidad (el anterior sube y se desenfoca, el nuevo llega desde abajo).
// Lo leen los lectores de pantalla como texto normal (aria-live en quien lo usa); la animación es sólo visual.
import { useEffect, useRef, useState } from "react";

export function Roll({ value, className }: { value: string; className?: string }) {
  const [shown, setShown] = useState(value);
  const [prev, setPrev] = useState<string | null>(null);
  const t = useRef<number | null>(null);
  useEffect(() => {
    if (value === shown) return;
    setPrev(shown); setShown(value);
    if (t.current) clearTimeout(t.current);
    t.current = window.setTimeout(() => setPrev(null), 520);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const len = Math.max(shown.length, prev?.length ?? 0);
  const a = shown.padStart(len, " "), b = (prev ?? shown).padStart(len, " ");
  return (
    <span className={`x3-roll${className ? ` ${className}` : ""}`}>
      <span className="x3-sr">{shown}</span>
      <span aria-hidden="true" className="x3-roll-digits">
        {Array.from(a).map((ch, i) => (
          <span key={i} className="x3-roll-d" data-change={prev != null && b[i] !== ch ? "1" : undefined}>
            {prev != null && b[i] !== ch && <span className="x3-roll-old">{b[i] === " " ? " " : b[i]}</span>}
            <span className="x3-roll-new">{ch === " " ? " " : ch}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
