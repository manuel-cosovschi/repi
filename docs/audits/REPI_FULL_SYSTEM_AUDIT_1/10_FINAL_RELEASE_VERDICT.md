# 10 — Veredicto final

Auditoría FSA1, 09/11/2026. Producción `210bf9e8af02` (PR #88).

## Decisión técnica: **APTO CON OBSERVACIONES**

REPI está en condiciones técnicas de seguir incorporando clientes:
- **No quedan P0 abiertos.** Los dos encontrados (salteo de 2FA y pérdida silenciosa de una serie sin conexión) están corregidos, probados y verificados en producción.
- **De los 8 P1, 7 están corregidos.** El restante (STF-09: no se puede quitar a alguien del equipo desde el producto) es una función que falta. El servidor ya respeta la revocación en el pedido siguiente, existe una mitigación operativa probada (09 §2) y falta la decisión de permisos del titular.
- **Los guardados son consistentes** en los escenarios adversariales verificados: respuesta perdida, 500, dos pestañas, sin almacenamiento, sesión cerrada por el servidor y carreras de versión.
- **Permisos y privacidad** quedaron verificados contra la API: entre organizaciones, entre socios y entre roles, y la gestión ya no recibe datos privados del socio.
- **El historial no se reescribe:** las sesiones viejas conservan su versión y la huella de los datos reales quedó idéntica después de publicar.
- **CI verde, respaldo verificado, versión identificada y smoke productivo 25/25.**

**Observaciones que impiden un «APTO» sin reservas:**
1. STF-09 (P1) abierto, con mitigación.
2. Tres P2 abiertos que piden una decisión: COM-07 (lesiones en «No vino el profe»), COM-09 (reintento de email) y la confirmación de D-2 (qué ve la gestión).
3. **No hubo pruebas en dispositivos físicos ni en Safari o Firefox:** todo es Chromium. Es el riesgo de verificación más importante para una app que se usa en iPhone.
4. Push, email e IA reales no se ejercitaron (proveedores simulados) para no generar envíos ni gastos.
5. No hubo pruebas de carga.

**Esto no es una habilitación legal ni contractual** para el lanzamiento comercial. Tampoco garantiza la ausencia de defectos: el alcance verificado es el de 02.

## A. Cobertura

| Qué | Cantidad |
| --- | --- |
| Superficie inventariada | 28 páginas, 157 rutas de API (todas las de `[orgId]` atacadas entre organizaciones) y 166 entradas del inventario de producto (42 son alcance no implementado) |
| Acciones inventariadas por los auditores | ≈165 filas (acción, ruta, persistencia, permiso, prueba y resultado), resumidas por rol en 01 |
| Roles auditados | 6: socio, coach, sala (piso y coordinación), dueño y gerencia, REPI Admin, y público. Más recepción y vendedor por API |
| Recorridos críticos del §17 | 9 de 12 completos y 3 parciales (ver abajo) |
| Controles de UI tocados por el explorador | 652, en 4 roles y 8 anchos |
| No verificables en este entorno | Dispositivos físicos, Safari y Firefox, push real, email real, IA real, Storage real (lo cubre el respaldo diario), Admin y Ventas en la UI, carga |

Recorridos del §17:

| # | Recorrido | Estado |
| --- | --- | --- |
| 1 | Nuevo socio de gimnasio | Parcial: cada tramo verificado (alta, aprobación, consentimiento, programa, entrenamiento, historial, progreso), con el email por proveedor simulado |
| 2 | Socio que necesita rutina | ✓ |
| 3 | Entrenador personal | ✓ (ciclo completo con el historial intacto) |
| 4 | Gimnasio con varios entrenadores | ✓ (turno, traspaso, continuidad, resolución) |
| 5 | Rutina importada | ✓ con IA simulada |
| 6 | Entrenamiento sin conexión | ✓ |
| 7 | Modificación del programa | ✓ |
| 8 | Dueño del gimnasio | ✓, salvo quitar a alguien del equipo (STF-09) |
| 9 | Privacidad | ✓ |
| 10 | Fallos externos | ✓ (IA caída o lenta, email que falla, corte de red, duplicados) |
| 11 | Varias organizaciones | Parcial: aislamiento por API y limpieza del dispositivo al cerrar sesión verificados; el cambio de contexto en la UI con varias relaciones a la vez, no |
| 12 | Uso prolongado | Parcial: operaciones acumuladas cubiertas por pruebas; historial muy largo y su paginación, sin probar |

## B. Defectos encontrados

| Gravedad | Encontrados | Corregidos | Abiertos o aceptados |
| --- | --- | --- | --- |
| P0 | 2 | 2 | 0 |
| P1 | 8 | 7 | 1 (STF-09, decisión) |
| P2 | 21 | 19 | 2 (COM-07 y COM-09, decisión) |
| P3 | 32 | 23 | 9: 6 abiertos de bajo impacto o diseño, 3 descartados con justificación |
| **Total** | **63** | **51** | **12** |

Los duplicados entre áreas se cuentan una vez. Detalle en 03.

## C. Correcciones principales

- **2FA sin atajos:** el enlace, el código por email, la verificación de email y el callback social ya no abren sesión sin el segundo factor.
- **Ninguna serie se pierde ni se da por guardada sin estarlo:** escritura atómica en IndexedDB, aviso cuando falta almacenamiento y series tardías de una sesión cerrada por el servidor.
- **«Peso inválido» con decimales válidos:** se rechazaba hasta el 24 % de los pesos en lb.
- **Privacidad del socio frente a la gestión del gimnasio.**
- **Carrera al guardar un programa en uso.**
- **Avisos que no le llegaban a nadie** sin personal en turno.
- **Métricas del gimnasio iguales a la base.**
- **EXIF y GPS** fuera de las fotos.
- **Exportación completa** de los datos personales.
- **Auditoría de Admin.**
- **Archivos de demos huérfanos.**
- **QR o invitación vencidos sin salida.**
- **Foco y teclado en los diálogos.**

## D. Seguridad

- **Permisos:** verificados por API (horizontal y vertical, entre organizaciones, sedes y roles, y con revocaciones en caliente).
- **Autenticación:** 2FA corregida; la cookie de sesión es HttpOnly y SameSite; restablecer la contraseña revoca las sesiones.
- **Credenciales:** la clave del cron pasó a Vault y no aparece en los registros; sin secretos en el repo; variables de Vercel sólo en Production.
- **Pendiente de decisión:** la 2FA de Admin sigue optativa (D119).

## E. Datos

**Los datos reales están intactos:**
- Huella de 16 tablas idéntica antes y después.
- 0 conflictos de sincronización, 0 series duplicadas y 0 pesos inválidos.
- Sin migraciones.

## F. Móvil y PWA

**Sólo Chromium:** Pixel 7 emulado, de 320 a 430 px, más tableta y escritorio, en claro, oscuro y automático. **No se probó ningún iPhone, Safari, Android físico ni Firefox.**

## G. Infraestructura

| Pieza | Estado |
| --- | --- |
| Respaldos | Diarios y verificados con restauración. El cronograma de GitHub llega con 6 a 8 h de demora sin perder días. Vigilante a 30 h |
| Cron | 200, con la clave en Vault. `repi_app` con límites de tiempo |
| Alertas | Email de errores y del vigilante configurados |
| Storage | Sano. 5 huérfanos de 83 KB pendientes de autorización para borrarlos |
| Observabilidad | Vercel accesible (el 403 previo ya no ocurre) |
| Producción | `210bf9e8af02` |

## H. Release

| Qué | Valor |
| --- | --- |
| Rama | `claude/full-system-audit-1` |
| PR | #88, CI verde |
| Merge | `210bf9e` |
| Migraciones | Ninguna |
| Respaldo | `backup-20261109-054319-42568711678` |
| Smoke | 25/25 |
| Rollback | El despliegue anterior `72aa71936d73` en Vercel |

## I. Próximo paso

Se puede continuar con desarrollos nuevos sin arrastrar fallas graves conocidas. Antes, o en paralelo:
1. Decidir D-1 (quitar a alguien del equipo), D-2, D-3 y D-4 (09 §1).
2. Probar en un iPhone real los recorridos de entrenamiento con y sin conexión, Mi cuerpo, fotos e importación.
3. Verificar push y email reales con una cuenta demo.
