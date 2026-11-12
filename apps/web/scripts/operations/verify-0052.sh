#!/usr/bin/env bash
# Ejercicios por tiempo · Ensayo local de la publicación de 0052, en una base DESCARTABLE del PostgreSQL local (nunca producción).
#   1. Copia `repi_dev` (datos de desarrollo y E2E, no reales) a `repi_verify_0052` y la deja en el estado de producción
#      (hasta 0051: 52 migraciones, sin las columnas de 0052). Suma ejercicios propios de muestra (de una organización y de un
#      alumno, con nombres del catálogo) para probar que el perfil del catálogo no los toca.
#   2. Huella de lo existente: filas y md5 de user, organization, exercise (sin la columna nueva), workout_session, set_log,
#      program_version, program_exercise y own_routine.
#   3. Aplica hosted-0052.sql con los mismos roles que producción (repi_app dueño; postgres con SET).
#   4. Comprueba la huella (nada existente cambió), columnas, dueño, permisos, el registro en drizzle (sha256 y `when` del
#      journal), el perfil del catálogo (cinta, bici, remo…, y ningún ejercicio propio), las restricciones (perfil fuera del
#      catálogo, métricas que no son un objeto) y que un segundo intento falla sin dejar nada a medias.
#   5. Comprueba que la reversión se NIEGA con datos de personas (métricas registradas o perfil de un ejercicio propio); los
#      borra, revierte con rollback/0052 y vuelve a comprobar la huella; reaplica para dejarla publicada.
# Uso: bash apps/web/scripts/operations/verify-0052.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0052)
set -euo pipefail
DB=repi_verify_0052
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../drizzle/0052_time_metrics.sql"
HOSTED="$HERE/hosted-0052.sql"
DOWN="$HERE/../rollback/0052_time_metrics.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$MIG" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" || { echo "FALLA: hosted-0052.sql no corresponde al archivo de la migración"; exit 1; }
grep -q "$HASH" "$DOWN" || { echo "FALLA: la reversión no corresponde al archivo de la migración"; exit 1; }
WHEN=$(node -e "const j=require(process.argv[1]); const e=j.entries[j.entries.length-1]; if(e.tag!=='0052_time_metrics'){process.exit(1)} console.log(e.when)" "$HERE/../../drizzle/meta/_journal.json") \
  || { echo "FALLA: el journal no termina en 0052_time_metrics"; exit 1; }
grep -q "'$HASH', $WHEN)" "$HOSTED" || { echo "FALLA: hosted-0052.sql no registra el \`when\` del journal ($WHEN)"; exit 1; }

"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
# Estado de producción: 0000–0051 (52 registros, con 0051 del cerebro), sin nada de 0052 (repi_dev puede tenerla aplicada o no).
"${PSQL[@]}" -d $DB -c "alter table set_log drop column if exists metrics" -c "alter table exercise drop column if exists metrics_profile" \
  -c "delete from drizzle.__drizzle_migrations where hash = '$HASH'"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"
# Ejercicios propios con nombres del catálogo (una organización y un alumno): el perfil del catálogo nunca los toca.
"${PSQL[@]}" -d $DB -c "insert into exercise (org_id, name, muscle_group, kind) select id, 'Cinta (caminata)', 'Cardio', 'time' from organization order by id limit 1 on conflict do nothing" \
  -c "insert into exercise (owner_user_id, name, muscle_group, kind) select id, 'Bicicleta fija', 'Cardio', 'load_reps' from \"user\" order by id limit 1 on conflict do nothing"

