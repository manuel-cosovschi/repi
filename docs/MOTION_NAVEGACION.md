# Navegación fluida en las apps · M06 «Carril»

> Rama `claude/app-transiciones` (worktree `/home/user/repi-tx`, base `main` en `218cd53`). Estado: **implementado en la rama, sin publicar** (S0–S9; S10 documentación y verificación en esta misma rama, sin PR ni despliegue). QA independiente del 07/11 corregida (§18).
> Fuentes: pedido del titular del 06/11/2026 (grabación del iPhone, PWA instalada, app del alumno) y pedido del 07/11/2026 sobre «Abrir ficha del socio» desde Sala. Especificación de movimiento: `motion.md` §13. Decisión: `docs/DECISIONS.md` D211.

## 0. Pedidos y reglas que no cambian

1. «…el pasaje entre botones/secciones/páginas y demás es muy rígido, nada fluido, hasta trabado, es rápido eso sí y me encanta eso y quiero mantenerlo pero quiero que haya más fluidez, alguna animación interesante.» Vale para **todas** las apps: alumno, Coach, Gym y Admin.
2. «Cuando apretás abrir ficha socio desde la página de sala, debería abrirse una página donde sea sólo la ficha de ese socio, no que te mande al listado de todos los socios y tengas que ir hasta abajo del todo para ver el programa…»

Lo que no se toca:
- Barlow / Barlow Condensed (G · Atlética), el logo, la paleta, la cápsula «Cristal flotante» y sus destinos por rol.
- M01–M05 con sus tiempos (motion.md §9 y §12), los permisos y los datos.
- `components/conoce/**`, `styles/conoce3.css`, el servidor y la base.
- Sin dependencias nuevas. gsap no hace falta: alcanza con CSS y Web Animations.
- Diff mínimo y mecánico en `MemberApp.tsx`; **cero** líneas en `Workout.tsx` (los dos los edita la rama AC3).
- No se corre vitest en `apps/web` (base de pruebas compartida). Sí typecheck, build y Playwright contra un servidor propio en el puerto 3104 con `repi_dev` y cuentas demo.

## 1. Qué mostraban el video (60 fps) y el código

- **Corte, no fundido.** Cada toque desmontaba la sección (`<div key={tab} className="tab-pane">`) y montaba la nueva en el mismo commit que movía el indicador. El primer cuadro pintado ya traía el indicador al ~74 % del recorrido y el contenido casi opaco: el fundido de 160 ms se perdía y se leía como corte. No había salida.
- **Saltos por datos.** Cada sección volvía a pedir sus datos en cada visita y arrancaba en `null` o «Cargando…»: Progreso insertaba NIVEL ~180 ms después y empujaba «Antes de REPI»; Inicio insertaba la tarjeta de programa y después «Desafíos»; Entrenar insertaba «En sala ahora» encima del título; Mensajes pasaba por tres diseños; Tu gym quedaba ~170 ms en blanco, después el ambiente M03 y recién después el contenido.
- **Scroll.** Se restauraba después de pintar y con la sección todavía vacía.
- **Toques.** Sin respuesta propia (gris de iOS); segmentos que saltan; hojas y modales que desaparecen de golpe; fondos sin fundido.
- **Coach, Gym y Admin.** Mismo patrón (`key={screen}` y `useLoad`, que vaciaba los datos en cada montaje), ráfagas de pedidos de avisos en cada toque, «Cargando…» sin estructura y foco enviado al `h1` antes del commit.

## 2. Idea de movimiento: «Carril» (ficha M06)

Cambiar de sección es **cambiar de carril en la pista**: el indicador sale como un sprint (se estira hacia el destino y frena firme), lo viejo se aparta rápido y lo nuevo entra en el sentido del viaje, el título se revela como un **corte de meta** con una línea cian de 2 px que barre y se apaga (el punto cian del logo). Todo arranca en el toque y termina en ≤ 240 ms; sólo `transform`, `opacity` y `clip-path`; lo que entra es interactivo desde el primer cuadro y un toque nuevo corta lo que esté en curso.

**Dirección:** por el orden de la barra o del menú. Perfil, la ficha del socio, la ficha sola de un cliente del coach y el contrato de Admin son **profundidad** (entran «adelante», vuelven «atrás»). Tocar otra vez la pestaña activa no anima la sección y lleva el scroll arriba (iOS). En el escritorio de Coach, Gym y Admin (≥ 768 px) el eje es vertical; por debajo, horizontal.

