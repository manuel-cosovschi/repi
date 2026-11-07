# REPI Experience 3.0 — Dirección creativa y especificación ejecutable

Surface brief de `/conoce` (modo **Persuade**). Identidad fija: Concepto 2 · Friendly Performance (PRODUCT.md, DESIGN_CONTRACT.md).
Estructura elegida por el titular (07/11/2026, entre tres opciones sorteadas con Impeccable `concept-seed`): **«La sala en vivo»**.

## Auditoría (resumen, 07/11)

**Landing actual (D205):**

- Hero partido: título y teléfono.
- Selector de 4 tarjetas, bloque de Training Intelligence, grilla de videos, 12 tarjetas de funciones, demos en 4 tarjetas, pasos en tarjetas, FAQ y formulario.
- El detector de Impeccable marca: *kicker* sobre títulos, tarjetas anidadas, fondo crema por reflejo y 13 viudas tipográficas.
- Los videos son grabaciones de pantalla con títulos (y uno con locución de ElevenLabs).

**Referencia comercial (fmanalytics.com.ar / Sumify), en cuatro movimientos:**

1. **Caos visible:** burbujas de WhatsApp y comprobantes volando alrededor de un teléfono.
2. **Colapso al orden:** un teléfono negro con el logo y «Tu institución, en orden».
3. **Historia anclada:** el teléfono queda fijo mientras cambian pantalla y texto por pasos, con barra de progreso y panel de escritorio que entra.
4. **Prueba:** contador grande animado.

Se toman los principios, no el diseño.

**Videos de inspiración del titular:**

- **QCLAY (Hero Inspo):** íconos dispersos que convergen en un teléfono, tarjetas en órbita, bento revelado por partes, cambio de color por sección, escena de QR, avatares orbitando el título y un trazo orgánico al pie.
- **adrien.ninet:** hover con revelado, carga tipográfica, globo 3D de partículas, entrada de un teléfono con burbujas, bento con medios, fondo ilustrado con parallax y red orbital que reacciona al mouse.
- **Tutoriales de Claude:** subtítulos cinéticos grandes con palabra resaltada y teléfono 3D flotando.

**Herramientas:**

- Impeccable 4.8 instalado en el proyecto (sin hooks). HyperFrames 0.8.193 con sus skills.
- GSAP 3.15, three 0.187, @react-three/fiber 9.8 y drei 10.7: compatibles con React 19.3 y Next 16.4.
- **Música:** la sesión de HeyGen no está iniciada y MusicGen no está instalado. Se usan pistas instrumentales con licencia comercial gratuita, registradas en `marketing/videos/LICENCIAS.md`.

## Concepto

**La sala en vivo:** la página es la sala del gimnasio vista desde arriba. Un plano oscuro (navy) con líneas finas, zonas reales y personas en movimiento:

- **Recepción** con el QR.
- **Racks y máquinas.**
- **Box del entrenador.**
- **Oficina del dueño.**
- **Socios** (cian) y **entrenadores** (turquesa).

Cada escena es un movimiento de cámara a una zona, donde la interfaz real de REPI aparece en contexto. El hilo conductor es el punto cian del logo: cae al plano y lo enciende.

**Leyes visuales:**

- **Fondo:** el plano es el fondo de la página, no una ilustración dentro de una tarjeta.
- **Una sola tipografía de impacto:** Barlow Condensed 700 en mayúsculas para las afirmaciones. Barlow para todo lo demás.
- **Cian sólo para lo vivo:** el dato que cambia, la acción, la persona. Nunca como decoración ni como resplandor.
- **Interfaz real:** capturas reales de la demo (`public/conoce/shots`) o componentes reales (simulador con `@repi/domain/intelligence`). Ningún panel inventado.
- **Contraste de intensidad:** las escenas intensas (hero, entrenamiento, perfiles, cierre) se alternan con momentos de lectura (problema resuelto, Smart Center en crema claro, formulario).

## Escenas

