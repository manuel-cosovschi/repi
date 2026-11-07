-- Reversión de 0047 (D205). Sólo si se abandona también el código del Experience Hub: el código anterior no lee nada de
-- 0047, así que revertir el código NO requiere correr esto. Borra los eventos anónimos del sitio y el origen de los
-- contactos. Se NIEGA si hay contactos sin email (los dejó /conoce con sólo WhatsApp): el código anterior exige email.
-- En una transacción: todo o nada. Producción: igual que la aplicación (respaldo verde antes; como repi_app).
-- Migración: sha256 e89b6a37812775518fea13cfa707d026ab2056b7dd37efc7df09d0af047fbff7
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from commercial_lead where email is null) then
    raise exception '0047: hay contactos sólo con WhatsApp; completar su email o exportarlos antes de revertir';
  end if;
end $$;
drop table "site_event";
alter table "commercial_lead" drop column "source", drop column "campaign", drop column "interest";
alter table "commercial_lead" alter column "email" set not null;
delete from drizzle.__drizzle_migrations where hash = 'e89b6a37812775518fea13cfa707d026ab2056b7dd37efc7df09d0af047fbff7';
commit;
