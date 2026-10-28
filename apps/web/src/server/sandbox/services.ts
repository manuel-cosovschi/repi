// Demo guiada para vender REPI (pedido del usuario 27/10, D85). Cada visita crea su propio entorno aislado: un gimnasio
// y un coach ficticios con datos realistas, armados con los mismos servicios de la app (programas, turnos, solicitudes,
// series, avisos al piso, cobros). Nada se comparte entre visitantes ni toca clientes reales; todo es is_demo y se borra
// a las 6 horas. Los emails usan el dominio reservado .invalid: el adaptador de correo nunca los envía.
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "../auth";
import { AccessError } from "../access/util";
import { assignProgram, createTemplate, logSet, startSession, myTraining, getSession } from "../training/services";
import { saveMemberProgram, startShift } from "../gym/services";
import { regenerateJoinLink, requestAccess } from "../join/services";
import { createRequest } from "../followup/services";
import { myThreads, sendMessage } from "../messages/services";
import { createCharge, registerPayment } from "../coachpay/services";

export type DemoRole = "owner" | "floor" | "member" | "coach";
export const DEMO_ROLES: DemoRole[] = ["owner", "floor", "member", "coach"];
export const SANDBOX_TTL_HOURS = 6;
const MAX_ACTIVE = 300;
/** Dominio reservado (.invalid, RFC 2606): nunca resuelve ni recibe correo. Uno por demo: demo-<tag>.invalid. */
export const sandboxDomain = (tag: string) => `demo-${tag}.invalid`;

const LIB: [string, string, "load_reps" | "bodyweight" | "time"][] = [
  ["Press de banca", "Pecho", "load_reps"], ["Press inclinado mancuernas", "Pecho", "load_reps"], ["Remo con barra", "Espalda", "load_reps"],
  ["Jalón al pecho", "Espalda", "load_reps"], ["Remo en polea", "Espalda", "load_reps"], ["Press militar", "Hombros", "load_reps"],
  ["Elevaciones laterales", "Hombros", "load_reps"], ["Sentadilla", "Piernas", "load_reps"], ["Peso muerto rumano", "Piernas", "load_reps"],
  ["Prensa", "Piernas", "load_reps"], ["Hip thrust", "Glúteos", "load_reps"], ["Fondos en paralelas", "Brazos", "bodyweight"],
];

const day = (offset: number, now: Date) => localDate(new Date(now.getTime() + offset * 86_400_000));

