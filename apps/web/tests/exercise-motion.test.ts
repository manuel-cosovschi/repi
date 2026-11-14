// REPI Exercise Motion 1.0 (D220): biblioteca, resolver, fuentes, sin conexión, privacidad y servidor.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOG } from "@repi/domain";
import { db, schema } from "@/db";
import * as acc from "@/server/access/services";
import { ensureExerciseCatalog } from "@/server/training/library";
import { motionFor } from "@/server/training/exercise-motion";
import { LIBRARY } from "@/lib/exercise-motion/library";
import { getExerciseMuscleMap, getExerciseTechnique, getExerciseVariants, getMotionEntry, motionCoverage, resolveExerciseMotion } from "@/lib/exercise-motion/resolve";
import { getExerciseMediaForContext } from "@/lib/exercise-motion/ref";
import { validateEntry } from "@/lib/exercise-motion/validate";
import { framing, renderFrame } from "@/lib/exercise-motion/render";
import { poseAt } from "@/lib/exercise-motion/rig";
import { MUSCLES } from "@/lib/exercise-motion/muscles";
import { sidesOf } from "@/lib/exercise-motion/musclemap";
import { motionOf } from "@/lib/offline/store";

const CATALOG = new Set(EXERCISE_CATALOG.map((r) => r[0]));

describe("biblioteca oficial", () => {
  it("tiene al menos 30 demostraciones y cada una pasa todas las validaciones (cinemática, piso, catálogo, músculos, textos)", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(30);
    const problems = LIBRARY.flatMap(validateEntry);
    expect(problems).toEqual([]);
  });
  it("ids únicos y cada nombre del catálogo tiene a lo sumo una demostración exacta", () => {
    expect(new Set(LIBRARY.map((e) => e.id)).size).toBe(LIBRARY.length);
    const exact = LIBRARY.flatMap((e) => e.catalog);
    expect(new Set(exact).size).toBe(exact.length);
    for (const n of exact) expect(CATALOG.has(n)).toBe(true);
  });
  it("una variante compatible nunca es a la vez exacta en otra demostración", () => {
    const exact = new Set(LIBRARY.flatMap((e) => e.catalog));
    for (const e of LIBRARY) for (const c of e.compatible ?? []) expect(exact.has(c.name), `${e.id} → ${c.name}`).toBe(false);
  });
  it("sin porcentajes de activación muscular ni tuteo/usted en los textos", () => {
    for (const e of LIBRARY) {
      const t = [...e.technique.setup, ...e.technique.execution, ...e.technique.cues, ...e.technique.mistakes, e.technique.breathing ?? "", ...(e.compatible ?? []).map((c) => c.difference)].join(" ");
      expect(t, e.id).not.toMatch(/\d\s?%/);
      expect(t, e.id).not.toMatch(/\b(usted|puedes|debes|haz|tienes|mantén|baja tu|sube tu)\b/i);
    }
  });
  it("revisión honesta: todas internas (ninguna se presenta como validada por un profesional)", () => {
    for (const e of LIBRARY) expect(e.review.status).toBe("internal");
  });
  it("todos los músculos tienen etiqueta y lugar en el mapa muscular", () => {
    for (const e of LIBRARY) for (const m of [...e.anatomy.primary, ...e.anatomy.secondary]) { expect(MUSCLES[m]?.label).toBeTruthy(); expect(sidesOf(m).length).toBeGreaterThan(0); }
  });
  it("el ciclo es continuo, el cuadro es determinístico y el encuadre no se mueve", () => {
    for (const e of LIBRARY) {
      const a = poseAt(e.motion.keys, 0).pose, b = poseAt(e.motion.keys, 0.99999).pose;
      expect(Math.hypot(a.pelvis[0] - b.pelvis[0], a.pelvis[1] - b.pelvis[1]), e.id).toBeLessThan(0.5);
      expect(JSON.stringify(renderFrame(e.motion, 0.37, e.anatomy))).toBe(JSON.stringify(renderFrame(e.motion, 0.37, e.anatomy)));
      const [, , w, h] = framing(e.motion).viewBox;
      expect(w / h).toBeGreaterThanOrEqual(4 / 3 - 1e-6);
      expect(w / h).toBeLessThanOrEqual(16 / 9 + 1e-6);
    }
  });
});

describe("resolver", () => {
  it("exacta, compatible con su diferencia, o nada; sólo para el catálogo global", () => {
    expect(resolveExerciseMotion({ name: "Sentadilla", global: true })).toMatchObject({ match: "exact", id: "sentadilla-barra" });
    const c = resolveExerciseMotion({ name: "Sentadilla en multipower", global: true });
    expect(c).toMatchObject({ match: "compatible", id: "sentadilla-barra" });
    expect(c?.difference?.length).toBeGreaterThan(12);
    expect(resolveExerciseMotion({ name: "Sentadilla", global: false })).toBeNull(); // un ejercicio propio que se llama igual
    expect(resolveExerciseMotion({ name: "Burpees", global: true })).toBeNull();
    expect(resolveExerciseMotion({ name: "sentadilla", global: true })).toBeNull(); // nombre exacto, sin parecidos
  });
  it("técnica, músculos y variantes salen de la misma entrada", () => {
    const e = getMotionEntry("sentadilla-barra")!;
    expect(getExerciseTechnique(e.id)).toBe(e.technique);
    expect(getExerciseMuscleMap(e.id)).toBe(e.anatomy);
    expect(getExerciseVariants(e.id)).toEqual({ exact: ["Sentadilla"], compatible: e.compatible });
    expect(getMotionEntry("no-existe")).toBeNull();
  });
  it("cobertura del catálogo", () => {
    const c = motionCoverage(EXERCISE_CATALOG.map((r) => r[0]));
    expect(c.exact).toBe(LIBRARY.reduce((n, e) => n + e.catalog.length, 0));
    expect(c.exact + c.compatible).toBeLessThanOrEqual(c.total);
  });
});

