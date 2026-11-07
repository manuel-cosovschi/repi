# AC3 audit: Smart Import, routines, history, library/substitutions/equipment, progress/body

Repo `/home/user/repi`, branch `claude/adaptive-coaching-3`. Base is main 08d4a50; the branch head b72a6d1 adds only the master doc. Read-only audit, and the code is the source of truth.
In the paths below, `D` = `packages/domain/src`, `S` = `apps/web/src/server`, `A` = `apps/web/src/app/api`, and `SCH` = `apps/web/src/db/schema.ts`.

---

## 0. TL;DR for the engineer

- **Provenance exists only for the student's imported own routines.** It lives in `own_routine.origin` (jsonb, migration 0049), written once by `saveImportedRoutines`.
  - Coach imports leave only `audit_event` `program.imported` (opId/source/file/counts).
  - Gym imports leave **nothing** (no opId, no audit "imported" marker, only the version `reason` text that a human typed).
- **The client builds `origin`, not the server.** The server only clips and whitelists it (`S/training/own-routines.ts:168-175`). `unknown` = fields with issue kind `missing` at read time (sets and reps only). Unclear fields, evidence line (`source`), notes, section, unit, group and match method (library/ai/manual) are **not persisted**.
- **No link from an executed session back to the own routine.** `startOwnRoutine` creates a throwaway `program(kind='solo')` + locked `program_version(reason='Rutina propia del alumno')` + an ended `program_assignment` + `workout_session`. Neither `own_routine.id` nor `origin.opId` is stored anywhere on that chain. The audit `own_routine.started` has `resourceId = sessionId` and no routineId. `docs/SMART_IMPORT_2.md` claims `set_log (source: "own")`, but that column does not exist.
- **Own routines have no versions.** Edits overwrite `exercises` in place, while `origin` is kept. Origin alignment is **positional** (`origin.exercises[j]` ↔ `exercises[j]`) and breaks after reorder/add/delete. `duplicateOwnRoutine` drops `origin`.
- **No read API exposes `origin`.** `listOwnRoutines` returns only `imported: boolean`. AC3 needs a provenance read service.
- **Progress/body services are deterministic, owner-only, and adult-gated.** Body weight, calories and photos are consumed **only** by `S/progress/*` and the privacy export. No AI path touches them today, and photos must stay that way.
- **History import (`history_entry`) feeds suggestions.** `lastSetByExercise` falls back to imported marks (`S/training/services.ts:645-658`). The progress charts mark these points as `source:"import"`. The AI exercise matching in history import has **no `variantConflict` guard** and a weaker anti-injection prompt than Smart Import.

---

## 1. Domain: Smart Import engine (`D/program-import.ts`, 596 lines)

### 1.1 Types (all exported)

| Type | Line | Shape |
|---|---|---|
| `ImportField` | 15 | `"name"\|"sets"\|"reps"\|"weight"\|"rest"\|"method"\|"line"` |
| `ImportIssue` | 16 | `{ field: ImportField; kind: "missing"\|"unclear"\|"info"; text }` |
| `ImportSetValue` | 17 | `{ reps: string\|null; weightKg: number\|null }` |
| `ImportExercise` | 18-32 | `written` (name as written, without A1), `source` (evidence line ≤160), `section`, `sets\|null`, `reps\|null`, `weightKg`, `perSet: ImportSetValue[]\|null`, `restSec`, `rir`, `rpe`, `tempo`, `note`, `technique`, `group` ("A1"), `groupKind`, `rounds`, `unit: "kg"\|"lb"\|null`, `issues[]` |
| `ImportDay` / `ImportVariant` / `ImportParse` | 33-35 | `ImportParse = { variants: {name, days}[]; notes[]; unread[]; stats:{lines, exercises, prescribed} }` |
| `AiExercise` | 493-497 | raw AI schema row (`set_reps`, `set_weights`, `unit`, `unclear[]`, `source`...) |
| `ImportedMethod` | 569 | `DetectedMethod & { label }` |
| **`ImportOriginExercise`** | 589-593 | `{ written; exerciseId; sets; reps; weightKg; perSet; restSec; rir; rpe; tempo; technique; unknown: ImportField[]; completed: ImportField[]; suggested: ImportField[] }` |
| **`ImportOrigin`** | 594 | `{ kind:"import"; opId; day:number; at: ISO; source:"sheet"\|"text"\|"ai"; file:"text"\|"sheet"\|"image"\|"pdf"; dayName; exercises: ImportOriginExercise[] }` |
| `IMPORT_SOURCES`, `IMPORT_FILES` | 595-596 | const tuples |
| `IMPORT_LIMITS` | 37 | `{ textChars: 400_000, days: 60, exercisesPerDay: 60, variants: 12, lines: 4000 }` |

### 1.2 Functions

