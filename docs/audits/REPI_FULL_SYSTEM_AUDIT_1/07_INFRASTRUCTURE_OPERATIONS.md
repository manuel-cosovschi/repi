# 07 — Infraestructura y operación

Auditoría FSA1, 09/11/2026. Producción se consultó **sólo en lectura** (Supabase MCP, Vercel MCP y API de GitHub), salvo los dos cambios operativos aprobados por el titular, descritos en §2 y §3.

## 1. Estado verificado

| Pieza | Estado | Evidencia |
| --- | --- | --- |
| `main` | `72aa719` (#86) sobre `ddddce8` (#79) | API de GitHub |
| Producción | `ddddce80ed37` al iniciar la auditoría | `GET /api/version` |
| Migraciones | 53 en el repo y 53 en producción; la última es `0052_time_metrics` | `drizzle/meta/_journal.json` frente a `drizzle.__drizzle_migrations` |
| Base | PostgreSQL 17.11, Supavisor (puerto 6543); el código lo detecta y desactiva las sentencias preparadas | `src/db/index.ts`, `pg_stat_activity` |
| Errores de ejecución en Vercel | Ninguno desde las 02:45 UTC | `get_runtime_errors` |
| Acceso a Vercel | **Funciona**: deployments, variables (sólo nombres) y errores de ejecución. El 403 que mencionaba el máster ya no se reproduce | Vercel MCP |
| Variables de Vercel | 21, todas en Production y sensibles. Ninguna en Preview ni Development, así que una preview no llega a la base de producción. Sin duplicados ni alertas de seguridad | `filter_project_envs` sin descifrar |

## 2. Clave del cron (16.B del máster)

- **Causa:** el comando del job `repi-notifications` de pg_cron llevaba el bearer escrito, y pg_cron escribe el comando en `postgres_logs` en cada corrida.
- **Arreglo (#79):**
  - La clave nueva la generó la base y vive en Vault (`repi_cron_secret`).
  - `repi_private.cron_bearer()` (SECURITY DEFINER) sólo la ejecuta `repi_app`.
  - El titular copió la clave a Vercel y redeployó.
  - El job se reprogramó como `repi_app` el 09/11.
- **Verificado:**
  - Cron en 200 desde las 02:51 UTC.
  - Ningún job `repi-*` tiene `Bearer ` en el comando.
  - Membresía de postgres en `repi_app` restaurada (admin sí, set no).
  - `anon`, `authenticated` y `service_role` sin acceso a la función.
  - La clave vieja quedó en registros viejos, pero ya no sirve.
- **Interrupción durante el cambio:** una sola corrida con 404 (02:50 UTC). El endpoint responde 404 cuando la clave no coincide; la corrida siguiente retomó lo pendiente.

## 3. Límites de tiempo de `repi_app` (cierre del incidente de 300 s)

- **Aprobación y respaldo:** aprobados por el titular el 09/11 y aplicados tras el respaldo verde `backup-20261109-025758-42553560073` (issue #87).
- **Valores:** `idle_in_transaction_session_timeout` 30 s, `lock_timeout` 15 s, `statement_timeout` 60 s (`scripts/operations/app-role-timeouts.sql`).
- **Margen:** la consulta más lenta de `repi_app` registrada en `pg_stat_statements` tardó 0,41 s.
- **Verificado:** el cron siguió en 200 (cada corrida es una sesión nueva de `repi_app`) y Vercel no registró errores.

## 4. Respaldos (16.A y 16.F)

**Cronograma automático: funciona, con demora de GitHub.** `backup.yml` programa 06:17 y 12:47 UTC. GitHub entrega cada turno con 6 a 8 h de demora:

| Día | 1.er turno (06:17) | 2.º turno (12:47) |
| --- | --- | --- |
| 05/11 | 14:40 ✓ | 20:16 ✓ |
| 06/11 | 14:18 ✓ | 19:42 ✓ |
| 07/11 | 13:03 ✓ | 17:51 ✓ |
| 08/11 | 13:26 ✓ | 18:05 ✓ (salteado a propósito: ya había un diario ese día) |

- **Consecuencia:** el respaldo diario real ocurre entre las 10 y las 11 de Argentina, no a las 03:17. No se pierde ningún día.
- **Respaldos verificados en producción:** 14 eventos `backup.verified` en 4 días, con un hueco máximo de unas 13,5 h.
- **Vigilante:** avisa a las 30 h sin respaldo; con respaldos diarios hacia las 13–14 UTC el hueco ronda las 24 h.
- **No requiere acción del titular.** Si se quiere el respaldo de madrugada, la única alternativa es un disparador externo. No se recomienda: agrega dependencias para ganar unas horas.

**Integridad del respaldo.** Cada release documenta:
- descifrado del archivo publicado y hashes del manifiesto;
- restauración en un PostgreSQL descartable, con 357 claves foráneas sin huérfanos y 0 restricciones sin validar;
- cifrado age con clave privada fuera de GitHub;
- retención automática y prueba de la clave del titular.

El último respaldo tiene 138 tablas, 5418 filas, 53 migraciones y 0 archivos de Storage. Hay 0 archivos vigentes referenciados; ver §5.

## 5. Storage y archivos huérfanos (16.D)

- **Estado:** el bucket `repi-private` tiene 5 objetos (83 KB), todos sin fila en `media_object` ni en `upload_intent`.
  - Son fotos de progreso de 3 usuarios que ya no existen, subidas el 06/11 entre las 13:08 y las 13:28 UTC.
  - La bitácora de PP1 registra para ese momento una prueba productiva de fotos con demos, y que ninguna persona real tenía fotos.
- **Causa raíz (FSA1-INFRA-01, P2, corregido):**
  - `purgeSandboxes` borraba usuarios y organizaciones demo, y las filas de `media_object` y `upload_intent` caían en cascada.
  - Sin fila, `purgeMedia` ya no veía esos archivos: quedaban en el bucket para siempre.
  - **Arreglo:** la purga lista las claves dentro de la transacción y borra los archivos después del commit.
  - **Prueba:** `tests/sandbox.test.ts` «FSA1», que fallaba antes del arreglo.
- **Cuentas reales:** la baja es manual (`docs/PRIVACIDAD_OPERACION.md` paso 4) y ya indica listar y borrar las claves de Storage. Ningún código borra usuarios reales.
- **Detección segura:**
  - `scripts/operations/storage-orphans.sql` es de sólo lectura y muestra, por objeto, dueño, si el dueño existe, antigüedad y tamaño.
  - Regla para borrar: más de 24 h, sin fila, dueño inexistente o revisado, y respaldo verde previo.
- **Los 5 objetos existentes no se borraron.** El máster prohíbe borrar archivos de producción por inferencia. Queda como decisión del titular (ver 09).

## 6. Advertencias de Supabase

| Advertencia | Nivel | Decisión |
| --- | --- | --- |
| RLS activado sin políticas (138 tablas) | INFO | Diseño previsto (D68): la API REST pública queda sin acceso y la app entra como dueña de las tablas |
| `search_path` mutable en `gym_task_event_immutable` y `commission_entry_immutable` | WARN | Triggers de inmutabilidad que no nombran tablas (sólo `NEW`, `OLD` y `TG_OP`) ni son SECURITY DEFINER. Fijar `search_path = ''` es seguro: se hace con una migración aditiva en este bloque |
| 196 claves foráneas sin índice y 15 índices sin uso | INFO | Sin razón medible hoy: el `delete` más lento de `repi_app` (purga de demos) tarda 0,41 s. Riesgo de escala documentado en 09; no se agregan índices sin medición |

## 7. Jobs programados

| Job | Dónde | Frecuencia | Rol | Estado |
| --- | --- | --- | --- | --- |
| `repi-notifications` | pg_cron + pg_net | cada minuto | `repi_app` | 200, con la clave tomada de Vault |
| `repi-cron-cleanup` | pg_cron | 05:15 UTC | `repi_app` | activo; conserva 3 días de `cron.job_run_details` |
| `/api/cron/purge-media` | Vercel Cron | 06:30 UTC | — | activo (`vercel.json`) |
| Respaldo | GitHub Actions | 06:17 y 12:47 UTC (con demora, §4) | `repi_backup` (sólo lectura) | verde |

## 8. Integridad de datos reales (sólo lectura)

- 0 conflictos de sincronización.
- Notificaciones: ninguna fallida ni atascada en la cola.
- Sesiones reales: 21 completadas y 9 abandonadas, ninguna colgada en curso.
- 0 pesos inválidos y 0 series vigentes duplicadas.
- 59 cuentas reales.
- La huella de las tablas de datos reales se tomó antes de la auditoría y se compara al final (ver 08).
