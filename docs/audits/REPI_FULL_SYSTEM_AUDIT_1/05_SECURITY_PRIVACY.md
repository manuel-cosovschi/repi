# 05 — Seguridad y privacidad

Auditoría FSA1, 09/11/2026. Ataques reales contra una build de producción local (`next build && next start`) con bases descartables, pruebas de integración contra `repi_test` y revisión de código. **No se atacó producción.** Las IDs remiten al registro de defectos (03).

## 1. Autenticación

| Control | Resultado | Evidencia |
| --- | --- | --- |
| **Salteo de la verificación en dos pasos** | **P0 corregido (SEC-01).** El enlace por email, el código por email, la verificación de email con ingreso automático y el callback social abrían sesión sin el segundo factor, también para REPI Admin y para los roles del gym que la exigen | Causa: el plugin `twoFactor` de Better Auth 1.7.7 sólo intercepta `/sign-in/email`, `/sign-in/username` y `/sign-in/phone-number`. Arreglo en `server/auth.ts`: esos caminos reciben el mismo desafío; los enlaces redirigen a `/acceso?step=twofa`. Pruebas: `auth-second-factor.test.ts` (2 fallaban antes) y `twofa-bypass.test.ts`, escrita por otro auditor, con control sin 2FA. Playwright: enlace → paso del código → TOTP → sesión |
| Cookie de sesión | HttpOnly, SameSite=Lax, Secure con https, 7 días | Revisión y pruebas existentes |
| Restablecer contraseña | Revoca las sesiones abiertas | `access.test.ts` |
| Cerrar sesión | **P2 corregido (SEC-04):** quedaban en el dispositivo borradores privados (programa del socio y motivo, importaciones, ajustes de TI) y la suscripción push de la cuenta | `logout.test.ts` + Playwright en la UI |
| Invitaciones | **P2 corregido (SEC-06):** aceptar no tenía tope y permitía enumerar códigos y pistas de email. Ahora 10 intentos cada 10 minutos por persona | `access.test.ts` |
| REPI Admin | Un socio o un coach reciben 404 en `/admin` y en `/api/admin/*`. La 2FA es optativa para admin por decisión del titular (D119, riesgo aceptado SEC-9); con SEC-01, quien la activó ya no puede saltearla | `security-launch.test.ts`, e2e de comunicaciones |

## 2. Autorización (horizontal y vertical)

Barrido de **todas** las rutas con `[orgId]`, usando la organización de la víctima y sus ids bajo la propia (`e2e/api-auth-sweep.spec.ts`, verde contra `main` y contra la rama). Resultados:

| Ataque | Resultado |
| --- | --- |
| Coach A contra programas, clientes, pagos, agenda, objetivos y pedidos del coach B | 4xx |
| Gym A (dueño y sala) contra gym B | 4xx |
| Coach contra gym | 4xx |
| Socio A contra los ids del socio B (sesiones, historial, anular, series, mensajes, lesiones, rutinas, `.ics`, intervenciones) | 404/400; los datos de B quedaron intactos |
| Sala de la sede A contra la sede B; recepción contra acciones de sala | 403/404 (`gym.test.ts`) |
| Entrenador que pierde el rol, la sede o la membresía con la pantalla abierta | La siguiente acción responde 403/404 y no escribe nada: el permiso se lee en cada pedido |
| Socio que deja de compartir su entrenamiento | La ficha deja de mostrar series y visitas; la inteligencia responde 403 |
| Alumno que revoca salud; relación terminada | El coach deja de ver lesiones al instante; ficha, salud y rendimiento responden 404 |
| **Dueño y gerencia contra datos privados del socio** | **P1 corregido (STAFF-01 = SEC-02).** Leían las series con sensación («molestia») y notas, y las notas del equipo. Ahora dueño, gerencia y recepción ven asistencia y adherencia agregadas; las series y notas quedan para el equipo de entrenamiento de la sede (D178, D191). Ver la decisión pendiente en 09 |
| Gestión de equipo | **P1 abierto (STAFF-09):** no existe forma de quitar a alguien del equipo ni de cambiarle rol o sede. El servidor ya respeta `status = revoked` en el pedido siguiente; falta la acción en el producto. Mitigación operativa en 09 |

