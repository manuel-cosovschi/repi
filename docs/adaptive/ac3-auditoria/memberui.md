# AC3 audit · Member UI (app del alumno)

Branch `claude/adaptive-coaching-3`, HEAD `b72a6d1` (task said main `08d4a50`; code read at HEAD). Read-only audit. Paths are relative to `apps/web/` unless they start with `packages/` or `docs/`.

---

## 1. Entry, routing and navigation

### 1.1 Route
- `src/app/app/page.tsx:14-25`. Server component. It runs `requireUser("/app")` and then checks for an active `coach_client` (`schema.coachClient.status='active'`) or `gym_member` (`schema.gymMember.status='active'`). If the user has neither, it calls `redirect("/acceso")`. It renders `<MemberApp initialTab={searchParams.t} />` and imports `@/styles/member.css` and `@/styles/method-editor.css`.
- Other member route: `src/app/app/informe/page.tsx` (monthly report, linked from Progress at `MemberApp.tsx:788`).
- Query params handled on the client:
  - `?t=<tab>`: initial tab (`MemberApp.tsx:68`).
  - `?pedido=<id>`: opens the Connect panel sheet (`:96-98`).
  - `?gym=ch|club`: opens the Gym tab (`:100-101`).
  - `?completar=programa`: opens the program-request form on Home (`:488-494`).
  - All of them are cleared with `history.replaceState`.
- There is no `layout.tsx` under `app/app`. The root `src/app/layout.tsx` provides the fonts (Barlow, Barlow Condensed, JetBrains Mono via `next/font`), `THEME_BOOT`, `ThemeRuntime`, `DemoTour` and `UpdateWatcher`.

### 1.2 `MemberApp` (`src/components/member/MemberApp.tsx`, 1106 lines, `"use client"`)
- `export function MemberApp({ initialTab }: { initialTab?: string })` at `:67`. It is the only export. Everything else in the file is a local function component.
- Tabs: `type Tab = "home" | "train" | "prog" | "msgs" | "gym" | "perfil"` (`:46`).
  - The visible tabbar is built at `:309-310` as `[home "Inicio", train "Entrenar", prog "Progreso", msgs "Mensajes", gym "Gym" (only if inbox.gym)]`. Icons are Phosphor (House, Barbell, ChartLineUp, ChatCircle, Storefront).
  - **Perfil is not a tab.** The only way in is the avatar button in `Head` (`:400`), and `Head` is rendered only on Home (`:506`).
- Sub-navigation:
  - Progress segments: `type ProgSeg = "train" | "body" | "photos" | "hist"` (`:58`). "Mi cuerpo" = `body` (flag `body_weight`), "Fotos" = `photos` (flag `progress_photos`), "Historial" = `hist`. Segment tabs are built at `:762-772` with the `.gtabs` class and `role=tablist`.
  - Gym sub-tabs: `GymTab = "news" | "ch" | "shop" | "logros" | "club"` (`Gym.tsx:33`). Club needs `featureOn("club")`.
  - Train ("Entrenar") renders `RelationPicker`, `PresenceChip`, `FloorNow`, then `Train`, with `OwnRoutines` ("Mis rutinas") passed as the `own` prop (`:341-343`).
- Navigation helper: `go(x: Tab)` (`:193`). It saves the scroll position per tab (`scrolls.current`), clears `workout`, `gymTab` and `openCh`, and scroll is restored at `:191`.
- **Tab content is remounted on every tab change.** `<div key={tab} className="tab-pane">` (`:336`) wipes all section-local state when the user switches tabs. A persistent REPI panel must not live inside `.tab-pane`.
- **The workout replaces the whole tree.** `if (workout) return (...)` at `:315-320` renders `<Workout>` without the tabbar, without `<main>` and without the sheets. The main return is `:322-388`. Anything that must exist in both modes (the conversation panel, its state) has to be hoisted above `:315` and rendered in both branches.
- Global sheet state:
  - `type SheetState` (`:63-64`): `checkin | pain | help | injury | review | connect | connectPanel | presence`. Each is rendered after the `<nav>` at `:363-383`.
  - Separate state: `solo` (`:90`, Adaptive Coach phase 1), `notifOpen` (`:105`), `unlocks` (TrophyUnlock, `:77`).
- Toast:
  - `flash(msg)` (`:85`) shows a single slot for 2.8 s.
  - `<Toast>` (`:391-393`) renders an sr-only `aria-live="polite"` region plus a visual `.mb-toast`. It sits outside `.mb-col` on purpose (A11Y-1, `:385`) because `.mb-col` becomes `inert` while a Sheet is open.
- Notification center:
  - `type NotifDest` (`:59`): `{tab: home|msgs|perfil|train} | {tab:"prog", seg?} | {tab:"gym", gymTab: news|ch|logros} | {tab:"review", invite}`.
  - `type Notif` (`:61`) includes `origin?: "repi"` and `cta?`. `origin: "repi"` already means **product announcements (D202)** (`NotifSheet` `:446` shows a "REPI" label).
  - The server feed is in `src/server/notifications/feed.ts:21-27, 40, 122`.
  - `withProgramNotice()` (`:413-425`) adds the "program updated" notice on the client.
  - `pickNotif` (`:206-213`) is the routing extension point.

