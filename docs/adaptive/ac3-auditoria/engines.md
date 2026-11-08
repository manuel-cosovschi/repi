# AC3 Fase A · Auditoría de motores de entrenamiento (área «engines»)

Repo `/home/user/repi`, rama `claude/adaptive-coaching-3` sobre `main` 08d4a50. Solo lectura. El código manda sobre la documentación.
Cada afirmación lleva `archivo:línea`. Lo marcado como **[PROBADO]** se ejecutó en un script descartable con `tsx` contra
`packages/domain/src` (sin DB): `scratchpad/ac3/audit/probe/{pyramid,more}.ts`.

---

## 0. Resumen

- **Hay un solo motor de progresión y está bien en capas.** `suggestNext` (doble progresión, `progression.ts:35`) es el núcleo.
  `recommendExercise` (`intelligence.ts:190`) decide QUÉ historia comparable le corresponde a cada fila y aplica las reglas de
  cada método. `adjustAfterSet` (`intelligence.ts:319`) solo puede mantener o bajar la exigencia. `exerciseTrend` y
  `nextProposal` (`intelligence.ts:417,448`) trabajan entre sesiones. `checkLoad` (`load-safety.ts:60`) es la puerta común para
  cualquier carga que venga de la IA. Todo es puro y determinista, y el teléfono lo usa sin conexión. AC3 tiene que **componer**
  estas funciones, no reimplementarlas.
- **Las explicaciones ya existen** como datos estructurados: `RowTarget.why/reasons/guards/review/prev/refs/quality/algo`,
  `Suggestion.why/guards`, `IntelEvent.text/priority/code`, `Trend.text/basis/confidence`, `Proposal.text/basis/requiresCoach`,
  `LoadCheck.reasons` y `SoloPlan.reasons/warnings`. El texto está en español rioplatense fijo dentro del código; no hay i18n
  ni plantillas.
- **«Datos insuficientes» tiene formas explícitas** en cada nivel (ver §8): no inventa números.
- **Faltan para AC3:** un armador de mensajes previos al ejercicio y del cierre de sesión, la comparación de la sesión contra
  la anterior, el acortado de sesión determinista («poco tiempo»), un ranking de reemplazos que tenga en cuenta el equipo
  («máquina ocupada»), eventos persistidos con deduplicación, enfriamiento y horario de silencio, RPE por serie, una
  tendencia de varios ejercicios y mensajes de serie para aproximación, AMRAP, tiempo o récord.
- **Defectos reales** (§10): (1) **las pirámides mezclan la historia de filas con distinto rango** [PROBADO], por ejemplo una
  fila de 12 reps recibe +5 kg etiquetado «reduce_load»; (2) el cliente oculta objetivos y ajustes durante la sesión cuando
  el ejercicio fue reemplazado; (3) las molestias se buscan por el nombre del ejercicio original, no por el del reemplazo;
  (4) hay dos definiciones de récord que no coinciden; (5) la escala de autonomía existente (0–4) no coincide con la de AC3
  (0–2).

---

## 1. Mapa de módulos

| Archivo | Rol | Depende de |
|---|---|---|
| `packages/domain/src/training.ts` | `parseReps`, Epley, `bestE1rm`, `detectPR`, `volumeKg`, `setControl`, fechas AR, validación de `ProgramDoc` | prescription, stages |
| `packages/domain/src/prescription.ts` | Tipos `SetKind`, `SetSpec`, `ExerciseDetail`, `Technique`, `LoadSetup`; `setTarget`, `validateDetail`, `labelKey`, `loadIncrement` | stages |
| `packages/domain/src/stages.ts` | Bloques y etapas (D183): `normalizePlan`, `planBlocks`, `rowRef`, `applyMethod`, `comboStep` (superseries y circuitos) | prescription, training |
| `packages/domain/src/load-safety.ts` | Protecciones D182: `SafetySignals`, `GuardCode`/`GUARD_TEXT`, `checkLoad`, `startWeight`, `reducedLoadHint`, `progressionApplies`, `COMPARABLE_KINDS` | prescription |
| `packages/domain/src/progression.ts` | **Núcleo de progresión** `suggestNext` (D154/D182), `applyLoad`, `coachSetLoads` | training, prescription, load-safety |
| `packages/domain/src/intelligence.ts` | Training Intelligence 2.x (D191, `TI_VERSION="ti2.1"`): contexto de fila, comparabilidad, objetivos por fila, ajuste en la sesión, tendencias, propuestas y metas | prescription, stages, training, load-safety, progression, goals |
| `packages/domain/src/equipment.ts` | Saltos de carga y cargas disponibles por sede (D195): `resolveLadder`, `fitTargetsToLoads`, `nearLoads` | units, prescription, intelligence (tipo) |
| `packages/domain/src/metrics.ts` | Métricas únicas (D183): `rowFlags`, `exerciseMetrics`, `sessionMetrics`, `exerciseComplete` | stages, training |
| `packages/domain/src/execution.ts` | Etapas omitidas `decideSkip` e intervalo EMOM (`intervalView`, `acceptInterval`) | — |
| `packages/domain/src/session-changes.ts` | Motivos de cambio (`busy`, `no_time`…), `canSubstitute`, `rankAlternatives`, `withApproved` | — |
| `packages/domain/src/adaptive.ts` | Adaptive Coach fase 1 (D108): niveles de autonomía 0–4, `planSolo`, `validateProposal` | — |
| `packages/domain/src/method-detect.ts` | Detección de métodos en texto (D184): `detectMethod`, `methodDetail` (aplica `applyMethod`) | stages, prescription |
| `packages/domain/src/goals.ts`, `progress.ts`, `levels.ts`, `wishes.ts` | Metas (`goalProgress`), peso corporal y calorías, XP y trofeos, `TrainingWishes.minutes` | — |
| `apps/web/src/server/training/intelligence.ts` | Envoltorio de servidor de TI: historia (SQL), persistencia de `training_target`, ajuste después de cada serie, propuestas del coach o la sala | domain, `services.ts` |
| `apps/web/src/server/training/adaptive.ts` | `soloPlan` (envoltorio de `planSolo` con auditoría) | domain, services |
| `apps/web/src/server/training/services.ts` (1435 líneas) | Sesión, registro de series, sugerencia D154 (`suggestionFor`), señales, alternativas, cambios de ejercicio, resumen y récords | todo lo anterior |
| `apps/web/src/server/training/ai-coach.ts` | «No vino el profe» con IA (OpenAI): elige día, cargas validadas por `checkLoad`, reemplazos tomados de `dayAlternatives` | domain, services |
| `apps/web/src/server/training/solo-routine.ts` | Rutina de hoy sin programa (D153): IA o reglas (`countFor(minutes)`) | domain |
| `apps/web/src/server/progress/exercises.ts` | Analítica por ejercicio (PP1): puntos, récords por métrica, resumen del período | domain, services |
| Cliente: `components/member/Workout.tsx`, `SetGuide.tsx`, `TargetCard.tsx`, `lib/offline/store.ts`, `queue.ts` | Usa `adjustAfterSet` + `fitTargetsToLoads` sin conexión y muestra `RowTarget` | domain |

