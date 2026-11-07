#!/usr/bin/env bash
# SI2 · Ensayo local de 0049 en una base DESCARTABLE (copia de repi_dev, nunca producción): estado de producción (hasta 0048),
# huella de own_routine (filas y contenido), aplicar hosted-0049.sql con los roles de producción, comprobar huella, columna y
# registro, que un segundo intento falla entero, revertir y reaplicar.
# Uso: bash apps/web/scripts/operations/verify-0049.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0049)
set -euo pipefail
DB=repi_verify_0049
HERE="$(cd "$(dirname "$0")" && pwd)"
HOSTED="$HERE/hosted-0049.sql"; DOWN="$HERE/../rollback/0049_own_routine_origin.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$HERE/../../drizzle/0049_own_routine_origin.sql" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" && grep -q "$HASH" "$DOWN" || { echo "FALLA: los scripts no corresponden a la migración"; exit 1; }
"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
"${PSQL[@]}" -d $DB -c "drop index if exists own_routine_import_op_unique" -c "alter table own_routine drop column if exists origin" -c "delete from drizzle.__drizzle_migrations where hash = '$HASH'"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"
# Rutinas propias de muestra en la copia descartable (la huella tiene que cubrir filas reales, no una tabla vacía).
"${PSQL[@]}" -d $DB -c "insert into own_routine (user_id, name, exercises) select id, 'Rutina de verificación', '[{\"exerciseId\":\"x\",\"sets\":3,\"reps\":\"10\",\"weightKg\":null,\"restSec\":null,\"note\":null}]'::jsonb from \"user\" order by id limit 5"
prints() { "${PSQL[@]}" -d $DB -At -c "select count(*) || ':' || coalesce(md5(string_agg(id || user_id || name || exercises::text || created_at::text, ',' order by id)), '') from own_routine"; }
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
col() { "${PSQL[@]}" -d $DB -At -c "select (select count(*) from information_schema.columns where table_name = 'own_routine' and column_name = 'origin') + (select count(*) from pg_indexes where indexname = 'own_routine_import_op_unique')"; }
BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 49 && "$(col)" == 0 ]] || { echo "FALLA: estado inicial ($M0 migraciones)"; exit 1; }
echo "antes:     $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$((M0 + 1))" && "$(col)" == 2 ]] || { echo "FALLA: aplicación"; exit 1; }
echo "aplicada:  migraciones $(migs) · columna origin e índice presentes · huella igual"
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$((M0 + 1))" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(col)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: huella igual, migraciones $(migs)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(col)" == 2 ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK · $(prints)"
