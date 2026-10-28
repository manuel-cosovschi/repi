# REPI Connect · Arquitectura

Actualizado: 28/10/2026 (D126).

## Decisión principal: extender, no duplicar

La auditoría encontró que REPI ya tenía casi toda la base: cola de asistencia por sede (`gym_task`, F-GT-02), turnos (`shift_log`, F-GT-01), traspaso de turno con aceptación (`gym_handoff`, F-GT-04), notas institucionales y personales separadas (`gym_note`), pedidos del socio al equipo de sala (D41), avisos al piso en vivo (`floor_alert`), cola de avisos push con deduplicación (`notification_outbox`) y centro de avisos del staff. Connect se monta sobre eso:

| Necesidad del pedido | Qué se reutilizó | Qué se agregó |
| --- | --- | --- |
| AssistanceRequest | `gym_task` (misma tabla, misma numeración T-####) | columnas `reason`, `context`, `client_key`, `started_at`, `cancelled_*`, `feedback*` |
| Estados | `open`, `pending_acceptance`, `done`, `cancelled` | `in_progress` (En atención) y `follow_up` (Pendiente de seguimiento) |
| AssistanceEvent | `audit_event` sólo para auditoría | `gym_task_event`: historial de sólo agregado, con trigger que impide editarlo |
| AssistanceHandoff | `gym_handoff` + `gym_handoff_item` | se usan también al transferir una solicitud fuera del cierre de turno |
| StaffAvailability | `shift_log` (en turno o no) | columna `availability` (`available` / `busy`), declarada |
| AssistanceFeedback | — | columnas `feedback` y `feedback_at` en la solicitud |
| Notificaciones | `notification_outbox` + `enqueue` + centro de avisos | tipos `assist_new`, `assist_wait`, `assist_transfer`, `assist_due`, `assist_update` |
| Roles | capacidades de `packages/domain/src/gym.ts` | ninguna capacidad nueva: `floor.work`, `task.reassign`, `team.read` |
| Feature flag | `features.ts` | `connect` global + `organization.connect_enabled` por gimnasio |

## Piezas

- **Dominio** `packages/domain/src/connect.ts`: motivos y su categoría, máquina de estados `connectNext`, estado visible `connectState`, prioridad `connectPriority`, orden de bandeja `connectSort`, reglas proactivas (umbrales), `connectMetrics` y `fmtMinutes`. Tests en `connect.test.ts`.
- **Servidor** `apps/web/src/server/gym/connect.ts`: socio (`memberCreate`, `memberBoard`, `memberDetail`, `memberCancel`, `memberComment`, `memberFeedback`), equipo (`staffBoard`, `staffTask`, `staffAct`, `setAvailability`), gestión (`connectReport`), job (`connectSweep`) y estado para avisos (`connectNoticeState`). `addEvent` vive en `gym/services.ts` y lo usan también las acciones de la cola anterior, así el historial queda completo aunque el gimnasio apague Connect.
- **Rutas**: `/api/me/gym/connect…` (socio), `/api/gym/[orgId]/connect/…` (equipo y gestión), `/api/admin/contracts/[id]/connect` (activación). Detalle en [REPI_CONNECT_API.md](REPI_CONNECT_API.md).
- **Pantallas**: `components/member/Connect.tsx` (hoja de pedido, tarjeta en Inicio, «Mis pedidos»), botón «Pedir ayuda a sala» en `Workout.tsx`, `components/gym/Connect.tsx` (bandeja «Sala» con detalle, «Seguimiento de sala»), tarjeta en la ficha de Admin, guía de Gym y de Admin, recorrido de la demo.
- **Job**: `connectSweep` corre con `/api/cron/notifications` y `pnpm jobs:notifications`.

## Consistencia

- **Asignación atómica**: cada acción del equipo bloquea la fila (`select … for update`) dentro de una transacción y valida la transición con `connectNext`. Dos tomas simultáneas: una gana, la otra recibe «X ya tomó T-####» (prueba con `Promise.allSettled`).
- **Idempotencia**: el socio envía una `clientKey` por pedido (índice único por autor); un reintento devuelve el mismo pedido. Además, un pedido igual (mismo motivo y ejercicio) todavía abierto no se duplica.
- **Cancelación concurrente**: socio y profesor se serializan por el mismo bloqueo; el último evento coincide siempre con el estado final.
- **Historial inalterable**: trigger `gym_task_event_immutable`; sólo admite que la supresión de una cuenta deje en NULL al autor o destinatario (procedimiento D75). Las filas se borran sólo en cascada con la solicitud o la organización.
- **Turno**: tomar, atender, registrar, seguimiento, transferir y resolver exigen turno activo en la sede o permiso de trabajo fuera de turno (D08), igual que la cola. Aceptar o rechazar un traspaso no exige turno. Cancelar es de gestión.
- **Sesión todavía sin sincronizar**: si el socio pide ayuda desde un entrenamiento que empezó sin conexión, se guarda sólo el ejercicio de la biblioteca.

## Compatibilidad

Con Connect apagado la cola de siempre lista también los seguimientos libres, permite completar tareas «en atención» o «en seguimiento» y cuenta esos estados en los paneles de gerencia (`metrics.ts`). Los pedidos cancelados no aparecen en la lista anterior del socio.
