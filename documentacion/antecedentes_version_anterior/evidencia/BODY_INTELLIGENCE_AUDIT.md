# Auditoría de Body Intelligence y reconciliación con el handoff REPI

Fecha de revisión: 2026-10-25. Alcance: revisión documental, extracción completa del PDF (48 páginas), inspección visual de páginas seleccionadas y verificación acotada con fuentes primarias web. No se ejecutó un modelo, no se validó científicamente ningún algoritmo ni se midió rendimiento de hardware. No se modificaron las fuentes.

## 1. Fuentes, evidencia y límites

Raíz de fuentes: `/Users/manuelcosovschi/Documents/ChatGPT/Proyectos/REPI_Auditoria_2026-10-25/fuentes/`.

- PDF: `Investigacion_Tecnica_REPI_Body_Intelligence.pdf`, 48 páginas. Las referencias `PDF p.N` de este informe indican la página física del archivo, contada desde 1.
- Handoff: `REPI_COMPLETE_DESIGN_HANDOFF/`. Los localizadores `archivo.md:L` son líneas verificadas del archivo en esta carpeta.
- Extracción literal: `evidencia/BODY_INTELLIGENCE_PDF_EXTRACT.txt`, con marcador de cada página. Versión con espacios normalizados para búsqueda: `evidencia/BODY_INTELLIGENCE_PDF_COMPACT.txt`.
- Inspección visual: `evidencia/body_pdf_renders/p29.png`, `p37.png`, `p42.png`. La página 29 tiene columnas rotas por fórmulas y marcadores `[span_...]` impresos; la 37 contiene los defaults TRUE y marcadores impresos dentro del SQL; la 42 confirma visualmente el objetivo de optimización incompleto. Estos defectos están en el PDF, no son sólo errores de extracción.
- La revisión web es puntual al 25/10/2026; no certifica licenciamiento de cada archivo descargable ni sustituye revisión legal. No se descargaron pesos ni datos biométricos.

## 2. Conclusión para el futuro prompt de implementación

El PDF es una propuesta de investigación/arquitectura con fragmentos ilustrativos. No debe tener autoridad para sustituir decisiones de producto confirmadas ni importarse como código listo para producción. Conservar el principio común de separar representación visual, medición registrada e inferencia. Mantener el avatar genérico/ajustado rotulado como aproximado y la composición sin datos hasta que exista fuente externa verificable. No convertir la investigación en afirmaciones clínicas, plazos de once semanas, costos garantizados o aprobación del estudio N=60.

Bloqueos concretos: consentimiento que comparte por defecto en SQL, ausencia de políticas RLS reales, fitter que no utiliza perímetros, falsa promesa de anonimización, omisión de alcance por organización/relación, nomenclatura y conteo de regiones inconsistentes, extracción médica no diseñada y precios/benchmarks no confirmados. La captura real, reconstrucción y laboratorio requieren fases y criterios separados.

## 3. Matriz de reconciliación: confirmado vs propuesta

