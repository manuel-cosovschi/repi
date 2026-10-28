# REPI — Bloqueantes del lanzamiento

Actualizado: 27/10/2026 (D111). Fuente: [RELEASE_READINESS.md](RELEASE_READINESS.md). No hay bloqueantes **de código** abiertos para una beta controlada. Todos los que siguen dependen del titular: gasto, cuentas, dispositivos o asesoramiento profesional.

| ID | Bloquea | Qué falta | Por qué | Quién | Cómo se cierra |
| --- | --- | --- | --- | --- | --- |
| LB-02 | Lanzamiento comercial | Pasar Vercel a un plan con uso comercial (Pro) y Supabase a un plan sin pausa por inactividad y con respaldos diarios (Pro) | Vercel Hobby es de uso personal no comercial; Supabase gratuito pausa a los 7 días sin actividad y no tiene restauración a un punto en el tiempo | Titular (gasto mensual) | Cambiar de plan en cada panel; no requiere cambios de código |
| LB-03 | Lanzamiento (G03, G07) | Probar en un iPhone y un Android reales: instalar la PWA, abrir desde inicio, entrenar sin conexión y reconectar, recibir push | La emulación no cubre Safari iOS instalado, permisos de notificación ni el teclado real | Titular con sus teléfonos (Claude guía) | Lista en [QA_CHECKLIST.md](QA_CHECKLIST.md) §Dispositivos; anotar resultado y fecha |
| LB-04 | Lanzamiento público (G11) | Revisión de abogado de `/legal/terms`, `/legal/privacy`, `/legal/dpa` y datos de la empresa (razón social, CUIT, domicilio) | Los textos son un borrador operativo (D109); no se afirma cumplimiento legal | Titular + abogado | Pasar los datos; Claude los carga y sube `TERMS_VERSION` |
| LB-05 | Lanzamiento comercial (G10) | Frecuencia de respaldo y dónde se guarda una copia fuera de esta computadora | Hoy el respaldo es manual y queda sólo en `~/.repi-secrets/backups/` | Titular decide; Claude programa | Con Supabase Pro hay respaldo diario; sumar `ops:backup` semanal a un almacenamiento externo |
| LB-06 | Lanzamiento comercial | Alertas de errores (hoy sólo logs en Vercel, sin aviso) | Un fallo en producción no avisa a nadie | Titular elige (gratis: alerta por correo de Vercel o un monitor externo) | Configurar en el panel; documentar en `DEPLOYMENT.md` |

## Ya cerrados en este corte

- LB-01 (27/10, autorizado por el titular): se borró la única copia de correo real de `dev_mailbox` en producción sin leerla; quedan 0.
- LB-07 (27/10, autorizado por el titular): `REPI_DEPLOY` eliminada de Vercel production; `/dev/mailbox` responde 404 y el correo sin proveedor falla de forma explícita.
- LR-14: los correos reales ya no se copian al buzón DEV (D111, `mailer.test.ts`).
- LR-15: pestañas Nutrición y Mi cuerpo, y el recuadro «video demostración (pendiente)», ocultos por interruptor (D111).
- G09: cobro a REPI fuera de la app (D109).
- Primer Admin con 2FA en producción (D87, verificado 27/10).
