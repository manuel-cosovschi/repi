# Personalización y Progress Intelligence 2.0 (D217)

Máster del titular «REPI Personalization & Progress Intelligence 2.0» (12/11/2026). Este documento describe la auditoría, el
modelo, las reglas y cómo se verifica. La decisión resumida está en `docs/DECISIONS.md` (D217).

## 1. Auditoría (estado antes de este bloque)

- **Perfil:** `user_pref.wishes` (D139) guardaba objetivo, días, minutos, gustos y lo que evita. Se escribía entero desde Perfil
  y desde el pedido de programa (D206), que lo **pisaba** completo. No había experiencia, procedencia, versión ni estado.
- **Defecto conceptual confirmado:** `BrainContext.person.experience` era siempre `noFact(null)`; el nivel que la persona sí
  declaraba en el pedido de programa (`level`) nunca llegaba al perfil ni al cerebro.
- **Motores:** Training Intelligence (`intelligence.ts`) y la doble progresión (`progression.ts`) no recibían ningún dato del
  perfil; sólo «No vino el profe» y la rutina sin programa mandaban el objetivo a la IA.
- **Progreso:** `server/progress/exercises.ts` calculaba puntos por sesión (carga máxima, 1RM estimado, récords), pero la
  tendencia y la propuesta del cerebro (`trendsFor`) eran otro cálculo, sin mostrarse en Progreso. No había máximo real
  separado de la estimación, estimaciones por repeticiones, metas propias ni intervenciones.
- **Metas:** `client_goal` (D97) sólo para metas que crea el coach; el alumno las veía en sólo lectura.
- **Gráfico:** SVG propio sin zoom ni desplazamiento; puntos del mismo día superpuestos.

## 2. Perfil de entrenamiento canónico

Fuente única: `user_pref.wishes`, dominio `packages/domain/src/wishes.ts`, servidor `apps/web/src/server/settings/profile.ts`,
API `GET/POST /api/me/profile`. Sin migración (es jsonb y los campos nuevos son opcionales).

| Campo | Qué es | Notas |
|---|---|---|
| goal | Objetivo principal | Ganar músculo, fuerza, deporte, resistencia, salud, hábito; «bajar grasa» sólo adultos con edad confirmada |
| experience | Principiante / intermedio / avanzado | **Declarada** con ayuda en palabras simples; nunca se infiere de cargas ni de años no declarados |
| daysPerWeek, minutes | Disponibilidad | 1–7 días; 15–240 minutos |
| weekdays, split | Distribución semanal | Días preferidos y forma de repartir |
| equipment | Equipamiento disponible o preferido | Lista cerrada |
| favorites, dislikes | Ejercicios preferidos y que no le gustan | Elegidos de la biblioteca (id y nombre), hasta 12 |
| likes, avoid, limits | Preferencias y restricciones **no médicas** | Texto corto; la salud va por «Molestia» con su consentimiento |
| shareWithTrainers | Consentimiento para que lo vea quien arma la rutina | D147 |
| meta | Versión, fecha y procedencia de cada campo | `fields[campo] = { via, at }` |

**Estado explícito** (`profileStatus`): completo (objetivo, experiencia, días y minutos), parcial o sin información. Nada se
completa con valores genéricos.

**Escritura:** cambios parciales validados (`cleanProfilePatch`) y fusionados (`mergeProfile`) dentro de una transacción con la
fila bloqueada; sólo lo enviado cambia, la versión sube con cada cambio real, la auditoría (`profile.updated`) guarda campos y
origen, nunca valores. Cambiar objetivo, días o experiencia cancela los avisos vigentes que dependían de ellos
(`cancelProfileInterventions`); los programas y sus prescripciones nunca se reescriben. El contexto del cerebro cambia de versión
solo (el hash incluye el perfil) y la sugerencia cacheada de «No vino el profe» se descarta al guardar.

**Quién lo usa:** contexto del cerebro (objetivo, experiencia real, días, minutos, preferidos y no le gustan), Training
Intelligence (sesiones abiertas), propuestas del cerebro y avisos proactivos, «No vino el profe» y la rutina sin programa (IA,
con experiencia, equipamiento y restricciones no médicas; sin salud), el pedido de programa (precarga y actualiza el mismo perfil;
el nivel es la experiencia), Progreso (adherencia, intervenciones, «¿Por qué?») y la vista del coach/sala si se compartió.

## 3. Onboarding contextual

No se toca el registro, la validación de email, invitaciones, QR, activación, consentimientos ni la autorización de menores. El
perfil se pide dentro de la app del socio, en el momento en que sirve, y sólo lo que falta:

