import { sql } from "drizzle-orm";
import {
  type AnyPgColumn, bigint, boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ImportOrigin, ProgramRequestBrief } from "@repi/domain";
import type { ActionProposal, BrainPrefs, Evidence, ReplyCard } from "@repi/domain/brain/types";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const now = (name: string) => ts(name).notNull().defaultNow();
const id = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);

// ── Better Auth (nombres de modelo/campo exigidos por la biblioteca) ─────────────
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  birthDate: text("birth_date"), // ISO AAAA-MM-DD; sólo si el flujo lo pide (alumno invitado)
  platformRole: text("platform_role"), // 'admin' para REPI Admin; nunca editable por el usuario
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_user_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("account_user_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  verified: boolean("verified").default(true),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: ts("locked_until"),
}, (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)]);

// ── Tenencia ─────────────────────────────────────────────────────────────────
// kind 'coach': espacio de un coach independiente; kind 'gym': gimnasio/cadena.
export const organization = pgTable("organization", {
  id: id(),
  kind: text("kind", { enum: ["coach", "gym"] }).notNull(),
  name: text("name").notNull(),
  cuit: text("cuit"),
  locationsRange: text("locations_range"),
  membersRange: text("members_range"),
  specialty: text("specialty"),
  modality: text("modality"),
  clientsRange: text("clients_range"),
  status: text("status", { enum: ["trial", "active", "paused", "closed"] }).notNull().default("trial"),
  trialEndsAt: ts("trial_ends_at"),
  isDemo: boolean("is_demo").notNull().default(false),
  // Anexo 26/10: 'legacy' = cliente previo (a regularizar, sin suspender por inferencia); 'pending' = alta comercial sin habilitar.
  commercialStatus: text("commercial_status", { enum: ["legacy", "pending", "enabled", "suspended"] }).notNull().default("legacy"),
  // F-RV-05: política de reseñas del gym. La publicación externa no tiene columna: sigue deshabilitada (DEC-08).
  reviewResponses: boolean("review_responses").notNull().default(true),
  // D126: REPI Connect (seguimiento de sala) se activa por gimnasio desde REPI Admin. Apagado no toca rutinas, sesiones ni cuentas.
  connectEnabled: boolean("connect_enabled").notNull().default(false),
  createdBy: text("created_by").references(() => user.id),
  createdAt: now("created_at"),
});

export const gymLocation = pgTable("gym_location", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  publicJoin: boolean("public_join").notNull().default(true),
  receptionHours: text("reception_hours"), // F-HX-14: horario de recepción visible en el catálogo
  // D127: punto y radio de la sede para la validación de ingreso con ubicación (opcional). No se guardan ubicaciones de personas.
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  geoRadiusM: integer("geo_radius_m"),
  createdAt: now("created_at"),
}, (t) => [index("gym_location_org_idx").on(t.orgId)]);

// D195: equipamiento real de cada sede (no es un inventario financiero ni de mantenimiento). Sirve para que REPI recomiende cargas
// que existen: salto mínimo (por lado en barra y máquina de discos), rango opcional o lista explícita de cargas (mancuernas
// 10 / 12,5 / 15…). Los números van en la unidad del equipo (`unit`) y se convierten a kg al usarlos. Archivado, no borrado.
export const gymEquipment = pgTable("gym_equipment", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category", { enum: ["dumbbell", "barbell", "plate_loaded", "machine", "cable", "kettlebell", "bodyweight", "other"] }).notNull(),
  code: text("code"), // identificador interno opcional («M-04»)
  unit: text("unit", { enum: ["kg", "lb"] }).notNull().default("kg"),
  increment: doublePrecision("increment"), // salto mínimo (por lado si per_side)
  perSide: boolean("per_side").notNull().default(false),
  minLoad: doublePrecision("min_load"),
  maxLoad: doublePrecision("max_load"),
  loads: jsonb("loads").$type<number[] | null>(), // cargas totales disponibles, si la secuencia es irregular
  note: text("note"),
  archivedAt: ts("archived_at"),
  revision: integer("revision").notNull().default(1),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  index("gym_equipment_location_idx").on(t.orgId, t.locationId),
  uniqueIndex("gym_equipment_name_unique").on(t.locationId, sql`lower(${t.name})`).where(sql`archived_at is null`),
  check("gym_equipment_category_valid", sql`${t.category} in ('dumbbell', 'barbell', 'plate_loaded', 'machine', 'cable', 'kettlebell', 'bodyweight', 'other')`),
  check("gym_equipment_unit_valid", sql`${t.unit} in ('kg', 'lb')`),
]);
// Ejercicios de la biblioteca que se hacen con ese equipo (lo decide el personal; no se deduce por grupo muscular).
export const gymEquipmentExercise = pgTable("gym_equipment_exercise", {
  equipmentId: text("equipment_id").notNull().references(() => gymEquipment.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull().references(() => exercise.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
}, (t) => [primaryKey({ columns: [t.equipmentId, t.exerciseId] }), index("gym_equipment_exercise_ex_idx").on(t.exerciseId)]);

export const staffMembership = pgTable("staff_membership", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").references(() => gymLocation.id),
  role: text("role", { enum: ["owner", "manager", "coordinator", "floor_trainer", "reception", "coach_owner"] }).notNull(),
  status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
  afterHoursAccess: boolean("after_hours_access").notNull().default(false), // D08: trabajo autorizado fuera de turno
  createdAt: now("created_at"),
}, (t) => [
  index("staff_membership_user_idx").on(t.userId),
  uniqueIndex("staff_membership_unique").on(t.userId, t.orgId, t.role, sql`coalesce(${t.locationId}, '')`),
]);

// Relación alumno ↔ coach independiente.
export const coachClient = pgTable("coach_client", {
  id: id(),
  coachOrgId: text("coach_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["active", "paused", "archived", "ended"] }).notNull().default("active"),
  invitationId: text("invitation_id"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("coach_client_unique").on(t.coachOrgId, t.userId), index("coach_client_user_idx").on(t.userId)]);

// Relación socio ↔ gym.
export const gymMember = pgTable("gym_member", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  rosterEntryId: text("roster_entry_id"),
  status: text("status", { enum: ["pending_consent", "active", "suspended", "ended"] }).notNull().default("pending_consent"),
  // D127: vigencia opcional de la membresía (AAAA-MM-DD, hora AR) cargada por el gimnasio. Pasada la fecha cuenta como vencida.
  accessUntil: text("access_until"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("gym_member_unique").on(t.orgId, t.userId), index("gym_member_user_idx").on(t.userId)]);

// Sedes habilitadas explícitas (anexo §2): la principal es gym_member.locationId; las ampliaciones se registran acá.
export const gymMemberLocation = pgTable("gym_member_location", {
  gymMemberId: text("gym_member_id").notNull().references(() => gymMember.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  grantedBy: text("granted_by").references(() => user.id),
  requestId: text("request_id"),
  grantedAt: now("granted_at"),
  revokedAt: ts("revoked_at"),
}, (t) => [primaryKey({ columns: [t.gymMemberId, t.locationId] })]);

export const invitation = pgTable("invitation", {
  id: id(),
  code: text("code").notNull().unique(),
  kind: text("kind", { enum: ["coach_client", "gym_staff", "org_owner"] }).notNull(),
  tokenHash: text("token_hash"), // org_owner: enlace de bienvenida (sólo hash)
  contractId: text("contract_id"),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").references(() => gymLocation.id),
  role: text("role"),
  email: text("email"),
  invitedBy: text("invited_by").notNull().references(() => user.id),
  status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] }).notNull().default("pending"),
  expiresAt: ts("expires_at").notNull(),
  acceptedBy: text("accepted_by").references(() => user.id),
  acceptedAt: ts("accepted_at"),
  revokedAt: ts("revoked_at"),
  // Bienvenida comercial: qué pasó con el envío. "submitted" = el proveedor lo aceptó (no prueba que llegó);
  // "local_only" = quedó en el buzón DEV; "failed" = rechazo o sin respuesta. null = invitación anterior a este registro.
  delivery: text("delivery", { enum: ["pending", "submitted", "local_only", "failed"] }),
  createdAt: now("created_at"),
}, (t) => [index("invitation_org_idx").on(t.orgId)]);

// Padrón cargado por el gym. DNI como HMAC (T09); nunca en texto plano.
export const rosterEntry = pgTable("roster_entry", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").references(() => gymLocation.id),
  dniHmac: text("dni_hmac").notNull(),
  dniLast3: text("dni_last3").notNull(),
  fullName: text("full_name").notNull(),
  memberNumber: text("member_number"),
  source: text("source", { enum: ["csv", "reception", "demo"] }).notNull(),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("roster_org_dni_unique").on(t.orgId, t.dniHmac)]);

// Solicitud de acceso del socio. Anexo 26/10: por QR de sede, sin padrón obligatorio; la resuelve piso en turno o recepción.
export const membershipRequest = pgTable("membership_request", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  dniHmac: text("dni_hmac"), // sólo flujo anterior (DNI); el QR no lo pide
  dniLast3: text("dni_last3"),
  source: text("source", { enum: ["dni_legacy", "qr"] }).notNull().default("dni_legacy"),
  kind: text("kind", { enum: ["initial", "expansion", "reactivation"] }).notNull().default("initial"),
  joinLinkId: text("join_link_id"),
  status: text("status", { enum: ["pending", "approved", "rejected", "cancelled", "expired"] }).notNull().default("pending"),
  expiresAt: ts("expires_at"),
  decidedBy: text("decided_by").references(() => user.id),
  decidedAt: ts("decided_at"),
  decidedAs: text("decided_as", { enum: ["floor", "reception", "manager", "owner"] }),
  decidedShiftId: text("decided_shift_id"),
  validationMethod: text("validation_method"),
  reason: text("reason"), // nota interna (no se muestra al socio)
  publicReason: text("public_reason"), // clave de REJECT_REASONS
  escalatedAt: ts("escalated_at"),
  cancelledAt: ts("cancelled_at"),
  createdAt: now("created_at"),
}, (t) => [
  index("membership_request_org_idx").on(t.orgId, t.status),
  uniqueIndex("membership_request_pending_loc_unique").on(t.orgId, t.userId, t.locationId).where(sql`status = 'pending'`),
]);

// QR público de alta por sede: identificador, no credencial (anexo §5). Revocable/regenerable con historial.
export const locationJoinLink = pgTable("location_join_link", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  slug: text("slug").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  revokedBy: text("revoked_by").references(() => user.id),
  revokedAt: ts("revoked_at"),
}, (t) => [uniqueIndex("join_link_one_active").on(t.locationId).where(sql`active`)]);

export const guardianConsent = pgTable("guardian_consent", {
  id: id(),
  minorUserId: text("minor_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  guardianName: text("guardian_name").notNull(),
  guardianEmail: text("guardian_email").notNull(),
  relation: text("relation", { enum: ["mother", "father", "legal_guardian"] }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status", { enum: ["pending", "approved", "rejected", "expired"] }).notNull().default("pending"),
  policyVersion: text("policy_version").notNull(),
  expiresAt: ts("expires_at").notNull(),
  decidedAt: ts("decided_at"),
  createdAt: now("created_at"),
}, (t) => [index("guardian_minor_idx").on(t.minorUserId)]);

// Registro inmutable de aceptación de documentos legales (F-ID-15).
export const legalAcceptance = pgTable("legal_acceptance", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => organization.id),
  document: text("document", { enum: ["terms", "privacy", "dpa"] }).notNull(),
  version: text("version").notNull(),
  acceptedAt: now("accepted_at"),
}, (t) => [index("legal_user_idx").on(t.userId)]);

// Consentimiento para compartir, por relación e ítem. Guardar ≠ compartir.
export const consentGrant = pgTable("consent_grant", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  scope: text("scope", { enum: ["coach_client", "gym_member"] }).notNull(),
  relationId: text("relation_id").notNull(),
  granteeOrgId: text("grantee_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
  termsVersion: text("terms_version").notNull(),
  grantedAt: now("granted_at"),
  revokedAt: ts("revoked_at"),
}, (t) => [
  index("consent_user_idx").on(t.userId),
  uniqueIndex("consent_active_unique").on(t.relationId, t.item).where(sql`status = 'active'`),
]);

// Auditoría sin contenido sensible: actor, acción, recurso, resultado, tiempo.
export const auditEvent = pgTable("audit_event", {
  id: id(),
  actorUserId: text("actor_user_id"),
  orgId: text("org_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  result: text("result", { enum: ["ok", "denied", "error"] }).notNull().default("ok"),
  meta: jsonb("meta"),
  at: now("at"),
}, (t) => [index("audit_actor_idx").on(t.actorUserId), index("audit_org_idx").on(t.orgId)]);

// Correo de desarrollo (T05). Nunca se usa en producción.
export const devMailbox = pgTable("dev_mailbox", {
  id: id(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: now("created_at"),
}, (t) => [index("dev_mailbox_to_idx").on(t.to)]);

// ── Programación (Etapa 2) ──────────────────────────────────────────────────
// Biblioteca: orgId null = catálogo base REPI (sin medios licenciados todavía, GAP-11).
export const exercise = pgTable("exercise", {
  id: id(),
  orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  muscleGroup: text("muscle_group").notNull(),
  kind: text("kind", { enum: ["load_reps", "bodyweight", "time"] }).notNull().default("load_reps"),
  // D163: ejercicio propio de un alumno (org null). Sólo lo ve esa persona; el catálogo es org y dueño null.
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("exercise_org_name_unique").on(sql`coalesce(${t.orgId}, '')`, sql`coalesce(${t.ownerUserId}, '')`, t.name), index("exercise_owner_idx").on(t.ownerUserId)]);

// Programa: plantilla del coach o copia propia de un cliente (C04: nunca un objeto compartido).
export const program = pgTable("program", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["template", "client_copy", "member_copy", "solo"] }).notNull(), // solo: rutina de un día sin programa asignado (D153)
  coachClientId: text("coach_client_id").references(() => coachClient.id, { onDelete: "cascade" }),
  gymMemberId: text("gym_member_id").references(() => gymMember.id, { onDelete: "cascade" }), // programa institucional del socio
  sourceProgramId: text("source_program_id"),
  sourceVersionId: text("source_version_id"),
  currentVersionId: text("current_version_id"),
  archivedAt: ts("archived_at"),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("program_org_idx").on(t.orgId, t.kind), index("program_client_idx").on(t.coachClientId)]);