| # | Escena | Qué pasa | Implementación |
| --- | --- | --- | --- |
| 01 | **Hero** | El wordmark aparece. El punto de la «ı» se desprende, cae al plano y lo enciende: las líneas se dibujan, aparecen zonas y personas. Título «CADA REPETICIÓN CUENTA.», propuesta de valor y dos CTA reales (MIRÁ REPI EN ACCIÓN abre el film de marca; PROBÁ LA DEMO). | HTML para el título (LCP). Plano en WebGL (R3F) cargado después; SVG del mismo plano como base y alternativa |
| 02 | **Problema → orden** | Sobre las zonas flotan fragmentos sueltos (rutina en papel, planilla, mensaje, consulta, progreso, pedido) que parpadean desconectados. Con el scroll REPI los une con trazos de luz y se ordenan en el teléfono y el panel. «Antes, cada dato en otro lado.» → «Ahora, cada persona con el contexto que necesita.» | ScrollTrigger con *scrub* y *pin*; SVG y DOM |
| 03 | **El entrenamiento cobra vida** | Zoom de cámara a un rack: aparece el teléfono 3D. Ejercicio → historial → objetivo recomendado → se registra la serie → se actualiza el siguiente objetivo con su explicación. ANTERIOR → RECOMENDADO → REAL con números que se transforman. Después, el simulador real para probarlo. | R3F (teléfono con textura de captura real) y contadores. Valores del motor real (`recommendExercise` / `adjustAfterSet`) |
| 04 | **Cuatro perspectivas** | Elegir un perfil mueve la cámara a su zona. Gimnasio → recepción (QR) y oficina (panel). Entrenador → box (programas, clientes). Deportista → el teléfono en la mano. Aliados → la cámara sube y la sala entera se vuelve diagrama B2B2C. Cada perfil: problema, qué cambia, interfaz real, video y CTA. `/conoce/<perfil>` preselecciona. | Estado de perfil más transición de cámara; contenido de `PROFILE_CONTENT` |
| 05 | **Producto** | Siete módulos sin grilla de tarjetas: Training Intelligence, Entrenamiento, Progreso, Espacio del coach, Gestión del gimnasio, Comunidad y Body Intelligence (etapa actual). Una lista fija a un lado y un escenario que se transforma: la gráfica de progreso se construye; el pedido «Que venga alguien» viaja del socio al entrenador y vuelve «Voy». | ScrollTrigger con pasos y escenario por módulo |
| 06 | **Probalo** | «NO TE LO CONTAMOS. PROBALO.» Cuatro puertas grandes (roles) con vista previa que se expande y explica qué se explora; el botón inicia la demo real (`/api/demo`). | Reutiliza `DemoLauncher`/rutas existentes |
| 07 | **Smart Center** | Momento calmo y creíble, en crema claro: logo autorizado, contexto real, funciones que usa y pedido de demostración. Sin cifras ni testimonios. | Estático, con una entrada sutil |
| 08 | **Cierre** | La cámara sube y toda la sala converge en el punto cian, que vuelve al logo. «CADA REPETICIÓN CUENTA.» Jerarquía de CTA: QUIERO REPI EN MI GIMNASIO (principal) · SOY ENTRENADOR · PROBAR LA DEMO · HABLAR CON REPI (WhatsApp). Formulario existente. | GSAP y R3F |

**Navegación comercial:**

- Barra superior con «Pedir demo» siempre visible.
- Índice de escenas en el costado en escritorio.
- En el teléfono, CTA fijo inferior compacto que se esconde al bajar y aparece al subir. No tapa contenido clave.

## Sistema de movimiento

- **Motor único:** GSAP con ScrollTrigger y `@gsap/react` (`useGSAP` limpia al desmontar). R3F para la sala 3D, renderizando sólo cuando cambia (`frameloop="demand"` y `invalidate` desde las timelines).
- **Firmas:**
  1. La caída del punto (hero).
  2. Trazos de luz que conectan (problema).
  3. Números que se transforman, con cambio de profundidad tipo dígito físico (Training Intelligence).
  4. Cámara que vuela entre zonas (perfiles).
  5. Convergencia final.
