# REPI — Retomar acá

Actualizado: 27/10/2026, sitio público (D104). Máster activo: ../../MASTER_PROMPT.md.

## Último bloque cerrado — 27/10/2026 · Sitio público con contacto comercial (F-PU-01, D104)

- **Hecho:** `src/app/page.tsx` muestra `components/site/PublicSite.tsx` a visitantes sin sesión (con sesión, igual que antes; `/?source=pwa` sin sesión → `/acceso`). `components/site/LeadForm.tsx` usa `/api/access/lead` (mismo `commercial_lead` que Acceso → Admin › Contactos). `src/app/legal/[doc]/page.tsx` (`terms`, `privacy`, `dpa`; otro → 404): antes eran enlaces rotos desde la aceptación de términos. Estilos en `src/styles/site.css`. Sin migración.
- **Copy:** sólo capacidades presentes (ver `docs/comercial/ESTADO_Y_LIMITES.md`): sin tiendas, pagos, facturación, precios publicados ni alta libre. Legales: aviso de texto en preparación con la versión `TERMS_VERSION` y resumen de cómo funciona hoy.
- **Pruebas:** typecheck, build y guardas 11/11 OK (sin tests nuevos: es presentación; la ruta del lead ya estaba cubierta). Navegador local: `/` 200 sin sesión, `/?source=pwa` redirige, con sesión de Valentina `/` → `/app`; legales 200 y `/legal/nope` 404; envío del formulario → «Recibimos tus datos» (quedó el lead «Gym Prueba Landing» / `laura.landing@example.test` en `repi_dev`); 1280 px y 375 px sin desborde; el punto decorativo se oculta bajo 720 px porque pisaba el título.
- **Pendiente del titular:** textos legales (G11), email público de contacto, revisar el copy del sitio antes de difundir la URL.
- **Siguiente:** otro ítem del catálogo que no toque agenda ni privacidad mientras Codex siga en eso (revisar `docs/continuidad/CODEX_PARA_CLAUDE.md` antes de empezar).

## Bloque anterior — 27/10/2026 · Avisos al cliente de cambios de condiciones (F-BL-05, D103)

- **Coordinación con Codex:** al empezar, Codex trabajaba en `codex/continuidad-2026-10-27` (checkout `~/Proyectos Locales/Repi-codex-continuidad`, base e11684c, sin commits todavía) sobre concurrencia de agenda, `.ics` y exportación de datos propios. Este bloque no tocó esos archivos (`training/agenda.ts`, `privacy/*`, `MemberApp.tsx`). Su handoff es `docs/continuidad/CODEX_PARA_CLAUDE.md` (sin versionar; no integrar hasta que diga LISTO PARA INTEGRAR). Para su exportación: `contract_notice.ack_by` es dato del dueño (quién confirmó un aviso).
- **Hecho:** tabla `contract_notice` (migración `0020_contract_notice`, dev local y **Supabase**, RLS); `src/server/commercial/notices.ts` (`publishNotice`, `noticesOf`, `ackNotices`, `trialNotices`, `requireOwner`); en `commercial/services.ts` avisos desde `addTerm`, `suspendClient`, `enableClient` (rehabilitación) y los nuevos `setTrial` y `setQuantityDefinition`; rutas Admin `POST /api/admin/contracts/[id]/trial` y `/definition`; `PATCH /api/conditions/[orgId]` («Entendido»); job `trialNotices` en `/api/cron/notifications` y `pnpm jobs:notifications`. UI: «Cambios en tus condiciones» en `gym/Access.tsx#ConditionsScreen` (gym y coach), badge en «Condiciones REPI» (`GymApp.tsx`, `CoachApp.tsx`), y en Admin (`AdminApp.tsx`) ajuste de prueba, cambio de criterio y tarjeta «Avisos al cliente».
- **Migración 0021** (`0021_contract_notice_user_delete`, dev y **Supabase**): `created_by` y `ack_by` pasan a `on delete set null`; sin eso, borrar la cuenta de un dueño que confirmó avisos (procedimiento D75 de `docs/PRIVACIDAD_OPERACION.md`) fallaba por clave foránea. Test agregado (6 casos en el archivo).
- **Arreglos de paso:** rehabilitar sin fecha de prueba borraba `organization.trialEndsAt` aunque el contrato la conservaba; la tabla «Historial» de condiciones desbordaba a 375 px (ahora con scroll propio).
- **Pruebas:** web 158/158 antes de 0021, luego el archivo pasó a 6/6 (nuevo `tests/condition-notices.test.ts`, 5 iniciales: versión anterior y motivo, sólo dueño, suspensión/rehabilitación/prueba/criterio, job idempotente y sin pruebas viejas, correo rechazado), dominio 87/87, guardas OK, typecheck y build OK. Navegador local: Admin del seed (2FA marcado temporalmente en `repi_dev`, revertido) crea cantidad 480, prueba y criterio sobre Gym Norte → ficha muestra «Sin correo (demo)» y «Sin confirmar» → dueño del seed (mismo truco, revertido) ve 3 avisos y badge 3, «Entendido» baja a 2 y pasa a «Avisos anteriores»; sin desborde a 375 px. Esos 3 avisos y la versión 2 de cantidad quedaron en `repi_dev`.
- **Pendiente:** reenviar un correo de aviso rechazado; avisos por push. Política de corte/mora sigue sin definir (D04–D05).
- **Siguiente:** F-PU-01 sitio público con contacto comercial, u otro ítem del catálogo que no toque agenda ni privacidad mientras Codex siga en eso.

