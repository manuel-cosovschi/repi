# Métodos avanzados: series principales y etapas conectadas (D183)

Referencia técnica del bloque 02/06 (D183 y su cierre, D184). Código: `packages/domain/src/stages.ts`, `metrics.ts`, `prescription.ts`, `execution.ts`, `method-detect.ts`.

## Orígenes (D184)

Todos usan el mismo detalle (`ExerciseDetail`), el mismo validador (`validateDetail`), los mismos métodos (`applyMethod`), la misma regla de circuitos (`circuitIssues`) y el mismo editor (`ExerciseDetailEditor`; en la app del alumno con `member`, oscuro y desde abajo). No hay un motor por origen.

| Origen | Dónde se guarda | Cómo llega el método |
|---|---|---|
| Programa del coach o de sala | `program_exercise.detail` | Editor del constructor. Los borradores de IA del coach llegan al constructor y se ajustan ahí. |
| Rutina propia del alumno | `own_routine.exercises[].detail` → al empezar, `program_exercise.detail` de la sesión | «Método y series» en «Mis rutinas». También superserie y circuito. «Duplicar» copia los métodos con sus identidades. |
| Rutina importada | Igual que la propia, después de revisar | `detectMethod` y `detectGroupLabel` sobre la columna Técnica o Grupo, la nota o «A1/A2» en el nombre. Lo claro se aplica a la vista con «Dejar como nota»; lo ambiguo («drop» suelto, «pirámide», «superserie» sin pareja) se pregunta. El texto original queda en la nota. |
| Rutina de hoy de REPI | `program_exercise.detail` de la sesión | La IA elige de `none, drop_set, rest_pause, myo_reps, amrap_last`. `aiMethodDetail` lo deja pasar sólo en un ejercicio, nunca en básicos pesados ni con el check-in bajo, y siempre en la última serie. |

Con plan, `sets` son las filas registrables en todos los orígenes; las series principales de una rutina propia son de 1 a 10.

## Modelo

| Concepto | Dónde vive | Qué es |
|---|---|---|
| Ejercicio | `program_exercise` | El movimiento, con `sets`, `reps`, `rir`, `rest_sec` y `detail` (JSONB). |
| Fila registrable | `detail.setPlan[i]` | Una acción que se registra en `set_log` con `set_index = i`. Sin plan, «N series × reps» son N filas. |
| Serie principal (bloque) | `setPlan[i].block` | Agrupa la serie principal y sus etapas. «4 series» = 4 bloques. |
| Etapa | `setPlan[i].stage` | 0 = principal; 1..K = drop, mini serie (rest-pause o myo-reps) o bloque de cluster. Tipos de etapa: `drop`, `rest_pause`, `cluster`. |
| Identidad | `setPlan[i].id` | Estable entre versiones. Las filas sin identidad, de planes anteriores o «N × reps», usan `r<índice>` (determinista). |
| Grupo | `detail.group` / `groupKind` / `rounds` | Superserie, triserie, serie gigante o circuito. Una vuelta es una serie principal de cada ejercicio. |
| Resultado | `set_log` | Una fila por etapa hecha. Copia `spec_id`, `set_kind`, `block_index` y `stage_index` al registrar. |

`program_exercise.sets` sigue siendo la cantidad de filas registrables (hasta 40); las series principales salen de `planBlocks` (hasta 20, con hasta 8 etapas cada una). Así `logSet`, la cola offline y los conflictos no cambian.

### Tres capas que no se pisan

- **Programación:** `detail.setPlan`, en una versión congelada al usarse.
- **Objetivo sugerido:** hoy `suggest` es por ejercicio y no se aplica a planes con etapas (D182). La recomendación por etapa queda para el bloque 04/06, referida a `spec_id`.
- **Resultado real:** `set_log`.

## Lectura de planes anteriores (sin migración)

`normalizePlan`:

- Si todas las filas traen `block` y `stage` coherentes, se respetan.
- Si no, se deducen:
  - Un `drop` o `rest_pause` continúa la serie de arriba, que es como se armaban siempre.
  - Cualquier otro tipo abre una serie nueva.
- Un `cluster` anterior es ambiguo: no se sabe si cada fila era una serie o un bloque de la misma. Queda como serie separada, igual que antes, con `review: true`. El editor le pregunta al profe y no se convierte solo.
- Nunca cambia pesos, repeticiones ni notas.

