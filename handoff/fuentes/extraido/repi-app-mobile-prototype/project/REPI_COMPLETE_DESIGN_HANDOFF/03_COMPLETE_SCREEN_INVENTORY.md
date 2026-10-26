# 03 · Inventario completo de pantallas

Fuente: `screens.json` (mismos datos). Estados: Diseñado · Prototipo interactivo · Mockup estático · Especificado, no diseñado · Parcialmente diseñado · Concepto futuro · No definido.

> Un "Prototipo interactivo" es HTML navegable con datos ficticios; **no** es una implementación productiva (sin backend, auth ni persistencia real).

## App del alumno (móvil, oscuro)

### SCR-M-01 · Intro / splash de marca
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(app boot)` · **Módulo:** Marca · **Rol:** Todos (app alumno) · **Dispositivo:** mobile
- **Propósito y composición:** Animación de apertura 1a: primer inicio cinemático (~2,6 s, saltable), inicio regular (~0,5 s), movimiento reducido (fade). Termina en Inicio real con el logo viajando al encabezado.
- **Datos:** localStorage repi_intro_seen, prefers-reduced-motion, sesión activa
- **Acciones:** Saltar; reproducir de nuevo desde Perfil
- **Navegación:** → SCR-M-02
- **Permisos:** Ninguno
- **Estados (carga/vacío/error/éxito/validación):** Sin carga artificial; no se reproduce con entrenamiento activo
- **Animaciones:** AN-01, AN-02, AN-03, AN-06
- **Features:** F-BR-02
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-02 · Inicio del alumno
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app` · **Módulo:** Entrenamiento (alumno) · **Rol:** Alumno / socio · **Dispositivo:** mobile
- **Propósito y composición:** Saludo, entrenamiento de hoy (CTA play), semana, tarjetas de progreso, acceso a Mi cuerpo, último mensaje del coach, avatar→Perfil, campana→Notificaciones.
- **Datos:** Plan del día, semana, entrenamientos semana, volumen vs mes, último mensaje, notificaciones
- **Acciones:** Comenzar entrenamiento, ir a Entrenar/Progreso/Mi cuerpo/Mensajes/Perfil
- **Navegación:** SCR-M-03,04,06,07,17,18,24
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Empty: no especificado; success: n/a
- **Animaciones:** AN-06, AN-07
- **Features:** F-CL-01
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-03 · Entrenar · semana y detalle de día
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/train` · **Módulo:** Entrenamiento (alumno) · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Selector semanal (7 días), detalle del día: nombre, ejercicios con valores anteriores y descansos, indicación del coach; estado de descanso.
- **Datos:** Programa asignado, ejercicios, últimos registros
- **Acciones:** Elegir día, Comenzar entrenamiento
- **Navegación:** SCR-M-04
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Día de descanso como estado propio
- **Animaciones:** AN-07
- **Features:** F-CL-02
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-04 · Entrenamiento activo · registro de series
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/workout/:sessionId` · **Módulo:** Entrenamiento (alumno) · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Ejercicio actual (tarjeta clara), video placeholder, serie anterior, tabla de series, steppers peso ±2,5 kg / reps ±1, completar serie en un toque, temporizador de descanso circular (pausar/+30s/saltar) basado en reloj real, navegación entre ejercicios, indicador "Guardado".
- **Datos:** SetPrescription, SetLog previos, temporizador
- **Acciones:** Completar serie, editar serie, saltar descanso, +30s, pausar, ejercicio anterior/siguiente, Finalizar
- **Navegación:** SCR-M-05, SCR-M-03
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Autosave indicado ("Guardado"); offline no prototipado
- **Animaciones:** AN-09, AN-10, AN-07
- **Features:** F-CL-03, F-CL-04
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-05 · Entrenamiento completado
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/workout/:id/summary` · **Módulo:** Entrenamiento (alumno) · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Resumen: duración, ejercicios, series; tarjeta de récord personal solo si la mejor serie supera el récord previo (85 kg × 6); resumen por ejercicio.
- **Datos:** Sesión, PR calculado
- **Acciones:** Ver progreso, Volver al inicio
- **Navegación:** SCR-M-06, SCR-M-02
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** PR solo si validado contra datos
- **Animaciones:** AN-11, AN-12
- **Features:** F-CL-05
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-06 · Progreso (Fuerza/Volumen/Constancia/Medidas)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/progress?tab=` · **Módulo:** Progreso · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Fuerza: selector de ejercicio, rangos 3M/6M/1A, gráfico de línea con tooltip, máximo personal, historial. Volumen: barras 8 semanas + desglose. Constancia: grilla 28 días (completado / planificado no hecho / descanso). Medidas: meta con progreso, lista con fuente y fecha, "% grasa: datos insuficientes".
- **Datos:** Series históricas, volumen = series×reps×peso, adherencia, medidas con fuente
- **Acciones:** Cambiar pestaña, ejercicio, rango; ir a Mi cuerpo
- **Navegación:** SCR-M-07/15
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** "Datos insuficientes" para métricas no medibles
- **Animaciones:** AN-13, AN-14, AN-15
- **Features:** F-CL-06
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-07 · Mi cuerpo · introducción
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body/intro` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Explica: privado por defecto, sin fotos obligatorias, seguimiento no diagnóstico. CTA elegir qué guardar / Ahora no.
- **Datos:** —
- **Acciones:** Elegir qué guardar, Ahora no
- **Navegación:** SCR-M-08, SCR-M-02
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-08
- **Features:** F-BI-01
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-08 · Mi cuerpo · consentimiento por tipo de dato
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body/consent` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** 6 toggles, todos apagados por defecto: medidas, fotos, escaneos 3D, informes de composición, documentos de laboratorio, procesamiento con IA. "Guardar no es compartir".
- **Datos:** MemberConsent (storage)
- **Acciones:** Activar/desactivar, continuar (requiere ≥1)
- **Navegación:** SCR-M-09
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Validación: al menos un dato activo
- **Animaciones:** AN-08
- **Features:** F-BI-02
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-09 · Mi cuerpo · método
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body/method` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Medidas manuales (2 min), Fotos de progreso (3 min), Captura 3D avanzada (Experimental). Métodos sin consentimiento aparecen deshabilitados y redirigen a consentimiento.
- **Datos:** Consentimientos
- **Acciones:** Elegir método
- **Navegación:** SCR-M-10/11
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Bloqueo por consentimiento
- **Animaciones:** AN-08
- **Features:** F-BI-03
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-10 · Mi cuerpo · medidas manuales
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body/manual` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Peso, brazo derecho, cintura, pecho; ¿quién midió? (yo / profesional).
- **Datos:** BodyMeasurement + fuente
- **Acciones:** Guardar medidas
- **Navegación:** SCR-M-15
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-08
- **Features:** F-BI-04
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-11 · Mi cuerpo · captura guiada (4 poses)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body/capture` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Vista de cámara simulada con silueta guía, chequeos de luz/distancia/encuadre/nitidez, mensaje por pose, disparador, progreso 4 poses. Simula 1 fallo de nitidez en pose 3. No requiere ropa interior.
- **Datos:** —
- **Acciones:** Capturar, repetir
- **Navegación:** SCR-M-12
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Error de calidad (nitidez baja)
- **Animaciones:** AN-08
- **Features:** F-BI-05
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-12 · Mi cuerpo · revisión de fotos
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body/review` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Grilla 4 vistas con "Repetir", aviso de cifrado y estado de compartido con el coach.
- **Datos:** ProgressPhoto
- **Acciones:** Repetir foto, Guardar evaluación
- **Navegación:** SCR-M-13
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-08
- **Features:** F-BI-05
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-13 · Mi cuerpo · procesando
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body/processing` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Barra de progreso con pasos (cifrar y subir, alinear/verificar ángulos, guardar/reconstruir).
- **Datos:** —
- **Acciones:** —
- **Navegación:** SCR-M-15 / SCR-M-14
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Loading
- **Animaciones:** —
- **Features:** F-BI-05, F-BI-06
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-14 · Mi cuerpo · fallo de reconstrucción 3D
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body/failed` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Estado honesto: cobertura insuficiente (4 de 24), luz distinta, función experimental no disponible; fotos guardadas igual.
- **Datos:** —
- **Acciones:** Usar modelo de referencia, Intentar de nuevo
- **Navegación:** SCR-M-15, SCR-M-11
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Error state
- **Animaciones:** AN-08
- **Features:** F-BI-06
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-15 · Mi cuerpo · visor 3D
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Visor three.js con cuerpo genérico de primitivas (etiquetado "Modelo genérico de referencia" o "Avatar ajustado… aproximado"), rotación por arrastre, pinch/rueda, +/−, reset, vistas Frente/Espalda/Izq./Der., capas Exterior/Músculos/Composición, 9 regiones tocables con chips, panel de región (series semana, tendencia de fuerza, medida relacionada, aviso), composición "Datos insuficientes", cambios recientes, selector de fecha, comparar.
- **Datos:** Training load por región, medidas, fechas de evaluación
- **Acciones:** Rotar, zoom, elegir vista/capa/región/fecha, Comparar, Nueva evaluación, Subir evaluación (no implementado)
- **Navegación:** SCR-M-16, SCR-M-09
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Fallback sin WebGL: mensaje + lista de zonas
- **Animaciones:** AN-16, AN-17, AN-18
- **Features:** F-BI-07, F-BI-08
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-16 · Comparar fechas (hoja inferior)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/body/compare` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Comparador deslizante de fotos 12 mar vs 20 may, aviso de iluminación distinta, deltas de medidas.
- **Datos:** ProgressPhoto ×2, medidas
- **Acciones:** Arrastrar divisor, Listo
- **Navegación:** SCR-M-15
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Advertencia de comparabilidad
- **Animaciones:** AN-20
- **Features:** F-BI-09
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-17 · Mensajes con el coach
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/messages` · **Módulo:** Mensajería · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Chat 1:1 con el entrenador; respuesta automática simulada.
- **Datos:** Conversation, Message
- **Acciones:** Escribir, enviar (Enter)
- **Navegación:** —
- **Permisos:** Participantes
- **Estados (carga/vacío/error/éxito/validación):** Empty no especificado
- **Animaciones:** —
- **Features:** F-MS-01
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-18 · Perfil y privacidad
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/profile` · **Módulo:** Privacidad · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Datos del alumno, coach, toggles de compartir por tipo de dato (solo si está guardado), historial de accesos, recordatorio de evaluación, celebraciones on/off, ver intro de nuevo, exportar datos (simulado), eliminar datos de Mi cuerpo (simulado).
- **Datos:** MemberConsent (share), AccessAuditEvent
- **Acciones:** Compartir/revocar, cambiar recordatorio, toggles
- **Navegación:** —
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-PR-01, F-PR-02
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-19 · Gym · Novedades y descuentos
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/gym?tab=news` · **Módulo:** Comunidad gym · **Rol:** Socio de gym · **Dispositivo:** mobile
- **Propósito y composición:** Feed de publicaciones del gym (novedad/descuento con etiqueta e imagen).
- **Datos:** GymPost (RepiShared)
- **Acciones:** —
- **Navegación:** —
- **Permisos:** Socios de la org
- **Estados (carga/vacío/error/éxito/validación):** Sin empty state diseñado
- **Animaciones:** AN-07
- **Features:** F-GC-01
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-20 · Gym · Desafíos
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/gym?tab=ch` · **Módulo:** Comunidad gym · **Rol:** Socio de gym · **Dispositivo:** mobile
- **Propósito y composición:** Desafíos con regla, récord del gym y titular, premio (retiro en recepción), fecha; estado propio (En revisión / Validado / No aprobado + motivo).
- **Datos:** GymChallenge, ChallengeAttempt
- **Acciones:** Subir intento / Intentar de nuevo / Superar mi marca
- **Navegación:** SCR-M-21
- **Permisos:** Socios de la org
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-GC-02, F-GC-03
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-21 · Subir intento de récord (hoja)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/gym/challenge/:id/attempt` · **Módulo:** Comunidad gym · **Rol:** Socio de gym · **Dispositivo:** mobile
- **Propósito y composición:** Regla, grabar/elegir video (capture=environment), vista previa, marca numérica, confirmación de autoría/intento completo, subida con progreso, enviado.
- **Datos:** Video (IndexedDB en prototipo), valor
- **Acciones:** Elegir video, cambiar, ingresar marca, confirmar, enviar
- **Navegación:** SCR-M-20
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Validación: video + marca>0 + confirmación; error de guardado de video
- **Animaciones:** AN-22
- **Features:** F-GC-03
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-22 · Gym · Recepción (catálogo informativo)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/gym?tab=shop` · **Módulo:** Comunidad gym · **Rol:** Socio de gym · **Dispositivo:** mobile
- **Propósito y composición:** Productos, alimentos, bebidas, indumentaria con precio y promo. Aviso: se compra y paga en el mostrador.
- **Datos:** CatalogItem
- **Acciones:** —
- **Navegación:** —
- **Permisos:** Socios de la org
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-GC-04
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-23 · Gym · Logros y nivel
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/gym?tab=logros` · **Módulo:** Logros · **Rol:** Socio de gym · **Dispositivo:** mobile
- **Propósito y composición:** Nivel (1 + logros/2), barra a próximo nivel, stickers ganados (isotipo r + punto) y bloqueados por desafío.
- **Datos:** MemberAchievement
- **Acciones:** —
- **Navegación:** —
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-GC-05
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-24 · Notificaciones (hoja)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/app/notifications` · **Módulo:** Notificaciones · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Récord validado / no aprobado, intentos en revisión, mensaje del coach, última novedad del gym.
- **Datos:** Notification
- **Acciones:** Tocar → destino
- **Navegación:** SCR-M-23/20/17/19
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-22
- **Features:** F-NT-01
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

### SCR-M-25 · Logro validado (overlay)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(evento)` · **Módulo:** Logros · **Rol:** Socio de gym · **Dispositivo:** mobile
- **Propósito y composición:** Al aprobar el gym: sticker animado, título, marca, premio a retirar en recepción, ver logros.
- **Datos:** Notification, MemberAchievement
- **Acciones:** Ver mis logros, Cerrar
- **Navegación:** SCR-M-23
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Rechazo → toast con motivo
- **Animaciones:** AN-21
- **Features:** F-GC-05
- **Prototipo / fuente:** `prototypes/REPI App Alumno v3.dc.html`

