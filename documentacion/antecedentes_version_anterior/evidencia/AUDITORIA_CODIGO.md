# Auditoría independiente del código REPI

Fecha: 2026-10-25. Fuente congelada: `fuentes/REPI_COMPLETE_DESIGN_HANDOFF/`. Auditoría de código sin modificar los prototipos, sin efectuar operaciones externas y sin abrir navegador desde este agente. Las referencias `archivo:línea` son relativas a esa fuente; no remiten a una implementación inferida de los documentos.

## Dictamen

La entrega contiene un conjunto de demostradores de interfaz, con lógica React local sustancial, y no una aplicación de producto conectada. Hay 8 HTML: 5 vigentes y 3 legacy. Siete definen lógica `Component`; el escritorio legacy no la define. Hay 3 archivos JS físicos: dos copias idénticas de `support.js` y un `repi-shared.js`. No se encontró servidor, esquema de base de datos, cliente de autenticación, router de producto, SDK de pagos ni API de producto en esta fuente.

La distinción central es entre **interacción local real** —editar valores, temporizar, filtrar, crear objetos en memoria, renderizar WebGL, guardar archivos de prueba en IndexedDB— y **resultado de producto simulado** —sesiones guardadas, coach que responde, fotografías cifradas, permisos aplicados a un usuario autenticado, pagos realizados, importaciones, emails—. Una pantalla navegable no acredita el segundo nivel.

`screens.json` enumera 97 entradas: 73 `interactive_prototype`, 19 `specified_not_designed`, 2 `partially_designed`, 2 `future_concept`, 1 `static_mockup`. `features.json` enumera 93: 63 interactivas, 22 especificadas sin diseño, 6 parciales, 1 diseñada, 1 estática. Son categorías documentales; no equivalen a porcentajes de implementación. Los HTML vigentes tienen 39 marcadores `data-screen-label`; los 3 legacy suman 18 más. Los marcadores tampoco equivalen a pantallas independientes porque tabs, estados y overlays se anidan.

## Método y evidencia reproducible

Se inspeccionaron los 8 HTML, ambos runtimes y el store compartido; se contrastaron exclusivamente `screens.json`, `navigation.json` y `features.json` para identificar la correspondencia documental. El inventario complementario `INVENTARIO_CODIGO_PANTALLAS.json` contiene por archivo el hash SHA-256, cantidad de líneas, etiquetas de pantalla, condiciones `sc-if`, controles, bindings de clic y referencias `src`/`href`, con sus líneas. No se ejecutaron cargas de red ni se alteró el almacenamiento real del navegador.

`PRUEBAS_LOGICA_CODIGO.json` documenta compilación y ejecución aislada de la lógica en Node `vm`, con `DCLogic` mínimo, estado reemplazado sincrónicamente, temporizadores sin ejecución, sin DOM real y sin acceso al almacenamiento del usuario. No reemplaza pruebas integrales de React ni verificación visual. Confirma cuatro defectos de lógica y el mecanismo de un quinto: rutina equivocada, alta Admin con referencia obsoleta, asignación de programa compartida, reseña retirada que sigue contando y reemplazo de store ante doble ejecución. Los 7 scripts de componentes compilan y devuelven valores de render iniciales bajo esas condiciones; el legacy incompleto no tiene script.

## Stack y dependencias efectivamente presentes

| Elemento | Evidencia y alcance |
|---|---|
| HTML y CSS inline | Todos los `.dc.html`; `<x-dc>`, `<sc-if>`, `<sc-for>`, `<helmet>` y expresiones `{{...}}` interpretadas en runtime. |
| React 18.3.1 / ReactDOM 18.3.1 | `prototypes/support.js:1143`, `:1145`, arranque `:1841`. Dependencias UMD de unpkg con SRI para esos scripts. |
| Runtime DC | `support.js:24` parsea plantilla; `:844` construye la clase con `new Function`; `:1898` expone `DCLogic`. Es código generado; el directorio fuente `dc-runtime` mencionado en `:1` no está incluido. |
| Babel standalone 7.29.0 | URL declarada en `support.js:1147`; carga condicional para módulos JSX en `:1176`, `:1200`. Declaración no demuestra que se descargue en todas las visitas. |
| Three.js 0.160.0 | Import dinámico en Alumno v3 `:1110`, legacy v2 `:979`, legacy v1 `:832`. Geometría construida localmente; sin servicio de reconstrucción. |
| Google Fonts | Cada HTML carga Inter Tight y JetBrains Mono; por ejemplo Alumno v3 `:11–12`. |
| Web Animations API / ResizeObserver | Animaciones en Alumno v3 `:985`; layout desktop Coach `:372`, Gym `:965`, Admin `:241`. |
| localStorage e IndexedDB | `repi-shared.js:4`, `:32–44`; intro Alumno v3 `:976`. Persistencia en el navegador y mismo origen, sin sincronización entre dispositivos. |