- `cleanLine(line)`, line 92: strips WhatsApp prefixes, emoji, markdown and bullets.
- `readPrescription(text, draft, {lb?})`, line 111: reads rest, tempo, RIR/RPE, loads (kg/lb, per side → `unclear`), sets×reps, per-set lists, bare loads, method/group words (`detectMethod`, `detectGroupWord`), and illegible markers. It never fills defaults.
- `parseExerciseLine(line, {lb?})`, line 221. `parseRoutineText(text): ImportParse`, line 272: headers for week/program/day/group/section/circuit, chat lines → `notes`, unparsed → `unread`.
- `finishExercise(e)`, line 360: adds `missing` issues for `sets`/`reps` **only** (rest is not flagged here; the client flags rest as missing in program mode).
- `deterministicEnough(p)`, line 368: exercises > 0, unread ≤ 5% of lines, ≥ 60% prescribed. This decides whether the AI is skipped.
- `parseRoutineSheet(text, {requireHeader?})`, line 466: multi-sheet CSV (`Hoja: X`), header detection in the first 12 rows, "Serie N" columns.
- `fromAiExercise(a: AiExercise): ImportExercise`, line 499: normalises AI output through the same rules. If the evidence line has no digits but sets/reps exist, it adds an `unclear` issue (anti-hallucination, line 541).
- `importedDetail({sets,reps,weightKg,perSet,rir,rpe,tempo})`, line 552: maps reviewed values to an `ExerciseDetail` with `setPlan` (per-set, RIR, RPE) or `tempo`, otherwise null.
- `applyImportedMethod(det, sets, reps, current)`, line 565, and `importedMethod(e)`, line 571.
- `importIssueCount(days)`, line 577.
- `lbToKg`, line 42.

### 1.3 Exercise matching (`D/exercise-match.ts`, 144 lines)

- `variantConflict(written, candidate, strict=false): boolean`, line 84. The families are angle (implicit "plano"), implement (implicit "barra"), position and grip. With `strict`, the candidate may not *add* a variant (used to validate AI proposals).
- `makeExerciseMatcher<T extends {id,name}>(library): (written) => T|null`, line 97. It tries 4 key levels (exact `exerciseKey`, loose, stem, bag-of-words) and then the alias table `ALIASES` (lines 31-64). Duplicate names with different ids → null (does not guess).
- `rankExerciseCandidates(written, library, max=4): T[]`, line 125: Jaccard-like score with a first-word bonus, filtered by `variantConflict`.
- `exerciseKey` is in `D/exercise-catalog.ts:79`. `EXERCISE_CATALOG` is at line 12 and `EXERCISE_GROUPS` at line 6.

### 1.4 Legacy parsers still in use

- `D/routine-import.ts` → `parseRoutineCsv` (D162), and `D/routine-notes.ts` → `parseRoutineNotes`. The only consumer is `components/member/HistoryImport.tsx:95`, which detects that pasted "history" text is really a routine and hands off to routine import.

---

## 2. Server: Smart Import (`S/training/program-import.ts`, 230 lines)

### 2.1 Exports

- `ImportInput = { fileName; kind:"text"|"image"|"pdf"; text?; dataUrl?; sheet? }` (line 16).
- `LibRow = {id,name,group,kind}` (17). `PreviewExercise = ImportExercise & { exerciseId, name, group_, kind, matchedBy:"library"|"ai"|null, alternatives: LibRow[], method }` (18-21).
- `ImportPreview = { source; file; notes; unread; variants:[{name, days:[{name, exercises: PreviewExercise[]}]}] }` (22-25).
- `checkUpload(f)` (36): magic-byte checks for JPEG/PNG/WEBP/GIF/PDF and the text size limit.
- `IMPORT_SYSTEM` (74-92): the transcriber prompt. It contains an explicit **SECURITY** clause: the document is data, embedded instructions are not followed, and text unrelated to the routine is reported in notes.
- `readImport(f, beforeAi)` (120-154):
  1. Deterministic parse first (sheet, then text). If `deterministicEnough`, the AI is skipped.
  2. If AI is off or fails, it falls back to the partial deterministic result with a note.
  3. `beforeAi()` is the **cost hook**: the route applies rate limits before any spend.
  4. `too_large` and `empty` are rethrown.
- `matchLibrary(names, lib, useAi=true): Record<string, Match>` (168-196):
  - deterministic match first;
  - then the AI `emparejar_ejercicios` (fast model, 6 s timeout), whose suggestions are validated with `variantConflict(..., strict=true)`;
  - alternatives come from `rankExerciseCandidates`.
- `buildPreview(read, lib)` (199), `splitLongDays(p, max)` (213).
- `programImportPreview(actorId, orgId, lib, f, beforeAi)` (225): coach/gym preview. Audits `program.import_previewed`. **The caller must pass a library it has already authorised.**

### 2.2 AI call (`readWithAi`, 94-114)

- The document goes inside `<documento>` markers, with markers stripped from the content (line 96) and the file name sanitised (line 95).
- Strict JSON schema `AI_SCHEMA` (62-71), `maxTokens` 16 000, `requireComplete`.
- Too many days or exercises → `too_large` (nothing loaded).
- `aiJson` signature (`S/ai/openai.ts:17`): `{ name, system, parts, schema, maxTokens?, effort?, timeoutMs?, fast?, requireComplete? }`. `aiOn()` checks only `OPENAI_API_KEY`.

### 2.3 Routes and permissions

