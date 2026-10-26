# REPI — Prompt adicional: acceso, altas y facturación

26/10/2026 · Incorporación al desarrollo en curso · Concepto 2 aprobado.

Incorporá estas decisiones al proyecto que ya estás desarrollando. Leé primero este anexo, el `MASTER_PROMPT.md` de raíz, las instrucciones aplicables y el estado actual del repositorio. Este anexo actualiza exclusivamente las reglas de acceso, alta y modelo comercial indicadas aquí; conservá el resto del alcance y las funcionalidades del handoff más reciente. Las decisiones humanas expresas de este anexo prevalecen sobre prototipos, precios de ejemplo y definiciones anteriores incompatibles.

Adaptá la implementación existente por etapas verificables. Respetá cambios concurrentes, datos, cuentas e historial. No reinicies el proyecto ni sustituyas el proveedor de autenticación por comodidad. No recuperes el handoff anterior retirado como fuente vigente. Conservá Concepto 2, componentes, tipografía y comportamiento responsive. Las pantallas nuevas deben extender ese sistema.

Este documento define trabajo por realizar: no afirma que estos cambios ya estén implementados ni probados.

## 1. Decisiones humanas confirmadas

- El acceso a Repi es cerrado por relación: los socios deben pertenecer a un gimnasio cliente y los alumnos a un entrenador cliente. Staff y administradores tienen sus propios vínculos y permisos. Verificar una identidad no habilita por sí solo a usar el producto.
- Repi Admin da de alta al gimnasio o entrenador independiente después de acordar y aceptar ambas partes las condiciones comerciales. El responsable recibe una invitación de bienvenida para activar su cuenta; no se envían contraseñas creadas por Admin.
- El precio por socio o alumno es negociable por cliente y modificable desde Repi Admin. No fijar universalmente los importes ni los tramos de las demos.
- **Gym: se factura por todos los socios del gimnasio incluidos en el acuerdo, aunque no creen una cuenta, activen Repi o usen la app.** El sistema está disponible para todos esos socios.
- **Coach: se factura por todos sus alumnos vigentes, aunque todavía no hayan activado Repi.** No exigir programa asignado, entrenamiento registrado ni uso para contarlos.
- Para Gym, el administrador de Repi carga el total acordado con el cliente. No exigir importar la información individual de todos los socios. Dejar preparada una integración futura para obtener esa cantidad.
- El gimnasio genera un QR fijo para recepción. Un socio nuevo lo escanea, solicita acceso y un entrenador de piso del turno actual recibe un aviso push para validar y aceptar al socio.
- La misma solicitud aparece desde el inicio en una sección del dashboard de recepción. Recepción puede resolverla si el entrenador no puede; no depende de su celular, batería ni de que haya abierto el aviso.
- Los alumnos de entrenadores independientes se vinculan mediante invitación individual de su entrenador. El gimnasio invita a su equipo con roles y alcance por sede.
- Se conserva una sola identidad por persona, con sus distintas relaciones y roles. Se conserva la separación entre facturación Repi→cliente comercial, cobros manuales del Coach y cuota Gym→socio, que Repi no administra.

## 2. Criterios propuestos para completar el flujo

Las siguientes son recomendaciones de esta especificación, no nuevas decisiones comerciales atribuidas al usuario. Implementá los mecanismos y dejá visibles sus configuraciones; las políticas comerciales pendientes se completan en cada acuerdo antes de activar cobros reales.

