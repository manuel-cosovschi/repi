// D217 · Perfil de entrenamiento canónico (Training Profile). Una sola fuente: `user_pref.wishes` (dominio: wishes.ts). Lo
// leen el cerebro (contexto), Training Intelligence (personalización explícita), «No vino el profe», rutinas propias, el pedido
// y el asistente de programas, Progreso y las metas semanales; nadie guarda un perfil propio en otro lado.
//
// Escritura: sólo la propia persona (sesión), por cambio parcial (`cleanProfilePatch` + `mergeProfile`): lo que no se manda no
// se toca, cada campo guarda por dónde y cuándo se declaró y la versión sube con cada cambio real. Política de menores: un
// objetivo corporal no se acepta sin edad adulta confirmada. Auditoría sin valores (sólo qué campos y desde dónde). Al cambiar
// un dato que usan los avisos (objetivo, días, experiencia), se cancelan los avisos vigentes que dependían de él; los programas
// y sus prescripciones nunca se reescriben por un cambio de objetivo.
import { eq, sql } from "drizzle-orm";
import {
  ageEligibility, cleanProfilePatch, goalAllowed, localDate, mergeProfile, personalProfile, profileStatus, readWishes,
  type PersonalProfile, type ProfileField, type ProfileVia, type TrainingWishes, PROFILE_VIAS,
} from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";
import { cancelProfileInterventions } from "../brain/store";

const { userPref, user } = schema;
/** Campos cuyo cambio vuelve obsoletos los avisos vigentes que los usaban. */
const INVALIDATES: readonly ProfileField[] = ["goal", "experience", "daysPerWeek"];

export type AgeBand = "adult" | "minor" | "unknown";
async function read(userId: string, now = new Date()) {
  const [r] = await db.select({ wishes: userPref.wishes, birth: user.birthDate, hints: userPref.hints }).from(user).leftJoin(userPref, eq(userPref.userId, user.id)).where(eq(user.id, userId));
  if (!r) throw new AccessError("unauthorized", "Ingresá para continuar.", 401);
  return { wishes: readWishes(r.wishes), age: ageEligibility(r.birth, localDate(now)) as AgeBand, hints: (r.hints ?? {}) as Record<string, string> };
}

function view(w: TrainingWishes | null, age: AgeBand, hints: Record<string, string>) {
  const st = profileStatus(w, age);
  const asked = Object.fromEntries(Object.entries(hints).filter(([k]) => k.startsWith("profile_")).map(([k, v]) => [k.slice(8), v]));
  return {
    profile: w, status: st.status, missing: st.missing, filled: st.filled, age, version: w?.meta?.version ?? 0, updatedAt: w?.meta?.updatedAt ?? null,
    /** Lugares donde ya se ofreció el formulario breve (completado u omitido): no se vuelve a ofrecer ahí. */
    asked,
  };
}
export type ProfileView = ReturnType<typeof view>;

export async function myProfile(userId: string, now = new Date()) {
  const r = await read(userId, now);
  return view(r.wishes, r.age, r.hints);
}

/** Lo que usa el motor (objetivo, experiencia, días, minutos, equipamiento y estado), con la política de menores aplicada. */
export async function personalOf(userId: string, now = new Date()): Promise<PersonalProfile> {
  const r = await read(userId, now).catch(() => null);
  return personalProfile(r?.wishes ?? null, r?.age ?? "unknown");
}

/**
 * Cambio parcial del perfil. `via`: dónde se declaró (Perfil, alta, «Mis rutinas», importar, «Entrenar por mi cuenta»,
 * «No vino el profe», REPI, pedido de programa, Progreso). Devuelve el perfil vigente y qué cambió.
 */
export async function updateProfile(userId: string, input: unknown, via: ProfileVia, now = new Date()) {
  if (!PROFILE_VIAS.includes(via)) throw new AccessError("invalid", "Origen inválido.");
  const c = cleanProfilePatch(input);
  if (!c.ok) throw new AccessError("invalid", c.error);
  const { age } = await read(userId, now);
  if (c.patch.goal && !goalAllowed(c.patch.goal, age)) throw new AccessError("invalid", "Ese objetivo no está disponible para tu cuenta. Elegí otro de la lista.");
  // Lectura y escritura en la misma transacción con la fila bloqueada: dos formularios a la vez no se pisan campos.
  const out = await db.transaction(async (tx) => {
    await tx.insert(userPref).values({ userId, updatedAt: now }).onConflictDoNothing();
    const [cur] = await tx.select({ wishes: userPref.wishes }).from(userPref).where(eq(userPref.userId, userId)).for("update");
    const m = mergeProfile(readWishes(cur?.wishes), c.patch, via, now);
    if (m.changed.length) await tx.update(userPref).set({ wishes: m.wishes, updatedAt: now }).where(eq(userPref.userId, userId));
    return m;
  });
  if (out.changed.length) {
    // Sin valores en la auditoría: sólo qué campos cambiaron, desde dónde y la versión.
    await audit(db, { actorUserId: userId, action: "profile.updated", resourceType: "user", resourceId: userId, meta: { via, changed: out.changed, version: out.wishes.meta?.version ?? 0 } });
    if (out.changed.some((f) => INVALIDATES.includes(f))) await cancelProfileInterventions(userId, now).catch(() => 0);
  }
  const r = await read(userId, now);
  return { ...view(r.wishes, r.age, r.hints), changed: out.changed };
}

/** Marca que el formulario breve ya se ofreció en un lugar (completado u omitido). Sólo la clave y la fecha. */
export async function markProfileAsked(userId: string, where: string, now = new Date()) {
  const key = `profile_${where}`;
  await db.insert(userPref).values({ userId, hints: { [key]: now.toISOString() }, updatedAt: now })
    .onConflictDoUpdate({ target: userPref.userId, set: { hints: sql`coalesce(${userPref.hints}, '{}'::jsonb) || ${JSON.stringify({ [key]: now.toISOString() })}::jsonb`, updatedAt: now } });
}
