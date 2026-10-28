# REPI — Estado de implementación

## REPI Connect · seguimiento de sala (28/10/2026, D126)

- **Implementado y verificado en local:** pedido del socio (Inicio y desde el ejercicio), bandeja «Sala» con tomar atómico, atender, registrar, seguimiento, transferir con aceptación, resolver y cancelar; línea de tiempo y «¿Te sirvió?» del socio; disponibilidad declarada; avisos internos y push con reglas fijas; tablero «Seguimiento de sala»; bandera por gimnasio en Admin; demo con datos sintéticos. Detalle en [connect/REPI_CONNECT_OVERVIEW.md](connect/REPI_CONNECT_OVERVIEW.md).
- **Pruebas:** dominio 118/118, web 192/192 (11 de Connect), guardas 11/11, build OK. Navegador: socio a 375 px, profesor y dueño en escritorio.
- **No desplegado:** falta autorización del titular para aplicar la migración 0025 en Supabase y publicar (la demo pública lo mostraría activo). Sin teléfonos reales todavía.

## Estado de lanzamiento (27/10/2026, D111) — leer primero

- **Fase actual:** E — release candidata `rc-2026.10.27` congelada para beta controlada. Sólo entran correcciones de lanzamiento.
- **Completado en este corte:** auditoría contra la directiva «LAUNCH FIRST»; matriz P0/P1/P2 ([RELEASE_READINESS.md](RELEASE_READINESS.md)); interruptores por módulo (Nutrición, Mi cuerpo y video de ejercicio ocultos); los correos reales ya no se copian al buzón DEV; prueba de punta a punta del circuito Coach con negativas (`tests/launch-flows.test.ts`); ensayo de respaldo y restauración; documentos de lanzamiento (MVP_SCOPE, LAUNCH_BLOCKERS, QA_CHECKLIST, PRODUCTION_CHECKLIST, DEPLOYMENT, ROLLBACK_PLAN, FEATURE_FLAGS, POST_LAUNCH_ROADMAP).
- **Tests ejecutados:** web 172/172, dominio 107/107, guardas 11/11, build OK.
- **Bloqueantes (todos externos):** [LAUNCH_BLOCKERS.md](LAUNCH_BLOCKERS.md) LB-01..LB-07: copia vieja de correo en producción, plan de hosting comercial, teléfonos reales, revisión legal, frecuencia de respaldo, alertas, modo productivo.
- **Errores conocidos:** ninguno abierto en el circuito P0. El ítem F-ID-19 (checklist de puesta en marcha) sigue estático.
- **Próxima acción:** con las autorizaciones del titular, cerrar LB-01 y LB-07 y arrancar la beta; mientras, Adaptive Coach 1b (resto) sin tocar el núcleo.


Actualizado: 26/10/2026 · Etapa 1 (Base + REPI Acceso) y Etapa 2 (Coach → programa → asignación → sesión del alumno) Etapa 3 (sesión sin conexión), Etapa 4 (seguimiento y consentimiento), Etapa 5 (operación y gestión del gym, reseñas y mensajería) y Etapa 6 (comunidad del gym y Repi Club). Estado por ID: `docs/PRODUCT_INVENTORY.md`.

## Qué funciona hoy (demostrado)

| Flujo | IDs | Evidencia |
|---|---|---|
| Registro con aceptación legal versionada en servidor; código de verificación por email (6 dígitos, 15 min, hash en DB) | F-ID-01, F-ID-04, F-ID-15, F-ID-20 | `apps/web/tests/access.test.ts` «registro»; navegador 390 px (alumno) y 1280 px (dueño) |
| Email ya registrado: respuesta indistinguible + aviso al titular (anti-enumeración) | F-ID-01 | test «email duplicado» |
| Invitación de alumno por coach: lookup con datos reales, aceptación única, consentimientos por defecto apagados | F-ID-03, F-ID-14, F-CO-13 | tests «invitación de alumno»; navegador: `?code=R7K2QX` → datos → verificación → consentimiento (Salud activada) → `/app`; DB: grants `training`,`health` con versión, invitación `accepted` |
| Códigos revocados, vencidos o reutilizados rechazados; autoinvitación rechazada | F-ID-16 | tests |
| Menores: <13 bloqueado; 13–17 sin salud/fotos hasta aprobación del adulto por enlace de un solo uso | F-ID-13 | test «menores» |
| Dueño de gym: CUIT con dígito verificador, DPA vinculado a la organización, invitación de equipo por rol, 2FA obligatoria antes del panel | F-ID-09, F-ID-10, F-ID-06 | tests «gimnasio»; navegador 1280: CUIT inválido rechazado → cuenta → verificación → invitación Recepción → enrolamiento TOTP (QR + 10 códigos) → `/gym/:id`; logout → login pide 2FA → selector |
| Invitación de staff ligada al email: otra cuenta 403 + evento de auditoría `denied` | F-ID-11 | test |
| Socio por padrón (DNI como HMAC) o pedido a recepción; recepción decide una sola vez; medidas al staff no se conceden (D06) | F-ID-12, F-GR-01 | tests «socio en padrón», «fuera de padrón» |
| Recuperación: misma respuesta para email inexistente; el reset revoca sesiones | F-ID-05 | test «recuperación» |
| Selector de espacio desde relaciones reales; páginas ajenas 404, APIs ajenas 403 | F-ID-08, F-MO-01 | tests; navegador con sesión de dueño contra Gym Norte/Agustín Pérez Coach/`/admin` |

Comandos: `pnpm test` (16 dominio + 15 integración contra `repi_test`, recreada en cada corrida) · `pnpm typecheck` · `pnpm build` (OK, 26 rutas).

## Fidelidad visual

