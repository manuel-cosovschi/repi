# Experience 3 · Motion 2: «El punto que ordena»

Plan para la segunda pasada de movimiento de `/conoce` (07/11/2026). Está pensado para hacerse en una sola pasada de implementación.

**Código:** `/home/user/repi-cx`, rama `claude/conoce-ajustes`. Las rutas de este documento son relativas a esa raíz.

**Fuentes:**
- el brief `docs/comercial/EXPERIENCE_3.md`;
- el estudio cuadro a cuadro de la versión publicada (grabaciones en `cx-motion/before/`, en el scratchpad);
- los videos de inspiración del titular;
- las tres direcciones propuestas.

## 1. Lo que pidió el titular y cómo se responde

> «La animación … está decente … podría mejorarse incluso más, me gustaría que seas creativo y vayas más allá, investiga sobre la base que te di.»
>
> «Ese logo de repi raro … o lo sacás o que se genere el logo/nombre real.»

**Ir más allá.** Hoy la página es un póster con fundidos. Pasa a ser una historia con un hilo: el punto cian de la «ı».
- En el hero, cae y se vuelve una persona.
- En 02, junta el caos y hace nacer el logo real.
- En 08, toda la sala vuelve a ese punto y el punto se acomoda en la «ı».
- En el medio, la app real carga la historia: la serie en números grandes del motor real (03) y el pedido «Que venga alguien → Voy», que cruza la sala de verdad (05).

**El logo.** Ya es el componente real (`Wordmark`, commit 8386dd0), y se queda. Lo que cambia es el momento: ahora nace exactamente donde converge todo.
1. Los trazos de luz llegan a un punto.
2. Ese punto ya está en la «ı».
3. Las letras se abren desde el punto.

No hay rebote ni desenfoque, y el logo ya no aparece de la nada en otro lugar de la pantalla. Hoy aparece al 14 % del alto mientras todo converge al 50 %: por eso se lee «raro».

## 2. Evaluación de las tres direcciones

Escala de 1 a 5. En riesgo y esfuerzo, 5 significa más riesgo o más trabajo.

El ponderado prioriza que un dueño de gimnasio entienda REPI más rápido:

| Criterio | Peso |
|---|---|
| Claridad | 30 % |
| Wow | 25 % |
| Marca | 15 % |
| Riesgo de rendimiento (invertido) | 15 % |
| Esfuerzo (invertido) | 15 % |

| Dirección | Wow | Claridad | Marca | Riesgo de rendimiento | Esfuerzo | Ponderado |
|---|---|---|---|---|---|---|
| A · «Plano secuencia» | 5 | 3 | 4 | 5 | 5 | 3,05 |
| B · «El hilo y el punto» | 3 | 4 | 5 | 2 | 3 | 3,75 |
| C · «La sala en la mano» | 4 | 5 | 4 | 3 | 4 | 3,85 |

### A · «Plano secuencia»

**Se toma:**
- la sala como personaje;
- el cierre «Vuelta al punto»;
- el impacto del punto en un lugar real del plano;
- el 3D que arranca con el mismo encuadre que el SVG;
- correcciones de cámara: tope de zoom, foco de zona en blanco y encuadre corrido hacia el lado libre del texto;
- el director de tomas que deja de medir el diseño en cada cuadro.

**No entra en una pasada:**
- el riel único con rAF propio;
- R3F con `frameloop="never"` + `advance`;
- el SVG en perspectiva CSS 3D (se desenfoca al magnificar, Safari iOS lo maneja de forma despareja y SwiftShader compone por software);
- la alineación DOM↔WebGL durante el scroll rápido.

Toca todas las escenas a la vez, con mucho riesgo para CLS y TBT. Además la cámara emociona pero no explica el producto, por eso la claridad es media.

### B · «El hilo y el punto»

**Se toma el sistema:**
- títulos cinéticos palabra por palabra, partidos en el servidor, con la palabra clave encendida;
- cero `filter: blur` animado;
- velo frío que se corta de golpe a navy;
- números del motor a tamaño de pantalla, con las repeticiones contando 1→6;
- entradas que se disparan al llegar;
- cortes de montaje en lugar del mismo fundido en todas partes;
- bordes curvos navy↔crema;
- la línea de pasos que se dibuja.

