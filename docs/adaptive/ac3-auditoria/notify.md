# AC3 audit — Notifications, cron & preferences

Base: branch `claude/adaptive-coaching-3` (main 08d4a50 + b72a6d1 = AC3 master prompt only). Paths are relative to `/home/user/repi/apps/web` unless stated. READ-ONLY audit; nothing was run against a DB.

---

## 0. TL;DR

- There are **three independent notification surfaces**, none with categories or per-user scheduling:
  1. **Member notification center**, `src/server/notifications/feed.ts`. It is a *derived read-model*: no table of its own, built from about 11 sources each time it is read. Read state is a single watermark, `user_pref.notifications_seen_at`. It never sends push.
  2. **Push outbox**, `src/server/push/services.ts` + table `notification_outbox`. It is idempotent by a globally unique `dedupe_key`, retries with exponential backoff and has one **global** per-user kill switch, `notify_pref.paused`. There are no categories, no priority, no quiet hours, no cancellation and no TTL per kind.
  3. **Staff notice center**, `src/server/gym/notices.ts`. It reads the gym-staff kinds back out of `notification_outbox`, using `read_at`.
- **Members cannot opt in to push from the member app.** The only opt-in UI is `PushCard` in the gym staff screen (`src/components/gym/Access.tsx:18`, rendered only at `:66` with `who="floor"`). Despite that, member kinds already exist and are enqueued: `program_brief`, `challenge_new`, `challenge_beaten`, `assist_update`, `join_resolved`. Today they reach a member only if the same account subscribed a device as staff; otherwise they end up `skipped` ("sin dispositivos").
- **Cron:** a single per-minute job, `GET /api/cron/notifications`. It is fired by **Supabase pg_cron + pg_net** (configured out of repo by `scripts/schedule-cron.ts`), not by Vercel. Vercel Cron only runs `purge-media` daily (`apps/web/vercel.json`). Auth is `Authorization: Bearer CRON_SECRET`, compared timing-safe; an unauthenticated call gets 404. Idempotency is **per step** (claims, unique keys, audit markers). There is **no run-level lock**.
- **Preferences** live in `user_pref` (one row per user: theme, weight unit, wishes, hints, seen watermark) and `notify_pref` (only `paused`). There is no timezone column; everything is hard-coded to `America/Argentina/Buenos_Aires` (`packages/domain/src/training.ts:7`).
- **Gaps vs AC3 §19:** there are no proactive categories, quiet hours, frequency caps, priority, cancellation of obsolete notices, digest/summary, server-side rejection memory, member push UI, notification-pref export, or outbox retention.

---

## 1. Files and exports

### 1.1 Member notification center: `src/server/notifications/feed.ts` (126 lines)

```ts
export type NotifDest =
  | { tab: "home" | "msgs" | "perfil" | "train" }
  | { tab: "prog"; seg?: "train" | "body" | "photos" }
  | { tab: "gym"; gymTab: "news" | "ch" | "logros" }
  | { tab: "review"; invite: { id: string; trainer: string; kind: string; place: string } };          // :21-25
export type Notif = { id: string; title: string; body: string; at: string;
  tone: "cyan" | "turq" | "ok" | "bad" | "mute"; dest: NotifDest; unread: boolean;
  origin?: "repi"; cta?: string | null };                                                          // :27
export async function myNotifications(userId: string, now = new Date()):
  Promise<{ items: Notif[]; unread: number; seenAt: string | null }>                               // :40
export async function markNotificationsSeen(userId: string, now = new Date()): Promise<{ seenAt: string }> // :122
```