## 3. Entrada, salida y almacenamiento

| Vector | Resultado |
| --- | --- |
| Inyección SQL | No hay `sql.unsafe` en la app; el único `sql.raw` interpola constantes de rol |
| XSS | `dangerouslySetInnerHTML` sólo con el SVG del QR o constantes; los correos escapan HTML; los enlaces de materiales de venta sólo aceptan https |
| Inyección en `.ics` | **P3 corregido (SEC-09):** una nota con `\r` agregaba propiedades al evento (RFC 5545) |
| CSRF | `handle()` rechaza escrituras de otro sitio; fuera de `handle` sólo hay GET o cron con Bearer |
| SSRF | El servidor sólo llama a OpenAI, Resend, Storage y a hosts de push conocidos por https |
| Errores | Respuestas genéricas; `logError` recorta la SQL y los parámetros |
| Secretos | Ninguna clave en el repo; ningún `console.log` de tokens, emails ni cuerpos |
| Token en registros | **P3 corregido (SEC-07):** el token de la invitación de vendedor quedaba entero en `audit_event` |
| EXIF/GPS | **P2 corregido (SEC-03):** las fotos del Club y de la comunidad se guardaban con la ubicación (sólo el navegador la quitaba). **P2 corregido (IMPORT-05):** las fotos de progreso conservaban EXIF tras el fin de la imagen o entre cuadros progresivos |
| Tipo real de archivo | **P3 corregido (SEC-08):** se aceptaba un HTML declarado como video |
| Tamaño | **P3 corregido (SEC-10):** dos rutas leían el cuerpo completo antes de chequear el tamaño |
| URLs firmadas | Subida de 2 h para una clave exacta; lectura de 60 s sólo del lado del servidor. El navegador nunca recibe URLs del bucket |
| Fotos de progreso | Sólo su dueña; coach, sala, gerencia y otra persona reciben 404. Al borrar se elimina el objeto |
| Archivos de demos | **P2 corregido (INFRA-01):** al vencer la demo quedaban en el bucket; ver 07 §5 |

## 4. Datos personales

- **Exportación:** **P2 corregido (SEC-05).** Faltaban las rutinas propias, el historial importado, los ejercicios propios, los objetivos, la agenda, los intentos, los comentarios del Club, las reseñas, los logros y la nota de cada serie. Sigue sin incluir datos de otras personas ni las notas internas del coach.
- **Eliminación:** el pedido se registra y REPI lo resuelve a mano (`PRIVACIDAD_OPERACION.md`). El procedimiento incluye borrar los archivos de Storage. Verificado de punta a punta: pedido → Admin → resuelto, idempotente y auditado.
- **Edad:** el peso, las fotos y las calorías exigen fecha de nacimiento confirmada y adulto.
- **Aislamiento entre organizaciones en el dispositivo:** SEC-04 (cierre de sesión).
- **IA:** el asistente del dueño recibe sólo números agregados. Las acciones de REPI se validan en el servidor; la IA sólo propone.
- **Decisión pendiente (COMMS-07, P2):** «No vino el profe» y la rutina sin programa no leen las lesiones ni las molestias registradas. El cerebro de REPI sí las usa, con consentimiento de salud. Ver 09.

## 5. Sin verificar (ver 09)

- Admin con 2FA obligatoria: decisión D119.
- Ingreso con Google o Apple: sin proveedores locales.
- Push real al cerrar sesión: sin claves VAPID locales.
- Storage real: local usa disco.
- Prompt injection con el modelo real: sólo hubo revisión de código e IA simulada.
- Límites por IP fuera de Vercel.
- Safari y Firefox: sólo hay Chromium.
