# 22 · Criterios de aceptación para desarrollo

Definition of Done (brief original): diseño conforme + acción real + persistencia + permisos + validaciones + errores + móvil + tests + documentación. Un prototipo interactivo **no** cuenta como hecho.

## Por funcionalidad
| Feature | Criterio |
|---|---|
| F-BR-01 Identidad Concepto 2 (wordmark, isotipo, paleta, Inter Tight) | Logo = PNG original o vector verificado; nunca texto en Inter Tight; punto cian #00D1FF |
| F-BR-02 Intro de marca 1a + inicio regular + reducido | 1ª vez ~2,6 s saltable; luego ≤0,5 s; reduced-motion = fade; nunca durante entrenamiento activo; termina en pantalla real |
| F-CL-01 Inicio del alumno | Muestra entrenamiento de hoy y semana reales; CTA inicia sesión |
| F-CL-02 Semana y detalle de día | Día de descanso como estado propio; valores anteriores por ejercicio |
| F-CL-03 Registro de series en un toque | Completar serie ≤1 toque; steppers ±2,5 kg/±1 rep; autosave visible |
| F-CL-04 Temporizador de descanso (reloj real) | Basado en timestamp de fin; pausar/+30s/saltar; no depende de frames |
| F-CL-05 Resumen de sesión + récord personal validado | PR solo si supera registro comparable previo; celebración desactivable |
| F-CL-06 Progreso (fuerza, volumen, constancia, medidas) | Volumen = series×reps×peso documentado; "Datos insuficientes" para lo no medido |
| F-CL-07 Offline + sincronización idempotente | Sin pérdida ni duplicado al reconectar (E2E 5 del brief) |
| F-BI-01 Mi cuerpo · introducción | Opcional; entrenamiento funciona sin activarlo |
| F-BI-02 Consentimiento granular por tipo de dato | 6 tipos apagados por defecto; guardar ≠ compartir |
| F-BI-03 Elección de método (manual/fotos/3D experimental) | Métodos bloqueados sin consentimiento |
| F-BI-04 Medidas manuales con fuente | Cada medida guarda quién midió, método y fecha |
| F-BI-05 Captura guiada de fotos (4 poses) con chequeo de calidad | Cámara real; chequeos luz/distancia/encuadre/nitidez; sin ropa interior |
| F-BI-06 Reconstrucción 3D personalizada + estado de fallo honesto | Nunca mostrar modelo que no se parezca; fallback a referencia |
| F-BI-07 Visor 3D (rotar, zoom, vistas, capas, regiones) | Etiqueta de modo de avatar siempre visible; fallback sin WebGL |
| F-BI-08 Mapa de exposición de entrenamiento por región | Color = carga registrada, no músculo real; aviso visible |
| F-BI-09 Comparación entre fechas (swipe) con aviso de comparabilidad | Advertir iluminación/pose distinta |
| F-BI-10 Coach ve Mi cuerpo compartido | Solo tipos compartidos; "No compartido" si no |
| F-BI-11 Carga de DXA/bioimpedancia/laboratorio (PDF) + extracción revisada | Revisión humana obligatoria; requiere revisión legal |
| F-PR-01 Compartir/revocar por tipo de dato con historial de accesos | Cada cambio en log; revocación inmediata |
| F-PR-02 Exportar y eliminar datos | Simulado en prototipo |
| F-PR-03 Notas institucionales vs personales | Etiqueta de visibilidad; personales nunca en traspasos/reportes |
| F-PR-04 Acceso denegado + auditoría de intentos | Intento registrado; estado explícito, no vacío |
| F-PR-05 Datos de salud del alumno al coach por consentimiento | Bloqueado sin grant; "Pedir acceso" envía solicitud |
| F-MS-01 Chat coach–alumno | Solo relaciones activas |
| F-MS-02 Mensajería autorizada en el gym | — |
| F-NT-01 Centro de notificaciones del alumno | Destinos navegables; sin datos de salud en lock screen |
| F-NT-02 Preferencias / push / email | — |
| F-CO-01 Panel del coach con pendientes accionables | Cada pendiente con acción directa |
| F-CO-02 Directorio de clientes split view | Búsqueda, filtros, orden |
| F-CO-03 Objetivos del cliente con progreso | — |
| F-CO-04 Rendimiento: 1RM estimado, volumen por grupo, fortalezas/mejoras, check-in | Fórmula Epley documentada; heurística revisable |
| F-CO-05 Registro de sesiones con notas del alumno | — |
| F-CO-06 Salud: lesiones, molestias 0–10, condiciones | No diagnosticar; derivar a profesional |
| F-CO-07 Nutrición: macros, kcal, hidratación, peso, comidas | La captura del lado alumno no está diseñada |
| F-CO-08 Constructor de programas (días renombrables, duplicar, asignar) | Asignación crea copia; editar no altera el pasado (versionado no prototipado) |
| F-CO-09 Biblioteca de ejercicios completa | — |
| F-CO-10 Calendario / asistencia | — |
| F-CO-11 Importación CSV | — |
| F-CO-12 Configuración / perfil público | — |
| F-BL-01 Cobros manuales del coach a sus clientes | Separado de suscripción REPI |
| F-BL-02 Suscripción REPI Coach (por alumno facturable) | Estimado y regla visibles |
| F-BL-03 Facturación REPI Gym (tramos, mínimo, módulos) | Uso ≠ facturable; snapshot fin de período |
| F-BL-04 Checkout / pasarela (Mercado Pago) | Webhooks idempotentes; nunca acreditar por redirect |
| F-GT-01 Turno del entrenador de sala (iniciar/cerrar) | Editar/completar requiere turno activo |
| F-GT-02 Cola de asistencia y tareas con resumen saneado | Nunca copiar mensajes privados |
| F-GT-03 Programa institucional del socio + revisiones | Motivo de cambio visible al equipo |
| F-GT-04 Traspaso de turno con aceptación | pending_acceptance hasta aceptar |
| F-GM-01 Panel del gerente | — |
| F-GM-02 Directorio del equipo | — |
| F-GM-03 Tareas operativas + reasignación | Solo metadatos |
| F-GM-04 Planificación de turnos con cobertura | — |
| F-GM-05 Participación de socios | — |
| F-GM-06 Vista de coordinador | — |
| F-GP-01 Gym Performance Center por categorías separadas | Sin puntaje combinado; resultados solo nivel sede |
| F-GP-02 Definiciones de métricas visibles | — |
| F-GP-03 Comparación contextual 2–3 | — |
| F-GP-04 Mi desempeño + disputa de atribución | — |
| F-GP-05 Detalle de entrenador | — |
| F-RV-01 Reseña verificada del socio (1–5 + dimensiones) | Prototipada en v2 del gym (persona Valentina, ahora retirada); falta en app v3 |
| F-RV-02 Analítica de reseñas con n y rango | Ocultar promedio con n<5 |
| F-RV-03 Responder / reportar (entrenador) | — |
| F-RV-04 Moderación con log y apelación | Staff no edita texto |
| F-RV-05 Políticas de reseñas (respuestas, publicación externa) | Publicación externa deshabilitada |
| F-GO-01 Ejecutivo multi-sede | — |
| F-GO-02 Comparación de sedes | — |
| F-GO-03 Puesta en marcha del gym | Activar bloqueado hasta importar |
| F-GC-01 Novedades y descuentos del gym | Solo socios de esa org |
| F-GC-02 Desafíos con premio en recepción | Reglas de técnica; sin presión insegura |
| F-GC-03 Intento de récord con video + validación | Video privado; notificación a ambas partes |
| F-GC-04 Catálogo informativo de recepción | Sin checkout |
| F-GC-05 Logros, stickers y nivel | Permanente en registro |
| F-GR-01 Rol recepción | — |
| F-GR-02 Reservas de clases | — |
| F-MO-01 Cuenta multi-organización y selector de espacio | Permisos nunca se cruzan |
| F-MO-02 Socio con gym + coach privado (dos relaciones) | Prototipado en gym v2 (retirado); app v3 sólo tweak alumnoTipo |
| F-AD-01 Admin · resumen | — |
| F-AD-02 Admin · clientes y alta | — |
| F-AD-03 Admin · suscripción editable (plan, tramos, mínimo, descuento, día de cobro, criterio de conteo) | Cambios rigen desde el próximo cobro; log |
| F-AD-04 Admin · cobros | — |
| F-AD-05 Admin · planes por defecto | — |
| F-AD-06 Admin · flags, soporte, salud, costos IA, MRR/ARR/churn | Fórmulas definidas |
| F-RC-01 Repi Club · feed y publicaciones de logros | Voluntario; nunca datos de salud |
| F-RC-02 Reacciones y comentarios | — |
| F-RC-03 Rankings con transiciones FLIP | Sin incentivar chequeo compulsivo |
| F-RC-04 Trofeos (familia + desbloqueo 3D) | — |
| F-RC-05 Moderación del Club | — |
| F-AI-01 Asistente IA del coach | Revisión humana obligatoria; no diagnosticar |
| F-PU-01 Sitio público | — |
| F-ID-01 Autenticación | — |
| F-ID-02 Onboarding del coach | — |
| F-ID-03 Invitación del alumno | — |

