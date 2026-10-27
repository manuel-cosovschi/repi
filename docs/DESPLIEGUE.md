# REPI — Despliegue hospedado (DEMO)

Actualizado: 27/10/2026. Decisión: docs/DECISIONS.md D68. **Es un entorno DEMO**: sólo datos `is_demo`, sin proveedor de email (D24), sin clientes reales ni cobros. No es el lanzamiento productivo (gates G01–G12 en docs/continuidad/PLAN_LANZAMIENTO_Y_ROADMAP.md).

## Dónde está

| Pieza | Valor |
| --- | --- |
| URL | **https://repiclub.com** (desde 27/10; www también). Siguen respondiendo repi-app.vercel.app y otros alias de Vercel |
| Vercel | cuenta `manuel-cosovschi`, proyecto `repi` (`prj_6fMiibV39EF6glUaqGFYXb1UfuGB`), plan Hobby, Root Directory `apps/web`, funciones en `gru1` (São Paulo) |
| Deploy | automático en cada push a `main` de github.com/manuel-cosovschi/repi (Git conectado). Manual: `vercel --prod` desde la raíz del repo |
| Supabase | org «repi org», proyecto `repi` (ref `qiamewdridgdvsyysmog`), región `sa-east-1`, plan gratuito, Postgres 17 |
| Conexión app | rol propio `repi_app` (dueño de las tablas) por el pooler `aws-1-sa-east-1.pooler.supabase.com`: puerto 6543 (transacción) para la app, 5432 (sesión) para migraciones/seed/scripts. Usuario `repi_app.qiamewdridgdvsyysmog` |
| Archivos | Supabase Storage, bucket privado `repi-private` (límite 80 MB). El navegador nunca recibe URLs del bucket |
| Jobs | avisos cada minuto: pg_cron `repi-notifications` → `GET /api/cron/notifications`. Videos vencidos: Vercel Cron diario 06:30 UTC → `/api/cron/purge-media` |

## Variables de entorno en Vercel (production; sólo nombres)

`DATABASE_URL` (pooler 6543), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ROSTER_HMAC_SECRET`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` (= URL de la app), `REPI_DEPLOY=demo`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`.

**Ya no hace falta** (D83: proxy `repi-storage`). Antes faltaba `SUPABASE_SECRET_KEY` (clave secreta `sb_secret_…` del proyecto): sin ella las subidas de video/imagen fallan con error explícito. Cargarla: Supabase → Project Settings → API Keys → Secret key, y `vercel env add SUPABASE_SECRET_KEY production` + redeploy. No se pudo obtener por las herramientas disponibles sin el login del titular.

Los valores secretos se generaron localmente y están sólo en la máquina del titular, en `~/.repi-secrets/` (permisos 600, fuera del repo): `supabase_repi_app_pw`, `supabase.env` (URLs de conexión), `vercel.env` (secretos de app). La contraseña de `repi_app` nunca viajó: a Supabase se envió sólo su verificador SCRAM. Si se cambia de computadora: rotar (nuevo verificador con `ALTER ROLE repi_app PASSWORD …` desde el SQL editor y nuevas variables en Vercel) en lugar de copiar esos archivos por canales inseguros.

## Dominio repiclub.com (D84)

Registrado en GoDaddy, nameservers en Vercel (`ns1/ns2.vercel-dns.com`, verificado 27/10). Hecho: app y pg_cron apuntan a `https://repiclub.com`. Falta: se cargan los registros DNS de Resend (`GET /api/cron/mail-domain?verify=1` con `Authorization: Bearer CRON_SECRET`) y `MAIL_FROM` pasa a `REPI <hola@repiclub.com>`.

## Correo real (cuando el titular elija proveedor, D24/D70/D82)

Estado 27/10: **activo**. `RESEND_API_KEY` cargada por el titular; repiclub.com verificado en Resend (registros en Vercel DNS: `resend._domainkey` TXT, `send` MX y TXT, `rsend` CNAME, `_dmarc` TXT); `MAIL_FROM=REPI <hola@repiclub.com>`. Prueba de entrega: `GET /api/cron/mail-test?to=<email>` con `Authorization: Bearer CRON_SECRET`. En DEMO cada correo además queda en `/dev/mailbox`.

