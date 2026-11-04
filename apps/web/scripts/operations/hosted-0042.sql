-- Aplicación de 0042 en producción (D188), en UNA transacción. Mismo efecto que `scripts/migrate.ts`: las sentencias del
-- archivo y el registro en drizzle.__drizzle_migrations (sha256 del archivo y `when` del journal). Si algo ya existe,
-- falla y no queda nada a medias. Mismo manejo de roles que hosted-0040-0041.sql (D187): se crea como `repi_app`, dueño
-- de las tablas, con SET concedido sólo dentro de la transacción y revocado antes del commit.
-- PRERREQUISITO: respaldo nuevo en el SSD con restauración verificada. Preparado; NO ejecutado todavía.
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
ALTER TABLE "user_pref" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;
ALTER TABLE "user_pref" ADD COLUMN "theme_changed_at" timestamp with time zone;
ALTER TABLE "user_pref" ADD CONSTRAINT "user_pref_theme_valid" CHECK ("user_pref"."theme" in ('light', 'dark', 'system'));
insert into drizzle.__drizzle_migrations (hash, created_at) values ('f999fafa620dc131eedccb1e5c571c1f669838bc4d8370a1db9819362dd7c252', 1793761258016);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
