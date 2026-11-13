# REPI · Cinematic Motion Studio — SPEC común (Experience 3.0)

Films nuevos para `/conoce`. Música instrumental con licencia comercial, sin voz, sin locución. Se entienden sin sonido.
Cada film es un proyecto HyperFrames en `design/films/<film>/`, generado por `design/films/kit/build.py` desde su guion.

```text
GOAL:    entender qué hace REPI en segundos y querer probarlo; terminar en «repiclub.com/conoce».
OUTPUT:  HyperFrames 1920×1080, 30 fps (vertical 1080×1920 donde se indica).
LOOK:    suelo = la sala del gimnasio vista desde arriba (no un vacío):
         - piso #0F1620 con grilla de 2 m en #1F2B3B y zonas con borde #4A5D78;
         - tinta #F8FAFC y secundaria #9AA8BA;
         - acento cian #00D1FF sólo en el dato vivo (uno por plano) y turquesa #5DE6D8 para el equipo y las respuestas;
         - títulos Barlow Condensed 700 en mayúsculas, 104–128 px, tracking −2 %, una o dos líneas, tamaño 9–12 % del alto;
         - frases en Barlow 600 de 40–56 px; rótulos de tarjeta ≥ 34 px; nunca menos de 30 px a 1080.
         - wordmark: `wm_full.png` (315×154) a 400 px como máximo (`wm_400.png`, una remuestra); nunca más grande.
         Producto: grabaciones y capturas reales de la demo (datos ficticios). Films 4.0 (`s_shot`): el teléfono entra
         inclinado en 3D y se asienta plano; la cámara se acerca a 1,6–2× a la fila de la que habla el plano (recuadro
         cian sobre esa fila, el resto de la pantalla atenuado) y la tarjeta repite el valor que se lee en esa fila.
         Profundidad: paralaje entre el plano de la sala, el teléfono y las tarjetas; sin brillos, partículas ni vidrio.
OBJECTS: el teléfono con la app real; el plano de la sala (zonas: recepción con QR, peso libre, máquinas, box,
         oficina); personas como puntos (socio cian, equipo turquesa); la hoja de rutina en papel (crema #F4F1EA,
         tinta navy); el wordmark original (wm_full.png con el punto cian aparte).
MOTION:  entrada expo.out 0,6–0,9 s; cámara power2.inOut 0,5 s; salida power3.in 0,3 s; palabras con 0,08 s
         entre sí; puntos con resorte back.out(1.6). Título asentado = quieto. Algo nuevo cada 2–4 s.
TRANSITIONS (3–5 por film, con causa): los fragmentos que vuelan al punto y corte al logo en el golpe (sin fogonazo
         cian a cuadro completo), el teléfono que sale hacia arriba y el siguiente que entra desde abajo (corte en el
         cuadro más rápido), dip cut en el golpe de la música. Los cortes caen en el pulso (`beats()` + tools/beats.py).
SOUND:   - Base: la pista indicada en cada guion (LICENCIAS.md).
         - Efectos de HyperFrames (Pixabay): whoosh en cortes con movimiento (dos tomas alternadas), pop en
           números que aterrizan, impact-bass en la marca, riser una sola vez antes del pago.
         - Mezcla a −14 LUFS integrados y −1 dBTP.
BANNED:  vacío negro con elementos chicos en el medio; glow; partículas; vidrio; tres tarjetas en fila; título sobre
         captura atenuada; logo en una esquina; todo entrando con fade y subida; títulos que se mueven mientras se
         leen; métricas, clientes o testimonios inventados; voz o TTS.
QA:      snapshot de cada beat; tira de cortes; lectura a 360 px; audio medido (no escuchado) con
         `hyperframes audio`; check sin errores.
```

## Films y pistas (masters fuera de Git)

