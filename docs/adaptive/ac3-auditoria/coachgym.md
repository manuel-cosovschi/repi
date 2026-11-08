# AC3 audit · Coach, Gym, floor staff and REPI Admin

Branch `claude/adaptive-coaching-3` (HEAD b72a6d1, code = main 08d4a50). Read-only audit. All paths are relative to
`/home/user/repi/apps/web/src` unless they start with `packages/`. Line numbers are as of this commit.

---

## 0. TL;DR

- There are **two independent authorization paths**. They do not share a helper:
  - **Coach** (independent PT org, `organization.kind = 'coach'`): `requireCoach` + `requireClientOf` in `server/training/services.ts:27,37`. Access is to a `coach_client` relation, and the `training` consent must be active.
  - **Gym** (`organization.kind = 'gym'`): a capability matrix in `packages/domain/src/gym.ts:32-40`, enforced through `gymContext` → `need(cap)` → `scopedLocation`/`inScope` in `server/gym/services.ts:32-81`. Data about a member also needs the `attendance_training` consent on the `gym_member` relation.
- **Training Intelligence (D191) is the existing hook for coaches and floor staff.** `relationIntelligence(rel)` (`server/training/intelligence.ts:228`) is shared by the coach client tab and the gym member tab. It persists `training_proposal` rows, and decisions never change the program. The UI is `components/coach/CoachIntelligence.tsx` (`IntelSection`). Proposals travel to the existing editors via sessionStorage (`components/coach/ProposalDraft.tsx`). AC3 coach insights and draft proposals should extend this. They should not create a parallel system.
- **Owners and managers cannot see intelligence or proposals** (`program.edit` is required), floor messages, task summaries or videos, wishes or briefs, health, or the private coach app. `tryPrivate` always denies and audits. **Caveat:** managers (and owners, through the API) *do* receive per-set session logs and institutional notes in `memberDetail`, through `member.read` (§2.6, risk R1).
- **Floor reads are not gated by shift.** Only writes go through `gate()` (active shift or `afterHoursAccess`). The code holds **three different definitions of "on shift"** (risk R3).
- **REPI Admin** is a single client app (`components/admin/AdminApp.tsx`) with 9 screens. Its API is `app/api/admin/[[...path]]/route.ts`. Each service calls `requireAdmin` (`server/commercial/services.ts:24`). There is **no AI, engine or cost telemetry**: only `deniedLast7d` and `pushFailedLast24h` in `adminSummary`.
- **Gaps vs AC3:**
  - Nothing aggregates pending proposals across clients.
  - Nothing records rejected substitution *suggestions*.
  - Coach-imported programs keep no provenance (only an audit row).
  - A student's imported own routines are private by design.
  - The coach gets no push for student requests.
  - Nothing tracks AI usage or budgets.
  - Proposals are not linked to the program version that applied them.

---

## 1. Surfaces and entry points

### 1.1 Coach (independent PT)
- **Page** `app/coach/[orgId]/page.tsx`. Guard: `requireOrgMember(orgId, "coach", …)`. It renders `components/coach/CoachApp.tsx`.
- **Screens** (`components/coach/types.ts` `Screen`): `dash | clients | agenda | builder | videos | msgs | inbox | pay | terms | guide | repinews`. Dispatched in `CoachApp.tsx:127-138`.
  - `dash` → `CoachDash.tsx`. Shows KPIs and a "Pendientes" list built **client-side** from `Overview.clients`: no program, adherence 0, pending invites. **This is the natural slot for AC3 cross-client insights.**
  - `clients` → `CoachClients.tsx`. List plus client sheet with tabs `res | rend | prog | progreso | salud | nutri | body | pay` (`CoachClients.tsx:27`). The `rend` tab = `PerfTab`, which mounts `IntelSection` (`CoachClients.tsx:171-175`) and then 1RM and volume. **This is the natural per-client slot for AC3 insights.**
  - `builder` → `ProgramBuilder.tsx` (379 lines). Reads a pending `TiDraft` with `readTiDraft({kind:"coach", programId})` (`:58`) and shows `ProposalBanner` (`:262`). **This is where reviewable AC3 drafts would be applied.**
  - `inbox` → `CoachInbox.tsx`: student requests, pains, check-ins, access requests, invitations.
  - `msgs` → shared `ChatPane` over `/api/coach/:orgId/messages`.
- **Printable report**: `app/coach/[orgId]/informe/[relId]/page.tsx` → `clientMonthlyReport` (`server/training/report.ts`).

**Coach APIs** (`app/api/coach/[orgId]/…`). Every route is a thin wrapper: `handle()` → `sessionUserId()` → a service that performs the authorization.

