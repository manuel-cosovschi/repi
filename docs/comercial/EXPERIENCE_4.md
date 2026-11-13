# Experience 4.0 · «The Living Gym»

Evolución de `/conoce` sobre Experience 3 / Motion 2 (12–13/11/2026, D219). Pedido del titular: máster «REPI Experience 4.0 — Cinematic 3D · Interactive Motion · Creative Direction · Full Website Audit».

- **Rama:** `claude/experience-4`, desde `main` `536eba5`.
- **Alcance:** sólo `/conoce`, sus subrutas y lo que usan (formulario, eventos del sitio, films). No toca repiclub.com (`/`) ni la app de entrenamiento.
- **Sin** dependencias nuevas, migraciones, variables de entorno ni cambios de precios.

Lo que sigue separa siempre **lo medido** de **lo que no se pudo comprobar** (§13).

## 1. Diagnóstico de la versión anterior

Se recorrió la versión publicada y la misma versión levantada en local (`536eba5`), en escritorio 1440×900 (nivel alto) y teléfono 390×844 (nivel medio), con grabación y capturas por tramo.

Lo que se vio:

1. **La sala era un plano con cajas.** Los equipos eran prismas del mismo color, sin sombra ni contacto con el piso; la cámara pasaba de una toma a otra en línea recta y casi siempre desde arriba. Se leía como un diagrama, no como un lugar.
2. **La sala no acompañaba a la página.** Después de la escena de la serie, quedaba de fondo con el mismo brillo detrás de tarjetas de texto: competía con lo que había que leer.
3. **Dos momentos sin nada.** Al entrar a «En acción» y al empezar el cierre había tramos enteros de scroll con el plano apagado y ningún texto.
4. **El dato no viajaba.** La serie se registraba y la página pasaba a otra cosa: no se veía que ese número terminara en el progreso del socio, en el entrenador y en el dueño.
5. **Las dos modalidades cambiaban con un fundido.** No se veía que el mismo sistema pasara del teléfono a la pantalla del gimnasio.
6. **La sala no se podía tocar.** La única interacción con el 3D era el paralaje del puntero.
7. **Textos que una demo desmentía** (§9) y cuatro fallas de captación (§10).

## 2. Dirección creativa

**Idea:** el gimnasio como un sistema vivo. La sala deja de ser el fondo y pasa a ser el lugar donde ocurre todo lo que la página cuenta: una persona levanta la barra, el número sale de ella, cruza la sala y enciende la pantalla del entrenador y la de la oficina.

Se conserva de Motion 2: el punto cian de la «ı» como hilo, el logo real (nunca redibujado), Barlow y Barlow Condensed, la paleta navy / cian / verde / crema y las escenas existentes.

**Seis momentos**, en orden de página:

| # | Momento | Dónde | Qué se ve |
| --- | --- | --- | --- |
| 1 | Del plano a la sala | Apertura | El plano dibujado se levanta: paredes, vidrios y equipos suben desde el piso mientras la cámara baja en grúa. Dura 3,2 s, una sola vez. |
| 2 | El caos se ordena | 02 | Igual que en Motion 2; al cerrarse, la red de la sala se enciende. |
| 3 | Una repetición genera inteligencia | 03 | La cámara va en tres tiempos hasta Valentina en el banco (plano medio → cerca → órbita). La barra sube y baja con cada repetición que marca el contador; al registrar, sale un pulso. |
| 4 | El dato vuelve | 03b (nuevo) | El «62,5 kg × 6» sale de Valentina, viaja hasta el punto de hoy en su curva de progreso, la curva se dibuja y el mismo dato enciende las pantallas del entrenador y de la oficina. |
| 5 | Un sistema, dos formas | 04b | El dispositivo gira sobre su eje y vuelve convertido en el otro: teléfono ↔ pantalla del gimnasio. |
| 6 | La sala conectada | 04c (nuevo) | La sala entera, con sus cuatro zonas. Se elige una tocando la sala, con las pestañas o bajando; la cámara vuela hasta ahí y la zona hace lo suyo. |
| 7 | Vuelta al punto | 08 | La cámara sube de la sala entera a la cenital, una frase la nombra, y todo vuelve al punto de la «ı». |

## 3. Referencias

Qué se leyó de verdad y qué no. Notas completas en el scratchpad de la sesión (`x4/ref/research.md`, no versionado).

