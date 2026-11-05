# REPI — Experience Intelligence & UX 2.0 (bloque 05/06, D195)

Estado: **implementado en la rama `feat/repi-experience-intelligence-ux`, sin publicar.** La migración 0045 está lista y
ensayada en una base descartable, pero **no se aplicó en producción**. Nada se desplegó.

Este documento describe qué cambió, por qué y cómo verificarlo. Consume los contratos de Training Intelligence 2.0
(`docs/TRAINING_INTELLIGENCE_2.md`) sin reescribir el motor ni el constructor de programas.

## 1. Resumen

| Área | Qué hay ahora |
| --- | --- |
| Sesión del alumno | Guía de la serie con cuatro niveles (Tu profe indicó / REPI recomienda / Anterior / Real), lista de ejercicios, «Salir un momento», aviso de entrenamiento en curso en todas las pestañas, atajos a cargas reales, protección contra doble toque. |
| Historial | Corregir peso, repeticiones, RIR, sensación y nota; anular y restaurar series y entrenamientos; agregar una serie prescripta que no se registró. Todo auditado, idempotente y con detección de conflictos. |
| Métricas | Récords, volumen, niveles, rankings, informes y recomendaciones se recalculan solos: se derivan al leer y todos los lectores excluyen lo anulado. |
| Coach | «Editar programa» sigue en el constructor existente; nueva vista previa de sólo lectura «Ver cómo lo verá…»; series corregidas marcadas. |
| Gimnasio | Catálogo de equipamiento por sede (mancuernas, barras, máquinas, poleas…) con cargas reales, usado por Training Intelligence. |
| Onboarding | Ayudas de primera vez que se cierran con un toque, no se repiten en otro dispositivo y se pueden volver a ver. |
| Sincronización | Estados honestos: «Guardado en el teléfono» no es «Guardado en tu cuenta». |

## 2. Sesión del alumno

### Guía de la serie (`components/member/SetGuide.tsx`)
- Reemplaza las tres columnas chicas por filas legibles a 320 px. La región conserva el nombre accesible `Objetivo de serie N`.
- **Tu profe indicó** va siempre primero: la carga y las repeticiones del plan. Si no hay carga, lo dice.
- **REPI recomienda** sólo aparece si el motor propone otra cosa. Si coincide con el profe, dice «Mantener lo indicado» y no repite el número.
- Sin objetivo calculado, y si el profe no puso carga, aparece «REPI sugiere hoy» con la sugerencia existente.
- **Anterior**: la última vez (o «Sin referencia»). Si viene de un historial importado, lo aclara.
- **Real (hoy)**: lo registrado, o «Por registrar». Lo sugerido nunca se confunde con lo hecho.
- Revisiones y advertencias de seguridad se muestran aparte, con su color. «¿Por qué?» abre la explicación.
- «Usar …» sólo carga el borrador si difiere de lo que ya está; nunca registra.

### Registro y navegación (`components/member/Workout.tsx`)
- La acción principal («Completar serie N») va antes que las herramientas: con teclado o en 320 px no queda tapada.
- Un doble toque no registra dos veces (guarda de 450 ms sobre la misma acción).
- Botón de lista: «Ejercicios de hoy» con el estado de cada uno (hecho, en curso, N de M, salteado, pendiente). Tocar uno va ahí; no cambia el orden indicado.
- Al volver: «Pausar y seguir más tarde», **«Salir un momento (el reloj sigue)»** o cortar el entrenamiento.
- En cualquier pestaña aparece **«Entrenamiento en curso · Volver»** (`.wo-live`). Inicio ya lo muestra en su tarjeta.
- Un entrenamiento anulado desde el historial no se retoma ni se resume como hecho.
- Métodos avanzados (drops, rest-pause, cluster, EMOM, combinados) se presentan igual que antes. No se tocó el motor de métodos.

