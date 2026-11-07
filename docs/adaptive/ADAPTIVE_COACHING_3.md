# REPI — Adaptive Coaching 3.0 · Personal Trainer Intelligence (D209)

Fuente del pedido: `docs/adaptive/AC3_MASTER_PROMPT.md` (texto del titular, 07/11/2026). Auditoría del código en el que se
apoya (mapas con archivo:línea): `docs/adaptive/ac3-auditoria/` (engines, workout, ai, data, notify, memberui, coachgym,
importhist, tests; evidencia y modelos). `ADAPTIVE_COACH_ARCHITECTURE.md` queda como antecedente histórico.

Este documento es el **contrato** del bloque: módulos, tablas, APIs, reglas y pruebas. El estado real (qué quedó activo y
probado) se registra al final, en «Estado», y en `docs/continuidad/PROXIMA_SESION.md`.

## 1. Principios

1. **Un solo cerebro, ningún motor nuevo de entrenamiento.** El núcleo («REPI Intelligence Core», código `brain`) orquesta,
   interpreta, conversa y toma la iniciativa. Los números salen de lo que ya existe y es determinístico:
   - `recommendExercise`, `adjustAfterSet` y `nextProposal` (Training Intelligence 2.x);
   - `suggestNext`, `checkLoad` y las guardas de `load-safety`;
   - `exerciseTrend`, los servicios de progreso y cuerpo, y la procedencia de Smart Import.
2. **El registro manda.** Una recomendación nunca pisa una serie registrada. A mitad de sesión nunca se sube la carga. Las
   cargas del entrenador no se reemplazan en silencio. El programa del entrenador no se modifica sin su aprobación.
3. **Determinístico primero, IA sólo cuando suma.** Intenciones frecuentes, respuestas con datos, avisos y acciones se
   resuelven con reglas, sin modelo. La IA interpreta lenguaje libre y redacta; su salida pasa por esquema estricto y
   validación del servidor, y nunca ejecuta nada por sí sola.
4. **Saber callar.** Toda oportunidad pasa por el motor de relevancia, que puede decidir «no intervenir».
5. **Privado por defecto.** La memoria y la conversación son de la persona. Nadie más las lee: ni el entrenador, ni la
   gerencia, ni REPI Admin, que sólo ve agregados técnicos. Todo entra en la exportación y en el borrado.
6. **Funciona sin IA y sin Internet.** Entrenar, registrar, ver objetivos y la guía por serie siguen andando offline. Lo
   que necesita servidor o modelo avisa que no está disponible y no bloquea nada.

## 2. Arquitectura en capas (§18 del máster)

| Capa | Dónde | Qué hace |
| --- | --- | --- |
| 1 · Datos y eventos | servicios existentes + `server/brain/events.ts` | eventos de sesión, programa, progreso, importación, conversación |
| 2 · Reglas | `packages/domain/src/brain/*` (puro) | comparaciones, progresión (reutilizada), guardas, prioridades, dedupe, cambios |
| 3 · Contexto | `server/brain/context.ts` | arma el `BrainContext` autorizado y su versión mínima para IA |
| 4 · Decisión | `domain/brain/relevance.ts`, `domain/brain/intents.ts` | intervenir, preguntar, explicar o no hacer nada |
| 5 · IA | `server/brain/gateway.ts` → `server/ai/openai.ts` | lenguaje libre, redacción; con cuotas, presupuesto, breaker, caché |
| 6 · Validación | `domain/brain/actions.ts`, `checkLoad`, esquemas | toda salida del modelo se valida contra reglas, permisos y datos reales |
| 7 · Acción | `server/brain/actions.ts` | ejecuta sólo acciones del catálogo vía servicios existentes, idempotente y auditada |
| 8 · Evaluación | `coach_intervention`, `coach_action`, `ai_usage`, feedback | aceptada, ignorada, modificada, útil; métricas en REPI Admin |

## 3. Dominio puro — `packages/domain/src/brain/`

Sin DOM ni Node; con pruebas Vitest al lado. Todos los textos son en español rioplatense con voseo: breves, sin «¡campeón!»
y sin diagnósticos.

