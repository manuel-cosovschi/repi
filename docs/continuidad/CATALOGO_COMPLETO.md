# REPI — Catálogo completo y trazabilidad

Fecha: 27/10/2026. **209 entradas**: 166 heredadas (incluye seis retiradas) + 43 posteriores/operativas. No es un techo del producto. Los requisitos complementarios pueden extender IDs anteriores; no representan necesariamente pantallas independientes.

Las fases son una propuesta de entrega por dependencias, no una reducción del encargo. V1 significa cerrar/verificar el recorrido básico; las ampliaciones de una entrada compuesta siguen en V1.1/V2 aunque el estado heredado diga probado. Mantener las partes útiles ya implementadas. El JSON conserva íntegramente cada registro anterior, además de las correcciones vigentes. Los criterios que estaban vacíos se completaron como propuestas de verificación, sin presentarlos como pruebas ejecutadas ni nuevas decisiones comerciales aprobadas.

Los estados originales se copiaron de docs/PRODUCT_INVENTORY.json y no se validaron ejecutando tests en esta revisión. No certificar producción con esta tabla. La fuente y aceptación original completa están en el JSON; “criterio vacío” exige definir aceptación al implementar. El inventario anterior se genera por scripts/inventory/build_inventory.py: actualizar ese generador cuando se consolide el catálogo, no sólo el Markdown generado.

## V1