Los exports se reexportan todos desde `packages/domain/src/index.ts:1-44`. También se puede importar por subruta:
`@repi/domain/<módulo>` (`package.json` `exports: "./*"`).

---

## 2. Formas de datos clave

### 2.1 Prescripción (lo que programó el profe)
- `SetKind = "warmup"|"work"|"top"|"backoff"|"drop"|"amrap"|"failure"|"rest_pause"|"cluster"` (`prescription.ts:12`).
  Etiquetas visibles en `SET_KIND_LABEL` (`:13`).
- `SetSpec` (`prescription.ts:16-41`): `{kind, reps:string, weightKg|null, pct1rm|null, rir|null, rpe|null, restSec|null, note|null, id?, block?, stage?, durationSec?, countUnit?: "reps"|"rounds", review?, label?, typeId?}`.
  - `stage` 0 = serie principal; 1..K = etapa conectada (drop, mini serie, bloque de cluster). `id` es la identidad estable entre
    versiones; en planes anteriores es `r<índice>` (`stages.ts:42`).
  - `label` (D192, «Load Set»): solo es el nombre. Dos filas con etiquetas distintas nunca son comparables.
- `Technique` (`prescription.ts:70`): `straight|top_backoff|drop_set|pyramid|reverse_pyramid|rest_pause|myo_reps|cluster|amrap_last|amrap_time|emom|custom`.
- `ExerciseDetail` (`prescription.ts:90-104`): `{technique, setPlan: SetSpec[]|null, group: "A".."H"|null, groupKind: "superset"|"circuit"|null, rounds, tempo, variant, unilateral, progression, emomSec?, load?: LoadSetup}`.
- `LoadSetup = {equipment, incrementKg, perSide?}` (`:112`). `loadIncrement(d)` devuelve el salto total en kg, o null (`:114`).
- `ProgramExerciseDoc` (`training.ts:173`): `{exerciseId, name, sets, reps, rir, restSec, note?, detail?}`.
  `program_exercise.sets` = **filas registrables** (series principales + etapas, hasta 40). Las series principales se cuentan con
  `planBlocks`/`mainSets` (`stages.ts:82,94`).

### 2.2 Training Intelligence
- `ExCtx = {sets, reps, rir, restSec, detail?}` (`intelligence.ts:39`).
- `RowClass = main|top|backoff|warmup|drop|rest_pause|cluster|amrap|amrap_time|timed` (`:41`). Sale de `rowClass(kind, reps, durationSec)`
  (`:50`): `work` y `failure` dan `main`; un `amrap` con duración da `amrap_time`; reps por tiempo dan `timed`.
- `RowCtx` (`:42-48`): `{index, specId, kind, cls, block, stage, reps, label, planKg, rir, rpe, restSec, durationSec, unilateral, emom, technique}`.
- `HistRow` (`:72-78`): `{sessionId, at, setLogId?, specId, kind, stage, reps (lo prescripto en esa versión), durationSec?, w, r, rir, feel, unilateral?, source: "repi"|"import", label?}`.
- `Match = exact|equivalent|general|none` (`:79`); `Quality = high|medium|low|none` (`:102`).
- **`RowTarget`** (`:131-149`), el contrato central (persistido en `training_target`):
  - `setIndex, specId, kind, block, stage`
  - `status: "ready"|"no_data"|"limited"|"coach"|"not_applicable"`
  - `action: "increase_load"|"increase_reps"|"hold"|"reduce_load"|"reduce_effort"|"estimate"|"follow_coach"|"reference"|"stop"|"none"`
    (`stop` está declarada pero **nunca se emite**)
  - `source: "rules"|"coach"`, `quality`
  - `weightKg, repsMin, repsMax, repsTarget, rirTarget, rpeTarget, restSec, restSuggestSec` (**`restSuggestSec` siempre es null**: nunca se calcula)
  - `pending` (la carga la elige o confirma la persona: series reducidas o con etiqueta)
  - `guards: GuardCode[]`, `reasons: string[]`: códigos de máquina, por ejemplo `no_history`, `progression_up|reps|hold|down|estimate`,
    `low_quality`, `increment_fit`, `increment_unknown`, `reference_time`, `reference_free`, `amrap_hold`, `method_same_load`,
    `stage_own_history`, `stage_reference`, `coach_load`, `in_session_pain|short|harder`, `equipment_fit`, `increment_too_large`,
    `below_available`
  - `text` («62,5 kg × 8–10»), `why` (explicación de las reglas que se ejecutaron), `review` (diferencia con la carga del profe que
    conviene revisar; nunca cambia el plan)
  - `prev: {w, r, rir, at, level, source}|null`, `refs: {sessionId, setLogId, at, w, r, rir}[]` (procedencia; se guardan hasta 12),
    `coach: {weightKg, reps}|null`, `algo` (= `TI_VERSION`)
- `DoneRow = {index, w, r, rir, feel}` (`:310`).
- `IntelEvent = {code: "pain"|"harder"|"short"|"easier"|"range_done"|"coach_hold", priority: 1..5, text, row, restPlusSec}` (`:312`).
- `SessionPoint = {at, w, r, rir, hard, completedAll, topOfRange, score}` (`:392`).
- `Trend = {kind: insufficient|progressing|plateau|declining|variable|stable|effort_up|returning, confidence: none|possible|consistent, sessions, text, basis}` (`:412-413`).
- `Proposal = {kind: load|reps|hold|review|deload|rest, text, weightKg, reps, requiresCoach, basis}` (`:441-442`).

### 2.3 Progresión y seguridad
- `LastSet = {weightKg, reps, rir?, feel?, kind?}`; `Suggestion = {action: up|reps|hold|down|estimate, weightKg, reps, text, why, guards?}` (`progression.ts:13-15`).
- `SafetySignals = {painExercise?, painOrInjury?, lowReadiness?, daysSinceLast?}` (`load-safety.ts:28`).
- `GuardCode = pain_exercise|pain_or_injury|max_effort|low_readiness|inactive_hold|inactive_reduce|range_change|method`, con el texto fijo en `GUARD_TEXT` (`:39-49`).
- `LoadCheck = {weightKg, status: ok|capped|rejected|coach, reasons}` (`:53`).
- Constantes: `PAIN_LOOKBACK_DAYS=14`, `GENERAL_PAIN_DAYS=7`, `INACTIVE_HOLD_DAYS=14`, `INACTIVE_REDUCE_DAYS=28`, `ESTIMATE_MARGIN=0.9`,
  `BACKOFF_FACTOR=0.85`, `DROP_FACTOR=0.8` (`:15-26`); `loadStep(w)` = 1, 2,5 o 5 kg según la carga (`:9`).
- `SET_FEEL = facil|bien|dificil|limite|molestia|ayuda`, `FEEL_ALERTS = dificil|limite|molestia|ayuda` (`commercial.ts:96-100`).

