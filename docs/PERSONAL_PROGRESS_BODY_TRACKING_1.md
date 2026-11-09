# REPI — Personal Progress & Body Tracking 1.0 + Product Updates & Trainer UX

**Bloque:** posterior a la serie 01/06–06/06. **Estado: PUBLICADO Y VERIFICADO en producción el 06/11/2026** (`fe469cb`; 0046 aplicada; calorías, fotos y novedades encendidas). Detalle de la publicación y del smoke en docs/continuidad/PROXIMA_SESION.md.
**Decisiones:** D199 (progreso, peso y calorías), D200 (fotos privadas), D201 (corrección de Urko), D202 (novedades de REPI), D203 (edad desconocida no es adulta, §6.1) y D204 (tope de Storage y respaldo en partes, §8.5).
**Rama:** `feat/repi-personal-progress-1`, creada desde `main` `8f158b1`.
**Migración:** `0046_personal_progress` (aditiva), aplicada en producción el 06/11/2026 con `hosted-0046.sql`, después del respaldo verificado `backup-20261106-012447-42143409784`.

## 1. Objetivo

Que cada alumno entienda su evolución:

- fuerza, cargas y repeticiones por ejercicio;
- peso corporal y objetivo;
- gasto estimado por entrenamiento;
- fotos privadas para comparar.

Además:

- que todas las personas se enteren de las novedades del producto en la campanita que ya existe;
- que el panel de reemplazos del entrenador se cierre al guardar (Urko).

Este bloque **no es Body Intelligence**. No hay IA ni análisis de fotos. No estima grasa ni da diagnósticos o dietas.

## 2. Requerimientos y estado

| Origen | Requerimiento | Estado |
| --- | --- | --- |
| Gian | Gráficos de fuerza, cargas y repeticiones por ejercicio | Hecho (§5). Interruptor `progress`, encendido |
| Gian | Peso inicial, actual y objetivo, más su gráfico | Hecho (§6). Interruptor `body_weight`, encendido |
| Gian | Calorías estimadas por entrenamiento | Hecho (§7). Interruptor `calories`, **apagado** hasta que el titular valide la metodología |
| Gian | Fotos privadas y comparación | Hecho (§8). Interruptor `progress_photos`, **apagado** hasta el control de permisos en producción |
| Fundador | Novedades por rol en la campanita, sin desplegar | Hecho (§9). Interruptor `announcements`, **apagado** hasta el control en producción |
| Urko | El panel de reemplazos se cierra al guardar y no queda abierto en otro contexto | Hecho (§10). Sin interruptor: es una corrección |

Los interruptores siguen `docs/FEATURE_FLAGS.md`. Un módulo apagado no se muestra y su API responde 404. Encender uno es un cambio de variable más un redeploy, sin tocar código.

## 3. Arquitectura

Reutiliza lo existente. No hay un segundo historial, ni otro motor de récords, ni otra campanita, ni otro almacenamiento.

**Gráficos**
- Se leen de `set_log` y `workout_session` (y de `history_entry`, lo importado), siempre en el servidor.
- Usan las mismas reglas de volumen, 1RM, series y etapas que el resto de REPI: `bestE1rm`, `volumeKg`, `timedPeIds` y `rowFlags`.

**Peso y objetivo**
- Dos tablas nuevas, sólo de su dueño.

**Calorías**
- Se calculan al leer, con funciones puras (`estimateCalories`). No se guardan.

**Fotos**
- `media_object` con `purpose = 'progress_photo'` en el bucket privado existente, más una tabla `progress_photo` que lo referencia.
- Se entregan desde el servidor, nunca desde el bucket.

**Novedades**
- Una tabla de anuncios más una de lecturas.
- El alumno las ve dentro de `myNotifications`. Coach y gimnasio, en «Novedades de REPI», con la misma fuente y la misma lectura.

**Urko**
- Estado del panel con alcance (`useSubsPanel`) en `ApprovedSubs.tsx`. Lo usan los dos constructores.

**Código**

- Dominio (puro, probado): `packages/domain/src/progress.ts` (rangos, peso, objetivo, calorías y novedades) e `image.ts` (tipo real, dimensiones y quitar metadatos).
- Servidor: `src/server/progress/{exercises,body,calories,photos}.ts` y `src/server/announcements/services.ts`. En `notifications/feed.ts` se agregaron las novedades.
- API:
  - `/api/me/progress/[[...path]]`
  - `/api/me/photo-file/[id]`
  - `/api/announcements`
  - `/api/admin/announcements/*`
