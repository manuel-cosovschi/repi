# MÁSTER PROMPT — REPI COMPLETO PARA CLAUDE CODE

Versión consolidada auditada · 25/10/2026 · Marca Concepto 2 Friendly Performance.

Este es un encargo de desarrollo integral. El handoff incluido en esta carpeta es una base de diseño y especificación, no una aplicación terminada. Implementá REPI preservando el diseño aprobado, conectando de verdad sus flujos y demostrando cada resultado. No te detengas en un análisis, una maqueta, una landing o un MVP que omita el resto del alcance. Trabajá por entregas verificables y mantené explícito lo que dependa de una decisión o de validación externa.

## 1. Regla central: el alcance es abierto al handoff completo

El usuario aclaró expresamente que existen más funcionalidades nuevas además de las mencionadas en sus mensajes y que las vas a encontrar en el handoff. Por lo tanto:

1. Inspeccioná **todos** los archivos, documentos, prototipos, estados, pantallas, componentes, assets, datos, notas, decisiones y anexos de la entrega más reciente. No uses este prompt ni la conversación como una lista exhaustiva.
2. Descubrí las funcionalidades adicionales, incluso si no aparecen en `features.json`, en los 93 IDs actuales o en este documento. Considerá también controles, variantes, reglas y requisitos originales agrupados dentro de una sola entrada.
3. Agregá cada hallazgo al inventario consolidado con fuente exacta, audiencia, propósito y estado real. No inventes funcionalidades para llenar categorías vacías. “Hay novedades que relevar” no define cuáles son ni confirma que funcionen.
4. Conservá los IDs existentes; asigná IDs nuevos a requisitos no representados. Separá duplicados, reemplazos, funcionalidades retiradas y alternativas no elegidas. No reactives una capacidad explícitamente retirada sólo porque quede en legacy.
5. Si un handoff posterior agrega o corrige algo, documentá el delta contra la versión auditada. No dejes que un resumen anterior reduzca el producto. Si contradice una instrucción humana vigente, presentá el conflicto y su impacto sin dar la contradicción por resuelta.
6. Un prototipo, un status “interactive”, un toast, una etiqueta “Guardado” o un documento que dice “completo” no acreditan implementación productiva.

La entrega final debe rendir cuentas sobre el inventario completo descubierto, no solamente sobre lo enumerado a continuación. Las fases ordenan el trabajo; no eliminan alcance.

## 2. Fuentes, lectura y autoridad

La raíz de trabajo es esta carpeta `Repi/`. Este `MASTER_PROMPT.md` es la entrada activa para iniciar el desarrollo. Las referencias del paquete están organizadas así, con rutas relativas a esta raíz:

| Material | Ubicación |
|---|---|
| Handoff completo de Claude Design | `handoff/fuentes/REPI_COMPLETE_DESIGN_HANDOFF/` |
| Prototipos actuales y legacy | `handoff/fuentes/REPI_COMPLETE_DESIGN_HANDOFF/prototypes/` |
| Marca, assets y brief original | `handoff/fuentes/REPI_COMPLETE_DESIGN_HANDOFF/assets/` |
| Investigación original Body Intelligence | `handoff/fuentes/Investigacion_Tecnica_REPI_Body_Intelligence.pdf` |
| Análisis, decisiones y mapa de pantallas | `handoff/entregables/` |
| Auditorías, inventarios, capturas y verificaciones | `handoff/evidencia/` |
| ZIP original de Claude Design | `handoff/fuentes/REPI App Mobile Prototype.zip` |

Cuando se cite un archivo del diseño sin prefijo, resolvelo dentro de `handoff/fuentes/REPI_COMPLETE_DESIGN_HANDOFF/`. La copia del máster en `handoff/entregables/` conserva la versión auditada anterior a esta organización; usá este archivo de raíz como punto de entrada, con las rutas actualizadas. Los prompts históricos dentro de los assets son fuentes de requisitos, no instrucciones alternativas para arrancar. Si cambia la ubicación de la carpeta, encontrá los archivos por nombre y contenido; no dependas de rutas absolutas de otra computadora.

Desarrollá el proyecto desde la raíz `Repi/`, inspeccionando y respetando los archivos existentes. Conservá `handoff/` como material de referencia: el código productivo y los documentos vivos del desarrollo se crean fuera de esa carpeta. Si necesitás modificar un prototipo para probar una hipótesis, hacelo sobre una copia de trabajo y mantené intacta la fuente auditada.

Leé:

- Los 24 documentos 00–23, README, CHECKLIST y MANIFEST.
- `features.json`, `screens.json`, `navigation.json`, `roles-permissions.json`, `implementation-backlog.json`, ambos tokens JSON y `tokens.css`.
- Los cinco HTML actuales y los tres legacy, `support.js` y `repi-shared.js`.
- El brief original dentro de `assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md`, la imagen maestra y los recortes.
- `assets/previous-handoff/REPI_Coach_Gym_Handoff_v3.md`, respetando sus correcciones y partes superadas.
- `01_ANALISIS_DEL_ZIP_Y_HANDOFF.md`, `03_DECISIONES_Y_FALTANTES.md` y las auditorías de código, requisitos, navegador y Body Intelligence.
- La investigación completa `Investigacion_Tecnica_REPI_Body_Intelligence.pdf`, como propuesta a contrastar, no como código ni ciencia ya validados.
- Cualquier archivo adicional del handoff nuevo que recibas y las instrucciones del repositorio destino.

