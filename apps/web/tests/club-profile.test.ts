// D169: perfil del Club con foto, máximos y publicaciones con imagen; las fotos las ven sólo socios del Club, nunca entre
// personas bloqueadas ni la de una publicación oculta.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as tr from "@/server/training/services";
import * as club from "@/server/community/club";
import * as fu from "@/server/followup/services";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified(name: string) {
  const email = `cp${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const JPG = () => { const u = new Uint8Array(64); u.set([0xff, 0xd8, 0xff, 0xe0]); return u; };
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
  });
});