- Interfaz:
  - `components/member/{ProgressChart,ProgressTraining,BodyWeight,ProgressPhotos,SessionCalories}.tsx`
  - `components/announcements/RepiNews.tsx`
  - `components/admin/AdminAnnouncements.tsx`
  - Cambios en `MemberApp.tsx`, `History.tsx`, `Workout.tsx`, `CoachApp.tsx`, `GymApp.tsx`, `AdminApp.tsx`, `ApprovedSubs.tsx`, `ProgramBuilder.tsx` y `Members.tsx`.

**Navegación**
- Progreso tiene cuatro secciones: Entrenamiento · Mi cuerpo · Fotos · Historial. Lo que ya existía (volumen semanal, nivel, objetivos del coach, «Antes de REPI», informe) sigue en Entrenamiento; el historial tiene su sección.
- «Nuevo» aparece en Mi cuerpo y Fotos. Se va al abrir la sección (se guarda en `user_pref.hints`) y desaparece para todos el 31/01/2027.

## 4. Modelo de datos (0046)

| Tabla | Para qué | Claves y restricciones | Borrado |
| --- | --- | --- | --- |
| `body_weight_entry` | Una medición de peso | `user_id` FK (cascade); **único** (`user_id`, `measured_on`); peso en gramos entre 20.000 y 400.000; fecha AAAA-MM-DD; `source` sólo `manual` por ahora | La persona la borra (definitivo); también con la cuenta |
| `body_goal` | Objetivo vigente (uno por persona) | PK `user_id`; meta en rango; punto de partida manual con fecha o `first_entry`; `revision` | Se quita a pedido; con la cuenta |
| `progress_photo` | Foto privada | `user_id` FK (cascade); `media_id` **único** con FK a `media_object` (así la purga D196 la reconoce); categoría opcional (frente, perfil, espalda, otra); ancho y alto | Referencia y archivo (§8.4) |
| `product_announcement` | Novedad del producto | Tipo, título, resumen, botón y destino (lista cerrada), `audience text[]`, estado borrador/publicada/archivada, `publish_at` obligatorio si no es borrador, `revision` y autoría | Archivar (no se borra) |
| `announcement_read` | Lectura por persona | PK (`announcement_id`, `user_id`), FK con cascade | Con la cuenta o la novedad |

**Otros cambios**
- `media_object.purpose` suma `progress_photo`. Es texto sin restricción en la base, así que no hay `ALTER`.
- `user_pref.hints` suma las claves `new_progress_body` y `new_progress_photos` (lista blanca en el servidor).

**Acceso y respaldos**
- RLS está activado en las cinco tablas. `repi_app` es el dueño y `anon`/`authenticated` no tienen permisos (verificado en el ensayo).
- Toda la autorización está en los servicios, como en el resto de REPI.
- Los respaldos copian todas las tablas de `public` y todos los archivos vigentes de `media_object`, así que no hace falta ningún cambio para incluirlas.

## 5. Gráficos de entrenamiento (D199)

**Resumen del período** (30 días, 90 días, 6 meses, 1 año o todo):
- Sesiones, series, repeticiones, volumen y minutos activos.
- Sesiones por semana, desde la semana de la primera sesión del período: no se cuentan semanas antes de empezar.
- Las mejores marcas del período.

**Desde la primera sesión:**
- Se muestran el resumen y «Tus primeras marcas».
- El gráfico muestra un solo punto, sin línea. Aparece el texto: «Ya tenés tu primer registro. Seguí entrenando para comparar cómo evolucionás.»

**Evolución por ejercicio:**
- Búsqueda en el servidor, paginada de a 40.
- El ejercicio inicial es el más entrenado del período.

**Métricas separadas**, cada una con su explicación:
- Con carga: 1RM estimado (Epley, de 1 a 12 repeticiones), carga máxima, repeticiones con la carga máxima y volumen.
- Peso corporal sin carga: repeticiones. **No se cuenta como 0 kg.**
- Por tiempo: segundos.
- La ayuda del volumen dice explícitamente que más volumen puede ser más series y no más fuerza.

**Récords**
- Sólo si hay historia previa del mismo ejercicio y se supera la mejor marca de **todo** el historial anterior, no sólo la del rango.
- La primera sesión es «primera marca», no un récord.
- FSA1 (09/11/2026): con carga, 1RM estimado contra 1RM estimado y carga máxima contra carga máxima; una sesión sólo con series de más de 12 repeticiones se compara por su carga (nunca una carga contra un 1RM).
- En el gráfico el récord es un rombo; no se distingue sólo por el color.