| ID | Función | Estado heredado / certeza | Criterio vigente o aclaración |
| --- | --- | --- | --- |
| F-BR-01 | Identidad Concepto 2 + selección G · Atlética | integrado · confirmado | Barlow Condensed/Barlow, Phosphor Bold, Cristal y fade 160 ms; logo/paleta originales; D66 y selección visual prevalecen sobre Inter Tight. |
| F-CL-01 | Inicio del alumno | probado · documentado | Muestra entrenamiento de hoy y semana reales; CTA inicia sesión |
| F-CL-02 | Semana y detalle de día | probado · documentado | Día de descanso como estado propio; valores anteriores por ejercicio |
| F-CL-03 | Registro de series con peso fino y guardado real | probado · documentado | Conservar pasos 0,25/0,5/1/1,25/2,5 kg y entrada decimal, valores previos y sincronización; D63 supera paso fijo exclusivo. |
| F-CL-04 | Temporizador de descanso (reloj real) | probado · documentado | Basado en timestamp de fin; pausar/+30s/saltar; no depende de frames |
| F-CL-05 | Resumen de sesión + récord personal validado | probado · documentado | PR solo si supera registro comparable previo; celebración desactivable |
| F-CL-06 | Progreso (fuerza, volumen, constancia, medidas) | persistente · documentado | Volumen = series×reps×peso documentado; "Datos insuficientes" para lo no medido |
| F-CL-07 | Offline + sincronización idempotente | probado · documentado | Sin pérdida ni duplicado al reconectar (E2E 5 del brief) |
| F-PR-01 | Compartir/revocar por tipo de dato con historial de accesos | probado · confirmado | Cada cambio en log; revocación inmediata |
| F-PR-02 | Exportar/eliminar datos propios con procedimiento operativo | probado 27/10 (D75) · documentado | V1: canal autenticado y procedimiento verificable; automatización completa V1.1. Retención y backups deben explicarse. |
| F-PR-03 | Notas institucionales vs personales | probado 27/10 (test gym «notas personales») · documentado | Etiqueta de visibilidad; personales nunca en traspasos/reportes |
| F-PR-04 | Acceso denegado + auditoría de intentos | probado 27/10 (D78) · documentado | Intento registrado; estado explícito, no vacío |
| F-PR-05 | Datos de salud del alumno al coach por consentimiento | probado · confirmado | Bloqueado sin grant; "Pedir acceso" envía solicitud |
| F-MS-01 | Chat coach–alumno | probado · documentado | Solo relaciones activas |
| F-MS-02 | Mensajería autorizada en el gym | probado · documentado | Conversación por relación/sede autorizada; envío persistente y visible a participantes; identificar quién respondió, bloquear acceso ajeno y relaciones inactivas. |
| F-NT-02 | Preferencias / push / email | integrado · documentado | Preferencias por canal/dispositivo persistidas; permiso explícito, baja efectiva y fallback; no confundir envío con entrega. |
| F-CO-01 | Panel del coach con pendientes accionables | persistente · documentado | Cada pendiente con acción directa |
| F-CO-02 | Directorio de clientes split view | probado · documentado | Búsqueda, filtros, orden |
| F-CO-05 | Registro de sesiones con notas del alumno | probado · confirmado | Ficha muestra sesiones reales de la relación con fecha, registros y notas/RPE; recarga conserva datos y oculta otras relaciones. |
| F-CO-06 | Salud: lesiones, molestias 0–10, condiciones | probado · confirmado | No diagnosticar; derivar a profesional |
| F-CO-08 | Constructor de programas (días renombrables, duplicar, asignar) | probado · confirmado | Asignación crea copia; editar no altera el pasado (versionado no prototipado) |
| F-CO-09 | Biblioteca de ejercicios completa | integrado · documentado | Buscar/filtrar ejercicios por atributos; prescribir y registrar el correcto; CRUD propio y medios licenciados se amplían sin cambiar historial. |
| F-BL-02 | Contrato REPI Coach por todos los alumnos vigentes acordados | integrado · confirmado | Cantidad acordada sin depender de activaciones/uso; tarifa negociada y versionada. Motor existente no equivale a cobro real. |
| F-BL-03 | Contrato REPI Gym por total acordado de socios | integrado · confirmado | Admin carga cantidad y precio por cliente. Tramos/mínimos/módulos sólo pactados; nunca base por usuarios activos. |
| F-GT-01 | Turno del entrenador de sala (iniciar/cerrar) | probado · en_conflicto | Editar/completar requiere turno activo |
| F-GT-02 | Cola de asistencia y tareas con resumen saneado | probado · documentado | Nunca copiar mensajes privados |
| F-GT-03 | Programa institucional del socio + revisiones | probado · documentado | Motivo de cambio visible al equipo |
| F-GT-04 | Traspaso de turno con aceptación | probado · documentado | pending_acceptance hasta aceptar |
| F-GM-01 | Panel del gerente | integrado · documentado | KPIs de sede con período/fuente y acciones reales; estados sin datos/error, aislamiento y navegación a pendientes. |
| F-GM-02 | Directorio del equipo | integrado · documentado | Equipo por sede/rol con búsqueda y estado; editar permisos auditados sin otorgar acceso fuera del alcance del actor. |
| F-GM-03 | Tareas operativas + reasignación | probado · documentado | Solo metadatos |
| F-GM-04 | Planificación de turnos con cobertura | integrado · documentado | Crear/editar turnos con horas/sede, detectar solapes y mostrar cobertura según regla documentada; no inventar presencia. |
| F-GM-05 | Participación de socios | integrado · documentado | Participación calculada con denominador y período visibles, separando ingreso/sesión/uso y sin usar datos privados del coach. |
| F-GM-06 | Vista de coordinador | persistente · documentado | Capacidades explícitas del coordinador por sede; servidor rechaza funciones no autorizadas aunque se cambie URL. |
| F-GP-01 | Gym Performance Center por categorías separadas | probado · documentado | Sin puntaje combinado; resultados solo nivel sede |
| F-GP-02 | Definiciones de métricas visibles | integrado · documentado | Cada métrica expone fórmula, período, fuente, muestra y faltantes; números reconciliables con registros. |
| F-GP-03 | Comparación contextual 2–3 | integrado · documentado | Comparar 2–3 personas del alcance autorizado, contextualizando horas/muestra; sin score secreto o datos sensibles. |
| F-GP-04 | Mi desempeño + disputa de atribución | probado · documentado | Personal ve su atribución, solicita corrección y recibe resolución auditada sin alterar eventos históricos en silencio. |
| F-GP-05 | Detalle de entrenador | integrado · documentado | Detalle deriva turnos/tareas/reseñas autorizadas; no chats privados, notas personales ni salud. |
| F-RV-01 | Reseña verificada del socio (1–5 + dimensiones) | probado · documentado | Prototipada en v2 del gym (persona Valentina, ahora retirada); falta en app v3 |
| F-RV-02 | Analítica de reseñas con n y rango | probado · en_conflicto | Ocultar promedio con n<5 |
| F-RV-03 | Responder / reportar (entrenador) | probado · documentado | Entrenador responde o reporta sin editar reseña original; permisos, historial y visibilidad coherentes. |
| F-RV-04 | Moderación con log y apelación | probado · documentado | Staff no edita texto |
| F-RV-05 | Políticas de reseñas (respuestas, publicación externa) | integrado · documentado | Publicación externa deshabilitada |
| F-GO-01 | Ejecutivo multi-sede | integrado · documentado | Resumen del dueño reúne sólo sedes de su organización; datos con período y estado real; no acceso sensible por ser dueño. |
| F-GO-02 | Comparación de sedes | integrado · documentado | Comparación de sedes normalizada y contextual con fuentes/muestras; no mezclar organizaciones ni ocultar faltantes. |
| F-GO-03 | Puesta en marcha del gym sin padrón obligatorio | integrado · documentado | Alta comercial, sede, responsable, staff y QR; no bloquear por no importar DNI. |
| F-GC-01 | Novedades y descuentos del gym | probado · confirmado | Solo socios de esa org |
| F-GC-02 | Desafíos con premio en recepción | probado · confirmado | Reglas de técnica; sin presión insegura |
| F-GC-03 | Intento de récord con video + validación | probado · en_conflicto | Video privado; notificación a ambas partes |
| F-GC-04 | Catálogo informativo de recepción | probado · confirmado | Sin checkout |
| F-GC-05 | Logros, stickers y nivel | probado · confirmado | Permanente en registro |
| F-GR-01 | Rol recepción | integrado · documentado | Recepción aprueba altas, registra ingreso/entrega premio autorizado sin turno de piso; no hereda fichas sensibles. |
| F-MO-01 | Cuenta multi-organización y selector de espacio | persistente · documentado | Permisos nunca se cruzan |
| F-MO-02 | Socio con gym + coach privado (dos relaciones) | probado · en_conflicto | Prototipado en gym v2 (retirado); app v3 sólo tweak alumnoTipo |
| F-AD-01 | Admin · resumen | probado 27/10 (D79) · documentado | Resumen operativo/comercial desde acuerdos y eventos reales; separar cantidades acordadas/adopción/cobrado; sin métricas DEMO. |
| F-AD-02 | Admin · clientes y alta | probado · confirmado | Crear ficha comercial válida, registrar aceptación/habilitación e invitar; reabrir ficha tras persistir; no autohabilitar. |
| F-AD-03 | Admin: cantidad acordada y tarifa versionadas por cliente | probado · confirmado | Cambios futuros y snapshots inmutables; no cambiar base a uso ni restaurar precios demo. |
| F-RC-01 | Repi Club · feed y publicaciones de logros | probado · documentado | Voluntario; nunca datos de salud |
| F-RC-02 | Reacciones y comentarios | probado · documentado | Reacciones sin duplicados, comentarios persistentes y permisos/reportes/bloqueos; no interacción de cuentas fuera del ámbito. |
| F-RC-03 | Rankings con transiciones FLIP | probado · documentado | Sin incentivar chequeo compulsivo |
| F-RC-05 | Moderación del Club | probado · documentado | Reportar/bloquear/moderar con estados y auditoría, criterios explícitos y controles de spam; autor no pierde trazabilidad. |
| F-ID-01 | Autenticación | probado · documentado | Login/verificación/recuperación/2FA según rol, sesiones revocables y respuestas no enumerables; pertenencia se comprueba aparte. |
| F-ID-02 | Onboarding del coach | persistente · documentado | Coach acepta invitación comercial válida y completa perfil/checklist persistente; no crea cliente operativo por registro libre. |
| F-ID-03 | Invitación del alumno | probado · documentado | Invitación de alumno ligada al correo, revocable/vencible y de un uso; cuenta existente suma relación sin duplicar identidad. |
| F-ID-04 | Verificación de email por código de 6 dígitos + reenvío | probado · documentado | Código incorrecto/vencido rechazado; reenvío limitado; verificado persiste. |
| F-ID-05 | Recuperación de contraseña por código (15 min) con respuesta no enumerable | probado · documentado | Email inexistente responde igual; tras reset las sesiones previas quedan revocadas. |
| F-ID-06 | Verificación en dos pasos (TOTP) obligatoria para Admin REPI y dueños | probado · documentado | Admin/dueño sin 2FA no accede a su superficie; código de respaldo de un solo uso. |
| F-ID-07 | Enlace mágico existente; OAuth social fuera de V1 | integrado · documentado | Identidad no da acceso; no activar Google/Apple por existir en un prototipo. Evaluación futura sólo si el usuario lo decide. |
| F-ID-08 | Selector de espacio post-ingreso desde relaciones reales | probado · confirmado | Usuario sin relación ajena no ve ese espacio; cambio de espacio no mezcla datos. |
| F-ID-09 | Alta del responsable del gym por invitación comercial | probado · documentado | Admin habilita tras acuerdo; persona verifica destinatario y configura cuenta. Sin autoalta comercial libre. |
| F-ID-10 | Invitar equipo del gym por email y rol en el alta | probado · documentado | Invitación persistida con código; expira/revoca; aceptarla crea StaffMembership. |
| F-ID-11 | Aceptar invitación de staff (código) con alcance explicado | probado · documentado | Código inválido/vencido/revocado rechazado; aceptación única. |
| F-ID-12 | Alta del socio por QR de sede y aprobación humana | probado · documentado | Email verificado, solicitud en piso/recepción, decisión única; no padrón/DNI obligatorio. |
| F-ID-13 | Menores: edad por nacimiento, <13 bloqueado, 13–17 con autorización de adulto | probado · en_conflicto | Adulto aprueba por enlace propio; restricciones aplicadas en servidor. Edades y base legal pendientes (D13). |
| F-ID-14 | Consentimiento inicial al coach por tipo de dato con versión | probado · confirmado | Grant persistido por relación; revocable; no se hereda a otros contextos. |
| F-ID-15 | Registro de aceptación de Términos/Privacidad/DPA con versión y fecha | probado · documentado | No se crea cuenta sin aceptación; versión registrada. Textos legales pendientes (D21). |
| F-ID-16 | Ingreso de código de invitación y lectura de QR | persistente · documentado | Código de 6 caracteres sin ambigüedad; rate limit; QR abre el mismo flujo. |
| F-ID-17 | 'Ya tengo cuenta': sumar relación nueva a cuenta existente | persistente · confirmado | No se duplica User; relación nueva aparece en el selector. |
| F-ID-18 | Perfil profesional y condiciones de bienvenida del coach | persistente · en_conflicto | Invitación comercial y tarifa acordada; prueba gratis sólo explícitamente otorgada por Admin. |
| F-ID-19 | Checklist de puesta en marcha post-registro (coach y gym) | estatico · documentado | Pasos reflejan estado real; retomables. |
| F-ID-20 | Reglas de contraseña con feedback en vivo | probado · documentado | Servidor rechaza contraseña débil aunque el cliente falle. |
| F-CL-08 | Check-in antes de entrenar (3 toques) | probado · documentado | Persistido; visible al coach sólo con relación/grant. |
| F-CL-09 | Reportar molestia (zona, intensidad 0–10, ejercicio) con aviso no-diagnóstico | probado · documentado | Llega a la bandeja del coach con grant de salud; sin grant, sólo alerta sin detalle (a decidir D06/D12). |
| F-CL-10 | Lesiones y antecedentes en perfil del alumno | probado · documentado | Visible a coach sólo con grant salud. |
| F-CL-11 | Nota y RPE de sesión al finalizar | probado · documentado | Persistido con la sesión. |
| F-CL-12 | RIR opcional por serie | probado · documentado | Opcional; no bloquea completar serie. |
| F-CL-13 | Solicitudes del alumno: pedir ayuda, cambiar rutina, revisar técnica (video opcional) | probado · documentado | Pedido llega como tarea al destinatario correcto y cambia de estado en ambos lados. |
| F-CL-14 | Aviso de programa nuevo/actualizado con autor | probado 27/10 (D77) · documentado | Asignación genera aviso; versión anterior consultable. |
| F-CL-15 | Estado vacío sin programa + 'Pedir mi programa' | probado · documentado | Pedido llega a coach/equipo de sala. |
| F-CL-16 | Indicador offline / pendiente de sincronizar / guardado en el teléfono | probado · documentado | Ver F-CL-07. |
| F-PR-06 | Solicitudes de acceso del coach recibidas en la app: aceptar/rechazar | probado · confirmado | Circuito cerrado en ambas superficies; revocación efectiva. |
| F-RV-06 | Reseña del socio en la app (v4) | probado · documentado | Ver F-RV-01. |
| F-GC-06 | Carnet digital / QR del socio | probado · documentado | QR firmado/rotativo; recepción lo valida. |
| F-GC-07 | Premio listo para retirar / entregado | probado · documentado | Estado sincronizado socio/recepción. |
| F-GC-08 | Registro de ingreso/asistencia; futura integración con molinete | integrado · propuesto | Recepción valida carnet real. Integración externa no existe por una simulación del prototipo. |
| F-GC-09 | Mejor marca personal en desafío | probado · documentado | Derivado de intentos validados. |
| F-CO-13 | Invitar cliente desde el coach (enlace/código) con estados | persistente · documentado | Invitación persistida, expira, se revoca; aceptación crea coach_client. |
| F-CO-14 | Bandeja 'Pedidos de alumnos' (pedidos, molestias, invitaciones) con 'Marcar resuelto' | probado · documentado | Estados sincronizados con la app. |
| F-CO-15 | Solicitud de acceso del coach con motivo y estado | probado · confirmado | Ver F-PR-06. |
| F-CO-18 | Molestias y check-ins recientes en la ficha | probado · documentado | Sin seeds presentados como datos reales. |
| F-HX-04 | Descanso por ejercicio desde la prescripción | probado · propuesto | Descanso inicial proviene del ejercicio prescrito; pausa/+30s/saltar/retorno de fondo mantienen reloj por timestamp. |
| F-HX-05 | Indicación del coach por ejercicio en sesión activa | integrado · propuesto | Indicación por ejercicio corresponde a la versión de esa sesión; notas de ejercicios distintos no se mezclan. |
| F-HX-09 | Selector de relación activa gym/coach y regla de programa | probado · propuesto | Cambio de relación muestra programa y destinatarios correctos; sesión ya iniciada conserva origen y no hereda grants. |
| F-HX-10 | Cierre de desafíos: ganador, anuncio, archivo, ranking, historial | probado · propuesto | Cierre por fecha, intentos elegibles y decisiones pendientes explícitas; resultado/historial trazables, sin ganador inventado. |
| F-HX-11 | Categorías de desafíos y deslinde de seguridad | integrado · propuesto | Reglas/categorías y fuente declaradas; publicación opcional, sin inferir atributos personales ni promover riesgo. |
| F-HX-13 | Novedades/desafíos por sede, vencimiento de descuentos, push al publicar | probado · propuesto | Filtro de sede y publicación general autorizada, descuentos vencidos fuera; aviso deduplicado al ámbito correcto. |
| F-HX-14 | Catálogo con disponibilidad, horarios y promos destacadas | integrado · propuesto | Catálogo informativo con disponibilidad/horario/promoción actualizados; sin carrito ni cobro de cuota. |
| F-HX-15 | Intentos y logros en la ficha del socio (sala) | integrado · propuesto | Ficha institucional muestra intentos/logros autorizados y su estado, sin exponer videos privados a roles no validadores. |
| F-HX-16 | 'Entrenadores en sala ahora' en la app | integrado · propuesto | Lista deriva turnos abiertos de sede correspondiente; no personas sembradas ni presencia supuesta. |
| F-HX-27 | Mensajería entrenador de sala ↔ socio | probado · propuesto | Mensajes socio-equipo de sala con identidad del respondiente, alcance y baja; no acceso al chat del coach privado. |
| N-C01 | Alta comercial y bienvenida ligada al destinatario | consultar código y estado; no certificado en esta revisión · confirmado | Admin acuerda, habilita e invita; reenvío revoca; un solo consumo; sin contraseña compartida. |
| N-C02 | Total acordado por Gym y alumnos vigentes por Coach | consultar código y estado; no certificado en esta revisión · confirmado | 1000 acordados y 120 habilitados usa base 1000; lo mismo para Coach; origen manual explícito sin contar cuentas. |
| N-C03 | Tarifa negociable y versiones de cantidad/precio | consultar código y estado; no certificado en esta revisión · confirmado | Precio distinto por cliente, fecha de efecto, autor/motivo; no alterar períodos cerrados. |
| N-C04 | QR fijo revocable por sede | consultar código y estado; no certificado en esta revisión · confirmado | Generar/descargar/regenerar/revocar; fotografía del QR sólo permite solicitar, no usar el producto. |
| N-C05 | Aprobación compartida piso/recepción | consultar código y estado; no certificado en esta revisión · confirmado | Validar turno/sede/capacidad al resolver; concurrencia una decisión; recepción funciona sin push. |
| N-C06 | Pausa/baja/reactivación/ampliación de sede | consultar código y estado; no certificado en esta revisión · confirmado | No reactivar por recuperar contraseña o QR nuevo; conservar otras relaciones y auditoría. |
| N-C07 | Push a piso con cola y fallback | consultar código y estado; no certificado en esta revisión · confirmado | Suscripción explícita, estados reales y reintentos; confirmar entrega en dispositivos de piloto; bandeja siempre útil. |
| N-C08 | Guía interactiva para agregar a inicio antes de acceso móvil | consultar código y estado; no certificado en esta revisión · confirmado | Guía por dispositivo, continuar en navegador, ayuda recuperable y no repetición invasiva. |
| N-C09 | Continuidad de invitación/QR entre navegador y PWA | consultar código y estado; no certificado en esta revisión · documentado | Verificación de destinatario al recuperar; no asumir cookies compartidas ni poner tokens en manifest. |
| N-C11 | Pasos de peso finos y entrada decimal | consultar código y estado; no certificado en esta revisión · documentado como pedido humano | 0,25/0,5/1/1,25/2,5 kg y hasta dos decimales; no perder cambios durante autosave. |
| N-C12 | Sensación por serie y pedir asistencia | consultar código y estado; no certificado en esta revisión · documentado como pedido humano | No confundir sensación con RPE/RIR ni salud publicada; alerta deduplicada a la sede pertinente. |
| N-C13 | Club: evolución por ejercicio, sesión y vitrina opt-in | consultar código y estado; no certificado en esta revisión · documentado como pedido humano | Publicación elegida, hasta límites vigentes, pertenencia comprobada, sin datos privados automáticos. |
| N-C14 | Diseño G · Atlética en todas las superficies | consultar código y estado; no certificado en esta revisión · confirmado | Mantener marca, fuentes correctas, Phosphor, barra móvil y fade, pruebas de legibilidad y permisos. |
| N-C15 | M01–M05 y composiciones HyperFrames | consultar código y estado; no certificado en esta revisión · confirmado | Verificar implementación existente; no sustituir controles por videos; reduced-motion y datos reales. |
| N-O01 | Correo transaccional productivo | consultar código y estado; no certificado en esta revisión · propuesto necesario | Alta, verificación, recuperación y bienvenida llegan a destinatarios de prueba autorizados; estados/error/reintento y sin mailbox DEV público. |
| N-O02 | Guarda segura de bases de prueba | consultar código y estado; no certificado en esta revisión · propuesto necesario | Base descartable distinta de dev/prod; validación host/db/usuario y opt-in explícito antes de DROP; CI aislada. |
| N-O03 | Entornos, dominio/HTTPS y configuración | consultar código y estado; no certificado en esta revisión · propuesto necesario | Staging y producción diferenciados, secretos seguros, enlaces correctos, health checks y sin seed demo; publicar sólo tras autorización. |
| N-O04 | Backups y restauración de DB y archivos | consultar código y estado; no certificado en esta revisión · propuesto necesario | Restaurar copia en entorno aislado y verificar relaciones/objetos; responsables, frecuencia y retención documentados. |
| N-O05 | Migraciones y reversión de release | consultar código y estado; no certificado en esta revisión · propuesto necesario | Migración ensayada sobre copia, cola offline compatible y plan de forward fix/rollback con respaldo, sin pérdida de datos. |
| N-O06 | Almacenamiento durable privado y medios validados | consultar código y estado; no certificado en esta revisión · propuesto necesario | Objeto no público, permisos en lectura, límites/firma/duración en servidor, EXIF minimizado según uso y retención jobs; no disco efímero sin persistencia. |
| N-O07 | Límites de abuso y sesiones | consultar código y estado; no certificado en esta revisión · propuesto necesario | Límites de OTP, reset, invitaciones, QR y uploads efectivos entre instancias si las hay; no enumerar cuentas, revocar sesiones. |
| N-O08 | Jobs, reintentos y observabilidad de cola | consultar código y estado; no certificado en esta revisión · propuesto necesario | Programar en entorno real con exclusión/idempotencia, intentos/backoff, fallos visibles y reejecución segura. |
| N-O09 | Actualización segura PWA y datos offline | consultar código y estado; no certificado en esta revisión · propuesto necesario | Actualización durante sesión no borra registros ni recarga forzada; caché no mezcla usuarios; token/link privado no cacheado. |
| N-O10 | Logs mínimos, alertas y diagnóstico | consultar código y estado; no certificado en esta revisión · propuesto necesario | Errores auth/sync/email/jobs visibles sin secretos/salud/chat; alerta accionable y responsable. |
| N-O11 | Soporte y procedimiento de incidentes | consultar código y estado; no certificado en esta revisión · propuesto necesario | Contacto visible, identificación mínima, registro/cierre de incidentes, recuperación acceso y escalamiento sin impersonación. |
| N-O12 | Exportación/borrado con retención explicada | consultar código y estado; no certificado en esta revisión · propuesto necesario | Atender petición autenticada con procedimiento verificable; distinguir revocar/borrar/exportar y backups; automatizar luego. |
| N-O13 | Textos y aceptación legal reales | consultar código y estado; no certificado en esta revisión · propuesto necesario | Textos finales por responsables, versión vinculada a lo mostrado y almacenado; no certificar conformidad a partir de un check. |
| N-O14 | Bootstrap y recuperación del Admin | consultar código y estado; no certificado en esta revisión · propuesto necesario | Primer Admin seguro, 2FA y respaldo, acceso mínimo; no cuentas/passwords DEMO en producción. |
| N-O15 | QA en dispositivos y E2E principales | consultar código y estado; no certificado en esta revisión · propuesto necesario | iPhone/Safari/PWA y Android/Chrome reales: instalar, abrir, push, entrenar, offline/sync y teclado; registrar qué no se pudo probar. |
| N-O16 | Rollout controlado, flags y rollback | consultar código y estado; no certificado en esta revisión · propuesto necesario | Piloto por organizaciones, módulos incompletos no prometidos; criterio go/no-go, soporte y reversión probada. |
| N-O17 | Separación DEMO/test/producción | consultar código y estado; no certificado en esta revisión · propuesto necesario | Sin usuarios demo ni datos sintéticos en métricas/cobros reales; reset de pruebas no alcanza bases productivas. |
| N-O18 | CI y arranque reproducible | consultar código y estado; no certificado en esta revisión · propuesto necesario | Lockfile, scripts, .env.example, migraciones y checks reproducibles; no secretos ni artefactos irrelevantes requeridos. |
| N-O19 | Permisos efectivos por relación/sede y objetos | consultar código y estado; no certificado en esta revisión · propuesto necesario | Pruebas de sustitución de IDs, bajas, permisos revocados, exportación/medios; ninguna herencia indebida Coach/Gym. |
| N-O20 | Decisión y alcance de menores | consultar código y estado; no certificado en esta revisión · propuesto necesario | Responsable confirma política antes de habilitar menores; piloto adulto como propuesta, sin fingir base legal resuelta. |
| N-O21 | Sede actual para avisos de sala | consultar código y estado; no certificado en esta revisión · propuesto necesario | No notificar sede principal si entrena en otra; definir contexto validado o limitar piloto a sede configurada, explicitándolo. |
| N-O22 | Operación comercial manual de piloto | consultar código y estado; no certificado en esta revisión · propuesto sujeto a confirmación | Acuerdo explícito, pago externo comprobable y registro separado; sin cobro automático, trial implícito ni factura fiscal inventada. |
| N-O25 | Cola offline tras baja y revocación | consultar código y estado; no certificado en esta revisión · propuesto necesario | Rechazo visible y resolución de registros propios según política; no bucle infinito ni reactivación no autorizada. |
| N-O26 | Accesibilidad transversal y estado de error | consultar código y estado; no certificado en esta revisión · propuesto necesario | Teclado/foco/contraste/reduced-motion/texto ampliado, estados vacío/error/reintento y sin acciones tapadas por barra. |
| N-O27 | Biblioteca operativa inicial y ampliación | consultar código y estado; no certificado en esta revisión · propuesto necesario | Catálogo útil con atributos y alternativa segura cuando falte ejercicio; medios licenciados y CRUD completo después si no es necesario para piloto. |