Comparado contra `REPI Acceso.dc.html` a 390 px (móvil oscuro) y 1280 px (panel navy 42 % + formulario claro): jerarquía, tipografía, radios, chips, toggles, checks, CTA cian con texto oscuro y wordmark PNG + punto coinciden. Diferencias intencionales en `docs/DESIGN_CONTRACT.md §Acceso`. Defectos detectados en la verificación y corregidos: wordmark sin estilos fuera de `/acceso`, contorno de foco en el título, campos sin nombre accesible (ahora `label for`), "Volver" tras verificar email, toast desktop centrado sobre la columna.

## Limitaciones y pendientes de esta etapa

- Google/Apple: sin credenciales (D20); el botón lo informa. Enlace mágico implementado, no recorrido en navegador.
- Escanear QR: sólo enlace (`?code=`, `?sede=`); sin cámara en la app.
- Email: buzón DEV `/dev/mailbox` (D24). En producción `sendMail` falla a propósito.
- Adulto responsable sólo por email; WhatsApp requiere proveedor.
- Onboarding coach (coach1→coachDone) cubierto por servicio y tipos; no recorrido completo en navegador.
- "Ya tengo cuenta" + código pendiente: implementado, sin prueba automatizada.
- Rate limit en memoria por proceso (no compartido entre instancias).
- Superficies Coach/Gym/Alumno/Admin son stubs con guardas reales; el contenido llega en Etapas 2–7.
- Textos legales inexistentes (D21): se registra la versión `v2026.05-borrador`.
- WCAG 2.2 AA no auditado aún (foco de pasos, `role=switch`, `label for`, `aria-live` implementados; falta lector de pantalla real y contraste medido).
- Pruebas E2E automatizadas de navegador no instaladas (disco al 97–100 %); la verificación visual fue manual con el navegador integrado.

## Seguridad

`next dev` mostró un aviso de vulnerabilidad con instrucciones dirigidas al agente; no se ejecutaron. Se verificó con `pnpm audit` y se actualizó a versiones parcheadas (DECISIONS T06). `next dev` además generó `apps/web/AGENTS.md` y agregó `.next/dev/types/**/*.ts` a `tsconfig.json`.

---

# Etapa 2 — Núcleo Coach → programa → alumno

Fuentes: `REPI Desktop Coach.dc.html` (panel, clientes, constructor, modal Asignar) y `REPI App Alumno v4.dc.html` (inicio, entrenar, sesión activa, descanso, resumen).

## Qué funciona hoy (demostrado)

| Flujo | IDs | Evidencia |
|---|---|---|
| Constructor con autoguardado real: nombre, semanas, días (agregar/renombrar/quitar), ejercicios de la biblioteca, series/reps/RIR/descanso, orden, indicación | F-CO-08, F-HX-04 | Navegador 1440 px: renombrar «Torso A» → «Guardado» en servidor; `tests/training.test.ts` |
| Versionado copy-on-write: versión congelada al asignar o al usarse; guardar después crea versión nueva; sin cambios no crea versión | F-CO-08, C04 | Tests «asignar crea copias independientes», «editar … no reescribe una sesión ya iniciada» |
| Asignar crea una copia por cliente con fecha de inicio (hoy / próximo lunes / 1 del mes siguiente); reemplaza la asignación anterior sin borrarla | F-CO-08 | Navegador: modal fiel al prototipo, asignado a Sofía y Valentina; test de copias independientes |
| Aislamiento: otro coach no lee, edita ni asigna programas ajenos ni clientes de otra organización (404) | — | Test «otro coach no ve ni asigna» |
| Alumno: inicio con próximo día real, semana con días entrenados, estado sin programa y programa con inicio futuro | F-CL-01, F-CL-02, F-CL-15 | Navegador 390 px; tests «programa con inicio futuro», «sin programa» |
| El día elegido abre sus ejercicios (Piernas no abre Torso A); inicio idempotente por ID de cliente; una sola sesión abierta por persona | F-CL-02, C02 | Navegador: Piernas → Sentadilla; test idempotencia y `open_session` |
| Registro de series con steppers ±2,5 kg/±1 rep, RIR opcional, edición de una serie hecha; serie idempotente (reintento no duplica) | F-CL-03, F-CL-12 | Navegador; test «series idempotentes, validadas y aisladas» |
| Estado de guardado según el hecho: Guardando / Guardado / Pendiente de sincronizar (n) / Error al guardar | F-CL-16 (parcial) | Navegador («Guardado» tras confirmar el servidor) |
| Descanso por timestamp con el valor prescripto de cada ejercicio, pausa, +30s, saltar; sobrevive a recargar | F-CL-04, F-HX-04 | Navegador: 2:30 de Sentadilla; recarga a mitad → 2:16 |
| Reloj de sesión por timestamps: no se detiene al navegar ni recargar; la pausa explícita lo congela (D31) | F-CL-03, D31 | Navegador: 01:58 congelado en pausa; test «pausa no suma tiempo» |
| Resumen derivado de lo registrado (duración activa, ejercicios y series x/y, volumen, récord sólo con historia comparable); «completo» sólo si se hicieron todas las series | F-CL-05, C25 | Navegador «Piernas registrado · 2/13 · 120 kg»; test de récord 85×6 → 87,5×7 |
| RPE y nota de sesión llegan a la ficha del coach | F-CL-11, F-CO-05 | Navegador: ficha de Sofía con sesión, RPE y nota |
| Panel del coach con KPIs reales y pendientes; directorio con búsqueda, filtros y orden; ficha con 8 pestañas (las sin datos lo dicen) | F-CO-01, F-CO-02 | Navegador 1280/900/390 px (sidebar, rail, drawer) |
| Historial y volumen semanal del alumno; «Datos insuficientes» con menos de dos semanas | F-CL-06 (parcial) | Navegador |

Comandos: `pnpm test` → 30 dominio + 25 integración (todas OK) · `pnpm typecheck` · `pnpm build` OK.

## Defectos encontrados en la verificación y corregidos
Filas del constructor con texto del programa anterior (clave de React), URL perdida al recargar por doble montaje en desarrollo, filas que se partían por un botón que el prototipo no tiene, texto blanco en el modal (portal fuera del tema), choque de clase `.today` en la semana, ícono de pausa oculto por un selector amplio, descanso borrado antes de leerse al recargar, tarjeta de inicio con el día equivocado durante una sesión en curso, título «completo» con sesión incompleta.

