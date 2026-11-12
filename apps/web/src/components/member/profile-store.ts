"use client";
// D217 · Perfil de entrenamiento en la app del alumno: una sola lectura de /api/me/profile por sesión (memoria de la pestaña,
// nunca almacenamiento del teléfono), compartida por Perfil, el formulario breve contextual y la tarjeta de Inicio. Después de
// guardar se reemplaza con lo que devuelve el servidor y se avisa con «repi:profile» (lo escucha, p. ej., la sugerencia de
// «No vino el profe», que deja de valer cuando cambia el perfil).
import { useEffect, useSyncExternalStore } from "react";
import type { ProfileField, ProfileStatus, TrainingWishes } from "@repi/domain";
import { api } from "@/lib/api";

export const PROFILE_EVENT = "repi:profile";
/** Lugares donde se ofrece el formulario breve (los acepta POST /api/me/profile { asked }). */
export type GateWhere = "onboarding" | "routines" | "import" | "solo" | "coach_absent" | "brain";
export type AgeBand = "adult" | "minor" | "unknown";
export type ProfileView = {
  profile: TrainingWishes | null; status: ProfileStatus; missing: ProfileField[]; filled: ProfileField[]; age: AgeBand;
  version: number; updatedAt: string | null; asked: Partial<Record<GateWhere, string>>;
};

let view: ProfileView | null = null;
let err: string | null = null;
let inflight: Promise<ProfileView> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

const strip = (v: ProfileView & { changed?: unknown }): ProfileView => ({
  profile: v.profile ?? null, status: v.status, missing: v.missing ?? [], filled: v.filled ?? [], age: v.age ?? "unknown",
  version: v.version ?? 0, updatedAt: v.updatedAt ?? null, asked: v.asked ?? {},
});

export const peekProfile = () => view;
export function setProfileView(v: ProfileView) { view = strip(v); err = null; emit(); }
/** Marca localmente que ya se ofreció el formulario en un lugar (si el servidor no respondió, igual no se vuelve a ofrecer en esta sesión). */
export function markAskedLocal(where: GateWhere) {
  if (!view) return;
  view = { ...view, asked: { ...view.asked, [where]: new Date().toISOString() } };
  emit();
}

/** Lee el perfil (una vez; `force` revalida). Los pedidos simultáneos comparten la misma respuesta. */
export function loadProfile(force = false): Promise<ProfileView> {
  if (view && !force) return Promise.resolve(view);
  if (inflight) return inflight;
  const p = api<ProfileView>("/api/me/profile")
    .then((v) => { setProfileView(v); return view!; })
    .catch((e: Error) => { err = e.message; emit(); throw e; })
    .finally(() => { if (inflight === p) inflight = null; });
  inflight = p;
  return p;
}

/** Guarda un cambio parcial y deja el perfil vigente en memoria. Avisa a la app si cambió algo. */
export async function saveProfilePatch(patch: Partial<TrainingWishes>, via: string) {
  const r = await api<ProfileView & { changed: ProfileField[] }>("/api/me/profile", { body: { patch, via } });
  setProfileView(r);
  if (r.changed?.length && typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_EVENT));
  return r;
}

/** Registra que el formulario breve ya se ofreció en `where` (completado u omitido). Nunca falla hacia afuera. */
export async function markAsked(where: GateWhere) {
  markAskedLocal(where);
  try { setProfileView(await api<ProfileView>("/api/me/profile", { body: { asked: where } })); } catch { /* queda marcado en esta sesión */ }
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** El perfil en memoria (null hasta que llega) y el último error. `revalidate` lo vuelve a pedir al montar. */
export function useProfileView({ revalidate = false, skip = false }: { revalidate?: boolean; skip?: boolean } = {}) {
  const v = useSyncExternalStore(subscribe, () => view, () => null);
  const e = useSyncExternalStore(subscribe, () => err, () => null);
  useEffect(() => { if (!skip) loadProfile(revalidate).catch(() => {}); }, [revalidate, skip]);
  return { view: v, err: e, reload: () => loadProfile(true).catch(() => {}) };
}