- Correo verificado como método principal de identidad; ofrecer inicio por código temporal o enlace seguro reutilizando la autenticación existente. No ofrecer Google/Apple en este flujo inicial ni registro comercial libre. Conservar compatibilidad segura con credenciales ya creadas al migrar; no cambiar contraseñas o invalidar cuentas masivamente sin necesidad.
- Utilizar también para Coach un total de alumnos acordado, cargado por Repi Admin, para poder incluir alumnos aún no registrados. Documentar este origen como propuesta, separada de la decisión confirmada de facturar por todos sus alumnos vigentes.
- Validación humana de identidad y pertenencia por piso o recepción antes de aprobar. El QR, un código compartido, el nombre o un DNI escrito por el solicitante no prueban por sí solos que sea socio.
- Recepción tiene la bandeja siempre disponible; dueño/manager autorizado de la sede puede actuar como respaldo. No hace falta el permiso de ambos: una decisión válida resuelve la solicitud.
- Revisión periódica de los accesos habilitados por parte del gimnasio, con recordatorio mensual propuesto. Esa revisión no suspende automáticamente a socios ni cambia la factura.
- Un alta inicial pendiente por persona y gimnasio a la vez, conservando sede de origen. Propuesta de vencimiento: 24 horas; configurable y visible, con posibilidad de reenviar sin duplicar identidad. Nunca aprobar por haber pasado un plazo.
- Para multisede, propuesta conservadora: una relación por organización con sedes habilitadas explícitas. La aprobación inicial habilita la sede validada. Ampliar a otra sede requiere validación de alguien autorizado allí; no surge automáticamente de escanear otro QR. Registrar solicitudes de ampliación separadas, sin duplicar la relación y con una pendiente por persona/organización/sede destino. Un permiso para toda la organización debe ser explícito y coherente con el acuerdo.
- Aviso adicional configurable a responsables si una solicitud sigue pendiente. Propuesta inicial: a los 5 minutos, una vez; agrupar avisos para evitar spam. Recepción ya la ve desde el primer momento.

## 3. Relevar y adaptar lo que ya existe

En la lectura puntual del repositorio del 26/10 se observaron Next.js, PostgreSQL/Drizzle, Better Auth, módulos de acceso y un service worker propio. Volvé a comprobar el estado al ejecutar: el desarrollo continúa en paralelo. Esa observación no reemplaza pruebas.

Revisá especialmente:

- `apps/web/src/server/access/services.ts`: `createCoachOrganization`, `createGymOrganization`, `memberSignUp`, `listMembershipRequests`, `decideMembershipRequest`, `completeGymConsent` y resolución de espacios.
- `apps/web/src/db/schema.ts`, `packages/domain/src/access.ts`, guards y endpoints que consumen esas funciones.
- `apps/web/src/server/auth.ts`, `apps/web/src/lib/auth-client.ts` y `apps/web/public/sw.js`.
- `docs/DECISIONS.md`: D01–D05, D20, D24–D28 y decisiones sobre turnos; actualizar sólo lo efectivamente resuelto.
- `docs/PRODUCT_INVENTORY.*`, `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_STATUS.md` y `docs/DESIGN_CONTRACT.md`.

La base observada permite crear organizaciones con trial automático de 30 días y usa padrón/DNI para parte del ingreso de socios. Las solicitudes manuales se dirigen a recepción/manager/dueño. Adaptá esos puntos al nuevo modelo: alta comercial autorizada por Admin, solicitud sin padrón obligatorio y aprobación también por piso con turno y sede válidos. No alcanza con ocultar botones; deben cambiar los servicios y permisos del servidor.

El padrón existente puede seguir como dato auxiliar o integración opcional; no debe ser requisito ni atajo de autoaprobación en este flujo humano. No elimines datos previos para lograrlo. Una coincidencia de DNI tampoco debe permitir vincular otra identidad sin validación.

Revisá el alta directa de la biblioteca de autenticación, enlaces mágicos, endpoints antiguos, seeds y rutas de demo. Ninguno puede crear una organización operativa, otorgar roles o saltar la aprobación comercial por un camino alternativo. Los datos DEMO y el buzón DEV deben seguir separados de producción.

## 4. Alta comercial y bienvenida

Desde Repi Admin, permitir crear la ficha comercial Gym/Coach, correo del responsable, datos necesarios del acuerdo, tarifa por unidad, moneda, cantidad acordada, alcance por organización/sedes y vigencias.