## V1.1

| ID | Función | Estado heredado / certeza | Criterio vigente o aclaración |
| --- | --- | --- | --- |
| F-BR-02 | Intro de marca 1a + inicio regular + reducido | sin_implementar · confirmado | 1ª vez ~2,6 s saltable; luego ≤0,5 s; reduced-motion = fade; nunca durante entrenamiento activo; termina en pantalla real |
| F-NT-01 | Centro de notificaciones del alumno | sin_implementar · documentado | Destinos navegables; sin datos de salud en lock screen |
| F-CO-03 | Objetivos del cliente con progreso | sin_implementar · documentado | Objetivo acordado con indicador, unidad, plazo y fuente; progreso calculado y visible al alumno; sin prometer resultados. |
| F-CO-04 | Rendimiento: 1RM estimado, volumen por grupo, fortalezas/mejoras, check-in | sin_implementar · confirmado | Fórmula Epley documentada; heurística revisable |
| F-CO-10 | Calendario / asistencia | sin_implementar · documentado | Sesión presencial con fecha/zona, participantes y estados confirmada/cancelada/realizada; asistencia separada del registro deportivo. |
| F-CO-11 | Importación CSV | sin_implementar · documentado | Preview CSV con mapeo, validación por fila, deduplicación e informe; confirmar sólo filas válidas sin duplicar al reintentar. |
| F-CO-12 | Configuración / perfil público | sin_implementar · documentado | Perfil/configuración editables y persistidos; distinguir campos públicos de privados y preview antes de exponer datos. |
| F-BL-01 | Cobros manuales del coach a sus clientes | sin_implementar · confirmado | Separado de suscripción REPI |
| F-AD-04 | Admin · cobros | sin_implementar · documentado | Lista de cargos/pagos con estado/evidencia, conciliación y correcciones auditadas; cierre simulado no se declara cobro. |
| F-PU-01 | Sitio público | sin_implementar · documentado | Sitio responsive con identidad aprobada, producto real, contacto comercial y enlaces legales; no prometer features no disponibles ni alta libre. |
| F-CO-16 | Informe mensual para el alumno (PDF en la app) | sin_implementar · documentado | Informe generado desde datos persistidos. |
| F-CO-17 | Ingresos esperado vs cobrado | sin_implementar · documentado | Valores derivados de cargos/pagos registrados. |
| F-BL-05 | Aviso al cliente de cambio de suscripción, fin de prueba y criterio de conteo | sin_implementar · en_conflicto | Aviso y historial visibles al cliente. |
| F-HX-02 | Vista de objetivos acordados en la app | sin_implementar · propuesto | Alumno ve objetivos acordados y progreso calculado; edición y autoría claras, sin objetivos ficticios de plantilla. |
| F-HX-06 | Plan y estado de pago con el coach visible al alumno | sin_implementar · propuesto | Alumno ve plan/cargos/pagos del coach y moneda/vencimiento reales; no los mezcla con SaaS o cuota de gym. |
| F-HX-07 | Próxima sesión presencial, calendario y confirmación de asistencia | sin_implementar · propuesto | Próxima cita y confirmación sincronizadas con calendario; cancelación y asistencia con estados, sin deducir asistencia de entrenar. |
| F-HX-17 | Estado de cuenta del cliente: vencido/pausada, gracia, efecto en alumnos | sin_implementar · propuesto | Estados de cuenta y gracia visibles sólo según política acordada; definir efecto en alumnos antes de suspensión automática. |
| F-HX-18 | Medio de pago, comprobantes, facturas descargables, recordatorio | sin_implementar · propuesto | Medio de pago y comprobante con fuente/estado; descarga autorizada y recordatorio deduplicado; distinguir fiscal/interno. |
| F-HX-23 | Configuración: kg/lb, idioma, notificaciones, menores | sin_implementar · propuesto | Preferencias persistentes; conversión kg/lb sin alterar historia, idioma y notificaciones correctos; menores según política aprobada. |
| F-HX-26 | Centro de notificaciones del staff gym | sin_implementar · propuesto | Bandeja staff con estados leído/resuelto, destino navegable y filtro rol/sede; push no sustituye la persistencia. |
| N-O23 | Notificaciones con deep links y preferencias | consultar código y estado; no certificado en esta revisión · propuesto necesario | Destino autorizado y contexto recuperable; descartar suscripciones inválidas, no duplicar y no filtrar lock screen. |
| N-O24 | Costos y rendimiento con mediciones | consultar código y estado; no certificado en esta revisión · propuesto necesario | Presupuesto por servicio acordado, métricas reales y alertas; cargas paginadas/lazy sin prometer costos o fps no medidos. |

