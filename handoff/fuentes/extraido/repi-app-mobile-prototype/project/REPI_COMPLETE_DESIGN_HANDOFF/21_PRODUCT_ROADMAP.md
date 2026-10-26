# 21 · Roadmap (prioridades PROPUESTAS)

Solo "MVP" del brief original está confirmado (registro coach, alumnos, rutinas, registro de sesiones, suscripción REPI). El resto es propuesta. Requieren revisión legal: F-BI-02, F-BI-05, F-BI-06, F-BI-11, F-CO-06, F-CO-07, F-GC-03, F-PR-05. Requieren investigación técnica/científica: F-BI-06, F-BI-07, F-BI-08, F-BI-11, F-CL-07.

## MVP (22)
| ID | Funcionalidad | Estado | Dependencias | Complejidad |
|---|---|---|---|---|
| F-BR-01 | Identidad Concepto 2 (wordmark, isotipo, paleta, Inter Tight) | Diseñado | — | S |
| F-CL-01 | Inicio del alumno | Prototipo interactivo | F-CO-08 | M |
| F-CL-02 | Semana y detalle de día | Prototipo interactivo | F-CO-08 | S |
| F-CL-03 | Registro de series en un toque | Prototipo interactivo | — | L |
| F-CL-04 | Temporizador de descanso (reloj real) | Prototipo interactivo | F-CL-03 | M |
| F-CL-05 | Resumen de sesión + récord personal validado | Prototipo interactivo | F-CL-03 | M |
| F-CL-06 | Progreso (fuerza, volumen, constancia, medidas) | Prototipo interactivo | F-CL-03 | M |
| F-CL-07 | Offline + sincronización idempotente | Especificado, no diseñado | — | L |
| F-CO-01 | Panel del coach con pendientes accionables | Prototipo interactivo | — | M |
| F-CO-02 | Directorio de clientes split view | Prototipo interactivo | — | M |
| F-CO-05 | Registro de sesiones con notas del alumno | Prototipo interactivo | F-CL-03 | S |
| F-CO-08 | Constructor de programas (días renombrables, duplicar, asignar) | Prototipo interactivo | — | L |
| F-CO-09 | Biblioteca de ejercicios completa | Parcialmente diseñado | — | L |
| F-BL-01 | Cobros manuales del coach a sus clientes | Prototipo interactivo | — | M |
| F-BL-02 | Suscripción REPI Coach (por alumno facturable) | Prototipo interactivo | F-AD-03 | M |
| F-AD-01 | Admin · resumen | Prototipo interactivo | — | M |
| F-AD-02 | Admin · clientes y alta | Prototipo interactivo | — | M |
| F-AD-03 | Admin · suscripción editable (plan, tramos, mínimo, descuento, día de cobro, criterio de conteo) | Prototipo interactivo | — | L |
| F-AD-04 | Admin · cobros | Prototipo interactivo | — | M |
| F-ID-01 | Autenticación | Especificado, no diseñado | — | M |
| F-ID-02 | Onboarding del coach | Especificado, no diseñado | — | M |
| F-ID-03 | Invitación del alumno | Especificado, no diseñado | — | M |

## V1 (46)
| ID | Funcionalidad | Estado | Dependencias | Complejidad |
|---|---|---|---|---|
| F-BR-02 | Intro de marca 1a + inicio regular + reducido | Prototipo interactivo | F-BR-01 | M |
| F-BI-01 | Mi cuerpo · introducción | Prototipo interactivo | — | S |
| F-BI-02 | Consentimiento granular por tipo de dato | Prototipo interactivo | — | M |
| F-BI-03 | Elección de método (manual/fotos/3D experimental) | Prototipo interactivo | F-BI-02 | S |
| F-BI-04 | Medidas manuales con fuente | Prototipo interactivo | F-BI-02 | S |
| F-PR-01 | Compartir/revocar por tipo de dato con historial de accesos | Prototipo interactivo | — | M |
| F-PR-02 | Exportar y eliminar datos | Parcialmente diseñado | — | M |
| F-PR-03 | Notas institucionales vs personales | Prototipo interactivo | — | S |
| F-PR-04 | Acceso denegado + auditoría de intentos | Prototipo interactivo | — | S |
| F-PR-05 | Datos de salud del alumno al coach por consentimiento | Prototipo interactivo | — | M |
| F-MS-01 | Chat coach–alumno | Prototipo interactivo | — | M |
| F-NT-01 | Centro de notificaciones del alumno | Prototipo interactivo | — | M |
| F-NT-02 | Preferencias / push / email | Especificado, no diseñado | — | M |
| F-CO-03 | Objetivos del cliente con progreso | Prototipo interactivo | — | S |
| F-CO-04 | Rendimiento: 1RM estimado, volumen por grupo, fortalezas/mejoras, check-in | Prototipo interactivo | F-CL-03 | L |
| F-CO-06 | Salud: lesiones, molestias 0–10, condiciones | Prototipo interactivo | F-PR-05 | M |
| F-CO-10 | Calendario / asistencia | Especificado, no diseñado | — | M |
| F-CO-11 | Importación CSV | Especificado, no diseñado | — | M |
| F-BL-03 | Facturación REPI Gym (tramos, mínimo, módulos) | Prototipo interactivo | F-AD-03 | M |
| F-GT-01 | Turno del entrenador de sala (iniciar/cerrar) | Prototipo interactivo | — | M |
| F-GT-02 | Cola de asistencia y tareas con resumen saneado | Prototipo interactivo | — | M |
| F-GT-03 | Programa institucional del socio + revisiones | Prototipo interactivo | — | M |
| F-GT-04 | Traspaso de turno con aceptación | Prototipo interactivo | F-GT-02 | M |
| F-GM-01 | Panel del gerente | Prototipo interactivo | — | M |
| F-GM-02 | Directorio del equipo | Prototipo interactivo | — | S |
| F-GM-03 | Tareas operativas + reasignación | Prototipo interactivo | F-GT-02 | M |
| F-GP-01 | Gym Performance Center por categorías separadas | Prototipo interactivo | — | L |
| F-GP-02 | Definiciones de métricas visibles | Prototipo interactivo | — | S |
| F-GP-03 | Comparación contextual 2–3 | Prototipo interactivo | — | S |
| F-GP-04 | Mi desempeño + disputa de atribución | Prototipo interactivo | — | M |
| F-GP-05 | Detalle de entrenador | Prototipo interactivo | — | M |
| F-RV-01 | Reseña verificada del socio (1–5 + dimensiones) | Parcialmente diseñado | F-GT-03 | M |
| F-RV-02 | Analítica de reseñas con n y rango | Prototipo interactivo | — | M |
| F-RV-03 | Responder / reportar (entrenador) | Prototipo interactivo | — | S |
| F-RV-04 | Moderación con log y apelación | Prototipo interactivo | — | M |
| F-RV-05 | Políticas de reseñas (respuestas, publicación externa) | Prototipo interactivo | — | S |
| F-GO-01 | Ejecutivo multi-sede | Prototipo interactivo | — | M |
| F-GO-03 | Puesta en marcha del gym | Prototipo interactivo | F-CO-11 | M |
| F-GC-01 | Novedades y descuentos del gym | Prototipo interactivo | — | M |
| F-GC-02 | Desafíos con premio en recepción | Prototipo interactivo | — | M |
| F-GC-03 | Intento de récord con video + validación | Prototipo interactivo | F-GC-02 | L |
| F-GC-04 | Catálogo informativo de recepción | Prototipo interactivo | — | S |
| F-GC-05 | Logros, stickers y nivel | Prototipo interactivo | F-GC-03 | M |
| F-MO-01 | Cuenta multi-organización y selector de espacio | Prototipo interactivo | — | L |
| F-AD-05 | Admin · planes por defecto | Mockup estático | — | S |
| F-PU-01 | Sitio público | Especificado, no diseñado | — | M |

