# REPI — Operación y soporte del primer cliente

Propuesta de trabajo para una primera puesta en marcha acompañada. No concede una prueba gratuita, no crea un SLA y no sustituye el acuerdo comercial. Usar los controles vigentes del [plan de lanzamiento](../continuidad/PLAN_LANZAMIENTO_Y_ROADMAP.md).

## Ficha operativa para completar

| Dato | Completar |
| --- | --- |
| Cliente y espacio | [nombre e identificador, sin secretos] |
| Sedes incluidas | [sedes] |
| Responsable del cliente | [persona y canal acordado] |
| Responsable REPI | [persona y canal acordado] |
| Recepción / respaldo de altas | [personas por sede] |
| Responsable de bajas | [persona y frecuencia acordada] |
| Cobertura del soporte | [días y horarios realmente disponibles] |
| Inicio y revisión | [fechas acordadas] |
| Versión comprobada | [commit/despliegue y fecha] |

No publicar esta ficha con datos personales. Guardarla sólo en el espacio de operación autorizado para ese cliente.

## Antes de incorporar personas reales

- [ ] Entorno y plan de servicio adecuados para la operación comercial.
- [ ] Cuenta personal de Admin y responsable del cliente con acceso verificado; cuentas demo históricas sin privilegios operativos.
- [ ] Correo de invitación, verificación y recuperación comprobado con destinatarios autorizados.
- [ ] Cantidad, precio, alcance y aceptación registrados.
- [ ] Política y responsable de datos, soporte y procedimiento de incidentes definidos.
- [ ] Copia de seguridad y restauración comprobadas; anotar evidencia y alcance de archivos además de base.
- [ ] Un recorrido gym y/o coach completo según el cliente.
- [ ] Teléfonos reales del cliente: agregar a inicio, abrir, cerrar, volver, entrenar y sincronizar.
- [ ] Push probado si se ofrece; recepción sabe operar sin push.
- [ ] Roles y sedes probados con al menos dos personas: quien no tiene permiso no ve ni modifica el dato protegido.
- [ ] Guías entregadas y responsables de altas/bajas capacitados.

Un casillero sin evidencia permanece abierto. No reemplazarlo por «el build pasó» o por una captura responsive.

## Primera sesión acompañada

1. Dar de alta una persona autorizada, sin compartir contraseñas ni hacer que recepción entre como el socio.
2. Verificar solicitud/invitación, permisos y programa.
3. Registrar un entrenamiento real breve según lo indicado por su entrenador, o usar la demo para capacitación sin datos reales.
4. Verificar que aparece en el contexto correcto del entrenador.
5. Probar un mensaje y el mecanismo de atención del gym cuando corresponda.
6. Confirmar qué queda pendiente y quién lo atiende antes de ampliar la incorporación.

## Revisión durante el arranque

**Cada jornada de operación acordada:** revisar solicitudes sin resolver, cobertura de turno, fallos de envío y sincronización reportados, y pendientes de soporte.

**En la revisión con el cliente:** revisar accesos habilitados frente al total acordado, altas y bajas, programas asignados, problemas de uso y solicitudes atendidas. La cantidad de accesos no se convierte en factura. Acordar la próxima revisión sin prometer resultados de negocio no medidos.

## Cómo recibir un problema

Pedir sólo: pantalla, acción, hora aproximada, dispositivo/navegador, espacio/sede y mensaje de error. Una captura puede ayudar si oculta datos personales ajenos. No pedir contraseña, código de dos pasos, token de invitación ni información clínica innecesaria.

Registro sugerido:

```text
Fecha y hora:
Cliente / sede / rol:
Pantalla y acción:
Resultado esperado:
Qué ocurrió:
Dispositivo y conexión:
¿Hay datos pendientes en el teléfono?:
Impacto / personas afectadas:
Responsable:
Próxima acción y momento acordado de actualización:
Resultado y evidencia de la verificación:
```

## Resolver sin empeorar el problema

| Caso | Primera revisión y acción |
| --- | --- |
| No llega una invitación | Confirmar destinatario, spam, vigencia y resultado del envío. Reenviar desde el circuito correspondiente; la bienvenida anterior queda revocada. No crear una contraseña compartida. |
| No aparece una solicitud | Confirmar gym/sede, email verificado y que se envió el pedido. Revisar bandeja con un rol autorizado. No aprobar a una persona distinta sólo por coincidencia de nombre. |
| Piso no puede aprobar | Confirmar sede y turno iniciado. Recepción/gerencia autorizada puede resolver la misma solicitud. No subir a todos a rol dueño. |
| No llegó el push | Revisar permiso y suscripción del dispositivo; operar desde bandeja. «Enviado» no demuestra recepción. |
| Entrenamiento pendiente | Mantener la cuenta/dispositivo y reconectar. Revisar acceso y estado de cola. No borrar caché ni datos locales como primer paso. |
| Acceso pausado o de baja | Confirmar la relación con el responsable antes de reactivar. La recuperación de contraseña no cambia ese estado. |
| Cobro no coincide | Identificar si es cargo coach→alumno o suscripción REPI. Revisar moneda, cantidad, versión y fecha antes de corregir. No simular pagos. |
| Datos de otra persona o sede | Detener la acción afectada, conservar evidencia mínima y escalar al responsable de seguridad. No reenviar capturas sensibles a grupos. |
| Pedido de eliminación | Ir al circuito de privacidad y registrar el tratamiento. No borrar usuarios con consultas improvisadas ni marcar resuelto antes de comprobar. |
| Caída general | Confirmar alcance y estado del servicio, avisar por el canal acordado y priorizar la recuperación. No prometer una hora sin evidencia. |

## Prioridad operativa propuesta

**Crítica:** exposición de datos, acceso indebido, pérdida confirmada de registros o interrupción general. Responsable REPI atiende primero y evalúa contener la función afectada.

**Alta:** un cliente no puede dar altas, asignar programas o completar/sincronizar entrenamientos; resolver el bloqueo y verificar el recorrido.

**Normal:** ajustes de uso, correcciones visuales sin bloqueo y mejoras. Registrar sin prometer una fecha automática.

Son categorías para ordenar trabajo, no plazos de respuesta contratados.

## Cuándo ampliar el uso

Ampliar cuando los recorridos acordados funcionen en los dispositivos del cliente, el equipo pueda operar sin asistencia constante y no haya incidentes críticos abiertos. Registrar las limitaciones que sigan existiendo y aceptarlas explícitamente en el alcance del cliente. Una mejora futura no debe tapar un bloqueo actual.
