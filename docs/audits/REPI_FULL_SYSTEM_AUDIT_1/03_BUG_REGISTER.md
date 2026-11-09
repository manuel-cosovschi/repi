# 03 — Registro de defectos

Auditoría FSA1, 09/11/2026.
- **Gravedad:** según el §19 del máster (P0 crítico … P3 bajo).
- **Prueba:** cada defecto corregido tiene una prueba que falla con el código anterior y pasa con el arreglo, salvo que se indique otra cosa.
- **«Antes»:** evidencia tomada contra la build de `main` (`:3201`) o contra el código revertido.

Prefijos de área:
- **MEM:** socio y entrenamiento.
- **SEC:** seguridad.
- **STF:** coach, sala y gestión.
- **IMP:** importación, rutinas y progreso.
- **COM:** comunicaciones, IA y admin.
- **UI:** interfaz y móvil.
- **INF:** infraestructura.

Los duplicados encontrados por dos áreas se consolidaron y se indica cuál arreglo se integró.

## P0 — Crítico

| ID | Defecto | Causa raíz | Arreglo | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| SEC-01 (= COM-01) | El enlace por email, el código por email, la verificación de email y el callback social abrían sesión **sin la verificación en dos pasos**, también en REPI Admin y en los roles del gym | El plugin `twoFactor` de Better Auth 1.7.7 sólo intercepta `/sign-in/email`, `/sign-in/username` y `/sign-in/phone-number` | `server/auth.ts`: plugin propio que aplica el mismo desafío a esos caminos; los enlaces redirigen a `/acceso?step=twofa`. Se integró el arreglo de seguridad; el de comunicaciones rechazaba la sesión sin dejar completar el segundo factor | `auth-second-factor.test.ts`, `twofa-bypass.test.ts` (prueba independiente de otro auditor, con control sin 2FA), Playwright enlace → TOTP | Corregido |
| MEM-03 | Una serie registrada **sin conexión se perdía en silencio**: con dos pestañas, o cuando la cola aplicaba una respuesta mientras se registraba otra serie | `putLocal` y `applyResult` escribían la sesión entera sin atomicidad en IndexedDB; el ítem de la cola quedaba sin serie y se borraba sin enviar | `idb.ts` `idbMerge` transaccional; `store.ts` `keepDone`, `updateLocal` y `putServerCopy`; `queue.ts` | `offline-keep-done-client.test.ts`; e2e «dos pestañas sin conexión» (antes: serie 2 perdida) | Corregido |

## P1 — Alto

| ID | Defecto | Causa raíz | Arreglo | Prueba | Estado |
| --- | --- | --- | --- | --- | --- |
| STF-01 (= SEC-02) | **Dueño y gerencia leían las series del socio**, con sensación («molestia») y notas, y las notas del equipo | `memberDetail` devolvía el registro completo a cualquier rol con `member.read` | Series y notas sólo para el equipo de entrenamiento de la sede (`floor.work`); `seesTraining`; la ficha explica qué no ve la gestión (D178, D191). Se integró la versión de personal, la más estricta; ver la decisión en 09 | `gym.test.ts` «FSA1 · gestión no lee datos privados» | Corregido |
| STF-02 | **Guardar un programa mientras el alumno empieza a entrenar esa versión la reescribía** | `writeProgramDoc` decidía con `locked` leído sin bloqueo | `SELECT … FOR UPDATE` de la versión antes de decidir | `coach-workflow.test.ts` (carrera) | Corregido |
| STF-09 | **No existe forma de quitar a alguien del equipo ni de cambiarle rol o sede**; un ex entrenador conserva el acceso | Gestión de equipo no implementada (sólo invitar) | No aplicado: es una decisión de producto y permisos. El servidor ya respeta `revoked` en el pedido siguiente (probado). Mitigación operativa en 09 | `gym.test.ts` (la revocación aplica en el servidor) | **Abierto (decisión)** |
| MEM-02 | **Sin almacenamiento en el teléfono** la serie aparecía hecha, arrancaba el descanso y decía «Guardado en tu cuenta», pero no estaba en ningún lado | `commit()` actualizaba la pantalla antes de guardar y el rechazo quedaba sin atender | `Workout.tsx`: revierte, avisa (`role=alert`) y no avanza; conserva RIR, sensación y nota | e2e «sin almacenamiento en el teléfono» | Corregido |
| MEM-04 | **Series sin conexión de un entrenamiento que el servidor cerró solo (D160) se rechazaban para siempre** | `logSet` rechazaba toda serie de una sesión `abandoned` | Si el cierre fue automático y la serie es posterior al inicio, la sesión se reabre y se audita `workout.revived_by_late_set`; un corte manual sigue rechazando | `member-late-sets.test.ts` | Corregido |
| MEM-01 (= IMP-03) | **«Peso inválido» con pesos válidos con decimales:** 64,1, 8,2, 1,15 kg y entre el 13 y el 24 % de los valores que la app muestra en lb | `Math.round(n*100) === n*100` sin tolerancia de coma flotante | `twoDecimals()` con tolerancia en `commercial.ts` y `units.ts`; lo usan el entrenamiento, el historial, «Mis rutinas» y las metas | `units.test.ts` (recorrido exhaustivo de 0 a 1000 kg y lb), e2e «64,1 kg», `weight-edit.spec.ts` | Corregido |
| IMP-01 | La IA podía presentar como «leídos» series, repeticiones o cargas **que no figuran en el renglón citado** | La evidencia sólo se verificaba si el renglón no tenía ningún dígito | Los números que no están en el renglón quedan dudosos, para confirmar | `program-import.test.ts` (dominio y web) | Corregido |
| COM-02 | Un **pedido de ayuda en espera o un seguimiento vencido no avisaba a nadie** si no había nadie en turno en la sede | `connectSweep` usaba sólo el personal en turno: `enqueue([])` no insertaba nada (ni siquiera `skipped`) | Respaldo hacia la gestión de la sede (dueño, gerencia, coordinación), como en el escalamiento de QR | `connect.test.ts` «FSA1: sin nadie en turno» | Corregido |