- **Entradas:** sin el mismo fade-up en todo. Cada escena tiene su propia entrada (dibujo de líneas, máscara, escala, foco).
- **Microinteracciones:** botones con respuesta de presión; puertas de demo con inclinación al cursor en escritorio (en táctil, con un toque); selector de perfiles con indicador que se desliza.
- **Movimiento reducido:** sin cámara ni *scrub*. Cada escena muestra su estado final; el contenido es el mismo.
- **Scroll hacia atrás:** todas las timelines son reversibles.

## 3D y niveles de calidad

**Tres niveles, decididos en el cliente:**

- **Alto:** escritorio con WebGL2 y GPU no débil. Sala 3D completa y teléfono 3D.
- **Medio:** teléfonos modernos. Sala 3D con menos geometría y DPR ≤ 1,5; sin sombras.
- **Bajo:** sin WebGL, con `prefers-reduced-motion`, ahorro de datos o pocos núcleos. La misma sala en SVG con animaciones CSS y GSAP livianas. Nunca una pantalla vacía.

El canvas se carga con importación dinámica después del primer pintado y se libera al desmontar.

## Videos (HyperFrames, 1920×1080 a 30 fps; vertical 1080×1920 para deportistas)

Hechos (D208): diez films generados desde `design/films/kit/build.py` (spec, pistas y producción en `design/films/SPEC.md`).

| Archivo web | Film | Dónde se abre en `/conoce` |
| --- | --- | --- |
| `film-marca` | 01 · Marca, 48 s | Hero: «Mirá REPI en acción» |
| `perfil-gimnasios` | 02 · Gimnasios, 1:02 | Escena 04, perfil Gimnasios |
| `perfil-entrenadores` | 03 · Entrenadores, 0:49 | Escena 04, perfil Entrenadores |
| `perfil-deportistas` (+ `-vertical`) | 04 · Deportistas, 0:40 | Escena 04, perfil Deportistas (9:16 en teléfonos en vertical) |
| `perfil-aliados` | 05 · Aliados, 1:06 (reemplaza al de locución) | Escena 04, perfil Aliados |
| `f-intelligence` | 06 · Training Intelligence, 0:33 | Escena 05, módulo Training Intelligence |
| `f-progreso`, `f-altas`, `f-sala` | 07–09 · Funciones, 0:23–0:24 | Escena 05, módulos correspondientes |

**Reglas para todos los videos:**

- **Audio:** sin voz. Música de Kevin MacLeod (CC BY 4.0, atribución en el reproductor y en `marketing/videos/LICENCIAS.md`) y
  efectos de Pixabay. Mezcla a −14 LUFS y −1 dBTP.
- **Capturas:** grabaciones de la demo con datos ficticios, siempre dentro de motion graphics (sala, títulos, paneles con los
  valores de la acción), nunca el video terminado.
- **Archivos:** los masters quedan fuera de Git y se pueden regenerar (render determinista). En `public/` van sólo las versiones
  web y los pósters.
- **Reproductor:** diálogo modal, sonido sólo porque la persona tocó «reproducir», `preload="metadata"`; nada se descarga hasta abrirlo.

Pendientes (segunda tanda): registro de cada serie, Mi cuerpo, IA para borradores, gestión de alumnos y comunidad
(guiones en `VIDEOS_PENDIENTES.md`).

## Conversión y medición

- **Se conservan:** UTM y QR, eventos de `site_event` (`profile_select`, `video_play` y avance, `demo_start`, `whatsapp_click`, `lead_submit`) y el formulario de leads hacia REPI Admin.
- **Eventos nuevos:** sólo `scene_view` por escena, una vez por visita, y `film_open`. Sin rastreo del scroll.
- **A/B:** titular y CTA del hero salen de `content/conoce.ts` (`HERO_VARIANTS`) con un parámetro `?v=` para probar variantes en el futuro, sin plataforma externa.

## Criterios de aceptación

Se cumplen los siete momentos WOW del máster con evidencia: capturas, grabación de escritorio y teléfono, Lighthouse móvil, axe, el detector de Impeccable, E2E de rutas, formularios y demos, y la revisión de cuadros de cada video.