**Leído:**
- GSAP: documentación de ScrollTrigger, `matchMedia`, Flip y SplitText; la licencia estándar (desde el 30/04/2025 todo GSAP es gratuito para uso comercial).
- dimaac.com/projects (39 reconstrucciones: «text to timeline», tarjetas que vuelan a su lugar, pines apilados).
- El código de acompañamiento de un artículo de Codrops sobre scroll cinematográfico con R3F + GSAP, y cuatro demos de Codrops en GitHub (sólo código).
- three.js (curvas, `getPointAt`) y la guía de rendimiento de React Three Fiber.
- Casos de estudio de Immersive Garden, 14islands y Lusion (README y blog), y el README de Lenis.

**No se pudo abrir** (no se usó como fuente):
- Los artículos de Codrops en tympanus.net (403 al acceso automático) y web.archive.org.
- Active Theory (403), Resn, y el caso de Lusion en Awwwards (503).
- QCLAY, adrien.ninet y fmanalytics: no se inspeccionaron sus sitios; no se afirma nada sobre ellos.

**Qué se tomó:**
- Tabla de tomas sobre el scroll con la suavidad en el recorrido, no en el tween (ya era así; se agregaron arcos).
- Mirada y posición por separado, con arco esférico entre tomas.
- Sombras de contacto baratas (una mancha por objeto) en vez de mapas de sombra.
- Geometría instanciada por tipo de equipo.
- El dato que viaja del texto al gráfico («text to timeline»), con el gráfico como SVG real en el DOM.
- Todo el texto en el DOM; el canvas es decorativo (`aria-hidden`).

**Qué se descartó y por qué:** scroll suavizado por JavaScript (Lenis, ScrollSmoother: en Safari móvil cuesta fluidez y la página ya sigue el scroll nativo), el pin de GSAP (se mantiene `position: sticky`), Flip con scrub (salta al invertir), dolly zoom (mareo), giroscopio (pide permiso) y posprocesado (costo en teléfonos).

## 4. Arquitectura 3D

Sigue la de Experience 3: un escenario fijo detrás del HTML, un plano SVG inmediato y la sala 3D cargada aparte sólo en los niveles alto y medio. Los archivos están en `apps/web/src/components/conoce/sala/`.

| Archivo | Qué hace en 4.0 |
| --- | --- |
| `model.ts` | Medidas de la sala, tipos de equipo, tomas de cámara (`SHOTS`, con `fov` y `far` opcionales), corrimientos de lente por toma (`LENS`), caminos de la red (`LINKS`) y posiciones de las pantallas. |
| `store.ts` | Estado que escriben las escenas y lee el canvas por cuadro, sin pasar por React. Nuevo: `flow` (red encendida), `lift` (barra), `dim` (velo), `explore` (toma elegida a mano), `kiosk`, y el canal `pings`. |
| `Stage.tsx` | El «director»: lee `data-shot` de cada sección y de las marcas `.x4-cue`, y mezcla la toma a→b según el scroll. Lee `data-span` (largo de la mezcla, en pantallas) y `data-dim` (cuánto se apaga la sala detrás de esa sección). |
| `SalaCanvas.tsx` | La sala 3D. Reescrito. |
| `SalaSvg.tsx` | El plano (nivel bajo, sin WebGL, movimiento reducido y mientras carga el 3D). Muestra lo mismo que el 3D: zonas, red, pantallas, pulsos y la zona elegida. |

**Dentro de `SalaCanvas.tsx`:**
- `Room`: piso, losas de zona, charcos de luz, grilla, paredes con degradé y tabiques de vidrio. El contorno del plano se desvanece a medida que la sala se levanta.
- `Gear`: seis tipos de equipo (rack, banco, máquina, cinta, mostrador, escritorio). Cada tipo es **una** geometría fusionada con color por vértice y se dibuja instanciada: un llamado de dibujo por tipo.
- `Barbells`: las barras, con tres alturas (apoyada, pecho, arriba). `stage.lift` la mueve desde la escena; sin escena, respira sola.
- `People`: cuerpo y cabeza, Valentina acostada en el banco con los brazos siguiendo la barra, Julián en sentadilla, halos y sombras.
- `Screens`: el tótem de recepción con la captura real de REPI Control, los monitores del entrenador y de la oficina, las consolas de las cintas.
- `Net`: los cinco caminos de la red, paquetes que los recorren, hasta ocho pulsos a la vez y el arco del pedido «Que venga alguien».
- `Rig`: la cámara. Arco esférico entre tomas, `fov` por toma, la grúa de apertura, paralaje con el puntero y una respiración mínima. `explore` la lleva a una toma elegida a mano.

