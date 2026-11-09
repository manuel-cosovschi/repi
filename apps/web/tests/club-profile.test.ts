// D169: perfil del Club con foto, máximos y publicaciones con imagen; las fotos las ven sólo socios del Club, nunca entre
// personas bloqueadas ni la de una publicación oculta.
import { randomUUID } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as tr from "@/server/training/services";
import * as club from "@/server/community/club";
import * as fu from "@/server/followup/services";
import { resetRateLimits } from "@/server/access/util";
import { jpegWithGps } from "../../../packages/domain/src/image-fixtures";
import { hasImageMetadata, imageInfo } from "@repi/domain";
import { readObject } from "@/server/storage";

let n = 0;
async function verified(name: string) {
  const email = `cp${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
// FSA1: una foto real (con EXIF y GPS): el servidor la guarda sin metadatos; un encabezado suelto ya no alcanza.
const JPG = () => jpegWithGps();
const err = (p: Promise<unknown>) => p.then(() => null, (e) => e as { code?: string });
beforeEach(() => resetRateLimits());

describe("perfil del Club", () => {
  it("foto de perfil, máximos a elección y publicaciones con foto visibles sólo en el Club", async () => {
    const owner = await verified("Dueña Perfil");
    const org = await acc.createGymOrganization(owner, { name: `Gym Perfil ${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const prof = await verified("Profe Perfil");
    await db.insert(schema.staffMembership).values({ userId: prof, orgId: org.id, locationId: A.id, role: "floor_trainer" });
    await gym.startShift(prof, org.id, A.id);
    const [sq] = await db.insert(schema.exercise).values({ name: `Sentadilla perfil ${Date.now()}`, muscleGroup: "Piernas" }).returning();
    const socio = async (name: string) => {
      const u = await verified(name);
      const [m] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u, status: "active" }).returning();
      await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
      return { u, m };
    };
    const ana = await socio("Ana Perfil"), beto = await socio("Beto Perfil"), caro = await socio("Caro Perfil");
    await gym.saveMemberProgram(prof, org.id, ana.m.id, { doc: { name: "P", weeks: 4, note: "", days: [{ name: "A", exercises: [{ exerciseId: sq.id, name: sq.name, sets: 3, reps: "5", rir: 2, restSec: 90 }] }] }, reason: "Inicial" });
    const t = await tr.myTraining(ana.u);
    if (t.state !== "ready") throw new Error("sin programa");
    const sid = randomUUID();
    await tr.startSession(ana.u, { id: sid, dayId: t.program.days[0].id });
    const s = await tr.getSession(ana.u, sid);
    for (const [i, [w, r]] of [[100, 5], [110, 2], [110, 3]].entries()) {
      await db.insert(schema.setLog).values({ id: randomUUID(), sessionId: sid, programExerciseId: s.exercises[0].id, exerciseId: sq.id, setIndex: i, weightKg: String(w), reps: r, completedAt: new Date() });
    }
    await db.update(schema.workoutSession).set({ status: "completed", endedAt: new Date() }).where(eq(schema.workoutSession.id, sid));

    // Fotos: sólo socios del Club.
    expect((await err(club.uploadClubImage(ana.u, org.id, { mime: "image/jpeg", bytes: JPG() })))?.code).toBe("not_joined");
    for (const x of [ana, beto]) await club.joinClub(x.u, org.id, { showName: true, inRanking: false });
    expect((await err(club.uploadClubImage(ana.u, org.id, { mime: "image/jpeg", bytes: new Uint8Array(64) })))?.code).toBe("invalid_file");
    const av = await club.uploadClubImage(ana.u, org.id, { mime: "image/jpeg", bytes: JPG() });
    // FSA1: lo que ven los demás socios se guarda sin EXIF ni GPS, aunque la foto llegue sin pasar por la app.
    const [stored] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, av.id));
    const raw = new Uint8Array(await new Response((await readObject(stored.storageKey)).stream).arrayBuffer());
    expect(hasImageMetadata(JPG())).toBe(true);
    expect(hasImageMetadata(raw)).toBe(false);
    expect(imageInfo(raw)).toEqual(imageInfo(JPG()));
    expect(stored.sizeBytes).toBe(raw.byteLength);

    // Máximos: la serie más pesada (110 × 3), con 1RM estimado; se muestran sólo si la persona lo elige.
    const mine = await club.setClubProfile(ana.u, org.id, { bio: "Voy por los 120", avatarId: av.id, showMaxes: false });
    expect(mine.maxes[0]).toMatchObject({ exercise: sq.name, kg: 110, reps: 3 });
    expect((await club.viewClubProfile(beto.u, org.id, ana.u)).maxes).toBeNull();
    await club.setClubProfile(ana.u, org.id, { bio: "Voy por los 120", showMaxes: true });
    const seen = await club.viewClubProfile(beto.u, org.id, ana.u);
    expect(seen).toMatchObject({ avatarId: av.id, bio: "Voy por los 120" }); // sin `avatarId` queda la foto que tenía
    expect(seen.maxes?.[0]).toMatchObject({ kg: 110, reps: 3, e1rm: 121 });

    // Publicación con foto: una foto no se publica dos veces; la ve el Club, no quien no está en el Club.
    const pic = await club.uploadClubImage(ana.u, org.id, { mime: "image/jpeg", bytes: JPG() });
    const post = await club.createClubPost(ana.u, org.id, { imageId: pic.id });
    expect((await err(club.createClubPost(ana.u, org.id, { imageId: pic.id })))?.code).toBe("invalid");
    const f = await club.feed(beto.u, org.id);
    expect(f.find((x) => x.id === post.id)).toMatchObject({ kind: "image", imageId: pic.id, avatarId: av.id });
    expect((await club.viewClubProfile(beto.u, org.id, ana.u)).photos).toEqual([pic.id]);
    expect((await fu.authorizeVideo(beto.u, pic.id)).id).toBe(pic.id);
    expect((await err(fu.authorizeVideo(caro.u, pic.id)))?.code).toBe("not_found");
    // Bloqueo: ya no se ven las fotos.
    await club.blockUser(beto.u, org.id, ana.u);
    expect((await err(fu.authorizeVideo(beto.u, pic.id)))?.code).toBe("not_found");
    // Foto de otra persona: no se puede usar.
    const other = await club.uploadClubImage(ana.u, org.id, { mime: "image/jpeg", bytes: JPG() });
    expect((await err(club.createClubPost(beto.u, org.id, { imageId: other.id })))?.code).toBe("invalid");

    // Regresión (05/11/2026): la purga diaria de huérfanos borró la foto de una publicación del Club. Con más de 24 h, la foto
    // de la publicación y la de perfil se conservan; la subida que nunca se usó (`other`) sí se purga.
    await db.update(schema.mediaObject).set({ createdAt: new Date(Date.now() - 48 * 3_600_000) }).where(inArray(schema.mediaObject.id, [av.id, pic.id, other.id]));
    expect((await fu.purgeMedia()).orphans).toBeGreaterThanOrEqual(1);
    const left = new Map((await db.select().from(schema.mediaObject).where(inArray(schema.mediaObject.id, [av.id, pic.id, other.id]))).map((m) => [m.id, m.deletedAt]));
    expect(left.get(pic.id)).toBeNull();
    expect(left.get(av.id)).toBeNull();
    expect(left.get(other.id)).not.toBeNull();
    expect((await fu.authorizeVideo(ana.u, pic.id)).id).toBe(pic.id);

    // D196: que no vuelva a pasar con una tabla FUTURA. Una tabla nueva con clave foránea a media_object protege su archivo
    // sin tocar purgeMedia; y lo vencido por plazo no se borra si otra tabla lo sigue usando.
    const fut = await club.uploadClubImage(ana.u, org.id, { mime: "image/jpeg", bytes: JPG() });
    await db.execute(sql`create table zz_future_media (id serial primary key, media_id text references media_object(id))`);
    try {
      await db.execute(sql`insert into zz_future_media (media_id) values (${fut.id})`);
      await db.update(schema.mediaObject).set({ createdAt: new Date(Date.now() - 48 * 3_600_000) }).where(eq(schema.mediaObject.id, fut.id));
      expect((await fu.mediaReferences()).map((r) => `${r.table}.${r.column}`)).toEqual(expect.arrayContaining([...fu.KNOWN_MEDIA_REFERENCES, "zz_future_media.media_id"]));
      await fu.purgeMedia();
      expect((await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, fut.id)))[0]?.deletedAt).toBeNull();
    } finally {
      await db.execute(sql`drop table zz_future_media`);
    }
  });
});
