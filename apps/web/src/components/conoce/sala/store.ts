// Estado compartido entre las escenas (GSAP/ScrollTrigger) y el escenario de la sala (3D o SVG). Sin React: las timelines
// escriben y el escenario lee en cada cuadro, así el scroll no provoca renders de React.
import type { ShotId, ZoneId } from "./model";

export type StageState = {
  /** Toma de la que se viene y a la que se va; `t` 0→1 entre ambas (scroll). */
  a: ShotId; b: ShotId; t: number;
  /** Cuánto está «encendida» la sala (0 = plano apagado, 1 = líneas y personas). */
  lit: number;
  /** Zona resaltada (perfil o módulo elegido). Se marca en blanco. */
  focus: ZoneId | null;
  /** Zona bajo el puntero o el foco de una pestaña (perfiles): se pre-ilumina antes del clic. */
  preview: ZoneId | null;
  /** Recorrido del pedido Julián → Sofía (0→1; 0,5 = llega el pedido, 1 = vuelve «Voy»), o null si no se muestra. */
  request: number | null;
  /** Sofía camina hasta Julián (0 = su recorrido, 1 = junto al rack de Julián). */
  walk: number;
  /** Velo frío sobre la sala (0–1): la sala «sin REPI» de la escena 02 y la toma abierta de 03. */
  tone: number;
  /** Golpe de color del corte de 02 (0–1): la sala se tiñe de cian un instante cuando se enciende. Sólo opacidad. */
  wash: number;
  /** Personas en acero (sin REPI nadie está «vivo»). */
  cold: boolean;
  /** Toda la sala vuelve al punto (0–1, cierre). */
  gather: number;
  /** Punto del mundo [x, z] hacia el que vuelve la sala (cierre). */
  origin: [number, number];
  /** El punto que quedó de la sala ya lo lleva la página (cierre): la sala deja de dibujarlo. */
  dotOut: boolean;
  /** Encendido del hero: centro (px de pantalla) y radio de la luz que se expande desde el impacto del punto, o null. */
  reveal: { x: number; y: number; r: number } | null;
  /** El 3D ya reemplazó al SVG (la proyección a pantalla cambia). */
  gl: boolean;
  /** La sala queda tapada por una sección sólida: se deja de dibujar. */
  hidden: boolean;
  /** La persona pausó las animaciones (botón «Pausar animaciones»): nada se mueve solo; la cámara sigue al scroll. */
  paused: boolean;
  /** 4.0 · La red de la sala (0–1): cuánto se ven los recorridos por donde viaja lo que se registra y sus pulsos. */
  flow: number;
  /** 4.0 · La barra del press de Valentina la mueve la escena (0 = sobre el pecho, 1 = brazos extendidos; −1 = en los
   *  soportes, descansando); null = entrena sola. */
  lift: number | null;
  /** 4.0 · Cuánto se atenúa la sala detrás de una sección con mucho texto (0–1; lo pide `data-dim` y lo mezcla el director). */
  dim: number;
  /** 4.0 · Toma que eligió la persona al explorar la sala (zona): tiene prioridad sobre la del scroll hasta que se suelta. */
  explore: ShotId | null;
  /** 4.0 · La pantalla de REPI Control de la recepción, encendida (0–1): la modalidad Control o la zona recepción. */
  kiosk: number;
};

const state: StageState = {
  // Arranca en la toma del hero, la misma que pinta el HTML del servidor: la sala no «viaja» al cargar.
  a: "hero", b: "hero", t: 1, lit: 0, focus: null, preview: null, request: null, walk: 0, tone: 0, wash: 0, cold: false, gather: 0, origin: [0, 0], dotOut: false,
  reveal: null, gl: false, hidden: false, paused: false, flow: 0, lift: null, dim: 0, explore: null, kiosk: 0,
};
const subs = new Set<() => void>();

/** Proyección de un punto del mundo (x, z, a la altura de una persona) a píxeles de la pantalla, con una toma fija (la de
 *  destino, no la cámara amortiguada) y su encuadre. La publica cada nivel (SVG y 3D); se usa la del nivel que se ve. Es para
 *  medir (al cargar, al cambiar el tamaño o en el refresh de ScrollTrigger), nunca para cada cuadro. */
export type Projector = (x: number, z: number, shot: ShotId) => { x: number; y: number };
const projectors: { svg: Projector | null; gl: Projector | null } = { svg: null, gl: null };

export const stage = {
  get: () => state,
  set(p: Partial<StageState>) {
    let changed = false;
    for (const k in p) { const key = k as keyof StageState; if (state[key] !== p[key]) { (state as Record<string, unknown>)[key] = p[key]; changed = true; } }
    if (changed) subs.forEach((f) => f());
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  /** Registra la proyección de un nivel; devuelve la función que la retira. */
  publish(kind: "svg" | "gl", f: Projector) { projectors[kind] = f; return () => { if (projectors[kind] === f) projectors[kind] = null; }; },
  /** Píxeles de pantalla de un punto del mundo con la toma `shot` (por defecto, la toma a la que se va). */
  project(x: number, z: number, shot?: ShotId) {
    const f = (state.gl && projectors.gl) || projectors.svg;
    if (!f) return { x: typeof window === "undefined" ? 0 : window.innerWidth / 2, y: typeof window === "undefined" ? 0 : window.innerHeight / 2 };
    return f(x, z, shot ?? state.b);
  },
};

/** Puntero sobre la sala (sólo mouse en escritorio): las personas cerca se agrandan y la zona debajo se marca. Va aparte de
 *  la tienda para no despertar a todos los suscriptores con cada movimiento: lo leen el SVG (al cambiar) y el 3D (por cuadro). */
export const pointer = {
  x: 0, y: 0, on: false,
  subs: new Set<() => void>(),
  set(x: number, y: number, on: boolean) { if (x === this.x && y === this.y && on === this.on) return; this.x = x; this.y = y; this.on = on; this.subs.forEach((f) => f()); },
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; },
};

/** 4.0 · Pulsos sobre el piso (una serie registrada, un pedido que llega, un dato que entra a una pantalla): un anillo que se
 *  abre desde un punto del mundo. Van aparte de la tienda (son eventos, no estado): el 3D y el SVG los dibujan y los olvidan. */
export type Ping = { x: number; z: number; kind: "member" | "staff" | "data"; at: number };
export const pings = {
  list: [] as Ping[],
  subs: new Set<() => void>(),
  fire(x: number, z: number, kind: Ping["kind"] = "member") {
    if (state.paused || state.hidden) return;
    this.list.push({ x, z, kind, at: typeof performance === "undefined" ? 0 : performance.now() });
    if (this.list.length > 8) this.list.shift();
    this.subs.forEach((f) => f());
  },
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; },
};

/** Nivel de calidad del escenario, decidido una vez en el cliente. */
export type Quality = "high" | "medium" | "low";
/** Marca de sesión: la sala 3D resultó lenta en este equipo. */
export const SLOW_KEY = "repi:sala-lenta";
export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  // Para revisar cada nivel a mano o en pruebas: /conoce?sala=high|medium|low.
  const forced = new URLSearchParams(window.location.search).get("sala");
  if (forced === "high" || forced === "medium" || forced === "low") return forced;
  // En esta visita la sala 3D ya se dibujó lenta en este equipo (lo anotó la red de seguridad del canvas): directo al plano.
  try { if (sessionStorage.getItem(SLOW_KEY) === "1") return "low"; } catch { /* sin almacenamiento */ }
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