**Sin** mapas de sombra, posprocesado, modelos externos ni texturas descargadas (salvo la captura del tótem, que ya estaba en el sitio). Las sombras, charcos de luz y degradés son `CanvasTexture` generadas al montar.

**Niveles de calidad** (`detectQuality`, sin cambios de criterio):

| Nivel | Cuándo | Qué dibuja |
| --- | --- | --- |
| Alto | Escritorio con GPU | 3D, antialias, densidad de píxel hasta 2 |
| Medio | Teléfono o tableta con GPU, ≥ 4 núcleos y ≥ 3 GB | 3D, sin antialias, densidad hasta 1,5 |
| Bajo | Sin WebGL 2, WebGL por software, ahorro de datos, movimiento reducido, equipos chicos | El plano SVG, sin descargar three |

Si el contexto WebGL se pierde, o si la sala se dibuja lenta de forma sostenida (§12, red de seguridad), vuelve el plano SVG. Hay prueba automática de los dos casos.

## 5. Sistema de movimiento

- **El scroll manda.** Las escenas fijadas avanzan con el scroll y son reversibles. Lo que pasa «una vez» (grúa de apertura, giro del dispositivo, nacimiento del logo) es corto y no bloquea el scroll.
- **La suavidad está en el recorrido.** Tweens con scrub en `ease: none`; las curvas (arcos de cámara, viaje del dato) llevan la aceleración.
- **Duraciones:** entradas de texto 0,5–0,7 s; giro del dispositivo 0,34 s + 0,62 s; pulsos 1,4 s; vuelo de cámara a una zona elegida ≈ 1,2 s.
- **Cian sólo para el dato vivo**: pulsos, paquetes, la serie de hoy. Verde sólo para el equipo.
- **Velo por sección (`data-dim`).** Cada sección declara cuánto se apaga la sala detrás: 0 en las escenas de sala, 0,4–0,5 detrás de tarjetas de texto.
- **Tipografía cinética:** el componente `Say` existente (palabra por palabra, con una palabra destacada). Se usa en la frase del cierre y en los títulos de las escenas nuevas.
- **Movimiento reducido o «Pausar animaciones»:** sin scrub ni vuelos. Cada escena muestra su estado final: la curva dibujada, la zona elegida con su texto, el logo entero. Los pulsos no se disparan.

## 6. Transiciones entre escenas

| De → a | Cómo |
| --- | --- |
| Apertura → 02 | La cámara sigue bajando; el velo no cambia. |
| 02 → 03 | Tres marcas dentro de 03 (`rackMid`, `rackClose`, `rackOrbit`): se llega a Valentina en tres tiempos. |
| 03 → 03b | La toma `dataOut` se abre hacia la sala y deja a Valentina a un lado: de ahí sale el dato. |
| 03b → simulador / 04 | El velo sube a 0,5: la sala queda atrás de las tarjetas. |
| 04b → 04c | La cámara sube a `connected` (la sala entera) y el velo vuelve a 0. |
| Dentro de 04c | Una marca por zona; mezcla corta (0,3 pantallas). |
| 07 → 08 | `finaleWide` → `finale` en grúa, con la frase «Socios, entrenadores y gimnasio. Un mismo sistema.» mientras la sala sigue entera. |

## 7. Componentes nuevos y cambiados

Rutas relativas a `apps/web/src/`.

**Nuevos**
- `components/conoce/x4/DataStory.tsx` — «El dato vuelve» (03b). Recibe la serie anterior y la real **del motor**; los seis puntos previos de la curva son un ejemplo y la página lo dice al pie del gráfico («los anteriores, un ejemplo ficticio»).
- `components/conoce/x4/Connected.tsx` — «La sala conectada» (04c, `id="sala"`). Lista de pestañas «Zonas de la sala» con flechas, Inicio y Fin; botones sobre la sala; una tarjeta por zona con su demo.
- `components/conoce/referral.ts` — enlace personal de un vendedor (`?ref=V-XXXXXX`, D209): viaja oculto con el formulario como origen del contacto. No se muestra en la página ni en los mensajes de WhatsApp.
- `styles/conoce4.css` — estilos de lo anterior.
- `e2e/conoce-x4.spec.ts` — 17 pruebas (× 2 proyectos).

