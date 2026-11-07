# REPI — Adaptive Coaching 3.0 · API del socio: conversación, acciones, contexto y cierre (D210, bloque C1)

Contrato general: `ADAPTIVE_COACHING_3.md` (§5 servidor, §6 interfaz, §7 seguridad). Pruebas: `AC3_PRUEBAS.md` (casos 10–14,
23, 25–31, 33, 36–41, 56, 58–60, 63–67, 69, 70). Código: `apps/web/src/server/brain/{context,orchestrator,actions,review,events,home}.ts`
y rutas en `apps/web/src/app/api/me/brain/**`.

## Reglas comunes

- **Sesión obligatoria.** Todas las rutas usan `handle()` + `sessionUserId()`: sin sesión, **401** `unauthorized` sin tocar el
  servicio. Una escritura desde otro sitio, **403** `cross_site` (`tests/brain-chat-routes.test.ts`; `e2e/api-auth-sweep`).
- **Sólo lo propio.** Todo se resuelve con el `userId` de la sesión. Un id ajeno responde **404**, igual que uno inexistente
  (mensajes, memoria, acciones, avisos, sesiones, referencias de pantalla). Nadie más lee la conversación ni la memoria: ni el
  entrenador, ni la gerencia, ni REPI Admin. No se usa `member.read`.
- **Errores** con el formato de siempre: `{ "error": "<texto para la persona>", "code": "<código>", "data"?: {…} }`. Cuerpo que
  no cumple el esquema (campos de más incluidos): **400** `invalid`.
- **Sin IA en lo frecuente.** Seguridad, intenciones conocidas, datos y acciones salen por reglas. La IA sólo redacta lo libre,
  por el gateway (cuotas, presupuesto, breaker, caché) y con esquema estricto. Si no está disponible, responde por reglas.
- **Offline.** Nada de esto está en el camino de registrar series. Sin conexión, la interfaz dice «REPI responde cuando vuelva la
  conexión» y no bloquea; `offlinePending` avisa al servidor que hay series en cola.

Tipos compartidos (de `@repi/domain/brain` y `server/brain/conversation.ts`):

```ts
MessageView = { id, threadId, role: "user"|"repi", text, cards: ReplyCard[], actions: ProposedAction[], section: string|null,
  ref: Record<string, string|number|null>|null, via: "rules"|"ai"|"fallback"|"safety"|null, feedback: -1|1|null, createdAt }
ReplyCard = { type: "fact", title, rows: [{ label, value }], via: "data"|"rules"|"ai" }
          | { type: "evidence", evidence: { basis, excluded?, sessions?: [{ at, label? }], via } }
          | { type: "alternatives", options: [{ exerciseId, name, why, approvedByCoach }] }
          | { type: "plan", keep: string[], skip: string[], note }
ProposedAction = { kind: ActionKind, label, preview, input: {…validado…}, key: "<kind>:<16 hex>",
  mode: "auto"|"confirm"|"blocked", reason: string|null, code: string, actionId }
```

`via` le dice a la interfaz qué mostrar: `rules` «Calculado por REPI», `ai` «Sugerencia generada con IA», `safety` respuesta
fija de seguridad, `fallback` sin IA por límite o error. Las tarjetas `fact` con `via: "data"` son «Dato registrado».

## 1. `GET /api/me/brain` — Inicio

La tarjeta y los avisos los decide el motor proactivo (`proactive.homeCandidates`, C2). Si falla, se devuelven los avisos ya
guardados (`source: "stored"`). La línea de «hoy» es determinística.

```json
{
  "card": InterventionView | null,
  "interventions": [InterventionView],
  "source": "proactive" | "stored",
  "today": { "text": "Hoy te toca Espalda y pecho, con tres ejercicios.", "sessionOpen": false, "sessionId": null,
             "dayKey": "<program_day.id>" | null, "dayName": "Espalda y pecho" | null, "programOwner": "coach" | "gym" | "own" | null },
  "prefs": { "proactive": true, "tone": "normal", "autonomy": 1 }
}
```

