# REPI — Retomar acá

Actualizado: 29/10/2026 (hasta D157), sobre la release candidata rc-2026.10.27 (D111). Leer primero docs/RELEASE_READINESS.md y docs/LAUNCH_BLOCKERS.md. Máster activo: ../../MASTER_PROMPT.md.

## Alta aprobada sin 404 y sugerencias en Inicio (D157) — 29/10/2026

- **Bug (JOIN-1):** una socia aprobada por QR veía «404» al entrar. «Continuar» volvía a pedir el acceso, salteaba el consentimiento y `/app` daba `notFound()` con la membresía en `pending_consent`. Afectó a las 2 últimas altas de producción, que ahora entran y ven el consentimiento.
- **Archivos:** `components/access/AccessFlow.tsx` (`afterAuth`, `requestJoin`), `server/join/services.ts` (`href` según estado), `app/app/page.tsx` (redirige a `/acceso`).
- **Sugerencias:** `Ideas.tsx` ahora vive en Inicio (`Home` en `MemberApp.tsx`), plegada; ya no está en Perfil.
- **Pruebas:** web 243 ✓ (`annex.test.ts` cubre el `href`), E2E 36/36 ✓. Navegador: `/app` y el QR con `pending_consent` llevan a «Qué ve Gym Norte» → app.
- **Próxima acción:** confirmar con la socia afectada que ya entra.
- **Incidente 29/10, 22:43–22:58 (resuelto):** al diagnosticar JOIN-1, un `SET default_transaction_read_only=on` hecho por el pooler en modo transacción (`DATABASE_URL`, puerto 6543) quedó pegado a una conexión de la app. Dio 500 con código 25006 en `/api/me/notifications`, `/api/me/inbox` y el cron de notificaciones. Se corrigió solo cuando Supavisor recicló la conexión; desde las 22:59 no hubo más errores. Sólo fallaron lecturas y marcas de visto: no se perdieron entrenamientos ni datos. **Regla:** para leer producción usar `DATABASE_URL_SESSION` con `BEGIN READ ONLY … COMMIT`, nunca un SET de sesión.

## «Sugerí una mejora» (D156) — 29/10/2026

- **Alumno:** `components/member/Ideas.tsx`, en Perfil.
- **Servidor:** `server/support/services.ts`: categoría `idea`, `notifyIdea` (email a `ALERT_EMAIL`), filtro `ideas` y `ideasNew`.
- **Admin:** «Sugerencias» en `AdminApp.tsx`.
- **Pruebas:** web 243 ✓, E2E 36/36 ✓. Navegador: el alumno la manda y la ve «Enviada».

## «Armar con REPI» (D155) — 29/10/2026

- **Servidor:** `server/training/program-ai.ts` (`draftProgram`, `cleanBrief`), `memberProgramDraft` (gym) y `coachProgramDraft` (coach).
- **Rutas:** `POST /api/gym/:org/members/:id/program-draft` y `POST /api/coach/:org/programs/draft`.
- **UI:** `components/coach/ProgramAssistant.tsx`.
- **Arreglo:** carrera vieja en `Workout.tsx`. Al sincronizar el inicio, una copia vieja podía pisar el peso tipeado de una serie sin completar.
- **Pruebas:** web 242 ✓, dominio 153 ✓, E2E 36/36 ✓. Con IA real en local: 4,4 s, evita la zona lesionada y el nombre no menciona la salud.

## Carga sugerida por REPI (D154) — 29/10/2026

- **Regla:** `packages/domain/src/progression.ts` (`suggestNext`, `applyLoad`).
- **Servidor:** `lastTimeByExercise` y la sugerencia en `myTraining` y `getSession`; `coachProgramLastTimes` (`server/training/services.ts`); `memberLastTimes` (`server/gym/services.ts`).
- **UI:** «REPI sugiere hoy» en `Workout.tsx`; precarga en `begin` y `fromServer`; `LoadSuggestion` en el constructor del coach y el editor del gym.
- **Pruebas:** dominio 153 ✓, web 242 ✓, E2E 36/36 ✓. Navegador: el alumno de la demo ve «53 kg × 8 reps» con el porqué.

## Entrenar sin rutina asignada (D153) — 29/10/2026

- **Qué cambió:** «No vino el profe» y «Quiero entrenar por mi cuenta» funcionan aunque la persona no tenga rutina.
  - REPI arma la rutina de hoy con la biblioteca (`server/training/solo-routine.ts`, con IA y respaldo por reglas).
  - Se empieza con `startSoloRoutine` en `server/training/services.ts`. Rutas: `/api/me/solo/routine` y `/api/me/solo/routine/start`.
  - UI: `RoutineCard` en `components/member/Solo.tsx` y `startRoutine` en `MemberApp.tsx`.
- **Diseño:** la sesión usa un programa `solo` de un día con la asignación ya cerrada. No es «el programa» de la persona. Sin migración.
- **Pruebas:** web 240 ✓ (3 nuevas en `tests/adaptive.test.ts`), dominio 146 ✓, E2E 36/36 ✓. Navegador (iPhone emulado, local): armó 4 ejercicios y abrió el entrenamiento.
- **Siguiente:** que el titular lo pruebe con un alumno real sin rutina.