1. Crear cuenta en Resend (u otro proveedor; Resend ya tiene adaptador) y verificar el dominio remitente (registros SPF/DKIM).
2. En Vercel: `MAIL_DRIVER=resend`, `RESEND_API_KEY`, `MAIL_FROM` (p. ej. `REPI <hola@dominio>`), opcional `MAIL_REPLY_TO`; redeploy.
3. Probar alta, verificación, recuperación e invitación con un email propio antes de quitar `REPI_DEPLOY=demo`.

## Seguridad de la base

- RLS activado en todas las tablas de `public` y sin privilegios para `anon`/`authenticated`: la API REST pública de Supabase no expone nada. `repi_app` es dueño y no está sujeto a RLS.
- Migraciones nuevas: `scripts/migrate.ts` activa RLS en cualquier tabla nueva de `public` después de migrar.
- Migraciones aplicadas en Supabase: 0000–0012. **Aplicar migraciones antes de hacer push del código que las necesita** (el deploy es automático).

## Operación

```bash
# Migraciones (desde apps/web; usar la URL de sesión 5432)
DATABASE_URL="$(grep ^DATABASE_URL_SESSION ~/.repi-secrets/supabase.env | cut -d= -f2-)" npx tsx scripts/migrate.ts
# Seed DEMO: sólo local (repi_dev en localhost). Bloqueado contra Supabase/Vercel desde D87.
# Primer REPI Admin (una vez; vence en 24 h; el enlace queda en ~/.repi-secrets/primer-admin.txt)
DATABASE_URL="…sesión…" NEXT_PUBLIC_APP_URL=https://repiclub.com npx tsx scripts/first-admin.ts
# (Re)programar avisos cada minuto
DATABASE_URL="…sesión…" APP_URL=https://repi-app.vercel.app CRON_SECRET=… npx tsx scripts/schedule-cron.ts
```

Correos: en `REPI_DEPLOY=demo` además quedan en `/dev/mailbox`, visible sólo para REPI Admin.

Cuentas del seed (`@demo.repi.app`): **fuera de uso en el entorno hospedado (D87)**. El 27/10 se les quitó contraseña, rol Admin y sesiones en Supabase, y Better Auth rechaza sus sesiones en cualquier despliegue. Para mostrar REPI usar la demo guiada (`/demo`, D85). REPI Admin: la cuenta personal del titular activada con `scripts/first-admin.ts` (D87).

## Respaldos (D91)

```bash
# Desde apps/web. Sólo lee; el resultado queda en ~/.repi-secrets/backups/<fecha>-hosted/ (no en el repo).
pnpm ops:backup --source=hosted --storage
# Ensayo de restauración en la base local descartable (una vez: createdb -h localhost repi_restore_check)
RESTORE_DATABASE_URL=postgresql://<usuario>@localhost:5432/repi_restore_check pnpm ops:restore ~/.repi-secrets/backups/<carpeta>
```

Nunca restaurar sobre Supabase con estos scripts: lo bloquean. Una restauración real del entorno hospedado es una decisión del titular y se hace a un proyecto nuevo, no encima del actual.

## Límites conocidos

1. Vercel Hobby: cuerpo de petición de funciones ≤ 4,5 MB. Los videos suben directo al bucket con URL firmada (D71); necesita `SUPABASE_SECRET_KEY` cargada. Sin probar todavía contra Supabase real.
2. Sin proveedor de email: altas y recuperación reales no funcionan fuera del modo DEMO (D24).
3. Push: claves VAPID productivas generadas; entrega en teléfonos reales no probada.
4. Plan gratuito de Supabase pausa el proyecto tras 7 días sin actividad; el cron de avisos lo mantiene activo. Sin backups PITR: respaldo lógico manual con `pnpm ops:backup` (D91); frecuencia y guarda externa pendientes.
5. Hobby es para uso no comercial: pasar a Pro antes de clientes reales (decisión de gasto del titular).