## Conceptos de intro

### SCR-MI-01 · Concepto intro 1a · El punto (APROBADO)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(review)` · **Módulo:** Marca / motion · **Rol:** Interno · **Dispositivo:** mobile frame
- **Propósito y composición:** Concepto aprobado. Tres modos y 0,25×.
- **Datos:** —
- **Acciones:** Reproducir, modo, lento
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-01
- **Features:** F-BR-02
- **Prototipo / fuente:** `prototypes/REPI Motion Intro.dc.html`

### SCR-MI-02 · Concepto intro 1b · La repetición
- **Estado:** Concepto futuro
- **Ruta propuesta:** `(review)` · **Módulo:** Marca / motion · **Rol:** Interno · **Dispositivo:** mobile frame
- **Propósito y composición:** Descartado frente a 1a; se conserva como referencia.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-04
- **Features:** F-BR-02
- **Prototipo / fuente:** `prototypes/REPI Motion Intro.dc.html`

### SCR-MI-03 · Concepto intro 1c · Símbolo vivo
- **Estado:** Concepto futuro
- **Ruta propuesta:** `(review)` · **Módulo:** Marca / motion · **Rol:** Interno · **Dispositivo:** mobile frame
- **Propósito y composición:** Descartado frente a 1a; 3D no verificado en captura.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-05
- **Features:** F-BR-02
- **Prototipo / fuente:** `prototypes/REPI Motion Intro.dc.html`

