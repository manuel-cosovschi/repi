// Estado compartido entre las escenas (GSAP/ScrollTrigger) y el escenario de la sala (3D o SVG). Sin React: las timelines
// escriben y el escenario lee en cada cuadro, así el scroll no provoca renders de React.
import type { ShotId, ZoneId } from "./model";

export type StageState = {
  /** Toma de la que se viene y a la que se va; `t` 0→1 entre ambas (scroll). */
  a: ShotId; b: ShotId; t: number;
  /** Cuánto está «encendida» la sala (0 = plano apagado, 1 = líneas y personas). */
  lit: number;
  /** Zona resaltada (perfil o módulo elegido). */
  focus: ZoneId | null;
  /** Recorrido del pedido socio → entrenador (0→1), o null si no se muestra. */
  request: number | null;
  /** La sala queda tapada por una sección sólida: se deja de dibujar. */
  hidden: boolean;
  /** La persona pausó las animaciones (botón «Pausar animaciones»): nada se mueve solo; la cámara sigue al scroll. */
  paused: boolean;
};

const state: StageState = { a: "dark", b: "hero", t: 0, lit: 0, focus: null, request: null, hidden: false, paused: false };
const subs = new Set<() => void>();

export const stage = {
  get: () => state,
  set(p: Partial<StageState>) {
    let changed = false;
    for (const k in p) { const key = k as keyof StageState; if (state[key] !== p[key]) { (state as Record<string, unknown>)[key] = p[key]; changed = true; } }
    if (changed) subs.forEach((f) => f());
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};

/** Nivel de calidad del escenario, decidido una vez en el cliente. */
export type Quality = "high" | "medium" | "low";
export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  // Para revisar cada nivel a mano o en pruebas: /conoce?sala=high|medium|low.
  const forced = new URLSearchParams(window.location.search).get("sala");
  if (forced === "high" || forced === "medium" || forced === "low") return forced;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (reduce || nav.connection?.saveData) return "low";
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return "low";
    // WebGL por software (SwiftShader, llvmpipe: equipos sin GPU o con la GPU bloqueada, y los navegadores sin pantalla de
    // Lighthouse/PageSpeed) pasa el filtro anterior, pero dibuja con la CPU: ahí va el SVG.
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext(); // sólo era una prueba: no ocupar un contexto más
    if (/swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i.test(renderer)) return "low";
  } catch { return "low"; }
  const cores = nav.hardwareConcurrency ?? 4, mem = nav.deviceMemory ?? 4;
  if (cores < 4 || mem < 3) return "low";
  const mobile = window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 760;
  return mobile ? "medium" : "high";
}