**Integridad**
- Lo anulado no cuenta: series y sesiones (D195).
- Lo corregido cuenta con su valor vigente. Se recalcula al leer y no se reescribe ningún registro.
- Aproximaciones, series por tiempo y AMRAP en rondas quedan fuera del volumen, del 1RM y de las repeticiones.
- Las etapas de un drop no cuentan como series nuevas, pero sus kilos sí suman al volumen (regla vigente de `metrics.ts`).
- Un reemplazo se registra con el ejercicio que se hizo de verdad.
- El historial importado aparece como «Importado», sin sesión de origen.

**Gráfico (`ProgressChart`)**
- SVG propio: no hay librería nueva, así que suma 0 KB de dependencias.
- El eje X es el tiempo real: los días sin entrenar son espacio, no puntos.
- La línea es fina y la leyenda dice: «La línea une tus registros: entre ellos no hay datos.»
- Tocar, hacer clic o recorrer con Tab o las flechas muestra el dato exacto, la mejor serie, las series, el volumen y «Ver el entrenamiento».
- «Ver todos los registros» es la vista de tabla.
- kg/lb según la preferencia: se guarda en kg y se muestra en la unidad elegida.

**Rendimiento (medido)**
- Base de desarrollo con 28.925 series: < 1 ms por consulta.
- Persona sintética con 900 sesiones y 18.000 series, en una base descartable: 24 ms por ejercicio y 40 ms para la lista de ejercicios.
- Usa los índices existentes (`workout_session_user_idx` y `set_log_unique`, que empieza por `session_id`), así que **no hace falta un índice nuevo**.
- Se leen como máximo las últimas 5.000 series de un ejercicio, y la interfaz lo avisa.
- El navegador nunca recibe el historial completo.

## 6. Peso corporal y objetivo (D199)

**Medición**
- Peso y fecha (no futura). Se guarda en gramos, así que kg y lb son exactos: 80,4 kg = 80.400 g; 176,4 lb = 80.014 g.
- **Una medición por día**: guardar otra ese día la **reemplaza** y la app lo dice.
  - Doble toque o reintento: es la misma fila («Esa medición ya estaba guardada»).
  - Al editar, mover la fecha a un día que ya tiene medición responde 409.
- Se puede editar y eliminar (definitivo).

**Objetivo**
- Meta y fecha objetivo opcional.
- El punto de partida es la primera medición o uno histórico indicado por la persona. Se guarda la procedencia («indicado por vos»).

**Progreso hacia la meta (`bodyGoalProgress`)**
- Distingue el **cambio de peso** del **recorrido hacia la meta**.
- Bajada o subida: «8 kg de cambio buscado · 4 kg recorridos · 50 % del recorrido hacia la meta».
- 100 % sólo al llegar. Si se superó la meta, lo dice («la pasaste por 1 kg»).
- Retroceso: nunca un porcentaje negativo. Dice cuánto se alejó, en sentido contrario.
- Meta a menos de 500 g del inicio: es **mantenimiento**. Se muestra una banda de ±1,5 % (mínimo 1 kg), sin porcentaje.
- Sin datos: explica qué falta.
- Cambiar la meta recalcula sin tocar las mediciones.

**Gráfico**
- Muestra mediciones reales, la línea de objetivo punteada y rotulada, el primer y el último valor, la variación neta y los filtros de período.

**Privacidad**
- Sólo la persona lee y escribe. Coach, gimnasio, dueño, gerencia, otros alumnos y REPI Admin no tienen ninguna ruta.
- Un id ajeno responde 404.
- No aparece en comunidad ni en rankings.
- El consentimiento existente «medidas corporales» (D117) sigue sin ofrecerse (módulo `body` apagado) y **no da acceso** a esto.

**Menores de 18:** no se ofrece. La app lo explica y la API responde 403. Hace falta una política con el adulto responsable (§15).

### 6.1 Elegibilidad por edad (D203)

Peso corporal, objetivo, fotos de progreso y calorías son **sólo para adultos confirmados**. La elegibilidad tiene tres estados (`ageEligibility`):