Separar estos hitos: borrador del acuerdo, aceptación de las partes registrada, habilitación comercial por Admin, invitación enviada, identidad verificada, configuración pendiente y cliente activo. No confundir el estado del contrato con el estado de la persona ni con la recepción de un email. Una aceptación registrada en Repi aporta trazabilidad; no declararla firma certificada o asesoramiento legal.

Permitir registrar el acuerdo aceptado por fuera de la app con referencia y fecha, y preparar una aceptación dentro de la app si se elige ese circuito. No exigir un proveedor de firma para avanzar. Conservar quién registró cada aceptación y la versión exacta aceptada; un borrador no genera cobros.

La invitación comercial debe tener destinatario, organización y rol definidos por servidor, vencimiento, revocación y consumo de un solo uso. Reenviar debe invalidar el enlace anterior. Un correo distinto no puede apropiarse de la invitación; cambiar responsable requiere una acción autorizada. Si la persona ya tiene cuenta, se incorpora el nuevo espacio sin duplicarla.

Aplicar también la vinculación al destinatario a las invitaciones de alumnos Coach: el entrenador informa el correo del alumno, el alumno verifica ese mismo correo y el servidor valida la coincidencia al aceptar. No mantener enlaces de alumno sin destinatario que cualquier persona pueda canjear. Reenviar un enlace a otra persona no le concede relación; corregir el destinatario exige revocar/reemitir. Conservar vencimiento, revocación, consumo único y aceptación por cuenta existente. Revisar `inviteCoachClient` y `acceptInvitation`, además de la UI.

El formulario público puede ofrecer solicitar contacto comercial; nunca debe otorgar automáticamente un espacio operativo, trial o permisos de dueño. Las pruebas comerciales gratuitas sólo existen si Admin las concede con fechas y condiciones explícitas. No mantener el trial automático como beneficio contractual confirmado.

Admin y dueños conservan 2FA. Preparar políticas de 2FA para los demás roles sensibles con mecanismos de recuperación; no dar facultades de plataforma al dueño de un gimnasio. Recuperar una cuenta no recupera membresías revocadas.

Clientes existentes: diseñar migración y mostrar un listado de contratos/activaciones por regularizar. No asignar precios, facturar retroactivamente ni suspenderlos masivamente por inferencia. Separar cuentas de prueba de clientes reales y requerir una decisión registrada de Admin para su habilitación comercial.

## 5. QR y solicitud del socio

Un responsable autorizado genera y descarga el QR de cada sede. El enlace es un identificador público de esa sede, no una credencial ni una invitación staff. Permitir revocarlo/regenerarlo y registrar el cambio. No requerir códigos diarios ni reescanear para cada entrenamiento. El QR de alta es distinto del carnet, check-in, molinete y QR de enrolamiento de 2FA.

Al abrir el enlace, mostrar gimnasio/sede y ofrecer continuar con la cuenta existente o crear una identidad limitada. Pedir nombre y correo verificable; sólo agregar otros datos si existe una necesidad explícita. No hacer obligatorios DNI, foto del documento, selfie, biometría o ubicación precisa para este flujo. Si el proyecto conserva DNI por otro requisito, aislarlo y conservar su minimización; no publicarlo en avisos.

Verificar el correo antes de enviar la solicitud a los operadores. Crear identidad no equivale a crear membresía. El interesado expresa qué gimnasio/sede quiere vincular y acepta las condiciones aplicables. Permitir recuperar la cuenta o corregir un correo equivocado con nueva verificación; no recomendar crear cuentas duplicadas.

Crear una solicitud persistida con ID, persona verificada, organización, sede, origen QR, fechas, estado e historial. El usuario ve su estado y un texto claro: “Estamos validando tu acceso. El equipo de sala o recepción puede ayudarte”. No mostrar funciones privadas, datos de otros socios o una membresía activa mientras está pendiente.