## V2 (20)
| ID | Funcionalidad | Estado | Dependencias | Complejidad |
|---|---|---|---|---|
| F-BI-05 | Captura guiada de fotos (4 poses) con chequeo de calidad | Prototipo interactivo | F-BI-02 | L |
| F-BI-07 | Visor 3D (rotar, zoom, vistas, capas, regiones) | Prototipo interactivo | three.js | L |
| F-BI-08 | Mapa de exposición de entrenamiento por región | Prototipo interactivo | F-CL-03 | M |
| F-BI-09 | Comparación entre fechas (swipe) con aviso de comparabilidad | Prototipo interactivo | F-BI-05 | M |
| F-BI-10 | Coach ve Mi cuerpo compartido | Prototipo interactivo | F-BI-02 | S |
| F-MS-02 | Mensajería autorizada en el gym | Especificado, no diseñado | — | M |
| F-CO-07 | Nutrición: macros, kcal, hidratación, peso, comidas | Parcialmente diseñado | Registro de nutrición en app (no diseñado) | L |
| F-CO-12 | Configuración / perfil público | Especificado, no diseñado | — | M |
| F-BL-04 | Checkout / pasarela (Mercado Pago) | Especificado, no diseñado | Legal | L |
| F-GM-04 | Planificación de turnos con cobertura | Prototipo interactivo | — | M |
| F-GM-05 | Participación de socios | Prototipo interactivo | — | M |
| F-GM-06 | Vista de coordinador | Especificado, no diseñado | — | S |
| F-GO-02 | Comparación de sedes | Prototipo interactivo | — | S |
| F-GR-01 | Rol recepción | Especificado, no diseñado | — | M |
| F-MO-02 | Socio con gym + coach privado (dos relaciones) | Parcialmente diseñado | F-MO-01 | M |
| F-AD-06 | Admin · flags, soporte, salud, costos IA, MRR/ARR/churn | Especificado, no diseñado | — | L |
| F-RC-01 | Repi Club · feed y publicaciones de logros | Especificado, no diseñado | — | L |
| F-RC-02 | Reacciones y comentarios | Especificado, no diseñado | F-RC-01 | M |
| F-RC-03 | Rankings con transiciones FLIP | Especificado, no diseñado | — | M |
| F-RC-05 | Moderación del Club | Especificado, no diseñado | — | M |

## V3 (4)
| ID | Funcionalidad | Estado | Dependencias | Complejidad |
|---|---|---|---|---|
| F-BI-11 | Carga de DXA/bioimpedancia/laboratorio (PDF) + extracción revisada | Especificado, no diseñado | Legal | L |
| F-GR-02 | Reservas de clases | Especificado, no diseñado | — | L |
| F-RC-04 | Trofeos (familia + desbloqueo 3D) | Especificado, no diseñado | — | L |
| F-AI-01 | Asistente IA del coach | Especificado, no diseñado | F-AD-06 | L |

## Experimental (1)
| ID | Funcionalidad | Estado | Dependencias | Complejidad |
|---|---|---|---|---|
| F-BI-06 | Reconstrucción 3D personalizada + estado de fallo honesto | Parcialmente diseñado | Investigación científica | XL |

