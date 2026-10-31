"use client";
// F-BR-02: intro de marca al abrir la app del alumno, con la secuencia de la escena 1 del video de lanzamiento (REPI Motion
// Intro): el punto late, la «r» sube a encontrarlo, el punto cae con un squash corto, el isotipo se corre al lockup y el
// wordmark sube letra por letra; el punto de la «i» cae y se abre en iris hasta dejar la pantalla real.
// · Primera vez en el dispositivo: ~2,6 s, saltable (toque o «Saltar»). · Después: ≤0,5 s, una vez por sesión.
// · Movimiento reducido: sólo un fundido. · Nunca durante un entrenamiento: si hay uno abierto, sale enseguida.
// Web Animations (sin dependencias); las curvas son las del video (expo.out, power2/3, back.out).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

const E = {
  expoOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  p2Out: "cubic-bezier(0.33, 1, 0.68, 1)",
  p2In: "cubic-bezier(0.32, 0, 0.67, 0)",
  p2InOut: "cubic-bezier(0.45, 0, 0.55, 1)",
  p3In: "cubic-bezier(0.55, 0, 0.75, 0.06)",
  backOut: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  linear: "linear",
};
const SEEN = "repi:intro:v1", SESSION = "repi:intro:s";

// Escenario de 360 × 360 (se escala al ancho). Geometría del prototipo aprobado: isotipo en caja de 120, punto en (71,1; 34,8).
const DOT_LOCAL = { x: 71.1, y: 34.8 }, DOT_D = 20; // diámetro del punto en la caja de 120
const IC = 1.3, LK = 0.8, WM = 1;
const DOT = { x: 180, y: 170 };
const ICON_HERO = { x: DOT.x - DOT_LOCAL.x * IC, y: DOT.y - DOT_LOCAL.y * IC };
const LOCK_W = 120 * LK + 22 + 200 * WM;
const ICON_LOCK = { x: 180 - LOCK_W / 2, y: 180 - 60 * LK };
const WM_LOCK = { x: ICON_LOCK.x + 120 * LK + 22, y: 180 - (97.8 * WM) / 2 + 5 };
const WDOT = { x: WM_LOCK.x + (177.9 + 10.15) * WM, y: WM_LOCK.y + (1.55 + 10.15) * WM };
const DOT_LOCK = { x: ICON_LOCK.x + DOT_LOCAL.x * LK, y: ICON_LOCK.y + DOT_LOCAL.y * LK };
const LETTERS = [["r", 0, 43.8], ["e", 43.8, 65.4], ["p", 109.2, 67.9], ["i", 177.2, 22.9]] as const;

type Mode = "full" | "short" | "fade";
type K = { t: number; e?: string; [prop: string]: string | number | undefined };
const tr = (x: number, y: number, s = 1, sx = 1, sy = 1) => `translate(${x}px, ${y}px) scale(${s * sx}, ${s * sy})`;

/** Una pista por elemento sobre la duración total: así todo queda sincronizado y «Saltar» termina todo junto. */
function track(el: Element | null, total: number, ks: K[]) {
  if (!el) return null;
  const frames = ks.map(({ t, e, ...rest }) => ({ ...rest, offset: Math.min(1, t / total), easing: e ?? E.linear }));
  return el.animate(frames as Keyframe[], { duration: total, fill: "both" });
}