| Pieza | Qué hace | Tiempo | Curva | Dónde |
|---|---|---|---|---|
| Toque | Botones y filas a escala .97; íconos de la barra a .90 | 90 ms baja, 150 ms vuelve | `--ease-std` | `motion-nav.css` |
| Indicador «sprint» (barra del alumno) | Traslación por Web Animations con `startTime` explícito (se mueve en el primer cuadro) + estiramiento sobre `scale`: 1 → (1 + 0,16·\|Δ\|, máx. 1,32) × 0,9 al 40 % → 1 | 240 ms | traslación `--ease-std`; estiramiento `ease-out` | `TabBar.tsx` |
| Ícono destino «arranque» | Escala .86 → 1 | 240 ms | `--ease-spring` | `motion-nav.css` |
| Salida de sección | −12 px en el sentido del viaje en 100 ms y opacidad 1 → 0 en 70 ms (los dos títulos casi no se superponen); queda fija e inerte y se oculta al terminar sin esperar a React | 100 ms (opacidad 70) | traslación `--ease-in`; opacidad `--ease-std` | `SectionStage.tsx` |
| Entrada de sección | Opacidad 0 → 1 y +24 px → 0, sin retardo | 200 ms (220 en escritorio) | `--ease-out` | `SectionStage.tsx` |
| Corte de meta | `h1` con `clip-path: inset()` en el sentido del viaje y +8 px; línea cian (`--ui-primary`) de 2 px que barre y se apaga | 200 ms (línea 240 ms) | `--ease-out` | `SectionStage.tsx`, `.sec-cut` |
| Formación | Primeros 4 bloques visibles escalonados, 10 px·i (sólo `transform`) | 180 ms, paso 20 ms | `--ease-out` | `SectionStage.tsx` |
| Profundidad | Como la entrada, con 32 px; volver lo invierte | 200 / 100 ms | ídem | `SectionStage.tsx` |
| Eje vertical (escritorio staff) | Entra ±12 px en Y y sale ∓6 px | 220 / 100 ms | ídem | `SectionStage.tsx` |
| Indicador deslizante (segmentos, pestañas, menú lateral) | Toma el tamaño medido del elegido y se mueve; un toque nuevo lo redirige | 200 ms (como M01) | `--ease-std` | `SlideIndicator.tsx` |
| Panel de segmento (Tu gym) | +8 px·dirección y opacidad, sin salida | 160 ms | `--ease-out` | `useEnter` |
| Revelado (bloque opcional que llega en la primera visita) | Alto 0 → real (absorbe el gap del contenedor) + opacidad | 200 ms (opacidad 160) | `--ease-std` | `Skeleton.tsx` (`Reveal`) |
| Hoja inferior | Fondo con fundido de entrada; entra `sheet-up` 320 ms (sin cambios); sale con copia inerte +24 px y opacidad | fondo 200 ms; salida 180 ms | `--ease-in` | `Sheet.tsx`, `ghost.ts` |
| Modal | Fondo con fundido; entra `co-pop` 200 ms; sale con copia escala .98, +4 px y opacidad | salida 150 ms | `--ease-in` | `Modal.tsx`, `ghost.ts` |
| Aviso del staff | Sale con copia +6 px y opacidad | 150 ms | `--ease-in` | `FlashToast.tsx` |
| Cajón del staff | El fondo siempre está; fundido de entrada y de salida | 200 ms | `--ease-std` | `motion-nav.css` |
| Entrar al entrenamiento | La vista sube 16 px y aparece | 240 ms | `--ease-out` | `motion-nav.css` (sin tocar `Workout.tsx`) |
| Volver del entrenamiento | La sección sube 12 px y aparece | 200 ms | `--ease-out` | `SectionStage.tsx` («volver») |
| Entre documentos | Fundido con View Transitions entre documentos | salida 120 ms, entrada 180 ms | `--ease-in` / `--ease-out` | `doc-transitions.css` |

Tokens nuevos en `packages/domain/src/tokens.ts` (`motion.duration_ms`): `section_exit: 100`, `section_enter: 200`, `stagger: 20`, `press: 90`, `exit: 160` (regenerados en `tokens.css` con `pnpm --filter @repi/web tokens`).

## 3. Decisión técnica

Las secciones dentro de la app **no** usan `<ViewTransition>` de React: en Chrome 153 la captura de la raíz pierde toques durante la transición, un elemento con nombre no recibe toques mientras dura, la captura se pinta encima de la barra fija, WebKit tiene un error con degradés y `backdrop-filter` (bug 299091, iOS 26.0.x) y Safari ≤ 18.1 no anima. En su lugar:

- **Secciones vivas con `<Activity>`** (React 19.3): las visitadas quedan montadas y ocultas con estado, DOM y datos; al volver se muestran al instante y sus efectos vuelven a correr (revalidan sin vaciar). Los sondeos se pausan mientras están ocultas.
- **«Carril» sobre el DOM vivo** con Web Animations: la que sale sigue montada y visible 100 ms, inerte y fija; la nueva entra animada. Funciona igual en todos los navegadores, no captura nada, la barra nunca queda tapada y no se pierde ningún toque.
- **Contenido con `startTransition`.** La barra del alumno arranca el indicador en el toque (estado urgente) y pide la sección en el cuadro siguiente (`requestAnimationFrame` → `startTransition`): el render nunca demora el arranque del indicador.
- **View Transitions sólo entre documentos**, con `@view-transition { navigation: auto }` en las páginas de las apps.

## 4. Maquinaria compartida (archivos nuevos)

