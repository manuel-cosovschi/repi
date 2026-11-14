# Fuentes alimentarias y licencias — Nutrition Intelligence 1.0 (D221)

Investigación del 14/11/2026 (con URL por afirmación) y reporte de la curaduría de la biblioteca. Regenerar la biblioteca: ver §Reproducir al final.


Investigación hecha el 14/11/2026. No reemplaza asesoramiento legal. Cada afirmación lleva su URL. Cuando una fuente no aclara algo, se indica **"no verificado"** o **"no surge de la fuente"**.

Método: lectura de páginas oficiales, PDFs (extraídos con `pdftotext`) y dos consultas anónimas de solo lectura a la API pública de Open Food Facts para contar productos. No se usaron API keys (tampoco `DEMO_KEY`), no hubo registros ni gastos, y no se enviaron datos personales.

---

## 1. USDA FoodData Central (FDC)

### 1.1 Licencia y atribución
- Según el API Guide oficial, los datos de FDC son de **dominio público, sin copyright**, y se publican bajo **CC0 1.0 Universal**. No hace falta pedir permiso. USDA pide citar FoodData Central como fuente y, si es posible, avisarle de los productos que usan los datos. Cita sugerida: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, [año]. fdc.nal.usda.gov". https://fdc.nal.usda.gov/api-guide/
- La documentación de SR Legacy propone esta cita: "US Department of Agriculture (USDA), Agricultural Research Service, Nutrient Data Laboratory. USDA National Nutrient Database for Standard Reference, Legacy. Version Current: April 2018". También aclara que mencionar marcas no implica respaldo de USDA. https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR-Legacy/SR-Legacy_Doc.pdf
- **¿Se pueden integrar las descargas masivas en una base propietaria?** Sí. Con CC0 no hay obligación de compartir igual ni de atribuir, aunque USDA pide la cita como cortesía. La página de descargas no trae un texto de licencia propio; la licencia CC0 surge del API Guide. https://fdc.nal.usda.gov/download-datasets/ · https://fdc.nal.usda.gov/api-guide/
- El FAQ menciona expresamente el "desarrollo de software y aplicaciones comerciales de análisis de nutrientes" como uso previsto de los datos. https://fdc.nal.usda.gov/faq/
- Recomendación: guardar la cita igual (en "Fuentes" dentro de la app y en cada fila) y no sugerir que USDA respalda a REPI (disclaimer del PDF de SR Legacy, arriba).

### 1.2 Términos de la API y límites
- Cada solicitud necesita una API key de data.gov. Las keys deben mantenerse privadas: si aparecen publicadas, por ejemplo en un repositorio, se desactivan. https://fdc.nal.usda.gov/api-guide/
- **Key registrada:** 1.000 solicitudes por hora por IP. Superar el límite bloquea la key por 1 hora (HTTP 429). Se puede pedir un límite mayor. https://fdc.nal.usda.gov/api-guide/ · https://api.data.gov/docs/developer-manual/
- **DEMO_KEY:** 30 solicitudes por hora y 50 por día, por IP. https://api.data.gov/docs/developer-manual/
- Para la v1 no hace falta la API: alcanza con descargar los archivos una vez e importarlos. No hay costo ni dependencia de una key.

### 1.3 Datasets disponibles (página de descargas, 14/11/2026)
| Dataset | Última versión | Formatos |
|---|---|---|
| Foundation Foods | octubre 2026 (`..._2026-10-29.zip`) | JSON, CSV |
| SR Legacy | abril 2018 (final, no se actualiza) | JSON, CSV |
| FNDDS 2021-2023 | octubre 2024 | JSON, CSV |
| Branded | octubre 2026 | JSON, CSV |
Fuente: https://fdc.nal.usda.gov/download-datasets/