Es barato y se ve igual en SVG y en 3D.

**No se toma:**
- el hilo que recorre toda la página: compite con los trazos que sí significan algo;
- el titular de 02 con las palabras dispersas y enhebradas: es la medición más frágil y el «después» sigue siendo texto, así que el dueño no ve la app.

### C · «La sala en la mano»

**Se toma la historia:**
- el caos colapsa dentro de la app real (el movimiento de fmanalytics);
- el «después» son las tres pantallas reales: socio, entrenador de sala y dueño;
- el punto se vuelve persona;
- el pedido cruza la sala.

Además detectó el problema de veracidad, que verifiqué: las capturas dicen 53 kg × 8 y «Julián», mientras la narración dice 60 → 62,5 kg y «Valentina».

**No se toma:**
- la capa fija con un teléfono que viaja por toda la página (hay que reservarle lugar en cada ancho y alto, con riesgo de LCP y de memoria de GPU);
- los fragmentos que se transforman en recortes;
- el bento con films en 05;
- el carrusel en táctil.

## 3. Decisión

La columna es **la historia de C**: el caos se ordena en la app real.

Se ejecuta con **el sistema de movimiento de B** y suma **la firma de cierre y las correcciones de cámara de A**.

Quedan afuera el teléfono viajero, el riel nuevo y cualquier dependencia nueva.

| # | Escena | Momento |
|---|---|---|
| 01 | Hero | El punto de la «ı» cae en el rack de Valentina. La sala se enciende desde ahí y el punto queda como ella. |
| 02 | Problema → orden | Los fragmentos, sobre sus zonas, mandan trazos de luz al punto. El punto está en la «ı» y el logo real se abre desde él. La sala pasa de fría a viva y suben las tres pantallas reales. |
| 03 | Entrenamiento | La serie de Valentina en números enormes del motor real. El teléfono muestra el `TargetCard` real con esos mismos números. Las repeticiones cuentan de 1 a 6. |
| 04 | Perspectivas | Llega al entrar (no al cargar la página), cambia de perfil sin remontar y marca la zona en blanco. |
| 05 | Producto | Cada módulo es una toma. «Que venga alguien → Voy» cruza la sala con el scroll y Sofía camina hasta Julián. |
| 06–07 | Probalo / caso | «PROBALO.» entra de golpe. Las puertas se revelan sin mover a sus vecinas. Bordes curvos navy↔crema y pasos que se dibujan. |
| 08 | Cierre | Toda la sala vuelve al punto y el punto se acomoda en la «ı». El logo se enciende y un trazo subraya la acción principal. |

Las tres firmas usan el mismo gesto: el punto, a veces en un sentido y a veces en el inverso. Eso le da a la página un vocabulario propio en lugar de efectos sueltos.

## 4. Reglas que no cambian

**Marca**
- Sólo Barlow y Barlow Condensed.
- El logo es siempre `Wordmark` o el mismo marcado (`wm_full.png` + punto `<i>`), nunca texto escrito.

**Color**
- Cian sólo para lo vivo: una persona, el punto, el dato que cambia o la acción.
- El foco de zona pasa a blanco.
- El equipo va en turquesa.

**Contenido**
- Sólo interfaz real: capturas de `public/conoce/shots`, componentes reales y el motor `@repi/domain/intelligence`.
- No se inventan paneles, cifras ni testimonios.
- Smart Center aparece sólo en `#caso`.

**Arreglos recientes del titular, que se respetan**
- Cabecera con «Ingresar» + «Pedir demo →».
- Sin barra fija abajo.
- «Pausar animaciones» en el pie.
- Botones rectangulares de 8 px, con el primario blanco.
- Reproductor de films con un resumen de una línea.
- Pie con Sovare alineado a la izquierda.

**Técnica**
- GSAP + ScrollTrigger + `@gsap/react`.
- Escenas fijadas con `position: sticky`, nunca con el pin de GSAP.
- Nada nuevo en npm.
- No correr vitest en apps/web.