Al guardar, `validateDetail` escribe identidad, bloque y etapa. Al comparar versiones, lo guardado se normaliza igual que lo nuevo, así que guardar sin cambios no crea una versión.

## Métodos

`applyMethod(detail, base, método, seriesElegidas, opciones)` no crea ni borra series principales y no cambia cargas del profe. Devuelve la lista de cambios para revisar.

| Método | Qué hace |
|---|---|
| Drop set | Agrega K drops conectados a las series elegidas (por defecto la última, 2 drops), sin carga: la elige el alumno con referencia (D182). Conserva los drops que ya había. |
| Rest-pause / Myo-reps | K mini series conectadas con la misma carga. La pausa es de 20 s en rest-pause y de 5 s en myo-reps. La cantidad es configurable. |
| Cluster | Parte la serie en K bloques conectados, con aviso del cambio de reps. |
| Top set + back-off | Marca el top set y los back-off. Conserva reps y pesos y avisa si un back-off pesa igual que el top. No inventa back-off. |
| AMRAP por repeticiones | Marca las series elegidas como AMRAP. El rango anterior queda como nota. |
| AMRAP por tiempo | `durationSec` más `countUnit` (rondas o repeticiones). Se registra el total. |
| Pirámide / invertida | Propone reps por serie (cada una sigue siendo una serie propia) y no toca cargas. |
| EMOM | `detail.emomSec`: cada serie principal es un intervalo. El descanso completa el intervalo. |
| Series rectas | En las elegidas, quita etapas y vuelve a «efectiva», siempre con confirmación. |

Las vueltas de un circuito gobiernan la ejecución:

- `syncCircuit` y `resizeBlocks` dejan a cada ejercicio con una serie por vuelta. Si hay que quitar series, se confirma antes.
- `validateProgramDoc` rechaza un circuito cuyas vueltas no coinciden con las series de sus ejercicios.

## Ejecución (app del alumno)

- Las etapas van debajo de su serie («↳ Drop 1»).
- La pausa antes de una etapa es la de la etapa (un drop, 0). El descanso de la serie corre recién al terminarla.
- **«Terminar la serie acá»** omite las etapas que faltan (D184, en el servidor):
  - Cada etapa va a `set_skip` por la cola offline (`kind: "skip"`, idempotente por sesión, ejercicio y fila). Nunca a `set_log`: no suma reps, tonelaje, tiempo, récords ni niveles.
  - Estados en la grilla: pendiente, en curso, completada y sin hacer. Tocar una etapa sin hacer permite completarla (el resultado manda) o «Volver a pendiente».
  - Entre dispositivos gana el cambio más reciente (`decideSkip`, hora del dispositivo acotada por el servidor). Un resultado registrado siempre gana: la omisión no se aplica y no se muestra. Sólo etapas: una serie principal no se omite así.
  - También con el entrenamiento terminado, como editar una serie.
  - Al abrir la sesión, manda el servidor (no hay nada pendiente en la cola). Las omisiones guardadas sólo en el teléfono por una versión anterior se suben.
- Completar con 0 repeticiones (o 0 s) se bloquea: si no se hizo, es «Terminar la serie acá».
- **EMOM** (D184): el intervalo en curso es de la sesión (`workout_session.interval_state`):
  - Se guarda ejercicio, serie, inicio en hora del servidor, duración y estado. El teléfono manda su hora de inicio, de cambio y de envío. El servidor la traduce con la diferencia entre la hora de envío y la suya, aunque el pedido haya esperado en la cola (`toServerMs`).
  - Cada dispositivo lo traduce a su reloj con la diferencia que observó al leer la sesión (`serverNow`).
  - Pausar lo interrumpe (en el teléfono y en el servidor) y terminar lo borra. Un intervalo vencido sin registrar la serie, o interrumpido, no se calcula: se ofrece «Volver a empezar el intervalo».
  - Un inicio de hace más de 6 h o más de un intervalo en el futuro no se guarda.
  - Requiere conexión sólo para que lo vea otro dispositivo; sin conexión, el teléfono sigue con su reloj y lo sube al reconectar.
  - No hay tiempo real: otro dispositivo lo ve al abrir o recargar la sesión.
