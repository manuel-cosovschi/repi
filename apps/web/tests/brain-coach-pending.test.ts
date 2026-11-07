// D209 · Interfaz del coach: «Pendientes» del panel (coachPendingSignals) y el detalle sin texto de las propuestas abiertas en
// «Señales de REPI» (refs.items). Mismo alcance que la ficha: requireCoach y, por alumno, relación no terminada con el permiso
// «training» activo. Sólo números y metadatos (ejercicio, tipo, origen): nunca la nota del alumno ni su memoria.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import * as acc from "@/server/access/services";
import * as tr from "@/server/training/services";
import { AccessError, resetRateLimits } from "@/server/access/util";
import { coachInsights, coachPendingSignals } from "@/server/brain/coach";

const { programAssignment, brainAction, trainingProposal, consentGrant, coachClient } = schema;
let n = 0, EX = "";
const EX_NAME = "Remo con barra AC3 pendientes";
const SECRET = "NOTA-PRIVADA-DEL-PEDIDO";
const err = (p: Promise<unknown>) => p.then(() => null, (e) => e as AccessError);
const person = async () => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: `Persona Pendientes ${++n}`, email: `${id}@test.repi.local`, emailVerified: true, birthDate: "1990-01-01" });
  return { id, email: `${id}@test.repi.local` };
};
beforeAll(async () => {
  EX = (await db.insert(schema.exercise).values({ name: EX_NAME, muscleGroup: "Espalda" }).onConflictDoNothing().returning())[0]?.id
    ?? (await db.select().from(schema.exercise).where(eq(schema.exercise.name, EX_NAME)))[0].id;
});
beforeEach(() => { resetRateLimits(); });

async function coachOrg() {
  const c = await person();
  const org = await acc.createCoachOrganization(c.id, { brand: `Coach Pendientes ${n}` });
  return { coach: c.id, org: org.id };
}
async function relate(c: { coach: string; org: string }, u: { id: string; email: string }) {
  const inv = await acc.inviteCoachClient(c.coach, c.org, { email: u.email });
  const rel = await acc.acceptInvitation(u.id, inv.code, []);
  const pid = await tr.createTemplate(c.coach, c.org, { name: "Base", weeks: 4, note: "", days: [{ name: "Día A", exercises: [{ exerciseId: EX, name: EX_NAME, sets: 2, reps: "8-10", rir: 2, restSec: 120 }] }] });
  await tr.assignProgram(c.coach, c.org, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
  await db.update(programAssignment).set({ startsOn: "2020-01-01" }).where(eq(programAssignment.coachClientId, rel.relationId));
  return rel.relationId;
}
const proposal = (coachClientId: string, kind: "load" | "reps", trend = "progressing") => db.insert(trainingProposal).values({ coachClientId, exerciseId: EX, kind,
  payload: { text: trend === "student_request" ? `Tu alumno pidió revisar ${EX_NAME}: «${SECRET}»` : "Subir 2,5 kg", weightKg: 62.5, reps: null, basis: "prueba", trend, sessions: 4 }, algoVersion: "test" })
  .returning().then((r) => r[0]);
/** Pedido del alumno desde REPI: la propuesta y la acción ejecutada que apunta a ella (como propose_to_coach). */
async function studentRequest(userId: string, coachClientId: string) {
  const p = await proposal(coachClientId, "reps", "student_request");
  await db.insert(brainAction).values({ userId, kind: "propose_to_coach", idempotencyKey: `propose_to_coach:${randomUUID().slice(0, 16)}`, status: "executed", autonomy: 1,
    input: { exerciseId: EX, kind: "reps", weightKg: null, reps: 10, note: SECRET }, result: { proposalId: p.id }, executedAt: new Date() });
  return p;
}

describe("«Pendientes» del panel del coach", () => {
  it("cuenta propuestas abiertas y pedidos del alumno por relación vigente con permiso; nada de otras relaciones ni textos", async () => {
    const A = await coachOrg(), B = await coachOrg();
    const s1 = await person(), s2 = await person(), s3 = await person(), s4 = await person(), s5 = await person();
    const r1 = await relate(A, s1), r2 = await relate(A, s2), r3 = await relate(A, s3), r4 = await relate(A, s4);
    const r5 = await relate(B, s5);
    // s1: una de Training Intelligence y un pedido suyo desde REPI; una decidida que ya no cuenta.
    const ti = await proposal(r1, "load");
    const req = await studentRequest(s1.id, r1);
    await db.update(trainingProposal).set({ status: "rejected", decidedAt: new Date() }).where(eq(trainingProposal.id, ti.id));
    await proposal(r1, "load");
    // s2: relación terminada. s3: revocó el permiso de entrenamientos. s4: nada pendiente. s5: de otro coach.
    await proposal(r2, "load");
    await db.update(coachClient).set({ status: "ended" }).where(eq(coachClient.id, r2));
    await proposal(r3, "load");
    await db.update(consentGrant).set({ status: "revoked" }).where(and(eq(consentGrant.relationId, r3), eq(consentGrant.item, "training")));
    await proposal(r5, "load");

    const v = await coachPendingSignals(A.coach, A.org);
    expect(v.clients).toEqual([{ relId: r1, pendingProposals: 2, studentRequests: 1 }]);
    expect(v.totals).toEqual({ clients: 1, pendingProposals: 2, studentRequests: 1 });
    expect(v.clients.some((c) => [r2, r3, r4, r5].includes(c.relId))).toBe(false);
    expect(JSON.stringify(v)).not.toContain(SECRET);
    // Una pausa no lo saca (sigue siendo su alumno); B ve sólo lo suyo.
    await db.update(coachClient).set({ status: "paused" }).where(eq(coachClient.id, r1));
    expect((await coachPendingSignals(A.coach, A.org)).totals.pendingProposals).toBe(2);
    expect((await coachPendingSignals(B.coach, B.org)).clients).toEqual([{ relId: r5, pendingProposals: 1, studentRequests: 0 }]);
    // Otro coach, el alumno o un coach entrando por la organización ajena: 404.
    expect(await err(coachPendingSignals(B.coach, A.org))).toMatchObject({ status: 404 });
    expect(await err(coachPendingSignals(s1.id, A.org))).toMatchObject({ status: 404 });
    // Al decidir el pedido, deja de estar pendiente.
    await db.update(trainingProposal).set({ status: "kept", decidedAt: new Date() }).where(eq(trainingProposal.id, req.id));
    expect((await coachPendingSignals(A.coach, A.org)).clients).toEqual([{ relId: r1, pendingProposals: 1, studentRequests: 0 }]);
  });

  it("«Señales de REPI» detalla cada propuesta abierta sin su texto: ejercicio, tipo y origen", async () => {
    const A = await coachOrg();
    const s = await person();
    const rel = await relate(A, s);
    const ti = await proposal(rel, "load");
    const req = await studentRequest(s.id, rel);
    const v = await coachInsights(A.coach, A.org, rel);
    const pending = v.insights.find((i) => i.kind === "pending_proposals")!;
    expect(pending.count).toBe(2);
    expect(pending.refs?.items).toEqual(expect.arrayContaining([
      { proposalId: ti.id, exerciseId: EX, exerciseName: EX_NAME, kind: "load", source: "ti" },
      { proposalId: req.id, exerciseId: EX, exerciseName: EX_NAME, kind: "reps", source: "student" },
    ]));
    expect(JSON.stringify(v)).not.toContain(SECRET);
  });
});
