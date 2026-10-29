# REPI — Informe maestro de QA (29/10/2026)

- **Rama:** `qa/auditoria-2026-10-29`, desde `main` en b9fdff7 (D150).
- **Punto de recuperación:** `main` sin tocar. Nada de esta auditoría está en producción hasta que el titular autorice el merge.
- **Migraciones:** **ninguna**.

## 1. Tablero

| | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| Encontrados (válidos) | 0 | 10 | 28 | 9 | **47** |
| Corregidos y verificados | 0 | 10 | 25 | 5 | **40** |
| Corregidos en parte | — | — | 1 (DATA-6) | — | 1 |
| Abiertos | — | — | 1 (DATA-5) | 3 (DATA-10, DATA-11, A11Y-5) | 4 |
| Riesgo aceptado | — | — | 1 (SEC-9) | 1 (SEC-12) | 2 |
| Falsos positivos descartados | | | | | 1 (UX-3) |

Cada fila del tablero sale de [BUG_REGISTER.md](BUG_REGISTER.md).

**Por área:**

| Área | Encontrados | Corregidos | Pendientes |
|---|---|---|---|
| Seguridad | 12 | 10 | 2 aceptados |
| Datos | 11 | 7 | 1 parcial + 3 abiertos |
| UX | 13 | 13 | 0 |
| Accesibilidad | 11 | 10 | 1 abierto |

**Verificación de los 40 corregidos, por tipo de evidencia:**

| Evidencia | Cantidad |
|---|---|
| INT (Postgres real) | 12 |
| UNIT | 1 |
| E2E | 7 |
| Sólo revisión de código | 20 |

Los 20 de revisión de código son, sobre todo, confirmaciones de UI y CSS. Pasan `tsc` y build, pero ninguna prueba los ejerce directamente.

**Pruebas:**
- 236 de integración: 15 nuevas o ampliadas.
- 146 del dominio.
- 34 E2E nuevas: 34/34.
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

**Veredicto: candidata a release.** Sin P0 ni P1 abiertos. Todas las suites están en verde y no hay migraciones.

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

**Pendientes recomendados**, en orden. Ninguno bloquea:
1. DATA-6 completo: series por tiempo fuera de volumen, PR e informe.
2. DATA-5: «Aplicar ahora» por ID de día, no por posición.
3. DATA-10: paginar socios.
4. DATA-11: tres carreras menores.
5. A11Y-5: bloquear el scroll del fondo con hojas abiertas.
6. Activar 2FA de admin (SEC-9, D119).
7. Pruebas en teléfonos reales (LB-03).

**Siguen los bloqueantes externos del titular:** `docs/LAUNCH_BLOCKERS.md` (LB-02 a LB-06).
