# Inventario funcional, flujos y trazabilidad — Auditoría QA 29/10/2026

Este archivo consolida FUNCTIONAL_INVENTORY, USER_FLOW_MATRIX y la matriz de trazabilidad.

- **Inventario de producto completo:** `docs/PRODUCT_INVENTORY.md` (generado; no se edita a mano).
- **Este archivo:** cobertura de la auditoría por rol y módulo, y qué evidencia la respalda.

**Tamaño del sistema:**
- 22 páginas (`page.tsx`) y 100 rutas de API (`route.ts`).
- 18 módulos de servicio en `src/server`.
- Dominio puro en `packages/domain` (20 archivos de prueba).

**Tipos de evidencia:**
- **INT:** integración con Postgres real.
- **UNIT:** prueba unitaria del dominio.
- **E2E:** Chrome real contra la build de producción local.
- **EMU:** emulación de dispositivo o red.
- **CODE:** revisión de código.
- **NT:** no probado.
- **FIS:** dispositivo físico. **Nada en esta auditoría tiene evidencia FIS** (LB-03).

## 1. Inventario por rol

| Rol | Superficie | Secciones | Evidencia |
|---|---|---|---|
| Público | `/`, `/demo`, `/acceso`, `/ayuda`, `/instalar`, `/legal/*`, `/unirse/[slug]`, `/ingreso`, `/activar`, `/tutor`, `/ranking` | Sitio, demo guiada, alta e ingreso, guía, instalación, legales, QR de alta, pantallas de sala | E2E (8 páginas: carga, axe, overflow, enlaces), INT (acceso, ingreso, ranking) |
| Alumno | `/app` | Inicio, Entrenar (sesión offline, series, por tiempo, AMRAP, cambios), Progreso, Mensajes, Gym/Club, Perfil, check-in, dolores, historial e importación, metas, privacidad | E2E (entrenar + serie + recarga; 4 pestañas con axe), INT (training, sync, followup, goals, history-import, privacy, community), UNIT (sync, training) |
| Coach | `/coach/[orgId]` | Panel, Clientes, Agenda, Programas (constructor y series avanzadas), Mensajes, Solicitudes, Cobros a alumnos, Condiciones REPI | E2E (todas las secciones, móvil y escritorio, axe), INT (training, followup, payments, agenda, adaptive) |
| Dueño de gym | `/gym/[orgId]` | Ejecutivo/Panel, Sedes, Equipo y servicio, Performance Center, Tareas, Reseñas, Turnos, Participación, Socios, Comunidad, Validaciones, Solicitudes de acceso, Accesos y QR, Condiciones REPI, Configuración | E2E (todas las secciones, axe), INT (gym, gym-access, connect, floor-now, community, entry) |
| Profe de sala | `/gym/[orgId]` | Mi turno, Cola de asistencia, Solicitudes de acceso, Socios, Traspaso de turno, Mensajes, Mi desempeño | E2E (todas las secciones, axe), INT (gym, connect, floor-now) |
| Admin REPI | `/admin` | Organizaciones, contratos, condiciones, cierres simulados, pagos, privacidad, soporte | INT (annex, commercial-delivery, condition-notices, payments, privacy, support). E2E: sólo que la API niega acceso sin sesión. Sin recorrido de UI (no hay demo de admin; el ingreso requiere credenciales reales que Claude no usa) |

## 2. Matriz de flujos críticos

| # | Flujo | Rol | Camino | Resultado | Evidencia |
|---|---|---|---|---|---|
| F1 | Abrir demo y navegar | Todos | `/demo` → rol → app | Pasa en móvil y escritorio | E2E |
| F2 | Entrenar y registrar una serie con decimales; doble toque; recargar | Alumno | Comenzar → Saltar check-in → peso «42,5» → Completar serie ×2 → recargar | 1 registro de 42,5 kg en el servidor, también después de recargar | E2E |
| F3 | Entrenar sin red y sincronizar después de una edición del coach | Alumno + coach | Bajar rutina → coach edita → iniciar con los IDs viejos | Inicia y registra (antes se perdía) | INT (DATA-2) |
| F4 | Inicio o serie rechazados por el servidor | Alumno | 4xx en la cola | Se conserva, se avisa y se puede reintentar o descartar | CODE (DATA-7) |
| F5 | Invitación de coach o gym → alta → verificación | Coach/gym → invitado | Invitar → correo con `code` + `p` → alta | Verifica sólo con la prueba del correo; sin ella pide OTP | INT (SEC-1) |
| F6 | Fin de relación coach–cliente | Coach | Terminar → bandeja o salud | Sin acceso | INT (SEC-2) |
| F7 | Ranking del club y TV | Socio / sala | Marca → ranking | Sin menores restringidas ni series por tiempo | INT (SEC-6, DATA-6) |
| F8 | Aislamiento entre organizaciones | Alumno | API de coach o gym ajeno | 403/404 | E2E |
| F9 | Cobro de coach con doble toque | Coach | Nuevo cargo → doble toque | Un cargo | CODE (UX-6) |
| F10 | Cierre simulado con montos grandes | Admin | Términos → cerrar período | `too_large` claro (antes 500) | INT (DATA-4) |
| F11 | Validar ingreso en recepción sin validación | Socio | Recepción → «Ya me validaron» | Mensaje visible | CODE (UX-1) |
| F12 | PWA: manifiesto, íconos y SW sin `/api` | Público | — | OK | E2E |
| F13 | Socio escanea el QR de la sede en su teléfono | Socio (sin cuenta) | QR → «Pedí tu acceso a REPI» → «Crear mi cuenta» → «Tus datos» | Va directo al pedido; la guía de inicio aparece después (D152) | E2E |

## 3. Trazabilidad requisito → defecto → prueba

| Requisito o riesgo | Defectos | Prueba que lo cubre |
|---|---|---|
| Identidad y alta sólo por el flujo de REPI | SEC-1, SEC-4, SEC-5 | `tests/access.test.ts`, `tests/security-launch.test.ts` |
| Acceso a datos de salud sólo con relación vigente | SEC-2 | `tests/followup.test.ts` |
| Protección de menores (consentimiento del adulto) | SEC-6, SEC-10 | `tests/lift-ranking.test.ts` |
| Costos y abuso (correo, IA) | SEC-3, SEC-8 | `tests/sandbox.test.ts` + CODE |
| Sin SSRF ni secretos en logs | SEC-7, SEC-11 | `tests/log.test.ts`, `tests/annex.test.ts` |
| Ningún entrenamiento offline se pierde | DATA-2, DATA-7, DATA-8 | `tests/training.test.ts`, `packages/domain/src/sync.test.ts`, `e2e/member-workout.spec.ts` |
| Métricas y ranking verdaderos | DATA-1, DATA-6 | `tests/training.test.ts`, `tests/lift-ranking.test.ts` |
| Facturación sin errores de servidor | DATA-4, DATA-9 | `tests/annex.test.ts` |
| Acciones destructivas reversibles o confirmadas | UX-2, UX-4, UX-11, UX-14 | CODE |
| WCAG 2.2 AA en las pantallas principales | AXE-1..6, A11Y-1..4 | `e2e/*.spec.ts` (`expectAccessible`) |
| Sin scroll lateral en el teléfono | UX-10 | `e2e/*.spec.ts` (`expectNoHorizontalOverflow`) |
| Alta de socio por QR clara y sin bloqueos | QR-1 | `e2e/roles.spec.ts` «QR de la sede (D152)» |
| Ningún dato de entrenamiento oculto ni inflado | DATA-5, DATA-6 | `tests/substitutions.test.ts`, `tests/training.test.ts` |
