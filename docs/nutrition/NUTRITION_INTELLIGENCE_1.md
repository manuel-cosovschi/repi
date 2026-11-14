# REPI Nutrition Intelligence 1.0 (D221)

Máster del titular «SUPER MASTER PROMPT — REPI NUTRITION INTELLIGENCE 1.0» (14/11/2026). Este documento describe lo
construido, cómo funciona, qué protege y qué queda pendiente. Complementos: `FUENTES_Y_LICENCIAS.md` (fuentes, licencias,
reporte de la biblioteca) y `docs/FEATURE_FLAGS.md`.

> Nutrition Intelligence es una herramienta de registro y educación. No reemplaza a un nutricionista ni a un médico, no
> diagnostica, no prescribe dietas ni suplementos y reconoce cuándo un caso necesita a un profesional.

## 1. Qué se construyó

| Capacidad (máster §2) | Estado 1.0 | Dónde |
|---|---|---|
| A. Perfil nutricional | Objetivo general voluntario (7 opciones, ninguna obligatoria ni de peso), preferencias voluntarias, objetivos propios o indicados por un profesional | `nutrition_profile`, Nutrición → Ajustes |
| B. Diario de comidas | Desayuno, almuerzo, merienda, cena, colación y otra (sin imponer 4 comidas); alta, edición, borrado, repetir/copiar de ayer, favoritas, recetas, día marcado completo | `nutrition_entry`, `nutrition_day`, `nutrition_favorite`, `nutrition_recipe` |
| C. Biblioteca de alimentos | 225 alimentos con valores de USDA SR Legacy (dominio público), nombre rioplatense, crudo/cocido, porciones documentadas; alimentos propios; productos por código de barras (Open Food Facts, ODbL) | `packages/domain/src/nutrition/foods.ts`, `nutrition_food`, `off_product_cache` |
| D. Progreso nutricional | Hoy, 7 y 30 días o período propio; días parciales/completos/sin registro; promedios sólo de días completos; consistencia con objetivos; entrenamientos del período, descriptivo | Nutrición → Progreso |
| E. Asistente | Extensión del asistente existente (no una segunda IA): consultas del diario y registro con confirmación, por reglas y sin IA | `server/brain/nutrition.ts`, `packages/domain/src/nutrition/assistant.ts` |
| F. Vista del coach | Dos permisos separados que decide el alumno: resumen (sin comidas) y diario detallado; revocación inmediata; lectura registrada | `clientNutrition`, pestaña Nutrición de la ficha |

Lo que **no** se construyó (apagado y documentado): interpretación de fotos con IA (`nutrition_photo`), interpretación de
texto con IA (el texto se interpreta por reglas), estimador de requerimientos energéticos, recordatorios push de registro
(la preferencia existe y está apagada; no hay envío), rol de nutricionista.

## 2. Arquitectura

Una sola arquitectura para las seis capacidades:

- **Dominio puro** (`packages/domain/src/nutrition/`): tipos, motor determinístico (`calc.ts`), progreso (`progress.ts`),
  políticas de edad, objetivos y casos sensibles (`policy.ts`), búsqueda (`catalog.ts`), interpretación de texto
  (`parse.ts`), respuestas del asistente (`assistant.ts`) y la biblioteca generada (`foods.ts`, sólo la importa el servidor).
- **Servidor** (`apps/web/src/server/nutrition/`): `gate.ts` (quién puede usar el módulo), `services.ts` (diario, biblioteca,
  recetas, favoritas, perfil, progreso, exportación, vista del coach), `barcode.ts` (Open Food Facts con caché aparte).
- **API**: `/api/me/nutrition/*` (todo de la persona con sesión) y `/api/coach/[orgId]/clients/[relId]/nutrition`. Ambas con
  `Cache-Control: private, no-store` (`next.config.ts`).
- **Asistente**: `orchestrator.ts` deriva al manejador de Nutrición después de la regla de edad; la acción `log_food` entra
  al catálogo de acciones con confirmación obligatoria (`autoAt: null`, `adultOnly`).
- **Interfaz**: Progreso → Nutrición (socio), pestaña Nutrición de la ficha (coach). Sin pestaña nueva en la barra.
- **Sin conexión**: cola propia en el almacén `kv` del dispositivo (`lib/offline/nutrition.ts`), separada de la de
  entrenamiento.

## 3. Modelo de datos (migración aditiva 0057)

