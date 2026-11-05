#!/usr/bin/env bash
# D195 · Ensayo local de la publicación de 0045, en una base DESCARTABLE del PostgreSQL local (nunca producción).
#   1. Copia `repi_dev` (datos de desarrollo y E2E, no reales) a `repi_verify_0045` y la deja en el estado de producción
#      (hasta 0044: sin las tablas ni columnas de 0045). Agrega una asignación y un entrenamiento sintéticos con series para que la huella
#      del historial no sea vacía.
#   2. Huella del historial: filas y md5 de set_log, workout_session, program_version, history_entry y user_pref.
#   3. Aplica hosted-0045.sql con los mismos roles que producción (repi_app; postgres con SET).
#   4. Comprueba la huella (nada existente cambió), columnas NULL, RLS, el registro en drizzle y que un segundo intento falla
#      sin dejar nada a medias.
#   5. Comprueba que la reversión se NIEGA con una serie anulada; la restaura, revierte con rollback/0045_experience_ux.down.sql
#      y vuelve a comprobar la huella; reaplica para dejarla publicada.
# Uso: bash apps/web/scripts/operations/verify-0045.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0045)
set -euo pipefail
DB=repi_verify_0045
HERE="$(cd "$(dirname "$0")" && pwd)"
HOSTED="$HERE/hosted-0045.sql"
DOWN="$HERE/../rollback/0045_experience_ux.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$HERE/../../drizzle/0045_experience_ux.sql" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" || { echo "FALLA: hosted-0045.sql no corresponde al archivo de la migración"; exit 1; }

"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
# Estado de producción: 0000–0044 (45 registros), sin nada de 0045.
"${PSQL[@]}" -d $DB -c "drop table if exists training_correction, gym_equipment_exercise, gym_equipment;" \
  -c "alter table set_log drop column if exists voided_at, drop column if exists voided_by, drop column if exists void_reason;" \
  -c "alter table workout_session drop column if exists voided_at, drop column if exists voided_by, drop column if exists void_reason;" \
  -c "alter table user_pref drop column if exists hints;" \
  -c "delete from drizzle.__drizzle_migrations where id > (select id from drizzle.__drizzle_migrations order by id offset 44 limit 1)"
# Historial sintético (sólo en esta copia): un entrenamiento completado con dos series del primer ejercicio asignado.
"${PSQL[@]}" -d $DB -c "
  insert into program_assignment (id, coach_client_id, program_id, starts_on, status, assigned_by)
  select 'verify-0045-a', cc.id, v.program_id, current_date - 14, 'ended', cc.user_id
  from coach_client cc, program_version v where exists (select 1 from program_day pd join program_exercise pe on pe.day_id = pd.id where pd.version_id = v.id)
  order by cc.id, v.id limit 1;
  insert into workout_session (id, user_id, assignment_id, version_id, day_id, day_name, status, started_at, ended_at, active_ms)
  select 'verify-0045-s', cc.user_id, a.id, v.id, pd.id, pd.name, 'completed', now() - interval '2 days', now() - interval '2 days' + interval '50 minutes', 3000000
  from program_assignment a join coach_client cc on cc.id = a.coach_client_id
  join program_version v on v.program_id = a.program_id join program_day pd on pd.version_id = v.id
  where a.id = 'verify-0045-a' and exists (select 1 from program_exercise pe where pe.day_id = pd.id) order by v.number desc, pd.position limit 1;
  insert into set_log (id, session_id, program_exercise_id, exercise_id, set_index, weight_kg, reps, rir, completed_at)
  select 'verify-0045-l' || g, 'verify-0045-s', pe.id, pe.exercise_id, g, 40 + g * 2.5, 10 - g, 2, now() - interval '2 days' + g * interval '3 minutes'
  from program_exercise pe join workout_session s on s.id = 'verify-0045-s' and pe.day_id = s.day_id, generate_series(0, 1) g
  where pe.position = (select min(position) from program_exercise where day_id = s.day_id);"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"

