-- Aplicación de 0040 y 0041 en producción (D183/D184), en UNA transacción. Mismo efecto que `scripts/migrate.ts`:
-- sentencias de los archivos, registro en drizzle.__drizzle_migrations (hash sha256 del archivo y `when` del journal)
-- y RLS activado en la tabla nueva (D68). Si algo ya existe, falla y no queda nada a medias.
-- Ejecutado el 04/11/2026 02:25 UTC desde el editor SQL de Supabase (usuario `postgres`). Las tablas son de `repi_app` y
-- `postgres` tiene ADMIN sobre ese rol pero no SET: se concede SET dentro de la transacción, se crea todo como `repi_app`
-- (mismo dueño que el resto, como `scripts/migrate.ts`) y se revoca antes del commit. Las membresías quedan como estaban.
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
ALTER TABLE "set_log" ADD COLUMN "spec_id" text;
ALTER TABLE "set_log" ADD COLUMN "set_kind" text;
ALTER TABLE "set_log" ADD COLUMN "block_index" integer;
ALTER TABLE "set_log" ADD COLUMN "stage_index" integer;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('d312277675f1e372568c9446e4539d3ccedbd3972c3f732aa10ecf6b651af57e', 1793724334984);
CREATE TABLE "set_skip" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"session_id" text NOT NULL,
	"program_exercise_id" text NOT NULL,
	"set_index" integer NOT NULL,
	"spec_id" text,
	"skipped" boolean DEFAULT true NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "workout_session" ADD COLUMN "interval_state" jsonb;
ALTER TABLE "set_skip" ADD CONSTRAINT "set_skip_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "set_skip" ADD CONSTRAINT "set_skip_program_exercise_id_program_exercise_id_fk" FOREIGN KEY ("program_exercise_id") REFERENCES "public"."program_exercise"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "set_skip_unique" ON "set_skip" USING btree ("session_id","program_exercise_id","set_index");
insert into drizzle.__drizzle_migrations (hash, created_at) values ('b3e1eb0d7aa6c3b4d40174a1ba3309411ae58d54896b6f5f9e5b736c418c0751', 1793741232959);
alter table public.set_skip enable row level security;
reset role;
revoke repi_app from postgres granted by postgres;
commit;