| Route | Service (file:line) | Auth inside |
|---|---|---|
| GET `overview` | `coachOverview` (training/services.ts:302) + `inboxCount` (followup:238) + `coachThreads` | requireCoach |
| GET `clients/[relId]` | `clientDetail` (training/services.ts:412) | requireCoach + requireClientOf |
| POST `clients/[relId]/status` | `setClientStatus` (:460) | requireCoach (no grant needed) |
| GET `clients/[relId]/performance` | `clientPerformance` (:347) | requireCoach + requireClientOf |
| GET `clients/[relId]/intelligence` | `clientIntelligence` (intelligence.ts:210) | requireCoach + requireClientOf |
| POST `proposals/[id]` | `decideProposal` (intelligence.ts:282) | requireCoach + org match + requireClientOf |
| GET `clients/[relId]/health` | `clientHealth` (followup:299) | coachRelation (not ended) + `health` grant for full data; logs `data_access_log` read |
| GET/POST `clients/[relId]/access` | `accessStates` / `requestAccess` (followup:284/259) | coachRelation; 7-day cooldown after a denial |
| GET/POST `clients/[relId]/goals`, POST `goals/[id]` | `server/training/goals.ts:45/52/87` | requireCoach + requireClientOf |
| GET `clients/[relId]/charges` | `coachpay/services` | (coach pay) |
| GET `inbox` | `coachInbox` (followup:203) | requireCoach |
| POST `requests/[id]/resolve` | `resolveRequest` (followup:248) | requireCoach + request belongs to org |
| GET `messages` | `coachThreads` (messages/services.ts:95) | staff_membership role `coach_owner` |
| GET/POST `programs` | `listTemplates` / `createTemplate` (:165/:130; idempotent import by `opId`) | requireCoach |
| GET/PUT/DELETE `programs/[pid]` | `getProgram` / `saveProgram` / `archiveProgram` (:181/:198/:244) | requireCoach + `loadProgram(orgId,…)` |
| POST `programs/[pid]/assign` | `assignProgram` (:260) | requireCoach + requireClientOf per client + rel active |
| POST `programs/[pid]/duplicate` | `duplicateProgram` (:232) | requireCoach |
| GET `programs/[pid]/last` | `coachProgramLastTimes` (:636) | requireCoach + requireClientOf (soft) |
| GET/POST `programs/[pid]/rollout` | `templateRolloutPreview` / `applyTemplateRollout` (template-rollout.ts:52/77) | requireCoach |
| POST `programs/[pid]/paste-day(/preview)`, GET `paste-targets` | `server/training/day-copy.ts:43-109` | requireCoach |
| POST `programs/draft` | `coachProgramDraft` (:624) | requireCoach; AI or rules (`draftProgram`); rate limit 20/h |
| POST `programs/import` | `programImportPreview` (`listLibrary` checks the coach) | AI read limits 30/h global, 30/day per user |
| GET/POST `library`, `set-types` | `listLibrary` / `coachCreateExercise` / set-types | requireCoach |
| `agenda`, `payments`, `import` (CSV of clients) | agenda.ts, coachpay, access/import.ts | requireCoach |
| GET/POST/DELETE `/api/substitutions/[orgId]` | `server/training/substitutions.ts` `requireAuthor` | coach → requireCoach; gym → `program.edit` |

### 1.2 Gym
- **Page** `app/gym/[orgId]/page.tsx`. Guard: `requireOrgMember(orgId, "gym", …)`, which checks membership only, not role. It renders `components/gym/GymApp.tsx`.
- **Nav by role and capability**: `navFor()` in `GymApp.tsx:39-81`.
  - owner → `exec, locs, pc, staff, reviews, community, validations, joins, accesses, billing, config`. **No `members`.**
  - manager → `mdash, pc, staff, tasks, reviews, shifts, engage, members, community, validations, joins, accesses`.
  - `floor.work` → `shift, queue, joins, members, handoff, msgs, perf`.
  - coordinator adds `staff, pc, tasks, shifts`.
  - With Connect on: `queue` is renamed "Sala" and `team.read` adds `connect`.
- **Key components**: `Floor.tsx` (Mi turno, cola, traspaso), `Members.tsx` (member sheet; mounts `IntelSection kind="gym"` at `:132` only when `trainingShared && canEdit`; editor with `ProposalBanner` at `:205,255`), `Connect.tsx`, `Manage.tsx`, `Perf.tsx`, `Owner.tsx`, `FloorNow.tsx`, `Notices.tsx`.
- **Gym API**: a single catch-all, `app/api/gym/[orgId]/[...path]/route.ts`. GET switch at `:50-128`, POST at `:130-220`, rate limit `gym:${me}` 120/min. Plus `app/api/gym/[orgId]/programs/import/route.ts` (needs `program.edit` through `gymLibrary`).
  - Relevant GET paths: `context` (roles, caps, locations, connect, accessControl), `shift`, `hours`, `queue`, `tasks` (manager), `handoff`, `members[/:id[/last|intelligence|program-days]]`, `team`, `shifts`, `perf[/me|/trainer/:id]`, `panel`, `engage`, `exec`, `config`, `messages`, `alerts`, `floor-now`, `connect/board|tasks/:id|report`, `notices`.
  - Relevant POST paths: `shift/start|close`, `tasks[/:id/take|complete|accept|reassign]`, `members/:id/program-draft|program|notes|conversation|day-copy`, `intel-proposals/:id`, `team/:id/after-hours|private`, `shifts`, `alerts/:id/ack`, `connect/availability`, `connect/tasks/:id`, `assistant` (owner AI guide).

