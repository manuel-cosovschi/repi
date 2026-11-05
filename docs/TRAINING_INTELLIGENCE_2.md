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

- **Relación:** exactamente una de `coach_client_id` (coach privado) o `gym_member_id` (equipo de sala de la sede), con la restricción `training_proposal_one_relation`, como `program_assignment`.
- Una propuesta abierta por relación, ejercicio y tipo (dos índices únicos parciales, uno por relación).
- La decisión guarda estado (`accepted` / `modified` / `rejected` / `kept`), quién, cuándo y nota. Queda auditada (`training_proposal.<estado>`). Una decisión no se pisa.
- Una propuesta decidida se sigue mostrando con su estado hasta que haya una sesión registrada nueva; recién entonces puede abrirse otra.
- **No cambia la rutina.** Para aplicarla, ver §8 bis.

### Archivos

- Migración: `apps/web/drizzle/0043_training_intelligence.sql`, aditiva y sin relleno.
- Reversión: `apps/web/scripts/rollback/0043_training_intelligence.down.sql`. El código anterior ignora las tablas, así que revertir el código no la requiere.
- Supabase: `apps/web/scripts/operations/hosted-0043.sql`, transaccional y **sin ejecutar**.
- Ensayo: `apps/web/scripts/operations/verify-0043.sh` (ver §14).
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
- **Equipo de sala (D191, cierre):**
  - `GET /api/gym/:org/members/:id/intelligence` y `POST /api/gym/:org/intel-proposals/:id` (`memberIntelligence`, `decideMemberProposal`).
  - Exige la capacidad `program.edit` **en la sede del socio** (entrenador de sala y coordinación: quienes arman su programa institucional) y el consentimiento `attendance_training` activo del socio. Sin consentimiento o revocado: 403 `consent_required`.
  - Dueño, gerencia y recepción: 403. No obtienen datos individuales por administrar. Un dueño que además tiene rol de sala en esa sede entra por ese rol.
  - Otra sede u otro gimnasio: 404 (no revela si existe).
  - Sólo lo entrenado con esa sede (`workout_session.gym_member_id`). Nunca el historial importado, la app privada, su coach ni datos de salud. La sensación por serie ya la ve la sala desde D178.
  - Mismo núcleo que la vista del coach (`relationIntelligence`): no hay una segunda lógica.
- **Personal trainer:** el modelo no tiene un rol aparte. Un personal trainer vinculado al gimnasio entra como entrenador de sala de la sede (programa institucional) o con su propia organización de coach y el permiso `training` del alumno. No se inventó un rol nuevo.
- **IA:** recibe la tendencia ya calculada, sin nombre, email ni datos de salud. No hay una llamada nueva a ningún modelo.

## 8 bis. De la propuesta al programa

1. En la ficha, «Aceptar (sin aplicar)», «Mantener programación» y «Rechazar» sólo registran la decisión. El texto lo dice: la rutina no cambia.
2. **«Revisar en el editor»** lleva la propuesta al editor que ya existe:
   - Coach: el constructor de programas, con el programa del cliente.
   - Sala: «Editar programa» del socio.
   - Viaja en `sessionStorage` (`components/coach/ProposalDraft.tsx`). No hay un segundo editor.
3. Arriba del editor aparece la propuesta. «Aplicar X kg al borrador» cambia sólo ese borrador:
   - Usa `applyLoad`, en las series de trabajo iguales del ejercicio.
   - Con top set, drops o pirámide, pide ajustarla en «Series y técnica».
4. Guardar sigue el flujo normal:
   - Coach: autoguardado con versión nueva si la vigente estaba usada.
   - Sala: «Guardar revisión» con motivo.
   - En los dos casos: permiso, autoría y auditoría de siempre.
5. Al aplicar, la propuesta se marca aceptada (si seguía abierta). Las sesiones registradas, los `set_log` y las versiones anteriores no cambian (probado).

## 8 ter. Unidades (kg / lb)

- Todo se calcula y se guarda en kg: objetivos, explicaciones (`why`, `review`, textos de ajuste y propuestas) y registros. Cambiar la unidad no recalcula ni reescribe nada (probado en servidor y E2E).
- Al mostrar, `localizeWeights(texto, unidad)` pasa cada «N kg» a la unidad elegida. Es sólo presentación: un texto ya en lb no tiene «kg» que convertir, así que no hay doble conversión.
- Cargar en lb exactamente lo que se ve (1 decimal) vuelve a kg con hasta ~0,03 kg de diferencia. Eso cuenta como «lo propuesto» (`decisionFor`). Lo registrado queda tal cual se cargó.
- También respetan la unidad: «Serie anterior», «REPI sugiere», «No vino el profe», «Antes de REPI» y el ranking de levantamientos.
- La ficha del coach y la de Gym siguen en kg, como el resto de esos paneles.

## 8 quater. Saltos de carga por equipo