| Estado | Cuándo | Peso, objetivo y fotos | Calorías |
| --- | --- | --- | --- |
| Adulta | Fecha de nacimiento registrada y 18 años o más | Sí | Sí, si hay peso |
| Menor | Fecha registrada y menos de 18 (menos de 13 también) | No: 403 `minor_restricted`, aun con autorización del adulto responsable (la política vigente no contempla datos corporales) | No |
| Desconocida | Sin fecha (opcional en algunos registros) o con una fecha inválida | No: 403 `age_required`; la app ofrece confirmar la fecha | No (`age_unknown`) |

**Nunca se supone adulta una cuenta sin fecha.**

**Confirmar la fecha** (`POST /api/me/birth-date`, `declareBirthDate`):
- Es la misma declaración que pide el registro, con el mismo validador. La persona la confirma (casilla «Es mi fecha real…»).
- Se hace **una sola vez**: sólo se guarda si la cuenta no tiene fecha (`where birth_date is null`). Una fecha existente no se reemplaza desde la app; un error se corrige por soporte. Así una menor no puede «volverse» adulta cambiándola.
- Una fecha de menor activa los mecanismos existentes: `minorWithoutGuardian`, el pedido de autorización al adulto responsable y `MINOR_RESTRICTED`.
- Auditoría `account.birth_date_declared` con la elegibilidad resultante, nunca la fecha. Límite de 5 pedidos por minuto.

**Lo que no se bloquea:** entrenar, el historial, los gráficos de entrenamiento y todo lo demás. Una persona siempre puede ver y borrar sus propias mediciones y fotos.

**Demos:** las personas de la demo son adultas ficticias con fecha registrada (1994-06-15).

**Sin conexión**
- No se guarda a medias: se ve y se guarda con conexión, y la app lo dice.
- «Guardado» aparece sólo cuando el servidor lo confirmó.

## 7. Calorías estimadas (D199)

**Fuente**
- Compendium of Physical Activities: Ainsworth et al., 2011; actualización para adultos de Herrmann et al., 2024.
- Método MET: 1 MET ≈ 1 kcal por kg y por hora.

**Fórmula**
- kcal ≈ MET × peso (kg) × horas activas, como **rango** [MET bajo, MET alto].
- Se redondea hacia abajo y hacia arriba a 10 kcal.
- Nunca se muestra un valor exacto como «437,82 kcal».

**MET usados**

| Actividad | Rango | Con RPE ≤ 5 | Con RPE 6–7 | Con RPE ≥ 8 |
| --- | --- | --- | --- | --- |
| Musculación (varios ejercicios, 8–15 reps, cargas variadas → esfuerzo vigoroso) | 3,5–6,0 | 3,5–4,3 | 3,5–5,0 | 5,0–6,0 |
| Cardio sin velocidad ni potencia (caminata o bici suave → trote o remo exigente) | 3,5–10,0 | 3,5–5,0 | 5,0–7,0 | 7,0–10,0 |

**Supuestos**
- El tiempo activo de REPI ya descuenta las pausas e incluye los descansos entre series, igual que las sesiones que mide el Compendium.
- Cardio = segundos registrados en series por tiempo de ejercicios del grupo «Cardio». El resto es musculación.
- Una sesión mixta suma cada parte con su MET.
- El RPE de la sesión, si existe, achica el rango. Si falta, no se inventa.
- El peso es el registrado ese día o hasta 60 días antes. Un peso cargado **después** no cambia una sesión pasada, así que el resultado es reproducible. Si se corrige una medición anterior, el valor cambia con ella.

**No se estima cuando:**
- falta el peso (se ofrece «Registrar mi peso» y no se usa ningún peso oculto);
- la sesión dura menos de 5 minutos o más de 4 horas (atípica: probablemente quedó abierta);
- la sesión está anulada;
- la persona es **menor de 18** (los MET de adultos no valen para menores), o su edad es **desconocida** (§6.1);
- no hay base para calcularla por serie o por ejercicio. No se usan series, tonelaje ni frecuencia cardíaca.

**Incertidumbre**
- Es el gasto **total** de ese tiempo (incluye el basal), no el adicional.
- La variación individual frente a una calorimetría es de ±20–30 %, o más con poca masa muscular o con descansos muy largos.
- El rango lo refleja sólo en parte. La interfaz lo dice: «Puede diferir bastante de tu gasto real».

**Seguridad sanitaria**
- No hay déficits, compensaciones con comida, juicios sobre el cuerpo ni alertas para adelgazar.
- El texto dice: «no sirve para calcular comidas».