| Route | File | Auth | Limits |
|---|---|---|---|
| `POST /api/me/routines/import` | `A/me/routines/import/route.ts:12-18` | `sessionUserId()`; library via `myExerciseLibrary` (requires an active relation) | read 60/h; AI: global `routine-import` 30/h plus `routine-import:${me}` 20/day |
| `POST /api/me/routines/import/save` | `A/me/routines/import/save/route.ts:23-28` | session user; zod `Origin` schema (13-17) | 30/h |
| `POST /api/coach/[orgId]/programs/import` | `A/coach/[orgId]/programs/import/route.ts:13-20` | `tr.listLibrary` → `requireCoach` (coach_owner, active, kind coach) | AI 30/h global plus 30/day per user |
| `POST /api/coach/[orgId]/programs` `{doc, imported}` | `A/coach/[orgId]/programs/route.ts:12-18` | `createTemplate` → `requireCoach` | none |
| `POST /api/gym/[orgId]/programs/import` | `A/gym/[orgId]/programs/import/route.ts:14-21` | `gym.gymLibrary` → `need(ctx,"program.edit")` | same as coach |

**Cost-control caveat:** `limit(bucket)` (`S/access/http.ts:21-25`) appends the client **IP** to the key. "Per-person" quotas are therefore really per person and IP, and changing IP resets them. There is no token or spend budget, and no circuit breaker. AC3 must add real per-user and per-org budgets around `aiJson`.

---

## 3. Server: own routines (`S/training/own-routines.ts`, 220 lines)

### 3.1 Table `own_routine` (`SCH:376-390`)

- `id`, `user_id` (FK cascade), `name`.
- `exercises jsonb`: `{exerciseId, sets, reps, weightKg, restSec, note, detail?}[]`.
- `created_at`, `updated_at`, `last_used_at`.
- **`origin jsonb $type<ImportOrigin>`** (0049, `apps/web/drizzle/0049_own_routine_origin.sql`).
- Partial unique index `own_routine_import_op_unique (user_id, origin->>'opId', origin->>'day') WHERE origin ? 'opId'`.
- There is no `org_id`: routines are purely personal. The comment at `SCH:373-374` says they are not shared with the coach or gym.

### 3.2 Exports

| Function | Line | Notes |
|---|---|---|
| `OWN_ROUTINES_MAX = 30`, `OWN_ROUTINE_EXERCISES_MAX = 12` | 14-15 | |
| `type OwnRoutineEx` | 19 | `{exerciseId, sets, reps, weightKg, restSec, note, detail?}` |
| `relationOrg(userId)` (private) | 24 | **Requires an active coach or gym relation** (`myActive`), otherwise 409 `no_relation`. A user with no relation cannot save, start or import own routines. |
| `createMyExercise(userId, {name, group, kind})` | 31 | → `createMemberExercise` |
| `myExerciseLibrary(userId)` | 36 | `visibleIn(orgId, userId)`: catalog, active org, own exercises |
| `ownDetail(e)` | 64 | `validateDetail` + 1..10 main sets |
| `listOwnRoutines(userId)` | 82-100 | includes `next` rotation by `lastUsedAt`, `imported: r.origin?.kind==="import"` and `prev` from `lastSetByExercise`. **`origin` is not returned.** |
| `saveOwnRoutine(userId, {id?, name, exercises})` | 102-123 | update in place (origin untouched) or insert (cap 30); library check; `assertCircuits`; audit `own_routine.created/updated` |
| `duplicateOwnRoutine(userId, id)` | 126 | **drops origin** |
| `deleteOwnRoutine(userId, id)` | 132 | hard delete, audit |
| `startOwnRoutine(userId, routineId, sessionId, now)` | 140-146 | → `startSoloRoutine(..., source:"own")`, sets `lastUsedAt`. **Does not record routineId.** |
| `previewRoutineImport(userId, f, beforeAi)` | 153-160 | adds `limits.free`; audit `own_routine.import_previewed` |
| `cleanOrigin(o, exerciseId)` (private) | 168-175 | clips strings, numbers or null; `fields()` whitelists `FIELDS` (line 165), at most 8 |
| `saveImportedRoutines(userId, {opId, source, file, routines:[{name, exercises, origin[]}]})` | 182-220 | see below |

`saveImportedRoutines` in detail:
1. Validates the opId regex `^[A-Za-z0-9_-]{8,64}$`.
2. Runs `clean` on each day, checks the library and `assertCircuits`.
3. Opens a transaction and takes `pg_advisory_xact_lock(hashtext('own-routine-import:'+userId))`.
4. Replay check: `origin->>'opId' = opId` → `{ids, replay:true}`.
5. Capacity check: all or nothing, else 409 `capacity`.
6. Inserts, with `createdAt = at + i` ms to keep the day order.
7. Audit `own_routine.imported` meta `{opId, routines, exercises, source, file, unknown:count}`.

### 3.3 How `origin` is produced (client: `apps/web/src/components/shared/ProgramImport.tsx`)

- `toREx` (45-61) snapshots `orig = {written, sets, reps, weightKg, perSet, restSec, rir, rpe, tempo, technique, unknown}` from the **preview values**. `unknown` = issues of kind `missing`, which in practice means `sets`/`reps` from `finishExercise`.
- `fill(e, f)` (229): **any** user edit of a field, an "Está bien" on an unclear issue (324), or picking a library exercise (384, `"name"`) adds `f` to `filled` and removes it from `suggested`.
- `suggestAll` (241-249): an explicit tap fills `sets=3` / `reps="10"` (and `rest=90` in program mode) and marks them in `suggested`. `SUGGEST` is at line 43.
- `toRoutines` (108-118) sends `origin = {...orig, exerciseId, completed: filled, suggested}`.
- `toProgramDoc` (120-130) for coach and gym builds a `ProgramDoc` with **no origin**.
- The review draft lives in `localStorage` key `repi:import:<scope>` with a 3-day TTL (133-141).

