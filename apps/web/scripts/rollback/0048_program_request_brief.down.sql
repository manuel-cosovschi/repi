-- Reversión de 0048 (D206). Sólo si se abandona también el código del pedido con preferencias: el código anterior no lee la
-- columna, así que revertir el código NO requiere correr esto. Borra las preferencias guardadas en pedidos al coach (el texto
-- del pedido conserva el resumen). Producción: respaldo verde antes; como repi_app.
-- Migración: sha256 7f000e8c0aa10760304ac4e9b50db9e7c0fea34dbc84620d5b667105c1f29dc1
begin;
set local lock_timeout = '5s';
alter table "student_request" drop column "brief";
delete from drizzle.__drizzle_migrations where hash = '7f000e8c0aa10760304ac4e9b50db9e7c0fea34dbc84620d5b667105c1f29dc1';
commit;