## Bloque anterior — 27/10/2026 · Pagos externos registrados por Admin (F-AD-04 parcial, D102)

- **Hecho:** tabla `billing_payment` (migración `0019_billing_payment`, dev local y **Supabase**, RLS); `src/server/commercial/payments.ts` (`contractPayments`, `recordPayment`, `voidPayment`, `paymentsThisMonth`); rutas Admin `GET /api/admin/contracts/[id]/payments`, `POST /api/admin/contracts/[id]/payments`, `POST /api/admin/payments/[id]/void`; `PaymentsCard` en `AdminApp.tsx` (ficha del contrato) y tarjeta «Pagos externos (mes)» en el Resumen (`adminSummary.externalPaymentsMonth`).
- **Bug corregido:** `parseMoney` rechazaba montos con punto de miles («25.000», «150.000»): afectaba Cobros del coach (D80) y el nuevo registro. Tests agregados en `packages/domain/src/commercial.test.ts`.
- **Pruebas:** web 153/153 (nuevo `tests/payments.test.ts`, 2), dominio 87/87, guardas 11/11, build OK. Navegador local (Admin del seed con 2FA marcado temporalmente en `repi_dev` y revertido): registrar ARS 150.000 con evidencia → aparece en la tabla «Sin asignar» → se anuló por API con motivo. El Resumen no lo suma porque Gym Norte es DEMO (correcto).
- **Pendiente del titular (G09):** confirmar si el piloto opera con pago externo registrado; ciclo, corte, mora y fiscalidad siguen sin definir (D04–D05).
- **Siguiente:** F-BL-05 aviso al cliente de cambios de condiciones (historial visible en «Condiciones REPI») o F-PU-01 sitio público con contacto comercial.

## Bloque anterior — 27/10/2026 · Centro de avisos del staff gym (F-HX-26, D101)

- **Hecho:** columna `notification_outbox.read_at` + índice por usuario (migración `0018_staff_notice_read`, dev local y **Supabase**); `src/server/gym/notices.ts` (`myStaffNotices`, `markStaffNoticesRead`); rutas `GET /api/gym/[orgId]/notices` y `POST /api/gym/[orgId]/notices/read` en el dispatcher; `components/gym/Notices.tsx`; ítem «Avisos» con badge en `GymApp.tsx`; estilos `.gy-notice` en `gym.css`.
- **Pruebas:** web 151/151 (nuevo caso en `tests/annex.test.ts`: aviso sólo de la sede, escalamiento a recepción, resuelto por otro, leído por persona, ajeno 404), guardas 11/11, build OK. Navegador local con recepción del seed: aviso «Solicitud esperando · Palermo» (solicitud de prueba creada en `repi_dev` y luego cancelada) → abre Solicitudes con la solicitud seleccionada y el badge baja a 0.
- **Deploy:** 52cd4fe verificado.

## Bloque anterior — 27/10/2026 · Entrega de invitaciones de coach y equipo (D100)

- **Hecho:** `access/services.ts#deliverInvitation` (privado) usado por `inviteCoachClient` e `inviteGymStaff`, que ahora devuelven `delivery`; rutas `/api/access/coach/[orgId]/invitations`, `/api/access/gym/[orgId]/invitations` (ahora también devuelve `code`) y `/api/access/invitations/resend` exponen `delivery`; `followup/services.ts` lista `delivery` en Solicitudes; UI en `InviteModal.tsx`, `CoachInbox.tsx`, `gym/Manage.tsx#InviteStaff` e informe de importación. Sin migración (columna `invitation.delivery` ya existía, D88).
- **Pruebas:** web 150/150 (nuevo `tests/invite-delivery.test.ts` con proveedor simulado que responde 503), guardas 11/11, build OK. Los textos de la UI no se miraron en el navegador (cubiertos por tipos; flujo local devuelve `local_only`).
- **Deploy:** 8b25ebd verificado.

## Bloque anterior — 27/10/2026 · Importación CSV de clientes (F-CO-11, D99)

- **Hecho:** dominio `packages/domain/src/csv.ts` (`parseCsv`, `guessColumns`, `mapRows`, `CSV_MAX_ROWS`) + tests; `src/server/access/import.ts` (`previewImport`, `confirmImport`); ruta `POST /api/coach/[orgId]/import[?step=preview]`; `components/coach/ImportModal.tsx` y botón «Importar CSV» en Clientes. Sin migración.
- **Pruebas:** web 149/149 (nuevo `tests/import.test.ts`, 2), dominio 87/87, guardas 11/11, typecheck y build OK. Navegador local (archivo simulado con DataTransfer): 4 filas → 1 se invita, 1 repetida, 1 ya cliente, 1 email inválido → informe «1 invitadas · 3 salteadas». La invitación de prueba `lucas.import@example.test` quedó en `repi_dev` (buzón local, sin correo real).
- **Pendiente detectado:** `inviteCoachClient` descarta los errores del correo (`sendMail(...).catch(() => {})`); conviene registrar la entrega como la bienvenida comercial (D88) para poder decir «enviada» y reenviar.
- **Resuelto en D100.** Deploy 0086825 verificado.

## Bloque anterior — 27/10/2026 · Agenda y asistencia (F-CO-10 / F-HX-07, D98)