### 2.4 Equipo, métricas, sesión
- `LoadLadder = {source: plan|gym|unknown, incrementKg, loadsKg, name?}` (`equipment.ts:26`).
- `WorkMetrics = {mainPlanned, mainDone, warmupPlanned, warmupDone, stagesPlanned, stagesDone, stagesSkipped, rowsDone, reps, tonnageKg, timeSec, rounds}` (`metrics.ts:36`).
- `LoggedSet = {exerciseId, weightKg, reps, completed, at?, timed?, warmup?, rounds?}` (`training.ts:87`).
- `SoloContext`/`SoloPlan` (`adaptive.ts:30-45`); `AdaptationProposal` v1 (`adaptive.ts:106-111`).
- `TrainingWishes = {goal, daysPerWeek, minutes, likes, avoid, shareWithTrainers?}` (`wishes.ts:14`).

---

## 3. Catálogo de funciones reutilizables

### 3.1 `progression.ts`: núcleo de progresión
**`suggestNext(p: {reps: string; sets: number; last: LastSet[]; lastReps?: string|null; signals?: SafetySignals}): Suggestion | null`** (`:35-117`)
- Filtra las últimas series para quedarse con reps > 0 y `kind` dentro de `COMPARABLE_KINDS` (`work|top|amrap|failure`) (`:37-39`).
- Devuelve **null** (sin sugerencia) si la prescripción no es un rango de reps (tiempo o «al fallo») o no hay series comparables
  (`:40`), o si la estimación por cambio de rango no es confiable (`:62`).
- Comparabilidad del rango: con `lastReps`, los rangos tienen que superponerse; sin él, alcanza con que los reps queden cerca
  (`RANGE_GAP=3`) (`:52-53`). Si no es comparable, agrega la protección `range_change` y estima con Epley × 0,9, redondeando
  hacia abajo. **Nunca** estima por encima de la carga anterior (`:56-65`).
- Seguridad: con molestia (señal del ejercicio o `feel === "molestia"`) o 28 días o más de inactividad, devuelve `down` con −10 %
  (`:69-78`). Con molestia general o lesión, esfuerzo máximo (RIR 0 o «limite» en todas las series de trabajo), poca energía o
  14 días o más sin hacerlo, **bloquea la suba** y mantiene (`:79-85`).
- Doble progresión: si completó todas las series en el tope del rango, `up` (+`loadStep`) y vuelve al piso; dentro del rango,
  `reps` +1; 3 o más reps por debajo del piso, `down` −10 %; si no, `hold` (`:100-116`). Con peso corporal, progresa en reps
  (`:87-93`).
- **Explicación**: `why` = «La última vez: …» + motivo de la regla + `GUARD_TEXT` de cada protección (`:43,48`).
- `lastSummary(sets)` (`:19`): «60 kg × 10, 10, 9». Sirve tal cual para las frases de «la última vez».
- `canApplyLoad(detail)` / `applyLoad(detail, sets, reps, kg)` (`:123-134`): el profe aplica la carga sugerida (solo con series rectas o de trabajo).
- `coachSetLoads(detail)` (`:136`): true si el plan del profe trae carga en alguna fila. En ese caso **manda el plan**.

### 3.2 `load-safety.ts`: protecciones y precarga
- **`checkLoad({proposedKg, source: "rules"|"ai", referenceKg, coachKg?, rulesKg?, blockIncrease?}): LoadCheck`** (`:60-88`). Prioridad: profe (`coach`),
  luego valor inválido (`rejected`), luego la IA sin referencia (`rejected`: «Sin una marca previa… empezá liviano»), luego el techo:
  la referencia sola si `blockIncrease`, si no `ref + 2·loadStep`; además la IA no puede superar `rulesKg`. Si lo pasa, `capped`.
  **Es la puerta obligatoria para cualquier carga que proponga la IA o el chat en AC3.**
- `progressionApplies(detail)` (`:111`): una sola carga para todo el ejercicio solo vale con series rectas sin etiquetas.
- `startWeight({kind, planKg?, suggestKg?, carriedKg?, label?}): {w, pending}` (`:145`): precarga. Orden: plan del profe; serie reducida
  queda `pending`; con etiqueta y sin sugerencia, `pending`; si no, sugerencia; si no, la carga arrastrada.
- `reducedLoadHint(plan, i, weights)` (`:125`): referencia para back-off (85 % del top set) o drop (80 % de la serie anterior) dentro de la sesión.
  Devuelve `{weightKg, why}`.
- `carriesLoad(from, to, fromLabel, toLabel)` (`:100`), `kindAt(detail, i)` (`:104`), `isReducedKind` (`:93`).

### 3.3 `intelligence.ts`: Training Intelligence
| Función | Firma | Salida / explicación | Protecciones |
|---|---|---|---|
| `rowClass` | `(kind, reps, durationSec?) => RowClass` (`:50`) | clase de comparación | — |
| `rowContext` | `(e: ExCtx, i) => RowCtx` (`:58`) | contexto de la fila desde `setTarget` y `normalizePlan` | — |
| `exerciseRows` | `(e: ExCtx) => RowCtx[]` (`:68`) | todas las filas | — |
| `compareRows` | `(cur: RowCtx, past: HistRow) => {level: Match; why}` (`:83`) | regla de comparabilidad con su razón (§5) | nunca fuerza una equivalencia |
| `comparableHistory` | `(cur, rows, now, w=TI_WINDOW) => {sessions: HistSession[]; quality}` (`:106`) | hasta 6 sesiones en 180 días (importadas: 365), de la más reciente a la más antigua; `quality` | ventana; lo importado siempre da calidad `low` |
| **`recommendExercise`** | `(input: RecommendInput{ex, history, now, signals?, increment?}) => RowTarget[]` (`:190`) | un `RowTarget` por fila registrable | ver tabla de métodos (§4); `withCoach` (`:213-223`) |
| `fitIncrement` / `nextLoad` | `(w, inc?) => number` (`:156,162`) | redondea hacia abajo al salto del equipo / siguiente carga | nunca redondea hacia arriba |
| **`adjustAfterSet`** | `(p: {ex, targets: RowTarget[], done: DoneRow[], justDone: number, increment?}) => {targets, event: IntelEvent\|null, changed: number[]}` (`:319`) | un único mensaje (el más importante), más los objetivos reemplazados con `why` = texto del ajuste y `reasons += in_session_*` | **solo mantiene o baja** (`:331-339`); salta si `source==="coach"` (`:333`); nunca toca filas hechas (`:327`); sin resultado o en aproximación no devuelve nada (`:325`) |
| `topEvent` | `(xs) => IntelEvent\|null` (`:378`) | prioridad: seguridad > profe > próxima serie > progreso | **no se usa en la app** |
| `decisionFor` | `(t, real{w,r}) => "accepted"\|"modified"` (`:383`) | ¿siguió el objetivo? (con tolerancia de redondeo de lb a kg de 0,03 kg) | `reference` o `none` siempre dan `modified` |
| `sessionPoints` | `(cur: RowCtx, history, now, plannedSets) => SessionPoint[]` (`:394`) | mejor serie por sesión comparable (por Epley; fuera de 1–12 reps se usa un puntaje interno), en orden cronológico | — |
| **`exerciseTrend`** | `(points) => Trend` (`:417`) | `kind/confidence/text/basis` | **con menos de 3 sesiones da `insufficient`** (`:420`); un estancamiento pide 4 o más (5 o más para `consistent`); `returning` si hubo una pausa de más de 28 días |
| **`nextProposal`** | `(trend, points, {repsMin, repsMax, coachOwned, increment?, fatigue?}) => Proposal\|null` (`:448`) | propuesta para la próxima sesión con `basis` y `requiresCoach` | null si es `insufficient`; no propone volumen; una descarga siempre lleva `requiresCoach:true` |
| `progressToGoal` | `({metric, baseline, target, current, unit, period?}) => {pct, formula, status}` (`:479`) | porcentaje con la fórmula escrita | `insufficient` sin valor actual; **no se usa en la app** |

