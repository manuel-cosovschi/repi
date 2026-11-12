# REPI — Smart Program Import 2.0 (D207)

Incorporar a REPI una rutina que ya existe, con el mínimo trabajo manual y **sin inventar datos**. Mismo motor para el alumno
(«Mis rutinas»), el coach (programa nuevo sin asignar) y el gimnasio (borrador del programa de un socio). Reemplaza la lectura de
D162/D184 sin cambiar las demás importaciones: historial anterior (D132), CSV de clientes y «Armar con REPI» son otras funciones.

## Regla de oro: importar es transcribir

Cada dato queda en uno de tres estados:

- **Leído:** con el renglón o la fila original como evidencia («Leído de: …»).
- **Dudoso:** se marca para revisar y se confirma con «Está bien» o editándolo. Ejemplos: «4x??», «6?», «20 kg por lado», un número suelto en un archivo en libras, o series que la IA dio sin números en el renglón.
- **Ausente:** queda vacío y marcado.

FSA1 (09/11/2026): en lo que lee la IA, una serie, repetición o carga que no figura en el renglón citado («Leído de: …») o lo contradice queda **dudosa**, nunca como leída. La respuesta de la IA se valida: una estructura distinta de la pedida responde `ai_bad_output` (con lo leído directo como alternativa) y un campo con otro tipo queda ausente. El borrador se escribe también al tocar «Guardar» y al cerrar o recargar.

Nunca se completa con «3 × 10». «Completar lo que falta con 3 × 10 (sugerido)», o «3 × 10 y 90 s» en programas, es un toque explícito. El campo queda punteado y con el texto «Sugerido (no estaba en el documento)».

No hay porcentajes de confianza: no están calibrados.

## Qué reconoce

| Entrada | Cómo se lee |
| --- | --- |
| Texto pegado (notas, WhatsApp, correo) | Determinístico, sin IA. Saca los prefijos de WhatsApp (`[fecha, hora] Nombre:` y `fecha hora - Nombre:`), negritas, viñetas, numeración y emojis. Un saludo o una frase de chat no se toma como ejercicio |
| CSV, Excel (.xlsx) y OpenDocument (.ods), una o varias hojas | Se convierten a CSV en el teléfono (D140) y se leen sin IA. El encabezado puede no estar en la primera fila. Columnas en español o inglés. Unidad en el encabezado («Peso (lb)»). Columnas «Serie 1, 2…» con «12 x 40 kg». Filas «DÍA 2» dentro de la hoja. Una hoja por día o por semana. Sin columnas reconocibles, la hoja se lee como texto |
| Fotos, capturas, PDF y texto que no alcanza | OpenAI (el mismo proveedor y modelo ya configurados) con esquema JSON estricto. Lo que devuelve pasa por las mismas reglas (`fromAiExercise`) |

**Estructura:**

- Días en orden: «Día 1», «Día A», días de la semana, «Pecho y tríceps:» y grupos musculares.
- Secciones del día: entrada en calor, bloques, core.
- Varios programas o semanas en un documento: se elige cuál cargar.
- Indicaciones generales.

**Por ejercicio:**