## V2

| ID | Función | Estado heredado / certeza | Criterio vigente o aclaración |
| --- | --- | --- | --- |
| F-CO-07 | Nutrición: macros, kcal, hidratación, peso, comidas | sin_implementar · documentado | La captura del lado alumno no está diseñada |
| F-BL-04 | Checkout / pasarela (Mercado Pago) | sin_implementar · documentado | Webhooks idempotentes; nunca acreditar por redirect |
| F-GR-02 | Reservas de clases | sin_implementar · documentado | Clase con cupo y reserva única transaccional, cancelación/lista de espera y asistencia; reglas de plazo/no-show explícitas. |
| F-AD-05 | Admin · planes por defecto | sin_implementar · documentado | Defaults versionados aplicables sólo a contratos nuevos o cambios explícitos; no sobrescribir precios negociados históricos. |
| F-AD-06 | Admin · flags, soporte, salud, costos IA, MRR/ARR/churn | sin_implementar · documentado | Fórmulas definidas |
| F-RC-04 | Trofeos (familia + desbloqueo 3D) | sin_implementar · documentado | Logro ganado desde evento real, desbloqueo único, familia visual coherente y fallback/reduced-motion sin 3D obligatorio. |
| F-AI-01 | Asistente IA del coach | sin_implementar · documentado | Revisión humana obligatoria; no diagnosticar |
| F-HX-01 | Registro de nutrición del alumno o integración | sin_implementar · propuesto | Captura de nutrición manual/integrada con fecha, unidades y fuente; sólo visible según grant y ámbito profesional definido. |
| F-HX-03 | Ficha de salud + apto médico con aviso de vencimiento | sin_implementar · propuesto | Documento/apto privado con fecha y vencimiento; aviso real al autorizado, sin inferir aptitud clínica del archivo. |
| F-HX-08 | Chat con adjuntos, audios, difusión y plantillas | sin_implementar · propuesto | Adjuntos/audio privados con validación y estados; difusión sólo a destinatarios autorizados con preferencias, revisión y deduplicación. |
| F-HX-12 | Validación presencial sin video por entrenador de sala | sin_implementar · propuesto | Antes de habilitar, decisión sobre validación presencial; después registrar validador/presencia/evidencia y prevenir autoaprobación. |
| F-HX-19 | Soporte Admin, cohortes, autoría y 2FA sin impersonación implícita | sin_implementar · propuesto | Diagnóstico con mínimos permisos; ver como cliente no da lectura privada o suplantación sin política explícita. |
| F-HX-20 | Prorrateo e impuestos | sin_implementar · propuesto | Aplicar prorrateo/impuestos sólo definidos, con cálculo exacto, redondeo y snapshot; probar límites de período y cambios. |
| F-HX-21 | Sesión activa: sustituir ejercicio, nota por serie, saltar, entrada en calor, calculadora de discos | sin_implementar · propuesto | Sustitución/notas/salto/calentamiento y discos mantienen prescripción original e historial; tipos compatibles y estados explícitos. |
| F-HX-22 | Notificación local del temporizador en segundo plano | sin_implementar · propuesto | Aviso al vencer descanso con soporte real/permiso y sin promesa de ejecución exacta en segundo plano; fallback visible. |
| F-HX-24 | Promociones del coach gestionables | sin_implementar · propuesto | Promoción con vigencia/condición/público definidos; edición no cambia cobros cerrados; no descuento automático no pactado. |
| F-HX-25 | Comunidad propia del coach (anuncios y desafíos) | sin_implementar · propuesto | Comunidad de coach con pertenencia/grants propios, anuncios/desafíos voluntarios y moderación; no mezclar con gym. |
| N-C16 | Desafíos entre socios y expansión de comunidades | consultar código y estado; no certificado en esta revisión · documentado / pendiente de reglas | Reglas, elegibilidad, aceptación, fechas, resultados, moderación y permisos; ninguna publicación de salud. |

