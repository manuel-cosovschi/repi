# 06 — Base de datos e integridad

Auditoría FSA1, 09/11/2026.
- Las escrituras se probaron sólo en bases locales descartables: `repi_test`, `repi_audit` y `repi_fsa_*`.
- Producción se leyó en modo sólo lectura.

## 1. Esquema y migraciones

| Qué | Resultado |
| --- | --- |
| Código frente a base | 53 migraciones en el repo y 53 registradas en producción; la última es `0052_time_metrics` |
| Restricciones | 357 claves foráneas. El respaldo diario las verifica tras restaurarlo en una base descartable: sin huérfanos y 0 restricciones sin validar |
| RLS | Activado en las 138 tablas sin políticas: la API pública de Supabase queda sin acceso (D68) |
| Roles | `repi_app` es dueño de las tablas. Desde el 09/11 tiene límites de tiempo (07 §3). `repi_backup` es de sólo lectura y tiene sus propios límites |
| Esta auditoría | **No agrega migraciones.** Todas las correcciones son de código. El ajuste de `search_path` en dos triggers queda para la próxima migración (07 §6) |

## 2. Concurrencia y reintentos

| Escenario | Antes | Ahora | Prueba |
| --- | --- | --- | --- |
| Dos entrenadores toman el mismo pedido | Correcto (`FOR UPDATE`) | Uno gana y el otro recibe 409 | `gym.test.ts`, `connect.test.ts` |
| El coach guarda mientras el alumno empieza a entrenar esa versión | **La versión en uso se reescribía (STAFF-02, P1)** | Se lee `locked` con `FOR UPDATE` y se crea la versión 2 | `coach-workflow.test.ts` |
| Guardados simultáneos con el tope de 30 rutinas propias | **Se superaba el tope (IMPORT-08)** | Transacción y lock por persona, compartido con la importación | `program-import.test.ts` |
| Importación con respuesta perdida y reintento | Idempotente por `opId`, pero el borrador con su `opId` podía no guardarse (IMPORT-07) | El borrador se escribe antes de guardar y al cerrar o recargar | e2e `own-routine-import.spec.ts` |
| Serie registrada: respuesta perdida, 500, reintento | Idempotente por el id del teléfono | Sin cambios; verificado | e2e `member-sync-adversarial.spec.ts` |
| Dos pestañas sin conexión; carrera de la cola | **La serie se perdía en silencio (MEMBER-03, P0):** lectura-modificación-escritura no atómica en IndexedDB | `idbMerge` transaccional; una serie hecha nunca vuelve a pendiente | `offline-keep-done-client.test.ts` + e2e |
| Sin espacio de almacenamiento en el teléfono | **Mostraba «Guardado en tu cuenta» sin guardar nada (MEMBER-02, P1)** | Revierte y avisa | e2e |
| Series sin conexión de una sesión que el servidor cerró solo (D160) | **Rechazadas para siempre (MEMBER-04, P1)** | Se reabre la sesión si el cierre fue automático, con auditoría; un corte manual sigue rechazando | `member-late-sets.test.ts` |
| Mensaje reenviado con el mismo id de cliente | Se guarda una sola fila | Sin cambios; verificado | e2e de comunicaciones |
| Cambio de responsable de un cliente comercial | Dos escrituras sueltas (COMMS-05) | Transacción | `annex.test.ts` |

## 3. Datos históricos

| Invariante | Resultado |
| --- | --- |
| Un programa nuevo no reescribe sesiones anteriores | Verificado: la sesión vieja apunta a la v1 con su prescripción y la huella de resultados queda igual (`coach-workflow.test.ts`) |
| Programa del gym actualizado con una sesión en curso | La sesión conserva su versión (`gym.test.ts`) |
| Series anuladas no cuentan; las corregidas cuentan corregidas | Verificado contra cifras sembradas, también con historial importado (`personal-progress.test.ts`) |
| Récords | **Mezclaban 1RM estimado con carga máxima (IMPORT-04)**; corregido |
| Métricas del gimnasio | **Tres conteos no coincidían con la base (STAFF-04/05/06)**: embudo reconstruido desde un porcentaje redondeado, entrenador con varias sedes contado en una sola, tareas abiertas de otras sedes. Corregidos con pruebas de cifras exactas, con y sin filtro de sede. La suma por sede da igual a «Todas» |
| Adherencia del coach | **Incluía alumnos pausados (STAFF-07)**; corregido |
| Procedencia de rutinas importadas | Inmutable tras editar (`program-import.test.ts`) |
| Peso en lb | **Editar una rutina corría la carga 0,01 kg; cambiar sólo la fecha de un peso corporal lo reescribía (IMPORT-09)**; corregido |
| Peso con 2 decimales | **Se rechazaba entre el 9 y el 24 % de los valores válidos por coma flotante (MEMBER-01 = IMPORT-03)**; corregido con un recorrido exhaustivo de 0 a 1000 kg |

## 4. Producción (sólo lectura, 09/11 03:13 UTC)

- 0 conflictos de sincronización.
- 0 pesos inválidos y 0 series vigentes duplicadas.
- Sesiones reales: 21 completadas y 9 abandonadas, ninguna colgada en curso.
- Notificaciones: ninguna fallida ni atascada. Las marcadas `skipped` son de personas sin dispositivo push; los avisos al personal igual aparecen en la bandeja «Avisos» (COMMS-06).
- Huella de los datos reales antes de la auditoría: 59 usuarios, 5 organizaciones, 30 sesiones, 345 series, 44 programas, 72 versiones, 32 asignaciones, 31 socios de gimnasio, 53 consentimientos, 260 objetivos de TI, 6 rutinas propias, 1 peso corporal y 0 fotos. Se compara después de publicar (08).

## 5. Riesgos de escala (sin cambios ahora)

- **196 claves foráneas sin índice:** el impacto está en los borrados en cascada (purga de demos cada minuto). Hoy el `delete` más lento de `repi_app` tarda 0,41 s. No se agregan índices sin medición, como pide el máster; queda en 09 con el umbral para revisarlo.
- **Paginación del historial por `endedAt` estricto:** dos sesiones con el mismo `endedAt` en el borde de una página podrían saltarse. No se reprodujo; queda en 09.
