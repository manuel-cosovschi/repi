# Flujo de trabajo del entrenador (D192, D194)

Pedido de Urko (Smart Center Gym, 04/11/2026). Hay tres problemas de la programación diaria y uno que surgió del hotfix D193:

- editar rápido pirámides y top set + back-off;
- Load Set y tipos de serie propios;
- copiar un día completo;
- actualizar los programas de los alumnos desde una plantilla.

Todo está en el PR #21 (rama `feat/repi-coach-workflow-ux`). **No está publicado.** Requiere la migración 0044, que no está aplicada en producción.

## 1. Diagnóstico

| Problema | Antes | Causa |
|---|---|---|
| Editar pirámides y top set + back-off | Al elegir el método, los valores aparecían recién después de aplicar una plantilla. Cada serie se editaba en una tarjeta. Había que reaplicar para cambiar cargas. | El editor estaba armado alrededor de «aplicar método». No tenía una tabla directa de series. |
| Load Set y tipos propios | No había cómo nombrar una serie de trabajo («Load Set») sin elegir un tipo semántico que no correspondía. Training Intelligence comparaba por tipo y no por nombre. | No existía la etiqueta visible separada del tipo. |
| Copiar un día | Solo se podía duplicar el programa entero o rearmar el día a mano. | No había copia de días. |
| Plantillas (D193) | Editar una plantilla no cambiaba las copias de los alumnos, y el editor no lo explicaba. | Cada alumno tiene su copia (por diseño). No había forma guiada de enviar cambios. |

## 2. Editor rápido de series (`SetTable.tsx`, `ExerciseDetailEditor.tsx`)

**La tabla.** Al elegir un método (pirámide, pirámide invertida, top set + back-off, drop set, rest-pause, myo-reps, cluster, etc.) aparece la tabla editable de todas las series.
- Columnas: tipo, repeticiones, peso, RIR, descanso. Debajo de cada serie, sus etapas (↳ Drop 1…).
- Teclado:
  - **Enter** baja a la misma columna de la fila siguiente.
  - **↑ / ↓** se mueven entre filas.
  - **Shift+Enter** sube.
  - Al entrar a un campo se selecciona su contenido.
- En el teléfono: teclado numérico (`inputMode="decimal"` / `numeric`) y grilla por áreas por debajo de 720 px.

**kg / lb.** Se elige en el editor y se recuerda por navegador (`repi:editor-unit`). Lo guardado siempre está en kg, con 2 decimales.

**Valores existentes.**
- Elegir un método muestra una **vista previa**: «S1: 40 kg → …».
- Si hay cargas o valores cargados que se reemplazarían, se dice cuáles y hay que confirmar.
- Nada se reemplaza solo: no se volvió al comportamiento que sobrescribía la programación.

**Deshacer.** Cada cambio se puede deshacer. Las teclas seguidas en el mismo campo se agrupan (2,5 s) para no deshacer de a un dígito.

**Distribuir cargas** (`LoadDistributor.tsx`, `loadSeries` / `setMainLoads`).
- Modos: subir o bajar un valor fijo por serie, subir o bajar un porcentaje, o el mismo peso en todas.
- Se eligen la carga de partida y las series. El redondeo es opcional.
- Se calcula **solo cuando el profe lo pide**, se muestra antes de aplicarlo y se deshace como cualquier edición.
- Solo toca la carga de las series principales elegidas. Nunca toca etapas, repeticiones, RIR ni descansos.
- Es programación del profe, no una recomendación de Training Intelligence: no aparece como «REPI recomienda».

**Acciones por serie.** A la vista: «⋯», «＋» (insertar después) y «×». En el panel «⋯»: subir, bajar, duplicar, % del 1RM, RPE, duración del AMRAP y nota. El panel se abre solo si la serie tiene nota.

## 3. Load Set y tipos de serie

**Tipo y etiqueta.**
- Cada fila del plan tiene un **tipo semántico** (`kind`: work, top, backoff, drop…), que manda en las reglas de carga (D182) y en Training Intelligence.
- Además puede tener una **etiqueta visible** (`label`, 2–30 caracteres) y, si viene de un tipo guardado, su `typeId`.
- El enum de tipos no cambió.

**Load Set.**
- Es una etiqueta predefinida sobre una serie de trabajo (`kind: work`).
- Se puede poner después de un top set, con su propio peso, repeticiones, RIR/RPE y descanso.
- No hay reducción automática ni porcentaje heredado: si no tiene carga, la elige el alumno (D182).
- El alumno la ve con su nombre y se registra como una serie real.
- En métricas cuenta como una serie efectiva.

**Training Intelligence** (`carriesLoad`, `compareRows`, `adjustAfterSet`, `outlookFor`):
- Solo compara filas con la **misma etiqueta normalizada** (sin acentos, mayúsculas ni espacios). Un Load Set nunca se compara con un top set ni con un drop.
- Una fila con etiqueta no se compara con el historial importado (que no tiene etiquetas).
- Respeta la carga prescrita y no inventa progresiones a partir del nombre.
- `progressionApplies` no aplica la progresión de series rectas si alguna fila tiene etiqueta.

