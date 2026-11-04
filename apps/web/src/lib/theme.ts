// D188: tema global en el dispositivo. Una sola fuente: el atributo data-theme de <html> (lo que lee el CSS) y la copia
// local `repi:theme` (lo que lee el script de arranque antes de pintar). Sin contexto de React en la raíz: cambiar el tema
// no vuelve a renderizar la app (temporizadores, series y formularios no se enteran); sólo el selector se suscribe.
import { isThemePref, parseLocalTheme, reconcileTheme, resolveTheme, type LocalTheme, type Theme, type ThemePref } from "@repi/domain";
import { tokens } from "@repi/domain/tokens";
import { api, ApiError } from "./api";
import { DARK_MQ, THEME_KEY } from "./theme-boot";

/** Rutas con diseño propio que no siguen el tema (sitio público, pantallas de recepción, cartel e informes imprimibles). */
export const FIXED_THEME_PATH = /^\/(?:$|legal(?:\/|$)|ranking\/pantalla|ingreso\/pantalla|instalar\/cartel)|\/informe(?:\/|$)/;
export const STATUSBAR = { light: tokens.theme.light.statusbar, dark: tokens.theme.dark.statusbar } as const;

export type ThemeSync = "synced" | "pending" | "error";
type State = { pref: ThemePref; theme: Theme; sync: ThemeSync };
const listeners = new Set<() => void>();
let state: State | null = null;

const systemDark = () => typeof matchMedia === "function" && matchMedia(DARK_MQ).matches;
function readLocal(): LocalTheme | null { try { return parseLocalTheme(localStorage.getItem(THEME_KEY)); } catch { return null; } }
function writeLocal(v: LocalTheme) { try { localStorage.setItem(THEME_KEY, JSON.stringify(v)); } catch { /* modo privado: rige la sesión */ } }

function emit(next: State) {
  if (state && state.pref === next.pref && state.theme === next.theme && state.sync === next.sync) return;
  state = next;
  for (const l of listeners) l();
}

/** Aplica el modo efectivo en <html> y en la barra del navegador. Idempotente y sin parpadeo (sólo atributos). */
export function applyTheme(pref: ThemePref, sync?: ThemeSync) {
  const theme = resolveTheme(pref, systemDark());
  const d = document.documentElement;
  if (d.getAttribute("data-theme") !== theme) d.setAttribute("data-theme", theme);
  if (d.getAttribute("data-theme-pref") !== pref) d.setAttribute("data-theme-pref", pref);
  syncStatusBar(theme);
  emit({ pref, theme, sync: sync ?? state?.sync ?? (readLocal()?.pending ? "pending" : "synced") });
}

export function syncStatusBar(theme: Theme = (document.documentElement.getAttribute("data-theme") as Theme) ?? "dark") {
  if (FIXED_THEME_PATH.test(location.pathname)) return;
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = STATUSBAR[theme];
}

export function getThemeState(): State {
  if (!state) { const p = readLocal()?.pref ?? "system"; state = { pref: p, theme: resolveTheme(p, systemDark()), sync: readLocal()?.pending ? "pending" : "synced" }; }
  return state;
}
const SERVER_STATE: State = { pref: "system", theme: "dark", sync: "synced" };
export const getServerThemeState = () => SERVER_STATE;
export function subscribeTheme(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

type Remote = { uid: string; theme: ThemePref; themeChangedAt: number | null };
let lastUid: string | null = null;

async function push(local: LocalTheme): Promise<ThemeSync> {
  try {
    const r = await api<Remote>("/api/me/settings", { body: { theme: local.pref, themeChangedAt: local.at } });
    lastUid = r.uid;
    // El servidor devuelve la vigente: si otro dispositivo cambió después, se adopta esa.
    const cur = readLocal();
    if (cur && cur.at !== local.at) return "pending"; // hubo otro cambio mientras viajaba este: lo envía su propio pedido
    writeLocal({ pref: r.theme, at: r.themeChangedAt ?? local.at, pending: false, uid: r.uid });
    applyTheme(r.theme, "synced");
    return "synced";
  } catch (e) {
    // Sin conexión, servidor caído o sesión vencida: queda guardado en el teléfono y se envía al volver. Sólo un rechazo
    // del pedido (400/403) es un error a mostrar.
    const sync: ThemeSync = e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408 && e.status !== 429 ? "error" : "pending";
    if (state) emit({ ...state, sync });
    return sync;
  }
}

/** Elección del usuario: se ve al instante, queda en el dispositivo y se envía a la cuenta. */
export async function setThemePref(pref: ThemePref): Promise<ThemeSync> {
  if (!isThemePref(pref)) return "error";
  const prev = readLocal();
  const local: LocalTheme = { pref, at: Math.max(Date.now(), (prev?.at ?? 0) + 1), pending: true, uid: lastUid ?? prev?.uid ?? null };
  writeLocal(local);
  applyTheme(pref, "pending");
  return push(local);
}

let syncing: Promise<void> | null = null;
/** Al abrir un espacio con sesión y al volver la conexión: trae la de la cuenta o envía la pendiente. */
export function syncThemeWithAccount(): Promise<void> {
  syncing ??= (async () => {
    try {
      const r = await api<Remote>("/api/me/settings");
      lastUid = r.uid;
      const { local, push: mustPush } = reconcileTheme(readLocal(), { theme: r.theme, changedAt: r.themeChangedAt }, r.uid);
      writeLocal(local);
      applyTheme(local.pref, mustPush ? "pending" : "synced");
      if (mustPush) await push(local);
    } catch { /* sin conexión o sin sesión: rige la copia local */ }
    finally { syncing = null; }
  })();
  return syncing;
}

/** Al cerrar sesión: la apariencia queda (evita un destello en la próxima apertura) pero sin dueño ni cambio pendiente,
 *  así nunca se envía a la próxima cuenta que entre en este navegador. */
export function forgetThemeOwner() {
  lastUid = null;
  const cur = readLocal();
  if (cur) writeLocal({ ...cur, pending: false, uid: null });
}
