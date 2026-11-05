# REPI — Bloqueantes del lanzamiento

Actualizado: 05/11/2026 (06/06, D197–D198; evaluación completa en [FINAL_RELEASE_HARDENING_06.md](FINAL_RELEASE_HARDENING_06.md)). Antes: 27/10/2026 (D111). Fuente: [RELEASE_READINESS.md](RELEASE_READINESS.md). No hay bloqueantes **de código** abiertos para una beta controlada. Todos los que siguen dependen del titular: gasto, cuentas, dispositivos o asesoramiento profesional.

| ID | Bloquea | Qué falta | Por qué | Quién | Cómo se cierra |
| --- | --- | --- | --- | --- | --- |
| LB-02 | Lanzamiento comercial | Pasar Vercel a un plan con uso comercial (Pro) y Supabase a un plan sin pausa por inactividad y con respaldos diarios (Pro) | Vercel Hobby es de uso personal no comercial; Supabase gratuito pausa a los 7 días sin actividad y no tiene restauración a un punto en el tiempo | Titular (gasto mensual) | Cambiar de plan en cada panel; no requiere cambios de código |
| LB-03 | Lanzamiento (G03, G07) | Probar en un iPhone y un Android reales: instalar la PWA, abrir desde inicio, entrenar sin conexión y reconectar, recibir push | La emulación no cubre Safari iOS instalado, permisos de notificación ni el teclado real | Titular con sus teléfonos (Claude guía) | Lista en [QA_CHECKLIST.md](QA_CHECKLIST.md) §Dispositivos; anotar resultado y fecha |
| LB-04 | Lanzamiento público (G11) | Revisión de abogado de `/legal/terms`, `/legal/privacy`, `/legal/dpa` y datos de la empresa (razón social, CUIT, domicilio) | Los textos son un borrador operativo (D109); no se afirma cumplimiento legal | Titular + abogado | Pasar los datos; Claude los carga y sube `TERMS_VERSION` |
| LB-05 | Lanzamiento comercial (G10) | ~~Frecuencia y copia externa~~ **Resuelto en lo técnico (D190, D198):** respaldo diario cifrado y verificado en GitHub Releases, más el vigilante de ausencia. Falta: armar el vigilante (`BACKUP_HEARTBEAT_SECRET`) y una semana de cronograma sin omisiones | Sin el vigilante, un día sin respaldo no avisa | Titular (5 minutos, `docs/RESPALDOS.md`) | Primer email de prueba o la señal «enviada» en la corrida |
| LB-06 | Lanzamiento comercial | ~~Alertas de errores~~ **Resuelto 29/10 (D149)**: email por Resend a la casilla del titular (`ALERT_EMAIL` en Vercel), una vez por hora por error igual, máximo 20 por hora | — | Titular eligió email gratis por Resend | Prueba: `GET /api/cron/alert-test` con `CRON_SECRET` |
| LB-08 | Todo lo publicado después de `d004d98` | Vercel no desplegó `main` en `70e7779` (hotfix #35): no hay estado de Vercel en el commit | Lo que se integra no llega a producción | Titular | Vercel → Deployments → Redeploy de `main`, y revisar la integración con GitHub; o aprobar el acceso del equipo para que Claude lo diagnostique |
| LB-09 | Expansión comercial | Acceso de lectura a deployments y logs de Vercel (403 hoy) | Sin logs no hay diagnóstico de errores productivos | Titular | Aprobar el enlace de `authorize_team_access` del equipo `manuel-cosovschis-projects` |
| LB-10 | Expansión comercial | 2FA obligatoria al menos para REPI Admin (hoy optativa, D119) | Una cuenta Admin sin 2FA expone datos comerciales y pedidos de privacidad | Titular decide | Cambiar `TWO_FACTOR_REQUIRED` para `admin` (una línea) |

## Ya cerrados en este corte

- LB-01 (27/10, autorizado por el titular): se borró la única copia de correo real de `dev_mailbox` en producción sin leerla; quedan 0.
- LB-07 (27/10, autorizado por el titular): `REPI_DEPLOY` eliminada de Vercel production; `/dev/mailbox` responde 404 y el correo sin proveedor falla de forma explícita.
- LR-14: los correos reales ya no se copian al buzón DEV (D111, `mailer.test.ts`).
- LR-15: pestañas Nutrición y Mi cuerpo, y el recuadro «video demostración (pendiente)», ocultos por interruptor (D111).
- G09: cobro a REPI fuera de la app (D109).
- Primer Admin con 2FA en producción (D87, verificado 27/10).
