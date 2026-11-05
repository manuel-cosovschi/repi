"use client";
// D195 · Estado de guardado honesto (bloque 05/06). Dice dónde están los datos según hechos de la cola offline: guardado en el
// teléfono (IndexedDB) no es «guardado en tu cuenta». Nunca muestra un código interno como explicación principal.
import type { SyncState } from "@/lib/offline/queue";

export type SyncView = { text: string; tone: "ok" | "warn" | "bad" | "mute"; detail: string | null };

export function syncView(st: SyncState, o: { anyDone: boolean; conflicts: number; rejected?: boolean }): SyncView {
  const n = st.pending;
  const p = (k: number) => `${k} ${k === 1 ? "cambio" : "cambios"}`;
  if (o.rejected) return { text: "No se pudo guardar en tu cuenta", tone: "bad", detail: "Tus series siguen en este teléfono." };
  if (st.kind === "conflict" || o.conflicts > 0) return { text: "Hay dos versiones de una serie", tone: "bad", detail: "Elegí cuál queda: no se pisó ninguna." };
  if (st.kind === "error") return { text: "No se pudo sincronizar", tone: "bad", detail: st.error ?? "Tus datos siguen en el teléfono. Reintentamos solos." };
  if (st.kind === "offline") return { text: n ? `Sin conexión · ${p(n)} en el teléfono` : "Sin conexión", tone: "warn", detail: n ? "Se guardan en tu cuenta cuando vuelva la conexión." : null };
  if (n > 0 && st.kind === "saving") return { text: "Guardado en el teléfono · sincronizando…", tone: "warn", detail: null };
  if (n > 0) return { text: `Guardado en el teléfono · ${p(n)} por sincronizar`, tone: "warn", detail: null };
  return o.anyDone ? { text: "Guardado en tu cuenta", tone: "ok", detail: null } : { text: "Sin series todavía", tone: "mute", detail: null };
}

export const syncInk = (tone: SyncView["tone"]) =>
  tone === "bad" ? "var(--ui-error-text)" : tone === "warn" ? "var(--ui-warning-text)" : tone === "ok" ? "var(--ui-accent-2)" : "var(--ui-muted)";