Los `fetch` presentes en `support.js:159`, `:1206`, `:1651` cargan el propio HTML/componentes o módulos del runtime; no son endpoints de entrenamientos, usuarios, pagos o salud. No se localizaron `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, service worker ni SDK de proveedor de negocio en la lógica de los HTML. Las dependencias CDN y fuentes sí generan tráfico externo al abrir las páginas. Esta conclusión describe la fuente entregada, no posibles sistemas ajenos a ella.

## Inventario funcional por prototipo

| Archivo | Vistas existentes en código | Operaciones reales locales | Límites comprobados |
|---|---|---|---|
| `prototypes/REPI App Alumno v3.dc.html` | Inicio, semana, entrenamiento, resumen, 4 tabs de progreso, BI con 9 pasos/estados, comparación, mensajes, perfil, 4 tabs gym, subir intento, notificaciones, logro, intro. | Steppers y series en memoria; descanso por timestamp; WebGL con selección/rotación/zoom; edición manual y toggles en memoria; selección real de video y guardado IndexedDB; consumo del store gym. | Sin sesión de usuario, almacenamiento de entrenamiento, fotos reales de BI, email, push, backend ni API de coach. |
| `prototypes/REPI Desktop Gym.dc.html` | 19 vistas principales con marcador; 8 modales y selector de espacio/roles. | Filtrar, turnos/tareas/notas/traspasos/programas/reseñas/moderación en memoria; publicaciones, desafíos y catálogo en localStorage; validación y lectura de videos IndexedDB. | Roles son personajes de demo; parte de métricas son constantes; acciones de importación y configuración de pagos sólo cambian estado; persistencia operativa ausente. |
| `prototypes/REPI Desktop Coach.dc.html` | 5 vistas principales; 8 tabs de ficha y modal de asignación. | Búsqueda/filtros, constructor, biblioteca fija, asignación por IDs, duplicado, chat y registro de pago en memoria. | 6 clientes seed aunque el encabezado suma 13; sin invitación de clientes, chat remoto, agenda real, cobranzas ni sincronización con app. |
| `prototypes/REPI Admin.dc.html` | 5 vistas y modal de nuevo cliente. | Calculadora de precios, filtros, edición y marcas de cobro en memoria. | Planes por defecto son estáticos; alta tiene error de lógica; no facturas fiscales, checkout, cobro automático o persistencia. |
| `prototypes/REPI Motion Intro.dc.html` | Tres conceptos animados, modos primer inicio/regular/reducido y cámara lenta. | Animaciones reales Web Animations API, replay y cambio de modo. | Demostrador de marca, sin flujo de producto conectado. Dos conceptos existen aunque el catálogo los clasifica `future_concept`. |
| `prototypes/legacy/REPI App Alumno v2.dc.html` | 9 marcadores; app previa con BI, entrenamiento, mensajes y privacidad; sin Gym v3. | Lógica local de entrenamiento/BI e intro. | Comparte los límites de persistencia/BI de v3. `repi_intro_seen` comparte clave con v3 si se sirve bajo mismo origen. |
| `prototypes/legacy/REPI App Alumno v1.dc.html` | 9 marcadores; app previa a intro de marca y Gym. | Lógica local de entrenamiento/BI y mensajes. | Reloj/PR anteriores; ver apartado legacy. |
| `prototypes/legacy/REPI Escritorio (incompleto).dc.html` | HTML de escritorio unificado con expresiones y modales. | No hay lógica de componente entregada. | Los `onClick="{{...}}"` no tienen `Component` que los resuelva. El archivo termina en `:915–917` sin `data-dc-script`. No debe presentarse como demostrador operativo. |

Correspondencia: las 25 entradas móviles del catálogo tienen representación en pasos/estados del v3; las 28 de Gym tienen representación entre vistas/modales/selector; 14 de las 15 asignadas a Coach tienen interfaz, y la restante `SCR-N-05` sólo tiene una biblioteca embebida de 15 nombres, no el CRUD especificado; las 6 de Admin existen, con planes estáticos; los 3 conceptos motion existen. Son 76 correspondencias de UI vigentes, contando estados/tabs/modales y los conceptos futuros. No son 76 rutas de aplicación ni 76 funcionalidades conectadas.

## Hallazgos priorizados

Severidad: **Alta** compromete un flujo principal o una afirmación sustantiva; **Media** produce resultados incorrectos o deja incompleta una interacción; **Baja** es mantenimiento/robustez. La severidad evalúa riesgo de presentar o reutilizar estos demostradores como implementación; no supone despliegue productivo ni exposición pública actual.

### C01 · Alta · «Guardado» no guarda entrenamientos

Alumno v3 `:195` muestra permanentemente «● Guardado». Las series y sesión viven en `state` (`:928–945`); `editSet` y `completeSet` sólo usan `setState` (`:1222–1240`); `finishWorkout` sólo cambia `screen` (`:1491`). La única escritura directa de localStorage en este HTML corresponde a la intro (`:976`); el store compartido carece de clave para entrenamientos (`repi-shared.js:4`). Recargar pierde el entrenamiento editado. No hay autosave, cola offline, reintento, clave idempotente ni sincronización. `F-CL-03`/`SCR-M-04` son interactivos, pero la señal visual no evidencia persistencia. `F-CL-07` y `SCR-N-17` ya figuran pendientes en el catálogo.

### C02 · Alta · Iniciar Piernas o Torso B ejecuta Torso A

El día seleccionado muestra `WORKOUTS[dw]` (`Alumno v3:877–885`, `:1484`), pero `startWorkout` sólo cambia de pantalla (`:1309`), y `state.ex` siempre comienza en `EX0()` (`:929`). Prueba aislada: elegir índice 2 (miércoles/Piernas) e iniciar produce `Press de banca`, cuando el detalle prescribe `Sentadilla`. El mismo inicio tampoco reinicia los ejercicios completados ni el tiempo; una nueva sesión conserva la anterior dentro de esa carga. Es defecto de demostración y no simplemente ausencia de backend.

### C03 · Alta · Crear cliente Admin usa un snapshot anterior y falla

`open` captura `s.clients` (`Admin:271`). `createNew` en `:310` solicita agregar `c` y enseguida llama a ese `open(id)`. La búsqueda en el arreglo anterior devuelve `undefined`, y `JSON.parse(JSON.stringify(c))` lanza. La prueba aislada arroja `"undefined" is not valid JSON`, deja 9 objetos en estado y la pantalla en `overview`; en React el mensaje exacto puede variar. Separar la inserción de la apertura o pasar el nuevo objeto evita la referencia obsoleta; aquí sólo se informa, sin editar el prototipo.

### C04 · Alta · Asignar programa comparte el objeto pese a prometer copias

La UI dice «Cada cliente recibe su propia copia» (`Coach:326`). `doAssign` sólo asigna `prog: x.pgId` a todos los clientes (`:520`); `setPg` reemplaza ese único programa (`:385`), y la ficha lo resuelve con `s.pgs[cl.prog]` (`:450`). Prueba aislada: asignar `p1` a c1/c2 y editar el nombre cambia ambas fichas. No hay copia por alumno ni aislamiento de ajuste individual. La fecha de inicio elegida se usa en el toast pero tampoco se guarda en el cliente/asignación (`:518–520`).

### C05 · Alta · Fotos BI, chequeo de calidad, cifrado y reconstrucción son simulados

La propia pantalla aclara «Cámara simulada» (`Alumno v3:522`). `shoot` sólo marca booleanos de poses y fuerza una foto borrosa en la tercera pose la primera vez (`:1387–1392`). No usa cámara, FileReader ni blobs de fotos. `process` suma 5 cada 110 ms y decide éxito o fallo por `method` (`:1394–1404`), mientras informa «Cifrando y subiendo fotos…» (`:1406`). El método 3D termina siempre en fallo; no analiza imágenes. `F-BI-05` pide cámara real en acceptance y su status interactivo describe el flujo, no esa capacidad. El único archivo real capturable en el v3 es un video para desafíos (`:807`, `:1262–1288`), separado de BI.

### C06 · Alta · Promesa «privado por defecto» contradicha por medidas compartidas al inicio

Consentimientos de almacenamiento empiezan todos en false (`Alumno v3:932`), pero `share.medidas` empieza true y el log contiene compartición/lectura previas (`:942–943`). `shareRows` considera medidas siempre almacenadas aunque no haya consentimiento (`:1410`) y permite compartirlas. La introducción dice que nada se comparte sin permiso (`:1529`). Son datos ficticios y no se detectó envío externo, pero el flujo y la inicialización no modelan fielmente esa regla. Además, cambiar permisos en app no cambia los `CL0.share` independientes del Coach (`Coach:354–360`): no hay revocación efectiva entre prototipos.

### C07 · Alta · Aislamiento y permisos son presentación local

No hay login ni autorización de servidor. Gym elige `persona` desde un listado de personajes (`Gym:882–887`, `:1037–1038`), y `go` permite cambiar `screen` sin verificación general (`:989`). El estado contiene todos los socios/roles y el navegador puede leerlo. Coach incluye datos seed de salud y nutrición, ocultos visualmente según flags (`Coach:404–435`). Las negativas de acceso y filtros son útiles para diseñar, pero no son controles efectivos para información real. `SCR-N-02` documenta la autenticación como no diseñada. No se halló información de usuarios reales ni credenciales en la fuente.

### C08 · Alta · No hay pagos, facturación o cobros reales

Coach `:527` y Admin `:331`, `:358` registran «pagado» mediante `setState`. Son marcas manuales temporales; no solicitudes a un procesador ni comprobantes persistidos. Gym facturación calcula una muestra (`:1259–1267`) y modo integrado sólo cambia estado con toast de simulación (`:1272`). No hay Mercado Pago/Stripe, webhook, checkout, emisión fiscal ni conciliación. El catálogo reconoce `SCR-N-14` como especificado sin diseño. La funcionalidad real existente es una calculadora y un registro de estado demostrativo.

### C09 · Alta · Store compartido puede dejar la pestaña emisora desactualizada

Hallazgo observado en revisión de navegador por el agente principal: publicar desde Gym mostró éxito; otra pestaña Alumno recibió la publicación, mientras Gym conservó las tres semillas. La fuente presenta un mecanismo compatible reproducido aisladamente: `repi-shared.js` no tiene guard de inicialización; cada ejecución crea un nuevo `Set` (`:29`) y reemplaza `window.RepiShared` (`:50`). El script está dentro de `<helmet>` en Gym `:21` y Alumno `:20`, y el runtime reinserta scripts de helmet en `<head>` (`support.js:1437–1446`). Si la suscripción de `componentDidMount` (`Gym:971`, `Alumno:964`) queda en la primera instancia, los handlers leen la segunda y notifican otro Set. Una escritura local no genera `storage` en la misma pestaña; una remota sí puede actualizar el store anterior (`repi-shared.js:49`). Prueba aislada de doble ejecución: datos guardados, 0 notificaciones locales al suscriptor antiguo, 1 tras evento remoto. La causalidad exacta del orden de carga real requiere instrumentación adicional; el síntoma de navegador y el mecanismo probado se mantienen diferenciados.

### C10 · Media · Fallar localStorage produce éxito falso

`RepiShared.set` captura errores de almacenamiento y sólo hace `console.warn`, luego notifica a listeners (`repi-shared.js:33`). `publishPost` siempre borra el borrador y confirma «Publicado» (`Gym:1307`). Si la cuota está llena o el almacenamiento no está disponible, se pierde el borrador sin persistencia ni error visible. Las imágenes comprimidas como data URL ocupan la misma cuota (`repi-shared.js:45–46`). Este defecto existe independientemente de C09.

### C11 · Media · Moderación no actualiza métricas coherentemente

`Gym.metr` suma toda reseña `fresh` del entrenador sin filtrar `st` (`:1004–1006`); `resolve` puede cambiarla a `removed` (`:1388–1391`). Prueba aislada: una reseña nueva ya retirada hace subir rn de 22 a 23. El resto del histórico de satisfacción viene de constantes `TRS.rn/ra`, no de las reseñas listadas. Moderar una seed tampoco recalcula el agregado original. La definición en `:945` dice explícitamente que las retiradas no cuentan. Cambiar período sólo multiplica datos por `.23`, `1` o `3` (`:867`, `:1003`), sin filtrar fechas.

### C12 · Media · Eliminar BI no elimina sus valores ni consentimientos

`deleteBody` sólo cambia `bodyOn/bodyStep` y desactiva compartir fotos/scan (`Alumno v3:1576`); conserva `manual`, `consent`, permisos de medidas y el log. La UI sí etiqueta «simulado», pero sería incorrecto considerar este flujo una baja de datos implementada. `exportData` sólo muestra un toast y promete email simulado (`:1574`). No hay archivo de exportación ni correo.

### C13 · Media · Videos de prueba quedan después de restablecer comunidad

`RepiShared.reset` sólo quita las cinco claves localStorage (`:36`); no limpia el object store `repi_proofs/videos` (`:40–44`) ni ofrece borrar un video. Rechazar/aprobar tampoco elimina blobs (`Gym:1293–1295`). Una prueba cargada puede quedar huérfana tras reset o eliminación de desafío. No hay políticas de retención, segregación por gym o usuario, ni borrado integral. Las metadata usan claves globales de origen, no un namespace por organización (`repi-shared.js:4`); el alumno se identifica por nombre fijo `Valentina G.` (`Alumno v3:922`).

### C14 · Media · Comparación corporal y progreso usan datos seed

Las curvas de fuerza son arrays fijos, y cambiar ejercicio suma un offset fijo (`Alumno v3:887–892`, `:1340–1350`). Barras de volumen y adherencia son constantes (`:1514–1515`); no derivan de las series recién registradas. Las medidas mostradas en Progreso son constantes (`:1516–1521`), aun después de editar `manual`. Las fechas de comparación y sus deltas son constantes (`:1368–1369`); el slider modifica una máscara de interfaz, no compara dos reconstrucciones del usuario. Gym expone buena contextualización de métricas, pero los históricos y KPIs también combinan semillas/constantes (`:870–879`, `:1248`).

### C15 · Media · «Avatar ajustado» sólo cambia la etiqueta

El parámetro `bodyModel` elige texto en `Alumno v3:1553`. La construcción geométrica usa esferas, cilindros y cajas de dimensiones fijas (`:1134–1155`); no lee `manual` ni fotos. Rotar/zoom/seleccionar zonas sí funciona localmente (`:1162–1184`), pero no demuestra un avatar personalizado. La exposición por región usa constantes `REGIONS` (`:893–902`), no recomputa entrenamientos.

### C16 · Media · Campana de Progreso abre Mensajes

En `Alumno v3:330` el botón tiene `aria-label="Notificaciones"` y dibuja campana, pero su handler es `goMsgs`; `goMsgs` cambia a `msgs` (`:1474`). El inicio usa `openNotifs` (`:68`) y tiene hoja real de notificaciones. Es un destino inconsistente dentro del mismo prototipo.

### C17 · Media · Mensajería e invitaciones no conectan personas

Enviar en Alumno agrega texto en memoria y programa respuesta fija 1,4 s después (`:1422–1426`). Coach guarda su propio arreglo (`Coach:458`) sin consumir el alumno; no existe canal entre ambos. `askAccess` sólo afirma haber enviado una solicitud en toast (`Coach:492`). Invitación a reseña Gym vive en el propio estado (`Gym:999`, `:1337`); su maqueta de teléfono no está renderizada en las vistas actuales como una app externa conectada. Notificaciones del store de desafíos son locales al origen, no push.

### C18 · Media · Formularios validan una parte y no un dominio completo

Medidas manuales aceptan `e.target.value` sin comprobación de número, rango, vacío ni fecha de medición (`Alumno v3:1540`); `saveManual` siempre acepta (`:1542`). Coach series usan `Number(...) || 1` sin impedir negativos (`:508`); Gym usa patrón similar (`:1363–1365`). Admin valida nombre, pero no CUIT (`:310`); permite editar inicios de tramos sin asegurar unicidad/continuidad (`:336–339`). Son validaciones de demostración, no reglas de dominio completas.

### C19 · Media · Subida real de video sin límites de archivo ni coherencia del intento

`pickVideo` acepta el primer archivo y crea URL (`Alumno v3:1262`) sin validar tamaño, duración o MIME en lógica; `accept="video/*"` es una ayuda de selector, no verificación. `submitUp` sólo exige archivo, marca >0 y checkbox (`:1278–1288`). IndexedDB guarda localmente el blob y el progreso de «subida» está animado después del guardado; no hay transferencia a un servidor. Gym deja aprobar seeds sin video (`:1321–1323`) y no exige reproducción antes de aprobar. Aprobar cualquier marca genera logro aunque no supere el récord (`:1292–1295`, Alumno `:1247–1250`); el overlay puede decir «¡Récord validado!» aun cuando `newRecord` es false (`Alumno:958–959`).

### C20 · Media · Modelo de facturación es provisional e inconsistente entre demos

Admin estima pico como `round(actual × 1.04)` y promedio como media de los dos últimos meses (`Admin:253`), aunque la UI los describe como máximo del período y promedio diario (`:343`). Editar tarifa recalcula cobros históricos usando el contrato nuevo (`:326`, `:354`), sin snapshot inmutable. Gym calcula además un extra fijo `140 × 60` (`Gym:1262`) y usa definición de facturable distinta seleccionable (`:1264`); Admin y Gym no comparten contrato/estado. Es una calculadora ilustrativa, no contabilidad consistente.

### C21 · Media · Mobile alumno no es responsive al ancho del dispositivo

Aunque todos los HTML declaran viewport, el v3 dibuja un teléfono `width:414px;height:868px;flex:none` y una pantalla interna de 390×844 (`Alumno v3:47–48`), dentro de padding horizontal de 24px (`:22`). En un viewport menor que el contenedor habrá desborde horizontal; el flex-wrap sólo reubica el panel explicativo. Legacy v1/v2 usa la misma maqueta. Esto no acredita una app móvil adaptable; es una presentación de teléfono con scroll interior.

### C22 · Media · Admin no cumple drawer móvil declarado en navigation.json

Coach y Gym implementan modos full ≥1100, rail ≥768 y drawer inferior (`Coach:439`, `Gym:1017–1019`), con ResizeObserver. Admin sólo tiene `navFull = vw >=1100` y `navRail=!navFull` (`Admin:267`, `:285`); su aside siempre se renderiza (`:23`). El ancho 72px permanece en móvil; no hay hamburguesa/drawer. Las tablas principales recurren a scroll horizontal; el comportamiento visual exacto debe contrastarse en navegador.

### C23 · Media · Interruptores y checkboxes de div no funcionan con teclado

Los 6 switches de consentimiento (`Alumno v3:463`), compartir (`:698`) y celebraciones (`:711`) son divs onClick sin tabindex ni handler de teclado. El checkbox de confirmación de video es enfocable, pero no atiende Espacio/Enter (`:812`). Gym repite ese patrón en traspaso (`:255`), responder reseñas (`:646`) y completar tarea desde modal (`:804`); Coach en selección de clientes (`:328`). `support.js` mapea eventos React normales (`:322`) y no agrega activación por rol ARIA. Los botones nativos sí tienen comportamiento de teclado; no se debe extender el defecto a todos los controles.

### C24 · Media · Modales sin gestión completa de foco y overlays sin semántica

Gym `:770`, Coach `:324` y Admin `:199` declaran `role=dialog` y `aria-modal`, y desktop permite Escape. No se encontró transferencia automática de foco al abrir, trampa de foco, `inert` del fondo o restauración al cerrar; el único `.focus()` explícito del Coach sirve para el nombre de día (`:501`). La comparación móvil (`Alumno v3:640`), subir video y notificaciones (`:800`, `:822`) son contenedores sin rol dialog ni manejo Escape del móvil. El comparador sólo atiende pointerdown/pointermove (`:644`), sin slider semántico ni alternativa de teclado; las regiones 3D sí tienen chips que ofrecen otra vía de selección.

### C25 · Media · Duración y resumen de entrenamiento engañosos como registro

La duración arranca en 754 segundos (`Alumno v3:930`) y suma por `setInterval` sólo cuando `screen==='workout'` (`:966`); navegar fuera pausa el cómputo sin representar pausa de sesión. A diferencia del descanso, no deriva de un timestamp. El PR compara la mejor banca contra umbral seed 85×6 (`:1334–1337`), no historial persistido del usuario; otras variantes de ejercicio no participan. Se puede finalizar con todas las series sin completar porque `finishWorkout` no valida (`:1491`). La validación local del umbral es real pero no demuestra PR de una sesión almacenada.

### C26 · Baja · Robustez y ciclo de vida incompletos

Si falla la carga del store, el `boot` de Gym/Alumno sigue haciendo `setTimeout(boot,150)` sin límite ni cancelación específica (`Gym:971`, `Alumno:964`). Videos cargados en Gym generan object URLs (`:969`) que no se revocan en `componentWillUnmount` (`:977`). El WebGL renderiza continuamente aun con movimiento reducido (`Alumno:1160–1161`, `:1187–1192`), aunque reduce damping/entrada; la limpieza dispone meshes pero no ring/lights creados aparte (`:1157`, `:1206–1211`). Estas son deudas técnicas; no se midió consumo real.

## Navegación, enlaces y rutas

Las pantallas cambian por `state.screen`, `bodyStep`, `ctab`, `gymTab` y otros flags. No hay router, History API, hash router ni mapeo ejecutable de `/app/train`, `/coach/...` u otras rutas de `screens.json`. Abrir una ruta documental no equivale a entrar al estado correspondiente; Back/Forward del navegador no recorre esas pantallas. Los accesos por `startScreen` son props de demostración, no rutas.

Se verificaron estáticamente referencias locales literales `src` y `href` de todos los HTML; no se detectaron archivos destino faltantes. El cambio Coach→Gym es un enlace real a otro archivo (`Coach:38`); Gym→Coach usa `window.location.href` (`Gym:1029`, `:1036`). Ese cambio recarga el documento y pierde su estado operativo en memoria. El espacio alternativo de Sofía/Belgrano sólo muestra toast (`Gym:1030`, `:1036`), no cambia realmente de sede. Los enlaces `#1a/#1b/#1c` del demostrador motion son anclas de presentación. No se verificó disponibilidad remota de CDN/fonts durante esta auditoría estática.

