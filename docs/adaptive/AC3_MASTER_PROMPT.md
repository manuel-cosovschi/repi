<!-- Texto del máster tal como lo envió el titular el 07/11/2026 (fuente activa del bloque Adaptive Coaching 3.0, D209).
     Se guarda en el repositorio para no depender del chat. No editar: las decisiones y el estado van en
     docs/adaptive/ADAPTIVE_COACHING_3.md y docs/continuidad/PROXIMA_SESION.md. -->

# MASTER PROMPT — REPI ADAPTIVE COACHING 3.0

PERSONAL TRAINER INTELLIGENCE — THE REPI BRAIN

El cerebro inteligente, contextual, proactivo y persistente de REPI

⸻

0. MISIÓN PRINCIPAL

Vas a desarrollar la evolución más ambiciosa del sistema de inteligencia artificial de REPI hasta la fecha.

Nombre del sistema:

REPI — Adaptive Coaching 3.0
Personal Trainer Intelligence

Este módulo debe transformar REPI de una aplicación que registra entrenamientos y ofrece recomendaciones en una plataforma que se comporta como un entrenador personal digital inteligente, proactivo y profundamente personalizado.

No quiero otro chatbot genérico.

No quiero simplemente un botón que diga «Preguntale a REPI».

No quiero una colección de consejos predeterminados.

No quiero que el alumno tenga que explicarle constantemente a la IA quién es, qué rutina tiene, qué hizo ayer o qué está intentando conseguir.

Quiero un cerebro central que comprenda el contexto del socio, utilice sus datos autorizados, razone sobre su entrenamiento, recuerde las decisiones relevantes, detecte oportunidades para ayudar e interactúe de manera natural en todas las secciones pertinentes de la aplicación.

La visión es que cada alumno sienta que cuenta con un entrenador personal digital que:

* Conoce sus objetivos.
* Conoce su rutina actual.
* Conoce su historial.
* Sabe qué ejercicios viene realizando.
* Interpreta su evolución.
* Conoce las cargas y repeticiones anteriores.
* Considera su nivel de experiencia.
* Tiene en cuenta las preferencias que declaró.
* Considera las molestias y restricciones que corresponda usar.
* Comprende el contexto del entrenamiento que está realizando.
* Recuerda qué recomendaciones le hizo.
* Sabe cuáles aceptó, modificó o rechazó.
* Aprende de los resultados observables.
* Le explica por qué propone algo.
* Reconoce cuándo no tiene suficientes datos.
* Sabe cuándo intervenir y cuándo permanecer en silencio.

El entrenador digital debe acompañar, no invadir.

No tiene que fingir que es una persona humana ni presentarse como profesional médico. Debe ofrecer asistencia de entrenamiento de alta calidad con límites claros.

El resultado debe ser un sistema real, persistente, conectado y comprobable, no una demostración visual de lo que podría construirse después.

⸻

1. CONTEXTO ACTUAL DEL PROYECTO

Repositorio:

manuel-cosovschi/repi

Producción:

https://repiclub.com

Trabajá sobre el último main disponible.

Al momento de preparar este pedido, Smart Program Import 2.0 ya está publicado y documentado como D207, y el repositorio se encuentra en 08d4a5084c18d9ca425415f67c14169c2c47cfca.

Confirmá el HEAD actual antes de modificar cualquier archivo.

Bloques existentes que debés reutilizar

REPI ya tiene múltiples componentes que deben convertirse en partes de este cerebro:

* Adaptive Coach original y «No vino el profe».
* Rutinas propias y rutinas asignadas.
* Training Intelligence 2.0.
* Motor de progresión por ejercicio y por serie.
* Objetivos del entrenador frente a resultados reales.
* Recomendaciones de cargas y repeticiones.
* Check-in de energía, sueño y estado de ánimo.
* Registro de molestias y restricciones.
* Historial de sesiones, series y cambios.
* Importación de historial anterior a REPI.
* Smart Program Import 2.0.
* Procedencia y datos faltantes de rutinas importadas.
* Progreso personal y gráficos.
* Peso corporal y objetivos.
* Calorías estimadas.
* Mensajería con entrenadores.
* Solicitudes al gimnasio.
* Sistema de notificaciones y push.
* Biblioteca de ejercicios.
* Equipamiento y sustituciones aprobadas.
* Programación de entrenamientos.
* Entrenamiento offline.
* Roles, relaciones y consentimientos.

Documentos y código de lectura obligatoria

Revisá, como mínimo:

* docs/continuidad/PROXIMA_SESION.md
* docs/adaptive/ADAPTIVE_COACH_ARCHITECTURE.md
* docs/TRAINING_INTELLIGENCE_2.md
* docs/SMART_IMPORT_2.md
* docs/PERSONAL_PROGRESS_BODY_TRACKING_1.md
* packages/domain/src/adaptive.ts
* packages/domain/src/intelligence.ts
* packages/domain/src/progression.ts
* apps/web/src/server/training/adaptive.ts
* apps/web/src/server/training/ai-coach.ts
* apps/web/src/server/training/intelligence.ts
* apps/web/src/server/training/solo-routine.ts
* apps/web/src/server/training/services.ts
* apps/web/src/server/training/program-ai.ts
* apps/web/src/server/notifications/feed.ts
* apps/web/src/server/ai/openai.ts
* apps/web/src/components/member/MemberApp.tsx
* apps/web/src/components/member/Workout.tsx
* Los constructores de programa de coach y gimnasio.
* Las estructuras actuales de base de datos, auditoría, privacidad y preferencias.

También inspeccioná las APIs de entrenamiento, historial, progreso, mensajes y notificaciones.

El documento ADAPTIVE_COACH_ARCHITECTURE.md es una referencia histórica, no necesariamente el estado actual de implementación. Auditá el código antes de asumir que sus fases están pendientes.

Regla arquitectónica

No construyas un segundo motor de entrenamiento.

Adaptive Coaching 3.0 debe convertirse en la capa superior de orquestación, interpretación, conversación y proactividad, aprovechando los cálculos y servicios ya existentes.

Conservá una única fuente de verdad para cada dato.

⸻

2. PRINCIPIO FUNDAMENTAL: UN SOLO CEREBRO PARA TODA LA APP

Hoy REPI puede realizar varias operaciones inteligentes en distintos lugares.

Quiero que Adaptive Coaching 3.0 unifique esas capacidades bajo una arquitectura coherente.

Diseñá un núcleo central, por ejemplo:

REPI Intelligence Core

Este núcleo debe reunir:

1. Contexto autorizado del usuario.
2. Estado actual del entrenamiento.
3. Historial relevante.
4. Metas y preferencias.
5. Eventos recientes.
6. Reglas de entrenamiento.
7. Políticas de seguridad.
8. Memoria de interacciones.
9. Motor de recomendaciones.
10. Motor de proactividad.
11. Capacidades conversacionales.
12. Acciones verificadas.
13. Seguimiento del resultado de las recomendaciones.

El usuario no debería interactuar con seis inteligencias distintas que se contradicen.

Debe interactuar siempre con el mismo REPI.

Si REPI recomienda mantener una carga durante el entrenamiento, debe recordar esa recomendación cuando el alumno posteriormente consulta sus resultados.

Si el alumno explica que una máquina está ocupada, REPI debe considerar esa información durante la sesión correspondiente.

Si el entrenador modifica el programa, REPI debe interpretar la versión vigente y abandonar propuestas incompatibles con la nueva programación.