- **`types.ts`:** tipos compartidos del núcleo.
  - `Fact<T>`: `{ value, source, at, kind: "recorded"|"declared"|"calculated"|"inferred", quality, validUntil?, consent? }`.
  - `BrainContext`, `BrainEvent`, `Candidate`, `Intervention`, `MemoryItem`, `Intent`, `ActionKind`, `ActionSpec`,
    `Autonomy` (0|1|2), `BrainPrefs`, `Evidence`.
- **`context.ts`:** helpers puros sobre el contexto.
  - Frescura y calidad de cada dato; qué falta, para que REPI lo reconozca.
  - `contextForAi(ctx)`: versión mínima. Sin emails, nombres de terceros, fotos, notas de otros ni datos de salud sin
    consentimiento. Usa referencias cortas (`e1`, `e2`) en lugar de ids.
- **`safety.ts`:** detección de señales de alarma en texto libre.
  - Dolor agudo, pecho, mareo, desmayo, palpitaciones, falta de aire, lesión → respuesta de seguridad fija: detener,
    consultar a un profesional y, si son síntomas de alarma, buscar atención médica. Nunca diagnostica.
  - Molestia en un ejercicio → priorizar detenerlo, ofrecer registrarla (con confirmación) y consultar al entrenador.
  - Política por edad: menor de edad o edad desconocida, sin temas de cuerpo, peso ni alimentación por chat; adulto, sí.
- **`intents.ts`:** clasificador determinístico.
  - Intenciones: qué toca hoy, última marca de un ejercicio, por qué ese peso, tendencia o progreso, cuántas veces
    entrené X, máquina ocupada, poco tiempo (minutos), molestia, baja energía, explicar un método (drop set, rest-pause,
    myo-reps, cluster, EMOM, AMRAP, superserie, top set, back-off), declarar o borrar una preferencia, pedir menos avisos,
    preparar una consulta al entrenador, pedir ayuda en sala, objetivo de peso, explicar la rutina importada, saludo.
  - Resultado: `{ intent, slots, confidence }`; si no alcanza, `unknown`.
- **`answers.ts`:** respuestas con datos.
  - Arma cada respuesta desde el contexto y los servicios, con `evidence` («Comparé las sesiones del 12/10, 19/10…;
    excluí las anuladas y las de aproximación»).
  - Si no hay datos, lo dice. No inventa fechas, sesiones ni números.
- **`session.ts`:** el entrenamiento.
  - `briefExercise`: antes del ejercicio, junta lo prescrito, la última comparable, la recomendación de Training
    Intelligence (la de la persona) con su porqué, las restricciones y los datos faltantes.
  - `interpretSet`: envuelve `adjustAfterSet` y respeta aproximaciones, etapas de drop/rest-pause/myo/cluster,
    AMRAP/tiempo y superseries. Decide si hablar.
  - `sessionReview`: al cerrar, compara lo hecho contra lo programado y contra la sesión anterior; marcas, ejercicios
    omitidos, adaptaciones y una propuesta prudente para la próxima. No siempre propone subir.
  - `shortenSession(min)`: adaptación conservadora. Conserva los prioritarios y lo indicado; nunca borra lo registrado;
    dice qué se conserva y qué se omite; vale sólo por hoy.
  - `rankAlternatives`: reemplazos aprobados por el entrenador primero, después la biblioteca (mismo patrón y equipo
    disponible, si se conoce), evitando restricciones. Una o dos opciones, sin inventar máquinas.
- **`relevance.ts`:** el motor de relevancia.
  - `decide(candidates, { prefs, recent, now })` → `{ emit, suppressed[{ candidate, reason }] }`.
  - Orden de prioridad: seguridad > instrucción del entrenador > ayuda en sesión > progreso > logro > recordatorio.
  - Aplica dedupe por clave, cooldown por tipo, tope diario, horario de silencio (también el que cruza la medianoche, en
    hora de Buenos Aires), opt-out por categoría, «no mostrar algo parecido», menores y cancelación de obsoletos (versión
    de programa, sesión cerrada).
  - Si hay varios, prefiere un resumen.