describe("fuentes de «cómo se hace»", () => {
  const ref = { id: "sentadilla-barra", v: 1, match: "exact" as const };
  const video = { kind: "video" as const, url: "/api/media/x" };
  it("orden: oficial → video del gimnasio (nunca se oculta) → búsqueda sólo si no hay nada", () => {
    expect(getExerciseMediaForContext({ motion: ref, media: video, name: "Sentadilla", motionOn: true }).map((s) => s.kind)).toEqual(["official", "org"]);
    expect(getExerciseMediaForContext({ motion: ref, media: null, name: "Sentadilla", motionOn: true }).map((s) => s.kind)).toEqual(["official"]);
    expect(getExerciseMediaForContext({ motion: null, media: video, name: "Sentadilla", motionOn: true }).map((s) => s.kind)).toEqual(["org"]);
    const s = getExerciseMediaForContext({ motion: null, media: null, name: "Sentadilla", motionOn: true });
    expect(s[0]).toMatchObject({ kind: "search" });
  });
  it("con el módulo apagado se comporta como antes (video del gimnasio o búsqueda)", () => {
    expect(getExerciseMediaForContext({ motion: ref, media: null, name: "Sentadilla", motionOn: false }).map((x) => x.kind)).toEqual(["search"]);
  });
  it("con reemplazo, la demostración es la del ejercicio que se hace (también sin conexión)", () => {
    const planned = { id: "press-banca", v: 1, match: "exact" as const };
    expect(motionOf({ change: null, motion: planned, motionSub: null })).toBe(planned);
    const sub = { kind: "substitute" as const, reason: "busy" as const, substitute: { exerciseId: "x2", name: "Otro" } };
    expect(motionOf({ change: sub, motion: planned, motionSub: { exerciseId: "x2", ref } })).toBe(ref);
    expect(motionOf({ change: sub, motion: planned, motionSub: null })).toBeNull(); // reemplazo hecho sin conexión: no se muestra la del indicado
    expect(motionOf({ change: { kind: "skip", reason: "busy", substitute: null }, motion: planned, motionSub: null })).toBe(planned);
  });
});

describe("privacidad, peso y sin conexión", () => {
  const dir = join(__dirname, "../src/lib/exercise-motion");
  const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? files(join(d, f.name)) : [join(d, f.name)]));
  it("el motor y la biblioteca no guardan nada, no hacen pedidos y no importan código del servidor", () => {
    for (const f of files(dir)) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|from "@\/server|from "@\/db/);
    }
  });
  it("ningún recurso externo: sin URLs de imágenes, videos ni modelos de terceros en la biblioteca", () => {
    for (const f of files(dir)) expect(readFileSync(f, "utf8"), f).not.toMatch(/https?:\/\/(?!www\.youtube\.com\/results)/);
  });
  it("la biblioteca entera pesa poco (se baja una vez y queda en caché)", () => {
    const bytes = files(dir).reduce((n, f) => n + readFileSync(f).length, 0);
    expect(bytes).toBeLessThan(400_000);
  });
});

describe("servidor", () => {
  it("motionFor: sólo ejercicios del catálogo global; uno propio con el mismo nombre no recibe demostración", async () => {
    await ensureExerciseCatalog();
    const [g] = await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Sentadilla"));
    const uid = (await acc.signUpPerson({ name: "Motion Propio", email: `motion.${Date.now()}@test.repi.local`, password: "prueba1234", terms: true, birth: "01/01/1990" })).userId!;
    const [own] = await db.insert(schema.exercise).values({ name: "Sentadilla", muscleGroup: "Piernas", ownerUserId: uid }).returning();
    const m = await motionFor([g.id, own.id, g.id]);
    expect(m.get(g.id)).toMatchObject({ id: "sentadilla-barra", match: "exact" });
    expect(m.has(own.id)).toBe(false);
  });
  it("con el módulo apagado no informa demostraciones", async () => {
    const [g] = await db.select().from(schema.exercise).where(eq(schema.exercise.name, "Sentadilla"));
    const prev = process.env.NEXT_PUBLIC_REPI_FEATURES;
    process.env.NEXT_PUBLIC_REPI_FEATURES = "-exercise_motion";
    try { expect((await motionFor([g.id])).size).toBe(0); } finally { process.env.NEXT_PUBLIC_REPI_FEATURES = prev; }
  });
});
