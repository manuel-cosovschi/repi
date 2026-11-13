# Videos de /conoce: hechos y pendientes (D205 → D208)

## Publicados con Experience 3.0 (D208, rama `claude/experience-3`, sin publicar hasta la aprobación del titular)

Films de motion graphics sobre la sala del gimnasio, con la interfaz real de la demo guiada (datos ficticios) como materia prima.
Sin voz ni locución: se entienden sin sonido. Música de Kevin MacLeod (CC BY 4.0) y efectos de Pixabay
(`marketing/videos/LICENCIAS.md`). 1920×1080 a 30 fps (deportistas, marca y los dos modos también en 1080×1920). Versión web
H.264 con `faststart` y póster WebP en `apps/web/public/conoce/videos/`. Masters fuera de Git y reproducibles (`design/films/SPEC.md`).

**Films 4.0 (12/11/2026):** `film-marca`, `modo-control`, `modo-completo`, `perfil-gimnasios` y `f-intelligence` se rehicieron con
el teléfono grande y cámara (acercamiento a la fila exacta, tarjeta con el valor de esa fila), grabaciones en alta resolución,
cortes en el pulso de la música y cierre con el wordmark a su tamaño nítido.

**Segunda tanda 4.0 (13/11/2026, rama `claude/films-6`):** `perfil-entrenadores`, `perfil-deportistas` (16:9 y 9:16), `perfil-aliados`,
`f-progreso`, `f-altas` y `f-sala` se rehicieron con el mismo kit. Abren con el producto en el primer segundo (aliados, con la
marca), usan material nuevo grabado en una demo local y ya no queda ningún film en la versión 3.0.

| Id | Duración | Qué cuenta |
| --- | --- | --- |
| `film-marca` (+ `-vertical`) | 0:38 | Apertura de 7 s (cada dato en otro lado hasta que todo se conecta) y la marca; el objetivo de cada serie (REPI recomienda 53 kg × 8; hizo 5 de 8 → 50 kg × 8–10); la profesora de sala toca «Voy» en el pedido de Julián; el dueño ve Seguimiento de sala (12 de 16 pedidos resueltos en 30 días, pedidos y resueltos por semana); la red; «Cada repetición cuenta» |
| `perfil-gimnasios` | 0:47 | La sala a ciegas → altas por QR con aprobación (Camila Ruiz: «Lo conozco» → acceso aprobado), el pedido de Julián → «Voy», el objetivo por serie, Seguimiento de sala del dueño (12 de 16 resueltos; pedidos y resueltos por semana) y la red de socios, equipo y gerencia |
| `perfil-entrenadores` | 0:41 | Clientes de un vistazo (Julián Ortiz, sin programa) → ficha de Valentina (última sesión, hace 3 días) y su registro de sesiones (Remo en polea «+2,5 kg vs. la vez anterior») → el programa «Hipertrofia · 3 días», versión 1 (Torso A · Press de banca 4 × 8–10 · RIR 2) → lo asigna a Valentina y Julián → la serie del alumno (REPI recomienda 53 kg × 8; hizo 5 de 8 → 50 kg × 8–10) → «REPI propone. Vos decidís»; «Usalo con tus alumnos» |
| `perfil-deportistas` (+ `-vertical`) | 0:38 | Rutina lista (Torso A) → «¿Cómo llegás hoy?» con los tres toques (energía 4, sueño 3, ánimo 4) → objetivo por serie (53 kg × 8 → 50 kg × 8–10) → el descanso corre solo → evolución de Press de banca (mejor serie 53 kg × 9) → Mi cuerpo (80,4 kg, objetivo 76 kg; «sólo lo ves vos»); «Probá la demo» |
| `perfil-aliados` | 0:48 | La marca («Tecnología para entrenar») → el modelo B2B2C (gimnasios y entrenadores la contratan; socios y alumnos la usan) → recomendaciones que se explican → entrenadores independientes (clientes y ficha) → gimnasios por sede (Seguimiento de sala: 12 de 16 resueltos) → «Registra sin señal. Se instala sin tiendas» → «Ya funciona en Mar del Plata» con el logo autorizado de Smart Center Gym → la red; «Proponé una alianza» |
| `f-intelligence` | 0:28 | Un solo plano sobre la fila de la serie: Anterior 53 kg × 9 → REPI recomienda 53 kg × 8 → Real 53 kg × 5 → la próxima 50 kg × 8–10, con la razón escrita; «Nunca sube a mitad de la sesión» |
| `f-progreso` | 0:23 | Progreso (90 días: 6 sesiones, 82 series) → mejores marcas → evolución de Press de banca (mejor serie 53 kg × 9; 1RM estimado 68,9 kg, «una estimación») → Mi cuerpo (80,4 kg, objetivo 76 kg; privado); «Mirá tu progreso» |
| `f-altas` | 0:26 | El gimnasio muestra el QR de la sede (QR para sumarse · Palermo) → lo que abre en el teléfono del socio («Pedí tu acceso a REPI · Gym Norte · Palermo») → el equipo aprueba a Camila Ruiz («Lo conozco» → acceso aprobado); «Identidad no es pertenencia» |
| `f-sala` | 0:27 | Un mismo pedido de punta a punta, en la misma demo: Valentina pide «Ayuda con un ejercicio» al equipo de sala → la profesora Sofía Ramírez lo ve en «Sala › Pendientes» (T-1115, sin responsable) y lo toma → Valentina ve «Tu pedido: asignada · Sofía» → el dueño ve Seguimiento de sala (12 de 16 resueltos); «Quiero REPI en mi gimnasio» |