Si ya tiene vínculo activo y habilitación para esa sede, dirigirlo a su espacio sin nueva solicitud. Si tiene una pendiente para ese alcance, mostrar la misma. Si pertenece a la misma organización pero no tiene esa sede habilitada, tramitar una ampliación de sede y mantener sus accesos actuales; ni el QR ni el selector de espacios amplían permisos. Un alta inicial pendiente no se transforma en autorización para toda la cadena. Si el vínculo fue suspendido o dado de baja, enviarlo a revisión de reactivación: ni reescanear, ni cambiar el enlace, ni reenviar una invitación pueden levantar una baja automáticamente.

El solicitante puede cancelar. Un rechazo informa una razón apta para el usuario y cómo resolverlo con recepción, sin filtrar notas internas. Reintentar debe respetar límites de frecuencia, historial y cualquier suspensión vigente.

## 6. Aprobación desde piso y recepción

Persistir primero la solicitud. Mostrarla inmediatamente en la bandeja compartida del gym/sede y después emitir notificaciones. La bandeja es la fuente de verdad; el push es un aviso.

Destinatarios de piso: sólo entrenadores con membresía staff activa, capacidad de validar socios y turno efectivo en esa sede. No inferir un turno por tener la app abierta. Reutilizar el modelo de turnos: definir intervalo, inicio/cierre y zona horaria de la sede, incluyendo cruces de medianoche. Si aún no está completo, implementá el mínimo persistente necesario e integralo al módulo de turnos existente.

Si hay varios entrenadores de turno, todos los habilitados pueden ver y resolver; agrupar avisos y evitar decisiones duplicadas. Si no hay ninguno, recepción sigue atendiendo sin esperar. Cuando cambia el turno, las solicitudes pendientes quedan disponibles para el siguiente equipo; no se archivan al salir un entrenador. Un aviso recibido durante el turno no autoriza a aprobar fuera de él: volver a verificar al confirmar. Recepción tiene su propia autorización activa por sede y no depende del turno de un entrenador.

Al abrir una solicitud, mostrar nombre, correo verificado, sede, antigüedad y estado, y permitir aprobar/rechazar. Antes de aprobar, el operador debe confirmar que identificó a la persona y comprobó su pertenencia vigente al gimnasio mediante conocimiento directo, recepción o evidencia operativa suficiente. Registrar método y actor; no exigir guardar fotos de documentos. Un identificador corto visible para el socio puede ayudar a encontrar la solicitud, pero no prueba identidad ni pertenencia por sí solo.

Aprobar sólo desde una sesión autenticada dentro de la app. El push abre el detalle; no autoriza la cuenta directamente desde la pantalla bloqueada. No permitir aprobarse a uno mismo, actuar para otra sede no autorizada o elevarse a rol staff mediante esta acción.

La decisión y creación/reactivación autorizada del vínculo deben ser transaccionales y únicas. Si piso y recepción actúan simultáneamente, la primera decisión válida se conserva; la otra pantalla muestra quién y cuándo lo resolvió y actualiza el estado. Nunca duplicar vínculos, consentimientos, cobros ni mensajes. Un rechazo no se transforma en aprobación por una respuesta tardía; una revisión posterior es otro acto explícito con historial.

Aprobar pertenencia no otorga automáticamente permiso para leer salud, Body Intelligence, fotos o chats privados. Si faltan pasos obligatorios de la cuenta, mostrar “Aprobado, falta completar el alta”; habilitar el servicio al cumplirse ambos planos. Compartir datos opcionales sigue siendo voluntario y separado. Rechazar esos permisos no bloquea el entrenamiento. Mantener el circuito de menores/tutores y sus restricciones; la aprobación de piso no lo sustituye ni valida la política legal pendiente.

La confirmación del socio se actualiza dentro de la app aunque no permita notificaciones. Registrar resolución, actor, sede, turno cuando corresponda, método de validación, motivo y tiempos. La ficha local del gimnasio no debe sobrescribir silenciosamente el perfil global de la persona que usan otros gimnasios o coaches.

## 7. Push, bandejas y continuidad