La memoria no debe ser una transcripción interminable. Debe representar hechos verificables, preferencias expresamente declaradas, decisiones y resultados relevantes, con procedencia, fecha, vencimiento y posibilidad de corrección.

⸻

3. TRAINING CONTEXT ENGINE — COMPRENDER REALMENTE AL SOCIO

Implementá un motor de contexto estructurado y reutilizable.

Para cada consulta o evento, REPI debe poder construir una representación actualizada del usuario, utilizando exclusivamente los datos a los que tiene acceso legítimo.

Perfil de entrenamiento

* Experiencia declarada.
* Objetivos actuales.
* Frecuencia semanal buscada.
* Tiempo disponible.
* Preferencias de ejercicios.
* Equipamiento disponible.
* Ejercicios que prefiere evitar.
* Unidad de peso.
* Tipo de relación: gimnasio, entrenador independiente o rutina propia.
* Programa y versión vigentes.

Historial y rendimiento

* Sesiones completadas.
* Sesiones anuladas o corregidas.
* Entrenamientos recientes.
* Frecuencia real.
* Volumen por músculo o ejercicio, cuando sea comparable.
* Cargas utilizadas.
* Repeticiones realizadas.
* RIR/RPE registrados.
* Descansos y tiempos disponibles.
* Tendencias de rendimiento.
* Registros personales.
* Ejercicios con pocos datos.
* Períodos de inactividad.
* Cambios relevantes en la programación.

Estado del entrenamiento actual

* Sesión abierta o terminada.
* Día del programa.
* Ejercicio actual.
* Serie actual.
* Series ya completadas.
* Objetivos de la programación.
* Objetivos sugeridos por Training Intelligence.
* Resultados reales.
* Ejercicios pendientes.
* Sustituciones efectuadas.
* Tiempo transcurrido.
* Estado de sincronización offline.

Señales de recuperación y disponibilidad

Cuando existan datos autorizados:

* Energía declarada.
* Sueño declarado.
* RPE reciente.
* Comentarios sobre cansancio.
* Días desde la última sesión comparable.
* Restricciones vigentes.
* Molestias reportadas.
* Disponibilidad de tiempo.

No diagnostiques sobreentrenamiento ni lesiones a partir de estas señales. Tratá las conclusiones como indicios limitados y explicables.

Progreso corporal

Con permisos apropiados:

* Peso corporal registrado.
* Objetivo declarado.
* Evolución de mediciones.
* Frecuencia de registro.

Las fotos privadas de progreso no deben ser enviadas ni procesadas por el modelo de IA en este bloque. La futura interpretación visual pertenece a Body Intelligence y requerirá consentimiento específico.

No generes evaluaciones de atractivo, calificaciones corporales ni porcentajes de grasa inventados.

Smart Import

Integra la procedencia del nuevo motor de importación:

* Qué decía el documento original.
* Qué quedó desconocido.
* Qué completó el usuario.
* Qué se aceptó como sugerencia.
* Qué programa es el vigente.
* Qué se ejecutó realmente.

La IA nunca debe convertir un dato originalmente desconocido en una instrucción supuestamente indicada por un entrenador.

Calidad del contexto

Cada dato relevante debe indicar, cuando corresponda:

* Fuente.
* Fecha.
* Vigencia.
* Calidad o limitaciones.
* Si es histórico, declarado, calculado o inferido.
* Si el usuario autorizó su utilización.

Si falta información, REPI debe reconocerlo.

⸻

4. PROACTIVE INTELLIGENCE ENGINE — QUE REPI TOME LA INICIATIVA

Este es uno de los componentes más importantes.

REPI no puede depender exclusivamente de que el usuario le haga preguntas.

Tiene que detectar momentos en los que una intervención realmente aporte valor.

Diseñá un motor de eventos y decisiones que evalúe oportunidades para ayudar.

Eventos de entrenamiento

Ejemplos:

* El alumno abre REPI antes de entrenar.
* Está por comenzar una sesión.
* Completa una serie.
* Registra menos repeticiones que las previstas.
* Registra un RIR mucho menor al esperado.
* Supera un registro personal.
* Cambia un ejercicio.
* Indica que una máquina está ocupada.
* Hace una pausa prolongada.
* Termina su entrenamiento.
* Retoma una sesión interrumpida.

Eventos longitudinales

* Mejora consistente de rendimiento.
* Estancamiento con evidencia suficiente.
* Disminución sostenida de rendimiento.
* Aumento importante de exigencia.
* Objetivo alcanzado.
* Varias semanas con menor adherencia a la frecuencia elegida.
* Regreso después de un período sin entrenar.
* Rutina nueva o actualizada por el entrenador.
* Cambio significativo en objetivos o disponibilidad.

Eventos de contexto

* El alumno declara poco tiempo.
* Reporta baja energía.
* Comunica una molestia.
* Tiene dudas sobre su programación.
* Importa una rutina nueva.
* Registra una medición que afecta un objetivo previamente establecido.
* Rechaza reiteradamente una recomendación.
* Pide menos intervenciones.

Motor de relevancia

No quiero notificaciones por cualquier cosa.

Creá un sistema que decida:

¿Hay algo importante que decir?

¿Es el momento adecuado?

¿Aporta información nueva?

¿La recomendación es accionable?

¿Tiene evidencia suficiente?

¿Se dijo algo parecido recientemente?

¿La persona quiere recibir este tipo de intervenciones?

Debe existir también la decisión:

No intervenir.

Priorizá:

1. Alertas de seguridad relevantes.
2. Instrucciones importantes del entrenador.
3. Ayudas concretas durante la sesión.
4. Recomendaciones de progreso.
5. Reconocimiento de logros.
6. Recordatorios opcionales.
7. Ningún mensaje cuando no aporta valor.

Implementá deduplicación, prioridades, límites de frecuencia, ventanas de silencio y cancelación de mensajes obsoletos.

La proactividad debe funcionar mediante eventos y verificaciones programadas reales, no mediante una falsa promesa de que el modelo está pensando continuamente en segundo plano.

⸻

5. REPI EN INICIO — EL ENTRENADOR QUE TE RECIBE

Quiero que la pantalla de Inicio se transforme en uno de los principales puntos de interacción con REPI.

No debe convertirse en una pantalla invadida por inteligencia artificial.

Debe haber una presencia visual coherente, compacta y contextual.

Experiencias deseadas

Antes de entrenar

REPI puede mostrar:

«Hoy te toca Torso A. La última vez mejoraste en press inclinado y remo. ¿Vamos por otra buena sesión?»

Si tiene poco tiempo

«Hoy tenés 35 minutos. Puedo proponerte una versión más corta de tu rutina, conservando los ejercicios prioritarios.»

Si lleva tiempo sin entrenar

«Hace unos días que no registrás entrenamientos. ¿Querés retomar por el día que tenías pendiente?»

No asumir que abandonó el gimnasio: podría haber entrenado sin registrar.

Si hay un programa actualizado

«Tu entrenador actualizó tu rutina. Te muestro qué cambió antes de empezar.»

Si detecta un logro real

«Completaste cuatro sesiones esta semana, justo la frecuencia que te habías propuesto.»

Interacción

La tarjeta de REPI debe permitir, según contexto:

* Ver recomendación.
* Consultar por qué.
* Aceptar una sugerencia.
* Modificar una propuesta.
* Empezar entrenamiento.
* Abrir conversación.
* Descartar.
* Indicar que no vuelva a mostrar algo parecido.