**Tipos personalizados** (tabla `set_type`, migración 0044; `server/training/set-types.ts`).
- «+ Crear tipo personalizado…» en el selector de tipo: nombre, categoría semántica compatible y valores por defecto editables.
- Los tipos se guardan, se reutilizan, se renombran y se archivan.
- Archivar no borra nada: los planes conservan su etiqueta.
- El historial guarda la etiqueta de cada serie, así que renombrar no cambia sesiones pasadas.
- Una fila muestra el tipo guardado solo si coinciden id, nombre y categoría. Si no, muestra la etiqueta propia de la fila.

**Alcance de los tipos.**
- Son por profe y por organización: nunca se comparten entre organizaciones y nadie edita los tipos de otro (404).
- En el gimnasio, cada miembro del equipo tiene los suyos (`/api/gym/[orgId]/set-types`).
- Sin la tabla (0044 sin aplicar), la lista responde «no disponible» y el editor sigue funcionando sin tipos guardados.

## 4. Copiar y pegar un día (`DayCopy.tsx`, `server/training/day-copy.ts`)

**Menú «Día ▾».** Copiar, Duplicar, Pegar y «Copiar a…».
- El portapapeles es local, de esa pestaña: `sessionStorage`, por organización, dura 2 horas y se borra al cerrar sesión. No hay un portapapeles global entre cuentas.
- Guarda solo la referencia (programa y día), nunca el contenido.

**Destinos.**
- El mismo programa, otro programa del mismo alumno, el programa de otro alumno autorizado o una plantilla.
- En el gimnasio, el programa institucional de otro socio (con `program.edit` en la sede de ambos).

**Acciones.**
- Crear un día nuevo (por defecto).
- Agregar al final del día: las letras de superserie que ya se usan se cambian para no mezclarse.
- Reemplazar el contenido: pide una confirmación explícita.

**Qué se copia.**
- Se copian el orden, los métodos, las etapas, las superseries y los circuitos, con identidades nuevas en cada fila.
- Nunca se copian sesiones, resultados, PR, RIR real, propuestas u objetivos de Training Intelligence, datos médicos ni privados.

**Pesos y notas.**
- Para otra persona, por defecto se copia **sin pesos ni notas**. Con pesos solo por elección explícita, y con aviso.
- Para la misma persona, se conservan por defecto.

**Servidor.**
- El cliente nunca manda el contenido: el servidor relee el origen con los permisos de quien copia.
- Se valida el origen y el destino. Otra organización o un programa ajeno da 404.
- Un ejercicio privado no disponible en el destino se informa y solo se omite si el profe lo elige.

**Guardado.**
- Se pega por el mismo camino que el autoguardado: versión nueva si la vigente está congelada.
- Una sesión pasada o un entrenamiento abierto no cambian.
- Se bloquea el destino, se compara la **huella** de la vista previa (409 «Actualizar la vista previa») y se usa un `requestId` idempotente, así un reintento no duplica.
- Estados: copiado, destino, vista previa, guardando, guardado, error y conflicto de versión.
- El éxito se muestra solo cuando el servidor confirma.

**Auditoría.** `program.day_pasted` guarda ids y cantidades, sin nombres.

## 5. Actualizar programas de alumnos desde una plantilla (D194)

**El botón.** En una plantilla con alumnos, el aviso de D193 ahora tiene el botón **«Actualizar programas de alumnos»** (`TemplateRollout.tsx`).

**Qué muestra:**
1. Los alumnos con copias activas de esa plantilla, la **versión de su programa** y **de qué versión de la plantilla salió**.
2. Etiquetas por alumno: «Al día», «N cambios», «Con cambios propios», «Entrenando ahora».
3. La **comparación** por alumno: cada cambio con su texto, por ejemplo «Torso A · Press de banca: 4 × 8-10 · RIR 2 → Personalizada · 3 series (80, 90, 100 kg)», y su casilla.

**Cómo se compara** (`packages/domain/src/template-rollout.ts`). Es una comparación de tres vías:
- Base: la versión de la que salió la copia, o la última que se le aplicó.
- Plantilla: la versión vigente.
- Alumno: su copia actual.

Unidades de cambio:
- Datos del programa.
- Días: agregado, quitado, renombrado, orden.
- Ejercicios: agregado, quitado, modificado.

Un ejercicio se identifica por ejercicio de la biblioteca y ocurrencia dentro del día. Los ids de las filas no cuentan como cambio.

**Personalizaciones.**
- Si el profe cambió en la copia del alumno la misma unidad, es un **conflicto**.
- Por defecto **se conserva lo del alumno**: sus cargas, métodos, descansos e indicaciones particulares. Solo se reemplaza si el profe marca esa casilla.
- Los ejercicios que solo tiene el alumno nunca se pierden.
- Sin base conocida (programas viejos), toda diferencia es conflicto.

