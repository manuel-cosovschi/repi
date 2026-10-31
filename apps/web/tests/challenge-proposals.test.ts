// D172: los socios proponen desafíos; un profe los aprueba con una dificultad (o los rechaza con motivo), se publican en la
// sede y validarlos suma al nivel los puntos de esa dificultad.
import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { CHALLENGE_DIFFICULTY, MAX_PENDING_PROPOSALS, XP } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import * as gym from "@/server/gym/services";
import * as cm from "@/server/community/services";
import { levelStats } from "@/server/community/levels";
import { resetRateLimits } from "@/server/access/util";

let n = 0;
async function verified(name: string) {
  const email = `cpp${++n}.${Date.now()}@test.repi.local`;
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return r.userId!;
}
const err = (p: Promise<unknown>) => p.then(() => null, (e) => e as { code?: string });
beforeEach(() => resetRateLimits());

describe("desafíos propuestos por socios", () => {
  it("proponer, aprobar con dificultad, publicar en Inicio y sumar puntos al validarlo", async () => {
    const owner = await verified("Dueña Propuestas");
    const org = await acc.createGymOrganization(owner, { name: `Gym Propuestas ${Date.now()}` });
    const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Centro" }).returning();
    const prof = await verified("Profe Propuestas");
    await db.insert(schema.staffMembership).values({ userId: prof, orgId: org.id, locationId: A.id, role: "floor_trainer" });
    await gym.startShift(prof, org.id, A.id);
    const socio = async (name: string) => {
      const u = await verified(name);
      await db.insert(schema.gymMember).values({ orgId: org.id, locationId: A.id, userId: u, status: "active" });
      return u;
    };
    const ana = await socio("Ana Propone"), beto = await socio("Beto Socio");

    // Validaciones mínimas y tope de propuestas pendientes.
    expect((await err(cm.proposeChallenge(ana, { title: "x", rule: "Diez burpees seguidos", unit: "reps" })))?.code).toBe("invalid");
    expect((await err(cm.proposeChallenge(ana, { title: "Burpees", rule: "corto", unit: "reps" })))?.code).toBe("invalid");
    const p = await cm.proposeChallenge(ana, { title: "100 burpees", rule: "Cien burpees por tiempo, pecho al piso y salto con palmas arriba", unit: "seg", lowerIsBetter: true });
    for (let i = 1; i < MAX_PENDING_PROPOSALS; i++) await cm.proposeChallenge(ana, { title: `Propuesta ${i}`, rule: "Una regla suficientemente clara", unit: "reps" });
    expect((await err(cm.proposeChallenge(ana, { title: "Una más", rule: "Una regla suficientemente clara", unit: "reps" })))?.code).toBe("rate_limited");

    // Pendiente: no aparece para los socios; sí en mis propuestas y en la lista del profe.
    expect((await cm.myGymHome(beto)).challenges.find((c) => c.id === p.id)).toBeUndefined();
    expect((await cm.myGymHome(ana)).proposals.find((x) => x.id === p.id)?.status).toBe("proposed");
    expect((await cm.listProposals(prof, org.id)).find((x) => x.id === p.id)).toMatchObject({ by: "Ana Propone", status: "proposed" });
    expect((await err(cm.listProposals(beto, org.id)))?.code).toBeTruthy(); // un socio no es del equipo

    // Aprobar exige dificultad; con dificultad «Media» se publica con el premio de puntos y avisa a quien propuso.
    expect((await err(cm.reviewProposal(prof, org.id, p.id, { approve: true })))?.code).toBe("invalid");
    expect((await cm.reviewProposal(prof, org.id, p.id, { approve: true, difficulty: 2 })).status).toBe("active");
    expect((await err(cm.reviewProposal(prof, org.id, p.id, { approve: true, difficulty: 2 })))?.code).toBe("decided");
    const home = await cm.myGymHome(beto);
    const pub = home.challenges.find((c) => c.id === p.id)!;
    expect(pub).toMatchObject({ status: "active", by: "Ana", prize: `+${CHALLENGE_DIFFICULTY[2].xp} puntos para tu nivel`, difficulty: { level: 2, xp: 40 } });
    expect((await cm.communityChallenges(beto)).items[0]).toMatchObject({ id: p.id, by: "Ana", difficulty: { label: "Media" }, mine: null });
    expect((await cm.myGymHome(ana)).notices.some((x) => x.kind === "proposal_approved")).toBe(true);

    // Rechazar exige motivo y le llega a quien propuso.
    const other = (await cm.listProposals(prof, org.id)).find((x) => x.status === "proposed")!;
    expect((await err(cm.reviewProposal(prof, org.id, other.id, { approve: false })))?.code).toBe("invalid");
    await cm.reviewProposal(prof, org.id, other.id, { approve: false, reason: "Ya existe uno parecido" });
    expect((await cm.myGymHome(ana)).proposals.find((x) => x.id === other.id)).toMatchObject({ status: "rejected", note: "Ya existe uno parecido" });

    // Validado en sala: suma los puntos de la dificultad (40), no los 30 de un desafío sin dificultad.
    const before = await levelStats(beto);
    const a = await cm.submitAttempt(beto, { challengeId: p.id, value: 300, inPerson: true, confirm: true });
    await cm.decideAttempt(prof, org.id, a.id, { approve: true, value: 300 });
    const after = await levelStats(beto);
    expect(after.validated).toBe(before.validated + 1);
    expect((after.challengeXp ?? 0) - (before.challengeXp ?? 0)).toBe(CHALLENGE_DIFFICULTY[2].xp);
    expect(CHALLENGE_DIFFICULTY[2].xp).not.toBe(XP.validated);
    expect((await cm.communityChallenges(beto)).items[0].mine).toBe("approved");
  });
});
