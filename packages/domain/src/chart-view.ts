// Gráfico de evolución (PP1): matemática pura de la ventana visible, sin DOM ni React. El eje X son milisegundos de días
// reales (mediodía UTC de cada AAAA-MM-DD, así no lo corre el huso horario). El zoom sólo cambia qué tramo se ve: nunca
// toca valores ni inventa puntos intermedios.

export const CHART_DAY_MS = 86_400_000;
/** Ventana visible del eje X, en ms (x0 ≤ x1). */
export type ChartWindow = { x0: number; x1: number };

export const dayToMs = (day: string) => Date.parse(`${day}T12:00:00Z`);
export const msToDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Todo el período: del primer al último x. Sin datos, null. */
export function fullWindow(xs: readonly number[]): ChartWindow | null {
  if (!xs.length) return null;
  let x0 = Infinity, x1 = -Infinity;
  for (const x of xs) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  return { x0, x1 };
}

/** Ventana mínima: ~7 días, o todo el período si es más corto. */
export const minSpanFor = (full: ChartWindow, minDays = 7) => Math.min(full.x1 - full.x0, minDays * CHART_DAY_MS);

/** Ancho entre la mínima y todo el período, y dentro de él (si se recorta el ancho, conserva el centro). */
export function clampWindow(w: ChartWindow, full: ChartWindow, minSpan = minSpanFor(full)): ChartWindow {
  const fs = full.x1 - full.x0, want = w.x1 - w.x0;
  const span = Math.min(fs, Math.max(minSpan, want));
  let x0 = span === want ? w.x0 : (w.x0 + w.x1) / 2 - span / 2;
  x0 = Math.min(Math.max(x0, full.x0), full.x1 - span);
  return { x0, x1: x0 + span };
}

/** ¿Se ve todo el período? (tolera redondeos de la animación: 1 minuto). */
export const isFullWindow = (w: ChartWindow, full: ChartWindow) => w.x0 - full.x0 <= 60_000 && full.x1 - w.x1 <= 60_000;

/**
 * Zoom: factor < 1 acerca, > 1 aleja. «center» centra la ventana en el ancla (botones: la selección o el centro);
 * «keep» deja el ancla en la misma posición relativa (pellizco, doble toque).
 */
export function zoomWindow(w: ChartWindow, full: ChartWindow, factor: number, opts: { anchor?: number; mode?: "center" | "keep"; minSpan?: number } = {}): ChartWindow {
  const span = w.x1 - w.x0, anchor = opts.anchor ?? (w.x0 + w.x1) / 2;
  const min = opts.minSpan ?? minSpanFor(full);
  const next = Math.min(full.x1 - full.x0, Math.max(min, span * factor));
  const frac = opts.mode === "keep" && span > 0 ? (anchor - w.x0) / span : 0.5;
  const x0 = anchor - frac * next;
  return clampWindow({ x0, x1: x0 + next }, full, min);
}

/** Desplaza la ventana (ms; negativo = antes) sin salir del período. */
export const panWindow = (w: ChartWindow, full: ChartWindow, delta: number, minSpan?: number) =>
  clampWindow({ x0: w.x0 + delta, x1: w.x1 + delta }, full, minSpan);

/** Corre la ventana lo mínimo para que x quede adentro, con un margen (fracción del ancho). */
export function ensureVisible(w: ChartWindow, full: ChartWindow, x: number, margin = 0.1, minSpan?: number): ChartWindow {
  const span = w.x1 - w.x0, m = span * margin;
  if (x >= w.x0 + m && x <= w.x1 - m) return w;
  const x0 = x < w.x0 + m ? x - m : x + m - span;
  return clampWindow({ x0, x1: x0 + span }, full, minSpan);
}

/** Ventana elegida con el mouse (de a a b, en cualquier orden), ensanchada a la mínima si hace falta. */
export const windowFromRange = (a: number, b: number, full: ChartWindow, minSpan?: number) =>
  clampWindow({ x0: Math.min(a, b), x1: Math.max(a, b) }, full, minSpan);

/** Primer índice con xs[i] ≥ v (xs ordenado). */
export function lowerBound(xs: readonly number[], v: number) {
  let lo = 0, hi = xs.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < v) lo = mid + 1; else hi = mid; }
  return lo;
}
/** Primer índice con xs[i] > v (xs ordenado). */
export function upperBound(xs: readonly number[], v: number) {
  let lo = 0, hi = xs.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] <= v) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Puntos dentro de la ventana (bordes incluidos): índices [start, end) sobre xs ordenado. */
export const visibleSlice = (xs: readonly number[], w: ChartWindow) => ({ start: lowerBound(xs, w.x0), end: upperBound(xs, w.x1) });

/**
 * Varios registros el mismo día: desplazamiento estable (en «lugares») para separarlos unos px y que cada uno se pueda
 * tocar y enfocar. Para un grupo de n: -(n-1)/2 … +(n-1)/2, en el orden recibido. count = registros de ese día.
 */
