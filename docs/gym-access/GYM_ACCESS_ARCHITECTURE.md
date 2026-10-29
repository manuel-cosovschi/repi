# Gym Access · Arquitectura (D127)

Tres capas, evaluadas siempre en el servidor:

1. **Membresía** (`membershipState`): `gym_member.status` + `access_until` → pendiente, activa, pausada, vencida o dada de baja.
2. **Política del gimnasio** (`gym_access_policy`): módulo encendido (Admin), modo OPEN / HYBRID / STRICT, acciones extra en STRICT, duración del QR, horas del ingreso y uso de ubicación.
3. **Presencia** (`gym_checkin`): un ingreso validado (resultado `ok`) con `issued_at`, `expires_at` y `revoked_at`, o un intento rechazado con motivo.

## Flujo

```
Tablet de recepción ──GET /api/access-display (x-repi-display)──► displayQr → token RA1 (30 s)
Socio escanea ──POST /api/me/gym/checkin {token, geo?}──► memberCheckin
   readQrToken (firma HMAC, vencimiento) → membresía → sede incluida → ubicación (si aplica) → issuePass
Socio inicia/registra ──startSession / logSet──► requireGymAction(gym.workout.start | log_set)
```

- **Token** `RA1.<base64url(org.loc.exp.nonce.src)>.<hmac>`: clave derivada de `BETTER_AUTH_SECRET` con etiqueta propia. Sin datos de personas. Viaja en el fragmento (`/ingreso#c=…`): no llega a logs.
- **issuePass**: bloqueo consultivo por persona y gimnasio; si ya hay un ingreso vigente en la misma sede con más de 30 min por delante se reutiliza; el nonce es único por persona (reintentos idempotentes). Registra asistencia (`attendance.source = checkin`).
- **requireGymAction**: con el módulo apagado, OPEN o sesión de coach, no exige nada. Si exige, busca un ingreso que cubra la hora del servidor, o la hora de la serie hecha sin conexión dentro de la vigencia si llega hasta 12 h después (`LATE_SYNC_HOURS`).
- **Revocación**: baja, pausa, vencimiento, apagado del módulo o acción del equipo marcan `revoked_at`. Lo ya registrado no se borra.

## Piezas

| Capa | Archivos |
|---|---|
| Dominio | `packages/domain/src/gym-access.ts` (+ tests) |
| Datos | `apps/web/drizzle/0026_gym_access.sql` |
| Servidor | `apps/web/src/server/gym/access-control.ts`; ganchos en `training/services.ts`, `join/services.ts`, `community/services.ts`, `gym/connect.ts`, `commercial/services.ts` |
| Rutas | `/api/me/gym/{presence,checkin,demo-qr}`, `/api/gym/[orgId]/access/*`, `/api/gym/[orgId]/accesses/:id/until`, `/api/access-display`, `/api/admin/contracts/:id/access` |
| Interfaz | `components/member/Presence.tsx`, `components/gym/AccessControl.tsx`, `components/gym-access/{LiveQr,KioskDisplay,CheckinLanding}.tsx`, `app/ingreso/{page,pantalla/page}.tsx` |