**Dónde aparece:** en el resumen al terminar (con conexión) y en el detalle de la sesión del historial.

## 8. Fotos de progreso privadas (D200)

### 8.1 Experiencia

- Subir, con fecha y categoría opcional (frente, perfil, espalda u otra). Es una etiqueta para ordenar, no un resultado de IA, y no hace falta subir todos los ángulos.
- Galería cronológica: abrir, editar fecha o categoría, descargar y eliminar.
- **Comparador:**
  - lado a lado, con fechas;
  - deslizador, con arrastre, toque y teclado (es un `input range` accesible).
- `object-fit: contain`: no se deforma, no se recorta y no se modifica.

### 8.2 Privacidad (requisito bloqueante, probado)

**Sólo la dueña o el dueño.** Responden **404**, verificado en las pruebas de integración y E2E:
- coach, equipo de sala, gerencia y dueño del gimnasio;
- otro alumno y otra organización;
- sin sesión: 401.

**Por toda vía:**
- `/api/me/photo-file/:id`;
- `/api/media/:mediaId`: `authorizeVideo` corta `progress_photo` a quien no es dueño, antes de cualquier otra regla;
- editar y borrar.

**Agujero cerrado en este bloque:** un pedido al coach (`createRequest`) o una tarea del gimnasio (`createMemberTask`) aceptaban **cualquier** archivo propio por id. Una foto adjuntada así habría quedado visible para el coach o la sala. Ahora sólo aceptan `request_video`.

**No aparecen nunca en:**
- comunidad, Club, perfil público, rankings ni mensajería;
- notificaciones ni informes del coach o del gimnasio;
- la exportación de otras personas.

**Sin miniaturas públicas ni URL del bucket**
- La clave es `progress/<usuario>/<uuid>`: no deriva de la fecha ni del contenido.
- Se entrega desde el servidor con la sesión, con `private, no-store`, `nosniff` y `same-origin`.

**Sin IA:** no se envían a proveedores, no hay reconocimiento facial ni biometría.

### 8.3 Subida segura

1. **En el teléfono**
   - Se achica a ≤ 2048 px por lado y se re-codifica en JPEG con canvas. Eso descarta EXIF y ubicación.
   - La orientación queda aplicada a la imagen.
2. **En el servidor**
   - Valida el **tipo real** por contenido. Si el MIME declarado no coincide, se rechaza.
   - Tamaño ≤ 3 MB (bajo el límite de 4,5 MB de Vercel).
   - Dimensiones entre 200 y 6000 px por lado.
3. **Quitar metadatos**
   - `stripImageMetadata` quita EXIF con GPS, XMP, IPTC y comentarios.
   - JPEG: APP1–APP15 salvo ICC, y COM. También entre cuadros progresivos; lo anexado después del fin de la imagen (imágenes secundarias MPF, anexos del fabricante) se descarta (FSA1). PNG: tEXt, zTXt, iTXt, eXIf y tIME. WebP: EXIF y XMP, más sus marcas.
   - No toca los píxeles. Se vuelve a validar después.
4. **Guardado**
   - Se guarda en el bucket privado y se **verifica** el tamaño escrito.
   - Recién entonces se crean `media_object` y `progress_photo` en una transacción. Si la base falla, se borra el archivo.
5. **Confirmación:** la app muestra la foto sólo cuando el servidor lo confirmó. Sin conexión no se sube.
6. **Límites:** 200 fotos por persona y 30 por día.

### 8.4 Eliminación y purga

- **Orden:**
  1. Se borra la referencia en una transacción, con auditoría sin contenido (`progress_photo.deleted`).
  2. Se borra el archivo.
  3. Se marca `media_object.deleted_at`.
- **Si Storage falla:** la foto ya no se ve para nadie y el archivo queda sin referencia. La **purga diaria** lo encuentra como huérfano a las 24 h y lo borra (reintento).
- **Regresión del incidente del Club (D196):**
  - `progress_photo.media_id` está en `KNOWN_MEDIA_REFERENCES`.
  - La FK hace que la purga, que lee las referencias del catálogo, **nunca** borre una foto vigente.
  - Probado con fotos de más de 24 h: la purga conserva la vigente y limpia sólo la desreferenciada.

### 8.5 Exportación, eliminación de cuenta, respaldos y costos

**Exportación (`/api/me/export`):** incluye el peso (kg), el objetivo y la **lista** de fotos (fecha, categoría y tamaño). Cada foto se descarga desde Progreso › Fotos, igual que el resto de los archivos (D75).

