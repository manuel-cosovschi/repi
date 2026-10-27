// Contexto de entrada (anexo PWA §Conservar gimnasio e invitación): QR de sede, invitación o bienvenida con que se abrió REPI.
// Se guarda en este navegador para retomarlo al abrir desde el ícono. No autoriza nada: el servidor vuelve a validar
// sede, destinatario, vencimiento y consumo. Vence a los 7 días. Sólo el QR de sede (público) va también en una cookie,
// porque algunos dispositivos comparten cookies pero no el almacenamiento con la app agregada a inicio.
export type EntryKind = "join" | "code" | "activate";
export type Entry = { k: EntryKind; v: string; label?: string; at: number };

const KEY = "repi:entry";
const COOKIE = "repi_entry";
const TTL_MS = 7 * 86_400_000;
const SHAPE: Record<EntryKind, RegExp> = { join: /^[A-Za-z0-9_-]{4,40}$/, code: /^[A-Z0-9]{6}$/, activate: /^[A-Za-z0-9_-]{16,128}$/ };

const valid = (e: unknown): e is Entry =>
  !!e && typeof e === "object" && (e as Entry).k in SHAPE && SHAPE[(e as Entry).k].test((e as Entry).v) && Date.now() - (e as Entry).at < TTL_MS;

export function saveEntry(k: EntryKind, v: string, label?: string) {
  const e: Entry = { k, v, label: label?.slice(0, 80), at: Date.now() };
  if (!valid(e)) return;
  try { localStorage.setItem(KEY, JSON.stringify(e)); } catch {}
  if (k === "join") document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(e))}; Max-Age=${TTL_MS / 1000}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function readEntry(): Entry | null {
  const parse = (raw: string | null | undefined) => { try { const e = raw ? JSON.parse(raw) : null; return valid(e) ? e : null; } catch { return null; } };
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch {}
  const fromCookie = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return parse(stored) ?? parse(fromCookie ? decodeURIComponent(fromCookie) : null);
}

export function clearEntry() {
  try { localStorage.removeItem(KEY); } catch {}
  document.cookie = `${COOKIE}=; Max-Age=0; Path=/`;
}

/** Destino interno del contexto. Nunca una URL externa. */
export const entryHref = (e: Pick<Entry, "k" | "v">) =>
  e.k === "join" ? `/unirse/${e.v}` : e.k === "code" ? `/acceso?code=${e.v}` : `/activar/${e.v}`;

/** Interpreta lo que la persona pega o escribe para recuperar su alta: enlace de REPI, código de invitación o código de sede. */
export function parseEntryInput(raw: string): Pick<Entry, "k" | "v"> | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.origin !== location.origin) return null;
    const join = u.pathname.match(/^\/unirse\/([A-Za-z0-9_-]{4,40})\/?$/);
    if (join) return { k: "join", v: join[1] };
    const act = u.pathname.match(/^\/activar\/([A-Za-z0-9_-]{16,128})\/?$/);
    if (act) return { k: "activate", v: act[1] };
    const code = u.searchParams.get("code")?.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (u.pathname.startsWith("/acceso") && code && SHAPE.code.test(code)) return { k: "code", v: code };
    return null;
  } catch {}
  const code = t.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (t.replace(/[\s-]/g, "").length === 6 && SHAPE.code.test(code)) return { k: "code", v: code };
  if (SHAPE.join.test(t)) return { k: "join", v: t };
  return null;
}
