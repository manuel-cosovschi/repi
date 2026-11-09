# 01 — Inventario funcional

Auditoría FSA1, 09/11/2026, sobre `main` = `ddddce8`.

## 1. Superficie del código

Inventario mecánico de `apps/web/src/app`:

| Qué | Cantidad |
| --- | --- |
| Páginas (`page.tsx`) | 28: público, `/conoce`, `/qr`, `/acceso`, `/unirse`, apps de alumno (`/app`), coach, gym, admin, ventas, tutor, cuenta, demo, legal y ayuda. Las apps tienen secciones internas, que se recorrieron por rol |
| Rutas de API (`route.ts`) | 157: 90 GET, 102 POST, 6 DELETE, 3 PUT y 2 PATCH, contando métodos por ruta |
| Rutas con `[orgId]` | Todas barridas con la organización de la víctima (05 §2) |
| Rutas sin un guard reconocible por nombre | `/qr`, `/api/version`, `/api/auth/*` (Better Auth), el heartbeat del respaldo (OIDC) y `/api/me/export`, `/api/me/photo-file/[id]`, `/api/media/[id]`, `/api/agenda/[id]/ics`. Las cuatro últimas resuelven la sesión con `sessionUserId()` y validan la pertenencia en el servicio; atacadas en 05 |
| Tareas programadas | 2 jobs de pg_cron, 1 cron de Vercel y el respaldo de GitHub (07 §7) |
| Feature flags | `NEXT_PUBLIC_REPI_FEATURES` (sin definir en producción: valores por defecto de `docs/FEATURE_FLAGS.md`), `REPI_SALES`, `REPI_GYM_HOURS` y `REPI_QR_DESTINATION` |

El inventario de producto (`docs/PRODUCT_INVENTORY.md`, generado) tiene 166 entradas: 82 «probado», 26 «integrado», 9 «persistente», 42 «sin implementar», 1 estática y 6 que no aplican. Las «sin implementar» son alcance planeado (Body Intelligence 3D, DXA, etc.): **no se auditaron como defectos**.

## 2. Inventario por rol y módulo

**Estado:** activo / no implementado / desactivado.

**Resultado:**
- ✓ verificado de punta a punta;
- ✓* verificado tras corregir un defecto;
- ◐ verificado parcialmente (ver 09);
- — no verificable en este entorno.

Cada auditor dejó además una fila por acción con la ruta, la persistencia, el permiso y la prueba; ese detalle está en sus pruebas y en 02.

### Socio

| Módulo | Acciones | Estado | Resultado | Defectos |
| --- | --- | --- | --- | --- |
| Acceso | Registro, verificación por código, ingreso con contraseña y con 2FA, recuperar contraseña, enlace por email, alta por QR o enlace, solicitud pendiente, aprobada o rechazada, consentimientos | activo | ✓* | SEC-01 |
| Inicio | Próximo entrenamiento, en curso y continuar, rotación tras terminar, sin programa (pedir programa o rutina propia) | activo | ✓ (sin programa: ◐) | — |
| Entrenamiento | Iniciar, registrar serie (peso, repeticiones, RIR, sensación, nota, tiempo), corregir, doble toque, topes, saltar, reemplazar, volver al original, descanso, pausar y finalizar | activo | ✓* | MEM-01, MEM-02, MEM-05 |
| Entrenamiento | Agregar ejercicio o reordenar en la sesión | no implementado (D195: orden fijo, la lista permite saltar) | — | — |
| Métodos avanzados | Rectas, aproximación, top set, back-off, drop, rest-pause, myo, cluster, pirámide, EMOM multi-dispositivo, AMRAP, combinados y circuitos, por tiempo (duración, velocidad, inclinación), peso corporal | activo | ✓ | — |
| Training Intelligence | Objetivo por fila, ajuste tras cada serie, la carga del profe manda, lb, sin datos inventados, anuladas excluidas | activo | ✓ | — |
| Sin conexión y sincronización | Respuesta perdida, 500, dos pestañas, sin almacenamiento, recarga sin red, sesión cerrada por el servidor, cola idempotente | activo | ✓* | MEM-03, MEM-02, MEM-04 |
| Historial | Corregir, anular, restaurar y agregar serie; anular sesión | activo | ✓ | — |
| Mis rutinas | Crear, editar (↑↓), duplicar, borrar, empezar y repetir, convivencia con el programa, tope de 30 | activo | ✓* | IMP-08, IMP-09 |
| Mis rutinas | Reordenar rutinas entre sí | no implementado | — | — |
| Smart Import 2.0 | Texto, WhatsApp, planilla, foto, captura y PDF (IA simulada); faltante, dudoso y sugerido; biblioteca y variantes; borrador; todo o nada; idempotencia; procedencia | activo | ✓* (IA real: —) | IMP-01, IMP-02, IMP-07, IMP-10 |
| Historial importado | Vista previa, duplicados, quitar, emparejar con IA | activo | ✓* | IMP-06 |
| Historial importado | Corregir el emparejamiento ejercicio por ejercicio | no implementado | — | — |
| Progreso | Resumen, evolución por ejercicio, 1RM, carga, volumen, récords, rangos, importado, kg y lb, gráfico | activo | ✓* | IMP-04 |
| Mi cuerpo | Puerta de edad, peso (registrar, mismo día, editar, borrar), objetivo, calorías | activo | ✓* | IMP-09 |
| Fotos de progreso | Subir (sin EXIF), comparar, borrar (borra el objeto), privadas | activo | ✓* (e2e con Storage real: —) | IMP-05 |
| Mensajes | Enviar idempotente, estado de lectura, aislamiento entre organizaciones | activo | ✓ | — |
| Club y comunidad | Publicaciones, aplausos, comentarios, reportar, bloquear, ranking, desafíos e intentos | activo | ✓* | SEC-03, COM-04 |
| Notificaciones | Campanita, novedades de REPI, push del asistente con puertas de edad y horario | activo | ✓ (push real: —) | — |
| Privacidad | Descargar mis datos, pedir y cancelar eliminación, cerrar sesión | activo | ✓* | SEC-04, SEC-05 |
| Asistente REPI | Chat, tarjetas de Inicio, intervenciones, presupuestos de IA con respaldo por reglas | activo | ✓ (modelo real: —) | — |
| «No vino el profe» y rutina sin programa | Sugerencia con IA o reglas; cargas validadas | activo | ◐ | COM-07, COM-08 |