// Versión: se congela (locked) cuando una asignación o una sesión la referencia; editar después crea otra.
export const programVersion = pgTable("program_version", {
  id: id(),
  programId: text("program_id").notNull().references(() => program.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  name: text("name").notNull(),
  weeks: integer("weeks").notNull(),
  note: text("note").notNull().default(""),
  locked: boolean("locked").notNull().default(false),
  reason: text("reason"), // motivo visible al equipo (programa institucional, F-GT-03)
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("program_version_unique").on(t.programId, t.number)]);

// D158: rutinas propias del alumno («Mis rutinas»): para quien entrena con su propia rutina, tenga o no programa asignado.
// Son sólo del alumno (no se comparten con el coach ni el gym); al empezar una se crea una sesión como la de D153.
export const ownRoutine = pgTable("own_routine", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // D184: `detail` opcional (técnica, plan con etapas conectadas, superserie o circuito), el mismo ExerciseDetail que el programa del coach.
  exercises: jsonb("exercises").$type<{ exerciseId: string; sets: number; reps: string; weightKg: number | null; restSec: number | null; note: string | null; detail?: unknown }[]>().notNull(),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
  lastUsedAt: ts("last_used_at"),
  // SI2: si vino de una importación, lo que decía el documento (inmutable) y la operación que la guardó (idempotencia).
  origin: jsonb("origin").$type<ImportOrigin>(),
}, (t) => [
  index("own_routine_user_idx").on(t.userId),
  uniqueIndex("own_routine_import_op_unique").on(t.userId, sql`(${t.origin}->>'opId')`, sql`(${t.origin}->>'day')`).where(sql`${t.origin} ? 'opId'`),
]);

export const programDay = pgTable("program_day", {
  id: id(),
  versionId: text("version_id").notNull().references(() => programVersion.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
}, (t) => [uniqueIndex("program_day_pos_unique").on(t.versionId, t.position)]);

export const programExercise = pgTable("program_exercise", {
  id: id(),
  dayId: text("day_id").notNull().references(() => programDay.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  exerciseId: text("exercise_id").notNull().references(() => exercise.id),
  name: text("name").notNull(), // snapshot del nombre al prescribir
  sets: integer("sets").notNull(),
  reps: text("reps").notNull(),
  rir: integer("rir"),
  restSec: integer("rest_sec").notNull(),
  note: text("note"),
  detail: jsonb("detail"), // D134: técnica, plan serie por serie, combinación, tempo, variante (ExerciseDetail); null = series rectas
}, (t) => [uniqueIndex("program_exercise_pos_unique").on(t.dayId, t.position)]);

// Asignación: una activa por relación; reemplazar conserva el historial.
// Exactamente una relación: coach_client (coach privado) o gym_member (programa institucional).
export const programAssignment = pgTable("program_assignment", {
  id: id(),
  coachClientId: text("coach_client_id").references(() => coachClient.id, { onDelete: "cascade" }),
  gymMemberId: text("gym_member_id").references(() => gymMember.id, { onDelete: "cascade" }),
  programId: text("program_id").notNull().references(() => program.id, { onDelete: "cascade" }),
  startsOn: text("starts_on").notNull(), // fecha local AR AAAA-MM-DD
  status: text("status", { enum: ["active", "ended"] }).notNull().default("active"),
  assignedBy: text("assigned_by").notNull().references(() => user.id),
  assignedAt: now("assigned_at"),
  endedAt: ts("ended_at"),
}, (t) => [
  uniqueIndex("assignment_active_unique").on(t.coachClientId).where(sql`status = 'active' and coach_client_id is not null`),
  uniqueIndex("assignment_member_active_unique").on(t.gymMemberId).where(sql`status = 'active' and gym_member_id is not null`),
  check("assignment_one_relation", sql`(${t.coachClientId} is null) <> (${t.gymMemberId} is null)`),
]);

// ── Ejecución ───────────────────────────────────────────────────────────────
// id generado en el cliente (idempotencia): reintentos no duplican la sesión.
export const workoutSession = pgTable("workout_session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  coachClientId: text("coach_client_id").references(() => coachClient.id, { onDelete: "cascade" }),
  gymMemberId: text("gym_member_id").references(() => gymMember.id, { onDelete: "cascade" }), // sesión del programa institucional
  assignmentId: text("assignment_id").notNull().references(() => programAssignment.id),
  versionId: text("version_id").notNull().references(() => programVersion.id),
  dayId: text("day_id").notNull().references(() => programDay.id),
  dayName: text("day_name").notNull(),
  // D195: «voided» = sesión terminada que la persona anuló (reversible). No se borra nada: sale del historial activo, de las
  // estadísticas, récords, niveles, rankings y de Training Intelligence porque todo filtra por estado; restaurar la devuelve a «completed».
  status: text("status", { enum: ["in_progress", "paused", "completed", "abandoned", "voided"] }).notNull().default("in_progress"),
  startedAt: ts("started_at").notNull(),
  lastResumedAt: ts("last_resumed_at"),
  activeMs: integer("active_ms").notNull().default(0),
  endedAt: ts("ended_at"),
  rpe: integer("rpe"),
  note: text("note"),
  revision: integer("revision").notNull().default(1), // control de versión para sincronización offline
  updatedAt: now("updated_at"),
  presenceCheckinId: text("presence_checkin_id"), // D127: ingreso validado con el que se inició (sesiones del gym con control de acceso)
  floorTrainerId: text("floor_trainer_id"), // D131: profesor de sala elegido por el socio para ese día (sin FK: el historial sobrevive a bajas)
  // D184: intervalo EMOM en curso (ejercicio, serie, inicio en hora del servidor, estado). Null = ninguno. Ver IntervalState.
  intervalState: jsonb("interval_state"),
  // D195: anulación reversible (quién, cuándo y motivo opcional). Restaurar las deja en null; el rastro queda en training_correction.
  voidedAt: ts("voided_at"),
  voidedBy: text("voided_by").references(() => user.id, { onDelete: "set null" }),
  voidReason: text("void_reason"),
}, (t) => [
  index("workout_session_user_idx").on(t.userId, t.startedAt),
  index("session_relation_idx").on(t.coachClientId, t.startedAt),
  index("session_member_idx").on(t.gymMemberId, t.startedAt),
  uniqueIndex("session_one_open_unique").on(t.userId).where(sql`status in ('in_progress','paused')`),
]);

export const setLog = pgTable("set_log", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => workoutSession.id, { onDelete: "cascade" }),
  programExerciseId: text("program_exercise_id").notNull().references(() => programExercise.id),
  exerciseId: text("exercise_id").notNull().references(() => exercise.id),
  setIndex: integer("set_index").notNull(),
  weightKg: text("weight_kg"), // decimal exacto como texto ("82.5"); null = peso corporal / no aplica
  reps: integer("reps"),
  rir: integer("rir"),
  feel: text("feel"), // sensación de la serie (pedido 26/10): facil|bien|dificil|limite|molestia|ayuda
  note: text("note"), // nota de la persona sobre esta serie (F-HX-21, D106); la ve su coach en la relación
  // D183: copia de la prescripción al registrar (serie principal y etapa). Nulos en registros anteriores: se deducen de la
  // versión congelada con `rowRef` (stages.ts). No reemplazan a `set_index`, que sigue siendo la clave de sincronización.
  specId: text("spec_id"), // identidad estable de la fila del plan («r0» para planes sin identidad)
  setKind: text("set_kind"), // tipo: work, warmup, top, backoff, drop, rest_pause, cluster, amrap, failure
  blockIndex: integer("block_index"), // serie principal (desde 0)
  stageIndex: integer("stage_index"), // 0 = principal; 1..K = etapa conectada
  completedAt: ts("completed_at").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: now("updated_at"),
  // D195: serie registrada por error y anulada desde el historial (reversible). Una serie anulada nunca es un resultado: no suma
  // volumen, series, récords, niveles, rankings ni referencias de Training Intelligence. La fila se conserva (no hay DELETE).
  voidedAt: ts("voided_at"),
  voidedBy: text("voided_by").references(() => user.id, { onDelete: "set null" }),
  voidReason: text("void_reason"),
}, (t) => [
  uniqueIndex("set_log_unique").on(t.sessionId, t.programExerciseId, t.setIndex),
  index("set_log_exercise_idx").on(t.exerciseId, t.completedAt),
]);

// D195: correcciones del historial, sólo agregar (append-only). Cada edición, anulación o restauración de una serie o de una
// sesión deja una fila con los valores anteriores y nuevos (sólo los campos que cambiaron), quién, cuándo y el motivo opcional.
// `request_id` hace idempotente cada pedido (un reintento no duplica la corrección). Son datos de entrenamiento de la propia
// persona: se borran con su cuenta (cascada) y nunca van al audit_event global, que sólo registra la acción y los ids.
export const trainingCorrection = pgTable("training_correction", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }), // dueño del registro
  sessionId: text("session_id").notNull().references(() => workoutSession.id, { onDelete: "cascade" }),
  setLogId: text("set_log_id").references(() => setLog.id, { onDelete: "cascade" }), // null = corrección de la sesión
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action", { enum: ["set_edit", "set_void", "set_restore", "set_add", "session_void", "session_restore"] }).notNull(),
  before: jsonb("before").$type<Record<string, unknown>>().notNull(),
  after: jsonb("after").$type<Record<string, unknown>>().notNull(),
  reason: text("reason"),
  requestId: text("request_id").notNull(),
  baseRevision: integer("base_revision"),
  createdAt: now("created_at"),
}, (t) => [
  uniqueIndex("training_correction_request_unique").on(t.userId, t.requestId),
  index("training_correction_session_idx").on(t.sessionId, t.createdAt),
  check("training_correction_action_valid", sql`${t.action} in ('set_edit', 'set_void', 'set_restore', 'set_add', 'session_void', 'session_restore')`),
]);

// D184: etapas conectadas (drop, mini serie, bloque de cluster) que la persona decidió no hacer («Terminar la serie acá»).
// Aparte de set_log a propósito: una omisión nunca es un resultado (no suma reps, tonelaje, récords ni niveles). Una fila por
// etapa; `skipped = false` es la omisión deshecha (se conserva para resolver entre dispositivos: gana el cambio más reciente,
// `changed_at`). Si la etapa tiene registro en set_log, el registro manda y la omisión se ignora.
export const setSkip = pgTable("set_skip", {
  id: id(),
  sessionId: text("session_id").notNull().references(() => workoutSession.id, { onDelete: "cascade" }),
  programExerciseId: text("program_exercise_id").notNull().references(() => programExercise.id),
  setIndex: integer("set_index").notNull(),
  specId: text("spec_id"), // identidad de la fila del plan al omitirla (como set_log.spec_id)
  skipped: boolean("skipped").notNull().default(true),
  changedAt: ts("changed_at").notNull(), // hora del cambio en el dispositivo (acotada por el servidor)
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("set_skip_unique").on(t.sessionId, t.programExerciseId, t.setIndex)]);

// D191 · Training Intelligence 2.0: objetivo que REPI emitió para una fila (serie o etapa) de una sesión. Es un objeto aparte
// de la programación del profe (program_exercise.detail) y del resultado real (set_log): nunca se pisan entre sí. Un objetivo
// emitido no se reescribe: si cambia durante la sesión, el anterior queda `superseded_at` y se inserta otro con `seq` + 1. Hay a
// lo sumo uno vigente por fila (índice parcial). `algo_version` dice con qué reglas se calculó; cambiar el algoritmo no toca
// objetivos ya emitidos. `decision` se fija al registrar la serie (accepted/modified) o al cerrar la sesión (not_done).
export const trainingTarget = pgTable("training_target", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => workoutSession.id, { onDelete: "cascade" }),
  // Cascada a propósito: un objetivo es derivado del plan. Si la fila del plan, la versión o el ejercicio desaparecen (edición en
  // el lugar de una versión sin sesiones, ejercicio propio borrado), el objetivo no tiene sentido y no debe bloquear ese flujo.
  // Los resultados reales siguen protegidos por las claves de set_log.
  programExerciseId: text("program_exercise_id").notNull().references(() => programExercise.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull().references(() => exercise.id, { onDelete: "cascade" }), // el que realmente se hace (reemplazo incluido)
  versionId: text("version_id").notNull().references(() => programVersion.id, { onDelete: "cascade" }), // versión congelada de la sesión
  setIndex: integer("set_index").notNull(),
  specId: text("spec_id"),
  setKind: text("set_kind").notNull(),
  blockIndex: integer("block_index").notNull(),
  stageIndex: integer("stage_index").notNull(),
  seq: integer("seq").notNull().default(1),
  status: text("status", { enum: ["ready", "no_data", "limited", "coach", "not_applicable"] }).notNull(),
  action: text("action").notNull(),
  source: text("source", { enum: ["rules", "coach"] }).notNull(),
  quality: text("quality", { enum: ["high", "medium", "low", "none"] }).notNull(),
  weightKg: text("weight_kg"), // decimal como texto, igual que set_log
  repsMin: integer("reps_min"),
  repsMax: integer("reps_max"),
  repsTarget: integer("reps_target"),
  rirTarget: integer("rir_target"),
  rpeTarget: doublePrecision("rpe_target"),
  restSec: integer("rest_sec"),
  restSuggestSec: integer("rest_suggest_sec"),
  pending: boolean("pending").notNull().default(false),
  // Explicación y trazabilidad: motivos (códigos), protecciones aplicadas, texto mostrado, revisión frente al plan del profe y
  // los registros históricos usados (ids de set_log y valores). Sin datos de salud en texto libre.
  detail: jsonb("detail").$type<{ reasons: string[]; guards: string[]; text: string; why: string; review: string | null; prev: unknown; refs: unknown[]; coach: unknown }>().notNull(),
  algoVersion: text("algo_version").notNull(),
  decision: text("decision", { enum: ["accepted", "modified", "not_done"] }),
  setLogId: text("set_log_id"),
  createdAt: now("created_at"),
  decidedAt: ts("decided_at"),
  supersededAt: ts("superseded_at"),
}, (t) => [
  uniqueIndex("training_target_seq_unique").on(t.sessionId, t.programExerciseId, t.setIndex, t.seq),
  uniqueIndex("training_target_current_unique").on(t.sessionId, t.programExerciseId, t.setIndex).where(sql`superseded_at is null`),
  index("training_target_user_idx").on(t.userId, t.createdAt),
]);

