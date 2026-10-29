# Registro de defectos — Auditoría QA 29/10/2026

Rama `qa/auditoria-2026-10-29`. Este archivo también cumple la función de **FIXES_IMPLEMENTED** (cada fila dice qué se cambió y con qué prueba se verificó).

**Severidad:**
- **P0:** pérdida masiva de datos, caída o fuga entre organizaciones.
- **P1:** fuga o abuso de seguridad, pérdida de datos de una persona o acción destructiva sin red.
- **P2:** dato incorrecto, abuso de recursos o barrera de accesibilidad seria.
- **P3:** molestia o riesgo bajo.

**Evidencia** (ver QA_MASTER_REPORT §3):
- **INT:** prueba de integración contra Postgres real, base descartable `repi_test`.
- **E2E:** Playwright con Chrome real contra la build de producción local y demos aisladas.
- **UNIT:** prueba unitaria del dominio.
- **CODE:** revisión de código, sin prueba automática.
- **NT:** no probado.

## Seguridad

| ID | Sev | Módulo | Pasos | Esperado | Observado | Causa raíz | Corrección | Prueba | Estado |
|---|---|---|---|---|---|---|---|---|---|
| SEC-1 | P1 | Acceso / invitaciones | Quien invita conoce el código. Crea una cuenta con el email invitado y usa `/acceso?code=…`. | Sólo quien recibe el correo puede verificar ese email. | El código solo marcaba el email como verificado. | `verifyByInvitation` aceptaba el código como prueba de posesión del correo. | Prueba HMAC (`invitationProof`) sólo en el enlace del correo (`&p=`). La comparación es en tiempo constante (`sameSecret`). Sin la prueba se exige OTP. | INT `access.test.ts`: el código solo o una prueba falsa dan `false`; la prueba no aparece en la respuesta de la API. | Corregido |
| SEC-2 | P1 | Seguimiento coach | El coach termina la relación (`ended`) y abre bandeja, salud o videos del ex cliente. | Sin acceso. | Seguía viendo dolores, check-ins, salud y videos. | Los filtros no excluían `status = ended`. | `ne(coachClient.status,"ended")` en `coachRelation` y `authorizeVideo`; la bandeja filtra relaciones vivas. | INT `followup.test.ts`: después de terminar, la bandeja queda vacía y la salud da 404. | Corregido |
| SEC-3 | P2 | Invitaciones | Disparar invitaciones en bucle. Invitar desde una demo a un correo real. | Límite por persona. Una demo no envía correos reales. | Sin límite por usuario. La demo enviaba. | Faltaba el límite. `deliverInvitation` no miraba `isDemo`. | `limit("invite:<user>",30/h)` en las dos rutas. Una organización demo queda en `local_only`. | INT `sandbox.test.ts` (demo → `local_only`, sin buzón). Límite: CODE. | Corregido |
| SEC-4 | P1 | Auth | `POST /api/auth/sign-up/email` o un OTP a un email nuevo. | Alta sólo por el flujo de REPI (edad, invitación, términos). | Better Auth permitía el alta directa y el OTP creaba usuarios. | Endpoints de la librería expuestos por defecto. | La ruta devuelve 404 para `/sign-up/email`. `emailOTP.disableSignUp: true`. | INT `security-launch.test.ts`: 404, y el OTP no crea usuario. | Corregido |
| SEC-5 | P2 | Acceso / alta | Alta con un email existente sin invitación. | Respuesta indistinguible. | `existing: true` revelaba la cuenta. | El campo se devolvía siempre. | `existing` sólo si el alta quedó ligada a una invitación válida. | INT `access.test.ts` | Corregido |
| SEC-6 | P1 | Repi Club / ranking | Una menor sin consentimiento del adulto se suma al ranking, o ya estaba. | No aparece y no puede sumarse. | Aparecía en el ranking y en el tablero de la TV. | Faltaba aplicar `classifyAge` en el club. | `joinClub` lanza `guardian_required`. `clubRankingFor` y `liftBoard` filtran con `withoutRestrictedMinors`. | INT `lift-ranking.test.ts` | Corregido |
| SEC-7 | P2 | Push | Suscribir un endpoint a un host arbitrario. | Sólo los servicios push conocidos. | El servidor haría POST a cualquier URL (tipo SSRF). | Sin lista permitida. | `PUSH_HOSTS` y `pushHostAllowed` en `subscribe`. | INT `log.test.ts` / `annex.test.ts` | Corregido |
| SEC-8 | P2 | IA / importación | Llamar `/api/me/solo/ai` o `/history-import` en bucle. | Tope diario (costo OpenAI). | Sólo había límite por minuto o ninguno. | Faltaba el tope diario. | `solo-ai-day` 60/día. `history-import` 30/día. | CODE | Corregido |
| SEC-9 | P2 | Admin | Ingreso de admin sin segundo factor. | 2FA recomendado. | Desactivado. | Decisión del titular (D119). | Ninguna: riesgo aceptado, documentado. | — | Riesgo aceptado |
| SEC-10 | P3 | Tutor | Pedir autorización al adulto en bucle. | Límite. | Correos ilimitados al adulto. | Faltaba el límite. | 5/día por usuario. | CODE | Corregido |
| SEC-11 | P3 | Logs | Errores en `/api/activate/<token>`, `/access/tutor/<token>`, `/join/<slug>`, `/access/invitations/<code>`. | Sin secretos en los logs. | El token quedaba en el log y en el registro de denegaciones. | Se registraba la ruta cruda. | `maskPath` en `logError` y `recordDenied`. | INT `log.test.ts` | Corregido |
| SEC-12 | P3 | Dependencias | `pnpm audit --prod` | 0 vulnerabilidades. | 1 moderada: esbuild ≤0.24.2 vía better-auth → drizzle-kit → @esbuild-kit. | Dependencia transitiva de una herramienta de desarrollo. | Ninguna. No llega al bundle ni al servidor en producción. Se revisa al actualizar better-auth. | `pnpm audit` | Riesgo aceptado |

