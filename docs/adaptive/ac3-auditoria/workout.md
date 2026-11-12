# AC3 audit — Workout & session flow (code at main 08d4a50)

Scope: member workout screen, session/set APIs, check-in, discomfort, rest timer, substitutions, day selection, finish/summary,
corrections/voids, offline layer (IndexedDB store + queue + service worker). Code is the source of truth. All paths are
relative to `/home/user/repi`. Line numbers are from this commit.

---

## 1. File map

| Concern | File | Notes |
|---|---|---|
| Workout screen (live + summary) | `apps/web/src/components/member/Workout.tsx` (953 l.) | `Workout` (l.79), `Done` (l.799), `WeightStepper` (l.874), `RirControl` (l.931), `SetNoteSheet` (l.782), `localSummary`/`serverSummary` (l.48/66) |
| Session start, day pick, check-in gate, "en curso" chip | `apps/web/src/components/member/MemberApp.tsx` | `load` l.111, stamp poll l.152-178, SW register l.180-187, `start` l.224, `begin` l.263-306, `<Workout>` mount l.317, Home l.474, Train l.618 |
| Set guide (Anterior/Profe/REPI/Real) | `apps/web/src/components/member/SetGuide.tsx` | consumes `RowTarget`; "Usar" only fills the draft |
| Change exercise sheet | `apps/web/src/components/member/ExerciseChange.tsx` | reasons + alternatives (online) + skip (offline OK) |
| Sync status text | `apps/web/src/components/member/SyncBadge.tsx` | `syncView(st, {anyDone, conflicts, rejected})` |
| Check-in / pain / injury sheets | `apps/web/src/components/member/FollowSheets.tsx` | `CheckinSheet` l.13, `PainSheet` l.31 |
| Other workout sheets | `PlatesSheet.tsx`, `SetControl.tsx` (timer/counter for timed/AMRAP), `SessionCalories.tsx`, `Nudges.tsx`, `Hint.tsx`, `Presence.tsx`, `Connect.tsx` | |
| Rest notification (local) | `apps/web/src/lib/restAlert.ts` | per-device, `localStorage["repi:rest-alert"]`, SW `showNotification` |
| Offline store | `apps/web/src/lib/offline/store.ts` | `LocalSession`, `fromServer`, `localAction`, `mergeIntel`, `keepLocalOnly`, owner wipe |
| Offline queue | `apps/web/src/lib/offline/queue.ts` | `enqueue`, `flush`, `applyResult`, `subscribe`, `pendingFor`, `dropSession` |
| IndexedDB wrapper | `apps/web/src/lib/offline/idb.ts` | DB `repi_offline_v1` v1, stores `kv`, `sessions` (keyPath id), `queue` (autoInc `seq`, index `key`) |
| Service worker | `apps/web/public/sw.js` | shell cache `repi-shell-v1`; never caches `/api`; push + notificationclick |
| Server: sessions/sets | `apps/web/src/server/training/services.ts` (1435 l.) | see §3 |
| Server: Training Intelligence (targets) | `apps/web/src/server/training/intelligence.ts` | `ensureTargets`, `afterSetLogged`, `closeTargets`, `outlookFor` |
| Server: history corrections | `apps/web/src/server/training/history.ts` | `correctSet`, `setVoided`, `addMissingSet`, `sessionVoided` |
| Server: check-in/pain/injury | `apps/web/src/server/followup/services.ts` | `saveCheckin` l.45, `todayCheckin` l.52, `reportPain` l.57, `addInjury` l.71 |
| Server: approved substitutions (coach/gym) | `apps/web/src/server/training/substitutions.ts` | `listSubstitutions/addSubstitution/removeSubstitution` |
| Server: floor alert from set feel | `apps/web/src/server/gym/alerts.ts` | `raiseFloorAlert` l.37 (cooldown, push outbox) |
| Push outbox | `apps/web/src/server/push/services.ts` | `enqueue(userIds, {kind,dedupe,title,body,url})` l.48 (idempotent by `dedupe_key`), `runAfterResponse` uses `after()` |
| Idle auto-close cron | `apps/web/src/app/api/cron/notifications/route.ts:31` → `closeIdleWorkouts` | |
| Domain rules (pure) | `packages/domain/src/sync.ts`, `execution.ts`, `training.ts`, `intelligence.ts`, `session-changes.ts`, `gym.ts`, `load-safety.ts`, `progression.ts`, `metrics.ts`, `stages.ts`, `commercial.ts` (SET_FEEL) | shared by server and phone |
| HTTP wrapper | `apps/web/src/server/access/http.ts` | `handle()` (CSRF check `crossSiteWrite`, AccessError→JSON `{error, code, data}`), `sessionUserId()`, `body(req, zod)` |

---

## 2. API routes (all under `apps/web/src/app/api/me/`)

All routes: `handle(async (req) => svc(await sessionUserId(), …))`. Auth = Better-Auth session cookie. Authorization is done
inside the service (owner check `workoutSession.userId = userId`). Zod validation at the route.