`InterventionView`: ver `AC3_API_PROACTIVO_COACH_ADMIN.md` §1.

## 2. `POST /api/me/brain/message` — un mensaje a REPI

```json
{ "text": "La máquina está ocupada",            // 1–1000 caracteres
  "section": "workout",                          // home|workout|review|progress|body|history|routines|messages|gym|profile|club (otro → home)
  "ref": { "exerciseId"?: "…", "programExerciseId"?: "…", "sessionId"?: "…", "routineId"?: "…", "setIndex"?: 0 },  // opcional
  "clientId": "msg-…",                           // opcional, [\w-]{8,64}: hace idempotente el reintento
  "offlinePending": false }                      // opcional
```

Respuesta **200**:

```json
{ "message": MessageView, "reply": MessageView, "suggestions": ["La máquina está ocupada", "…"], "replayed": false }
```

- **Idempotente por `clientId`:** el mismo `clientId` devuelve el mismo par (`replayed: true`) y no repite nada (caso 23).
- **Referencia validada:** `ref` sólo sugiere. Un ejercicio, sesión o rutina que no es de la persona → **404** y no se guarda el
  mensaje (casos 40, 63). Formato inválido → **400**.
- **Historial del modelo:** sale de la base (últimos 6 turnos), nunca del navegador; un cuerpo con `history` → **400**.
- **Límite:** 30 mensajes por minuto por persona → **429** `rate_limited`.
- **Orden de decisión:** seguridad (alarma o molestia: `via: "safety"`, molestia con la acción `report_discomfort`) → intención
  por reglas → «sí»/«no» resuelven lo pendiente del turno anterior (hasta 60 min; p. ej. «¿Te referís a Jalón al pecho…?» →
  «Sí» → alternativas → «Sí» → ejecuta y confirma con el resultado real) → respuesta con datos → IA (sólo lo libre) → fallback.
- **Seguimiento:** sin ejercicio en el texto, usa el de la pantalla o el del turno anterior («¿y la última marca?»), en cualquier
  sección: la conversación es una sola (caso 28).
- **Edad:** menores y edad desconocida no hablan de cuerpo, peso ni alimentación (ni por reglas ni por IA).
- **IA:** contexto mínimo (`contextForAi`: sin ids, emails, organización, fotos ni salud), turnos previos y el mensaje van como
  datos delimitados (`<<<DATO …>>>`). Esquema estricto `{ reply ≤ 600, actions ≤ 2 (open_workout | show_history |
  draft_coach_message, con ejercicios por código e1…), remember | null }`. Una carga en kg/lb que no está en los datos → la
  respuesta no se usa (`via: "fallback"`). Lo operativo (reemplazos, acortar, propuestas) sólo lo proponen las reglas.
- `reply.ref` guarda el estado del turno: `{ replyTo, intent, exerciseId?, pending?, reason?, primary?, actionKey?, result?, ai? }`.

## 3. `GET /api/me/brain/thread?limit=50` — la conversación vigente

```json
{ "thread": { "id", "createdAt", "updatedAt", "closedAt": null } | null, "messages": [MessageView] }
```

No crea una conversación nueva. `limit` 1–200.

## 4. `POST /api/me/brain/thread/close`

```json
{ "threadId"?: "…" }  →  { "closed": true | false }
```

Idempotente. La próxima pregunta abre otra conversación.

## 5. `POST /api/me/brain/action` — proponer, confirmar o cancelar

```json
{ "op": "confirm", "key": "apply_substitution:0123456789abcdef", "details"?: { "level"?: 0–10, "zone"?: "Rodilla der." } }
{ "op": "cancel",  "key": "…" }
{ "op": "propose", "kind": "update_prefs", "input": { "patch": { "maxPerDay": 1 } }, "key"?: "update_prefs:<16 hex>", "section"?: "profile" }
```