export function sameDayGroups(keys: readonly (number | string)[]): { offset: number; count: number }[] {
  const out: { offset: number; count: number }[] = new Array(keys.length);
  for (let i = 0; i < keys.length;) {
    let j = i + 1;
    while (j < keys.length && keys[j] === keys[i]) j++;
    const n = j - i;
    for (let k = 0; k < n; k++) out[i + k] = { offset: k - (n - 1) / 2, count: n };
    i = j;
  }
  return out;
}

/** Tramos largos sin registros (> ~8 semanas): gaps[i] marca el tramo entre i e i+1, que va punteado y más tenue. */
export function gapSegments(xs: readonly number[], thresholdMs = 56 * CHART_DAY_MS): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i + 1 < xs.length; i++) out.push(xs[i + 1] - xs[i] > thresholdMs);
  return out;
}

/**
 * Punto más cercano a un toque (búsqueda binaria en x, sin un área por punto). xs en px, ordenado salvo corrimientos de
 * hasta `slack` px (los del mismo día). Con ys/ty mide distancia en 2D. Más lejos que maxDist: -1.
 */
export function nearestIndex(xs: readonly number[], target: number, opts: { ys?: readonly number[]; ty?: number; maxDist?: number; slack?: number } = {}): number {
  const { ys, ty, maxDist = Infinity, slack = 0 } = opts;
  if (!xs.length) return -1;
  const d = (i: number) => (ys && ty != null ? Math.hypot(xs[i] - target, ys[i] - ty) : Math.abs(xs[i] - target));
  const start = lowerBound(xs, target);
  let best = -1, bd = Infinity;
  for (let i = start; i < xs.length && xs[i] - target <= bd + slack; i++) { const v = d(i); if (v < bd) { bd = v; best = i; } }
  for (let i = start - 1; i >= 0 && target - xs[i] <= bd + slack; i--) { const v = d(i); if (v < bd) { bd = v; best = i; } }
  return bd <= maxDist ? best : -1;
}

/** Navegación con teclado sobre n elementos; sin selección, arranca por el primero/último visible ([start, end)). */
export function navIndex(cur: number | null, action: "prev" | "next" | "first" | "last", n: number, vis: { start: number; end: number }): number | null {
  if (n <= 0) return null;
  const clamp = (i: number) => Math.min(n - 1, Math.max(0, i));
  if (action === "first") return 0;
  if (action === "last") return n - 1;
  if (cur == null) return action === "next" ? clamp(vis.start) : clamp(vis.end > vis.start ? vis.end - 1 : vis.start - 1);
  return clamp(cur + (action === "next" ? 1 : -1));
}

/** Redondeo «lindo» (1, 2, 2,5, 5 × 10ⁿ) al más cercano. */
export function niceRound(v: number) {
  if (!(v > 0)) return 0;
  const mag = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}
const clean = (v: number) => parseFloat(v.toPrecision(12));

/** Divisiones «redondas» (~`count` tramos) que cubren [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw * (1 - 1e-9)) ?? raw;
  const lo = Math.floor(clean(min / step)) * step, hi = Math.ceil(clean(max / step)) * step;
  const out: number[] = [];
  for (let k = 0, v = lo; v <= hi + step / 2 && k < 50; k++, v = lo + k * step) out.push(clean(v));
  if (out.length < 2) out.push(clean(lo + step));
  return out;
}

/**
 * Escala Y según los puntos visibles. Rango mínimo = máx(10 % del valor medio, 2 × la menor diferencia no nula
 * redondeada, 1 unidad): 70 → 72,5 kg se ve, sin exagerarse. La meta entra si queda a no más de un rango de los datos
 * (si no, `targetIn` es false y se indica en el borde). `fromZero` arranca en 0 (si no hay valores negativos).
 */
