# REPI — Coach & Gym · Developer handoff (v2)

> **v3 product correction (supersedes anything below that conflicts):**
> - REPI is a **training, performance and follow-up** platform. Gyms do **not** use it to track member payments or dues. The membership, member-revenue and payment-status screens were removed from the gym workspace.
> - Neither the gym (owner, manager or trainer) nor the coach can open the member app. Each audience has its own surface:
>   - The **coach** sees the client's data inside REPI Coach desktop (Resumen, Rendimiento, Rutinas, Progreso, Salud, Nutrición, Mi cuerpo, Pagos), always limited to what the client shared.
>   - The **gym** sees only gym-relevant data: attendance and logged sessions, the institutional program and team notes, challenges and records, and service reviews. It never sees the private coach relationship, health, nutrition or Mi cuerpo, unless an explicit purpose-bound grant exists.
> - New for gym members: the gym publishes news, discounts, challenges with prizes picked up at reception, and an **informative** reception catalog with prices only (no payments in the app).
> - Record attempts need a video uploaded from the app. The gym validates it; on approval the member gets a notification and a permanent sticker/level in Logros.

Source prototypes (interactive, synthetic data):
- `REPI Desktop Gym.dc.html`: floor trainer, manager, owner and member (phone). Use the "Prototipo · ver como" bar to switch persona.
- `REPI Desktop Coach.dc.html`: independent coach desktop.
- `REPI App Alumno v3.dc.html`: client mobile app with motion, the Gym tab and record uploads (v2 is kept for reference).
- `repi-shared.js`: prototype-only shared store (localStorage + IndexedDB) that connects the gym desktop and the member app across tabs.
- `REPI Motion Intro.dc.html`: brand intro concepts (1a approved).

