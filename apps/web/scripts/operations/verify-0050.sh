#!/usr/bin/env bash
# D209 · Ensayo local de 0050 en una base DESCARTABLE (copia de repi_dev, nunca producción): estado de producción (hasta 0049),
# huella de commercial_lead, aplicar hosted-0050.sql con los roles de producción, comprobar las 19 tablas con RLS, la columna,
# el trigger y el registro, que un segundo intento falla entero, que el libro es inmutable, revertir y reaplicar.
# Uso: bash apps/web/scripts/operations/verify-0050.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0050)
set -euo pipefail
DB=repi_verify_0050
HERE="$(cd "$(dirname "$0")" && pwd)"
HOSTED="$HERE/hosted-0050.sql"; DOWN="$HERE/../rollback/0050_sales_force.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$HERE/../../drizzle/0050_sales_force.sql" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" && grep -q "$HASH" "$DOWN" || { echo "FALLA: los scripts no corresponden a la migración"; exit 1; }
TABLES="sales_region sales_rep sales_rep_invitation commission_plan commission_plan_version sales_rep_plan sales_prospect sales_opportunity sales_deal sales_activity sales_attribution sales_request commission_entry payout_batch payout_item payout_payment sales_target sales_material sales_notice"
IN=$(printf "'%s'," $TABLES); IN=${IN%,}
"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
# Llevar la copia al estado de producción: sin 0050.
"${PSQL[@]}" -d $DB -c "drop table if exists $(echo $TABLES | sed 's/ /, /g') cascade" -c "drop function if exists commission_entry_immutable()" \
  -c "alter table commercial_lead drop column if exists referral_code" -c "delete from drizzle.__drizzle_migrations where hash = '$HASH'"
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"
# Contactos de muestra (la huella tiene que cubrir filas, no una tabla vacía).
"${PSQL[@]}" -d $DB -c "insert into commercial_lead (kind, org_name, contact_name, email, source) select 'gym', 'Gimnasio verificación ' || g, 'Verificación', 'verif' || g || '@example.invalid', 'web' from generate_series(1, 3) g"
prints() { "${PSQL[@]}" -d $DB -At -c "select count(*) || ':' || coalesce(md5(string_agg(id || org_name || contact_name || coalesce(email, '') || status || created_at::text, ',' order by id)), '') from commercial_lead"; }
migs() { "${PSQL[@]}" -d $DB -At -c "select count(*) from drizzle.__drizzle_migrations"; }
objs() { "${PSQL[@]}" -d $DB -At -c "select (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ($IN) and c.relrowsecurity and pg_get_userbyid(c.relowner) = 'repi_app') || ':' || (select count(*) from information_schema.columns where table_name = 'commercial_lead' and column_name = 'referral_code') || ':' || (select count(*) from pg_trigger where tgname = 'commission_entry_no_update')"; }
BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 50 && "$(objs)" == "0:0:0" ]] || { echo "FALLA: estado inicial ($M0 migraciones, $(objs))"; exit 1; }
echo "antes:      $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$((M0 + 1))" && "$(objs)" == "19:1:1" ]] || { echo "FALLA: aplicación ($(objs))"; exit 1; }
[[ "$("${PSQL[@]}" -d $DB -At -c "select hash from drizzle.__drizzle_migrations order by created_at desc limit 1")" == "$HASH" ]] || { echo "FALLA: registro"; exit 1; }
echo "aplicada:   migraciones $(migs) · 19 tablas con RLS y dueño repi_app · columna y trigger · huella igual"
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$((M0 + 1))" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento:  falló entero, sin cambios (correcto)"
# El libro no se edita: un asiento de prueba no se puede modificar ni borrar.
"${PSQL[@]}" -d $DB -c "insert into sales_rep (id, code, email, name, status) values ('verif-rep', 'V-VERIF0', 'verif@example.invalid', 'Verificación', 'active')" \
  -c "insert into commission_entry (key, rep_id, source_type, amount_minor, currency, accrual_on, available_on, concept) values ('verif:1', 'verif-rep', 'adjustment', 100, 'ARS', current_date, current_date, 'Verificación')"
if "${PSQL[@]}" -d $DB -c "update commission_entry set amount_minor = 0 where key = 'verif:1'" 2>/dev/null; then echo "FALLA: el libro se pudo editar"; exit 1; fi
if "${PSQL[@]}" -d $DB -c "delete from commission_entry where key = 'verif:1'" 2>/dev/null; then echo "FALLA: el libro se pudo borrar"; exit 1; fi
echo "libro:      no se puede editar ni borrar (correcto)"
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con datos"; exit 1; fi
echo "reversión:  se niega con datos comerciales (correcto)"
"${PSQL[@]}" -d $DB -c "alter table commission_entry disable trigger commission_entry_no_update" -c "delete from commission_entry" -c "delete from sales_rep"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(objs)" == "0:0:0" ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida:  huella igual, migraciones $(migs)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(objs)" == "19:1:1" ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK · $(prints)"
"${PSQL[@]}" -d postgres -c "drop database $DB"
