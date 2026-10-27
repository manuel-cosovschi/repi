# REPI — Máster de continuidad, primera versión y producto completo

Versión 27/10/2026. Encargo activo del usuario: continuar el desarrollo existente, lanzar cuanto antes una primera versión con todo lo principal y completar después todo el alcance. Este archivo reemplaza el máster del 25/10, conservado en `documentacion/historial/2026-10-27_antes_de_continuidad/MASTER_PROMPT.md`. No es una orden de empezar de cero ni una certificación de que producción ya funciona.

## 1. Tu misión y primer paso

Actuá como responsable de continuidad del desarrollo de Repi. Usá esta carpeta completa como repositorio. No necesitás acceso al chat anterior para comenzar. Construí sobre el código existente; preservá cambios de otros agentes y datos. Primero cerrá los bloqueos y recorridos de la primera versión. No demores ese lanzamiento para terminar Body Intelligence experimental, IA, tiendas móviles o cada ampliación futura. Tampoco borres esas capacidades del plan.

Orden de lectura inicial, acotado para ahorrar contexto:

1. Este máster completo y `CLAUDE.md`/AGENTS.md aplicables.
2. `docs/continuidad/ESTADO_ACTUAL.md` y `PROXIMA_SESION.md`.
3. `docs/continuidad/PLAN_LANZAMIENTO_Y_ROADMAP.md` y `DECISIONES_PENDIENTES.md`.
4. `REPI_SELECCION_VISUAL.md`, `docs/DESIGN_CONTRACT.md` y `motion.md` §12 para no rehacer diseño/motion ya integrado.
5. Consultá `docs/continuidad/CATALOGO_COMPLETO.md` y su JSON para el módulo que vas a tocar. Contienen todas las entradas del inventario anterior más requisitos posteriores y necesidades operativas.
6. Leé los archivos relevantes de `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, los anexos y el handoff vigente según `docs/continuidad/FUENTES_Y_PRECEDENCIA.md`.

Inspeccioná Git, scripts, migraciones y código actual. Elegí el primer bloqueo real del lanzamiento que puedas resolver y ejecutá un corte verificable. No gastes toda la sesión regenerando inventarios, reinstalando dependencias o leyendo de nuevo cada archivo ya auditado. Sí revisá el contexto necesario y descubrí novedades del handoff cuando trabajes en ese módulo. Cada entrega debe dejar código funcional, evidencia y próximo paso; si falta una decisión externa, continuá el trabajo independiente.

## 2. Autoridad, certeza y alcance completo

Mandato más reciente del usuario > decisiones explícitamente confirmadas > este máster consolidado y selección Atlética > anexos vigentes > decisiones documentadas con su grado de certeza > handoff actual > investigación/propuestas > legacy. El código demuestra qué existe, no convierte automáticamente una decisión de un agente en aprobación comercial o jurídica. Un documento que dice probado no reemplaza una prueba actual.

Conservá tres ejes: certeza de producto, estado técnico y fase de entrega. Usá confirmado/documentado/propuesto/en conflicto/retirado; no implementado/parcial/integrado/verificado; V1/V1.1/V2/BI experimental/futuro. Un feature marcado probado en el inventario viejo puede cubrir sólo una parte de su nombre. Los criterios vacíos se completan con comportamiento y prueba; no se marcan satisfechos por inferencia.

Hay funcionalidades nuevas dentro del handoff que no estaban en mensajes ni IDs iniciales. No limites el producto a 93 ni a 166 entradas. Agregá hallazgos con fuente y aceptación. El catálogo es una base de cobertura, no una promesa de anticipar toda necesidad futura. La petición «todo lo necesario» autoriza completar flujos y operación; no autoriza inventar reglas de precio, diagnósticos, acceso sensible, cobros reales o servicios pagos.

El catálogo conserva los requisitos retirados con motivo: **no reactivar** cobro de cuota gym→socio, autoalta comercial libre, trial automático, padrón/DNI obligatorio, precios demo por defecto ni impersonación desde los paneles. Los nombres viejos de algunas entradas están normalizados en el catálogo de continuidad.

## 3. Producto, personas y modelo comercial

Repi es una plataforma de entrenamiento y seguimiento con una sola identidad por persona y varias relaciones/contextos:

- Alumno/socio: web/PWA móvil para entrenar, registrar, progresar, comunicarse y controlar privacidad.
- Coach: profesional independiente presencial, remoto o híbrido; clientes, programas, seguimiento y cobros propios.
- Gym: socio, entrenador de piso, coordinador, recepción, gerente y dueño; operación por sede y cadena.
- Escritorio: herramientas de trabajo de Coach, Gym y Admin; no un teléfono agrandado.
- Repi Admin: altas comerciales, contratos, facturación SaaS y operación, sin acceso universal a datos privados.
- Comunidad/Repi Club, Body Intelligence, notificaciones, pagos e IA como módulos con permisos y etapas propias.

Una persona puede ser alumno, coach privado y empleado de un gym. No duplicar cuentas ni heredar permisos entre relaciones. Un socio con gym y coach elige el programa/contexto de su sesión; la sesión conserva su origen aunque cambie de pantalla. Chat, métricas, datos compartidos y asignaciones respetan esa separación.

**Confirmado:** Gym paga por todos los socios acordados, aunque no hayan activado Repi. Admin carga manualmente la cantidad acordada; preparar integración futura. Coach paga por todos sus alumnos vigentes, aunque no tengan cuenta o no usen la app. Precio unitario negociable por cliente, modificable por Repi Admin con vigencia, autor y motivo. Cantidad y precio son versiones distintas; cambios no reescriben períodos cerrados. Uso/cuentas habilitadas son adopción, no facturación. Si superan el total acordado, alertar para revisión sin cobro o bloqueo automático. No usar ARS 700 ni tramos demo como precio aprobado.

Mantener separados: (1) Coach cobra manualmente a alumnos; (2) Coach/Gym paga a Repi; (3) cuota Gym→socio fuera del alcance. Catálogo de recepción informativo, sin checkout. Cantidades, monedas, corte, descuentos, impuestos, mora y prorrateos necesitan reglas explícitas antes de cobrar. No elegir un proveedor como si ya estuviera contratado.

## 4. Diseño aprobado y motion

**Concepto 2 + variante G · Atlética**, confirmados. Paleta #0B0F14, #1A2433, #2D3B4F, #00D1FF, #5DE6D8, #F8FAFC. Alumno oscuro; escritorios claros con navegación navy donde corresponda. Logo e ícono originales, proporciones y punto cian intactos. No escribir el logo con una fuente ni redibujarlo. Barlow Condensed 700 en títulos destacados, Barlow en cuerpo e interfaz; JetBrains Mono sólo para códigos/usos técnicos existentes. Números tabulares, español rioplatense, es-AR y unidades explícitas.

Phosphor Bold para íconos internos; las excepciones de reproducción documentadas no cambian el estilo general. Barra móvil Cristal flotante con indicador interior; cambio de sección por fundido de 160 ms, barra estable y conservación de scroll. No imponer tabbar móvil a escritorio ni eliminar destinos para copiar el laboratorio.

M01 selección de día; M02 resumen/celebración con datos reales; M03 carga ambiental/revelado; M04 RPE y RIR separados; M05 carrusel de novedades. Ya hay implementación reportada y código: leer `motion.md` §12 y probar antes de cambiar. HyperFrames vive en `design/motion/` para composiciones/previews, no sustituye controles web. No reconstruir todo motion ni incorporar otro motor sin necesidad. La aprobación de la dirección G no equivale a aceptación visual de cada pantalla final.

Conservar intro 1a “El punto” como backlog: primera apertura saltable, regular ≤500 ms, nunca durante una sesión; no bloquear V1 por la intro. Teclado, foco/restauración, nombres accesibles, áreas táctiles ≥44 px, contraste, reduced-motion, safe areas, texto ampliado y estados honestos. Diseñar extensiones nuevas con el mismo sistema sin atribuirlas a un prototipo inexistente. Fuentes/assets locales con licencias; ningún video de referencia se usa como UI de producción.

## 5. Acceso, altas y PWA: condición de primera versión

Identidad y pertenencia son distintas. Registro/login no dan derecho a usar una organización. Priorizar email verificado y credenciales existentes; Google/Apple no son necesarios para V1 ni deben conceder membresía. Ocultar acciones no disponibles en producción; no restaurar onboarding comercial libre. Recuperación, cambio de credenciales, expiración y revocación de sesiones, invitación reenviada/vencida/revocada, otra cuenta y relaciones múltiples deben funcionar.

Admin crea cliente comercial en borrador, registra acuerdo/aceptación, habilita e invita al email del responsable. La persona crea sus credenciales por enlace seguro; no enviar contraseñas generadas por Admin. Invitaciones por destinatario, consumo único y revocación al reenviar. Trial sólo si fue concedido expresamente. Staff invitado por rol/sede; 2FA y recuperación de administradores con procedimiento verificable.

Gym publica QR fijo por sede desde su dashboard: escanear sólo localiza el gym y permite solicitar acceso después de verificar identidad. La solicitud aparece inmediatamente en la misma bandeja de piso y recepción. Piso puede aprobar con capacidad, sede y turno válido; recepción/gerencia/dueño según permisos sin depender del celular del entrenador. Push intenta avisar al personal autorizado en turno, pero la bandeja y el fallback funcionan con push rechazado, teléfono apagado o sin personal disponible. Ninguna autoaprobación. Decisiones concurrentes deben producir un solo vínculo y resultado auditado.

Gestionar pendiente, aprobada, rechazada, cancelada, vencida, ampliación de sede, pausa, baja y reactivación; nada se reabre por reescanear QR, cambiar email o recuperar contraseña. Baja corta autorización en servidor y se aplica al reconectar. Como no hay padrón obligatorio, hace falta un responsable operativo y una revisión de accesos para bajas: el QR solo no detecta al exsocio. No vincular automáticamente acceso con una cuota que Repi no administra.

**Primera distribución web/PWA.** QR y links de invitación presentan antes del primer registro/login móvil una guía interactiva para agregar a inicio. Adaptar instrucciones al dispositivo y navegador interno; ofrecer continuar en navegador y recuperar la guía después. Respetar sesiones existentes y no repetirla sin necesidad. Detectar capacidades en vez de afirmar instalación por un clic. Conservar/recuperar destino gym/sede/invitación al pasar de navegador a acceso directo, sin asumir cookies compartidas. Invitar no se consume al abrir la guía o por un escáner de emails. No incluir tokens privados en manifest/start_url, logs ni caché. Recuperación de invitación ligada al correo verificado o código válido.

Completar iconos y manifest con dimensiones reales y fidelidad a la marca; HTTPS, entrada pública sin bucles y service worker compatible con sesiones pendientes. Una actualización no debe borrar la cola ni cortar un entrenamiento. Push tras acción explícita del usuario autorizado. Probar instalación y entrega real en dispositivos; una captura responsive no lo demuestra. App Store/Play Store son futuro: backend compartido, enlaces estables, no dos apps nativas antes de V1.

## 6. Alumno y motor de entrenamiento

Inicio/semana/detalle/estado sin programa/solicitud de programa. Seleccionar el día correcto y empezar o retomar una sola sesión coherente con su relación y versión inmutable. Registro con valores previos, series/repeticiones/carga/RIR, descanso prescrito, pausa, reanudar, editar, finalizar y resumen derivado. Peso fino confirmado: entrada decimal y pasos 0,25/0,5/1/1,25/2,5 kg; no volver al paso fijo como única opción. Prescripción y realizado son datos distintos.

RPE de sesión 1–10 con nota; RIR por serie separado y opcional. Preservar valores históricos; no convertir RIR 5 a otra cosa silenciosamente. Sensación por serie: Fácil/Bien/Difícil/Al límite/Con molestia y pedir ayuda al piso. Alertas al equipo pertinente y deduplicación; la fuente de sede actual debe resolverse para no avisar a la sede equivocada. No publicar sensaciones/salud en el Club ni diagnosticar.

Relojes por timestamps, no frames. Guardando/guardado local/pendiente/sincronizado/error según hechos. Offline en núcleo: programa/sesión en IndexedDB, IDs estables, cola, reintentos, idempotencia, conflicto conservando ambas versiones, retorno de fondo y recarga sin pérdida. Probar actualización de app durante cola pendiente. Cambio de cuenta/logout limpia datos de la anterior; bajas no deben dejar una cola bloqueada para siempre ni permitir nuevas operaciones prohibidas. Ofrecer recuperación de registros propios autorizados según política, sin transferirlos a otro contexto.

Resumen, volumen, historial, constancia, PR/1RM estimado con fórmulas, unidades y fuentes. Datos insuficientes en lugar de cifras inventadas. Check-in saltable, molestias, lesiones/antecedentes y solicitud de ayuda/revisión técnica con consentimiento. Avisos de programa nuevo/actualizado, autor y versión. Evolución completa, objetivos y captura de medidas se amplían por etapas.

Mantener en alcance tipos de ejercicio por tiempo/distancia/asistencia/peso corporal/unilateralidad, calentamiento, sustitución, salto justificado, notas de serie, calculadora de discos, kg/lb y notificación de descanso en segundo plano según soporte real. No presentar estas ampliaciones como integradas hasta verificarlas.

## 7. Coach completo

Dashboard y pendientes accionables; directorio, búsqueda/filtros/orden/paginación; invitación por email y ciclo de cliente con pausa/reactivación/baja; ficha Resumen, Rendimiento, Rutinas, Progreso, Salud, Nutrición, Mi cuerpo y Pagos. Cada dato necesita productor, permiso, fecha, unidad y fuente. Datos sensibles requieren grant específico; pedir acceso, aceptar/rechazar, vencer/revocar y estados en ambos extremos.

Constructor: ejercicios/biblioteca base y propios, medios con licencia, músculos/equipo/favoritos; plantillas/programas/versiones, semanas/días editables, prescripción, notas, orden accesible, duplicar y asignar con fecha. Copia por cliente y congelado histórico: editar no altera otras asignaciones ni sesiones pasadas. Completar progresivamente superseries/biseries/circuitos, tempo, descanso, RPE/RIR, sustituciones, tiempo/distancia, borrador/publicación y búsqueda de biblioteca. Catálogo inicial útil no debe bloquear entrenar por falta de un video premium.

Registro de sesiones/RPE/check-ins, progreso por ejercicio y volumen por grupo, objetivos acordados, informes mensuales PDF desde datos reales. Calendario, sesiones presenciales, confirmación, cancelación y asistencia como entidades separadas del entrenamiento. Importación CSV con mapeo/preview/errores/deduplicación; perfil y configuración; promociones. Chat real privado, solicitudes/resolución; posteriormente adjuntos/audio/plantillas/difusión con permisos y preferencias. Nada de suplantar al alumno con “ver su app”.

Cobros propios: plan/cargo, monto/moneda/vencimiento, registro de pago manual, saldo, anulaciones/historial, recordatorios y esperado vs cobrado. Alumno ve su estado autorizado. No mezclar con factura de Repi ni asumir pago online. Nutrición: captura y revisión de comidas/macros/kcal/agua/peso con origen y consentimiento, dentro del alcance profesional definido; no generar prescripciones clínicas automáticas.

## 8. Gym y escritorio por rol

Piso: turno, cola, tomar/asignar/completar, prioridad y tiempos, ayuda de socio, ficha institucional, programa/versiones, motivo de revisión, seguimiento, traspaso pendiente/aceptado y atribución/disputa. Permiso de trabajo fuera de turno documentado y auditado, sin confundirlo con autoridad para aprobar altas fuera de las reglas. Concurrencia transaccional. Separar notas institucionales de notas personales y sanear resúmenes de tareas.

Recepción: misma bandeja de altas, carnet/QR de socio, ingresos y entrega única de premio, ayuda operativa; no hereda acceso a salud o chats privados. Coordinador/gerente: equipo, roles/sedes/capacidades, tareas/reasignación, turnos/cobertura, seguimiento y métricas institucionales. Dueño: ejecutivo multisede, comparaciones contextuales, configuración y contrato Repi. Cantidad comercial acordada y miembros con acceso son dos cosas distintas.

Performance Center: Operativo, Calidad de servicio, Participación, Resultados de entrenamiento y Satisfacción, separadas. Períodos, fuentes, muestras, denominadores y definiciones visibles. Contextualizar horas/turnos y comparar 2–3 donde corresponda; sin score oculto ni disciplina automática. Resultados deportivos no prueban causalmente calidad del personal. Gerencia no lee chat coach–alumno, notas privadas ni salud para evaluar a empleados.

Reseñas por interacción elegible, invitación y límites documentados, promedio con muestra, respuesta, reporte, moderación, apelación y auditoría. No editar el texto del socio como staff, no publicar afuera sin política. Umbrales y plazo son decisiones documentadas a confirmar, no nuevas leyes. Reservas de clases posteriores: calendario/cupo/lista de espera/cancelación/no-show y permisos coherentes; no un botón ficticio.

## 9. Comunidad gym y Repi Club

Novedades/descuentos por gym/sede y vencimiento; carrusel M05; catálogo de recepción informativo con imagen, disponibilidad, horario y promo. Desafíos con reglas, plazo, categorías y premio; intento/video privado → validación → aviso → resultado/récord → retiro único. Archivo/cierre, ranking, mejor marca y concurrencia. Conflicto pendiente de validación presencial sin video: no activar como hecho aprobado. Medios con validación servidor y retención real.

Club voluntario: feed, publicaciones elegidas, evolución de ejercicio y entrenamiento compartido, perfil/vitrina, reacciones, comentarios, rankings opt-in, bloqueo/reporte/moderación/antispam. Compartir datos con coach no publica en comunidad. No exponer salud, cuerpo, nutrición ni chats. Socios del mismo gym, incluidos alumnos de PT que asisten ahí, pueden participar por su pertenencia; no usar automáticamente sesiones privadas del coach como fuente pública. La publicación de sesiones de otra relación necesita regla y autorización explícitas.

Preservar núcleo ya implementado. Después completar ámbitos coach/gym/sede/clase, anuncios de entrenadores, desafíos entre socios, equipos/checkpoints, más perfiles y familia de trofeos/3D. No presión insegura ni ranking universal por cargas brutas sin contexto. Desafíos y premios no deben obligar a publicar datos. La comunidad del coach sigue en el alcance aunque no esté aún programada.

## 10. SaaS, pagos y Repi Admin

Admin: cliente/organización, responsable, acuerdo y evidencia, habilitación, bienvenida, contratos, cantidad y tarifa con versiones/vigencia, preview, períodos/snapshots, estados, auditoría, alertas de diferencia entre total y adopción. No resetear históricos al renegociar. DEMO separado de clientes reales; clientes legacy se regularizan sin suspensiones sorpresivas.

Cálculo monetario exacto, líneas, descuentos/módulos/mínimos/tramos sólo pactados, ciclo y corte separados del vencimiento. Base acordada y vigencia documentadas; nada de peak de usuarios ni promedio inventado. Implementar avisos de cambios al cliente. Prorrateo/mora/suspensión requieren política; preservar lectura/exportación y definir impacto en alumnos antes de activar una suspensión.

Primera versión puede operar con acuerdo y cobro externo registrado manualmente **como propuesta de piloto sujeta a confirmación**, manteniendo conciliación/evidencia y sin simular pasarela ni comprobante fiscal. No es un trial gratis automático. Después integrar proveedor verificado, sandbox y producción separados, firmas de webhooks, idempotencia, eventos duplicados/fuera de orden, conciliación, devoluciones/correcciones autorizadas y comprobantes. Redirect no significa pagado; secretos sólo servidor y sin almacenar tarjetas.

Admin completo: cobros, planes por defecto versionados, flags, soporte con acceso mínimo, colas fallidas, salud, costos IA y métricas MRR/ARR/churn con definiciones. “Ver como cliente” no autoriza impersonación; preferir diagnóstico por metadatos y soporte consentido sin contenido privado. Portal de contrato/estado y facturas/comprobantes según naturaleza legal, sin equiparar un cierre simulado con un cobro real.

## 11. Body Intelligence: alcance íntegro por madurez

Opcional; rechazarlo nunca bloquea entrenar. Primer corte posterior al núcleo: medidas manuales con unidad/fecha/método/fuente, fotos opcionales, historial, corrección, exportación/borrado y permisos granulares. Guardar, procesar con IA y compartir son acciones separadas. Default sin compartir; destinatario/relación/propósito/versionado; revocación efectiva en servidor, objetos, cachés y trabajos pendientes. Retención distinta para originales, derivados, temporales, mallas, documentos y backups.

Visor: referencia genérica rotulada; aproximado sólo si realmente hay ajuste; personal sólo si existe y pasa validación. Rotación/zoom/vistas/capas/regiones, exposición de entrenamiento, fallback 2D, lazy loading, contexto WebGL perdido y recursos liberados. Mantener nueve regiones visibles inicialmente y resolver taxonomía/lateralidad antes de expandir. Color indica carga registrada, no músculo, grasa o hipertrofia medidos. Comparación por fecha sólo con fuente/método/pose/escala y topología compatibles; no simular transformaciones del usuario con maniquíes genéricos.

Captura guiada real y chequeos de calidad se separan de reconstrucción experimental. Alternativa sin fotos; no exigir ropa interior. El PDF es investigación, no código listo ni ciencia validada. El fitter propuesto no usa los perímetros en su pérdida; RLS no está implementado por un título de SQL; blur facial no anonimiza un cuerpo; defaults TRUE de compartir contradicen producto. No copiar esos defectos. No inferir género/sexo desde imagen, ni inventar variables requeridas o rangos de error.

DXA/BIA/pliegues/laboratorio: método/equipo/ecuación/unidad/fecha; mostrar insuficiente sin fuente. Importación PDF con extracción propuesta, página/zona original, revisión/corrección/aceptación/rechazo antes de graficar. Preservar rangos, < >, cualitativos, desconocidos y unidades. Verificar mapeos/códigos antes de declarar interoperabilidad. No atribuir datos de segmentos a cada músculo.

Para inferencia: flag independiente, licencias de código/pesos/assets, evaluación por población, repetibilidad/error/sesgos/incertidumbre/rechazo, revisión especializada y límites de uso antes de habilitar. N=60 es una propuesta, no un estudio ejecutado. Benchmarks/costos del PDF no son garantías. Rollback mantiene registros autorizados y vuelve a referencia genérica sin falsear historia. Desarrollo de registro/visor/documentos puede avanzar sin prometer diagnóstico ni reconstrucción validada.

## 12. IA, automatizaciones y ampliación futura

Primero métricas deterministas correctas. Asistente de coach después: resúmenes, borradores, alertas explicables y sugerencias revisables, proveedores desacoplados, prompts versionados, datos minimizados, salida validada y presupuesto. Cambios de rutina y mensajes requieren revisión del profesional antes de aplicar/enviar. Sin diagnóstico ni decisiones automáticas sobre personas. Extracción documental y reconstrucción tienen pipelines separados, no un toggle universal IA.

Completar centro de notificaciones alumno/staff, preferencias por canal, deep links autorizados, deduplicación y jobs; adjuntos/audio, calendarios/CSV, perfiles públicos y sitio de captación con contacto comercial. No marketing como condición para entrenar. Integraciones de socios/tornos, salud/relojes y tiendas móviles se evalúan al llegar su fase con APIs/documentación vigentes; conservar APIs/cuentas/backend. No prometer disponibilidad o aprobación por el nombre histórico de una plataforma.

## 13. Arquitectura, datos y operación necesaria

Continuar el monorepo pnpm, Next/React, TypeScript, PostgreSQL/Drizzle, Better Auth, CSS/tokens y PWA existentes. Leer las guías locales de la versión instalada de Next donde lo exige AGENTS.md. No migrar a otro framework, microservicios o proveedor por preferencia. Versiones exactas en lockfile; comprobar documentación/advisories vigentes antes de cambiar dependencias.

Autorización en servidor por usuario + organización + sede + relación + capacidad + recurso + grant cuando aplique. Probar lecturas/escrituras/descargas/exportaciones y denegaciones. No confiar en filtros UI, IDs del cliente ni URLs de objetos. Separación de contextos en caché; nota institucional vs personal; Admin no tiene permiso de lectura sensible universal. Auditoría con actor, acción, recurso, resultado y tiempo, sin secretos ni contenido privado.

Persistencia transaccional, constraints/índices/paginación, dinero exacto, timestamps y zona horaria documentada. Migraciones versionadas, forward compatible cuando sea posible; rollback y restauración probados. Datos DEMO nunca resultados reales ni cuentas de producción. Configuración dev/test/staging/prod y secretos fuera del repo; bootstrap del primer Admin por canal seguro, no credenciales demo.

Necesidades operativas añadidas para un lanzamiento real: email transaccional y recuperación; reintentos/entrega de invitaciones; almacenamiento privado durable y backups de objetos; jobs programados de notificaciones/retención; límites de abuso compartidos cuando haya varias instancias; sanitización y validación de medios en servidor; logs mínimos/errores/métricas/alertas; soporte y procedimiento de incidentes; exportación/borrado con verificación; monitoreo de disponibilidad y costo; pruebas de despliegue/rollback. Cada una está en el catálogo con origen propuesto, alcance y aceptación.

No ejecutar `pnpm test` ciegamente: el setup actual borra esquemas de TEST_DATABASE_URL. Verificar que es una base exclusivamente descartable, distinta de desarrollo/productiva; endurecer la guarda antes de CI o traspaso. No ejecutar seeds sobre clientes reales. Respaldos reales y credenciales no se guardan en documentos ni ZIP compartidos.

## 14. Primera versión y fases posteriores

V1 es un producto utilizable por gyms y coaches con usuarios reales invitados: alta comercial, correo, QR/aprobación, PWA/guía, programa→entrenamiento→historial, offline probado, comunicación/ayuda, operación de piso/recepción, novedades/Club básico, Admin comercial, privacidad y operación. El alcance exacto, gates y pendientes están en `docs/continuidad/PLAN_LANZAMIENTO_Y_ROADMAP.md`.

Los módulos avanzados ya integrados se conservan si pasan pruebas; no reescribirlos por reducir la primera entrega. Un módulo incompleto secundario puede quedar detrás de flag explicado, con backlog y criterio de activación. Autorización, pérdida de datos, funcionamiento del acceso y capacidad de soporte no se posponen para aparentar velocidad.

V1.1 completa negocio diario y seguimiento; V2 amplía comunidades, calendarios, programas, métricas y automatización comercial; BI se entrega en registro/visor/documentos y luego investigación validada; tiendas e integraciones futuras conservan backend y usuarios. No hay fecha ni plazo ficticio: estimar desde el código y los bloqueos reales, proponer la siguiente entrega pequeña y terminarla.

## 15. Prueba, cierre y continuidad entre Claudes

Flujos críticos de punta a punta: Admin habilita e invita → responsable verifica; gym genera QR → socio ve guía/solicita → piso o recepción aprueba; coach invita → alumno acepta; programa asignado/versionado → sesión/descanso/RIR/RPE → historial y feedback; offline/recarga/reconexión/conflicto; pausa/baja/otro usuario; Club voluntario y moderación; contratos con cambios futuros; permisos entre roles y sedes; PWA real y push con fallback.

No basta build. Elegir pruebas de dominio/integración/E2E pertinentes, verificación visual contra G, teclado/contraste/reduced-motion y teléfonos reales donde corresponda. Datos falsos etiquetados; archivos/credenciales ajenos nunca expuestos. Si una prueba no se pudo ejecutar, decirlo. No confundir probado en escritorio con probado en iPhone.

Terminado por función: interfaz fiel + comportamiento real + persistencia + autorización + errores/estados + accesibilidad/responsive + evidencia + documentación. Terminado para lanzamiento: gates V1 resueltos y estado externo claro. “Listo para desplegar” no significa “publicado”; esta instrucción de continuidad no autoriza contratar, cobrar, enviar campañas ni publicar sin la autorización correspondiente. Preparar todo lo revisable antes de pedir esa decisión final.

Al terminar cada bloque, actualizar estado/plan/inventario y `docs/continuidad/PROXIMA_SESION.md`: commit y cambios sin commit, archivos tocados, comandos/pruebas/resultados, migraciones/dependencias, decisiones, bloqueos y primera acción concreta. Referenciar nombres de variables, nunca valores secretos. No depender del chat ni de tareas en memoria. Cuando quede poco contexto, dejar un corte coherente y retomable, no iniciar un refactor amplio. Seguir trabajando sobre lo autorizado; no concluir con un plan si ya se puede implementar.