- **Hecho:** dominio `packages/domain/src/agenda.ts` (estados, `arToUtc`, `arParts`, `overlaps`, `appointmentIcs`) + tests; tabla `coach_appointment` (migración `0017_coach_appointment`, dev local y **Supabase**, RLS); `src/server/training/agenda.ts`; rutas `/api/coach/[orgId]/agenda` (GET/POST), `/api/coach/[orgId]/agenda/[id]` (POST), `/api/me/agenda` (GET), `/api/me/agenda/[id]` (POST), `/api/agenda/[id]/ics`; `components/coach/CoachAgenda.tsx` (pantalla «Agenda» + `TodayAgenda` en el panel); `NextAppointment` en Inicio del alumno; avisos en `notifications/feed.ts`.
- **Pruebas:** web 147/147 (nuevo `tests/agenda.test.ts`, 3), dominio 84/84, guardas 11/11, typecheck y build OK. Navegador local: coach del seed agenda «jue 29/10 18:00 · Gym Norte · sala 2» → .ics 200 `text/calendar` con DTSTART 21:00Z → alumna confirma desde Inicio (375 px). Esa sesión quedó en `repi_dev`. No se probó abrir el .ics en iPhone/Android.
- **Entorno:** la herramienta de vista previa del escritorio sigue leyendo `.claude/launch.json` de `~/Desktop/Repi` y arranca ahí. Se agregó `repi-local` (con `--dir` absoluto) al launch.json nuevo, pero la herramienta no lo ve hasta abrir una sesión nueva en `~/Proyectos Locales/Repi`. En esta sesión el dev server se corrió con `pnpm dev` desde `apps/web` de la ruta nueva.
- **Deploy:** 7fc9771 verificado en repiclub.com (`/api/me/agenda` 401 sin sesión).

## Bloque anterior — 27/10/2026 · Migración fuera de iCloud

- **Repo nuevo y único:** `~/Proyectos Locales/Repi` (fuera de iCloud). Clon limpio de `github.com/manuel-cosovschi/repi`, `main` en a516c7a + rama local `codex/lanzamiento-repi` (ya incluida en main) recuperada del bundle. Los 1100 archivos versionados se compararon byte a byte con la carpeta vieja: idénticos.
- **Copiado aparte (no versionado):** `apps/web/.env.local` (0600), `.vercel/` (vínculo del proyecto) y `apps/web/.storage/` (archivos privados de desarrollo). Dependencias reinstaladas con `pnpm install --frozen-lockfile`; no se copiaron `node_modules`, `.next` ni cachés.
- **Respaldo:** `~/.repi-secrets/migracion/repi-todas-las-ramas.bundle` (todas las ramas). La carpeta `~/Desktop/Repi` quedó intacta y congelada en a516c7a: **no trabajar ahí**; la borra el titular cuando quiera.
- **Arreglo de código:** rutas con espacios. `tests/setup-env.ts`, `tests/global-setup.ts`, `scripts/operations/backup.ts` y `scripts/migrate.ts` armaban rutas con `URL.pathname` (deja `%20`): no cargaban `.env.local` y `pnpm db:migrate` terminaba sin migrar ni avisar. Ahora usan `fileURLToPath`/`pathToFileURL`.
- **Pruebas en la nueva ruta:** typecheck OK, dominio 81/81, guardas 11/11, web 144/144 (`repi_test` local), `pnpm db:migrate` sobre `repi_dev` OK, `next build` OK.
- **Bases y servicios:** sin cambios (PostgreSQL local `repi_dev`/`repi_test`, Supabase, Vercel y secretos en `~/.repi-secrets/`). Vercel despliega desde GitHub, no desde la carpeta.
- **Deploy:** e58b372 verificado en repiclub.com.

## Bloque anterior — 27/10/2026 · Objetivos acordados (F-CO-03 / F-HX-02, D97)

- **Hecho:** dominio `packages/domain/src/goals.ts` (GOAL_KINDS, GOAL_SOURCES, ventana 28 días, `goalProgress`, `goalTitle`) + tests; tabla `client_goal` (migración `0016_client_goal`, dev local y **Supabase**, RLS); `src/server/training/goals.ts` (listGoals, createGoal, updateGoal, myGoals); rutas `GET/POST /api/coach/[orgId]/clients/[relId]/goals`, `POST /api/coach/[orgId]/goals/[id]`, `GET /api/me/goals`; `components/coach/CoachGoals.tsx` en la pestaña Progreso de la ficha; sección «Objetivos» en Progreso del alumno (`MemberApp.tsx#MyGoals`); estilos `.goalbar` (coach.css) y `.goal*` (member.css).
- **Pruebas:** web 144/144 (nuevo `tests/goals.test.ts`, 4), dominio 81/81, guardas 11/11, build OK. Navegador local: coach del seed crea «Jalón al pecho 60 kg × 8» desde la ficha → la alumna lo ve en Progreso (375 px). Ese objetivo quedó en `repi_dev` como dato de prueba.
- **Bug encontrado y corregido en la prueba:** `/api/coach/[orgId]/library` devuelve `{ exercises }`, no un array.
- **iCloud otra vez (muy grave):** a las 12:41 iCloud quitó la extensión a `AccessFlow.tsx`, `CoachApp.tsx`, `GymApp.tsx`, `member/Gym.tsx` y `MemberApp.tsx` y borró archivos de caché de Turbopack. Se restauraron desde git (eran idénticos a HEAD). Además `apps/web/tsconfig` era un `tsbuildinfo` renombrado por iCloud y commiteado en cf124b1: se sacó del repo. Resuelto con la migración a `~/Proyectos Locales/Repi`.
- **Siguiente:** F-CO-10 calendario/asistencia del coach o F-CO-11 importación CSV; F-HX-26 centro de notificaciones del staff.