Jerarquía para resolver conflictos:

1. Instrucciones humanas vigentes y decisiones humanas comprobables posteriores.
2. Concepto 2 y assets maestros aprobados para identidad/fidelidad visual.
3. Correcciones funcionales documentadas en la versión vigente, dejando clara su procedencia si no se dispone del mensaje humano original.
4. Requisitos originales que no hayan sido explícitamente retirados y expansión documentada vigente.
5. Prototipos actuales como evidencia de intención visual/interacción y de comportamiento realmente observable.
6. Propuestas técnicas, investigación y roadmap, con supuestos identificados.
7. Legacy como historia, nunca como autorización para restaurar decisiones superadas.

No conviertas “no objetado”, “supuesto” o “ilustrativo” en aprobación. Si falta una fuente, registralo. No reconstruyas mensajes inaccesibles ni anuncies que leíste adjuntos no disponibles.

## 3. Descubrimiento y primer entregable ejecutable

Antes de diseñar tablas o instalar dependencias, inspeccioná el repositorio real, su estado, stack, instrucciones y cambios existentes. No sobrescribas trabajo ajeno ni reinicies una base útil. Separá claramente el código del repositorio del código contenido en este ZIP.

Prepará y mantené:

- `docs/PRODUCT_INVENTORY.md` y un JSON equivalente: ID, fuente/localizador, módulo, rol, propósito, regla, pantalla/estado, acción, datos, permiso, dependencias, certeza, estado actual, trabajo pendiente y aceptación.
- `docs/DECISIONS.md`: decisión, alternativas, fuente, qué está confirmado, qué falta, consecuencia y módulo afectado.
- `docs/DESIGN_CONTRACT.md`: referencias visuales, tokens, componentes y motion; distingue diseño existente de extensión propuesta.
- `docs/IMPLEMENTATION_PLAN.md`: cortes verticales y dependencias para todo el alcance, incluidas novedades descubiertas.
- `docs/IMPLEMENTATION_STATUS.md`: estados demostrados, pruebas, capturas, limitaciones y pendientes; nunca una lista de checks sin evidencia.

Usá dos ejes separados para cada requisito: **certeza de producto** (confirmado/documentado/propuesto/en conflicto/retirado) y **estado técnico** (sin diseño/estático/interactivo local/simulado/integrado/persistente/probado). Una misma función puede estar confirmada y no implementada.

No uses “93 funcionalidades” como techo: el ZIP ya agrupa funcionalidades originales y contiene criterios vacíos. Tampoco interpretes 97 entradas de pantalla como 97 rutas. Corregí referencias como `F-RC-01..05` a IDs reales. Descomponé el backlog; el archivo actual es una proyección de features, no un plan ejecutable completo.

Avanzá después de ese relevamiento. Resolvé decisiones técnicas reversibles con criterio y documentación. Prepará propuestas concretas para decisiones de negocio, permisos, costo o validación que sí necesitan una definición; continuá las tareas que no dependan de ellas. No solicites aprobación para cada componente o detalle rutinario. No pongas reglas comerciales o acceso sensible en producción por haber vencido una espera.

## 4. Producto y límites confirmados

REPI es una plataforma de entrenamiento, performance, seguimiento y comunicación. Marca `repi`, lema “Cada repetición cuenta.” Una identidad y un motor compartidos, con experiencias por audiencia:

- **REPI Coach:** entrenador independiente, presencial/online/híbrido, con sus clientes.
- **REPI Gym:** gimnasio/cadena y sus socios, entrenadores de sala, coordinadores, gerentes y dueños.
- **Alumno/socio:** app PWA móvil centrada en entrenar, registrar, consultar progreso y controlar privacidad.
- **Escritorio:** Coach; staff de piso y remoto cuando corresponda; gerencia y dueño; no se limita al teléfono ampliado.
- **REPI Admin:** cuentas, contratos, facturación y operación de la plataforma, sin acceso automático a chats o datos sensibles.
- **Repi Club, Body Intelligence, pagos, comunicaciones e IA:** módulos relacionados pero con contratos y grados de madurez distintos.

Una cuenta puede tener varias relaciones y roles. No dupliques identidades porque la persona sea coach privado, staff de un gym y alumno a la vez. Cada relación tiene contexto, datos autorizados y ciclo de vida propios.

El modelo comercial Gym cobra por socio y busca un precio unitario menor por volumen. Los importes y fórmulas finales siguen abiertos. El alumno no compra micropagos a REPI por registrar entrenamientos. El Gym puede incorporar el costo a su cuota comercialmente, pero **REPI no administra ni cobra la cuota del gym al socio** según la corrección vigente. El Coach conserva sus cobros manuales a clientes. El catálogo de recepción no es un checkout.

Los managers deben poder supervisar servicio, efectividad, seguimiento y reviews con el alcance autorizado. **Nunca deben leer chats privados entrenador–alumno ni notas personales del entrenador.** No conviertas supervisión en impersonación de una cuenta de alumno.

## 5. Contrato de diseño: conservar Concepto 2

No propongas una identidad alternativa. Conservá Concepto 2 Friendly Performance, wordmark e isotipo exactos, punto cian, proporciones, composición y tono. Usá la imagen maestra y PNG aprobados hasta disponer de un vector verificado. No reconstruyas el logo escribiendo `repi` con una fuente, no uses un SVG rechazado y no redibujes la r por aproximación.

