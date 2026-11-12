# 08 — Verificación en producción

Auditoría FSA1, 09/11/2026. En producción sólo hubo lecturas y demos guiadas (organizaciones `is_demo`, ficticias, que se borran a las 6 h). Ningún dato real se modificó.

## 1. Publicación

| Paso | Resultado |
| --- | --- |
| PR | #88 (`claude/full-system-audit-1`) |
| CI sobre el último commit (`60050e6`) | `check` (typecheck, guardas, integración, build) y autoprueba del respaldo, en verde |
| Respaldo previo | `backup-20261109-054319-42568711678`, verde (issue #89): descifrado, hashes, restauración descartable y claves foráneas sin huérfanos |
| Migraciones | **Ninguna** |
| Merge | squash `210bf9e` (05:49 UTC) |
| Despliegue | `/api/version` = `210bf9e8af02` a las 05:53:11 UTC |
| Rollback disponible | Vercel → el despliegue anterior `72aa71936d73` (sólo código, sin migraciones que revertir) |

## 2. Smoke productivo (`scratchpad/prod-smoke-fsa1.cjs`, Chromium, Pixel 7 y escritorio)

Antes de publicar, el mismo script se corrió contra la build de `main` (local). Falló exactamente en lo corregido: UI-01, MEM-01, SEC-05 y STF-01. Esa corrida es la prueba de que el script detecta los defectos.

En producción, sobre `210bf9e8af02`, **25/25 OK**:

| Verificación | Resultado |
| --- | --- |
| Versión desplegada | `210bf9e8af02` |
| `/`, `/conoce`, `/acceso`, `/ayuda` | 200 |
| UI-01 | `/unirse/<inexistente>` muestra «No pudimos abrir…» con «Reintentar» (antes quedaba cargando) |
| Sin sesión | `/api/me/training` → 401; `/api/admin/clients` → 401 |
| MEM-01 (alumno demo) | El peso «64,1» se acepta; no aparece «Peso inválido» |
| Registro | La serie 1 queda registrada y sincronizada («Guardado en tu cuenta») |
| SEC-05 | «Descargar mis datos» → 200 con 29 secciones, incluidas las rutinas propias |
| Admin | Un socio contra `/api/admin/clients` → 404 |
| STF-01 (dueño demo) | La ficha del socio llega sin series ni notas (`seesTraining=false`, `log=0`) |
| Sala demo de la sede | Ve el entrenamiento de los socios que lo comparten (`seesTraining=true`) |
| Errores | Ni errores de página ni respuestas 5xx en los tres recorridos |

## 3. Salud después de publicar

| Qué | Resultado |
| --- | --- |
| Errores de ejecución en Vercel desde las 05:50 UTC | Ninguno |
| Cron `repi-notifications` | 200 |
| Huella de los datos reales (16 tablas, a las 05:54 UTC) | **Idéntica a la tomada antes de la auditoría (03:13 UTC)**. Usuarios 59, organizaciones 5, sesiones 30, series 345, programas 44, versiones 72, asignaciones 32, relaciones de coach 8, socios 31, consentimientos 53, objetivos de TI 260, correcciones 0, equipamiento 0, fotos 0, peso corporal 1, rutinas propias 6. Mismo conteo y mismo hash en cada tabla |

## 4. No verificado en producción

- **Ingreso con 2FA (SEC-01) con una cuenta real:** no se usaron cuentas reales. Está cubierto por dos pruebas de integración y por Playwright en una build de producción local.
- **El cambio de `auth.ts` no toca el ingreso con contraseña:** las demos (que abren sesión por `/api/demo`) y la suite E2E completa siguen funcionando. Ver 09 §4.
- **Push real y email real:** ver 09 §4.
- **Admin y Ventas en la UI:** no hay demo; se verificaron por API y e2e en build propia.