Implementar notificación real con registro/revocación de dispositivos, permiso del usuario, service worker y entrega por servidor. Reutilizar el service worker existente sin romper el registro de entrenamientos offline. Habilitar push mediante una acción explícita del staff y mostrar instrucciones de instalación sólo cuando el entorno las necesite.

En iPhone/iPad, comprobar soporte y requisitos de la PWA instalada en inicio según documentación vigente. No prometer recepción si no hay permiso, compatibilidad, conexión o dispositivo disponible. No declarar “entregado” o “leído” porque el proveedor aceptó un envío. Una prueba simulada debe estar rotulada como tal.

Usar eventos persistentes/cola con reintentos, deduplicación y limpieza de suscripciones inválidas. Un fallo de push o email no pierde la solicitud ni revierte una aprobación guardada. Al abrir una notificación vieja, consultar el estado y los permisos actuales.

Recepción y piso ven contador, lista ordenada por espera, sede, estados y responsable de resolución. Actualizar entre dispositivos con el mecanismo existente; incluir recuperación al reconectar y recarga periódica si falla el canal en tiempo real. Sin conexión se puede mostrar una vista previa, pero no aprobar localmente ni indicar éxito antes de confirmación del servidor.

El contenido en pantalla bloqueada debe ser mínimo: “Nueva solicitud de acceso en tu sede”. No incluir DNI, datos de salud, fotos o información innecesaria. Permitir pausar avisos sin perder la bandeja. Fuera del turno no notificar al entrenador, aunque siga usando Repi como coach privado o alumno.

## 8. Acceso posterior, bajas y varias relaciones

Al volver a la app, usar la sesión existente o el acceso por correo verificado. No pedir el QR del gimnasio cada día. Una identidad sin vínculo habilitado puede gestionar su cuenta, recuperación y solicitudes; no recibe acceso operativo a entrenamiento, Club u otros espacios privados por haberse autenticado.

Validar en servidor sesión, habilitación comercial de la organización, rol, sede autorizada, relación y capacidad en cada lectura, escritura, descarga y acción relevante. Una organización que todavía no fue habilitada comercialmente no admite altas operativas por QR, invitación de alumno ni endpoints alternativos; sus responsables conservan sólo los pasos limitados de activación/gestión pertinentes. Una suspensión comercial posterior se aplica según la política explícita del contrato, no por inferencia. El cambio de espacio no mezcla permisos ni datos. No basta ocultar una pantalla. Los scopes sensibles mantienen sus verificaciones adicionales.

Incluir gestión de accesos habilitados con búsqueda, pausa, baja y reactivación auditadas. Propuesta de permisos: recepción/manager/dueño autorizados gestionan bajas; el entrenador de piso puede reportar que un socio ya no pertenece y pedir revisión, sin adquirir por eso administración comercial general. Una suspensión no se levanta usando el flujo de alta común.

Sin padrón sincronizado, la verificación inicial no permite saber automáticamente cuándo alguien deja de ser socio. Hacer visible al gimnasio la responsabilidad de registrar bajas y ofrecer la revisión periódica propuesta. No presentar el sistema como verificación automática permanente. La baja de acceso en Repi tampoco cambia por sí sola el total comercial acordado.

Al revocar una relación, impedir operaciones posteriores de esa relación, incluso desde sesiones abiertas, enlaces viejos, canales de actualización o trabajos pendientes. Al reconectar, revalidar operaciones offline antes de aceptarlas. No prometer borrado remoto instantáneo en un dispositivo desconectado; revisar límites de caché/autorización offline y documentar su política antes de producción, sin borrar trabajo válido silenciosamente. No ampliar la ventana existente por este anexo.

Mantener cuenta e historial con su política de conservación; no borrar automáticamente información personal por la baja del gym. Definir acceso limitado a gestión/exportación de datos propios separadamente del uso operativo. Si la persona conserva otra relación activa, ésta sigue funcionando con sus permisos propios. Borrar o recuperar la identidad es un circuito distinto.