## Gym · entrenador de sala (desktop)

### SCR-GT-01 · Mi turno (entrenador de sala)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/trainer` · **Módulo:** Gym · operación · **Rol:** Entrenador de sala · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Tarjeta de turno (iniciar / en turno / cerrado), KPIs de cola, traspasos recibidos (aceptar), pendientes de turnos anteriores, responsabilidades, anuncios.
- **Datos:** StaffShift, OperationalTask
- **Acciones:** Iniciar turno, ver cola, terminar turno, aceptar traspaso, abrir socio
- **Navegación:** SCR-GT-02/03/04
- **Permisos:** Propio + cola de la sede
- **Estados (carga/vacío/error/éxito/validación):** Empty traspasos
- **Animaciones:** AN-23
- **Features:** F-GT-01, F-GT-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GT-02 · Cola de asistencia
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/trainer/queue` · **Módulo:** Gym · operación · **Rol:** Entrenador de sala · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Pestañas cola compartida / asignadas / completadas; filas con categoría, prioridad, resumen saneado, origen; tomar, aceptar, abrir socio, completar.
- **Datos:** OperationalTask, TaskAssignment
- **Acciones:** Tomar (requiere turno), completar (requiere turno)
- **Navegación:** SCR-GT-03
- **Permisos:** Asignadas + compartida
- **Estados (carga/vacío/error/éxito/validación):** Gate sin turno (banner), empty por pestaña
- **Animaciones:** AN-23
- **Features:** F-GT-02
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GT-03 · Socios · búsqueda + ficha institucional
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/trainer/members/:id` · **Módulo:** Gym · operación · **Rol:** Entrenador de sala · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Lista con búsqueda; ficha: objetivo, actividad, programa institucional + revisiones, historial de sesiones, notas institucionales vs personales, datos restringidos (salud, Mi cuerpo, mensajes) con candado; tareas del socio.
- **Datos:** Programa institucional, notas, sesiones
- **Acciones:** Editar programa (modal), crear tarea, guardar nota, tomar/completar tarea
- **Navegación:** SCR-GX-03/04
- **Permisos:** Scoped por sede
- **Estados (carga/vacío/error/éxito/validación):** Empty búsqueda; notas vacías
- **Animaciones:** AN-23
- **Features:** F-GT-03, F-PR-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GT-04 · Traspaso de turno
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/trainer/handoff` · **Módulo:** Gym · operación · **Rol:** Entrenador de sala · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Tareas abiertas con check y resumen editable, destinatario (siguiente turno / otro / cola), cerrar turno y traspasar, historial.
- **Datos:** ShiftHandoff
- **Acciones:** Seleccionar, editar resumen, elegir destino, cerrar turno
- **Navegación:** SCR-GT-01
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Turno no iniciado; turno cerrado; sin tareas
- **Animaciones:** AN-23
- **Features:** F-GT-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GT-05 · Mi desempeño
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/trainer/performance` · **Módulo:** Gym · desempeño · **Rol:** Entrenador de sala · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Tarjetas Operativo / Calidad / Satisfacción con "¿Cómo se calcula?", reseñas propias (sin nombre del socio) con responder/reportar, acciones atribuidas con disputar.
- **Datos:** StaffPerformanceMetric, TrainerReview, MetricAttribution
- **Acciones:** Cambiar período, responder, reportar, disputar
- **Navegación:** SCR-GX-05/06
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Respuestas desactivadas por la sede
- **Animaciones:** AN-23
- **Features:** F-GP-04, F-RV-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

