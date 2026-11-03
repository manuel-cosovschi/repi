-- Reversión de 0041 (D184). Sólo si se revierte también el código: el anterior ignora la tabla y la columna.
-- Pierde únicamente omisiones de etapas y el intervalo EMOM en curso; ningún resultado (set_log) se toca.
DROP TABLE IF EXISTS "set_skip";
ALTER TABLE "workout_session" DROP COLUMN IF EXISTS "interval_state";