## Bloque anterior — 27/10/2026 · Informe mensual (F-CO-16, D96)

- **Hecho:** `src/server/training/report.ts` (`monthBounds`, `myMonthlyReport`, `clientMonthlyReport`; `requireClientOf` ahora exportado de `training/services.ts`); vista `components/report/MonthlyReport.tsx` + `PrintButton.tsx`; estilos `styles/report.css` (con `@media print`); páginas `app/app/informe/page.tsx` y `app/coach/[orgId]/informe/[relId]/page.tsx`; enlaces en Progreso del alumno y pestaña Rendimiento del coach.
- **Pruebas:** web 139/139 (nuevo `tests/report.test.ts`, 3), guardas 11/11, typecheck y build OK. Navegador local: informe de la alumna del seed (escritorio) y del coach para esa relación en 375 px sin scroll horizontal ni check-in. No se probó «Guardar como PDF» en Safari/iPhone.
- **iCloud (grave):** durante el build iCloud renombró `apps/web/src/server/access/http.ts` a `http` (sin extensión). Se restauró desde git y el archivo extra fue a la Papelera. Ya van tres incidentes hoy (schema.ts borrado, `schema 2.ts`, `http`). **Mover el repo fuera de Escritorio/Documentos o excluirlo de iCloud** antes de seguir; revisar `git status` y `git ls-files -d` antes de cada commit.
- **Deploy:** eb66819 en repiclub.com verificado (`/app/informe` 307 a acceso sin sesión).

## Bloque anterior — 27/10/2026 · Unidad de peso kg/lb (F-HX-23 parcial, D95)

- **Hecho:** dominio `packages/domain/src/units.ts` (kgTo, toKg, fmtWeight, volumeIn, stepWeightIn, parseWeightIn, WEIGHT_STEPS_LB) con `units.test.ts`; columna `user_pref.weight_unit` (migración `0015_weight_unit`, dev local y **Supabase**); `src/server/settings/services.ts` + `GET/POST /api/me/settings`; `weightUnit` en `myTraining`; contexto `components/member/units.ts` provisto por `MemberApp`; Workout (stepper en lb, resumen, PR/Epley, conflictos, aria), Progreso/historial, «Anterior» del día y vitrinas del Club usan la unidad. Perfil → «Configuración» (radiogroup kg/lb, 44 px).
- **Pruebas:** web 137/137 (nuevo `tests/settings.test.ts`), dominio 78/78, guardas 11/11, typecheck y build OK. Navegador local 375 px: Perfil → Libras → aviso y Progreso en lb; se volvió a kg. El ± en lb dentro de un entrenamiento no se probó en navegador (cubierto por tests de dominio; no se abrió sesión en dev para no dejar datos).
- **Fuera de alcance a propósito:** coach/gym siguen en kg; idioma único; menores sin opción hasta política (G11); push al alumno no existe.
- **Deploy:** 2170e70 en repiclub.com verificado (`/api/me/settings` 401 sin sesión).

## Bloque anterior — 27/10/2026 · Centro de notificaciones del alumno (F-NT-01, D94)

- **Hecho:** `src/server/notifications/feed.ts` (`myNotifications`, `markNotificationsSeen`) arma la lista desde fuentes existentes (member_notice, pedidos coach y sala, solicitudes de acceso, reseñas, hilos sin leer, novedades del gym, cobros pendientes del coach); rutas `GET /api/me/notifications` y `POST /api/me/notifications/seen`; columna `user_pref.notifications_seen_at` (migración `0014_notifications_seen`, aplicada en dev local y **Supabase**). Cliente: campana con punto en Inicio (`MemberApp.tsx#Head`), hoja `NotifSheet`, aviso de programa sumado en el cliente (`withProgramNotice`), navegación a pestaña, sub-pestaña del Gym (`GymTabView initialTab`) u hoja de reseña. `myInbox` y `myReviewInvites` ahora devuelven `createdAt`. Estilos `.bell-dot`, `.notif*` en `member.css`.
- **Pruebas:** web 135/135 (nuevo `tests/notifications.test.ts`, 2), guardas 11/11, typecheck y `next build` OK (build con el dev server detenido). Navegador local 375 px con el alumno del seed: «Notificaciones, 5 sin leer» → hoja con novedades, pedido y programa → tocar novedad abre Gym · Novedades → al recargar, sin no leídas.
- **iCloud otra vez:** apareció `apps/web/src/db/schema 2.ts` (idéntica a 16c3522); se movió a la Papelera. Revisar `git status` por archivos `* 2.*` al arrancar.
- **Deploy:** 196ff24 en repiclub.com verificado (`/api/me/notifications` 401 sin sesión, `/app` 307 a acceso). No se probó con una cuenta real del entorno hospedado.
- **Límites:** sin push al alumno (no hay datos en lock screen); preferencias por canal y deep links por push quedan para N-O23/F-HX-23. Staff (F-HX-26) pendiente.
- **Siguiente:** F-HX-23 configuración (kg/lb sin alterar historia, preferencias de notificación) o F-CO-16 informe mensual; V1 restante es externo (G03/G07 teléfonos reales, G11 textos legales, G09 modalidad del piloto).

## Bloque anterior — 27/10/2026 · Soporte e incidentes (N-O11, D93)