`navigation.json` usa nombres conceptuales Coach `dashboard/programs/messages/payments`; la implementación usa `dash/builder/msgs/pay` (`Coach:440–442`). No rompe el menú propio, porque sus handlers son coherentes entre sí, pero un desarrollador no debe tratar ese JSON como configuración consumida por los HTML. Gym NAV sí coincide sustancialmente con sus claves documentales (`Gym:889–893`). Admin tiene overview/clients/detail/invoices/plans (`Admin:268–270`). El código no lee ninguno de los tres JSON de producto.

## Legacy y regresiones

- **Alumno v1**: conserva las pantallas principales/BI sin intro ni Gym. En `:803–813` el descanso resta por ticks de intervalo en vez de timestamp; v2/v3 introducen `restEnd` y cálculo por reloj. La comprobación de PR de v1 usa el umbral de su demo, sin historial remoto. Sigue sin persistencia, cámara BI o cifrado real. Contiene lógica ejecutable, por lo que no corresponde llamarlo sólo imagen estática.
- **Alumno v2**: incorpora intro/animaciones con `repi_intro_seen` (`:852`), descanso `restEnd` y el visor Three.js (`:979`), pero no comunidad/archivos de desafíos ni store compartido. Los consentimientos y permisos permanecen en memoria (`:817–834`).
- **Escritorio incompleto**: 917 líneas de plantilla, no hay script lógico. Debe archivarse como referencia no operativa para evitar que sus pantallas/acciones se cuenten como terminadas.
- `legacy/support.js` y `support.js` tienen los mismos bytes en esta entrega. No se detectó una versión alternativa de runtime que explique cambios funcionales entre prototipos.