- Constants: `WINDOW_DAYS = 30`, `MAX = 40` (`:34`). `ANN_DEST` maps announcement destinations to `NotifDest` (`:29-32`).
- Sources, queried in parallel (`:42-49`): `user_pref.notificationsSeenAt`, `myInbox` (followup), `myGymRelations`, `myGymTasks`, `myReviewInvites`, `myThreads`, `myCharges`, `member_notice` (last 30 days, max 20), `myAppointments`, `myAnnouncements(userId,"member")` and `pendingBriefs` (wrapped in `.catch`). After that come `community_post` from the user's gyms, max 5 (`:50-53`).
- **Deterministic item IDs, derived from the source.** These act as natural dedupe keys and are not persisted:
  `notice:<id>`, `access:<id>`, `req:<id>` / `req:<id>:done`, `task:<id>:<status>`, `review:<id>`, `msg:<threadId>:<lastAtISO>`, `post:<id>`, `charge:<id>`, `appt:<id>:<startsAt>` / `appt:<id>:cancelled`, `ann:<id>`, `brief:<id>`. The client adds `prog:<update.key>` (`src/components/member/MemberApp.tsx:413-425`, `withProgramNotice`).
- **Read state** (`:110-117`):
  - Most items are unread when `!seen || at > seen`, where `seen` is `user_pref.notifications_seen_at`.
  - `ann:*` uses its own per-announcement table, `announcement_read`.
  - `brief:*` is always unread until the brief is completed. Briefs are pinned at the top and reduce the cap.
- **Obsolescence happens naturally.** Items are recomputed from live state, so they disappear or change once the source resolves: charges only while pending, appointments only in the future, briefs only while incomplete, messages only while unread. Nothing is stored that could go stale.
- `markNotificationsSeen` calls `markAnnouncementsRead(userId,"member")` and then upserts `user_pref.notifications_seen_at` (`:122-126`).
- The header comment (`:5`) states explicitly: "No incluye datos de salud, check-ins ni molestias, y nada de esto se envía como push."
- Routes:
  - `GET /api/me/notifications`: `src/app/api/me/notifications/route.ts:5`.
  - `POST /api/me/notifications/seen`: `src/app/api/me/notifications/seen/route.ts:4`.
  - Both use `handle()` + `sessionUserId()`, so the user always comes from the session.
- Client: `MemberApp.tsx:108` `loadFeed`, called from `load()` (`:119`); `:194-200` open sheet, then mark seen; `:403` bell; `:434` `NotifSheet`. Offline, the client shows "Sin conexión" and does not cache the feed.
- Tests: `tests/notifications.test.ts` (sources, isolation, 30-day window), `tests/personal-progress.test.ts:377-454` (announcements in the feed), `tests/agenda.test.ts:44`.

### 1.2 Push outbox: `src/server/push/services.ts` (103 lines)

```ts
export function pushHostAllowed(endpoint: string): boolean                    // :21  (SEC-7 allow-list: FCM, Mozilla, Apple, WNS; https, no port)
export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null       // :24
export async function subscribe(userId, p: { endpoint; keys: { p256dh; auth } }, userAgent: string | null) // :26
export async function unsubscribe(userId, endpoint)                          // :32  (sets revoked_at)
export async function setPaused(userId, paused: boolean)                      // :36  (upsert notify_pref)
export async function pushStatus(userId) → { configured, publicKey, devices, paused } // :40
export async function enqueue(userIds: string[], n: { kind: OutboxKind; dedupe: string; title: string; body: string; url: string }): Promise<number> // :48
export async function processOutbox(limit = 50, now = new Date()) → { processed, sent? } // :63
```

- `configured()` (`:13`) needs `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`. Without them every row becomes `skipped` ("push sin configurar").
- **`enqueue`** (`:48-55`):
  - Deduplicates the user IDs.
  - Inserts one row per user with `dedupe_key = "${n.dedupe}:${userId}"` and `onConflictDoNothing()`.
  - Returns the number of rows **newly** inserted. This is the idempotency primitive: a repeated key returns 0.
  - Then calls `runAfterResponse(processOutbox)`, which uses Next `after()` or fires and forgets outside a request (`:58-60`).