- **Por qué este:** era el primer pendiente V1 con código faltante (gate G10 «soporte»); los demás V1 abiertos dependen de teléfonos reales, textos legales o decisiones del titular.
- **Hecho:** tabla `support_ticket` (migración `0013_support_ticket`, aplicada en dev local y **Supabase**, RLS activo); `src/server/support/services.ts` (openTicket con/sin sesión, diagnóstico de lista cerrada, deduplicación, límites; myTickets; listTickets/updateTicket para Admin; supportCounts en `adminSummary`); rutas `POST /api/support` (sesión opcional, helper `optionalUserId` en `access/http.ts`), `GET /api/me/support`, Admin `GET/POST /api/admin/support[/id]`; página pública `/ayuda` (`components/access/Support.tsx`); enlaces en login, Perfil del alumno y menú de Coach/Gym/Admin; `/acceso?step=rec1` abre «Olvidé mi contraseña»; pantalla Admin «Soporte» con badge, modal (incidente, tomar, nota interna, respuesta, reabrir) y tarjeta en Resumen. Procedimiento en `docs/SOPORTE_OPERACION.md`.
- **Pruebas:** web 133/133 (nuevo `tests/support.test.ts`, 5), dominio 74/74, guardas 11/11, typecheck y `next build` OK. En navegador local (dev): `/ayuda` sin sesión en 375 px → consulta enviada con código; Admin → Resumen «Consultas de soporte 1» → Soporte → responder → sale de «Abiertas». Para esa prueba se marcó 2FA del Admin del seed sólo en `repi_dev` y se revirtió.
- **Ojo:** `next build` en `apps/web` borra artefactos del `next dev` que esté corriendo (comparten `.next`): el dev server de la sesión de Codex en :3000 quedó devolviendo 500 y se reinició con el mismo comando (`pnpm --filter @repi/web dev`). Evitar build con un dev server activo, o reiniciarlo después.
- **Pendiente del titular:** responsables y horario de soporte, correo público de contacto, verificación de identidad para 2FA perdido sin códigos de respaldo.
- **Deploy:** c350c55 en repiclub.com verificado (`/ayuda` 200, `/api/me/support` 401 sin sesión).

## Bloque anterior — 27/10/2026 · Cierre de seguridad de lanzamiento (D87–D90)

- **Origen:** plan `docs/superpowers/plans/2026-10-27-lanzamiento-repi.md` (otro agente lo empezó en la rama `codex/lanzamiento-repi`; Claude revisó su trabajo, completó lo que faltaba y lo llevó a `main`).
- **Hecho:** cuentas del seed bloqueadas en el entorno hospedado y en Better Auth (D87); guardas de base local para tests/seed (`scripts/lib/database-target.ts`); primer Admin con ticket de un solo uso (`scripts/first-admin.ts`, `/activar-admin`, `src/server/admin/bootstrap.ts`); autorización por sede/turno sin mezclar roles, consentimiento y QR (D89); salida segura multipestaña, video con Range, íconos 192/512 (D90); bienvenida comercial con entrega honesta y condiciones serializadas, migración 0012 `invitation.delivery` aplicada en Supabase (D88); comentarios ocultos al salir de Repi Club; guardas de respaldo/restauración (`scripts/operations/guards.ts`).
- **Pruebas:** web 128/128 (vitest, `repi_test` local), dominio 74/74, guardas `tsx --test tests/safety/*.check.ts tests/operations/*.check.ts` 11/11, typecheck y `next build` OK.
- **Ojo — iCloud:** el Escritorio se sincroniza con iCloud Drive. Durante este bloque borró `apps/web/src/db/schema.ts` y dejó copias `* 2` (`.git/index 2`, etc.). Se restauró de git. Recomendación al titular: mover el repo fuera de Desktop/Documents o excluirlo de iCloud. Revisar `git status` al arrancar.
- **Ticket de primer Admin emitido 27/10 11:29 (vence 28/10 11:29 ART).** Enlace en `~/.repi-secrets/primer-admin.txt` (0600; sólo el hash en la base). Si vence sin usarse, volver a correr `pnpm ops:first-admin` (invalida el anterior). Hasta que el titular lo use, no hay REPI Admin. Para crearlo: correr `scripts/first-admin.ts` (ver docs/DESPLIEGUE.md) y que el titular abra el enlace guardado en `~/.repi-secrets/primer-admin.txt`, cree su cuenta, verifique email y active 2FA.
- **Deploy:** 697a5ca en producción (repiclub.com): `/activar-admin`, íconos `/pwa-icon/192|512`, manifest nuevo y demo (200 en ~5 s) comprobados.
- **Respaldos y CI (D91):** `pnpm ops:backup` / `pnpm ops:restore` en `apps/web/scripts/operations/`; ensayo local y hospedado verificados, `repi_restore_check` vaciada después. CI en `.github/workflows/ci.yml`.
- **Actualización PWA (D92):** `UpdateWatcher` + `/api/version`; sincroniza la cola antes de ofrecer «Actualizar».
- **CI:** el primer run falló en pruebas (PostgreSQL en contenedor no reporta dirección local y la guarda bloquea, como corresponde); se pasó al PostgreSQL nativo del runner. Run de 883f288: **verde** (typecheck, guardas, tests, build). Deploy 883f288 en repiclub.com con `repi-version` 883f2884ea10. El aviso «Actualizar» no se probó en navegador (se ve recién con el próximo deploy en una pestaña abierta).
- **Siguiente:** F-NT-01 centro de notificaciones del alumno (base: `member_notice`, `notification_outbox`, `/api/me/inbox`; pantalla nueva en `MemberApp`); flujos gym/coach completos en el entorno; luego catálogo V1.1 (F-HX-23 kg/lb, F-CO-16 informe mensual, F-NT-01 centro de notificaciones).