**Semantics caveat:** `completed` mixes "filled a missing value", "changed a read value", "confirmed an unclear value" and "picked an exercise". To tell them apart, diff `origin.exercises[j]` against `own_routine.exercises[j]` (only valid before any later edit).

---

## 4. Answering the AC3 provenance questions (current state)

| Question | Own routine (student) | Coach program | Gym member program |
|---|---|---|---|
| What the original document said | `own_routine.origin.exercises[j]` (values, `written`, `perSet`, `technique`). **No evidence line, note, section, group or unit.** | **Not stored.** Only `audit_event(action='program.imported', meta{opId, source, file, days, exercises})` (`S/training/services.ts:146-147`). The imported doc *is* version 1 (`program_version.number=1`) after the coach's review edits. | **Nothing.** The preview audit is `program.import_previewed`. The save goes through `saveMemberProgram` with a human `reason` (`S/gym/services.ts:691-735`). |
| What was unknown | `origin.exercises[j].unknown` (sets/reps only) | — | — |
| What the user completed | `origin.exercises[j].completed` (ambiguous, see §3.3) | — | — |
| What was accepted as a suggestion | `origin.exercises[j].suggested` (`sets`/`reps`, plus `rest` in program mode, which does not apply to routines) | — | — |
| Which program is current | The routine row itself (no versions, edited in place, `updated_at`). The "next" day comes from `listOwnRoutines.next`. | Active `program_assignment` (`status='active'`) → `program.current_version_id` (`myActive`/`myTraining`, `S/training/services.ts:531,660`). `trainingStamp` (550) is a change marker. | Same, through `gym_member_id`. `memberProgram` (`S/gym/services.ts:660`) lists the last 10 revisions with author and reason. |
| What was actually executed | `workout_session` whose `version_id` → `program_version(reason='Rutina propia del alumno')` → `program.kind='solo'`; `day_name` = routine name at start; `set_log`; `session_exercise_change`; `training_target`. **No FK or meta to `own_routine.id` or `opId`.** The audit `own_routine.started` (`services.ts:898`) holds sessionId only. | `workout_session.version_id` (frozen, locked) + `set_log` (+ `training_correction`, `voided_at`) | same |

### Recommended extension points (additive)

- Add `own_routine_id` (nullable, FK `set null`) to `program` for `kind='solo'`, or at least `meta.routineId` / `opId` to the `own_routine.started` audit. This links an executed session back to the routine and its origin.
- Persist origin evidence: `source` line, `note`, `unit`, unclear fields as their own list, `matchedBy`, and **stable per-exercise keys** instead of positional alignment. For example, store `originIndex` in each `own_routine.exercises[]` element so it survives reorder and edit.
- Add a coach/gym import provenance table, e.g. `program_import(id, org_id, program_id, version_id, op_id unique per org, source, file, origin jsonb, created_by)`. This replaces the audit-log lookup that `createTemplate` uses for idempotency (`services.ts:136-140`, which scans `audit_event` by org/action/meta without a dedicated index) and gives gym imports idempotency and provenance.
- Add a read service such as `routineProvenance(userId, routineId)` that returns `{original, current, diff, unknown, suggested, completed, executedSessions}`.
- Handle duplicates: either carry `origin` with `{copiedFrom}` or document the loss explicitly.

---

## 5. Solo routine (`S/training/solo-routine.ts`, 134 lines) and `startSoloRoutine`

### 5.1 `soloRoutine(userId, now, message?)`, line 61

- Applies only when there is no `ready` program (409 `has_program`).
- Rules fallback: one exercise per `GROUPS` (line 25), count based on wishes `minutes`, reps and rest based on goal.
- AI (`rutina_sin_programa`, fast model, 900 tokens, 15 s):
  - **Context sent:** short codes `x1..` for library items, last marks, today's check-in (energy, sleep, mood), wishes (goal, minutes, likes, avoid) and the raw user `message` (≤400 chars, an injection surface).
  - **Output is sanitised:** codes are mapped back to the library only (no free exercise), sets are clamped to 1..5, loads go through `checkLoad({source:"ai", blockIncrease:true})`, and at most one method is allowed via `aiMethodDetail` (54), never on heavy barbell lifts or when tired.
- Audit `adaptive.solo_routine` meta `{byRules, usesAI, model}`.
- Route `A/me/solo/routine/route.ts` limits 20/h and 60/day.

### 5.2 `startSoloRoutine(userId, {id, dayName, source?:"repi"|"own", exercises}, now)` (`S/training/services.ts:848-902`)

- Requires `myActive`, otherwise 409.
- Validates `validateDetail` and circuits, checks the library (`visibleIn(act.orgId, userId)`), and is idempotent by session id.
- At most one open session (409 `open_session`).
- Creates `program(kind:'solo', coachClientId|gymMemberId = active relation)`, `program_version(locked, reason)`, `program_day`, `program_exercise` and an **ended** `program_assignment`.
- First-time own weight goes into `detail` via `applyLoad`/`withFirstLoad`, only if the exercise was never logged. For a REPI routine the suggested load goes into `note` ("Sugerido: X kg").
- **The coach or gym can see these sessions** through `workout_session.coach_client_id/gym_member_id`, but they cannot see the routine definition or its origin.