### Coach independiente

| Módulo | Acciones | Estado | Resultado | Defectos |
| --- | --- | --- | --- | --- |
| Clientes | Invitar, aceptar, ficha, pausar, reactivar, terminar, salud con consentimiento | activo | ✓ | — |
| Programas | Crear, asignar (copia por cliente), autoguardado, versionar, duplicar, eliminar, pegar día, distribuir plantillas | activo | ✓* | STF-02, STF-03 |
| Panel | Activos, sin programa, sesiones, adherencia, invitaciones | activo | ✓* | STF-07 |
| Training Intelligence | Propuestas: aceptar, mantener, rechazar, revisar en el editor | activo | ✓ (e2e con siembra en la corrida final) | — |
| Informes, agenda (`.ics`), cobros, objetivos, reemplazos, importación, asistente de programas | — | activo | ✓ por sus pruebas existentes | SEC-09 |

### Sala (piso y coordinación)

| Módulo | Acciones | Estado | Resultado | Defectos |
| --- | --- | --- | --- | --- |
| Turno | Iniciar y cerrar con traspaso, fin de turno con pendientes | activo | ✓ | — |
| Cola y Connect | Tomar (concurrente: uno gana), completar, aceptar traspaso, reasignar, seguir, resolver | activo | ✓* | COM-02 |
| Permisos vigentes | Cambio de rol, baja o cambio de sede con la pantalla abierta | activo | ✓ (403/404 en el pedido siguiente) | — |
| Ficha del socio | Series y notas (sólo el equipo de la sede y con consentimiento), preferencias, pedido de programa | activo | ✓* | STF-01 |
| Programa institucional | Editar con motivo, versión nueva, sesión en curso conserva su versión | activo | ✓* | Modal (UI) |
| Notas, equipamiento por sede, mensajes de la sede, avisos | — | activo | ✓* | COM-06 |

### Dueño y gerencia

| Módulo | Acciones | Estado | Resultado | Defectos |
| --- | --- | --- | --- | --- |
| Panel, participación, ejecutivo, desempeño | KPIs por sede y «Todas» | activo | ✓* (cifras exactas contra lo sembrado) | STF-04, STF-05, STF-06 |
| Solicitudes de acceso | Aprobar o rechazar (`FOR UPDATE`), escalamiento a los 5 minutos, email de la decisión | activo | ✓* | COM-03 |
| Accesos y QR | Suspender, terminar, reactivar, vigencia | activo | ✓ | — |
| Equipo | Invitar | activo | ✓ | — |
| Equipo | Quitar a alguien, cambiar rol o sede | **no implementado** | — | **STF-09 (P1)** |
| Comunidad | Novedades, descuentos, desafíos, moderación | activo | ✓* | COM-04 |
| Privacidad de los socios | Ve asistencia y adherencia; no ve series, notas, salud ni Mi cuerpo | activo | ✓* | STF-01 |

### REPI Admin

| Módulo | Acciones | Estado | Resultado | Defectos |
| --- | --- | --- | --- | --- |
| Acceso | Contraseña + TOTP; un socio o un coach reciben 404 | activo | ✓* | SEC-01 |
| Clientes y contratos | Alta, aceptación, habilitar, suspender, prueba, términos, cerrar período, permisos de Connect y acceso, responsable, bienvenida | activo | ✓* | COM-05 |
| Contactos (leads) | Cambiar estado (persistido y auditado) | activo | ✓* | COM-05 |
| Novedades de REPI | Crear, publicar, audiencia, lecturas | activo | ✓ | — |
| Privacidad | Resolver pedidos (idempotente, auditado) | activo | ✓ | — |
| Ventas (Sales Force OS) | Vendedores, planes, acuerdos, comisiones, liquidaciones, exportaciones, invitación de vendedor | activo | ✓ (escaneo estático de guards) | SEC-07 |
| Soporte, coaching IA, configuración del sitio y QR | — | activo | ✓ por sus pruebas existentes; coaching IA en producción: — (requiere cuenta admin real) | — |

### Público

`/`, `/conoce` y sus tres páginas, `/qr`, `/demo`, `/acceso`, `/ayuda`, `/legal`, `/instalar`, `/ranking` y `/creditos`: cargan sin errores, sin scroll lateral y pasan axe en móvil y escritorio (e2e `public.spec.ts`, `conoce.spec.ts`; detalle de interfaz en 04).