**Cambiados**
- `x3/Training.tsx`: marcas de cámara, barra sincronizada con el contador, pulso al registrar, y `DataStory` antes del simulador.
- `x3/Modes.tsx`: giro del dispositivo; avisa la modalidad elegida al formulario.
- `x3/Finale.tsx`: toma amplia + grúa + frase previa.
- `x3/Problem.tsx`, `Showcase.tsx`, `Perspectives.tsx`, `Demos.tsx`, `Proof.tsx`, `Hero.tsx`, `SceneIndex.tsx`, `ConoceHub.tsx`: velo, red, textos y navegación («La sala»).

## 8. Assets

- **Ninguno comprado ni descargado.** Geometría y texturas son procedurales.
- **Logo:** `public/brand/wm_full.png` con el punto aparte, como antes. No se redibujó.
- **Captura del tótem:** `public/conoce/shots/control-rutina.webp` (ya publicada).
- **Tipografías:** Barlow y Barlow Condensed.
- **Capturas rehechas (13/11):** `training`, `intelligence`, `adaptive`, `owner`, `access` y `control-equipo`, con `design/films/kit/tools/shots-conoce.mjs` contra una demo local.
  - Sin avisos del entorno de demo («Avisos push no están configurados…»), sin la píldora «DEMO · Guía · Otro perfil» y sin la ayuda de primera vez.
  - `training`, `intelligence` y `adaptive` usan el mismo ejemplo que la escena en vivo: el historial de press de banca de la demo se dejó en 60 kg × 10 y el motor real muestra «Anterior 60 kg × 10 → REPI recomienda 62,5 kg». Ningún número se escribió a mano.
  - `owner` ahora es «Seguimiento de sala» (pedidos recibidos, resueltos y tiempos); el tablero «Ejecutivo» de la demo está casi en cero.
  - `access`: el email ficticio de la demo se muestra con un dominio de ejemplo.
  - `training-piezas.webp` es la captura anterior, que sólo usa `EngineScreen.tsx` para recortar piezas de interfaz sin números (los recortes van por coordenadas).
  - **Sigue distinto:** la demo que prueba el visitante y los films muestran el ejemplo de la demo (53 kg). Cada uno es coherente por dentro.

## 9. Veracidad

Se revisó cada afirmación de la página contra el código y las demos. Lo corregido:

| Antes | Ahora | Por qué |
| --- | --- | --- |
| «Ya funciona en gimnasios de Mar del Plata» (apertura, 07, metadatos de aliados) | «Ya funciona en Mar del Plata» + «estamos en proceso de implementación en varios gimnasios más de Mar del Plata, Balcarce y Tandil» | Es la prueba social que autorizó el titular (D218, ajuste). Smart Center sigue nombrado una sola vez, en el panel del caso. |
| Tablero del dueño con «ingresos» | «socios en REPI, sesiones registradas y satisfacción» | El tablero no muestra ingresos. |
| «RPE y RIR» por serie | «RIR» | El RPE se pide por sesión. |
| «Body Intelligence» / medidas | «Mi cuerpo»; «Todavía no registra medidas corporales» | Es lo que hay. |
| REPI Control «sin email» a secas | «en la pantalla no hace falta email, contraseña ni instalar nada» | El alta del socio sí tiene datos; la pantalla no los pide. |
| Disponibilidad de REPI Control sin aclarar | «Disponible · REPI la activa por gimnasio, con la pantalla que ponga la sede» | No se activa sola. |

No hay precios, testimonios, cantidades de clientes ni porcentajes de resultado. Una prueba automática vigila lo que se puede vigilar por texto: sin precios ni «por mes», sin porcentajes de mejora, con la prueba social autorizada y con la disponibilidad de REPI Control dicha.

**Dato de ejemplo declarado:** la curva de 03b. Los dos últimos puntos (anterior y hoy) salen del motor real; los seis previos son ilustrativos y el texto lo dice.

## 10. Captación

Fallas encontradas leyendo el código y confirmadas con prueba:

| Falla | Arreglo |
| --- | --- |
| Un `utm_campaign` de más de 80 caracteres hacía fallar el envío del formulario (400). | Se recorta al leerlo (40 / 40 / 80) y al enviar. |
| Entrar con `?modo=control` y cambiar a Completo dejaba el formulario con la modalidad vieja. | El selector avisa cada cambio; el formulario lo sigue. |
| «Quiero REPI en mi gimnasio» no preparaba el formulario si antes se había elegido otro perfil. | Ahora lo pone en «gimnasios». |
| Cambiar de tipo de contacto dejaba el interés y la reunión del tipo anterior. | Se reinician. |
| La referencia del vendedor no llegaba al WhatsApp. | **Revertido el 13/11 por pedido del titular:** el código ya no se agrega al mensaje. El enlace personal del vendedor (D209) sigue llegando, oculto, sólo con el formulario. |
| «Pedir demo» de la cabecera no se medía. | Mide `contact_click` con destino `cabecera`. |

**Descartado (13/11):** guardar la referencia del vendedor en los eventos del sitio o en `/qr`. El titular no quiere esa referencia a la vista en `/conoce`.

## 11. Accesibilidad

- Todo el contenido está en el DOM; el canvas y el plano son decorativos.
- «La sala conectada» es una lista de pestañas con teclado completo; los botones sobre la sala son un atajo y las pestañas ofrecen siempre las cuatro zonas.
- El gráfico de 03b tiene título, descripción y los valores en texto.
- Foco visible, objetivos táctiles ≥ 40 px, sin scroll lateral de 320 a 1920 px.
- axe (reglas WCAG 2.0 y 2.1 A/AA y 2.2 AA, las que ya usa la suite) sin infracciones en la sala conectada, en 03b y en el resto de `/conoce`.
- Movimiento reducido y «Pausar animaciones» cubren las escenas nuevas (§5).

**No comprobado:** lector de pantalla real (VoiceOver, TalkBack, NVDA). axe detecta sólo una parte de WCAG 2.2 AA; el resto se revisó a mano en teclado, foco, tamaños táctiles y contraste, no criterio por criterio.

## 12. Rendimiento

Medición de laboratorio, **antes** (`536eba5`) y **después** (esta rama) servidos igual (build de producción local, mismo equipo, corridas intercaladas), con Chromium:
- teléfono emulado 390×844, CPU ×4, red 1,6 Mbps / 150 ms;
- mediana de 3 corridas.

**Carga**

| Nivel | Métrica | Antes | Después | Objetivo |
| --- | --- | --- | --- | --- |
| Medio (3D) | LCP | 1,24–1,38 s | 1,31–1,34 s | ≤ 2,5 s |
| Medio (3D) | CLS | 0 | 0 | ≤ 0,1 |
| Medio (3D) | JavaScript transferido | 539 KB | 553 KB | — |
| Medio (3D) | Total al cargar | 856 KB | 876 KB | — |
| Medio (3D) | Total recorriendo toda la página | 1.357–1.365 KB | 1.376 KB | — |
| Bajo (plano SVG) | LCP | 1,37–1,38 s | 1,32–1,48 s | ≤ 2,5 s |
| Bajo (plano SVG) | CLS | 0 | 0 | ≤ 0,1 |
| Bajo (plano SVG) | JavaScript transferido | 298 KB | 305 KB | — |
| Bajo (plano SVG) | Total al cargar | 615 KB | 627 KB | — |
| Todos | CSS | 27 KB | 29 KB | — |

El largo de la página pasó de 27.459 px a 34.159 px en teléfono (dos escenas nuevas fijadas).

**Respuesta al tocar** (duración de cada interacción, con CPU ×4)

| Interacción | Antes | Después |
| --- | --- | --- |
| Pestañas de modalidad (peor de 6 toques, dos corridas) | 152 y 328 ms | 168 y 192 ms |
| Pestañas de zona de la sala (peor de 3) | no existía | 48 y 88 ms |

La primera versión del giro del dispositivo llegó a 912 ms en el primer toque. Se corrigió: la pestaña se pinta primero y el panel con el giro se arma en el render siguiente (`useDeferredValue`).

**Costo de dibujar la sala 3D**

No hay GPU en el entorno: Chromium dibuja WebGL con la CPU (SwiftShader). Por eso se midió el tiempo de CPU del proceso gráfico por cuadro, que sirve para comparar versiones pero no dice cuántos cuadros por segundo va a dar un teléfono.

| Momento (390×844, nivel medio) | Antes | Después, primera versión | Después, optimizada |
| --- | --- | --- | --- |
| Apertura | 12–15 ms | 54–72 ms | 31–35 ms |
| Escena de la serie | ≈ 17 ms | ≈ 37 ms | ≈ 30 ms |