- **Dónde se configura:** en «Series y técnica» de cada ejercicio del programa, sección «Equipo y saltos de carga». Se guarda en `detail.load`: `{ equipment, incrementKg, perSide? }`.
- **Quién lo configura:** quien puede editar ese programa (coach, sala con `program.edit`, o la persona en su rutina propia). Queda versionado como cualquier cambio. No hay migración nueva.
- **Equipos:** mancuernas, barra con discos, máquina de discos, máquina de placas, polea, pesa rusa y otro. «Por lado» sólo aplica a barra y máquina de discos; el salto total es el doble.
- **Uso en el motor:** `recommendExercise` y `adjustAfterSet` usan `loadIncrement(detail)` por defecto:
  - Para subir, el salto real.
  - Para bajar o estimar, el múltiplo armable hacia abajo.
  - Drops y back-off sin historia, también.
  - Un ejercicio sustituto en la sesión se trata como salto desconocido, porque es otro equipo.
- **Salto desconocido:** se usa la regla conservadora de siempre (D182) y el objetivo lleva `increment_unknown`. La tarjeta dice: «Carga de referencia: ajustala a los discos o mancuernas que tengas».
- **No es un inventario:** no dice qué discos o mancuernas hay.
- **Integración para el 05/06:** un catálogo de equipos por sede (por ejemplo `gym_equipment`: sede, tipo, salto mínimo, por lado) puede alimentar el mismo `increment`. Orden de prioridad:
  1. Detalle del ejercicio.
  2. Equipo de la sede para ese ejercicio.
  3. Desconocido.

  El motor no cambia: sólo quién resuelve el número.

- **Hecho en el 05/06 (D195):** el catálogo existe (`gym_equipment` + `gym_equipment_exercise`, por sede) y alimenta el mismo `increment` con ese orden de prioridad (`resolveLadder`).
  - Además de un salto, puede dar una lista explícita de cargas (`LoadLadder.loadsKg`).
  - `fitTargetsToLoads` ajusta los objetivos de reglas a esas cargas sin subir por redondeo (más de 10 % de diferencia: mantiene la carga con `equipment_fit` + `increment_too_large`) y sin tocar lo indicado por el profe.
  - El motor (`recommendExercise`, `adjustAfterSet`) no cambió.
  - Detalle: `docs/EXPERIENCE_UX_2.md` §5.

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
| Dominio | 321 (47 en `intelligence.test.ts` y 3 de `localizeWeights` en `units.test.ts`) |
| App | 340 (11 en `training-intelligence.test.ts` y 15 en `training-intelligence-hardening.test.ts`, contra la base descartable `repi_test`) |
| Guardas | 24/24 |
| E2E | `training-intelligence.spec.ts` y `training-intelligence-roles.spec.ts`, en Chromium con emulación de móvil (Pixel 7) y escritorio. Suite completa: 95 pasan, 0 fallan, 27 omitidas (las mismas de antes) |
| Código anterior + esquema nuevo | La suite de `main` (314) pasa sobre una base con la 0043 nueva aplicada |

Cobertura del cierre (pruebas de servidor sobre base real, no simulaciones):

- Coach independiente consulta, y otro coach no.
- Sala de la sede con consentimiento: sí. Sin consentimiento o revocado: 403.
- Otra sede u otro gimnasio: 404.
- Dueño, gerencia y recepción: 403. Dueño con rol de sala: sí.
- Propuestas cruzadas coach ↔ sede: 404.
- Propuestas aceptadas, mantenidas y rechazadas: auditadas y sin cambiar la rutina.
- Aplicación por la programación: versión nueva y `set_log` intactos; la próxima sesión sigue la carga del profe.
- Alumno en lb y cambio kg → lb a mitad de la sesión, con decimales (61,25 y 63,75).
- Equipo: mancuernas de 2 kg, barra de 1,25 kg por lado, sin configurar.
- Molestia durante la serie.
- Drop, top set + back-off y rest-pause.
- Historial importado (calidad baja, nunca en la vista del coach ni de la sede) y datos insuficientes.

E2E del cierre, en móvil y escritorio:

- Coach: propuestas en las tres decisiones, «Revisar en el editor» → «Aplicar» → versión nueva.
- Sala con turno ve la sección; el dueño no la ve ni en la API.
- Alumno en lb: tarjeta sin «kg», molestia que frena la subida, cambio a kg en medio de la sesión sin tocar los objetivos.
- Lo de antes: sin conexión y reconexión, y cambio de tema durante el descanso.

**No probado en dispositivos físicos** (iPhone ni Android) ni en Safari: sólo emulación en Chromium.

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

- **Saltos del equipo:** se configuran por ejercicio del programa. No hay un catálogo de equipos por sede: queda para el 05/06 (§8 quater).
- **Unidades en paneles de coach y Gym:** siguen en kg, como el resto de esos paneles.
- **Objetivos del alumno:** no ajustan reglas (no se inventan objetivos). La prescripción manda.
- **Volumen por grupo muscular:** no se usa para recomendar, porque la clasificación es libre.
- **Propuestas abiertas:** si cambia el tipo calculado, la anterior queda abierta pero no se muestra.
- **Demo:** el coach de la demo no tiene historia suficiente para propuestas. La E2E agrega cuatro sesiones ficticias a su propia demo, sólo en `repi_dev` local y sólo si la organización es demo.
- **Dispositivos:** no se probó en dispositivos físicos ni en Safari; sólo emulación en Chromium.

