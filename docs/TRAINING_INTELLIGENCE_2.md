# Training Intelligence 2.0 (bloque 04/06 · D191)

Motor determinista de objetivos por serie y por etapa, ajuste durante la sesión, tendencias y propuestas. Estado: **en PR, sin publicar**. Migración 0043 **sólo local**.

## 1. Tres objetos que nunca se pisan

| Objeto | Dónde vive | Quién lo escribe |
|---|---|---|
| Programación | `program_exercise` (`sets`, `reps`, `detail.setPlan`), versión congelada de la sesión | El profe (o el alumno en su rutina propia) |
| Objetivo de REPI | `training_target` (nuevo) | Training Intelligence |
| Resultado real | `set_log` | La persona, al completar la serie |

Training Intelligence no escribe en `set_log` ni en el programa. «Usar» en la tarjeta sólo carga el borrador; el registro sigue siendo lo que la persona completa.

## 2. Arquitectura

Un solo módulo de reglas puras, `packages/domain/src/intelligence.ts`, que usan el servidor y el teléfono sin conexión. Reutiliza `suggestNext` (doble progresión) y las señales y textos de `load-safety.ts` (D182). No hay un segundo motor de progresión.

| Capa | Función | Archivo |
|---|---|---|
| A · Datos | `historyRows` (una consulta con ventana) | `apps/web/src/server/training/intelligence.ts` |
| B · Contexto | `rowContext`, `rowClass` | dominio |
| C · Comparabilidad | `compareRows`, `comparableHistory` | dominio |
| D · Recomendación | `recommendExercise` | dominio |
| E · Seguridad | `suggestNext` + `SafetySignals` + reglas por método | dominio (D182) |
| F · Persistencia | `ensureTargets`, `closeTargets` | servidor |
| G · Ejecución | `adjustAfterSet`, `afterSetLogged` | dominio + servidor |
| H · Longitudinal | `sessionPoints`, `exerciseTrend`, `nextProposal` | dominio |
| I · Explicación | `why`, `review`, `reasons` (sólo reglas ejecutadas) | dominio |
| J · Presentación | `TargetCard`, mensaje del descanso, `IntelSection` | `components/member`, `components/coach` |

### Flujo

1. El alumno abre el entrenamiento: el teléfono lo crea localmente (offline-first) y encola el inicio.
2. Con la cola vacía, `GET /api/me/sessions/:id` devuelve `targets` por fila y `outlook` por ejercicio. `ensureTargets` emite los que faltan, de forma idempotente.
3. El teléfono guarda objetivos y tendencia con la sesión en IndexedDB.
4. Al completar una serie, el teléfono corre `adjustAfterSet` (mismas reglas, también sin conexión) y muestra un único mensaje. La serie viaja por la cola de siempre.
5. En el servidor, `logSet` confirma la serie. Después, fuera de su transacción, `afterSetLogged` fija la decisión del objetivo y reemplaza los objetivos siguientes si corresponde (`seq` + 1). Una falla en este paso nunca afecta el registro.
6. Al finalizar, los objetivos sin hacer quedan `not_done`.

## 3. Comparabilidad

Dos filas son la misma referencia sólo si tienen **la misma clase y la misma etapa**. Las clases son:

- `main` (work y al fallo)
- `top`
- `backoff`
- `warmup`
- `drop`
- `rest_pause` (también myo-reps)
- `cluster`
- `amrap` (por repeticiones)
- `amrap_time`
- `timed` (por segundos)

Niveles de coincidencia:

- **exact:** misma identidad estable de fila (`spec_id`, D183), salvo identidades posicionales `r<n>`.
- **equivalent:** misma clase y etapa. Cubre reordenamientos y versiones nuevas.
- **general:** sólo historial importado (no trae tipo ni etapa), y sólo para series principales.
- **none:** calentamiento, otra etapa (Drop 1 ≠ Drop 2), tiempo contra repeticiones, otra duración de AMRAP, o unilateral contra bilateral.

Un rango de repeticiones incompatible lo resuelve `suggestNext`: estimación prudente con `range_change`, o ninguna sugerencia.

### Ventanas (`TI_WINDOW`)

- Hasta **6 sesiones comparables en 180 días**. Historial importado: hasta 365 días, deduplicado por día y serie.
- La recomendación de hoy usa la **última** sesión comparable, que es lo que exige la doble progresión.
- Las sesiones anteriores sólo alimentan tendencias. Así una capacidad vieja no domina, y la inactividad (14/28 días) la frenan las guardas de D182.
- Seis sesiones son entre 2 y 6 semanas de un ejercicio que se hace 1 a 3 veces por semana: alcanza para ver una dirección sin procesar historial ilimitado.