### Cargas reales
- Si el ejercicio tiene una escalera de cargas (del plan o del catálogo de la sede), aparecen atajos a las cargas vecinas (`nearLoads`): hasta dos abajo, la igual y hasta dos arriba. Tocar uno cambia el borrador; nunca se aplica solo.
- El ajuste después de una serie (`adjustAfterSet`) usa el salto del equipo y después `fitTargetsToLoads`.

### Estados de guardado (`components/member/SyncBadge.tsx`)
| Situación | Texto |
| --- | --- |
| Todo confirmado por el servidor | Guardado en tu cuenta |
| Cambios en la cola, con conexión | Guardado en el teléfono · N cambios por sincronizar |
| Enviando | Guardado en el teléfono · sincronizando… |
| Sin conexión | Sin conexión · N cambios en el teléfono |
| Error | No se pudo sincronizar (los datos siguen en el teléfono) |
| Conflicto | Hay dos versiones de una serie (no se pisó ninguna) |
| Rechazado por el servidor | No se pudo guardar en tu cuenta |

Nunca se muestra un código interno como explicación principal.

## 3. Historial corregible

### Modelo (migración 0045)
- **Anular no borra.** `workout_session.status = 'voided'` más `voided_at`, `voided_by` y `void_reason`; en `set_log`, las mismas tres columnas. Restaurar las vuelve a `completed` / `NULL`.
- No se usa `DELETE FROM set_log` para anular. Las filas siguen y se pueden restaurar.
- **Auditoría append-only:** `training_correction` guarda la acción (`set_edit`, `set_void`, `set_restore`, `set_add`, `session_void`, `session_restore`), los valores antes y después, el motivo, quién lo hizo, `request_id` y la revisión base. No guarda nada en los registros de auditoría generales (`audit` sin valores).
- **Idempotencia:** índice único `(user_id, request_id)`. Reintentar la misma corrección devuelve el mismo resultado y no duplica.
- **Conflictos:** cada corrección manda la `revision` que vio. Si la serie cambió en otro dispositivo: `409 correction_conflict` con los valores actuales. La pantalla los muestra y pide revisar.
- **Cambios grandes:** más de 50 % de diferencia en carga o repeticiones pide confirmación (`confirm_required`).
- La fecha del entrenamiento no cambia al corregir. Cada corrección tiene su propia fecha.

### Lectura sin anulados
- Lo anulado no cuenta. El filtro positivo de estados de sesión ya dejaba afuera `voided` (falla segura), y todos los lectores de series filtran `voided_at is null`.
- Lectores revisados: servicios de entrenamiento, Training Intelligence (también las consultas SQL directas), niveles, objetivos, comunidad y avisos, club, informe mensual, coach con IA y conexión con el gimnasio.
- **Recálculo:** récords, volumen, niveles, rankings, informes y objetivos se derivan al leer. Una corrección se refleja en la próxima lectura, sin tareas en segundo plano.
- **Trofeos:** se vuelven a evaluar después de cada cambio (`syncTrophies`). Uno ya ganado no se revoca: es histórico.
- **Recomendaciones ya emitidas** (`training_target`, `training_proposal`) no se modifican: son evidencia de lo que se mostró. Las próximas usan el historial corregido.

### API del alumno (`/api/me/history`)
| Método y ruta | Qué hace |
| --- | --- |
| `GET /api/me/history?before=` | Lista paginada con estado, si tiene correcciones y series anuladas. |
| `GET /api/me/history/:id` | Detalle por serie (también las anuladas y las no registradas), métricas válidas, récords, comparación con la vez anterior, cambios y acciones posibles. |
| `POST /api/me/history/:id/sets/:setId` | Corregir una serie (`requestId`, `baseRevision`, `values`, `reason`, `confirm`). |
| `POST /api/me/history/:id/sets/:setId/void` | Anular o restaurar una serie. |
| `POST /api/me/history/:id/sets` | Agregar una serie prescripta del día congelado que no tiene registro. Queda con la hora del cierre y marcada «Agregada». |
| `POST /api/me/history/:id/void` | Anular o restaurar el entrenamiento (`baseRevision`). |