### Modos de REPI (D213, rama `claude/repi-control-films`)

Mismo kit y mismas reglas. Archivos en `apps/web/public/conoce/videos/` (con `-vertical` 1080×1920 para teléfonos) y pista de
descripciones `.descripcion.vtt`. Ya están en `VIDEOS` (`apps/web/src/content/conoce.ts`).

| Id | Duración | Qué cuenta |
| --- | --- | --- |
| `modo-completo` (+ `-vertical`) | 0:53 | El coach diseña «Hipertrofia · 3 días» (Torso A · Press de banca 4 × 8–10 · RIR 2) y lo asigna a Valentina y Julián; la socia recibe Torso A; REPI recomienda 53 kg × 8 y, tras 5 de 8, ajusta a 50 kg × 8–10 con la razón; su progreso (6 sesiones, 82 series en 90 días); el coach ve «+2,5 kg» en Remo en polea contra la vez anterior; el equipo de sala responde «Voy»; «REPI Completo · Entrenamiento inteligente» |
| `modo-control` (+ `-vertical`) | 1:00 | D216 · rutinas y cargas en papel → el profesor programa el entrenamiento y lo asigna (ficha de Ana Pérez en Gimnasio Atlas: «Fuerza base · 3 días», revisión 2; misma socia, programa y gimnasio que la pantalla) → el socio llega y se identifica en la pantalla de rutinas (`/rutinas`, real) con código y PIN → ejercicios, peso sugerido por REPI (69,5 kg × 5–6), intensidad y descanso → termina Sentadilla y registra lo real (72 kg × 5, RIR 2) → «Guardado» y «Entrenamiento terminado» → la profesora de sala ve la sesión con el sello «Pantalla del gimnasio» → QR opcional para el celular; «REPI Control · Tu equipo planifica. Tus socios consultan y registran.» |

Capturas reales para `/conoce` (`apps/web/public/conoce/shots/`): `control-bienvenida.webp` (bienvenida sin la lista de personas
de la demo), `control-identificar.webp` (PIN con tres puntos), `control-rutina.webp` («Consultar mi rutina»: objetivo del profesor, sugerencia de REPI y última vez), `control-registro.webp` (la serie 1 de Sentadilla cargada, antes de confirmar) y `control-equipo.webp`
(ficha del socio en la app del gimnasio: revisión 2 y su historial). Se rehacen con `design/films/kit/tools/shots-control.mjs`.

**Regenerarlos:** `design/films/SPEC.md` (sección Producción). Si cambia la interfaz grabada, regrabar con
`design/films/kit/tools/rec-hd.mjs` (teléfono, alta resolución) o `rec-raw.mjs` (pantalla de rutinas), siempre contra la demo
local con datos ficticios, volver a medir las fracciones de `cam`/`rings` en `build.py` y correr `render-all.sh` con `FORCE=1`.

## Pendientes (segunda tanda)

Mismo kit y mismas reglas (sin voz, datos ficticios, sólo funciones disponibles en `ESTADO_Y_LIMITES.md`, sin cifras de clientes
ni promesas médicas o de resultados físicos).

| Id sugerido | Función | Duración | Material de la demo | Mensaje |
| --- | --- | --- | --- | --- |
| `f-registro` | Registro de cada serie | 20–25 s | Alumno: completar series, descanso automático, «Molestia», cambiar ejercicio | Carga, reps y RIR con un toque |
| `f-cuerpo` | Mi cuerpo (etapa 1) | 20 s | Alumno › Progreso › Mi cuerpo: peso, objetivo y comparador de fotos | Privado; medidas en desarrollo |
| `f-ia` | IA para borradores | 30 s | Coach › Nuevo programa › «Armar con REPI»; alumno › «No vino el profe» (con la clave de IA configurada) | Una propuesta que una persona revisa |
| `f-alumnos` | Gestión de alumnos | 25 s | Coach › Clientes › Valentina (Resumen, Rendimiento) | Cada alumno a fondo |
| `f-comunidad` | Comunidad y desafíos | 20 s | Dueño › Comunidad; alumno › desafíos | Motivos para volver, con participación voluntaria |

Para sumar uno: agregar el guion a `FILMS` en `design/films/kit/build.py`, renderizarlo, sumarlo a `VIDEOS` en
`apps/web/src/content/conoce.ts` (con su pista en `music`) y poner `video: "<id>"` en la función correspondiente de `FEATURES`.

## Antecedentes

- D205: grabaciones verticales con subtítulos en pantalla (reemplazadas por los films de D208).
- D205: video de aliados con locución de ElevenLabs (`marketing/videos/aliados/`), superado: el titular no quiere locuciones.
- `documentacion/motion/previews/REPI_motion_M01-M05_60fps.mp4`: animación del logo y transiciones (motion M01–M05).
