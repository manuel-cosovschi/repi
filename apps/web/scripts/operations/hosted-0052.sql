-- Aplicación de 0052 en producción (ejercicios por tiempo: cinta por duración, velocidad e inclinación), en UNA transacción.
-- Mismo efecto que `scripts/migrate.ts`: las sentencias del archivo y el registro en drizzle.__drizzle_migrations (sha256 del
-- archivo y `when` del journal). No crea tablas (RLS no aplica a columnas nuevas). Si algo ya existe, falla entero.
-- Mismo manejo de roles que hosted-0051.sql (repi_app como dueño; postgres sólo con SET dentro de la transacción).
-- PRERREQUISITOS: workflow «Respaldo» en verde y reciente (docs/RESPALDOS.md), 0051 aplicada (52 migraciones registradas) y
-- aprobación explícita del titular.
-- ADITIVA: dos columnas nulas (exercise.metrics_profile, set_log.metrics), dos CHECK (catálogo de perfiles; métricas como objeto
-- JSON) y el perfil de las filas del catálogo de REPI (sin organización ni dueño), por nombre y tipo de registro. No modifica
-- ejercicios propios, series, sesiones, programas ni historial (lo prueba verify-0052.sh). El código actual de producción es
-- compatible con 0052 aplicada (no lee ni escribe estas columnas): aplicar ANTES de integrar.
-- NO APLICADO. Ensayado en una base descartable con scripts/operations/verify-0052.sh.
-- Generado desde drizzle/0052_time_metrics.sql (sha256 8479be9db877c55fbc9bda556ef5c7401a8019630b41154d54c45bc7f6e27b54).
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
ALTER TABLE "exercise" ADD COLUMN "metrics_profile" text;
ALTER TABLE "set_log" ADD COLUMN "metrics" jsonb;
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_metrics_profile_valid" CHECK ("exercise"."metrics_profile" is null or "exercise"."metrics_profile" in ('strength', 'bodyweight', 'hold', 'treadmill', 'bike', 'rower', 'elliptical', 'stair', 'duration'));
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_metrics_object" CHECK ("set_log"."metrics" is null or jsonb_typeof("set_log"."metrics") = 'object');
-- Ejercicios por tiempo (07/11/2026): perfil de métricas del catálogo de REPI (filas sin organización ni dueño), por nombre y
-- con el mismo tipo de registro que el catálogo (EXERCISE_CATALOG, cuarto valor). Sólo completa filas sin perfil: nunca toca
-- ejercicios propios de una organización o de un alumno, ni un perfil ya guardado. Volver a correrlo no cambia nada.
UPDATE "exercise" AS e SET "metrics_profile" = v.profile
FROM (VALUES
  ('Press de banca', 'load_reps', 'strength'), ('Press de banca con mancuernas', 'load_reps', 'strength'), ('Press inclinado con barra', 'load_reps', 'strength'), ('Press inclinado mancuernas', 'load_reps', 'strength'),
  ('Press declinado con barra', 'load_reps', 'strength'), ('Press declinado con mancuernas', 'load_reps', 'strength'), ('Press en máquina', 'load_reps', 'strength'), ('Press inclinado en máquina', 'load_reps', 'strength'),
  ('Press en multipower', 'load_reps', 'strength'), ('Aperturas con mancuernas', 'load_reps', 'strength'), ('Aperturas inclinadas con mancuernas', 'load_reps', 'strength'), ('Aperturas en máquina (pec deck)', 'load_reps', 'strength'),
  ('Cruce de poleas', 'load_reps', 'strength'), ('Cruce de poleas bajas', 'load_reps', 'strength'), ('Pullover con mancuerna', 'load_reps', 'strength'), ('Flexiones', 'bodyweight', 'bodyweight'),
  ('Flexiones inclinadas', 'bodyweight', 'bodyweight'), ('Flexiones declinadas', 'bodyweight', 'bodyweight'), ('Flexiones diamante', 'bodyweight', 'bodyweight'), ('Fondos para pecho', 'bodyweight', 'bodyweight'),
  ('Press con banda elástica', 'load_reps', 'strength'), ('Dominadas', 'bodyweight', 'bodyweight'), ('Dominadas supinas', 'bodyweight', 'bodyweight'), ('Dominadas asistidas', 'load_reps', 'strength'),
  ('Jalón al pecho', 'load_reps', 'strength'), ('Jalón al pecho agarre cerrado', 'load_reps', 'strength'), ('Jalón al pecho supino', 'load_reps', 'strength'), ('Jalón tras nuca', 'load_reps', 'strength'),
  ('Remo con barra', 'load_reps', 'strength'), ('Remo Pendlay', 'load_reps', 'strength'), ('Remo con mancuerna a una mano', 'load_reps', 'strength'), ('Remo en polea', 'load_reps', 'strength'),
  ('Remo en máquina', 'load_reps', 'strength'), ('Remo en T', 'load_reps', 'strength'), ('Remo invertido', 'bodyweight', 'bodyweight'), ('Remo con apoyo en banco inclinado', 'load_reps', 'strength'),
  ('Pullover en polea', 'load_reps', 'strength'), ('Face pull', 'load_reps', 'strength'), ('Encogimientos con barra', 'load_reps', 'strength'), ('Encogimientos con mancuernas', 'load_reps', 'strength'),
  ('Peso muerto', 'load_reps', 'strength'), ('Peso muerto con barra hexagonal', 'load_reps', 'strength'), ('Rack pull', 'load_reps', 'strength'), ('Hiperextensiones', 'bodyweight', 'bodyweight'),
  ('Hiperextensiones con peso', 'load_reps', 'strength'), ('Buenos días', 'load_reps', 'strength'), ('Press militar', 'load_reps', 'strength'), ('Press militar sentado con barra', 'load_reps', 'strength'),
  ('Press de hombros con mancuernas', 'load_reps', 'strength'), ('Press Arnold', 'load_reps', 'strength'), ('Press de hombros en máquina', 'load_reps', 'strength'), ('Press landmine', 'load_reps', 'strength'),
  ('Elevaciones laterales', 'load_reps', 'strength'), ('Elevaciones laterales en polea', 'load_reps', 'strength'), ('Elevaciones laterales en máquina', 'load_reps', 'strength'), ('Elevaciones frontales', 'load_reps', 'strength'),
  ('Elevaciones frontales con disco', 'load_reps', 'strength'), ('Pájaros con mancuernas', 'load_reps', 'strength'), ('Vuelos posteriores en máquina', 'load_reps', 'strength'), ('Remo al mentón', 'load_reps', 'strength'),
  ('Rotación externa en polea', 'load_reps', 'strength'), ('Rotación interna en polea', 'load_reps', 'strength'), ('Y-T-W en banco inclinado', 'load_reps', 'strength'), ('Pino contra la pared', 'time', 'hold'),
  ('Flexiones pike', 'bodyweight', 'bodyweight'), ('Curl con barra', 'load_reps', 'strength'), ('Curl con barra Z', 'load_reps', 'strength'), ('Curl con mancuernas', 'load_reps', 'strength'),
  ('Curl alternado con mancuernas', 'load_reps', 'strength'), ('Curl martillo', 'load_reps', 'strength'), ('Curl concentrado', 'load_reps', 'strength'), ('Curl en banco Scott', 'load_reps', 'strength'),
  ('Curl inclinado con mancuernas', 'load_reps', 'strength'), ('Curl en polea', 'load_reps', 'strength'), ('Curl spider', 'load_reps', 'strength'), ('Curl invertido', 'load_reps', 'strength'),
  ('Curl de muñeca', 'load_reps', 'strength'), ('Extensión de muñeca', 'load_reps', 'strength'), ('Fondos en paralelas', 'bodyweight', 'bodyweight'), ('Fondos en banco', 'bodyweight', 'bodyweight'),
  ('Press francés', 'load_reps', 'strength'), ('Press francés con mancuernas', 'load_reps', 'strength'), ('Extensión de tríceps en polea', 'load_reps', 'strength'), ('Extensión de tríceps con soga', 'load_reps', 'strength'),
  ('Extensión de tríceps sobre la cabeza', 'load_reps', 'strength'), ('Extensión de tríceps en polea sobre la cabeza', 'load_reps', 'strength'), ('Patada de tríceps', 'load_reps', 'strength'), ('Press de banca agarre cerrado', 'load_reps', 'strength'),
  ('Extensión de tríceps en máquina', 'load_reps', 'strength'), ('Sentadilla', 'load_reps', 'strength'), ('Sentadilla frontal', 'load_reps', 'strength'), ('Sentadilla goblet', 'load_reps', 'strength'),
  ('Sentadilla en multipower', 'load_reps', 'strength'), ('Sentadilla hack', 'load_reps', 'strength'), ('Sentadilla búlgara', 'load_reps', 'strength'), ('Sentadilla sumo', 'load_reps', 'strength'),
  ('Sentadilla con peso corporal', 'bodyweight', 'bodyweight'), ('Sentadilla con salto', 'bodyweight', 'bodyweight'), ('Sentadilla a una pierna (pistol)', 'bodyweight', 'bodyweight'), ('Sentadilla en pared', 'time', 'hold'),
  ('Prensa', 'load_reps', 'strength'), ('Prensa a una pierna', 'load_reps', 'strength'), ('Estocadas', 'load_reps', 'strength'), ('Estocadas caminando', 'load_reps', 'strength'),
  ('Estocadas hacia atrás', 'load_reps', 'strength'), ('Estocadas laterales', 'load_reps', 'strength'), ('Step up al cajón', 'load_reps', 'strength'), ('Extensión de cuádriceps', 'load_reps', 'strength'),
  ('Curl femoral', 'load_reps', 'strength'), ('Curl femoral sentado', 'load_reps', 'strength'), ('Curl femoral acostado', 'load_reps', 'strength'), ('Curl nórdico', 'bodyweight', 'bodyweight'),
  ('Peso muerto rumano', 'load_reps', 'strength'), ('Peso muerto rumano con mancuernas', 'load_reps', 'strength'), ('Peso muerto a una pierna', 'load_reps', 'strength'), ('Peso muerto sumo', 'load_reps', 'strength'),
  ('Gemelos de pie', 'load_reps', 'strength'), ('Gemelos sentado', 'load_reps', 'strength'), ('Gemelos en prensa', 'load_reps', 'strength'), ('Aductores en máquina', 'load_reps', 'strength'),
  ('Abductores en máquina', 'load_reps', 'strength'), ('Saltos al cajón', 'bodyweight', 'bodyweight'), ('Hip thrust', 'load_reps', 'strength'), ('Hip thrust en máquina', 'load_reps', 'strength'),
  ('Hip thrust a una pierna', 'bodyweight', 'bodyweight'), ('Puente de glúteos', 'bodyweight', 'bodyweight'), ('Puente de glúteos con peso', 'load_reps', 'strength'), ('Patada de glúteo en polea', 'load_reps', 'strength'),
  ('Patada de glúteo en máquina', 'load_reps', 'strength'), ('Abducción de cadera con banda', 'bodyweight', 'bodyweight'), ('Caminata lateral con banda', 'bodyweight', 'bodyweight'), ('Frog pump', 'bodyweight', 'bodyweight'),
  ('Pull through en polea', 'load_reps', 'strength'), ('Clamshell con banda', 'bodyweight', 'bodyweight'), ('Plancha', 'time', 'hold'), ('Plancha lateral', 'time', 'hold'),
  ('Plancha con toque de hombros', 'bodyweight', 'bodyweight'), ('Abdominales (crunch)', 'bodyweight', 'bodyweight'), ('Crunch en polea', 'load_reps', 'strength'), ('Crunch inverso', 'bodyweight', 'bodyweight'),
  ('Elevación de piernas colgado', 'bodyweight', 'bodyweight'), ('Elevación de rodillas colgado', 'bodyweight', 'bodyweight'), ('Elevación de piernas acostado', 'bodyweight', 'bodyweight'), ('Rueda abdominal', 'bodyweight', 'bodyweight'),
  ('Pallof press', 'load_reps', 'strength'), ('Leñador en polea', 'load_reps', 'strength'), ('Giro ruso', 'bodyweight', 'bodyweight'), ('Dead bug', 'bodyweight', 'bodyweight'),
  ('Bird dog', 'bodyweight', 'bodyweight'), ('Hollow hold', 'time', 'hold'), ('Mountain climbers', 'time', 'hold'), ('Bicicleta abdominal', 'bodyweight', 'bodyweight'),
  ('Paseo del granjero', 'load_reps', 'strength'), ('Paseo con carga a un lado', 'load_reps', 'strength'), ('Superman', 'bodyweight', 'bodyweight'), ('Sit-up', 'bodyweight', 'bodyweight'),
  ('Burpees', 'bodyweight', 'bodyweight'), ('Swing con kettlebell', 'load_reps', 'strength'), ('Cargada de potencia', 'load_reps', 'strength'), ('Arranque', 'load_reps', 'strength'),
  ('Envión', 'load_reps', 'strength'), ('Thruster', 'load_reps', 'strength'), ('Clean con mancuerna', 'load_reps', 'strength'), ('Turkish get-up', 'load_reps', 'strength'),
  ('Wall ball', 'load_reps', 'strength'), ('Lanzamiento de balón medicinal', 'load_reps', 'strength'), ('Empuje de trineo', 'time', 'hold'), ('Arrastre de trineo', 'time', 'hold'),
  ('Battle ropes', 'time', 'hold'), ('Salto de rana', 'bodyweight', 'bodyweight'), ('Oso (bear crawl)', 'time', 'hold'), ('Cinta (caminata)', 'time', 'treadmill'),
  ('Cinta (trote)', 'time', 'treadmill'), ('Bicicleta fija', 'time', 'bike'), ('Bicicleta de aire', 'time', 'bike'), ('Remo ergómetro', 'time', 'rower'),
  ('Elíptico', 'time', 'elliptical'), ('Escaladora', 'time', 'stair'), ('Soga (saltar la cuerda)', 'time', 'duration'), ('Jumping jacks', 'time', 'duration'),
  ('Skierg', 'time', 'duration'), ('Movilidad de cadera 90/90', 'time', 'hold'), ('Estiramiento de isquiotibiales', 'time', 'hold'), ('Estiramiento de flexores de cadera', 'time', 'hold'),
  ('Movilidad de tobillo', 'time', 'hold'), ('Movilidad torácica', 'time', 'hold'), ('Gato-vaca', 'time', 'hold'), ('Postura del niño', 'time', 'hold'),
  ('Dislocaciones de hombro con palo', 'bodyweight', 'bodyweight'), ('Rotaciones de cadera', 'bodyweight', 'bodyweight'), ('Foam roller', 'time', 'hold')
) AS v(name, kind, profile)
WHERE e."org_id" IS NULL AND e."owner_user_id" IS NULL AND e."metrics_profile" IS NULL AND e."name" = v.name AND e."kind" = v.kind;
do $$ begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'exercise' and column_name = 'metrics_profile') or (table_name = 'set_log' and column_name = 'metrics'))) <> 2 then raise exception '0052: faltan columnas'; end if;
  if (select count(*) from pg_constraint where contype = 'c' and conname in ('exercise_metrics_profile_valid', 'set_log_metrics_object')) <> 2 then raise exception '0052: faltan las restricciones'; end if;
  if exists (select 1 from exercise where metrics_profile is not null and (org_id is not null or owner_user_id is not null)) then raise exception '0052: el perfil del catálogo tocó un ejercicio propio'; end if;
  if exists (select 1 from set_log where metrics is not null) then raise exception '0052: hay métricas registradas antes de publicar'; end if;
  if exists (select 1 from exercise where org_id is null and owner_user_id is null and name = 'Cinta (caminata)' and kind = 'time' and metrics_profile is distinct from 'treadmill') then raise exception '0052: la cinta del catálogo no quedó como cinta'; end if;
  if exists (select 1 from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'PUBLIC') and table_name in ('exercise', 'set_log')) then raise exception '0052: permisos públicos'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('8479be9db877c55fbc9bda556ef5c7401a8019630b41154d54c45bc7f6e27b54', 1794073806399);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
