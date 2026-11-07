-- Aplicación de 0047 en producción (D205, Experience Hub: /conoce y /qr), en UNA transacción. Mismo efecto que
-- `scripts/migrate.ts`: las sentencias del archivo, RLS activado en la tabla nueva (D68) y el registro en
-- drizzle.__drizzle_migrations (sha256 del archivo y `when` del journal). Si algo ya existe, falla entero.
-- Mismo manejo de roles que hosted-0046.sql (repi_app como dueño; postgres sólo con SET dentro de la transacción).
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0046 aplicada (ya en producción) y aprobación
-- explícita del titular. ADITIVA: una tabla nueva (site_event) y tres columnas nulas en commercial_lead; el email de un
-- contacto deja de ser obligatorio (se exige email o WhatsApp en el servicio). No modifica ni borra filas. El código actual
-- de producción es compatible con 0047 aplicada (siempre guarda el email y no lee lo nuevo): aplicar ANTES de integrar.
-- NO APLICADO. Ensayado en una base descartable con scripts/operations/verify-0047.sh.
-- Generado desde drizzle/0047_experience_hub.sql (sha256 e89b6a37812775518fea13cfa707d026ab2056b7dd37efc7df09d0af047fbff7).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
CREATE TABLE "site_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"visit" text,
	"profile" text,
	"target" text,
	"source" text,
	"campaign" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"path" text,
	"device" text
);
ALTER TABLE "commercial_lead" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "commercial_lead" ADD COLUMN "source" text;
ALTER TABLE "commercial_lead" ADD COLUMN "campaign" text;
ALTER TABLE "commercial_lead" ADD COLUMN "interest" text;
CREATE INDEX "site_event_at_idx" ON "site_event" USING btree ("at");
CREATE INDEX "site_event_name_at_idx" ON "site_event" USING btree ("name","at");
alter table public."site_event" enable row level security;
do $$ begin
  if not exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = 'site_event' and relrowsecurity) then raise exception '0047: falta site_event con RLS'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'commercial_lead' and column_name in ('source', 'campaign', 'interest')) <> 3 then raise exception '0047: faltan columnas de commercial_lead'; end if;
  if exists (select 1 from site_event) then raise exception '0047: datos inesperados'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('e89b6a37812775518fea13cfa707d026ab2056b7dd37efc7df09d0af047fbff7', 1794007905224);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
