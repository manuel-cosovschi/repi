# REPI Exercise Motion 1.0 — The Movement Library (D220)

Estado: implementado y probado localmente; publicación según `PROXIMA_SESION.md`. Interruptor: `exercise_motion` (`apps/web/src/lib/features.ts`).

## 1. Qué es

Una biblioteca oficial de demostraciones de ejercicios hecha por REPI: cada demostración es una **animación vectorial propia**
(un cuerpo articulado que se mueve entre poses clave escritas a mano), con la **técnica escrita** en español rioplatense, los
**músculos principales y secundarios** en un mapa de frente y de espalda, y el mapeo explícito al **catálogo global** de ejercicios.
Se ve en el entrenamiento del socio, en REPI Control («Ver ejecución»), en el panel del coach y del gimnasio, en REPI Admin
(«Demostraciones») y en el asistente («¿cómo se hace…?»).

## 2. Dirección de arte — «REPI Motion Lab»

- Escenario siempre oscuro (navy con luz arriba a la derecha), en los dos temas, como una pantalla de laboratorio.
- Figura técnica sin rasgos de persona (sin género, sin cara): volúmenes limpios claros; el lado lejano en un tono más oscuro.
- La zona que trabaja se pinta **en el propio cuerpo**: cian (principal) y turquesa apagado (secundario). Mismo código en el mapa.
- Equipamiento genérico, sin marcas: tubos, tapizados, palancas, poleas, pilas de pesas, discos y mancuernas en navy.
- Rótulo de fase arriba a la izquierda en Barlow Condensed (cian), controles en Barlow. Colores sólo con tokens (`styles/exercise-motion.css`).
- Fidelidad del ejercicio por encima de lo lindo: la animación muestra el equipo, el agarre, la posición y el recorrido reales.

## 3. Por qué animación vectorial propia (y no videos)

| Criterio | Animación propia | Video |
| --- | --- | --- |
| Licencia y origen | 100 % de REPI, sin terceros, sin marcas de agua | Grabación propia o licencia por clip |
| Peso | Un trozo de JS de decenas de KB para toda la biblioteca | MB por ejercicio |
| Sin conexión | Queda en la caché del service worker con el resto de la app | Requiere descargar cada archivo |
| Tema y accesibilidad | Se pinta con tokens; se pausa, se ralentiza, se salta a una fase | Controles del reproductor |
| Músculos | La zona se marca sobre el cuerpo en cada cuadro | No |
| Costo | Cero (sin almacenamiento, sin CDN, sin servicios) | Almacenamiento y tráfico |

Límite honesto: es una figura 2D. Los movimientos que ocurren hacia el observador se resuelven con vista frontal, cenital
(desde arriba) o escorzo; donde eso queda menos claro se anota en `review.notes` de la entrada.

## 4. Arquitectura

```
apps/web/src/lib/exercise-motion/
  types.ts        Pose, Key, Prop, MotionSpec (vistas lateral, frontal y cenital)
  rig.ts          Proporciones, cinemática inversa de dos segmentos, interpolación de poses
  kit.ts          Ayudas para escribir poses (HIP_H, onTrunk, shoulderOf, fromShoulder)
  draw.ts         Cuerpo → primitivas SVG con las zonas musculares
  render.ts       Cuadro (cuerpo + equipamiento por capas), encuadre fijo, cámara cenital
  muscles.ts      Músculos válidos y sus nombres
  musclemap.ts    Mapa muscular de frente y de espalda (zonas por músculo)
  library/        La biblioteca: un archivo por grupo + index.ts (LIBRARY, LIBRARY_VERSION)
  resolve.ts      El resolver único (ver §5)
  ref.ts          Lo liviano que viaja en las respuestas (MotionRef) y el orden de las fuentes
  validate.ts     Validaciones automáticas de cada entrada
  bundle.ts       Lo que las pantallas cargan bajo demanda
apps/web/src/components/exercise-motion/ExerciseMotion.tsx   Visor (escenario, técnica, músculos, video del gimnasio)
apps/web/src/server/training/exercise-motion.ts              motionFor(exerciseIds) para las respuestas del servidor
apps/web/src/server/training/motion-report.ts                REPI Admin › Demostraciones
```

Modelo de cada entrada (`library/types.ts`): `id`, `version`, `title`, `group`, `catalog` (nombres exactos), `compatible`
(nombre + diferencia), `equipment`, `motion` (vista, segundos, poses clave con rótulos, equipamiento), `technique` (setup,
execution, cues, mistakes, breathing), `anatomy` (primary, secondary), `review` (estado, fecha, notas). Origen y licencia de
todas: **animación original de REPI** (no hay fuentes externas que declarar).

## 5. Resolver y orden de las fuentes

- `resolveExerciseMotion({ name, global })`: sólo ejercicios del **catálogo global** (sin organización ni dueño) y por **nombre
  exacto**. Un ejercicio propio de un gimnasio, coach o alumno puede llamarse igual y ser otra cosa: no recibe demostración.
- `getExerciseDemonstration`, `getExerciseTechnique`, `getExerciseMuscleMap`, `getExerciseVariants`, `getMotionEntry`,
  `motionCoverage`: todo sale de la misma entrada.