La sala nueva cuesta **alrededor del doble** por cuadro en dibujo por software. La causa no era la cantidad de objetos (son menos llamados de dibujo que antes: 13–17 contra 15–19, y 4.400 triángulos), sino el relleno: planos grandes con textura y capas transparentes que se dibujaban aun en opacidad 0. Se hizo:
- texturas generadas sin mipmaps ni filtro trilineal;
- lo que está en opacidad 0 no se dibuja;
- el guion animado de la red en el plano SVG sólo corre con la red encendida.

**Red de seguridad** (`Guard`, en `SalaCanvas.tsx`). Como el costo real depende de la GPU de cada equipo y eso no se puede saber de antemano:
1. Si más de la mitad de los cuadros tarda más de 40 ms (menos de 25 por segundo) durante dos ventanas de 2 s seguidas, la densidad de píxel baja a 1.
2. Si sigue lenta, queda el plano SVG, igual que cuando se pierde el contexto WebGL, y el resto de la visita no vuelve a cargar el 3D.
3. El modo de bajo consumo de iOS (30 cuadros por segundo) no la dispara.
4. Con `?sala=` forzado no actúa (es el modo de revisión), salvo `?guard=<ms>`, que usan las pruebas.

Quien entra con WebGL por software ya recibía el plano SVG desde el principio (`detectQuality`), y eso no cambió.

**No medido:** INP, LCP y cuadros por segundo en teléfonos reales, ni datos de campo. Las mediciones se hicieron con otros procesos corriendo en el mismo equipo; por eso se dan rangos y no un número.

## 13. Qué se probó y qué no

**Probado**
- `e2e/conoce.spec.ts` (la suite que ya existía) y `e2e/conoce-x4.spec.ts` (17 pruebas nuevas), en los dos proyectos (teléfono y escritorio): 96 pasan y 2 se omiten (las mismas 2 que se omitían antes). En la suite existente se cambió **una** expectativa, a propósito: el film de marca en un teléfono en vertical ahora abre la versión 9:16 nueva (antes sólo existía la 16:9). El resto quedó como estaba.
- Typecheck, guardas (26 de 26), pruebas unitarias e integración y build de producción, los mismos pasos que corre el CI.
- Once tamaños, de 320×568 a 1920×1080 más 844×390 apaisado: sin scroll lateral, sin botones cortados, sin errores de consola.
- Los tres niveles de calidad, con y sin movimiento reducido, y la caída a SVG al perder el contexto WebGL.

**Arreglo de paso (fuera de `/conoce`):** `next start` no arrancaba con `main` porque `/api/agenda/[token]` (reserva de la agenda pública, D218) y `/api/agenda/[id]/ics` (D98) usaban dos nombres para el mismo tramo dinámico. En Vercel funcionaba; en un servidor local, no. La ruta de reserva pasó a la carpeta `[id]` sin cambiar su URL ni su comportamiento (comprobado: POST → 303, `.ics` → 401 sin sesión, igual que en producción).

**Límites de esa evidencia**
- **Sin dispositivos reales.** Todo es Chromium con emulación de tamaño y de tacto.
- **Sólo Chromium.** No hay WebKit ni Firefox en el entorno: Safari en iPhone, que es donde más importa, no se probó.
- **WebGL por software.** El 3D se dibujó con la CPU (SwiftShader). Los cuadros por segundo medidos no representan un teléfono con GPU; sirven para comparar antes y después en igualdad de condiciones, no como valor absoluto.
- **Grabaciones a ≈ 25 cuadros/s** (video de Playwright). No son prueba de fluidez a 60.
- **Films:** nadie los escuchó. La ausencia de voz y la sonoridad se sostienen con mediciones (`ffmpeg ebur128`) y con la procedencia de las pistas, no con una escucha.

## 14. Films

**Auditoría (hecha).** Los 14 films publicados se revisaron con `ffprobe`, medición de sonoridad, tiras de contacto de todos y cuadros a resolución completa. Resultado:
- Técnicamente correctos: H.264, 30 cuadros/s, entre −13,9 y −14,7 LUFS, pico ≤ −2,2 dBTP, sin silencios, sin precios ni testimonios, tipografías y logo correctos.
- Creativamente se leen como una plantilla repetida: título quieto a un lado, teléfono chico al otro y una tarjeta. Entre el 57 % y el 69 % del tiempo el cuadro está prácticamente quieto.
- Defectos concretos: un parpadeo de otra pantalla dentro del teléfono en 12 films (el desenfoque de movimiento del render), el logo ampliado hasta 2,1× sobre un original de 315×154 px, textos de 28 px que no se leen en un teléfono, un fogonazo cian antes de cada logo, una cifra inventada en una tarjeta de `film-marca` («412 filas»), y capturas con avisos del entorno de demo.