## Bloque anterior — 27/10/2026 · Dominio repiclub.com activo

- Nameservers en Vercel; `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` y `VAPID_SUBJECT` = `https://repiclub.com`; pg_cron reprogramado a repiclub.com (200); demo probada en repiclub.com.
- **Correo real activo (D86):** repiclub.com verificado en Resend, registros en Vercel DNS, `MAIL_FROM=REPI <hola@repiclub.com>`, ruta de prueba `/api/cron/mail-test`. Pendiente: que el titular pruebe un alta real con su email (Claude no crea cuentas en el entorno publicado).

## Bloque anterior — 27/10/2026 · Demo interactiva guiada por perfil (D85)

- **Hecho:** `src/server/sandbox/services.ts` (startDemo, sealDemo, purgeSandboxes, demoRoleOf), migración `0011_demo_sandbox` (dev local y Supabase), rutas `POST /api/demo` y `GET /api/demo/me`, página `/demo` + `components/demo/DemoPicker.tsx`, recorrido `components/demo/DemoTour.tsx` montado en `layout.tsx`, estilos `.dt-*` en `globals.css`, acceso «Probá REPI sin cuenta» en el login, purga en `/api/cron/notifications`, mailer nunca envía a `.invalid`, Admin excluye organizaciones de demo.
- **Pruebas:** `tests/sandbox.test.ts` (entorno coherente, aislamiento y borrado completo); web 110/110; los cuatro recorridos verificados de punta a punta en Chrome headless (`documentacion/demo/verificar-recorridos.mjs`, capturas en `documentacion/demo/`): entrada en ~2 s, cada paso navega a la pantalla correcta.
- **Pendiente:** probar en teléfono real; textos de venta a revisar por el titular; el paso «aprobá a Camila» no verifica que se haya hecho (es guía, no tutorial con validación).

## Bloque anterior — 27/10/2026 · Storage por Edge Function, dominio y Resend (D83, D84)

- **Hecho:** Edge Function `repi-storage` desplegada y probada (subida, lectura con rango, URL firmada de subida, borrado, 404 sin secreto); driver proxy en `storage.ts`; variables `SUPABASE_STORAGE_PROXY_URL`, `STORAGE_PROXY_SECRET`, `AUTH_TRUSTED_ORIGINS` en Vercel; repiclub.com + www agregados al proyecto; `mailer.ts#resendDomain` + `/api/cron/mail-domain`; Resend se activa sólo con `RESEND_API_KEY`.
- **Pendiente del titular:** nameservers de GoDaddy → `ns1.vercel-dns.com` / `ns2.vercel-dns.com`; cargar `RESEND_API_KEY` en Vercel (Claude no carga claves de cuentas del titular); revocar el token `sbp_…` compartido en el chat (no se usó).
- **Después de eso (Claude):** URLs de auth al dominio nuevo, registros DNS de Resend, `MAIL_FROM` con el dominio, prueba de alta con email real.

## Bloque anterior — 27/10/2026 · Guía sin «Continuar en el navegador» y Resend en DEMO (D82)

- **Hecho:** `InstallGuide.tsx` (sólo «Agregar Repi a inicio» si el navegador lo permite y «Ver cómo hacerlo»; sin salida al navegador), `mailer.ts` (DEMO + Resend: envío real y copia en buzón; rechazo no corta), test en `tests/mailer.test.ts`, `documentacion/pwa/verificar-guia.mjs` actualizado.
- **Pendiente del titular:** cargar `RESEND_API_KEY` y `MAIL_DRIVER=resend` en Vercel; verificar dominio en Resend. `MAIL_FROM` ya cargado (`REPI <onboarding@resend.dev>`).

## Bloque anterior — 27/10/2026 · Rendimiento del cliente (D81, F-CO-04)

- **Hecho:** `training/services.ts#clientPerformance` (reusa `bestE1rm`/`epley1rm` del dominio), ruta `/api/coach/[orgId]/clients/[relId]/performance`, `PerfTab` en `CoachClients.tsx`.
- **Pruebas:** web 107/107, dominio 74/74, build OK.

## Bloque anterior — 27/10/2026 · Cobros manuales coach → alumno (D80)

- **Hecho:** migración `0010_coach_charges` (dev local y Supabase), `src/server/coachpay/services.ts`, rutas `/api/coach/[orgId]/payments`, `/payments/[id]`, `/clients/[relId]/charges`, `/api/me/charges`; `components/coach/CoachPayments.tsx` (pantalla, modales, pestaña de la ficha), vista «Pagos con tu coach» en Perfil.
- **Pruebas:** web 106/106 (test en `tests/training.test.ts`), build OK, captura headless de la pantalla.
- **Siguiente V1.1 sugerido:** F-CO-04 (1RM estimado Epley, volumen por grupo), F-HX-23 (configuración kg/lb, notificaciones), F-CO-16 (informe mensual).

## Bloque anterior — 27/10/2026 · Accesos denegados auditados y resumen Admin (D78, D79)

- **Hecho:** `access/http.ts#recordDenied` (en `handle` y `/api/media`), `commercial/services.ts#adminSummary`, `GET /api/admin/summary`, pantalla «Resumen» en `AdminApp.tsx`. Tests `tests/denied.test.ts` y resumen en `tests/privacy.test.ts`.
- **Pruebas:** web 105/105, typecheck y build OK.
- **V1 del catálogo sin implementar:** F-PR-03 (notas institucionales vs personales).

