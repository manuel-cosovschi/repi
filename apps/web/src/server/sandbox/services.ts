// Demo guiada para vender REPI (pedido del usuario 27/10, D85). Cada visita crea su propio entorno aislado: un gimnasio
// y un coach ficticios con datos realistas, armados con los mismos servicios de la app (programas, turnos, solicitudes,
// series, avisos al piso, cobros). Nada se comparte entre visitantes ni toca clientes reales; todo es is_demo y se borra
// a las 6 horas. Los emails usan el dominio reservado .invalid: el adaptador de correo nunca los envía.
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { localDate } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "../auth";
import { AccessError } from "../access/util";
import { logError } from "../log";
import { assignProgram, createTemplate, logSet, startSession, myTraining, getSession } from "../training/services";
import { saveMemberProgram, startShift } from "../gym/services";
import { memberCreate, setAvailability, staffAct } from "../gym/connect";
import { issueQrToken, policyOf, staffCheckin } from "../gym/access-control";
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
  const userIds: string[] = [], orgIds: string[] = [], extraOrgs: string[] = [];
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
    const lucas = await person("lucas.medina", "Lucas Medina"); // segundo profesor de sala: continuidad entre turnos (REPI Connect)
    const coach = await person("agustin.perez", "Agustín Pérez");
    const vale = await person("valentina.gomez", "Valentina Gómez");
    const julian = await person("julian.ortiz", "Julián Ortiz");
    const martina = await person("martina.lopez", "Martina López");
    const camila = await person("camila.ruiz", "Camila Ruiz");

    // ── Gimnasio ──
    const [gym] = await db.insert(schema.organization).values({ kind: "gym", name: "Gym Norte", isDemo: true, status: "active", commercialStatus: "enabled", connectEnabled: true, createdBy: owner.id }).returning();
    orgIds.push(gym.id);
    const [palermo] = await db.insert(schema.gymLocation).values({ orgId: gym.id, name: "Palermo", address: "Av. Santa Fe 3200", receptionHours: "Lun a vie 6 a 22 · sáb 9 a 14" }).returning();
    const [belgrano] = await db.insert(schema.gymLocation).values({ orgId: gym.id, name: "Belgrano", address: "Cabildo 2100" }).returning();
    await db.insert(schema.staffMembership).values([
      { userId: owner.id, orgId: gym.id, role: "owner" },
      { userId: floor.id, orgId: gym.id, locationId: palermo.id, role: "floor_trainer" },
      { userId: lucas.id, orgId: gym.id, locationId: palermo.id, role: "floor_trainer" },
    ]);
    const members: Record<string, string> = {};
    for (const u of [vale, julian, martina]) {
      const [m] = await db.insert(schema.gymMember).values({ orgId: gym.id, locationId: palermo.id, userId: u.id, status: "active" }).returning();
      await db.insert(schema.consentGrant).values({ userId: u.id, scope: "gym_member", relationId: m.id, granteeOrgId: gym.id, item: "attendance_training", termsVersion: "demo" });
      members[u.id] = m.id;
    }
    await startShift(floor.id, gym.id, palermo.id, now);
    // Control de acceso (D127): Gym Norte en modo HÍBRIDO, sede Palermo con punto y radio; Gym Sur es otra organización independiente.
    await db.insert(schema.gymAccessPolicy).values({ orgId: gym.id, enabled: true, mode: "hybrid", updatedBy: owner.id });
    await db.update(schema.gymLocation).set({ lat: -34.5889, lng: -58.4108, geoRadiusM: 150 }).where(eq(schema.gymLocation.id, palermo.id));
    const [sur] = await db.insert(schema.organization).values({ kind: "gym", name: "Gym Sur (otra organización)", isDemo: true, status: "active", commercialStatus: "enabled", createdBy: owner.id }).returning();
    await db.insert(schema.gymLocation).values({ orgId: sur.id, name: "Centro", address: "Av. Rivadavia 5000" });
    await db.insert(schema.gymAccessPolicy).values({ orgId: sur.id, enabled: true, mode: "hybrid" });
    extraOrgs.push(sur.id);
    await saveMemberProgram(floor.id, gym.id, members[julian.id], { reason: "Programa inicial", doc: { name: "Base sala · 3 días", weeks: 6, note: "Técnica primero.", days: [
      { name: "Día A", exercises: [ex("Sentadilla", 3, "8-10", 2, 120), ex("Press de banca", 3, "8-10", 2, 120)] },
      { name: "Día B", exercises: [ex("Peso muerto rumano", 3, "8", 2, 120), ex("Jalón al pecho", 3, "10", 2, 90)] },
    ] } });
    // Julián validó su ingreso en recepción (pase presencial) y entrena ahora; pide atención al piso desde la app (aviso en vivo real).
    await staffCheckin(floor.id, gym.id, { gymMemberId: members[julian.id], locationId: palermo.id, note: "Validado en sala (demo)" }, new Date(now.getTime() - 20 * 60_000));
    // Valentina también tiene programa del gym: desde casa ve su rutina; para entrenarla en el gimnasio valida el ingreso.
    await saveMemberProgram(floor.id, gym.id, members[vale.id], { reason: "Programa de sala", doc: { name: "Sala · full body", weeks: 4, note: "Entrada en calor de 10 minutos.", days: [
      { name: "Full body", exercises: [ex("Sentadilla", 3, "10", 2, 90), ex("Jalón al pecho", 3, "10", 2, 90), ex("Press inclinado mancuernas", 3, "10", 2, 90)] },
    ] } });
    await accessHistory(gym.id, palermo.id, [members[vale.id], members[julian.id], members[martina.id]], [vale.id, julian.id, martina.id], floor.id, camila.id, now);
    const jt = await myTraining(julian.id, now);
    if (jt.state === "ready") {
      const sid = randomUUID();
      await startSession(julian.id, { id: sid, dayId: jt.program.days[0].id }, now);
      const s = await getSession(julian.id, sid, now);
      await logSet(julian.id, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 0, weightKg: 60, reps: 10, rir: 2, feel: "bien" }, now);
      await logSet(julian.id, sid, { id: randomUUID(), programExerciseId: s.exercises[0].id, setIndex: 1, weightKg: 62.5, reps: 8, rir: 1, feel: "ayuda" }, now);
    }
    // REPI Connect (D126): historial sintético de las últimas semanas (para el tablero del dueño) y casos vivos.
    await connectHistory(gym.id, palermo.id, [members[vale.id], members[julian.id], members[martina.id]], [floor.id, lucas.id], 1100, now);
    if (jt.state === "ready") {
      const s = (await myTraining(julian.id, now));
      const open = s.state === "ready" ? s.openSession : null;
      const sess = open ? await getSession(julian.id, open, now) : null;
      if (sess) await memberCreate(julian.id, { reason: "ejercicio", comment: "¿Me mirás la bajada? Siento que pierdo la espalda.", context: { sessionId: sess.id, programExerciseId: sess.exercises[0].id, setIndex: 1 } }, now);
    }
    // Lucas atendió a Martina en el turno mañana y le deja a Sofía la continuidad (traspaso por aceptar).
    await startShift(lucas.id, gym.id, palermo.id, new Date(now.getTime() - 4 * 3_600_000));
    const mt = await memberCreate(martina.id, { reason: "revisar_rutina", comment: "Quiero sumar un día de piernas." }, new Date(now.getTime() - 3 * 3_600_000));
    await staffAct(lucas.id, gym.id, mt.id, "take", {}, new Date(now.getTime() - 170 * 60_000));
    await staffAct(lucas.id, gym.id, mt.id, "start", {}, new Date(now.getTime() - 160 * 60_000));
    await staffAct(lucas.id, gym.id, mt.id, "note", { note: "Probamos sentadilla búlgara y prensa: las tolera bien." }, new Date(now.getTime() - 150 * 60_000));
    await staffAct(lucas.id, gym.id, mt.id, "transfer", { toUserId: floor.id, done: "Probamos búlgara y prensa", pending: "Armar el día D en su programa", next: "Cargar el día D y mostrárselo cuando venga" }, new Date(now.getTime() - 140 * 60_000));
    await setAvailability(lucas.id, gym.id, "busy");
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
    await db.insert(schema.userPref).values({ userId: vale.id, activeRelationId: rels[vale.id] }).onConflictDoNothing(); // la demo de socio arranca con su coach
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
    await db.update(schema.demoSandbox).set({ userIds, orgIds: [...orgIds, ...extraOrgs] }).where(eq(schema.demoSandbox.id, box.id));
  }
  await db.update(schema.user).set({ twoFactorEnabled: false }).where(eq(schema.user.email, `${who}@${sandboxDomain(tag)}`));
  const href = role === "owner" ? `/gym/${orgIds[0]}?s=exec` : role === "floor" ? `/gym/${orgIds[0]}?s=shift` : role === "coach" ? `/coach/${orgIds[1]}?s=dash` : "/app";
  return { href, role, tag, signIn: { email: `${who}@${sandboxDomain(tag)}`, password: pw }, expiresAt: new Date(now.getTime() + SANDBOX_TTL_HOURS * 3_600_000).toISOString() };
}