export function yScale(values: readonly number[], opts: { target?: number | null; fromZero?: boolean; extra?: readonly number[] } = {}) {
  const vals = values.concat(opts.extra ?? []);
  if (!vals.length) vals.push(opts.target ?? 0);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const mean = vals.reduce((a, v) => a + Math.abs(v), 0) / vals.length;
  const uniq = [...new Set(vals)].sort((a, b) => a - b);
  let minDiff = Infinity;
  for (let i = 1; i < uniq.length; i++) minDiff = Math.min(minDiff, uniq[i] - uniq[i - 1]);
  const minSpan = Math.max(0.1 * mean, Number.isFinite(minDiff) ? 2 * niceRound(minDiff) : 0, 1);
  const t = opts.target;
  const reach = Math.max(hi - lo, minSpan);
  const targetIn = t != null && t >= lo - reach && t <= hi + reach;
  if (targetIn) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  const nonNeg = lo >= 0;
  if (opts.fromZero && nonNeg) { lo = 0; hi = Math.max(hi, minSpan); }
  else if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2; hi = mid + minSpan / 2;
    if (nonNeg && lo < 0) { lo = 0; hi = minSpan; }
  }
  const ticks = niceTicks(lo, hi, 4);
  return { lo: ticks[0], hi: ticks[ticks.length - 1], ticks, targetIn, minSpan };
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const ymd = (ms: number) => { const d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
/** «3 mar» o «3 mar 2026». */
export const fmtChartDay = (ms: number, withYear = false) => { const t = ymd(ms); return `${t.d} ${MONTHS[t.m]}${withYear ? ` ${t.y}` : ""}`; };
const atDay = (y: number, m: number, d: number) => Date.UTC(y, m, d, 12);

type TickUnit = { unit: "day" | "week" | "month" | "year"; n: number; approxDays: number };
const UNITS: TickUnit[] = [
  { unit: "day", n: 1, approxDays: 1 }, { unit: "day", n: 2, approxDays: 2 }, { unit: "day", n: 3, approxDays: 3 },
  { unit: "week", n: 1, approxDays: 7 }, { unit: "week", n: 2, approxDays: 14 },
  { unit: "month", n: 1, approxDays: 30.44 }, { unit: "month", n: 2, approxDays: 60.9 }, { unit: "month", n: 3, approxDays: 91.3 }, { unit: "month", n: 6, approxDays: 182.6 },
  { unit: "year", n: 1, approxDays: 365.25 }, { unit: "year", n: 2, approxDays: 730.5 }, { unit: "year", n: 5, approxDays: 1826 }, { unit: "year", n: 10, approxDays: 3652 },
];

function ticksFor(u: TickUnit, x0: number, x1: number): number[] {
  const out: number[] = [];
  const a = ymd(x0);
  if (u.unit === "day" || u.unit === "week") {
    const stepD = u.unit === "day" ? u.n : 7 * u.n;
    const startDay = Math.ceil((x0 - CHART_DAY_MS / 2) / CHART_DAY_MS); // primer día (desde 1970) con mediodía ≥ x0
    const phase = u.unit === "week" ? 4 : 0; // semanas desde el lunes (el 1/1/1970 fue jueves → el día 4 es lunes)
    for (let d = startDay + ((((phase - startDay) % stepD) + stepD) % stepD); d * CHART_DAY_MS + CHART_DAY_MS / 2 <= x1 + 1; d += stepD) out.push(d * CHART_DAY_MS + CHART_DAY_MS / 2);
  } else if (u.unit === "month") {
    let y = a.y, m = a.m;
    if (atDay(y, m, 1) < x0) { m++; if (m > 11) { m = 0; y++; } }
    while ((y * 12 + m) % u.n) { m++; if (m > 11) { m = 0; y++; } }
    for (let t = atDay(y, m, 1); t <= x1; m += u.n, t = atDay(y, m, 1)) out.push(t);
  } else {
    let y = a.y + (atDay(a.y, 0, 1) < x0 ? 1 : 0);
    y = Math.ceil(y / u.n) * u.n;
    for (; atDay(y, 0, 1) <= x1; y += u.n) out.push(atDay(y, 0, 1));
  }
  return out;
}

/**
 * Marcas del eje X para la ventana: días, semanas (lunes), meses o años según el ancho, con a lo sumo `maxTicks`.
 * El año aparece si la ventana cruza de año o no es el año de referencia (en la primera marca y en cada cambio de año).
 */
export function timeTicks(x0: number, x1: number, opts: { maxTicks?: number; refYear?: number } = {}): { ms: number; label: string; unit: TickUnit["unit"] }[] {
  const maxTicks = Math.max(2, opts.maxTicks ?? 5);
  const a = ymd(x0), b = ymd(x1);
  const showYear = a.y !== b.y || (opts.refYear != null && a.y !== opts.refYear);
  if (x1 - x0 < CHART_DAY_MS / 2) return [{ ms: x0, label: fmtChartDay(x0, showYear), unit: "day" }];
  let u = UNITS[UNITS.length - 1], out: number[] = [];
  for (const c of UNITS) {
    if ((x1 - x0) / CHART_DAY_MS / c.approxDays > maxTicks + 1) continue; // descarte rápido
    const t = ticksFor(c, x0, x1);
    if (t.length <= maxTicks) { u = c; out = t; break; }
  }
  if (!out.length) return [{ ms: x0, label: fmtChartDay(x0, showYear), unit: "day" }];
  let prevY: number | null = null;
  return out.map((ms) => {
    const t = ymd(ms), yearMark = showYear && (prevY == null || t.y !== prevY);
    prevY = t.y;
    const label = u.unit === "year" ? String(t.y) : u.unit === "month" ? `${MONTHS[t.m]}${yearMark ? ` ${t.y}` : ""}` : fmtChartDay(ms, yearMark);
    return { ms, label, unit: u.unit };
  });
}

/** «Mostrando del 3 mar al 12 jun · 14 registros» (con año si cruza de año o no es el de referencia). */
export function rangeText(x0: number, x1: number, count: number, refYear?: number) {
  const a = ymd(x0), b = ymd(x1);
  const yr = a.y !== b.y || (refYear != null && b.y !== refYear);
  const n = count === 0 ? "sin registros en este tramo" : `${count} ${count === 1 ? "registro" : "registros"}`;
  const range = x1 - x0 < CHART_DAY_MS / 2 ? `el ${fmtChartDay(x0, yr)}` : `del ${fmtChartDay(x0, yr && a.y !== b.y)} al ${fmtChartDay(x1, yr)}`;
  return `Mostrando ${range} · ${n}`;
}
