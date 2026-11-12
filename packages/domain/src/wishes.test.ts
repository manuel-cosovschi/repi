import { describe, expect, it } from "vitest";
import { cleanProfilePatch, cleanWishes, emptyWishes, goalAllowed, hasWishes, mergeProfile, personalProfile, profileStatus, readWishes, sharedWishes } from "./wishes";

describe("deseos de entrenamiento (D139)", () => {
  it("normaliza textos y números", () => {
    const r = cleanWishes({ goal: "muscle", daysPerWeek: "4", minutes: 60, likes: "  peso   libre ", avoid: "" });
    expect(r).toEqual({ ok: true, wishes: { goal: "muscle", daysPerWeek: 4, minutes: 60, likes: "peso libre", avoid: null, shareWithTrainers: false } });
    expect(hasWishes(r.ok ? r.wishes : null)).toBe(true);
    expect(hasWishes(cleanWishes({}).ok ? { goal: null, daysPerWeek: null, minutes: null, likes: null, avoid: null } : null)).toBe(false);
  });
  it("D147: sólo se comparte con quien arma la rutina si la persona lo eligió y completó algo", () => {
    const base = { goal: "strength" as const, daysPerWeek: 3, minutes: 45, likes: "barra", avoid: null };
    expect(sharedWishes({ ...base })).toBeNull(); // guardado antes de D147: no se comparte
    expect(sharedWishes({ ...base, shareWithTrainers: false })).toBeNull();
    expect(sharedWishes({ ...base, shareWithTrainers: true })).toEqual({ goal: "Ganar fuerza", daysPerWeek: 3, minutes: 45, likes: "barra", avoid: null });
    expect(sharedWishes({ goal: null, daysPerWeek: null, minutes: null, likes: null, avoid: null, shareWithTrainers: true })).toBeNull();
    expect(cleanWishes({ shareWithTrainers: "true" })).toMatchObject({ ok: true, wishes: { shareWithTrainers: false } });
  });
  it("rechaza valores fuera de rango o desconocidos", () => {
    expect(cleanWishes({ goal: "x" })).toMatchObject({ ok: false });
    expect(cleanWishes({ daysPerWeek: 8 })).toMatchObject({ ok: false });
    expect(cleanWishes({ minutes: 5 })).toMatchObject({ ok: false });
    expect(cleanWishes({ likes: "a".repeat(201) })).toMatchObject({ ok: false });
  });
});

