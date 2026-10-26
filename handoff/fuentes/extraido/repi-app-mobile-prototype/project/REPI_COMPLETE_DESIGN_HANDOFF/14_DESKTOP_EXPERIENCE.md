# 14 · Cobertura desktop

| Rol | Prototipo desktop | Estado |
|---|---|---|
| Coach independiente | Desktop Coach (5 secciones + 8 pestañas) | Completo para MVP salvo alta/onboarding/calendario |
| Entrenador de sala | Desktop Gym (5) | Completo |
| Gerente | Desktop Gym (10) | Completo |
| Dueño / multi-sede | Desktop Gym (7) | Completo (ingresos gym→socio retirados) |
| Coordinador | — | Usa vistas de gerente (no diseñado) |
| Recepción | — | No diseñado |
| REPI Admin | Admin (5) | Completo para suscripciones; faltan flags/soporte/salud |

## Responsive real implementado
- Sidebar por ancho del contenedor (ResizeObserver): ≥1100 completa, 768–1099 rail de íconos, <768 drawer con top bar.
- Grillas `auto-fit/minmax`, split views que envuelven, filas de tabla flex-wrap; tablas anchas (admin, pagos coach, turnos) con scroll horizontal.
- Mouse: hover en filas y tarjetas. Teclado: focus-visible, Esc cierra modales/popovers, roles ARIA en tabs/switch/checkbox. Touch: objetivos ≥36 desktop / ≥44 móvil.
- **No verificado visualmente** en todos los anchos (375/390/430/768/1024/1280/1440/1920) — ver GAP-22. Desktop en móvil reutiliza layout fluido, no pantallas específicas.
