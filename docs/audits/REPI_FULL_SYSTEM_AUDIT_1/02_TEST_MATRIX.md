# 02 — Matriz de pruebas

Auditoría FSA1, 09/11/2026.

**Ambientes:**
- **Aislado:** build de producción local (`next build && next start`) con PostgreSQL 16 descartable. Hubo una base por auditor (`repi_fsa_*`), una compartida para explorar `main` (`repi_audit`, puerto 3201) y una para la rama integrada (`repi_e2e_fsa`, puerto 3210).
- **Integración:** `repi_test` (vitest), serializado con `flock`.
- **Producción:** sólo lectura y demos (08).

**Navegador:** sólo Chromium. «Móvil» es Pixel 7 emulado.

## 1. Cómo se trabajó

- **Seis auditores en paralelo,** cada uno en su worktree: socio, seguridad, personal, interfaz, importación y comunicaciones. Infraestructura y producción las cubrió el coordinador.
- **Método por defecto:**
  1. Reproducir contra la build de `main`.
  2. Escribir una prueba que falle.
  3. Corregir lo mínimo.
  4. Ver la prueba en verde y correr las vecinas.
  5. Verificar en la UI cuando el defecto es visible.
- **Integración** en `claude/full-system-audit-1`, con cherry-pick de cada rama. Los duplicados se resolvieron así:
  - 2FA: se integró el arreglo de seguridad; la prueba del otro auditor se usó como verificación independiente.
  - Ficha del socio para la gestión: se integró la versión más estricta.
  - Pesos con decimales: se integró una sola implementación.
- **Regresión completa** sobre la rama integrada: dominio, web, guardas, typecheck, build y la suite E2E entera.

## 2. Matriz por área

| Área | Cómo se probó | Pruebas nuevas | Resultado del auditor |
| --- | --- | --- | --- |
| Socio y entrenamiento | E2E adversariales (respuesta perdida con `route.fetch` y abort, 500, corte de red, dos pestañas, almacenamiento bloqueado, topes, coma decimal), flujo de Inicio, integración de series tardías y cliente de IndexedDB | `member-sync-adversarial.spec.ts`, `member-home-flow.spec.ts`, `offline-keep-done-client.test.ts`, `member-late-sets.test.ts`, casos en `units.test.ts` y `commercial.test.ts` | Contra `main`: 4 de 10 fallan (MEM-01/02/03/05). Con los arreglos: 20/20. Vitest: 20 archivos, 184 ✓ |
| Seguridad y privacidad | Barrido de todas las rutas con `[orgId]` entre organizaciones; socio A contra socio B; 2FA por todos los caminos de ingreso; cierre de sesión; exportación; subidas con EXIF, firmas y tamaños; `.ics`; revisión de SQL, XSS, SSRF, CSRF, errores y secretos | `auth-second-factor.test.ts`, caso «entre organizaciones» de `api-auth-sweep.spec.ts`, casos FSA1 en `logout`, `privacy`, `training`, `access`, `denied`, `club-profile`, `community`, `followup` y `agenda.test.ts` | Vitest: 16 archivos, 141 ✓. Dominio: 1063 ✓. Barrido: 3/3 contra `main` y contra la rama. UI de 2FA y cierre de sesión: 2/2 |
| Coach, sala y gestión | Ciclo completo del coach; carreras (toma concurrente, guardado frente a inicio de sesión); permisos vigentes con la pantalla abierta; cambio de sede; fin de turno; revocaciones; métricas contra cifras sembradas | Bloques FSA1 en `gym.test.ts` y `coach-workflow.test.ts`; caso nuevo en `coach-workflow.spec.ts` | Vitest: 13 archivos, 149 ✓. E2E en build propia: 36 ✓ (1 intermitente por foco, que también falla en `main`) |
| Interfaz y móvil | Barrido por rol, sección y 8 anchos; explorador de controles (652 tocados); teclado en capas; fallas forzadas del servidor; axe; temas | `ui-sweep.spec.ts`, `ui-keyboard.spec.ts`, `ui-failures.spec.ts` | Contra `main`: 17 fallas que reproducen defectos. Con los arreglos: 32/32. Vecinas: 122 ✓ (10 fallan igual en `main` por entorno, 1 intermitente) |
| Importación, rutinas y progreso | IA simulada (inválida, de otro tipo, inventada, contradictoria, incompleta, lenta); idempotencia con respuesta perdida y recarga; tope concurrente; cifras de progreso contra la base; EXIF en JPEG con MPF y progresivos | Casos FSA1 en `program-import` (dominio y web), `personal-progress`, `history-import`, `image.test.ts` y `units.test.ts`; `own-routine-import.spec.ts`; pasos en `weight-edit.spec.ts` | Vitest: 21 archivos, 204 ✓. Dominio: 1067 ✓. E2E en build propia: 8/8 |
| Comunicaciones, IA y admin | Cadena completa de avisos (outbox, dedupe, reintento, revocación); email con proveedor simulado que falla; sin nadie en turno; moderación; auditoría de admin; 2FA de admin en la UI; privacidad y novedades de punta a punta; IA simulada | `twofa-bypass.test.ts`, casos FSA1 en `connect`, `annex` y `community` | Vitest: 25 archivos, 196 ✓. E2E en build propia: 9 ✓ |
| Infraestructura | Producción en sólo lectura: respaldos, cron, Storage, variables, advertencias, integridad y huella | `sandbox.test.ts` «FSA1», `storage-orphans.sql` | 07 |