Detalle de `adjustAfterSet` (`:343-374`):
- `feel==="molestia"`: todas las filas siguientes del ejercicio bajan a ≤ la carga hecha, o pasan de subir a mantener; status `limited`
  y guard `pain_exercise`. Evento `pain` (prioridad 1) con texto fijo de derivación sin diagnóstico (`:345`).
- «Más exigente» = RIR 0, `limite`, RIR más de 1 por debajo del objetivo, o reps por debajo del piso. Si quedó 3 o más reps
  por debajo y hay carga (`far`), las filas de la misma clase, etapa y etiqueta bajan un salto. Si no, mantienen la carga.
  Evento `short`/`harder` (prioridad 3, `restPlusSec=30` en series principales sin EMOM) o `coach_hold` (prioridad 2) si la
  carga siguiente es del profe.
- `range_done` (prioridad 4): solo en la última serie de trabajo con el tope del rango. `easier` (prioridad 4): «No subo la carga
  a mitad de la sesión…».
- **[PROBADO]** 62,5×10 con RIR 4 «fácil» da el evento `easier` y `changed=[]` (no sube nada). 62,5×6 con RIR 0 da `harder` y las
  filas siguientes pasan de `increase_load` a `hold` 62,5.

### 3.4 `equipment.ts`
- `resolveLadder(planLoad, gymLadder): LoadLadder` (`:86`): prioridad plan > sede > desconocido.
- `fitTargetsToLoads(targets, ladder)` (`:106`): solo para objetivos de reglas con carga y sin `pending`. Para bajar o mantener,
  usa la carga disponible inmediatamente inferior. Para subir, la inmediatamente superior solo si el salto es ≤ 10 %; si no,
  `hold` con «El salto disponible en tu sede es grande…».
- `equipmentLadder(spec, name)` (`:69`), `nearLoads(loads, w)` (`:132`), `validateEquipment` (`:34`), `parseLoadList` (`:56`).

### 3.5 `stages.ts`, `prescription.ts`, `metrics.ts`, `execution.ts`
- `normalizePlan(plan) => {rows: PlanRow[], derived, review}` (`stages.ts:50`): lee cualquier plan, nuevo o anterior, sin migrar.
- `planBlocks(detail, sets): Block[]` (`:82`), `rowRef(detail, sets, i): RowRef|null` (`:110`), `stageLabel(kind, stage)` (`:97`, «Drop 1», «Mini serie 2»).
- `applyMethod(detail, base, method, selected, opts) => {detail, changes: string[]}` (`:166`): aplica un método sin borrar la
  programación y devuelve la lista de cambios para revisar.
- `comboStep(exs, done, idx, setIdx) => {idx, endOfRound, round, rounds}|null` (`:283`): orden en superseries y circuitos.
  `groupRounds` (`:304`), `circuitIssues` (`:311`).
- `structureText(detail, sets)` (`:255`): «4 series · la 4.ª con 2 drops». **Sirve para explicar la estructura en el chat o el resumen.**
- `setTarget(e, i)` (`prescription.ts:226`): objetivo de la fila con `label`, `block`, `stage`, `durationSec`, `countUnit`. `setTargetText` (`:241`).
- `rowFlags(e, i)` (`metrics.ts:25`), `exerciseMetrics(e, logs, skipped)` (`:47`), `sessionMetrics` (`:80`), `exerciseComplete` (`:84`).
- `decideSkip` (`execution.ts:15`), `intervalView` (`:43`), `acceptInterval` (`:61`).

### 3.6 `training.ts`
- `parseReps(s): RepsTarget` (`:27`): `reps{min,max}` | `time{seconds}` | `free{text}`.
- `epley1rm(w, r)` (`:78`): solo de 1 a 12 reps y con carga; si no, null.
- `bestE1rm(sets)` (`:91`) y `volumeKg(sets)` (`:113`) excluyen series por tiempo, aproximaciones y rondas.
- **`detectPR(previous, current)`** (`:105`): solo por e1RM; sin historia previa da null [PROBADO].
- `setControl(t)` (`:64`): `time|amrap|amrap_time` para el control en pantalla. `weeklyAdherence` (`:167`), `nextDayIndex` (`:128`).

### 3.7 `session-changes.ts`
- `EXERCISE_CHANGE_REASONS = busy|no_equipment|discomfort|no_time|other` (`:4`).
- `canSubstitute(orig, cand)` (`:16`): solo pide el mismo `exercise.kind` (`load_reps|bodyweight|time`).
- `rankAlternatives(original, all)` (`:20`): mismo grupo muscular primero, después en orden alfabético. **No tiene en cuenta patrón
  de movimiento, equipo ni disponibilidad.**
- `withApproved(ranked, approved)` (`:31`): pone primero las alternativas aprobadas por el coach o la sede y las marca con
  `approved` y `approvedNote`.

### 3.8 `adaptive.ts`
- `AUTONOMY_LEVELS` 0–4 (`:6-12`), `DEFAULT_AUTONOMY=1` (`:14`), `autonomyAllows(level, action)` (`:19`). **Ni se persisten ni se usan
  en la app.**
- `planSolo(ctx: SoloContext, variant): SoloPlan` (`:50`): modos `continue` (sesión abierta, con frescura de 6 h), `no_program`,
  `scheduled`, `extra_day` (ya entrenó hoy: propone descansar), `original` (la rutina asignada). `usesAI:false`. Advertencia de
  poca disponibilidad si energía o sueño son ≤ 2.
- `validateProposal(p, library)` (`:115`): contrato v1 de propuesta de adaptación (ejercicios de la biblioteca, series 1–10,
  reps con regex, descanso, **prohíbe `weightKg`**). **No se usa en la app.**

---

## 4. Matriz de métodos y tipos de serie (cómo los trata TI)