/** Ingresos de la última semana (datos sintéticos de la demo) para el panel «Acceso y presencia». */
async function accessHistory(orgId: string, locationId: string, memberIds: string[], userIds: string[], staffId: string, outsider: string, now: Date) {
  const rows: (typeof schema.gymCheckin.$inferInsert)[] = [];
  for (let d = 1; d <= 6; d++) {
    for (let i = 0; i < memberIds.length; i++) {
      if ((d + i) % 3 === 0) continue;
      const at = new Date(now.getTime() - d * 86_400_000 - (8 + i * 3) * 3_600_000);
      const method = (d + i) % 5 === 0 ? "staff" : (d + i) % 4 === 0 ? "qr_geo" : "qr";
      rows.push({ orgId, locationId, userId: userIds[i], gymMemberId: memberIds[i], method, result: "ok", issuedAt: at, expiresAt: new Date(at.getTime() + 3 * 3_600_000), createdAt: at,
        verifiedBy: method === "staff" ? staffId : null, note: method === "staff" ? "Sin batería en el teléfono (demo)" : null, geoResult: method === "qr_geo" ? "inside" : null });
    }
  }
  const denied = (d: number, reason: string, userId: string, gymMemberId: string | null) => ({ orgId, locationId, userId, gymMemberId, method: "qr" as const, result: "denied" as const, reason, createdAt: new Date(now.getTime() - d * 86_400_000) });
  rows.push(denied(1, "expired_token", userIds[0], memberIds[0]), denied(3, "expired_token", userIds[1], memberIds[1]), denied(2, "no_membership", outsider, null));
  await db.insert(schema.gymCheckin).values(rows);
}

