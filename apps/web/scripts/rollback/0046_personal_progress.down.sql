-- Reversión de 0046 (D199–D202). Sólo si se abandona también el código de este bloque: el código anterior no lee nada de
-- 0046, así que revertir el código NO requiere correr esto. Borra DEFINITIVAMENTE pesos, objetivos, fotos (sus filas) y
-- novedades. Se NIEGA si hay mediciones, fotos o novedades publicadas: primero exportarlas o decidir qué hacer (abajo).
-- Los archivos de fotos en Storage NO se borran con esto: listarlos antes y borrarlos aparte si corresponde:
--   select m.storage_key from progress_photo p join media_object m on m.id = p.media_id;
-- En una transacción: todo o nada. Producción: igual que la aplicación (respaldo verde antes; como repi_app).
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from body_weight_entry) or exists (select 1 from body_goal) or exists (select 1 from progress_photo)
     or exists (select 1 from product_announcement where status <> 'draft') then
    raise exception '0046: hay datos de personas (pesos, objetivos, fotos) o novedades publicadas; exportarlos o decidir antes de revertir';
  end if;
end $$;
DROP TABLE IF EXISTS "announcement_read";
DROP TABLE IF EXISTS "product_announcement";
DROP TABLE IF EXISTS "progress_photo";
DROP TABLE IF EXISTS "body_goal";
DROP TABLE IF EXISTS "body_weight_entry";
delete from drizzle.__drizzle_migrations where hash = '322f74f7491b934dcc1360117f2a650a97838a22efa72f6d4521c0b2da5269e2';
commit;
