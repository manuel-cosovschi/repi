# Gym Access · Auditoría previa (D127)

Qué había en REPI antes de este bloque y qué se reutilizó. Fuente: código en `main` al 28/10/2026 (a65195e).

## Lo que ya existía

| Pieza | Dónde | Uso en Gym Access |
|---|---|---|
| Membresía institucional `gym_member` (pending_consent, active, suspended, ended) | `db/schema.ts`, `server/join/services.ts` | Base del estado de membresía; se suma `access_until` (vigencia) |
| QR fijo de alta por sede (`/unirse/<slug>`) | `server/join`, «Accesos y QR» | Sigue siendo el QR de **alta**. No se mezcla con el QR de **ingreso** |
| Carnet del socio y check-in de mostrador (`attendance`) | `server/community/services.ts` `checkIn` | Si el control está activo, el carnet también emite un ingreso validado (método «desk») |
| Sesiones de entrenamiento con sincronización sin conexión | `server/training/services.ts`, `lib/offline/queue.ts` | Se protegen `startSession`, `logSet` y cambio de ejercicio del programa del gimnasio |
| Roles y capacidades por sede | `packages/domain/src/gym.ts`, `gymContext` | Sin capacidades nuevas: `members.approve`, `reception.desk`, `members.validate` |
| Auditoría (`audit_event`) | `server/access/util.ts` | Todos los cambios de política, pantallas, vigencias, revocaciones |
| Banderas por módulo | `lib/features.ts` | Nueva `gym_access` (general) + `gym_access_policy.enabled` (por gimnasio) |

## Lo que faltaba

- Política del gimnasio sobre qué acciones exigen presencia.
- QR dinámico firmado y de vida corta, validado en el servidor.
- Un «ingreso validado» con vencimiento, revocable, idempotente por persona.
- Control en el servidor (no sólo en la interfaz) de iniciar/registrar el entrenamiento del gimnasio.
- Panel para el dueño, pantallas de recepción sin sesión de persona y validación a mano.

## Riesgos detectados

- El QR fijo de alta no puede servir de control de ingreso: una foto vale para siempre.
- Bloquear en la interfaz no alcanza: la API de sesiones y series se llama directo (cola sin conexión).
- Repi Coach comparte las mismas tablas de sesiones: el control debe aplicarse sólo a sesiones con `gym_member_id`.
