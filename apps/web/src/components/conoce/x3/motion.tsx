"use client";
// Pausar animaciones (WCAG 2.2.2): las personas de la sala, el pedido «Que venga alguien», el descanso que corre y las
// animaciones CSS en bucle se detienen; la cámara sigue al scroll (eso lo mueve la persona). La preferencia queda en este
// navegador. Con movimiento reducido del sistema ya nada se mueve solo y el botón no hace falta.
import { useEffect, useSyncExternalStore } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { stage } from "../sala/store";

const KEY = "repi:conoce:motion";
const apply = (paused: boolean) => {
  stage.set({ paused });
  if (paused) document.documentElement.dataset.motion = "paused"; else delete document.documentElement.dataset.motion;
};

/** true mientras la persona tiene las animaciones pausadas. */
export function usePaused() {
  return useSyncExternalStore(stage.subscribe, () => stage.get().paused, () => false);
}

export function MotionToggle() {
  const paused = usePaused();
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "paused") apply(true); } catch { /* sin almacenamiento: empieza en movimiento */ }
    return () => apply(false);
  }, []);
  const toggle = () => {
    const next = !paused; apply(next);
    try { if (next) localStorage.setItem(KEY, "paused"); else localStorage.removeItem(KEY); } catch { /* */ }
  };
  return (
    <button type="button" className="x3-motion" aria-pressed={paused} onClick={toggle} title={paused ? "Reanudar animaciones" : "Pausar animaciones"}>
      {paused ? <Play size={16} weight="fill" aria-hidden="true" /> : <Pause size={16} weight="fill" aria-hidden="true" />}
      <span className="x3-sr">Pausar animaciones</span>
    </button>
  );
}