### Calidad de la referencia

| Calidad | Condición |
|---|---|
| high | Coincidencia exact o equivalent, de REPI, de 28 días o menos, con 2 sesiones o más |
| medium | El resto de las coincidencias de REPI |
| low | Coincidencia general o historial importado (la tarjeta lo aclara) |
| none | Sin referencia |

## 4. Recomendación por tipo de fila

| Fila | Regla |
|---|---|
| Serie principal y top set | `suggestNext` con las filas comparables de la última vez y la cantidad de series de esa clase. Se conservan todas las guardas de D182 (molestia, lesión, RIR 0 o «al límite», energía baja, 14/28 días, cambio de rango). Con saltos de equipo conocidos (`increment`), el siguiente salto disponible y redondeo hacia abajo. |
| Back-off | Historia propia de back-off. Siempre un paso por debajo del objetivo del top. Sin historia, una referencia de −15 % del top para confirmar (`pending`). |
| Drop k | Historia propia del drop k. Repite esa carga, sin subirla sola, por debajo de la etapa anterior. Sin historia, una referencia de −20 % de la anterior (`pending`). Nunca copia la carga de la principal. |
| Rest-pause, myo-reps y cluster | Misma carga que la principal (lo pide el método). Las repeticiones de referencia son las propias. Una mini serie no sube por completar otra. |
| AMRAP por repeticiones | La misma carga que la última vez, con la meta de igualar o superar las repeticiones. |
| AMRAP por tiempo y series por tiempo | El resultado anterior como referencia. Nunca kilos a partir de segundos o rondas. |
| EMOM | Carga por la regla de la serie principal. El descanso es el intervalo: nunca se propone más descanso. |
| Aproximación | `not_applicable`. |
| Carga del profe | Manda el plan (`status: coach`). Las señales de seguridad se muestran igual. Una diferencia de un paso de carga o más con lo que calcularían las reglas queda en `review`: no cambia nada. |
| Sin referencia | «Todavía no tenemos una referencia comparable para esta serie.» Sin números. |

### Durante la sesión (`adjustAfterSet`)

Sólo puede **mantener o bajar exigencia**. Nunca sube, nunca toca filas registradas ni cargas del profe, y no inventa nada si falta el resultado.

| Prioridad | Evento | Qué hace |
|---|---|---|
| 1 | Molestia | Nada sube. Recomienda detenerse y consultar al entrenador o a un profesional de salud. |
| 2 | Profe | Mantener la carga indicada y avisar si no sale. |
| 3 | Serie más exigente (RIR 0, «al límite», RIR menor al objetivo − 1 o reps bajo el rango) | Mantener la carga. Con 3 reps o más bajo el piso, bajar un paso. Ofrece **+30 s** de descanso como propuesta. |
| 4 | Con margen o rango completo | No sube a mitad de la sesión. |

Un mensaje por vez, y cada código una sola vez por ejercicio y sesión (`intelSeen`). El temporizador nunca cambia solo: «Sumar 30 s» lo suma sólo si se toca.

## 5. Tendencias, propuestas y porcentajes

**Tendencia** (`exerciseTrend`):

- Se calcula con la mejor serie de trabajo de cada sesión comparable: 1RM estimado (Epley, 1–12 reps), o kilos y reps sólo para ordenar.
- Con menos de 3 sesiones, `insufficient`.
- Clases: `progressing`, `declining`, `plateau` (4 sesiones o más iguales), `effort_up` (mismo rendimiento y RIR que baja), `returning` (pausa de más de 28 días), `stable` y `variable`.
- Confianza: `possible` o `consistent` (3 cambios en la misma dirección o 5 sesiones o más). Nunca un estancamiento por una sola sesión.

**Propuesta** (`nextProposal`):

| Propuesta | Cuándo |
|---|---|
| Carga | Rango completo en todas las series, sin esfuerzo al límite. El incremento disponible más pequeño. |
| Repeticiones | Mismo peso, todavía no completa el rango. |
| Revisar con el profe | Estancamiento consistente sin completar el rango. |
| Posible descarga | Descenso con esfuerzo alto. Es una posibilidad para revisar, nunca automática. |
| Descanso | Más esfuerzo con el mismo rendimiento. |

Nunca propone cambiar la cantidad de series: sólo revisar. Con un programa del profe, la propuesta queda para su revisión (`requiresCoach`).

**Porcentajes** (`progressToGoal`):