/**
 * Demo (D127): QR real firmado por el servidor para que una sola persona pueda recorrer el check-in sin otra pantalla.
 * Sólo para cuentas de la demo y gimnasios de su propia demo; «other» es el gimnasio independiente (para ver el rechazo).
 */
export async function demoQr(userId: string, which: "own" | "other", now = new Date()) {
  const boxes = await db.select().from(schema.demoSandbox).where(sql`${schema.demoSandbox.userIds} @> ${JSON.stringify([userId])}::jsonb`).limit(1);
  const b = boxes[0];
  if (!b) throw new AccessError("not_found", "No encontramos lo que buscás.", 404);
  const orgs = b.orgIds as string[];
  const orgId = which === "own" ? orgs[0] : orgs[2];
  const [org] = orgId ? await db.select().from(schema.organization).where(and(eq(schema.organization.id, orgId), eq(schema.organization.isDemo, true))) : [];
  if (!org) throw new AccessError("not_found", "No encontramos lo que buscás.", 404);
  const [loc] = await db.select().from(schema.gymLocation).where(eq(schema.gymLocation.orgId, org.id)).orderBy(asc(schema.gymLocation.createdAt)).limit(1);
  const t = issueQrToken(org.id, loc.id, (await policyOf(org.id)).qrTtlSec, "demo", now);
  return { ...t, gym: org.name, location: loc.name };
}

/**
 * Pedidos de REPI Connect ya cerrados en las últimas semanas, con su historial, para que el tablero del dueño muestre
 * números. Son datos sintéticos de la demo (organización is_demo): nunca se presentan como actividad de un gimnasio real.
 */
