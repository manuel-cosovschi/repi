-- Reversión de 0057 (D221). Se niega si hay registros de Nutrición de personas: borrarlos sería perder datos personales que la
-- persona puede exportar. Con las tablas de personas vacías, elimina las 7 tablas (la caché de Open Food Facts se descarta) y
-- borra el registro de la migración.
-- Migración: drizzle/0057_nutrition.sql (sha256 ca4f3769acbb20e8ab58f469081859a9dad56ea65c79633ea9df5d2b8237b5b7).
begin;
do $$ begin
  if exists (select 1 from nutrition_entry) or exists (select 1 from nutrition_food) or exists (select 1 from nutrition_recipe)
     or exists (select 1 from nutrition_favorite) or exists (select 1 from nutrition_profile) or exists (select 1 from nutrition_day) then
    raise exception '0057: hay datos de Nutrición de personas; exportalos y decidí antes de revertir';
  end if;
end $$;
drop table nutrition_entry, nutrition_day, nutrition_favorite, nutrition_recipe, nutrition_food, nutrition_profile, off_product_cache cascade;
delete from drizzle.__drizzle_migrations where hash = 'ca4f3769acbb20e8ab58f469081859a9dad56ea65c79633ea9df5d2b8237b5b7';
commit;