Referencia principal: `assets/brand-original/00_ORIGINAL/REPI_MARCA_APROBADA_REFERENCIA_MAESTRA.png`. Usá además recortes de marca, Coach y alumno y prototipos canónicos. Las capturas son referencia, nunca fondos con botones superpuestos.

Paleta base:

| Uso | Valor |
|---|---|
| Navy principal | `#0B0F14` |
| Superficie navy | `#1A2433` |
| Navy secundario/bordes oscuros | `#2D3B4F` |
| Cian | `#00D1FF` |
| Turquesa | `#5DE6D8` |
| Blanco de marca | `#F8FAFC` |

Alumno oscuro, escritorios claros con sidebar navy. Inter Tight para UI; JetBrains Mono para usos técnicos ya presentes. Cargá archivos y licencias de fuentes de forma adecuada; no confundas la fuente de UI con el lettering del logo. Números tabulares, formato es-AR, ARS y español rioplatense.

Extraé los tokens completos a una fuente de verdad reutilizable. `tokens.css` sólo contiene una parte de los JSON. Conservá jerarquía, densidad, radios, espacios y estados. Corregí contraste sin cambiar la marca: la divergencia blanco/oscuro sobre cian debe quedar explicitada; no perpetúes un contraste insuficiente sólo por copiar un texto antiguo.

Construí componentes accesibles: botones, campos, formularios, steppers, tabs, chips, selectores, KPI, tablas, split view, sidebars, tabbar, sheets, modales, toasts, gráficos, registro de series, descanso, visor y logros. Estados loading, empty, error, retry, disabled, success, permiso denegado y falta de conexión cuando correspondan.

Las pantallas nuevas necesarias deben extender el mismo sistema. Marcá su diseño como extensión propuesta derivada de requisitos, sin fingir que ya existía una pantalla aprobada.

### Motion

No confundir la identidad **Concepto 2** con la intro **1a “El punto”**, seleccionada según el log. Conservar esa intro; 1b/1c son alternativas históricas. Primera apertura saltable, inicio regular breve, reduced-motion, nunca interrumpir sesión activa ni repetir al volver del fondo. Resolver 520 ms frente a aceptación ≤500 ms antes de declarar cumplimiento.

Mantener microinteracciones de series, descanso, transiciones, progreso, visor, resumen y logros donde aporten información. PR sólo si el dato lo justifica. Motion no bloquea inputs ni inventa progreso de un proceso inexistente. Sonido/háptica son opcionales y pendientes; no instalar simultáneamente todas las tecnologías sugeridas en el catálogo.

La exportación tiene un error de lifecycle: `support.js` pasa sólo prevProps y los componentes usan prevState. No copies ese runtime como base productiva ni afirmes que las 24 animaciones declaradas ya funcionan. Reimplementá o repará y verificá cada comportamiento en la arquitectura elegida, con snapshots de estado correctos.

### Responsive y accesibilidad

La carcasa fija de teléfono es presentación del prototipo; la app real usa el viewport y safe areas. Validá 375/390/430/768/1024/1280/1440/1920 según superficie. Sidebar completa desde 1100, rail 768–1099 y drawer inferior según contrato; Admin también debe tener comportamiento móvil adecuado.

Control por teclado, foco visible, foco inicial/restaurado/trap en modales, fondo inerte, nombres accesibles, anuncios oportunos, alternativas a drag y controles semánticos. Switches y checkboxes activables con teclado; comparador accesible además del gesto. No depender sólo de color. Reduced-motion conserva información. Objetivo WCAG 2.2 AA en flujos importantes, probado, no autodeclarado.

## 6. Alumno: entrenamiento y seguimiento reales

Implementá inicio, semana, detalle, sesión, resumen, historial y progreso conectados al programa asignado. Inicio sin programa tiene un estado útil. El día seleccionado inicia sus ejercicios reales; Piernas no puede abrir Torso A. Cada sesión tiene identidad y versión de prescripción inmutable.

Registro de series con valores anteriores y tipos de ejercicio: carga/reps/rangos, RIR/RPE donde corresponda, tiempo/distancia, asistencia/peso corporal, unilateralidad, notas y sustituciones según definición del dominio. Prescripción y realizado son distintos. Soportar pausa, reanudación, edición y finalización con estados coherentes; no inventar que una sesión duró 12:34 ni que todas las series se completaron.

Temporizador de descanso por reloj/timestamp, pausa/reanudar, saltar y +30s. Verificar retorno del fondo y recarga. La duración total de sesión también necesita semántica real de reloj/pausa, no un contador que se detenga al navegar a otra pantalla.

Autosave real. Mostrar Guardando/Guardado local/Pendiente de sincronizar/Sincronizado/Error según el hecho. Un “Guardado” fijo no es aceptable. Resumen, volumen, constancia, PR y gráficos se derivan de registros persistidos y fórmulas documentadas. Diferenciar 1RM estimado de carga medida; no sumar comparaciones incompatibles ni fabricar historia.

### Offline obligatorio para el núcleo de sesión

Persistencia local, IDs estables de mutación, cola, idempotencia, reintento, control de versión y estrategia de conflicto. Recargar sin conexión conserva la sesión; reconectar no duplica series. Probar fallos en mitad de sync, app en fondo, cierre/retorno y cambio de dispositivo. Conservar las dos versiones cuando no se pueda resolver un conflicto sin perder datos; no sobrescribir silenciosamente.

