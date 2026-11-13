"use client";
// Número que se transforma (Roll v2): cada dígito que cambia rueda dentro de su máscara (el anterior sale hacia arriba y el
// nuevo llega desde abajo), sólo con translateY y opacidad: sin desenfoque ni escala, en cifras tabulares, así sirve también
// a tamaño de pantalla. Lo leen los lectores de pantalla como texto normal (aria-live en quien lo usa).
// 13/11/2026: la rueda por dígito sólo sirve entre valores de la misma forma (mismo largo y mismos caracteres salvo los
// dígitos, que son tabulares y tienen el mismo ancho). Entre textos distintos («62,5 kg × 6» → «8 sesiones») cada letra
// vieja quedaba dibujada en la caja de la letra nueva de la misma posición, más angosta: se recortaba y se superponía. En
// ese caso el valor entero sale hacia arriba y el nuevo entra desde abajo, como dos bloques, con la misma curva y duración.
import { useEffect, useRef, useState } from "react";

const isDigit = (c: string | undefined) => c != null && c >= "0" && c <= "9";
/** Mismo largo y, en cada posición, el mismo carácter o dos dígitos: la rueda por dígito no cambia ningún ancho. */
export function sameShape(a: string, b: string) {
  const x = Array.from(a), y = Array.from(b);
  return x.length === y.length && x.every((c, i) => c === y[i] || (isDigit(c) && isDigit(y[i])));
}

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
  const block = prev != null && !sameShape(prev, shown);
  const b = prev != null && !block ? Array.from(prev) : null;
  return (
    <span className={`x3-roll${className ? ` ${className}` : ""}`}>
      <span className="x3-sr">{shown}</span>
      {/* Una sola máscara con las dos piezas apiladas en la misma celda: mide lo que la más ancha, así ninguna se recorta. */}
      <span aria-hidden="true" className="x3-roll-mask" key={block ? `b:${shown}` : "d"}>
        {block && <span className="x3-roll-was">{prev}</span>}
        <span className="x3-roll-digits" data-in={block ? "1" : undefined}>
          {Array.from(shown).map((ch, i) => (
            // Clave por valor: cada cambio crea cifras nuevas en vez de correr las que ya estaban (un ancho distinto no cuenta
            // como desplazamiento del diseño, CLS 0).
            <span key={`${shown}:${i}`} className="x3-roll-d" data-change={b && b[i] !== ch ? "1" : undefined}>
              {b && b[i] !== ch && <span className="x3-roll-old">{b[i]}</span>}
              <span className="x3-roll-new">{ch === " " ? " " : ch}</span>
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