## P2 — Medio

| ID | Defecto | Arreglo | Prueba | Estado |
| --- | --- | --- | --- | --- |
| STF-03 | Editar y cambiar de programa en menos de 700 ms dejaba el cambio sin guardar | `ProgramBuilder.tsx` guarda al salir, en orden | e2e `coach-workflow.spec.ts` | Corregido |
| STF-04 | Embudo «Entrenaron en 30 días» reconstruido desde un porcentaje redondeado (150 socios y 1 entrenó → mostraba 2) | `trainedN` real | `gym.test.ts` | Corregido |
| STF-05 | Ejecutivo: un entrenador con varias sedes contaba sólo en una | Conteo distinto por sede | `gym.test.ts` | Corregido |
| MEM-05 | Una serie fuera de los topes del servidor frenaba la sincronización de todo el entrenamiento | Se avisa antes de registrarla, con los mismos topes | e2e | Corregido |
| SEC-03 | Fotos del Club y de la comunidad guardadas con EXIF y GPS | Limpieza en el servidor | `club-profile.test.ts`, `community.test.ts` | Corregido |
| SEC-04 | Al cerrar sesión quedaban borradores privados y el push de la cuenta | `session-cleanup.ts` | `logout.test.ts` + Playwright | Corregido |
| SEC-05 | «Descargar mis datos» incompleta | Secciones agregadas | `privacy.test.ts`, `training.test.ts` | Corregido |
| SEC-06 | Aceptar invitaciones sin tope (enumeración) | 10 intentos cada 10 minutos | `access.test.ts` | Corregido |
| IMP-02 | Una salida de la IA con forma inválida daba 500 | `aiShape` → 422 con lo leído directo | `program-import.test.ts` | Corregido |
| IMP-04 | Los récords mezclaban 1RM estimado con carga máxima | Cada escala contra su escala | `personal-progress.test.ts` | Corregido |
| IMP-05 | Las fotos de progreso conservaban EXIF tras el fin de la imagen o entre cuadros progresivos | `image.ts` recorre los segmentos | `image.test.ts` | Corregido |
| IMP-06 | La IA que empareja el historial importado cambiaba la variante del ejercicio | `variantConflict` | `history-import.test.ts` | Corregido |
| IMP-07 | El borrador de importación (con su `opId`) se perdía al recargar en los 400 ms siguientes, y el reintento duplicaba | Guardado inmediato en `pagehide` y al guardar | e2e `own-routine-import.spec.ts` | Corregido |
| COM-03 | El email de la decisión de alta y el recordatorio de consentimiento ocultaban los fallos del proveedor | `logError` sin secretos | `annex.test.ts` | Corregido |
| COM-04 | «Mantener» en moderación volvía a publicar lo que el autor había borrado | Sólo cambia lo oculto | `community.test.ts` | Corregido |
| COM-05 | Cambios de REPI Admin sin auditoría (revocar bienvenida, estado de contacto); cambio de responsable no atómico | Auditoría y transacción | `annex.test.ts` + e2e | Corregido |
| INF-01 | Al vencer una demo, sus archivos quedaban en el bucket para siempre (los 5 huérfanos de producción) | `purgeSandboxes` borra los archivos después del commit | `sandbox.test.ts` «FSA1» | Corregido |
| UI-01 | Un QR de sede vencido o una invitación inválida quedaban en «Cargando…» para siempre, sin salida | «No pudimos abrir…» con «Reintentar» e «Ir a ingresar» (`AccessFlow.tsx`) | e2e `ui-sweep.spec.ts` | Corregido |
| UI-02 | En el teléfono, una invitación inválida mostraba primero (y otra vez) la guía de instalación | `entryFailed` apaga la guía | e2e `ui-sweep.spec.ts` (mobile) | Corregido |
| COM-07 | «No vino el profe» y la rutina sin programa no leen las lesiones ni las molestias registradas | — | — | **Abierto (decisión, 09)** |
| COM-09 | El email transaccional no se reintenta (código, restablecer contraseña, consentimiento del tutor, decisión de alta) | — (COM-03 al menos deja ver los fallos) | `mailer.test.ts` | **Abierto (diseño, 09)** |