Limitar datos sensibles offline. Logout, revocación de relación y cambio de cuenta no deben dejar datos de otra persona accesibles. No afirmar que IndexedDB de videos resuelve esto.

## 7. Coach: experiencia completa

Panel de clientes, ingresos propios, adherencia y pendientes accionables, siempre con período y definición. Directorio con búsqueda/filtro/orden/paginación y ciclo de vida: alta, edición, invitación, aceptación, pausa, reactivación, archivado y baja lógica según reglas. CSV con preview, mapeo, deduplicación y errores por fila; nunca confirmar importación por un toast sin procesar.

Ficha con ocho pestañas actuales: Resumen, Rendimiento, Rutinas, Progreso, Salud, Nutrición, Mi cuerpo y Pagos. Incorporá funcionalidades adicionales descubiertas sin limitarte a esos nombres. Cada dato debe tener productor, fuente, fecha, unidad y permiso. Salud/nutrición/cuerpo requieren autorización específica; la ausencia de datos no se rellena con seeds. Diseñá la captura del alumno y sus permisos donde falta: molestias, lesiones, check-in, energía/sueño y nutrición si el módulo se entrega.

Programación: plantillas, programas/versiones, semanas/días con nombres editables, ejercicios, prescripciones, notas, calentamientos, superseries/biseries/circuitos, tempo, RPE/RIR, duración/distancia y sustituciones según el brief vigente. Duplicación de programa/día/semana, orden accesible, borrador/publicación y asignación con fecha. Biblioteca con atributos, músculos/equipo, ejercicios propios de organización, favoritos y medios licenciados.

**Asignar crea la independencia prevista por el contrato:** no compartir un objeto mutable entre alumnos. Versionar historial; cambios futuros nunca reescriben sesiones anteriores. El preview de un programa con datos sintéticos no autoriza entrar a la cuenta real del alumno. Los textos retirados que permitían “ver app alumno” no deben volver.

Calendario y asistencia presencial tienen entidad y reglas propias; no son sinónimos de entrenamiento registrado. Mensajería real entre participantes de relación válida, estados de entrega y políticas de retención. Solicitud de acceso con destinatario, alcance, vencimiento, aceptación/rechazo y revocación efectivos. Nada de respuestas automáticas seed presentadas como otro usuario.

## 8. Gym y escritorio por rol

### Entrenador de sala y trabajo remoto

Turnos planificados/activos/finalizados, responsabilidades, cola compartida/asignada/completada, prioridad, tiempos, tomar/completar y razones. Las acciones simultáneas se resuelven en transacción para evitar dos asignados incompatibles. Mantener atribución verificable y posibilidad de disputa.

Ficha institucional del socio, programa, revisiones con autor/motivo, notas institucionales saneadas y notas personales separadas. No copiar chats ni salud a resúmenes operativos. Traspaso exige destinatario, pendientes, aceptación y estados intermedios claros; una solicitud de traspaso no acredita aceptación.

El gating por turno y `afterHoursAccess` son propuestas a reconciliar con entrenamiento remoto y trabajo autorizado fuera de sala. Diseñá el escritorio remoto y su política; no bloquees toda actividad doméstica porque el prototipo exige turno, ni lo desactives globalmente sin decisión. Escalamientos, atribución compartida y cobertura deben tener reglas explícitas.

### Gerencia y dueño

Panel de sede, equipo, detalle de entrenador, tareas/reasignación, turnos/cobertura, participación, comunidad/validaciones y reviews. Dueño: ejecutivo multi-sede, comparación de sedes, equipo/servicio, contrato REPI y configuración. Roles coordinador y recepción deben tener capacidades y experiencia definidas; reutilizar superficies puede ser válido si se justifica, no omitir el rol por faltar un HTML.

Performance Center con cinco categorías separadas: Operativo, Calidad de servicio, Participación, Resultados de entrenamiento y Satisfacción. Definición, fuente, período, muestra, contexto de turno/horas y manejo de falta de datos. Comparación contextual 2–3 personas donde corresponde. No score compuesto oculto ni decisiones disciplinarias automáticas.

Las métricas se calculan desde eventos reales: horas, tareas atendidas, por 10h, respuesta dentro de turno, vencidas, seguimientos, revisiones y participación. Resultados deportivos no prueban causalmente la calidad de un entrenador. No multiplicar seeds al elegir 7/30/90 días. No convertir ausente en cero.

Resolver sede vs organización y visibilidad individual/agregada sin vulnerar el límite de chats privados. Mientras falte definición, no ampliar acceso a datos sensibles por ser gerente. Mantener visible la necesidad de supervisión autorizada; no eliminarla para simplificar permisos.

### Reviews

Completar el circuito del socio en la app: interacción elegible, invitación descartable, rating/dimensiones/comentario, límites de frecuencia/duplicación, recepción y estados. El flujo actual de reseña no está migrado a v3. Documentar qué reglas son propuestas: una por interacción, cadencia, identidad visible, umbral de muestra y apelación.

Entrenador responde/reporta sin editar el texto del socio; moderador actúa por permiso, con motivo/log/aviso/apelación. Reseñas retiradas no cuentan en agregados. Probar muestras pequeñas, n = 0/1 y consistencia después de moderación. No usar “rango 95%” sin método y revisión estadística. Identidad del socio y publicación externa se rigen por política confirmada, no por conveniencia de UI.

## 9. Comunidad Gym y Repi Club