| Archivo | Responsabilidad |
|---|---|
| `apps/web/src/components/motion/SectionStage.tsx` | Escenario: secciones vivas (LRU), dirección, salida fija, entrada, corte de meta, formación, scroll por sección antes de pintar, foco (sin `h1`, a la sección), reinicio por `resetKey` y entrada «volver». Sólo la activa se vuelve a dibujar: la que sale y las ocultas conservan su último nodo |
| `apps/web/src/components/member/TabBar.tsx` | Barra «Cristal flotante» con estado urgente, sprint, arranque del ícono, FLIP al aparecer Gym, toque, vuelta arriba y lectura anticipada |
| `apps/web/src/components/motion/SlideIndicator.tsx` | Indicador medido (patrón M01) para `.gtabs`, `.seg`, `.tabs` y `.co-nav`; `useEnter` para paneles de segmento |
| `apps/web/src/components/motion/Skeleton.tsx` | `Skel`, `SkelCard`, `Loading` (role=status oculto) y `Reveal` |
| `apps/web/src/lib/cache.ts` | Caché en memoria por URL (stale-while-revalidate): `useCached`, `fetchCached`, `prefetch`, `invalidate`, `setCached`. Nunca en almacenamiento |
| `apps/web/src/lib/ghost.ts` | `ghostOut(node, kind)`: copia inerte para las salidas de hojas, modales y avisos |
| `apps/web/src/components/ui/FlashToast.tsx` | Aviso del staff con salida |
| `apps/web/src/styles/motion-nav.css` | Escenario, esqueletos, revelado, toque, fondos, salidas, indicadores, cajón y entrenamiento (importado una vez en `app/layout.tsx`) |
| `apps/web/src/styles/doc-transitions.css` | View Transitions entre documentos (importado sólo por las páginas de las apps) |
| `apps/web/src/lib/motion.ts` (ampliado) | `canAnimate()`, `play()` y las constantes `M06` |

API de `SectionStage`: `active`, `order` (fuera del orden = profundidad), `render(k)`, `axis` (`"x"` | `"auto"`), `resetKey`, `keep` (6), `focus` (`"lost"` | `"title"`), `paneClass` (`tab-pane` | `co-pane`), `top(k)` (claves que siempre empiezan arriba).

## 5. Sin cuadros vacíos ni saltos

1. **Volver nunca vacía.** `<Activity>` deja lo último a la vista mientras revalida. `useLoad` (Coach, Gym y Admin; también Ventas) pasó a apoyarse en `lib/cache.ts`: estado inicial desde la caché por URL exacta, sin `setData(null)` con dato, respuestas viejas descartadas por secuencia, opción `keep` (dato anterior marcado `stale` y atenuado) en la búsqueda de Socios, el Performance Center y la semana de la Agenda. La caché vence a los 10 min y se vacía al cambiar de sede o de relación del alumno (`resetKey`). `ProgramBuilder` no usa `useLoad` (F-05 intacto); `MemberDetail`, `ContractView` y la ficha del cliente del coach quedan cacheadas por id.
2. **Primera visita con la forma final.** Esqueletos (`--ui-skeleton`) del alto real, `aria-hidden`, con un `role=status` oculto «Cargando …». Bloques seguros reservados: «Tu período» y «Evolución por ejercicio» (Progreso), NIVEL, «En sala ahora», «Te toca hoy» (rutina propia), lista de «Mis rutinas». Opcionales con `Reveal`: Desafíos de la comunidad, invitaciones (Nudges), deseos y «Antes de REPI».
3. **Tu gym:** `h1` «Tu gym», bajada y carnet en esqueleto y `.gtabs` desde el primer cuadro; M03 sólo en el área de contenido y sólo pasados 180 ms.
4. **Mensajes:** esqueleto de lista (3 filas) o de chat si la última respuesta de la sesión fue una sola conversación; el registro arranca con burbujas en esqueleto; `h1` oculto «Mensajes» en el chat (foco y lectores).
5. **Lectura anticipada:** `prefetch()` en el `pointerdown` de la barra (`/api/me/gym/home`, `/api/me/level`, `/api/messages`).
6. **Ruido por toque en el staff:** avisos (Gym), condiciones y novedades (Coach y Gym) como máximo cada 30 s, al volver a la pestaña y después de cada acción. `go`, `openMember` y `shell` memorizados en `GymApp`.
7. **Primera carga del staff:** Gym dibuja el armazón (lateral navy con 6 filas y contenido en esqueleto); Coach dibuja el panel en esqueleto; Admin `ContractView` muestra «← Clientes» y el título en esqueleto; ficha del socio, ficha del cliente y lista de `ChatPane` con esqueletos.

## 6. Hojas, modales, toques y entrenamiento

- Fondos `.sheet-bg` y `.modal-bg` con fundido de 200 ms; `.co-scrim` siempre dibujado con `data-open`.
- Salidas con `ghostOut()` en el cleanup de `useLayoutEffect` de `Sheet` y `Modal` (el DOM todavía conectado): copia inerte, `aria-hidden`, `data-ghost`, sin `id`, `role` ni `aria-modal`; video, iframe y canvas reemplazados por cajas; tope de 400 ms; el foco vuelve en el acto al botón que abrió. El guardián de Esc de `Sheet` pasó a `.modal-bg:not([data-ghost])`.
- Toque `.97` sólo dentro de `.mb`, `.co`, `.sheet-bg` y `.modal-bg` (el sitio público y `/conoce` no cambian); resaltado de toque transparente.
- `SlideIndicator` en Progreso (una línea en `MemberApp`), Tu gym y Club, `Seg` del staff, pestañas de la ficha del cliente y menú lateral de Coach, Gym y Admin.
- Entrenamiento sólo con CSS: `.mb-col > .wo` sube 16 px en 240 ms; «Cargando entrenamiento…» aparece sólo pasados 180 ms; al volver, entrada «volver» del escenario.