| Tema | Handoff y estado | PDF y discrepancia | Tratamiento recomendado en el prompt |
|---|---|---|---|
| Honestidad del avatar | `11_BODY_INTELLIGENCE_DESIGN.md:3,14,20`; DEC-05 en `18_DECISION_LOG.md:9` mantiene referencia genérica, aproximado y personal futuro; investigación pendiente | PDF pp.1,22,25,34,47 llama exacto/validado al paramétrico y afirma validez inmediata | Handoff manda en UX; reemplazar exacto/validado por ajuste aproximado; exigir evidencia de ajuste antes de habilitarlo |
| Consentimiento | `11:6-8,16-17`; `18:10`; `22_DEVELOPER_ACCEPTANCE_CRITERIA.md:18-19,111`: 6 tipos OFF; guardar ≠ compartir; revocación inmediata | PDF p.37 comparte malla, antropometría y composición por DEFAULT TRUE; un booleano general para procesar salud | Corregir propuesta; todos los permisos OFF; separar almacenamiento, IA y compartir por tipo/destinatario/propósito/relación |
| Relación dual gym + coach | `10_DOMAIN_DATA_REQUIREMENTS.md:6,25-30`; `06_ROLE_PERMISSION_MATRIX.md:36-45` | PDF pp.37-40 sólo student_id y trainer_id, sin organización ni MemberRelationship | Definir autorización contextual; un grant privado no autoriza al mismo entrenador desde su rol de gym |
| Regiones del cuerpo | `11:14` fija 9 regiones visibles | PDF p.10 promete 28 regiones bilaterales/14 pares pero enumera 16 grupos (si todos fueran pares serían 32); pp.25-47 repiten 28 | Conservar 9 en UI hasta aprobar catálogo canónico, lateralidad y mapeos de 9 a regiones internas |
| Colores y significado | `11:14`: color = exposición/carga registrada; aviso explícito, no músculo real | PDF pp.1,3,10,33-35 agrega fatiga, series efectivas, fuerza regional y coeficientes | Ninguna carga registrada prueba adaptación/hipertrofia/EMG/fatiga; documentar fórmulas como indicadores operativos versionados |
| Fotos | `11:6,10-13`: opcionales; 4 poses; calidad simulada; en fallo fotos guardadas igual | PDF pp.4,25,28 permite 2/4 vistas, borra rostro, fotos crudas opcionales/efímeras | Decidir 4 poses de seguimiento vs 2/4 del experimento; almacenamiento separado de procesamiento; fallo no debe guardar fotos sin permiso específico |
| Métodos manuales | `11:9`: peso, brazo derecho, cintura y pecho | PDF p.28 A2 requiere cintura/tórax/cadera; p.25 agrega altura y muchos morph targets | Definir mínimo real; no inventar cadera/altura ni deducirlas del avatar. Fuente/fecha/unidad/metodología obligatorias |
| Composición | `11:14`: insuficiente salvo DXA/BIA/pliegues | PDF pp.11-12,34 exige método/dispositivo/ecuación, recomienda curvas separadas | Adoptar procedencia y comparabilidad; no pintar 28 músculos con un informe de 5 segmentos ni afirmar músculo real por región |
| Importación de informes | `11:22-23`; `20_GAP_ANALYSIS.md:11`; `21_PRODUCT_ROADMAP.md:108`; `22:27`: especificado, no diseñado, legal pendiente | PDF pp.12-14,34,45-47 prescribe laboratorio FHIR/LOINC/UCUM listo para producir | Diseñar carga, revisión, corrección, rechazo y trazabilidad antes; aún con revisión humana no declarar validación clínica |
| Reconstrucción | `11:3,13,20,23`; `21:116`: parcial/experimental | PDF pp.25,46 selecciona SAM + solver; pp.27-30 sólo propone validación | Aislar por flag; no prometer reconstrucción disponible ni estimaciones numéricas hasta criterios definidos y medidos |
| Stack | `10:3` declara que no existe esquema final; Claude Code define representación | PDF pp.36-46 impone monorepo apps/web, apps/api, FastAPI, PostgreSQL, R3F, Modal | Inspeccionar repositorio real antes de decidir; rutas no son evidencia de código existente; arquitectura propuesta no obliga a migrar |
| Comercial | `18:20-21` precios/facturable hipótesis; BI ARS60 ilustrativo | PDF pp.31-33 usa ARS700 como base y recomienda BI Pro +ARS1500-2500 | No sobrescribir decisiones comerciales. Todos los costos/planes de BI quedan supuestos separados |

## 4. Hallazgos críticos de privacidad y datos

### BI-P0-01. El SQL contradice el consentimiento confirmado

PDF p.37 incluye `share_3d_mesh_with_trainer`, `share_anthropometry_with_trainer` y `share_body_composition_with_trainer` con `DEFAULT TRUE`. No es una lectura ambigua: se ve también en el render. Contradice `11:7`, `18:10`, `22:18`. Un permiso general `accepted_sensitive_health_processing` no representa seis tipos separados ni un permiso específico de IA, y la tabla sólo tiene una fecha de revocación para todo el conjunto.