Brand: Concept 2, Friendly Performance. Desktop uses a navy sidebar (#0B0F14) with light content (#F3F5F8 page, #FFFFFF cards, #E2E8F0 borders). The client app is dark. Cyan #00D1FF is a fill colour with dark ink on top. Accent text on light backgrounds uses #007EA0 (contrast ≥ 4.5:1).

---

## 1. Responsive & navigation

| Width | Sidebar | Layout notes |
|---|---|---|
| ≥ 1100 | Full, 248 px, labels | Split views side by side (list 280–360 px, detail flexible) |
| 768–1099 | Icon rail, 72 px | Cards wrap via `auto-fit, minmax()` |
| < 768 | Drawer (hamburger in a sticky top bar) | Tables reflow into wrapped rows (flex-wrap cells), no horizontal tables except the shift grid (scrolls) |

Targets checked: 375, 390, 430, 768, 1024, 1280, 1440 and 1920. Content max-width is 1560 px. Hit targets are ≥ 36 px on desktop and ≥ 44 px on touch.

The workspace switcher sits at the top of the sidebar and lists every StaffMembership / MemberRelationship of the account. Switching changes the organization context; permissions are never merged across organizations.

### Screen → route map
| Screen | Route |
|---|---|
| Floor trainer · Mi turno | `/w/:orgId/trainer` |
| Cola de asistencia | `/w/:orgId/trainer/queue?tab=shared|mine|done` |
| Socios (lookup + detail) | `/w/:orgId/trainer/members/:memberId` |
| Traspaso de turno | `/w/:orgId/trainer/handoff` |
| Mi desempeño | `/w/:orgId/trainer/performance` |
| Manager · Panel | `/w/:orgId/manage` |
| Performance Center | `/w/:orgId/manage/performance?period=&shift=&cat=` |
| Equipo / detalle | `/w/:orgId/manage/staff`, `/w/:orgId/manage/staff/:staffId` |
| Tareas | `/w/:orgId/manage/tasks?status=` |
| Reseñas (análisis · moderación · accesos) | `/w/:orgId/manage/reviews?tab=` |
| Turnos | `/w/:orgId/manage/shifts?week=` |
| Participación | `/w/:orgId/manage/engagement` |
| Negocio / Ingresos | `/w/:orgId/manage/revenue` (requires `finance.view`) |
| Owner · Ejecutivo / Sedes / Membresías / Facturación / Configuración | `/w/:orgId/owner/{overview,locations,memberships,billing,settings}` |
| Coach · Panel / Clientes / Programas / Mensajes / Pagos | `/w/:coachOrgId/{dashboard,clients/:id,programs/:id,messages/:threadId,payments}` |

---

## 2. Permission matrix (initial policy)

Authorize by permission, never by role title. Roles are bundles of permissions per organization, and sensitive scopes always need an explicit grant. Legend: **Own** = own records only · **Scoped** = assigned members / own location · **Gym** = whole organization · **Grant** = only with an explicit, purpose-bound, revocable MemberConsent · **—** = no access.

| Resource / action | Floor trainer | Coordinator | Manager | Owner | Reception | Member |
|---|---|---|---|---|---|---|
| View institutional workout | Scoped | Scoped (location) | Read, operational need | Read, operational need | — | Own |
| Edit workout | Scoped, on shift | Scoped | Policy flag `manager.editPrograms` | Policy flag | — | — |
| Institutional notes: read / write | Scoped / Scoped | Scoped / Scoped | Read | Read | — | — |
| Personal trainer notes | Author only | — | — | — | — | — |
| Operational tasks: view | Assigned + shared queue | Location | Gym | Gym | Create only | Own requests |
| Operational tasks: assign / reassign | Self-assign | Location | Gym | Gym | — | — |
| Shift handoff: create / accept | Own shift / addressed to self | Location | Gym | — | — | — |
| Private chat content | Participant | — | — | — | — | Participant |
| Chat metadata (counts, timestamps) | Own | Aggregate | Aggregate | Aggregate | — | Own |
| Health documents, labs | Grant | Grant | — | — | — | Own |
| Mi cuerpo (measures, photos, 3D) | Grant | Grant | — | — | — | Own |
| Staff performance | Own | Location team | Assigned team | Gym | — | — |
| Reviews: read text | Own (anonymized author) | Location | Gym (with member name) | Gym | — | Own submissions |
| Reviews: respond | Own, if `reviews.trainerResponses` | — | — | — | — | — |
| Reviews: report / dispute | Own | — | — | — | — | Report on own |
| Review moderation | — | If `moderator` | If `moderator` | If `moderator` | — | — |
| Edit review text | — | — | — | — | — | Own, while editable |
| Shift planning | View own | Location | Gym | Gym | View | — |
| Member app / private coach relationship | — | — | — | — | — | Own |
| Gym posts, challenges, catalog | Read | Publish if `community.publish` | Publish | Publish | Publish catalog | Read (gym members) |
| Challenge attempts: validate | If `challenges.validate` | If granted | Yes | Yes | — | Create own |
| Gym → member billing | Out of scope: REPI does not manage gym dues | | | | | |
| Gym → REPI billing | — | — | — | Full (`billing.repi`) | — | — |
| Gym configuration, roles | — | — | Location settings | Full | — | — |
| Club moderation | If moderator | If moderator | If moderator | If moderator | — | Report |
| Audit log | Own events | Location | Gym | Gym | — | Own data access |

**Edge cases:**
- A user who is both coach and gym trainer sees gym members only inside the gym workspace and private clients only inside the coach workspace. A person who is both a client and a gym member has two MemberRelationships with independent consent.
- When a trainer leaves an organization, their StaffMembership ends. Institutional notes they wrote stay with the organization; their personal notes are deleted or exported to them.
- A manager can never read private chat content, even when investigating a complaint. Investigations rely on operational metadata and reviews; anything else escalates to the platform's legal process.
- After-hours rule: editing workouts and completing tasks requires an active shift, unless `staff.afterHoursAccess` is set.
- Every denied attempt on a protected resource writes an AccessAuditEvent and shows a permission-denied state, never a silent empty state.

---

## 3. Privacy boundaries in the UI
- Every data surface carries a visibility label: "Visible para el equipo de la sede", "Solo vos", "Solo participantes" or "Sin acceso · requiere permiso explícito".
- Management views have a "Fuera del alcance de gestión" card. Its "Ver" buttons open the denied modal and write an audit event (prototype: trainer detail).
- Tasks created from a private conversation get a **sanitized summary** written by the trainer. Message bodies are never copied, and an inline hint reminds trainers to leave out health data.
- Health and body data are never inputs to staff metrics.

---

## 4. Staff metrics: definitions & attribution

The five categories are always shown separately. There is **no combined score** by default and no rankings or automated employment recommendations.

| Category | Metric | Definition |
|---|---|---|
| Operativo | Horas de turno | Assigned and clocked hours in the period; the base for normalization |
| | Solicitudes atendidas | AssistanceRequests closed by the staff member (credited to whoever completes) |
| | Por 10 h de turno | Requests handled ÷ shift hours × 10 |
| | Respuesta mediana | Median minutes from creation to first pick-up, counted only inside the assignee's shift windows |
| | Tareas vencidas | Assigned tasks past their due date; transferred tasks count for whoever accepted them |
| Calidad de servicio | Seguimientos a tiempo | Follow-ups completed by their due date ÷ follow-ups assigned |
| | Programas nuevos / actualizados | ProgramRevision events authored |
| | Onboardings | New-member onboarding tasks completed |
| Participación de socios | Socios atendidos | Unique members with ≥ 1 ServiceInteraction |
| | Programas en uso | Programs authored that have ≥ 1 logged session in 14 days; shown as context only, with a caveat |
| Resultados de entrenamiento | (location level only) | Load progression, adherence, frequency. **Never attributed to individual trainers** |
| Satisfacción | Reseñas, Promedio, Rango probable | Verified, non-removed reviews only. The average is hidden below n = 5 ("Muestra insuficiente"). Rango probable is the approximate 95% interval |

**Attribution rules (MetricAttribution):**
- Each event is credited to exactly one actor: the one who performed the action. Shared or co-authored work is recorded with `shared=true` and split.
- Handoffs move responsibility for due dates when the task is accepted, not when it is sent.
- Trainers see every attribution in "Acciones atribuidas a vos" and can dispute any of them. Disputes create a ReviewModerationCase of type `attribution`, and the metric is flagged until resolved.
- Comparisons are limited to 2–3 people and always show shift context (hours, shift type, peak hours).
- Missing data shows as "—" or "Datos insuficientes", never as 0.

---

## 5. Task, shift & handoff states

`AssistanceRequest / OperationalTask.status`: `open` (shared queue when `assignee=null`) → `open` (assigned) → `pending_acceptance` (handoff sent) → `open` (accepted) → `done`. Other states: `cancelled`, `escalated` (to coordinator).

Handoff flow:
1. At shift end the trainer picks their open tasks (all selected by default), edits the sanitized summaries, and picks a recipient: the next trainer, another trainer, or the shared queue.
2. Confirming closes the StaffShift (`ended`) and creates a ShiftHandoff with one TaskAssignment per task (`status=pending_acceptance`).
3. The recipient accepts each task from "Mi turno". If a task stays unaccepted past the recipient's shift start + 30 min, it escalates to the coordinator.

---

## 6. Reviews & moderation

**Eligible interactions:** new program, significant program update, technique review, onboarding, scheduled consultation, supervised activity. "Seguimiento" and trivial interactions do not trigger an invite.
- One invite per ServiceInteraction, and the member can dismiss it ("Ahora no").
- Members get at most 1 invite per 14 days.

**Review:**
- Overall rating from 1–5 is required. The dimensions (Claridad, Atención, Trato profesional) and the comment are optional.
- Visibility is shown on the form: the trainer sees the review without the member's name, management sees it with the name, other members never see it. Public publication is off and needs a separate policy plus consent.

**States:** `published` → `reported` (hidden from the trainer while moderated) → `in_review`. The case then resolves to one of `kept`, `removed_abusive` or `edit_requested`, and the outcome can be `appealed` within 14 days. Every transition appends to `ReviewModerationCase.log` and AccessAuditEvent.

**Rules:**
- Staff can never edit review text.
- Trainer responses are off when the gym disables them (Configuración). Responses are private: the member and management see them.
- No automatic punitive actions. Ratings never feed into scheduling or pay.

---

## 7. Domain entities (conceptual)

| Entity | Key fields |
|---|---|
| Organization | id, type (`coach`/`gym`), name, mode (`companion`/`integrated`), billingPlanId, settings{reviews.trainerResponses, staff.afterHoursAccess, manager.editPrograms} |
| GymLocation | id, orgId, name, timezone, areas[] |
| StaffMembership | id, userId, orgId, locationIds[], roleIds[], status, startedAt, endedAt |
| StaffRole | id, orgId, name, permissions[] |
| StaffShift | id, membershipId, locationId, area, startsAt, endsAt, status (`planned`/`active`/`ended`), clockIn, clockOut |
| MemberRelationship | id, memberUserId, orgId, kind (`gym_member`/`coach_client`), status, plan, billable |
| AssistanceRequest | id, relationshipId, category, priority, source (`app`/`floor`/`staff`), createdAt, sanitizedSummary |
| OperationalTask | id, orgId, locationId, relationshipId?, category, priority, dueAt, status, sanitizedSummary, createdBy |
| TaskAssignment | id, taskId, assigneeMembershipId?, assignedBy, status, assignedAt, acceptedAt |
| ShiftHandoff | id, fromShiftId, toMembershipId?, createdAt, taskAssignmentIds[] |
| ServiceInteraction | id, relationshipId, staffMembershipId, kind, taskId?, occurredAt, reviewEligible |
| TrainerReview | id, interactionId (unique), staffMembershipId, memberUserId, rating, dims{clarity,attention,professional}, text?, status, response?, createdAt |
| ReviewModerationCase | id, type (`content`/`attribution`), reviewId?, attributionId?, openedBy, reason, status, resolution, log[] |
| StaffPerformanceMetric | id, membershipId, period, category, key, value, sampleSize, computedAt, definitionVersion |
| MetricAttribution | id, eventType, eventId, membershipId, shared, disputed |
| MemberConsent | id, memberUserId, granteeOrgId, granteeMembershipId?, dataType, purpose, grantedAt, revokedAt |
| AccessAuditEvent | id, actorUserId, orgId, resource, resourceId, action, result (`allowed`/`denied`), at |

---

## 8. Billing (configurable; prices are illustrative)

**REPI Coach:**
- Rate per billable client per month (example: ARS 700).
- Billable means an active relationship with ≥ 1 program assigned in the period. Paused clients are not billed.

**REPI Gym:**
- Volume tiers per billable member (example: 0–500 ARS 450 · 501–1500 ARS 380 · 1501+ ARS 320).
- Minimum monthly charge, optional modules (Body Intelligence per opted-in member), and discounts (annual 10%) on top. No per-trainer or per-location fee by default.
- The definition of "billable" is set per contract and is not the same as usage. The UI shows enrolled, non-billable and billable counts.
- A snapshot of the billable count is taken on the last day of the period.

Gym → member billing (memberships, PT, classes) is shown separately from Gym → REPI billing.
- **Companion mode:** imports membership status only.
- **Integrated mode:** REPI handles collection and reservations.

---

## 9. Motion (desktop)

Reuse the client motion tokens at lower intensity:

| Use | Duration / easing |
|---|---|
| Screen enter | 220 ms, `cubic-bezier(.05,.7,.1,1)`, 6 px rise, first 6 blocks staggered 25 ms |
| Modal | 200 ms, fade + 8 px + scale .985 |
| Toast | 200 ms |
| Bar and progress changes | Width transition 300–350 ms |

- Count-up animations do not run on data refresh.
- No animation on table rows or per-row updates.
- `prefers-reduced-motion` disables all of it.

---

## 10. Functional acceptance criteria (flows)

- **A · Coach:**
  - Dashboard → client directory with search, filter and sort → client detail with five tabs → "Editar/Crear programa" opens the builder → add, reorder and edit exercises → Asignar opens a multi-select of clients and a start date → the client's program updates and a toast confirms.
  - Duplicate creates an independent copy.
- **B · Floor trainer:**
  - Tasks cannot be taken or completed and programs cannot be edited before "Iniciar turno".
  - Take T-1041 → open member → edit program with a reason and "complete task" checked → the task becomes `done`, a revision is logged with the author, an attribution appears in Mi desempeño, and the member gets a review invite.
- **C · Handoff:**
  - "Terminar turno" → select tasks, edit summaries, pick Sofía → the shift is `ended` and the tasks become `pending_acceptance`.
  - As Sofía: "Traspasos recibidos" → Aceptar → the task is in "Asignadas a mí" → completing it requires her shift to be started.
- **D · Manager review:**
  - Performance Center → change period, shift and category → definitions toggle → select 2–3 people → Comparar shows normalized values with context → a row opens trainer detail with activity, reviews and tasks.
- **E · Member feedback:**
  - The prompt appears only after an eligible interaction and is dismissable.
  - The overall rating is required. Visibility copy is shown before sending.
  - After sending, the review appears in the manager's Reseñas tab marked "Nueva", the trainer's count increases, and the trainer sees it without the member's name.
- **F · Privacy:**
  - In trainer detail, "Fuera del alcance de gestión" → Ver → denied modal, plus an audit entry visible under Reseñas › Historial de accesos.
- **G · Owner:**
  - Ejecutivo → adoption trend → Sedes comparison with a metric switch → clicking a location opens Performance Center filtered to it → Ingresos → Facturación REPI, including a billable-definition simulation.
- **H · Cross-organization:**
  - The sidebar switcher moves between Gym Norte (trainer) and Agustín Pérez Coach. The two workspaces show no shared clients or members.
- **I · Member with gym and coach:**
  - The phone mock toggles Gym Norte / Coach Agustín. Each shows its own plan and program, plus copy explaining that history belongs to the member and each relationship can only see its own.
- **J · Gym onboarding:**
  - Configuración › Puesta en marcha: "Importar CSV", then "Activar".
  - Activation is blocked until the import is done.

---

## 11. Phasing
- **MVP:**
  - Organizations, memberships and roles with permission checks.
  - Coach: clients, program builder, messaging, payments status.
  - Gym: floor trainer shift, queue, tasks, handoff, institutional notes; manager dashboard, Performance Center (Operativo and Calidad), staff detail, tasks.
  - Reviews with moderation.
  - Audit log.
  - Companion mode.
  - REPI billing snapshots.
- **Next:**
  - Participación and Satisfacción trends.
  - Shift planning with clock-in.
  - Multi-location owner views.
  - Repi Club per gym, challenges and trophies.
  - Body Intelligence sharing with gyms (Grant).
- **Later:**
  - Integrated billing, reservations and classes.
  - Public ratings (needs a policy).
  - Enterprise chains.
  - AI assistance for program drafts (always reviewed by a human).

## 11b. Gym community & record validation

**Entities:**

| Entity | Key fields |
|---|---|
| GymPost | id, orgId, locationIds[], type (`news`/`discount`), title, body, badge?, imageUrl?, publishedAt, expiresAt?, authorMembershipId |
| GymChallenge | id, orgId, title, rule, unit (`reps`/`seconds`/`kg`), lowerIsBetter, currentRecord?, recordHolderMemberId?, prize, prizePickup='reception', endsAt, status |
| ChallengeAttempt | id, challengeId, memberRelationshipId, value, videoObjectKey, declaredAt, status (`pending`/`approved`/`rejected`), reviewerMembershipId?, decidedAt?, reason? |
| MemberAchievement | id, memberUserId, source (`challenge`/`streak`/`pr`), refId, title, level, earnedAt |
| CatalogItem | id, orgId, category, name, price, promo?, imageUrl?, active. Informative only; there is no checkout. |

**Flow:**
1. The member opens Gym › Desafíos and taps "Subir intento".
2. They record or pick a video, enter their mark and confirm the video is complete and theirs.
3. The video uploads to private storage visible only to the gym's validators, and the attempt becomes `pending`.
4. The gym gets a notification, and Validaciones shows a nav badge plus a toast.
5. A reviewer watches the video and approves or rejects it with a reason chip. If an approved mark beats the record, `currentRecord` and the holder update.
6. The member gets a notification. If approved, an award sheet appears with the sticker animation and pickup instructions, and a MemberAchievement is saved. If rejected, the member sees the reason and can retry.

**Rules:**
- Only gym members (MemberRelationship.kind = gym_member) see the Gym tab.
- Videos are never public or shared with other members.
- Retention: 90 days after a decision.
- Challenges never ask for health data.
- Avoid mechanics that push unsafe effort: rules describe technique, and the app shows no live countdown pressure.

**Permissions:**
- Publishing posts, challenges and catalog items requires `community.publish` (manager, owner, or an assigned staff member).
- Validating attempts requires `challenges.validate`.
- Members can only create attempts and read their own.

## 11c. Coach view of client data (REPI Coach desktop)

| Tab | Content | Source / consent |
|---|---|---|
| Resumen | Alerts (pain ≥ 4/10, inactivity, records), objectives with progress, sessions planned vs. done | Training logs (always shared with the client's own coach) |
| Rendimiento | Key lifts table (estimated 1RM start/now/Δ + sparkline + best set), weekly sets per muscle group (done vs. planned), strengths / areas to improve, 14-day check-in (energy, sleep, RPE) | Training logs + daily check-in |
| Rutinas | Assigned program + session log (sets done/planned, RPE, duration, client note) | Training logs |
| Salud | Injuries (zone, detail, since, status, program restriction), reported discomfort with 0–10 trend, conditions/medication/allergies/medical clearance | **Grant**: `health` consent; locked state with "Pedir acceso" otherwise |
| Nutrición | Targets, days in range, hydration, macros vs. target, kcal per day with target band, weight trend, last logged day | **Grant**: `nutrition` consent |
| Mi cuerpo | Measures, photos, 3D, composition reports, each separately consented | **Grant** per data type |

## 12. Not yet prototyped
- Reception role screens.
- Coordinator-specific views (they use the manager screens with location scope).
- Repi Club / challenges / trophies desktop moderation.
- Class booking.
- Health document upload.
- Gym onboarding beyond the checklist.
- Trainer messaging inside the gym workspace.