Comunidad Gym: posts con imagen, novedades y descuentos; desafíos con reglas, unidad, sentido de mejora (`lowerIsBetter`), cierre y premio a retirar en recepción; catálogo informativo por categoría; intentos con video, valor y confirmación; validación/rechazo con motivo, notificaciones y logros persistentes.

Archivo real validado por tipo/tamaño/duración y procesamiento seguro, con almacenamiento privado y permisos por organización. No aprobar un intento sin la prueba exigida; seeds sin video no crean una excepción de producto. Separar “intento válido” de “nuevo récord”: sólo mejorar según regla actualiza récord; el logro/mensaje debe describir el hecho correcto. Evitar doble validación, duplicado de logro y carrera entre récords. Fecha límite, retención, borrado, moderación y apelación tienen estados concretos.

La notificación a alumno y equipo y el historial sobreviven a recarga y otros dispositivos. Resetear un entorno de prueba debe limpiar objetos huérfanos; borrar metadata no borra un video. No usar nombre visible como ID de propietario.

El catálogo no procesa pedidos/pagos si no aparece un requisito humano posterior que lo cambie. “Premio en recepción” no implica comercio electrónico.

Repi Club amplio mantiene su alcance: feed/publicaciones voluntarias de logros, ámbitos coach/gym/sede/clase, reacciones/comentarios, rankings, trofeos, equipos/checkpoints/perfiles/anuncios y moderación según fuentes. Diseñá lo faltante sin inventar que ya existe; privacidad/publicación por elección, reglas de visibilidad, bloqueo/reporte y antispam. No reemplaces todo Club por la pestaña Gym ni lo declares entregado por un KPI ficticio de participación. Las novedades del handoff posterior también entran al inventario.

## 10. Pagos y facturación: tres circuitos separados

1. **Coach→cliente:** planes/cargos/pagos manuales, vencimientos, recordatorios, historial, anulaciones y auditoría. Datos del negocio del coach. No afectan el pago de SaaS automáticamente.
2. **Coach/Gym→REPI:** contratos, precios/versiones, elegibilidad facturable, períodos, snapshots, facturas internas, cobros/conciliación, estado de suscripción.
3. **Gym→socio:** fuera de REPI conforme a la corrección vigente. El estado de actividad del socio no equivale a estado de su cuota.

Los precios de demo no son autorizados para vender/cobrar. ARS 700 Coach, tramos Gym 450/380/320, mínimo 150.000, BI 60 y descuento 10% son hipótesis. “Total” no significa automáticamente “máximo del período”.

Antes de activar una política, separar:

- **Elegibilidad:** relación aceptada/vigente, programa, uso, invitación, pausa, baja/reactivación, varios vínculos/sedes; decidir qué cuenta y cómo evitar duplicados.
- **Agregación temporal:** máximo, foto en fecha o promedio diario de elegibles; son otra dimensión.
- **Período:** zona horaria, inicio/fin, corte, emisión, vencimiento y día de cobro. No confundirlos.
- **Tarifa:** por unidad, fijo, tramos marginales o tarifa global por cantidad, límites, mínimo, módulos, orden de descuentos, prorrateo, impuestos y redondeo.
- **Cambios:** vigencia futura, autorización/auditoría, cancelación, trial/pausa/impago, preservación de histórico.

Implementá cálculo exacto con decimal/unidades monetarias apropiadas, pruebas de frontera y snapshots inmutables con versión de precio/regla y detalle de unidades. No recalcular facturas pasadas con el contrato nuevo. Peak no puede ser actual×1,04 ni promedio diario la media de dos meses.

Proveedor detrás de adaptador; evaluar el disponible según país, modalidad y documentación oficial vigente. Mercado Pago aparece como candidato, no como conexión existente. Webhooks autenticados, deduplicación, idempotencia, conciliación y estados reales. El redirect no acredita pago. Secretos sólo servidor; nunca almacenar tarjetas. Diferenciar factura interna de comprobante fiscal y resolver integración fiscal requerida.

Mientras no haya reglas/credenciales/entorno definidos, usar pruebas claramente etiquetadas. No cobrar dinero real ni presentar una integración ausente como operativa. La implementación de prueba y motor configurable puede avanzar sin inventar condiciones comerciales.

## 11. REPI Admin

Cuentas Gym/Coach, alta/edición, estado, contrato por cliente, tarifas/tramos/fijo/mínimo/descuento/módulo, día de cobro, regla de conteo, preview, cambios efectivos e historial. Alta abre una ficha válida después de persistir; no uses el snapshot previo que falla en la demo.

Listado de cobros, estados, conciliación y anulación autorizada. Planes por defecto editables/versionados donde se requiera; las cartas estáticas actuales no lo implementan. Métricas SaaS MRR/ARR/churn sólo con definiciones y fuentes, sin equiparar facturación demo con ingresos recurrentes.

Inventariar y completar flags, soporte, salud del sistema, trabajos fallidos, costos IA y herramientas operativas según requisitos. El rol interno no concede lectura universal de entrenamiento, salud, fotos, documentos ni chat. Soporte con mínimos permisos y trazabilidad; no introducir acceso de impersonación sin requisito y política explícitos.

## 12. Body Intelligence: separar registro, visualización e inferencia

Módulo opcional. Entrenar sigue funcionando al rechazarlo. Fotos opcionales, sin exigir ropa interior; alternativa manual y accesible. No diagnosticar ni prometer medidas exactas desde imágenes.

### Registro y privacidad