Siete tablas nuevas, vacías, sin `org_id` (los datos son de la persona), con borrado en cascada desde `user` y RLS activado
sin políticas (acceso sólo por el servidor):

| Tabla | Contenido |
|---|---|
| `nutrition_profile` | objetivo general, preferencias (jsonb), objetivos y su fuente (`self`/`professional`), recordatorio y proactividad (apagados por defecto), onboarding, revisión |
| `nutrition_entry` | un registro por alimento: id generado por el teléfono (idempotencia), día, comida, **copia de la información nutricional usada** (`food`), cantidad, gramos si se conocen, nutrientes calculados, revisión, marca de borrado |
| `nutrition_day` | día marcado completo por la persona |
| `nutrition_food` | alimentos propios: valores para una base declarada (100 g, 100 ml, 1 unidad, 1 porción) |
| `nutrition_recipe` | recetas: ingredientes con su copia, porciones y peso final si se conoce |
| `nutrition_favorite` | comidas favoritas (alimentos y cantidades) |
| `off_product_cache` | caché de Open Food Facts (ODbL), separada de todo lo demás, sin imágenes, 30 días |

Scripts: `scripts/operations/hosted-0057.sql` (una transacción, roles de producción, RLS explícito),
`scripts/operations/verify-0057.sh` (ensayo en base descartable: aplica, reintento falla entero, reversión se niega con
datos, revierte y reaplica) y `scripts/rollback/0057_nutrition.down.sql` (se niega si hay datos de personas).

## 4. Metodología de cálculo

- **Determinístico**: energía y macros salen de valores estructurados; nunca de un modelo de lenguaje.
- **Desconocido ≠ 0**: un nutriente que la fuente no informa queda `null`. Un total con faltantes se muestra como mínimo
  («≥ 45 g») y su cobertura (cuántos ítems lo informan) viaja con el total.
- **Energía**: la informada por la fuente. Si falta y están los tres macros, Atwater general 4/4/9 (FAO; Res. GMC 46/03
  §3.3.1) rotulada «calculada»; si falta un macro, desconocida.
- **Unidades**: gramos; ml sólo si la base es por 100 ml (sin densidades universales); porciones domésticas sólo si la fuente
  las documenta («1 taza» = 158 g de arroz cocido); unidad/porción sólo si la base es esa unidad; gramos de una receta sólo
  con su peso final.
- **Crudo y cocido son alimentos distintos**: nunca se convierte uno en otro.
- **Recetas**: total = suma de ingredientes; por porción = total / porciones; por gramo cocido = total / peso final. No se
  supone que el peso cocido sea la suma de los crudos.
- **Historial**: cada registro guarda la copia de valores usada. Una versión nueva de la biblioteca, editar un alimento
  propio o una receta no cambia lo ya registrado. Corregir es explícito («Corregir con la versión vigente», sube la revisión).
- **Redondeo de presentación** (GMC 46/03 §3.4.3): energía y sodio enteros; gramos con un decimal por debajo de 10 y enteros
  desde 10; «0» por debajo de 4 kcal, 0,5 g, 0,2 g (saturadas) y 5 mg. El cálculo interno conserva 4 decimales.
- **Cantidades**: mayores que cero y con tope (5 kg/5 l, 50 unidades) contra errores de tipeo.

## 5. Registro

- **Búsqueda** local y determinística sobre la biblioteca (alias rioplatenses, plural/género, sin acentos), más los alimentos
  propios y recetas. Sin coincidencia razonable no adivina.
- **Frecuentes**: recientes (últimos 30 días con la última cantidad) y favoritas en un toque; repetir/copiar de ayer.
- **Manual**: nombre, cantidad y unidad de la base, valores opcionales (vacío = desconocido).
- **Código de barras**: consulta en tiempo real a Open Food Facts (una llamada por escaneo, nunca mientras se escribe;
  6 s de tiempo máximo; corte tras 5 fallas seguidas; caché de 30 días). Dígito verificador GTIN. No encontrado o sin datos:
  carga manual. Cámara con `BarcodeDetector` cuando el navegador lo tiene; si no (iPhone), ingreso del número.
- **Texto natural** («Almorcé 200 g de pollo, arroz y una ensalada»): propuesta editable con aclaraciones («¿crudo o
  cocido?», «¿cuánto?», «esa medida no tiene equivalencia documentada»). Nunca se guarda sola.
