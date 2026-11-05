// Configuración del alumno (F-HX-23, D95). Hoy: unidad de peso. Idioma es-AR único y notificaciones en el centro de la app
// (sin push al alumno todavía); menores según la política que defina el titular: no hay opciones que simular acá.
// D139: además, lo que busca entrenando (objetivo, tiempo, gustos y lo que evita), que usa la IA de «No vino el profe».
import { eq, sql } from "drizzle-orm";
import { acceptThemeChange, cleanWishes, isThemePref, isWeightUnit, type ThemePref, type TrainingWishes, type WeightUnit } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit } from "../access/util";

const { userPref } = schema;

export async function mySettings(userId: string) {
  const [p] = await db.select({ weightUnit: userPref.weightUnit, wishes: userPref.wishes, theme: userPref.theme, themeChangedAt: userPref.themeChangedAt })
    .from(userPref).where(eq(userPref.userId, userId));
  // D188: `uid` es la propia cuenta (quien pregunta); el cliente lo usa sólo para no mandar un cambio pendiente a otra cuenta.
  return {
    uid: userId, weightUnit: (p?.weightUnit ?? "kg") as WeightUnit, wishes: (p?.wishes ?? null) as TrainingWishes | null,
    theme: (p?.theme ?? "system") as ThemePref, themeChangedAt: p?.themeChangedAt ? p.themeChangedAt.getTime() : null,
  };
}

/** Cambia sólo la presentación: los registros siguen en kg y no se reescriben. */
export async function updateSettings(userId: string, p: { weightUnit?: unknown; wishes?: unknown; theme?: unknown; themeChangedAt?: unknown }) {
  if (p.weightUnit !== undefined && !isWeightUnit(p.weightUnit)) throw new AccessError("invalid", "Elegí kg o lb.");
  if (p.theme !== undefined && !isThemePref(p.theme)) throw new AccessError("invalid", "Elegí Claro, Oscuro o Automático.");
  if (p.themeChangedAt !== undefined && (typeof p.themeChangedAt !== "number" || !Number.isFinite(p.themeChangedAt))) throw new AccessError("invalid", "Fecha de cambio inválida.");
  const now = new Date();
  if (p.theme !== undefined && isThemePref(p.theme)) {
    // D188: gana el último cambio hecho en un dispositivo (también uno sin conexión que llega tarde). Si el guardado es
    // más nuevo, no se pisa y la respuesta devuelve el vigente para que el dispositivo lo adopte.
    const [cur] = await db.select({ at: userPref.themeChangedAt }).from(userPref).where(eq(userPref.userId, userId));
    const r = acceptThemeChange(cur?.at ? cur.at.getTime() : null, p.themeChangedAt as number | undefined, now.getTime());
    if (r.ok) {
      const at = new Date(r.at);
      await db.insert(userPref).values({ userId, theme: p.theme, themeChangedAt: at, updatedAt: now })
        .onConflictDoUpdate({ target: userPref.userId, set: { theme: p.theme, themeChangedAt: at, updatedAt: now },
          // Dos pedidos simultáneos: el más viejo no pisa al más nuevo.
          setWhere: sql`${userPref.themeChangedAt} is null or ${userPref.themeChangedAt} < ${at.toISOString()}::timestamptz` });
    }
  }
  if (p.weightUnit) {
    await db.insert(userPref).values({ userId, weightUnit: p.weightUnit, updatedAt: now })
      .onConflictDoUpdate({ target: userPref.userId, set: { weightUnit: p.weightUnit, updatedAt: now } });
    await audit(db, { actorUserId: userId, action: "settings.updated", resourceType: "user", resourceId: userId, meta: { weightUnit: p.weightUnit } });
  }
  if (p.wishes !== undefined) {
    const r = cleanWishes(p.wishes);
    if (!r.ok) throw new AccessError("invalid", r.error);
    await db.insert(userPref).values({ userId, wishes: r.wishes, updatedAt: now })
      .onConflictDoUpdate({ target: userPref.userId, set: { wishes: r.wishes, updatedAt: now } });
    // Sin el texto en la auditoría: sólo qué se completó.
    await audit(db, { actorUserId: userId, action: "settings.wishes", resourceType: "user", resourceId: userId, meta: { goal: r.wishes.goal, filled: Object.entries(r.wishes).filter(([, v]) => v != null).map(([k]) => k) } });
  }
  return mySettings(userId);
}

// ── D195: ayudas de primera vez (onboarding contextual) ─────────────────────
// Sólo la clave de cada ayuda y cuándo se vio u omitió (nada personal). Sirve para no repetirlas en otro dispositivo.
export const HINT_KEYS = ["start_guide", "ti_intro", "history_edit", "workout_nav", "coach_start", "gym_equipment", "rest_intel"] as const;
export type HintKey = (typeof HINT_KEYS)[number];
export const isHintKey = (k: unknown): k is HintKey => typeof k === "string" && (HINT_KEYS as readonly string[]).includes(k);

export async function myHints(userId: string) {
  const [p] = await db.select({ hints: userPref.hints }).from(userPref).where(eq(userPref.userId, userId));
  return { hints: (p?.hints ?? {}) as Record<string, string> };
}
/** Marca una ayuda como vista u omitida (`seen: false` la vuelve a mostrar: «Ver la guía de nuevo»). */
export async function setHint(userId: string, key: HintKey, seen: boolean) {
  const now = new Date();
  const cur = (await myHints(userId)).hints;
  const next = { ...cur };
  if (seen) next[key] = now.toISOString(); else delete next[key];
  await db.insert(userPref).values({ userId, hints: next, updatedAt: now }).onConflictDoUpdate({ target: userPref.userId, set: { hints: next, updatedAt: now } });
  return { hints: next };
}
/** «Volver a ver las ayudas»: borra todas las marcas. */
export async function resetHints(userId: string) {
  const now = new Date();
  await db.insert(userPref).values({ userId, hints: {}, updatedAt: now }).onConflictDoUpdate({ target: userPref.userId, set: { hints: {}, updatedAt: now } });
  return { hints: {} };
}
