"use client";
// PP1 (D199) · Gráfico de evolución sin librerías (SVG, ~0 KB extra en el bundle). Una sola serie por gráfico (el título la
// nombra; no hay leyenda de colores). La matemática de la vista (tramo, zoom, marcas, escala) es pura: @repi/domain chart-view.
// Reglas:
// - El eje X es el tiempo real: los días sin registro quedan como espacio, no se inventan puntos. El zoom sólo cambia el
//   tramo que se ve: nunca toca valores ni agrega puntos; las marcas del eje son fechas reales (días, semanas o meses según
//   el tramo, con año si cruza de año).
// - Cada punto es un registro real. La línea fina sólo los une para leer la tendencia y lo dice debajo; con un solo registro
//   no hay línea (ni tendencia inventada). Más de 8 semanas entre dos registros: ese tramo va punteado y más tenue.
// - Varios registros el mismo día: se separan unos px (orden estable) para tocar y enfocar cada uno; la ficha lo dice.
// - Récords: rombo, no sólo color. Fecha aproximada (historial importado): marcador hueco con borde punteado.
// - Meta opcional: línea punteada «Objetivo» (fuera de escala: flecha en el borde). Propuesta de REPI (`future`): círculo
//   hueco punteado en su fecha, después de la marca «Hoy», nunca unido a la línea; se elige como el último elemento.
// - Escala Y ajustada a lo visible, con un rango mínimo para no exagerar cambios chicos; «Desde cero» la lleva a 0.
// - Zoom horizontal: − / + / «Ver todo», ◀ ▶ para moverse y una franja con todo el período (arrastrar el recuadro mueve).
//   Mouse: arrastrar sobre el gráfico elige un tramo; con Mayúscula arrastra el tramo; doble clic como el doble toque.
//   Táctil: pellizco = zoom alrededor de los dedos; un dedo en horizontal mueve sólo con zoom (el desplazamiento vertical
//   de la página sigue andando: touch-action pan-y, nunca preventDefault); doble toque: con todo el período acerca ×2
//   ahí; con zoom, vuelve a «Ver todo».
// - Teclado (con el gráfico enfocado, una sola parada de Tab): ← → registro anterior/siguiente (mueve el tramo si sale del
//   borde), Inicio/Fin el primero/último, + o = acerca, − aleja, 0 ver todo, Mayúscula+← → o RePág/AvPág mueven el
//   tramo, Escape quita la selección. El tramo visible se anuncia («Mostrando del 3 mar al 12 jun · 14 registros»).
// - Historiales largos: sólo se dibuja lo visible; con más de 150 puntos visibles, puntos chicos y el toque busca el más
//   cercano (binaria en x) en vez de un área por punto. Sin animación con «reducir movimiento».
// - Tocar, hacer clic o elegir con el teclado un punto muestra su dato exacto en una ficha anunciada a lectores de pantalla.
// - Debajo, la lista de todos los registros del período (la vista de tabla) la arma quien usa el gráfico.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  clampWindow, dayToMs, ensureVisible, fullWindow, gapSegments, isFullWindow, localDate, minSpanFor, navIndex, nearestIndex, panWindow,
  rangeText, sameDayGroups, timeTicks, visibleSlice, windowFromRange, yScale, zoomWindow, type ChartWindow,
} from "@repi/domain";

export type ChartPoint = { id: string; day: string; y: number; record?: boolean; first?: boolean; approx?: boolean; label: string; detail?: ReactNode };
/** Propuesta de REPI para la próxima sesión: no es un registro. */
export type ChartFuture = { day: string; y: number; label: string; detail?: ReactNode };

const H = 188, OV = 30, PAD = { r: 14, t: 18, b: 28 }, INSET = 9, DENSE = 150, COMPACT = 60, SPREAD = 8, HIT = 24, MIN = 60_000;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const Ico = ({ d }: { d: string }) => <svg viewBox="0 0 16 16" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

type Gest = {
  ptrs: Map<number, { x: number; y: number }>;
  mode: null | "pending" | "pan" | "brush" | "pinch";
  start: { x: number; y: number; win: ChartWindow; shift: boolean; type: string };
  pinch: { d0: number; mid0: number; win0: ChartWindow };
  dragged: boolean; lastTap: { t: number; x: number; y: number } | null; dbl: number;
};
const W0 = { x0: 0, x1: 0 };