## Limitaciones y pendientes
- Offline real (recargar sin conexión, IndexedDB, service worker, conflicto entre dispositivos): Etapa 3. Hoy la cola reintenta y avisa, pero la sesión no se abre sin red.
- Sin aviso de programa nuevo en la app (F-CL-14), sin «Pedir mi programa» (F-CL-13): Etapa 4.
- Notificación del descanso con la app en segundo plano (F-HX-22) no implementada.
- Biblioteca sólo de lectura (catálogo base sin medios); CRUD propio, superseries, tempo y sustituciones: pendientes (F-CO-09, GAP-10).
- Rendimiento, Progreso, Salud, Nutrición, Mi cuerpo y Pagos de la ficha muestran su estado real vacío o bloqueado.
- Mensajes, Solicitudes y Pagos del coach: Etapas 4 y 7.
- Relación con más de un coach: se usa la primera activa (D11/GAP-24).
- Programas del gym para socios: Etapa 5 (un socio sólo de gym ve «sin programa»).
- No hay E2E automatizado de navegador; la verificación fue manual con el navegador integrado.

---

# Etapa 3 — Sesión sin conexión

## Qué funciona hoy (demostrado con build de producción y el servidor detenido)

| Flujo | IDs | Evidencia |
|---|---|---|
| Recargar `/app` sin servidor: carcasa del service worker + programa guardado en IndexedDB, con aviso «Sin conexión · programa guardado el …» | F-CL-07 | Navegador 390 px con `next start` detenido |
| Iniciar un entrenamiento y registrar series sin conexión; el estado dice «Sin conexión · N pendientes» | F-CL-07, F-CL-16 | Navegador: Torso B iniciado y serie 1 registrada sin servidor |
| Recargar a mitad de la sesión sin conexión conserva series, reloj y descanso | F-CL-07 | Navegador: 01:42 de descanso tras recargar |
| Al volver el servidor: sincroniza sin duplicar y con la hora real del dispositivo | F-CL-07 | DB: `started_at` 10:11:43 (offline), 1 serie; test «reenviar todo no duplica nada» (activeMs exacto) |
| Sesión abierta en otro dispositivo: conflicto visible; «Cerrar el otro y seguir con este» cierra el otro conservando sus series y lo audita | D34 | Navegador + DB (`session.closed_for_other`); test de integración |
| Misma serie desde dos dispositivos: se guardan ambas versiones, la persona elige; la descartada queda en `sync_conflict` | T16 | Navegador («Guardada 5 kg × 10 / Desde otro dispositivo 50 kg × 8» → 50 × 8, revisión 2); DB `kept_local` con ambos valores; tests `other_device` y `stale_base` |
| Iniciar con una versión vieja del programa (el coach editó mientras no había red) se acepta y conserva esa versión | D32 | Test |
| Horas imposibles del dispositivo se rechazan | D33 | Test |
| Cerrar sesión borra IndexedDB, localStorage y la caché; otra cuenta en el mismo dispositivo borra los datos anteriores antes de mostrar nada | master §6 | Navegador: kv/sessions/queue = 0 tras cerrar sesión; control de dueño en `ensureOwner` |
| `/api` nunca se cachea en el service worker | T17 | Navegador: 0 entradas `/api` en la caché |

Pruebas: 40 de dominio (incluye reglas de sync) + 31 de integración, todas OK. Build de producción OK.

## Defecto encontrado en la verificación y corregido
Al cargar desde el servidor una serie en conflicto, el aviso mostraba la versión aplicada como «la otra»: ahora cada conflicto sabe cuál versión es la de este dispositivo y los botones muestran los valores concretos.

## Limitaciones y pendientes
- Simulación de «sin conexión» = servidor detenido (el navegador integrado no permite poner la red en modo offline); `navigator.onLine` no se probó en un teléfono real.
- No se probó en Safari/iOS (políticas de almacenamiento y service worker distintas) ni en un teléfono físico.
- Iniciar sesión, historial y resumen con récords necesitan conexión; sin red el resumen es local y lo avisa.
- No hay notificación del descanso con la app en segundo plano (F-HX-22) ni sincronización en segundo plano (Background Sync).
- Instalación como app: ícono de 162 px hasta tener el vector (D35).
- El service worker sólo se registra en producción; en desarrollo no hay modo offline.

---

# Etapa 4 — Seguimiento y consentimiento

Fuentes: `REPI App Alumno v4.dc.html` (hojas checkin/pain/help/healthAdd, Perfil y privacidad, avisos) y `REPI Desktop Coach.dc.html` (Solicitudes, pestaña Salud, «Pedir acceso»).

## Qué funciona hoy (demostrado)