- **`processOutbox`** (`:63-103`):
  - Selects `status='pending' AND next_attempt_at <= now`, **ordered by `created_at` ASC, limit 50**. There is no priority.
  - Claims each row with an optimistic update (`attempts = attempts+1 WHERE status='pending' AND attempts = <read>`, `:74-76`). This prevents double sends from concurrent workers.
  - Marks the row `skipped` (final) when push is not configured, the user is **paused**, or the user has no live subscription (`:78-80`). Skipped rows are never retried.
  - Sends to every live device with `webpush.sendNotification(..., JSON {title, body, url, tag: kind}, { TTL: 600, urgency: "high" })` (`:85`).
  - A 404 or 410 revokes the subscription; other errors increment `fail_count`.
  - Success: `status='sent'`, `sent_at`. Failure: backoff of `30s * 2^attempts`, then `failed` once `attempts >= 5` (`MAX_ATTEMPTS`, `:11`, `:96-100`).
- Route `src/app/api/push/[[...path]]/route.ts`:
  - `GET` → `pushStatus`.
  - `POST subscribe | unsubscribe | pause`, zod-validated, rate-limited with `limit("push:"+me, 20)` per IP per minute.
- Client lib `src/lib/push.ts`: `pushState()`, `enablePush()` (permission, SW register, `pushManager.subscribe`, POST), `disablePush()`, `setPushPaused()`. The only consumer is `PushCard` (`src/components/gym/Access.tsx:18-41`).
- Service worker `public/sw.js`:
  - `push` handler (`:66-76`): title, body, `tag` (= kind), `renotify: true`, `data.url` (same-origin path only; fallback `/acceso?step=workspace`).
  - `notificationclick` (`:78-89`): focuses or navigates; `focusOnly` is honored for the local rest alert.
- Tests:
  - `tests/annex.test.ts:375-395`: dedupe, and `skipped` when there are no devices, the user is paused or VAPID is missing.
  - `tests/log.test.ts:18-21`: host allow-list.

### 1.3 Staff notice center: `src/server/gym/notices.ts`

```ts
export async function myStaffNotices(actorId, orgId, now?) → { items: {id, kind, title, body, at, read, resolved, resolution, go:{s, sel}, locationId}[], unread, windowDays: 14 } // :19
export async function markStaffNoticesRead(actorId, orgId, ids: string[] | null, now?)  // :73
```

- `STAFF_KINDS` = join_request, join_escalation, floor_alert, assist_new, assist_wait, assist_transfer, assist_due (`:11-12`).
- **The source entity is recovered by parsing `dedupe_key.split(":")[1]`** (`:24`). Org and location scope is then re-checked against the live entity with `gymContext` (`:34`), because the outbox has no `org_id`.
- Routes: `GET /api/gym/[orgId]/notices` and `POST .../notices/read` (`src/app/api/gym/[orgId]/[...path]/route.ts:58,127`).

### 1.4 Every `enqueue` caller today (the complete list of outbox kinds in use)

| kind | file:line | recipients | dedupe key (before `:userId`) | notes |
|---|---|---|---|---|
| join_request | `server/join/services.ts:186` | floor on shift | `join:<reqId>` | |
| join_escalation | `server/join/services.ts:195` | owner/manager/reception | `esc:<reqId>` | claim via `escalated_at` |
| join_resolved | `server/join/services.ts:287` | member | `res:<reqId>` | member kind |
| floor_alert | `server/gym/alerts.ts:51` | floor on shift | `floor:<alertId>` | 10-minute cooldown per member (`FLOOR_ALERT_COOLDOWN_MIN`, `:43`) |
| assist_new | `server/gym/connect.ts:122` | floor | `assist:<taskId>` | |
| assist_transfer | `server/gym/connect.ts:437` | target staff | `assistx:<taskId>:<Date.now()>` | **not idempotent**, by design |
| assist_update | `server/gym/connect.ts:441`; `training/program-request.ts:99` | member; staff | `assistdone:<taskId>`; `brief-done:<id>` | the kind is reused for two audiences |
| assist_wait | `server/gym/connect.ts:523` (cron) | floor | `assistwait:<taskId>` | |
| assist_due | `server/gym/connect.ts:531` (cron) | assignee or floor | `assistdue:<taskId>:<localDate>` | one per day: an example of a period-scoped key |
| challenge_new | `server/community/services.ts:212, 291` | **all active gym members** (fan-out) | `chnew:<challengeId>` | not filtered by minors or demo |
| challenge_beaten | `server/community/services.ts:467` | member | `chbeat:<chId>:<attemptId>` | |
| program_brief | `server/training/program-request.ts:128-129` (cron) | member | `brief:<taskId or reqId>` | window 10:00–20:59 AR, every 15 minutes, once per request |

