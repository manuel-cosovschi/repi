#!/usr/bin/env bash
# D209 · Ensayo local de la publicación de 0050 (REPI Intelligence Core), en una base DESCARTABLE del PostgreSQL local (nunca
# producción).
#   1. Copia `repi_dev` (datos de desarrollo y E2E, no reales) a `repi_verify_0050` y la deja en el estado de producción
#      (hasta 0049: sin las nueve tablas de 0050).
#   2. Huella de lo existente: filas y md5 de user, organization, workout_session, set_log, program_version, own_routine y
#      user_pref.
#   3. Aplica hosted-0050.sql con los mismos roles que producción (repi_app dueño; postgres con SET).
#   4. Comprueba la huella (nada existente cambió), RLS, dueño, permisos, el registro en drizzle, las restricciones (dedupe,
#      idempotencia, una conversación abierta, catálogos), la cascada al borrar una persona y que un segundo intento falla
#      sin dejar nada a medias.
#   5. Comprueba que la reversión se NIEGA con datos de personas; los borra, revierte con rollback/0050 y vuelve a comprobar
#      la huella; reaplica para dejarla publicada.
# Uso: bash apps/web/scripts/operations/verify-0050.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0050)
set -euo pipefail
DB=repi_verify_0050
HERE="$(cd "$(dirname "$0")" && pwd)"
HOSTED="$HERE/hosted-0050.sql"
DOWN="$HERE/../rollback/0050_brain.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
T="'ai_breaker', 'ai_policy', 'ai_usage', 'brain_action', 'brain_intervention', 'brain_memory', 'brain_message', 'brain_pref', 'brain_thread'"
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$HERE/../../drizzle/0050_brain.sql" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" || { echo "FALLA: hosted-0050.sql no corresponde al archivo de la migración"; exit 1; }
grep -q "$HASH" "$DOWN" || { echo "FALLA: la reversión no corresponde al archivo de la migración"; exit 1; }

"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
# Estado de producción: 0000–0049 (50 registros), sin nada de 0050 (repi_dev puede tenerla aplicada o no).
"${PSQL[@]}" -d $DB -c "drop table if exists brain_message, brain_thread, brain_memory, brain_intervention, brain_action, brain_pref, ai_usage, ai_policy, ai_breaker;" \
  -c "delete from drizzle.__drizzle_migrations where hash = '$HASH'"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"

prints() {
  "${PSQL[@]}" -d $DB -At -c "select string_agg(x, ' | ') from (
    select 'user=' || count(*) || ':' || coalesce(md5(string_agg(id || email || updated_at::text || coalesce(birth_date, ''), ',' order by id)), '') as x from \"user\"
    union all select 'organization=' || count(*) || ':' || coalesce(md5(string_agg(id || name || status, ',' order by id)), '') from organization
    union all select 'workout_session=' || count(*) || ':' || coalesce(md5(string_agg(id || status || coalesce(ended_at::text, '') || revision::text, ',' order by id)), '') from workout_session
    union all select 'set_log=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(weight_kg::text, '') || coalesce(reps::text, '') || revision::text || coalesce(voided_at::text, ''), ',' order by id)), '') from set_log
    union all select 'program_version=' || count(*) || ':' || coalesce(md5(string_agg(id || number::text || locked::text, ',' order by id)), '') from program_version
    union all select 'own_routine=' || count(*) || ':' || coalesce(md5(string_agg(id || name || exercises::text || coalesce(origin::text, ''), ',' order by id)), '') from own_routine
    union all select 'user_pref=' || count(*) || ':' || coalesce(md5(string_agg(user_id || coalesce(notifications_seen_at::text, '') || hints::text, ',' order by user_id)), '') from user_pref) s"
}
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
tables() { "${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ($T)"; }
rls() { "${PSQL[@]}" -d $DB -At -c "select string_agg(relname || '=' || relrowsecurity, ',' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname in ($T)"; }
# fails SQL motivo [restricción]: la sentencia tiene que fallar (y, si se indica, por esa restricción).
fails() { local out; if out=$("${PSQL[@]}" -d $DB -c "$1" 2>&1); then echo "FALLA: $2"; exit 1; fi; [[ -z "${3:-}" || "$out" == *"$3"* ]] || { echo "FALLA: $2 (otro error: $out)"; exit 1; }; }

BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 50 && "$(tables)" == 0 ]] || { echo "FALLA: el estado inicial no es el de producción ($M0 migraciones, $(tables) tablas)"; exit 1; }
echo "antes:     $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
AFTER=$(prints); M1=$(migs)
echo "aplicada:  migraciones $M1 · tablas $(tables)/9 · hash registrado: $("${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH'")"
[[ "$AFTER" == "$BEFORE" ]] || { echo "FALLA: cambió algo existente"; exit 1; }
[[ "$M1" == "$((M0 + 1))" && "$(tables)" == 9 ]] || { echo "FALLA: aplicación incompleta"; exit 1; }
owner=$("${PSQL[@]}" -d $DB -At -c "select string_agg(distinct tableowner, ',') from pg_tables where tablename in ($T)")
[[ "$owner" == repi_app ]] || { echo "FALLA: dueño $owner"; exit 1; }
[[ "$(rls)" == "ai_breaker=true,ai_policy=true,ai_usage=true,brain_action=true,brain_intervention=true,brain_memory=true,brain_message=true,brain_pref=true,brain_thread=true" ]] || { echo "FALLA: RLS $(rls)"; exit 1; }
echo "RLS:       $(rls) · dueño $owner"
anon=$("${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'PUBLIC') and table_name in ($T)")
[[ "$anon" == 0 ]] || { echo "FALLA: permisos públicos en tablas nuevas ($anon)"; exit 1; }
# Restricciones y cascada, con una persona de verificación creada acá (no se toca ninguna fila existente).
V="verify-0050-$(date +%s)"
"${PSQL[@]}" -d $DB -c "insert into \"user\" (id, name, email, email_verified) values ('$V', 'Verificación 0050', '$V@verify.invalid', true)"
"${PSQL[@]}" -d $DB -c "insert into brain_intervention (user_id, kind, dedupe_key, priority, channel) values ('$V', 'pr', 'pr:v', 4, 'card')" \
  -c "insert into brain_action (user_id, kind, idempotency_key, autonomy) values ('$V', 'save_preference', 'k1', 1)" \
  -c "insert into brain_thread (user_id) values ('$V')" \
  -c "insert into brain_message (thread_id, user_id, role, text) select id, '$V', 'user', 'hola' from brain_thread where user_id = '$V'" \
  -c "insert into brain_memory (user_id, kind, key, text, source) values ('$V', 'preference', 'tone', 'Breve', 'user')" \
  -c "insert into brain_pref (user_id) values ('$V')" \
  -c "insert into ai_usage (user_id, task, model, outcome, cost_micros) values ('$V', 'brain.chat', 'gpt-6-luna', 'ok', 164)"
fails "insert into brain_intervention (user_id, kind, dedupe_key, priority, channel) values ('$V', 'pr', 'pr:v', 4, 'card')" "aviso duplicado" brain_intervention_dedupe_unique
fails "insert into brain_action (user_id, kind, idempotency_key, autonomy) values ('$V', 'save_preference', 'k1', 1)" "acción duplicada" brain_action_idempotency_unique
fails "insert into brain_thread (user_id) values ('$V')" "dos conversaciones abiertas" brain_thread_one_open
fails "insert into ai_usage (task, model, outcome) values ('brain.chat', 'm', 'maybe')" "resultado de IA fuera del catálogo" ai_usage_outcome_valid
fails "update brain_pref set autonomy = 3 where user_id = '$V'" "autonomía fuera de rango" brain_pref_autonomy_valid
fails "update brain_message set role = 'assistant' where user_id = '$V'" "rol de mensaje inválido" brain_message_role_valid
fails "insert into ai_policy (scope) values ('team:1')" "alcance de política inválido" ai_policy_scope_valid
echo "restricciones: dedupe, idempotencia, una conversación abierta y catálogos (correcto)"
"${PSQL[@]}" -d $DB -c "delete from \"user\" where id = '$V'"
left=$("${PSQL[@]}" -d $DB -At -c "select (select count(*) from brain_intervention where user_id = '$V') + (select count(*) from brain_action where user_id = '$V') + (select count(*) from brain_thread where user_id = '$V') + (select count(*) from brain_message where user_id = '$V') + (select count(*) from brain_memory where user_id = '$V') + (select count(*) from brain_pref where user_id = '$V') + (select count(*) from ai_usage where user_id = '$V')")
[[ "$left" == 0 ]] || { echo "FALLA: la cascada dejó $left filas"; exit 1; }
[[ "$(prints)" == "$BEFORE" ]] || { echo "FALLA: la verificación cambió algo existente"; exit 1; }
echo "cascada:   borrar la persona borró todo lo suyo del cerebro (correcto)"
# Un segundo intento falla entero y no deja un registro duplicado.
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$M1" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
# Con datos de personas la reversión se niega y no toca nada.
"${PSQL[@]}" -d $DB -c "insert into \"user\" (id, name, email, email_verified) values ('$V', 'Verificación 0050', '$V@verify.invalid', true)" \
  -c "insert into brain_memory (user_id, kind, key, text, source) values ('$V', 'preference', 'tone', 'Breve', 'user')"
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con datos"; exit 1; fi
[[ "$(tables)" == 9 ]] || { echo "FALLA: la reversión negada dejó cambios"; exit 1; }
echo "reversión con memoria guardada: negada, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "delete from \"user\" where id = '$V'"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(tables)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: lo existente igual, migraciones $(migs), tablas $(tables)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(tables)" == 9 && "$(migs)" == "$M1" ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK · $(prints)"