## BI-1

| ID | Función | Estado heredado / certeza | Criterio vigente o aclaración |
| --- | --- | --- | --- |
| F-BI-01 | Mi cuerpo · introducción | sin_implementar · documentado | Opcional; entrenamiento funciona sin activarlo |
| F-BI-02 | Consentimiento granular por tipo de dato | sin_implementar · confirmado | 6 tipos apagados por defecto; guardar ≠ compartir |
| F-BI-03 | Elección de método (manual/fotos/3D experimental) | sin_implementar · documentado | Métodos bloqueados sin consentimiento |
| F-BI-04 | Medidas manuales con fuente | sin_implementar · documentado | Cada medida guarda quién midió, método y fecha |
| F-BI-07 | Visor 3D (rotar, zoom, vistas, capas, regiones) | sin_implementar · documentado | Etiqueta de modo de avatar siempre visible; fallback sin WebGL |
| F-BI-08 | Mapa de exposición de entrenamiento por región | sin_implementar · documentado | Color = carga registrada, no músculo real; aviso visible |
| F-BI-09 | Comparación entre fechas (swipe) con aviso de comparabilidad | sin_implementar · documentado | Advertir iluminación/pose distinta |
| F-BI-10 | Coach ve Mi cuerpo compartido | sin_implementar · documentado | Solo tipos compartidos; "No compartido" si no |