Not pushed at all: program assigned or updated (client-only feed item, D77), announcements (D202), messages, appointments, charges, coach events. **There are no coach-facing push kinds.**

### 1.5 Cron

- `src/server/cron.ts:5`, `cronAuthorized(req: Request): boolean`:
  - Returns false when `CRON_SECRET` is unset, which makes every route answer 404.
  - Otherwise does a `timingSafeEqual` of the `authorization` header against `Bearer ${CRON_SECRET}`.
- Routes (all `export const dynamic = "force-dynamic"`, all `GET`, and **none sets `maxDuration`**):
  - `src/app/api/cron/notifications/route.ts`: **per minute**. `step(name, fn, fallback)` isolates failures (`:22-24`) and returns 500 with `failed[]` if any step throws. Steps run sequentially:
    1. `escalatePending`: join requests older than 5 minutes; claim on `membership_request.escalated_at`.
    2. `purgeSandboxes`: demos.
    3. `trialNotices`: B2B `contract_notice`; unique `(contract_id, dedupe_key)`.
    4. `connectSweep`: outbox dedupe.
    5. `closeShiftsAfterHours`.
    6. `syncScheduledShifts`.
    7. `closeIdleWorkouts`: row lock + `revision` check.
    8. `remindPendingConsent`: email; only at hour 8 AR. Dedupe is a `not exists` on `audit_event('join.consent_reminder')`, with the audit written **before** sending.
    9. `remindProgramBriefs`.
    10. `processOutbox`.
    11. `checkBackupFreshness`: only when `getUTCMinutes() === 7`; rate-limited to one per 12 hours.
  - `purge-media`: daily, run by Vercel Cron `30 6 * * *` (`apps/web/vercel.json`). It purges media, upload intents, `app_rate_limit` rows older than 1 day, and site events. **It does not purge `notification_outbox`.**
  - Ops-only routes: `alert-test`, `mail-test`, `mail-domain`. `backup-heartbeat` is `POST`, authenticated with GitHub OIDC or `BACKUP_HEARTBEAT_SECRET`.
- Scheduler setup: `scripts/schedule-cron.ts` runs `cron.schedule('repi-notifications','* * * * *', net.http_get(url, headers {Authorization: Bearer <secret>}, timeout 20 s))` plus `repi-cron-cleanup`. It runs once per environment and is idempotent. The **secret ends up inside the `cron.job` command text in Postgres.**
- Local equivalent: `scripts/notifications.ts` (`pnpm jobs:notifications`). It is stale: it runs only escalate, trial, connect and outbox.
- GitHub Actions schedule: only `.github/workflows/backup.yml` (`17 6 * * *`, `47 12 * * *`). `ci.yml` has no schedule.
- **Time-gating pattern used inside the per-minute job:** `hour === 8`, `minute % 15 === 0`, `UTC minute === 7`. A missed minute (pg_net timeout, cold start) silently skips that slot until the next one matches.

### 1.6 Preferences and settings storage

- **`user_pref`** (`src/db/schema.ts:953-967`), primary key `user_id` with FK cascade:
  - `active_relation_id`
  - `notifications_seen_at` (ts)
  - `weight_unit` ('kg'|'lb')
  - `wishes` (jsonb `TrainingWishes`, D139)
  - `theme` ('light'|'dark'|'system', CHECK constraint)
  - `theme_changed_at` (ts)
  - `hints` (jsonb `Record<string,string>`, default `{}`)
  - `updated_at`
