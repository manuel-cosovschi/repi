# Continuidad de Codex para Claude — 27/10/2026

Estado: EN CURSO. No integrar hasta que este documento diga LISTO PARA INTEGRAR.

- Base: `e11684c` (main al comenzar, D102).
- Rama: `codex/continuidad-2026-10-27`.
- Checkout de Codex: `/Users/manuelcosovschi/Proyectos Locales/Repi-codex-continuidad`.
- Checkout principal de Claude: `/Users/manuelcosovschi/Proyectos Locales/Repi`.
- No modificar ni usar la copia congelada `~/Desktop/Repi`.
- Bloques que está trabajando Codex: concurrencia/permisos de agenda coach-alumno; exportación de datos propios y privacidad; regresiones y verificación de esos flujos.
- Codex no está desarrollando F-BL-05 ni F-PU-01. Continúan disponibles para Claude.
- Las pruebas usarán un PostgreSQL exclusivo en loopback puerto 55437, bases repi_test/repi_dev; no usar la base de pruebas de Claude ni producción.
- No hay migraciones o despliegues compartidos planeados para estos bloques. La integración se dejará como commits y bundle verificado, no copia de archivos sobre main.

Este documento se actualizará con commits, pruebas, limitaciones e instrucciones exactas de integración al terminar.
