#!/usr/bin/env bash
# REPI Control · Ensayo local de la publicación de 0053, en una base DESCARTABLE del PostgreSQL local (nunca producción).
#   1. Copia `repi_dev` (datos de desarrollo y E2E, no reales) a `repi_verify_0053`, en el estado de producción (0000–0052,
#      53 migraciones, sin nada de 0053), con repi_app como dueño.
#   2. Huella de lo existente: filas y md5 de user, organization, staff_membership, gym_member, commercial_lead, program_version,
#      program_exercise, workout_session, set_log y own_routine (sin las columnas nuevas).
#   3. Aplica hosted-0053.sql con los mismos roles que producción y comprueba: huella intacta, todas las organizaciones en
#      «open» y sin pantalla, tablas nuevas con RLS y sin permisos públicos, el registro en drizzle (sha256 y `when`), las
#      restricciones (política fuera de la lista, código que no tiene 6 dígitos, código vigente repetido) y que un segundo
#      intento falla sin dejar nada a medias.
#   4. Comprueba que la reversión se NIEGA con datos de uso real (gimnasio real supervisado, revocación registrada); los
#      deshace, revierte con rollback/0053 y vuelve a comprobar la huella; reaplica para dejarla publicada.
# Uso: bash apps/web/scripts/operations/verify-0053.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0053)
set -euo pipefail
DB=repi_verify_0053
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../drizzle/0053_repi_control.sql"
HOSTED="$HERE/hosted-0053.sql"
DOWN="$HERE/../rollback/0053_repi_control.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$MIG" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" || { echo "FALLA: hosted-0053.sql no corresponde al archivo de la migración"; exit 1; }
grep -q "$HASH" "$DOWN" || { echo "FALLA: la reversión no corresponde al archivo de la migración"; exit 1; }
WHEN=$(node -e "const j=require(process.argv[1]); const e=j.entries[j.entries.length-1]; if(e.tag!=='0053_repi_control'){process.exit(1)} console.log(e.when)" "$HERE/../../drizzle/meta/_journal.json") \
  || { echo "FALLA: el journal no termina en 0053_repi_control"; exit 1; }
grep -q "'$HASH', $WHEN)" "$HOSTED" || { echo "FALLA: hosted-0053.sql no registra el \`when\` del journal ($WHEN)"; exit 1; }

"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
# Estado de producción: 0000–0052, sin nada de 0053 (repi_dev puede tenerla aplicada o no).
"${PSQL[@]}" -d $DB -c "drop table if exists kiosk_session, kiosk_credential, gym_kiosk" \
  -c "alter table organization drop constraint if exists organization_routine_policy_valid" \
  -c "alter table organization drop column if exists routine_policy" -c "alter table organization drop column if exists kiosk_enabled" \
  -c "alter table staff_membership drop column if exists revoked_at" -c "alter table staff_membership drop column if exists revoked_by" \
  -c "alter table commercial_lead drop column if exists product_mode" -c "delete from drizzle.__drizzle_migrations where hash = '$HASH'"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"

prints() {
  "${PSQL[@]}" -d $DB -At -c "select string_agg(x, ' | ' order by x) from (
    select 'user=' || count(*) || ':' || coalesce(md5(string_agg(id || email || updated_at::text, ',' order by id)), '') as x from \"user\"
    union all select 'organization=' || count(*) || ':' || coalesce(md5(string_agg(id || name || status || connect_enabled::text, ',' order by id)), '') from organization
    union all select 'staff_membership=' || count(*) || ':' || coalesce(md5(string_agg(id || role || status || coalesce(location_id, ''), ',' order by id)), '') from staff_membership
    union all select 'gym_member=' || count(*) || ':' || coalesce(md5(string_agg(id || status, ',' order by id)), '') from gym_member
    union all select 'commercial_lead=' || count(*) || ':' || coalesce(md5(string_agg(id || kind || status || coalesce(interest, ''), ',' order by id)), '') from commercial_lead
    union all select 'program_version=' || count(*) || ':' || coalesce(md5(string_agg(id || number::text || locked::text, ',' order by id)), '') from program_version
    union all select 'program_exercise=' || count(*) || ':' || coalesce(md5(string_agg(id || reps || sets::text || coalesce(detail::text, ''), ',' order by id)), '') from program_exercise
    union all select 'workout_session=' || count(*) || ':' || coalesce(md5(string_agg(id || status || revision::text, ',' order by id)), '') from workout_session
    union all select 'set_log=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(weight_kg::text, '') || coalesce(reps::text, '') || revision::text, ',' order by id)), '') from set_log
    union all select 'own_routine=' || count(*) || ':' || coalesce(md5(string_agg(id || name || exercises::text, ',' order by id)), '') from own_routine) s"
}
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
tabs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from pg_tables where schemaname = 'public' and tablename in ('gym_kiosk', 'kiosk_credential', 'kiosk_session')"; }
q() { "${PSQL[@]}" -d $DB -At -c "$1"; }
fails() { local out; if out=$("${PSQL[@]}" -d $DB -c "$1" 2>&1); then echo "FALLA: $2"; exit 1; fi; [[ -z "${3:-}" || "$out" == *"$3"* ]] || { echo "FALLA: $2 (otro error: $out)"; exit 1; }; }

BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 53 && "$(tabs)" == 0 ]] || { echo "FALLA: el estado inicial no es el de producción ($M0 migraciones, $(tabs) tablas)"; exit 1; }
echo "antes:     $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
AFTER=$(prints); M1=$(migs)
[[ "$AFTER" == "$BEFORE" ]] || { echo "FALLA: cambió algo existente"; exit 1; }
[[ "$M1" == "$((M0 + 1))" && "$(tabs)" == 3 && "$(q "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH' and created_at = $WHEN")" == 1 ]] || { echo "FALLA: aplicación incompleta"; exit 1; }
[[ "$(q "select count(*) from organization where routine_policy <> 'open' or kiosk_enabled")" == 0 ]] || { echo "FALLA: alguna organización quedó supervisada o con pantalla"; exit 1; }
owner=$(q "select string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'public' and tablename in ('gym_kiosk', 'kiosk_credential', 'kiosk_session', 'organization')")
[[ "$owner" == repi_app ]] || { echo "FALLA: dueño $owner"; exit 1; }
[[ "$(q "select count(*) from pg_tables where schemaname = 'public' and tablename in ('gym_kiosk', 'kiosk_credential', 'kiosk_session') and rowsecurity")" == 3 ]] || { echo "FALLA: RLS"; exit 1; }
echo "aplicada:  migraciones $M1 · tablas nuevas $(tabs)/3 con RLS · todas las organizaciones en «open» y sin pantalla · dueño $owner"
# Restricciones.
fails "update organization set routine_policy = 'cerrado' where id = (select id from organization order by id limit 1)" "política fuera de la lista" organization_routine_policy_valid
GM=$(q "select id from gym_member order by id limit 1"); ORG=$(q "select org_id from gym_member where id = '$GM'")
if [[ -n "$GM" ]]; then
  fails "insert into kiosk_credential (org_id, gym_member_id, member_code, pin_hash) values ('$ORG', '$GM', '12345', 'x')" "código de 5 dígitos" kiosk_credential_code_format
  "${PSQL[@]}" -d $DB -c "begin" -c "insert into kiosk_credential (org_id, gym_member_id, member_code, pin_hash) values ('$ORG', '$GM', '123456', 'x')" -c "rollback"
  GM2=$(q "select id from gym_member where org_id = '$ORG' and id <> '$GM' order by id limit 1")
  if [[ -n "$GM2" ]]; then
    fails "begin; insert into kiosk_credential (org_id, gym_member_id, member_code, pin_hash) values ('$ORG', '$GM', '123456', 'x'); insert into kiosk_credential (org_id, gym_member_id, member_code, pin_hash) values ('$ORG', '$GM2', '123456', 'x'); commit;" "código vigente repetido en el gimnasio" kiosk_credential_code_unique
  fi
fi
[[ "$(prints)" == "$BEFORE" && "$(q "select count(*) from kiosk_credential")" == 0 ]] || { echo "FALLA: la verificación cambió algo existente"; exit 1; }
echo "restricciones: política, formato del código y código vigente único (correcto)"
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$M1" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
# Con uso real la reversión se niega y no toca nada.
RORG=$(q "select id from organization where not is_demo and kind = 'gym' order by id limit 1")
if [[ -n "$RORG" ]]; then
  "${PSQL[@]}" -d $DB -c "update organization set routine_policy = 'supervised' where id = '$RORG'"
  if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con un gimnasio real supervisado"; exit 1; fi
  [[ "$(tabs)" == 3 ]] || { echo "FALLA: la reversión negada dejó cambios"; exit 1; }
  "${PSQL[@]}" -d $DB -c "update organization set routine_policy = 'open' where id = '$RORG'"
fi
SM=$(q "select id from staff_membership order by id limit 1")
"${PSQL[@]}" -d $DB -c "update staff_membership set revoked_at = now() where id = '$SM'"
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con una revocación registrada"; exit 1; fi
"${PSQL[@]}" -d $DB -c "update staff_membership set revoked_at = null where id = '$SM'"
echo "reversión con uso real: negada, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(tabs)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: lo existente igual, migraciones $(migs), tablas $(tabs)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(tabs)" == 3 && "$(migs)" == "$M1" ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK"
