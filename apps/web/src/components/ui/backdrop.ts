"use client";
import { useRef, type MouseEvent, type PointerEvent } from "react";

/**
 * D179: el fondo de un modal cierra sólo con un clic que empieza y termina en el fondo. Arrastrar para seleccionar
 * texto dentro del modal y soltar afuera ya no lo cierra (pedido de un entrenador: perdía lo que estaba editando).
 */
export function useBackdropClose(onClose: () => void) {
  const down = useRef(false);
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => { down.current = e.target === e.currentTarget; },
    onClick: (e: MouseEvent<HTMLElement>) => {
      const ok = down.current && e.target === e.currentTarget;
      down.current = false;
      if (ok) onClose();
    },
  };
}