// D191: propuesta de Training Intelligence para la próxima programación de un alumno de coach (subir carga, revisar,
// considerar una descarga). Nunca cambia el programa: el coach la revisa y decide (aceptar, modificar, rechazar, mantener).
// Una abierta por relación, ejercicio y tipo; al decidir, queda con quién, cuándo y su nota.
export const trainingProposal = pgTable("training_proposal", {
  id: id(),
  // Exactamente una relación (como program_assignment): el coach privado o el equipo de sala de la sede del socio.
  coachClientId: text("coach_client_id").references(() => coachClient.id, { onDelete: "cascade" }),
  gymMemberId: text("gym_member_id").references(() => gymMember.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull().references(() => exercise.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["load", "reps", "hold", "review", "deload", "rest"] }).notNull(),
  payload: jsonb("payload").$type<{ text: string; weightKg: number | null; reps: number | null; basis: string; trend: string; sessions: number }>().notNull(),
  algoVersion: text("algo_version").notNull(),
  status: text("status", { enum: ["open", "accepted", "modified", "rejected", "kept"] }).notNull().default("open"),
  decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
  decidedAt: ts("decided_at"),
  note: text("note"),
  createdAt: now("created_at"),
}, (t) => [
  uniqueIndex("training_proposal_open_unique").on(t.coachClientId, t.exerciseId, t.kind).where(sql`status = 'open' and coach_client_id is not null`),
  uniqueIndex("training_proposal_member_open_unique").on(t.gymMemberId, t.exerciseId, t.kind).where(sql`status = 'open' and gym_member_id is not null`),
  index("training_proposal_rel_idx").on(t.coachClientId, t.createdAt),
  index("training_proposal_member_idx").on(t.gymMemberId, t.createdAt),
  check("training_proposal_one_relation", sql`(${t.coachClientId} is null) <> (${t.gymMemberId} is null)`),
]);

// D192: tipos de serie personalizados («Load Set», «Serie de control»): la biblioteca privada de cada profe en cada
// organización (coach independiente o gimnasio). Nombre visible + tipo real de REPI (`kind`, lo que define conteo, métricas y
// Training Intelligence) + valores por defecto opcionales. El plan guarda una copia del nombre: renombrar o quitar un tipo
// (archived_at) no cambia programas ni registros anteriores. No se comparte con otras organizaciones ni con otros profes.
export const setType = pgTable("set_type", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["warmup", "work", "top", "backoff", "drop", "amrap", "failure", "rest_pause", "cluster"] }).notNull(),
  defaults: jsonb("defaults").$type<{ reps?: string | null; rir?: number | null; rpe?: number | null; restSec?: number | null }>().notNull().default({}),
  archivedAt: ts("archived_at"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  uniqueIndex("set_type_owner_name_unique").on(t.orgId, t.ownerUserId, sql`lower(${t.name})`).where(sql`archived_at is null`),
  index("set_type_owner_idx").on(t.orgId, t.ownerUserId),
]);

// D132: historial anterior a REPI cargado desde un archivo. Borrador hasta que la persona lo confirma; no se guarda el archivo.
export const historyImport = pgTable("history_import", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["draft", "confirmed", "discarded"] }).notNull().default("draft"),
  source: text("source", { enum: ["csv", "notes", "ai"] }).notNull(),
  fileName: text("file_name"),
  parsed: jsonb("parsed").notNull(), // vista previa: series normalizadas, coincidencias con la biblioteca y avisos
  sessions: integer("sessions").notNull().default(0),
  sets: integer("sets").notNull().default(0),
  fromDay: text("from_day"),
  toDay: text("to_day"),
  model: text("model"),
  createdAt: now("created_at"),
  confirmedAt: ts("confirmed_at"),
}, (t) => [index("history_import_user_idx").on(t.userId, t.createdAt)]);

export const historyEntry = pgTable("history_entry", {
  id: id(),
  importId: text("import_id").notNull().references(() => historyImport.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  day: text("day").notNull(),
  exerciseId: text("exercise_id").references(() => exercise.id, { onDelete: "set null" }),
  exerciseName: text("exercise_name").notNull(),
  setIndex: integer("set_index").notNull(),
  weightKg: text("weight_kg"),
  reps: integer("reps"),
  seconds: integer("seconds"),
}, (t) => [index("history_entry_user_day_idx").on(t.userId, t.day), index("history_entry_user_ex_idx").on(t.userId, t.exerciseId)]);

// Cambios de la persona a un ejercicio de ESTA sesión (F-HX-21, D106): saltarlo o hacer otro en su lugar. Nunca toca el
// programa ni la prescripción; las series hechas con el reemplazo se registran con el ejercicio realmente hecho.
export const sessionExerciseChange = pgTable("session_exercise_change", {
  id: id(),
  sessionId: text("session_id").notNull().references(() => workoutSession.id, { onDelete: "cascade" }),
  programExerciseId: text("program_exercise_id").notNull().references(() => programExercise.id),
  kind: text("kind", { enum: ["skip", "substitute"] }).notNull(),
  substituteExerciseId: text("substitute_exercise_id").references(() => exercise.id),
  reason: text("reason", { enum: ["busy", "no_equipment", "discomfort", "no_time", "other"] }).notNull(),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("session_exercise_change_uq").on(t.sessionId, t.programExerciseId)]);

// Reemplazos aprobados por el coach o el gimnasio (Adaptive Coach 1b, EXT-05): «si X no se puede, hacé Y». Valen para
// toda la organización y aparecen primero entre las alternativas de la sesión. No cambian programas ni cargas.
export const exerciseSubstitution = pgTable("exercise_substitution", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull().references(() => exercise.id, { onDelete: "cascade" }),
  substituteExerciseId: text("substitute_exercise_id").notNull().references(() => exercise.id, { onDelete: "cascade" }),
  note: text("note"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("exercise_substitution_uq").on(t.orgId, t.exerciseId, t.substituteExerciseId)]);

// Conflictos de sincronización: se guardan ambas versiones hasta que la persona elige (Etapa 3).
export const syncConflict = pgTable("sync_conflict", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => workoutSession.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["set", "open_session"] }).notNull(),
  targetKey: text("target_key").notNull(), // p. ej. programExerciseId:setIndex
  serverPayload: jsonb("server_payload").notNull(),
  clientPayload: jsonb("client_payload").notNull(),
  status: text("status", { enum: ["open", "kept_local", "kept_server"] }).notNull().default("open"),
  createdAt: now("created_at"),
  resolvedAt: ts("resolved_at"),
}, (t) => [
  index("sync_conflict_user_idx").on(t.userId, t.status),
  uniqueIndex("sync_conflict_open_unique").on(t.sessionId, t.targetKey).where(sql`status = 'open'`),
]);

// ── Seguimiento y consentimiento (Etapa 4) ──────────────────────────────────
// Check-in previo a entrenar (energía, sueño, ánimo 1–5). Uno por persona y día local.
export const checkin = pgTable("checkin", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // AAAA-MM-DD hora AR
  energy: integer("energy").notNull(),
  sleep: integer("sleep").notNull(),
  mood: integer("mood").notNull(),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("checkin_user_date_unique").on(t.userId, t.date)]);

// Molestia reportada por el alumno. Dato de salud: el coach la ve con grant 'health' o si este reporte se compartió explícitamente.
export const painReport = pgTable("pain_report", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  zone: text("zone").notNull(),
  level: integer("level").notNull(), // 0–10
  context: text("context", { enum: ["now", "after", "out"] }).notNull(),
  exerciseName: text("exercise_name"),
  sessionId: text("session_id"),
  note: text("note"),
  sharedWithRelationId: text("shared_with_relation_id"), // consentimiento por reporte
  seenByCoachAt: ts("seen_by_coach_at"),
  createdAt: now("created_at"),
}, (t) => [index("pain_user_idx").on(t.userId, t.createdAt)]);

export const injury = pgTable("injury", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  zone: text("zone").notNull(),
  detail: text("detail"),
  status: text("status", { enum: ["active", "monitoring", "resolved"] }).notNull(),
  since: text("since"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
  deletedAt: ts("deleted_at"),
}, (t) => [index("injury_user_idx").on(t.userId)]);

// Archivos privados (video de técnica). Adaptador de almacenamiento: disco en desarrollo (D39).
export const mediaObject = pgTable("media_object", {
  id: id(),
  ownerUserId: text("owner_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["request_video", "attempt_video", "community_image", "exercise_video", "club_image", "progress_photo"] }).notNull(), // club_image: fotos del Club y de perfil (D169); request_video también para tareas del equipo de sala (D41); exercise_video: D164; progress_photo: foto corporal privada, sólo su dueño (D200)
  orgId: text("org_id"), // imágenes de comunidad: las ven los socios y el staff de esa organización
  storageKey: text("storage_key").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: now("created_at"),
  deletedAt: ts("deleted_at"),
});

// D164: video de cómo se hace un ejercicio, cargado por el gimnasio o el coach (uno por ejercicio y organización). Puede ser
// un video subido (media_object) o un enlace a YouTube, TikTok o Instagram. Lo ven sus socios o alumnos en el entrenamiento.
export const exerciseMedia = pgTable("exercise_media", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull().references(() => exercise.id, { onDelete: "cascade" }),
  mediaId: text("media_id").references(() => mediaObject.id),
  url: text("url"),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("exercise_media_unique").on(t.orgId, t.exerciseId)]);

// Entornos de la demo guiada (D85): uno por visita, con sus personas y organizaciones ficticias; se borran al vencer.
export const demoSandbox = pgTable("demo_sandbox", {
  id: id(),
  tag: text("tag").notNull().unique(),
  role: text("role", { enum: ["owner", "floor", "member", "coach"] }).notNull(),
  userIds: jsonb("user_ids").notNull().default(sql`'[]'::jsonb`),
  orgIds: jsonb("org_ids").notNull().default(sql`'[]'::jsonb`),
  createdAt: now("created_at"),
  expiresAt: ts("expires_at").notNull(),
}, (t) => [index("demo_sandbox_expires_idx").on(t.expiresAt)]);

// Cobros manuales del coach a sus clientes (F-BL-01, D80). Registro, no pasarela: REPI no mueve dinero.
// Separado de lo que REPI le factura al coach (client_contract). Importes en unidades menores enteras.
export const coachCharge = pgTable("coach_charge", {
  id: id(),
  coachOrgId: text("coach_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  coachClientId: text("coach_client_id").notNull().references(() => coachClient.id, { onDelete: "cascade" }),
  concept: text("concept").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  dueOn: text("due_on").notNull(), // AAAA-MM-DD
  status: text("status", { enum: ["pending", "paid", "void"] }).notNull().default("pending"),
  paidOn: text("paid_on"),
  method: text("method", { enum: ["efectivo", "transferencia", "otro"] }),
  note: text("note"),
  voidReason: text("void_reason"),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("coach_charge_org_idx").on(t.coachOrgId, t.status), index("coach_charge_client_idx").on(t.coachClientId)]);

// Objetivos acordados coach ↔ alumno (F-CO-03 / F-HX-02, D97). Indicadores automáticos (1RM estimado, carga × reps,
// entrenamientos por semana) se calculan desde las series de la relación; «manual» lo carga el coach con fecha.
// Decimales como texto exacto, igual que set_log.weight_kg. La línea base es el valor al acordar.
export const clientGoal = pgTable("client_goal", {
  id: id(),
  coachClientId: text("coach_client_id").notNull().references(() => coachClient.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["e1rm", "load", "frequency", "manual"] }).notNull(),
  title: text("title").notNull(),
  exerciseId: text("exercise_id").references(() => exercise.id),
  target: text("target").notNull(),
  targetReps: integer("target_reps"),
  unit: text("unit").notNull(),
  baseline: text("baseline"),
  manualValue: text("manual_value"),
  manualAt: ts("manual_at"),
  dueOn: text("due_on"), // AAAA-MM-DD
  status: text("status", { enum: ["active", "achieved", "cancelled"] }).notNull().default("active"),
  note: text("note"),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
  closedAt: ts("closed_at"),
}, (t) => [index("client_goal_rel_idx").on(t.coachClientId, t.status)]);