## Gym · gerente (desktop)

### SCR-GM-01 · Panel de la sede (gerente)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/manage` · **Módulo:** Gym · gestión · **Rol:** Gerente · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** KPIs (socios activos, en REPI, en turno, sin asignar, seguimientos vencidos, satisfacción con n), en turno ahora, tareas por estado, entrenamientos por semana, reseñas recientes; drill-down.
- **Datos:** Agregados
- **Acciones:** Ir a cada módulo
- **Navegación:** SCR-GM-02..08
- **Permisos:** Gym scope
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-GM-01
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GM-02 · Gym Performance Center
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/manage/performance` · **Módulo:** Gym · desempeño · **Rol:** Gerente, Dueño · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Filtros período/sede(dueño)/turno; 5 categorías separadas (Operativo, Calidad, Participación, Resultados — solo nivel sede, Satisfacción); definiciones; tabla con muestra baja; comparar 2–3 con contexto.
- **Datos:** StaffPerformanceMetric
- **Acciones:** Filtrar, ver definiciones, seleccionar, comparar, abrir detalle
- **Navegación:** SCR-GM-04, SCR-GX-01
- **Permisos:** Gerente: sede; dueño: gym
- **Estados (carga/vacío/error/éxito/validación):** Empty por filtros; aviso participación
- **Animaciones:** AN-23, AN-24
- **Features:** F-GP-01, F-GP-02, F-GP-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GM-03 · Equipo (directorio)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/manage/staff` · **Módulo:** Gym · gestión · **Rol:** Gerente · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Tarjetas de entrenadores con turno, estado, especialidad, tareas abiertas; búsqueda.
- **Datos:** StaffMembership
- **Acciones:** Buscar, abrir
- **Navegación:** SCR-GM-04
- **Permisos:** Sede
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-GM-02
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GM-04 · Detalle de entrenador
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/manage/staff/:id` · **Módulo:** Gym · desempeño · **Rol:** Gerente, Dueño · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** KPIs, solicitudes por semana, distribución de reseñas, tareas recientes, "Fuera del alcance de gestión" (conversaciones, notas personales, salud) → acceso denegado + auditoría.
- **Datos:** Métricas, reseñas, tareas
- **Acciones:** Cambiar período, intentar ver privado
- **Navegación:** SCR-GX-02
- **Permisos:** Gerente/dueño
- **Estados (carga/vacío/error/éxito/validación):** Sin reseñas; sin tareas
- **Animaciones:** AN-23
- **Features:** F-GP-05, F-PR-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GM-05 · Tareas operativas
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/manage/tasks` · **Módulo:** Gym · gestión · **Rol:** Gerente · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Filtros (todas, sin asignar, asignadas, traspasos, completadas), filas con metadatos, reasignar.
- **Datos:** OperationalTask
- **Acciones:** Filtrar, reasignar
- **Navegación:** SCR-GX-08
- **Permisos:** Gym scope (solo metadatos)
- **Estados (carga/vacío/error/éxito/validación):** Empty por filtro
- **Animaciones:** AN-23
- **Features:** F-GM-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GM-06 · Reseñas (análisis · moderación · historial de accesos)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/manage/reviews` · **Módulo:** Reseñas · **Rol:** Gerente · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Promedio con n y rango probable, distribución, dimensiones, tendencia, recientes (marca "Nueva"); cola de casos; auditoría de accesos.
- **Datos:** TrainerReview, ReviewModerationCase, AccessAuditEvent
- **Acciones:** Cambiar pestaña, revisar caso
- **Navegación:** SCR-GX-07
- **Permisos:** Gerente (moderador)
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-RV-02, F-RV-04, F-PR-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GM-07 · Planificación de turnos
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/manage/shifts` · **Módulo:** Gym · gestión · **Rol:** Gerente · **Dispositivo:** desktop (scroll horizontal en mobile)
- **Propósito y composición:** Grilla semana × entrenador (celda rota M/T/N/—), horas, cobertura Mañana/Tarde/Noche con franjas sin cobertura.
- **Datos:** StaffShift
- **Acciones:** Cambiar turno
- **Navegación:** —
- **Permisos:** Gerente
- **Estados (carga/vacío/error/éxito/validación):** Gaps resaltados
- **Animaciones:** AN-23
- **Features:** F-GM-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GM-08 · Participación de socios
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/manage/engagement` · **Módulo:** Gym · gestión · **Rol:** Gerente · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Embudo (activos→cuenta→programa→entrenaron→Club), sesiones por socio/semana, tarjetas, crear tareas de programa.
- **Datos:** Agregados
- **Acciones:** Crear tareas (ejemplo)
- **Navegación:** SCR-GM-05
- **Permisos:** Gerente
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-GM-05
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

## Gym · comunidad (desktop)

### SCR-GC-01 · Comunidad del gym (Novedades · Desafíos · Recepción)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/community` · **Módulo:** Comunidad gym · **Rol:** Gerente, Dueño · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Crear novedad/descuento con imagen; crear desafío (nombre, regla, unidad reps/tiempo/kg, premio, fin); catálogo de recepción (categoría, precio, promo, foto); quitar.
- **Datos:** GymPost, GymChallenge, CatalogItem
- **Acciones:** Publicar, quitar, subir imagen, restablecer datos (prototipo)
- **Navegación:** SCR-GC-02
- **Permisos:** community.publish
- **Estados (carga/vacío/error/éxito/validación):** Validación: título; nombre+premio; nombre+precio
- **Animaciones:** AN-23
- **Features:** F-GC-01, F-GC-02, F-GC-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GC-02 · Validación de récords
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/community/validations` · **Módulo:** Comunidad gym · **Rol:** Gerente, Dueño · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Intentos pendientes con video, marca declarada vs récord vigente, regla, motivo de rechazo (chips), aprobar/rechazar; resueltos.
- **Datos:** ChallengeAttempt
- **Acciones:** Aprobar, rechazar con motivo
- **Navegación:** —
- **Permisos:** challenges.validate
- **Estados (carga/vacío/error/éxito/validación):** Empty "no hay intentos"; aviso en tiempo real
- **Animaciones:** AN-23
- **Features:** F-GC-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

## Gym · dueño (desktop)

### SCR-GO-01 · Ejecutivo (dueño)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/owner/overview` · **Módulo:** Gym · dueño · **Rol:** Dueño · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** KPIs (socios, en REPI, sesiones, seguimientos, satisfacción), curva de adopción, sedes (sesiones/socio, satisfacción), accesos.
- **Datos:** Agregados multi-sede
- **Acciones:** Ir a sedes/equipo/comunidad/facturación
- **Navegación:** SCR-GO-02, SCR-GM-02
- **Permisos:** Dueño
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-GO-01
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GO-02 · Comparación de sedes
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/owner/locations` · **Módulo:** Gym · dueño · **Rol:** Dueño · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Métrica conmutable (adopción, satisfacción, seguimientos, sesiones) en barras + tabla; clic → Performance Center filtrado.
- **Datos:** GymLocation agregados
- **Acciones:** Cambiar métrica, abrir sede
- **Navegación:** SCR-GM-02
- **Permisos:** Dueño
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23, AN-26
- **Features:** F-GO-02
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GO-03 · Facturación REPI (gym)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/owner/billing` · **Módulo:** Facturación SaaS · **Rol:** Dueño · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Definición de socio facturable (contrato vs simulación), tramos, estimado del mes (facturables, módulo BI, descuento anual), historial.
- **Datos:** PlatformSubscription
- **Acciones:** Simular definición
- **Navegación:** —
- **Permisos:** billing.repi
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-BL-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GO-04 · Configuración del gym
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:orgId/owner/settings` · **Módulo:** Gym · dueño · **Rol:** Dueño · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Puesta en marcha (7 pasos, importar CSV, activar), qué ve el gym de cada socio, respuestas de entrenadores on/off, publicación externa de calificaciones deshabilitada.
- **Datos:** Organization settings
- **Acciones:** Importar (simulado), activar, toggle respuestas
- **Navegación:** —
- **Permisos:** Dueño
- **Estados (carga/vacío/error/éxito/validación):** Activar bloqueado hasta importar
- **Animaciones:** AN-23
- **Features:** F-GO-03, F-RV-05
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

## Gym · modales y globales

### SCR-GX-01 · Modal · comparar con contexto
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Gym · desempeño · **Rol:** Gerente, Dueño · **Dispositivo:** desktop
- **Propósito y composición:** Tabla 2–3 entrenadores, valores normalizados, contexto de turno.
- **Datos:** Métricas
- **Acciones:** Cerrar
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-24
- **Features:** F-GP-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GX-02 · Modal · acceso no disponible
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Privacidad · **Rol:** Gerente, Dueño · **Dispositivo:** desktop
- **Propósito y composición:** Explica por qué no hay acceso, qué sí se ve, registro en auditoría.
- **Datos:** AccessAuditEvent
- **Acciones:** Ver tareas, Entendido
- **Navegación:** SCR-GM-05
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-24
- **Features:** F-PR-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GX-03 · Modal · editar programa institucional
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Gym · operación · **Rol:** Entrenador de sala · **Dispositivo:** desktop
- **Propósito y composición:** Ejercicios con series/reps/kg editables, quitar, agregar desde biblioteca, motivo visible al equipo, completar tarea vinculada.
- **Datos:** Programa, tarea
- **Acciones:** Guardar
- **Navegación:** —
- **Permisos:** Requiere turno activo
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-24
- **Features:** F-GT-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GX-04 · Modal · nueva tarea
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Gym · operación · **Rol:** Entrenador de sala · **Dispositivo:** desktop
- **Propósito y composición:** Categoría, resumen saneado, asignarme / cola.
- **Datos:** OperationalTask
- **Acciones:** Crear
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** Validación: resumen
- **Animaciones:** AN-24
- **Features:** F-GT-02
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GX-05 · Modal · disputa / reporte
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Reseñas · **Rol:** Entrenador de sala · **Dispositivo:** desktop
- **Propósito y composición:** Motivo (chips), detalle; crea caso de moderación.
- **Datos:** ReviewModerationCase
- **Acciones:** Enviar
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-24
- **Features:** F-RV-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GX-06 · Modal · responder reseña
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Reseñas · **Rol:** Entrenador de sala · **Dispositivo:** desktop
- **Propósito y composición:** Respuesta privada (socio + gerencia).
- **Datos:** TrainerReview.response
- **Acciones:** Enviar
- **Navegación:** —
- **Permisos:** reviews.trainerResponses
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-24
- **Features:** F-RV-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GX-07 · Modal · moderar caso
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Reseñas · **Rol:** Gerente · **Dispositivo:** desktop
- **Propósito y composición:** Reseña, motivo, log; mantener / pedir edición / retirar; atribución: mantener / corregir.
- **Datos:** ReviewModerationCase
- **Acciones:** Resolver
- **Navegación:** —
- **Permisos:** moderator
- **Estados (carga/vacío/error/éxito/validación):** Resuelto: apelación 14 días
- **Animaciones:** AN-24
- **Features:** F-RV-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GX-08 · Modal · reasignar tarea
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Gym · gestión · **Rol:** Gerente · **Dispositivo:** desktop
- **Propósito y composición:** Lista de entrenadores de la sede.
- **Datos:** TaskAssignment
- **Acciones:** Reasignar
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-24
- **Features:** F-GM-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

### SCR-GX-09 · Selector de espacio de trabajo + barra "ver como"
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(global)` · **Módulo:** Multi-organización · **Rol:** Todos staff · **Dispositivo:** desktop
- **Propósito y composición:** Switcher en sidebar (Gym Norte ↔ Agustín Pérez Coach); barra de persona de prototipo (no es producto).
- **Datos:** StaffMembership
- **Acciones:** Cambiar espacio
- **Navegación:** Coach desktop
- **Permisos:** Por membresía
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-MO-01
- **Prototipo / fuente:** `prototypes/REPI Desktop Gym.dc.html`

