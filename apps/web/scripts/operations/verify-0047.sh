#!/usr/bin/env bash
# D205 · Ensayo local de la publicación de 0047, en una base DESCARTABLE del PostgreSQL local (nunca producción).
#   1. Copia `repi_dev` (datos de desarrollo, no reales) a `repi_verify_0047` y la deja en el estado de producción (hasta 0046).
#   2. Huella de lo existente: commercial_lead completo (antes de sumar columnas), set_log, workout_session y user.
#   3. Aplica hosted-0047.sql con los mismos roles que producción (repi_app dueño; postgres con SET).
#   4. Comprueba huella, RLS, dueño, sin permisos públicos, el registro en drizzle y que un segundo intento falla entero.
#   5. La reversión se NIEGA con un contacto sin email; sin él, revierte y la huella vuelve a coincidir. Reaplica al final.
# Uso: bash apps/web/scripts/operations/verify-0047.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0047)
set -euo pipefail
DB=repi_verify_0047
HERE="$(cd "$(dirname "$0")" && pwd)"
HOSTED="$HERE/hosted-0047.sql"
DOWN="$HERE/../rollback/0047_experience_hub.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$HERE/../../drizzle/0047_experience_hub.sql" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" || { echo "FALLA: hosted-0047.sql no corresponde al archivo de la migración"; exit 1; }
grep -q "$HASH" "$DOWN" || { echo "FALLA: la reversión no corresponde al archivo de la migración"; exit 1; }

"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
# Estado de producción: 0000–0046 (47 registros), sin nada de 0047.
"${PSQL[@]}" -d $DB -c "drop table if exists site_event" -c "delete from commercial_lead where email is null" \
  -c "alter table commercial_lead drop column if exists source, drop column if exists campaign, drop column if exists interest" \
  -c "alter table commercial_lead alter column email set not null" -c "delete from drizzle.__drizzle_migrations where hash = '$HASH'" \
  -c "insert into commercial_lead (kind, org_name, contact_name, email) values ('gym', 'Gimnasio de ensayo', 'Contacto ensayo', 'ensayo@test.repi.local')"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"

prints() {
  "${PSQL[@]}" -d $DB -At -c "select string_agg(x, ' | ') from (
    select 'commercial_lead=' || count(*) || ':' || coalesce(md5(string_agg(id || kind || org_name || contact_name || coalesce(email, '') || coalesce(phone, '') || coalesce(message, '') || status || created_at::text, ',' order by id)), '') as x from commercial_lead
    union all select 'set_log=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(weight_kg::text, '') || coalesce(reps::text, '') || revision::text, ',' order by id)), '') from set_log
    union all select 'workout_session=' || count(*) || ':' || coalesce(md5(string_agg(id || status || revision::text, ',' order by id)), '') from workout_session
    union all select 'user=' || count(*) || ':' || coalesce(md5(string_agg(id || email, ',' order by id)), '') from \"user\") s"
}
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
has() { "${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'site_event'"; }

BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 47 && "$(has)" == 0 ]] || { echo "FALLA: el estado inicial no es el de producción ($M0 migraciones)"; exit 1; }
echo "antes:     $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
AFTER=$(prints); M1=$(migs)
[[ "$AFTER" == "$BEFORE" ]] || { echo "FALLA: cambió algo existente"; exit 1; }
[[ "$M1" == "$((M0 + 1))" && "$(has)" == 1 ]] || { echo "FALLA: aplicación incompleta"; exit 1; }
echo "aplicada:  migraciones $M1 · hash registrado: $("${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH'")"
info=$("${PSQL[@]}" -d $DB -At -c "select tableowner || ' rls=' || (select relrowsecurity from pg_class where relname = 'site_event' and relnamespace = 'public'::regnamespace) from pg_tables where tablename = 'site_event'")
[[ "$info" == "repi_app rls=true" ]] || { echo "FALLA: $info"; exit 1; }
anon=$("${PSQL[@]}" -d $DB -At -c "select count(*) from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'PUBLIC') and table_name = 'site_event'")
[[ "$anon" == 0 ]] || { echo "FALLA: permisos públicos en site_event ($anon)"; exit 1; }
echo "site_event: dueño y RLS $info · permisos públicos $anon"
cols=$("${PSQL[@]}" -d $DB -At -c "select string_agg(column_name || ':' || is_nullable, ',' order by column_name) from information_schema.columns where table_name = 'commercial_lead' and column_name in ('email', 'source', 'campaign', 'interest')")
[[ "$cols" == "campaign:YES,email:YES,interest:YES,source:YES" ]] || { echo "FALLA: columnas $cols"; exit 1; }
echo "commercial_lead: $cols"
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$M1" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "insert into commercial_lead (kind, org_name, contact_name, phone, source) values ('partner', '—', 'Sólo WhatsApp', '223 555-0101', 'qr')" -c "insert into site_event (name, source) values ('qr_scan', 'qr')"
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse"; exit 1; fi
[[ "$(has)" == 1 ]] || { echo "FALLA: la reversión negada dejó cambios"; exit 1; }
echo "reversión con un contacto sólo con WhatsApp: negada, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "delete from commercial_lead where email is null"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(has)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: lo existente igual, migraciones $(migs)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(has)" == 1 ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK · $(prints)"