## AUDITORÍA QA (D151) y QR de la sede (D152) — 29/10/2026 (leer primero)

- **Estado:**
  - En `main` y publicado. El titular autorizó publicar.
  - **Sin migraciones.**
  - `apps/web/vercel.json` despliega sólo `main`: las ramas no generan previews, que fallaban por falta de variables de Preview.
- **Auditoría:**
  - 48 defectos válidos: 46 corregidos y 2 riesgos aceptados (SEC-9 = D119 admin sin 2FA; esbuild de una herramienta de desarrollo).
  - Informe: `docs/qa/QA_MASTER_REPORT.md`. Registro: `docs/qa/BUG_REGISTER.md`.
- **D152:** el QR de la sede (`/unirse/<slug>`) va directo a «Pedí tu acceso». La guía para agregar a inicio aparece con la solicitud enviada.
- **Pruebas:**
  - Web 238 ✓, guardas ✓, dominio 146 ✓, `tsc` ✓, build ✓.
  - E2E: con `cd apps/web && pnpm build && pnpm start` corriendo, en otra terminal `pnpm e2e`. Resultado: 36/36 (Playwright + Chrome + axe, sólo contra un servidor local).
- **Siguiente:**
  1. Que el titular pruebe el QR con un teléfono real.
  2. 2FA de admin cuando lo decida (SEC-9).
  3. Teléfonos reales (LB-03).
  4. Si un contrato supera ≈ ARS 21,4 M por período, migrar los importes a bigint.

## TRASPASO PARA OTRO AGENTE — 29/10/2026 (leer primero)

**Estado:** todo lo pedido hasta **D150** está en `main` y publicado en https://repiclub.com (verificar con `curl https://repiclub.com/api/version`). Migraciones hasta 0031 aplicadas en Supabase (0031 = `gym_access_display.purpose`). Nada pendiente sin commitear salvo `docs/continuidad/CODEX_PARA_CLAUDE.md` (no tocar).

**Cómo trabajar (mandato del titular):** seguir sin preguntar, bloque tras bloque; commit y push a `main` de cada bloque; actualizar `docs/DECISIONS.md` (una fila por decisión, D-número siguiente: **D157**) y este archivo al cerrar cada bloque; chat en español y conciso; Barlow / Barlow Condensed, no tocar logo. En la interfaz decir «REPI», no «IA» (D141), salvo la mención de OpenAI en notas de privacidad.

**Comandos:** web `cd apps/web && pnpm vitest run` (221 pruebas; `tests/global-setup.ts` borra sólo la base `repi_test`), `pnpm test:guards`, `pnpm exec tsc --noEmit`, `pnpm build` (con el dev detenido; después `git checkout next-env.d.ts`). Dominio `cd packages/domain && pnpm test && pnpm typecheck` (141). Migraciones: `pnpm db:generate --name X`, `pnpm db:migrate` (dev, base `repi_dev`); producción: `DATABASE_URL="$(grep ^DATABASE_URL_SESSION ~/.repi-secrets/supabase.env | cut -d= -f2-)" npx tsx scripts/migrate.ts` desde `apps/web`, **antes** del push. Dev server: launch `repi-local`. Demo: `POST /api/demo {role: owner|floor|member|coach}` (límite 6/h por IP, en `app_rate_limit`).

**Secretos (nunca en el repo ni en logs):** `~/.repi-secrets/supabase.env`, `~/.repi-secrets/openai.env`. OpenAI: `OPENAI_API_KEY` y `OPENAI_MODEL=gpt-4.1-mini` en Vercel y en `apps/web/.env.local`. El titular rota la clave cuando avise (no insistir). Respuestas de IA ≤3 s: gpt-4.1-mini con salida corta (gpt-5-mini tarda 4–17 s; gpt-4.1-nano dado de baja).

**Resuelto en esta tanda (D127–D141):** Gym Access (D127); invitaciones, calendario y ver contraseña (D128, D130, D136); ejercicios propios y catálogo (D129); «En sala ahora» (D131); historial anterior con IA (D132) y desde Excel/ODS (D140); «No vino el profe» con IA (D133), con respuesta del alumno y reemplazos válidos (D138) y «Lo que buscás entrenando» (D139); prescripción avanzada (D134) y superseries que alternan solas (D137); guía del dueño (D135); textos «REPI» y privacidad al día (D141).

**Pedidos nuevos del titular (29/10/2026, en curso — si este agente no llegó, seguir acá):**
- **A. Cambios de rutina en tiempo real: HECHO (D143 + D145).** Con entrenamiento abierto, «Aplicar ahora» pasa lo hecho a la versión nueva.
- **B. Ranking por gimnasio y ejercicio en vivo: HECHO (D144 + D146 pantalla de la sala).** Falta, si el titular quiere: rankings por categoría (peso corporal, sexo, edad) con consentimiento.