## Integridad de datos

| ID | Sev | Módulo | Pasos | Esperado | Observado | Causa raíz | Corrección | Prueba | Estado |
|---|---|---|---|---|---|---|---|---|---|
| DATA-1 | P2 | Entrenamiento | Registrar 500 repeticiones en una serie común. | Rechazo. | Se aceptaba hasta 3600, e inflaba volumen y ranking. | Un solo tope (el de segundos) para todo. | `MAX_REPS = 200`, salvo que la prescripción sea por tiempo (`MAX_TIMED_SEC = 3600`). | INT `training.test.ts` «QA DATA-1» | Corregido |
| DATA-2 | P1 | Programas / offline | El alumno baja la rutina. El coach edita la copia (sin entrenamientos aún). El alumno empieza sin red y sincroniza. | El entrenamiento se guarda. | 400 «Ese día no es parte de tu programa» y la cola lo borraba: entrenamiento perdido. | La edición en el lugar borraba y recreaba días y ejercicios (IDs nuevos). | `rewriteDays` actualiza por posición y conserva los IDs. Sólo borra o crea lo que sobra o falta. Respeta F-CL-14 (sigue siendo versión 1). | INT `training.test.ts` «QA DATA-2» + F-CL-14 sin cambios | Corregido |
| DATA-3 | P2 | Importar historial | Confirmar la misma importación dos veces a la vez. | Una sola alta. | Riesgo de entradas duplicadas. | Se verificaba y después se escribía, sin bloqueo. | El estado se reclama con `UPDATE … WHERE status='draft' RETURNING` dentro de la transacción. `remove` usa `FOR UPDATE`. | INT `history-import.test.ts` (Promise.all). La carrera no se reprodujo ni con el código viejo: verificado por lógica. | Corregido |
| DATA-4 | P2 | Cobros / contratos | Importe, precio o total mayor que 2.147.483.647 en unidades menores (≈ ARS 21,4 M). | Mensaje claro. | 500 de Postgres (int4 desbordado). | Columnas `integer`. | Topes en `addTerm`, `recordPayment` y `closePeriodSimulated` (`too_large`). La UI de coach avisa antes de enviar. Sin migración. | INT `annex.test.ts` «QA DATA-4» | Corregido (migrar a bigint queda para cuando haga falta, con autorización) |
| DATA-5 | P2 | «Aplicar ahora» (D145) | El coach reordena días y el alumno aplica la rutina nueva con el entrenamiento abierto. | Mismo día; series sin pareja visibles. | El día se elige por posición (puede cambiar de día) y las series sin pareja quedan ocultas. | `upgradeSession` empareja por `position`. | — | NT | Abierto |
| DATA-6 | P2 | Ranking / 1RM | Serie por tiempo con carga (140 kg × 10 s). | No cuenta como 1RM. | 1RM estimado de 187 kg en el tablero y en la TV (D146). | `reps` guarda segundos (D148) y se trataban como repeticiones. | `liftBoard` excluye las series con prescripción por tiempo. **Pendiente:** volumen, `bestE1rm`, PR e informe (necesitan llevar «por tiempo» en `LoggedSet`). | INT `lift-ranking.test.ts` | Parcial |
| DATA-7 | P2 | Cola offline | Inicio o serie rechazados con 4xx: más de 72 h sin red, rutina cambiada, sesión cerrada. | Se conservan y la persona decide. | El ítem se borraba y el entrenamiento se perdía en silencio. | La cola borraba todo 4xx salvo 401/403. | Para `start` y `set` marca `rejected`, frena la sesión y conserva todo. El aviso ofrece «Reintentar» o «Descartar de este teléfono» (con confirmación). | CODE + E2E del flujo feliz | Corregido |
| DATA-8 | P2 | Sync | Primera escritura reintentada después de que el servidor la creó (baseRevision 0, revisión 1). | Actualización. | Conflicto falso. | `decideSetWrite` no contemplaba el caso. | `baseRevision 0 && revision 1` → `update`. | UNIT `sync.test.ts` | Corregido |
| DATA-9 | P2 | Fechas | Entre las 21 y las 24 h (Argentina). | «Hoy» argentino. | En UTC ya era mañana: edad (menor o adulto), vencidos y período de facturación corridos. | `toISOString().slice(0,10)`. | `todayIso` y `commercial/services` usan `localDate`. `currentPeriod` sale del mes argentino. | INT (suites access/commercial en verde). Sin prueba de hora límite: CODE | Corregido |
| DATA-10 | P3 | Gym socios | Sede con más de 200 socios activos. | Paginado o total. | Lista cortada en 200 sin aviso. | `.limit(200)` en `listMembers` y `listAccesses`. | — | NT | Abierto |
| DATA-11 | P3 | Varias | Dos toques en Connect con distinto `clientKey`; `decideJoin` vencido; contar en `deleteClient`. | Atómico. | Duplicado posible. El vencido vuelve a `pending`. Los conteos se hacen fuera de la transacción. | Verificar y después actuar, sin bloqueo. | — | NT | Abierto |