| Flujo | IDs | Evidencia |
|---|---|---|
| Check-in de 3 toques antes de entrenar (saltable) o desde el acceso rápido; uno por día | F-CL-08, D36 | Test «check-in»; UI conectada |
| Reportar molestia (zona, 0–10, cuándo, nota) con aviso de no-diagnóstico ≥7; desde inicio, sesión activa y resumen | F-CL-09, D37 | Navegador 390 px; tests de visibilidad |
| Sin Salud compartida la molestia queda para el alumno; «Compartir sólo este reporte» la muestra al coach | D37 | Test «sin Salud compartida…» |
| Lesiones y antecedentes: alta, cambio de estado, borrado; sólo su dueño | F-CL-10 | Navegador (Rodilla · En seguimiento); test de propiedad |
| Pedir ayuda (cambiar rutina, revisar técnica con video, consulta) y «Pedir mi programa» sin duplicar | F-CL-13, F-CL-15 | Navegador: pedido con video persistido (0600, fuera de `/public`); tests |
| Video privado: descarga sólo para el alumno y su coach; anónimo 401; otro coach 404; `private, no-store` | D39 | Navegador (200 coach / 401 sin sesión); test |
| Bandeja del coach: pedidos (resolver), molestias y check-ins, accesos a datos, invitaciones; contador en la navegación | F-CO-14, F-CO-18 | Navegador 1280 px |
| Solicitud de acceso de punta a punta: «Pedir acceso» → aviso en la app → Permitir/Rechazar → estado en la ficha y en la bandeja | F-PR-06, F-CO-15, D38 | Navegador completo (pedido → banner → Permitir → ficha con lesión y molestia); tests de rechazo, vencimiento y otra organización |
| Revocar desde Privacidad oculta al instante lesiones y molestias al coach | F-PR-01 | Navegador (la molestia desapareció de la bandeja tras revocar); test |
| Historial de accesos para el alumno: pidió, compartiste, dejaste de compartir, vio (una lectura por día) | F-PR-01 | Navegador; test |
| Menor sin autorización del adulto: no puede compartir Salud por ningún camino | F-ID-13 | Test |
| Al resolver un pedido, el alumno ve «Tu pedido fue resuelto» hasta marcarlo visto | F-CL-13 | Navegador (`unseenResolved`); test |

Pruebas: 44 de dominio + 40 de integración, todas OK. Build de producción OK.

## Defectos encontrados en la verificación y corregidos
Historial vacío para lo compartido al aceptar la invitación (ahora se registra), redacción «Vos compartió» → «Compartiste», barra de intensidad que ocupaba todo el ancho con un solo dato, advertencia de build por trazado de todo el proyecto desde el adaptador de almacenamiento.

## Limitaciones y pendientes
- Mensajería coach–alumno no implementada (D40).
- Pedidos al equipo de sala del gym: Etapa 5 (D41).
- Nutrición, medidas y fotos: se puede pedir y conceder acceso, pero la carga de esos datos no existe todavía (Body Intelligence y nutrición: Etapa 8).
- El video sólo se valida por tipo y tamaño; la duración y el contenido no se verifican en servidor; no hay transcodificación.
- Sin notificaciones push: los avisos aparecen al abrir la app.
- Pedir ayuda, molestias y check-in necesitan conexión (no entran en la cola offline).
- Durante la verificación, el panel del navegador navegó solo a `/` dos veces (`GET /` en el log del servidor tras chequeos `HEAD /` de la herramienta); no es un comportamiento de la app.

## Revisión D36–D41 (26/10/2026)
- D36: el check-in sigue dentro de «Entrenamientos» (sin cambios de código).
- D37: con molestia ≥7, sin Salud compartida ni restricción y con la casilla sin marcar, la hoja sugiere compartir ese reporte con el coach.
- D38: tras un rechazo, el coach no puede volver a pedir el mismo dato durante 7 días. El servidor responde 409 `cooldown` con `retryAt`; la ficha muestra «Podés volver a pedirlo desde el …» sin botón (verificado en la pestaña Nutrición).
- D39: `pnpm --filter web jobs:purge-media` borra archivo y marca `deletedAt` en videos con pedido resuelto hace más de 90 días y en huérfanos de más de 24 h; audita `media.purged`. La bandeja del coach muestra «Video eliminado». **Falta programar la tarea** (cron diario) en el despliegue.
- D40 (mensajería) y D41 (pedidos al equipo de sala) siguen pendientes para la Etapa 5.

Pruebas: 45 de dominio + 41 de integración.

# Etapa 5 — Operación del gym, gestión, reseñas y mensajería

Escritorio `REPI Desktop Gym.dc.html` por rol, con datos reales en `/gym/[orgId]`. Pedido del socio al equipo de sala (D41) y mensajería (D40). Migración `0004_gym_ops`.

## Qué funciona hoy (demostrado en navegador con la semilla DEMO)
- **Permisos por capacidad y sede** (`packages/domain/src/gym.ts`): dueño, gerente, coordinador, entrenador de sala y recepción. Otra sede responde 404. La API exige 2FA al dueño igual que la página.
- **Turno (F-GT-01):** iniciar y cerrar, con turno planificado del día. Tomar, completar y editar programas exige turno activo o el permiso «fuera de turno» que da gerencia (D08). Lo hecho fuera de turno queda marcado.
- **Cola de asistencia (F-GT-02):** cola compartida, asignadas y completadas.
  - Tomar es transaccional: si dos toman a la vez, uno recibe «X ya tomó T-…».
  - Las tareas se crean desde sala, gerencia o recepción, o desde la app del socio (D41). Los seguimientos tienen fecha objetivo.
  - Si el resumen menciona salud, se avisa.
- **Traspaso (F-GT-04):** se eligen las tareas, se edita el resumen y se elige destinatario o cola. Queda «pendiente de aceptación» hasta que la otra persona acepta. El historial queda registrado. Los traspasos sin aceptar se marcan en el panel (D43).
- **Socios y programa institucional (F-GT-03):**
  - Lista con estado de actividad. Ficha con programa, revisiones con autor y motivo obligatorio, asistencia de 8 semanas y tareas abiertas.
  - Notas institucionales y personales separadas; las personales sólo las ve su autor.
  - Bloque de datos restringidos (salud, app del socio y coach privado nunca visibles).
  - Al guardar se puede completar la tarea relacionada.
- **Relación activa (D11, F-HX-09, F-MO-02):** con coach y gym, la persona elige con qué programa entrena. Las sesiones quedan ligadas a su relación: el coach no ve las del gym ni el gym las del coach.
- **Reseñas (F-RV-01..06):**
  - Invitación tras una interacción elegible, con cadencia de 14 días (D09). Se puede descartar.
  - Hoja «¿Cómo te atendió…?» con calificación general, tres dimensiones opcionales y comentario. Una reseña por invitación.
  - El entrenador la ve sin nombre, responde una vez (si la política del gym lo permite) y puede reportarla. Mientras se modera, el texto le queda oculto.
  - Gerencia: análisis con n, distribución y dimensiones; sin promedio con n < 5 y sin «rango 95 %» (D45).
  - Moderación: mantener, retirar o pedir edición, con historial. Apelación única dentro de 14 días. Lo retirado no cuenta en los agregados.
  - Historial de accesos con los intentos denegados.
