# REPI — Cómo se publica una versión

Actualizado: 27/10/2026 (D111). Infraestructura, variables y comandos de operación: [DESPLIEGUE.md](DESPLIEGUE.md). Reversión: [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md).

## Flujo

1. **Probar en local** (desde `apps/web`, con dev detenido para el build):
   - `pnpm vitest run` (base descartable `repi_test`; leer `tests/global-setup.ts` antes: recrea esquemas).
   - `pnpm test:guards` y `cd packages/domain && pnpm test`.
   - `pnpm build`; después `git checkout next-env.d.ts`.
   - Navegador en desktop y 375 px para lo que cambió en pantalla.
2. **Migraciones primero.** Si el cambio trae `drizzle/00NN_*.sql`, aplicarla en Supabase antes del push (el deploy es automático):
   `DATABASE_URL="$(grep ^DATABASE_URL_SESSION ~/.repi-secrets/supabase.env | cut -d= -f2-)" npx tsx scripts/migrate.ts`
   Las migraciones sólo agregan (tablas, columnas con default, índices). Nada que borre o renombre sin un paso de compatibilidad previo.
3. **Push a `main`.** Vercel construye y publica en https://repiclub.com.
4. **Verificar:** `curl -s https://repiclub.com/api/version` devuelve el commit nuevo; abrir la pantalla tocada; revisar errores en Vercel (`"level":"error"`).
5. **Registrar** la decisión en `docs/DECISIONS.md` y el bloque en `docs/continuidad/PROXIMA_SESION.md`.

## Release candidata

Una release candidata es un tag `rc-AAAA.MM.DD` sobre `main` con su fila de resultados en `RELEASE_READINESS.md`. Mientras hay una candidata abierta sólo entran correcciones de lanzamiento. Primera: `rc-2026.10.27`.

## Lo que requiere autorización del titular

Cambiar de plan (Vercel, Supabase), quitar `REPI_DEPLOY=demo`, borrar datos en producción, cargar clientes reales, cambiar dominio o proveedor de correo, cualquier cobro.