# Orden fijo (`order by x`): con planes en paralelo, `union all` no garantiza el orden de las partes.
prints() {
  "${PSQL[@]}" -d $DB -At -c "select string_agg(x, ' | ' order by x) from (
    select 'user=' || count(*) || ':' || coalesce(md5(string_agg(id || email || updated_at::text, ',' order by id)), '') as x from \"user\"
    union all select 'organization=' || count(*) || ':' || coalesce(md5(string_agg(id || name || status, ',' order by id)), '') from organization
    union all select 'exercise=' || count(*) || ':' || coalesce(md5(string_agg(id || name || muscle_group || kind || coalesce(org_id, '') || coalesce(owner_user_id, ''), ',' order by id)), '') from exercise
    union all select 'workout_session=' || count(*) || ':' || coalesce(md5(string_agg(id || status || coalesce(ended_at::text, '') || revision::text, ',' order by id)), '') from workout_session
    union all select 'set_log=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(weight_kg::text, '') || coalesce(reps::text, '') || coalesce(rir::text, '') || revision::text || coalesce(voided_at::text, ''), ',' order by id)), '') from set_log
    union all select 'program_version=' || count(*) || ':' || coalesce(md5(string_agg(id || number::text || locked::text, ',' order by id)), '') from program_version
    union all select 'program_exercise=' || count(*) || ':' || coalesce(md5(string_agg(id || reps || sets::text || coalesce(detail::text, ''), ',' order by id)), '') from program_exercise
    union all select 'own_routine=' || count(*) || ':' || coalesce(md5(string_agg(id || name || exercises::text, ',' order by id)), '') from own_routine) s"
}
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
cols() { "${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'exercise' and column_name = 'metrics_profile') or (table_name = 'set_log' and column_name = 'metrics'))"; }
q() { "${PSQL[@]}" -d $DB -At -c "$1"; }
# fails SQL motivo [restricción]: la sentencia tiene que fallar (y, si se indica, por esa restricción).
fails() { local out; if out=$("${PSQL[@]}" -d $DB -c "$1" 2>&1); then echo "FALLA: $2"; exit 1; fi; [[ -z "${3:-}" || "$out" == *"$3"* ]] || { echo "FALLA: $2 (otro error: $out)"; exit 1; }; }

BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 52 && "$(cols)" == 0 ]] || { echo "FALLA: el estado inicial no es el de producción ($M0 migraciones, $(cols) columnas)"; exit 1; }
OWN=$(q "select count(*) from exercise where org_id is not null or owner_user_id is not null")
CAT=$(q "select count(*) from exercise where org_id is null and owner_user_id is null")
[[ "$OWN" -ge 2 && "$CAT" -gt 0 ]] || { echo "FALLA: faltan ejercicios de muestra ($OWN propios, $CAT del catálogo)"; exit 1; }
echo "antes:     $BEFORE · migraciones $M0 · catálogo $CAT · propios $OWN"
"${PSQL[@]}" -d $DB -f "$HOSTED"
AFTER=$(prints); M1=$(migs)
echo "aplicada:  migraciones $M1 · columnas $(cols)/2 · hash registrado: $(q "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH' and created_at = $WHEN")"
[[ "$AFTER" == "$BEFORE" ]] || { echo "FALLA: cambió algo existente"; exit 1; }
[[ "$M1" == "$((M0 + 1))" && "$(cols)" == 2 && "$(q "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH' and created_at = $WHEN")" == 1 ]] || { echo "FALLA: aplicación incompleta"; exit 1; }
owner=$(q "select string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'public' and tablename in ('exercise', 'set_log')")
[[ "$owner" == repi_app ]] || { echo "FALLA: dueño $owner"; exit 1; }
anon=$(q "select count(*) from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'PUBLIC') and table_name in ('exercise', 'set_log')")
[[ "$anon" == 0 ]] || { echo "FALLA: permisos públicos ($anon)"; exit 1; }
# Perfil del catálogo: todas las filas del catálogo quedan con perfil; las máquinas de cardio, como actividades; ningún propio.
filled=$(q "select count(*) from exercise where org_id is null and owner_user_id is null and metrics_profile is not null")
cardio=$(q "select string_agg(name || '=' || coalesce(metrics_profile, '-'), ',' order by name) from exercise where org_id is null and owner_user_id is null and name in ('Cinta (caminata)', 'Cinta (trote)', 'Bicicleta fija', 'Remo ergómetro', 'Elíptico', 'Escaladora', 'Soga (saltar la cuerda)', 'Plancha', 'Press de banca', 'Flexiones')")
ownp=$(q "select count(*) from exercise where metrics_profile is not null and (org_id is not null or owner_user_id is not null)")
metr=$(q "select count(*) from set_log where metrics is not null")
echo "catálogo:  $filled/$CAT con perfil · $cardio · propios con perfil: $ownp · series con métricas: $metr"
[[ "$filled" == "$CAT" ]] || { echo "FALLA: quedaron filas del catálogo sin perfil ($filled de $CAT)"; exit 1; }
[[ "$cardio" == "Bicicleta fija=bike,Cinta (caminata)=treadmill,Cinta (trote)=treadmill,Elíptico=elliptical,Escaladora=stair,Flexiones=bodyweight,Plancha=hold,Press de banca=strength,Remo ergómetro=rower,Soga (saltar la cuerda)=duration" ]] || { echo "FALLA: perfiles del catálogo ($cardio)"; exit 1; }
[[ "$ownp" == 0 && "$metr" == 0 ]] || { echo "FALLA: el perfil del catálogo tocó ejercicios propios o series"; exit 1; }
# Restricciones: perfil fuera del catálogo y métricas que no son un objeto JSON. Una métrica válida se acepta (y se deshace).
fails "update exercise set metrics_profile = 'cardio' where id = (select id from exercise order by id limit 1)" "perfil fuera del catálogo" exercise_metrics_profile_valid
fails "update set_log set metrics = '[5]'::jsonb where id = (select id from set_log order by id limit 1)" "métricas que no son un objeto" set_log_metrics_object
fails "update set_log set metrics = '\"5 km/h\"'::jsonb where id = (select id from set_log order by id limit 1)" "métricas como texto" set_log_metrics_object
"${PSQL[@]}" -d $DB -c "begin" -c "update set_log set metrics = '{\"speedKmh\": 5.5, \"incline\": 4}'::jsonb where id = (select id from set_log order by id limit 1)" \
  -c "update exercise set metrics_profile = 'treadmill' where id = (select id from exercise where org_id is not null order by id limit 1)" -c "rollback"
[[ "$(prints)" == "$BEFORE" && "$(q "select count(*) from set_log where metrics is not null")" == 0 ]] || { echo "FALLA: la verificación cambió algo existente"; exit 1; }
echo "restricciones: perfil dentro de los valores permitidos y métricas como objeto JSON (correcto)"
# Volver a correr el perfil del catálogo no cambia nada (sólo completa filas sin perfil).
"${PSQL[@]}" -d $DB -c "set role repi_app" -c "$(sed -n '/^UPDATE "exercise" AS e/,/^WHERE e\./p' "$MIG")"
[[ "$(prints)" == "$BEFORE" && "$(q "select count(*) from exercise where org_id is null and owner_user_id is null and metrics_profile is not null")" == "$filled" ]] || { echo "FALLA: repetir el perfil del catálogo cambió algo"; exit 1; }
echo "repetir el perfil del catálogo: sin cambios (correcto)"
# Un segundo intento falla entero y no deja un registro duplicado.
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$M1" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
# Con datos de personas la reversión se niega y no toca nada: métricas registradas, y el perfil elegido de un ejercicio propio.
SID=$(q "select id from set_log order by id limit 1")
XID=$(q "select id from exercise where owner_user_id is not null order by id limit 1")
"${PSQL[@]}" -d $DB -c "update set_log set metrics = '{\"speedKmh\": 5.5, \"incline\": 4}'::jsonb where id = '$SID'"
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con métricas registradas"; exit 1; fi
[[ "$(cols)" == 2 ]] || { echo "FALLA: la reversión negada dejó cambios"; exit 1; }
"${PSQL[@]}" -d $DB -c "update set_log set metrics = null where id = '$SID'" -c "update exercise set metrics_profile = 'bike' where id = '$XID'"
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con el perfil de un ejercicio propio"; exit 1; fi
[[ "$(cols)" == 2 ]] || { echo "FALLA: la reversión negada dejó cambios"; exit 1; }
echo "reversión con métricas o perfil propio: negada, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "update exercise set metrics_profile = null where id = '$XID'"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(cols)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: lo existente igual, migraciones $(migs), columnas $(cols)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(cols)" == 2 && "$(migs)" == "$M1" ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK · $(prints)"
