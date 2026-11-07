# REPI — Adaptive Coaching 3.0 · API del motor proactivo, push, entrenador y REPI Admin (D209, bloque C2)

Contrato general: `ADAPTIVE_COACHING_3.md` (§5 servidor, §7 seguridad). Pruebas: `AC3_PRUEBAS.md` (casos 41–55, 59–63).
Código: `apps/web/src/server/brain/{proactive,coach,admin}.ts`, `server/push/services.ts`, `server/notifications/feed.ts`.

Todas las rutas pasan por `handle()` (CSRF de escrituras) y piden sesión: sin sesión, **401** sin tocar el servicio
(`e2e/api-auth-sweep`; `tests/brain-coach-routes.test.ts`). Los errores siguen el formato de siempre:
`{ "error": "<texto para la persona>", "code": "<código>" }`. Nada de esto llama a un modelo de IA.

## 1. Motor proactivo (servicio, sin ruta propia)

### `homeCandidates(userId, now?)` — lo usa `GET /api/me/brain` (C1, `server/brain/home.ts`)

Evalúa a la persona (como mucho una vez por minuto por instancia) y devuelve lo vigente, por prioridad. Una falla del motor
nunca rompe Inicio: se devuelve lo guardado.

```json
{
  "card": InterventionView | null,
  "interventions": [InterventionView]
}
```

`InterventionView` (de `store.ts`): `{ id, kind, category, title, body, evidence: { basis, excluded?, sessions?: [{ at }], via },
actions: [{ id: "why"|"start"|"chat"|"accept"|"modify"|"dismiss"|"never"|"open", label }], data: { exerciseId?, sessionId?, routineId? },
channel: "card", status: "pending"|"shown", reason, priority, programVersionId, createdAt, shownAt, resolvedAt, expiresAt }`.
Con la asistencia proactiva apagada sólo quedan los de seguridad. Para aceptar, descartar o «no mostrar algo parecido» se usa
`POST /api/me/brain/intervention` (C1) con el `id`.

### Señales (consultas baratas sobre servicios existentes)

| Señal | De dónde | Aviso (`kind`) |
| --- | --- | --- |
| Sesiones de la semana vs. objetivo | `user_pref.wishes.daysPerWeek` + sesiones terminadas desde el lunes (AR) | `weekly_target_met` |
| Última sesión | `workout_session` | `inactivity` (≥ 5 días: «no registrás entrenamientos», nunca «faltaste») |
| Marcas de la última sesión (≤ 48 h) | `detectMarks` del dominio contra toda la historia válida | `pr` |
| Tendencias de los ejercicios de la última sesión (≤ 14 días) | Training Intelligence (`historyRows` + `outlookFor`) | `progressing`, `plateau`, `declining` (sólo con evidencia consistente o ≥ 5 sesiones) |
| Programa vigente | versión nueva o edición después de asignar, sin entrenar todavía con ella | `program_updated` |
| Rutinas importadas sin tocar (≤ 14 días) | `own_routine.origin` (Smart Import) | `import_unknowns` |
| Check-in de hoy con poca energía o mal descanso | `checkin` | `low_energy` |
| Sesión terminada hoy | `workout_session` | `session_review` |
| Lunes: semana anterior | sesiones terminadas lunes–domingo | `weekly_summary` (categoría `weekly`) |

Todo pasa por `decide` del dominio (prioridad, dedupe, enfriamiento, tope diario, categorías, «no mostrar más», menores,
obsoletos). Lo emitido queda `pending`; lo callado queda `suppressed` con su motivo (métricas). Cancelación de obsoletos:
otra versión del programa (`program_changed`, caso 50) y «¿Retomamos?» después de registrar una sesión (`session_logged`).

### `runProactive(now?, { force?, users?, limit?, budgetMs? })` — paso `brain` del cron

- Franjas: **9 y 18 h de Buenos Aires** (`PROACTIVE_SLOTS`). Fuera de franja responde `{ ran: false, reason: "fuera de franja" }`
  sin consultar nada.
- En cada minuto de la franja evalúa el 1/60 de las personas con sesiones terminadas en los últimos 45 días (por hash del id):
  cada una, una vez por franja. Excluye organizaciones demo y a quien apagó la asistencia proactiva.
- Topes: 100 personas por minuto y 8 s de presupuesto (el cron corre muchos pasos y pg_net corta a los 20 s); si se agota,
  `budgetHit: true` (se evalúan primero las más recientes).
