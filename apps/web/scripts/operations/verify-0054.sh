#!/usr/bin/env bash
# REPI Control (D216) · Ensayo local de la publicación de 0054, en una base DESCARTABLE del PostgreSQL local (nunca producción).
#   1. Copia `repi_dev` (datos de desarrollo y E2E, no reales) a `repi_verify_0054`, en el estado de producción (0000–0053,
#      54 migraciones, sin las columnas de 0054), con repi_app como dueño.
#   2. Huella de lo existente: filas y md5 de user, organization, gym_kiosk, gym_member, program_version, program_exercise,
#      workout_session, set_log, set_skip y training_target (sin las columnas nuevas).
#   3. Aplica hosted-0054.sql con los mismos roles que producción y comprueba: huella intacta, columnas nulas y sin valores, el
#      registro en drizzle (sha256 y `when`), que borrar una pantalla deja la marca en null (no borra series) y que un segundo
#      intento falla sin dejar nada a medias.
#   4. Comprueba que la reversión se NIEGA con marcas de un gimnasio real; las deshace, revierte con rollback/0054, vuelve a
#      comprobar la huella y reaplica para dejarla publicada.
# Uso: bash apps/web/scripts/operations/verify-0054.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0054)
set -euo pipefail
DB=repi_verify_0054
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../drizzle/0054_kiosk_log.sql"
HOSTED="$HERE/hosted-0054.sql"
DOWN="$HERE/../rollback/0054_kiosk_log.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$MIG" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" || { echo "FALLA: hosted-0054.sql no corresponde al archivo de la migración"; exit 1; }
grep -q "$HASH" "$DOWN" || { echo "FALLA: la reversión no corresponde al archivo de la migración"; exit 1; }
WHEN=$(node -e "const j=require(process.argv[1]); const e=j.entries[j.entries.length-1]; if(e.tag!=='0054_kiosk_log'){process.exit(1)} console.log(e.when)" "$HERE/../../drizzle/meta/_journal.json") \
  || { echo "FALLA: el journal no termina en 0054_kiosk_log"; exit 1; }
grep -q "'$HASH', $WHEN)" "$HOSTED" || { echo "FALLA: hosted-0054.sql no registra el \`when\` del journal ($WHEN)"; exit 1; }
# Las sentencias de la migración están todas, tal cual, en el script de producción.
while IFS= read -r line; do [[ -z "$line" ]] && continue; grep -qF -- "$line" "$HOSTED" || { echo "FALLA: falta en hosted-0054.sql: $line"; exit 1; }; done < <(sed 's/--> statement-breakpoint//' "$MIG")

"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
# Estado de producción: 0000–0053, sin nada de 0054 (repi_dev puede tenerla aplicada o no).
"${PSQL[@]}" -d $DB -c "alter table set_log drop column if exists kiosk_id" -c "alter table workout_session drop column if exists kiosk_id" \
  -c "delete from drizzle.__drizzle_migrations where hash = '$HASH'"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"