## 7. Movimiento reducido

Cambio **inmediato**: sin salida, entrada, corte, formación, estiramiento, arranque del ícono, copias de salida, barrido de esqueletos ni revelado; el indicador salta. Todo lo que va por JavaScript pasa por `canAnimate()`; `@view-transition { navigation: none }` y `animation: none` en `::view-transition-*`. M03 conserva su variante estática.

## 8. Navegadores sin soporte

Dentro de la app nada depende de View Transitions. Sin `Element.animate` el cambio es inmediato; sin animación de `clip-path` el título sólo se desliza; sin la propiedad `scale` (Safari < 14.1) no hay estiramiento; sin `inert` (Safari < 15.5) protegen `aria-hidden` y `pointer-events: none`. Entre documentos, sin `@view-transition` (iOS < 18.2, Firefox < 144) la carga queda como siempre. Interruptor: borrar `styles/doc-transitions.css` (un solo archivo) si el iPhone del titular muestra parpadeos con iOS 26.

## 9. Accesibilidad y scroll

- **Foco.** Si está en la barra o en el menú lateral, se queda (convención nativa). Si quedó en la sección que sale o en `body`, va al `h1` de la nueva (`tabIndex={-1}`, `preventScroll`). En Coach, Gym y Admin (`focus="title"`) siempre al `h1` después del commit (se borró el `requestAnimationFrame` de `go()`, que con `startTransition` enfocaba el título viejo). Admin ganó `go()`. Una pantalla sin `h1` (p. ej. «Videos de ejercicios») recibe el foco en la sección misma (`tabIndex={-1}`, sin anillo). Un `h1` que la pantalla reemplaza al cargar se mantiene como el mismo elemento (Programas: queda oculto a la vista junto al nombre editable).
- **Cajón del staff (< 768 px).** Cerrado, además de estar fuera de la pantalla queda `visibility: hidden` (se oculta al terminar de cerrarse, aparece en el acto al abrirse): sus botones no reciben foco ni se leen.
- **Lectores.** La sección que sale queda `inert` y `aria-hidden` desde el primer cuadro; las ocultas están en `display: none`: nunca hay dos `h1` ni dos regiones expuestas. No se agregó una región viva extra.
- **Scroll por sección** restaurado antes de pintar con el contenido real, también en el staff; abrir un recurso concreto (ficha, contrato) empieza arriba.
- **DOM oculto.** `DemoTour` elige objetivos visibles (`checkVisibility()`); prueba de `id` duplicados; los diálogos que navegan cierran antes de navegar (Connect).
- **Hallazgo de S0:** dentro de una sección oculta, React aplica sus cambios de atributos con prioridad ociosa: una sección oculta puede conservar `data-leaving`/`inert` viejos hasta que se vuelve a mostrar (está en `display:none`, no afecta). Las pruebas cuentan sólo las secciones a la vista.

## 10. Ficha del socio desde Sala (pedido del 07/11)