**Eliminación de cuenta (`docs/PRIVACIDAD_OPERACION.md`):**
- Borrar el usuario elimina en cascada mediciones, objetivo, fotos y lecturas.
- Los archivos se borran del bucket con las claves de `media_object` listadas **antes**. Es el procedimiento vigente y ahora incluye `progress/`.

**Respaldos**
- Entran solas: el respaldo copia todo `media_object` vigente. Se restauran con el resto.
- **Tamaño (LB-11, resuelto 06/11):** GitHub admite hasta 2 GiB por archivo de Release. Por encima de 1900 MiB el respaldo cifrado se publica en partes con SHA-256 propio, y se unen y verifican al bajar (docs/RESPALDOS.md). La autoprueba de cada PR ensaya la cadena en partes, la restauración y el rechazo de una parte alterada o faltante.

**Supabase Free y tope de Storage (D204)**
- Storage de 1 GB (medido el 06/11: 1 archivo, 74.565 bytes; base de 29,7 MB de 500 MB).
- Las subidas se rechazan, con un mensaje claro, cuando los archivos vigentes llegan a **800 MB** (`REPI_STORAGE_BUDGET_BYTES`) o una persona llega a **150 MB** de fotos. Lo ya guardado no se toca y no se genera ningún gasto.
- Con fotos de ~0,4–0,8 MB (el teléfono las achica a 2048 px) entran unas 1.000–2.000 fotos en total.
- Para crecer: plan Pro de Supabase (100 GB) y subir `REPI_STORAGE_BUDGET_BYTES`. **Es una decisión de gasto del titular; no se contrató nada.**
- Seguimiento: `select sum(size_bytes) from media_object where deleted_at is null`. Al llegar al tope queda en los logs `storage_budget_reached`.

## 9. Novedades de REPI (D202)

**Campanita del alumno**
- Las novedades entran en `myNotifications` con el sello **REPI** y el texto del botón («Ver mi progreso →»).
- Tocar abre el **destino exacto**: por ejemplo Progreso › Mi cuerpo, no el inicio.

**Coach y gimnasio**
- «Novedades de REPI» en el menú, con su número sin leer.
- Abrir la pantalla las marca leídas.
- Los botones llevan a Programas, Clientes, Socios o Equipamiento.

**Audiencias**
- Opciones: todas las personas, alumnos y socios, entrenadores independientes, equipo de sala, dueños y gerentes, y REPI Admin.
- Se resuelven en el **servidor** con los roles reales. En el gimnasio, sólo los de esa organización.
- Una persona con varios roles la lee **una vez**: `announcement_read` es por persona y anuncio, y leer en un lugar la marca leída en todos.
- Un alumno nunca recibe una de coach ni de gestión. El panel del gimnasio no las muestra a un socio.

**Lectura**
- Por anuncio y persona. Abrir la campanita marca leídas sólo las **publicadas y visibles**.
- Una programada no aparece ni se marca antes de su fecha.
- Las demás notificaciones siguen igual: siguen usando `notificationsSeenAt`.

**REPI Admin (con 2FA)**
- Crear y editar borradores, con vista previa y validación en vivo.
- Audiencia y destino de una **lista cerrada**, coherente con la audiencia.
- Texto plano: **sin HTML ni enlaces**.
- Publicar ahora o programar (hasta 90 días), volver a borrador, archivar y ver las lecturas.
- Editar una publicada conserva el id: no crea otro aviso ni vuelve a figurar como nueva.
- Publicar dos veces es idempotente, y la concurrencia se controla con `revision`.
- Todo deja auditoría: alta, edición, publicación o programación, archivo.
- Con el módulo apagado se pueden preparar borradores, pero no publicar.

**Push:** no hay push en 1.0, a propósito: no hay pushes masivos por cada anuncio.

**Historial:** la campanita muestra las de los últimos 60 días. La pantalla de coach y gimnasio, hasta 50.

## 10. Corrección de Urko (D201)

**Problema**
- `ApprovedSubs` no se cerraba al agregar.
- El estado `subsFor` era `índice:ejercicio`, así que podía quedar abierto en otro programa, alumno o día si coincidía el índice.

**Solución**
- `useSubsPanel(scope)`: el panel es de un alcance.
  - Constructor del coach: organización, programa y día.
  - Constructor del gimnasio: organización, socio y día.