**Confirmación.**
- Hay que marcar «Revisé la comparación…».
- Se crea una **versión nueva** de cada programa elegido, con el motivo «Actualización desde la plantilla «X» (versión N)».
- Nada se aplica en silencio ni a todos por defecto: solo los alumnos marcados y los cambios marcados.

**Historial.**
- Las sesiones y series registradas siguen en la versión con la que se hicieron.
- La versión de la plantilla queda congelada y pasa a ser la base de la próxima comparación.

**El alumno.**
- Se le avisa por el mecanismo existente: «… actualizó tu programa», con autor y motivo.
- Si está entrenando, le aparece «Aplicar ahora» (D145/D193): sus series hechas no cambian y las que faltan toman la versión nueva.

**Seguridad.**
- Solo el coach dueño de la organización.
- Solo copias de esa plantilla con asignación y relación activas (otra organización, otra plantilla o un programa ajeno dan 404).
- Se bloquea la plantilla y los programas en orden fijo.
- Se compara la huella de la plantilla y de cada programa (409 si cambiaron desde la vista previa).
- Un cambio que no está en la comparación vigente se rechaza.
- `requestId` idempotente.
- Auditoría `program.template_rollout` / `program.versioned` con ids y cantidades.

**Alcance.** Solo coach: el gimnasio edita el programa de cada socio y no tiene plantillas. Complementa a copiar y pegar días, no lo reemplaza.

## 6. Privacidad

- Ningún log ni auditoría guarda nombres de personas ni contenido.
- Las cargas del alumno A no se usan para recomendarle al alumno B: copiar entre alumnos va sin pesos por defecto y Training Intelligence nunca lee programas de otra persona.

## 7. Migración 0044 (`set_type`)

- Solo agrega una tabla. El código actual de producción no la lee.
- Preparación: `scripts/operations/hosted-0044.sql`, `scripts/rollback/0044_set_types.down.sql` y el ensayo `scripts/operations/verify-0044.sh`.
- Además activa RLS en `training_target` y `training_proposal`, que 0043 creó sin RLS. Lo verifiqué en producción con una consulta de solo lectura: `anon` y `authenticated` no tienen permisos sobre ellas, así que no hubo exposición.
- **Aplicada en producción el 04/11/2026 (~23:44 UTC)**, tras el respaldo verificado `backup-20261104-234215-41935448423`. Detalle en `docs/continuidad/PROXIMA_SESION.md`.
- Ensayo (04/11) en una copia descartable de `repi_dev`:
  - Se aplica con un registro de migración y activa RLS en las tres tablas.
  - Un segundo intento falla entero, sin cambios.
  - La reversión deja todo como antes y se puede reaplicar.
  - La huella del historial (set_log, workout_session, program_version, history_entry) queda igual en todos los pasos.

## 8. Pruebas

| Pruebas | Archivo |
|---|---|
| Dominio (25) | `packages/domain/src/coach-workflow.test.ts` |
| Dominio (8) | `packages/domain/src/template-rollout.test.ts` |
| Integración (18) | `apps/web/tests/coach-workflow.test.ts` |
| Integración (5) | `apps/web/tests/template-rollout.test.ts` |
| Integración (9, hotfix) | `apps/web/tests/prescribed-weights.test.ts` |
| E2E móvil y escritorio | `e2e/coach-workflow.spec.ts`, `e2e/coach-methods.spec.ts`, `e2e/template-rollout.spec.ts`, `e2e/prescribed-weights.spec.ts` |

**Qué cubre la integración:**
- Copiar entre alumnos y dentro del mismo alumno, plantilla → cliente.
- Reintento idempotente y conflicto 409.
- Versión congelada con entrenamiento abierto.
- Permisos y otra organización, ejercicio privado.
- Sala del gimnasio.
- Load Set de punta a punta con etiqueta en el historial y progresión propia en Training Intelligence.
- Alta, cambio y archivo de tipos, nombres inválidos, privacidad, tabla ausente.
- Actualización desde la plantilla:
  - Comparación con personalizaciones.
  - Elegir la plantilla en un conflicto.
  - Idempotencia y huellas.
  - Permisos.
  - Entrenamiento abierto con «Aplicar ahora».
  - Historial intacto.

**E2E.** Se probó en Chromium con emulación de teléfono (Pixel 7) y escritorio, en tema claro y oscuro. No se probó en teléfonos físicos.

## 9. Limitaciones

- Orden dentro de un día en la actualización desde plantilla: solo se reordena lo común. Lo propio del alumno queda en su lugar.
- Días: se alinean por posición. Si la plantilla inserta un día en el medio, se ve como «día renombrado + día nuevo» y el profe revisa la comparación.
- Gimnasio: no tiene plantillas, así que no tiene actualización masiva.
- Tipos personalizados: no se comparten dentro del equipo. Cada profe tiene los suyos, por diseño.