- **`notify_pref`** (`schema.ts:1562-1566`): `user_id` primary key, `paused` boolean default false, `updated_at`.
- **`push_subscription`** (`schema.ts:1549-1560`): `id`, `user_id`, `endpoint` (UNIQUE), `p256dh`, `auth`, `user_agent`, `created_at`, `last_ok_at`, `fail_count`, `revoked_at`. Index `push_sub_user_idx(user_id)`.
- **`notification_outbox`** (`schema.ts:1569-1584`):
  - Columns: `id`, `user_id`, `kind` (text; the enum exists **only in TS**, so a new kind needs no migration), `title`, `body`, `url`, `dedupe_key` (UNIQUE, global, kept forever), `status` (pending|sent|failed|skipped), `attempts`, `next_attempt_at`, `last_error`, `created_at`, `sent_at`, `read_at`.
  - Indexes: `outbox_pending_idx(status, next_attempt_at)`, `outbox_user_idx(user_id, created_at)`.
  - Migrations: 0006 and 0018.
- **`member_notice`** (`schema.ts:1329-1339`): `user_id`, `org_id`, `kind` (attempt_*, prize_delivered, challenge_closed, proposal_*, club_notice), `title`, `body`, `ref_id`, `seen_at`, `created_at`. This is a persisted in-app notice table and the precedent for a "stored notice" source in the feed.
- **`app_rate_limit`** (`schema.ts:887-891`): `key` primary key, `window_start`, `count`. The generic helper is `rateLimit(key, max, windowMs)` in `src/server/access/util.ts:41`; it **throws** `AccessError` 429. The daily purge deletes rows older than 1 day (`util.ts:54`), so **windows longer than 24 hours do not work**.
- Services in `src/server/settings/services.ts`:
  - `mySettings(userId)` (`:11`) returns `{uid, weightUnit, wishes, theme, themeChangedAt}`.
  - `updateSettings(userId, {weightUnit?, wishes?, theme?, themeChangedAt?})` (`:22`):
    - Theme sync is last-write-wins via domain `acceptThemeChange` (`packages/domain/src/theme.ts:35`) plus an upsert guarded by `setWhere`. This is the offline-safe preference precedent.
    - It audits `settings.updated` and `settings.wishes` (meta only, no free text).
  - `HINT_KEYS`, `myHints`, `setHint`, `resetHints` (`:58-80`).
- Route `POST /api/me/settings` (`src/app/api/me/settings/route.ts:8`) uses a **`.strict()` zod object**, so new fields need a route change. `GET/POST /api/me/hints`.
- UI:
  - Member `Settings` (`MemberApp.tsx:989-1010`) offers only kg/lb and `ThemePicker`. **There are no notification controls.**
  - `Wishes.tsx` handles training wishes.
  - `/cuenta` has no notification settings.
  - Nudge dismissals are **localStorage only**, per device (`src/components/member/Nudges.tsx:16-17`).
  - Rest alert opt-in is local too (`src/lib/restAlert.ts`, key `repi:rest-alert`).
- **Privacy export** (`src/server/privacy/services.ts:16`) does **not** include `user_pref`, `notify_pref`, `push_subscription` or `notification_outbox`.

### 1.7 How permissions are checked

- Member and push routes: `handle()` (CSRF check via `crossSiteWrite`, AccessError mapping, denied-access audit) plus `sessionUserId()`. The user is never taken from the request body. Services filter by `userId`.
- Staff notices: `gymContext(actorId, orgId)` plus a re-check of each item's org and location against the live source.
- Cron: the bearer secret only. There are no per-org checks inside cron steps; each step selects across all tenants and filters demo orgs by hand (`organization.is_demo = false` in `remindProgramBriefs` and `remindPendingConsent`; **not** in `challenge_new` fan-out).
- Minors: `minorWithoutGuardian(userId)` (`src/server/access/services.ts:312`) is used by `communityNudges`. It is **not consulted** by `enqueue`, `processOutbox` or `myNotifications`.
- Feature flags: `featureOn()` (`src/lib/features.ts:33`). It is fixed at build time through `NEXT_PUBLIC_REPI_FEATURES` and global, not per org.

