# 04 — Interfaz, móvil y accesibilidad

Auditoría FSA1, 09/11/2026.

## 1. Qué se probó y con qué

| Qué | Detalle |
| --- | --- |
| Navegador | **Sólo Chromium** (`/opt/pw-browsers/chromium`). WebKit y Firefox no están instalados en el entorno y no se instalaron. **No hubo iPhone, Safari ni Android físicos**: «móvil» es Chromium emulando un Pixel 7 (táctil, `isMobile`) |
| Anchos | Teléfono: 320×568, 360×667, 375×667, 390×844 y 430×844. Tableta: 768×1024 y 1024×768. Escritorio: 1366×860 |
| Temas | Claro, oscuro y automático en todas las secciones (`data-theme` verificado). `theme-visual`: 16 combinaciones de rol y tema |
| Roles | Socio, coach, sala y dueño (demos), más 21 páginas públicas. **Admin y Ventas no se recorrieron en la UI**: no hay rol demo. Sus pantallas se verificaron por API y con e2e en una build propia (02) |
| Recorrido de controles | Explorador automático de controles seguros dentro de la organización demo: socio 76, coach 244, dueño 104 y sala 228 controles tocados, verificando su efecto. Los que no muestran efecto son pestañas ya activas, botones que abren el selector de archivos o un `confirm()` cancelado, o avisos que aparecen en un toast fuera del área medida. Se excluyeron las acciones destructivas (eliminar, dar de baja, revocar, cerrar sesión) |
| Pruebas permanentes | `e2e/ui-sweep.spec.ts` (por rol y ancho; con `UI_SWEEP_FULL=1` recorre los 8 anchos), `e2e/ui-keyboard.spec.ts` (foco y teclado en capas) y `e2e/ui-failures.spec.ts` (estados de la UI ante fallas forzadas del servidor) |

## 2. Resultado del barrido

Con los arreglos, en los 4 roles, 21 páginas públicas y 8 anchos (32 pruebas en verde):
- sin scroll horizontal;
- sin controles fuera de pantalla ni tapados;
- sin cargas que no terminan;
- sin errores de consola ni respuestas 5xx;
- axe WCAG 2.2 A/AA sin violaciones serias o críticas en las fichas y en el entrenamiento;
- coma decimal aceptada en todos los campos numéricos revisados.

## 3. Defectos de interfaz

| ID | Gravedad | Defecto | Estado |
| --- | --- | --- | --- |
| UI-01 | P2 | Un QR de sede vencido o una invitación inválida quedaban en «Cargando tu sede…» para siempre, sin ningún botón | Corregido: «No pudimos abrir…» con «Reintentar» e «Ir a ingresar» |
| UI-02 | P2 | En el teléfono, una invitación inválida mostraba primero la guía «Agregá REPI a tu pantalla de inicio», y volvía a aparecer | Corregido |
| MOD-01 | P3 | Al quitar el elemento enfocado (p. ej. «Quitar día»), el modal ignoraba Esc y Tab con el diálogo abierto (prueba intermitente también en `main`) | Corregido; la prueba fuerza la pérdida de foco y falla siempre contra `main` |
| IMP-12 | P3 | En la revisión de una importación, la pregunta «¿Es Pirámide?» quedaba en una fila plegada marcada «Listo» | Corregido: cuenta «para revisar» y la fila se abre |
| UI-03 | P3 | Campos táctiles con menos de 16 px, que hacen zoom en iOS al enfocarlos («Semanas», selector de sede, «Vigente hasta», horario de silencio, «Dónde se publica») | Corregido sólo en pantallas táctiles (`--touch-fs`) |
| UI-04 | P3 | Modal con un campo en `autoFocus`: al cerrar, el foco caía en `<body>` | Corregido (`Modal` y `Sheet`) |
| UI-05 | P3 | El QR de ingreso a pantalla completa no tomaba el foco, no cerraba con Esc y Tab recorría la página de atrás | Corregido |
| UI-06 | P3 | Trofeo desbloqueado: Tab salía del diálogo y el foco se perdía al cerrar | Corregido |
| UI-07 | P3 | Guía de la demo: el foco caía en `<body>` al cerrarla | Corregido |
| UI-08 | P3 | «Ahora no» a una reseña confirmaba aunque el servidor fallara | Corregido |
| UI-09 | P3 | La píldora de la demo tapaba la última fila en Coach y Gym en el teléfono | Corregido |
| UI-10 | P3 | `/instalar/cartel` con 26 px de scroll lateral en tableta vertical | Corregido |
| UI-11 | P3 | Áreas táctiles de 17 a 22 px (ordenar clientes, nombres en Cobros, marcas del período) | Corregido sin cambiar el diseño |
| UI-12 | P3 | Enlaces de texto de 17 px en `/acceso` y en el pie del sitio | No se cambia: cumplen WCAG 2.5.8 por espaciado (axe pasa) y agrandarlos altera el diseño de Acceso |
| UI-13 | P3 | «Videos de ejercicios» no tiene `h1`; el nombre del socio en la ficha no es un encabezado | Abierto: cambiarlo altera la tipografía; decisión de diseño |
| UI-14 | P3 | Entrenamiento en tableta apaisada (1024×768): el dock ocupa ~52 % de la altura | Abierto: decisión de diseño; los controles se alcanzan desplazando |

Otros estados de interfaz corregidos por otras áreas: «Guardado en tu cuenta» sin guardar (MEM-02), «Peso inválido» con decimales (MEM-01), una edición perdida al cambiar de programa (STF-03) y el push que no se podía activar desde «Avisos» (COM-06).

## 4. Estados ante fallas (`ui-failures.spec.ts`)

| Flujo | 500 forzado | Doble toque | Tras recargar |
| --- | --- | --- | --- |
| Coach › Agenda › Agendar | El modal sigue abierto con `role=alert`, sin toast de éxito | 1 solo POST | Persiste; Esc cierra y devuelve el foco a «Agendar» |
| Gym › Vigencia de la membresía | Sin mensaje de éxito; el valor y «Guardar» siguen | — | Persiste tras un reintento exitoso |
| Mi cuenta › Apariencia | Se aplica en el dispositivo y no dice «Guardado en tu cuenta» | — | — |
| «Ahora no» a una reseña | Muestra el error, no el éxito (UI-08) | — | — |

## 5. Sin verificar

- Safari, iPhone, Android y Firefox reales; el zoom de iOS se infiere de la regla de 16 px.
- La zona segura real (notch) y el teclado virtual: Chromium no los emula.
- Los arrastres con alternativa de teclado (deslizador de fotos, medalla) sólo están cubiertos por specs existentes.
- La estabilidad visual (CLS) al navegar entre secciones, más allá de `motion-nav`.
- Admin y Ventas en la UI.
