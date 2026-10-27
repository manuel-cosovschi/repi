import { sql } from "drizzle-orm";
import {
  bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

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
  createdAt: now("created_at"),
}, (t) => [index("gym_location_org_idx").on(t.orgId)]);

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
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("exercise_org_name_unique").on(sql`coalesce(${t.orgId}, '')`, t.name)]);

// Programa: plantilla del coach o copia propia de un cliente (C04: nunca un objeto compartido).
export const program = pgTable("program", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["template", "client_copy", "member_copy"] }).notNull(),
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
  status: text("status", { enum: ["in_progress", "paused", "completed", "abandoned"] }).notNull().default("in_progress"),
  startedAt: ts("started_at").notNull(),
  lastResumedAt: ts("last_resumed_at"),
  activeMs: integer("active_ms").notNull().default(0),
  endedAt: ts("ended_at"),
  rpe: integer("rpe"),
  note: text("note"),
  revision: integer("revision").notNull().default(1), // control de versión para sincronización offline
  updatedAt: now("updated_at"),
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
  completedAt: ts("completed_at").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: now("updated_at"),
}, (t) => [
  uniqueIndex("set_log_unique").on(t.sessionId, t.programExerciseId, t.setIndex),
  index("set_log_exercise_idx").on(t.exerciseId, t.completedAt),
]);

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
  purpose: text("purpose", { enum: ["request_video", "attempt_video", "community_image"] }).notNull(), // request_video también para tareas del equipo de sala (D41)
  orgId: text("org_id"), // imágenes de comunidad: las ven los socios y el staff de esa organización
  storageKey: text("storage_key").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: now("created_at"),
  deletedAt: ts("deleted_at"),
});

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
  category: text("category", { enum: ["access", "training", "sync", "billing", "privacy", "other"] }).notNull(),
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
  purpose: text("purpose", { enum: ["request_video", "attempt_video", "community_image"] }).notNull(),
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
  updatedAt: now("updated_at"),
});

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

// Turno trabajado (F-GT-01): inicio y cierre reales. Base de "horas de turno".
export const shiftLog = pgTable("shift_log", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  locationId: text("location_id").notNull().references(() => gymLocation.id),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  planId: text("plan_id").references(() => shiftPlan.id, { onDelete: "set null" }),
  startedAt: ts("started_at").notNull(),
  endedAt: ts("ended_at"),
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
  status: text("status", { enum: ["open", "pending_acceptance", "done", "cancelled"] }).notNull().default("open"),
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
}, (t) => [
  uniqueIndex("gym_task_number_unique").on(t.orgId, t.number),
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
  prize: text("prize").notNull(),
  endsOn: text("ends_on").notNull(), // AAAA-MM-DD hora AR (último día para subir intentos)
  recordValue: integer("record_value_x10"), // récord vigente ×10 (kilos con un decimal sin flotantes)
  recordAttemptId: text("record_attempt_id"),
  status: text("status", { enum: ["active", "closed", "removed"] }).notNull().default("active"),
  closedAt: ts("closed_at"),
  createdBy: text("created_by").notNull().references(() => user.id),
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
  videoId: text("video_id").notNull().references(() => mediaObject.id),
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
  kind: text("kind", { enum: ["first_session", "month_12", "challenge_validated", "gym_record"] }).notNull(),
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
  source: text("source", { enum: ["recepcion_qr"] }).notNull(),
  recordedBy: text("recorded_by").references(() => user.id),
  at: now("at"),
}, (t) => [index("attendance_member_idx").on(t.gymMemberId, t.at), index("attendance_loc_idx").on(t.locationId, t.at)]);

// Avisos al socio (resultado de intentos, premios entregados). Sin contenido sensible.
export const memberNotice = pgTable("member_notice", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["attempt_approved", "attempt_rejected", "prize_delivered", "challenge_closed"] }).notNull(),
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
  kind: text("kind", { enum: ["text", "achievement", "progress", "session"] }).notNull(),
  text: text("text").notNull().default(""),
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
  kind: text("kind", { enum: ["gym", "coach"] }).notNull(),
  orgName: text("org_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  message: text("message"),
  status: text("status", { enum: ["new", "contacted", "converted", "discarded"] }).notNull().default("new"),
  createdAt: now("created_at"),
});

export const clientContract = pgTable("client_contract", {
  id: id(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }).unique(),
  kind: text("kind", { enum: ["gym", "coach"] }).notNull(),
  legalName: text("legal_name").notNull(),
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
  kind: text("kind", { enum: ["join_request", "join_escalation", "floor_alert", "join_resolved"] }).notNull(),
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
  updatedAt: now("updated_at"),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] })]);