## Coach independiente (desktop)

### SCR-C-01 · Panel del coach
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:coachOrgId/dashboard` · **Módulo:** Coach · **Rol:** Coach independiente · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** KPIs (activos, ingresos, atención, adherencia), pendientes accionables (molestia reportada, inactividad, sin programa, mensajes, programa que vence, pago vencido), agenda.
- **Datos:** Agregados de clientes
- **Acciones:** Nuevo programa, acciones de pendientes
- **Navegación:** SCR-C-02/03/04/05
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** "Todo al día"
- **Animaciones:** AN-23
- **Features:** F-CO-01
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-02 · Clientes · directorio + ficha (split)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:coachOrgId/clients/:id` · **Módulo:** Coach · **Rol:** Coach independiente · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Lista con búsqueda, filtros (todos/activos/atención/sin programa), orden (nombre/adherencia/actividad); ficha con 8 pestañas.
- **Datos:** CoachClientRelationship
- **Acciones:** Mensaje, editar/crear programa, cambiar pestaña
- **Navegación:** SCR-C-02a..h, SCR-C-03/04
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Sin resultados
- **Animaciones:** AN-23
- **Features:** F-CO-02
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-02a · Ficha · Resumen
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `tab=res` · **Módulo:** Coach · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Alertas, stats, sesiones planificadas vs hechas (8 semanas), objetivos con progreso.
- **Datos:** Logs, objetivos
- **Acciones:** Ir a alerta
- **Navegación:** —
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Sin objetivos
- **Animaciones:** —
- **Features:** F-CO-03
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-02b · Ficha · Rendimiento
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `tab=rend` · **Módulo:** Coach · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Ejercicios clave (1RM est. Epley inicio/actual/Δ/sparkline/mejor serie), series semanales por grupo vs plan, fortalezas / a mejorar (heurística), check-in 14 días (energía, sueño, RPE).
- **Datos:** SetLog, ClientCheckIn
- **Acciones:** —
- **Navegación:** —
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Sin datos (cliente nuevo)
- **Animaciones:** —
- **Features:** F-CO-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-02c · Ficha · Rutinas
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `tab=prog` · **Módulo:** Coach · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Programa asignado por día + registro de sesiones (series hechas/plan, RPE, duración, nota del alumno).
- **Datos:** Programa, WorkoutSession
- **Acciones:** —
- **Navegación:** —
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Sin programa
- **Animaciones:** —
- **Features:** F-CO-05
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-02d · Ficha · Progreso
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `tab=progreso` · **Módulo:** Coach · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Ejercicio principal: mejor serie por semana (línea).
- **Datos:** SetLog
- **Acciones:** —
- **Navegación:** —
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Sin datos
- **Animaciones:** —
- **Features:** F-CO-04
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-02e · Ficha · Salud
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `tab=salud` · **Módulo:** Coach · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Lesiones (zona, detalle, desde, estado, restricción), molestias con tendencia 0–10, salud general (condiciones, medicación, alergias, apto físico). Bloqueado sin consentimiento → Pedir acceso.
- **Datos:** Health records (consent)
- **Acciones:** Pedir acceso
- **Navegación:** —
- **Permisos:** Grant salud
- **Estados (carga/vacío/error/éxito/validación):** Locked state
- **Animaciones:** —
- **Features:** F-CO-06, F-PR-05
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-02f · Ficha · Nutrición
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `tab=nutri` · **Módulo:** Coach · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** KPIs, macros vs objetivo, kcal por día con banda, peso 8 semanas, último día registrado. Bloqueado sin consentimiento.
- **Datos:** NutritionLog (consent)
- **Acciones:** Pedir acceso
- **Navegación:** —
- **Permisos:** Grant nutrición
- **Estados (carga/vacío/error/éxito/validación):** Locked state
- **Animaciones:** —
- **Features:** F-CO-07
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-02g · Ficha · Mi cuerpo
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `tab=body` · **Módulo:** Coach · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Lo compartido por tipo: medidas, fotos, escaneo 3D, informe de composición; "No compartido".
- **Datos:** Body data (consent)
- **Acciones:** —
- **Navegación:** —
- **Permisos:** Grant por tipo
- **Estados (carga/vacío/error/éxito/validación):** No compartido
- **Animaciones:** —
- **Features:** F-BI-10
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-02h · Ficha · Pagos
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `tab=pay` · **Módulo:** Coach · cobros a clientes · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Plan, precio, estado, historial.
- **Datos:** ClientMembership
- **Acciones:** —
- **Navegación:** —
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-BL-01
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-03 · Constructor de programas
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:coachOrgId/programs/:id` · **Módulo:** Coach · programación · **Rol:** Coach · **Dispositivo:** desktop+tablet
- **Propósito y composición:** Lista de programas, nombre editable, días (pestañas + nombre editable + agregar/quitar), ejercicios con series/reps/RIR/descanso, subir/quitar, indicación al cliente, biblioteca con búsqueda; duplicar; asignar.
- **Datos:** Program, ProgramVersion (no versionado en prototipo)
- **Acciones:** Editar, agregar, duplicar, asignar
- **Navegación:** SCR-CX-01
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Día sin ejercicios
- **Animaciones:** AN-23
- **Features:** F-CO-08
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-04 · Mensajes del coach
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:coachOrgId/messages/:threadId` · **Módulo:** Mensajería · **Rol:** Coach · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** Hilos con no leídos + chat.
- **Datos:** Conversation
- **Acciones:** Enviar, ver perfil
- **Navegación:** SCR-C-02
- **Permisos:** Participantes
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-MS-01
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-C-05 · Pagos del coach
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/w/:coachOrgId/payments` · **Módulo:** Coach · cobros a clientes · **Rol:** Coach · **Dispositivo:** desktop+tablet+mobile
- **Propósito y composición:** KPIs cobrado/por cobrar/vencido/promos; tabla de clientes (monto, vencimiento, estado, registrar pago); tarjeta de suscripción REPI Coach (18 × ARS 700).
- **Datos:** ClientMembership, PlatformSubscription
- **Acciones:** Registrar pago manual
- **Navegación:** —
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-BL-01, F-BL-02
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

## Coach · modales

### SCR-CX-01 · Modal · asignar programa
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Coach · programación · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Multi-selección de clientes (copia propia), fecha de inicio (hoy / lunes / 1 jun).
- **Datos:** ProgramAssignment
- **Acciones:** Asignar
- **Navegación:** —
- **Permisos:** Propio
- **Estados (carga/vacío/error/éxito/validación):** Validación ≥1 cliente
- **Animaciones:** AN-24
- **Features:** F-CO-08
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

## Administración REPI

### SCR-A-01 · Admin · Resumen
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/admin` · **Módulo:** Administración REPI · **Rol:** REPI Admin · **Dispositivo:** desktop+tablet
- **Propósito y composición:** KPIs (gimnasios, entrenadores, facturación, vencidos, cobros semana), facturación 6 meses por segmento, requieren atención (vencidos, pruebas, crecimientos de tramo).
- **Datos:** PlatformSubscription, snapshots
- **Acciones:** Ir a clientes/cobros
- **Navegación:** SCR-A-02/03/04
- **Permisos:** platform.admin
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-AD-01
- **Prototipo / fuente:** `prototypes/REPI Admin.dc.html`