**Alertas y correos (D149):** alertas de errores a `ALERT_EMAIL` (Vercel) y todos los correos con plantilla REPI. Foto de perfil del remitente en Gmail: requiere que el titular (a) reciba correo en hola@repiclub.com (reenvío gratis, p. ej. ImprovMX, con registros MX en Vercel DNS) y (b) cree una cuenta de Google con esa dirección y le ponga el ícono de REPI; o BIMI con certificado VMC/CMC (pago). Claude no crea cuentas. (En pausa por decisión del titular, 29/10/2026.) D150: la cabecera del correo es `icons/mail-header.png` (ícono igual al de la pantalla de inicio + marca sobre fondo oscuro); se regenera con `npx tsx scripts/brand-icons.ts`.

**Decisiones del titular pendientes:**
1. El titular decidió **no** pedir nueva aceptación por ahora (no subir `TERMS_VERSION`); lo revisa más adelante con el abogado.
2. La precarga de «No vino el profe» manda datos de entrenamiento a OpenAI al abrir Entrenar (sin tocar el botón). Si el abogado lo pide, pasar a pedirla sólo al tocar (pierde la respuesta instantánea).

**Próximos pasos sugeridos:**
1. Excel verificado con 25 archivos reales (D142). Falta: un .ods real y los archivos del alumno de Urko.
2. HECHO (D147): «Lo que buscás entrenando» lo ve el coach o el gym si la persona marca «Que lo vea quien arma mi rutina».
3. Que entrenadores reales prueben «Series y técnica» en el celular. HECHO (D148): cronómetro para series por tiempo y contador para AMRAP/al fallo.
4. «No vino el profe» medido en producción (D142): primera sugerencia 2,3–3,8 s (se precarga al abrir Entrenar), rearmar 2,7–3,8 s, reemplazo correcto 3 de 3.
6. Bloqueantes del titular (docs/LAUNCH_BLOCKERS.md): LB-02 planes pagos de Vercel/Supabase, LB-03 teléfonos reales, LB-04 abogado y datos de la empresa, LB-05 respaldos fuera de la computadora, LB-06 alertas de errores; además dominio de correo y rotar la clave de OpenAI.
5. Pendientes externos: cámara del QR de ingreso en iPhone/Android reales (LB-03), revisión legal de la ubicación (Gym Access), dominio de correo.

## Último bloque cerrado — 29/10/2026 · Superseries (D137), respuesta a la IA (D138), deseos (D139), Excel (D140) y textos «REPI» (D141)

- **Hecho:** `comboNext` + vista previa A1/A2 (`MemberApp.tsx`, `Workout.tsx`); `dayAlternatives` (`server/training/services.ts`), `aiSoloAdvice(…, follow)` (`server/training/ai-coach.ts`), `/api/me/solo/ai` con `follow`, tarjeta con «Ocupada / No hay / Me molesta» y «Rearmar mi rutina» (`components/member/Solo.tsx`), plan aceptado aplicado al iniciar (`aiPlan` en `MemberApp.tsx`); `packages/domain/src/wishes.ts`, `components/member/Wishes.tsx`, `server/settings/services.ts` (**migración 0030**); `src/lib/spreadsheet.ts` + `HistoryImport.tsx`; textos y `app/legal/[doc]/texts.ts`.
- **Pruebas:** dominio 140, web 218 (nuevas: `spreadsheet.test.ts`, casos en `substitutions.test.ts` y `settings.test.ts`). Navegador (dev): A1→A2 sin descanso, rearmado con reemplazos aplicados en la sesión, guardado de deseos.
- **Siguiente:** ver «Decisiones del titular pendientes» y «Próximos pasos» arriba.

## Bloque anterior — 29/10/2026 · Prescripción avanzada (D134), guía con IA del dueño (D135) y aceptar invitación con la cuenta abierta (D136)

- **Hecho:** `packages/domain/src/prescription.ts` (+ tests); `program_exercise.detail` (**migración 0029**); `components/coach/ExerciseDetailEditor.tsx` en ambos constructores, fila con rótulos en el celular; entrenamiento del socio con objetivo por serie (`store.ts`, `Workout.tsx`). `server/gym/owner-assistant.ts`, `server/ai/gym-kb.ts`, `components/gym/OwnerGuide.tsx` en Ejecutivo y Panel. `AccessFlow`: «Aceptar con mi cuenta».
- **Producción:** invitación de Smart Center Gym aceptada para la cuenta del titular (D136).
- **Siguiente:** que los entrenadores prueben el editor en el celular; registrar AMRAP/tiempo con su propio control; IA en otras pantallas con revisión de privacidad.

## Bloque anterior — 28/10/2026 · Historial anterior con IA (D132) e IA en «No vino el profe» (D133)

- **Hecho:** `packages/domain/src/history-import.ts` (+ tests); `apps/web/src/server/ai/openai.ts` (cliente con esquema JSON estricto), `server/training/history-import.ts`, `server/training/ai-coach.ts`; rutas `/api/me/history-import/*` y `/api/me/solo/ai`; `components/member/HistoryImport.tsx` («Antes de REPI» en Progreso) y tarjeta de IA en `Solo.tsx`. Migración **0028** (`history_import`, `history_entry`).
- **IA:** OpenAI `gpt-4.1-mini` (`OPENAI_MODEL`, `OPENAI_MODEL_FAST`; ≈2 s; «No vino el profe» se precarga). Clave en Vercel y `.env.local`, copia en `~/.repi-secrets/openai.env`. Recomendado rotarla porque se pegó en el chat.
- **Siguiente:** D134 editor avanzado de series (combinaciones, drop sets, top sets, peso por serie, tempo, intensidad) pedido por entrenadores; probar con archivos reales del alumno de Urko; medir costo y tiempos; evaluar IA para coaches (resumen de progreso del alumno) con revisión de privacidad.