---

## 6. Program versions (`S/training/services.ts`)

- Tables:
  - `program` (`SCH:345`): `kind` is `template|client_copy|member_copy|solo`; also `source_program_id`, `source_version_id`, `current_version_id`, `archived_at`.
  - `program_version` (`SCH:361`): `number`, `name`, `weeks`, `note`, `locked`, `reason`, `created_by`.
  - `program_day` (392), `program_exercise` (399: `name` snapshot, `sets`, `reps`, `rir`, `rest_sec`, `note`, `detail jsonb`).
  - `program_assignment` (415): `coach_client_id` XOR `gym_member_id`, one active per relation.
- `readVersion(versionId, tx)` (66), `plain(doc)` (82), `writeDays` (84), `rewriteDays` (98: edit in place, keeping ids by position), `newVersion(tx, programId, number, doc, actorId, reason)` (117: sets `current_version_id`).
- `createTemplate(actorId, orgId, doc, imported?)` (130-150): uses `requireCoach`; idempotent by `imported.opId` via advisory lock plus an audit lookup.
- `saveProgram` (198) → `writeProgramDoc` (216): if `sameDoc`, no-op. If the version is locked → new version (`program.versioned` audit), otherwise edit in place.
- `assignProgram` (260): locks the source version; each client gets a `client_copy` v1; the previous assignment ends.
- `saveMemberProgram` (`S/gym/services.ts:691`): every save locks the current version and creates a new one with `reason` (≥ 3 chars required); needs `program.edit` and scope.
- `previousVersion(userId)` (`services.ts:1422`): the previous version of the current program (F-CL-14). `myTraining().program.update` gives `{kind:"new"|"updated", author, at, reason, hasPrevious}` (`services.ts:713-718`), which the AC3 "coach updated your routine" event can reuse.
- Version change mid-session: `upgradeSession` (`services.ts:1259`) moves `set_log`/`session_exercise_change`/`set_skip` through `matchProgramExercises` (`D/session-changes.ts:47`); audit `session.upgraded`.
- Locking: `startSession` locks `day.versionId` (`services.ts:828`), so a version that has been executed is immutable.

---

## 7. History import (pre-REPI training) (D132/D182)

### 7.1 Tables

- `history_import` (`SCH:630-644`): `status draft|confirmed|discarded`, `source csv|notes|ai`, `file_name`, `parsed jsonb` (preview: normalised sets, matches, notes, hash, phase, parts), `sessions`, `sets`, `from_day`, `to_day`, `model`, `confirmed_at`.
- `history_entry` (`SCH:646-658`): `import_id` FK cascade, `user_id`, `day` (AAAA-MM-DD), `exercise_id` (FK **set null**), `exercise_name`, `set_index`, `weight_kg` text, `reps`, `seconds`.
- **No RPE/RIR, no notes, no per-set provenance.** The original file is not stored.

### 7.2 Domain (`D/history-import.ts`)

- Types: `ImportSet = {day, exercise, weightKg, reps, seconds}`, `NormalizedSet = ImportSet & {setIndex}`, `ImportSummary`.
- Limits: `IMPORT_MAX_SETS=100_000`, `IMPORT_MAX_TEXT_LENGTH=1_000_000`, `IMPORT_MIN_DAY="1990-01-01"`.
- Functions:
  - `splitHistoryText` (21), `parseDay` (94), `parseHistoryCsv` (110);
  - `normalizeImport(sets, today)` (131: ranges, weight rounded to 0.25, sorting, setIndex);
  - `summarize` (154), `exerciseEvolution` (160: first, best, last per exercise);
  - `importKey` (181), `importCanonical` (183), `importOverlap(next, existing)` (190: multiset overlap, `keep` indices).
- `D/history-notes.ts`: `parseHistoryNotes(text, today)` (156) is the fast path for explicit syntax; `partitionHistoryNotes` (around 263). `D/history-read-plan.ts`: `buildHistoryReadParts` (5).

### 7.3 Server

`S/training/history-import.ts`:
- `matchExercises(names, lib)` (49): deterministic match, then AI. **No `variantConflict` check on the AI result** (contrast with program-import.ts:186), and the prompt lacks the "names are data" clause.
- `libraryFor(userId)` (34): includes orgs of **all** `coach_client`/`gym_member` rows regardless of status, so ended relations still count.
- `previewHistoryImport` (75) → `prepareHistoryPreview` (87): stores the draft, computes the fingerprint `hash`, and returns `duplicateOf` and `overlap`.
- `confirmHistoryImport(userId, id, mode?: "all"|"new_only")` (144):
  - advisory lock;
  - same hash already confirmed → mark `discarded`;
  - overlap without a mode → 409;
  - claim to `confirmed`, then insert entries in batches of 500;
  - audits `history_import.confirmed/duplicate`.
- `removeHistoryImport` (183): deletes the entries and marks the import discarded.
- `myHistoryImports` (195): the "Antes de REPI" view (imports plus evolution, top 40).
- `importedLastSets(userId, exerciseIds)` (206): latest imported mark per exercise.