- **Desempeño (F-GP-01..05):**
  - Performance Center con cinco categorías separadas y períodos de 7, 30 y 90 días reales. «Sin datos» en vez de cero (D47).
  - Comparación contextual de 2 a 3 personas y definiciones visibles.
  - Resultados de entrenamiento sólo a nivel sede.
  - «Mi desempeño» del entrenador con atribuciones y disputa de atribución.
  - Detalle del entrenador. Abrir conversaciones, notas personales o salud se deniega y queda auditado (SCR-GX-02).
- **Gerencia:** panel de sede (padrón, adopción D42, en turno, cola, seguimientos vencidos, satisfacción, sesiones por semana), equipo con invitación y permiso «fuera de turno», tareas con sólo metadatos y reasignación, grilla de turnos con cobertura y huecos (D44), y participación con embudo y creación de tareas «Programa nuevo».
- **Dueño:** vista ejecutiva multi-sede, comparación de sedes y configuración. La configuración incluye la puesta en marcha con su estado real, qué ve el gym de cada socio y la política de respuestas a reseñas; la publicación externa está deshabilitada.
- **Recepción:** altas fuera de padrón y creación de tareas para sala.
- **Mensajería (D40, F-MS-01/02, F-HX-27):**
  - Coach ↔ alumno, y equipo de sala de la sede ↔ socio (D46).
  - Estados enviado, entregado y leído. Envío idempotente con reintento.
  - Sin conexión no se envía. Con la relación terminada queda en sólo lectura.
  - Contadores de no leídos en el coach, el gym y la app.
  - La gerencia no ve el contenido. La auditoría registra los envíos sin contenido.
- **D41 en la app:** «Pedir ayuda» con «Para: Equipo de sala / tu coach». El estado y el aviso «El equipo de sala resolvió tu pedido» aparecen en Inicio. El video adjunto lo ve sólo el personal de sala de esa sede y se purga según D39.

Pruebas: 57 de dominio + 57 de integración (16 nuevas de gym, reseñas, métricas y mensajería). Build de producción OK.

## Defectos encontrados en la verificación y corregidos
- Adopción del 150 % con socios fuera del padrón. Ahora se calcula con los socios vinculados al padrón (D42).
- «Por 10 h» daba 100 con 6 minutos de turno. Ahora exige al menos 1 h (D47).
- La API del gym no exigía 2FA al dueño, aunque la página sí.
- La lista de socios no se actualizaba después de crear un programa.
- El placeholder «Escribile a el…».
- El selector de relación no tenía nombre accesible.
- La consulta de reseñas se registraba duplicada (ahora una cada 10 min).

## Limitaciones y pendientes
- **Comunidad, desafíos, validaciones y catálogo de recepción:** Etapa 6.
- **Facturación REPI:** Etapa 7.
- **Reservas de clases (F-GR-02):** no implementado.
- **Centro de notificaciones del staff (F-HX-26):** no implementado; sólo contadores.
- **«Entrenadores en sala ahora» en la app (F-HX-16):** no implementado.
- **Intentos y logros en la ficha (F-HX-15):** no implementado.
- **Mensajería:**
  - Retención pendiente (D40).
  - Sin push ni tiempo real (actualiza cada 10 s).
  - Sin adjuntos.
  - El hilo del gym no tiene asignación a un entrenador.
- **Importación del padrón por CSV:** no implementada. La activación del espacio depende del contrato (D01–D05).
- **Métricas:**
  - Atribución compartida pendiente (D48).
  - La progresión de cargas por socio no se calcula.
  - Seguimientos sólo de tareas «Seguimiento» con fecha.
- **Coordinador:** las capacidades están definidas, pero su vista no se verificó en el navegador (sin usuario DEMO coordinador).
- **Video adjunto a pedidos del gym:** verificado sólo por pruebas de autorización, no reproducido en el navegador.
- **Rendimiento:** las consultas de métricas y paneles calculan en caliente (sin materializar). Suficiente para la demo; revisar con volumen real.
- **Mensajes previos:** los generados en la verificación quedan en la base de desarrollo.

# Etapa 6 — Comunidad del gym y Repi Club

Pestaña «Gym» de `REPI App Alumno v4.dc.html`, pantallas Comunidad y Validaciones de `REPI Desktop Gym.dc.html` y un núcleo de Repi Club. Sin `repi-shared.js`: todo persiste en Postgres. Migración `0005_community`.

## Qué funciona hoy (demostrado en navegador con la semilla DEMO)
- **Novedades y descuentos (F-GC-01, F-HX-13):** por sede o para todas las sedes (D56), con imagen y vencimiento del descuento. El socio ve lo de su sede y lo general; un descuento vencido se oculta.
- **Desafíos (F-GC-02, F-HX-11):** reglas, unidad (repeticiones, tiempo o kilos), «gana el menor tiempo», categoría, premio y fecha de fin. Cada desafío muestra el aviso de seguridad. Al quitar uno, sus intentos pendientes se rechazan con motivo y aviso.
- **Intento con video (F-GC-03):**
  - El video es obligatorio (D23 sigue cerrado) y se valida por firma real del archivo, tipo y tamaño (D55). La duración se controla en el teléfono.
  - Barra de subida real y confirmación de autoría.
  - Un intento pendiente por desafío. Bloqueado para menores sin autorización.
- **Validación:**
  - Sólo dueño y gerencia, con el video autorizado. Nadie puede validar su propio intento.
  - Rechazar exige motivo.
  - Intento y desafío se bloquean juntos: no hay doble validación ni carrera entre récords.
  - «Intento válido» y «nuevo récord» son distintos: sólo mejorar el récord vigente lo cambia, con menor es mejor para tiempos.