- Sólo la persona dueña corrige su historial. El coach y el gimnasio reciben 404: no editan resultados del alumno.
- Sólo se corrigen entrenamientos cerrados. Abierto: 409 `open`. Anulado: 409 `voided` hasta restaurarlo.
- Series y sesiones abiertas rechazan registros nuevos si la sesión está anulada (`logSet` y `setStageSkip`: 409).

### Pantalla (`components/member/History.tsx`, en Progreso)
- Lista con chips «Anulado» y «Corregido». El volumen semanal excluye lo anulado.
- Detalle por ejercicio y serie. Tocar una serie abre la hoja de corrección: peso en la unidad elegida, repeticiones o segundos, RIR, sensación, nota y motivo.
- En lb sólo se manda el peso si la persona lo cambió, para no «corregir» un redondeo de la conversión.
- «Eliminar entrenamiento» explica antes que es reversible y que borrar los datos para siempre es otra cosa (Perfil → Privacidad).
- Sin conexión se puede ver, pero corregir pide conexión. Nada se marca como guardado antes de que el servidor lo confirme.
- Después de una corrección se descarta la copia vieja del teléfono de esa sesión, si no tiene pendientes.

## 4. Coach

- **Editar programa:** el botón de la ficha abre el constructor existente sobre la copia del cliente. No hay un segundo constructor.
- **Ver cómo lo verá…** (`components/coach/StudentPreview.tsx`): vista previa de sólo lectura del programa vigente.
  - Muestra días, orden, etiquetas A1/A2, combinados y circuitos, métodos, cada serie con su carga, % 1RM, repeticiones, RIR o RPE, etapas, descansos y notas.
  - No es suplantación: no usa la sesión del alumno, no inicia entrenamientos, no registra nada.
  - No muestra datos personales. «Anterior» y las sugerencias de REPI dependen del historial del alumno y no aparecen.
- **Series corregidas:** en el registro de sesiones, las series que el alumno corrigió o agregó llevan el chip «Corregida». El coach no ve lo anulado.
- **Primeros pasos:** tarjeta de una sola vez en el panel (`coach_start`) y paso nuevo en la Guía.

## 5. Catálogo de equipamiento por sede

### Modelo
- `gym_equipment`: sede, nombre, tipo, código, unidad (kg o lb), salto, «por lado», mínimo, máximo, lista explícita de cargas, nota, archivado y revisión. El nombre es único por sede entre los activos.
- `gym_equipment_exercise`: qué ejercicios usan cada equipo.
- No es inventario ni dato de socios.

### Permisos
- Lo administra quien tiene `equipment.manage` en esa sede: dueño, gerente y coordinador. Fuera de su sede, 404.
- Lo puede ver quien arma programas (`program.edit`).
- El dueño no recibe ningún acceso privado nuevo a datos de socios.
- Editar con una revisión vieja da 409 `stale`. Un nombre repetido da `duplicate`.

### Cómo lo usa Training Intelligence
1. **Prioridad:** lo que indicó el plan (`detail.load`) > el equipo de la sede asociado al ejercicio > desconocido.
2. **Escalera de cargas (`LoadLadder`):** de la lista explícita, o de mínimo, máximo y salto. «Por lado» duplica. Se convierte a kg una sola vez.
3. **Ambigüedad:** si dos equipos de la sede dan escaleras distintas para el mismo ejercicio, no se usa ninguna.
4. **`fitTargetsToLoads`** sólo ajusta objetivos calculados por reglas. No toca lo que indicó el profe ni los pendientes:
   - Para subir, busca la carga disponible de arriba sólo si está a 10 % o menos. Si no, mantiene la carga con `equipment_fit` e `increment_too_large`.
   - En los demás casos ajusta a la carga disponible de abajo.
   - Si no hay ninguna carga debajo, lo marca `below_available`.
   - Nunca sube una carga por redondear y nunca inventa una carga que no existe.