## Accesibilidad y privacidad: alcance comprobable

Hay buenas bases visibles en código: botones de icono con `aria-label` en varios flujos, `role=status` para toasts, dialogs desktop con nombre y `aria-modal`, labels de formularios, navegación con `aria-current`, manejo de Escape desktop y consideración de `prefers-reduced-motion`. Gym define outline de foco (`:18`). No se realizó medición automática WCAG ni prueba con lector de pantalla; no se infiere conformidad de estas etiquetas. Los problemas concretos de teclado/foco y ancho están enumerados en C21–C24.

No se encontró transferencia de fotos/medidas/mensajes a un backend; las fotos BI ni siquiera se capturan. Sí se pueden guardar videos reales de desafíos en IndexedDB y fotos de catálogo/publicaciones como data URL en localStorage. Esos almacenes no están cifrados por lógica de aplicación y se comparten entre documentos del mismo origen; no equivalen al permiso «sólo el equipo de Gym Norte». La fuente muestra datos personales y de salud ficticios explícitos como seed (por ejemplo `Coach:411`), por lo que una demo compartida incluye esas historias en el archivo. Los proveedores CDN/fuentes reciben las solicitudes necesarias al abrir la demo; no se encontró analítica adicional. No se evaluó la configuración de hosting/CSP/HTTP porque no forma parte de la fuente.

