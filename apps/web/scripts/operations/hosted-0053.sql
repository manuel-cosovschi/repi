-- Aplicación de 0053 en producción (REPI Control: política de rutinas por gimnasio, pantalla de consulta, credenciales de socios,
-- revocación de personal STF-09 y modalidad del contacto comercial), en UNA transacción.
-- Mismo efecto que `scripts/migrate.ts`: las sentencias del archivo, RLS en las tablas nuevas y el registro en
-- drizzle.__drizzle_migrations (sha256 del archivo y `when` del journal). Si algo ya existe, falla entero.
-- Mismo manejo de roles que hosted-0052.sql (repi_app como dueño; postgres sólo con SET dentro de la transacción).
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0052 aplicada (53 migraciones registradas) y
-- aprobación (máster REPI Control 1.0: migraciones aditivas autorizadas).
-- ADITIVA: tres tablas nuevas vacías (gym_kiosk, kiosk_credential, kiosk_session) y columnas con valor por defecto o nulas:
-- organization.routine_policy ('open' para TODAS las organizaciones: nadie queda supervisado), organization.kiosk_enabled
-- (false para todas), staff_membership.revoked_at/revoked_by (nulas) y commercial_lead.product_mode (nula). No modifica
-- filas existentes de otra forma (lo prueba verify-0053.sh). El código actual de producción es compatible con 0053 aplicada:
-- aplicar ANTES de integrar.
-- Generado desde drizzle/0053_repi_control.sql (sha256 a405b8466298862f9906f8d765a08e02f383a437d0e51724b2e4dea998ed9051).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
CREATE TABLE "gym_kiosk" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	CONSTRAINT "gym_kiosk_secret_hash_unique" UNIQUE("secret_hash")
);
CREATE TABLE "kiosk_credential" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"gym_member_id" text NOT NULL,
	"member_code" text NOT NULL,
	"pin_hash" text NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"issued_by" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "kiosk_credential_code_format" CHECK ("kiosk_credential"."member_code" ~ '^[0-9]{6}$')
);
CREATE TABLE "kiosk_session" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kiosk_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "kiosk_session_token_hash_unique" UNIQUE("token_hash")
);
ALTER TABLE "commercial_lead" ADD COLUMN "product_mode" text;
ALTER TABLE "organization" ADD COLUMN "routine_policy" text DEFAULT 'open' NOT NULL;
ALTER TABLE "organization" ADD COLUMN "kiosk_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "staff_membership" ADD COLUMN "revoked_at" timestamp with time zone;
ALTER TABLE "staff_membership" ADD COLUMN "revoked_by" text;
ALTER TABLE "gym_kiosk" ADD CONSTRAINT "gym_kiosk_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "gym_kiosk" ADD CONSTRAINT "gym_kiosk_location_id_gym_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."gym_location"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "gym_kiosk" ADD CONSTRAINT "gym_kiosk_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "gym_kiosk" ADD CONSTRAINT "gym_kiosk_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "kiosk_credential" ADD CONSTRAINT "kiosk_credential_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kiosk_credential" ADD CONSTRAINT "kiosk_credential_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kiosk_credential" ADD CONSTRAINT "kiosk_credential_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "kiosk_session" ADD CONSTRAINT "kiosk_session_kiosk_id_gym_kiosk_id_fk" FOREIGN KEY ("kiosk_id") REFERENCES "public"."gym_kiosk"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "kiosk_session" ADD CONSTRAINT "kiosk_session_credential_id_kiosk_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."kiosk_credential"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "gym_kiosk_org_idx" ON "gym_kiosk" USING btree ("org_id");
CREATE UNIQUE INDEX "kiosk_credential_code_unique" ON "kiosk_credential" USING btree ("org_id","member_code") WHERE revoked_at is null;
CREATE UNIQUE INDEX "kiosk_credential_member_unique" ON "kiosk_credential" USING btree ("gym_member_id") WHERE revoked_at is null;
CREATE INDEX "kiosk_session_kiosk_idx" ON "kiosk_session" USING btree ("kiosk_id");
ALTER TABLE "staff_membership" ADD CONSTRAINT "staff_membership_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "organization" ADD CONSTRAINT "organization_routine_policy_valid" CHECK ("organization"."routine_policy" in ('open', 'supervised'));
alter table public."gym_kiosk" enable row level security;
alter table public."kiosk_credential" enable row level security;
alter table public."kiosk_session" enable row level security;
do $$ begin
  if exists (select 1 from organization where routine_policy <> 'open' or kiosk_enabled) then raise exception '0053: alguna organización quedó supervisada o con pantalla'; end if;
  if exists (select 1 from staff_membership where revoked_at is not null or revoked_by is not null) then raise exception '0053: revocaciones inesperadas'; end if;
  if exists (select 1 from commercial_lead where product_mode is not null) then raise exception '0053: modalidad inesperada en contactos'; end if;
  if (select count(*) from pg_tables where schemaname = 'public' and tablename in ('gym_kiosk', 'kiosk_credential', 'kiosk_session') and rowsecurity) <> 3 then raise exception '0053: faltan tablas o RLS'; end if;
  if exists (select 1 from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'PUBLIC') and table_name in ('gym_kiosk', 'kiosk_credential', 'kiosk_session', 'organization', 'staff_membership', 'commercial_lead')) then raise exception '0053: permisos públicos'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('a405b8466298862f9906f8d765a08e02f383a437d0e51724b2e4dea998ed9051', 1794235622996);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