Medidas con valor/unidad/fecha/fuente/método; fotos de progreso elegidas; informes con procedencia; estado desconocido diferente de cero. Diseñá evaluación, edición/corrección, exportación/borrado y recordatorios reales. No forzar altura/peso/edad para un simple avatar genérico sin necesidad documentada.

Separar almacenar, procesar con IA y compartir por tipo, destinatario, propósito, relación y versión de consentimiento. Default sin compartir; no copiar `share.medidas=true` de la seed ni los DEFAULT TRUE del SQL del PDF. Los seis toggles BI no resuelven automáticamente salud, nutrición y check-in; completar su contrato.

Revocación efectiva en servidor y objetos, cachés controladas y tareas pendientes. Retención por originales, derivados, temporales, mallas, PDFs, backups, auditoría y videos. Distinguir dejar de compartir de borrar. Definir qué se conserva legítimamente y comunicar límites; no prometer recuperar copias externas ya descargadas. Logs sin contenido sensible.

### Visor

Genérico rotulado, ajustado aproximado sólo si realmente se ajusta y reconstrucción personal sólo si existe y cumple los criterios. La demo arma esferas/cilindros/cajas; cambiar su etiqueta no personaliza geometría.

Mantener navegación/zoom/vistas/capas, selección por zonas y alternativa accesible, lazy loading, fallback 2D/WebGL, manejo de pérdida de contexto, recursos liberados y reduced-motion. Colores indican exposición/carga registrada, no músculo, grasa, hipertrofia o fatiga medidos. Inicialmente conservar las nueve regiones visibles del diseño; resolver taxonomía interna, lateralidad y mapeos antes de agregar números del PDF. El PDF dice 28/14 pares pero enumera 16 grupos.

Comparación exige datos comparables: método, dispositivo, pose, fecha, fuente y versión. Si usa mallas, topología, orden de vértices, escala y alineación compatibles. No simular cambios corporales con dos modelos genéricos y llamarlos resultado del usuario.

### Captura y reconstrucción experimental

La cámara guiada, calidad, cifrado/subida y reconstrucción de la demo están simulados. Reemplazar cada uno por un servicio real o mantenerlo identificado como no disponible. Los cuatro pasos del diseño no equivalen a validación del modelo. Nunca llenar un progreso ficticio para afirmar trabajo real.

El PDF es insumo de investigación. No copiar su fitter: recibe perímetros pero no los utiliza en la pérdida; tampoco entrega lo que promete. No afirmar que su esquema tiene RLS: faltan políticas. No llamar anonimización al simple blur facial; seguir tratando foto/malla vinculadas a cuenta como personales. No inferir sexo/género desde imagen ni convertir todo valor distinto de M en femenino. Separar controles visuales de variables relevantes para medición y definir edades/población/alternativas soportadas.

Comparar proveedores/topologías/LOD y licencias de código, pesos, assets y dependencias por versión. La presencia de Anny/MHR/SOMA/SAM/SMPL-X en un PDF no autoriza su uso comercial ni obliga a integrar todos. Medir resultados, latencia, memoria y costos reales. No copiar precios o FPS como garantías.

Aislar cámara, ajuste, reconstrucción, documentos e IA mediante flags independientes. Antes de habilitar inferencia: protocolo revisado, datos de evaluación apropiados, repetibilidad, error y sesgos por subgrupo, incertidumbre, condiciones de rechazo y evaluación independiente. El estudio N=60 del PDF es propuesto, no ejecutado; su tabla de criterios está dañada. No usar p>0,05 como validación de equivalencia, ni MDC como prueba de causa del cambio.

Rollback: desactivar inferencia conserva entrenamiento, medidas y fotos guardadas con consentimiento; volver a genérico sin reescribir historia; cancelar trabajos revocados, versionar modelo/fórmula/topología y retirar resultados erróneos con trazabilidad.

### Composición y documentos

Sin fuente apropiada, mostrar Datos insuficientes. DXA/BIA/pliegues o laboratorio requieren método, equipo/ecuación cuando aplique, unidad, fecha y comparabilidad. No extrapolar segmentos de un informe a tejido de cada músculo.

Diseñar carga, extracción propuesta, revisión lado a lado con página/zona/texto original, corrección, aceptación/rechazo y auditoría antes de graficar. Conservar valores cualitativos, rangos, `<`/`>`, desconocidos y unidades sin inventar números. Verificar códigos LOINC y conversiones individualmente; no elegir código sólo por nombre ni declarar conformidad FHIR por guardar un JSON.

Revisión jurídica y especializada antes de activar tratamiento sensible/interpretaciones; no diagnosticar ni prescribir. Costos, precisión, normativa y licencias deben comprobarse con fuentes primarias vigentes para el alcance concreto. Consultá las advertencias y enlaces de `handoff/evidencia/BODY_INTELLIGENCE_AUDIT.md`.

## 13. Autorización y datos multi-organización

Modelo contextual: usuario + organización + sede cuando corresponda + relación + capacidad + recurso + propósito + grant cuando aplique. Consentimiento no sustituye pertenencia ni autorización. Validá cada lectura, escritura, exportación y descarga en servidor; nunca confíes en IDs del cliente o filtros de UI.

Separar pertenencia staff, relación gym_member y coach_client. Un grant al coach privado no autoriza a esa misma persona actuando como staff de gym. Cambio de espacio no mezcla cachés, conversaciones, métricas o datos. Revocación/baja se aplica a sesiones y trabajos posteriores.

