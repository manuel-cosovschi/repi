# Auditoría documental de requisitos y diseño REPI

Fecha: 25 de octubre de 2026. Fuente auditada: `/Users/manuelcosovschi/Documents/ChatGPT/Proyectos/REPI_Auditoria_2026-10-25/fuentes/REPI_COMPLETE_DESIGN_HANDOFF`.

Las referencias `archivo:línea` se resuelven desde esa carpeta. Se leyeron los 24 documentos 00–23, README, CHECKLIST, todos los JSON de raíz y el duplicado de tokens, CSS de tokens, handoff previo v3 y los dos Markdown de la marca original. La matriz complementaria `MATRIZ_REQUISITOS_DOCUMENTADOS.json` conserva las 93 funcionalidades y las 97 entradas de pantalla con referencias de línea y campos originales; `MATRIZ_REQUISITOS_DOCUMENTADOS.md` permite revisar las 93 funcionalidades en una tabla. Este informe no valida HTML, ejecución en navegador, backend ni seguridad implementada. «Prototipo interactivo», «completo», «aprobado» y «real» se tratan como afirmaciones de las fuentes, salvo evidencia adicional indicada explícitamente.

## 1. Dictamen para el prompt maestro

El paquete sirve como inventario de intención y referencia de diseño, pero no como prueba de producto terminado ni como autoridad única sobre las decisiones humanas. Conserva la marca Concepto 2, Coach/Gym, escritorio por rol, operación de sala, seguimiento, métricas/reseñas, comunidad, pagos separados y Body Intelligence. También conserva contradicciones, supuestos comerciales, flujos retirados y requisitos originales comprimidos o sin pantalla. El propio paquete admite pérdida de conversación y reconstrucción desde memoria (`01_COMPLETE_PRODUCT_SPEC.md:47`); no es correcto convertir una etiqueta de aprobación o un checkbox en confirmación del usuario.

Para el prompt definitivo deben prevalecer las instrucciones humanas actuales/recuperadas: misma aplicación con modos Coach/Gym; gimnasios pagan por socio con precio unitario menor por volumen; escritorio para entrenadores de piso, remotos y managers; managers ven efectividad/progreso/reviews con las fronteras autorizadas y nunca chats privados entrenador–alumno; Concepto 2 se conserva. Estas instrucciones humanas llegan al encargo de esta auditoría y no cuentan con archivo:línea dentro del ZIP. Deben registrarse como fuente externa explícita, sin inventar citas del ZIP.

La base documental coincide en parte: dos modos comerciales y motor compartido (`01_COMPLETE_PRODUCT_SPEC.md:8`); pagador entrenador/organización y alumno sin micropagos a REPI (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:72`); Coach para presencial/online/híbrido (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:70`); frontera de chats privados (`06_ROLE_PERMISSION_MATRIX.md:13`, `06_ROLE_PERMISSION_MATRIX.md:37`). Sin embargo, no hay una experiencia Gym específica del entrenador remoto ni criterio de aceptación de esa modalidad. No debe afirmarse que está resuelta porque existe escritorio de coach independiente.

## 2. Conteos recalculados y límites del inventario

Se analizaron los JSON con un script, validando unicidad de IDs, referencias, coincidencia backlog/features, existencia de rutas de fuentes declaradas y paridad entre los JSON de tokens. No se inspeccionó la lógica de los prototipos para estas verificaciones.

| Medida | Resultado recalculado | Evaluación |
|---|---:|---|
| Funcionalidades | 93 IDs únicos | Correcto como inventario |
| Estados de funcionalidades | 63 interactive_prototype + 6 partially_designed + 22 specified_not_designed + 1 static_mockup + 1 designed | Resumen/manifest omiten la categoría `designed`: sus cuatro subtotales suman 92, no 93 |
| Origen declarado | 33 original + 60 added | Coincide con el recuento; la etiqueta no prueba procedencia conversacional |
| Prioridades declaradas | 22 MVP + 46 V1 + 20 V2 + 4 V3 + 1 Experimental | Coincide con roadmap; no acredita aprobación |
| Pantallas/entradas | 97 IDs únicos | Incluye tabs, modales, overlays, showcase de motion, legacy y grupos de varios flujos; no son 97 rutas independientes |
| Estados de pantalla | 73 prototipo + 1 mockup + 2 concepto + 2 parcial + 19 sin diseño | Suma 97 |
| «Con diseño o prototipo» | 74 = 73 + 1 | Incluye mockup estático y un showcase de intro; no implica 74 pantallas productivas |
| Desktop/móvil «diseñados» | 48 desktop + 26 mobile | Los 26 móviles incluyen 25 de la app y SCR-MI-01 de revisión de intro |
| Aceptación vacía | 33 de 93 funcionalidades con `—` | «Criterios por funcionalidad» no es cobertura completa |
| Estados vacíos | 51 de 97 entradas con `states = —` | Más otras entradas solo describen un estado parcial o dicen «no especificado» |
| Funcionalidades sin pantalla | F-BR-01, F-RV-01, F-MO-02 | Marca puede ser transversal; reseña del socio y relación dual sí son huecos de trazabilidad |
| Backlog | 93 entradas; proyección exacta de features | No es descomposición de ejecución ni verificación independiente |
| Mapa diseño→implementación | 77 filas | No incluye las 20 entradas SCR-N-01..20, incluso N-05 que sí tiene una referencia parcial |
| Assets declarados | 25 archivos existentes | Incluye 3 Markdown; son 22 PNG, no 25 recursos visuales |
| Prototipos declarados | 29 archivos existentes | 8 HTML + 3 JS + 18 PNG, incluyendo legacy; no son 29 prototipos interactivos |

Fuentes de conteos publicados: `00_EXECUTIVE_SUMMARY.md:5`, `MANIFEST.json:3`, `MANIFEST.json:11`, `MANIFEST.json:24`, `MANIFEST.json:27`, `README.md:14`. Categoría omitida: `features.json:6` (F-BR-01; estado `designed`), `02_ALL_FEATURES_INVENTORY.md:7`.

