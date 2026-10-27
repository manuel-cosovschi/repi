# REPI — Primera versión y desarrollo completo

27/10/2026. Plan de ejecución propuesto para el objetivo del usuario: lanzar primero lo principal, sin perder el producto completo. Sustituye el orden lineal antiguo que dejaba operación/hardening al final de ocho etapas. Las etapas históricas entregadas son evidencia, no tareas para repetir.

## Qué se considera primera versión

Un gym y un coach reales pueden ser habilitados por Admin, invitar su equipo/alumnos y operar con sus usuarios. El socio entra por QR, entiende cómo agregar Repi a inicio, verifica su cuenta, recibe aprobación y tiene un programa real. Entrena, registra, descansa, cierra, sincroniza y se comunica; el profesional ve lo autorizado. Recepción puede suplir al entrenador en el alta. El gym publica novedades y sus socios participan voluntariamente en el núcleo del Club. El propietario de Repi puede operar acuerdos, soporte, bajas y recuperación sin editar tablas manualmente.

Propuesta de piloto: pocas organizaciones y sedes seleccionadas, con responsables identificados; inicialmente adultos si la política de menores no está resuelta. No es una restricción comercial global ni una decisión ya aprobada. No asumir período gratis. El usuario decide cohortes/condiciones de activación; no bloquea el desarrollo de los flujos.

**Entra a V1:** dirección Atlética; acceso comercial e invitaciones; QR/aprobación y fallback; guía PWA/continuidad; entrenamiento completo y offline; builder y asignación; ficha/seguimiento básico con consentimiento; chat/pedidos; operación de sala/recepción y gestión esencial; novedades y Club básico con moderación; contratos/cantidades/precios; soporte, privacidad y operación. Reportes ya construidos, desafíos y demás funciones existentes se conservan si están probadas y son utilizables.

**No tiene que esperar V1:** reconstrucción corporal, documentos médicos/IA, trofeos 3D, apps de tiendas, integraciones de relojes/molinete, todo el calendario/CSV, analítica sofisticada, campañas, cobros automáticos si hay una operación manual expresamente acordada. No rehacer M01–M05 ya integradas para generar otra preview. La intro de marca no tiene prioridad sobre la recuperación de cuenta.

V1 del catálogo es cobertura del núcleo y verificación de lo existente, no una orden de construir 150 funcionalidades nuevas antes de lanzar. Cada entrada amplia se divide en parte mínima y expansión. Si una pieza secundaria existente falla y no compromete un flujo principal, se puede desactivar su entrada mediante flag con estado y backlog; no esconder fallos de permisos, pérdida de datos o acceso principal.

## Ruta crítica: cortes verificables

| Orden | Corte | Archivos/puntos iniciales | Salida concreta |
| --- | --- | --- | --- |
| 0 | Preservar y reanudar | Git, ESTADO_ACTUAL, scripts/tests/migraciones | Estado real identificado, sin reconstruir etapas hechas ni ejecutar tests destructivos contra datos reales |
| 1 | PWA y continuidad de alta | acceso, activar, unirse, manifest.ts, sw.js | Guía antes de primer acceso móvil; inicio desde ícono con destino recuperado; instalación sin fingir éxito |
| 2 | Correo y acceso productivo | server/mailer.ts, auth, comercial, join | Adaptador probado; verificación, recuperación y bienvenida, expiración/reenvío y destinatario; no mailbox DEV en producción |
| 3 | Alta y atención en gym | join/services, gym/Access, Floor, Reception | Recepción/piso resuelven el mismo pedido; push real y fallback; turnos/sedes/concurrencia/revocación probados |
| 4 | Ciclo Coach/Gym → alumno | ProgramBuilder, training, MemberApp, Workout, offline | Programa correcto/versionado; serie/descanso/RIR/RPE/peso fino; recarga/sync sin pérdida; pausa/baja y ayuda al piso |
| 5 | Comunicación/comunidad y gestión | ChatPane, Gym, community/club, Manage/Admin | Chats aislados, novedades reales, Club opt-in y moderación; datos de gestión reales; fallos secundarios detrás de flags |
| 6 | Operación durable y privacidad | storage, jobs, migraciones, auth/guards | DB+objetos respaldados/restaurables, jobs programados, logs/alertas, límites, exportación/borrado y responsables |
| 7 | Ensayo de lanzamiento | staging, E2E, teléfonos, contratos | Gates abajo con evidencia, pendientes explícitos y decisión go/no-go; release lista y reversible |

El orden puede cambiar para resolver una dependencia, sin volver a hacer el descubrimiento completo. Mientras llegan credenciales o políticas externas, implementar el adaptador con pruebas locales y continuar PWA, guards, biblioteca y pruebas. No inventar el secreto ni anunciar una integración como operativa por pasar un mock.

## Gates de salida V1

Registrar por gate estado pasa/falla/no probado, fecha, commit, entorno, evidencia y responsable. No marcar todos con un check por compilar.

