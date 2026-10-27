# REPI — Estado de continuidad observado

Corte documental/código: 27/10/2026. Commit observado antes de estos documentos: `25ea04a3b9263bbd797aed3c09b97168b698d773`. Git estaba sin cambios visibles al inicio de esta revisión. Revalidar al retomar: puede haber desarrollo concurrente. Esta revisión **no ejecutó pruebas de la app ni certificó un entorno productivo**.

## Base existente

Monorepo pnpm 9.15.4, Node ≥22 declarado, apps/web Next.js/React/TypeScript, PostgreSQL + Drizzle, Better Auth, CSS/tokens y biblioteca Phosphor. Ver package.json y lockfile para versiones; no actualizarlas por memoria. Dominio puro en packages/domain. Siete migraciones 0000–0006 observadas. Directorios de pruebas de acceso, entrenamiento, sync, seguimiento, gym, comunidad y anexo. Tests recrean esquemas de su DB: leer advertencia abajo.

| Área | Evidencia observada | Qué se puede concluir |
| --- | --- | --- |
| Acceso/Admin comercial | rutas activar/unirse/admin; server/access, commercial, join; AdminApp y gym/Access | Hay código integrado; historial declara recorridos y pruebas. No demuestra email productivo |
| Entrenamiento/Coach | ProgramBuilder, training/services, MemberApp, Workout, offline | Núcleo real con versiones, sesiones, cola y seguimiento según código/docs; hay que probar el corte vigente |
| Gym | Floor/Manage/Members/Perf/Owner/Community y servicios | Hay operación, reseñas, mensajería, contratos y gestión; no son sólo stubs, aunque apartados viejos lo digan |
| Club y comunidad | community/club.ts y services.ts; Gym.tsx | Hay publicaciones/perfil/evolución y moderación reportadas. Expansión amplia pendiente |
| G · Atlética | contrato visual, Ic.tsx, estilos, fuentes | Implementación reportada; no volver a Inter Tight ni rehacer desde el comparador |
| Motion | components/motion/Ambient, Carousel, Confetti, StepSlider; motion.md §12 | M01–M05 integradas según registro; pruebas físicas y BI todavía pendientes |
| HyperFrames | design/motion; preview documentacion/motion/previews/REPI_motion_M01-M05_60fps.mp4 | Composición y export existen; no es una biblioteca runtime de controles |
| BI/cobros | inventario, plan y fuentes | No se comprobó implementación productiva de BI ni proveedor de cobro; no anunciar operativos |

El historial declara 74 pruebas de dominio y 80 de integración después del anexo, además de tipos/build, y una entrega posterior visual/motion. Son resultados **reportados por el desarrollador anterior**, no reproducidos aquí. Los apartados antiguos describen pendientes luego resueltos; leer cronológicamente hasta el último y contrastar código, no tomar la primera lista como estado actual.

## Bloqueos/evidencia directa

1. `apps/web/src/server/mailer.ts` lanza error explícito en producción porque no hay proveedor (27/10: adaptador Resend listo, D70; falta que el titular elija proveedor). Registro/verificación/recuperación/bienvenida requieren resolverlo antes de usuarios reales.
2. `apps/web/src/app/manifest.ts` declara sólo icono 162×162 y start_url /app. Hay que completar/verificar instalación y entrada sin sesión. La búsqueda puntual de guía/beforeinstallprompt en acceso/activar/unirse no halló implementación: tratar como pendiente a confirmar, no como prueba exhaustiva de ausencia.
3. `server/storage.ts` usa almacenamiento local privado; en producción exige STORAGE_DIR (27/10: driver Supabase Storage y subida directa, D68/D71; falta `SUPABASE_SECRET_KEY`). Puede funcionar con volumen durable correctamente operado, pero no asumir que el hosting elegido lo ofrece. Falta decisión/validación de almacenamiento, backups y retención.
4. Push tiene código Web Push y jobs, pero el estado declara claves de desarrollo y ninguna entrega real en teléfono verificada; falta configuración/ejecución de producción.
5. `apps/web/tests/global-setup.ts` hace DROP SCHEMA public y drizzle. La guarda sólo comprueba que TEST_DATABASE_URL contiene repi_test. Antes de ejecutar la suite, asegurar DB descartable distinta de las otras y reforzar guardas; no mostrar valores de conexión en logs/documentos.
6. Textos legales aún reportados como borrador; condiciones de menores, mora/corte/fiscalidad y algunos permisos permanecen pendientes. No declarar resuelto por existir aceptación en DB.
7. ~~Alertas por sensación de serie limitadas a la sede principal.~~ Resuelto 27/10 (D72): usa el ingreso registrado por recepción.
8. ~~Baja con cola offline deja rechazo persistente.~~ Resuelto 27/10 (D73): datos conservados, reintento por evento y descarte manual.
9. Pruebas de instalación/offline/push en dispositivos reales pendientes según el registro. La guía PWA y el icono requieren pruebas específicas.

## Documentación desactualizada que se resolvió en este traspaso

El máster anterior aún usaba Inter Tight, hablaba de conteo por elegibilidad/uso y apuntaba a rutas antiguas del handoff. El inventario generado conserva nombres obsoletos de autoalta/trial/padrón/importe demo. El nuevo máster y catálogo de continuidad normalizan esas reglas sin borrar el registro original. El nuevo CLAUDE y PROMPT_INICIAL apuntan a esta continuidad. El historial anterior se conserva.

Los estados del inventario generado no se cambiaron a mano ni se reinterpretaron como pruebas actuales. Claude debe reconciliar su generador al tocar los módulos. No ejecutar el generador sólo para fingir actualización de estados.

## Qué no se hizo en esta revisión

No se instaló nada, no se migró DB, no se ejecutaron seeds/tests/build, no se abrió producción, no se enviaron emails ni se cobraron importes. No se copiaron secretos, base de datos ni archivos privados al paquete documental. El contenido de la carpeta no incluye automáticamente las bases locales o remotas: ver GUIA_TRASPASO.md.
