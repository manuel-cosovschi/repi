#!/usr/bin/env bash
# D191 · Ensayo local de la publicación de 0043, en una base DESCARTABLE del PostgreSQL local (nunca producción).
#   1. Copia `repi_dev` (datos de desarrollo y E2E, no reales) a `repi_verify_0043` y la deja en el estado de producción
#      (hasta 0042: sin las tablas de 0043).
#   2. Huella del historial: filas y md5 de set_log, workout_session, program_version e history_entry.
#   3. Aplica hosted-0043.sql con los mismos roles que producción (repi_app; postgres con SET).
#   4. Comprueba la huella (nada existente cambió), el registro en drizzle y que un segundo intento falla sin dejar nada a medias.
#   5. Revierte con rollback/0043_training_intelligence.down.sql y vuelve a comprobar la huella; reaplica para dejarla publicada.
# Uso: bash apps/web/scripts/operations/verify-0043.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0043)
set -euo pipefail
DB=repi_verify_0043
HERE="$(cd "$(dirname "$0")" && pwd)"
HOSTED="$HERE/hosted-0043.sql"
DOWN="$HERE/../rollback/0043_training_intelligence.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$HERE/../../drizzle/0043_training_intelligence.sql" | cut -d' ' -f1)

"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
# Estado de producción: 0000–0042 (43 registros) y sin las tablas de 0043 (la copia puede traer una versión anterior de esta rama).
"${PSQL[@]}" -d $DB -c "drop table if exists training_target; drop table if exists training_proposal;" \
  -c "delete from drizzle.__drizzle_migrations where id > (select id from drizzle.__drizzle_migrations order by id offset 42 limit 1)"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"

prints() {
  "${PSQL[@]}" -d $DB -At -c "select string_agg(x, ' | ') from (
    select 'set_log=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(weight_kg::text, '') || coalesce(reps::text, '') || coalesce(rir::text, ''), ',' order by id)), '') as x from set_log
    union all select 'workout_session=' || count(*) || ':' || coalesce(md5(string_agg(id || status || coalesce(ended_at::text, ''), ',' order by id)), '') from workout_session
    union all select 'program_version=' || count(*) || ':' || coalesce(md5(string_agg(id || number::text, ',' order by id)), '') from program_version
    union all select 'history_entry=' || count(*) || ':' || coalesce(md5(string_agg(id, ',' order by id)), '') from history_entry) s"
}
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
tables() { "${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('training_target', 'training_proposal')"; }

BEFORE=$(prints); M0=$(migs)
echo "antes:     $BEFORE · migraciones $M0 · tablas 0043: $(tables)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
AFTER=$(prints); M1=$(migs)
echo "aplicada:  migraciones $M1 · tablas 0043: $(tables) · hash registrado: $("${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH'")"
[[ "$AFTER" == "$BEFORE" ]] || { echo "FALLA: cambió el historial"; exit 1; }
[[ "$M1" == "$((M0 + 1))" && "$(tables)" == 2 ]] || { echo "FALLA: aplicación incompleta"; exit 1; }
owner=$("${PSQL[@]}" -d $DB -At -c "select string_agg(distinct tableowner, ',') from pg_tables where tablename in ('training_target', 'training_proposal')")
[[ "$owner" == repi_app ]] || { echo "FALLA: dueño $owner"; exit 1; }
# Un segundo intento falla entero (las tablas ya existen) y no deja un registro duplicado.
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$M1" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(tables)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: historial igual, migraciones $(migs), tablas 0043: $(tables)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(tables)" == 2 ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK · $(prints)"
