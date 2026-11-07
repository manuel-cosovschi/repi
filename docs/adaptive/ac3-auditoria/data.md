# AC3 audit — Data model, privacy & migrations

Branch `claude/adaptive-coaching-3` (HEAD b72a6d1 = main 08d4a50 + AC3 master prompt doc). Read-only audit; the code is the source of truth.
All paths are relative to `/home/user/repi`. `S:` = `apps/web/src/db/schema.ts`.

---

## 0. TL;DR for the engineer

- **One schema file**: `apps/web/src/db/schema.ts` (1754 lines, **110 `pgTable`s**). Drizzle 0.45.4 + postgres-js 3.4.9. Client: `apps/web/src/db/index.ts` (`db`, `sqlClient`, `schema`, `type DB`; `prepare:false` on pooler 6543).
- **Migrations**: `apps/web/drizzle/0000_init.sql … 0049_own_routine_origin.sql` (journal `drizzle/meta/_journal.json`, 50 entries, last `when` = 1794021005579). **Production has all 50 applied** (docs/continuidad/PROXIMA_SESION.md:36). **Next AC3 migration = `0050_<name>.sql`.**
- **Hosted (prod) migrations are NOT run with `pnpm db:migrate`**: a hand-written `apps/web/scripts/operations/hosted-00NN.sql` is executed in one transaction as `postgres` with a temporary `SET ROLE repi_app`, plus `scripts/rollback/00NN_*.down.sql` and an ensayo `scripts/operations/verify-00NN.sh` on a throwaway DB. Prereq: green «Respaldo» workflow (docs/RESPALDOS.md §«Antes de cada migración productiva»).
- **No AC3 tables exist**: no memory, no AI chat, no proactive event log, no action ledger, no autonomy settings, no AI usage/budget ledger, no quiet hours/timezone, no per-category notification opt-in.
- **RLS is ON for every table but with zero policies**; the app connects as the table owner `repi_app` and bypasses RLS. **Tenant isolation is 100 % app-level** (service functions). `repi_backup` is read-only + BYPASSRLS.
- **Export** = `exportMyData` in `apps/web/src/server/privacy/services.ts:16` (manual list of tables, misses many existing ones). **Deletion is manual SQL** (`delete from "user"` → cascades), documented in `docs/PRIVACIDAD_OPERACION.md`; the only automated user deletion is the demo sandbox purge. New AC3 tables must `onDelete: "cascade"` from `user.id` and be added to `exportMyData`.
- **Retention jobs**: daily `GET /api/cron/purge-media` (media, upload intents, rate limits, site events >400 d); every-minute `GET /api/cron/notifications` (demo sandboxes, outbox, sweeps). Add AC3 TTL purges to one of these.

---

## 1. Infrastructure: schema, migrations, DB roles, RLS