/** Crea el entorno, deja abierta la sesión del rol elegido y devuelve a dónde ir. */
export async function startDemo(role: DemoRole, now = new Date()) {
  if (!DEMO_ROLES.includes(role)) throw new AccessError("invalid", "Elegí un perfil para la demo.");
  const active = await db.select({ id: schema.demoSandbox.id }).from(schema.demoSandbox).limit(MAX_ACTIVE + 1);
  if (active.length > MAX_ACTIVE) throw new AccessError("busy", "Hay muchas demos abiertas en este momento. Probá de nuevo en unos minutos.", 503);
  const tag = randomBytes(5).toString("hex");
  const who = { owner: "martin.sosa", floor: "sofia.ramirez", member: "valentina.gomez", coach: "agustin.perez" }[role];
  const pw = randomBytes(24).toString("base64url"); // sólo para abrir la sesión ahora; nunca se muestra
  const userIds: string[] = [], orgIds: string[] = [];
  const [box] = await db.insert(schema.demoSandbox).values({ tag, role, expiresAt: new Date(now.getTime() + SANDBOX_TTL_HOURS * 3_600_000), userIds, orgIds }).returning();
  const person = async (slug: string, name: string) => {
    const email = `${slug}@${sandboxDomain(tag)}`;
    const r = await auth.api.signUpEmail({ body: { name, email, password: pw } });
    // 2FA marcado (los servicios del personal lo exigen). A quien abre la sesión se le quita un instante y se sella al entrar.
    await db.update(schema.user).set({ emailVerified: true, twoFactorEnabled: true }).where(eq(schema.user.id, r.user.id));
    userIds.push(r.user.id);
    return { id: r.user.id, email };
  };
  try {
    for (const [name, muscleGroup, kind] of LIB) await db.insert(schema.exercise).values({ name, muscleGroup, kind }).onConflictDoNothing();
    const lib = new Map((await db.select().from(schema.exercise).where(inArray(schema.exercise.name, LIB.map((l) => l[0])))).filter((e) => !e.orgId).map((e) => [e.name, e.id]));
    const ex = (name: string, sets: number, reps: string, rir: number, restSec: number) => ({ exerciseId: lib.get(name)!, name, sets, reps, rir, restSec });

    const owner = await person("martin.sosa", "Martín Sosa");
    const floor = await person("sofia.ramirez", "Sofía Ramírez");
    const coach = await person("agustin.perez", "Agustín Pérez");
    const vale = await person("valentina.gomez", "Valentina Gómez");
    const julian = await person("julian.ortiz", "Julián Ortiz");
    const martina = await person("martina.lopez", "Martina López");
    const camila = await person("camila.ruiz", "Camila Ruiz");

    // ── Gimnasio ──
    const [gym] = await db.insert(schema.organization).values({ kind: "gym", name: "Gym Norte", isDemo: true, status: "active", commercialStatus: "enabled", createdBy: owner.id }).returning();
    orgIds.push(gym.id);
    const [palermo] = await db.insert(schema.gymLocation).values({ orgId: gym.id, name: "Palermo", address: "Av. Santa Fe 3200", receptionHours: "Lun a vie 7 a 23 · sáb 9 a 14" }).returning();
    const [belgrano] = await db.insert(schema.gymLocation).values({ orgId: gym.id, name: "Belgrano", address: "Cabildo 2100" }).returning();
    await db.insert(schema.staffMembership).values([
      { userId: owner.id, orgId: gym.id, role: "owner" },
      { userId: floor.id, orgId: gym.id, locationId: palermo.id, role: "floor_trainer" },
    ]);
    const members: Record<string, string> = {};
    for (const u of [vale, julian, martina]) {
      const [m] = await db.insert(schema.gymMember).values({ orgId: gym.id, locationId: palermo.id, userId: u.id, status: "active" }).returning();
      await db.insert(schema.consentGrant).values({ userId: u.id, scope: "gym_member", relationId: m.id, granteeOrgId: gym.id, item: "attendance_training", termsVersion: "demo" });
      members[u.id] = m.id;
    }
    await startShift(floor.id, gym.id, palermo.id, now);
    await saveMemberProgram(floor.id, gym.id, members[julian.id], { reason: "Programa inicial", doc: { name: "Base sala · 3 días", weeks: 6, note: "Técnica primero.", days: [
      { name: "Día A", exercises: [ex("Sentadilla", 3, "8-10", 2, 120), ex("Press de banca", 3, "8-10", 2, 120)] },
      { name: "Día B", exercises: [ex("Peso muerto rumano", 3, "8", 2, 120), ex("Jalón al pecho", 3, "10", 2, 90)] },
    ] } });
    // Julián entrena ahora y pide atención al piso desde la app (aviso en vivo real).
    const jt = await myTraining(julian.id, now);
    if (jt.state === "ready") {
      const sid = randomUUID();
      await startSession(julian.id, { id: sid, dayId: jt.program.days[0].id }, now);
      const s = await getSession(julian.id, sid, now);
      await logSet(julian.id, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 60, reps: 10, rir: 2, feel: "bien" }, now);
      await logSet(julian.id, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 1, weightKg: 62.5, reps: 8, rir: 1, feel: "ayuda" }, now);
    }
    // Camila escaneó el QR de Palermo y espera aprobación.
    const { slug } = await regenerateJoinLink(owner.id, gym.id, palermo.id);
    await regenerateJoinLink(owner.id, gym.id, belgrano.id);
    await requestAccess(camila.id, slug, { terms: true });
    let n = 1040;
    for (const [m, category, priority, source, summary] of [
      [vale, "actualizar_programa", "alta", "app", "Quiere pasar de 3 a 4 días por semana."],
      [martina, "onboarding", "alta", "recepcion", "Primera visita hoy 10:00: recorrido y programa inicial."],
      [julian, "tecnica", "media", "sala", "Revisar técnica de peso muerto rumano."],
    ] as const) {
      await db.insert(schema.gymTask).values({ number: ++n, orgId: gym.id, locationId: palermo.id, gymMemberId: members[m.id], category, priority, source, summary, createdBy: owner.id });
    }
    await db.insert(schema.communityPost).values([
      { orgId: gym.id, locationId: palermo.id, type: "novedad", title: "Nueva zona de peso libre", text: "Sumamos 2 racks y mancuernas hasta 50 kg en planta alta.", createdBy: owner.id },
      { orgId: gym.id, locationId: palermo.id, type: "descuento", title: "20% off en proteína whey", text: "Mostrando la app en recepción.", badge: "20% OFF", validUntil: day(30, now), createdBy: owner.id },
      { orgId: gym.id, locationId: palermo.id, type: "novedad", title: "Clase abierta de movilidad", text: "Sábado 10:00 en el salón 2, con Sofía.", createdBy: owner.id },
    ]);
    await db.insert(schema.challenge).values([
      { orgId: gym.id, locationId: palermo.id, title: "Dominadas máximas", unit: "reps", category: "fuerza", rule: "Una serie, agarre prono, mentón sobre la barra.", prize: "Shaker + 1 batido", endsOn: day(30, now), createdBy: owner.id },
      { orgId: gym.id, locationId: palermo.id, title: "Plancha más larga", unit: "seg", category: "resistencia", rule: "Antebrazos y puntas de pie, cuerpo alineado.", prize: "Remera Gym Norte", endsOn: day(45, now), createdBy: owner.id },
    ]);

    // ── Personal trainer ──
    const [coachOrg] = await db.insert(schema.organization).values({ kind: "coach", name: "Agustín Pérez Coach", specialty: "Fuerza · Hipertrofia", modality: "Presencial y online", isDemo: true, status: "active", commercialStatus: "enabled", createdBy: coach.id }).returning();
    orgIds.push(coachOrg.id);
    await db.insert(schema.staffMembership).values({ userId: coach.id, orgId: coachOrg.id, role: "coach_owner" });
    const rels: Record<string, string> = {};
    for (const u of [vale, julian, martina]) {
      const [rel] = await db.insert(schema.coachClient).values({ coachOrgId: coachOrg.id, userId: u.id }).returning();
      await db.insert(schema.consentGrant).values({ userId: u.id, scope: "coach_client", relationId: rel.id, granteeOrgId: coachOrg.id, item: "training", termsVersion: "demo" });
      rels[u.id] = rel.id;
    }
    const hip = await createTemplate(coach.id, coachOrg.id, { name: "Hipertrofia · 3 días", weeks: 6, note: "Semana de carga: RIR 2 en la última serie.", days: [
      { name: "Torso A", exercises: [ex("Press de banca", 4, "8-10", 2, 120), ex("Remo con barra", 4, "8-10", 2, 120), ex("Press militar", 3, "8-12", 2, 90), ex("Elevaciones laterales", 3, "12-15", 1, 60)] },
      { name: "Piernas", exercises: [ex("Sentadilla", 4, "6-8", 2, 150), ex("Peso muerto rumano", 3, "8-10", 2, 120), ex("Prensa", 3, "10-12", 2, 90), ex("Hip thrust", 3, "10", 2, 90)] },
      { name: "Torso B", exercises: [ex("Jalón al pecho", 4, "10", 2, 120), ex("Press inclinado mancuernas", 3, "10", 2, 120), ex("Remo en polea", 3, "12", 2, 90), ex("Fondos en paralelas", 3, "8-10", 1, 90)] },
    ] });
    await createTemplate(coach.id, coachOrg.id, { name: "Fuerza base · 2 días", weeks: 8, note: "Subí 2,5 kg por semana si completás todas las series.", days: [
      { name: "Día A", exercises: [ex("Sentadilla", 5, "5", 2, 180), ex("Press de banca", 5, "5", 2, 180)] },
      { name: "Día B", exercises: [ex("Peso muerto rumano", 3, "5", 2, 180), ex("Press militar", 5, "5", 2, 150)] },
    ] });
    await assignProgram(coach.id, coachOrg.id, hip, { coachClientIds: [rels[vale.id], rels[martina.id]], startsOn: localDate(now) });
    // Historial: dos semanas de entrenamientos de Valentina y algunos de Martina, con progresión de cargas.
    await history(vale.id, rels[vale.id], 6, now, 1);
    await history(martina.id, rels[martina.id], 2, now, 0.8);
    await createRequest(martina.id, { kind: "tecnica", text: "¿Me revisás la sentadilla? Siento la espalda baja al bajar." });
    const threads = await myThreads(vale.id);
    const conv = threads.find((t) => t.kind === "coach_client");
    if (conv) {
      await sendMessage(vale.id, conv.id, { id: randomUUID(), body: "¡Hola Agus! Hoy subí a 62,5 en press de banca 💪" });
      await sendMessage(coach.id, conv.id, { id: randomUUID(), body: "¡Bien ahí! La semana que viene probamos 65 en la última serie." });
    }
    const paid = await createCharge(coach.id, coachOrg.id, { coachClientId: rels[vale.id], concept: "Plan mensual · mes anterior", amountMinor: 3_500_000, currency: "ARS", dueOn: day(-25, now) });
    await registerPayment(coach.id, coachOrg.id, paid.id, { paidOn: day(-26, now), method: "transferencia" });
    await createCharge(coach.id, coachOrg.id, { coachClientId: rels[vale.id], concept: "Plan mensual · este mes", amountMinor: 3_500_000, currency: "ARS", dueOn: day(5, now) });
    await createCharge(coach.id, coachOrg.id, { coachClientId: rels[julian.id], concept: "Plan mensual · este mes", amountMinor: 3_000_000, currency: "ARS", dueOn: day(-3, now) });
  } finally {
    await db.update(schema.demoSandbox).set({ userIds, orgIds }).where(eq(schema.demoSandbox.id, box.id));
  }
  await db.update(schema.user).set({ twoFactorEnabled: false }).where(eq(schema.user.email, `${who}@${sandboxDomain(tag)}`));
  const href = role === "owner" ? `/gym/${orgIds[0]}?s=exec` : role === "floor" ? `/gym/${orgIds[0]}?s=shift` : role === "coach" ? `/coach/${orgIds[1]}?s=dash` : "/app";
  return { href, role, tag, signIn: { email: `${who}@${sandboxDomain(tag)}`, password: pw }, expiresAt: new Date(now.getTime() + SANDBOX_TTL_HOURS * 3_600_000).toISOString() };
}