**Rendimiento y accesibilidad**
- Sólo `transform`, opacidad y trazo.
- Ninguna lectura de diseño por cuadro.
- Todo reversible al subir.
- `prefers-reduced-motion` muestra una versión estática completa.
- «Pausar animaciones» detiene todo lo autónomo.
- SwiftShader y llvmpipe siguen con la sala en SVG.

## 5. Pasos, por impacto

P0 es la base que habilita el resto. Después, los pasos van ordenados por impacto. Cada paso es un commit propio y se puede revertir solo.

### P0 · Base común

1. **Tienda** (`sala/store.ts`). Campos nuevos:
   - `tone` (0–1): velo frío;
   - `cold`: personas en acero;
   - `gather` (0–1): la sala vuelve al punto;
   - `origin`: un punto [x, z] del mundo;
   - `walk` (0–1): Sofía camina hacia Julián;
   - `preview`: la zona bajo el hover.

   Además, un registro `stage.project(x, z) → {x, y}` que devuelve píxeles de pantalla:
   - lo publica el nivel visible (SVG o 3D);
   - se calcula con la toma de destino, no con la cámara amortiguada;
   - se llama sólo al medir (en el refresh), nunca por cuadro.

2. **Modelo** (`sala/model.ts`).
   - Personajes fijos:
     - `VALENTINA` en el rack, [-2, 1.2];
     - `JULIAN` en el rack de sentadilla, [-6, -3.6];
     - `SOFIA` = equipo #0.
   - Tomas nuevas:
     - `plan`: cenital, calculada en el cliente para coincidir con el encuadre `slice` del SVG;
     - `pedido`: racks y box en el mismo cuadro;
     - `cardio`.
   - Tomas que se abren:
     - `training`: en 3D, posición ≈ [1.5, 7.5, 9] mirando al rack; en SVG, zoom de 4 a 2,4;
     - `deportistas`: SVG de 3,6 a 2,4.
   - Un `lens` por toma y por ancho, que corre el punto de mira hacia el lado libre del texto. En SVG es un `translate` en px; en 3D, `camera.setViewOffset`.

3. **Sala SVG y 3D.**
   - Tope de zoom en 2,4.
   - El radio de las personas compensa el zoom, así siempre son puntos de 7 a 9 px.
   - Foco de zona en blanco.
   - Halos del equipo en turquesa.
   - Con `cold`, los socios se pintan en acero.
   - Capa `.sala-tone`, cuya opacidad es `tone`.
   - Valentina siempre presente, también en `medium` (que hoy recorta a 9 personas), con un anillo que respira y se pausa.
   - Se elimina el anillo 3D centrado en el origen del mundo.

4. **Director de tomas** (`sala/Stage.tsx`).
   - Guarda el offset de cada `[data-shot]` en el documento al montar, al cambiar el tamaño y en cada `ScrollTrigger.refresh`.
   - Por cuadro lee sólo `scrollY`.
   - Hoy llama a `getBoundingClientRect` en unas 10 secciones en cada cuadro de scroll.

5. **`<Say>`** (nuevo, `x3/Say.tsx`) y `useSay`.
   - Afirmaciones en Barlow Condensed 700 partidas por palabra en el servidor, así que no hay CLS ni salto al hidratar.
   - El texto real va en un `span` sr-only; la copia visual va `aria-hidden`, con cada palabra en su máscara.
   - `*palabra*` marca la palabra clave: arranca apagada, se enciende en blanco al llegar y debajo se dibuja un subrayado blanco.
   - Un ScrollTrigger con scrub por afirmación, de «top 85%» a «top 45%», reversible.

6. **`Roll` v2.**
   - Sin desenfoque.
   - `overflow: clip` por dígito.
   - Sólo `translateY` y opacidad, con `tabular-nums`.
   - Sirve a tamaño de pantalla.

7. **Desenfoques animados.** Se eliminan todos los `filter: blur` animados:
   - el titular de 02;
   - los dígitos;
   - `x3-swap`;
   - el wordmark del cierre;
   - la cabecera de perfiles.

8. **Viñeta del teléfono.** La franja superior baja a ≈ .35 para que la sala se vea arriba. La de abajo sigue en .92 por el contraste del texto.

9. **`x3/curves.ts`.**
   - Bézier cuadrática y cúbica.
   - 24 muestras por curva, una vez por refresh.
   - Interpolación por tabla, sin `getPointAtLength` por cuadro.