Managers/dueños: operación institucional y métricas autorizadas, sin chats privados/notas personales ni datos sensibles para evaluar staff. Admin: cuentas/finanzas/operación, sin acceso sensible por defecto. Staff con acceso clínico/corporal es una contradicción pendiente en las fuentes: no ampliar ese permiso hasta resolver destinatarios/finalidades. Mantener mínimo acceso mientras el módulo no está decidido.

Notas institucionales y personales son recursos diferentes. Las tareas usan resúmenes saneados. Community scoped al gym/sede; videos privados a validadores autorizados. Moderación por capability, no sólo por título de gerente. Audit events registran actor/recurso/acción/resultado/tiempo sin copiar el secreto o el contenido médico.

Probar aislamiento horizontal/vertical, sustitución de IDs, cambios de rol/sede, grant vencido/revocado, URLs de objetos, exportaciones y respuestas de error. No revelar existencia ni metadatos de datos ajenos. Un candado o selector de personajes no implementa esto.

## 14. Arquitectura y dominio

Inspeccioná el repo antes de elegir. Preferencia del brief: monolito modular TypeScript, React/Next, PostgreSQL, ORM/migraciones, autenticación mantenida, objetos privados, outbox/jobs y PWA. Es una recomendación técnica, no prueba de código existente ni obligación de migrar una base válida. Verificá versiones/compatibilidad en documentación oficial antes de fijar dependencias. Evitá microservicios o proveedores adicionales sin necesidad.

Lógica de dominio fuera de componentes, validación cliente/servidor, transacciones y APIs tipadas/documentadas. El HTML exportado inspira UI y reglas; su runtime CDN, seeds y estilos duplicados no son la arquitectura productiva.

Cubrir los dominios existentes sin crear tablas por obligación nominal:

| Dominio | Responsabilidades mínimas |
|---|---|
| Identidad/tenencia | User, Account, Session, Organization, GymLocation, StaffMembership, roles/capabilities, MemberRelationship, Invitation |
| Programación | Exercise/media, plantillas, versiones, días/ejercicios/prescripciones, asignaciones/copias y revisiones |
| Ejecución | WorkoutSession, SetLog, historial, PR, objetivos, asistencia/check-in y sincronización |
| Salud/nutrición/BI | Registros con procedencia, consentimientos/grants, fotos/objetos, evaluaciones, modelos/jobs, informes y correcciones |
| Operación Gym | Turnos, solicitudes, tareas/asignaciones, traspasos, notas, interacciones elegibles, métricas/atribución/disputa |
| Reviews | Reseña, respuesta, moderación, apelación, visibilidad y auditoría |
| Comunidad/Club | Publicaciones, desafíos/intentos, evidencias, decisiones, récord/logro, catálogo, feed/reacciones/rankings/moderación según inventario |
| Comunicación | Conversaciones/participantes, mensajes, notificaciones/preferencias y suscripciones push |
| Coach comercial | Plan/cargo al cliente, pago manual, anulación y recordatorio |
| SaaS | Contrato/precio/versiones/tramos, período/snapshot, factura/líneas, pago/webhook/eventos e historial de cambios |
| Operación plataforma | Auditoría, flags, jobs/outbox, idempotencia, soporte, costos y observabilidad |

Diseñar índices, paginación, constraints, estados, transacciones, soft deletes y retención; no pegar el SQL del PDF. Identificadores estables, fechas/zonas coherentes y dinero exacto. Seeds ficticias rotuladas DEMO y separadas de usuarios reales.

Manifest/service worker/instalación PWA y notificaciones según soporte real. Configuración dev/test/staging/prod, `.env.example` sin secretos, scripts de instalación/arranque/pruebas, lockfile y migraciones. Backups con restauración probada, monitoreo sin PII sensible, rate limits y controles de archivos/abuso. No declarar despliegue o integración externa sin haberlos realizado y verificado.

## 15. IA y automatizaciones

Las métricas deterministas y alertas actuales no son un LLM. Implementá primero fuente de verdad y cálculos. Asistente posterior con proveedores intercambiables, prompts versionados, output estructurado/validado, límites/costo, fuentes y flags. Casos del brief: resúmenes, alertas, borradores, sugerencias revisables y explicación de datos. Toda modificación de rutina o mensaje generado requiere revisión del entrenador antes de aplicarse/enviarse.

Sin diagnóstico/tratamiento ni envío autónomo de datos sensibles. Un toggle IA no implica un servicio. Extracción documental y reconstrucción son pipelines separados del asistente. Reintentos no duplican mensajes, cargos o trabajos.

Sitio público, onboarding, perfiles/configuración, notificaciones, calendario, CSV, recepción/coordinación, reservas y demás requisitos originales/nuevos siguen inventariados. Que no estén en los prototipos no los elimina; decidir su entrega por dependencias y dejar evidencia del estado.

## 16. Orden de ejecución propuesto, con alcance íntegro

1. Descubrimiento completo, reconciliación, inventario abierto, contrato visual, decisiones y arquitectura.
2. Base ejecutable: identidad, contextos/relaciones, permisos, componentes Concepto 2, datos/migraciones, navegación y estados.
3. Ciclo persistido Coach→programa→asignación→alumno→sesión→progreso, offline, versiones y comunicación.
4. Gym operación/piso/remoto, gerencia, scopes, métricas y reviews completas; relación dual y capturas faltantes según dependencias.
5. Comunidad/validaciones, catálogo/logros y notificaciones; Repi Club amplio con sus permisos/moderación.
6. Pagos manuales, motor SaaS/Admin y proveedor en pruebas; activación comercial sólo con reglas y configuración resueltas.
7. BI registro/privacidad/visualización, documentos y experimentos separados; IA con revisión humana.
8. Resto del inventario vigente y novedades descubiertas, hardening, pruebas, QA visual, accesibilidad y operación de lanzamiento.