## Bloque anterior — 28/10/2026 · Ejercicios propios (D129), alta por invitación sin código (D130) y «En sala ahora» (D131)

- **Hecho:** `packages/domain/src/exercise-catalog.ts` (~200 ejercicios), `apps/web/src/server/training/library.ts` (`ensureExerciseCatalog`, `createOwnExercise`), rutas POST de biblioteca coach y gym, `components/coach/NewExercise.tsx` en ambos constructores. Invitación: `assertInvitationEmail` devuelve si está ligada, `verifyByInvitation`, `sendSignupOtp`; `AccessFlow` entra directo tras el alta por invitación.
- D129/D130 sin migración. OpenAI: `OPENAI_API_KEY` y `OPENAI_MODEL=gpt-5-mini` cargadas en Vercel (producción) y en `.env.local`; copia en `~/.repi-secrets/openai.env`. Nunca en el repo.
- **D131:** `apps/web/src/server/gym/floor-now.ts`, `components/member/FloorNow.tsx`, `components/gym/FloorNow.tsx`, migración **0027** (`gym_floor_pick`, `workout_session.floor_trainer_id`), `tests/floor-now.test.ts`.
- **Siguiente (pedidos del titular 28/10):** D132 importar historial desde un archivo con IA al progreso; IA en «No vino el profe» y donde sume.

## Bloque anterior — 28/10/2026 · Gym Access Control · ingreso validado (D127)

- **Hecho:** dominio `packages/domain/src/gym-access.ts`; migración `0026_gym_access` (política, pantallas, `gym_checkin`, `gym_member.access_until`, geo de sede, `workout_session.presence_checkin_id`); servidor `apps/web/src/server/gym/access-control.ts` con ganchos en entrenamiento, accesos, carnet, Connect y Admin; socio `components/member/Presence.tsx` (cámara con BarcodeDetector o jsQR, hoja, chip) y `/ingreso`; kiosco `/ingreso/pantalla` (`components/gym-access/{LiveQr,KioskDisplay}.tsx`, `styles/gym-access.css`); «Acceso y presencia» `components/gym/AccessControl.tsx` (panel, política, pantallas y sedes, validar a mano, QR a pantalla completa), validación a mano en Recepción y en «Mi turno», «Vigente hasta» en Accesos, tarjeta en Admin, guías y demo.
- **Pruebas:** dominio 126/126, web 203/203 (`tests/gym-access.test.ts` 11; `sandbox.test.ts` ya no falla al azar: fijaba una sede cualquiera), guardas 11/11, build OK. Navegador: socio 375 px, dueño, kiosco.
- **Migración 0026:** aditiva. Ver estado de publicación en la línea siguiente.
- **Docs:** `docs/gym-access/` (8), FEATURE_FLAGS, IMPLEMENTATION_STATUS, RELEASE_READINESS (GA-01..08), D127.
- **Siguiente:** activar el módulo en un gimnasio piloto desde Admin; probar la cámara en iPhone y Android reales (LB-03); revisión legal antes de usar ubicación. Pendiente aparte: historial anterior (D132).

## Bloque anterior — 28/10/2026 · Altas por invitación: email, fecha con calendario y ver contraseña (D128) — publicado en `main`

- **Hecho:** pista del email invitado y freno antes de crear la cuenta (`assertInvitationEmail` en `/api/access/sign-up`, `maskEmail` en el dominio), fecha de nacimiento con selector nativo (`parseBirthDate` acepta también AAAA-MM-DD y DDMMAAAA), `components/access/PasswordInput.tsx` con Mostrar/Ocultar en todos los campos de contraseña.
- **Pruebas:** dominio 120/120, web 192/192, guardas 11/11; navegador 375 px con una invitación de alumno completa.
- **Sin migración.** Siguiente: retomar Gym Access (D127) en la rama `gym-access` (mergear `main` primero) y el historial anterior (D132).

## Bloque anterior — 28/10/2026 · REPI Connect · seguimiento de sala (D126) — publicado (a65195e)

