# REPI Connect · API

Actualizado: 28/10/2026 (D126). Todas las rutas exigen sesión; los errores tienen `code` y mensaje en español. Rate limit general de escritura del Gym (120 por persona) y 20 pedidos por IP para crear pedidos.

## Socio · `/api/me/gym/connect`

| Método | Ruta | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| GET | `/api/me/gym/connect` | — | `{ enabled, place, gymMemberId, requests[] }` con `state`, `stateLabel`, `assignee` (nombre de pila), `canCancel`, `canFeedback`, `unseen` |
| GET | `/api/me/gym/connect/:id` | — | `{ label, exercise, state, timeline[], canCancel, canComment, canFeedback }`; marca como visto si está cerrado |
| POST | `/api/me/gym/connect` | `{ reason, comment?, clientKey?, gymMemberId?, context?: { sessionId, programExerciseId, exerciseId, setIndex } }` | `{ id, ref, duplicate, place, notified }` |
| POST | `/api/me/gym/connect/:id/cancel` | `{}` | `{ ok, already }` (409 si ya lo atienden) |
| POST | `/api/me/gym/connect/:id/comment` | `{ text }` | `{ ok }` |
| POST | `/api/me/gym/connect/:id/feedback` | `{ helpful }` | `{ ok, already }` |

`/api/me/inbox` suma `gym.connect` (boolean) para que la app decida qué hoja mostrar.

## Equipo y gestión · `/api/gym/:orgId/connect`

| Método | Ruta | Cuerpo | Permiso |
| --- | --- | --- | --- |
| GET | `/connect/board?loc=` | — | `floor.work` · bandeja: `me`, `team`, `counts`, `incoming`, `mine`, `pending`, `followUps`, `others`, `closed` |
| GET | `/connect/tasks/:id` | — | `floor.work` · detalle con `context`, `events`, `previous`, `targets`, `actions` |
| POST | `/connect/tasks/:id` | `{ action, note?, memberNote?, toUserId?, dueAt?, done?, pending?, next?, forShift? }` | `floor.work` (o `task.reassign` para `cancel`) |
| POST | `/connect/availability` | `{ availability: "available" \| "busy" }` | `floor.work` con turno iniciado |
| GET | `/connect/report?loc=&days=7\|30\|90` | — | `team.read` · `metrics`, `weekly`, `byLocation`, `team`, `stateNow`, `openNow`, `oldestPendingMin` |

`action`: `take`, `start`, `note`, `follow_up`, `transfer`, `accept`, `decline`, `resolve`, `cancel`. Errores: `taken` (otra persona la tomó, con su nombre), `not_mine`, `closed`, `invalid`, `no_shift`, `connect_off`, `forbidden`, `not_found`.

`/api/gym/:orgId/context` suma `connect` (boolean).

## Admin

`POST /api/admin/contracts/:id/connect` `{ on }` → `{ connectEnabled, changed }`. Sólo gimnasios; audita `connect.enabled` / `connect.disabled`.

## Job

`connectSweep()` en `/api/cron/notifications` (cada minuto) y `pnpm jobs:notifications`: avisa una vez por pedido sin tomar a los 15 minutos (a quienes están en turno) y una vez por día por seguimiento que vence en 24 h o vencido (a su responsable, o al turno si quedó libre). Respeta la pausa de avisos de cada persona.
