# Pruebas E2E y regresión — Auditoría QA 29/10/2026

Este archivo consolida E2E_TEST_REPORT y REGRESSION_REPORT.

## 1. Infraestructura E2E (nueva)

- **Herramientas:** Playwright 1.64 con el Chrome instalado (`channel: "chrome"`; no descarga navegadores) y @axe-core/playwright 4.11.
- **Archivos:** `apps/web/playwright.config.ts` y `apps/web/e2e/{helpers,public.spec,member-workout.spec,roles.spec}.ts`.
- **Destino:** sólo un servidor local. `assertLocalTarget` rechaza cualquier host que no sea localhost, 127.0.0.1 o [::1].
- **Entorno:** build de producción (`pnpm build && pnpm start`) con la base `repi_dev`.
- **Datos:**
  - Cada prueba crea su propia demo (`POST /api/demo`): organización `is_demo`, correos `.invalid`, se borra a las 6 h.
  - Nunca toca datos reales.
  - Cada demo simula otra IP (`x-forwarded-for`, que sólo vale en local) para no chocar con el límite de 6 demos por hora.
- **Proyectos:** `mobile` (Pixel 7, 412×915, táctil) y `desktop` (1366×860). Locale `es-AR`, zona `America/Argentina/Buenos_Aires`, movimiento reducido.
- **Comprobaciones comunes:**
  - Sin errores de consola, sin `pageerror` y sin respuestas 5xx (`watchErrors`).
  - Sin scroll horizontal (`expectNoHorizontalOverflow`).
  - axe WCAG 2.2 A/AA sin violaciones serias ni críticas (`expectAccessible`).
- **Uso:**

```bash
cd apps/web && pnpm build && pnpm start
```

```bash
cd apps/web && pnpm e2e
```

## 2. Resultado final (29/10/2026, 17:53 ART)

**34 de 34 pasaron.** 0 fallidas, 0 inestables, 0 omitidas. Duración: 117 s. Evidencia en `apps/web/e2e-results/results.json` (no se versiona).

| Proyecto | Archivo | Prueba | Estado |
|---|---|---|---|
| mobile y desktop | member-workout | Alumno entrena, registra una serie de 42,5 kg con doble toque, recarga: 1 registro en el servidor | ✓ ✓ |
| mobile y desktop | member-workout | Cada pestaña principal del alumno: sin errores, sin scroll lateral, axe | ✓ ✓ |
| mobile y desktop | public | 8 páginas públicas: 200, h1, sin errores, sin scroll lateral, axe | 16 ✓ |
| mobile y desktop | public | Enlaces internos del sitio responden por debajo de 400 | ✓ ✓ |
| mobile y desktop | public | APIs privadas sin sesión: 401/403/404 | ✓ ✓ |
| mobile y desktop | public | Manifiesto, íconos y SW (sin caché de `/api`) | ✓ ✓ |
| mobile y desktop | roles | Demo coach: todas las secciones del menú | ✓ ✓ |
| mobile y desktop | roles | Demo dueño: todas las secciones del menú | ✓ ✓ |
| mobile y desktop | roles | Demo profe de sala: todas las secciones del menú | ✓ ✓ |
| mobile y desktop | roles | Aislamiento: un alumno no lee la API ni la pantalla de otro coach o gym | ✓ ✓ |

## 3. Historial de corridas

| Corrida | Resultado | Qué se encontró o arregló |
|---|---|---|
| 1 | 19 ✓ / 15 ✗ | Contraste y subrayados (AXE-2/3/4), menú sin `aria-expanded` (AXE-1), tablist con botón (AXE-5). Fallas del arnés: check-in y tour tapando botones, animaciones a mitad de camino. |
| 2 | Parcial ✓ | Arreglos del arnés (saltar check-in, cerrar el tour con sessionStorage, esperar animaciones, movimiento reducido, abrir el menú sólo si está cerrado). |
| 3 | 33 ✓ / 1 ✗ | Dueño en móvil: `scrollable-region-focusable` en «Seguimiento de sala» (AXE-6). |
| 4 | **34 ✓** | Después de AXE-6 y del resto de los arreglos. |

## 4. Regresión completa (después de todos los arreglos)

| Suite | Comando | Resultado | Tipo |
|---|---|---|---|
| Web (integración, Postgres `repi_test`) | `cd apps/web && pnpm vitest run` | **43 archivos, 236 pruebas ✓** (antes de la auditoría: 221) | INT |
| Guardas de seguridad de tests | `pnpm test:guards` | **0 fallas** | UNIT |
| Dominio | `cd packages/domain && pnpm test` | **20 archivos, 146 pruebas ✓** | UNIT |
| Tipos | `pnpm exec tsc --noEmit` | sin errores | Estática |
| Build de producción | `pnpm build` | compila | Estática |
| E2E | `pnpm e2e` | **34/34 ✓** | E2E |
| Deriva de esquema | `drizzle-kit generate` | «No schema changes» | Estática |

**Pruebas nuevas de la auditoría:**
- `access` (SEC-1/5), `followup` (SEC-2), `sandbox` (SEC-3), `security-launch` (SEC-4).
- `lift-ranking` (SEC-6, DATA-6), `log` (SEC-7/11), `training` (DATA-1, DATA-2), `history-import` (DATA-3), `annex` (DATA-4).
- Dominio: `sync` (DATA-8).

**Después de la última corrida completa** se agregaron:
- confirmaciones en borrar post y comentario del club (UX-11);
- `UX-12/13/14`;
- el filtro DATA-6.

Sus suites afectadas (`lift-ranking`, `followup`) y `tsc` volvieron a pasar. El E2E final (corrida 4) ya incluía UX-12/13/14 y DATA-6; las confirmaciones del club se agregaron después y sólo pasaron `tsc`.

## 5. No cubierto por E2E (honesto)

- **Admin REPI:** sin recorrido de UI (no hay demo de admin y Claude no usa credenciales reales). Cubierto por INT.
- **Flujos con correo real:** invitación → enlace → alta, y OTP. Cubiertos por INT con el buzón local `devMailbox`.
- **Cámara, QR físico, notificaciones push reales, instalación de la PWA y modo avión en un teléfono:** requieren dispositivo físico (LB-03).
- **Offline real en el navegador** (cortar la red a mitad de un entrenamiento): cubierto por INT y revisión de código, no por E2E.
- **Hojas, modales y formularios llenos:** el recorrido abre secciones, no cada diálogo; axe no los midió todos.