- `getExerciseMediaForContext` (ref.ts), el orden de «cómo se hace»: **demostración oficial exacta → variante compatible
  (avisando la diferencia) → video o enlace del gimnasio o del coach (D164) → búsqueda externa**. El video institucional
  **nunca se oculta**: si existe, se ofrece en su pestaña junto a la demostración. La técnica escrita viene con la demostración.
- Variantes: explícitas en cada entrada; nunca por parecido de nombre. El visor dice «Variante compatible. La demostración
  muestra «X», no exactamente «Y». <diferencia>».

## 6. Integración

| Lugar | Qué cambia |
| --- | --- |
| Entrenamiento del socio | «Ver cómo se hace» abre la hoja con la demostración (antes: video del gimnasio o búsqueda en YouTube). Con reemplazo, la del ejercicio que se hace (también si el reemplazo se hizo sin conexión: `motionOf`). |
| REPI Control (/rutinas) | «Ver ejecución» en consultar y registrar. Contenido fijo: no guarda nada del socio y no queda nada al cerrar. El video del gimnasio sigue firmado por la sesión del kiosco. |
| Panel del coach y del gimnasio | «Videos de ejercicios» marca «Demostración REPI» / «Variante REPI» y permite verla. Cargar un video propio sigue igual. |
| REPI Admin › Demostraciones | Cobertura del catálogo y del uso real (series de 90 días, sólo totales), más usados sin demostración, biblioteca con estado de revisión y vista previa. Sin edición: se edita por PR. |
| Asistente (Adaptive Coaching 3.0) | Intención nueva `how_to` («cómo se hace…», «técnica de…», «qué músculos trabaja…»): responde con las claves y los músculos de la entrada oficial y la tarjeta «Ver demostración». Sin entrada, lo dice y deriva al profe. No es un chat nuevo ni usa IA. |

## 7. Sin conexión, rendimiento y costos

- La biblioteca va en un trozo de JS que se carga con `import()` cuando se abre una demostración y, en el entrenamiento, 1,2 s
  después de abrirlo (si alguno de sus ejercicios tiene demostración). El service worker guarda `/_next/static/` como siempre:
  después funciona sin conexión. No se tocaron IndexedDB, la cola de sincronización, los borradores, el descanso ni el audio:
  la referencia (`motion`, `motionSub`) viaja en la sesión que ya se guarda.
- Animación a 30 cuadros por segundo con `requestAnimationFrame`, sólo mientras está visible y la pestaña activa.
- Costo de infraestructura: **cero**. Sin almacenamiento, sin CDN, sin servicios ni licencias. Contenido oficial (código,
  versionado), institucional (videos del gimnasio/coach, D164, sin cambios) y privado (no hay) quedan separados.

## 8. Accesibilidad (WCAG 2.2 AA)

Pausa y reproducción (2.2.2), velocidad lenta, saltar a cada fase, `role="img"` con descripción de las fases, pestañas con
`tablist`/`tab`/`tabpanel`, chips con `aria-pressed`, aviso del músculo elegido en `aria-live`. Con «reducir movimiento» la
animación arranca quieta y sólo se mueve si la persona lo pide. Sin desborde horizontal a 320 px. Contraste sobre el escenario
oscuro con los tokens de la marca.

## 9. Revisión y publicación del contenido

- Cada entrada se revisa en una hoja de contactos (6 instantes del ciclo + cuadros grandes) y pasa `validateEntry`:
  cinemática alcanzable (≤ 1,5 cm), pies sobre el piso, nombres exactos del catálogo, músculos válidos, textos completos,
  rótulos de fase y duración razonable.
- Estado de revisión: todas **«Revisión interna de REPI»** (técnica estándar, sin validación profesional externa todavía). El
  visor y REPI Admin lo dicen. Cuando un profesional la valide, se cambia a `professional` en un PR.
- Para agregar una: escribir la entrada en `library/<grupo>.ts`, revisar la hoja, correr `tests/exercise-motion.test.ts`, PR.
- Para retirar una: sacarla del arreglo (o apagar todo con `NEXT_PUBLIC_REPI_FEATURES=-exercise_motion` + redeploy). No hay
  datos que limpiar.

## 10. Pruebas

- `apps/web/tests/exercise-motion.test.ts`: validaciones de cada entrada, unicidad, variantes, textos sin porcentajes ni tuteo,
  revisión honesta, mapa muscular, continuidad del ciclo, encuadre fijo, resolver, orden de fuentes, reemplazo sin conexión,
  privacidad (sin almacenamiento ni pedidos ni código de servidor), peso, `motionFor` (global vs. propio, módulo apagado).
- `packages/domain/src/brain/howto.test.ts`: intención `how_to`, método vs. ejercicio, ejercicio en curso, respuesta con y sin
  técnica, variante.
- `apps/web/e2e/exercise-motion.spec.ts`: visor en el entrenamiento (movimiento, pausa, velocidad, fases, técnica, músculos,
  accesibilidad), «reducir movimiento» a 320 px, sin conexión, REPI Control.

## 11. Cobertura

44 demostraciones: 44 ejercicios exactos y 15 variantes compatibles de los 191 del catálogo global. En producción cubren el
83,2 % de las series registradas sobre el catálogo global con demostración exacta (87,9 % con variantes). Lista completa y
pendientes: `COBERTURA.md`.