- Inicio: tarjeta breve «Contale a REPI qué buscás» para perfiles incompletos (se ofrece una vez).
- «Mis rutinas» al crear o subir una rutina, «Entrenar por mi cuenta» y «No vino el profe».
- Cada lugar se ofrece una sola vez (completado u omitido: `user_pref.hints.profile_<lugar>`); cancelar sigue con la acción sin
  perder el trabajo. Nunca bloquea registrar un entrenamiento: lo que se limita es presentar algo como personalizado.
- Un dueño que sólo administra su gimnasio no ve nada de esto (vive en la app del socio).

## 4. Personalización explícita (matriz)

Implementada en `packages/domain/src/personalize.ts` (`PERSONALIZATION_MATRIX`). La regla general: **el perfil nunca cambia
una carga ni reescribe la programación humana**; las cifras salen de la historia comparable, la prescripción, el RIR/RPE y las
señales de seguridad (D182/D191).

| # | Dato | Decisión | Regla | Lo que ve la persona |
|---|---|---|---|---|
| P1 | Historial comparable | Carga y reps del objetivo | Doble progresión con la última sesión comparable; sin historia, ninguna carga | «La última vez…» o «Sin referencia suficiente» |
| P2 | Prescripción del profe | Manda el plan | Fila «coach»; una diferencia material queda como revisión | «Carga indicada por tu profe» |
| P3 | RIR/RPE registrado | Frenar la suba | RIR 0 en todas → no sube | Guarda de esfuerzo |
| P4 | Molestias, lesión, check-in, inactividad | Bajar o mantener | Señales D182; sin IA sin autorización | Guarda de seguridad |
| P5 | Experiencia: principiante | Guía de esfuerzo | Sólo rutinas propias/sugeridas sin RIR/RPE: RIR 2 | «Dejá unas 2 repeticiones en reserva» |
| P6 | Principiante + rutina propia «al fallo» | Advertencia | La rutina no cambia | «Al fallo no hace falta para progresar» |
| P7 | Experiencia: avanzada | Respeto de métodos | Top set, back-off, drop y rest-pause con su misma clase | Referencia propia de cada serie |
| P8 | Objetivo | Énfasis y texto (no la cifra) | Fuerza: carga con técnica; músculo: reps en el rango; resistencia; salud/hábito: constancia | Una frase y «Tuvimos en cuenta: …» |
| P9 | Días por semana | Meta semanal y adherencia | Sesiones vs días declarados | «3 de 4 esta semana» |
| P10 | Minutos | Tamaño de la rutina sin programa | Cantidad de ejercicios por minutos | «Armada para 45 min» |
| P11 | Equipamiento, preferidos, no le gustan | Alternativas y rutina sin programa | Lo que no le gusta no se propone; preferidos primero | Alternativas filtradas |
| P12 | Perfil incompleto | Alcance | Se recomienda con historial y prescripción y se dice que no es personalizada | «No personalizada del todo: falta…» |

Ejemplos del máster: **A** (hipertrofia, intermedia, 4 días, 5 sesiones de press inclinado): la progresión sale de esas 5 sesiones
y la explicación prioriza sumar repeticiones dentro del rango. **B** (fuerza, avanzada, top sets y back-offs): cada clase de serie
se compara sólo con su clase; un estancamiento sugiere revisar la progresión con el entrenador. **C** (salud, principiante, sin
historial): ninguna carga inventada; se explica que hacen falta registros comparables y manda la indicación del entrenador.

La pantalla del gimnasio (REPI Control) no recibe el perfil: es una pantalla compartida y el objetivo es personal.

## 5. Progress Intelligence 2.0

Dominio `packages/domain/src/progress-intel.ts`; servidor `apps/web/src/server/progress/insight.ts`
(`GET /api/me/progress/exercises/:id/insight`). Cuatro conceptos que nunca se mezclan en una cifra:

- **A. Máximo realmente registrado:** la carga más alta de una serie válida (sin aproximaciones), con reps, fecha y procedencia.
- **B. Capacidad estimada:** mejor serie por 1RM estimado (criterio escrito), 1RM (Epley) y cargas por repeticiones sólo a ±4
  reps de una serie reciente (120 días) de 1 a 10 reps con fecha real; método, referencia, límites (±5–10 %) y que no es una
  garantía ni una orden ni motivo para probar un máximo.
- **C. Próxima carga de trabajo:** la propuesta de Training Intelligence (`trendsFor` del orquestador, la misma que «¿Estoy
  progresando?»), redactada como «La última vez completaste … podrías intentar …»; con programa, queda como propuesta al coach.
- **D. Metas:** propias (`client_goal.origin = self`) o acordadas con el coach (sólo lectura). «Tu meta es 80 kg × 8. La mejor
  serie registrada con ese peso fue de 6 repeticiones.»