Respuestas:

```json
// confirm
{ "ok": true, "executed": true, "action": ActionView, "result": { "text": "Listo: …", … }, "text": "Listo: …" }
{ "ok": false, "executed": false, "action": ActionView, "result": null, "text": "No pude aplicar el reemplazo: no se cambió nada. …", "code": "relation_inactive" }
// cancel
{ "action": ActionView, "changed": true }
// propose
{ "action": ActionView, "mode": "auto"|"confirm"|"blocked", "reason": string|null, "outcome": ExecOutcome | null }
```

`ActionView = { id, kind, idempotencyKey, status: proposed|confirmed|executed|failed|blocked|cancelled, autonomy, input, result, error, createdAt, executedAt }`.

- **Confirmar** exige una propuesta registrada por el servidor (por `key`); el navegador no inventa entradas. Se vuelve a validar
  con el contexto de ese momento: si ya no vale (p. ej. el ejercicio ya tiene series), queda `blocked` y `ok: false, code:
  "stale"`. Un reintento de lo ya ejecutado devuelve el resultado guardado con `executed: false` (caso 23).
- **Fallas:** si el servicio falla, la acción queda `failed` con el código y `text` lo dice; nunca «Listo» (caso 70).
- **Molestia:** `report_discomfort` necesita `details.level` (0–10, lo elige la persona) y la zona si no se puede deducir (hombro y
  rodilla piden el lado) → **409** `details_required` con `data: { fields, zones }`, sin consumir la acción.
- **Proponer** desde un atajo valida igual que el chat; con `mode: "auto"` se ejecuta en el mismo pedido (`outcome`).
- **Códigos:** 400 `invalid` (acción fuera del catálogo, campos de más, números fuera de rango, clave mal formada), 404, 409
  `invalid_state` (ya resuelta), 409 `details_required`, 429 `rate_limited` (30/min).

Catálogo (`@repi/domain/brain` `ACTIONS`) y ejecutor:

| Acción | Qué hace en el servidor | Confirmación (autonomía 1) |
| --- | --- | --- |
| `open_workout`, `show_history`, `propose_substitution`, `propose_short_session` | sólo navegación: `result.navigate` | no (auto) |
| `apply_substitution` | `setExerciseChange` de la sesión abierta, sólo por hoy; alternativas de `rankAlternatives` (aprobadas por el entrenador primero) | sí (`coach_program` con programa de entrenador) |
| `apply_short_session` | omite hoy (`skip`, motivo `no_time`) los pendientes elegidos; nunca lo registrado; todo o nada | sí |
| `save_preference` / `delete_memory` | memoria (la nueva preferencia reemplaza a la de la misma clave; tono y categorías también cambian `brain_pref`) | sí |
| `update_prefs` | `updatePrefs` (push sólo adultos) | sí |
| `record_feedback` | opinión sobre un mensaje o un aviso | no |
| `draft_coach_message` | devuelve `{ draft, to, sent: false }`; nunca envía | no (auto) |
| `floor_help` | pedido a la sala por REPI Connect (`memberCreate`, idempotente por la clave); sin sede o sin Connect, falla y lo dice | sí |
| `report_discomfort` | `reportPain` privado (no se comparte solo) | siempre (salud) |
| `propose_to_coach` | `training_proposal` abierta (`algo_version: "brain-1"`) para que el entrenador decida; exige relación con permiso de entrenamientos; nunca cambia el programa | siempre |

Autonomía 0 bloquea lo operativo (`code: "autonomy_info"`). Autonomía 2 ejecuta sólo lo habilitado una por una
(`AUTO_ALLOWED`, hoy vacío). Cada ejecución deja `audit_event` `brain.action_executed` / `brain.action_failed` (sólo `kind` y
código, nunca contenido) y una decisión en la memoria.

## 6. `POST /api/me/brain/intervention`

