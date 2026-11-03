# Métodos avanzados: series principales y etapas conectadas (D183)

Referencia técnica del bloque 02/06. Código: `packages/domain/src/stages.ts`, `metrics.ts`, `prescription.ts`.

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
- **«Terminar la serie acá»** omite las etapas que faltan:
  - Se guarda localmente como `skip`. El servidor no las registra.
  - Al volver a leer la sesión del servidor, `keepLocalOnly` las conserva.
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

`volumeKg` y `bestE1rm` excluyen la aproximación y las rondas.

## Migración 0040 y reversión

- **Expand:** `ALTER TABLE set_log ADD COLUMN spec_id text, set_kind text, block_index integer, stage_index integer`. Son nulas y sin índices ni restricciones. No reescribe filas.
- **Lectura compatible:** si las columnas son nulas, todo se deduce de la versión congelada (`rowRef`, `rowFlags`).
- **Escritura nueva:** `logSet` las completa al insertar.
- **Relleno histórico (opcional, no ejecutado):**
  - Es determinista desde la versión congelada (`rowRef(detail, sets, set_index)`).
  - Se corre en tandas y sólo sobre filas con `spec_id is null`.
  - Verificación: las métricas recalculadas antes y después tienen que dar lo mismo, porque no dependen de las columnas.
  - No se aplicó en producción.
- **Reversión:**
  - El código anterior ignora las columnas, así que revertir el código es seguro.
  - Para quitarlas: `ALTER TABLE set_log DROP COLUMN …`. Sólo pierde copias deducibles.