- Fórmula: (actual − base) ÷ (meta − base) sobre kg, repeticiones o sesiones, con la fórmula escrita.
- Sin valor actual, «datos insuficientes».
- Ejemplos: de 60 a 80 kg con 70 kg actuales es 50 %; 9 de 12 sesiones es 75 %.
- No hay porcentajes de «desarrollo» corporal: Body Intelligence no es de este bloque.

## 6. Persistencia y versionado (migración 0043)

### `training_target`

- **Identidad:** usuario, sesión, `program_exercise`, ejercicio realmente hecho, versión congelada, `set_index`, `spec_id`, tipo, bloque y etapa.
- **Objetivo:** peso (texto decimal como `set_log`), reps mínimas, máximas y objetivo, RIR y RPE objetivo, descanso y descanso sugerido, `pending`, estado, acción, fuente y calidad.
- **Trazabilidad:** `detail` jsonb con motivos, guardas, texto, explicación, revisión, referencia anterior y los registros usados (ids de `set_log`).
- **Versión y decisión:** `algo_version` (`ti2.1`), `decision` (`accepted` / `modified` / `not_done`), `set_log_id` y `decided_at`.

Mapa de estados:

| Estado conceptual | Cómo se representa |
|---|---|
| Disponible | `ready` |
| Pendiente de datos | `no_data` |
| Limitada por seguridad | `limited` |
| Indicada por el profe | `coach` |
| Obsoleta o reemplazada | `superseded_at` con fecha y otra fila con `seq` + 1 |
| Aceptada o modificada | `decision` |
| Descartada | `not_done` |

Integridad:

- `(session, pe, set_index, seq)` es único, y hay **una sola vigente** por fila (índice parcial `superseded_at is null`).
- Dos pedidos simultáneos no duplican: `on conflict do nothing`, y el reemplazo es condicional a que la fila siga vigente.
- Una sesión terminada sólo se lee: no se recalcula aunque cambien las señales o el algoritmo.
- Cambiar la versión de la rutina o el ejercicio de la sesión deja obsoletos los objetivos de filas sin registrar.
- Las claves foráneas a plan, versión y ejercicio van en **cascada**: un objetivo es derivado. Los resultados siguen protegidos por las claves de `set_log`.

### `training_proposal`

- Una propuesta abierta por relación de coach, ejercicio y tipo.
- La decisión guarda estado (`accepted` / `modified` / `rejected` / `kept`), quién, cuándo y nota. Queda auditada.
- No cambia la rutina.

### Archivos