- **`memory.ts`:** política de memoria.
  - Tipos: `preference`, `decision`, `outcome`, `temporal`. Los hechos no se guardan: se leen de la base.
  - Caducidad por tipo: temporal hasta el fin del día o de la sesión; decisiones 180 días; resultados 180 días;
    preferencias sin vencimiento hasta que se borren.
  - Normalización y deduplicación; invalidación cuando cambia el dato de origen (programa, sesión, ejercicio).
  - Lista negra de inferencias: nada psicológico, médico ni íntimo.
- **`actions.ts`:** catálogo de acciones con riesgo y política de autonomía.
  - Autonomía 0: informa. 1: propone y pide confirmación (por defecto). 2: ejecuta sólo lo de bajo riesgo que la persona
    habilitó.
  - Ningún nivel toca datos sensibles, decisiones médicas ni programas del entrenador sin su aprobación.
  - `validateAction(spec, ctx)` con esquema estricto.
- **`quiet.ts`:** horario de silencio y ventanas en hora argentina.

**Corrección en Training Intelligence (dentro del bloque, con prueba):** en pirámides, las filas principales con distintas
repeticiones mezclaban la historia de la sesión (`intelligence.ts:237`). Ahora cada fila compara con su par.

## 4. Datos — migración aditiva 0050

Todas las tablas son nuevas y tienen:
- `ON DELETE CASCADE` a `user`, y a `organization` donde aplica;
- RLS habilitado, igual que el resto;
- ids de texto UUID y fechas `timestamptz`.

No se toca ninguna tabla existente salvo con columnas nuevas con valor por defecto (ninguna en 0050).

| Tabla | Para qué | Claves |
| --- | --- | --- |
| `brain_pref` | preferencias de asistencia por persona | PK `user_id`. Columnas: `proactive` (avisos dentro de la app, `true`), `push` (`false`, requiere opt-in), `categories` jsonb (training, progress, performance, motivation, weekly; motivation apagado), `quiet_start`/`quiet_end` (`'22:00'`/`'08:00'`), `max_per_day` (2), `autonomy` (1), `tone` (`'normal'`/`'breve'`), `updated_at` |
| `brain_memory` | preferencias declaradas, decisiones, resultados, contexto temporal | `id`, `user_id`, `kind`, `key`, `value` jsonb, `text`, `source` (user/system/coach), `ref` jsonb, `created_at`, `expires_at`, `revoked_at`. Índice (`user_id`, `kind`, `key`) |
| `brain_thread` | conversación con REPI (una activa por persona; se puede cerrar y empezar otra) | `id`, `user_id`, `created_at`, `updated_at`, `closed_at` |
| `brain_message` | mensajes de la conversación | `id`, `thread_id`, `user_id`, `role` (user/repi), `text`, `cards` jsonb, `actions` jsonb, `section`, `ref` jsonb, `via` (rules/ai/fallback/safety), `feedback` (−1/1), `created_at`. Retención: 180 días |
| `brain_intervention` | avisos y tarjetas (también lo suprimido, para métricas) | `id`, `user_id`, `kind`, `dedupe_key` UNIQUE (`user_id`, `dedupe_key`), `priority`, `channel` (card/inline/push), `status` (pending/shown/accepted/dismissed/never/expired/cancelled/suppressed), `reason`, `payload` jsonb, `evidence` jsonb, `program_version_id`, `created_at`, `shown_at`, `resolved_at`, `expires_at` |
| `brain_action` | registro de acciones | `id`, `user_id`, `kind`, `idempotency_key` UNIQUE (`user_id`, `idempotency_key`), `status` (proposed/confirmed/executed/failed/blocked/cancelled), `autonomy`, `input` jsonb, `result` jsonb, `error`, `created_at`, `executed_at` |
| `ai_usage` | uso de IA sin contenido | `id`, `user_id` (null si es del sistema), `org_id`, `task`, `model`, `input_tokens`, `cached_tokens`, `output_tokens`, `cost_micros`, `latency_ms`, `outcome` (ok/error/timeout/refused/bad_output/budget/breaker/concurrency/cache), `created_at`. Retención: 400 días |
| `ai_policy` | límites configurables | PK `scope` (`global` / `org:<id>` / `user:<id>`). Columnas: `config` jsonb (`enabled`, `user_daily_calls`, `org_monthly_micros`, `global_daily_micros`, `max_concurrency`, modelos por tarea), `updated_at`, `updated_by` |
| `ai_breaker` | circuit breaker por tarea | PK `task`. Columnas: `failures`, `opened_until`, `updated_at` |