10. **`x3/gsap.ts`.**
    - Un solo ResizeObserver que refresca ScrollTrigger (se mueve desde `Problem.tsx`).
    - `ScrollTrigger.refresh()` después de `document.fonts.ready`.
    - `ScrollTrigger.config({ ignoreMobileResize: true })`.

### P1 · 02 «El caos se ordena en REPI» (firma; responde al comentario del logo)

**Estructura**
- La sección mide 300svh (260svh debajo de 760 px de ancho).
- El escenario es sticky de 100svh, con scrub .6 de `top top` a `bottom bottom`.
- Hay movimiento desde el progreso 0: no queda ningún tramo muerto.

**Composición**
- Arriba y al centro, a ≈ 26 % del alto, el `Wordmark` real (`clamp(132px, 14vw, 200px)`) sin su punto.
- El **hub** es el centro de ese punto de la «ı».
- Debajo, una celda que comparten el «Antes» y el «Ahora».
- Abajo, la banda de pantallas.

**Línea de tiempo**

**0–.10 · Caos vivo.**
- Cada fragmento flota sobre su zona (`stage.project`), con una zona de exclusión alrededor del texto y del hub:
  - la rutina en papel, sobre los racks;
  - la planilla, sobre la oficina;
  - «¿Qué me toca hoy?», sobre cardio;
  - «¿Cuánto le pongo a la prensa?», sobre las máquinas;
  - «Progreso — sin datos —», sobre el rack;
  - «Sala · hoy», sobre la oficina;
  - «Pedido de ayuda · Nadie lo vio», sobre el box.
- Vida en CSS (`translate` y opacidad): un temblor leve, un chat con puntos de «escribiendo» y el pedido parpadeando en acero (nadie lo vio, por eso no es cian).
- La sala está fría: `tone` en .45 y personas en acero.
- El titular «ANTES, CADA DATO *EN OTRO LADO.*» y su párrafo se ven desde que entra la sección.

**.08–.38 · Trazos de luz.**
- De cada fragmento sale al hub una curva orgánica: una bézier con control lateral, no una línea radial recta.
- Cada curva lleva un cometa: un guion brillante corto (`dasharray 24 L` con el dashoffset en scrub) y una estela tenue, que es la curva entera a .15.
- Están escalonados por distancia, así que llegan de a uno.

**.30–.52 · Absorción.**
- Cada fragmento viaja por su propia curva hasta el hub: endereza su rotación y escala de 1 a .15.
- Se apaga sólo en el último 20 % del viaje. El punto se lo traga; no se desvanece en su lugar.
- El «Antes» sale palabra por palabra hacia arriba, con máscaras.

**.50–.56 · El punto.** En el hub crece un punto cian hasta el tamaño exacto del punto de la «ı» (10,12 % del ancho del wordmark).

**.56–.64 · Nace el logo.**
- El punto ya está en la «ı».
- Las letras se abren desde el punto con una máscara circular: `clip-path: circle(0 at centro del punto)` → `circle(150%)`.
- En el cuadro en que se cierra la máscara, el punto viajero se entrega al `<i>` real del componente, en el mismo rectángulo y sin costura.

**.62 · El corte.**
- `tone` pasa de .45 a 0 en apenas .015 de progreso.
- Las personas pasan de acero a cian y turquesa.
- Un anillo fino sale una vez del logo hacia la sala.
- Es el cambio de color por sección de QCLAY, con sentido: la sala sin REPI y la sala con REPI.

**.64–.74 · Ahora.**
- «AHORA, CADA PERSONA CON *EL CONTEXTO* QUE NECESITA.» entra palabra por palabra, como un odómetro en las palabras que cambian. «CADA» queda quieta.
- «EL CONTEXTO» se enciende en blanco y se subraya.

**.70–.92 · Tres pantallas reales.**
- En escritorio suben tres teléfonos desde el borde inferior y quedan asomados: se ve la mitad superior, que es la que cuenta.
  - Izquierda: `floor.webp` («Hola, Sofía · En sala ahora · Julián Ortiz · Voy»), con el rol «El entrenador sabe a quién atender.»
  - Centro: `member.webp` («Hola, Valentina · Próximo entrenamiento TORSO A»), con «El socio sabe qué hacer en cada serie.»
  - Derecha: `owner.webp` («Ejecutivo · Tu guía REPI»), con «El dueño ve lo que pasa en su sala.»