### SCR-A-02 · Admin · Clientes (gyms y coaches)
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/admin/clients` · **Módulo:** Administración REPI · **Rol:** REPI Admin · **Dispositivo:** desktop (scroll horizontal)
- **Propósito y composición:** Tabla con tipo, plan, facturables + variación, monto, próximo cobro, estado; búsqueda y filtros; nuevo cliente.
- **Datos:** Organization, PlatformSubscription
- **Acciones:** Abrir, crear
- **Navegación:** SCR-A-03
- **Permisos:** platform.admin
- **Estados (carga/vacío/error/éxito/validación):** Sin resultados
- **Animaciones:** AN-23
- **Features:** F-AD-02
- **Prototipo / fuente:** `prototypes/REPI Admin.dc.html`

### SCR-A-03 · Admin · Ficha de suscripción
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/admin/clients/:id` · **Módulo:** Administración REPI · **Rol:** REPI Admin · **Dispositivo:** desktop+tablet
- **Propósito y composición:** Plan (tramos editables / por unidad / fijo), mínimo, descuento, día de cobro (1–28), criterio de conteo (máximo/al día de cobro/promedio), estado, nota; cálculo en vivo; historial de socios/alumnos; cobros (marcar pagado); log de cambios; guardar/descartar.
- **Datos:** PlatformSubscription, BillableSnapshot, Invoice
- **Acciones:** Editar, guardar, marcar pagado
- **Navegación:** —
- **Permisos:** platform.admin
- **Estados (carga/vacío/error/éxito/validación):** Cambios sin guardar
- **Animaciones:** AN-23
- **Features:** F-AD-03
- **Prototipo / fuente:** `prototypes/REPI Admin.dc.html`

