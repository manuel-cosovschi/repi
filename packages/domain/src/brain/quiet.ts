// AC3 · Hora de Buenos Aires y horario de silencio. Argentina usa UTC−3 fijo (sin horario de verano desde 2009), así que
// las cuentas se hacen con un desfase constante y sin Intl: el resultado es el mismo en el servidor, el navegador y offline.

/** Desfase de Buenos Aires respecto de UTC, en minutos. */
export const AR_OFFSET_MIN = -180;
const DAY_MS = 86_400_000;
const toMs = (x: Date | string | number) => (x instanceof Date ? x.getTime() : typeof x === "number" ? x : Date.parse(x));

export type ArParts = { y: number; m: number; d: number; hh: number; mm: number; dow: number; minutes: number; day: string };
/** Fecha y hora local de Buenos Aires de un instante. `dow`: 0 = domingo. `day`: «AAAA-MM-DD». */
export function arParts(at: Date | string | number): ArParts {
  const t = new Date(toMs(at) + AR_OFFSET_MIN * 60_000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate(), hh = t.getUTCHours(), mm = t.getUTCMinutes();
  return { y, m, d, hh, mm, dow: t.getUTCDay(), minutes: hh * 60 + mm, day: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}
export const arDay = (at: Date | string | number) => arParts(at).day;
export const arMinutes = (at: Date | string | number) => arParts(at).minutes;

/** «22:00» → minutos desde la medianoche; null si no es una hora válida (HH:MM, 00:00–23:59). */
export function parseHm(hm: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((hm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export const isHm = (x: unknown): x is string => typeof x === "string" && parseHm(x) != null;

/** Instante (Date) de un día local «AAAA-MM-DD» a los `minutes` minutos de la medianoche de Buenos Aires. */
export function arInstant(day: string, minutes = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + (minutes - AR_OFFSET_MIN) * 60_000);
}
/** Último milisegundo del día local de Buenos Aires de `at` (para lo que vale «sólo por hoy»). */
export const endOfArDay = (at: Date | string | number) => new Date(arInstant(arDay(at)).getTime() + DAY_MS - 1);
/** Día local sumando días («AAAA-MM-DD»). */
export const addArDays = (day: string, n: number) => arDay(arInstant(day, 12 * 60).getTime() + n * DAY_MS);
/** Lunes de la semana local (para claves semanales de deduplicación). */
export function arWeekStart(at: Date | string | number): string {
  const p = arParts(at);
  return addArDays(p.day, -((p.dow + 6) % 7));
}
/** Días de calendario local entre dos instantes (b − a). */
export const arDaysBetween = (a: Date | string | number, b: Date | string | number) =>
  Math.round((arInstant(arDay(b)).getTime() - arInstant(arDay(a)).getTime()) / DAY_MS);
/** «12/10» (día y mes locales), para la evidencia. */
export function fmtArDate(at: Date | string | number): string {
  const p = arParts(at);
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}`;
}

/**
 * ¿`now` cae dentro del horario de silencio [start, end) en hora de Buenos Aires? Soporta ventanas que cruzan la medianoche
 * (22:00–08:00). Con inicio igual a fin no hay silencio. Una hora inválida no silencia (se valida al guardar las preferencias).
 */
export function inQuiet(now: Date | string | number, start: string, end: string): boolean {
  const s = parseHm(start), e = parseHm(end);
  if (s == null || e == null || s === e) return false;
  const m = arMinutes(now);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Próximo instante permitido: `now` si no está en silencio; si no, el fin de la ventana (hoy o mañana, hora local). */
export function nextAllowed(now: Date | string | number, start: string, end: string): Date {
  const t = toMs(now);
  if (!inQuiet(t, start, end)) return new Date(t);
  const e = parseHm(end)!;
  const p = arParts(t);
  const today = arInstant(p.day, e);
  return today.getTime() > t ? today : arInstant(addArDays(p.day, 1), e);
}
