"use client";
// M06 (QA independiente, ronda 2): el cajón del menú del staff en el teléfono (< 768 px), común a Coach, Gym y Admin.
import { useCallback, useEffect, useRef, type RefObject } from "react";

const menuButton = (root: HTMLElement) => root.querySelector<HTMLElement>('.co-topbar button[aria-expanded]');

/** Foco al título visible de la pantalla a la vista (o a la pantalla misma, sin h1), como SectionStage al llegar. */
function focusTitle(root: HTMLElement) {
  const pane = root.querySelector<HTMLElement>(".sec-stage > .sec-pane[data-active]");
  if (!pane) return false;
  const target = [...pane.querySelectorAll<HTMLElement>("h1")].find((h) => h.getClientRects().length > 0) ?? pane;
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  return true;
}

/**
 * - Al abrirse, el foco va al ítem actual del menú y el contenido de atrás queda inerte (`inert` en el main, a cargo de la
 *   app): Tab ya no se va detrás del cajón. Escape lo cierra y el foco vuelve a «Abrir menú»; tocar el fondo, también.
 * - Al cerrarse con el foco adentro porque se tocó el ítem de la pantalla que ya está a la vista (`pending` falso: no hay
 *   otra pantalla en camino), el foco va a su título antes de que el cajón se oculte (antes quedaba en body). Si el toque
 *   cambia de pantalla, lo mueve SectionStage al título nuevo; si eso no pasó en 200 ms, se hace acá igual.
 * - Al pasar a 768 px o más (girar la tableta), se cierra.
 * Devuelve `dismiss` para el fondo (scrim).
 */
export function useDrawer(root: RefObject<HTMLElement | null>, open: boolean, setOpen: (v: boolean) => void, pending: boolean) {
  const why = useRef<"nav" | "dismiss">("nav");
  const pend = useRef(pending);
  pend.current = pending;
  const dismiss = useCallback(() => { why.current = "dismiss"; setOpen(false); }, [setOpen]);
  const was = useRef(open);

  useEffect(() => {
    const r = root.current;
    const before = was.current;
    was.current = open;
    if (!r || before === open) return;
    const side = r.querySelector<HTMLElement>(".co-side");
    if (open) {
      why.current = "nav";
      const nav = side?.querySelector<HTMLElement>('.co-nav > button[aria-current="page"]') ?? side?.querySelector<HTMLElement>(".co-nav > button");
      nav?.focus({ preventScroll: true });
      return;
    }
    const reason = why.current;
    why.current = "nav";
    const ae = document.activeElement;
    const inside = () => !!side && !!document.activeElement && side.contains(document.activeElement);
    if (reason === "dismiss") {
      if (inside() || !ae || ae === document.body) menuButton(r)?.focus({ preventScroll: true });
      return;
    }
    if (!inside()) return;
    if (!pend.current) { if (!focusTitle(r)) menuButton(r)?.focus({ preventScroll: true }); return; }
    const t = setTimeout(() => { if (inside() && !focusTitle(r)) menuButton(r)?.focus({ preventScroll: true }); }, 200);
    return () => clearTimeout(t);
  }, [open, root]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); dismiss(); } };
    const mq = window.matchMedia("(min-width: 768px)");
    const wide = () => { if (mq.matches) setOpen(false); };
    document.addEventListener("keydown", key);
    mq.addEventListener?.("change", wide);
    return () => { document.removeEventListener("keydown", key); mq.removeEventListener?.("change", wide); };
  }, [open, dismiss, setOpen]);

  return { dismiss };
}