- En superseries y circuitos, `comboStep` alterna recién al terminar la serie con sus etapas. Muestra «Vuelta k de R».
- Los pendientes de «Finalizar» cuentan series principales, no etapas.

## Métricas (`metrics.ts`)

| Métrica | Definición |
|---|---|
| Series principales | Bloques que no son de aproximación. Una serie está hecha si tiene al menos una fila registrada. |
| Aproximación | Aparte. No suma a reps, tonelaje ni récords. |
| Etapas | Programadas y hechas, aparte de las series. |
| Repeticiones | Filas hechas, sin aproximación, sin series por tiempo y sin AMRAP en rondas. |
| Tonelaje | Σ peso × reps de esas mismas filas, incluidas las etapas. Unilateral: reps por lado, sin duplicar. |
| Tiempo y rondas | Aparte. Nunca se multiplican por kilos. |

La usan:

- El resumen de la sesión, en el servidor y en el teléfono.
- El historial.
- La instantánea del Club.
- Los niveles. Antes, los niveles sumaban kilos × segundos en las series por tiempo.

`volumeKg` y `bestE1rm` excluyen la aproximación y las rondas. `stagesSkipped` (D184) cuenta las etapas omitidas sin registro: se informan y no son resultados.

## API (D184)

`server/training/detail-schema.ts` (zod de las rutas) acepta `id`, `block`, `stage`, `durationSec`, `countUnit`, `review` y `emomSec`, y hasta 40 filas. Antes los descartaba en silencio: guardar desde la app regeneraba identidades, un cluster nuevo volvía a «series separadas» y se perdían el EMOM y la duración del AMRAP. Lo cubre una prueba en `tests/methods-everywhere.test.ts`.

## Migración 0041 y reversión (D184)

- `CREATE TABLE set_skip` (sesión, ejercicio, fila, `spec_id`, `skipped`, `changed_at`; único por sesión, ejercicio y fila) y `ALTER TABLE workout_session ADD COLUMN interval_state jsonb` (nula). No reescribe filas.
- El código anterior ignora las dos. Reversión: `apps/web/scripts/rollback/0041_set_skip_interval.down.sql`; sólo pierde omisiones e intervalos en curso, nunca resultados.
- Aplicada sólo en `repi_test` y `repi_dev` locales.

## Migración 0040 y reversión

- **Expand:** `ALTER TABLE set_log ADD COLUMN spec_id text, set_kind text, block_index integer, stage_index integer`. Son nulas y sin índices ni restricciones. No reescribe filas.
- **Lectura compatible:** si las columnas son nulas, todo se deduce de la versión congelada (`rowRef`, `rowFlags`).
- **Escritura nueva:** `logSet` las completa al insertar.
- **Relleno histórico: no es necesario antes de producción.** Con las columnas nulas, todo se deduce de la versión congelada (`rowRef`, `rowFlags`) y la app lee igual (prueba en `methods-everywhere.test.ts`). Sirve para consultas y para Training Intelligence 2.0. Procedimiento preparado (D184), `apps/web/scripts/operations/backfill-set-log-stage.ts`:
  - Por defecto simula. `--apply` escribe por tandas (`--batch`, 500), cada una en una transacción.
  - Sólo filas con `spec_id is null` (idempotente; se puede cortar y retomar). No toca peso, reps, RIR, fechas, revisión ni `updated_at`.
  - Ambiguos (clusters anteriores a D183) y filas fuera del plan quedan nulos y se cuentan en el informe.
  - Antes y después: filas, Σ reps, Σ peso × reps y una huella md5 de (id, peso, reps, RIR, revisión). Si cambian dentro de una tanda, se revierte y se corta.
  - Registro JSONL de ids rellenados en `~/.repi-secrets/backfills/` y `--rollback=<archivo>` para dejarlos nulos exactamente.
  - Destinos: `--source=local` (repi_dev), `--source=test` y `--source=hosted`. En la alojada, escribir exige `--confirm=hosted`, y antes hay que hacer un respaldo (`scripts/operations/backup.ts`).
  - Probado sólo en `repi_test`. **No se ejecutó en producción.**
- **Reversión:**
  - El código anterior ignora las columnas, así que revertir el código es seguro.
  - Para quitarlas: `ALTER TABLE set_log DROP COLUMN …`. Sólo pierde copias deducibles.
