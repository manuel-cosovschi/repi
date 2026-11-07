# REPI — Adaptive Coaching 3.0 · Matriz de pruebas (D209)

Casos: §25 de `docs/adaptive/AC3_MASTER_PROMPT.md`. Contrato: `docs/adaptive/ADAPTIVE_COACHING_3.md` §9.

Este documento lista, para cada uno de los 70 casos, qué prueba lo cubre hoy. Esta primera versión cubre la **capa de dominio
puro** (`packages/domain/src/brain/*.test.ts` y la corrección de pirámides en `packages/domain/src/intelligence.test.ts`).
Lo que depende de la base, los permisos, la IA o la interfaz figura como **pendiente: servidor/E2E**. Cuando un caso tiene
una parte de dominio y otra de servidor, se marca «dominio (parcial)» y se aclara qué falta.

Cómo correrlas: `pnpm --filter @repi/domain test` (sin base de datos y sin IA: ninguna prueba gasta).

Referencias: `archivo::describe › prueba`. En las pruebas con tabla (`it.each`), el nombre que se cita es el del bloque y las
filas están en el mismo archivo.

## A. Entrenamiento

| # | Caso | Estado | Prueba |
| --- | --- | --- | --- |
| 1 | Alumno nuevo sin historial | dominio | `brain/session.test.ts::session · briefing › caso 1 · alumno nuevo sin historial: lo dice y no inventa kilos` · `intelligence.test.ts::A › sin historial: no inventa números y lo dice` |
| 2 | Alumno con una sesión | dominio | `brain/session.test.ts::session · briefing › caso 2 · con una sesión: compara con esa y sube cuando completó el rango` |
| 3 | Alumno avanzado con cientos de sesiones | dominio | `brain/session.test.ts::session · briefing › caso 3 · alumno avanzado con cientos de sesiones: decide con la última comparable` |
| 4 | Programa propio | dominio (parcial) | `brain/actions.test.ts::actions · autonomía › casos 4–6 · programa propio, del entrenador o institucional…` · `brain/answers.test.ts › casos 36–37 · cambiar la rutina del profe…` (rama «Tu rutina es tuya»). Pendiente: servidor/E2E (contexto real) |
| 5 | Programa del entrenador | dominio (parcial) | `brain/actions.test.ts › casos 4–6 …` · `brain/answers.test.ts › casos 36–37 …`. Pendiente: servidor/E2E |
| 6 | Programa institucional del gimnasio | dominio (parcial) | `brain/actions.test.ts › casos 4–6 …` (dueño `gym`). Pendiente: servidor/E2E |
| 7 | Rutina importada con datos completos | dominio | `brain/answers.test.ts::answers · métodos, cuerpo y rutina importada › casos 7–8, 33 · rutina importada…` · `brain/session.test.ts › caso 7 · referencia importada: lo advierte como orientación` |
| 8 | Rutina importada con datos desconocidos | dominio | `brain/answers.test.ts › casos 7–8, 33 · rutina importada…` · `brain/relevance.test.ts › rutina importada incompleta, cierre de sesión y poca energía` |
| 9 | Cambio de programa durante una sesión | dominio (parcial) | `brain/memory.test.ts › cambio de versión del programa: caen lo temporal y las decisiones…` · `brain/relevance.test.ts › caso 50 · un cambio de rutina vuelve obsoleto…`. Pendiente: servidor/E2E (sesión abierta + versión nueva) |
| 10 | Serie corregida o anulada | dominio (parcial) | `brain/session.test.ts::session · cierre › caso 10 · series anuladas, aproximaciones y etapas no cuentan ni hacen récord` · `brain/memory.test.ts › cerrar la sesión invalida… anular la sesión invalida todo…`. Pendiente: servidor (filtro SQL de anuladas) |
| 11 | Ejercicio sustituido | dominio | `brain/session.test.ts › caso 11 · ejercicio sustituido: aparece como adaptación…` · `brain/actions.test.ts › reemplazo válido sólo con una alternativa ofrecida… (casos 11–12)` |
| 12 | Máquina ocupada | dominio | `brain/session.test.ts::session · reemplazos › caso 12 · máquina ocupada: primero lo aprobado por el profe…` · `brain/answers.test.ts › caso 12 · conversación de varios turnos…` · `brain/intents.test.ts::intents · tabla` (filas «La máquina está ocupada», «me ganaron la máquina») |
| 13 | Falta de equipamiento | dominio | `brain/session.test.ts › caso 13 · falta de equipamiento y preferencias…` · `brain/intents.test.ts::intents · tabla` (fila «no tengo mancuernas») |
| 14 | Poco tiempo | dominio | `brain/session.test.ts::session · poco tiempo (caso 14)` (4 pruebas) · `brain/answers.test.ts › caso 14 · poco tiempo…` · `brain/actions.test.ts › sesión corta: sólo pendientes sin registro… (caso 14)` |
| 15 | Baja energía | dominio | `brain/answers.test.ts › caso 15 · baja energía: mantener cargas, sin diagnóstico` · `brain/relevance.test.ts › rutina importada incompleta, cierre de sesión y poca energía` |
| 16 | Regreso después de varias semanas | dominio | `brain/session.test.ts › caso 16 · regreso después de varias semanas: retoma con menos carga y lo explica` |
| 17 | Serie con carga indicada por el entrenador | dominio | `brain/session.test.ts › caso 17 · carga indicada por el profe: manda el plan` · `› caso 17 · la siguiente carga es del profe: no la toca y lo dice` |
| 18 | Drop set de varias etapas | dominio | `brain/session.test.ts › caso 18 · drop set de varias etapas…` · `› rest-pause y cluster: mismas reglas de etapa` |
| 19 | Top set y back-off | dominio | `brain/session.test.ts › caso 19 · top set y back-off: el top set exigente no arrastra la carga del back-off` |
| 20 | EMOM, AMRAP y circuitos | dominio | `brain/session.test.ts › caso 20 · AMRAP…` · `› caso 20 · AMRAP por tiempo (rondas) y serie por tiempo` · `› caso 20 · EMOM y circuitos: sin descanso extra` |
| 21 | Objetivos que se actualizan después de cada serie | dominio | `brain/session.test.ts › caso 21 · más exigente de lo previsto…` · `› caso 21 · con margen: no sube a mitad de sesión` |
| 22 | Sesión offline y reconexión | pendiente: servidor/E2E | (el dominio es puro y no depende de red; falta la prueba de la cola offline) |
| 23 | Reintento duplicado de una acción | dominio (parcial) | `brain/actions.test.ts::actions · clave idempotente (caso 23)`. Pendiente: servidor (índice único `brain_action`) |
| 24 | Carga anterior incompatible con la serie actual | dominio | `brain/session.test.ts › caso 24 · carga anterior incompatible (otro rango)…` · `intelligence.test.ts::AC3 · pirámides…` (7 pruebas, incluida la regresión del defecto #1) |

## B. Conversación y memoria

| # | Caso | Estado | Prueba |
| --- | --- | --- | --- |
| 25 | Preguntar por la última marca | dominio | `brain/answers.test.ts › caso 25 · última marca con fecha, evidencia y acción…` · `brain/intents.test.ts::intents · tabla` (filas de `last_mark`) |
| 26 | Preguntar por una tendencia | dominio | `brain/answers.test.ts › caso 26 · tendencia con fechas concretas…` · `brain/intents.test.ts::intents · tabla` (filas de `trend`) |
| 27 | Hacer una pregunta de seguimiento | dominio (parcial) | `brain/intents.test.ts › la respuesta corta pesa más cuando REPI acaba de preguntar (seguimiento, caso 27)` · `brain/answers.test.ts › caso 12 · conversación de varios turnos…`. Pendiente: servidor (hilo y estado del turno) |
| 28 | Cambiar de sección y continuar | pendiente: servidor/E2E | — |
| 29 | Rechazar una recomendación | dominio (parcial) | `brain/memory.test.ts › un rechazo queda como decisión, distinto por tipo de acción (caso 29)`. Pendiente: servidor |
| 30 | Modificar una preferencia | dominio | `brain/memory.test.ts › modificar una preferencia: la más reciente gana…` · `brain/memory.test.ts::memory · preferencias declaradas (caso 30)` · `brain/answers.test.ts › caso 30 · preferencia: propone recordarla…` |
| 31 | Eliminar una preferencia | dominio | `brain/answers.test.ts › caso 31 · borrar una preferencia…` · `brain/memory.test.ts › cerrar la sesión invalida… (memory_deleted)` |
| 32 | Cambiar la rutina | dominio (parcial) | `brain/memory.test.ts › cambio de versión del programa… (casos 32, 50)`. Pendiente: servidor/E2E |
| 33 | Importar una rutina nueva | dominio (parcial) | `brain/answers.test.ts › casos 7–8, 33 · rutina importada…`. Pendiente: servidor (lectura de `own_routine.origin`) |
| 34 | Preguntar por una recomendación antigua | dominio (parcial) | `brain/memory.test.ts › temporal vence… decisiones y resultados a 180 días…`. Pendiente: servidor (respuesta desde `brain_memory`) |
| 35 | Eliminar datos que sustentaban una recomendación | dominio (parcial) | `brain/memory.test.ts › cerrar la sesión… anular la sesión invalida todo lo que se apoyaba en ella (caso 35)`. Pendiente: servidor |
| 36 | Intentar modificar un programa sin autorización | dominio (parcial) | `brain/answers.test.ts › casos 36–37 · cambiar la rutina del profe…` · `brain/actions.test.ts › campos desconocidos, acciones fuera del catálogo… (casos 36, 64)`. Pendiente: servidor (permisos) |
| 37 | Pedir algo que requiere aprobación del entrenador | dominio | `brain/answers.test.ts › casos 36–37 …` · `brain/actions.test.ts::actions · autonomía y bloqueos` (fila `propose_to_coach`) |
| 38 | Preguntar por información inexistente | dominio | `brain/answers.test.ts › caso 38 · información inexistente: lo dice sin inventar…` |
| 39 | Instrucciones maliciosas dentro de una rutina | dominio | `brain/context.test.ts › caso 39 · texto de una rutina importada con instrucciones: delimitado como dato y marcado` · `brain/answers.test.ts › caso 39 · instrucciones maliciosas en la rutina importada…` · `brain/actions.test.ts › preferencias: sin salud ni datos sensibles; texto limpio (caso 39…)` |
| 40 | Intentar acceder a datos de otra persona | dominio (parcial) | `brain/intents.test.ts › «%s» → unknown marcado como datos de otra persona` · `brain/actions.test.ts › campos desconocidos… (ids que no son de la persona)`. Pendiente: servidor (aislamiento por `userId`) |

## C. Proactividad

| # | Caso | Estado | Prueba |
| --- | --- | --- | --- |
| 41 | Logro auténtico | dominio | `brain/relevance.test.ts › caso 41 · logro auténtico: objetivo semanal y marca personal` · `brain/session.test.ts › caso 41 · marca auténtica por carga, por repeticiones con una carga y por 1RM estimado…` |
| 42 | Tendencia positiva | dominio | `brain/relevance.test.ts › caso 42 · tendencia positiva con evidencia…` |
| 43 | Datos insuficientes | dominio | `brain/relevance.test.ts › caso 43 · evidencia insuficiente o sin novedad: no se emite` · `brain/answers.test.ts › caso 43 · datos insuficientes: la frase del máster…` |
| 44 | Posible estancamiento | dominio | `brain/relevance.test.ts › caso 42 … caso 44 · posible estancamiento con propuesta…` |
| 45 | Baja adherencia sin asumir faltas presenciales | dominio | `brain/relevance.test.ts › caso 45 · baja adherencia sin asumir faltas: «no registraste», nunca «faltaste»` |
| 46 | Usuario con mensajes desactivados | dominio | `brain/relevance.test.ts › caso 46 · mensajes desactivados…` · `› categorías apagadas…` · `› «no mostrar algo parecido»…` |
| 47 | Horario de silencio | dominio | `brain/quiet.test.ts::quiet · horario de silencio (caso 47)` · `brain/relevance.test.ts › caso 47 · horario de silencio (22–08 en hora AR)…` |
| 48 | Múltiples eventos simultáneos | dominio | `brain/relevance.test.ts::relevance · prioridad y resumen (caso 48)` · `› buildCandidates + decide…` |
| 49 | Repetición del cron | dominio (parcial) | `brain/relevance.test.ts › la misma clave no se repite: ni dentro del lote ni si ya se mostró…` · `› caso 45 …` (una tarjeta por pausa). Pendiente: servidor (índice único `brain_intervention`) |
| 50 | Cambio de rutina que vuelve obsoleto un aviso | dominio | `brain/relevance.test.ts › caso 50 · un cambio de rutina vuelve obsoleto el aviso…` |
| 51 | Usuario que ya leyó la notificación | dominio | `brain/relevance.test.ts › la misma clave no se repite… (estados shown/accepted/dismissed)` |
| 52 | Usuario con dos roles | pendiente: servidor/E2E | — |
| 53 | Relaciones en distintas organizaciones | dominio (parcial) | `brain/context.test.ts › sin nombres de terceros, emails ni fechas exactas…` (el contexto para IA no lleva la organización). Pendiente: servidor |
| 54 | Coach que actualiza el programa | dominio | `brain/relevance.test.ts › caso 54 · el coach actualiza el programa: una tarjeta por versión` |
| 55 | Dato sensible con consentimiento revocado | dominio (parcial) | `brain/context.test.ts › caso 55 · salud sólo con consentimiento…`. Pendiente: servidor (lectura del consentimiento vigente) |

## D. Seguridad

| # | Caso | Estado | Prueba |
| --- | --- | --- | --- |
| 56 | Molestia durante el ejercicio | dominio | `brain/safety.test.ts::safety · molestia y lesión (casos 56–57)` · `brain/session.test.ts › molestia: prioridad máxima… (caso 56)` · `brain/answers.test.ts › caso 56 · molestia en un ejercicio…` |
| 57 | Lesión reportada | dominio | `brain/safety.test.ts::safety · molestia y lesión (casos 56–57)` (filas «me lesioné la rodilla», «me desgarré», «contractura») |
| 58 | Señal de alarma de salud | dominio | `brain/safety.test.ts::safety · señales de alarma (caso 58)` · `› la respuesta de alarma pide detener y buscar atención médica…` |
| 59 | Persona menor de edad | dominio | `brain/safety.test.ts::safety · política por edad (casos 59–60)` · `brain/relevance.test.ts::relevance · menores…` · `brain/answers.test.ts › objetivo de peso…` · `› casos 59–60 · el despachador aplica la edad…` |
| 60 | Persona con edad desconocida | dominio | los mismos que el 59 (edad `unknown` se trata como no adulta) |
| 61 | Entrenador sin permiso | pendiente: servidor/E2E | — |
| 62 | Gerente intentando leer memoria individual | pendiente: servidor/E2E | — |
| 63 | Usuario intentando leer otra organización | pendiente: servidor/E2E | — |
| 64 | Prompt injection | dominio (parcial) | `brain/intents.test.ts::intents · inyección y datos ajenos (casos 36, 40, 64)` · `brain/answers.test.ts › caso 64 · prompt injection: se niega sin acciones` · `brain/context.test.ts › caso 39 …`. Pendiente: servidor (salida del modelo con texto malicioso) |
| 65 | Respuesta inválida del modelo | dominio (parcial) | `brain/actions.test.ts::actions · validación estricta` (lo que no cumple el esquema se rechaza). Pendiente: servidor (`gateway` + fallback) |
| 66 | Modelo no disponible | pendiente: servidor/E2E | (las respuestas por reglas de `answers.ts` son el camino sin IA) |
| 67 | Agotamiento del presupuesto de IA | pendiente: servidor/E2E | — |
| 68 | Latencia excesiva | pendiente: servidor/E2E | — |
| 69 | Recomendación numérica fuera de límites | dominio | `brain/actions.test.ts › números fuera de límites se rechazan (caso 69)` · `brain/intents.test.ts::intents · tabla` (fila «me quedan 5000 minutos») · `brain/answers.test.ts › caso 14 …` (minutos fuera de rango) |
| 70 | Confirmación de acción que falla en el servidor | pendiente: servidor/E2E | (el dominio nunca afirma un cambio: `brain/answers.test.ts › caso 12 …` verifica que no diga «Listo») |

## Evaluaciones del razonamiento (invariantes)

Además de los casos, las pruebas del dominio verifican invariantes sin preguntarle a otro modelo:

- **Exactitud numérica:** el briefing y el cierre usan los números de Training Intelligence y de los datos de entrada
  (`session.test.ts › el ejemplo del máster…`, ambos ejemplos del máster reproducidos textualmente).
- **Fidelidad al programa:** las cargas del profe nunca se reemplazan (`session.test.ts › caso 17 …`, `answers.test.ts › por qué ese peso…`).
- **No alucinación:** sin datos, se dice que faltan (`answers.test.ts › caso 38 …`, `session.test.ts › caso 1 …`, `context.test.ts › lo que falta se dice…`).
- **Incertidumbre:** tendencias sólo con evidencia (`relevance.test.ts › caso 42 … caso 44 … caso 43 …`).
- **Nunca sube a mitad de sesión:** `session.test.ts › caso 21 …`.
- **No invasividad:** tope diario, enfriamiento, silencio y «no intervenir» (`relevance.test.ts`).
- **Pirámides (defecto #1):** `intelligence.test.ts::AC3 · pirámides: cada fila compara con su par`.