**Reproducción (hecha para cinco films).** Se corrigió el kit (`design/films/kit/build.py`): sin desenfoque de movimiento (era el origen del parpadeo), sin fogonazo cian, logo a 400 px como máximo, textos chicos más grandes y un plano de teléfono nuevo, con inclinación 3D que se asienta, acercamiento a la fila que se nombra, recuadro cian y tarjeta con el valor de esa fila. Se grabó material nuevo en alta definición desde una demo local (datos ficticios).

| Film | Estado | Duración | Peso | Sonoridad / pico | Qué cambió |
| --- | --- | --- | --- | --- | --- |
| `film-marca` | Re-renderizado | 0:38 (antes 0:48) | 5,9 MB | −14,3 LUFS / −1,8 dBTP | Apertura de 18 s a 7,4 s; sin «412 filas»; «El dueño ve su sala» muestra el Seguimiento de sala real; cortes en el pulso. |
| `film-marca-vertical` | **Nuevo** (9:16) | 0:38 | 5,7 MB | −14,3 / −2,2 | Teléfono casi a sangre. |
| `modo-control` (16:9 y 9:16) | Corregido y re-renderizado | 1:00 | 7,1 y 6,6 MB | −14,5 / −2,2 | El profesor programa a Ana Pérez en Gimnasio Atlas, la misma socia que usa la pantalla; sin resto recortado junto al QR ni botón cortado; póster nuevo. |
| `modo-completo` (16:9 y 9:16) | Re-renderizado | 0:53 (antes 0:56) | 7,0 y 6,5 MB | −14,6 / −2,2 | Ocho planos iguales pasan a siete con cámara; el plano de métricas se reemplazó por el pedido de sala («Voy»). |
| `perfil-gimnasios` | Re-renderizado | 0:47 (antes 1:02) | 6,0 MB | −14,4 / −2,3 | Apertura corta; escena del dueño y póster con el Seguimiento de sala, sin avisos del entorno de demo. |
| `f-intelligence` | Re-renderizado | 0:28 (antes 0:33) | 3,1 MB | −14,6 / −3,4 | La tarjeta dice lo que muestra la captura («Anterior 53 kg × 9»); un solo plano encadenado sobre la fila. |

Cada film nuevo se revisó en tiras de contacto del archivo publicado (cifras de las tarjetas contra la captura del mismo plano, logo, cierre) antes de reemplazar al anterior.

**Sin tocar:** `perfil-entrenadores`, `perfil-deportistas` (y su vertical), `perfil-aliados`, `f-progreso`, `f-altas` y `f-sala` siguen como estaban, con los defectos de la auditoría (parpadeo del póster dentro del teléfono, logo ampliado, textos chicos).

**Lo que no se pudo corregir en los cinco:**
- El logo sólo existe a 315×154 px: se muestra a 1,27×. Para mostrarlo más grande hace falta el original vectorial o de mayor tamaño (no se redibuja).
- `modo-control`: no se regrabó nada; las escenas del profesor usan una captura de 390 px ampliada, más blanda que el resto, y el plano del QR queda quieto unos 2,4 s.
- `modo-completo`: en un plano el recuadro pisa por unos píxeles el título del ejercicio siguiente.
- `perfil-gimnasios` y `f-intelligence` no tienen versión 9:16. En 16:9 visto a 360 px de ancho, los rótulos de las tarjetas quedan en unos 7 px.

**Música:** las mismas pistas instrumentales de Kevin MacLeod (CC BY 4.0), con atribución en `/creditos`. Sin voz ni locuciones.

## 15. Revisión por escena

Puntaje 1–5 (5 = sin objeciones), con la captura que lo respalda. Capturas en el scratchpad de la sesión (`x4/after/`); no se versionan.

