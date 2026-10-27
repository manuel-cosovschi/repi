# REPI — Contrato de diseño (Concepto 2 · Friendly Performance)

Identidad aprobada, no negociable. Este documento separa **diseño existente** (con fuente) de **extensión propuesta** (derivada de requisitos, no aprobada como pantalla).

## Referencias visuales

| Uso | Fuente (bajo `handoff/fuentes/extraido/repi-app-mobile-prototype/project/`) |
|---|---|
| Referencia maestra | `REPI_COMPLETE_DESIGN_HANDOFF/assets/brand-original/00_ORIGINAL/REPI_MARCA_APROBADA_REFERENCIA_MAESTRA.png` |
| Wordmark para UI | `assets/motion/wm_full.png` (blanco con alfa, sin punto) + punto `#00D1FF` como círculo |
| Isotipo | `assets/repi_icon.png` (162×162) |
| Acceso (auth/onboarding) | `REPI Acceso.dc.html` — canónico |
| Alumno | `REPI App Alumno v4.dc.html` — canónico desde este handoff |
| Coach / Gym / Admin | `REPI Desktop Coach.dc.html`, `REPI Desktop Gym.dc.html`, `REPI Admin.dc.html` |
| Motion | `REPI Motion Intro.dc.html` (1a "El punto") |

Copias usadas por la app: `apps/web/public/brand/` (copiadas byte a byte; ver `scripts/copy-brand-assets.sh`).

## Reglas de logo

- Wordmark = PNG `wm_full.png` + punto circular `#00D1FF`. Proporción del prototipo Acceso: caja 83×40,6 px, punto 8,4 px en (73,8; 0,64); variante móvil 62×30, punto 6,2 px en (54,6; 0,47). Escalado proporcional, nunca redibujar ni escribir "repi" con fuente.
- No hay vector verificado (DEC-01). Favicon/PWA se generarán desde `repi_icon.png`.

## Tokens

Fuente única: `packages/domain/src/tokens.ts` (contiene todo `design-tokens.json`, no sólo `tokens.css`). Se genera `apps/web/src/styles/tokens.css`.

Tokens de Acceso agregados desde el prototipo (existentes en `REPI Acceso.dc.html`, ausentes del JSON):

| Token | Valor | Uso en Acceso |
|---|---|---|
| `--access-page` | `#0E141B` | Fondo de página |
| `--access-glow` | `#13263a` | Radial superior |
| `--dark-err` | `#FCA5A5` | Error en oscuro |
| `--light-err` | `#B42318` | Error en claro |
| `--light-note-bg` | `#F3F5F8` | Nota en claro |
| `--dark-note-ink` | `#CBD5E1` | Nota en oscuro |

## Acceso: qué se conserva y qué cambia

Se conserva: composición (panel de marca navy 42 % + formulario máx. 420 px en desktop; formulario a pantalla completa en móvil con wordmark arriba), tipografía de cuerpo (sub 15; labels 13/600; el h1 pasó a Barlow Condensed por la selección G, ver abajo), radios (inputs 12, tarjetas 16, CTA 14 con 54 px), CTA cian con texto `#0B0F14` (DEC-03), chips pill 38 px, toggles 46×28, checks 22×22, paso en JetBrains Mono 11, toast claro con punto cian, transición de paso 240 ms `cubic-bezier(.05,.7,.1,1)` deshabilitada con reduced-motion.

