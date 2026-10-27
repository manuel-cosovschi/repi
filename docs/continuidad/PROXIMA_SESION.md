# REPI — Retomar acá

Actualizado: 27/10/2026, preparación de continuidad. Máster activo: ../../MASTER_PROMPT.md.

## Último bloque cerrado — 27/10/2026 · Defectos de ESTADO_ACTUAL §7 y §8 (D72, D73)

- **Multisede (D72):** `src/server/gym/alerts.ts#alertLocation` usa el ingreso registrado por recepción (≤ 4 h, sede con acceso vigente); test nuevo en `tests/annex.test.ts`.
- **Cola tras pausa/baja (D73):** `lib/offline/queue.ts` + `store.ts` (`rejected`), aviso con «Reintentar» / «Descartar de este teléfono» en `Workout.tsx`, botón «Continuar entrenamiento en curso» en el inicio (`MemberApp.tsx`). Verificado en local con Chrome headless: pausar vínculo → serie → aviso persistente tras recargar → reactivar → «Reintentar» → «Guardado».
- **Pruebas:** web 95/95, typecheck y build OK.

## Bloque anterior — 27/10/2026 · Subida directa de videos (D71)

- **Hecho:** tabla `upload_intent` (migración `0007_direct_upload`, aplicada en dev local y Supabase), `src/server/uploads.ts` (begin/complete/purge), rutas `POST /api/uploads` y `POST /api/uploads/[id]`, `storage.ts#directUploadTarget/probeObject`, `src/lib/upload.ts#uploadVideo` usado en pedido con video (FollowSheets) y video de desafío (Gym). Job diario limpia intenciones vencidas. `scripts/migrate.ts` activa RLS en tablas nuevas.
- **Pruebas:** web 94/94 (nuevo `tests/uploads.test.ts` con Supabase simulado), dominio 74/74, typecheck y build OK.
- **Falta:** `SUPABASE_SECRET_KEY` en Vercel para que funcione en el entorno hospedado; probar una subida real desde un teléfono.

## Bloque anterior — 27/10/2026 · Corte 2: adaptador de correo (D70)

- **Hecho:** `src/server/mailer.ts` con driver Resend (HTTP, timeout, `MailError` reintentable o no, sin exponer el cuerpo) + buzón DEV/DEMO + error explícito en producción. `tests/mailer.test.ts` (contrato, sin envíos reales). Variables en `.env.example`; pasos en docs/DESPLIEGUE.md.
- **Falta (titular):** elegir proveedor, verificar dominio y cargar `MAIL_DRIVER`, `RESEND_API_KEY`, `MAIL_FROM`. Hasta entonces el entorno sigue en modo DEMO.

## Bloque anterior — 27/10/2026 · Corte 1: guía PWA y continuidad de alta (D69)

- **Hecho:** `components/access/InstallGuide.tsx` (guía por plataforma), `InstallHelp.tsx` + `app/instalar` (ayuda), `lib/entry.ts` (contexto de entrada y recuperación), `lib/platform.ts` (detección y `beforeinstallprompt`), `AccessFlow.tsx` (guía antes del alta móvil sin sesión, «Retomá tu alta», paso `recover`, paso `pendingInv`), `server/access/services.ts#pendingInvitations` + `/api/access/me` (`invitations`), `app/page.tsx` (inicio según sesión), `manifest.ts` (`id` y `start_url` estables), `public/sw.js` (inicio sin red → carcasa de /app), `layout.tsx` (captura del evento de instalación, meta web app de Apple), enlace en Perfil.
- **Pruebas:** typecheck y build OK; web 85/85 (nuevos: invitaciones pendientes vigentes del mismo email; `parseEntryInput` sólo destinos internos); Chrome headless emulando iPhone, Android, navegador interno y escritorio: script `documentacion/pwa/verificar-guia.mjs`, captura `documentacion/pwa/guia-iphone-2026-10-27.png`. **No probado en teléfonos reales** (gate G03).
- **Límite real:** Android no muestra «Instalar» porque falta el ícono 192/512 aprobado (D35); la guía da los pasos manuales.

## Bloque anterior — 27/10/2026 · Hosting DEMO (Vercel + Supabase)

- **Objetivo:** pedido del usuario «Configurá el hosting con Vercel y la base con Supabase». Hecho como entorno **DEMO** (D68). Detalle operativo: docs/DESPLIEGUE.md.
- **En vivo:** https://repi-app.vercel.app · deploy automático en cada push a `main`. Supabase `repi` (sa-east-1) migrado 0000–0006, seed DEMO cargado, RLS activado, bucket privado `repi-private`, pg_cron de avisos cada minuto respondiendo 200.
- **Código:** `src/server/deploy.ts` (REPI_DEPLOY=demo), `mailer.ts` (buzón DEV en demo), `app/dev/mailbox` (sólo REPI Admin en demo), `storage.ts` (driver Supabase Storage), `db/index.ts` (pooler sin prepare), `push/services.ts` (after()), `app/api/cron/*`, `server/cron.ts`, `vercel.json`, `scripts/schedule-cron.ts`. Test de sync estable cerca de medianoche.
- **Pruebas:** typecheck OK; web 80/80 y dominio 74/74 contra `repi_test` local; build OK; humo hospedado: /acceso 200, /unirse/demo-palermo muestra Gym Norte · Palermo desde Supabase, /api/cron/notifications 200 con secreto y 404 sin él. No se probó login en el entorno hospedado desde esta sesión.
- **Secretos:** sólo en `~/.repi-secrets/` del titular y en Vercel. Nunca en el repo.
- **Pendiente inmediato del titular (un paso):** cargar `SUPABASE_SECRET_KEY` en Vercel (ver docs/DESPLIEGUE.md) para habilitar subidas.
- **Próxima acción técnica:** corte 3 (alta y atención en gym: misma cola piso/recepción, push con fallback, concurrencia/revocación) y corte 6 (operación durable: backups, límites, exportación/borrado).

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