// Agenda coach ↔ alumno (F-CO-10 / F-HX-07, D98). Turno propio, separado del entrenamiento registrado: el coach marca
// realizada/no asistió y el alumno confirma o avisa que no puede. Hora guardada en UTC; se muestra en hora argentina.
export const coachAppointment = pgTable("coach_appointment", {
  id: id(),
  coachOrgId: text("coach_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  coachClientId: text("coach_client_id").notNull().references(() => coachClient.id, { onDelete: "cascade" }),
  startsAt: ts("starts_at").notNull(),
  durationMin: integer("duration_min").notNull(),
  modality: text("modality", { enum: ["presencial", "online"] }).notNull(),
  place: text("place"),
  note: text("note"),
  status: text("status", { enum: ["scheduled", "cancelled", "done", "no_show"] }).notNull().default("scheduled"),
  clientResponse: text("client_response", { enum: ["pending", "confirmed", "declined"] }).notNull().default("pending"),
  respondedAt: ts("responded_at"),
  cancelReason: text("cancel_reason"),
  cancelledBy: text("cancelled_by").references(() => user.id),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("appt_org_starts_idx").on(t.coachOrgId, t.startsAt), index("appt_client_starts_idx").on(t.coachClientId, t.startsAt)]);

// Pedidos de derechos sobre los datos propios (F-PR-02, D75). V1: canal autenticado y registro verificable;
// el borrado lo ejecuta REPI con el procedimiento de docs/PRIVACIDAD_OPERACION.md (retención pendiente de definir).
export const privacyRequest = pgTable("privacy_request", {
  id: id(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  emailAtRequest: text("email_at_request").notNull(),
  kind: text("kind", { enum: ["delete"] }).notNull(),
  status: text("status", { enum: ["pending", "done", "rejected", "cancelled"] }).notNull().default("pending"),
  note: text("note"),
  resolution: text("resolution"),
  resolvedBy: text("resolved_by"),
  resolvedAt: ts("resolved_at"),
  createdAt: now("created_at"),
}, (t) => [index("privacy_request_status_idx").on(t.status)]);

// Soporte e incidentes (N-O11, D93). Una consulta con sesión queda ligada a la cuenta; sin sesión sólo guarda el correo
// que escribió la persona (identidad no verificada: no se vincula a una cuenta por coincidir el email). Sin contenido de
// otras personas ni datos de salud: el diagnóstico es una lista cerrada de datos técnicos que la persona aceptó adjuntar.
export const supportTicket = pgTable("support_ticket", {
  id: id(),
  code: text("code").notNull().unique(), // referencia para hablar con la persona (S-XXXXXX); no da acceso a nada
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  contactEmail: text("contact_email").notNull(),
  identity: text("identity", { enum: ["session", "unverified"] }).notNull(),
  category: text("category", { enum: ["access", "training", "sync", "billing", "privacy", "other", "idea"] }).notNull(), // idea: sugerencia de mejora (D156)
  message: text("message").notNull(),
  diagnostics: jsonb("diagnostics"),
  status: text("status", { enum: ["open", "in_progress", "resolved"] }).notNull().default("open"),
  severity: text("severity", { enum: ["normal", "incident"] }).notNull().default("normal"),
  internalNote: text("internal_note"), // sólo REPI Admin
  resolution: text("resolution"), // respuesta visible para la persona con sesión
  resolvedBy: text("resolved_by"),
  resolvedAt: ts("resolved_at"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("support_ticket_status_idx").on(t.status, t.severity), index("support_ticket_user_idx").on(t.userId)]);

// Límites de intentos compartidos entre instancias serverless (D74). La memoria de cada función no sirve en Vercel.
// rate_limit: tabla de Better Auth (modelo «rateLimit»). app_rate_limit: ventana fija por clave para las rutas propias.
export const rateLimit = pgTable("rate_limit", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const appRateLimit = pgTable("app_rate_limit", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});

// Subida directa al almacenamiento (D71): el navegador sube al bucket con una URL firmada de un solo uso y el servidor
// confirma tamaño y tipo real antes de crear el media_object. Una intención vencida se borra junto con su archivo.
export const uploadIntent = pgTable("upload_intent", {
  id: id(),
  ownerUserId: text("owner_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["request_video", "attempt_video", "community_image", "exercise_video"] }).notNull(),
  orgId: text("org_id"),
  storageKey: text("storage_key").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: now("created_at"),
}, (t) => [index("upload_intent_expires_idx").on(t.expiresAt)]);

// Pedido del alumno a su coach (F-CL-13/F-CL-15). El destino equipo de sala llega con la Etapa 5.
export const studentRequest = pgTable("student_request", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  coachClientId: text("coach_client_id").notNull().references(() => coachClient.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["rutina", "tecnica", "consulta", "programa"] }).notNull(),
  text: text("text").notNull(),
  videoId: text("video_id").references(() => mediaObject.id),
  status: text("status", { enum: ["open", "done"] }).notNull().default("open"),
  resolvedBy: text("resolved_by").references(() => user.id),
  resolvedAt: ts("resolved_at"),
  seenResolvedAt: ts("seen_resolved_at"),
  // D206: preferencias del pedido de programa (objetivo, días, experiencia, lesiones…). Sólo en kind «programa».
  brief: jsonb("brief").$type<ProgramRequestBrief>(),
  createdAt: now("created_at"),
}, (t) => [index("request_relation_idx").on(t.coachClientId, t.status), index("request_user_idx").on(t.userId)]);

// Solicitud de acceso del coach a un tipo de dato (F-PR-06): pendiente → concedida/rechazada/vencida.
export const accessRequest = pgTable("access_request", {
  id: id(),
  coachClientId: text("coach_client_id").notNull().references(() => coachClient.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  reason: text("reason").notNull(),
  requestedBy: text("requested_by").notNull().references(() => user.id),
  status: text("status", { enum: ["pending", "granted", "denied", "expired"] }).notNull().default("pending"),
  expiresAt: ts("expires_at").notNull(),
  decidedAt: ts("decided_at"),
  createdAt: now("created_at"),
}, (t) => [
  index("access_request_relation_idx").on(t.coachClientId),
  uniqueIndex("access_request_pending_unique").on(t.coachClientId, t.item).where(sql`status = 'pending'`),
]);

// Historial visible para el alumno: quién pidió, recibió, perdió o leyó cada tipo de dato.
export const dataAccessLog = pgTable("data_access_log", {
  id: id(),
  subjectUserId: text("subject_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id"),
  orgId: text("org_id"),
  item: text("item").notNull(),
  action: text("action", { enum: ["requested", "granted", "denied", "revoked", "read"] }).notNull(),
  at: now("at"),
}, (t) => [index("data_access_subject_idx").on(t.subjectUserId, t.at)]);

// ── Operación del gym (Etapa 5) ─────────────────────────────────────────────
// Relación activa elegida por la persona cuando tiene coach privado y gym (D11/GAP-24).
export const userPref = pgTable("user_pref", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  activeRelationId: text("active_relation_id"),
  notificationsSeenAt: ts("notifications_seen_at"), // F-NT-01: lo anterior figura como leído en el centro de notificaciones
  weightUnit: text("weight_unit", { enum: ["kg", "lb"] }).notNull().default("kg"), // F-HX-23: sólo presentación; se guarda en kg
  wishes: jsonb("wishes"), // D139 (TrainingWishes): objetivo, días, minutos, gustos y lo que evita (para la IA)
  // D188: apariencia de la cuenta (no del rol ni del gimnasio). «system» sigue al dispositivo. theme_changed_at es el
  // momento del cambio en el dispositivo: entre dos dispositivos gana el último (también si uno estaba sin conexión).
  theme: text("theme", { enum: ["light", "dark", "system"] }).notNull().default("system"),
  themeChangedAt: ts("theme_changed_at"),
  // D195: ayudas de primera vez ya vistas u omitidas ({ clave: fecha ISO }). Sin contenido personal; sirve para no repetirlas.
  hints: jsonb("hints").$type<Record<string, string>>().notNull().default({}),
  updatedAt: now("updated_at"),
}, (t) => [check("user_pref_theme_valid", sql`${t.theme} in ('light', 'dark', 'system')`)]);

// Turno planificado (grilla del gerente, F-GM-04). Un código por persona, sede y día.
export const shiftPlan = pgTable("shift_plan", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // AAAA-MM-DD hora AR
  code: text("code", { enum: ["M", "T", "N", "P", "F"] }).notNull(),
  createdBy: text("created_by").notNull().references(() => user.id),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("shift_plan_unique").on(t.userId, t.locationId, t.date), index("shift_plan_loc_idx").on(t.locationId, t.date)]);

// D170: horario habitual del profesor en una sede (días y franja, hora AR). Con él el turno empieza y termina solo.
export const staffHours = pgTable("staff_hours", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  days: jsonb("days").$type<number[]>().notNull(), // 0 = domingo … 6 = sábado
  from: text("from").notNull(), // HH:MM
  to: text("to").notNull(),
  setBy: text("set_by").notNull().references(() => user.id),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("staff_hours_unique").on(t.userId, t.locationId), index("staff_hours_org_idx").on(t.orgId)]);

// Turno trabajado (F-GT-01): inicio y cierre reales. Base de "horas de turno".
// D131: con quién entrena hoy el socio (elige entre los profesores en turno de su sede). Uno por socio y día; se puede cambiar.
export const gymFloorPick = pgTable("gym_floor_pick", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id, { onDelete: "cascade" }),
  gymMemberId: text("gym_member_id").notNull().references(() => gymMember.id, { onDelete: "cascade" }),
  trainerUserId: text("trainer_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  day: text("day").notNull(), // AAAA-MM-DD, hora AR
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("gym_floor_pick_day").on(t.gymMemberId, t.day), index("gym_floor_pick_trainer_idx").on(t.trainerUserId, t.day)]);

export const shiftLog = pgTable("shift_log", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  planId: text("plan_id").references(() => shiftPlan.id, { onDelete: "set null" }),
  startedAt: ts("started_at").notNull(),
  endedAt: ts("ended_at"),
  // D126: disponibilidad declarada por el profesor durante el turno. No es ubicación ni presencia comprobada.
  availability: text("availability", { enum: ["available", "busy"] }).notNull().default("available"),
  source: text("source", { enum: ["manual", "schedule"] }).notNull().default("manual"), // D170: «schedule» lo abrió y lo cierra el horario
}, (t) => [
  uniqueIndex("shift_log_one_active").on(t.userId).where(sql`ended_at is null`),
  index("shift_log_loc_idx").on(t.locationId, t.startedAt),
]);

// Tarea de la cola de asistencia (F-GT-02). Resumen saneado: sin salud ni contenido de chats.
export const gymTask = pgTable("gym_task", {
  id: id(),
  number: integer("number").notNull(), // número legible por organización (T-1041)
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  gymMemberId: text("gym_member_id").references(() => gymMember.id, { onDelete: "cascade" }),
  category: text("category", { enum: ["programa_nuevo", "actualizar_programa", "tecnica", "onboarding", "seguimiento", "consulta"] }).notNull(),
  priority: text("priority", { enum: ["alta", "media", "baja"] }).notNull().default("media"),
  // D126: in_progress (en atención) y follow_up (pendiente de seguimiento) son los estados de REPI Connect.
  status: text("status", { enum: ["open", "pending_acceptance", "in_progress", "follow_up", "done", "cancelled"] }).notNull().default("open"),
  source: text("source", { enum: ["app", "sala", "traspaso", "gerencia", "recepcion", "entrenador"] }).notNull(),
  summary: text("summary").notNull(),
  videoId: text("video_id").references(() => mediaObject.id),
  assigneeUserId: text("assignee_user_id").references(() => user.id),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  dueAt: ts("due_at"),
  takenAt: ts("taken_at"),
  takenBy: text("taken_by").references(() => user.id), // primera toma: base de "respuesta mediana"
  completedAt: ts("completed_at"),
  completedBy: text("completed_by").references(() => user.id),
  completedOffShift: boolean("completed_off_shift").notNull().default(false),
  seenByMemberAt: ts("seen_by_member_at"),
  // REPI Connect (D126): motivo elegido por el socio, referencias estructuradas al ejercicio, clave de reintento,
  // inicio de la atención, cancelación y opinión opcional del socio («¿Te sirvió?»).
  reason: text("reason"),
  context: jsonb("context").$type<{ exerciseId?: string; exerciseName?: string; sessionId?: string; programExerciseId?: string; setIndex?: number; programName?: string; fromSession?: boolean; brief?: ProgramRequestBrief }>(), // D206: brief en «programa_nuevo»
  clientKey: text("client_key"),
  startedAt: ts("started_at"),
  cancelledAt: ts("cancelled_at"),
  cancelledBy: text("cancelled_by").references(() => user.id, { onDelete: "set null" }),
  feedback: text("feedback", { enum: ["yes", "no"] }),
  feedbackAt: ts("feedback_at"),
}, (t) => [
  uniqueIndex("gym_task_number_unique").on(t.orgId, t.number),
  uniqueIndex("gym_task_client_key").on(t.createdBy, t.clientKey).where(sql`client_key is not null`),
  index("gym_task_loc_status_idx").on(t.locationId, t.status),
  index("gym_task_assignee_idx").on(t.assigneeUserId, t.status),
  index("gym_task_member_idx").on(t.gymMemberId),
]);

// Traspaso de turno (F-GT-04): una solicitud de traspaso no acredita aceptación.
export const gymHandoff = pgTable("gym_handoff", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  fromUserId: text("from_user_id").notNull().references(() => user.id),
  toUserId: text("to_user_id").references(() => user.id), // null = cola compartida
  shiftLogId: text("shift_log_id").references(() => shiftLog.id),
  createdAt: now("created_at"),
}, (t) => [index("gym_handoff_loc_idx").on(t.locationId, t.createdAt)]);

export const gymHandoffItem = pgTable("gym_handoff_item", {
  handoffId: text("handoff_id").notNull().references(() => gymHandoff.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => gymTask.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  acceptedAt: ts("accepted_at"),
  acceptedBy: text("accepted_by").references(() => user.id),
}, (t) => [primaryKey({ columns: [t.handoffId, t.taskId] })]);

// Historial de una solicitud de REPI Connect (D126). Sólo se agregan filas: un trigger impide modificarlas.
// note = registro institucional del equipo (no lo ve el socio); memberNote = lo que el equipo le deja al socio.
export const gymTaskEvent = pgTable("gym_task_event", {
  id: id(),
  taskId: text("task_id").notNull().references(() => gymTask.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["created", "taken", "started", "note", "follow_up", "transferred", "accepted", "declined", "reassigned", "resolved", "cancelled", "member_comment", "feedback"] }).notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  toUserId: text("to_user_id").references(() => user.id, { onDelete: "set null" }),
  note: text("note"),
  memberNote: text("member_note"),
  dueAt: ts("due_at"),
  createdAt: now("created_at"),
}, (t) => [index("gym_task_event_task_idx").on(t.taskId, t.createdAt), index("gym_task_event_org_idx").on(t.orgId, t.createdAt)]);

// Notas del socio: institucionales (equipo de la sede) y personales (sólo su autor). Recursos distintos (MASTER_PROMPT §11).
export const gymNote = pgTable("gym_note", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  gymMemberId: text("gym_member_id").notNull().references(() => gymMember.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id").notNull().references(() => user.id),
  kind: text("kind", { enum: ["institutional", "personal"] }).notNull(),
  text: text("text").notNull(),
  createdAt: now("created_at"),
  deletedAt: ts("deleted_at"),
}, (t) => [index("gym_note_member_idx").on(t.gymMemberId, t.kind)]);