- **Hecho:** Core completo sobre la cola existente. Dominio `packages/domain/src/connect.ts` (+ tests). Servidor `apps/web/src/server/gym/connect.ts`; `gym/services.ts` exporta helpers, suma `addEvent`, estados `in_progress`/`follow_up` y eventos en la cola anterior; `metrics.ts`, `notices.ts`, `push/services.ts`, cron y `scripts/notifications.ts` (job `connectSweep`). Rutas `/api/me/gym/connect…`, `/api/gym/[orgId]/connect/…`, `/api/admin/contracts/[id]/connect`. UI: `components/member/Connect.tsx` (+ `MemberApp`, `Workout`, `FollowSheets`), `components/gym/Connect.tsx` (+ `GymApp`, guía), tarjeta en Admin, recorrido de la demo. Demo con Connect activo (`sandbox/services.ts#connectHistory`).
- **Migración 0025** (`drizzle/0025_connect.sql`, sólo agrega + trigger de historial): aplicada en dev y `repi_test`; **NO aplicada en Supabase**.
- **Pruebas:** dominio 118/118, web 192/192 (`tests/connect.test.ts` 11), guardas 11/11, build OK. Navegador local: socio 375 px, profesor y dueño en escritorio.
- **Docs:** `docs/connect/` (8 documentos), FEATURE_FLAGS, IMPLEMENTATION_STATUS, RELEASE_READINESS (RC-01..08), D126.
- **Siguiente:** con autorización del titular (el pedido prohíbe deploy público sin autorización): aplicar 0025 en Supabase (`docs/DEPLOYMENT.md` paso 2), mergear `repi-connect` a `main`, push, verificar `/api/version` y una demo en producción. Después: activar el piloto en un gimnasio desde Admin y probar en teléfonos reales.

## Bloque anterior — 28/10/2026 · Kit de difusión para gimnasios (D125)

- **Hecho:** `marketing/kit-gimnasios/` con `generar.mjs`, `LEEME.md` y la versión general en `salida/general/` (folleto A5 frente/dorso, 3 stickers, vinilo de vidriera, historia, post y WhatsApp; PDF para imprenta y PNG). Revisadas todas las piezas en imagen. Las versiones por sede (`--gym`, `--url`) se generan aparte y no se suben (`.gitignore`). No toca la app, sin tests nuevos.
- **Siguiente:** el titular genera la versión de cada gimnasio con el enlace de su sede y prueba el QR impreso antes de la tirada. Pendientes externos LB-02..LB-06 y O-01..O-05.

## Bloque anterior — 28/10/2026 · Corregir y eliminar clientes en Admin (D124)

- **Hecho:** «Editar datos» y «Eliminar cliente» en la ficha de Admin (`AdminApp.tsx`, `updateClient`/`deleteClient`, rutas `update`/`delete`). Tests web 181/181, guardas 11/11, `tsc` y build OK. Probado en local: alta de «Gym Cargado Mal», corrección de nombre y moneda, eliminación con el nombre exacto. Sin migración.
- **Siguiente:** pendientes externos LB-02..LB-06 y observaciones O-01..O-05.

## Bloque anterior — 28/10/2026 · Pasos para agregar a inicio después del registro (D123)

- **Hecho:** `InstallSteps` (`apps/web/src/components/access/InstallGuide.tsx`, estilos `.ig-box` en `access.css`) en «¡Listo!», espera de aprobación del QR y nueva pantalla `ready` de `AccessFlow.tsx` (función `enter`). Tests web 179/179, `tsc` y build OK. Probado en local: invitación de Coach Simulación → registro de `sim.alumno2@example.com` → «¡Listo!» con pasos.

## Bloque anterior — 28/10/2026 · Contenido fuera del difuminado de iOS 26 (D122)

- **Hecho:** variable `--safe-top` en `apps/web/src/styles/globals.css` (zona segura + 28 px sólo con la app instalada y zona segura arriba); reemplaza `env(safe-area-inset-top)` en `coach.css`, `member.css`, `access.css`, `site.css`, `globals.css` y `Workout.tsx`. Tests web 179/179, `tsc` y build OK.
- **Siguiente:** el titular cierra y reabre la app instalada en el iPhone para confirmar. Si la franja sigue tapando, subir el valor de 28 px en `--safe-top`.
- **Presentación:** logo de portada y cierre cambiado por el wordmark con punto `#00D1FF` (como `Wordmark.tsx`).

## Bloque anterior — 28/10/2026 · Franja de la hora sin degradé (D121)

- **Hecho:** `apps/web/src/styles/coach.css` pinta el fondo del documento en `--core-navy900` cuando hay un panel `.co` (Admin, Coach, Gym), así la franja de la hora del iPhone instalado coincide con la barra superior. Pruebas: web 179/179, guardas 11/11, dominio 107/107, `tsc` y build OK. Producción respondió 200 en `/`, `/acceso`, `/demo`, `/legal/*`, `/ayuda`, `/instalar`, manifest e íconos.
- **Siguiente:** confirmación en el iPhone del titular (cerrar y reabrir la app). Pendientes externos sin cambios: LB-02..LB-06 y observaciones O-01..O-05.

## Bloque anterior — 28/10/2026 · Zona segura del iPhone en Admin, Coach y Gym (D120)

- **Hecho:** `apps/web/src/styles/coach.css` reserva `env(safe-area-inset-*)` en la barra superior móvil, el menú lateral, el contenido, modales y avisos. Verificado con emulación de zona segura en Chrome headless. Falta confirmarlo en el iPhone del titular (LB-03).
- **Presentación comercial de REPI Gym:** https://claude.ai/artifact/PoWrSc3MnxWUXHZbhsZvYP (16 diapositivas, capturas de la demo local).

## Bloque anterior — 28/10/2026 · 2FA optativa y «Mi cuenta» (D119)