```json
{ "id": "<brain_intervention.id>", "op": "shown" | "accepted" | "dismissed" | "never" }  →  { "intervention": InterventionView, "changed": true }
```

Idempotente; un cambio que no corresponde (aceptar lo descartado) → **409** `invalid_state`. Aceptar, descartar o «no mostrar
algo parecido» queda como decisión en la memoria.

## 7. `POST /api/me/brain/feedback`

```json
{ "messageId": "…", "value": 1 | -1 | null }  →  { "message": MessageView }
```

Sólo mensajes de REPI de la persona (404 si no).

## 8. `GET /api/me/brain/prefs` y `PUT /api/me/brain/prefs`

```json
GET  → { "prefs": { "proactive": true, "push": false, "categories": { "training": true, "progress": true, "performance": true, "motivation": false, "weekly": true },
                    "quietStart": "22:00", "quietEnd": "08:00", "maxPerDay": 2, "autonomy": 1, "tone": "normal" } }
PUT  { "tone": "breve" }  → { "prefs": {…} }
```

`PUT` cambia sólo lo enviado (validación estricta: campo desconocido o fuera de rango → **400**). `push: true` exige adulto
(menor **403** `minor_restricted`; edad sin confirmar **403** `age_required`).

## 9. `GET /api/me/brain/memory` y `DELETE /api/me/brain/memory/[id]`

```json
GET → { "items": [{ "id", "kind": "preference"|"decision"|"outcome"|"temporal", "key", "value", "text", "source": "user"|"system"|"coach",
                    "ref", "createdAt", "expiresAt" }] }
DELETE → { "deleted": true }
```

Lo vigente (sin vencer ni revocar). Borrar es definitivo y deshace lo que ese recuerdo había cambiado (tono, categoría
apagada) si no queda otro igual. Ajeno o inexistente → **404**.

## 10. `GET /api/me/brain/session/[id]/review` — el cierre

```json
{ "sessionId", "status": "in_progress"|"paused"|"completed"|"abandoned", "dayName", "at",
  "review": { "text": "Hoy completaste 4 de las 9 series previstas. …", "planned": 9, "done": 4,
    "exercises": [{ "exerciseId", "name", "status": "done"|"partial"|"skipped", "doneMain", "plannedMain",
                    "comparison": "more"|"same"|"fewer"|"first"|"not_comparable", "delta", "mark" }],
    "skipped": ["Jalón al pecho"], "adaptations": ["acortaste la sesión por falta de tiempo"],
    "marks": [{ "type": "load"|"reps_at_load"|"e1rm"|"reps"|"time", "value", "previous", "tie", "text" }],
    "fatigue": false, "next": { "kind", "text", "requiresCoach" }, "ask": string|null,
    "evidence": { "basis": "Comparé cada ejercicio con su sesión comparable anterior: …", "excluded": "…", "sessions", "via": "rules" } } }
```

Datos reales: previstas (series principales del plan) contra hechas, la sesión comparable anterior de cada ejercicio (antes de
esta), marcas contra toda la historia válida previa (la primera vez no es récord), omitidos, reemplazos y la propuesta prudente
de Training Intelligence. Excluye anuladas, aproximaciones y etapas. Abierta: parcial, sin guardar nada. Terminada: deja el
resultado en la memoria (`outcome`, clave `session_review:<id>`, sin duplicar). Anulada → **409** `voided`. Ajena → **404**.

## 11. Contexto (servicio, sin ruta)

`buildContext(userId, { section, ref })` → `BrainContext`; `loadContext` agrega lo que queda del lado del servidor (ids reales,
sesión con lo registrado y omitido, relación para presupuesto y sala, dueño de lo que se modificaría hoy, evitados y
restricciones por nombre). Dos tandas de consultas en paralelo; medido en local: **14–37 ms** (objetivo ~150 ms). Salud
(check-in, molestias, lesiones) sólo para la propia persona y nunca hacia la IA; cuerpo sólo adultos y sólo números (nunca fotos).