describe("D217 · perfil de entrenamiento canónico", () => {
  const now = new Date("2026-11-12T15:00:00Z");
  it("valida un cambio parcial y rechaza campos o valores desconocidos", () => {
    expect(cleanProfilePatch({ experience: "beginner", minutes: "45" })).toEqual({ ok: true, patch: { experience: "beginner", minutes: 45 } });
    expect(cleanProfilePatch({ experience: "pro" })).toMatchObject({ ok: false });
    expect(cleanProfilePatch({ salud: "rodilla" })).toMatchObject({ ok: false, error: "Campo desconocido." });
    expect(cleanProfilePatch({ weekdays: [4, 0, 2, 2] })).toEqual({ ok: true, patch: { weekdays: [0, 2, 4] } });
    expect(cleanProfilePatch({ weekdays: [7] })).toMatchObject({ ok: false });
    expect(cleanProfilePatch({ equipment: ["dumbbells", "dumbbells", "bands"] })).toEqual({ ok: true, patch: { equipment: ["dumbbells", "bands"] } });
    expect(cleanProfilePatch({ favorites: [{ id: "ex_1", name: "  Press   banca " }, { id: "ex_1", name: "x" }] })).toEqual({ ok: true, patch: { favorites: [{ id: "ex_1", name: "Press banca" }] } });
    expect(cleanProfilePatch({ favorites: [{ id: "a b", name: "x" }] })).toMatchObject({ ok: false });
    expect(cleanProfilePatch([])).toMatchObject({ ok: false });
  });
  it("mergeProfile cambia sólo lo enviado, guarda procedencia y sube la versión una vez", () => {
    const a = mergeProfile(null, { goal: "strength", daysPerWeek: 3 }, "onboarding", now);
    expect(a.changed).toEqual(["goal", "daysPerWeek"]);
    expect(a.wishes.meta).toEqual({ version: 1, updatedAt: now.toISOString(), fields: { goal: { via: "onboarding", at: now.toISOString() }, daysPerWeek: { via: "onboarding", at: now.toISOString() } } });
    const later = new Date(now.getTime() + 86_400_000);
    const b = mergeProfile(a.wishes, { goal: "strength", experience: "intermediate" }, "routines", later);
    expect(b.changed).toEqual(["experience"]); // el objetivo igual no cuenta como cambio
    expect(b.wishes.meta!.version).toBe(2);
    expect(b.wishes.meta!.fields.goal!.via).toBe("onboarding");
    expect(b.wishes.meta!.fields.experience).toEqual({ via: "routines", at: later.toISOString() });
    expect(b.wishes.daysPerWeek).toBe(3);
    const c = mergeProfile(b.wishes, { goal: "strength" }, "profile", later);
    expect(c.changed).toEqual([]);
    expect(c.wishes.meta!.version).toBe(2);
  });
  it("estado explícito: completo, parcial o sin información (sin rellenar con valores genéricos)", () => {
    expect(profileStatus(null)).toMatchObject({ status: "none", missing: ["goal", "experience", "daysPerWeek", "minutes"] });
    expect(profileStatus({ ...emptyWishes(), goal: "muscle" })).toMatchObject({ status: "partial", missing: ["experience", "daysPerWeek", "minutes"] });
    expect(profileStatus({ ...emptyWishes(), goal: "muscle", experience: "beginner", daysPerWeek: 3, minutes: 60 })).toMatchObject({ status: "complete", missing: [] });
    // Menores y edad sin confirmar: un objetivo corporal no cuenta como declarado.
    const fat = { ...emptyWishes(), goal: "fat_loss" as const, experience: "beginner" as const, daysPerWeek: 3, minutes: 60 };
    expect(profileStatus(fat, "minor").missing).toEqual(["goal"]);
    expect(profileStatus(fat, "unknown").status).toBe("partial");
    expect(personalProfile(fat, "minor").goal).toBeNull();
    expect(personalProfile(fat, "adult").goal).toBe("fat_loss");
    expect(goalAllowed("fat_loss", "minor")).toBe(false);
    expect(goalAllowed("strength", "minor")).toBe(true);
  });
  it("readWishes tolera perfiles viejos o con valores inválidos", () => {
    expect(readWishes({ goal: "muscle", daysPerWeek: 4, minutes: 60, likes: "barra", avoid: null })).toMatchObject({ goal: "muscle", experience: null, equipment: null, meta: null });
    expect(readWishes({ goal: "otro", daysPerWeek: 99, experience: "beginner" })).toMatchObject({ goal: null, daysPerWeek: null, experience: "beginner" });
    expect(readWishes(null)).toBeNull();
    expect(readWishes("x")).toBeNull();
  });
  it("lo compartido con quien arma la rutina incluye lo nuevo sólo si está declarado", () => {
    const w = { ...emptyWishes(), goal: "strength" as const, experience: "advanced" as const, weekdays: [0, 2], equipment: ["barbell" as const], shareWithTrainers: true };
    expect(sharedWishes(w)).toMatchObject({ goal: "Ganar fuerza", experience: "Avanzado", weekdays: "Lun, Mié", equipment: "Barra y discos" });
    expect(sharedWishes({ ...w, shareWithTrainers: false })).toBeNull();
    expect(Object.keys(sharedWishes({ ...emptyWishes(), goal: "health", shareWithTrainers: true })!)).toEqual(["goal", "daysPerWeek", "minutes", "likes", "avoid"]);
  });
});
