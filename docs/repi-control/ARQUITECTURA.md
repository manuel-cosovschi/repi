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

## Objetivos y registro en la pantalla (D216)

No es un sistema aparte: la pantalla usa los mismos motores, servicios y tablas que la app.

| Qué | Cómo |
| --- | --- |
| Objetivo del profesor | La fila del plan (`setTarget`): repeticiones o tiempo, carga, %1RM, RIR/RPE, descanso, nota; método, tempo, variante, grupo (A1, A2) y actividad |
| Sugerencia de REPI | Training Intelligence 2.0. **Consultar:** `previewTargets` (mismo `recommendExercise` con el historial comparable, las señales y las cargas de la sede que `ensureTargets`), sin guardar nada. **Registrar:** los objetivos de la sesión (`ensureTargets`), los mismos que ve la app |
| Última vez | `prev` del objetivo: la última serie comparable (mismo tipo de serie y etapa). Sin datos: «Sin referencia suficiente» |
| Borrador | La carga de REPI (si no la tiene que elegir la persona), si no la indicada por el profesor, si no vacía. Nada cuenta como hecho hasta «Confirmar» |
| Empezar o seguir | `kioskStartWorkout` → el entrenamiento abierto del socio **en ese gimnasio** (empezado en la app o en otra visita) o `startSession` con `KioskVia` (relación del gimnasio de la pantalla, sin pedir el ingreso validado). Si hay otro abierto fuera del gimnasio, no se toca (409 `other_open`) |
| Registrar un ejercicio | `kioskLogExercise` → `logSet` por serie (idempotente por id; corregir usa id y revisión; un cambio concurrente queda como conflicto) y `setStageSkip` para una etapa no realizada. Una serie principal no realizada no se registra |
| Terminar | `kioskFinishWorkout` → `sessionAction("finish")`. «Salir» cierra la consulta y deja el entrenamiento abierto (lo cierra el socio o el cierre automático de siempre) |
| Origen | `workout_session.kiosk_id` y `set_log.kiosk_id` (0054) + `audit_event` (`kiosk.workout_started`, `kiosk.sets_logged`, `kiosk.workout_finished`, `session.stage_skipped`) con pantalla y credencial |
| Quién lo ve | El socio en su historial y estadísticas; el equipo de sala en la ficha («Pantalla del gimnasio») y en Training Intelligence; las progresiones siguientes lo usan |

**Rutas nuevas** (todas con el secreto de la pantalla y el token de la consulta, no-store): `GET /api/kiosk/workout`,
`POST /api/kiosk/workout` (`opId`, `dayIndex`), `POST /api/kiosk/workout/sets`, `POST /api/kiosk/workout/finish`.

**Lo que la pantalla no hace:** reemplazar ejercicios, cambiar series, descansos o cargas indicadas, aceptar propuestas,
«Aplicar ahora» una versión nueva, ni corregir entrenamientos terminados (eso sigue en el historial de la app).

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
