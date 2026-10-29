# Gym Access · Seguridad (D127)

## Qué protege y qué no

Un ingreso validado demuestra que una cuenta presentó un QR vigente de la sede (o que alguien del equipo la validó) en un momento. **No** prueba presencia continua, **no** impide que alguien reenvíe en vivo un QR vigente a otra persona y **no** impide falsear la ubicación del teléfono. Protege funciones del servidor; no es un molinete.

## Controles

| Riesgo | Control |
|---|---|
| Foto o captura vieja del QR | Token con vencimiento corto (hora del servidor); vencido se rechaza (`expired_token`) |
| QR alterado o inventado | Firma HMAC-SHA256 con clave derivada; comparación en tiempo constante |
| QR de otra organización | El token lleva org y sede; sólo vale para membresías de ese gimnasio |
| Llamar la API sin validar | `requireGymAction` en `startSession`, `logSet` y cambio de ejercicio; 403 `presence_required` |
| Reintentos o doble escaneo | Bloqueo consultivo por persona y gimnasio, nonce único por persona, reutilización del ingreso vigente |
| Fuerza bruta | Límite de 20 intentos por persona en `/api/me/gym/checkin`; 30 por pantalla en `/api/access-display` |
| Pantalla robada | Secreto de 256 bits, guardado sólo como hash, revocable al instante; se manda en encabezado, no en la URL |
| Redirección por QR malicioso | El escáner de la app sólo acepta tokens `RA1` o `/ingreso` del propio sitio; nunca navega a lo escaneado |
| Tokens en logs | El token viaja en el fragmento de la URL y por POST |
| Personal fuera de su sede | `inScope` por sede; entrenador de sala sólo con turno activo en esa sede |
| Fugas entre gimnasios | Toda consulta filtra por `org_id` y sedes del contexto |
| Datos de terceros en mensajes de error | Mensajes genéricos al socio; el panel oculta el nombre de quien no es socio |

## Auditoría

`gym_access.enabled|disabled`, `gym_access.policy_updated`, `gym_access.location_geo`, `gym_access.display_created|revoked`, `gym_access.until`, `gym_access.pass_revoked`, validaciones del equipo con autor y motivo. Los intentos rechazados quedan en `gym_checkin` con `result = denied` y motivo.