**Conteo de diseños faltantes:** `MANIFEST.json:27` declara 21. Puede reconstruirse como 19 `specified_not_designed` + 2 `partially_designed`, pero esos dos parciales son biblioteca SCR-N-05 y escritorio legacy SCR-L-01. Excluye los dos conceptos alternativos de intro, lo cual es razonable si no se implementarán, pero también deja fuera del conteo la nueva pantalla de reseña del socio, el selector de relación del alumno, la captura de salud/check-in y nutrición: se nombran como brechas sin pantallas propias (`20_GAP_ANALYSIS.md:13`, `20_GAP_ANALYSIS.md:14`, `20_GAP_ANALYSIS.md:15`, `20_GAP_ANALYSIS.md:30`). Por tanto, 21 no es el número exhaustivo de diseños necesarios para entregar todos los requisitos.

**Referencia máquina rota:** `screens.json:1879` almacena `F-RC-01..05` como un único ID en SCR-N-09. Ese ID no existe; debería ser una lista de los cinco IDs, si se conserva el formato. Los cinco features sí apuntan hacia SCR-N-09, pero no tienen correspondencia inversa literal válida. El Markdown también usa esa abreviatura (`03_COMPLETE_SCREEN_INVENTORY.md:1148`). No hay otras referencias features→screens inexistentes. Los 93 registros del backlog coinciden con sus features en nombre, estado, prioridad, complejidad, dependencia, aceptación y pantallas: es redundancia consistente, no validación cruzada de requisitos.

**«10 abiertos + inconsistencias»:** es 2 decisiones «No» (DEC-16,17) + 1 «Parcial» (DEC-15) + 7 INC (`MANIFEST.json:25`). No incluye como abiertas todas las decisiones «Supuesto» o «requiere validación» (DEC-03/05/06/07/08/09, entre otras). «10» no es el total exhaustivo de asuntos que necesitan decisión.

## 3. Jerarquía de fuentes y evidencia de aprobación

1. Instrucciones humanas actuales y recuperadas, registradas como tales.
2. Identidad visual aprobada: imagen maestra y recortes originales. El brief establece explícitamente esa jerarquía (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:7`). Los prototipos posteriores deben verificarse contra ella; no la reemplazan por existir.
3. Correcciones funcionales explícitas v3/v4, siempre distinguiendo la afirmación documental de una conversación primaria disponible. La cabecera del handoff previo declara que v3 sustituye lo que contradiga sus correcciones (`assets/previous-handoff/REPI_Coach_Gym_Handoff_v3.md:3`).
4. Requisitos originales vigentes, con su nivel de obligatoriedad real. El brief es mezcla de imperativos, preferencias, hipótesis y futuro; no todo tiene la misma firmeza.
5. Documentación actual y prototipos como referencia de intención. Las rutas están rotuladas «propuestas» (`23_DESIGN_IMPLEMENTATION_MAP.md:6`); el stack es recomendado (`23_DESIGN_IMPLEMENTATION_MAP.md:3`); roadmap explícitamente propuesto (`21_PRODUCT_ROADMAP.md:1`).
6. Legacy y texto superado: contexto histórico, sin reactivar funciones retiradas.

No convertir «Sí (no objetado)» en aprobación positiva: DEC-05 está etiquetado así (`18_DECISION_LOG.md:9`). No convertir «confirmada por usuario/brief» en prueba por sí misma: la tabla distingue [C]/[S]/[A]/[?], pero no adjunta el mensaje humano de cada decisión (`05_BUSINESS_RULES.md:3`). DEC-15 reconoce que «máximo del período» es una elección de diseño inferida de «que se pague el total» (`18_DECISION_LOG.md:19`). El resumen dice «marca no se modificó» (`00_EXECUTIVE_SUMMARY.md:3`), aunque el propio log declara cambios visuales de contraste y tokens respecto del brief. Eso puede ser una corrección legítima de accesibilidad, pero exige comparar referencias; no basta la autoafirmación.

## 4. Requisitos vigentes por superficie y módulo

### 4.1 Una aplicación, modos y relaciones

REPI es performance, seguimiento y entrenamiento, con Coach independiente y Gym/cadenas, motor compartido y diferencias por permisos/flujos (`01_COMPLETE_PRODUCT_SPEC.md:4`, `01_COMPLETE_PRODUCT_SPEC.md:8`). La misma cuenta puede ser coach privado, staff, alumno y socio sin duplicar User; se separan espacios, relaciones y consentimientos (`05_BUSINESS_RULES.md:6`, `06_ROLE_PERMISSION_MATRIX.md:43`, `10_DOMAIN_DATA_REQUIREMENTS.md:26`). La barra «ver como» es control del prototipo, no producto (`03_COMPLETE_SCREEN_INVENTORY.md:739`).

Superficies declaradas: app alumno PWA oscura; escritorio Coach claro; escritorio Gym claro por entrenador/gerente/dueño; Admin interno; público/auth/onboarding (`01_COMPLETE_PRODUCT_SPEC.md:13`). Los dos HTML Coach/Gym no justifican diseñar dos apps inconexas. El selector staff Gym↔Coach se referencia en SCR-GX-09; el selector real del alumno con gym y coach no está diseñado (`04_USER_JOURNEYS.md:32`, `04_USER_JOURNEYS.md:35`).

### 4.2 App alumno: núcleo de entrenamiento

Inicio con entrenamiento del día y semana; rutina con ejercicios, prescripción y valores anteriores; sesión con carga/reps/RPE/RIR/tiempo según tipo, completar en un toque, descanso real pausar/omitir/+30s, pausar/reanudar sesión, autosave/sync; resumen; historial y progreso (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:156`, `assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:158`, `03_COMPLETE_SCREEN_INVENTORY.md:48`). PR solo comparable y validado; diferenciar registros/estimaciones; medidas/fotos opcionales (`05_BUSINESS_RULES.md:16`, brief original:146). No asumir que mostrar «Guardado» acredita guardado o sincronización (`03_COMPLETE_SCREEN_INVENTORY.md:56`).