**Producción:**
- Se aplica con `scripts/operations/hosted-0050.sql`, en una sola transacción, como `repi_app`, con RLS y su
  autoverificación.
- Ensayo: `verify-0050.sh` sobre una copia descartable. Reversión: `scripts/rollback/0050_brain.down.sql`.
- Antes de aplicar: workflow «Respaldo» en verde.

**Privacidad:**
- `exportMyData` incluye todas las tablas `brain_*` de la persona. `ai_usage` va sin contenido.
- El borrado de la cuenta las elimina en cascada.
- La purga diaria borra mensajes de más de 180 días, intervenciones vencidas de más de 90 días y `ai_usage` de más de 400
  días.
- La purga de entornos demo también las cubre.

## 5. Servidor — `apps/web/src/server/brain/`

- **`gateway.ts`** envuelve `aiJson` sin cambiar su contrato y hace, en orden:
  1. Política (`ai_policy`: global, org, usuario).
  2. Cuota diaria por usuario: llamadas, con clave por usuario y no por IP.
  3. Presupuesto en micro-dólares (global diario y org mensual).
  4. Breaker por tarea (5 fallas → abierto 10 minutos).
  5. Concurrencia (máximo por usuario 1 y global configurable).
  6. Caché por hash de entrada con invalidación por versión de contexto.
  7. Timeout, cancelación con `AbortSignal` y un reintento sólo en 429/5xx.
  8. Registro en `ai_usage` con tokens y costo estimado según la tabla de precios de `gateway.ts`.

  - **Si algo falla:** devuelve `null` y el llamador usa la respuesta determinística (fallback).
  - **Ruteo por tarea:**
    - `brain.chat` (respuestas cortas) y `brain.intent` (clasificar lo que las reglas no resuelven): `OPENAI_MODEL_BRAIN`,
      por defecto `gpt-6-luna`, el más económico vigente según la documentación oficial (US$0,10 / US$0,50 por millón de
      tokens).
    - `brain.explain` (explicaciones largas): `OPENAI_MODEL_BRAIN_DEEP`, que por defecto es el mismo.
  - **Topes por defecto:** IA habilitada, 30 llamadas por usuario por día, US$2 por día global, US$20 por mes por
    organización. Se cambian en REPI Admin. Con 0, la IA del cerebro queda apagada y todo sigue andando por reglas.
- **`context.ts`:** `buildContext(userId, { section, ref })`.
  - Arma el contexto sólo con lo que la persona puede ver de sí misma: perfil y deseos, relación (gimnasio, coach o
    propia), programa y versión vigentes, sesión abierta, historial y marcas, Training Intelligence, check-in, molestias
    y restricciones vigentes, cuerpo (sólo adultos y sólo números), procedencia de rutinas importadas y memoria vigente.
  - `ref` (ejercicio, sesión, serie) se valida contra la base: el navegador sólo sugiere, el servidor decide.
- **`memory.ts`:** CRUD con procedencia, vencimiento, corrección y borrado. También registra decisiones y resultados.
- **`conversation.ts`:** hilos y mensajes; continuidad entre secciones. Al modelo se le manda un resumen y los últimos 6
  turnos, no todo el historial.
- **`orchestrator.ts`:** `handleMessage`, en este orden:
  1. Seguridad.
  2. Intención por reglas.
  3. Respuesta por reglas, o IA con esquema `{ reply, actions[] }`.
  4. Validación.
  5. Persistencia.
  6. Métricas.

  El texto de rutinas importadas, notas y mensajes va al modelo como dato delimitado, nunca como instrucción.