| Gate | Condición de salida |
| --- | --- |
| G01 Acceso comercial | Admin habilita con acuerdo y una bienvenida real; invitación no aceptable por otro correo ni reutilizable; autoalta libre cerrada |
| G02 Gym sin padrón | QR permite solicitar; misma cola piso/recepción; aprobación única con permiso/turno/sede; bajas y reactivaciones controladas |
| G03 PWA | iPhone/iPad relevante y Android: guía, apertura desde inicio, continuar navegador, recuperar invitación y no bucles; iconos reales |
| G04 Entrenamiento | Dos relaciones/programas distintos, versión estable, guardado y reloj correctos, feedback e historial reales |
| G05 Offline | Recarga sin conexión, reconexión, edición concurrente, actualización de app, cambio de cuenta y baja sin pérdida o mezcla |
| G06 Permisos | Negativas entre org/sede/rol/relación, chat privado, salud, objetos y exportaciones; revocación efectiva |
| G07 Comunicación | Pedido y mensaje llegan al destinatario real; push de altas probado con dispositivo y fallback recepción disponible |
| G08 Comunidad | Publicación voluntaria, evolución permitida, reporte/bloqueo/moderación; ningún dato privado publicado por conceder acceso al coach |
| G09 Comercial | Cantidad/precio acordados y visibles; cierre simulado se identifica; modalidad de cobro del piloto acordada y trazable |
| G10 Operación | Dominio/HTTPS, entorno y DB/objetos durables; backup restaurado; jobs/errores/soporte; primer Admin seguro, sin DEMO |
| G11 Privacidad | Textos mostrados y versiones reales, tratamiento/retención/procedimiento de derechos y alcance de menores definidos por responsables |
| G12 Calidad y reversión | Build/tipos/pruebas relevantes y visual G; móviles reales, teclado/reduced-motion; release reversible y sin bloqueadores críticos |

La activación productiva depende de credenciales, dominio/hosting, políticas y autorización del usuario. Preparar la release y el informe antes de solicitar publicar. No contratar ni activar cargos por interpretar “lo antes posible”. Si un gate queda pendiente, la entrega es candidata o piloto técnico limitado, no producto productivo certificado.

## Después del lanzamiento: no descartar nada

### V1.1 — Completar la operación diaria

Cobros manuales Coach→alumno con saldo/nota/anulación y vista del alumno; esperado vs cobrado; avisos contractuales y portal; objetivos/progreso extendido; informe mensual PDF; calendario/asistencia del coach; importación CSV; configuración y perfil; centros de notificaciones; exportación/borrado autoservicio completo; sitio público/comercial. Completar biblioteca/medios y áreas que V1 dejó deliberadamente mínimas. Cobros SaaS manuales sólo si se aprobaron; no confundir ese registro con facturación fiscal.

Salida: cada flujo produce/consume datos reales en ambas superficies; ningún botón importante acaba en toast sin persistencia. Migraciones y callbacks no rompen clientes del piloto. Decidir prioridad entre estos cortes según los primeros usuarios, no por facilidad de dibujar la pantalla.

### V2 — Producto operativo ampliado

Programación avanzada (superseries/circuitos/tempo/sustituciones/calendarios), tipos de ejercicio completos, reservas/cupo/espera/cancelación, más métricas revisables, adjuntos/audio/difusión con preferencias, nutrición y aptos cuando su alcance esté definido, promociones, comunidad del coach y por sede/clase, desafíos entre socios/equipos/checkpoints y trofeos. Regla de validación presencial de récords sólo tras decisión. SaaS: proveedor real, webhooks/conciliación, comprobantes, fiscalidad, política de mora y planes/defaults versionados. Admin ampliado y soporte mínimo, sin suplantación implícita.

Salida: criterios por ID descompuestos, pruebas de permisos/datos/abuso, medición de rendimiento/costos y documentación. Puede haber cortes de BI en paralelo lógico si recursos/dependencias lo permiten; no es necesario esperar que todo V2 esté terminado para medidas manuales útiles.

### BI-1 — Registro y representación honesta

Medidas y fotos opcionales, grants, historial/corrección/exportación/borrado; visor genérico claramente rotulado, mapa de exposición y comparación de fuentes compatibles, fallback 2D. Coach ve sólo lo compartido. Entrenamiento independiente del módulo. Ajuste aproximado sólo cuando se implementa efectivamente, nunca renombrando el maniquí.

### BI-2 — Documentos y revisión

Carga de informes, extracción propuesta, revisión al lado del original, correcciones/aceptación con trazabilidad, valores/unidades/métodos comparables y retención. Revisión especializada del alcance antes de habilitar. No diagnóstico ni automatización de interpretación clínica.

### BI-3 — Captura/reconstrucción experimental

Captura guiada y calidad verificable; investigación con licencias/versiones, mediciones, grupos y rechazo; protocolo de evaluación antes de activación. No promesas del PDF como evidencia. Flag independiente y fallback; no hay fecha de producción garantizada por completar el código.

### FUTURO — Distribución e integraciones

App Store/Play Store, enlaces universales, push/cámara nativos según estrategia elegida, salud/relojes e integración externa de totales/asistencia. Verificar APIs vigentes, costos, políticas y experiencia real. No reescribir backend ni duplicar identidades. La intención de tiendas no obliga a desarrollar dos clientes nativos ahora.

## Definición de avance

Cerrar un corte completo antes de abrir varios grandes. Cada pendiente recibe ID, fase, fuente, aceptación y evidencia. No declarar “todo terminado” porque la fase actual pasó; no retrasar V1 por un experimento de fase posterior. El catálogo completo y los archivos históricos permiten comprobar que no se perdió alcance.
