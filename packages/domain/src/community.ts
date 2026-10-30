// Comunidad del gym y Repi Club (Etapa 6). Fuentes: REPI Desktop Gym.dc.html (sc.community/validations),
// REPI App Alumno v4.dc.html (pestaña Gym), 15_REPI_CLUB.md, 05_BUSINESS_RULES (Comunidad), Auditoría de huecos §3.5–3.14.
// Las reglas marcadas [S] son supuestos del handoff; ver docs/DECISIONS.md (D49–D56).

// ── Desafíos y récords ──────────────────────────────────────────────────────
export const CHALLENGE_UNITS = { reps: "repeticiones", seg: "tiempo", kg: "kilos" } as const;
export type ChallengeUnit = keyof typeof CHALLENGE_UNITS;
export const isUnit = (x: unknown): x is ChallengeUnit => typeof x === "string" && x in CHALLENGE_UNITS;
/** F-HX-11 (propuesta): categoría temática del desafío. */
export const CHALLENGE_CATEGORIES = { fuerza: "Fuerza", resistencia: "Resistencia", cardio: "Cardio", movilidad: "Movilidad" } as const;
export type ChallengeCategory = keyof typeof CHALLENGE_CATEGORIES;
/** Deslinde de seguridad visible en cada desafío (Auditoría 3.8). */
export const SAFETY_NOTE = "Calentá bien, respetá la técnica y no intentes marcas máximas con dolor. Si algo molesta, frená.";

const MAX: Record<ChallengeUnit, number> = { reps: 1000, seg: 86_400, kg: 1000 };
/** Marca válida: positiva, dentro de límites razonables; reps y segundos enteros; kilos con hasta un decimal. */
export function attemptValueOk(unit: ChallengeUnit, value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX[unit]) return false;
  return unit === "kg" ? Math.round(value * 10) === value * 10 : Number.isInteger(value);
}
export function fmtValue(v: number | null | undefined, unit: ChallengeUnit): string {
  if (v == null) return "Sin récord";
  if (unit === "seg") return v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")} min` : `${v} s`;
  if (unit === "kg") return `${String(v).replace(".", ",")} kg`;
  return `${v} reps`;
}
/** ¿a mejora a b? Con `lowerIsBetter` (tiempos) gana el menor. */
export const better = (a: number, b: number, lowerIsBetter: boolean) => (lowerIsBetter ? a < b : a > b);
/** "Intento válido" ≠ "nuevo récord": sólo mejorar el récord vigente lo actualiza (MASTER_PROMPT §9). */
export const isNewRecord = (value: number, record: number | null, lowerIsBetter: boolean) => record == null || better(value, record, lowerIsBetter);

/** Mejor marca por persona entre intentos aprobados (ranking del desafío y "tu mejor marca", F-GC-09). */
export function bestByMember<T extends { memberId: string; value: number; at: Date | string }>(rows: T[], lowerIsBetter: boolean): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.memberId);
    // Empate: gana quien lo logró primero.
    if (!cur || better(r.value, cur.value, lowerIsBetter) || (r.value === cur.value && new Date(r.at) < new Date(cur.at))) best.set(r.memberId, r);
  }
  return [...best.values()].sort((a, b) => (a.value === b.value ? new Date(a.at).getTime() - new Date(b.at).getTime() : lowerIsBetter ? a.value - b.value : b.value - a.value));
}

/** Categoría de ranking (Auditoría 3.8): declarada por el socio y opcional; +40 sale de la fecha de nacimiento si la hay. */
export const DIVISIONS = { F: "Mujeres", M: "Hombres" } as const;
export type Division = keyof typeof DIVISIONS;
export const isDivision = (x: unknown): x is Division => x === "F" || x === "M";
export const RANK_FILTERS = { all: "Todas", F: "Mujeres", M: "Hombres", "40": "+40" } as const;
export function ageAt(birthIso: string | null | undefined, at: Date): number | null {
  if (!birthIso || !/^\d{4}-\d{2}-\d{2}$/.test(birthIso)) return null;
  const [y, m, d] = birthIso.split("-").map(Number);
  let age = at.getUTCFullYear() - y;
  if (at.getUTCMonth() + 1 < m || (at.getUTCMonth() + 1 === m && at.getUTCDate() < d)) age--;
  return age;
}

// ── Logros y nivel (F-GC-05) ────────────────────────────────────────────────
/** [S] Nivel = 1 + floor(logros / 2). */
export const levelOf = (count: number) => ({ level: 1 + Math.floor(count / 2), toNext: 2 - (count % 2), pct: (count % 2) * 50 });
export const ACHIEVEMENT_KIND = {
  first_session: "Primer entrenamiento",
  month_12: "Constancia del mes",
  challenge_validated: "Marca validada",
  gym_record: "Récord del gym",
  trophy: "Trofeo", // D166: escalón de una familia de trofeos (levels.ts)
} as const;
export type AchievementKind = keyof typeof ACHIEVEMENT_KIND;
/** [S] Constancia: 12 sesiones completadas en un mes calendario. */
export const MONTH_SESSIONS_GOAL = 12;