Además: récords (1RM contra 1RM, carga contra carga; la primera marca no es récord), rendimiento de las últimas 6 semanas frente al
récord, regularidad (sesiones por semana contra los días declarados, días entre sesiones; sólo fechas reales), esfuerzo (RIR medio,
series al fallo), procedencia (importado, fecha aproximada, lectura truncada) e intervenciones (máx. 3; récord, mejora, estable con
el objetivo, pocos datos, cambio de objetivo, meta; respetan «menos avisos» y no se repiten).

El cerebro responde con los mismos cálculos: «¿Cuál es el máximo que levanté…?» (A y, aparte, B), «¿Cuánto podría tirar para 8?»
(B, aclarando que no es la próxima carga), «¿Qué intento la próxima vez?» (C) y «¿Cuánto me falta para 100 kg?» (contra A y,
aparte, B). Entiende libras en la pregunta («225 lb») y **responde siempre en kg** (decisión del titular, 12/11/2026).

## 6. Gráfico

`ProgressChart.tsx` + `packages/domain/src/chart-view.ts`: zoom (botones, selección con mouse, pellizco, doble toque), desplazamiento
(botones, arrastre cuando hay zoom, tira de vista general), teclado (flechas, Inicio/Fin, + − 0, RePág/AvPág), escala vertical
ajustada con un mínimo que muestra 70 → 72,5 kg sin exagerarlo, «Desde cero», puntos del mismo día separados, tramos largos sin
datos punteados, meta como línea, propuesta de REPI separada por «Hoy» y nunca unida a lo real, fecha aproximada con marcador
hueco, sólo los puntos visibles se dibujan (historiales de 1000+), movimiento reducido sin animación, tabla accesible debajo.

## 7. Permisos y privacidad

- Todo se lee con la sesión: no hay parámetro de usuario. Un ejercicio ajeno o sin registros responde 404.
- Metas propias: privadas (el coach no las lista ni las cambia); el alumno no cambia metas del coach. En un gimnasio con
  planificación supervisada (REPI Control) no se crean desde Progreso: se pide al equipo.
- El perfil se comparte con quien arma la rutina sólo con el consentimiento D147; la gerencia no lo ve por otra vía.
- Sin datos de salud en el perfil; nada de salud a la IA sin autorización (igual que antes).
- Objetivo corporal sólo con edad adulta confirmada; menores y edad desconocida no lo ven ni lo pueden guardar.

## 8. Migración

`0055_self_goals.sql` (aditiva): `client_goal.coach_client_id` deja de ser obligatoria, columnas `user_id` (FK a `user`, cascade) y
`origin` (default `coach`), índice parcial y restricción de dueño coherente. Producción: `scripts/operations/hosted-0055.sql`
(una transacción, como repi_app), ensayo `scripts/operations/verify-0055.sh` (huella intacta, restricción, reintento, reversión
negada con metas propias, reversión y reaplicación) y `scripts/rollback/0055_self_goals.down.sql`.

## 9. Pruebas

- Dominio: `wishes.test.ts`, `personalize.test.ts`, `progress-intel.test.ts`, `chart-view.test.ts`, `brain/intents.test.ts` y
  `brain/answers.test.ts` (nuevas intenciones).
- Servidor (repi_test): `apps/web/tests/profile-progress.test.ts`.
- QA: build local con la demo de alumno (390 px claro/oscuro, iPhone 13 emulado y 820 px) y un historial importado de 3 años
  (428 registros, tramo con fecha aproximada y hueco de 90 días); smoke en producción 14/14 sólo con la demo.

### Mapa de los 64 casos del máster

Referencias: **D** = dominio (`packages/domain/src/…`), **S** = servidor (`apps/web/tests/profile-progress.test.ts`), **Q** = QA en
build local (`pi-shots`/`pi-long`), **P** = smoke de producción, **E** = otra prueba existente.