| Método o tipo | Representación | Objetivo (`recommendRow`) | Ajuste en la sesión | Métricas / récord |
|---|---|---|---|---|
| Aproximación (`warmup`) | `kind:"warmup"` | `not_applicable`, sin carga; `why`: «Aproximación: elegí la carga…» (`intelligence.ts:208`) | ignorado (`:325`) | no suma reps, tonelaje ni récords (`metrics.ts:62`, `training.ts:88`) |
| Serie efectiva / al fallo | `work`/`failure` → `main` | `suggestNext` con la última sesión comparable (`:234-261`). Sin rango de reps da `reference` con la marca anterior | mantiene o baja | cuenta |
| Top set | `top` | igual que `main`, con su propia historia (`kind:"top"`) | ídem | cuenta |
| Back-off | `backoff` | con historia propia, repite esa carga con tope en la del top − 1 salto, `pending:true`. Sin historia, `no_data` con referencia del 85 % del top (`:288-304`) [PROBADO: 100 → 87,5 `pending`] | ídem | cuenta |
| Drop | `drop`, stage ≥ 1 | ídem con 80 % de la etapa anterior; nunca copia la carga de la principal | ídem (misma clase y etapa) | suma tonelaje; no es una serie principal |
| Rest-pause / myo-reps | `rest_pause`, stage ≥ 1 (myo = pausa de 5 s, reps «3-5») | misma carga que la principal; reps propias; guard `method` (`:278-285`) | — | etapas aparte |
| Cluster | `cluster` (bloque 1 = stage 0) | ídem rest-pause | — | ídem |
| AMRAP por reps | `amrap` sin `durationSec` | `hold` de la carga anterior, con la meta de igualar o superar las reps (`:264-270`) | — | cuenta |
| AMRAP por tiempo | `amrap` + `durationSec` + `countUnit` | `reference` del resultado; nunca calcula kilos (`:226-231`) | — | rondas o tiempo, nunca tonelaje |
| Serie por tiempo | `reps` = «40 s», «20 min», «1:30» | `reference` en segundos | — | `timeSec`; excluida de e1RM y volumen |
| EMOM | `detail.technique="emom"`, `emomSec` | como `main` (sin regla propia); `RowCtx.emom` | `restPlusSec=null` (`:340`) | intervalo en `workout_session.interval_state` |
| Pirámide / pirámide invertida | filas `work` con reps distintas | **DEFECTO**: mezcla toda la historia `main` de la sesión (§10.1) | — | cuenta |
| Superserie / circuito | `detail.group` + `groupKind` + `rounds` | **cada ejercicio por separado**; no hay reglas de grupo en TI | `restPlus=30` aunque esté dentro de la superserie (sin descanso) | `comboStep` ordena |
| Unilateral | `detail.unilateral` | unilateral y bilateral no se comparan (`:92`) | — | reps por lado, sin duplicar |
| Etiqueta / Load Set (D192) | `SetSpec.label` | solo compara con la misma etiqueta; lo importado no cuenta; `pending` sin sugerencia | misma etiqueta | según `kind` |

---

## 5. Reglas de comparabilidad (`compareRows`, `intelligence.ts:83-100`), en orden

1. Sin reps registradas: `none` («sin resultado registrado»).
2. Fila actual de aproximación: `none`.
3. Fila actual con etiqueta e historia importada: `none`.
4. Importado: `general` solo si la fila actual es `main`, stage 0 y tiene carga; si no, `none`. La calidad queda `low`.
5. Unilateral distinto: `none`. 6. Otra clase: `none`. 7. Otra etiqueta: `none`. 8. Otra etapa: `none`. 9. AMRAP por tiempo con otra duración: `none`.
10. Mismo `specId` (no heredado `r\d+`): `exact`. Si no: `equivalent`.

Ventana: `TI_WINDOW = {sessions: 6, days: 180, importDays: 365}` (`:34`). Calidad (`:121-123`): `low` si es importado o `general`;
`high` si tiene 28 días o menos y 2 o más sesiones; si no, `medium`. Solo se usan **sesiones completadas** con series no anuladas
(filtro SQL en `server/training/intelligence.ts:39`), así que lo anulado (D195) queda afuera.

**Hueco:** la comparabilidad **no tiene en cuenta el rango de reps prescripto** entre filas `main` de una misma sesión, ni la
variante (`detail.variant`), el tempo o el equipo. Una versión nueva con otro rango se trata en `suggestNext` como `range_change`.

---

## 6. Envoltorios de servidor

### 6.1 `apps/web/src/server/training/intelligence.ts`
- `historyRows(userId, exerciseIds, {excludeSessionId?, coachClientId?, gymMemberId?, now?, imports?}) => Map<exerciseId, HistRow[]>` (`:28-78`).
  Una sola consulta SQL con ventana. Máximo 80 ejercicios; importados hasta 2000 filas y deduplicados por día y serie. **Con
  `coachClientId` o `gymMemberId` excluye lo importado** (D132) y lo entrenado en otras relaciones. Para el propio alumno mezcla
  todas sus relaciones.
- `safety(sig, name)` (`:80`): arma `SafetySignals` desde `Signals`, buscando por **nombre** del ejercicio.
- `ladderFor(e, gym)` (`:110`): saltos del plan solo si se hace el ejercicio original; con un reemplazo, los de la sede o desconocido.
- **`ensureTargets(userId, s{id, versionId, status}, exs: SessionEx[], now, gym)`** (`:113-144`): en una sesión abierta calcula y
  guarda los objetivos que faltan. Es idempotente gracias a un índice parcial único y `onConflictDoNothing`. Marca como
  `superseded` los que cambiaron de versión o de ejercicio. Con la sesión terminada solo lee. **Se llama desde `getSession`
  (GET): un GET escribe.**
- `outlookFor(e, rows, now, coachOwned, fatigue=false, increment)` (`:147-157`) devuelve `{trend, proposal}|null`. Usa la primera fila `main`/`top`.
- **`afterSetLogged(userId, sessionId, peId, setIndex, now)`** (`:164-195`): fuera de la transacción del registro. Fija `decision` y `setLogId`
  del objetivo, ejecuta `adjustAfterSet` y `fitTargetsToLoads`, reemplaza (`seq+1`) solo filas sin registrar ni decidir, y
  devuelve `{event, targets}`. Si la serie ya tenía decisión (una edición), no recalcula.
- `closeTargets(sessionId)` (`:198`): al terminar la sesión, los objetivos sin decisión pasan a `not_done`.
- `clientIntelligence(actorId, orgId, coachClientId)` (`:210`) y `relationIntelligence(rel{kind, id, userId})` (`:228-278`): por cada
  ejercicio del programa vigente (máximo 40) devuelve tendencia, propuesta, última sesión y conteo de decisiones de 28 días.
  **Crea o actualiza filas de `training_proposal` al leer** (`:264`). No vuelve a proponer si ya se decidió y no hubo sesiones
  nuevas (`:261`). `fatigue` = 4 o más series al límite o con RIR 0 entre las últimas 12 (`:249`). Se exporta el texto de la
  fórmula `FORMULA` (`:279`).
- `decideProposal(actorId, orgId, proposalId, {status, note})` (`:282`) y `recordDecision` (`:292`): auditadas (`training_proposal.<status>`), sin cambiar la rutina.
- `sessionExercises(sessionId, exs, logs) => SessionEx[]` (`:302`): resuelve `doing` (ejercicio reemplazado), `skipped` y `logged`.

### 6.2 `apps/web/src/server/training/adaptive.ts`
- `soloPlan(userId, variant, now)` (`:12-37`): `myTraining`, sesión abierta, sesiones de hoy (hora AR), check-in, `planSolo`.
  Audita `adaptive.solo_plan` con `{mode, adp, usesAI:false}`.