| Escena | Impacto | Claridad | Fluidez (emulada) | Teléfono | Evidencia y lo que falta |
| --- | --- | --- | --- | --- | --- |
| 01 Apertura · del plano a la sala | 4,5 | 4,5 | 4 | 4 | `sheet-d-intro-0.jpg`: plano → sala en ≈ 1,3 s, logo y titular siempre legibles. Falta verla a 60 cuadros/s en un teléfono real. |
| 02 El caos se ordena | 4 | 4,5 | 4 | 4 | `sheet-d-0.jpg` fila 1–2. Sin cambios de fondo respecto de Motion 2; la red se enciende al final. |
| 03 La serie (WOW 3) | 4,5 | 4,5 | 4 | 4,5 | `sheet-d-0.jpg` filas 3–4: Valentina en el banco, barra y contador coinciden. En teléfono el banco queda detrás de la tarjeta de la app durante un tramo. |
| 03b El dato vuelve (WOW 4) | 4 | 4,5 | 4 | 4 | `sheet-d-1.jpg` fila 1: el dato sale, la curva se dibuja, «+10 kg». En teléfono la etiqueta viajera cruza por encima del título un instante (`sheet-m-0.jpg` fila 3). |
| 04 Cuatro perspectivas | 3,5 | 4 | 4 | 4 | Sin cambios de contenido; la sala se apaga detrás. |
| 04b Dos formas (WOW 5) | 4 | 4,5 | 4 | 4 | `i-d-md-sheet.jpg`: el giro no deja restos. El teléfono y la pantalla tienen proporciones distintas: a mitad de giro el cambio de tamaño se nota. |
| 04c La sala conectada (WOW 6) | 4,5 | 4,5 | 4 | 4 | `sheet-d-2.jpg` filas 1–3 y `spots3d-*.jpg`. La zona «Equipo de sala» es la más floja: encuadra el puesto y el pedido cruza recién después de unos segundos. |
| 05 Lo que REPI ya hace | 3,5 | 4,5 | 4 | 4 | Sin cambios de estructura; textos corregidos (§9). |
| 06 Demos | 3,5 | 4 | 4 | 4 | Sin cambios. En escritorio las tarjetas cerradas se ven vacías hasta abrirlas. |
| 07 Caso | 4 | 4,5 | 4,5 | 4,5 | `sheet-d-3.jpg` fila 3: prueba social autorizada, Smart Center una sola vez. |
| 08 Cierre (WOW 7) | 4,5 | 4,5 | 4 | 4 | `sheet-d-3.jpg` filas 3–4: frase sobre la sala entera, vuelta al punto, logo real. |

«Fluidez (emulada)» es lo que se vio en capturas y video de Playwright con dibujo por software. No reemplaza la prueba en un teléfono.

## 16. Riesgos

- **Fluidez en teléfonos de gama media.** No medida en hardware real, y en dibujo por software la sala nueva cuesta alrededor del doble que la anterior (§12). La red de seguridad cubre el caso malo (baja la resolución y, si no alcanza, deja el plano), pero hay que mirarla en un Android de gama media y en un iPhone. Si se ve lenta sin que la red actúe, lo primero es bajar la densidad de píxel del nivel medio de 1,5 a 1,25 (`SalaCanvas.tsx`).
- **Safari.** `position: sticky` + canvas fijo ya funcionaba en la versión anterior; lo nuevo (giro 3D del dispositivo con CSS, `zoom` en pantallas bajas) no se vio en WebKit.
- **Capturas con ruido** (§8): no se cambiaron.

## 17. Mantenimiento

- **Agregar o mover una toma:** `SHOTS` en `model.ts` (posición, mirada, `fov`); si el sujeto queda tapado por una tarjeta, `LENS` lo corre. Se ve con `/conoce?sala=high`.
- **Que una sección apague la sala:** `data-dim="0.5"` en la sección.
- **Un cambio de cámara dentro de una sección fijada:** `<i class="x4-cue" data-shot="…" data-span="0.4" style="--at: 0.3">` dentro del tramo.
- **Encender la red o disparar un pulso:** `stage.set({ flow })` y `pings.fire(x, z, "member" | "staff" | "data")`.
- **Otro equipo:** un caso más en `GearKind` + su geometría en `Gear`; el plano SVG toma la misma lista.
- **Niveles:** `?sala=high|medium|low` fuerza cada uno. `?sala=medium&guard=0.5` muestra la red de seguridad actuando.
- **Colores de la sala 3D:** tokens `--x-*` y `--x-g-*` en `styles/conoce3.css` (una guarda del repositorio rechaza colores fijos en componentes).
- **Antes de publicar cambios:** las dos suites de `/conoce` y un recorrido visual en 390×844 y 1440×900.
