-- Reversión de 0056 (D218). Se niega si hay datos de captación: borrar expedientes, conversaciones o la lista de no contactar
-- sería perder historia comercial. Con las tablas vacías, las elimina y borra el registro de la migración.
-- Migración: drizzle/0056_lead_intelligence.sql (sha256 dc7377d5e089944db3b0c99c031cb0bcab85c1cbb0be4d00e27360ca79ce0cc8).
begin;
do $$ begin
  if exists (select 1 from lead_business) or exists (select 1 from lead_message) or exists (select 1 from lead_suppression) or exists (select 1 from lead_activity) then
    raise exception '0056: hay datos de captación; exportalos y decidí antes de revertir';
  end if;
end $$;
drop table lead_task, lead_activity, lead_message, lead_campaign, lead_fact, lead_suppression, lead_business, lead_run, lead_setting, lead_area cascade;
delete from drizzle.__drizzle_migrations where hash = 'dc7377d5e089944db3b0c99c031cb0bcab85c1cbb0be4d00e27360ca79ce0cc8';
commit;
