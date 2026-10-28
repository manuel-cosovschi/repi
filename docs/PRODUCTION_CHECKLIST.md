# REPI — Checklist de producción

Actualizado: 27/10/2026 (D111). ✓ hecho y verificado · ◐ parcial · ✗ pendiente (con su bloqueante).

| Ítem | Estado | Detalle |
| --- | --- | --- |
| Dominio y HTTPS | ✓ | repiclub.com en Vercel DNS (D84) |
| Base de datos y migraciones | ✓ | Supabase sa-east-1, 0000–0023 aplicadas, RLS en todas las tablas |
| Autenticación productiva | ✓ | Better Auth, verificación por código, 2FA Admin/dueño, cuentas del seed bloqueadas (D87) |
| Primer REPI Admin | ✓ | 1 Admin con 2FA (27/10) |
| Correo real | ✓ | Resend, dominio verificado; sin copias al buzón DEV (D111) |
| Almacenamiento de archivos | ◐ | Bucket privado con proxy (D83); subida de video contra Supabase real sin probar |
| PWA | ◐ | Manifest, íconos, service worker, cola offline; teléfonos reales LB-03 |
| Variables y secretos | ✓ | Sólo en Vercel y `~/.repi-secrets/` (0600); nunca en el repo ni en logs |
| Build y deploy | ✓ | Automático desde `main`; [DEPLOYMENT.md](DEPLOYMENT.md) |
| Reversión | ✓ | [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md) |
| Logs | ✓ | Logs estructurados en Vercel; auditoría en `audit_event` |
| Alertas de errores | ✗ | LB-06 |
| Respaldo y restauración | ◐ | Ensayo OK 27/10; frecuencia y copia externa LB-05 |
| Plan de hosting comercial | ✗ | LB-02 |
| Términos, privacidad, DPA | ◐ | Borrador v2026.10 publicado; abogado y datos de empresa LB-04 |
| Contacto de soporte | ✓ | Sitio, /ayuda, legales (D109); procedimiento en `SOPORTE_OPERACION.md` |
| Exportar / eliminar datos | ✓ | Autoservicio de exportación y pedido de eliminación; ejecución manual por Admin (`PRIVACIDAD_OPERACION.md`) |
| Módulos incompletos ocultos | ✓ | [FEATURE_FLAGS.md](FEATURE_FLAGS.md) |
| Modo productivo explícito | ✓ | `REPI_DEPLOY` eliminada de Vercel (27/10) |
| Datos ficticios | ✓ | La demo guiada (`/demo`) usa datos `is_demo` aislados y rotulados; no se mezcla con clientes |