- En teléfono sube un solo teléfono. Su pantalla cambia con un *push* como en la app (socio → sala → dueño) mientras el rol cambia con la rueda.

**.92–1 · Pausa** en el estado final, legible.

**Técnica**
- La medición se hace en `onRefreshInit`: primero se lee todo y después se escribe.
- Se vuelve a medir cuando cambia el nivel (`data-3d`), porque la proyección 3D difiere de la del SVG.
- Un solo `<svg>` con 7 `path`.
- Las sombras van horneadas en un pseudo-elemento estático; nada de `box-shadow` en movimiento.
- Las capturas usan `loading="lazy"` y se decodifican con `img.decode()` cuando la sección está a una pantalla.

**Costo**
- Por cuadro: hasta 7 transforms, hasta 7 dashoffsets y una opacidad.
- Pico de GPU: ≈ 9 MB en escritorio y ≈ 3 MB en teléfono.

**Movimiento reducido o pantalla baja (STACK_MQ).** Todo apilado y quieto:
1. «Antes…», con «EN OTRO LADO» en blanco;
2. el wordmark completo;
3. «Ahora…», con «EL CONTEXTO» subrayado;
4. las tres pantallas con su rol.

Sin fragmentos ni velo.

**Pausa.** Se detienen el temblor, la escritura y el parpadeo. El scrub sigue al scroll.

### P2 · 01 Hero «El punto cae y se vuelve persona»

**Primer pintado sin parpadeo.**
- Con movimiento permitido, el CSS del servidor pinta la sala en su estado apagado (.25), el mismo valor que pone la hidratación.
- Hoy la página va de brillante a oscura y de nuevo a brillante.
- `<noscript>` enciende la sala.

**A los 0,4 s, la caída.**
- El punto de la «ı» sube unos 12 px y cae en arco: x lineal, y `power2.in`, 0,9 s, escala de 1 a .6.
- Cae hacia un punto del mundo: `stage.project(VALENTINA)`, con la toma del hero y su `lens`.
- En escritorio cae a la derecha del texto. En teléfono cae en la franja superior, porque el texto está abajo.
- Nunca cruza el texto.

**Impacto.**
- Un aplaste (scaleX 2,2 / scaleY .3) que vuelve a un punto de 10 px.
- Dos anillos DOM finos.

**La luz se expande desde ahí.**
- Una máscara radial sobre la sala (el SVG y, si ya cargó, el 3D):
  `mask-image: radial-gradient(circle at var(--ox) var(--oy), #000 var(--r), rgba(0,0,0,.25) …)`.
- GSAP anima `--r` durante 1,4 s y al final se retira la máscara.
- Las personas aparecen cuando el radio las alcanza: unas 13 comparaciones por cuadro.
- Es «las líneas se dibujan» del brief, con la causa y el efecto en el mismo lugar.

**El punto queda como Valentina**, con su anillo que respira. El logo recupera su punto 0,3 s después del impacto.

**El 3D sin salto de punto de vista.**
- El canvas arranca en la toma `plan`.
- Cuando termina el fundido, si nadie hizo scroll, la cámara baja y gira hasta la toma 3/4 del hero en 2,4 s (un parámetro `intro` en el Rig).
- Si ya hubo scroll, adopta la toma actual.

**Salida con el scroll.**
- Un telón tipográfico corto: «CADA REPETICIÓN» se corre −12 % y se apaga; «CUENTA.» se corre +12 %.
- El sub, la bajada y los botones suben 40 px y se apagan antes.
- Es reversible. El LCP ya está fijado en ese momento.

**Movimiento reducido.** La sala está encendida desde el primer cuadro, con el punto en la «ı» y Valentina quieta.

**Pausa guardada.** La intro salta a su estado final.

### P3 · 03 «La serie, en grande y con datos reales»