### SCR-A-04 · Admin · Cobros
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `/admin/invoices` · **Módulo:** Administración REPI · **Rol:** REPI Admin · **Dispositivo:** desktop (scroll horizontal)
- **Propósito y composición:** Próximos (por día de cobro), vencidos, pagados; marcar pagado.
- **Datos:** Invoice
- **Acciones:** Filtrar, marcar pagado, abrir cliente
- **Navegación:** SCR-A-03
- **Permisos:** platform.admin
- **Estados (carga/vacío/error/éxito/validación):** Empty
- **Animaciones:** AN-23
- **Features:** F-AD-04
- **Prototipo / fuente:** `prototypes/REPI Admin.dc.html`

### SCR-A-05 · Admin · Planes y precios
- **Estado:** Mockup estático
- **Ruta propuesta:** `/admin/plans` · **Módulo:** Administración REPI · **Rol:** REPI Admin · **Dispositivo:** desktop
- **Propósito y composición:** Valores por defecto REPI Gym / REPI Coach (tramos, mínimo, día). Solo lectura en el prototipo.
- **Datos:** SubscriptionPlan, PricingTier
- **Acciones:** —
- **Navegación:** —
- **Permisos:** platform.admin
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** AN-23
- **Features:** F-AD-05
- **Prototipo / fuente:** `prototypes/REPI Admin.dc.html`

## Admin · modales

### SCR-AX-01 · Admin · Modal nuevo cliente
- **Estado:** Prototipo interactivo
- **Ruta propuesta:** `(modal)` · **Módulo:** Administración REPI · **Rol:** REPI Admin · **Dispositivo:** desktop
- **Propósito y composición:** Tipo gym/coach, nombre, CUIT; crea en prueba con plan por defecto.
- **Datos:** Organization
- **Acciones:** Crear
- **Navegación:** SCR-A-03
- **Permisos:** platform.admin
- **Estados (carga/vacío/error/éxito/validación):** Validación nombre
- **Animaciones:** —
- **Features:** F-AD-02
- **Prototipo / fuente:** `prototypes/REPI Admin.dc.html`

## Legacy / incompleto

### SCR-L-01 · REPI Escritorio (desktop unificado, incompleto)
- **Estado:** Parcialmente diseñado
- **Ruta propuesta:** `—` · **Módulo:** Legacy · **Rol:** Coach + floor trainer + gerente · **Dispositivo:** desktop
- **Propósito y composición:** Archivo de plantilla sin lógica (sin clase Component): mezcla coach, turno de sala y gestión con datos "Núcleo" y fechas oct/nov. Superado por SCR-C-*, SCR-G*-*.
- **Datos:** —
- **Acciones:** No funcional
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** —
- **Prototipo / fuente:** `prototypes/legacy/REPI Escritorio (incompleto).dc.html`

## Especificado pero no diseñado

### SCR-N-01 · Sitio público / landing / precios / FAQ / legales
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/` · **Módulo:** Sitio público · **Rol:** Visitante · **Dispositivo:** responsive
- **Propósito y composición:** Especificado en el brief original (3.1).
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-PU-01
- **Prototipo / fuente:** `—`

### SCR-N-02 · Autenticación (registro, login, verificación, recuperación)
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/auth/*` · **Módulo:** Identidad · **Rol:** Todos · **Dispositivo:** responsive
- **Propósito y composición:** Especificado en brief original.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-ID-01
- **Prototipo / fuente:** `—`

