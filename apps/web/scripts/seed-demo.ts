// Datos DEMO ficticios para recorrer REPI Acceso (nombres del prototipo). Idempotente.
// Uso: pnpm db:seed. Nunca correr contra producción: todas las organizaciones quedan con is_demo = true.
// Credenciales de prueba (sólo entorno local): ver DEMO_PASSWORD abajo.
import { and, eq } from "drizzle-orm";
import { db, schema, sqlClient } from "@/db";
import { auth } from "@/server/auth";
import { dniHmac, dniLast3, addDays } from "@/server/access/util";
import { createTemplate } from "@/server/training/services";

if (process.env.NODE_ENV === "production") throw new Error("seed DEMO bloqueado en producción");

const DEMO_PASSWORD = "Demo12345";

async function demoUser(email: string, name: string, extra: Partial<typeof schema.user.$inferInsert> = {}) {
  const [found] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  if (found) return found.id;
  await auth.api.signUpEmail({ body: { name, email, password: DEMO_PASSWORD } });
  const [u] = await db.update(schema.user).set({ emailVerified: true, ...extra }).where(eq(schema.user.email, email)).returning();
  return u.id;
}

async function demoOrg(v: typeof schema.organization.$inferInsert) {
  const [found] = await db.select().from(schema.organization).where(and(eq(schema.organization.name, v.name), eq(schema.organization.isDemo, true)));
  if (found) return found;
  const [o] = await db.insert(schema.organization).values({ ...v, isDemo: true }).returning();
  return o;
}