**Primero, la veracidad.**
- La pantalla del teléfono pasa a ser una composición de interfaz real:
  - el encabezado de `training.webp`, recortado y sin números;
  - el `TargetCard` real (`components/member/TargetCard.tsx`) alimentado por `useEngine()`;
  - la fila de sensaciones, recortada y sin números.
- Ningún número de las capturas queda a la vista.
- Las ~20 reglas `.ti-*` se copian bajo `.x3-phone-screen`. No se importa `member.css` (106 KB).
- El ejemplo se alinea con la demo real de Valentina (press de banca 4 × 8–10, RIR 2):
  - `EX.sets = 4` en `Training.tsx` e `IntelSim.tsx`, y el texto pasa a «4 series»;
  - un script `tsx` suelto (no vitest) comprueba que el motor siga dando 62,5 kg × 8–10 y, para la serie 2, 62,5 kg × 8–10;
  - si el resultado cambia, quedan 3 series y el recorte deja afuera esa línea.

**Lo que se ve**
- El track mide 380svh (340svh en teléfono).
- La estrella es un subtítulo enorme:
  - una etiqueta en Barlow Condensed 600, apagada;
  - el valor en Barlow Condensed 700, `clamp(2.6rem, 13vw, 8.5rem)`;
  - una línea de explicación.
- Los cinco pasos:
  1. «TU EJERCICIO DE HOY» / «PRESS DE BANCA».
  2. «LO QUE HICISTE LA ÚLTIMA VEZ» / «60 KG × 10».
  3. «REPI RECOMIENDA» / «62,5 KG × 8–10», en cian. La razón del motor se escribe en una línea.
  4. «LA SERIE QUE HICISTE» / «62,5 KG × 1…6». Las repeticiones cuentan de 1 a 6 con el scroll, tomando `real.r` del motor, y el teléfono hace un pulso de 1 % con cada una.
  5. «LA PRÓXIMA SE AJUSTA» / «SERIE 2 · 62,5 KG × 8–10», en turquesa. La pantalla hace un *push* a la tarjeta de la serie 2, con el evento del motor.
- La tarjeta enciende la columna del paso actual.
- El teléfono entra en el primer 10 %, después flota ±6 px (pausable) y gira ±6° con el scroll.
- La sala pasa a una toma más abierta, con `tone` en .5.
- En teléfono angosto, todo entra en 100svh: el teléfono en el 44svh superior y la banda del subtítulo abajo. Hoy la narración empieza en y = 639 de una pantalla de 659 px.
- La lista de pasos queda como `<ol>` sr-only con `aria-current`. A la vista, 5 marcas de progreso.

**Costo.** `setState` se llama unas 11 veces en toda la escena: sólo cuando cambia el paso o la repetición.

**Movimiento reducido.**
- Sin sticky.
- La pantalla compuesta en su estado final.
- Una tabla estática con los cuatro valores (ANTERIOR, RECOMIENDA en cian, REAL y SERIE 2 en turquesa), más la razón y el evento.

### P4 · 08 «Vuelta al punto» (firma de cierre)

La sección mide 180svh y tiene un escenario sticky (PIN_MQ).

**0–.12.** Toma alta: la sala encendida y caminando. El wordmark del cierre, en acero a .35, con la «ı» vacía.

**.12–.50.**
- Cada persona deja su recorrido y viaja por una curva hacia el centro: Valentina primero y las demás escalonadas por distancia.
- Socios en cian, equipo en turquesa.
- Zonas, equipos y grilla se encogen hacia el centro y se apagan:
  - en SVG, `.sala-view` escala hacia `origin`;
  - en 3D, el grupo del plano escala hacia el origen y la cámara sube.

**.50–.62.** La sala entera es un solo punto cian, que se entrega a un punto DOM en la misma posición proyectada.

**.62–.74.**
- El punto sube en arco y se acomoda en la «ı», con un aplaste breve.
- El wordmark pasa de acero a blanco.
- Un anillo sale una sola vez.

**.72–.90.**
- «CADA REPETICIÓN / CUENTA.» sube en sus máscaras.
- Los botones aparecen escalonados (.06).
- Un trazo cian fino nace del punto y subraya «Quiero REPI en mi gimnasio».

**.90–1.** Pausa. Al subir, todos vuelven a sus recorridos.