| Film (`design/films/<film>`) | Archivo web | Duración | Pista (Kevin MacLeod, CC BY 4.0) | Tramo |
| --- | --- | --- | --- | --- |
| `brand` / `brand-vertical` (4.0) | `film-marca` / `-vertical` (1080×1920) | 38,4 s | Heroic Age | 45,2 → 83,6 s |
| `gimnasios` (4.0) | `perfil-gimnasios` | 46,8 s | Five Armies | 68,4 → 115,2 s |
| `entrenadores` | `perfil-entrenadores` | 49,1 s | Exciting Trailer | 4,0 → 53,1 s |
| `deportistas` / `deportistas-vertical` | `perfil-deportistas` / `-vertical` (1080×1920) | 40,0 s | Volatile Reaction | 24,0 → 64,0 s |
| `aliados` | `perfil-aliados` | 66,5 s | Rising Game | 25,0 → 91,5 s |
| `intelligence` (4.0) | `f-intelligence` | 28,1 s | Volatile Reaction | 120,6 → 148,7 s |
| `progreso` | `f-progreso` | 22,5 s | Clash Defiant | 150,0 → 172,5 s |
| `altas` | `f-altas` | 23,5 s | Five Armies | 120,0 → 143,5 s |
| `sala` | `f-sala` | 23,5 s | Clash Defiant | 0,0 → 23,5 s |
| `modo-completo` / `modo-completo-vertical` (4.0) | `modo-completo` / `-vertical` (1080×1920) | 53,1 s | Volatile Reaction | 64,2 → 117,4 s |
| `modo-control` / `modo-control-vertical` | `modo-control` / `-vertical` (1080×1920) | 59,7 s | Clash Defiant | 203,0 → 262,7 s |

**Modos (D213).** `modo-completo` cuenta el circuito completo (el coach diseña y asigna, el socio recibe, registra y recibe la
recomendación, su progreso, el coach ve su evolución y el equipo de sala responde un pedido). `modo-control` cuenta REPI Control (D216, pedido del titular, en este orden): rutinas y cargas en papel (objeto hoja crema) →
(1) el profesor programa el entrenamiento y lo asigna (revisión 1) → el socio llega → (2) se identifica en la pantalla de rutinas
real (`/rutinas`, tablet 1280×800) con código y PIN → (3) «Consultar mi rutina»: ejercicios, peso sugerido por REPI, intensidad
(RIR) y descanso → (4) «Registrar mi entrenamiento»: termina Sentadilla y carga peso y repeticiones reales (72 kg × 5, RIR 2) →
(5) «Guardado» y «Entrenamiento terminado»: el historial se actualiza → (6) la profesora de sala ve la sesión en la ficha del
socio, con el sello «Pantalla del gimnasio» → (7) el QR opcional para el celular (no es el de ingreso) → «Tu equipo planifica.
Tus socios consultan y registran.» Escenas nuevas del kit: `s_tablet` (la pantalla de rutinas en una tablet apaisada, con
acercamiento de cámara opcional dentro de la pantalla y sonido de tecla en cada número), `s_arrive` (el socio entra por recepción
y llega a la pantalla, diagrama) y `s_end(kicker=…)` (nombre del modo bajo el wordmark). En vertical, la red de la sala se
reemplaza por un enunciado (no entra en 1080 de ancho). Grabaciones: `tools/rec-raw.mjs` (`ctl-kiosk-reg`, `ctl-staff`, `cmp-coach`,
`cmp-owner`, con `REPI_BASE=<demo local>`), que dejan a la vista la píldora «Demo» del producto. `ctl-results` (paso 6) se graba en
la misma demo «control» que `ctl-kiosk-reg`, como Carla Sosa (profesora de sala ficticia de Gimnasio Atlas): la demo sólo abre la
sesión de la dueña, que por permisos ve la asistencia pero no las series, así que la sesión de Carla se abrió con una fila de
`session` en la base local descartable (nunca contra dev ni producción). Los tiempos de los cortes en `build.py` (`SP`,
`ID_KEYS`, `REG_SP` y los tramos) son los de esas grabaciones: si se regraban, se vuelven a medir. Capturas de `/conoce`:
`tools/shots-control.mjs` → `apps/web/public/conoce/shots/control-*.webp`.

## Films 4.0 (12/11/2026): qué cambió en el kit

- **`s_shot`** (plano de producto con cámara): teléfono grande (hasta ≈ 45 % del ancho en 16:9 y casi a sangre en 9:16), entrada
  inclinada en 3D que se asienta, `cam=[(en_s, zoom, fy, duración)]` para acercarse a la fila exacta, `rings` para recuadrarla y
  tarjetas con el valor que muestra esa fila. Las fracciones (`fy`, `rings`) se miden sobre la grabación: si se regraba, se
  vuelven a medir. `s_device` (teléfono chico, plano) queda sólo para los films todavía no rehechos.
- **Grabaciones HD**: `tools/rec-hd.mjs` (capturas a 3× → 1170×2532, un MP4 por tramo, con marcas en `<tramo>.json`). Oculta sólo
  ruido de entorno (píldora y tarjetas de la demo guiada, cartel de avisos push no configurados, correos `.invalid` desenfocados).