### 1.1 Files
| What | Path |
|---|---|
| Drizzle config | `apps/web/drizzle.config.ts` (schema `./src/db/schema.ts`, out `./drizzle`, dialect postgresql) |
| Schema | `apps/web/src/db/schema.ts` |
| DB client | `apps/web/src/db/index.ts` (`db = drizzle(sqlClient, { schema })`, `max: VERCEL ? 3 : 10`, `prepare: !pooled`) |
| Local migrator | `apps/web/scripts/migrate.ts` → `runMigrations(url)`: drizzle `migrate()` then `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on every `public` table without RLS (lines 7–15) |
| SQL migrations | `apps/web/drizzle/00NN_<snake_name>.sql` (statement separator `--> statement-breakpoint`), `drizzle/meta/00NN_snapshot.json`, `drizzle/meta/_journal.json` |
| Hosted apply scripts | `apps/web/scripts/operations/hosted-0040-0041.sql`, `hosted-0042.sql` … `hosted-0049.sql` |
| Verify (ensayo) scripts | `apps/web/scripts/operations/verify-0043.sh` … `verify-0049.sh` |
| Rollbacks | `apps/web/scripts/rollback/0041_set_skip_interval.down.sql` … `0049_own_routine_origin.down.sql` |
| Backup role | `apps/web/scripts/operations/hosted-backup-role.sql` |
| Backup/restore | `apps/web/scripts/operations/backup.ts`, `backup-ci.sh`, `restore.ts`, `restore-from-release.sh`, `guards.ts`, `retention.ts` (retention of **backup releases**, not data) |
| DB test guard | `apps/web/tests/global-setup.ts` (drops `public` and `drizzle` schemas!) + `apps/web/scripts/lib/database-target.ts` (`assertTestDatabaseTarget` requires `repi_test` on localhost and ≠ `DATABASE_URL`; `assertLocalDatabaseIdentity` re-checks via `current_database()` + `inet_server_addr()`) |
| package scripts | `apps/web/package.json`: `db:generate` (drizzle-kit generate), `db:migrate` (tsx scripts/migrate.ts), `test:guards`, `ops:backup`, `ops:restore`, `ops:retention` |

### 1.2 Conventions in schema.ts
- Helpers `S:7-9`: `ts(name)` = timestamptz; `now(name)` = timestamptz not null default now(); `id()` = `text("id").primaryKey().default(sql\`gen_random_uuid()::text\`)`. **All PKs are text UUIDs.** Client-generated ids for idempotent offline writes: `workout_session.id`, `set_log.id`, `message.id`.
- Dates as `text` "AAAA-MM-DD" in AR local time (`checkin.date`, `program_assignment.starts_on`, `body_weight_entry.measured_on`…). Timezone is fixed: `TZ = "America/Argentina/Buenos_Aires"` (`packages/domain/src/training.ts:7`, `localDate(d, tz=TZ)` :135). **No per-user timezone column anywhere.**
- Decimals as exact text (`set_log.weight_kg`, `training_target.weight_kg`) or integer grams (`body_weight_entry.weight_g`).
- `text(..., { enum: [...] })` is **TypeScript-only**; Postgres has no CHECK unless an explicit `check()` is declared. Explicit CHECKs exist only on: `gym_equipment` (S:135-136), `program_assignment` one-relation (S:428), `training_correction.action` (S:518), `training_proposal` one-relation (S:607), `user_pref.theme` (S:966), `body_weight_entry` (S:1682-1684), `body_goal` (S:1700-1702), `progress_photo` (S:1719-1720), `product_announcement` (S:1744-1746). So adding a new enum value (e.g. a new `notification_outbox.kind` or `audit_event.action`) is code-only, no migration.
- Idempotency precedents: unique `(user_id, request_id)` on `training_correction` (S:516); `client_key` partial unique on `gym_task` (S:1057); `dedupe_key` unique on `notification_outbox` (S:1576) and `(contract_id, dedupe_key)` on `contract_notice` (S:1536); `(user_id, origin->>'opId', origin->>'day')` partial unique on `own_routine` (S:389).
- Append-only precedents: `training_correction` (by convention, S:498-519); `gym_task_event` has a DB trigger `gym_task_event_immutable()` + `gym_task_event_no_update` (only `drizzle/0025_connect.sql:37-49`, the only trigger in the DB).
- Versioning precedents: `training_target.seq` + `superseded_at` + partial unique "one current" (S:556, 578-581); `algo_version` text on `training_target`/`training_proposal`; `revision` int on `workout_session`, `set_log`, `gym_equipment`, `body_goal`, `product_announcement`.

### 1.3 How a hosted migration is applied (pattern to copy for 0050)
Example `apps/web/scripts/operations/hosted-0049.sql` (column add) and `hosted-0046.sql` (new tables):
```sql
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;
set local role repi_app;
set local lock_timeout = '5s';
<statements of drizzle/00NN_*.sql, verbatim>
alter table public."<new_table>" enable row level security;   -- one per NEW table (D68; hosted-0046.sql:81-85)
do $$ begin ... raise exception '00NN: ...' ... end $$;      -- self-verification: tables/columns/indexes/RLS present, no unexpected rows
insert into drizzle.__drizzle_migrations (hash, created_at) values ('<sha256 of drizzle/00NN_*.sql>', <journal "when">);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
```
- Header comment documents: prerequisites (green backup, previous migration applied, titular approval), that it is ADDITIVE, compatibility of current prod code with the migration applied ("aplicar ANTES de integrar"), sha256 of the source file.
- Re-running fails entirely (CREATE without IF NOT EXISTS) — the verify script asserts this.
- `verify-00NN.sh` (e.g. `verify-0049.sh`): creates `repi_verify_00NN` from template `repi_dev` (guard `[[ "$DB" == repi_verify_* ]]`), recreates prod state (drops the new objects, deletes the migration hash), sets owner `repi_app` on all tables, inserts sample rows, fingerprints existing data (md5 of string_agg), applies hosted script, asserts fingerprint unchanged + migration count +1, asserts second apply fails, applies rollback as `repi_app`, asserts back to original, re-applies. Checks hash consistency between `drizzle/00NN.sql`, hosted and down scripts.
- Rollback file header: when it's needed (usually "only if abandoning the code too"), sha256; body: `begin; set local lock_timeout='5s'; drop …; delete from drizzle.__drizzle_migrations where hash = '…'; commit;` Some rollbacks refuse if data would be lost (`0047_experience_hub.down.sql` raises if `commercial_lead.email is null`).
- Documentation of each migration lands in `docs/continuidad/PROXIMA_SESION.md` (backup release tag, migration count, fingerprints, `postgres` sin SET, `repi_backup` can read).

### 1.4 DB roles and RLS
- `repi_app`: application login role and **owner of all tables** (docs/DESPLIEGUE.md:13, :39). Pooler 6543 (transaction, no prepared statements) for the app, 5432 (session) for migrations/scripts. As owner it is **not subject to RLS**.
- `repi_backup`: `hosted-backup-role.sql` — login, NOINHERIT, **BYPASSRLS**, `default_transaction_read_only = on`, conn limit 3, `statement_timeout 10min`; `grant select on all tables in schema public`; **`alter default privileges for role repi_app in schema public grant select on tables to repi_backup`** → any new table created as `repi_app` is automatically backed up. Password is minted per run by Edge Function `repi-backup-credentials` (OIDC) and expires in 2 h.
- RLS: enabled on all `public` tables, **no policies**, no grants to `anon`/`authenticated` → Supabase REST exposes nothing. RLS is a defence against misgrants, **not a tenant-isolation mechanism**. (Comment in hosted-backup-role.sql says "98 tablas" — stale; there are 110.)
- Backup (`scripts/operations/backup.ts:85-104`) enumerates tables dynamically from `pg_tables` (schemas `public`, `drizzle`) → new AC3 tables are included automatically. Storage files copied only for `media_object.deleted_at is null`.

---

## 2. Tables relevant to AC3 (exact columns)

### 2.1 Identity / profile
- **`user`** S:12-23 — `id` text PK (Better Auth), `name`, `email` unique, `email_verified`, `image`, `created_at`, `updated_at`, `two_factor_enabled`, **`birth_date` text ISO nullable** (S:21), `platform_role` ('admin' = REPI Admin; S:22). No gender, no experience, no unit, no timezone, no locale.
- Better Auth: `session` S:25, `account` S:36, `verification` S:52, `two_factor` S:61 (all cascade on user).
- **Minor logic (no column; derived)**: `packages/domain/src/access.ts` — `ageOn(birthIso, todayIso)` :41; `MINORS_POLICY = { version: "minors-v1", minSelfSignup: 13, adult: 18 }` :50; `classifyAge(birthIso|null, todayIso): "blocked"|"minor"|"adult"|"invalid"` :52; `ageEligibility(birth, today): "adult"|"minor"|"unknown"` (unknown = never assumed adult) :66; `MINOR_RESTRICTED = ["progress_photos","record_videos","health_data","ranking_name"]` :73. Server: `minorWithoutGuardian(userId)` `apps/web/src/server/access/services.ts:312`; `bodyEligibility(userId)` / `requireAdult(userId, what)` (403 `minor_restricted` / `age_required`) `apps/web/src/server/progress/body.ts:19-29`. Birth date declared once via `POST /api/me/birth-date` (audit `account.birth_date_declared`, no value), not user-editable after.
- **`guardian_consent`** S:268-280 (tutor = no account; `minor_user_id` FK cascade, `guardian_name`, `guardian_email`, `relation` mother|father|legal_guardian, `token_hash`, `status` pending|approved|rejected|expired, `policy_version`, `expires_at`, `decided_at`).
- **`user_pref`** S:953-966 (PK `user_id`, cascade): `active_relation_id` (chosen relation, D11), `notifications_seen_at`, **`weight_unit` kg|lb** (presentation only, data in kg), **`wishes` jsonb** = `TrainingWishes` (`packages/domain/src/wishes.ts:14`: `{ goal: strength|muscle|fat_loss|health|sport|habit|null; daysPerWeek; minutes; likes: string|null (≤200); avoid: string|null (≤200); shareWithTrainers?: boolean }`), `theme` light|dark|system (+CHECK), `theme_changed_at`, `hints` jsonb `{key: ISO}`, `updated_at`. Read/write: `mySettings(userId)` / `updateSettings(userId, p)` `apps/web/src/server/settings/services.ts:11,22`; `HINT_KEYS` :58.
- **Experience level**: NOT on profile. Only inside `ProgramRequestBrief.level` (beginner|intermediate|advanced; `packages/domain/src/program-request.ts:7-12, 29-44`) stored in `student_request.brief` (S:920) and `gym_task.context.brief` (S:1048).
- **Goals**: `user_pref.wishes.goal` (self-declared), `client_goal` (coach-set, S:800-819: `coach_client_id`, `kind` e1rm|load|frequency|manual, `title`, `exercise_id`, `target` text, `target_reps`, `unit`, `baseline`, `manual_value`, `manual_at`, `due_on`, `status` active|achieved|cancelled, `note`, `created_by`, `closed_at`), `body_goal` (S:1689).

### 2.2 Tenancy, memberships, roles, relationships
- **`organization`** S:73-94 — `kind` coach|gym, `name`, `status` trial|active|paused|closed, `is_demo`, `commercial_status` legacy|pending|enabled|suspended, `review_responses`, **`connect_enabled`** (per-gym module switch, precedent for per-org AI switch), `created_by` (FK NO ACTION).
- **`gym_location`** S:96-108 (org cascade; `public_join`, `reception_hours`, `lat/lng/geo_radius_m`).
- **`staff_membership`** S:145-157 — `user_id`, `org_id`, `location_id` (null = all locations), **`role` owner|manager|coordinator|floor_trainer|reception|coach_owner**, `status` active|revoked, `after_hours_access`. Unique `(user_id, org_id, role, coalesce(location_id,''))`.
- **`coach_client`** S:160-167 — `coach_org_id`, `user_id`, `status` active|paused|archived|ended, `invitation_id`. Unique `(coach_org_id, user_id)`.
- **`gym_member`** S:170-180 — `org_id`, `location_id`, `user_id`, `roster_entry_id`, `status` pending_consent|active|suspended|ended, `access_until`. Unique `(org_id, user_id)`. Extra locations: `gym_member_location` S:183-190.
- Floor staff day-to-day: `shift_plan` S:969, `staff_hours` S:981, `shift_log` S:1005-1019 (one active per user; `availability` available|busy; `source` manual|schedule), **`gym_floor_pick`** S:995-1003 (member picks trainer per day), `workout_session.floor_trainer_id` (S:454, no FK).
- Invitations/onboarding: `invitation` S:192, `roster_entry` S:215 (DNI HMAC), `membership_request` S:228-253 (QR join requests; `decided_as` floor|reception|manager|owner), `location_join_link` S:256.
- **Relation resolution** (who the person trains with): `myRelations(userId)` / `myActive(userId)` / `setActiveRelation` `apps/web/src/server/training/services.ts:507,531,539`. Returns `{ id, kind: "coach"|"gym", orgId, orgName, name, place, assignment }`. Picked = `user_pref.active_relation_id` → first with active assignment → first.

### 2.3 Consent and access log
- **`consent_grant`** S:293-307 — `user_id`, `scope` coach_client|gym_member, **`relation_id`** (coach_client.id or gym_member.id, no FK), `grantee_org_id`, **`item`**, `status` active|revoked, `terms_version`, `granted_at`, `revoked_at`. Partial unique `(relation_id, item) where active`.
  - Catalog `CONSENT_CATALOG` `packages/domain/src/access.ts:149-169`: coach_client → `training` (locked), `measurements`, `health` (minorRestricted), `nutrition`, `progress_photos` (minorRestricted); gym_member → `attendance_training` (locked), `rankings` (minorRestricted), `measurements` (unavailable). `resolveGrants(scope, requested, { minorWithoutGuardian })` :172. `TERMS_VERSION = "v2026.10"`. Module gating `consentOffered(key)` `apps/web/src/lib/features.ts` (bottom).
- **`access_request`** S:925-938 (coach asks for an item; TTL 14 d, retry 7 d — `packages/domain/src/followup.ts:13-28`).
- **`data_access_log`** S:941-949 — subject-visible ledger: `subject_user_id` (cascade), `actor_user_id` (no FK), `org_id`, `item`, `action` requested|granted|denied|revoked|read, `at`. Helper `log(tx, v)` `apps/web/src/server/followup/services.ts:33`. **Good precedent for "coach read REPI memory" transparency.**
- **`legal_acceptance`** S:283-290 (terms|privacy|dpa + version).

### 2.4 Programming
- **`exercise`** S:333-342 — `org_id` null = REPI catalog; `owner_user_id` = member-own exercise (D163); `muscle_group`, `kind` load_reps|bodyweight|time.
- **`program`** S:345-358 — `org_id` notNull, `kind` template|client_copy|member_copy|**solo**, `coach_client_id`, `gym_member_id`, `source_program_id`, `source_version_id`, `current_version_id`, `archived_at`, `created_by`, `updated_at` (used by `trainingStamp`).
- **`program_version`** S:361-372 — `program_id`, `number`, `name`, `weeks`, `note`, **`locked`** (frozen once referenced), `reason`, `created_by`.
- `program_day` S:392-397; **`program_exercise`** S:399-411 — `exercise_id`, `name` snapshot, `sets`, `reps` text, `rir`, `rest_sec`, `note`, **`detail` jsonb (ExerciseDetail; null = straight sets)**.
- **`program_assignment`** S:415-429 — exactly one of `coach_client_id`/`gym_member_id` (CHECK), `program_id`, `starts_on`, `status` active|ended, partial unique one active per relation.
- **`own_routine`** S:376-390 — `user_id` (cascade), `name`, `exercises` jsonb `{exerciseId, sets, reps, weightKg, restSec, note, detail?}[]`, `last_used_at`, **`origin` jsonb `ImportOrigin`** (`packages/domain/src/program-import.ts:589-594`: `{ kind:"import", opId, day, at, source: sheet|text|ai, file: text|sheet|image|pdf, dayName, exercises: { written, exerciseId, sets, reps, weightKg, perSet, restSec, rir, rpe, tempo, technique, unknown[], completed[], suggested[] }[] }`), immutable. Private to the member (not shared with coach/gym). Service: `apps/web/src/server/training/own-routines.ts`. Mapping table for AC3 in `docs/SMART_IMPORT_2.md:105-124`.
- **Important**: an own-routine / solo session is still written under the **active relation**: `startSolo…` (`apps/web/src/server/training/services.ts:850-900`) inserts `program(kind "solo", org = relation org)` + locked version + day + exercises + an **already-ended** `program_assignment`, then `workout_session` with `coach_client_id|gym_member_id`. A user with no active relation **cannot train** (`AccessError("no_relation", 409)`, services.ts:851, own-routines.ts:24-27). Solo sessions are therefore visible to the coach via the `training` grant.
- `set_type` S:614-627 (coach custom set-type library), `exercise_substitution` S:674-682 (org-approved replacements), `gym_equipment` S:113-137 + `gym_equipment_exercise` S:139.

### 2.5 Execution, check-ins, discomfort, restrictions
- **`workout_session`** S:433-466 — `id` client-generated, `user_id`, `coach_client_id`|`gym_member_id`, `assignment_id`, `version_id`, `day_id`, `day_name`, **`status` in_progress|paused|completed|abandoned|voided**, `started_at`, `last_resumed_at`, `active_ms`, `ended_at`, **`rpe`**, **`note`** (post-workout feedback), `revision`, `updated_at`, `presence_checkin_id`, `floor_trainer_id`, `interval_state` jsonb, `voided_at/by/void_reason`. Partial unique one open session per user.
- **`set_log`** S:468-496 — `id` client-generated, `session_id`, `program_exercise_id`, `exercise_id` (actually done), `set_index`, `weight_kg` text, `reps`, `rir`, **`feel`** (facil|bien|dificil|limite|**molestia**|ayuda), **`note`** (visible to coach in relation), `spec_id`, `set_kind`, `block_index`, `stage_index`, `completed_at`, `revision`, `voided_*`. Unique `(session_id, program_exercise_id, set_index)` = sync key.
- `set_skip` S:525-534; `session_exercise_change` S:661-670 (`kind` skip|substitute, **`reason` busy|no_equipment|discomfort|no_time|other**); `sync_conflict` S:685-699; `training_correction` S:502-519 (append-only history edits, `request_id` idempotency).
- **Training Intelligence outputs**: `training_target` S:541-583 (per set target, `status`, `action`, `source` rules|coach, `quality`, `detail` jsonb `{reasons, guards, text, why, review, prev, refs, coach}`, `algo_version`, `decision` accepted|modified|not_done, `seq`, `superseded_at`); `training_proposal` S:588-608 (for coach/floor: `kind` load|reps|hold|review|deload|rest, `payload` jsonb, `status` open|accepted|modified|rejected|kept, `decided_by/at`, `note`; one open per relation+exercise+kind).
- **`checkin`** S:703-711 — one per user per AR day: `energy`, `sleep`, `mood` (1–5).
- **`pain_report`** S:714-726 — **health data**: `zone`, `level` 0–10, `context` now|after|out, `exercise_name`, `session_id` (no FK), `note`, `shared_with_relation_id` (per-report sharing), `seen_by_coach_at`. Coach sees it with `health` grant or explicit share (`coachSeesPain`, `packages/domain/src/followup.ts:37`). `PAIN_WARN_LEVEL = 7`.
- **`injury`** S:728-738 — `zone`, `detail`, `status` active|monitoring|resolved, `since`, soft `deleted_at`.
- **No dedicated "restriction" table** (exercise exclusions/time-limited restrictions). Today restrictions = `injury` + `pain_report` + `user_pref.wishes.avoid` (free text) + `session_exercise_change.reason='discomfort'` + `set_log.feel='molestia'` + `ProgramRequestBrief.limitationsDetail`.
- History: `history_import` S:630-644 (draft/confirmed/discarded; `parsed` jsonb also used as job state by `apps/web/src/server/training/history-import-job.ts`), `history_entry` S:646-657.

### 2.6 Body
- **`body_weight_entry`** S:1672-1685 — `user_id` cascade, `measured_on`, `weight_g` int (CHECK 20000–400000), `source` 'manual' (CHECK), unique per user+day. Owner-only; never coach/gym/admin; adults only.
- **`body_goal`** S:1689-1703 — PK `user_id`, `start_source` first_entry|manual, `start_weight_g`, `start_on`, `target_weight_g`, `target_on`, `revision`.
- **`progress_photo`** S:1708-1721 — `media_id` → `media_object` (purpose `progress_photo`), `taken_on`, `pose`, `width/height`. Must never be sent to AI (spec + D200).
- No measurements table (circumferences); `measurements` consent exists but module `body` is OFF.

### 2.7 Messages and requests (human ↔ human)
- **`conversation`** S:1176-1185 — `kind` coach_client|gym_member, `relation_id`, `org_id` notNull, `location_id`, `member_user_id` (cascade), `last_message_at`. Unique `(kind, relation_id)`.
- **`message`** S:1188-1195 — `id` client-generated, `conversation_id` (cascade), `sender_user_id` (**FK NO ACTION**), **`sender_side` member|staff**, `body`, `created_at`.
- `conversation_marker` S:1198-1204 (delivered/read per participant). Service: `apps/web/src/server/messages/services.ts`.
- These are relation-scoped and visible to org staff; **not suitable as the REPI (AI) chat store** without breaking semantics (`org_id`/`relation_id` notNull, `sender_side` has no "assistant", owners/floor can read by role).
- **`student_request`** S:908-922 (member → coach: `kind` rutina|tecnica|consulta|programa, `text`, `video_id`, `status`, `brief` jsonb).
- **`gym_task`** S:1022-1061 (REPI Connect request to floor: `category`, `priority`, `status` open|pending_acceptance|in_progress|follow_up|done|cancelled, `source` app|sala|…, `summary`, `reason`, `context` jsonb `{exerciseId, exerciseName, sessionId, programExerciseId, setIndex, programName, fromSession, brief}`, `client_key` idempotency, `feedback` yes|no). History `gym_task_event` S:1084-1097 (append-only trigger). `gym_note` S:1100 (institutional|personal), `floor_alert` S:1587-1599 (set feel alert for institutional sessions).

### 2.8 Notifications / push / preferences
- **`push_subscription`** S:1549-1560 — `endpoint` unique, `p256dh`, `auth`, `user_agent`, `last_ok_at`, `fail_count`, `revoked_at`.
- **`notify_pref`** S:1562-1566 — PK `user_id`, **only `paused` boolean**. No categories, no quiet hours, no timezone, no frequency caps.
- **`notification_outbox`** S:1569-1584 — `kind` (TS enum: join_request, join_escalation, floor_alert, join_resolved, assist_*, challenge_new, challenge_beaten, program_brief), `title`, `body`, `url`, **`dedupe_key` unique** (`${dedupe}:${userId}`), `status` pending|sent|failed|skipped, `attempts`, `next_attempt_at`, `last_error`, `sent_at`, `read_at`. Service `apps/web/src/server/push/services.ts`: `enqueue(userIds, {kind, dedupe, title, body, url})` :48, `processOutbox(limit=50, now)` :63 (skips when `notify_pref.paused`), `setPaused` :36, `pushStatus` :40, `subscribe/unsubscribe` :26/:32.
- **`member_notice`** S:1329-1339 (in-app notices to members; `kind` TS enum, `ref_id`, `seen_at`).
- Member notification center is **composed at read time, no table**: `myNotifications(userId, now)` `apps/web/src/server/notifications/feed.ts:40` (sources: member_notice, inbox, gym tasks, review invites, threads, charges, appointments, announcements, briefs; 30-day window, max 40). Explicitly excludes health/checkins/pains. `markNotificationsSeen` :122.
- `product_announcement` S:1726 + `announcement_read` S:1750.

### 2.9 Audit, feature flags, site events
- **`audit_event`** S:310-320 — `actor_user_id` (no FK), `org_id` (no FK), `action` text, `resource_type`, `resource_id`, `result` ok|denied|error, `meta` jsonb, `at`. Indexes only `(actor_user_id)`, `(org_id)` — **no index on `at` or `action`**. Never purged (except demo actors in `purgeSandboxes`). Writer: `audit(tx|db, { actorUserId?, orgId?, action, resourceType, resourceId?, result?, meta? })` `apps/web/src/server/access/util.ts:31-36`. Policy: no sensitive content in meta (comment S:309; settings/services.ts:50 example).
- **Feature flags**: **no DB table.** `apps/web/src/lib/features.ts` — `FEATURES` const (adaptive, connect, gym_access, club, nutrition, body, progress, body_weight, calories, progress_photos, announcements, exercise_video), `featureOn(f)`, override `NEXT_PUBLIC_REPI_FEATURES="a,-b"` (build-time; redeploy needed). Per-org switches live as columns/rows: `organization.connect_enabled`, `gym_access_policy.enabled` (S:1615; "no row = module off" pattern). Doc rule (docs/FEATURE_FLAGS.md): new module born OFF.
- **`site_event`** S:1422-1436 — anonymous commercial site analytics (`name`, `visit`, `profile`, `target`, utm…, `path`, `device`); purge after `SITE_EVENT_RETENTION_DAYS = 400` (`apps/web/src/server/site/events.ts:10, 44-48`).
- Rate limits: `app_rate_limit` S:887 (`key`, `window_start`, `count`) via `rateLimit(key, max, windowMs)` util.ts:41 and `limit(bucket, max=10, windowMs=60000)` `apps/web/src/server/access/http.ts:21`. Current AI cost cap: `limit(\`solo-ai-day:${me}\`, 60, 86_400_000)` in `apps/web/src/app/api/me/solo/ai/route.ts:22` and `/me/solo/routine/route.ts:13`. **No AI usage/token/cost table**; `apps/web/src/server/ai/openai.ts` (`aiOn`, `aiModel`, `aiFastModel`, `aiJson<T>(p)`) is stateless.

---

## 3. Permission model (how access is checked today)

All checks are in server services; a foreign/unknown id answers 404 (`NOT_FOUND`), missing consent 403.
- Session: `sessionUserId()` / `optionalUserId()` `apps/web/src/server/access/http.ts:9,16`; page guards `requireUser`, `requireOrgMember(orgId, kind, nextPath)` `apps/web/src/server/access/guard.ts:9,16`.
- Admin: `requireAdmin(actorId)` `apps/web/src/server/commercial/services.ts:24` (`user.platform_role === 'admin'`, 2FA optional by policy `TWO_FACTOR_REQUIRED`).
- Coach: `requireCoach(actorId, orgId)` `apps/web/src/server/training/services.ts:27` (active `staff_membership` role `coach_owner` in org kind coach); `requireClientOf(orgId, coachClientId, tx?)` :37 (relation not `ended` **and** active `consent_grant` item `training`); followup `coachRelation(actorId, orgId, relId)` + `activeItems(relationId)` `apps/web/src/server/followup/services.ts:31-40` (health/measurements/etc. gated by grant items, reads logged to `data_access_log`).
- Gym: `gymContext(actorId, orgId): GymCtx` `apps/web/src/server/gym/services.ts:32` → `need(ctx, cap)` :59 / `needRoles` :60 / `inScope(ctx, locationId)` :63 / `scopedLocation(s)` :66-74 / `gate(ctx, locationId, what)` :119 (floor shift gating). Capability matrix `GYM_CAPS` + `CAPS` per role `packages/domain/src/gym.ts:7-42` (`floor.work`, `member.read`, `program.edit`, `messages.floor`, …). Member training data additionally requires active `attendance_training` grant (`memberLastTimes`, `intelMember`, `memberDetail` gym/services.ts:582-630). `GYM_NEVER_SEES` = health, nutrition, body, private app & coach chats (gym/services.ts:579). Owner/manager do NOT see member Training Intelligence (`program.edit` only).
- Owner-only personal data: body weight/goal/photos (`progress/body.ts` header), own_routine.
- Extension point for AC3: a single `canActOn(actor, subjectUserId, relation, capability)` does not exist; each module repeats the pattern above. AC3 action engine should reuse `requireClientOf`, `gymContext+need+inScope+attendance_training`, `requireAdult`, `minorWithoutGuardian` rather than invent new checks.

---

## 4. Personal data EXPORT

- Route: `GET /api/me/export` → `apps/web/src/app/api/me/export/route.ts` (session, `limit("privacy-export", 5)`/min, `cache-control: private, no-store`, attachment JSON).
- Function: **`exportMyData(userId: string, now = new Date())`** `apps/web/src/server/privacy/services.ts:16-54`. Returns `{ generatedAt, notice, account{name,email,emailVerified,birthDate,createdAt,twoFactorEnabled}, relations{coaches,gyms}, settings (= mySettings: uid, weightUnit, wishes, theme, themeChangedAt), legalAcceptances, sharing (consent_grant), training (sessions + sets: set, weightKg, reps, rir, feel, completedAt), checkins, pains, injuries, requests (student_request), messagesSent, clubPosts, files (media_object listing), bodyWeight, bodyGoal, progressPhotos, privacyRequests }`, then `audit(... "privacy.export")`.
- **Extension point**: add one property per AC3 table in the `data` object (same style: explicit column selection, owner-filtered `eq(table.userId, userId)`, never other people's content). Covered by `apps/web/tests/privacy.test.ts:13-35` (add assertions there) and `tests/personal-progress.test.ts`.
- **Already missing from export (existing tables with personal data)**: `own_routine` (+origin), `exercise` (owner_user_id), `training_target`, `training_correction`, `set_skip`, `session_exercise_change`, set `note`/`spec`, `history_import`/`history_entry`, `sync_conflict`, `client_goal`, `coach_appointment`, `coach_charge`, `access_request`, `data_access_log`, `guardian_consent`, `user_pref.hints`/`active_relation_id`, `notify_pref`, `push_subscription`, `notification_outbox`, `member_notice`, `announcement_read`, `achievement`, `challenge_attempt`, `prize`, `club_comment`/`club_reaction`/`club_profile`/`club_member`, `gym_task` (created by the member) and its `member_note`s, `gym_checkin`, `attendance`, `gym_floor_pick`, `membership_request`, `review`/`review_invite`, `support_ticket`, `student_request.brief`. (Relevant if AC3 promises "export of memory": decisions/outcomes may derive from these.)

## 5. Personal data DELETION & retention

- Self-service: `requestDeletion(userId, note?)` :57 (idempotent; one pending), `cancelDeletion(userId, id)` :67, `myPrivacyRequests(userId)` :75; routes `apps/web/src/app/api/me/deletion/route.ts`, `deletion/[id]/route.ts`. Admin: `listPrivacyRequests(adminId)` :80, `resolvePrivacyRequest(adminId, id, {status: "done"|"rejected", resolution})` :86 (records only; **does not delete**), routed in `apps/web/src/app/api/admin/[[...path]]/route.ts:25,52`.
- Table `privacy_request` S:844-855 (`user_id` set null, `email_at_request`, `kind` 'delete', `status` pending|done|rejected|cancelled, `resolution`, `resolved_by/at`).
- **Execution is manual**: `docs/PRIVACIDAD_OPERACION.md` step 4 — list `media_object.storage_key` first, then `delete from "user" where id = …` in a transaction (cascades), then delete bucket objects. No automated deletion job exists.
- **Blocking risk**: 51 FKs reference `user.id` with **no `onDelete` (NO ACTION)** — e.g. `message.sender_user_id` (S:1191), `challenge.proposed_by` (S:1242, member-authored), `gym_task.created_by` (S:1036), `program.created_by` (S:355), `client_goal.created_by` (S:815), `organization.created_by` (S:92), all staff/admin `*_by` columns. A member who proposed a challenge, or any staff/coach, cannot be deleted with a plain `delete from "user"` until those are reassigned/nulled. **New AC3 tables must use `onDelete: "cascade"` for the subject/owner and `onDelete: "set null"` for actor columns** (precedents: `training_correction.actor_user_id` S:507, `contract_notice.created_by` S:1531, `product_announcement.created_by` S:1738).
- Non-FK user references survive deletion (pseudonymous ids): `audit_event.actor_user_id`, `data_access_log.actor_user_id`, `pain_report.session_id`, `workout_session.floor_trainer_id`, `consent_grant.relation_id`.
- **Demo sandbox purge** (the only automated user deletion): `purgeSandboxes(now)` `apps/web/src/server/sandbox/services.ts:320-348` — per sandbox in a tx: delete `workout_session` + `audit_event` of demo users, then `program`, `coach_client`, `organization` of demo orgs, then `user`. New AC3 tables with cascade FKs to `user`/`organization` are covered automatically; a table with a NO ACTION FK to `user` would make demo purges fail (logged, retried each minute).
- **Retention jobs (data)**:
  - Daily `GET /api/cron/purge-media` (`apps/web/src/app/api/cron/purge-media/route.ts`, Vercel cron `30 6 * * *` in `apps/web/vercel.json`): `purgeMedia()` (`apps/web/src/server/followup/services.ts:383`; 90 d after resolution for request/task/attempt videos, 24 h orphans; references discovered from `pg_constraint` via `mediaReferences()` :365 with sanity list `KNOWN_MEDIA_REFERENCES` :359 — **add any new media FK there**), `purgeUploadIntents()`, `purgeRateLimits()` (>1 d, util.ts:54), `purgeSiteEvents()` (>400 d).
  - Every minute `GET /api/cron/notifications` (`apps/web/src/app/api/cron/notifications/route.ts`, called by Supabase pg_cron+pg_net): `step(name, run, fallback)` wrapper isolates failures; runs escalate, `purgeSandboxes`, trial notices, `connectSweep`, shift closing, `closeIdleWorkouts`, consent/brief reminders, `processOutbox`, hourly backup watch. **This is the natural home for the AC3 proactive engine tick** (add a `step("ac3", …)`), while TTL purges of AC3 memory/events/chat go in purge-media.
  - Auth: `cronAuthorized(req)` `apps/web/src/server/cron.ts:5` (Bearer `CRON_SECRET`, timing-safe; 404 otherwise).
  - **No retention exists for**: `audit_event`, `notification_outbox` (sent/skipped rows accumulate), `data_access_log`, `training_target`, `member_notice`, `sync_conflict`, `checkin`, `pain_report`. Retention policy is formally "pendiente" (PRIVACIDAD_OPERACION.md header).
- Backups keep deleted data until rotation (30 daily + 4 monthly; docs/RESPALDOS.md table) — must be stated in privacy texts for AC3 memory/chat.

---

## 6. Gaps vs. AC3 spec (data layer)

| AC3 need (docs/adaptive/AC3_MASTER_PROMPT.md) | Current state | Needed |
|---|---|---|
| Persistent memory with types (declared preferences, decisions, outcomes, temporal context), provenance, expiry, invalidation, isolation (§13, lines ~860-930) | Nothing. Facts are derivable from base tables (do not duplicate: spec says so). Only `user_pref.wishes` (6 fields, free text likes/avoid). | New owner-scoped table (e.g. `coach_memory`: user_id cascade, org_id/relation_id nullable scope, kind, key, value jsonb, source/provenance {kind, ref table/id, actor}, confidence, expires_at, invalidated_at + reason, created/updated, revision). CHECK constraints for kind. Export + TTL purge. |
| Persistent REPI chat | `conversation`/`message` are human relation threads readable by staff; no assistant side. | New `repi_thread`/`repi_message` (user cascade; role user/assistant/system-tool; content; structured payload jsonb; model, tokens, cost; client id for idempotency; context snapshot ref). Not visible to org staff by role (§21 "dueño no accede a conversaciones"). |
| Proactive events: relevance, dedupe, quiet hours, cooldowns (§ proactive) | `notification_outbox.dedupe_key` (global unique) only; `notify_pref.paused` only; TZ fixed AR. | `coach_event`/`insight` log (user, kind, dedupe_key, relevance score, surface, shown/dismissed/acted timestamps, cooldown_until); notification prefs extension (per-category opt-in, quiet hours, max per day; optionally timezone). New outbox kinds are code-only. |
| Action engine: permission checks, idempotency, audit, autonomy 0/1/2 | `training_correction` (request_id idempotency) and `training_proposal` (coach decisions) are partial precedents; `audit_event` generic. | `coach_action` ledger (actor, subject, relation/org, kind, payload jsonb validated, autonomy_level, status proposed/confirmed/executed/rejected/undone, idempotency key unique per actor, result ref, reason codes, created/decided/executed). Autonomy setting per user (user_pref column or new prefs table) bounded by org policy. |
| Org policy / quotas / budgets / circuit breaker / fallback | Per-user daily cap via `app_rate_limit` key; no usage ledger; no org settings table. | `ai_usage` ledger (user, org, feature, model, tokens in/out, cost_micros, outcome, latency, at) + org AI policy row (pattern `gym_access_policy`: no row = defaults/off). Circuit breaker state can live in `app_rate_limit`-like table or memory. |
| Training context (experience, goals, unit, restrictions) | experience only in request briefs; goal in wishes; unit in user_pref; restrictions scattered (injury/pain/avoid/discomfort). | Either derive at read time (preferred, spec: no stale duplicates) or add `experience_level` to `user_pref`; a structured "restriction" memory kind with expiry (molestia ≠ permanent). |
| Safety: minors, no diagnoses | `classifyAge`/`ageEligibility`/`minorWithoutGuardian`/`requireAdult` exist; health data gated by `health` grant. | Reuse; AC3 tables must not store diagnoses/psych inferences; minors: restrict memory kinds & proactive pushes. |
| Multitenant isolation | App-level only (RLS without policies). | Every AC3 query must filter by owner `user_id` and, for staff views, go through `requireClientOf` / `gymContext+need+inScope` + consent item. Consider a new consent item (e.g. `ai_context`) if coaches will see AI memory/chat summaries; log reads in `data_access_log`. |
| Export / deletion / retention / audit / backup (§21 "Privacidad y eliminación") | Export manual list; deletion manual cascade; backups automatic. | Add each AC3 table to `exportMyData`, cascade FKs, TTL purge step, `PRIVACIDAD_OPERACION.md` update, audit actions without content. |
| Feature flag | Build-time `FEATURES`. | Add `adaptive_coaching` (or similar) key OFF by default; optional per-org column/policy row for B2B rollout. |

## 7. Risks / gotchas

1. **Do not run DB tests casually**: `apps/web/tests/global-setup.ts:14-16` drops `public` and `drizzle` schemas; guarded to `repi_test` on localhost, distinct from `DATABASE_URL`.
2. Drizzle text enums are not enforced in DB → add explicit `check()` for AC3 enum columns that matter (memory kind, action status, autonomy level), like `training_correction`.
3. RLS enabled with no policies: forgetting an owner filter in a service = cross-tenant leak; no DB backstop.
4. Every new table must get `enable row level security` **inside hosted-0050.sql** (migrate.ts does it locally, the hosted script must do it explicitly; precedent hosted-0046.sql:81-90 with a `do $$` check).
5. NO ACTION FKs to `user` block deletion and demo purges — use cascade / set null.
6. `audit_event` has no retention and no `at`/`action` index; high-volume AC3 actions/events should go to their own tables and only summary actions to `audit_event`.
7. Solo/own sessions are stored under the coach/gym relation (visible to the coach with `training` grant) while `own_routine` itself is private: AC3 coach collaboration must respect that split. Users without a relation cannot train at all.
8. `message`/`conversation` reuse for the AI chat would expose content to staff and breaks `sender_side` semantics.
9. Single fixed timezone (AR) — quiet hours/cooldowns per local day are consistent only for AR users.
10. `exportMyData` is a hand-maintained list (already incomplete) — consider a test that asserts every table with a `user_id`-cascade FK is either exported or explicitly excluded (like `mediaReferences()` reads `pg_constraint`).
11. Hosted migration must be additive and compatible with current prod code ("aplicar ANTES de integrar"); destructive migrations are forbidden by the AC3 brief (line ~1700). Requires green backup + titular approval; record release tag and fingerprints in PROXIMA_SESION.md.
12. Stale doc counts: hosted-backup-role.sql says 98 tables (actual 110).

## 8. Checklist to add an AC3 table (copy/paste plan)

1. `apps/web/src/db/schema.ts`: new `pgTable` with `id()`, `user_id` FK `onDelete: "cascade"`, actor FKs `onDelete: "set null"`, `org_id` FK `onDelete: "cascade"` when org-scoped, timestamps via `now()`, explicit `check()`s, partial unique for idempotency/dedupe, index `(user_id, created_at)`.
2. `pnpm --filter @repi/web db:generate` → `drizzle/0050_<name>.sql`, `meta/0050_snapshot.json`, journal entry (keep the `when`).
3. `scripts/operations/hosted-0050.sql` (pattern §1.3, RLS per new table, `do $$` checks, migration hash insert).
4. `scripts/rollback/0050_<name>.down.sql` (drop tables, delete hash; refuse if it would lose user data without export).
5. `scripts/operations/verify-0050.sh` (copy verify-0049.sh/0046.sh; DB `repi_verify_0050`; M0 == 50).
6. `apps/web/src/server/privacy/services.ts` `exportMyData`: add section; extend `tests/privacy.test.ts`.
7. Retention purge function + `step(...)` in `/api/cron/notifications` or call in `/api/cron/purge-media`.
8. If it references `media_object`: add to `KNOWN_MEDIA_REFERENCES` (`followup/services.ts:359`).
9. `docs/PRIVACIDAD_OPERACION.md` (cascade list), `docs/FEATURE_FLAGS.md` + `apps/web/src/lib/features.ts` (flag OFF), `docs/continuidad/PROXIMA_SESION.md`.
10. Backups: nothing to do (dynamic `pg_tables` + default privileges for `repi_backup`).