- Idempotente: claves únicas `(user_id, dedupe_key)` y lock por persona; correrlo dos veces en el mismo minuto no duplica nada
  (caso 49). Deja una fila de auditoría `brain.proactive_run` sin personas ni contenido.
- Push: sólo con `brain_pref.push`, persona **adulta** y asistencia proactiva activa; como mucho **uno por día**, el aviso nuevo más
  importante entre `program_updated`, `weekly_target_met`, `weekly_summary` e `inactivity`, por la cola existente (`enqueue`) con
  clave `brain:<categoría>:<id del aviso>`.

Respuesta del cron (`GET /api/cron/notifications`, sólo con `CRON_SECRET`): campo nuevo
`"brain": null | { "evaluated": 3, "emitted": 2, "pushed": 1, "duplicates": 4, "failed": 0, "ms": 412, "budgetHit": false }`.

## 2. Push del Asistente REPI

### `GET /api/push` (cualquier persona con sesión)

Campo nuevo: `"coaching": { "enabled": boolean, "eligible": boolean }` — `enabled` = `brain_pref.push` y adulto;
`eligible` = adulto confirmado.

### `POST /api/push/subscribe`

```json
{ "endpoint": "https://fcm.googleapis.com/…", "keys": { "p256dh": "…", "auth": "…" }, "coaching": true }
```

- Sin `coaching` (o `false`): el registro de siempre → `{ "ok": true }`.
- Con `coaching: true`: registra el dispositivo **y** activa `brain_pref.push` (vía `updatePrefs`, auditado) →
  `{ "ok": true, "coaching": true }`.
- Errores: 400 `invalid` (endpoint fuera de los servicios de push permitidos o claves faltantes; `coaching` no booleano);
  403 `minor_restricted` (menor) y 403 `age_required` (edad sin confirmar): no se registra nada.
- Apagar: `PUT /api/me/brain/prefs { "push": false }` (C1). El dispositivo sigue registrado para los demás avisos.

### Reglas al enviar (`processOutbox`, sólo para `kind = "brain_coaching"`)

Se revisan al enviar, no sólo al encolar (las preferencias pueden cambiar mientras el aviso espera):

| Situación | Resultado (`notification_outbox`) |
| --- | --- |
| Menor o edad sin confirmar (caso 59) | `skipped`, «menor o edad sin confirmar» |
| `push` o asistencia proactiva apagados | `skipped`, «push de REPI apagado» |
| Categoría apagada | `skipped`, «categoría apagada» |
| El aviso ya se vio, resolvió o canceló en la app (caso 51) | `skipped`, «ya visto en la app» |
| Aviso vencido o más de 24 h en la cola | `skipped`, «aviso vencido» |
| Horario de silencio (caso 47) | sigue `pending`, `next_attempt_at` = fin del silencio, **sin gastar intentos** |

Los demás tipos de push no cambian. La respuesta de `processOutbox` suma `postponed`.

## 3. Centro de notificaciones del socio

`GET /api/me/notifications`: los avisos vigentes del Asistente REPI son una fuente más (la persona ve sólo los suyos; con la
asistencia apagada, sólo seguridad). Ítem:

```json
{ "id": "assistant:<interventionId>", "origin": "assistant", "title": "¿Retomamos?", "body": "Hace 8 días que no registrás…",
  "at": "2026-11-07T12:00:00.000Z", "tone": "cyan", "dest": { "tab": "train" }, "unread": true, "cta": "Empezar",
  "ref": { "interventionId": "<id>" } }
```

`origin: "assistant"` se muestra como **«Asistente REPI»** (distinto de `origin: "repi"`, las novedades del producto).
`unread` = aviso todavía `pending`. `POST /api/me/notifications/seen` además pasa a `shown` los avisos pendientes del
Asistente: no se vuelven a empujar por push y siguen en Inicio hasta resolverse o vencer.

## 4. Señales para quien programa al alumno

### `GET /api/coach/[orgId]/clients/[relId]/brain` — entrenador privado

Permisos: `requireCoach` (dueño del espacio de coach) + `requireClientOf` (relación vigente con permiso `training`).

### `GET /api/gym/[orgId]/members/[memberId]/brain` — equipo de sala y coordinación

Permisos: `gymContext` + `program.edit` en la sede del socio (`inScope`) + consentimiento `attendance_training` (el mismo camino
que la ficha de Training Intelligence del gimnasio).

Respuesta (las dos):

