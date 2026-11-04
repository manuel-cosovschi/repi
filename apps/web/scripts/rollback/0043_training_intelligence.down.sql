-- Reversión de 0043 (D191, Training Intelligence 2.0). Sólo si se abandona también el código del bloque 04/06: el código
-- anterior no lee estas tablas (probado: tests/training-intelligence.test.ts «código anterior con el esquema nuevo»), así
-- que revertir el código NO requiere correr esto. Pierde únicamente los objetivos que REPI emitió y las propuestas; ningún
-- resultado real (set_log), sesión, programa ni historial importado cambia. En una transacción: todo o nada.
-- Producción: igual que la aplicación (respaldo verde antes; como repi_app, dueño de las tablas).
begin;
set local lock_timeout = '5s';
DROP TABLE IF EXISTS "training_target";
DROP TABLE IF EXISTS "training_proposal";
delete from drizzle.__drizzle_migrations where hash = '7c551dc627ce7d15b8ed7d068bdaa4f4e4801c51de6790077127d57d9a92bc84';
commit;