- Series × repeticiones en todas sus formas: «4x10», «4 × 10», «4 series de 10», «3 sets of 12», «4x8-10», «4 x al fallo», «3x30s», «Cinta 10 min».
- Cargas en kg o lb (conversión exacta y aviso), con coma decimal.
- Descanso («desc 90s», «1'30», «2 min»), RIR, RPE, tempo y notas técnicas.
- La prescripción en el renglón siguiente («Press plano (105kg)» y debajo «5;5;5;4»).
- **Valores por serie:** «3 x 12/10/8 30/35/40 kg», «12-10-8-6 60-70-80-90 kg» y columnas por serie se guardan serie por serie (`setPlan`), no se promedian.

**Métodos:**

- Drop set, rest-pause, myo-reps, cluster, top set + back-off, pirámides, EMOM y AMRAP. Se detectan con `detectMethod` y se aplican con `applyMethod`, como en el constructor. Lo ambiguo («pirámide», «drop» suelto) se pregunta.
- Superseries A1/A2, triseries y circuitos (un encabezado «Circuito x3:» agrupa los ejercicios siguientes con sus vueltas).

**Ejercicios:**

- **Coincidencias determinísticas:** nombre, abreviaturas («c/», «manc», «máq», «ext.», «elev.»), plurales, orden de palabras, nombres en inglés y en el habla argentina («camilla de isquios», «sillón de cuádriceps»). El nombre de la biblioteca sin su paréntesis también cuenta: «Aperturas en máquina» encuentra «Aperturas en máquina (pec deck)».
- **Nunca confunde variantes:** plano o inclinado; libre, Smith o máquina; barra, mancuernas o polea; sentado o acostado.
- **Propuestas de la IA:** se descartan si agregan o contradicen una variante («Remo» → «Remo en máquina» no).
- **Varias posibilidades:** se ofrecen alternativas para elegir con un toque.
- **Si no existe:** se crea con los permisos de siempre (alumno: propio; coach o gimnasio: de la organización), sin duplicar nombres.

## Experiencia

1. **Entrada:** archivo o texto. El aviso de procesamiento externo se muestra antes de subir.
2. **Lectura:** estado por etapas, «Cancelar» y «Reintentar» con el mismo archivo.
3. **Revisión:** resumen («2 días · 5 ejercicios · 3 listos · 3 para revisar»). Cada ejercicio va en una fila compacta con un punto verde o naranja. Sólo se abren las filas que tienen algo para revisar, y está el filtro «Ver sólo lo que falta revisar».
4. **Corrección:**
   - En línea: series, repeticiones, carga, descanso y la tabla por serie.
   - «Método y series», con el editor del constructor.
   - Cambiar o crear el ejercicio, ordenar con ↑ ↓, quitar ejercicios o días y renombrar días.
5. **Guardar:** si falta algo, el botón dice qué y lleva al ejercicio (no queda apagado sin explicación).

**Detalles de la revisión:**

- **Borrador:** se guarda en el teléfono mientras se revisa (3 días). Al volver, «Seguir revisando» o «Descartar». También guarda lo escrito un instante antes de cerrar.
- **Diseño:** claro, oscuro y automático con los tokens `--ui-*`; Barlow. A 320 px no hay scroll horizontal.
- **Accesibilidad:** axe sin violaciones en los dos temas.

## Destinos

- **Alumno:**
  - `POST /api/me/routines/import` devuelve la vista previa.
  - `POST /api/me/routines/import/save` guarda **todos los días en una transacción**. Si un día es inválido o no hay lugar, no se guarda ninguno y se dice cuántas rutinas entran.
  - Es idempotente por `opId` (lock por persona e índice único), así un corte de red o un doble toque no duplican.
  - Cada día queda como rutina propia, en orden y marcada «importada». Se edita, duplica y entrena como cualquier otra; lo registrado alimenta el historial y el progreso.
- **Coach:** «Importar programa» en «Mis programas» crea un **programa nuevo sin asignar**: el mismo `createTemplate`, versionado como siempre e idempotente por `opId`. Nunca toca programas existentes ni de alumnos.
- **Gimnasio** (`program.edit`): «Importar programa» en el editor del programa de un socio reemplaza el borrador, con confirmación si tenía contenido y motivo precargado. Se guarda recién con «Guardar revisión» (versión nueva con su autoría). Leer no versiona nada.

No hay un segundo constructor: el resultado entra al editor de siempre.

## Seguridad, privacidad y costos

- **Archivo:**
  - El tipo se comprueba por su firma (JPEG, PNG, WEBP, GIF, `%PDF-`), además del tipo declarado.
  - Límites: 400.000 caracteres de texto, imágenes reducidas a 2000 px, PDF de hasta 3 MB, planillas de hasta 5 MB y 5000 filas.
  - Si se supera el tope de días o ejercicios, se rechaza entero con un mensaje claro. Nada se recorta en silencio: un día largo se parte en partes y se avisa.
- **IA:**
  - El documento va entre marcas, como dato. El sistema indica que no se sigan instrucciones del documento y que se avise de texto ajeno.
  - El modelo no tiene herramientas y la respuesta tiene esquema estricto, se valida y no se usa sin revisión.
  - Si la respuesta queda incompleta, no se carga nada (`ai_incomplete`).
  - Si la IA no está o falla, se devuelve lo que se pudo leer directo, marcado; si no hay nada, un error claro.
- **Aislamiento:** biblioteca visible de la persona u organización (`visibleIn`). Un ejercicio de otra organización no se propone ni se puede guardar.
- **Costos:**
  - Sin IA para planillas y textos claros, sin tope de IA.
  - Con IA: 30 lecturas por hora por IP y 20 por día por persona (alumno) o 30 (staff).
  - Sin servicios ni modelos nuevos.
- **Datos:**
  - El archivo original **no se guarda**.
  - Los registros de error no llevan contenido.
  - Las claves sólo están en el servidor.

## Preparación para Adaptive Coaching 3.0

`own_routine.origin` (0049, aditiva) guarda una vez, inmutable, lo que decía el documento por ejercicio:

- valores y valores por serie;
- `unknown`: lo que faltaba;
- `completed`: lo completó la persona;
- `suggested`: se usó el sugerido.

También guarda `opId`, la fuente y el archivo. No es una segunda fuente de verdad. Adaptive Coaching 3.0 puede distinguir:

| Pregunta | Fuente |
| --- | --- |
| Qué indicó el programa importado | `origin.exercises` |
| Qué cambió después la persona | `exercises` (vigente) contra `origin` |
| Qué se ejecutó y con qué cargas | `workout_session` / `set_log` (`source: "own"`) |
| Versión vigente | la rutina (alumno) o `program_version` (coach y gimnasio) |
| Qué quedó desconocido o sin confirmar | `origin.exercises[].unknown` y `suggested` |

En los programas del coach, `audit_event` (`program.imported`) guarda `opId`, la fuente y el tamaño. El documento importado es la versión 1 del programa.

## Limitaciones reales

- **Requieren IA:** fotos, capturas y PDF (no hay OCR local). Sin la clave de OpenAI configurada, sólo se leen planillas y texto.
- **Sin calendario semanal:** la distribución semanal explícita queda en el nombre de cada día; el orden de los días define cuál toca.
- **Semanas:** un documento con varias semanas distintas se carga de a una (se elige cuál); no hay periodización por semanas.
- **Formatos sin soporte:** Numbers y .xls viejos se piden exportados (como antes).
- **«10x40» sin unidad** en una celda de serie es ambiguo y se marca; no se adivina el orden.
- **Distancia y duración** quedan como texto en las repeticiones («400 m», «10 min»).

## Pruebas

**Automáticas:**

- **`packages/domain/src/program-import.test.ts`:** reglas, por serie, libras, métodos, IA normalizada, emparejamiento y variantes.
- **`program-import.fixtures.test.ts`:** documentos ficticios de `packages/domain/fixtures/import/`, casos 1, 2, 4, 6-10, 13-18, 21 y seguridad.
- **`apps/web/tests/program-import.test.ts`:**
  - todo o nada, `opId` y concurrencia, capacidad, otra organización;
  - Excel real convertido como en el teléfono;
  - IA simulada con *prompt injection*, respuesta incompleta, falla con alternativa y varios programas;
  - firma de archivo;
  - coach sin asignar e idempotente;
  - gimnasio sin versionar al leer;
  - entrenar la rutina importada y verla en el progreso.

**QA visual** con la demo local:

- alumno con corte de red simulado al guardar (sin duplicar), borrador recuperable, Excel en modo oscuro y 320 px;
- coach: dos programas, alternativas de «Remo», carga en el plan y programa sin asignar;
- gimnasio: borrador sin guardar.