### SCR-N-03 · Onboarding del coach
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/onboarding/coach` · **Módulo:** Identidad · **Rol:** Coach · **Dispositivo:** responsive
- **Propósito y composición:** Registro → perfil → espacio → primer alumno → primer programa → asignar.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-ID-02
- **Prototipo / fuente:** `—`

### SCR-N-04 · Invitación y onboarding del alumno
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/invite/:token` · **Módulo:** Identidad · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Enlace seguro, aceptación explícita, consentimientos, primera sesión.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-ID-03
- **Prototipo / fuente:** `—`

### SCR-N-05 · Biblioteca de ejercicios (gestión CRUD, medios, filtros)
- **Estado:** Parcialmente diseñado
- **Ruta propuesta:** `/w/:id/exercises` · **Módulo:** Programación · **Rol:** Coach / gym · **Dispositivo:** desktop
- **Propósito y composición:** Solo panel de biblioteca dentro del constructor (lista + búsqueda + agregar). Falta gestión, medios, variantes.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-CO-09
- **Prototipo / fuente:** `prototypes/REPI Desktop Coach.dc.html`

### SCR-N-06 · Calendario / asistencia
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/w/:id/calendar` · **Módulo:** Coach · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Vistas semana/mes, ausencias, registro manual.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-CO-10
- **Prototipo / fuente:** `—`

### SCR-N-07 · Importación CSV de alumnos/socios
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/w/:id/import` · **Módulo:** Coach / gym · **Rol:** Coach, dueño · **Dispositivo:** desktop
- **Propósito y composición:** Preview, validación, dedupe, reporte. En gym solo un botón simulado.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-CO-11
- **Prototipo / fuente:** `—`

### SCR-N-08 · Configuración del coach / perfil público / marca
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/w/:id/settings` · **Módulo:** Coach · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Perfil, privacidad, notificaciones, exportación, página pública futura.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-CO-12
- **Prototipo / fuente:** `—`

### SCR-N-09 · Repi Club · feed social, reacciones, comentarios, rankings, trofeos 3D
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/app/club` · **Módulo:** Repi Club · **Rol:** Alumno, coach, gym · **Dispositivo:** mobile+desktop
- **Propósito y composición:** Pedido en briefs de motion y expansión. Solo existe la comunidad del gym (posts, desafíos, logros).
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-RC-01..05
- **Prototipo / fuente:** `—`

### SCR-N-10 · Carga de documentos de salud / DXA / bioimpedancia / laboratorio (PDF)
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/app/body/documents` · **Módulo:** Body Intelligence · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Botón "Subir evaluación" muestra toast "próximo flujo".
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-BI-11
- **Prototipo / fuente:** `—`

### SCR-N-11 · Recepción (rol)
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/w/:orgId/reception` · **Módulo:** Gym · **Rol:** Recepción · **Dispositivo:** desktop
- **Propósito y composición:** Rol en matriz; sin pantallas.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-GR-01
- **Prototipo / fuente:** `—`

### SCR-N-12 · Coordinador (vista propia)
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/w/:orgId/coord` · **Módulo:** Gym · **Rol:** Coordinador · **Dispositivo:** desktop
- **Propósito y composición:** Usa pantallas de gerente con alcance de sede (no diseñado por separado).
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-GM-06
- **Prototipo / fuente:** `—`

### SCR-N-13 · Reservas de clases / asistencia gym
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/app/classes` · **Módulo:** Gym · **Rol:** Socio · **Dispositivo:** mobile
- **Propósito y composición:** Mencionado en expansión v2.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-GR-02
- **Prototipo / fuente:** `—`

### SCR-N-14 · Checkout / pagos online / Mercado Pago
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `—` · **Módulo:** Pagos · **Rol:** Coach, socio · **Dispositivo:** responsive
- **Propósito y composición:** Futuro; pagos online no diseñados.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-BL-04
- **Prototipo / fuente:** `—`

### SCR-N-15 · Asistente IA
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `—` · **Módulo:** IA · **Rol:** Coach · **Dispositivo:** desktop
- **Propósito y composición:** Sin pantallas; solo heurísticas deterministas en ficha (fortalezas/mejorar).
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-AI-01
- **Prototipo / fuente:** `—`

### SCR-N-16 · Admin · feature flags, soporte, salud del sistema, costos IA, MRR/ARR/churn
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/admin/*` · **Módulo:** Administración REPI · **Rol:** REPI Admin · **Dispositivo:** desktop
- **Propósito y composición:** Brief original 3.4.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-AD-06
- **Prototipo / fuente:** `—`

### SCR-N-17 · Estados offline / sincronización del entrenamiento
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `—` · **Módulo:** Entrenamiento (alumno) · **Rol:** Alumno · **Dispositivo:** mobile
- **Propósito y composición:** Brief original: IndexedDB, cola, conflictos. Solo indicador "Guardado".
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-CL-07
- **Prototipo / fuente:** `—`

### SCR-N-18 · Preferencias de notificaciones / push
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/app/settings/notifications` · **Módulo:** Notificaciones · **Rol:** Todos · **Dispositivo:** responsive
- **Propósito y composición:** —
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-NT-02
- **Prototipo / fuente:** `—`

### SCR-N-19 · Mensajería del gym (entrenador de sala ↔ socio)
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `—` · **Módulo:** Mensajería · **Rol:** Entrenador de sala · **Dispositivo:** desktop
- **Propósito y composición:** Mencionado ("mensajería autorizada"); no diseñado.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-MS-02
- **Prototipo / fuente:** `—`

### SCR-N-20 · Admin · editar planes por defecto
- **Estado:** Especificado, no diseñado
- **Ruta propuesta:** `/admin/plans/edit` · **Módulo:** Administración REPI · **Rol:** REPI Admin · **Dispositivo:** desktop
- **Propósito y composición:** Planes y precios es solo lectura.
- **Datos:** —
- **Acciones:** —
- **Navegación:** —
- **Permisos:** —
- **Estados (carga/vacío/error/éxito/validación):** —
- **Animaciones:** —
- **Features:** F-AD-05
- **Prototipo / fuente:** `—`