# repi_dev puede no tener 0053 (REPI Control 1.0, ya publicada en producción): se aplica con su propio script.
if [[ "$("${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations")" == 53 ]]; then "${PSQL[@]}" -d $DB -f "$HERE/hosted-0053.sql"; fi
# Una pantalla sintética de un gimnasio no demo (sólo en esta copia descartable) para ensayar el borrado y la reversión negada.
"${PSQL[@]}" -d $DB -c "insert into gym_kiosk (org_id, location_id, name, secret_hash)
  select l.org_id, l.id, 'Pantalla de ensayo 0054', md5(random()::text) from gym_location l join organization o on o.id = l.org_id
  where not o.is_demo and o.kind = 'gym' order by l.id limit 1"

prints() {
  "${PSQL[@]}" -d $DB -At -c "select string_agg(x, ' | ' order by x) from (
    select 'user=' || count(*) || ':' || coalesce(md5(string_agg(id || email || updated_at::text, ',' order by id)), '') as x from \"user\"
    union all select 'organization=' || count(*) || ':' || coalesce(md5(string_agg(id || name || status || routine_policy || kiosk_enabled::text, ',' order by id)), '') from organization
    union all select 'gym_kiosk=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(revoked_at::text, ''), ',' order by id)), '') from gym_kiosk
    union all select 'gym_member=' || count(*) || ':' || coalesce(md5(string_agg(id || status, ',' order by id)), '') from gym_member
    union all select 'program_version=' || count(*) || ':' || coalesce(md5(string_agg(id || number::text || locked::text, ',' order by id)), '') from program_version
    union all select 'program_exercise=' || count(*) || ':' || coalesce(md5(string_agg(id || reps || sets::text || coalesce(detail::text, ''), ',' order by id)), '') from program_exercise
    union all select 'workout_session=' || count(*) || ':' || coalesce(md5(string_agg(id || status || revision::text || version_id, ',' order by id)), '') from workout_session
    union all select 'set_log=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(weight_kg::text, '') || coalesce(reps::text, '') || revision::text, ',' order by id)), '') from set_log
    union all select 'set_skip=' || count(*) || ':' || coalesce(md5(string_agg(session_id || program_exercise_id || set_index::text || skipped::text, ',' order by session_id, program_exercise_id, set_index)), '') from set_skip
    union all select 'training_target=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(decision, ''), ',' order by id)), '') from training_target) s"
}
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
cols() { "${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'kiosk_id' and table_name in ('set_log', 'workout_session')"; }
q() { "${PSQL[@]}" -d $DB -At -c "$1"; }

BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 54 && "$(cols)" == 0 ]] || { echo "FALLA: el estado inicial no es el de producción ($M0 migraciones, $(cols) columnas)"; exit 1; }
echo "antes:     $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
AFTER=$(prints); M1=$(migs)
[[ "$AFTER" == "$BEFORE" ]] || { echo "FALLA: cambió algo existente"; exit 1; }
[[ "$M1" == "$((M0 + 1))" && "$(cols)" == 2 && "$(q "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH' and created_at = $WHEN")" == 1 ]] || { echo "FALLA: aplicación incompleta"; exit 1; }
[[ "$(q "select (select count(*) from set_log where kiosk_id is not null) + (select count(*) from workout_session where kiosk_id is not null)")" == 0 ]] || { echo "FALLA: marcas inesperadas"; exit 1; }
owner=$(q "select string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'public' and tablename in ('set_log', 'workout_session')")
[[ "$owner" == repi_app ]] || { echo "FALLA: dueño $owner"; exit 1; }
echo "aplicada:  migraciones $M1 · columnas $(cols)/2, nulas y vacías · dueño $owner"
# Borrar una pantalla deja la marca en null; las series y los entrenamientos quedan.
SL=$(q "select id from set_log order by id limit 1"); K=$(q "select id from gym_kiosk order by id limit 1")
if [[ -n "$SL" && -n "$K" ]]; then
  WS=$(q "select session_id from set_log where id = '$SL'")
  out=$(q "begin; update set_log set kiosk_id = '$K' where id = '$SL'; update workout_session set kiosk_id = '$K' where id = '$WS'; delete from kiosk_session where kiosk_id = '$K'; delete from gym_kiosk where id = '$K';
    select (select count(*) from set_log where id = '$SL' and kiosk_id is null) || ',' || (select count(*) from workout_session where id = '$WS' and kiosk_id is null); rollback;" | tail -1)
  [[ "$out" == "1,1" ]] || { echo "FALLA: borrar la pantalla no dejó la marca en null ($out)"; exit 1; }
  echo "borrar una pantalla: la marca queda en null y las series siguen (correcto)"
fi
[[ "$(prints)" == "$BEFORE" ]] || { echo "FALLA: la verificación cambió algo existente"; exit 1; }
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$M1" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
# Con marcas de un gimnasio real la reversión se niega y no toca nada.
RK=$(q "select k.id from gym_kiosk k join organization o on o.id = k.org_id where not o.is_demo order by k.id limit 1")
if [[ -n "$RK" && -n "$SL" ]]; then
  "${PSQL[@]}" -d $DB -c "update set_log set kiosk_id = '$RK' where id = '$SL'"
  if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con marcas de un gimnasio real"; exit 1; fi
  [[ "$(cols)" == 2 ]] || { echo "FALLA: la reversión negada dejó cambios"; exit 1; }
  "${PSQL[@]}" -d $DB -c "update set_log set kiosk_id = null where id = '$SL'"
  echo "reversión con marcas reales: negada, sin cambios (correcto)"
else
  echo "reversión con marcas reales: sin pantalla de gimnasio real en esta copia (no se ensaya)"
fi
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(cols)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: lo existente igual, migraciones $(migs), columnas $(cols)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(cols)" == 2 && "$(migs)" == "$M1" ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK"
