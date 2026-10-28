# REPI Connect · Modelo de datos

Actualizado: 28/10/2026 (D126). Migración `apps/web/drizzle/0025_connect.sql` (sólo agrega; aplicada en dev local y en `repi_test`; **falta aplicarla en Supabase antes del deploy**).

## `gym_task` (solicitud)

Columnas existentes: `id`, `number` (T-#### por organización, con lock), `org_id`, `location_id`, `gym_member_id`, `category`, `priority`, `status`, `source` (`app` para pedidos del socio), `summary` (comentario del socio o motivo + ejercicio), `assignee_user_id`, `created_by`, `created_at`, `due_at` (fecha del seguimiento), `taken_at`/`taken_by` (primera toma), `completed_at`/`completed_by`, `completed_off_shift`, `seen_by_member_at`.

Nuevas:

| Columna | Tipo | Uso |
| --- | --- | --- |
| `reason` | text | Motivo del socio (`ejercicio`, `revisar_rutina`, `cambiar_ejercicio`, `actualizar_pesos`, `duda`, `rutina_nueva`, `hablar`, `otro`) |
| `context` | jsonb | `exerciseId`, `exerciseName`, y sólo si la sesión es del programa del gym: `sessionId`, `programExerciseId`, `setIndex`, `programName`; `fromSession` |
| `client_key` | text | Idempotencia del pedido; índice único `(created_by, client_key)` |
| `started_at` | timestamptz | Inicio de la atención |
| `cancelled_at`, `cancelled_by` | timestamptz, text → user (set null) | Cancelación |
| `feedback`, `feedback_at` | text (`yes`/`no`), timestamptz | «¿Te sirvió?» |

`status`: `open` (Pendiente si no tiene responsable, Asignada si tiene), `pending_acceptance` (Transferida), `in_progress` (En atención), `follow_up` (Pendiente de seguimiento), `done` (Resuelta), `cancelled` (Cancelada). Sin CHECK en la base (igual que antes); lo valida el dominio.

## `gym_task_event` (historial)

| Columna | Uso |
| --- | --- |
| `task_id` → gym_task (cascade), `org_id` → organization (cascade) | Pertenencia |
| `actor_user_id` → user (set null) | Quién |
| `kind` | `created`, `taken`, `started`, `note`, `follow_up`, `transferred`, `accepted`, `declined`, `reassigned`, `resolved`, `cancelled`, `member_comment`, `feedback` |
| `from_status`, `to_status` | Transición |
| `to_user_id` → user (set null) | Destinatario de traspaso, seguimiento o reasignación |
| `note` | Registro institucional del equipo (no lo ve el socio); en `member_comment` es el texto del socio; en `feedback`, `yes`/`no` |
| `member_note` | Mensaje del equipo para el socio (resolver o cancelar) |
| `due_at` | Fecha del seguimiento |
| `created_at` | Cuándo |

Índices `(task_id, created_at)` y `(org_id, created_at)`. Trigger `gym_task_event_no_update`: cualquier UPDATE falla salvo dejar en NULL el autor o el destinatario (borrado de cuenta).

## Otras columnas

- `organization.connect_enabled` boolean, default `false`.
- `shift_log.availability` text (`available`/`busy`), default `available`.
- `notification_outbox.kind` admite `assist_new`, `assist_wait`, `assist_transfer`, `assist_due`, `assist_update` (columna text sin CHECK).

## Retención

Los pedidos y su historial viven mientras exista el gimnasio (borrar la organización los borra en cascada) y se exportan con los datos operativos del gimnasio. El texto del pedido es del socio; no debe llevar datos de salud (la interfaz lo advierte).
