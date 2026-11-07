"use client";
// D195 · Ayuda de primera vez (onboarding contextual). Aparece la primera vez que la persona usa una función, se cierra con un
// toque y no vuelve (se recuerda en la cuenta y, sin conexión, en el teléfono). Nunca tapa controles ni interrumpe un
// entrenamiento: es una tarjeta en el flujo, sin animación larga, anunciada como nota para lectores de pantalla.
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

const LS = "repi:hints";
let cache: Promise<Record<string, string>> | null = null;
// M06: lo ya leído queda a mano en forma síncrona: una sección que se abre después dibuja sus «Nuevo» en el primer cuadro
// (antes aparecían un instante después y corrían los botones de las pestañas de Progreso).
let resolved: Record<string, string> | null = null;
const local = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(LS) ?? "{}") as Record<string, string>; } catch { return {}; } };
function hints() {
  cache ??= api<{ hints: Record<string, string> }>("/api/me/hints").then((x) => ({ ...local(), ...x.hints })).catch(() => local()).then((h) => (resolved = h));
  return cache;
}
/** Lectura anticipada de las ayudas vistas (la barra del alumno la pide al montar). */
export function preloadHints() { void hints(); }
export function markHint(id: string, seen = true) {
  try { const m = local(); if (seen) m[id] = new Date().toISOString(); else delete m[id]; localStorage.setItem(LS, JSON.stringify(m)); } catch { /* sin almacenamiento */ }
  if (resolved) { resolved = { ...resolved }; if (seen) resolved[id] = new Date().toISOString(); else delete resolved[id]; }
  cache = null;
  void api("/api/me/hints", { body: { key: id, seen } }).catch(() => {});
}
/** Vuelve a mostrar todas las ayudas (Perfil → «Volver a ver las ayudas»). */
export async function resetHints() {
  try { localStorage.removeItem(LS); } catch { /* sin almacenamiento */ }
  cache = null; resolved = null;
  await api("/api/me/hints", { body: { reset: true } });
}
/** ¿Ya vio esta ayuda? null mientras carga (no se muestra nada hasta saberlo, para no parpadear). */
export function useHintSeen(id: string) {
  const [seen, setSeen] = useState<boolean | null>(() => (resolved ? !!resolved[id] : null));
  useEffect(() => { let off = false; void hints().then((h) => { if (!off) setSeen(!!h[id]); }); return () => { off = true; }; }, [id]);
  return [seen, () => { setSeen(true); markHint(id); }] as const;
}

export function Hint({ id, title, text, children, action = "Entendido" }: { id: string; title?: string; text: string; children?: ReactNode; action?: string }) {
  const [seen, dismiss] = useHintSeen(id);
  if (seen !== false) return null;
  return (
    <aside className="hint" role="note" aria-label={title ?? "Ayuda"}>
      <div>{title && <b>{title}</b>}<span>{text}</span>{children}</div>
      <button type="button" className="linkbtn" onClick={dismiss}>{action}</button>
    </aside>
  );
}