- **Hecho:** la verificación en dos pasos ya no se exige a nadie (`TWO_FACTOR_REQUIRED` en el dominio); `/cuenta` permite activarla o quitarla. Tests: `access.test.ts`, `gym.test.ts`, `privacy.test.ts` y el de dominio pasan a «optativa». Sin migración.
- **Navegador local:** el dueño quitó la 2FA desde «Mi cuenta», volvió a entrar sólo con contraseña y abrió su panel; «Activar» lleva al paso de `/acceso` y «Ahora no» vuelve a «Mi cuenta».
- **Siguiente:** presentación comercial de REPI Gym; cuentas de prueba en producción las crea el titular desde Admin (Claude no crea cuentas en producción).

## Bloque anterior — 28/10/2026 · Auditoría por simulación de todos los roles (D118)

- **Hecho:** simulación completa en dev local con cuentas nuevas por el circuito real (Admin, coach y alumna, dueño con 2FA TOTP, sala, recepción, socia por QR), pruebas de permisos entre roles y recorrido de todas las secciones a 375 px. Informe: `docs/AUDITORIA_2026-10-28.md`. Corregidos: F-12 (registro de equipo de gym roto, **crítico**), F-11 (alcance del gerente en invitaciones), F-05, F-06, F-08, F-10, F-13, F-14, F-15, F-17, F-18, F-19. Sin migración.
- **Pruebas:** web 179/179, dominio 107/107, guardas 11/11, build OK.
- **Observaciones abiertas para el titular:** O-01..O-05 del informe (padrón en el panel ejecutivo, «No vino el profe» para coaches online, orden de fechas de inicio, adherencia con sesiones parciales, nombre precargado del programa del gym).
- **Siguiente:** cerrar LB-02..LB-06 con el titular; prueba en teléfonos reales (LB-03) con la lista de `docs/QA_CHECKLIST.md`.

## Bloque anterior — 28/10/2026 · Alta de cliente mínima, íconos y correcciones de la simulación (D117)

- **Hecho:** alta de cliente en Admin con sólo nombre visible, moneda, responsable y email obligatorios (razón social opcional; **migración 0024 aplicada en dev y Supabase**); mensajes que dicen qué falta. Íconos rehechos con `apps/web/scripts/brand-icons.ts` → `apps/web/public/icons/` (manifest, apple-touch, favicon, insignia de avisos); ruta `/pwa-icon` eliminada. Hallazgos F-01..F-04 de la simulación corregidos (fechas AR, mensaje de contraseña, lista de programas, consentimientos de módulos apagados).
- **Pruebas:** web 178/178, dominio 107/107, guardas 11/11, build OK. Navegador local: alta del caso exacto de la captura del titular (coach, razón social «.») y «Regularizar» sin razón social; mensaje de faltantes; ícono en /instalar; programa nuevo visible en la lista.
- **Aviso al titular:** para ver el ícono nuevo en el teléfono hay que quitar REPI del inicio y volver a agregarlo.
- **Siguiente:** retomar la simulación completa por roles (asignar «Fuerza base» a Ana, sesión del alumno, revisión del coach, pausa/fin; dueño con 2FA, equipo, QR, socio, recepción) y escribir el informe de auditoría (`docs/AUDITORIA_2026-10-28.md`). Datos de simulación en dev: Coach Simulación (sim.coach@example.com), Ana (sim.alumno@example.com), Gym Simulación (sim.dueno@example.com sin activar), Urko Uruzuna (borrador), Gym Prueba Sur regularizado.

## Bloque anterior — 27/10/2026 · Release candidata para beta controlada (D111)

- **Directiva vigente:** «LAUNCH FIRST» (chat 27/10): terminar, probar y lanzar; P2/experimental no antes del MVP. Fase actual E (release candidata congelada: sólo correcciones de lanzamiento).
- **Hecho:** `apps/web/src/lib/features.ts` + `tests/features.test.ts`; gating en `CoachClients.tsx` (Nutrición, Mi cuerpo), `Workout.tsx` (video), `MemberApp.tsx` (Solo), `Gym.tsx` (Club), `ProgramBuilder.tsx` y `gym/Members.tsx` (Reemplazos). `server/mailer.ts` sin copias al buzón con proveedor (+ `mailer.test.ts`). `tests/launch-flows.test.ts` (LF-01..LF-04). Documentos nuevos en `docs/`: MVP_SCOPE, RELEASE_READINESS, LAUNCH_BLOCKERS, QA_CHECKLIST, PRODUCTION_CHECKLIST, DEPLOYMENT, ROLLBACK_PLAN, FEATURE_FLAGS, POST_LAUNCH_ROADMAP; resumen al inicio de IMPLEMENTATION_STATUS.md. Sin migración.
- **Pruebas:** web 172/172, dominio 107/107, guardas 11/11, build OK. Respaldo de producción + restauración en `repi_restore_check` OK (87 tablas, 148 filas). Producción: 1 Admin con 2FA; 1 copia de correo real en `dev_mailbox` (LB-01, no se leyó).
- **D116:** «Mostrar QR de la sede» en «Solicitudes de acceso» para todo el equipo (`showJoinQr`, `/api/gym/[orgId]/join-qr`); sólo muestra o crea si falta, nunca regenera.
- **D115:** paso 3 de `/instalar` (cómo entra cada rol), cartel `/instalar/cartel` y `public/marketing/` (regenerar QR con `npx tsx scripts/marketing-qr.ts`; el cartel PDF/PNG con Chrome headless sobre `next start`), guías Gym/Coach, y Pausar/Reactivar/Terminar relación del coach (LF-05). Web 173/173.
- **D114:** sección «Guía» en Admin (`components/admin/AdminGuide.tsx`, estilos `.ag*` en coach.css) con el alta de gym y coach paso a paso; mantener sus rótulos alineados con los botones reales.
- **D113:** sin botones de Google/Apple en el ingreso (pedido del titular); el adaptador OAuth del servidor queda listo.
- **D112 (autorizado):** copia borrada (0 en `dev_mailbox`) y `REPI_DEPLOY` eliminada de Vercel; producción en modo productivo.
- **Pendiente del titular:** LB-02 (Vercel Pro y Supabase Pro), LB-03 (teléfonos reales), LB-04 (abogado y datos de empresa), LB-05 (frecuencia de respaldo), LB-06 (alertas).
- **Siguiente:** cerrar los LB autorizados; después Adaptive Coach 1b restante detrás de su interruptor.

