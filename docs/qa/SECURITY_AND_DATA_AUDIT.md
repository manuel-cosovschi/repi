# Seguridad, datos, API y base — Auditoría QA 29/10/2026

Este archivo consolida SECURITY_AUDIT, DATA_INTEGRITY_REPORT, API_CONTRACT_REPORT y DATABASE_AUDIT. Los defectos, con su ficha completa, están en [BUG_REGISTER.md](BUG_REGISTER.md).

## 1. Alcance y método

- **Código revisado:**
  - 100 rutas `route.ts` bajo `apps/web/src/app/api`.
  - Servicios en `apps/web/src/server/*` (access, admin, ai, coachpay, commercial, community, followup, gym, join, messages, notifications, privacy, push, sandbox, settings, support, training, uploads).
  - Dominio en `packages/domain`.
- **Revisión:** manual, con tres agentes en paralelo de sólo lectura (seguridad, datos y UX). Cada hallazgo se verificó contra el código antes de entrar al registro.
- **Pruebas:**
  - Integración con Postgres real en `repi_test` (base descartable; `global-setup.ts` borra sólo esa base).
  - Pruebas unitarias del dominio.
  - E2E con Chrome real y demos aisladas (`is_demo`).
- **Límites:**
  - No se tocó producción: ni base, ni Vercel, ni datos reales. No se enviaron correos reales.
  - No hubo pentest dinámico externo ni fuzzing.

## 2. Seguridad

### Corregido

Hay 10 hallazgos de seguridad corregidos (SEC-1 a 8, 10 y 11). Los más importantes:
- **SEC-1:** la invitación verificaba el correo con sólo conocer el código.
- **SEC-2:** el coach conservaba acceso después de terminar la relación.
- **SEC-4:** Better Auth permitía el alta pública fuera del flujo de REPI.
- **SEC-6:** las menores sin consentimiento aparecían en el ranking.

### Riesgos aceptados

- **SEC-9:** admin sin 2FA, por decisión D119 del titular. Recomendación: activarlo antes de sumar más administradores.
- **SEC-12:** esbuild ≤0.24.2 (moderada) en una herramienta de desarrollo (drizzle-kit, vía better-auth). No se despliega.

### Verificado correcto (sin cambios)

- **Aislamiento entre organizaciones:**
  - Cada ruta de coach, gym y admin valida el rol con `requireCoach`, `requireRole` o `requireAdmin`, y el `orgId` de la ruta.
  - Los mensajes se filtran por participante.
  - E2E: un alumno recibe 403/404 en `/api/coach/<otra org>/overview|messages|programs` y en `/api/gym/<org>/members`.
- **Sin sesión:** `/api/me/*`, `/api/messages` y `/api/admin/*` responden 401/403/404 sin datos (E2E).
- **Cron:** secreto comparado con `timingSafeEqual`. Los secretos de las pantallas (TV, acceso) se guardan hasheados.
- **Subidas:** se valida el tipo real y el tamaño en el servidor.
- **Service worker:**
  - Nunca cachea `/api/` (E2E lo verifica en `sw.js`).
  - Al cerrar sesión borra las cachés y la base local.
- **Datos de demo:** cada demo es una organización `is_demo` propia, con correos `.invalid`, que se borra a las 6 h. Desde esta auditoría las invitaciones de demo no salen (SEC-3).
- **Límites de ritmo:** `app_rate_limit` por IP y bucket; ahora también por usuario en invitaciones, IA, importación y tutor.
- **Secretos:** ninguno en el repo. `.env*` está ignorado. Los logs enmascaran tokens en rutas (SEC-11).

## 3. Integridad de datos

### Verificado correcto

- **Series:**
  - Idempotentes: `logSet` bloquea con `FOR UPDATE` y hay una clave única (sesión, ejercicio del programa, índice de serie).
  - Un doble toque crea un solo registro (E2E: exactamente 1 `set_log` con 42,5 kg después de recargar).
- **Sesiones:** una sola sesión abierta por usuario, con bloqueo; el conflicto se resuelve explícitamente.
- **Concurrencia:**
  - Connect «tomar pedido» con bloqueo.
  - Aceptar una invitación con bloqueo.
  - QR de ingreso con advisory lock y nonce.
- **Historial:** los programas congelados versionan y el pasado no cambia.

### Corregido

- DATA-1 a 4, 7, 8 y 9.
- DATA-6 sólo en el ranking de 1RM y en la TV.

### Abierto

- **DATA-5 («Aplicar ahora» empareja días por posición):** usar el ID de origen o el nombre del día. Mostrar las series sin pareja.
- **DATA-6 (resto):** llevar `timed` en `LoggedSet`. Excluir esas series de volumen, `bestE1rm`, PR e informe. Toca unos 12 sitios.
- **DATA-10 (lista de socios cortada en 200):** paginar o mostrar el total.
- **DATA-11 (tres carreras menores):**
  - Bloquear el dedupe de `memberCreate`.
  - Marcar como vencido en una transacción aparte en `decideJoin`.
  - Contar dentro de la transacción en `deleteClient`.

## 4. Contrato de API

- **Validación:** todas las rutas que reciben cuerpo validan con zod y topes de largo (`max`). Los errores de dominio salen como `{ error, code }` con un status coherente: 400 inválido, 401 sin sesión, 403 sin permiso, 404 no existe o no es tuyo, 409 conflicto o estado, 429 límite.
- **Cliente:** `api()` (`src/lib/api.ts`) lanza `ApiError` en todo lo que no sea 2xx, con el mensaje en español del servidor. Los avisos de éxito van después del `await`.
- **Cola offline** (`src/lib/offline/queue.ts`):
  - Reintenta 5xx, 429 y fallas de red cada 10 s, y también al volver la red o la app.
  - 401 frena la cola sin borrar.
  - 403 `relation_inactive` o `presence_required` conserva y avisa.
  - Desde DATA-7, un 4xx de inicio o de serie conserva y avisa. Antes borraba.
- **Endpoints de la librería de auth:** sólo quedan los que REPI usa. `sign-up/email` responde 404 (SEC-4).

## 5. Base de datos

- **Esquema:** Drizzle (`src/db/schema.ts`). Las migraciones llegan hasta 0031, aplicadas en Supabase. **Esta auditoría no agrega migraciones.**
- **Deriva de esquema:** `schema.ts` coincide con las migraciones. `drizzle-kit generate` el 29/10 respondió «No schema changes, nothing to migrate».
- **Importes (int4):** amount_minor, unit_price_minor, subtotal_minor y contract_term.value.
  - Con topes en la aplicación, DATA-4 queda cubierto.
  - Si algún contrato real supera ≈ ARS 21,4 M por período, hace falta migrar a `bigint` (requiere autorización y ventana).
- **Borrados:**
  - Los días y ejercicios borran en cascada.
  - `set_log` y `session_exercise_change` referencian `program_exercise` sin cascada. Es correcto: las versiones con entrenamientos se congelan y no se editan en el lugar.