## 9. Tarifa y cantidad comercial por cliente

Separar tres valores en interfaz, modelo y reportes:

1. Total de socios/alumnos acordado para facturar.
2. Personas con Repi habilitado.
3. Personas que usan Repi y sus métricas de actividad.

Los valores 2 y 3 sirven para adopción y seguimiento, no sustituyen el 1. No derivar la factura de usuarios registrados, sesiones, programas, invitaciones o filas de `gym_member`/`coach_client`. Aprobar 20 accesos no suma 20 cargos a un contrato que ya incluye a todos.

Repi Admin debe poder cargar y modificar para cada cliente el total acordado y el precio por unidad, con moneda, versión, alcance, fecha de efecto, motivo y evidencia del acuerdo. El cliente puede ver sus condiciones y solicitar correcciones, pero no editarlas unilateralmente. Piso y recepción no modifican precios ni cantidades facturables. Evitar incluir credenciales, contratos o datos financieros en avisos de altas.

Para una tarifa simple, el subtotal base es cantidad acordada aplicable al período × precio unitario aplicable. Otros componentes sólo se suman si están pactados; no activar mínimos, descuentos, anualidades, tramos ni extras de BI porque aparezcan en una demo. Usar aritmética monetaria exacta.

Versionar cantidad y tarifa por separado, con vigencias y autor. No cambiar facturas previas al editar la ficha. Al cerrar un período guardar un snapshot de cantidad, origen, precio, contrato, reglas, fechas y líneas. Correcciones posteriores requieren ajuste explícito y trazabilidad; no reescribir el histórico. Dar una vista previa antes de confirmar un cambio.

El total de Gym es ingresado por Admin conforme al acuerdo. Para Coach, implementar el mismo mecanismo como la propuesta de este anexo, conservando visible su procedencia. Una integración futura debe aportar total, alcance, fecha y fuente; no sobrescribir automáticamente un valor negociado sin conciliación/autorización.

No se necesita el padrón nominal para guardar un total, pero el dato manual no permite auditar por sí solo si ese total coincide con la realidad. Si los accesos activos superan la cantidad declarada, alertar a Admin para revisar: no recalcular la factura ni bloquear a un socio legítimo automáticamente. Mostrar cantidad y antigüedad del dato comercial, sin confundirlas con un contador en vivo.

Alcance multisede: el acuerdo debe decir si cubre una organización completa o sedes específicas y cómo evita contar dos veces al mismo socio dentro de esa cobertura. Sin padrón nominal, la deduplicación del total declarado depende de la información acordada; no prometer resolverla con las cuentas de Repi. No aplicar deduplicación global entre clientes comerciales distintos sin una regla pactada.

Mantener independientes contrato/servicio comercial, membresía del socio y estado de pago. La mora de un cliente Repi no marca a todos sus socios como morosos del gym. Preparar estados, avisos y mecanismos de suspensión del servicio, pero activar plazos de gracia, bloqueos por deuda y reactivación sólo conforme a una política comercial explícita.

## 10. Pantallas y estados a incorporar

Extender el diseño existente y compartir componentes. No rehacer la identidad visual.

| Superficie | Resultado requerido |
|---|---|
| Repi Admin | Alta comercial, acuerdo y aceptación, tarifa/cantidad con vigencia, preview, invitación, historial y estado de activación |
| Responsable Gym/Coach | Bienvenida y activación, condiciones propias, configuración, equipo/alumnos e invitaciones |
| Gym/recepción | Generar QR por sede, bandeja de solicitudes, detalle, resolución e historial, gestión de accesos y bajas |
| Piso móvil/escritorio | Solicitudes de su sede durante turno, detalle y validación, estado sincronizado, configuración de push |
| Socio | QR → identidad/correo → solicitud → espera → aprobación/rechazo/vencimiento → completar alta → espacio habilitado |
| Alumno Coach | Invitación individual → identidad verificada → aceptación → vínculo y consentimientos aplicables |
| Cuenta existente | Recuperación, vincular otro espacio sin duplicar cuenta, solicitud cancelada, vínculo suspendido y reactivación |

