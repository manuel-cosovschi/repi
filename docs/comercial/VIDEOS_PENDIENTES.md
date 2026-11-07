# Videos de /conoce: hechos y pendientes (D205 → D208)

## Publicados con Experience 3.0 (D208, rama `claude/experience-3`, sin publicar hasta la aprobación del titular)

Films de motion graphics sobre la sala del gimnasio, con la interfaz real de la demo guiada (datos ficticios) como materia prima.
Sin voz ni locución: se entienden sin sonido. Música de Kevin MacLeod (CC BY 4.0) y efectos de Pixabay
(`marketing/videos/LICENCIAS.md`). 1920×1080 a 30 fps (el de deportistas también en 1080×1920). Versión web H.264 con
`faststart` y póster WebP en `apps/web/public/conoce/videos/`. Masters fuera de Git y reproducibles (`design/films/SPEC.md`).

| Id | Duración | Qué cuenta |
| --- | --- | --- |
| `film-marca` | 0:48 | Un punto en la sala; cada dato en otro lado hasta que todo se conecta; la marca; el objetivo de cada serie (53 kg × 8 → 50 kg × 8–10), el entrenador que sabe a quién atender, el dueño que ve su sala; la red; «Cada repetición cuenta» |
| `perfil-gimnasios` | 1:02 | La sala a ciegas → altas por QR con aprobación (Camila Ruiz), «Que venga alguien» → «Voy», el objetivo por serie, el Ejecutivo por sede y la red de socios, equipo y gerencia |
| `perfil-entrenadores` | 0:49 | Cada alumno en otro chat → clientes (Julián sin programa; Training Intelligence que dice «sin tendencia aún» en lugar de inventar), el programa versionado, la serie del alumno y «REPI propone. Vos decidís» |
| `perfil-deportistas` (+ `-vertical`) | 0:40 | Rutina lista (Torso A), check-in, objetivo por serie, descanso de 2:00, progreso por ejercicio y Mi cuerpo privado |
| `perfil-aliados` | 1:06 | La sala sin datos, el modelo B2B2C, recomendaciones que se explican, entrenadores independientes y gimnasios por sede, sin señal y sin tiendas, en operación en Smart Center Gym (logo autorizado). Reemplaza al video con locución |
| `f-intelligence` | 0:33 | Anterior 53 kg × 8 → REPI recomienda con la razón → Real 53 kg × 5 → la próxima 50 kg × 8–10; «Nunca sube a mitad de la sesión» |
| `f-progreso` | 0:23 | Progreso por ejercicio calculado desde lo que registrás y Mi cuerpo privado |
| `f-altas` | 0:24 | Un QR por sede; el socio pide acceso y el equipo confirma; «Identidad no es pertenencia» |
| `f-sala` | 0:24 | El socio pide ayuda desde su serie, el equipo responde; «una señal para acercarse, no un diagnóstico» |

**Regenerarlos:** `design/films/SPEC.md` (sección Producción). Si cambia la interfaz grabada, regrabar con
`design/films/kit/tools/rec-raw.mjs` (demo local con datos ficticios) y volver a correr `render-all.sh` con `FORCE=1`.

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