Offline es requisito original importante, no extra opcional: IndexedDB, IDs estables/idempotentes, cola de mutaciones, reintentos al reconectar y al recuperar foco, recarga sin pérdida, conflicto entre dispositivos con preservación de datos (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:160`). El diseño de estados está pendiente (`20_GAP_ANALYSIS.md:8`). No inferir que IndexedDB para videos de desafío resuelve sesiones offline.

### 4.3 Coach: seguimiento, programación, pagos

Panel con KPIs y alertas accionables; clientes con búsqueda/filtros/orden; ficha ocho tabs Resumen, Rendimiento, Rutinas, Progreso, Salud, Nutrición, Mi cuerpo, Pagos (`12_COACH_EXPERIENCE.md:5`). Rendimiento: Epley, mejor serie, delta, sparkline, series por grupo vs plan y check-in; fortalezas/a mejorar como heurística revisable, no IA clínica (`12_COACH_EXPERIENCE.md:8`, `17_AI_AND_AUTOMATIONS.md:4`). Salud/nutrición/cuerpo con consentimiento, no acceso automático.

Constructor: programa, días renombrables, agregar/quitar/reordenar ejercicios, series/reps/RIR/descanso, indicaciones, duplicar/asignar con fecha y copia por cliente (`12_COACH_EXPERIENCE.md:15`). Original más amplio: versiones, semanas, rangos, RPE/tempo, duración/distancia, calentamiento, superseries/biseries/circuitos, unilateralidad, sustituciones, duplicación de día/semana, borrador/publicación/preview y alternativas al drag-and-drop (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:142`). El prototipo reducido no elimina esos requisitos; su entrega debe planificarse sin declarar todo completo. Editar futuras versiones nunca modifica el pasado (`05_BUSINESS_RULES.md:13`).

Directorio no equivale CRUD del cliente: original requiere alta/editar/invitar/pausar/reactivar/archivar/baja lógica, paginación y columnas configurables, CSV con preview/dedupe/errores (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:138`). Biblioteca requiere CRUD, atributos, medios licenciados, favoritos y ejercicios por organización (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:140`). Esos aspectos no tienen 93 IDs separados ni criterios suficientes, aunque se dice «todos los módulos conocidos» (`CHECKLIST.md:2`).

Chat coach–alumno de relación activa; calendario/asistencia presencial separado de entrenamiento registrado; cobros manuales separados de suscripción SaaS (`05_BUSINESS_RULES.md:60`, brief original:144,148). Alta, invitaciones, calendario, CSV, configuración/perfil público, versionado avanzado y biblioteca CRUD se reconocen pendientes (`12_COACH_EXPERIENCE.md:19`).

### 4.4 Gym: operación y escritorio

Entrenador de sala: Mi turno, cola, ficha institucional, notas institucionales/personales, traspaso y Mi desempeño. Tareas saneadas nunca copian chats ni salud; edición con motivo visible al equipo; atribución y disputa (`13_GYM_EXPERIENCE.md:5`, `05_BUSINESS_RULES.md:18`). Turno activo/afterHoursAccess, escalamiento a +30 min y división de trabajo compartido son supuestos de diseño, no instrucciones humanas primarias verificadas (`05_BUSINESS_RULES.md:19`). Preservarlos como propuestas si se implementan, sin atribuir aprobación.

Gerente: panel, Performance Center, equipo/detalle, tareas/reasignación, reseñas/moderación, turnos/cobertura, participación, comunidad y validaciones (`13_GYM_EXPERIENCE.md:8`). Dueño: ejecutivo, sedes, equipo y servicio, comunidad, validaciones, facturación REPI y configuración (`13_GYM_EXPERIENCE.md:11`). Managers necesitan valorar efectividad, progreso y reviews por requisito humano recuperado. La documentación concreta métricas operativas y satisfacción, y restringe resultados de entrenamiento a sede; ese alcance necesita preservarse como política documentada pendiente de reconciliación con la visibilidad solicitada, no expandirse hacia chats.

Recepción/coordinador sin pantallas propias; mensajería gym↔socio y reservas sin diseño (`13_GYM_EXPERIENCE.md:20`). Entrenadores remotos en Gym carecen de flujo explícito. No deducir de la ausencia que no deben existir: es una brecha contra el requisito humano.

### 4.5 Performance Center y reviews

Cinco categorías separadas: Operativo, Calidad, Participación, Resultados de entrenamiento a nivel sede, Satisfacción (`03_COMPLETE_SCREEN_INVENTORY.md:460`). Definiciones originales del handoff previo: horas, solicitudes completadas y por 10h, respuesta mediana dentro de turno, vencidas, seguimientos a tiempo, revisiones de programas, onboarding, socios únicos, programas con sesión en 14 días, progresión/adherencia/frecuencia de sede, reseñas/rango (`assets/previous-handoff/REPI_Coach_Gym_Handoff_v3.md:105`). Sin score compuesto, sin decisiones disciplinarias automáticas, sin salud/cuerpo para evaluar staff (`05_BUSINESS_RULES.md:24`). Comparación de 2–3 con contexto; faltantes como «—», no cero; atribución a quien realiza/acepta, compartida explícita, disputable (handoff previo:124).

Reviews verificadas tras interacción elegible; rating 1–5 obligatorio, dimensiones/comentario opcionales; invitación descartable, una por interacción y como máximo una cada 14 días; entrenador sin nombre, gerencia con nombre; publicación externa apagada; staff no edita texto; respuesta privada; moderación y apelación de 14 días (`assets/previous-handoff/REPI_Coach_Gym_Handoff_v3.md:144`). Elegibilidad/cadencia/anonimización son supuestos identificados (`05_BUSINESS_RULES.md:31`). Promedio n<5 frente a legacy n<10 sigue abierto (`18_DECISION_LOG.md:11`). «Rango ~95%» no define método estadístico, tamaños/casos extremos ni precisión: no inventar una fórmula y llamarla aprobada.

La captura del socio está retirada y no migrada a app v3 (`04_USER_JOURNEYS.md:41`). Por ello no existe respaldo para llamar reviews end-to-end completas solo porque el manager ve reseñas demo. F-RV-01 no tiene screen ID (`features.json:921`). La app y flujo de notificación/revisión deben completarse o quedar como pendiente explícito.