Completar estados de carga, vacío, sin conexión, permiso insuficiente, correo incorrecto, invitación vencida/revocada, solicitud ya resuelta, sin personal disponible y notificaciones deshabilitadas. No usar éxito ficticio ni promesas de espera que el sistema no pueda cumplir.

## 11. Seguridad, operación y pruebas de aceptación

Reutilizar autenticación mantenida, 2FA, recuperación y rate limits. Secretos y claves push sólo servidor. Tokens individuales impredecibles, limitados en tiempo/uso, almacenados de forma segura y nunca en logs. El QR público de sede no hereda permisos de una invitación personal. Evitar enumerar correos o solicitudes ajenas. Limitar solicitudes/reintentos abusivos sin que una sola IP pueda inutilizar la recepción de todo el gimnasio.

Los datos del socio o documentos importados son datos; nunca instrucciones para modificar permisos. Mantener auditoría mínima sin copiar contenido sensible. Los operadores sólo ven solicitudes de su alcance; ningún rol de aprobación implica leer chats privados o información corporal.

Probar con usuarios distintos y datos persistentes, además de la UI:

1. No se crea una organización operativa ni trial automático mediante registro libre, endpoint antiguo, modificación del cliente o enlace mágico.
2. Invitación comercial: cuenta nueva y existente, correo distinto, vencimiento, revocación, reenvío y consumo concurrente; aceptación vinculada al acuerdo correcto.
3. QR fotografiado o reenviado sólo permite solicitar. No activa membresía, staff ni acceso a datos. El QR revocado no crea nuevas solicitudes.
4. Socio sin padrón: verifica email, solicita, aparece en piso y recepción y recibe resolución real. Una cuenta existente no se duplica.
5. Piso puede resolver sólo con rol, capacidad, sede y turno efectivos. Probar cambio/cierre de turno entre abrir el detalle y aprobar, medianoche y dos sedes.
6. Recepción resuelve con el celular de piso apagado, push denegado o sin ningún entrenador en turno. Sin operadores, queda pendiente; no se autoaprueba.
7. Dos operadores aprueban/rechazan simultáneamente: queda una sola decisión, vínculo y conjunto de efectos. Reintentos y notificaciones viejas no los repiten.
8. Cambiar turno conserva solicitudes pendientes y actualiza quién puede actuar. Ni un turno ajeno ni el rol de coach privado otorgan permisos del gym.
9. Cancelación, rechazo, vencimiento y baja previa tienen circuitos correctos; reenviar o cambiar QR no elude una suspensión.
10. Aprobación con pasos legales/edad pendientes no los salta; consentimientos de salud/BI siguen separados y opcionales.
11. Baja revoca operaciones de esa relación en servidor y al reconectar. Otro gimnasio/coach activo sigue funcionando; recuperación de cuenta no reactiva la baja.
12. Factura con 1.000 socios acordados y 120 usuarios habilitados: la base es 1.000. Habilitar otro socio no altera esa cantidad por sí solo.
13. Coach con 40 alumnos vigentes acordados y 12 cuentas activadas: la base es 40. Sin programa o sin entrenar también se incluye.
14. Dos clientes con precios diferentes reciben sus importes correctos. Cambio futuro de cantidad o tarifa no altera períodos ya cerrados.
15. Accesos superiores al total acordado generan revisión, no cobro extra ni bloqueo automático. Cantidad desconocida no se reemplaza por uso ni por cero.
16. Sin política de corte/prorrateo o contrato completo, se puede simular y previsualizar; no emitir automáticamente cobros reales sobre supuestos.
17. Nuevos push no rompen el entrenamiento offline ni filtran datos por la pantalla bloqueada; email/push fallidos no pierden solicitudes o decisiones.
18. Migraciones conservan cuentas y datos previos; listado de regularización separa DEMO y clientes reales. Nuevas tablas/rutas respetan aislamiento y permisos.
19. Invitación de alumno Coach reenviada: un correo verificado distinto no puede aceptarla. Cubrir revocación/reemisión, vencimiento, cuenta existente, token consumido y rechazo de invitaciones nuevas sin destinatario.
20. Socio habilitado en sede A escanea sede B: no obtiene acceso a B automáticamente; solicita ampliación y conserva A. Aprobador de A sin permiso en B no puede concederla. Un permiso explícito para toda la organización se prueba aparte.
21. Organización comercial no habilitada: sus QR/invitaciones/endpoints no conceden uso operativo; sólo permanecen disponibles los pasos autorizados para completar la activación.