### 1.3 REPI Admin
- **Page** `app/admin/page.tsx`. `requireUser` + `user.platformRole === "admin"`, otherwise `notFound()`. 2FA is policy-driven and currently not required (`packages/domain/src/access.ts:134-136`, D119).
- **UI** `components/admin/AdminApp.tsx`, a client component. `Screen = "summary" | "clients" | "leads" | "site" | "support" | "ideas" | "privacy" | "announcements" | "guide"` (`:53`). The nav array is at `:76`. Sub-components: `AdminSite.tsx`, `AdminAnnouncements.tsx`, `AdminGuide.tsx`. Shared UI helpers come from `components/gym/shared` (`Head`, `useLoad`, `fmt`).
- **API** `app/api/admin/[[...path]]/route.ts` (95 lines).
  - GET: `summary`, `announcements`, `site?days`, `clients`, `privacy`, `support?filter`, `contracts/:id[/payments]`.
  - POST: clients, contracts/* (accept, enable, suspend, trial, terms, payments, close, invite, update, access, connect, delete, responsible), announcements, support, privacy, leads, corrections. Rate limit `admin:${me}` 60/min.
- **Auth**: `requireAdmin(actorId)` (`server/commercial/services.ts:24-29`) checks `user.platformRole === "admin"` and returns a 404 otherwise. Every admin service calls it, for example `siteSummary` (`server/site/events.ts:56`).
- **Existing ops signals** (`adminSummary`, `server/commercial/services.ts:97-121`): clients and leads counts, `privacyPending`, `deniedLast7d` (audit `access.denied`), `pushFailedLast24h` (`notification_outbox.status='failed'`), support counts. Backup freshness is in `server/ops/backup-watch.ts` and is not shown in Admin. Error alerts come from `server/alerts.ts` `alertError`.
- **Per-org pilot toggles pattern**: `setClientConnect` / `setClientAccessControl` (`server/commercial/services.ts:207-230`) flip `organization.connect_enabled` and the access-control flag, with an audit row. Global flags live in `lib/features.ts` (`FEATURES`, `featureOn`; env `NEXT_PUBLIC_REPI_FEATURES`). It has no AC3 flag yet.

---

## 2. Permission model (precise)

### 2.1 Identity and membership tables (`db/schema.ts`)
- `user.platform_role` (`:22`): `'admin'` or null.
- `organization` (`:73`): `kind` coach|gym, `status`, `commercialStatus`, `isDemo`, `connectEnabled` (`:91`).
- `staff_membership` (`:145-157`): `userId, orgId, locationId (null = all sites), role ∈ owner|manager|coordinator|floor_trainer|reception|coach_owner, status active|revoked, afterHoursAccess`. Unique on (user, org, role, coalesce(location)). A person can hold several rows (several roles or several sites).
- `coach_client` (`:160-167`): `coachOrgId, userId, status active|paused|archived|ended`. Unique per (org, user).
- `gym_member` (`:170-180`): `orgId, locationId (main site), userId, status pending_consent|active|suspended|ended, accessUntil`. Extra sites are in `gym_member_location` (`:183`).
- `consent_grant` (`:293-307`): `userId, scope coach_client|gym_member, relationId, granteeOrgId, item, status`. Unique active on (relation, item).
  - Catalog: `packages/domain/src/access.ts:150-168`.
  - Coach items: `training` (locked), `measurements`, `health` (minor-restricted), `nutrition`, `progress_photos` (minor-restricted).
  - Gym items: `attendance_training` (locked), `rankings`, `measurements` (unavailable).
  - `resolveGrants` (`:171`) drops minor-restricted items for a minor without a guardian.
- `access_request` (`:925`) and `data_access_log` (`:941`): the coach asks for an item; the student sees the history (requested, granted, denied, revoked, read).
- `audit_event` (`:310`): actor, org, action, resource, result ok|denied|error, meta (no content).

### 2.2 Page guards (`server/access/guard.ts`)
- `requireUser(nextPath)` redirects to `/acceso`.
- `requireOrgMember(orgId, kind, nextPath)` (`:16-28`) requires any active staff row in the org with a matching `org.kind`, otherwise `notFound()`. **It does not check roles.** The gym page also enforces the 2FA policy for owners (currently off). Fine-grained checks happen in the API services.

### 2.3 API plumbing (`server/access/http.ts`)
- `handle(fn)` (`:57-77`):
  - Applies the CSRF check (`crossSiteWrite`).
  - Maps `AccessError` to JSON with its status.
  - **Writes `access.denied` audit rows on every 403/404** (`recordDenied`, `:27-37`).
  - Maps Zod errors to 400.
- `limit(bucket, max, windowMs)` is a DB-backed rate limit per bucket+IP (`util.ts:47-59`).
- `AccessError(code, message, status, data)` is defined in `util.ts:7`. `audit(tx, {...})` is in `util.ts:33-38`.

### 2.4 Coach authorization (`server/training/services.ts`)
```ts
requireCoach(actorId: string, orgId: string): Promise<Organization>            // :27
  // staff_membership role='coach_owner', status='active', organization.kind='coach' — else 404 not_found
requireClientOf(orgId: string, coachClientId: string, tx?): Promise<{ rel: CoachClient; name: string; userId: string }> // :37
  // coach_client.id + coachOrgId match AND status != 'ended' — else 404
  // AND consent_grant(relationId, item='training', status='active') — else 403 'no_grant'
```
- `coachRelation(actorId, orgId, relId)` (`server/followup/services.ts:35`) = requireCoach + relation not ended. **It does not require the training grant.** It is used for health and access requests.
- Health: `clientHealth` shows full injuries and pains only with the `health` grant. Otherwise it shows only pains the student shared one at a time (`coachSeesPain`, `packages/domain/src/followup.ts:37`). It writes a `data_access_log` "read" once per day.
- **Paused** relations still pass `requireClientOf` (reads are allowed). `assignProgram` requires `status === 'active'` (`:273`).
- A coach org has effectively **one coach** (`coach_owner`). There are no assistant-coach or collaborator roles.
- No coach service checks `organization.commercialStatus` or `status` for reads. `assertOperational` (`server/access/services.ts:113`) is only used for invitations.
- **What the coach sees** (`clientDetail`, `:412-457`):
  - grants list
  - active program (doc and version)
  - `wishes` (only shared ones; `sharedWishes`)
  - last 20 sessions with RPE, note, duration, volume
  - `changes` (skip/substitute **with reason, including `discomfort`**)
  - per-set notes
  - per-set logs (`sessionLogs`, `:387`; corrected flags from `training_correction`)
  - Coach-scoped history only. Imported history is excluded (`historyRows` with `coachClientId`; intelligence.ts:28-81 and :65 comment D132).

### 2.5 Gym authorization (`server/gym/services.ts` + `packages/domain/src/gym.ts`)
```ts
type GymCtx = { userId; name; org; roles: string[]; caps: GymCap[]; locationIds: string[] | null /* null = all sites */; afterHoursAccess: boolean;
                memberships: { role; locationId: string | null; afterHoursAccess }[] }      // services.ts:25