### 1.3 Shared top-level data (MemberApp)
| What | Where | API |
|---|---|---|
| Training (program, days, stats, relation, `ai` flag, `weightUnit`) | `load` `:111-142` | `GET /api/me/training` → `Training` (`types.ts:4-12`) |
| Offline copy | `saveTraining/loadTraining/ensureOwner/wipeLocal` from `@/lib/offline/store` | IndexedDB |
| Inbox (coach, checkinToday, accessRequests, requests, gym, gymRequests, reviewInvites, unreadThreads, gymUnseen) | `loadInbox` `:103` | `GET /api/me/inbox` (`type Inbox` `:47-56`) |
| Notification feed | `loadFeed` `:108`; mark seen `:199` | `GET /api/me/notifications`, `POST /api/me/notifications/seen` |
| Gym presence | `loadPresence` `:94` | `GET /api/me/gym/presence` |
| Trophies | `checkTrophies` `:78-82` | `GET/POST /api/me/level` |
| Live coach changes | 15 s poll `:156-175` (only while visible and online) | `GET /api/me/training/stamp` |
| History (Progress tab) | `loadHist` `:177-178` | `GET /api/me/history` |
| Reload on reconnect | `online` listener `:145-149` | — |
| Service worker | `:180-187`; `public/sw.js` caches only the shell and **never `/api`** | — |

