"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Modal accesible: foco inicial, trap con Tab, Esc y clic de fondo cierran, foco restaurado al cerrar.
export function Modal({ label, onClose, children, wide }: { label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = ref.current!;
    const focusables = () => [...root.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute("disabled"));
    (focusables()[0] ?? root).focus();
    const onKey = (e: KeyboardEvent) => {
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
  }, []);
  // Portal fuera de <main> para poder marcar el fondo como inerte.
  return createPortal(
    <div className="modal-bg" onClick={onClose}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} style={wide ? { maxWidth: 760 } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