## P3 — Bajo

| ID | Defecto | Estado |
| --- | --- | --- |
| STF-06 | Panel de sede: tareas abiertas de otras sedes | Corregido (`gym.test.ts`) |
| STF-07 | Adherencia del coach con alumnos pausados | Corregido (`coach-workflow.test.ts`) |
| STF-08 | Al cambiar de sede se abría sola la ficha de un socio de la sede anterior mientras cargaba | Corregido (sin prueba automática: efecto transitorio; el servidor igual rechaza otra sede) |
| SEC-07 | Token de la invitación de vendedor entero en `audit_event` | Corregido (`denied.test.ts`) |
| SEC-08 | Videos aceptados por el tipo declarado | Corregido (`followup.test.ts`) |
| SEC-09 | `.ics` sin escapar «;» ni el retorno de carro suelto | Corregido (`agenda.test.ts`) |
| SEC-10 | Dos rutas de fotos leían el cuerpo entero antes de chequear el tamaño | Corregido (revisión y typecheck) |
| IMP-08 | El tope de 30 rutinas se superaba con guardados simultáneos; «Duplicar» sin estado ocupado | Corregido (`program-import.test.ts`) |
| IMP-09 | En lb, editar corría la carga 0,01 kg; cambiar la fecha de un peso corporal lo reescribía | Corregido (`units.test.ts`) |
| COM-06 | Notificaciones `skipped` en producción explicadas (sin dispositivo); el push no se podía activar desde «Avisos» | Corregido (e2e) |
| INF-02 | `brain-proactive` caso 43 fallaba los lunes (el resumen semanal se emite con razón): sólo la prueba | Corregido (#86) |
| INF-04 | Prueba nueva de «Mis rutinas» con rechazos sin manejar (vitest salía con 1) | Corregido |
| MOD-01 | Al quitar el elemento enfocado (p. ej. «Quitar día») el modal ignoraba Esc y Tab con el diálogo abierto; la prueba gym-editor-parity era intermitente también en `main` (1 de 4) | Corregido en la integración (`Modal.tsx`; la prueba fuerza la pérdida de foco y falla siempre contra `main`) |
| IMP-12 | La pregunta de un método ambiguo («¿Es Pirámide?») quedaba en una fila plegada marcada «Listo»; la e2e de mobile-layout esperaba el diseño anterior a Smart Import 2.0 (fallaba también en `main`; CI no corre E2E) | Corregido en la integración (`ProgramImport.tsx` `openIssues`; prueba actualizada) |
| UI-03 | Campos táctiles de menos de 16 px (zoom de iOS al enfocar) | Corregido (`ui-sweep.spec.ts`) |
| UI-04 | Modal con un campo en `autoFocus`: el foco caía en `<body>` al cerrar | Corregido (`ui-keyboard.spec.ts`) |
| UI-05 | QR de ingreso a pantalla completa sin foco, sin Esc y sin trampa de Tab | Corregido (`ui-keyboard.spec.ts`) |
| UI-06 | Trofeo: Tab salía del diálogo y el foco se perdía al cerrar | Corregido (`ui-keyboard.spec.ts`) |
| UI-07 | Guía de la demo: foco en `<body>` al cerrarla | Corregido (`ui-keyboard.spec.ts`) |
| UI-08 | «Ahora no» a una reseña mostraba éxito aunque el servidor fallara | Corregido (`ui-failures.spec.ts`) |
| UI-09 | La píldora de la demo tapaba la última fila en Coach y Gym (teléfono) | Corregido (`ui-sweep.spec.ts`) |
| UI-10 | `/instalar/cartel` con 26 px de scroll lateral en tableta vertical | Corregido (`ui-sweep.spec.ts`) |
| UI-11 | Áreas táctiles de 17 a 22 px en listas | Corregido (explorador; sin aserción permanente de 44 px) |
| UI-12 | Enlaces de texto de 17 px en `/acceso` y en el pie | No se corrige (cumplen WCAG 2.5.8 por espaciado) |
| UI-13 | Una sección sin `h1` y el nombre del socio que no es encabezado | Abierto (diseño) |
| UI-14 | Dock del entrenamiento alto en tableta apaisada | Abierto (diseño) |
| MEM-06 | Carrera teórica: la pantalla podría mostrar el valor anterior de una corrección hasta recargar (IndexedDB ya no lo pierde) | Abierto (no reproducible) |
| IMP-10 | Cambiar de variante en la revisión de importación conserva el `opId` | Abierto (borde raro) |
| IMP-11 | El mensaje `ai_incomplete` habla de «historial» al importar rutinas | Abierto (texto compartido) |
| COM-08 | «No vino el profe» acepta las repeticiones de la IA tal cual (es sólo una sugerencia, no se guarda en el programa) | Abierto |
| COM-10 | `assist_new` avisa sólo al piso en turno; la gestión se entera a los 15 min | No se corrige (diseño, como el escalamiento de QR) |
| INF-03 | `search_path` mutable en dos triggers sin riesgo explotable | Aceptado (07 §6) |