## Bloque anterior — 27/10/2026 · Aviso de programa nuevo/actualizado (D77, F-CL-14)

- **Hecho:** `training/services.ts` (`program.update` en `myTraining`, `previousVersion`), `assignedAt` explícito en asignaciones (coach y gym), ruta `/api/me/training/previous`, `ProgramNotice` en `MemberApp.tsx`, tipo `ProgramUpdate`.
- **Pruebas:** web 103/103 (test nuevo en `tests/training.test.ts`), build OK, captura headless del aviso.
- **Quedan V1 sin implementar del catálogo:** F-PR-03 (notas institucionales vs personales), F-PR-04 (acceso denegado + auditoría), F-AD-01 (resumen Admin).

## Bloque anterior — 27/10/2026 · Registro de errores sin datos sensibles (D76)

- **Hecho:** `src/server/log.ts` + uso en `access/http.ts#handle`, `/api/media/[id]`, `/api/cron/*`; `tests/log.test.ts`.
- **Pruebas:** web 102/102, typecheck y build OK.
- **Cómo mirar errores en vivo:** `vercel logs repi-app.vercel.app` o el panel de Vercel → Logs (filtrar `"level":"error"`).

## Bloque anterior — 27/10/2026 · Exportación y eliminación de datos (D75)

- **Hecho:** migración `0009_privacy_requests` (dev local y Supabase), `src/server/privacy/services.ts`, rutas `/api/me/export`, `/api/me/deletion`, `/api/me/deletion/[id]`, Admin `GET /api/admin/privacy` y `POST /api/admin/privacy/:id/resolve`; Perfil «Tus datos»; Admin «Privacidad»; `docs/PRIVACIDAD_OPERACION.md`.
- **Pruebas:** `tests/privacy.test.ts` (3); web 101/101, typecheck y build OK.
- **Pendiente del titular:** política de retención, responsable del tratamiento y textos legales.

## Bloque anterior — 27/10/2026 · Límites de intentos compartidos (D74)

- **Hecho:** migración `0008_shared_rate_limits` (aplicada en dev local y Supabase), `access/util.ts#rateLimit` en base (async), Better Auth `rateLimit.storage = "database"`, `tests/ratelimit.test.ts` (ventana, reinicio y concurrencia).
- **Pruebas:** web 97/97, typecheck y build OK.

## Bloque anterior — 27/10/2026 · Defectos de ESTADO_ACTUAL §7 y §8 (D72, D73)

- **Multisede (D72):** `src/server/gym/alerts.ts#alertLocation` usa el ingreso registrado por recepción (≤ 4 h, sede con acceso vigente); test nuevo en `tests/annex.test.ts`.
- **Cola tras pausa/baja (D73):** `lib/offline/queue.ts` + `store.ts` (`rejected`), aviso con «Reintentar» / «Descartar de este teléfono» en `Workout.tsx`, botón «Continuar entrenamiento en curso» en el inicio (`MemberApp.tsx`). Verificado en local con Chrome headless: pausar vínculo → serie → aviso persistente tras recargar → reactivar → «Reintentar» → «Guardado».
- **Pruebas:** web 95/95, typecheck y build OK.

## Bloque anterior — 27/10/2026 · Subida directa de videos (D71)

- **Hecho:** tabla `upload_intent` (migración `0007_direct_upload`, aplicada en dev local y Supabase), `src/server/uploads.ts` (begin/complete/purge), rutas `POST /api/uploads` y `POST /api/uploads/[id]`, `storage.ts#directUploadTarget/probeObject`, `src/lib/upload.ts#uploadVideo` usado en pedido con video (FollowSheets) y video de desafío (Gym). Job diario limpia intenciones vencidas. `scripts/migrate.ts` activa RLS en tablas nuevas.
- **Pruebas:** web 94/94 (nuevo `tests/uploads.test.ts` con Supabase simulado), dominio 74/74, typecheck y build OK.
- **Falta:** `SUPABASE_SECRET_KEY` en Vercel para que funcione en el entorno hospedado; probar una subida real desde un teléfono.

## Bloque anterior — 27/10/2026 · Corte 2: adaptador de correo (D70)

- **Hecho:** `src/server/mailer.ts` con driver Resend (HTTP, timeout, `MailError` reintentable o no, sin exponer el cuerpo) + buzón DEV/DEMO + error explícito en producción. `tests/mailer.test.ts` (contrato, sin envíos reales). Variables en `.env.example`; pasos en docs/DESPLIEGUE.md.
- **Falta (titular):** elegir proveedor, verificar dominio y cargar `MAIL_DRIVER`, `RESEND_API_KEY`, `MAIL_FROM`. Hasta entonces el entorno sigue en modo DEMO.

## Bloque anterior — 27/10/2026 · Corte 1: guía PWA y continuidad de alta (D69)