- **Logros y nivel (F-GC-05, D52):** son permanentes y no se duplican:
  - Marca validada.
  - Récord del gym.
  - Primer entrenamiento y constancia de 12 sesiones en el mes, que se otorgan al terminar una sesión.
  - Muestra stickers con el isotipo aprobado, nivel y el overlay de logro validado (AN-21).
- **Ranking y mejor marca (F-GC-09, D51):** sólo marcas validadas, la mejor de cada persona. Filtros Mujeres, Hombres y +40. El nombre aparece sólo con el consentimiento «rankings».
- **Carnet y recepción (F-GC-06/07/08, D54, D22):**
  - QR rotativo firmado, sin datos personales.
  - Recepción lo verifica, registra el ingreso (sin duplicar en 2 h) y entrega el premio una sola vez.
  - El socio recibe el aviso y ve el estado del premio.
- **Cierre de desafíos (F-HX-10, D50):** al vencer queda el récord final y se avisa a quienes participaron.
- **Catálogo de recepción (F-GC-04, F-HX-14):** informativo, sin pagos. Categoría, precio, promoción, destacados, disponibilidad, foto y horario de recepción por sede. Lo carga recepción, gerencia o el dueño.
- **En la ficha y en la app:** la ficha del socio muestra sus intentos, nivel e ingresos (F-HX-15). La app muestra «En sala ahora» según los turnos activos (F-HX-16).
- **Repi Club (F-RC-01/02/03/05, D53):**
  - Unirse es voluntario y elegís si mostrar tu nombre.
  - Publicaciones con texto o un logro propio, aplausos y comentarios.
  - Sin enlaces y con límites por hora. Se puede borrar lo propio y bloquear personas.
  - Reportes: con 3 de personas distintas el contenido se oculta. Gerencia y dueño moderan con historial.
  - Ranking del mes opcional, por días con sesión del programa institucional o ingreso, con transición FLIP que respeta «reducir movimiento».
- **Avisos y purga:** la app muestra un punto en «Gym» con avisos sin ver. El escritorio cuenta los intentos por validar. La purga D39 se extendió a videos de intento (90 días tras la decisión) y a imágenes sin uso (24 h).

Pruebas: 67 de dominio + 66 de integración (9 nuevas de comunidad y Club, más 10 de dominio). Build de producción OK.

## Defectos encontrados en la verificación y corregidos
- Detección del intento pendiente duplicado: el código de unicidad de Postgres llega dentro de `cause`.
- Pestañas del gym que no entraban en 375 px.
- Etiqueta «1 avisos».

## Limitaciones y pendientes
- **Validación sin video (F-HX-12, D23):** no implementada.
- **Trofeos 3D (F-RC-04):** Etapa 8 / motion.
- **Comunidad propia del coach (F-HX-25):** pendiente.
- **Repi Club:** faltan feeds de coach, sede y clase, equipos, checkpoints, perfiles y anuncios de entrenadores (D53).
- **Asistencia:** sin integración con molinetes. La asistencia sólo se registra en recepción (D22).
- **Lectura del QR:** sin lector de cámara integrado; recepción usa un lector externo o pega el código (D54).
- **Video:** sin procesamiento en servidor (duración ni transcodificación). La duración se controla en el teléfono.
- **Avisos:** sin notificación push al publicar ni al validar; los avisos aparecen al abrir la app.
- **Logro de récord personal por ejercicio:** no implementado.
- **Verificación en el navegador:**
  - Las capturas del panel quedaron desfasadas en algunas hojas inferiores; se verificó el contenido por DOM.
  - El video de prueba es un archivo mínimo con firma MP4 válida, no un video real.


# Anexo acceso, altas y facturación (26/10/2026)

Fuente: `documentacion/anexos/2026-10-26_PROMPT_EXTRA_ACCESO_ALTAS_Y_FACTURACION.md`. Delta y decisiones: `docs/ANEXO_ACCESO_ALTAS_FACTURACION.md` y D57–D65. Migración `0006_access_billing`.

## Qué funciona hoy (demostrado en navegador con la semilla DEMO)
- **Acceso sin autoalta:** «Soy entrenador» y «Tengo un gimnasio» llevan a un contacto comercial; no crean espacio, cuenta operativa ni prueba. Se quitaron las rutas `POST /api/access/coach`, `POST /api/access/gym` y `POST /api/access/member/sign-up` (el servicio de alta por DNI responde «moved»).
- **Consola de Admin (`/admin`, Admin + 2FA):**
  - Clientes con etapa de activación, cantidad acordada, precio por unidad y accesos habilitados (DEMO aparte, no facturable). Clientes previos al anexo marcados para regularizar sin suspenderlos.
  - Alta en borrador → aceptación externa (referencia, fecha, versión) → habilitación (prueba sólo si se concede) → invitación de bienvenida al email del responsable.
  - Cantidad y precio por cliente con versión, fecha de efecto, motivo, evidencia y autor. Vista previa del mes (verificado: 450 × ARS 1.250,00 = ARS 562.500,00) y cierre simulado con snapshot inmutable.
  - Contactos comerciales y pedidos de corrección del cliente con respuesta.
