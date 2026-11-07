# Licencias de música y efectos — films de Experience 3.0 (D208)

Los films de `/conoce` no tienen voz ni locución (decisión del titular: nada de ElevenLabs ni TTS). Usan música instrumental con
licencia que permite uso comercial y efectos de sonido libres. No se usa ninguna canción con copyright sin licencia.

## Música — Kevin MacLeod (incompetech.com), Creative Commons Atribución 4.0

Licencia: <https://creativecommons.org/licenses/by/4.0/>. Permite uso comercial con atribución. La atribución se muestra en el
reproductor de `/conoce` debajo de cada film (`Video.music` en `apps/web/src/content/conoce.ts`) y en este archivo.

Texto de atribución: «[Título]» Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License.

| Film (archivo web) | Pista | Tramo usado |
| --- | --- | --- |
| `film-marca` | Heroic Age | 30,0 → 78,0 s |
| `perfil-gimnasios` | Five Armies | 68,0 → 129,6 s |
| `perfil-entrenadores` | Exciting Trailer | 4,0 → 53,1 s |
| `perfil-deportistas` y `perfil-deportistas-vertical` | Volatile Reaction | 24,0 → 64,0 s |
| `perfil-aliados` | Rising Game | 25,0 → 91,5 s |
| `f-intelligence` | Volatile Reaction | 120,0 → 153,0 s |
| `f-progreso` | Clash Defiant | 150,0 → 172,5 s |
| `f-altas` | Five Armies | 120,0 → 143,5 s |
| `f-sala` | Clash Defiant | 0,0 → 23,5 s |

Origen: descargas directas de incompetech.com. Los archivos de audio no van a Git (`design/films/*/assets/media/`, ignorado).

## Efectos — Pixabay Content License

`whoosh`, `whoosh-short`, `whoosh-cinematic`, `pop`, `impact-bass-1`, `impact-bass-2` y `riser`, del paquete de efectos de
HyperFrames (`media-use/audio/assets/sfx`, origen Pixabay). Licencia: <https://pixabay.com/service/license-summary/> — uso
comercial sin atribución obligatoria. No van a Git (`assets/sfx/`, ignorado; el generador los copia).

## Imagen y tipografía

- Interfaz: grabaciones de la demo guiada local de REPI con datos ficticios (`design/films/kit/tools/rec-raw.mjs`).
- Logo de Smart Center Gym: autorizado por el gimnasio (mismo archivo que `/conoce`, `apps/web/public/conoce/smart-center-gym.webp`).
- Barlow y Barlow Condensed: SIL Open Font License (`design/films/*/assets/fonts/*-OFL.txt`).

## Superado

`marketing/videos/aliados/` (video con locución de ElevenLabs, D205) queda como antecedente; el archivo publicado
`perfil-aliados.mp4` se reemplaza por el film sin voz.