## 3. Regresión completa de la rama integrada

| Suite | Resultado | Notas |
| --- | --- | --- |
| Dominio (`packages/domain`) | 54 archivos, **1068 ✓** | — |
| Web (vitest, `repi_test`) | 104 archivos, **788 ✓**, salida 0 | Repetido sobre el código final con la UI integrada. Antes salía con código 1 por 3 rechazos sin manejar en una prueba nueva (INF-04), ya corregida |
| Guardas (`test:guards`) | **26 ✓, 0 ✗** | — |
| Typecheck | ✓ | — |
| Build de producción | ✓ | — |
| E2E (Chromium, móvil y escritorio, rama integrada, base `repi_e2e_fsa` con `STORAGE_DIR`) | **288 ✓, 5 ✗, 47 omitidas** en la corrida completa aislada. Las 5 fallas son 3 pruebas: 2 con defectos de portabilidad de la propia prueba, ya corregidos (luego 21/21 ✓ en esos archivos), y 1 intermitente que ya fallaba igual en `main` | Las 47 omitidas son condicionales: Admin necesita `E2E_ADMIN_STATE` y hay casos sólo de escritorio o sólo de móvil |

## 4. E2E: fallas que ya existían en `main` y su causa

La primera corrida de la rama integrada (base `repi_fsa_int`) dio 243 ✓, 18 ✗ y 47 omitidas. Las 18 fallas son 9 pruebas en dos proyectos. Las 9 se corrieron también contra `main`:

| Prueba | En `main` | Causa | Acción |
| --- | --- | --- | --- |
| `brain-staff:56`, `prescribed-weights:22`, `timed-exercises:251`, `training-intelligence-roles:51`, `personal-progress:140` y `:205` | Fallan | La guarda de siembra de las E2E sólo acepta bases `repi_dev` o `repi_e2e_*`, y la base se llamaba `repi_fsa_int` | Corrida final con `repi_e2e_fsa` |
| `personal-progress:85` (fotos) | Falla | Una build de producción local sin `STORAGE_DIR` no tiene almacenamiento | Corrida final con `STORAGE_DIR` |
| `mobile-layout:123` (importar con métodos) | Falla | La prueba esperaba la revisión anterior a Smart Import 2.0 (CI no corre E2E). Además había un defecto real: la pregunta de un método ambiguo quedaba escondida (IMP-12) | Corregido y prueba actualizada |
| `gym-editor-parity:9` | Intermitente (1 de 4) | Defecto real del modal: Esc y Tab dejaban de responder si desaparecía el elemento enfocado (MOD-01) | Corregido; la prueba fuerza la condición y falla siempre contra `main` |

**Corrida final** (rama integrada, base `repi_e2e_fsa` nueva, una sola instancia): 288 ✓, 5 ✗, 47 omitidas, en 19,7 min.

| Falla | Causa | Estado |
| --- | --- | --- |
| `personal-progress:85` (fotos) | La prueba consultaba `http://localhost:3000` fijo, no el servidor bajo prueba | Corregida; pasa |
| `training-intelligence-roles:51` | La prueba leía `.env.local` sin mirar `DATABASE_URL` | Corregida; pasa |
| `gym-member-page:202` (desktop) | Foco en el título de Programas la primera vez: intermitente también en `main`, según el auditor de personal | Abierta (intermitente, no reproducible a demanda; pasó al repetir) |

**Ajustes del entorno de prueba hechos en la auditoría** (no son de la app):
- Cinco pruebas que siembran aceptaban sólo `repi_dev`. `repi_dev` está en su tope de 300 demos y no se purga, así que no podían correr. Ahora aceptan también `repi_e2e_*` local.
- Una corrida inválida quedó descartada. Hubo dos instancias simultáneas contra un servidor de la build anterior, que superaron el tope de demos. Se repitió aislada.