**Técnica**
- Cada posición es `lerp(along(p, t), origin, k_i)`.
- El rectángulo de la «ı» se mide en el refresh.
- Se borran el `blur(10px)` y la escala del wordmark.

**Movimiento reducido.** Logo completo y en blanco, sala quieta en la toma alta, título y botones visibles, subrayado ya dibujado.

**Pausa.** Las personas no caminan, pero `gather` sigue al scroll.

### P5 · 05 «El pedido cruza la sala» y los módulos como tomas

**La sala vuelve a verse.** El degradé .86 de todo el ancho pasa a un velo sólo detrás de la columna de texto. El texto mantiene un contraste de al menos 4,5:1.

**Cada módulo es una toma** (`data-shot` en cada artículo; el director actual ya mezcla tomas anidadas):

| Módulo | Toma |
|---|---|
| Training Intelligence | rack |
| Sesión | rack |
| Progreso | `showcase` |
| Coach | box |
| Gestión | `pedido` |
| Comunidad | toma abierta |
| Body Intelligence | cardio |

**La firma: «Que venga alguien → Voy».**
- El bucle con autoplay pasa a un scrub del artículo Gestión.
- Nombres y textos salen de la demo real:
  - en `DemoTour`, «Julián marcó "Que venga alguien"»;
  - en `floor.webp`, «Julián Ortiz · Sentadilla … Voy».
- La secuencia:
  1. aparece la burbuja «Julián · Sentadilla — Que venga alguien»;
  2. un cometa cian recorre el piso en curva hasta Sofía (hoy el SVG no muestra nada de esto: se agrega el trazo en el plano);
  3. aparece la burbuja «Sofía · Sala — Voy», en turquesa;
  4. Sofía camina hasta Julián (`walk`, con una mezcla suave desde su posición actual).
- Se mantiene la etiqueta «Se activa por gimnasio».

**Cortes entre módulos.**
- Un barrido `clip-path` de 0,45 s sobre el visual saliente, en lugar del fundido con desenfoque.
- Los títulos de módulo usan `<Say>`.
- La gráfica cuenta de 60 a 67,5 kg mientras se dibuja (es un ejemplo ficticio y está rotulado así).

**Movimiento reducido.** Pedido y respuesta completos y quietos, con el trazo ya dibujado en el plano.

### P6 · 04 Cuatro perspectivas

- La entrada usa un ScrollTrigger de «top 85%» a «top 45%». Hoy corre al montar, a 6 400 px de distancia, y nadie la ve.
- El título usa `<Say>`, con «UNA SALA» encendida.
- El cambio de perfil ya no remonta el panel (se quita `key={p}`):
  - el titular se reescribe palabra por palabra;
  - las capturas se cruzan con ±24 px dentro de su caja reservada;
  - la lista se cruza escalonada.
- En escritorio, el hover o el foco sobre una pestaña pre-ilumina la zona en blanco.
- Zoom de 2,4 como máximo.

### P7 · 06–07 Probalo, puertas y crema

**«PROBALO.»**
- «NO TE LO CONTAMOS.» usa `<Say>`.
- «PROBALO.» entra de golpe al 85 % de la entrada (un `gsap.set` en una etiqueta, reversible), con un subrayado blanco rápido.

**Puertas sin reflujo.**
- Hoy, `mouseenter` cambia `flex` de 1 a 3,4 y empuja a las vecinas. El hover no cuenta como interacción para CLS, así que es la principal sospechosa del 0,036 de escritorio. Se confirma con la sonda de layout-shift antes de tocar nada.
- Las puertas quedan con un tamaño fijo. Al abrirse, el cuerpo se revela con un barrido `clip-path` y la captura sube 12 px.
- Con puntero fino, la puerta se inclina hacia el cursor (≤ 3°).
- «Iniciar esta demo» tiene respuesta de presión (.97, 120 ms).
- En táctil, el acordeón sigue igual.

**Bordes curvos.** Un SVG estático de alto reservado al inicio de `#caso` y su espejo al inicio de `#cierre`. No se interpola `background-color`.