Cambia por requisito (con fuente):
- **Carcasa de teléfono y selector Móvil/Desktop y menú lateral de flujos**: son herramientas del prototipo. La app usa el viewport real: <768 px → layout móvil oscuro; ≥768 px → layout desktop claro con panel de marca (master §5 Responsive). Breakpoint propuesto: 900 px para mostrar el panel de marca (extensión propuesta; el prototipo sólo tenía 414 y 1100).
- **Switch y checkbox como `div`**: pasan a `<button role="switch">` y `<input type="checkbox">` reales (auditoría C23).
- **CTA "deshabilitado" con opacidad .45 pero clicable**: se mantiene la apariencia y el clic muestra el error de validación (comportamiento del prototipo), con `aria-describedby` al error.
- **Notas "Prototipo: …"** y botones "simular": se eliminan; los flujos son reales.
- **Toggle "Medidas corporales" del gym**: deshabilitado (D06).
- **Precio "ARS 700"**: retirado por el anexo del 26/10 (D58). Coach y gym piden contacto comercial.
- **Google/Apple**: "No disponible en este entorno" sin credenciales (D20).

Extensiones propuestas (sin pantalla previa): enrolamiento de 2FA (QR + códigos de respaldo), aprobación del adulto responsable (página del enlace), panel mínimo de recepción para pedidos de socio, mailbox DEV. Usan los mismos componentes.

## Selección visual aprobada · G · Atlética (26/10/2026)

Fuente: `REPI_SELECCION_VISUAL.md` (confirmación del usuario) y el preset G del comparador `documentacion/propuestas-visuales/2026-10-26/`. Se aplicó sobre la app existente: no se copió la demo.

| Elemento | Implementado | Dónde |
|---|---|---|
| Títulos destacados | Barlow Condensed 700, mayúsculas visuales (el texto del DOM no cambia). Móvil 38/1,02 −0,015 em (34 px bajo 360 px); escritorio 34; Acceso 36; héroe de próximo entrenamiento 36; nombre del día 30 | `.mb h1`, `.co h1`, `.ac-head h1`, `.today-txt strong`, `.dayname`, `.ac-brand-claim strong`, utilidad `.display` |
| Cuerpo e interfaz | Barlow 400/500/600/700. Números tabulares en todo el `body` | `--font-ui` (tokens), `next/font/google` autoalojado |
| Dónde NO se condensa | Chats, formularios, tablas, instrucciones de ejercicio, etiquetas chicas, el editor del nombre del programa | — |
| Monoespaciada | JetBrains Mono se mantiene para códigos (invitación, OTP, 2FA), IDs y horarios | `--font-mono` |
| Íconos | Phosphor Bold (`@phosphor-icons/react` 2.1.10, MIT), siempre decorativos; el nombre accesible lo da el control | `components/ui/Ic.tsx` |
| Play y pausa | Phosphor `fill`: son glifos de reproducción dentro de un botón circular; la versión bold se lee como contorno | Inicio, Entrenar, descanso |
| Gráficos de datos | Los anillos de progreso y la curva de evolución siguen siendo SVG propios (no son íconos) | `Workout.tsx`, `Gym.tsx` |
| Barra móvil | Cápsula «Cristal flotante»: 62 px, a 14 px + safe area del borde, `rgba(26,36,51,.92)` con blur 22 px (fondo opaco `#1A2433` sin soporte de blur), borde `#F8FAFC26`, indicador interior `#F8FAFC20` que se desplaza en 160 ms. Rótulos sólo para lectores de pantalla. Botones ≥44 px. Degradé inferior para que el contenido no compita con la cápsula. Se conservan los destinos por rol (Gym sólo con relación de gym), badges y el perfil en el avatar | `.tabbar`, `.tab-ind`, `.tabfade` |
| Escritorio | Se conserva la navegación lateral de Coach, Gym y Admin (sin barra móvil); cambian tipografía e íconos | `coach.css` |
| Cambio de sección | Fundido 160 ms sólo del contenido; la barra y el logo no se animan; cada sección recupera su scroll; con movimiento reducido el cambio es inmediato | `.tab-pane`, `.co-content[data-section]` |

Paleta, logo (PNG + punto cian) e ícono de la app sin cambios. Las licencias OFL de Barlow y MIT de Phosphor están en `design/motion/assets/fonts/` y en `documentacion/propuestas-visuales/2026-10-26/licencias/`.

Interacciones M01–M05: especificación, implementación y verificación en `motion.md`.