Instrucción requerida: ningún dato sensible se almacena/procesa/comparte por omisión; resolver primero el esquema de grants, incluyendo consentimiento versionado, finalidad, responsable, destinatario, organización, relación y eventos de concesión/revocación. Revocar debe cortar solicitudes nuevas, tareas en cola, enlaces todavía utilizables según mecanismo elegido y acceso desde cachés controladas; no prometer recuperar copias ya exportadas.

### BI-P0-02. RLS anunciado, políticas ausentes

El título de pp.36-37 promete PostgreSQL con RLS, pero pp.37-40 sólo crean extensión, tipos, tablas e índices. No contienen `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, restricciones de rol, permisos ni autenticación. Los logs tampoco registran `allowed|denied`, aunque `10:6` requiere ese resultado, y no hay mecanismo que los vuelva inmutables. No se puede concluir que sólo un 403 con flag falso cubre acceso cruzado a organizaciones o bypass del almacenamiento.

Añadir diseño y prueba de matriz: propietario de datos; coach con y sin grant; mismo usuario en dos espacios; recepcionista/dueño/gerente/admin sin acceso sensible; sustitución de IDs; objetos privados; revisión/exportación; acceso denegado y permitido auditado. Los tests son criterios de entrega futuros, no ya ejecutados.

### BI-P0-03. Difuminar cara no es anonimizar el cuerpo

PDF pp.15,22,24,40-41,46 equipara blur local con anonimización. El código retorna sin error si faltan nariz/orejas y el esquema p.38 guarda `face_anonymized_in_client DEFAULT TRUE`: se puede afirmar protección sin haberla aplicado. No comprueba visibilidad/presencia de landmarks, puede fallar en perfil/espalda, y no trata EXIF, tatuajes, entorno, nombres del documento ni correlación con student_id. El blur de 24px no prueba irreversibilidad ni desvinculación.

Requerir procesamiento local que falle cerrado si se promete ocultar rostro; permitir repetir, recortar o elegir sin fotos; registrar estado comprobado en vez de booleano optimista. Denominarlo "ocultamiento de rostro" y seguir tratando foto/malla como dato personal. La Ley 25.326 define disociación por imposibilidad de asociar a persona determinada/determinable; una foto vinculada a cuenta no satisface esa definición por llevar blur [texto oficial, arts.2,4](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto).

### BI-P1-04. Retención, proveedor y consentimiento no son garantías legales

PDF pp.14-16 presenta medidas elegidas (TLS1.3, AES256-GCM, URLs60s, ZDR) como si completaran cumplimiento; no prueba configuración, contrato o retención de ningún proveedor. El art.7 establece condiciones especiales para datos sensibles y el art.8 regula salud; no basta trasladar el art.5 a un toggle universal. Revisión jurídica debe definir base y roles de REPI/coach/gym, contenido médico, edades, transferencias, plazos y derechos. No declarar conforme a ley antes de esa revisión [Ley oficial](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto).

Retención por tipo y finalidad: originales, fotos de progreso elegidas, mallas, derivados, temporales, backups, colas, PDFs, auditoría y exportaciones. Diferenciar revocar compartir, revocar IA, borrar foto, borrar evaluación y borrar cuenta. Un hard-delete SQL por CASCADE no prueba borrado de objetos o backups. `11:13` (fotos guardadas si falla) exige permiso de almacenamiento vigente independiente del trabajo GPU.

## 5. Hallazgos de falsa precisión, código e inferencia

### BI-P0-05. El fitter ilustrativo no ajusta antropometría

PDF pp.41-43 declara `fit_to_anthropometry(... girths_cm ...)` pero nunca usa `girths_cm`. Su pérdida sólo penaliza `(muscle_param-0.5)^2` y `(weight_param-weight_norm)^2`; los parámetros arrancan justamente en esos centros, por lo que ya están en el mínimo. Calcula vértices y `scale_factor`, pero descarta la malla escalada en `_`; devuelve fenotipos, altura y peso. No hay intersección de perímetros, error contra cinta, jacobiano útil para medidas, convergencia de residuo ni exportación.

Por tanto no respalda p.25 (residuo <0.2cm, CPU<150ms), pp.22/34 (exactitud) ni la fase 1 p.45. No copiar como motor funcional. Diseñar un adaptador y un experimento de ajuste con puntos anatómicos y medidas explícitas; reportar residuo de ajuste separado del error real de medición. El dato manual puede contener error y coincidir con él no hace verdadera la malla.

### BI-P1-06. Género, sexo y edad están confundidos

PDF p.41 usa `gender_val = 0.0 if sex.upper() == "M" else 1.0`: todo valor distinto de M, incluido ausente/desconocido, queda en el otro extremo binario. No se debe inferir sexo/género desde imagen ni usar género de perfil como variable biométrica automáticamente. El control visual del modelo debe permitir elección/omisión sin declarar que determina fisiología.

La edad se transforma con `(age_years-18)/70` y se recorta a [0.2,0.9], sin justificación en el documento sobre cómo corresponde a semántica real de Anny. La estatura se recorta a 140-205 en el fitter, aunque SQL acepta 100-250. SQL exige peso25-300 y altura100-250 incluso para un avatar genérico, sin estado "dato no informado" ni accesibilidad para cuerpos fuera del rango.

N=60 p.28 sólo contempla adultos18-55 y 30 mujeres/30 hombres. No valida menores, mayores55, embarazo, prótesis, movilidad limitada ni cuerpos fuera de la muestra. El soporte de Anny para infantes no valida capturas de menores en REPI. Resolver alcance etario, consentimiento/representación y alternativas; como propuesta conservadora de rollout, mantener inferencia experimental adulta hasta un diseño específico, sin inventar prohibición legal universal para menores.

### BI-P1-07. Taxonomía anatómica y métricas no cierran

PDF p.10 dice 14 pares/28 regiones pero lista 16 grupos, y cada grupo incluye músculos con distintas funciones. Handoff `11:14` tiene 9 regiones. Las métricas de SetLog son cálculos, no mediciones de tejido ni índices fisiológicos validados. Los coeficientes1/0.5/0.25, RIR≤4, φ=0.75 para RIR4 y frecuencia≥1.5 series son convenciones propuestas. El propio texto define trabajo por carga≥60%1RM O RIR≤4, pero la fórmula incluye sólo RIR≤4. Falta política para RIR ausente, calentamiento, unilateralidad, peso corporal/asistencia, isométricos, rangos y versiones históricas.

Definir catálogo con IDs estables y fuentes editables; evitar contar un sinergista como diagnóstico de déficit; mantener colores como exposición registrada. No afirmar que una tendencia de carga determina hipertrofia o fatiga. El 1RM estimado debe etiquetarse por ejercicio/fórmula/rango y no mezclarse como fuerza medida universal.

### BI-P1-08. El visor ilustrativo no cumple la arquitectura prometida

PDF pp.43-45 define `regionalMetrics` y `comparisonGlbUrl` pero no los usa. Cambia el color de toda la malla si hay cualquier selección; no pinta región con shader ni heatmap. `face.a` supone que el ID del primer vértice representa toda la cara, algo que exige construir límites sin IDs ambiguos. Supone nodo `BodyMesh` y atributo `aRegionId` sin validar cargador/exportador. El código no implementa fallback2D, pérdida de contexto, comparación, paneles, aviso de modo, accesibilidad ni reduced-motion; tampoco prueba presupuestos de p.30-31. Los zoom1.4-3.8 del snippet difieren de2.2-5.5 del handoff `11:14`.

Anny/MHR/SOMA son familias y LODs diferentes: topología fija dentro de una configuración no equivale a índices compatibles entre familias/LOD/versiones. Prohibir morph/deltas directos si no coinciden topología, orden de vértices, pose, escala y convención espacial; migración/registro deben estar versionados. Comparaciones de geometría sintética no prueban cambios reales del cuerpo.

### BI-P1-09. Estadística propuesta no valida la implementación

PDF p.28 dice expresamente que el estudio no fue ejecutado; pp.33-34 y47 usan validado/listo/validez inmediata. Esas etiquetas son prematuras. Los números de estudios ajenos y benchmarks de pose MPJPE no validan perímetros REPI ni composición, ni un solver multivista no construido. N=60 es diseño candidato; no tiene justificación de potencia o precisión por subgrupo. Con2 sexos×3 IMC×3 grupos de fototipo, hay18 combinaciones y muy pocos sujetos por celda si se cruzan todas. Las múltiples fotos/teléfonos del mismo sujeto no son participantes independientes.

La página29 tiene fórmulas rotas y umbrales desplazados a columnas de rechazo (MAE/MAPE/Bland-Altman); visualmente no es una tabla normativa fiable. Recuperar intención con autor/estadístico, no automatizar esa tabla. No interpretar p>0.05 como prueba de ausencia de sesgo o equivalencia.

PDF p.8 define MDC95 como umbral de cambio y luego pp.35/47 lo presenta como ±incertidumbre de una medición. De la propia definición se infiere que no es automáticamente un intervalo de predicción individual. Además, superar MDC de perímetro no identifica causa (músculo, grasa, hidratación, postura). No usar "hipertrofia/reducción adiposa confirmada95%" por ese solo criterio.

Números de RMSE/CCC/Cybermetron/embarazo pp.2-9 y muestras ajenas quedan como afirmaciones del PDF no revalidadas en esta auditoría; no trasladarlos a marketing ni umbrales clínicos. Las referencias47-48 mezclan primarias con ResearchGate, Kaggle, blogs, Scribd, registros agregadores, HN y artefactos `[span]`; no constituyen por sí mismas trazabilidad suficiente de cada cifra.

## 6. Laboratorio y composición: próximos contratos necesarios

PDF pp.11-14 y38-39 aporta una idea útil: conservar método, fabricante/modelo, ecuación, original y unidad; separar grupos de comparabilidad; revisión humana antes de graficar. Sin embargo, el esquema no demuestra conformidad FHIR por tener `fhir_bundle_json`. Falta perfil/versión, validación de recursos, identificadores, provenance, muestra, fecha efectiva y reglas para resultados corregidos.

`canonical_value NOT NULL NUMERIC` p.39 no representa resultados cualitativos, `<`, `>`, no detectable, muestra insuficiente o valores ausentes. No imponer valor numérico inventado. Los rangos deben conservar texto exacto, unidad y condiciones del informe; confirmar un rango humano no lo vuelve aplicable a todos los datos. LOINC no se elige sólo por el nombre del analito: método, sistema, propiedad y componente importan. Ejemplo primario comprobado: [13457-7](https://loinc.org/13457-7) es LDL por cálculo; no intercambiarlo a ciegas con otros códigos LDL. [1989-3](https://loinc.org/1989-3) es25-hidroxivitaminaD3, no un comodín para cualquier vitaminaD total. No se revalidaron los15 códigos/factores del PDF. El intento de lectura primaria de2089-1 no respondió; no se usa para afirmar equivalencia.

El factor g/L→mg/dL es una conversión de unidad; otros factores entre molaridad/masa o HbA1c no deben llamarse "exactitud clínica100%" sin analizar definición, componente, método, redondeo y condiciones. La aceptación100% puede aplicar a casos especificados de una suite aritmética, no a extracción/interpretación médica universal. Diseñar revisión lado a lado con página/zona, texto original, valor propuesto, corrección con autor/fecha, rechazo y reextracción. No diagnosticar ni sugerir tratamientos; no habilitar documentos para coach sin grant médico específico y base aplicable.

La documentación externa no justifica convertir grasa/masa magra de5 macrosegmentos DXA/BIA en tejido de28 músculos. Conservar nivel de resolución del informe y aclarar las estimaciones del equipo; un informe externo tampoco implica valor absoluto infalible.

## 7. Verificación técnica primaria acotada al 25/10/2026

| Componente | Evidencia primaria consultada | Qué se puede sostener / límite |
|---|---|---|
| NAVER Anny | [README oficial, License](https://github.com/naver/anny#license) | Código Apache2.0; assets MakeHuman/FaceUnits CC0; topología soma Apache2.0; smplx no comercial. Corrige "pila100%Apache" del PDF. Fijar versión y archivos/avisos reales; esta revisión no certifica todo el árbol de dependencias |
| Meta MHR | [README oficial](https://github.com/facebookresearch/MHR#license) | Declara Apache2.0, PyTorch CPU/GPU y7 LODs. No demuestra latencias prometidas ni auditoría de assets.zip; verificar paquete exacto antes de integrar |
| NVIDIA SOMA-X | [README oficial](https://github.com/NVlabs/SOMA-X#license) | Declara Apache2.0 y modelos opcionales con licencias propias; unifica representaciones. No vuelve libres todos sus backends ni valida músculo/antropometría |
| SAM3D Body | [Repositorio oficial](https://github.com/facebookresearch/sam-3d-body), [licencia oficial](https://github.com/facebookresearch/sam-3d-body/blob/main/LICENSE) | Existe inferencia de imagen única, prompts de keypoints/máscaras y acceso solicitado a checkpoints. SAM License concede uso/modificación/distribución, con condiciones y cambio de términos; no es Apache ni garantía. Integración multivista propuesta sigue siendo trabajo REPI |
| SMPL-X | [LICENSE del repositorio oficial](https://raw.githubusercontent.com/vchoutas/smplx/main/LICENSE) | Licencia publicada limita uso a investigación/educación/arte no comercial. No usarla en SaaS sin permiso comercial separado. No prueba que el precio comercial sea "prohibitivo": no se obtuvo cotización |
| MediaPipe Web | [Google guía Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js) | Devuelve33 landmarks y segmentación opcional; detect/detectForVideo son síncronos y Google recomienda WebWorkers para no bloquear UI. No promete30FPS ni valida puertas120/0.85/poses del PDF; probar navegadores y dispositivos reales |
| Modal | [Precios oficiales](https://modal.com/pricing) | Consulta muestra L4 USD0.000222/s, CPU0.0000131/core/s y memoria0.00000222/GiB/s; precio GPU del PDF0.00019/s ya no coincide. Faltan configuración, región, arranque, CPU/RAM, reintentos y tiempos reales |
| Cloudflare R2 | [Precios oficiales](https://developers.cloudflare.com/r2/pricing/) | Standard USD0.015/GB-mes y egress a Internet gratuito; operaciones A/B facturables según uso. No significa costo total de red/cómputo/operación cero |

No se exige TFLite/LiteRT, ONNX ni SDK comercial: el PDF propone PyTorch + MediaPipe Web. No se verificó que los modelos completos exporten a ONNX/TFLite ni que corran localmente en móvil; exigir prueba de exportación, operadores, memoria, salida equivalente y licencia antes de prometerlo. No introducir otro SDK por conveniencia sin identificarlo, términos, datos enviados y costo. Tampoco queda probado que toda ejecución de cualquier componente en navegador sea imposible: el pipeline pesado concreto debe medirse, y el visor/validación local son problemas diferentes.

## 8. Costos, alcance y rollback

PDF pp.31-33 modela escenarios con precios/tiempos y tasas de uso; no son facturas medidas. No se validó tipo de cambio ARS/USD ni precio de LLM de pp.31-33, modelo/tokens o porcentaje80% PDFs nativos de p.12. Separar costoGPU,CPU,RAM,operaciones,almacenamiento acumulado,egress de otros servicios,observabilidad,backups,soporte,validación científica y personal. "CeroGPU" no es costo operativo cero ni margen90% demostrado. Mantener presupuestos configurables y cuotas medibles sin adoptar precios de venta del PDF.

Rollback ausente en el material: el proveedor intercambiable de p.22 no es un plan de reversión. Exigir flags independientes para visor, ajuste, cámara, inferencia, extracción y recomendaciones; desactivar una inferencia fallida conserva registro manual y entrenamiento; volver a avatar genérico sin borrar mediciones/fotos elegidas; cancelar colas y reintentos tras revocación; versionar proveedor/pesos/licencia/código/topología/fórmula/calibración. No recalcular o sobreescribir históricos silenciosamente al actualizar modelos. Conservar original y marcar resultado retirado/no comparable; definir propagación a reportes/exportaciones. Migraciones de datos incrementales, reversibles y probadas; eliminación por privacidad no se revierte restaurando backups sin aplicar tombstones.

## 9. Decisiones que el prompt debe resolver o dejar explícitamente pendientes

1. Jerarquía: handoff actual y decisiones humanas confirmadas prevalecen; investigación como hipótesis. DEC-05 "no objetado" no equivale a certificación científica.
2. Alcance inicial:9 regiones, genérico rotulado, medidas y fotos opcionales; importar informes/cámara/paramétrico/multivista en flags y fases separadas. No asumir que prototipo = producción.
3. Modelo de permisos: tipos y acciones, relación/destinatario/propósito/versionado; nada por defecto; efecto y límites de revocación; privacidad de objetos y cachés.
4. Política de edades/cuerpos: población soportada, dato opcional, género visual separado de variables clínicas; no clasificar imágenes; alternativa accesible sin pose obligatoria.
5. Anny vs MHR vs SOMA: escoger un proveedor/topología/LOD inicial tras prueba y auditoría de archivos; no integrar tres motores simultáneos por aparecer en PDF.
6. Captura:4 poses del diseño o experimento2/4; ropa deportiva sin exigir ropa interior; rostro, fondos, metadatos, retención y controles de calidad configurables medidos, sin instrucciones fisiológicas coercitivas.
7. Mediciones: procedencia, unidades, fecha, evaluador, errores, estados y comparabilidad; representar ausente/desconocido sin cero ficticio; límites de validación no excluyen cuerpos silenciosamente.
8. Regiones/indicadores: catálogo de9 visible; conteo interno correcto; lateralidad y reglas/RIR faltante definidas/versionadas; colores de exposición sin anatomía fisiológica inventada.
9. Laboratorio: UX nueva, reglas de extracción con trazabilidad y revisión; códigos y factores verificados uno a uno; FHIR sólo si se decide interoperabilidad y perfil real.
10. Validación: protocolo preregistrado/revisado por especialista, muestra adecuada, evaluación independiente y subgrupos; objetivos de ingeniería separados de evidencia clínica; no publicar "validado" sólo por superar tabla defectuosa.
11. Operación: presupuestos y métricas reales,p95/end-to-end,dispositivos,navegadores,fallos; filas auditables de costo; licencias archivadas por versión; rollback ensayado.
12. Decisiones legales/comerciales: responsables/proveedores/retención/menores/transferencias por revisar; precios/planes no confirmados; no bloquear entrenamiento por rechazar BI.

## 10. Verificación de esta auditoría

Se revisaron las48 páginas en texto y se visualizaron páginas29,37,42 a1600px. Los cuatro documentos de handoff solicitados se leyeron completos con números de línea; también se contrastaron permisos, reglas, IA, roadmap y criterios de aceptación. No se ejecutó SQL,PyTorch,el prototipo ni un estudio de precisión. Los problemas de snippets se deducen de lectura estática explícita. No se editaron ni publicaron productos externos.