### 4.6 Comunidad Gym y Repi Club

Comunidad Gym documentada: novedades/imágenes, descuentos, desafíos con premio a retirar en recepción, catálogo informativo con precios, intentos con video, validación, notificaciones y logro/sticker/nivel permanente (`05_BUSINESS_RULES.md:36`, `15_REPI_CLUB.md:3`). Catálogo no tiene pago/checkout (`16_BILLING_AND_PAYMENTS.md:15`). Videos privados solo validadores; retención 90 días como supuesto (`05_BUSINESS_RULES.md:41`). Regla «video obligatorio» tiene instrucción explícita en DEC-14; pregunta abierta de excepción sin video (`05_BUSINESS_RULES.md:42`) no debe debilitarla por defecto.

Récord aprobado solo sustituye récord si mejora y respeta lowerIsBetter; enviar requiere video, valor >0 y confirmación; rechazado muestra motivo/reintentar (`03_COMPLETE_SCREEN_INVENTORY.md:269`, `22_DEVELOPER_ACCEPTANCE_CRITERIA.md:109`). El nivel `1 + floor(logros/2)` es fórmula de diseño, no regla humana (`05_BUSINESS_RULES.md:39`); el inventario de pantalla omite floor (`03_COMPLETE_SCREEN_INVENTORY.md:298`). Debe reconciliarse, sin convertirlo en criterio confirmado.

Repi Club social amplio es otro alcance: feed de coach/gym/sede/clase, publicaciones voluntarias de logros, reacciones/comentarios, rankings, trofeos 3D, equipos/checkpoints, perfiles, anuncios, moderación. Está especificado sin diseño y concentrado en una sola entrada SCR-N-09 (`15_REPI_CLUB.md:9`, `03_COMPLETE_SCREEN_INVENTORY.md:1138`). KPI «Participación en Repi Club 23%» no demuestra Club implementado (`15_REPI_CLUB.md:7`). No sustituir todo el Club por la pestaña Gym ni activar todas sus expansiones como MVP sin decisión.

### 4.7 Body Intelligence / Mi cuerpo

Opcional, privado por defecto, sin fotos obligatorias, nunca exige ropa interior, entrenamiento no depende de activarlo. Seis consentimientos store de medidas/fotos/scan/composición/lab/IA; guardar distinto de compartir; revocable por tipo y destinatario, auditado (`11_BODY_INTELLIGENCE_DESIGN.md:5`). Métodos manual, fotos cuatro poses, 3D experimental; fuente/método/fecha de medidas; calidad, revisión, reintento, procesamiento honesto y fallback de reconstrucción.

Visor genérico/ajustado aproximado, etiqueta obligatoria del modo, controles táctiles/zoom/vistas/capas, nueve regiones, carga de entrenamiento registrada y fuente de medidas, comparación con aviso de comparabilidad; no porcentaje de grasa/músculo deducido visualmente (`11_BODY_INTELLIGENCE_DESIGN.md:14`). No hay ciencia validada ni garantía de precisión clínica/GPU (`11_BODY_INTELLIGENCE_DESIGN.md:3`). Cámara real, documentos, extracción IA revisada, timeline y morph no están diseñados (`11_BODY_INTELLIGENCE_DESIGN.md:22`).

No convertir la demo visual en escaneo personal. La composición desde DXA/BIA/pliegues necesita fuente/fecha/método y contexto; investigación separada precede la reconstrucción científica. «Nunca mostrar modelo que no se parezca» (`22_DEVELOPER_ACCEPTANCE_CRITERIA.md:22`) es deseo no medible sin protocolo de validación. La captura de salud/nutrición/check-in del alumno falta mientras el coach ve datos demo (`20_GAP_ANALYSIS.md:14`).

### 4.8 IA / automatizaciones

Heurísticas deterministas y alertas (molestia ≥4, actividad, programa, vencimientos) no son LLM. El toggle IA no tiene función detrás (`17_AI_AND_AUTOMATIONS.md:3`). Asistente, redacción de mensajes, sugerencias y extracción de documentos quedan posteriores al núcleo: revisión humana, fuentes, outputs estructurados, límites/costos, feature flag; no diagnóstico ni tratamiento (`17_AI_AND_AUTOMATIONS.md:8`, brief original:233). No inferir envío autónomo de mensajes ni modificación de rutinas.

## 5. Permisos y privacidad: base firme y contradicciones

La base firme es autorización por capacidad + organización + relación + finalidad, validada en servidor, nunca solo por título de rol o filtro frontend (`roles-permissions.json:414`, `10_DOMAIN_DATA_REQUIREMENTS.md:25`, brief original:229). Consentimiento no reemplaza pertenencia/scoping. Admin REPI solo cuentas/facturación, no chats/entrenamiento/salud (`06_ROLE_PERMISSION_MATRIX.md:41`). Managers/dueños nunca chats privados ni notas personales, tampoco para investigar queja; se usan metadatos operativos/reviews y proceso legal separado (`assets/previous-handoff/REPI_Coach_Gym_Handoff_v3.md:91`). Intentos denegados con respuesta clara/auditoría; no vacío silencioso.

