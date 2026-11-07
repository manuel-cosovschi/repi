"use client";
// M06 «Carril» (motion.md §13, docs/MOTION_NAVEGACION.md §3–§4): escenario de secciones para alumno, Coach, Gym y Admin.
// - Las secciones visitadas quedan vivas con <Activity>: al volver se muestran al instante con su estado, su DOM y sus
//   datos; sus efectos vuelven a correr (revalidan en segundo plano) y los sondeos se pausan mientras están ocultas.
// - Sólo la activa se vuelve a dibujar; la que sale y las ocultas conservan su último nodo (no ven el estado nuevo).
// - Cambiar de sección es cambiar de carril: la que sale queda fija 100 ms, inerte y sin toques, y se aparta; la nueva
//   entra en el sentido del viaje (orden de la barra o del menú; fuera del orden = profundidad), con el corte de meta en su
//   h1 y los primeros bloques en formación. Sólo transform, opacity y clip-path; un toque nuevo corta lo que esté en curso.
// - Sin Web Animations o con movimiento reducido el cambio es inmediato.
// - Cada sección recupera su scroll antes de pintar; el foco sigue la regla de §9 (sin h1, a la sección misma).
import { Activity, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { invalidate } from "@/lib/cache";
import { EASE, M06, canAnimate } from "@/lib/motion";

let lastUnmount = 0; // «volver»: un escenario que se monta poco después de que se desmontó otro (vuelta del entrenamiento)

type St<K> = { active: K; leaving: K | null; visited: K[]; used: Record<string, number>; reset: string; cycle: number; dir: number; depth: boolean; kind: "nav" | "reset" };

export type SectionStageProps<K extends string> = {
  /** Clave visible. */
  active: K;
  /** Orden de la barra o del menú: da la dirección. Una clave fuera del orden es profundidad (entra «adelante»). */
  order: readonly K[];
  /** Dibuja la sección k (sólo claves visitadas). */
  render: (k: K) => ReactNode;
  /** "auto": eje vertical desde 768 px (escritorio staff), horizontal por debajo. */
  axis?: "x" | "auto";
  /** Si cambia (relación del alumno, sede del gym): desmonta todo y vacía la caché. */
  resetKey?: string | number | null;
  /** Máximo de secciones vivas (LRU). */
  keep?: number;
  /** "lost": sólo si el foco quedó en lo que sale o en body (alumno). "title": siempre al h1 (staff). */
  focus?: "lost" | "title";
  /** Clase de cada sección (compatibilidad con el CSS existente: tab-pane, co-pane). */
  paneClass?: string;
  /** Claves que siempre empiezan arriba (abrir un recurso concreto). */
  top?: (k: K) => boolean;
  className?: string;
};

function direction<K extends string>(order: readonly K[], from: K, to: K) {
  const a = order.indexOf(from), b = order.indexOf(to);
  if (a >= 0 && b >= 0) return { dir: Math.sign(b - a) || 1, depth: false };
  if (b < 0) return { dir: 1, depth: true }; // entra a una pantalla de profundidad
  return { dir: -1, depth: true };           // vuelve de ella
}

const PIN = ["position", "top", "left", "width", "margin", "z-index", "clip-path", "pointer-events", "opacity", "transform", "visibility"];
const unpin = (el: HTMLElement | null) => { if (el) for (const p of PIN) el.style.removeProperty(p); };

export function SectionStage<K extends string>({ active, order, render, axis = "x", resetKey = null, keep = 6, focus = "lost", paneClass = "sec-pane-plain", top, className }: SectionStageProps<K>) {
  const reset = String(resetKey ?? "");
  const [st, setSt] = useState<St<K>>(() => ({ active, leaving: null, visited: [active], used: { [active]: 0 }, reset, cycle: 0, dir: 0, depth: false, kind: "nav" }));
  let s = st;
  if (st.reset !== reset) {
    // Otra relación u otra sede: nada de lo anterior se reutiliza (ni secciones ni caché).
    invalidate();
    s = { active, leaving: null, visited: [active], used: { [active]: st.cycle + 1 }, reset, cycle: st.cycle + 1, dir: 0, depth: false, kind: "reset" };
    setSt(s);
  } else if (st.active !== active) {
    const { dir, depth } = direction(order, st.active, active);
    const visited = st.visited.includes(active) ? st.visited : [...st.visited, active];
    const used = { ...st.used, [active]: st.cycle + 1 };
    // LRU: se queda con las `keep` usadas más recientemente (la que entra y la que sale nunca se descartan).
    let live = visited;
    while (live.length > keep) {
      const drop = live.filter((k) => k !== active && k !== st.active).sort((x, y) => (used[x] ?? 0) - (used[y] ?? 0))[0];
      if (!drop) break;
      live = live.filter((k) => k !== drop);
    }
    s = { ...st, active, leaving: canAnimate() ? st.active : null, visited: live, used, cycle: st.cycle + 1, dir, depth, kind: "nav" };
    setSt(s);
  }

  // Sólo la sección activa se vuelve a dibujar con las props nuevas. La que sale y las ocultas conservan el último nodo que
  // se dibujó para ellas (mismo elemento: React no las recorre). Así la que sale no ve el estado de la pantalla nueva
  // durante su salida (p. ej. la selección de otra pantalla, QA M06) y las ocultas no se vuelven a dibujar en cada render
  // del padre. Al volver a ser activa, la sección se dibuja con las props de ese momento.
  const memo = useRef<{ reset: string; nodes: Map<K, { fn: unknown; node: ReactNode }> }>({ reset: s.reset, nodes: new Map() });
  if (memo.current.reset !== s.reset) memo.current = { reset: s.reset, nodes: new Map() };
  const node = (k: K) => {
    const m = memo.current.nodes, e = m.get(k);
    if (e && (k !== s.active || e.fn === render)) return e.node;
    const n = render(k);
    m.set(k, { fn: render, node: n });
    return n;
  };
  for (const k of [...memo.current.nodes.keys()]) if (!s.visited.includes(k)) memo.current.nodes.delete(k);

  const stage = useRef<HTMLDivElement>(null);
  const shown = useRef<K>(active);
  const scrolls = useRef(new Map<K, number>());
  const handled = useRef(st.cycle);
  const live = useRef<{ anims: Animation[]; pinned: HTMLElement | null; cut?: ReturnType<typeof setTimeout> }>({ anims: [], pinned: null });
  const pane = (k: K | null) => (k == null ? null : stage.current?.querySelector<HTMLElement>(`:scope > [data-sec="${CSS.escape(k)}"]`) ?? null);

  // Scroll por sección: se registra mientras se mira; se restaura antes de pintar.
  useEffect(() => {
    const on = () => scrolls.current.set(shown.current, window.scrollY);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useLayoutEffect(() => {
    if (handled.current === s.cycle) return;
    handled.current = s.cycle;
    const prev = shown.current, next = s.active;
    shown.current = next;
    const L = live.current;
    clearTimeout(L.cut);
    stage.current?.querySelectorAll(".sec-cut").forEach((h) => h.classList.remove("sec-cut"));
    if (s.kind === "reset") { L.anims.forEach((a) => a.cancel()); L.anims = []; unpin(L.pinned); L.pinned = null; scrolls.current.clear(); return; }
    const out = s.leaving != null ? pane(s.leaving) : null;
    const inn = pane(next);
    // 1. Corta el ciclo anterior. Lo que estaba entrando y ahora sale conserva su estado actual (sin saltos).
    let fromOpacity = 0; // si lo que entra estaba saliendo (ida y vuelta rápida), arranca desde su opacidad actual
    for (const a of L.anims) {
      const t = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null;
      if (t && t === out && a.playState === "running") { try { a.commitStyles(); } catch { /* */ } }
      if (t && t === inn && a.playState === "running") fromOpacity = Math.min(1, parseFloat(getComputedStyle(inn).opacity) || 0);
      a.cancel();
    }
    L.anims = [];
    if (L.pinned && L.pinned !== out) unpin(L.pinned);
    if (inn) unpin(inn);
    L.pinned = null;
    // 2–3. La que sale queda fija donde estaba (recortada al viewport) para que el scroll nuevo no la mueva.
    if (out) {
      const r = out.getBoundingClientRect();
      const ct = Math.max(0, -r.top), cb = Math.max(0, r.bottom - window.innerHeight);
      out.style.setProperty("position", "fixed");
      out.style.setProperty("top", `${r.top}px`);
      out.style.setProperty("left", `${r.left}px`);
      out.style.setProperty("width", `${r.width}px`);
      out.style.setProperty("margin", "0");
      out.style.setProperty("z-index", "0");
      out.style.setProperty("clip-path", `inset(${ct}px 0 ${cb}px 0)`);
      out.style.setProperty("pointer-events", "none");
      L.pinned = out;
    }
    // 4. Scroll de la sección nueva, con su contenido real (antes de pintar).
    const y = top?.(next) ? 0 : scrolls.current.get(next) ?? 0;
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, left: 0, behavior: "instant" });
    scrolls.current.set(next, y);
    // 9. Foco (antes de animar, para que el lector anuncie el título nuevo).
    const ae = document.activeElement as HTMLElement | null;
    const prevPane = out ?? pane(prev);
    const lost = !ae || ae === document.body || !ae.isConnected || (!!prevPane && prevPane.contains(ae));
    const h1 = inn ? [...inn.querySelectorAll<HTMLElement>("h1")].find((h) => h.getClientRects().length > 0) ?? inn.querySelector<HTMLElement>("h1") : null;
    // Sin h1 (p. ej. «Videos de ejercicios»), el foco va a la sección misma: nunca queda en el menú cerrado ni en body.
    const target = h1 ?? inn;
    if (target && (focus === "title" || lost)) {
      if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
    if (!out || !inn || !canAnimate()) return;
    const yAxis = axis === "auto" && window.matchMedia("(min-width: 768px)").matches;
    const d = s.dir;
    const tr = (px: number) => (yAxis ? `translateY(${px}px)` : `translateX(${px}px)`);
    try {
      // 5. Salida: se aparta 12 px en 100 ms (--ease-in) y se apaga antes, en 70 ms (--ease-std): los dos títulos casi no
      //    se leen a la vez (QA: con la opacidad en --ease-in quedaban ~5 cuadros superpuestos). Al terminar se oculta en el
      //    acto (sin esperar a React) y después pasa a oculta (display:none).
      const ex = out.animate([{ transform: tr(-(yAxis ? M06.yOut : M06.away) * d) }], { duration: M06.exit, easing: EASE.in, fill: "forwards" });
      L.anims.push(ex, out.animate([{ opacity: 0 }], { duration: M06.fade, easing: EASE.std, fill: "forwards" }));
      const cycle = s.cycle;
      ex.finished.then(() => {
        if (live.current.pinned === out) { out.style.setProperty("visibility", "hidden"); out.removeAttribute("data-leaving"); }
        setSt((p) => (p.cycle === cycle && p.leaving != null ? { ...p, leaving: null } : p));
      }).catch(() => {});
      // 6. Entrada: 200 ms (220 en el eje vertical), --ease-out, sin retardo (se superpone con la salida).
      const dist = yAxis ? M06.yIn : s.depth ? M06.depth : M06.shift;
      L.anims.push(inn.animate([{ opacity: fromOpacity, transform: tr(dist * d) }, { opacity: 1, transform: "none" }], { duration: yAxis ? M06.enterDesk : M06.enter, easing: EASE.out }));
      // 7. Corte de meta en el h1 visible: se revela en el sentido del viaje y una línea cian barre debajo.
      const title = h1 && !h1.classList.contains("sr-only") && h1.getClientRects().length ? h1 : null;
      if (title) {
        L.anims.push(title.animate([
          { clipPath: d > 0 ? "inset(-8px 100% -8px -8px)" : "inset(-8px -8px -8px 100%)", transform: `translateX(${8 * d}px)` },
          { clipPath: "inset(-8px -8px -8px -8px)", transform: "none" },
        ], { duration: M06.title, easing: EASE.out }));
        title.dataset.dir = String(d);
        title.classList.add("sec-cut");
        L.cut = setTimeout(() => title.classList.remove("sec-cut"), M06.line + 40);
      }
      // 8. Formación: los primeros 4 bloques visibles llegan escalonados (sólo transform), todo en ≤ 240 ms.
      const vh = window.innerHeight;
      const kids = [...inn.children].filter((el): el is HTMLElement => {
        if (!(el instanceof HTMLElement) || (title && (el === title || el.contains(title)))) return false;
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.bottom > 0 && r.top < vh;
      }).slice(0, 4);
      kids.forEach((el, i) => L.anims.push(el.animate([{ transform: tr(10 * (i + 1) * d) }, { transform: "none" }], { duration: M06.form, delay: i * M06.stagger, easing: EASE.out, fill: "backwards" })));
    } catch { /* navegador sin soporte parcial: queda el estado final */ }
  });

  // Terminó la salida: la sección ya está oculta (display:none); se limpia lo que la fijaba.
  useLayoutEffect(() => {
    if (s.leaving != null) return;
    const L = live.current;
    if (L.pinned) {
      for (const a of L.anims) if ((a.effect as KeyframeEffect | null)?.target === L.pinned) a.cancel();
      unpin(L.pinned);
      L.pinned = null;
    }
  }, [s.leaving]);

  // Montaje: sin animación (está BrandIntro), salvo «volver» del entrenamiento: sube 12 px y aparece en 200 ms.
  useLayoutEffect(() => {
    const since = performance.now() - lastUnmount;
    if (lastUnmount && since > 50 && since < 4000) {
      const el = pane(shown.current);
      if (el && canAnimate()) live.current.anims.push(el.animate([{ opacity: 0, transform: `translateY(${M06.rise}px)` }, { opacity: 1, transform: "none" }], { duration: M06.enter, easing: EASE.out }));
    }
    const L = live.current;
    return () => { lastUnmount = performance.now(); L.anims.forEach((a) => a.cancel()); clearTimeout(L.cut); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={stage} className={className ? `sec-stage ${className}` : "sec-stage"}>
      {s.visited.map((k) => {
        const on = k === s.active, out = k === s.leaving;
        return (
          <Activity key={`${s.reset}|${k}`} mode={on || out ? "visible" : "hidden"}>
            <div className={`${paneClass} sec-pane`} data-sec={k} data-active={on ? "" : undefined} data-leaving={out ? "" : undefined} inert={out || undefined} aria-hidden={out || undefined}>
              {node(k)}
            </div>
          </Activity>
        );
      })}
    </div>
  );
}