## UX

| ID | Sev | Módulo | Pasos | Esperado | Observado | Causa raíz | Corrección | Prueba | Estado |
|---|---|---|---|---|---|---|---|---|---|
| UX-1 | P1 | Validar ingreso | «Solicitar ayuda en recepción» → «Ya me validaron» sin validación. | Mensaje «Todavía no figura…». | No se veía nada (el mensaje vivía en otra vista). | `setMsg` sin render en la hoja de recepción. | `warn={msg}` en esa hoja. Se limpia al volver. | CODE | Corregido |
| UX-2 | P1 | Entrenamiento | Conflicto «otro entrenamiento abierto» → «Descartar este». | Confirmación. | Descartaba al instante las series locales. | Sin confirmación. | `window.confirm` antes de descartar. | CODE | Corregido |
| UX-3 | — | Importar historial | «Quitar» importación. | Confirmación. | Ya tenía confirmación (`HistoryImport.tsx:39`). | — | — | CODE | Falso positivo |
| UX-4 | P1 | Gym · QR de alta | Regenerar o desactivar el QR. | Confirmación (el impreso deja de servir). | Un toque lo invalidaba. | Sin confirmación. | Confirmación con el nombre de la sede. | CODE | Corregido |
| UX-5 | P1 | Coach · editor de series | Escribir «42,5» en peso, % 1RM o RPE. | Decimales. | Se borraba la coma: imposible cargar decimales. | El input controlado se reconvertía a número en cada tecla. | `NumInput` conserva lo tipeado y sólo guarda valores finitos. | CODE (`tsc`) | Corregido |
| UX-6 | P1 | Coach · cobros | Doble toque en «Registrar cargo» o «Registrar pago». | Un solo cargo. | Dos cargos. | El estado `busy` llega después del segundo toque. | `useRef` de vuelo + CSS global `button[aria-busy]`. Tope de importe antes de enviar. | CODE | Corregido |
| UX-7 | P2 | Global | Doble toque en cualquier botón ocupado. | Ignorado. | Repetía la acción. | Sin bloqueo visual. | `button[aria-busy="true"]{pointer-events:none}` en `globals.css`. | E2E (doble toque en serie: 1 registro) | Corregido |
| UX-8 | P2 | App alumno | Perder la red y recuperarla. | Se va «Sin conexión». | Quedaba fijo hasta que el coach cambiara algo. | Sólo recargaba con cambios de marca. | Escucha `online` → `load()`. | CODE | Corregido |
| UX-9 | P2 | Alumno, coach y gym | Primera carga sin red. | Botón Reintentar. | Pantalla trabada con el error. | Sin acción de recuperación. | «Reintentar» en las tres apps. | CODE | Corregido |
| UX-10 | P2 | Chat alumno | iPhone con área segura. | Campo visible sobre la barra. | Tapado por la barra. | `bottom: 84px` fijo. | `calc(84px + env(safe-area-inset-bottom))`. | CODE (emulación sin notch) | Corregido |
| UX-11 | P2 | Comunidad gym, club y admin | Quitar publicación o producto, borrar post o comentario, revocar invitación. | Confirmación. | Inmediato. | Sin confirmación. | `window.confirm` en los cinco puntos. | CODE | Corregido |
| UX-12 | P3 | Check-in | Error 400 o 403 al guardar. | Mensaje real. | Siempre «Sin conexión». | `catch` genérico. | Distingue `ApiError` de un error de red. | CODE | Corregido |
| UX-13 | P3 | Ranking de desafíos | Error de red al abrir. | Mensaje de error. | Ranking vacío, como si no hubiera marcas. | Error convertido en lista vacía. | Estado `failed` con aviso. | CODE | Corregido |
| UX-14 | P3 | Repi Club | «Salir del Club». | Confirmación. | Inmediato. | — | Confirmación. | CODE | Corregido |