## Bloque anterior — 27/10/2026 · Adaptive Coach 1b: reemplazos aprobados (D110)

- **Hecho:** dominio `withApproved`, `cleanSubNote`, `APPROVED_SUBS_MAX` en `session-changes.ts`; tabla `exercise_substitution` (**migración 0023, aplicada en dev y Supabase con RLS**); `apps/web/src/server/training/substitutions.ts`; `GET|POST|DELETE /api/substitutions/[orgId]`; `sessionAlternatives` devuelve `approved`, `approvedNote` y `approvedBy`. UI: `components/coach/ApprovedSubs.tsx` en `ProgramBuilder.tsx` y en `EditProgramModal` de `gym/Members.tsx` (la biblioteca del gym ahora incluye `kind`); `member/ExerciseChange.tsx` marca los aprobados. Estilos `.subs-*` (coach.css) y `.xc-ok` (member.css).
- **Pruebas:** web 168/168 (nuevo `tests/substitutions.test.ts`; `session-changes.test.ts` dejó de depender del orden de la biblioteca base), dominio 107/107, guardas 11/11, build OK. Navegador: Agustín aprueba un reemplazo en el constructor; Valentina lo ve primero en «Cambiar Sentadilla» a 375 px. En dev quedaron dos reemplazos de demo en la organización de Agustín.
- **Para Codex:** `exercise_substitution` es configuración de la organización (se borra en cascada con ella); `created_by` pasa a NULL si se borra la cuenta del autor.
- **Siguiente:** resto de 1b: política de autonomía por organización (nivel por defecto 1, quién aprueba) y restricciones con vigencia (EXT-06). Después fase 2.

## Bloque anterior — 27/10/2026 · Contacto, soporte, legales v2026.10 y tipografía Barlow (D109)

- **Hecho:** `apps/web/src/lib/contact.ts` (correo, WhatsApp, condiciones de soporte); sitio público revisado entero (`components/site/PublicSite.tsx`, `styles/site.css`): sección Soporte, contacto directo, FAQ de pago, pie con crédito Sovare e isotipo (`public/brand/sovare-isotipo.webp`); `/ayuda` con «Contacto directo»; textos legales en `app/legal/[doc]/texts.ts`; `TERMS_VERSION = "v2026.10"` (los consentimientos nuevos quedan con esa versión). Regla de tipografía Barlow definitiva en CLAUDE.md, AGENTS.md (raíz, antes sin versionar), apps/web/AGENTS.md y DESIGN_CONTRACT.md; inventario regenerado (F-BR-01). Sin migración.
- **Decisiones del titular:** G09 resuelto (pago fuera de la app). Soporte: urgencias 24 h; a medida $ 30.000 por pedido (`docs/SOPORTE_OPERACION.md`).
- **Pruebas:** web 166/166, dominio 104/104, guardas 11/11, build OK. Navegador 1009 px y 375 px: sitio sin desborde, pie Sovare, `/legal/terms|privacy|dpa` y `/ayuda`.
- **Pendiente externo:** revisión de abogado y razón social, CUIT y domicilio para los legales (G11); el titular revisa el texto del sitio.
- **Siguiente:** Adaptive Coach fase 1b (sustituciones aprobadas por coach/organización y política de autonomía por organización).

## Bloque anterior — 27/10/2026 · Adaptive Coach fase 1 (D108)