---

## 2. Extension points for AC3

1. **Feed source.** Add an AC3 source, for example a persisted `coach_notice`/`proactive_notice` table, to `myNotifications`. Follow the `member_notice` / `ann` / `brief` pattern: a deterministic id prefix (`ai:<id>`), `origin: "repi"`, and a new `NotifDest` variant (chat, workout, routines/import, weekly review). Natural obsolescence works if items are filtered by live state at read time (`status='active' AND (expires_at IS NULL OR expires_at > now)`).
2. **Outbox kinds.** Add TS-only kinds to the enum at `schema.ts:1573`, e.g. `ac3_training_reminder`, `ac3_progress`, `ac3_recommendation`, `ac3_motivation`, `ac3_weekly`, `ac3_coach_update`. No DB migration is needed for the kind itself. Pick period-scoped dedupe keys like the `assistdue` precedent: `ac3w:<isoWeek>`, `ac3r:<sessionPlanId>:<date>`, `ac3p:<eventId>`.
3. **Gate in `processOutbox`.** This is the single choke point for quiet hours, category opt-out, minors and caps, because **every push goes through it**.
   - Quiet hours must **defer**: set `next_attempt_at` to the end of the quiet window without incrementing attempts. Today's `skipped` path is final and would lose the notice.
   - Category opt-out can `skip` with a reason.
   - Priority needs a new column plus `ORDER BY priority, created_at`.
4. **Cron step.** Add `step("ac3", () => proactiveSweep(now), …)` to `src/app/api/cron/notifications/route.ts`. Reuse the in-route time gates (weekly summary on, say, Sunday 19:xx AR, guarded by a dedupe key, not by the exact minute). Keep the step cheap: an indexed "due" query, because the route runs every minute.
5. **Preferences.** Two options: add columns or a jsonb to `user_pref`, or create a dedicated `notify_pref` extension (a preferences-v2 row: `proactive` bool, `categories` jsonb, `quiet_from`/`quiet_to` text HH:MM, `max_per_day` / `max_per_week` int, `push` bool, `updated_at`/`changed_at` for last-write-wins). Then extend the `.strict()` schema in `/api/me/settings` or add `/api/me/notify-prefs`. Reuse `acceptThemeChange`-style last-write-wins for offline edits.
6. **Member push UI.** Reuse `PushCard`'s logic (`src/lib/push.ts`); the `who="member"` copy already exists at `Access.tsx:31`. Put it in the member `Settings` or in a new "REPI Preferences" section.
7. **Pure domain module (vitest).** Create a new file, e.g. `packages/domain/src/notify-policy.ts`, exporting:
   - `inQuietHours(prefs, now)`, which must handle wrap-around windows like 22:00–08:00. The existing `WeeklyHours` / `inWeeklyHours` in `packages/domain/src/gym.ts:245-263` **requires from < to** and cannot be reused as-is.
   - `nextAllowedAt`
   - `allowCategory`
   - `capExceeded(counts, prefs)`
   - `dedupeKeyFor(event)`
   - `priorityOf(kind)`

---

## 3. Gaps vs AC3 (§4 "Motor de relevancia", §19 "Proactive notification system", tests 46–51)

