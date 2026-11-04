# Tema global Claro / Oscuro / Automático (D188, bloque 03/06)

La apariencia es **de la cuenta**, no del rol ni del gimnasio. Una persona que es coach y también socia de un gimnasio elige una vez y ve el mismo tema en Alumno, Coach, Gym, Admin y Mi cuenta, en todos sus dispositivos.

## Arquitectura

```
packages/domain/src/tokens.ts ── pnpm tokens ──▶ apps/web/src/styles/tokens.css
   color.*  (paletas primitivas fijas)               :root { --core-*, --dark-*, --light-*, … }   ← sitio público, carteles, informes
   theme.light / theme.dark (semánticos)              :root, .ui-light { --ui-* claro }
                                                      @media (prefers-color-scheme: dark) :root:not([data-theme=light]) { --ui-* oscuro }
                                                      :root[data-theme=dark], .ui-dark { --ui-* oscuro }
```

- **Una sola fuente:** `tokens.ts`. `tokens.css` se genera (`pnpm --filter @repi/web tokens`); no se edita a mano.
- **Tres niveles:**
  1. Primitivos: `--core-*`, `--dark-*`, `--light-*`, `--semantic-*`, `--access-*`. Son paletas fijas y no cambian con el tema.
  2. Semánticos `--ui-*`: page, surface, text, muted, border, primary, link, focus, estados, chips, overlay y sombras.
  3. De componente `--ui-*`: sidebar, tabbar, hero, chart, stripe, input, media y statusbar.
- **Consumidores:** los estilos con tema (`member.css`, `coach.css`, `gym.css`, `method-editor.css`, `access.css` y `globals.css`) y los componentes usan **sólo** `var(--ui-*)`. Lo controla la guarda `tests/theme/theme-tokens.check.ts`. Las excepciones se marcan `theme-fixed` con su motivo: metales de la medalla, máscaras, QR sobre blanco, escenas de marca, píldora de la demo y aviso de versión.
- **Zonas de tema fijo:**
  - `.ui-dark`: barra lateral y barra superior de Coach, Gym y Admin; panel de marca de Acceso; tarjeta del día, tarjeta de nivel, desbloqueo de trofeo e intro de marca. Son navy en ambos temas.
  - `.ui-light`: disponible para superficies que deban ser claras siempre.
- **Diseño propio, sin tema:** sitio público y legales, pantallas de recepción (`/ingreso/pantalla`, `/ranking/pantalla`), cartel imprimible e informes. Ver `FIXED_THEME_PATH` en `lib/theme.ts`.

## Primer render, sin destello

1. `THEME_BOOT` (`lib/theme-boot.ts`) es el primer `<script>` de `<head>`. Lee la copia local `repi:theme` y `prefers-color-scheme`, y fija `data-theme` (efectivo) y `data-theme-pref` (elegido) en `<html>` antes de pintar.
2. Sin JavaScript o sin copia local, el CSS sigue a `prefers-color-scheme`, es decir, Automático.
3. `<html suppressHydrationWarning>` sólo afecta a ese elemento: React no compara los atributos que puso el script.
4. `ThemeRuntime`, en el layout raíz, no tiene estado de React. Aplica el tema, sigue los cambios del sistema en Automático, escucha otras pestañas y sincroniza con la cuenta en los espacios con sesión. Cambiar el tema no renderiza de nuevo la app, así que no se reinician temporizadores, series ni formularios.
5. Barra del navegador:
   - `viewport.themeColor` tiene una variante clara y una oscura por `media`; `ThemeRuntime` la ajusta cuando hay una elección explícita.
   - Con la app instalada en iPhone, la barra de estado sigue `black-translucent` (D121/D122 intactos). En Claro va una franja navy de la altura de la zona segura detrás de la hora.

## Preferencia y sincronización

| Dónde | Qué guarda |
|---|---|
| `user_pref.theme` | `light`, `dark` o `system` (`not null default 'system'`, check `user_pref_theme_valid`) |
| `user_pref.theme_changed_at` | Momento del cambio en el dispositivo, para «gana el último» |
| `localStorage` `repi:theme` | `{ pref, at, pending, uid }`: aplicación inmediata y cambios sin conexión |