Evitar saludos repetitivos o mensajes que parezcan generados sólo para demostrar que existe una IA.

⸻

6. REPI DURANTE EL ENTRENAMIENTO — COACHING EN TIEMPO REAL

Este es el núcleo práctico de la experiencia.

Quiero que REPI acompañe al socio antes, durante y después de cada ejercicio, sin entorpecer el registro de series.

Antes de un ejercicio

Debe mostrar, cuando sea útil:

* Objetivo prescrito.
* Resultado de la sesión comparable anterior.
* Recomendación de Training Intelligence.
* Explicación breve.
* Advertencia sobre una restricción relevante.
* Dato faltante o incertidumbre, si corresponde.

Ejemplo:

«La última vez hiciste 3 × 10 con 60 kg. Hoy tenés indicado trabajar entre 10 y 12 repeticiones. Mantenemos la carga e intentamos acercarnos a 12.»

Después de cada serie

El sistema debe interpretar:

* Peso utilizado.
* Repeticiones realizadas.
* RIR/RPE, si está disponible.
* Objetivo esperado.
* Diferencia respecto de lo esperado.
* Tipo de serie.
* Posición dentro de un método avanzado.
* Restricciones vigentes.

Y decidir si conviene intervenir.

Ejemplos:

«Te quedaron menos repeticiones en reserva de las previstas. Para la próxima serie, mantené o reducí la carga según cómo te sientas.»

«Completaste las repeticiones objetivo. Bien. Mantenemos la programación de hoy y lo tenemos en cuenta para tu próximo entrenamiento.»

«Esta era una serie de aproximación. No la vamos a comparar con tus series principales.»

Descansos

REPI debe comprender el temporizador existente.

Puede proponer:

* Mantener el descanso prescrito.
* Añadir un breve descanso cuando las señales lo justifiquen.
* Esperar antes de volver a entrenar si la persona indica que lo necesita.

Nunca debe modificar automáticamente el temporizador sin una autorización adecuada.

Métodos avanzados

El sistema debe entender y respetar:

* Warm-ups.
* Series principales.
* Top sets.
* Back-off.
* Drop sets.
* Rest-pause.
* Myo-reps.
* Cluster.
* EMOM.
* AMRAP.
* Superseries.
* Circuitos.
* Trabajo por tiempo.

No puede tratar las etapas de un drop set como series principales independientes.

No puede sugerir una carga calculada con una referencia incompatible.

No puede romper una estructura de entrenamiento indicada por un entrenador.

Ejercicio ocupado

El alumno puede decir:

«La polea está ocupada.»

REPI debe:

1. Comprender el ejercicio actual.
2. Consultar alternativas reales disponibles.
3. Priorizar reemplazos aprobados por el entrenador.
4. Verificar restricciones y disponibilidad de equipamiento, cuando esa información exista.
5. Presentar una o dos alternativas adecuadas.
6. Solicitar confirmación antes de modificar la sesión.

No inventar máquinas ni asumir que están libres.

Poco tiempo

El alumno puede decir:

«Me quedan solamente 20 minutos.»

REPI debe analizar la sesión pendiente y proponer una adaptación conservadora:

* Mantener ejercicios prioritarios.
* Preservar las indicaciones esenciales.
* Evitar eliminar trabajo ya registrado.
* Mostrar qué se conservará y qué se omitirá.
* Explicar que la adaptación responde al tiempo disponible.
* No modificar silenciosamente el programa futuro.

Molestias o dolor

Si el alumno dice:

«Me duele el hombro cuando hago este movimiento.»

REPI debe priorizar detener ese ejercicio, registrar el reporte si la persona lo confirma y recomendar consultar al entrenador o a un profesional adecuado.

No debe diagnosticar, asegurar que algo es seguro ni recomendar entrenar atravesando el dolor.

Reglas innegociables

Training Intelligence sigue siendo la autoridad para los cálculos de progresión compatibles.

El resultado de la persona sigue siendo la fuente de verdad.

Una recomendación jamás sobrescribe una serie registrada.

La IA no aumenta por sí sola la carga a mitad de la sesión.

Las cargas indicadas por un entrenador no se reemplazan silenciosamente.

El entrenamiento debe seguir funcionando si el modelo falla, demora o no hay Internet.

⸻

7. REPI DESPUÉS DEL ENTRENAMIENTO — ANÁLISIS Y FEEDBACK

Al finalizar una sesión, quiero que REPI pueda ofrecer un cierre realmente personalizado.

No un mensaje genérico como:

«¡Buen trabajo! Seguí así.»

Quiero algo basado en evidencia.

Ejemplo:

«Hoy completaste 18 de las 20 series previstas. En press inclinado igualaste tu mejor marca y en remo hiciste dos repeticiones más que la sesión anterior. El último ejercicio quedó sin terminar. ¿Querés que lo tengamos en cuenta para tu próxima sesión?»

Funcionalidades

* Resumen de lo realizado.
* Comparación contra lo programado.
* Comparación con entrenamientos anteriores.
* Identificación de logros.
* Detección prudente de señales de fatiga.
* Ejercicios omitidos.
* Adaptaciones realizadas.
* Pregunta breve de percepción cuando aporte valor.
* Recomendación para la siguiente sesión.
* Actualización del estado de memoria relevante.

No recomendar siempre aumentar el peso.

La progresión puede consistir en mejorar repeticiones, técnica declarada, regularidad, tolerancia a la sesión o mantener un rendimiento previsto, según el contexto.

No asumir que una mejora de volumen equivale automáticamente a una mejora de fuerza.

⸻

8. REPI EN PROGRESO — ANALISTA PERSONAL DEL ENTRENAMIENTO

Integra Adaptive Coaching 3.0 con Personal Progress & Body Tracking 1.0.

El alumno debe poder preguntar:

* «¿Estoy progresando?»
* «¿En qué ejercicio mejoré más?»
* «¿Por qué estoy estancado en sentadilla?»
* «¿Qué pasó con mi fuerza este mes?»
* «¿Cuántas veces entrené la espalda?»
* «¿Qué objetivo me conviene revisar?»
* «¿Cómo vengo respecto de hace tres meses?»

Las respuestas deben basarse en los registros de REPI.

Análisis proactivo

REPI puede identificar:

* Mejoras consistentes.
* Rendimiento estable.
* Tendencias negativas.
* Variaciones importantes de volumen.
* Cambios en frecuencia.
* Objetivos alcanzados.
* Información insuficiente para evaluar una tendencia.

Ejemplo:

«En las últimas cinco sesiones comparables de press banca aumentaste tu carga máxima manteniendo un rango parecido de repeticiones. Hay una señal positiva de progreso.»

Explicabilidad

Cada recomendación debe permitir ver:

Por qué te digo esto.

Ejemplo:

«Comparé las sesiones del 12/10, 19/10, 26/10 y 02/11. Excluí las series anuladas y utilicé sólo las series principales comparables.»

No inventar fechas, sesiones, números ni tendencias.

Los cálculos deben venir de servicios determinísticos existentes o verificables, no de la memoria textual del modelo.

⸻

9. REPI EN MI CUERPO — ACOMPAÑAMIENTO CONTEXTUAL

REPI debe poder conversar sobre los objetivos corporales del usuario adulto cuando esté permitido.

Ejemplos:

«¿Cómo viene mi objetivo de peso?»

«¿Cuánto cambié desde que empecé a registrarlo?»

