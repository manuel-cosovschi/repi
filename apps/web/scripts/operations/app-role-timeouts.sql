-- Límites de tiempo del rol de la app (repi_app), cierre del incidente de 300 s en /api/admin (#80, 07/11).
-- No es una migración: no cambia tablas ni datos. Correr como postgres (tiene CREATEROLE y admin sobre repi_app),
-- después de un «Respaldo» en verde. Idempotente.
--   - idle_in_transaction_session_timeout 30 s: una transacción abierta sin actividad (lo que trabó el pool de 3
--     conexiones) se corta y libera la conexión y sus bloqueos. Los cortes de la app (server/deadline.ts) son 20–25 s.
--   - lock_timeout 15 s: una consulta no espera un bloqueo más que eso.
--   - statement_timeout 60 s: ninguna consulta de repi_app pasó de 0,41 s (pg_stat_statements, 09/11). maxDuration
--     de las rutas es 60 s.
-- Rige para las conexiones nuevas; el pool renueva cada conexión a los 300 s como máximo (max_lifetime).
-- El respaldo usa repi_backup (sus propios límites) y no lo afecta. Las migraciones alojadas fijan su lock_timeout.
-- Revertir:
--   alter role repi_app reset idle_in_transaction_session_timeout;
--   alter role repi_app reset lock_timeout;
--   alter role repi_app reset statement_timeout;
alter role repi_app set idle_in_transaction_session_timeout = '30s';
alter role repi_app set lock_timeout = '15s';
alter role repi_app set statement_timeout = '60s';

-- Comprobación: debe listar los tres valores.
select setconfig from pg_db_role_setting where setrole = 'repi_app'::regrole and setdatabase = 0;
