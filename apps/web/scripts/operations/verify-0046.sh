#!/usr/bin/env bash
# D199–D202 · Ensayo local de la publicación de 0046, en una base DESCARTABLE del PostgreSQL local (nunca producción).
#   1. Copia `repi_dev` (datos de desarrollo y E2E, no reales) a `repi_verify_0046` y la deja en el estado de producción
#      (hasta 0045: sin las cinco tablas de 0046).
#   2. Huella de lo existente: filas y md5 de set_log, workout_session, program_version, media_object, member_notice y user_pref.
#   3. Aplica hosted-0046.sql con los mismos roles que producción (repi_app dueño; postgres con SET).
#   4. Comprueba la huella (nada existente cambió), RLS, dueño, el registro en drizzle, las restricciones (una medición por
#      día, rangos) y que un segundo intento falla sin dejar nada a medias.
#   5. Comprueba que la reversión se NIEGA con datos de personas; los borra, revierte con rollback/0046 y vuelve a comprobar
#      la huella; reaplica para dejarla publicada.
# Uso: bash apps/web/scripts/operations/verify-0046.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0046)
set -euo pipefail
DB=repi_verify_0046
HERE="$(cd "$(dirname "$0")" && pwd)"
HOSTED="$HERE/hosted-0046.sql"
DOWN="$HERE/../rollback/0046_personal_progress.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
T="'announcement_read', 'body_goal', 'body_weight_entry', 'product_announcement', 'progress_photo'"
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$HERE/../../drizzle/0046_personal_progress.sql" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" || { echo "FALLA: hosted-0046.sql no corresponde al archivo de la migración"; exit 1; }
grep -q "$HASH" "$DOWN" || { echo "FALLA: la reversión no corresponde al archivo de la migración"; exit 1; }

"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
# Estado de producción: 0000–0045 (46 registros), sin nada de 0046.
"${PSQL[@]}" -d $DB -c "drop table if exists announcement_read, product_announcement, progress_photo, body_goal, body_weight_entry;" \
  -c "delete from media_object where purpose = 'progress_photo';" \
  -c "delete from drizzle.__drizzle_migrations where hash = '$HASH'"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"

prints() {
  "${PSQL[@]}" -d $DB -At -c "select string_agg(x, ' | ') from (
    select 'set_log=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(weight_kg::text, '') || coalesce(reps::text, '') || revision::text || coalesce(voided_at::text, ''), ',' order by id)), '') as x from set_log
    union all select 'workout_session=' || count(*) || ':' || coalesce(md5(string_agg(id || status || coalesce(ended_at::text, '') || revision::text, ',' order by id)), '') from workout_session
    union all select 'program_version=' || count(*) || ':' || coalesce(md5(string_agg(id || number::text, ',' order by id)), '') from program_version
    union all select 'media_object=' || count(*) || ':' || coalesce(md5(string_agg(id || storage_key || coalesce(deleted_at::text, ''), ',' order by id)), '') from media_object
    union all select 'member_notice=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(seen_at::text, ''), ',' order by id)), '') from member_notice
    union all select 'user_pref=' || count(*) || ':' || coalesce(md5(string_agg(user_id || coalesce(notifications_seen_at::text, '') || hints::text, ',' order by user_id)), '') from user_pref) s"
}
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
tables() { "${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ($T)"; }
rls() { "${PSQL[@]}" -d $DB -At -c "select string_agg(relname || '=' || relrowsecurity, ',' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname in ($T)"; }

BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 46 && "$(tables)" == 0 ]] || { echo "FALLA: el estado inicial no es el de producción ($M0 migraciones, $(tables) tablas)"; exit 1; }
echo "antes:     $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
AFTER=$(prints); M1=$(migs)
echo "aplicada:  migraciones $M1 · tablas $(tables)/5 · hash registrado: $("${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH'")"
[[ "$AFTER" == "$BEFORE" ]] || { echo "FALLA: cambió algo existente"; exit 1; }
[[ "$M1" == "$((M0 + 1))" && "$(tables)" == 5 ]] || { echo "FALLA: aplicación incompleta"; exit 1; }
owner=$("${PSQL[@]}" -d $DB -At -c "select string_agg(distinct tableowner, ',') from pg_tables where tablename in ($T)")
[[ "$owner" == repi_app ]] || { echo "FALLA: dueño $owner"; exit 1; }
[[ "$(rls)" == "announcement_read=true,body_goal=true,body_weight_entry=true,product_announcement=true,progress_photo=true" ]] || { echo "FALLA: RLS $(rls)"; exit 1; }
echo "RLS:       $(rls) · dueño $owner"
anon=$("${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'PUBLIC') and table_name in ($T)")
[[ "$anon" == 0 ]] || { echo "FALLA: permisos públicos en tablas nuevas ($anon)"; exit 1; }
# Restricciones: una medición por día y rangos.
U=$("${PSQL[@]}" -d $DB -At -c "select id from \"user\" order by created_at limit 1")
"${PSQL[@]}" -d $DB -c "insert into body_weight_entry (user_id, measured_on, weight_g) values ('$U', '2026-11-01', 80000)"
if "${PSQL[@]}" -d $DB -c "insert into body_weight_entry (user_id, measured_on, weight_g) values ('$U', '2026-11-01', 81000)" 2>/dev/null; then echo "FALLA: dos mediciones el mismo día"; exit 1; fi
if "${PSQL[@]}" -d $DB -c "insert into body_weight_entry (user_id, measured_on, weight_g) values ('$U', '2026-11-02', 5000)" 2>/dev/null; then echo "FALLA: peso fuera de rango"; exit 1; fi
if "${PSQL[@]}" -d $DB -c "insert into product_announcement (kind, title, summary, audience, status) values ('feature', 't', 's', array['all'], 'published')" 2>/dev/null; then echo "FALLA: publicada sin fecha"; exit 1; fi
echo "restricciones: una medición por día, rango de peso y fecha de publicación (correcto)"
# Un segundo intento falla entero y no deja un registro duplicado.
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$M1" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
# Con datos de personas la reversión se niega y no toca nada.
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con datos"; exit 1; fi
[[ "$(tables)" == 5 ]] || { echo "FALLA: la reversión negada dejó cambios"; exit 1; }
echo "reversión con una medición guardada: negada, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "delete from body_weight_entry"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(tables)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: lo existente igual, migraciones $(migs), tablas $(tables)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(tables)" == 5 ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK · $(prints)"