## E2E obligatorios
1. Brief original E2E 1–10 (registro coach → asignar; alumno sesión completa; versionado no altera historia; IDOR 403/404; offline sin duplicados; facturación snapshot exacto e idempotente; pago manual con auditoría; responsive 375–1440; auth/invitaciones; mensajería con permisos).
2. Turno: sin turno no se toma/completa/edita; con turno se completa y genera atribución.
3. Traspaso: tareas en pending_acceptance hasta aceptar; resumen sin notas personales.
4. Performance Center: sin puntaje combinado; n<5 oculta promedio; resultados solo nivel sede.
5. Privacidad: gerente/dueño reciben estado denegado + AccessAuditEvent al intentar ver chats, notas personales o salud.
6. Reseña: solo tras interacción elegible; staff no edita texto; moderación con log.
7. Récord: sin video no se envía; aprobación notifica al socio, crea MemberAchievement y actualiza récord solo si mejora; rechazo muestra motivo.
8. Catálogo de recepción sin flujo de pago.
9. Coach: Salud/Nutrición/Mi cuerpo bloqueados sin consentimiento; revocar oculta inmediatamente.
10. Admin: cambio de suscripción rige desde el próximo cobro y queda en log; criterio "máximo" factura el pico del período; día de cobro 1–28.
11. Intro: completa solo la primera vez; luego regular; reduced-motion = fade; nunca con sesión activa.
12. Constructor: nombre de día editable; asignar crea copia por cliente.