- **Activación del responsable (`/activar/<token>`):** muestra el espacio y el email enmascarado; crear cuenta o ingresar con ese email; el gym pide 2FA al dueño antes de entrar.
- **Condiciones para el cliente:** «Condiciones REPI» en el escritorio del dueño del gym y del coach, con historial de versiones y pedido de corrección.
- **Invitaciones ligadas al destinatario:** el coach invita con email obligatorio y puede reenviar (la anterior se revoca); aceptar exige la cuenta verificada de ese email (alumno y staff).
- **QR fijo por sede (`/unirse/<slug>`):** dueño y gerencia generan, descargan (SVG), copian, regeneran y desactivan el QR en «Accesos y QR». Recorrido verificado: cuenta nueva → código por email → solicitud con código corto → bandeja del piso → aprobación con método → estado actualizado para el socio.
- **Bandeja compartida «Solicitudes de acceso»:** piso con turno en la sede, recepción, gerencia y dueño; contador en la navegación; actualización cada 10 s; resueltas de 7 días con quién, rol y método.
- **Accesos de socios:** pausar, dar de baja y reactivar; pausar corta el registro de series nuevas en el servidor.
- **Push:** activar, pausar y desactivar por dispositivo; cola persistente; el service worker muestra el aviso y abre la pantalla. Verificado que, sin dispositivo registrado, el aviso queda «skipped: sin dispositivos» y la bandeja no pierde nada.
- **Pedidos extra:**
  - Peso con paso elegible (0,25 a 2,5 kg) y carga directa con decimales. Verificado: 42,75 → 44 kg con paso de 1,25.
  - Sensación por serie. Verificado: «Que venga alguien» guardó la alerta (Prensa, 44 kg) y mostró «Le avisamos al equipo de sala en turno». La alerta aparece en «Mi turno · En sala ahora» con el botón «Voy».
  - En el Club: publicar la evolución de un ejercicio o un entrenamiento terminado, y un perfil con vitrina elegida. Cubierto por pruebas de integración; no se recorrió en el navegador.

Pruebas: 74 de dominio + 80 de integración (14 nuevas del anexo y pedidos extra). Typecheck y build de producción OK.

## Criterios de aceptación del anexo (§11)
| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Sin organización operativa ni prueba por registro libre, endpoint viejo, cliente modificado o enlace mágico | Cumple | Rutas de autoalta eliminadas; `magicLink.disableSignUp`; Admin crea en `pending`; test «sin autoalta» |
| 2 | Invitación comercial: cuenta nueva/existente, otro email, vencimiento, revocación, reenvío, consumo concurrente | Cumple (cuenta existente sin test propio) | Tests «bienvenida…» y «aceptada dos veces a la vez» |
| 3 | QR fotografiado sólo permite solicitar; revocado no crea solicitudes | Cumple | Tests QR y «vence…» |
| 4 | Socio sin padrón: verifica, solicita, aparece en piso y recepción, recibe resolución; sin cuentas duplicadas | Cumple | Navegador + tests |
| 5 | Piso sólo con rol, capacidad, sede y turno efectivo; cambio o cierre de turno antes de aprobar | Cumple parcial | Autoridad revalidada en la transacción (test). Medianoche: el turno es un registro abierto, no depende del día; sin test específico |
| 6 | Recepción resuelve sin piso, sin push o sin entrenador; sin operadores queda pendiente | Cumple | Test «recepción resuelve sin turno»; nada se autoaprueba |
| 7 | Decisiones simultáneas: una sola decisión y un solo vínculo | Cumple | Test concurrente con `FOR UPDATE` |
| 8 | Cambio de turno conserva pendientes; turno ajeno o rol de coach no dan permisos | Cumple | La bandeja se calcula por sede y turno en cada lectura; test con piso de otra sede |
| 9 | Cancelación, rechazo, vencimiento y baja; cambiar QR no elude una suspensión | Cumple | Tests; un socio pausado que reescanea genera «reactivación», que requiere decisión humana |
| 10 | Pasos legales y de edad no se saltan; consentimientos de salud y BI separados | Cumple parcial | Aprobar deja `pending_consent` y el socio confirma consentimientos; menores: se aplica la regla vigente de adulto responsable, textos legales pendientes (D21) |
| 11 | Baja revoca operaciones en servidor y al reconectar; otras relaciones siguen | Cumple parcial | El servidor rechaza series con `relation_inactive` (test). Que la recuperación de cuenta no reactive no tiene test propio (no hay camino que lo haga) |
| 12 | 1.000 acordados y 120 habilitados → base 1.000 | Cumple | Vista previa usa sólo la cantidad acordada (test con 0 cuentas) |
| 13 | Coach con 40 vigentes y 12 activados → base 40 | Cumple (misma función, sin test de coach) | `previewPeriod` no lee cuentas ni programas |
| 14 | Precios distintos por cliente; cambios futuros no alteran períodos cerrados | Cumple | Términos por contrato; `closed_period` (test) |
| 15 | Accesos > acordado → revisión, sin cobro extra; cantidad desconocida no se reemplaza | Cumple | Test `overAgreed`; sin cantidad la vista previa no calcula |
| 16 | Sin política de corte: simular y previsualizar, sin cobros reales | Cumple | No existe código de cobro |
| 17 | Push no rompe el offline ni filtra datos en pantalla bloqueada; fallos no pierden nada | Cumple parcial | En desarrollo el service worker se registra en modo sólo avisos; texto mínimo (test). Entrega real a dispositivos: **no verificada** |
| 18 | Migraciones conservan datos; regularización separa DEMO y reales; aislamiento | Cumple | Orgs previas quedan `legacy`; Admin lista DEMO aparte |
| 19 | Invitación de alumno: otro email no la acepta; revocación, reemisión, vencimiento, token consumido, sin destinatario | Cumple | Tests de acceso |
| 20 | Socio de A escanea B: ampliación aparte y conserva A; aprobador sin permiso en B no concede | Cumple | Test «ampliación de sede…» y piso de otra sede |
| 21 | Organización no habilitada: QR, invitaciones y endpoints no dan uso operativo | Cumple | Tests `org_not_enabled` (QR e invitación de coach) |

## Qué es real y qué es adaptador de desarrollo
- **Email:** sólo el buzón DEV (`/dev/mailbox`). En producción el envío falla sin proveedor (D24). Ningún email salió a terceros.
- **Push:** Web Push real con claves VAPID **de desarrollo** en `.env.local`. No se probó la entrega en un dispositivo ni con un proveedor de producción. Faltan las claves de producción y programar `jobs:notifications`.
- **Cobros:** no existen. La vista previa y el cierre simulado no cobran ni emiten facturas.