5. Un ejercicio sustituto en la sesión no usa la escalera del original.
6. No se aplica nada solo a un entrenamiento abierto: los atajos son opcionales.

### Pantalla
- Gimnasio → «Equipamiento»: lista por sede, alta y edición con la lista de cargas («10; 12,5; 15») o rango y salto, ejercicios asociados, archivar y restaurar. Arriba explica cómo lo usa REPI.

## 6. Ayudas de primera vez

- Componente `Hint`: tarjeta en el flujo, nunca encima de un control, anunciada como nota. «Entendido» la cierra para siempre.
- Se recuerda en la cuenta (`user_pref.hints`: sólo clave y fecha) y en el teléfono.
- Claves: `start_guide`, `ti_intro`, `history_edit`, `workout_nav`, `coach_start`, `gym_equipment`, `rest_intel`. La API rechaza cualquier otra.
- «Volver a ver las ayudas» en Perfil las reinicia todas.

## 7. Migración 0045

- **Archivos:** `drizzle/0045_experience_ux.sql`, `scripts/operations/hosted-0045.sql`, `scripts/rollback/0045_experience_ux.down.sql` y `scripts/operations/verify-0045.sh`.
- **Sólo agrega:** tres tablas, seis columnas NULL de anulación y `user_pref.hints` con `{}` por defecto. No modifica filas existentes.
- **Compatible con el código actual de producción:** ese código no lee nada nuevo y sigue insertando series sin las columnas nuevas.
- **Ensayo** (`verify-0045.sh`, en `repi_verify_0045`, copia descartable de `repi_dev` con historial sintético):
  - La huella de `set_log`, `workout_session`, `program_version`, `history_entry` y `user_pref` es igual antes y después.
  - RLS en las tres tablas, con `repi_app` como dueño.
  - El reintento falla entero, sin cambios.
  - La reversión se niega si hay una serie anulada.
  - Revertir y reaplicar dejan la misma huella.
- **Publicación (pendiente de autorización):** workflow «Respaldo» en verde → `hosted-0045.sql` → verificación → despliegue del código.
- **Reversión del código:** volver al despliegue anterior. El esquema puede quedar. Revertir el esquema sólo si se abandona el bloque y no hay anulados.

## 8. Pruebas

- **Dominio** (`packages/domain/src/experience.test.ts`): validación de correcciones y advertencias, resumen de cambios, escaleras de equipo, prioridad plan > sede > desconocido, `fitTargetsToLoads` (nunca sube por redondeo, nunca inventa) y `nearLoads`.
- **Integración** sobre `repi_test`, base descartable con guardas:
  - `tests/history-corrections.test.ts`: dueño, coach 404, idempotencia, conflictos, confirmación, anular y restaurar series y sesiones, agregar faltante, exclusión en récords y volumen, abierta y anulada 409.
  - `tests/gym-equipment.test.ts`: permisos por sede, duplicados, revisión vieja, archivar y escalera para el socio.
- **E2E (Chromium emulado):** se actualizaron las expectativas de la guía de la serie. Ver el informe del PR para lo que se corrió.
- **No probado en iPhone ni Android físicos.**

## 9. Límites conocidos

- Corregir el historial necesita conexión: no hay cola offline para correcciones.
- Agregar una serie sólo vale para filas prescriptas del día congelado. No se agregan ejercicios que no estaban en el plan.
- El catálogo resuelve un equipo por ejercicio y sede. Con escaleras distintas para el mismo ejercicio no se usa ninguna.
- La vista previa del coach muestra las cargas en kg; el alumno las ve en su unidad.
- Los trofeos ya ganados no se revocan al anular (decisión de producto: son históricos).
