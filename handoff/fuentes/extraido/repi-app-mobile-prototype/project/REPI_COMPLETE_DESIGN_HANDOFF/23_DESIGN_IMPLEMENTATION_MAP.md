# 23 · Mapa diseño → implementación

Stack recomendado por el brief original: monolito modular TypeScript, Next.js App Router, React, Tailwind + Radix/shadcn, PostgreSQL + Prisma, auth mantenida, outbox para jobs, almacenamiento privado con URLs firmadas, PWA. Motion: CSS + Motion for React; three.js / React Three Fiber para el visor.

## Pantalla → ruta → fuente
| Pantalla | Nombre | Ruta propuesta | Fuente de diseño | Estado | Features |
|---|---|---|---|---|---|
| SCR-M-01 | Intro / splash de marca | (app boot) | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BR-02 |
| SCR-M-02 | Inicio del alumno | /app | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-CL-01 |
| SCR-M-03 | Entrenar · semana y detalle de día | /app/train | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-CL-02 |
| SCR-M-04 | Entrenamiento activo · registro de series | /app/workout/:sessionId | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-CL-03, F-CL-04 |
| SCR-M-05 | Entrenamiento completado | /app/workout/:id/summary | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-CL-05 |
| SCR-M-06 | Progreso (Fuerza/Volumen/Constancia/Medidas) | /app/progress?tab= | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-CL-06 |
| SCR-M-07 | Mi cuerpo · introducción | /app/body/intro | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-01 |
| SCR-M-08 | Mi cuerpo · consentimiento por tipo de dato | /app/body/consent | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-02 |
| SCR-M-09 | Mi cuerpo · método | /app/body/method | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-03 |
| SCR-M-10 | Mi cuerpo · medidas manuales | /app/body/manual | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-04 |
| SCR-M-11 | Mi cuerpo · captura guiada (4 poses) | /app/body/capture | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-05 |
| SCR-M-12 | Mi cuerpo · revisión de fotos | /app/body/review | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-05 |
| SCR-M-13 | Mi cuerpo · procesando | /app/body/processing | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-05, F-BI-06 |
| SCR-M-14 | Mi cuerpo · fallo de reconstrucción 3D | /app/body/failed | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-06 |
| SCR-M-15 | Mi cuerpo · visor 3D | /app/body | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-07, F-BI-08 |
| SCR-M-16 | Comparar fechas (hoja inferior) | /app/body/compare | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-BI-09 |
| SCR-M-17 | Mensajes con el coach | /app/messages | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-MS-01 |
| SCR-M-18 | Perfil y privacidad | /app/profile | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-PR-01, F-PR-02 |
| SCR-M-19 | Gym · Novedades y descuentos | /app/gym?tab=news | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-GC-01 |
| SCR-M-20 | Gym · Desafíos | /app/gym?tab=ch | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-GC-02, F-GC-03 |
| SCR-M-21 | Subir intento de récord (hoja) | /app/gym/challenge/:id/attempt | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-GC-03 |
| SCR-M-22 | Gym · Recepción (catálogo informativo) | /app/gym?tab=shop | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-GC-04 |
| SCR-M-23 | Gym · Logros y nivel | /app/gym?tab=logros | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-GC-05 |
| SCR-M-24 | Notificaciones (hoja) | /app/notifications | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-NT-01 |
| SCR-M-25 | Logro validado (overlay) | (evento) | prototypes/REPI App Alumno v3.dc.html | interactive_prototype | F-GC-05 |
| SCR-MI-01 | Concepto intro 1a · El punto (APROBADO) | (review) | prototypes/REPI Motion Intro.dc.html | interactive_prototype | F-BR-02 |
| SCR-MI-02 | Concepto intro 1b · La repetición | (review) | prototypes/REPI Motion Intro.dc.html | future_concept | F-BR-02 |
| SCR-MI-03 | Concepto intro 1c · Símbolo vivo | (review) | prototypes/REPI Motion Intro.dc.html | future_concept | F-BR-02 |
| SCR-GT-01 | Mi turno (entrenador de sala) | /w/:orgId/trainer | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GT-01, F-GT-04 |
| SCR-GT-02 | Cola de asistencia | /w/:orgId/trainer/queue | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GT-02 |
| SCR-GT-03 | Socios · búsqueda + ficha institucional | /w/:orgId/trainer/members/:id | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GT-03, F-PR-03 |
| SCR-GT-04 | Traspaso de turno | /w/:orgId/trainer/handoff | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GT-04 |
| SCR-GT-05 | Mi desempeño | /w/:orgId/trainer/performance | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GP-04, F-RV-03 |
| SCR-GM-01 | Panel de la sede (gerente) | /w/:orgId/manage | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GM-01 |
| SCR-GM-02 | Gym Performance Center | /w/:orgId/manage/performance | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GP-01, F-GP-02, F-GP-03 |
| SCR-GM-03 | Equipo (directorio) | /w/:orgId/manage/staff | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GM-02 |
| SCR-GM-04 | Detalle de entrenador | /w/:orgId/manage/staff/:id | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GP-05, F-PR-04 |
| SCR-GM-05 | Tareas operativas | /w/:orgId/manage/tasks | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GM-03 |
| SCR-GM-06 | Reseñas (análisis · moderación · historial de accesos) | /w/:orgId/manage/reviews | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-RV-02, F-RV-04, F-PR-04 |
| SCR-GM-07 | Planificación de turnos | /w/:orgId/manage/shifts | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GM-04 |
| SCR-GM-08 | Participación de socios | /w/:orgId/manage/engagement | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GM-05 |
| SCR-GC-01 | Comunidad del gym (Novedades · Desafíos · Recepción) | /w/:orgId/community | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GC-01, F-GC-02, F-GC-04 |
| SCR-GC-02 | Validación de récords | /w/:orgId/community/validations | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GC-03 |
| SCR-GO-01 | Ejecutivo (dueño) | /w/:orgId/owner/overview | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GO-01 |
| SCR-GO-02 | Comparación de sedes | /w/:orgId/owner/locations | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GO-02 |
| SCR-GO-03 | Facturación REPI (gym) | /w/:orgId/owner/billing | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-BL-03 |
| SCR-GO-04 | Configuración del gym | /w/:orgId/owner/settings | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GO-03, F-RV-05 |
| SCR-GX-01 | Modal · comparar con contexto | (modal) | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GP-03 |
| SCR-GX-02 | Modal · acceso no disponible | (modal) | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-PR-04 |
| SCR-GX-03 | Modal · editar programa institucional | (modal) | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GT-03 |
| SCR-GX-04 | Modal · nueva tarea | (modal) | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GT-02 |
| SCR-GX-05 | Modal · disputa / reporte | (modal) | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-RV-03 |
| SCR-GX-06 | Modal · responder reseña | (modal) | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-RV-03 |
| SCR-GX-07 | Modal · moderar caso | (modal) | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-RV-04 |
| SCR-GX-08 | Modal · reasignar tarea | (modal) | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-GM-03 |
| SCR-GX-09 | Selector de espacio de trabajo + barra "ver como" | (global) | prototypes/REPI Desktop Gym.dc.html | interactive_prototype | F-MO-01 |
| SCR-C-01 | Panel del coach | /w/:coachOrgId/dashboard | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-01 |
| SCR-C-02 | Clientes · directorio + ficha (split) | /w/:coachOrgId/clients/:id | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-02 |
| SCR-C-02a | Ficha · Resumen | tab=res | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-03 |
| SCR-C-02b | Ficha · Rendimiento | tab=rend | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-04 |
| SCR-C-02c | Ficha · Rutinas | tab=prog | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-05 |
| SCR-C-02d | Ficha · Progreso | tab=progreso | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-04 |
| SCR-C-02e | Ficha · Salud | tab=salud | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-06, F-PR-05 |
| SCR-C-02f | Ficha · Nutrición | tab=nutri | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-07 |
| SCR-C-02g | Ficha · Mi cuerpo | tab=body | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-BI-10 |
| SCR-C-02h | Ficha · Pagos | tab=pay | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-BL-01 |
| SCR-C-03 | Constructor de programas | /w/:coachOrgId/programs/:id | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-08 |
| SCR-CX-01 | Modal · asignar programa | (modal) | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-CO-08 |
| SCR-C-04 | Mensajes del coach | /w/:coachOrgId/messages/:threadId | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-MS-01 |
| SCR-C-05 | Pagos del coach | /w/:coachOrgId/payments | prototypes/REPI Desktop Coach.dc.html | interactive_prototype | F-BL-01, F-BL-02 |
| SCR-A-01 | Admin · Resumen | /admin | prototypes/REPI Admin.dc.html | interactive_prototype | F-AD-01 |
| SCR-A-02 | Admin · Clientes (gyms y coaches) | /admin/clients | prototypes/REPI Admin.dc.html | interactive_prototype | F-AD-02 |
| SCR-A-03 | Admin · Ficha de suscripción | /admin/clients/:id | prototypes/REPI Admin.dc.html | interactive_prototype | F-AD-03 |
| SCR-A-04 | Admin · Cobros | /admin/invoices | prototypes/REPI Admin.dc.html | interactive_prototype | F-AD-04 |
| SCR-A-05 | Admin · Planes y precios | /admin/plans | prototypes/REPI Admin.dc.html | static_mockup | F-AD-05 |
| SCR-AX-01 | Admin · Modal nuevo cliente | (modal) | prototypes/REPI Admin.dc.html | interactive_prototype | F-AD-02 |
| SCR-L-01 | REPI Escritorio (desktop unificado, incompleto) | — | prototypes/legacy/REPI Escritorio (incompleto).dc.html | partially_designed |  |

## Cómo leer un .dc.html
- Plantilla entre `<x-dc>` y `</x-dc>`: estilos inline (tomar valores, no la técnica); `{{ }}` = datos.
- Lógica en `<script data-dc-script>`: `class Component` con `state`, `renderVals()` y datos demo como constantes arriba.
- `sc-if` / `sc-for` = condicionales / listas. Animaciones en métodos (`playIntro`, `celebrate`, `animProg`, `enter`, `initBody`).