**07.**
- La línea de «Cómo se empieza» se dibuja con el scroll (vertical en teléfono).
- El último paso hace un solo pulso.
- El panel de Smart Center se revela una vez con una máscara.

### P8 · Verificación y documentación

Detalle en §6. Al cerrar el bloque se actualizan:
- este archivo;
- `EXPERIENCE_3.md`;
- `docs/continuidad/PROXIMA_SESION.md`.

## 6. Presupuesto y verificación

**Build y servidor.** Build de producción local y `next start` con `cx-env.sh`.

**Grabaciones.** Se graban con `record.cjs` e `interact.cjs`:

| Grabación | Qué cubre |
|---|---|
| desk-high | escritorio con 3D |
| desk-low | escritorio con SVG |
| phone-low | teléfono con SVG (la referencia de fluidez) |
| phone-medium | teléfono con 3D forzado |
| interact-desk | clics en los perfiles, hover en las puertas y scroll hacia arriba |
| movimiento reducido (nueva) | la versión estática |
| Pausa (nueva) | animaciones pausadas |

Además:
- hojas a 6 fps;
- una sonda de posiciones por cuadro (el punto, los fragmentos, el wordmark y las cajas de texto) para los criterios de aceptación.

**Lighthouse móvil.** Mediana de 3 corridas:

| Métrica | Objetivo |
|---|---|
| Rendimiento | ≥ 85 |
| TBT | ≤ 200 ms |
| Accesibilidad | 100 |
| Buenas prácticas | 100 |
| SEO | 100 |

**Otras comprobaciones.**
- CLS en un scroll completo: ≤ 0,02 en teléfono y en escritorio.
- axe: 0 violaciones en `/conoce` y en los 4 perfiles; en teléfono y escritorio; con y sin movimiento; y con el reproductor abierto.
- Impeccable: 0 hallazgos.
- E2E: sólo `e2e/conoce.spec.ts` y `e2e/public.spec.ts` (Playwright, contra el servidor local). No se corre vitest en apps/web.
- SwiftShader sigue en `data-sala="low"`.
- phone-low se mantiene en ≥ 55 fps en las escenas 02, 03 y 08.

## 7. Riesgos

1. **Proyección SVG y 3D distintas.** Se vuelve a medir cuando cambia el nivel. El impacto del hero se calcula sobre el SVG, porque a esa altura el 3D todavía no cargó. El 3D arranca en `plan`.
2. **`clip-path` y `mask-image` repintan.** Son cortos y chicos. Si alguno se traba en Safari viejo, se reemplaza por un panel que se desplaza con `translate`.
3. **Texto partido por palabras.** El texto real va sr-only y la copia visual `aria-hidden`. Hay que revisarlo con VoiceOver y con axe.
4. **La «ı» queda vacía durante el scrub del cierre.** Hoy ya pasa en el hero. En reposo, con movimiento reducido y en la cabecera, el logo está entero. Se confirma con el titular en la revisión, sin bloquear el trabajo.
5. **El teléfono de 03 es interfaz real compuesta, no una captura literal.** La alternativa es recapturar la pantalla desde una demo con historial de 60 kg × 10, sólo sobre una base descartable con guardas.
6. **02 es la escena más compleja.** Se prototipa y se graba antes de seguir con el resto.
7. **Contraste al abrir los velos.** Hay que medirlo en 04, 05 y la viñeta del teléfono.

## 8. Fuera de esta pasada

- **Riel de cámara único y SVG 2,5D (A).** Candidato a una Motion 3 si el presupuesto medido deja margen.
- **De C:** el teléfono viajero, el bento con films y el carrusel táctil.
- **Inspiración (QCLAY y adrien.ninet):** avatares orbitando el título de perspectivas y la red de Aliados que reacciona al puntero.
- **Pedidos que se tratan en su propio paso:**
  - el pedido que el titular agregó en este turno: «Abrir ficha socio» desde Sala debe abrir una página sólo con la ficha de ese socio, no el listado de todos (tarea #49);
  - las transiciones de las apps (#45).

## 9. Punto de corte

El mínimo que se puede publicar es **P0–P4 + P8**: responde a los dos comentarios del titular y suma las tres firmas.

P5–P7 entran en la misma pasada si el presupuesto medido después de P4 lo permite.