prints() {
  "${PSQL[@]}" -d $DB -At -c "select string_agg(x, ' | ') from (
    select 'set_log=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(weight_kg::text, '') || coalesce(reps::text, '') || coalesce(rir::text, '') || revision::text, ',' order by id)), '') as x from set_log
    union all select 'workout_session=' || count(*) || ':' || coalesce(md5(string_agg(id || status || coalesce(ended_at::text, '') || revision::text, ',' order by id)), '') from workout_session
    union all select 'program_version=' || count(*) || ':' || coalesce(md5(string_agg(id || number::text, ',' order by id)), '') from program_version
    union all select 'history_entry=' || count(*) || ':' || coalesce(md5(string_agg(id, ',' order by id)), '') from history_entry
    union all select 'user_pref=' || count(*) || ':' || coalesce(md5(string_agg(user_id || coalesce(theme, ''), ',' order by user_id)), '') from user_pref) s"
}
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
tables() { "${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('gym_equipment', 'gym_equipment_exercise', 'training_correction')"; }
cols() { "${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.columns where table_schema = 'public' and ((table_name in ('set_log', 'workout_session') and column_name in ('voided_at', 'voided_by', 'void_reason')) or (table_name = 'user_pref' and column_name = 'hints'))"; }
rls() { "${PSQL[@]}" -d $DB -At -c "select string_agg(relname || '=' || relrowsecurity, ',' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname in ('gym_equipment', 'gym_equipment_exercise', 'training_correction')"; }

BEFORE=$(prints); M0=$(migs)
[[ "$BEFORE" == *"set_log=2:"* ]] || { echo "FALLA: no se creó el historial sintético ($BEFORE)"; exit 1; }
[[ "$M0" == 45 && "$(tables)" == 0 && "$(cols)" == 0 ]] || { echo "FALLA: el estado inicial no es el de producción"; exit 1; }
echo "antes:     $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
AFTER=$(prints); M1=$(migs)
echo "aplicada:  migraciones $M1 · tablas $(tables)/3 · columnas $(cols)/7 · hash registrado: $("${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH'")"
[[ "$AFTER" == "$BEFORE" ]] || { echo "FALLA: cambió el historial"; exit 1; }
[[ "$M1" == "$((M0 + 1))" && "$(tables)" == 3 && "$(cols)" == 7 ]] || { echo "FALLA: aplicación incompleta"; exit 1; }
[[ "$("${PSQL[@]}" -d $DB -At -c "select count(*) from set_log where voided_at is not null") $("${PSQL[@]}" -d $DB -At -c "select count(*) from workout_session where voided_at is not null")" == "0 0" ]] || { echo "FALLA: anulaciones inventadas"; exit 1; }
owner=$("${PSQL[@]}" -d $DB -At -c "select string_agg(distinct tableowner, ',') from pg_tables where tablename in ('gym_equipment', 'gym_equipment_exercise', 'training_correction')")
[[ "$owner" == repi_app ]] || { echo "FALLA: dueño $owner"; exit 1; }
[[ "$(rls)" == "gym_equipment=true,gym_equipment_exercise=true,training_correction=true" ]] || { echo "FALLA: RLS $(rls)"; exit 1; }
echo "RLS:       $(rls) · dueño $owner"
# Un segundo intento falla entero (las tablas ya existen) y no deja un registro duplicado.
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$M1" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
# Con una serie anulada la reversión se niega (con el código anterior volvería a contar) y no toca nada.
"${PSQL[@]}" -d $DB -c "update set_log set voided_at = now() where id = 'verify-0045-l1'"
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con anulados"; exit 1; fi
[[ "$(tables)" == 3 && "$(cols)" == 7 ]] || { echo "FALLA: la reversión negada dejó cambios"; exit 1; }
echo "reversión con una serie anulada: negada, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "update set_log set voided_at = null where id = 'verify-0045-l1'"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(tables)" == 0 && "$(cols)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: historial igual, migraciones $(migs), tablas $(tables), columnas $(cols)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(tables)" == 3 && "$(cols)" == 7 ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK · $(prints)"