## Discrepancias clave frente a los JSON

| Documento/entrada | Qué demuestra realmente el código |
|---|---|
| `F-CL-03`, `SCR-M-04`: «autosave/Guardado» | Edición y señal visual sin almacenamiento de sesión (C01). |
| `F-CL-04`: descanso por reloj real | Implementado en v3 mediante `restEnd/Date.now` (`:967–973`), con pause/+30/saltar; el tiempo total de entrenamiento sigue por ticks (C25). |
| `F-CL-05`: PR validado | Comparación local contra 85×6 seed; no historial de usuario persistido (C25). |
| `F-BI-05`: cámara real en acceptance | Captura y controles de calidad simulados (C05). |
| `F-BI-07`: visor interactivo | WebGL real con fallback; el avatar es geométrico genérico y la etiqueta «ajustado» no cambia la malla (C15). |
| `F-BI-02`: guardar ≠ compartir | Toggles separados presentes, sin persistencia, con medidas compartidas true al inicio (C06). |
| `SCR-CX-01`: asignar copia por cliente | Misma referencia de programa para todos (C04). |
| `SCR-N-05`: biblioteca CRUD parcial | Catálogo estático de 15 ejercicios con filtro/agregar al programa; no alta/edición/baja de biblioteca ni videos. |
| `SCR-A-05`: static_mockup | Correcto: cartas de valores DEF sin edición de defaults (`Admin:311`). |
| `SCR-N-02`, `SCR-N-14`, `SCR-N-17` pendientes | Coherente con ausencia de auth, checkout y sincronización offline en la fuente. |
| `SCR-MI-02/03`: future_concept | Sí tienen coreografía ejecutable en `Motion Intro`, pero no son la intro elegida para la app. |

## Qué está listo para reutilizar y qué falta

La entrega aporta estructura visual, muchos estados, microinteracciones y ejemplos de comportamiento suficientemente concretos para especificar una implementación. La parte reutilizable es principalmente interfaz y lógica local demostrativa. Antes de llamarla aplicación funcional hacen falta, como mínimo, identidad y autorización, persistencia/contratos de datos, router, operaciones de servidor, sincronización y manejo de fallos, pagos/integraciones si se confirman dentro del alcance, y reemplazar las afirmaciones simuladas de BI. Antes de una próxima demostración conviene resolver C02, C03, C04, C09 y C16, porque se manifiestan aun con datos ficticios y sin backend.
