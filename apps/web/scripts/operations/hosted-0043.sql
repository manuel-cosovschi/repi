-- Aplicación de 0043 en producción (D191), en UNA transacción. Mismo efecto que `scripts/migrate.ts`: las sentencias del
-- archivo y el registro en drizzle.__drizzle_migrations (sha256 del archivo y `when` del journal). Si algo ya existe, falla
-- y no queda nada a medias. Mismo manejo de roles que hosted-0042.sql (D187/D188).
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0042 aplicada (ya en producción) y la
-- comprobación previa de docs/TRAINING_INTELLIGENCE_2.md §Publicación. Sólo crea dos tablas nuevas: no modifica ni borra
-- filas existentes (set_log, workout_session, programas e historial quedan iguales). Preparado; NO ejecutado.
-- Generado desde drizzle/0043_training_intelligence.sql (sha256 7c551dc627ce7d15b8ed7d068bdaa4f4e4801c51de6790077127d57d9a92bc84).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
CREATE TABLE "training_proposal" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"coach_client_id" text,
	"gym_member_id" text,
	"exercise_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"algo_version" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_proposal_one_relation" CHECK (("training_proposal"."coach_client_id" is null) <> ("training_proposal"."gym_member_id" is null))
);
CREATE TABLE "training_target" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"program_exercise_id" text NOT NULL,
	"exercise_id" text NOT NULL,
	"version_id" text NOT NULL,
	"set_index" integer NOT NULL,
	"spec_id" text,
	"set_kind" text NOT NULL,
	"block_index" integer NOT NULL,
	"stage_index" integer NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"quality" text NOT NULL,
	"weight_kg" text,
	"reps_min" integer,
	"reps_max" integer,
	"reps_target" integer,
	"rir_target" integer,
	"rpe_target" double precision,
	"rest_sec" integer,
	"rest_suggest_sec" integer,
	"pending" boolean DEFAULT false NOT NULL,
	"detail" jsonb NOT NULL,
	"algo_version" text NOT NULL,
	"decision" text,
	"set_log_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"superseded_at" timestamp with time zone
);
ALTER TABLE "training_proposal" ADD CONSTRAINT "training_proposal_coach_client_id_coach_client_id_fk" FOREIGN KEY ("coach_client_id") REFERENCES "public"."coach_client"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_proposal" ADD CONSTRAINT "training_proposal_gym_member_id_gym_member_id_fk" FOREIGN KEY ("gym_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_proposal" ADD CONSTRAINT "training_proposal_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_proposal" ADD CONSTRAINT "training_proposal_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_program_exercise_id_program_exercise_id_fk" FOREIGN KEY ("program_exercise_id") REFERENCES "public"."program_exercise"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "training_target" ADD CONSTRAINT "training_target_version_id_program_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."program_version"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "training_proposal_open_unique" ON "training_proposal" USING btree ("coach_client_id","exercise_id","kind") WHERE status = 'open' and coach_client_id is not null;
CREATE UNIQUE INDEX "training_proposal_member_open_unique" ON "training_proposal" USING btree ("gym_member_id","exercise_id","kind") WHERE status = 'open' and gym_member_id is not null;
CREATE INDEX "training_proposal_rel_idx" ON "training_proposal" USING btree ("coach_client_id","created_at");
CREATE INDEX "training_proposal_member_idx" ON "training_proposal" USING btree ("gym_member_id","created_at");
CREATE UNIQUE INDEX "training_target_seq_unique" ON "training_target" USING btree ("session_id","program_exercise_id","set_index","seq");
CREATE UNIQUE INDEX "training_target_current_unique" ON "training_target" USING btree ("session_id","program_exercise_id","set_index") WHERE superseded_at is null;
CREATE INDEX "training_target_user_idx" ON "training_target" USING btree ("user_id","created_at");
-- Comprobación dentro de la transacción: si falta algo, se aborta y no queda nada aplicado.
do $$ begin
  if (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('training_target', 'training_proposal')) <> 2 then raise exception '0043: faltan tablas'; end if;
  if not exists (select 1 from pg_constraint where conname = 'training_proposal_one_relation') then raise exception '0043: falta la restricción de relación'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('7c551dc627ce7d15b8ed7d068bdaa4f4e4801c51de6790077127d57d9a92bc84', 1793812183272);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