## BI-2

| ID | Función | Estado heredado / certeza | Criterio vigente o aclaración |
| --- | --- | --- | --- |
| F-BI-11 | Carga de DXA/bioimpedancia/laboratorio (PDF) + extracción revisada | sin_implementar · documentado | Revisión humana obligatoria; requiere revisión legal |

## BI-3

| ID | Función | Estado heredado / certeza | Criterio vigente o aclaración |
| --- | --- | --- | --- |
| F-BI-05 | Captura guiada de fotos (4 poses) con chequeo de calidad | sin_implementar · documentado | Cámara real; chequeos luz/distancia/encuadre/nitidez; sin ropa interior |
| F-BI-06 | Reconstrucción 3D personalizada + estado de fallo honesto | sin_implementar · documentado | Nunca mostrar modelo que no se parezca; fallback a referencia |

## FUTURO

| ID | Función | Estado heredado / certeza | Criterio vigente o aclaración |
| --- | --- | --- | --- |
| F-HX-28 | Integraciones Apple Health / Google Fit / relojes | sin_implementar · propuesto | Evaluar proveedor/API vigente y consentimientos por fuente; unidades/deduplicación y desconexión; no prometer Google Fit/Health disponible por nombre histórico. |
| N-C10 | Publicación futura en App Store/Play Store | consultar código y estado; no certificado en esta revisión · confirmado como intención futura | Evaluar tecnología y políticas al llegar; conservar cuentas y backend; no bloquear V1. |

## RETIRADO

| ID | Función | Estado heredado / certeza | Criterio vigente o aclaración |
| --- | --- | --- | --- |
| R-01 | Membresías e ingresos del gym (gym→socio) | no_aplica · retirado | Retirado explícitamente: no implementar ni reactivar desde legacy. |
| R-02 | Persona 'socia (móvil)' dentro del desktop del gym | no_aplica · retirado | Retirado explícitamente: no implementar ni reactivar desde legacy. |
| R-03 | Enlaces 'App del alumno →' desde desktops coach/gym | no_aplica · retirado | Retirado explícitamente: no implementar ni reactivar desde legacy. |
| R-04 | Autoalta de coach y gym con prueba automática de 30 días | no_aplica · retirado | Retirado explícitamente: no implementar ni reactivar desde legacy. |
| R-05 | Alta de socio por DNI contra padrón obligatorio | no_aplica · retirado | Retirado explícitamente: no implementar ni reactivar desde legacy. |
| R-06 | Precios de referencia ARS 700 por alumno, tramos y mínimos por defecto | no_aplica · retirado | Retirado explícitamente: no implementar ni reactivar desde legacy. |
