#!/usr/bin/env bash
# D217 · Ensayo local de la publicación de 0055 (metas propias), en una base DESCARTABLE del PostgreSQL local (nunca producción).
#   1. Copia `repi_dev` (datos de desarrollo y E2E, no reales) a `repi_verify_0055` en el estado de producción (0000–0054, 55
#      migraciones, sin 0055), con repi_app como dueño, y le agrega una meta de coach sintética si no hay ninguna.
#   2. Huella de lo existente (client_goal completo, user, coach_client, workout_session, set_log).
#   3. Aplica hosted-0055.sql y comprueba: huella intacta, filas existentes origin = 'coach', registro en drizzle, que la
#      restricción rechaza filas incoherentes, que una meta propia se puede guardar y que un segundo intento falla entero.
#   4. Comprueba que la reversión se NIEGA con metas propias; las borra, revierte, verifica la huella y reaplica.
# Uso: bash apps/web/scripts/operations/verify-0055.sh   (como root en el contenedor de desarrollo; borra sólo repi_verify_0055)
set -euo pipefail
DB=repi_verify_0055
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../drizzle/0055_self_goals.sql"
HOSTED="$HERE/hosted-0055.sql"
DOWN="$HERE/../rollback/0055_self_goals.down.sql"
PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)
[[ "$DB" == repi_verify_* ]] || { echo "base inesperada"; exit 1; }
HASH=$(sha256sum "$MIG" | cut -d' ' -f1)
grep -q "$HASH" "$HOSTED" || { echo "FALLA: hosted-0055.sql no corresponde al archivo de la migración"; exit 1; }
grep -q "$HASH" "$DOWN" || { echo "FALLA: la reversión no corresponde al archivo de la migración"; exit 1; }
WHEN=$(node -e "const j=require(process.argv[1]); const e=j.entries[j.entries.length-1]; if(e.tag!=='0055_self_goals'){process.exit(1)} console.log(e.when)" "$HERE/../../drizzle/meta/_journal.json") \
  || { echo "FALLA: el journal no termina en 0055_self_goals"; exit 1; }
grep -q "'$HASH', $WHEN)" "$HOSTED" || { echo "FALLA: hosted-0055.sql no registra el \`when\` del journal ($WHEN)"; exit 1; }
while IFS= read -r line; do [[ -z "$line" ]] && continue; grep -qF -- "$line" "$HOSTED" || { echo "FALLA: falta en hosted-0055.sql: $line"; exit 1; }; done < <(sed 's/--> statement-breakpoint//' "$MIG")

"${PSQL[@]}" -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('$DB', 'repi_dev') and pid <> pg_backend_pid()" >/dev/null
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB template repi_dev"
"${PSQL[@]}" -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'repi_app') then create role repi_app nologin; end if; end \$\$"
q() { "${PSQL[@]}" -d $DB -At -c "$1"; }
# Estado de producción: 0000–0054 sin nada de 0055 (repi_dev puede tenerla aplicada o no).
if [[ "$(q "select count(*) from information_schema.columns where table_name = 'client_goal' and column_name = 'origin'")" == 1 ]]; then
  "${PSQL[@]}" -d $DB -c "delete from client_goal where origin = 'self'" -f "$DOWN" >/dev/null
fi
"${PSQL[@]}" -d $DB -c "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I owner to repi_app', t); end loop; end \$\$" \
  -c "alter schema public owner to repi_app" -c "grant usage, create on schema drizzle to repi_app" -c "grant all on all tables in schema drizzle to repi_app" -c "grant all on all sequences in schema drizzle to repi_app"
if [[ "$(q "select count(*) from drizzle.__drizzle_migrations")" == 53 ]]; then "${PSQL[@]}" -d $DB -f "$HERE/hosted-0053.sql"; fi
if [[ "$(q "select count(*) from drizzle.__drizzle_migrations")" == 54 ]]; then "${PSQL[@]}" -d $DB -f "$HERE/hosted-0054.sql"; fi
# Una meta de coach sintética (sólo en esta copia descartable) si la copia no tiene ninguna.
if [[ "$(q "select count(*) from client_goal")" == 0 ]]; then
  q "insert into client_goal (id, coach_client_id, kind, title, target, unit, created_by) select 'verify-0055-goal', c.id, 'frequency', 'Entrenar 3 veces', '3', 'por semana', c.user_id from coach_client c order by c.id limit 1" >/dev/null