async function connectHistory(orgId: string, locationId: string, memberIds: string[], staff: string[], startNumber: number, now: Date) {
  const plan: [number, string, number, number, "yes" | "no" | null, boolean][] = [
    // [días atrás, motivo, minutos hasta tomarlo, minutos hasta resolver, opinión, hubo traspaso]
    [1, "ejercicio", 4, 18, "yes", false], [2, "actualizar_pesos", 9, 25, null, false], [3, "revisar_rutina", 22, 1500, "yes", true], [4, "ejercicio", 6, 15, "yes", false],
    [6, "cambiar_ejercicio", 12, 40, null, false], [8, "duda", 3, 10, "no", false], [9, "rutina_nueva", 30, 2900, "yes", true], [11, "ejercicio", 5, 20, null, false],
    [13, "hablar", 15, 35, "yes", false], [15, "actualizar_pesos", 8, 22, null, false], [17, "revisar_rutina", 25, 1400, "yes", true], [19, "ejercicio", 7, 16, "yes", false],
  ];
  const cat: Record<string, "tecnica" | "actualizar_programa" | "consulta" | "programa_nuevo"> = {
    ejercicio: "tecnica", actualizar_pesos: "actualizar_programa", revisar_rutina: "actualizar_programa", cambiar_ejercicio: "actualizar_programa", duda: "consulta", rutina_nueva: "programa_nuevo", hablar: "consulta",
  };
  let n = startNumber;
  for (const [i, [ago, reason, take, solve, fb, handoff]] of plan.entries()) {
    const created = new Date(now.getTime() - ago * 86_400_000 - (i % 3) * 3_600_000);
    const at = (min: number) => new Date(created.getTime() + min * 60_000);
    const a = staff[i % staff.length], b = staff[(i + 1) % staff.length];
    const by = handoff ? b : a;
    const [t] = await db.insert(schema.gymTask).values({
      number: ++n, orgId, locationId, gymMemberId: memberIds[i % memberIds.length], category: cat[reason], priority: reason === "rutina_nueva" ? "alta" : "media", status: "done", source: "app",
      summary: "Pedido de ejemplo (demo)", reason, createdBy: staff[0], createdAt: created, takenAt: at(take), takenBy: a, startedAt: at(take + 1), completedAt: at(solve), completedBy: by,
      feedback: fb, feedbackAt: fb ? at(solve + 60) : null, seenByMemberAt: at(solve + 60),
    }).returning();
    const ev = (kind: (typeof schema.gymTaskEvent.$inferInsert)["kind"], actor: string | null, min: number, extra: Partial<typeof schema.gymTaskEvent.$inferInsert> = {}) =>
      db.insert(schema.gymTaskEvent).values({ taskId: t.id, orgId, actorUserId: actor, kind, createdAt: at(min), ...extra });
    await ev("created", null, 0, { toStatus: "open" });
    await ev("taken", a, take, { fromStatus: "open", toStatus: "open" });
    await ev("started", a, take + 1, { fromStatus: "open", toStatus: "in_progress" });
    if (handoff) {
      await ev("transferred", a, take + 20, { toUserId: b, note: "Hecho: primera revisión · Pendiente: ajustar programa (demo)" });
      await ev("accepted", b, solve - 30, { fromStatus: "pending_acceptance", toStatus: "open" });
    }
    await ev("resolved", by, solve, { fromStatus: "in_progress", toStatus: "done", note: "Atención registrada (demo)" });
    if (fb) await ev("feedback", null, solve + 60, { note: fb });
  }
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
  let purged = 0;
  for (const b of old) {
    const orgs = (b.orgIds as string[]) ?? [], users = (b.userIds as string[]) ?? [];
    try {
      await db.transaction(async (tx) => {
        if (users.length) {
          await tx.delete(schema.workoutSession).where(inArray(schema.workoutSession.userId, users));
          await tx.delete(schema.auditEvent).where(inArray(schema.auditEvent.actorUserId, users));
        }
        if (orgs.length) {
          // Auditoría 30/10: programas y alumnos antes que la organización. En un solo DELETE en cascada Postgres puede chequear
          // program_exercise → exercise (un ejercicio propio de la demo usado en un programa) antes de borrar el programa, y falla.
          await tx.delete(schema.program).where(inArray(schema.program.orgId, orgs));
          await tx.delete(schema.coachClient).where(inArray(schema.coachClient.coachOrgId, orgs));
          await tx.delete(schema.organization).where(inArray(schema.organization.id, orgs));
        }
        if (users.length) await tx.delete(schema.user).where(inArray(schema.user.id, users));
        await tx.delete(schema.demoSandbox).where(eq(schema.demoSandbox.id, b.id));
      });
      purged++;
    } catch (e) {
      // Una demo que no se puede borrar no frena a las demás ni al resto del job de cada minuto.
      logError("sandbox.purge", e);
    }
  }
  return purged;
}

/** ¿La sesión es de una demo? Devuelve el rol para que la app muestre el recorrido guiado. */
export async function demoRoleOf(email: string) {
  const m = /@demo-([a-f0-9]{10})\.invalid$/.exec(email);
  if (!m) return null;
  const tag = m[1];
  const [b] = await db.select({ role: schema.demoSandbox.role, expiresAt: schema.demoSandbox.expiresAt }).from(schema.demoSandbox).where(eq(schema.demoSandbox.tag, tag));
  return b ? { role: b.role as DemoRole, expiresAt: b.expiresAt } : null;
}
