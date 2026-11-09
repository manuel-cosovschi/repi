# REPI Control · planificación supervisada y pantalla de rutinas

Máster «REPI Controlled Gym Mode & Kiosk 1.0» y su ampliación «REPI Control + REPI Completo en /conoce» (09/11/2026).
Decisiones D213 (modalidad y kiosco), D214 (STF-09) y D215 (/conoce). Migración aditiva 0053.

Es la misma plataforma que REPI Completo, con otra política por gimnasio. No es otra aplicación.

| Documento | Para qué |
| --- | --- |
| [ACTIVACION.md](ACTIVACION.md) | Cómo encender REPI Control en un gimnasio y ponerlo en marcha |
| [SEGURIDAD.md](SEGURIDAD.md) | Modelo de amenazas del kiosco, credenciales, intentos y aislamiento |
| [ARQUITECTURA.md](ARQUITECTURA.md) | Qué se bloquea, dónde, y cómo se relaciona con padrón, cuentas y relaciones |
| [LIMITACIONES_Y_COSTOS.md](LIMITACIONES_Y_COSTOS.md) | Lo que no hace, lo pendiente y los costos |

## Estado

- **Publicado y verificado el 09/11/2026** (PR #91, `3d1aa5c`, migración 0053 tras el respaldo `backup-20261109-165202-42658629470`; smoke con demos 41/41).

- **Por defecto, todo está apagado.** `organization.routine_policy = 'open'` y `kiosk_enabled = false` para todas las
  organizaciones. Sólo REPI Admin lo cambia, gimnasio por gimnasio, y únicamente con la autorización del titular para ese gimnasio.
- **Demo aislada:** `/api/demo {role:"control"}` crea «Gimnasio Atlas» con datos ficticios (`is_demo`, se borra a las 6 h). Tiene
  una dueña, dos profesores, tres socios (uno con programa en su versión 2, otro con otro programa y otra sin programa), una
  pantalla autorizada y las credenciales de cada socio. Desde `/conoce#modos` y `/demo`.

## Piezas

| Pieza | Archivo |
| --- | --- |
| Política del socio (servidor) | `apps/web/src/server/gym/routine-policy.ts`; llamadas en `training/own-routines.ts`, `training/services.ts` (`startSoloRoutine`, `myTraining.supervised`), `training/solo-routine.ts`, `training/ai-coach.ts`, `training/adaptive.ts`, `brain/context.ts` + `packages/domain/src/brain/actions.ts` (`SUPERVISED_BLOCKED`) |
| Kiosco (servidor) | `apps/web/src/server/gym/kiosk.ts`, `apps/web/src/app/api/kiosk/[...path]/route.ts`, `apps/web/src/app/api/me/kiosk/route.ts` |
| Kiosco (pantalla) | `apps/web/src/app/rutinas/page.tsx`, `apps/web/src/components/kiosk/KioskApp.tsx`, `apps/web/src/styles/kiosk.css` |
| Personal (STF-09) | `apps/web/src/server/gym/staff-admin.ts`; rutas `team/:userId`, `team/:userId/revoke`, `team/:userId/role` |
| REPI Admin | `setClientControl` en `server/commercial/services.ts`; ruta `contracts/:id/control`; tarjeta «REPI Control» en `AdminApp.tsx` |
| Demo | `startDemo("control")` en `server/sandbox/services.ts` |
| /conoce | `components/conoce/x3/Modes.tsx`, `components/conoce/interest.ts`, `content/conoce.ts`, `ContactForm.tsx` |
| Migración | `drizzle/0053_repi_control.sql`, `scripts/operations/hosted-0053.sql`, `verify-0053.sh`, `scripts/rollback/0053_repi_control.down.sql` |
| Pruebas | `tests/repi-control.test.ts` (22), `tests/sandbox.test.ts` (demo control), `tests/experience-hub.test.ts` (modalidad del contacto), `e2e/repi-control-kiosk.spec.ts`, `e2e/conoce.spec.ts` |
| Comercial | `marketing/dossier/repi-control/` (dossier editable), films `modo-completo` y `modo-control` en `design/films/` |