- **Fotos**: no en 1.0 (ver §12).
- **Idempotencia**: alta atómica por id; doble toque, reintento o una sincronización atrasada no duplican ni resucitan un
  borrado. Edición con control de revisión: una copia vieja recibe 409 con la vigente.

## 6. Progreso

- Estados del día: **sin registros**, **parcial** (hay registros y la persona no lo marcó completo), **completo** (marcado por
  la persona). La ausencia de registro no significa que no comió.
- Promedios: sólo días completos sin faltantes en ese nutriente; con menos de 3 días, «faltan días completos».
- Consistencia con objetivos propios: sólo sobre días completos (mínimo, aproximado ±10 % o máximo).
- Entrenamientos del período junto a la alimentación, con frase descriptiva («En estos 28 días registraste comidas en 18 días
  y completaste 15 entrenamientos»), nunca causal.
- Gráficos con el componente de Progreso (zoom, desplazamiento, teclado, tabla debajo).

## 7. Asistente (REPI Intelligence Core)

- Con adultos y el módulo encendido, el orquestador deriva las consultas del diario a reglas: «¿cuánta proteína llevo hoy?»,
  «¿qué comí ayer?», «¿cuánto tiene mi desayuno?», «¿cómo vengo esta semana?», «¿qué días registré mejor mis objetivos?»,
  «¿qué comidas registré antes de entrenar?» (dice que no guarda la hora de cada comida), «ayudame a organizar las comidas de
  mañana» (herramientas generales según preferencias, sin cantidades), «¿por qué me mostrás esto?».
- **Sin IA y sin proveedores externos**: nada del diario sale de REPI. No hay costo de IA por Nutrición.
- **Registrar** («agregá una banana a mi merienda»): identifica el alimento, pide cantidad o estado si faltan, muestra lo que
  se registrará (alimento, cantidad, comida, valores y fuente) y espera confirmación. La clave de la acción es el id del
  registro: confirmar dos veces no duplica.
- **Casos sensibles** (trastornos alimentarios, restricción extrema, embarazo/lactancia, enfermedades, medicación, alergias,
  suplementos, síntomas): respuesta fija que reconoce el límite, sin números, con orientación a un profesional.
- Menores y edad desconocida: la regla de edad existente bloquea toda charla de comida antes de llegar acá.
- Con el módulo apagado para la persona, el asistente se comporta exactamente como antes.

## 8. Perfil, objetivos y edad

- **Sólo adultos con fecha de nacimiento registrada** (D203). Menores: el módulo no se ofrece (no hay política validada con
  el adulto responsable). Edad desconocida: se pide la fecha (AgeGate) antes de empezar. El servidor responde 403
  `minor_restricted`/`age_required`; el permiso de compartir nutrición es `minorRestricted`.
- **Objetivos**: nunca automáticos. Los define la persona o los indica un profesional. Rangos: energía 1000–6000 kcal,
  proteína 20–400 g, carbohidratos 20–1000 g, grasas 15–400 g. Energía por debajo de 1200 kcal sólo si la indicó un
  profesional. REPI no infiere sexo, actividad total ni requerimientos.
- **Preferencias** voluntarias y acotadas. No se piden alergias, enfermedades, embarazo ni tratamientos.
- **Proactividad** nutricional y recordatorio: apagados por defecto; en 1.0 no hay avisos nutricionales automáticos.

## 9. Coach, gimnasio y REPI Control

- **Coach personal**: dos permisos de la relación, `nutrition` (resumen: días registrados, promedios de días completos,
  objetivos y consistencia, sin comidas) y `nutrition_journal` (cada registro de los últimos 14 días). Se piden desde la ficha
  y el alumno decide; también los enciende/apaga en Perfil → Privacidad. El servidor comprueba el permiso en cada pedido;
  revocar corta en la siguiente carga. Cada lectura queda en el historial de accesos del alumno (una por día y por permiso),
  sin valores. Nunca incluye el peso corporal (D199) ni las preferencias.
- **Gimnasio** (dueño, gerente, coordinación, sala, recepción): no tiene ítem de nutrición en su catálogo y su código no lee
  estas tablas. Un permiso institucional no equivale a leer la alimentación.
- **REPI Control**: la pantalla compartida del gimnasio no muestra ni guarda nada de Nutrición; el asistente no modifica la
  programación institucional por registros de comida. Training Intelligence no lee Nutrición.
- **REPI Admin**: ninguna ruta de administración lee estas tablas; sin vistas por persona.