export function ProgressChart({ title, points, fmt, target, future, onSelect, empty }: {
  title: string; points: ChartPoint[]; fmt: (v: number) => string; target?: { y: number; label: string } | null;
  future?: ChartFuture | null; onSelect?: (p: ChartPoint | null) => void; empty?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/[^\w-]/g, "");
  const [w, setW] = useState(340);
  const [win, setWin] = useState<ChartWindow | null>(null); // null = todo el período
  const [sel, setSel] = useState<number | null>(null); // índice en los registros ordenados; la propuesta es n
  const [zero, setZero] = useState(false);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const [said, setSaid] = useState("");
  const anim = useRef(0);
  const focusReq = useRef(0); // intentos pendientes de enfocar el punto elegido (puede aparecer al terminar la animación)
  const ovDrag = useRef<{ off: number } | null>(null);
  const gs = useRef<Gest>({ ptrs: new Map(), mode: null, start: { x: 0, y: 0, win: W0, shift: false, type: "" }, pinch: { d0: 1, mid0: 0, win0: W0 }, dragged: false, lastTap: null, dbl: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { cancelAnimationFrame(anim.current); setSel(null); setWin(null); setBrush(null); }, [points, future]); // otra serie: de cero
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // Registros ordenados por fecha (estable), una vez por serie.
  const d = useMemo(() => {
    const ord = points.map((p, i) => ({ p, i, x: dayToMs(p.day) })).sort((a, b) => a.x - b.x || a.i - b.i);
    const xs = ord.map((o) => o.x);
    const fx = future ? dayToMs(future.day) : null;
    const grp = sameDayGroups(xs);
    const last = xs.length ? xs[xs.length - 1] : null;
    const hoy = fx != null && last != null && last < fx ? Math.min(fx, Math.max(last, dayToMs(localDate(new Date())))) : null;
    return {
      ord, xs, ys: ord.map((o) => o.p.y), fx, full: fullWindow(fx == null ? xs : [...xs, fx]), grp, gaps: gapSegments(xs), hoy,
      maxGrp: grp.reduce((m, g) => Math.max(m, g.count), 1), refYear: new Date().getFullYear(), neg: points.some((p) => p.y < 0) || (future?.y ?? 0) < 0,
    };
  }, [points, future]);
  const n = d.ord.length, nItems = n + (future ? 1 : 0), full = d.full;
  const cur = win ?? full;
  const minSpan = full ? minSpanFor(full) : 0;
  const canZoom = !!full && nItems >= 2 && full.x1 - full.x0 > minSpan + MIN;
  const vis = cur ? visibleSlice(d.xs, cur) : { start: 0, end: 0 };
  const count = vis.end - vis.start;
  const announce = cur && canZoom ? rangeText(cur.x0, cur.x1, count, d.refYear) : "";
  useEffect(() => { const t = setTimeout(() => setSaid(announce), 400); return () => clearTimeout(t); }, [announce]);
  useEffect(() => {
    if (!focusReq.current) return;
    const el = box.current?.querySelector<SVGGElement>(`[data-i="${sel}"]`);
    focusReq.current = el ? 0 : focusReq.current - 1;
    (el ?? box.current)?.focus({ preventScroll: true });
  });

  if (!full || !cur) return <div className="pc-empty" role="note">{empty ?? "Sin registros en este período."}</div>;

  // Escala Y: lo visible (+ propuesta visible); sin puntos en el tramo, los vecinos que cruzan la línea.
  const futVis = d.fx != null && d.fx >= cur.x0 && d.fx <= cur.x1;
  const lo = Math.max(0, vis.start - 1), hi = Math.min(n, vis.end + 1);
  const yv = d.ys.slice(vis.start, vis.end);
  const ext = futVis ? [future!.y] : [];
  const ys = yScale(yv, { target: target?.y ?? null, fromZero: zero && !d.neg, extra: yv.length ? ext : ext.concat(d.ys.slice(lo, hi)) });
  const yLabels = ys.ticks.map(fmt);
  const padL = Math.min(84, Math.max(34, Math.max(...yLabels.map((l) => l.length)) * 6.2 + 10));
  const L = padL + INSET, R = w - PAD.r - INSET, iw = R - L, T = PAD.t, B = H - PAD.b, ih = B - T;
  const span = cur.x1 - cur.x0;
  const sx = (x: number) => (span > 0 ? L + ((x - cur.x0) / span) * iw : L + iw / 2);
  const sy = (y: number) => B - ((y - ys.lo) / (ys.hi - ys.lo || 1)) * ih;
  const toT = (px: number) => cur.x0 + ((px - L) / iw) * span;
  const dense = count > DENSE;
  // QA D217: entre 60 y 150 puntos visibles, marcadores chicos (siguen siendo enfocables) para que no se amontonen.
  const compact = !dense && count > COMPACT;
  const px: number[] = [], py: number[] = [];
  for (let i = lo; i < hi; i++) { px.push(sx(d.xs[i]) + (dense ? 0 : d.grp[i].offset * SPREAD)); py.push(sy(d.ys[i])); }
  const P = (i: number) => ({ x: px[i - lo], y: py[i - lo] });
  // Línea: tramos continuos en un trazo; los de más de 8 semanas, aparte y punteados. Los vecinos fuera del tramo los recorta el clip.
  let solid = "", gap = "";
  for (let i = lo; i + 1 < hi; i++) {
    const a = P(i), b = P(i + 1), seg = `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    if (d.gaps[i]) gap += seg; else solid += seg;
  }
  const xt = timeTicks(cur.x0, cur.x1, { maxTicks: Math.max(2, Math.floor(iw / 72)), refYear: d.refYear });
  const full0 = isFullWindow(cur, full);
  const atMin = span <= minSpan + MIN;
  const itemX = (i: number) => (i >= n ? d.fx! : d.xs[i]);
  const futP = futVis ? { x: sx(d.fx!), y: sy(future!.y) } : null;

  const pick = (i: number | null) => { setSel(i); onSelect?.(i == null || i >= n ? null : d.ord[i].p); };
  const clampOrNull = (to: ChartWindow) => { const c = clampWindow(to, full, minSpan); return isFullWindow(c, full) ? null : c; };
  // Cambio de tramo animado (200 ms), salvo «reducir movimiento»; los gestos van directo.
  const goWin = (to: ChartWindow) => {
    cancelAnimationFrame(anim.current);
    const fin = isFullWindow(to, full) ? null : to;
    if (reduced()) { setWin(fin); return; }
    const from = cur, t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 200), e = 1 - (1 - k) ** 3;
      if (k >= 1) { setWin(fin); return; }
      setWin({ x0: from.x0 + (to.x0 - from.x0) * e, x1: from.x1 + (to.x1 - from.x1) * e });
      anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  const anchor = () => (sel != null ? itemX(sel) : (cur.x0 + cur.x1) / 2);
  const zoom = (f: number) => { if (canZoom && !(f < 1 ? atMin : full0)) goWin(zoomWindow(cur, full, f, { anchor: anchor(), mode: "center", minSpan })); };
  const pan = (dir: -1 | 1) => { if (canZoom && !full0) goWin(panWindow(cur, full, dir * span * 0.5, minSpan)); };
  const reset = () => { if (!full0) goWin(full); };
  const dblAt = (x: number) => { if (canZoom) goWin(full0 ? zoomWindow(cur, full, 0.5, { anchor: toT(x), mode: "keep", minSpan }) : full); };
  const go = (i: number | null) => {
    if (i == null) return;
    pick(i);
    focusReq.current = 20;
    const x = itemX(i);
    if (x < cur.x0 || x > cur.x1) goWin(ensureVisible(cur, full, x, 0.1, minSpan));
  };
  const key = (e: KeyboardEvent) => {
    const k = e.key;
    if ((e.shiftKey && (k === "ArrowLeft" || k === "ArrowRight")) || k === "PageUp" || k === "PageDown") pan(k === "ArrowLeft" || k === "PageUp" ? -1 : 1);
    else if (k === "ArrowRight" || k === "ArrowLeft" || k === "Home" || k === "End") {
      go(navIndex(sel, k === "ArrowRight" ? "next" : k === "ArrowLeft" ? "prev" : k === "Home" ? "first" : "last", nItems, { start: vis.start, end: futVis && vis.end === n ? n + 1 : vis.end }));
    } else if (canZoom && (k === "+" || k === "=")) zoom(0.5);
    else if (canZoom && (k === "-" || k === "_")) zoom(2);
    else if (canZoom && k === "0") reset();
    else if (k === "Escape" && sel != null) { pick(null); box.current?.focus({ preventScroll: true }); }
    else if ((k === "Enter" || k === " ") && (e.target as Element).hasAttribute?.("data-i")) pick(Number((e.target as Element).getAttribute("data-i")));
    else return;
    e.preventDefault();
  };

  // Gestos con Pointer Events sobre el SVG (touch-action: pan-y: el scroll vertical sigue siendo del navegador).
  const local = (e: { clientX: number; clientY: number }) => { const r = svg.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const capture = (id: number) => { try { svg.current?.setPointerCapture(id); } catch { /* puntero ya liberado */ } };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    const g = gs.current;
    if (!g.ptrs.size) g.dragged = false;
    if (!canZoom || (e.pointerType === "mouse" && e.button !== 0)) return;
    const p = local(e);
    g.ptrs.set(e.pointerId, p);
    if (g.ptrs.size === 2) {
      cancelAnimationFrame(anim.current);
      const [a, b] = [...g.ptrs.values()];
      g.mode = "pinch"; g.pinch = { d0: Math.max(24, Math.hypot(a.x - b.x, a.y - b.y)), mid0: (a.x + b.x) / 2, win0: cur };
      for (const id of g.ptrs.keys()) capture(id);
      setBrush(null);
    } else if (g.ptrs.size === 1) { g.mode = "pending"; g.start = { ...p, win: cur, shift: e.shiftKey, type: e.pointerType }; }
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const g = gs.current;
    if (!g.ptrs.has(e.pointerId)) return;
    const p = local(e);
    g.ptrs.set(e.pointerId, p);
    if (g.mode === "pinch" && g.ptrs.size >= 2) {
      const [a, b] = [...g.ptrs.values()], dd = Math.max(24, Math.hypot(a.x - b.x, a.y - b.y)), mid = (a.x + b.x) / 2;
      const w0 = g.pinch.win0, s0 = w0.x1 - w0.x0, at = w0.x0 + ((g.pinch.mid0 - L) / iw) * s0, s1 = (s0 * g.pinch.d0) / dd;
      const x0 = at - ((mid - L) / iw) * s1; // la fecha que estaba bajo los dedos sigue bajo los dedos
      setWin(clampOrNull({ x0, x1: x0 + s1 }));
      g.dragged = true;
      return;
    }
    const s = g.start, dx = p.x - s.x, dy = p.y - s.y;
    if (g.mode === "pending") {
      if (Math.abs(dx) < (s.type === "mouse" ? 4 : 8) && Math.abs(dy) < 8) return;
      if (s.type === "mouse") g.mode = s.shift ? "pan" : "brush";
      else if (Math.abs(dx) > Math.abs(dy) && !isFullWindow(s.win, full)) g.mode = "pan";
      else { g.mode = null; g.ptrs.delete(e.pointerId); return; } // vertical o sin zoom: el gesto es de la página
      cancelAnimationFrame(anim.current);
      capture(e.pointerId);
      g.dragged = true;
    }
    if (g.mode === "pan") setWin(clampOrNull(panWindow(s.win, full, (-dx / iw) * (s.win.x1 - s.win.x0), minSpan)));
    if (g.mode === "brush") setBrush([Math.min(R, Math.max(L, s.x)), Math.min(R, Math.max(L, p.x))]);
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    const g = gs.current, m = g.mode;
    if (!g.ptrs.has(e.pointerId)) return;
    const p = local(e);
    g.ptrs.delete(e.pointerId);
    if (m === "brush" && brush) {
      const a = Math.min(...brush), b = Math.max(...brush);
      if (b - a >= 10) goWin(windowFromRange(toT(a), toT(b), full, minSpan));
      setBrush(null);
    }
    if (m === "pending" && e.pointerType !== "mouse") { // doble toque
      const now = performance.now(), lt = g.lastTap;
      if (lt && now - lt.t < 320 && Math.hypot(p.x - lt.x, p.y - lt.y) < 30) { g.lastTap = null; g.dbl = now; dblAt(p.x); } else g.lastTap = { t: now, ...p };
    }
    if (!g.ptrs.size || m === "pinch") g.mode = null; // al soltar un dedo del pellizco no se salta a arrastrar
  };
  const cancel = (e: PointerEvent<SVGSVGElement>) => {
    const g = gs.current;
    g.ptrs.delete(e.pointerId);
    if (!g.ptrs.size) { g.mode = null; g.dragged = false; }
    setBrush(null);
  };
  const click = (e: MouseEvent<SVGSVGElement>) => {
    if (gs.current.dragged) { gs.current.dragged = false; return; }
    // Clic sin coordenadas (lector de pantalla, teclado): el elemento. Con puntero: el punto más cercano (las áreas de
    // toque de puntos vecinos se pisan; la más cercana gana, no la de arriba).
    const t = (e.target as Element).closest?.("[data-i]");
    if (t && e.detail === 0) return pick(Number(t.getAttribute("data-i")));
    const p = local(e), a = vis.start - lo, b = vis.end - lo;
    const k = nearestIndex(px.slice(a, b), p.x, { ys: py.slice(a, b), ty: p.y, maxDist: HIT, slack: dense ? 0 : d.maxGrp * SPREAD });
    const kd = k >= 0 ? Math.hypot(px[a + k] - p.x, py[a + k] - p.y) : Infinity;
    if (futP && Math.hypot(futP.x - p.x, futP.y - p.y) <= Math.min(HIT, kd)) pick(n);
    else if (k >= 0) pick(vis.start + k);
  };
  const dblClick = (e: MouseEvent<SVGSVGElement>) => { if (performance.now() - gs.current.dbl > 600) dblAt(local(e).x); };

  // Franja con todo el período: el recuadro es el tramo visible; arrastrarlo (o tocar afuera) lo mueve.
  const fs = full.x1 - full.x0 || 1;
  const ox = (x: number) => L + ((x - full.x0) / fs) * iw;
  const ovAt = (e: PointerEvent<SVGSVGElement>) => full.x0 + ((e.clientX - e.currentTarget.getBoundingClientRect().left - L) / iw) * fs;
  const ovDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cancelAnimationFrame(anim.current);
    const t = ovAt(e), out = t < cur.x0 || t > cur.x1;
    if (out) setWin(clampOrNull({ x0: t - span / 2, x1: t + span / 2 }));
    ovDrag.current = { off: out ? span / 2 : t - cur.x0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
  };
  const ovMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!ovDrag.current) return;
    const x0 = ovAt(e) - ovDrag.current.off;
    setWin(clampOrNull({ x0, x1: x0 + span }));
  };
  const ovEnd = () => { ovDrag.current = null; };

  const curSel = sel != null && sel < n ? d.ord[sel].p : null;
  const ptLabel = (i: number) => {
    const p = d.ord[i].p, c = d.grp[i].count;
    return `${p.label}${p.record ? ", récord" : ""}${p.approx ? ", fecha aproximada" : ""}${c > 1 ? `, ${c} registros este día` : ""}`;
  };
  const marker = (i: number, small: boolean) => {
    const p = d.ord[i].p, { x, y } = P(i), on = sel === i, sm = small && !on;
    const cls = `pc-dot${p.record ? " rec" : ""}${p.approx ? " approx" : ""}${on ? " on" : ""}${sm ? " sm" : ""}`;
    const r = p.record ? (sm ? 3.5 : 5.5) : sm ? 2.5 : on ? 6 : 4.5;
    return p.record
      ? <rect x={x - r} y={y - r} width={r * 2} height={r * 2} transform={`rotate(45 ${x} ${y})`} className={cls} />
      : <circle cx={x} cy={y} r={r} className={cls} />;
  };
  const focusable = (i: number) => (
    <g key={d.ord[i].p.id} data-i={i} role="button" tabIndex={-1} aria-pressed={sel === i} aria-label={ptLabel(i)} className="pc-pt">
      {!dense && <circle cx={P(i).x} cy={P(i).y} r={16} className="pc-hit" />}
      {marker(i, dense || compact)}
    </g>
  );
  const shown: number[] = [];
  for (let i = vis.start; i < vis.end; i++) shown.push(i);
  const grpN = curSel ? d.grp[sel!].count : 0;

  return (
    <figure className="pc" aria-label={title}>
      {(canZoom || !d.neg) && (
        <div className="pc-tools" role="group" aria-label={`Vista del gráfico: ${title}`}>
          {canZoom && <>
            <span className="pc-tg">
              <button type="button" className="pc-tb" aria-label="Alejar" title="Alejar" aria-disabled={full0 || undefined} onClick={() => zoom(2)}><Ico d="M3.5 8h9" /></button>
              <button type="button" className="pc-tb" aria-label="Acercar" title="Acercar" aria-disabled={atMin || undefined} onClick={() => zoom(0.5)}><Ico d="M3.5 8h9M8 3.5v9" /></button>
              <button type="button" className="pc-tb pc-tb-txt" aria-disabled={full0 || undefined} onClick={reset}>Ver todo</button>
            </span>
            <span className="pc-tg">
              <button type="button" className="pc-tb" aria-label="Antes" title="Antes" aria-disabled={full0 || cur.x0 <= full.x0 + MIN || undefined} onClick={() => pan(-1)}><Ico d="M10 3.5 5.5 8l4.5 4.5" /></button>
              <button type="button" className="pc-tb" aria-label="Después" title="Después" aria-disabled={full0 || cur.x1 >= full.x1 - MIN || undefined} onClick={() => pan(1)}><Ico d="M6 3.5 10.5 8 6 12.5" /></button>
            </span>
          </>}
          {!d.neg && <button type="button" className="pc-tb pc-tb-txt pc-tb-end" aria-pressed={zero} title={zero ? "Volver a ajustar la escala a lo visible" : "Escala desde cero"} onClick={() => setZero((z) => !z)}>Desde cero</button>}
        </div>
      )}
      <div ref={box} className="pc-plot" tabIndex={0} role="group" onKeyDown={key} data-zoom={canZoom || undefined}
        aria-label={`${title}: ${n} ${n === 1 ? "registro" : "registros"}${future ? " y una propuesta" : ""}.`} aria-describedby={`${uid}-help`}>
        <svg ref={svg} width={w} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onClick={click} onDoubleClick={dblClick}>
          <defs><clipPath id={`${uid}-c`}><rect x={padL} y={0} width={Math.max(0, w - PAD.r - padL)} height={B + 8} /></clipPath></defs>
          {ys.ticks.map((v, i) => (
            <g key={v} aria-hidden="true">
              <line x1={padL} x2={w - PAD.r} y1={sy(v)} y2={sy(v)} className="pc-grid" />
              <text x={padL - 6} y={sy(v) + 4} textAnchor="end" className="pc-axis">{yLabels[i]}</text>
            </g>
          ))}
          {xt.map((t) => {
            const x = sx(t.ms), anc = xt.length === 1 ? "middle" : x < padL + 28 ? "start" : x > w - 34 ? "end" : "middle";
            return <text key={t.ms} aria-hidden="true" x={anc === "start" ? Math.max(padL, x - 6) : anc === "end" ? Math.min(w - 2, x + 6) : x} y={H - 8} textAnchor={anc} className="pc-axis">{t.label}</text>;
          })}
          {target && (ys.targetIn
            ? <g aria-hidden="true">
                <line x1={padL} x2={w - PAD.r} y1={sy(target.y)} y2={sy(target.y)} className="pc-target" />
                <text x={w - PAD.r} y={sy(target.y) - 5} textAnchor="end" className="pc-axis pc-target-txt">{target.label}</text>
              </g>
            : <text aria-hidden="true" x={w - PAD.r} y={target.y > ys.hi ? T - 6 : B - 5} textAnchor="end" className="pc-axis pc-target-txt">{target.label} {target.y > ys.hi ? "↑" : "↓"}</text>)}
          <g clipPath={`url(#${uid}-c)`}>
            {d.hoy != null && d.hoy >= cur.x0 && d.hoy <= cur.x1 && (
              <g aria-hidden="true">
                <line x1={sx(d.hoy)} x2={sx(d.hoy)} y1={T - 4} y2={B} className="pc-today" />
                <text x={sx(d.hoy) - 4} y={T + 6} textAnchor="end" className="pc-axis pc-today-txt">Hoy</text>
              </g>
            )}
            {solid && <path aria-hidden="true" className="pc-line" d={solid} />}
            {gap && <path aria-hidden="true" className="pc-line pc-gap" d={gap} />}
            {dense
              ? <>
                  <g aria-hidden="true">{shown.map((i) => (i === sel ? null : <g key={d.ord[i].p.id}>{marker(i, true)}</g>))}</g>
                  {sel != null && sel >= vis.start && sel < vis.end && focusable(sel)}
                </>
              : shown.map(focusable)}
            {futP && (
              <g data-i={n} role="button" tabIndex={-1} aria-pressed={sel === n} aria-label={`${future!.label}, propuesta de REPI: no es un registro`} className="pc-pt">
                <circle cx={futP.x} cy={futP.y} r={16} className="pc-hit" />
                <circle cx={futP.x} cy={futP.y} r={sel === n ? 8 : 7} className={`pc-fut${sel === n ? " on" : ""}`} />
                <circle cx={futP.x} cy={futP.y} r={2} className="pc-fut-c" />
              </g>
            )}
          </g>
          {brush && <rect aria-hidden="true" x={Math.min(...brush)} y={T} width={Math.abs(brush[1] - brush[0])} height={ih} className="pc-brush" />}
        </svg>
      </div>
      {canZoom && (
        <svg className="pc-ov" width={w} height={OV} aria-hidden="true" onPointerDown={ovDown} onPointerMove={ovMove} onPointerUp={ovEnd} onPointerCancel={ovEnd}>
          <rect x={L} y={3} width={Math.max(0, iw)} height={OV - 6} rx={6} className="pc-ov-track" />
          <path d={overviewPath(d.xs, d.ys, ox, OV)} className="pc-ov-line" />
          {d.fx != null && <circle cx={ox(d.fx)} cy={OV / 2} r={3} className="pc-ov-fut" />}
          <rect x={ox(cur.x0) - 3} y={1} width={Math.max(10, ox(cur.x1) - ox(cur.x0) + 6)} height={OV - 2} rx={7} className="pc-ov-win" />
        </svg>
      )}
      <p id={`${uid}-help`} className="sr-only">
        Flechas izquierda y derecha: registro anterior o siguiente. Inicio y Fin: el primero y el último.
        {canZoom && " Más: acercar. Menos: alejar. Cero: ver todo. Mayúscula con flechas, o Retroceder y Avanzar página: mover el tramo visible. En pantallas táctiles, pellizcá para acercar o alejar, arrastrá con un dedo para moverte cuando hay zoom y tocá dos veces para acercar o volver a ver todo."}
        {" "}Escape quita la selección. Debajo del gráfico está la lista de registros.
      </p>
      {canZoom && <p className="pc-range" aria-hidden="true">{announce}</p>}
      <p className="sr-only" aria-live="polite">{said}</p>
      <div className="pc-legend" aria-hidden="true">
        {n > 1 ? <span><i className="pc-k-line" />La línea une tus registros: entre ellos no hay datos.</span> : <span>Un solo registro: seguí entrenando para ver la evolución.</span>}
        {d.gaps.some(Boolean) && <span><i className="pc-k-gap" />Más de 8 semanas sin registros</span>}
        {points.some((p) => p.record) && <span><i className="pc-k-rec" />Récord</span>}
        {points.some((p) => p.approx) && <span><i className="pc-k-approx" />Fecha aproximada</span>}
        {target && <span><i className="pc-k-target" />Objetivo</span>}
        {future && <span><i className="pc-k-fut" />Propuesta (no es un registro)</span>}
      </div>
      <div className="pc-tip" aria-live="polite">
        {sel === n && future ? <><b>{future.label}</b><small>Propuesta de REPI para tu próxima sesión: todavía no es un registro.</small>{future.detail}</>
          : curSel ? <><b>{curSel.label}</b>
              {grpN > 1 && <small>{grpN} registros este día.</small>}
              {curSel.approx && <small>Fecha aproximada: viene de un historial importado.</small>}
              {curSel.detail}</>
          : <span className="mb-muted">Tocá un punto para ver el dato exacto.</span>}
      </div>
    </figure>
  );
}

/** Trazo de la franja de resumen (todo el período, valores normalizados a su alto; ≤ 1 punto por px: es sólo orientación). */
function overviewPath(xs: number[], ys: number[], ox: (x: number) => number, h: number) {
  if (xs.length < 2) return "";
  let lo = Infinity, hi = -Infinity;
  for (const y of ys) { if (y < lo) lo = y; if (y > hi) hi = y; }
  const sy = (y: number) => h - 7 - ((y - lo) / (hi - lo || 1)) * (h - 14);
  let s = "", lastX = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const x = ox(xs[i]);
    if (i && i < xs.length - 1 && x - lastX < 1) continue;
    s += `${s ? "L" : "M"}${x.toFixed(1)},${sy(ys[i]).toFixed(1)}`;
    lastX = x;
  }
  return s;
}