- **`actions.ts`:** `propose` / `confirm` / `execute` con clave idempotente, permisos, versión vigente, seguridad y
  auditoría (`audit_event` + `brain_action`). La confirmación muestra el resultado real del servidor. Ejecutores:
  - reemplazo sólo por hoy: `setExerciseChange` existente;
  - adaptación por poco tiempo: marcar como omitidos, sólo hoy, los ejercicios pendientes elegidos;
  - guardar o borrar una preferencia;
  - registrar feedback;
  - preparar un borrador de consulta al entrenador (no se envía solo);
  - pedir ayuda en sala (servicio existente, con confirmación);
  - dejar una propuesta para el entrenador (`training_proposal`, revisable).
- **`proactive.ts`:** genera candidatos a partir de eventos (al cerrar una sesión, al abrir Inicio) y de un paso del cron
  existente cada minuto, idempotente y con ventana horaria. Pasa todo por `relevance.decide` y escribe en
  `brain_intervention`. Push sólo con `push=true`, fuera del horario de silencio y si la persona es adulta.
- **`coach.ts`:** señales para el entrenador sobre alumnos con relación activa y consentimiento `training`: dificultad
  creciente en sesiones comparables, sustituciones rechazadas, propuestas pendientes, alumno que pidió revisar la
  distribución. Nunca muestra memoria ni conversación del alumno.
- **`admin.ts`:** métricas agregadas (uso, costo, latencia, errores, fallbacks, avisos emitidos/suprimidos/aceptados,
  acciones ejecutadas/bloqueadas) y edición de `ai_policy`, detrás de `requireAdmin`.

**APIs** (todas con sesión; la prueba `api-auth-sweep` las cubre):
- `GET /api/me/brain`: la tarjeta de Inicio y los avisos vigentes.
- `POST /api/me/brain/message`: un mensaje a REPI.
- `GET /api/me/brain/thread`: la conversación vigente.
- `POST /api/me/brain/thread/close`: cerrar la conversación.
- `POST /api/me/brain/action`: proponer, confirmar o cancelar una acción.
- `POST /api/me/brain/intervention`: aceptar, descartar o «no mostrar más».
- `POST /api/me/brain/feedback`: opinar sobre una respuesta.
- `GET/PUT /api/me/brain/prefs`: preferencias.
- `GET /api/me/brain/memory` y `DELETE /api/me/brain/memory/[id]`: ver y borrar la memoria.
- `GET /api/me/brain/session/[id]/review`: el cierre de una sesión.
- `GET /api/coach/[orgId]/clients/[relId]/brain`: señales para el entrenador sobre un alumno.
- `GET/PUT /api/admin/brain`: métricas y límites.

## 6. Interfaz — una familia, no ocho sistemas

Familia `components/brain/*`, con estado compartido en un `BrainProvider` montado sobre el árbol de `MemberApp`, para que
sobreviva al entrenamiento abierto. Usa los tokens y estilos existentes en claro, oscuro y automático, y no agrega colores
sueltos (guard de tema).

- **Inicio:** `RepiCard`, después del bloque «próximo entrenamiento».
  - Muestra una sola prioridad del día.
  - Acciones: Ver por qué · Empezar · Hablar con REPI · Descartar · No mostrar algo parecido.
  - Absorbe el aviso de programa actualizado.
- **Entrenar:**
  - Una línea de briefing bajo `SetGuide`.
  - El mensaje por serie en el descanso (ya existe, ahora con el del servidor).
  - «Preguntale a REPI» en la fila de herramientas, con atajos: máquina ocupada, poco tiempo, molestia, baja energía.
  - Sin pop-ups durante la serie ni el descanso, salvo seguridad.
  - Sin conexión dice «REPI responde cuando vuelva la conexión» y no bloquea.