No afirmar que envío real de emails/push o la entrega a un dispositivo funciona sólo por tests locales. Informar cuáles fueron probados con proveedor/dispositivo real, cuáles con adaptador de desarrollo y qué credencial o despliegue falta. No iniciar envíos a clientes reales ni cobros por este prompt de implementación sin autorización de operación correspondiente.

## 12. Decisiones todavía abiertas y forma de avanzar

La facturación de todos los socios/alumnos y la flexibilidad de precio ya están decididas. No volver a preguntar si cobrar por uso. Lo siguiente sigue pendiente y debe quedar explícito por contrato o política; no bloquear por ello la implementación independiente:

| Decisión pendiente | Tratamiento mientras se define |
|---|---|
| Qué socios/alumnos entran como vigentes: pausas, congelados, becas, pruebas, bajas y cortesía | Guardar definición y total acordados; no inferirlos de uso, actividad ni cuota cobrada por el gym |
| Día/ciclo de facturación, foto de cantidad o agregación temporal, fecha de cambios y prorrateo | Motor configurable y preview; no elegir silenciosamente máximo, promedio o prorrateo para cobrar |
| Condiciones de mora, gracia y suspensión del cliente comercial | Estados y avisos preparados; política explícita antes de cortes automáticos |
| Cobertura de cadenas/sedes y regla de conteo sin duplicados | Campo de alcance contractual; bloquear cierre comercial ambiguo, no la bandeja de altas |
| Fuente del total Coach | Propuesta Admin como Gym; documentarla y confirmar al configurar el acuerdo |
| Proveedor y dominio de email, credenciales push, entorno HTTPS y pruebas móviles | Adaptadores de desarrollo rotulados; integración verificable antes de afirmar que llega a clientes |
| Acceso offline tras revocación y conservación de datos propios | Revisar la política existente, documentar límites y no prometer revocación instantánea sin conexión |
| Textos legales y política de menores ya pendientes | Mantener restricciones; no dar por validado lo que no lo está ni agregar permisos sensibles |

Actualizar inventario, decisiones y plan con trazabilidad a este anexo. Marcar las reglas viejas sustituidas: cobro Gym por uso, Coach sujeto a programa/activación, autoalta comercial con trial, padrón obligatorio y aprobación exclusiva por recepción. Mantener historial de decisiones.

Primero presentá un delta breve de lo que ya hay, lo que hay que adaptar y las decisiones aún abiertas. Después implementá cortes verificables: cierre del alta comercial y contrato; acceso humano del socio; bandeja compartida/turnos; push y resiliencia; cantidades/precios versionados y previews; migraciones y pruebas. Reordená si las dependencias reales lo requieren. Actualizá el estado con evidencia y limitaciones, sin declarar terminado lo simulado o bloqueado por configuración.

## Referencias técnicas verificadas al redactar

- [OWASP: autorización](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): identidad separada de permisos, mínimo privilegio y comprobaciones en servidor.
- [WebKit: Web Push en iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/): soporte de push para web apps agregadas a inicio y permiso solicitado por acción del usuario. Comprobar compatibilidad actual al integrar.
- [MDN: Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API): permisos y comportamiento de notificaciones según entorno.

Estas referencias respaldan criterios técnicos; no definen las condiciones comerciales de Repi.