- Migración: `apps/web/drizzle/0043_training_intelligence.sql`, aditiva y sin relleno.
- Reversión: `apps/web/scripts/rollback/0043_training_intelligence.down.sql`. El código anterior ignora las tablas, así que revertir el código no la requiere.
- Supabase: `apps/web/scripts/operations/hosted-0043.sql`, transaccional y **sin ejecutar**.
- Orden de publicación: workflow «Respaldo» en verde → 0042 (PR #7) → 0043 → integrar.
- Si el código se publicara sin 0043, `getSession` y `logSet` siguen funcionando sin objetivos: la falla queda aislada.

## 7. Offline

- Objetivos y tendencia viajan en la sesión local (IndexedDB) y sobreviven a una recarga.
- El ajuste corre en el teléfono con las mismas reglas.
- La reconexión usa la cola existente (`set`, idempotente por id y revisión). Nunca convierte un objetivo en resultado ni pisa un registro. Un reintento no duplica objetivos (probado).
- La precarga del borrador usa el objetivo sólo **antes** de la primera serie registrada. Después manda la carga que la persona eligió.
- Al volver a leer del servidor sin pendientes, sólo se completan objetivos: nunca series, borradores, descanso ni intervalo.

## 8. Permisos y privacidad

- **Alumno:** sólo sus sesiones (`mySession`). Las señales de salud (molestias, lesiones, check-in) se usan para sus propios objetivos y no se muestran a nadie más.
- **Coach:**
  - `GET /api/coach/:org/clients/:rel/intelligence` exige `coach_owner` activo de esa organización y el permiso `training` del alumno.
  - Sólo ve sesiones entrenadas con ese coach. No ve historial importado, molestias, lesiones ni check-ins.
  - `POST /api/coach/:org/proposals/:id` verifica que la propuesta sea de su organización.
- **Gym (dueño, gerente, piso):** sin acceso a esta vista. Un dueño no obtiene datos de entrenamiento por administrar.
- **IA:** recibe la tendencia ya calculada, sin nombre, email ni datos de salud. No hay una llamada nueva a ningún modelo.

## 9. IA generativa

- El motor determinista resuelve comparabilidad, selección, rangos, límites, seguridad, objetivo, validación y persistencia.
- «No vino el profe» sigue usando `checkLoad` (D182) sobre la regla de progresión.
- La rutina que arma crea una sesión normal, cuyos números por fila salen de este motor.
- La IA recibe `tendencia` y la instrucción de no contradecirla.
- Sin proveedor (el caso local y de pruebas), todo funciona con reglas: no hay 503 en el entrenamiento.
- No se implementaron explicaciones generadas por IA: el texto mostrado es siempre el de las reglas ejecutadas.

## 10. Evidencia y supuestos

- **Referencia general:** ACSM 2026 Position Stand, *Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults* (DOI 10.1249/MSS.0000000000003897). Respalda progresión gradual, flexible e individualizada, y la autorregulación por esfuerzo percibido.
- **Precisión del RIR:** es autorreportado y su precisión varía con el ejercicio, la carga y la cercanía al fallo. Por eso se usa de forma conservadora: puede frenar una suba (0 o «al límite»), nunca justificarla por sí solo, y una sola serie fácil no sube nada.
- **Heurísticas del producto (no fórmulas validadas):**
  - Saltos de 1 / 2,5 / 5 kg.
  - −10 % ante molestia o pausa larga.
  - −15 % para back-off y −20 % para drop como referencias a confirmar.
  - Umbral de 1 % para «igual», 3 sesiones para una tendencia y 28 días para «retorno».
  - +30 s de descanso propuesto.
- **No se afirma:** recuperación fisiológica, sobreentrenamiento, ganancia muscular futura ni índices de fatiga.

## 11. Pruebas y rendimiento

| Pruebas | Resultado |
|---|---|
| Dominio | 315 (41 nuevas en `intelligence.test.ts`, secciones A–D, casos especiales 1–4 y 8, sesión, tendencias y porcentajes) |
| App | 325 (11 nuevas en `training-intelligence.test.ts`: persistencia E, métodos, profe, fatiga, alumno nuevo, coach y permisos, benchmark) |
| Guardas | 22/22 |
| E2E | `e2e/training-intelligence.spec.ts`, móvil y escritorio: escenarios B, D parcial, F, G y H |

Tiempos medidos en este contenedor (PostgreSQL 16 local), con 30 sesiones de historia, 6 ejercicios × 4 series (720 filas):

| Operación | Tiempo |
|---|---|
| `getSession` la primera vez (emite 24 objetivos) | 44 ms |
| `getSession` repetida | 24 ms |
| `logSet` + ajuste | 12 ms |
| 8 `getSession` simultáneos | 128 ms |

No son tiempos de producción.

Optimizaciones:

- Una consulta de historia con `row_number()` por ejercicio, apoyada en el índice existente `set_log_exercise_idx`.
- Objetivos persistidos: no se recalculan en cada apertura.
- El ajuste corre fuera de la transacción del registro.
- Sin LLM por serie.

## 12. Limitaciones

- **Saltos del equipo:** el motor los acepta (`increment`) y está probado, pero no hay todavía un dato persistido por gimnasio o equipo: se usa el paso del producto y la carga es editable.
- **Unidades:** la tarjeta muestra la unidad de la persona. Los textos explicativos (`why`) dicen «kg».
- **Objetivos del alumno:** no ajustan reglas (no se inventan objetivos). La prescripción manda.
- **Volumen por grupo muscular:** no se usa para recomendar, porque la clasificación es libre.
- **Gimnasio:** sin vista de Training Intelligence para entrenador de piso o personal del gym. Queda para el 05/06, con su modelo de permisos.
- **Propuestas abiertas:** si cambia el tipo calculado, la anterior queda abierta pero no se muestra.
- **Escenarios no verificados de punta a punta:**
  - Escenario C en el navegador: el coach programa y ve la ficha. Está cubierto por pruebas de servidor.
  - Escenario E en el navegador: está cubierto por pruebas de servidor.
- **Dispositivos:** no se probó en dispositivos físicos ni en Safari.

## 13. Para el bloque 05/06

Puede reutilizar sin tocar el motor:

- `RowTarget`, `targets` y `outlook` por ejercicio en `getSession`.
- `adjustAfterSet` y `topEvent`.
- `clientIntelligence` y `decideProposal`.
- `TargetCard` y el CSS `.ti-*`.

El rediseño puede cambiar la presentación (sesión, descanso, ficha) consumiendo los mismos contratos.