## Defectos encontrados en la verificación y corregidos
- Las tablas con texto oculto para lectores de pantalla generaban scroll horizontal de la página: `.gy-table` ahora contiene ese texto.
- La consola de Admin no tenía menú en anchos chicos.
- El selector de paso de peso quedaba angosto.
- Carrera en la prueba de la cola push (el envío se dispara en segundo plano).

## Limitaciones y pendientes
- **Comerciales (§12):**
  - Qué cuenta como vigente, ciclo, corte, prorrateo, mora y suspensión, cobertura multisede y origen del total del coach.
  - Proveedor de email y push en producción.
  - Política offline tras una baja (hoy la cola local recibe el rechazo y la sesión queda sin sincronizar).
  - Textos legales y menores.
- **Alertas de sala:** avisan a la sede principal del socio. Si entrena en una sede ampliada, el aviso va a la principal.
- **Push en iPhone:** requiere agregar REPI a la pantalla de inicio.
- **Datos previos:** los pedidos por DNI y los DNI HMAC guardados quedan sin uso nuevo; borrarlos es una decisión legal (D27).
- **Club:** desafíos entre socios, pendientes.

# Selección visual G · Atlética y motion M01–M05 (26/10/2026)

Detalle, mediciones y pendientes: `motion.md` §12 y `docs/DESIGN_CONTRACT.md` § Selección visual aprobada.

## Qué funciona hoy
- **Tipografía:** Barlow y Barlow Condensed en alumno, Acceso, Coach, Gym y Admin.
- **Íconos:** Phosphor Bold en todas las navegaciones y controles.
- **Barra móvil:** cápsula Cristal en la app del alumno.
- **Cambio de sección:** fundido de 160 ms; cada sección conserva su scroll.
- **M01:** selección de día.
- **M02:** celebración sólo en un cierre completo confirmado.
- **M03:** carga ambiental en Progreso y Gym, con error y reintento.
- **M04:** slider de RPE y RIR, con teclado y arrastre.
- **M05:** carrusel de novedades.
- **Preview:** HyperFrames en `design/motion/` con export MP4 de 60 fps.

## Defectos encontrados en la verificación y corregidos
- Progreso quedaba en «Cargando…» para siempre si fallaba el historial.
- El resumen y el envío del RPE mostraban «guardado en el teléfono» con conexión cuando otra pasada de la cola seguía en curso.
- Se retiró del panel coach el texto «precio por alumno activo a confirmar», contradicho por el anexo.

## Pendientes
- Pruebas en dispositivos físicos (iOS/Android).
- Body Intelligence para M03.
- Decisión sobre RIR 5.
- Aprobación visual del usuario.

# Entorno DEMO hospedado — Vercel + Supabase (27/10/2026, D68)

Pedido del usuario: hosting en Vercel y base en Supabase. Detalle y comandos: docs/DESPLIEGUE.md.

- https://repi-app.vercel.app en Vercel Hobby (gru1), deploy automático desde `main`.
- Supabase `repi` (sa-east-1): migraciones 0000–0006, seed DEMO, RLS en las 74 tablas, sin privilegios anon, bucket privado.
- Avisos cada minuto con pg_cron + pg_net (verificado: respuesta 200). Purga de videos diaria con Vercel Cron.
- Correos en modo DEMO al buzón DEV (sólo REPI Admin). Sigue sin proveedor real (D24).
- Pendientes reales: `SUPABASE_SECRET_KEY` (subidas), subida directa de videos (> 4,5 MB), login hospedado probado por el titular, backups/PITR, plan Pro antes de clientes.

# Corte 1 — Guía para agregar a inicio y continuidad del alta (27/10/2026, D69)

- Guía por plataforma antes del alta/login en teléfono (QR de sede, invitación, bienvenida), una vez y sin sesión; «Continuar en el navegador» siempre; ayuda en /instalar y desde Perfil.
- Continuidad: contexto guardado 7 días; «Retomá tu alta» al abrir desde el ícono; recuperación por enlace o código (sólo destinos internos); invitaciones vigentes del mismo email verificado tras ingresar.
- Inicio estable `/` según sesión; sin red abre la carcasa de /app si existe.
- Verificado en Chrome headless (iPhone/Android/navegador interno/escritorio) y tests 85/85. Pendiente: teléfonos reales e ícono 192/512 (D35).

## Adaptive Coach · fase 1 (27/10/2026, D108)

Arquitectura, fases y estado de los tests A–Q en `docs/adaptive/ADAPTIVE_COACH_ARCHITECTURE.md`. Hecho: núcleo determinístico en el dominio (autonomía 0–4, `planSolo`, `validateProposal`), `GET /api/me/solo` y la entrada «No vino el profe» / «Quiero entrenar por mi cuenta» en Entrenar. Sin IA: cada consulta queda en `audit_event` como `adaptive.solo_plan` con `usesAI:false`. Evidencia: `packages/domain/src/adaptive.test.ts`, `apps/web/tests/adaptive.test.ts`, navegador 375 px (sesión abierta → «Seguí con Piernas» → continúa). No está listo para producción como «Adaptive Coach» completo: faltan fases 1b a 6.

## Adaptive Coach · fase 1b parcial: reemplazos aprobados (27/10/2026, D110)

Quien arma programas en la organización (coach dueño o staff del gimnasio con `program.edit`) aprueba reemplazos por ejercicio desde el constructor («Reemplazos»), con una indicación opcional. Valen para toda la organización: en la sesión, al cambiar un ejercicio, los aprobados aparecen primero con «Aprobado por tu coach» / «Aprobado por el gimnasio». Sólo compatibles (mismo tipo de registro), hasta 8 por ejercicio, sin cargas. Tabla `exercise_substitution` (migración 0023), API `/api/substitutions/[orgId]`, auditoría `substitution.add|remove`. Evidencia: `packages/domain/src/session-changes.test.ts` (`withApproved`), `apps/web/tests/substitutions.test.ts`, navegador (constructor del coach y hoja de la sesión a 375 px).