There is no SWR or React Query. The convention is plain `api<T>()` (`src/lib/api.ts:5-15`, a POST when there is a `body`, throwing `ApiError(message, code, status, data)` with the server's Spanish message), plus `useState`, `useEffect` and `useCallback`. The only cross-component caches are module-level ones: Solo's `cached` (`Solo.tsx:25-34`) and Hint's `cache` (`Hint.tsx:9-14`).

`Training` also carries `ai?: boolean` (D184). The server sets it in `src/server/training/services.ts:672` as `ai: aiOn()`, which is `!!process.env.OPENAI_API_KEY` (`src/server/ai/openai.ts:6`).

---

## 2. Sections: components, data and APIs

| Section | Component (file:line) | Data / APIs |
|---|---|---|
| **Inicio** | `Home` `MemberApp.tsx:474-595` | Props from MemberApp. Own fetches: `GET /api/me/program-request` (`:486`), `Nudges` → `GET /api/me/gym/nudges`, `CommunityChallenges` → `/api/me/gym/community-challenges`, `Ideas` → `/api/me/support`, `NextAppointment` (`:924-959`) → `/api/me/agenda`, `ProgramNotice` (`:1048-1083`) → `/api/me/training/previous` on demand, `ConnectCard` → `/api/me/gym/connect…`, `NextOwnRoutine` (`OwnRoutines.tsx:290`) → `/api/me/routines` |
| **Entrenar** | `Train` `:618-646`; `DayTabs` `:654`; `DayDetail` `:690`; `DayBody` `:712-737` (shows `e.suggest` "Hoy:" at `:729`) | Training plus `OwnRoutines` (`/api/me/routines`), `FloorNow` (`/api/me/gym/floor`), `SoloEntry` (prefetches `POST /api/me/solo/ai`, see §5) |
| Workout (active session) | `Workout` `Workout.tsx:79-779`; `Done` `:799-870` | IndexedDB (`getLocal/putLocal`) plus the queue (`enqueue/flush/subscribe`, `src/lib/offline/queue.ts:8-16`). Also `GET /api/me/sessions/:id`, `/summary`, `/upgrade`, `/exercises?pe=` and `SessionCalories` → `/api/me/progress/calories/:id` |
| **Progreso** | `Progress` `MemberApp.tsx:748-808` | `ProgressTraining` (`ProgressTraining.tsx:61`; `/api/me/progress/summary?range=`, `/progress/exercises?q=`, `/progress/exercises/:id?range=`), `LevelPanel` (`/api/me/level`), `MyGoals` `:965` (`/api/me/goals`), `BeforeRepi` (`HistoryImport.tsx:29`, `/api/me/history-import`), monthly-report link |
| **Mi cuerpo** | `BodyWeight` `BodyWeight.tsx:26`; `ProgressPhotos` `ProgressPhotos.tsx:33` | `/api/me/progress/body?range=`, `/api/me/progress/photos`. Response `available:false, reason: "minor"\|"age_unknown"` (`BodyWeight.tsx:18`) shows `AgeGate` (`AgeGate.tsx:9`, `/api/me/birth-date`) |
| **Historial** | Segment `hist` `MemberApp.tsx:793-804`; `HistoryList` `History.tsx:45`; `HistorySession` (Sheet) `History.tsx:62` | `/api/me/history`, `/api/me/history/:id`, set edit/void routes |
| **Mis rutinas** | `OwnRoutines` `OwnRoutines.tsx:47` (inside Train); `NextOwnRoutine` `:290` (Home); `RoutineImportSheet` `RoutineImport.tsx:17` (SI2) | `/api/me/routines`, `/routines/:id/start`, `/routines/import`, `/routines/import/save` (idempotent with `opId`) |
| **Mensajes** | `MemberMessages` `Messages.tsx:10-48`, which reuses `Conversation` with `dark` from `src/components/messages/ChatPane.tsx:60-109` | `GET /api/messages` and `/api/messages/:id`, 10 s `usePoll` (`ChatPane.tsx:17-24`). No offline send queue. Human threads only (`coach_client` and `gym_member`) |
| **Gimnasio** / **Club** | `GymTabView` `Gym.tsx:37`; `Club` `:364`; `Feed` `:457` | `/api/me/gym/home`, `/api/me/gym/club…`, `/api/me/gym/ranking/:id` and others |
| **Perfil / ajustes** | `Perfil` `MemberApp.tsx:824-918` | `/api/me/privacy`, `/api/me/access/:id`, `/api/me/injuries/:id`, `MyCharges` `:1087` (`/api/me/charges`), `Wishes` (`Wishes.tsx:8`, `GET/POST /api/me/settings {wishes}`), `Settings` `:990-1012` (`POST /api/me/settings {weightUnit}`, plus `ThemePicker`), `MyData` `:1016` (`/api/me/deletion`, `/api/me/export`), `resetHints` |

Perfil order (`:851-915`):
1. coachnote
2. access requests
3. Salud (injuries)
4. Privacidad y permisos (`role=switch` rows)
5. Historial de accesos
6. MyCharges
7. **Wishes** (`:907`)
8. **Settings** (`:908`)
9. MyData
10. Install, Account, Help and "Cambiar de espacio" links
11. "Volver a ver las ayudas"
12. Cerrar sesión

---

## 3. Shared UI primitives and CSS

### 3.1 Components
- **`Sheet`** (`src/components/member/Sheet.tsx:13-76`). This is the member modal bottom sheet.
  - Props: `title, sub?, closeLabel="Cerrar", onClose, groups?: SheetGroup[] (chip groups), warn?, text?: {value,onChange,placeholder}, video?, children?, action?: {label, ready, busy?, onSubmit}`.
  - Portal to `document.body`.
  - Accessibility: `role=dialog aria-modal aria-label`, initial focus on the root, Tab trap, Esc closes, `.mb-col` set `inert` (`:43-45`), focus restored on close, `useScrollLock`, `useBackdropClose`.
  - If a `.modal-bg` exists or focus is outside the sheet, it ignores keys (`:34-35`).
  - `warn` renders as `role=alert`, placed above the action button when there is one (`:58, 70`).
  - **It is always modal.** It is not suitable for a non-blocking companion panel.
- `Modal` (`src/components/ui/Modal.tsx:9`). Desktop-style dialog that makes `<main>` inert.
- `Hint` and `useHintSeen` (`src/components/member/Hint.tsx:27-42`). First-time onboarding card (`aside.hint role=note`, "Entendido").
  - Seen state is stored locally (`localStorage repi:hints`) and on the server (`/api/me/hints`).
  - **The server only accepts keys from the allowlist `HINT_KEYS` in `src/server/settings/services.ts:58`**: `start_guide, ti_intro, history_edit, workout_nav, coach_start, gym_equipment, rest_intel, new_progress_body, new_progress_photos`. Any new REPI hint key must be added there.
  - Also used by `components/coach/CoachDash.tsx`.
- `Ic` (`src/components/ui/Ic.tsx:5-9`). Phosphor wrapper, always `aria-hidden`. Themed colors use `var(--ui-*)` through `currentColor`.
- `StepSlider` (`components/motion/StepSlider.tsx`): RIR and RPE.
- `Ambient` and `useReveal(settled)` (`components/motion/Ambient.tsx:15-45`). Ambient loading indicator that only appears after 180 ms. Used by Progress→Historial and Gym.
- `Confetti`, `BrandIntro`, `Carousel`, `TrophyUnlock` (`Trophies.tsx:101`).
- `SyncBadge`: `syncView()` and `syncInk()` (`SyncBadge.tsx:6-21`). Truthful save state.
- `UnitContext` and `useUnit()` (`units.ts`), plus `kg()`, `prevTxt()`, `metaTxt()` (`types.ts:29-32`). AI or rules text that contains weights goes through `localizeWeights(text, unit)` from `@repi/domain` (`Solo.tsx:111`, `Workout.tsx:641`).

### 3.2 Card and banner patterns (`src/styles/member.css`)
| Pattern | Class (line) | Used for |
|---|---|---|
| Hero "next workout" | `.today` (14-19) plus `.ui-dark` forced dark zone, `.play` (20) | Home `:523-530` |
| Empty or info card | `.dashed-card` (21-23) | Empty states |
| Surface tiles | `.tiles/.tile` (32-35), `.coachnote` (38-41), `.panel/.prow-dark` (247-252), `.pp-card` (963), `.pc-empty` (962) | — |
| Banner row | `.hbanner` (241-246), `.hbanner.cyan` (242); dot + `b/small` + `em` CTA | Home notices, Ideas, Gym |
| Accent card (AI) | `.ai-card` (553-566), `.ai-chip` (562-563), `.ai-reply` | Solo sheet. **Closest existing "REPI" visual** |
| Training-intelligence card | `.ti-card` (833-846), `.sg/.sg-row` (871+; `is-coach / is-repi / is-real / is-safety`), `.ti-rest` (848, 3-line clamp), `.ti-outlook` (850) | SetGuide, rest message |
| Nudge card | `.ndg/.ndg-card/.ndg-x` (737-751) | "REPI te propone" |
| Warning block | `.conflict` (181-183), `.sheet-warn` (233), `.mb-err` (172), `.mb-note` (186), `.offline-bar` (187) | — |
| Workout inline note | `.wo-stage` (828), `.wo-suggest` (606), `.coach-tip` (107) | — |
| Live pill | `.wo-live` (856-861) | "Entrenamiento en curso" |
| Buttons | `.cta` / `.cta.sm` (72-73), `.ghost` / `.ghost.sm` (74, 184), `.linkbtn` (85) | — |
| Chat | `.mb-chat .chat-log / .chat-bubble / .chat-compose` (290-309) | Messages |
| Tabbar | `.tabbar` (274-284, fixed, z 10, 62 px), `.tabfade` (285, z 9) | — |
| Sheet | `.sheet-bg` (191, z 40), `.sheet` (192) | — |
| Toast | `.mb-toast` (169, z 30) | — |

Layout: `.mb` (3) → `.mb-col` (4, max-width 480) → `.mb-scroll` (5, bottom padding 108 px for the tabbar; `.nobar` 6).

Workout layout:
- `.wo` (78), `.wo-body` (79), `.excard` (90).
- `.dock` (108): sticky bottom, `min-height: 178px`.
- `.wo-tools` (223-224).

### 3.3 Theme and tokens (light / dark / auto)
- `src/styles/tokens.css` is **generated** by `apps/web/scripts/gen-tokens.ts` (`pnpm tokens`) from `packages/domain/src/tokens.ts`. Do not edit it by hand.
- Theme selectors:
  - Light: `:root, .ui-light` (`tokens.css:77`).
  - Auto dark: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` (`:163-164`).
  - Forced dark: `:root[data-theme="dark"], .ui-dark` (`:251`).
- Fonts: `--font-ui` (Barlow), `--font-display` (Barlow Condensed). Section h1 uses display uppercase (`member.css:7`).
- Motion tokens: `--ease-*`, `--dur-*` (`tokens.css:57-72`).
- Theme picker: `ThemePicker` (`src/components/theme/ThemePicker.tsx`) offers light, dark and system. It is synced to the account through `@/lib/theme` and appears in Perfil → Configuración (`MemberApp.tsx:1009`).
- `globals.css`:
  - `:focus-visible` outline uses `var(--ui-focus)` (25).
  - `.sr-only` (30).
  - Global `prefers-reduced-motion` kill switch for all transitions and animations (31-33).
  - `.ui-dark, .ui-light { color: var(--ui-text) }` (44).

### 3.4 Theme guard tests (hard constraints)
`tests/theme/theme-tokens.check.ts`, run by `pnpm --filter @repi/web test:guards` (`tsx --test`, **not vitest**):
1. In `member.css, coach.css, gym.css, method-editor.css, access.css, globals.css`: no `#hex`, `rgb()/rgba()`, `hsl()` or `var(--dark-|light-|core-|semantic-|access-*)`, except on lines or blocks marked `theme-fixed` (`:12-13, 28-30`).
2. Every `.tsx` under `src/components` and `src/app`: no quoted hex (`"#…"`, `'#…'`, `` `#…` ``) and no `var(--dark|light|core|semantic|access-…)`. Exceptions are site, reception screens, dev mailbox, `renderSVG` lines and comment lines (`:32-44`). Inline styles must use `var(--ui-*)`.
3. The light and dark token sets must have identical keys, and `tokens.css` must be up to date (`:46-52`).
4. Every `var(--ui-xxx)` used anywhere (CSS or TSX) must exist in the theme (`:54-61`). A new color means adding the key to **both** light and dark in `packages/domain/src/tokens.ts` and running `pnpm tokens`.

Recommendation: build REPI surfaces with the existing tokens (`--ui-accent-tint`, `--ui-accent-line`, `--ui-surface-2`, `--ui-chip-info-*`, `--ui-warning-tint`) and no new tokens.

---

## 4. Conventions

### 4.1 Loading, error, empty and offline
- **Loading**:
  - `<p|span className="mb-muted">Cargando…</p>` (`MemberApp.tsx:335, 438`; `Messages.tsx:35`).
  - In sheets: `<p className="sheet-sub" role="status">…</p>` (`Solo.tsx:93,107`).
  - `Ambient` for panels that can be slow (`MemberApp.tsx:797`, `Gym.tsx:60`).
  - **Silent failure is common**: optional widgets `.catch(() => setX(null))` and render `null` (Nudges, NextAppointment, MyGoals, MyCharges, NextOwnRoutine).
- **Error**:
  - `<p role="alert" className="mb-err">{e.message} <button className="linkbtn">Reintentar</button></p>` (`MemberApp.tsx:327`, `ProgressTraining.tsx:121`, `BodyWeight.tsx:59`).
  - In sheets: the `warn` prop, or `.sheet-warn` with a Reintentar link (`Solo.tsx:108`).
  - Action errors go to `flash((e as Error).message)`.
- **Empty**:
  - `.dashed-card` with `<strong>` plus `<span>` (`MemberApp.tsx:536-540`).
  - Plain `.mb-muted` span with fontSize 14 ("Todavía no completaste entrenamientos.").
  - Rule: never invent data. Examples: "Datos insuficientes…" (`:778`); "Sin referencia" in SetGuide.
- **Offline**:
  - The `offline` boolean (from `offlineAt`) is threaded into every section.
  - Server-only widgets return `null`, a `dashed-card` ("Sin conexión. …") or `.pc-empty role=status`.
  - Actions call `flash("Necesitás conexión para …")`.
  - Workout keeps working fully offline through IndexedDB and the queue.

### 4.2 Copy and i18n
- **No i18n library.** All copy is inline Spanish (es-AR) with **voseo**: "Tocá", "Elegí", "Podés", "Necesitás", "Contale". Names of things go in «».
- Enumerated labels live in `@repi/domain` dictionaries: `SET_FEEL`, `EXERCISE_CHANGE_REASONS`, `REQUEST_KIND`, `TRAINING_WISH_GOALS`, `INJURY_STATUS`, `PAIN_ZONES`.
- Trainer wording:
  - `coachFirst` (`MemberApp.tsx:215`) is `"el equipo de sala"` for a gym relation, else the coach's first name or `"tu coach"`.
  - Grammar helper: `coachFirst.startsWith("el ") ? "al …" : "a …"` (`Workout.tsx:858, 860`).
  - Elsewhere the copy says "tu profe".
- Dates use `Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })`. Numbers use `toLocaleString("es-AR")` (decimal comma). Weights are stored in kg and displayed with `kg(w, unit)` and `localizeWeights`.
- AI disclosure precedent: Solo footer says "(lo procesa OpenAI) … Los cambios valen sólo por hoy; tu programa no cambia. Revisala: tu profe decide." (`Solo.tsx:137`).
- Safety precedent: PainSheet warn says "REPI no hace diagnósticos: si persiste, consultá a un profesional de la salud." (`FollowSheets.tsx:57-59`). Minors' copy: "Necesita autorización de tu adulto responsable."
- Code comments cite decision IDs (`D108`, `D138`, …). Keep the same habit.

### 4.3 Accessibility patterns
- Every section `<h1 tabIndex={-1}>`.
- Tabs:
  - `role=tablist/tab aria-selected` (`.gtabs`).
  - Day tabs add roving `tabIndex` and arrow, Home and End keys (`MemberApp.tsx:664-671`).
- `role=radiogroup` + `role=radio aria-checked`: RelationPicker, unit segment, wish goals.
- `aria-pressed` chips; `role=switch` privacy rows.
- Live regions:
  - AI card `aria-live=polite` (`Solo.tsx:106`).
  - Timers `role=timer aria-live=off`.
  - Save state `role=status`.
- Touch targets: 44 px minimum is applied in CSS (`.mb-icon`, `.linkbtn` heights, `.hint .linkbtn`).
- `prefersReducedMotion()` in JS plus the global CSS kill switch.
- e2e runs axe (WCAG 2.2 AA, serious and critical violations) on `member-home` and tabs 0-3 (`e2e/member-workout.spec.ts:22, 63`; `e2e/helpers.ts:60-67`), and checks for no horizontal overflow from 320 px (`e2e/theme-visual.spec.ts:46`).

---

## 5. Existing AI and "REPI" UI (inventory)

| Surface | File:line | Engine / API | Notes |
|---|---|---|---|
| **"No vino el profe, dame mi rutina para hoy" / "Quiero entrenar por mi cuenta"** | `SoloEntry` `Solo.tsx:36-44`. Rendered in `Train` at `MemberApp.tsx:627` (no program, `prefetch=false`) and `:635` (`prefetch={t.ai !== false}`) | Flag `featureOn("adaptive")` (`src/lib/features.ts:6`) | **Opening Entrenar prefetches `POST /api/me/solo/ai`** (OpenAI) once per day per page load (`Solo.tsx:37`). This is a cost driver; AC3 budgets must account for it |
| Solo sheet | `SoloSheet` `Solo.tsx:46-141`, state `solo` `MemberApp.tsx:90, 367-368` | `GET /api/me/solo?v=` → `SoloPlan` (rules, `usesAI:false`, `packages/domain/src/adaptive.ts:29-46`). `POST /api/me/solo/ai` → `Advice` (`Solo.tsx:16`). `POST /api/me/solo/ai {follow:{dayId,message,issues,turns≤4}}` re-plans (D138) | **The only conversational UI today.** Modal Sheet. Turns live in client state (`turns`, `.slice(-6)`) and are **lost on close**. No persistence, no feedback, no provenance badge per item. Rate limits are server-side (`api/me/solo/ai/route.ts:21-22`: 20/h, 60/day) |
| Accepted AI plan applied at start | `aiPlan` ref `MemberApp.tsx:223`; `begin()` `:271-297` | The swaps, skips and loads in Advice become session `change` and `suggest` | Already an "action with confirmation" precursor (the user taps "Empezar …") |
| No-program routine | `RoutineCard` `Solo.tsx:144-181` | `POST /api/me/solo/routine`, `/api/me/solo/routine/start` (`MemberApp.tsx:244-252`) | — |
| Per-set guide | `SetGuide` `SetGuide.tsx:17-72`, used at `Workout.tsx:583-590` | Training Intelligence 2.0 `RowTarget` (`ex.targets` from `/api/me/sessions/:id`, merged by `mergeIntel` `src/lib/offline/store.ts:69`) | Labels "Tu profe indicó / REPI recomienda / Anterior / Real (hoy)", plus a **"¿Por qué?" inline toggle** (`:65,68`) and safety notes. This is the best existing provenance pattern |
| Post-set message | Produced in `completeNow` `Workout.tsx:319-331` (`adjustAfterSet`, deduped with `intelSeen`). Shown during rest at `:641` (`.ti-rest`, with an optional "Sumar N s" button calling `addRest` `:512-513`) | Domain rules, **works offline**. `LocalSession.intel` (`store.ts:41`) | The seed of the in-workout companion. Visible **only while resting**. One message per exercise and event code |
| Next-session outlook | `Workout.tsx:728` (`.ti-outlook`) | `ex.outlook.proposal` (server) | Shown after the exercise is complete. Says "Lo decide tu profe." when `requiresCoach` |
| Day preview suggestion | `DayBody` `MemberApp.tsx:729` ("Hoy: …") | `e.suggest` (D154) | — |
| Training wishes | `Wishes` `Wishes.tsx:8-41` (Perfil `:907`) | `POST /api/me/settings {wishes}` | Feeds the AI. Includes `shareWithTrainers` |
| "REPI te propone" | `Nudges` `Nudges.tsx:24-58`, on Home `:543` and in `Done` `:845` | `GET /api/me/gym/nudges` | Dismissals go to **localStorage only** (`repi:nudges:off`, `:15-17`). Not synced; no "no mostrar algo parecido" |
| Smart Import (SI2) | `RoutineImportSheet` `RoutineImport.tsx:17-67`; `BeforeRepi` `HistoryImport.tsx:29` | `/api/me/routines/import(+/save)`, `/api/me/history-import` | Shared review UI is `components/shared/ProgramImport.tsx` |
| REPI announcements | `NotifSheet` `MemberApp.tsx:434-455` (`origin === "repi"`) | `/api/me/notifications` | The "REPI" label is already taken by product news |
| First-time explainer | `Hint id="ti_intro"` `SetGuide.tsx:69` | — | "«REPI recomienda» es una sugerencia calculada…" |

---

## 6. Recommended insertion points

### General architecture

**`RepiProvider` (new, for example `src/components/member/repi/RepiProvider.tsx`)**
- Mount it inside `MemberApp` **above** the `if (workout)` branch (wrap both returns at `:315` and `:322`), next to `UnitContext.Provider`. This keeps conversation and panel state across tab switches (`.tab-pane` remounts) and across workout mode.
- Expose a context with:
  - `open(context: { section, refs: {sessionId?, programExerciseId?, setIndex?, exerciseId?, routineId?} })`
  - `close()`
  - the cards cache
  - preferences
  - an `offline` flag
- The client sends only **identifiers**. The server validates them (AC3 §16).

**Panel host**
- Render `<RepiPanel/>` in both branches, as a sibling **after** `<nav>` (`:362`) and after `<Workout>` (`:317`).
- Do **not** use `Sheet` for the conversation panel. `Sheet` is modal, makes `.mb-col` inert and traps focus, which breaks "non-blocking".
- Use a portal with `role="dialog"`, `aria-modal="false"` (or `role="complementary"` when docked) and a z-index between the tabbar and sheets (for example 20; tabbar 10, toast 30, sheet 40).
- Close it, or mark it inert, whenever a `Sheet` opens. `Sheet`'s key handler ignores keys when focus is outside it (`Sheet.tsx:34-35`).

**Component family**
Build one family that reuses `.ai-card`, `.ti-card` and `.hbanner.cyan` styles plus a single new class prefix (for example `.rp-*`) in `member.css`, using tokens only:
- `RepiCard` (compact)
- `RepiInsight` (inline line)
- `RepiWhySheet`
- `RepiActionPreview`
- `RepiPanel`
- `RepiPrefs`

**Provenance chip**
Add one small chip with three values: "Registrado" / "Calculado por reglas" / "Sugerencia con IA" (AC3 §11 last line). Reuse `.hx-chip` or `.ai-chip` styles.

### 6.1 Compact REPI contextual card on Home
- **Where**: `Home` in `MemberApp.tsx`, right **after the next-workout block** (the `today` / `scheduled` / `NextOwnRoutine` ternary closing at `:541`) and **before** `<Nudges>` (`:543`). This puts it next to the primary action, on the first screen.
- **Rules**:
  - Show at most **one** card.
  - Hide it when `offline` (or fall back to a cached card with expiry).
  - Fold or replace `Nudges` on Home with the relevance engine's single top pick. Home already stacks 10+ widgets.
  - Dedupe against `ProgramNotice` (`:549`) and `withProgramNotice` (`:413`). AC3 "Tu entrenador actualizó tu rutina…" overlaps both, so the REPI card should own that message or suppress it.
- **Actions**: "Ver por qué" (opens `RepiWhySheet`), "Empezar" (call the existing `onStart(next.id)`; never add a second start path), "Hablar con REPI" (`repi.open({section:"home"})`), dismiss and "No mostrar algo parecido". Dismissals must be **server-side** (not localStorage like Nudges).
- **Props available**: `t` (Training), `inbox` (`checkinToday`, coach), `presence`, `offline`, `onStart`, `go`, `flash`.

### 6.2 Non-blocking training companion in Workout (`Workout.tsx`)

**Primary slot.** Extend the existing per-set guide: render `RepiInsight` directly **under `<SetGuide>`** inside `.excard` (after `:590`, before `.sets` at `:591`). Use it for the pre-exercise line ("La última vez hiciste 3 × 10 con 60 kg…") built from `curTarget`, `ex.prev` and `ex.detail`.

**Post-set slot.** The existing rest message at `:641` (`s.intel` → `.ti-rest`) is the natural place for "Después de cada serie" coaching.
- Generalize `LocalSession.intel` (`store.ts:41`) into a typed companion message with `{key, text, source: "rules"|"ai", restPlusSec, expiresAt, version}`.
- Keep the offline rules path (`adjustAfterSet`). AI text may only enrich it when online and must never block.
- The rest timer may change only through a user tap (`addRest`, `:512`). Keep that.

**Entry chip.** Add a "Preguntale a REPI" `linkbtn` in `.wo-tools` (`:719-723`), next to "Nota de la serie" and "Pedir ayuda a sala", with 44 px height. This opens the panel with `{section:"workout", sessionId:s.id, programExerciseId:ex.id, setIndex:cur}`.
- Do **not** add a floating button: the sticky `.dock` (`member.css:108`, min-height 178) and the 320 px layout would collide.
- Optionally add a header icon in `.nav2` (`:570-575`).

**"Máquina ocupada" / "poco tiempo".** Route these to the existing `ExerciseChangeSheet` (`:737`, `applyChange` `:452-468`, which enqueues `exchange`) as the action executor.
- Show the proposal first with `RepiActionPreview`, then confirm.
- For "poco tiempo", show a preview (keep / omit) and execute through the existing skip changes. Do not touch the future program.

**Performance and interruption.**
- `Workout` re-renders every 250 ms (`setNow`, `:172`). Memoize the companion and never fetch inside render. Fetch only on set completion or when the user opens it.
- Don't use `flash()` for coaching. It is a single slot and would overwrite "Serie actualizada" or sync toasts.
- No modal over an active set or countdown, except safety alerts.

### 6.3 Post-workout summary (`Done`, `Workout.tsx:799-870`)
- **Where**: after the hero, local note, `stats3` and PR blocks (after `:842`) and **before** `SessionCalories` (`:843`) and Nudges (`:845`). Add a `RepiSummaryCard` with: completed vs planned (`sum.setsDone/setsTotal`, `exSkipped`, `stagesSkipped`, already in `DoneData` `:36-41`), comparison with the previous session (the server summary has `prs`; needs a server extension for per-exercise deltas, the `compare` field already exists in `/api/me/history/:id` `History.tsx:24`), and a next-session recommendation (aggregate `ex.outlook.proposal`).
- If `sum.local` (offline), show the deterministic local version only, with the "se calcula al sincronizar" copy pattern from `:830`.
- Optional quick perception question: reuse the existing RPE `StepSlider` in `.fb` (`:851-862`). Don't add a second one.
- Keep the celebration non-blocking (M02, `celebrationFor` `:792-797`).

### 6.4 Expandable conversation panel reachable from sections
- **State and host**: see "General architecture". Open from:
  - Home card (6.1).
  - Workout `.wo-tools` (6.2).
  - Progress: the exercise header next to "Cambiar ejercicio" (`ProgressTraining.tsx:158-159`), sending `{section:"progress", exerciseId: ex.exercise.id, range}`. Also the period card header (`:119`).
  - Mi cuerpo: `BodyWeight` card headers (`BodyWeight.tsx:67-96`). **Gate on eligibility**: only when `b.available` (adult); never for `minor` or `age_unknown`. No photos.
  - Historial: inside `HistorySession` (`History.tsx:62+`, after the `stats3`), with `{section:"history", sessionId}`.
  - Mis rutinas: `.or-actions` per routine (`OwnRoutines.tsx:80`), and after an import save (`RoutineImport.tsx:50-54`, "Explicame esta rutina").
  - Mensajes: a "Redactar con REPI" helper above `Conversation` (`Messages.tsx:28`). It only fills the draft and **never sends**.
  - Perfil: inside `RepiPrefs`.
- **Reuse** the chat visuals `.mb-chat .chat-log/.chat-bubble/.chat-compose` (`member.css:290-309`) but mark them distinctly as REPI, not a human thread.
- Keep "Mensajes" for humans. **Do not add a 6th tab.** `tabs` (`:309`) also drives `--n` and the DemoTour and e2e assumptions (§7).

### 6.5 "Why this recommendation" sheet
- Generalize the `SetGuide` "¿Por qué?" toggle (`SetGuide.tsx:22, 41, 62-68`) and its `explain` string into `RepiWhySheet`. Build it on `Sheet` (modal is fine here because the user asked for it).
  - `title` = "Por qué te digo esto".
  - `sub` = one-line claim.
  - children = an evidence list (sessions compared by date, excluded voided or warm-up sets, the rule or source applied, the provenance chip) and a "Esto no me sirve" feedback button.
- Open it from:
  - `RepiCard` ("Ver por qué").
  - `RepiInsight` in Workout. In the workout context prefer an inline expand like SetGuide over a modal while a set is in progress.
  - Done summary.
  - The Progress insight.
- Data must come from deterministic server evidence (AC3 §8). The UI only renders a structured `{claims[], evidence[], source}`.

### 6.6 REPI preferences in settings
- **Where**: `Perfil`, as a new `<RepiPrefs>` section **between `<Wishes>` (`:907`) and `<Settings>` (`:908`)**. Wishes is already the "REPI uses this" block.
  - Alternative: inside `Settings` (`:990-1012`) after `ThemePicker`. Not recommended: Settings is "Configuración" with unit and theme only.
- **Contents** (AC3 §19):
  - Proactive assistance on/off
  - Categories: training reminders, progress notices, performance recommendations, motivational messages, weekly summary
  - Frequency
  - Quiet hours
  - Push on/off
  - Autonomy level (0/1/2) if exposed
  - "Borrar lo que REPI recuerda" (memory management)
- **Controls**: `role=switch` rows (`.panel .prow-dark`, `MemberApp.tsx:883-893`) and chip radiogroups (`.ai-chip` / `.wish-goals`).
- **Persistence**: prefs go to `/api/me/settings` (extend the zod `.strict()` schema in `src/app/api/me/settings/route.ts:8-9` and `updateSettings` in `src/server/settings/services.ts:22`) or to a new endpoint.
- **Push opt-in is missing for members.** `@/lib/push` (`enablePush / disablePush / pushState / setPushPaused`) is only used by `components/gym/Access.tsx`. `RepiPrefs` is the place for it. Server pieces exist: `src/server/push/services.ts` `subscribe/setPaused/enqueue(dedupe)`. The local rest alert (`src/lib/restAlert.ts`) is separate and device-only.
- **Hint keys**: add any new keys (for example `repi_intro`) to `HINT_KEYS`.

---

## 7. Risks and constraints for implementation
1. **e2e selectors** (`e2e/member-workout.spec.ts`):
   - `getByRole("button", { name: /Comenzar entrenamiento|Continuar entrenamiento/ }).first()` (`:24`). A REPI button with that name placed before the hero would be clicked first.
   - `getByRole("status").filter({hasText:/Guardado|guardad/i}).first()` (`:37`). Avoid `role=status` REPI text containing "guardad…" in Workout.
   - The per-tab check requires **0** `role=alert` matching `/error|no se pudo/i` (`:59`). With AI disabled in CI (no `OPENAI_API_KEY`), the REPI fallback must not render as `role=alert` with that wording. Use a neutral `mb-muted` or `role=status` "REPI no está disponible ahora".
   - axe on Home and tabs 0-3.
   - No horizontal overflow at 320 px (`mobile-layout.spec.ts`, including the dock with nothing covering it).
2. **DemoTour** `findTarget` (`src/components/demo/DemoTour.tsx:54-58`) matches the first `button` whose text **starts with** "Inicio", "Entrenar", "Progreso", "Mensajes" or "Gym", in document order. `<main>` comes before `<nav>`, so a REPI CTA such as "Entrenar ahora" or "Progreso de la semana" would hijack the member tour. Either avoid those prefixes or add `aria-label` or `title` to the tabbar buttons (it checks `[aria-label=…]` first).
3. **State loss**: `.tab-pane key={tab}` remounts. The workout branch is a separate tree. See §6 "General architecture".
4. **Modality**: `Sheet` makes `.mb-col` inert. If a non-modal panel lives inside `.mb-col` it becomes inert while a sheet is open (acceptable). If it lives in a portal it stays focusable behind the sheet, so close it when a sheet opens.
5. **Theme guard** (§3.4): no new hex or rgba in CSS or TSX. New tokens must go in both light and dark plus `pnpm tokens`. Run `pnpm --filter @repi/web test:guards`.
6. **Typography**: Barlow and Barlow Condensed only (CLAUDE.md, apps/web/AGENTS.md). `.ndg-txt b` hardcodes `"Barlow Condensed"` instead of `var(--font-display)` (`member.css:745`). Copy `--font-display`, not that line.
7. **AI cost**: the `SoloEntry` prefetch (`Solo.tsx:37`, `MemberApp.tsx:635`) calls OpenAI whenever Entrenar mounts with a program (cached per day per tab). AC3 quotas and circuit breaker should cover it, or it should become lazy.
8. **Dismissal state is device-local** today (Nudges `repi:nudges:off`; ProgramNotice `repi_prog_seen:*` `MemberApp.tsx:1049`; trophies via `sessionStorage`). AC3 needs synced dismiss and "no similar" semantics.
9. **Notification origin collision**: `origin: "repi"` already means product announcements (D202). Use a distinct origin or `NotifDest` (for example `{tab:"repi", context}`) and extend `pickNotif` (`MemberApp.tsx:206`) and `feed.ts:21`.
10. **Minors and safety**:
    - Body UI is gated server-side (`available:false reason:"minor"|"age_unknown"`) through `AgeGate`. REPI entry points in Mi cuerpo must reuse that eligibility.
    - Solo or AI UI has **no** client-side minor gating today; enforce it server-side.
    - Pain flow must keep "no diagnosis" copy and route to `PainSheet` (`FollowSheets.tsx:31`).
11. **Feature flag**: add one flag (for example `repi_core`) to `FEATURES` (`src/lib/features.ts`) so the AC3 UI ships dark. `tests/features.test.ts` only asserts specific flags, so a new key is safe.
12. **Offline**: no `/api` caching in the SW. Companion and cards must read IndexedDB (`LocalSession`) or a local store with `expiresAt` and `version`. AI-dependent actions should say they are unavailable offline without blocking (the pattern is `flash("Necesitás conexión…")` or a muted note).
13. **Dead code**: `Placeholder` (`MemberApp.tsx:810-812`) is unused. Not a blocker.

## 8. Gaps vs AC3 (member UI only)
- No unified REPI component family or shared state. AI is scattered across Solo, SetGuide, `intel`, `outlook` and Nudges.
- No persistent chat. Solo turns are ephemeral, there is no history, no feedback on answers, and no resume.
- No contextual entry points in Home, Progress, Body, History, Routines, Messages or Profile.
- No Home REPI card. ProgramNotice and Nudges are partial proxies.
- Workout: no conversational intents (busy machine, short on time, pain via chat). The companion is visible only during rest. There is no pre-exercise line beyond SetGuide.
- Done: no plan-vs-done comparison per exercise, no previous-session comparison beyond the first PR, no next-session recommendation, no memory update hook.
- No generalized "Why" sheet with evidence.
- No REPI preferences (proactivity, categories, quiet hours, frequency, autonomy, memory). **No member push opt-in UI.**
- Provenance (registered / rules / AI) is only explicit in SetGuide. Solo mixes rules and AI under "REPI".
- Dismissals and "don't show similar" are not server-side.