- Si el alcance cambia, el panel **no se muestra** (la lectura lo ignora) y el efecto limpia el estado.
- **Al guardar con éxito** (confirmado por el servidor): el panel se cierra, aparece la confirmación («… aprobado como reemplazo de …. Los programas no cambian.») y el contador se actualiza.
- **Ante un error:** el panel queda abierto, con la búsqueda y la indicación escritas, el error y «Podés reintentar».
- **Doble toque:** un solo pedido.
- **Reintento después de un alta que sí llegó** (409 «duplicate»): se trae la lista real y se cierra. No se duplica.
- La semántica no cambia: es una alternativa de la organización y no modifica programas.

**Alcance:** los dos editores que usan `ApprovedSubs`, `ProgramBuilder` (coach) y `Members` (gimnasio).

## 11. Matriz de permisos

| Recurso | Alumno dueño | Coach | Dueño o gerente | Otro alumno | REPI Admin |
| --- | --- | --- | --- | --- | --- |
| Gráficos de sus entrenamientos | Sí | Sin cambios (sus pantallas existentes, según la relación y el permiso de entrenamientos) | Sin cambios | No (404) | Sin ruta nueva |
| Peso corporal y objetivo | Sí (adulta confirmada, §6.1) | No (404) | No (404) | No (404) | Sin ruta de lectura |
| Fotos de progreso | Sí (subir: adulta confirmada; ver y borrar las propias: siempre) | No (404, también por `/api/media`) | No (404) | No (404) | Sin ruta de lectura |
| Calorías de una sesión | Sí (adulta confirmada, §6.1) | No (404) | No (404) | No (404) | Sin ruta |
| Novedades | Según audiencia | Según audiencia (rol de coach) | Según audiencia (rol en esa organización) | Según audiencia | Administra (2FA) |
| Crear o publicar novedades | No (404) | No (404) | No (404) | No (404) | Sí |

No se ampliaron permisos de `anon`/`authenticated`, ni RLS, ni roles.

## 12. Pruebas

**Dominio** (`packages/domain`)
- `progress.test.ts` (22): rangos; kg/lb; bajada, subida, mantenimiento, retroceso, meta superada, 99/100 %, datos insuficientes y cambio de meta; calorías sin peso, con peso, musculación, cardio, mixta, anulada, duración inválida, menores y extremos; novedades (HTML, enlaces, destino por audiencia, varios roles).
- `image.test.ts` (6): tipo real, MIME falsificado, JPEG/PNG/WebP sin metadatos, estructura inválida.

**Integración** (`apps/web`)
- `personal-progress.test.ts` (19):
  - gráficos: primera sesión, varias, récords contra todo el historial, anuladas, corregidas, sin carga, por tiempo, búsqueda, otro usuario;
  - peso: alta, mismo día, edición, eliminación, objetivos y menores;
  - calorías: peso histórico reproducible, mixta, anulada, ajeno;
  - fotos: subida, GPS quitado en el archivo guardado, inválidas, coach, sala, gerencia, dueño, otro alumno, adjuntos, eliminación, purga, exportación, menores, módulo apagado;
  - novedades: borrador, publicación, audiencia, varios roles, lectura, edición sin duplicar, programada, archivada, permisos de Admin, validación, módulo apagado y notificaciones existentes.
- `urko-subs-panel.test.ts` (5).

**E2E** (`e2e/personal-progress.spec.ts`, 5 escenarios × teléfono Pixel 7 y escritorio): Progreso, Mi cuerpo, fotos con comparador por teclado y accesos ajenos, novedad en la campanita con destino exacto, y Urko (cierre, error con reintento, cambio de día). Todos con axe (sin violaciones serias) y sin scroll horizontal.

**Ensayo de 0046:** `scripts/operations/verify-0046.sh`.

**Resultados (06/11/2026, aislado):**

| Suite | Resultado |
| --- | --- |
| Typecheck | OK |
| Build | OK |
| Dominio | 399/399 |
| Guardas | 24/24 |
| Integración | 432/432 (65 archivos) |
| E2E completa | 127 pasaron, 0 fallaron, 29 omitidas por diseño |
| Ensayo de 0046 | OK |

Detalle en `docs/continuidad/PROXIMA_SESION.md`.

## 13. Costos

**Base**
- Unas filas por medición y por novedad: despreciable.
- Las consultas usan índices existentes (§5).

