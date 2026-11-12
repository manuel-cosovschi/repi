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
aparte, B). Acepta libras («225 lb»).

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
- Mapa de los 64 casos del máster: ver la sección «Pruebas» de `docs/continuidad/PROXIMA_SESION.md` del bloque D217.