«¿Estoy siguiendo la tendencia que buscaba?»

Debe usar las mediciones reales y evitar interpretaciones clínicas.

Límites

* No analizar fotografías privadas en esta versión.
* No estimar composición corporal a partir de imágenes.
* No inventar porcentajes de grasa.
* No emitir juicios sobre la apariencia física.
* No diagnosticar problemas de salud.
* No realizar comentarios que fomenten conductas alimentarias extremas.
* No ofrecer funciones corporales restringidas a menores.

Si una persona adulta tiene un objetivo poco realista o informa señales preocupantes, responder con prudencia y derivar a asesoramiento profesional cuando corresponda.

REPI debe ayudar, no presionar.

⸻

10. REPI EN RUTINAS Y SMART IMPORT — ENTENDER LO QUE ESTÁ PROGRAMADO

Adaptive Coaching 3.0 debe integrarse profundamente con Smart Program Import 2.0.

Cuando un alumno importe una rutina, REPI debe poder explicarle:

* Cómo está organizada.
* Qué días incluye.
* Qué significa cada método reconocido.
* Qué ejercicios tienen indicaciones incompletas.
* Qué información fue sugerida y no aparecía en el documento original.
* Qué partes necesitan revisión.

Ejemplo:

«Importaste una rutina de cuatro días. En press inclinado aparece la carga para cada serie, pero en curl femoral no se indicó el número de series. ¿Querés completarlo?»

Si el usuario solicita un cambio, REPI debe distinguir:

Importación: reflejar fielmente lo escrito.

Adaptación: crear una propuesta nueva y explícita.

Nunca reescribir la fuente original y presentar esa modificación como si hubiera estado en el documento.

Versiones

Respetar:

* own_routine.origin.
* El contenido vigente.
* Las modificaciones del usuario.
* program_version.
* Los programas asignados.
* El entrenamiento realmente registrado.

La trazabilidad será fundamental para la memoria del sistema.

⸻

11. REPI CHAT — CONVERSACIÓN NATURAL Y CONTEXTUAL

Desarrollá una experiencia conversacional persistente.

No quiero que sea exclusivamente una caja de texto aislada.

Quiero que el usuario pueda hablar con REPI y que la conversación tenga contexto.

Capacidades

El alumno debería poder decir:

«¿Qué me toca hoy?»

«¿Por qué me recomendaste ese peso?»

«La última serie me costó muchísimo.»

«Quiero entrenar cuatro días esta semana.»

«Hoy no tengo ganas de hacer piernas.»

«¿Cómo hago para progresar en dominadas?»

«Quiero cambiar ese ejercicio porque no me gusta.»

«¿Qué marca hice la última vez?»

«No entiendo cómo funciona un drop set.»

«Armame una alternativa para cuando no está mi profe.»

«¿Qué tendría que mejorar de mi entrenamiento?»

REPI debe interpretar la intención y utilizar el contexto adecuado.

Conversación multi-turno

Ejemplo:

Alumno: «La máquina está ocupada».

REPI: «¿Te referís a la dorsalera que te toca ahora?»

Alumno: «Sí».

REPI: «Tu entrenador aprobó como alternativa el jalón unilateral en polea. ¿Querés reemplazarla sólo por hoy?»

Alumno: «Sí».

REPI ejecuta el cambio autorizado y confirma lo sucedido.

La conversación debe tener continuidad entre mensajes y secciones, sin depender de enviar nuevamente todo el historial al modelo en cada turno.

Interfaz

Diseñá:

* Acceso contextual a REPI.
* Chat o panel expandible.
* Historial de conversación útil.
* Sugerencias rápidas según la sección.
* Tarjetas con datos.
* Acciones claramente diferenciadas de respuestas.
* Confirmaciones para modificaciones.
* Feedback sobre respuestas.
* Estados de carga.
* Recuperación ante fallos.
* Posibilidad de cerrar y retomar.

No utilices una interfaz invasiva que tape la rutina o dificulte registrar series.

El usuario debe saber cuándo está viendo un dato registrado, una regla calculada o una sugerencia generada con IA.

⸻

12. REPI ACTION ENGINE — DE RESPONDER A ACTUAR

Una de las mayores diferencias respecto de un chatbot común debe ser la capacidad de realizar acciones.

Pero toda acción debe pasar por servicios y permisos verificados.

Diseñá un catálogo de acciones estructuradas.

Ejemplos:

* Abrir el entrenamiento correspondiente.
* Mostrar el historial de un ejercicio.
* Consultar una marca anterior.
* Proponer un reemplazo.
* Aplicar un reemplazo de sesión autorizado.
* Proponer una adaptación por falta de tiempo.
* Preparar un borrador de rutina propia.
* Explicar una modificación del entrenador.
* Registrar una preferencia con confirmación.
* Preparar una consulta para el entrenador.
* Abrir una solicitud de ayuda al gimnasio.
* Actualizar una configuración autorizada.
* Registrar feedback sobre una recomendación.

Protocolo de ejecución

Toda acción debe atravesar:

1. Identificación de la intención.
2. Resolución del usuario y contexto.
3. Verificación de permisos.
4. Validación de datos.
5. Evaluación de seguridad.
6. Verificación de versiones vigentes.
7. Confirmación humana cuando corresponda.
8. Ejecución idempotente.
9. Auditoría.
10. Confirmación basada en el resultado real del servidor.

Nunca afirmar «Listo, cambié tu rutina» antes de que el servidor confirme el cambio.

Niveles de autonomía

Implementá políticas configurables, coherentes con los permisos actuales:

Nivel 0 — Informativo

REPI explica, analiza y responde, pero no propone modificaciones operativas.

Nivel 1 — Asistente

REPI puede recomendar y preparar cambios, pero requiere confirmación antes de ejecutarlos.

Nivel 2 — Asistencia autorizada

Permite ejecutar automáticamente únicamente operaciones de bajo riesgo expresamente permitidas por el usuario y la política de su organización, nunca cambios sustanciales de programación.

Ningún nivel habilita modificaciones de datos sensibles, decisiones médicas ni cambios permanentes de programas de un entrenador sin la aprobación correspondiente.

El nivel seguro por defecto debe ser conservador.

⸻

13. REPI MEMORY — MEMORIA INTELIGENTE Y PERSISTENTE

Quiero que REPI recuerde el contexto útil entre entrenamientos y conversaciones.

No sirve que el alumno tenga que explicar lo mismo todos los días.

Tipos de memoria

A. Hechos verificables

Derivados de la base:

* Programación vigente.
* Ejercicios registrados.
* Últimas marcas.
* Objetivos.
* Progreso.
* Cambios de programa.

No duplicar estos datos en una memoria que pueda quedar desactualizada.

B. Preferencias declaradas

Ejemplos:

* «Prefiero entrenar temprano».
* «No me gusta el remo en máquina».
* «Quiero que me hables de forma breve».
* «No quiero recordatorios de motivación».
* «Prefiero que me consultes antes de recomendar un cambio».

Estas preferencias deben poder verse, modificarse y eliminarse.

C. Decisiones

* Qué recomendación recibió.
* Qué aceptó.
* Qué rechazó.
* Qué modificó.
* Qué acción realmente se ejecutó.

D. Resultados

* Qué pasó después de una adaptación.
* Si completó la sesión.
* Si una sugerencia de carga resultó apropiada según los datos disponibles.
* Si el usuario indicó que una recomendación no le sirvió.

