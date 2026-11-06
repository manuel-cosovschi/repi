// Personal Progress & Body Tracking 1.0 (D199–D202): gráficos por ejercicio, peso corporal y objetivo, calorías estimadas,
// fotos privadas y novedades de REPI. Base descartable (repi_test). Los módulos apagados por defecto se encienden acá.
process.env.NEXT_PUBLIC_REPI_FEATURES = "progress_photos,calories,announcements";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hasImageMetadata, localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import * as h from "@/server/training/history";
import * as ex from "@/server/progress/exercises";
import * as bd from "@/server/progress/body";
import * as ph from "@/server/progress/photos";
import { sessionCalories } from "@/server/progress/calories";
import * as an from "@/server/announcements/services";
import { markNotificationsSeen, myNotifications } from "@/server/notifications/feed";
import * as fu from "@/server/followup/services";
import * as gym from "@/server/gym/services";
import { exportMyData } from "@/server/privacy/services";
import { resetRateLimits } from "@/server/access/util";
import { jpegWithGps } from "../../../packages/domain/src/image-fixtures";

let n = 0;
async function verified(name = "Persona PP", birth: string | null = "01/01/1990") {
  const email = `pp${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, ...(birth === null ? {} : { birth }) });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as { code: string; status: number }; } };
const EX: Record<string, string> = {};
beforeAll(async () => {
  for (const [name, g, kind] of [["Press banca PP", "Pecho", "load_reps"], ["Dominadas PP", "Espalda", "bodyweight"], ["Cinta PP", "Cardio", "time"]] as const) {
    const [e] = await db.insert(schema.exercise).values({ name, muscleGroup: g, kind }).onConflictDoNothing().returning();
    EX[name] = e?.id ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, name)))[0].id;
  }
});
beforeEach(() => resetRateLimits());

/** Coach con un alumno que entrena press banca (3 series), dominadas sin carga (2) y cinta por tiempo (1). */
async function world() {
  const coach = await verified("Coach PP");
  const org = await acc.createCoachOrganization(coach.id, { brand: `Coach PP ${n}` });
  const u = await verified("Alumna PP");
  const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, ["training"]);
  const tpl = await tr.createTemplate(coach.id, org.id, { name: "Full", weeks: 4, note: "", days: [{ name: "Full", exercises: [
    { exerciseId: EX["Press banca PP"], name: "Press banca PP", sets: 3, reps: "8-10", rir: 2, restSec: 90, note: null },
    { exerciseId: EX["Dominadas PP"], name: "Dominadas PP", sets: 2, reps: "8", rir: 2, restSec: 90, note: null },
    { exerciseId: EX["Cinta PP"], name: "Cinta PP", sets: 1, reps: "600 s", rir: null, restSec: 0, note: null },
  ] }] });
  await tr.assignProgram(coach.id, org.id, tpl, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  return { coach: coach.id, org: org.id, user: u.id, rel: rel.relationId };
}
/** Sesión terminada `daysAgo` días atrás: [press (peso × reps)], [dominadas (reps)], segundos de cinta, minutos activos. */
async function trained(user: string, p: { bench: [number, number][]; pull?: number[]; cardioSec?: number; daysAgo?: number; minutes?: number; rpe?: number }) {
  const at = new Date();
  const t = await tr.myTraining(user);
  if (t.state !== "ready") throw new Error(t.state);
  const sid = randomUUID();
  await tr.startSession(user, { id: sid, dayId: t.program.days[0].id }, at);
  const s = await tr.getSession(user, sid, at);
  for (const [i, [w, r]] of p.bench.entries()) await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: i, weightKg: w, reps: r, rir: 2 }, at);
  for (const [i, r] of (p.pull ?? []).entries()) await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: s.exercises[1].id, setIndex: i, weightKg: null, reps: r, rir: 2 }, at);
  if (p.cardioSec) await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: s.exercises[2].id, setIndex: 0, weightKg: null, reps: p.cardioSec, rir: null }, at);
  await tr.sessionAction(user, sid, "finish", at);
  await db.update(schema.workoutSession).set({ activeMs: (p.minutes ?? 60) * 60_000, rpe: p.rpe ?? null }).where(eq(schema.workoutSession.id, sid));
  if (p.daysAgo) {
    const d = sql`${p.daysAgo * 86_400_000} * interval '1 millisecond'`;
    await db.update(schema.workoutSession).set({ startedAt: sql`started_at - ${d}`, endedAt: sql`ended_at - ${d}` }).where(eq(schema.workoutSession.id, sid));
    await db.update(schema.setLog).set({ completedAt: sql`completed_at - ${d}` }).where(eq(schema.setLog.sessionId, sid));
  }
  return sid;
}
const dayAgo = (d: number) => localDate(new Date(Date.now() - d * 86_400_000));

describe("gráficos de entrenamiento", () => {
  it("desde la primera sesión: resumen real, primer punto sin récord ni tendencia inventada", async () => {
    const w = await world();
    await trained(w.user, { bench: [[60, 10], [60, 10], [60, 9]], pull: [8, 7], cardioSec: 300 });
    const s = await ex.myProgressSummary(w.user, "30d");
    expect(s.totals).toMatchObject({ sessions: 1, sets: 6, reps: 44, volumeKg: 1740, exercises: 3 });
    expect(s.marks.find((m) => m.name === "Press banca PP")).toMatchObject({ topKg: 60, repsAtTop: 10 });
    const p = await ex.myExerciseProgress(w.user, EX["Press banca PP"], "30d");
    expect(p.metric).toBe("load");
    expect(p.points).toHaveLength(1);
    expect(p.points[0]).toMatchObject({ first: true, record: false, topKg: 60, repsAtTop: 10, sets: 3, volumeKg: 1740, e1rm: 80 });
    expect(p.records).toBe(0);
  });

  it("varias sesiones: récord por 1RM estimado contra todo el historial; volumen no es fuerza", async () => {
    const w = await world();
    await trained(w.user, { bench: [[60, 10]], daysAgo: 120 });
    await trained(w.user, { bench: [[62.5, 10]], daysAgo: 20 });
    await trained(w.user, { bench: [[65, 9]], daysAgo: 10 });
    await trained(w.user, { bench: [[50, 12], [50, 12], [50, 12]], daysAgo: 3 }); // más volumen, menos fuerza
    const all = await ex.myExerciseProgress(w.user, EX["Press banca PP"], "all");
    expect(all.points.map((x) => x.record)).toEqual([false, true, true, false]);
    expect(all.points[3].volumeKg).toBeGreaterThan(all.points[2].volumeKg);
    const r30 = await ex.myExerciseProgress(w.user, EX["Press banca PP"], "30d");
    expect(r30.points).toHaveLength(3);
    expect(r30.points[0]).toMatchObject({ first: false, record: true }); // comparado con la sesión de hace 120 días
    expect(r30.best).toMatchObject({ e1rm: 84.5, set: { weightKg: 65, reps: 9 } });
  });

  it("series anuladas, sesiones anuladas y correcciones se recalculan sin reescribir registros", async () => {
    const w = await world();
    const sid = await trained(w.user, { bench: [[60, 10], [100, 10]] }); // 100 kg fue un error
    const [, bad] = await db.select().from(schema.setLog).where(eq(schema.setLog.sessionId, sid)).orderBy(schema.setLog.setIndex);
    expect((await ex.myExerciseProgress(w.user, EX["Press banca PP"], "30d")).points[0].topKg).toBe(100);
    await h.setVoided(w.user, sid, bad.id, { requestId: randomUUID(), voided: true });
    expect((await ex.myExerciseProgress(w.user, EX["Press banca PP"], "30d")).points[0]).toMatchObject({ topKg: 60, sets: 1 });
    await h.setVoided(w.user, sid, bad.id, { requestId: randomUUID(), voided: false });
    const [b2] = await db.select().from(schema.setLog).where(eq(schema.setLog.id, bad.id));
    await h.correctSet(w.user, sid, bad.id, { requestId: randomUUID(), baseRevision: b2.revision, values: { weightKg: 70 } });
    expect((await ex.myExerciseProgress(w.user, EX["Press banca PP"], "30d")).points[0].topKg).toBe(70);
    const [s] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, sid));
    await h.sessionVoided(w.user, sid, { requestId: randomUUID(), voided: true, baseRevision: s.revision });
    expect((await err(ex.myExerciseProgress(w.user, EX["Press banca PP"], "30d")))?.status).toBe(404);
    expect((await ex.myProgressSummary(w.user, "30d")).totals.sessions).toBe(0);
  });

  it("peso corporal sin carga se mide en repeticiones (no como 0 kg); tiempo en segundos", async () => {
    const w = await world();
    await trained(w.user, { bench: [[60, 10]], pull: [8, 10], cardioSec: 420 });
    const pull = await ex.myExerciseProgress(w.user, EX["Dominadas PP"], "30d");
    expect(pull.metric).toBe("reps");
    expect(pull.points[0]).toMatchObject({ topKg: null, e1rm: null, maxReps: 10, volumeKg: 0 });
    const cinta = await ex.myExerciseProgress(w.user, EX["Cinta PP"], "30d");
    expect(cinta.metric).toBe("time");
    expect(cinta.points[0]).toMatchObject({ maxSec: 420, reps: 0, volumeKg: 0 });
  });

  it("lista con búsqueda y otro usuario no puede consultar", async () => {
    const w = await world();
    await trained(w.user, { bench: [[60, 10]] });
    expect((await ex.myProgressExercises(w.user, { q: "banca" })).exercises.map((e) => e.name)).toEqual(["Press banca PP"]);
    expect((await ex.myProgressExercises(w.user, { q: "%" })).exercises).toEqual([]);
    const other = await verified();
    expect((await err(ex.myExerciseProgress(other.id, EX["Press banca PP"], "all")))?.status).toBe(404);
    expect((await ex.myProgressExercises(other.id)).exercises).toEqual([]);
    expect((await err(ex.myExerciseProgress(w.coach, EX["Press banca PP"], "all")))?.status).toBe(404);
  });
});

describe("peso corporal", () => {
  it("primer registro, nuevo registro, mismo día reemplaza (doble toque), edición y eliminación", async () => {
    const u = await verified();
    const a = await bd.saveWeight(u.id, { day: dayAgo(30), weightG: 84000 });
    expect(a).toMatchObject({ replaced: false, unchanged: false });
    const again = await bd.saveWeight(u.id, { day: dayAgo(30), weightG: 84000 }); // doble toque / reintento
    expect(again).toMatchObject({ unchanged: true });
    expect(again.entry.id).toBe(a.entry.id);
    await bd.saveWeight(u.id, { day: dayAgo(10), weightG: 82000 });
    const fix = await bd.saveWeight(u.id, { day: dayAgo(10), weightG: 81500 });
    expect(fix.replaced).toBe(true);
    let b = await bd.myBody(u.id, "90d");
    if (!b.available) throw new Error("no disponible");
    expect(b.entries.map((e) => e.weightG)).toEqual([84000, 81500]);
    expect(b.summary).toMatchObject({ netG: -2500, count: 2 });
    const e = await bd.updateWeight(u.id, fix.entry.id, { weightG: 81000 });
    expect(e.entry).toMatchObject({ weightG: 81000, day: dayAgo(10) });
    expect((await err(bd.updateWeight(u.id, fix.entry.id, { day: dayAgo(30) })))?.status).toBe(409); // ya hay medición ese día
    await bd.deleteWeight(u.id, fix.entry.id);
    b = await bd.myBody(u.id, "all");
    expect(b.available && b.entries).toHaveLength(1);
  });

  it("objetivo de bajada, de subida, mantenimiento y cambio de meta; punto de partida manual con procedencia", async () => {
    const u = await verified();
    await bd.saveWeight(u.id, { day: dayAgo(60), weightG: 84000 });
    await bd.saveWeight(u.id, { day: dayAgo(1), weightG: 80000 });
    await bd.setGoal(u.id, { targetG: 76000 });
    let b = await bd.myBody(u.id, "30d"); // el rango no cambia el punto de partida
    expect(b.available && b.start).toMatchObject({ weightG: 84000, source: "first_entry" });
    expect(b.available && b.progress).toMatchObject({ state: "toward", pct: 50 });
    await bd.setGoal(u.id, { targetG: 88000 });
    b = await bd.myBody(u.id, "all");
    expect(b.available && b.progress).toMatchObject({ state: "away", pct: 0 });
    expect(b.available && b.goal?.revision).toBe(2);
    await bd.setGoal(u.id, { targetG: 84200 });
    expect((await bd.myBody(u.id, "all") as { progress: unknown }).progress).toMatchObject({ state: "maintain" });
    await bd.setGoal(u.id, { targetG: 76000, start: { day: dayAgo(200), weightG: 90000 } });
    b = await bd.myBody(u.id, "all");
    expect(b.available && b.start).toMatchObject({ weightG: 90000, source: "manual" });
    expect(b.available && b.progress).toMatchObject({ state: "toward", pct: 71 });
    await bd.clearGoal(u.id);
    expect((await bd.myBody(u.id, "all") as { goal: unknown }).goal).toBeNull();
  });

  it("datos inválidos, otro usuario recibe 404 y menores no acceden", async () => {
    const u = await verified();
    expect((await err(bd.saveWeight(u.id, { day: "2026-02-31", weightG: 80000 })))?.code).toBe("invalid");
    expect((await err(bd.saveWeight(u.id, { day: dayAgo(-5), weightG: 80000 })))?.code).toBe("invalid");
    expect((await err(bd.saveWeight(u.id, { day: dayAgo(1), weightG: 5000 })))?.code).toBe("invalid");
    const { entry } = await bd.saveWeight(u.id, { day: dayAgo(1), weightG: 70000 });
    const other = await verified();
    expect((await err(bd.updateWeight(other.id, entry.id, { weightG: 60000 })))?.status).toBe(404);
    expect((await err(bd.deleteWeight(other.id, entry.id)))?.status).toBe(404);
    expect((await bd.myBody(other.id, "all") as { entries: unknown[] }).entries).toEqual([]);
    const teen = await verified("Menor PP", `01/01/${new Date().getUTCFullYear() - 15}`);
    expect(await bd.myBody(teen.id, "all")).toEqual({ available: false, reason: "minor" });
    expect((await err(bd.saveWeight(teen.id, { day: dayAgo(1), weightG: 50000 })))?.code).toBe("minor_restricted");
  });
});

describe("calorías estimadas", () => {
  it("sin peso no se estima; con el peso de ese día, rango; un peso posterior no cambia una sesión pasada", async () => {
    const w = await world();
    const sid = await trained(w.user, { bench: [[60, 10]], daysAgo: 5, minutes: 60 });
    expect((await sessionCalories(w.user, sid)).estimate).toEqual({ ok: false, reason: "no_weight" });
    await bd.saveWeight(w.user, { day: dayAgo(1), weightG: 90000 }); // posterior a la sesión: no se usa
    expect((await sessionCalories(w.user, sid)).estimate).toEqual({ ok: false, reason: "no_weight" });
    await bd.saveWeight(w.user, { day: dayAgo(8), weightG: 80000 });
    const c = await sessionCalories(w.user, sid);
    expect(c.weight).toEqual({ day: dayAgo(8) });
    expect(c.estimate).toMatchObject({ ok: true, kind: "strength", low: 280, high: 480 });
  });

  it("sesión mixta con cardio, sesión anulada y otro usuario", async () => {
    const w = await world();
    await bd.saveWeight(w.user, { day: dayAgo(0), weightG: 80000 });
    const sid = await trained(w.user, { bench: [[60, 10]], cardioSec: 1200, minutes: 60, rpe: 6 });
    expect((await sessionCalories(w.user, sid)).estimate).toMatchObject({ ok: true, kind: "mixed" });
    const other = await verified();
    expect((await err(sessionCalories(other.id, sid)))?.status).toBe(404);
    expect((await err(sessionCalories(w.coach, sid)))?.status).toBe(404);
    const [s] = await db.select().from(schema.workoutSession).where(eq(schema.workoutSession.id, sid));
    await h.sessionVoided(w.user, sid, { requestId: randomUUID(), voided: true, baseRevision: s.revision });
    expect((await sessionCalories(w.user, sid)).estimate).toEqual({ ok: false, reason: "voided" });
  });
});

describe("fotos de progreso privadas", () => {
  const storageFile = async (userId: string, photoId: string) => {
    const [r] = await db.select({ key: schema.mediaObject.storageKey }).from(schema.progressPhoto).innerJoin(schema.mediaObject, eq(schema.mediaObject.id, schema.progressPhoto.mediaId)).where(and(eq(schema.progressPhoto.id, photoId), eq(schema.progressPhoto.userId, userId)));
    return readFile(path.join(process.cwd(), ".storage", r.key)).catch(() => null);
  };

  it("subida válida: quita la ubicación, guarda privado y la lista sólo para su dueña", async () => {
    const w = await world();
    const src = jpegWithGps();
    expect(hasImageMetadata(src)).toBe(true);
    const r = await ph.uploadProgressPhoto(w.user, { bytes: src, mime: "image/jpeg", day: dayAgo(2), pose: "front" });
    expect(r.photo).toMatchObject({ day: dayAgo(2), pose: "front", width: 640, height: 480 });
    expect(r.strippedBytes).toBeGreaterThan(0);
    const stored = await storageFile(w.user, r.photo.id);
    expect(stored && hasImageMetadata(new Uint8Array(stored))).toBe(false);
    expect(new TextDecoder("latin1").decode(stored!)).not.toContain("GPSLatitude");
    const [m] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.ownerUserId, w.user));
    expect(m).toMatchObject({ purpose: "progress_photo", orgId: null });
    expect(m.storageKey).toMatch(/^progress\/[a-z0-9]+\/[0-9a-f-]{36}$/i);
    expect((await ph.myProgressPhotos(w.user)).photos.map((p) => p.id)).toEqual([r.photo.id]);
    expect((await ph.myPhotoFile(w.user, r.photo.id)).mime).toBe("image/jpeg");
  });

  it("archivo inválido, MIME falsificado, demasiado grande y fuera de medida se rechazan", async () => {
    const u = await verified();
    const bad = async (bytes: Uint8Array, mime: string) => (await err(ph.uploadProgressPhoto(u.id, { bytes, mime, day: dayAgo(0) })))?.code;
    expect(await bad(new TextEncoder().encode("<svg/>"), "image/jpeg")).toBe("invalid_file");
    expect(await bad(jpegWithGps(), "image/png")).toBe("invalid_file"); // dice PNG, es JPEG
    expect(await bad(new Uint8Array(3 * 1024 * 1024 + 1), "image/jpeg")).toBe("invalid_file");
    const tiny = jpegWithGps(); const i = tiny.indexOf(0xc0, 40); tiny[i + 4] = 0; tiny[i + 5] = 50; tiny[i + 6] = 0; tiny[i + 7] = 50; // 50×50
    expect(await bad(tiny, "image/jpeg")).toBe("invalid_file");
    expect((await ph.myProgressPhotos(u.id)).photos).toEqual([]);
  });

  it("coach, sala, gerencia, otro alumno y otra organización: 404 por toda vía (también /api/media y adjuntos)", async () => {
    const w = await world();
    const { photo } = await ph.uploadProgressPhoto(w.user, { bytes: jpegWithGps(), mime: "image/jpeg", day: dayAgo(1) });
    const [m] = await db.select().from(schema.progressPhoto).where(eq(schema.progressPhoto.id, photo.id));
    // Gimnasio de la misma persona: dueño, gerente y sala
    const owner = await verified("Dueño PP");
    const g = await acc.createGymOrganization(owner.id, { name: `Gym PP ${n}-${Date.now()}` });
    const [loc] = await db.insert(schema.gymLocation).values({ orgId: g.id, name: "Centro" }).returning();
    const floor = await verified("Sala PP");
    const manager = await verified("Gerente PP");
    await db.insert(schema.staffMembership).values([{ userId: floor.id, orgId: g.id, locationId: loc.id, role: "floor_trainer" }, { userId: manager.id, orgId: g.id, locationId: loc.id, role: "manager" }]);
    await db.insert(schema.gymMember).values({ orgId: g.id, locationId: loc.id, userId: w.user, status: "active" });
    const peer = await verified("Otra alumna PP");
    for (const who of [w.coach, owner.id, floor.id, manager.id, peer.id]) {
      expect((await err(ph.myPhotoFile(who, photo.id)))?.status).toBe(404);
      expect((await err(fu.authorizeVideo(who, m.mediaId)))?.status).toBe(404);
      expect((await err(ph.deleteProgressPhoto(who, photo.id)))?.status).toBe(404);
      expect((await err(ph.updateProgressPhoto(who, photo.id, { pose: "back" })))?.status).toBe(404);
      expect((await ph.myProgressPhotos(who)).photos).toEqual([]);
    }
    // La dueña tampoco puede adjuntarla a un pedido al coach ni a una tarea del gimnasio (quedaría visible para otros).
    expect((await err(fu.createRequest(w.user, { kind: "tecnica", text: "mirá mi foto", videoId: m.mediaId })))?.code).toBe("invalid");
    expect((await err(gym.createMemberTask(w.user, { kind: "tecnica", text: "mirá mi foto", videoId: m.mediaId })))?.code).toBe("invalid");
    expect((await fu.authorizeVideo(w.user, m.mediaId)).id).toBe(m.mediaId); // la dueña sí
  });

  it("eliminar borra referencia y archivo; la purga no borra fotos vigentes y limpia un archivo pendiente", async () => {
    const u = await verified();
    const keep = await ph.uploadProgressPhoto(u.id, { bytes: jpegWithGps(), mime: "image/jpeg", day: dayAgo(9) });
    const del = await ph.uploadProgressPhoto(u.id, { bytes: jpegWithGps(), mime: "image/jpeg", day: dayAgo(1) });
    // Las dos con más de 24 h: la purga de huérfanos no puede tocar la vigente (referencia nueva leída del catálogo).
    await db.update(schema.mediaObject).set({ createdAt: new Date(Date.now() - 3 * 86_400_000) }).where(eq(schema.mediaObject.ownerUserId, u.id));
    const refs = (await fu.mediaReferences()).map((r) => `${r.table}.${r.column}`);
    expect(refs).toContain("progress_photo.media_id");
    await fu.purgeMedia();
    expect(await storageFile(u.id, keep.photo.id)).not.toBeNull();
    expect(await storageFile(u.id, del.photo.id)).not.toBeNull();
    const [dm] = await db.select().from(schema.progressPhoto).where(eq(schema.progressPhoto.id, del.photo.id));
    const [media] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, dm.mediaId));
    expect(await ph.deleteProgressPhoto(u.id, del.photo.id)).toEqual({ ok: true, file: "deleted" });
    expect((await ph.myProgressPhotos(u.id)).photos.map((p) => p.id)).toEqual([keep.photo.id]);
    expect((await err(ph.myPhotoFile(u.id, del.photo.id)))?.status).toBe(404);
    expect(await readFile(path.join(process.cwd(), ".storage", media.storageKey)).catch(() => null)).toBeNull();
    const [after] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, dm.mediaId));
    expect(after.deletedAt).not.toBeNull();
    // Fallo parcial: referencia borrada pero el archivo quedó (Storage falló). La purga lo encuentra huérfano y lo borra.
    const third = await ph.uploadProgressPhoto(u.id, { bytes: jpegWithGps(), mime: "image/jpeg", day: dayAgo(3) });
    const [t] = await db.select().from(schema.progressPhoto).where(eq(schema.progressPhoto.id, third.photo.id));
    await db.delete(schema.progressPhoto).where(eq(schema.progressPhoto.id, t.id));
    await db.update(schema.mediaObject).set({ createdAt: new Date(Date.now() - 3 * 86_400_000) }).where(eq(schema.mediaObject.id, t.mediaId));
    await fu.purgeMedia();
    const [orphan] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, t.mediaId));
    expect(orphan.deletedAt).not.toBeNull();
    expect(await storageFile(u.id, keep.photo.id)).not.toBeNull();
  });

  it("exportación incluye peso, objetivo y la lista de fotos; menores no pueden subir; con el módulo apagado, 404", async () => {
    const u = await verified();
    await bd.saveWeight(u.id, { day: dayAgo(1), weightG: 70500 });
    await bd.setGoal(u.id, { targetG: 68000 });
    await ph.uploadProgressPhoto(u.id, { bytes: jpegWithGps(), mime: "image/jpeg", day: dayAgo(1), pose: "side" });
    const x = await exportMyData(u.id);
    expect(x.bodyWeight).toEqual([expect.objectContaining({ day: dayAgo(1), weightKg: 70.5, source: "manual" })]);
    expect(x.bodyGoal).toMatchObject({ targetKg: 68, startSource: "first_entry" });
    expect(x.progressPhotos).toEqual([expect.objectContaining({ day: dayAgo(1), pose: "side" })]);
    const teen = await verified("Menor fotos", `01/01/${new Date().getUTCFullYear() - 16}`);
    expect((await err(ph.uploadProgressPhoto(teen.id, { bytes: jpegWithGps(), mime: "image/jpeg", day: dayAgo(0) })))?.code).toBe("minor_restricted");
    const prev = process.env.NEXT_PUBLIC_REPI_FEATURES;
    process.env.NEXT_PUBLIC_REPI_FEATURES = "-progress_photos";
    try { expect((await err(ph.myProgressPhotos(u.id)))?.status).toBe(404); } finally { process.env.NEXT_PUBLIC_REPI_FEATURES = prev; }
  });
});

describe("novedades de REPI", () => {
  async function admin() {
    const a = await verified("Admin PP");
    await db.update(schema.user).set({ platformRole: "admin", twoFactorEnabled: true }).where(eq(schema.user.id, a.id));
    return a.id;
  }
  const draft = { kind: "feature" as const, title: "¡Ahora podés seguir tu progreso físico!", summary: "Registrá tu peso, revisá tus gráficos y compará tus avances desde Progreso.", ctaLabel: "Ver mi progreso", destination: "member.progress.body", audience: ["member"] };

  it("borrador invisible; publicada llega a alumnos con su destino; coach sólo ve lo suyo; leído persiste sin duplicar", async () => {
    const adm = await admin();
    const w = await world();
    const a = await an.createAnnouncement(adm, draft);
    const c = await an.createAnnouncement(adm, { ...draft, title: "Nuevo constructor para coaches", destination: "coach.builder", ctaLabel: "Abrir", audience: ["coach"] });
    const before = await myNotifications(w.user);
    expect(before.items.some((x) => x.id === `ann:${a.id}`)).toBe(false);
    await an.publishAnnouncement(adm, a.id);
    await an.publishAnnouncement(adm, c.id);
    expect((await an.publishAnnouncement(adm, a.id)).already).toBe(true); // idempotente
    const f = await myNotifications(w.user);
    const item = f.items.find((x) => x.id === `ann:${a.id}`);
    expect(item).toMatchObject({ origin: "repi", unread: true, cta: "Ver mi progreso", dest: { tab: "prog", seg: "body" } });
    expect(f.items.some((x) => x.id === `ann:${c.id}`)).toBe(false); // de coach: no al alumno
    const coachView = await an.myAnnouncements(w.coach, "coach");
    expect(coachView.items.map((x) => x.id)).toEqual([c.id]);
    expect(coachView.items[0]).toMatchObject({ destination: "coach.builder", unread: true });
    expect((await an.myAnnouncements(w.user, "coach")).items).toEqual([]); // sin rol de coach
    await markNotificationsSeen(w.user);
    expect((await myNotifications(w.user)).items.find((x) => x.id === `ann:${a.id}`)?.unread).toBe(false);
    // Corrección de texto: mismo id, no vuelve a aparecer como nueva, una sola entrada.
    await an.updateAnnouncement(adm, a.id, { ...draft, summary: `${draft.summary} Es privado.`, revision: 1 });
    const f2 = await myNotifications(w.user);
    expect(f2.items.filter((x) => x.id.startsWith("ann:")).map((x) => [x.id, x.unread])).toEqual([[`ann:${a.id}`, false]]);
    expect((await err(an.updateAnnouncement(adm, a.id, { ...draft, revision: 1 })))?.code).toBe("stale");
  });

  it("varios roles: «todas las personas» se lee una vez en cualquier espacio; gimnasio por rol; archivada desaparece", async () => {
    const adm = await admin();
    const w = await world();
    const owner = await verified("Dueña PP");
    const g = await acc.createGymOrganization(owner.id, { name: `Gym novedades ${n}-${Date.now()}` });
    const [loc] = await db.insert(schema.gymLocation).values({ orgId: g.id, name: "Centro" }).returning();
    await db.insert(schema.gymMember).values({ orgId: g.id, locationId: loc.id, userId: w.coach, status: "active" }); // el coach también es socio
    const all = await an.createAnnouncement(adm, { ...draft, title: "Mejoras de rendimiento", ctaLabel: null, destination: "none", audience: ["all"] });
    const gymOnly = await an.createAnnouncement(adm, { ...draft, title: "Equipamiento por sede", ctaLabel: "Ver", destination: "gym.equipment", audience: ["gym_admin"] });
    await an.publishAnnouncement(adm, all.id); await an.publishAnnouncement(adm, gymOnly.id);
    const mine = (xs: { id: string }[]) => xs.map((x) => x.id).filter((id) => id === all.id || id === gymOnly.id).sort(); // otras pruebas publican las suyas
    expect(mine((await an.myAnnouncements(w.coach, "coach")).items)).toEqual([all.id]);
    expect((await myNotifications(w.coach)).items.filter((x) => x.id === `ann:${all.id}`)).toHaveLength(1);
    await an.markAnnouncementsRead(w.coach, "coach");
    expect((await myNotifications(w.coach)).items.find((x) => x.id === `ann:${all.id}`)?.unread).toBe(false); // leída una vez
    expect(mine((await an.myAnnouncements(owner.id, "gym", { orgId: g.id })).items)).toEqual([all.id, gymOnly.id].sort());
    expect((await an.myAnnouncements(owner.id, "gym", { orgId: w.org })).items).toEqual([]); // otra organización: sin rol
    expect((await an.myAnnouncements(w.user, "gym", { orgId: g.id })).items).toEqual([]); // un socio no ve el panel del gimnasio
    await an.archiveAnnouncement(adm, all.id);
    expect(mine((await an.myAnnouncements(owner.id, "gym", { orgId: g.id })).items)).toEqual([gymOnly.id]);
  });

  it("programada: no aparece ni se marca leída antes de tiempo; permisos de Admin; validación y módulo apagado", async () => {
    const adm = await admin();
    const w = await world();
    const a = await an.createAnnouncement(adm, draft);
    const at = new Date(Date.now() + 2 * 3_600_000);
    await an.publishAnnouncement(adm, a.id, { at: at.toISOString() });
    await markNotificationsSeen(w.user);
    expect((await myNotifications(w.user)).items.some((x) => x.id === `ann:${a.id}`)).toBe(false);
    const later = await myNotifications(w.user, new Date(at.getTime() + 60_000));
    expect(later.items.find((x) => x.id === `ann:${a.id}`)?.unread).toBe(true);
    // Alumno y coach no administran novedades (REPI Admin con 2FA).
    for (const who of [w.user, w.coach]) {
      expect((await err(an.createAnnouncement(who, draft)))?.status).toBe(404);
      expect((await err(an.adminAnnouncements(who)))?.status).toBe(404);
      expect((await err(an.publishAnnouncement(who, a.id)))?.status).toBe(404);
    }
    expect((await err(an.createAnnouncement(adm, { ...draft, summary: "Entrá ya a www.otro-sitio.com para ver" })))?.code).toBe("invalid");
    expect((await err(an.createAnnouncement(adm, { ...draft, audience: ["coach"] })))?.code).toBe("invalid");
    const prev = process.env.NEXT_PUBLIC_REPI_FEATURES;
    process.env.NEXT_PUBLIC_REPI_FEATURES = "";
    try {
      const d = await an.createAnnouncement(adm, draft);
      expect((await err(an.publishAnnouncement(adm, d.id)))?.code).toBe("module_off");
      expect((await an.myAnnouncements(w.user, "member")).items).toEqual([]);
    } finally { process.env.NEXT_PUBLIC_REPI_FEATURES = prev; }
  });

  it("las notificaciones existentes siguen funcionando junto a las novedades", async () => {
    const w = await world();
    await db.insert(schema.memberNotice).values({ userId: w.user, kind: "club_notice", title: "Aviso del Club", body: "Texto" });
    const f = await myNotifications(w.user);
    expect(f.items.find((x) => x.title === "Aviso del Club")).toMatchObject({ dest: { tab: "gym", gymTab: "news" }, unread: true });
    await markNotificationsSeen(w.user);
    expect((await myNotifications(w.user)).unread).toBe(0);
  });
});

describe("elegibilidad por edad (D203): nunca se supone adulta a una cuenta sin fecha de nacimiento", () => {
  const year = new Date().getUTCFullYear();
  it("sin fecha: peso, fotos y calorías no disponibles (403 age_required); entrenar y sus gráficos siguen", async () => {
    const w = await world();
    await db.update(schema.user).set({ birthDate: null }).where(eq(schema.user.id, w.user)); // registro donde era opcional
    const sid = await trained(w.user, { bench: [[60, 10]], minutes: 45 }); // entrenar no se bloquea
    expect((await ex.myProgressSummary(w.user, "30d")).totals.sessions).toBe(1);
    expect((await ex.myExerciseProgress(w.user, EX["Press banca PP"], "30d")).points).toHaveLength(1);
    expect(await bd.myBody(w.user, "all")).toEqual({ available: false, reason: "age_unknown" });
    expect((await err(bd.saveWeight(w.user, { day: dayAgo(0), weightG: 80000 })))?.code).toBe("age_required");
    expect((await err(bd.setGoal(w.user, { targetG: 76000 })))?.code).toBe("age_required");
    expect((await err(ph.uploadProgressPhoto(w.user, { bytes: jpegWithGps(), mime: "image/jpeg", day: dayAgo(0) })))?.code).toBe("age_required");
    expect(await ph.myProgressPhotos(w.user)).toMatchObject({ canUpload: false, eligibility: "unknown", photos: [] });
    expect((await sessionCalories(w.user, sid)).estimate).toEqual({ ok: false, reason: "age_unknown" });
    expect(await db.select().from(schema.bodyWeightEntry).where(eq(schema.bodyWeightEntry.userId, w.user))).toEqual([]);
  });

  it("declarar la fecha una vez: adulta habilita; no se puede reemplazar desde la app; auditoría sin la fecha", async () => {
    const u = await verified("Sin fecha PP", null);
    expect((await db.select({ b: schema.user.birthDate }).from(schema.user).where(eq(schema.user.id, u.id)))[0].b).toBeNull();
    expect((await err(acc.declareBirthDate(u.id, "31/02/1990")))?.code).toBe("invalid_birth");
    expect((await err(acc.declareBirthDate(u.id, `01/01/${year + 1}`)))?.code).toBe("invalid_birth");
    expect(await acc.declareBirthDate(u.id, "1990-05-10")).toEqual({ eligibility: "adult", guardian: null });
    expect((await bd.saveWeight(u.id, { day: dayAgo(0), weightG: 80000 })).entry.weightG).toBe(80000);
    expect((await ph.uploadProgressPhoto(u.id, { bytes: jpegWithGps(), mime: "image/jpeg", day: dayAgo(0) })).photo.width).toBe(640);
    // Una menor no puede «volverse» adulta cambiando la fecha, ni al revés: la existente no se reemplaza.
    expect((await err(acc.declareBirthDate(u.id, `01/01/${year - 15}`)))?.code).toBe("already_set");
    expect((await db.select({ b: schema.user.birthDate }).from(schema.user).where(eq(schema.user.id, u.id)))[0].b).toBe("1990-05-10");
    const [a] = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.actorUserId, u.id), eq(schema.auditEvent.action, "account.birth_date_declared")));
    expect(a.meta).toEqual({ eligibility: "adult" });
    expect(JSON.stringify(a)).not.toContain("1990-05-10");
  });

  it("declarar una fecha de menor activa las reglas de menores y del adulto responsable (y no habilita nada)", async () => {
    const u = await verified("Sin fecha menor PP", null);
    expect(await acc.minorWithoutGuardian(u.id)).toBe(false); // sin fecha, el mecanismo existente no la veía como menor
    expect(await acc.declareBirthDate(u.id, `01/01/${year - 15}`)).toEqual({ eligibility: "minor", guardian: "none" });
    expect(await acc.minorWithoutGuardian(u.id)).toBe(true); // ahora sí: consentimiento del adulto responsable
    await acc.requestGuardianConsent(u.id, { name: "Madre PP", email: `madre${n}.${Date.now()}@test.repi.local`, relation: "Madre" });
    expect(await bd.myBody(u.id, "all")).toEqual({ available: false, reason: "minor" });
    expect((await err(bd.saveWeight(u.id, { day: dayAgo(0), weightG: 50000 })))?.code).toBe("minor_restricted");
    expect((await err(ph.uploadProgressPhoto(u.id, { bytes: jpegWithGps(), mime: "image/jpeg", day: dayAgo(0) })))?.code).toBe("minor_restricted");
    expect(await ph.myProgressPhotos(u.id)).toMatchObject({ canUpload: false, eligibility: "minor" });
  });

  it("menor con fecha registrada y autorización del adulto: sigue sin peso, fotos ni calorías en 1.0; adulta sí", async () => {
    const w = await world();
    await db.update(schema.user).set({ birthDate: `${year - 16}-03-01` }).where(eq(schema.user.id, w.user));
    await db.insert(schema.guardianConsent).values({ minorUserId: w.user, guardianName: "Padre", guardianEmail: `p${n}@test.repi.local`, relation: "father", tokenHash: `h${n}${Date.now()}`, status: "approved", policyVersion: "minors-v1", expiresAt: new Date(Date.now() + 86_400_000) });
    const sid = await trained(w.user, { bench: [[40, 10]] });
    expect((await sessionCalories(w.user, sid)).estimate).toEqual({ ok: false, reason: "minor" });
    expect((await err(bd.saveWeight(w.user, { day: dayAgo(0), weightG: 55000 })))?.code).toBe("minor_restricted");
    expect((await err(acc.declareBirthDate(w.user, "1990-01-01")))?.code).toBe("already_set");
    const adult = await world();
    await bd.saveWeight(adult.user, { day: dayAgo(0), weightG: 80000 });
    const s2 = await trained(adult.user, { bench: [[60, 10]] });
    expect((await sessionCalories(adult.user, s2)).estimate).toMatchObject({ ok: true });
  });
});