### 6.3 Ganchos en `apps/web/src/server/training/services.ts`
- `requireCoach(actorId, orgId)` (`:27`): `coach_owner` activo en una org de tipo coach; si no, 404.
- `requireClientOf(orgId, ccId)` (`:37`): relación no terminada y permiso `training` activo; si no, 403 `no_grant`.
- `lastTimeByExercise(userId, ids, excludeSessionId?, scope?)` (`:565`): última sesión completada por ejercicio, con
  `LastSet[]` y la prescripción.
- **`trainingSignals(userId, now): Signals{painOrInjury, lowReadiness, painNames: Set<exerciseKey>, now}`** (`:595`): `pain_report` de
  14 días; molestia general de 7 días o lesión activa o en seguimiento; check-in de hoy con energía o sueño ≤ 2. **Son datos de
  salud: solo se usan para los objetivos del propio alumno, nunca en la vista del coach.**
- `suggestionFor(e, last, sig)` (`:613`): sugerencia D154 para todo el ejercicio; null si hay cargas del profe o una estructura que
  no es recta. Se sigue usando junto a TI: `myTraining().program.days[].exercises[].suggest` (`:722`) y `getSession().exercises[].suggest` (`:975`).
- `sessionIntel(...)` (`:910`): `ensureTargets` más `outlookFor` por ejercicio. `getSession` (`:926`) devuelve `targets`, `outlook` y `ladder` por ejercicio.
- `logSet(...)` (`:993`) llama a `afterSetLogged` al final, con `catch` (`:1054`), y responde `{...set, intel: {event, targets}|null, alert}`.
- `sessionAction(... "finish")` llama a `closeTargets` (`:1321`).
- `sessionSummary(userId, sessionId)` (`:1374`): `sessionMetrics`, `exDone/exSkipped`, récords con `detectPR` contra **toda** la
  historia previa. Hace una consulta por ejercicio, **sin límite** (`:1388-1392`).
- `sessionAlternatives(userId, sessionId, peId)` (`:1087`): biblioteca visible, ordenada con `rankAlternatives`+`withApproved`, hasta 60, con `prev`.
- `dayAlternatives(userId, dayId, perExercise)` (`:1110`): ídem, más parecido de nombre (palabras sin equipo).
- `setExerciseChange(userId, sessionId, {peId, change: {kind: skip|substitute, reason, exerciseId?}|null})` (`:1146`): solo con la sesión
  abierta, relación vigente y presencia en la sede. Exige mismo `kind` y visibilidad. Hace upsert en `session_exercise_change`
  y audita `session.exercise_skip|substitute|restored`. **Es el ejecutor ya existente para «máquina ocupada» y «poco tiempo»
  (saltar con `no_time`).**

### 6.4 IA existente (no es un segundo motor)
- `aiSoloAdvice(userId, now, follow?)` (`ai-coach.ts:53`): OpenAI con `aiJson` (`server/ai/openai.ts:17`), timeout de 15 s, máximo 900
  tokens. Usa `outlookFor().trend.text` como contexto y le pide al modelo no contradecirlo (`:44,74`). Cargas validadas con `checkLoad`
  y `blockIncrease` por guards o check-in (`:118-121`). Reemplazos **solo** por índice de `dayAlternatives` (`:124`). Puede bajar
  series (`a.sets <= e.sets`, `:130`): el único «poco tiempo» que existe hoy está en la IA. Audita `adaptive.ai_advice`. **Sin
  cupos ni presupuesto** (solo `aiOn()`).
- `solo-routine.ts`: sin programa, `countFor(minutes)` decide 4–7 ejercicios por minutos (`:26`). Es la única regla de «tiempo» determinista.

---

## 7. Tablas y columnas relevantes (`apps/web/src/db/schema.ts`)

- **`training_target`** (`:541-586`): `id, user_id, session_id, program_exercise_id, exercise_id (el que se hace), version_id, set_index, spec_id, set_kind, block_index, stage_index, seq, status, action, source, quality, weight_kg (texto), reps_min, reps_max, reps_target, rir_target, rpe_target (double), rest_sec, rest_suggest_sec, pending, detail jsonb{reasons, guards, text, why, review, prev, refs, coach}, algo_version, decision (accepted|modified|not_done), set_log_id, created_at, decided_at, superseded_at`.
  Únicos: `(session, pe, set_index, seq)` y uno vigente por fila con `superseded_at is null`.
- **`training_proposal`** (`:588-610`): `coach_client_id XOR gym_member_id, exercise_id, kind, payload jsonb{text, weightKg, reps, basis, trend, sessions}, algo_version, status (open|accepted|modified|rejected|kept), decided_by, decided_at, note`.
  Única abierta por relación, ejercicio y tipo.
- **`set_log`** (`:468-494`): `weight_kg (texto), reps, rir, feel, note, spec_id, set_kind, block_index, stage_index, completed_at, revision, voided_at…`. **Sin RPE por serie**: el RPE es de la sesión (`workout_session.rpe`).
- `set_skip` (`:525`): etapas omitidas. `session_exercise_change` (`:661`): `kind skip|substitute, substitute_exercise_id, reason`.
  `exercise_substitution` (`:674`): reemplazos aprobados por org.
- `workout_session` (`:432`): `status (in_progress|paused|completed|abandoned|voided), rpe, note, interval_state, coach_client_id, gym_member_id, floor_trainer_id, version_id, day_id`.
- Salud (señales): `checkin` (`:703`, energía, sueño y ánimo de 1 a 5), `pain_report` (`:714`, `exercise_name` es texto libre), `injury` (`:728`).
- `history_entry` (`:646`): importado (`weight_kg, reps, seconds`, sin tipo de serie).
- `gym_equipment` (`:113`) y `gym_equipment_exercise` (`:139`): saltos y cargas por sede. **No hay estado de disponibilidad u ocupación** (solo `archived_at`).
- `exercise` (`:333`): `name, muscle_group, kind, org_id, owner_user_id`. **No hay patrón de movimiento, equipo, prioridad ni compuesto/aislamiento.**

---

## 8. ¿Cómo se ve «datos insuficientes»?

| Nivel | Forma exacta |
|---|---|
| `suggestNext` | `null` (sin rango de reps, sin series comparables o con una estimación no confiable) |
| `RowTarget` sin historia | `status:"no_data", action:"none", weightKg:null, reasons:["no_history"], why:"Todavía no tenemos una referencia comparable para esta serie."` [PROBADO]. Con carga del profe se convierte en `status:"coach"` |
| Back-off / drop sin historia | `status:"no_data", action:"reference", pending:true, weightKg: 85 % u 80 %, reasons:["stage_reference", …]` |
| `comparableHistory` | `{sessions: [], quality: "none"}` |
| `exerciseTrend` con menos de 3 | `{kind:"insufficient", confidence:"none", text:"Todavía no hay sesiones suficientes para ver una tendencia."}` [PROBADO] |
| `nextProposal` | `null` |
| `checkLoad` (IA sin referencia) | `{weightKg:null, status:"rejected", reasons:["Sin una marca previa en este ejercicio no se sugieren kilos: empezá liviano."]}` |
| `detectPR` sin historia | `null` (la primera vez no es un récord) |
| `progressToGoal` | `{pct:null, status:"insufficient", formula:"Faltan datos medidos…"}` |
| `bodyGoalProgress` | `{state:"insufficient", missing: start\|current\|target}` (`progress.ts:61`) |
| `estimateCalories` | `{ok:false, reason: no_weight\|too_short\|too_long\|minor\|voided\|age_unknown}` (`progress.ts:128`) |
| `relationIntelligence` sin asignación | `{formula, exercises: [], adherence: null, programId: null}` |
| `adjustAfterSet` sin resultado | `{targets (sin cambios), event: null, changed: []}` |