E. Contexto temporal

* Una máquina ocupada es información momentánea.
* El tiempo disponible de hoy no es una preferencia permanente.
* Una molestia reportada requiere su propia vigencia y tratamiento.
* Un programa anterior no debe confundirse con el vigente.

Memoria responsable

Incorporá:

* Fechas y caducidad.
* Procedencia.
* Política de retención.
* Corrección y eliminación.
* Exportación de datos.
* Consentimientos.
* Invalidación al cambiar datos originales.
* Aislamiento por persona y organización.

No guardes inferencias psicológicas, médicas o íntimas innecesarias.

La memoria debe mejorar la utilidad del sistema, no convertirse en un perfil opaco del usuario.

⸻

14. HUMAN COACH COLLABORATION — NO CONTRA EL ENTRENADOR, SINO JUNTO A ÉL

REPI es B2B2C.

La IA debe potenciar a los entrenadores personales y al equipo de sala.

No debe competir con su autoridad profesional ni modificar silenciosamente sus programas.

Cuando existe entrenador

Debe distinguir:

1. Qué indicó el entrenador.
2. Qué recomendó Training Intelligence.
3. Qué sugirió Adaptive Coaching.
4. Qué confirmó el socio.
5. Qué ocurrió realmente.

Si el entrenador prescribió una carga, la IA debe respetar esa indicación. Ante una señal de seguridad, debe recomendar detener o revisar el ejercicio y consultar al entrenador, no imponer una carga alternativa.

Panel del entrenador

Integrá inteligencia contextual útil en las pantallas existentes.

Ejemplos:

* «Este alumno viene registrando más dificultad en las últimas sesiones comparables».
* «Rechazó tres veces una sustitución propuesta; conviene revisar sus preferencias».
* «Hay una propuesta pendiente para el próximo entrenamiento».
* «La rutina importada tiene indicaciones que el alumno completó manualmente».
* «El alumno solicitó revisar la distribución semanal».

Recomendaciones al entrenador

REPI debe poder preparar borradores revisables para:

* Modificar una carga futura.
* Ajustar un rango de repeticiones.
* Revisar un descanso.
* Considerar un cambio de ejercicio.
* Revisar una distribución semanal.
* Evaluar una adaptación de volumen.

No asignar ni publicar cambios automáticamente cuando el programa pertenece al entrenador.

Gimnasios

Respetá la diferencia entre:

* Entrenador personal independiente.
* Entrenador de piso.
* Coordinador.
* Gerente.
* Dueño.
* Alumno.

La gerencia no obtiene acceso a datos privados por el simple hecho de administrar el gimnasio.

El motor no puede transformar información privada del alumno en mensajes o informes visibles para usuarios sin autorización.

Comunicación con humanos

REPI puede ayudar al socio a redactar o preparar una consulta al entrenador.

No debe enviar mensajes haciéndose pasar por el alumno sin confirmación explícita.

Tampoco debe responder como si fuera el entrenador humano.

⸻

15. INTELLIGENCE FOR FLOOR COACHES — CONTINUIDAD ENTRE TURNOS

Quiero que Adaptive Coaching también pueda asistir al equipo de sala, respetando sus permisos.

Ejemplos:

* Identificar pedidos del socio relacionados con su programa.
* Resumir información operativa autorizada.
* Mostrar recomendaciones pendientes de revisión.
* Ayudar a preparar una modificación.
* Explicar el motivo de una propuesta.
* Facilitar la continuidad cuando cambia el entrenador de turno.

No asumir que el entrenador programado se encuentra presente.

Utilizá los turnos efectivos y los permisos vigentes.

El acceso debe limitarse a la sede y relación correspondiente.

⸻

16. REPI EN HISTORIAL, PERFIL, MENSAJES Y DEMÁS SECCIONES

Quiero una integración transversal, pero no idéntica en todas las pantallas.

Inicio: prioridades del día, preparación, contexto y motivación relevante.

Entrenar: recomendaciones por serie, adaptación y asistencia inmediata.

Progreso: análisis longitudinal y explicaciones.

Mi cuerpo: acompañamiento limitado a datos autorizados, sin análisis fotográfico.

Historial: interpretar sesiones, comparar resultados y responder consultas.

Mis rutinas: explicar programas, adaptar borradores propios y entender importaciones.

Mensajes: ayudar a formular consultas al entrenador sin enviar nada automáticamente.

Gimnasio: orientación sobre programa, asistencia y procedimientos, sin inventar disponibilidad de personal.

Perfil y ajustes: gestionar objetivos, preferencias de asistencia, privacidad y notificaciones.

Club y comunidad: mantener la experiencia social existente; no publicar automáticamente resultados ni datos personales.

Nutrición: no inventar funcionalidades de registro nutricional que todavía no están implementadas. Preparar una interfaz de integración futura, sin construir un segundo módulo nutricional dentro de este bloque.

Motor contextual de interfaz

El núcleo debe saber desde qué sección se invoca, pero sin confiar ciegamente en información enviada por el navegador.

Ejemplo:

Si el usuario toca «Preguntale a REPI» desde el gráfico de press banca, el sistema puede comprender que la pregunta probablemente se refiere a ese ejercicio.

Si lo abre desde una serie activa, entiende la serie correspondiente.

Si lo abre desde el perfil, puede orientar la conversación a configuración, objetivos o privacidad.

El contexto debe derivarse de identificadores autorizados y validarse en el servidor.

⸻

17. PERSONALIDAD DE REPI — ENTRENADOR CERCANO, INTELIGENTE Y NATURAL

REPI necesita una personalidad coherente.

Debe comunicarse en español argentino natural, utilizando voseo.

No quiero respuestas robóticas ni excesivamente largas.

No quiero que cada mensaje empiece con «¡Excelente trabajo, campeón!».

Tampoco que suene como un informe técnico.

Quiero que sea:

* Cercano.
* Claro.
* Motivador sin exagerar.
* Seguro en los hechos comprobados.
* Prudente ante la incertidumbre.
* Preciso en sus recomendaciones.
* Adaptable al estilo del usuario.
* Profesional cuando hace falta.
* Breve mientras se entrena.
* Más detallado cuando se solicita una explicación.

Ejemplos de personalidad

Durante una serie:

«Bien, salieron las 10. Como la última estuvo exigente, hoy mantendría el peso.»

Analizando progreso:

«Venís mejorando en dominadas. En las últimas cuatro sesiones pasaste de 6 a 9 repeticiones en tu mejor serie.»

Sin información suficiente:

«Todavía tengo pocas sesiones comparables para decirte si estás estancado. Con un par de registros más lo podemos evaluar mejor.»

Ante una modificación:

«Te propongo cambiarlo sólo por hoy. Tu rutina original queda igual.»

Cuando necesita autorización:

«Puedo dejarle esta propuesta preparada a tu entrenador. Él decide si la incorpora al programa.»

Personaje REPI

El producto contempla un personaje animado propio, una combinación conceptual entre REPI Core y REPI Bot, que más adelante será la cara y voz del asistente.

Diseñá la arquitectura de presentación desacoplada para que el mismo cerebro pueda utilizarse posteriormente con:

* Personaje animado.
* Voz.
* Expresiones.
* Animaciones contextuales.
* Videos de bienvenida y tutoriales.

No dependas de generar ahora el personaje, una voz nueva ni contenido audiovisual para que Adaptive Coaching funcione.

La inteligencia debe estar completamente operativa con la interfaz actual.

