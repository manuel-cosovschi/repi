# REPI — Despliegue hospedado (DEMO)

Actualizado: 27/10/2026. Decisión: docs/DECISIONS.md D68. **Es un entorno DEMO**: sólo datos `is_demo`, sin proveedor de email (D24), sin clientes reales ni cobros. No es el lanzamiento productivo (gates G01–G12 en docs/continuidad/PLAN_LANZAMIENTO_Y_ROADMAP.md).

## Dónde está

| Pieza | Valor |
| --- | --- |
| URL | https://repi-app.vercel.app (alias automáticos: repi-henna.vercel.app y otros; la app sólo confía en repi-app) |
| Vercel | cuenta `manuel-cosovschi`, proyecto `repi` (`prj_6fMiibV39EF6glUaqGFYXb1UfuGB`), plan Hobby, Root Directory `apps/web`, funciones en `gru1` (São Paulo) |
| Deploy | automático en cada push a `main` de github.com/manuel-cosovschi/repi (Git conectado). Manual: `vercel --prod` desde la raíz del repo |
| Supabase | org «repi org», proyecto `repi` (ref `qiamewdridgdvsyysmog`), región `sa-east-1`, plan gratuito, Postgres 17 |
| Conexión app | rol propio `repi_app` (dueño de las tablas) por el pooler `aws-1-sa-east-1.pooler.supabase.com`: puerto 6543 (transacción) para la app, 5432 (sesión) para migraciones/seed/scripts. Usuario `repi_app.qiamewdridgdvsyysmog` |
| Archivos | Supabase Storage, bucket privado `repi-private` (límite 80 MB). El navegador nunca recibe URLs del bucket |
| Jobs | avisos cada minuto: pg_cron `repi-notifications` → `GET /api/cron/notifications`. Videos vencidos: Vercel Cron diario 06:30 UTC → `/api/cron/purge-media` |

## Variables de entorno en Vercel (production; sólo nombres)

`DATABASE_URL` (pooler 6543), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ROSTER_HMAC_SECRET`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` (= URL de la app), `REPI_DEPLOY=demo`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`.

**Falta** `SUPABASE_SECRET_KEY` (clave secreta `sb_secret_…` del proyecto): sin ella las subidas de video/imagen fallan con error explícito. Cargarla: Supabase → Project Settings → API Keys → Secret key, y `vercel env add SUPABASE_SECRET_KEY production` + redeploy. No se pudo obtener por las herramientas disponibles sin el login del titular.

Los valores secretos se generaron localmente y están sólo en la máquina del titular, en `~/.repi-secrets/` (permisos 600, fuera del repo): `supabase_repi_app_pw`, `supabase.env` (URLs de conexión), `vercel.env` (secretos de app). La contraseña de `repi_app` nunca viajó: a Supabase se envió sólo su verificador SCRAM. Si se cambia de computadora: rotar (nuevo verificador con `ALTER ROLE repi_app PASSWORD …` desde el SQL editor y nuevas variables en Vercel) en lugar de copiar esos archivos por canales inseguros.

## Correo real (cuando el titular elija proveedor, D24/D70)

1. Crear cuenta en Resend (u otro proveedor; Resend ya tiene adaptador) y verificar el dominio remitente (registros SPF/DKIM).
2. En Vercel: `MAIL_DRIVER=resend`, `RESEND_API_KEY`, `MAIL_FROM` (p. ej. `REPI <hola@dominio>`), opcional `MAIL_REPLY_TO`; redeploy.
3. Probar alta, verificación, recuperación e invitación con un email propio antes de quitar `REPI_DEPLOY=demo`.

## Seguridad de la base

- RLS activado en todas las tablas de `public` y sin privilegios para `anon`/`authenticated`: la API REST pública de Supabase no expone nada. `repi_app` es dueño y no está sujeto a RLS.
- Migraciones nuevas: `scripts/migrate.ts` activa RLS en cualquier tabla nueva de `public` después de migrar.
- Migraciones aplicadas en Supabase: 0000–0009. **Aplicar migraciones antes de hacer push del código que las necesita** (el deploy es automático).

## Operación

```bash
# Migraciones (desde apps/web; usar la URL de sesión 5432)
DATABASE_URL="$(grep ^DATABASE_URL_SESSION ~/.repi-secrets/supabase.env | cut -d= -f2-)" npx tsx scripts/migrate.ts
# Seed DEMO (sólo en el entorno DEMO; idempotente)
set -a; . ~/.repi-secrets/vercel.env; set +a
DATABASE_URL="$(grep ^DATABASE_URL_SESSION ~/.repi-secrets/supabase.env | cut -d= -f2-)" BETTER_AUTH_URL=https://repi-app.vercel.app npx tsx scripts/seed-demo.ts
# (Re)programar avisos cada minuto
DATABASE_URL="…sesión…" APP_URL=https://repi-app.vercel.app CRON_SECRET=… npx tsx scripts/schedule-cron.ts
```

Correos: en `REPI_DEPLOY=demo` quedan en `/dev/mailbox`, visible sólo para una cuenta con `platformRole = admin` (admin@demo.repi.app del seed). Usuarios DEMO y contraseña: `apps/web/scripts/seed-demo.ts`.

## Límites conocidos

1. Vercel Hobby: cuerpo de petición de funciones ≤ 4,5 MB. Los videos suben directo al bucket con URL firmada (D71); necesita `SUPABASE_SECRET_KEY` cargada. Sin probar todavía contra Supabase real.
2. Sin proveedor de email: altas y recuperación reales no funcionan fuera del modo DEMO (D24).
3. Push: claves VAPID productivas generadas; entrega en teléfonos reales no probada.
4. Plan gratuito de Supabase pausa el proyecto tras 7 días sin actividad; el cron de avisos lo mantiene activo. Sin backups PITR (gate G10 pendiente).
5. Hobby es para uso no comercial: pasar a Pro antes de clientes reales (decisión de gasto del titular).