Este orden es una propuesta de ejecución. Ajustalo al repo y dependencias reales sin reducir la meta. No trates etiquetas MVP/V1/V2 de un archivo como una aprobación para sacar Gym, chat, Club o funciones nuevas del alcance. No pongas un experimento científico en producción para poder marcar el producto “completo”. Cada bloqueo debe dejar trabajo concreto, criterio de salida y responsable de la decisión, mientras seguís con lo independiente.

## 17. Pruebas y criterios de aceptación obligatorios

No basta compilar. Elegí pruebas de lógica, integración de datos/permisos y E2E apropiadas al riesgo y stack; no agregues tests que sólo repitan implementación. Cada requisito nuevo descubierto requiere criterios propios.

1. Coach registra/verifica cuenta, completa onboarding, invita alumno; invitación expira/se revoca; alumno acepta y ve sólo su relación.
2. Crear/publicar/asignar programa con fecha; alumno inicia el día correcto, registra, descansa, pausa/reanuda/finaliza; historial y progreso del Coach reflejan esos datos persistidos tras recargar.
3. Copias por cliente y nuevas versiones no alteran otros clientes ni sesiones históricas. Duplicar días/semanas mantiene la semántica definida.
4. Offline: registrar, cerrar/recargar, volver online, reintentar y conflicto entre dispositivos sin pérdida ni duplicados.
5. Usuario de otra organización, sede o rol no lee/escribe/descarga/exporta recursos ajenos. Misma persona en Coach y Gym no hereda grants entre contextos.
6. Manager no accede a chat privado ni notas personales, aunque cambie IDs o revise una queja; sí ve supervisión autorizada.
7. Turno/afterHours según política; tomar tarea concurrentemente, completar y traspasar con aceptación, atribución y auditoría correctas.
8. Métricas usan período/fuentes reales y faltantes; moderar/retirar reseña recalcula; muestras pequeñas tienen comportamiento decidido y método documentado.
9. Reseña desde app sobre interacción elegible; evitar duplicados, responder/reportar/moderar/apelar con permisos y visibilidad correctos.
10. Novedad/catálogo/desafío aparece en app y emisor sin recargar; intento con video privado→decisión→notificación→logro. Récord sólo si mejora; concurrencia y reintentos sin duplicado. Borrado/retención incluyen blobs.
11. Pago manual y anulación auditados no modifican SaaS. Cálculo de elegibles, snapshots, tramos, límites, corte, mínimo/descuento/módulo y cambios de precio según contrato; facturas históricas inmutables.
12. Webhook válido/duplicado/fallido/fuera de orden, conciliación y estados; redirect solo no paga. Sin credenciales no simular dinero real.
13. BI rechazado no bloquea entrenamiento; guardar no comparte; grant/revocación funciona entre dispositivos y objetos; exportar/borrar cumple alcance comunicado. Falla de reconstrucción conserva sólo lo autorizado.
14. Visor informa modo y fuente; composición ausente no inventa porcentaje. Modelo/documentos/versiones incompatibles no producen comparación engañosa.
15. Admin crea/edita contrato y muestra cambios efectivos/historial, sin excepción de alta ni acceso sensible. Planes/defaults no son mockups cuando se declaran implementados.
16. Auth: recuperación/cambio de credenciales, expiración/revocación de sesiones y relación; antiabuso y estados de error.
17. Responsive, safe areas, teclado, lector, foco, contraste, reduced-motion, fallback WebGL y rendimiento medidos con capturas reales de viewports relevantes.
18. Cada funcionalidad nueva de handoff tiene trazabilidad y prueba; ninguna se omite por no figurar en esta lista.

El runtime exportado ya produjo errores de prevState, alta Admin y refresco de store. Agregá verificaciones que eviten heredarlos; no los ocultes con catch ni declares ausencia de errores porque la UI todavía renderiza.

## 18. Definición de terminado y comunicación de entrega

Terminado por funcionalidad significa: diseño fiel + acción real + persistencia + autorización + validación + errores/estados + comportamiento responsive/accesible + pruebas relevantes + documentación y evidencia. Si depende de un mock, proveedor ausente, regla no decidida o ciencia no validada, su estado debe decirlo.

Al cerrar cada entrega informá qué cambió, qué flujo funciona, cómo se probó, fuente del requisito, evidencia visual y límites. Compará capturas reales con la imagen maestra y prototipos al mismo viewport, explicá diferencias y corregí desviaciones; no generes una ilustración para fingir captura.

Conservá las fuentes originales. Entregá código, scripts reproducibles, migraciones, configuración de ejemplo, fixtures DEMO, documentación y matriz de cobertura actualizada. No publiques ni actives cobros por inferirlo de “desarrollar”. No uses métricas de demo como resultados comerciales. No prometas fechas, precisión, costos o cumplimiento sin evidencia.

Comenzá inspeccionando todo el handoff y el repositorio. Integrá las novedades que encuentres, preservá Concepto 2 y avanzá hasta completar el alcance autorizado y verificable, manteniendo separados los bloqueos concretos que requieran decisiones o validación externa.
