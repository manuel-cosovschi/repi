# REPI — Final Release Hardening 06/06

Fecha: 05/11/2026. Rama: `feat/repi-release-hardening-06`, desde `main` en `70e7779` (hotfix #35). Decisiones: D197 (seguridad y calidad 06/06) y D198 (vigilante de respaldos).

**Qué es este documento:** la evaluación técnica y operativa del cierre de la serie 01/06–06/06. Distingue lo **verificado** (con evidencia, fecha y ambiente) de lo **implementado sin verificar**. No es una declaración de cumplimiento legal.

> **Publicado el 05/11/2026 21:06 UTC** con autorización del titular: PR #36, squash `ab4e1ad`. Antes, un respaldo verificado `backup-20261105-210336-42108774553`. Smoke productivo con demos: 10/10. Integridad histórica sin cambios. Detalle en `docs/continuidad/PROXIMA_SESION.md` §«Publicación del bloque 06/06». El vigilante de respaldos está publicado pero **no armado** (falta `BACKUP_HEARTBEAT_SECRET`). Publicar no equivale a autorizar un lanzamiento comercial masivo: rige el veredicto del §25.

**Qué no hace este bloque:**
- No publica nada: el PR queda para revisión y autorización del titular.
- No aplica migraciones.
- No toca datos reales, salvo lo autorizado explícitamente en el chat (§15).
- No agrega funcionalidades nuevas de producto, salvo la herramienta operativa del vigilante de respaldos (§14).

---

## 1. Estado inicial verificado

| Qué | Valor | Cómo se verificó |
| --- | --- | --- |
| `main` | `70e7779` (PR #35, hotfix D196) sobre `d004d98` (PR #34) | `git log`, API de GitHub |
| Producción | **`70e7779`** desde las 18:32 UTC (`/api/version`) | Vercel tardó ~29 min en crear el deploy del merge (18:01 → 18:30). No se sabe si fue demora de Vercel o un redeploy manual: sin acceso al equipo (§16) |
| PR abiertos | #2 (borrador, D181, control de acceso; no se toca) | API de GitHub |
| Migraciones | 46 registradas, última `0045_experience_ux` | `drizzle.__drizzle_migrations` (sólo lectura) |
| Base | PostgreSQL 17.11, `sa-east-1`, 28 MB, 16/60 conexiones | Supabase MCP (sólo lectura) |
| Datos reales | 53 usuarios, 5 organizaciones (3 gimnasios, 2 coaches), 20 entrenamientos, 172 series. Demos aparte: 32 organizaciones `is_demo` | Consulta de conteos, sin datos personales |
| Storage | 1 archivo vigente (74 565 bytes) | `storage.objects` |
| Planes | Supabase **Free** (organización `repi org`). Vercel: **sin acceso** (403 al equipo `manuel-cosovschis-projects`). La documentación anterior dice Hobby | Supabase MCP; Vercel MCP |
| Funciones | Vercel en `gru1` (São Paulo), junto a la base | Encabezado `x-vercel-id: iad1::gru1::…` |
| Respaldos | Último verificado `backup-20261105-144245-42047337258`: primera ejecución **programada** exitosa (corrida 42047337258, evento `schedule`, 14:40 UTC) | API de GitHub |
| CI | `ci.yml`: typecheck, guardas, integración, build. **No corre E2E** | Lectura del workflow |

## 2. Matriz de validación

Estados: **VP** verificado en producción · **VA** verificado en entorno aislado · **VT** verificado por prueba automática · **DF** pendiente de dispositivo físico · **AE** pendiente de autorización externa · **DC** defecto confirmado (con su estado) · **NV** no verificado · **NA** no aplica.

Ambientes:
- **Prod:** repiclub.com, sólo demos o lectura.
- **Aislado:** build de producción local con PostgreSQL 16 descartable (`repi_dev`/`repi_test`), en el contenedor de esta sesión.
- **CI:** GitHub Actions.

Todas las filas son del 05/11/2026, sobre el commit de esta rama, salvo que se indique otra cosa.

| ID | Requisito | Prior. | Riesgo | Prueba | Resultado | Evidencia | Ambiente | Próximo paso (responsable) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H-SEC-01 | Ninguna ruta de la API entrega datos sin sesión | P0 | Alto | Barrido de las 129 rutas (164 combinaciones ruta × método) sin cookie | **VA** · 0 rutas con 2xx salvo 2 públicas revisadas; 0 con 5xx | `e2e/api-auth-sweep.spec.ts` | Aislado | Correr en cada release (Claude) |
| H-SEC-02 | CSRF: una escritura desde otro sitio no se ejecuta | P1 | Medio | Origin ajeno, `null`, prefijo engañoso y `Sec-Fetch-Site: cross-site` | **DC → corregido y VP** · 403 desde otro origen con y sin sesión; misma escritura desde REPI 200 (05/11 21:08) | `tests/csrf.test.ts`, barrido E2E, smoke productivo | Prod | Confirmar Safari en iPhone (titular) |
| H-SEC-03 | Cabeceras: HSTS, nosniff, frame DENY, referrer | P1 | Bajo | `curl -I` a producción | **VP** | HSTS 2 años, `X-Frame-Options: DENY`, `nosniff` | Prod | — |
| H-SEC-04 | CSP mínima y Permissions-Policy | P2 | Bajo | Cabeceras en producción | **DC → corregido y VP** | smoke productivo | Prod | — |
| H-SEC-05 | CORS cerrado | P1 | Medio | `OPTIONS` con Origin ajeno a `/api/me/export` | **VP** · 204 sin `Access-Control-Allow-*` | curl | Prod | — |
| H-SEC-06 | XSS | P0 | Alto | Revisión de `dangerouslySetInnerHTML` (8 usos) | **VT/revisión** · todos son SVG de QR generados por la librería o el arranque del tema; sin texto de personas | grep + lectura | Código | — |
| H-SEC-07 | Inyección SQL | P0 | Alto | Revisión de `sql.raw`/`unsafe` | **Revisión** · 1 `sql.raw` con constantes; el resto parametrizado (Drizzle) | grep | Código | — |
| H-SEC-08 | Archivos: tipo real, tamaño, dueño | P0 | Alto | Magic bytes (`sniff`), tamaño, intención de subida de un uso | **VT** | `tests/uploads.test.ts`, `club-profile.test.ts` | Aislado | — |
| H-SEC-09 | Rate limiting en ingreso, códigos, invitaciones, contacto y escritura | P0 | Alto | Contadores en base compartidos | **VT** · IP de `X-Forwarded-For`, que Vercel sobrescribe (no se puede falsificar). Prueba desde el contenedor no concluyente (el proxy de salida rota IP) | `tests/ratelimit.test.ts`; [docs de Vercel](https://vercel.com/docs/headers/request-headers) | VT | — |
| H-SEC-10 | Autenticación: registro con verificación, recuperación, sesiones revocadas, cierre, 2FA, OTP con 5 intentos y 15 min, magic link 10 min sin alta | P0 | Alto | Suites de acceso | **VT** | `access.test.ts`, `security-launch.test.ts`, `logout.test.ts` | Aislado | — |
| H-SEC-11 | 2FA obligatoria para roles con acceso amplio (Admin, dueño) | P1 | Alto | Política | **Riesgo aceptado (D119)** · optativa por decisión del titular | D119 | — | Decidir antes de la expansión: al menos Admin (titular) |
| H-SEC-12 | Dependencias | P2 | Bajo | `pnpm audit --prod` | **VA** · 0 altas o críticas; 1 moderada (esbuild 0.18 dentro de drizzle-kit: servidor de desarrollo, no se usa en producción) | salida de `pnpm audit` | Aislado | Actualizar cuando drizzle-kit lo traiga (Claude) |
| H-SEC-13 | Base: RLS en todas las tablas, sin permisos `anon`/`authenticated` | P0 | Alto | Advisor de Supabase | **VP** · 104 tablas con RLS sin políticas (diseño deny-all, D68). 1 aviso: `gym_task_event_immutable` sin `search_path` fijo | `get_advisors security` | Prod | Fijar `search_path = ''` en una migración futura (P3) |
| H-SEC-14 | Secretos fuera del repositorio y de los logs | P0 | Alto | grep y lectura de `log.ts` y `alerts.ts` | **Revisión** · sin `console.log` en el servidor; los logs enmascaran rutas; las alertas no llevan datos personales | código | Código | — |
| H-PRIV-01 | El dueño/gerente no ve salud, notas personales ni chats privados | P0 | Alto | Integración | **VT** | `gym.test.ts` («datos privados de un entrenador», «notas»), D40 | Aislado | — |
| H-PRIV-02 | Salud sólo con consentimiento por tipo y revocación inmediata | P0 | Alto | Integración | **VT** | `access.test.ts`, `followup.test.ts` | Aislado | — |
| H-PRIV-03 | Exportar mis datos y pedir eliminación | P0 | Medio | Integración | **VT** · la eliminación la ejecuta Admin a mano | `privacy.test.ts`, `docs/PRIVACIDAD_OPERACION.md` | Aislado | Automatizar el borrado (post-06) |
| H-PRIV-04 | Auditoría de lecturas sensibles y denegados | P1 | Medio | Integración | **VT** | `data_access_log`, `denied.test.ts` | Aislado | — |
| H-PRIV-05 | Menores: consentimiento del tutor | P0 | Alto | Integración | **VT** | `access.test.ts` («menores») | Aislado | Revisión legal (titular) |
| H-PRIV-06 | Búsqueda pública de gimnasios sin demos | P2 | Medio | API productiva cotejada con la base | **DC → corregido y VP** · antes 33 sedes de demo; ahora 3 sedes, 0 demos | `sandbox.test.ts`, smoke productivo | Prod | — |
| H-DATA-01 | Integridad de 0045 y migraciones | P0 | Alto | Catálogo | **VP** · 46/46, hash de 0045 `36cdc6b5…` | sólo lectura | Prod | — |
| H-DATA-02 | Respaldo diario verificado y restauración en base descartable | P0 | Alto | Workflow | **VP** · cada corrida restaura y compara; 278 FK sin huérfanos | releases verificados | CI | Seguir el cronograma 7 días (titular) |
| H-DATA-03 | Ausencia de respaldo detectada aunque la ejecución no empiece | P0 | Alto | Integración + producción | **VT · publicado · NO ARMADO** · corre cada hora (21:07: `armed:false`); sin señal registrada | `tests/backup-watch.test.ts`, respuesta del cron | Prod | Configurar `BACKUP_HEARTBEAT_SECRET` (titular, §14) |
| H-DATA-04 | Purga de archivos nunca borra lo referenciado | P0 | Alto | Integración con tabla nueva | **VT + publicado** (PR #35, `70e7779` en producción desde 18:32 UTC). La primera purga con esta lógica es el 06/11 06:30 UTC | `club-profile.test.ts` | Aislado + Prod | Mirar el resultado de la purga del 06/11 (Claude/titular) |
| H-TRN-01 | Entrenador programa → alumno recibe → entrena → registra → sincroniza → finaliza → historial | P0 | Alto | Integración + E2E | **VT/VA** | `launch-flows.test.ts` LF-01, `member-workout.spec.ts` | Aislado | — |
| H-TRN-02 | Carga del profe visible y nunca pisada por la sugerencia; sin cargas inventadas; lo registrado no cambia al actualizar | P0 | Alto | Integración + E2E | **VT/VA** | `prescribed-weights.test.ts` (8 casos), `prescribed-weights.spec.ts` | Aislado | Cuentas de prueba vinculadas en producción (titular) |
| H-TRN-03 | Caso Urko: plantilla → asignar → editar → la copia no cambia → actualizar → «Tu profe indicó X kg» → reasignar con sesión abierta → «Aplicar ahora» sin tocar lo hecho | P0 | Alto | Integración + E2E con demos | **VT/VA** · **NV en producción** con cuentas reales | `prescribed-weights.test.ts` («caso real…»), `template-rollout.test.ts` («alumno entrenando…»), `template-rollout.spec.ts` | Aislado | Crear 2 cuentas de prueba vinculadas y correr `verify-coach-weights-prod.mjs` (titular) |
| H-TRN-04 | Métodos: pirámides, top set, back-off, Load Set, drop, rest-pause, myo, cluster, AMRAP, EMOM, circuitos, superseries, aproximación, fallo, tiempo, cardio | P0 | Alto | Dominio + integración + E2E | **VT/VA** | dominio (371), `connected-methods.test.ts`, `methods-everywhere.test.ts`, `coach-methods.spec.ts`, `connected-stages.spec.ts`, `emom-sync.spec.ts`, cardio en `own-routine-create.spec.ts` | Aislado | — |
| H-TI-01 | Training Intelligence: nunca sustituye la prescripción, no convierte faltantes en 0, falla sin impedir entrenar | P0 | Alto | Integración | **VT** | `training-intelligence*.test.ts`, `training-safety.test.ts` | Aislado | — |
| H-TI-02 | Cargas del equipo (ladder) al refrescar | P1 | Medio | Cliente | **VT** · regresión de cliente nueva para el hotfix #26 (falla con la lógica previa) | `tests/workout-ladder-client.test.ts` | Aislado | — |
| H-TI-03 | Equipamiento: prioridad plan > sede > desconocido; otro gimnasio no ve las cargas | P1 | Medio | Integración | **VT** · **NV en producción** con equipos reales | `gym-equipment.test.ts` | Aislado | Cuentas de prueba en una sede (titular) |
| H-HIS-01 | Correcciones, anulación, restauración, auditoría, idempotencia, 409, recálculo | P0 | Alto | Integración + E2E | **VT/VA** | `history-corrections.test.ts`, `weight-edit.spec.ts`, `experience-ux.spec.ts` | Aislado | — |
| H-OFF-01 | Sin conexión: registrar, recargar sin red, recuperar, reconectar, sincronizar una vez | P0 | Alto | E2E nueva + smoke productivo | **VA + VP (emulado)** · local 2/2 y 6/6; en producción con demo, en teléfono emulado y escritorio: 0 sin red → 2 al reconectar, sin duplicados | `e2e/offline-reload.spec.ts`, smoke productivo | Prod (Chromium emulado) | Repetir en teléfonos reales (titular, §13) |
| H-OFF-02 | Conflictos entre dispositivos explícitos; reintentos sin duplicar | P0 | Alto | Integración | **VT** | `sync.test.ts` (6 casos) | Aislado | — |
| H-DEV-01 | iPhone (Safari y PWA) y Android (Chrome y PWA) | P0 | Alto | Manual | **DF** · no hay dispositivo físico accesible desde esta sesión. La emulación no cuenta como prueba en teléfono | lista en §13 | — | Titular con sus teléfonos |
| H-OPS-01 | Alertas de errores por email | P1 | Medio | — | **VP** (D149, 29/10) | `alert-test` | Prod | — |
| H-OPS-02 | Logs de Vercel | P1 | Medio | — | **AE** · 403 al equipo | — | — | Autorizar el acceso (titular, §16) |
| H-OPS-03 | Deploy automático de `main` | P1 | Medio | Estado del commit | **VP con demora** · `70e7779` desplegó 29 min después del merge (otros merges del 05/11: ~1 min) | API de GitHub | Prod | Con acceso a Vercel, revisar la cola de builds (titular) |
| H-PERF-01 | Latencia real en producción | P1 | Medio | Una demo, pedidos secuenciales | **VP** · ver §17 | `perf/latency.mjs` | Prod | — |
| H-PERF-02 | Carga escalonada | P1 | Medio | Usuarios virtuales con demos propias | **VA** · ver §17 | `perf/load.mjs` | Aislado | Repetir en staging con plan pago (titular) |
| H-INF-01 | Hosting apto para uso comercial | P0 comercial | Alto | Planes | **AE** · Supabase Free; Vercel sin confirmar (probablemente Hobby, que prohíbe uso comercial) | §18 | — | Cambiar de plan (titular) |
| H-LEG-01 | Términos, privacidad, DPA, menores revisados | P0 público | Alto | — | **AE** | borrador `v2026.10` (D109) | — | Abogado (titular, §19) |

## 3. Arquitectura evaluada

- **App:** Next.js 16 (App Router) en Vercel, funciones en `gru1`. 129 rutas de API, casi todas con `handle()` (`src/server/access/http.ts`): errores uniformes, denegados auditados y, desde D197, rechazo de escrituras de otro sitio. Las de cron verifican `CRON_SECRET` y sin él responden 404.
- **Autenticación:** better-auth.
  - Email y contraseña con verificación obligatoria.
  - OTP (6 dígitos, hash, 5 intentos, 15 min) y magic link (10 min). Ninguno de los dos crea cuentas.
  - 2FA optativa (D119). Rate limit propio en base.
  - Anti-enumeración en el registro.
- **Datos:** PostgreSQL de Supabase con un rol propio `repi_app`, RLS deny-all para `anon`/`authenticated` y toda la autorización en los servicios del servidor. Drizzle parametrizado.
- **Archivos:** bucket privado `repi-private` detrás de la Edge Function `repi-storage` (secreto de proxy). URLs firmadas de corta duración.
- **Offline:** IndexedDB con dueño (se borra al salir) y service worker que sólo cachea la carcasa, nunca `/api`. Reintentos idempotentes por id de serie.
- **Trabajos:** pg_cron de Supabase → `/api/cron/notifications` cada minuto, y cron diario de Vercel → `/api/cron/purge-media`.
- **Respaldos:** GitHub Actions con credencial temporal de sólo lectura, cifrado age, restauración verificada y Releases.

## 4. Vulnerabilidades y defectos encontrados

| # | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| V-01 | P1 | **CSRF sin segunda barrera.** Las rutas propias aceptan JSON aunque llegue como `text/plain`. La única defensa era la cookie SameSite=Lax del navegador | **Corregido:** `crossSiteWrite()` en `handle()` rechaza Origin ajeno, inválido o `Sec-Fetch-Site: cross-site`. Las llamadas sin navegador (cron, servidores) siguen igual |
| V-02 | P2 | Sin `Content-Security-Policy` ni `Permissions-Policy` | **Corregido** con una CSP que no toca scripts (`frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`) y cámara/ubicación sólo propias |
| V-03 | P2 | La búsqueda pública de sedes mostraba **33 sedes de demo**: una persona real podía pedir acceso a un gimnasio ficticio que se borra a las 6 h | **Corregido** (filtro `is_demo = false`) con prueba |
| V-04 | P3 | Algunas rutas validan el cuerpo antes que la sesión (400 en vez de 401 sin sesión). No filtra datos: el mensaje es genérico | Abierto (P3), documentado |
| V-05 | P3 | Función de trigger sin `search_path` fijo (aviso de Supabase). No es `SECURITY DEFINER` ni referencia tablas | Abierto (P3): `ALTER FUNCTION public.gym_task_event_immutable() SET search_path = ''` en la próxima migración |
| V-06 | P1 (riesgo) | 2FA optativa también para REPI Admin y dueños (D119, decisión del titular) | Riesgo aceptado; recomendado exigirla al menos a Admin antes de la expansión |
| V-07 | P3 | esbuild 0.18 (moderada) dentro de drizzle-kit: sólo afecta al servidor de desarrollo | Abierto |
| D-01 | P2 operativo | El deploy de `70e7779` (hotfix #35) tardó ~29 min en crearse | **Resuelto solo:** en producción desde las 18:32 UTC. La causa no se pudo ver sin acceso a Vercel |
| D-02 | P1 | Falta prueba de cliente del hotfix #26 (ladder) | **Corregido:** `mergeIntel()` extraída sin cambiar el comportamiento, con prueba que falla con la lógica previa |
| D-03 | P1 | Ninguna E2E cubría recargar la app **sin conexión** con series pendientes | **Agregada:** `e2e/offline-reload.spec.ts` |
| D-04 | P0 | Un respaldo omitido no avisaba (GitHub puede no crear la ejecución) | **Implementado** D198 (se arma con un secreto del titular) |
| D-05 | P2 | CI no corre E2E | Abierto: se corren a mano antes de cada release (§21) |
| D-06 | P3 | No hay linter (ni ESLint ni script `lint`); sólo typecheck. En la descripción del PR #35 se dijo por error «lint en verde» (corregido) | Abierto: sumar `eslint` con la config de Next en un PR propio |

## 5. Pruebas

Ver §21 para los totales y los casos omitidos. Se agregaron:
- `tests/csrf.test.ts` (2 pruebas).
- `tests/workout-ladder-client.test.ts` (3).
- `tests/backup-watch.test.ts` (4).
- Un caso en `tests/sandbox.test.ts` (demos fuera de la búsqueda pública).
- `e2e/api-auth-sweep.spec.ts` (2).
- `e2e/offline-reload.spec.ts` (1 por dispositivo).

Cada prueba de un defecto se comprobó también **fallando** con la lógica anterior: CSRF, ladder, búsqueda con demos y purga (#35).

## 6–11. Privacidad, entrenamiento, métodos, coach, gimnasio e historial

Están en la matriz (§2: H-PRIV, H-TRN, H-TI, H-HIS) con su evidencia. En este bloque no se encontraron defectos nuevos en esos flujos: las suites que los cubren pasaron completas (§21). Lo que no se pudo verificar en producción con cuentas reales vinculadas (caso Urko, equipamiento de una sede real) queda como **NV en producción**, a la espera de cuentas de prueba del titular.

## 12. Offline y sincronización

- **Cubierto antes de este bloque:**
  - `sync.test.ts` (6 casos): horas del dispositivo, reenvío sin duplicar, versión vieja, conflictos de dos dispositivos, base vieja que no pisa la nueva, dos sesiones abiertas.
  - E2E sin conexión dentro de una sesión: `connected-stages`, `prescribed-weights`, `training-intelligence`, `theme`.
- **Nuevo:** `e2e/offline-reload.spec.ts` cubre los 11 pasos del máster en el navegador:
  1. Inicia con conexión.
  2. Espera a que el service worker controle la página.
  3. Corta la red.
  4. Registra dos series y saltea el descanso.
  5. Comprueba que el servidor **no** las tiene (nada se declara sincronizado).
  6. **Recarga sin red** (abre la carcasa cacheada).
  7. Recupera las dos series de IndexedDB.
  8. Reconecta.
  9. Espera exactamente `0,1` en el servidor.
  10. Recarga otra vez.
  11. Confirma que siguen siendo 2.
- **Actualizar la versión de la PWA:** el service worker nuevo borra sólo cachés de carcasa (`repi-shell-*`); IndexedDB no se toca. Está cubierto por el diseño y por `theme.spec.ts` (recarga), sin una prueba específica de cambio de versión con pendientes: **NV**.

## 13. Dispositivos físicos — lista para el titular

No se probó ningún teléfono real en este bloque. Seguí esta lista con una cuenta de prueba (no la de un alumno real) y anotá fecha, modelo, sistema y resultado en `docs/QA_CHECKLIST.md` §Dispositivos.

**iPhone (Safari, iOS actual)**
1. Abrí https://repiclub.com/instalar en Safari → Compartir → «Agregar a inicio». El ícono no tiene doble marco.
2. Abrí desde el ícono: arranca sin barra de Safari. La barra inferior no tapa nada (safe area) y la muesca no corta el título.
3. Ingresá con la cuenta de prueba. Cerrá la app desde el selector y volvé a abrir: sigue la sesión.
4. Comenzá un entrenamiento. Tocá el peso: aparece el teclado **numérico con coma**. Escribí 42,5 y completá la serie.
5. Dejá correr el descanso con la pantalla bloqueada 30 s: al volver, el tiempo es el correcto.
6. Activá el modo avión. Registrá 2 series más. Tiene que verse «Sin conexión» o «Pendiente», nunca «Guardado».
7. Con el modo avión puesto, cerrá la app del todo y volvé a abrirla desde el ícono: abre y las series siguen ahí.
8. Sacá el modo avión. En menos de 30 s tiene que decir «Guardado». Desde una computadora, en el historial hay **exactamente** esas series, sin duplicados.
9. Notificaciones (iOS 16.4+ y sólo con la app instalada): Perfil → activar avisos → aceptar el permiso → pedirle a un coach de prueba que mande un mensaje: llega el aviso.
10. Apariencia: Ajustes de iOS en oscuro y en claro, y en REPI «Automático», «Claro» y «Oscuro». Todo se lee.
11. Girá el teléfono en el entrenamiento: nada se superpone.

**Android (Chrome)**
1. Abrí https://repiclub.com/instalar → «Instalar app». El ícono no aparece recortado.
2. Abrí desde el ícono. Probá ingresar, entrenar y el teclado numérico como en el iPhone (pasos 3–4).
3. Descanso: con la app en segundo plano, el aviso de fin de descanso llega (D107).
4. Modo avión → 2 series → cerrá la app desde Recientes → abrila → sacá el modo avión. Las series llegan una sola vez.
5. Notificaciones: aceptá el permiso. Un mensaje del coach de prueba llega con la app cerrada.
6. Alterná segundo plano y primer plano durante un descanso: el tiempo se mantiene.

**Cámara (si el gimnasio usa ingreso por QR):** escanear el QR de la pantalla de recepción en los dos teléfonos (GA-07). **No** se reactiva el control presencial de Smart Center para esto: hacerlo en una organización de prueba.

## 14. Respaldos y recuperación

- **Estado al 05/11:** último verificado `backup-20261105-144245-42047337258` (programado, 14:40 UTC). Hay 3 releases vigentes y la retención funcionó (el de las 13:47 se reemplazó por el último del día). Cada corrida descifra, compara hashes, restaura en PostgreSQL descartable y cuenta claves foráneas sin huérfanos.
- **Cronograma:** funcionó **una vez**. La confiabilidad no está probada: el 05/11 no se crearon ni las 06:17 ni las 12:47 a horario. Mirar una semana el filtro `schedule`.
- **Cifrado:** age con la clave pública del titular. La privada está fuera de GitHub. Ninguna corrida tiene acceso a la privada.
- **Permisos:**
  - Credencial de base temporal y de sólo lectura por corrida (Edge Function `repi-backup-credentials`).
  - Storage por OIDC.
  - Los PR no reciben secretos.
- **Vigilante nuevo (D198):** ver `docs/RESPALDOS.md` §Cronograma.
  - Email si pasan más de 30 h sin respaldo verificado. Lo revisa la tarea de Supabase de cada minuto, no GitHub, así que detecta una ejecución que nunca empezó.
  - Se arma con `BACKUP_HEARTBEAT_SECRET` (titular, 5 minutos).
  - Segunda capa externa opcional: Healthchecks.io, gratis, decisión del titular.
- **RPO (pérdida máxima):** hasta ~24 h. **RTO (tiempo de recuperación):** 2–4 h, no ensayado en un proyecto nuevo.
- **Clave privada, procedimiento local** (en la computadora del titular, nunca en el chat): `docs/RESPALDOS.md` §Recuperación.
  1. `./scripts/operations/restore-from-release.sh último ~/ruta/repi-respaldos.age.key --sin-base` → tiene que decir «Respaldo íntegro» con el mismo hash de base del release.
  2. Ensayo de restauración en `repi_restore_check` (base descartable local).
  3. Borrar la carpeta descifrada al terminar (`rm -rf` de la carpeta que imprime el script).
  4. Segunda copia offline de la clave (impresa o en el SSD, fuera de `Backups/`).

## 15. Incidente de la foto del Club

- **Causa raíz:** `purgeMedia` consideraba huérfano todo archivo no listado a mano. `club_post` y `club_profile` (D169) no estaban en la lista. La purga del 05/11 06:41 UTC borró de Storage la foto de una publicación real.
- **Regresión y prevención:**
  - **PR #30** sumó esas dos tablas.
  - **PR #35 (D196)** cambió la lógica: la purga lee del catálogo de Postgres **toda** clave foránea a `media_object`. Lo vencido no se borra si otra tabla lo usa, y si falta alguna referencia conocida no purga nada.
  - Prueba con una tabla nueva creada en la prueba, que falla con la lógica anterior.
- **Referencias Storage ↔ base:** el respaldo copia sólo los archivos vigentes. Hoy hay 1 archivo en Storage y está referenciado.
- **Recuperación:** **no se hizo y ya no está pendiente.** El titular decidió (chat 05/11) no recuperar la foto: la publicación se quitó como lo hace la app (`status = removed`, una fila) y su dueño recibió un aviso con disculpas.
  - Se hizo con guardas de 1 fila, en una transacción con `set local role repi_app`.
  - La pertenencia de roles quedó igual que antes (comprobado).
  - Para deshacerlo: volver la fila a `visible` y borrar el aviso.
- **Script de recuperación (PR #34):** queda sin uso. Respeta archivo exacto, SHA-256, tamaño y nunca sobrescribe; no toca la base. La clave sólo se usa en el equipo del titular.

## 16. Observabilidad

- **Hoy:**
  - Logs estructurados (`src/server/log.ts`, rutas enmascaradas).
  - Denegados auditados.
  - Alertas por email de errores 5xx y de tareas (D149: 1 por hora por error igual, 20 por hora en total, sin datos personales).
  - Alerta de respaldo fallido (issue automático del workflow).
  - Desde D198, alerta de **ausencia** de respaldo.
- **Sin acceso:** logs y deploys de Vercel (403). **Acceso mínimo a habilitar:** aprobar el enlace de `authorize_team_access` para el equipo `manuel-cosovschis-projects` (lectura de deployments y runtime logs del proyecto `repi`). No se intentó eludirlo.
- **Base:** sin errores relevantes en `pg_stat_statements`. Lo más pesado son los borrados de demos vencidas (100–160 ms con cascadas). Todo lo frecuente está por debajo de 1 ms.
- **Alertas que faltan:**
  - **Migración fallida:** hoy se aplica a mano con script transaccional, y si falla no queda nada a medias.
  - **Errores de sincronización persistentes:** llegan como 5xx a la alerta general; no hay métrica propia.
  - **Storage caído:** 5xx al subir o leer, entra en la alerta general.
  - **Autenticación persistente:** sin alerta específica.
  - Recomendación: no agregar más canales hasta tener acceso a los logs de Vercel, para no sumar ruido.

## 17. Rendimiento

**Producción** (05/11 ~18:45 UTC). Una demo de alumno, 8 pedidos secuenciales por ruta, desde este contenedor en EE. UU. (borde `iad1`, función `gru1`):

| Ruta | p50 | p90 |
| --- | --- | --- |
| `/` (sitio) | 326 ms | 460 ms |
| `/api/version` | 299 ms | 494 ms |
| `/api/me/training` (8 KB) | 357 ms | 447 ms |
| `/api/me/history` | 230 ms | 253 ms |
| `/api/me/notifications` | 278 ms | 316 ms |
| `/api/me/inbox` | 279 ms | 450 ms |
| `/api/me/level` | 255 ms | 507 ms |
| Alta de demo (crea un gimnasio ficticio completo) | 7,8 s | — |

Unos 150 ms de cada número son la ida y vuelta EE. UU. ↔ São Paulo de esta medición. Desde Argentina deberían verse ~100–200 ms menos. Esto **no se midió desde Argentina**.

**Carga escalonada (entorno aislado):** servidor de producción local y PostgreSQL 16 en el mismo contenedor. Cada usuario virtual es una demo propia que alterna registrar una serie con lecturas reales.

Sin pausa entre pedidos: cada usuario virtual equivale a muchas personas reales.

| Usuarios virtuales (30 s) | Pedidos/s | Errores | Registrar serie p50 / p95 | Abrir entrenamiento p50 / p95 | Historial p50 / p95 | Notificaciones p50 / p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 140 | 0 | 26 / 38 ms | 57 / 72 ms | 21 / 29 ms | 47 / 68 ms |
| 20 | 137 | 0 | 95 / 153 ms | 258 / 331 ms | 91 / 136 ms | 200 / 268 ms |
| 50 | 142 | 0 | 247 / 381 ms | 599 / 732 ms | 261 / 391 ms | 497 / 636 ms |

**Cuello de botella observado:** el proceso de Node se satura en ~140 pedidos/s (CPU del proceso ~117 %) mientras PostgreSQL queda en ~6 % por conexión. La latencia sube de forma lineal con la concurrencia y no aparecen errores.

**Estimación, no medida:** una persona entrenando genera unos 2–3 pedidos por serie cada 1–2 minutos, así que un solo proceso alcanzaría para cientos de personas entrenando a la vez. En Vercel las funciones escalan horizontalmente; el próximo límite sería la base (CPU compartida y conexiones del plan Free).

**`/api/me/training`** es la lectura más cara (unas 3 veces el historial). Es la primera candidata a optimizar si crece el uso.

Primera corrida descartada: la base local había llegado al tope de 300 demos abiertas (las E2E no se purgan solas en local), así que esos usuarios virtuales no tenían sesión. Se purgaron las demos **de la base local descartable** y se repitió.

Límites y lectura:
- El entorno aislado tiene un solo proceso de Node y una base local: mide la app y las consultas, no la red ni el escalado de Vercel.
- En Supabase Free el límite práctico es el pool de conexiones (60 en total; 16 en uso con poco tráfico) y la CPU compartida de la instancia gratuita.
- Índices: el advisor marca 154 claves foráneas sin índice. Con 28 MB no afectan. Antes de crecer conviene indexar las que usan los borrados en cascada (`*_user_id`, `*_org_id`) y `audit_event(action, at)`. Eso es una migración: requiere autorización.
- No se encontraron N+1 en las rutas principales: las consultas frecuentes devuelven una fila por llamada.

## 18. Infraestructura comercial

| Servicio | Hoy | Problema | Mínimo recomendado | Costo (USD, 05/11/2026) |
| --- | --- | --- | --- | --- |
| Vercel | Sin confirmar (403); los documentos dicen Hobby | Hobby es sólo para uso personal no comercial ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)); sin logs para el equipo | **Pro**, 1 asiento | $20/mes con $20 de uso incluido; excedente bajo demanda ([precios](https://vercel.com/pricing), [Pro](https://vercel.com/docs/plans/pro-plan)) |
| Supabase | **Free** | Sin respaldos gestionados ni PITR; pausa por inactividad (hoy no ocurre por la tarea de cada minuto); 500 MB de base; CPU compartida | **Pro** con cómputo Micro | $25/mes con $10 de crédito de cómputo: incluye respaldos diarios con 7 días, 8 GB de disco y 250 GB de egreso ([precios](https://supabase.com/pricing)) |
| PITR (opcional) | — | RPO de 24 h | Cuando el volumen o los contratos lo exijan | ~$100/mes por 7 días ([PITR](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)) |
| Resend | Configurado (D149) | — | Plan actual mientras alcance | — |

**Mínimo para operar comercialmente:** Vercel Pro + Supabase Pro ≈ **USD 45/mes** más uso. Con PITR ≈ USD 145/mes. Ningún plan se cambió.

## 19. Legales — pendientes para el titular y su abogado

No se declara cumplimiento. Los textos `/legal/terms`, `/legal/privacy` y `/legal/dpa` son un borrador operativo (D109).

1. **Responsable del tratamiento:** razón social, CUIT y domicilio, más un contacto de privacidad.
2. **Ley 25.326 (Argentina):** inscripción de bases ante la AAIP. Datos de salud como datos sensibles: base legal y consentimiento expreso por tipo (ya implementado técnicamente).
3. **Menores:** edad mínima y consentimiento del tutor (implementado). Verificar el alcance legal.
4. **DPA con gimnasios:** roles de responsable y encargado; subencargados (Vercel en EE. UU./Brasil, Supabase en Brasil, Resend, GitHub para respaldos cifrados); transferencias internacionales.
5. **Retención:** plazos por tipo de dato. Hoy: videos 90 días tras resolverse, huérfanos 24 h, demos 6 h, respaldos ~4 meses, y lo demás hasta la baja.
6. **Derechos:** plazos de respuesta para acceso, rectificación y supresión; la eliminación hoy es manual.
7. **Alcance de las sugerencias** (Training Intelligence, reglas sin IA generativa): no son consejo médico; responsabilidad del profesional.
8. **Contrato comercial con gimnasios y coaches:** SLA de soporte (24 h urgencias publicado), limitación de responsabilidad, baja y portabilidad.
9. **Cookies y almacenamiento local:** sesión, preferencia de tema e IndexedDB con datos de entrenamiento en el dispositivo.

## 20. Calidad visual

- Barlow / Barlow Condensed, claro/oscuro/automático, sin desborde de 320 a 1366 px y accesibilidad (axe) en las pantallas principales: cubierto por `theme-visual.spec.ts`, `theme.spec.ts`, `mobile-layout.spec.ts` y `expectAccessible`.
- No se hicieron cambios estéticos en este bloque.

## 21. QA automatizada

Resultados del 05/11/2026 sobre esta rama.

| Suite | Resultado | Ambiente |
| --- | --- | --- |
| Typecheck (`tsc`) | OK | Aislado |
| Lint | **No existe:** el proyecto no tiene ESLint ni script `lint` (D-06) | — |
| Dominio (`packages/domain`) | 371/371 | Aislado |
| Guardas de base y operación (`test:guards`) | 24/24 | Aislado |
| Integración (`vitest`, base descartable `repi_test`) | **63 archivos, 407/407** | Aislado |
| E2E completa (Chromium; Pixel 7 emulado y escritorio 1366 px), build de producción local | **115 pasaron, 29 omitidas, 0 fallaron** (8,5 min) | Aislado |
| E2E nueva `offline-reload` + `connected-stages` (antes intermitente), repetidas 3 veces | **12/12** | Aislado |
| Barrido de API sin sesión (E2E nueva) | 2/2 | Aislado |
| Build de producción | OK | Aislado |

**Las 29 omitidas:**
- **21 son de diseño:** la prueba corre una sola vez, en el otro proyecto, y ahí pasó.
  - `theme-visual`: la matriz 320–1366 px recorre todos los anchos en el proyecto de teléfono.
  - `mobile-layout`: sólo teléfono.
  - El barrido de API: sólo escritorio.
- **8 son cobertura faltante real:** `theme-admin` (REPI Admin en claro, oscuro y automático) necesita `E2E_ADMIN_STATE`, una sesión de un Admin de prueba creado en la base local por el flujo legítimo (registro, verificación, 2FA y ticket del primer administrador, `scripts/first-admin.ts`). No se creó en este bloque. Queda como pendiente de QA, no de plataforma.

**Intermitentes:**
- `connected-stages` pasó en la corrida completa y 6/6 repetida.
- La falla anterior (05/11) fue por espera; no se cambió ninguna expectativa.
- **Ninguna prueba se desactivó** y ninguna expectativa se aflojó.

**Artefactos:** capturas y trazas de fallas en `e2e-results/artifacts` (configuración del repo) o en la carpeta indicada por `-c`.

**CI no corre E2E (D-05).** Antes de cada release se corren a mano con `pnpm build && pnpm start` y `pnpm e2e`. Sumar un job de E2E a CI es lo próximo en QA, con el riesgo de alargar el CI unos 10 minutos.

## 22–24. Publicación y recuperación

**Antes de integrar este PR:**
1. Producción en el último `main` (`70e7779`, verificado 18:55 UTC).
2. CI en verde.
3. Revisar el diff: sin migraciones, sin cambios destructivos.
4. Respaldo verificado del día.

**Después:**
1. Merge autorizado.
2. Deploy READY.
3. `/api/version` = commit del merge.
4. Smoke con una demo:
   - Entrar.
   - Entrenar una serie.
   - Recargar.
   - `POST` desde otro origen → 403.
   - `/api/access/locations` sin demos.
5. Mirar las alertas 1 hora.

**Reversión:** promover en Vercel el deploy anterior. No hay cambios de esquema, así que la base queda como está. Nunca se restaura la base si hubo escrituras posteriores.

**Plan de recuperación de datos:** `docs/RESPALDOS.md` §Desastre real (proyecto nuevo; nunca sobre producción; con autorización).

## 25. Veredicto por etapa

| Etapa | Cumplido | Pendiente | Riesgos | Dependencias externas | Decisión |
| --- | --- | --- | --- | --- | --- |
| **A. Beta controlada** (coaches y gimnasios conocidos, soporte cercano) | Flujos principales verificados por pruebas y en producción con demos; aislamiento y permisos; respaldo diario verificado con restauración; alertas de errores; hotfix de la purga en producción | Publicar este PR; teléfonos reales | RPO de 24 h; cronograma de GitHub con una sola ejecución programada; 2FA optativa | Ninguna bloqueante | **GO** (ya en curso), con el vigilante configurado |
| **B. Expansión comercial gradual** | Lo de A | Vercel Pro y Supabase Pro (LB-02); teléfonos reales (LB-03); acceso a los logs de Vercel; vigilante armado; 2FA de Admin; cuentas de prueba vinculadas para verificar en producción el caso Urko y el equipamiento | Hosting no comercial; sin respaldos del proveedor; sin observabilidad de Vercel | Cambio de planes (gasto), dispositivos, accesos | **NO-GO hasta** cerrar LB-02 y LB-03 y configurar el vigilante; después **GO** |
| **C. Lanzamiento comercial público** | — | Lo de B, más revisión legal (LB-04), eliminación de cuenta automatizada, E2E en CI, PITR o RPO aceptado por contrato, ensayo de recuperación en un proyecto nuevo, índices antes de crecer | Legal y privacidad sin revisión profesional; RTO no ensayado | Abogado, presupuesto | **NO-GO** |

## 26. Backlog posterior — Personal Progress & Body Tracking 1.0 (no implementado)

Pedidos de usuarios reales, **fuera** del 06/06 y distintos de Body Intelligence (sin 3D ni análisis corporal por IA):

1. Evolución de cargas.
2. Evolución de repeticiones.
3. 1RM estimado.
4. Comparaciones de volumen.
5. Peso corporal inicial, actual por fecha y objetivo, con gráfico.
6. Calorías estimadas con incertidumbre explícita.
7. Galería privada de fotos de progreso y comparación por fechas.

Dependencias y riesgos a tener en cuenta:
- **Fotos:** son datos sensibles.
  - Bucket privado, sólo de la dueña o el dueño; por defecto nunca visibles para el coach ni el gimnasio.
  - Deben entrar en la exportación de datos y en el borrado de cuenta.
  - La purga (D196) ya protege toda tabla nueva con clave foránea a `media_object`.
  - El respaldo crecerá: revisar el límite de 2 GB por archivo de release y el plan de Storage.
- **Peso corporal:** dato de salud. Consentimiento por tipo, como en H-PRIV-02.
- **Calorías:** sin precisión clínica; texto de alcance revisado por el abogado.
- **Gráficos:** pueden derivarse de `set_log` excluyendo lo anulado (D195). Sin migración para cargas, repeticiones ni 1RM; sí para peso corporal y fotos.