**Storage y respaldos:** ver §8.5. Es el único costo que crece de verdad. Plan Pro de Supabase cuando las fotos se abran a todos, y respaldo en dos archivos.

**Cómputo**
- Las fotos pasan por la función (≤ 3 MB) una vez al subir y una vez por vista (`no-store`).
- Con galerías grandes conviene medir el egress de Supabase (Free: 5 GB por mes).

**Bundle:** sin dependencias nuevas. Los componentes nuevos suman ~67 KB de código fuente antes de minificar y se cargan con la app del alumno.

## 14. Publicación (con autorización del titular)

1. **Revisión y CI:** revisar e integrar el PR con CI en verde.
2. **Respaldo:** issue «Respaldo: antes de 0046». Esperar el workflow en verde, la Release verificada y la restauración probada (`docs/RESPALDOS.md`).
3. **Aplicar 0046:** `scripts/operations/hosted-0046.sql` en el editor SQL de Supabase. Es una transacción, como `repi_app`. Verificar:
   - 47 migraciones, la última con el hash del archivo;
   - 5 tablas con RLS y dueño `repi_app`;
   - sin permisos para `anon`.
4. **Deploy:** **aplicar 0046 antes** de que el deploy llegue a producción. Si el código llegara antes:
   - Progreso › Mi cuerpo respondería error;
   - la purga diaria **no borraría nada**: falta la referencia conocida `progress_photo.media_id` y se detiene a propósito (D196). Es una falla segura, pero sin purga.

   Con los interruptores apagados, las novedades y las fotos no consultan sus tablas.
5. **Smoke con demos:**
   - Progreso (gráfico y primera sesión);
   - Mi cuerpo (registrar, mismo día, objetivo);
   - Urko en el constructor de coach y de gimnasio;
   - 404 a lo ajeno.
6. **Encender, de a uno**, con `NEXT_PUBLIC_REPI_FEATURES` más un redeploy:
   - `calories`, cuando el titular apruebe §7;
   - `announcements`: publicar primero una novedad de prueba sólo para «REPI Admin» y verificar;
   - `progress_photos`, después del control de permisos en producción con dos cuentas demo y de resolver LB-11 si corresponde.

## 15. Riesgos y pendientes reales

| Riesgo | Impacto | Mitigación o decisión pendiente |
| --- | --- | --- |
| Respaldo único > 2 GiB con muchas fotos | El respaldo diario fallaría | Resuelto: respaldo en partes (LB-11, 06/11) |
| Storage Free de 1 GB | Subidas rechazadas al llegar al tope | Tope de 800 MB y 150 MB por persona (D204); para crecer, plan Pro: decisión de gasto del titular |
| Calorías: precisión individual limitada | Expectativas | Rango, texto explícito y «Cómo se calcula»; sin peso o sin edad confirmada no se estima |
| Menores: sin peso, fotos ni calorías | Funcionalidad parcial para ese grupo | Política con el adulto responsable (decisión del titular y legal) |
| Fecha de nacimiento autodeclarada (D203) | Un adulto puede mentir sobre su edad, como en el registro | Igual que el registro vigente; no se puede cambiar desde la app una vez guardada. Verificación documental fuera de alcance |
| El consentimiento «medidas o fotos» para el coach existe en el dominio | Si alguien enciende `body`, el coach vería una pestaña vacía | No da acceso a estas tablas; compartir con el coach queda para un bloque con consentimiento granular propio |
| Verificado sólo en Chromium, no en iPhone real (no hay WebKit acá) | Detalles de Safari: `createImageBitmap` y fecha | En Safari, si falla la re-codificación se sube el original y el servidor igual quita los metadatos. Probar en iPhone (lista de teléfonos del 06/06) |
| `tests/gym.test.ts` «métricas desde eventos reales» intermitente (06/06) | Ruido en CI | Ver PROXIMA_SESION: no se cambió la expectativa |

## 16. Reversión

- **Código:** promover en Vercel el deploy anterior. El código anterior no lee nada de 0046: las tablas pueden quedar.
- **Base, sólo si se abandona el bloque:** `scripts/rollback/0046_personal_progress.down.sql`.
  - Se **niega** si hay mediciones, objetivos, fotos o novedades publicadas: no se borra nada de personas sin decisión.
  - Los archivos de fotos se listan y se borran aparte.
  - Ensayado en `verify-0046.sh`.
- **Módulos:** apagar un interruptor oculta el módulo y su API (404) sin borrar datos.