Other files:
- `S/training/history-import-read.ts`:
  - `readHistoryInput` (239): CSV, then notes, then partitioned notes with AI per segment and date-integrity checks, then full AI.
  - The AI `SYSTEM` prompt (160) has **no explicit "document is data / ignore instructions" clause** and no delimiters.
  - `readPart` (171) enforces that dated days cannot disappear (`numericDatedDays`).
- `S/training/history-import-job.ts`: resumable multi-part job (≤1000 parts of 16 000 chars), part hashes, `finishHistoryImportJob` → `prepareHistoryPreview`.

Routes: `A/me/history-import/[[...path]]`, `A/me/history-import-job/[[...path]]`.

### 7.4 Where imported history flows

- `lastSetByExercise` (`services.ts:645-658`): used for starting weights in own and solo routines, the `prev` hint in alternatives and the routine list.
- `myExerciseProgress` / `myProgressExercises` (`S/progress/exercises.ts`): points marked `source:"import"`, and they participate in record and first-mark detection.
- **Not** in `lastTimeByExercise` (TI progression basis, `services.ts:565`). It reads `set_log` only.

---

## 8. Exercise library, approved substitutions, equipment

### 8.1 Library (`S/training/library.ts`)

- Table `exercise` (`SCH:333-342`): `org_id` (null = catalog), `name`, `muscle_group`, `kind load_reps|bodyweight|time`, `owner_user_id` (a student's own, D163).
- `catalogOnly()` (12), `visibleIn(orgId, userId?)` (17) = catalog ∪ org ∪ (owner = user). **This is the isolation primitive.** Without `userId`, students' exercises are never visible to staff.
- `ensureExerciseCatalog()` (24): idempotent seed, once per process.
- `createOwnExercise(actorId, orgId, p)` (42): the caller authorises; dedups by `exerciseKey`.
- `createMemberExercise(userId, orgId, p)` (64): at most 100 per user.
- Coach: `listLibrary` / `coachCreateExercise` (`services.ts:49,57`, `requireCoach`). Gym: `gymLibrary` / `gymCreateExercise` (`S/gym/services.ts:744`, `program.edit`).

### 8.2 Approved substitutions (`S/training/substitutions.ts`)

- Table `exercise_substitution` (`SCH:674-682`): `org_id`, `exercise_id`, `substitute_exercise_id`, `note`, `created_by`; unique on (org, ex, sub).
- `requireAuthor` (13): coach org → `requireCoach`; gym → `need(ctx,"program.edit")`.
- `listSubstitutions`, `addSubstitution` (`canSubstitute` = same `kind`, different id; `APPROVED_SUBS_MAX=8` per exercise), `removeSubstitution`, all audited (`substitution.add/remove`).
- Consumers:
  - `sessionAlternatives(userId, sessionId, peId)` (`services.ts:1087`) and `dayAlternatives(userId, dayId, n)` (1110) use `rankAlternatives` + `withApproved` (`D/session-changes.ts:20,31`); approved ones come first.
  - `setExerciseChange(userId, sessionId, {programExerciseId, change})` (1146) writes `session_exercise_change(kind skip|substitute, reason busy|no_equipment|discomfort|no_time|other)`. It is idempotent upsert by (session, pe), needs the session open, and audits `session.exercise_skip/substitute/restored`.
  - **This is the existing "apply session substitution" action AC3 should call.**
- **Gap:** alternatives ignore gym equipment, so AC3 "verify equipment availability" has no data path. `gym_equipment_exercise` only feeds load ladders.

### 8.3 Equipment (D195)

- Tables: `gym_equipment` (`SCH:113-137`: per location, category, unit, increment, per_side, min/max, `loads[]`, archived, revision) and `gym_equipment_exercise` (`SCH:139-143`).
- `S/gym/equipment.ts`:
  - `listEquipment`, `equipmentLibrary`, `create/update/archiveEquipment` (`equipment.manage` to write, `program.edit` to read; other location → 404);
  - `laddersForMember(gymMemberId, exerciseIds)` (136): internal, no actor check, returns `Map<exerciseId, LoadLadder>`; two different machines for one exercise → unknown.
- Domain `D/equipment.ts`: `equipmentLadder` (69), `resolveLadder` (86: priority plan > gym > unknown), `fitTargetsToLoads` (106), `nearLoads` (132).
- Consumers: `S/training/intelligence.ts:177,245` and `services.ts:914`. Gym members only; coach clients and solo users have no equipment model.

---

## 9. Progress and body (PP1, D199-D203)

All routes are in `A/me/progress/[[...path]]/route.ts`. They use `sessionUserId()` with no user parameter, are gated by features `progress`, `body_weight`, `calories` and `progress_photos` (`apps/web/src/lib/features.ts:12-15`), and writes are limited to 40/min.

### 9.1 Exercise charts (`S/progress/exercises.ts`)

- `type ProgressPoint` (28-33):
  - identity: `{day, at, source:"session"|"import", sessionId, dayName}`;
  - volume: `sets`, `reps`, `volumeKg`, `topKg`, `repsAtTop`;
  - strength: `e1rm`, `best:{weightKg,reps}`;
  - non-load metrics: `maxReps`, `maxSec`;
  - markers: `record`, `first`.
- `myProgressExercises(userId, {q, limit, offset})` (65): exercises with completed, non-voided sets, plus import-only ones.
- `myExerciseProgress(userId, exerciseId, range, now)` (87-137):
  - reads at most `EXERCISE_SET_CAP=5000` session sets plus imports;
  - flags come from `timedPeIds` (warmup, timed, rounds, stage);
  - the metric is `load|reps|time` (`metricOf`, 56);
  - records are computed against **all** history (first point = `first`, not a record);
  - returns `{exercise, metric, range, from, points, records, truncated, totals, best}`.
- `myProgressSummary(userId, range, now)` (140-176):
  - `totals` = `{sessions, sets(main), reps, volumeKg, activeMinutes, exercises}`;
  - `weeks[]` = 12 weeks of frequency;
  - `marks` = top 8 exercises.
- Rules:
  - e1RM is Epley, only for 1-12 reps with load > 0 (`D/training.ts:78` `epley1rm`, 91 `bestE1rm`, 105 `detectPR`);
  - volume excludes warmup, timed and AMRAP rounds; drop stages count;
  - voided sets and sessions are excluded (`status='completed'`, `voided_at IS NULL`).
- Range helper: `rangeStart` (`D/progress.ts:12`), `PROGRESS_RANGES` (7).
- **This is a deterministic, explainable source for AC3 "¿Estoy progresando?".** Points carry sessionIds and dates for the "por qué te digo esto" explanation.
- **Gaps:**
  - There is no per-muscle-group volume service: `exercise.muscle_group` is available, but there is no aggregation.
  - There is no "comparable sessions" selector (same rep range) or trend/stagnation classifier here. TI has trend logic in `intelligence.ts`, which another audit covers.

### 9.2 Body weight and goal (`S/progress/body.ts`)

- Tables:
  - `body_weight_entry` (`SCH:1672-1685`): `measured_on` (unique per user and day), `weight_g` int (20 000-400 000), `source` (`'manual'` only).
  - `body_goal` (`SCH:1689-1703`): PK `user_id`, `start_source first_entry|manual`, `start_weight_g`, `start_on`, `target_weight_g`, `target_on`, `revision`.
- Eligibility:
  - `bodyEligibility(userId)` (19) → `ageEligibility(birthDate)` (`D/access.ts:66`) returns `adult|minor|unknown`;
  - `requireAdult(userId, what)` (25) throws 403 `minor_restricted` or `age_required`.
- Service functions:
  - `myBody(userId, range)` (43): returns `{available:false, reason}` for non-adults; otherwise `{entries, summary: weightSummary, current, goal, start{source}, progress: bodyGoalProgress}`.
  - `saveWeight` (64: upsert per day), `updateWeight` (77), `deleteWeight` (91);
  - `setGoal` (99: revision + 1), `clearGoal` (110);
  - `weightsUpTo` (117).
- Domain helpers: `bodyGoalProgress` (`D/progress.ts:61`), `bodyGoalText` (80), `weightSummary` (93), `weightAt` (100), `maintainBandG` (48).
- Audit never contains weight values.

### 9.3 Estimated calories (`S/progress/calories.ts`)

- `sessionCalories(userId, sessionId)` (137): computed on read, never stored.
- Inputs: the body weight from that day or up to 60 days before (`weightAt`), `activeMs`, cardio seconds from timed sets in group "Cardio", and RPE.
- `estimateCalories` (`D/progress.ts:128`) returns a range from MET × weight × time, or a reason when it cannot estimate (`CALORIE_REASON`, 142). Minors and unknown age get no estimate.

### 9.4 Private photos (`S/progress/photos.ts`) — must NOT go to AI

- Table `progress_photo` (`SCH:1708-1721`): `media_id` unique FK → `media_object(purpose='progress_photo')`, `taken_on`, `pose front|side|back|other`, `width`, `height`.
- Functions:
  - `uploadProgressPhoto` (42: adult only; magic bytes; EXIF/GPS stripped; per-user, per-day and global storage budgets);
  - `myProgressPhotos` (94), `myPhotoFile` (103), `updateProgressPhoto` (111), `deleteProgressPhoto` (125).
- `followup/services.ts:326` denies `progress_photo` media to anyone but the owner.
- **Verified: no AI module imports `progressPhoto`, `bodyWeightEntry`, `bodyGoal` or `weightsUpTo`.** Consumers are only `S/progress/*` and `S/privacy/services.ts:47-49` (export).
- AC3 context builder must:
  - never include photos;
  - include body weight and goal **only** for adult owners, with a feature flag and an explicit authorisation flag;
  - never share them with coach or gym (the matrix in `docs/PERSONAL_PROGRESS_BODY_TRACKING_1.md` §11).

### 9.5 Other

- Training goals (`S/training/goals.ts`, `D/goals.ts`) exist (`GOAL_KINDS`, `goalProgress`). They are out of scope here but relevant to the context engine.

---

## 10. Gaps vs AC3 spec (this area)

1. **Provenance coverage:**
   - Only student imports have `origin`. Coach imports have audit meta only; gym imports have no provenance or idempotency at all.
   - Spec items "what the document said / unknown / completed / suggested" cannot be answered for programs assigned by staff.
2. **Execution → routine link is missing.** "Qué se ejecutó realmente" for an imported routine can only be inferred heuristically (dayName equals routine name, `program.kind='solo'`, version reason). Renaming the routine breaks it.
3. **Origin fidelity:**
   - No evidence line, `unclear` list, note, unit or match method is stored.
   - `completed` is ambiguous.
   - Positional alignment is fragile after edits, and duplicating a routine loses the origin.
   - The value is supplied by the client (acceptable as the user's own data, but not server-derived).
   - Spec: "La IA nunca debe convertir un dato desconocido en una instrucción indicada por un entrenador." To enforce this, the context engine must label `suggested`/`unknown` fields as `declared_by_user` / `suggested_default`, never `coach`.
4. **No provenance or read API:** `listOwnRoutines` hides `origin`.
5. **Own-routine versioning:** none. AC3 adaptation proposals ("Adaptación: crear una propuesta nueva y explícita") need a draft mechanism. A new own routine or a solo program would work; editing the imported one must not overwrite `origin`.
6. **Own routines require an active relation** (`relationOrg`). The spec's relation type "rutina propia" cannot exist without a coach or gym.
7. **Equipment-aware substitution:** absent. Equipment is per gym location and only used for load ladders, and there is no equipment profile for coach or solo users.
8. **Per-muscle volume, comparable-session selection and stagnation detection:** not in the progress services (check `intelligence.ts`).
9. **Prompt-injection hardening is uneven:**
   - Smart Import is good (markers, security clause, strict schema, variant validation).
   - History import's AI prompt has no data/instruction separation, and its `matchExercises` accepts AI matches without `variantConflict`.
   - `soloRoutine` passes the raw user `message`, although its output is fully validated.
10. **AI cost controls:**
    - Only IP-keyed rate limits plus the `beforeAi` hook. No per-user/org token budgets, circuit breaker or spend telemetry.
    - `aiJson` has no usage accounting surfaced here.
    - The deterministic fallback exists for import (partial parse), solo routine (rules) and matching (alternatives).
11. **Privacy export gaps:** `exportMyData` (`S/privacy/services.ts:15-57`) does **not** include `own_routine` (with `origin`), `history_import`/`history_entry`, or student-created exercises. AC3 memory export and deletion should cover these and any new tables.
12. **History import `libraryFor`** includes exercises from orgs of ended relations (status not filtered). This is a minor isolation inconsistency compared with `visibleIn(activeOrg)`.

---

## 11. Risks

- **Positional origin drift.** After the user edits an imported routine, `origin.exercises[j]` may describe a different exercise than `exercises[j]`. An AC3 explanation could cite the wrong "original" value. Match by `exerciseId` and fall back to "unknown alignment".
- **Mislabeling suggested values.** Suggested defaults (3×10, 90 s) end up in `own_routine.exercises` and in the solo `program_exercise` used at execution, which carries no flag. Any AC3 reasoning from `program_exercise` alone would treat them as prescribed. Always join to `origin.suggested`.
- **Solo sessions are visible to staff.** They are `workout_session` rows tied to the coach or gym relation (`coach_client_id`/`gym_member_id`). Coach-facing AC3 features will show own-routine executions, but not the routine or origin. That is consistent with D153, but the AC3 collaboration views must respect it.
- **Imported history influences suggestions and records.** It feeds starting-weight suggestions (`lastSetByExercise`) and the record/first-mark computation, and a wrong AI match in history import (no variant guard) propagates into both.
- **Audit-log based idempotency** for coach imports scans `audit_event` filtered by org/action/meta, with no index on meta. It works today; a dedicated table would be safer.
- **Quotas keyed by IP** make per-user AI caps bypassable by changing network.
- **Body data must stay off AI.** Body weight and goals are sensitive and adult-gated, and photos are hard-blocked from everyone except the owner. Any AC3 context or memory snapshot that serialises the "user state" must exclude photos entirely, exclude body data for minors or unknown age, and never leak it into coach or gym or notifications.
- **`laddersForMember` has no actor check** (internal). Do not expose it directly through an AC3 action without wrapping it in permission checks.

---

## 12. Key reusable entry points for the Intelligence Core

| Need | Call |
|---|---|
| Current program + version + next day + update info | `myTraining(userId)` (`S/training/services.ts:660`) |
| Active relation / all relations | `myActive`, `myRelations` (531, 507) |
| Last time per exercise (TI basis) | `lastTimeByExercise` (565) |
| Last mark incl. imported | `lastSetByExercise` (645) |
| Safety signals | `trainingSignals` (595) |
| Own routines | `listOwnRoutines`; raw `own_routine.origin` via DB |
| Imported history summary | `myHistoryImports`, `importedLastSets` |
| Exercise progress / e1RM / records | `myExerciseProgress`, `myProgressSummary`, `myProgressExercises` |
| Body (adult only) | `myBody`, `bodyEligibility`, `requireAdult` |
| Calories | `sessionCalories` |
| Alternatives / apply substitution | `sessionAlternatives`, `dayAlternatives`, `setExerciseChange` |
| Approved subs (staff) | `listSubstitutions` / `addSubstitution` |
| Equipment ladders (gym members) | `laddersForMember` |
| Previous version diff | `previousVersion` |
| Import read (deterministic + AI) | `readImport`, `buildPreview`, `matchLibrary` |
| Audit | `audit(tx, {actorUserId, orgId, action, resourceType, resourceId, meta})` (`S/access/util.ts:31`) |