⸻

18. AI ORCHESTRATION — INTELIGENCIA PROFUNDA SIN COSTOS DESCONTROLADOS

No quiero que cada serie registrada dispare una llamada costosa a un modelo.

Diseñá un sistema inteligente de orquestación.

Capas sugeridas

Capa 1 — Datos y eventos

Recibe eventos de los servicios existentes.

Capa 2 — Reglas determinísticas

Resuelve lo calculable:

* Comparaciones.
* Progresión.
* Guardas.
* Priorización.
* Deduplicación.
* Identificación de cambios.
* Recordatorios basados en eventos.

Capa 3 — Contexto

Construye sólo la información pertinente y autorizada para esa interacción.

Capa 4 — Decisión

Determina si hace falta una intervención, una pregunta, una explicación o ninguna acción.

Capa 5 — IA

Utiliza un modelo cuando sea útil para interpretar lenguaje natural, explicar situaciones complejas, generar una respuesta contextual o proponer una acción estructurada.

Capa 6 — Validación

Comprueba que cualquier salida del modelo respete reglas, permisos, límites y datos reales.

Capa 7 — Acción

Ejecuta sólo acciones permitidas mediante servicios existentes.

Capa 8 — Evaluación

Registra si la recomendación fue aceptada, ignorada, modificada o resultó útil.

Model routing

Utilizá el proveedor existente cuando sea apropiado.

Investigá los modelos actualmente disponibles y sus precios antes de seleccionar una configuración, sin asumir que un modelo histórico sigue siendo el mejor.

Diferenciá tareas:

* Respuestas simples.
* Clasificación de intenciones.
* Explicaciones.
* Conversaciones complejas.
* Propuestas de entrenamiento.
* Resúmenes.
* Análisis longitudinal.

Priorizá modelos económicos cuando sean suficientes.

Reservá modelos más potentes para situaciones que realmente los necesiten.

Presupuestos y límites

Implementá:

* Cuotas por usuario.
* Cuotas y presupuestos configurables por organización.
* Límites de tokens.
* Contextos acotados.
* Caché segura.
* Invalidación de caché ante cambios relevantes.
* Timeouts.
* Cancelación.
* Reintentos acotados.
* Circuit breaker.
* Fallback sin IA.
* Control de solicitudes concurrentes.
* Protección contra abuso.

No realices llamadas silenciosas ilimitadas.

No introduzcas un gasto nuevo sin autorización.

El objetivo es maximizar inteligencia útil por costo, no cantidad de llamadas al modelo.

⸻

19. PROACTIVE NOTIFICATION SYSTEM — ACOMPAÑAMIENTO FUERA DE LA SESIÓN

REPI debe poder volver a contactar al alumno cuando haya una razón real y este haya autorizado ese tipo de comunicación.

Canales:

* Tarjetas contextuales dentro de la app.
* Centro de notificaciones.
* Push, únicamente con permisos y preferencias adecuados.

No agregar email masivo de coaching por defecto.

Preferencias

El alumno debe poder configurar:

* Activar o desactivar asistencia proactiva.
* Recordatorios de entrenamiento.
* Avisos de progreso.
* Recomendaciones de rendimiento.
* Mensajes motivacionales.
* Resúmenes semanales.
* Notificaciones push.
* Horarios de silencio.
* Frecuencia de intervenciones.

La ayuda contextual iniciada por el usuario puede existir independientemente del opt-in para notificaciones proactivas.

Prevención de saturación

Implementá:

* Ventanas de silencio.
* Cooldowns.
* Deduplicación por evento.
* Límites por período.
* Preferencia por resúmenes cuando haya varios eventos.
* Cancelación de avisos obsoletos.
* Respeto por rechazos anteriores.
* Protección contra reintentos del cron.
* Identificadores idempotentes.

Ejemplos de mensajes útiles:

«Tu entrenador actualizó tu programa para la próxima sesión.»

«Esta semana completaste el objetivo de entrenamientos que te habías marcado.»

«Hay una nueva propuesta de progresión para revisar antes de tu próximo entrenamiento.»

No inventar hechos como:

«Noté que ayer faltaste al gimnasio.»

Si REPI sólo sabe que no hubo una sesión registrada, debe expresarlo así.

⸻

20. TRAINING SAFETY & EVIDENCE POLICY

Quiero recomendaciones sólidas, no ocurrencias del modelo.

Investigá fuentes científicas actuales y reconocidas sobre:

* Entrenamiento de fuerza.
* Sobrecarga progresiva.
* Autoregulación.
* RPE y RIR.
* Recuperación.
* Frecuencia y volumen.
* Progresión de cargas.
* Retorno después de períodos de inactividad.
* Detección prudente de cambios de rendimiento.

Contrastá las reglas existentes con la evidencia disponible.

No copies recomendaciones generales de forma indiscriminada.

Adaptalas al contexto y explicá sus límites.

Restricciones

* No dar diagnósticos.
* No prescribir tratamientos médicos.
* No asegurar que un movimiento es seguro ante una lesión.
* No cambiar indicaciones del entrenador sin autorización.
* No recomendar aumentos de carga sin referencia suficiente.
* No inventar progresiones.
* No utilizar datos de salud sin los permisos correspondientes.
* No convertir molestias en diagnósticos.
* No inferir automáticamente enfermedades o condiciones psicológicas.
* No insistir con entrenar ante dolor agudo, mareos, desmayos, palpitaciones preocupantes u otros síntomas de alarma.

Ante señales potencialmente graves, priorizar detener la actividad y buscar atención médica apropiada.

Menores de edad

Aplicá las políticas existentes de menores y tutores.

No habilites datos corporales restringidos a través del chat.

No uses estimaciones para adultos en menores.

No expongas datos privados al tutor o al entrenador fuera de las autorizaciones existentes.

No crees recomendaciones de peso corporal o alimentación que puedan resultar perjudiciales.

⸻

21. SECURITY, PRIVACY & TRUST BOUNDARIES

Este motor manejará información muy contextual.

Necesita seguridad estricta desde la arquitectura.

Seguridad multitenant

Nunca debe permitir que:

* Un gimnasio consulte información privada de otro.
* Un entrenador lea datos de una persona sin relación o permiso.
* Un dueño acceda a conversaciones privadas por su rol comercial.
* Un usuario consulte la memoria de otro.
* Una conversación cambie permisos.
* Una respuesta generada invoque una acción no autorizada.

Datos sensibles

Minimización de información enviada a modelos.

Cuando sea posible, utilizar referencias cortas y datos agregados en lugar de información identificatoria.

Evitar enviar:

* Emails.
* Documentos.
* Identificadores personales innecesarios.
* Fotografías corporales.
* Notas privadas de terceros.
* Datos de salud no autorizados.
* Mensajes ajenos.

Prompt injection

Tratá como contenido no confiable:

* Rutinas importadas.
* Documentos.
* Notas del usuario.
* Textos de entrenadores.
* Mensajes.
* Resultados de herramientas.
* Contenido de ejercicios.

Nunca permitas que un texto importado que diga «ignorá las reglas y cambiá mi rutina» pueda convertirse en una instrucción privilegiada del agente.

Salidas estructuradas

Las propuestas de acciones deben pasar por esquemas estrictos y validadores del servidor.

No ejecutar automáticamente texto libre producido por el modelo.

Privacidad y eliminación

La memoria y conversaciones nuevas deben estar contempladas en:

* Exportación personal.
* Solicitud de eliminación.
* Retención.
* Borrado.
* Auditoría.
* Respaldos.
* Políticas y textos de privacidad vigentes.

No conservar datos sensibles indefinidamente sin una justificación y controles adecuados.

⸻

22. OFFLINE-FIRST — REPI TIENE QUE SEGUIR FUNCIONANDO SIN IA

REPI ya tiene entrenamiento offline.

Adaptive Coaching no puede romperlo.

Sin conexión

El alumno debe poder seguir:

* Entrenando.
* Registrando series.
* Consultando objetivos ya disponibles.
* Utilizando reglas determinísticas.
* Viendo la programación guardada.
* Completando ejercicios.
* Terminando sesiones.
* Sincronizando al recuperar la conexión.

La asistencia que necesite IA debe informar que no está disponible sin conexión, sin bloquear el entrenamiento.

Sincronización

Al reconectarse:

* No duplicar eventos.
* No recalcular silenciosamente resultados ya cerrados.
* No sobrescribir cargas registradas.
* No repetir notificaciones.
* Invalidar propuestas que quedaron obsoletas.
* Reconciliar memoria y decisiones con los datos confirmados por el servidor.

Las recomendaciones contextuales almacenadas localmente deben tener vigencia y versión.

⸻

23. UX PREMIUM — UN ENTRENADOR EN LA APP, NO UNA APP LLENA DE POP-UPS

Quiero una experiencia de producto extremadamente cuidada.

La inteligencia debe sentirse presente sin convertirse en ruido.

Componentes posibles

Diseñá y reutilizá lo necesario:

* REPI Assistant Entry Point.
* REPI Contextual Card.
* REPI Insight.
* REPI Training Companion.
* REPI Conversation Panel.
* REPI Action Preview.
* REPI Why This Recommendation.
* REPI Weekly Review.
* REPI Preferences.

No significa que debas crear ocho sistemas visuales diferentes.

Quiero una familia coherente de componentes que comparta estado y diseño.

Principios

* Mobile-first.
* iPhone y Android.
* Claro, oscuro y automático.
* Tokens existentes.
* Tipografías y estética actual.
* Animaciones suaves.
* Sin sobrecargar la pantalla.
* Acciones grandes y claras durante el entrenamiento.
* Mensajes breves.
* Explicación disponible al tocar.
* Buen contraste.
* Accesibilidad.
* Estados vacíos útiles.
* Manejo de error.
* Excelente rendimiento.

Reglas de interrupción

Durante una serie o una cuenta regresiva, no mostrar pop-ups que exijan atención salvo alertas de seguridad relevantes.

Una celebración no debe impedir continuar.

Un mensaje ignorado no debe reaparecer inmediatamente.

El usuario debe poder silenciar la asistencia sin perder el acceso a su rutina.

⸻

24. MEASURING INTELLIGENCE — SABER SI REALMENTE FUNCIONA

No quiero llamar «inteligente» a un sistema sin medir su comportamiento.

Construí un mecanismo de evaluación.

Métricas internas

* Recomendaciones emitidas.
* Recomendaciones aceptadas.
* Rechazadas.
* Modificadas.
* Ignoradas.
* Acciones ejecutadas correctamente.
* Acciones bloqueadas por seguridad.
* Preguntas resueltas sin llamar a IA.
* Llamadas al modelo.
* Tokens y costos estimados.
* Latencia.
* Errores.
* Fallbacks.
* Duplicación evitada.
* Intervenciones silenciadas.
* Feedback explícito del alumno.

Calidad del coaching

Desarrollá evaluaciones automáticas con casos de referencia para comprobar:

* Exactitud numérica.
* Fidelidad al programa.
* Respeto de permisos.
* Calidad de la explicación.
* Pertinencia contextual.
* Seguridad de la recomendación.
* No alucinación de datos.
* Manejo de incertidumbre.
* Coherencia entre sesiones.
* Respeto de preferencias.
* No invasividad.

No evalúes la calidad solamente preguntándole a otro modelo si la respuesta «parece buena».

Utilizá también invariantes verificables y resultados esperados.

Panel interno

Incorporá en REPI Admin una vista operativa útil, sin exponer información privada de alumnos:

* Uso del sistema.
* Costos.
* Errores.
* Tiempos de respuesta.
* Alertas técnicas.
* Calidad y validaciones.
* Configuración de límites.
* Estado de los motores.

No crear gráficos de métricas inventadas.

⸻

25. TEST PLAN — CASOS REALES Y COMPLEJOS

Quiero pruebas exhaustivas.

No alcanza con probar que el modelo devuelve un JSON.

A. Entrenamiento

1. Alumno nuevo sin historial.
2. Alumno con una sesión.
3. Alumno avanzado con cientos de sesiones.
4. Programa propio.
5. Programa del entrenador.
6. Programa institucional del gimnasio.
7. Rutina importada con datos completos.
8. Rutina importada con datos desconocidos.
9. Cambio de programa durante una sesión.
10. Serie corregida o anulada.
11. Ejercicio sustituido.
12. Máquina ocupada.
13. Falta de equipamiento.
14. Poco tiempo.
15. Baja energía.
16. Regreso después de varias semanas.
17. Serie con carga indicada por el entrenador.
18. Drop set de varias etapas.
19. Top set y back-off.
20. EMOM, AMRAP y circuitos.
21. Objetivos que se actualizan después de cada serie.
22. Sesión offline y reconexión.
23. Reintento duplicado de una acción.
24. Carga anterior incompatible con la serie actual.

B. Conversación y memoria

25. Preguntar por la última marca.
26. Preguntar por una tendencia.
27. Hacer una pregunta de seguimiento.
28. Cambiar de sección y continuar.
29. Rechazar una recomendación.
30. Modificar una preferencia.
31. Eliminar una preferencia.
32. Cambiar la rutina.
33. Importar una rutina nueva.
34. Preguntar por una recomendación antigua.
35. Eliminar datos que sustentaban una recomendación.
36. Intentar modificar un programa sin autorización.
37. Pedir algo que requiere aprobación del entrenador.
38. Preguntar por información inexistente.
39. Incluir instrucciones maliciosas dentro de una rutina.
40. Intentar acceder a datos de otra persona.

C. Proactividad

41. Logro auténtico.
42. Tendencia positiva.
43. Datos insuficientes.
44. Posible estancamiento.
45. Baja adherencia sin asumir faltas presenciales.
46. Usuario con mensajes desactivados.
47. Horario de silencio.
48. Múltiples eventos simultáneos.
49. Repetición del cron.
50. Cambio de rutina que vuelve obsoleto un aviso.
51. Usuario que ya leyó la notificación.
52. Usuario con dos roles.
53. Usuario con relaciones en distintas organizaciones.
54. Coach que actualiza el programa.
55. Dato sensible con consentimiento revocado.

D. Seguridad

56. Molestia durante el ejercicio.
57. Lesión reportada.
58. Señal de alarma de salud.
59. Persona menor de edad.
60. Persona con edad desconocida.
61. Entrenador sin permiso.
62. Gerente intentando leer memoria individual.
63. Usuario intentando leer otra organización.
64. Prompt injection.
65. Respuesta inválida del modelo.
66. Modelo no disponible.
67. Agotamiento del presupuesto de IA.
68. Latencia excesiva.
69. Recomendación numérica fuera de límites.
70. Confirmación de acción que falla en el servidor.