---

## 9. Protecciones verificadas

- **Nunca sube en la sesión**: `adjustAfterSet` solo escribe `weightKg ≤` la carga actual o la hecha, o cambia `increase_*` por `hold`
  (`intelligence.ts:344,357-359`). `easier` y `range_done` solo generan mensajes. `fitTargetsToLoads` posterior: para acciones que
  no son de subida usa la carga inmediatamente inferior. **[PROBADO]**
- **Cargas del profe**: `withCoach` (`intelligence.ts:213-223`) fija `weightKg=planKg` y `source:"coach"`. La seguridad pasa a
  `review` y, con molestia, a `reduce_effort` sin cambiar la carga. `adjustAfterSet` las salta (`:333`); `fitTargetsToLoads`
  también (`equipment.ts:110`); `checkLoad` devuelve `coach` (`load-safety.ts:71`); `suggestionFor` devuelve null (`services.ts:615`);
  `aiSoloAdvice` rechaza (`ai-coach.ts:118`).
- **Series reducidas**: nunca heredan la carga de otra serie (`startWeight`, `carriesLoad`). Quedan `pending` y el cliente bloquea
  completar sin elegir el peso (`Workout.tsx:308`).
- **Nunca reescribe un registro**: el servidor no escribe en `set_log` desde TI (comentario en `server/training/intelligence.ts:5`).
  Un objetivo emitido nunca se actualiza en el lugar, solo se reemplaza con `seq+1`.
- **La IA nunca supera las reglas**: el techo de `checkLoad` es `rulesKg` y `blockIncrease`.

---

## 10. Defectos y riesgos encontrados

1. **Pirámides y planes `main` con reps distintas por fila [PROBADO, P1].** `recommendRow` arma `last` con **todas** las filas de la
   sesión comparable (`intelligence.ts:237`) y `lastReps = s.rows[0].reps` (`:238`). Con una pirámide de 12/10/8 y la última vez
   50×12, 55×10, 60×8: la fila 0 da **55 kg × 12 con `reduce_load`** («Quedaste lejos de 12: bajá…»), que en realidad es una
   **suba de 5 kg**. Las filas 1 y 2 dan una «estimación» de 50 y 52,5 con `range_change`. Debería filtrar por `own.specId`
   (o por el mismo `reps`) cuando las filas `main` tienen prescripciones distintas. No hay test de pirámide en
   `intelligence.test.ts`. **AC3 no debe mostrar estos mensajes sin antes corregirlo o suprimirlo** cuando
   `technique ∈ {pyramid, reverse_pyramid}` o las reps de las filas `main` difieren.
2. **Los reemplazos se quedan sin TI en el cliente.** `curTarget` es null si `ex.change` (`Workout.tsx:510`) y el ajuste sin conexión se
   saltea si `ex.change` (`:323`), aunque el servidor sí calcula objetivos para `doing`. Resultado: después de «máquina ocupada»
   no hay guía de carga en pantalla.
3. **Molestias del reemplazo.** `ensureTargets` le pasa a `safety(sig, e.name)` el **nombre del ejercicio original**
   (`server/training/intelligence.ts:131`), no el del reemplazo. Además `pain_report.exercise_name` es texto libre y se compara
   con `exerciseKey`.
4. **Dos definiciones de récord.** `detectPR` (solo e1RM, toda la historia, usado en `sessionSummary`) frente a
   `progress/exercises.ts:120-127` (por métrica: e1RM, carga, reps sin carga o tiempo). Las marcas de peso corporal o por
   tiempo no aparecen como récord en el cierre de sesión pero sí en Progreso. AC3 tiene que elegir una sola (recomendado:
   extraer la de PP1 a un módulo de dominio).
5. **Escala de autonomía incompatible.** El dominio tiene 0–4, donde 0 = «desactivado» y no permite ni `explain`
   (`adaptive.ts:6-26`). AC3 define 0 = informativo (explica), 1 = asistente (prepara y confirma), 2 = ejecuta automáticamente
   operaciones de bajo riesgo. No hay nada persistido. **No reutilizar `AutonomyLevel` sin un mapeo explícito.** Conviene crear
   un tipo nuevo (por ejemplo `CoachAutonomy`) o versionarlo.
6. **Eventos sin persistencia ni deduplicación en el servidor.** `afterSetLogged` devuelve `event`, pero nadie lo guarda. El
   cliente **ignora** la respuesta `intel` de `logSet` (`lib/offline/queue.ts` `applyResult` solo lee `alert`) y deduplica en
   memoria local con `intelSeen` por `${peId}:${code}` (`Workout.tsx:329-330`). No hay enfriamiento, horario de silencio ni
   historial.
7. **Efectos de escritura en lecturas.** `getSession` llama a `ensureTargets` (escribe `training_target`) y `relationIntelligence`
   inserta o actualiza `training_proposal` al abrir la ficha del coach o la sala. Un motor de eventos proactivo en AC3 no debería
   depender de que alguien abra una pantalla.
8. **`restSuggestSec` nunca se usa** (siempre null). El «+30 s» vive solo en `IntelEvent.restPlusSec` y se ofrece también
   **dentro de superseries**, donde el plan no prevé descanso (`intelligence.ts:340` no mira `detail.group`).
9. **Sin RPE por serie**: `set_log` no tiene `rpe`. `adjustAfterSet` usa solo RIR o `feel`. Los planes con RPE (`SetSpec.rpe`) no se evalúan.
10. **Rendimiento**: `sessionSummary` hace una consulta de historia sin límite por ejercicio (`services.ts:1388-1392`) y
    `relationIntelligence` hace 2 o 3 consultas por ejercicio en serie.
11. **Código muerto o puntos de extensión sin usar**: `topEvent`, `progressToGoal`, `validateProposal`, `autonomyAllows`, la acción `stop`.
12. **Textos fijos en español en el dominio**: AC3 tendrá que usar `code`, `reasons` y `guards` como claves si quiere cambiar el tono o la personalidad sin tocar las reglas.
13. **Sesiones de varias relaciones**: los objetivos del alumno mezclan historia de todas sus relaciones e importados. Es correcto para
    el propio alumno, pero en el chat no hay que exponer la procedencia entre organizaciones a un coach (las vistas del coach y la
    sala ya filtran por `coachClientId`/`gymMemberId` y excluyen salud e importados).

