// Mensajes entre las escenas de /conoce y el formulario, sin estado global de React: un CustomEvent por ventana.
// · «repi:interest»: una escena prepara el formulario (tipo de organización, perfil, pedido de reunión y, para gimnasios, la
//   modalidad que le interesa).
// · «repi:mode»: un enlace de otra escena (perfil Gimnasios, cierre) elige una modalidad en «Dos formas de entrenar».
// `?modo=completo|control` en la URL hace lo mismo al cargar.
import { isModeId, type ModeId, type ProductMode } from "@/content/conoce";
import type { Profile } from "@/lib/site-events";

export type InterestDetail = { profile: Profile; meeting?: boolean; mode?: ProductMode };
export const INTEREST_EVENT = "repi:interest";
export const MODE_EVENT = "repi:mode";

export const announceInterest = (d: InterestDetail) => window.dispatchEvent(new CustomEvent<InterestDetail>(INTEREST_EVENT, { detail: d }));
/** «repi:mode-chosen»: la persona dejó elegida una modalidad en «Dos formas de entrenar» (el formulario la toma). */
export const MODE_CHOSEN_EVENT = "repi:mode-chosen";
export const announceMode = (mode: ModeId) => window.dispatchEvent(new CustomEvent<{ mode: ModeId }>(MODE_CHOSEN_EVENT, { detail: { mode } }));
export const pickMode = (mode: ModeId) => window.dispatchEvent(new CustomEvent<{ mode: ModeId }>(MODE_EVENT, { detail: { mode } }));

/** La modalidad pedida en la URL (`?modo=`), o null. */
export function modeFromUrl(): ModeId | null {
  try { const m = new URLSearchParams(window.location.search).get("modo"); return isModeId(m) ? m : null; } catch { return null; }
}
