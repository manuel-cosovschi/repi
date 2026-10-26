# 02 · Inventario de funcionalidades

Fuente: `features.json`. Prioridad = **propuesta** salvo las marcadas MVP por el brief original. "Origen": original = brief maestro inicial; added = introducida durante el diseño.

| ID | Funcionalidad | Módulo | Roles | Estado | Prioridad (propuesta) | Origen | Complejidad | Pantallas | Criterio de aceptación |
|---|---|---|---|---|---|---|---|---|---|
| F-BR-01 | Identidad Concepto 2 (wordmark, isotipo, paleta, Inter Tight) | Marca | Todos | Diseñado | MVP | original | S |  | Logo = PNG original o vector verificado; nunca texto en Inter Tight; punto cian #00D1FF |
| F-BR-02 | Intro de marca 1a + inicio regular + reducido | Marca / motion | Alumno | Prototipo interactivo | V1 | added | M | SCR-M-01, SCR-MI-01, SCR-MI-02, SCR-MI-03 | 1ª vez ~2,6 s saltable; luego ≤0,5 s; reduced-motion = fade; nunca durante entrenamiento activo; termina en pantalla real |
| F-CL-01 | Inicio del alumno | Entrenamiento | Alumno | Prototipo interactivo | MVP | original | M | SCR-M-02 | Muestra entrenamiento de hoy y semana reales; CTA inicia sesión |
| F-CL-02 | Semana y detalle de día | Entrenamiento | Alumno | Prototipo interactivo | MVP | original | S | SCR-M-03 | Día de descanso como estado propio; valores anteriores por ejercicio |
| F-CL-03 | Registro de series en un toque | Entrenamiento | Alumno | Prototipo interactivo | MVP | original | L | SCR-M-04 | Completar serie ≤1 toque; steppers ±2,5 kg/±1 rep; autosave visible |
| F-CL-04 | Temporizador de descanso (reloj real) | Entrenamiento | Alumno | Prototipo interactivo | MVP | original | M | SCR-M-04 | Basado en timestamp de fin; pausar/+30s/saltar; no depende de frames |
| F-CL-05 | Resumen de sesión + récord personal validado | Entrenamiento | Alumno | Prototipo interactivo | MVP | original | M | SCR-M-05 | PR solo si supera registro comparable previo; celebración desactivable |
| F-CL-06 | Progreso (fuerza, volumen, constancia, medidas) | Progreso | Alumno | Prototipo interactivo | MVP | original | M | SCR-M-06 | Volumen = series×reps×peso documentado; "Datos insuficientes" para lo no medido |
| F-CL-07 | Offline + sincronización idempotente | Entrenamiento | Alumno | Especificado, no diseñado | MVP | original | L | SCR-N-17 | Sin pérdida ni duplicado al reconectar (E2E 5 del brief) |
| F-BI-01 | Mi cuerpo · introducción | Body Intelligence | Alumno | Prototipo interactivo | V1 | added | S | SCR-M-07 | Opcional; entrenamiento funciona sin activarlo |
| F-BI-02 | Consentimiento granular por tipo de dato | Body Intelligence | Alumno | Prototipo interactivo | V1 | added | M | SCR-M-08 | 6 tipos apagados por defecto; guardar ≠ compartir |
| F-BI-03 | Elección de método (manual/fotos/3D experimental) | Body Intelligence | Alumno | Prototipo interactivo | V1 | added | S | SCR-M-09 | Métodos bloqueados sin consentimiento |
| F-BI-04 | Medidas manuales con fuente | Body Intelligence | Alumno | Prototipo interactivo | V1 | original | S | SCR-M-10 | Cada medida guarda quién midió, método y fecha |
| F-BI-05 | Captura guiada de fotos (4 poses) con chequeo de calidad | Body Intelligence | Alumno | Prototipo interactivo | V2 | added | L | SCR-M-11, SCR-M-12, SCR-M-13 | Cámara real; chequeos luz/distancia/encuadre/nitidez; sin ropa interior |
| F-BI-06 | Reconstrucción 3D personalizada + estado de fallo honesto | Body Intelligence | Alumno | Parcialmente diseñado | Experimental | added | XL | SCR-M-13, SCR-M-14 | Nunca mostrar modelo que no se parezca; fallback a referencia |
| F-BI-07 | Visor 3D (rotar, zoom, vistas, capas, regiones) | Body Intelligence | Alumno | Prototipo interactivo | V2 | added | L | SCR-M-15 | Etiqueta de modo de avatar siempre visible; fallback sin WebGL |
| F-BI-08 | Mapa de exposición de entrenamiento por región | Body Intelligence | Alumno, coach | Prototipo interactivo | V2 | added | M | SCR-M-15 | Color = carga registrada, no músculo real; aviso visible |
| F-BI-09 | Comparación entre fechas (swipe) con aviso de comparabilidad | Body Intelligence | Alumno | Prototipo interactivo | V2 | added | M | SCR-M-16 | Advertir iluminación/pose distinta |
| F-BI-10 | Coach ve Mi cuerpo compartido | Body Intelligence | Coach | Prototipo interactivo | V2 | added | S | SCR-C-02g | Solo tipos compartidos; "No compartido" si no |
| F-BI-11 | Carga de DXA/bioimpedancia/laboratorio (PDF) + extracción revisada | Body Intelligence | Alumno | Especificado, no diseñado | V3 | added | L | SCR-N-10 | Revisión humana obligatoria; requiere revisión legal |
| F-PR-01 | Compartir/revocar por tipo de dato con historial de accesos | Privacidad | Alumno | Prototipo interactivo | V1 | added | M | SCR-M-18 | Cada cambio en log; revocación inmediata |
| F-PR-02 | Exportar y eliminar datos | Privacidad | Alumno | Parcialmente diseñado | V1 | original | M | SCR-M-18 | Simulado en prototipo |
| F-PR-03 | Notas institucionales vs personales | Privacidad | Entrenador de sala | Prototipo interactivo | V1 | added | S | SCR-GT-03 | Etiqueta de visibilidad; personales nunca en traspasos/reportes |
| F-PR-04 | Acceso denegado + auditoría de intentos | Privacidad | Gerente, dueño | Prototipo interactivo | V1 | added | S | SCR-GM-04, SCR-GM-06, SCR-GX-02 | Intento registrado; estado explícito, no vacío |
| F-PR-05 | Datos de salud del alumno al coach por consentimiento | Privacidad | Coach | Prototipo interactivo | V1 | added | M | SCR-C-02e | Bloqueado sin grant; "Pedir acceso" envía solicitud |
| F-MS-01 | Chat coach–alumno | Mensajería | Coach, alumno | Prototipo interactivo | V1 | original | M | SCR-M-17, SCR-C-04 | Solo relaciones activas |
| F-MS-02 | Mensajería autorizada en el gym | Mensajería | Entrenador de sala, socio | Especificado, no diseñado | V2 | added | M | SCR-N-19 | — |
| F-NT-01 | Centro de notificaciones del alumno | Notificaciones | Alumno | Prototipo interactivo | V1 | original | M | SCR-M-24 | Destinos navegables; sin datos de salud en lock screen |
| F-NT-02 | Preferencias / push / email | Notificaciones | Todos | Especificado, no diseñado | V1 | original | M | SCR-N-18 | — |
| F-CO-01 | Panel del coach con pendientes accionables | Coach | Coach | Prototipo interactivo | MVP | original | M | SCR-C-01 | Cada pendiente con acción directa |
| F-CO-02 | Directorio de clientes split view | Coach | Coach | Prototipo interactivo | MVP | original | M | SCR-C-02 | Búsqueda, filtros, orden |
| F-CO-03 | Objetivos del cliente con progreso | Coach | Coach | Prototipo interactivo | V1 | added | S | SCR-C-02a | — |
| F-CO-04 | Rendimiento: 1RM estimado, volumen por grupo, fortalezas/mejoras, check-in | Coach | Coach | Prototipo interactivo | V1 | added | L | SCR-C-02b, SCR-C-02d | Fórmula Epley documentada; heurística revisable |
| F-CO-05 | Registro de sesiones con notas del alumno | Coach | Coach | Prototipo interactivo | MVP | added | S | SCR-C-02c | — |
| F-CO-06 | Salud: lesiones, molestias 0–10, condiciones | Coach | Coach | Prototipo interactivo | V1 | added | M | SCR-C-02e | No diagnosticar; derivar a profesional |
| F-CO-07 | Nutrición: macros, kcal, hidratación, peso, comidas | Coach | Coach, alumno | Parcialmente diseñado | V2 | added | L | SCR-C-02f | La captura del lado alumno no está diseñada |
| F-CO-08 | Constructor de programas (días renombrables, duplicar, asignar) | Programación | Coach | Prototipo interactivo | MVP | original | L | SCR-C-03, SCR-CX-01 | Asignación crea copia; editar no altera el pasado (versionado no prototipado) |
| F-CO-09 | Biblioteca de ejercicios completa | Programación | Coach, gym | Parcialmente diseñado | MVP | original | L | SCR-N-05 | — |
| F-CO-10 | Calendario / asistencia | Coach | Coach | Especificado, no diseñado | V1 | original | M | SCR-N-06 | — |
| F-CO-11 | Importación CSV | Coach / gym | Coach, dueño | Especificado, no diseñado | V1 | original | M | SCR-N-07 | — |
| F-CO-12 | Configuración / perfil público | Coach | Coach | Especificado, no diseñado | V2 | original | M | SCR-N-08 | — |
| F-BL-01 | Cobros manuales del coach a sus clientes | Pagos coach | Coach | Prototipo interactivo | MVP | original | M | SCR-C-02h, SCR-C-05 | Separado de suscripción REPI |
| F-BL-02 | Suscripción REPI Coach (por alumno facturable) | Facturación SaaS | Coach | Prototipo interactivo | MVP | original | M | SCR-C-05 | Estimado y regla visibles |
| F-BL-03 | Facturación REPI Gym (tramos, mínimo, módulos) | Facturación SaaS | Dueño | Prototipo interactivo | V1 | added | M | SCR-GO-03 | Uso ≠ facturable; snapshot fin de período |
| F-BL-04 | Checkout / pasarela (Mercado Pago) | Pagos | Coach | Especificado, no diseñado | V2 | original | L | SCR-N-14 | Webhooks idempotentes; nunca acreditar por redirect |
| F-GT-01 | Turno del entrenador de sala (iniciar/cerrar) | Gym · operación | Entrenador de sala | Prototipo interactivo | V1 | added | M | SCR-GT-01 | Editar/completar requiere turno activo |
| F-GT-02 | Cola de asistencia y tareas con resumen saneado | Gym · operación | Entrenador de sala | Prototipo interactivo | V1 | added | M | SCR-GT-02, SCR-GX-04 | Nunca copiar mensajes privados |
| F-GT-03 | Programa institucional del socio + revisiones | Gym · operación | Entrenador de sala | Prototipo interactivo | V1 | added | M | SCR-GT-03, SCR-GX-03 | Motivo de cambio visible al equipo |
| F-GT-04 | Traspaso de turno con aceptación | Gym · operación | Entrenador de sala | Prototipo interactivo | V1 | added | M | SCR-GT-01, SCR-GT-04 | pending_acceptance hasta aceptar |
| F-GM-01 | Panel del gerente | Gym · gestión | Gerente | Prototipo interactivo | V1 | added | M | SCR-GM-01 | — |
| F-GM-02 | Directorio del equipo | Gym · gestión | Gerente | Prototipo interactivo | V1 | added | S | SCR-GM-03 | — |
| F-GM-03 | Tareas operativas + reasignación | Gym · gestión | Gerente | Prototipo interactivo | V1 | added | M | SCR-GM-05, SCR-GX-08 | Solo metadatos |
| F-GM-04 | Planificación de turnos con cobertura | Gym · gestión | Gerente | Prototipo interactivo | V2 | added | M | SCR-GM-07 | — |
| F-GM-05 | Participación de socios | Gym · gestión | Gerente | Prototipo interactivo | V2 | added | M | SCR-GM-08 | — |
| F-GM-06 | Vista de coordinador | Gym · gestión | Coordinador | Especificado, no diseñado | V2 | added | S | SCR-N-12 | — |
| F-GP-01 | Gym Performance Center por categorías separadas | Gym · desempeño | Gerente, dueño | Prototipo interactivo | V1 | added | L | SCR-GM-02 | Sin puntaje combinado; resultados solo nivel sede |
| F-GP-02 | Definiciones de métricas visibles | Gym · desempeño | Todos staff | Prototipo interactivo | V1 | added | S | SCR-GM-02 | — |
| F-GP-03 | Comparación contextual 2–3 | Gym · desempeño | Gerente, dueño | Prototipo interactivo | V1 | added | S | SCR-GM-02, SCR-GX-01 | — |
| F-GP-04 | Mi desempeño + disputa de atribución | Gym · desempeño | Entrenador de sala | Prototipo interactivo | V1 | added | M | SCR-GT-05 | — |
| F-GP-05 | Detalle de entrenador | Gym · desempeño | Gerente, dueño | Prototipo interactivo | V1 | added | M | SCR-GM-04 | — |
| F-RV-01 | Reseña verificada del socio (1–5 + dimensiones) | Reseñas | Socio | Parcialmente diseñado | V1 | added | M |  | Prototipada en v2 del gym (persona Valentina, ahora retirada); falta en app v3 |
| F-RV-02 | Analítica de reseñas con n y rango | Reseñas | Gerente | Prototipo interactivo | V1 | added | M | SCR-GM-06 | Ocultar promedio con n<5 |
| F-RV-03 | Responder / reportar (entrenador) | Reseñas | Entrenador de sala | Prototipo interactivo | V1 | added | S | SCR-GT-05, SCR-GX-05, SCR-GX-06 | — |
| F-RV-04 | Moderación con log y apelación | Reseñas | Gerente | Prototipo interactivo | V1 | added | M | SCR-GM-06, SCR-GX-07 | Staff no edita texto |
| F-RV-05 | Políticas de reseñas (respuestas, publicación externa) | Reseñas | Dueño | Prototipo interactivo | V1 | added | S | SCR-GO-04 | Publicación externa deshabilitada |
| F-GO-01 | Ejecutivo multi-sede | Gym · dueño | Dueño | Prototipo interactivo | V1 | added | M | SCR-GO-01 | — |
| F-GO-02 | Comparación de sedes | Gym · dueño | Dueño | Prototipo interactivo | V2 | added | S | SCR-GO-02 | — |
| F-GO-03 | Puesta en marcha del gym | Gym · dueño | Dueño | Prototipo interactivo | V1 | added | M | SCR-GO-04 | Activar bloqueado hasta importar |
| F-GC-01 | Novedades y descuentos del gym | Comunidad gym | Gerente, dueño, socio | Prototipo interactivo | V1 | added | M | SCR-M-19, SCR-GC-01 | Solo socios de esa org |
| F-GC-02 | Desafíos con premio en recepción | Comunidad gym | Gerente, dueño, socio | Prototipo interactivo | V1 | added | M | SCR-M-20, SCR-GC-01 | Reglas de técnica; sin presión insegura |
| F-GC-03 | Intento de récord con video + validación | Comunidad gym | Socio, gerente | Prototipo interactivo | V1 | added | L | SCR-M-20, SCR-M-21, SCR-GC-02 | Video privado; notificación a ambas partes |
| F-GC-04 | Catálogo informativo de recepción | Comunidad gym | Gerente, socio | Prototipo interactivo | V1 | added | S | SCR-M-22, SCR-GC-01 | Sin checkout |
| F-GC-05 | Logros, stickers y nivel | Logros | Socio | Prototipo interactivo | V1 | added | M | SCR-M-23, SCR-M-25 | Permanente en registro |
| F-GR-01 | Rol recepción | Gym | Recepción | Especificado, no diseñado | V2 | added | M | SCR-N-11 | — |
| F-GR-02 | Reservas de clases | Gym | Socio | Especificado, no diseñado | V3 | added | L | SCR-N-13 | — |
| F-MO-01 | Cuenta multi-organización y selector de espacio | Multi-organización | Todos | Prototipo interactivo | V1 | added | L | SCR-GX-09 | Permisos nunca se cruzan |
| F-MO-02 | Socio con gym + coach privado (dos relaciones) | Multi-organización | Alumno | Parcialmente diseñado | V2 | added | M |  | Prototipado en gym v2 (retirado); app v3 sólo tweak alumnoTipo |
| F-AD-01 | Admin · resumen | Administración REPI | REPI Admin | Prototipo interactivo | MVP | original | M | SCR-A-01 | — |
| F-AD-02 | Admin · clientes y alta | Administración REPI | REPI Admin | Prototipo interactivo | MVP | original | M | SCR-A-02, SCR-AX-01 | — |
| F-AD-03 | Admin · suscripción editable (plan, tramos, mínimo, descuento, día de cobro, criterio de conteo) | Administración REPI | REPI Admin | Prototipo interactivo | MVP | added | L | SCR-A-03 | Cambios rigen desde el próximo cobro; log |
| F-AD-04 | Admin · cobros | Administración REPI | REPI Admin | Prototipo interactivo | MVP | original | M | SCR-A-04 | — |
| F-AD-05 | Admin · planes por defecto | Administración REPI | REPI Admin | Mockup estático | V1 | original | S | SCR-A-05, SCR-N-20 | — |
| F-AD-06 | Admin · flags, soporte, salud, costos IA, MRR/ARR/churn | Administración REPI | REPI Admin | Especificado, no diseñado | V2 | original | L | SCR-N-16 | Fórmulas definidas |
| F-RC-01 | Repi Club · feed y publicaciones de logros | Repi Club | Alumno, coach, gym | Especificado, no diseñado | V2 | added | L | SCR-N-09 | Voluntario; nunca datos de salud |
| F-RC-02 | Reacciones y comentarios | Repi Club | Alumno | Especificado, no diseñado | V2 | added | M | SCR-N-09 | — |
| F-RC-03 | Rankings con transiciones FLIP | Repi Club | Alumno | Especificado, no diseñado | V2 | added | M | SCR-N-09 | Sin incentivar chequeo compulsivo |
| F-RC-04 | Trofeos (familia + desbloqueo 3D) | Repi Club | Alumno | Especificado, no diseñado | V3 | added | L | SCR-N-09 | — |
| F-RC-05 | Moderación del Club | Repi Club | Moderadores | Especificado, no diseñado | V2 | added | M | SCR-N-09 | — |
| F-AI-01 | Asistente IA del coach | IA | Coach | Especificado, no diseñado | V3 | original | L | SCR-N-15 | Revisión humana obligatoria; no diagnosticar |
| F-PU-01 | Sitio público | Sitio público | Visitante | Especificado, no diseñado | V1 | original | M | SCR-N-01 | — |
| F-ID-01 | Autenticación | Identidad | Todos | Especificado, no diseñado | MVP | original | M | SCR-N-02 | — |
| F-ID-02 | Onboarding del coach | Identidad | Coach | Especificado, no diseñado | MVP | original | M | SCR-N-03 | — |
| F-ID-03 | Invitación del alumno | Identidad | Alumno | Especificado, no diseñado | MVP | original | M | SCR-N-04 | — |