/**
 * Después de abrir la sesión de la demo se marca la 2FA como configurada sin ningún factor real: nadie puede volver a
 * entrar a esas cuentas con la contraseña, aunque para las cuentas reales la 2FA ya es optativa (D119).
 */
export async function sealDemo(tag: string) {
  const [b] = await db.select().from(schema.demoSandbox).where(eq(schema.demoSandbox.tag, tag));
  if (b) await db.update(schema.user).set({ twoFactorEnabled: true }).where(inArray(schema.user.id, b.userIds as string[]));
}

async function history(userId: string, relId: string, count: number, now: Date, strength: number) {
  const [a] = await db.select().from(schema.programAssignment).where(and(eq(schema.programAssignment.coachClientId, relId), eq(schema.programAssignment.status, "active")));
  const [p] = await db.select().from(schema.program).where(eq(schema.program.id, a.programId));
  const days = await db.select().from(schema.programDay).where(eq(schema.programDay.versionId, p.currentVersionId!)).orderBy(asc(schema.programDay.position));
  const exs = await db.select().from(schema.programExercise).where(inArray(schema.programExercise.dayId, days.map((d) => d.id))).orderBy(asc(schema.programExercise.position));
  const base: Record<string, number> = { "Press de banca": 50, "Remo con barra": 45, "Press militar": 30, "Elevaciones laterales": 8, Sentadilla: 70, "Peso muerto rumano": 60, Prensa: 120, "Hip thrust": 80, "Jalón al pecho": 45, "Press inclinado mancuernas": 18, "Remo en polea": 40 };
  for (let i = 0; i < count; i++) {
    const d = days[i % days.length];
    const ago = (count - i) * 2 + 1;
    const start = new Date(now.getTime() - ago * 86_400_000 - 3 * 3_600_000);
    const end = new Date(start.getTime() + 55 * 60_000);
    const sid = randomUUID();
    await db.insert(schema.workoutSession).values({
      id: sid, userId, coachClientId: relId, assignmentId: a.id, versionId: p.currentVersionId!, dayId: d.id, dayName: d.name, status: "completed",
      startedAt: start, lastResumedAt: null, activeMs: 52 * 60_000, endedAt: end, rpe: 7 + (i % 2), revision: 2, updatedAt: end,
    });
    for (const e of exs.filter((x) => x.dayId === d.id)) {
      const w = base[e.name] == null ? null : Math.round(base[e.name] * strength * (1 + i * 0.02) * 2) / 2;
      for (let k = 0; k < e.sets; k++) {
        await db.insert(schema.setLog).values({ id: randomUUID(), sessionId: sid, programExerciseId: e.id, exerciseId: e.exerciseId, setIndex: k, weightKg: w == null ? null : String(w), reps: 9 - Math.min(k, 2), rir: 2, completedAt: new Date(start.getTime() + (k + 1) * 4 * 60_000), revision: 1, updatedAt: end });
      }
    }
  }
}

