# REPI — Informe maestro de QA (29/10/2026)

- **Rama:** `qa/auditoria-2026-10-29`, desde `main` en b9fdff7 (D150).
- **Punto de recuperación:** `main` sin tocar. Nada de esta auditoría está en producción hasta que el titular autorice el merge.
- **Migraciones:** **ninguna**.

## 1. Tablero

Actualizado el 29/10, 18:30. Cada fila sale de [BUG_REGISTER.md](BUG_REGISTER.md).

| | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| Encontrados (válidos) | 0 | 11 | 28 | 9 | **48** |
| Corregidos y verificados | 0 | 11 | 27 | 8 | **46** |
| Abiertos | — | 0 | 0 | 0 | **0** |
| Riesgo aceptado | — | — | 1 (SEC-9) | 1 (SEC-12) | 2 |
| Falsos positivos descartados | | | | | 1 (UX-3) |

**Por área:**

| Área | Encontrados | Corregidos | Pendientes |
|---|---|---|---|
| Seguridad | 12 | 10 | 2 aceptados |
| Datos | 11 | 11 | 0 |
| UX (incluye QR-1) | 14 | 14 | 0 |
| Accesibilidad | 11 | 11 | 0 |

**Verificación de los 46 corregidos, por tipo de evidencia:**

| Evidencia | Cantidad |
|---|---|
| INT (Postgres real) | 15 |
| UNIT | 1 |
| E2E | 8 |
| Sólo revisión de código | 22 |

Los 22 de revisión de código son, sobre todo, confirmaciones de UI y CSS. Pasan `tsc`, build y E2E de las pantallas, pero ninguna prueba ejerce ese clic en particular.

**Pruebas:**
- 238 de integración: 17 nuevas o ampliadas.
- 146 del dominio.
- 36 E2E nuevas: 36/36.
- Guardas, tipos y build en verde.

## 2. Documentos

| Pedido | Dónde está |
|---|---|
| QA_MASTER_REPORT, DEMO_QA_REPORT, RELEASE_READINESS | este archivo (§4, §5) |
| BUG_REGISTER, FIXES_IMPLEMENTED | [BUG_REGISTER.md](BUG_REGISTER.md) |
| SECURITY_AUDIT, DATA_INTEGRITY_REPORT, API_CONTRACT_REPORT, DATABASE_AUDIT | [SECURITY_AND_DATA_AUDIT.md](SECURITY_AND_DATA_AUDIT.md) |
| UX_AUDIT, ACCESSIBILITY_AUDIT, RESPONSIVE_AUDIT, PWA_AUDIT, PERFORMANCE_REPORT | [UX_A11Y_PERF_AUDIT.md](UX_A11Y_PERF_AUDIT.md) |
| FUNCTIONAL_INVENTORY, USER_FLOW_MATRIX, trazabilidad | [INVENTORY_AND_FLOWS.md](INVENTORY_AND_FLOWS.md) |
| E2E_TEST_REPORT, REGRESSION_REPORT | [E2E_TEST_REPORT.md](E2E_TEST_REPORT.md) |

## 3. Método y tipos de evidencia

1. **Inventario:** 22 páginas, 100 rutas de API y 18 módulos de servidor. Línea base: 221 pruebas de integración en verde en `main`.
2. **Revisión en paralelo:** tres agentes de sólo lectura (seguridad, datos y UX/a11y), sin tocar archivos. Cada hallazgo se verificó a mano contra el código. Uno se descartó (UX-3).
3. **E2E nuevo:** Playwright + axe, móvil y escritorio, contra la build local con demos aisladas.
4. **Arreglos por prioridad:** P1, después P2, después P3. Cada arreglo de servidor lleva una prueba de integración.
5. **Regresión completa y E2E final.**

**Tipos de evidencia usados:**

| Código | Significado |
|---|---|
| UNIT | Prueba unitaria, sin base |
| INT | Integración con Postgres real (base descartable `repi_test`) |
| E2E | Chrome real, build de producción local, backend real local (`repi_dev`) |
| EMU | Emulación de teléfono y red (rendimiento, tamaños) |
| CODE | Revisión de código, `tsc` y build |
| FIS | Dispositivo físico: **no hubo** en esta auditoría |
| NT | No probado |

**No se hizo** (por las reglas del encargo): migraciones o cambios en producción, correos reales desde demos, pagos, borrado de usuarios ni despliegue.

## 4. Validación de la demo (DEMO_QA_REPORT)

- **Demos validadas (E2E):** alumno, coach, dueño y profe de sala. Abren desde `POST /api/demo`, en entorno propio `is_demo`.
- **Recorrido:**
  - Las cuatro abren y recorren todas sus secciones sin errores de consola, sin 5xx, sin scroll lateral y sin violaciones serias de accesibilidad, en móvil y escritorio.
  - El alumno entrena y registra series reales en su demo.
- **Arreglo de esta auditoría:** una demo ya no envía invitaciones a correos reales; quedan en el buzón local (SEC-3).
- **Guía de la demo:** se abre sola. Las pruebas la cierran. Su contenido no se auditó paso a paso.

## 5. Preparación para lanzar (RELEASE_READINESS)

**Veredicto: lista para publicar.** No quedan defectos abiertos, sólo los 2 riesgos aceptados. Todas las suites están en verde y no hay migraciones.

**Para publicarla:**
1. Revisar y mergear `qa/auditoria-2026-10-29` en `main`. Esto despliega a producción en Vercel. **Requiere autorización del titular.**
2. Sin migraciones: no hay que tocar Supabase.
3. Después del deploy, verificar `curl https://repiclub.com/api/version`, `/acceso` y una demo.

**Comportamientos que cambian para usuarios reales:**
- Los correos de invitación ahora llevan `&p=` en el enlace. Las invitaciones enviadas antes del deploy funcionan, pero el alta pide el código del correo (OTP) en lugar de verificarse sola.
- `POST /api/auth/sign-up/email` responde 404 y el OTP ya no crea cuentas. Las altas siguen por `/acceso`.
- Un coach con la relación terminada deja de ver dolores, check-ins, salud y videos de ese ex cliente.
- Las menores sin consentimiento del adulto desaparecen del ranking del club y de la TV.
- Más de 200 repeticiones en una serie común se rechaza.
- Las series por tiempo ya no suman volumen ni 1RM: los totales de volumen pueden bajar respecto de lo que se veía.
- El QR de la sede lleva directo a «Pedí tu acceso» (D152); la guía de agregar a inicio aparece después.
- Sólo `main` despliega en Vercel: las ramas ya no generan previews, que fallaban por falta de variables.

**Pendientes:** ninguno de la auditoría. Fuera de ella siguen dos:
- activar el 2FA de admin (SEC-9, D119);
- probar en teléfonos reales (LB-03).

**Siguen los bloqueantes externos del titular:** `docs/LAUNCH_BLOCKERS.md` (LB-02 a LB-06).