## 10. Sin conexión

Cola propia (`kv`, se borra al cerrar sesión o cambiar de cuenta): altas con id local, ediciones con revisión y borrados.
Lo pendiente se ve marcado «pendiente de sincronizar» con valores calculados localmente desde la copia del alimento; al volver
la conexión se sube en orden; una falla de red corta y reintenta después; un rechazo definitivo se informa sin reintentar
para siempre. Para registrar sin conexión hacen falta los datos del alimento en el dispositivo (recientes, favoritas, último
día o búsqueda vista); la biblioteca completa nunca se descarga.

## 11. Seguridad y privacidad

- Autenticación de sesión; todo filtra por el id de la sesión; un id ajeno responde 404 (igual que inexistente).
- Sin `org_id`, RLS activado, acceso sólo por el servidor.
- Exportación: `nutrition` dentro de «Descargar mis datos» (perfil, registros con su copia, días, alimentos propios, recetas,
  favoritas), sin el id de usuario. Borrado de cuenta: cascada (sin archivos: Nutrición 1.0 no guarda imágenes).
- Auditoría sin contenido: acción y recurso, nunca alimentos ni valores.
- Límites por ruta (búsqueda 120/min, código de barras 12/min, texto 30/min, escrituras 120/min).
- Sin claves de API: USDA se usa como datos importados; Open Food Facts no requiere clave.

## 12. Costos

| Uso | Costo |
|---|---|
| Registro manual, búsqueda, recetas, progreso, asistente | Sin costo variable: cálculo local y en el servidor, sin IA |
| Código de barras | Open Food Facts gratis (15 lecturas/min por IP; caché de 30 días) |
| Almacenamiento | ~1 KB por registro (con su copia) → ~1 MB por persona y año con 3 registros diarios; despreciable en el plan actual |
| Interpretación de texto con IA (no activada) | Estimado con un modelo chico: ~US$0,01 por persona activa por mes (100/500/1000 activos ≈ US$0,8/4/8 por mes); requiere autorización |
| Fotos con IA (no construida) | No estimado en firme: requiere elegir proveedor, validar exactitud y autorización |

No se contrató nada ni se creó una dependencia paga.

## 13. Pruebas

- Dominio (`packages/domain/src/nutrition/nutrition.test.ts`): cálculos (proteína, carbohidratos, grasas, energía,
  porciones fraccionadas, unidades, redondeos, varios ingredientes, receta por porción, faltantes, crudo/cocido, cambio de
  versión), progreso (días parciales/completos, tendencia, evidencia insuficiente, consistencia), políticas (edad, objetivos,
  casos sensibles) e interpretación de texto.
- Servidor (`apps/web/tests/nutrition.test.ts`): registro completo, idempotencia, doble toque, conflicto de revisión, copiar de
  ayer, recetas, alimentos propios, código de barras (válido, inválido, no encontrado, proveedor caído), corrección histórica,
  perfil y objetivos, asistente (consulta y registro confirmado), edad, privacidad alumno A/B, coach sin permiso / resumen /
  diario / revocación / otra organización, gimnasio, REPI Admin, kiosco, exportación y borrado, módulo apagado y piloto de demo,
  historial largo.
- Interfaz: `apps/web/e2e/nutrition.spec.ts` (recorridos en teléfono y escritorio).
- Interfaz: `apps/web/e2e/nutrition.spec.ts`, 8 recorridos × teléfono (Pixel 7) y escritorio: A (primera vez), registro rápido
  y edición, D (sin conexión), E (receta), F (día parcial y REPI), progreso y ajustes, C (coach) y G (REPI Control).

### Mapa de las 78 pruebas del máster (§24)