fi
prints() {
  q "select string_agg(x, ' | ' order by x) from (
    select 'client_goal=' || count(*) || ':' || coalesce(md5(string_agg(id || coach_client_id || kind || title || target || coalesce(target_reps::text, '') || unit || coalesce(baseline, '') || status || coalesce(dueon_txt, ''), ',' order by id)), '') as x
      from (select *, due_on as dueon_txt from client_goal) g
    union all select 'user=' || count(*) || ':' || coalesce(md5(string_agg(id || email || updated_at::text, ',' order by id)), '') from \"user\"
    union all select 'coach_client=' || count(*) || ':' || coalesce(md5(string_agg(id || status, ',' order by id)), '') from coach_client
    union all select 'workout_session=' || count(*) || ':' || coalesce(md5(string_agg(id || status || revision::text, ',' order by id)), '') from workout_session
    union all select 'set_log=' || count(*) || ':' || coalesce(md5(string_agg(id || coalesce(weight_kg::text, '') || coalesce(reps::text, '') || revision::text, ',' order by id)), '') from set_log) s"
}
migs() { q "select count(*) from drizzle.__drizzle_migrations"; }
cols() { q "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'client_goal' and column_name in ('user_id', 'origin')"; }

BEFORE=$(prints); M0=$(migs)
[[ "$M0" == 55 && "$(cols)" == 0 ]] || { echo "FALLA: el estado inicial no es el de producción ($M0 migraciones, $(cols) columnas)"; exit 1; }
echo "antes:     $BEFORE · migraciones $M0"
"${PSQL[@]}" -d $DB -f "$HOSTED"
AFTER=$(prints); M1=$(migs)
[[ "$AFTER" == "$BEFORE" ]] || { echo "FALLA: cambió algo existente"; exit 1; }
[[ "$M1" == "$((M0 + 1))" && "$(cols)" == 2 && "$(q "select count(*) from drizzle.__drizzle_migrations where hash = '$HASH' and created_at = $WHEN")" == 1 ]] || { echo "FALLA: aplicación incompleta"; exit 1; }
[[ "$(q "select count(*) from client_goal where origin <> 'coach' or user_id is not null or coach_client_id is null")" == 0 ]] || { echo "FALLA: filas existentes alteradas"; exit 1; }
owner=$(q "select tableowner from pg_tables where schemaname = 'public' and tablename = 'client_goal'")
[[ "$owner" == repi_app ]] || { echo "FALLA: dueño $owner"; exit 1; }
echo "aplicada:  migraciones $M1 · columnas $(cols)/2 · filas existentes origin = coach · dueño $owner"
U=$(q "select id from \"user\" order by id limit 1"); CC=$(q "select id from coach_client order by id limit 1")
# La restricción rechaza filas incoherentes y acepta una meta propia.
if "${PSQL[@]}" -d $DB -c "insert into client_goal (id, origin, kind, title, target, unit, created_by) values ('x1', 'self', 'reps', 'x', '10', 'reps', '$U')" 2>/dev/null; then echo "FALLA: meta propia sin dueño aceptada"; exit 1; fi
if [[ -n "$CC" ]] && "${PSQL[@]}" -d $DB -c "insert into client_goal (id, origin, coach_client_id, user_id, kind, title, target, unit, created_by) values ('x2', 'self', '$CC', '$U', 'reps', 'x', '10', 'reps', '$U')" 2>/dev/null; then echo "FALLA: meta con dos dueños aceptada"; exit 1; fi
"${PSQL[@]}" -d $DB -c "insert into client_goal (id, origin, user_id, kind, title, target, unit, created_by) values ('verify-0055-self', 'self', '$U', 'reps', 'Dominadas: 12', '12', 'reps', '$U')"
echo "restricción: rechaza filas incoherentes y acepta una meta propia (correcto)"
if "${PSQL[@]}" -d $DB -f "$HOSTED" 2>/dev/null; then echo "FALLA: el segundo intento no debía aplicar"; exit 1; fi
[[ "$(migs)" == "$M1" ]] || { echo "FALLA: registro duplicado"; exit 1; }
echo "reintento: falló entero, sin cambios (correcto)"
if "${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN" 2>/dev/null; then echo "FALLA: la reversión debía negarse con metas propias"; exit 1; fi
[[ "$(cols)" == 2 ]] || { echo "FALLA: la reversión negada dejó cambios"; exit 1; }
echo "reversión con metas propias: negada, sin cambios (correcto)"
"${PSQL[@]}" -d $DB -c "delete from client_goal where id = 'verify-0055-self'"
"${PSQL[@]}" -d $DB -c "set role repi_app" -f "$DOWN"
[[ "$(prints)" == "$BEFORE" && "$(migs)" == "$M0" && "$(cols)" == 0 ]] || { echo "FALLA: reversión"; exit 1; }
echo "revertida: lo existente igual, migraciones $(migs), columnas $(cols)"
"${PSQL[@]}" -d $DB -f "$HOSTED"
[[ "$(prints)" == "$BEFORE" && "$(cols)" == 2 && "$(migs)" == "$M1" ]] || { echo "FALLA: reaplicación"; exit 1; }
echo "reaplicada: OK"
"${PSQL[@]}" -d postgres -c "drop database $DB"
echo "VERIFICACIÓN 0055 OK"
