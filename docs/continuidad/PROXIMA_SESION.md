# REPI — Retomar acá

Actualizado: 27/10/2026, preparación de continuidad. Máster activo: ../../MASTER_PROMPT.md.

## Último bloque cerrado — 27/10/2026 · Hosting DEMO (Vercel + Supabase)

- **Objetivo:** pedido del usuario «Configurá el hosting con Vercel y la base con Supabase». Hecho como entorno **DEMO** (D68). Detalle operativo: docs/DESPLIEGUE.md.
- **En vivo:** https://repi-app.vercel.app · deploy automático en cada push a `main`. Supabase `repi` (sa-east-1) migrado 0000–0006, seed DEMO cargado, RLS activado, bucket privado `repi-private`, pg_cron de avisos cada minuto respondiendo 200.
- **Código:** `src/server/deploy.ts` (REPI_DEPLOY=demo), `mailer.ts` (buzón DEV en demo), `app/dev/mailbox` (sólo REPI Admin en demo), `storage.ts` (driver Supabase Storage), `db/index.ts` (pooler sin prepare), `push/services.ts` (after()), `app/api/cron/*`, `server/cron.ts`, `vercel.json`, `scripts/schedule-cron.ts`. Test de sync estable cerca de medianoche.
- **Pruebas:** typecheck OK; web 80/80 y dominio 74/74 contra `repi_test` local; build OK; humo hospedado: /acceso 200, /unirse/demo-palermo muestra Gym Norte · Palermo desde Supabase, /api/cron/notifications 200 con secreto y 404 sin él. No se probó login en el entorno hospedado desde esta sesión.
- **Secretos:** sólo en `~/.repi-secrets/` del titular y en Vercel. Nunca en el repo.
- **Pendiente inmediato del titular (un paso):** cargar `SUPABASE_SECRET_KEY` en Vercel (ver docs/DESPLIEGUE.md) para habilitar subidas.
- **Próxima acción técnica:** subida directa de videos al bucket con URL firmada (Vercel limita el cuerpo a 4,5 MB); después seguir la ruta crítica: corte 1 PWA y continuidad de alta, corte 2 adaptador de correo productivo.

## Objetivo inmediato

Cerrar una primera versión web/PWA utilizable por gyms y coaches cuanto antes; completar después el resto. No reconstruir núcleo, G · Atlética ni M01–M05 si las pruebas del código actual confirman que funcionan.

## Snapshot

Commit observado al inicio: 25ea04a3b9263bbd797aed3c09b97168b698d773. En esta revisión se cambiaron documentos y se agregaron docs/continuidad/; no se cambió código de producto ni DB. El directorio documentacion/historial/2026-10-27_antes_de_continuidad/ conserva entradas anteriores. Git puede mostrar esos cambios sin commit; respetarlos. Releer Git al arrancar por posible trabajo posterior de Claude.

## Primera acción concreta

1. Leé el máster y ESTADO_ACTUAL.md, revisá Git y las rutas de acceso/PWA.
2. Confirmá si ya hay guía de instalación/continuidad agregada después de este snapshot. Si falta, implementá el corte PWA previo al login conforme al anexo: guía por dispositivo, conservar/recuperar invitación/QR, salida navegador y acceso desde inicio. Reutilizá auth/service worker; no crear una app nueva.
3. Si ya está resuelto, siguiente bloqueo: mailer productivo (el inspeccionado falla en producción). Prepará un adaptador y configuración verificable; credenciales y proveedor requieren decisión del titular, no inventarlas.
4. Antes de pruebas de integración, revisá/endurcé la guarda de TEST_DATABASE_URL, porque global-setup borra esquemas. Durante la preparación documental no se ejecutó esa suite.
5. Continuá por los gates V1 y dejá evidencia. No dediques el bloque inicial a BI experimental ni a repetir motion.

## Bloqueos externos conocidos

Proveedor/remitente email, dominio/hosting/DB/almacenamiento durable, claves push productivas y teléfonos, textos/menores/retención, condiciones de cobro/corte/piloto. Ver DECISIONES_PENDIENTES.md. Implementar trabajo independiente mientras se concretan; no declarar lanzamiento por pasar pruebas simuladas.

## Pruebas de esta revisión

Se revisó documentación/código de forma acotada y se verificará la integridad de este paquete documental. No tests/build de la app, no migraciones, no correos externos, no despliegue. Los números de tests del desarrollador anterior son históricos y se deben distinguir de una ejecución nueva.

## Plantilla de actualización al cerrar cada bloque

- Fecha, objetivo y commit actual:
- Cambios sin commit y archivos tocados:
- Comportamiento real logrado / limitaciones:
- Comandos ejecutados, entorno y resultados:
- Migraciones y compatibilidad de datos/cola:
- Dependencias/configuración nuevas (sólo nombres, sin secretos):
- Decisiones confirmadas / propuestas / pendientes:
- Gates de lanzamiento que cambian de estado y evidencia:
- Próxima acción concreta y archivos de entrada:
- Servicios activos necesarios (puertos/propósito, sin credenciales):