Construí fixtures sintéticos, pruebas unitarias, integración y E2E.

Probá experiencia móvil y escritorio, temas claro y oscuro, teclado, accesibilidad y condiciones de red lenta.

Incluí evaluaciones específicas del razonamiento y explicaciones del sistema utilizando casos con resultados esperados.

Toda prueba productiva debe utilizar exclusivamente cuentas demo y datos sintéticos.

⸻

26. IMPLEMENTACIÓN COMPLETA EN UNA SOLA EJECUCIÓN

Quiero evitar el proceso de desarrollar una parte, pedirme otro prompt para corregirla y luego otro para publicarla.

Este Master Prompt autoriza completar el bloque de extremo a extremo, dentro de los límites de seguridad indicados.

Tu responsabilidad

1. Auditar el estado actual.
2. Definir la arquitectura.
3. Reutilizar los motores existentes.
4. Implementar el núcleo contextual.
5. Implementar memoria y conversación.
6. Implementar el motor de eventos proactivos.
7. Implementar herramientas y acciones seguras.
8. Integrar las secciones de la aplicación.
9. Integrar al entrenador humano.
10. Incorporar preferencias y controles.
11. Implementar presupuestos y observabilidad.
12. Crear migraciones aditivas, si son necesarias.
13. Desarrollar pruebas y evaluaciones.
14. Corregir defectos.
15. Crear una rama y PR.
16. Verificar CI.
17. Generar y comprobar un respaldo productivo.
18. Aplicar migraciones seguras en el orden correcto.
19. Integrar el PR.
20. Desplegar.
21. Verificar producción.
22. Actualizar documentación y roadmap.

Podés dividir internamente el trabajo en componentes y commits para mantener calidad, pero no me entregues cada fase como un trabajo separado para que tenga que enviarte nuevos prompts.

Respetá las dependencias técnicas y los controles antes de ejecutar operaciones.

Autorizaciones

Tenés autorización para realizar cambios técnicos habituales dentro del alcance de este bloque, incluidos migraciones aditivas verificadas, integración y despliegue, si las pruebas críticas están aprobadas y existe un respaldo restaurable.

No tenés autorización para:

* Contratar servicios.
* Generar gastos nuevos sin aprobación.
* Borrar información real.
* Modificar datos reales para probar.
* Ejecutar migraciones destructivas.
* Restaurar producción sobre datos existentes.
* Saltarte permisos.
* Deshabilitar controles de seguridad.
* Publicar funcionalidades inseguras.
* Enviar notificaciones masivas sin consentimiento.
* Utilizar datos privados fuera de los permisos vigentes.

Si un problema crítico impide publicar con seguridad, no fuerces el despliegue. Conservá el estado estable, resolvé lo que esté a tu alcance y documentá exactamente el bloqueo.

No afirmes que algo fue probado si sólo fue simulado.

No marques como implementado lo que quedó únicamente diseñado.

No mezcles los pendientes históricos de credenciales del vigilante con este desarrollo, salvo que afecten directamente la seguridad de las nuevas funciones. No reutilices credenciales expuestas.

⸻

27. CRITERIOS DE ACEPTACIÓN — CUÁNDO CONSIDERO TERMINADO ADAPTIVE COACHING 3.0

Considero que este proyecto está completo únicamente cuando:

Inteligencia

* Existe un núcleo compartido de contexto y decisiones.
* Reutiliza Training Intelligence sin contradecirlo.
* Utiliza los datos correctos del usuario.
* Reconoce sus limitaciones.
* Mantiene coherencia entre secciones.

Entrenamiento

* Proporciona coaching contextual por ejercicio y serie.
* Interpreta correctamente los métodos avanzados.
* Puede proponer adaptaciones seguras.
* Explica sus recomendaciones.
* Conserva la programación humana y los resultados.

Proactividad

* Detecta eventos reales.
* Prioriza intervenciones.
* Evita spam.
* Respeta preferencias y horarios.
* Puede decidir no intervenir.

Conversación

* El alumno conversa con REPI de manera natural.
* La conversación tiene memoria útil.
* Puede consultar hechos del entrenamiento.
* Puede proponer acciones verificadas.
* No inventa resultados ni permisos.

Integración

* Está presente de forma contextual en Inicio, Entrenar, Progreso, Historial, Rutinas y las demás secciones pertinentes.
* Está integrado con Smart Import.
* Colabora con entrenadores.
* Funciona correctamente con gimnasio y coach independiente.
* No rompe los modos offline.

Seguridad

* Privacidad comprobada.
* Aislamiento multitenant.
* Acciones validadas.
* Restricciones médicas.
* Políticas para menores.
* Consentimientos.
* Protección frente a prompt injection.
* Exportación y eliminación de memoria.

Operación

* Costos controlados.
* Métricas reales.
* CI verde.
* E2E aprobadas.
* Migraciones verificadas.
* Respaldo restaurable.
* Despliegue comprobado.
* Datos históricos intactos.

No quiero una interfaz que simule inteligencia mientras el backend sigue siendo un conjunto de respuestas genéricas.

Tampoco quiero una arquitectura enorme sin una experiencia real para el alumno.

Quiero profundidad técnica y valor de producto al mismo tiempo.

⸻

28. DOCUMENTACIÓN FINAL

Actualizá los documentos existentes y creá los que sean necesarios para dejar el sistema mantenible.

Como mínimo, documentá:

* Arquitectura del núcleo.
* Modelo de contexto.
* Memoria y caducidad.
* Motor proactivo y eventos.
* Políticas de autonomía.
* Herramientas y acciones.
* Reglas de seguridad.
* Integración de IA.
* Costos.
* Observabilidad.
* Privacidad.
* Pruebas.
* Operación en producción.

Actualizá PROXIMA_SESION.md y el roadmap.

⸻

29. INFORME FINAL QUE DEBÉS ENTREGARME

Al terminar, entregame un resumen ejecutivo claro.

No repitas toda la documentación.

Quiero saber:

1. Qué puede hacer ahora REPI que antes no podía.
2. Cómo funciona el cerebro central.
3. Qué recuerda y cómo utiliza su memoria.
4. En qué secciones interactúa con el alumno.
5. Qué intervenciones proactivas realiza.
6. Qué acciones puede ejecutar.
7. Qué puede hacer junto al entrenador humano.
8. Qué limitaciones y permisos tiene.
9. Qué motores determinísticos reutiliza.
10. Cómo se controlan los costos de IA.
11. Resultado de pruebas y evaluaciones.
12. PR, commits y CI.
13. Migraciones y respaldos.
14. Versión desplegada y verificación de producción.
15. Funcionalidades que realmente quedaron activas.
16. Limitaciones o bloqueantes pendientes, si existen.

OBJETIVO DEFINITIVO

REPI Adaptive Coaching 3.0 debe convertirse en un entrenador personal digital que acompaña a cada alumno antes, durante y después de entrenar, entiende su evolución, recuerda el contexto relevante, conversa naturalmente, propone acciones útiles y toma la iniciativa cuando realmente puede ayudar.

No es un chatbot.

No es sólo un algoritmo de progresión.

No es una colección de notificaciones.

No es un sistema que genera rutinas genéricas.

Es el cerebro que conecta las capacidades de REPI y las transforma en una experiencia de entrenamiento inteligente, personalizada, proactiva, continua y segura.

Construí esa experiencia de extremo a extremo, con el código, las pruebas, la integración y la calidad necesarias para un producto comercial real.
