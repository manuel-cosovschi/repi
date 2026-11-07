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
| 10 | Serie corregida o anulada | dominio + servidor | `brain/session.test.ts::session · cierre › caso 10 · series anuladas, aproximaciones y etapas no cuentan ni hacen récord` · `brain/memory.test.ts › cerrar la sesión invalida… anular la sesión invalida todo…` · `brain-review.test.ts › las series anuladas no cuentan ni hacen récord; la primera vez no es marca (casos 10, 41)` |
| 11 | Ejercicio sustituido | dominio + servidor | `brain/session.test.ts › caso 11 · ejercicio sustituido: aparece como adaptación…` · `brain/actions.test.ts › reemplazo válido sólo con una alternativa ofrecida… (casos 11–12)` · `brain-chat.test.ts::multi-turno: máquina ocupada (casos 12, 11, 23) › «ocupada» → ¿te referís…? → sí → la aprobada por el coach → sí → reemplazo sólo por hoy con el resultado real; el reintento no repite` |
| 12 | Máquina ocupada | dominio + servidor | `brain/session.test.ts::session · reemplazos › caso 12 · máquina ocupada: primero lo aprobado por el profe…` · `brain/answers.test.ts › caso 12 · conversación de varios turnos…` · `brain/intents.test.ts::intents · tabla` (filas «La máquina está ocupada», «me ganaron la máquina») · `brain-chat.test.ts::multi-turno: máquina ocupada (casos 12, 11, 23) › «ocupada» → ¿te referís…? → sí → la aprobada por el coach → sí → reemplazo sólo por hoy con el resultado real; el reintento no repite` |
| 13 | Falta de equipamiento | dominio | `brain/session.test.ts › caso 13 · falta de equipamiento y preferencias…` · `brain/intents.test.ts::intents · tabla` (fila «no tengo mancuernas») |
| 14 | Poco tiempo | dominio + servidor | `brain/session.test.ts::session · poco tiempo (caso 14)` (4 pruebas) · `brain/answers.test.ts › caso 14 · poco tiempo…` · `brain/actions.test.ts › sesión corta: sólo pendientes sin registro… (caso 14)` · `brain-actions.test.ts::poco tiempo (caso 14) › propone omitir sólo pendientes sin registro, se aplica sólo hoy al confirmar y nunca toca lo registrado ni el programa` |
| 15 | Baja energía | dominio | `brain/answers.test.ts › caso 15 · baja energía: mantener cargas, sin diagnóstico` · `brain/relevance.test.ts › rutina importada incompleta, cierre de sesión y poca energía` |
| 16 | Regreso después de varias semanas | dominio | `brain/session.test.ts › caso 16 · regreso después de varias semanas: retoma con menos carga y lo explica` |
| 17 | Serie con carga indicada por el entrenador | dominio | `brain/session.test.ts › caso 17 · carga indicada por el profe: manda el plan` · `› caso 17 · la siguiente carga es del profe: no la toca y lo dice` |
| 18 | Drop set de varias etapas | dominio | `brain/session.test.ts › caso 18 · drop set de varias etapas…` · `› rest-pause y cluster: mismas reglas de etapa` |
| 19 | Top set y back-off | dominio | `brain/session.test.ts › caso 19 · top set y back-off: el top set exigente no arrastra la carga del back-off` |
| 20 | EMOM, AMRAP y circuitos | dominio | `brain/session.test.ts › caso 20 · AMRAP…` · `› caso 20 · AMRAP por tiempo (rondas) y serie por tiempo` · `› caso 20 · EMOM y circuitos: sin descanso extra` |
| 21 | Objetivos que se actualizan después de cada serie | dominio | `brain/session.test.ts › caso 21 · más exigente de lo previsto…` · `› caso 21 · con margen: no sube a mitad de sesión` |
| 22 | Sesión offline y reconexión | pendiente: servidor/E2E | (el dominio es puro y no depende de red; falta la prueba de la cola offline) |
| 23 | Reintento duplicado de una acción | dominio + servidor | `brain/actions.test.ts::actions · clave idempotente (caso 23)` · `brain-chat.test.ts::multi-turno: máquina ocupada (casos 12, 11, 23) › «ocupada» → ¿te referís…? → sí → la aprobada por el coach → sí → reemplazo sólo por hoy con el resultado real; el reintento no repite` · `brain-actions.test.ts::programa del entrenador (casos 36, 37, 69) › pedir cambiar cargas: REPI no cambia el programa; sólo deja una propuesta revisable para el entrenador` |
| 24 | Carga anterior incompatible con la serie actual | dominio | `brain/session.test.ts › caso 24 · carga anterior incompatible (otro rango)…` · `intelligence.test.ts::AC3 · pirámides…` (7 pruebas, incluida la regresión del defecto #1) |

## B. Conversación y memoria

| # | Caso | Estado | Prueba |
| --- | --- | --- | --- |
| 25 | Preguntar por la última marca | dominio + servidor | `brain/answers.test.ts › caso 25 · última marca con fecha, evidencia y acción…` · `brain/intents.test.ts::intents · tabla` (filas de `last_mark`) · `brain-chat.test.ts::respuestas con datos (casos 25–28, 38) › última marca con fecha, evidencia y acción de historial (caso 25)` |
| 26 | Preguntar por una tendencia | dominio + servidor | `brain/answers.test.ts › caso 26 · tendencia con fechas concretas…` · `brain/intents.test.ts::intents · tabla` (filas de `trend`) · `brain-chat.test.ts › tendencia con fechas, seguimiento sin repetir el ejercicio y continuidad al cambiar de sección (casos 26, 27, 28)` |
| 27 | Hacer una pregunta de seguimiento | dominio + servidor | `brain/intents.test.ts › la respuesta corta pesa más cuando REPI acaba de preguntar (seguimiento, caso 27)` · `brain/answers.test.ts › caso 12 · conversación de varios turnos…` · `brain-chat.test.ts › tendencia con fechas, seguimiento sin repetir el ejercicio y continuidad al cambiar de sección (casos 26, 27, 28)` · `brain-chat.test.ts::multi-turno: máquina ocupada (casos 12, 11, 23) › «ocupada» → ¿te referís…? → sí → la aprobada por el coach → sí → reemplazo sólo por hoy con el resultado real; el reintento no repite` |
| 28 | Cambiar de sección y continuar | servidor | `brain-chat.test.ts › tendencia con fechas, seguimiento sin repetir el ejercicio y continuidad al cambiar de sección (casos 26, 27, 28)` |
| 29 | Rechazar una recomendación | dominio + servidor | `brain/memory.test.ts › un rechazo queda como decisión, distinto por tipo de acción (caso 29)` · `brain-chat.test.ts › rechazar la recomendación (caso 29): «no» cancela lo propuesto y queda como decisión; no cambia nada` |
| 30 | Modificar una preferencia | dominio + servidor | `brain/memory.test.ts › modificar una preferencia: la más reciente gana…` · `brain/memory.test.ts::memory · preferencias declaradas (caso 30)` · `brain/answers.test.ts › caso 30 · preferencia: propone recordarla…` · `brain-chat.test.ts::preferencias y memoria (casos 30, 31) › se proponen, se guardan sólo al confirmar, se modifican (la nueva reemplaza) y se borran` |
| 31 | Eliminar una preferencia | dominio + servidor | `brain/answers.test.ts › caso 31 · borrar una preferencia…` · `brain/memory.test.ts › cerrar la sesión invalida… (memory_deleted)` · `brain-chat.test.ts::preferencias y memoria (casos 30, 31) › se proponen, se guardan sólo al confirmar, se modifican (la nueva reemplaza) y se borran` |
| 32 | Cambiar la rutina | dominio (parcial) | `brain/memory.test.ts › cambio de versión del programa… (casos 32, 50)`. Pendiente: servidor/E2E |
| 33 | Importar una rutina nueva | dominio + servidor | `brain/answers.test.ts › casos 7–8, 33 · rutina importada…` · `brain-chat.test.ts › instrucciones dentro de una rutina importada son dato: la explicación no ejecuta nada (caso 39)` · `brain-context.test.ts::buildContext con datos reales › arma perfil, relación, programa, sesión abierta, historial, check-in, molestias, cuerpo, procedencia y memoria; es barato` |
| 34 | Preguntar por una recomendación antigua | dominio (parcial) | `brain/memory.test.ts › temporal vence… decisiones y resultados a 180 días…`. Pendiente: servidor (respuesta desde `brain_memory`) |
| 35 | Eliminar datos que sustentaban una recomendación | dominio (parcial) | `brain/memory.test.ts › cerrar la sesión… anular la sesión invalida todo lo que se apoyaba en ella (caso 35)`. Pendiente: servidor |
| 36 | Intentar modificar un programa sin autorización | dominio + servidor | `brain/answers.test.ts › casos 36–37 · cambiar la rutina del profe…` · `brain/actions.test.ts › campos desconocidos, acciones fuera del catálogo… (casos 36, 64)` · `brain-actions.test.ts::programa del entrenador (casos 36, 37, 69) › pedir cambiar cargas: REPI no cambia el programa; sólo deja una propuesta revisable para el entrenador` · `brain-actions.test.ts › acciones fuera del catálogo o con números fuera de rango se rechazan antes de registrar nada` |
| 37 | Pedir algo que requiere aprobación del entrenador | dominio + servidor | `brain/answers.test.ts › casos 36–37 …` · `brain/actions.test.ts::actions · autonomía y bloqueos` (fila `propose_to_coach`) · `brain-actions.test.ts::programa del entrenador (casos 36, 37, 69) › pedir cambiar cargas: REPI no cambia el programa; sólo deja una propuesta revisable para el entrenador` |
| 38 | Preguntar por información inexistente | dominio + servidor | `brain/answers.test.ts › caso 38 · información inexistente: lo dice sin inventar…` · `brain-chat.test.ts › información inexistente: lo dice sin inventar (caso 38)` |
| 39 | Instrucciones maliciosas dentro de una rutina | dominio + servidor | `brain/context.test.ts › caso 39 · texto de una rutina importada con instrucciones: delimitado como dato y marcado` · `brain/answers.test.ts › caso 39 · instrucciones maliciosas en la rutina importada…` · `brain/actions.test.ts › preferencias: sin salud ni datos sensibles; texto limpio (caso 39…)` · `brain-chat.test.ts › instrucciones dentro de una rutina importada son dato: la explicación no ejecuta nada (caso 39)` · `brain-chat-ai.test.ts::chat con IA: respuesta válida › lo libre va a la IA con contexto mínimo y todo como dato delimitado; la acción usa códigos del contexto y se valida` |
| 40 | Intentar acceder a datos de otra persona | dominio + servidor | `brain/intents.test.ts › «%s» → unknown marcado como datos de otra persona` · `brain/actions.test.ts › campos desconocidos… (ids que no son de la persona)` · `brain-chat.test.ts › nadie lee ni usa lo de otra persona: hilo, memoria, sesión, acciones y mensajes (casos 40, 63)` · `brain-context.test.ts › la referencia de la pantalla se valida: lo ajeno o inexistente es 404, el formato inválido 400 (casos 40, 63)` |

## C. Proactividad

| # | Caso | Estado | Prueba |
| --- | --- | --- | --- |
| 41 | Logro auténtico | dominio + servidor | `brain/relevance.test.ts › caso 41 · logro auténtico: objetivo semanal y marca personal` · `brain/session.test.ts › caso 41 · marca auténtica por carga, por repeticiones con una carga y por 1RM estimado…` · `brain-proactive.test.ts::logros y tendencias (casos 41–45) › caso 41 · logro auténtico: marca personal con historia previa…` · `brain-proactive.test.ts › caso 41 · objetivo semanal cumplido con las sesiones registradas desde el lunes` · `brain-review.test.ts::cierre de la sesión › previstas contra hechas, comparación con la anterior, marca auténtica, omitido por tiempo y parcial` · `brain-review.test.ts › las series anuladas no cuentan ni hacen récord; la primera vez no es marca (casos 10, 41)` |
| 42 | Tendencia positiva | dominio + servidor | `brain/relevance.test.ts › caso 42 · tendencia positiva con evidencia…` · `brain-proactive.test.ts › caso 42 · tendencia positiva con evidencia (fechas de las sesiones comparadas)` |
| 43 | Datos insuficientes | dominio + servidor | `brain/relevance.test.ts › caso 43 · evidencia insuficiente o sin novedad: no se emite` · `brain/answers.test.ts › caso 43 · datos insuficientes: la frase del máster…` · `brain-proactive.test.ts › caso 43 · datos insuficientes: la tendencia sin evidencia se calla (queda registrada) y no hay tarjeta` |
| 44 | Posible estancamiento | dominio + servidor | `brain/relevance.test.ts › caso 42 … caso 44 · posible estancamiento con propuesta…` · `brain-proactive.test.ts › caso 44 · posible estancamiento con propuesta prudente (sin subir sola la carga)` |
| 45 | Baja adherencia sin asumir faltas presenciales | dominio + servidor | `brain/relevance.test.ts › caso 45 · baja adherencia sin asumir faltas: «no registraste», nunca «faltaste»` · `brain-proactive.test.ts › caso 45 · baja adherencia: «no registrás entrenamientos», nunca «faltaste»; se cancela al volver a registrar` · `brain-proactive.test.ts › resumen semanal sólo los lunes y sólo con la categoría encendida` |
| 46 | Usuario con mensajes desactivados | dominio + servidor | `brain/relevance.test.ts › caso 46 · mensajes desactivados…` · `› categorías apagadas…` · `› «no mostrar algo parecido»…` · `brain-proactive.test.ts::preferencias, prioridad y repetición (casos 46, 48, 49, 51) › caso 46 · asistencia proactiva apagada: no se evalúa, no hay tarjeta y el cron la saltea` · `brain-push.test.ts › categoría apagada o push de REPI apagado mientras esperaba: no sale` |
| 47 | Horario de silencio | dominio + servidor | `brain/quiet.test.ts::quiet · horario de silencio (caso 47)` · `brain/relevance.test.ts › caso 47 · horario de silencio (22–08 en hora AR)…` · `brain-push.test.ts::reglas al enviar el push de REPI › caso 47 · horario de silencio: la tarjeta sale igual, el push se posterga hasta el fin del silencio sin gastar intentos` |
| 48 | Múltiples eventos simultáneos | dominio + servidor | `brain/relevance.test.ts::relevance · prioridad y resumen (caso 48)` · `› buildCandidates + decide…` · `brain-proactive.test.ts › caso 48 · varios eventos a la vez: sale lo más importante (tope diario) y el resto queda callado con su motivo` |
| 49 | Repetición del cron | dominio + servidor | `brain/relevance.test.ts › la misma clave no se repite: ni dentro del lote ni si ya se mostró…` · `› caso 45 …` (una tarjeta por pausa) · `brain-proactive.test.ts › caso 49 · el cron dos veces seguidas no duplica avisos ni push; fuera de franja no corre` |
| 50 | Cambio de rutina que vuelve obsoleto un aviso | dominio + servidor | `brain/relevance.test.ts › caso 50 · un cambio de rutina vuelve obsoleto el aviso…` · `brain-proactive.test.ts::programa del entrenador (casos 50 y 54) › caso 54 · el coach actualiza el programa: una tarjeta por versión · caso 50 · otra versión vuelve obsoleta la anterior` |
| 51 | Usuario que ya leyó la notificación | dominio + servidor | `brain/relevance.test.ts › la misma clave no se repite… (estados shown/accepted/dismissed)` · `brain-proactive.test.ts › caso 51 · lo ya descartado no vuelve a aparecer ni se vuelve a avisar` · `brain-push.test.ts › caso 51 · ya visto en la app (abrió el centro de notificaciones): no se empuja` |
| 52 | Usuario con dos roles | servidor | `brain-coach.test.ts::señales para el entrenador privado › caso 52 · persona con dos roles (entrenador y alumno): en Inicio ve sólo sus propios avisos, nunca los de sus alumnos` |
| 53 | Relaciones en distintas organizaciones | dominio + servidor | `brain/context.test.ts › sin nombres de terceros, emails ni fechas exactas…` (el contexto para IA no lleva la organización) · `brain-coach.test.ts › dificultad creciente, rechazos, propuestas y pedidos: sólo cantidades de ESTA relación y nada privado (casos 52 y 53)` |
| 54 | Coach que actualiza el programa | dominio + servidor | `brain/relevance.test.ts › caso 54 · el coach actualiza el programa: una tarjeta por versión` · `brain-proactive.test.ts › caso 54 · el coach actualiza el programa… caso 50 …` |
| 55 | Dato sensible con consentimiento revocado | dominio + servidor | `brain/context.test.ts › caso 55 · salud sólo con consentimiento…` · `brain-coach.test.ts › caso 55 · permiso de entrenamientos revocado: 403 y nada nuevo · caso 61 · entrenador sin relación: 404` |

## D. Seguridad

| # | Caso | Estado | Prueba |
| --- | --- | --- | --- |
| 56 | Molestia durante el ejercicio | dominio + servidor | `brain/safety.test.ts::safety · molestia y lesión (casos 56–57)` · `brain/session.test.ts › molestia: prioridad máxima… (caso 56)` · `brain/answers.test.ts › caso 56 · molestia en un ejercicio…` · `brain-actions.test.ts::molestia y alarma (casos 56, 58) › molestia: respuesta de seguridad, se registra sólo con confirmación explícita y con la intensidad que elige la persona` |
| 57 | Lesión reportada | dominio | `brain/safety.test.ts::safety · molestia y lesión (casos 56–57)` (filas «me lesioné la rodilla», «me desgarré», «contractura») |
| 58 | Señal de alarma de salud | dominio + servidor | `brain/safety.test.ts::safety · señales de alarma (caso 58)` · `› la respuesta de alarma pide detener y buscar atención médica…` · `brain-actions.test.ts › alarma: texto fijo de seguridad, sin acciones ni registros` · `brain-chat-ai.test.ts › la seguridad y lo que resuelven las reglas nunca pasan por la IA` |
| 59 | Persona menor de edad | dominio + servidor | `brain/safety.test.ts::safety · política por edad (casos 59–60)` · `brain/relevance.test.ts::relevance · menores…` · `brain/answers.test.ts › objetivo de peso…` · `› casos 59–60 · el despachador aplica la edad…` · `brain-push.test.ts › caso 59 · menores (y edad sin confirmar) nunca reciben push de coaching, ni al encolar ni al enviar` · `brain-push.test.ts::opt-in del socio y centro de notificaciones › el socio adulto registra su dispositivo para REPI en un paso…` · `brain-chat.test.ts › menores y edad desconocida: sin peso corporal ni alimentación por chat (casos 59, 60)` · `brain-context.test.ts › menor de edad: sin cuerpo (aunque haya registros) y sin objetivos de peso; edad desconocida lo dice (casos 59, 60)` |
| 60 | Persona con edad desconocida | dominio + servidor | los mismos que el 59 (edad `unknown` se trata como no adulta; el caso 59 del servidor recorre menor y edad desconocida) · `brain-chat.test.ts › menores y edad desconocida: sin peso corporal ni alimentación por chat (casos 59, 60)` · `brain-context.test.ts › menor de edad: sin cuerpo (aunque haya registros) y sin objetivos de peso; edad desconocida lo dice (casos 59, 60)` |
| 61 | Entrenador sin permiso | servidor | `brain-coach.test.ts › caso 55 … caso 61 · entrenador sin relación: 404` |
| 62 | Gerente intentando leer memoria individual | servidor | `brain-coach.test.ts::equipo de sala y gerencia (caso 62) › sala y coordinación de la sede, con consentimiento; gerencia y dueño 403; otra sede 404; sin consentimiento 403` |
| 63 | Usuario intentando leer otra organización | servidor | `brain-coach.test.ts › dificultad creciente… (casos 52 y 53)` (el entrenador de una organización no lee la relación de otra: 404) · `brain-chat.test.ts › nadie lee ni usa lo de otra persona: hilo, memoria, sesión, acciones y mensajes (casos 40, 63)` · `brain-context.test.ts › la referencia de la pantalla se valida: lo ajeno o inexistente es 404, el formato inválido 400 (casos 40, 63)` · `brain-review.test.ts › abierta: parcial y sin memoria; anulada: 409; de otra persona: 404` |
| 64 | Prompt injection | dominio + servidor | `brain/intents.test.ts::intents · inyección y datos ajenos (casos 36, 40, 64)` · `brain/answers.test.ts › caso 64 · prompt injection: se niega sin acciones` · `brain/context.test.ts › caso 39 …` · `brain-chat.test.ts::seguridad, inyección y aislamiento (casos 39, 40, 59, 60, 63, 64) › una orden de cambiar las reglas en el mensaje se rechaza sin acciones y sin IA (caso 64)` · `brain-chat-ai.test.ts › acciones del modelo fuera de lo permitido o con referencias inventadas se descartan; nada se ejecuta (caso 64)` |
| 65 | Respuesta inválida del modelo | dominio + servidor | `brain/actions.test.ts::actions · validación estricta` (lo que no cumple el esquema se rechaza) · `brain-chat-ai.test.ts › una salida que no cumple el esquema estricto → respuesta honesta por reglas (caso 65)` |
| 66 | Modelo no disponible | servidor | (las respuestas por reglas de `answers.ts` son el camino sin IA) · `brain-chat-ai.test.ts::chat con IA: no disponible, sin presupuesto o sin cuota (casos 66, 67) › el modelo falla (500) → respuesta por reglas, honesta, y se registra el error sin contenido` |
| 67 | Agotamiento del presupuesto de IA | servidor | `brain-chat-ai.test.ts › presupuesto global agotado → no se llama al modelo y responde por reglas` · `brain-chat-ai.test.ts › cuota diaria de la persona agotada → lo dice y sigue por reglas` |
| 68 | Latencia excesiva | pendiente: servidor/E2E | — |
| 69 | Recomendación numérica fuera de límites | dominio + servidor | `brain/actions.test.ts › números fuera de límites se rechazan (caso 69)` · `brain/intents.test.ts::intents · tabla` (fila «me quedan 5000 minutos») · `brain/answers.test.ts › caso 14 …` (minutos fuera de rango) · `brain-actions.test.ts › minutos fuera de rango: pide un número válido y no propone nada (caso 69)` · `brain-actions.test.ts › acciones fuera del catálogo o con números fuera de rango se rechazan antes de registrar nada` · `brain-chat-ai.test.ts › kilos que no están en los datos → no se usa la respuesta (casos 69 y «no inventar números»)` |
| 70 | Confirmación de acción que falla en el servidor | servidor | (el dominio nunca afirma un cambio: `brain/answers.test.ts › caso 12 …` verifica que no diga «Listo») · `brain-actions.test.ts::protocolo: revalidación, autonomía, fallas y cancelación (casos 23, 70) › si el servidor falla al ejecutar, la respuesta dice que falló y no cambió nada (caso 70)` · `brain-actions.test.ts › al confirmar se vuelve a validar: si el ejercicio ya tiene series, no se reemplaza` |

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

## Servidor del motor proactivo, push, entrenador y REPI Admin (C2)

Pruebas de integración contra la base descartable `repi_test` (nunca contra datos reales) y sin IA:
`brain-proactive.test.ts` (12), `brain-push.test.ts` (7), `brain-coach.test.ts` (4), `brain-admin.test.ts` (4) y
`brain-coach-routes.test.ts` (4, sin base: rutas sin sesión → 401, id de la sesión, validación). Las métricas de REPI Admin
(máster §24) están en `brain-admin.test.ts::métricas agregadas › cuenta avisos, acciones, preguntas, opinión, IA (p50/p95),
duplicados y estado, sin ids de personas ni textos` y los límites en `::límites de la IA (ai_policy)`. API: `AC3_API_PROACTIVO_COACH_ADMIN.md`.

## Servidor del chat, acciones, contexto y cierre (C1)

Pruebas de integración contra la base descartable `repi_test` (nunca contra datos reales), con servicios reales para crear
personas, organizaciones, programas y sesiones (`tests/brain-chat.world.ts`). Ninguna llama a OpenAI: sin clave van por reglas
y las del camino con IA usan un doble de `fetch`. `brain-chat.test.ts` (10), `brain-chat-ai.test.ts` (8),
`brain-actions.test.ts` (11), `brain-context.test.ts` (4), `brain-review.test.ts` (3) y `brain-chat-routes.test.ts` (14: cada
ruta de `/api/me/brain/**` sin sesión → 401, escritura de otro sitio → 403, conexión con los servicios). Latencia medida en
local (rama `claude/adaptive-coaching-3`): `loadContext` 14–37 ms; un mensaje resuelto por reglas, 29–63 ms de punta a punta.
API: `AC3_API_SOCIO.md`.