// ── Premios y carnet (F-GC-06/07) ───────────────────────────────────────────
/** [S] Premio sólo cuando el intento validado establece un récord del gym; uno por persona y desafío. */
export const PRIZE_ON = "gym_record" as const;
/** Token del carnet: válido 5 minutos (QR rotativo y firmado; no contiene datos personales). */
export const CARD_TOKEN_TTL_MIN = 5;

// ── Archivos (validación real de tipo por firma, no sólo por extensión) ─────
export const IMAGE_LIMITS = { maxBytes: 5 * 1024 * 1024, mimes: ["image/jpeg", "image/png", "image/webp"] } as const;
export const ATTEMPT_VIDEO_LIMITS = { maxBytes: 80 * 1024 * 1024, maxSeconds: 120, mimes: ["video/mp4", "video/quicktime", "video/webm"] } as const;
/** Detecta el tipo real por los primeros bytes. Devuelve el mime o null. */
export function sniff(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i];
  if (bytes.length < 12) return null;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  if (b(0) === 0x1a && b(1) === 0x45 && b(2) === 0xdf && b(3) === 0xa3) return "video/webm";
  if (b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70) {
    const brand = String.fromCharCode(b(8), b(9), b(10), b(11));
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}
/** Mime declarado y firma deben coincidir (mp4/mov comparten contenedor y se aceptan cruzados). */
export function fileOk(kind: "image" | "attempt_video", declared: string, bytes: Uint8Array): boolean {
  const lim = kind === "image" ? IMAGE_LIMITS : ATTEMPT_VIDEO_LIMITS;
  if (!(lim.mimes as readonly string[]).includes(declared) || bytes.byteLength === 0 || bytes.byteLength > lim.maxBytes) return false;
  const real = sniff(bytes);
  if (!real) return false;
  const iso = (m: string) => (m === "video/quicktime" ? "video/mp4" : m);
  return iso(real) === iso(declared);
}

// ── Repi Club (F-RC-01..05) ─────────────────────────────────────────────────
export const CLUB_POST_MAX = 500;
export const CLUB_COMMENT_MAX = 300;
/** Antispam: sin enlaces en publicaciones ni comentarios. */
export const hasLink = (text: string) => /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ar|net|org|io|app|ly)\b)/i.test(text);
/** [S] Límites: 5 publicaciones por hora y 20 comentarios por hora por persona. */
export const CLUB_RATE = { postsPerHour: 5, commentsPerHour: 20 } as const;
/** [S] Con 3 reportes distintos, el contenido se oculta hasta que modere el gym. */
export const CLUB_AUTOHIDE_REPORTS = 3;
/** Nombre visible en el Club: nombre y la inicial del apellido (o "Socio/a" si no quiere mostrarlo). */
export function clubName(full: string, show: boolean) {
  if (!show) return "Socio/a del gym";
  const [first, ...rest] = full.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
}
/** Ranking del Club: sesiones del mes en curso; sin datos de salud (F-RC-03). Empate por orden alfabético estable. */
export function clubRanking<T extends { userId: string; name: string; sessions: number }>(rows: T[]) {
  return [...rows].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)).map((r, i, arr) => ({ ...r, pos: i > 0 && arr[i - 1].sessions === r.sessions ? -1 : i + 1 }))
    .map((r, i, arr) => ({ ...r, pos: r.pos === -1 ? (arr.slice(0, i).reverse().find((x) => x.pos !== -1)?.pos ?? 1) : r.pos }));
}

/**
 * Ranking por ejercicio del gym (D144): mejor 1RM estimado de cada persona. `before` es su mejor marca hasta hace una
 * semana: con eso se calcula cuántos puestos subió o bajó (o si entra nuevo). Empates comparten puesto.
 */
export function liftRanking<T extends { key: string; name: string; best: number; before: number | null }>(rows: T[]) {
  const place = <R extends { v: number; name: string }>(xs: R[]) => {
    const s = [...xs].sort((a, b) => b.v - a.v || a.name.localeCompare(b.name));
    const pos = new Map<R, number>();
    s.forEach((x, i) => pos.set(x, i > 0 && s[i - 1].v === x.v ? pos.get(s[i - 1])! : i + 1));
    return { s, pos };
  };
  const now = place(rows.map((r) => ({ ...r, v: r.best })));
  const prev = place(rows.filter((r) => r.before != null).map((r) => ({ ...r, v: r.before! })));
  const prevPos = new Map([...prev.pos].map(([x, p]) => [x.key, p]));
  return now.s.map((r) => {
    const p = prevPos.get(r.key);
    return { key: r.key, name: r.name, best: r.best, pos: now.pos.get(r)!, delta: p == null ? null : p - now.pos.get(r)!, isNew: p == null };
  });
}