// Invitación a reseñar tras una interacción elegible (F-RV-01/06). Una por tarea.
export const reviewInvite = pgTable("review_invite", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  taskId: text("task_id").notNull().references(() => gymTask.id, { onDelete: "cascade" }).unique(),
  memberUserId: text("member_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  trainerUserId: text("trainer_user_id").notNull().references(() => user.id),
  category: text("category").notNull(),
  status: text("status", { enum: ["pending", "done", "dismissed", "expired", "suppressed"] }).notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: now("created_at"),
}, (t) => [index("review_invite_member_idx").on(t.memberUserId, t.status)]);

// Reseña verificada. El entrenador la ve sin nombre; la gerencia con nombre; otros socios no (DEC-08).
export const review = pgTable("review", {
  id: id(),
  inviteId: text("invite_id").notNull().references(() => reviewInvite.id).unique(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  trainerUserId: text("trainer_user_id").notNull().references(() => user.id),
  memberUserId: text("member_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  stars: integer("stars").notNull(),
  dim1: integer("dim1"),
  dim2: integer("dim2"),
  dim3: integer("dim3"),
  text: text("text"),
  status: text("status", { enum: ["published", "reported", "edit_requested", "removed"] }).notNull().default("published"),
  response: text("response"),
  respondedAt: ts("responded_at"),
  createdAt: now("created_at"),
}, (t) => [index("review_trainer_idx").on(t.trainerUserId), index("review_loc_idx").on(t.locationId, t.createdAt)]);

// Casos de moderación: reporte de reseña o disputa de atribución (F-RV-03/04, F-GP-04).
export const moderationCase = pgTable("moderation_case", {
  id: id(),
  number: integer("number").notNull(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  type: text("type", { enum: ["review_report", "attribution"] }).notNull(),
  reviewId: text("review_id").references(() => review.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => gymTask.id, { onDelete: "cascade" }),
  openedBy: text("opened_by").notNull().references(() => user.id),
  reason: text("reason").notNull(),
  detail: text("detail"),
  status: text("status", { enum: ["open", "in_review", "resolved", "appealed"] }).notNull().default("open"),
  outcome: text("outcome", { enum: ["keep", "remove", "edit", "fix", "reject"] }),
  resolvedBy: text("resolved_by").references(() => user.id),
  resolvedAt: ts("resolved_at"),
  appealUntil: ts("appeal_until"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("moderation_case_number_unique").on(t.orgId, t.number), index("moderation_case_loc_idx").on(t.locationId, t.status)]);

export const moderationLog = pgTable("moderation_log", {
  id: id(),
  caseId: text("case_id").notNull().references(() => moderationCase.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull().references(() => user.id),
  text: text("text").notNull(),
  at: now("at"),
}, (t) => [index("moderation_log_case_idx").on(t.caseId, t.at)]);

// ── Mensajería (D40) ────────────────────────────────────────────────────────
// Conversación por relación: coach_client (coach ↔ alumno) o gym_member (equipo de sala de la sede ↔ socio).
export const conversation = pgTable("conversation", {
  id: id(),
  kind: text("kind", { enum: ["coach_client", "gym_member"] }).notNull(),
  relationId: text("relation_id").notNull(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").references(() => gymLocation.id),
  memberUserId: text("member_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  lastMessageAt: ts("last_message_at"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("conversation_relation_unique").on(t.kind, t.relationId), index("conversation_org_idx").on(t.orgId, t.lastMessageAt)]);

// id generado en el cliente: reintentar no duplica (MASTER_PROMPT §13).
export const message = pgTable("message", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
  senderUserId: text("sender_user_id").notNull().references(() => user.id),
  senderSide: text("sender_side", { enum: ["member", "staff"] }).notNull(),
  body: text("body").notNull(),
  createdAt: now("created_at"),
}, (t) => [index("message_conv_idx").on(t.conversationId, t.createdAt)]);

// Marcadores de entrega y lectura por participante.
export const conversationMarker = pgTable("conversation_marker", {
  conversationId: text("conversation_id").notNull().references(() => conversation.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  side: text("side", { enum: ["member", "staff"] }).notNull(),
  deliveredAt: ts("delivered_at"),
  readAt: ts("read_at"),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] })]);

// ── Comunidad del gym (Etapa 6) ─────────────────────────────────────────────
// Novedad o descuento. Sede null = todas las sedes (F-HX-13). Descuento con vencimiento opcional.
export const communityPost = pgTable("community_post", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").references(() => gymLocation.id),
  type: text("type", { enum: ["novedad", "descuento"] }).notNull(),
  title: text("title").notNull(),
  text: text("text").notNull().default(""),
  badge: text("badge"),
  imageId: text("image_id").references(() => mediaObject.id),
  validUntil: text("valid_until"), // AAAA-MM-DD hora AR, sólo descuentos
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  deletedAt: ts("deleted_at"),
}, (t) => [index("community_post_org_idx").on(t.orgId, t.createdAt)]);

export const challenge = pgTable("challenge", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").references(() => gymLocation.id),
  title: text("title").notNull(),
  rule: text("rule").notNull(),
  unit: text("unit", { enum: ["reps", "seg", "kg"] }).notNull(),
  lowerIsBetter: boolean("lower_is_better").notNull().default(false),
  category: text("category", { enum: ["fuerza", "resistencia", "cardio", "movilidad"] }).notNull(),
  // D168: ejercicio que mide el desafío (opcional): con él REPI le avisa a cada socio en qué puesto entraría con lo que ya levanta.
  exerciseId: text("exercise_id").references(() => exercise.id),
  prize: text("prize").notNull(),
  endsOn: text("ends_on").notNull(), // AAAA-MM-DD hora AR (último día para subir intentos)
  recordValue: integer("record_value_x10"), // récord vigente ×10 (kilos con un decimal sin flotantes)
  recordAttemptId: text("record_attempt_id"),
  // D172: «proposed» la propuso un socio y espera al profe; «rejected» no se publicó.
  status: text("status", { enum: ["active", "closed", "removed", "proposed", "rejected"] }).notNull().default("active"),
  closedAt: ts("closed_at"),
  createdBy: text("created_by").notNull().references(() => user.id),
  proposedBy: text("proposed_by").references(() => user.id), // D172: socio que lo propuso (null: lo creó el gym)
  difficulty: integer("difficulty"), // D172: 1 fácil, 2 media, 3 difícil (puntos del nivel al validar)
  reviewedBy: text("reviewed_by").references(() => user.id),
  reviewNote: text("review_note"),
  createdAt: now("created_at"),
}, (t) => [index("challenge_org_idx").on(t.orgId, t.status)]);

// Intento con video obligatorio (DEC-14). Valor ×10 para aceptar kilos con un decimal.
export const challengeAttempt = pgTable("challenge_attempt", {
  id: id(),
  challengeId: text("challenge_id").notNull().references(() => challenge.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  gymMemberId: text("gym_member_id").notNull().references(() => gymMember.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  valueX10: integer("value_x10").notNull(),
  division: text("division", { enum: ["F", "M"] }), // opcional, declarada por el socio
  videoId: text("video_id").references(() => mediaObject.id), // null: validación en sala (D165)
  method: text("method", { enum: ["video", "in_person"] }).notNull().default("video"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  reason: text("reason"),
  newRecord: boolean("new_record").notNull().default(false),
  decidedBy: text("decided_by").references(() => user.id),
  decidedAt: ts("decided_at"),
  createdAt: now("created_at"),
}, (t) => [
  index("attempt_challenge_idx").on(t.challengeId, t.status),
  index("attempt_user_idx").on(t.userId),
  uniqueIndex("attempt_one_pending").on(t.challengeId, t.userId).where(sql`status = 'pending'`),
]);

// Logro permanente (F-GC-05). Único por tipo y fuente: no se duplica.
export const achievement = pgTable("achievement", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }), // null = logro de entrenamiento REPI
  kind: text("kind", { enum: ["first_session", "month_12", "challenge_validated", "gym_record", "trophy"] }).notNull(), // trophy: D166
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  sourceKey: text("source_key").notNull(),
  seenAt: ts("seen_at"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("achievement_unique").on(t.userId, t.kind, t.sourceKey)]);

// Premio a retirar en recepción (F-GC-07). Código corto para el mostrador.
export const prize = pgTable("prize", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  challengeId: text("challenge_id").notNull().references(() => challenge.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull().references(() => challengeAttempt.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  code: text("code").notNull(),
  status: text("status", { enum: ["ready", "delivered"] }).notNull().default("ready"),
  deliveredBy: text("delivered_by").references(() => user.id),
  deliveredAt: ts("delivered_at"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("prize_one_per_challenge").on(t.challengeId, t.userId), uniqueIndex("prize_code_unique").on(t.orgId, t.code)]);

// Catálogo informativo de recepción (F-GC-04, F-HX-14). Precio en pesos enteros; sin checkout.
export const catalogItem = pgTable("catalog_item", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").references(() => gymLocation.id),
  category: text("category").notNull(),
  name: text("name").notNull(),
  priceArs: integer("price_ars").notNull(),
  promo: text("promo"),
  highlighted: boolean("highlighted").notNull().default(false),
  available: boolean("available").notNull().default(true),
  imageId: text("image_id").references(() => mediaObject.id),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  deletedAt: ts("deleted_at"),
}, (t) => [index("catalog_org_idx").on(t.orgId)]);

// Asistencia presencial (F-GC-08, D22): entidad propia; hoy la registra recepción al validar el carnet.
export const attendance = pgTable("attendance", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  gymMemberId: text("gym_member_id").notNull().references(() => gymMember.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["recepcion_qr", "checkin"] }).notNull(), // checkin = ingreso validado por QR o por el equipo (D127)
  recordedBy: text("recorded_by").references(() => user.id),
  at: now("at"),
}, (t) => [index("attendance_member_idx").on(t.gymMemberId, t.at), index("attendance_loc_idx").on(t.locationId, t.at)]);

// Avisos al socio (resultado de intentos, premios entregados). Sin contenido sensible.
export const memberNotice = pgTable("member_notice", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["attempt_approved", "attempt_rejected", "prize_delivered", "challenge_closed", "proposal_approved", "proposal_rejected", "club_notice"] }).notNull(), // club_notice: aviso del equipo de REPI sobre el Club (D196)
  title: text("title").notNull(),
  body: text("body").notNull(),
  refId: text("ref_id"),
  seenAt: ts("seen_at"),
  createdAt: now("created_at"),
}, (t) => [index("member_notice_user_idx").on(t.userId, t.seenAt)]);

// ── Repi Club (F-RC-01..05) ─────────────────────────────────────────────────
// Participación voluntaria por comunidad (hoy: el gym). Unirse no comparte salud ni datos de la app.
export const clubMember = pgTable("club_member", {
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  showName: boolean("show_name").notNull().default(true),
  inRanking: boolean("in_ranking").notNull().default(false),
  joinedAt: now("joined_at"),
  leftAt: ts("left_at"),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] })]);

export const clubPost = pgTable("club_post", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["text", "achievement", "progress", "session", "image"] }).notNull(),
  text: text("text").notNull().default(""),
  imageId: text("image_id").references(() => mediaObject.id), // D169: foto de la publicación
  achievementId: text("achievement_id").references(() => achievement.id, { onDelete: "cascade" }),
  payload: jsonb("payload"), // instantánea elegida por la persona (evolución de un ejercicio o sesión); nunca el historial completo
  status: text("status", { enum: ["visible", "hidden", "removed"] }).notNull().default("visible"),
  createdAt: now("created_at"),
}, (t) => [index("club_post_org_idx").on(t.orgId, t.createdAt)]);