| # | Caso | Dónde |
|---|---|---|
| 1–4 | Sin perfil, completa, completo, parcial | S «sin perfil → parcial → completo»; D `wishes.test.ts` (estado); Q formulario breve sólo con lo que falta; P perfil none→partial→complete |
| 5 | Primera rutina | Q/código: «Nueva» en Mis rutinas pasa por el formulario breve (`OwnRoutines`, «routines»); S rutina propia de principiante |
| 6 | Importa una rutina | «Subir» y «Cargar historial anterior» pasan por el formulario breve («import») |
| 7 | Modifica objetivos | S «cambiar el objetivo cancela los avisos…; el programa no cambia»; D intervención «goal_changed» |
| 8 | Cancela el formulario | S `markProfileAsked`; Q «Ahora no»/Esc siguen con la acción |
| 9 | Más de una relación | Perfil por persona (no por relación); contexto usa la relación de la sesión abierta (E `brain-context.test.ts`) |
| 10 | REPI Control | S «REPI Control: el socio… no fija metas»; el perfil sí se completa; la pantalla del gimnasio no recibe el perfil |
| 11–12 | Menor y edad sin confirmar | S «menores y edad sin confirmar»; D `profileStatus(…, "minor"/"unknown")` |
| 13–14 | Objetivos y experiencia diferentes | D personalize «misma carga, distinto énfasis y guía»; S rutina propia de principiante |
| 15 | Sin historial | D y S «sin historial: ninguna carga inventada» |
| 16 | Historial extenso | Q 428 registros: vista inteligente 62–75 ms, evolución 28 ms; E `history-import*.test.ts` |
| 17 | Objetivo cambiado con programa vigente | D `personalizeProposal` (fuerza estancada → revisar con el entrenador); S programa sin cambios |
| 18 | Prescripción humana | D «filas del profe intactas» y «programa del profe sin carga»; S caso 18 |
| 19–20 | RIR alto / bajo | D «RIR del plan presente no se pisa»; E `intelligence.test.ts` (max_effort, «easier»/«harder») |
| 21 | Fatiga declarada | E `intelligence.test.ts` y `progression.test.ts` (low_readiness, max_effort); propuesta «deload» |
| 22 | Restricción vigente | E guardas `pain_exercise`/`pain_or_injury`; contexto con molestias (E `brain-context.test.ts`) |
| 23 | Método avanzado | D «top set + back-off: sólo la principal recibe guía» |
| 24 | Ejercicio sustituido | E `substitutions.test.ts`, `brain-chat.test.ts` (reemplazo sólo por hoy); TI usa el ejercicio que se hace |
| 25 | Datos insuficientes | D/S «perfil incompleto: se marca y se dice qué falta» |
| 26–28 | Carga máxima, mejor serie, 1RM | D progress-intel 26–28; S «máximo real, mejor serie, 1RM…»; P vista inteligente |
| 29 | Estimación por repeticiones | D 29 (±4 reps, ≤10 reps de referencia, sin fecha aproximada, 120 días) |
| 30 | Próxima carga | D `nextText`; S «la MISMA propuesta que Training Intelligence» |
| 31 | Objetivo individual | D/S «La mejor serie registrada con ese peso fue de…»; P meta creada y cerrada |
| 32–33 | Récord histórico / reciente | D 32–33 |
| 34–35 | Importado / fecha aproximada | D 34–35; S «historial importado con fecha aproximada»; Q marcador hueco y leyenda |
| 36–37 | Serie anulada / corregida | S «serie anulada no cuenta; corregida con su valor vigente, sin duplicar» |
| 38–40 | Tiempo, peso corporal, drop sets | D 38–40 |
| 41 | kg y lb | D 41: los datos se guardan en kg; la pantalla de Progreso muestra la unidad elegida; el chat de REPI responde siempre en kg (decisión del titular) |
| 42–45 | Zoom in/out, restablecer, desplazamiento | D `chart-view.test.ts`; Q historial largo (botones, «Ver todo», «Antes») |
| 46 | Pellizco | Q eventos táctiles reales (CDP) en iPhone 13 emulado: pellizco acerca, arrastre desplaza |
| 47–48 | Dos sesiones el mismo día / una sola | D `chart-view.test.ts` (separación estable); Q demo con 1–2 registros (sin línea ni zoom) |
| 49–50 | Historial muy largo / grandes intervalos | Q 428 registros sin errores; tramo de 90 días punteado |
| 51–52 | Cambio de ejercicio con zoom / de período | Q «otro ejercicio sin zoom heredado»; el gráfico se reinicia por `key` |
| 53 | Teclado | Q Fin/←/«+»/«0»; D navegación |
| 54 | Movimiento reducido | Sin animación con `prefers-reduced-motion` (verificado por el agente del gráfico en Chromium) |
| 55 | Tema claro y oscuro | Q capturas 390 px claro y oscuro |
| 56 | Sin conexión | Progreso muestra «Sin conexión…» (sin pedir datos); el formulario breve deja seguir sin bloquear |
| 57 | Móvil y tablet | Q 390 px, iPhone 13 emulado y 820 px |
| 58 | No leer el progreso de otro | S caso 58 (404); P 404 |
| 59 | Entrenador sin relación vigente | E `goals.test.ts`/`privacy.test.ts` (coach sin relación: 404); las metas propias no se exponen al coach (S) |
| 60 | Gimnasio de otra organización | E `gym.test.ts`, `repi-control.test.ts` (aislamiento por organización) |
| 61 | Programa institucional no alterable | S caso 10/61; E `repi-control.test.ts` |
| 62 | Propuesta que no se ejecuta sin autorización | D `nextProposal`/`requiresCoach`; E `brain-actions.test.ts` (acciones confirmadas en el servidor) |
| 63 | Corrección sin duplicación | S 36–37 |
| 64 | Acciones de REPI validadas por el servidor | S caso 64 (respuestas con datos del servidor); E `brain-actions.test.ts` |