gymContext(actorId, orgId): Promise<GymCtx>   // :32  active staff rows in a gym org; else 404; 2FA policy for owner
need(ctx, cap: GymCap): void                  // :59  MUTATES ctx: keeps only memberships whose role has cap (and their sites); none → 403 'forbidden'
needRoles(ctx, roles: string[]): void         // :60  same, by role names
rolesAt(ctx, locationId): string[]            // :61  roles valid at a site (site-scoped or org-wide rows)
inScope(ctx, locationId): boolean             // :63
scopedLocation(ctx, locationId?)              // :66  picks an allowed site (or 404) and NARROWS ctx to memberships valid there
scopedLocations(ctx, locationId?)             // :74
gate(ctx, locationId, what, tx?)              // :119 ensureScheduledShift + activeShift at that site, or afterHoursAccess at that site (floor.work role) → else 409 'no_shift'; returns offShift
```
`need()` and `scopedLocation()` **mutate** the ctx: capability and site are narrowed together ("never combine role at A with site B", `:50`). Call order matters, and you must build a fresh ctx for each operation.

**Capability matrix** (`packages/domain/src/gym.ts:32-38`):

| cap | owner | manager | coordinator | floor_trainer | reception |
|---|---|---|---|---|---|
| floor.work | | | ✓ | ✓ | |
| member.read | ✓ | ✓ | ✓ | ✓ | |
| program.edit | | | ✓ | ✓ | |
| task.create | | ✓ | ✓ | ✓ | ✓ |
| task.reassign | ✓ | ✓ | ✓ | | |
| team.read | ✓ | ✓ | ✓ | | |
| shifts.plan | ✓ | ✓ | ✓ | | |
| reviews.read_named / reviews.moderate | ✓ | ✓ | | | |
| perf.own | | | ✓ | ✓ | |
| gym.config | ✓ | | | | |
| members.approve | ✓ | ✓ | | | ✓ |
| messages.floor | | | ✓ | ✓ | |
| members.validate / challenges.witness | | | ✓ | ✓ | |
| community.publish | ✓ | ✓ | | | |
| catalog.publish / reception.desk | ✓ | ✓ | | | ✓ |
| club.moderate, challenges.validate | ✓ | ✓ | | | |
| equipment.manage | ✓ | ✓ | ✓ | | |

Roles are not hierarchical. An owner **does not** have `floor.work`, `program.edit` or `messages.floor`.

### 2.6 Who sees what about a gym member

| Data | Function (file:line) | Required | Owner | Manager | Coordinator / floor | Reception |
|---|---|---|---|---|---|---|
| Member list (name, visits30, last session, program name) | `listMembers` :551 | member.read + site | API yes (no nav) | ✓ | ✓ | ✗ |
| Member sheet: weekly bars, **per-set logs of last 10 sessions**, institutional notes, active tasks (metadata), program doc + revisions | `memberDetail` :619 | member.read + site; logs/bars only if `attendance_training` | **API yes** | **✓** | ✓ | ✗ |
| Task summary, video and brief inside the sheet | `decorate(tasks, floor.work)` :652 | floor.work at site | ✗ | ✗ | ✓ | ✗ |
| Wishes, program brief prefill | :643-649 | program.edit at site + consent | ✗ | ✗ | ✓ | ✗ |
| Training Intelligence + proposals | `memberIntelligence` :598 / `intelMember` :602 / `decideMemberProposal` :612 | program.edit + site + `attendance_training` (403 `consent_required`) | 403 | 403 | ✓ | 403 |
| Last times per exercise (editor) | `memberLastTimes` :582 | member.read + consent (else `{}`) | ✓ | ✓ | ✓ | ✗ |
| Edit institutional program | `saveMemberProgram` :691 | program.edit + **gate()** (shift) + reason ≥3 chars | ✗ | ✗ | ✓ | ✗ |
| AI program draft | `memberProgramDraft` :677 | program.edit | ✗ | ✗ | ✓ | ✗ |
| Notes (write) | `addNote` :732 | floor.work; personal notes visible only to the author | ✗ | ✗ | ✓ | ✗ |
| Floor conversations with member | `floorThreads` / `access()` messages/services.ts:106/32 | messages.floor at the conversation's site | ✗ | ✗ | ✓ | ✗ |
| Request video | `authorizeVideo` followup:321 | floor.work at task site | ✗ | ✗ | ✓ | ✗ |
| Queue / my tasks / take / complete | `listQueue` :307, `takeTask` :368, `completeTask` :409 | floor.work (+ gate for take/complete) | ✗ | ✗ | ✓ | ✗ |
| Manager task list | `managerTasks` :456 | task.reassign; **metadata only, no summary or video** | ✓ | ✓ | coord ✓ | ✗ |
| Connect report | `connectReport` connect.ts:458 | team.read; aggregates only | ✓ | ✓ | coord ✓ | ✗ |
| Health, nutrition, body, private app, coach chats | `GYM_NEVER_SEES` :579; `tryPrivate` :834 always 403 + audit `private.read_attempt` | — | never | never | never | never |

**What owners and managers can NOT see:** intelligence and proposals, wishes and briefs, task summaries and videos, floor chats, request videos, health, the private coach program or chats, other staff's personal notes. **What they CAN see (risk R1):** `memberDetail.log` (per-set weight, reps, RIR, feel, note) and institutional notes, through `member.read` + `attendance_training`. D178 (`docs/DECISIONS.md:219`) talks about "Sala" only. D191 explicitly denies management access to intelligence. Treat `member.read` as **not** sufficient for any AC3 member-level insight.

### 2.7 Private coach vs gym separation
- `historyRows(... { coachClientId | gymMemberId })` (intelligence.ts:28) filters by relation. Imported history is used only for the student's own targets, never in coach or gym views.
- Connect `resolveContext` (connect.ts:41-62) keeps only `exerciseId` when the session belongs to a private coach program. `staffTask` (:310) only reads sets of gym-program sessions.
- Messages (`messages/services.ts:32-40`): a `coach_client` conversation is open only to the `coach_owner` of that org. A `gym_member` conversation is open only to `messages.floor` at that site. Owners and managers never read content.

---

## 3. Data shapes relevant to AC3 (`db/schema.ts`)

| Table | Line | Key columns / notes |
|---|---|---|
| `program` | 345 | `orgId, kind template|client_copy|member_copy|solo, coachClientId?, gymMemberId?, sourceProgramId, sourceVersionId, currentVersionId, archivedAt, createdBy`. **No origin/provenance column** (coach import only writes audit `program.imported` with meta `{opId, source, file, days, exercises}`, services.ts:143-146) |
| `program_version` | 361 | `number, name, weeks, note, locked, reason (gym revisions: reason required; coach: null), createdBy`. Locked when assigned or used; editing creates a new version (`writeProgramDoc` :216) |
| `program_day` / `program_exercise` | 392 / 399 | `detail jsonb` (ExerciseDetail) |
| `program_assignment` | 415 | exactly one of `coachClientId` / `gymMemberId`; one active per relation |
| `own_routine` | 376 | student-only; `origin jsonb ImportOrigin` (SI2 provenance; `packages/domain/src/program-import.ts:594`). **Not shared with coach or gym** |
| `training_target` | 541 | per-row targets (D191); `decision` accepted|modified|not_done, `seq`, `supersededAt`, `algoVersion` |
| `training_proposal` | 588-606 | one of coachClientId/gymMemberId; `exerciseId, kind load|reps|hold|review|deload|rest, payload {text, weightKg, reps, basis, trend, sessions}, algoVersion, status open|accepted|modified|rejected|kept, decidedBy, decidedAt, note`. Unique open per (rel, exercise, kind). **No link to the program version that applied it; no `source` (TI vs AC3)** |
| `session_exercise_change` | 661 | per session: `kind skip|substitute, substituteExerciseId, reason busy|no_equipment|discomfort|no_time|other` |
| `exercise_substitution` | 674 | org-level approved substitutions (coach / program.edit) |
| `student_request` | 908 | coach requests: `kind rutina|tecnica|consulta|programa, text, videoId, status open|done, brief jsonb` |
| `gym_task` | 1022-1062 | floor queue / Connect: `category, priority, status open|pending_acceptance|in_progress|follow_up|done|cancelled, source app|sala|traspaso|gerencia|recepcion|entrenador, summary, reason, context jsonb {exerciseId, exerciseName, sessionId, programExerciseId, setIndex, programName, fromSession, brief}, assigneeUserId, clientKey (idempotency), feedback` |
| `gym_task_event` | 1084 | append-only (trigger) task history; `note` (institutional) vs `memberNote` |
| `gym_handoff` / `gym_handoff_item` | 1064 / 1074 | shift handoff with per-task summary and acceptance |
| `gym_note` | 1100 | `kind institutional|personal` |
| `shift_plan` | 969 | planned grid code per (user, site, date) |
| `staff_hours` | 981 | weekly habitual hours per (user, site): `days[], from, to` |
| `shift_log` | 1005 | actual shift; `startedAt, endedAt, availability available|busy, source manual|schedule`; **unique one open per user** |
| `gym_floor_pick` | 995 | member picks a trainer on shift for the day |
| `floor_alert` | 1587 | "Que venga alguien"/feel alert: `gymMemberId, sessionId, setLogId (unique), exerciseName, feel, ackBy, ackAt` |
| `conversation` / `message` | 1176 / 1188 | client-id idempotent send |
| `notification_outbox` | 1569 | push queue with `dedupeKey`, `kind` enum, `status`, `readAt` |

---

## 4. Shifts / floor staff model

- **Planned**: `shift_plan` grid (codes M/T/N/P/F, `SHIFT_CODES` in `packages/domain/src/gym.ts:80-88`). Edited by `weekPlan` / `setPlanCell` (services.ts:801/819), which need `shifts.plan`.
- **Habitual hours** (D170): `staff_hours`. Set with `setStaffHours` (:262; own = `floor.work`, others = `shifts.plan`). A per-minute cron calls `syncScheduledShifts` (:231), which opens and closes `shift_log` rows with `source='schedule'`. `ensureScheduledShift` (:215) is also called lazily in `gate()` and `myShift()`.
- **Actual**: `shift_log`. `startShift` (:167; gym hours 06–22 AR enforced unless demo or `REPI_GYM_HOURS=off`) and `closeShift` (:499; with handoff). `closeShiftsAfterHours` (:185) runs from cron.
- **Handoff**: `closeShift` puts tasks in `pending_acceptance` for a named recipient, or back in the shared queue. `acceptHandoff` (:425). `staleHandoffs` (:529) flags tasks still unaccepted 30 minutes after the recipient's shift start (`HANDOFF_ESCALATE_MIN`).
- **Off-shift work**: `staff_membership.afterHoursAccess`, set by owner or manager with `setAfterHours` (:790). `gate()` then returns `offShift=true`, which is stored on the task (`completedOffShift`) and in the audit.
- **"On shift" definitions differ** (risk R3):
  1. `gate()` → `activeShift(userId)` + `ensureScheduledShift` (services.ts:114-125).
  2. `floorOnShift(orgId, loc)` (`server/join/services.ts:171-178`): open `shift_log` at the site AND role with `members.validate`. **No stale filter.** This is used for push targets of floor alerts, join requests and Connect.
  3. `onShift()` in `server/gym/floor-now.ts:14-20`: open `shift_log` started less than 14 hours ago (`STALE_SHIFT_H`). This is the member-facing "En sala ahora" list and `staffFloorNow`.
  4. `teamNow()` in connect.ts:239.

  AC3 "turnos efectivos" needs a single helper. Prefer `floorOnShift` + the stale filter + the `gymOpenAt` check.
- **Reads are not shift-gated**: `listMembers`, `memberDetail`, `memberIntelligence`, `decideMemberProposal`, `floorThreads`, `listAlerts`, `staffBoard` need only cap + site. Writes that are gated: `takeTask`, `completeTask`, `createTask(assignToMe)`, `saveMemberProgram`, Connect `staffAct` (through connect's own checks).
- **No responsible-trainer model** in gyms. Every `program.edit` user at the site can act on every member there. The only weak link is `gym_floor_pick` (the member's choice for the day) and the session's floor pick (`todaysPick`, used in `startSession`).

---

## 5. Floor requests ("Que venga alguien" and the queue)

- **Live floor alert**:
  - The member taps the feel `ayuda` ("Que venga alguien", `components/member/Workout.tsx:709-715`). `dificil`, `limite` and `molestia` also alert (`FEEL_ALERTS`, `packages/domain/src/commercial.ts:100`).
  - `logSet` (training/services.ts:1046) computes `raise` only for gym sessions (`s.gymMemberId`) when the feel is new.
  - After commit it calls `raiseFloorAlert` (`server/gym/alerts.ts:37-56`). Rules: drop if older than 10 minutes (`FLOOR_ALERT_MAX_AGE_MIN`); 10-minute cooldown per member except for `ayuda`; site resolved by `alertLocation` (reception check-in in the last 4 hours); insert into `floor_alert`; `enqueue(floorOnShift(...), {kind:'floor_alert', dedupe:'floor:<id>'})`.
  - Floor side: `listAlerts` (floor.work, last hour) and `ackAlert` ("Voy", idempotent, audited).
  - Persistent bell: `myStaffNotices` (`server/gym/notices.ts:19`) over `notification_outbox`.
- **Requests from the member app**:
  - Legacy queue: `createMemberTask` (services.ts:849) creates a `gym_task` with `source='app'`. For a program brief it dedupes onto the open `programa_nuevo` task.
  - REPI Connect (D126, per-gym flag): `connect.memberCreate` (connect.ts:64) takes `reason`, `context` (exercise/session refs) and `clientKey` idempotency. Staff side: `staffBoard` (:282), `staffTask` (:310; authorized context only), `staffAct` (:357), `connectReport` (:458, team.read aggregates), `connectSweep` (:512, cron reminders).
- **Coach requests**: `createRequest` (followup:97) creates a `student_request`. **It enqueues no push to the coach.** The coach sees it in `coachInbox` and the badge (`inboxCount`).

---

## 6. Existing Training Intelligence as the AC3 coach and floor substrate

- `relationIntelligence(rel: IntelRel = {kind:'coach'|'gym', id, userId}, now)` (intelligence.ts:228-278). It returns `{ formula, exercises: [{ exerciseId, name, prescribed, last, trend: Trend|null, proposal: ({id,status}&Proposal)|null, targets: {accepted, modified, not_done} }], adherence: {sessions28d}, programId }`.
  - Computes `fatigue` (≥4 of the last 12 rows with feel `limite` or RIR 0, `:249`), but only uses it to shape the proposal; it is not returned.
  - Persists a proposal only when `requiresCoach` or kind is `load`, `review` or `deload` (`:254`). Upsert on the open unique index.
  - Does not re-propose a proposal already decided with no newer session (`:259-261`).
  - **This is a GET with write side effects** (it inserts or updates `training_proposal`).
- Domain types (`packages/domain/src/intelligence.ts`):
  - `TrendKind = insufficient|progressing|plateau|declining|variable|stable|effort_up|returning` (:412)
  - `Trend {kind, confidence, sessions, text, basis}` (:413)
  - `ProposalKind = load|reps|hold|review|deload|rest` (:441)
  - `Proposal {kind, text, weightKg, reps, requiresCoach, basis}` (:442)
  - `nextProposal(...)` (:448)
- Decision: `decideProposal` (coach, :282) and `decideMemberProposal` (gym) both call `recordDecision` (:292). Only `status, decidedBy, decidedAt, note` change, plus an audit `training_proposal.<status>`. The routine is untouched.
- Review flow (UI only):
  1. `IntelSection.onReview` calls `stashTiDraft` (sessionStorage `repi:ti-draft`) and opens the existing editor.
  2. The editor shows `ProposalBanner`. "Aplicar" patches only the draft, and only for uniform work sets (`draftPatches`, `canApplyLoad`/`applyLoad`).
  3. Save goes through `saveProgram` (coach) or `saveMemberProgram` (gym, reason required): new version, attributed.
  4. **Nothing links the saved version back to the proposal.**

---

## 7. Where AC3 fits (recommendations)

### 7.1 Coach insights
Create a new service `coachInsights(actorId, orgId)` in `server/training/` or a new `server/intelligence/coach.ts`. It starts with `requireCoach`, then reads per relation only after `requireClientOf` passes; skip relations that throw `no_grant`.

| Insight (spec §14) | Data available today | How |
|---|---|---|
| "Hay una propuesta pendiente" | `training_proposal` status `open` with `coach_client_id`. Today it is only materialized when the coach opens the client's `rend` tab | Aggregate query joined to `coach_client.coachOrgId = orgId`, status not `ended`, active `training` grant. Show in `CoachDash` "Pendientes" and as a badge on the client row. Recommend materializing proposals in a background job (cron or after `sessionAction('finish')`) instead of only on GET |
| "Más dificultad en las últimas sesiones comparables" | `Trend.kind` `declining`/`effort_up`/`plateau` + the internal `fatigue` heuristic in `relationIntelligence`; `workoutSession.rpe`; `set_log.feel`/`rir` | Expose `fatigue` and trend kinds from `relationIntelligence` (add fields; do not duplicate the rules). Domain helper in `packages/domain/src/intelligence.ts` |
| "Rechazó tres veces una sustitución" | **Not recorded.** Only *chosen* substitutions (`session_exercise_change`) and proposal decisions by staff | Needs a new event: student dismisses a suggested alternative or AC3 proposal. Store it in AC3 memory/event tables with provenance. Note that a `discomfort` reason is health-adjacent (R5) |
| "Rutina importada con indicaciones completadas manualmente" | Coach import: only audit `program.imported` meta. Student import: `own_routine.origin` (private, never shared) | For coach-imported programs, add a provenance column or table at import save (`createTemplate` with `imported`). For a student's own imported routines, **do not show** to the coach unless a new consent exists (`own_routine` is explicitly private) |
| "Solicitó revisar la distribución semanal" | `student_request` kind `rutina`/`programa` (+ `brief`) | Already in `coachInbox`. An AC3 "prepared query" should create a `student_request` only after explicit student confirmation (spec: never send as the student without confirmation) |

### 7.2 Draft proposals for coach review (spec §14, "Recomendaciones al entrenador")
- Reuse `training_proposal` and add, in an additive migration:
  - `source text default 'ti'` ('ti'|'ac3')
  - `scope` / `target jsonb` for reps range, rest, exercise swap, weekly distribution and volume. Today's `payload` only holds `weightKg` and `reps`.
  - `appliedVersionId text null`
  - `expiresAt`
  - Possibly widen the `kind` enum: `rep_range|rest|swap|distribution|volume`.
- Keep the invariant: a decision never edits the program. Apply = the existing editor via `TiDraft`, extended for new kinds. Today `draftPatches` only handles load. Have `saveProgram` / `saveMemberProgram` accept an optional `fromProposalId` to set `appliedVersionId`, write the audit and fill `program_version.reason`.
- Coach-owned programs: AC3 autonomy levels never auto-apply (spec §12). The action engine should refuse any action whose target `program.kind ∈ client_copy|member_copy` unless the actor is the coach or `program.edit` staff.

### 7.3 Floor coach intelligence (spec §15, continuity between shifts)
- Authorization: reuse `intelMember` (services.ts:602): `program.edit` + site + `attendance_training`. **Add an effective-shift requirement** (or `afterHoursAccess`) for AC3 floor views if the spec's "turnos efectivos" is taken literally, using a single `effectiveShift()` helper (R3).
- Slots:
  - `Members.tsx` sheet, next to `IntelSection` (`:132`).
  - Connect `staffTask` detail (connect.ts:310), as "related pending proposals for this member" and a "why" explanation.
  - `closeShift` / `handoffOptions` (services.ts:474/499): an AC3 handoff summary built only from institutional data (task events, open proposals). **Never** from health, private-coach data or chats.
  - `myStaffNotices` for in-app, non-push notices.
- Managers and owners get **aggregates only** (a `connectReport` analog). Never member-level AC3 output.

### 7.4 REPI Admin, AC3 ops view (spec §24)
- Add `Screen` `"ac3"` (e.g. "Coaching IA") in `AdminApp.tsx:53,76`, a component `components/admin/AdminCoaching.tsx` modeled on `AdminSite.tsx`, and a GET `app/api/admin/[[...path]]/route.ts` → `a === "coaching"` → `server/intelligence/ops.ts` `coachingOps(me, days)`, starting with `requireAdmin`.
- **Data does not exist yet.** It needs an append-only `ai_call` / `coach_event` table: model, tokens in/out, cost estimate, latency, outcome, fallback-used, circuit state, validation failures; no prompt content, no PII. Today `aiJson` (`server/ai/openai.ts:17`) logs errors only. Existing no-AI audits that can feed "resolved without AI": `adaptive.solo_plan` meta `usesAI:false` (`server/training/adaptive.ts:33`), `program.ai_draft` / `member_program.ai_draft` meta `byRules`.
- Limits configuration: follow the `setClientConnect` per-org toggle pattern (audit row) plus `lib/features.ts` for global kill switches (add `ac3`).
- Must show only aggregates, with no member names. Spec: "No crear gráficos de métricas inventadas".

---

## 8. Gaps vs the AC3 spec

1. No cross-client aggregation of insights or proposals for coaches. Proposals are created lazily on GET of a single client's intelligence.
2. No record of *rejected* substitution suggestions or rejected AC3 suggestions by the student. Only accepted substitutions (`session_exercise_change`) and staff decisions on proposals exist.
3. `training_proposal` only models load/reps text. It has no reps range, rest, swap, distribution or volume target, no `source`, no `appliedVersionId`, no expiry, and no link to the resulting `program_version`.
4. Coach-imported program provenance is not persisted (only audit meta). A student's imported routine provenance is private and cannot be shown to coaches without a new consent.
5. No push to the coach for new student requests, pains or proposals. Coach notifications are badge-only (`inboxCount`).
6. No AI usage, cost, budget or circuit-breaker data anywhere. The owner assistant (`server/gym/owner-assistant.ts:63`) and program drafts are rate-limited only (`limit(...)`).
7. No unified "effective shift" helper. Floor reads are not shift-gated.
8. No responsible-trainer assignment for gym members (any `program.edit` user at the site). Continuity between shifts exists only for tasks (handoff), not for coaching context.
9. Admin has no engine-status, error-rate or latency views. Backup freshness is not shown in Admin.
10. No multi-coach or assistant roles in coach orgs. "Coach & floor-coach collaboration" across orgs (a private PT plus the gym floor for the same student) has **no shared channel by design**: data is strictly separated per relation.
11. Coach services do not check `organization.commercialStatus` for reads (suspended orgs keep working).

## 9. Risks

- **R1 (privacy):** `memberDetail` (services.ts:619-657) returns per-set logs (`log`, line 651) and institutional notes to any `member.read` role, i.e. **manager and owner** (the owner through the API even without a nav entry). AC3 must not build on `memberDetail` for member insights; gate on `program.edit` like `intelMember`. Consider whether D178 intended this.
- **R2 (side effects on GET):** `relationIntelligence` writes `training_proposal` during a GET. Calling it from AC3 batch jobs or fan-out across clients multiplies writes and races. Open-unique indexes make it safe, but it is costly. Factor it into a pure "compute" step and a separate "persist" step.
- **R3 (shift semantics):** three or four definitions of "on shift" (see §4). Push targets (`floorOnShift`) can include stale open shifts. Floor-now hides them after 14 hours.
- **R4 (`need()` mutates ctx):** reusing a ctx after `need()` / `scopedLocation()` silently narrows roles and sites. Any new AC3 gym service must call `gymContext` fresh per operation and check `inScope(ctx, member.locationId)` after `need`.
- **R5 (health-adjacent leakage):**
  - `session_exercise_change.reason = 'discomfort'` is shown to the coach in `clientDetail.changes` without the `health` grant.
  - `floor_alert.feel = 'molestia'` is shown to the floor.
  - AC3 insights such as "rejected substitution due to discomfort" or LLM summaries must treat these as health. Show them only with the `health` grant (coach) or as an operational alert (floor). Never include them in AI prompts.
- **R6:** `inboxCount(orgId)` (followup:238) has no actor check. It is safe only because `overview` calls `coachOverview` first. Do not reuse it from AC3 routes without `requireCoach`.
- **R7:** `coachInbox` lists `student_request` rows from **ended** relations too (`rels` not filtered by status; only pains and check-ins are filtered).
- **R8:** `requireOrgMember` (page guard) checks only membership, not role. All real enforcement is in services. New AC3 server components or pages must call the service guards.
- **R9:** Proposal acceptance is an orphan state ("Aceptada: todavía no se aplicó"). Without `appliedVersionId`, AC3 cannot tell "accepted and applied" from "accepted, never applied".

## 10. Tests to extend (apps/web/tests, DB tests — see the CLAUDE.md warning about `global-setup.ts`)
- `gym.test.ts`, `training-intelligence.test.ts`, `training-intelligence-hardening.test.ts`: these already cover `memberIntelligence`, `decideProposal`, `tryPrivate` and cross-site/org 404s. Add cases for AC3 coach-insight aggregation (no `training` grant → excluded; ended relation → excluded), manager/owner 403 on AC3 member insights, other site → 404, off-shift floor (if gated), and `appliedVersionId` linkage.
- `connect.test.ts`, `floor-now.test.ts`, `staff-hours.test.ts`: shift semantics.
- `denied.test.ts`: confirms `access.denied` audit for new routes.
- Admin: there is no dedicated admin route test file. `annex.test.ts`, `commercial-delivery.test.ts`, `support.test.ts`, `experience-hub.test.ts` and `security-launch.test.ts` exercise `requireAdmin`-guarded services and are the pattern to copy.