## 13. Para el bloque 05/06

Puede reutilizar sin tocar el motor:

- `RowTarget`, `targets` y `outlook` por ejercicio en `getSession`.
- `adjustAfterSet` y `topEvent`.
- `clientIntelligence`, `memberIntelligence`, `relationIntelligence`, `decideProposal` y `recordDecision`.
- `TargetCard`, `IntelSection`, `ProposalBanner` y el CSS `.ti-*`.
- `detail.load` y `loadIncrement` para un catálogo de equipos.

El rediseño puede cambiar la presentación (sesión, descanso, ficha) consumiendo los mismos contratos.

**05/06 (D195):** la sesión usa `SetGuide` en lugar de `TargetCard` (mismos `RowTarget`, misma región «Objetivo de serie N»). Las correcciones del historial no modifican `training_target` ni `training_proposal`: lo emitido queda como evidencia y las próximas recomendaciones leen el historial corregido, sin lo anulado.

## 14. Publicación de 0043 (aplicada en producción el 04/11/2026)

**Aplicación real (04/11/2026, ~18:17 UTC):**

- **Respaldo previo:** `backup-20261104-181026-41884040972`, verificado por el workflow (issue #18). Contiene 98 tablas, 3704 filas y 43 migraciones.
- **Antes:** producción en 0042, con los 43 hashes y fechas idénticos a los archivos del repositorio.
- **Aplicación:** `hosted-0043.sql` en una transacción, sin errores.
- **Después:**
  - 44 migraciones, con el hash `7c551dc6…`.
  - Dos tablas nuevas con dueño `repi_app`, 12 restricciones y 9 índices.
  - 0 restricciones sin validar en `public`.
- **Huellas iguales:** `set_log` (527), `workout_session` (46), `program_version` (66), `history_entry` y `consent_grant`.
- **`program_exercise`:** cambió entre las dos huellas por la edición de un coach real (auditada a las 18:13–18:15). Ninguna fila tiene el `xmin` de la transacción de la migración: la migración no escribió filas existentes.
- **Roles:** el permiso temporal de `postgres` sobre `repi_app` quedó revocado. Queda sólo la membresía preexistente de Supabase (sin `inherit` ni `set`).

**Qué hace:**

- Crea `training_target` y `training_proposal`, con sus claves foráneas e índices. Nada más.
- No modifica ni borra filas existentes.
- Las claves en cascada hacia el plan y la sesión sólo afectan a filas nuevas de estas tablas, nunca a `set_log`.

**Compatibilidad (probada):**

- **Código anterior con el esquema nuevo:** la suite de `main`, 314 tests, pasa con 0043 aplicada. El código anterior no lee estas tablas.
- **Código nuevo con el esquema nuevo:** 340 tests de app y 95 E2E.
- **Código nuevo sin 0043:** el entrenamiento funciona sin objetivos (falla aislada en `getSession` y `logSet`).

**Ensayo local** (`bash apps/web/scripts/operations/verify-0043.sh`, base descartable `repi_verify_0043` copiada de `repi_dev`, con los roles de producción):

1. Huella del historial antes: filas y md5 de `set_log`, `workout_session`, `program_version` e `history_entry`.
2. Aplica `hosted-0043.sql`: dos tablas, dueño `repi_app`, el hash registrado y la huella igual.
3. Un segundo intento falla entero, sin registro duplicado.
4. La reversión deja la huella igual, 43 migraciones y ninguna tabla nueva.
5. La reaplicación queda OK.
6. El migrador de la app (`scripts/migrate.ts`) la ve como ya aplicada.

**Procedimiento en producción** (lo ejecuta el titular, cuando decida publicar; este PR no lo hace):

1. Correr el workflow **«Respaldo»** (docs/RESPALDOS.md) y continuar sólo si termina en verde, con un respaldo **reciente** verificado.
2. Confirmar que producción está en 0042 (43 registros en `drizzle.__drizzle_migrations`) y sin las tablas de 0043.
3. Ejecutar `apps/web/scripts/operations/hosted-0043.sql`. Es una sola transacción, con `lock_timeout` de 5 s y una comprobación interna; si algo falla, no queda nada.
4. Verificar: 44 registros, el hash `7c551dc6…` y las dos tablas con dueño `repi_app`.
5. Recién entonces integrar este PR (despliega el código).
6. Si hiciera falta volver atrás: revertir el código alcanza, porque el anterior ignora las tablas. Sólo si se abandona el bloque, correr `scripts/rollback/0043_training_intelligence.down.sql` (transaccional).

