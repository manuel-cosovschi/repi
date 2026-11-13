# Licencias de música y efectos — films de /conoce (D208; rehechos con el kit 4.0 el 12 y el 13/11/2026)

Los films de `/conoce` no tienen voz ni locución (decisión del titular: nada de ElevenLabs ni TTS). Usan música instrumental con
licencia que permite uso comercial y efectos de sonido libres. No se usa ninguna canción con copyright sin licencia.

## Música — Kevin MacLeod (incompetech.com), Creative Commons Atribución 4.0

Licencia: <https://creativecommons.org/licenses/by/4.0/>. Permite uso comercial con atribución. La atribución se muestra en la
página `/creditos` del sitio (enlazada desde el pie; toma la pista de `Video.music` en `apps/web/src/content/conoce.ts`) y en este
archivo. Los MP4 no llevan el crédito incrustado: si un film se comparte fuera del sitio, hay que acompañarlo con el texto de
atribución.

Texto de atribución: «[Título]» Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License.

Cada film usa un fragmento recortado, normalizado a −14 LUFS (AAC 160 kb/s en los films 4.0) y sincronizado con la imagen: para CC BY 4.0 es material adaptado
(§1(a)) y hay que indicar la modificación (§3(a)(1)(B)). `/creditos` lo dice así: «Música: «[Título]», Kevin MacLeod
(incompetech.com, con enlace), licencia CC BY 4.0 (con enlace). Fragmento editado y sincronizado con la imagen.»

| Film (archivo web) | Pista | Tramo usado |
| --- | --- | --- |
| `film-marca` y `film-marca-vertical` (films 4.0) | Heroic Age | 45,2 → 83,6 s |
| `perfil-gimnasios` (film 4.0) | Five Armies | 68,4 → 115,2 s |
| `perfil-entrenadores` (film 4.0) | Exciting Trailer | 4,0 → 45,2 s |
| `perfil-deportistas` y `perfil-deportistas-vertical` (films 4.0) | Volatile Reaction | 24,4 → 62,5 s |
| `perfil-aliados` (film 4.0) | Rising Game | 34,4 → 82,3 s |
| `f-intelligence` (film 4.0) | Volatile Reaction | 120,6 → 148,7 s |
| `f-progreso` (film 4.0) | Clash Defiant | 150,3 → 173,2 s |
| `f-altas` (film 4.0) | Five Armies | 120,5 → 146,3 s |
| `f-sala` (film 4.0) | Clash Defiant | 0,3 → 27,4 s |
| `modo-completo` y `modo-completo-vertical` (films 4.0) | Volatile Reaction | 64,2 → 117,4 s |
| `modo-control` y `modo-control-vertical` | Clash Defiant | 203,0 → 262,7 s |

Origen: descargas directas de incompetech.com. Los archivos de audio no van a Git (`design/films/*/assets/media/`, ignorado).

Segunda tanda (13/11/2026): los seis films rehechos usan las mismas seis pistas que ya tenían; sólo cambió el tramo de cada una
(tabla de arriba). No se descargó ni se compró ningún archivo nuevo, y siguen sin voz ni locución.

## Efectos — Pixabay Content License

`whoosh`, `whoosh-short`, `whoosh-cinematic`, `pop`, `impact-bass-1`, `impact-bass-2`, `riser` y `key-press` (teclado de la
pantalla de rutinas en `modo-control`), del paquete de efectos de
HyperFrames (`media-use/audio/assets/sfx`, origen Pixabay). Licencia: <https://pixabay.com/service/license-summary/> — uso
comercial sin atribución obligatoria. No van a Git (`assets/sfx/`, ignorado; el generador los copia).

## Imagen y tipografía

- Interfaz: grabaciones de la demo guiada local de REPI con datos ficticios (`design/films/kit/tools/rec-raw.mjs` y, en alta
  resolución para los films 4.0, `design/films/kit/tools/rec-hd.mjs`). Nunca se graba contra producción.
- Wordmark: el archivo aprobado `wm_full.png` (315×154), mostrado a 400 px (una sola remuestra, `wm_400.png`); no se redibuja.
- Logo de Smart Center Gym: autorizado por el gimnasio (mismo archivo que `/conoce`, `apps/web/public/conoce/smart-center-gym.webp`).
  Desde el 13/11/2026 aparece en `perfil-aliados` (placa «Ya funciona en Mar del Plata», 34–38 s); antes ningún film lo mostraba.
- Barlow y Barlow Condensed: SIL Open Font License (`design/films/*/assets/fonts/*-OFL.txt`).

## Superado

`marketing/videos/aliados/` (video con locución de ElevenLabs, D205) queda como antecedente; el archivo publicado
`perfil-aliados.mp4` se reemplaza por el film sin voz.