- **API:** la misma de siempre, `GET/POST /api/me/settings`.
  - El usuario sale de la sesión. El cuerpo es `strict`: un `userId` u otro campo se rechaza con 400. Sin sesión responde 401.
  - El servidor guarda el cambio sólo si es más nuevo que el guardado y limita relojes adelantados a ahora + 1 min (`acceptThemeChange`). Si dos pedidos llegan a la vez, el viejo no pisa al nuevo (`setWhere`).
- **Reglas del cliente (`reconcileTheme`, puras y probadas):**
  - Sin cambio pendiente: manda la cuenta, así que otro dispositivo pudo cambiarla.
  - Pendiente de esta cuenta: se envía si es más nuevo que el de la cuenta.
  - Pendiente de otra cuenta: se descarta.
- **Sin conexión:** el cambio se aplica al instante y queda `pending`. Se envía al volver la conexión (`online`) o en la próxima apertura. No hay una cola nueva.
- **Cerrar sesión:** `clearPrivateDeviceData` llama a `forgetThemeOwner`. El aspecto queda, para que no haya destello, pero sin dueño ni pendiente, así que nunca se envía a otra cuenta. Al entrar otra cuenta prevalece la suya.
- **Mensajes:** el selector informa «Guardado en tu cuenta» recién cuando el servidor lo confirmó. Si no, muestra «Guardado en este dispositivo…» o el error.

## Política de transición

- El valor por defecto es **Automático**, como pidió el titular. Las cuentas existentes reciben `system` (default de la columna, sin backfill).
- Quien hoy usa el alumno con el teléfono en modo claro lo va a ver claro. Por eso cada pantalla se auditó en ambos temas antes de cambiar el valor por defecto. La matriz E2E `e2e/theme-visual.spec.ts` cubre Claro, Oscuro y Automático con el dispositivo claro y oscuro, en anchos de 320 a 1366 y con los roles Alumno, Coach, Dueño y Piso. Admin se cubre en `e2e/theme-admin.spec.ts`, con un Admin de prueba local creado por el flujo legítimo: registro, email verificado, dos pasos y ticket de `scripts/first-admin.ts`. Se corre con `E2E_ADMIN_STATE`.
- Si hiciera falta volver atrás sin tocar datos, se puede cambiar el default del script a `dark` en el cliente, porque `system` sigue siendo un valor válido.

## Logo

El wordmark aprobado es blanco con alfa (`07_DESIGN_SYSTEM`: «logotipo repi blanco»). No se recolorea: en Claro va sobre una placa navy pintada con `box-shadow`, para no mover el layout. En zonas oscuras no hace falta.

## Accesibilidad

- Los contrastes de cada par de tokens se prueban en `packages/domain/src/theme.test.ts`:
  - Texto ≥ 4,5:1 en page, surface, surface-2 y raised.
  - `accent`, `control-border` y `focus` ≥ 3:1.
  - Texto sobre primaria, selección, inverso, barra lateral y chips ≥ 4,5:1.
- El cian `#00D1FF` queda como relleno de CTA con texto navy, no como texto sobre crema. Como texto se usan `--ui-link`: `#006F8E` en Claro y cian en Oscuro.
- Los enlaces dentro de un texto van subrayados, no sólo coloreados (WCAG 1.4.1).
- El selector usa radios nativos dentro de un `fieldset`. Funciona con flechas, lector de pantalla y táctil. Marca la opción elegida con tilde además del color.

## Rendimiento

No hay dependencias nuevas. El tema son atributos en `<html>` y propiedades CSS. El CSS crece unos 9 KB sin comprimir (dos juegos de `--ui-*`). La única suscripción de React es la del selector.

## Para pantallas nuevas (Training Intelligence 2.0, Body Intelligence)

Usar `--ui-*`. Por ejemplo, superficies `surface`/`surface-2`, estados `chip-*` y `*-text`, gráficos `chart-*`/`accent`/`accent-2` y héroes `hero-*` con `.ui-dark`. Así adoptan el tema sin código propio. La guarda falla si aparece un color fijo.
