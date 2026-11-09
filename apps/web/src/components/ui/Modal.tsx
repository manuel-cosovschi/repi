"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBackdropClose } from "./backdrop";
import { useScrollLock } from "./scrollLock";
import { ghostOut } from "@/lib/ghost";

// Modal accesible: foco inicial, trap con Tab, Esc y clic de fondo cierran, foco restaurado al cerrar.
// D184: `className` en el fondo (p. ej. «dx-host», el editor de técnica con los tokens de la app del alumno).
export function Modal({ label, onClose, children, wide, className }: { label: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useScrollLock();
  // M06: al cerrar, el diálogo deja de existir en el acto y una copia inerte se achica y se desvanece (150 ms).
  const bg = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const n = bg.current; return () => ghostOut(n, "modal"); }, []);
  // FSA1 (UI): el botón que abrió el modal se toma en el primer render. En el efecto ya es tarde si un campo del modal tiene
  // autoFocus (React lo enfoca antes): se guardaba ese campo y, al cerrar, el foco se perdía en <body>.
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    const prev = opener;
    const root = ref.current!;
    const focusables = () => [...root.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute("disabled"));
    (focusables()[0] ?? root).focus();
    // El de más arriba es el último diálogo del documento (cada uno se monta al final de <body>).
    const isTop = () => { const all = document.querySelectorAll('.modal[role="dialog"]'); return all[all.length - 1] === root; };
    const onKey = (e: KeyboardEvent) => {
      // Con un modal encima de otro (D134), sólo responde el que tiene el foco.
      // FSA1: si el elemento enfocado desapareció (p. ej. «Quitar día»), el foco cae en <body> y Esc y Tab dejaban de responder
      // con el diálogo abierto. En ese caso responde el modal de arriba y recupera el foco.
      const active = document.activeElement;
      if (!root.contains(active)) {
        if ((active === null || active === document.body) && isTop()) root.focus();
        else return;
      }
      if (e.key === "Escape") { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const main = document.querySelector("main");
    main?.setAttribute("inert", "");
    return () => { document.removeEventListener("keydown", onKey); main?.removeAttribute("inert"); prev?.focus?.(); };
  }, [opener]);
  // Portal fuera de <main> para poder marcar el fondo como inerte.
  const backdrop = useBackdropClose(onClose);
  return createPortal(
    <div ref={bg} className={className ? `modal-bg ${className}` : "modal-bg"} {...backdrop}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} style={wide ? { maxWidth: 760 } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
