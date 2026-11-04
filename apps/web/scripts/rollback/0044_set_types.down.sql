-- Reversión de 0044 (D192, tipos de serie personalizados). Sólo si se abandona también el código del PR #21: el código
-- anterior no lee `set_type`, así que revertir el código NO requiere correr esto. Pierde únicamente los tipos personalizados
-- guardados; los planes que ya usan una etiqueta («Load Set» o un tipo propio) la conservan en `detail.setPlan[].label`
-- (el código anterior la ignora y muestra el tipo semántico). Ningún resultado real (set_log), sesión, programa ni
-- historial cambia. No desactiva el RLS de las tablas de 0043 (eso no se revierte). En una transacción: todo o nada.
-- Producción: igual que la aplicación (respaldo verde antes; como repi_app, dueño de las tablas).
begin;
set local lock_timeout = '5s';
DROP TABLE IF EXISTS "set_type";
delete from drizzle.__drizzle_migrations where hash = 'ca3d81a89f7f6dd43ef7bb0821250b0cccc85202c8134eed62d8e9f181694920';
commit;