/** Borra entornos vencidos: primero las organizaciones (arrastran casi todo), después las personas. */
export async function purgeSandboxes(now = new Date()) {
  const old = await db.select().from(schema.demoSandbox).where(lt(schema.demoSandbox.expiresAt, now)).limit(50);
  for (const b of old) {
    const orgs = (b.orgIds as string[]) ?? [], users = (b.userIds as string[]) ?? [];
    await db.transaction(async (tx) => {
      if (users.length) {
        await tx.delete(schema.workoutSession).where(inArray(schema.workoutSession.userId, users));
        await tx.delete(schema.auditEvent).where(inArray(schema.auditEvent.actorUserId, users));
      }
      if (orgs.length) await tx.delete(schema.organization).where(inArray(schema.organization.id, orgs));
      if (users.length) await tx.delete(schema.user).where(inArray(schema.user.id, users));
      await tx.delete(schema.demoSandbox).where(eq(schema.demoSandbox.id, b.id));
    });
  }
  return old.length;
}

/** ¿La sesión es de una demo? Devuelve el rol para que la app muestre el recorrido guiado. */
export async function demoRoleOf(email: string) {
  const m = /@demo-([a-f0-9]{10})\.invalid$/.exec(email);
  if (!m) return null;
  const tag = m[1];
  const [b] = await db.select({ role: schema.demoSandbox.role, expiresAt: schema.demoSandbox.expiresAt }).from(schema.demoSandbox).where(eq(schema.demoSandbox.tag, tag));
  return b ? { role: b.role as DemoRole, expiresAt: b.expiresAt } : null;
}