- **Cierre:** `SessionReview` en la pantalla Done, después de las marcas.
- **Conversación:** `RepiPanel`, panel no modal que se abre desde cualquier sección con el contexto de esa sección.
  - Historial, sugerencias rápidas y tarjetas con datos.
  - Acciones bien diferenciadas de las respuestas, con confirmación.
  - Feedback, estados de carga y error, y cerrar y retomar.
  - Cada respuesta indica de dónde sale: «Dato registrado», «Calculado por REPI» o «Sugerencia generada con IA».
- **«¿Por qué?»:** explicación con evidencia (sesiones comparadas, qué se excluyó).
- **Progreso y Mi cuerpo:** «Preguntale a REPI sobre este ejercicio»; objetivo de peso sólo para adultos y sin fotos.
- **Mis rutinas:** «Entender esta rutina»: qué decía, qué faltaba, qué completaste, qué se sugirió.
- **Mensajes:** «Preparar consulta con REPI» deja un borrador en el campo; no se envía solo.
- **Perfil → Asistente REPI:**
  - Avisos dentro de la app, por categorías, push (opt-in del socio con el permiso del navegador), horario de silencio,
    frecuencia, autonomía y tono.
  - «Lo que REPI recuerda»: ver, borrar o corregir.
- **Coach:**
  - Señales en la pestaña Rendimiento del alumno y en «Pendientes».
  - Los borradores van al editor existente con `ProposalDraft`.
- **REPI Admin:** pantalla «Coaching IA» con métricas reales y límites. Nada privado de alumnos.

Lo visual está desacoplado del cerebro (`brain/presenter`): el mismo contenido puede alimentar más adelante al personaje
animado y su voz sin cambiar el núcleo.

## 7. Seguridad, privacidad y límites (§14, §20, §21)

- **Aislamiento:**
  - Cada lectura se resuelve por `userId` de sesión.
  - Las vistas del entrenador usan `requireCoach` + `requireClientOf` (consentimiento `training`); las del gimnasio,
    `gymContext` + `program.edit` + consentimiento.
  - La gerencia nunca ve memoria ni conversación. No se usa `member.read` para nada del cerebro.
- **Inyección de instrucciones:**
  - El modelo nunca recibe permisos. Las acciones salen sólo del catálogo y se validan.
  - El texto importado o de terceros va delimitado como dato.
  - Hay pruebas con rutinas que dicen «ignorá las reglas».
- **Salud:**
  - Sin diagnósticos.
  - Molestia: detener y consultar al entrenador. Síntomas de alarma: atención médica.
  - El motivo «molestia» de una sustitución se trata como dato de salud.
- **Menores:** sin cuerpo, peso ni alimentación en el chat; sin push de coaching; sin estimaciones de adultos.
- **IA:** el contexto mínimo no incluye emails, nombres de terceros, fotos, notas privadas de otros ni datos de salud sin
  consentimiento.

## 8. Evidencia (§20)

Resumen en `ac3-auditoria/evidencia.md`. Lo que aplican las reglas del cerebro:
- Subir sólo con 1–2 repeticiones por encima del rango en series comparables y sin RIR bajo, alineado con ACSM 2009 (2–10 %
  de carga).
- Tratar el RIR como un indicio con error, mayor en series largas.
- Fallo y no fallo dan ganancias parecidas: no empujar al fallo.
- Retomar con prudencia tras pausas largas (sostener a los 14 días y reducir a los 28, como ya hace `load-safety`), sin
  diagnosticar desentrenamiento.

## 9. Pruebas (§25)

- Los 70 casos del máster se cubren en el dominio, en integración y en E2E.
- La matriz caso → prueba está en `docs/adaptive/AC3_PRUEBAS.md`.
- Las evaluaciones del razonamiento se hacen con invariantes y resultados esperados: exactitud numérica, fidelidad al
  programa, permisos, no alucinación, incertidumbre, preferencias y no invasividad. No se le pregunta a otro modelo si
  «suena bien».
- Las pruebas que podrían llamar a OpenAI usan un doble: sin clave, ninguna prueba gasta.

## 10. Estado

Se completa al cerrar el bloque: qué quedó activo, qué quedó con interruptor y qué quedó pendiente, con evidencia.