export function BrandIntro({ abort = false }: { abort?: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [gone, setGone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  const leaving = useRef(false);

  // Decidir antes de pintar: la intro tapa la app desde el primer cuadro (no hay parpadeo de la pantalla de atrás).
  useLayoutEffect(() => {
    let seen = false, session = false;
    try { seen = localStorage.getItem(SEEN) === "1"; session = sessionStorage.getItem(SESSION) === "1"; } catch { seen = true; }
    // «?intro=1» la muestra completa (para revisarla o mostrarla); el parámetro se quita de la dirección.
    const u = new URL(window.location.href);
    const forced = u.searchParams.get("intro") === "1";
    if (forced) { u.searchParams.delete("intro"); window.history.replaceState(null, "", u.pathname + u.search); seen = false; session = false; }
    // Las pruebas automáticas (Playwright) no la ven: abren la app en un navegador limpio cada vez.
    if (session || (navigator.webdriver && !forced)) { setGone(true); return; }
    try { sessionStorage.setItem(SESSION, "1"); } catch { /* sin almacenamiento */ }
    setMode(prefersReducedMotion() ? "fade" : seen ? "short" : "full");
  }, []);

  const leave = (ms = 160) => {
    if (leaving.current || !root.current) return;
    leaving.current = true;
    anims.current.forEach((a) => a.pause());
    const a = root.current.animate([{ opacity: Number(getComputedStyle(root.current).opacity) }, { opacity: 0 }], { duration: ms, easing: E.p2Out, fill: "forwards" });
    a.onfinish = () => setGone(true);
  };

  useEffect(() => { if (abort && mode) leave(120); }, [abort, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = root.current;
    if (!mode || !el) return;
    const $ = (s: string) => el.querySelector(s);
    const W = window.innerWidth, H = window.innerHeight;
    const k = Math.min(1, (W - 24) / 360);
    const stage = $(".bi-stage") as HTMLElement;
    stage.style.transform = `translate(${W / 2 - 180 * k}px, ${H / 2 - 180 * k - 20}px) scale(${k})`;
    const list: (Animation | null)[] = [];
    let total: number;
    if (mode === "fade") {
      total = 900;
      // Lockup quieto, sólo opacidad.
      for (const s of [".bi-icon", ".bi-dot", ".bi-wm", ".bi-wdot"]) ($(s) as HTMLElement).style.opacity = "1";
      ($(".bi-icon") as HTMLElement).style.transform = tr(ICON_LOCK.x, ICON_LOCK.y, LK);
      ($(".bi-dot") as HTMLElement).style.transform = tr(DOT_LOCK.x, DOT_LOCK.y, (DOT_D * LK) / 26);
      ($(".bi-wm") as HTMLElement).style.transform = tr(WM_LOCK.x, WM_LOCK.y, WM);
      ($(".bi-wdot") as HTMLElement).style.transform = tr(WDOT.x, WDOT.y, (20.3 * WM) / 260);
      el.querySelectorAll(".bi-l img").forEach((i) => ((i as HTMLElement).style.transform = "none"));
      list.push(track(stage, total, [{ t: 0, opacity: 0, e: E.p2Out }, { t: 250, opacity: 1 }, { t: 650, opacity: 1, e: E.p2Out }, { t: 900, opacity: 0 }]));
    } else if (mode === "short") {
      total = 480;
      // Isotipo centrado; el punto cae y se asienta.
      const C = { x: 180 - 60 * IC, y: 180 - 60 * IC }, P = { x: C.x + DOT_LOCAL.x * IC, y: C.y + DOT_LOCAL.y * IC };
      list.push(track($(".bi-icon"), total, [{ t: 0, transform: tr(C.x, C.y + 10, IC * 0.94), opacity: 0, e: E.expoOut }, { t: 200, transform: tr(C.x, C.y, IC), opacity: 1 }, { t: 480, transform: tr(C.x, C.y, IC), opacity: 1 }]));
      ($(".bi-tile") as HTMLElement).style.opacity = "1";
      ($(".bi-r") as HTMLElement).style.clipPath = "inset(0 0 0 0)";
      const d = (DOT_D * IC) / 26;
      list.push(track($(".bi-dot"), total, [
        { t: 0, transform: tr(P.x, P.y - 40, d), opacity: 0 }, { t: 100, transform: tr(P.x, P.y - 40, d), opacity: 1, e: E.p2In },
        { t: 230, transform: tr(P.x, P.y, d), opacity: 1 }, { t: 230, transform: tr(P.x, P.y, d, 1.16, 0.84), e: E.backOut }, { t: 380, transform: tr(P.x, P.y, d), opacity: 1 }, { t: 480, transform: tr(P.x, P.y, d), opacity: 1 },
      ]));
      list.push(track(el, total, [{ t: 0, opacity: 1 }, { t: 340, opacity: 1, e: E.p2Out }, { t: 480, opacity: 0 }]));
    } else {
      total = 2560;
      const d = (s: number) => (DOT_D * IC * s) / 26; // escala del punto (elemento de 26 px)
      // Punto: tres latidos, salto, caída con squash y viaje al lockup.
      list.push(track($(".bi-dot"), total, [
        { t: 0, transform: tr(DOT.x, DOT.y, d(0.34)), opacity: 1 },
        { t: 160, transform: tr(DOT.x, DOT.y, d(0.34)) }, { t: 160, transform: tr(DOT.x, DOT.y, d(0.64)), e: E.expoOut },
        { t: 380, transform: tr(DOT.x, DOT.y, d(0.46)) }, { t: 380, transform: tr(DOT.x, DOT.y, d(0.84)), e: E.expoOut },
        { t: 600, transform: tr(DOT.x, DOT.y, d(0.6)) }, { t: 600, transform: tr(DOT.x, DOT.y, d(1.06)), e: E.expoOut },
        { t: 820, transform: tr(DOT.x, DOT.y, d(0.76)), e: E.p2Out },
        { t: 1000, transform: tr(DOT.x, DOT.y - 46, d(1)), e: E.p2In },
        { t: 1180, transform: tr(DOT.x, DOT.y, d(1)) }, { t: 1180, transform: tr(DOT.x, DOT.y, d(1), 1.16, 0.84), e: E.backOut },
        { t: 1300, transform: tr(DOT.x, DOT.y, d(1)), e: E.p2InOut },
        { t: 1760, transform: tr(DOT_LOCK.x, DOT_LOCK.y, (DOT_D * LK) / 26), opacity: 1 },
        { t: 2560, transform: tr(DOT_LOCK.x, DOT_LOCK.y, (DOT_D * LK) / 26), opacity: 1 },
      ]));
      // Isotipo: sube a encontrarse con el punto y se corre al lockup.
      list.push(track($(".bi-icon"), total, [
        { t: 0, transform: tr(ICON_HERO.x, ICON_HERO.y + 22, IC * 0.9), opacity: 0 }, { t: 740, transform: tr(ICON_HERO.x, ICON_HERO.y + 22, IC * 0.9), opacity: 0, e: E.expoOut },
        { t: 1300, transform: tr(ICON_HERO.x, ICON_HERO.y, IC), opacity: 1, e: E.p2InOut },
        { t: 1760, transform: tr(ICON_LOCK.x, ICON_LOCK.y, LK), opacity: 1 }, { t: 2560, transform: tr(ICON_LOCK.x, ICON_LOCK.y, LK), opacity: 1 },
      ]));
      list.push(track($(".bi-tile"), total, [{ t: 0, opacity: 0 }, { t: 740, opacity: 0, e: E.p2Out }, { t: 1040, opacity: 1 }, { t: 2560, opacity: 1 }]));
      list.push(track($(".bi-r"), total, [
        { t: 0, clipPath: "inset(100% 0% 0% 0%)", transform: "translateY(22px)" }, { t: 800, clipPath: "inset(100% 0% 0% 0%)", transform: "translateY(22px)", e: E.expoOut },
        { t: 1300, clipPath: "inset(0% 0% 0% 0%)", transform: "translateY(0px)" }, { t: 2560, clipPath: "inset(0% 0% 0% 0%)", transform: "translateY(0px)" },
      ]));
      // Wordmark: letra por letra (máscara por letra).
      ($(".bi-wm") as HTMLElement).style.opacity = "1";
      ($(".bi-wm") as HTMLElement).style.transform = tr(WM_LOCK.x, WM_LOCK.y, WM);
      el.querySelectorAll(".bi-l img").forEach((img, i) => list.push(track(img, total, [
        { t: 0, transform: "translateY(105%)" }, { t: 1400 + i * 40, transform: "translateY(105%)", e: E.expoOut }, { t: 1740 + i * 40, transform: "translateY(0%)" }, { t: 2560, transform: "translateY(0%)" },
      ])));
      // Punto de la «i»: cae, squash, y se abre en iris (cian y después el fondo de la app).
      // El punto de la «i» y el iris miden 260 px de base (se achican): así el iris queda nítido al cubrir la pantalla.
      const ws = (20.3 * WM) / 260;
      const cover = (2.1 * Math.hypot(W, H)) / k / 260; // el iris cubre la pantalla desde cualquier punto
      list.push(track($(".bi-wdot"), total, [
        { t: 0, transform: tr(WDOT.x, WDOT.y - 60, ws), opacity: 0 }, { t: 1800, transform: tr(WDOT.x, WDOT.y - 60, ws), opacity: 0 },
        { t: 1800, transform: tr(WDOT.x, WDOT.y - 60, ws), opacity: 1, e: E.p2In },
        { t: 1960, transform: tr(WDOT.x, WDOT.y, ws), opacity: 1 }, { t: 1960, transform: tr(WDOT.x, WDOT.y, ws, 1.14, 0.86), e: E.p2Out },
        { t: 2080, transform: tr(WDOT.x, WDOT.y, ws), e: E.p3In }, { t: 2400, transform: tr(WDOT.x, WDOT.y, cover), opacity: 1 }, { t: 2560, transform: tr(WDOT.x, WDOT.y, cover), opacity: 1 },
      ]));
      list.push(track($(".bi-iris"), total, [
        { t: 0, transform: tr(WDOT.x, WDOT.y, 0), opacity: 0 }, { t: 2130, transform: tr(WDOT.x, WDOT.y, 0), opacity: 1, e: E.p3In },
        { t: 2420, transform: tr(WDOT.x, WDOT.y, cover), opacity: 1 }, { t: 2560, transform: tr(WDOT.x, WDOT.y, cover), opacity: 1 },
      ]));
      list.push(track($(".bi-skip"), total, [{ t: 0, opacity: 0 }, { t: 500, opacity: 0, e: E.p2Out }, { t: 700, opacity: 1 }, { t: 2000, opacity: 1, e: E.p2Out }, { t: 2200, opacity: 0 }]));
      list.push(track(el, total, [{ t: 0, opacity: 1 }, { t: 2420, opacity: 1, e: E.p2Out }, { t: 2560, opacity: 0 }]));
    }
    anims.current = list.filter(Boolean) as Animation[];
    // Se retira al terminar la pista más larga (y, de respaldo, con el temporizador de abajo).
    anims.current.reduce((x, y) => ((y.effect?.getComputedTiming().endTime ?? 0) >= (x.effect?.getComputedTiming().endTime ?? 0) ? y : x)).onfinish = () => setGone(true);
    // Un temporizador garantiza el cierre aunque el navegador no entregue cuadros (pestaña oculta).
    // (Si alguien la pausó para revisarla cuadro por cuadro, se respeta la pausa.)
    const done = window.setTimeout(() => { if (!anims.current.some((x) => x.playState === "paused")) setGone(true); }, total + 80);
    if (mode === "full") try { localStorage.setItem(SEEN, "1"); } catch { /* sin almacenamiento */ }
    return () => { window.clearTimeout(done); anims.current.forEach((a) => a.cancel()); };
  }, [mode]);

  if (gone || !mode) return gone ? null : <div className="bi" aria-hidden="true" />;
  return (
    <div ref={root} className="bi" role="presentation" onClick={() => mode === "full" && leave()}>
      <div className="bi-glow" />
      <div className="bi-stage" aria-hidden="true">
        <div className="bi-icon"><div className="bi-tile"><img src="/brand/intro/icon_tile_empty.png" alt="" /></div><div className="bi-r"><img src="/brand/intro/icon_r_white_alpha.png" alt="" /></div></div>
        <div className="bi-wm">{LETTERS.map(([l, left, w]) => <div key={l} className="bi-l" style={{ left, width: w }}><img src={`/brand/intro/wm_${l}.png`} alt="" /></div>)}</div>
        <div className="bi-dot" />
        <div className="bi-wdot" />
        <div className="bi-iris" />
      </div>
      <span className="sr-only">REPI</span>
      {mode === "full" && <button type="button" className="bi-skip" onClick={(e) => { e.stopPropagation(); leave(); }}>Saltar</button>}
    </div>
  );
}
