// M06 (docs/MOTION_NAVEGACION.md §6): salida de hojas, modales y avisos sin retrasar el cierre. React ya quitó (o está por
// quitar) el elemento real: el diálogo deja de existir en el acto para lectores, foco y pruebas, y una copia inerte se
// desvanece encima. La copia no tiene id, rol ni aria-modal, no recibe toques y se borra sola (tope de 400 ms).
import { EASE, canAnimate } from "./motion";

export type GhostKind = "sheet" | "modal" | "toast";

const STRIP = ["id", "role", "aria-modal", "aria-live", "aria-labelledby", "aria-describedby", "name", "for", "tabindex", "autofocus"];

/** Copia inerte de `node` que sale animada. `node` tiene que seguir conectado (cleanup de useLayoutEffect). */
export function ghostOut(node: HTMLElement | null | undefined, kind: GhostKind) {
  if (!node?.isConnected || !canAnimate()) return;
  const host = node.parentElement ?? document.body;
  const clone = node.cloneNode(true) as HTMLElement;
  // Video, iframe y canvas no se copian (se recargarían o quedarían en blanco): cajas del mismo tamaño.
  const live = node.querySelectorAll<HTMLElement>("video, iframe, canvas");
  clone.querySelectorAll<HTMLElement>("video, iframe, canvas").forEach((el, i) => {
    const r = live[i]?.getBoundingClientRect();
    const box = document.createElement("div");
    box.style.cssText = `width:${r?.width ?? 0}px;height:${r?.height ?? 0}px;border-radius:12px;background:var(--ui-media-bg, #0b0f14)`;
    el.replaceWith(box);
  });
  for (const el of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) for (const a of STRIP) el.removeAttribute(a);
  clone.setAttribute("inert", "");
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("data-ghost", kind);
  clone.style.pointerEvents = "none";
  // Fondos y avisos ya son fijos por CSS: la copia queda en el mismo lugar.
  host.appendChild(clone);
  const panel = kind === "sheet" ? clone.querySelector<HTMLElement>(".sheet") : kind === "modal" ? clone.querySelector<HTMLElement>(".modal") : clone;
  const dur = kind === "sheet" ? 180 : 150;
  const anims: Animation[] = [];
  try {
    if (kind !== "toast") anims.push(clone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: EASE.in, fill: "forwards" }));
    if (panel) anims.push(panel.animate(kind === "sheet"
      ? [{ transform: "none" }, { transform: "translateY(24px)" }] // la opacidad la lleva el fondo (copia entera)
      : kind === "modal" ? [{ transform: "none" }, { transform: "translateY(4px) scale(.98)" }]
      : [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(6px)" }], { duration: dur, easing: EASE.in, fill: "forwards" }));
  } catch { /* sin animación: se borra enseguida */ }
  const done = () => clone.remove();
  const cap = setTimeout(done, 400);
  Promise.all(anims.map((a) => a.finished)).then(() => { clearTimeout(cap); done(); }).catch(done);
}