export const clubReaction = pgTable("club_reaction", {
  postId: text("post_id").notNull().references(() => clubPost.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const clubComment = pgTable("club_comment", {
  id: id(),
  postId: text("post_id").notNull().references(() => clubPost.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  status: text("status", { enum: ["visible", "hidden", "removed"] }).notNull().default("visible"),
  createdAt: now("created_at"),
}, (t) => [index("club_comment_post_idx").on(t.postId, t.createdAt)]);

export const clubReport = pgTable("club_report", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  targetType: text("target_type", { enum: ["post", "comment"] }).notNull(),
  targetId: text("target_id").notNull(),
  reporterId: text("reporter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "kept", "removed"] }).notNull().default("open"),
  decidedBy: text("decided_by").references(() => user.id),
  decidedAt: ts("decided_at"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("club_report_once").on(t.targetType, t.targetId, t.reporterId), index("club_report_org_idx").on(t.orgId, t.status)]);

export const clubBlock = pgTable("club_block", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  blockedUserId: text("blocked_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
}, (t) => [primaryKey({ columns: [t.userId, t.blockedUserId] })]);

// ── Anexo 26/10: alta comercial y condiciones por cliente ───────────────────
export const commercialLead = pgTable("commercial_lead", {
  id: id(),
  // D205: «partner» = empresa, inversor o posible aliado (Experience Hub). Texto libre en la base: sin CHECK que migrar.
  kind: text("kind", { enum: ["gym", "coach", "partner"] }).notNull(),
  orgName: text("org_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email"), // D205: email o WhatsApp; el servicio exige al menos uno
  phone: text("phone"),
  message: text("message"),
  status: text("status", { enum: ["new", "contacted", "converted", "discarded"] }).notNull().default("new"),
  // D205: de dónde vino (sin datos personales): «qr», «utm», «referral» o «direct», la campaña y el perfil elegido.
  source: text("source"),
  campaign: text("campaign"),
  interest: text("interest"),
  // D209: código del vendedor si llegó por su enlace personal (/conoce?ref=V-XXXXXX). Indica origen, no atribuye una venta.
  referralCode: text("referral_code"),
  createdAt: now("created_at"),
});

/**
 * D205 · Experience Hub: eventos anónimos del sitio comercial (/conoce y /qr). Sin cookies, IP, user agent ni cuenta: un
 * identificador aleatorio por visita que vive en la pestaña (sessionStorage) y se pierde al cerrarla. Sólo nombres de
 * evento, perfil y destino de una lista cerrada; campañas y UTM recortadas. Se borran a los 400 días (job diario).
 */
export const siteEvent = pgTable("site_event", {
  id: id(),
  at: now("at"),
  name: text("name").notNull(),
  visit: text("visit"),
  profile: text("profile"),
  target: text("target"),
  source: text("source"),
  campaign: text("campaign"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  path: text("path"),
  device: text("device"),
}, (t) => [index("site_event_at_idx").on(t.at), index("site_event_name_at_idx").on(t.name, t.at)]);

export const clientContract = pgTable("client_contract", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }).unique(),
  kind: text("kind", { enum: ["gym", "coach"] }).notNull(),
  legalName: text("legal_name"), // opcional (D117): muchos coaches no tienen razón social al dar el alta
  responsibleName: text("responsible_name").notNull(),
  responsibleEmail: text("responsible_email").notNull(),
  currency: text("currency", { enum: ["ARS", "USD"] }).notNull().default("ARS"),
  scope: text("scope", { enum: ["organization", "locations"] }).notNull().default("organization"),
  scopeNote: text("scope_note"), // cobertura y regla de conteo sin duplicados (pendiente por contrato)
  quantityDefinition: text("quantity_definition"), // qué socios/alumnos entran como vigentes (pendiente por contrato)
  status: text("status", { enum: ["draft", "accepted", "enabled", "suspended", "ended"] }).notNull().default("draft"),
  termsVersion: text("terms_version"),
  acceptedMethod: text("accepted_method", { enum: ["external", "in_app"] }),
  acceptedRef: text("accepted_ref"),
  acceptedAt: ts("accepted_at"),
  acceptedRecordedBy: text("accepted_recorded_by").references(() => user.id),
  enabledBy: text("enabled_by").references(() => user.id),
  enabledAt: ts("enabled_at"),
  trialUntil: text("trial_until"), // sólo si Admin la concede explícitamente
  setupDoneAt: ts("setup_done_at"),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
});

// Cantidad acordada y precio por unidad versionados por separado, con vigencia, motivo y evidencia (anexo §9).
export const contractTerm = pgTable("contract_term", {
  id: id(),
  contractId: text("contract_id").notNull().references(() => clientContract.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["quantity", "unit_price"] }).notNull(),
  version: integer("version").notNull(),
  value: integer("value").notNull(), // cantidad o precio en unidades menores
  currency: text("currency"),
  source: text("source", { enum: ["admin_declared", "integration"] }).notNull().default("admin_declared"),
  effectiveFrom: text("effective_from").notNull(), // AAAA-MM-DD
  reason: text("reason").notNull(),
  evidence: text("evidence"),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("contract_term_version_unique").on(t.contractId, t.kind, t.version)]);

// Snapshot del período: vista previa o cierre simulado. Nunca un cobro real sin política completa (anexo §12).
export const billingSnapshot = pgTable("billing_snapshot", {
  id: id(),
  contractId: text("contract_id").notNull().references(() => clientContract.id, { onDelete: "cascade" }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  mode: text("mode", { enum: ["simulated_close"] }).notNull(),
  quantity: integer("quantity").notNull(),
  quantityTermId: text("quantity_term_id").notNull(),
  unitPriceMinor: integer("unit_price_minor").notNull(),
  priceTermId: text("price_term_id").notNull(),
  currency: text("currency").notNull(),
  subtotalMinor: integer("subtotal_minor").notNull(),
  lines: jsonb("lines").notNull(),
  rules: jsonb("rules").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("billing_snapshot_period_unique").on(t.contractId, t.periodStart, t.mode)]);

// Pagos externos registrados por REPI Admin (F-AD-04, N-O22, D102). Propuesta de piloto sujeta a confirmación: el cliente
// paga por fuera (transferencia, etc.) y Admin registra el pago con evidencia, opcionalmente contra un cierre de período.
// No es una pasarela, no mueve dinero y no es comprobante fiscal. Anular exige motivo; nada se borra.
export const billingPayment = pgTable("billing_payment", {
  id: id(),
  contractId: text("contract_id").notNull().references(() => clientContract.id, { onDelete: "cascade" }),
  snapshotId: text("snapshot_id").references(() => billingSnapshot.id),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  receivedOn: text("received_on").notNull(), // AAAA-MM-DD
  method: text("method", { enum: ["transferencia", "deposito", "efectivo", "otro"] }).notNull(),
  reference: text("reference").notNull(), // evidencia: n.º de operación, comprobante del cliente, etc.
  note: text("note"),
  status: text("status", { enum: ["recorded", "voided"] }).notNull().default("recorded"),
  voidReason: text("void_reason"),
  createdBy: text("created_by").notNull().references(() => user.id),
  voidedBy: text("voided_by").references(() => user.id),
  createdAt: now("created_at"),
  voidedAt: ts("voided_at"),
}, (t) => [index("billing_payment_contract_idx").on(t.contractId, t.receivedOn)]);

// Avisos al cliente sobre sus condiciones (F-BL-05, D103): cambio de cantidad/precio, prueba, suspensión y criterio de
// conteo. Inmutables; el correo al responsable queda con su entrega real y el «Entendido» con quién y cuándo.
export const contractNotice = pgTable("contract_notice", {
  id: id(),
  contractId: text("contract_id").notNull().references(() => clientContract.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["term", "trial", "trial_ending", "trial_ended", "suspended", "enabled", "definition"] }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  effectiveFrom: text("effective_from"), // AAAA-MM-DD, si el cambio tiene fecha de efecto
  dedupeKey: text("dedupe_key").notNull(), // los automáticos (fin de prueba) no se repiten
  // set null: borrar una cuenta (procedimiento D75) no puede quedar bloqueado por un aviso; el aviso se conserva.
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }), // null = generado por el job o autor borrado
  createdAt: now("created_at"),
  delivery: text("delivery", { enum: ["submitted", "local_only", "failed"] }),
  ackBy: text("ack_by").references(() => user.id, { onDelete: "set null" }),
  ackAt: ts("ack_at"),
}, (t) => [uniqueIndex("contract_notice_dedupe_uq").on(t.contractId, t.dedupeKey), index("contract_notice_contract_idx").on(t.contractId, t.createdAt)]);

export const correctionRequest = pgTable("correction_request", {
  id: id(),
  contractId: text("contract_id").notNull().references(() => clientContract.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").notNull().references(() => user.id),
  text: text("text").notNull(),
  status: text("status", { enum: ["open", "answered"] }).notNull().default("open"),
  answer: text("answer"),
  createdAt: now("created_at"),
});

// ── Push real (anexo §7) ────────────────────────────────────────────────────
export const pushSubscription = pgTable("push_subscription", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: now("created_at"),
  lastOkAt: ts("last_ok_at"),
  failCount: integer("fail_count").notNull().default(0),
  revokedAt: ts("revoked_at"),
}, (t) => [index("push_sub_user_idx").on(t.userId)]);

export const notifyPref = pgTable("notify_pref", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  paused: boolean("paused").notNull().default(false),
  updatedAt: now("updated_at"),
});

// Cola persistente: la solicitud o alerta ya está guardada; el push es un aviso con reintentos y deduplicación.
export const notificationOutbox = pgTable("notification_outbox", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["join_request", "join_escalation", "floor_alert", "join_resolved", "assist_new", "assist_wait", "assist_transfer", "assist_due", "assist_update", "challenge_new", "challenge_beaten", "program_brief", "brain_coaching"] }).notNull(), // program_brief: D206 · brain_coaching: avisos de REPI (D210), sólo adultos con push de REPI activado
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  status: text("status", { enum: ["pending", "sent", "failed", "skipped"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: now("next_attempt_at"),
  lastError: text("last_error"),
  createdAt: now("created_at"),
  sentAt: ts("sent_at"),
  readAt: ts("read_at"), // F-HX-26: leído en el centro de avisos del staff (independiente de si el push llegó)
}, (t) => [index("outbox_pending_idx").on(t.status, t.nextAttemptAt), index("outbox_user_idx").on(t.userId, t.createdAt)]);

// Alerta de sala por sensación de serie (pedido 26/10): sólo sesiones del programa institucional del gym.
export const floorAlert = pgTable("floor_alert", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  gymMemberId: text("gym_member_id").notNull().references(() => gymMember.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  setLogId: text("set_log_id").notNull().unique(),
  exerciseName: text("exercise_name").notNull(),
  feel: text("feel").notNull(),
  ackBy: text("ack_by").references(() => user.id),
  ackAt: ts("ack_at"),
  createdAt: now("created_at"),
}, (t) => [index("floor_alert_loc_idx").on(t.locationId, t.createdAt)]);

// Perfil del Club: la persona elige qué mostrar (pedido 26/10). Nada se muestra por defecto.
export const clubProfile = pgTable("club_profile", {
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  bio: text("bio"),
  showLevel: boolean("show_level").notNull().default(false),
  showcase: jsonb("showcase").notNull().default([]), // exerciseIds elegidos
  avatarId: text("avatar_id").references(() => mediaObject.id), // D169: foto de perfil (sólo la ven socios del Club)
  showMaxes: boolean("show_maxes").notNull().default(false), // D169: mostrar sus máximos por ejercicio
  updatedAt: now("updated_at"),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] })]);

// ── Gym Access Control (D127) ───────────────────────────────────────────────
// Política por gimnasio. Sin fila = módulo apagado (comportamiento anterior). La activa REPI Admin; el modo lo elige el dueño.
export const gymAccessPolicy = pgTable("gym_access_policy", {
  orgId: text("org_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  mode: text("mode", { enum: ["open", "hybrid", "strict"] }).notNull().default("hybrid"),
  strictActions: jsonb("strict_actions").$type<string[]>().notNull().default([]),
  qrTtlSec: integer("qr_ttl_sec").notNull().default(30),
  passHours: integer("pass_hours").notNull().default(3),
  geoMode: text("geo_mode", { enum: ["off", "optional", "required"] }).notNull().default("off"),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: now("updated_at"),
});

// Pantalla autorizada que muestra el QR de ingreso de una sede (tablet de recepción). Sólo se guarda el hash del secreto.
export const gymAccessDisplay = pgTable("gym_access_display", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  secretHash: text("secret_hash").notNull().unique(),
  // D146: "access" = QR de ingreso (D127); "ranking" = TV de la sala con el ranking en vivo. Un secreto nunca sirve para el otro uso.
  purpose: text("purpose", { enum: ["access", "ranking"] }).notNull().default("access"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
  lastSeenAt: ts("last_seen_at"),
  revokedAt: ts("revoked_at"),
}, (t) => [index("gym_access_display_org_idx").on(t.orgId)]);

// Intento de ingreso y, si fue aceptado, el pase presencial con vencimiento. Sin coordenadas: sólo el resultado de ubicación.
export const gymCheckin = pgTable("gym_checkin", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  gymMemberId: text("gym_member_id").references(() => gymMember.id, { onDelete: "cascade" }),
  method: text("method", { enum: ["qr", "qr_geo", "staff", "desk"] }).notNull(),
  result: text("result", { enum: ["ok", "denied"] }).notNull(),
  reason: text("reason"),
  nonce: text("nonce"),
  displayId: text("display_id"),
  geoResult: text("geo_result", { enum: ["inside", "outside", "inaccurate", "stale", "unavailable"] }),
  verifiedBy: text("verified_by").references(() => user.id, { onDelete: "set null" }),
  note: text("note"),
  issuedAt: ts("issued_at"),
  expiresAt: ts("expires_at"),
  revokedAt: ts("revoked_at"),
  revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
}, (t) => [
  uniqueIndex("gym_checkin_user_nonce").on(t.userId, t.nonce).where(sql`result = 'ok' and nonce is not null`),
  index("gym_checkin_org_idx").on(t.orgId, t.createdAt),
  index("gym_checkin_user_idx").on(t.userId, t.expiresAt),
]);

// ── Personal Progress & Body Tracking 1.0 (D199–D202) ───────────────────────
// Peso corporal (D199): dato sensible y PERSONAL. Sólo lo lee su dueño: ni el coach, ni el gimnasio, ni REPI Admin en la
// operación ordinaria. Una medición por día (guardar otro valor ese día lo reemplaza: no hay duplicados por doble toque o
// reintento). Gramos enteros: exacto en kg y lb (la unidad es sólo presentación, F-HX-23). Borrar es definitivo.
export const bodyWeightEntry = pgTable("body_weight_entry", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  measuredOn: text("measured_on").notNull(), // AAAA-MM-DD, fecha local de la medición (la elige la persona)
  weightG: integer("weight_g").notNull(),
  source: text("source", { enum: ["manual"] }).notNull().default("manual"), // origen; otros (balanza, importación) en el futuro
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  uniqueIndex("body_weight_user_day_unique").on(t.userId, t.measuredOn),
  check("body_weight_range", sql`${t.weightG} between 20000 and 400000`),
  check("body_weight_day_valid", sql`${t.measuredOn} ~ '^\\d{4}-\\d{2}-\\d{2}$'`),
  check("body_weight_source_valid", sql`${t.source} in ('manual')`),
]);

// Objetivo de peso (D199): uno vigente por persona. El punto de partida es la primera medición salvo que la persona indique
// otro (start_source = 'manual', con su fecha): se conserva la procedencia. Cambiar la meta reemplaza la fila (revision + 1).
export const bodyGoal = pgTable("body_goal", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  startSource: text("start_source", { enum: ["first_entry", "manual"] }).notNull().default("first_entry"),
  startWeightG: integer("start_weight_g"), // sólo con start_source = 'manual'
  startOn: text("start_on"),
  targetWeightG: integer("target_weight_g").notNull(),
  targetOn: text("target_on"), // fecha objetivo opcional
  revision: integer("revision").notNull().default(1),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  check("body_goal_target_range", sql`${t.targetWeightG} between 20000 and 400000`),
  check("body_goal_start_range", sql`${t.startWeightG} is null or ${t.startWeightG} between 20000 and 400000`),
  check("body_goal_start_valid", sql`${t.startSource} = 'first_entry' or (${t.startWeightG} is not null and ${t.startOn} is not null)`),
]);