## Accesibilidad

| ID | Sev | Módulo | Pasos | Esperado | Observado | Causa raíz | Corrección | Prueba | Estado |
|---|---|---|---|---|---|---|---|---|---|
| AXE-1 | P2 | Coach, gym y admin (móvil) | axe en el menú del teléfono. | El estado del menú se anuncia. | «Abrir menú» sin `aria-expanded`. | — | `aria-expanded={drawer}`. | E2E axe | Corregido |
| AXE-2 | P2 | Acceso | axe en `/acceso`. | Contraste ≥ 4,5:1. | Pie de marca a 3,5:1. | Color atenuado. | `.ac-brand-foot` con `--dark-muted`, 12 px. | E2E axe | Corregido |
| AXE-3 | P2 | Acceso y sitio | axe `link-in-text-block`. | Los enlaces en texto se distinguen sin color. | Sin subrayado. | — | Subrayado en `.ac-info a` y `.st-hero-note a`. | E2E axe | Corregido |
| AXE-4 | P2 | Gym | axe en `.gy-link`. | Contraste AA. | Bajo. | — | `--light-accent-text-hover`. | E2E axe | Corregido |
| AXE-5 | P2 | Coach · constructor | axe `aria-required-children`. | El tablist sólo tiene tabs. | Botón «+» dentro del tablist. | — | Tablist con `display: contents`; el botón queda fuera, con `aria-label`. | E2E axe | Corregido |
| AXE-6 | P2 | Gym, admin y sala | axe `scrollable-region-focusable` (Seguimiento de sala, móvil). | Las tablas con scroll se pueden recorrer con teclado. | No eran enfocables. | `overflowX:auto` sin `tabIndex`. | `tabIndex={0}` (y `role="region"` con nombre en las tablas). | E2E axe 34/34 | Corregido |
| A11Y-1 | P2 | App alumno | Aviso (toast) con una hoja abierta. | El lector lo anuncia. | Silencio: el aviso estaba dentro de `.mb-col` con `inert`. | Ubicación del nodo. | `<Toast>` fuera de la columna. | CODE | Corregido |
| A11Y-2 | P2 | Formularios (táctil) | Enfocar un campo en iOS. | Sin zoom forzado. | Zoom en campos de 13–15 px. | Tamaño de fuente. | 16 px en `pointer: coarse` para los campos detectados. | CODE | Corregido |
| A11Y-3 | P2 | Entrenamiento | Tocar «−/+ pasos» o «Pausar». | Área ≥ 24 px (WCAG 2.5.8). | ≈ 17 px. | Padding mínimo. | `min-height: 24px`. | CODE | Corregido |
| A11Y-4 | P2 | Logro validado | Escape o Tab en el aviso. | Escape cierra y el foco queda adentro. | No cerraba y el foco salía. | Sin manejo de teclado. | `keydown`: Escape cierra y Tab queda contenido. | CODE | Corregido |
| A11Y-5 | P3 | Modal, Sheet y Award | Scroll en iOS con una hoja abierta. | El fondo no se mueve. | El fondo puede moverse. | Sin bloqueo de scroll del body. | — | NT | Abierto |
