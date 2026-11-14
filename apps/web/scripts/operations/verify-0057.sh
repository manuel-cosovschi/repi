#!/usr/bin/env bash
# D221 · Ensayo local de 0057 en una base DESCARTABLE (copia de repi_dev, nunca producción): estado de producción (hasta 0056),
# huella de commercial_lead y sales_prospect, aplicar hosted-0057.sql con los roles de producción, comprobar las 7 tablas con
# RLS y dueño repi_app, que un segundo intento falla entero, que la reversión se niega con datos y que revierte y reaplica limpio.
# Uso: bash apps/web/scripts/operations/verify-0057.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0057)
set -euo pipefail
DB=repi_verify_0057
HERE="$(cd "$(dirname "$0")" && pwd)"
HOSTED="$HERE/hosted-0057.sql"; DOWN="$HERE/../rollback/0057_nutrition.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$HERE/../../drizzle/0057_nutrition.sql" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" && grep -q "$HASH" "$DOWN" || { echo "FALLA: los scripts no corresponden a la migración"; exit 1; }
TABLES="nutrition_profile nutrition_food nutrition_recipe nutrition_entry nutrition_day nutrition_favorite off_product_cache"
IN=$(printf "'%s'," $TABLES); IN=${IN%,}
"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', '${TEMPLATE:-repi_dev}') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template ${TEMPLATE:-repi_dev}"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
"${PSQL[@]}" -d $DB -c "drop table if exists $(echo $TABLES | sed 's/ /, /g') cascade" -c "delete from drizzle.__drizzle_migrations where hash = '$HASH'"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"
"${PSQL[@]}" -d $DB -c "insert into commercial_lead (kind, org_name, contact_name, email, source) select 'gym', 'Gimnasio verificación ' || g, 'Verificación', 'verif' || g || '@example.invalid', 'web' from generate_series(1, 3) g"
prints() { "${PSQL[@]}" -d $DB -At -c "select (select count(*) || ':' || coalesce(md5(string_agg(id || org_name || status, ',' order by id)), '') from commercial_lead) || '|' || (select count(*) || ':' || coalesce(md5(string_agg(id || name, ',' order by id)), '') from sales_prospect)"; }
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
objs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ($IN) and c.relrowsecurity and pg_get_userbyid(c.relowner) = 'repi_app'"; }
BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 57 && "$(objs)" == "0" ]] || { echo "FALLA: estado inicial ($M0 migraciones, $(objs) tablas)"; exit 1; }
echo "antes:      $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$((M0 + 1))" && "$(objs)" == "7" ]] || { echo "FALLA: aplicación ($(objs))"; exit 1; }
[[ "$("${PSQL[@]}" -d $DB -At -c "select hash from drizzle.__drizzle_migrations order by created_at desc limit 1")" == "$HASH" ]] || { echo "FALLA: registro"; exit 1; }
echo "aplicada:   migraciones $(migs) · 7 tablas con RLS y dueño repi_app · huella igual"
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$((M0 + 1))" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento:  falló entero, sin cambios (correcto)"
U=$("${PSQL[@]}" -d $DB -At -c "select id from \"user\" limit 1")
[[ -n "$U" ]] || "${PSQL[@]}" -d $DB -c "insert into \"user\" (id, name, email, email_verified, created_at, updated_at) values ('verif-nu', 'Verificación', 'verif-nu@example.invalid', true, now(), now())"
U=${U:-verif-nu}
"${PSQL[@]}" -d $DB -c "insert into nutrition_entry (id, user_id, day, meal, food, qty_amount, qty_unit, nutrients) values ('verifnu0001', '$U', '2026-11-14', 'cena', '{}', 100, 'g', '{}')"
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con datos"; exit 1; fi
echo "reversión:  se niega con datos de Nutrición (correcto)"
"${PSQL[@]}" -d $DB -c "delete from nutrition_entry"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(objs)" == "0" ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida:  huella igual, migraciones $(migs)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(objs)" == "7" ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK · $(prints)"
"${PSQL[@]}" -d postgres -c "drop database $DB"
