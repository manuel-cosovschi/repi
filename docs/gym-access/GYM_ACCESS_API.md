# Gym Access · API (D127)

Todas las respuestas de error: `{ error, code }` con estado HTTP. Autorización en el servidor por rol y sede.

## Socio (sesión)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/me/gym/presence` | — | `{ gyms: [{ orgId, gym, location, membership, membershipLabel, accessUntil, enabled, mode, startNeedsCheckin, geoMode, pass }], demo }` |
| POST | `/api/me/gym/checkin` | `{ token, geo?: { lat, lng, accuracyM, ageSec } }` | `{ ok: true, duplicate, gym, pass }` o `{ ok: false, reason, message }` (límite 20/min) |
| POST | `/api/me/gym/demo-qr` | `{ gym: "own" \| "other" }` | `{ token }` sólo para cuentas de la demo |

Acciones protegidas devuelven 403 `presence_required` (validá tu ingreso) o `relation_inactive` (membresía no activa).

## Equipo del gimnasio (sesión)

| Método | Ruta | Quién |
|---|---|---|
| GET | `/api/gym/:org/context` → `accessControl` | Todos |
| GET | `/api/gym/:org/access/settings` | Dueño, gerencia |
| GET | `/api/gym/:org/access/report?days=1\|7\|30&loc=` | Dueño, gerencia |
| GET | `/api/gym/:org/access/qr?loc=` | Dueño, gerencia, recepción (sus sedes) |
| GET | `/api/gym/:org/access/members?q=` | Recepción, gestión, sala |
| POST | `/api/gym/:org/access/policy` `{ mode?, strictActions?, qrTtlSec?, passHours?, geoMode? }` | Dueño o gerencia de todas las sedes |
| POST | `/api/gym/:org/access/locations/:loc` `{ geo: { lat, lng, radiusM } \| null }` | Dueño, gerencia |
| POST | `/api/gym/:org/access/displays` `{ loc, name }` → `{ id, link }` | Dueño, gerencia |
| POST | `/api/gym/:org/access/displays/:id` | Revoca la pantalla |
| POST | `/api/gym/:org/access/checkins` `{ gymMemberId, loc, note? }` | Recepción, gestión; sala con turno en la sede |
| POST | `/api/gym/:org/access/checkins/:id` | Revoca un ingreso |
| POST | `/api/gym/:org/accesses/:id/until` `{ until: "AAAA-MM-DD" \| null }` | Quien aprueba accesos |

## Pantalla de recepción (sin sesión)

`GET /api/access-display` con encabezado `x-repi-display: <secreto>` → `{ token, url, expiresAt, ttlSec, location, gym }`. 401 `invalid_display` si fue revocada; 409 `module_off` si el módulo está apagado. Límite 30/min.

## Admin

`POST /api/admin/contracts/:id/access` `{ on }` enciende o apaga el módulo del gimnasio (apagar revoca ingresos vigentes). `GET /api/admin/contracts/:id` incluye `accessControl: { enabled, mode }`.