- **Hecho:** dominio `adaptive.ts` (+ tests) exportado; `apps/web/src/server/training/adaptive.ts`; `GET /api/me/solo?v=solo|coach_absent`; `member/Solo.tsx` (entrada en Entrenar y hoja con motivos, avisos y opciones); estilos `.solo-*`. Sin migración. `MemberApp.tsx` cambió sólo en el bloque de import final, estado `solo`, `Train` y la hoja (Codex tiene cambios sin commit en otros bloques de ese archivo: revisar al integrar).
- **Documentos:** `docs/adaptive/ADAPTIVE_COACH_ARCHITECTURE.md` (principios, reutilización, fases 1–6, estado de tests A–Q, límites) y sección nueva en `docs/IMPLEMENTATION_STATUS.md`.
- **Pruebas:** web 166/166 (nuevo `tests/adaptive.test.ts`, 2), dominio 104/104, guardas 11/11, build OK. Navegador 375 px (Valentina con sesión abierta): «No vino el profe…» → «Seguí con Piernas · Hiciste 2 de 13 series» → «Continuar donde lo dejé» abre la sesión.
- **Siguiente:** fase 1b: sustituciones aprobadas por coach/organización (tabla + gestión en el constructor + prioridad en alternativas) y política de autonomía por organización. Fase 3 (IA) necesita decisión de gasto del titular.

## Bloque anterior — 27/10/2026 · Nota por serie, saltar/reemplazar y aviso de descanso (F-HX-21 y F-HX-22, D106–D107)

- **Pedido del titular:** cerrar estos V1 y después pasar a Adaptive Coach (pedido «MASTER FEATURE EXPANSION», pegado en el chat; pide Inter Tight, que está superada por G · Atlética: se mantiene Barlow).
- **Hecho (D106):** dominio `session-changes.ts` (motivos, compatibilidad, orden de alternativas, `cleanSetNote`) y `sync.ts` (la nota es parte de la serie); migración `0022_session_exercise_change` (`set_log.note` + tabla `session_exercise_change`, dev y **Supabase**, RLS); `training/services.ts` (`logSet` con nota y ejercicio real, `getSession` con `change`, `sessionAlternatives`, `setExerciseChange`, resumen con `exSkipped` y récords por ejercicio hecho, `clientDetail` con `changes` y `setNotes`); ruta `GET/POST /api/me/sessions/[id]/exercises`; cola offline con ítem `exchange`; `member/ExerciseChange.tsx`, nota de serie y estado «salteado» en `Workout.tsx`; ficha del coach (`CoachClients.tsx`) muestra cambios y notas.
- **Hecho (D107):** `src/lib/restAlert.ts` y fila «Avisarme al terminar» en el descanso; `public/sw.js` acepta `focusOnly` en el clic de la notificación.
- **Pruebas:** web 164/164 (nuevos `tests/session-changes.test.ts` 3 y `tests/rest-alert.test.ts` 2), dominio 96/96, guardas 11/11, build OK. Navegador local (375 px, Valentina): nota «agarre cerrado» llegó al servidor; Sentadilla → Prensa por «máquina ocupada» (series pendientes en 0, la hecha conserva Sentadilla); Peso muerto rumano salteado por tiempo, con «Retomar»; tras recargar se mantiene; el descanso muestra «bloqueadas» (el panel deniega notificaciones) y, simulando permiso por defecto, «Avisarme al terminar». Esa sesión «Piernas» sigue abierta en `repi_dev`.
- **Para Codex (exportación de datos):** hay datos propios nuevos: `set_log.note` y `session_exercise_change`.
- **Pendiente:** aviso de descanso en teléfonos reales; alternativas sin conexión (hoy requieren red).
- **Siguiente:** Adaptive Coach fase 1 (auditoría, modelo de datos, catálogo de sustituciones, validador, políticas de autonomía; sin IA). Reutilizar `session_exercise_change`, `rankAlternatives` y el check-in existente.

## Bloque anterior — 27/10/2026 · Discos y entrada en calor en la sesión activa (F-HX-21 parcial, D105)

- **Hecho:** `packages/domain/src/plates.ts` (+ tests) exportado desde el índice; `apps/web/src/components/member/PlatesSheet.tsx`; botón «Discos y entrada en calor» en `member/Workout.tsx` (sólo peso > 0 y ejercicios por repeticiones); estilos `.plates*` en `member.css`. Sin migración ni cambios de sincronización: no se registra nada.
- **Pruebas:** dominio 92/92 (nuevo `plates.test.ts`, 5), web 159/159, build OK. Navegador local (375 px, Valentina, Piernas → Sentadilla 100 kg): 20 kg → «1 × 25 + 1 × 15» y escalones 20×10, 40×5, 60×3, 80×2; barra 15 → «1 × 25 + 1 × 15 + 1 × 2,5» y se recuerda. Quedó una sesión «Piernas» en curso sin series en `repi_dev`.
- **Coordinación:** `Workout.tsx` no está entre los archivos que Codex modifica; `MemberApp.tsx` no se tocó.
- **Siguiente:** resto de F-HX-21 (nota por serie, saltar y sustituir: requieren campo nuevo en `set_log`/estado de ejercicio y pasar por la cola offline y los conflictos; diseñar con cuidado) o F-HX-22 (aviso local del descanso con la app en segundo plano).

## Bloque anterior — 27/10/2026 · Sitio público con contacto comercial (F-PU-01, D104)

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
- **G09 resuelto (D109):** el piloto opera con pago externo registrado por Admin; el titular gestiona el cobro fuera de la app.
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