### 1.4 ¿Foundation o SR Legacy para alimentos genéricos?
- **Foundation Foods** tiene valores analíticos sobre muestras individuales de alimentos básicos o mínimamente procesados, y se actualiza en abril y octubre. https://fdc.nal.usda.gov/data-documentation/
  - Cobertura chica: arrancó con 73 alimentos (https://fdc.nal.usda.gov/Foundation_Foods_Documentation/). Una comparación de la Universidad de Minnesota contó **287** en la versión de abril 2024 (https://www.ncc.umn.edu/products/comparison). El recuento actual exacto no se verificó. La versión 16.0 (29/10/2026) sumó 29 alimentos, entre ellos harinas pregelatinizadas e inflados. https://fdc.nal.usda.gov/log/
  - Entre las características que describen cada alimento figura "raw or cooked", y hay porciones (por ejemplo, 1 taza, 1 cucharada, 1 fruta) para *algunos* alimentos. https://fdc.nal.usda.gov/Foundation_Foods_Documentation/
- **SR Legacy** reúne **7.793 alimentos** con hasta 150 componentes, tomados de análisis, cálculos y literatura. Su última versión es de abril 2018 y no se va a actualizar. https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR-Legacy/SR-Legacy_Doc.pdf · https://fdc.nal.usda.gov/data-documentation/
- **Conclusión:** para un seed de ~200 alimentos comunes, **SR Legacy es la base práctica** porque cubre mucho más, incluidas variantes cocidas y porciones caseras. Cuando un alimento existe en Foundation, conviene preferir esos valores, más nuevos y analíticos, y dejar registrada la procedencia en la fila.

### 1.5 Crudo vs cocido y porciones caseras
- SR Legacy trae el mismo alimento en estado crudo y cocido. Ejemplos (nombres y NDB confirmados con sitios de terceros que citan USDA; conviene verificar en el CSV al importar):
  - Arroz blanco: "Rice, white, long-grain, regular, raw, enriched" y "..., enriched, cooked" (NDB 20045): 130 kcal, 2,7 g de proteína, 0,28 g de grasa y 28,2 g de carbohidratos cada 100 g. 1 taza = 158 g. https://www.recipal.com/ingredients/6213-nutrition-facts-calories-protein-carbs-fat-rice-white-long-grain-regular-raw-enriched · https://www.recipal.com/ingredients/11398-nutrition-facts-calories-protein-carbs-fat-rice-white-long-grain-regular-cooked-enriched · https://triagemethod.com/tools/human-nutrition-explorer/food/rice-white-long-grain-regular-enriched-cooked.html
  - Pechuga de pollo: "Chicken, broilers or fryers, breast, meat only, raw" y "..., cooked, roasted", que trae 1 taza picada = 140 g. https://www.recipal.com/ingredients/881-nutrition-facts-calories-protein-carbs-fat-chicken-broilers-or-fryers-breast-meat-only-raw · https://recipal.com/ingredients/883-nutrition-facts-calories-protein-carbs-fat-chicken-broilers-or-fryers-breast-meat-only-cooked-roasted
  - Los IDs FDC exactos (por ejemplo 168878 y 171477) **no se verificaron**. Hay que tomarlos del CSV.
- **Porciones:** el archivo Weight de SR "contiene los pesos en gramos de varias medidas comunes para cada alimento" (https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR-Legacy/SR-Legacy_Doc.pdf). En el formato FDC, la tabla `food_portion` guarda las medidas de los alimentos Foundation y Legacy, con `amount`, `measure_unit_id` y `gram_weight` (https://fdc.nal.usda.gov/portal-data/external/dataDictionary). El log de FDC registra una corrección que restauró `amount` en `foodPortions` del archivo SR Legacy (https://fdc.nal.usda.gov/log).
- FDC no ajusta porciones de forma automática, y no todos los alimentos tienen porción casera además de la base de 100 g. https://fdc.nal.usda.gov/faq/

### 1.6 Cómo calcula la energía FDC
- Foundation usa casi siempre los factores generales de Atwater (4/9/4) y, en algunos casos, factores específicos por alimento. Cuando se usan los específicos, se rotulan aparte. https://fdc.nal.usda.gov/Foundation_Foods_Documentation/ · https://fdc.nal.usda.gov/faq/
- SR Legacy guarda factores por alimento (`Pro_Factor`, `Fat_Factor`, `CHO_Factor`) en Food Description, es decir, Atwater específicos. https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR-Legacy/SR-Legacy_Doc.pdf

---

## 2. Open Food Facts (OFF)

### 2.1 Licencias
- La base está bajo **ODbL**, el contenido individual bajo **DbCL** y las imágenes bajo **CC BY-SA**. Se permite el uso comercial con condiciones. Hay que nombrar la licencia y acreditar a Open Food Facts con un enlace. Si el dato es de un producto puntual, el enlace va a la página de ese producto. "Las obras derivadas deben compartirse bajo las mismas condiciones." Los datos pueden tener errores y "no deben usarse con fines médicos". Pueden existir derechos de terceros (marcas, diseño del envase). Rige la ley francesa. https://world.openfoodfacts.org/terms-of-use
- La página de datos pide atribuir a OFF de forma visible en la interfaz, con enlaces al proyecto y a la ODbL. Si los usuarios agregan o corrigen productos, pide enviar esos aportes a OFF. https://world.openfoodfacts.org/data

### 2.2 Uso en tiempo real vs incorporar registros en una base propia (ODbL 1.0)
Definiciones y cláusulas de https://opendatacommons.org/licenses/odbl/1-0/:
- **Derivative Database:** base construida a partir de la original, incluidas traducciones, adaptaciones, reordenamientos o modificaciones.
- **Collective Database:** la base *sin modificar* junto a otras bases independientes.
- **Produced Work:** obra que resulta de usar la base (imagen, texto, etc.).
- **§4.3:** si se usa públicamente un Produced Work, debe llevar un aviso de que proviene de la base y de que está disponible bajo ODbL.
- **§4.4 (share-alike):** toda Derivative Database usada públicamente debe publicarse bajo ODbL o una licencia compatible.
- **§4.5:** crear un Produced Work, o usar la base como parte de una Collective Database, **no** crea una Derivative Database a los efectos de §4.4.
- **§4.6:** si se usa públicamente una Derivative Database, o un Produced Work hecho a partir de una, hay que ofrecer una copia legible por máquina de la base derivada o de los cambios. Por internet, sin costo.

Qué implica para REPI:
- **Consulta en tiempo real y mostrar el resultado con atribución:** el producto mostrado en pantalla funciona como Produced Work. Hay que poner el aviso de §4.3 y la atribución que pide OFF, y no se genera share-alike.
- **Mezclar registros de OFF con la base propia** (por ejemplo, copiarlos a la tabla `foods` o corregirlos y combinarlos con datos propios): eso es una **Derivative Database**. Si se usa públicamente, esa parte tiene que publicarse bajo ODbL. Según la wiki de OFF, todo dato derivado o mezclado debe compartirse, y las organizaciones que no quieran o no puedan compartir sus datos no pueden reutilizar los de OFF (citado a partir del extracto del buscador, porque la página bloqueó la descarga automática). https://wiki.openfoodfacts.org/ODBL_License
- Un antecedente es la app Intora, que declara bajo la misma licencia la porción de su base derivada de OFF y excluye sus algoritmos propietarios. https://intora.netlify.app/legal
- La guía oficial de licencias de OFF remite a la wiki y a reuse@openfoodfacts.org. https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side

**Enfoque recomendado para no contaminar la base propietaria:**
1. Tabla separada, por ejemplo `off_product_cache`, con `barcode`, `payload_json`, `fetched_at`, `off_url` y `license = 'ODbL-1.0'`. Sin FK de `foods` hacia ella y sin mezclar columnas con el seed USDA.
2. Guardar solo lo que se consultó por un escaneo real, sin modificarlo. Esta tabla se trata como "copia ODbL" y debe poder exportarse completa si alguien la pide (§4.6).
3. Las entradas del diario que salen de un escaneo apuntan a `off_product_cache` o guardan un snapshot de los macros, con `source = 'openfoodfacts'` y la atribución.
4. Si el usuario corrige un producto de OFF, guardar la corrección aparte, como dato del usuario o derivado ODbL, y si es posible enviarla a OFF. No volcarla en `foods`.
5. Texto de atribución visible donde se muestre el dato, por ejemplo: "Datos de Open Food Facts (© colaboradores de Open Food Facts), licencia ODbL", con enlace a la página del producto. También una mención general en "Fuentes y licencias".
6. No mostrar imágenes de OFF en la v1, o mostrarlas con atribución CC BY-SA, porque tienen otra licencia y pueden incluir derechos de terceros. https://world.openfoodfacts.org/terms-of-use

### 2.3 API
- **Producto por código de barras (v2):** `GET https://world.openfoodfacts.org/api/v2/product/{barcode}?fields=product_name,nutriments,...`. En staging es `world.openfoodfacts.net`. https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/
- **v3:** la documentación muestra `/api/v3.6/product/3274080005003.json`, y la lectura de producto existe en v2 y en v3. https://openfoodfacts.github.io/openfoodfacts-server/api/
- **User-Agent obligatorio** con el formato `AppName/Version (ContactEmail)`. Las lecturas no requieren login. Staging: `https://world.openfoodfacts.net` con basic auth `off:off`. https://openfoodfacts.github.io/openfoodfacts-server/api/
- **Límites por IP:** 15 solicitudes por minuto para lecturas de producto, 10 por minuto para búsquedas, y límites globales aparte que devuelven 503. Si las llamadas salen directo del dispositivo del usuario, el límite corre por usuario. https://openfoodfacts.github.io/openfoodfacts-server/api/
- **Búsqueda mientras se escribe:** **no permitida** ("would be blocked very quickly"). https://openfoodfacts.github.io/openfoodfacts-server/api/
- Política de uso: "1 llamada a la API = 1 escaneo real de un usuario". El scraping se bloquea. Para acceso masivo están los dumps nocturnos (CSV de ~0,9 GB comprimido y ~9 GB descomprimido). https://world.openfoodfacts.org/data
- Para REPI: el contacto del User-Agent debería ser un correo genérico del proyecto, no uno personal. Si se consulta desde el servidor, todos los usuarios comparten el límite de 15 por minuto por IP: conviene cachear o consultar desde el cliente.

### 2.4 Cobertura de productos argentinos
- Consulta anónima a la API v2 el 14/11/2026 con `countries_tags_en=argentina`: **17.023 productos**. https://world.openfoodfacts.org/api/v2/search?countries_tags_en=argentina&fields=code&page_size=1
- Con el filtro adicional `states_tags=en:nutrition-facts-completed`: **8.162 productos** (~48%) con la tabla nutricional completa. https://world.openfoodfacts.org/api/v2/search?countries_tags_en=argentina&states_tags=en:nutrition-facts-completed&fields=code&page_size=1
- La página `/country/argentina` devolvió 503 en ese momento, así que las cifras salen de la API.

---

## 3. Fuentes argentinas

| Fuente | Disponibilidad | Licencia / reutilización |
|---|---|---|
| **GAPA** (Guías Alimentarias para la Población Argentina; Ministerio de Salud, aprobadas por la Res. 693/2019) | Documento técnico y gráfica. No es una tabla de composición, pero sirve como referencia de porciones y mensajes. Hay copias en sitios provinciales y universitarios. https://santafe.gob.ar/index.php/web/content/download/250950/1318029 · https://e-legis-ar.msal.gov.ar/htdocs/legisalud/migration/pdf/33336.pdf | El documento no trae una licencia propia, o no se encontró. Lo que esté publicado en **argentina.gob.ar** está bajo **CC BY 4.0** ("podés copiar y redistribuir el material ... incluso comercial", con atribución) salvo que se indique otra cosa: https://www.argentina.gob.ar/acerca · https://www.argentina.gob.ar/node/1530. **No se verificó** que el PDF de las GAPA esté alojado en argentina.gob.ar; si lo está, aplica CC BY 4.0. |
| **ARGENFOODS** (UNLu, capítulo nacional de LATINFOODS/INFOODS) | Tabla web con PDFs por grupo de alimentos (cereales, vegetales, pescados...). Actualizada el 12/9/2024. No ofrece descarga en CSV o Excel. https://www.argenfood.unlu.edu.ar/ · https://www.argenfood.unlu.edu.ar/Tablas/Grupo/Cereales.pdf | **No se encontró licencia, condiciones de uso ni forma de citar** en el sitio (portada, introducción e índice revisados). Hay que asumir todos los derechos reservados y **pedir permiso escrito** a la UNLu antes de reutilizar valores en una app comercial. |
| **SARA** (Sistema de Análisis y Registro de Alimentos, Ministerio de Salud, 2004–2007; se usó en la ENNyS) | Se cita en `datos.dinami.gov.ar/sara/`, que hoy **no resuelve en DNS** (probado el 14/11/2026). Era una tabla ad hoc armada con ARGENFOODS y tablas internacionales. https://rasp.msal.gov.ar/index.php/rasp/article/download/190/143/296 | No disponible. Licencia desconocida. |
| **Tabla Nacional / BDCAN** (CONICET-UNT, IECS, MSAL) | En desarrollo según Sammán et al., Rev Argent Salud Pública 2020;12:e25. La revisión dice que el país "no dispone de una BDCAN acorde a sus necesidades" y que de ella "surgirá una TCA nacional de libre acceso". https://rasp.msal.gov.ar/index.php/rasp/article/download/190/143/296 | El artículo está bajo CC BY-NC-SA 4.0. Eso cubre el artículo, no una tabla. No se encontró una tabla publicada con licencia abierta. |
| **INTI** | No se encontró una tabla de composición del INTI. Solo hay una mención aislada a "INTI Carnes 2026" para cortes vacunos en un artículo de terceros. https://www.3tres3.com/es-ar/print/17944 | No se verificó. |
| Vademécum SAOTA (2011, más de 1.000 alimentos) | De acceso libre en saota.org.ar según la nota. Incluye datos que aportaron empresas. https://www.intramed.net/content/compilaron-un-vademecum-de-mas-de-1000-alimentos | Sin licencia indicada. No reutilizar. |

**Conclusión sección 3:** **no se encontró ninguna tabla oficial argentina de composición de alimentos con licencia abierta y descargable.** ARGENFOODS es la referencia local más seria, pero no indica licencia. Reutilizar sus valores en la app no está claramente permitido: conviene **pedir autorización** y, mientras tanto, usar USDA (CC0). Se puede usar ARGENFOODS como control manual de plausibilidad sin copiar la tabla, aunque esto también queda en zona gris y lo más prudente es la autorización. Las GAPA sirven para porciones y medidas caseras con atribución, si están bajo CC BY 4.0.

---

## 4. Arquitectura recomendada para la v1 (costo cero)

**(a) Seed curado de ~150–250 alimentos argentinos comunes con valores USDA (CC0)**
- Cada fila incluye: `name_es` (por ejemplo "Arroz blanco, cocido"), `state` (`crudo` | `cocido` | `n/a`), `cooking_method` (hervido, asado, etc.), por 100 g `kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `alcohol_g?`, `energy_source` (`reportada` | `calculada`), `source` (`usda_sr_legacy` | `usda_foundation`), `source_id` (fdc_id / NDB), `source_name_en`, `source_release` (por ejemplo "SR Legacy 2018-04" o "Foundation 2026-10-29"), `mapping_note` (por qué se eligió ese equivalente), `reviewed_by`, `reviewed_at`.
- Porciones en una tabla aparte, `food_portion(food_id, label_es, grams, source)`. Se pueden tomar de `food_portion` de USDA (https://fdc.nal.usda.gov/portal-data/external/dataDictionary) o definir como medidas caseras locales (taza, cucharada, unidad, "porción GAPA") con `source = 'repi_editorial'`.
- Riesgos: (1) los alimentos argentinos no siempre tienen un equivalente exacto en USDA (cortes vacunos, dulce de leche, pan francés, facturas, yerba/mate): marcarlos como aproximados con `mapping_note` y, si hace falta, revisarlos con un nutricionista. (2) Cocido y crudo se confunden fácil, y 100 g de arroz crudo no equivalen a 100 g cocido: la UI tiene que mostrar el estado. (3) SR Legacy está congelado desde 2018 (https://fdc.nal.usda.gov/data-documentation/).

**(b) Consulta opcional por código de barras a OFF, en tiempo real**
- Una llamada por escaneo, `GET /api/v2/product/{ean}` con User-Agent genérico del proyecto. Respuesta en `off_product_cache` separada, bajo ODbL, sin mezclarla con `foods`. Atribución visible y enlace al producto. Sin búsqueda mientras se escribe contra OFF. Fuentes en §2.
- Riesgos: datos incompletos (~52% de los productos argentinos sin tabla nutricional completa, §2.4); límites de 15 por minuto por IP; errores en los datos y aviso de "no uso médico"; obligación de exportar la caché si se trata como base derivada; imágenes CC BY-SA.

**(c) Alimentos personalizados del usuario**
- Tabla `user_food`, del usuario (privada por defecto), con `source = 'user'`. Si el usuario transcribe la tabla de un envase, son datos que carga él. No volcarlos al seed global sin revisión y consentimiento.

**Otros riesgos y recaudos**
- Agregar el disclaimer "información orientativa, no reemplaza consejo profesional", en línea con la advertencia de OFF (https://world.openfoodfacts.org/terms-of-use).
- No sugerir aval de USDA (https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR-Legacy/SR-Legacy_Doc.pdf).
- Página "Fuentes y licencias" con la cita USDA, la atribución ODbL de OFF y CC BY 4.0 si se usa material de argentina.gob.ar.

---

## 5. Escaneo de códigos de barras en el navegador

### 5.1 BarcodeDetector (nativo)
- No es Baseline. Es experimental y requiere contexto seguro (HTTPS). https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
- caniuse (14/11/2026): **Chrome Android: soportado**; Samsung Internet 13+: soportado; Chrome y Edge de escritorio: "partial"; **Safari iOS 17–27.2: "disabled by default"**, o sea que en la práctica **no está disponible en iPhone**; Firefox: no. https://caniuse.com/mdn-api_barcodedetector
- Detección recomendada: `"BarcodeDetector" in globalThis` y después `getSupportedFormats().includes("ean_13")`. https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector

### 5.2 Alternativas open source (npm y bundlephobia, 14/11/2026)
| Paquete | Licencia | Última versión | Tamaño (min / gzip) | Notas |
|---|---|---|---|---|
| `barcode-detector` (Sec-ant) | MIT | 3.2.3 (19/10/2026) | 43,8 KB / 15,1 KB **+ WASM** | Ponyfill/polyfill de la API estándar sobre ZXing-C++ WASM. Soporta `ean_13`. Por defecto baja el `.wasm` de jsDelivr; se puede autoalojar con `prepareZXingModule({ locateFile })`. https://github.com/Sec-ant/barcode-detector |
| `zxing-wasm` | MIT | 3.1.6 (19/10/2026) | 41,3 KB / 14,6 KB JS; `zxing_reader.wasm` = **946.860 bytes** sin comprimir | Motor del anterior. https://unpkg.com/zxing-wasm@3.1.6/?meta |
| `@zxing/library` | Apache-2.0 | 0.23.0 (29/4/2026) | 456 KB / 119,9 KB | "en modo mantenimiento"; soporta EAN-13. https://github.com/zxing-js/library |
| `@zxing/browser` | MIT | 0.2.1 (6/7/2026) | 27,3 KB / 7,0 KB (+ `@zxing/library` como dependencia) | Capa de cámara para el navegador. |
| `html5-qrcode` | Apache-2.0 | 2.3.8 (**15/4/2023**, sin versiones desde entonces) | 370 KB / 107 KB | Sin mantenimiento aparente. |
| `@ericblade/quagga2` | MIT | 1.13.0 (21/10/2026) | 154 KB / 42,7 KB | Solo 1D (EAN/UPC), activo. |
Tamaños: https://bundlephobia.com/api/size?package=<pkg>. Licencias y fechas: https://registry.npmjs.org/<pkg>

### 5.3 Recomendación para EAN-13 en Safari de iPhone y Chrome de Android
- Usar **`barcode-detector/ponyfill`** (MIT): usa el `BarcodeDetector` nativo si existe (Chrome Android) y, si no, el WASM de ZXing-C++ (iOS Safari). Es la misma API en ambos casos, está mantenido y lee EAN-13 bien. Conviene **autoalojar el `.wasm`** (~0,95 MB sin comprimir, se cachea una vez como asset de la PWA) para no depender de jsDelivr y respetar la CSP. Cargarlo con import dinámico solo al abrir el escáner.
- Captura con `getUserMedia({ video: { facingMode: "environment" } })` en HTTPS y detección cuadro a cuadro sobre `<video>` o `ImageBitmap`. Formatos limitados a `["ean_13","ean_8","upc_a","upc_e"]`.
- Plan B: `@ericblade/quagga2` (MIT, solo 1D, ~43 KB gzip, sin WASM).
- Siempre ofrecer **ingreso manual del código** como respaldo, por permisos de cámara o poca luz.

---

## 6. Metodología de energía y macros

- **Factores generales de Atwater:** 4 kcal/g para proteína y carbohidratos, 9 para grasa y 7 para alcohol (17/17/37/29 kJ/g). FAO FNP 77 (2003): https://www.fao.org/3/Y5022E/y5022e04.htm · https://www.fao.org/fileadmin/templates/food_composition/documents/Presentations/Food_Composition_-_Component_conventions_and_expressions.pdf
- **Rotulado MERCOSUR / Argentina (Res. GMC 46/03, §3.3.1):** carbohidratos (salvo polialcoholes) 4 kcal/g, proteínas 4, grasas 9, alcohol 7, ácidos orgánicos 3, polialcoholes 2,4, polidextrosa 1. Para otros nutrientes, factores del Codex. https://www.santafe.gov.ar/index.php/web/content/download/34543/177146/file/gmc
- **Recomendación:**
  1. Si la fuente **informa** energía (USDA "Energy" en kcal; en SR Legacy suele salir de factores específicos, ver §1.6), **usar ese valor** con `energy_source = 'reportada'`.
  2. Si falta la energía pero están los macros, **calcularla** con 4/4/9/7 y rotularla **"calculada"** (`energy_source = 'calculada'`), mostrando una marca discreta en la UI.
  3. Ojo con la fibra: USDA informa "Carbohydrate, by difference", que **incluye fibra**. La GMC 46/03 define carbohidratos como los "digeridos, absorbidos y metabolizados" y declara la fibra aparte (§2.5 del mismo PDF). Si se calcula con USDA, la opción conservadora es `4 × (carbs − fiber) + 2 × fiber`, documentada como criterio propio. **El factor 2 kcal/g para fibra no figura en la GMC 46/03.** Proviene de la práctica Codex/UE y en este trabajo **no se verificó** con una fuente. Alternativa simple: 4 × carbs y aceptar una leve sobreestimación.
  4. Para productos de OFF, usar `energy-kcal_100g` tal como viene, con atribución. Si falta, calcularla y rotularla igual.
- **Redondeo para mostrar (GMC 46/03, §3.4.3, incorporada al CAA):** energía y %VD en **números enteros**. Nutrientes: ≥100 → entero (3 cifras); 10–99 → entero (2 cifras); 1–9,9 → **1 decimal**; <1 → 1 decimal (2 decimales para vitaminas y minerales). Se declara "0" cuando el valor es ≤ al umbral "no significativo" por porción: energía ≤4 kcal; carbohidratos, proteínas y grasas ≤0,5 g; grasas saturadas y trans ≤0,2 g; fibra ≤0,5 g; sodio ≤5 mg. Tolerancia de ±20%. https://www.santafe.gov.ar/index.php/web/content/download/34543/177146/file/gmc
  - Sugerencia: **calcular siempre con los valores sin redondear** y redondear solo al mostrar. Para totales diarios, sumar primero y redondear después.
  - Vigencia: en 2025 hay un **proyecto** MERCOSUR que revisa y derogaría las GMC 44/03, 46/03, 48/06 y 40/11. Su aprobación **no se verificó**. https://documentos.mercosur.int/simfiles/docreuniones/108594_SGT3_2025_ACTA03_PT.pdf

---

## 7. Costos aproximados

- **Sin APIs pagas:** USDA (descarga CC0) y OFF (API pública) no cuestan nada. Solo queda la infraestructura existente (Postgres/hosting) y un asset WASM de ~1 MB en la CDN propia.
- **Parseo opcional con LLM** de texto libre ("almorcé 200 g de pollo y arroz"). Precios de Anthropic al 14/11/2026, https://platform.claude.com/docs/en/about-claude/pricing:
  - **Claude Haiku 5.5:** US$0,10 por millón de tokens de entrada y US$0,50 por millón de salida, para prompts de hasta 100k tokens. Batch al 50%.
  - Claude Haiku 4.5, como referencia: US$1 / US$5 por millón.
- Supuestos: 600 tokens de entrada y 150 de salida por parseo; 2 parseos por día × 30 días = 60 por usuario activo mensual (MAU).
  - Haiku 5.5: 600 × 0,10/1e6 + 150 × 0,50/1e6 = **US$0,000135 por parseo**, unos **US$0,0081 por MAU por mes**.
  - Escenario conservador con 400 tokens de salida (Haiku 5.5 tiene thinking adaptativo activado por defecto y lo que piensa se cobra como salida; conviene usar `effort: "low"`): ~US$0,00026 por parseo, ~US$0,0156 por MAU.

| MAU | Haiku 5.5 (base) | Haiku 5.5 (conservador) | Haiku 4.5 (base) |
|---|---|---|---|
| 100 | ~US$0,81/mes | ~US$1,56/mes | ~US$8,10/mes |
| 500 | ~US$4,05/mes | ~US$7,80/mes | ~US$40,50/mes |
| 1.000 | ~US$8,10/mes | ~US$15,60/mes | ~US$81/mes |

- Salvo autorización explícita del titular, esto queda como **opcional y apagado**: es gasto y pasa datos del usuario a un tercero. Conviene que el LLM solo extraiga `{alimento, cantidad, unidad, estado}` y que los macros salgan siempre de la base propia, nunca del LLM.

---

## REPI — Seed de alimentos (USDA SR Legacy) — Reporte

Fuente única: USDA FoodData Central **SR Legacy** (abril 2018), dominio público / CC0. Archivos: `food.csv`, `food_nutrient.csv`, `food_portion.csv` (+ `food_calorie_conversion_factor.csv` sólo para explicar energía). Sin APIs, sin descargas adicionales, sin Foundation Foods.

Generado por `build_seed.py` (mapeo curado en `foods_map.py`, etiquetas de porciones en `portions_es.py`) y verificado por `check_seed.py`.

## Resumen

- Entradas: **225** (rango pedido 180–230)
- Coincidencia exacta: 158 · aproximada: 67
- Estado: raw 76 · cooked 60 · na 89
- Porciones: 497 (todas de `food_portion.csv`); entradas sin porciones: 25

## Entradas por categoría

| Categoría | Entradas | Aprox. |
|---|---:|---:|
| carnes | 25 | 21 |
| aves | 11 | 0 |
| pescados | 10 | 4 |
| huevos | 5 | 0 |
| lacteos | 20 | 9 |
| cereales | 12 | 5 |
| panificados | 11 | 8 |
| pastas | 6 | 0 |
| legumbres | 13 | 0 |
| verduras | 32 | 3 |
| frutas | 19 | 0 |
| frutos-secos | 9 | 0 |
| aceites-grasas | 6 | 1 |
| bebidas | 13 | 1 |
| dulces-snacks | 17 | 4 |
| preparaciones | 12 | 10 |
| otros | 4 | 1 |
| **total** | **225** | **67** |

## Controles de calidad

| Control | Resultado |
|---|---|
| count 180-230 | OK |
| duplicate slugs | OK |
| duplicate fdcIds | OK |
| slug kebab-case | OK |
| aliases lowercase & non-empty | OK |
| valid category | OK |
| valid state | OK |
| valid match | OK |
| approx has note | OK |
| fdcId is SR Legacy | OK |
| usdaDescription matches food.csv | OK |
| energyKcal non-null | OK |
| per100g equals CSV (null only when row absent) | OK |
| Atwater 4P+4C+9F within ±20% or explained in note | OK |
| portions only from food_portion.csv (usda text + grams match a row) | OK |
| portion labels unique per food | OK |
| raw/cooked pairs present | OK |

### Energía vs Atwater (4P+4C+9F)

Tolerancia ±20 %; para alimentos con <20 kcal/100 g se acepta además una diferencia absoluta ≤5 kcal. Fuera de tolerancia (todos explicados en `note`, se conserva el valor USDA):

| slug | kcal USDA | 4-4-9 | desvío | explicado |
|---|---:|---:|---:|---|
| rucula | 25 | 30.9 | +23% | sí |
| brocoli-crudo | 34 | 41.2 | +21% | sí |
| espinaca-cruda | 23 | 29.5 | +28% | sí |
| espinaca-hervida | 23 | 29.2 | +27% | sí |
| acelga-hervida | 20 | 24.8 | +24% | sí |
| champinones-crudos | 22 | 28.5 | +29% | sí |
| limon | 29 | 44.4 | +53% | sí |
| cerveza | 43 | 16.0 | -63% | sí |
| vino-tinto | 85 | 10.7 | -87% | sí |
| vino-blanco | 82 | 10.7 | -87% | sí |
| bebida-destilada | 231 | 0 | -100% | sí |
| cacao-amargo-en-polvo | 228 | 433.3 | +90% | sí |

Causas: alcohol (cerveza, vinos, destilados: 7 kcal/g no contados por 4-4-9) y factores de Atwater específicos de USDA (verduras de hoja, brócoli, champiñones, limón, cacao: proteína 1,8–3,4 y carbohidratos 1,3–3,6 kcal/g; los carbohidratos por diferencia incluyen fibra).

### Nutrientes ausentes en SR Legacy (quedan `null`, nunca 0)

| nutriente | entradas con null |
|---|---:|
| energyKcal | 0 |
| proteinG | 0 |
| fatG | 0 |
| carbsG | 0 |
| fiberG | 4 |
| sugarsG | 7 |
| satFatG | 0 |
| sodiumMg | 0 |

Azúcares: id 2000 (Sugars, Total); se usa 1063 sólo si falta 2000.

### Pares crudo/cocido verificados

`pollo-pechuga-cruda`↔`pollo-pechuga-plancha`, `pollo-pechuga-cruda`↔`pollo-pechuga-asada`, `pollo-muslo-crudo`↔`pollo-muslo-asado`, `pollo-muslo-con-piel-crudo`↔`pollo-muslo-con-piel-asado`, `pollo-entero-con-piel-crudo`↔`pollo-entero-con-piel-asado`, `pollo-picado-crudo`↔`pollo-picado-cocido`, `carne-picada-comun-cruda`↔`carne-picada-comun-cocida`, `carne-picada-magra-cruda`↔`carne-picada-magra-cocida`, `lomo-vacuno-crudo`↔`lomo-vacuno-cocido`, `bife-de-chorizo-crudo`↔`bife-de-chorizo-cocido`, `nalga-cruda`↔`nalga-cocida`, `peceto-crudo`↔`peceto-cocido`, `vacio-crudo`↔`vacio-cocido`, `asado-de-tira-crudo`↔`asado-de-tira-cocido`, `cerdo-lomo-crudo`↔`cerdo-lomo-asado`, `cerdo-solomillo-crudo`↔`cerdo-solomillo-asado`, `bondiola-cruda`↔`bondiola-cocida`, `merluza-cruda`↔`merluza-cocida`, `salmon-crudo`↔`salmon-cocido`, `tilapia-cruda`↔`tilapia-cocida`, `langostinos-crudos`↔`langostinos-cocidos`, `huevo-entero-crudo`↔`huevo-duro`, `huevo-entero-crudo`↔`huevo-revuelto`, `milanesa-de-pollo-cruda`↔`milanesa-de-pollo-cocida`, `arroz-blanco-crudo`↔`arroz-blanco-cocido`, `arroz-integral-crudo`↔`arroz-integral-cocido`, `avena-cruda`↔`avena-cocida`, `fideos-secos-crudos`↔`fideos-secos-cocidos`, `fideos-integrales-crudos`↔`fideos-integrales-cocidos`, `pasta-fresca-cruda`↔`pasta-fresca-cocida`, `polenta-cruda`↔`polenta-cocida`, `lentejas-crudas`↔`lentejas-cocidas`, `garbanzos-crudos`↔`garbanzos-cocidos`, `porotos-negros-crudos`↔`porotos-negros-cocidos`, `porotos-blancos-crudos`↔`porotos-blancos-cocidos`, `arvejas-crudas`↔`arvejas-cocidas`, `soja-cruda`↔`soja-cocida`, `papa-cruda`↔`papa-hervida`, `papa-cruda`↔`papa-al-horno`, `batata-cruda`↔`batata-al-horno`, `zapallo-anco-crudo`↔`zapallo-anco-al-horno`, `zapallito-crudo`↔`zapallito-hervido`, `zanahoria-cruda`↔`zanahoria-hervida`, `tomate-crudo`↔`tomate-cocido`, `morron-rojo-crudo`↔`morron-rojo-salteado`, `brocoli-crudo`↔`brocoli-hervido`, `espinaca-cruda`↔`espinaca-hervida`, `acelga-cruda`↔`acelga-hervida`, `choclo-crudo`↔`choclo-hervido`, `mani-crudo`↔`mani-tostado`

### Entradas sin porciones útiles

Sólo tenían porciones en oz/lb/"yield from 1 lb" o tamaños de EE.UU. sin equivalente local; se registran por gramos: `pollo-picado-crudo`, `pollo-picado-cocido`, `carne-picada-comun-cruda`, `carne-picada-comun-cocida`, `carne-picada-magra-cruda`, `carne-picada-magra-cocida`, `lomo-vacuno-crudo`, `lomo-vacuno-cocido`, `bife-de-chorizo-crudo`, `bife-de-chorizo-cocido`, `peceto-cocido`, `cerdo-solomillo-crudo`, `cerdo-solomillo-asado`, `langostinos-crudos`, `langostinos-cocidos`, `queso-de-maquina`, `pan-frances`, `pasta-fresca-cruda`, `pasta-fresca-cocida`, `castanas-de-caju`, `semillas-de-chia`, `cafe-espresso`, `hamburguesa-casera-cocida`, `hamburguesa-congelada-cocida`, `milanesa-de-ternera-frita`

## Coincidencias aproximadas (67)

| slug | fdcId | USDA | nota |
|---|---:|---|---|
| carne-picada-comun-cruda | 174036 | Beef, ground, 80% lean meat / 20% fat, raw | Equivalencia: USDA carne picada 80% magro / 20% grasa. La picada común argentina varía en grasa. |
| carne-picada-comun-cocida | 171799 | Beef, ground, 80% lean meat / 20% fat, crumbles, cooked, pan-browned | Equivalencia: USDA carne picada 80/20 dorada en sartén. Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| carne-picada-magra-cruda | 174030 | Beef, ground, 90% lean meat / 10% fat, raw | Equivalencia: USDA carne picada 90% magro / 10% grasa. |
| carne-picada-magra-cocida | 171794 | Beef, ground, 90% lean meat / 10% fat, crumbles, cooked, pan-browned | Equivalencia: USDA carne picada 90/10 dorada en sartén. Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| lomo-vacuno-crudo | 171812 | Beef, tenderloin, steak, separable lean only, trimmed to 1/8" fat, all grades, raw | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA tenderloin. Solo parte magra (sin grasa visible separable). |
| lomo-vacuno-cocido | 171811 | Beef, tenderloin, steak, separable lean only, trimmed to 1/8" fat, all grades, cooked, broiled | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA tenderloin asado. Solo parte magra (sin grasa visible separable). Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| bife-de-chorizo-crudo | 171814 | Beef, short loin, top loin steak, separable lean only, trimmed to 1/8" fat, all grades, raw | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA top loin (strip). Solo parte magra (sin grasa visible separable). |
| bife-de-chorizo-cocido | 171813 | Beef, short loin, top loin, steak, separable lean only, trimmed to 1/8" fat, all grades, cooked, broiled | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA top loin asado. Solo parte magra (sin grasa visible separable). Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| nalga-cruda | 171757 | Beef, round, top round steak, boneless, separable lean only, trimmed to 0" fat, all grades, raw | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA top round. Solo parte magra (sin grasa visible separable). |
| nalga-cocida | 168649 | Beef, round, top round steak, boneless, separable lean only, trimmed to 0" fat, all grades, cooked, grilled | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA top round grillado. Solo parte magra (sin grasa visible separable). Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| peceto-crudo | 171762 | Beef, round, eye of round steak, boneless, separable lean only, trimmed to 0" fat, all grades, raw | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA eye of round. Solo parte magra (sin grasa visible separable). |
| peceto-cocido | 171772 | Beef, round, eye of round steak, boneless, separable lean only, trimmed to 0" fat, all grades, cooked, grilled | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA eye of round grillado. Solo parte magra (sin grasa visible separable). Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| vacio-crudo | 174776 | Beef, flank, steak, separable lean only, trimmed to 0" fat, all grades, raw | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA flank steak; el vacío argentino suele tener más grasa. Solo parte magra (sin grasa visible separable). |
| vacio-cocido | 174774 | Beef, flank, steak, separable lean only, trimmed to 0" fat, all grades, cooked, broiled | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA flank steak asado; el vacío argentino suele tener más grasa. Solo parte magra (sin grasa visible separable). Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| asado-de-tira-crudo | 170826 | Beef, chuck, short ribs, boneless, separable lean and fat, trimmed to 0" fat, all grades, raw | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA chuck short ribs deshuesadas, carne y grasa. No incluye hueso. |
| asado-de-tira-cocido | 171222 | Beef, chuck, short ribs, boneless, separable lean and fat, trimmed to 0" fat, all grades, cooked, braised | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA short ribs braseadas (no a la parrilla), carne y grasa. Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| bondiola-cruda | 167849 | Pork, fresh, shoulder, (Boston butt), blade (steaks), separable lean and fat, raw | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA paleta de cerdo (Boston butt), carne y grasa. |
| bondiola-cocida | 167850 | Pork, fresh, shoulder, (Boston butt), blade (steaks), separable lean and fat, cooked, braised | Corte argentino mapeado al corte USDA más parecido; despostes distintos. USDA Boston butt braseado, carne y grasa. Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| jamon-cocido | 173864 | Ham, sliced, regular (approximately 11% fat) | Equivalencia: jamón en fetas USDA (~11% grasa); marcas argentinas varían. |
| salchicha-viena | 172968 | Frankfurter, meat | Equivalencia: frankfurter USDA de carne; marcas argentinas varían. |
| chorizo-cerdo-crudo | 173859 | Sausage, pork, chorizo, link or ground, raw | Equivalencia aproximada: chorizo de cerdo USDA (estilo mexicano); el chorizo parrillero argentino tiene otra receta. |
| merluza-cruda | 173713 | Fish, whiting, mixed species, raw | Equivalencia: USDA whiting (incluye merluzas del Atlántico norte); no hay merluza argentina (Merluccius hubbsi) en SR Legacy. |
| merluza-cocida | 175161 | Fish, whiting, mixed species, cooked, dry heat | Equivalencia: USDA whiting cocido en calor seco. Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| langostinos-crudos | 175179 | Crustaceans, shrimp, raw | Equivalencia: USDA shrimp; el langostino argentino es otra especie. |
| langostinos-cocidos | 175180 | Crustaceans, shrimp, cooked | Equivalencia: USDA shrimp cocido. Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| leche-parcialmente-descremada | 170872 | Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D | Equivalencia: USDA leche 1% de grasa; la argentina ronda 1,5%. |
| yogur-con-frutas | 171285 | Yogurt, fruit, low fat, 10 grams protein per 8 ounce | Equivalencia: yogur USDA con fruta, bajo en grasa; marcas argentinas varían en azúcar. |
| queso-cremoso | 170845 | Cheese, mozzarella, whole milk | Equivalencia aproximada: USDA mozzarella de leche entera (alta humedad). |
| muzzarella | 171244 | Cheese, mozzarella, low moisture, part-skim | Equivalencia: USDA mozzarella de baja humedad, semidescremada. |
| queso-rallado | 171247 | Cheese, parmesan, grated | Equivalencia: USDA parmesano rallado; reggianito y sardo son similares, no iguales. |
| queso-port-salut | 170849 | Cheese, port de salut | USDA port de salut; el port salut argentino es más blando y húmedo. |
| queso-de-maquina | 171241 | Cheese, gouda | Equivalencia aproximada: USDA queso gouda. |
| queso-fresco-cuartirolo | 172223 | Cheese, fresh, queso fresco | Equivalencia aproximada: USDA queso fresco (estilo mexicano). |
| crema-de-leche | 170859 | Cream, fluid, heavy whipping | Equivalencia: USDA heavy whipping cream (~36% grasa). |
| polenta-cruda | 168867 | Cornmeal, degermed, enriched, yellow | Equivalencia: USDA harina de maíz amarilla desgerminada. |
| polenta-cocida | 171672 | Cereals, corn grits, yellow, regular and quick, enriched, cooked with water, without salt | Equivalencia: USDA sémola de maíz amarilla (grits) cocida en agua, sin sal. Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| harina-de-trigo | 168894 | Wheat flour, white, all-purpose, enriched, bleached | Equivalencia: USDA harina blanca común enriquecida. |
| copos-de-maiz | 174648 | Cereals ready-to-eat, RALSTON Corn Flakes | Equivalencia: corn flakes USDA (marca Ralston); los copos argentinos varían en azúcar. |
| granola | 171646 | Cereals ready-to-eat, granola, homemade | Equivalencia: granola casera USDA; las comerciales varían. |
| pan-frances | 172675 | Bread, french or vienna (includes sourdough) | Equivalencia: USDA pan francés/viena. |
| pan-lactal-blanco | 174924 | Bread, white, commercially prepared (includes soft bread crumbs) | Equivalencia: USDA pan blanco comercial. |
| pan-lactal-integral | 172688 | Bread, whole-wheat, commercially prepared | Equivalencia: USDA pan integral comercial. |
| tostada-pan-blanco | 174925 | Bread, white, commercially prepared, toasted | Equivalencia: USDA pan blanco comercial tostado. |
| medialuna-de-manteca | 174987 | Croissants, butter | Equivalencia: USDA croissant de manteca; la medialuna argentina es más dulce. |
| galletitas-de-agua | 171856 | Crackers, water biscuits | Equivalencia aproximada: USDA water biscuits. |
| galletitas-crackers-saladas | 172746 | Crackers, saltines (includes oyster, soda, soup) | Equivalencia aproximada: USDA saltines. |
| galletitas-integrales | 172749 | Crackers, whole-wheat | Equivalencia aproximada: USDA crackers de trigo integral. |
| zapallito-crudo | 170487 | Squash, summer, all varieties, raw | Equivalencia: USDA calabaza de verano (todas las variedades). |
| zapallito-hervido | 170488 | Squash, summer, all varieties, cooked, boiled, drained, without salt | Equivalencia: USDA calabaza de verano hervida. Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| lechuga-criolla | 169249 | Lettuce, green leaf, raw | Equivalencia: USDA green leaf lettuce. |
| margarina | 172347 | Margarine, regular, 80% fat, composite, tub, with salt | Equivalencia: margarina USDA 80% grasa en pote. |
| leche-chocolatada | 170879 | Milk, chocolate, fluid, commercial, whole, with added vitamin A and vitamin D | Equivalencia: leche chocolatada entera comercial USDA. |
| galletitas-dulces-rellenas | 172737 | Cookies, vanilla sandwich with creme filling | Equivalencia: USDA vanilla sandwich cookies. |
| galletitas-chocolate-rellenas | 172718 | Cookies, chocolate sandwich, with creme filling, regular | Equivalencia: USDA chocolate sandwich cookies. |
| budin | 172704 | Cake, pound, commercially prepared, butter (includes fresh and frozen) | Equivalencia: USDA pound cake de manteca. |
| barrita-de-cereal | 167542 | Snacks, granola bars, hard, plain | Equivalencia: USDA granola bar dura, simple. |
| pizza-muzzarella | 170317 | Pizza, cheese topping, regular crust, frozen, cooked | Equivalencia: USDA pizza de queso, masa regular, congelada y horneada. |
| empanada-de-carne | 167660 | Restaurant, Latino, empanadas, beef, prepared | Equivalencia: empanada de carne de restaurante latino (USDA); la receta argentina varía. |
| hamburguesa-casera-cocida | 171798 | Beef, ground, 80% lean meat / 20% fat, patty, cooked, pan-broiled | Equivalencia: medallón USDA de carne picada 80/20 a la plancha. Peso cocido. 100 g crudos rinden menos peso cocido; no se convierte automáticamente. |
| hamburguesa-congelada-cocida | 169447 | Beef, ground, patties, frozen, cooked, broiled | Equivalencia: USDA medallón de carne congelado, grillado. |
| milanesa-de-ternera-frita | 175271 | Veal, leg (top round), separable lean only, cooked, pan-fried, breaded | Equivalencia: USDA nalga de ternera empanada y frita en sartén. |
| milanesa-de-pollo-cruda | 171515 | Chicken breast tenders, breaded, uncooked | Equivalencia: USDA tiritas de pechuga empanadas, sin cocinar. |
| milanesa-de-pollo-cocida | 171514 | Chicken breast tenders, breaded, cooked, microwaved | Equivalencia: USDA tiritas de pechuga empanadas, cocidas (microondas). |
| papas-fritas | 170698 | Fast foods, potato, french fried in vegetable oil | Equivalencia: USDA papas fritas de fast food en aceite vegetal. |
| arroz-con-leche | 168063 | Restaurant, Latino, arroz con leche (rice pudding) | Equivalencia: arroz con leche de restaurante latino (USDA). |
| arroz-con-pollo | 167659 | Restaurant, Latino, chicken and rice, entree, prepared | Equivalencia: pollo con arroz de restaurante latino (USDA). |
| proteina-whey | 173177 | Beverages, Whey protein powder isolate | Equivalencia: whey isolate genérico USDA; cada marca difiere. |

## Criterios

- Valores por 100 g con la precisión original de SR Legacy (sin redondeo). `null` cuando la fila del nutriente no existe.
- Porciones: sólo filas de `food_portion.csv` del mismo fdcId; `grams` = `gram_weight`; `usda` = cantidad + modificador original. Se descartan oz, lb, fl oz, NLEA serving, "yield from", envases y tamaños de fast food de EE.UU.; pulgadas → cm y fl oz → ml sólo en la etiqueta.
- Cortes de carne: mapeados al corte USDA más parecido, "separable lean only" salvo bondiola/asado de tira/costillas (carne y grasa); marcados `approx`.
- Cocidos: el peso es el cocido; la app no convierte crudo↔cocido automáticamente.
- Ver `SKIPPED.md` para lo omitido y por qué.

---

## REPI — Alimentos omitidos del seed v1

Fuente única: USDA FoodData Central SR Legacy (abril 2018). Búsquedas hechas sobre `food.csv` (descripción, sin distinguir mayúsculas).

## A. Pedidos pero sin equivalente razonable en SR Legacy

| Alimento | Motivo |
|---|---|
| Mate / yerba mate (infusión) | No hay ninguna entrada de yerba mate ni *Ilex paraguariensis* (búsqueda `yerba`, `mate`, `ilex`, `paraguariensis`: 0 resultados de infusión). No se fuerza con té. |
| Tarta (de verdura, jamón y queso, etc.) | No hay tartas saladas ni quiche en SR Legacy. |
| Tortilla de papas | Sin entrada; el omelette USDA no incluye papa. |
| Ñoquis, ravioles, sorrentinos | Sin ñoquis; los ravioles sólo existen como plato de restaurante con salsa marinara (USDA 169038), no representativo. |
| Matambre | Sin corte equivalente en SR Legacy. |
| Alfajor | Sin entrada (búsqueda `alfajor`: 0). |
| Facturas (excepto medialuna) | Sólo hay croissant (usado como medialuna, `approx`). |
| Choripán, pancho completo, sándwich de miga, milanesa napolitana | Preparaciones compuestas sin entrada; se registran por componentes (chorizo, pan, salchicha, milanesa, etc.). |
| Dulce de membrillo / de batata | Sin pasta de fruta equivalente (sólo membrillo crudo, USDA 168163). |
| Locro, guiso de lentejas, chipá | Sin entrada. |

## B. Equivalente existe pero se dejó fuera de v1 por tamaño (180–230 entradas)

Candidatos verificados en SR Legacy para una ampliación futura (fdcId):

- Aves: pechuga con piel cruda/asada (171474/171075), pata con piel (172373/173612), ala (172390/173630), hígado de pollo (171060/171061), pechuga de pavo (171098/171496), pechuga hervida (171478).
- Carnes: picada especial 95/5 (171790/174028), cuadril ≈ top sirloin (174055/174054), entraña ≈ inside skirt (172137/168744), hígado vacuno (169451/168627), mondongo (170599/174769), mollejas ≈ thymus (170194/170195), cordero (172479/172480), costillas de cerdo (167853/169178), morcilla (171618), salame (174582), mortadela (174573).
- Pescados: bacalao fresco (171955/171956), trucha (173717/173718), sardinas en aceite (175139).
- Huevos: poché (172186), yema (172184), omelette (172185).
- Lácteos: leche en polvo entera/descremada (170876/172195), leche condensada (171275), parmesano en trozo (170848), queso crema light (169079), queso azul (172175), ricota descremada (171248).
- Cereales/panificados/pastas: arroz parboil (169707/169708), quinoa (168874/168917), sémola (169715), fécula de maíz (169698), pan de centeno (172684), pan multicereal (168013), pan integral casero (172690), tostada integral (172689), tortilla de maíz (175036), pan rallado (174928), fideos al huevo (169731/168926).
- Legumbres: porotos colorados (175193/173740), garbanzos en lata (173800), arvejas en lata (170013), arvejas partidas (172429).
- Verduras: coliflor, zucchini, zapallo criollo ≈ pumpkin, chauchas, espárragos, repollo, puerro, apio, ajo, rabanitos, lechuga romana/repollada/mantecosa, morrón verde, tomate triturado, choclo en lata, versiones hervidas de cebolla/remolacha/berenjena, champiñones salteados.
- Frutas: manzana sin cáscara, durazno en almíbar, melón rocío de miel, jugo de limón, cereza, damasco, higo, mamón, dátiles.
- Frutos secos: avellanas, pistachos, coco rallado, semillas de zapallo y sésamo, almendras tostadas, maní tostado salado.
- Aceites: girasol alto oleico, maíz, soja, canola, grasa de cerdo.
- Bebidas: agua, soda, té verde, manzanilla, cerveza light, bebida de soja.
- Dulces: azúcar mascabo, cacao azucarado, helado de chocolate, gelatina, galletitas con chips y de manteca, caramelos, palitos salados, bizcochuelo.
- Preparaciones: hamburguesa completa fast food (170694), panqueques (175009), papas fritas congeladas al horno (170118).

## C. Decisiones de equivalencia (incluidos como `approx`, no omitidos)

Ver la tabla de coincidencias aproximadas en `REPORT.md` (cortes vacunos, bondiola, merluza ≈ whiting, quesos argentinos, pan francés, galletitas de agua, polenta, pizza, empanada, milanesas, etc.). El dulce de leche **sí** existe en SR Legacy (USDA 173461 "Dulce de Leche") y se incluyó como `exact`.

---

## Reproducir la biblioteca

1. Descargar `FoodData_Central_sr_legacy_food_csv_2018-04.zip` de https://fdc.nal.usda.gov/download-datasets/ y descomprimirlo en una carpeta propia (es dato externo: no correr nada desde esa carpeta).
2. `python3 -I scripts/nutrition/build_seed.py <carpeta SR Legacy> <carpeta de salida>` → `foods.json` y `checks.json` (mapeo curado: `scripts/nutrition/foods_map.py`; etiquetas de porciones: `portions_es.py`).
3. `python3 -I scripts/nutrition/check_seed.py <carpeta SR Legacy> <carpeta de salida>` → sale con error si falla algún control.
4. `python3 -I scripts/nutrition/gen_foods_ts.py <carpeta de salida>/foods.json packages/domain/src/nutrition/foods.ts` y subir `FOODS_VERSION` si cambian valores. Los registros ya hechos guardan su copia: una versión nueva no los reescribe (corrección explícita por registro).