- **Sin desenfoque de movimiento del render** en ningún film (`motion_blur` apagado por defecto): con él se veía ≈ 0,3 s el póster
  de la grabación en cada entrada de tarjeta y salida de escena.
- **Sin fogonazo cian** antes del logo; apertura parametrizable (`s_scatter(calls=None, appear, fly_lead, wave_at)`).
- **Wordmark a 400 px** en logo y cierre (`s_logo`, `s_end`), con la frase grande en Barlow Condensed palabra por palabra.
- **Texto chico**: tarjetas de la apertura 40/32 px, rótulos de tarjeta 34–38 px, dirección final 60 px (46 px si es larga en 9:16).
- **Cortes en el pulso**: `beats(pulso, [pulsos por escena])` calcula la duración de cada escena desde la grilla de `tools/beats.py`.
- **`modo-control`**: las escenas del profesor usan ahora `ctl-results` (ficha de Ana Pérez en Gimnasio Atlas, programa «Fuerza
  base · 3 días», revisión 2): misma persona, programa y gimnasio que la pantalla de rutinas. `ctl-staff` (Martina, Gym Norte) ya
  no se usa. El encuadre de «resultados» deja fuera la línea «00:19 · 4 series» (la sesión de la demo se grabó en 19 s).
- `build.py` falla con un error claro si falta una grabación o la pista (antes seguía en silencio).
- `tools/finish.py`: audio AAC 160 kb/s y tope de peso del archivo web (7,1 MB por defecto, `MAX_MB`): si el CRF 24 se pasa,
  sube a 26, 27 o 28 hasta entrar. `tools/describe.py [film ...]` regenera sólo las pistas de los films indicados.

## Producción

```bash
# 1. Medios (fuera de Git): grabaciones de la demo local (tools/rec-raw.mjs) en <medios>/footage y pistas en <medios>/audio.
# 2. Generar, revisar y renderizar (se saltea lo ya hecho; FORCE=1 rehace):
python3 design/films/kit/build.py [film ...]                  # proyectos HyperFrames
(cd design/films/<film> && npx hyperframes@0.8.193 check)    # sin errores ni avisos
REPI_MEDIA_SRC=<medios> OUT=<masters> design/films/kit/tools/render-all.sh [film ...]
# → <masters>/<film>-master.mp4 (CRF 16), -norm.mp4 (audio −14 LUFS / −1 dBTP) y web/<archivo>.mp4 + .webp
# 3. Copiar web/*.mp4 y *.webp a apps/web/public/conoce/videos/ y regenerar las descripciones en texto:
python3 design/films/kit/tools/describe.py   # <id>.descripcion.vtt (pista para lectores de pantalla)
```

- **Póster:** el segundo `poster` de cada film en `FILMS` es una escena representativa con el título y el panel a la vista (no el
  cierre a medio armar).

- **Teléfono:** cada escena de producto usa **un solo** `<video>` precortado con ffmpeg (`cut-<escena>.mp4`, CFR 30 fps, GOP 15) y
  su primer cuadro como póster debajo. Con varios `<video>` o con clips que arrancan a mitad de escena, el render de HyperFrames
  0.8.193 dejaba la pantalla del teléfono en blanco algunos cuadros. `tools/blank.py` lo controla en cada master (debe dar 0).
  `blank.py` también marca como «en blanco» las pantallas claras de la app del equipo (formularios blancos): mirar esos cuadros
  antes de darlos por falla. `modo-control` se renderiza sin `data-motion-blur` (`motion_blur=False` en su guion): con el
  desenfoque de movimiento, cada vez que un panel entraba o un equipo salía se veía unos 0,3 s el póster de la grabación (otra
  pantalla) en lugar del video.
- **Sonido automático:** whoosh en cada corte (dos tomas alternadas), impacto en la marca, pop en cada panel que aterriza, whoosh
  cinemático antes de que los fragmentos vuelen y riser que llega al golpe final.
- **Audio:** `tools/finish.py` normaliza con loudnorm en dos pasadas (objetivo −14,6 LUFS integrado para quedar en −14 ± 0,5 medido
  con EBU R128, pico verdadero ≤ −1 dBTP) y exporta la versión web (H.264 high, CRF 24, tope 3 Mb/s, `faststart`; el audio normalizado AAC 160 kb/s se copia sin recodificar, porque una segunda codificación AAC subía el pico verdadero por encima de 0 dBTP).