- `main` ya traía la pantalla «member» (#70): «Abrir ficha del socio» (Sala) y «Abrir socio» (Mi turno y Cola) abren sólo la ficha, con el nombre como título y «Volver a …»; Socios muestra lista o ficha una por vez en angosto (consulta de contenedor de 836 px). Esta rama la completa:
  - `shell.openMember(id, { name })`: el título es el nombre desde el primer cuadro (no cambia al cargar), `pushState` con `?s=member&sel=<id>&from=<pantalla>`; el «atrás» del sistema (gesto de iOS en la PWA, botón de Android) y «Volver a …» regresan al origen con su estado y su scroll (pantallas vivas). Recargar mantiene la ficha y el «Volver a …» (sólo hacia una pantalla del rol).
  - El modal del pedido se cierra antes de navegar.
  - Profundidad «adelante» y «Volver» como «atrás»; sin cambios de permisos (la ficha exige Socios; el servidor autoriza cada ficha).
- **Coach, mismo defecto y mismo arreglo:** pantalla «client» (`?s=client&c=<id>&from=…`) con sólo la ficha del cliente, el nombre como `h1` y «Volver a Solicitudes / Mensajes / Cobros / Panel». «Ver ficha» desde Solicitudes, Panel y Cobros, y «Ver perfil →» desde Mensajes, la abren. En Clientes, cuando la lista y la ficha no entran lado a lado (< 836 px de contenedor), tocar un cliente abre la ficha como página.
- **No hecho:** el vuelo FLIP del nombre desde la tarjeta hasta el título (ver §16).

## 11. Pasos

| # | Paso | Estado |
|---|---|---|
| S0 | Línea base y prueba de `<Activity>` | Hecho (§17) |
| S1 | Ficha del socio como página (Gym y Coach) | Hecho (Gym partía de #70) |
| S2 | Tokens, `motion.ts`, `motion-nav.css`, `cache.ts`, `ghost.ts`, `Skeleton` | Hecho |
| S3 | `SectionStage` | Hecho |
| S4 | Alumno: `TabBar` y escenario | Hecho (`MemberApp.tsx`: 5 bloques, ~36 líneas; `Workout.tsx`: 0) |
| S5 | Alumno: datos de primera visita | Hecho para Tu gym, Progreso, NIVEL, Antes de REPI, rutinas propias, Desafíos, Nudges, Deseos, En sala ahora, Mensajes, chat, Mi cuerpo y Fotos |
| S6 | `SlideIndicator` y entrada de segmentos | Hecho |
| S7 | Hojas, modales, toque y entrada al entrenamiento | Hecho |
| S8 | Staff: escenario, `useLoad` con caché, avisos, esqueletos, menú lateral | Hecho, salvo el vuelo del nombre |
| S9 | View Transitions entre documentos | Hecho (`doc-transitions.css`) |
| S10 | Documentación, verificación, material para el titular | Documentación y verificación hechas; PR y videos pendientes (§16) |
| S11 | Correcciones de la QA independiente (§18) | Hecho |

## 12. Verificación

- `pnpm typecheck` (sin `-s`: con `-s` pnpm oculta los errores de `tsc`), `pnpm build`, `tsx --test tests/theme/theme-tokens.check.ts`.
- `next start -p 3104` con `repi_dev` y demos; Playwright con Chromium 153 local.
- `e2e/motion-nav.spec.ts` (`reducedMotion: "no-preference"`, Pixel 7 y 1366×860, CPU ×4 con CDP en el recorrido): indicador, cuadros vacíos, layout-shift por visita, tareas largas, cinco toques en 250 ms, foco, movimiento reducido, `id` duplicados, hojas con copia de salida y escritorio Gym (lateral fijo, foco, scroll recuperado). Con `MOTION_BASELINE=1` sólo registra números.
- `e2e/gym-member-page.spec.ts` (ampliada en lugar de crear `gym-member-file.spec.ts`): Sala → pedido → ficha sola, foco en el nombre, «Programa institucional» a la vista en 390×844, «atrás» del navegador, «Volver a Sala» con la pestaña conservada, recarga, Mi turno (se saltea si la demo no tiene pendientes con socio) y la variante Coach «Ver ficha».
- Nunca vitest.

**Resultado de las suites existentes contra la rama** (teléfono y escritorio, `next start -p 3104`, `repi_dev`):

| Suites | Resultado |
|---|---|
| `motion-nav`, `gym-member-page` | ✓ (Mi turno se saltea: la demo no tiene pendientes con socio) |
| `member-workout`, `theme-visual`, `experience-ux`, `offline-reload`, `weight-edit`, `own-routine-create`, `demo-tour-scope`, `connected-stages`, `emom-sync`, `prescribed-weights`, `training-intelligence` | ✓ |
| `roles`, `coach-workflow`, `coach-methods`, `combine-exercises`, `connect-program`, `join-pending-staff`, `template-rollout`, `training-intelligence-roles` | ✓ (`training-intelligence-roles` siembra la base leyendo `apps/web/.env.local`: se corrió con uno temporal sólo con la URL de `repi_dev` y se borró) |
| `public`, `conoce`, `theme` | ✓ |
| `mobile-layout` | ✓ salvo «importa una rutina con métodos escritos», que **también falla en `main` `218cd53`** (mismo error contra el servidor de línea base): ajeno a M06 |
| `personal-progress` | ✓ salvo «fotos…»: la parte de la interfaz pasa (con `STORAGE_DIR` local); falla al abrir un segundo contexto que no hereda el `baseURL` y apunta al puerto 3000 (entorno de esta sesión) |
| `theme-admin` | Se saltea: requiere `E2E_ADMIN_STATE` |
| `api-auth-sweep` | 1 de 2 en escritorio: `POST /api/site/event` (medición pública de /conoce, D205/D208) responde 204 sin sesión y no figura en la lista de rutas públicas de la prueba. Ruta de servidor que esta rama no toca: ajeno a M06 |

Durante las corridas, el tope de 300 demos abiertas de `repi_dev` (compartida con otras sesiones) devolvió «Hay muchas demos abiertas»: se purgaron sólo demos `is_demo` con más de 30 minutos (el mismo `purgeSandboxes` del job de 6 h) y se repitieron las pruebas.

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| DOM oculto con `<Activity>`: `id` duplicados, localizadores estrictos en E2E, `DemoTour` | Prueba de `id`; `DemoTour` elige visibles; localizadores acotados a lo visible (`:visible`, `toBeHidden`) |
| Contenido en portales de una sección oculta | Confirmado en S0: React también oculta los portales; igual, lo que navega desde un diálogo lo cierra antes |
| Efectos de montaje que vuelven a correr al mostrar (aviso de logro en Gym, `seen`, `onChanged` de Mensajes) | Equivalente a antes (se remontaba en cada visita) |
| Memoria con secciones vivas | LRU de 6 en alumno y staff |
| Dato viejo visible un instante | Siempre se revalida; se vacía por sede o relación; `keep` sólo donde se pide, atenuado y con `aria-busy` |
| Capa grande al fijar una sección larga que sale | Recorte al viewport con `clip-path`; dura 100 ms |
| Desborde horizontal por las traslaciones (en el teléfono el navegador alejaba la vista y movía la barra fija: layout-shift falso) | `.mb-col, .co-main { overflow-x: clip }` |
| Choque con AC3 en `MemberApp.tsx` | 5 bloques mecánicos; cero en `Workout.tsx` |
| Avisos con hasta 30 s de demora | Después de cada acción se actualizan en el acto |
| WebKit en iOS 26 con View Transitions entre documentos | Un archivo que se puede quitar |

## 14. Fase 2 (después de fusionar AC3)

En `MemberApp.tsx`: caché y esqueleto en `MyGoals`, `NextAppointment`, `MyCharges`, privacidad de Perfil, `loadBriefs`/`PendingBriefBanner`, `ProgramNotice` y la tarjeta de programa de Inicio; «Volumen por semana» sin el vacío falso cuando `hist` es `null`; salida del aviso del alumno; el entrenamiento por encima del árbol principal (para no perder las secciones al volver). Fuera de estos pasos: Mensajes del equipo (`ChatPane` en `.split`) con el mismo patrón lista/ficha en el móvil.

## 15. Documentación al cerrar

`motion.md` §13 «M06 · Carril» y nota en §12; `docs/DESIGN_CONTRACT.md` (filas «Cambio de sección» y «Ficha del socio»); `docs/DECISIONS.md` D211; este documento; `docs/continuidad/PROXIMA_SESION.md`. `docs/PRODUCT_INVENTORY.md` es generado: no se marcó «probado» a mano.

## 16. Pendiente

- **Vuelo del nombre** (FLIP de 240 ms desde la tarjeta o el pedido hasta el título de la ficha): no se hizo. La ficha entra como profundidad y su título existe desde el primer cuadro.
- **Material para el titular:** videos antes/después (`recordVideo` de Playwright) y prueba en su iPhone con la PWA en iOS 26 (lista abajo). Sin PR ni despliegue: lo decide el titular.
- **Lista para el iPhone (iOS 26, PWA instalada):** toques rápidos entre las cinco pestañas; Tu gym y Progreso la primera vez (sin blanco ni saltos); Mensajes; abrir y cerrar hojas (salida); VoiceOver (anuncia el título nuevo, nada de la sección que sale); movimiento reducido (cambio inmediato); Informe mensual (fundido entre documentos); Sala → ficha → «Volver» y gesto atrás; parpadeos en `.tabfade` y en el desenfoque de la cápsula.

## 17. Resultados medidos

### S0 · Prueba de `<Activity>` (React 19.3.0, Chromium 153, página aislada en el scratchpad; no quedó nada en la rama)

| Hecho | Resultado |
|---|---|
| Lo oculto queda en `display: none` | **Confirmado** (`display: none !important` en el primer nodo de la sección) |
| `useEffect` y `useLayoutEffect` limpian al ocultar y vuelven a correr al mostrar; el estado se conserva | **Confirmado** (contador conservado; `layout-cleanup`/`cleanup` al ocultar, `layout`/`effect` al mostrar) |
| Los sondeos se detienen mientras está oculta | **Confirmado** (sin ticks del `setInterval` oculto) |
| Los portales (hojas, modales) de una sección oculta se ocultan | **Confirmado** (también `display: none`) |
| El scroll de la ventana se pierde al ocultar una sección larga | **Confirmado** (vuelve a 0): `SectionStage` guarda y restaura el scroll por sección |
| El foco dentro de una sección que se oculta | **Confirmado**: pasa a `body`; `SectionStage` lo lleva al `h1` |
| Lo que vuelve a correr al mostrar en `GymTabView` (aviso de logro, `notices/seen`), Mensajes (`onChanged` → `loadInbox`) y `NewTag` | Revisado: equivalente a antes, que se remontaba en cada visita |
| Una sección oculta montada por primera vez (pre-render) no corre efectos | Confirmado; `SectionStage` sólo dibuja claves visitadas |

### Línea base (main `218cd53`) y resultado de la rama · alumno, Pixel 7, CPU ×4

Misma prueba (`e2e/motion-nav.spec.ts`, versión final) contra dos servidores: `main` compilado en un worktree aparte (puerto 3114, `MOTION_BASELINE=1`) y esta rama (3104). Cuadros contados desde el `click` (cuando navega). «Cuadros vacíos» = cuadros en los 400 ms posteriores sin una sección con opacidad ≥ .45 y un título visible.

| Toque | Visita | Indicador: cuadros hasta moverse (antes → ahora) | Indicador en destino (ms) | Cuadros vacíos | Layout-shift | Tareas largas > 50 ms |
|---|---|---|---|---|---|---|
| Entrenar | primera | 3 → 1 | 191 → 206 | 3 → 0 | 0 → 0 | 0 → 1 (73 ms) |
| Progreso | primera | 4 → 1 | 284 → 183 | 4 → 0 | 0,222 → 0 | 1 (60 ms) → 0 |
| Mensajes | primera | 3 → 1 | 167 → 204 | 3 → 0 | 0 → 0 | 0 → 0 |
| Tu gym | primera | 2 → 1 | 163 → 189 | 7 → 0 | 0 → 0 | 0 → 0 |
| Inicio | vuelta | 3 → 1 | 207 → 230 | 3 → 0 | 0 → 0 | 0 → 0 |
| Entrenar | vuelta | 3 → 1 | 161 → 186 | 3 → 0 | 0 → 0 | 0 → 0 |
| Progreso | vuelta | 3 → 1 | 193 → 205 | 3 → 0 | 0 → 0 | 0 → 0 |
| Mensajes | vuelta | 3 → 1 | 155 → 183 | 3 → 0 | 0 → 0 | 0 → 0 |
| Tu gym | vuelta | 2 → 1 | 132 → 179 | 5 → 0 | 0 → 0 | 0 → 0 |
| Inicio | vuelta | 4 → 1 | 222 → 228 | 3 → 0 | 0 → 0 | 0 → 0 |

- El indicador llega un poco después porque ahora recorre 240 ms (sprint) en vez de 160, pero **arranca en el primer cuadro** (antes, en el tercero o el cuarto).
- La primera versión de la prueba (cuadros desde el `pointerdown`) dio números equivalentes en `main`: 2–4 cuadros, 2–4 cuadros vacíos por toque y layout-shift 0,289 (Progreso) y 0,142 (Inicio al volver).
- La tarea larga de la primera visita a Entrenar es su primer render (existía antes; ahora entra en la ventana porque el contenido se dibuja completo). Al volver: ninguna.
- **Cinco toques en 250 ms:** antes y ahora terminan en Progreso con una sola sección visible; ahora sin secciones fijas ni saliendo a los 350 ms.
- **Foco:** antes, desde el avatar a Perfil el foco quedaba en `body`; ahora va al `h1` «Perfil». La barra conserva el foco en el botón.
- **Movimiento reducido:** antes y ahora, cambio inmediato y opacidad 1 en el primer cuadro; ahora además 0 animaciones.
- **`id` duplicados:** ninguno, antes y ahora (con secciones vivas).
- **Entre documentos** (`/app` → `/app/informe`, Chrome): `pagereveal` con `viewTransition`, animación de 185 ms; con movimiento reducido, sin transición.
- **Videos antes/después** (Playwright, mismo recorrido de la grabación, Pixel 7 y escritorio, más Sala → ficha → volver): en el scratchpad de la sesión, `tx-videos/{antes,despues}-{alumno-telefono,sala-ficha-telefono,gym-escritorio}.mp4`. No se versionan.

### Escritorio Gym (dueño, 1366×860)

| Medida | Antes | Ahora |
|---|---|---|
| Cuadros vacíos por cambio de pantalla | 1–2 | 0 |
| Layout-shift al volver | 0,041 | 0 |
| Scroll al volver (600 px pedidos; la pantalla daba 251) | 0 (siempre arriba) | 251 (recuperado) |
| Foco en el `h1` nuevo | Sí | Sí |
| Lateral fijo | Sí | Sí |
| Indicador del menú | Salta | Se desliza (se mueve en 2 cuadros, llega en ~170–200 ms) |

## 18. QA independiente (07/11) y correcciones

Cada hallazgo se reprodujo antes de corregirlo con los mismos guiones de la QA (copiados a `scratchpad/tx-fix/qa`, para no pisar su evidencia en `scratchpad/tx-qa`), contra un servidor propio en 3104 y `repi_dev`.

| # | Hallazgo (gravedad) | Causa | Corrección | Resultado |
|---|---|---|---|---|
| 1 | Sala → pedido → «Abrir ficha del socio»: Sala, viva, abría un segundo diálogo «Solicitud» con error que seguía abierto al volver (ALTA) | Selección `sel` compartida por todas las pantallas: `openMember` la ponía en el id del socio y Sala, todavía visible durante su salida, la tomaba como pedido | **Selección por pantalla** en Gym y Coach (`sels`: cada pantalla viva ve sólo la suya; ir a una pantalla fija la suya). Además el escenario **congela la sección que sale y las ocultas** (conservan su último nodo: no ven el estado nuevo). La entrada del historial del origen se reescribe con su selección al salir | Diálogos 0 en la ficha y al volver (con «Volver a Sala» y con el «atrás»), foco en «Sala», 2 de 2 corridas con movimiento normal |
| 2 | Coach Mensajes → «Ver perfil →» → «Volver a Mensajes» perdía la conversación (MEDIA) | Misma selección compartida: el id del cliente llegaba a `ChatPane` como conversación | Selección por pantalla (`client`/`clients` guardan el cliente; `msgs`, su conversación) | Vuelve con «Valentina Gómez» abierta |
| 3 | Progreso, primera visita con latencia: CLS 0,082–0,099; las marcas «Nuevo» corrían los botones (MEDIA) | Esqueleto de «Tu período» ~165 px más bajo que lo real; «Nuevo» se dibujaba después de leer las ayudas | Esqueletos con el mismo marcado y alto que lo real (indicadores con sus rótulos, frecuencia de 80 px, 8 filas de marcas; «Evolución por ejercicio» con gráfico, leyenda, dato y notas); ayudas leídas al abrir la app y disponibles en forma síncrona (`Hint.tsx`); lectura anticipada del resumen y la lista al tocar Progreso | Esqueleto 701/579 px = real 701/579 px; CLS 0 en 2 de 2 corridas (CPU ×4 + 450 ms) |
| 4 | Tu gym con latencia: contenido → vacío → contenido (MEDIA) | `useReveal` fijaba el cruce en `useEffect`: un cuadro con el contenido entero antes de apagarlo bajo el ambiente | `useReveal` en `useLayoutEffect` (el cruce empieza en el cuadro en que llegan los datos). El esqueleto deja el aviso para lectores al final: los bloques reales reutilizan los nodos en la misma posición (sin salto falso de 0,011) | 3 de 3 corridas: el primer cuadro con datos ya tiene el contenido en 0 bajo el ambiente que sale y sube sin bajar |
| 5 | Coach «Programas», primera visita: vacío falso, «Cargando programa…» y editor; CLS 0,67–0,76; foco en `body` (MEDIA) | Estados de carga distintos del editor; el `h1` se reemplazaba por el nombre editable | Editor en esqueleto (lista, acciones, días, ejercicios e indicación) mientras llega la lista o el programa; el vacío sólo con la lista vacía; error de lista con «Reintentar»; `h1` estable (oculto a la vista junto al nombre) | CLS 0; foco en el `h1` «Programas» |
| 6 | Tareas largas al volver con CPU ×4 (BAJA–MEDIA) | Secciones ocultas que se volvían a dibujar en cada render del padre | Las ocultas conservan su último nodo (no se recorren) | 3 ciclos de vuelta: 2 tareas > 50 ms en 15 vueltas (67 y 52 ms; antes 81–147 ms en varias); indicador en ≤ 218 ms al volver |
| 7 | Dos títulos legibles a la vez ~5 cuadros (BAJA, diseño) | Opacidad de salida en `--ease-in` de 100 ms | Opacidad de salida en 70 ms con `--ease-std` (la traslación sigue en 100 ms `--ease-in`); al terminar se oculta y se quita `data-leaving` sin esperar a React | 1 cuadro en los 10 cambios; lo que sale deja de verse a los ~63 ms |
| 8 | «Volver a Sala»: el título de la ficha que sale pasaba a «Ficha del socio» (BAJA) | La selección compartida se vaciaba con la ficha todavía visible | Sección que sale congelada + selección por pantalla | Prueba E2E: ningún cuadro con «Ficha del socio» durante la salida |
| 9 | Pantallas sin `h1` y cajón cerrado: el foco quedaba en un botón del menú fuera de la pantalla (BAJA) | Sin `h1` no se movía el foco; el cajón cerrado sólo estaba trasladado | Foco a la sección cuando no hay `h1`; cajón cerrado con `visibility: hidden` en < 768 px | — |

**Pruebas nuevas:** `gym-member-page.spec.ts` › «con movimiento» (`reducedMotion: "no-preference"`): diálogos (también ocultos) en 0 en la ficha, después de «Volver a Sala» y del «atrás», título de la ficha estable durante la salida; Coach Mensajes → «Ver perfil →» → «Volver» con la misma conversación; Programas sin vacío falso y con el foco en el título. `motion-nav.spec.ts` › «primera visita con latencia» (CPU ×4 y 450 ms por pedido): Progreso con layout-shift ≤ 0,05 (mide 0) y Tu gym sin apagarse una vez a la vista. Una aserción de `gym-member-page` que buscaba «Socios» por rol en el cajón cerrado pasó a mirar el botón del menú directamente (el cajón cerrado ya no se expone a los lectores).

**Corridas** (servidor propio en 3104, `repi_dev`, demos): `motion-nav` + `gym-member-page` 23 ✓ (teléfono y escritorio; «Mi turno» se saltea como antes); `roles`, `coach-workflow`, `connect-program`, `theme`, `experience-ux`, `demo-tour-scope`, `member-workout`, `join-pending-staff`, `combine-exercises`, `coach-methods`, `template-rollout` 56 ✓; `mobile-layout`, `personal-progress`, `theme-visual`, `own-routine-create`, `weight-edit`, `offline-reload`, `training-intelligence`, `connected-stages`, `emom-sync`, `prescribed-weights` 47 ✓ y los 2 fallos ya conocidos de §12 (importar métodos escritos, que también falla en `main`; fotos, por el segundo contexto en el puerto 3000). El tope de 300 demos de `repi_dev` volvió a llenarse: se purgaron sólo demos `is_demo` con más de 30 minutos con el mismo `purgeSandboxes` (el guion anterior leía mal el valor devuelto y paraba en la primera tanda de 50; la copia corregida está en `scratchpad/tx-fix/purge-old.ts`).
