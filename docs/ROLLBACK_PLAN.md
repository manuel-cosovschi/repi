# REPI — Plan de reversión

Actualizado: 27/10/2026 (D111).

## Código (lo más común)

1. Vercel → proyecto `repi` → Deployments → el último deploy sano → **Promote to Production**. Tarda segundos y no toca la base.
2. Confirmar con `curl -s https://repiclub.com/api/version` que volvió el commit anterior.
3. Corregir en `main` con un commit nuevo (no reescribir historia) y publicar normalmente.

La PWA ofrece actualizar sin borrar lo pendiente (D92): una reversión no hace perder series guardadas en el teléfono.

## Migraciones

Las migraciones sólo agregan, así que el código anterior sigue funcionando con la base nueva: **no se revierte la migración**, sólo el código. Si una migración tuviera que deshacerse, se escribe otra hacia adelante, probada en `repi_test` y en una restauración local.

## Datos

1. Si hay datos en riesgo: respaldo inmediato `pnpm ops:backup --source=hosted --storage` (sólo lee).
2. Restaurar nunca encima de Supabase: los scripts lo bloquean. Una restauración real va a un proyecto nuevo, la decide el titular y después se cambia `DATABASE_URL` en Vercel.
3. Con Supabase Pro (LB-02) existe además el respaldo diario del proveedor.

## Módulos

Si un módulo falla en producción y no es el núcleo: apagarlo con `NEXT_PUBLIC_REPI_FEATURES=-clave` y redeploy ([FEATURE_FLAGS.md](FEATURE_FLAGS.md)). Los datos quedan intactos.

## Comunicación

Avisar por correo a los responsables de las organizaciones afectadas, sin datos de otras personas (`docs/SOPORTE_OPERACION.md` §Incidentes).