---

## 11. Qué puede usar AC3 y qué falta

| Capacidad AC3 | Existe hoy | Falta (construir en el dominio, puro) |
|---|---|---|
| **Mensaje por serie** (§6 del pedido) | `adjustAfterSet` → `IntelEvent` (pain/harder/short/easier/range_done/coach_hold) con prioridad y `restPlusSec`, sin conexión. `RowTarget.why` actualizado por fila. `decisionFor` | Códigos para: aproximación («no la comparamos»), etapa N de M de un método, AMRAP o tiempo superado frente a la vez anterior, objetivo cumplido justo, posible récord en la sesión, RPE. Persistencia y dedupe en el servidor (tabla de eventos), enfriamiento por ejercicio y sesión, cancelación de mensajes viejos. Mapear `IntelEvent.priority` (1–5) a la escala de relevancia de AC3, que es compatible: seguridad > profe > ayuda > progreso |
| **Briefing previo al ejercicio** | Piezas: `RowTarget[]` (`prev`, `coach`, `text`, `why`, `review`, `guards`, `quality`, `refs`), `Outlook{trend, proposal}`, `lastSummary`, `structureText`, `setTargetText`, `GUARD_TEXT`. UI parcial en `SetGuide.tsx` (por serie, no por ejercicio) | Una función `briefExercise({ex, targets, outlook, change, ladder})` que devuelva `{headline, lines[], warnings[], missing[], sources[]}` a partir de los códigos (sin texto libre de la IA) e incluya lo que falta (`no_data`, `increment_unknown`, `quality low`, etiqueta sin historia) |
| **Comparación al cerrar la sesión** | `sessionSummary`: `WorkMetrics`, `exDone/exSkipped/exTotal`, `prs` (e1RM). `training_target.decision` por fila (accepted/modified/not_done), `session_exercise_change` (adaptaciones), `set_skip`, `outlookFor` por ejercicio, `workout_session.rpe/note` | `compareSession(cur, prevComparableByExercise)`: diferencia por ejercicio (reps, carga, e1RM, «igualaste tu mejor marca»), cumplimiento frente al plan (series principales hechas y planeadas por ejercicio), resumen de adaptaciones, señal de fatiga prudente (`hard`, `feel`, RIR) y recomendación para la próxima sesión (agregando `nextProposal`). Mover `detectPR` a la definición única por métrica |
| **Tendencias a largo plazo** | `sessionPoints` + `exerciseTrend` + `nextProposal` (6 sesiones/180 días, con `basis`); `progress/exercises.ts` `myExerciseProgress` (toda la historia por métrica, récords, `first`), `myProgressSummary` (frecuencia de 12 semanas, totales, marcas); `report.ts` mensual; `goals.ts`/`progressToGoal` | Tendencia de varios ejercicios o global («¿estoy progresando?»), volumen por grupo muscular, adherencia frente a `wishes.daysPerWeek`, detección de inactividad o regreso como evento, y un `basis` con **fechas concretas** de las sesiones usadas (`SessionPoint.at` ya trae los datos; `basis` hoy es genérico) |
| **«Máquina ocupada»** | `EXERCISE_CHANGE_REASONS.busy`, `sessionAlternatives` (mismo `kind`, grupo, alfabético, aprobados primero, `prev`), `dayAlternatives` (más parecido de nombre), `setExerciseChange` (ejecutor auditado, solo la sesión), `exercise_substitution`. TI recalcula objetivos para `doing` con la historia del reemplazo y sin arrastrar la carga | Un ranking determinista de 1 o 2 opciones: aprobados > mismo grupo > nombre parecido > tiene historia propia > **no usa el mismo equipo de la sede** (`gym_equipment_exercise`). Exponer el porqué. No existe un estado de «ocupado» del equipo (no inventarlo). Arreglar §10.2 y §10.3 |
| **«Poco tiempo»** | Solo en la IA (`aiSoloAdvice` baja series), `countFor(minutes)` en la rutina sin programa, `wishes.minutes`, saltar con `no_time` de a uno, `decideSkip` para etapas | `shortenSession({exercises, logged, skipped, minutes, now})` puro: estimación de duración (filas × (trabajo estimado + `restSec`/etapas; EMOM = intervalos; AMRAP por tiempo = duración)), prioridad (orden del programa y series principales antes que etapas o aislamiento; **no hay metadato de prioridad**: usar posición y bloque), conservar lo registrado y devolver «se conserva / se omite / por qué». Aplicar con `setExerciseChange(skip, no_time)` y `set_skip` tras confirmación (nivel 1). Nunca tocar el programa |
| Contexto de entrenamiento | `myTraining`, `getSession`, `trainingSignals`, `lastTimeByExercise`, `historyRows`, `soloPlan`, `mySettings` (wishes) | Un objeto unificado con procedencia, fecha, vigencia y calidad por dato (AC3 §3) |
| Acciones y autonomía | `setExerciseChange`, `setStageSkip`, `decideProposal` (auditadas e idempotentes por upsert); `validateProposal` (contrato v1 sin cargas); `checkLoad` | Política de autonomía nueva (§10.5), registro de acciones e idempotencia por id de pedido para las acciones del chat |

---

## 12. Recomendaciones de extensión (sin un segundo motor)

1. **Nuevo módulo puro** `packages/domain/src/coach-moments.ts` (o similar) que **consuma** `RowTarget`, `IntelEvent`, `Trend`, `Proposal`,
   `WorkMetrics` y `LoadCheck`, y produzca mensajes con `{code, priority, evidence: refs/fechas, text}`. Puede compartirse con el
   teléfono sin conexión. No debe recalcular cargas.
2. Corregir §10.1 en `recommendRow`: si las filas `main` tienen reps distintas, `last` = las filas con `specId === c.specId` (o el mismo `reps`).
   Agregar el test de pirámide. Subir `TI_VERSION` a `ti2.2` (los objetivos emitidos no se reescriben, ver `:27`).
3. Enganchar los eventos de AC3 en puntos que ya existen: `logSet` → `afterSetLogged` (serie), `setExerciseChange` (cambio),
   `sessionAction finish` → `closeTargets` (fin), `ensureTargets` (inicio o apertura), `recordDecision` (coach). Persistir en una
   tabla nueva y aditiva de eventos o mensajes con clave de deduplicación (`userId:sessionId:peId:code`) en lugar del `intelSeen`
   local.
4. Hacer que el cliente consuma `intel.targets` del servidor después de sincronizar, o documentar que la fuente de verdad en la
   sesión es la local (hoy pueden diferir con reemplazos).
5. Usar `checkLoad` como puerta para cualquier número de carga del chat o la IA, y `validateProposal` (o una v2) para propuestas de
   adaptación. Mantener «sin `weightKg`» en las propuestas que no vengan de las reglas.
6. Unificar la detección de récords (PP1 por métrica) en el dominio y reutilizarla en `sessionSummary` y en los eventos de logro.
7. Agregar `rpe` a `set_log` (migración aditiva) solo si AC3 lo necesita. Mientras tanto, documentar que la interpretación por serie
   usa RIR y `feel`.
