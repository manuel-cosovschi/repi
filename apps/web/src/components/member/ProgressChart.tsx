"use client";
// PP1 (D199) · Gráfico de evolución sin librerías (SVG, ~0 KB extra en el bundle). Una sola serie por gráfico (el título la
// nombra; no hay leyenda de colores). Reglas:
// - El eje X es el tiempo real: los días sin registro quedan como espacio, no se inventan puntos.
// - Cada punto es un registro real. La línea fina sólo los une para leer la tendencia y lo dice debajo; con un solo registro
//   no hay línea (ni tendencia inventada).
// - Récords: rombo, no sólo color. Meta opcional: línea punteada con su etiqueta.
// - Tocar, hacer clic o enfocar un punto (Tab / ← →) muestra su dato exacto en una ficha anunciada a lectores de pantalla.
// - Debajo, la lista de todos los registros del período (la vista de tabla) para quien no use el gráfico.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ChartPoint = { id: string; day: string; y: number; record?: boolean; first?: boolean; label: string; detail?: ReactNode };

const H = 188, PAD = { l: 44, r: 14, t: 16, b: 28 };
const dayMs = (d: string) => Date.parse(`${d}T12:00:00Z`);
const short = (d: string) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
/** 3–5 divisiones «redondas» para el eje Y. */
function ticks(min: number, max: number) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

export function ProgressChart({ title, points, fmt, target, onSelect, empty }: {
  title: string; points: ChartPoint[]; fmt: (v: number) => string; target?: { y: number; label: string } | null;
  onSelect?: (p: ChartPoint | null) => void; empty?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setSel(null); }, [points]); // otro ejercicio o rango: sin selección vieja
  const g = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => dayMs(p.day));
    const ys = points.map((p) => p.y).concat(target ? [target.y] : []);
    const yt = ticks(Math.min(...ys), Math.max(...ys));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const iw = w - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const sx = (x: number) => (x1 === x0 ? PAD.l + iw / 2 : PAD.l + ((x - x0) / (x1 - x0)) * iw);
    const sy = (y: number) => PAD.t + ih - ((y - yt[0]) / (yt[yt.length - 1] - yt[0] || 1)) * ih;
    return { yt, sx, sy, xs, x0, x1, pts: points.map((p, i) => ({ p, cx: sx(xs[i]), cy: sy(p.y) })) };
  }, [points, target, w]);
  const pick = (i: number | null) => { setSel(i); onSelect?.(i == null ? null : points[i]); };
  const key = (e: KeyboardEvent) => {
    if (!points.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const i = sel == null ? (e.key === "ArrowRight" ? 0 : points.length - 1) : Math.min(points.length - 1, Math.max(0, sel + (e.key === "ArrowRight" ? 1 : -1)));
      pick(i);
      (box.current?.querySelectorAll<SVGGElement>("[data-pt]")[i])?.focus();
    }
    if (e.key === "Escape") pick(null);
  };
  if (!g) return <div className="pc-empty" role="note">{empty ?? "Sin registros en este período."}</div>;
  const cur = sel == null ? null : points[sel];
  const xLabels = g.x1 === g.x0 ? [g.x0] : [g.x0, (g.x0 + g.x1) / 2, g.x1];
  return (
    <figure className="pc" aria-label={title}>
      <div ref={box} className="pc-plot" onKeyDown={key}>
        <svg width={w} height={H} role="group" aria-label={`${title}: ${points.length} ${points.length === 1 ? "registro" : "registros"}. Usá las flechas para recorrerlos.`}>
          {g.yt.map((v) => (
            <g key={v} aria-hidden="true">
              <line x1={PAD.l} x2={w - PAD.r} y1={g.sy(v)} y2={g.sy(v)} className="pc-grid" />
              <text x={PAD.l - 6} y={g.sy(v) + 4} textAnchor="end" className="pc-axis">{fmt(v)}</text>
            </g>
          ))}
          {xLabels.map((x, i) => (
            <text key={i} aria-hidden="true" x={g.sx(x)} y={H - 8} textAnchor={xLabels.length === 1 ? "middle" : i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"} className="pc-axis">
              {short(new Date(x).toISOString().slice(0, 10))}
            </text>
          ))}
          {target && (
            <g aria-hidden="true">
              <line x1={PAD.l} x2={w - PAD.r} y1={g.sy(target.y)} y2={g.sy(target.y)} className="pc-target" />
              <text x={w - PAD.r} y={g.sy(target.y) - 5} textAnchor="end" className="pc-axis pc-target-txt">{target.label}</text>
            </g>
          )}
          {g.pts.length > 1 && <polyline aria-hidden="true" className="pc-line" points={g.pts.map((q) => `${q.cx},${q.cy}`).join(" ")} />}
          {g.pts.map((q, i) => (
            <g key={q.p.id} data-pt="" role="button" tabIndex={0} aria-pressed={sel === i} aria-label={`${q.p.label}${q.p.record ? ", récord" : ""}`}
              onClick={() => pick(i)} onFocus={() => pick(i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(i); } }} className="pc-pt">
              <circle cx={q.cx} cy={q.cy} r={16} className="pc-hit" />
              {q.p.record
                ? <rect x={q.cx - 5.5} y={q.cy - 5.5} width={11} height={11} transform={`rotate(45 ${q.cx} ${q.cy})`} className={`pc-dot rec${sel === i ? " on" : ""}`} />
                : <circle cx={q.cx} cy={q.cy} r={sel === i ? 6 : 4.5} className={`pc-dot${sel === i ? " on" : ""}`} />}
            </g>
          ))}
        </svg>
      </div>
      <div className="pc-legend" aria-hidden="true">
        {points.length > 1 ? <span><i className="pc-k-line" />La línea une tus registros: entre ellos no hay datos.</span> : <span>Un solo registro: seguí entrenando para ver la evolución.</span>}
        {points.some((p) => p.record) && <span><i className="pc-k-rec" />Récord</span>}
        {target && <span><i className="pc-k-target" />Objetivo</span>}
      </div>
      <div className="pc-tip" aria-live="polite">{cur ? <><b>{cur.label}</b>{cur.detail}</> : <span className="mb-muted">Tocá un punto para ver el dato exacto.</span>}</div>
    </figure>
  );
}