| # | Dónde | Estado |
|---|---|---|
| 1–7 buscar, elegir, cantidad, porción, agregar, editar, eliminar | servidor «[1–7]», e2e «hoy» | verificado |
| 8–9 duplicar comida, copiar de ayer | servidor «[8–9]», e2e «hoy» | verificado |
| 10 receta | servidor «[10, 29]», e2e E | verificado |
| 11 alimento propio · 12 sin datos · 13 incompletos | servidor «[11–13]», e2e «hoy» | verificado |
| 14 duplicado · 18 reintento · 19 doble toque | servidor «[14, 18, 19]», e2e «hoy» | verificado |
| 15 escaneo inválido | servidor «[15]» (dígito verificador, no encontrado, encontrado) | verificado; cámara no probada (Chromium sin `BarcodeDetector`) |
| 16 foto ambigua | — | no aplica: fotos no construidas (`nutrition_photo` apagado) |
| 17 texto ambiguo | dominio «[17]», servidor «[17]», asistente | verificado |
| 20 sin conexión · 77 pérdida de conexión | e2e D (registrar, recargar sin red, sincronizar una vez) | verificado |
| 21–31 cálculos | dominio «[21–31]» | verificado |
| 32–34 corrección histórica, proveedor, versión | dominio y servidor «[32–34]» | verificado |
| 35–37 perfil completo, parcial, sin perfil | servidor «[35–37]» | verificado |
| 38–43 sin comidas, parcial, completo, semana, entrenamiento sin datos, evidencia insuficiente | dominio «[38–43]», servidor «[39–41]», «[42, 16]» | verificado |
| 44–45 lenguaje natural y acción confirmada | servidor «[44–45]», e2e F | verificado |
| 46–47 respuesta errónea o modelo no disponible | — | no aplica: Nutrición no usa IA (respuestas por reglas, también sin clave de IA) |
| 48–50 edad desconocida, menor, caso sensible | dominio y servidor «[48–50]» | verificado |
| 51–58 alumno A/B, coach sin/limitado/diario, revocación, otro gimnasio, dueño, REPI Admin | servidor «[51]» a «[58]», e2e C | verificado |
| 59–61 exportación, eliminación, archivos | servidor «[59–61]» (sin archivos en 1.0) | verificado |
| 62–63 REPI Control y kiosco | servidor «[57, 62]», «[63]», e2e G | verificado |
| 64–67 iPhone, Android, tablet, escritorio | e2e en Pixel 7 (Chromium) y 1366 px; capturas 390 px | Android y escritorio emulados; iPhone (WebKit) y tablet no probados |
| 68–69 tema claro y oscuro | capturas 390 px claras y oscuras | revisado visualmente |
| 70 movimiento reducido | e2e con `reducedMotion: reduce` | verificado |
| 71–72 teclado y lector de pantalla | axe en cada recorrido | parcial: sin prueba con lector real |
| 73 historial largo | servidor «[73]» (un año en < 3 s) | verificado |
| 74 búsqueda lenta | búsqueda con espera de 300 ms y estado de carga | sin prueba automatizada |
| 75 proveedor caído | servidor «[75]» | verificado |
| 76 zoom de gráficos | componente de Progreso ya probado (D217) | reutilizado, sin prueba nueva |
| 78 recarga durante edición | servidor «[20, 78]», e2e «hoy» (edición vieja) | verificado |

## 14. Activación

`nutrition` sigue **apagado para personas reales**. Las cuentas ficticias de la demo guiada lo tienen como piloto (para
verificar en producción sin habilitarlo a nadie). Para encenderlo para todos (decisión del titular):

1. Migración 0057 aplicada y verificada en producción (respaldo previo).
2. Smoke de producción con la demo: registro, progreso, coach con permiso y revocación, asistente.
3. Revisión de privacidad y textos por el titular (y, si se quiere, por un profesional de la nutrición).
4. `NEXT_PUBLIC_REPI_FEATURES=nutrition` en Vercel y redeploy; actualizar `apps/web/tests/features.test.ts` y esta sección.
5. No anunciarlo en /conoce hasta entonces.

## 15. Limitaciones

- Biblioteca de 225 alimentos con valores de EE.UU.; 67 equivalencias aproximadas (cortes vacunos, quesos, panificados,
  preparaciones) marcadas como tales. No hay tabla argentina con licencia abierta (ARGENFOODS requiere permiso).
- Faltan preparaciones locales (mate, tarta, ñoquis, empanadas caseras, alfajores…): se cargan como alimento propio o receta.
- Open Food Facts depende de lo que carga la comunidad; se muestra la fuente y se pide revisar la etiqueta.
- No guarda la hora de cada comida (no separa antes/después de entrenar).
- Un solo coach por alumno en Privacidad (limitación existente de `myRelation`).

## 16. Próximas expansiones

Interpretación de texto con IA (con autorización de costo), fotos de platos con validación de exactitud, tabla argentina
(con permiso de ARGENFOODS), hora de las comidas, recordatorios con el motor de relevancia, agua/hidratación, rol de
nutricionista como expansión separada (no existe en 1.0), política para menores con el adulto responsable.