```json
{
  "relation": { "kind": "coach" | "gym", "id": "<relId | memberId>" },
  "generatedAt": "2026-11-07T12:00:00.000Z",
  "windowDays": 30,
  "insights": [
    { "kind": "difficulty_rising", "count": 1, "text": "Viene registrando más dificultad en las últimas sesiones comparables de Sentadilla.",
      "evidence": { "basis": "Comparé sus sesiones del 28/10, 31/10, 03/11, 06/11: …", "sessions": [{ "at": "…" }] }, "refs": { "exerciseIds": ["…"] } },
    { "kind": "rejected_substitutions", "count": 2, "text": "Rechazó dos veces una sustitución propuesta por REPI; conviene revisar sus preferencias.", "evidence": { "basis": "…" } },
    { "kind": "rejected_recommendations", "count": 2, "text": "…", "evidence": { "basis": "…" } },
    { "kind": "pending_proposals", "count": 1, "text": "Hay una propuesta pendiente para revisar antes del próximo entrenamiento.", "evidence": { "basis": "…" }, "refs": { "proposalIds": ["…"], "exerciseIds": ["…"] } },
    { "kind": "student_requests", "count": 1, "text": "Te dejó un pedido para revisar su programa desde REPI.", "evidence": { "basis": "…" } }
  ],
  "counts": { "rejectedSubstitutions": 2, "rejectedRecommendations": 2, "pendingProposals": 1, "studentRequests": { "load": 1 } },
  "exercises": [{ "exerciseId": "…", "name": "Sentadilla", "trend": "declining", "confidence": "consistent", "sessions": 4, "dates": ["…"], "rising": true }],
  "notIncluded": ["Memoria y conversación del alumno con REPI", "Datos de salud (molestias, lesiones, check-ins)", "Rutinas propias o importadas por el alumno e historial importado", "Entrenamientos con otros profes u otras organizaciones"]
}
```

Reglas:
- Todo acotado a lo entrenado **en esa relación** (caso 53): tendencias con `historyRows` de la relación y sin historial
  importado; sustituciones rechazadas (`brain_action` `propose_substitution`/`apply_substitution` en `cancelled`) dentro de la
  ventana de una sesión de la relación; recomendaciones descartadas (`brain_intervention` de tendencia o poca energía en
  `dismissed`/`never`) atadas a una sesión de la relación; propuestas abiertas de la relación; pedidos del alumno
  (`propose_to_coach` ejecutada cuyo `result.proposalId` es una propuesta de la relación).
- «Dificultad creciente»: `exerciseTrend` en baja o «mismo rendimiento con más esfuerzo» con confianza **consistente**.
- Rechazos y descartes: insight desde **2** en 30 días; siempre sólo cantidades.
- Nunca: memoria, conversación, textos de avisos, notas, salud, rutinas propias o importadas del alumno. Sólo lectura: no crea
  propuestas (a diferencia de la ficha de Training Intelligence).

Errores:

| Código | Cuándo |
| --- | --- |
| 404 `not_found` | no es coach de esa organización; relación de otra organización, terminada o inexistente; socio de otra sede u organización |
| 403 `no_grant` | (coach) el alumno no compartió o revocó sus entrenamientos (caso 55) |
| 403 `forbidden` | (gimnasio) gerencia o dueño: administrar no da acceso a datos del socio (caso 62) |
| 403 `twofa_required` | (gimnasio) dueño sin verificación en dos pasos (antes que `forbidden`) |
| 403 `consent_required` | (gimnasio) el socio no compartió su entrenamiento con la sede |

## 5. REPI Admin · Coaching IA

Permisos: `requireAdmin` (rol de plataforma `admin`; 2FA si la política lo exige). Otra persona: 404.

### `GET /api/admin/brain?days=7` (1–400)

Todo agregado, **sin ids de personas ni contenido**:

```json
{
  "window": { "since": "…", "until": "…", "days": 7 },
  "recommendations": { "emitted": 0, "accepted": 0, "dismissed": 0, "rejected": 0, "ignored": 0, "open": 0, "cancelled": 0, "suppressed": 0,
    "suppressedByReason": { "daily_cap": 0, "quiet_hours": 0, "…": 0 }, "duplicatesAvoided": 0,
    "byKind": { "pr": { "emitted": 0, "accepted": 0, "dismissed": 0, "never": 0, "ignored": 0, "suppressed": 0 } } },
  "actions": { "executed": 0, "blocked": 0, "failed": 0, "cancelled": 0, "proposed": 0, "confirmed": 0, "byKind": { "save_preference": { "executed": 0 } } },
  "questions": { "rules": 0, "ai": 0, "fallback": 0, "safety": 0, "withoutAi": 0 },
  "feedback": { "positive": 0, "negative": 0 },
  "ai": { "configured": false,
    "totals": { "calls": 0, "errors": 0, "costUsd": 0, "inputTokens": 0, "outputTokens": 0, "budget": 0, "quota": 0, "breaker": 0, "cache": 0 },
    "byTaskModel": [{ "task": "brain.chat", "model": "gpt-6-luna", "calls": 0, "ok": 0, "errors": 0, "timeouts": 0, "badOutput": 0, "quota": 0, "budget": 0,
      "breaker": 0, "concurrency": 0, "cache": 0, "inFlight": 0, "inputTokens": 0, "cachedTokens": 0, "outputTokens": 0, "costMicros": 0, "costUsd": 0,
      "p50LatencyMs": null, "p95LatencyMs": null }] },
  "engine": {
    "breakers": [{ "task": "brain.chat", "model": "gpt-6-luna", "failures": 0, "open": false, "openedUntil": null, "threshold": 5 }],
    "policy": { "global": {}, "effective": AiPolicy, "defaults": AiPolicy, "orgs": [{ "scope": "org:<id>", "config": {}, "updatedAt": "…" }] },
    "models": [{ "model": "gpt-6-luna", "price": { "input": 0.1, "cached": 0.01, "output": 0.5 }, "selectable": true }],
    "proactive": { "runs": 0, "failedUsers": 0, "pushed": 0, "budgetHits": 0, "last": null | { "at": "…", "result": "ok", "evaluated": 0, "emitted": 0, "ms": 0 } },
    "push": { "pending": 0, "sent": 0, "skipped": 0, "failed": 0 }
  }
}
```

Definiciones: `emitted` = todo lo no callado; `dismissed` = «Descartar»; `rejected` = «No mostrar algo parecido»; `ignored` =
venció sin respuesta; `duplicatesAvoided` = candidatos que el cron no repitió (suma de `brain.proactive_run`); `questions` cuenta
respuestas de REPI por origen (`withoutAi` = reglas + fallback + seguridad); latencias p50/p95 sólo de llamadas reales al proveedor.

### `PUT /api/admin/brain` (alias: `PUT /api/admin/brain/policy`)

```json
{ "scope": "global" | "org:<orgId>", "config": { "enabled": true, "user_daily_calls": 30, "org_monthly_micros": 20000000,
  "global_daily_micros": 2000000, "max_concurrency": 4, "models": { "brain.chat": "gpt-6-luna" } } }
```

- Parche: lo enviado se guarda, `null` vuelve al valor heredado, lo no enviado queda igual.
- `global_daily_micros` y `max_concurrency` sólo en `global`. Modelos: sólo los de precio conocido (`PRICES` del gateway).
- Rangos: llamadas 0–1000 por día; organización hasta US$1000/mes; global hasta US$100/día; concurrencia 0–50. Con 0, la IA del
  cerebro queda apagada y todo sigue por reglas.
- Respuesta: `{ "scope": "global", "config": { … guardado … }, "effective": AiPolicy }`.
- Auditoría `brain.policy_updated` con campos, antes y después (números de configuración, no datos de personas); se vacía la caché
  de IA.
- Errores: 400 `invalid` (alcance, campo desconocido, rango, modelo sin precio, tope global en una organización); 404 organización
  inexistente o quien llama no es admin; 403 `twofa_required` si la política exige 2FA.

## 6. Desvíos y pendientes

- `homeCandidates` devuelve `InterventionView` (aviso guardado, con `id` para resolverlo) en lugar de un `Candidate` del dominio.
- Presupuesto del cron: 8 s y 100 personas por minuto (no ~20 s): el paso comparte el minuto con los demás y pg_net corta a los 20 s.
- La ruta del gimnasio es un archivo propio (`app/api/gym/[orgId]/members/[memberId]/brain/route.ts`), al lado del catch-all.
- No incluido: «la rutina importada tiene indicaciones que el alumno completó a mano» para el entrenador. Las rutinas propias o
  importadas del alumno son privadas y los programas del entrenador no guardan ediciones del alumno.
- No hay acción para «revisar la distribución semanal»: los pedidos del alumno se cuentan por tipo de `propose_to_coach`
  (`load`, `reps`, `hold`, `review`, `rest`).
- Interfaz (Coach, sala, REPI Admin, Perfil → push) y `lib/push.ts` con `coaching: true`: otra ronda.
