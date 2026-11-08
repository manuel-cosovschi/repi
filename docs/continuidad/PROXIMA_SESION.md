# REPI — Retomar acá

Actualizado: 08/11/2026 (hasta D211; **publicados y verificados el 08/11: corte de 300 s en Admin (#80, `47fac4f`), /conoce Motion 2 (#82, `0c30322`) y ejercicios por tiempo (#81, `b8f2c5c`, 0052 aplicada tras el respaldo `backup-20261108-033638`)**; en rama: transiciones M06 (D212, `claude/app-transiciones`, QA ronda 3 lista para publicar) y clave de cron en Vault (#79, espera el paso del titular en Vercel)). Antes: 07/11/2026 (hasta D210; **Adaptive Coaching 3.0 (#75) publicado y verificado: respaldo #76, 0051 aplicada, merge `ef22c73`**; **Sala · «Nuevo mensaje» (#74) publicado y verificado**; antes: **Sala: combinar ejercicios (#68), guía de demo sólo en las apps (#69), ficha del socio como página (#70) y editor de sala a la par del coach (#71) publicados y verificados**; antes: **REPI Sales Force & Commission OS (#63) publicado: 0050 aplicada tras el respaldo #67, merge `2b5e69f`**; antes: hasta D208; **Experience 3.0 (#64) y «Crear programa» desde la solicitud en Sala (#65) publicados y verificados en producción**). Antes: 07/11/2026 (hasta D207; Smart Program Import 2.0 publicado y verificado).

## M06 «Carril»: navegación fluida en las apps + ficha sola (socio y cliente) — 08/11/2026 · QA RONDA 3: SE PUEDE PUBLICAR · PR ABIERTO, ESPERA APROBACIÓN DEL TITULAR (D212)

- **Pedidos del titular:** 06/11 (grabación del iPhone, PWA del alumno): «muy rígido, nada fluido, hasta trabado… es rápido y quiero mantenerlo, pero más fluidez, alguna animación interesante» (todas las apps). 07/11: «Abrir ficha socio» desde Sala debe abrir sólo la ficha, no el listado.
- **Rama:** `claude/app-transiciones` (worktree `/home/user/repi-tx`, sobre `main` `218cd53`, que ya traía la pantalla «member» de #70). **Sin push, sin PR, sin despliegue.** Plan, decisiones, riesgos y mediciones: `docs/MOTION_NAVEGACION.md`; especificación: `motion.md` §13; contrato: `docs/DESIGN_CONTRACT.md`.
- **Hecho:**
  - **Escenario de secciones** (`components/motion/SectionStage.tsx`): secciones vivas con `<Activity>` (LRU 6), salida fija e inerte de 100 ms, entrada de 200 ms en el sentido del viaje (vertical en el escritorio staff), corte de meta en el `h1`, formación, scroll por sección antes de pintar, foco al `h1` si se perdía (staff: siempre), reinicio por relación o sede, entrada «volver» del entrenamiento.
  - **Alumno:** `TabBar.tsx` (indicador «sprint» que se mueve en el primer cuadro, arranque del ícono, FLIP al aparecer Gym, vuelta arriba, lectura anticipada); `MemberApp.tsx` con 5 bloques mecánicos (~36 líneas) y `Workout.tsx` sin tocar. Primera visita sin blanco ni saltos (caché + esqueletos + `Reveal`) en Tu gym, Progreso, NIVEL, Antes de REPI, rutinas propias, Desafíos, Nudges, Deseos, En sala ahora, Mensajes, chat, Mi cuerpo y Fotos.
  - **Compartido:** `lib/cache.ts` (memoria, stale-while-revalidate), `lib/ghost.ts` (salidas de hojas, modales y avisos), `components/motion/Skeleton.tsx`, `components/motion/SlideIndicator.tsx` (segmentos, pestañas y menú lateral), `components/ui/FlashToast.tsx`, `styles/motion-nav.css`, tokens nuevos (`section_exit`, `section_enter`, `stagger`, `press`, `exit`).
  - **Staff:** Gym, Coach y Admin con el escenario; `useLoad` sobre la caché (con `keep` en Socios, Performance Center y Agenda); avisos y novedades como máximo cada 30 s; armazón en esqueleto en la primera carga; esqueletos en ficha, ficha del cliente, contrato y lista de mensajes; cajón con fundido de salida.
  - **Ficha sola:** Gym `openMember` (título = nombre desde el primer cuadro, `pushState`, «atrás» del sistema y «Volver a …», recarga con `from`, modal del pedido se cierra antes). Coach: pantalla «client» (`?s=client&c=…&from=…`) desde Solicitudes, Panel, Cobros y Mensajes; en Clientes angosto, tocar abre la ficha como página.
  - **Entre documentos:** `styles/doc-transitions.css` (View Transitions, sólo páginas de las apps; borrar el archivo es el interruptor).
- **Pruebas** (servidor propio `next start -p 3104`, `repi_dev`, demos; nunca vitest):
  - `pnpm typecheck` ✓ (ojo: `pnpm -s typecheck` oculta errores), `pnpm build` ✓, `tsx --test tests/theme/theme-tokens.check.ts` ✓.
  - `e2e/motion-nav.spec.ts` nueva: alumno (recorrido con CPU ×4, cinco toques, foco, movimiento reducido, ids, hojas) y escritorio Gym ✓. Indicador en el primer cuadro, 0 cuadros vacíos, layout-shift 0 al volver y ≤ 0,001 en la primera visita, sin tareas largas al volver.
  - `e2e/gym-member-page.spec.ts` ampliada (foco, 390×844, atrás, Mi turno, Coach «Ver ficha») ✓.
  - Suites existentes: ver la tabla de resultados en `docs/MOTION_NAVEGACION.md` §17 y el cierre de esta sesión.
- **QA independiente (07/11) corregida** (detalle y números en `docs/MOTION_NAVEGACION.md` §18):
  - ALTA: Sala → «Abrir ficha del socio» abría además un diálogo «Solicitud» con error que quedaba abierto al volver. Causa: la selección `sel` era una sola para todas las pantallas vivas. Ahora **selección por pantalla** en `GymApp` y `CoachApp` (`sels`), y `SectionStage` **congela la sección que sale y las ocultas** (sólo la activa se vuelve a dibujar). Arregla también Coach Mensajes → «Ver perfil →» → «Volver» (la conversación quedaba perdida) y el título «Ficha del socio» durante la salida.
  - Progreso con latencia (CLS 0,08–0,10 → 0): esqueletos con el alto real en `ProgressTraining.tsx`; ayudas («Nuevo») leídas al abrir la app y síncronas (`Hint.tsx`, `TabBar.tsx`); lectura anticipada del resumen.
  - Tu gym (contenido → vacío → contenido): `useReveal` en `useLayoutEffect` (`motion/Ambient.tsx`); esqueleto con el aviso para lectores al final (`member/Gym.tsx`). Mensajes del alumno: esqueleto de 2 filas con el alto real.
  - Coach Programas (CLS 0,67–0,76 → 0, foco en `body` → `h1`): editor en esqueleto, sin vacío falso, `h1` estable (`ProgramBuilder.tsx`).
  - Salida de sección: opacidad en 70 ms (`M06.fade`), oculta al terminar sin esperar a React (dos títulos legibles: 5 → 1 cuadro). Foco a la sección cuando no hay `h1`; cajón cerrado del staff con `visibility: hidden` (< 768 px).
  - Pruebas nuevas en `gym-member-page.spec.ts` («con movimiento») y `motion-nav.spec.ts` («primera visita con latencia»). Corridas: 23 + 56 + 47 ✓; sólo los 2 fallos ya conocidos (importar métodos escritos, también en `main`; fotos en el puerto 3000). `tsc` ✓ y `pnpm build` ✓.
  - Tope de demos en `repi_dev`: se purgaron sólo demos `is_demo` con más de 30 min (`scratchpad/tx-fix/purge-old.ts`, corrige la lectura del valor devuelto del guion anterior).
- **No hecho / pendiente:** vuelo FLIP del nombre hacia la ficha; videos antes/después y prueba en el iPhone del titular (iOS 26, PWA; lista en §16 del documento); PR. Fase 2 en `MemberApp.tsx` después de fusionar AC3 (§14), que incluye «Volumen por semana» sin el vacío falso (debajo del pliegue en Progreso; no entra en el layout-shift medido).
- **`main` integrado (merge de `7f30a06`, 07/11):** AC3 #75, «Nuevo mensaje» #74 y el editor de sala #71. Conflictos en 12 archivos resueltos conservando las dos cosas:
  - **Alumno:** `BrainProvider` sigue por encima de las dos ramas (pestañas y entrenamiento); `RepiPanel` y `RepiWhy` se montan una sola vez ahí, fuera de las secciones vivas. `onCardOpen`, el borrador de Mensajes (`draft`), `RepiAsk` en Progreso y en rutinas propias van dentro de `SectionStage`. Mensajes del alumno: caché M06 más el borrador de REPI.
  - **Coach:** «Revisar» de «Pendientes» (señales de REPI) abre la **ficha sola** del cliente en Rendimiento (`openClient(id, "rend")`, con «Volver a Panel»). `CoachClients` aplica un pedido de pestaña nuevo aunque la pantalla siga viva. `RepiSignals` en Rendimiento.
  - **Gym:** «Nuevo mensaje» en `ChatPane` (`includeSelected`, `action`) con la selección por pantalla (`shell.sel`). Esqueleto de la ficha y borrador local del editor (#71), los dos.
  - **Admin:** «Coaching IA» entra en el menú y en el escenario (verificado con `tsc` y la build; la E2E de Admin necesita una cuenta de administración real y se omite).
  - **Pruebas:** `pnpm typecheck` ✓; migraciones en `repi_dev` (0051) y `pnpm build` ✓. E2E en 3104:
    - pasan `brain`, `brain-staff` (Pendientes, con `DATABASE_URL` de `repi_dev`), `gym-new-message`, `gym-editor-parity`, `motion-nav` y `gym-member-page`;
    - en `gym-new-message`, «Escribir desde la ficha» miraba la fila oculta de Socios (que sigue viva): ahora mira la fila visible;
    - prueba propia (fuera del repositorio): pestañas, `RepiCard` visible en Inicio, «Hablar con REPI», el panel se reabre con la conversación después de cambiar de pestaña (teléfono) o sigue abierto (escritorio ancho) y sobrevive al entrenamiento. Pedidos del cerebro sin duplicar: un `GET /api/me/brain` y una sola carga del hilo tras muchos cambios de pestaña.
- **QA independiente, ronda 2 (08/11) corregida** (detalle, números y lo descartado en `docs/MOTION_NAVEGACION.md` §20):
  - **Velocidad.** Con CPU ×4 el título llegaba legible después que en `main` (Progreso al volver: 61–65 → 166–182 ms). Ahora el indicador sale al apoyar el dedo (`pointerdown` en `TabBar.tsx`; vuelve si el gesto se cancela). La sección se dibuja en el click, sin `startTransition` y de un tirón (`go` en `MemberApp.tsx`).
  - `SectionStage` suma `deps(k)`: lo que lee cada sección. Al volver sin cambios se reutiliza su último nodo.
  - `lib/cache.ts` suma `keepSame`: una revalidación con el mismo contenido conserva el mismo objeto. La entrada queda anclada al tiempo del cuadro.
  - Medido intercalado con `main` en 3114, 10 corridas por lado: el título se lee antes en 9 de 10 cambios (Progreso al volver, 67 contra 62 ms, dentro del ruido). Con un toque de 80 ms, el indicador se mueve 12–28 ms después de apoyar el dedo; en `main`, 127–219.
  - Descartado con números: el indicador en el click y la sección en el cuadro siguiente, la vuelta en `startTransition` y anticipar secciones ocultas.
  - **Scroll de Ejecutivo** (600 → 500 al volver): `OwnerGuide.tsx` ya no mueve la ventana. Red de seguridad `holdScroll` en `SectionStage`.
  - **Cajón del staff:** `components/motion/useDrawer.ts` en Coach, Gym y Admin. Volver a tocar la pantalla actual deja el foco en su título (antes, en `body`). Al abrir, foco al ítem actual y `main` inerte. Escape o el fondo cierran y el foco vuelve a «Abrir menú». A ≥ 768 px se cierra.
  - **Progreso con latencia, debajo del pliegue:** sin la lista de ejercicios un instante, «Volumen por semana» en esqueleto de 120 px y el lugar de «Preguntale a REPI» reservado (`ProgressTraining.tsx`, `MemberApp.tsx`).
  - **Coach Programas:** el nombre en esqueleto mientras carga el programa, sin el «PROGRAMAS» que cambiaba medio segundo después (`ProgramBuilder.tsx`).
  - **Pruebas:** `motion-nav.spec.ts` › «teléfono Gym (dueño)» cubre scroll, red de seguridad, foco al volver a tocar, teclado y 8 toques con CPU ×4. `roles.spec.ts` espera el botón del menú en el teléfono.
  - **Corridas:** `tsc` ✓, `pnpm build` ✓. E2E en 3104 contra `repi_e2e_tx`: `motion-nav`, `gym-member-page`, `member-workout` y `roles`, 35 ✓. Las 3 de `roles` en escritorio no corrieron por el tope de demos y habían pasado en la corrida anterior, con el mismo código de staff.
  - **Demos:** `repi_dev` quedó en el tope de 300 demos; no se purgó. El orquestador creó `repi_e2e_tx` (migraciones hasta 0051) y `tx-env.sh` apunta ahí. Al final de la ronda `repi_e2e_tx` también quedó en 301, por las mediciones; tampoco se purgó.
  - **Sin migraciones**, sin cambios de servidor ni de base.
- **Próxima acción:** revisar con el titular (videos y su iPhone; ahora también la velocidad en su teléfono) y, con su aprobación, abrir el PR. Pendientes menores: «Tu nivel» crece 25 px al cargar (al final de Progreso); tareas largas del primer dibujo de Entrenar, Progreso y el editor de Programas, como en `main`.
- **08/11, ronda 3:** QA independiente → se puede publicar (más rápida que main en los 10 cambios de pestaña; axe 0; E2E 40 ✓). Corregidos además: el lugar reservado de «Preparar consulta con REPI» en Mensajes, el indicador que vuelve si el dedo desplaza y el toque largo sin click. Detalle en `docs/MOTION_NAVEGACION.md` §21. Videos para el titular en `scratchpad/tx-qa/owner/`.
- **Próximo:** aprobación del titular, merge (sin migraciones) y verificación en producción con demos.

## Incidente «Task timed out after 300 seconds» en /api/admin — 08/11/2026 · PUBLICADO Y VERIFICADO (#80, `47fac4f`)

- **Qué pasó:** 2 cortes de 300 s en REPI Admin (06/11 13:08 y 07/11 21:07 UTC) con la base sin nada raro. El pedido esperaba algo dentro del proceso.
- **Causas confirmadas en local:**
  1. **Pool trabado.** 13 transacciones usaban el `db` global dentro de `db.transaction`. En Vercel el pool tiene 3 conexiones, así que 3 pedidos así a la vez se trababan para siempre y colgaban la instancia. Reproducido con 3 aprobaciones simultáneas de una venta y triple clic en «Aprobar».
  2. **Socket mudo.** postgres-js no pone tiempo máximo a las consultas, así que una consulta en un socket mudo esperaba unos 15 min.
  - **Cuál fue en producción:** probablemente el 2. En producción hay 0 ventas cargadas (consulta del 08/11), así que el bloqueo por aprobaciones simultáneas (1) no pudo ser la causa. Es un defecto real pero latente. El socket mudo coincide con «1 caso aislado, base limpia» y con que nada quedara registrado. No hay registros de pedidos para confirmarlo (Hobby guarda 1 h).
- **Corrección (sin migraciones):**
  - **Transacciones:** pasan `tx` a todas las funciones que llaman (ventas, liquidaciones, inicio de entrenamiento, sala, agenda, privacidad, pegar día, plantillas, invitación del dueño). El push de «brief» se encola después del commit.
  - **Pool:** `src/db/index.ts` agrega `idle_timeout` de 20 s, `max_lifetime` de 5 min y `connect_timeout` de 10 s.
  - **Tiempos máximos:** `src/server/deadline.ts` define los tiempos. Con ellos:
    - Admin responde 503 «timeout» a los 25 s y la función se corta a los 60 s.
    - El cron comparte un presupuesto de 45 s y se corta a los 60 s.
    - after() se abandona a los 20 s.
    - web-push tiene un timeout de 10 s.
    - El almacenamiento tiene timeouts de 15 y 60 s.
  - **Interfaz:** «Aprobar», «Rechazar», «Pedir corrección» y «Generar borrador» se bloquean mientras corren. La clave idempotente de la liquidación se mantiene hasta que sale bien.
- **Guardas y pruebas:**
  - Guarda estática `tests/safety/transactions.check.ts` (en `test:guards`, corre en CI): falla si una transacción vuelve a pedir otra conexión.
  - Regresión `tests/pool-deadlock.test.ts` con el pool real de 3 conexiones.
  - `tests/deadline.test.ts`.
- **Pendiente del titular (producción):**
  - Tiempos en el rol `repi_app`, previo «Respaldo»:
    - `alter role repi_app set idle_in_transaction_session_timeout = '30s'`;
    - `alter role repi_app set lock_timeout = '15s'`;
    - `alter role repi_app set statement_timeout = '60s'`.
    - Supavisor los aplica a las conexiones nuevas. Se verifica con `select current_setting('lock_timeout')`.
    - Revisar antes los scripts que entran como `repi_app` (`ops:retention`). Opcional: `log_lock_waits = on`.
- **Publicado 08/11:** merge `47fac4f`, sin migraciones. En producción: `/api/version` = `47fac4f44cc3`; `/api/admin/summary` sin sesión → 401; el cron por minuto siguió en 200 (`net._http_response`); Vercel sin errores de ejecución en los 30 min siguientes. Los tiempos del rol `repi_app` siguen sin aplicar (decisión del titular).
- **Límite conocido:** si el peer desaparece del todo y ni siquiera contesta el cierre, `idle_timeout` no libera la conexión. Sólo lo acotan el 503 a los 25 s y el maxDuration.

## Ejercicios por tiempo (D211): cinta con duración, velocidad e inclinación — 08/11/2026 · PUBLICADO Y VERIFICADO (#81, `b8f2c5c`; 0052 aplicada)

- **Pedido del titular:** en «Cinta caminadora» el profe carga duración (min), velocidad (km/h) e inclinación (número, sin «%»). El alumno ve lo mismo y registra lo que hizo de verdad. La fuerza sigue con series/reps/carga/RIR y las demás actividades tienen campos propios. Spec y auditoría en `scratchpad/time-audit.md`, resumida en D211.
- **Rama:** `claude/ejercicios-por-tiempo`, con main integrado.
- **Dominio** (`packages/domain/src/activity.ts`, nuevo):
  - Perfiles: fuerza, peso corporal, isométrico, cinta, bici, remo, elíptico, escaladora y duración.
  - Rangos y pasos, validación, texto de la prescripción («10 min · 5 km/h · incl. 3») y valores por defecto.
  - «Cinta caminadora» es sinónimo de «Cinta (caminata)», no una fila nueva.
  - Training Intelligence no sugiere kilos ni RIR para actividades.
  - Los reemplazos sólo van entre actividades.
  - La importación SI2 lee «vel/incl/km/h» sin confundirlos con carga.
- **Migración 0052 (aditiva):**
  - `exercise.metrics_profile` (text, CHECK) y `set_log.metrics` (jsonb objeto, CHECK).
  - Perfil de las filas del catálogo de REPI por nombre y tipo.
  - Scripts: `hosted-0052.sql` (una transacción), `verify-0052.sh` y rollback `0052_time_metrics.down.sql`.
  - El código de producción actual es compatible con 0052 aplicada, así que se aplica ANTES de integrar, previo «Respaldo».
- **Servidor:**
  - `logSet`, conflictos, historial y corrección aceptan `metrics`.
  - Las guardas rechazan un editor viejo que perdería la actividad: 409 «Actualizá REPI».
  - Tope de 200 reps intacto en filas de reps.
  - Las alertas y tareas de sala muestran «12 min · 5,5 km/h · incl. 4».
  - La exportación personal incluye las métricas.
- **Pantallas:**
  - Editores de coach, sala y Mis rutinas con sólo los campos del perfil.
  - Entrenamiento del alumno con cronómetro persistente y −/+ por campo.
  - Historial con tiempo en lugar de «0 kg».
  - Cola offline con métricas.
- **Revisión:** 3 lentes independientes y 15 hallazgos, todos corregidos con prueba (`git log`).
- **Pruebas:**
  - Dominio: 54 archivos / 1063.
  - apps/web vitest: 36 archivos, incluidos `time-exercises` y `brain*`. Falla sólo `brain-context` «daysSinceLast», previa y dependiente de la hora (00–03 UTC).
  - E2E: `timed-exercises` 12/12; regresiones de entrenamiento, sala, offline e importación en verde. `gym-editor-parity` móvil falló una vez y pasó al repetir: es intermitente.
  - Typecheck y build OK.
  - Capturas de teléfono para el titular en `scratchpad/time-shots/owner/`.
- **Local:** `repi_dev` llegó al tope de 300 demos. Las E2E corren contra `repi_e2e_time`/`repi_e2e_tx`, bases locales propias. No se purgó nada.
- **Publicado 08/11 (aprobación del titular «Publica»):**
  1. «Respaldo» por issue #83 → release `backup-20261108-033638` verificado.
  2. `hosted-0052.sql` como postgres en una transacción: 53 migraciones, 2 columnas y 2 CHECK, 191/191 filas del catálogo con perfil (`Cinta (caminata)` = `treadmill`), 0 ejercicios propios tocados; la pertenencia de postgres a `repi_app` volvió a su estado (`set_option` falso).
  3. Merge `b8f2c5c`; `/api/version` = `b8f2c5c95478`.
  4. Verificación con demos en producción (iPhone 15): el alumno ve «10 min · 5 km/h · incl. 3» y sólo duración, velocidad e inclinación (sin peso); registró 12 min → `reps 720`, `rir null`, métricas `{speedKmh: 5, incline: 3}`. El coach agrega «Cinta caminadora» y ve sólo los tres campos (sin RIR). Sin errores ni 5xx.
- **Pruebas que dependían de la hora, corregidas con #80/#81:** `brain-context` (días según Argentina), `brain-coach` caso 52 (sesiones al mediodía de Argentina) y `gym.test` métricas (medir un segundo después; con #82).

## /conoce · Experience 3 Motion 2 «El punto que ordena» — 08/11/2026 · PUBLICADO Y VERIFICADO (#82, `0c30322`)

- **Pedido del titular:** la animación de `/conoce` «está decente… podría mejorarse incluso más… sé creativo y andá más allá»
  y el logo «raro» que aparecía al final de 02: «o lo sacás o que se genere el logo/nombre real».
- **Dónde:** worktree `/home/user/repi-cx`, rama `claude/conoce-ajustes` (PR abierto el 08/11, sin publicar). Plan, decisiones y evidencia:
  `docs/comercial/EXPERIENCE_3_MOTION_2.md` (§10: commits y verificación de la ronda 1; §11: ronda 2; §12: ronda 3).
- **Hecho (un commit por paso, P0–P7 + verificación):**
  - P0 base: tienda y proyección `stage.project`, personajes (Valentina, Julián, Sofía), tomas nuevas y lente, sala con zoom
    ≤ 2,4 y foco en blanco, director sin lecturas por cuadro, `Say`, `curves.ts`, `Roll` v2, sin desenfoques animados.
  - P1 (02): los pedazos mandan trazos curvos al punto de la «ı», el punto se los traga, crece y el logo real se abre desde él;
    corte de sala fría a viva y las tres pantallas reales (sala, socio, dueño).
  - P2 (hero): el punto cae en arco sobre el rack de Valentina sin cruzar el texto y la luz se expande desde ahí; el 3D entra
    después, en la misma cenital del SVG.
  - P3 (03): la serie como subtítulo enorme con el motor real; teléfono con `TargetCard` real (ningún «53»); repeticiones 1→6.
  - P4 (cierre): toda la sala vuelve al punto y el punto se acomoda en la «ı».
  - P5–P7: módulos como tomas y «Que venga alguien → Voy» con el scroll; perspectivas al llegar y sin remontar; «PROBALO.»,
    puertas sin reflujo, bordes curvos y pasos que se dibujan.
- **Ronda 2 (revisión independiente, 07/11):** corregidos los 8 puntos (detalle y evidencia en
  `docs/comercial/EXPERIENCE_3_MOTION_2.md` §11):
  - cierre sin logo «raro»: no hay logo hasta que el punto llega a la «ı» y después nace entero desde el punto;
  - el trazo «Voy» ya no queda suelto en el teléfono;
  - ningún pedazo de 02 pisa el titular en iPhone 15 (nueva prueba e2e);
  - 3D con equipos ≤ 58 px, personas cian sin luz y sin cuadro vacío en 03;
  - recortes de 03 enteros, «62,5 kg × 8–10» en una línea y teléfono vertical en escritorio;
  - el trazo de Gestión rodea el teléfono;
  - Training Intelligence muestra la misma serie que 03 (`x3/EngineScreen.tsx`, compartido).
  Más audacia: impacto del hero como evento de luz, 02 sin tiempos muertos y con golpe de cian en el corte, la sala que gira
  en espiral alrededor del logo en el cierre y la sala que responde al mouse.
  Pruebas: typecheck ✓; e2e `conoce` + `public` 65 ✓ + 1 omitida; Lighthouse móvil mediana 86 (TBT 98 ms, CLS 0, A11y 100);
  CLS de recorrido 0,0011 / 0; axe 0 (20 pasadas); Impeccable 0; pausa sin cambios; SwiftShader en SVG.
  Sin migraciones ni dependencias nuevas.
- **Ronda 3 (segunda revisión independiente, 08/11).** La revisión encontró problemas sólo con el 3D, que se ve forzando
  `?sala=high` en escritorio o `?sala=medium` en el teléfono. Todos corregidos; detalle y números en
  `docs/comercial/EXPERIENCE_3_MOTION_2.md` §12.
  - **02:** los pedazos ya no saltan cuando entra el 3D. Se ubican con `transform` y, con la escena a la vista, no se
    reubican; lo hacen al salir de la pantalla. CLS esperando en 02: 0,1395 / 0,2089 → 0. CLS de recorrido con 3D:
    escritorio ≤ 0,0012 y teléfono 0.
  - **Hero:** fundido cruzado real del SVG al 3D (`data-svg="off"` recién al terminar), sin el cuadro sin sala.
  - **Cierre en 3D:** el plano se encoge y se apaga del todo (`planFade`). Queda sólo el punto, sin la sala en miniatura.
  - **Trazos de 02:** rodean el texto (`route`/`spline`). En el teléfono el párrafo se va antes de los trazos. Los pedazos
    se apagan sobre el punto (≤ 9 px).
  - **Teléfono:** sin anillos del impacto sobre el logo y el título. Cierre de 180svh a 230svh.
  - **Pruebas:**
    - typecheck ✓.
    - Lighthouse móvil: 87 / 86 / 86, TBT 52 / 110 / 83 ms, CLS 0, A11y 100.
    - CLS por defecto: 0,0005 en escritorio y 0 en el teléfono.
    - Movimiento reducido y pausa: sin cambios.
    - E2E `conoce` + `public`: 63 ✓, 1 omitida y 2 ✗. Las dos fallas son la misma prueba de demo, en mobile y desktop: la
      API respondió 503 porque `repi_dev` tiene 301 entornos de demo de otras sesiones (tope 300, purga por cron). No
      depende de esta ronda y no se tocó la base.
  - **Videos para el titular:** regrabados en el scratchpad, `cx-motion/owner/`, con los mismos nombres.
- **Archivos:** `apps/web/src/components/conoce/sala/{store,model,Stage,SalaSvg,SalaCanvas}.ts(x)`,
  `apps/web/src/components/conoce/x3/{Hero,Problem,Training,Perspectives,Showcase,Demos,Proof,Finale,Say,Roll,curves,gsap,EngineScreen}.ts(x)`,
  `apps/web/src/components/conoce/ConoceHub.tsx`, `apps/web/src/styles/conoce3.css`, `apps/web/e2e/conoce.spec.ts`.
  `TargetCard.tsx` no se tocó (sólo se reutiliza).
- **Pruebas:** typecheck ✓; e2e `conoce` + `public` 64/64 contra `next start` local; axe 0 (32 pasadas); Impeccable 0;
  Lighthouse móvil mediana 86, TBT 117 ms, CLS 0; CLS de recorrido 0,0005 / 0; pausa sin cambios de píxeles; SwiftShader en
  SVG. Vitest no se corrió en apps/web (base de pruebas compartida). Sin migraciones, sin dependencias nuevas.
- **Decisiones:** 3 series en el ejemplo (con 4 el motor no sube la carga sobre un historial de 3); el subtítulo de 03 usa
  `targetLine` de la tarjeta; los puntos de «escribiendo» pasaron a texto (Impeccable); la prueba e2e de la cabecera acepta el
  `aria-label` del logo (fallaba igual antes de esta pasada).
- **Pedidos que siguen en su propio paso:** «Abrir ficha socio» desde Sala debe abrir una página sólo con la ficha de ese
  socio (tarea #49, pedido del titular del 07/11) y las transiciones de las apps (#45). No se tocaron en esta pasada.
- **Publicado 08/11** (aprobado por el titular tras ver los videos): merge `0c30322`, sin migraciones. En producción (Playwright, iPhone 15 y escritorio 1440): recorrido completo sin errores de consola ni respuestas 4xx/5xx; CLS 0 (teléfono) y 0,0009 (escritorio); logo real en todo el recorrido.
- **Próxima acción:** revisar en Speed Insights el LCP de campo de `/conoce` (objetivo ≤ 2,5 s; en laboratorio 3,9 s) cuando junte visitas.

## Adaptive Coaching 3.0 (D210) — 07/11/2026 · PUBLICADO Y VERIFICADO (#75, `ef22c73`; renumerado: D209 y 0050 quedaron para la fuerza de ventas, #63)

- **Pedido:** máster del titular, guardado en `docs/adaptive/AC3_MASTER_PROMPT.md`.
  - Autoriza el bloque de punta a punta: migraciones aditivas, merge y deploy con respaldo y pruebas críticas en verde.
  - Prohíbe gastos nuevos sin aprobación, borrar o modificar datos reales, migraciones destructivas y notificaciones masivas sin consentimiento.
- **Gasto de IA:** aprobado por el titular el 07/11 con los topes previstos: 30 mensajes por persona por día, US$2 por día en total y US$20 por mes por organización. Se cambia en Admin → Coaching IA. Sin IA o al tope, responde por reglas.
- **Publicación** (en este orden):
  1. CI en verde sobre `f76a19c`. Antes falló una vez `brain-push`, una prueba intermitente: con más de 1000 avisos pendientes de otras pruebas, la fila quedaba fuera de la tanda. Se corrigió aislando la cola en la prueba, sin tocar código de la aplicación.
  2. Respaldo `backup-20261107-165801-42393734774` en verde (issue #76).
  3. `hosted-0051.sql` aplicado en producción y verificado: 52 migraciones, nueve tablas con dueño `repi_app`, RLS activo y ningún permiso público.
  4. Squash merge `ef22c73`; producción en `ef22c73adb15` desde las 17:26 UTC.
- **Verificación en producción** (demos ficticias):
  - **Alumno, en teléfono:**
    - la tarjeta de Inicio funciona;
    - «¿Qué me toca hoy?» responde con el día y el atajo;
    - «me duele mucho el pecho» da la respuesta fija con 107/911;
    - «me duele la rodilla» propone registrar la molestia, con confirmación.
  - **Coach:** «Señales de REPI» se ve en Rendimiento.
  - **Errores:** ninguno, ni 5xx ni errores de ejecución.
  - **Base:** 0 llamadas de IA. El único hilo es el de la cuenta demo.
  - El detalle está en §10 del contrato.
- **Contrato:** `docs/adaptive/ADAPTIVE_COACHING_3.md`.
- **Matriz de pruebas:** `docs/adaptive/AC3_PRUEBAS.md`.
- **Decisión:** D210 en `docs/DECISIONS.md`.
- **Privacidad:** sección «Asistente REPI» en `docs/PRIVACIDAD_OPERACION.md`.
- **Migración 0051 `brain`** (aditiva, nueve tablas):
  - Archivos: `hosted-0051.sql`, `verify-0051.sh` y `rollback/0051_brain.down.sql`.
  - Mismo SQL y mismo sha256 que la 0050 original; `when` nuevo en el journal, posterior al de 0050.
  - Ensayo local en una copia descartable, todo correcto: aplicación, RLS, restricciones, cascada, reintento, reversión negada con datos y reaplicación.
- **Revisión independiente y correcciones:**
  - Confirmados: 8 de dominio, 13 de servidor y 11 de interfaz, más los conocidos K1–K3. Todos corregidos, con pruebas de regresión.
  - Destacado: alarmas de salud que se escapaban («me duele mucho el pecho», «me bajó la presión»).
  - Una verificación independiente encontró 5 problemas bajos nuevos, también corregidos:
    - duración máxima de las rutas frente al reclamo;
    - una falla después del efecto ya no duplica la acción;
    - alimentación sin falsos positivos;
    - una molestia propuesta vale todo el día;
    - el panel pasa a hoja cuando no entra arriba del dock.
- **Pruebas (local):**
  - Suite completa: dominio 978/978 y web 707/707 (95 archivos), sobre `repi_test` descartable.
  - E2E del asistente y de regresión: 36 en verde y 4 omitidas (corren en un solo formato). Archivos: brain, brain-staff, member-workout, roles, api-auth-sweep, offline-reload y los de sala.
- **Primera franja proactiva (18 h, 07/11), verificada:**
  - 60 llamadas del proceso programado, todas con respuesta 200.
  - 10 personas reales evaluadas y 6 tarjetas dentro de la app.
  - 0 push, 0 fallas, 0 llamadas de IA.
  - La corrida más larga tardó 738 ms.
  - Detalle en §10 del contrato.
- **Aparte:** un corte por tiempo de 300 s en `/api/admin/[[...path]]` (21:07 UTC). Ya había pasado el 06/11, antes de AC3, y ninguna consulta superó los 5 s en la base. Ver la entrada del incidente (08/11) arriba.
- **Seguridad, preexistente y pendiente de decisión del titular** (no lo introdujo AC3):
  - **Qué pasa:** el job de pg_cron `repi-notifications` (lo crea `scripts/schedule-cron.ts`) lleva el bearer de `CRON_SECRET` dentro del comando. pg_cron escribe ese comando en `postgres_logs` cada minuto, así que quien vea los registros de Supabase puede leer la clave.
  - **Por qué importa:** esa clave también habilita `/api/cron/mail-test`, `alert-test` y `mail-domain`.
  - **Propuesta:**
    1. guardar el token en Supabase Vault y que el job lo lea de `vault.decrypted_secrets`;
    2. rotar `CRON_SECRET` en Vercel y en Vault;
    3. ajustar `schedule-cron.ts`.
  - Toca producción y la configuración de Vercel: requiere aprobación. La clave no se copia en ningún documento.
- **Queda por ver en producción:**
  - **Primera respuesta con IA:** la clave de OpenAI ya estaba configurada; aplica los topes de `DEFAULT_POLICY`.
  - **REPI Admin → Coaching IA:** requiere una cuenta de administración real.
- **Próximo:** ejercicios por tiempo (cinta: duración, velocidad e inclinación), en `claude/ejercicios-por-tiempo`. Lleva la migración 0052 aditiva, que requiere respaldo antes de aplicarse.

## Sala · Mensajes: «Nuevo mensaje» para elegir un socio y escribirle — 07/11/2026 · PUBLICADO Y VERIFICADO (#74, `38e500c`)

- **Pedido del titular:** «vos deberías poder seleccionar un socio y mandarle mensaje. No le deja al entrenador».
- **Problema:** «Mensajes» de sala listaba sólo las conversaciones que ya tenían mensajes, y no había forma de empezar una.
- **Cambio:**
  - **Botón:** «Nuevo mensaje» (`components/gym/NewMessage.tsx`). Abre un buscador de socios de la sede y abre o crea la conversación (`POST /members/{id}/conversation`).
  - **Permiso:** el botón sólo aparece con `floor.work`.
  - **Lista:** `floorThreads(..., withId)` incluye la conversación elegida aunque todavía no tenga mensajes (`ChatPane` con `includeSelected`).
- **E2E:** `gym-new-message.spec.ts`.
- **Producción (demo de sala):** se elige un socio, la conversación aparece seleccionada con su caja de texto y no hay errores.
- **Sin migraciones.**


## Sala: combinar, guía de demo, ficha del socio y editor a la par del coach — 07/11/2026 · PUBLICADO Y VERIFICADO (#68–#71)

- **#68 · Combinar ejercicios** (pedido urgente de un entrenador de sala, «hacelo ya… y lanzalo»):
  - «Combinar con el siguiente» y «Separar» en la fila de cada ejercicio, en el editor de sala y en el constructor del coach. Antes la opción estaba escondida dentro de «Series y técnica».
  - La lógica está en el dominio (`combineWithNext`, `separateFromGroup`, `combinedWithNext` en `packages/domain/src/prescription.ts`).
  - «Editar programa» espera la versión nueva después de guardar.
  - Producción: demo de sala, A1/A2 guardado y reabierto, sin errores.
- **#69 · Guía de demo:** `DemoTour` (layout raíz) se muestra sólo en `/app`, `/coach` y `/gym`. Antes la píldora «Demo · Guía · Otro perfil» quedaba flotando en /conoce y /demo durante las 6 h de la sesión de demo.
  - Producción: antes 1 píldora en cada página; después 0.
  - E2E: `demo-tour-scope.spec.ts`.
- **#70 · Ficha del socio como página:** pantalla nueva `member` (`?s=member&sel=…`, `MemberPage` en `components/gym/Members.tsx`).
  - Sala, Mi turno y Tus pendientes abren sólo la ficha, con el nombre como título, «Volver a Sala» y «Todos los socios».
  - En «Socios», por debajo de 836 px se ve la lista o la ficha, una por vez (container query sobre `.gy-members`).
  - Producción: escritorio y teléfono, sin lista y con el programa a la vista, sin errores.
  - E2E: `gym-member-page.spec.ts`.
- **#71 · Editor de sala a la par del coach** (pedido: «tiene que aparecer ahí también… revisá todo»). La revisión función por función mostró que ya estaban las piezas de Urko: series y técnica, reemplazos, notas, carga sugerida, copiar/pegar días, asistente, importar y TI. Faltaba:
  - borrador local por socio y revisión: cerrar con ×, Escape o tocando afuera ya no pierde lo armado; «Descartar cambios»; «Cancelar» pregunta antes;
  - subir ejercicio ↑ y quitar día;
  - «Indicación para el socio»;
  - aviso de circuito con «Igualar a N vueltas»;
  - filas numeradas 01, 02…
  - E2E: `gym-editor-parity.spec.ts`.
- **Pruebas locales del conjunto** (servidor de producción local, demos ficticias): 21 E2E en verde y 1 omitida (sólo corre en teléfono). Archivos: gym-editor-parity, gym-member-page, demo-tour-scope, combine-exercises, connect-program y coach-workflow.
- **Pendiente conocido, no relacionado:** `e2e/mobile-layout.spec.ts` «alumno: importa una rutina con métodos escritos» falla en local (no encuentra «Método: … Drop set» en «Revisá tu rutina»). La E2E no corre en CI; revisar contra SI2.
- **Sin migraciones.**

## Sala: «Crear programa» desde la solicitud del socio — 07/11/2026 · PUBLICADO Y VERIFICADO (#65, 6fa1a36)

- **Pedido del titular** (captura de un pedido «Programa nuevo» en Smart Center): «que cuando te aparece una solicitud de un socio te permita desde ahí» crear el programa, sin ir hasta Socios.
- **Hecho:**
  - **Botón** (`components/gym/Connect.tsx`): en el detalle de un pedido `programa_nuevo` o `actualizar_programa`, quien tiene `program.edit` ve «Crear programa» (o «Editar programa») junto a «Abrir ficha del socio». En esos pedidos «Resolver» pasa a ser secundario.
  - **Editor** (`MemberProgramModal` en `components/gym/Members.tsx`): abre el mismo editor de la ficha.
  - **Servidor:** `memberDetail(…, { task })` y `?task=<id>` en `GET /api/gym/[orgId]/members/[id]` marcan esa solicitud para completarla al guardar, sólo si se cierra con el programa (`closesWithProgram`, la misma regla que valida `saveMemberProgram`).
  - **Guía:** `GymGuide.tsx` lo explica.
  - Sin migraciones ni permisos nuevos.
- **Pruebas:**
  - typecheck y 24 guards ✓;
  - `gym.test` + `connect.test` 32/32, con un caso nuevo: preferencia de la solicitud, fallback y otro profesor;
  - E2E `e2e/connect-program.spec.ts` 2/2 (teléfono y escritorio);
  - CI ✓.
- **Verificado en producción (`/api/version` = `6fa1a36c0572`)** con una demo de sala (organización `is_demo`, ficticia):
  - T-1044 «Programa nuevo» muestra «Crear programa»;
  - el editor marca T-1044 para completar;
  - al guardar aparece «Programa guardado (revisión 1) y T-1044 completada»;
  - la solicitud queda «Resuelta» y sin el botón;
  - sin errores ni 5xx.
- **Próxima acción:** ninguna. Si los profes lo piden, sumar el mismo atajo a «Revisión de técnica» u «Onboarding», que también se cierran con el programa.

## Experience 3.0 (D208) — 07/11/2026 · PUBLICADO Y VERIFICADO (#64, 31a2e57)

- **Pedido:** máster «REPI Experience 3.0»: reconstruir `/conoce` como experiencia interactiva premium y producir films sin voz (motion graphics + interfaz real + música instrumental con licencia). «No publicar en producción sin mi aprobación explícita»; revisión por grabaciones (sin preview de rama); «NO QUIERO LOCUCIONES DE ELEVENLABS».
- **Rama y PR:** `claude/experience-3`, **PR #64**, integrada con squash el 07/11 con la aprobación explícita del titular («Publica todo lo que hiciste hasta ahora, la página, todas las correcciones, videos»). Sin migraciones ni cambios de base. Despliegue anterior para volver atrás: `dpl_Hv9pNbk4Qm61PJbUH7hjgDv95d2m` (08d4a50).
- **Hecho:**
  - **Página** (`components/conoce/ConoceHub.tsx`, `x3/*`, `sala/*`, `styles/conoce3.css`): escenario fijo «la sala en vivo» (R3F con tres niveles y SVG de respaldo, `?sala=high|medium|low`), ocho escenas con GSAP ScrollTrigger reversibles y con movimiento reducido. Se conservan rutas, UTM, `/qr`, leads a REPI Admin, WhatsApp, demos guiadas y eventos; nuevos sólo `scene_view` y `film_open`. Contenido en `content/conoce.ts`. Spec: `docs/comercial/EXPERIENCE_3.md`; producto: `PRODUCT.md`.
  - **Films** (`design/films/`, generador `kit/build.py`, spec `SPEC.md`): marca, gimnasios, entrenadores, deportistas (+ 9:16), aliados, Training Intelligence, progreso, altas y sala. Música de Kevin MacLeod (CC BY 4.0, atribución en el reproductor) y efectos de Pixabay: `marketing/videos/LICENCIAS.md`. Versión web en `public/conoce/videos/`; masters fuera de Git y reproducibles con `kit/tools/render-all.sh`.
  - **Reproductor:** diálogo modal, sonido sólo con un toque, versión 9:16 en teléfonos en vertical, atribución de la música.
  - **Limpieza:** se quitaron `ProfileExplorer.tsx` y `Media.tsx` (hub anterior, sin uso). El video con locución de aliados queda superado.
- **Revisión independiente (07/11):** 24 hallazgos confirmados y corregidos. Entre ellos:
  - el pie tapado por el escenario;
  - el formulario, que no seguía el perfil elegido;
  - errores ilegibles;
  - el reloj del 3D;
  - el hero, que ocultaba el título;
  - pausa de animaciones;
  - descripción en texto de los films;
  - aviso de modificación de CC BY.
  Las escenas 02 y 03 pasaron a `position: sticky` (CLS de 1,5 a 0). El WebGL por software usa el SVG.
- **Pruebas:**
  - typecheck y guards ✓;
  - dominio 491 y web 513;
  - E2E `conoce` + `public` 56/56;
  - axe 0 (20 combinaciones y reproductor);
  - Impeccable 0;
  - Lighthouse móvil: CLS 0, TBT 70–110 ms; A11y, BP y SEO 100; LCP 3,5–3,9 s simulado y 2,6 s con limitación real, sobre `next start` local sin CDN (la `/conoce` de producción da 3,0 y 2,4). **LCP de campo a confirmar después de publicar.**
  - Films: 0 cuadros en blanco, de −13,9 a −14,7 LUFS, pico ≤ −2,2 dBTP.
  - Detalle en la PR.
- **Para regenerar films y descripciones:** `design/films/SPEC.md` § Producción (`render-all.sh`, `describe.py`). Masters en el scratchpad de la sesión (no persisten): se rehacen con los medios.
- **Verificado en producción (07/11, `https://repiclub.com`, `/api/version` = `31a2e57c88e6`):** recorrido de sólo lectura en teléfono (Pixel 7) y escritorio (1440×900). Los eventos anónimos se interceptaron para no sumar visitas falsas a la medición.
  - `/conoce` y los cuatro perfiles: 200, h1 «Cada repetición cuenta», nueve escenas con `data-shot`, sin scroll lateral, sin errores de consola ni 5xx.
  - Botón «Pausar animaciones».
  - Film de marca: 206 `video/mp4`, atribución de Kevin MacLeod y pista WebVTT de descripciones.
  - Los diez `.mp4` responden (206).
  - `/qr` → 307 a `/conoce?utm_source=qr…`; `/conoce/marcianos` → 404.
  - CLS al recorrer la página: teléfono 0, escritorio 0,026.
  - **El formulario no se envió en producción** para no crear un lead falso en REPI Admin; está cubierto por la E2E local.
  - El navegador sin GPU del smoke usa el SVG, como corresponde con WebGL por software. El 3D en dispositivos reales queda por ver con Speed Insights.
- **Próxima acción:** revisar en Speed Insights el LCP de campo de `/conoce` (objetivo ≤ 2,5 s) cuando junte visitas; si el 3D pesa en teléfonos de gama baja, bajar el nivel por defecto (D208).

## Smart Program Import 2.0 (D207) — 07/11/2026 · PUBLICADO Y VERIFICADO (#60, 3c2353c)

- **Pedido:** máster «REPI — Smart Program Import 2.0»: importar rutinas de cualquier formato sin reescribirlas ni inventar datos, con guardado seguro, para el alumno, el coach y el gimnasio. Deja preparado Adaptive Coaching 3.0. Detalle: `docs/SMART_IMPORT_2.md`.
- **Rama:** `claude/smart-import-2`, desde `main` `5e2c94d`.
- **Hecho:**
  - **Dominio:**
    - `packages/domain/src/program-import.ts`: texto, WhatsApp y planillas; tres estados por dato; valores por serie; libras; métodos; procedencia `ImportOrigin`.
    - `exercise-match.ts`: abreviaturas, plurales, inglés, paréntesis, guardia de variantes y alternativas.
  - **Servidor:**
    - `server/training/program-import.ts`: firma de archivo; determinístico primero; IA con esquema estricto y el documento como dato; emparejamiento validado; partir días largos con aviso.
    - `own-routines.ts`: `previewRoutineImport` y `saveImportedRoutines`, una transacción idempotente por `opId`.
    - `createTemplate(…, imported)`: idempotente por `opId`.
  - **Rutas:**
    - `/api/me/routines/import`, `/api/me/routines/import/save`;
    - `/api/coach/[orgId]/programs/import` y `programs` con `imported`;
    - `/api/gym/[orgId]/programs/import`.
  - **Interfaz:**
    - `components/shared/ProgramImport.tsx`: lectura con estado, cancelar y reintentar; revisión con filas compactas, faltantes, sugerido explícito, tabla por serie, alternativas, métodos y borrador en el teléfono.
    - `member/RoutineImport.tsx` (Mis rutinas) y `coach/ProgramImportModal.tsx`, en el constructor del coach y en el editor del socio en Gym.
    - Estilos `.pi-*` en `globals.css`.
  - **Archivos:** `lib/import-file.ts` (marca las planillas). El archivo original no se guarda.
- **Migración 0049, aditiva:**
  - `own_routine.origin` jsonb y el índice único parcial `(user_id, origin->>'opId', origin->>'day')`.
  - `scripts/operations/hosted-0049.sql`, `verify-0049.sh` (ensayada: aplicar, reintento que falla entero, revertir, reaplicar; huella de rutinas igual) y `scripts/rollback/0049_own_routine_origin.down.sql`.
  - El código actual de producción es compatible con 0049 aplicada: aplicar ANTES de integrar, con respaldo verde.
- **Pruebas:**
  - **Dominio:** 491 pruebas, entre ellas los fixtures de `packages/domain/fixtures/import/` (documentos ficticios: texto, WhatsApp, Excel de 3 hojas, foto de hoja impresa, captura de WhatsApp, PDF de 2 páginas).
  - **Web:** `tests/program-import.test.ts`, 13 pruebas de integración.
  - **QA visual con la demo local:** alumno, coach y gimnasio; corte de red simulado sin duplicar; borrador recuperable; oscuro; 320 px; axe sin violaciones.
- **Publicado:**
  - Respaldo `backup-20261107-034900-42335519371` (#61) verde.
  - 0049 aplicada con `hosted-0049.sql`: 50 migraciones; huella de las 6 rutinas reales idéntica (`dd6ab5fa…`); dueño `repi_app`; `postgres` sin SET; `repi_backup` lee la tabla.
  - CI verde y merge #60 → `3c2353c` en producción.
- **Smoke de producción (sólo cuentas demo) ✓:**
  - **Alumno:**
    - Texto con un ejercicio sin series: marcado, no inventado.
    - Corte de red simulado al guardar y reintento: 2 rutinas, sin duplicar; procedencia con `unknown` y `suggested`.
    - Excel de 3 hojas sin IA.
    - **Foto de hoja impresa leída con IA en producción:** 2 días y 8 ejercicios fieles a la foto (por serie, «fallo», 25 kg). «Curl femoral» sin datos marcado y «6?» dudoso.
  - **Coach:** programa nuevo sin asignar.
  - **Gimnasio:** importado al borrador sin guardar.
  - 0 errores de página.
  - Rutinas de usuarios reales importadas: 0.
- **Vercel:** la API sigue sin equipos visibles para esta sesión (no se leyeron los logs de runtime); la verificación fue independiente (navegador y base).
- **Próximo bloque:** REPI — Adaptive Coaching 3.0. El punto de integración es `own_routine.origin` junto con las sesiones y la versión vigente (ver `docs/SMART_IMPORT_2.md`, «Preparación para Adaptive Coaching 3.0»).









## REPI Commercial Sales Kit 2026 · dossier para gimnasios — 07/11/2026 · LISTO, SIN DISTRIBUIR

- **Pedido:** master prompt del titular «REPI Commercial Sales Kit 2026»: dossier premium para dueños de gimnasios y resumen de una página.
- **Dónde:** `marketing/dossier-gimnasios-2026/` (LEEME con instrucciones). PDF en `salida/`, vistas por página en `paginas/`, capturas reales de la demo en `capturas/`, fuente en `fuente/` (`generar.mjs`, `capturas.mjs`, `precios.json`), registro `FUNCIONALIDADES_VERIFICADAS.md`.
- **Hecho:** dossier A4 de 11 páginas y resumen A4; HTML/CSS → PDF con Chromium; Barlow/Barlow Condensed incrustadas; gráficos SVG calculados desde `precios.json` (400 × $200 = $80.000; 500 × $170 = $85.000; +25 % socios, −15 % precio, +6,25 % mensualidad, $5.000; $60.000 → $60.170 = 0,28 %); QR decodificado a `repiclub.com/conoce/gimnasios?utm_source=dossier…`; enlaces a WhatsApp y email oficiales (`lib/contact.ts`, D109). Opción `--ref`/`--asesor` para versiones por vendedor.
- **Revisión:** todas las páginas renderizadas e inspeccionadas; corregidos superposiciones y desbordes; afirmaciones contrastadas con el código (p. ej. la verificación en dos pasos es opcional, no obligatoria).
- **No verificado:** `repiclub.com` no es accesible desde este contenedor; el destino del QR se verificó contra la ruta publicada (D205) y en la build local (200).
- **Pendiente del titular:** aprobar el material antes de enviarlo; confirmar si los importes ilustrativos pueden circular así.

## REPI Sales Force & Commission OS 1.0 (D209) — 07/11/2026 · PUBLICADO (#63, 2b5e69f)

- **Publicado (con aprobación del titular):**
  - Respaldo `backup-20261107-130358-42375065427` (#67) verde.
  - 0050 aplicada con `hosted-0050.sql`: 51 migraciones; las 19 tablas con RLS y dueño `repi_app`; `commercial_lead.referral_code` y trigger de inmutabilidad presentes; `postgres` sigue sin SET ni herencia sobre `repi_app`; `repi_backup` lee las tablas nuevas.
  - CI verde y merge #63 (squash) → `2b5e69f`; `/api/version` en producción = `2b5e69f1dce3`.
- **Smoke de producción (sin datos):** `/ventas/activar/<token>` sirve la activación de vendedor; `/api/ventas/*` y `/api/admin/sales/*` sin sesión responden 401. No se crearon vendedores ni datos de prueba en producción. El recorrido completo con sesión de Admin (crear e invitar) queda para el titular: Admin › Vendedores › «Nuevo vendedor».

- **Pedido:** master prompt del titular «REPI Sales Force & Commission OS 1.0»: vendedores en todo el país con panel propio, CRM, registro de ventas, comisiones y liquidaciones, todo administrado desde REPI Admin y sobre los clientes y contratos reales.
- **Rama:** `claude/tender-cerf-0cm7r9`, rebasada sobre `main` `8cb0794`. Detalle completo en `docs/comercial/SALES_FORCE.md`; decisión D209 en `docs/DECISIONS.md`.
- **Hecho (bloques 1 y 2 completos, bloque 3 parcial):**
  - Dominio `packages/domain/src/sales.ts`: estados y capacidades del vendedor, pipeline con transiciones, duplicados, vista previa del cierre, planes (fijo, % primer cobro, % recurrente, por socio, híbrido, escalonado), motor idempotente `desiredEntries` + `diffLedger`, cortes por frecuencia.
  - Servidor `apps/web/src/server/sales/*`, API `/api/ventas/*` y `/api/admin/sales/*`.
  - Interfaz: `/ventas` (mobile-first, barra inferior), `/ventas/activar/[token]` (reutiliza `AccessFlow` y la guía PWA), `/ventas/liquidacion/[id]` (imprimible, «no es comprobante fiscal»), Admin › Ventas (panel, cierres, pipeline, comisiones, liquidaciones, solicitudes, material) y Admin › Vendedores (lista con filtros, paginación y acciones masivas; ficha completa).
  - Objetivos, material de ventas versionado con vencimiento, avisos internos (vendedor y Admin) y enlace personal `/conoce?ref=V-XXXXXX` (origen del contacto, nunca venta atribuida).
- **Tocado en código existente (sin cambiar comportamiento):**
  - `commercial/services.ts`: `createClientTx`, `addTermTx`, `publishTermNotice`; sincroniza comisiones al habilitar o suspender; no borra clientes con venta aprobada o comisiones; `createLead` guarda `referralCode` sólo de vendedores activos.
  - `commercial/payments.ts`: sincroniza comisiones al registrar o anular un pago.
  - `access/services.ts` (espacio «REPI Ventas»), `api/access/sign-up` (flujo `seller`), `AccessFlow.tsx` (activación de vendedor), `AdminApp.tsx` (dos entradas y «Pasar a ventas» en Contactos), `admin/page.tsx` (parámetros de aviso), `ContactForm.tsx` (`?ref=`).
- **Migración 0050 (aditiva, aplicada en producción el 07/11):**
  - 19 tablas nuevas, `commercial_lead.referral_code` y trigger de inmutabilidad de `commission_entry`.
  - `apps/web/scripts/operations/hosted-0050.sql` y `scripts/rollback/0050_sales_force.down.sql`.
  - Ensayo en base descartable local: huella igual a `migrate.ts`, RLS en las 19 tablas, dueño `repi_app`, reintento falla entero, reversión que se niega con datos, revertir y reaplicar.
  - Orden: respaldo verde → `hosted-0050.sql` → merge → smoke con datos `*.invalid`.
- **Pruebas:**
  - Dominio `sales.test.ts` (17 ✓); dominio completo 464 ✓.
  - Integración `tests/sales-force.test.ts` (13 ✓) sobre `repi_test` local: flujos A–J (alta e invitación, captación y duplicados, cierre con corrección y aprobación, aprobación concurrente única, habilitación, comisiones por cobros, reversión por anulación, inmutabilidad, liquidación idempotente con pago parcial y sin sobrepago, renegociación, desvinculación, aislamiento entre vendedores, reintentos, frecuencia, enlace personal, material).
  - Suite web completa: 75 archivos, 513 ✓ (antes de los últimos ajustes de interfaz); typecheck ✓, guardas ✓ (24), build ✓.
  - Navegador (build local + `repi_dev`, iPhone 13 y escritorio 1366): recorrido completo Admin ↔ vendedor sin errores de consola ni 5xx; accesos a Admin y a recursos ajenos 404 y auditados; sin scroll horizontal. El script quedó fuera del repo (usa `psql` sobre `repi_dev`).
- **Corregido en el camino:** abrir un modal desde la URL (`?deal=`, `?rep=`, `?p=`, `?b=`) rompía el render del servidor (`Modal` usa `document`): ahora se abre tras montar.
- **Decisiones pendientes del titular:** planes reales y moneda; regla de renegociación con otro vendedor (hoy el cobro va a la última venta aprobada vigente); visibilidad del responsable comercial sobre su equipo; evidencia como archivo y PDF del servidor; IA comercial (no implementada).
- **Ajuste 07/11 (pedido del titular tras probar en producción):** el selector de plan de la ficha estaba vacío porque no había planes, y el modelo pedido no existía. Se agregó la comisión «primer mes según socios» con tramos editables y el alta rápida «Crear y asignar» en la ficha. En el editor de planes se agregaron «Guardar y aprobar» y la opción de ocultar los archivados; en el teléfono, la lista de vendedores pasa a tarjetas y las fechas se muestran legibles. Recorrido completo en iPhone (oscuro) de Admin y vendedor sin errores ni scroll horizontal. Detalle en `docs/comercial/SALES_FORCE.md`.
- **Primera acción al retomar:** acompañar el alta del primer vendedor real (Admin › Vendedores) y cargar el primer plan de comisiones cuando el titular defina montos; revisar el buzón de envíos si la invitación no llega.

## Pedido de programa con preferencias (D206) — 07/11/2026 · PUBLICADO Y VERIFICADO (#58, 297a936)

- **Publicado:**
  - Respaldo `backup-20261107-010430-42321785844` (#57) y 0048 aplicada (49 migraciones; huellas de pedidos y tareas idénticas; `postgres` sin SET).
  - Merge #58 → `297a936` en producción.
- **Smoke de producción (sólo demos) ✓:**
  - Sin preferencias: 400 `brief_required`.
  - Pedido viejo simulado en el gym ficticio: aviso en la campanita; `/app?completar=programa` abre el formulario; completar → sin pendientes y aviso de Inicio fuera.
  - Sala muestra la tarjeta con preferencias; video de aliados y logo en `/conoce`; 0 errores.
- **Real:**
  - 8 socios con «Programa nuevo» abierto sin datos ya ven el aviso en Inicio y en la campanita.
  - El push sale una vez por pedido desde las 10 (Buenos Aires).
- **Video de aliados:**
  - Con locución de ElevenLabs (voz predeterminada «Eric»: el plan gratuito no permite voces argentinas por API) y fuente en `marketing/videos/aliados/`.
  - La clave está sólo en `~/.repi-secrets/elevenlabs.key` del contenedor. El titular la pegó en el chat: rotarla.
- **Pedido del titular:**
  - A los profes de Smart Center les llegaba «Quiero que me armen un programa.» sin nada.
  - Pidió preferencias obligatorias al pedir rutina y avisar a quienes ya pidieron sin completarlas, a nivel sistema.
- **Rama:** `feat/pedido-rutina-preferencias`, desde `main` `bec8bea`.
- **Hecho:**
  - **Dominio:** `packages/domain/src/program-request.ts` (validación, filas para el profe, resumen, precarga del asistente).
  - **Servidor:**
    - `server/training/program-request.ts` (pendientes, precarga, completar, recordatorio push).
    - Exigido en `createRequest` (coach), `createMemberTask` (gym) y `memberCreate` de Connect (`rutina_nueva`).
    - Ruta `/api/me/program-request`.
    - Aviso en la campanita (`feed.ts`) y push en el cron `notifications` (de 10 a 21, uno por pedido).
  - **Interfaz:**
    - `components/member/ProgramRequest.tsx` (formulario y aviso en Inicio; `/app?completar=programa` lo abre).
    - Connect «Necesito una rutina nueva» → formulario.
    - `components/shared/BriefBlock.tsx` en Sala (Connect), cola clásica y Solicitudes del coach.
    - `ProgramAssistant` precargado desde la ficha del socio.
  - **Demo:** Martina tiene un «Programa nuevo» con preferencias completas (ficticias).
- **Migración 0048 (aditiva, NO aplicada):**
  - `student_request.brief jsonb`.
  - `scripts/operations/hosted-0048.sql`, rollback y `verify-0048.sh` ✓ (huella igual, reintento falla entero, revertir y reaplicar).
  - Orden: respaldo → `hosted-0048.sql` → merge.
- **Pruebas:**
  - Domain `program-request.test.ts` (3 ✓).
  - gym y followup con D206: obligatoriedad, vista del equipo, precarga, aviso, push una vez y de día, completar sin duplicar, aviso a quien lo tomó, coach.
  - Pruebas anteriores actualizadas con preferencias (`tests/fixtures/brief.ts`).
  - Navegador local:
    - aviso en Inicio y en la campanita; validación; envío; el aviso desaparece y se guarda en el pedido;
    - Connect abre el formulario;
    - la tarjeta de Sala muestra las preferencias.
- **Privacidad:** las lesiones viajan sólo con el pedido (las ve quien lo atiende). No van a «lo que buscás entrenando» ni a lo compartido con otros.

## REPI Experience Hub (/conoce y /qr, D205) — 07/11/2026 · PUBLICADO Y VERIFICADO (#55, bec8bea)

- **Publicado:**
  - Con aprobación del titular («Te doy permisos para todo»).
  - Respaldo `backup-20261107-001833-42317208744` (#56) y 0047 aplicada (48 migraciones).
  - Merge #55 → `bec8bea` en producción.
- **Smoke de producción ✓:**
  - `/qr` 307 sin caché y redirección externa rechazada.
  - robots, sitemap, OG, video con Range 206.
  - Perfil, video, simulador, formulario y demo.
  - Contacto y eventos de prueba borrados después.
- **Después de publicar:**
  - 4 videos reales de la demo con subtítulos.
  - QR imprimible en `marketing/qr-remera/`.
  - Logo de Smart Center (autorizado) en «Caso real», que se publica con D206.
- **Pedido original:** master prompt «REPI Experience Hub»: landing comercial con QR permanente para la remera de los ATICMA Awards 2026.
- **Rama:** `feat/experience-hub`, desde `main` `163eb72`.
- **Qué hay** (detalle en `docs/comercial/EXPERIENCE_HUB.md`):
  - `/conoce` estática y `/conoce/{gimnasios,entrenadores,deportistas,aliados}`.
  - Selector de perfil, simulador con el motor real de Training Intelligence, 4 demos reales (`POST /api/demo`) y 12 funciones con capturas reales de la demo.
  - Caso Smart Center (sin cifras), pasos, preguntas frecuentes y formulario.
  - `/qr` y `/qr/<campaña>`: 307 sin caché a una lista cerrada de destinos.
  - `robots.txt` y `sitemap.xml`, imagen OG, enlace «Conocé REPI» en el pie del sitio.
  - REPI Admin › «Sitio y QR».
- **Archivos nuevos:**
  - Contenido y librerías: `src/content/conoce.ts`, `src/lib/{qr,site-events,site-track}.ts`.
  - Servidor y rutas: `src/server/site/{events,qr}.ts`, `src/app/conoce/**`, `src/app/qr/**`, `src/app/api/site/event/route.ts`, `src/app/{robots,sitemap}.ts`.
  - Interfaz: `src/components/conoce/*`, `src/components/admin/AdminSite.tsx`, `src/styles/conoce.css`, `public/conoce/{shots/*.webp,og.png}`.
- **Archivos tocados:** `db/schema.ts`, `server/commercial/services.ts` (`createLead`: partner, email o WhatsApp, origen), `api/access/lead` (antispam), `api/admin` (site), `api/cron/purge-media` (purga de eventos), `api/demo` (20 por hora por IP), `AdminApp.tsx` y `PublicSite.tsx` (enlace).
- **Migración 0047 (aditiva, NO aplicada en producción):**
  - `site_event` y `commercial_lead.{source,campaign,interest}`; el email deja de ser NOT NULL.
  - `scripts/operations/hosted-0047.sql`, rollback `scripts/rollback/0047_experience_hub.down.sql`.
  - Ensayo `verify-0047.sh` ✓: huella idéntica, RLS, sin permisos públicos, reintento que falla entero, reversión que se niega con contactos sólo de WhatsApp, revertir y reaplicar.
  - Orden: respaldo verde → `hosted-0047.sql` → merge → smoke.
- **Pruebas:**
  - `tests/experience-hub.test.ts` (10 ✓). Cubre QR sin redirección abierta, límite de escaneos, eventos con vocabulario cerrado y purga a 400 días, leads con WhatsApp y aliados, antispam y compatibilidad del formulario anterior, y Admin sólo con 2FA y separación QR/otros.
  - typecheck ✓, guards ✓, build ✓.
  - Navegador (build local + `repi_dev`, iPhone 13 y escritorio):
    - QR → `/conoce` con UTM; perfil y URL; WhatsApp precompletado; simulador; formulario con validación y confirmación; demo de alumno abierta; teclado; OG y canónica.
    - axe 0 serias o críticas; sin scroll horizontal; 0 errores de consola.
    - LCP 1,5 s en 4G lento.
- **Pendiente:**
  - Aprobación del titular y publicación.
  - Videos reales (guiones en `docs/comercial/VIDEOS_PENDIENTES.md`).
  - Autorización para el logo de Smart Center.
  - QR impreso definitivo de `repiclub.com/qr`.
- **Capturas:** regenerar con build local + `next start` (repi_dev) y el script de Playwright del bloque (viewport 390×844 a 2×, tema claro, píldora de la demo oculta). Convertir a WebP de 600 px.
- **Pedido aparte del titular (sin detalle todavía):** captura del panel «Sala» de Smart Center Gym (pedidos T-1009/T-1010 «Programa nuevo», aviso «Tomaste T-1008»). Pedí qué cambiar; no se tocó nada de eso.

## Historial de varios años completo y reanudable — 06/11/2026

Rama `fix/historial-varios-anios`, desde `163eb72` (PR #53 publicado). La prueba anterior de 4.800 series no cubría tres años: seguían los topes de 5.000 series en normalización y gráficos. Ahora se admiten 100.000 series y 1.000.000 de caracteres; superar el límite se rechaza sin habilitar una confirmación parcial. Los gráficos importados leen hasta 100.000 series recientes y señalan un corte real; no conservan sólo las primeras 5.000. Evolución agrupa con push para evitar copias cuadráticas.

Las fechas se resuelven globalmente antes de partir el texto. Las sesiones claras se leen localmente; sólo las desconocidas se transcriben, conservando el orden. Una sola anotación desconocida no envía tres años a OpenAI. Los textos largos usan un único borrador por partes (hasta cuatro peticiones simultáneas, 60 s por lectura de parte): cada parte guarda sólo sus series y huella, con bloqueo para fusionar resultados concurrentes. Un reintento consulta qué partes llegaron y continúa; confirmar queda bloqueado hasta finalizar todas. Cancelar descarta el borrador y una respuesta tardía no lo revive. Sin texto fuente en DB ni almacenamiento del navegador; el plan de lectura queda en memoria mientras está abierto el diálogo. JSON/stream existentes se conservan para archivos pequeños y CSV.

Pruebas locales: 39 de dominio y 42 de lector/cliente/trabajos (más integración DB en CI), TypeScript. Capacidad: 730 sesiones con fechas sintéticas distintas de 2023-01-01 a 2025-12-29, 21.900 series, última marca única retenida. Otra prueba repite el texto visible de la foto en fechas sintéticas: 8.030 series, sin completar el último `1` cortado de la imagen. Navegador móvil: 21.900 series, 16 partes, fallo transitorio, continuación sin repetir lo recibido, confirmación única y cancelación. La integración comprueba guardado y gráfico de 21.900 series de un mismo ejercicio para superar también el antiguo corte del gráfico.

No hay migración SQL ni dependencias nuevas: los borradores usan el JSON existente de `history_import`, con fase de lectura/revisión, índices y huellas por parte. No se pudo recuperar el texto real del tercero; la evidencia del formato proviene sólo de la foto. Antes de afirmar que está publicado, comprobar PR de esta rama, CI y `/api/version`; medir una demo aislada de tres años y quitar la importación de prueba.


## Importación rápida y destino de las notas — 06/11/2026

Rama `fix/importacion-rapida`, desde `f7f1f60` (corrección del recorte #52, ya publicada y verificada en repiclub.com). Notas claras con fecha se estructuran directamente, sin transcripción externa; las rutinas claras sin fechas van a la revisión editable de «Mis rutinas», sin guardado automático. Los formatos ambiguos conservan el lector completo. La salida IA agrupa repeticiones del mismo peso en arrays, con bloques de 12.000 caracteres y reintentos íntegros; evita generar un objeto por cada serie. Emparejamiento local por alias conservadores y fallback externo de hasta 5 s.

La lectura muestra progreso real por streaming (partes, relación de ejercicios, vista previa), conserva JSON para otros clientes y valida sesión, CSRF, límites y archivo antes de abrir el stream. Un error tardío o respuesta incompleta no muestra una vista previa válida. Al confirmar/quitar se refrescan los gráficos y se abre todo el período para mostrar importaciones antiguas. Los ejercicios reconocidos alimentan progreso y cargas iniciales existentes; no se modifican programas de coach ni se convierte el historial fechado en rutinas.

Pruebas locales: 40 de dominio y 18 de lector/stream; TypeScript correcto. Benchmark del parser solo, sin red/DB: 72.000 caracteres y 4.800 series en 60,58 ms (una ejecución). Chromium escritorio/móvil: etapas reales, dobles clics, confirmación/eliminación, recuperación de error tardío y rutina sin fechas a revisión, sin guardar automáticamente. Regresiones de DB añadidas para gráficos/cargas iniciales y rutina directa; las ejecuta CI en base descartable. Sin nuevas dependencias ni migración SQL; `source: notes` amplía sólo el tipo de una columna de texto existente.

Estado: código preparado para CI, integración y publicación dentro de la autorización vigente del titular. Primera acción al retomar: comprobar PR de esta rama y versión en `/api/version` antes de repetir cambios.


## Corrección puntual: historial pegado completo — 06/11/2026

Rama `fix/historial-texto-completo`, desde `2afc599`. Se quitaron los recortes silenciosos de 60.000 caracteres del textarea y de la lectura IA. El máximo existente de 400.000 se valida sin recortar lo pegado. Las notas largas se leen por bloques con contexto de fecha/año/ejercicio; si la salida IA se corta, se relee ese bloque en partes menores. Un fallo no crea una vista previa parcial. La ruta dispone de 300 s (lectura hasta 240 s). La revisión y confirmación existentes se conservan.

Archivos: `HistoryImport.tsx`, ruta `api/me/history-import`, `server/training/history-import{,-read}.ts`, cliente `server/ai/openai.ts`, dominio `history-import.ts` y sus pruebas. Sin migraciones ni cambios de dependencias.

Verificación local: 14 pruebas de dominio y 6 de lectura IA simulada, TypeScript de dominio/web y build Next correctos. Build con configuración ficticia local, sin conexión a datos reales. Chromium escritorio/móvil con el componente real y API simulada: 98.039 caracteres enviados íntegros, incluido el último `17;16;13`; 400.013 conservados y rechazados con aviso, sin POST. No se ejecutó la suite de integración con DB, OpenAI real ni Safari físico. El harness temporal no forma parte del repositorio.

Estado posterior: PR #52 integrado como `f7f1f60` y publicado; Vercel en verde y `/api/version` = `f7f1f600408d`. Safari físico sigue sin probar.


## Personal Progress & Body Tracking 1.0 (D199–D204) — 06/11/2026 · PUBLICADO Y VERIFICADO

**Producción:** `fe469cb05991` (repiclub.com `/api/version`). Vercel en verde para `8efa596` (#43), `c99b582` (#45) y `fe469cb` (#46). La conexión MCP de Vercel sigue con 403 para el equipo, así que el estado se verificó con los estados de despliegue en GitHub y `/api/version`.

### Publicación (autorizada por el titular)
1. **Respaldo previo:** issue #44 → corrida 42143409784 en verde → `backup-20261106-012447-42143409784`.
   - 104 tablas, 7268 filas, 46 migraciones y 1 archivo de Storage.
   - Cifrado con la clave del titular; descifrado, hashes del manifiesto y restauración en PostgreSQL descartable: 278 claves foráneas sin huérfanos y 0 restricciones sin validar.
   - Señal al vigilante registrada (01:24 UTC): `armed: true`.
2. **0046 aplicada** (~01:27 UTC) con `hosted-0046.sql`, en una transacción como `repi_app`.
   - 47 migraciones; la última es `322f74f7…` (`when` 1793922541616), sin hashes duplicados.
   - Las 5 tablas son de `repi_app`, con RLS sin `FORCE`. `anon` y `authenticated` no tienen permisos; `repi_backup` sólo lectura (privilegios por defecto).
   - Columnas, las 25 restricciones (todas validadas) e índices: hash idéntico al de la base local migrada desde el código.
   - RLS en las 109 tablas de `public`. El permiso temporal de `postgres` sobre `repi_app` quedó revocado.
3. **Huella de datos reales** (sin demos), igual antes y después de migrar y después de todas las pruebas (13:30 UTC):
   - `set_log` 217 y `workout_session` 22 (los anteriores a la publicación);
   - programas 41, versiones 64 y objetivos de Training Intelligence 94, con hashes idénticos.
   - Ninguna persona real tiene peso, fotos ni novedades: 0 novedades en la base.
4. **PR #43 integrado** (squash) como `8efa596`.
   - Incluye D203 y el commit `062f5dc`, con el respaldo en partes y el tope de Storage (LB-11).
   - CI y autoprueba en verde. La autoprueba ensayó 3 partes, la restauración y el rechazo de una parte alterada o faltante.
5. **PR #45** (`c99b582`): `calories`, `progress_photos` y `announcements` encendidos por defecto.
   - Una prueba suponía que vacío = apagado; ahora apaga el módulo explícitamente, sin cambiar lo que verifica.
   - La primera corrida de CI se colgó 25 min creando la base del runner. No se pudo relanzar (403 de la integración), así que el CI corrió con el commit de documentación de LB-11 y quedó en verde.
6. **Hotfix #46** (`fe469cb`): la subida de fotos quedaba colgada en producción.
   - La comprobación posterior a la subida (`probeObject`) leía por la URL firmada del proxy. Esa URL ignora `Range` y responde 200 con el archivo entero; cortar la lectura con `reader.cancel()` colgaba la función dentro de Next.
   - Reproducido con `next start`, la base local y un proxy falso: más de 30 s antes, 85 ms después.
   - Arreglo: `AbortController`, `cache: "no-store"` y 15 s como máximo. Las lecturas privadas también van sin caché. Corrige también la confirmación de subidas directas de videos.
   - Prueba `tests/storage-probe.test.ts`; documenta el contrato, porque el cuelgue sólo aparece dentro de Next.

### Smoke productivo (sólo demos `is_demo`, Chromium emulado, Pixel 7 y escritorio)
El script está fuera del repositorio (scratchpad de la sesión).

- **Alumno:**
  - Entrenar una serie y finalizar (completed); la sesión aparece en el historial.
  - Progreso con sus secciones y el resumen del período.
  - **Gráfico de Press de banca idéntico a la base:** series, repeticiones, volumen, carga máxima y e1RM Epley de las 3 sesiones, con el récord en la correcta.
  - Peso 82,4: guardar dos veces el mismo día no duplica. Objetivo 78 kg y gráfico con su línea.
  - axe sin violaciones serias ni críticas y sin scroll horizontal.
- **Calorías:**
  - Sin peso: `no_weight`, sin peso supuesto.
  - Con un peso de hace 40 días: 360–440 kcal para 52 min × 83,6 kg × MET 5–6 (RPE 8). El cálculo a mano da 362–435, redondeado a 10.
  - El historial muestra el rango y la advertencia.
- **Fotos (después del hotfix):**
  - Subir 2 (≤ 2048 px y el archivo entregado sin EXIF) y `cache-control: no-store`.
  - Comparador con deslizador y borrado.
  - Coach y dueño de gimnasio: 404 en la foto y en el borrado. Sin sesión: 401. `/api/media` la niega.
- **Edad desconocida → menor:**
  - Se usó una demo con la fecha vaciada (persona ficticia, en una transacción como `repi_app`, con el permiso revocado al terminar).
  - Mi cuerpo muestra «Confirmá tu fecha de nacimiento» y el peso responde 403 `age_required`.
  - Al confirmar una fecha de menor: peso y objetivo responden 403 `minor_restricted`, un segundo cambio de fecha 409 `already_set` y entrenar 200.
  - Auditoría `account.birth_date_declared` con `{"eligibility":"minor"}`, sin la fecha.
- **Urko (coach):** aprobar un reemplazo cierra el panel con el aviso, `aria-expanded` vuelve a false, cambiar de día no deja paneles abiertos y quitarlo deja el programa igual.
- **Novedades:**
  - Campanita del alumno, «Novedades de REPI» del coach y del gimnasio: 200 y sin elementos, porque no se publicó nada.
  - REPI Admin niega el panel a un coach.
  - **No se publicó ningún anuncio de prueba.** `postgres` no puede escribir `product_announcement` (es de `repi_app`); el caso borrador está cubierto por la integración.
- **Gimnasio y autenticación:** el panel del dueño carga; sin sesión, `/api/me/*` responde 401.

### Pendientes y observaciones
- **Dos archivos huérfanos de demo en Storage** (`progress/YyA7…/af952c1d…` y `…/d71bcd0b…`, 31 KB): son de las subidas colgadas antes del hotfix, no tienen fila en la base y no entran en los respaldos. La purga sólo recorre `media_object`, así que no los borra. Se pueden borrar desde el panel de Supabase (bucket `repi-private`) o con un barrido de huérfanos del bucket (pendiente menor).
- **Respaldo posterior a la publicación: verificado.**
  - Issue #47, corrida 42226052535: se cortó a los 40 min en «PostgreSQL descartable y age», porque `apt-get update` del runner no respondió. No llegó a leer la base, la credencial temporal quedó revocada y se abrió la alerta #49.
  - El mismo problema del runner colgó un CI de #45 a las 01:43.
  - Reintento (issue #50, corrida 42231737229) en verde: `backup-20261106-141405-42231737229`, con 109 tablas, 47 migraciones, 4 archivos de Storage, 286 claves foráneas sin huérfanos y 0 restricciones sin validar.
  - Cerró la alerta #49. El vigilante registró la señal OIDC (14:14 UTC).
  - La retención («último de cada día») reemplazó el respaldo previo a la 0046 por este.
  - **Mejora sugerida:** límite y reintento para `apt-get` en `backup.yml`, para que un espejo caído falle rápido y se reintente.
- **Cronograma del respaldo:** no hubo ejecución `schedule` el 06/11 hasta las 14:15 UTC. Sigue pendiente la acción del titular (Disable/Enable del workflow).
- **Script temporal en `main`:** `apps/web/.tmp-fetch.mjs` (5 líneas, sin secretos) entró por error en #45 y se quitó en #48.
- **Clave antigua del vigilante** (`BACKUP_HEARTBEAT_SECRET` en Vercel): pendiente independiente, sin tocar.
- **Vercel MCP:** 403 en el equipo `manuel-cosovschis-projects`. Hace falta que el titular autorice el acceso del conector para ver logs de ejecución.
- **Storage:** tope de 800 MB de archivos vigentes y 150 MB por persona (D204). Para crecer, plan Pro de Supabase (decisión de gasto del titular).
- **Prueba intermitente** `tests/gym.test.ts` «métricas desde eventos reales» (P2): sin cambios.

**Próximo bloque:** REPI — Smart Program Import 2.0 (no empezado).

## Personal Progress & Body Tracking 1.0 — registro de la revisión previa (histórico; ya publicado, ver arriba)

**Documento principal:** `docs/PERSONAL_PROGRESS_BODY_TRACKING_1.md`. Tiene arquitectura, modelo, privacidad, metodología de calorías, fotos, novedades, Urko, pruebas, costos, publicación y reversión.

**Rama:** `feat/repi-personal-progress-1`, desde `main` `8f158b1`. **PR #43**, con CI en verde («check» y la autoprueba del respaldo, en `3d7a414`). **No integrar sin autorización del titular.**

**Producción:** sin cambios. Sigue en `8f158b1`, con 46 migraciones, sin 0046 y sin deploy.

**Corrección pedida en la revisión (D203, 06/11):**
- **Problema:** `isMinor()` devolvía false sin fecha de nacimiento, así que una cuenta de edad desconocida accedía a peso, fotos y calorías.
- **Ahora:** la elegibilidad tiene tres estados (adulta, menor, desconocida); la desconocida nunca se supone adulta. La persona confirma su fecha una vez (`POST /api/me/birth-date`); no reemplaza una existente, y una fecha de menor activa el flujo del adulto responsable. Entrenar no se bloquea.
- **Impacto real**, medido en producción con un conteo de sólo lectura: 16 de 54 cuentas que no son demo no tienen fecha. Verían «Confirmá tu fecha de nacimiento» en Mi cuerpo y Fotos.
- **Demos:** adultas ficticias con fecha registrada.
- **Pruebas:**
  - dominio 400/400;
  - integración 436/436 (4 nuevas de edad);
  - E2E de Personal Progress 12/12 (1 nueva de edad desconocida);
  - guardas 24/24, typecheck OK y ensayo de 0046 OK.

**Qué agrega:**
- **Progreso con secciones:** Entrenamiento · Mi cuerpo · Fotos · Historial.
  - Resumen del período, útil desde la primera sesión.
  - Evolución por ejercicio: 1RM estimado, carga máxima, reps con esa carga, volumen; reps para peso corporal y tiempo para series por tiempo.
  - Récords contra todo el historial. Gráfico SVG sin librerías, con dato exacto al tocar y vista de registros.
- **Mi cuerpo:**
  - Peso en gramos, una medición por día (guardar otra ese día la reemplaza), edición y borrado.
  - Objetivo con punto de partida (primera medición o histórico).
  - Recorrido hacia la meta sin porcentajes absurdos, y gráfico con línea de objetivo.
  - Privado del dueño. No disponible para menores de 18.
- **Calorías:** rango con MET del Compendium × peso del día × tiempo activo. Aparecen al terminar y en el historial. Interruptor `calories` **apagado**.
- **Fotos privadas:**
  - Re-codificadas en el teléfono, tipo real y EXIF/GPS quitados en el servidor, guardado verificado.
  - Comparador lado a lado y deslizador.
  - Borrado con reintento por la purga. Interruptor `progress_photos` **apagado**.
- **Novedades de REPI:**
  - En la campanita del alumno (sello REPI y destino exacto) y en «Novedades de REPI» de coach y gimnasio.
  - Lectura por persona y anuncio. REPI Admin crea borradores, previsualiza, publica o programa y archiva.
  - Interruptor `announcements` **apagado**.
- **Urko:** el panel de reemplazos se cierra al guardar (confirmado por el servidor) y no queda abierto al cambiar de programa, socio o día; con error queda abierto para reintentar.
- **Seguridad:** pedidos al coach y tareas del gimnasio aceptaban cualquier archivo propio por id; ahora sólo `request_video`. Una foto de progreso no puede terminar visible para otro.

**Migración 0046 (aditiva, NO aplicada):** 5 tablas con RLS: `body_weight_entry`, `body_goal`, `progress_photo`, `product_announcement` y `announcement_read`.
- Archivos: `drizzle/0046_personal_progress.sql`, `scripts/operations/hosted-0046.sql`, `scripts/rollback/0046_personal_progress.down.sql` y `scripts/operations/verify-0046.sh`.
- Ensayo en `repi_verify_0046` (copia de `repi_dev`):
  - huella de `set_log`, `workout_session`, `program_version`, `media_object`, `member_notice` y `user_pref` idéntica antes y después;
  - 47 migraciones con el hash del archivo; RLS, dueño `repi_app` y sin permisos para `anon`;
  - restricciones: un peso por día, rango y fecha de publicación;
  - el reintento falla entero y no deja nada;
  - la reversión se niega con datos de personas, revierte limpia sin ellos y la reaplicación da OK.

**Pruebas (aislado):**
- Typecheck y build: OK.
- Dominio: 399/399 (36 archivos, +28 nuevas).
- Guardas: 24/24.
- Integración completa: 432/432 (65 archivos; nuevas `personal-progress.test.ts` 19 y `urko-subs-panel.test.ts` 5).
- E2E nuevas (`e2e/personal-progress.spec.ts`): 10/10 en Pixel 7 y escritorio, con axe y sin scroll horizontal.
- **E2E completa** (servidor local con los tres interruptores encendidos): 127 pasaron, 0 fallaron, 29 omitidas por diseño del proyecto.
  - En la primera pasada fallaron 19 por el entorno local: `repi_dev` llegó al tope de 300 demos (503 «Hay muchas demos abiertas»), y una prueba lee `apps/web/.env.local`, que no existía en el contenedor.
  - Se purgaron las demos sólo en `repi_dev` y se creó un `.env.local` temporal (ignorado por git) apuntando a `repi_dev`. Con eso las 19 pasaron sin cambiar ninguna prueba.
  - Única prueba existente adaptada: `experience-ux.spec.ts` abre ahora la sección «Historial» de Progreso.

**Rendimiento:** dev con 28.925 series: < 1 ms por consulta. Persona sintética con 18.000 series: 24 ms por ejercicio y 40 ms la lista. Sin índices nuevos.

**Prueba intermitente `tests/gym.test.ts` «métricas desde eventos reales» (06/06):**
- Pasó en la corrida completa de hoy.
- Causa probable sin reproducir: la ventana de métricas usa `completedAt < now` estricto con el mismo reloj que sella la tarea. Una tarea completada en el mismo milisegundo que la consulta, o un ajuste del reloj del runner hacia atrás, quedaría afuera (2 en vez de 3).
- **Intermitente:** 15 corridas seguidas aisladas, 15 pasaron, más la corrida completa en verde. No se reprodujo. No se cambió la expectativa ni el código: sigue P2, con la hipótesis anotada.
- Si vuelve a fallar, comparar `completed_at` de la tercera tarea con el `now` de `performanceCenter`.

**Próxima acción (titular):**
1. Revisar el PR.
2. Respaldo «Respaldo: antes de 0046».
3. Aplicar `hosted-0046.sql`.
4. Integrar y desplegar.
5. Smoke con demos.
6. Encender `calories`, `announcements` y `progress_photos` de a uno (§14 del documento).
7. Decidir LB-11 (Storage y respaldo para fotos).

## Publicación del bloque 06/06 — 05/11/2026 · PUBLICADO Y VALIDADO (autorizado por el titular)

**Producción:** `ab4e1adcb307` (`/api/version`). Deploy READY a las 21:06:43 UTC, ~1 min después del merge squash del PR #36.

**Antes de integrar:**
- PR al día con `main` (base `70e7779`), sin conflictos y sin migraciones (ningún archivo de `drizzle/` ni `schema.ts` en el diff).
- CI y autoprueba del respaldo en verde.
- Respaldo cifrado nuevo: issue #37 → corrida 42108774553 → `backup-20261105-210336-42108774553`. Contiene 104 tablas, 3645 filas, 46 migraciones y 1 archivo. Se descifró, se compararon los hashes y se restauró en PostgreSQL descartable: 278 claves foráneas sin huérfanos y 0 restricciones sin validar. Por retención reemplazó al de las 14:42 (queda el último de cada día).

**CSRF y solicitudes legítimas:**
- Ninguna integración escribe en rutas con `handle()` desde fuera del navegador: los cron usan GET con secreto, la señal del respaldo tiene su propia ruta, el service worker sólo hace GET y no hay webhooks.
- La autenticación (`/api/auth/*`) está fuera de `handle()`.
- Safari no se pudo probar acá (no hay WebKit en el contenedor). Por el estándar Fetch envía `Origin` del propio sitio en cada POST. Se confirma en el iPhone (paso 4 de la lista de teléfonos).

**Smoke productivo con demos (10 pasaron, 0 fallaron; 6 omitidas por diseño de proyecto):**
- Alumno en Pixel 7: sesión, series, descanso, cambio de ejercicio, recarga, doble toque (1 serie), sync, fin, historial corregible, anulación y restauración.
- Offline en producción, en teléfono y escritorio: el servidor se mantiene en 0 sin red, recargar sin red recupera las 2 series, al reconectar llegan exactamente 2 y no hay duplicados.
- Guía «Tu profe indicó», escalera de cargas, coach (ficha, editor, vista previa de sólo lectura, 404 a lo ajeno), equipamiento del gimnasio (alta, edición, archivo, 404 a otra organización) y cardio en minutos y segundos.
- CSP y Permissions-Policy presentes.
- POST desde otro origen: 403 con y sin sesión, y `Sec-Fetch-Site: cross-site` 403. La misma escritura desde REPI: 200.
- `get-session` 200 y credenciales inválidas 401.
- Búsqueda pública: 3 sedes, las 3 reales y 0 demos (cotejado en la base).
- Señal del vigilante sin secreto: 404.
- axe sin violaciones serias en las pantallas recorridas.
- Sin errores en los logs de Postgres ni de Edge Functions (21:00–21:15).
- La tarea de cada minuto responde 200; a las 21:07 corrió el vigilante: `{"armed":false}`.

**Integridad histórica (sólo lectura):** las filas reales previas a las 21:04:43 están idénticas después del deploy:
- `set_log`: 196, mismo hash.
- `program_version`: 64, mismo hash.
- Objetivos abiertos: 28, mismo hash.
- Un entrenamiento real salió del conjunto «previo» porque su dueño lo terminó a las 21:04:37 (24 series intactas): es actividad legítima, no un cambio del deploy.

**Vigilante de respaldos (D198): ACTIVO desde el 05/11/2026 23:07 UTC.**
- La señal se autentica con el token OIDC del job de GitHub (PR #40, `26f7cdc`): audiencia `repi-backup-heartbeat`, `backup.yml` en `main`, misma corrida. No hace falta ningún secreto en GitHub.
- `BACKUP_HEARTBEAT_SECRET` está en Vercel y se sigue aceptando. Su valor pasó por el chat: conviene borrarlo de Vercel, porque el vigilante funciona sólo con OIDC.
- **Prueba:** issue #41 → corrida 42125410178 → `backup-20261105-225638-42125410178`. Contiene 104 tablas, 7655 filas y 46 migraciones. Se descifró y se restauró en PostgreSQL descartable: 278 claves foráneas sin huérfanos.
- `audit_event` `backup.verified` registrado a las 22:56:43 con `source: oidc`.
- Revisión de las 23:07: `{"armed":true,"late":false}`. 0 alertas enviadas.

## Bloque 06/06 · Final Release Hardening (D197, D198) — 05/11/2026 · PUBLICADO (ver arriba)

**Documento principal:** `docs/FINAL_RELEASE_HARDENING_06.md`. Incluye la matriz por requisito, los hallazgos, las pruebas, el rendimiento, la infraestructura y sus costos, la lista de teléfonos, los pendientes legales y el veredicto por etapa.

**Estado de producción:** `70e7779` (hotfix #35, D196) desde las 18:32 UTC. Vercel tardó ~29 min en desplegar el merge; la causa no se pudo ver sin acceso al equipo (LB-09). Primera purga con la lógica nueva: 06/11 06:30 UTC.

**Rama:** `feat/repi-release-hardening-06`, desde `70e7779`. Sin migraciones. **Integrado con autorización del titular** (PR #36, squash `ab4e1ad`).

**Cambios:**
- `src/server/access/http.ts`: `crossSiteWrite()` en `handle()` (CSRF, D197).
- `next.config.ts`: CSP mínima y Permissions-Policy.
- `src/server/access/services.ts`: la búsqueda pública de sedes excluye demos (en producción mostraba 33).
- `src/lib/offline/store.ts`: `mergeIntel()` extraída de `Workout.tsx` sin cambiar el comportamiento (regresión del hotfix #26).
- `src/server/ops/backup-watch.ts`, `src/app/api/cron/backup-heartbeat/route.ts` y un paso en `/api/cron/notifications` (minuto 7): vigilante de respaldos (D198).
- `.github/workflows/backup.yml`: paso «Señal de respaldo verificado». No hace nada sin el secreto.
- Pruebas nuevas:
  - `tests/csrf.test.ts`
  - `tests/workout-ladder-client.test.ts`
  - `tests/backup-watch.test.ts`
  - un caso en `tests/sandbox.test.ts`
  - `e2e/api-auth-sweep.spec.ts`
  - `e2e/offline-reload.spec.ts`
- Docs:
  - `FINAL_RELEASE_HARDENING_06.md`
  - `RESPALDOS.md` (vigilante, RPO y RTO)
  - `RELEASE_READINESS.md` (encabezado)
  - `LAUNCH_BLOCKERS.md` (LB-05 actualizado y LB-08 a LB-10 nuevos)
  - `DECISIONS.md` (D197, D198)

**Pruebas (aislado):**
- Typecheck y build: OK. **No hay linter** en el proyecto (D-06).
- Dominio 371/371 y guardas 24/24.
- Integración completa en verde.
- E2E: 115 pasaron, 29 omitidas, 0 fallaron.
- `offline-reload` y `connected-stages` 12/12 repetidas.
- Carga con 5, 20 y 50 usuarios virtuales: 0 errores.

**Datos reales tocados (autorizado por el titular en el chat):** sólo la publicación del Club con la foto purgada (`status = removed`) y un aviso de disculpas a su dueño. Ver «Cierre del bloque 05/06».

**Para el titular:**
1. Aprobar el acceso de Claude al equipo de Vercel (LB-09).
2. Armar el vigilante: `BACKUP_HEARTBEAT_SECRET` en Vercel y en GitHub (`docs/RESPALDOS.md`).
3. Teléfonos reales (lista en §13 del documento).
4. Planes Vercel Pro y Supabase Pro (≈ USD 45/mes) antes de la expansión.
5. Decidir sobre la 2FA de Admin (LB-10).
6. Abogado (§19).
7. Cuentas de prueba vinculadas (un coach y un alumno, y un dueño con un socio en una sede de prueba) para verificar en producción el caso Urko y el equipamiento.

**Pendientes técnicos:**
- E2E en CI (D-05).
- Sumar ESLint (D-06).
- `theme-admin` sin correr: falta el Admin de prueba local.
- `search_path` de `gym_task_event_immutable` en la próxima migración.
- Índices de claves foráneas antes de crecer.
- Validar la sesión antes del cuerpo en las rutas que dan 400 sin sesión (P3).
- **Prueba intermitente nueva (P2):** `tests/gym.test.ts` «métricas desde eventos reales» falló una vez en CI.
  - Dónde: PR #42, sólo documentación, 05/11 23:09 UTC. Esperaba `req` 3 y recibió 2.
  - Pasó en el CI de `main` 20 minutos antes con el mismo código y 11/11 en local.
  - `req` cuenta tareas con `completedAt` entre `now − 7 días` y `now`; la causa todavía no está identificada.
  - No se cambió la expectativa. Investigar antes de sumar E2E a CI.

## Cierre del bloque 05/06 (D195) y respaldos (D190) — 05/11/2026 · PUBLICADO Y VALIDADO

**Producción:** `b9ef4d1a610e` (repiclub.com `/api/version`, 13:54 UTC), con los hotfixes #30 y #32 de abajo. El smoke del bloque se hizo sobre `83f0140` (`dpl_DCkSW9BkLDXaASdjyLbWDC5x1WJp`), cuyo código de la app es el de `95e2831` (#26).

### Publicación (hecha por la sesión anterior, verificada hoy)
1. **Respaldo previo:** issue #25 → corrida 23 en verde → release `backup-20261105-040245-41965097791` (101 tablas, 7272 filas, 267 claves foráneas sin huérfanos, 0 restricciones sin validar).
2. **0045 aplicada** con `hosted-0045.sql`. Verificado hoy, sólo lectura:
   - Un único registro (id 46), hash `36cdc6b5…` igual al SHA-256 de `drizzle/0045_experience_ux.sql`, último aplicado, sin hashes duplicados; 46 migraciones en la base y en el código.
   - `gym_equipment`, `gym_equipment_exercise` y `training_correction`: dueño `repi_app`, RLS sin `FORCE`, sin permisos para `anon` ni `authenticated`; `repi_backup` sólo `SELECT`.
   - Columnas `voided_at`, `voided_by`, `void_reason` (NULL) en `set_log` y `workout_session`; `user_pref.hints` `jsonb NOT NULL DEFAULT '{}'`.
   - Los 5 índices y las 11 claves foráneas de la migración, todas validadas. RLS en las 104 tablas de `public`; 0 restricciones sin validar en `public`.
   - El permiso temporal de `postgres` sobre `repi_app` está revocado (sólo queda la membresía automática de creación: `supabase_admin`, sin `INHERIT` ni `SET`).
   - Asesor de seguridad de Supabase: sólo los avisos de siempre (RLS sin políticas, por diseño: la app es dueña y `anon` no tiene permisos; `gym_task_event_immutable` con `search_path` mutable, anterior a 0045).
3. **PR #24 integrado** (squash) como `719bb94`, desplegado 04:08 UTC (`dpl_GHYqW8CvNhP31ea4ozuMSrpnUeQp`).
4. **Hotfix PR #26** (`95e2831`, `dpl_An5Q94UDmt3z6DmFANHAwpMMv858`, 11:30 UTC): el refresco de objetivos de una sesión recién iniciada ahora también copia `ladder`. Sin prueba de regresión propia (ver pendientes).
- **Reversión del código:** promover en Vercel `dpl_GHYqW8CvNhP31ea4ozuMSrpnUeQp` (sin el hotfix) o `dpl_8PNnKSMwUHkqzrnpDFEc6jEM1GTz` (`9e18035`, antes del bloque). El esquema puede quedar: el código anterior no lee nada de 0045.

### Respaldo diario (PR #27)
- **Problema:** GitHub no creó la ejecución programada del 05/11 a las 06:17 UTC. En todo el repositorio hay 0 ejecuciones con evento `schedule`; los respaldos por issue funcionan.
- **PR #27** (`83f0140`, squash, autorizado por el titular):
  - Segundo turno `47 12 * * *` (09:47 Buenos Aires). Sólo respalda si ese día (UTC) no hay ya un respaldo con «Motivo: diario» publicado y verificado.
  - Los respaldos por issue o manuales no pasan por esa regla: siempre corren y no cuentan como diario.
  - **Defecto encontrado en la revisión y corregido en el mismo PR:** `created_at` de un release es la fecha del **commit** de destino, no la del respaldo (`backup-20261105-040245` tiene `created_at` 00:03 y `published_at` 04:02). Con main sin commits nuevos, el turno de reserva iba a repetir el diario y la retención iba a agrupar todos los diarios en un solo «día» y borrar los anteriores (simulado con 5 diarios: borraba 3). Ahora la detección y la retención usan `published_at` (los borradores, `created_at`).
  - Cifrado, permisos, alertas y reglas de retención sin cambios. CI y autoprueba en verde en `7f96556`.
- **Estado del cronograma: NO funciona todavía.** Ambos cron están en `main` y el workflow está activo, pero GitHub **tampoco creó** la ejecución de las 12:47 UTC (comprobado a las 13:20: 0 ejecuciones `schedule` en todo el repositorio desde que existe el workflow).
  - **Hipótesis, sin comprobar:** todos los commits que tocaron `backup.yml` (#9, #10, #14, #27) entraron por merges hechos con la integración de GitHub (committer `web-flow`, sesión de Claude). GitHub atribuye el cronograma a quien modificó el cron por última vez; si ese cambio llega por un token de aplicación, el planificador puede no dispararlo. No es un descarte por carga: no hubo ni una sola ejecución en dos días y cuatro turnos posibles.
  - **Acción del titular (no la puede hacer la integración):** en GitHub, Actions → Respaldo → «…» → **Disable workflow** y después **Enable workflow**, desde su navegador. Eso vuelve a registrar el cronograma a su nombre. Si al día siguiente sigue sin haber ejecuciones `schedule`, usar un disparador externo (ver docs/RESPALDOS.md).
  - **Copia del día:** el issue #28 **falló** (corrida 42034952448, «firma de lectura falló (404)»): `backup.ts` pedía el archivo de cada fila de `media_object`, incluida una foto del Club que la purga diaria de las 06:41 UTC había borrado de Storage. Desde esa purga **ningún respaldo podía completarse**. Alerta #29 abierta por el workflow.
  - **Arreglo:** PR #30 (`67c8f7c`): `backup.ts` copia sólo archivos vigentes (`deleted_at is null`) y `purgeMedia` ya no trata como huérfanas las fotos de `club_post` y `club_profile`. Prueba de regresión en `tests/club-profile.test.ts`.
  - **Reintento:** issue #31 → corrida 42038583479 en verde → `backup-20261105-134716-42038583479` (104 tablas, 8634 filas, 278 claves foráneas sin huérfanos, 0 restricciones sin validar, 1 archivo con hash correcto). Cerró la alerta #29. #28 cerrado como duplicado de #31. Una ejecución manual garantiza una copia reciente, **no** demuestra el cronograma.
  - **Retención:** al publicar el de las 13:47 borró `backup-20261105-040245-41965097791` (previo a la 0045), según la regla «último de cada día». Siguen `backup-20261104-234215-41935448423` (último del 04/11, 30 días) y `backup-20261104-140210-41843251047` (primero de noviembre, 4 meses).
- **Último respaldo verificado:** `backup-20261105-134716-42038583479` (por issue, 13:47 UTC). No hay alertas abiertas.
- **Foto del Club borrada por la purga (dato real):** decisión del titular (05/11): no recuperarla. La publicación se quitó como lo hace la app (`club_post.status = removed`, sólo esa fila) y su dueño recibió un aviso con disculpas (`member_notice`, `club_notice`; no tiene push). Se hizo en una transacción con `set local role repi_app`, como las migraciones; al terminar la pertenencia de `postgres` a `repi_app` quedó igual que antes. Para deshacer: volver la fila a `visible` y borrar ese aviso. El script `restore-media-file.ts` (PR #34) queda sin uso. **D196:** la purga ahora protege cualquier archivo que alguna tabla referencie.

### Recuento de `set_log` 1422 → 172: explicado, sin pérdida de datos reales
- **1422** es el total del respaldo del 05/11 a las 04:02 (log de la corrida 23), con **10 demos abiertas** en ese momento. **172** son las series de usuarios reales (correo que no termina en `.invalid`) hoy. A las 12:24 el total era 680 = 172 reales + 508 de las 4 demos abiertas desde las 11:32.
- **Evidencia de que los reales están completos:** el respaldo del 04/11 a las 14:02 se hizo con **0 demos** (`demo_sandbox: 0`), así que todo lo que tenía era real: 48 usuarios, 7 organizaciones, 18 entrenamientos y 151 series. Hoy existen exactamente los 48 usuarios creados hasta entonces (ninguno de demo), las 7 organizaciones (5 reales y 2 demo permanentes), los 18 entrenamientos reales iniciados hasta entonces y sus **151 series**. Las 21 series reales restantes son de entrenamientos iniciados entre el 04/11 14:00 y el 05/11 04:02 (la última, 04/11 23:04). 151 + 21 = 172. Ninguna serie real está anulada.
- **Quién borra:** el único código que borra entrenamientos, usuarios u organizaciones es `purgeSandboxes` (`server/sandbox/services.ts`), llamado cada minuto por `/api/cron/notifications`. Borra sólo los `user_ids` y `org_ids` de demos vencidas (6 h); esos ids salen sólo de usuarios creados con correo `@demo-<tag>.invalid` y organizaciones `is_demo` (comprobado también en las 4 demos abiertas: 32/32 usuarios de demo, 12/12 organizaciones `is_demo`). `set_log` no tiene `DELETE` propio: se borra en cascada con el entrenamiento.
- **Registros:** las respuestas del cron que guarda `pg_net` (06:27–12:26 UTC, 360 llamadas, todas 200) muestran una purga de 1 demo a las 08:34. Las otras 9 demos del respaldo de las 04:02 vencieron antes de las 06:27 y no quedan respuestas de esa ventana.
- **Incertidumbre:** no se abrió ningún respaldo (la clave privada es del titular). Para las series reales del intervalo 04/11 14:02 – 05/11 04:02 no hay una huella anterior sólo de reales: la conclusión se apoya en que el único borrado posible es el de demos. No hay indicios de pérdida.

### Smoke productivo (05/11, 12:35–12:52 UTC) — demos guiadas, Chromium emulado
Script: fuera del repositorio (scratchpad de la sesión), adaptado de `e2e/experience-ux.spec.ts`; sólo demos `is_demo`, que se borran a las 6 h.
- **Alumno, Pixel 7 emulado:** inicio; guía de la serie (Tu profe indicó / Anterior / Real (hoy); «REPI recomienda» no aplicó en esa serie); + peso y ± repeticiones; **doble toque** en «Completar serie 1» → 1 sola serie en el servidor; IndexedDB `repi_offline_v1` y «Guardado en tu cuenta»; descanso con reloj y «Saltar descanso»; **refresco** con la sesión abierta → «Entrenamiento en curso · Continuar entrenamiento», la serie sigue y la copia local tiene `ladder` en 4/4 ejercicios; cambio de ejercicio (sustituido por «Aperturas con mancuernas», confirmado por el servidor; la escalera no se hereda del ejercicio original); salir un momento y volver; finalizar (completed).
- **Historial:** reps 8 → 9 (volumen 444 → 499,5); anular la serie (series 1 → 0, volumen 0) y restaurarla; anular y restaurar el entrenamiento; la serie conserva el valor corregido. Auditoría: `set_edit, set_void, set_restore, session_void, session_restore`.
- **Coach, Pixel 7:** ficha del alumno, «Editar programa» abre el constructor, vista previa «Ver cómo lo verá…» de sólo lectura sin botones de registro. Historial de otra persona: 404.
- **Alumno, escritorio, oscuro:** guía visible, `ladder` en todos los ejercicios de la API. Otro alumno: leer su historial 404, anular su entrenamiento 404.
- **Gimnasio (dueño), escritorio:** catálogo, crear «Mancuernas humo» (10; 12,5; 15; 17,5; 20 kg) asociado a un curl, editar cargas (10; 12,5; 15), archivar. Belgrano no ve el equipo de Palermo. Otra organización (demo de gimnasio, demo de coach, id inexistente): GET y POST 404, archivar 404.
- **Hotfix #26:** el servidor devuelve `ladder` en cada ejercicio al iniciar y al refrescar, y el cliente lo conserva (4/4 tras recargar). En las demos la fuente es `unknown`: la demo no trae equipos y el dueño y el alumno son demos distintas, así que **no se pudo ver «Cargas disponibles» con equipos reales de la sede en producción**. La prioridad plan > sede > desconocido, el aislamiento por sede y la ambigüedad están cubiertos por `tests/gym-equipment.test.ts` (integración).
- **Accesibilidad:** axe 0 serias o críticas en sesión (claro y oscuro, teléfono y escritorio oscuro), historial, vista previa del coach y equipamiento (claro y oscuro). Sin scroll horizontal. **Consola y red:** 0 errores de consola, 0 respuestas 5xx en todas las pruebas.
- **Ajustes del script, no de la app:** tras recargar se entra por «Continuar entrenamiento» (comportamiento previsto); textos con coincidencia exacta; `requestId` con formato válido.
- **No hecho:** teléfonos físicos (iPhone/Android); logs de errores de Vercel (la conexión MCP no tiene acceso al equipo `manuel-cosovschis-projects`: 403).

### Integridad de datos reales durante las pruebas
Huella (cantidad + md5 de cada fila) de usuarios, organizaciones, entrenamientos, series, programas, versiones, asignaciones, relaciones coach-alumno, socios, consentimientos, objetivos y propuestas de Training Intelligence, correcciones, auditoría, equipos y preferencias, limitada a usuarios reales y organizaciones no demo:
- 12:29 UTC (antes): `user 53`, `organization 5`, `workout_session 20`, `set_log 172`, `program 41`, `program_version 51`, `program_assignment 29`, `coach_client 8`, `gym_member 27`, `consent_grant 47`, `training_target 49`, `training_proposal 0`, `training_correction 0`, `audit_event 468`, `gym_equipment 0`, `user_pref 7`.
- 12:42 y 12:48 UTC (durante y después de todas las pruebas): **las 16 huellas idénticas** (cantidades y md5). No hubo escrituras de usuarios reales en esa ventana, así que no hubo cambios legítimos que separar. Las pruebas sólo escribieron en organizaciones `is_demo` y usuarios `.invalid`; los accesos denegados quedaron auditados con el usuario de la demo y sin organización.
- No se usaron alumnos ni configuración de Smart Center.

### Hotfixes del 05/11 por reportes de usuarios (después del smoke)
- **PR #30** (`67c8f7c`): la purga diaria borraba fotos del Club (faltaban `club_post.image_id` y `club_profile.avatar_id` en la lista de referencias) y eso rompía el respaldo. Club con «Foto no disponible» y avatar con iniciales si el archivo no está. Typecheck, guardas (24), integración completa (60 archivos, 397 pruebas) y build en verde; CI y autoprueba en verde.
- **PR #32** (`b9ef4d1`): reporte de un alumno al armar su rutina.
  - El cardio de «Mis rutinas» es una actividad continua (1 vez, 20 min) con el tiempo en minutos y segundos, guardado como `"N s"`.
  - El aviso de las hojas con botón aparece junto al botón: antes quedaba arriba, fuera de la vista, y «Guardar rutina» parecía no hacer nada (en la base no hubo ningún intento de guardado).
  - `parseReps` entiende «20 min», «1 min 30 s», «20:00» y «1:30». En producción no había programas ni rutinas con tiempos en minutos, así que no cambia nada de lo existente.
  - E2E nueva en `own-routine-create.spec.ts`.
  - Verificado en repiclub.com con una demo (Pixel 7 emulado).
- **D196** (este PR): `purgeMedia` lee las referencias a `media_object` del catálogo de Postgres; si falta alguna conocida no purga. Nuevo `member_notice.kind = club_notice` (en Notificaciones lleva a Novedades del Gym).
- **E2E local completa** con estos cambios (Chromium emulado, build local y `repi_dev` descartable): 108 pasan, 27 omitidas por diseño, 5 fallaron sólo por el entorno del contenedor (sin `DATABASE_URL` en el ejecutor ni `.env.local`: `prescribed-weights` y `training-intelligence-roles`, en teléfono y escritorio) o por una espera intermitente (`connected-stages`). Repetidas con el entorno, pasan todas.

### Pendientes externos
- Probar en un iPhone y un Android físicos.
- Dos cuentas de prueba vinculadas (coach + alumno, o dueño + socio de la misma sede) autorizadas por el titular para ver «Cargas disponibles» con equipos reales en producción (`scripts/operations/verify-coach-weights-prod.mjs` es el modelo).
- Comprobar la clave privada de recuperación (`restore-from-release.sh último … --sin-base`), sólo el titular.
- Decidir si se recupera la foto del Club desde el respaldo del 04/11 (requiere la clave privada del titular).
- Re-registrar el cronograma de respaldo desde el navegador del titular (Actions → Respaldo → Disable workflow → Enable workflow) y comprobar al día siguiente que haya una ejecución `schedule`.
- Autorizar la conexión de Vercel al equipo para leer errores de ejecución.
- Prueba de regresión del hotfix #26 (cliente conserva `ladder` al refrescar): hoy sólo hay pruebas de servidor.
- PR #2 (D181, abierto desde antes) sin tocar.

### Próxima acción
Comenzar el Master Prompt 06/06 cuando el titular lo indique.

## Bloque 05/06 · Experience Intelligence & UX 2.0 (D195) — 05/11/2026 · IMPLEMENTADO (publicado: ver arriba)

**Estado (histórico, al implementar):** rama `feat/repi-experience-intelligence-ux`, PR #24 en borrador sobre `main` (`9e18035`). **Hoy está integrado (`719bb94`), la 0045 aplicada y desplegado: ver «Cierre del bloque 05/06» arriba.**

**Qué hay** (detalle en `docs/EXPERIENCE_UX_2.md`):
- Sesión del alumno con la guía de la serie (Tu profe indicó / REPI recomienda / Anterior / Real).
- Lista de ejercicios, «Salir un momento» y aviso «Entrenamiento en curso · Volver».
- Atajos a cargas reales y estados de guardado honestos.
- Historial corregible y reversible con auditoría.
- Vista previa del coach de sólo lectura.
- Catálogo de equipamiento por sede integrado a Training Intelligence.
- Ayudas de primera vez.

**Archivos principales:**
- Dominio: `packages/domain/src/{corrections,equipment}.ts`.
- Servidor: `apps/web/src/server/training/history.ts`, `apps/web/src/server/gym/equipment.ts`.
- Rutas: `/api/me/history/**`, `/api/me/hints`, `gym/[orgId]/equipment`.
- Componentes del alumno: `components/member/{History,SetGuide,SyncBadge,Hint}.tsx`.
- Coach y gimnasio: `components/coach/StudentPreview.tsx`, `components/gym/Equipment.tsx`.

**Migración 0045** (aditiva): `drizzle/0045_experience_ux.sql`, `scripts/operations/hosted-0045.sql`, `scripts/rollback/0045_experience_ux.down.sql` y `scripts/operations/verify-0045.sh`.
- Ensayada en `repi_verify_0045`: huella igual, RLS, reintento sin efecto, reversión negada con anulados, revertir y reaplicar.
- Compatible con el código actual de producción.

**Pruebas:**
- typecheck, guardas (24) y dominio (371) en verde.
- Integración (`repi_test`): 60 archivos, 397 pruebas en verde.
- Build en verde.
- E2E nuevo `e2e/experience-ux.spec.ts` en verde (Pixel 7 emulado y escritorio, axe).
- Suite E2E completa contra la build local y `repi_dev` (Chromium preinstalado): 111 pasan, 0 fallan, 27 omitidas por diseño del proyecto (teléfono o escritorio).
  - La primera corrida encontró tres regresiones, ya corregidas:
    - la guarda de doble toque bloqueaba un toque legítimo después de «Saltar descanso»;
    - faltaba «Usar» en drops con carga de referencia;
    - el contraste del enlace de la ayuda en el coach oscuro.
- No probado en teléfonos físicos.

**Decisiones:**
- Anular = estado + columna, nunca `DELETE`.
- Sólo la persona dueña corrige su historial (coach y gimnasio: 404).
- Trofeos ganados no se revocan; recomendaciones emitidas no se modifican.
- `fitTargetsToLoads` sube sólo si la carga disponible está a 10 % o menos.
- Equipamiento con `equipment.manage` (dueño, gerente, coordinador).

**Próxima acción:**
1. Revisión del PR #24 por el titular.
2. Con su autorización: workflow «Respaldo» en verde.
3. `hosted-0045.sql` en producción y verificación.
4. Integrar el PR (squash) y desplegar.
5. Probar en producción con la demo, idealmente en un teléfono físico.

## PR #21 publicado: flujo del entrenador (D192) + actualizar alumnos desde plantilla (D194) — 04/11/2026 · COMPLETO

**Producción:** `9172e95c1ed9` (repiclub.com `/api/version`), desde las 23:49 UTC. Vercel `dpl_64HXHiA6XEB2i94XwjxeBsrYtAtE` READY. Hay 45 migraciones en la base y 45 en el código.
**Qué hay:** editor rápido de series y distribución de cargas, Load Set y tipos de serie propios (`set_type`), copiar y pegar días (coach y sala), «Actualizar programas de alumnos» desde una plantilla. Detalle: `docs/COACH_WORKFLOW.md`.

### Publicación
1. **Revisión:** PR #21 al día con `main` (incluye el hotfix #20), sin conflictos, CI verde en `c2d65e2`.
2. **Respaldo previo:** issue #22 → workflow «Respaldo» corrida 15, en verde.
   - Release `backup-20261104-234215-41935448423`: 100 tablas, 5973 filas, 44 migraciones, 1 archivo de Storage.
   - El workflow lo descifró, comprobó los hashes del manifiesto, lo restauró en un PostgreSQL descartable y verificó 265 claves foráneas sin huérfanos y 0 restricciones sin validar.
   - La clave privada sigue en el Drive del titular («REPI — Recuperación de respaldos»; el archivo figura como `repi-respaldos.age 2.key`). Sólo se miraron los metadatos.
3. **0044 aplicada** (~23:44 UTC) con `hosted-0044.sql`, en una transacción como `repi_app`.
   - Antes: 44 migraciones, la última `7c551dc6…` (0043); 0044 sin registrar; `set_type` inexistente; `training_target` y `training_proposal` sin RLS y sin permisos para `anon`/`authenticated`.
   - Después: 45 migraciones (`ca3d81a8…`, `when` 1793818585874). `set_type` de `repi_app` con RLS, clave primaria, 2 claves foráneas válidas, índice único parcial `(org_id, owner_user_id, lower(name))` e índice `(org_id, owner_user_id)`.
   - RLS en las 101 tablas de `public`, todas de `repi_app`, sin `FORCE` (el backend, dueño, sigue operando). `anon` y `authenticated` sin ningún permiso sobre las tres tablas; `repi_backup` sólo lectura.
   - El permiso temporal de `postgres` sobre `repi_app` quedó revocado.
   - Huellas iguales antes y después de migrar: `set_log` (1097), `workout_session` (91), `program_version` (100), `history_entry` (0), `training_target` (129), `training_proposal` (3) y `program` (88).
4. **PR #21 integrado** (squash) como `9172e95`. CI de `main` (corrida 149) en verde. Sin errores de ejecución en Vercel desde el despliegue.
5. **Integridad después de publicar y de las pruebas:** sin contar las 6 demos de las pruebas, las siete huellas son idénticas a las de antes de migrar. No hay tipos de serie ni actualizaciones desde plantilla en organizaciones reales.
- **Reversión del código:** promover en Vercel `dpl_EmPac9ej9omWGugfJ2CwToSiyMZE` (`784e83b`). El esquema queda: el código anterior no lee `set_type`. No hace falta revertir la 0044.

### Pruebas en producción (demo guiada, datos ficticios)
- Arnés fuera del repo: los E2E del repo contra repiclub.com, sin simular IPs (cupo de 6 demos por hora), en Chromium emulado. **No probado en teléfonos físicos.**
- Teléfono (Pixel 7): editor rápido (pirámide, distribución de cargas, deshacer, lb, teclado); top set + Load Set y tipos propios (crear, usar, renombrar sin tocar el plan, quitar); copiar un día de Valentina a Martina sin pesos y con el historial intacto; sala: copiar el día de un socio al borrador de otro.
- Escritorio: «Actualizar programas de alumnos» con un conflicto real (Martina personalizada en el mismo ejercicio). Por defecto se conserva lo suyo; Valentina recibe una versión nueva con 80/90/100 kg; las sesiones de las dos no cambian; claro y oscuro.
- Alumno (teléfono): Training Intelligence 2.0 sigue dando objetivos por serie («Anterior / REPI recomienda / Real»), en claro y oscuro.
- Sin sesión, las rutas nuevas del coach responden 401.

### Urko
- Es `coach_owner` activo de su organización de coach (habilitada, sin demo): 9 plantillas, 8 alumnos activos y 8 asignaciones activas.
- Todas las funciones nuevas piden exactamente ese rol (`requireCoach`). No se le dio ningún permiso nuevo y no se tocaron sus datos.
- No es personal de Smart Center Gym; las funciones de sala las usa el personal del gimnasio.

### Próximo: Master Prompt 05/06
- En una rama nueva desde `main` (al día con `9172e95` y esta bitácora). Leer primero MASTER_PROMPT.md y este archivo.
- Ya anotado para el 05/06 en bloques anteriores: el rediseño visual de la sesión del alumno, el editor del coach en la vista del alumno y el catálogo de equipos por sede (`docs/TRAINING_INTELLIGENCE_2.md` §8 quater).
- Antes de cualquier migración productiva: workflow «Respaldo» en verde (docs/RESPALDOS.md).

### Pendiente
- **Hotfix D193:** «Tu profe indicó X kg» con un profe y un alumno reales vinculados en producción sigue sin verificar. No hay cuentas de prueba en producción (sólo usuarios reales y demos), y la demo no lo permite (cada perfil abre otra demo). No se tocó ningún alumno real. Cubierto por las pruebas automáticas (integración y E2E local). Para cerrarlo: el titular crea dos cuentas de prueba vinculadas (un coach y un alumno, sin 2FA) y se corre `scripts/operations/verify-coach-weights-prod.mjs` (ver su encabezado).
- La alerta de Supabase `function_search_path_mutable` en `gym_task_event_immutable` sigue igual que antes.

## Hotfix P0 · cargas del profe que el alumno no veía (D193) — 04/11/2026

**Causa:** el profe cargó las cargas en la plantilla y el alumno entrenaba con su copia (sin cargas). Al reasignársela con el entrenamiento abierto, la sesión no avisaba y «Aplicar ahora» fallaba («Tu programa ya no está asignado»). Verificado con consultas de solo lectura en producción (sin datos personales ni escrituras): las cargas nunca estuvieron en la copia del alumno; la copia nueva (asignada 21:33 UTC) sí las tiene.
**Arreglo (rama `fix/repi-coach-prescribed-weights`, sin migraciones):** `liveAssignment` en `services.ts` (`getSession.outdated`, `upgradeSession`, que mueve la sesión a la asignación vigente); aviso «Plantilla · …» y nota en `ProgramBuilder.tsx`; texto de `AssignModal.tsx`; «Tu profe no indicó un peso…» en `TargetCard.tsx`; «Tu profe indicó» sin objetivo calculado en `Workout.tsx`.
**Pruebas:** `tests/prescribed-weights.test.ts` (9), app 350, dominio 321, guardas 24/24, typecheck, build; `e2e/prescribed-weights.spec.ts` (móvil y escritorio, Chromium emulado).
**Alumno del reporte:** con la versión publicada, al abrir su entrenamiento en curso ve «Actualizó tu rutina · Aplicar ahora». Si lo aplica, las series ya registradas se conservan y las que faltan muestran la carga del profe. Si ya terminó, el próximo entrenamiento sale de la copia nueva con 45/40/35 kg.
**Próximo:** retomar `feat/repi-coach-workflow-ux` (D192, trabajo de Urko) sobre el `main` con este hotfix.

## Bloque 04/06 publicado: Training Intelligence 2.0 (D191) — 04/11/2026 · COMPLETO

**Producción:** `e1830a34ab32` (repiclub.com `/api/version`), desde las 18:25 UTC. Hay 44 migraciones en la base y 44 en el código.

### Publicación
1. **CI:** verde en `d9e9287` (corrida 138) y en `efc0e1a`, el último commit del PR (corrida 139).
2. **Respaldo previo:** issue #18 → workflow «Respaldo» corrida 11, en verde.
   - Release `backup-20261104-181026-41884040972`, publicado y verificado.
   - Contenido: 98 tablas, 3704 filas y 43 migraciones.
   - El workflow lo descifró, comprobó los hashes, lo restauró en un PostgreSQL descartable y verificó 256 claves foráneas sin huérfanos.
3. **0043 aplicada** (~18:17 UTC) con `hosted-0043.sql`, en una transacción como `repi_app`.
   - Antes: los 43 hashes y fechas de producción eran iguales a los archivos del repositorio.
   - Después: 44 migraciones con el hash `7c551dc6…`, dos tablas de `repi_app`, 12 restricciones y 9 índices, y 0 restricciones sin validar en `public`.
   - Huellas iguales: `set_log`, `workout_session`, `program_version`, `history_entry` y `consent_grant`.
   - `program_exercise` cambió por la edición de un coach real, anterior a la migración (auditada a las 18:13–18:15). Ninguna fila tiene el `xmin` de la migración.
   - El permiso temporal de `postgres` sobre `repi_app` quedó revocado.
4. **PR #17 integrado** (squash) como `e1830a3`. Vercel `dpl_38ofi55a4BZfrr8y51a7tAV2Epow` READY.

### Verificación en producción (demo guiada, emulación de Pixel 7 en Chromium)
- **Alumno:**
  - Tarjeta Anterior → REPI recomienda → Real («53 kg × 9 · RIR 2» → «53 kg × 8» → «Por registrar»).
  - Objetivos persistidos (`ti2.1`).
  - Drops 6,5 y 5 kg debajo de su serie y pendientes de confirmar.
  - «Usar», serie al límite y mensaje en el descanso con «Sumar 30 s».
  - Sin conexión: 2 registros sin duplicados.
  - kg → lb a mitad de la sesión: objetivos iguales; tarjeta y explicación en lb («116,8 lb»), sin «kg».
  - Molestia: mensaje de seguridad y nada sube.
- **Top set + back-off** (rutina propia, dos sesiones): primero `no_data`; después top 105 y back-off 85 con su propia historia, pendiente de confirmar.
- **Sala con turno:** ve la sección del socio que comparte (200).
- **Dueño:** 403 en la API, 404 al decidir, y sin sección.
- **Coach:**
  - Con cuatro sesiones ficticias sembradas sólo en su demo (`is_demo`), propuestas de carga en tres ejercicios.
  - «Mantener», «Rechazar» y «Aceptar (sin aplicar)» no cambian la rutina.
  - «Revisar en el editor» → «Aplicar 112,5 kg al borrador» → versión 1 → 2, con las sesiones iguales.
  - Un cliente ajeno da 404.
- **Datos reales intactos:** fuera de las demos, 151 series, 18 sesiones y 45 versiones con la misma huella antes y después. Los 46 objetivos y las 3 propuestas creados son de demos.
- **Errores:** ninguno en la página; Vercel sin errores ni advertencias desde el despliegue.
- **Si la inteligencia falla, se entrena igual:** probado en el servidor (`training-intelligence-hardening.test.ts`, sin la tabla de objetivos). No se forzó una falla en producción.
- **No probado:** iPhone ni Android físicos, ni Safari.

### Próximo
- El cambio del editor piramidal pedido por Urko va en un PR propio. No está incluido acá.
- Para el 05/06: catálogo de equipos por sede (`docs/TRAINING_INTELLIGENCE_2.md` §8 quater).
- Antes de cualquier migración nueva: issue «Respaldo: antes de la migración 0044» y seguir sólo si se cierra en verde.

## Bloque 04/06 · Training Intelligence 2.0 (D191 + cierre) — 04/11/2026 · PUBLICADO (ver arriba)

- **Rama:** `feat/repi-training-intelligence-2`. `main` integrada por merge, sin force push. PR #17 en borrador, **con base `main`**.
- **Qué hace:**
  - Objetivo de REPI por serie y etapa (Anterior → REPI → Real), persistido y versionado.
  - Ajuste después de cada serie que sólo mantiene o baja, también sin conexión.
  - Tendencia y propuestas para quien programa: el coach, o la sala de la sede con consentimiento.
  - Detalle en `docs/TRAINING_INTELLIGENCE_2.md`.
- **Cierre (este paso):**
  - Acceso de sala: `program.edit` en la sede y `attendance_training`. Dueño, gerencia y recepción: 403.
  - «Aceptar (sin aplicar)» y «Revisar en el editor» (editor existente; sólo el borrador cambia si se aplica).
  - kg/lb en todas las explicaciones.
  - Saltos de carga por equipo en `detail.load`.
  - 0043 regenerada con `training_proposal.gym_member_id`.
- **Archivos nuevos o tocados:**
  - Dominio: `units.ts` (`localizeWeights`), `prescription.ts` (`EQUIPMENT`, `LoadSetup`, `loadIncrement`), `intelligence.ts`.
  - Servidor: `server/training/intelligence.ts` (`relationIntelligence`, `recordDecision`), `server/gym/services.ts` (`memberIntelligence`, `decideMemberProposal`), ruta `api/gym/[orgId]/[...path]`.
  - UI: `CoachIntelligence.tsx`, `ProposalDraft.tsx`, `ProgramBuilder.tsx`, `gym/Members.tsx`, `ExerciseDetailEditor.tsx`, `TargetCard.tsx`, `Workout.tsx`, `Solo.tsx`, `HistoryImport.tsx`, `Gym.tsx`.
  - Tests: `tests/training-intelligence-hardening.test.ts`, `e2e/training-intelligence-roles.spec.ts`.
- **Migración 0043:**
  - Aplicada **sólo** en `repi_dev` y `repi_test` locales. **No en producción.**
  - `hosted-0043.sql` (sha256 `7c551dc6…`) generado del archivo, transaccional y con comprobación interna.
  - Reversión transaccional en `scripts/rollback/0043_training_intelligence.down.sql`.
  - Ensayo `scripts/operations/verify-0043.sh`: aplica, reintenta (falla entero), revierte y reaplica sin cambiar la huella del historial.
- **Pruebas:**
  - Dominio 321. App 340 (en `repi_test` descartable). Guardas 24/24. Typecheck y build OK.
  - E2E completa: 95 pasan, 0 fallan, 27 omitidas (las mismas de antes). Chromium con emulación de móvil y escritorio.
  - Suite de `main` sobre el esquema nuevo: 314/314.
- **No verificado:** dispositivos físicos, Safari, iPhone instalado ni producción.
- **Próximo (decisión del titular):** para publicar,
  1. Correr «Respaldo» y esperar que termine en verde.
  2. Ejecutar `hosted-0043.sql`.
  3. Verificar 44 migraciones y el hash.
  4. Integrar el PR #17.

  Procedimiento completo en `docs/TRAINING_INTELLIGENCE_2.md` §14. Pendiente para el 05/06: catálogo de equipos por sede (§8 quater).

## Bloque 03/06 publicado y respaldos activos (D188 + D190) — 04/11/2026 · COMPLETO

**Producción:** `511f823` (repiclub.com `/api/version`). Hay 43 migraciones en la base y 43 en el código.

### Respaldos (D190) — operativos, sin secretos guardados
- **Cómo corre:** `.github/workflows/backup.yml`, a diario a las 03:17 de Buenos Aires, o con un issue «Respaldo: …» abierto por el dueño. `workflow_dispatch` también existe, pero la integración recibe 403.
- **Credenciales:**
  - Base: Edge Function `repi-backup-credentials`. Con el token OIDC del job, fija para `repi_backup` (sólo lectura) una contraseña que vence en 2 h y la revoca al terminar.
  - Storage: `repi-storage` v4, que sólo firma lecturas para ese token.
  - No hay Secrets ni Variables en GitHub.
- **Claves age:**
  - Pública: `apps/web/scripts/operations/backup-recipients.txt`.
  - Privada: en el Google Drive del titular, carpeta «REPI — Recuperación de respaldos» (`repi-respaldos.age 2.key`, sólo el dueño tiene acceso). La guardó el titular desde el archivo que le envió Claude; Claude no la leyó.
- **Primer respaldo real:** [`backup-20261104-140210-41843251047`](https://github.com/manuel-cosovschi/repi/releases/tag/backup-20261104-140210-41843251047).
  - Contenido: 98 tablas, 2375 filas, 42 migraciones (antes de 0042) y 1 archivo de Storage.
  - Restaurado en el runner, sin huérfanos en las 256 FK.
  - Abierto con la clave del titular, con todos los hashes iguales al manifiesto.
  - La credencial temporal quedó vencida.
- **Alertas:** probadas con el issue #11 y la alerta #12. El éxito del issue #15 cerró la alerta.
- **05/11:** GitHub no creó ni la ejecución de las 06:17 ni la de reserva de las 12:47 UTC (PR #27). El respaldo por el issue #28 falló por una foto purgada; arreglado en #30 y copia del día con el issue #31. El cronograma automático sigue sin probarse: ver «Cierre del bloque 05/06» arriba.

### Migración 0042 — aplicada el 04/11 a las 14:04 UTC
- **Cómo:** `hosted-0042.sql`, en una transacción como `repi_app`.
- **Integridad:**
  - 98 tablas y 2375 filas, iguales antes y después.
  - Huellas de `set_log`, `workout_session`, `program_exercise`, `own_routine` y de las columnas previas de `user_pref` sin cambios.
  - 0 restricciones sin validar.
  - Smart sigue con el control presencial apagado.

### PR #7 (D188) — publicado
- **Prueba en producción:** con la demo guiada (sandbox), 28/28 comprobaciones.
  - Claro, Oscuro y Automático con dispositivo claro y oscuro, guardado en la cuenta.
  - 401 sin sesión y 400 con campos de más o un tema inválido.
  - Pestañas del alumno y entrenamiento sin reinicio al cambiar de tema.
  - Un alumno no entra a Admin.
  - Coach y Dueño en ambos temas, con 7 secciones cada uno.
  - Sin errores de página ni de Vercel.
- **Datos reales:** sin cambios. Excluyendo las 3 demos de la prueba, las huellas de series y sesiones son idénticas a las de antes.

### Próximo
- **Training Intelligence 2.0 (bloque 04/06):** lo desarrolla otra sesión en su propia rama. main está al día y sin PR abiertos de este trabajo.
- **Antes de cualquier migración nueva:** issue «Respaldo: antes de la migración 00NN» y seguir sólo si se cierra en verde.

## Arreglo urgente · Solicitud de socio pendiente que encerraba al equipo (D189) — 04/11/2026

- **Reporte:** el titular (Admin y entrenador de piso de Smart Center) pidió ser socio por QR y no podía volver a Admin ni a su panel desde Acceso.
- **Su cuenta:** rol Admin, rol de piso y 2FA intactos. Tiene una solicitud pendiente en Smart Center · Sede principal, que vence el 05/11 a las 01:30 UTC. Entrar directo a `/admin` o a `/gym/<org>` siempre funcionó.
- **Arreglo:** rama `hotfix/acceso-solicitud-pendiente`, desde `main`, independiente del PR #7 (tema). Cambia `AccessFlow.tsx` (selector con la solicitud pendiente; «Ir a mis espacios») y `memberOnboardingState` (la vencida no cuenta).
- **Pruebas:**
  - `annex.test.ts` (D189): conserva espacios, no se autoaprueba, la aprueba otra persona, la vencida no cuenta.
  - `e2e/join-pending-staff.spec.ts`.
  - App: 311. Typecheck OK.
- **Aprobación:** la hace otra persona de Smart Center con autoridad en la sede (recepción, gerencia, dueño o piso con turno). No se aprueba con SQL.

Actualizado: 04/11/2026 (hasta D188; bloques 01/06 y 02/06 publicados; 03/06 en PR sin publicar), sobre la release candidata rc-2026.10.27 (D111). Leer primero docs/RELEASE_READINESS.md y docs/LAUNCH_BLOCKERS.md. Máster activo: ../../MASTER_PROMPT.md.

## Bloque 03/06 · Tema global Claro / Oscuro / Automático (D188) — 04/11/2026 · PUBLICADO (ver arriba)

- **Rama:** `feat/repi-global-theme-system`, sacada de `main` en `6cc299f` (= producción). PR borrador independiente. **No se integra a `main` sin autorización**, porque integrar despliega en vivo.
- **Qué hace:** cada cuenta elige Claro («Premium Cream»), Oscuro («Premium Performance») o Automático (por defecto). Es la misma preferencia en Alumno, Coach, Gym, Admin y Mi cuenta, y en todos sus dispositivos. Arquitectura, tokens, sincronización y política de transición en **`docs/TEMA_GLOBAL.md`**.
- **Archivos clave:**
  - Tokens: `packages/domain/src/tokens.ts` (`theme.light`/`theme.dark`), `apps/web/scripts/gen-tokens.ts` y `tokens.css` (generado).
  - Lógica: `packages/domain/src/theme.ts` (reglas puras), `apps/web/src/lib/theme.ts` y `theme-boot.ts`.
  - Componentes: `components/theme/ThemeRuntime.tsx` y `ThemePicker.tsx`; `app/layout.tsx`.
  - Servidor: `server/settings/services.ts` y `api/me/settings`.
  - Estilos migrados: `member.css`, `coach.css`, `gym.css`, `method-editor.css`, `access.css` y `globals.css`, más unos 45 componentes con colores en línea.
- **Migración 0042** (`0042_user_pref_theme.sql`):
  - `user_pref.theme text not null default 'system'` con check, y `theme_changed_at timestamptz` nula. Es aditiva y sin relleno.
  - Aplicada **sólo** en `repi_dev` y `repi_test` locales. **No en producción.**
  - Reversión en `scripts/rollback/0042_user_pref_theme.down.sql`, sólo si se abandona también el código: el código anterior ignora las columnas.
  - **Antes de aplicarla en Supabase:** respaldo completo con `pnpm ops:backup --source=hosted --storage --out=/Volumes/<SSD>/REPI/Backups`, como en D187 (plan Free, sin respaldos automáticos).
  - Orden de publicación: **primero 0042, después integrar el PR.** El código nuevo lee `user_pref.theme`; sin la columna, `/api/me/settings` falla.
- **Pruebas:**
  - Dominio: 274 (incluye contraste WCAG de cada par de tokens).
  - App: 313 en base descartable `repi_test`.
  - Guardas: 16 (incluye la guarda de colores fijos).
  - Typecheck y build: OK.
  - E2E locales: `theme.spec.ts` 16/16 (móvil y escritorio) y `theme-visual.spec.ts` 18/18 (4 roles × 4 temas × 320–1366, axe WCAG 2.2 AA).
  - No hay lint configurado en el repositorio.
- **Revisión final (04/11):**
  - Admin en los 4 temas: `e2e/theme-admin.spec.ts` 6/6, con un Admin de prueba local de `repi_dev` creado por el flujo legítimo. Se corre con `E2E_ADMIN_STATE`.
  - Corrección: los enlaces dentro de un texto ahora van subrayados (WCAG 1.4.1). axe lo detectó en la guía de Admin.
  - App instalada en iPhone verificada en Chromium: zona segura emulada de 47 pt y reglas `display-mode: standalone` aplicadas a mano, porque Chromium no emula ese medio. En Claro, la franja navy de 47 px va detrás de la hora; el contenido arranca debajo del difuminado.
  - Regresión E2E completa: 85 pasan y 0 fallan.
- **No probado:** iPhone o Android físicos, ni Safari real.
- **Smart Center:** el control presencial sigue en pausa. Este bloque no toca accesos, roles, permisos ni datos.
- **Próxima acción:**
  1. El titular revisa el PR y las capturas.
  2. Hace el respaldo en el SSD.
  3. Se aplica 0042 en Supabase con `apps/web/scripts/operations/hosted-0042.sql`: una transacción como `repi_app`, igual que D187. Está preparado y ensayado con ROLLBACK en una copia local restaurada (51 filas quedaron en `system`); todavía no se ejecutó.
  4. Se integra el PR, se espera el despliegue y se corre el smoke de producción con la demo.
  5. Después, el bloque 04/06 (Training Intelligence 2.0) con los tokens `--ui-*`.

## Publicación de los bloques 01/06 y 02/06 — 04/11/2026 · COMPLETA

**Estado:** `main` = producción = `d023d06` (`https://repiclub.com/api/version` → `d023d06dc5ba`, despliegue Vercel `dpl_MeM55ndb8oZCs97waEYsd9xbniX8`, READY 02:32 UTC). No quedan ramas encadenadas: el bloque 03/06 sale de `main`.

| PR | Contenido | Merge | En producción | CI |
|---|---|---|---|---|
| #5 | Hotfix D185–D186 | `3567dea` | 01:31 UTC | ✓ |
| #3 | Bloque 01/06 (D182), reconciliado con `main` | `8ba8d4d` | 01:46 UTC | ✓ |
| #4 | Bloque 02/06 (D183–D187), reconciliado con `main` | `d023d06` | 02:32 UTC | ✓ |

- **Respaldo previo (titular, 04/11 02:19 UTC):** `pnpm ops:backup --source=hosted --storage --out=…` en el SSD externo SANDISK, carpeta `REPI/Backups/2026-11-04T02-19-05-881Z-hosted`. Contiene 97 tablas, 4003 filas y 1 archivo de Storage; sha256 de la base `e3db7b74…d88f`. Restauración real verificada en una base local descartable con 0000–0041: 256 claves foráneas sin huérfanos y 97/97 tablas idénticas. **No borrar.**
- **D187 · `ops:backup`:**
  - Se colgaba de forma intermitente después de copiar tablas de cientos de KB (contrapresión en el COPY de postgres.js). Ahora lee cada COPY entero en modo flujo.
  - `--out=<carpeta existente>` cambia sólo el destino.
  - Ensayado con 3 respaldos y 1 restauración de `repi_dev`.
- **Migraciones 0040 y 0041 en Supabase (02:25 UTC):**
  - Se aplicó `apps/web/scripts/operations/hosted-0040-0041.sql` en una transacción desde el editor SQL (`postgres`).
  - Las tablas son de `repi_app`; `postgres` tiene ADMIN sobre ese rol pero no SET. Se concedió SET dentro de la transacción y se revocó antes del commit. Las membresías quedaron idénticas.
  - Resultado: 42 migraciones con el hash y el `when` del journal, 5 columnas nulas y `set_skip` (dueño `repi_app`, RLS, restricciones válidas). Hay 98 tablas, todas con RLS y del mismo dueño.
  - Sin relleno.
- **Integridad:** las 591 series reales siguen con 4906 repeticiones, tonelaje 223070,50 y huella `363d7c58672837877eaa3d5321229a2a`, igual antes y después de migrar y de publicar. Tampoco cambiaron las huellas de sesiones ni de ejercicios de programa, y las columnas nuevas siguen nulas en esas filas. Después de publicar: 0 duplicados, 0 huérfanos, 0 sesiones vacías abiertas y 0 intervalos vencidos.
  - **Cómo comparar:** separar las filas de demos creadas después del corte, con `demo_sandbox.user_ids`. Cada demo siembra un historial ficticio con fechas anteriores, así que filtrar por `updated_at` no sirve.
- **Smoke productivo después del #4:** los E2E del repo contra repiclub.com con la demo guiada (datos ficticios), en Chromium emulando un Pixel 7. El arnés está fuera del repo; cambia la guarda de destino y no simula IPs.
  - Todo verde: públicas y PWA (11), etapas conectadas, EMOM, pantallas chicas con la pastilla visible, rutina propia con drop set, importación con métodos, coach con métodos no destructivos, registro único y pestañas, aislamiento de roles, ejercicio nuevo en «Mi rutina» y recorrido completo (peso, saltar descanso, pausa, recarga y finalizar).
  - Las series nuevas guardan `spec_id` y el tipo (`work`, `drop`). Las omisiones y el EMOM se persisten en el servidor.
  - **No probado en teléfonos físicos.**
- **Vercel:** sin errores de ejecución desde las publicaciones.
- **Control presencial:** Smart Center Gym sigue con `enabled = false` desde el 02/11. No se tocó.
- **Javier (Smart):** su entrenamiento vacío quedó `abandoned` y no hay sesiones vacías abiertas.
- **Reversión del código:** promover en Vercel `dpl_4fmEEDQYx4GHdSxArE6TGM59Yasu` (`8ba8d4d`). El esquema queda, porque el código anterior lo tolera.
- **Pendientes conocidos:**
  - Sin tiempo real entre dispositivos.
  - El coach todavía no ve las etapas omitidas.
  - La importación por foto o PDF necesita la IA.
  - Advertencia previa de Supabase `function_search_path_mutable` en `gym_task_event_immutable`.
  - Supabase Free no tiene respaldos automáticos: repetir `ops:backup --out` antes de cada migración.
- **Próximo: Master Prompt 03/06 (Light/Dark/Automático)** en una rama nueva desde `main`. El editor de métodos ya cambia los tokens por contenedor (`.dx-host`, `styles/method-editor.css`), el mismo mecanismo que el tema global.

## Arreglo urgente D186 también en esta rama — 03/11/2026

- El arreglo de «Mi rutina» (PR #5; detalle en su bitácora) está incorporado acá con cherry-pick, sobre el editor con métodos: búsqueda por palabras, parecidos, grupo sugerido y «Guardar» que crea el ejercicio a medio cargar.
- **Pruebas en esta rama:** dominio 241 ✓, web 310 ✓ y E2E 51 ✓ (1 omitida). Incluye `own-routine-create.spec.ts`.

## Arreglo urgente D185 también en esta rama — 03/11/2026

- El arreglo del día sin ejercicios (PR #5 sobre `main`; detalle en su bitácora) está incorporado acá con cherry-pick. También el del descanso que volvía: si la respuesta de la sincronización llegaba justo después de «Saltar descanso», la copia anterior lo volvía a poner (lo encontró `connected-stages` en escritorio).
- **Pruebas en esta rama:** web 310 ✓ en 53 archivos; E2E 49 ✓ y 1 omitida.
  - `connected-stages` pasó 8 de 8 repeticiones.
  - Al repetir la importación se agota el límite de 12 por hora (se guarda en la base). Para repetirla en local, vaciá `app_rate_limit` en `repi_dev`.

## Cierre del bloque 02/06 · Métodos en todos los orígenes y ejecución entre dispositivos (D184) — 03/11/2026

- **Pedido:** «Cierre definitivo del bloque 02/06» sobre el PR #4. Misma rama `feat/repi-connected-training-methods`; sigue encadenado sobre el PR #3. **Sin desplegar ni integrar; sin tocar producción.** Referencia: `docs/METODOS_Y_ETAPAS.md` (secciones Orígenes, Ejecución, API, 0041 y relleno de 0040).
- **Corregido:**
  1. Rutinas propias, importadas, de REPI y duplicadas con los mismos métodos: mismo `ExerciseDetail`, validador y editor del coach (`ExerciseDetailEditor member`). La importación detecta métodos y combinados, aplica lo claro y pregunta lo ambiguo. Se agregó «Duplicar» en «Mis rutinas».
  2. Etapas omitidas en el servidor (`set_skip`): cola offline, gana el cambio más reciente, un resultado siempre gana, «Volver a pendiente» y corrección con el entrenamiento terminado.
  3. EMOM persistido (`workout_session.interval_state`): hora del servidor, diferencia de reloj por dispositivo, la pausa lo interrumpe y lo vencido no se calcula.
  4. La pastilla de la demo tiene su carril (`--demo-lane`) y no tapa «Saltar descanso». La prueba de superposición encontró otro defecto real: el anillo del descanso se quedaba con el toque de «Pausar descanso» (`pointer-events: none`).
  5. Script de relleno de 0040, por lotes, idempotente, validado y reversible. No hace falta antes de producción.
  6. El 503 de las E2E: Entrenar pedía por adelantado la sugerencia de la IA aunque el servidor no la tuviera configurada. Ahora `myTraining.ai` dice si está y el teléfono no la pide. Un error real del proveedor con clave sigue fallando las pruebas. No hizo falta un proveedor simulado.
- **Defectos del bloque 02 encontrados y corregidos:**
  - `detail-schema.ts` (zod de las rutas) descartaba identidad, bloque, etapa, EMOM y AMRAP por tiempo, y cortaba en 20 filas. Las pruebas de servicios no lo veían.
  - Un drop «al fallo» se completaba con 0 repeticiones. Ahora completar con 0 se bloquea.
  - Esc en el editor de técnica, abierto sobre una hoja, cerraba también la hoja.
- **Migración:** `0041_set_skip_interval.sql`: tabla nueva y una columna nula. Reversión en `apps/web/scripts/rollback/0041_set_skip_interval.down.sql`. Aplicada sólo en `repi_test` y `repi_dev` locales; **no en producción**. El relleno de 0040 se probó sólo en `repi_test`.
- **Archivos:**
  - Dominio:
    - Nuevos: `execution.ts` (`decideSkip`, `intervalView`, `acceptInterval`, `toServerMs`) y `method-detect.ts` (`detectMethod`, `detectGroupLabel`, `methodDetail`).
    - `metrics.ts` (`stagesSkipped`) y `routine-import.ts` (columnas Técnica y Grupo).
  - Servidor:
    - `services.ts`: `setStageSkip`, `setSessionInterval`, `getSession` con `skips`, `interval` y `serverNow`, `startSoloRoutine` con `detail`, y la pausa, la versión nueva y el cierre automático también actualizan el intervalo.
    - `own-routines.ts`, `solo-routine.ts` (`aiMethodDetail`) y `detail-schema.ts`.
    - Rutas `sessions/[id]/skips`, `sessions/[id]/interval` y `routines/[id]/duplicate`.
  - App:
    - `OwnRoutines.tsx`, `RoutineImport.tsx`, `Workout.tsx`, `Solo.tsx`, `MemberApp.tsx` y `Sheet.tsx`.
    - `lib/offline/{store,queue}.ts` (ítems `skip` e `interval`).
    - `ui/Modal.tsx` (`className`).
    - `styles/method-editor.css` (nuevo: `.dx-*` sale de `coach.css`; `.dx-host` cambia tokens) y `globals.css`/`member.css` (carril de la demo y anillo).
  - Script: `scripts/operations/backfill-set-log-stage.ts`.
- **Pruebas** (locales; Chromium emulando teléfonos, **no dispositivos físicos**):
  - Dominio: 238 ✓; typecheck limpio (se corrigió el error que venía de antes en `prescription.test.ts`).
  - App: 308 ✓ en 52 archivos. Nueva `methods-everywhere.test.ts` con los puntos 1–9 y 11–12 del pedido, más permisos y la regresión de la API.
  - Guardas 11 ✓, typecheck ✓ y build ✓.
  - E2E: 49 ✓ y 1 omitida (sólo móvil), 0 ✗. Nuevas `mobile-layout.spec.ts` (superposiciones de 320 a 430 px, rutina propia con drop set, importación con método claro y ambiguo) y `emom-sync.spec.ts`. `connected-stages.spec.ts` ahora prueba otro dispositivo y «Saltar descanso».
- **Límites que quedan:**
  - Otro dispositivo ve omisiones e intervalo al abrir o recargar la sesión (no hay tiempo real).
  - El coach todavía no ve las etapas omitidas en el detalle de la sesión: ve los resultados.
  - La importación por foto o PDF depende de la IA (sin clave, sólo planilla y texto con columnas).
  - Sin prueba en iPhone ni Android reales.
  - El editor del coach en el alumno es una adaptación con tokens: el rediseño es del bloque 05/06.
- **Para 03/06 (Light/Dark):** `method-editor.css` muestra el mecanismo, que es redefinir tokens en un contenedor (`.dx-host`). Componentes nuevos para adaptar: `.dx-host`, `.ri-method`, `.or-tech`, `.wo-stage` (omitida y EMOM) y `.setrow.skipped`.
- **Próxima acción:** revisar el PR #3 y después el #4. El titular decide si se corre el relleno de 0040 en producción (no hace falta) y cuándo aplicar 0040 y 0041 al desplegar.

## Bloque 02/06 · Series principales con etapas conectadas (D183) — 03/11/2026

- **Pedido:** master prompt 02/06 (métodos avanzados, etapas conectadas, métricas). Rama `feat/repi-connected-training-methods` desde `fix/repi-p0-training-safety` `225ec0c` (PR #3); PR encadenado en borrador con base en esa rama. **Sin desplegar ni integrar.** Referencia técnica: `docs/METODOS_Y_ETAPAS.md`.
- **Decisión vigente del producto:** el control de ingreso presencial queda en pausa. No se tocó su código ni su configuración; con el control apagado (por gimnasio o con `NEXT_PUBLIC_REPI_FEATURES=-gym_access`) el entrenamiento no pide QR ni pase (pruebas en `connected-methods.test.ts`). Smart sigue con el control encendido en producción: apagarlo en REPI Admin o con el interruptor general (requiere redeploy) es una acción pendiente del titular.
- **Código:**
  - Dominio:
    - `stages.ts` (nuevo): `normalizePlan`, `planBlocks`, `rowRef`, `applyMethod`, `comboStep`, `circuitIssues`, `resizeBlocks` y `syncCircuit`.
    - `metrics.ts` (nuevo).
    - `prescription.ts`: tipos v2, `validateDetail`, `setTarget` con etapa, y `presetPlan` y `comboNext` delegando en el modelo nuevo.
    - `training.ts`: volumen sin aproximación ni rondas, `setControl` con AMRAP por tiempo y validación de circuitos.
  - Servidor:
    - `training/services.ts`: `logSet` guarda la etapa; `timedPeIds` clasifica cada fila; el resumen y el historial usan `metrics`; la comparación de versiones se normaliza.
    - `community/levels.ts` y `club.ts`.
    - `sandbox/services.ts`: la demo trae drops en la última serie de un ejercicio por día.
  - App:
    - `coach/ExerciseDetailEditor.tsx`, con su lógica reescrita sobre los componentes actuales.
    - `coach/ProgramBuilder.tsx` y `gym/Members.tsx` (sincronización de circuitos).
    - `member/Workout.tsx`, `SetControl.tsx` (AMRAP por tiempo) y `types.ts`.
    - `lib/offline/store.ts` (`skip`, `iv`, `keepLocalOnly`).
    - Estilos sólo con tokens.
- **Migración:** `0040_set_log_stage.sql`: 4 columnas nulas en `set_log`, sin relleno. Aplicada sólo en `repi_test` y `repi_dev` locales; **no en producción**. El relleno histórico es opcional y no se ejecutó.
- **Pruebas:**
  - Dominio: 224 ✓ (antes 191; nuevas `stages.test.ts` y `metrics.test.ts`).
  - App: 290 ✓ (antes 278; nueva `connected-methods.test.ts` con los escenarios A–F, persistencia y permisos, más casos offline en `prefill.test.ts`).
  - Guardas 11 ✓, typecheck ✓ y build ✓.
  - E2E local (Chromium, build de producción, demo):
    - Nuevos `connected-stages.spec.ts` (drop set con una etapa sin conexión, cortar la serie y recargar sin duplicar) y `coach-methods.spec.ts` (aplicar a la última serie con vista previa, deshacer, arrastrar sin cerrar, confirmar al descartar): ✓ en móvil y escritorio.
    - Suite completa: 40 ✓ y 2 ✗. Las dos fallas son «cada pestaña abre sin errores», por el 503 de `/api/me/solo/ai` sin `OPENAI_API_KEY` (ambiental, igual que en 01/06).
  - No probado en dispositivos reales.
- **Hallazgo menor (no resuelto):** en la demo, a 412 px de ancho, la pastilla «Otro perfil» tapa «Saltar descanso». Sólo pasa en la demo.
- **Límites conocidos:**
  - Una etapa omitida es local: otro dispositivo la ve pendiente.
  - El intervalo EMOM empieza con «Empezar el intervalo» y no sobrevive a otro dispositivo.
  - Las rutinas importadas y las propias no tienen métodos (texto libre como «12-10-9»).
  - La recomendación por etapa es del bloque 04/06.
  - El rediseño visual de la sesión es del bloque 05/06.
  - La adaptación a temas es del bloque 03/06 (componentes nuevos: `.dx-apply`, `.dx-preview`, `.dx-review`, `.dx-stage`, `.setblock`, `.setrow.stage`, `.wo-stage` y el AMRAP por tiempo de `SetControl`).
- **Próxima acción:** revisar los PR #3 y este en orden (#3 primero). Después, bloque 03/06 (temas).

## Arreglo urgente · Ejercicio nuevo en «Mi rutina» en un solo paso (D186) — 03/11/2026

- **Reporte (titular, con captura de producción):**
  - Al armar una rutina a mano con un ejercicio que no estaba («Remo en smith»), había que tocar «Crear y agregar» y después «Guardar».
  - Sin el grupo muscular elegido, «Crear y agregar» quedaba apagado sin explicar por qué.
  - Si se tocaba sólo «Guardar», la rutina se guardaba sin ese ejercicio.
- **Arreglo (misma rama y PR #5):**
  - `packages/domain/src/exercise-guess.ts` (nuevo): sugerencia de grupo y forma de registro por el nombre, y búsqueda por palabras.
  - `member/OwnRoutines.tsx`: parecidos cuando no hay coincidencia, grupo y tipo sugeridos y cambiables, «Crear y agregar» que dice qué falta, y «Guardar rutina» que crea y agrega lo que está a medio cargar.
  - También el flag `myTraining.ai` de D184: Entrenar no pide la sugerencia de la IA cuando el servidor no la tiene.
- **Pruebas:**
  - Dominio 166 ✓ (nueva `exercise-guess.test.ts`).
  - Web 264 ✓ en 49 archivos, guardas 11 ✓, typecheck ✓ y build ✓.
  - E2E de la rama completa: 38 ✓ y 0 ✗. Nueva `own-routine-create.spec.ts`: el caso de la captura con un solo «Guardar» y el aviso de grupo faltante.
  - Para correr las E2E en local se purgaron las demos viejas de `repi_dev` (tope de demos abiertas).
  - No probado en un teléfono real.

## Arreglo urgente · Día sin ejercicios traba «Cargando entrenamiento…» (D185) — 03/11/2026

- **Reporte:** Javier, alumno de Urko en Smart: «Empezar» y «Continuar» quedaban en «Cargando entrenamiento…». **Diagnóstico** en producción, sólo lectura:
  - Su sesión abierta («Pecho-Cuadri», 20:13 UTC) es de un día **sin ejercicios** del programa anterior. Urko le asignó otro a las 20:20.
  - La pantalla de entrenamiento no tenía qué mostrar y, al estar abierta, «Empezar» siempre la reabría.
  - Es general: hay 4 días vacíos en programas activos, todos de Urko.
  - Sin intervención, el cierre automático (6 h sin actividad) la descarta hacia las 02:15 UTC.
- **Rama:** `fix/repi-empty-day-workout` desde `main` (`f912467`, lo que está en producción), independiente de los PR #3 y #4.
- **Código:**
  - `server/training/services.ts`: `startSession` rechaza un día vacío con `empty_day` y la rotación saltea los días vacíos.
  - `member/MemberApp.tsx`: `begin` no arma localmente un día vacío.
  - `member/Workout.tsx`: un entrenamiento vacío muestra el aviso y ofrece «Cortar este entrenamiento».
  - `coach/ProgramBuilder.tsx`: aviso en un día vacío.
- **Pruebas:**
  - Nueva `tests/empty-day.test.ts` (2 ✓).
  - Suite web 264 ✓ en 49 archivos y dominio 163 ✓. Typecheck ✓ y build ✓.
  - Verificado en Chromium móvil contra el build local: un día vaciado en `repi_dev` (demo) muestra el aviso y «Cortar» deja la sesión descartada.
  - Sin migraciones y sin tocar datos de producción.
- **También:** «Saltar descanso» podía volver atrás si la respuesta de la sincronización llegaba justo después (la copia anterior lo reponía). Ahora el descanso de la pantalla se conserva.
- **Pendiente:** autorización del titular para integrar y desplegar. Javier, después del despliegue: «Continuar» → «Cortar este entrenamiento» → empezar el programa nuevo.

## Bloque 01/06 · Cargas seguras e integridad (D182) — 03/11/2026

- **Pedido:** master prompt 01/06 (estabilización crítica) sobre las auditorías del 03/11 (Training Intelligence; Temas y métodos avanzados). Rama `fix/repi-p0-training-safety` desde `main` `f912467`; **sin desplegar ni integrar**. PR en borrador.
- **Código:** `packages/domain/src/load-safety.ts` (nuevo: señales, `checkLoad`, `startWeight`, `reducedLoadHint`, `progressionApplies`), `progression.ts` (`suggestNext` con `lastReps` y `signals`), `units.ts` (`cleanDecimalDraft`), `history-import.ts` (`importCanonical`, `importOverlap`); servidor `server/training/services.ts` (`lastTimeByExercise` con tipo, sensación y reps de esa vez; `trainingSignals`), `ai-coach.ts` y `solo-routine.ts` (validador común), `history-import.ts` (huella en `parsed.hash`, coincidencias, confirmación con candado por persona), `server/gym/access-control.ts` (`selfCheckin`); app `lib/offline/store.ts`, `member/{Workout,MemberApp,Presence,HistoryImport,RoutineImport,OwnRoutines,Solo}.tsx`, `coach/LoadSuggestion.tsx`.
- **Pruebas:** dominio 191 ✓ (antes 163); web 278 ✓ (antes 262; nuevas `training-safety`, `prefill`, casos D182 en `gym-access` e `history-import`); guardas 11 ✓; typecheck web ✓; build ✓. E2E local (Chromium preinstalado, build de producción contra `repi_dev`, demo): `weight-edit.spec.ts` ✓ móvil y escritorio; «registra una serie» ✓. «Cada pestaña abre sin errores» falla en este entorno por el 503 de `/api/me/solo/ai` sin `OPENAI_API_KEY` (no por este bloque). No probado en iPhone real.
- **Migraciones:** ninguna. La huella de importación va en el JSON `history_import.parsed` (borradores viejos la calculan al confirmar).
- **Decisión pendiente del titular:** con el pase vencido a mitad del entrenamiento, el servidor rechaza series nuevas (D127, prueba «vencido no registra series nuevas»). Se evaluó que el ingreso con que empezó la sesión la cubra hasta terminarla (máx. 6 h) pero cambia la política: no se implementó. Recomendación: aceptarlo (es la causa más probable de bloqueos a mitad de sesión con pases de 1–2 h).
- **PR #2 (D181, sin publicar):** toca Admin y el panel del gym (avisos al activar el control sin pantalla de QR); no se superpone con este bloque salvo `docs/DECISIONS.md` y este archivo (conflicto de texto esperable al integrar). Smart sigue con el control encendido: apagarlo en REPI Admin.
- **Para 02/06:** `kindAt`, `COMPARABLE_KINDS`, `REDUCED_KINDS`, `carriesLoad`, `startWeight`, `reducedLoadHint` y `progressionApplies` son el punto de enganche del modelo de bloques y etapas; `LocalSet.pend` es el estado «por elegir» que la grilla conectada debe conservar; `set_log` sigue sin tipo de serie (se deduce del plan congelado con `kindAt`).

## Rutinas propias sin check-in e importación sin errores mudos (D180) — 02/11/2026

- **Pedido (titular, con capturas):** socios de Smart Center Gym habilitados no podían empezar su rutina propia (cartel «Check-in requerido» y hoja «Validá tu ingreso»), y al importar una rutina salía «Revisá los datos ingresados».
- **Diagnóstico (Supabase, sólo lectura):** Smart tiene `gym_access_policy` encendida en híbrido desde el 01/11 16:41 (REPI Admin), **0 pantallas de QR y 0 ingresos validados**: hoy nadie puede validar por QR, sólo el equipo a mano («Solicitar ayuda en recepción»).
- **Código:** `server/training/services.ts` (`isSoloSession`; `startSoloRoutine` sin `gymPresence`; `logSet` y `setExerciseChange` sólo piden ingreso en sesiones del programa del gym); `components/member/MemberApp.tsx` (`startRoutine`/`startOwn` sin validar; el chip de check-in sólo con programa); `components/member/RoutineImport.tsx` (guarda contra «Guardar» con ejercicio sin elegir: nombra cuál, abre el buscador y lo muestra; aviso con el nombre); `server/training/own-routines.ts` (día con más de 12 ejercicios se parte en «Nombre 1/2…» con aviso; instrucciones de lectura para «12;10;9», pesos que no son kg y grupos separados).
- **Pruebas:** `gym-access.test.ts` (D180: rutina propia en HÍBRIDO empieza, registra serie y termina sin validar; el programa del gym sigue con `presence_required` — falla sin el arreglo; importación de 15 ejercicios queda en 12 + 3). Suite web 262 ✓ (48 archivos), guardas 11 ✓, typecheck ✓, build ✓. **Sin probar en navegador ni teléfono.** Sin migraciones.
- **Publicado** (pedido del titular, 02/11): PR #1 integrado en `main` (e999d19); `https://repiclub.com/api/version` devuelve `e999d19c028a`.
- **Pendiente del titular:** apagar el control de ingreso de Smart hasta que tenga la pantalla de QR en recepción (si no, quien entrena el **programa** del gym sigue necesitando que el equipo lo valide a mano cada vez).

## Modales que no se cierran al arrastrar (D179) — 01/11/2026

- **Código:** `components/ui/backdrop.ts` (nuevo, `useBackdropClose`); `components/ui/Modal.tsx` y `components/member/Sheet.tsx` lo usan en el fondo.
- **Pruebas:** navegador local (demo coach, «Series y técnica» de Sentadilla): escribir «100» en el peso y arrastrar desde el campo hasta fuera del modal → sigue abierto con «100»; clic simple en el fondo → se cierra. Typecheck ✓, build ✓, guardas 11 ✓. Sin migraciones.

## Series de cada alumno para coach y sala (D178) — 01/11/2026

- **Pedido:** Urko no encontraba qué pesos anotó su alumno; coaches y entrenadores de sala tienen que ver el detalle de todos sus alumnos para seguir el progreso.
- **Código:** `server/training/services.ts` (`sessionLogs`; `clientDetail` agrega `exercises` a cada sesión); `server/gym/services.ts` (`memberDetail` agrega `log`, últimas 10 sesiones, sólo con `attendance_training`); `components/coach/SessionLog.tsx` (nuevo: `SessionLog`, `LoggedSets`, comparación con la vez anterior); `CoachClients.tsx` («Registro de sesiones»); `components/gym/Members.tsx` (tarjeta «Entrenamientos registrados»); estilos `.slog*` en `coach.css`.
- **Pruebas:** `session-changes.test.ts` (el coach ve la serie con peso, reps, RIR y nota) y `gym.test.ts` (sala ve la serie del socio que comparte); suite web 260 ✓ (48 archivos) y guardas ✓. Navegador local: demo coach (Martina, sesión «Piernas» abierta con 4 ejercicios y sus series) y demo sala (socio con sesión en curso: «60 kg × 10 rep. · RIR 2 · Bien», «Quiero que venga un entrenador») en escritorio y móvil 375 px sin scroll horizontal.
- **Sin migraciones.**

## Constructor sin pérdida de cambios (D177) — 31/10/2026

- **Código:** `components/coach/ProgramBuilder.tsx` (`readDraft`/`writeDraft`/`clearDraft`, reintento con `retry`, `online`, `beforeunload`).
- **Pruebas:** navegador local (demo coach): con el guardado fallando, el nombre editado quedó en el navegador con aviso; al recargar se recuperó y se guardó (versión 2) y se borró el borrador. Typecheck ✓. **Sin hacer:** el editor de programa del gym (`Members.tsx`) guarda con botón; si falla, el modal queda abierto con el error (no se pierde mientras no se cierre).

## Incidente de acceso y DNS (D176) — 31/10/2026

- Síntoma: «ERR_CONNECTION_TIMED_OUT» para un coach en Argentina; la app estaba sana. Causa: IP anycast de Vercel 216.198.79.1 inalcanzable desde redes AR.
- Cambio (autorizado): registros A `@` y `www` → 76.76.21.21 en Vercel DNS (ids en D176). Verificado: el DNS de Vercel, 8.8.8.8 y 1.1.1.1 devuelven 76.76.21.21; `curl --resolve` a esa IP da 200 con el certificado válido.
- Pendiente: confirmar con Urko que ya entra (cachés de DNS de hasta 1 h). Si Vercel arregla el ruteo, se puede volver al ALIAS por defecto borrando esos dos registros.

## Eliminar y cambiar programas (D175) — 31/10/2026

- **Código:** `server/training/services.ts` (`archiveProgram`: archiva; si es copia de cliente cierra la asignación activa; audita); `components/coach/ProgramBuilder.tsx` («Eliminar» con confirmación, «Cambiar por otro» en programas de cliente); `components/coach/CoachClients.tsx` («Cambiar programa»).
- **Pruebas:** `training.test.ts` (eliminar plantilla no le quita el programa al cliente; asignar otro lo reemplaza; eliminar el del cliente lo deja sin programa) — 19 ✓. Navegador (demo coach): eliminar plantilla sale de la lista.
- **Sin hacer:** el editor de sala (gym, `Members.tsx`) no tiene «Quitar programa» al socio; si lo piden, mismo criterio con `program.kind = member_copy`. **Sin probar en navegador:** eliminar el programa de un cliente (cubierto por la prueba).

## Próxima acción (31/10/2026)

1. **F-AI-01: asistente de REPI para el coach** (pedido pendiente del titular, todavía sin empezar). Antes de diseñar, mirar lo que ya existe de IA: `server/training/ai-coach.ts` (sugerencia para el socio), `ProgramAssistant` («Armar con REPI», `components/coach/`), `server/training/own-routines.ts`. En la UI se dice «REPI», nunca «IA».
2. **Pendientes del titular:** confirmar los días de Smart (cargué lunes a viernes para Lisandro 16–20 y Manuel 18–22); Sofía (6–12) y la cuarta persona (12–16) cargan su horario al crear la cuenta; correo en spam: marcar «No es spam», Google Postmaster Tools, buzón para hola@repiclub.com.
3. **Sin probar en dispositivo real:** push de desafíos (D168/D172), foto desde la cámara (D169), movimiento reducido de la intro (D171).

## Nota por ejercicio (D174) — 31/10/2026

- **Código:** `components/coach/ExerciseNote.tsx` (`NoteButton`, `NoteField`); `ProgramBuilder.tsx` (`ExRow`); `components/gym/Members.tsx` (estado `noteOpen` «día:posición»); estilos `.ex-note-btn`, `.ex-note` en `coach.css` (también dentro del container query y del media de 720 px). Sin migración: `program_exercise.note` ya existía y el socio ya la ve en `Workout.tsx`.
- **Pruebas:** typecheck, e2e 36 ✓. Navegador (demo coach): 1700 px nota debajo de la fila; guardada tras recargar; 375 px con rótulo. **Sin probar en navegador:** el editor de programa del gym (mismo componente y estilos) y la nota vista por el alumno al entrenar (código previo).

## Constructor de programas: top set y peso en series rectas (D173) — 31/10/2026

- **Código:** `packages/domain/src/prescription.ts` (`presetPlan("straight")` con peso, `isStraightPlan`, `straightRow`, `uniformPlan`); `components/coach/ExerciseDetailEditor.tsx` (peso de referencia guardado en series rectas, resumen «N kg en todas las series»); `ProgramBuilder.tsx` y `components/gym/Members.tsx` (fila copia series/reps/RIR al plan); `styles/coach.css` (resumen debajo de la fila en la compu; container query de la fila a 640 px).
- **Pruebas:** dominio (`prescription.test.ts`: series rectas con peso, validación, objetivo del socio, copia desde la fila). Navegador (demo coach): 1700 px top set con cajitas alineadas; 1280 px columna angosta con rótulos; 375 px celular; peso 80 kg guardado y visible tras recargar.
- **D172 en navegador:** demo alumna propone desde Inicio («Tenés 1 propuesta esperando…»); demo profe la ve en Validaciones (número 1), aprueba con «Media» y queda publicada con «+40 puntos para tu nivel».

## Desafíos propuestos por socios (D172) — 31/10/2026

- **Migración:** `drizzle/0039_challenge_proposals.sql` (aditiva: `challenge.proposed_by`, `difficulty`, `reviewed_by`, `review_note`; estados `proposed`/`rejected` y avisos `proposal_*` son texto, sin restricción). Aplicada en dev, pruebas y Supabase.
- **Dominio:** `community.ts` (`CHALLENGE_DIFFICULTY` 20/40/70, `isDifficulty`, `MAX_PENDING_PROPOSALS`); `levels.ts` (`challengeXp`, `validatedXp`).
- **Servidor:** `server/community/services.ts` (`proposeChallenge`, `listProposals`, `reviewProposal`, `communityChallenges`; `myGymHome` con `difficulty`, `by` y `proposals`); `server/community/levels.ts` (puntos por dificultad). Rutas: `POST /api/me/gym/proposals?org=`, `GET /api/me/gym/community-challenges`, `GET /api/gym/:org/proposals`, `POST /api/gym/:org/proposals/:id`.
- **UI:** `components/member/CommunityChallenges.tsx` (sección de Inicio, `ProposeSheet`, `DifficultyChip`; estilos `.cch*`, `.chd*`); `Gym.tsx` (Desafíos: «Proponer un desafío», mis propuestas, chip de dificultad y autor); `components/gym/Community.tsx` (`Proposals` dentro de Validaciones; `.prop-row`); `GymApp.tsx` (número de Validaciones con propuestas).
- **Pruebas:** `challenge-proposals.test.ts` (validaciones, tope de 3, oculto hasta aprobar, dificultad obligatoria, una sola revisión, premio por defecto, aviso, rechazo con motivo, validado en sala suma 40 y no 30).

## Intro de marca (D171, F-BR-02) — 30/10/2026

- **Código:** `components/motion/BrandIntro.tsx` (montada en `MemberApp.tsx` con `abort` si hay entrenamiento abierto); estilos `.bi*` en `member.css`; capas en `public/brand/intro/` (copiadas del video de lanzamiento).
- **Verificado en navegador (375 px):** cuadros a 1,25 s (isotipo con el punto), 1,9 s y 2,0 s (lockup y punto de la «i»), 2,28 s (iris nítido), retiro al terminar, sin intro en la misma sesión, versión corta de 0,48 s centrada. Probar en un teléfono real: `https://repiclub.com/app?intro=1`.
- **Sin probar:** movimiento reducido en un dispositivo (el código sólo funde).

## Horario del profesor y turno automático (D170) — 30/10/2026

- **Migración:** `drizzle/0038_staff_hours.sql` (tabla `staff_hours`, `shift_log.source`). Aplicada en dev, pruebas y Supabase.
- **Dominio:** `packages/domain/src/gym.ts` (`WeeklyHours`, `weeklyHoursOk`, `inWeeklyHours`, `slotOn`, `fmtWeeklyHours`, `WEEKDAYS`) + `hours.test.ts`.
- **Servidor:** `server/gym/services.ts` (`ensureScheduledShift` en `gate` y `myShift`, `syncScheduledShifts` en el cron de notificaciones, `staffHoursFor`, `setStaffHours`); `myShift` devuelve `hours`, `auto`, `autoEndsAt`. Rutas `GET/POST /api/gym/:org/hours`.
- **UI:** `components/gym/Hours.tsx` (`HoursModal`, `HoursPrompt`), `GymApp.tsx` (aviso al entrar), `Floor.tsx` (horario y «se cierra a las…»), `GymGuide.tsx`.
- **Pruebas:** `staff-hours.test.ts` (pide horario, valida, abre a las 16:05 una vez, cierra a las 20:00, no reabre uno cerrado a mano, gerencia carga el de su equipo y un profe no el de otro, `gate` pasa sin «Iniciar turno»). Navegador (demo profe): guardar 6 a 12 y ver el horario en «Mi turno».
- **Smart (prod):** Lisandro 16–20 y Manuel 18–22, lunes a viernes. **Pendiente del titular:** confirmar días (¿sábados?), y Sofía (6–12) y la cuarta persona (12–16) cargan el suyo al crear su cuenta (o la gerencia desde la API).

## Perfil del socio con foto, máximos y fotos en el Club (D169) — 30/10/2026

- **Migración:** `drizzle/0037_club_profile_media.sql` (`club_post.image_id`, `club_profile.avatar_id`, `club_profile.show_maxes`). Aplicada en dev y pruebas; Supabase al desplegar.
- **Servidor:** `server/community/club.ts` (`uploadClubImage`, `ownClubImage`, `maxesOf`, `createClubPost` con `imageId`, perfil con `avatarId`/`showMaxes`, `viewClubProfile` con foto, máximos y fotos; `feed` con `avatarId` e `imageId`); `authorizeCommunityMedia` para `club_image`. Rutas: `POST /api/me/gym/club/images`, `GET /api/me/gym/club/profile/me`.
- **UI:** `components/member/Gym.tsx` (`Avatar`, `useClubPhoto`, `MeCard`, `MaxList`, «Agregar foto» en el compositor, hoja de perfil, editor con foto y «Mostrar mis máximos»); `lib/image.ts`; estilos `.club-av`, `.club-img`, `.club-max`, `.club-grid`, `.club-pf-head`.
- **Pruebas:** `club-profile.test.ts` (sólo socios del Club suben, archivo inválido, máximo 110 × 3 con 1RM 121, máximos ocultos hasta elegirlos, foto publicada una vez, la ve el Club y no quien no está, bloqueo corta el acceso, foto ajena no se usa). Navegador (demo alumna, 375 px, almacenamiento local): foto de perfil, publicación con foto, hoja de perfil.
- **Sin probar:** subir una foto real desde la cámara de un teléfono (en la prueba se generó en el navegador).

## Invitaciones a rankings y desafíos (D168), tarea al guardar programa y correo en spam (D167) — 30/10/2026

- **D167 tarea:** `server/gym/services.ts` (`closesWithProgram`, `memberDetail.programTaskId`); `components/gym/Members.tsx` usa la tarea que elige el servidor. Prueba en `gym.test.ts` (tarea `in_progress` tomada se cierra; otro profe no la ve).
- **D167 correo:** DMARC `p=quarantine` en Vercel DNS (registro `_dmarc`, rec_fad54ada9e39ccf221b962f9); texto del código con motivo (`server/auth.ts`, `OTP_WHY`); `resendDomain(..., harden)` apaga seguimiento de aperturas y clics (`/api/cron/mail-domain?harden=1`, con CRON_SECRET). Pendiente del titular: marcar «No es spam», Google Postmaster Tools, buzón para hola@repiclub.com si se quieren respuestas.
- **D168 migración:** `drizzle/0036_challenge_exercise.sql` (`challenge.exercise_id` opcional). Aplicada en dev y pruebas; Supabase al desplegar.
- **D168 servidor:** `server/community/nudges.ts` (`communityNudges`, `placeAmong`); `club.ts` (`rankingMembers`, `liftBests`, `optIntoRanking`); `services.ts` (`createChallenge` con `exerciseId` y push `challenge_new`; `decideAttempt` avisa `challenge_beaten`; `myGym` exportado; `staffCommunity.exercises`). Rutas: `GET /api/me/gym/nudges`, `POST /api/me/gym/club/ranking`.
- **D168 UI:** `components/member/Nudges.tsx` (`.ndg*`); Inicio, resumen del entrenamiento (`Workout.tsx` `onNudge`), Desafíos (`Gym.tsx`, abre el intento con `openChallenge`), `/app?gym=ch`; `components/gym/Community.tsx` (selector «Ejercicio que mide»).
- **Pruebas:** web 255 ✓ (`nudges.test.ts`: puesto, «serías récord», «entrarías 2°», récord superado con push, aviso de desafío nuevo, sumarse al ranking y puesto en el Club), dominio 160 ✓, guardas ✓. Navegador (demo alumna, 375 px): tarjetas en Inicio y «Ver desafío» abre el intento.
- **Sin probar:** push real en un teléfono (cubierto por la cola en la prueba).
- **Próximo:** perfil del socio con foto, máximos y publicaciones con imagen (pedido 30/10); animación de entrada (F-BR-02); asistente de REPI para el coach.

## Nivel REPI y trofeos con desbloqueo 3D (D166) — 30/10/2026

- **Dominio:** `packages/domain/src/levels.ts` (`XP`, `levelFromXp`, `xpBreakdown`, `TROPHIES`, `trophyState`, `isFullBody`) + `levels.test.ts`; `ACHIEVEMENT_KIND.trophy`.
- **Servidor:** `server/community/levels.ts` (`levelStats`, `syncTrophies`, `myLevel`, `markTrophiesSeen`, `levelOfUser`); `app/api/me/level/route.ts`; `awardTrainingAchievements` otorga trofeos; `myGymHome.level` es el nivel nuevo; `markNoticesSeen` no toca trofeos; la ficha del socio para el equipo usa `levelOfUser`. Sin migración (`achievement.kind` es texto).
- **UI:** `components/member/Trophies.tsx` (`Medal`, `LevelPanel`, `TrophyUnlock`); en `MemberApp.tsx` (Progreso y desbloqueo automático, salvo demo) y `Gym.tsx` (Logros). Estilos `.lv*`, `.tcase*`, `.tm*`, `.tu*` en `member.css`; la píldora de la demo se oculta con `.tu`.
- **Pruebas:** dominio 160 ✓, web 253 ✓ (`levels.test.ts`: 2 sesiones → 2 días, 6 récords, 6 ejercicios, 6,6 t, una semana de cuerpo completo = 152 puntos, nivel 2, trofeos Fuerza y Cuerpo completo bronce, no se otorgan dos veces, abrir el gym no los marca vistos, récord del gym suma 60), guardas ✓, sin deriva, E2E 36/36 ✓. Navegador (iPhone emulado, demo alumna): nivel 4 con 347 puntos, vitrina en Progreso y Logros, animación revisada cuadro por cuadro (620/1900 ms y final), giro con el dedo muestra la cara trasera y vuelve; plata y oro revisados.
- **Arreglo durante la prueba:** el brillo animado con `fill: both` hacía que Chrome dibujara el frente espejado durante el giro; ahora se anima sin relleno previo.
- **Sin probar en navegador:** el salto automático con una cuenta real (en la demo no salta a propósito); cubierto por la prueba de `unseen`.
- **Próximo:** animación de entrada de la marca (F-BR-02) y asistente de REPI para el coach.

## Récord validado en sala por el profe (D165) — 30/10/2026

- **Migración:** `drizzle/0035_attempt_in_person.sql` (`challenge_attempt.video_id` opcional, columna `method`). Aplicada en dev, pruebas y Supabase.
- **Dominio:** capacidad `challenges.witness` (entrenador de sala y coordinación) en `packages/domain/src/gym.ts`.
- **Servidor:** `server/community/services.ts`: `submitAttempt` con `inPerson`; `validationScope`, `listValidations` y `decideAttempt` (turno en la sede para el piso, `value` con la marca vista, aviso con el nombre de quien validó); `last.method` en `myGymHome`. Rutas en `app/api/me/gym/[[...path]]` y `app/api/gym/[orgId]/[...path]`. Texto de REPI Gym en `server/ai/gym-kb.ts`.
- **UI:** `components/member/Gym.tsx` (hoja «Con video / En sala con un profe», aviso en la tarjeta); `components/gym/Community.tsx` (`ValidationsScreen` con «Marca que viste» y «Lo vi: aprobar récord», `.vl-*` en `coach.css`); `GymApp.tsx` (Validaciones con contador para el piso).
- **Pruebas:** web 252 ✓ (`community` D165: sin confirmar no envía, el profe ve sólo en sala de su sede, no decide video, sin turno `no_shift`, marca corregida a 97,5 kg con récord y aviso, otra sede `not_found`, dueño ve todo y rechaza, recepción `forbidden`), dominio 156 ✓, guardas ✓, sin deriva, E2E 36/36 ✓. Navegador: demo socio (iPhone emulado) pide validación en sala de Dominadas; demo profe de sala: «Validaciones» en el menú, intento en sala (creado en la base local del sandbox), anota 14 en vez de 15 y aprueba → récord y aviso «Lo validó Sofía Ramírez en sala»; sin scroll horizontal a 375 px.
- **Sin probar:** el flujo socio → profe en un mismo gimnasio real (las demos de cada rol son sandboxes distintos).
- **Próximo:** trofeos del club con niveles por pesos, récords, tipos de entrenamiento y variedad; animación de entrada; asistente de REPI para el coach.

## Videos de ejercicios (D164) — 30/10/2026

- **Migración:** `drizzle/0034_exercise_media.sql` (tabla `exercise_media`, propósito `exercise_video` en `media_object` y `upload_intent`). Aplicada en dev, pruebas y Supabase.
- **Servidor:** `server/training/exercise-media.ts` (`requireMediaManager`, `canSeeOrgMedia`, `cleanVideoLink`, `listExerciseMedia`, `setExerciseLink`, `setExerciseUpload`, `removeExerciseMedia`, `mediaFor`); rutas `app/api/org/[orgId]/exercise-media` (+ `/upload` sólo para disco local); `exercise_video` en `server/uploads.ts`; `authorizeVideo` y la purga en `server/followup/services.ts`; `getSession` devuelve `media` por ejercicio.
- **UI:** `components/coach/ExerciseVideos.tsx` (pantalla «Videos de ejercicios» en Coach y Gym, `.xv-*`); `Workout.tsx` («Ver cómo se hace» o «Buscar cómo se hace en YouTube», `.wo-howto`).
- **Biblioteca gratuita:** no hay una usable (detalle en D164).
- **Pruebas:** web 250 ✓ (`adaptive` D164: enlace válido e inválido, permisos, el alumno lo ve en la sesión, el video reemplaza el enlace, `authorizeVideo` para el alumno y un tercero, quitar), dominio 156 ✓, guardas ✓, sin deriva, E2E 36/36 ✓. Navegador (demo coach, escritorio y teléfono emulado): buscar, enlace inválido rechazado, enlace de YouTube guardado («Cargados: 1»); demo alumno: «Buscar cómo se hace en YouTube» en Press de banca.
- **Sin probar en navegador:** subir un archivo de video real al almacenamiento de producción y verlo en el entrenamiento.
- **Próximo:** el profe de sala valida el récord en persona; después trofeos del club con niveles, animación de entrada y asistente de REPI para el coach.

## Ejercicios propios del alumno (D163) — 30/10/2026

- **Migración:** `drizzle/0033_member_exercise.sql` (columna `exercise.owner_user_id`, índice `exercise_owner_idx`, índice único de nombres con dueño). Aplicada en dev, pruebas y Supabase (RLS sin cambios: misma tabla).
- **Servidor:** `catalogOnly`, `visibleIn` y `createMemberExercise` en `server/training/library.ts`; `createMyExercise` en `own-routines.ts`; `POST /api/me/exercises`. Todas las consultas de biblioteca pasan por `visibleIn`.
- **UI:** `Picker` en `components/member/OwnRoutines.tsx` («Crear «…»», grupo, tipo; marca «tuyo»); `RoutineImport.tsx` («Elegir o crear» con el nombre escrito).
- **Pruebas:** web 249 ✓ (`adaptive` D163: crear, sin duplicar, nombre del catálogo devuelve el del catálogo, entrenar y última marca, otro alumno y el coach no lo ven), dominio 156 ✓, guardas ✓, sin deriva, E2E 36/36 ✓. Navegador (iPhone emulado, demo alumno): crear «Camilla de isquios» desde el buscador y guardar la rutina.

## Subir la rutina propia y «Te toca hoy» (D162) — 30/10/2026

- **Dominio:** `parseRoutineCsv` en `packages/domain/src/routine-import.ts` (+ test).
- **Servidor:** `previewRoutineImport` y `next` en `listOwnRoutines` (`server/training/own-routines.ts`, orden de carga); ruta `app/api/me/routines/import/route.ts`; `matchExercises` exportado de `history-import.ts`.
- **UI:** `components/member/RoutineImport.tsx` (subir y revisar); `OwnRoutines.tsx` («Subir», «Te toca hoy», `NextOwnRoutine` para Inicio); `readImportFile` compartido en `HistoryImport.tsx`.
- **Pruebas:** dominio 156 ✓, web 248 ✓ (`adaptive` D162: planilla sin IA, emparejamiento, foto sin REPI → `ai_unavailable`, rotación A → B → A), guardas ✓, sin deriva, E2E 36/36 ✓. Navegador (iPhone emulado, demo alumno, REPI real): texto libre de 2 días → emparejó «Press plano», «Aperturas c/ mancuernas» y «Tríceps soga»; «Camilla de isquios» se eligió a mano (Curl femoral); guardó 2 rutinas con «Te toca hoy».
- **Sin probar en navegador:** la tarjeta de Inicio sin programa (la alumna de la demo tiene programa) y una foto real.

## Propuesta de «Armar con REPI» editable (D161) — 30/10/2026

- **UI:** `components/coach/ProgramAssistant.tsx` (prop `library`; la pasan `ProgramBuilder` y `gym/Members`). Estilos `.pa-ex*`, `.pa-pick`, `.pa-change` en `styles/coach.css`.
- **Servidor:** `draftProgram(orgId, brief, revise?)` y `reviseOf` en `server/training/program-ai.ts`; `BriefZ` acepta `change` y `current`; `coachProgramDraft` y `memberProgramDraft` registran `revised` en la auditoría (sin el texto del pedido).
- **Pruebas:** web 247 ✓ (`adaptive` D161 con respuesta de REPI simulada: cambia sólo lo pedido y conserva lo editado; sin REPI da `ai_unavailable`; ejercicio ajeno da `invalid`), guardas ✓, E2E 36/36 ✓. Navegador (demo coach, REPI real): editar, reordenar, quitar, agregar, «Cambiá Peso muerto por prensa» → sólo ese cambio; «Usar esta propuesta» lleva lo editado al editor; teléfono emulado sin scroll horizontal.
- **Sin probar en navegador:** la misma pantalla en REPI Gym (mismo componente).

## Entrenamientos que no quedan abiertos y recordatorio de alta (D160) — 30/10/2026

- **Pop-up:** `components/member/Workout.tsx` (estado `still`, `lastAct`, `WORKOUT_IDLE_PROMPT_MS` = 20 min en `packages/domain/src/gym.ts`). «Volver» con el entrenamiento abierto pregunta; también tras 20 min sin tocar nada (no en descanso).
- **Cierre automático:** `workoutAutoClose` (dominio) y `closeIdleWorkouts` (`server/training/services.ts`) en `/api/cron/notifications` (`workoutsClosed`). Gym: fuera de 6 a 22; todos: 6 h sin actividad. Terminan en la última actividad. `MemberApp.load` actualiza la copia local si el servidor lo cerró.
- **Recordatorio:** `remindPendingConsent` (`server/join/services.ts`), cron `consentReminders`: a las 8 hora argentina, una vez por socio (auditoría `join.consent_reminder`). Las 5 altas de Smart Center lo reciben a las 8 del 30/10.
- **Pruebas:** dominio 155 ✓, web 246 ✓ (cierre por inactividad en `adaptive`, recordatorio en `annex`), guardas ✓, E2E 36/36 ✓. Navegador (iPhone emulado): «Volver» → pop-up; «Pausar y seguir más tarde» pausa y sale; con el reloj adelantado 21 min aparece solo y «Pausar» pausa.
- **Sin probar:** el cierre por horario del gym en integración (las pruebas corren con `REPI_GYM_HOURS=off`; la regla está cubierta en dominio). Verificar a las 8 que salieron los 5 recordatorios (auditoría `join.consent_reminder` y Resend).

## Auditoría post-lanzamiento (D159) — 30/10/2026

- **Producción (sólo lectura):** sin errores en la última hora de Vercel. 5 de 7 altas aprobadas en Smart Center siguen en `pending_consent`: nunca volvieron a entrar. La cola push dice «sin dispositivos» para todos salvo una suscripción (titular).
- **Arreglos:** email al aprobar o rechazar el acceso (`mailJoinDecision` en `server/join/services.ts`); `purgeSandboxes` borra programas y alumnos antes que la organización y aísla cada demo; `/api/cron/notifications` corre cada tarea por separado; `.modal` con `max-height: 100%` y `.modal > * { flex-shrink: 0 }`; `.sheet` debajo del difuminado; check-in sin programa; `.gq-warn` sobre la zona segura. Detalle en BUG_REGISTER (AUD-1 a AUD-4).
- **Pruebas:** web 245 ✓ (`annex` con email de aprobación, `sandbox` con ejercicio propio en un programa, falla sin el arreglo), guardas ✓, sin deriva de esquema, E2E 36/36 ✓, navegador con iPhone emulado (modal largo con zona segura de 90 px).
- **Resuelto en D160:** las 5 personas trabadas reciben el recordatorio a las 8 y los entrenamientos olvidados se cierran solos.

## Horario del gym, «Mis rutinas» y sugerencias sin email (D158) — 29/10/2026

- **Horario 6 a 22:** `GYM_HOURS`, `gymOpenAt` y `shiftAutoEnd` en `packages/domain/src/gym.ts`; `startShift` rechaza fuera de horario y `closeShiftsAfterHours` (en `/api/cron/notifications`) cierra los turnos abiertos a las 22. No aplica a demos ni a las pruebas (`REPI_GYM_HOURS=off` en `tests/setup-env.ts`; la regla tiene su propia prueba en `gym.test.ts`). Es el mismo horario para todos los gimnasios: si otro gimnasio abre distinto, hay que hacerlo configurable por sede.
- **Mis rutinas:** `server/training/own-routines.ts`, rutas `/api/me/routines` (GET, POST), `/api/me/routines/[id]/delete`, `/api/me/routines/[id]/start` y `/api/me/exercises`; UI `components/member/OwnRoutines.tsx` en Entrenar. `startSoloRoutine` acepta `source: "own"`. Migración `0032_own_routine` **aplicada en `repi_dev` y en producción** (aditiva, con RLS).
- **Sugerencias:** sin `notifyIdea`; sólo REPI Admin → Sugerencias.
- **Arreglo de paso:** `.sheet > * { flex-shrink: 0 }`: en hojas largas los botones quedaban aplastados.
- **Pruebas:** web 245 ✓, dominio 154 ✓, guardas ✓, E2E 36/36 ✓, sin deriva de esquema. Navegador (iPhone emulado): armar, guardar y empezar una rutina propia; la sesión muestra la serie anterior y la sugerencia de REPI.
- **Resuelto en D163:** el alumno crea los ejercicios que no están en la biblioteca.
- **Chat del alumno (después de D158):** con la conversación abierta el chat ocupa todo el alto y el campo para escribir queda a 12 px de la barra (antes, ~195 px de vacío). Arriba, 12 px menos de aire (sigue fuera del difuminado de iOS 26, D122). El texto del campo dice «Escribile al equipo de sala» (decía «a el»). CSS en `member.css` (`.mb-scroll:has(.mb-chat)`), texto en `ChatPane.tsx`.

## Alta aprobada sin 404 y sugerencias en Inicio (D157) — 29/10/2026

- **Bug (JOIN-1):** una socia aprobada por QR veía «404» al entrar. «Continuar» volvía a pedir el acceso, salteaba el consentimiento y `/app` daba `notFound()` con la membresía en `pending_consent`. Afectó a las 2 últimas altas de producción, que ahora entran y ven el consentimiento.
- **Archivos:** `components/access/AccessFlow.tsx` (`afterAuth`, `requestJoin`), `server/join/services.ts` (`href` según estado), `app/app/page.tsx` (redirige a `/acceso`).
- **Sugerencias:** `Ideas.tsx` ahora vive en Inicio (`Home` en `MemberApp.tsx`), plegada; ya no está en Perfil.
- **Pruebas:** web 243 ✓ (`annex.test.ts` cubre el `href`), E2E 36/36 ✓. Navegador: `/app` y el QR con `pending_consent` llevan a «Qué ve Gym Norte» → app.
- **Próxima acción:** confirmar con la socia afectada que ya entra.
- **Incidente 29/10, 22:43–22:58 (resuelto):** al diagnosticar JOIN-1, un `SET default_transaction_read_only=on` hecho por el pooler en modo transacción (`DATABASE_URL`, puerto 6543) quedó pegado a una conexión de la app. Dio 500 con código 25006 en `/api/me/notifications`, `/api/me/inbox` y el cron de notificaciones. Se corrigió solo cuando Supavisor recicló la conexión; desde las 22:59 no hubo más errores. Sólo fallaron lecturas y marcas de visto: no se perdieron entrenamientos ni datos. **Regla:** para leer producción usar `DATABASE_URL_SESSION` con `BEGIN READ ONLY … COMMIT`, nunca un SET de sesión.

## «Sugerí una mejora» (D156) — 29/10/2026

- **Alumno:** `components/member/Ideas.tsx`, en Perfil.
- **Servidor:** `server/support/services.ts`: categoría `idea`, `notifyIdea` (email a `ALERT_EMAIL`), filtro `ideas` y `ideasNew`.
- **Admin:** «Sugerencias» en `AdminApp.tsx`.
- **Pruebas:** web 243 ✓, E2E 36/36 ✓. Navegador: el alumno la manda y la ve «Enviada».

## «Armar con REPI» (D155) — 29/10/2026

- **Servidor:** `server/training/program-ai.ts` (`draftProgram`, `cleanBrief`), `memberProgramDraft` (gym) y `coachProgramDraft` (coach).
- **Rutas:** `POST /api/gym/:org/members/:id/program-draft` y `POST /api/coach/:org/programs/draft`.
- **UI:** `components/coach/ProgramAssistant.tsx`.
- **Arreglo:** carrera vieja en `Workout.tsx`. Al sincronizar el inicio, una copia vieja podía pisar el peso tipeado de una serie sin completar.
- **Pruebas:** web 242 ✓, dominio 153 ✓, E2E 36/36 ✓. Con IA real en local: 4,4 s, evita la zona lesionada y el nombre no menciona la salud.

## Carga sugerida por REPI (D154) — 29/10/2026

- **Regla:** `packages/domain/src/progression.ts` (`suggestNext`, `applyLoad`).
- **Servidor:** `lastTimeByExercise` y la sugerencia en `myTraining` y `getSession`; `coachProgramLastTimes` (`server/training/services.ts`); `memberLastTimes` (`server/gym/services.ts`).
- **UI:** «REPI sugiere hoy» en `Workout.tsx`; precarga en `begin` y `fromServer`; `LoadSuggestion` en el constructor del coach y el editor del gym.
- **Pruebas:** dominio 153 ✓, web 242 ✓, E2E 36/36 ✓. Navegador: el alumno de la demo ve «53 kg × 8 reps» con el porqué.

## Entrenar sin rutina asignada (D153) — 29/10/2026

- **Qué cambió:** «No vino el profe» y «Quiero entrenar por mi cuenta» funcionan aunque la persona no tenga rutina.
  - REPI arma la rutina de hoy con la biblioteca (`server/training/solo-routine.ts`, con IA y respaldo por reglas).
  - Se empieza con `startSoloRoutine` en `server/training/services.ts`. Rutas: `/api/me/solo/routine` y `/api/me/solo/routine/start`.
  - UI: `RoutineCard` en `components/member/Solo.tsx` y `startRoutine` en `MemberApp.tsx`.
- **Diseño:** la sesión usa un programa `solo` de un día con la asignación ya cerrada. No es «el programa» de la persona. Sin migración.
- **Pruebas:** web 240 ✓ (3 nuevas en `tests/adaptive.test.ts`), dominio 146 ✓, E2E 36/36 ✓. Navegador (iPhone emulado, local): armó 4 ejercicios y abrió el entrenamiento.
- **Siguiente:** que el titular lo pruebe con un alumno real sin rutina.

## AUDITORÍA QA (D151) y QR de la sede (D152) — 29/10/2026 (leer primero)

- **Estado:**
  - En `main` y publicado. El titular autorizó publicar.
  - **Sin migraciones.**
  - `apps/web/vercel.json` despliega sólo `main`: las ramas no generan previews, que fallaban por falta de variables de Preview.
- **Auditoría:**
  - 48 defectos válidos: 46 corregidos y 2 riesgos aceptados (SEC-9 = D119 admin sin 2FA; esbuild de una herramienta de desarrollo).
  - Informe: `docs/qa/QA_MASTER_REPORT.md`. Registro: `docs/qa/BUG_REGISTER.md`.
- **D152:** el QR de la sede (`/unirse/<slug>`) va directo a «Pedí tu acceso». La guía para agregar a inicio aparece con la solicitud enviada.
- **Pruebas:**
  - Web 238 ✓, guardas ✓, dominio 146 ✓, `tsc` ✓, build ✓.
  - E2E: con `cd apps/web && pnpm build && pnpm start` corriendo, en otra terminal `pnpm e2e`. Resultado: 36/36 (Playwright + Chrome + axe, sólo contra un servidor local).
- **Siguiente:**
  1. Que el titular pruebe el QR con un teléfono real.
  2. 2FA de admin cuando lo decida (SEC-9).
  3. Teléfonos reales (LB-03).
  4. Si un contrato supera ≈ ARS 21,4 M por período, migrar los importes a bigint.

## TRASPASO PARA OTRO AGENTE — 29/10/2026 (leer primero)

**Estado:** todo lo pedido hasta **D150** está en `main` y publicado en https://repiclub.com (verificar con `curl https://repiclub.com/api/version`). Migraciones hasta 0031 aplicadas en Supabase (0031 = `gym_access_display.purpose`). Nada pendiente sin commitear salvo `docs/continuidad/CODEX_PARA_CLAUDE.md` (no tocar).

**Cómo trabajar (mandato del titular):** seguir sin preguntar, bloque tras bloque; commit y push a `main` de cada bloque; actualizar `docs/DECISIONS.md` (una fila por decisión, D-número siguiente: **D157**) y este archivo al cerrar cada bloque; chat en español y conciso; Barlow / Barlow Condensed, no tocar logo. En la interfaz decir «REPI», no «IA» (D141), salvo la mención de OpenAI en notas de privacidad.

**Comandos:** web `cd apps/web && pnpm vitest run` (221 pruebas; `tests/global-setup.ts` borra sólo la base `repi_test`), `pnpm test:guards`, `pnpm exec tsc --noEmit`, `pnpm build` (con el dev detenido; después `git checkout next-env.d.ts`). Dominio `cd packages/domain && pnpm test && pnpm typecheck` (141). Migraciones: `pnpm db:generate --name X`, `pnpm db:migrate` (dev, base `repi_dev`); producción: `DATABASE_URL="$(grep ^DATABASE_URL_SESSION ~/.repi-secrets/supabase.env | cut -d= -f2-)" npx tsx scripts/migrate.ts` desde `apps/web`, **antes** del push. Dev server: launch `repi-local`. Demo: `POST /api/demo {role: owner|floor|member|coach}` (límite 6/h por IP, en `app_rate_limit`).

**Secretos (nunca en el repo ni en logs):** `~/.repi-secrets/supabase.env`, `~/.repi-secrets/openai.env`. OpenAI: `OPENAI_API_KEY` y `OPENAI_MODEL=gpt-4.1-mini` en Vercel y en `apps/web/.env.local`. El titular rota la clave cuando avise (no insistir). Respuestas de IA ≤3 s: gpt-4.1-mini con salida corta (gpt-5-mini tarda 4–17 s; gpt-4.1-nano dado de baja).

**Resuelto en esta tanda (D127–D141):** Gym Access (D127); invitaciones, calendario y ver contraseña (D128, D130, D136); ejercicios propios y catálogo (D129); «En sala ahora» (D131); historial anterior con IA (D132) y desde Excel/ODS (D140); «No vino el profe» con IA (D133), con respuesta del alumno y reemplazos válidos (D138) y «Lo que buscás entrenando» (D139); prescripción avanzada (D134) y superseries que alternan solas (D137); guía del dueño (D135); textos «REPI» y privacidad al día (D141).

**Pedidos nuevos del titular (29/10/2026, en curso — si este agente no llegó, seguir acá):**
- **A. Cambios de rutina en tiempo real: HECHO (D143 + D145).** Con entrenamiento abierto, «Aplicar ahora» pasa lo hecho a la versión nueva.
- **B. Ranking por gimnasio y ejercicio en vivo: HECHO (D144 + D146 pantalla de la sala).** Falta, si el titular quiere: rankings por categoría (peso corporal, sexo, edad) con consentimiento.

**Alertas y correos (D149):** alertas de errores a `ALERT_EMAIL` (Vercel) y todos los correos con plantilla REPI. Foto de perfil del remitente en Gmail: requiere que el titular (a) reciba correo en hola@repiclub.com (reenvío gratis, p. ej. ImprovMX, con registros MX en Vercel DNS) y (b) cree una cuenta de Google con esa dirección y le ponga el ícono de REPI; o BIMI con certificado VMC/CMC (pago). Claude no crea cuentas. (En pausa por decisión del titular, 29/10/2026.) D150: la cabecera del correo es `icons/mail-header.png` (ícono igual al de la pantalla de inicio + marca sobre fondo oscuro); se regenera con `npx tsx scripts/brand-icons.ts`.

**Decisiones del titular pendientes:**
1. El titular decidió **no** pedir nueva aceptación por ahora (no subir `TERMS_VERSION`); lo revisa más adelante con el abogado.
2. La precarga de «No vino el profe» manda datos de entrenamiento a OpenAI al abrir Entrenar (sin tocar el botón). Si el abogado lo pide, pasar a pedirla sólo al tocar (pierde la respuesta instantánea).

**Próximos pasos sugeridos:**
1. Excel verificado con 25 archivos reales (D142). Falta: un .ods real y los archivos del alumno de Urko.
2. HECHO (D147): «Lo que buscás entrenando» lo ve el coach o el gym si la persona marca «Que lo vea quien arma mi rutina».
3. Que entrenadores reales prueben «Series y técnica» en el celular. HECHO (D148): cronómetro para series por tiempo y contador para AMRAP/al fallo.
4. «No vino el profe» medido en producción (D142): primera sugerencia 2,3–3,8 s (se precarga al abrir Entrenar), rearmar 2,7–3,8 s, reemplazo correcto 3 de 3.
6. Bloqueantes del titular (docs/LAUNCH_BLOCKERS.md): LB-02 planes pagos de Vercel/Supabase, LB-03 teléfonos reales, LB-04 abogado y datos de la empresa, LB-05 respaldos fuera de la computadora, LB-06 alertas de errores; además dominio de correo y rotar la clave de OpenAI.
5. Pendientes externos: cámara del QR de ingreso en iPhone/Android reales (LB-03), revisión legal de la ubicación (Gym Access), dominio de correo.

## Último bloque cerrado — 29/10/2026 · Superseries (D137), respuesta a la IA (D138), deseos (D139), Excel (D140) y textos «REPI» (D141)

- **Hecho:** `comboNext` + vista previa A1/A2 (`MemberApp.tsx`, `Workout.tsx`); `dayAlternatives` (`server/training/services.ts`), `aiSoloAdvice(…, follow)` (`server/training/ai-coach.ts`), `/api/me/solo/ai` con `follow`, tarjeta con «Ocupada / No hay / Me molesta» y «Rearmar mi rutina» (`components/member/Solo.tsx`), plan aceptado aplicado al iniciar (`aiPlan` en `MemberApp.tsx`); `packages/domain/src/wishes.ts`, `components/member/Wishes.tsx`, `server/settings/services.ts` (**migración 0030**); `src/lib/spreadsheet.ts` + `HistoryImport.tsx`; textos y `app/legal/[doc]/texts.ts`.
- **Pruebas:** dominio 140, web 218 (nuevas: `spreadsheet.test.ts`, casos en `substitutions.test.ts` y `settings.test.ts`). Navegador (dev): A1→A2 sin descanso, rearmado con reemplazos aplicados en la sesión, guardado de deseos.
- **Siguiente:** ver «Decisiones del titular pendientes» y «Próximos pasos» arriba.

## Bloque anterior — 29/10/2026 · Prescripción avanzada (D134), guía con IA del dueño (D135) y aceptar invitación con la cuenta abierta (D136)

- **Hecho:** `packages/domain/src/prescription.ts` (+ tests); `program_exercise.detail` (**migración 0029**); `components/coach/ExerciseDetailEditor.tsx` en ambos constructores, fila con rótulos en el celular; entrenamiento del socio con objetivo por serie (`store.ts`, `Workout.tsx`). `server/gym/owner-assistant.ts`, `server/ai/gym-kb.ts`, `components/gym/OwnerGuide.tsx` en Ejecutivo y Panel. `AccessFlow`: «Aceptar con mi cuenta».
- **Producción:** invitación de Smart Center Gym aceptada para la cuenta del titular (D136).
- **Siguiente:** que los entrenadores prueben el editor en el celular; registrar AMRAP/tiempo con su propio control; IA en otras pantallas con revisión de privacidad.

## Bloque anterior — 28/10/2026 · Historial anterior con IA (D132) e IA en «No vino el profe» (D133)

- **Hecho:** `packages/domain/src/history-import.ts` (+ tests); `apps/web/src/server/ai/openai.ts` (cliente con esquema JSON estricto), `server/training/history-import.ts`, `server/training/ai-coach.ts`; rutas `/api/me/history-import/*` y `/api/me/solo/ai`; `components/member/HistoryImport.tsx` («Antes de REPI» en Progreso) y tarjeta de IA en `Solo.tsx`. Migración **0028** (`history_import`, `history_entry`).
- **IA:** OpenAI `gpt-4.1-mini` (`OPENAI_MODEL`, `OPENAI_MODEL_FAST`; ≈2 s; «No vino el profe» se precarga). Clave en Vercel y `.env.local`, copia en `~/.repi-secrets/openai.env`. Recomendado rotarla porque se pegó en el chat.
- **Siguiente:** D134 editor avanzado de series (combinaciones, drop sets, top sets, peso por serie, tempo, intensidad) pedido por entrenadores; probar con archivos reales del alumno de Urko; medir costo y tiempos; evaluar IA para coaches (resumen de progreso del alumno) con revisión de privacidad.

## Bloque anterior — 28/10/2026 · Ejercicios propios (D129), alta por invitación sin código (D130) y «En sala ahora» (D131)

- **Hecho:** `packages/domain/src/exercise-catalog.ts` (~200 ejercicios), `apps/web/src/server/training/library.ts` (`ensureExerciseCatalog`, `createOwnExercise`), rutas POST de biblioteca coach y gym, `components/coach/NewExercise.tsx` en ambos constructores. Invitación: `assertInvitationEmail` devuelve si está ligada, `verifyByInvitation`, `sendSignupOtp`; `AccessFlow` entra directo tras el alta por invitación.
- D129/D130 sin migración. OpenAI: `OPENAI_API_KEY` y `OPENAI_MODEL=gpt-5-mini` cargadas en Vercel (producción) y en `.env.local`; copia en `~/.repi-secrets/openai.env`. Nunca en el repo.
- **D131:** `apps/web/src/server/gym/floor-now.ts`, `components/member/FloorNow.tsx`, `components/gym/FloorNow.tsx`, migración **0027** (`gym_floor_pick`, `workout_session.floor_trainer_id`), `tests/floor-now.test.ts`.
- **Siguiente (pedidos del titular 28/10):** D132 importar historial desde un archivo con IA al progreso; IA en «No vino el profe» y donde sume.

## Bloque anterior — 28/10/2026 · Gym Access Control · ingreso validado (D127)

- **Hecho:** dominio `packages/domain/src/gym-access.ts`; migración `0026_gym_access` (política, pantallas, `gym_checkin`, `gym_member.access_until`, geo de sede, `workout_session.presence_checkin_id`); servidor `apps/web/src/server/gym/access-control.ts` con ganchos en entrenamiento, accesos, carnet, Connect y Admin; socio `components/member/Presence.tsx` (cámara con BarcodeDetector o jsQR, hoja, chip) y `/ingreso`; kiosco `/ingreso/pantalla` (`components/gym-access/{LiveQr,KioskDisplay}.tsx`, `styles/gym-access.css`); «Acceso y presencia» `components/gym/AccessControl.tsx` (panel, política, pantallas y sedes, validar a mano, QR a pantalla completa), validación a mano en Recepción y en «Mi turno», «Vigente hasta» en Accesos, tarjeta en Admin, guías y demo.
- **Pruebas:** dominio 126/126, web 203/203 (`tests/gym-access.test.ts` 11; `sandbox.test.ts` ya no falla al azar: fijaba una sede cualquiera), guardas 11/11, build OK. Navegador: socio 375 px, dueño, kiosco.
- **Migración 0026:** aditiva. Ver estado de publicación en la línea siguiente.
- **Docs:** `docs/gym-access/` (8), FEATURE_FLAGS, IMPLEMENTATION_STATUS, RELEASE_READINESS (GA-01..08), D127.
- **Siguiente:** activar el módulo en un gimnasio piloto desde Admin; probar la cámara en iPhone y Android reales (LB-03); revisión legal antes de usar ubicación. Pendiente aparte: historial anterior (D132).

## Bloque anterior — 28/10/2026 · Altas por invitación: email, fecha con calendario y ver contraseña (D128) — publicado en `main`

- **Hecho:** pista del email invitado y freno antes de crear la cuenta (`assertInvitationEmail` en `/api/access/sign-up`, `maskEmail` en el dominio), fecha de nacimiento con selector nativo (`parseBirthDate` acepta también AAAA-MM-DD y DDMMAAAA), `components/access/PasswordInput.tsx` con Mostrar/Ocultar en todos los campos de contraseña.
- **Pruebas:** dominio 120/120, web 192/192, guardas 11/11; navegador 375 px con una invitación de alumno completa.
- **Sin migración.** Siguiente: retomar Gym Access (D127) en la rama `gym-access` (mergear `main` primero) y el historial anterior (D132).

## Bloque anterior — 28/10/2026 · REPI Connect · seguimiento de sala (D126) — publicado (a65195e)

- **Hecho:** Core completo sobre la cola existente. Dominio `packages/domain/src/connect.ts` (+ tests). Servidor `apps/web/src/server/gym/connect.ts`; `gym/services.ts` exporta helpers, suma `addEvent`, estados `in_progress`/`follow_up` y eventos en la cola anterior; `metrics.ts`, `notices.ts`, `push/services.ts`, cron y `scripts/notifications.ts` (job `connectSweep`). Rutas `/api/me/gym/connect…`, `/api/gym/[orgId]/connect/…`, `/api/admin/contracts/[id]/connect`. UI: `components/member/Connect.tsx` (+ `MemberApp`, `Workout`, `FollowSheets`), `components/gym/Connect.tsx` (+ `GymApp`, guía), tarjeta en Admin, recorrido de la demo. Demo con Connect activo (`sandbox/services.ts#connectHistory`).
- **Migración 0025** (`drizzle/0025_connect.sql`, sólo agrega + trigger de historial): aplicada en dev y `repi_test`; **NO aplicada en Supabase**.
- **Pruebas:** dominio 118/118, web 192/192 (`tests/connect.test.ts` 11), guardas 11/11, build OK. Navegador local: socio 375 px, profesor y dueño en escritorio.
- **Docs:** `docs/connect/` (8 documentos), FEATURE_FLAGS, IMPLEMENTATION_STATUS, RELEASE_READINESS (RC-01..08), D126.
- **Siguiente:** con autorización del titular (el pedido prohíbe deploy público sin autorización): aplicar 0025 en Supabase (`docs/DEPLOYMENT.md` paso 2), mergear `repi-connect` a `main`, push, verificar `/api/version` y una demo en producción. Después: activar el piloto en un gimnasio desde Admin y probar en teléfonos reales.

## Bloque anterior — 28/10/2026 · Kit de difusión para gimnasios (D125)

- **Hecho:** `marketing/kit-gimnasios/` con `generar.mjs`, `LEEME.md` y la versión general en `salida/general/` (folleto A5 frente/dorso, 3 stickers, vinilo de vidriera, historia, post y WhatsApp; PDF para imprenta y PNG). Revisadas todas las piezas en imagen. Las versiones por sede (`--gym`, `--url`) se generan aparte y no se suben (`.gitignore`). No toca la app, sin tests nuevos.
- **Siguiente:** el titular genera la versión de cada gimnasio con el enlace de su sede y prueba el QR impreso antes de la tirada. Pendientes externos LB-02..LB-06 y O-01..O-05.

## Bloque anterior — 28/10/2026 · Corregir y eliminar clientes en Admin (D124)

- **Hecho:** «Editar datos» y «Eliminar cliente» en la ficha de Admin (`AdminApp.tsx`, `updateClient`/`deleteClient`, rutas `update`/`delete`). Tests web 181/181, guardas 11/11, `tsc` y build OK. Probado en local: alta de «Gym Cargado Mal», corrección de nombre y moneda, eliminación con el nombre exacto. Sin migración.
- **Siguiente:** pendientes externos LB-02..LB-06 y observaciones O-01..O-05.

## Bloque anterior — 28/10/2026 · Pasos para agregar a inicio después del registro (D123)

- **Hecho:** `InstallSteps` (`apps/web/src/components/access/InstallGuide.tsx`, estilos `.ig-box` en `access.css`) en «¡Listo!», espera de aprobación del QR y nueva pantalla `ready` de `AccessFlow.tsx` (función `enter`). Tests web 179/179, `tsc` y build OK. Probado en local: invitación de Coach Simulación → registro de `sim.alumno2@example.com` → «¡Listo!» con pasos.

## Bloque anterior — 28/10/2026 · Contenido fuera del difuminado de iOS 26 (D122)

- **Hecho:** variable `--safe-top` en `apps/web/src/styles/globals.css` (zona segura + 28 px sólo con la app instalada y zona segura arriba); reemplaza `env(safe-area-inset-top)` en `coach.css`, `member.css`, `access.css`, `site.css`, `globals.css` y `Workout.tsx`. Tests web 179/179, `tsc` y build OK.
- **Siguiente:** el titular cierra y reabre la app instalada en el iPhone para confirmar. Si la franja sigue tapando, subir el valor de 28 px en `--safe-top`.
- **Presentación:** logo de portada y cierre cambiado por el wordmark con punto `#00D1FF` (como `Wordmark.tsx`).

## Bloque anterior — 28/10/2026 · Franja de la hora sin degradé (D121)

- **Hecho:** `apps/web/src/styles/coach.css` pinta el fondo del documento en `--core-navy900` cuando hay un panel `.co` (Admin, Coach, Gym), así la franja de la hora del iPhone instalado coincide con la barra superior. Pruebas: web 179/179, guardas 11/11, dominio 107/107, `tsc` y build OK. Producción respondió 200 en `/`, `/acceso`, `/demo`, `/legal/*`, `/ayuda`, `/instalar`, manifest e íconos.
- **Siguiente:** confirmación en el iPhone del titular (cerrar y reabrir la app). Pendientes externos sin cambios: LB-02..LB-06 y observaciones O-01..O-05.

## Bloque anterior — 28/10/2026 · Zona segura del iPhone en Admin, Coach y Gym (D120)

- **Hecho:** `apps/web/src/styles/coach.css` reserva `env(safe-area-inset-*)` en la barra superior móvil, el menú lateral, el contenido, modales y avisos. Verificado con emulación de zona segura en Chrome headless. Falta confirmarlo en el iPhone del titular (LB-03).
- **Presentación comercial de REPI Gym:** https://claude.ai/artifact/PoWrSc3MnxWUXHZbhsZvYP (16 diapositivas, capturas de la demo local).

## Bloque anterior — 28/10/2026 · 2FA optativa y «Mi cuenta» (D119)

- **Hecho:** la verificación en dos pasos ya no se exige a nadie (`TWO_FACTOR_REQUIRED` en el dominio); `/cuenta` permite activarla o quitarla. Tests: `access.test.ts`, `gym.test.ts`, `privacy.test.ts` y el de dominio pasan a «optativa». Sin migración.
- **Navegador local:** el dueño quitó la 2FA desde «Mi cuenta», volvió a entrar sólo con contraseña y abrió su panel; «Activar» lleva al paso de `/acceso` y «Ahora no» vuelve a «Mi cuenta».
- **Siguiente:** presentación comercial de REPI Gym; cuentas de prueba en producción las crea el titular desde Admin (Claude no crea cuentas en producción).

## Bloque anterior — 28/10/2026 · Auditoría por simulación de todos los roles (D118)

- **Hecho:** simulación completa en dev local con cuentas nuevas por el circuito real (Admin, coach y alumna, dueño con 2FA TOTP, sala, recepción, socia por QR), pruebas de permisos entre roles y recorrido de todas las secciones a 375 px. Informe: `docs/AUDITORIA_2026-10-28.md`. Corregidos: F-12 (registro de equipo de gym roto, **crítico**), F-11 (alcance del gerente en invitaciones), F-05, F-06, F-08, F-10, F-13, F-14, F-15, F-17, F-18, F-19. Sin migración.
- **Pruebas:** web 179/179, dominio 107/107, guardas 11/11, build OK.
- **Observaciones abiertas para el titular:** O-01..O-05 del informe (padrón en el panel ejecutivo, «No vino el profe» para coaches online, orden de fechas de inicio, adherencia con sesiones parciales, nombre precargado del programa del gym).
- **Siguiente:** cerrar LB-02..LB-06 con el titular; prueba en teléfonos reales (LB-03) con la lista de `docs/QA_CHECKLIST.md`.

## Bloque anterior — 28/10/2026 · Alta de cliente mínima, íconos y correcciones de la simulación (D117)

- **Hecho:** alta de cliente en Admin con sólo nombre visible, moneda, responsable y email obligatorios (razón social opcional; **migración 0024 aplicada en dev y Supabase**); mensajes que dicen qué falta. Íconos rehechos con `apps/web/scripts/brand-icons.ts` → `apps/web/public/icons/` (manifest, apple-touch, favicon, insignia de avisos); ruta `/pwa-icon` eliminada. Hallazgos F-01..F-04 de la simulación corregidos (fechas AR, mensaje de contraseña, lista de programas, consentimientos de módulos apagados).
- **Pruebas:** web 178/178, dominio 107/107, guardas 11/11, build OK. Navegador local: alta del caso exacto de la captura del titular (coach, razón social «.») y «Regularizar» sin razón social; mensaje de faltantes; ícono en /instalar; programa nuevo visible en la lista.
- **Aviso al titular:** para ver el ícono nuevo en el teléfono hay que quitar REPI del inicio y volver a agregarlo.
- **Siguiente:** retomar la simulación completa por roles (asignar «Fuerza base» a Ana, sesión del alumno, revisión del coach, pausa/fin; dueño con 2FA, equipo, QR, socio, recepción) y escribir el informe de auditoría (`docs/AUDITORIA_2026-10-28.md`). Datos de simulación en dev: Coach Simulación (sim.coach@example.com), Ana (sim.alumno@example.com), Gym Simulación (sim.dueno@example.com sin activar), Urko Uruzuna (borrador), Gym Prueba Sur regularizado.

## Bloque anterior — 27/10/2026 · Release candidata para beta controlada (D111)

- **Directiva vigente:** «LAUNCH FIRST» (chat 27/10): terminar, probar y lanzar; P2/experimental no antes del MVP. Fase actual E (release candidata congelada: sólo correcciones de lanzamiento).
- **Hecho:** `apps/web/src/lib/features.ts` + `tests/features.test.ts`; gating en `CoachClients.tsx` (Nutrición, Mi cuerpo), `Workout.tsx` (video), `MemberApp.tsx` (Solo), `Gym.tsx` (Club), `ProgramBuilder.tsx` y `gym/Members.tsx` (Reemplazos). `server/mailer.ts` sin copias al buzón con proveedor (+ `mailer.test.ts`). `tests/launch-flows.test.ts` (LF-01..LF-04). Documentos nuevos en `docs/`: MVP_SCOPE, RELEASE_READINESS, LAUNCH_BLOCKERS, QA_CHECKLIST, PRODUCTION_CHECKLIST, DEPLOYMENT, ROLLBACK_PLAN, FEATURE_FLAGS, POST_LAUNCH_ROADMAP; resumen al inicio de IMPLEMENTATION_STATUS.md. Sin migración.
- **Pruebas:** web 172/172, dominio 107/107, guardas 11/11, build OK. Respaldo de producción + restauración en `repi_restore_check` OK (87 tablas, 148 filas). Producción: 1 Admin con 2FA; 1 copia de correo real en `dev_mailbox` (LB-01, no se leyó).
- **D116:** «Mostrar QR de la sede» en «Solicitudes de acceso» para todo el equipo (`showJoinQr`, `/api/gym/[orgId]/join-qr`); sólo muestra o crea si falta, nunca regenera.
- **D115:** paso 3 de `/instalar` (cómo entra cada rol), cartel `/instalar/cartel` y `public/marketing/` (regenerar QR con `npx tsx scripts/marketing-qr.ts`; el cartel PDF/PNG con Chrome headless sobre `next start`), guías Gym/Coach, y Pausar/Reactivar/Terminar relación del coach (LF-05). Web 173/173.
- **D114:** sección «Guía» en Admin (`components/admin/AdminGuide.tsx`, estilos `.ag*` en coach.css) con el alta de gym y coach paso a paso; mantener sus rótulos alineados con los botones reales.
- **D113:** sin botones de Google/Apple en el ingreso (pedido del titular); el adaptador OAuth del servidor queda listo.
- **D112 (autorizado):** copia borrada (0 en `dev_mailbox`) y `REPI_DEPLOY` eliminada de Vercel; producción en modo productivo.
- **Pendiente del titular:** LB-02 (Vercel Pro y Supabase Pro), LB-03 (teléfonos reales), LB-04 (abogado y datos de empresa), LB-05 (frecuencia de respaldo), LB-06 (alertas).
- **Siguiente:** cerrar los LB autorizados; después Adaptive Coach 1b restante detrás de su interruptor.

## Bloque anterior — 27/10/2026 · Adaptive Coach 1b: reemplazos aprobados (D110)

- **Hecho:** dominio `withApproved`, `cleanSubNote`, `APPROVED_SUBS_MAX` en `session-changes.ts`; tabla `exercise_substitution` (**migración 0023, aplicada en dev y Supabase con RLS**); `apps/web/src/server/training/substitutions.ts`; `GET|POST|DELETE /api/substitutions/[orgId]`; `sessionAlternatives` devuelve `approved`, `approvedNote` y `approvedBy`. UI: `components/coach/ApprovedSubs.tsx` en `ProgramBuilder.tsx` y en `EditProgramModal` de `gym/Members.tsx` (la biblioteca del gym ahora incluye `kind`); `member/ExerciseChange.tsx` marca los aprobados. Estilos `.subs-*` (coach.css) y `.xc-ok` (member.css).
- **Pruebas:** web 168/168 (nuevo `tests/substitutions.test.ts`; `session-changes.test.ts` dejó de depender del orden de la biblioteca base), dominio 107/107, guardas 11/11, build OK. Navegador: Agustín aprueba un reemplazo en el constructor; Valentina lo ve primero en «Cambiar Sentadilla» a 375 px. En dev quedaron dos reemplazos de demo en la organización de Agustín.
- **Para Codex:** `exercise_substitution` es configuración de la organización (se borra en cascada con ella); `created_by` pasa a NULL si se borra la cuenta del autor.
- **Siguiente:** resto de 1b: política de autonomía por organización (nivel por defecto 1, quién aprueba) y restricciones con vigencia (EXT-06). Después fase 2.

## Bloque anterior — 27/10/2026 · Contacto, soporte, legales v2026.10 y tipografía Barlow (D109)

- **Hecho:** `apps/web/src/lib/contact.ts` (correo, WhatsApp, condiciones de soporte); sitio público revisado entero (`components/site/PublicSite.tsx`, `styles/site.css`): sección Soporte, contacto directo, FAQ de pago, pie con crédito Sovare e isotipo (`public/brand/sovare-isotipo.webp`); `/ayuda` con «Contacto directo»; textos legales en `app/legal/[doc]/texts.ts`; `TERMS_VERSION = "v2026.10"` (los consentimientos nuevos quedan con esa versión). Regla de tipografía Barlow definitiva en CLAUDE.md, AGENTS.md (raíz, antes sin versionar), apps/web/AGENTS.md y DESIGN_CONTRACT.md; inventario regenerado (F-BR-01). Sin migración.
- **Decisiones del titular:** G09 resuelto (pago fuera de la app). Soporte: urgencias 24 h; a medida $ 30.000 por pedido (`docs/SOPORTE_OPERACION.md`).
- **Pruebas:** web 166/166, dominio 104/104, guardas 11/11, build OK. Navegador 1009 px y 375 px: sitio sin desborde, pie Sovare, `/legal/terms|privacy|dpa` y `/ayuda`.
- **Pendiente externo:** revisión de abogado y razón social, CUIT y domicilio para los legales (G11); el titular revisa el texto del sitio.
- **Siguiente:** Adaptive Coach fase 1b (sustituciones aprobadas por coach/organización y política de autonomía por organización).

## Bloque anterior — 27/10/2026 · Adaptive Coach fase 1 (D108)

- **Hecho:** dominio `adaptive.ts` (+ tests) exportado; `apps/web/src/server/training/adaptive.ts`; `GET /api/me/solo?v=solo|coach_absent`; `member/Solo.tsx` (entrada en Entrenar y hoja con motivos, avisos y opciones); estilos `.solo-*`. Sin migración. `MemberApp.tsx` cambió sólo en el bloque de import final, estado `solo`, `Train` y la hoja (Codex tiene cambios sin commit en otros bloques de ese archivo: revisar al integrar).
- **Documentos:** `docs/adaptive/ADAPTIVE_COACH_ARCHITECTURE.md` (principios, reutilización, fases 1–6, estado de tests A–Q, límites) y sección nueva en `docs/IMPLEMENTATION_STATUS.md`.
- **Pruebas:** web 166/166 (nuevo `tests/adaptive.test.ts`, 2), dominio 104/104, guardas 11/11, build OK. Navegador 375 px (Valentina con sesión abierta): «No vino el profe…» → «Seguí con Piernas · Hiciste 2 de 13 series» → «Continuar donde lo dejé» abre la sesión.
- **Siguiente:** fase 1b: sustituciones aprobadas por coach/organización (tabla + gestión en el constructor + prioridad en alternativas) y política de autonomía por organización. Fase 3 (IA) necesita decisión de gasto del titular.

## Bloque anterior — 27/10/2026 · Nota por serie, saltar/reemplazar y aviso de descanso (F-HX-21 y F-HX-22, D106–D107)

- **Pedido del titular:** cerrar estos V1 y después pasar a Adaptive Coach (pedido «MASTER FEATURE EXPANSION», pegado en el chat; pide Inter Tight, que está superada por G · Atlética: se mantiene Barlow).
- **Hecho (D106):** dominio `session-changes.ts` (motivos, compatibilidad, orden de alternativas, `cleanSetNote`) y `sync.ts` (la nota es parte de la serie); migración `0022_session_exercise_change` (`set_log.note` + tabla `session_exercise_change`, dev y **Supabase**, RLS); `training/services.ts` (`logSet` con nota y ejercicio real, `getSession` con `change`, `sessionAlternatives`, `setExerciseChange`, resumen con `exSkipped` y récords por ejercicio hecho, `clientDetail` con `changes` y `setNotes`); ruta `GET/POST /api/me/sessions/[id]/exercises`; cola offline con ítem `exchange`; `member/ExerciseChange.tsx`, nota de serie y estado «salteado» en `Workout.tsx`; ficha del coach (`CoachClients.tsx`) muestra cambios y notas.
- **Hecho (D107):** `src/lib/restAlert.ts` y fila «Avisarme al terminar» en el descanso; `public/sw.js` acepta `focusOnly` en el clic de la notificación.
- **Pruebas:** web 164/164 (nuevos `tests/session-changes.test.ts` 3 y `tests/rest-alert.test.ts` 2), dominio 96/96, guardas 11/11, build OK. Navegador local (375 px, Valentina): nota «agarre cerrado» llegó al servidor; Sentadilla → Prensa por «máquina ocupada» (series pendientes en 0, la hecha conserva Sentadilla); Peso muerto rumano salteado por tiempo, con «Retomar»; tras recargar se mantiene; el descanso muestra «bloqueadas» (el panel deniega notificaciones) y, simulando permiso por defecto, «Avisarme al terminar». Esa sesión «Piernas» sigue abierta en `repi_dev`.
- **Para Codex (exportación de datos):** hay datos propios nuevos: `set_log.note` y `session_exercise_change`.
- **Pendiente:** aviso de descanso en teléfonos reales; alternativas sin conexión (hoy requieren red).
- **Siguiente:** Adaptive Coach fase 1 (auditoría, modelo de datos, catálogo de sustituciones, validador, políticas de autonomía; sin IA). Reutilizar `session_exercise_change`, `rankAlternatives` y el check-in existente.

## Bloque anterior — 27/10/2026 · Discos y entrada en calor en la sesión activa (F-HX-21 parcial, D105)

- **Hecho:** `packages/domain/src/plates.ts` (+ tests) exportado desde el índice; `apps/web/src/components/member/PlatesSheet.tsx`; botón «Discos y entrada en calor» en `member/Workout.tsx` (sólo peso > 0 y ejercicios por repeticiones); estilos `.plates*` en `member.css`. Sin migración ni cambios de sincronización: no se registra nada.
- **Pruebas:** dominio 92/92 (nuevo `plates.test.ts`, 5), web 159/159, build OK. Navegador local (375 px, Valentina, Piernas → Sentadilla 100 kg): 20 kg → «1 × 25 + 1 × 15» y escalones 20×10, 40×5, 60×3, 80×2; barra 15 → «1 × 25 + 1 × 15 + 1 × 2,5» y se recuerda. Quedó una sesión «Piernas» en curso sin series en `repi_dev`.
- **Coordinación:** `Workout.tsx` no está entre los archivos que Codex modifica; `MemberApp.tsx` no se tocó.
- **Siguiente:** resto de F-HX-21 (nota por serie, saltar y sustituir: requieren campo nuevo en `set_log`/estado de ejercicio y pasar por la cola offline y los conflictos; diseñar con cuidado) o F-HX-22 (aviso local del descanso con la app en segundo plano).

## Bloque anterior — 27/10/2026 · Sitio público con contacto comercial (F-PU-01, D104)

- **Hecho:** `src/app/page.tsx` muestra `components/site/PublicSite.tsx` a visitantes sin sesión (con sesión, igual que antes; `/?source=pwa` sin sesión → `/acceso`). `components/site/LeadForm.tsx` usa `/api/access/lead` (mismo `commercial_lead` que Acceso → Admin › Contactos). `src/app/legal/[doc]/page.tsx` (`terms`, `privacy`, `dpa`; otro → 404): antes eran enlaces rotos desde la aceptación de términos. Estilos en `src/styles/site.css`. Sin migración.
- **Copy:** sólo capacidades presentes (ver `docs/comercial/ESTADO_Y_LIMITES.md`): sin tiendas, pagos, facturación, precios publicados ni alta libre. Legales: aviso de texto en preparación con la versión `TERMS_VERSION` y resumen de cómo funciona hoy.
- **Pruebas:** typecheck, build y guardas 11/11 OK (sin tests nuevos: es presentación; la ruta del lead ya estaba cubierta). Navegador local: `/` 200 sin sesión, `/?source=pwa` redirige, con sesión de Valentina `/` → `/app`; legales 200 y `/legal/nope` 404; envío del formulario → «Recibimos tus datos» (quedó el lead «Gym Prueba Landing» / `laura.landing@example.test` en `repi_dev`); 1280 px y 375 px sin desborde; el punto decorativo se oculta bajo 720 px porque pisaba el título.
- **Pendiente del titular:** textos legales (G11), email público de contacto, revisar el copy del sitio antes de difundir la URL.
- **Siguiente:** otro ítem del catálogo que no toque agenda ni privacidad mientras Codex siga en eso (revisar `docs/continuidad/CODEX_PARA_CLAUDE.md` antes de empezar).

## Bloque anterior — 27/10/2026 · Avisos al cliente de cambios de condiciones (F-BL-05, D103)

- **Coordinación con Codex:** al empezar, Codex trabajaba en `codex/continuidad-2026-10-27` (checkout `~/Proyectos Locales/Repi-codex-continuidad`, base e11684c, sin commits todavía) sobre concurrencia de agenda, `.ics` y exportación de datos propios. Este bloque no tocó esos archivos (`training/agenda.ts`, `privacy/*`, `MemberApp.tsx`). Su handoff es `docs/continuidad/CODEX_PARA_CLAUDE.md` (sin versionar; no integrar hasta que diga LISTO PARA INTEGRAR). Para su exportación: `contract_notice.ack_by` es dato del dueño (quién confirmó un aviso).
- **Hecho:** tabla `contract_notice` (migración `0020_contract_notice`, dev local y **Supabase**, RLS); `src/server/commercial/notices.ts` (`publishNotice`, `noticesOf`, `ackNotices`, `trialNotices`, `requireOwner`); en `commercial/services.ts` avisos desde `addTerm`, `suspendClient`, `enableClient` (rehabilitación) y los nuevos `setTrial` y `setQuantityDefinition`; rutas Admin `POST /api/admin/contracts/[id]/trial` y `/definition`; `PATCH /api/conditions/[orgId]` («Entendido»); job `trialNotices` en `/api/cron/notifications` y `pnpm jobs:notifications`. UI: «Cambios en tus condiciones» en `gym/Access.tsx#ConditionsScreen` (gym y coach), badge en «Condiciones REPI» (`GymApp.tsx`, `CoachApp.tsx`), y en Admin (`AdminApp.tsx`) ajuste de prueba, cambio de criterio y tarjeta «Avisos al cliente».
- **Migración 0021** (`0021_contract_notice_user_delete`, dev y **Supabase**): `created_by` y `ack_by` pasan a `on delete set null`; sin eso, borrar la cuenta de un dueño que confirmó avisos (procedimiento D75 de `docs/PRIVACIDAD_OPERACION.md`) fallaba por clave foránea. Test agregado (6 casos en el archivo).
- **Arreglos de paso:** rehabilitar sin fecha de prueba borraba `organization.trialEndsAt` aunque el contrato la conservaba; la tabla «Historial» de condiciones desbordaba a 375 px (ahora con scroll propio).
- **Pruebas:** web 158/158 antes de 0021, luego el archivo pasó a 6/6 (nuevo `tests/condition-notices.test.ts`, 5 iniciales: versión anterior y motivo, sólo dueño, suspensión/rehabilitación/prueba/criterio, job idempotente y sin pruebas viejas, correo rechazado), dominio 87/87, guardas OK, typecheck y build OK. Navegador local: Admin del seed (2FA marcado temporalmente en `repi_dev`, revertido) crea cantidad 480, prueba y criterio sobre Gym Norte → ficha muestra «Sin correo (demo)» y «Sin confirmar» → dueño del seed (mismo truco, revertido) ve 3 avisos y badge 3, «Entendido» baja a 2 y pasa a «Avisos anteriores»; sin desborde a 375 px. Esos 3 avisos y la versión 2 de cantidad quedaron en `repi_dev`.
- **Pendiente:** reenviar un correo de aviso rechazado; avisos por push. Política de corte/mora sigue sin definir (D04–D05).
- **Siguiente:** F-PU-01 sitio público con contacto comercial, u otro ítem del catálogo que no toque agenda ni privacidad mientras Codex siga en eso.

## Bloque anterior — 27/10/2026 · Pagos externos registrados por Admin (F-AD-04 parcial, D102)

- **Hecho:** tabla `billing_payment` (migración `0019_billing_payment`, dev local y **Supabase**, RLS); `src/server/commercial/payments.ts` (`contractPayments`, `recordPayment`, `voidPayment`, `paymentsThisMonth`); rutas Admin `GET /api/admin/contracts/[id]/payments`, `POST /api/admin/contracts/[id]/payments`, `POST /api/admin/payments/[id]/void`; `PaymentsCard` en `AdminApp.tsx` (ficha del contrato) y tarjeta «Pagos externos (mes)» en el Resumen (`adminSummary.externalPaymentsMonth`).
- **Bug corregido:** `parseMoney` rechazaba montos con punto de miles («25.000», «150.000»): afectaba Cobros del coach (D80) y el nuevo registro. Tests agregados en `packages/domain/src/commercial.test.ts`.
- **Pruebas:** web 153/153 (nuevo `tests/payments.test.ts`, 2), dominio 87/87, guardas 11/11, build OK. Navegador local (Admin del seed con 2FA marcado temporalmente en `repi_dev` y revertido): registrar ARS 150.000 con evidencia → aparece en la tabla «Sin asignar» → se anuló por API con motivo. El Resumen no lo suma porque Gym Norte es DEMO (correcto).
- **G09 resuelto (D109):** el piloto opera con pago externo registrado por Admin; el titular gestiona el cobro fuera de la app.
- **Siguiente:** F-BL-05 aviso al cliente de cambios de condiciones (historial visible en «Condiciones REPI») o F-PU-01 sitio público con contacto comercial.

## Bloque anterior — 27/10/2026 · Centro de avisos del staff gym (F-HX-26, D101)

- **Hecho:** columna `notification_outbox.read_at` + índice por usuario (migración `0018_staff_notice_read`, dev local y **Supabase**); `src/server/gym/notices.ts` (`myStaffNotices`, `markStaffNoticesRead`); rutas `GET /api/gym/[orgId]/notices` y `POST /api/gym/[orgId]/notices/read` en el dispatcher; `components/gym/Notices.tsx`; ítem «Avisos» con badge en `GymApp.tsx`; estilos `.gy-notice` en `gym.css`.
- **Pruebas:** web 151/151 (nuevo caso en `tests/annex.test.ts`: aviso sólo de la sede, escalamiento a recepción, resuelto por otro, leído por persona, ajeno 404), guardas 11/11, build OK. Navegador local con recepción del seed: aviso «Solicitud esperando · Palermo» (solicitud de prueba creada en `repi_dev` y luego cancelada) → abre Solicitudes con la solicitud seleccionada y el badge baja a 0.
- **Deploy:** 52cd4fe verificado.

## Bloque anterior — 27/10/2026 · Entrega de invitaciones de coach y equipo (D100)

- **Hecho:** `access/services.ts#deliverInvitation` (privado) usado por `inviteCoachClient` e `inviteGymStaff`, que ahora devuelven `delivery`; rutas `/api/access/coach/[orgId]/invitations`, `/api/access/gym/[orgId]/invitations` (ahora también devuelve `code`) y `/api/access/invitations/resend` exponen `delivery`; `followup/services.ts` lista `delivery` en Solicitudes; UI en `InviteModal.tsx`, `CoachInbox.tsx`, `gym/Manage.tsx#InviteStaff` e informe de importación. Sin migración (columna `invitation.delivery` ya existía, D88).
- **Pruebas:** web 150/150 (nuevo `tests/invite-delivery.test.ts` con proveedor simulado que responde 503), guardas 11/11, build OK. Los textos de la UI no se miraron en el navegador (cubiertos por tipos; flujo local devuelve `local_only`).
- **Deploy:** 8b25ebd verificado.

## Bloque anterior — 27/10/2026 · Importación CSV de clientes (F-CO-11, D99)

- **Hecho:** dominio `packages/domain/src/csv.ts` (`parseCsv`, `guessColumns`, `mapRows`, `CSV_MAX_ROWS`) + tests; `src/server/access/import.ts` (`previewImport`, `confirmImport`); ruta `POST /api/coach/[orgId]/import[?step=preview]`; `components/coach/ImportModal.tsx` y botón «Importar CSV» en Clientes. Sin migración.
- **Pruebas:** web 149/149 (nuevo `tests/import.test.ts`, 2), dominio 87/87, guardas 11/11, typecheck y build OK. Navegador local (archivo simulado con DataTransfer): 4 filas → 1 se invita, 1 repetida, 1 ya cliente, 1 email inválido → informe «1 invitadas · 3 salteadas». La invitación de prueba `lucas.import@example.test` quedó en `repi_dev` (buzón local, sin correo real).
- **Pendiente detectado:** `inviteCoachClient` descarta los errores del correo (`sendMail(...).catch(() => {})`); conviene registrar la entrega como la bienvenida comercial (D88) para poder decir «enviada» y reenviar.
- **Resuelto en D100.** Deploy 0086825 verificado.

## Bloque anterior — 27/10/2026 · Agenda y asistencia (F-CO-10 / F-HX-07, D98)

- **Hecho:** dominio `packages/domain/src/agenda.ts` (estados, `arToUtc`, `arParts`, `overlaps`, `appointmentIcs`) + tests; tabla `coach_appointment` (migración `0017_coach_appointment`, dev local y **Supabase**, RLS); `src/server/training/agenda.ts`; rutas `/api/coach/[orgId]/agenda` (GET/POST), `/api/coach/[orgId]/agenda/[id]` (POST), `/api/me/agenda` (GET), `/api/me/agenda/[id]` (POST), `/api/agenda/[id]/ics`; `components/coach/CoachAgenda.tsx` (pantalla «Agenda» + `TodayAgenda` en el panel); `NextAppointment` en Inicio del alumno; avisos en `notifications/feed.ts`.
- **Pruebas:** web 147/147 (nuevo `tests/agenda.test.ts`, 3), dominio 84/84, guardas 11/11, typecheck y build OK. Navegador local: coach del seed agenda «jue 29/10 18:00 · Gym Norte · sala 2» → .ics 200 `text/calendar` con DTSTART 21:00Z → alumna confirma desde Inicio (375 px). Esa sesión quedó en `repi_dev`. No se probó abrir el .ics en iPhone/Android.
- **Entorno:** la herramienta de vista previa del escritorio sigue leyendo `.claude/launch.json` de `~/Desktop/Repi` y arranca ahí. Se agregó `repi-local` (con `--dir` absoluto) al launch.json nuevo, pero la herramienta no lo ve hasta abrir una sesión nueva en `~/Proyectos Locales/Repi`. En esta sesión el dev server se corrió con `pnpm dev` desde `apps/web` de la ruta nueva.
- **Deploy:** 7fc9771 verificado en repiclub.com (`/api/me/agenda` 401 sin sesión).

## Bloque anterior — 27/10/2026 · Migración fuera de iCloud

- **Repo nuevo y único:** `~/Proyectos Locales/Repi` (fuera de iCloud). Clon limpio de `github.com/manuel-cosovschi/repi`, `main` en a516c7a + rama local `codex/lanzamiento-repi` (ya incluida en main) recuperada del bundle. Los 1100 archivos versionados se compararon byte a byte con la carpeta vieja: idénticos.
- **Copiado aparte (no versionado):** `apps/web/.env.local` (0600), `.vercel/` (vínculo del proyecto) y `apps/web/.storage/` (archivos privados de desarrollo). Dependencias reinstaladas con `pnpm install --frozen-lockfile`; no se copiaron `node_modules`, `.next` ni cachés.
- **Respaldo:** `~/.repi-secrets/migracion/repi-todas-las-ramas.bundle` (todas las ramas). La carpeta `~/Desktop/Repi` quedó intacta y congelada en a516c7a: **no trabajar ahí**; la borra el titular cuando quiera.
- **Arreglo de código:** rutas con espacios. `tests/setup-env.ts`, `tests/global-setup.ts`, `scripts/operations/backup.ts` y `scripts/migrate.ts` armaban rutas con `URL.pathname` (deja `%20`): no cargaban `.env.local` y `pnpm db:migrate` terminaba sin migrar ni avisar. Ahora usan `fileURLToPath`/`pathToFileURL`.
- **Pruebas en la nueva ruta:** typecheck OK, dominio 81/81, guardas 11/11, web 144/144 (`repi_test` local), `pnpm db:migrate` sobre `repi_dev` OK, `next build` OK.
- **Bases y servicios:** sin cambios (PostgreSQL local `repi_dev`/`repi_test`, Supabase, Vercel y secretos en `~/.repi-secrets/`). Vercel despliega desde GitHub, no desde la carpeta.
- **Deploy:** e58b372 verificado en repiclub.com.

## Bloque anterior — 27/10/2026 · Objetivos acordados (F-CO-03 / F-HX-02, D97)

- **Hecho:** dominio `packages/domain/src/goals.ts` (GOAL_KINDS, GOAL_SOURCES, ventana 28 días, `goalProgress`, `goalTitle`) + tests; tabla `client_goal` (migración `0016_client_goal`, dev local y **Supabase**, RLS); `src/server/training/goals.ts` (listGoals, createGoal, updateGoal, myGoals); rutas `GET/POST /api/coach/[orgId]/clients/[relId]/goals`, `POST /api/coach/[orgId]/goals/[id]`, `GET /api/me/goals`; `components/coach/CoachGoals.tsx` en la pestaña Progreso de la ficha; sección «Objetivos» en Progreso del alumno (`MemberApp.tsx#MyGoals`); estilos `.goalbar` (coach.css) y `.goal*` (member.css).
- **Pruebas:** web 144/144 (nuevo `tests/goals.test.ts`, 4), dominio 81/81, guardas 11/11, build OK. Navegador local: coach del seed crea «Jalón al pecho 60 kg × 8» desde la ficha → la alumna lo ve en Progreso (375 px). Ese objetivo quedó en `repi_dev` como dato de prueba.
- **Bug encontrado y corregido en la prueba:** `/api/coach/[orgId]/library` devuelve `{ exercises }`, no un array.
- **iCloud otra vez (muy grave):** a las 12:41 iCloud quitó la extensión a `AccessFlow.tsx`, `CoachApp.tsx`, `GymApp.tsx`, `member/Gym.tsx` y `MemberApp.tsx` y borró archivos de caché de Turbopack. Se restauraron desde git (eran idénticos a HEAD). Además `apps/web/tsconfig` era un `tsbuildinfo` renombrado por iCloud y commiteado en cf124b1: se sacó del repo. Resuelto con la migración a `~/Proyectos Locales/Repi`.
- **Siguiente:** F-CO-10 calendario/asistencia del coach o F-CO-11 importación CSV; F-HX-26 centro de notificaciones del staff.

## Bloque anterior — 27/10/2026 · Informe mensual (F-CO-16, D96)

- **Hecho:** `src/server/training/report.ts` (`monthBounds`, `myMonthlyReport`, `clientMonthlyReport`; `requireClientOf` ahora exportado de `training/services.ts`); vista `components/report/MonthlyReport.tsx` + `PrintButton.tsx`; estilos `styles/report.css` (con `@media print`); páginas `app/app/informe/page.tsx` y `app/coach/[orgId]/informe/[relId]/page.tsx`; enlaces en Progreso del alumno y pestaña Rendimiento del coach.
- **Pruebas:** web 139/139 (nuevo `tests/report.test.ts`, 3), guardas 11/11, typecheck y build OK. Navegador local: informe de la alumna del seed (escritorio) y del coach para esa relación en 375 px sin scroll horizontal ni check-in. No se probó «Guardar como PDF» en Safari/iPhone.
- **iCloud (grave):** durante el build iCloud renombró `apps/web/src/server/access/http.ts` a `http` (sin extensión). Se restauró desde git y el archivo extra fue a la Papelera. Ya van tres incidentes hoy (schema.ts borrado, `schema 2.ts`, `http`). **Mover el repo fuera de Escritorio/Documentos o excluirlo de iCloud** antes de seguir; revisar `git status` y `git ls-files -d` antes de cada commit.
- **Deploy:** eb66819 en repiclub.com verificado (`/app/informe` 307 a acceso sin sesión).

## Bloque anterior — 27/10/2026 · Unidad de peso kg/lb (F-HX-23 parcial, D95)

- **Hecho:** dominio `packages/domain/src/units.ts` (kgTo, toKg, fmtWeight, volumeIn, stepWeightIn, parseWeightIn, WEIGHT_STEPS_LB) con `units.test.ts`; columna `user_pref.weight_unit` (migración `0015_weight_unit`, dev local y **Supabase**); `src/server/settings/services.ts` + `GET/POST /api/me/settings`; `weightUnit` en `myTraining`; contexto `components/member/units.ts` provisto por `MemberApp`; Workout (stepper en lb, resumen, PR/Epley, conflictos, aria), Progreso/historial, «Anterior» del día y vitrinas del Club usan la unidad. Perfil → «Configuración» (radiogroup kg/lb, 44 px).
- **Pruebas:** web 137/137 (nuevo `tests/settings.test.ts`), dominio 78/78, guardas 11/11, typecheck y build OK. Navegador local 375 px: Perfil → Libras → aviso y Progreso en lb; se volvió a kg. El ± en lb dentro de un entrenamiento no se probó en navegador (cubierto por tests de dominio; no se abrió sesión en dev para no dejar datos).
- **Fuera de alcance a propósito:** coach/gym siguen en kg; idioma único; menores sin opción hasta política (G11); push al alumno no existe.
- **Deploy:** 2170e70 en repiclub.com verificado (`/api/me/settings` 401 sin sesión).

## Bloque anterior — 27/10/2026 · Centro de notificaciones del alumno (F-NT-01, D94)

- **Hecho:** `src/server/notifications/feed.ts` (`myNotifications`, `markNotificationsSeen`) arma la lista desde fuentes existentes (member_notice, pedidos coach y sala, solicitudes de acceso, reseñas, hilos sin leer, novedades del gym, cobros pendientes del coach); rutas `GET /api/me/notifications` y `POST /api/me/notifications/seen`; columna `user_pref.notifications_seen_at` (migración `0014_notifications_seen`, aplicada en dev local y **Supabase**). Cliente: campana con punto en Inicio (`MemberApp.tsx#Head`), hoja `NotifSheet`, aviso de programa sumado en el cliente (`withProgramNotice`), navegación a pestaña, sub-pestaña del Gym (`GymTabView initialTab`) u hoja de reseña. `myInbox` y `myReviewInvites` ahora devuelven `createdAt`. Estilos `.bell-dot`, `.notif*` en `member.css`.
- **Pruebas:** web 135/135 (nuevo `tests/notifications.test.ts`, 2), guardas 11/11, typecheck y `next build` OK (build con el dev server detenido). Navegador local 375 px con el alumno del seed: «Notificaciones, 5 sin leer» → hoja con novedades, pedido y programa → tocar novedad abre Gym · Novedades → al recargar, sin no leídas.
- **iCloud otra vez:** apareció `apps/web/src/db/schema 2.ts` (idéntica a 16c3522); se movió a la Papelera. Revisar `git status` por archivos `* 2.*` al arrancar.
- **Deploy:** 196ff24 en repiclub.com verificado (`/api/me/notifications` 401 sin sesión, `/app` 307 a acceso). No se probó con una cuenta real del entorno hospedado.
- **Límites:** sin push al alumno (no hay datos en lock screen); preferencias por canal y deep links por push quedan para N-O23/F-HX-23. Staff (F-HX-26) pendiente.
- **Siguiente:** F-HX-23 configuración (kg/lb sin alterar historia, preferencias de notificación) o F-CO-16 informe mensual; V1 restante es externo (G03/G07 teléfonos reales, G11 textos legales, G09 modalidad del piloto).

## Bloque anterior — 27/10/2026 · Soporte e incidentes (N-O11, D93)

- **Por qué este:** era el primer pendiente V1 con código faltante (gate G10 «soporte»); los demás V1 abiertos dependen de teléfonos reales, textos legales o decisiones del titular.
- **Hecho:** tabla `support_ticket` (migración `0013_support_ticket`, aplicada en dev local y **Supabase**, RLS activo); `src/server/support/services.ts` (openTicket con/sin sesión, diagnóstico de lista cerrada, deduplicación, límites; myTickets; listTickets/updateTicket para Admin; supportCounts en `adminSummary`); rutas `POST /api/support` (sesión opcional, helper `optionalUserId` en `access/http.ts`), `GET /api/me/support`, Admin `GET/POST /api/admin/support[/id]`; página pública `/ayuda` (`components/access/Support.tsx`); enlaces en login, Perfil del alumno y menú de Coach/Gym/Admin; `/acceso?step=rec1` abre «Olvidé mi contraseña»; pantalla Admin «Soporte» con badge, modal (incidente, tomar, nota interna, respuesta, reabrir) y tarjeta en Resumen. Procedimiento en `docs/SOPORTE_OPERACION.md`.
- **Pruebas:** web 133/133 (nuevo `tests/support.test.ts`, 5), dominio 74/74, guardas 11/11, typecheck y `next build` OK. En navegador local (dev): `/ayuda` sin sesión en 375 px → consulta enviada con código; Admin → Resumen «Consultas de soporte 1» → Soporte → responder → sale de «Abiertas». Para esa prueba se marcó 2FA del Admin del seed sólo en `repi_dev` y se revirtió.
- **Ojo:** `next build` en `apps/web` borra artefactos del `next dev` que esté corriendo (comparten `.next`): el dev server de la sesión de Codex en :3000 quedó devolviendo 500 y se reinició con el mismo comando (`pnpm --filter @repi/web dev`). Evitar build con un dev server activo, o reiniciarlo después.
- **Pendiente del titular:** responsables y horario de soporte, correo público de contacto, verificación de identidad para 2FA perdido sin códigos de respaldo.
- **Deploy:** c350c55 en repiclub.com verificado (`/ayuda` 200, `/api/me/support` 401 sin sesión).

## Bloque anterior — 27/10/2026 · Cierre de seguridad de lanzamiento (D87–D90)

- **Origen:** plan `docs/superpowers/plans/2026-10-27-lanzamiento-repi.md` (otro agente lo empezó en la rama `codex/lanzamiento-repi`; Claude revisó su trabajo, completó lo que faltaba y lo llevó a `main`).
- **Hecho:** cuentas del seed bloqueadas en el entorno hospedado y en Better Auth (D87); guardas de base local para tests/seed (`scripts/lib/database-target.ts`); primer Admin con ticket de un solo uso (`scripts/first-admin.ts`, `/activar-admin`, `src/server/admin/bootstrap.ts`); autorización por sede/turno sin mezclar roles, consentimiento y QR (D89); salida segura multipestaña, video con Range, íconos 192/512 (D90); bienvenida comercial con entrega honesta y condiciones serializadas, migración 0012 `invitation.delivery` aplicada en Supabase (D88); comentarios ocultos al salir de Repi Club; guardas de respaldo/restauración (`scripts/operations/guards.ts`).
- **Pruebas:** web 128/128 (vitest, `repi_test` local), dominio 74/74, guardas `tsx --test tests/safety/*.check.ts tests/operations/*.check.ts` 11/11, typecheck y `next build` OK.
- **Ojo — iCloud:** el Escritorio se sincroniza con iCloud Drive. Durante este bloque borró `apps/web/src/db/schema.ts` y dejó copias `* 2` (`.git/index 2`, etc.). Se restauró de git. Recomendación al titular: mover el repo fuera de Desktop/Documents o excluirlo de iCloud. Revisar `git status` al arrancar.
- **Ticket de primer Admin emitido 27/10 11:29 (vence 28/10 11:29 ART).** Enlace en `~/.repi-secrets/primer-admin.txt` (0600; sólo el hash en la base). Si vence sin usarse, volver a correr `pnpm ops:first-admin` (invalida el anterior). Hasta que el titular lo use, no hay REPI Admin. Para crearlo: correr `scripts/first-admin.ts` (ver docs/DESPLIEGUE.md) y que el titular abra el enlace guardado en `~/.repi-secrets/primer-admin.txt`, cree su cuenta, verifique email y active 2FA.
- **Deploy:** 697a5ca en producción (repiclub.com): `/activar-admin`, íconos `/pwa-icon/192|512`, manifest nuevo y demo (200 en ~5 s) comprobados.
- **Respaldos y CI (D91):** `pnpm ops:backup` / `pnpm ops:restore` en `apps/web/scripts/operations/`; ensayo local y hospedado verificados, `repi_restore_check` vaciada después. CI en `.github/workflows/ci.yml`.
- **Actualización PWA (D92):** `UpdateWatcher` + `/api/version`; sincroniza la cola antes de ofrecer «Actualizar».
- **CI:** el primer run falló en pruebas (PostgreSQL en contenedor no reporta dirección local y la guarda bloquea, como corresponde); se pasó al PostgreSQL nativo del runner. Run de 883f288: **verde** (typecheck, guardas, tests, build). Deploy 883f288 en repiclub.com con `repi-version` 883f2884ea10. El aviso «Actualizar» no se probó en navegador (se ve recién con el próximo deploy en una pestaña abierta).
- **Siguiente:** F-NT-01 centro de notificaciones del alumno (base: `member_notice`, `notification_outbox`, `/api/me/inbox`; pantalla nueva en `MemberApp`); flujos gym/coach completos en el entorno; luego catálogo V1.1 (F-HX-23 kg/lb, F-CO-16 informe mensual, F-NT-01 centro de notificaciones).

## Bloque anterior — 27/10/2026 · Dominio repiclub.com activo

- Nameservers en Vercel; `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` y `VAPID_SUBJECT` = `https://repiclub.com`; pg_cron reprogramado a repiclub.com (200); demo probada en repiclub.com.
- **Correo real activo (D86):** repiclub.com verificado en Resend, registros en Vercel DNS, `MAIL_FROM=REPI <hola@repiclub.com>`, ruta de prueba `/api/cron/mail-test`. Pendiente: que el titular pruebe un alta real con su email (Claude no crea cuentas en el entorno publicado).

## Bloque anterior — 27/10/2026 · Demo interactiva guiada por perfil (D85)

- **Hecho:** `src/server/sandbox/services.ts` (startDemo, sealDemo, purgeSandboxes, demoRoleOf), migración `0011_demo_sandbox` (dev local y Supabase), rutas `POST /api/demo` y `GET /api/demo/me`, página `/demo` + `components/demo/DemoPicker.tsx`, recorrido `components/demo/DemoTour.tsx` montado en `layout.tsx`, estilos `.dt-*` en `globals.css`, acceso «Probá REPI sin cuenta» en el login, purga en `/api/cron/notifications`, mailer nunca envía a `.invalid`, Admin excluye organizaciones de demo.
- **Pruebas:** `tests/sandbox.test.ts` (entorno coherente, aislamiento y borrado completo); web 110/110; los cuatro recorridos verificados de punta a punta en Chrome headless (`documentacion/demo/verificar-recorridos.mjs`, capturas en `documentacion/demo/`): entrada en ~2 s, cada paso navega a la pantalla correcta.
- **Pendiente:** probar en teléfono real; textos de venta a revisar por el titular; el paso «aprobá a Camila» no verifica que se haya hecho (es guía, no tutorial con validación).

## Bloque anterior — 27/10/2026 · Storage por Edge Function, dominio y Resend (D83, D84)

- **Hecho:** Edge Function `repi-storage` desplegada y probada (subida, lectura con rango, URL firmada de subida, borrado, 404 sin secreto); driver proxy en `storage.ts`; variables `SUPABASE_STORAGE_PROXY_URL`, `STORAGE_PROXY_SECRET`, `AUTH_TRUSTED_ORIGINS` en Vercel; repiclub.com + www agregados al proyecto; `mailer.ts#resendDomain` + `/api/cron/mail-domain`; Resend se activa sólo con `RESEND_API_KEY`.
- **Pendiente del titular:** nameservers de GoDaddy → `ns1.vercel-dns.com` / `ns2.vercel-dns.com`; cargar `RESEND_API_KEY` en Vercel (Claude no carga claves de cuentas del titular); revocar el token `sbp_…` compartido en el chat (no se usó).
- **Después de eso (Claude):** URLs de auth al dominio nuevo, registros DNS de Resend, `MAIL_FROM` con el dominio, prueba de alta con email real.

## Bloque anterior — 27/10/2026 · Guía sin «Continuar en el navegador» y Resend en DEMO (D82)

- **Hecho:** `InstallGuide.tsx` (sólo «Agregar Repi a inicio» si el navegador lo permite y «Ver cómo hacerlo»; sin salida al navegador), `mailer.ts` (DEMO + Resend: envío real y copia en buzón; rechazo no corta), test en `tests/mailer.test.ts`, `documentacion/pwa/verificar-guia.mjs` actualizado.
- **Pendiente del titular:** cargar `RESEND_API_KEY` y `MAIL_DRIVER=resend` en Vercel; verificar dominio en Resend. `MAIL_FROM` ya cargado (`REPI <onboarding@resend.dev>`).

## Bloque anterior — 27/10/2026 · Rendimiento del cliente (D81, F-CO-04)

- **Hecho:** `training/services.ts#clientPerformance` (reusa `bestE1rm`/`epley1rm` del dominio), ruta `/api/coach/[orgId]/clients/[relId]/performance`, `PerfTab` en `CoachClients.tsx`.
- **Pruebas:** web 107/107, dominio 74/74, build OK.

## Bloque anterior — 27/10/2026 · Cobros manuales coach → alumno (D80)

- **Hecho:** migración `0010_coach_charges` (dev local y Supabase), `src/server/coachpay/services.ts`, rutas `/api/coach/[orgId]/payments`, `/payments/[id]`, `/clients/[relId]/charges`, `/api/me/charges`; `components/coach/CoachPayments.tsx` (pantalla, modales, pestaña de la ficha), vista «Pagos con tu coach» en Perfil.
- **Pruebas:** web 106/106 (test en `tests/training.test.ts`), build OK, captura headless de la pantalla.
- **Siguiente V1.1 sugerido:** F-CO-04 (1RM estimado Epley, volumen por grupo), F-HX-23 (configuración kg/lb, notificaciones), F-CO-16 (informe mensual).

## Bloque anterior — 27/10/2026 · Accesos denegados auditados y resumen Admin (D78, D79)

- **Hecho:** `access/http.ts#recordDenied` (en `handle` y `/api/media`), `commercial/services.ts#adminSummary`, `GET /api/admin/summary`, pantalla «Resumen» en `AdminApp.tsx`. Tests `tests/denied.test.ts` y resumen en `tests/privacy.test.ts`.
- **Pruebas:** web 105/105, typecheck y build OK.
- **V1 del catálogo sin implementar:** F-PR-03 (notas institucionales vs personales).

## Bloque anterior — 27/10/2026 · Aviso de programa nuevo/actualizado (D77, F-CL-14)

- **Hecho:** `training/services.ts` (`program.update` en `myTraining`, `previousVersion`), `assignedAt` explícito en asignaciones (coach y gym), ruta `/api/me/training/previous`, `ProgramNotice` en `MemberApp.tsx`, tipo `ProgramUpdate`.
- **Pruebas:** web 103/103 (test nuevo en `tests/training.test.ts`), build OK, captura headless del aviso.
- **Quedan V1 sin implementar del catálogo:** F-PR-03 (notas institucionales vs personales), F-PR-04 (acceso denegado + auditoría), F-AD-01 (resumen Admin).

## Bloque anterior — 27/10/2026 · Registro de errores sin datos sensibles (D76)

- **Hecho:** `src/server/log.ts` + uso en `access/http.ts#handle`, `/api/media/[id]`, `/api/cron/*`; `tests/log.test.ts`.
- **Pruebas:** web 102/102, typecheck y build OK.
- **Cómo mirar errores en vivo:** `vercel logs repi-app.vercel.app` o el panel de Vercel → Logs (filtrar `"level":"error"`).

## Bloque anterior — 27/10/2026 · Exportación y eliminación de datos (D75)

- **Hecho:** migración `0009_privacy_requests` (dev local y Supabase), `src/server/privacy/services.ts`, rutas `/api/me/export`, `/api/me/deletion`, `/api/me/deletion/[id]`, Admin `GET /api/admin/privacy` y `POST /api/admin/privacy/:id/resolve`; Perfil «Tus datos»; Admin «Privacidad»; `docs/PRIVACIDAD_OPERACION.md`.
- **Pruebas:** `tests/privacy.test.ts` (3); web 101/101, typecheck y build OK.
- **Pendiente del titular:** política de retención, responsable del tratamiento y textos legales.

## Bloque anterior — 27/10/2026 · Límites de intentos compartidos (D74)

- **Hecho:** migración `0008_shared_rate_limits` (aplicada en dev local y Supabase), `access/util.ts#rateLimit` en base (async), Better Auth `rateLimit.storage = "database"`, `tests/ratelimit.test.ts` (ventana, reinicio y concurrencia).
- **Pruebas:** web 97/97, typecheck y build OK.

## Bloque anterior — 27/10/2026 · Defectos de ESTADO_ACTUAL §7 y §8 (D72, D73)

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