| AC3 requirement | Today | Gap |
|---|---|---|
| Proactive opt-in master switch | none | New pref, **default off** ("Enviar notificaciones masivas sin consentimiento" is prohibited) |
| Categories: training reminders, progress, performance recommendations, motivational, weekly summaries | none; only global `notify_pref.paused` | New per-category prefs, checked both when the feed builds AC3 items and in `processOutbox` |
| Push toggle (member) | **no member UI**; member kinds are enqueued anyway | Member opt-in UI. Also decide whether existing member kinds (`challenge_new`, `program_brief`) should fall under categories |
| Quiet hours | hard-coded per job only (`remindProgramBriefs` 10–20 AR, consent at 8 AR); none in `processOutbox`, so `enqueue` sends immediately at any hour | User quiet window with wrap-around, enforced at send time as a deferral; needs a timezone (none stored; AR hard-coded) |
| Frequency caps and cooldowns | only feature-specific ones (`FLOOR_ALERT_COOLDOWN_MIN=10`, `REVIEW_INVITE_COOLDOWN_DAYS=14`, alert email 1/h); `app_rate_limit` is purged after 1 day | Per-user, per-category daily and weekly caps. Count sent rows in `notification_outbox` (index `outbox_user_idx(user_id, created_at)` exists) instead of `app_rate_limit` |
| Dedupe per event / idempotent ids | **yes**: `dedupe_key` UNIQUE (`${dedupe}:${userId}`); feed ids are deterministic | Reuse. Key must carry event id or period; `dedupe_key` lives forever, so a period suffix is required for recurring notices |
| Cron retry protection | per-step claims and unique keys; no run lock; pg_net 20 s timeout can overlap runs | AC3 sweep must be idempotent through outbox keys or a per-event unique row; optionally `pg_try_advisory_xact_lock` for the sweep (pattern used elsewhere, e.g. `gym/connect.ts:101`) |
| Cancel obsolete notices (e.g. routine changed) | feed: implicit (derived). outbox: **no cancel**; statuses lack `cancelled`/`expired`; no `expires_at`, no `ref`/source columns. Web Push cannot be recalled once delivered (only collapsed by `tag`) | Add `cancelled` status plus `expires_at` and `ref_type`/`ref_id` (or `source_key`); cancel pending rows when the source changes; check freshness right before sending; consider a per-kind TTL instead of the fixed 600 s |
| Priority (safety > coach instructions > in-session > progress > achievements > reminders > none) | FIFO `created_at`, `urgency:"high"` for all | Add a priority column and ordering. **Existing risk:** a large `challenge_new` fan-out can delay `floor_alert` (head-of-line blocking, 50 rows per pass) |
| Digest / summary when several events | none | Weekly-summary builder; collapse multiple pending low-priority rows per user into one |
| Respect previous rejections | nudge dismissals stored in localStorage only; review invites have `dismissed`/`suppressed` | Server-side dismissal/rejection memory (overlaps with the memory engine) |
| "User already read" (test 51) | feed: watermark plus `announcement_read`; outbox `read_at` used only for staff | AC3 items need per-item read state (watermark is too coarse for actionable items, as the `brief` exception shows); skip sending push if already read in-app |
| User with messages disabled (test 46) | `paused`, then `skipped` | Category-level skip plus a feed-level filter |
| Minors / safety | `enqueue`/`processOutbox` ignore age; `challenge_new` fan-out has no minor or demo filter | AC3 policy: gate proactive categories with `minorWithoutGuardian` / age; never include health data in push text (the current rule is minimal lock-screen text) |
| Multitenant | outbox has no `org_id`; staff center parses `dedupe_key` | AC3 rows should store `org_id`/`relation_id` where relevant; never rely on key parsing |
| Coach / floor-coach collaboration notices | no coach push kinds; coach has announcements only | New kinds and the coach-side center (outside this area's scope, but there is no infrastructure for it) |
| Preferences visible, editable, deletable, exportable | prefs absent from `exportMyData` | Add new pref tables to export; audit pref changes (`settings.*` precedent) |
| Offline: "No repetir notificaciones" | feed not cached offline; `seen` needs network | Idempotent server keys cover push. Feed caching and offline read-marking are a UI decision |
| Weekly summary scheduling | no weekly job | Gate inside the per-minute job, dedupe `ac3w:<isoWeek>:<user>`, throttle the batch (the outbox drains about 50 per pass, plus `after()` bursts) |

---

## 4. Risks and gotchas

1. **The per-minute route is a monolith.** Every AC3 sweep adds latency to one sequential `GET` with no `maxDuration`, while pg_net times out at 20 s. Overlapping runs are possible, and the steps then rely on claims. Keep AC3 work incremental and indexed, or give it its own `/api/cron/ac3` route scheduled via another `cron.schedule` entry (requires re-running `scripts/schedule-cron.ts`; this is an external, ops-level action).
2. **`skipped` is final.** If quiet hours or caps are implemented by reusing `skipped`, notices are lost. Use deferral (`next_attempt_at`) and do not increment `attempts`. Note that the claim currently increments `attempts` before the skip decision.
3. **`enqueue` sends immediately** through `after()`. Without a send-time gate, quiet hours are bypassed whenever an event fires at night (e.g. a coach updates a program at 23:00).
4. **The global unique `dedupe_key`** never expires. Recurring notices must include a period or the event id, or they will never send again.
5. **No outbox retention.** The table grows with every fan-out; nothing purges it. Add a purge (e.g. sent/skipped/failed rows older than 90 days) to `purge-media` and keep any staff `read_at` window (14 days) intact.
6. **Logout does not unsubscribe push** (`src/lib/session-cleanup.ts:23-31`). The device keeps receiving the previous account's pushes until another account re-subscribes the same endpoint (`subscribe` reassigns `user_id` on conflict). Lock-screen text is minimal today; AC3 coaching text must stay non-sensitive for the same reason.
7. **`tag: kind` with `renotify`** collapses all notices of one kind on a device: a second AC3 recommendation replaces the first. Choose the tag deliberately, per category or per event.
8. **Timezone is hard-coded to AR** (`TZ`), and `slotOn` assumes `-03:00`. User quiet hours in other timezones would be wrong. Store an IANA zone, or document AR-only as a confirmed limitation.
9. **Stale local job.** `scripts/notifications.ts` diverges from the route (it lacks briefs, shifts, workouts and backup). Do not treat it as the reference.
10. **`assist_update` serves two audiences** (a member at `connect.ts:441`, staff at `program-request.ts:99`). Do not key category logic on that kind.
11. **The CRON secret is stored in `cron.job`** on Supabase (pre-existing). Rotating it requires re-running `schedule-cron.ts`.
12. **No member push UI exists today.** Shipping AC3 push means introducing the first member opt-in flow. Follow D61 (explicit action only). This is a product/UX decision, not a spend decision. Web Push via VAPID costs nothing extra.

---

## 5. Suggested minimal additive schema (proposal, not implemented)

- `notify_pref` extend (additive columns; defaults keep current behavior):
  - `proactive boolean default false`
  - `categories jsonb default '{}'`, e.g. `{training_reminders, progress, recommendations, motivation, weekly_summary}`, each a boolean, default off
  - `push_enabled boolean default true`. This keeps the meaning of `paused`; or reuse `paused` for it.
  - `quiet_from text`, `quiet_to text` (HH:MM, nullable)
  - `tz text default 'America/Argentina/Buenos_Aires'`
  - `max_per_day int`, `max_per_week int` (nullable, using a domain default)
  - `changed_at timestamptz` (last-write-wins for offline edits)
- `notification_outbox` add:
  - `priority smallint default 5`
  - `category text`
  - `expires_at timestamptz`
  - `ref_type text`, `ref_id text`
  - `org_id text` (nullable)
  - status value `cancelled` (TS-only enum, since the column is text)
  - index `(user_id, category, created_at)` for caps
  - index `(ref_type, ref_id) WHERE status='pending'` for cancellation
- AC3 in-app notice table, e.g. `coach_notice` / `repi_insight`:
  - `id`, `user_id`, `org_id?`, `category`, `priority`, `source_key UNIQUE` (idempotent id)
  - `title`, `body`, `dest jsonb`, `evidence jsonb`
  - `status (active|read|dismissed|cancelled|expired)`, `expires_at`, `created_at`, `read_at`, `dismissed_at`
  - The feed reads this table; pushes reference it via `ref_id`.
- Migrations are additive; `scripts/migrate.ts:12-13` auto-enables RLS on new public tables. Per CLAUDE.md, run the «Respaldo» workflow before any production migration.
