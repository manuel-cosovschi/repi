# AC3 audit: tests, CI and operations

Audited against code at `claude/adaptive-coaching-3` (HEAD `b72a6d1`, which is `main` `08d4a50` plus the AC3 master prompt commit). I only read files. I did not edit the repo, run DB tests or apply migrations. Paths are relative to `/home/user/repi` unless they start with `/`.

---

## 0. TL;DR

- **Two test runners.** `packages/domain` runs Vitest 5 on colocated `src/*.test.ts` (43 files, 491 tests at D207) with no config file. `apps/web` runs Vitest on `tests/**/*.test.ts` (75 files, about 11k lines) against **one real Postgres database, `repi_test`**. The schema is recreated **once per run**, not per file, and files run serially.
- **There is no fixture or factory library.** Every integration test file defines its own `verified()`, `coachWorld()`, `member()` or `world()` helpers by calling real services (`signUpPerson`, then OTP from `dev_mailbox`, then `createCoachOrganization` / `createGymOrganization`, then invite and accept, then `createTemplate` and `assignProgram`). Some files insert rows directly instead.
- **AI test pattern.** Delete `OPENAI_API_KEY` to force the rules path, or set it to a fake value and `vi.stubGlobal("fetch", …)`. `setup-env.ts` does **not** strip `OPENAI_API_KEY`.
- **CI** (`.github/workflows/ci.yml`) runs `pnpm typecheck`, then `test:guards` (node:test, no DB), then `pnpm test` (domain plus web on the runner's `repi_test`), then `pnpm build`. **No E2E, no lint, no OpenAI key.** CI triggers on PRs and on pushes to `main` only.
- **E2E** (Playwright, `apps/web/e2e`, 22 specs) runs only by hand: a local `next build && next start` against `repi_dev`, with Chrome. Each test opens a fresh `is_demo` world via `POST /api/demo`. `assertLocalTarget` blocks remote hosts. E2E files are **not type-checked** (outside `tsconfig.include`).
- **Backups.** The «Respaldo» workflow (`.github/workflows/backup.yml`) can be triggered by `workflow_dispatch` (input `motivo`) or by an **owner-opened issue titled «Respaldo: …»**. Output: release tag `backup-YYYYMMDD-HHMMSS-<runId>` marked `<!-- repi-backup:verified -->`. The issue is closed with the link when the run succeeds. It is mandatory before any production migration.
- **Hosted migrations** use a hand-written, transactional `apps/web/scripts/operations/hosted-00NN.sql`, run as `postgres` with a temporary `SET ROLE repi_app`. It enables RLS explicitly, asserts inside a `do $$` block and records the drizzle hash plus journal `when`.
  - Each one is rehearsed with `verify-00NN.sh` on a `repi_verify_00NN` copy of `repi_dev` and comes with a `scripts/rollback/00NN_*.down.sql`.
  - It is applied **before** merge, because Vercel auto-deploys `main`.
  - The next migration is **0050**; production has 50 rows in `drizzle.__drizzle_migrations`.
- **Production smoke** uses guided demos only (`POST https://repiclub.com/api/demo`, 20 per hour per IP, 6 h TTL, purged by the minute cron).
  - Previous smoke scripts lived outside the repo, in the session scratchpad.
  - Data is verified with read-only SQL "fingerprints" (`huella`) of real data before and after.
  - The deployment is confirmed with `GET /api/version`.
- **Tooling in this session.** The `gh` CLI token is **invalid**: use the GitHub MCP tools. The Vercel MCP returned 403 in past sessions; use `/api/version` instead. The Supabase MCP was used for read-only checks.

---

## 1. Unit and integration test layout

### 1.1 `packages/domain` (pure TypeScript)

- `packages/domain/package.json`: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`. Vitest 5.0.3.
  - There is **no `vitest.config`**, so the default include `**/*.test.ts` applies.
  - Exports `"."` → `src/index.ts` and `"./*"` → `src/*.ts`, so the web app can import `@repi/domain/tokens`.
- `packages/domain/tsconfig.json`: `lib: ["ES2022"]`, `types: []`, `include: ["src"]`. **No DOM or Node types**: domain code must stay pure. A test that needs Node writes `/// <reference types="node" />` (see `src/program-import.fixtures.test.ts:1`).
- Tests are colocated as `src/<module>.test.ts` (43 files). The ones relevant to AC3:

  | File | What it covers |
  |---|---|
  | `src/adaptive.test.ts` | `planSolo`, `autonomyAllows`, `validateProposal`, with the `SoloContext` fixture inline |
  | `src/intelligence.test.ts` | 44 cases |
  | `src/progression.test.ts` | |
  | `src/load-safety.test.ts` | |
  | `src/prescription.test.ts` | |
  | `src/execution.test.ts` | |
  | `src/sync.test.ts` | |
  | `src/progress.test.ts` | |
  | `src/program-import*.test.ts` | |
  | `src/goals.test.ts` | |
  | `src/stages.test.ts` | |

- Fixtures:
  - `packages/domain/tests/fixtures/three-year-history.ts`: `createThreeYearHistory()` and `createThreeYearPhotoHistory()`, each returning `{ text, sets: ImportSet[], firstDay, lastDay }`. Synthetic data: 730 sessions over 3 years.
  - `packages/domain/fixtures/import/`: 18 fictitious documents (txt, csv, xlsx, pdf, jpg, png) plus `LEEME.md`.
  - `seguridad-instrucciones.txt` is the **prompt-injection fixture**. It is a routine with an embedded line that tries to make the parser add exercises and grant admin. It is asserted inert in `src/program-import.fixtures.test.ts:71`. AC3 can reuse it for case 39 / 64.
  - `src/image-fixtures.ts` provides in-memory image bytes (`enc`). It is not exported from `index.ts`.
- **Convention for AC3 domain code.** Put new pure modules (context builder, relevance and dedupe, memory expiry, autonomy, safety classifier, injection sanitizer) in `packages/domain/src/*.ts` with colocated tests, and export them from `src/index.ts`. Inject `now: Date` (the existing `planSolo(ctx)` takes `ctx.now`).

### 1.2 `apps/web` Vitest

`apps/web/vitest.config.ts` (lines 1–14):

```ts
resolve: { alias: { "@": "./src" } },
test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup-env.ts"], globalSetup: ["tests/global-setup.ts"],
        fileParallelism: false, testTimeout: 20_000, hookTimeout: 60_000 }
```

**`apps/web/tests/setup-env.ts`** runs in every worker, before `@/db` is imported. In order:

1. `process.loadEnvFile("../.env.local")`, in a `try` block, so the file is optional.
2. `process.env.DATABASE_URL = assertTestDatabaseTarget(TEST_DATABASE_URL, DATABASE_URL, process.env)`. From here on, **the app's `db` points to `repi_test`.**
3. Deletes `RESEND_API_KEY` and sets `MAIL_DRIVER=dev`, so mail goes to the `dev_mailbox` table.
4. Defaults `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `ROSTER_HMAC_SECRET`, and sets `REPI_GYM_HOURS=off`.
5. **Gap: it does not delete `OPENAI_API_KEY`.** A developer `.env.local` that holds a real key would let an un-stubbed AC3 test call OpenAI and spend money. CI has no key.

**`apps/web/tests/global-setup.ts`** runs once per `vitest run` and is destructive:

1. Loads `.env.local` (optional), then `assertTestDatabaseTarget(...)`.
2. Asks the server `select current_database(), host(inet_server_addr())` and checks it with `assertLocalDatabaseIdentity(identity, "repi_test")`. This second barrier defeats tunnels and aliases.
3. `drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`
4. `runMigrations(url)`, from `apps/web/scripts/migrate.ts:7`. It applies `drizzle/` with the drizzle migrator, then runs `alter table … enable row level security` on every public table that lacks it.

**Guards** in `apps/web/scripts/lib/database-target.ts`:

- `assertTestDatabaseTarget(url, applicationUrl?, env)` at L29:
  - Throws if `NODE_ENV=production`, `REPI_DEPLOY` or `VERCEL` is set.
  - Requires the exact path `/repi_test` on `localhost`, `127.0.0.1` or `[::1]`, with no query string or hash.
  - Requires that it differ from `DATABASE_URL`, even across localhost aliases or different users.
- `assertSeedDatabaseTarget(url, env)` at L42: the same check, but for `repi_dev`. Used by `scripts/seed-demo.ts:8`.
- `assertLocalDatabaseIdentity(identity, "repi_dev" | "repi_test" | "repi_restore_check")` at L49: the server address must be `127.0.0.1`, `::1` or `::ffff:127.0.0.1`.
- Errors never echo URLs or credentials.
- **Gap: `scripts/migrate.ts` (`pnpm db:migrate`) has no target guard.** It migrates whatever `DATABASE_URL` holds. `docs/DESPLIEGUE.md:46` still documents running it against the hosted session URL, but since D187 the practice is `hosted-*.sql`. Do not use `migrate.ts` against production.

**Isolation model.** All test files in one run share a single `repi_test`. Data accumulates across files, which run serially. The existing conventions:

- Unique emails: `` `${prefix}${++n}.${Date.now()}@test.repi.local` `` or `` `${randomUUID()}@test.repi.local` ``.
- Global catalog rows such as `exercise` use `insert(...).onConflictDoNothing().returning()`, falling back to a select by name (for example `tests/adaptive.test.ts:25-28`).
- `beforeEach(() => resetRateLimits())`. Rate limits live in the database (`app_rate_limit` and `rate_limit`, `src/server/access/util.ts:41-59`), so they leak across tests otherwise.
- Sweeps and crons (`connectSweep`, `remindProgramBriefs`, `closeIdleWorkouts`, `purgeSandboxes`) **see rows from other files**. Assertions use `toBeGreaterThanOrEqual` or filter by the IDs the test created. `tests/sandbox.test.ts:49` asserts `purgeSandboxes()` returns exactly `1`. **An AC3 test that leaves an expired `demo_sandbox` behind would break it.**

### 1.3 How integration tests create users, orgs, programs and sessions

Only one shared fixture exists: `apps/web/tests/fixtures/brief.ts` exports `BRIEF` (program-request preferences). Everything else is a per-file helper.

**Verified person (most common).** Real signup, then the real OTP read from the `dev_mailbox` table, then Better Auth verification. Copied in `adaptive.test.ts:16-22`, `coach-workflow.test.ts:19-25`, `gym.test.ts:19-25` and `program-import.test.ts:20`:

```ts
const email = `ad${++n}.${Date.now()}@test.repi.local`;
const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" }); // adult
const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
return { id: r.userId!, email };
```

`signUpPerson` lives at `src/server/access/services.ts:27`. The `birth` field (dd/mm/yyyy) controls adult, minor or unknown age; omitting it gives unknown age.

**Raw person (faster, no auth).** Used in `condition-notices.test.ts:12` and `security-launch.test.ts:10`:

```ts
await db.insert(schema.user).values({ id, name, email: `${id}@test.repi.local`, emailVerified: true, ...extra }); // e.g. { platformRole: "admin", twoFactorEnabled: true }
```

**Coach org plus client plus program.** From `adaptive.test.ts:35-47` and `coach-workflow.test.ts:50-67`:

```ts
const org = await acc.createCoachOrganization(coach.id, { brand: `Coach … ${n}` });   // services.ts:68
const inv = await acc.inviteCoachClient(coach.id, org.id, { email: u.email });       // services.ts:185
const rel = await acc.acceptInvitation(u.id, inv.code, []);                          // services.ts:320 → rel.relationId (coach_client.id)
const pid = await tr.createTemplate(coach.id, org.id, { name, weeks, note, days: [{ name, exercises: [{ exerciseId, name, sets, reps, rir, restSec, detail? }] }] });
await tr.assignProgram(coach.id, org.id, pid, { coachClientIds: [rel.relationId], startsOn: localDate(new Date()) });
```

**Gym world.** From `gym.test.ts:36-58`: owner, two locations, manager, floor trainers, reception and an active member with consent.

```ts
const org = await acc.createGymOrganization(owner, { name });                         // services.ts:85
const [A] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: "Palermo" }).returning();
await db.insert(schema.staffMembership).values({ userId, orgId: org.id, locationId: A.id, role }); // manager|floor_trainer|reception|coordinator (owner/coach_owner also exist)
const [m] = await db.insert(schema.gymMember).values({ orgId, locationId, userId, status: "active" }).returning();
await db.insert(schema.consentGrant).values({ userId, scope: "gym_member", relationId: m.id, granteeOrgId: org.id, item: "attendance_training", termsVersion: "t" });
```

Gym programs go through `gym.saveMemberProgram(staffId, orgId, gymMemberId, { reason, doc })`.

**Commercial client.** From `condition-notices.test.ts:17`: `cm.createClient`, then `recordAcceptance`, then `enableClient`, then insert a `staffMembership`.

**Training session.** From `training-intelligence.test.ts:47-49`, `prescribed-weights.test.ts:54` and others:

```ts
const t = await tr.myTraining(user); if (t.state !== "ready") throw …; const dayId = t.program.days[0].id;
const sid = randomUUID(); await tr.startSession(user, { id: sid, dayId }, now?);
const pe = (await tr.getSession(user, sid)).exercises[0];
await tr.logSet(user, sid, { id: randomUUID(), programExerciseId: pe.id, setIndex: 0, weightKg: 60, reps: 8, rir: 2, feel? }, now?);
await tr.sessionAction(user, sid, "finish");
```

Own routines go through `@/server/training/own-routines`. Smart Import goes through `previewRoutineImport` and `saveImportedRoutines`.

**Permission and denial assertions.** Wrap the call to capture the error, for example `const err = async (p) => p.then(() => null, (e) => e as AccessError)` in `gym.test.ts:26`, then compare `code` or `status`. Denials are also checked through `audit_event` rows (`tests/denied.test.ts`). Audit rows are written via `audit(tx, { actorUserId, orgId, action, resourceType, resourceId, result, meta })` (`src/server/access/util.ts:31`). For example, `adaptive.test.ts:58` asserts the `adaptive.solo_plan` events with `meta.usesAI === false`.

### 1.4 Seams useful to AC3 tests

- **AI.** `src/server/ai/openai.ts` exports:
  - `aiOn()`, which is `!!OPENAI_API_KEY`;
  - `aiModel()` and `aiFastModel()` (env `OPENAI_MODEL` / `OPENAI_MODEL_FAST`, default `gpt-4.1-mini`);
  - `aiJson<T>({ name, system, parts, schema, maxTokens, effort, timeoutMs, fast, requireComplete })`. It throws `AccessError` with code `ai_unavailable` (503), `ai_incomplete`, `ai_refused` or `ai_bad_output` (422).

  It reads no `usage` tokens. Tests use three patterns:
  - `withoutAi(fn)`, which deletes the key (`adaptive.test.ts:30`, `program-import.test.ts:35`).
  - A fake key plus `vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason }] }))))` (`program-import.test.ts:195-250`, `training-safety.test.ts:91-123`). It covers HTTP 500, invalid JSON and `finish_reason: "length"`.
  - `vi.mock("@/server/ai/openai", () => ({ aiJson: vi.fn(), aiOn: vi.fn(() => true) }))` (`history-import-read.test.ts:5`).
  - Clean up with `afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); })`.
- **Time.** Services take `now`, as in `closeIdleWorkouts(at)` (`adaptive.test.ts:224`), `remindProgramBriefs(new Date(...))` (`gym.test.ts:441`) and `startDemo(role, now)`. `vi.useFakeTimers()` is used only for pure timers (`rest-alert.test.ts:8`). AC3 proactive, quiet-hours and expiry functions should take `now` the same way.
- **Feature flags.** `featureOn(f)` in `src/lib/features.ts` re-reads `process.env.NEXT_PUBLIC_REPI_FEATURES` on every call. Tests can therefore `vi.stubEnv("NEXT_PUBLIC_REPI_FEATURES", "<ac3key>")`. `tests/features.test.ts` asserts default-off modules.
- **Route handlers.** Most tests call services with a `userId`. Route tests import the handler and mock what is around it, as in `tests/history-import-job-route.test.ts:3-27`:
  - `next/headers`, `@/server/auth` (`auth.api.getSession` returning `{ user: { id } }`), `@/db`, `@/server/log` and `@/server/access/util`;
  - then call `POST(new Request(url, { method, headers: { origin: "https://repiclub.com", "content-type": "application/json" }, body }), { params: Promise.resolve({...}) })`.

  CSRF is checked in `handle()` (`src/server/access/http.ts:62`, tested in `tests/csrf.test.ts`). Rate limiting uses `limit(bucket, max, windowMs)` (`http.ts:21`) and `rateLimit(key, max, windowMs)` (`util.ts:41`).
- **Privacy export and deletion.** `tests/privacy.test.ts` covers `pv.exportMyData(userId)` and `pv.requestDeletion` (`@/server/privacy/services`). AC3 memory and chat must be added to the export, and asserted to exclude other people's data (`privacy.test.ts:13-34` is the pattern).

### 1.5 `test:guards` (node:test, no DB, also part of the backup autoprueba)

`apps/web/package.json` script: `tsx --test tests/safety/database-target.check.ts tests/operations/guards.check.ts tests/operations/retention.check.ts tests/operations/github-oidc.check.ts tests/theme/theme-tokens.check.ts`.

| File | What it checks |
|---|---|
| `tests/safety/database-target.check.ts` | The `database-target.ts` guards |
| `tests/operations/guards.check.ts` | `localTarget`, `backupRoot`, `safeStorageKey` and `checkedManifest` from `scripts/operations/guards.ts:8-51` |
| `tests/operations/retention.check.ts` | Retention rules |
| `tests/operations/github-oidc.check.ts` | The OIDC claim checks for the Edge Functions |
| `tests/theme/theme-tokens.check.ts` | Theme guard: no hard-coded colors (hex, `rgb`, `hsl`, old palette vars) in themed CSS (`member.css`, `coach.css`, `gym.css`, `method-editor.css`, `access.css`, `globals.css`) or in `src/components/**/*.tsx`; every `var(--ui-*)` used must exist; Light and Dark must define the same tokens |

The theme guard exempts lines marked `theme-fixed` or `theme-fixed:start/end`. **New AC3 UI must use only `--ui-*` tokens or CI fails.**

---

## 2. E2E (Playwright)

- **Config** (`apps/web/playwright.config.ts`):
  - `testDir: "e2e"`, `workers: 1`, `retries: 0`, timeout 60 s.
  - `baseURL = E2E_BASE_URL ?? http://localhost:3000`, `channel: "chrome"` (present at `/usr/bin/google-chrome`).
  - `locale: "es-AR"`, timezone `America/Argentina/Buenos_Aires`, `reducedMotion: "reduce"`.
  - Projects `mobile` (Pixel 7) and `desktop` (1366×860).
  - Reporters: list, plus JSON to `e2e-results/results.json`. `apps/web/e2e-results/` is gitignored.
- **Prerequisites.** Run `pnpm build && pnpm start` in `apps/web`, with `DATABASE_URL` pointing to a migrated local `repi_dev`, then `pnpm e2e`. **CI does not run it.** Specs are outside `tsconfig.include`, so they are not type-checked.
- **Helpers** (`apps/web/e2e/helpers.ts`):
  - `assertLocalTarget(baseURL)` (L6) throws unless the host is localhost. Each spec calls it in `beforeAll`.
  - `openDemo(page, role: "owner"|"floor"|"member"|"coach")` (L17) posts to `/api/demo` with a random `x-forwarded-for` (to dodge the per-IP limit locally), stores `repi:tour:<role>` in sessionStorage to close the tour, and navigates to `href`.
  - `dismissTour`.
  - `watchErrors(page)` (L35) collects console errors, page errors and same-host 5xx responses. Tests assert it ends up empty.
  - `expectNoHorizontalOverflow(page, where)` (L44).
  - `expectAccessible(page, info, name)` (L60): axe with WCAG 2.0–2.2 A/AA tags. It fails on serious or critical violations and attaches the JSON.
- **Specs** (22): `api-auth-sweep`, `coach-methods`, `coach-workflow`, `connected-stages`, `emom-sync`, `experience-ux`, `join-pending-staff`, `member-workout`, `mobile-layout`, `offline-reload`, `own-routine-create`, `personal-progress`, `prescribed-weights`, `public`, `roles`, `template-rollout`, `theme-admin`, `theme-visual`, `theme`, `training-intelligence-roles`, `training-intelligence`, `weight-edit`. Patterns AC3 must reuse:
  - **`api-auth-sweep.spec.ts`** walks every `src/app/api/**/route.ts`. Without a session, every exported method must return 4xx (not 2xx or 5xx), except the allow-list `GET /api/access/locations` and `GET /api/demo/me`. **Every new AC3 route is auto-swept**, so it must reject anonymous calls. The spec also checks cross-site writes return 403 `cross_site`.
  - **`offline-reload.spec.ts`** and **`training-intelligence.spec.ts`**:
    - `context.setOffline(true)`, then log sets, reload offline, reconnect;
    - assert that `page.request.get('/api/me/sessions/:id')` shows no server rows while offline and exactly one set after sync;
    - assert the UI never shows «Guardado» while offline.

    This is the template for AC3 "offline-first" and "no AI on the device" checks. The local server has no OpenAI key, so everything comes from rules.
- **Demo API.** `apps/web/src/app/api/demo/route.ts`:
  - `POST` with body `{ role }` validated by zod `DEMO_ROLES`.
  - `limit("demo-start", 20, 3_600_000)`: **20 demos per hour per IP**. On Vercel the IP comes from the platform header and cannot be spoofed.
  - `startDemo(role)`, then `auth.api.signInEmail(d.signIn)` (sets the cookie), then `sealDemo(d.tag)`, then the cookie `repi_demo=<role>` (6 h).
  - Returns `{ href, role, expiresAt }`. `GET /api/demo/me` gives the current demo role or `null`.
- **Sandbox world** (`apps/web/src/server/sandbox/services.ts`):
  - `DEMO_ROLES` (L22), `SANDBOX_TTL_HOURS = 6` (L23), `MAX_ACTIVE = 300` (L24, returns 503 `busy` above that).
  - `sandboxDomain(tag)` returns `demo-<10hex>.invalid` (L26). It never resolves, so no mail is ever delivered.
  - `startDemo(role, now)` (L38) builds everything with the real services:
    - a `demo_sandbox` row `{ tag, role, expiresAt, userIds[], orgIds[] }`;
    - 8 fictitious adults with `birthDate 1994-06-15`, `emailVerified` and `twoFactorEnabled`;
    - gym «Gym Norte» (`isDemo: true`, 2 locations, Connect on), with the members Valentina, Julián and Martina, gym programs, check-ins, Connect history and tasks;
    - a second gym, «Gym Sur», for isolation tests;
    - coach org «Agustín Pérez Coach» with `coach_client` relations and `training` consent for Vale, Julián and Martina, 2 templates and an assignment to Vale and Martina;
    - workout history (Vale 6 sessions, Martina 2), messages and charges.
  - **Vale (the `member` demo) has both a coach relation (the active one) and a gym membership.** This covers AC3 case 53 (relations in two organizations) inside one demo.
  - `href`: owner → `/gym/<org>?s=exec`, floor → `?s=shift`, coach → `/coach/<org>?s=dash`, member → `/app`.
  - `sealDemo(tag)` (L285) sets `twoFactorEnabled=true` on all users of the box. **Nobody can log into another persona of the same world afterwards.** Cross-role checks, such as the coach seeing the AC3 proposal of their own student, are impossible in one production demo.
  - `purgeSandboxes(now)` (L320, called by the minute cron) deletes, in one transaction per box: `workout_session` and `audit_event` for the box users, then `program` and `coach_client` for the orgs, then `organization`, then `user`, then `demo_sandbox`. **Any other table that references `user` or `organization` without `ON DELETE CASCADE` makes the purge fail.** The error is only logged (`logError("sandbox.purge")`), so the demo leaks and stays forever.
  - `demoRoleOf(email)` (L351).
- **Demo data is excluded from "real data"** only by `organization.is_demo` (schema L85), user emails `@demo-*.invalid` or membership in `demo_sandbox.user_ids`. **The `user` table has no `is_demo` column.**

---

## 3. CI (`.github/workflows/ci.yml`, 44 lines)

- **Triggers:** `push` to `main`, and `pull_request`. Concurrency `ci-${ref}` with cancel-in-progress. `ubuntu-latest`, timeout 20 min.
- **Env:**
  - `TEST_DATABASE_URL=postgresql://repi:repi-ci-only@localhost:5432/repi_test`
  - `DATABASE_URL=…/repi_dev` (not created, but it has to differ from the test URL)
  - `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ROSTER_HMAC_SECRET` (CI-only values)
  - `NEXT_TELEMETRY_DISABLED`
  - No `OPENAI_API_KEY`, no `NEXT_PUBLIC_REPI_FEATURES`, no `CRON_SECRET`.
- **Steps:**
  1. checkout, pnpm, Node 22 with the pnpm cache;
  2. L33 «Base descartable repi_test»: `systemctl start postgresql`, create role `repi` (superuser), `createdb -O repi repi_test`. This is the runner's own Postgres, so the identity guard sees `127.0.0.1`.
  3. `pnpm install --frozen-lockfile`;
  4. `pnpm typecheck` (`pnpm -r typecheck`, that is `tsc --noEmit` in both packages);
  5. L40 `pnpm --filter @repi/web test:guards`;
  6. L42 `pnpm test` (`pnpm -r test`: domain Vitest, then web Vitest with the global setup);
  7. `pnpm build` (`next build`).
- **Not in CI:** E2E, axe, lint, the inventory regeneration check, and any real AI evaluation.
- **Known flake:** `tests/gym.test.ts` «métricas desde eventos reales» (P2, noted in `PROXIMA_SESION.md`). Runner `apt-get` hangs have stalled CI and backups before (06/11).

---

## 4. «Respaldo» workflow (`.github/workflows/backup.yml`, 388 lines)

**Triggers (L18-40):**

- `schedule` at `17 6 * * *` (03:17 Buenos Aires) and `47 12 * * *` (backup turn, only if no daily backup exists for that UTC day).
- `workflow_dispatch` with input **`motivo`** (string, default `"manual"`).
- `issues: opened`. The run happens only if `author_association == 'OWNER'` and the title starts with **`Respaldo:`**.
- `pull_request` touching `.github/workflows/backup.yml`, `apps/web/scripts/operations/**`, `apps/web/tests/operations/**`, `supabase/functions/repi-storage/**` or `supabase/functions/repi-backup-credentials/**`. **Adding `hosted-0050.sql` or `verify-0050.sh` under `scripts/operations/` triggers the PR `autoprueba` job.**
- `permissions: {}`. Concurrency group `respaldo-produccion`, never cancelled.

**Jobs:**

1. **`habilitado`** (L54). Counts published releases whose tag matches `^backup-\d{8}-\d{6}-\d+$` and whose body contains `<!-- repi-backup:verified -->`. Output `ok`. Schedule runs wait for the first manual success and skip if a daily backup was already published today.
2. **`respaldo`** (L81), timeout 40 min, `contents: write` and `id-token: write`. Output **`tag`**. Steps:
   - Age recipients come from `vars.REPI_BACKUP_AGE_RECIPIENTS`, or from `apps/web/scripts/operations/backup-recipients.txt`.
   - Temporary read-only DB credential:
     - The job presents its OIDC token (audience `repi-backup-db`) to the Edge Function `https://qiamewdridgdvsyysmog.supabase.co/functions/v1/repi-backup-credentials?op=issue`.
     - That sets a random 2 h password on role `repi_backup` and connects through `aws-1-sa-east-1.pooler.supabase.com:5432`.
     - Fallback: the secret `REPI_BACKUP_DATABASE_URL`.
   - Disposable Postgres `repi_restore_check` plus `age`.
   - `pnpm --filter @repi/web ops:backup --source=hosted --storage --storage-auth=github-oidc --out=$RUNNER_TEMP/respaldo/plano`:
     - `scripts/operations/backup.ts` dumps **every table in `pg_tables` where `schemaname='public'`**, plus `drizzle.__drizzle_migrations`, in one `REPEATABLE READ READ ONLY` transaction (backup.ts:88-92).
     - It also copies Storage objects listed in `media_object`, and writes `manifest.json` with SHA-256 values last.
   - `backup-ci.sh pack` encrypts to the owner's key plus an ephemeral key.
   - `backup-ci.sh verify` decrypts the **encrypted** file, re-hashes, restores into `repi_restore_check`, checks every foreign key for orphans and requires 0 unvalidated constraints. It writes `informe.json` with `{ tables, rows, migrations, storageFiles, storageBytes, databaseSha256, databaseBytes, foreignKeys, invalidConstraints }`.
   - Publish:
     - create a **draft** release `backup-$(date -u +%Y%m%d-%H%M%S)-$RUN_ID` (in parts above 1900 MiB);
     - download it and `cmp` byte for byte;
     - PATCH to `draft=false`, `make_latest=false`.
     - The notes contain counts, hashes, `- Motivo: …` and the verified marker.
   - Heartbeat to `https://repiclub.com/api/cron/backup-heartbeat` (OIDC or `BACKUP_HEARTBEAT_SECRET`), plus an optional dead-man URL.
   - Encrypted artifact `respaldo-cifrado-<run>`, kept for 1 day.
   - Retention via `ops:retention`: the last backup of each of 30 days plus the first of each of 4 months.
   - Revoke the credential (`?op=revoke`). Clean up.
3. **`aviso`** (L244), `issues: write`:
   - For issue triggers, a success **closes the issue with the release link**; a failure comments «**No se migra.**» (do not migrate).
   - It opens, comments on or closes the alert issue «Respaldo de producción fallido».
4. **`autoprueba`** (L285, PRs from the same repo only):
   - `test:guards`;
   - checks that the Edge Functions return **404** to a PR OIDC token;
   - migrates and seeds a runner `repi_dev`, then runs the full pack, verify, draft-release and restore chain with test keys;
   - checks that a foreign key, a tampered file, a tampered part and a missing part are all rejected;
   - deletes the draft releases at the end.

**How to tell a backup is green:** the release exists with `<!-- repi-backup:verified -->`, and the request issue was closed by the workflow. Record the tag in the migration log, as in D207 (`backup-20261107-034900-42335519371`, issue #61).

---

## 5. Procedure from `docs/RESPALDOS.md` (summary)

- **Before every production migration** (§«Antes de cada migración productiva», L92-100):
  1. Request a backup, either via Actions, Respaldo, Run workflow with a `motivo`, or by opening an issue titled **«Respaldo: antes de la migración 00NN»**. Claude Code acts with the owner's account.
  2. Wait for green. If the issue gets a failure comment, **do not migrate**.
  3. Record the release tag.
- **Recovery** never writes over production. `restore.ts` writes only to a local `repi_restore_check` and verifies the server identity. A real disaster means restoring to a new Supabase project, which is the owner's decision.
- **Secrets:** none are required in GitHub (OIDC is used). Optional: `BACKUP_HEARTBEAT_SECRET` and `BACKUP_DEADMAN_URL`. The private age key is outside GitHub.
- **Pending (owner):** the schedule did not fire on 05/11 and 06/11 (Disable/Enable the workflow). A suggested `apt-get` timeout and retry is not implemented.

---

## 6. How earlier blocks applied hosted migrations and verified production

### 6.1 Artifacts per migration (0043–0049)

| File | Role |
|---|---|
| `apps/web/drizzle/00NN_<name>.sql` plus `drizzle/meta/_journal.json` entry `{ idx, tag, when }` plus `meta/00NN_snapshot.json` | Generated by `drizzle-kit generate`. The `db:generate` script needs `apps/web/.env.local` via `--env-file`, and **this container has no `.env.local`**. |
| `apps/web/scripts/operations/hosted-00NN.sql` | Hand-written, applied in production |
| `apps/web/scripts/operations/verify-00NN.sh` | Local rehearsal on a disposable copy |
| `apps/web/scripts/rollback/00NN_<name>.down.sql` | Reversal, used only if the feature is abandoned. The doctrine is to roll back code, not the migration (`docs/ROLLBACK_PLAN.md`). |

### 6.2 `hosted-00NN.sql` template (from `hosted-0049.sql` and `hosted-0046.sql`)

```sql
-- header: what, PRERREQUISITOS (Respaldo verde y reciente, previous migration applied), ADITIVA, compat of current prod code,
-- "Ensayado … verify-00NN.sh", "Generado desde drizzle/00NN_….sql (sha256 <hash>)"; after applying: "APLICADO … tras el respaldo <tag>"
begin;
grant repi_app to postgres with inherit false, set true granted by postgres;   -- run as postgres (Supabase SQL editor / MCP)
set local role repi_app;                                                         -- tables owned by repi_app (D186)
set local lock_timeout = '5s';
<statements of drizzle/00NN.sql without the --> statement-breakpoint markers>
alter table public."<each new table>" enable row level security;                  -- MANDATORY: migrate.ts does this locally, hosted path doesn't
do $$ begin  -- in-transaction assertions: tables/columns/indexes/constraints exist, RLS on, (optionally) no unexpected rows
  if … then raise exception '00NN: …'; end if;
end $$;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('<sha256 of drizzle/00NN file>', <journal "when">);
reset role;
revoke repi_app from postgres granted by postgres;
commit;
```

- The `hash` must equal `sha256sum drizzle/00NN_*.sql`; drizzle hashes the full file text. `created_at` must equal the journal `when`; the drizzle migrator compares `created_at` against `folderMillis`.
- **There is a precedent for forgetting RLS:** 0043 created `training_target` and `training_proposal` without RLS, and `hosted-0044.sql:7-8,31-33` fixed it later.
- Tables created as `repi_app` automatically get `SELECT` for `repi_backup` (`hosted-backup-role.sql`: `alter default privileges for role repi_app in schema public grant select on tables to repi_backup`). They also get no `anon` or `authenticated` grants, because Supabase defaults only cover tables owned by `postgres`. **Creating tables as `postgres`, as Supabase MCP `apply_migration` would, breaks ownership, backup reads and the RLS assumptions. Use the whole hosted file via the SQL editor or `execute_sql` instead.**
- New FKs to `user` or `organization` should be `ON DELETE cascade`, as in 0046: `body_goal_user_id_user_id_fk … ON DELETE cascade`. Otherwise demo purge and account deletion break (§2).

### 6.3 `verify-00NN.sh` template (from `verify-0049.sh`)

Run as root in the dev container. `PSQL=(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -h /var/run/postgresql)`. Steps:

1. Guard `DB=repi_verify_00NN`, and check that the hosted and down files contain the migration hash.
2. Terminate connections to `repi_dev` and `repi_verify_00NN` (**this kills a running dev server's connections**). Then `create database repi_verify_00NN template repi_dev`. `repi_dev` must already be migrated with the new migration.
3. Create role `repi_app` if missing. Put the copy in the production state: drop the new objects and delete the hash row from `drizzle.__drizzle_migrations`.
4. Transfer table and schema ownership to `repi_app`, and grant drizzle access.
5. Seed sample rows when the touched table is empty. Compute a fingerprint `count || md5(string_agg(... order by id))` of the touched tables. Assert `migs == <expected>` (**50 for 0050**).
6. Apply `hosted-00NN.sql`. Assert the fingerprint is unchanged, `migs+1` and the objects are present.
7. A second apply must fail as a whole, with no duplicate row.
8. Run the down script as `repi_app`. Assert the fingerprint and `migs` match the start.
9. Reapply.

Local databases present now: `repi_dev`, `repi_test`, `repi_restore_check` and `repi_verify_0046`…`0049`; roles `repi` and `repi_app`. Local Postgres is **16**; production is **17.11**.

### 6.4 Order used in D199–D207 (for example D207 in `docs/continuidad/PROXIMA_SESION.md:5-57`, PP1 at L186-262)

1. PR with CI green (the backup autoprueba is green too if `scripts/operations/**` was touched).
2. Backup issue «Respaldo: antes de 00NN», closed green, tag recorded (D207: #61, `backup-20261107-034900-42335519371`).
3. Apply `hosted-00NN.sql` in production **before merge**. Production code must already tolerate the migrated schema, which is "additive; current code does not read the column/table". The verification recorded:
   - migration count (50) and last hash, with no duplicate hashes;
   - owner `repi_app`, RLS on with no `FORCE`, `postgres` without `SET`, `repi_backup` can read;
   - no grants for `anon` or `authenticated`;
   - a hash of columns, constraints and indexes equal to the locally migrated database;
   - a real-data fingerprint equal before and after (PP1: `set_log` 217, `workout_session` 22, programs 41, versions 64, targets 94, all hashed; D207: hash of 6 real routines `dd6ab5fa…`).
4. Merge (squash). Vercel auto-deploys `main` only (`apps/web/vercel.json`: `git.deploymentEnabled: { main: true, "**": false }`, **no preview deploys**). Confirm with `curl -s https://repiclub.com/api/version` (returns `{ v: <12-char sha> }`, `src/server/version.ts`) and with GitHub deployment statuses. The Vercel MCP gave 403, so runtime logs were not readable.
5. Smoke in production **with demo accounts only**:
   - The script lived in the session scratchpad, not the repo: a Chromium emulating Pixel 7 plus desktop, calling `POST /api/demo` per role.
   - Checks: functional paths, `0 errores de página`, axe, 320 px, dark theme, simulated network cut without duplicates, foreign access returning 404, `/api/me/*` returning 401 without a session.
   - Real-data fingerprint unchanged afterwards. Count of "real users touched" = 0.
   - Exceptions: an age or minor check needed an SQL tweak on a demo user (in a transaction as `repi_app`, permission revoked afterwards). The coach weights check (D193) needed **two owner-authorized test accounts** with `scripts/operations/verify-coach-weights-prod.mjs`. That script imports `playwright`, which is not a direct dependency; use `@playwright/test` instead.
6. Feature flags: a new module is born **off** (`docs/FEATURE_FLAGS.md` «Regla para módulos nuevos»). It is turned on with the Vercel env `NEXT_PUBLIC_REPI_FEATURES=<key>` plus a redeploy, after its `RELEASE_READINESS.md` row is verified.
7. Post-publication backup, then update `PROXIMA_SESION.md` with the state, files, tests, migrations, decisions and next action.

### 6.5 Cron and jobs (where the AC3 proactive engine plugs in)

- pg_cron `repi-notifications` calls `GET https://repiclub.com/api/cron/notifications` **every minute** with `Authorization: Bearer CRON_SECRET`. The check is `cronAuthorized` in `src/server/cron.ts`; without the secret the route answers 404.
- The handler (`src/app/api/cron/notifications/route.ts`) runs isolated `step(name, run, fallback)` calls: escalate, demos (`purgeSandboxes`), trial, connect, shifts, scheduled, workouts, consent, brief, outbox (`processOutbox`), plus a backup watch at minute 7. **Any failed step makes the response 500.** An AC3 proactive step must be idempotent per minute and tolerate cron retries (AC3 case 49).
- `scripts/notifications.ts` (`pnpm jobs:notifications`) is a local subset. The Vercel cron runs only `purge-media` daily at 06:30 UTC.

---

## 7. Gaps against the AC3 spec (§24 metrics, §25 test plan, §26 delivery, §27 acceptance)

1. **No evaluation harness.** Nothing runs reasoning or explanation evaluations with expected outcomes (§24 «evaluaciones automáticas», «invariantes verificables»).
   - Needed: a domain-level eval suite, for example `packages/domain/src/coach-evals.test.ts` with a case table of input context, expected decision, forbidden claims and numeric bounds. It should be deterministic in CI.
   - Model-in-the-loop evals cannot run in CI (no key, and no spend without authorization). Run them as an opt-in local script behind an explicit env flag, never by default.
2. **No shared test factories.** All 70 cases in §25 would re-copy `verified()` and `coachWorld()`. Recommended: a new `apps/web/tests/fixtures/worlds.ts` with:
   - `verifiedPerson({ birth? })`
   - `coachWithClient({ program? })`
   - `gymWithMember()`
   - `trainedSessions(user, rows, at?)`
   - `withoutAi` / `withAiStub(responses)`
   - `withFeatures(keys)`

   Existing files stay unchanged.
3. **Production `aiJson` has no token or cost accounting** (`usage` is ignored). AC3 quota, budget and circuit-breaker tests need a seam: an injectable provider or a fetch stub that returns a `usage` field.
4. **`setup-env.ts` does not neutralize `OPENAI_API_KEY`.** That is a spending risk for local runs. Options: set `OPENAI_API_KEY` to a dummy value only inside tests that stub fetch, or add a guard that turns any non-stubbed call to `api.openai.com` into a test failure.
5. **No E2E in CI, and E2E is not type-checked.** AC3 acceptance requires «E2E aprobadas». It must be run locally and the evidence recorded (the JSON reporter output).
6. **There is no committed production smoke script** (previous ones lived in the scratchpad), and E2E hard-blocks remote targets by design. AC3 smoke needs a separate script, preferably committed under `apps/web/scripts/operations/`, that:
   - only calls `POST /api/demo`;
   - never logs in as real users;
   - prints no secrets;
   - stays under 20 demos per hour per IP.
7. **Cross-role production checks are impossible inside one demo** (because of `sealDemo`). Coach collaboration, floor coach and "manager cannot read individual memory" (cases 61–62) can only be verified in production with two owner-authorized test accounts (D193 pattern) or in integration tests. This decision belongs to the owner.
8. **Production demos cannot cover minors or unknown age without SQL edits** (all personas are born 1994-06-15). Push opt-in cannot be tested end to end with demos either: no push subscriptions, and `.invalid` emails.
9. **Demo purge is a blind spot.** `purgeSandboxes` hard-codes its deletion order. Any AC3 table with a non-cascading FK to `user` or `organization`, or one that references `workout_session` or `program` without a cascade, breaks the purge silently (only a log line). Extend `tests/sandbox.test.ts`: create AC3 rows for demo users, expire the box, purge, assert 0 rows remain.
10. **`migrate.ts` has no target guard**, and `docs/DESPLIEGUE.md:46` still shows the old practice of running it against the hosted session URL.
11. **The dev container has no `apps/web/.env.local`.** Every local command needs explicit env values: `TEST_DATABASE_URL=postgresql://repi:…@localhost:5432/repi_test`, a different `DATABASE_URL`, plus defaults. `pnpm db:generate` fails as written (`--env-file=.env.local`). Use `node ./node_modules/drizzle-kit/bin.cjs generate` with `DATABASE_URL` exported; generate does not connect.
12. **`gh` CLI token invalid** in this session, and earlier sessions saw 403 when re-running workflows. Backup requests, PRs and run status must go through the GitHub MCP tools (`issue_write`, `actions_list`, `actions_get`, `pull_request_read`, `get_job_logs`).
13. **Metrics and observability (§24 panel)** have no test infrastructure today. Only `audit_event` exists. AC3 needs tests that the admin panel shows aggregates only, with no student private data.

---

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The global setup **drops schemas** of `TEST_DATABASE_URL` | The guards are solid: exact `repi_test`, localhost, different from `DATABASE_URL`, server identity, no deploy env. Never weaken them, never point them at a shared server. |
| R2 | An un-stubbed AI call in a local test spends money | Neutralize the key in tests (gap 4). CI has no key. |
| R3 | A hosted migration forgets RLS or the ownership dance | Copy the 0046/0049 template. Assert RLS in `do $$`. Verify with `verify-0050.sh` and a read-only production check. |
| R4 | Merge before migration: Vercel auto-deploys `main` and the new code reads tables that are missing | Order: backup → `hosted-0050.sql` → merge. Keep the AC3 module behind a default-off flag as a second barrier. |
| R5 | Missing cascades break demo purge or account deletion | `ON DELETE cascade` on user and org FKs. Extend the sandbox test. |
| R6 | Shared `repi_test` across files makes sweep tests flaky | Inject `now`, scope by created IDs, use `>=` counts, avoid leaving expired sandboxes. |
| R7 | Proactive cron step not idempotent: the cron runs every minute and pg_cron retries | Dedupe key or unique index, plus a test that calls the step twice (case 49). |
| R8 | Backup autoprueba is triggered by any change under `scripts/operations/**` and needs `contents: write` (draft releases) | Expected. It must be green before merge. It only runs for same-repo PRs. |
| R9 | Runner `apt-get` hangs stall backups or CI (06/11) | Retry the backup issue. Never migrate without a verified tag. |
| R10 | Local Postgres 16 vs production 17 | Avoid PG17-only syntax. The verify script runs on 16. |
| R11 | Production smoke touching real data | Demos only. Fingerprint real tables (exclude `@demo-*.invalid` users and `is_demo` orgs) before and after. No writes as `postgres` except documented, authorized demo tweaks. |
| R12 | Demo rate limit and capacity during smoke (20 per hour per IP, 300 active) | Batch roles. Reuse one demo per role for several checks. |
| R13 | New UI with hard-coded colors fails `test:guards` (theme guard) | Use only `var(--ui-*)`. Barlow typography rule (`apps/web/AGENTS.md`). |
| R14 | New `/api/**` route answering 2xx anonymously fails `api-auth-sweep` | Every AC3 route goes through `handle()` plus session checks. Add it to `PUBLIC` only with justification. |

---

## 9. AC3 delivery checklist

### A. Local (dev container)

1. Build the environment without writing `.env.local`, or write one locally (it is gitignored):

   ```bash
   export TEST_DATABASE_URL=postgresql://repi:<pw>@localhost:5432/repi_test DATABASE_URL=postgresql://repi:<pw>@localhost:5432/repi_dev
   ```

   Check the local `repi` role password or `pg_hba` trust first. Never print it.
2. Inspect `apps/web/tests/global-setup.ts` before each DB test run, as `CLAUDE.md` requires. Confirm `TEST_DATABASE_URL` is the disposable `repi_test`.
3. Run `pnpm typecheck`.
4. Run `pnpm --filter @repi/web test:guards` (no DB).
5. Run `pnpm --filter @repi/domain test`. AC3 pure engines and evals go here, deterministic.
6. Run `pnpm --filter @repi/web test` (recreates `repi_test`). Before running, unset `OPENAI_API_KEY` or make sure every AC3 test stubs fetch or uses `withoutAi`.
7. Run `pnpm build`.
8. Generate the migration with `cd apps/web && DATABASE_URL=… node ./node_modules/drizzle-kit/bin.cjs generate`. Review `drizzle/0050_*.sql`, the journal and the snapshot. It must be **additive only**: new tables, nullable columns, indexes, cascading FKs.
9. Migrate local dev with `DATABASE_URL=<repi_dev> pnpm exec tsx scripts/migrate.ts` (from `apps/web`).
10. Write `scripts/operations/hosted-0050.sql` (§6.2 template), `scripts/rollback/0050_*.down.sql` and `scripts/operations/verify-0050.sh` (§6.3 template, expected `migs == 50`). Run `bash apps/web/scripts/operations/verify-0050.sh`. It must print the applied, retry-failed, reverted and reapplied lines with an unchanged fingerprint.
11. Run E2E: `cd apps/web && pnpm build && pnpm start` (`DATABASE_URL=repi_dev`, AC3 flag on via `NEXT_PUBLIC_REPI_FEATURES` at build time), then `pnpm e2e`. Include an AC3 spec with `openDemo` covering:
    - Home, per-set coaching, post-workout and chat;
    - offline and reconnect without duplicates;
    - axe, overflow, dark theme, mobile and desktop.

    Keep `e2e-results/results.json` as evidence.
12. Extend these tests:
    - `tests/sandbox.test.ts`: purge removes AC3 rows;
    - `tests/privacy.test.ts`: export and deletion include memory and chat;
    - `tests/features.test.ts`: new key default off.

### B. CI (automatic on the PR)

- `typecheck`, then `test:guards`, then `pnpm test` (domain plus web on the runner's `repi_test`, no AI key, default flags), then `build`.
- If `apps/web/scripts/operations/**` changed (`hosted-0050.sql`, `verify-0050.sh`), the **Respaldo autoprueba** also runs on the PR and must be green.
- Check status via the GitHub MCP (`pull_request_read` checks, `actions_list`, `get_job_logs`). The `gh` CLI is not authenticated here.

### C. Backup (before any production migration)

1. Open an issue with the GitHub MCP `issue_write` (it acts as the owner): title **«Respaldo: antes de la migración 0050 (AC3)»**. The alternative is `workflow_dispatch` on `backup.yml` with `motivo`.
2. Poll until the workflow closes the issue with `…/releases/tag/backup-YYYYMMDD-HHMMSS-<run>`. Confirm the release body has `<!-- repi-backup:verified -->`, the tables, rows and migrations (50), FKs with 0 orphans and 0 invalid constraints.
3. If it fails («No se migra»), stop. Retry with a new issue (runner flake) and never migrate on red.
4. Record the tag in `PROXIMA_SESION.md` and in the header of `hosted-0050.sql` («APLICADO … tras el respaldo <tag>»).

### D. Apply the additive migration safely (production, before merge)

1. **Pre-checks**, read-only SQL in production through the Supabase MCP `execute_sql`, selects only:
   - `select count(*) from drizzle.__drizzle_migrations` must be 50, and the last hash must be 0049's `714d9b7a…`;
   - the new tables must not exist;
   - capture the real-data fingerprint: counts and md5 of `set_log`, `workout_session`, `program`, `program_version`, `training_target`, `own_routine`, … excluding demo users and orgs.
2. Run **the whole `hosted-0050.sql`** as one statement batch as `postgres` (Supabase SQL editor or MCP `execute_sql`). **Never** use MCP `apply_migration`, and never use `scripts/migrate.ts` against production.
3. **Post-checks**:
   - 51 migrations with the last hash and `when` equal to the journal;
   - new tables owned by `repi_app` with RLS on;
   - `anon` and `authenticated` have no privileges, and `repi_backup` has `SELECT`;
   - `postgres` has no lingering `repi_app` membership with SET;
   - constraints validated, and the index set equal to the local migrated database;
   - fingerprint identical.
4. Only then merge the PR (squash). Wait for Vercel, then `curl -s https://repiclub.com/api/version` must equal the merge SHA prefix.
5. Rollback doctrine: promote the previous Vercel deployment (code only). The migration stays, since it is additive. Run the down script only if the owner abandons AC3, after a fresh backup.

### E. Smoke test production with demo accounts only

1. Use a committed or scratchpad script with Playwright `chromium` from `@playwright/test`, Pixel 7 plus desktop, `BASE=https://repiclub.com`. Per role, `POST /api/demo {role}` with `origin: BASE` (no spoofed IP; at most 20 per hour). Never use real credentials and never print cookies.
2. **Member demo (Vale).** Covers coach plus gym relations and a history of 6 sessions. Check:
   - AC3 on Home (or a justified silence);
   - per-set coaching during a workout, with prescribed weights respected and no auto timer changes;
   - post-workout summary;
   - chat question about the last best mark, matching the database;
   - memory export and delete;
   - prompt-injection text in a Smart Import routine stays inert;
   - offline set, then reconnect with exactly one row;
   - `watchErrors` empty, axe clean, 320 px, dark theme.
3. **Coach and owner/floor demos.** Check their AC3 views load and that other orgs' data returns 404. Cross-role checks within one world are not possible (sealed demos), so state that limitation, or ask the owner for authorized test accounts.
4. Anonymous: every new `/api/**` route returns 401 or 404, and a cross-site write returns 403.
5. AI in production: at most a handful of calls, within the budget the owner authorized. Verify the no-AI fallback path, for example when the model is unavailable or the budget is exhausted, through the feature or config path the build exposes, not by breaking production.
6. Read-only SQL afterwards:
   - the real-data fingerprint is unchanged;
   - AC3 rows exist only for `@demo-*.invalid` users;
   - 0 notifications were sent to real users;
   - demos are purged after 6 h (`demo_sandbox` count goes down, and no AC3 rows are orphaned).
7. Turn the AC3 flag on (`NEXT_PUBLIC_REPI_FEATURES` in Vercel plus a redeploy) only after its readiness row is verified; this may need the owner's action if the Vercel MCP is still 403. Then repeat the critical smoke.
8. Request a post-publication backup issue, then update `docs/continuidad/PROXIMA_SESION.md` with the state, files, tests, migration, backup tags, decisions and next action.