async function main() {
  const owner = await demoUser("dueno@demo.repi.app", "Martín Sosa");
  const manager = await demoUser("lucia@demo.repi.app", "Lucía Méndez");
  const coach = await demoUser("agustin@demo.repi.app", "Agustín Pérez");
  await demoUser("admin@demo.repi.app", "Admin REPI", { platformRole: "admin" });

  const gym = await demoOrg({ kind: "gym", name: "Gym Norte", status: "trial", trialEndsAt: addDays(new Date(), 30), locationsRange: "2–3", createdBy: owner });
  const locs = [];
  for (const [name, address] of [["Palermo", "Av. Santa Fe 3200"], ["Belgrano", "Cabildo 2100"], ["Caballito", "Rivadavia 5100"]]) {
    let [l] = await db.select().from(schema.gymLocation).where(and(eq(schema.gymLocation.orgId, gym.id), eq(schema.gymLocation.name, name)));
    if (!l) [l] = await db.insert(schema.gymLocation).values({ orgId: gym.id, name, address }).returning();
    locs.push(l);
  }
  await db.insert(schema.staffMembership).values([
    { userId: owner, orgId: gym.id, role: "owner" },
    { userId: manager, orgId: gym.id, locationId: locs[0].id, role: "manager" },
  ]).onConflictDoNothing();
  for (const [dni, fullName, num] of [["35123456", "Valentina García", "004812"], ["30111222", "Julián Ortiz", "003377"]]) {
    await db.insert(schema.rosterEntry).values({ orgId: gym.id, locationId: locs[0].id, dniHmac: dniHmac(dni), dniLast3: dniLast3(dni), fullName, memberNumber: num, source: "demo" }).onConflictDoNothing();
  }

  const coachOrg = await demoOrg({ kind: "coach", name: "Agustín Pérez Coach", specialty: "Fuerza · Hipertrofia", modality: "Online mensual", status: "trial", trialEndsAt: addDays(new Date(), 30), createdBy: coach });
  await db.insert(schema.staffMembership).values({ userId: coach, orgId: coachOrg.id, role: "coach_owner" }).onConflictDoNothing();

  const expiresAt = addDays(new Date(), 30);
  // Anexo 26/10: toda invitación nueva va ligada a un email; sólo la acepta una cuenta verificada con ese email.
  const INVITES = [
    { code: "R7K2QX", kind: "coach_client" as const, orgId: coachOrg.id, invitedBy: coach, expiresAt, email: "alumna@demo.repi.app" },
    { code: "S4M9TA", kind: "gym_staff" as const, orgId: gym.id, locationId: locs[0].id, role: "floor_trainer", invitedBy: manager, expiresAt, email: "piso@demo.repi.app" },
  ];
  await db.insert(schema.invitation).values(INVITES).onConflictDoNothing();
  for (const i of INVITES) await db.update(schema.invitation).set({ email: i.email }).where(and(eq(schema.invitation.code, i.code), eq(schema.invitation.status, "pending")));

  // Estado comercial DEMO (no facturable): el gym habilitado con condiciones de ejemplo; el coach como cliente previo a regularizar.
  const admin = (await db.select().from(schema.user).where(eq(schema.user.email, "admin@demo.repi.app")))[0].id;
  await db.update(schema.organization).set({ commercialStatus: "enabled", status: "active", trialEndsAt: null }).where(eq(schema.organization.id, gym.id));
  await db.update(schema.organization).set({ commercialStatus: "legacy" }).where(eq(schema.organization.id, coachOrg.id));
  let [contract] = await db.select().from(schema.clientContract).where(eq(schema.clientContract.orgId, gym.id));
  if (!contract) {
    [contract] = await db.insert(schema.clientContract).values({
      orgId: gym.id, kind: "gym", legalName: "Gym Norte S.R.L. (DEMO)", responsibleName: "Martín Sosa", responsibleEmail: "dueno@demo.repi.app", currency: "ARS",
      status: "enabled", termsVersion: "demo-1", acceptedMethod: "external", acceptedRef: "DEMO: acuerdo ficticio", acceptedAt: new Date(), acceptedRecordedBy: admin,
      enabledBy: admin, enabledAt: new Date(), setupDoneAt: new Date(), createdBy: admin,
    }).returning();
    const from = `${new Date().toISOString().slice(0, 7)}-01`;
    await db.insert(schema.contractTerm).values([
      { contractId: contract.id, kind: "quantity", version: 1, value: 450, effectiveFrom: from, reason: "DEMO: cantidad de ejemplo", createdBy: admin },
      { contractId: contract.id, kind: "unit_price", version: 1, value: 125000, currency: "ARS", effectiveFrom: from, reason: "DEMO: precio de ejemplo, no es una tarifa de REPI", createdBy: admin },
    ]);
  }
  // QR fijo por sede con enlaces conocidos para recorrer la demo: /unirse/demo-palermo, /unirse/demo-belgrano, /unirse/demo-caballito.
  for (const l of locs) {
    const slug = `demo-${l.name.toLowerCase()}`;
    await db.insert(schema.locationJoinLink).values({ orgId: gym.id, locationId: l.id, slug, createdBy: owner }).onConflictDoNothing();
  }
  // Biblioteca base (nombres del constructor y de App Alumno v4). Sin medios: GAP-11.
  const LIB: [string, string, "load_reps" | "bodyweight" | "time"][] = [
    ["Press de banca", "Pecho", "load_reps"], ["Press inclinado mancuernas", "Pecho", "load_reps"], ["Remo con barra", "Espalda", "load_reps"],
    ["Jalón al pecho", "Espalda", "load_reps"], ["Remo en polea", "Espalda", "load_reps"], ["Press militar", "Hombros", "load_reps"],
    ["Elevaciones laterales", "Hombros", "load_reps"], ["Sentadilla", "Piernas", "load_reps"], ["Peso muerto rumano", "Piernas", "load_reps"],
    ["Prensa", "Piernas", "load_reps"], ["Hip thrust", "Glúteos", "load_reps"], ["Curl femoral", "Piernas", "load_reps"],
    ["Curl con barra", "Brazos", "load_reps"], ["Fondos en paralelas", "Brazos", "bodyweight"], ["Plancha", "Core", "time"],
    ["Gemelos de pie", "Piernas", "load_reps"], ["Sentadilla goblet", "Piernas", "load_reps"], ["Flexiones", "Pecho", "bodyweight"],
  ];
  for (const [name, muscleGroup, kind] of LIB) await db.insert(schema.exercise).values({ name, muscleGroup, kind }).onConflictDoNothing();
  const lib = new Map((await db.select().from(schema.exercise)).map((e) => [e.name, e.id]));
  const rest = (t: string) => { const [m, s2] = t.split(":").map(Number); return m * 60 + s2; };
  const ex = (name: string, sets: number, reps: string, rir: number, r: string) => ({ exerciseId: lib.get(name)!, name, sets, reps, rir, restSec: rest(r) });
  const existing = await db.select().from(schema.program).where(eq(schema.program.orgId, coachOrg.id));
  if (!existing.length) {
    // Plantillas PG0 de REPI Desktop Coach.dc.html.
    await createTemplate(coach, coachOrg.id, { name: "Hipertrofia · 4 días", weeks: 6, note: "Semana de carga: RIR 2 en la última serie.", days: [
      { name: "Torso A", exercises: [ex("Press de banca", 4, "8-10", 2, "2:00"), ex("Remo con barra", 4, "8-10", 2, "2:00"), ex("Press militar", 3, "8-12", 2, "1:30"), ex("Elevaciones laterales", 3, "12-15", 1, "1:00")] },
      { name: "Piernas", exercises: [ex("Sentadilla", 4, "6-8", 2, "2:30"), ex("Peso muerto rumano", 3, "8-10", 2, "2:00"), ex("Prensa", 3, "10-12", 2, "1:30"), ex("Hip thrust", 3, "10", 2, "1:30")] },
      { name: "Torso B", exercises: [ex("Jalón al pecho", 4, "10", 2, "2:00"), ex("Press inclinado mancuernas", 3, "10", 2, "2:00"), ex("Remo en polea", 3, "12", 2, "1:30"), ex("Fondos en paralelas", 3, "8-10", 1, "1:30")] },
    ] });
    await createTemplate(coach, coachOrg.id, { name: "Fuerza base · 3 días", weeks: 8, note: "Priorizá técnica. Subí 2,5 kg por semana si completás todas las series.", days: [
      { name: "Día A", exercises: [ex("Sentadilla", 5, "5", 2, "3:00"), ex("Press de banca", 5, "5", 2, "3:00")] },
      { name: "Día B", exercises: [ex("Peso muerto rumano", 3, "5", 2, "3:00"), ex("Press militar", 5, "5", 2, "2:30")] },
    ] });
    await createTemplate(coach, coachOrg.id, { name: "Recomposición · 3 días", weeks: 6, note: "Mantené 8.000 pasos diarios.", days: [
      { name: "Full body A", exercises: [ex("Sentadilla", 3, "10", 2, "1:30"), ex("Remo con barra", 3, "10", 2, "1:30"), ex("Plancha", 3, "40 s", 0, "0:45")] },
    ] });
  }
  // Clienta DEMO con relación aceptada (grant fijo de entrenamientos), sin programa asignado.
  const vale = await demoUser("valentina@demo.repi.app", "Valentina Gómez", { birthDate: "1996-04-12" });
  const [rel] = await db.insert(schema.coachClient).values({ coachOrgId: coachOrg.id, userId: vale }).onConflictDoNothing().returning();
  if (rel) await db.insert(schema.consentGrant).values({ userId: vale, scope: "coach_client", relationId: rel.id, granteeOrgId: coachOrg.id, item: "training", termsVersion: "v2026.05-borrador" });

  // ── Etapa 5: operación del gym (personas del prototipo REPI Desktop Gym; sin reseñas ni métricas fabricadas) ──
  const palermo = locs[0];
  const sofia = await demoUser("sofia@demo.repi.app", "Sofía Ramírez");
  const diego = await demoUser("diego@demo.repi.app", "Diego Fernández");
  const recep = await demoUser("recepcion@demo.repi.app", "Recepción Palermo");
  await db.insert(schema.staffMembership).values([
    { userId: coach, orgId: gym.id, locationId: palermo.id, role: "floor_trainer" }, // Agustín: coach independiente y entrenador de sala
    { userId: sofia, orgId: gym.id, locationId: palermo.id, role: "floor_trainer" },
    { userId: diego, orgId: gym.id, locationId: palermo.id, role: "floor_trainer" },
    { userId: recep, orgId: gym.id, locationId: palermo.id, role: "reception" },
  ]).onConflictDoNothing();
  const members: [string, string][] = [["valentina@demo.repi.app", "Valentina Gómez"], ["julian@demo.repi.app", "Julián Ortiz"], ["martina@demo.repi.app", "Martina López"]];
  const mids: Record<string, string> = {};
  for (const [email, name] of members) {
    const u = await demoUser(email, name);
    let [m] = await db.select().from(schema.gymMember).where(and(eq(schema.gymMember.orgId, gym.id), eq(schema.gymMember.userId, u)));
    if (!m) {
      [m] = await db.insert(schema.gymMember).values({ orgId: gym.id, locationId: palermo.id, userId: u, status: "active" }).returning();
      await db.insert(schema.consentGrant).values({ userId: u, scope: "gym_member", relationId: m.id, granteeOrgId: gym.id, item: "attendance_training", termsVersion: "v2026.05-borrador" });
    }
    mids[name] = m.id;
  }
  // Grilla de la semana actual (códigos del prototipo SHIFTS0).
  const { weekOf } = await import("@repi/domain");
  const week = weekOf(new Date());
  const plan: [string, (string | null)[]][] = [[coach, ["M", "M", "M", "M", "M", null, null]], [sofia, ["T", "T", "T", "T", "T", null, null]], [diego, ["N", "N", "N", "N", null, null, null]]];
  for (const [u, codes] of plan) for (const [i, c] of codes.entries()) {
    if (c) await db.insert(schema.shiftPlan).values({ orgId: gym.id, locationId: palermo.id, userId: u, date: week[i], code: c as "M", createdBy: manager }).onConflictDoNothing();
  }
  const [anyTask] = await db.select().from(schema.gymTask).where(eq(schema.gymTask.orgId, gym.id)).limit(1);
  if (!anyTask) {
    const T = [
      { gm: "Valentina Gómez", category: "actualizar_programa", priority: "alta", source: "app", summary: "Quiere pasar de 3 a 4 días por semana.", by: "valentina" },
      { gm: "Julián Ortiz", category: "tecnica", priority: "media", source: "sala", summary: "Revisar técnica de peso muerto rumano.", by: "manager" },
      { gm: "Martina López", category: "onboarding", priority: "alta", source: "recepcion", summary: "Primera visita hoy 10:00: recorrido y programa inicial.", by: "recep" },
    ] as const;
    let n = 1040;
    for (const t of T) {
      const createdBy = t.by === "manager" ? manager : t.by === "recep" ? recep : (await db.select().from(schema.gymMember).where(eq(schema.gymMember.id, mids[t.gm])))[0].userId;
      await db.insert(schema.gymTask).values({ number: ++n, orgId: gym.id, locationId: palermo.id, gymMemberId: mids[t.gm], category: t.category, priority: t.priority, source: t.source, summary: t.summary, createdBy });
    }
  }

  // ── Etapa 6: comunidad (textos de repi-shared.js SEED). Sin récords, participantes ni rankings inventados. ──
  const [anyPost] = await db.select().from(schema.communityPost).where(eq(schema.communityPost.orgId, gym.id)).limit(1);
  if (!anyPost) {
    const plus = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    await db.insert(schema.communityPost).values([
      { orgId: gym.id, locationId: palermo.id, type: "novedad", title: "Nueva zona de peso libre", text: "Desde el lunes sumamos 2 racks y mancuernas hasta 50 kg en planta alta.", createdBy: manager },
      { orgId: gym.id, locationId: palermo.id, type: "descuento", title: "20% off en proteína whey", text: "Mostrando la app en recepción.", badge: "20% OFF", validUntil: plus(30), createdBy: manager },
      { orgId: gym.id, locationId: palermo.id, type: "novedad", title: "Clase abierta de movilidad", text: "Sábado 10:00 en el salón 2, con Sofía. Cupo libre.", createdBy: manager },
    ]);
    await db.insert(schema.challenge).values([
      { orgId: gym.id, locationId: palermo.id, title: "Dominadas máximas", unit: "reps", category: "fuerza", rule: "Una serie, agarre prono, mentón sobre la barra, sin balanceo.", prize: "Shaker REPI + 1 batido", endsOn: plus(30), createdBy: manager },
      { orgId: gym.id, locationId: palermo.id, title: "Plancha más larga", unit: "seg", category: "resistencia", rule: "Antebrazos y puntas de pie, cuerpo alineado, cronómetro visible.", prize: "Remera Gym Norte", endsOn: plus(45), createdBy: manager },
      { orgId: gym.id, locationId: palermo.id, title: "Remo 500 m", unit: "seg", lowerIsBetter: true, category: "cardio", rule: "Remoergómetro, resistencia 5, pantalla visible al final.", prize: "Toalla Gym Norte", endsOn: plus(60), createdBy: manager },
    ]);
    const items: [string, string, number, string | null, boolean][] = [["Suplementos", "Proteína whey 1 kg", 42000, "20% OFF con la app", true], ["Bebidas", "Bebida isotónica 500 ml", 2500, null, false], ["Bebidas", "Agua mineral 1,5 L", 1800, null, false],
      ["Snacks", "Barra proteica 60 g", 3200, null, false], ["Alimentos", "Batido post-entreno", 5500, null, false], ["Indumentaria", "Remera Gym Norte", 18000, null, false]];
    await db.insert(schema.catalogItem).values(items.map(([category, name, priceArs, promo, highlighted]) => ({ orgId: gym.id, locationId: palermo.id, category, name, priceArs, promo, highlighted, createdBy: manager })));
    await db.update(schema.gymLocation).set({ receptionHours: "Lun a vie 7 a 23 · sáb 9 a 14" }).where(eq(schema.gymLocation.id, palermo.id));
  }

  console.log("DEMO listo: Gym Norte (3 sedes, padrón 2, equipo de sala, 3 socios, turnos y 3 tareas), Agustín Pérez Coach, códigos R7K2QX (alumna@demo.repi.app) y S4M9TA (piso@demo.repi.app), QR /unirse/demo-palermo, contrato DEMO del gym, 3 plantillas y clienta DEMO");
}

main().then(() => sqlClient.end());