| Tema | Fuente A | Fuente B | Riesgo / acción para el master |
|---|---|---|---|
| Gym y datos sensibles | `13_GYM_EXPERIENCE.md:15`: el gym no ve salud/nutrición/cuerpo | `06_ROLE_PERMISSION_MATRIX.md:22`: coordinador y sala tienen Grant para fotos/modelo/medidas/docs/salud | Distinguir gestión (denegada siempre) de profesionales específicos con grant; si la instrucción humana prohíbe todo acceso Gym, reducir matriz. No asumir una excepción aprobada |
| Handoff v3 y Grant | Handoff previo:7 dice gym no ve salvo grant por propósito | `06_ROLE_PERMISSION_MATRIX.md:37` prohíbe dueño/gerente, no a todo staff | La prohibición de gestión es coherente; el texto «Gym no ve» es demasiado absoluto y debe precisarse |
| Historia individual del manager | `06_ROLE_PERMISSION_MATRIX.md:9`: gerente agregados + scoped | `03_COMPLETE_SCREEN_INVENTORY.md:464`: manager sede; `05_BUSINESS_RULES.md:26`: resultados solo sede | Diferenciar ver progreso institucional autorizado de atribuir resultados deportivos a un entrenador. No resolver quitando al manager toda visibilidad requerida |
| Scope de gerencia | Pantalla Performance Center gerente=sede (`03...:464`) | Panel y tareas «Gym scope» (`03...:451`, `03...:503`), matriz reseñas «Gym» (`06...:17`) | Alcance por sede/asignación organizacional no está unificado; requisito de seguridad pendiente |
| Notas institucionales | `06_ROLE_PERMISSION_MATRIX.md:11`: staff «Lee/escribe» sin scope | Handoff previo:63 limita a Scoped/sede | Debe autorizarse por sede/asignación, nunca lectura global por ser entrenador |
| Salud/nutrición | Matriz exige Grant (`06...:27`, `06...:28`) | Consentimiento app tiene solo seis tipos BI (`03...:103`), dominio enum tiene ocho incluyendo salud/nutrición (`10...:6`) | Falta flujo de otorgar/revocar esos dos grants y decidir energía/sueño/RPE/check-in; un candado del coach no lo resuelve |
| Pedir acceso | Aceptación exige enviar solicitud (`22...:32`) | Prototipos declaran solicitudes simuladas (`09_INTERACTIVE_PROTOTYPES.md:25`) | No está listo; diseñar destinatario, alcance, caducidad, estados/revocación |
| Ver app alumno | Prohibición para gym/coach (`05...:46`) | Original constructor pide preview como alumno (brief:142) | Separar preview sintético de programa propio de impersonación/acceso a cuenta real. No restaurar enlace a app ajena |
| Comunidad/publicar | `06...:29`: sala solo lee | Handoff previo:302 permite a staff asignado con community.publish | Definir capabilities si se habilita; no heredarlas automáticamente |
| Moderación | `03...:516`: gerente moderador | `06...:18`: solo Si moderator | No dar moderación por título de gerente cuando el permiso es independiente |

La matriz usa términos humanos («Full», «Scoped», «Si policy») y agrupa leer/crear/editar; no es una política ejecutable completa. Faltan acciones y scopes por recurso, soporte de cambio de sede y revocación/baja activa, políticas de descargas/exports y auditoría, tratamiento de nombres/PII en AccessAuditEvent de gerencia. Son decisiones de implementación a documentar, no permisos nuevos que deban inventarse.

## 6. Pricing y facturación: no existe una definición cerrada

Debe conservarse la separación entre tres circuitos: (1) coach cobra a alumnos, manual al inicio; (2) Coach/Gym pagan SaaS a REPI; (3) gym cobra sus cuotas al socio fuera de REPI (`16_BILLING_AND_PAYMENTS.md:3`, `16_BILLING_AND_PAYMENTS.md:6`, `16_BILLING_AND_PAYMENTS.md:15`). El catálogo informativo tampoco agrega cuarto circuito de pagos.

El requisito humano recuperado es precio por socio con reducción unitaria por volumen para Gym. Los números Coach 700, Gym 450/380/320, mínimo 150.000, BI 60 y 10% anual son ejemplos, no precios aprobados (`18_DECISION_LOG.md:20`). «Sin cargo por entrenador/sede» es propuesta/default documental, no condición comercial primaria demostrada (`assets/previous-handoff/REPI_Coach_Gym_Handoff_v3.md:195`). El motor debe poder modelar lo necesario, sin imponer producción arbitraria (brief original:178).

| Decisión | Fuentes / conflicto | Consecuencia |
|---|---|---|
| Quién es facturable | Original: relación aceptada, habilitada y vigente; inactividad no quita (brief:174). Coach: activo con ≥1 programa (`05_BUSINESS_RULES.md:53`). Gym: activo y ≥1 entrenamiento o simulación cuenta activa (`05...:54`) | Requiere decisión comercial; no cobrar automáticamente por entrenar ni dejar de cobrar una semana inactiva sin decisión |
| Qué mide máximo/promedio | `05...:55`, `18...:19` | Peak/average es agregación temporal de cantidad, no definición de elegibilidad. Handoff mezcla ambas como si fueran alternativas equivalentes |
| Fecha de snapshot | Fin de período/último día (`16_BILLING_AND_PAYMENTS.md:10`, `22...:51`) vs día de cobro configurable 1–28 (`16...:13`, `10_DOMAIN_DATA_REQUIREMENTS.md:32`) | Definir inicio/fin de período, timezone, corte, día de factura, vencimiento y cobro; no confundir esos eventos |
| Tramos | 0–500/501–1500/1501+ con precios descendentes (`16...:10`) | No especifica inequívocamente marginal por bloque frente a tarifa única por total, inclusive 0 y límites; resolver fórmula antes de facturar |
| Mínimo, módulo, descuento | `16...:10` | Orden de operaciones y base del descuento/mínimo no definidos; decidir si BI cuenta opt-ins, grant, uso o contratos y cómo evitar duplicado multi-sede |
| Cambios efectivos | Próximo cobro y log (`16...:13`) | Debe conservarse versión histórica y snapshot inmutable; definir cola de cambios y cancelación, sin alterar facturas anteriores |
| Alta/baja/pausa/prorrateo | Abierto (`05...:57`, brief:174) | Necesita reglas sobre invitación sin aceptar, pausas, archivado, reactivación y mitad de período |
| Fiscal/moneda | es-AR/ARS confirmado (`18...:24`) pero moneda/impuestos/prorrateo aún abiertos (`05...:57`) | ARS de UI no resuelve precisión, impuestos, comprobantes, tipo de cambio o soporte multi-moneda |
| Pagos online | Coach rol F-BL-04 (`02...:51`); pantalla N-14 rol «Coach, socio» (`03...:1205`) | Ambigüedad de pagador/circuito; no reintroducir cuotas gym→socio ni micropagos REPI |