// Fotos de progreso (D200): privadas, sin IA ni análisis. El archivo es un media_object «progress_photo» que sólo su dueño
// puede leer; nunca aparecen en comunidad, Club, mensajes, pedidos, notificaciones ni informes. La clave foránea hace que la
// purga de archivos la reconozca como referencia (D196). Borrar la foto borra la fila y el archivo (con reintento por la purga).
export const progressPhoto = pgTable("progress_photo", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  mediaId: text("media_id").notNull().unique().references(() => mediaObject.id),
  takenOn: text("taken_on").notNull(), // AAAA-MM-DD elegida por la persona
  pose: text("pose", { enum: ["front", "side", "back", "other"] }), // etiqueta de organización, no un resultado
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: now("created_at"),
}, (t) => [
  index("progress_photo_user_idx").on(t.userId, t.takenOn),
  check("progress_photo_pose_valid", sql`${t.pose} is null or ${t.pose} in ('front', 'side', 'back', 'other')`),
  check("progress_photo_day_valid", sql`${t.takenOn} ~ '^\\d{4}-\\d{2}-\\d{2}$'`),
]);

// Novedades de REPI (D202): comunicados del producto que publica REPI Admin sin desplegar. Se muestran en la campanita del
// alumno y en «Novedades de REPI» de coach y gimnasio, según la audiencia (verificada en el servidor). Texto plano y destino
// de una lista cerrada: sin HTML ni enlaces externos. Editar un anuncio publicado conserva su id (no genera otro aviso).
export const productAnnouncement = pgTable("product_announcement", {
  id: id(),
  kind: text("kind", { enum: ["feature", "improvement", "important", "guide", "notice"] }).notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  ctaLabel: text("cta_label"),
  destination: text("destination").notNull().default("none"),
  audience: text("audience").array().notNull(),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  publishAt: ts("publish_at"), // visible desde (publicar ahora o programado)
  archivedAt: ts("archived_at"),
  revision: integer("revision").notNull().default(1),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  index("announcement_status_idx").on(t.status, t.publishAt),
  check("announcement_kind_valid", sql`${t.kind} in ('feature', 'improvement', 'important', 'guide', 'notice')`),
  check("announcement_status_valid", sql`${t.status} in ('draft', 'published', 'archived')`),
  check("announcement_published_at", sql`${t.status} = 'draft' or ${t.publishAt} is not null`),
]);

// Lectura por persona y anuncio (D202): una fila por persona aunque tenga varios roles (no se duplica ni reaparece).
export const announcementRead = pgTable("announcement_read", {
  announcementId: text("announcement_id").notNull().references(() => productAnnouncement.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  readAt: now("read_at"),
}, (t) => [primaryKey({ columns: [t.announcementId, t.userId] }), index("announcement_read_user_idx").on(t.userId)]);

// ── REPI Intelligence Core («brain», Adaptive Coaching 3.0, D210) ───────────
// Contrato: docs/adaptive/ADAPTIVE_COACHING_3.md §4. Todo es de la persona: cascada a `user` (y a `organization` donde
// aplica), entra en exportMyData y en el borrado de la cuenta. Nadie más lo lee: ni el entrenador, ni la gerencia, ni REPI
// Admin (que sólo ve agregados de ai_usage). Los servicios filtran SIEMPRE por el user_id de la sesión (RLS sin políticas).

// Preferencias de asistencia. Sin fila = DEFAULT_PREFS del dominio (proactivo dentro de la app, push apagado).
export const brainPref = pgTable("brain_pref", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  proactive: boolean("proactive").notNull().default(true), // avisos dentro de la app
  push: boolean("push").notNull().default(false), // requiere opt-in (y ser adulto)
  categories: jsonb("categories").$type<BrainPrefs["categories"]>().notNull()
    .default({ training: true, progress: true, performance: true, motivation: false, weekly: true }),
  quietStart: text("quiet_start").notNull().default("22:00"), // HH:MM, hora de Buenos Aires
  quietEnd: text("quiet_end").notNull().default("08:00"),
  maxPerDay: integer("max_per_day").notNull().default(2),
  autonomy: integer("autonomy").notNull().default(1), // 0 informa · 1 propone y confirma · 2 ejecuta lo de bajo riesgo habilitado
  tone: text("tone", { enum: ["normal", "breve"] }).notNull().default("normal"),
  updatedAt: now("updated_at"),
}, (t) => [
  check("brain_pref_autonomy_valid", sql`${t.autonomy} in (0, 1, 2)`),
  check("brain_pref_tone_valid", sql`${t.tone} in ('normal', 'breve')`),
  check("brain_pref_max_per_day_range", sql`${t.maxPerDay} between 0 and 10`),
  check("brain_pref_quiet_valid", sql`${t.quietStart} ~ '^([01]\\d|2[0-3]):[0-5]\\d$' and ${t.quietEnd} ~ '^([01]\\d|2[0-3]):[0-5]\\d$'`),
]);

// Memoria: preferencias declaradas, decisiones, resultados y contexto temporal. Los hechos NO se guardan (se leen de la
// base). Procedencia (`source`, `ref`), vencimiento por tipo (`expires_at`) e invalidación (`revoked_at`). La purga diaria
// borra lo vencido; borrar desde «Lo que REPI recuerda» es definitivo.
export const brainMemory = pgTable("brain_memory", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["preference", "decision", "outcome", "temporal"] }).notNull(),
  key: text("key").notNull(), // clave normalizada: "tone", "avoid_exercise", "minutes_today", "rejected:<kind>"…
  value: jsonb("value").$type<unknown>(),
  text: text("text").notNull(), // lo que se le muestra a la persona
  source: text("source", { enum: ["user", "system", "coach"] }).notNull(),
  ref: jsonb("ref").$type<Record<string, string | number | null>>(), // dato de origen (programa, sesión, ejercicio) para invalidar
  createdAt: now("created_at"),
  expiresAt: ts("expires_at"), // null = hasta que se borre (preferencias)
  revokedAt: ts("revoked_at"),
}, (t) => [
  index("brain_memory_user_key_idx").on(t.userId, t.kind, t.key),
  index("brain_memory_expires_idx").on(t.expiresAt),
  check("brain_memory_kind_valid", sql`${t.kind} in ('preference', 'decision', 'outcome', 'temporal')`),
  check("brain_memory_source_valid", sql`${t.source} in ('user', 'system', 'coach')`),
]);

// Conversación con REPI: una abierta por persona (índice único parcial); cerrarla deja empezar otra.
export const brainThread = pgTable("brain_thread", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
  closedAt: ts("closed_at"),
}, (t) => [
  uniqueIndex("brain_thread_one_open").on(t.userId).where(sql`${t.closedAt} is null`),
  index("brain_thread_user_idx").on(t.userId, t.createdAt),
]);

// Mensajes (retención: 180 días). `via` dice de dónde sale cada respuesta de REPI (reglas, IA, sin IA por límite, seguridad).
// El id puede venir del cliente: un reintento del mismo mensaje no lo duplica.
export const brainMessage = pgTable("brain_message", {
  id: id(),
  threadId: text("thread_id").notNull().references(() => brainThread.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "repi"] }).notNull(),
  text: text("text").notNull(),
  cards: jsonb("cards").$type<ReplyCard[]>(),
  actions: jsonb("actions").$type<ActionProposal[]>(),
  section: text("section"), // Section del dominio: desde dónde se habló
  ref: jsonb("ref").$type<Record<string, string | number | null>>(),
  via: text("via", { enum: ["rules", "ai", "fallback", "safety"] }),
  feedback: integer("feedback"), // −1 / 1 (sólo respuestas de REPI)
  createdAt: now("created_at"),
}, (t) => [
  index("brain_message_thread_idx").on(t.threadId, t.createdAt),
  index("brain_message_user_idx").on(t.userId, t.createdAt),
  check("brain_message_role_valid", sql`${t.role} in ('user', 'repi')`),
  check("brain_message_via_valid", sql`${t.via} is null or ${t.via} in ('rules', 'ai', 'fallback', 'safety')`),
  check("brain_message_feedback_valid", sql`${t.feedback} is null or ${t.feedback} in (-1, 1)`),
]);

// Avisos y tarjetas, también los suprimidos (métricas). (user_id, dedupe_key) único: el cron de cada minuto y sus reintentos
// no duplican (caso 49). `priority` = rango de la categoría (0 = seguridad). La categoría y el texto van en `payload`.
export const brainIntervention = pgTable("brain_intervention", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  priority: integer("priority").notNull(),
  channel: text("channel", { enum: ["card", "inline", "push"] }).notNull(),
  status: text("status", { enum: ["pending", "shown", "accepted", "dismissed", "never", "expired", "cancelled", "suppressed"] }).notNull().default("pending"),
  reason: text("reason"), // motivo de supresión o de cierre (SuppressReason, «program_changed»…)
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  evidence: jsonb("evidence").$type<Evidence | null>(),
  programVersionId: text("program_version_id").references(() => programVersion.id, { onDelete: "set null" }), // vuelve obsoleto el aviso
  createdAt: now("created_at"),
  shownAt: ts("shown_at"),
  resolvedAt: ts("resolved_at"),
  expiresAt: ts("expires_at"),
}, (t) => [
  uniqueIndex("brain_intervention_dedupe_unique").on(t.userId, t.dedupeKey),
  index("brain_intervention_user_idx").on(t.userId, t.createdAt),
  index("brain_intervention_status_idx").on(t.status, t.expiresAt),
  check("brain_intervention_channel_valid", sql`${t.channel} in ('card', 'inline', 'push')`),
  check("brain_intervention_status_valid", sql`${t.status} in ('pending', 'shown', 'accepted', 'dismissed', 'never', 'expired', 'cancelled', 'suppressed')`),
]);

// Registro de acciones. (user_id, idempotency_key) único: un reintento devuelve la misma acción (caso 23).
export const brainAction = pgTable("brain_action", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // ActionKind del dominio (catálogo en código)
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status", { enum: ["proposed", "confirmed", "executed", "failed", "blocked", "cancelled"] }).notNull().default("proposed"),
  autonomy: integer("autonomy").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"), // código, nunca contenido
  createdAt: now("created_at"),
  executedAt: ts("executed_at"),
}, (t) => [
  uniqueIndex("brain_action_idempotency_unique").on(t.userId, t.idempotencyKey),
  index("brain_action_user_idx").on(t.userId, t.createdAt),
  check("brain_action_status_valid", sql`${t.status} in ('proposed', 'confirmed', 'executed', 'failed', 'blocked', 'cancelled')`),
  check("brain_action_autonomy_valid", sql`${t.autonomy} in (0, 1, 2)`),
]);

