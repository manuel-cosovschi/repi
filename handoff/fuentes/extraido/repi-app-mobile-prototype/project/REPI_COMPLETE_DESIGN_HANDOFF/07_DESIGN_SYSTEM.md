# 07 · Sistema de diseño

Fuente canónica: `assets/brand-original/00_ORIGINAL/REPI_MARCA_APROBADA_REFERENCIA_MAESTRA.png` y recortes en `assets/brand-original/01_MARCA`, `02_ENTRENADOR`, `03_ALUMNO`. Tokens legibles por máquina: `design-tokens.json` y `design-tokens/tokens.css`.

## Marca
- **Wordmark** `repi`: `assets/logos/repi_wordmark_original_crop.png` (recorte original sobre fondo navy). Capas para animación en `assets/logos/layers/` (blanco con alfa: wordmark completo sin punto, r, e, p, tallo de la i). El punto es un círculo `#00D1FF` de diámetro 20,3/200 del ancho del wordmark, posición x=177,9 y=1,55 (en caja 200×97,8).
- **Isotipo / app icon**: `assets/icons/repi_app_icon_original_crop.png` (162×162). Capas: `icon_tile_empty.png` (fondo del ícono sin la r) e `icon_r_white_alpha.png`. Punto del ícono: círculo 20px en x=61,1 y=24,8 de un ícono de 120px.
- **No existe vector verificado.** No se entregan SVG de logo: los SVG del kit anterior fueron rechazados por el usuario. Generar favicon/PWA (16, 32, 180, 192, 512, máscara) desde el PNG original o un vector trazado y aprobado.
- **Tipografía:** Inter Tight (UI) — no incluida (licencia OFL, obtener de Google Fonts o self-host). JetBrains Mono para etiquetas técnicas. El logo no es Inter Tight.

## Dualidad
- **Alumno — Performance Dark:** fondo #0B0F14, tarjetas #1A2433/#131C28, borde #2D3B4F, texto #F8FAFC/#94A3B8, CTA cian 48–56 px con texto oscuro, tab bar inferior 84 px, tarjeta clara (#F8FAFC) para el ejercicio activo.
- **Coach / gym / admin — Premium Light:** página #F3F5F8, tarjetas blancas borde #E2E8F0 radio 16, sidebar navy con ítem activo #1A2433, insignia cian, acento de texto #007EA0, chips semánticos (ver tokens).

## Componentes (como existen en los prototipos)
| Componente | Variantes / notas | Dónde |
|---|---|---|
| Botón primario | Cian, texto #0B0F14, 36–56 px de alto, radio 10–14 | Todos |
| Botón secundario | Blanco, borde #D5DCE5 (light) / transparente borde #2D3B4F (dark) | Todos |
| Botón oscuro | #0B0F14 texto #F8FAFC (acciones finales: completar, cerrar turno) | Desktop |
| Link-button | Texto #007EA0 600 13px | Desktop |
| Segmented control | Contenedor #E6EBF1 radio 12, opción activa blanca con borde | Desktop |
| Tabs subrayadas | Texto 600 14, línea inferior cian 2px | Desktop |
| Chip de estado | 22–24px, radio 6, pares bg/ink semánticos | Todos |
| Chip filtro (pill) | 34px radio 17, activo navy | Desktop |
| Toggle | 48×28 (móvil) / 44×26 (desktop), cian on / #2D3B4F off | Todos |
| Checkbox | 22×22 radio 6, check oscuro sobre cian | Todos |
| Radio card | Borde 1,5px cian + fondo #E6F9FE seleccionado | Desktop |
| Input / textarea | 40–48px, borde #D5DCE5 radio 10; dark: #0B0F14 borde #2D3B4F | Todos |
| Stepper | Botones 44×44 ± con valor central (peso/reps) | Alumno |
| KPI card | Etiqueta 13 muted, valor 24–28/600, sub 12 | Desktop |
| Tabla responsiva | Grid con encabezado; < ancho mínimo → scroll horizontal; o filas flex-wrap | Desktop |
| Split view | Lista 280–360 + detalle flexible, envuelve en mobile | Coach, gym |
| Sidebar | Full 248 / rail 72 / drawer <768; switcher de espacio arriba | Desktop |
| Tab bar móvil | 5 ítems con ícono 24, activo cian | Alumno |
| Bottom sheet | Radio 24 superior, handle 40×4 | Alumno |
| Modal | Máx 520/760 px, radio 18, Esc y clic de fondo cierran | Desktop |
| Toast | Navy, punto cian, abajo-derecha (desktop) / arriba (móvil) | Todos |
| Gráficos | Barras (flex), línea SVG con área degradada, sparkline, anillo de progreso, embudo | Todos |
| Tarjeta de serie / tabla de series | Fila 44px, check circular, fila activa #E0F7FE | Alumno |
| Anillo de descanso | SVG 72px, trazo 4px, centro botón pausa | Alumno |
| Visor 3D | Contenedor 380px, controles +/−/reset, vistas, capas, chips de región, etiqueta de modo | Alumno |
| Sticker de logro | Aro conic cian→turquesa, isotipo r + punto | Alumno |
| Tarjeta de bloqueo por privacidad | Candado + explicación + "Pedir acceso" | Coach, gym |
| Placeholders de imagen | Rayado diagonal con etiqueta mono (foto atleta, video demostración) | Todos |

## Iconografía
Íconos inline SVG de trazo 1,8 (estilo Lucide). Recomendado en producción: Lucide. Paths en el JS de cada prototipo (`IC = {...}`).

## Accesibilidad aplicada
focus-visible cian, Esc en modales, aria-current en nav, role switch/checkbox/tab, aria-label en botones de ícono, objetivos táctiles ≥44 px en móvil, regla global reduced-motion. Pendiente: trap de foco, live regions, auditoría WCAG 2.2 completa.