Dinero exacto (centavos/decimal), precios persistentes y versionados, transacciones e idempotencia, facturas históricas inmutables y adaptador de proveedor son requisitos originales (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:172`). No acreditar por redirect; webhook autenticado/dedupe/backend, sin almacenar tarjetas, credenciales solo servidor; sin credenciales usar modo de prueba claramente identificado (brief:176). Mercado Pago aparece como evaluación/integración futura, no proveedor firme ya conectado. No debe implementarse cobro real sin reglas/credenciales/autorización.

Admin editable por cliente: tipo de plan tramos/unidad/fijo, mínimo, descuento, día 1–28, basis, estado, nota, preview e historial (`03_COMPLETE_SCREEN_INVENTORY.md:963`). Planes por defecto son mockup lectura, edición pendiente (`03...:989`, `03...:1281`). Flags/soporte/salud/costos IA/MRR/ARR/churn no están diseñados; «fórmulas definidas» en aceptación expresa una exigencia, no entrega de fórmulas (`22_DEVELOPER_ACCEPTANCE_CRITERIA.md:90`, `20_GAP_ANALYSIS.md:20`).

## 7. Concepto 2, sistema visual y assets

### 7.1 Núcleo que no debe cambiarse

Concepto 2 Friendly Performance, wordmark custom `repi` minúsculo geométrico y punto cian, isotipo r exacta con punto; UI Inter Tight y logo como asset, nunca texto de UI. Paleta #0B0F14, #1A2433, #2D3B4F, #00D1FF, #5DE6D8, #F8FAFC; Coach/Gym/Admin claros con sidebar navy y alumno oscuro (`07_DESIGN_SYSTEM.md:5`, brief original:97). No restaurar SVG rechazados ni redibujar otra identidad (`07...:8`, brief original:14).

Referencia maestra PNG y recortes como máxima autoridad visual. Para pantallas nuevas extender el mismo sistema, no improvisar identidad. No usar screenshots como fondos ni botones superpuestos (`assets/brand-original/MASTER_PROMPT_ANTIGRAVITY_REPI_FIEL.md:120`). La verificación requerida es comparar captura real y referencia al mismo viewport, enumerar diferencias y corregir (`brief:32`). Esta auditoría documental no acredita esa comparación.

El wordmark recortado tiene fondo navy; capas alpha de letras y de isotipo sirven motion; punto con geometría documentada (`07_DESIGN_SYSTEM.md:6`). No existe vector verificado; si se traza, superposición y aprobación de geometría antes del reemplazo (brief:21). Favicon/PWA derivados 16/32/180/192/512 y máscara son tareas pendientes, no entregadas solo por existir un recorte 162×162 (`07...:7`). Tipografías no incluidas; Inter Tight y JetBrains Mono deben obtenerse y cargarse legalmente sin bloqueo; el paquete afirma OFL, sin archivos locales de licencia/font (`README.md:35`, `MANIFEST.json:88`). No hay ilustraciones/modelos 3D ni medios de ejercicios licenciados; visor procedural y placeholders no los reemplazan.

### 7.2 Tokens y componentes

`design-tokens.json` y `design-tokens/design-tokens.json` son idénticos byte a byte. JSON cubre marca/color/tipografía/radios/spacing/elevación/sizes/breakpoints/motion/focus. CSS solo expone colores principales/light/dark/easings/fonts (`design-tokens/tokens.css:1`); no cubre todos los tokens semánticos, radios, espaciados, duraciones o tamaños. No afirmar que hay design system de componentes de producción: viven inline en HTML (`README.md:39`).

Componentes documentados: botones primario/secundario/oscuro/link, segmented/tabs, chips/filtros/toggles/checkbox/radio, inputs/textarea, stepper, KPI, tablas, split view, sidebar, tabbar, sheets/modals/toast, gráficos, series, descanso circular, visor, sticker, candado y placeholders (`07_DESIGN_SYSTEM.md:15`). Radios 6 chip, 10 input, 10–14 botón, 16 card desktop, 14–18 móvil, 24 sheet; CTA móvil 48–56 y mínimo táctil 44; sidebar 248/rail72, contenido máximo1560 y tabbar84 (`design-tokens.json:91`, `design-tokens.json:132`). Deben componerse en una librería real con estados y accesibilidad, no copiar estilos sin semántica.

Discordancias a resolver sin rediseñar:

- Texto blanco sobre cian en brief:26, frente a texto oscuro en tokens/DEC-03 (`18_DECISION_LOG.md:7`). Es una corrección accesible propuesta; mantener el cian de marca, justificar contraste y no atribuir aprobación humana inexistente.
- Tipografía original display40–48/H1 28–32/pesos400–800/caption12–13 (brief:110), tokens display30–40/H1desktop26–28/pesos400–700/caption11–12 (`design-tokens.json:77`). Debe prevalecer la referencia aprobada y legibilidad; no «normalizar» toda UI a valores menores por conveniencia.
- Original evita glow exagerado/sombras pesadas/gradientes decorativos (brief:106). JSON incluye `cta_glow` y excepciones de gradiente (`design-tokens.json:74`, `design-tokens.json:130`); componentes sticker tiene aro conic (`07...:43`). No prueba violación por sí solo, pero requiere revisión visual de intensidad y consistencia, no autodeclarar fidelidad.
- Íconos estilo Lucide 1.8 e Inter Tight se documentan; JetBrains Mono es añadido. Recursos inline no equivalen a fuente de íconos empaquetada/licenciada (`07...:47`).

### 7.3 Responsive y accesibilidad

Breakpoints por ancho de contenedor: ≥1100 completa, 768–1099 rail, <768 drawer. Layouts split/grids reflow, algunas tablas scroll (`14_DESKTOP_EXPERIENCE.md:13`). El handoff previo decía «Targets checked» 375/390/430/768/1024/1280/1440/1920 (`assets/previous-handoff/REPI_Coach_Gym_Handoff_v3.md:30`), mientras el actual admite que no se verificó visualmente todo (`14...:17`). Priorizar la limitación actual; no repetir la afirmación anterior como evidencia.

Foco visible, Esc, roles/labels se afirman aplicados; trap de foco/live regions/WCAG 2.2 completa están pendientes (`07_DESIGN_SYSTEM.md:50`, `20_GAP_ANALYSIS.md:29`). Objetivo original AA en flujos importantes, teclado/lector, safe areas, errors claros, no solo color (brief:245). «≥36 desktop / ≥44 móvil» debe considerar uso táctil del desktop, no usar detección de audiencia para hacer controles pequeños en pantallas táctiles.

## 8. Motion: contrato a conservar y partes sin diseño

31 entradas AN-01..31: 24 rotuladas prototipo (AN-01..03 y AN-06..26), dos conceptos futuros AN-04/05, cinco especificadas AN-27..31. «24 implementadas» es el estado atribuido por la fuente, sin validación de ejecución en esta auditoría. Una entrada agrupa varias animaciones (AN-28 rankings/reacciones/trofeo), por lo que 31 no es conteo de movimientos atómicos (`08_MOTION_DESIGN_SYSTEM.md:310`).

- Intro 1a «El punto» es la seleccionada según log; 1b/1c son alternativas conservadas, no deben imponerse ni confundirse con Concepto 2 de identidad (`18_DECISION_LOG.md:6`). Primera vez2670 ms saltable; regular520 ms; reducida500 ms; termina en encabezado real. Solo boot en Inicio, nunca sesión activa ni volver de otra app, replay desde Perfil (`08...:13`, `08...:354`). **Conflicto cuantitativo:** aceptación exige regular≤500 ms (`22...:9`), tokens y AN-02 dicen520 (`design-tokens.json:175`, `08...:29`). Resolver explícitamente; no declarar que ambos cumplen.
- Firma del punto cian en intro/completado/sticker, sin omnipresencia decorativa (`08...:8`). Transiciones móvil240/320, desktop220 a6px, sheets300–320, modals200 y toggle150; micro y celebraciones no bloquean registrar o navegar.
- Descanso por timestamp real, tick250, anillo informativo; no reloj basado en frames (`08...:112`). Registro check/pulso420/240, entrenamiento1200, PR1750 no debe fabricar récord ni impedir interacción.
- Gráficos fuerza/volumen/constancia y visor con fuentes, etiqueta de modo, fallback WebGL, reducido sin dolly/rotación y damping1 (`08...:145`, `08...:178`). Procesamiento no debe animar un progreso falso de servicio inexistente.
- Reduced-motion general usa fades o nada; varios registros individuales tienen «—», por lo que hace falta confirmar comportamiento específico en cada interacción. Damping1 y temporizador informativo son excepciones documentadas a apagar todo (`08...:7`, `08...:119`).
- KPI count-up, FLIP/reacciones/trofeo, pagos procesando/confirmado/fallido, mensajería audio/typing, sonido/háptica son especificados sin diseño (`08...:299`). «Audio/typing» en un catálogo de motion no crea por sí mismo requisito de implementar mensajes de voz. Háptica/sonido opcionales y no implementados (`08...:10`).

Tecnología prototipo WAAPI/CSS/three.js; propuesta producción CSS/Motion/WAAPI/three/R3F, Rive/Lottie opcional (`08...:9`). No convertir el listado en obligación de instalar todas esas librerías ni migrar de stack por una animación.

## 9. Backlog y aceptación: qué falta concretar

El roadmap se presenta correctamente como propuesto, pero frase «solo MVP del brief original confirmado» (`21_PRODUCT_ROADMAP.md:3`) puede inducir a dos errores. Primero, el brief original tiene alcance por fases y no una lista taxativa de22features. Segundo, el handoff previo incluía Gym operación/Performance/reseñas/auditoría/companion en MVP (`assets/previous-handoff/REPI_Coach_Gym_Handoff_v3.md:253`), mientras el nuevo los pone V1 y multi-sede V2; no aparece una aprobación humana de esa repriorización. Chat pasó de MVP del handoff previo a V1; Admin editable añadido se marca MVP y F-CO-05 se marca added/MVP. No es una contradicción técnica: es planificación sin validación. No debe reducir el alcance final que pidió el usuario.

Las 93 filas de `implementation-backlog.json` reproducen features; dependencias son texto (`—`, IDs, «Legal», «three.js», «Investigación científica»), no grafo ejecutable; mayoría sin dependencias aunque necesitan identidad/relaciones/auth/datos. No hay tareas detalladas, estimaciones basadas en implementación, responsables, evidencias ni resultados. El backlog tiene que descomponerse y preservar orden de negocio.

Criterios insuficientes: 33«—»; F-PR-02 «simulado en prototipo» (`22...:29`), F-CO-07 «captura no diseñada» (`22...:43`), F-RV-01 y F-MO-02 «retirado» (`22...:68`, `22...:84`) son estados del diseño, no pruebas de aceptación. «Fórmulas definidas» sin fórmulas ni ejemplo no verifica finanzas. «No diagnosticar» es un límite, no criterio completo de un módulo de salud.

Los E2E se deben conservar como requisito verificable, no como ya ejecutados: diez del brief y doce entradas del handoff (`22_DEVELOPER_ACCEPTANCE_CRITERIA.md:102`). Incluyen registro/verificación/invitación/asignación, sesión→progreso real, versiones inmutables, IDOR cross-tenant, offline con recarga/syncexacta, snapshot/importes/webhook idempotente, registrar/anular pago manual con auditoría, responsive/teclado/lectores, recuperación/revocación auth, chat válido. Nuevos: gate turno, traspaso aceptación, métricas sin score/baja muestra, privacidad y audit, review elegible/moderación, récord video→decisión→notificación/logro, catálogo sin pago, grants/revocación, admin cambio efectivo y nombres de día/copias.

Definition of Done válida y exigente: diseño + acción real + persistencia + permisos + validaciones + errores + móvil + tests + documentación (`22...:3`, brief:268). «Completo para MVP», «entrenador completo», «gerente completo» de `14_DESKTOP_EXPERIENCE.md:5` son cobertura declarada de UI/prototipo, y además contradicen pendientes dentro del mismo paquete (auth, CSV real, review app, mensajería Gym, relación dual, privacy/grants). Nunca copiarlas a IMPLEMENTATION_STATUS como funcionalidades finalizadas.

## 10. Conflictos históricos que no deben reaparecer

- Cuotas/membresías/ingresos gym→socio e integrated billing fueron retirados por corrección v3. Siguen en rutas del handoff previo:49–50, billing:199–201, flujo Owner:242 y fases:269. La cabecera v3 los supera; las rutas antiguas deben excluirse, no «completarse».
- Persona móvil de socio dentro del desktop Gym y enlaces «App del alumno» se retiraron (`19_NEW_FEATURES_AND_CHANGES.md:77`). Restaurar funcionalidades de reseña/relación dual dentro de la app autorizada, no reintroducir el control de otras cuentas desde escritorio.
- Handoff previo dice detalle Coach «five tabs» (:225), actual ocho (`12_COACH_EXPERIENCE.md:6`). Actualizar contrato con ocho, sin perder funciones originales como calendario/biblioteca/CRUD por no estar en tabs.
- Handoff previo dice todos los objetivos responsive comprobados (:30); actual dice no verificados (`14...:17`). Conservar estado no verificado.
- Legacy «Núcleo», fechas oct/nov y n10 no son nueva marca/seed/política; actual «Gym Norte», mayo2026 también es demo fechada (`20_GAP_ANALYSIS.md:22`, `20...:25`). No convertir ninguno en datos actuales reales.
- Texto blanco sobre cian es divergencia a tratar con accesibilidad, no razón para cambiar Concepto2 ni aceptar otra paleta.
- «Sin ropa interior» en criterios (`22...:21`) debe interpretarse fielmente a «no requiere ropa interior» / «sin fotos obligatorias» (`05...:47`, `11...:6`), no imponer una prohibición arbitraria de toda foto del usuario.

## 11. Prioridades para el master prompt definitivo

### P0 — Fidelidad y reglas que deben quedar explícitas antes de construir cobros/permisos

1. Fijar jerarquía: instrucciones humanas vigentes, imagen Concepto2, correcciones funcionales, requisitos originales válidos, propuestas y legacy. Etiquetar origen y nivel de certeza por decisión.
2. Consolidar un producto con roles/modos Coach y Gym; escritorio de piso, remoto y gestión; app del alumno con relaciones independientes. Definir el flujo faltante remoto/Gym y selector de alumno sin inventar permisos ni nueva app.
3. Preservar seguimiento/efectividad/progreso/reviews de managers y prohibición absoluta de chats privados. Separar resultados institucionales autorizados de atribución individual del entrenador y de datos sensibles.
4. Cerrar contrato de facturación: elegibilidad por socio/alumno, volumen unitario Gym, tramos marginales vs tarifa total, corte/cobro/período, snapshot, altas/bajas/pausas, mínimo/módulos/descuentos, cambios efectivos. Mantener importes solo DEMO hasta decisión, nunca inferir «máximo» aprobado de «total».
5. Conservar loop funcional persistido coach→programa→alumno→sesión→progreso y permisos/server/offline. No llamar hecho a prototipo, candado, toast ni «Guardado».
6. Convertir las contradicciones de grants Gym y scopes de gerente en decisiones de política explícitas; mantener default mínimo y no ampliar chats/sensibles por rol.

### P1 — Completar diseño e implementación necesaria para alcance solicitado

7. Auth/onboarding/invitaciones y ciclo de vida cliente/socio; biblioteca/constructor/versionado; errores/empty/loading/sync/conflicto; rollback/anulación de pago manual; PWA instalable y continuidad de sesión.
8. Reseña del socio en app v3, relación gym+coach, captura de salud/nutrición/check-in/grants si esos dashboards se incluyen; operación Gym y managers con datos reales y fórmulas documentadas. No declarar n5 definitivo hasta resolver n5/n10.
9. Admin/configuración de pricing con fórmulas y estados verificables; pruebas de corte/snapshot/idempotencia; separar pago coach y SaaS.
10. Componentes/tokens reutilizables y fidelidad real a PNG; contraste sin cambiar marca; responsive375–1920, teclado/lector/focus/live/reduced-motion, capturas comparativas reales.
11. Comunidad Gym, desafío/video/validación/notificación/logro con almacenamiento privado; políticas de retención explícitas; pruebas end-to-end. No confundir pestaña Gym con todo RepiClub.

### P2 — Expansiones que requieren decisión o investigación, sin borrarlas del producto

12. RepiClub social/feed/reacciones/rankings/trofeos/moderación, coordinador/recepción propios, clases, perfiles públicos, checkout/pasarela y promociones completas: especificar backlog y aceptación sin fingir diseño existente ni ponerlos todos en MVP por defecto.
13. BodyIntelligence científico/reconstrucción/composición/documentos y asistente IA: investigación/validación separada y revisión humana; no convertir demo geométrica en medida corporal ni LLM en diagnóstico.
14. Métricas SaaS/adminoperativo, sonido/háptica, motion de Club/pagos/mensajes: preservar propuestas y requisitos originales relevantes, diseñarlos cuando corresponda y medirlos sin valores ficticios.

## 12. Criterio de salida del futuro trabajo

El master definitivo debe contener una matriz requisito→fuente→certeza→pantalla/acción/dato/permiso→estado demostrado→pendiente→prueba. Incluir las 93 entradas como punto de partida y expandir solo requisitos realmente sustentados que el inventario agrupó u omitió; no tratar «93» como techo ni promesa exacta de módulos. La aprobación de negocio no se sustituye con la capacidad de una IA para elegir una fórmula. Ante falta de respuesta, conservar configurabilidad y demo explícita sin activar la consecuencia comercial no decidida.

La comparación visual y la auditoría del código/prototipos se entregan por otra parte del trabajo. Este informe solo acredita lectura y coherencia documental, sus conteos recalculados y los huecos/contradicciones expuestos; no afirma que una interacción, permiso o cobro funcione.
