# REPI — Retomar acá

Actualizado: 27/10/2026, soporte e incidentes (D93). Máster activo: ../../MASTER_PROMPT.md.

## Último bloque cerrado — 27/10/2026 · Soporte e incidentes (N-O11, D93)

- **Por qué este:** era el primer pendiente V1 con código faltante (gate G10 «soporte»); los demás V1 abiertos dependen de teléfonos reales, textos legales o decisiones del titular.
- **Hecho:** tabla `support_ticket` (migración `0013_support_ticket`, aplicada en dev local y **Supabase**, RLS activo); `src/server/support/services.ts` (openTicket con/sin sesión, diagnóstico de lista cerrada, deduplicación, límites; myTickets; listTickets/updateTicket para Admin; supportCounts en `adminSummary`); rutas `POST /api/support` (sesión opcional, helper `optionalUserId` en `access/http.ts`), `GET /api/me/support`, Admin `GET/POST /api/admin/support[/id]`; página pública `/ayuda` (`components/access/Support.tsx`); enlaces en login, Perfil del alumno y menú de Coach/Gym/Admin; `/acceso?step=rec1` abre «Olvidé mi contraseña»; pantalla Admin «Soporte» con badge, modal (incidente, tomar, nota interna, respuesta, reabrir) y tarjeta en Resumen. Procedimiento en `docs/SOPORTE_OPERACION.md`.
- **Pruebas:** web 133/133 (nuevo `tests/support.test.ts`, 5), dominio 74/74, guardas 11/11, typecheck y `next build` OK. En navegador local (dev): `/ayuda` sin sesión en 375 px → consulta enviada con código; Admin → Resumen «Consultas de soporte 1» → Soporte → responder → sale de «Abiertas». Para esa prueba se marcó 2FA del Admin del seed sólo en `repi_dev` y se revirtió.
- **Ojo:** `next build` en `apps/web` borra artefactos del `next dev` que esté corriendo (comparten `.next`): el dev server de la sesión de Codex en :3000 quedó devolviendo 500 y se reinició con el mismo comando (`pnpm --filter @repi/web dev`). Evitar build con un dev server activo, o reiniciarlo después.
- **Pendiente del titular:** responsables y horario de soporte, correo público de contacto, verificación de identidad para 2FA perdido sin códigos de respaldo.
- **Siguiente:** F-NT-01 centro de notificaciones del alumno (base: `member_notice`, `notification_outbox`, `/api/me/inbox`); luego V1.1 (F-HX-23 kg/lb, F-CO-16 informe mensual). V1 restante es externo: G03/G07 en teléfonos reales, G11 textos legales, G09 modalidad del piloto.

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