| Method + path | Body (zod) | Service |
|---|---|---|
| `GET training` | — | `tr.myTraining(userId)` |
| `GET training/stamp` | — | `trainingStamp(userId)` → `{stamp}` (polled every 15 s, MemberApp l.152) |
| `GET training/previous` | — | `previousVersion(userId)` |
| `POST sessions` | `{id: ≤36, dayId, startedAt?, closeOther?}` | `tr.startSession` |
| `GET sessions/[id]` | — | `tr.getSession` |
| `POST sessions/[id]/sets` | `{id, programExerciseId, setIndex, weightKg|null, reps|null, rir|null, feel?, note?, baseRevision?, at?}` | `tr.logSet` |
| `POST sessions/[id]/action` | `{action: pause|resume|finish, at?}` | `tr.sessionAction(userId, id, action, new Date(), at)` |
| `GET sessions/[id]/exercises?pe=` | — | `tr.sessionAlternatives` |
| `POST sessions/[id]/exercises` | `{programExerciseId, change: {kind: skip|substitute, reason: busy|no_equipment|discomfort|no_time|other, exerciseId?} | null}` | `tr.setExerciseChange` |
| `POST sessions/[id]/skips` | `{programExerciseId, setIndex 0..39, skipped, at?}` | `tr.setStageSkip` (drop/rest-pause stage only) |
| `POST sessions/[id]/interval` | `{state: {peId, block, startedAt, emomSec 10..300, status}|null, at, sentAt}` | `tr.setSessionInterval` (EMOM) |
| `POST sessions/[id]/upgrade` | — | `tr.upgradeSession` (apply coach's new version mid-session) |
| `POST sessions/[id]/feedback` | `{rpe int, note?}` | `tr.sessionFeedback` (only `completed`) |
| `GET sessions/[id]/summary` | — | `tr.sessionSummary` |
| `GET conflicts` / `POST conflicts/[id]` | `{keep: local|server}` | `listConflicts` / `resolveConflict` |
| `POST checkin` / `GET checkin` | `{energy, sleep, mood}` ints | `fu.saveCheckin` / `fu.todayCheckin` |
| `POST pains` | `{zone, level, context: now|after|out, exerciseName?, sessionId?, note?, shareThis?}` | `fu.reportPain` |
| `GET/POST injuries`, `POST injuries/[id]` | | `fu.myInjuries/addInjury/updateInjury` |
| `GET history`, `GET history/[id]` | `?before=` | `h.historyList`, `h.historySession` |
| `POST history/[id]/sets/[setId]` | `{requestId, baseRevision, values{weightKg,reps,rir,feel,note}, reason?, confirm?}` strict | `h.correctSet` |
| `POST history/[id]/sets/[setId]/void` | `{requestId, voided, reason?}` | `h.setVoided` |
| `POST history/[id]/sets` | `{requestId, programExerciseId, setIndex, values, reason?, confirm?}` | `h.addMissingSet` |
| `POST history/[id]/void` | `{requestId, voided, reason?, baseRevision?}` | `h.sessionVoided` |
| `POST solo/routine/start` | `{id, dayName, exercises[]}` | `startSoloRoutine` (online only, server-created) |
| `POST routines/[id]/start` | `{id}` | `own-routines.startOwnRoutine` → `startSoloRoutine(source:"own")` |

---

## 3. Server services (`apps/web/src/server/training/services.ts`)

### 3.1 Authorization helpers
- `mySession(userId, sessionId, tx = db, lock = false)` l.733 — `select … where id = sessionId and user_id = userId` (optionally `FOR UPDATE`); 404 otherwise. **Only owner check**; no org check needed because the row is the user's.
- `assertRelationActive(tx, s)` l.741 — coach_client.status must be `active`; gym_member.status `active` and `accessUntil >= today` → else `AccessError("relation_inactive", …, 403)`. Called by logSet, setExerciseChange, setStageSkip, setSessionInterval, upgradeSession, sessionAction (not for finish).
- `gymPresence(tx, userId, gymMemberId, "gym.workout.start" | "gym.workout.log_set", now, clientAt, preferPassId?)` l.758 → `requireGymAction` (D127 presence check-in); skipped for solo/own (`isSoloSession` l.788, program.kind = 'solo').
- `myActive(userId)` l.531 — active relation = `user_pref.active_relation_id` or first with assignment (coach before gym). `myRelations` l.507.
- Coach-side reads: `requireCoach(actorId, orgId)` l.27 (staff_membership role `coach_owner`, active, org.kind coach), `requireClientOf(orgId, coachClientId)` l.37 (relation not ended + `consent_grant.item='training'` active, else 403 `no_grant`).
- Errors: `AccessError(code, message, status, data?)` (`server/access/util.ts:7`), audited when 403/404 via `recordDenied` (http.ts).

### 3.2 Exported functions (workout path)
```ts
myTraining(userId, now?) → { userId, firstName, coach, relation, relations, today, week, weightUnit, ai: boolean, stats{weekDone, doneDates, volumeThisWeek, volumeLastWeek},
  state: "no_program"|"scheduled"|"ready", openSession: string|null, openSessionDay, startsOn?, 
  program?: { name, weeks, note, version, nextDay: number, update{key, kind:"new"|"updated", author, at, reason, hasPrevious},
    days: { id, name, exercises: { id, exerciseId, name, sets, reps, rir, restSec, detail, prev{weightKg,reps}|null, suggest: Suggestion|null }[] }[] } }   // l.660
trainingStamp(userId) → { stamp }                                                     // l.550
trainingSignals(userId, now?) → Signals = { painOrInjury, lowReadiness, painNames:Set<string>, now }   // l.595 (pain_report 14 d, injury active/monitoring, today's checkin energy<=2||sleep<=2)
lastTimeByExercise(userId, exerciseIds, excludeSessionId?, scope?) → Map<exerciseId, LastTime{at, sets: LastSet[], reps}>   // l.565
lastSetByExercise(userId, exerciseIds, excludeSessionId?) → Map<exerciseId, {weightKg, reps, at}>  // l.645 (falls back to imported history)
startSession(userId, {id, dayId, startedAt?, closeOther?}, now?) → workout_session row          // l.800
startSoloRoutine(userId, {id, dayName, source?: "repi"|"own", exercises[]}, now?) → row         // l.848
getSession(userId, sessionId, now?) → SessionView (see 3.4)                                   // l.926
logSet(userId, sessionId, SetInput, now?) → { id, setIndex, weightKg, reps, rir, feel, note, revision, status: "ok"|"conflict", conflictId?, reason?, intel: {event: IntelEvent|null, targets: TargetOut[]}|null, alert: {id, notified}|null }  // l.993
listConflicts(userId, sessionId?) / resolveConflict(userId, conflictId, "local"|"server")      // l.1061 / l.1067
sessionAlternatives(userId, sessionId, programExerciseId) → { group, approvedBy: "coach"|"gym"|null, alternatives: {id,name,muscleGroup,kind,approved,approvedNote,sameGroup,prev}[] } // l.1087 (≤60)
dayAlternatives(userId, dayId, perExercise=5) → Map<peId, …>                                   // l.1110 (used by AI "No vino el profe")
setExerciseChange(userId, sessionId, {programExerciseId, change|null}, now?) → { change }      // l.1146
skippedRows(e) (pure)                                                                         // l.1183
setStageSkip(userId, sessionId, {programExerciseId, setIndex, skipped, at?}, now?)             // l.1192
setSessionInterval(userId, sessionId, {state|null, at, sentAt}, now?)                          // l.1229
upgradeSession(userId, sessionId, now?) → { changed, moved, kept[], session }                  // l.1259
sessionAction(userId, sessionId, "pause"|"resume"|"finish", now?, clientAt?) → { status, revision, achievements? } // l.1303
closeIdleWorkouts(now?) → number (cron)                                                       // l.1335
sessionFeedback(userId, sessionId, {rpe 1..10, note?})                                         // l.1365
sessionSummary(userId, sessionId) → SessionView & { exDone, exSkipped, exTotal, setsDone, setsTotal, prs[], metrics, volumeKg }  // l.1374
myHistory(userId)                                                                             // l.1408 (legacy; app uses history.ts)
toLogged(setRow, PlanIndex?) / timedPeIds(peIds) → PlanIndex                                   // l.482 / l.489
```

### 3.3 Key behaviors
- **startSession** (l.800-835): validates client UUID `^[0-9a-f-]{36}$`; `clampClientTime` (offline window 72 h, skew 5 min; `sync.ts:51`). Idempotent: existing row with same id returns it (other user → 404). Day must belong to any version of the active assignment's program; empty day → 409 `empty_day`. One open session per user (DB unique partial index `session_one_open_unique`); if another is open and `!closeOther` → 409 `open_session` with `data.other {id, dayName, startedAt, sets}`; with `closeOther` it finishes the other (audit `session.closed_for_other`). Locks the version (`program_version.locked = true`). Gym: presence + `floorTrainerId = todaysPick()`. **No audit event for a normal start.**
- **logSet** (l.993-1059): validates weight `^\d{1,4}(\.\d{1,2})?$` ≤1000, reps 0..3600 (≤200 unless timed/duration row), RIR 0..5, feel ∈ `SET_FEEL` keys, note via `cleanSetNote` (≤200). Tx: lock session; rejects `abandoned` (409 closed) and `voided` (409); relation active; gym presence (non-solo). Allows logging into a **completed** session (late offline sync; QA DATA-7). Row key `(session_id, program_exercise_id, set_index)` unique. `decideSetWrite` (`sync.ts:19`): insert | update (revision match, or DATA-8 baseRevision 0 & revision 1) | noop (same values) | conflict (`other_device` / `stale_base`) → upsert `sync_conflict` (unique open per `(session, targetKey)`), audit `sync.conflict`. On insert with active substitution, `exercise_id` = substitute. Writes `spec_id, set_kind, block_index, stage_index` via `rowRef`. Bumps `workout_session.updated_at`. After commit: `intelligence.afterSetLogged(...)` (errors swallowed) and, for gym sessions with a new alert feel (`FEEL_ALERTS = dificil|limite|molestia|ayuda`), `raiseFloorAlert` (push to floor staff on shift; cooldown except `ayuda`). **No audit for a normal set.**
- **sessionAction** (l.1303-1327): `applySessionAction` (`sync.ts:34`): pause (in_progress→paused, accumulates `activeMs`), resume (paused→in_progress, sets `lastResumedAt`), finish (→ `completed` if any set_log else `abandoned`; sets `endedAt`). Repeat = no-op (returns current status). Pause interrupts EMOM interval; finish clears it. After: `closeTargets` (training_target.decision = 'not_done') on completed/abandoned; `awardTrainingAchievements` on completed. **No audit of pause/resume/finish; pause intervals are not persisted** (only cumulative `activeMs`).
- **closeIdleWorkouts** (l.1335): every minute via cron; closes open sessions after 6 h idle (`WORKOUT_IDLE_CLOSE_MS`) or outside gym hours (22:00 AR / other day) for non-demo gym sessions; ends at last activity (max of startedAt, lastResumedAt, last set). Optimistic on `revision`. Audit `workout.auto_closed {status, reason: idle|gym_hours}`.
- **getSession** (l.926-982): heavy: day exercises + "kept" exercises (logged under a replaced version), changes, prev/lastTime/signals/media in parallel, `liveAssignment` (outdated flag), `sessionIntel` → `ensureTargets` (inserts missing targets for open sessions) + `outlookFor` + ladders (gym equipment). Intel failure never blocks (`.catch(() => null)`).
- **sessionSummary** (l.1374-1405): recomputes via `getSession`, then **PR detection per exercise with one query per exercise-id plus `timedPeIds`** (N+1). PR = `detectPR(prev, cur)` (Epley best e1rm, 1–12 reps, excludes timed/warm-up/rounds; requires prior history). Not persisted.
- **upgradeSession** (l.1259): needs no open conflicts; finds equivalent day (name > shared exercises > position), moves set_log/session_exercise_change/set_skip via `matchProgramExercises`; audit `session.upgraded`.

### 3.4 `getSession` data shape (consumed by `fromServer`)
```ts
{ id, dayId, dayName, status, note /*version note*/, rpe, sessionNote, outdated, startedAt, endedAt, activeMs, lastResumedAt, elapsedSec, revision,
  conflicts: {id, sessionId, kind, targetKey, server, client, createdAt}[], interval: IntervalState|null, serverNow,
  exercises: { id /*programExerciseId*/, exerciseId, name, kept?, sets, reps, rir, restSec, note, detail: ExerciseDetail|null,
    prev{weightKg,reps}|null, suggest: Suggestion|null, defaultWeight, defaultReps, media{kind,url}|null,
    targets: TargetOut[], outlook: {trend, proposal}|null, ladder: LoadLadder|null,
    change: {kind, reason, substitute{exerciseId,name}|null}|null,
    logs: {id, setIndex, exerciseId, weightKg, reps, rir, feel, note, completedAt, revision}[],
    skips: {setIndex, skipped, changedAt}[] }[] }
```

### 3.5 Training Intelligence hooks (`intelligence.ts`)
- `ensureTargets(userId, s, exs, now, gym)` l.113 — persists `training_target` rows for unlogged rows (idempotent via partial unique index `training_target_current_unique`), supersedes stale ones (version/exercise change). Uses `historyRows` (window `TI_WINDOW`), `trainingSignals` (pain/injury/low readiness → guards).
- `afterSetLogged(userId, sessionId, peId, setIndex, now)` l.164 → `{event: IntelEvent|null, targets}`; sets `decision` (accepted|modified) + `set_log_id` on the row's target; supersedes and re-inserts adjusted later targets (only hold/reduce). **The returned `event` is discarded by the client** (queue `applyResult` ignores `data.intel`).
- `closeTargets(sessionId)` l.198.
- Domain `adjustAfterSet` (`packages/domain/src/intelligence.ts:319`) → `IntelEvent {code: "pain"|"harder"|"short"|"easier"|"range_done"|"coach_hold", priority 1..5, text, row, restPlusSec}`; `topEvent` picks one. Rules: `feel==="molestia"` → `pain` (P1, caps later loads); `short` = reps < repsMin; `harder` = rir===0 || feel==="limite" || rir < rirTarget-1 || short; `far` short (≥3 under min) → `short` (P3, reduce load); coach-loaded next row → `coach_hold` (P2); last main row ≥ repsMax → `range_done` (P4); `facil` or rir ≥ rirTarget+2 with more rows → `easier` (P4). Warm-ups return no event. `restPlusSec` = 30 for main/top/backoff stage-0 non-EMOM on `harder/short`.

### 3.6 Check-in, discomfort, injuries (`server/followup/services.ts`)
- `saveCheckin(userId, {energy, sleep, mood})` — `scale5` each; upsert on `(user_id, date)` with AR local date. Not linked to a session.
- `reportPain(userId, {zone ∈ PAIN_ZONES, level 0..10, context now|after|out, exerciseName?, sessionId?, note?, shareThis?})` — inserts `pain_report`; `shareThis` needs active coach relation and is blocked for minors without guardian (`minorWithoutGuardian` → 403 `minor`); returns `{id, visibleToCoach, coachName}` (`coachSeesPain`: shared report or `health` grant). **No idempotency key; online only.**
- Injuries: `addInjury`, `updateInjury` (soft delete), `myInjuries`.
- These feed `trainingSignals` (own suggestions only). Coach-facing TI (`relationIntelligence`) deliberately excludes health data.

### 3.7 Substitutions
- Member: `sessionAlternatives` = library visible to the program org (`visibleIn(orgId, userId)`), filtered by same `exercise.kind` (`canSubstitute`), sorted same muscle group first (`rankAlternatives`), approved first (`withApproved`, from `exercise_substitution` of the program org), max 60, with `prev`. `setExerciseChange` validates the substitute is visible, different and same kind; upsert `session_exercise_change`; audit `session.exercise_skip|substitute|restored` with `{programExerciseId, reason, substitute?}`. Server allows while `paused`; UI hides the button when paused.
- Coach/gym: `substitutions.ts` `requireAuthor` = coach org → `requireCoach`; gym org → `gymContext` + `need("program.edit")`; max 8 per exercise (`APPROVED_SUBS_MAX`); audit `substitution.add/remove`.
- **No equipment availability/occupancy**: `gym_equipment` (schema l.113) has loads/increments/archived only; `gym_equipment_exercise` maps equipment↔exercise but `sessionAlternatives` does not use it. No restriction/injury filter on alternatives.

### 3.8 Corrections (`history.ts`)
Owner-only (`ownSession`, 404 for others incl. coach). Each mutation: `requestId` (`^[0-9a-f-]{8,64}$`) idempotency via `training_correction_request_unique (user_id, request_id)`; `baseRevision` optimistic check → 409 `correction_conflict` with `data.current`; large change → 409 `confirm_required` with `warnings`; append-only `training_correction` row (before/after diff) + `audit_event` without values (`history.set_corrected|set_voided|set_restored|set_added|session_voided|session_restored`); only `completed` sessions editable (open → 409 `open`; voided → 409 `voided`). `afterHistoryChange` only syncs trophies. Derived metrics recompute on read (all readers filter `voided_at is null` / status). Emitted training_target rows are never rewritten.

---

## 4. Database tables touched (`apps/web/src/db/schema.ts`)

| Table | Line | Key columns / constraints |
|---|---|---|
| `workout_session` | 433 | `id` (client UUID, PK), `user_id`, `coach_client_id`/`gym_member_id`, `assignment_id`, `version_id`, `day_id`, `day_name`, `status` (in_progress/paused/completed/abandoned/voided), `started_at`, `last_resumed_at`, `active_ms`, `ended_at`, `rpe`, `note`, `revision`, `updated_at`, `presence_checkin_id`, `floor_trainer_id`, `interval_state` jsonb, `voided_at/by/reason`. Unique partial `session_one_open_unique(user_id) where status in (in_progress, paused)` |
| `set_log` | 468 | `id` (client UUID), `session_id`, `program_exercise_id`, `exercise_id` (actually done), `set_index`, `weight_kg` text, `reps`, `rir`, `feel`, `note`, `spec_id`, `set_kind`, `block_index`, `stage_index`, `completed_at` (client time, clamped), `revision`, `updated_at`, `voided_at/by/reason`. Unique `(session_id, program_exercise_id, set_index)` |
| `set_skip` | 525 | `(session_id, program_exercise_id, set_index)` unique; `skipped`, `changed_at`, `spec_id` |
| `training_target` | 541 | per-row REPI target; `seq`, `superseded_at`, `decision` (accepted/modified/not_done), `set_log_id`, `algo_version`, `detail` jsonb {reasons, guards, text, why, review, prev, refs, coach} |
| `training_correction` | 502 | append-only corrections, unique `(user_id, request_id)` |
| `session_exercise_change` | 661 | unique `(session_id, program_exercise_id)`; `kind` skip/substitute, `substitute_exercise_id`, `reason` |
| `exercise_substitution` | 674 | org-level approved alternatives; unique `(org_id, exercise_id, substitute_exercise_id)` |
| `sync_conflict` | 685 | `kind` set/open_session, `target_key` `peId:setIndex`, server/client payloads, unique open per `(session_id, target_key)` |
| `checkin` | 703 | unique `(user_id, date)`; energy/sleep/mood 1–5 |
| `pain_report` | 714 | zone, level 0–10, context, exercise_name, session_id (no FK), note, shared_with_relation_id, seen_by_coach_at |
| `injury` | 728 | zone, status active/monitoring/resolved, soft delete |
| `floor_alert` | 1587 | unique `set_log_id`; feel, ack |
| `notification_outbox` | 1569 | `kind` enum (no workout/coaching kinds yet), unique `dedupe_key`, retries |
| `audit_event` | 310 | `actor_user_id, org_id, action, resource_type, resource_id, result, meta, at` |
| `gym_equipment`, `gym_equipment_exercise` | 113, 139 | equipment loads; no availability |

---

## 5. Client: Workout screen (`components/member/Workout.tsx`)

### 5.1 Props and state
`Workout({ sessionId, coachFirst, gym, gymOrgId?, demo?, connectPlace?, onExit(to: "train"|"home"|"prog"), onNudge?, flash(text), programChanged?, onDismissChange? })` l.79.
State: `s: LocalSession`, `exIdx`, `sel` (selected row index), `rir`, `feel`, `noteDraft` (draft for the current not-yet-done row), `now` (250 ms ticker l.172), `sync: SyncState`, `summary`, `justFinished`, sheet toggles (`pain`, `plates`, `changing`, `noteOpen`, `howto`, `exList`, `asking`, `revalidate`, `still`), `restAlert`, `outdated`, `upgrading`.
`commit(next)` l.110 = `setS(next); putLocal(next)` (note: React state keeps the old `updatedAt`; IDB gets a fresh one).

### 5.2 Flow
- **Load** (l.120-146): read IDB; if no local copy or (no pending queue items and no conflict) fetch `GET /sessions/:id` → `fromServer` + `keepLocalOnly` (re-uploads local-only stage skips) → `putLocal`. Else `flush()`. Voided → error. Completed/abandoned → summary. Else `exIdx` = first exercise with an unresolved row (**this is the "resumed session" entry point**).
- **Sync subscription** (l.148-171): on each queue state emit, re-reads IDB and merges: server-side changes win except (a) drafts of not-done rows and (b) `rest` (screen-only).
- **Intel fetch** (l.175-190): if any exercise has `targets == null` and the queue is empty/online, re-GETs the session and `mergeIntel` (fills targets/outlook/ladder only).
- **Rest timer** (l.192-194, 250-258, 621-654): `LocalSession.rest = {end: epochMs|null, total, left, paused}`; computed with `restLeft(end, now)` (timestamp based, `training.ts:123`). Duration from `restAfter` (stage pause, EMOM remainder, or `setTarget(...).restSec ?? ex.restSec`); superset/circuit flow uses `comboStep` (no rest between exercises until end of round). Controls: pause/resume ring, `+30s`, "Saltar descanso", optional local notification (`restAlert.ts`, SW `showNotification` tag `repi-rest`). Rest is **never synced** to the server or other devices. When `left<=0` → clears rest + `flash("Descanso terminado…")`.
- **Complete set** (`complete` l.298 → `completeNow` l.303-336): double-tap guard (`completing` ref, 450 ms); blocks pending-weight reduced sets and r<=0; writes row `{...done:true, rir, feel, note, at: ISO}`; carries weight to compatible later rows (`carriesLoad`); runs `adjustAfterSet` locally with `ex.targets` and `ex.ladder` (works offline) → updated targets + **one** message in `s.intel = {key: "peId:code", text, restPlusSec, at}`; dedupe via `s.intelSeen` (one message per exercise per code); then `advance()` (l.260) sets rest/combo/EMOM and enqueues `set:${sid}:${peId}:${idx}`.
- **Stage skip** `endBlockHere` l.338 / `unskip` l.287 → queue `skip`.
- **Pause/resume** `act` l.351 → `localAction` + queue `action:${sid}:${Date.now()}`.
- **Idle prompt** l.196-207: `WORKOUT_IDLE_PROMPT_MS` = 20 min without pointer/key activity and not during an active rest → `still="idle"` sheet "¿Seguís entrenando?" (l.741-754); back button → `still="leave"`.
- **Finish** l.376-404: confirm if main sets remain; `localAction(finish)`; abandoned (no sets) → drop locally if unsynced; else queue `action finish`, `flush()`, wait up to ~2 s for empty queue, `setJustFinished(true)`, `showSummary` (server summary if queue empty, else `localSummary` with `prs: []`).
- **Change exercise** `applyChange` l.452-468 (reset pending weights to substitute's `prev`), queue `exchange:${sid}:${peId}`.
- **Coach changed routine** banner l.543-550 (`programChanged` from MemberApp stamp poll, or `outdated`) → `applyNewRoutine` l.434 (online, empty queue) → `POST upgrade`.
- **Conflicts**: open-session conflict banner l.536-542; per-set two-version banners l.551-561 → `resolveSet` → `POST conflicts/:id` then refetch.
- **Rejected** (403 relation_inactive / presence_required / other start/set 4xx) banner l.525-535 with Validar ingreso / Reintentar / Descartar.

### 5.3 Done screen (`Done` l.799-870)
Hero (complete vs registered), stats3 (duration, exercises done/skipped, sets), first PR card (`sum.prs[0]`), `SessionCalories` (server only), `Nudges` (gym, challenge/ranking/club), Resumen rows + total volume, "¿Cómo te fue?" RPE slider (`StepSlider` 1–10) + note → IDB + queue `feedback:${sid}`; "Reportar molestia" → `PainSheet` (context "after"). Celebration gating `celebrationFor` (only just-finished, server-confirmed, complete → confetti; once per session via `sessionStorage`).

### 5.4 Session start (`MemberApp.tsx`)
- Day selection: server `myTraining.program.nextDay` = rotation after the last completed day of this assignment (`nextDayIndex`, by position; skips empty days). Train tab lets the user pick any day (`selDay = day ?? nextDay`, l.217; day chips l.677).
- `start(dayId)` l.224: open session → resume it; gym presence gate (offline: needs an unexpired pass); **check-in gate only online and if `inbox.checkinToday` is false** (`CheckinSheet`, skippable; failure still proceeds); then `begin`.
- `begin(dayId)` l.263-306: builds the full `LocalSession` on the phone (client `crypto.randomUUID()` for session and each row), prefills weights/reps (plan > accepted AI advice `aiPlan` > `suggest` > `prev`, via `startWeight`), applies AI swaps/skips as `change`, `putLocal`, enqueue `start:${sid}` (+ `exchange` items), opens Workout. Works fully offline.
- Solo/own routines: server-created (online only), then opens Workout by id.
- Resume entry points: "Entrenamiento en curso" chip (l.331), Home card (l.521-529), Train CTA (l.624/639). `load()` reconciles a locally-open session the server already auto-closed (l.126-135). Completed+synced local sessions are purged after 24 h (l.137-139).

---

## 6. Offline layer

### 6.1 Local model (`lib/offline/store.ts`)
- `LocalSet = { id, w, r, rir, feel?, note?, done, revision, at, pend?, skip?, skipAt?, conflict?{id, other{weightKg,reps,rir}, appliedIsMine} }`.
- `LocalEx = { id, exerciseId, name, sets, reps, rir, restSec, note, prev, detail?, change?, origPrev?, suggest?, media?, targets?, outlook?, ladder? }`.
- `LocalSession = { id, dayId, dayName, note, startedAt, status, activeMs, lastResumedAt, endedAt, rpe, sessionNote, revision, exercises, sets: Record<"peId:idx", LocalSet>, synced, closeOther?, conflict?, rejected?{message, at, code?}, rest?, iv?, ivAt?, skew?, intel?{key,text,restPlusSec,at}|null, intelSeen?: string[], updatedAt }`.
- Ownership: `ensureOwner(userId)` wipes all IDB stores + `localStorage repi_*` when the account changes (MemberApp l.116); 401/403/404 on `/training` → `wipeLocal`.
- Store holds training only ("nada de salud, mensajes ni fotos", store.ts:2). Cached program: `kv["training"] = {t, at}`.

### 6.2 Queue (`lib/offline/queue.ts`)
- `Item` kinds: `start`, `set{peId, idx}`, `action{action, at}`, `feedback`, `exchange{peId}`, `skip{peId, idx}`, `interval`. Items store **only what** to sync; the body is built at send time from the current IDB session (`build` l.46), so edits during flight are not lost.
- `enqueue` dedupes by `key` for set/feedback/start/exchange/skip/interval (one pending entry per key); `action` keys include `Date.now()` (each tap is an item).
- `flush` l.82: strictly ordered by `seq`; sessions with `conflict` are blocked (others continue). Network error / 5xx / 429 → offline, retry in 10 s (+ `online` and `visibilitychange` listeners l.204-207). 409 `open_session` on start → `s.conflict`. 403 `relation_inactive|presence_required` → `s.rejected`, session blocked (not deleted). 401 → stop with message. Other 4xx on `start`/`set` → `rejected`, blocked; on other kinds → item deleted + `hadError` (header shows "No se pudo sincronizar").
- `applyResult` l.145: start → `synced=true`; set → adopt server `id`, `revision`, or set `conflict`; keeps the item if values changed during flight; dispatches `repi:floor-alert` window event when `data.alert`; exchange/skip/interval compare the `sent` fingerprint to decide whether to delete the item; action → adopt `revision`. **Ignores `data.intel` and `data.achievements`.**
- **opId/idempotency summary**: session id and set ids are client UUIDs (server PK + unique keys) → retries are no-ops; set writes are revision-checked (`decideSetWrite`); actions are state-idempotent (`applySessionAction` returns null when not applicable); exchange/skip/interval are upserts with last-writer-wins by device time (skip/interval) ; feedback overwrite. Corrections use explicit `requestId`. Pain reports and check-ins have **no** opId (check-in is an upsert per day; pain inserts a new row each call).
- Queue state → UI via `subscribe` (`SyncState {kind: idle|saving|saved|pending|offline|error|conflict, pending, error?}`) → `syncView` text in the header.

### 6.3 Service worker (`public/sw.js`)
Production only (MemberApp l.180). Caches the `/app` shell (network-first navigate, cached fallback) and hashed `/_next/static` + `/brand` (cache-first). Never caches `/api` (data lives in IDB). No background sync; no periodic sync. Push handler shows minimal text (`title/body/tag/url`); `notificationclick` focuses/navigates (`focusOnly` for rest alerts).

---

## 7. Event map (what exists / where to emit)

Legend: C = computed on the phone (works offline); S = server; P = persisted evidence.

| AC3 event | Current detection | Persisted evidence | Audit today | Best emission hook |
|---|---|---|---|---|
| **session_start** | C `MemberApp.begin` l.263 (+queue `start`); S `startSession` l.800; solo/own `startSoloRoutine` l.848 | `workout_session` row (started_at client time, presence_checkin_id, floor_trainer_id) | none for program sessions; `adaptive.solo_routine_started` / `own_routine.started` for solo; `session.closed_for_other` | S: after tx in `startSession` (only on insert, not on the idempotent early return l.809); C: right after `enqueue(start)` for an offline "pre-workout" card |
| **set_completed** | C `completeNow` l.303; S `logSet` l.993 | `set_log` (+`training_target.decision`, `set_log_id`) | none (only `sync.conflict`) | S: after commit in `logSet` (l.1050-1058) only when `d.kind === "insert"` (not update/noop/conflict); key = set id |
| **fewer reps than target** | C+S `adjustAfterSet` → `short` (≥3 under `repsMin`) / `harder` (any under) | superseded `training_target` rows with reasons `in_session_short`/`in_session_harder`; decision `modified` | none | reuse `IntelEvent` from `afterSetLogged` (currently discarded); client already shows it in `s.intel` |
| **low RIR** | C+S `adjustAfterSet` → `harder` when `rir===0` or `rir < rirTarget-1` or `feel==="limite"`; gym: `FEEL_ALERTS` → floor alert | `set_log.rir/feel`; `floor_alert` row (gym) | none (floor alert has its own table) | same as above; floor path already emits push (`raiseFloorAlert`) |
| **PR** | S only, at summary time (`sessionSummary` l.1385-1400, `detectPR`); offline summary has `prs: []` | not persisted (computed on read); trophies via `awardTrainingAchievements` | none | S: in/after `afterSetLogged` using `historyRows` best e1rm (same `detectPR` rules, exclude warm-up/timed/rounds); C: possible only with a cached best-e1rm per exercise (not in `LocalEx` today; `prev` is only last set) |
| **exercise_changed** | C `applyChange` l.452; S `setExerciseChange` l.1146; coach version change `upgradeSession` | `session_exercise_change` (kind, reason, substitute) | `session.exercise_skip|substitute|restored` (+reason), `session.upgraded` | after upsert in `setExerciseChange`; reason `busy`/`no_equipment`/`discomfort`/`no_time` maps to AC3 context events (machine busy, missing equipment, discomfort, short on time) |
| **stage skipped** | C `endBlockHere` l.338; S `setStageSkip` | `set_skip` | `session.stage_skipped|restored` | existing |
| **long pause** | C idle prompt (20 min, no active rest) l.196-207; explicit pause `act("pause")`; S auto-close 6 h / gym hours | `workout_session.status=paused`, `active_ms`, `last_resumed_at`; no pause history | `workout.auto_closed` only | C: when `still` opens (offline-safe); S: `closeIdleWorkouts` loop (cron each minute) can emit "long idle" before the 6 h close (e.g. last activity > N min) |
| **session_finished** | C `finish` l.376; S `sessionAction("finish")` l.1303 (+`closeTargets`, achievements); S auto-close | status/ended_at/active_ms/rpe/note; training_target `not_done` | none (only auto-close) | S: after tx in `sessionAction` when `r.status === "completed"` (status transitions only once → natural dedupe); also in `closeIdleWorkouts` |
| **resumed session** | C `Workout.load` picks first open exercise l.144; `act("resume")`; Home/Train/chip entry points | `last_resumed_at` | none | C: in `load()` when status is in_progress/paused and any row is done; S: `sessionAction("resume")` |
| check-in (energy/sleep/mood) | `CheckinSheet` before begin (online only) | `checkin` row per day | none | after `saveCheckin` |
| discomfort | set `feel="molestia"` (→ `pain` IntelEvent P1, floor alert in gym); `PainSheet` (`/api/me/pains`); change reason `discomfort` | `pain_report`, `set_log.feel`, `session_exercise_change.reason` | none | after `reportPain`; and the `pain` IntelEvent path |
| coach updated routine mid-session | stamp poll l.152 → `programChanged`; `getSession.outdated` | program version | `session.upgraded` | existing |
| sync conflict / rejected | queue `applyResult`, `s.rejected` | `sync_conflict` | `sync.conflict`, `sync.resolved` | existing |

Natural idempotency keys already available: session id (client UUID), set id (client UUID), `(session, peId, setIndex)`, `(session, peId)` for changes, `training_target.id`, `pain_report.id`, `checkin (user, date)`, `audit_event` meta `opId` pattern used by `createTemplate` (advisory lock + lookup).

---

## 8. Where a non-blocking coaching UI fits (without hindering set logging)

Ordered by suitability. The dock CTA "Completar serie" (`data-cta`, l.717) must stay first and unobstructed; nothing should be modal during a set or rest countdown except safety (spec §23).

1. **Rest dock line `.ti-rest`** (l.641) — already the "after each set" slot: shown only while resting, `role="status"`, one message, optional "Sumar N s" (never auto-changes the timer). Best place for set-level coaching (fewer reps, low RIR, warm-up note, PR flash). Extend to a small "por qué" toggle.
2. **SetGuide** (l.583-590) — "before the set" slot (Anterior / Profe / REPI / Real + why toggle). Natural place for the spec's pre-exercise sentence ("La última vez… hoy…"), uncertainty and restriction warnings (already shows `safety` when `t.status==="limited"`/guards).
3. **`.coach-tip`** (l.617-619) — below the exercise card in the scroll body, shows coach/version note. A "REPI contextual card" for exercise-level insight can sit next to it (scroll area, not the dock).
4. **Exercise-complete dock** (l.727-728, `.ti-outlook` "Para la próxima sesión") — per-exercise wrap-up when the exercise is done and no row is selected.
5. **Done screen** (l.799-870) — post-workout: between `stats3` (l.831) and the PR card, or replacing the generic "Cada repetición cuenta" line (l.828); a "¿Lo tenemos en cuenta para la próxima?" action can live next to the RPE block (l.851).
6. **Header/banner zone** (l.525-561, `.conflict` boxes) — reserve for safety (pain ≥ `PAIN_WARN_LEVEL` 7) and coach instructions; not for routine tips.
7. **`flash()` toast** — global, non-blocking, ephemeral; fine for confirmations, not for content the user should be able to reread.
8. **Home/Train pre-workout** (`MemberApp` Home l.474-535, Train l.618-680, check-in sheet l.363) — readiness card before `begin`.

Do not add content inside the `.steppers` / `RirControl` / feel group block (l.703-715): it is the logging surface and is already dense on 320 px.

---

## 9. Extension points

- **Server post-set hook**: `logSet` after commit (services.ts l.1050-1058). Today runs `afterSetLogged` synchronously before responding. For AC3 events/AI, use `after()`-style deferral like `push/services.ts runAfterResponse` so set sync latency does not grow. Return a compact `coach` payload in the response (queue `applyResult` would need to read it).
- **Server status transitions**: `sessionAction` after tx (l.1319-1326), `closeIdleWorkouts` loop (l.1355-1360), `startSession` tx (only for new inserts), `setExerciseChange`, `setStageSkip`, `reportPain`, `saveCheckin`, `upgradeSession`.
- **Domain**: `adjustAfterSet`/`topEvent` (`packages/domain/src/intelligence.ts:312-377`) already implement per-set relevance with priorities matching spec §4 ordering (1 safety … 4 progress). Add codes (e.g. `warmup_note`, `pr`, `target_met`) here so phone and server stay identical.
- **Client queue**: add new `Item` kinds in `queue.ts` (union l.8, dedupe list l.32, `build` l.46, `applyResult` l.145). New kinds should be non-blocking (never set `rejected`, never surface `hadError`).
- **Client state**: `LocalSession.intel/intelSeen` (store.ts:41) is the existing per-session message + dedupe; `LocalEx.targets` carry `why`, `guards`, `reasons`, `algo` (version).
- **Alternatives**: `sessionAlternatives` l.1087 is the single place to add equipment-at-location filtering (`gym_equipment_exercise`, `laddersForMember` shows how to resolve the member's location) and restriction filtering; UI `ExerciseChangeSheet` lists all (≤60) — spec wants 1–2 proposals with confirmation.
- **Push**: `push/services.enqueue` with `dedupe` key; `notification_outbox.kind` enum must be extended for coaching kinds (migration). `notify_pref.paused` is the only opt-out (no quiet hours, no per-category).
- **Cron**: `/api/cron/notifications` (route.ts:31) already runs each minute; place for scheduled proactive checks.

---

## 10. Gaps vs AC3 spec (workout area)

1. **No unified event model/log.** Workout events are not recorded uniformly: start/pause/resume/finish/set are not audited; changes/skips/corrections use heterogeneous `audit_event.action` strings; IntelEvents are computed but never persisted (server) and only kept as one `s.intel` on the phone. No `opId` on events, no relevance engine state (cooldowns, quiet hours, "said recently", dismissals, cancellation of obsolete messages).
2. **Server IntelEvent discarded** — `afterSetLogged` returns `event`, client ignores `data.intel`; client recomputes locally (same rules), so server and client could diverge only by data, but there is no server-side record of what was shown.
3. **Single message slot, only during rest**; dedupe is per `(exercise, code)` for the session; no dismiss/"don't show again"/silence-assistance setting.
4. **No pre-exercise narrative** (spec §6 example); data is available (`t.prev`, `plan`, `t.why`) but rendered as rows.
5. **No warm-up acknowledgment** (`adjustAfterSet` returns null for warm-ups) and no "target met" positive feedback except `range_done` on the last main row.
6. **PR only at summary, server-only, N+1 queries**; offline summary never shows PRs; no in-session PR event.
7. **Long pause**: client-only 20-min prompt; server keeps no pause history; nothing proactive between 20 min and the 6 h auto-close.
8. **Machine busy / missing equipment**: only reason codes; alternatives ignore location equipment and restrictions; no "occupied" state anywhere in the schema; alternatives need network.
9. **Short on time**: only per-exercise skip with reason `no_time`; no session-level conservative adaptation preview.
10. **Discomfort**: `PainSheet` is online-only (offline → error flash), has no idempotency key, and there is no "stop this exercise" action flow beyond the change sheet note and the P1 `pain` message; coach sessions get no proactive signal (floor alert is gym-only).
11. **Check-in**: online-only, skipped offline, not tied to the session; readiness only lowers suggestions (`lowReadiness`), no in-session message.
12. **Post-workout**: no comparison vs previous session, no programmed-vs-done narrative beyond counts, no fatigue signal, no "keep in mind for next time" action, no memory update; achievements returned by `sessionAction` are ignored by the queue.
13. **Rest**: never synced; spec-compliant (never auto-changes), but no "wait before continuing" option.
14. **Offline recommendations**: targets carry `algo` version but no expiry/validity on the device (spec §22 asks for vigencia + versión).
15. **No chat entry point in the workout.** No AI in the workout path (good for cost); AI exists only in "No vino el profe" (`ai-coach.ts aiSoloAdvice`, gated by `aiOn()`), without quotas/budget per user in this path.

---

## 11. Risks for AC3 implementation

- **Lost-update window in IDB**: `putLocal` overwrites the whole session record. `queue.applyResult` does `getLocal → mutate → putLocal`; a UI `commit` between those awaits can be overwritten in IDB, and the Workout subscriber then adopts the IDB copy (React state keeps an old `updatedAt`, so `fresh.updatedAt > cur.updatedAt` is almost always true) preserving only not-done drafts and `rest`. New coaching fields stored in `LocalSession` (like `intel`, `intelSeen`, `exercises[].targets`) are exposed to this. Prefer a separate IDB key/store for AC3 coaching state.
- **IDB schema migration**: `idb.ts` opens version 1 and `onupgradeneeded` creates all stores unconditionally; adding a store requires bumping to v2 and guarding `objectStoreNames.contains(...)`, otherwise existing users' upgrade throws and offline training breaks.
- **Queue coupling**: one ordered queue per device; a 403 `relation_inactive`/`presence_required` or a 4xx on start/set blocks the whole session; non-start/set 4xx shows a red sync error in the workout header. Coaching items in the same queue could block or alarm set logging — use a separate, best-effort channel.
- **Set sync latency**: `logSet` already runs `afterSetLogged` (≈6 queries + possible equipment lookup) before responding; adding event/memory/AI work inline slows every set sync. Defer.
- **getSession cost**: called on load, after start (intel fetch), conflict resolution, upgrade and inside `sessionSummary`; it inserts targets (`ensureTargets`) on read. Adding coaching context there multiplies cost; prefer a dedicated endpoint.
- **Late sets into completed sessions** are accepted (DATA-7) and `afterSetLogged` returns no event for non-open sessions; event emission keyed on "session open" would miss late offline sets; PRs/summary can change after finish.
- **Time**: client times are clamped (72 h window, 5 min skew); local date is AR (-03:00) everywhere (`localDate`, `weekOf` uses T03:00Z). Quiet hours/cooldowns must use the same clock and tolerate offline-delayed timestamps.
- **Privacy boundaries**: `trainingSignals` mixes health data (pain, injury, check-in) into the member's own suggestions only; coach/gym TI excludes health and imported history. Any coach-facing coaching must respect `consent_grant` items `training`/`health` and `coachSeesPain`; minors: `minorWithoutGuardian` gates health sharing only.
- **Monolithic component**: `Workout.tsx` (953 l.) has many interdependent effects (merge logic, double-tap guard via `onPointerDownCapture`, idle detection via `lastAct`). New UI must not capture pointer events in a way that resets `completing` or `lastAct` incorrectly, and must keep the CTA order (D195 320 px rule).
- **Feature flags**: `features.ts` (`adaptive`, `exercise_video`, …) is the existing on/off mechanism; AC3 UI should be behind a new flag to keep the launch path reversible.
- **Tests**: DB tests (`apps/web/tests/training.test.ts`, `sync.test.ts`, `session-changes.test.ts`, `training-intelligence*.test.ts`, `history-corrections.test.ts`, `empty-day.test.ts`, `substitutions.test.ts`, `training-safety.test.ts`) use `tests/global-setup.ts`, which drops schemas — require a disposable DB. Pure client tests exist for the store (`workout-ladder-client.test.ts`, `prefill.test.ts`, `rest-alert.test.ts`) and domain vitest suites (`packages/domain/src/intelligence.test.ts`, `sync.test.ts`, `execution.test.ts`, `session-changes.test.ts`).