// Uso de IA SIN contenido (ni prompt ni respuesta). Retención: 400 días. La fila nace al admitir la llamada con
// `outcome` null («en curso»: cuenta para la concurrencia por un rato corto) y se completa al terminar. user_id null = sistema.
export const aiUsage = pgTable("ai_usage", {
  id: id(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
  task: text("task").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0), // total de entrada (incluye los cacheados)
  cachedTokens: integer("cached_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costMicros: integer("cost_micros").notNull().default(0), // micro-dólares estimados según PRICES de server/brain/gateway.ts
  latencyMs: integer("latency_ms"),
  outcome: text("outcome", { enum: ["ok", "error", "timeout", "cancelled", "refused", "bad_output", "budget", "quota", "breaker", "concurrency", "cache"] }),
  createdAt: now("created_at"),
}, (t) => [
  index("ai_usage_created_idx").on(t.createdAt),
  index("ai_usage_user_idx").on(t.userId, t.createdAt),
  index("ai_usage_org_idx").on(t.orgId, t.createdAt),
  check("ai_usage_outcome_valid", sql`${t.outcome} is null or ${t.outcome} in ('ok', 'error', 'timeout', 'cancelled', 'refused', 'bad_output', 'budget', 'quota', 'breaker', 'concurrency', 'cache')`),
  check("ai_usage_counts_valid", sql`${t.inputTokens} >= 0 and ${t.cachedTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.costMicros} >= 0`),
]);

// Límites configurables desde REPI Admin. Sin fila = valores por defecto del gateway. `scope`: global, org:<id> o user:<id>.
export const aiPolicy = pgTable("ai_policy", {
  scope: text("scope").primaryKey(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: now("updated_at"),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
}, (t) => [check("ai_policy_scope_valid", sql`${t.scope} = 'global' or ${t.scope} ~ '^(org|user):.+$'`)]);

// Circuit breaker por tarea: 5 fallas seguidas → abierto 10 minutos; después deja pasar (semiabierto) y una falla lo reabre.
export const aiBreaker = pgTable("ai_breaker", {
  task: text("task").primaryKey(),
  failures: integer("failures").notNull().default(0),
  openedUntil: ts("opened_until"),
  updatedAt: now("updated_at"),
});

// ── REPI Sales Force & Commission OS (D209) ─────────────────────────────────
// Un vendedor es una relación de la misma identidad con REPI: no toca platformRole ni hereda permisos de Admin.
// Dinero en unidades menores enteras (bigint en modo número: hasta 2^53). Fechas de negocio AAAA-MM-DD (hora argentina).
const money = (name: string) => bigint(name, { mode: "number" });

export const salesRegion = pgTable("sales_region", {
  id: id(),
  name: text("name").notNull().unique(),
  provinces: text("provinces"),
  note: text("note"),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
});

export const salesRep = pgTable("sales_rep", {
  id: id(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  city: text("city"),
  province: text("province"),
  zone: text("zone"),
  regionId: text("region_id").references(() => salesRegion.id, { onDelete: "set null" }),
  status: text("status", { enum: ["invited", "pending_acceptance", "active", "paused", "suspended", "terminated"] }).notNull().default("invited"),
  statusReason: text("status_reason"),
  managerRepId: text("manager_rep_id").references((): AnyPgColumn => salesRep.id, { onDelete: "set null" }),
  engagement: text("engagement", { enum: ["independent", "agency", "employee", "other"] }).notNull().default("independent"),
  canSellCoaches: boolean("can_sell_coaches").notNull().default(false),
  payoutFrequency: text("payout_frequency", { enum: ["per_sale", "weekly", "biweekly", "monthly", "custom"] }).notNull().default("monthly"),
  payoutNote: text("payout_note"),
  agreementRef: text("agreement_ref"), // referencia al acuerdo comercial firmado por fuera (no el documento)
  joinedAt: ts("joined_at"),
  profileCompletedAt: ts("profile_completed_at"),
  terminatedAt: ts("terminated_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  uniqueIndex("sales_rep_user_uq").on(t.userId).where(sql`${t.userId} is not null`),
  uniqueIndex("sales_rep_email_uq").on(t.email).where(sql`${t.status} <> 'terminated'`),
  index("sales_rep_status_idx").on(t.status),
]);

export const salesRepInvitation = pgTable("sales_rep_invitation", {
  id: id(),
  repId: text("rep_id").notNull().references(() => salesRep.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] }).notNull().default("pending"),
  delivery: text("delivery", { enum: ["pending", "submitted", "local_only", "failed"] }).notNull().default("pending"),
  expiresAt: ts("expires_at").notNull(),
  invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
  acceptedBy: text("accepted_by").references(() => user.id, { onDelete: "set null" }),
  acceptedAt: ts("accepted_at"),
  revokedAt: ts("revoked_at"),
  createdAt: now("created_at"),
}, (t) => [index("sales_rep_invitation_rep_idx").on(t.repId), uniqueIndex("sales_rep_invitation_pending_uq").on(t.repId).where(sql`${t.status} = 'pending'`)]);

export const commissionPlan = pgTable("commission_plan", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
});

// Versiones inmutables una vez aprobadas: un cambio es una versión nueva con su vigencia.
export const commissionPlanVersion = pgTable("commission_plan_version", {
  id: id(),
  planId: text("plan_id").notNull().references(() => commissionPlan.id),
  version: integer("version").notNull(),
  rules: jsonb("rules").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  status: text("status", { enum: ["draft", "approved"] }).notNull().default("draft"),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
  approvedAt: ts("approved_at"),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("commission_plan_version_uq").on(t.planId, t.version)]);

export const salesRepPlan = pgTable("sales_rep_plan", {
  id: id(),
  repId: text("rep_id").notNull().references(() => salesRep.id),
  planVersionId: text("plan_version_id").notNull().references(() => commissionPlanVersion.id),
  effectiveFrom: text("effective_from").notNull(),
  reason: text("reason").notNull(),
  assignedBy: text("assigned_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
}, (t) => [index("sales_rep_plan_rep_idx").on(t.repId, t.effectiveFrom)]);

export const salesProspect = pgTable("sales_prospect", {
  id: id(),
  ownerRepId: text("owner_rep_id").references(() => salesRep.id),
  originRepId: text("origin_rep_id").references(() => salesRep.id),
  kind: text("kind", { enum: ["gym", "coach"] }).notNull().default("gym"),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  cuit: text("cuit"),
  city: text("city"),
  province: text("province"),
  address: text("address"),
  estMembers: integer("est_members"),
  locations: integer("locations"),
  website: text("website"),
  instagram: text("instagram"),
  phone: text("phone"),
  email: text("email"),
  contactName: text("contact_name"),
  contactRole: text("contact_role"),
  contactChannel: text("contact_channel", { enum: ["whatsapp", "phone", "email", "in_person"] }),
  notes: text("notes"),
  source: text("source").notNull().default("field"),
  capturedOn: text("captured_on").notNull(),
  orgId: text("org_id").references(() => organization.id, { onDelete: "set null" }),
  commercialLeadId: text("commercial_lead_id").references(() => commercialLead.id, { onDelete: "set null" }),
  duplicateStatus: text("duplicate_status", { enum: ["none", "review", "cleared", "associated"] }).notNull().default("none"),
  archivedAt: ts("archived_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("sales_prospect_owner_idx").on(t.ownerRepId), index("sales_prospect_org_idx").on(t.orgId)]);

export const salesOpportunity = pgTable("sales_opportunity", {
  id: id(),
  prospectId: text("prospect_id").notNull().references(() => salesProspect.id, { onDelete: "cascade" }),
  repId: text("rep_id").references(() => salesRep.id),
  kind: text("kind", { enum: ["new", "renewal", "modification"] }).notNull().default("new"),
  stage: text("stage", { enum: ["new", "contacted", "interested", "meeting", "demo", "proposal", "negotiation", "declared", "pending_validation", "won", "lost"] }).notNull().default("new"),
  category: text("category", { enum: ["hot", "warm", "cold"] }),
  probabilityPct: integer("probability_pct"),
  estMembers: integer("est_members"),
  estUnitPriceMinor: money("est_unit_price_minor"),
  currency: text("currency", { enum: ["ARS", "USD"] }).notNull().default("ARS"),
  nextContactOn: text("next_contact_on"),
  expectedCloseOn: text("expected_close_on"),
  lostReason: text("lost_reason"),
  notes: text("notes"),
  stageChangedAt: now("stage_changed_at"),
  revision: integer("revision").notNull().default(1),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [index("sales_opportunity_rep_idx").on(t.repId, t.stage), index("sales_opportunity_prospect_idx").on(t.prospectId)]);

export const salesDeal = pgTable("sales_deal", {
  id: id(),
  repId: text("rep_id").notNull().references(() => salesRep.id),
  idempotencyKey: text("idempotency_key").notNull(),
  prospectId: text("prospect_id").references(() => salesProspect.id, { onDelete: "set null" }),
  opportunityId: text("opportunity_id").references(() => salesOpportunity.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["new", "renewal", "modification"] }).notNull().default("new"),
  clientKind: text("client_kind", { enum: ["gym", "coach"] }).notNull(),
  orgId: text("org_id").references(() => organization.id, { onDelete: "set null" }),
  businessName: text("business_name").notNull(),
  legalName: text("legal_name"),
  cuit: text("cuit"),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  city: text("city"),
  province: text("province"),
  address: text("address"),
  locations: jsonb("locations").$type<string[]>(),
  members: integer("members").notNull(),
  unitPriceMinor: money("unit_price_minor").notNull(),
  currency: text("currency", { enum: ["ARS", "USD"] }).notNull(),
  periodicity: text("periodicity", { enum: ["monthly", "quarterly", "semiannual", "annual"] }).notNull(),
  contractStart: text("contract_start").notNull(),
  durationMonths: integer("duration_months"),
  renewalNote: text("renewal_note"),
  discountBps: integer("discount_bps").notNull().default(0),
  setupFeeMinor: money("setup_fee_minor").notNull().default(0),
  specialConditions: text("special_conditions"),
  evidence: text("evidence").notNull(),
  closedOn: text("closed_on").notNull(),
  notes: text("notes"),
  status: text("status", { enum: ["declared", "needs_correction", "approved", "rejected", "withdrawn"] }).notNull().default("declared"),
  reviewNote: text("review_note"),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: ts("reviewed_at"),
  revision: integer("revision").notNull().default(1),
  contractId: text("contract_id").references(() => clientContract.id, { onDelete: "set null" }),
  planVersionId: text("plan_version_id").references(() => commissionPlanVersion.id),
  split: jsonb("split").$type<{ repId: string; shareBps: number }[]>(),
  previousMembers: integer("previous_members").notNull().default(0),
  approvedAt: ts("approved_at"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("sales_deal_idem_uq").on(t.repId, t.idempotencyKey), index("sales_deal_status_idx").on(t.status), index("sales_deal_contract_idx").on(t.contractId)]);

export const salesActivity = pgTable("sales_activity", {
  id: id(),
  prospectId: text("prospect_id").references(() => salesProspect.id, { onDelete: "cascade" }),
  opportunityId: text("opportunity_id").references(() => salesOpportunity.id, { onDelete: "set null" }),
  dealId: text("deal_id").references(() => salesDeal.id, { onDelete: "set null" }),
  repId: text("rep_id").references(() => salesRep.id),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  actorRole: text("actor_role", { enum: ["rep", "admin", "system"] }).notNull(),
  kind: text("kind").notNull(), // ACTIVITY_KINDS o eventos del sistema (stage, assign, deal, duplicate)
  summary: text("summary").notNull(),
  dueOn: text("due_on"),
  doneAt: ts("done_at"),
  createdAt: now("created_at"),
}, (t) => [index("sales_activity_prospect_idx").on(t.prospectId, t.createdAt), index("sales_activity_rep_due_idx").on(t.repId, t.dueOn)]);

// Atribución comercial: una fila vigente por organización (endedAt null); los cambios cierran la anterior.
export const salesAttribution = pgTable("sales_attribution", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  contractId: text("contract_id"),
  originRepId: text("origin_rep_id").references(() => salesRep.id),
  opportunityRepId: text("opportunity_rep_id").references(() => salesRep.id),
  closingRepId: text("closing_rep_id").references(() => salesRep.id),
  assignedRepId: text("assigned_rep_id").references(() => salesRep.id),
  dealId: text("deal_id").references(() => salesDeal.id, { onDelete: "set null" }),
  source: text("source"),
  effectiveFrom: text("effective_from").notNull(),
  endedAt: ts("ended_at"),
  reason: text("reason").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("sales_attribution_current_uq").on(t.orgId).where(sql`${t.endedAt} is null`), index("sales_attribution_assigned_idx").on(t.assignedRepId)]);

export const salesRequest = pgTable("sales_request", {
  id: id(),
  kind: text("kind", { enum: ["duplicate_review", "attribution_claim", "payout_frequency"] }).notNull(),
  repId: text("rep_id").notNull().references(() => salesRep.id),
  prospectId: text("prospect_id").references(() => salesProspect.id, { onDelete: "set null" }),
  orgId: text("org_id").references(() => organization.id, { onDelete: "set null" }),
  payload: jsonb("payload"),
  message: text("message"),
  status: text("status", { enum: ["open", "approved", "rejected"] }).notNull().default("open"),
  resolution: text("resolution"),
  resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  resolvedAt: ts("resolved_at"),
  createdAt: now("created_at"),
}, (t) => [index("sales_request_status_idx").on(t.status), uniqueIndex("sales_request_freq_open_uq").on(t.repId).where(sql`${t.kind} = 'payout_frequency' and ${t.status} = 'open'`)]);

// Libro de comisiones. Inmutable (trigger en la migración 0050): se corrige con asientos nuevos, nunca editando.
export const commissionEntry = pgTable("commission_entry", {
  id: id(),
  key: text("key").notNull().unique(),
  repId: text("rep_id").notNull().references(() => salesRep.id),
  dealId: text("deal_id"),
  orgId: text("org_id"),
  contractId: text("contract_id"),
  planVersionId: text("plan_version_id"),
  componentIndex: integer("component_index"),
  component: text("component"),
  sourceType: text("source_type", { enum: ["deal", "payment", "tier", "adjustment", "reversal"] }).notNull(),
  sourceId: text("source_id"),
  reversalOf: text("reversal_of").unique(),
  baseMinor: money("base_minor"),
  rateBps: integer("rate_bps"),
  amountMinor: money("amount_minor").notNull(),
  currency: text("currency").notNull(),
  accrualOn: text("accrual_on").notNull(),
  availableOn: text("available_on").notNull(),
  concept: text("concept").notNull(),
  reason: text("reason"),
  createdBy: text("created_by"),
  createdAt: now("created_at"),
}, (t) => [index("commission_entry_rep_idx").on(t.repId, t.availableOn), index("commission_entry_deal_idx").on(t.dealId)]);

export const payoutBatch = pgTable("payout_batch", {
  id: id(),
  repId: text("rep_id").notNull().references(() => salesRep.id),
  currency: text("currency").notNull(),
  cutoffOn: text("cutoff_on").notNull(),
  frequency: text("frequency").notNull(),
  status: text("status", { enum: ["draft", "approved", "partially_paid", "paid", "cancelled"] }).notNull().default("draft"),
  totalMinor: money("total_minor").notNull(),
  paidMinor: money("paid_minor").notNull().default(0),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  note: text("note"),
  snapshot: jsonb("snapshot"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
  approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
  approvedAt: ts("approved_at"),
  cancelledBy: text("cancelled_by").references(() => user.id, { onDelete: "set null" }),
  cancelledAt: ts("cancelled_at"),
  cancelReason: text("cancel_reason"),
}, (t) => [index("payout_batch_rep_idx").on(t.repId, t.createdAt), uniqueIndex("payout_batch_open_uq").on(t.repId, t.currency).where(sql`${t.status} in ('draft', 'approved')`)]);

export const payoutItem = pgTable("payout_item", {
  id: id(),
  batchId: text("batch_id").notNull().references(() => payoutBatch.id, { onDelete: "cascade" }),
  entryId: text("entry_id").notNull().references(() => commissionEntry.id).unique(),
  amountMinor: money("amount_minor").notNull(),
}, (t) => [index("payout_item_batch_idx").on(t.batchId)]);

export const payoutPayment = pgTable("payout_payment", {
  id: id(),
  batchId: text("batch_id").notNull().references(() => payoutBatch.id),
  amountMinor: money("amount_minor").notNull(),
  paidOn: text("paid_on").notNull(),
  method: text("method", { enum: ["transferencia", "deposito", "efectivo", "otro"] }).notNull(),
  reference: text("reference").notNull(),
  note: text("note"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status", { enum: ["recorded", "voided"] }).notNull().default("recorded"),
  voidReason: text("void_reason"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
  voidedBy: text("voided_by").references(() => user.id, { onDelete: "set null" }),
  voidedAt: ts("voided_at"),
}, (t) => [index("payout_payment_batch_idx").on(t.batchId)]);

export const salesTarget = pgTable("sales_target", {
  id: id(),
  repId: text("rep_id").notNull().references(() => salesRep.id),
  month: text("month").notNull(), // AAAA-MM
  metric: text("metric").notNull(),
  target: money("target").notNull(),
  currency: text("currency"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("sales_target_uq").on(t.repId, t.month, t.metric)]);

export const salesMaterial = pgTable("sales_material", {
  id: id(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  body: text("body"),
  version: integer("version").notNull().default(1),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  validUntil: text("valid_until"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  publishedAt: ts("published_at"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
});

export const salesNotice = pgTable("sales_notice", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  readAt: ts("read_at"),
  createdAt: now("created_at"),
}, (t) => [index("sales_notice_user_idx").on(t.userId, t.createdAt)]);
