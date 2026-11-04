-- Reversión de 0043 (D191, Training Intelligence 2.0). Sólo si se abandona también el código del bloque 04/06: el código
-- anterior no lee estas tablas, así que revertir el código NO requiere correr esto. Pierde únicamente los objetivos que REPI
-- emitió y las propuestas al coach; ningún resultado real (set_log) ni programa cambia.
DROP TABLE IF EXISTS "training_target";
DROP TABLE IF EXISTS "training_proposal";