- **Hecho:** `components/access/InstallGuide.tsx` (guía por plataforma), `InstallHelp.tsx` + `app/instalar` (ayuda), `lib/entry.ts` (contexto de entrada y recuperación), `lib/platform.ts` (detección y `beforeinstallprompt`), `AccessFlow.tsx` (guía antes del alta móvil sin sesión, «Retomá tu alta», paso `recover`, paso `pendingInv`), `server/access/services.ts#pendingInvitations` + `/api/access/me` (`invitations`), `app/page.tsx` (inicio según sesión), `manifest.ts` (`id` y `start_url` estables), `public/sw.js` (inicio sin red → carcasa de /app), `layout.tsx` (captura del evento de instalación, meta web app de Apple), enlace en Perfil.
- **Pruebas:** typecheck y build OK; web 85/85 (nuevos: invitaciones pendientes vigentes del mismo email; `parseEntryInput` sólo destinos internos); Chrome headless emulando iPhone, Android, navegador interno y escritorio: script `documentacion/pwa/verificar-guia.mjs`, captura `documentacion/pwa/guia-iphone-2026-10-27.png`. **No probado en teléfonos reales** (gate G03).
- **Límite real:** Android no muestra «Instalar» porque falta el ícono 192/512 aprobado (D35); la guía da los pasos manuales.

## Bloque anterior — 27/10/2026 · Hosting DEMO (Vercel + Supabase)

- **Objetivo:** pedido del usuario «Configurá el hosting con Vercel y la base con Supabase». Hecho como entorno **DEMO** (D68). Detalle operativo: docs/DESPLIEGUE.md.
- **En vivo:** https://repi-app.vercel.app · deploy automático en cada push a `main`. Supabase `repi` (sa-east-1) migrado 0000–0006, seed DEMO cargado, RLS activado, bucket privado `repi-private`, pg_cron de avisos cada minuto respondiendo 200.
- **Código:** `src/server/deploy.ts` (REPI_DEPLOY=demo), `mailer.ts` (buzón DEV en demo), `app/dev/mailbox` (sólo REPI Admin en demo), `storage.ts` (driver Supabase Storage), `db/index.ts` (pooler sin prepare), `push/services.ts` (after()), `app/api/cron/*`, `server/cron.ts`, `vercel.json`, `scripts/schedule-cron.ts`. Test de sync estable cerca de medianoche.
- **Pruebas:** typecheck OK; web 80/80 y dominio 74/74 contra `repi_test` local; build OK; humo hospedado: /acceso 200, /unirse/demo-palermo muestra Gym Norte · Palermo desde Supabase, /api/cron/notifications 200 con secreto y 404 sin él. No se probó login en el entorno hospedado desde esta sesión.
- **Secretos:** sólo en `~/.repi-secrets/` del titular y en Vercel. Nunca en el repo.
- **Pendiente inmediato del titular (un paso):** cargar `SUPABASE_SECRET_KEY` en Vercel (ver docs/DESPLIEGUE.md) para habilitar subidas.
- **Próxima acción técnica:** corte 3 (alta y atención en gym: misma cola piso/recepción, push con fallback, concurrencia/revocación) y corte 6 (operación durable: backups, límites, exportación/borrado).

## Objetivo inmediato

Cerrar una primera versión web/PWA utilizable por gyms y coaches cuanto antes; completar después el resto. No reconstruir núcleo, G · Atlética ni M01–M05 si las pruebas del código actual confirman que funcionan.

## Snapshot

Commit observado al inicio: 25ea04a3b9263bbd797aed3c09b97168b698d773. En esta revisión se cambiaron documentos y se agregaron docs/continuidad/; no se cambió código de producto ni DB. El directorio documentacion/historial/2026-10-27_antes_de_continuidad/ conserva entradas anteriores. Git puede mostrar esos cambios sin commit; respetarlos. Releer Git al arrancar por posible trabajo posterior de Claude.

## Primera acción concreta

1. Leé el máster y ESTADO_ACTUAL.md, revisá Git y las rutas de acceso/PWA.
2. Confirmá si ya hay guía de instalación/continuidad agregada después de este snapshot. Si falta, implementá el corte PWA previo al login conforme al anexo: guía por dispositivo, conservar/recuperar invitación/QR, salida navegador y acceso desde inicio. Reutilizá auth/service worker; no crear una app nueva.
3. Si ya está resuelto, siguiente bloqueo: mailer productivo (el inspeccionado falla en producción). Prepará un adaptador y configuración verificable; credenciales y proveedor requieren decisión del titular, no inventarlas.
4. Antes de pruebas de integración, revisá/endurcé la guarda de TEST_DATABASE_URL, porque global-setup borra esquemas. Durante la preparación documental no se ejecutó esa suite.
5. Continuá por los gates V1 y dejá evidencia. No dediques el bloque inicial a BI experimental ni a repetir motion.

## Bloqueos externos conocidos

Proveedor/remitente email, dominio/hosting/DB/almacenamiento durable, claves push productivas y teléfonos, textos/menores/retención, condiciones de cobro/corte/piloto. Ver DECISIONES_PENDIENTES.md. Implementar trabajo independiente mientras se concretan; no declarar lanzamiento por pasar pruebas simuladas.

## Pruebas de esta revisión

Se revisó documentación/código de forma acotada y se verificará la integridad de este paquete documental. No tests/build de la app, no migraciones, no correos externos, no despliegue. Los números de tests del desarrollador anterior son históricos y se deben distinguir de una ejecución nueva.

## Plantilla de actualización al cerrar cada bloque

- Fecha, objetivo y commit actual:
- Cambios sin commit y archivos tocados:
- Comportamiento real logrado / limitaciones:
- Comandos ejecutados, entorno y resultados:
- Migraciones y compatibilidad de datos/cola:
- Dependencias/configuración nuevas (sólo nombres, sin secretos):
- Decisiones confirmadas / propuestas / pendientes:
- Gates de lanzamiento que cambian de estado y evidencia:
- Próxima acción concreta y archivos de entrada:
- Servicios activos necesarios (puertos/propósito, sin credenciales):
