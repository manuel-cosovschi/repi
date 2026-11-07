-- Reversión de 0050 (D209, REPI Intelligence Core). Sólo si se abandona también el código de Adaptive Coaching 3.0: el
-- código anterior no lee nada de 0050, así que revertir el código NO requiere correr esto. Borra DEFINITIVAMENTE las nueve
-- tablas. Se NIEGA si hay datos de personas (preferencias, memoria, conversaciones, avisos o acciones): primero exportarlos
-- (exportMyData los incluye) o decidir qué hacer. ai_usage (uso sin contenido), ai_policy y ai_breaker se borran con el resto:
-- si hace falta conservar el registro de costos, copiarlo antes (select * from ai_usage).
-- En una transacción: todo o nada. Producción: igual que la aplicación (respaldo verde antes; como repi_app).
-- Migración: sha256 ca9d9c171b7a35f0c4a09afc214e13ae162785bc5d1b3208149abe03107f5e37
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from brain_pref) or exists (select 1 from brain_memory) or exists (select 1 from brain_message)
     or exists (select 1 from brain_action) or exists (select 1 from brain_intervention) then
    raise exception '0050: hay datos de personas en el cerebro (preferencias, memoria, conversaciones, avisos o acciones); exportarlos o decidir antes de revertir';
  end if;
end $$;
DROP TABLE IF EXISTS "brain_message";
DROP TABLE IF EXISTS "brain_thread";
DROP TABLE IF EXISTS "brain_memory";
DROP TABLE IF EXISTS "brain_intervention";
DROP TABLE IF EXISTS "brain_action";
DROP TABLE IF EXISTS "brain_pref";
DROP TABLE IF EXISTS "ai_usage";
DROP TABLE IF EXISTS "ai_policy";
DROP TABLE IF EXISTS "ai_breaker";
delete from drizzle.__drizzle_migrations where hash = 'ca9d9c171b7a35f0c4a09afc214e13ae162785bc5d1b3208149abe03107f5e37';
commit;
