// D188 (bloque 03/06): apariencia de la cuenta. Claro, Oscuro o Automático (sigue al dispositivo).
// La preferencia es de la persona, no del rol ni del gimnasio: la misma en Alumno, Coach, Gym, Admin y Mi cuenta.
// Reglas puras compartidas por el servidor (validación y «gana el último cambio») y el cliente (copia local y offline).
export const THEME_PREFS = ["light", "dark", "system"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export type Theme = "light" | "dark";
export const DEFAULT_THEME_PREF: ThemePref = "system";

export const isThemePref = (v: unknown): v is ThemePref => typeof v === "string" && (THEME_PREFS as readonly string[]).includes(v);

/** Modo efectivo: «Automático» no se guarda como claro u oscuro, se resuelve con el dispositivo en cada momento. */
export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme => (pref === "system" ? (systemDark ? "dark" : "light") : pref);

/** Copia local del dispositivo. `pending`: cambio hecho sin confirmar en el servidor. `uid`: cuenta a la que pertenece
 *  ese cambio pendiente (sólo para no enviárselo a otra cuenta; no identifica a nadie). */
export type LocalTheme = { pref: ThemePref; at: number; pending: boolean; uid: string | null };
export type RemoteTheme = { theme: ThemePref; changedAt: number | null };

/**
 * Reconcilia la copia local con la cuenta al iniciar o al volver la conexión.
 * - Sin cambio pendiente: manda la cuenta (otro dispositivo pudo cambiarla).
 * - Pendiente de esta cuenta (o hecho en esta sesión antes de conocerla): se envía si es más nuevo que el de la cuenta.
 * - Pendiente de otra cuenta: se descarta; prevalece la cuenta que inició sesión.
 */
export function reconcileTheme(local: LocalTheme | null, remote: RemoteTheme, uid: string): { local: LocalTheme; push: boolean } {
  const fromRemote: LocalTheme = { pref: remote.theme, at: remote.changedAt ?? 0, pending: false, uid };
  if (!local || !local.pending) return { local: fromRemote, push: false };
  if (local.uid !== null && local.uid !== uid) return { local: fromRemote, push: false };
  if (remote.changedAt !== null && remote.changedAt >= local.at) return { local: fromRemote, push: false };
  return { local: { ...local, uid }, push: true };
}

/** Lo que acepta el servidor: el cambio sólo se guarda si es más nuevo que el guardado. Un reloj adelantado no puede
 *  bloquear cambios futuros: la marca se limita a «ahora» (+1 min de tolerancia). */
export function acceptThemeChange(stored: number | null, incoming: number | undefined, now: number): { ok: boolean; at: number } {
  const at = Math.min(incoming ?? now, now + 60_000);
  if (!Number.isFinite(at) || at <= 0) return { ok: false, at: now };
  return { ok: stored === null || at > stored, at };
}

/** Lectura tolerante de la copia local (puede venir de una versión vieja, editada a mano o corrupta). */
export function parseLocalTheme(raw: string | null): LocalTheme | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LocalTheme>;
    if (!isThemePref(v.pref)) return null;
    return { pref: v.pref, at: typeof v.at === "number" && Number.isFinite(v.at) ? v.at : 0, pending: v.pending === true, uid: typeof v.uid === "string" ? v.uid : null };
  } catch { return null; }
}
