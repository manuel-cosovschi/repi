# REPI — Adaptive Coach y Repi Proactivo: arquitectura

Actualizado: 27/10/2026 (D108). Fuente: pedido «MASTER FEATURE EXPANSION» del titular (chat del 27/10). Estado: **fase 1 en curso**. Nada de esto toma decisiones médicas ni reemplaza al entrenador. No está listo para producción hasta validar los casos críticos (tests A–Q) en uso real.

## Principios

1. **Eventos + reglas + plantillas + IA bajo demanda.** Primero datos existentes, después reglas determinísticas y reutilización; un modelo sólo cuando el problema lo requiere (fases 3+). Fase 1 y 2: cero llamadas a IA.
2. **Toda propuesta es un dato, no una instrucción.** Pasa por `validateProposal` (biblioteca, rangos, sin cargas inventadas) y por permisos/autonomía antes de mostrarse o aplicarse. Si falla, se descarta entera.
3. **La sesión cambia, el programa no.** Las adaptaciones viven en la sesión (`session_exercise_change`, D106). Modificar el programa futuro sigue siendo del entrenador, con versión y motivo (versionado existente de `program_version`).
4. **Seguridad por encima de autonomía.** Ningún nivel saltea restricciones, consentimientos ni permisos. Dolor: frenar, registrar la molestia, contactar al entrenador; nunca entrenar a través del dolor.
5. **Identidad visual vigente.** El pedido menciona Inter Tight: está superada por G · Atlética (`REPI_SELECCION_VISUAL.md`). Se mantienen Barlow / Barlow Condensed, paleta Concepto 2 y motion M01–M05.

## Qué se reutiliza (auditoría 27/10)

| Necesidad del pedido | Ya existe | Dónde |
|---|---|---|
| Rutina asignada, día siguiente, versión | Sí | `myTraining`, `program_version`, `nextDayIndex` |
| Sesión incompleta y lo hecho | Sí | `workout_session` abierta + `set_log`; offline con cola |
| Cambiar / saltar ejercicio en la sesión con motivo | Sí (D106) | `session_exercise_change`, `rankAlternatives`, `ExerciseChange.tsx` |
| Check-in del día (energía, sueño, ánimo) | Sí | `checkin` (3 toques antes de entrenar, saltable) |
| Molestias y lesiones | Sí (dato sensible, por consentimiento) | `pain_report`, `injury` |
| Turno programado vs. presencia confirmada | Sí | `shift_plan` (programado) vs. `shift_log` abierto (presencia real) |
| Pedir ayuda / técnica al entrenador | Sí | `HelpSheet`, `gym_task`, avisos al piso |
| Historial y cargas por ejercicio | Sí | `lastSetByExercise`, `bestE1rm`, informe mensual |
| Bandeja y entrega de avisos | Sí | `notification_outbox`, push, centro de avisos staff y alumno |
| Auditoría por actor y organización | Sí | `audit_event` |

## Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 · Fundaciones | Núcleo determinístico (`packages/domain/src/adaptive.ts`): niveles de autonomía, `planSolo` (casos A/B/C, ADP-01/03/08), contrato y validador de propuestas. «No vino el profe» / «Quiero entrenar por mi cuenta» en Entrenar. Métrica `adaptive.solo_plan` con `usesAI:false`. | **Hecho (D108)** |
| 1b · Políticas y sustituciones | Tabla de sustituciones aprobadas por coach/organización (EXT-05) priorizadas en las alternativas; política de autonomía por organización (nivel por defecto 1) y quién aprueba; restricciones con vigencia (EXT-06) sin inferir autorizaciones médicas. | Pendiente |
| 2 · Adaptación sin IA | «Adaptar entrenamiento» con motivos rápidos: poco tiempo (ADP-04, recorte determinístico por prioridad y lo ya hecho), gimnasio lleno (ADP-05), equipo alternativo (ADP-06); comparador antes/después; historial de adaptaciones; equipamiento por sede y fuera de servicio (EXT-02/03). | Pendiente |
| 3 · Asistencia con IA | Router de modelos (económico/avanzado), salida estructurada validada, presupuestos y límites por organización, cache con invalidación por cambio de restricciones (TEST P), fallback sin IA. | Pendiente (requiere decisión de gasto del titular) |
| 4 · Repi Proactivo | Opt-in explícito, preferencias por categoría, horarios de silencio, deduplicación y digest; motor por eventos sobre `notification_outbox`; sin IA para datos existentes. | Pendiente |
| 5 · Coach y piso | Asistente en el constructor (borradores revisables, comparar, aplicar a sesión o a futuro con versión); modo entrenador de piso con continuidad entre turnos. | Pendiente |
| 6 · Optimización | Costos, latencia, calidad, evaluación de casos, observabilidad. | Pendiente |

## Casos de aceptación (estado)

| Test | Estado |
|---|---|
| A · rutina existente sin generar otra | Cubierto (`tests/adaptive.test.ts`, `adaptive.test.ts` dominio) |
| B · día extra sin duplicar sesión intensa | Cubierto (propone descansar; «hacer igual» marcado como no recomendado) |
| C · máquina ocupada con alternativas reales | Cubierto por D106 (alternativas compatibles de la biblioteca; no inventa equipo) |
| D · poco tiempo | Fase 2 |
| E · molestia | Parcial: D106 muestra aviso y registro de molestia; flujo completo en fase 2 |
| F · el programa queda intacto | Cubierto (D106, test) |
| G · aprobación obligatoria | Fase 1b/2 (política) |
| H · entrenador de piso registrado | Fase 5 |
| I · privacidad entre organizaciones | Vigente por arquitectura multitenant; agregar casos específicos con cada fase |
| J · no llamar a IA si no hace falta | Cubierto (fase 1 nunca llama a IA; auditado) |
| K, M · proactividad y deduplicación | Fase 4 |
| L · turno programado ≠ presencia | Datos listos (`shift_plan` / `shift_log`); interfaz en fase 4 (PRO-01) |
| N · sin conectividad | Vigente: la sesión offline no depende de esto; la hoja avisa si no hay red |
| O · IA inconsistente rechazada | Validador listo y probado; se usa en fase 3 |
| P · restricción cambiada invalida cache | Fase 3 |
| Q · coach adapta y edita antes de aplicar | Fase 5 |

## Límites conocidos

- Fase 1 no genera sesiones: sin programa, deriva al coach o al gimnasio.
- «Hoy» se calcula en hora de Argentina (como el resto de la app).
- La métrica «resuelto sin IA» se lee de `audit_event` (`adaptive.solo_plan`); falta tablero.
- Documentos pedidos aún no creados (se crean con su fase): `TRAINING_CONTEXT_SPEC.md`, `EXERCISE_SUBSTITUTION_RULES.md`, `TRAINING_SAFETY_POLICY.md`, `WORKOUT_ADAPTATION_API.md`, `PROACTIVE_ENGINE_ARCHITECTURE.md`, `PROACTIVE_EVENTS.md`, `AI_COST_OPTIMIZATION.md`, `ADAPTIVE_COACH_TEST_PLAN.md`.
