# REPI Control · arquitectura

## Política por gimnasio

- `organization.routine_policy`: «open» (por defecto) o «supervised». La validan una restricción CHECK y `policyOfOrg`. Los
  coaches independientes son siempre «open».
- **Contexto:** la relación activa del socio (`myActive`). La política no se pega a la persona sino al gimnasio con el que
  entrena en ese momento. Un socio con un gimnasio supervisado y un coach personal elige su relación activa y, con el coach,
  conserva sus rutinas propias. Las rutinas propias son de la persona (no tienen organización) y nunca se borran ni se ocultan
  en la base. La app las esconde en el contexto supervisado (`myTraining.supervised`) y el servidor rechaza crearlas,
  importarlas o entrenarlas ahí.
- **Personal:** crear, cambiar, asignar y publicar programas institucionales ya exigía `program.edit` vigente: coordinación y
  sala. El dueño, la gerencia y recepción no programan. Las versiones (`program_version`) quedan; el historial y las sesiones
  pasadas conservan su versión.

### Puntos de entrada bloqueados en contexto supervisado

| Entrada | Servicio |
| --- | --- |
| `POST /api/me/routines` (crear o editar), `/:id/duplicate` | `saveOwnRoutine` |
| `POST /api/me/routines/:id/start` | `startOwnRoutine` → `startSoloRoutine` |
| `POST /api/me/routines/import`, `/import/save` | `previewRoutineImport` (antes de leer el archivo o gastar IA), `saveImportedRoutines` |
| `POST /api/me/exercises` | `createMyExercise` |
| `POST /api/me/solo/routine` y `/start` | `soloRoutine` (antes de gastar IA), `startSoloRoutine` |
| `GET /api/me/solo`, `POST /api/me/solo/ai` | `soloPlan`, `aiSoloAdvice` |
| Cerebro: chat y acciones | `decideExecution` con `supervised` → bloquea `propose_substitution`, `propose_short_session`, `apply_substitution` y `apply_short_session` |

### Lo que sigue permitido

- Ver el programa asignado y entrenarlo (`startSession`, `logSet`). Registrar es lo realizado, no cambia la prescripción.
- Cambiar un ejercicio sólo por hoy a mano (máquina ocupada), que queda como lo realizado.
- Ver el historial e importar entrenamientos pasados.
- Pedirle algo al equipo de sala (programa, técnica, consulta), «Llamar a sala» y registrar molestias.
- Borrar sus propias rutinas guardadas (sus datos).

## Kiosco

| Tabla | Para qué |
| --- | --- |
| `gym_kiosk` | Pantallas autorizadas (sede, nombre, hash del secreto, quién la creó y revocó, última vez vista) |
| `kiosk_credential` | Una vigente por `gym_member`: código de 6 dígitos único vigente en el gimnasio, hash del PIN, fallos, pausa, emisión y revocación |
| `kiosk_session` | Consulta en curso: pantalla, credencial, hash del token, vencimiento, cierre y motivo |

**Padrón y cuentas:**
- La credencial cuelga de `gym_member`, la relación socio-gimnasio que exige una cuenta. Ahí se asignan los programas.
- El padrón (`roster_entry`) no tiene cuenta ni programa, así que no se usa.
- No se crean identidades ficticias ni duplicadas: quien no tiene cuenta hace el alta como hoy (QR de la sede, invitación o
  recepción) y después recepción le emite el código.
- El código **no** es DNI, teléfono, nombre ni número de socio: es al azar.

**Rutas:**

| Ruta | Quién | Para qué |
| --- | --- | --- |
| `GET /api/kiosk/hello` | Pantalla | Datos de la bienvenida |
| `POST /api/kiosk/identify` | Pantalla | Identificación con código y PIN |
| `GET /api/kiosk/program` | Pantalla | Programa del socio identificado |
| `POST /api/kiosk/end` | Pantalla | Cierre de la consulta |
| `GET /api/kiosk/media/:id?t=` | Pantalla | Video del gimnasio con URL firmada |
| `GET /api/gym/:org/kiosk` | Personal | Estado de las pantallas |
| `POST /api/gym/:org/kiosk/devices` y `…/:id/revoke` | Dueño o gerencia | Registrar y revocar pantallas |
| `GET /api/gym/:org/kiosk/members/:id` y `POST …/issue`, `…/revoke` | Recepción, gerencia o dueño | Credenciales del socio |
| `GET` y `POST /api/me/kiosk` | Socio | Su código y su PIN |

## QR

| QR | Para qué | Dónde |
| --- | --- | --- |
| Ingreso al gimnasio (D127) | Valida la entrada | Pantalla de ingreso, se renueva |
| Alta en la sede (`/unirse/...`) | Pedir la membresía | Recepción, impreso |
| App opcional (`/instalar?src=pantalla`) | Usar REPI en el celular | Pantalla de rutinas, con el rótulo «No es el QR de ingreso al gimnasio» |

## STF-09

Está en `server/gym/staff-admin.ts`; el detalle, en `docs/DECISIONS.md` D214.

**Quién gestiona a quién:** se calcula por fila (rol y sede), con `canTouch`.

**Efectos de revocar o cambiar:**
- `releaseWork` / `releaseAll`: las tareas activas vuelven a la cola de su sede, con evento «reassigned».
- El turno abierto de esa persona se cierra.
- Queda en `audit_event`.
